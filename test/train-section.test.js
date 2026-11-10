'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../adventure/engine.js');
const C = require('../adventure/campaign.js');
const dt = .05;
const clone = value => JSON.parse(JSON.stringify(value));

function party() { return E.create({ mode: 'chapter', mission: 'chapter1_5', seed: 14, players: 2, loadout: 'pistol' }); }
function view(s, id = 'p2') { return E.viewForPlayer(s, id); }
function use(s, kind, room) {
  if (room !== undefined) assert(E.enterRoom(s, room, true, 'p2'));
  const item = view(s).interactables.find(item => item.kind === kind);
  assert(item, 'authored item exists: ' + kind);
  Object.assign(s.players.p2, { x: item.x, y: item.y });
  return E.interact(s, 'p2');
}
function wait(s, condition, frames = 3000) {
  for (let n = 0; n < frames; n++) {
    if (condition()) return n;
    E.step(s, {}, dt);
    assert.equal(s.status, 'playing');
    assert(C.validTrainChapter(s.chapter, s.status), 'live chapter stays canonical');
    assert(C.validTrainChapter(E.snapshot(view(s), true).chapter, s.status), 'compact station boundaries stay canonical');
  }
  assert.fail('authored escort did not reach the expected stop');
}
function safeRoute(s) {
  // Route and timing fixture: remove defenders, leaving real vehicle motion,
  // player interactions, room ownership, gates and result settlement intact.
  s.enemies = [];
  Object.entries(s.roomData).forEach(([index, data]) => { if (index !== '8') data.enemies = []; });
}

test('the escort ends only after unloading, stopping the Returner and relighting the lamp', () => {
  const s = party(); safeRoute(s);
  const parked = [s.players.p1.x, s.players.p1.y, s.players.p1.hp];
  E.step(s, {}, 1);
  assert.equal(s.chapter.cart.x, 180, 'the vehicle waits for a player to start it');
  assert(use(s, 'train-cart', 0));
  assert(use(s, 'train-cart'), 'the moving car can be stopped');
  const stopped = s.chapter.cart.x;
  for (let n = 0; n < 20; n++) E.step(s, {}, dt);
  assert.equal(s.chapter.cart.x, stopped);
  assert(use(s, 'train-cart'));
  wait(s, () => s.chapter.phase === 'gate');
  assert.equal(s.chapter.cart.roomIndex, 2); assert.equal(s.chapter.cart.x, 600);
  assert.equal(s.playerRooms.p1, 0, 'a vehicle transition cannot drag a person');
  assert(E.enterRoom(s, 2, true, 'p2'));
  assert.equal(E.enterRoom(s, 4, false, 'p2'), false);
  assert(use(s, 'train-switch', 3));
  assert(use(s, 'train-cart', 2));
  wait(s, () => s.chapter.phase === 'water');
  assert.equal(s.chapter.cart.x, 480);
  assert(use(s, 'train-pump', 4));
  // The pump's authored ambush is removed for the same isolated route fixture.
  s.enemies = []; s.roomData[4].enemies = [];
  assert.equal(E.enterRoom(s, 5, false, 'p2'), false);
  const began = s.elapsed;
  wait(s, () => s.chapter.cooled);
  assert(Math.abs(s.elapsed - began - 10) < .00001, 'separated rooms do not multiply the cooling clock');
  assert(use(s, 'train-cart'));
  wait(s, () => s.chapter.arrived);
  assert.equal(s.status, 'playing', 'arriving never auto-completes the passengers objective');
  assert.equal(s.chapter.cart.roomIndex, 7); assert.equal(s.chapter.cart.x, 680);
  assert.deepEqual([s.players.p1.x, s.players.p1.y, s.players.p1.hp], parked);
  assert(use(s, 'train-unload', 7));
  assert.equal(s.status, 'playing'); assert.equal(s.chapter.phase, 'divert');
  assert.equal(s.rewardGranted, false);
  assert.equal(E.enterRoom(s, 8, false, 'p2'), false, 'the furnace is closed before the core diversion');
  assert.equal(use(s, 'train-lamp'), false, 'safe passengers alone do not complete the chapter');
  assert.equal(use(s, 'train-cart'), false, 'the parked vehicle is no longer operable');
  assert(use(s, 'train-divert'));
  assert(E.enterRoom(s, 8, false, 'p2'));
  assert(E.enterRoom(s, 7, true, 'p1'));
  const findBoss = () => view(s).enemies.find(e => e.trainReturner);
  const boss = findBoss();
  assert.equal(boss.hp, 144);
  assert(use(s, 'train-vent'));
  assert.equal(findBoss().hp, 132);
  assert(findBoss().weakTime > 0, 'the pressure release creates a real weakpoint');
  assert.equal(use(s, 'train-vent'), false, 'the valve needs to recover');

  // Keep the aiming fixture alive while real projectiles resolve the boss
  // fight. The authored boss, HP, attacks and other rooms keep simulating.
  Object.assign(s.players.p2, { x: 446, y: 346, invuln: 90 });
  for (let n = 0; n < 1200 && !s.chapter.ending.stopped; n++) {
    const target = findBoss();
    E.step(s, { p2: { shoot: true, aimX: target.x, aimY: target.y } }, dt);
  }
  assert(s.chapter.ending.stopped, 'the Returner can be stopped by combat');
  assert.equal(s.status, 'playing'); assert.equal(s.chapter.phase, 'relight');
  assert.equal(s.chapter.ending.ventLeft, 0);
  assert.equal(s.playerRooms.p2, 8, 'winning the fight never drags the player back');
  assert(view(s, 'p1').interactables.find(item => item.kind === 'train-lamp').active,
    'the separated teammate sees the lamp immediately');
  Object.assign(s.players.p1, { x: 540, y: 365 });
  assert(E.interact(s, 'p1'));
  assert.equal(s.status, 'won'); assert.equal(s.reward.coins, 70);
  for (const id of ['p1', 'p2']) {
    const state = clone(E.snapshot(view(s, id), true));
    assert(C.validTrainChapter(state.chapter, 'won'));
    const paid = C.applyResult({}, state, 'last-train-once');
    assert.equal(paid.reward, 70);
    assert.equal(paid.profile.missions.chapter1_5.clears, 1);
    assert(C.applyResult(paid.profile, state, 'last-train-once').duplicate);
  }
});

