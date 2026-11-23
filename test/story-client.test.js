'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../adventure/engine.js');
const C = require('../adventure/campaign.js');
const Story = require('../adventure/story.js');
const wire = value => JSON.parse(JSON.stringify(value));

// Exercise the actual client packet validators without loading a DOM, storage,
// credentials, or network transports. No copied validation implementation.
function clientValidators() {
  const source = fs.readFileSync(path.join(__dirname, '../adventure/app.js'), 'utf8');
  function between(start, end) {
    const first = source.indexOf(start), last = source.indexOf(end, first);
    assert.ok(first >= 0 && last > first, 'client validation source boundaries');
    return source.slice(first, last);
  }
  const validation = between('  function safeInput(', '  function meterNet(');
  const diagnostic = validation.split('\n').map((line, index) => line.replaceAll('return false;',
    'return (globalThis.invalid ||= ' + JSON.stringify((index + 1) + ': ' + line.trim()) + ', false);')).join('\n');
  const context = { E, C };
  vm.createContext(context);
  vm.runInContext(between('  const MELEE_WEAPONS', '  const HUD_STORE') +
    between('  function safeCampLoadout(', '  function sendCampLoadout(') + diagnostic + `
    globalThis.validate = value => { invalid = ''; return { ok: validState(value), reason: invalid }; };
    globalThis.validateGuest = validGuestState;
    globalThis.validateSync = validSync;
  `, context, { filename: 'actual-app-validators.js' });
  vm.runInContext(between('  function hostBusy(', '  function sendHostState(') + `
    globalThis.remoteAt = -1000;
    globalThis.remoteInput = null;
    globalThis.isBusy = hostBusy;
  `, context);
  return context;
}

const client = clientValidators();
function assertValid(state, label) {
  const result = client.validate(state);
  assert.equal(result.ok, true, label + ': ' + result.reason);
}

function channel(state) {
  let guest, baseline, stamp, fullCount = 0, diffCount = 0;
  function receive(label, drop) {
    const view = E.viewForPlayer(state, 'p2');
    if (!guest || stamp !== E.networkStamp(view)) {
      guest = wire(E.snapshot(view, true));
      assertValid(guest, label + ' full');
      assert.equal(client.validateGuest(guest), true, label + ' is the guest room');
      baseline = E.syncBaseline(guest);
      stamp = E.networkStamp(view);
      fullCount += 1;
    } else {
      const patch = wire(E.syncDiff(view, baseline));
      assert.equal(client.validateSync(patch, guest, baseline), true, label + ' diff accepted');
      if (drop) return;
      E.applySync(guest, patch, baseline);
      assertValid(guest, label + ' expanded diff');
      assert.deepEqual(guest.chapter, wire(E.syncPatch(view, false)).chapter, label + ' shared story state');
      assert.equal(guest.enemies.length, view.enemies.length, label + ' local foes');
      assert.ok(Math.abs(guest.players.p2.x - state.players.p2.x) < 0.011, label + ' player position');
      diffCount += 1;
    }
  }
  return { receive, get guest() { return guest; }, get counts() { return [fullCount, diffCount]; } };
}

function interactAt(state, playerId, kind, predicate) {
  const view = E.viewForPlayer(state, playerId);
  const item = view.interactables.find(q => q.kind === kind && (!predicate || predicate(q)));
  assert.ok(item, kind + ' in ' + view.room.name);
  Object.assign(state.players[playerId], { x: item.x, y: item.y });
  assert.equal(E.interact(state, playerId), true, kind + ' works');
  return item;
}

test('all story room snapshots are accepted by the real guest client', () => {
  const failures = [];
  for (const mission of Story.ids()) {
    const state = E.create({ mode: 'chapter', mission, players: 2, seed: 14 });
    for (let room = 0; room < state.rooms.length; room += 1) {
      E.enterRoom(state, room, true, 'p2');
      const packet = wire(E.snapshot(E.viewForPlayer(state, 'p2'), true));
      const result = client.validate(packet);
      if (!result.ok) failures.push(mission + '/' + room + ': ' + result.reason);
    }
  }
  assert.deepEqual(failures, []);
});

