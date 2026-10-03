export const SCENE_ART = {
  background: '/art/background.webp', bookClosed: '/art/book-closed.webp',
  bookOpen: '/art/book-open.webp', girl: '/art/girl-sprites.webp',
  star: '/art/star.webp', light: '/art/light-path-v2.webp', paper: '/art/page-sheet.webp',
};
export const STARS = [
  { id: '1', name: '第一颗星', className: 'star-one', delay: '0ms' },
  { id: '2', name: '第二颗星', className: 'star-two', delay: '450ms' },
  { id: '3', name: '第三颗星', className: 'star-three', delay: '850ms' },
];
export const STORY_DURATION = 6800;
export const REDUCED_DURATION = 850;
// Share one active-time clock so background tabs cannot skip the story.
export function getStoryPhase(elapsed, reduced = false) {
  if (reduced) return elapsed < 450 ? 'lit' : 'entering';
  if (elapsed < 1200) return 'rising';
  if (elapsed < 1800) return 'walking';
  if (elapsed < 2560) return 'cracking';
  if (elapsed < 4800) return 'opening';
  if (elapsed < 5900) return 'lit';
  return 'entering';
}
export function parseRoute(hash) {
  const path = hash.replace(/^#/, '') || '/';
  if (path === '/diary') return { kind: 'diary' };
  const starMatch = path.match(/^\/stars\/([1-3])$/);
  return starMatch ? { kind: 'star', starId: starMatch[1] } : { kind: 'scene' };
}
