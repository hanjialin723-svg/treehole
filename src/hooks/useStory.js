import { useCallback, useEffect, useRef, useState } from 'react';
import { getStoryPhase, REDUCED_DURATION, STORY_DURATION } from '../sceneConfig.js';
export function useStory(onComplete, reduced, onFrame) {
  const [phase, setPhase] = useState('idle');
  const [playing, setPlaying] = useState(false);
  const lock = useRef(false);
  const reducedRef = useRef(reduced);
  useEffect(() => { reducedRef.current = reduced; }, [reduced]);
  const begin = useCallback(() => {
    if (lock.current) return;
    lock.current = true;
    setPhase(reduced ? 'lit' : 'rising');
    setPlaying(true);
  }, [reduced]);
  useEffect(() => {
    if (!playing) return;
    let frame, previous;
    let elapsed = 0;
    function tick(now) {
      if (previous !== undefined && !document.hidden) elapsed += now - previous;
      previous = now;
      const duration = reducedRef.current ? REDUCED_DURATION : STORY_DURATION;
      onFrame?.(Math.min(elapsed, duration), reducedRef.current);
      if (elapsed >= duration) { onComplete(); return; }
      setPhase(getStoryPhase(elapsed, reducedRef.current));
      frame = requestAnimationFrame(tick);
    }
    const visibility = () => { previous = undefined; };
    document.addEventListener('visibilitychange', visibility);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [onComplete, playing, onFrame]);
  return { phase, playing, begin };
}
