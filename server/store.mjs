import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, existsSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DIARY_CONTENT_LIMIT, WEATHER_OPTIONS, inferWeather } from '../src/diaryModel.js';
import { hashPassword, verifyPassword, usernameInput, passwordInput, newToken, tokenHash, SESSION_SECONDS } from './auth.mjs';

const weatherIds = new Set(WEATHER_OPTIONS.map(({ id }) => id));
export function apiError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validTimestamp(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

export function validateInput(input) {
  if (!object(input)) throw apiError(400, 'INVALID_BODY', '日记内容格式不正确。');
  const { date, content, weatherMode, weather } = input;
  const parsed = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !date.startsWith('0000')
    ? new Date(`${date}T12:00:00.000Z`) : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw apiError(400, 'INVALID_DATE', '请选择有效的日记日期。');
  }
  if (typeof content !== 'string' || !content.trim()) throw apiError(400, 'EMPTY_CONTENT', '写下一点今天的心情再保存吧。');
  if (content.length > DIARY_CONTENT_LIMIT) throw apiError(400, 'CONTENT_TOO_LONG', `日记最多可以写 ${DIARY_CONTENT_LIMIT} 字。`);
  if (!['auto', 'manual'].includes(weatherMode)) throw apiError(400, 'INVALID_WEATHER_MODE', '请选择心情天气的生成方式。');
  if ((weatherMode === 'manual' || weather !== undefined) && !weatherIds.has(weather)) {
    throw apiError(400, 'INVALID_WEATHER', '请选择一种心情天气。');
  }
  return { date, content: content.trim(), weatherMode, weather: weatherMode === 'auto' ? inferWeather(content.trim()) : weather };
}

function checkVersion(input) {
  if (!object(input) || !validTimestamp(input.updatedAt)) throw apiError(400, 'INVALID_VERSION', '缺少日记版本，请重新读取日记后再试。');
  return input.updatedAt;
}

function timestamp(previous) {
  return new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString();
}

const duplicateDate = () => apiError(409, 'DUPLICATE_DATE', '这一天已经写过日记了，可以回到日记本点击那一篇继续编辑。');
const conflict = () => apiError(409, 'VERSION_CONFLICT', '这篇日记已被其他页面修改。请重新读取后再编辑；当前文字仍保留在编辑框中。');
const notFound = () => apiError(404, 'NOT_FOUND', '这篇日记已经不存在，请返回日记本重新读取。');

