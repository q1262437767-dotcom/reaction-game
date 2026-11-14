'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../adventure/engine.js');
const C = require('../adventure/campaign.js');

function fakeContext(canvas) {
  const gradient = { addColorStop() {} };
  return new Proxy({ canvas }, {
    get(target, prop) {
      if (prop === 'canvas') return canvas;
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient' || prop === 'createPattern') return () => gradient;
      if (prop === 'measureText') return () => ({ width: 12 });
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (typeof prop === 'symbol') return undefined;
      if (prop in target) return target[prop];
      return () => {};
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
}

function fakeCanvas(width, height) {
  const canvas = { width: width || 960, height: height || 600, style: {} };
  canvas.getContext = () => fakeContext(canvas);
  return canvas;
}

global.window = global;
global.document = {
  createElement(tag) {
    return tag === 'canvas' ? fakeCanvas(960, 600) : { style: {}, width: 0, height: 0, getContext() { return fakeContext(this); } };
  }
};
global.performance = global.performance || { now: () => 0 };
require('../adventure/renderer.js');
const R = global.AdventureRenderer;

function step(state, frames) {
  for (let i = 0; i < frames; i += 1) {
    E.step(state, {
      p1: { mx: i % 10 < 5 ? 1 : -0.3, my: 0.2, aimX: 480, aimY: 300, shoot: i % 4 === 0 }
    }, 1 / 60);
    if (state.status !== 'playing') break;
  }
}

function visit(label, state) {
  const rooms = state.rooms || [];
  assert.ok(rooms.length > 0, label + ' has rooms');
  const ctx = fakeCanvas(960, 600).getContext('2d');
  for (let index = 0; index < rooms.length; index += 1) {
    E.enterRoom(state, index);
    step(state, 2);
    assert.doesNotThrow(() => R.draw(ctx, state, { localId: 'p1', now: 1000, reducedMotion: true }), label + ' room ' + index);
    assert.doesNotThrow(() => R.draw(ctx, state, { localId: 'p1', now: 1100, view: { x: 0, y: 0, w: 440, h: 600 } }), label + ' cropped ' + index);
  }
}

test('drawing every mission room does not throw', () => {
  const missions = [
    ...C.MISSIONS.map((mission) => ({ mode: 'story', mission: mission.id })),
    ...C.CHAPTERS.map((mission) => ({ mode: 'chapter', mission: mission.id })),
    ...C.SECRETS.map((mission) => ({ mode: 'chapter', mission: mission.id }))
  ];
  for (const spec of missions) {
    const state = E.create({ mode: spec.mode, players: 1, seed: 1, mission: spec.mission, difficulty: 1 });
    visit(spec.mission, state);
  }
  visit('random', E.create({ mode: 'random', players: 1, seed: 3, mission: 'ember', difficulty: 1 }));
  visit('relay', E.create({ mode: 'relay', players: 1, seed: 4 }));
  visit('hunt', E.create({ mode: 'hunt', players: 1, seed: 5 }));
  const ctx = fakeCanvas(960, 600).getContext('2d');
  assert.doesNotThrow(() => R.preview(ctx, { now: 0, reducedMotion: true, lit: 1, chapter1: true }));
  assert.doesNotThrow(() => R.draw(ctx, null));
});
