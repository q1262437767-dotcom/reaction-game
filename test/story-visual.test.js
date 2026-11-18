'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../adventure/engine.js');

// Record actual renderer output, including text and deck geometry. This checks
// that the new drawing routines are reached; it is not a screenshot comparison.
function canvas(width = 960, height = 600) {
  const result = { width, height, calls: [] }, gradient = { addColorStop() {} };
  result.getContext = () => new Proxy({ canvas: result }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') return text => ({ width: String(text).length * 7 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createPattern') return () => gradient;
      if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return (...args) => result.calls.push({ method: key, args, color: target.fillStyle });
    },
    set(target, key, value) { target[key] = value; return true; }
  });
  return result;
}
const context = { window: {}, AdventureEngine: E,
  document: { createElement: () => canvas() }, performance: { now: () => 1000 } };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../adventure/story-draw.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../adventure/renderer.js'), 'utf8'), context);
const renderer = context.window.AdventureRenderer;
function draw(state, options = {}) {
  const before = JSON.stringify(state), target = canvas();
  renderer.draw(target.getContext('2d'), state, { now: 1000, localId: 'p1', reducedMotion: true, ...options });
  assert.equal(JSON.stringify(state), before, 'rendering never changes the host state');
  return target.calls;
}
function words(calls) { return calls.filter(call => call.method === 'fillText').map(call => call.args[0]); }
function state(id) { return E.create({ mode: 'chapter', mission: id, players: 1, seed: 60 }); }

test('the core cart appears only in its own room and displays its real movement and damage', () => {
  const s = state('chapter4_2');
  assert.ok(words(draw(s)).includes('运芯车 · 停车'));
  s.chapter.clues.push('rolling'); s.chapter.cartX = 340;
  assert.ok(words(draw(s)).includes('运芯车 · 行驶中'));
  s.chapter.cartRoom = 1;
  assert.equal(words(draw(s)).some(word => word.startsWith('运芯车 ·')), false);
  E.enterRoom(s, 4, true); s.chapter.cartRoom = 4; s.chapter.cartX = 500; s.chapter.pulse = 4.8;
  assert.ok(words(draw(s)).includes('运芯车 · 受热'));
  E.enterRoom(s, 5, true); s.chapter.cartRoom = 5; s.chapter.cartX = 680;
  assert.ok(words(draw(s)).includes('运芯车 · 已停靠'));
  s.chapter.cartHp = 0;
  assert.ok(words(draw(s)).includes('运芯车 · 损坏'));
});

test('canal decks use synchronized box coordinates and remain below actors', () => {
  const s = state('chapter3'); E.enterRoom(s, 1, true);
  s.props = [420, 480, 540].map((x, i) => ({ id: 'story-float-' + i, kind: 'crate', x, y: 300, r: 20, hp: 3 }));
  s.chapter.water = 1; s.players.p1.x = 480; s.players.p1.y = 300;
  const calls = draw(s);
  const decks = calls.filter(call => call.method === 'fillRect' && call.color === '#94754b' && call.args[2] === 62 && call.args[3] === 72);
  assert.deepEqual(decks.map(call => call.args.slice(0, 2)), [[389, 264], [449, 264], [509, 264]]);
  const dry = { ...s, chapter: { ...s.chapter, water: 0 }, props: s.props.map(p => ({ ...p, y: 430 })) };
  const lowDecks = draw(dry).filter(call => call.method === 'fillRect' && call.color === '#94754b' && call.args[2] === 62);
  assert.equal(lowDecks.length, 3);
  assert.ok(lowDecks.every(call => call.args[1] === 394));
});

test('later chapter allies are visible in their room and disappear when working elsewhere', () => {
  const s = state('chapter3_3');
  assert.ok(s.railAlly);
  const hasActorReadout = calls => calls.some(call => call.method === 'fillRect' && call.color === '#172936da' && call.args[2] === 38 && call.args[3] === 13);
  assert.ok(hasActorReadout(draw(s)));
  s.railAlly.roomIndex = 1;
  assert.equal(hasActorReadout(draw(s)), false);
  E.enterRoom(s, 1, true); s.railAlly.roomIndex = 1;
  assert.ok(hasActorReadout(draw(s)));
  s.railAlly.downed = true;
  assert.ok(words(draw(s)).includes('阿禾 · 倒地'));
});

test('water and pulse tints follow the current room instead of the shared chapter alone', () => {
  const canal = state('chapter3'); canal.chapter.water = 2;
  assert.equal(draw(canal).some(call => call.method === 'fillRect' && call.color === '#1c6e8a55'), false);
  E.enterRoom(canal, 2, true);
  assert.ok(draw(canal).some(call => call.method === 'fillRect' && call.color === '#1c6e8a55'));
  const train = state('chapter4_2'); train.chapter.pulse = 4.5;
  assert.equal(draw(train).some(call => call.method === 'fillRect' && call.color === '#ff6a3a'), false);
  E.enterRoom(train, 1, true);
  assert.ok(draw(train).some(call => call.method === 'fillRect' && call.color === '#ff6a3a'));
  train.runBuffs.push('pulsering');
  assert.equal(draw(train).some(call => call.method === 'fillRect' && call.color === '#ff6a3a'), false);
});

test('story slashes and hooks draw the reach and angle used by the attack', () => {
  const s = state('chapter3_4'); E.enterRoom(s, 2, true);
  const surveyor = s.enemies.find(e => e.kind === 'surveyor');
  Object.assign(surveyor, { attack: 'hook', windup: .35, facing: Math.PI });
  assert.ok(draw(s).some(call => call.method === 'arc' &&
    call.args[0] === surveyor.x && call.args[1] === surveyor.y && call.args[2] === 220 &&
    Math.abs(call.args[4] - call.args[3] - 1.1) < .001));
  const finale = state('chapter5_2');
  const hengshi = finale.enemies.find(e => e.kind === 'wardenblade');
  Object.assign(hengshi, { attack: 'slash', windup: .32, facing: Math.PI });
  assert.ok(draw(finale).some(call => call.method === 'arc' && call.args[0] === hengshi.x &&
    call.args[2] === hengshi.r + finale.players.p1.r + 30 &&
    Math.abs(call.args[4] - call.args[3] - 1.8) < .001));
});

test('a cropped-incoming hook gets a visible edge warning and disappears when turned away', () => {
  const s = state('chapter3_4'); E.enterRoom(s, 2, true);
  const player = s.players.p1, surveyor = s.enemies.find(e => e.kind === 'surveyor');
  Object.assign(player, { x: 420, y: 320 });
  Object.assign(surveyor, { x: 625, y: 320, attack: 'hook', windup: .35, facing: Math.PI });
  const view = { x: 225, y: 0, w: 390, h: 600 };
  const banner = calls => calls.find(q => q.method === 'fillRect' && q.color === '#172731ef');
  assert.deepEqual(banner(draw(s, { view })).args, [319, 308, 64, 24]);
  assert.equal(banner(draw(s)), undefined, 'full-width play has no edge marker');
  surveyor.facing = 0;
  assert.equal(banner(draw(s, { view })), undefined);
  surveyor.facing = Math.PI; surveyor.stun = .3;
  assert.equal(banner(draw(s, { view })), undefined, 'interrupted windup has no edge marker');
});
