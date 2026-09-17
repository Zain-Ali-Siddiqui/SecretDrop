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
const { encryptMessage, encryptSecret, decryptMessage, generateCode } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
const strengthSource = await readFile(new URL('../src/lib/password.ts', import.meta.url), 'utf8');
const strengthJs = ts.transpileModule(strengthSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { passwordStrength } = await import(`data:text/javascript;base64,${Buffer.from(strengthJs).toString('base64')}`);
assert.equal(passwordStrength('').score, 0);
assert.equal(passwordStrength('password123!').label, 'Weak');
assert.equal(passwordStrength('aaaaaaaaaaaaaaaaaaaaaaaa').label, 'Weak');
assert.equal(passwordStrength('aB7!dE9@kL2#nP5$qR8%').label, 'Excellent');
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
let deleteToken;
const extraRecords = new Map();
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
  const creation = await request('/api/secrets', options);
  assert.equal(creation.status, 201);
  deleteToken = (await creation.json()).delete_token;
  created = true;
  assert.equal((await request('/api/secrets', options)).status, 409);
  const saved = await request(`/api/secrets/${code}`);
  assert.equal(saved.status, 200);
  const record = await saved.json();
  assert.equal(record.view_count, 1);
  assert.equal(record.delete_token_hash, undefined);
  assert.equal(record.burn_token_hash, undefined);
  assert.equal(record.ciphertext, encrypted.ciphertext);
  assert.equal(await decryptMessage(record.ciphertext, record.iv, record.salt, password), plaintext);
  await assert.rejects(decryptMessage(record.ciphertext, record.iv, record.salt, 'wrong-password'));
  assert.equal((await request(`/api/secrets/${code}`, { method: 'DELETE' })).status, 403);
  assert.equal((await request(`/api/secrets/${code}`, { method: 'DELETE', headers: { Authorization: `Bearer ${'0'.repeat(64)}` } })).status, 404);
  const concurrent = await Promise.all(Array.from({ length: 4 }, () => request(`/api/secrets/${code}/unlock`, { method: 'POST' }).then((r) => r.json())));
  assert.deepEqual(concurrent.map((r) => r.view_count).sort(), [2, 3, 4, 5]);
  if (pool) {
    await pool.query('UPDATE secret_messages SET expires_at = now() WHERE code = $1', [code]);
    assert.equal((await request(`/api/secrets/${code}/unlock`, { method: 'POST' })).status, 410);
  }
  assert.equal((await request(`/api/secrets/${code}`, { method: 'DELETE', headers: { Authorization: `Bearer ${deleteToken}` } })).status, 204);
  created = false;
  assert.equal((await request(`/api/secrets/${code}`)).status, 404);
  const missing = await request('/api/not-a-route');
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type'), /application\/json/);
  for (const seconds of [600, 3600, 86400, 604800]) {
    const burnCode = generateCode();
    const encryptedBurn = await encryptSecret(plaintext, password, true);
    const body = { code: burnCode, ...encryptedBurn, burn_after_read: true, expiry_seconds: seconds };
    assert.equal((await request('/api/secrets', { ...options, body: JSON.stringify({ ...body, expiry_seconds: 42 }) })).status, 400);
    const createdBurn = await request('/api/secrets', { ...options, body: JSON.stringify(body) });
    assert.equal(createdBurn.status, 201);
    const receipt = await createdBurn.json();
    extraRecords.set(burnCode, receipt.delete_token);
    const burnRecord = await (await request(`/api/secrets/${burnCode}/unlock`, { method: 'POST' })).json();
    assert.equal(burnRecord.view_count, 1);
    assert.equal(burnRecord.burn_after_read, true);
    assert.ok(Math.abs((Date.parse(burnRecord.expires_at) - Date.parse(burnRecord.created_at)) / 1000 - seconds) < 1);
    await assert.rejects(decryptMessage(burnRecord.ciphertext, burnRecord.iv, burnRecord.salt, 'wrong-password'));
    assert.equal((await request(`/api/secrets/${burnCode}/burn`, { ...options, body: JSON.stringify({ token: '0'.repeat(64) }) })).status, 410);
    const secondRead = await (await request(`/api/secrets/${burnCode}/unlock`, { method: 'POST' })).json();
    assert.equal(secondRead.view_count, 2);
    const envelope = JSON.parse(await decryptMessage(secondRead.ciphertext, secondRead.iv, secondRead.salt, password));
    assert.equal(envelope.message, plaintext);
    const burns = await Promise.all([1, 2].map(() => request(`/api/secrets/${burnCode}/burn`, { ...options, body: JSON.stringify({ token: envelope.burnToken }) })));
    assert.deepEqual(burns.map((r) => r.status).sort(), [200, 410]);
    const confirmation = await burns.find((r) => r.status === 200).json();
    assert.equal(confirmation.self_destructed, true);
    assert.equal(confirmation.view_count, 2);
    assert.equal((await request(`/api/secrets/${burnCode}/unlock`, { method: 'POST' })).status, 404);
    if (pool) assert.equal((await pool.query('SELECT code FROM secret_messages WHERE code=$1', [burnCode])).rowCount, 0);
    extraRecords.delete(burnCode);
  }
  console.log('PASS: encrypted CRUD, sender-only deletion, all four expiry timers, atomic view counts, wrong-password survival, burn confirmation, permanent deletion, and concurrent burn protection.');
} finally {
  if (created) await request(`/api/secrets/${code}`, { method: 'DELETE', headers: { Authorization: `Bearer ${deleteToken}` } });
  for (const [testCode, token] of extraRecords) await request(`/api/secrets/${testCode}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
}
