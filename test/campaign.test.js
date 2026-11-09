'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const C = require('../adventure/campaign.js');

function storyWin(extra) {
  return Object.assign({
    status: 'won',
    mode: 'story',
    difficulty: 1,
    mission: { id: 'ember' },
    reward: { coins: 9999 },
    elapsed: 12.34,
    stats: { damage: 0 }
  }, extra);
}

test('the richest story win pays 72 and a loss pays nothing', () => {
  const win = C.applyResult(null, storyWin({ difficulty: 2, secretCleared: true }), 'run-win');
  assert.equal(win.reward, 72);
  assert.equal(win.profile.coins, 72);
  assert.equal(win.profile.wins, 1);
  assert.equal(win.profile.runs, 1);
  assert.equal(win.profile.missions.ember.clears, 1);
  assert.equal(win.profile.missions.ember.hardClears, 1);
  assert.equal(win.profile.missions.ember.bestTime, 12.3);
  assert.ok(win.profile.badges.includes('flawless'));
  assert.ok(win.profile.badges.includes('explorer'));
  assert.deepEqual(win.profile.clearedRuns, ['run-win']);

  const loss = C.applyResult(win.profile, storyWin({ status: 'lost', reward: { coins: 72 } }), 'run-loss');
  assert.equal(loss.reward, 0);
  assert.equal(loss.profile.coins, 72);
  assert.equal(loss.profile.wins, 1);
  assert.equal(loss.profile.runs, 2);
});

test('a repeated expedition id does not pay twice', () => {
  const first = C.applyResult(null, storyWin(), 'same-run');
  const again = C.applyResult(first.profile, storyWin(), 'same-run');
  assert.equal(again.duplicate, true);
  assert.equal(again.profile.coins, first.profile.coins);
  assert.equal(again.profile.runs, 1);
});

test('practice, chapter, hunt, and relay stay inside the cloud coin caps', () => {
  const practice = C.applyResult(null, { practice: true, status: 'won', reward: { coins: 100 } }, 'practice');
  assert.equal(practice.reward, 0);
  assert.equal(practice.profile.runs, 0);

  const chapter = C.applyResult(null, {
    status: 'won', mode: 'chapter', difficulty: 1, mission: { id: 'chapter1' },
    chapter: {
      id: 'chapter1', version: 1, phase: 'complete',
      sluiceOpen: true, bossDefeated: true, fireTaken: true, lampLit: true,
      suppliesTaken: false, beaconLit: false
    },
    reward: { coins: 500 }, elapsed: 40, stats: { damage: 1 }, runBuffs: []
  }, 'chapter-run');
  assert.equal(chapter.reward, 40);
  assert.equal(chapter.profile.missions.chapter1.clears, 1);
  assert.equal(C.canUseSpear(chapter.profile), true);
  assert.equal(C.canPlay(chapter.profile, 'chapter1_2', 1), true);
  assert.equal(C.canPlay(null, 'chapter1_2', 1), false);

  const hunt = C.applyResult(null, {
    status: 'won', mode: 'hunt', difficulty: 1, mission: { id: 'salvage' },
    hunt: { targetId: 'beast', defeated: true }, reward: { coins: 999 }
  }, 'hunt-run');
  assert.equal(hunt.reward, 32);

  const relay = C.applyResult(null, {
    status: 'won', mode: 'relay', difficulty: 1, mission: { id: 'salvage' },
    relay: { coreId: 'core', delivered: true }, reward: { coins: 999 }
  }, 'relay-run');
  assert.equal(relay.reward, 24);
});

test('camp purchases spend the published prices and fox names reject markup', () => {
  let profile = C.normalize({ coins: 210, relics: ['pierce'] });
  assert.equal(C.unlockScatter(profile).coins, 180);
  profile = C.unlockScatter(profile);
  assert.equal(C.unlockScatter(profile).scatter, true);
  assert.equal(C.unlockScatter(profile).coins, 180);

  profile = C.purchaseUpgrade(profile, 'ward');
  profile = C.purchaseUpgrade(profile, 'stride');
  profile = C.purchaseUpgrade(profile, 'relicCase');
  assert.deepEqual(profile.camp.upgrades, ['ward', 'stride', 'relicCase']);
  assert.equal(profile.coins, 0);
  assert.equal(C.purchaseUpgrade(profile, 'ward').coins, 0);

  profile = C.rescueFox(profile);
  assert.equal(profile.camp.companion.name, '灰尾狐');
  profile = C.renameFox(profile, ' 小灰 ');
  assert.equal(profile.camp.companion.name, '小灰');
  assert.equal(C.renameFox(profile, '<img src=x>').camp.companion.name, '小灰');
  assert.equal(C.validFoxName('<b>fox</b>'), false);
  assert.deepEqual(C.companionDeparture(C.equipFox(profile, true)), { kind: 'fox', name: '小灰' });
});

