import { useEffect, useRef, useState } from 'react';
import { inferWeather, todayISO, WEATHER_OPTIONS } from '../../diaryModel.js';
import { BookFrame } from './DiaryBook.jsx';
import { WeatherIcon, Icon } from './WeatherIcon.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';

export function DiaryEditor({ entry, onSave, onDelete, onNavigate, registerNavigationGuard }) {
  const [date, setDate] = useState(entry?.date || todayISO());
  const [content, setContent] = useState(entry?.content || '');
  const [weatherMode, setWeatherMode] = useState(entry?.weatherMode || 'auto');
  const [manualWeather, setManualWeather] = useState(entry?.weather || 'cloudy');
  const [error, setError] = useState('');
  const [pendingLeave, setPendingLeave] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const titleRef = useRef(null);
  const savedRef = useRef(false);
  const original = useRef(entry);
  const weather = weatherMode === 'auto' ? inferWeather(content) : manualWeather;
  const selected = WEATHER_OPTIONS.find((option) => option.id === weather);
  const dirty = date !== (original.current?.date || todayISO()) || content !== (original.current?.content || '')
    || weatherMode !== (original.current?.weatherMode || 'auto')
    || (weatherMode === 'manual' && manualWeather !== original.current?.weather);

  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (!dirty && !busy) return;
    return registerNavigationGuard((proceed, cancel) => {
      if (busyRef.current) { cancel?.(); return; }
      if (!savedRef.current) setPendingLeave({ proceed, cancel });
      else proceed();
    });
  }, [dirty, busy, registerNavigationGuard]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const beforeUnload = (event) => { if (!savedRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, busy]);

  async function save(event) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const result = await onSave({ id: entry?.id, date, content, weatherMode, weather }, original.current?.updatedAt);
    busyRef.current = false;
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    savedRef.current = true;
    onNavigate('/diary');
  }

  return <form className="diary-editor" onSubmit={save} aria-busy={busy}>
    <header className="diary-topbar">
      <div>
        <button type="button" className="diary-back" disabled={busy} onClick={() => onNavigate('/diary')}><Icon name="arrow-left" />回到日记本</button>
        <h1 tabIndex={-1} ref={titleRef}>{entry ? '编辑日记' : '写下今天'}</h1>
        <p className="diary-subtitle">让这一刻的心情，落在纸上。</p>
      </div>
      <button className="diary-primary" type="submit" disabled={busy}><Icon name="check" />{busy ? '正在保存……' : '保存日记'}</button>
    </header>
    {error ? <p className="diary-notice diary-error" role="alert">{error}</p> : null}
    <BookFrame className="diary-editor-book">
      <section className="diary-paper diary-writing-page" aria-label="日记正文">
        <div className="diary-editor-date">
          <label htmlFor="diary-date">日期</label>
          <input id="diary-date" type="date" required value={date} disabled={busy}
            onInput={(event) => setDate(event.currentTarget.value)} onChange={(event) => setDate(event.target.value)} />
        </div>
        <label className="diary-writing-label" htmlFor="diary-content">今天的心事</label>
        <textarea id="diary-content" placeholder="今天发生了什么？从一件小事写起吧……" required maxLength={2000} disabled={busy}
          value={content} onChange={(event) => { setContent(event.target.value); if (error) setError(''); }} />
        <div className="diary-writing-footer"><span>几句话，也是一篇日记。</span><span>{content.length} / 2000</span></div>
      </section>
      <section className="diary-paper diary-weather-page" aria-labelledby="weather-title">
        <h2 id="weather-title">今天的心情天气</h2>
        <div className="diary-weather-preview" aria-live="polite" aria-atomic="true">
          <WeatherIcon weather={weather} size={76} />
          <h3>{content.trim() || weatherMode === 'manual' ? selected.label : '等一阵心里的风'}</h3>
          <p>{content.trim() || weatherMode === 'manual' ? selected.hint : '写下几句话，让心情慢慢浮现。'}</p>
        </div>
        <button type="button" disabled={busy} className={`diary-auto-weather ${weatherMode === 'auto' ? 'is-active' : ''}`}
          aria-pressed={weatherMode === 'auto'} onClick={() => setWeatherMode('auto')}>
          <span className="diary-radio-dot" />根据文字自动生成
        </button>
        <fieldset className="diary-weather-options" disabled={busy}>
          <legend>也可以选一个更贴近自己的天气</legend>
          <div>{WEATHER_OPTIONS.map((option) => <button type="button" key={option.id}
            className={weatherMode === 'manual' && weather === option.id ? 'is-selected' : ''}
            aria-pressed={weatherMode === 'manual' && weather === option.id}
            onClick={() => { setManualWeather(option.id); setWeatherMode('manual'); }}>
            <WeatherIcon weather={option.id} size={25} /><span>{option.label}</span>
          </button>)}</div>
        </fieldset>
        <p className="diary-weather-note">天气只是心情的比喻，<br />你的感受，始终由你来定义。</p>
      </section>
    </BookFrame>
    <footer className="diary-editor-bottom">
      <span role="status">{busy ? '正在与日记本同步……' : dirty ? '尚未保存' : entry ? '已保存的日记' : '新的一页，慢慢写。'}</span>
      {entry ? <button type="button" className="diary-delete" disabled={busy} onClick={() => setDeleting(true)}><Icon name="trash" size={16} />删除这篇日记</button> : null}
    </footer>
    {pendingLeave ? <ConfirmDialog title="这页心事还没保存" confirmLabel="放弃修改" onCancel={() => { pendingLeave.cancel?.(); setPendingLeave(null); }}
      onConfirm={() => { savedRef.current = true; pendingLeave.proceed(); }}><p>继续写，或放下这次还未保存的修改。</p></ConfirmDialog> : null}
    {deleting ? <ConfirmDialog title="删除这篇日记？" confirmLabel={busy ? '正在删除……' : '删除日记'} busy={busy} destructive onCancel={() => setDeleting(false)}
      onConfirm={async () => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        const result = await onDelete(entry.id, original.current.updatedAt);
        busyRef.current = false;
        setBusy(false);
        if (!result.ok) { setError(result.error); setDeleting(false); return; }
        savedRef.current = true;
        onNavigate('/diary');
      }}><p>这篇日记会从日记本中永久删除，所有访客都将无法再查看。</p></ConfirmDialog> : null}
  </form>;
}
