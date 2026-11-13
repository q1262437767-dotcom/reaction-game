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
      intakeOpen: true, sluiceOpen: true, bossDefeated: true, fireTaken: true, lampLit: true,
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
      repairerMet: true, feederRouted: true, bossDefeated: true, reachedCar: true, railPower: 0, railCooldown: 0
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
    pinTaken: true, bridgeRaised: true, wallBreached: false, gateOpened: true, signalLit: true }, extra);
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
    }, extra.cart), ending: Object.assign({
      diverted: true, stopped: true, lampLit: true, ventLeft: 0
    }, extra.ending) });
}

const trainUnfinished = { diverted: false, stopped: false, lampLit: false, ventLeft: 0 };

test('the fifth section unlocks after the fourth and settles only after the final lamp', () => {
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
  const loss = { ...state, status: 'lost', chapter: trainChapter({ phase: 'failed', unloaded: false, cart: { hp: 0 }, ending: trainUnfinished }) };
  assert.equal(C.applyResult(old, loss, 'train-loss').reward, 0);
  assert.equal(C.applyResult(old, loss, 'train-loss').profile.runs, 2);
  assert.equal(C.applyResult(old, loss, 'train-loss').profile.missions.chapter1_5.clears, 0);
});

test('train chapter validation follows physical stops and rejects premature or malformed completion', () => {
  const board = trainChapter({ phase: 'board', clues: [], started: false, gateOpened: false,
    coolingStarted: false, coolingLeft: 0, cooled: false, arrived: false, unloaded: false, repairsLeft: 2,
    cart: { roomIndex: 0, x: 180, hp: 14 }, ending: trainUnfinished });
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
  assert(C.validTrainChapter(trainChapter({ phase: 'unload', unloaded: false, ending: trainUnfinished }), 'playing'));
  assert(C.validTrainChapter(trainChapter({ phase: 'divert', ending: trainUnfinished }), 'playing'));
  assert(C.validTrainChapter(trainChapter({ phase: 'returner', ending: { diverted: true, stopped: false, lampLit: false, ventLeft: 3.6 } }), 'playing'));
  assert(C.validTrainChapter(trainChapter({ phase: 'relight', ending: { lampLit: false } }), 'playing'));
  assert(C.validTrainChapter(trainChapter({ phase: 'failed', ending: { stopped: false, lampLit: false } }), 'lost'));
  const invalids = [trainChapter({ unloaded: false }), trainChapter({ arrived: false }),
    trainChapter({ gateOpened: false }), trainChapter({ cooled: false }),
    trainChapter({ cart: { hp: 0 } }), trainChapter({ cart: { x: 679 } }),
    trainChapter({ cart: { roomIndex: 3 } }), trainChapter({ cart: { maxHp: 1000 } }),
    trainChapter({ cart: { moving: true } }), trainChapter({ coolingLeft: .5 }),
    trainChapter({ repairsLeft: 3 }), trainChapter({ extra: true }),
    trainChapter({ cart: { extra: true } }), trainChapter({ version: 2 }),
    trainChapter({ clues: ['train-passengers', 'train-passengers'] }),
    trainChapter({ clues: ['other'] }), trainChapter({ ending: trainUnfinished }),
    trainChapter({ ending: { diverted: false } }), trainChapter({ ending: { stopped: false } }),
    trainChapter({ ending: { lampLit: false } })];
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

function clearedChapters(ids) {
  const missions = {};
  for (const id of ids) missions[id] = { clears: 1, hardClears: 0, bestTime: 20 };
  return { v: 2, missions };
}

test('chapter badges are earned from the five sections and a steady final cart', () => {
  const ids = ['chapter1', 'chapter1_2', 'chapter1_3', 'chapter1_4', 'chapter1_5'];
  assert.equal(C.chapterProgress(clearedChapters(ids.slice(0, 4))).cleared, 4);
  assert.equal(C.chapterProgress(clearedChapters(ids.slice(0, 4))).allCleared, false);
  assert.equal(C.normalize(clearedChapters(ids.slice(0, 4))).badges.includes('wayhome'), false);

  const almost = clearedChapters(ids.slice(0, 4));
  const shaky = C.applyResult(almost, storyWin({
    mode: 'chapter', mission: { id: 'chapter1_5' }, stats: { damage: 1 },
    chapter: trainChapter({ cart: { hp: 9 } })
  }), 'train-shaky');
  assert.equal(shaky.profile.missions.chapter1_5.clears, 1);
  assert.deepEqual(shaky.newBadges, ['wayhome']);
  assert.equal(shaky.profile.badges.includes('steady'), false);
  assert.equal(C.chapterProgress(shaky.profile).allCleared, true);

  const steady = C.applyResult(almost, storyWin({
    mode: 'chapter', mission: { id: 'chapter1_5' }, stats: { damage: 0 },
    chapter: trainChapter({ cart: { hp: 10 } })
  }), 'train-steady');
  assert.deepEqual(steady.newBadges, ['flawless', 'steady', 'wayhome']);
  const again = C.applyResult(steady.profile, storyWin({
    mode: 'chapter', mission: { id: 'chapter1_5' }, chapter: trainChapter({ cart: { hp: 14 } })
  }), 'train-steady');
  assert.equal(again.duplicate, true);
  assert.equal(again.newBadges.length, 0);

  const lost = C.applyResult(almost, storyWin({
    status: 'lost', mode: 'chapter', mission: { id: 'chapter1_5' },
    chapter: trainChapter({ phase: 'failed', unloaded: false, cart: { hp: 0 }, ending: trainUnfinished })
  }), 'train-badge-loss');
  assert.equal(lost.profile.badges.includes('wayhome'), false);
  assert.equal(lost.profile.badges.includes('steady'), false);

  const onlyFinal = C.applyResult(null, storyWin({
    mode: 'chapter', mission: { id: 'chapter1_5' }, chapter: trainChapter({ cart: { hp: 14 } })
  }), 'train-only');
  assert.equal(onlyFinal.profile.badges.includes('steady'), true);
  assert.equal(onlyFinal.profile.badges.includes('wayhome'), false);
});

test('finished chapter saves gain the story badge without losing older ones', () => {
  const saved = C.normalize({
    v: 2,
    badges: ['veteran', 'lamplighter', 'flawless', 'explorer', 'collector', 'not-a-badge'],
    relics: ['pierce', 'swift', 'vigor', 'resonance', 'riposte', 'decoy'],
    missions: {
      ember: { clears: 3, hardClears: 2, bestTime: 11 },
      salvage: { clears: 1, hardClears: 1, bestTime: 12 },
      holdout: { clears: 1, hardClears: 1, bestTime: 13 },
      chapter1: { clears: 1, hardClears: 0, bestTime: 30 },
      chapter1_2: { clears: 2, hardClears: 0, bestTime: 40 },
      chapter1_3: { clears: 1, hardClears: 0, bestTime: 50 },
      chapter1_4: { clears: 1, hardClears: 0, bestTime: 60 },
      chapter1_5: { clears: 1, hardClears: 0, bestTime: 70 }
    }
  });
  for (const id of ['veteran', 'lamplighter', 'flawless', 'explorer', 'collector', 'wayhome']) {
    assert.ok(saved.badges.includes(id), id);
  }
  assert.equal(saved.badges.includes('not-a-badge'), false);
  assert.equal(saved.badges.includes('steady'), false);
  assert.equal(saved.badges.filter(id => id === 'wayhome').length, 1);
  assert.equal(saved.v, 2);
  assert.equal(C.normalize(saved).badges.includes('wayhome'), true);
  for (const id of ['wayhome', 'steady', 'flawless', 'explorer', 'collector']) {
    assert.equal(C.BADGES.find(badge => badge.id === id).legacy, undefined);
  }
  const journal = C.journalView(saved);
  assert.equal(journal.allCleared, true);
  assert.equal(journal.cleared, 5);
  assert.equal(journal.total, 5);
  assert.deepEqual(journal.sections.map(section => section.done), [true, true, true, true, true]);
  assert.deepEqual(journal.storyBadges.map(badge => badge.id), ['wayhome', 'steady', 'northlight', 'rethread', 'coresafe', 'sevenlamps', 'flawless', 'explorer', 'collector']);
  assert.equal(journal.storyBadges.find(badge => badge.id === 'wayhome').earned, true);
  assert.equal(journal.storyBadges.find(badge => badge.id === 'steady').earned, false);
  assert.deepEqual(journal.legacyBadges.map(badge => badge.id), ['lamplighter', 'veteran']);
  assert.equal(journal.legacyBadges.every(badge => badge.earned), true);
  assert.deepEqual(journal.lamps.map(lamp => lamp.lit), [true, true, true]);
});

test('old challenge lamps still award their badges and stay out of the story journal', () => {
  let profile = null;
  for (const id of ['ember', 'salvage', 'holdout']) {
    profile = C.applyResult(profile, storyWin({ difficulty: 2, mission: { id } }), 'hard-' + id).profile;
  }
  assert.ok(profile.badges.includes('lamplighter'));
  assert.ok(profile.badges.includes('veteran'));
  assert.equal(profile.badges.includes('wayhome'), false);
  const journal = C.journalView(profile);
  assert.equal(journal.cleared, 0);
  assert.equal(journal.legacyBadges.every(badge => badge.earned), true);
  assert.equal(journal.storyBadges.find(badge => badge.id === 'wayhome').earned, false);
  assert.equal(journal.lamps.every(lamp => lamp.lit), true);
});