test('occupied story rooms keep sending valid cumulative diffs during combat', () => {
  let fullCount = 0, diffCount = 0;
  for (const mission of Story.ids()) {
    const rooms = Story.chapter(mission).rooms;
    for (let room = 0; room < rooms.length; room += 1) {
      const state = E.create({ mode: 'chapter', mission, players: 2, seed: 32 });
      E.enterRoom(state, room, true, 'p2');
      state.players.p1.invuln = state.players.p2.invuln = 6;
      const link = channel(state);
      link.receive(mission + '/' + room);
      for (let frame = 0; frame < 150 && state.status === 'playing'; frame += 1) {
        const target = E.viewForPlayer(state, 'p2').enemies.find(e => e.hp > 0);
        E.step(state, { p2: { aimX: target ? target.x : 480, aimY: target ? target.y : 300,
          shoot: frame % 40 < 20, guard: frame % 40 >= 20 } }, 1 / 60);
        if (frame % 6 === 0) link.receive(mission + '/' + room + '/' + frame, frame % 18 === 0);
      }
      link.receive(mission + '/' + room + '/final');
      fullCount += link.counts[0]; diffCount += link.counts[1];
    }
  }
  assert.ok(fullCount >= 60, 'every room receives a complete state');
  assert.ok(diffCount >= 900, 'combat snapshots survive cumulative diff recovery');
});

test('water and vent openings arrive without the guest rejecting their longer weakpoint timers', () => {
  const furnace = E.create({ mode: 'chapter', mission: 'chapter4_4', players: 2, seed: 34 });
  E.enterRoom(furnace, 1, true, 'p2');
  const vent = E.viewForPlayer(furnace, 'p2').interactables.find(q => q.kind === 'story-vent');
  const boss = E.viewForPlayer(furnace, 'p2').enemies.find(e => e.storyBoss);
  Object.assign(boss, { x: vent.x + 80, y: vent.y });
  const remote = channel(furnace); remote.receive('before vent');
  interactAt(furnace, 'p2', 'story-vent');
  assert.equal(boss.weakTime, 3.4);
  remote.receive('vent opening');
  assertValid(wire(E.snapshot(E.viewForPlayer(furnace, 'p2'), true)), 'full vent resync');

  const echo = E.create({ mode: 'chapter', mission: 'chapter2_4', players: 2, seed: 35 });
  E.enterRoom(echo, 2, true, 'p2');
  const view = E.viewForPlayer(echo, 'p2');
  const bucket = view.props.find(p => p.kind === 'water');
  const guard = view.enemies.find(e => e.storyBoss);
  Object.assign(echo.players.p2, { x: bucket.x, y: bucket.y, facing: 0 });
  assert.equal(E.interact(echo, 'p2'), true);
  assert.equal(echo.players.p2.carry, bucket.id);
  Object.assign(guard, { x: bucket.x + 72, y: bucket.y });
  const lampRemote = channel(echo); lampRemote.receive('before splash');
  assert.equal(E.interact(echo, 'p2'), true);
  assert.equal(guard.weakTime, 3.2);
  lampRemote.receive('echo water opening');
  const valid = wire(E.snapshot(E.viewForPlayer(echo, 'p2'), true));
  assertValid(valid, 'full water resync');
  valid.enemies.find(e => e.storyBoss).weakTime = 3.3;
  assert.equal(client.validate(valid).ok, false, 'unknown longer openings remain rejected');
});