test('the third section unlocks from old saves and settles its own record once', () => {
  const old = { v: 2, missions: { chapter1_2: { clears: 1, hardClears: 0, bestTime: 68 } } };
  assert.equal(C.canPlay(null, 'chapter1_3', 1), false);
  assert.equal(C.canPlay(old, 'chapter1_3', 1), true);
  assert.equal(C.canPlay(old, 'chapter1_3', 2), false);
  assert.equal(C.chapterProgress(old).nextChapter, 'chapter1_3');
  const rail = storyWin({
    mode: 'chapter', mission: { id: 'chapter1_3' },
    chapter: {
      id: 'chapter1_3', version: 1, phase: 'complete', clues: ['rail-tracks'],
      repairerMet: true, bossDefeated: true, reachedCar: true, railPower: 0, railCooldown: 0
    }
  });
  const clear = C.applyResult(old, rail, 'rail-win');
  assert.equal(clear.reward, 60);
  assert.equal(clear.profile.missions.chapter1_2.clears, 1);
  assert.deepEqual(clear.profile.missions.chapter1_3, { clears: 1, hardClears: 0, bestTime: 12.3 });
  assert.equal(C.chapterProgress(clear.profile).thirdCompleted, true);
  assert.equal(C.applyResult(clear.profile, rail, 'rail-win').duplicate, true);
  assert.equal(C.applyResult(null, rail, 'rail-guest-win').profile.missions.chapter1_3.clears, 1);
  const invalid = { ...rail, chapter: { ...rail.chapter, reachedCar: false } };
  assert.equal(C.applyResult(old, invalid, 'rail-no-car').profile.runs, 1);
  const loss = { ...rail, status: 'lost', chapter: { ...rail.chapter, phase: 'failed', reachedCar: false } };
  assert.equal(C.applyResult(old, loss, 'rail-loss').profile.runs, 2);
  assert.equal(C.applyResult(old, loss, 'rail-loss').reward, 0);
});

function routeChapter(extra) {
  return Object.assign({ id: 'chapter1_4', version: 1, phase: 'complete', clues: ['route-order'],
    bridgeRaised: true, wallBreached: false, gateOpened: true, signalLit: true }, extra);
}

test('the fourth section unlocks after the third and records a bounded 70-coin clear', () => {
  const old = { v: 2, missions: { chapter1_3: { clears: 1, hardClears: 0, bestTime: 80 } } };
  assert.equal(C.CHAPTERS[3].id, 'chapter1_4');
  assert.equal(C.CHAPTERS[3].reward, 70);
  assert.equal(C.canPlay(null, 'chapter1_4', 1), false);
  assert.equal(C.canPlay({ v: 2, missions: { chapter1_2: { clears: 1 } } }, 'chapter1_4', 1), false);
  assert.equal(C.canPlay(old, 'chapter1_4', 1), true);
  assert.equal(C.canPlay(old, 'chapter1_4', 2), false);
  assert.equal(C.chapterProgress(old).nextChapter, 'chapter1_4');
  const state = storyWin({ mode: 'chapter', mission: { id: 'chapter1_4' }, chapter: routeChapter() });
  const result = C.applyResult(old, state, 'route-win');
  assert.equal(result.reward, 70);
  assert.equal(result.profile.v, 2);
  assert.equal(result.profile.coins, 70);
  assert.equal(result.profile.runs, 2);
  assert.equal(result.profile.missions.chapter1_3.clears, 1);
  assert.deepEqual(result.profile.missions.chapter1_4, { clears: 1, hardClears: 0, bestTime: 12.3 });
  assert.equal(C.chapterProgress(result.profile).fourthCompleted, true);
  assert.equal(C.chapterProgress(result.profile).nextChapter, 'chapter1_5');
  assert.equal(C.applyResult(result.profile, state, 'route-win').duplicate, true);
  // Guests keep their own result even when the host selected a locked section.
  assert.equal(C.applyResult(null, state, 'route-guest-win').profile.missions.chapter1_4.clears, 1);
  assert.equal(C.applyResult(old, { ...state, mode: 'story' }, 'route-as-story').profile.runs, 1);
  const loss = { ...state, status: 'lost', chapter: routeChapter({ phase: 'failed', signalLit: false }) };
  assert.equal(C.applyResult(old, loss, 'route-loss').reward, 0);
  assert.equal(C.applyResult(old, loss, 'route-loss').profile.runs, 2);
  assert.equal(C.applyResult(old, loss, 'route-loss').profile.missions.chapter1_4.clears, 0);
});

