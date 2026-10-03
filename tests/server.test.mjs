import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from '../server/index.mjs';

const draft = (date = '2026-10-03', content = '今天很开心', extra = {}) => ({ date, content, weatherMode: 'auto', weather: 'cloudy', ...extra });
const legacy = (date, content = '今天很开心', extra = {}) => ({ ...draft(date, content), id: `old-${date}`, weather: 'sunny', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', ...extra });

async function fixture(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'treehool-api-'));
  const staticDir = join(dir, 'public');
  const databasePath = join(dir, 'private', 'diary.sqlite');
  await mkdir(join(staticDir, 'assets'), { recursive: true });
  await writeFile(join(staticDir, 'index.html'), '<!doctype html><title>Treehool fixture</title>');
  await writeFile(join(staticDir, 'assets', 'test.js'), 'export const test = true;');
  let app;
  const start = async () => {
    app = await startServer({ host: '127.0.0.1', port: 0, databasePath, staticDir, logger: { error() {} }, ...options });
    return `http://127.0.0.1:${app.server.address().port}`;
  };
  let base = await start();
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  return {
    dir, staticDir, databasePath,
    get base() { return base; },
    async restart() { await app.close(); base = await start(); },
    async json(path, method = 'GET', body, headers = {}) {
      const response = await fetch(`${base}${path}`, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, headers: response.headers, body: await response.json() };
    },
  };
}

function rawRequest(base, path, { method = 'GET', headers = {}, chunks = [] } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(new URL(base), { path, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), headers: res.headers }));
    });
    req.on('error', reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

test('HTTP CRUD, server weather inference and durable restart', async (t) => {
  const f = await fixture(t);
  const health = await f.json('/api/health');
  assert.deepEqual(health.body, { ok: true });
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await f.json('/api/diaries')).body, { entries: [] });
  const created = await f.json('/api/diaries', 'POST', { ...draft(), id: 'untrusted', createdAt: '1900-01-01T00:00:00.000Z', updatedAt: '1900-01-01T00:00:00.000Z' });
  assert.equal(created.status, 201);
  const first = created.body.entry;
  assert.equal(first.weather, 'sunny');
  assert.notEqual(first.id, 'untrusted');
  assert.match(first.createdAt, /^\d{4}-\d\d-/);
  assert.notEqual(first.createdAt, '1900-01-01T00:00:00.000Z');
  const edited = await f.json(`/api/diaries/${first.id}`, 'PUT', { ...draft('2026-10-04', '有些难过', { weatherMode: 'manual', weather: 'partly-cloudy' }), updatedAt: first.updatedAt });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.entry.weather, 'partly-cloudy');
  assert.equal(edited.body.entry.createdAt, first.createdAt);
  assert.ok(edited.body.entry.updatedAt > first.updatedAt);
  await f.restart();
  assert.deepEqual((await f.json('/api/diaries')).body.entries, [edited.body.entry]);
  const deleted = await f.json(`/api/diaries/${first.id}`, 'DELETE', { updatedAt: edited.body.entry.updatedAt });
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body, { ok: true });
  await f.restart();
  assert.deepEqual((await f.json('/api/diaries')).body.entries, []);
});

test('API strictly validates object, real date, length and weather', async (t) => {
  const f = await fixture(t);
  for (const invalid of [null, [], 'text', {}, draft('2026-02-30'), draft('0000-01-01'), draft('2026-2-01'), draft(undefined, ''), draft(undefined, '   '), draft(undefined, 42), draft(undefined, 'a'.repeat(2001)), draft(undefined, 'x', { weatherMode: 'other' }), draft(undefined, 'x', { weatherMode: 'manual', weather: 'unknown' }), draft(undefined, 'x', { weather: [] })]) {
    const result = await f.json('/api/diaries', 'POST', invalid);
    assert.equal(result.status, 400, JSON.stringify(invalid));
    assert.equal(typeof result.body.error, 'string');
  }
  assert.deepEqual((await f.json('/api/diaries')).body.entries, []);
  assert.equal((await f.json('/api/diaries', 'POST', draft('2024-02-29', 'x'.repeat(2000)))).status, 201);
});

