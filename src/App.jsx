import { useCallback, useEffect, useRef, useState } from 'react';
import { StoryScene } from './components/StoryScene.jsx';
import { DestinationPage } from './components/DestinationPage.jsx';
import { DiaryPage } from './components/diary/DiaryPage.jsx';
import { parseRoute } from './sceneConfig.js';

export function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  const currentHash = useRef(window.location.hash || '#/');
  const historyIndex = useRef(window.history.state?.treehoolIndex ?? 0);
  const navigationGuard = useRef(null);
  const commitRoute = useCallback((hash, push = false) => {
    if (push && window.location.hash !== hash) {
      window.history.pushState({ treehoolIndex: historyIndex.current + 1 }, '', hash);
    }
    historyIndex.current = window.history.state?.treehoolIndex ?? historyIndex.current;
    currentHash.current = hash;
    setRoute(parseRoute(hash));
  }, []);
  const requestRoute = useCallback((hash, fromHistory = false) => {
    if (hash === currentHash.current) return;
    if (navigationGuard.current) {
      const targetIndex = window.history.state?.treehoolIndex;
      const restore = () => {
        if (!fromHistory) return;
        if (typeof targetIndex === 'number' && targetIndex !== historyIndex.current) {
          window.history.go(historyIndex.current - targetIndex);
        } else window.history.replaceState({ treehoolIndex: historyIndex.current }, '', currentHash.current);
      };
      navigationGuard.current(() => commitRoute(hash, !fromHistory), restore);
    } else commitRoute(hash, !fromHistory);
  }, [commitRoute]);
  const registerNavigationGuard = useCallback((guard) => {
    navigationGuard.current = guard;
    return () => { if (navigationGuard.current === guard) navigationGuard.current = null; };
  }, []);
  useEffect(() => {
    window.history.replaceState({ ...window.history.state, treehoolIndex: historyIndex.current }, '', window.location.href);
    const onRoute = () => requestRoute(window.location.hash || '#/', true);
    window.addEventListener('hashchange', onRoute);
    return () => window.removeEventListener('hashchange', onRoute);
  }, [requestRoute]);
  useEffect(() => {
    document.title = route.kind === 'diary' ? '心情日记本 · 星光树洞'
      : route.kind === 'star' ? `第${route.starId}颗星 · 星光树洞` : '星光树洞 · 把心事交给星光';
  }, [route]);
  const navigate = useCallback((path) => requestRoute(`#${path}`), [requestRoute]);
  const goHome = useCallback(() => navigate('/'), [navigate]);
  const enterDiary = useCallback(() => navigate('/diary'), [navigate]);
  return route.kind === 'scene'
    ? <StoryScene onEnter={enterDiary} onNavigate={navigate} />
    : route.kind === 'diary'
      ? <DiaryPage route={route} onNavigate={navigate} onBack={goHome} registerNavigationGuard={registerNavigationGuard} />
      : <DestinationPage kind={route.kind} starId={route.starId} onBack={goHome} />;
}
