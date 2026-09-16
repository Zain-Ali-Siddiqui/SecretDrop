import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import ts from 'typescript';

// Exercise the actual browser encryption code against the deployed API or
// the same handler locally. Only this test's random record is removed.
const source = await readFile(new URL('../src/lib/crypto.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { encryptMessage, decryptMessage, generateCode } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
let server;
let pool;
let base = process.env.SECRET_DROP_TEST_URL;
if (!base) {
  const { default: app } = await import('../api/index.js');
  ({ pool } = await import('../server/db.js'));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
}
base = base.replace(/\/+$/, '');
const code = generateCode();
let created = false;
const request = (path, options) => fetch(`${base}${path}`, {
  ...options, signal: AbortSignal.timeout(30000),
});
try {
  const page = await request('/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /SecretDrop/);
  assert.equal((await request('/favicon.svg')).status, 200);
  const health = await request('/api/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  const invalid = await request('/api/secrets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(invalid.status, 400);
  const plaintext = 'SecretDrop deployment smoke test';
  const password = `test-${crypto.randomUUID()}`;
  const encrypted = await encryptMessage(plaintext, password);
  const options = {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, ...encrypted }),
  };
  assert.equal((await request('/api/secrets', options)).status, 201);
  created = true;
  assert.equal((await request('/api/secrets', options)).status, 409);
  const saved = await request(`/api/secrets/${code}`);
  assert.equal(saved.status, 200);
  const record = await saved.json();
  assert.equal(record.ciphertext, encrypted.ciphertext);
  assert.equal(await decryptMessage(record.ciphertext, record.iv, record.salt, password), plaintext);
  await assert.rejects(decryptMessage(record.ciphertext, record.iv, record.salt, 'wrong-password'));
  assert.equal((await request(`/api/secrets/${code}`, { method: 'DELETE' })).status, 204);
  created = false;
  assert.equal((await request(`/api/secrets/${code}`)).status, 404);
  const missing = await request('/api/not-a-route');
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type'), /application\/json/);
  console.log('PASS: frontend, favicon, database health, validation, encrypted create/read, duplicate code, wrong password, delete, and API 404.');
} finally {
  if (created) await request(`/api/secrets/${code}`, { method: 'DELETE' });
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
}
