'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../adventure/engine.js');

function canvas(width = 960, height = 600) {
  const surface = { width, height, calls: [] }, gradient = { addColorStop() {} };
  surface.getContext = () => new Proxy({ canvas: surface, globalAlpha: 1 }, {
    get(target, name) {
      if (name in target) return target[name];
      if (name === 'measureText') return text => ({ width: String(text).length * 7 });
      if (name === 'createLinearGradient' || name === 'createRadialGradient' || name === 'createPattern') return () => gradient;
      return (...args) => surface.calls.push({ name, args, color: target.fillStyle });
    },
    set(target, name, value) { target[name] = value; return true; }
  });
  return surface;
}

global.window = global;
global.document = { createElement: () => canvas() };
require('../adventure/renderer.js');
const R = global.AdventureRenderer;

function paint(state, id) {
  const view = E.viewForPlayer(state, id);
  const surface = canvas(390, 600);
  const before = JSON.stringify(view);
  R.draw(surface.getContext('2d'), view, { now: 1000, localId: id, reducedMotion: true,
    view: { x: 185, y: 0, w: 390, h: 600 }, mapScale: .78, mapAnchorX: 380, mapAnchorY: 14 });
  assert.equal(JSON.stringify(view), before, 'painting must not change the simulation');
  return surface.calls;
}

function labels(calls) { return calls.filter(call => call.name === 'fillText'); }

test('rescue portrait displays sequenced water warnings on the actual canal band', () => {
  const s = E.create({ mode: 'rescue', players: 1, seed: 62 });
  assert.equal(E.enterRoom(s, 1, true, 'p1'), true);
  s.players.p1.x = 325;
  for (const [phase, water, color, text] of [
    ['search', 4, '#254650', null],
    ['escort', 1, '#254650', '退潮'],
    ['escort', 2.5, '#3f6267', '即将泄洪'],
    ['escort', 3.6, '#2f7587', '泄洪中']
  ]) {
    Object.assign(s.rescue, { phase, water });
    const calls = paint(s, 'p1');
    const band = calls.find(call => call.name === 'fillRect' && call.color === color);
    assert.ok(band);
    assert.deepEqual(band.args, [380, 70, 200, 460]);
    const waterText = labels(calls).filter(call => ['退潮', '即将泄洪', '泄洪中'].includes(call.args[0]));
    assert.deepEqual(waterText.map(call => call.args[0]), text ? [text] : []);
  }
});

test('only the local room draws the wounded actor at its synchronized position', () => {
  const s = E.create({ mode: 'rescue', players: 2, seed: 63 });
  assert.equal(E.enterRoom(s, 2, true, 'p2'), true);
  s.players.p2.x = s.rescue.x - 40;
  s.players.p2.y = s.rescue.y;
  const local = labels(paint(s, 'p2')).find(call => call.args[0] === 'E · 扶起伤员');
  assert.ok(local);
  assert.equal(local.args[1], s.rescue.x);
  const remote = labels(paint(s, 'p1')).map(call => call.args[0]);
  assert.ok(remote.includes('撤离站'));
  assert.ok(remote.includes('旧渠近路'));
  assert.ok(remote.includes('轨道绕行'));
  assert.ok(!remote.includes('伤员') && !remote.includes('E · 扶起伤员'));
});
