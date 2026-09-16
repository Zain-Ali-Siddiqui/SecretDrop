import express from 'express';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const app = express();
app.disable('x-powered-by');
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || '')
  .split(',').map((origin) => origin.trim()).filter(Boolean));
app.use('/api', (req, res, next) => {
  res.vary('Origin');
  if (allowedOrigins.has(req.headers.origin)) {
    res.set('Access-Control-Allow-Origin', req.headers.origin);
    res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
app.get('/api/health', route(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
}));
const validCode = (code) => typeof code === 'string' && /^[A-Z2-9]{8}$/.test(code);
const validBase64 = (value, bytes) => typeof value === 'string' &&
  value.length > 0 && Buffer.from(value, 'base64').toString('base64') === value &&
  (bytes ? Buffer.from(value, 'base64').length === bytes : Buffer.from(value, 'base64').length >= 16);

app.post('/api/secrets', route(async (req, res) => {
  const { code, ciphertext, iv, salt } = req.body || {};
  if (!validCode(code) || !validBase64(ciphertext) || !validBase64(iv, 12) || !validBase64(salt, 16)) {
    return res.status(400).json({ error: 'Invalid encrypted message.' });
  }
  await pool.query('UPDATE secret_messages SET expired = true WHERE expired = false AND expires_at <= now()');
  await pool.query(
    'INSERT INTO secret_messages (code, ciphertext, iv, salt, ip_address) VALUES ($1, $2, $3, $4, $5)',
    [code, ciphertext, iv, salt, req.socket.remoteAddress || null],
  );
  res.status(201).json({ success: true });
}));

app.get('/api/secrets/:code', route(async (req, res) => {
  if (!validCode(req.params.code)) return res.status(404).json({ error: 'Message not found.' });
  const { rows } = await pool.query(
    'SELECT id, code, ciphertext, iv, salt, created_at, expires_at, (expired OR expires_at <= now()) AS expired FROM secret_messages WHERE code = $1',
    [req.params.code],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Message not found.' });
  if (rows[0].expired) return res.status(410).json({ error: 'This message has expired.' });
  res.json(rows[0]);
}));

app.delete('/api/secrets/:code', route(async (req, res) => {
  if (!validCode(req.params.code)) return res.status(400).json({ error: 'Invalid code.' });
  await pool.query('DELETE FROM secret_messages WHERE code = $1', [req.params.code]);
  res.sendStatus(204);
}));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
app.use(express.static(dist));
app.get('*', (_req, res) => res.sendFile(`${dist}/index.html`));
app.use((error, _req, res, _next) => {
  if (error.code === '23505') return res.status(409).json({ error: 'Code already exists. Please try again.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Message is too large.' });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  console.error('Request failed:', error.message);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

export default app;
