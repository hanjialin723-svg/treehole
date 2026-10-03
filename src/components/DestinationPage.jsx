import { useEffect, useRef } from 'react';
import '../destination.css';

const STAR_TITLES = {
  1: '第一颗星',
  2: '第二颗星',
  3: '第三颗星',
};

export function DestinationPage({ kind, starId, onBack }) {
  const headingRef = useRef(null);
  const isDiary = kind === 'diary';
  const title = isDiary ? '心情日记本' : STAR_TITLES[starId] || '一颗星';

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [kind, starId]);

  return (
    <main
      className={`destination-page ${isDiary ? 'destination-diary' : 'destination-star'}`}
      aria-labelledby="destination-title"
    >
      <div className="destination-atmosphere" aria-hidden="true" />
      <header className="destination-header">
        <p className="destination-brand">星光树洞</p>
      </header>

      <div className="destination-content">
        <div className="destination-illustration" aria-hidden="true">
          <img
            className="destination-art"
            src={isDiary ? '/art/book-open.webp' : '/art/star.webp'}
            alt=""
            draggable="false"
          />
        </div>

        <div className="destination-copy">
          {isDiary ? <p className="destination-status">即将开启</p> : null}
          <h1
            className="destination-title"
            id="destination-title"
            ref={headingRef}
            tabIndex={-1}
          >
            {title}
          </h1>
          <p className="destination-invitation">
            <span>{isDiary ? '这里，留给今天的你。' : '新的故事，正在酝酿。'}</span>
            <span>
              {isDiary
                ? '让每一种心情，都有安放的地方。'
                : '这个小小的角落，等待被你命名。'}
            </span>
          </p>
          <button className="destination-back" type="button" onClick={onBack}>
            回到星光里
          </button>
        </div>
      </div>
      <div className="destination-bottom-line" aria-hidden="true" />
    </main>
  );
}
