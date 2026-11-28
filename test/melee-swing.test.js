'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const E = require('../adventure/engine.js');

function fakeContext(canvas) {
  const gradient = { addColorStop() {} };
  const calls = [];
  const ctx = new Proxy({ canvas }, {
    get(target, prop) {
      if (prop === 'canvas') return canvas;
      if (prop === 'calls') return calls;
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient' || prop === 'createPattern') return () => gradient;
      if (prop === 'measureText') return () => ({ width: 12 });
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (prop === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      if (typeof prop === 'symbol') return undefined;
      if (prop in target) return target[prop];
      return (...args) => {
        calls.push({ method: prop, args: args.slice(), fill: target.fillStyle, stroke: target.strokeStyle });
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
  return ctx;
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

const blitIds = [];
global.AdventureSprites = require('../adventure/sprites.js');
const realBlit = global.AdventureSprites.blit;
global.AdventureSprites.blit = function (ctx, id) {
  blitIds.push(id);
  return realBlit.apply(this, arguments);
};
require('../adventure/renderer.js');
const R = global.AdventureRenderer;

function quietRoom() {
  const state = E.create({ mode: 'story', players: 2, seed: 4, mission: 'ember' });
  state.enemies.forEach(enemy => { enemy.hp = 0; enemy.dead = true; });
  state.players.p1.x = 420;
  state.players.p1.y = 300;
  state.players.p1.facing = 0.15;
  state.players.p1.weapon = 'blade';
  state.players.p1.activeSlot = 'melee';
  state.players.p1.weapons.melee = 'blade';
  state.players.p1.guarding = false;
  state.players.p1.moving = false;
  state.players.p1.vx = 0;
  state.players.p1.vy = 0;
  state.players.p2.x = 500;
  state.players.p2.y = 340;
  state.players.p2.weapon = 'pistol';
  state.players.p2.facing = -0.4;
  return state;
}

function draw(state, meleeTime) {
  state.players.p1.meleeTime = meleeTime;
  blitIds.length = 0;
  const canvas = fakeCanvas(960, 600);
  const ctx = canvas.getContext('2d');
  R.draw(ctx, state, { localId: 'p1', now: 2400, reducedMotion: true });
  return { calls: ctx.calls, blits: blitIds.slice() };
}

test('a knife swing changes pose across wind-up, strike, and recovery', () => {
  const wind = R.meleeSwing('blade', 0.15, false);
  const strike = R.meleeSwing('blade', 0.08, false);
  const recover = R.meleeSwing('blade', 0.02, false);
  const ready = R.meleeSwing('blade', 0, false);
  assert.equal(wind.phase, 'windup');
  assert.equal(strike.phase, 'strike');
  assert.equal(recover.phase, 'recover');
  assert.equal(ready.phase, 'ready');
  assert.ok(wind.angle < -0.4, 'the knife cocks back before the cut');
  assert.ok(strike.angle > 0.5, 'the knife sweeps past the facing');
  assert.ok(recover.angle > 0 && recover.angle < strike.angle, 'the knife comes back down');
  assert.equal(ready.angle, 0);
  assert.notEqual(wind.lean, strike.lean);
  assert.notEqual(strike.reach, wind.reach);
  assert.equal(wind.trail, 0);
  assert.ok(strike.trail > 0.5);
  const guard = R.meleeSwing('blade', 0.1, true);
  assert.equal(guard.phase, 'guard');
  assert.ok(guard.angle < 0);
});

test('the renderer does not stamp a frozen knife, traveler, or Ahe sheet', () => {
  const state = quietRoom();
  const wind = draw(state, 0.15);
  const strike = draw(state, 0.08);
  const ready = draw(state, 0);
  for (const frame of [wind, strike, ready]) {
    assert.equal(frame.blits.includes('weapon-knife'), false);
    assert.equal(frame.blits.includes('traveler'), false);
    assert.equal(frame.blits.includes('ahe'), false);
    assert.ok(frame.blits.includes('weapon-pistol'), 'the partner pistol may stay on its sheet');
  }
  const rotates = frame => frame.calls.filter(call => call.method === 'rotate').map(call => call.args[0]);
  assert.notDeepEqual(rotates(wind), rotates(strike));
  assert.notDeepEqual(rotates(strike), rotates(ready));
  const slash = frame => frame.calls.filter(call => call.method === 'arc' && String(call.stroke).includes('247,229,184'));
  assert.equal(slash(wind).length, 0, 'wind-up has not released the cut');
  assert.ok(slash(strike).length >= 1, 'the strike paints a moving arc');
  assert.equal(slash(ready).length, 0);
});

test('walking and idle are not a single frozen offset', () => {
  const planted = R.actorMotion(0, true, 12, false);
  const stepped = R.actorMotion(90, true, 12, false);
  assert.notEqual(Math.round(planted.step * 10), Math.round(stepped.step * 10));
  const idleA = R.actorMotion(0, false, 12, false);
  const idleB = R.actorMotion(500, false, 12, false);
  assert.notEqual(Math.round(idleA.breath * 10), Math.round(idleB.breath * 10));
  assert.ok(Math.abs(idleB.breath) > 0.2);
});

test('a blade attack opens a decaying melee window', () => {
  const state = E.create({ mode: 'story', players: 1, seed: 9, mission: 'ember' });
  const player = state.players.p1;
  player.weapon = 'blade';
  player.activeSlot = 'melee';
  player.weapons.melee = 'blade';
  player.fireCd = 0;
  player.guarding = false;
  E.step(state, { p1: { mx: 0, my: 0, aimX: player.x + 80, aimY: player.y, shoot: true } }, 1 / 60);
  assert.ok(player.meleeTime > 0.12);
  const early = R.meleeSwing('blade', player.meleeTime, false);
  const opened = player.meleeTime;
  E.step(state, { p1: { mx: 0, my: 0, aimX: player.x + 80, aimY: player.y, shoot: false } }, 1 / 60);
  assert.ok(player.meleeTime < opened);
  assert.ok(player.meleeTime > 0);
  const later = R.meleeSwing('blade', player.meleeTime, false);
  assert.notEqual(early.phase + ':' + early.angle.toFixed(3), later.phase + ':' + later.angle.toFixed(3));
});

test('the opening readout says 破绽暴露', () => {
  const source = fs.readFileSync(path.join(__dirname, '../adventure/app.js'), 'utf8');
  assert.match(source, /破绽暴露 \$\{opening\.weakTime/);
  assert.equal(source.includes('破绽暴漏'), false);
  assert.equal(source.includes('破竭'), false);
});