export function openStore(databasePath) {
  const memory = databasePath === ':memory:';
  const filename = memory ? databasePath : resolve(databasePath);
  if (!memory) mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const isNew = !memory && !existsSync(filename);
  const db = new DatabaseSync(filename);
  try {
    if (isNew) chmodSync(filename, 0o600);
    db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (![0, 1, 2].includes(version)) throw new Error(`Unsupported diary database version: ${version}`);
    if (version === 0) {
      if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get()) {
        throw new Error('Refusing to replace an unrecognized existing database');
      }
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE diaries (
          id TEXT PRIMARY KEY, date TEXT NOT NULL UNIQUE, content TEXT NOT NULL,
          weatherMode TEXT NOT NULL CHECK (weatherMode IN ('auto', 'manual')),
          weather TEXT NOT NULL CHECK (weather IN ('sunny', 'partly-cloudy', 'cloudy', 'rainy', 'stormy')),
          createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
        );
        PRAGMA user_version = 1;
        COMMIT;`);
    }
    if (version < 2) {
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE users (
          id TEXT PRIMARY KEY, username TEXT NOT NULL, usernameKey TEXT NOT NULL UNIQUE,
          passwordHash TEXT, allowEmptyPassword INTEGER NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL
        );
        CREATE TABLE sessions (
          tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), expiresAt INTEGER NOT NULL
        );
        CREATE INDEX sessions_user ON sessions(userId);
        ALTER TABLE diaries RENAME TO legacy_diaries;
        CREATE TABLE diaries (
          id TEXT PRIMARY KEY, ownerId TEXT NOT NULL REFERENCES users(id), date TEXT NOT NULL, content TEXT NOT NULL,
          weatherMode TEXT NOT NULL CHECK (weatherMode IN ('auto', 'manual')),
          weather TEXT NOT NULL CHECK (weather IN ('sunny', 'partly-cloudy', 'cloudy', 'rainy', 'stormy')),
          createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, UNIQUE(ownerId, date)
        );`);
      try {
        const linId = randomUUID();
        db.prepare('INSERT INTO users VALUES (?, ?, ?, NULL, 1, ?)').run(linId, 'Lin', 'lin', timestamp());
        db.prepare('INSERT INTO diaries SELECT id, ?, date, content, weatherMode, weather, createdAt, updatedAt FROM legacy_diaries').run(linId);
        const before = db.prepare('SELECT count(*) AS n FROM legacy_diaries').get().n;
        const after = db.prepare('SELECT count(*) AS n FROM diaries').get().n;
        if (before !== after) throw new Error('Diary migration row count mismatch');
        db.exec('DROP TABLE legacy_diaries; PRAGMA user_version = 2; COMMIT;');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  } catch (error) {
    db.close();
    throw error;
  }

  const columns = 'id, date, content, weatherMode, weather, createdAt, updatedAt';
  const listQuery = db.prepare(`SELECT ${columns} FROM diaries WHERE ownerId = ? ORDER BY date DESC, updatedAt DESC`);
  const idQuery = db.prepare(`SELECT ${columns} FROM diaries WHERE ownerId = ? AND id = ?`);
  const dateQuery = db.prepare(`SELECT ${columns} FROM diaries WHERE ownerId = ? AND date = ?`);
  const insertQuery = db.prepare('INSERT INTO diaries (id, ownerId, date, content, weatherMode, weather, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const updateQuery = db.prepare('UPDATE diaries SET date = ?, content = ?, weatherMode = ?, weather = ?, updatedAt = ? WHERE ownerId = ? AND id = ? AND updatedAt = ?');
  const deleteQuery = db.prepare('DELETE FROM diaries WHERE ownerId = ? AND id = ? AND updatedAt = ?');
  const userByKey = db.prepare('SELECT * FROM users WHERE usernameKey = ?');
  const userById = db.prepare('SELECT * FROM users WHERE id = ?');
  const publicUser = (user) => ({ id: user.id, username: user.username, needsPassword: Boolean(user.allowEmptyPassword) });
  function makeSession(user) {
    db.prepare('DELETE FROM sessions WHERE expiresAt <= ?').run(Date.now());
    const token = newToken();
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(tokenHash(token), user.id, Date.now() + SESSION_SECONDS * 1000);
    return { user: publicUser(user), token };
  }

  function transaction(callback) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function insert(ownerId, input) {
    const now = timestamp();
    const entry = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
    insertQuery.run(entry.id, ownerId, entry.date, entry.content, entry.weatherMode, entry.weather, now, now);
    return entry;
  }

  return {
    session(token) {
      if (!token) return null;
      const row = db.prepare('SELECT userId FROM sessions WHERE tokenHash = ? AND expiresAt > ?').get(tokenHash(token), Date.now());
      const user = row && userById.get(row.userId);
      return user ? publicUser(user) : null;
    },
    logout(token) { if (token) db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(tokenHash(token)); },
    async register(input) {
      const { username, usernameKey } = usernameInput(input?.username);
      const password = passwordInput(input?.password);
      if (userByKey.get(usernameKey)) throw apiError(409, 'USERNAME_TAKEN', '这个用户名已被使用，请换一个。');
      const passwordHash = await hashPassword(password);
      return transaction(() => {
        if (userByKey.get(usernameKey)) throw apiError(409, 'USERNAME_TAKEN', '这个用户名已被使用，请换一个。');
        const user = { id: randomUUID(), username, usernameKey, passwordHash, allowEmptyPassword: 0 };
        db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, 0, ?)').run(user.id, username, usernameKey, passwordHash, timestamp());
        return makeSession(user);
      });
    },
    async login(input) {
      const { usernameKey } = usernameInput(input?.username);
      const user = userByKey.get(usernameKey);
      if (!await verifyPassword(input?.password, user?.passwordHash ?? null, Boolean(user?.allowEmptyPassword))) {
        throw apiError(401, 'INVALID_CREDENTIALS', '用户名或密码不正确，请重新输入。');
      }
      // Password verification yields: do not issue a session for a concurrently changed account.
      const current = userById.get(user.id);
      if (current.passwordHash !== user.passwordHash || current.usernameKey !== user.usernameKey) throw apiError(401, 'INVALID_CREDENTIALS', '账户信息已变化，请重新登录。');
      return transaction(() => makeSession(current));
    },
    async updateAccount(userId, input) {
      const previous = userById.get(userId);
      if (!previous || !await verifyPassword(input?.currentPassword, previous.passwordHash, Boolean(previous.allowEmptyPassword))) {
        throw apiError(401, 'WRONG_CURRENT_PASSWORD', '当前密码不正确，账户信息未修改。');
      }
      const { username, usernameKey } = usernameInput(input?.username);
      const changingPassword = input?.newPassword !== undefined && input.newPassword !== '';
      if (previous.allowEmptyPassword && !changingPassword) throw apiError(400, 'PASSWORD_REQUIRED', '请先为账户设置一个密码。');
      const passwordHash = changingPassword ? await hashPassword(passwordInput(input.newPassword)) : previous.passwordHash;
      return transaction(() => {
        const current = userById.get(userId);
        if (current.passwordHash !== previous.passwordHash || current.usernameKey !== previous.usernameKey) throw apiError(409, 'ACCOUNT_CONFLICT', '账户信息已变化，请重新登录后再修改。');
        const duplicate = userByKey.get(usernameKey);
        if (duplicate && duplicate.id !== userId) throw apiError(409, 'USERNAME_TAKEN', '这个用户名已被使用，请换一个。');
        db.prepare('UPDATE users SET username = ?, usernameKey = ?, passwordHash = ?, allowEmptyPassword = 0 WHERE id = ?').run(username, usernameKey, passwordHash, userId);
        db.prepare('DELETE FROM sessions WHERE userId = ?').run(userId);
        return makeSession(userById.get(userId));
      });
    },
    list: (ownerId) => listQuery.all(ownerId).map((row) => ({ ...row })),
    create(ownerId, input) {
      const value = validateInput(input);
      return transaction(() => {
        if (dateQuery.get(ownerId, value.date)) throw duplicateDate();
        return insert(ownerId, value);
      });
    },
    update(ownerId, id, input) {
      const value = validateInput(input);
      const version = checkVersion(input);
      return transaction(() => {
        const previous = idQuery.get(ownerId, id);
        if (!previous) throw notFound();
        if (previous.updatedAt !== version) throw conflict();
        const duplicate = dateQuery.get(ownerId, value.date);
        if (duplicate && duplicate.id !== id) throw duplicateDate();
        const entry = { ...previous, ...value, updatedAt: timestamp(previous.updatedAt) };
        if (updateQuery.run(entry.date, entry.content, entry.weatherMode, entry.weather, entry.updatedAt, ownerId, id, version).changes !== 1) throw conflict();
        return entry;
      });
    },
    delete(ownerId, id, input) {
      const version = checkVersion(input);
      return transaction(() => {
        const previous = idQuery.get(ownerId, id);
        if (!previous) throw notFound();
        if (previous.updatedAt !== version) throw conflict();
        if (deleteQuery.run(ownerId, id, version).changes !== 1) throw conflict();
      });
    },
    import(ownerId, input) {
      if (!object(input) || !Array.isArray(input.entries) || input.entries.length > 1000) {
        throw apiError(400, 'INVALID_IMPORT', '导入格式不正确，一次最多导入 1000 篇日记。');
      }
      const dates = new Set();
      const ids = new Set();
      const values = input.entries.map((entry) => {
        const value = validateInput(entry);
        if (typeof entry.id !== 'string' || !entry.id || entry.id.length > 128
          || !validTimestamp(entry.createdAt) || !validTimestamp(entry.updatedAt)
          || !weatherIds.has(entry.weather) || dates.has(entry.date) || ids.has(entry.id)) {
          throw apiError(400, 'INVALID_IMPORT', '旧日记数据有重复或格式不正确，请保留浏览器原始数据。');
        }
        dates.add(entry.date);
        ids.add(entry.id);
        return value;
      });
      return transaction(() => {
        let imported = 0;
        let skipped = 0;
        for (const value of values) {
          const existing = dateQuery.get(ownerId, value.date);
          if (existing) {
            if (['content', 'weatherMode', 'weather'].every((key) => existing[key] === value[key])) {
              skipped += 1;
              continue;
            }
            throw apiError(409, 'IMPORT_CONFLICT', `${value.date} 已有不同内容的日记，本次导入未写入任何内容；请先处理日期冲突。`);
          }
          insert(ownerId, value);
          imported += 1;
        }
        return { entries: listQuery.all(ownerId).map((row) => ({ ...row })), imported, skipped };
      });
    },
    close: () => db.close(),
  };
}
