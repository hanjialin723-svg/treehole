import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Read-only verification. Never print diary text, hashes of passwords, or session tokens.
const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) throw new Error('Usage: node scripts/verify-account-migration.mjs BEFORE.sqlite AFTER.sqlite');
const before = new DatabaseSync(beforePath, { readOnly: true });
const after = new DatabaseSync(afterPath, { readOnly: true });
try {
  assert.equal(before.prepare('PRAGMA quick_check').get().quick_check, 'ok');
  assert.equal(after.prepare('PRAGMA quick_check').get().quick_check, 'ok');
  const columns = 'id, date, content, weatherMode, weather, createdAt, updatedAt';
  const original = before.prepare(`SELECT ${columns} FROM diaries ORDER BY id`).all();
  const current = after.prepare(`SELECT ${columns} FROM diaries ORDER BY id`).all();
  assert.deepEqual(current, original, 'Existing diary fields changed during migration');
  const lin = after.prepare("SELECT id, username, passwordHash, allowEmptyPassword FROM users WHERE usernameKey = 'lin'").get();
  assert.equal(lin.username, 'Lin');
  assert.equal(lin.passwordHash, null);
  assert.equal(lin.allowEmptyPassword, 1);
  assert.equal(after.prepare('SELECT count(*) AS n FROM diaries WHERE ownerId = ?').get(lin.id).n, original.length);
  assert.equal(after.prepare('PRAGMA user_version').get().user_version, 2);
  assert.equal(after.prepare('PRAGMA foreign_key_check').all().length, 0);
  const fingerprint = createHash('sha256').update(JSON.stringify(original)).digest('hex');
  console.log(JSON.stringify({ preservedRecords: original.length, owner: 'Lin', schemaVersion: 2, identicalFields: true, fingerprint, integrity: 'ok' }));
} finally { before.close(); after.close(); }
