import { useEffect, useRef, useState } from 'react';
import { SCENE_ART, STARS } from '../sceneConfig.js';
import { useSceneAssets } from '../hooks/useSceneAssets.js';
import { useStory } from '../hooks/useStory.js';
import { useParallax } from '../hooks/useParallax.js';
import '../scene.css';

const motes = Array.from({ length: 30 }, (_, index) => ({
  left: `${10 + ((index * 37) % 83)}%`, top: `${4 + ((index * 19) % 85)}%`,
  width: `${7 + (index % 4) * 3}px`, delay: `${(index % 9) * -0.7}s`, duration: `${5 + (index % 5)}s`,
}));
const messages = {
  idle: '点击书本，走进心情日记', rising: '慢慢起身，把心事带上。',
  walking: '向着那一点温暖，走近一些。', opening: '书页轻轻打开，星光正在醒来。',
  lit: '每一种心情，都值得被温柔收藏。', entering: '让今天的故事，从这里开始。',
};

export function StoryScene({ onEnter, onNavigate }) {
  const sceneRef = useRef(null);
  const headingRef = useRef(null);
  const [systemReduced, setSystemReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [simpleMotion, setSimpleMotion] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const reduced = systemReduced || simpleMotion;
  const { status, retry } = useSceneAssets();
  const { phase, playing, begin } = useStory(onEnter, reduced);
  const illuminated = ['opening', 'lit', 'entering'].includes(phase);
  useParallax(sceneRef, !reduced && !playing);

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setSystemReduced(query.matches);
    const pausedAnimations = new Set();
    const visibility = () => {
      setHidden(document.hidden);
      if (document.hidden) {
        // Pause both keyframes and CSS transitions alongside the active-time clock.
        sceneRef.current?.getAnimations({ subtree: true }).forEach((animation) => {
          if (animation.playState === 'running') {
            pausedAnimations.add(animation);
            animation.pause();
          }
        });
      } else {
        pausedAnimations.forEach((animation) => {
          if (animation.playState === 'paused') animation.play();
        });
        pausedAnimations.clear();
      }
    };
    query.addEventListener('change', change);
    document.addEventListener('visibilitychange', visibility);
    if (window.location.hash === '#/') headingRef.current?.focus({ preventScroll: true });
    return () => {
      query.removeEventListener('change', change);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  return (
    <main className="story-scene" ref={sceneRef} data-phase={phase} data-playing={playing}
      data-lit={illuminated} data-reduced={reduced} data-hidden={hidden}
      data-ready={status === 'ready'} aria-label="星光树洞互动场景">
      <div className="scene-backdrop" aria-hidden="true" />
      <header className="scene-heading">
        <h1 ref={headingRef} tabIndex={-1}>星光树洞</h1>
        <p>把心事，轻轻交给星光。</p>
      </header>
      <button className="motion-toggle" type="button" aria-pressed={reduced}
        disabled={playing || systemReduced} onClick={() => setSimpleMotion((value) => !value)}
        title={systemReduced ? '已跟随系统的减少动态设置' : '减少视差与动画'}>
        {reduced ? '轻柔静止' : '简化动效'}
      </button>

      <div className="scene-canvas">
        <div className="world-layer">
          <img className="light-path" src={SCENE_ART.light} alt="" draggable="false" />
          <div className="book-position">
            <button type="button" className="book-button" onClick={begin}
              disabled={status !== 'ready' || playing} aria-label="打开书本，走进心情日记本"
              aria-describedby="scene-instruction">
              <img className="book-open book-aura" src={SCENE_ART.bookOpen} alt="" draggable="false" aria-hidden="true" />
              <img className="book-open" src={SCENE_ART.bookOpen} alt="" draggable="false" />
              <img className="book-closed" src={SCENE_ART.bookClosed} alt="" draggable="false" />
              <span className="book-label">心情日记本</span>
            </button>
          </div>
          <div className="girl-position" aria-hidden="true">
            <div className="girl-shadow" />
            <div className="girl-sprite" />
          </div>
          <nav className="star-navigation" aria-label="星星入口">
            {STARS.map((star) => (
              <a key={star.id} href={`#/stars/${star.id}`} className={`star-link ${star.className}`}
                style={{ '--light-delay': star.delay }} aria-label={`${star.name}，探索星星占位区域`}
                aria-disabled={status !== 'ready'} tabIndex={status !== 'ready' ? -1 : 0}
                onClick={(event) => {
                  event.preventDefault();
                  if (status === 'ready') onNavigate(`/stars/${star.id}`);
                }}>
                <span className="star-float"><img className="star-art" src={SCENE_ART.star} alt="" draggable="false" /></span>
                <span className="star-label">{star.name}</span>
              </a>
            ))}
          </nav>
        </div>
        <div className="motes-layer" aria-hidden="true">
          {motes.map((mote, index) => (
            <img key={index} className="light-mote" src={SCENE_ART.star} alt="" style={{
              left: mote.left, top: mote.top, width: mote.width,
              '--twinkle-delay': mote.delay, '--twinkle-duration': mote.duration,
            }} />
          ))}
        </div>
      </div>

      <footer className="scene-footer">
        <p id="scene-instruction" className="scene-instruction" aria-live="polite" aria-atomic="true">
          {status === 'loading' ? '正在拾起散落的星光…' : status === 'error' ? '有一束星光还没抵达。' : messages[phase]}
        </p>
        {status === 'error'
          ? <button type="button" className="retry-button" onClick={retry}>重新点亮</button>
          : <p className="scene-secondary">{playing ? '请稍候，心情日记即将开启' : '移近星星，也会有微光回应你'}</p>}
      </footer>
      <div className="scene-transition" aria-hidden="true" />
    </main>
  );
}
