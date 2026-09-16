import pg from 'pg';
import { readFile } from 'node:fs/promises';

const ssl = process.env.PGSSL === 'true'
  ? { rejectUnauthorized: true, ...(process.env.PGSSLROOTCERT
    ? { ca: await readFile(process.env.PGSSLROOTCERT, 'utf8') } : {}) }
  : undefined;

export const pool = new pg.Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  ssl,
  max: 5,
  connectionTimeoutMillis: 10000,
});

export async function setupDatabase() {
  await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
}