test('two players in different rooms receive the same water and signal changes', () => {
  const canal = E.create({ mode: 'chapter', mission: 'chapter3', players: 2, seed: 45 });
  E.enterRoom(canal, 1, true, 'p2');
  const link = channel(canal); link.receive('dry canal');
  for (let level = 1; level <= 3; level += 1) {
    interactAt(canal, 'p1', 'story-valve');
    for (let frame = 0; frame < 90; frame += 1) {
      canal.players.p2.invuln = 1;
      E.step(canal, {}, 1 / 60);
      if (frame % 10 === 0) link.receive('water ' + level + '/' + frame, frame === 20);
    }
    assert.equal(canal.chapter.water, level % 3);
    link.receive('water ' + level + ' settled');
    assertValid(wire(E.snapshot(E.viewForPlayer(canal, 'p2'), true)), 'water full refresh');
  }
  const hall = E.create({ mode: 'chapter', mission: 'chapter3_3', players: 2, seed: 46 });
  E.enterRoom(hall, 1, true, 'p1'); E.enterRoom(hall, 2, true, 'p2');
  const signal = channel(hall); signal.receive('unwired');
  interactAt(hall, 'p1', 'story-link'); signal.receive('east pressed');
  interactAt(hall, 'p2', 'story-link'); signal.receive('both pressed');
  assert.equal(signal.guest.chapter.link, 2);
});

test('unsupported enemy roles and malformed map links remain invalid', () => {
  const state = E.create({ mode: 'chapter', mission: 'chapter3', players: 2, seed: 9 });
  E.enterRoom(state, 2, true, 'p2');
  const packet = wire(E.snapshot(E.viewForPlayer(state, 'p2'), true));
  assertValid(packet, 'damp machines are recognized');
  const badRole = wire(packet); badRole.enemies[0].storyRole = 'unknown-role';
  assert.equal(client.validate(badRole).ok, false);
  const badMap = wire(packet); badMap.rooms[1].gx += 1;
  assert.equal(client.validate(badMap).ok, false, 'orthogonal routes stay enforced');
});

test('the guest sees a moving and stopped core cart while the host is in another room', () => {
  const rail = E.create({ mode: 'chapter', mission: 'chapter4_2', players: 2, seed: 52 });
  E.enterRoom(rail, 3, true, 'p1');
  const remote = channel(rail); remote.receive('parked core cart');
  assert.equal(client.isBusy(1000, E.viewForPlayer(rail, 'p2')), false);
  const start = rail.chapter.cartX;
  interactAt(rail, 'p2', 'story-drive');
  assert.equal(client.isBusy(1000, E.viewForPlayer(rail, 'p2')), true, 'a moving cart uses the active send cadence');
  for (let frame = 0; frame < 90; frame += 1) {
    E.step(rail, {}, 1 / 60);
    if (frame % 6 === 0) remote.receive('moving cart ' + frame, frame === 30);
  }
  remote.receive('moving cart final');
  assert.equal(rail.chapter.cartRoom, 0, 'the cart does not teleport to its distant host');
  assert.ok(rail.chapter.cartX > start + 20, 'the cart advances in the actual simulation');
  assert.ok(Math.abs(remote.guest.chapter.cartX - rail.chapter.cartX) < 0.011);
  interactAt(rail, 'p2', 'story-drive');
  const stopped = rail.chapter.cartX;
  for (let frame = 0; frame < 60; frame += 1) E.step(rail, {}, 1 / 60);
  remote.receive('stopped cart');
  assert.equal(rail.chapter.cartX, stopped);
  assert.equal(remote.guest.chapter.clues.includes('rolling'), false);
  assert.equal(client.isBusy(3000, E.viewForPlayer(rail, 'p2')), false);
  assertValid(wire(E.snapshot(E.viewForPlayer(rail, 'p2'), true)), 'stopped cart full refresh');
});