test('date uniqueness and optimistic concurrency protect other edits and deletes', async (t) => {
  const f = await fixture(t);
  const first = (await f.json('/api/diaries', 'POST', draft())).body.entry;
  assert.equal((await f.json('/api/diaries', 'POST', draft())).status, 409);
  const other = (await f.json('/api/diaries', 'POST', draft('2026-10-04'))).body.entry;
  const duplicate = await f.json(`/api/diaries/${other.id}`, 'PUT', { ...draft(), updatedAt: other.updatedAt });
  assert.equal(duplicate.status, 409);
  const updated = await f.json(`/api/diaries/${first.id}`, 'PUT', { ...draft(undefined, '新的日记'), updatedAt: first.updatedAt });
  assert.equal(updated.status, 200);
  const stale = await f.json(`/api/diaries/${first.id}`, 'PUT', { ...draft(undefined, '旧窗口'), updatedAt: first.updatedAt });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'VERSION_CONFLICT');
  assert.equal((await f.json(`/api/diaries/${first.id}`, 'DELETE', { updatedAt: first.updatedAt })).status, 409);
  assert.equal((await f.json(`/api/diaries/${first.id}`, 'DELETE', {})).status, 400);
  assert.equal((await f.json('/api/diaries/missing', 'PUT', { ...draft(), updatedAt: first.updatedAt })).status, 404);
  assert.equal((await f.json('/api/diaries/missing', 'DELETE', { updatedAt: first.updatedAt })).status, 404);
  assert.equal((await f.json('/api/diaries')).body.entries.find(({ id }) => id === first.id).content, '新的日记');
});

test('simultaneous creation and edits cannot silently overwrite', async (t) => {
  const f = await fixture(t);
  const responses = await Promise.all([f.json('/api/diaries', 'POST', draft()), f.json('/api/diaries', 'POST', draft())]);
  assert.deepEqual(responses.map(({ status }) => status).sort(), [201, 409]);
  const entry = responses.find(({ status }) => status === 201).body.entry;
  const updates = await Promise.all(['one', 'two'].map((content) => f.json(`/api/diaries/${entry.id}`, 'PUT', { ...draft(undefined, content), updatedAt: entry.updatedAt })));
  assert.deepEqual(updates.map(({ status }) => status).sort(), [200, 409]);
});

test('legacy import is atomic and idempotent, with server ids, clocks and inferred weather', async (t) => {
  const f = await fixture(t);
  const entries = [legacy('2026-09-30'), legacy('2026-10-01', '有些难过', { weather: 'sunny' })];
  const imported = await f.json('/api/diaries/import', 'POST', { entries });
  assert.equal(imported.status, 200);
  assert.equal(imported.body.imported, 2);
  assert.equal(imported.body.skipped, 0);
  assert.equal(imported.body.entries[0].weather, 'rainy');
  assert.notEqual(imported.body.entries[0].id, entries[1].id);
  assert.notEqual(imported.body.entries[0].createdAt, entries[1].createdAt);
  const repeated = await f.json('/api/diaries/import', 'POST', { entries });
  assert.equal(repeated.body.imported, 0);
  assert.equal(repeated.body.skipped, 2);
  assert.deepEqual(repeated.body.entries, imported.body.entries);
  const conflict = await f.json('/api/diaries/import', 'POST', { entries: [legacy('2026-10-02'), legacy('2026-09-30', '内容不同')] });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, 'IMPORT_CONFLICT');
  assert.deepEqual((await f.json('/api/diaries')).body.entries, imported.body.entries);
});

test('invalid imports never partially write', async (t) => {
  const f = await fixture(t);
  for (const input of [null, [], {}, { entries: null }, { entries: [legacy('2026-10-01'), null] }, { entries: [legacy('2026-10-01'), legacy('2026-10-01')] }, { entries: [legacy('2026-10-01', 'x', { createdAt: 'yesterday' })] }, { entries: [legacy('2026-10-01'), legacy('2026-10-02', 'x', { id: 'old-2026-10-01' })] }]) {
    assert.equal((await f.json('/api/diaries/import', 'POST', input)).status, 400);
    assert.deepEqual((await f.json('/api/diaries')).body.entries, []);
  }
});

