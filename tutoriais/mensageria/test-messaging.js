import { randomUUID } from 'node:crypto';
import { publishEvent, publishRawMessage } from './publisher.js';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function executarDemoMensageria() {
    console.log('\n=== TESTE DA CAMADA DE MENSAGERIA - PLATAFORMA LEMAN ===\n');

    // 1. Evento de curso publicado (só Auditoria deve receber; Notificações ignora)
    const reqCurso = randomUUID();
    await publishEvent(
        'curso.publicado',
        { id: 10, titulo: 'Arquitetura Cloud na AWS', instrutor: 'Antônio Campello' },
        { requestId: reqCurso }
    );

    await esperar(400);

    // 2. Evento de matrícula confirmada (Notificações e Auditoria recebem)
    const reqMatricula = randomUUID();
    const eventoMatricula = await publishEvent(
        'matricula.confirmada',
        {
            id: 501,
            cursoId: 10,
            aluno: 'Marianna Ghiraldelli',
            email: 'marianna@leman.edu.br',
            pagamentoId: 'MOCK-998877'
        },
        { requestId: reqMatricula }
    );

    await esperar(600);

    // 3. Teste de IDEMPOTÊNCIA: reenviando exatamente o mesmo eventId
    console.log('\n--- Testando Idempotência (mesmo eventId enviado 2x) ---');
    await publishEvent(
        'matricula.confirmada',
        eventoMatricula.dados,
        { requestId: reqMatricula, eventId: eventoMatricula.eventId }
    );

    await esperar(600);

    // 4. Teste de RETRY + DLQ: falha persistente no envio de e-mail (3 tentativas -> leman.dlq)
    console.log('\n--- Testando Falha Persistente (3 tentativas -> leman.dlq) ---');
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

    await esperar(1200);

    // 5. Teste de MENSAGEM MALFORMADA -> vai direto para leman.dlq
    console.log('\n--- Testando Payload Malformado (-> leman.dlq) ---');
    await publishRawMessage('matricula.cancelada', '{ json-quebrado-sem-fechar', randomUUID());

    console.log('\n=== EVENTOS DISPARADOS! Confira os logs dos consumidores e o painel http://localhost:15672 ===\n');
}

executarDemoMensageria().catch((erro) => {
    console.error('Erro no teste de mensageria:', erro);
    process.exitCode = 1;
});