test('remote water controls change the guest bridge geometry and survive a dropped diff', () => {
  const canal = E.create({ mode: 'chapter', mission: 'chapter3', players: 2, seed: 53 });
  E.enterRoom(canal, 1, true, 'p2');
  Object.assign(canal.players.p2, { x: 180, y: 300, invuln: 10 });
  const remote = channel(canal); remote.receive('dry floating bridge');
  const bridgeBoxes = view => view.props.filter(p => /^story-float-[0-2]$/.test(p.id));
  const gap = view => view.walls.some(w => w.id === 'story-canal-gap');
  assert.equal(bridgeBoxes(remote.guest).length, 3);
  assert.equal(gap(remote.guest), true, 'dry canal is physically impassable');
  const restingY = bridgeBoxes(remote.guest).map(p => p.y);

  interactAt(canal, 'p1', 'story-valve');
  for (let frame = 0; frame < 120; frame += 1) {
    E.step(canal, {}, 1 / 60);
    if (frame % 12 === 0) remote.receive('rising bridge ' + frame, frame === 24);
  }
  remote.receive('floating bridge settled');
  assert.equal(gap(remote.guest), false, 'the guest receives the open collision corridor');
  assert.ok(bridgeBoxes(remote.guest).every((p, i) => p.y < restingY[i] - 80));
  assert.deepEqual(bridgeBoxes(remote.guest), wire(E.syncPatch(E.viewForPlayer(canal, 'p2'), false)).props.filter(p => /^story-float-[0-2]$/.test(p.id)));

  interactAt(canal, 'p1', 'story-valve');
  interactAt(canal, 'p1', 'story-valve');
  for (let frame = 0; frame < 120; frame += 1) {
    E.step(canal, {}, 1 / 60);
    if (frame % 12 === 0) remote.receive('lowering bridge ' + frame, frame === 24);
  }
  remote.receive('dry bridge restored');
  assert.equal(gap(remote.guest), true);
  assert.deepEqual(bridgeBoxes(remote.guest).map(p => p.y), restingY);
  assertValid(wire(E.snapshot(E.viewForPlayer(canal, 'p2'), true)), 'dry bridge full refresh');
});

test('guest sees the held worker released and the full hatch opening from two rooms', () => {
  const state = E.create({ mode: 'chapter', mission: 'chapter3_4', players: 2, seed: 61 });
  E.enterRoom(state, 1, true, 'p1');
  E.enterRoom(state, 2, true, 'p2');
  const remote = channel(state);
  remote.receive('closed hatch');
  assert.equal(E.storyInspection(remote.guest).phase, 'cargo');
  interactAt(state, 'p1', 'story-link');
  remote.receive('first end');
  assert.equal(remote.guest.chapter.link, 1);
  interactAt(state, 'p2', 'story-link');
  remote.receive('both ends');
  assert.equal(remote.guest.chapter.link, 2);
  assert.equal(remote.guest.enemies.find(e => e.kind === 'surveyor').weakTime, 6);
  assert.equal(E.storyInspection(remote.guest).phase, 'recognized');
  assert.ok(Number.isFinite(E.storyInspection(remote.guest).releasedAt));
  assert.ok(remote.guest.combatEvents.some(event => event.type === 'story-worker-released' && event.reason === 'recognized'));
  const releasedAt = E.storyInspection(remote.guest).releasedAt;
  for (let i = 0; i < 45; i++) E.step(state, {}, 1 / 60);
  remote.receive('the escape keeps playing in the guest arena');
  assert.equal(E.storyInspection(remote.guest).releasedAt, releasedAt);
  assertValid(wire(E.snapshot(E.viewForPlayer(state, 'p2'), true)), 'full hatch opening refresh');
});

test('the opening distress lamp and first wash valve are visible in the real guest snapshots', () => {
  const state = E.create({ mode: 'chapter', mission: 'chapter1', players: 2, seed: 36 });
  const remote = channel(state);
  remote.receive('opening signal');
  assert.equal(E.chapterOpeningView(remote.guest).signal.lit, true);
  let extinguishes = 0;
  for (let i = 0; i < 155; i++) {
    E.step(state, {}, 1 / 60);
    extinguishes += state.events.filter(event => event.type === 'chapter-signal-out').length;
  }
  assert.equal(extinguishes, 1);
  remote.receive('the signal goes out');
  assert.equal(E.chapterOpeningView(remote.guest).signal.out, true);

  assert.equal(E.enterRoom(state, 1, false, 'p2'), true);
  remote.receive('valve available in the outer yard');
  assert.equal(E.chapterOpeningView(remote.guest).wash.ready, true);
  const patrol = view => view.enemies.find(enemy => enemy.name === '巡炉刀兵');
  const initialHp = patrol(remote.guest).hp;
  interactAt(state, 'p2', 'chapter-wash');
  remote.receive('guest washes the patrol');
  assert.equal(E.chapterOpeningView(remote.guest).wash.active, true);
  assert.ok(patrol(remote.guest).weakTime > 1.5);
  assert.equal(patrol(remote.guest).hp, initialHp);
  assert.deepEqual(remote.guest.playerRooms, { p1: 0, p2: 1 });

  const malformed = wire(remote.guest);
  malformed.interactables.find(item => item.kind === 'chapter-wash').readyAt += 240;
  assert.equal(client.validateGuest(malformed), false);
  for (let i = 0; i < 350; i++) E.step(state, {}, 1 / 60);
  remote.receive('pressure returned to the valve');
  assert.equal(E.chapterOpeningView(remote.guest).wash.ready, true);
});

