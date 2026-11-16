import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config();
dotenv.config({ path: fileURLToPath(new URL('../rest/.env', import.meta.url)) });

const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3307),
    user: process.env.DB_USER || 'leman_user',
    password: process.env.DB_PASSWORD || 'leman_dev_123',
    database: process.env.DB_NAME || 'leman',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
});

export default pool;
