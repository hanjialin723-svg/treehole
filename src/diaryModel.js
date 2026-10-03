export const DIARY_STORAGE_KEY = 'treehool.diary.v1';
export const DIARY_CONTENT_LIMIT = 2000;

export const WEATHER_OPTIONS = Object.freeze([
  { id: 'sunny', label: '晴天', hint: '轻快、开心，心里有阳光' },
  { id: 'partly-cloudy', label: '晴间多云', hint: '有一点起伏，也有温暖的片刻' },
  { id: 'cloudy', label: '多云', hint: '平平淡淡，给自己一点留白' },
  { id: 'rainy', label: '小雨', hint: '有些低落，慢慢照顾自己' },
  { id: 'stormy', label: '雷雨', hint: '有些烦躁或紧绷，需要缓一缓' },
]);

const weatherIds = new Set(WEATHER_OPTIONS.map(({ id }) => id));
// Keep the exact storage version from which an array was derived. A second tab
// must never silently replace entries created after the first tab's last read.
const baselines = new WeakMap();

function diaryError(message, code) {
  return Object.assign(new Error(message), { code });
}

export function todayISO(now = new Date()) {
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isFinite(parsed.getTime()) && todayISO(parsed) === value;
}

export function formatDiaryDate(value) {
  if (!isValidDate(value)) throw diaryError('请选择有效的日记日期。', 'INVALID_DATE');
  const [year, month, day] = value.split('-');
  const weekday = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][new Date(`${value}T12:00:00`).getDay()];
  return { year, month, day, monthDay: `${month}.${day}`, weekday, full: `${year}年${Number(month)}月${Number(day)}日` };
}

// A small local word rule, not a diagnosis or an external AI service. Manual
// selection remains available when a few keywords miss the writer's meaning.
export function inferWeather(content) {
  let text = String(content ?? '').toLowerCase();
  text = text
    .replace(/(?:不是不|没有不|并非不)(?:开心|快乐|高兴|幸福|满意|喜欢|顺利)/g, ' 开心 ')
    .replace(/(?:开心|高兴|快乐)不起来/g, ' 难过 ')
    .replace(/(?:不再|并不|并没有|没有|没|不|不是)(?:觉得|感觉)?(?:很|太|那么|怎么|特别)?(?:开心|快乐|高兴|幸福|满意|轻松|愉快|喜欢|顺利)/g, ' 难过 ')
    .replace(/(?:不是不|没有不|并非不)(?:难过|伤心|焦虑|生气|烦躁|紧张|失望)/g, ' 难过 ')
    .replace(/不是没有(?:什么|任何)?压力/g, ' 压力 ')
    .replace(/(?:不再|并不|并没有|没有|没|不|不是)(?:觉得|感觉)?(?:很|太|那么|怎么|特别|什么|任何)?(?:难过|伤心|焦虑|生气|烦躁|紧张|担心|害怕|孤独|失落|沮丧|难受|疲惫|失望|压力)/g, ' 轻松 ');

  const positive = (text.match(/开心|快乐|高兴|幸福|愉快|温暖|感激|感谢|满足|满意|轻松|安心|平静|期待|喜欢|美好|惊喜|顺利|好起来|好多了|松了[一口]*气|治愈/g) ?? []).length;
  const sad = (text.match(/难过|伤心|失落|低落|沮丧|孤独|委屈|想哭|哭了|难受|疲惫|疲倦|很累|好累|遗憾|失望|无助/g) ?? []).length;
  const tense = (text.match(/焦虑|生气|烦躁|愤怒|恼火|崩溃|紧张|担心|害怕|压力|糟糕|烦死|气死|心烦|恐慌/g) ?? []).length;
  if (positive > 0 && sad + tense > 0) return 'partly-cloudy';
  if (tense > 0 && tense >= sad) return 'stormy';
  if (sad > 0) return 'rainy';
  if (positive > 0) return 'sunny';
  return 'cloudy';
}

function isTimestamp(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function validateEntries(entries) {
  if (!Array.isArray(entries)) throw diaryError('日记数据格式无法识别。', 'CORRUPT_DATA');
  const dates = new Set();
  const ids = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !entry.id || entry.id.length > 128
      || !isValidDate(entry.date) || typeof entry.content !== 'string' || !entry.content.trim()
      || entry.content.length > DIARY_CONTENT_LIMIT || !['auto', 'manual'].includes(entry.weatherMode)
      || !weatherIds.has(entry.weather) || !isTimestamp(entry.createdAt) || !isTimestamp(entry.updatedAt)
      || ids.has(entry.id) || dates.has(entry.date)) {
      throw diaryError('已保存的日记数据有损坏，暂时无法读取或覆盖。请保留当前浏览器的数据。', 'CORRUPT_DATA');
    }
    ids.add(entry.id);
    dates.add(entry.date);
  }
  return entries;
}

