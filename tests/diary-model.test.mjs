import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIARY_STORAGE_KEY, WEATHER_OPTIONS, todayISO, formatDiaryDate, inferWeather,
  loadDiary, saveDiary, upsertDiary, deleteDiary,
} from '../src/diaryModel.js';

function memoryStorage(initial = null) {
  let raw = initial;
  return { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
}

const draft = (changes = {}) => ({ date: '2026-10-03', content: '今天和朋友散步，很开心。', weatherMode: 'auto', ...changes });

test('local date helpers retain calendar dates and reject invalid dates', () => {
  assert.equal(todayISO(new Date(2026, 9, 3, 0, 5)), '2026-10-03');
  assert.deepEqual(formatDiaryDate('2026-10-03'), { year: '2026', month: '10', day: '03', monthDay: '10.03', weekday: '星期六', full: '2026年10月3日' });
  assert.throws(() => formatDiaryDate('2026-02-30'), { code: 'INVALID_DATE' });
  assert.throws(() => formatDiaryDate('2026-2-3'), { code: 'INVALID_DATE' });
  assert.equal(formatDiaryDate('2024-02-29').day, '29');
});

test('weather rules handle common negation and mixed feelings without reading real rain as mood', () => {
  for (const [content, expected] of [
    ['今天很开心，收到了惊喜。', 'sunny'],
    ['今天下雨了，但是很开心。', 'sunny'],
    ['我不开心。', 'rainy'], ['不是很开心。', 'rainy'], ['开心不起来。', 'rainy'],
    ['今天不难过了。', 'sunny'], ['没那么焦虑了。', 'sunny'], ['没有不开心。', 'sunny'],
    ['上午很失落，后来朋友来了，感觉温暖。', 'partly-cloudy'],
    ['生气又焦虑。', 'stormy'], ['安静地做了家务。', 'cloudy'], ['', 'cloudy'],
  ]) assert.equal(inferWeather(content), expected, content);
  assert.equal(WEATHER_OPTIONS.length, 5);
});

test('negated liking, progress, pressure and disappointment do not reverse the writer’s meaning', () => {
  for (const [content, expected] of [
    ['不喜欢今天的自己。', 'rainy'], ['今天一点也不顺利。', 'rainy'],
    ['今天没有压力。', 'sunny'], ['今天没有任何压力。', 'sunny'], ['我已经不失望了。', 'sunny'],
    ['今天没有压力，但还是有点失落。', 'partly-cloudy'],
    ['不是不喜欢自己，只是有点失望。', 'partly-cloudy'],
    ['今天不是没有压力。', 'stormy'], ['看到结果，我不是不失望。', 'rainy'],
    ['我喜欢现在的自己，一切顺利。', 'sunny'], ['今天压力很大，也很失望。', 'stormy'],
  ]) assert.equal(inferWeather(content), expected, content);
});

test('only real entries are persisted, reloaded and edited with stable ids', () => {
  const storage = memoryStorage();
  const initial = loadDiary(storage);
  assert.deepEqual(initial, { entries: [], error: null });
  const added = upsertDiary(initial.entries, draft({ content: '  今天很开心。 \n' }));
  assert.equal(added.entry.content, '今天很开心。');
  assert.equal(added.entry.weather, 'sunny');
  assert.deepEqual(saveDiary(storage, added.entries), { ok: true, error: null });
  assert.equal(JSON.parse(storage.getItem(DIARY_STORAGE_KEY)).version, 1);
  const loaded = loadDiary(storage);
  assert.deepEqual(loaded.entries, added.entries);
  const edited = upsertDiary(loaded.entries, draft({ id: added.entry.id, content: '今天很失落。' }));
  assert.equal(edited.entry.id, added.entry.id);
  assert.equal(edited.entry.createdAt, added.entry.createdAt);
  assert.equal(edited.entry.weather, 'rainy');
  assert.equal(edited.entries.length, 1);
  assert.equal(saveDiary(storage, edited.entries).ok, true);
});

test('manual weather survives text edits and auto mode can be restored', () => {
  const added = upsertDiary([], draft({ weatherMode: 'manual', weather: 'cloudy' }));
  assert.equal(added.entry.weather, 'cloudy');
  const edited = upsertDiary(added.entries, draft({ id: added.entry.id, content: '非常开心', weatherMode: 'manual', weather: 'rainy' }));
  assert.equal(edited.entry.weather, 'rainy');
  assert.equal(upsertDiary(edited.entries, draft({ id: edited.entry.id })).entry.weather, 'sunny');
});

test('validation prevents empty text, invalid dates, invalid weather and duplicate days', () => {
  const { entries, entry } = upsertDiary([], draft());
  for (const [input, code] of [
    [draft(), 'DUPLICATE_DATE'], [draft({ date: '2026-02-30' }), 'INVALID_DATE'],
    [draft({ content: ' \n ' }), 'EMPTY_CONTENT'], [draft({ content: '字'.repeat(2001) }), 'CONTENT_TOO_LONG'],
    [draft({ weatherMode: 'manual', weather: 'unknown' }), 'INVALID_WEATHER'],
    [draft({ weatherMode: 'unknown' }), 'INVALID_WEATHER_MODE'], [draft({ id: 'missing' }), 'NOT_FOUND'],
  ]) assert.throws(() => upsertDiary(entries, input), { code });
  const next = upsertDiary(entries, draft({ date: '2026-10-04' }));
  assert.throws(() => upsertDiary(next.entries, draft({ id: entry.id, date: '2026-10-04' })), { code: 'DUPLICATE_DATE' });
  assert.deepEqual(next.entries.map(({ date }) => date), ['2026-10-04', '2026-10-03']);
});

test('corrupt or unsupported stored data is never overwritten', () => {
  const good = upsertDiary([], draft()).entry;
  for (const raw of ['{broken', '{"version":2,"entries":[]}', '{"version":1,"entries":null}', JSON.stringify({ version: 1, entries: [good, good] })]) {
    const storage = memoryStorage(raw);
    assert.ok(loadDiary(storage).error);
    assert.equal(saveDiary(storage, [good]).ok, false);
    assert.equal(storage.getItem(DIARY_STORAGE_KEY), raw);
  }
});

test('read failures, quota failures and silently ignored writes are reported', () => {
  const denied = { getItem() { throw new Error('denied'); } };
  assert.ok(loadDiary(denied).error);
  assert.equal(saveDiary(denied, []).ok, false);
  const quota = { getItem: () => null, setItem() { throw new Error('quota'); } };
  assert.equal(saveDiary(quota, upsertDiary(loadDiary(quota).entries, draft()).entries).ok, false);
  const ignored = { getItem: () => null, setItem() {} };
  assert.equal(saveDiary(ignored, []).ok, false);
});

test('a stale tab cannot overwrite entries saved after its read; a fresh read recovers', () => {
  const storage = memoryStorage();
  const first = loadDiary(storage);
  const second = loadDiary(storage);
  const added = upsertDiary(first.entries, draft());
  assert.equal(saveDiary(storage, added.entries).ok, true);
  const stale = upsertDiary(second.entries, draft({ date: '2026-10-04' }));
  assert.equal(saveDiary(storage, stale.entries).ok, false);
  assert.equal(loadDiary(storage).entries.length, 1);
  const recovered = upsertDiary(loadDiary(storage).entries, draft({ date: '2026-10-04' }));
  assert.equal(saveDiary(storage, recovered.entries).ok, true);
  assert.equal(loadDiary(storage).entries.length, 2);
  assert.equal(saveDiary(storage, deleteDiary(recovered.entries, added.entry.id)).ok, true);
  assert.equal(loadDiary(storage).entries.length, 1);
});