test('guest receives the finale authorization and can use it without the host leaving the pulse console', () => {
  const state = E.create({ mode: 'chapter', mission: 'chapter5_2', players: 2, seed: 62 });
  E.enterRoom(state, 3, true, 'p1');
  const remote = channel(state);
  remote.receive('locked orders');
  const order = view => view.interactables.find(item => item.kind === 'story-order' && item.ending === 'normal');
  assert.equal(order(remote.guest).active, false);
  state.chapter.pulse = 0;
  interactAt(state, 'p1', 'story-switch');
  remote.receive('remote access granted');
  assert.equal(order(remote.guest).active, true);
  assert.ok(remote.guest.chapter.linkLeft > 0);
  interactAt(state, 'p2', 'story-order', item => item.ending === 'normal');
  remote.receive('order accepted');
  assert.equal(remote.guest.chapter.ending, 'normal');
  assert.equal(remote.guest.status, 'won');
});

test('guest follows the shared rescue across both route layouts and can settle in a separate room', () => {
  for (const [seed, route] of [[14, [1, 0]], [17, [5, 4, 3, 0]]]) {
    const state = E.create({ mode: 'rescue', mission: 'salvage', players: 2, seed });
    const link = channel(state);
    const view = () => E.viewForPlayer(state, 'p2');
    link.receive('rescue opening');
    const verifyRun = label => {
      link.receive(label);
      const full = wire(E.snapshot(view(), true));
      assertValid(full, label + ' full refresh');
      for (const key of ['x', 'y', 'water']) assert.ok(Math.abs(link.guest.rescue[key] - full.rescue[key]) < .011, label + ' ' + key);
      for (const key of ['phase', 'guide', 'room', 'eliteId', 'eliteDown']) {
        assert.equal(link.guest.rescue[key], full.rescue[key], label + ' ' + key);
      }
      assert.equal(link.guest.interactables.some(item => item.kind === 'rescue-survivor'),
        state.status === 'playing' && state.rescue.room === view().room.index, label);
    };
    assert.equal(E.enterRoom(state, 2, true, 'p1'), true);
    interactAt(state, 'p1', 'rescue-survivor');
    verifyRun('remote pickup');
    assert.equal(link.guest.rescue.guide, 'p1');
    assert.equal(E.enterRoom(state, 2, true, 'p2'), true);
    verifyRun('same room');
    interactAt(state, 'p2', 'rescue-survivor');
    verifyRun('guide handoff');
    assert.equal(link.guest.rescue.guide, 'p2');
    assert.equal(state.playerRooms.p1, 2, 'the other player stays behind');
    for (const room of route) {
      assert.equal(E.enterRoom(state, room, true, 'p2'), true);
      verifyRun('escort arrives ' + room);
      assert.equal(link.guest.rescue.room, room);
    }
    Object.assign(state.players.p2, { x: 160, y: 300 });
    for (let i = 0; i < 300 && !view().interactables.find(item => item.kind === 'rescue-extract')?.active; i++) {
      E.step(state, { p1: {}, p2: {} }, 1 / 60);
    }
    assert.equal(view().interactables.find(item => item.kind === 'rescue-extract').active, true);
    assert.equal(state.playerRooms.p1, 2, 'escorting the survivor does not move the other player');
    interactAt(state, 'p2', 'rescue-extract');
    verifyRun('extraction');
    assert.equal(link.guest.status, 'won');
    assert.equal(link.guest.playerRooms.p1, 0, 'both players share the extraction result');
    assert.ok(link.counts.every(count => count > 0), 'used full and cumulative updates');
  }
});

