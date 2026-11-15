
import axios from 'axios';

const api = axios.create({
    baseURL: 'http://127.0.0.1:3001',
    validateStatus: () => true
});

function verificarStatus(etapa, resposta, esperado) {
    if (resposta.status !== esperado) {
        throw new Error(
            `${etapa}: esperado ${esperado}, recebido ${resposta.status}.`
        );
    }

    console.log(`✓ ${etapa}: ${resposta.status}`);
}

async function executarTestes() {
    console.log('\n=== TESTES DA API REST - LEMAN ===\n');

    const titulo = `Curso de Python ${Date.now()}`;

    // 1. Criar curso
    const cadastro = await api.post('/cursos', {
        titulo,
        descricao: 'Introdução à programação com Python.',
        instrutor: 'João Silva',
        categoria: 'Programação',
        cargaHoraria: 25,
        status: 'publicado'
    });

    verificarStatus('Cadastro de curso', cadastro, 201);

    const cursoId = cadastro.data.id;

    // 2. Consultar curso
    const consulta = await api.get(`/cursos/${cursoId}`);

    verificarStatus('Consulta de curso', consulta, 200);

    // 3. Atualizar curso
    const atualizacao = await api.patch(`/cursos/${cursoId}`, {
        cargaHoraria: 30
    });

    verificarStatus('Atualização de curso', atualizacao, 200);

    // 4. Provocar erro de negócio: título duplicado
    const erro = await api.post('/cursos', {
        titulo,
        cargaHoraria: 20
    });

    verificarStatus('Validação de título duplicado', erro, 409);

    // 5. Excluir curso
    const exclusao = await api.delete(`/cursos/${cursoId}`);

    verificarStatus('Exclusão de curso', exclusao, 204);

    console.log('\n=== TODOS OS TESTES PASSARAM ===\n');
}

executarTestes().catch(erro => {
    console.error('\n✗ FALHA NOS TESTES:', erro.message);
    process.exitCode = 1;
});
