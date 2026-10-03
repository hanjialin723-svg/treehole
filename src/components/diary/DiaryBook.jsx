import { formatDiaryDate, WEATHER_OPTIONS } from '../../diaryModel.js';
import { Icon, WeatherIcon } from './WeatherIcon.jsx';

export function BookFrame({ children, className = '' }) {
  return <div className={`diary-book ${className}`}>
    <img className="diary-book-art" src="/art/diary-spread.webp" alt="" aria-hidden="true" draggable="false" />
    <div className="diary-book-pages">{children}</div>
  </div>;
}

function EntryRow({ entry, onEdit }) {
  const date = formatDiaryDate(entry.date);
  const weather = WEATHER_OPTIONS.find((option) => option.id === entry.weather);
  return <button type="button" className="diary-entry" onClick={() => onEdit(entry.id)}
    aria-label={`${date.full}，${entry.content.slice(0, 28)}，${weather.label}，编辑日记`}>
    <time className="diary-entry-date" dateTime={entry.date} title={date.full}>{entry.date.slice(5).replace('-', '.')}</time>
    <span className="diary-entry-excerpt">{entry.content}</span>
    <span className="diary-entry-weather"><WeatherIcon weather={entry.weather} size={28} /><span>{weather.label}</span></span>
  </button>;
}

export function DiaryBook({ entries, onEdit, onAdd, empty }) {
  return <BookFrame>
    {[0, 1].map((side) => <section className="diary-paper" key={side} aria-label={side ? '右页日记' : '左页日记'}>
      <div className="diary-column-head" aria-hidden="true">
        <span>日期</span><span>今天的心事</span><span>心情天气</span>
      </div>
      {empty ? <div className={`diary-empty diary-empty-${side}`}>
        {side === 0 ? <>
          <Icon name="pen" size={34} />
          <h2>第一页，留给今天的你</h2>
          <p>不必写得很长，<br />几句话，也值得留下。</p>
          <button className="diary-paper-button" type="button" onClick={onAdd}>写第一篇日记<Icon name="chevron-right" size={16} /></button>
        </> : <>
          <div className="diary-empty-weather"><WeatherIcon weather="sunny" size={40} /><WeatherIcon weather="cloudy" size={40} /><WeatherIcon weather="rainy" size={40} /></div>
          <p>晴天或雨天，<br />每一种心情都有它的位置。</p>
          <span className="diary-empty-note">写下心事，便会有天气回应。</span>
        </>}
      </div> : <div className="diary-entries">
        {Array.from({ length: 5 }, (_, index) => {
          const entry = entries[side * 5 + index];
          return entry ? <EntryRow key={entry.id} entry={entry} onEdit={onEdit} />
            : <div className="diary-blank-line" key={`blank-${index}`} aria-hidden="true" />;
        })}
      </div>}
    </section>)}
  </BookFrame>;
}
