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
  var CHAPTER_ONE = Object.freeze([
    Object.freeze({ id: 'chapter1', name: '第一章 · 第一节 · 借火归营', description: '归途灯熄灭，采集队迟迟未归。苔火工坊还有一簇备用火，得先让过热的炉子冷下来。', goal: '疏通进水栅，稳定炉心，再带火种回营点灯', reward: 40 }),
    Object.freeze({ id: 'chapter1_2', name: '第一章 · 第二节 · 木场求援', description: '采集队刚回来，旧木场就打出了求援灯讯。塌棚下有人，吊机却还在运转。', goal: '救出维修工，拉下制动，再停下吊木守卫并接应撤离', reward: 50 }),
    Object.freeze({ id: 'chapter1_3', name: '第一章 · 第三节 · 借走的主芯', description: '木场工人见过一辆沿西线离开的重车。去找陶铆，问清楚他带走了什么。', goal: '找到陶铆，切换配电旁路，打通拨道场接应救援车', reward: 60 }),
    Object.freeze({ id: 'chapter1_4', name: '第一章 · 第四节 · 断轨开路', description: '救援车停在断轨前，追兵却还沿着旧线找来。绕到调度室，看看它们究竟在找什么。', goal: '升桥或引怪破墙，查阅回收令，开闸并点亮冷却站信号', reward: 70 }),
    Object.freeze({ id: 'chapter1_5', name: '第一章 · 第五节 · 末班车', description: '趁追兵还没赶上来，把救援车开到避风车库。等伤员下了车，再处理那盏紧跟主芯的红灯。', goal: '护送伤员，截停归炉者，让归途灯重新亮起来', reward: 70 })
  ]);
  var ARC = Object.freeze([
    Object.freeze({ id: 'chapter2', name: '第二章 · 第一节 · 循光北上', description: '营地北边有人补过灯油。提起灯，穿过会吹灭火的雾。', goal: '提起灯，穿过雾径，找到北坡的应答', reward: 55 }),
    Object.freeze({ id: 'chapter2_2', name: '第二章 · 第二节 · 熄灯哨站', description: '站里的芯被收走了。日志只留着三短一长。', goal: '塔上打灯讯，闸下把闸打开', reward: 55 }),
    Object.freeze({ id: 'chapter2_3', name: '第二章 · 第三节 · 霜塔相认', description: '小穗守着应答塔。南边一亮，蓝灯自己就会回。', goal: '见到小穗，收下灯路图', reward: 55 }),
    Object.freeze({ id: 'chapter2_4', name: '第二章 · 第四节 · 护灯一晚', description: '回声灯卫来吹灭应答灯。真焰不闪，假光会抖。', goal: '用水浇灭回声的灯腔，守住这一晚', reward: 55 }),
    Object.freeze({ id: 'chapter3', name: '第三章 · 第一节 · 水下的线', description: '识别线的电缆埋在冷却渠里。涨水成桥，放水见底。', goal: '用水位找出还能接上的断头', reward: 60 }),
    Object.freeze({ id: 'chapter3_2', name: '第三章 · 第二节 · 听声的廊', description: '长廊里不能喧哗。惊动巡卫，就进不了旧登记库。', goal: '静步通过；可选一条不惊动的支路', reward: 60 }),
    Object.freeze({ id: 'chapter3_3', name: '第三章 · 第三节 · 登记厅', description: '守灯人说他剪过识别线。两端要在同一窗口里合闸。', goal: '听完真相，把一小段线接回去', reward: 60 }),
    Object.freeze({ id: 'chapter3_4', name: '第三章 · 第四节 · 检线', description: '检线官先把人当货物。线接上之后，它的扫描会失效。', goal: '打开护舱，取走两份令稿', reward: 60 }),
    Object.freeze({ id: 'chapter4', name: '第四章 · 第一节 · 再取主芯', description: '主芯比留下时更热。拿起来，追兵就会醒。', goal: '取回主芯，让运芯车出发', reward: 65 }),
    Object.freeze({ id: 'chapter4_2', name: '第四章 · 第二节 · 悬轨换线', description: '总炉的心跳按拍开门。高潮时炉口吞火。', goal: '低潮换道，把车送过悬轨', reward: 65 }),
    Object.freeze({ id: 'chapter4_3', name: '第四章 · 第三节 · 收芯库', description: '被收走的芯还刻着营名。私藏柜可以不打开。', goal: '穿过收芯库，芯还在车上', reward: 65 }),
    Object.freeze({ id: 'chapter4_4', name: '第四章 · 第四节 · 总归炉者', description: '它先追车，再抢芯。衡石在炉门前等着，这一节不打完他。', goal: '守住主芯，走到炉门', reward: 65 }),
    Object.freeze({ id: 'chapter5', name: '第五章 · 第一节 · 炉门之前', description: '衡石要封死总炉。守灯人站在他对面。', goal: '听完，再用光、水和静步走过短廊', reward: 70 }),
    Object.freeze({ id: 'chapter5_2', name: '第五章 · 第二节 · 停令或重明', description: '终端上有两份令。砸炉之前，会先把后果写明白。', goal: '顶住衡石，选定灯路的下一句', reward: 70 }),
    Object.freeze({ id: 'chapter5_3', name: '第五章 · 第三节 · 沿灯回家', description: '没有追兵。灯还亮着多少，取决于你写下的那一句。', goal: '沿灯路走回晨灯下的营地', reward: 40 })
  ]);
  var SECRETS = Object.freeze([
    Object.freeze({ id: 'secret_unlisted', name: '隐藏 · 未登记线', description: '小穗的图上没有这条鬼轨道。检修班在这里失踪。', goal: '在暗处和静步里走完，带回他们的灯芯', reward: 45 })
  ]);
  var CHAPTERS = Object.freeze(CHAPTER_ONE.concat(ARC));
  var STEADY_CART_HP = 10;
  var BADGES = Object.freeze([
    Object.freeze({ id: 'wayhome', name: '归途已明', description: '走完第一章五节，让归途灯重新亮起来。' }),
    Object.freeze({ id: 'steady', name: '稳稳送到', description: '末班车进站时，救援车还剩至少 ' + STEADY_CART_HP + ' 点耐久。' }),
    Object.freeze({ id: 'northlight', name: '北灯相认', description: '走完第二章，问清北边那盏蓝灯是谁点的。' }),
    Object.freeze({ id: 'rethread', name: '一线重接', description: '走完第三章，把一段识别线接回去。' }),
    Object.freeze({ id: 'coresafe', name: '护芯抵达', description: '走完第四章，把主芯送到炉门前。' }),
    Object.freeze({ id: 'sevenlamps', name: '七灯齐明', description: '集齐七盏秘灯，在总炉下重明令。' }),
    Object.freeze({ id: 'flawless', name: '无伤归来', description: '一整局没有受伤，并成功完成章节或任务。' }),
    Object.freeze({ id: 'explorer', name: '秘径寻光', description: '在远征或旧版任务里，走完一间隐藏房间。' }),
    Object.freeze({ id: 'collector', name: '遗物收藏家', description: '发现全部六件遗物。' }),
    Object.freeze({ id: 'lamplighter', legacy: true, name: '三灯重明', description: '在挑战的旧版任务里完成三项，点亮三盏营灯。' }),
    Object.freeze({ id: 'veteran', legacy: true, name: '险境踏破', description: '在险境难度完成全部三个旧版任务。' }),
    Object.freeze({ id: 'wellblue', secret: true, name: '盲井寻蓝', description: '在盲灯井里拾起蓝焰。' }),
    Object.freeze({ id: 'archive', secret: true, name: '库中原令', description: '听声廊里没有惊动巡卫，取回剪线令。' }),
    Object.freeze({ id: 'unlisted', secret: true, name: '未登记通关', description: '走完隐藏的未登记线。' }),
    Object.freeze({ id: 'letter', secret: true, name: '车库旧信', description: '第二章之后重走末班车，打开暖灯后的暗格。' }),
    Object.freeze({ id: 'private', secret: true, name: '陶铆私藏', description: '在收芯库打开陶铆留下的密柜。' }),
    Object.freeze({ id: 'echo', secret: true, name: '回声祠芯', description: '前六灯已齐，由灰尾狐引到回声祠。' }),
    Object.freeze({ id: 'hearth', secret: true, name: '灯在营里', description: '下完结令。回收停了，灯路不再应答。' }),
    Object.freeze({ id: 'ashlamp', secret: true, name: '只剩这一盏', description: '不下令稿，砸毁炉心。营地只剩这一盏灯。' })
  ]);
  var RELICS = Object.freeze(['pierce', 'swift', 'vigor', 'resonance', 'riposte', 'decoy']);
  var STORY_RELICS = Object.freeze(['bluehood', 'moss', 'windfeather', 'pulsering']);
  var LAMP_IDS = Object.freeze(['explorer', 'letter', 'wellblue', 'archive', 'unlisted', 'private', 'echo']);
  var RECORD_IDS = Object.freeze(['trail', 'cooling', 'missing-core', 'timber-tracks', 'timber-bandage', 'rail-tracks', 'rail-order', 'route-shift', 'route-order', 'train-passengers', 'train-refuge']);
  var CAMP_UPGRADES = Object.freeze([
    Object.freeze({ id: 'ward', cost: 40, name: '归途护符', description: '每次出发获得 1 层护符，抵挡一次伤害。' }),
    Object.freeze({ id: 'stride', cost: 60, name: '轻步绑带', description: '闪避冷却从 1.15 秒缩短至 1 秒；疾风羽饰仍为 0.75 秒。' }),
    Object.freeze({ id: 'relicCase', cost: 80, name: '遗物匣', description: '选择一件已发现的遗物带入探险，全队共享。' }),
    Object.freeze({ id: 'lampOil', cost: 50, name: '灯油壶', description: '提灯的油耗得更慢。' }),
    Object.freeze({ id: 'quietSole', cost: 60, name: '软底静步', description: '脚步声传得更近，听声的机器更难发觉。' }),
    Object.freeze({ id: 'railGlove', cost: 70, name: '轨钩手套', description: '运芯车在炉口里伤得更慢。' }),
    Object.freeze({ id: 'dispatch', cost: 80, name: '调度短讯', description: '地图上标出需要人守的终端。' })
  ]);
  var LIMIT = 1000000;
  var object = function (value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; };
  var count = function (value) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(LIMIT, Math.max(0, Math.floor(value))) : 0;
  };
  var missionById = function (id) { return MISSIONS.find(function (mission) { return mission.id === id; }); };
  var unique = function (values) { return Array.from(new Set(values)); };

  function validFoxName(value) {
    return typeof value === 'string' && /^[\u3400-\u9fffA-Za-z0-9 ·_-]{1,12}$/.test(value.trim());
  }

  function normalizeCompanion(raw) {
    raw = object(raw);
    return raw.rescued === true ? { rescued: true, name: validFoxName(raw.name) ? raw.name.trim() : '灰尾狐', equipped: raw.equipped === true } :
      { rescued: false, name: '灰尾狐', equipped: false };
  }

  function normalize(raw) {
    raw = object(raw);
    var records = object(raw.missions), missions = {};
    MISSIONS.concat(CHAPTERS, SECRETS).forEach(function (mission) {
      var saved = object(records[mission.id]);
      var clears = count(saved.clears), hardClears = count(saved.hardClears);
      var bestTime = typeof saved.bestTime === 'number' && Number.isFinite(saved.bestTime) && saved.bestTime >= 0 ? Math.min(saved.bestTime, 86400) : null;
      missions[mission.id] = { clears: Math.max(clears, hardClears), hardClears: hardClears, bestTime: bestTime };
    });
    // Version 1 had one mission only. Its wins remain valid after migration.
    if (raw.v !== 2 && count(raw.wins) > 0) missions.ember.clears = Math.max(missions.ember.clears, count(raw.wins));
    var wins = Math.max(count(raw.wins), MISSIONS.concat(CHAPTERS, SECRETS).reduce(function (sum, mission) { return sum + missions[mission.id].clears; }, 0));
    var badgeIds = BADGES.map(function (badge) { return badge.id; });
    var badges = unique((Array.isArray(raw.badges) ? raw.badges : []).filter(function (id) { return badgeIds.includes(id); }));
    // A finished chapter already satisfies the story badge. Grant it here so an
    // older save shows the record without another run, and never drop a badge
    // the player already earned.
    if (CHAPTER_ONE.every(function (chapter) { return missions[chapter.id].clears > 0; }) && !badges.includes('wayhome')) badges.push('wayhome');
    var knownRelics = RELICS.concat(STORY_RELICS);
    var relics = unique((Array.isArray(raw.relics) ? raw.relics : []).filter(function (id) { return knownRelics.includes(id); }));
    var campRaw = object(raw.camp), upgrades = CAMP_UPGRADES.map(function (upgrade) { return upgrade.id; }).filter(function (id) {
      return Array.isArray(campRaw.upgrades) && campRaw.upgrades.includes(id);
    });
    var startingRelic = upgrades.includes('relicCase') && RELICS.includes(campRaw.startingRelic) && relics.includes(campRaw.startingRelic) ? campRaw.startingRelic : null;
    var records = unique((Array.isArray(campRaw.records) ? campRaw.records : []).filter(function (id) { return RECORD_IDS.includes(id); })).slice(0, RECORD_IDS.length);
    var runIds = unique((Array.isArray(raw.clearedRuns) ? raw.clearedRuns : []).filter(function (id) {
      return typeof id === 'string' && id.length > 0 && id.length <= 160;
    }).slice().reverse()).reverse().slice(-80);
    return { v: 2, coins: count(raw.coins), wins: Math.min(LIMIT, wins), runs: Math.max(count(raw.runs), Math.min(LIMIT, wins)),
      scatter: raw.scatter === true, clearedRuns: runIds, missions: missions, badges: badges, relics: relics,
      camp: { upgrades: upgrades, startingRelic: startingRelic, companion: normalizeCompanion(campRaw.companion), records: records } };
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
    if (SECRETS.some(function (secret) { return secret.id === id; })) return (difficulty === undefined || difficulty === 1) && secretOpen(profile);
    var chapterIndex = CHAPTERS.findIndex(function (chapter) { return chapter.id === id; });
    if (chapterIndex >= 0) return (difficulty === undefined || difficulty === 1) &&
      (chapterIndex === 0 || normalize(profile).missions[CHAPTERS[chapterIndex - 1].id].clears > 0);
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

  function canPurchaseUpgrade(profile, id) {
    var p = normalize(profile), upgrade = CAMP_UPGRADES.find(function (entry) { return entry.id === id; });
    return !!upgrade && !p.camp.upgrades.includes(id) && p.coins >= upgrade.cost &&
      (id !== 'relicCase' || p.relics.length > 0);
  }

  function purchaseUpgrade(profile, id) {
    var p = normalize(profile);
    if (!canPurchaseUpgrade(p, id)) return p;
    var upgrade = CAMP_UPGRADES.find(function (entry) { return entry.id === id; });
    p.coins -= upgrade.cost; p.camp.upgrades.push(id);
    return normalize(p);
  }

  function equipRelic(profile, id) {
    var p = normalize(profile);
    if (id === null || p.camp.upgrades.includes('relicCase') && p.relics.includes(id)) p.camp.startingRelic = id;
    return p;
  }

  function departure(profile) {
    var camp = normalize(profile).camp;
    return { upgrades: camp.upgrades.slice(), startingRelic: camp.startingRelic };
  }

  function rescueFox(profile) {
    var p = normalize(profile);
    if (!p.camp.companion.rescued) p.camp.companion = { rescued: true, name: '灰尾狐', equipped: true };
    return p;
  }

  function renameFox(profile, name) {
    var p = normalize(profile);
    if (p.camp.companion.rescued && validFoxName(name)) p.camp.companion.name = name.trim();
    return p;
  }

  function equipFox(profile, equipped) {
    var p = normalize(profile);
    if (p.camp.companion.rescued && typeof equipped === 'boolean') p.camp.companion.equipped = equipped;
    return p;
  }

  function companionDeparture(profile) {
    var companion = normalize(profile).camp.companion;
    return companion.rescued && companion.equipped ? { kind: 'fox', name: companion.name } : null;
  }

  function secretOpen(profile) {
    var p = normalize(profile);
    return p.badges.includes('explorer') && p.camp.companion.rescued && p.camp.companion.equipped &&
      p.relics.includes('decoy') && RECORD_IDS.every(function (id) { return p.camp.records.includes(id); });
  }

  function lampsReady(profile) {
    var p = normalize(profile);
    return LAMP_IDS.every(function (id) { return p.badges.includes(id); });
  }

  function readCoreSeat(profile) {
    var p = normalize(profile);
    return p.camp.records.includes('missing-core') || p.missions.chapter1.clears > 0;
  }

  function chapterProgress(profile) {
    var normalized = normalize(profile), record = normalized.missions.chapter1, second = normalized.missions.chapter1_2,
      third = normalized.missions.chapter1_3, fourth = normalized.missions.chapter1_4, fifth = normalized.missions.chapter1_5;
    var cleared = [record, second, third, fourth, fifth].filter(function (entry) { return entry.clears > 0; }).length;
    var arcNext = null;
    CHAPTERS.some(function (section) {
      if (normalized.missions[section.id].clears > 0) return false;
      arcNext = section.id === 'chapter1' ? null : section.id;
      return true;
    });
    return { completed: record.clears > 0, clears: record.clears, hardClears: record.hardClears,
      bestTime: record.bestTime, secondCompleted: second.clears > 0, secondClears: second.clears,
      secondBestTime: second.bestTime, thirdCompleted: third.clears > 0, thirdClears: third.clears,
      thirdBestTime: third.bestTime, fourthCompleted: fourth.clears > 0, fourthClears: fourth.clears,
      fourthBestTime: fourth.bestTime, fifthCompleted: fifth.clears > 0, fifthClears: fifth.clears,
      fifthBestTime: fifth.bestTime, cleared: cleared, total: CHAPTER_ONE.length, allCleared: cleared === CHAPTER_ONE.length,
      arcNext: arcNext, arcCleared: ARC.filter(function (section) { return normalized.missions[section.id].clears > 0; }).length,
      arcTotal: ARC.length, secretOpen: secretOpen(normalized), lampsReady: lampsReady(normalized),
      nextChapter: fourth.clears > 0 && fifth.clears === 0 ? 'chapter1_5' :
        third.clears > 0 && fourth.clears === 0 ? 'chapter1_4' :
        second.clears > 0 && third.clears === 0 ? 'chapter1_3' :
        record.clears > 0 && second.clears === 0 ? 'chapter1_2' : null };
  }

  function validRailChapter(chapter, status) {
    var c = object(chapter);
    var keys = ['id', 'version', 'phase', 'clues', 'repairerMet', 'feederRouted', 'bossDefeated', 'reachedCar', 'railPower', 'railCooldown'];
    if (c.id !== 'chapter1_3' || c.version !== 1 || Object.keys(c).length !== keys.length ||
        !keys.every(function (key) { return Object.prototype.hasOwnProperty.call(c, key); }) ||
        !['repairerMet', 'feederRouted', 'bossDefeated', 'reachedCar'].every(function (key) { return typeof c[key] === 'boolean'; }) ||
        !Array.isArray(c.clues) || c.clues.length > 2 || new Set(c.clues).size !== c.clues.length ||
        c.clues.some(function (key) { return !['rail-tracks', 'rail-order'].includes(key); }) ||
        !Number.isFinite(c.railPower) || c.railPower < 0 || c.railPower > 3 ||
        !Number.isFinite(c.railCooldown) || c.railCooldown < c.railPower || c.railCooldown > 5 ||
        c.feederRouted && !c.repairerMet || c.bossDefeated && !c.feederRouted || c.reachedCar && !c.bossDefeated) return false;
    if (status === 'won') return c.phase === 'complete' && c.reachedCar;
    if (status === 'lost') return c.phase === 'failed' && !c.reachedCar;
    return status === 'playing' && !c.reachedCar &&
      (c.bossDefeated ? c.phase === 'car' : c.repairerMet ? c.phase === 'guard' : ['arrive', 'track'].includes(c.phase));
  }

  function canUseSpear(profile) {
    return normalize(profile).missions.chapter1.clears > 0;
  }

  function validRouteChapter(chapter, status) {
    var c = object(chapter);
    var keys = ['id', 'version', 'phase', 'clues', 'pinTaken', 'bridgeRaised', 'wallBreached', 'gateOpened', 'signalLit'];
    if (c.id !== 'chapter1_4' || c.version !== 1 || Object.keys(c).length !== keys.length ||
        !keys.every(function (key) { return Object.prototype.hasOwnProperty.call(c, key); }) ||
        !['pinTaken', 'bridgeRaised', 'wallBreached', 'gateOpened', 'signalLit'].every(function (key) { return typeof c[key] === 'boolean'; }) ||
        !Array.isArray(c.clues) || c.clues.length > 2 || new Set(c.clues).size !== c.clues.length ||
        c.clues.some(function (key) { return !['route-shift', 'route-order'].includes(key); }) ||
        c.bridgeRaised && !c.pinTaken || c.clues.includes('route-order') && !c.bridgeRaised && !c.wallBreached ||
        c.gateOpened && !c.clues.includes('route-order') ||
        c.signalLit && !c.gateOpened) return false;
    if (status === 'won') return c.phase === 'complete' && c.signalLit;
    if (status === 'lost') return c.phase === 'failed' && !c.signalLit;
    return status === 'playing' && !c.signalLit && (c.gateOpened ? c.phase === 'signal' :
      c.clues.includes('route-order') ? c.phase === 'gate' : c.bridgeRaised || c.wallBreached ? c.phase === 'dispatch' :
        ['arrive', 'routes'].includes(c.phase));
  }

  function validTrainChapter(chapter, status) {
    var c = object(chapter), cart = object(c.cart), ending = object(c.ending);
    var keys = ['id', 'version', 'phase', 'clues', 'started', 'gateOpened', 'coolingStarted', 'coolingLeft', 'cooled', 'arrived', 'unloaded', 'repairsLeft', 'cart', 'ending'];
    var cartKeys = ['roomIndex', 'x', 'y', 'hp', 'maxHp', 'moving', 'hitCd'];
    if (c.id !== 'chapter1_5' || c.version !== 1 || Object.keys(c).length !== keys.length ||
        !keys.every(function (key) { return Object.prototype.hasOwnProperty.call(c, key); }) ||
        !['started', 'gateOpened', 'coolingStarted', 'cooled', 'arrived', 'unloaded'].every(function (key) { return typeof c[key] === 'boolean'; }) ||
        !Array.isArray(c.clues) || c.clues.length > 2 || new Set(c.clues).size !== c.clues.length ||
        c.clues.some(function (key) { return !['train-passengers', 'train-refuge'].includes(key); }) ||
        !Number.isInteger(c.repairsLeft) || c.repairsLeft < 0 || c.repairsLeft > 2 ||
        !Number.isFinite(c.coolingLeft) || c.coolingLeft < 0 || c.coolingLeft > 10 ||
        Object.keys(cart).length !== cartKeys.length || !cartKeys.every(function (key) { return Object.prototype.hasOwnProperty.call(cart, key); }) ||
        !Number.isInteger(cart.roomIndex) || ![0, 1, 2, 4, 5, 6, 7].includes(cart.roomIndex) ||
        !Number.isFinite(cart.x) || cart.x < 180 || cart.x > 780 || cart.y !== 300 ||
        !Number.isInteger(cart.hp) || cart.hp < 0 || cart.hp > 14 || cart.maxHp !== 14 || typeof cart.moving !== 'boolean' ||
        !Number.isFinite(cart.hitCd) || cart.hitCd < 0 || cart.hitCd > .8 ||
        Object.keys(ending).length !== 4 ||
        !['diverted', 'stopped', 'lampLit'].every(function (key) { return typeof ending[key] === 'boolean'; }) ||
        !Number.isFinite(ending.ventLeft) || ending.ventLeft < 0 || ending.ventLeft > 7 ||
        ending.diverted && !c.unloaded || ending.stopped && !ending.diverted || ending.lampLit && !ending.stopped ||
        ending.ventLeft > 0 && (!ending.diverted || ending.stopped)) return false;
    if (!c.started && (cart.roomIndex !== 0 || cart.x !== 180 || cart.hp !== 14 || cart.moving || c.gateOpened || c.coolingStarted || c.arrived) ||
        !c.coolingStarted && (c.coolingLeft !== 0 || c.cooled) ||
        c.coolingStarted && (!c.started || cart.roomIndex < 4) ||
        c.cooled && c.coolingLeft !== 0 || cart.roomIndex >= 4 && !c.gateOpened ||
        cart.roomIndex > 4 && !c.cooled ||
        c.arrived && (!c.started || !c.gateOpened || !c.cooled || cart.roomIndex !== 7 || cart.x !== 680 || cart.moving) ||
        c.unloaded && (!c.arrived || cart.hp <= 0) || cart.moving && (!c.started || c.arrived || cart.hp <= 0 || c.coolingStarted && !c.cooled)) return false;
    if (status === 'won') return c.phase === 'complete' && ending.lampLit;
    if (status === 'lost') return c.phase === 'failed' && !ending.lampLit;
    if (status !== 'playing' || ending.lampLit || cart.hp <= 0) return false;
    var phase = c.unloaded ? !ending.diverted ? 'divert' : !ending.stopped ? 'returner' : 'relight' :
      !c.started ? 'board' : c.arrived ? 'unload' : c.coolingStarted && !c.cooled ? 'cooling' :
      cart.roomIndex === 2 && cart.x >= 600 && !c.gateOpened ? 'gate' :
      cart.roomIndex === 4 && cart.x >= 480 && !c.coolingStarted ? 'water' : 'escort';
    return c.phase === phase && (!['gate', 'water', 'cooling'].includes(phase) || !cart.moving);
  }

  var STORY_CLUES = Object.freeze(['north-oil', 'north-signal', 'xiaosui', 'lamp-map', 'heng-sign', 'echo-note', 'cable', 'register-hint', 'quiet-log', 'cut-order', 'heng-note', 'keeper-talk', 'drafts', 'core-hot', 'pulse-route', 'cabinet-names', 'heng-call', 'door-talk', 'proof', 'ash-warn', 'home-true', 'home-normal', 'home-ash', 'dawn', 'unlisted-log', 'crew-core', 'code-set', 'core-taken', 'cabinet-lit']);
  var STORY_KEYS = Object.freeze(['id', 'version', 'phase', 'clues', 'oil', 'lit', 'bearer', 'hung', 'water', 'pulse', 'link', 'linkLeft', 'cartHp', 'cartRoom', 'cartX', 'ending', 'alerted', 'lamp', 'anchor']);
  var LAMP_FROM = Object.freeze({ chapter2: 'wellblue', chapter3_2: 'archive', chapter4_3: 'private', chapter5: 'echo', secret_unlisted: 'unlisted' });

  function inRange(value, max, min) {
    return typeof value === 'number' && Number.isFinite(value) && value >= (min || 0) && value <= max;
  }

  function validStoryChapter(chapter, status, missionId) {
    var c = object(chapter);
    if (!ARC.concat(SECRETS).some(function (section) { return section.id === missionId; })) return false;
    if (c.id !== missionId || c.version !== 1 || Object.keys(c).length !== STORY_KEYS.length ||
        !STORY_KEYS.every(function (key) { return Object.prototype.hasOwnProperty.call(c, key); })) return false;
    if (!['arrive', 'mid', 'boss', 'down', 'choice', 'complete', 'failed'].includes(c.phase)) return false;
    if (!Array.isArray(c.clues) || c.clues.length > 4 || new Set(c.clues).size !== c.clues.length ||
        c.clues.some(function (id) { return !STORY_CLUES.includes(id); })) return false;
    if (!inRange(c.oil, 100) || typeof c.lit !== 'boolean' || !['', 'p1', 'p2'].includes(c.bearer)) return false;
    if (!Number.isInteger(c.hung) || c.hung < -1 || c.hung > 15 || !Number.isInteger(c.water) || c.water < 0 || c.water > 2) return false;
    if (!inRange(c.pulse, 7) || !Number.isInteger(c.link) || c.link < 0 || c.link > 2 || !inRange(c.linkLeft, 30)) return false;
    if (!inRange(c.cartHp, 14) || !Number.isInteger(c.cartRoom) || c.cartRoom < 0 || c.cartRoom > 15 || !inRange(c.cartX, 960)) return false;
    if (!['', 'normal', 'true', 'ash', 'warn'].includes(c.ending) || typeof c.alerted !== 'boolean') return false;
    if (!Number.isInteger(c.anchor) || c.anchor < -1 || c.anchor > 15) return false;
    var lamp = LAMP_FROM[missionId] || '';
    if (c.lamp !== '' && c.lamp !== lamp) return false;
    if (missionId === 'chapter5_2') {
      if (status === 'won') return c.phase === 'complete' && ['normal', 'true', 'ash'].includes(c.ending);
      if (status === 'lost') return c.phase === 'failed' && c.ending !== 'normal' && c.ending !== 'true' && c.ending !== 'ash';
      return status === 'playing' && c.phase !== 'complete' && c.phase !== 'failed';
    }
    if (missionId === 'chapter5_3') {
      if (![ '', 'normal', 'true', 'ash' ].includes(c.ending)) return false;
    } else if (c.ending !== '' && !(status === 'playing' && c.ending === 'warn')) return false;
    if (status === 'won') return c.phase === 'complete';
    if (status === 'lost') return c.phase === 'failed';
    return status === 'playing' && c.phase !== 'complete' && c.phase !== 'failed';
  }

  function collectedOriginals(p) {
    return RELICS.every(function (id) { return p.relics.includes(id); });
  }

  function takeRelics(p, list) {
    (Array.isArray(list) ? list : []).forEach(function (buff) {
      var id = typeof buff === 'string' ? buff : object(buff).id;
      if ((RELICS.includes(id) || STORY_RELICS.includes(id)) && !p.relics.includes(id)) p.relics.push(id);
    });
  }

  function rememberRecords(p, clues) {
    (Array.isArray(clues) ? clues : []).forEach(function (id) {
      if (RECORD_IDS.includes(id) && p.camp.records.indexOf(id) < 0) p.camp.records.push(id);
    });
  }

  function arcReward(id) {
    if (id.indexOf('chapter2') === 0) return 55;
    if (id.indexOf('chapter3') === 0) return 60;
    if (id.indexOf('chapter4') === 0) return 65;
    if (id === 'chapter5' || id === 'chapter5_2') return 70;
    if (id === 'chapter5_3') return 40;
    if (id === 'secret_unlisted') return 45;
    return 0;
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
    if (state.mode === 'chapter' && ARC.concat(SECRETS).some(function (section) { return section.id === missionId; })) {
      if (difficulty !== 1 || !validStoryChapter(state.chapter, state.status, missionId)) return result;
      if (state.status === 'won' && state.chapter.ending === 'true' && !LAMP_IDS.every(function (id) { return p.badges.includes(id); })) return result;
      p.clearedRuns.push(runId); p.clearedRuns = p.clearedRuns.slice(-80); p.runs = Math.min(LIMIT, p.runs + 1);
      takeRelics(p, state.runBuffs);
      rememberRecords(p, state.chapter.clues);
      if (collectedOriginals(p)) earn('collector');
      if (state.status === 'won') {
        var arcCap = arcReward(missionId), arcCoins = object(state.reward).coins;
        result.reward = typeof arcCoins === 'number' && Number.isFinite(arcCoins) ? Math.min(arcCap, count(arcCoins)) : arcCap;
        p.coins = Math.min(LIMIT, p.coins + result.reward); p.wins = Math.min(LIMIT, p.wins + 1);
        var arcRecord = p.missions[missionId];
        arcRecord.clears = Math.min(LIMIT, arcRecord.clears + 1);
        if (typeof state.elapsed === 'number' && Number.isFinite(state.elapsed) && state.elapsed >= 0) {
          var arcTime = Math.min(86400, Math.round(state.elapsed * 10) / 10);
          arcRecord.bestTime = arcRecord.bestTime === null ? arcTime : Math.min(arcRecord.bestTime, arcTime);
        }
        if (object(state.stats).damage === 0) earn('flawless');
        if (state.chapter.lamp) earn(state.chapter.lamp);
        if (missionId === 'chapter5_2') {
          if (state.chapter.ending === 'normal') earn('hearth');
          if (state.chapter.ending === 'true') earn('sevenlamps');
          if (state.chapter.ending === 'ash') earn('ashlamp');
        }
        [['northlight', ['chapter2', 'chapter2_2', 'chapter2_3', 'chapter2_4']],
          ['rethread', ['chapter3', 'chapter3_2', 'chapter3_3', 'chapter3_4']],
          ['coresafe', ['chapter4', 'chapter4_2', 'chapter4_3', 'chapter4_4']]].forEach(function (pair) {
          if (pair[1].every(function (id) { return p.missions[id].clears > 0; })) earn(pair[0]);
        });
        if (arcRecord.clears === 1) {
          var fresh = ARC.concat(SECRETS).find(function (section) { return section.id === missionId; });
          if (fresh) unlocks.push(fresh.name);
        }
      }
      return result;
    }
    if (state.mode === 'chapter' && ['chapter1_2', 'chapter1_3', 'chapter1_4', 'chapter1_5'].includes(missionId)) {
      var rail = missionId === 'chapter1_3', route = missionId === 'chapter1_4', train = missionId === 'chapter1_5';
      var timber = object(state.chapter), sectionWon = state.status === 'won', cart = object(timber.cart);
      var timberKeys = ['id', 'version', 'phase', 'clues', 'cart', 'workerFreed', 'brakeSet', 'bossDefeated', 'evacuated', 'suppliesTaken', 'shortcutOpen'];
      if (difficulty !== 1) return result;
      if (train) {
        if (!validTrainChapter(state.chapter, state.status)) return result;
      } else if (route) {
        if (!validRouteChapter(state.chapter, state.status)) return result;
      } else if (rail) {
        if (!validRailChapter(state.chapter, state.status)) return result;
      } else if (timber.id !== 'chapter1_2' || timber.version !== 1 ||
          Object.keys(timber).length !== timberKeys.length || !timberKeys.every(function (key) { return Object.prototype.hasOwnProperty.call(timber, key); }) ||
          !['workerFreed', 'brakeSet', 'bossDefeated', 'evacuated', 'suppliesTaken', 'shortcutOpen'].every(function (key) { return typeof timber[key] === 'boolean'; }) ||
          !Array.isArray(timber.clues) || timber.clues.length > 2 || new Set(timber.clues).size !== timber.clues.length ||
          timber.clues.some(function (clue) { return !['timber-tracks', 'timber-bandage'].includes(clue); }) ||
          Object.keys(cart).length !== 2 || !Object.prototype.hasOwnProperty.call(cart, 'position') || !Object.prototype.hasOwnProperty.call(cart, 'target') ||
          !Number.isFinite(cart.position) || cart.position < 0 || cart.position > 1 || ![0, 1].includes(cart.target) ||
          timber.shortcutOpen !== timber.workerFreed || timber.brakeSet && !timber.workerFreed || timber.bossDefeated && !timber.brakeSet ||
          timber.evacuated !== sectionWon || sectionWon && (!timber.workerFreed || !timber.bossDefeated) ||
          timber.phase !== (sectionWon ? 'complete' : 'failed')) return result;
      p.clearedRuns.push(runId); p.clearedRuns = p.clearedRuns.slice(-80); p.runs = Math.min(LIMIT, p.runs + 1);
      (Array.isArray(state.runBuffs) ? state.runBuffs : []).forEach(function (buff) {
        if (RELICS.includes(buff) && !p.relics.includes(buff)) p.relics.push(buff);
      });
      if (collectedOriginals(p)) earn('collector');
      if (sectionWon) {
        var chapterCap = train || route ? 70 : rail ? 60 : 50, sectionCoins = object(state.reward).coins;
        result.reward = typeof sectionCoins === 'number' && Number.isFinite(sectionCoins) ? Math.min(chapterCap, count(sectionCoins)) : chapterCap;
        p.coins = Math.min(LIMIT, p.coins + result.reward); p.wins = Math.min(LIMIT, p.wins + 1);
        var sectionRecord = p.missions[missionId];
        sectionRecord.clears = Math.min(LIMIT, sectionRecord.clears + 1);
        if (typeof state.elapsed === 'number' && Number.isFinite(state.elapsed) && state.elapsed >= 0) {
          var sectionTime = Math.min(86400, Math.round(state.elapsed * 10) / 10);
          sectionRecord.bestTime = sectionRecord.bestTime === null ? sectionTime : Math.min(sectionRecord.bestTime, sectionTime);
        }
        grantChapterBadges();
        if (sectionRecord.clears === 1) {
          if (train) unlocks.push('第一章《归途灯》完成 · 归炉者已停机');
          else if (route) unlocks.push('第四节完成 · 冷却站信号已亮', '第五节解锁 · 末班车');
          else if (rail) unlocks.push('第三节完成 · 找到救援车', '第四节解锁 · 断轨开路');
          else unlocks.push('第二节完成 · 维修工回营', '第三节解锁 · 借走的主芯');
        }
      }
      rememberRecords(p, object(state.chapter).clues);
      return result;
    }
    if (state.mode === 'chapter') {
      var chapter = object(state.chapter), won = state.status === 'won';
      if (missionId !== 'chapter1' || difficulty !== 1 || chapter.id !== 'chapter1' || chapter.version !== 1 ||
          !['intakeOpen', 'sluiceOpen', 'bossDefeated', 'fireTaken', 'lampLit', 'suppliesTaken', 'beaconLit'].every(function (key) { return typeof chapter[key] === 'boolean'; }) ||
          chapter.sluiceOpen && !chapter.intakeOpen || chapter.lampLit !== won || chapter.fireTaken && !chapter.bossDefeated || chapter.bossDefeated && !chapter.sluiceOpen ||
          chapter.lampLit && !chapter.fireTaken || chapter.phase !== (won ? 'complete' : 'failed')) return result;
      p.clearedRuns.push(runId); p.clearedRuns = p.clearedRuns.slice(-80); p.runs = Math.min(LIMIT, p.runs + 1);
      (Array.isArray(state.runBuffs) ? state.runBuffs : []).forEach(function (buff) {
        if (RELICS.includes(buff) && !p.relics.includes(buff)) p.relics.push(buff);
      });
      if (collectedOriginals(p)) earn('collector');
      if (won) {
        var chapterCoins = object(state.reward).coins;
        result.reward = typeof chapterCoins === 'number' && Number.isFinite(chapterCoins) ? Math.min(40, count(chapterCoins)) : 40;
        p.coins = Math.min(LIMIT, p.coins + result.reward); p.wins = Math.min(LIMIT, p.wins + 1);
        var chapterRecord = p.missions.chapter1;
        chapterRecord.clears = Math.min(LIMIT, chapterRecord.clears + 1);
        if (typeof state.elapsed === 'number' && Number.isFinite(state.elapsed) && state.elapsed >= 0) {
          var chapterTime = Math.min(86400, Math.round(state.elapsed * 10) / 10);
          chapterRecord.bestTime = chapterRecord.bestTime === null ? chapterTime : Math.min(chapterRecord.bestTime, chapterTime);
        }
        grantChapterBadges();
        if (!chapterProgress(profile).completed) {
          unlocks.push('第一节完成 · 归途灯重明', '武器解锁 · 遗迹长枪', '第二节解锁 · 木场求援');
        }
      }
      rememberRecords(p, chapter.clues);
      return result;
    }
    if (CHAPTERS.some(function (chapter) { return chapter.id === missionId; })) return result;
    // A malformed result cannot grant currency or unlock a mission.
    // A guest can accompany a host on a mission not yet unlocked in their own camp.
    // Selection locks belong to canPlay; a valid completed expedition still counts.
    if (!mission || (difficulty !== 1 && difficulty !== 2)) return result;
    // Standalone modes share the existing save format and have their own rewards.
    // Their completion never lights story lamps or unlocks later story missions.
    if (state.mode === 'relay' || state.mode === 'hunt') {
      var standalone = object(state[state.mode]);
      var identity = state.mode === 'hunt' ? standalone.targetId : standalone.coreId;
      var complete = state.mode === 'hunt' ? standalone.defeated : standalone.delivered;
      var rewardCap = state.mode === 'hunt' ? 32 : 24;
      if (missionId !== 'salvage' || difficulty !== 1 || typeof identity !== 'string' || !identity ||
          typeof complete !== 'boolean' || complete !== (state.status === 'won')) return result;
      p.clearedRuns.push(runId); p.clearedRuns = p.clearedRuns.slice(-80);
      p.runs = Math.min(LIMIT, p.runs + 1);
      if (state.status === 'won') {
        var standaloneCoins = object(state.reward).coins;
        result.reward = typeof standaloneCoins === 'number' && Number.isFinite(standaloneCoins) ? Math.min(rewardCap, count(standaloneCoins)) : rewardCap;
        p.coins = Math.min(LIMIT, p.coins + result.reward);
        p.wins = Math.min(LIMIT, p.wins + 1);
      }
      return result;
    }
    var fox = object(state.foxRescue);
    if (state.mode === 'random' && missionId === 'ember' && fox.rescued === true && Number.isInteger(fox.roomIndex) &&
        Array.isArray(state.rooms) && state.rooms.length === 12 && fox.roomIndex > 0 && fox.roomIndex < state.rooms.length &&
        object(state.rooms[fox.roomIndex]).index === fox.roomIndex && state.rooms[fox.roomIndex].visited === true && !p.camp.companion.rescued) {
      p.camp.companion = { rescued: true, name: '灰尾狐', equipped: true };
      unlocks.push('营地伙伴 · 灰尾狐');
    }
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
    if (collectedOriginals(p)) earn('collector');
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
    function grantChapterBadges() {
      if (object(state.stats).damage === 0) earn('flawless');
      if ((object(state.mission).id) === 'chapter1_5' && object(object(state.chapter).cart).hp >= STEADY_CART_HP) earn('steady');
      if (CHAPTER_ONE.every(function (chapter) { return p.missions[chapter.id].clears > 0; })) earn('wayhome');
      if (state.storyFind === 'letter' && p.missions.chapter2.clears > 0) earn('letter');
      rememberRecords(p, object(state.chapter).clues);
    }
  }

  function journalView(profile) {
    var p = normalize(profile), chapter = chapterProgress(p);
    var present = function (badge) {
      return { id: badge.id, name: badge.name, description: badge.description, earned: p.badges.includes(badge.id) };
    };
    return {
      cleared: chapter.cleared, total: chapter.total, allCleared: chapter.allCleared,
      sections: CHAPTER_ONE.map(function (section) {
        var record = p.missions[section.id];
        return { id: section.id, name: section.name.replace(/^第一章 · /, ''), clears: record.clears, done: record.clears > 0 };
      }),
      arc: ARC.concat(SECRETS).map(function (section) {
        var record = p.missions[section.id];
        return { id: section.id, name: section.name, clears: record.clears, done: record.clears > 0, open: canPlay(p, section.id, 1) };
      }),
      records: RECORD_IDS.map(function (id) { return { id: id, read: p.camp.records.includes(id) }; }),
      secretLamps: LAMP_IDS.map(function (id) {
        var badge = BADGES.find(function (item) { return item.id === id; }) || { name: id, description: '' };
        return { id: id, name: badge.name, description: badge.description, earned: p.badges.includes(id) };
      }),
      storyBadges: BADGES.filter(function (badge) { return badge.legacy !== true && badge.secret !== true; }).map(present),
      secretBadges: BADGES.filter(function (badge) { return badge.secret === true; }).map(present),
      legacyBadges: BADGES.filter(function (badge) { return badge.legacy === true; }).map(present),
      lamps: MISSIONS.map(function (mission) {
        var record = p.missions[mission.id];
        return { id: mission.id, name: mission.name, lit: record.clears > 0, clears: record.clears };
      })
    };
  }

  return Object.freeze({ MISSIONS: MISSIONS, CHAPTERS: CHAPTERS, CHAPTER_ONE: CHAPTER_ONE, ARC: ARC, SECRETS: SECRETS, DIFFICULTIES: DIFFICULTIES, BADGES: BADGES, RELICS: RELICS, STORY_RELICS: STORY_RELICS, LAMP_IDS: LAMP_IDS, RECORD_IDS: RECORD_IDS, CAMP_UPGRADES: CAMP_UPGRADES,
    normalize: normalize, progress: progress, canPlay: canPlay, applyResult: applyResult,
    chapterProgress: chapterProgress, journalView: journalView, validRailChapter: validRailChapter, validRouteChapter: validRouteChapter, validTrainChapter: validTrainChapter, validStoryChapter: validStoryChapter, secretOpen: secretOpen, lampsReady: lampsReady, readCoreSeat: readCoreSeat, canUseSpear: canUseSpear, canUnlockScatter: canUnlockScatter, unlockScatter: unlockScatter,
    canPurchaseUpgrade: canPurchaseUpgrade, purchaseUpgrade: purchaseUpgrade, equipRelic: equipRelic, departure: departure,
    validFoxName: validFoxName, rescueFox: rescueFox, renameFox: renameFox, equipFox: equipFox, companionDeparture: companionDeparture });
});
