import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { backupDiary } from '../scripts/backup-db.mjs';

async function fixture(t) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'treehool-backup-')));
  const source = join(directory, 'diary.sqlite');
  const database = new DatabaseSync(source);
  database.exec('PRAGMA journal_mode = WAL; CREATE TABLE entries (content TEXT);');
  database.prepare('INSERT INTO entries VALUES (?)').run('星星亮起来了');
  t.after(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, source, database };
}

test('online backup includes committed WAL records and leaves the source writable', async (t) => {
  const { directory, source, database } = await fixture(t);
  const output = await backupDiary(source);
  assert.ok(output.startsWith(join(directory, 'backups', 'diary-')));
  const snapshot = new DatabaseSync(output, { readOnly: true });
  assert.deepEqual(snapshot.prepare('SELECT content FROM entries').all().map((row) => row.content), ['星星亮起来了']);
  snapshot.close();
  database.prepare('INSERT INTO entries VALUES (?)').run('第二篇');
  assert.equal(database.prepare('SELECT count(*) AS count FROM entries').get().count, 2);
  assert.deepEqual((await readdir(join(directory, 'backups'))).filter((name) => name.startsWith('.diary-backup-')), []);
});

test('backup refuses an existing destination, including symbolic links', async (t) => {
  const { directory, source } = await fixture(t);
  const destination = join(directory, 'existing.sqlite');
  await writeFile(destination, 'keep this backup');
  await assert.rejects(backupDiary(source, destination), /已经存在/);
  assert.equal(await readFile(destination, 'utf8'), 'keep this backup');
  const alias = join(directory, 'alias.sqlite');
  await symlink(source, alias);
  await assert.rejects(backupDiary(source, alias), /已经存在/);
});

test('backup rejects the source as destination and does not create missing databases', async (t) => {
  const { directory, source, database } = await fixture(t);
  await assert.rejects(backupDiary(source, source), /不能是/);
  const missing = join(directory, 'missing.sqlite');
  await assert.rejects(backupDiary(missing));
  assert.equal((await readdir(directory)).includes('missing.sqlite'), false);
  assert.equal(database.prepare('SELECT count(*) AS count FROM entries').get().count, 1);
});

test('simultaneous backups cannot overwrite the same destination', async (t) => {
  const { directory, source } = await fixture(t);
  const destination = join(directory, 'shared.sqlite');
  const outcomes = await Promise.allSettled([backupDiary(source, destination), backupDiary(source, destination)]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'rejected').length, 1);
  const snapshot = new DatabaseSync(destination, { readOnly: true });
  assert.equal(snapshot.prepare('PRAGMA quick_check').get().quick_check, 'ok');
  snapshot.close();
});
