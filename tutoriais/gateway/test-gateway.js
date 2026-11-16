
import { randomUUID } from 'node:crypto';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:3000';

const CHAVE_PORTAL = process.env.CHAVE_PORTAL || 'chave-portal-leman-123';
const CHAVE_APP = process.env.CHAVE_APP || 'chave-app-aluno-456';
const CHAVE_PARCEIRO = process.env.CHAVE_PARCEIRO || 'chave-parceiro-catalogo-789';

function afirmar(condicao, mensagem) {
    if (!condicao) throw new Error(mensagem);
}

async function requisitar(path, options = {}) {
    const headers = { ...(options.headers || {}) };

    if (!headers['X-Request-Id']) {
        headers['X-Request-Id'] = randomUUID();
    }

    return fetch(`${GATEWAY_URL}${path}`, { ...options, headers });
}

async function executarTestesGateway() {
    console.log('\n=== TESTES DO API GATEWAY - PLATAFORMA LEMAN ===\n');

    const saude = await requisitar('/saude');

    afirmar(saude.status === 200, `Health check: esperado 200, recebido ${saude.status}`);
    afirmar(saude.headers.get('x-request-id'), 'Gateway não devolveu X-Request-Id.');

    console.log('✓ 1. Health check público -> 200');

    const semChave = await requisitar('/api/cursos');

    afirmar(semChave.status === 401, `Esperado 401, recebido ${semChave.status}`);
    afirmar(
        semChave.headers.get('content-type')?.includes('application/problem+json'),
        '401 sem Problem Details.'
    );

    console.log('✓ 2. Sem API Key -> 401');

    const parceiroProibido = await requisitar('/api/matriculas', {
        headers: { 'X-API-Key': CHAVE_PARCEIRO }
    });

    afirmar(parceiroProibido.status === 403, `Esperado 403, recebido ${parceiroProibido.status}`);

    console.log('✓ 3. Parceiro sem permissão -> 403');

    const parceiroPermitido = await requisitar('/api/cursos', {
        headers: { 'X-API-Key': CHAVE_PARCEIRO }
    });

    afirmar(parceiroPermitido.status === 200, `Esperado 200, recebido ${parceiroPermitido.status}`);

    console.log('✓ 4. Parceiro autorizado -> 200');

    const titulo = `Curso Gateway Teste ${Date.now()}`;

    const criado = await requisitar('/api/cursos', {
        method: 'POST',
        headers: {
            'X-API-Key': CHAVE_PORTAL,
            'Content-Type': 'application/json',
            'X-Request-Id': 'teste-gateway-location-001'
        },
        body: JSON.stringify({
            titulo,
            descricao: 'Curso criado pelo teste do Gateway.',
            instrutor: 'Teste Gateway',
            categoria: 'Tecnologia',
            cargaHoraria: 15,
            status: 'publicado'
        })
    });

    afirmar(criado.status === 201, `Esperado 201, recebido ${criado.status}`);

    const location = criado.headers.get('location');

    afirmar(location?.startsWith('/api/cursos/'), `Location não foi reescrito: ${location}`);

    const curso = await criado.json();

    afirmar(criado.headers.get('x-request-id'), 'Gateway não gerou/devolveu X-Request-Id.');

    console.log(`✓ 5. POST /api/cursos -> 201; Location: ${location}`);

    const gql = await requisitar('/api/graphql', {
        method: 'POST',
        headers: {
            'X-API-Key': CHAVE_PORTAL,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            query: '{ painelCatalogo { totalCursosPublicados totalMatriculasAtivas } }'
        })
    });

    afirmar(gql.status === 200, `GraphQL: esperado 200, recebido ${gql.status}`);

    const gqlJson = await gql.json();

    afirmar(!gqlJson.errors, `GraphQL retornou erros: ${JSON.stringify(gqlJson.errors)}`);

    console.log('✓ 6. GraphQL via Gateway -> 200');

    const painel = await requisitar(`/api/painel/cursos/${curso.id}`, {
        headers: { 'X-API-Key': CHAVE_PORTAL }
    });

    afirmar(painel.status === 200, `Agregação: esperado 200, recebido ${painel.status}`);

    const painelJson = await painel.json();

    afirmar(painelJson.parcial === false, 'A resposta deveria ser completa.');
    afirmar(painelJson.curso?.id === curso.id, 'Curso não retornado na agregação.');
    afirmar(Array.isArray(painelJson.matriculas), 'Lista de matrículas não retornada.');

    console.log('✓ 7. Rota agregada completa -> 200');

    let resposta429;

    for (let i = 0; i < 12; i++) {
        resposta429 = await requisitar('/api/cursos', {
            headers: { 'X-API-Key': CHAVE_APP }
        });

        if (resposta429.status === 429) break;
    }

    afirmar(resposta429?.status === 429, 'Não atingiu o limite de 10 requisições/minuto.');
    afirmar(resposta429.headers.get('retry-after'), '429 não contém Retry-After.');

    console.log(`✓ 8. Rate limit -> 429; Retry-After=${resposta429.headers.get('retry-after')}s`);

    console.log('\n=== TESTES PRINCIPAIS DO GATEWAY PASSARAM ===');
    console.log('502, 503, 504 e agregação parcial devem ser demonstrados separadamente.');
}

executarTestesGateway().catch((erro) => {
    console.error('\n✗ FALHA NOS TESTES DO GATEWAY:', erro);
    process.exitCode = 1;
});
