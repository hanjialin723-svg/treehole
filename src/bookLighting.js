import { STORY_TIMING } from './sceneConfig.js';

// The upright book is one fixed illustration. Only its light changes after arrival.
export function getBookLighting(elapsed, reduced = false) {
  const t = reduced ? 1 : Math.max(0, Math.min(1,
    (elapsed - STORY_TIMING.arrival) / (STORY_TIMING.lightEnd - STORY_TIMING.arrival),
  ));
  return { light: t * t * (3 - 2 * t) };
}

export function applyBookLighting(element, elapsed, reduced) {
  if (!element) return;
  element.style.setProperty('--book-light', getBookLighting(elapsed, reduced).light.toFixed(4));
}
