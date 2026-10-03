import { useCallback, useEffect, useRef, useState } from 'react';
import { inferWeather, loadDiary, todayISO } from '../../diaryModel.js';
import { deleteRemoteDiary, importDiaries, listDiaries, saveRemoteDiary } from '../../diaryApi.js';
import { DiaryBook } from './DiaryBook.jsx';
import { DiaryEditor } from './DiaryEditor.jsx';
import { Icon } from './WeatherIcon.jsx';
import '../../diary.css';

function readLegacyDiaries() {
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
  const [diary, setDiary] = useState({ entries: [], error: null, loading: true });
  const [legacy, setLegacy] = useState(readLegacyDiaries);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [editorSession, setEditorSession] = useState({ id: null, entry: null });
  const requestVersion = useRef(0);
  const [spread, setSpread] = useState(0);
  const [notice, setNotice] = useState('');
  const titleRef = useRef(null);
  const editing = route.view === 'new' || route.view === 'edit';
  const entry = diary.entries.find((item) => item.id === route.entryId);
  // Keep the opened version until the editor is left. An in-flight refresh must
  // not replace the draft or unmount it when another visitor deletes the entry.
  const editorId = route.view === 'edit' ? route.entryId : null;
  if (editorSession.id !== editorId || (editorId && !editorSession.entry && entry)) {
    setEditorSession({ id: editorId, entry: entry || null });
  }
  const editorEntry = editorSession.id === editorId ? editorSession.entry || entry : entry;
  const pages = Math.max(1, Math.ceil(diary.entries.length / 10));
  const currentSpread = Math.min(spread, pages - 1);
  const visibleEntries = diary.entries.slice(currentSpread * 10, (currentSpread + 1) * 10);
  const reload = useCallback(async (signal) => {
    const version = ++requestVersion.current;
    try {
      const result = await listDiaries(signal);
      if (!signal?.aborted && version === requestVersion.current) setDiary({ entries: result.entries, error: null, loading: false });
    } catch (error) {
      if (!signal?.aborted && version === requestVersion.current) setDiary((previous) => ({ ...previous, error: error.message, loading: false }));
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    reload(controller.signal);
    return () => { controller.abort(); requestVersion.current++; };
  }, [reload]);
  useEffect(() => {
    if (!notice || editing) return;
    const timeout = window.setTimeout(() => setNotice(''), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice, editing]);
  useEffect(() => {
    if (editing) return;
    titleRef.current?.focus({ preventScroll: true });
    const refresh = () => { if (document.visibilityState === 'visible') reload(); };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [editing, reload]);

  async function save(draft, updatedAt) {
    try {
      const { entry: saved } = await saveRemoteDiary(draft, updatedAt);
      requestVersion.current++;
      setDiary((previous) => ({ entries: [...previous.entries.filter((item) => item.id !== saved.id), saved].sort((a, b) => b.date.localeCompare(a.date)), error: null, loading: false }));
      setSpread(0);
      setNotice('这一天，已经好好收在日记里。');
      return { ok: true };
    } catch (error) { return { ok: false, error: error.message }; }
  }
  async function remove(id, updatedAt) {
    try {
      await deleteRemoteDiary(id, updatedAt);
      requestVersion.current++;
      setDiary((previous) => ({ entries: previous.entries.filter((item) => item.id !== id), error: null, loading: false }));
      setNotice('日记已删除。');
      return { ok: true };
    } catch (error) { return { ok: false, error: error.message }; }
  }
  const legacyPending = legacy.entries.filter((old) => !diary.entries.some((item) => item.date === old.date && item.content === old.content.trim() && item.weatherMode === old.weatherMode && item.weather === (old.weatherMode === 'auto' ? inferWeather(old.content) : old.weather)));
  async function importLegacy() {
    if (importing) return;
    setImporting(true);
    setImportError('');
    try {
      const result = await importDiaries(legacy.entries);
      requestVersion.current++;
      setLegacy({ entries: [], error: null });
      setNotice(`已导入 ${result.imported} 篇日记，浏览器中的原件仍然保留。`);
      // Fetch again: another visitor may have saved after the import snapshot.
      await reload();
    } catch (error) { setImportError(error.message); }
    finally { setImporting(false); }
  }
  function addDiary() {
    onNavigate('/diary/new');
  }

  return <main className="diary-shell">
    <div className="diary-atmosphere" aria-hidden="true" />
    <div className="diary-layout">
      {diary.error ? <div className="diary-notice diary-error" role="alert"><span>{diary.error}</span><button type="button" onClick={() => reload()}>重试读取</button></div> : null}
      {editing && notice ? <p className="diary-notice" role="status">{notice}</p> : null}
      {diary.loading ? <div className="diary-missing" role="status"><h1>正在取出你的日记……</h1></div> : editing && (route.view === 'new' || editorEntry) ? <DiaryEditor key={editorEntry?.id || 'new'} entry={editorEntry} onSave={save} onDelete={remove}
        onNavigate={onNavigate} registerNavigationGuard={registerNavigationGuard} /> : editing ? <div className="diary-missing">
        <h1>{diary.error ? '暂时无法打开日记' : '这篇日记不在这里了'}</h1><p>{diary.error ? '请恢复连接后重试，已保存的日记仍在服务器。' : '它可能已被删除，回到日记本看看吧。'}</p>
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
        {legacyPending.length && !diary.error ? <div className="diary-import">
          <span>发现此浏览器中有 {legacyPending.length} 篇旧日记，可以收进现在的日记本。</span>
          <button type="button" disabled={importing} onClick={importLegacy}>{importing ? '正在导入……' : '导入旧日记'}</button>
        </div> : null}
        {importError ? <p className="diary-notice diary-error" role="alert">{importError}</p> : null}
        {legacy.error ? <p className="diary-notice diary-error" role="alert">浏览器中的旧日记暂时无法读取，原数据已保留。{legacy.error}</p> : null}
        <div className="diary-range"><span aria-hidden="true" />{rangeLabel(visibleEntries)}<span aria-hidden="true" /></div>
        <DiaryBook entries={visibleEntries} empty={!diary.entries.length && !diary.error} onEdit={(id) => onNavigate(`/diary/entry/${id}`)} onAdd={addDiary} />
        <nav className="diary-pagination" aria-label="日记分页">
          <button type="button" aria-label="上一页日记" disabled={currentSpread === 0} onClick={() => setSpread((value) => value - 1)}><Icon name="chevron-left" /></button>
          <span aria-live="polite">{String(currentSpread + 1).padStart(2, '0')}<span className="diary-page-divider">/</span>{String(pages).padStart(2, '0')}</span>
          <button type="button" aria-label="下一页日记" disabled={currentSpread === pages - 1} onClick={() => setSpread((value) => value + 1)}><Icon name="chevron-right" /></button>
        </nav>
      </>}
      <p className="diary-local-note">日记保存在服务器，当前为所有访客共用的日记本。</p>
    </div>
  </main>;
}
