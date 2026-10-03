import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteDiary, loadDiary, saveDiary, todayISO, upsertDiary } from '../../diaryModel.js';
import { DiaryBook } from './DiaryBook.jsx';
import { DiaryEditor } from './DiaryEditor.jsx';
import { Icon } from './WeatherIcon.jsx';
import '../../diary.css';

function readDiaries() {
  try { return loadDiary(window.localStorage); }
  catch { return { entries: [], error: '当前浏览器无法读取日记，请检查浏览器的存储设置。' }; }
}

function rangeLabel(entries) {
  const first = (entries[0]?.date || todayISO()).slice(0, 7);
  const last = (entries.at(-1)?.date || first).slice(0, 7);
  const label = (date) => `${date.slice(0, 4)}年${Number(date.slice(5))}月`;
  return first === last ? label(first) : `${label(last)} — ${label(first)}`;
}

export function DiaryPage({ route, onNavigate, onBack, registerNavigationGuard }) {
  const [diary, setDiary] = useState(readDiaries);
  const [spread, setSpread] = useState(0);
  const [notice, setNotice] = useState('');
  const titleRef = useRef(null);
  const externalChange = useRef(false);
  const editing = route.view === 'new' || route.view === 'edit';
  const entry = diary.entries.find((item) => item.id === route.entryId);
  const pages = Math.max(1, Math.ceil(diary.entries.length / 10));
  const currentSpread = Math.min(spread, pages - 1);
  const visibleEntries = diary.entries.slice(currentSpread * 10, (currentSpread + 1) * 10);
  const reload = useCallback(() => { setDiary(readDiaries()); setNotice(''); }, []);
  useEffect(() => {
    if (!notice || editing) return;
    const timeout = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice, editing]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== 'treehool.diary.v1' && event.key !== null) return;
      if (editing) { externalChange.current = true; setNotice('日记已在另一个窗口变化。请保留当前文字，再返回日记本重新打开。'); }
      else reload();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [editing, reload]);
  useEffect(() => {
    if (!editing) {
      titleRef.current?.focus({ preventScroll: true });
      if (externalChange.current) { externalChange.current = false; reload(); }
    }
  }, [editing, reload]);

  function persist(change, successText) {
    try {
      if (diary.error) throw new Error(diary.error);
      const result = change();
      const saved = saveDiary(window.localStorage, result.entries);
      if (!saved.ok) return saved;
      setDiary({ entries: result.entries, error: null });
      if (result.entry) setSpread(Math.floor(result.entries.findIndex((item) => item.id === result.entry.id) / 10));
      setNotice(successText);
      return { ok: true };
    } catch (error) { return { ok: false, error: error.message || '日记没有保存成功，请再试一次。' }; }
  }
  function assertUnchanged(id, updatedAt) {
    if (id && diary.entries.find((item) => item.id === id)?.updatedAt !== updatedAt)
      throw new Error('这篇日记已发生变化。请先保留当前文字，再返回日记本重新打开。');
  }
  function save(draft, updatedAt) {
    return persist(() => { assertUnchanged(draft.id, updatedAt); return upsertDiary(diary.entries, draft); }, '这一天，已经好好收在日记里。');
  }
  function remove(id, updatedAt) {
    return persist(() => { assertUnchanged(id, updatedAt); return { entries: deleteDiary(diary.entries, id) }; }, '日记已删除。');
  }
  function addDiary() {
    onNavigate('/diary/new');
  }

  return <main className="diary-shell">
    <div className="diary-atmosphere" aria-hidden="true" />
    <div className="diary-layout">
      {diary.error ? <div className="diary-notice diary-error" role="alert"><span>{diary.error}</span><button type="button" onClick={reload}>重试读取</button></div> : null}
      {editing && notice ? <p className="diary-notice" role="status">{notice}</p> : null}
      {editing && (route.view === 'new' || entry) ? <DiaryEditor key={entry?.id || 'new'} entry={entry} onSave={save} onDelete={remove}
        onNavigate={onNavigate} registerNavigationGuard={registerNavigationGuard} /> : editing ? <div className="diary-missing">
        <h1>这篇日记不在这里了</h1><p>它可能已被删除，回到日记本看看吧。</p>
        <button type="button" className="diary-primary" onClick={() => onNavigate('/diary')}>回到日记本</button>
      </div> : <>
        <header className="diary-topbar">
          <div>
            <button type="button" className="diary-back" onClick={onBack}><Icon name="arrow-left" />回到星光里</button>
            <h1 ref={titleRef} tabIndex={-1}>心情日记</h1>
            <p className="diary-subtitle">把今天的心事，轻轻写在这里。</p>
          </div>
          <button type="button" className="diary-primary" onClick={addDiary}><Icon name="plus" />添加日记</button>
        </header>
        {notice ? <p className="diary-notice" role="status">{notice}</p> : null}
        <div className="diary-range"><span aria-hidden="true" />{rangeLabel(visibleEntries)}<span aria-hidden="true" /></div>
        <DiaryBook entries={visibleEntries} empty={!diary.entries.length} onEdit={(id) => onNavigate(`/diary/entry/${id}`)} onAdd={addDiary} />
        <nav className="diary-pagination" aria-label="日记分页">
          <button type="button" aria-label="上一页日记" disabled={currentSpread === 0} onClick={() => setSpread((value) => value - 1)}><Icon name="chevron-left" /></button>
          <span aria-live="polite">{String(currentSpread + 1).padStart(2, '0')}<span className="diary-page-divider">/</span>{String(pages).padStart(2, '0')}</span>
          <button type="button" aria-label="下一页日记" disabled={currentSpread === pages - 1} onClick={() => setSpread((value) => value + 1)}><Icon name="chevron-right" /></button>
        </nav>
      </>}
      <p className="diary-local-note">日记保存在当前浏览器，愿每一天都被温柔收藏。</p>
    </div>
  </main>;
}
