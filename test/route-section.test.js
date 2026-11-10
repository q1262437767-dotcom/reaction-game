'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../adventure/engine.js');
const C = require('../adventure/campaign.js');
const dt = 1 / 60;
const wire = value => JSON.parse(JSON.stringify(value));

function party() {
  return E.create({ mode: 'chapter', mission: 'chapter1_4', players: 2, seed: 14, loadout: 'pistol' });
}

function view(s, id = 'p2') { return E.viewForPlayer(s, id); }
function sharedViews(s) {
  const before = JSON.stringify(s);
  for (const id of ['p1', 'p2']) {
    const projected = view(s, id);
    assert(C.validRouteChapter(projected.chapter, projected.status), 'a distant room cannot restore an old story phase');
    assert.equal(projected.mission.phase, projected.chapter.phase);
    assert.equal(projected.mission.progress, Number(projected.chapter.signalLit));
  }
  assert.equal(JSON.stringify(s), before, 'viewer projections do not mutate cached rooms or the live world');
}
function cross(s, to, id = 'p2') {
  // These tests isolate authored routes from combat balance. They still use
  // the real portal interaction, cooldown and independently occupied scenes.
  s.players[id].invuln = 30;
  for (let n = 0; n < 90 && view(s, id).travelCd > 0; n++) E.step(s, {}, dt);
  E.step(s, {}, dt);
  const portal = view(s, id).portals.find(p => p.target === to);
  assert(portal && portal.active, `route to ${to} is open`);
  Object.assign(s.players[id], { x: portal.x, y: portal.y });
  E.step(s, { [id]: { interact: true } }, dt);
  assert.equal(s.playerRooms[id], to);
}

function use(s, kind, id = 'p2', clueId) {
  const target = view(s, id).interactables.find(q => q.kind === kind && (!clueId || q.clueId === clueId));
  assert(target, `authored interaction ${clueId || kind} exists`);
  Object.assign(s.players[id], { x: target.x, y: target.y });
  return E.interact(s, id);
}

function finishFromDispatch(s) {
  assert.equal(use(s, 'route-gate'), false, 'the gate cannot skip the recovery order');
  assert.equal(s.chapter.gateOpened, false);
  assert(use(s, 'chapter-note', 'p2', 'route-order'));
  sharedViews(s);
  assert(use(s, 'route-gate'));
  sharedViews(s);
  cross(s, 1); cross(s, 6);
  cross(s, 7);
  assert(use(s, 'route-signal'));
  sharedViews(s);
  assert.equal(s.status, 'won');
  assert.equal(s.reward.coins, 70);
  assert(C.validRouteChapter(s.chapter, s.status));
  for (const id of ['p1', 'p2']) {
    const result = C.applyResult({}, wire(E.snapshot(view(s, id), true)), 'route-clear');
    assert.equal(result.reward, 70);
    assert.equal(result.profile.missions.chapter1_4.clears, 1);
    assert.equal(C.applyResult(result.profile, view(s, id), 'route-clear').duplicate, true);
  }
}

test('upper route raises the physical bridge, opens a return shortcut and settles both split players', () => {
  const s = party(), start = { ...s.players.p1 };
  cross(s, 1);
  assert.equal(E.enterRoom(s, 6, false, 'p2'), false, 'the main gate is closed from the junction');
  cross(s, 2); cross(s, 3);
  assert(view(s).walls.some(w => w.routeGap));
  assert.equal(E.enterRoom(s, 6, false, 'p2'), false, 'the broken bridge blocks both route APIs');
  assert.equal(use(s, 'route-winch'), false, 'the exposed winch cannot lift the bridge without its pin');
  cross(s, 2);
  assert(use(s, 'route-pin'));
  cross(s, 3);
  assert(use(s, 'route-winch'));
  sharedViews(s);
  assert(!view(s).walls.some(w => w.routeGap));
  assert.equal(s.chapter.wallBreached, false, 'one route suffices');
  cross(s, 6); cross(s, 3); cross(s, 6);
  assert.equal(s.playerRooms.p1, 0);
  assert.deepEqual([s.players.p1.x, s.players.p1.y, s.players.p1.hp], [start.x, start.y, start.hp]);
  assert(view(s).enemies.some(e => e.hp > 0), 'story interactions do not require a room clear');
  finishFromDispatch(s);
});

