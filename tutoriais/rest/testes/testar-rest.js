
import { randomUUID } from 'node:crypto';

const BASE_URL = process.env.REST_API_URL || 'http://127.0.0.1:3001';

function assertStatus(etapa, resposta, esperado) {
    if (resposta.status !== esperado) {
        throw new Error(`${etapa}: esperado ${esperado}, recebido ${resposta.status}.`);
    }
    console.log(`✓ ${etapa}: HTTP ${resposta.status}`);
}

async function requisitar(caminho, { method = 'GET', body, requestId = randomUUID() } = {}) {
    const headers = { 'X-Request-Id': requestId };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const resposta = await fetch(`${BASE_URL}${caminho}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });

    const texto = await resposta.text();
    let dados = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch { dados = texto; }
    return { resposta, dados, requestId };
}

async function executarTestes() {
    console.log('\n=== TESTES DA API REST - PLATAFORMA LEMAN ===\n');

    const titulo = `Curso teste REST ${Date.now()}`;
    let cursoId;

    const saude = await requisitar('/saude');
    assertStatus('Health check', saude.resposta, 200);

    const cadastro = await requisitar('/cursos', {
        method: 'POST',
        body: {
            titulo,
            descricao: 'Curso criado pelo teste automatizado.',
            instrutor: 'Teste Automatizado',
            categoria: 'Programação',
            cargaHoraria: 25,
            status: 'publicado'
        }
    });
    assertStatus('Criar curso', cadastro.resposta, 201);
    if (!cadastro.dados?.id) throw new Error('POST /cursos não retornou o ID.');
    if (!cadastro.resposta.headers.get('location')) throw new Error('POST /cursos não retornou Location.');
    cursoId = cadastro.dados.id;

    const consulta = await requisitar(`/cursos/${cursoId}`);
    assertStatus('Consultar curso', consulta.resposta, 200);
    if (consulta.dados?.titulo !== titulo) throw new Error('Curso consultado incorreto.');

    const lista = await requisitar('/cursos?status=publicado&limite=5&pagina=1');
    assertStatus('Listar cursos com filtro/paginação', lista.resposta, 200);
    if (!Array.isArray(lista.dados?.dados) || !lista.dados?.paginacao) {
        throw new Error('Resposta da listagem não contém dados e paginação.');
    }

    const put = await requisitar(`/cursos/${cursoId}`, {
        method: 'PUT',
        body: {
            titulo,
            descricao: 'Descrição atualizada integralmente.',
            instrutor: 'Teste Automatizado',
            categoria: 'Programação',
            cargaHoraria: 30,
            status: 'publicado'
        }
    });
    assertStatus('Atualizar curso com PUT', put.resposta, 200);

    const patch = await requisitar(`/cursos/${cursoId}`, {
        method: 'PATCH',
        body: { cargaHoraria: 35 }
    });
    assertStatus('Atualizar curso com PATCH', patch.resposta, 200);

    const duplicado = await requisitar('/cursos', {
        method: 'POST',
        body: { titulo, cargaHoraria: 20, status: 'rascunho' }
    });
    assertStatus('Rejeitar título duplicado', duplicado.resposta, 409);
    if (!duplicado.resposta.headers.get('content-type')?.includes('application/problem+json')) {
        throw new Error('Erro 409 não foi retornado em Problem Details.');
    }

    const invalido = await requisitar('/cursos', {
        method: 'POST',
        body: { titulo: '', cargaHoraria: 0 }
    });
    assertStatus('Rejeitar dados inválidos', invalido.resposta, 422);

    const exclusao = await requisitar(`/cursos/${cursoId}`, { method: 'DELETE' });
    assertStatus('Excluir curso', exclusao.resposta, 204);

    const removido = await requisitar(`/cursos/${cursoId}`);
    assertStatus('Consultar curso removido', removido.resposta, 404);

    console.log('\n=== TODOS OS TESTES REST PASSARAM ===\n');
}

executarTestes().catch((erro) => {
    console.error('\n✗ FALHA NOS TESTES REST:', erro);
    process.exitCode = 1;
});
