const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:3000';

const CHAVE_PORTAL = 'chave-portal-leman-123';
const CHAVE_APP = 'chave-app-aluno-456';
const CHAVE_PARCEIRO = 'chave-parceiro-catalogo-789';

function afirmar(condicao, mensagem) {
    if (!condicao) throw new Error(mensagem);
}

async function executarTestesGateway() {
    console.log('\n=== TESTE DO API GATEWAY - PLATAFORMA LEMAN ===\n');

    // 1. Health check público (/saude sem X-API-Key)
    const saude = await fetch(`${GATEWAY_URL}/saude`);
    afirmar(saude.status === 200, `Esperado 200 em /saude, veio ${saude.status}`);
    console.log(`✓ 1. GET /saude sem chave -> ${saude.status} (X-Request-Id: ${saude.headers.get('x-request-id')})`);

    // 2. Autenticação ausente ou inválida -> 401 Problem Details
    const semChave = await fetch(`${GATEWAY_URL}/api/cursos`);
    afirmar(semChave.status === 401, `Esperado 401 sem chave, veio ${semChave.status}`);
    afirmar(
        semChave.headers.get('content-type')?.includes('application/problem+json'),
        '401 deve retornar application/problem+json'
    );
    console.log(`✓ 2. GET /api/cursos sem X-API-Key -> ${semChave.status} (Problem Details)`);

    // 3. Autorização por rota -> 403 para parceiro tentando acessar /api/matriculas
    const proibido = await fetch(`${GATEWAY_URL}/api/matriculas`, {
        headers: { 'X-API-Key': CHAVE_PARCEIRO }
    });
    afirmar(proibido.status === 403, `Esperado 403 para parceiro, veio ${proibido.status}`);
    console.log(`✓ 3. GET /api/matriculas com chave de parceiro -> ${proibido.status} Forbidden`);

    // 4. Roteamento + Reescrita de Location (POST /api/cursos -> 201 com Location: /api/cursos/:id)
    const tituloUnico = `Curso Gateway ${Date.now()}`;
    const criado = await fetch(`${GATEWAY_URL}/api/cursos`, {
        method: 'POST',
        headers: {
            'X-API-Key': CHAVE_PORTAL,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            titulo: tituloUnico,
            descricao: 'Curso criado através do API Gateway.',
            instrutor: 'Eduardo Galvão',
            categoria: 'Cloud',
            cargaHoraria: 15,
            status: 'publicado'
        })
    });
    afirmar(criado.status === 201, `Esperado 201 ao criar curso, veio ${criado.status}`);
    const location = criado.headers.get('location');
    afirmar(
        location?.startsWith('/api/cursos/'),
        `Location deveria começar com /api/cursos/, veio ${location}`
    );
    const cursoCriado = await criado.json();
    console.log(`✓ 4. POST /api/cursos -> ${criado.status} | Location reescrito: ${location}`);

    // Limpa o curso de teste criado
    await fetch(`${GATEWAY_URL}/api/cursos/${cursoCriado.id}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': CHAVE_PORTAL }
    });

    // 5. GraphQL através do Gateway (/api/graphql)
    const gqlResp = await fetch(`${GATEWAY_URL}/api/graphql`, {
        method: 'POST',
        headers: {
            'X-API-Key': CHAVE_PORTAL,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            query: '{ painelCatalogo { totalCursosPublicados totalMatriculasAtivas } }'
        })
    });
    afirmar(gqlResp.status === 200, `Esperado 200 no GraphQL via gateway, veio ${gqlResp.status}`);
    const gqlJson = await gqlResp.json();
    console.log(
        `✓ 5. POST /api/graphql -> ${gqlResp.status} | Painel:`,
        JSON.stringify(gqlJson.data.painelCatalogo)
    );

    // 6. Rota Agregada (GET /api/painel/cursos/1)
    const painel = await fetch(`${GATEWAY_URL}/api/painel/cursos/1`, {
        headers: { 'X-API-Key': CHAVE_PORTAL }
    });
    afirmar(painel.status === 200, `Esperado 200 na rota agregada, veio ${painel.status}`);
    const painelJson = await painel.json();
    console.log(
        `✓ 6. GET /api/painel/cursos/1 -> ${painel.status} | parcial=${painelJson.parcial} | totalMatriculas=${painelJson.totalMatriculas}`
    );

    // 7. Rate Limiting (app-mobile-leman tem limite de 10 req/min -> 11ª retorna 429)
    let status429 = null;
    let retryAfter = null;
    for (let i = 1; i <= 12; i++) {
        const r = await fetch(`${GATEWAY_URL}/api/cursos`, {
            headers: { 'X-API-Key': CHAVE_APP }
        });
        if (r.status === 429) {
            status429 = r.status;
            retryAfter = r.headers.get('retry-after');
            break;
        }
    }
    afirmar(status429 === 429, 'Esperado 429 após exceder limite de 10 req/min do app-mobile');
    console.log(`✓ 7. Limite de uso excedido -> ${status429} Too Many Requests (Retry-After: ${retryAfter}s)`);

    console.log('\n=== TODOS OS TESTES DO GATEWAY PASSARAM ===\n');
}

executarTestesGateway().catch((erro) => {
    console.error('\n✗ FALHA NO TESTE DO GATEWAY:', erro.message);
    process.exitCode = 1;
});