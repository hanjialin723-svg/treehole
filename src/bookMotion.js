// One active-time clock drives the cover, leaves and the light admitted between them.
// The body and the left hinge never move. Angles are in degrees around that hinge.
export const BOOK_TIMING = {
  coverStart: 1800,
  coverEnd: 4700,
  pageStarts: [2080, 2320, 2560],
  pageEnds: [4340, 4570, 4800],
  settled: 4800,
};

function progress(time, start, end) {
  const t = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

export function getBookMotion(elapsed, reduced = false) {
  const cover = reduced ? 1 : progress(elapsed, BOOK_TIMING.coverStart, BOOK_TIMING.coverEnd);
  const pages = BOOK_TIMING.pageStarts.map((start, i) =>
    reduced ? 1 : progress(elapsed, start, BOOK_TIMING.pageEnds[i]),
  );
  // The innermost sheet occludes the opening until it too begins turning.
  const light = Math.sin(pages[2] * Math.PI / 2);
  return {
    coverAngle: -142 * cover,
    pageAngles: pages.map((value, i) => -(132 - i * 13) * value),
    light,
    seam: Math.sin(Math.min(1, cover / .3) * Math.PI / 2) * (1 - light),
    coverShade: .88 + .12 * Math.sin(cover * Math.PI),
  };
}

export function applyBookMotion(element, elapsed, reduced) {
  if (!element) return;
  const motion = getBookMotion(elapsed, reduced);
  element.style.setProperty('--cover-angle', `${motion.coverAngle.toFixed(3)}deg`);
  motion.pageAngles.forEach((angle, index) =>
    element.style.setProperty(`--page-${index + 1}-angle`, `${angle.toFixed(3)}deg`),
  );
  element.style.setProperty('--book-light', motion.light.toFixed(4));
  element.style.setProperty('--book-seam', motion.seam.toFixed(4));
  element.style.setProperty('--cover-shade', motion.coverShade.toFixed(4));
  // Reveal a widening diagonal band while the beam's doorway anchor stays fixed.
  element.style.setProperty('--beam-top', `${98 - motion.light * 40}%`);
  element.style.setProperty('--beam-bottom', `${18 - motion.light * 78}%`);
}
