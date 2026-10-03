import { useEffect, useState } from 'react';
import { SCENE_ART } from '../sceneConfig.js';
export function useSceneAssets() {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('loading');
  useEffect(() => {
    let current = true;
    setStatus('loading');
    Promise.all(Object.values(SCENE_ART).map((src) => new Promise((resolve, reject) => {
      const picture = new Image();
      picture.onload = () => picture.decode().then(resolve, reject);
      picture.onerror = reject;
      picture.src = src;
    }))).then(() => current && setStatus('ready'), () => current && setStatus('error'));
    return () => { current = false; };
  }, [attempt]);
  return { status, retry: () => setAttempt((value) => value + 1) };
}
