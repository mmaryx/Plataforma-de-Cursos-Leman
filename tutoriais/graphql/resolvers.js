import { fetchRest } from './loaders.js';

export const resolvers = {
    Query: {
        cursos: async (_, args, { requestId }) => {
            const params = new URLSearchParams({ limite: '50' });
            if (args.categoria) params.set('categoria', args.categoria);
            if (args.status) params.set('status', args.status);
            if (args.instrutor) params.set('instrutor', args.instrutor);

            const resposta = await fetchRest(`/cursos?${params.toString()}`, { requestId });
            return resposta.dados || [];
        },

        curso: async (_, { id }, { loaders }) => {
            return loaders.cursoLoader.load(Number(id));
        },

        matriculas: async (_, args, { requestId }) => {
            const params = new URLSearchParams();
            if (args.cursoId !== undefined) params.set('cursoId', String(args.cursoId));
            if (args.status) params.set('status', args.status);
            if (args.email) params.set('email', args.email);

            const query = params.toString();
            const caminho = query ? `/matriculas?${query}` : '/matriculas';
            return fetchRest(caminho, { requestId });
        },

        painelCatalogo: async (_, { categoria }, { requestId }) => {
            const params = new URLSearchParams({
                status: 'publicado',
                limite: '50'
            });
            if (categoria) params.set('categoria', categoria);

            const [respostaCursos, matriculasAtivas] = await Promise.all([
                fetchRest(`/cursos?${params.toString()}`, { requestId }),
                fetchRest('/matriculas?status=ativa', { requestId })
            ]);

            const cursosPublicados = respostaCursos.dados || [];

            return {
                totalCursosPublicados: cursosPublicados.length,
                totalMatriculasAtivas: matriculasAtivas.length,
                cursosPublicados
            };
        }
    },

    Curso: {
        matriculas: (curso, _, { loaders }) => {
            return loaders.matriculasPorCursoLoader.load(Number(curso.id));
        },

        totalMatriculasAtivas: async (curso, _, { loaders }) => {
            const lista = await loaders.matriculasPorCursoLoader.load(Number(curso.id));
            return lista.filter((m) => m.status === 'ativa').length;
        }
    },

    Matricula: {
        curso: (matricula, _, { loaders }) => {
            return loaders.cursoLoader.load(Number(matricula.cursoId));
        }
    },

    Mutation: {
        criarCurso: async (_, { dados }, { requestId }) => {
            return fetchRest('/cursos', {
                method: 'POST',
                body: dados,
                requestId
            });
        },

        realizarMatricula: async (_, { dados }, { requestId }) => {
            return fetchRest('/matriculas', {
                method: 'POST',
                body: dados,
                requestId
            });
        }
    }
};