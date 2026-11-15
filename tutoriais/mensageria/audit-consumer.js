import {
    conectarRabbitMQ,
    configurarTopologia,
    FILA_AUDITORIA
} from './topology.js';

const registrosAuditados = new Set();

async function iniciar() {
    const conexao = await conectarRabbitMQ();
    const canal = await conexao.createChannel();

    await configurarTopologia(canal);
    await canal.prefetch(1);

    console.log(`[AUDITORIA] Ouvindo "${FILA_AUDITORIA}" (padrão: #). Ctrl+C para sair.`);

    await canal.consume(
        FILA_AUDITORIA,
        async (msg) => {
            if (!msg) return;

            const headerRequestId =
                msg.properties.headers?.['x-request-id'] ||
                msg.properties.correlationId ||
                'sem-request-id';

            let evento;
            try {
                evento = JSON.parse(msg.content.toString());
            } catch {
                console.error(
                    `[AUDITORIA] [DLQ] Evento inválido enviado para DLQ | X-Request-Id=${headerRequestId}`
                );
                return canal.nack(msg, false, false);
            }

            const requestId = evento.requestId || headerRequestId;

            if (evento.eventId && registrosAuditados.has(evento.eventId)) {
                console.log(
                    `[AUDITORIA] [IDEMPOTÊNCIA] Evento ${evento.eventId} já registrado | X-Request-Id=${requestId}`
                );
                return canal.ack(msg);
            }

            console.log(
                `[AUDITORIA] [${evento.ocorridoEm}] key=${msg.fields.routingKey} | eventId=${evento.eventId} | X-Request-Id=${requestId} | dados=${JSON.stringify(evento.dados)}`
            );

            if (evento.eventId) {
                registrosAuditados.add(evento.eventId);
            }

            canal.ack(msg);
        },
        { noAck: false }
    );
}

iniciar().catch((erro) => {
    console.error('[AUDITORIA] Erro fatal ao iniciar consumidor:', erro);
    process.exit(1);
});