test('a real heavy rush breaches the lower wall without hurting the same-coordinate remote partner', () => {
  const s = party();
  cross(s, 1); cross(s, 4); cross(s, 5);
  assert.equal(E.enterRoom(s, 6, false, 'p2'), false);
  Object.assign(s.players.p1, { x: 480, y: 225, invuln: 0 });
  Object.assign(s.players.p2, { x: 480, y: 225, invuln: 0 });
  const health = s.players.p1.hp;
  let frames = 0, rushSeen = false;
  for (; frames < 600 && !s.chapter.wallBreached; frames++) {
    E.step(s, {}, dt);
    rushSeen ||= view(s).enemies.some(e => e.routeBreaker && e.rhythm?.type === 'rush');
  }
  assert(frames < 600, 'the authored lower room permits a natural lured wall impact');
  assert(rushSeen);
  assert(!view(s).walls.some(w => w.routeWall));
  assert(view(s).combatEvents.some(e => e.type === 'wall-breached' && e.wallId === 'route-breach-wall'));
  assert.equal(s.players.p1.hp, health);
  assert.equal(s.playerRooms.p1, 0);
  assert.equal(s.chapter.bridgeRaised, false);
  cross(s, 6); cross(s, 5); cross(s, 6);
  finishFromDispatch(s);
});

test('killing the lower-route heavy cannot soft-lock the expedition', () => {
  const s = party();
  cross(s, 1); cross(s, 4); cross(s, 5);
  s.players.p2.invuln = 30;
  Object.assign(s.players.p2, { x: 650, y: 500 });
  let dead = false;
  for (let n = 0; n < 1800; n++) {
    const heavy = view(s).enemies.find(e => e.routeBreaker && e.hp > 0);
    if (!heavy) { dead = true; break; }
    E.step(s, { p2: { shoot: true, aimX: heavy.x, aimY: heavy.y } }, dt);
  }
  assert(dead, 'normal weapon fire can defeat the heavy');
  assert.equal(s.chapter.wallBreached, false, 'killing it does not grant a fake breach');
  cross(s, 4); cross(s, 1); cross(s, 2);
  assert(use(s, 'route-pin'));
  cross(s, 3);
  assert(use(s, 'route-winch'));
  cross(s, 6);
  finishFromDispatch(s);
});

test('the solo ally follows the player and leaves route controls and the breaker for them', () => {
  const s = E.create({ mode: 'chapter', mission: 'chapter1_4', seed: 14, loadout: 'pistol' });
  assert(s.railAlly);
  E.enterRoom(s, 5, true, 'p1');
  Object.assign(s.players.p1, { x: 740, y: 430, invuln: 30 });
  let reached = false;
  for (let n = 0; n < 1800; n++) {
    E.step(s, {}, dt);
    if (s.railAlly.roomIndex === 5) reached = true;
    const heavy = view(s, 'p1').enemies.find(e => e.routeBreaker);
    if (!s.chapter.wallBreached) assert.equal(heavy.hp, heavy.maxHp, 'the ally never preemptively shoots the route mechanism');
    if (reached && n > 600) break;
  }
  assert(reached, 'the ally physically follows through the available lower route');
  assert.equal(s.chapter.bridgeRaised, false);
  assert.equal(s.chapter.gateOpened, false);
  assert.equal(s.chapter.signalLit, false);
  assert.deepEqual(s.chapter.clues, []);
});

test('a distant junction projects a newly opened main gate immediately without stepping its occupant', () => {
  const s = party();
  cross(s, 1, 'p1');
  cross(s, 1); cross(s, 2);
  assert(use(s, 'route-pin'));
  cross(s, 3);
  assert(use(s, 'route-winch'));
  cross(s, 6);
  assert(use(s, 'chapter-note', 'p2', 'route-order'));
  const parked = [s.players.p1.x, s.players.p1.y, s.players.p1.hp];
  assert(use(s, 'route-gate'));
  sharedViews(s);
  assert(view(s, 'p1').portals.find(q => q.target === 6).active);
  assert.deepEqual([s.players.p1.x, s.players.p1.y, s.players.p1.hp], parked);
  assert.equal(view(s, 'p1').chapter.phase, 'signal');
});
