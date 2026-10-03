import test from 'node:test';
import assert from 'node:assert/strict';
import { getBookLighting } from '../src/bookLighting.js';
import { STORY_DURATION, STORY_TIMING, getStoryPhase } from '../src/sceneConfig.js';

const nearly = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9,
  `expected ${actual} to be close to ${expected}`);

test('the book stays dim until the girl reaches it', () => {
  for (const time of [-100, 0, STORY_TIMING.riseEnd, STORY_TIMING.arrival - 1, STORY_TIMING.arrival]) {
    nearly(getBookLighting(time).light, 0);
  }
  assert.equal(getStoryPhase(STORY_TIMING.riseEnd), 'walking');
  assert.equal(getStoryPhase(STORY_TIMING.arrival - 1), 'walking');
  assert.equal(getStoryPhase(STORY_TIMING.arrival), 'illuminating');
  assert.ok(getBookLighting(STORY_TIMING.arrival + 100).light > 0);
});

test('yellow light grows continuously without reversal, flashing, or overshoot', () => {
  let previous = getBookLighting(STORY_TIMING.arrival).light;
  let partialSamples = 0;
  for (let time = STORY_TIMING.arrival + 20; time <= STORY_TIMING.lightEnd; time += 20) {
    const light = getBookLighting(time).light;
    assert.ok(light >= previous && light <= 1);
    assert.ok(light - previous < .05, 'light must not flash on between frames');
    if (light > 0 && light < 1) partialSamples++;
    previous = light;
  }
  assert.ok(partialSamples > 30, 'the light should brighten gradually');
  nearly(getBookLighting(STORY_TIMING.lightEnd).light, 1);
  nearly(getBookLighting(STORY_DURATION + 10000).light, 1);
});

test('the illuminated book holds before the diary transition', () => {
  assert.ok(STORY_TIMING.entering - STORY_TIMING.lightEnd >= 800,
    'leave time to see the illuminated book before departure');
  for (const time of [STORY_TIMING.lightEnd, STORY_TIMING.entering - 1]) {
    assert.equal(getStoryPhase(time), 'lit');
    nearly(getBookLighting(time).light, 1);
  }
  assert.equal(getStoryPhase(STORY_TIMING.entering), 'entering');
  assert.equal(getStoryPhase(STORY_DURATION - 1), 'entering');
});

test('reduced motion uses the fully illuminated state immediately', () => {
  for (const time of [0, 100, 850, STORY_TIMING.arrival, STORY_DURATION]) {
    nearly(getBookLighting(time, true).light, 1);
  }
});
