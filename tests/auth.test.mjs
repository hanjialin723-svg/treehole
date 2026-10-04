import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from '../server/index.mjs';

async function fixture(t, { old = false, ...options } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'treehole-auth-'));
  const databasePath = join(dir, 'diary.sqlite');
  if (old) {
    const db = new DatabaseSync(databasePath);
    db.exec(`CREATE TABLE diaries (id TEXT PRIMARY KEY, date TEXT NOT NULL UNIQUE, content TEXT NOT NULL, weatherMode TEXT NOT NULL, weather TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
      INSERT INTO diaries VALUES ('preserved-id', '2026-10-03', '原来的心事，不要删除', 'manual', 'rainy', '2026-10-03T00:00:00.000Z', '2026-10-03T01:00:00.000Z'); PRAGMA user_version = 1;`);
    db.close();
  }
  let app;
  async function start() { app = await startServer({ port: 0, host: '127.0.0.1', databasePath, staticDir: dir, logger: { error() {} }, ...options }); }
  await start();
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  function client() {
    let cookie = '';
    return {
      get cookie() { return cookie; },
      async json(path, method = 'GET', body, headers = {}) {
        const response = await fetch(`http://127.0.0.1:${app.server.address().port}${path}`, { method,
          headers: { Cookie: cookie, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        return { status: response.status, body: await response.json(), headers: response.headers };
      },
    };
  }
  return { client, databasePath, async restart() { await app.close(); await start(); } };
}
const credentials = (username, password = 'correct-password-123') => ({ username, password });
const diary = { date: '2026-10-03', content: '属于我自己的日记', weatherMode: 'auto' };

test('anonymous diary operations require a valid session, including import and guessed IDs', async (t) => {
  const f = await fixture(t);
  const anonymous = f.client();
  assert.deepEqual((await anonymous.json('/api/auth/session')).body, { user: null });
  for (const [path, method, body] of [ ['/api/diaries', 'GET'], ['/api/diaries', 'POST', diary], ['/api/diaries/id', 'PUT', diary], ['/api/diaries/id', 'DELETE', {}], ['/api/diaries/import', 'POST', { entries: [] }] ]) {
    const response = await anonymous.json(path, method, body);
    assert.equal(response.status, 401);
    assert.equal(response.body.code, 'AUTH_REQUIRED');
  }
  assert.equal((await anonymous.json('/api/diaries', 'GET', undefined, { Cookie: 'treehole_session=' + 'a'.repeat(64) })).status, 401);
});

test('registered users are isolated for reads, dates, update, delete and import', async (t) => {
  const f = await fixture(t);
  const alice = f.client(), bob = f.client();
  const registered = await alice.json('/api/auth/register', 'POST', credentials('Alice'));
  assert.equal(registered.status, 201);
  assert.equal(registered.body.user.username, 'Alice');
  assert.equal(registered.body.user.passwordHash, undefined);
  assert.match(registered.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal((await bob.json('/api/auth/register', 'POST', credentials('Bob'))).status, 201);
  const entry = (await alice.json('/api/diaries', 'POST', { ...diary, ownerId: 'spoof' })).body.entry;
  assert.equal(entry.ownerId, undefined);
  assert.deepEqual((await bob.json('/api/diaries')).body.entries, []);
  assert.equal((await bob.json(`/api/diaries/${entry.id}`, 'PUT', { ...diary, updatedAt: entry.updatedAt })).status, 404);
  assert.equal((await bob.json(`/api/diaries/${entry.id}`, 'DELETE', { updatedAt: entry.updatedAt })).status, 404);
  assert.equal((await bob.json('/api/diaries', 'POST', diary)).status, 201);
  const legacy = { ...diary, date: '2026-10-04', id: 'legacy-id', weather: 'cloudy', createdAt: entry.createdAt, updatedAt: entry.updatedAt };
  assert.equal((await bob.json('/api/diaries/import', 'POST', { entries: [legacy] })).status, 200);
  assert.deepEqual((await alice.json('/api/diaries')).body.entries, [entry]);
});

test('login, duplicate names, password policy, logout, expiry and persistent sessions', async (t) => {
  const f = await fixture(t);
  const c = f.client();
  for (const invalid of [credentials('x'), credentials('A B'), credentials('Okay', ''), credentials('Okay', 'short'), credentials('Okay', ' '.repeat(8)), null]) assert.equal((await c.json('/api/auth/register', 'POST', invalid)).status, 400);
  assert.equal((await c.json('/api/auth/register', 'POST', credentials('Lin'))).status, 409);
  assert.equal((await c.json('/api/auth/register', 'POST', credentials('Alice'))).status, 201);
  const savedCookie = c.cookie;
  assert.equal((await c.json('/api/auth/register', 'POST', credentials('alice'))).status, 409);
  await f.restart();
  assert.equal((await c.json('/api/auth/session')).body.user.username, 'Alice');
  assert.equal((await c.json('/api/auth/logout', 'POST', {})).status, 200);
  assert.equal((await c.json('/api/diaries', 'GET', undefined, { Cookie: savedCookie })).status, 401);
  for (const input of [credentials('Alice', 'wrong'), credentials('missing'), credentials('Alice', '')]) {
    const failure = await c.json('/api/auth/login', 'POST', input);
    assert.equal(failure.status, 401); assert.equal(failure.body.code, 'INVALID_CREDENTIALS');
  }
  assert.equal((await c.json('/api/auth/login', 'POST', credentials('ALICE'))).status, 200);
  const db = new DatabaseSync(f.databasePath);
  const user = db.prepare("SELECT * FROM users WHERE usernameKey = 'alice'").get();
  assert.match(user.passwordHash, /^scrypt:/);
  assert.ok(!user.passwordHash.includes('correct-password-123'));
  const session = db.prepare('SELECT tokenHash FROM sessions').get();
  assert.ok(!c.cookie.includes(session.tokenHash));
  db.exec('UPDATE sessions SET expiresAt = 0'); db.close();
  assert.equal((await c.json('/api/diaries')).status, 401);
});

test('v1 migration preserves all existing diary fields, assigns to Lin once, and disables empty login after setting password', async (t) => {
  const f = await fixture(t, { old: true });
  const lin = f.client(), second = f.client(), outsider = f.client();
  assert.equal((await lin.json('/api/auth/login', 'POST', credentials('Lin', 'wrong'))).status, 401);
  const login = await lin.json('/api/auth/login', 'POST', credentials('Lin', ''));
  assert.equal(login.status, 200); assert.equal(login.body.user.needsPassword, true);
  await second.json('/api/auth/login', 'POST', credentials('Lin', ''));
  const entry = (await lin.json('/api/diaries')).body.entries[0];
  assert.deepEqual(entry, { id: 'preserved-id', date: '2026-10-03', content: '原来的心事，不要删除', weatherMode: 'manual', weather: 'rainy', createdAt: '2026-10-03T00:00:00.000Z', updatedAt: '2026-10-03T01:00:00.000Z' });
  const linId = login.body.user.id;
  await outsider.json('/api/auth/register', 'POST', credentials('Elsewhere'));
  assert.deepEqual((await outsider.json('/api/diaries')).body.entries, []);
  await f.restart();
  assert.deepEqual((await lin.json('/api/diaries')).body.entries, [entry]);
  assert.equal((await lin.json('/api/auth/account', 'PUT', { username: 'Lin', currentPassword: '', newPassword: '' })).status, 400);
  assert.equal((await lin.json('/api/auth/account', 'PUT', { username: 'Elsewhere', currentPassword: '', newPassword: 'new-password-123' })).status, 409);
  const updated = await lin.json('/api/auth/account', 'PUT', { username: 'LinNew', currentPassword: '', newPassword: 'new-password-123' });
  assert.equal(updated.status, 200); assert.equal(updated.body.user.id, linId); assert.equal(updated.body.user.needsPassword, false);
  assert.equal((await second.json('/api/diaries')).status, 401);
  await lin.json('/api/auth/logout', 'POST', {});
  assert.equal((await lin.json('/api/auth/login', 'POST', credentials('Lin', ''))).status, 401);
  assert.equal((await lin.json('/api/auth/login', 'POST', credentials('LinNew', ''))).status, 401);
  assert.equal((await lin.json('/api/auth/login', 'POST', credentials('LinNew', 'new-password-123'))).status, 200);
  assert.deepEqual((await lin.json('/api/diaries')).body.entries, [entry]);
  await f.restart();
  assert.equal((await lin.json('/api/auth/session')).body.user.username, 'LinNew');
  const db = new DatabaseSync(f.databasePath, { readOnly: true });
  assert.equal(db.prepare('SELECT count(*) AS n FROM users WHERE allowEmptyPassword = 1').get().n, 0);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2); db.close();
});

test('username-only and password changes verify current password and revoke other sessions', async (t) => {
  const f = await fixture(t); const c = f.client(), second = f.client();
  await c.json('/api/auth/register', 'POST', credentials('Alice'));
  await second.json('/api/auth/login', 'POST', credentials('Alice'));
  const oldCookie = c.cookie;
  assert.equal((await c.json('/api/auth/account', 'PUT', { username: 'Changed', currentPassword: 'wrong', newPassword: '' })).status, 401);
  assert.equal((await c.json('/api/auth/account', 'PUT', { username: 'Changed', currentPassword: 'correct-password-123', newPassword: '' })).status, 200);
  assert.equal((await second.json('/api/diaries')).status, 401);
  assert.equal((await c.json('/api/diaries', 'GET', undefined, { Cookie: oldCookie })).status, 401);
  assert.equal((await c.json('/api/auth/account', 'PUT', { username: 'Changed', currentPassword: 'correct-password-123', newPassword: 'changed-password-123' })).status, 200);
  await c.json('/api/auth/logout', 'POST', {});
  assert.equal((await c.json('/api/auth/login', 'POST', credentials('Changed'))).status, 401);
  assert.equal((await c.json('/api/auth/login', 'POST', credentials('Changed', 'changed-password-123'))).status, 200);
});

test('secure cookies, cross-origin reads/writes and brute-force throttling', async (t) => {
  const f = await fixture(t, { publicOrigin: 'https://diary.test' }); const c = f.client();
  const registered = await c.json('/api/auth/register', 'POST', credentials('Alice'), { Origin: 'https://diary.test' });
  assert.equal(registered.status, 201); assert.match(registered.headers.get('set-cookie'), /; Secure/);
  for (const [path, method, body] of [['/api/diaries', 'GET'], ['/api/auth/session', 'GET'], ['/api/auth/logout', 'POST', {}], ['/api/auth/account', 'PUT', {}], ['/api/auth/register', 'POST', credentials('Evil')], ['/api/auth/login', 'POST', credentials('Alice')]]) {
    assert.equal((await c.json(path, method, body, { Origin: 'https://evil.test' })).status, 403);
  }
  assert.equal((await c.json('/api/diaries', 'GET', undefined, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  for (let i = 0; i < 15; i++) assert.equal((await c.json('/api/auth/login', 'POST', credentials('Alice', 'wrong'))).status, 401);
  assert.equal((await c.json('/api/auth/login', 'POST', credentials('Alice', 'wrong'))).status, 429);
});
