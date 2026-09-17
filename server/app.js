import express from 'express';
import { randomBytes, createHash } from 'node:crypto';
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
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
const hash = (token) => createHash('sha256').update(token).digest('hex');
const validToken = (token) => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
const validBase64 = (value, bytes) => typeof value === 'string' &&
  value.length > 0 && Buffer.from(value, 'base64').toString('base64') === value &&
  (bytes ? Buffer.from(value, 'base64').length === bytes : Buffer.from(value, 'base64').length >= 16);

app.post('/api/secrets', route(async (req, res) => {
  const { code, ciphertext, iv, salt, expiry_seconds = 604800, burn_after_read = false, burn_token_hash = null } = req.body || {};
  if (!validCode(code) || !validBase64(ciphertext) || !validBase64(iv, 12) || !validBase64(salt, 16)) {
    return res.status(400).json({ error: 'Invalid encrypted message.' });
  }
  if (![600, 3600, 86400, 604800].includes(expiry_seconds) || typeof burn_after_read !== 'boolean' ||
      (burn_after_read && !validToken(burn_token_hash)) || (!burn_after_read && burn_token_hash !== null)) {
    return res.status(400).json({ error: 'Invalid expiry or burn settings.' });
  }
  const deleteToken = randomBytes(32).toString('hex');
  await pool.query('UPDATE secret_messages SET expired = true WHERE expired = false AND expires_at <= now()');
  const { rows } = await pool.query(
    `INSERT INTO secret_messages (code, ciphertext, iv, salt, ip_address, expires_at, burn_after_read, burn_token_hash, delete_token_hash)
     VALUES ($1, $2, $3, $4, $5, now() + $6 * interval '1 second', $7, $8, $9) RETURNING expires_at`,
    [code, ciphertext, iv, salt, req.socket.remoteAddress || null, expiry_seconds, burn_after_read, burn_token_hash, hash(deleteToken)],
  );
  res.status(201).json({ success: true, delete_token: deleteToken, expires_at: rows[0].expires_at });
}));

const unlock = route(async (req, res) => {
  if (!validCode(req.params.code)) return res.status(404).json({ error: 'Message not found.' });
  const { rows } = await pool.query(
    `UPDATE secret_messages SET view_count = view_count + 1 WHERE code = $1
     RETURNING id, code, ciphertext, iv, salt, created_at, expires_at, burn_after_read, view_count,
     (expired OR expires_at <= now()) AS expired`,
    [req.params.code],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Message not found.' });
  if (rows[0].expired) return res.status(410).json({ error: 'This message has expired.' });
  res.json(rows[0]);
});
app.post('/api/secrets/:code/unlock', unlock);
// Compatibility with previously opened clients; reads still count as attempts.
app.get('/api/secrets/:code', unlock);

app.post('/api/secrets/:code/burn', route(async (req, res) => {
  const token = req.body?.token;
  if (!validCode(req.params.code) || !validToken(token)) return res.status(403).json({ error: 'Invalid read confirmation.' });
  const { rows } = await pool.query(
    `DELETE FROM secret_messages WHERE code = $1 AND burn_after_read = true AND burn_token_hash = $2
     AND expired = false AND expires_at > now() RETURNING view_count`, [req.params.code, hash(token)],
  );
  if (!rows.length) return res.status(410).json({ error: 'This message has already been destroyed or is unavailable.' });
  res.json({ self_destructed: true, view_count: rows[0].view_count });
}));

app.delete('/api/secrets/:code', route(async (req, res) => {
  if (!validCode(req.params.code)) return res.status(400).json({ error: 'Invalid code.' });
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!validToken(token)) return res.status(403).json({ error: 'Only the sender can delete this message. Use your private delete link.' });
  const result = await pool.query('DELETE FROM secret_messages WHERE code = $1 AND delete_token_hash = $2', [req.params.code, hash(token)]);
  if (!result.rowCount) return res.status(404).json({ error: 'Message unavailable or invalid sender key.' });
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
