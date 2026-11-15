import {
    conectarRabbitMQ,
    configurarTopologia,
    FILA_NOTIFICACOES,
    FILA_DLQ
} from './topology.js';

const MAX_TENTATIVAS = 3;
const eventosProcessados = new Set(); // Em produção: tabela de idempotência no MySQL

async function enviarEmailNotificacao(evento) {
    const { tipo, dados } = evento;

    // Gatilho determinístico para demonstrar falha e roteamento para DLQ (Cena 4)
    if (dados?.simularFalha === true || dados?.email?.includes('falha')) {
        throw new Error('Serviço de e-mail externo indisponível (timeout SMTP)');
    }

    // Simula latência de envio de e-mail
    await new Promise((resolve) => setTimeout(resolve, 300));

    if (tipo === 'matricula.confirmada') {
        console.log(
            `   ✉ E-mail de BOAS-VINDAS enviado para ${dados.email} (Aluno: ${dados.aluno} | Curso ID: ${dados.cursoId})`
        );
    } else if (tipo === 'matricula.cancelada') {
        console.log(
            `   ✉ E-mail de CANCELAMENTO enviado para ${dados.email} (Matrícula ID: ${dados.id})`
        );
    }
}

async function iniciar() {
    const conexao = await conectarRabbitMQ();
    const canal = await conexao.createChannel();

    await configurarTopologia(canal);
    await canal.prefetch(1);

    console.log(`[NOTIFICACOES] Ouvindo "${FILA_NOTIFICACOES}" (padrão: matricula.*). Ctrl+C para sair.`);

    await canal.consume(
        FILA_NOTIFICACOES,
        async (msg) => {
            if (!msg) return;

            const headerRequestId =
                msg.properties.headers?.['x-request-id'] ||
                msg.properties.correlationId ||
                'sem-request-id';

            // 1. Parse e validação estrutural (JSON inválido vai direto para a DLQ)
            let evento;
            try {
                evento = JSON.parse(msg.content.toString());
            } catch {
                console.error(
                    `[NOTIFICACOES] [DLQ] JSON malformado descartado para "${FILA_DLQ}" | X-Request-Id=${headerRequestId}`
                );
                return canal.nack(msg, false, false);
            }

            const requestId = evento.requestId || headerRequestId;

            if (!evento.eventId || !evento.tipo || !evento.dados?.email) {
                console.error(
                    `[NOTIFICACOES] [DLQ] Payload incompleto descartado para "${FILA_DLQ}" | X-Request-Id=${requestId}`
                );
                return canal.nack(msg, false, false);
            }

            // 2. Idempotência: ignora evento já processado com sucesso
            if (eventosProcessados.has(evento.eventId)) {
                console.log(
                    `[NOTIFICACOES] [IDEMPOTÊNCIA] Evento ${evento.eventId} já processado — ignorando duplicata | X-Request-Id=${requestId}`
                );
                return canal.ack(msg);
            }

            // 3. Processamento com retry limitado e encaminhamento para DLQ
            try {
                console.log(
                    `[NOTIFICACOES] Processando ${evento.tipo} | eventId=${evento.eventId} | X-Request-Id=${requestId}`
                );

                await enviarEmailNotificacao(evento);

                eventosProcessados.add(evento.eventId);
                canal.ack(msg);
            } catch (erro) {
                const tentativas = (msg.properties.headers?.['x-tentativas'] ?? 0) + 1;

                if (tentativas < MAX_TENTATIVAS) {
                    console.warn(
                        `[NOTIFICACOES] Falha (${erro.message}) — tentativa ${tentativas}/${MAX_TENTATIVAS}, reenfileirando | X-Request-Id=${requestId}`
                    );

                    canal.sendToQueue(FILA_NOTIFICACOES, msg.content, {
                        persistent: true,
                        contentType: 'application/json',
                        messageId: evento.eventId,
                        correlationId: requestId,
                        headers: {
                            ...msg.properties.headers,
                            'x-request-id': requestId,
                            'x-tentativas': tentativas
                        }
                    });

                    canal.ack(msg);
                } else {
                    console.error(
                        `[NOTIFICACOES] [DLQ] Falhou ${tentativas} vezes -> enviando para "${FILA_DLQ}" | eventId=${evento.eventId} | X-Request-Id=${requestId}`
                    );
                    canal.nack(msg, false, false);
                }
            }
        },
        { noAck: false }
    );
}

iniciar().catch((erro) => {
    console.error('[NOTIFICACOES] Erro fatal ao iniciar consumidor:', erro);
    process.exit(1);
});