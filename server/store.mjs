import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, existsSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DIARY_CONTENT_LIMIT, WEATHER_OPTIONS, inferWeather } from '../src/diaryModel.js';

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
    db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version !== 0 && version !== 1) throw new Error(`Unsupported diary database version: ${version}`);
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
  } catch (error) {
    db.close();
    throw error;
  }

  const listQuery = db.prepare('SELECT * FROM diaries ORDER BY date DESC, updatedAt DESC');
  const idQuery = db.prepare('SELECT * FROM diaries WHERE id = ?');
  const dateQuery = db.prepare('SELECT * FROM diaries WHERE date = ?');
  const insertQuery = db.prepare('INSERT INTO diaries (id, date, content, weatherMode, weather, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const updateQuery = db.prepare('UPDATE diaries SET date = ?, content = ?, weatherMode = ?, weather = ?, updatedAt = ? WHERE id = ? AND updatedAt = ?');
  const deleteQuery = db.prepare('DELETE FROM diaries WHERE id = ? AND updatedAt = ?');

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

  function insert(input) {
    const now = timestamp();
    const entry = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
    insertQuery.run(entry.id, entry.date, entry.content, entry.weatherMode, entry.weather, now, now);
    return entry;
  }

  return {
    list: () => listQuery.all().map((row) => ({ ...row })),
    create(input) {
      const value = validateInput(input);
      return transaction(() => {
        if (dateQuery.get(value.date)) throw duplicateDate();
        return insert(value);
      });
    },
    update(id, input) {
      const value = validateInput(input);
      const version = checkVersion(input);
      return transaction(() => {
        const previous = idQuery.get(id);
        if (!previous) throw notFound();
        if (previous.updatedAt !== version) throw conflict();
        const duplicate = dateQuery.get(value.date);
        if (duplicate && duplicate.id !== id) throw duplicateDate();
        const entry = { ...previous, ...value, updatedAt: timestamp(previous.updatedAt) };
        if (updateQuery.run(entry.date, entry.content, entry.weatherMode, entry.weather, entry.updatedAt, id, version).changes !== 1) throw conflict();
        return entry;
      });
    },
    delete(id, input) {
      const version = checkVersion(input);
      return transaction(() => {
        const previous = idQuery.get(id);
        if (!previous) throw notFound();
        if (previous.updatedAt !== version) throw conflict();
        if (deleteQuery.run(id, version).changes !== 1) throw conflict();
      });
    },
    import(input) {
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
          const existing = dateQuery.get(value.date);
          if (existing) {
            if (['content', 'weatherMode', 'weather'].every((key) => existing[key] === value[key])) {
              skipped += 1;
              continue;
            }
            throw apiError(409, 'IMPORT_CONFLICT', `${value.date} 已有不同内容的日记，本次导入未写入任何内容；请先处理日期冲突。`);
          }
          insert(value);
          imported += 1;
        }
        return { entries: listQuery.all().map((row) => ({ ...row })), imported, skipped };
      });
    },
    close: () => db.close(),
  };
}