test('browser cross-origin writes are rejected; matching origins and CLI writes work', async (t) => {
  const f = await fixture(t);
  for (const headers of [{ Origin: 'https://evil.example' }, { Origin: 'null' }, { Origin: f.base, 'Sec-Fetch-Site': 'cross-site' }, { Origin: `${f.base}/path` }]) {
    assert.equal((await f.json('/api/diaries', 'POST', draft(), headers)).status, 403);
  }
  assert.equal((await f.json('/api/diaries', 'POST', draft(), { Origin: f.base })).status, 201);
  assert.equal((await f.json('/api/diaries', 'POST', draft('2026-10-04'))).status, 201);
  const read = await f.json('/api/diaries');
  assert.equal(read.headers.get('access-control-allow-origin'), null);
});

test('PUBLIC_ORIGIN supports exact reverse proxy origin only', async (t) => {
  const f = await fixture(t, { publicOrigin: 'https://diary.example.test' });
  assert.equal((await f.json('/api/diaries', 'POST', draft(), { Origin: f.base })).status, 403);
  assert.equal((await f.json('/api/diaries', 'POST', draft(), { Origin: 'https://diary.example.test' })).status, 201);
  assert.equal((await f.json('/api/diaries', 'POST', draft('2026-10-04'), { Origin: 'http://diary.example.test' })).status, 403);
});

test('content type, malformed JSON and fixed/chunked body limits', async (t) => {
  const f = await fixture(t);
  const unsupported = await fetch(`${f.base}/api/diaries`, { method: 'POST', body: JSON.stringify(draft()), headers: { 'Content-Type': 'text/plain' } });
  assert.equal(unsupported.status, 415);
  const malformed = await fetch(`${f.base}/api/diaries`, { method: 'POST', body: '{', headers: { 'Content-Type': 'application/json' } });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, 'INVALID_JSON');
  const tooLarge = await f.json('/api/diaries', 'POST', draft(undefined, 'a'.repeat(33000)));
  assert.equal(tooLarge.status, 413);
  const chunked = await rawRequest(f.base, '/api/diaries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, chunks: ['{"content":"', 'a'.repeat(33000), '"}'] });
  assert.equal(chunked.status, 413);
  const importTooLarge = await f.json('/api/diaries/import', 'POST', { entries: ['a'.repeat(2 * 1024 * 1024)] });
  assert.equal(importTooLarge.status, 413);
  assert.deepEqual((await f.json('/api/diaries')).body.entries, []);
});

test('static frontend, HEAD and assets work without exposing paths or database', async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.dir, 'secret.txt'), 'private secret');
  await writeFile(join(f.staticDir, '.env'), 'private env');
  await symlink(join(f.dir, 'secret.txt'), join(f.staticDir, 'link.txt'));
  const home = await fetch(f.base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Treehool fixture/);
  assert.equal(home.headers.get('cache-control'), 'no-cache');
  const head = await fetch(f.base, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const asset = await fetch(`${f.base}/assets/test.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('cache-control'), /immutable/);
  for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/%2eenv', '/.env', '/link.txt', '/data/diary.sqlite', '/private/diary.sqlite', '/api/unknown', '/assets/', '/%00', '/%5c..%5csecret.txt']) {
    const response = await rawRequest(f.base, path);
    assert.equal(response.status, 404, path);
    assert.doesNotMatch(response.body, /private secret|private env|SQLite format/);
  }
  assert.equal((await rawRequest(f.base, '/%zz')).status, 400);
});

test('unknown database schema is rejected without replacing stored data', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'treehool-schema-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const databasePath = join(dir, 'future.sqlite');
  let db = new DatabaseSync(databasePath);
  db.exec('CREATE TABLE future (content TEXT); INSERT INTO future VALUES (\'preserve me\'); PRAGMA user_version = 99;');
  db.close();
  await assert.rejects(startServer({ port: 0, databasePath }), /Unsupported diary database version/);
  db = new DatabaseSync(databasePath);
  assert.equal(db.prepare('SELECT content FROM future').get().content, 'preserve me');
  db.close();
});