test('fourth-section validation follows both routes and requires a real signal completion', () => {
  for (const route of [{ bridgeRaised: true, wallBreached: false }, { bridgeRaised: false, wallBreached: true },
    { bridgeRaised: true, wallBreached: true }]) {
    assert(C.validRouteChapter(routeChapter(route), 'won'));
    assert(C.validRouteChapter(routeChapter({ ...route, phase: 'signal', signalLit: false }), 'playing'));
  }
  const initial = routeChapter({ phase: 'arrive', clues: [], bridgeRaised: false, gateOpened: false, signalLit: false });
  assert(C.validRouteChapter(initial, 'playing'));
  assert(C.validRouteChapter({ ...initial, phase: 'routes' }, 'playing'));
  assert(C.validRouteChapter({ ...initial, phase: 'dispatch', wallBreached: true }, 'playing'));
  assert(C.validRouteChapter({ ...initial, phase: 'gate', clues: ['route-order'], wallBreached: true }, 'playing'));
  for (const chapter of [routeChapter({ signalLit: false }), routeChapter({ gateOpened: false }),
    routeChapter({ clues: ['route-shift'] }), routeChapter({ bridgeRaised: false }),
    routeChapter({ clues: ['route-order', 'route-order'] }), routeChapter({ clues: ['other'] }),
    routeChapter({ signalLit: 1 }), routeChapter({ extra: true }), routeChapter({ version: 2 })]) {
    assert.equal(C.validRouteChapter(chapter, 'won'), false);
    const result = C.applyResult(null, storyWin({ mode: 'chapter', mission: { id: 'chapter1_4' }, chapter }), 'invalid-route');
    assert.equal(result.profile.runs, 0);
    assert.equal(result.reward, 0);
  }
  assert.equal(C.validRouteChapter(routeChapter(), 'playing'), false);
  assert.equal(C.validRouteChapter(routeChapter({ phase: 'failed' }), 'lost'), false);
});

function trainChapter(extra = {}) {
  return Object.assign({ id: 'chapter1_5', version: 1, phase: 'complete', clues: ['train-passengers'],
    started: true, gateOpened: true, coolingStarted: true, coolingLeft: 0, cooled: true, arrived: true,
    unloaded: true, repairsLeft: 1 }, extra, { cart: Object.assign({
      roomIndex: 7, x: 680, y: 300, hp: 10, maxHp: 14, moving: false, hitCd: 0
    }, extra.cart) });
}

