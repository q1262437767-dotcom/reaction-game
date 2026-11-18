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
  vm.runInContext(between('  function safeCampLoadout(', '  function sendCampLoadout(') + diagnostic + `
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

test('guest receives the inspection hatch opening from two rooms and its full weakpoint time', () => {
  const state = E.create({ mode: 'chapter', mission: 'chapter3_4', players: 2, seed: 61 });
  E.enterRoom(state, 1, true, 'p1');
  E.enterRoom(state, 2, true, 'p2');
  const remote = channel(state);
  remote.receive('closed hatch');
  interactAt(state, 'p1', 'story-link');
  remote.receive('first end');
  assert.equal(remote.guest.chapter.link, 1);
  interactAt(state, 'p2', 'story-link');
  remote.receive('both ends');
  assert.equal(remote.guest.chapter.link, 2);
  assert.equal(remote.guest.enemies.find(e => e.kind === 'surveyor').weakTime, 6);
  assertValid(wire(E.snapshot(E.viewForPlayer(state, 'p2'), true)), 'full hatch opening refresh');
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