test('rescue validation rejects room spoofing and mismatched survivor deltas', () => {
  const state = E.create({ mode: 'rescue', mission: 'salvage', players: 2, seed: 16 });
  E.enterRoom(state, 2, true, 'p2');
  const view = () => E.viewForPlayer(state, 'p2');
  const guest = wire(E.snapshot(view(), true)), baseline = E.syncBaseline(guest);
  assert.equal(client.validateGuest(guest), true);
  const bogusRoute = wire(guest);
  bogusRoute.rooms[4].neighbors = [2, 5];
  assert.equal(client.validateGuest(bogusRoute), false);
  const bogusFull = wire(guest);
  bogusFull.interactables.find(item => item.kind === 'rescue-survivor').x += 20;
  assert.equal(client.validateGuest(bogusFull), false);
  interactAt(state, 'p2', 'rescue-survivor');
  const validPatch = wire(E.syncDiff(view(), baseline));
  assert.equal(client.validateSync(validPatch, guest, baseline), true);
  const bogusWater = wire(validPatch);
  bogusWater.rescue.water = 9;
  assert.equal(client.validateSync(bogusWater, guest, baseline), false);
  const bogusGuide = wire(validPatch);
  bogusGuide.rescue.guide = 'p1';
  assert.equal(client.validateSync(bogusGuide, guest, baseline), false);
});

test('story weapon actions travel in full and delta packets to the guest', () => {
  const state = E.create({ mode: 'chapter', mission: 'chapter2_4', players: 2, seed: 10,
    loadout: 'blade', meleeLoadout: 'hook', rangedLoadout: 'echo' });
  for (const id of ['p1', 'p2']) assert.equal(E.enterRoom(state, 2, true, id), true);
  Object.assign(state.players.p1, { x: 305, y: 160 });
  Object.assign(state.players.p2, { x: 510, y: 95 });
  const barrel = E.viewForPlayer(state, 'p1').props.find(prop => prop.kind === 'barrel');
  const link = channel(state);
  link.receive('initial equipment');
  assert.equal(link.guest.players.p1.weapons.melee, 'hook');
  assert.equal(link.guest.players.p1.weapons.ranged, 'echo');

  E.step(state, { p1: { shoot: true, aimX: barrel.x, aimY: barrel.y } }, 1 / 60);
  link.receive('hook latch');
  assert.equal(link.guest.players.p1.hookProp, barrel.id);
  assert.ok(link.guest.players.p1.hookTime > 3.8);
  assert.ok(link.guest.combatEvents.some(event => event.type === 'hook-latch' && event.propId === barrel.id));
  E.step(state, { p1: { dash: true } }, 1 / 60);
  for (let i = 0; i < 30; i++) E.step(state, {}, 1 / 60);
  link.receive('hook drag');
  assert.equal(link.guest.players.p1.hookProp, undefined);
  assert.ok(link.guest.players.p1.x > 305, 'stationary dash moves away from the barrel');
  assert.ok(Math.abs(link.guest.props.find(prop => prop.id === barrel.id).x - 305) < 1);
  assert.ok(link.guest.combatEvents.some(event => event.type === 'hook-drag' && event.propId === barrel.id));

  E.step(state, { p1: { switchWeapon: true } }, 1 / 60);
  for (let i = 0; i < 20; i++) E.step(state, {}, 1 / 60);
  E.step(state, { p1: { shoot: true, aimX: 340, aimY: 130 } }, 1 / 60);
  link.receive('echo lamp');
  assert.ok(link.guest.decoys.some(decoy => decoy.kind === 'echo-lamp' && decoy.playerId === 'p1'));
  assert.ok(link.guest.combatEvents.some(event => event.type === 'echo-lamp' && event.weapon === 'echo'));
  for (let i = 0; i < 180 && !barrel.destroyed; i++) E.step(state, {}, 1 / 60);
  link.receive('boss triggered the trap');
  assert.ok(link.guest.props.find(prop => prop.id === barrel.id).destroyed);

  const vent = E.create({ mode: 'chapter', mission: 'chapter4_4', players: 2, loadout: 'vent', seed: 7 });
  for (const id of ['p1', 'p2']) assert.equal(E.enterRoom(vent, 1, true, id), true);
  const boss = E.viewForPlayer(vent, 'p1').enemies.find(enemy => enemy.kind === 'grandfurnace');
  Object.assign(boss, { windup: 0.7, attack: 'lunge' });
  Object.assign(vent.players.p1, { x: boss.x - 145, y: boss.y });
  Object.assign(vent.players.p2, { x: boss.x - 145, y: boss.y - 65 });
  const ventLink = channel(vent);
  ventLink.receive('vent gear');
  E.step(vent, { p1: { shoot: true, aimX: boss.x, aimY: boss.y } }, 1 / 60);
  ventLink.receive('vent opening');
  assert.ok(ventLink.guest.enemies.find(enemy => enemy.id === boss.id).weakTime > 1);
  assert.ok(ventLink.guest.enemies.find(enemy => enemy.id === boss.id).ventReadyAt > vent.time);
  assert.ok(ventLink.guest.combatEvents.some(event => event.type === 'vent-break' && event.enemyId === boss.id));
});

