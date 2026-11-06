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
