import { randomUUID } from 'node:crypto';
import {
    conectarRabbitMQ,
    configurarTopologia,
    EXCHANGE_EVENTOS
} from './topology.js';

/**
 * Publica um evento de domínio na exchange topic da Plataforma Leman.
 * Pode ser importado diretamente pela API REST ou usado em scripts de teste.
 */
export async function publishEvent(routingKey, dados, opcoes = {}) {
    const requestId = opcoes.requestId || randomUUID();
    const eventId = opcoes.eventId || randomUUID();

    const evento = {
        eventId,
        tipo: routingKey,
        requestId,
        ocorridoEm: new Date().toISOString(),
        dados
    };

    const conexao = await conectarRabbitMQ();
    try {
        const canal = await conexao.createConfirmChannel();
        await configurarTopologia(canal);

        const conteudo = Buffer.from(JSON.stringify(evento));

        canal.publish(EXCHANGE_EVENTOS, routingKey, conteudo, {
            persistent: true,
            contentType: 'application/json',
            messageId: eventId,
            correlationId: requestId,
            headers: {
                'x-request-id': requestId,
                'x-event-id': eventId
            }
        });

        await canal.waitForConfirms();
        console.log(
            `[PUBLISHER] Evento publicado | key=${routingKey} | eventId=${eventId} | X-Request-Id=${requestId}`
        );

        await canal.close();
        return evento;
    } finally {
        await conexao.close();
    }
}

/**
 * Publica um payload bruto (usado para testar mensagens malformadas rumo à DLQ).
 */
export async function publishRawMessage(routingKey, rawText, requestId = randomUUID()) {
    const conexao = await conectarRabbitMQ();
    try {
        const canal = await conexao.createConfirmChannel();
        await configurarTopologia(canal);

        canal.publish(EXCHANGE_EVENTOS, routingKey, Buffer.from(rawText), {
            persistent: true,
            contentType: 'application/json',
            correlationId: requestId,
            headers: {
                'x-request-id': requestId
            }
        });

        await canal.waitForConfirms();
        console.log(
            `[PUBLISHER] Mensagem bruta enviada | key=${routingKey} | X-Request-Id=${requestId}`
        );
        await canal.close();
    } finally {
        await conexao.close();
    }
}