test('an echo shot makes a lamp on an enemy hit and repeat fire preserves its target identity', () => {
  const state = E.create({ mode: 'chapter', mission: 'chapter2_4', loadout: 'echo', seed: 10 });
  assert.equal(E.enterRoom(state, 2, true, 'p1'), true);
  const foe = state.enemies.find(enemy => enemy.kind === 'echoguard');
  Object.assign(foe, { stagger: 2.5 });
  Object.assign(state.players.p1, { x: foe.x - 65, y: foe.y });
  const hp = foe.hp;
  const fire = { p1: { shoot: true, aimX: foe.x, aimY: foe.y } };
  E.step(state, fire, 1 / 60);
  const lamp = state.decoys.find(decoy => decoy.kind === 'echo-lamp');
  assert.ok(foe.hp < hp);
  assert.ok(lamp && lamp.ttl > 4.8);
  const firstTtl = lamp.ttl, firstHp = foe.hp;
  for (let i = 0; i < 53; i++) E.step(state, fire, 1 / 60);
  const after = state.decoys.filter(decoy => decoy.kind === 'echo-lamp');
  assert.ok(foe.hp < firstHp, 'the gun hit again as the fire button stayed down');
  assert.equal(after.length, 1);
  assert.equal(after[0].id, lamp.id);
  assert.ok(after[0].ttl < firstTtl - 0.5, 'repeat fire does not reset the lamp life');
});

function dispatchExpedition(players) {
  for (let seed = 1; seed <= 30; seed++) {
    const run = E.create({ mode: 'random', players, seed });
    if (E.dispatchView(run)) return run;
  }
  assert.fail('at least one seeded expedition should contain a dispatch station');
}

