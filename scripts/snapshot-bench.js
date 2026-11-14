/* Compare the pre-protocol-23 full clone with the current snapshot and sync patch.
 * Run from the repo root: node scripts/snapshot-bench.js
 */
'use strict';

const E = require('../adventure/engine.js');

function legacySnapshot(s) {
  const result = JSON.parse(JSON.stringify(s));
  delete result._split;
  delete result.railAlly;
  result.roomData = {};
  result.particles = result.particles.slice(-24);
  result.events = result.events.slice(-12);
  result.enemies.forEach(function (enemy) { delete enemy.navX; delete enemy.navY; delete enemy.navTime; });
  return result;
}

function wire(value) {
  return JSON.parse(JSON.stringify(value));
}

function bytes(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

function time(fn, count) {
  const start = process.hrtime.bigint();
  let last;
  for (let i = 0; i < count; i += 1) last = fn();
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  return { ms: ms / count, last };
}

function same(a, b, path, mismatches) {
  if (Object.is(a, b)) return;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    mismatches.push(path + ' ' + a + ' !== ' + b);
    return;
  }
  const aKeys = Object.keys(a), bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) mismatches.push(path + ' keys ' + aKeys.length + ' !== ' + bKeys.length);
  const keys = new Set(aKeys.concat(bKeys));
  for (const key of keys) same(a[key], b[key], path + '.' + key, mismatches);
}

function near(actual, expected, limit, label, failures) {
  if (typeof expected === 'number') {
    if (!Number.isFinite(actual) || Math.abs(actual - expected) > limit) failures.push(label + ' ' + actual + ' vs ' + expected);
    return;
  }
  if (actual !== expected) failures.push(label + ' ' + actual + ' vs ' + expected);
}

function fight(state, frames) {
  for (let i = 0; i < frames; i += 1) {
    E.step(state, {
      p1: { mx: i % 120 < 60 ? 1 : -0.4, my: 0.25, aimX: 520 + (i % 30) * 6, aimY: 280, shoot: true, dash: i % 70 === 0, guard: i % 100 > 80 },
      p2: { mx: 0.2, my: i % 80 < 40 ? 1 : -1, aimX: 640, aimY: 320, shoot: i % 2 === 0, guard: i % 90 < 20, interact: i % 110 === 0 }
    }, 1 / 60);
    if (state.status !== 'playing') break;
  }
  return state;
}

function scenario(name, create) {
  const state = create();
  fight(state, 60 * 6);
  const roomDataBytes = bytes(state.roomData);
  const legacy = time(function () { return legacySnapshot(state); }, 80);
  const current = time(function () { return E.snapshot(state, true); }, 80);
  const mismatches = [];
  same(wire(current.last), legacy.last, name, mismatches);
  const legacyPacket = time(function () { return JSON.stringify({ type: 'state', state: legacySnapshot(state), runId: 'bench', rev: 2 }); }, 40);
  const fullPacket = time(function () { return JSON.stringify({ type: 'state', state: E.snapshot(state, true), runId: 'bench', rev: 2 }); }, 40);
  let stamp = E.networkStamp(state);
  let linkage = E.linkageStamp(state);
  let guest = wire(E.snapshot(state, true));
  let syncBytes = 0, syncBuild = 0, syncString = 0, syncCount = 0, fullCount = 0, fullBytes = 0;
  const failures = [];
  for (let frame = 0; frame < 20; frame += 1) {
    fight(state, 3);
    if (state.room && state.rooms && frame === 10) {
      const next = state.room.neighbors && state.room.neighbors[0];
      if (Number.isInteger(next)) E.enterRoom(state, next);
    }
    const nextStamp = E.networkStamp(state);
    const needFull = nextStamp !== stamp || frame % 8 === 0;
    if (needFull || state.room.index !== guest.room.index) {
      const built = time(function () { return E.snapshot(state, true); }, 1);
      const packet = JSON.stringify({ type: 'state', state: built.last, runId: 'bench', rev: fullCount + 2 });
      guest = JSON.parse(packet).state;
      stamp = nextStamp;
      linkage = E.linkageStamp(state);
      fullCount += 1;
      fullBytes += Buffer.byteLength(packet);
      continue;
    }
    const skip = E.linkageStamp(state) === linkage;
    const built = time(function () { return E.syncPatch(state, skip); }, 1);
    const encoded = time(function () { return JSON.stringify({ type: 'sync', runId: 'bench', rev: 2, room: state.room.index, state: built.last }); }, 1);
    syncBuild += built.ms;
    syncString += encoded.ms;
    syncBytes += Buffer.byteLength(encoded.last);
    syncCount += 1;
    // Every fifth incremental packet is dropped. A dropped geometry update must
    // be repeated by the next packet, matching a failed host send.
    if (frame % 5 === 0) continue;
    if (!skip) linkage = E.linkageStamp(state);
    E.applySync(guest, JSON.parse(encoded.last).state);
    near(guest.players.p1.x, state.players.p1.x, 0.011, name + ' p1.x', failures);
    near(guest.players.p1.y, state.players.p1.y, 0.011, name + ' p1.y', failures);
    near(guest.players.p1.hp, state.players.p1.hp, 0.011, name + ' p1.hp', failures);
    near(guest.enemies.length, state.enemies.length, 0, name + ' enemies', failures);
    near(guest.bullets.length, state.bullets.length, 0, name + ' bullets', failures);
    if (guest.walls.length !== state.walls.length) failures.push(name + ' walls ' + guest.walls.length);
    guest.enemies.forEach(function (enemy) {
      if ('navX' in enemy || 'navY' in enemy || 'navTime' in enemy) failures.push(name + ' nav leaked');
    });
  }
  // A dropped incremental packet must not survive the next full snapshot.
  guest = wire(E.snapshot(state, true));
  near(guest.players.p1.x, state.players.p1.x, 0, name + ' resync x', failures);
  if (guest.roomData && Object.keys(guest.roomData).length) failures.push(name + ' roomData leaked');
  const busySync = E.syncPatch(state, E.linkageStamp(state) === linkage);
  return {
    name: name,
    status: state.status,
    room: state.room && state.room.index,
    enemies: state.enemies.length,
    bullets: state.bullets.length,
    particles: state.particles.length,
    roomDataBytes: roomDataBytes,
    legacySnapshotMs: Number(legacy.ms.toFixed(3)),
    snapshotMs: Number(current.ms.toFixed(3)),
    legacyPacketMs: Number(legacyPacket.ms.toFixed(3)),
    fullPacketMs: Number(fullPacket.ms.toFixed(3)),
    legacyBytes: Buffer.byteLength(legacyPacket.last),
    fullBytes: Buffer.byteLength(fullPacket.last),
    syncBytes: bytes({ type: 'sync', runId: 'bench', rev: 2, room: state.room.index, state: busySync }),
    syncBuildMs: Number((syncCount ? syncBuild / syncCount : 0).toFixed(3)),
    syncStringMs: Number((syncCount ? syncString / syncCount : 0).toFixed(3)),
    meanSyncBytes: syncCount ? Math.round(syncBytes / syncCount) : 0,
    fullCount: fullCount,
    syncCount: syncCount,
    mismatches: mismatches.slice(0, 8),
    failures: failures.slice(0, 12)
  };
}

