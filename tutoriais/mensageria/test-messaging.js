
import { randomUUID } from 'node:crypto';
import { publishEvent, publishRawMessage } from './publisher.js';

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function executarDemoMensageria() {
    console.log('\n=== TESTE DA MENSAGERIA - PLATAFORMA LEMAN ===\n');

    const requestCurso = randomUUID();

    await publishEvent(
        'curso.publicado',
        { id: 10, titulo: 'Arquitetura Cloud na AWS', instrutor: 'Antônio Campello' },
        { requestId: requestCurso }
    );

    const requestMatricula = randomUUID();

    const evento = await publishEvent(
        'matricula.confirmada',
        {
            id: 501,
            cursoId: 10,
            aluno: 'Aluno Teste Mensageria',
            email: `mensageria.${Date.now()}@leman.edu.br`,
            pagamentoId: 'MOCK-998877'
        },
        { requestId: requestMatricula }
    );

    await esperar(1000);

    console.log('\n--- Idempotência: reenviando o mesmo eventId ---');

    await publishEvent(
        'matricula.confirmada',
        evento.dados,
        { requestId: requestMatricula, eventId: evento.eventId }
    );

    await esperar(1000);

    console.log('\n--- Retry limitado: falha simulada até DLQ ---');

    await publishEvent(
        'matricula.confirmada',
        {
            id: 502,
            cursoId: 10,
            aluno: 'Aluno Teste Falha',
            email: 'falha@leman.edu.br',
            simularFalha: true
        },
        { requestId: randomUUID() }
    );

    await esperar(1800);

    console.log('\n--- Payload inválido: encaminhamento para DLQ ---');

    await publishRawMessage(
        'matricula.cancelada',
        '{ json-quebrado-sem-fechar',
        randomUUID()
    );

    console.log('\nEventos publicados. Confira os logs dos consumidores e a fila leman.dlq.');
}

executarDemoMensageria().catch((erro) => {
    console.error('\n✗ FALHA NO TESTE DE MENSAGERIA:', erro);
    process.exitCode = 1;
});