test('the fifth section unlocks after the fourth and settles only an unloaded living rescue car', () => {
  const old = { v: 2, missions: { chapter1_4: { clears: 1, hardClears: 0, bestTime: 80 } } };
  assert.equal(C.CHAPTERS[4].id, 'chapter1_5');
  assert.equal(C.CHAPTERS[4].reward, 70);
  assert.equal(C.canPlay(null, 'chapter1_5', 1), false);
  assert.equal(C.canPlay({ v: 2, missions: { chapter1_3: { clears: 1 } } }, 'chapter1_5', 1), false);
  assert.equal(C.canPlay(old, 'chapter1_5', 1), true);
  assert.equal(C.canPlay(old, 'chapter1_5', 2), false);
  assert.equal(C.chapterProgress(old).nextChapter, 'chapter1_5');
  const state = storyWin({ mode: 'chapter', mission: { id: 'chapter1_5' }, chapter: trainChapter() });
  const result = C.applyResult(old, state, 'train-win');
  assert.equal(result.reward, 70);
  assert.equal(result.profile.v, 2);
  assert.equal(result.profile.coins, 70);
  assert.equal(result.profile.missions.chapter1_4.clears, 1);
  assert.deepEqual(result.profile.missions.chapter1_5, { clears: 1, hardClears: 0, bestTime: 12.3 });
  assert.equal(C.chapterProgress(result.profile).fifthCompleted, true);
  assert.equal(C.chapterProgress(result.profile).nextChapter, null);
  assert.equal(C.applyResult(result.profile, state, 'train-win').duplicate, true);
  assert.equal(C.applyResult(null, state, 'train-guest-win').profile.missions.chapter1_5.clears, 1);
  assert.equal(C.applyResult(old, { ...state, mode: 'story' }, 'train-as-story').profile.runs, 1);
  const loss = { ...state, status: 'lost', chapter: trainChapter({ phase: 'failed', unloaded: false, cart: { hp: 0 } }) };
  assert.equal(C.applyResult(old, loss, 'train-loss').reward, 0);
  assert.equal(C.applyResult(old, loss, 'train-loss').profile.runs, 2);
  assert.equal(C.applyResult(old, loss, 'train-loss').profile.missions.chapter1_5.clears, 0);
});

test('train chapter validation follows physical stops and rejects premature or malformed completion', () => {
  const board = trainChapter({ phase: 'board', clues: [], started: false, gateOpened: false,
    coolingStarted: false, coolingLeft: 0, cooled: false, arrived: false, unloaded: false, repairsLeft: 2,
    cart: { roomIndex: 0, x: 180, hp: 14 } });
  assert(C.validTrainChapter(board, 'playing'));
  const moving = { ...board, started: true, phase: 'escort', cart: { ...board.cart, roomIndex: 1, x: 480, moving: true } };
  assert(C.validTrainChapter(moving, 'playing'));
  const gate = { ...moving, phase: 'gate', cart: { ...moving.cart, roomIndex: 2, x: 600, moving: false } };
  assert(C.validTrainChapter(gate, 'playing'));
  const water = { ...gate, phase: 'water', gateOpened: true, cart: { ...gate.cart, roomIndex: 4, x: 480 } };
  assert(C.validTrainChapter(water, 'playing'));
  const cooling = { ...water, phase: 'cooling', coolingStarted: true, coolingLeft: 10 };
  assert(C.validTrainChapter(cooling, 'playing'));
  assert(C.validTrainChapter({ ...cooling, coolingLeft: 0 }, 'playing'), 'compact snapshots may round sub-0.005 seconds to zero');
  assert(C.validTrainChapter(trainChapter({ phase: 'unload', unloaded: false }), 'playing'));
  const invalids = [trainChapter({ unloaded: false }), trainChapter({ arrived: false }),
    trainChapter({ gateOpened: false }), trainChapter({ cooled: false }),
    trainChapter({ cart: { hp: 0 } }), trainChapter({ cart: { x: 679 } }),
    trainChapter({ cart: { roomIndex: 3 } }), trainChapter({ cart: { maxHp: 1000 } }),
    trainChapter({ cart: { moving: true } }), trainChapter({ coolingLeft: .5 }),
    trainChapter({ repairsLeft: 3 }), trainChapter({ extra: true }),
    trainChapter({ cart: { extra: true } }), trainChapter({ version: 2 }),
    trainChapter({ clues: ['train-passengers', 'train-passengers'] }),
    trainChapter({ clues: ['other'] })];
  for (const chapter of invalids) {
    assert.equal(C.validTrainChapter(chapter, 'won'), false);
    const result = C.applyResult(null, storyWin({ mode: 'chapter', mission: { id: 'chapter1_5' }, chapter }), 'invalid-train');
    assert.equal(result.profile.runs, 0);
    assert.equal(result.reward, 0);
  }
  assert.equal(C.validTrainChapter(trainChapter(), 'playing'), false);
  assert.equal(C.validTrainChapter(trainChapter({ phase: 'failed' }), 'lost'), false);
  assert.equal(C.validTrainChapter({ ...board, gateOpened: true }, 'playing'), false);
  assert.equal(C.validTrainChapter({ ...gate, cart: { ...gate.cart, moving: true } }, 'playing'), false);
  assert.equal(C.validTrainChapter({ ...water, cart: { ...water.cart, roomIndex: 5 } }, 'playing'), false);
});