const results = [
  scenario('story', function () {
    const state = E.create({ mode: 'story', players: 2, seed: 7, mission: 'ember', difficulty: 1 });
    E.enterRoom(state, 1);
    return state;
  }),
  scenario('random', function () {
    const state = E.create({ mode: 'random', players: 2, seed: 11, difficulty: 2, companion: { kind: 'fox', name: '灰尾' }, partnerCompanion: { kind: 'fox', name: '小狐' }, camp: { upgrades: ['ward'], startingRelic: null }, partnerCamp: { upgrades: [] } });
    const battle = state.rooms.find(function (room) { return room.kind === 'battle'; });
    E.enterRoom(state, battle.index);
    return state;
  }),
  scenario('chapter', function () {
    const state = E.create({ mode: 'chapter', players: 2, seed: 3, mission: 'chapter1' });
    E.enterRoom(state, 1);
    return state;
  }),
  scenario('timber', function () {
    const state = E.create({ mode: 'chapter', players: 2, seed: 4, mission: 'chapter1_2' });
    E.enterRoom(state, 5);
    return state;
  }),
  scenario('relay', function () { return E.create({ mode: 'relay', players: 2, seed: 9 }); }),
  scenario('hunt', function () { return E.create({ mode: 'hunt', players: 2, seed: 13 }); })
];

function cartDrift() {
  const state = E.create({ mode: 'chapter', players: 2, seed: 4, mission: 'chapter1_2' });
  E.enterRoom(state, 1);
  E.enterRoom(state, 2);
  E.enterRoom(state, 5);
  state.players.p1.x = 180; state.players.p1.y = 300;
  state.players.p2.x = 220; state.players.p2.y = 340;
  state.chapter.cart.target = 1;
  let guest = wire(E.snapshot(state, true));
  let linkage = E.linkageStamp(state);
  const failures = [];
  for (let i = 0; i < 45; i += 1) {
    E.step(state, { p1: { mx: 0, my: 0, aimX: 120, aimY: 120 }, p2: { mx: 0, my: 0, aimX: 160, aimY: 160 } }, 1 / 60);
    if (E.networkStamp(state) !== E.networkStamp(guest)) {
      guest = wire(E.snapshot(state, true));
      linkage = E.linkageStamp(state);
    } else {
      const skip = E.linkageStamp(state) === linkage;
      const patch = E.syncPatch(state, skip);
      if (i % 4 !== 0) {
        if (!skip) linkage = E.linkageStamp(state);
        E.applySync(guest, wire(patch));
      }
    }
    const hostWall = state.walls.find(function (wall) { return wall.timberCart; });
    const guestWall = guest.walls.find(function (wall) { return wall.timberCart; });
    if (!hostWall || !guestWall) failures.push('missing cart ' + i);
    else if (i % 4 !== 0 && Math.abs(hostWall.y - guestWall.y) > 0.011) failures.push('cart ' + i + ' ' + hostWall.y + ' vs ' + guestWall.y);
  }
  return failures;
}

const cartFailures = cartDrift();
if (cartFailures.length) {
  console.error(JSON.stringify({ cartFailures: cartFailures.slice(0, 8) }));
  process.exit(1);
}

let failed = 0;
results.forEach(function (result) {
  if (result.mismatches.length || result.failures.length) failed += 1;
  console.log(JSON.stringify(result));
});
if (failed) {
  console.error('SNAPSHOT_BENCH_FAIL ' + failed);
  process.exit(1);
}
console.log('SNAPSHOT_BENCH_OK');