function parseStored(raw) {
  if (raw === null) return [];
  let payload;
  try { payload = JSON.parse(raw); } catch {
    throw diaryError('已保存的日记数据有损坏，暂时无法读取或覆盖。请保留当前浏览器的数据。', 'CORRUPT_DATA');
  }
  if (!payload || payload.version !== 1) {
    throw diaryError('日记数据版本无法识别，为保护原有日记，暂不覆盖。', 'UNSUPPORTED_VERSION');
  }
  return validateEntries(payload.entries);
}

function sorted(entries) {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
}

function carryBaseline(previous, next) {
  if (baselines.has(previous)) baselines.set(next, baselines.get(previous));
  return next;
}

export function loadDiary(storage) {
  try {
    const raw = storage.getItem(DIARY_STORAGE_KEY);
    const entries = sorted(parseStored(raw));
    baselines.set(entries, { storage, raw });
    return { entries, error: null };
  } catch (error) {
    return { entries: [], error: typeof error?.code === 'string' ? error.message : '当前浏览器无法读取日记。请检查浏览器存储设置后重试。' };
  }
}

export function saveDiary(storage, entries) {
  try {
    validateEntries(entries);
    const current = storage.getItem(DIARY_STORAGE_KEY);
    parseStored(current); // Never replace invalid or unknown existing data.
    const baseline = baselines.get(entries);
    if ((baseline && (baseline.storage !== storage || baseline.raw !== current)) || (!baseline && current !== null)) {
      throw diaryError('日记已在其他页面更新。请重新读取日记后再保存；当前文字仍保留在编辑框中。', 'STORAGE_CONFLICT');
    }
    const raw = JSON.stringify({ version: 1, entries });
    storage.setItem(DIARY_STORAGE_KEY, raw);
    if (storage.getItem(DIARY_STORAGE_KEY) !== raw) {
      throw diaryError('日记未能写入浏览器。当前文字仍保留在编辑框中，请稍后重试。', 'WRITE_FAILED');
    }
    baselines.set(entries, { storage, raw });
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: typeof error?.code === 'string' ? error.message : '日记未保存：浏览器存储不可用或空间不足。当前文字仍保留在编辑框中。' };
  }
}

export function upsertDiary(entries, input) {
  validateEntries(entries);
  if (!isValidDate(input.date)) throw diaryError('请选择有效的日记日期。', 'INVALID_DATE');
  const content = typeof input.content === 'string' ? input.content.trim() : '';
  if (!content) throw diaryError('写下一点今天的心情再保存吧。', 'EMPTY_CONTENT');
  if (content.length > DIARY_CONTENT_LIMIT) throw diaryError(`日记最多可以写 ${DIARY_CONTENT_LIMIT} 字。`, 'CONTENT_TOO_LONG');
  if (!['auto', 'manual'].includes(input.weatherMode)) throw diaryError('请选择心情天气的生成方式。', 'INVALID_WEATHER_MODE');
  if (input.weatherMode === 'manual' && !weatherIds.has(input.weather)) throw diaryError('请选择一种心情天气。', 'INVALID_WEATHER');
  const previous = input.id ? entries.find((entry) => entry.id === input.id) : null;
  if (input.id && !previous) throw diaryError('这篇日记已经不存在，请重新读取日记。', 'NOT_FOUND');
  if (entries.some((entry) => entry.date === input.date && entry.id !== input.id)) {
    throw diaryError('这一天已经写过日记了，可以回到日记本点击那一篇继续编辑。', 'DUPLICATE_DATE');
  }
  const timestamp = new Date().toISOString();
  const entry = {
    id: previous?.id ?? globalThis.crypto?.randomUUID?.() ?? `diary-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    date: input.date,
    content,
    weatherMode: input.weatherMode,
    weather: input.weatherMode === 'auto' ? inferWeather(content) : input.weather,
    createdAt: previous?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  const next = sorted([...entries.filter(({ id }) => id !== entry.id), entry]);
  return { entries: carryBaseline(entries, next), entry };
}

export function deleteDiary(entries, id) {
  validateEntries(entries);
  return carryBaseline(entries, entries.filter((entry) => entry.id !== id));
}
