
import pool from './database.js';

export async function eventoJaProcessado(consumidor, eventId) {
    const [rows] = await pool.execute(
        `SELECT id
         FROM eventos_processados
         WHERE consumidor = ? AND event_id = ?
         LIMIT 1`,
        [consumidor, eventId]
    );

    return rows.length > 0;
}

export async function registrarEventoProcessado(consumidor, eventId) {
    await pool.execute(
        `INSERT INTO eventos_processados (consumidor, event_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE event_id = event_id`,
        [consumidor, eventId]
    );
}
