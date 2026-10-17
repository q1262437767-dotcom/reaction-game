(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AdventureCampaign = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MISSIONS = Object.freeze([
    Object.freeze({ id: 'ember', name: '熄灭炉心', description: '穿过遗迹，击败炉心守卫。', goal: '击败炉心守卫并带回灯芯', reward: 40 }),
    Object.freeze({ id: 'salvage', name: '物资回收', description: '深入遗迹寻找补给，再带着物资撤离。', goal: '收集 3 份补给后撤离', reward: 30 }),
    Object.freeze({ id: 'holdout', name: '信标守夜', description: '启动信标，在守卫围攻中守住求援信号。', goal: '启动信标，守住 3 波后撤离', reward: 35 })
  ]);
  var DIFFICULTIES = Object.freeze([
    Object.freeze({ id: 1, name: '普通', description: '完成三个任务，点亮营地三盏灯。', bonus: 0 }),
    Object.freeze({ id: 2, name: '险境', description: '三盏灯全部点亮后开放；敌人更强，带回更多星屑。', bonus: 20 })
  ]);
  var BADGES = Object.freeze([
    Object.freeze({ id: 'flawless', name: '无伤归来', description: '整场探险没有受到伤害，并成功完成任务。' }),
    Object.freeze({ id: 'explorer', name: '秘径寻光', description: '完成一次隐藏房间的探索。' }),
    Object.freeze({ id: 'lamplighter', name: '三灯重明', description: '完成三个不同的任务，点亮营地三盏灯。' }),
    Object.freeze({ id: 'collector', name: '遗物收藏家', description: '在探险中发现全部六件遗物。' }),
    Object.freeze({ id: 'veteran', name: '险境踏破', description: '在险境难度完成全部三个任务。' })
  ]);
  var RELICS = Object.freeze(['pierce', 'swift', 'vigor', 'resonance', 'riposte', 'decoy']);
  var LIMIT = 1000000;
  var object = function (value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; };
  var count = function (value) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(LIMIT, Math.max(0, Math.floor(value))) : 0;
  };
  var missionById = function (id) { return MISSIONS.find(function (mission) { return mission.id === id; }); };
  var unique = function (values) { return Array.from(new Set(values)); };

  function normalize(raw) {
    raw = object(raw);
    var records = object(raw.missions), missions = {};
    MISSIONS.forEach(function (mission) {
      var saved = object(records[mission.id]);
      var clears = count(saved.clears), hardClears = count(saved.hardClears);
      var bestTime = typeof saved.bestTime === 'number' && Number.isFinite(saved.bestTime) && saved.bestTime >= 0 ? Math.min(saved.bestTime, 86400) : null;
      missions[mission.id] = { clears: Math.max(clears, hardClears), hardClears: hardClears, bestTime: bestTime };
    });
    // Version 1 had one mission only. Its wins remain valid after migration.
    if (raw.v !== 2 && count(raw.wins) > 0) missions.ember.clears = Math.max(missions.ember.clears, count(raw.wins));
    var wins = Math.max(count(raw.wins), MISSIONS.reduce(function (sum, mission) { return sum + missions[mission.id].clears; }, 0));
    var badgeIds = BADGES.map(function (badge) { return badge.id; });
    var badges = unique((Array.isArray(raw.badges) ? raw.badges : []).filter(function (id) { return badgeIds.includes(id); }));
    var relics = unique((Array.isArray(raw.relics) ? raw.relics : []).filter(function (id) { return RELICS.includes(id); }));
    var runIds = unique((Array.isArray(raw.clearedRuns) ? raw.clearedRuns : []).filter(function (id) {
      return typeof id === 'string' && id.length > 0 && id.length <= 160;
    }).slice().reverse()).reverse().slice(-80);
    return { v: 2, coins: count(raw.coins), wins: Math.min(LIMIT, wins), runs: Math.max(count(raw.runs), Math.min(LIMIT, wins)),
      scatter: raw.scatter === true, clearedRuns: runIds, missions: missions, badges: badges, relics: relics };
  }

  function progress(profile) {
    var p = normalize(profile);
    var lit = MISSIONS.filter(function (mission) { return p.missions[mission.id].clears > 0; }).length;
    var hardLit = MISSIONS.filter(function (mission) { return p.missions[mission.id].hardClears > 0; }).length;
    var next = MISSIONS.find(function (mission) { return p.missions[mission.id].clears === 0; });
    return { lit: lit, total: MISSIONS.length, allCleared: lit === MISSIONS.length, hardLit: hardLit,
      hardAllCleared: hardLit === MISSIONS.length, nextMission: next ? next.id : null,
      relicCount: p.relics.length, relicTotal: RELICS.length, badgeCount: p.badges.length, badgeTotal: BADGES.length };
  }

  function canPlay(profile, id, difficulty) {
    var index = MISSIONS.findIndex(function (mission) { return mission.id === id; });
    if (index < 0 || (difficulty !== undefined && difficulty !== 1 && difficulty !== 2)) return false;
    var p = normalize(profile);
    if (index > 0 && p.missions[MISSIONS[index - 1].id].clears === 0) return false;
    return difficulty !== 2 || progress(p).allCleared;
  }

  function canUnlockScatter(profile) {
    var p = normalize(profile);
    return !p.scatter && p.coins >= 30;
  }

  function unlockScatter(profile) {
    var p = normalize(profile);
    if (canUnlockScatter(p)) { p.coins -= 30; p.scatter = true; }
    return p;
  }

  function applyResult(profile, state, runId) {
    var p = normalize(profile), before = progress(p), unlocks = [], newBadges = [];
    var result = { profile: p, reward: 0, unlocks: unlocks, newBadges: newBadges, duplicate: false };
    state = object(state);
    // The practice arena never records rewards, discoveries or expedition history.
    if (state.practice === true) return result;
    if (typeof runId !== 'string' || !runId.trim() || runId.length > 160 || !['won', 'lost'].includes(state.status)) return result;
    if (p.clearedRuns.includes(runId)) { result.duplicate = true; return result; }
    var missionId = object(state.mission).id || 'ember';
    var mission = missionById(missionId), difficulty = state.difficulty === undefined ? 1 : state.difficulty;
    // A malformed result cannot grant currency or unlock a mission.
    // A guest can accompany a host on a mission not yet unlocked in their own camp.
    // Selection locks belong to canPlay; a valid completed expedition still counts.
    if (!mission || (difficulty !== 1 && difficulty !== 2)) return result;
    p.clearedRuns.push(runId); p.clearedRuns = p.clearedRuns.slice(-80); p.runs = Math.min(LIMIT, p.runs + 1);
    var buffs = Array.isArray(state.runBuffs) ? state.runBuffs : Object.keys(object(state.runBuffs)).filter(function (key) { return state.runBuffs[key]; });
    buffs.forEach(function (buff) {
      var id = typeof buff === 'string' ? buff : object(buff).id;
      if (RELICS.includes(id) && !p.relics.includes(id)) p.relics.push(id);
    });
    if (state.status === 'won') {
      var maximum = mission.reward + (difficulty === 2 ? 20 : 0) + (state.secretCleared === true ? 12 : 0);
      var coins = object(state.reward).coins;
      result.reward = typeof coins === 'number' && Number.isFinite(coins) ? Math.min(maximum, count(coins)) : maximum;
      p.coins = Math.min(LIMIT, p.coins + result.reward); p.wins = Math.min(LIMIT, p.wins + 1);
      var record = p.missions[missionId];
      record.clears = Math.min(LIMIT, record.clears + 1);
      if (difficulty === 2) record.hardClears = Math.min(LIMIT, record.hardClears + 1);
      if (typeof state.elapsed === 'number' && Number.isFinite(state.elapsed) && state.elapsed >= 0) {
        var elapsed = Math.min(86400, Math.round(state.elapsed * 10) / 10);
        record.bestTime = record.bestTime === null ? elapsed : Math.min(record.bestTime, elapsed);
      }
      if (object(state.stats).damage === 0) earn('flawless');
    }
    if (state.secretCleared === true) earn('explorer');
    if (p.relics.length === RELICS.length) earn('collector');
    var after = progress(p);
    if (after.allCleared) earn('lamplighter');
    if (after.hardAllCleared) earn('veteran');
    MISSIONS.forEach(function (item) {
      if (!canPlay(profile, item.id, 1) && canPlay(p, item.id, 1)) unlocks.push('新任务：' + item.name);
    });
    if (!before.allCleared && after.allCleared) unlocks.push('险境难度');
    return result;

    function earn(id) {
      if (!p.badges.includes(id)) { p.badges.push(id); newBadges.push(id); }
    }
  }

  return Object.freeze({ MISSIONS: MISSIONS, DIFFICULTIES: DIFFICULTIES, BADGES: BADGES, RELICS: RELICS,
    normalize: normalize, progress: progress, canPlay: canPlay, applyResult: applyResult,
    canUnlockScatter: canUnlockScatter, unlockScatter: unlockScatter });
});