test('the dispatch station keeps the furnace gate optional and synchronizes both circuits across rooms', () => {
  const state = dispatchExpedition(2);
  const station = E.dispatchView(state).room;
  assert.notEqual(station, state.bossIndex);
  assert.equal(E.enterRoom(state, station, true, 'p1'), true);
  assert.equal(E.enterRoom(state, state.bossIndex, true, 'p2'), true);
  Object.assign(state.players.p2, { x: 835, y: 430 });
  state.players.p1.invuln = state.players.p2.invuln = 4;
  const link = channel(state);
  link.receive('linked furnace before awakening');
  assert.equal(link.guest.exploration.dispatch.circuit, 'off');
  assert.equal(link.guest.exploration.bossAwake, false);
  assert.equal(link.guest.enemies.some(enemy => enemy.kind === 'boss'), false);

  state.exploration.kills = state.exploration.target - 1;
  E.step(state, {}, 1 / 60);
  assert.equal(state.exploration.bossAwake, false);
  interactAt(state, 'p1', 'dispatch-light');
  link.receive('light from the station');
  const light = E.dispatchView(link.guest);
  assert.equal(light.arena, true);
  assert.equal(light.circuit, 'light');
  assert.equal(light.lights.length, 2);
  assert.equal(link.guest.exploration.bossAwake, false);

  state.exploration.kills = state.exploration.target;
  E.step(state, {}, 1 / 60);
  link.receive('normal kill threshold awakens the boss');
  assert.equal(link.guest.enemies.some(enemy => enemy.kind === 'boss'), true);
  const patrolDistances = () => link.guest.enemies.filter(enemy => enemy.name === '巡灯机').map(enemy =>
    Math.min(...light.lights.map(lamp => Math.hypot(enemy.x - lamp.x, enemy.y - lamp.y))));
  const initialPatrols = patrolDistances();
  assert.equal(initialPatrols.length, 2);
  for (let i = 0; i < 153; i++) E.step(state, {}, 1 / 60);
  link.receive('patrols follow the lighting circuit');
  assert.ok(patrolDistances().every((distance, index) => distance < initialPatrols[index] - 40));
  interactAt(state, 'p1', 'dispatch-vent');
  link.receive('vent from a different room');
  assert.equal(E.dispatchView(link.guest).circuit, 'vent');
  assert.deepEqual(link.guest.playerRooms, { p1: station, p2: state.bossIndex });
  assert.ok(link.counts[1] >= 2, 'circuit changes are delivered in ordinary deltas');

  for (let i = 0; i < 360 && E.dispatchView(E.viewForPlayer(state, 'p2')).phase !== 'active'; i++) E.step(state, {}, 1 / 60);
  const arena = E.viewForPlayer(state, 'p2');
  assert.equal(E.dispatchView(arena).phase, 'active');
  const boss = arena.enemies.find(enemy => enemy.kind === 'boss');
  const { x, y } = E.dispatchView(arena).vent;
  Object.assign(boss, { x, y, weakTime: 0 });
  E.step(state, {}, 1 / 60);
  link.receive('the guest sees the vent open the boss armor');
  assert.ok(link.guest.enemies.find(enemy => enemy.kind === 'boss').weakTime > 1.9);

  const forged = wire(link.guest);
  forged.exploration.dispatch.room = state.bossIndex;
  assert.equal(client.validateGuest(forged), false, 'the furnace cannot be its own station');
  const base = E.syncBaseline(link.guest), view = E.viewForPlayer(state, 'p2');
  const delta = wire(E.syncDiff(view, base));
  assert.equal(client.validateSync(delta, link.guest, base), true);
  delta.exploration = wire(view.exploration);
  delta.exploration.dispatch.circuit = 'both';
  assert.equal(client.validateSync(delta, link.guest, base), false, 'invalid circuit in an expanded delta');
});

test('a solo route chosen before entering the arena gives one opening per vent pulse', () => {
  const state = dispatchExpedition(1), station = E.dispatchView(state).room;
  assert.equal(E.enterRoom(state, station, true, 'p1'), true);
  interactAt(state, 'p1', 'dispatch-vent');
  assert.equal(E.enterRoom(state, state.bossIndex, true, 'p1'), true);
  assert.equal(E.dispatchView(state).circuit, 'vent');
  state.exploration.kills = state.exploration.target;
  E.step(state, {}, 1 / 60);
  const boss = state.enemies.find(enemy => enemy.kind === 'boss');
  assert.ok(boss);
  for (let i = 0; i < 360 && E.dispatchView(state).phase !== 'warning'; i++) E.step(state, {}, 1 / 60);
  assert.equal(E.dispatchView(state).phase, 'warning');
  for (let i = 0; i < 90 && E.dispatchView(state).phase !== 'active'; i++) E.step(state, {}, 1 / 60);
  assert.equal(E.dispatchView(state).phase, 'active');

  const { x, y } = E.dispatchView(state).vent;
  Object.assign(boss, { x, y, weakTime: 0 });
  E.step(state, {}, 1 / 60);
  const opening = state.exploration.dispatch.openedAt;
  assert.ok(opening > 0 && boss.weakTime > 0);
  Object.assign(boss, { x, y, weakTime: 0 });
  E.step(state, {}, 1 / 60);
  assert.equal(state.exploration.dispatch.openedAt, opening);
  assert.equal(boss.weakTime, 0, 'repeat contact cannot open the same pulse twice');
});
