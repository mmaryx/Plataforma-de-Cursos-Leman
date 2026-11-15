import DataLoader from 'dataloader';
import { GraphQLError } from 'graphql';

export const REST_API_URL = process.env.REST_API_URL || 'http://127.0.0.1:3001';

const CODIGOS_HTTP_GRAPHQL = {
    400: 'BAD_REQUEST',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'BAD_USER_INPUT'
};

/**
 * Cliente HTTP padronizado que repassa o X-Request-Id para a API REST
 * e converte erros RFC 9457 (Problem Details) em GraphQLError com extensions.code.
 */
export async function fetchRest(caminho, { method = 'GET', body, requestId } = {}) {
    const headers = {
        Accept: 'application/json',
        'X-Request-Id': requestId
    };

    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }

    let resposta;
    try {
        resposta = await fetch(`${REST_API_URL}${caminho}`, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(3000)
        });
    } catch (erro) {
        throw new GraphQLError(
            `Falha de comunicação com a API REST (${erro.message}).`,
            {
                extensions: {
                    code: 'SERVICE_UNAVAILABLE',
                    requestId
                }
            }
        );
    }

    if (resposta.status === 204) return null;

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
        const mensagem = dados.detail || dados.mensagem || `Erro HTTP ${resposta.status}`;
        const code = CODIGOS_HTTP_GRAPHQL[resposta.status] || 'INTERNAL_SERVER_ERROR';

        throw new GraphQLError(mensagem, {
            extensions: {
                code,
                httpStatus: resposta.status,
                requestId
            }
        });
    }

    return dados;
}

/**
 * Cria instâncias novas de DataLoader a cada requisição GraphQL
 * para evitar vazamento de cache entre usuários e eliminar consultas N+1.
 */
export function criarLoaders(requestId) {
    const cursoLoader = new DataLoader(async (cursoIds) => {
        console.log(
            `[GRAPHQL][DATALOADER] Agrupando busca de ${cursoIds.length} curso(s) -> [${cursoIds.join(', ')}] | X-Request-Id=${requestId}`
        );

        const resposta = await fetchRest('/cursos?limite=50', { requestId });
        const listaCursos = resposta.dados || [];
        const mapa = new Map(listaCursos.map((c) => [Number(c.id), c]));

        return Promise.all(
            cursoIds.map(async (id) => {
                const idNum = Number(id);
                if (mapa.has(idNum)) return mapa.get(idNum);
                try {
                    return await fetchRest(`/cursos/${idNum}`, { requestId });
                } catch {
                    return null;
                }
            })
        );
    });

    const matriculasPorCursoLoader = new DataLoader(async (cursoIds) => {
        console.log(
            `[GRAPHQL][DATALOADER] Agrupando matrículas de ${cursoIds.length} curso(s) em 1 chamada REST | X-Request-Id=${requestId}`
        );

        const todasMatriculas = await fetchRest('/matriculas', { requestId });

        return cursoIds.map((id) =>
            todasMatriculas.filter((m) => Number(m.cursoId) === Number(id))
        );
    });

    return {
        cursoLoader,
        matriculasPorCursoLoader
    };
}