test('an unattended occupied vehicle room takes real enemy fire and its destruction ends the shared run', () => {
  const s = party();
  assert(use(s, 'train-cart', 0));
  assert(E.enterRoom(s, 3, true, 'p1'));
  assert(E.enterRoom(s, 3, true, 'p2'));
  // Put the people in the peaceful room's doorway away from its defender.
  Object.assign(s.players.p1, { x: 480, y: 500 });
  Object.assign(s.players.p2, { x: 520, y: 500 });
  s.enemies = []; s.roomData[3].enemies = [];
  let struck = false, once = false;
  for (let n = 0; n < 4000 && s.status === 'playing'; n++) {
    const before = s.elapsed;
    E.step(s, {}, dt);
    assert(Math.abs(s.elapsed - before - dt) < .0000001);
    if (s.chapter.cart.hp < 14) struck = true;
    if (s.chapter.cart.hitCd > .75) once = true;
  }
  assert(struck && once, 'real attackers simulate while both people are elsewhere');
  assert.equal(s.chapter.cart.hp, 0);
  assert.equal(s.status, 'lost');
  assert.equal(s.chapter.unloaded, false);
  assert(C.validTrainChapter(s.chapter, 'lost'));
});

test('stationary repairs consume two finite materials and never let moving or healthy cars spend them', () => {
  const s = party();
  assert.equal(use(s, 'train-repair', 0), false);
  assert.equal(s.chapter.repairsLeft, 2);
  assert(use(s, 'train-cart'));
  assert.equal(use(s, 'train-repair'), false, 'repairing a moving car cannot spend materials');
  for (const id of ['p1', 'p2']) assert(E.enterRoom(s, 3, true, id));
  // Keep the route-control observer safe while the remote wagon fights actual
  // defenders. Vehicle HP and enemy attacks retain their production values.
  s.enemies = []; s.roomData[3].enemies = [];
  wait(s, () => s.chapter.cart.hp <= 10);
  assert(E.enterRoom(s, s.chapter.cart.roomIndex, true, 'p2'));
  if (s.chapter.cart.moving) assert(use(s, 'train-cart'));
  const hp = s.chapter.cart.hp;
  assert(use(s, 'train-repair'));
  assert.equal(s.chapter.cart.hp, Math.min(14, hp + 4));
  assert.equal(s.chapter.repairsLeft, 1);
  assert(E.enterRoom(s, 3, true, 'p2'));
  wait(s, () => s.chapter.cart.hp <= 10);
  assert(use(s, 'train-repair', s.chapter.cart.roomIndex));
  assert.equal(s.chapter.repairsLeft, 0);
  assert.equal(view(s).interactables.find(q => q.kind === 'train-repair').active, false);
  assert.equal(s.chapter.repairsLeft, 0);
});

