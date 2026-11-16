import amqp from 'amqplib';
import dotenv from 'dotenv';

dotenv.config();

export const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';

export const EXCHANGE_EVENTOS = 'leman.eventos';
export const EXCHANGE_DLX = 'leman.dlx';

export const FILA_NOTIFICACOES = 'fila.notificacoes';
export const FILA_AUDITORIA = 'fila.auditoria';
export const FILA_DLQ = 'leman.dlq';

export async function conectarRabbitMQ() {
    const conexao = await amqp.connect(RABBITMQ_URL);
    return conexao;
}

export async function configurarTopologia(canal) {
    // 1. Exchange principal (topic) para eventos de domínio
    await canal.assertExchange(EXCHANGE_EVENTOS, 'topic', { durable: true });

    // 2. Dead Letter Exchange (fanout) e Dead Letter Queue (DLQ)
    await canal.assertExchange(EXCHANGE_DLX, 'fanout', { durable: true });
    await canal.assertQueue(FILA_DLQ, { durable: true });
    await canal.bindQueue(FILA_DLQ, EXCHANGE_DLX, '');

    // 3. Fila de notificações (assina apenas matricula.*)
    await canal.assertQueue(FILA_NOTIFICACOES, {
        durable: true,
        arguments: {
            'x-dead-letter-exchange': EXCHANGE_DLX
        }
    });
    await canal.bindQueue(FILA_NOTIFICACOES, EXCHANGE_EVENTOS, 'matricula.*');

    // 4. Fila de auditoria (assina # -> todos os eventos)
    await canal.assertQueue(FILA_AUDITORIA, {
        durable: true,
        arguments: {
            'x-dead-letter-exchange': EXCHANGE_DLX
        }
    });
    await canal.bindQueue(FILA_AUDITORIA, EXCHANGE_EVENTOS, '#');
}