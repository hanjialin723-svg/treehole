import { useCallback, useEffect, useState } from 'react';
import { StoryScene } from './components/StoryScene.jsx';
import { DestinationPage } from './components/DestinationPage.jsx';
import { parseRoute } from './sceneConfig.js';

export function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onRoute = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onRoute);
    return () => window.removeEventListener('hashchange', onRoute);
  }, []);
  useEffect(() => {
    document.title = route.kind === 'diary' ? '心情日记本 · 星光树洞'
      : route.kind === 'star' ? `第${route.starId}颗星 · 星光树洞` : '星光树洞 · 把心事交给星光';
  }, [route]);
  const navigate = useCallback((path) => { window.location.hash = path; }, []);
  const goHome = useCallback(() => navigate('/'), [navigate]);
  const enterDiary = useCallback(() => navigate('/diary'), [navigate]);
  return route.kind === 'scene'
    ? <StoryScene onEnter={enterDiary} onNavigate={navigate} />
    : <DestinationPage kind={route.kind} starId={route.starId} onBack={goHome} />;
}