test('read-only split views relocate the car controls and share station switches immediately', () => {
  const s = party(); safeRoute(s);
  assert(use(s, 'train-cart', 0));
  wait(s, () => s.chapter.cart.roomIndex === 1);
  const before = JSON.stringify(s);
  assert.equal(view(s, 'p1').interactables.filter(q => q.kind === 'train-cart').length, 0);
  assert.equal(view(s, 'p2').interactables.filter(q => q.kind === 'train-cart').length, 0);
  assert.equal(JSON.stringify(s), before);
  assert(E.enterRoom(s, 1, true, 'p2'));
  s.players.p2.y = 390;
  assert.equal(view(s).interactables.filter(q => q.kind === 'train-cart').length, 1);
  wait(s, () => s.chapter.phase === 'gate');
  assert(E.enterRoom(s, 2, true, 'p1'));
  assert(use(s, 'train-switch', 3));
  const frozen = JSON.stringify(s);
  assert(view(s, 'p1').portals.find(p => p.target === 4).active);
  assert.equal(view(s, 'p1').chapter.phase, 'escort');
  assert.equal(JSON.stringify(s), frozen);
});

test('entering through a real portal beside the wagon cannot trap a player in its body', () => {
  const s = party(); safeRoute(s);
  assert(use(s, 'train-cart', 0));
  wait(s, () => s.chapter.cart.roomIndex === 1);
  const gate = view(s).portals.find(q => q.target === 1);
  Object.assign(s.players.p2, { x: gate.x, y: gate.y });
  E.step(s, { p2: { interact: true } }, dt);
  assert.equal(s.playerRooms.p2, 1);
  const landed = s.players.p2.y, x = s.chapter.cart.x;
  for (let n = 0; n < 10; n++) E.step(s, { p2: { my: 1 } }, dt);
  assert(s.players.p2.y > landed + 30, 'the arrival is a usable place, not the inside of the car');
  assert(s.chapter.cart.x > x, 'the driver also remains free to move');
  assert.equal(s.playerRooms.p1, 0);
});

test('a melee guard can physically intercept a defender shot before it reaches the vehicle', () => {
  function shotFixture() {
    const s = party(), shooter = clone(s.roomData[1].enemies.find(e => e.kind === 'shooter'));
    safeRoute(s);
    assert(use(s, 'train-cart', 0)); assert(use(s, 'train-cart'));
    Object.assign(shooter, { x: 600, y: 300, attackCd: 0 });
    s.enemies.push(shooter);
    return s;
  }
  const defended = shotFixture();
  Object.assign(defended.players.p2, { x: 280, y: 300 });
  E.step(defended, { p2: { switchPulse: true } }, dt);
  assert.equal(defended.players.p2.activeSlot, 'melee');
  let blocked = false;
  for (let n = 0; n < 80; n++) {
    E.step(defended, { p2: { guard: true, aimX: 700, aimY: 300 } }, dt);
    blocked ||= view(defended).combatEvents.some(event => event.type === 'melee-block' && event.playerId === 'p2');
  }
  assert(blocked);
  assert.equal(defended.chapter.cart.hp, 14);
  const exposed = shotFixture();
  assert(E.enterRoom(exposed, 3, true, 'p1')); assert(E.enterRoom(exposed, 3, true, 'p2'));
  wait(exposed, () => exposed.chapter.cart.hp < 14, 100);
  assert(exposed.roomData[0].combatEvents.some(event => event.type === 'train-hit' && event.source === 'bullet'));
});
