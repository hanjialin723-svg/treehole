import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOK_TIMING, getBookMotion } from '../src/bookMotion.js';
import { STORY_DURATION, getStoryPhase } from '../src/sceneConfig.js';

const nearly = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9,
  `expected ${actual} to be close to ${expected}`);

test('cover and pages stay shut until their individual start times', () => {
  for (const time of [-100, 0, BOOK_TIMING.coverStart]) {
    const motion = getBookMotion(time);
    nearly(motion.coverAngle, 0);
    motion.pageAngles.forEach((angle) => nearly(angle, 0));
    nearly(motion.light, 0);
  }
  BOOK_TIMING.pageStarts.forEach((start, index) => {
    nearly(getBookMotion(start).pageAngles[index], 0);
    assert.ok(getBookMotion(start + 100).pageAngles[index] < 0);
    assert.ok(getBookMotion(start).coverAngle < 0);
  });
});

test('each leaf stops at its endpoint and remains visibly fanned open', () => {
  const settled = getBookMotion(BOOK_TIMING.settled);
  nearly(getBookMotion(BOOK_TIMING.coverEnd).coverAngle, settled.coverAngle);
  BOOK_TIMING.pageEnds.forEach((end, index) => {
    nearly(getBookMotion(end).pageAngles[index], settled.pageAngles[index]);
  });
  assert.deepEqual(getBookMotion(STORY_DURATION + 10000), settled);
  const angles = [settled.coverAngle, ...settled.pageAngles];
  angles.forEach((angle, index) => {
    assert.ok(angle < -90 && angle > -180, 'opened leaf must reveal its back face');
    if (index) assert.ok(angle > angles[index - 1], 'leaves should remain separate');
  });
});

test('opening and yellow light progress continuously without reversal or overshoot', () => {
  let previous = getBookMotion(0);
  let partialLightSamples = 0;
  for (let time = 20; time <= BOOK_TIMING.settled; time += 20) {
    const motion = getBookMotion(time);
    assert.ok(motion.coverAngle <= previous.coverAngle);
    motion.pageAngles.forEach((angle, index) => assert.ok(angle <= previous.pageAngles[index]));
    assert.ok(motion.light >= previous.light && motion.light <= 1);
    assert.ok(motion.light - previous.light < .05, 'light must not flash on between frames');
    if (motion.light > 0 && motion.light < 1) partialLightSamples++;
    previous = motion;
  }
  assert.ok(partialLightSamples > 30, 'light should ramp over a substantial interval');
  nearly(previous.light, 1);
});

test('the fully lit open pose holds for at least a second before departure', () => {
  const settled = getBookMotion(BOOK_TIMING.settled);
  assert.equal(getStoryPhase(BOOK_TIMING.settled), 'lit');
  assert.equal(getStoryPhase(BOOK_TIMING.settled + 1000), 'lit');
  assert.deepEqual(getBookMotion(BOOK_TIMING.settled + 1000), settled);
  assert.equal(getStoryPhase(STORY_DURATION - 1), 'entering');
});

test('a thin seam shines before the inner pages expose the main light', () => {
  nearly(getBookMotion(BOOK_TIMING.coverStart).seam, 0);
  const cracked = getBookMotion(BOOK_TIMING.pageStarts[2] - 1);
  assert.ok(cracked.seam > 0 && cracked.seam <= 1);
  nearly(cracked.light, 0);
  nearly(getBookMotion(BOOK_TIMING.settled).seam, 0);
});

test('reduced motion selects the same fully open and illuminated pose immediately', () => {
  const settled = getBookMotion(BOOK_TIMING.settled);
  for (const time of [0, 100, 850, BOOK_TIMING.coverStart, STORY_DURATION]) {
    assert.deepEqual(getBookMotion(time, true), settled);
  }
});
