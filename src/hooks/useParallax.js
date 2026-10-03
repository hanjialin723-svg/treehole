import { useEffect } from 'react';
export function useParallax(sceneRef, enabled) {
  useEffect(() => {
    const element = sceneRef.current;
    if (!element) return;
    if (!enabled) {
      element.style.setProperty('--mouse-x', '0');
      element.style.setProperty('--mouse-y', '0');
      return;
    }
    let frame;
    let x = 0, y = 0;
    const update = () => {
      element.style.setProperty('--mouse-x', x.toFixed(3));
      element.style.setProperty('--mouse-y', y.toFixed(3));
      frame = undefined;
    };
    const onMove = (event) => {
      if (event.pointerType === 'touch') return;
      x = event.clientX / window.innerWidth - .5;
      y = event.clientY / window.innerHeight - .5;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onLeave = () => { x = 0; y = 0; if (!frame) frame = requestAnimationFrame(update); };
    element.addEventListener('pointermove', onMove, { passive: true });
    element.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerleave', onLeave);
    };
  }, [enabled, sceneRef]);
}
