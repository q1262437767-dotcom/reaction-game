(function () {
  'use strict';
  const E = window.AdventureEngine, R = window.AdventureRenderer, C = window.AdventureCampaign;
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const STORE = 'ruins-squad-camp-v2', LEGACY_STORE = 'ruins-squad-camp-v1';
  const TUTORIAL_STORE = 'ruins-squad-tutorial-v1';
  const RHYTHM_TUTORIAL_STORE = 'ruins-squad-rhythm-tutorial-v2';
  const RELAY_TUTORIAL_STORE = 'ruins-squad-relay-tutorial-v1';
  const HUNT_TUTORIAL_STORE = 'ruins-squad-hunt-tutorial-v1';
  const WEAPONS_TUTORIAL_STORE = 'ruins-squad-weapons-tutorial-v1';
  const TOUCH_STORE = 'ruins-squad-touch-controls-v1';
  const MELEE_STORE = 'ruins-squad-melee-choice-v1';
  let touchPreference = readTouchPreference(), touchSeen = false, joystickId = null;
  let meleeChoice = readMeleeChoice();
  const touchPointers = new Map();
  let camp, storageOK = true, state = null, mode = 'solo', net = null;
  let account = null;
  let paused = false, disconnected = false, runId = '', finished = '', remoteWeapon = 'pistol', remoteMelee = 'blade';
  let remoteCamp = { upgrades: [] };
  let remoteCompanion = null;
  let remoteFoxRescued = false;
  let remoteCampReady = false;
  let remoteInput = {}, remoteAt = 0, remoteSeq = -1, seq = 0, lastSend = 0;
  let last = 0, accumulator = 0, lastHud = 0, toastTimer, dialogPaused = false;
  let muted = false, audio = null, soundLast = 0, uiSoundAt = -Infinity, resultNext = null;
  const heardEvents = new Set(), soundNodes = new Set(), soundAt = new Map(), chapterNotesSeen = new Set(), chapterMomentsSeen = new Set();
  const keys = new Set(), mouse = { x: 650, y: 300, down: false, guard: false, active: false };
  const touch = { mx: 0, my: 0, shoot: false, dash: false, guard: false, interact: false, switchWeapon: false };
  let dashPulse = false, guardPulse = false, interactPulse = false, switchPulse = false;
  let tutorialPending = false, remoteTutorialPending = false, rhythmTutorial = false, relayTutorial = false, huntTutorial = false;
  let menuScreen = 'title';
  let homeAccountReturn = false;
  let chapterEnding = null, chapterEndingEligible = '';
  const dialogIds = ['help-dialog', 'camp-dialog', 'coop-dialog', 'account-dialog', 'settings-dialog'];
  const blank = () => C.normalize(null);
  function readCamp() {
    if (account) return account.readLocal();
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || localStorage.getItem(LEGACY_STORE) || 'null');
      return C.normalize(raw);
    } catch (_) { storageOK = false; return camp || blank(); }
  }
  function writeCamp() {
    if (account) { account.writeLocal(camp); updateCamp(); return; }
    try { localStorage.setItem(STORE, JSON.stringify(camp)); }
    catch (_) { storageOK = false; toast('浏览器未允许保存，营地进度暂存在本次页面中。'); }
    updateCamp();
  }
  camp = readCamp();
  const localId = () => mode === 'guest' ? 'p2' : 'p1';
  const playing = () => !!state && state.status === 'playing';
  const hasDialog = () => dialogIds.some(id => $(id).open);
  const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function clearChapterEnding() {
    chapterEnding = null; chapterEndingEligible = '';
    $('chapter-ending').hidden = true;
    $('game-wrap').setAttribute('data-chapter-ending', 'false');
  }
  function chapterEndingActive() {
    return !!(chapterEnding && chapterEnding.runId === runId && state && state.mode === 'chapter' && state.status === 'won');
  }
  function presentResults() {
    $('end-screen').hidden = false;
    $(mode === 'guest' ? 'end-camp' : 'end-next-action').focus();
    menuSound(state.status === 'won' ? 'win' : 'lost');
  }
  function chapterEndingCaption() {
    const age = chapterEnding.age;
    $('chapter-ending-line').textContent = age < 1.5 ? '灯亮了，东边传来了脚步声。' : age < 6.5 ? '阿禾：老岑！我们回来了！他腿伤了，快搭把手。' : age < 9 ? '老岑：哎，来了！先扶他坐下。' : '阿禾：等等……旧木场那边，是不是有人在打灯？';
  }
  function finishChapterEnding() {
    if (!chapterEndingActive()) return;
    clearChapterEnding(); clearInput(); presentResults();
  }
  function beginChapterEnding() {
    chapterEnding = { runId, age: 0, last: 0 };
    clearTimeout(toastTimer); $('toast').hidden = true;
    $('interaction-hint').hidden = true; $('end-screen').hidden = true;
    $('chapter-ending').hidden = false;
    $('game-wrap').setAttribute('data-chapter-ending', 'true');
    chapterEndingCaption(); $('chapter-ending-skip').focus();
  }
  function advanceChapterEnding(now) {
    if (!chapterEndingActive()) {
      if (chapterEnding) clearChapterEnding();
      return;
    }
    if (paused || hasDialog() || document.hidden) { chapterEnding.last = 0; return; }
    if (chapterEnding.last) chapterEnding.age = Math.min(12, chapterEnding.age + Math.max(0, Math.min(.1, (now - chapterEnding.last) / 1000)));
    chapterEnding.last = now;
    chapterEndingCaption();
    if (chapterEnding.age >= 12) finishChapterEnding();
  }
  function readTouchPreference() {
    try { const value = localStorage.getItem(TOUCH_STORE); return ['auto', 'show', 'hide'].includes(value) ? value : 'auto'; }
    catch (_) { return 'auto'; }
  }
  function readMeleeChoice() {
    try { return localStorage.getItem(MELEE_STORE) === 'spear' ? 'spear' : 'blade'; }
    catch (_) { return 'blade'; }
  }
  function supportsTouch() {
    if (touchSeen || Number(navigator.maxTouchPoints) > 0) return true;
    return ['(any-pointer: coarse)', '(pointer: coarse)'].some(query => {
      try { return !!(window.matchMedia && window.matchMedia(query).matches); } catch (_) { return false; }
    });
  }
  function touchGameActive() {
    return playing() && !paused && !hasDialog() && !remoteTutorialPending && !((state.practice || relayTutorial || huntTutorial) && tutorialPending);
  }
  function updateTouchControls() {
    const enabled = touchPreference === 'show' || touchPreference === 'auto' && supportsTouch();
    $('game-wrap').setAttribute('data-touch-controls', String(enabled));
    $('touch-controls').hidden = !enabled || !touchGameActive();
    const label = { auto: '自动', show: '显示', hide: '隐藏' }[touchPreference];
    $('settings-touch').textContent = '触屏按钮 · ' + label;
    $('settings-touch').setAttribute('aria-label', `触屏按钮：${label}；点击切换显示方式`);
  }
  function toast(message, duration = 3800) {
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, duration);
  }
  function clearInput() {
    keys.clear(); mouse.down = mouse.guard = false; touch.mx = touch.my = 0;
    touch.shoot = touch.dash = touch.guard = touch.interact = touch.switchWeapon = false;
    dashPulse = guardPulse = interactPulse = switchPulse = false;
    joystickId = null; touchPointers.clear();
    $('joystick-stick').style.transform = 'translate(0px,0px)';
    remoteInput = {};
  }
  function showMenu(screen) {
    menuScreen = screen;
    const panels = { title: 'title-menu', modes: 'mode-menu', challenges: 'challenges-menu', loadout: 'loadout-menu' };
    for (const [name, id] of Object.entries(panels)) $(id).hidden = name !== screen;
    $('game-wrap').setAttribute('data-screen', screen);
    $('game-wrap').setAttribute('data-menu', screen);
    clearInput();
    if (screen !== 'playing') {
      const first = { title: 'menu-play', modes: 'mode-chapter', challenges: 'mode-hunt', loadout: 'start-loadout' }[screen];
      if (first) $(first).focus();
    }
  }
  function lobbyMenu() {
    // Leaving the lobby to prepare must keep its room and partner connected.
    if ($('coop-dialog').open) $('coop-dialog').close();
    showMenu(net && net.connected && net.role === 'guest' ? 'loadout' : 'modes');
    updateCamp();
  }
  function chooseMode(gameMode) {
    if (net && net.connected && net.role === 'guest') { showMenu('loadout'); return; }
    $('mode-select').value = gameMode; updateCamp(); showMenu('loadout');
  }
  function updateLobbyMenu() {
    const connected = !!(net && net.connected), guest = connected && net.role === 'guest';
    const accountLocked = !!(account && (account.busy || account.needsChoice));
    const accountWait = account && account.needsChoice ? '请先选择存档' : '正在同步账号…';
    $('solo-start').textContent = accountLocked ? accountWait : guest ? '等待队长出发' : connected ? '一起出发' : net ? '等待伙伴' : '出发';
    $('solo-start').setAttribute('aria-busy', String(accountLocked && !account.needsChoice));
    $('loadout-coop').textContent = net ? '返回联机房间' : '邀请朋友';
    $('loadout-coop').hidden = !net; $('open-coop').hidden = !!net;
    $('menu-room-status').hidden = !net;
    $('menu-loadout-back').textContent = guest ? '返回主菜单' : '返回选择玩法';
    $('mission-select').disabled = guest;
    $('difficulty-select').disabled = guest || ['chapter', 'relay', 'hunt'].includes(selectedGameMode());
    $('menu-room-status').textContent = connected ? guest ? '队长选择玩法，你可以更换自己的近战与远程武器。' : remoteCampReady ? '搭档已就位，本次将一起出发。' : '正在接收搭档的出发整备。' : net ? '房间已保留，可以返回联机面板等待伙伴。' : '';
    $('solo-start').disabled = accountLocked || !!net && (!connected || guest || !remoteCampReady) || !canStart(selectedGameMode(), selectedMission(), selectedDifficulty());
    $('start-room').disabled = accountLocked || !connected || guest || !remoteCampReady;
    $('mode-training').disabled = accountLocked;
    if (accountLocked) {
      $('mission-lock').textContent = account && account.needsChoice ? '请先在账号中心选择要继续使用的存档。' : '正在确认账号进度，完成后即可出发。';
      $('start-room').textContent = accountWait;
    } else $('start-room').textContent = guest ? '等待队长出发' : connected ? remoteCampReady ? '一起出发 →' : '等待搭档整备' : '等待伙伴加入';
  }
  function stopSounds() {
    for (const oscillator of soundNodes) { try { oscillator.stop(); } catch (_) { /* Already ended. */ } }
    soundNodes.clear();
  }
  function resetSounds() { stopSounds(); heardEvents.clear(); soundAt.clear(); chapterNotesSeen.clear(); chapterMomentsSeen.clear(); soundLast = 0; }
  const chapterMoments = {
    sluiceOpen: '水通了，没刚才那么烫了。东边还响着备用炉心的轰鸣。',
    bossDefeated: '总算停下来了。备用火还在，带回去就行。',
    suppliesTaken: '药还能用。大家缓了口气，继续找火种。',
    beaconLit: '老岑：“看见你们的信号了！路上小心，我在营地等你们。”',
    fireTaken: '火种装好了。回去吧，别让他们再摸黑走路了。'
  };
  function primeChapterNarration() {
    if (!state || state.mode !== 'chapter') return;
    // A late start can already contain discovered records and completed actions.
    // Show its journal, but never present that old state as a fresh story event.
    state.chapter.clues.forEach(clue => chapterNotesSeen.add(clue));
    Object.keys(chapterMoments).forEach(flag => { if (state.chapter[flag]) chapterMomentsSeen.add(flag); });
    if (state.status === 'playing' && state.chapter.phase === 'depart' && state.elapsed < 1) toast('老岑：灯灭了，采集队到现在还没回来。你去苔火工坊借点火，我在这儿等他们。', 7000);
  }
  function chapterUpdates() {
    if (!state || state.mode !== 'chapter' || !state.chapter || state.status !== 'playing' || paused || hasDialog()) return;
    const messages = [];
    for (const clue of state.chapter.clues) {
      if (chapterNotesSeen.has(clue)) continue;
      chapterNotesSeen.add(clue);
      const note = E.CHAPTER_NOTES && E.CHAPTER_NOTES[clue];
      if (note) messages.push(note.title + ' · ' + note.text);
    }
    for (const [flag, message] of Object.entries(chapterMoments)) if (state.chapter[flag] && !chapterMomentsSeen.has(flag)) {
      chapterMomentsSeen.add(flag); messages.push(message);
    }
    // Several actions may reach a guest in one snapshot. The latest objective
    // gets one short toast; discovered records remain available in the journal.
    if (messages.length) toast(messages[messages.length - 1], 7000);
  }
  function soundReady(channel, time, interval) {
    if (soundAt.has(channel) && time - soundAt.get(channel) < interval) return false;
    soundAt.set(channel, time); return true;
  }
  function tone(frequency, duration, volume, type, delay, endFrequency) {
    if (muted || !audio || audio.state !== 'running') return;
    try {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      const at = audio.currentTime + (delay || 0);
      oscillator.type = type || 'sine'; oscillator.frequency.setValueAtTime(frequency, at);
      if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
      gain.gain.setValueAtTime(volume || 0.025, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.onended = () => { soundNodes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      soundNodes.add(oscillator); oscillator.start(at); oscillator.stop(at + duration);
    } catch (_) { /* Audio never blocks a fight. */ }
  }
  function enableAudio() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
    } catch (_) { /* Sound is optional. */ }
  }
  function menuSound(kind) {
    // Only an explicit click may unlock audio. Hover/focus and results use an
    // already-running context, so the title screen never starts sound itself.
    if (muted || document.hidden || kind === 'hover' && reducedMotion()) return;
    if (kind === 'select') enableAudio();
    if (!audio || audio.state !== 'running') return;
    const now = performance.now(), resultCue = kind === 'win' || kind === 'lost';
    if (!resultCue && now - uiSoundAt < (kind === 'hover' ? 110 : 65)) return;
    if (resultCue) stopSounds();
    uiSoundAt = now;
    if (kind === 'hover') tone(360, .035, .004, 'sine', 0, 440);
    else if (kind === 'win') {
      tone(392, .16, .012, 'sine', 0, 440);
      if (!reducedMotion()) tone(587, .20, .010, 'sine', .12, 660);
    } else if (kind === 'lost') tone(220, .18, .010, 'sine', 0, 165);
    else tone(520, .055, .009, 'triangle', 0, 390);
  }
  function soundEvents() {
    if (!state) return;
    const events = [...(state.combatEvents || []), ...(state.events || [])];
    const highlighted = new Set(events.filter(event => event && ['weakpoint-hit', 'posture-break', 'scatter-push', 'environment-hit', 'lantern-guard'].includes(event.type) && state.elapsed - event.time <= .25).map(event => event.enemyId));
    const blockedHits = new Set(events.filter(event => event && ['ranged-block', 'weapon-broken'].includes(event.type)).map(event => event.playerId + ':' + event.time));
    const brokenHits = new Set(events.filter(event => event && event.type === 'weapon-broken').map(event => event.playerId + ':' + event.time));
    for (const event of events) {
      if (!event || typeof event.id !== 'string' && !Number.isSafeInteger(event.id) || heardEvents.has(event.id)) continue;
      heardEvents.add(event.id);
      if (heardEvents.size > 512) heardEvents.delete(heardEvents.values().next().value);
      // Historical snapshots may contain an old cue: never play a late warning as a new beat.
      const age = Number.isFinite(event.time) ? Math.max(0, state.elapsed - event.time) : 0;
      if (age > .25 || paused || tutorialPending || remoteTutorialPending || hasDialog()) continue;
      if (event.type === 'rhythm-windup') {
        const remaining = Math.max(0, Math.min(3, event.duration || .8) - age);
        if (remaining < .07) continue;
        if (event.attack === 'thrust') tone(310, Math.min(.3, remaining), .018, 'triangle', 0, 650);
        else if (event.attack === 'hook') tone(410, Math.min(.3, remaining), .018, 'triangle', 0, 210);
        else if (event.attack === 'quake') tone(90, Math.min(.35, remaining), .021, 'triangle', 0, 55);
        else if (event.attack === 'sweep') tone(480, Math.min(.3, remaining), .016, 'sine', 0, 260);
        else tone(150, Math.min(.35, remaining), .018, 'triangle', 0, 390);
      } else if (event.type === 'rhythm-beat') {
        tone(65, .13, .035, 'triangle', 0, 35);
      } else if (['perfect-parry', 'mikiri', 'perfect-dodge', 'fireball-reflected'].includes(event.type)) {
        tone(event.type === 'mikiri' ? 1040 : 1460, .11, .045, 'triangle', 0, 780);
        tone(2180, .055, .022, 'sine', .025);
      } else if (event.type === 'counterattack') {
        tone(330, .17, .035, 'triangle', 0, 100);
      } else if (event.type === 'spear-thrust' && !event.perfect) {
        if (soundReady('spear', event.time, .18)) tone(490, .075, .018, 'triangle', 0, 190);
      } else if (event.type === 'lantern-guard') {
        if (soundReady('lantern', event.time, .16)) tone(720, .065, .014, 'sine', 0, 430);
      } else if (event.type === 'fox-rescued') {
        tone(760, .12, .018, 'sine', 0, 1050); tone(980, .16, .015, 'sine', .13, 680);
      } else if (event.type === 'fox-assist') {
        if (soundReady('fox-assist', event.time, .2)) tone(event.assistKind === 'counter' ? 550 : 370, .065, .013, 'triangle', 0, 170);
      } else if (event.type === 'refuge-chosen') {
        tone(event.choice === 'rest' ? 420 : 740, .15, .018, 'sine'); tone(event.choice === 'rest' ? 630 : 990, .2, .014, 'sine', .1);
      } else if (event.type === 'style-formed') {
        tone(660, .15, .021, 'sine'); tone(880, .18, .018, 'sine', .08); tone(1100, .22, .013, 'sine', .16);
      } else if (event.type === 'style-trigger') {
        if (soundReady('style-' + event.style, event.time, .32)) tone(event.style === 'echo' ? 190 : event.style === 'pursuit' ? 810 : 490, .08, .012, 'triangle', 0, 140);
      } else if (event.type === 'boss-overload-open') {
        tone(240, .2, .022, 'triangle', 0, 580); tone(870, .13, .014, 'sine', .14);
      } else if (event.type === 'hook-reflected') {
        tone(630, .10, .020, 'triangle', 0, 320);
      } else if (event.type === 'hook-pull' && event.amount > 1) {
        if (soundReady('chain', event.time, .14)) tone(240, .13, .018, 'triangle', 0, 100);
      } else if (event.type === 'weapon-tempered') {
        tone(620, .17, .025, 'triangle', 0, 940); tone(1240, .15, .016, 'sine', .12, 780);
      } else if (event.type === 'wall-breached') {
        tone(105, .25, .030, 'triangle', 0, 42); tone(260, .12, .014, 'triangle', .035, 120);
      } else if (event.type === 'guard-break') {
        tone(120, .23, .035, 'sawtooth', 0, 45);
      } else if (event.type === 'boss-phase') {
        tone(95, .7, .035, 'triangle', 0, 180);
      } else if (event.type === 'event-start') {
        tone(170, .25, .02, 'triangle', 0, 95);
      } else if (['event-complete', 'supply-collected'].includes(event.type)) {
        tone(620, .15, .025); tone(830, .15, .02, 'sine', .08);
      } else if (event.type === 'core-throw') {
        tone(460, .12, .025, 'triangle', 0, 240);
      } else if (event.type === 'core-catch') {
        tone(event.perfect ? 1040 : 680, .14, .035, 'triangle');
        if (event.perfect) tone(1560, .09, .025, 'sine', .045);
      } else if (event.type === 'core-deliver') {
        tone(520, .25, .03); tone(780, .28, .025, 'sine', .12); tone(1040, .35, .025, 'sine', .25);
      } else if (event.type === 'core-knock') {
        tone(160, .12, .025, 'triangle', 0, 80);
      } else if (event.type === 'hunt-arrival') {
        tone(82, .22, .026, 'triangle', 0, 50); tone(110, .16, .018, 'triangle', .13, 70);
      } else if (event.type === 'hunt-lured') {
        tone(210, .2, .018, 'triangle', 0, 130);
      } else if (event.type === 'hunt-defeated') {
        tone(520, .25, .03); tone(780, .28, .025, 'sine', .12); tone(1040, .35, .025, 'sine', .25);
      } else if (event.type === 'weapon-switch') {
        tone(440, .045, .014, 'triangle', 0, 660);
      } else if (event.type === 'weapon-broken') {
        tone(155, .2, .03, 'sawtooth', 0, 45);
        if (event.playerId === localId()) {
          const melee = state.players[localId()]?.weapons.melee === 'spear' ? '长枪' : '短刃';
          toast(state.mode === 'random' ? `远程武器已损坏，已切回${melee}；封闭仓库可修复。` : `远程武器已损坏，已切回${melee}；下次出发恢复。`);
        }
      } else if (event.type === 'ranged-block') {
        if (!brokenHits.has(event.playerId + ':' + event.time) && soundReady('block', event.time, .12)) tone(340, .09, .025, 'triangle', 0, 130);
      } else if (event.type === 'melee-block') {
        if (soundReady('block', event.time, .12)) tone(780, .075, .024, 'triangle', 0, 510);
      } else if (event.type === 'weakpoint-open') {
        if (soundReady('opening', event.time, .18)) tone(570, .085, .015, 'sine', 0, 760);
      } else if (event.type === 'weakpoint-hit') {
        // Routine hits may already have sounded this frame. A separate bounded
        // accent keeps that tick from swallowing a teammate's weakpoint hit.
        if (soundReady('weakpoint', event.time, .10)) { tone(1080, .085, .032, 'triangle', 0, 680); tone(310, .10, .022, 'triangle'); }
      } else if (event.type === 'posture-break') {
        if (soundReady('posture', event.time, .16)) tone(390, .14, .028, 'triangle', 0, 95);
      } else if (event.type === 'scatter-push') {
        if (soundReady('impact', event.time, .10)) tone(125, .13, .027, 'triangle', 0, 50);
      } else if (event.type === 'environment-hit') {
        if (soundReady('environment', event.time, .16)) tone(event.target === 'prop' ? 175 : 95, .14, .025, 'triangle', 0, 45);
      } else if (event.type === 'enemy-hit') {
        if (!highlighted.has(event.enemyId) && soundReady('impact', event.time, .10)) tone(event.weapon === 'blade' ? 410 : 260, .045, .012, 'triangle', 0, 180);
      } else if (event.type === 'shoot' && performance.now() - soundLast > 170) {
        tone(180 + Math.random() * 70, 0.035, 0.007, 'triangle'); soundLast = performance.now();
      } else if (event.type === 'player-hit') { if (!blockedHits.has(event.playerId + ':' + event.time)) tone(92, 0.13, 0.04, 'sawtooth'); }
      else if (event.type === 'dash') tone(420, 0.075, 0.02);
      else if (event.type === 'explosion') tone(55, 0.22, 0.05, 'sawtooth');
      else if (['room-clear', 'revive', 'relic-selected', 'cache-searched', 'wave-clear'].includes(event.type)) tone(680, 0.18, 0.03);
      else if (event.type === 'boss-awakened') tone(240, 0.55, 0.045, 'triangle');
    }
    if (paused || tutorialPending || remoteTutorialPending || hasDialog()) return;
    const local = state.players && state.players[localId()];
    // One quiet signal invites a closer look; it is never a repeating reminder.
    if (state.status === 'playing' && state.mode === 'chapter' && local && !local.downed && audio && audio.state === 'running' && !muted) {
      const beacon = (state.interactables || []).find(item => item.kind === 'chapter-beacon' && item.active && !item.used && Math.hypot(local.x - item.x, local.y - item.y) < 260);
      const cue = 'beacon-hint:' + state.room.index;
      if (beacon && !chapterMomentsSeen.has(cue)) {
        chapterMomentsSeen.add(cue); tone(660, .14, .008, 'sine', 0, 590); tone(880, .18, .006, 'sine', .18, 780);
      }
    }
    if (local && !local.downed) for (const ball of state.bullets || []) {
      if (ball.friendly || !ball.reflectable || ball.dead) continue;
      const dx = local.x - ball.x, dy = local.y - ball.y, speed = Math.hypot(ball.vx, ball.vy);
      if (!speed) continue;
      const along = (dx * ball.vx + dy * ball.vy) / speed;
      const side = Math.abs(dx * ball.vy - dy * ball.vx) / speed;
      const arrival = (along - local.r - ball.r) / speed;
      const cue = 'fireball-cue:' + ball.id;
      if (arrival > 0 && arrival <= .28 && side < local.r + ball.r + 9 && !heardEvents.has(cue)) {
        heardEvents.add(cue); tone(ball.hook ? 1560 : 1180, .06, .028, 'sine');
      }
    }
    // Read the live windup, so a staggered or defeated attacker leaves no scheduled warning behind.
    for (const enemy of state.enemies || []) {
      const attack = enemy.rhythm;
      if (!attack || attack.type === 'fireball' || attack.type === 'hook' || attack.phase !== 'windup' || attack.remaining <= 0 || attack.remaining > .30 || enemy.stagger > 0 || enemy.hp <= 0) continue;
      const windup = [...(state.combatEvents || [])].reverse().find(event => event.type === 'rhythm-windup' && event.enemyId === enemy.id && event.attack === attack.type && event.beat === attack.beat);
      if (!windup) continue;
      const cueId = 'cue:' + windup.id;
      if (heardEvents.has(cueId)) continue;
      heardEvents.add(cueId);
      tone(attack.type === 'sweep' ? 790 : attack.type === 'quake' ? 440 : attack.type === 'thrust' ? 1480 : 1180, .075, .04, 'triangle');
    }
  }
  function selectedWeapon() { return camp.scatter && $('start-loadout').value === 'scatter' ? 'scatter' : 'pistol'; }
  function selectedMelee() { return C.canUseSpear(camp) && meleeChoice === 'spear' ? 'spear' : 'blade'; }
  function styleNames(value) {
    return E.activeStyles(value).map(id => E.STYLES.find(style => style.id === id)?.label || id);
  }
  function safeCompanion(value) {
    if (value === null || value === undefined) return null;
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2 || value.kind !== 'fox' || !C.validFoxName(value.name) || value.name !== value.name.trim()) return false;
    return { kind: 'fox', name: value.name };
  }
  function companionUpdates() {
    if (!state || state.practice || state.mode !== 'random' || !state.foxRescue || !state.foxRescue.rescued || !state.players[localId()] || camp.camp.companion.rescued) return;
    camp = C.rescueFox(camp); writeCamp();
    toast('灰尾狐已获救，正在营地等你。下次出发可带它同行。', 5200);
  }
  function safeCampLoadout(value) {
    if (value === undefined) return { upgrades: [] };
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !Array.isArray(value.upgrades) || value.upgrades.length > 3 || new Set(value.upgrades).size !== value.upgrades.length || value.upgrades.some(id => !C.CAMP_UPGRADES.some(upgrade => upgrade.id === id))) return null;
    return { upgrades: C.CAMP_UPGRADES.filter(upgrade => value.upgrades.includes(upgrade.id)).map(upgrade => upgrade.id) };
  }
  function sendCampLoadout() {
    if (net && net.connected && net.role === 'guest' && !playing()) net.send({ type: 'loadout', weapon: selectedWeapon(), melee: selectedMelee(), companion: C.companionDeparture(camp), foxRescued: camp.camp.companion.rescued, camp: { upgrades: C.departure(camp).upgrades } });
  }
  function missionInfo(id) { return [...C.MISSIONS, ...(C.CHAPTERS || [])].find(mission => mission.id === id) || C.MISSIONS[0]; }
  function chapterProgress() { return C.chapterProgress(camp); }
  function selectedGameMode() { return ['chapter', 'story', 'relay', 'hunt'].includes($('mode-select').value) ? $('mode-select').value : 'random'; }
  function selectedMission() { return selectedGameMode() === 'chapter' ? 'chapter1' : selectedGameMode() === 'random' ? 'ember' : ['relay', 'hunt'].includes(selectedGameMode()) ? 'salvage' : missionInfo($('mission-select').value).id; }
  function selectedDifficulty() { return !['chapter', 'relay', 'hunt'].includes(selectedGameMode()) && $('difficulty-select').value === '2' ? 2 : 1; }
  function canStart(gameMode, mission, difficulty) { return gameMode !== 'story' || C.canPlay(camp, mission, difficulty); }
  function tutorialStore() { return rhythmTutorial ? RHYTHM_TUTORIAL_STORE : relayTutorial ? RELAY_TUTORIAL_STORE : huntTutorial ? HUNT_TUTORIAL_STORE : TUTORIAL_STORE; }
  function startTutorial() {
    rhythmTutorial = !!(state && state.practice);
    relayTutorial = !!(state && state.mode === 'relay');
    huntTutorial = !!(state && state.mode === 'hunt');
    let weaponTutorial = true;
    try { weaponTutorial = localStorage.getItem(WEAPONS_TUTORIAL_STORE) !== '1'; tutorialPending = weaponTutorial || localStorage.getItem(tutorialStore()) !== '1'; } catch (_) { tutorialPending = true; }
    $('tutorial-title').textContent = rhythmTutorial ? '先接住一刀，再练连续招架' : relayTutorial ? '把炉芯，接力带回家' : '先试试手，再走进遗迹';
    $('tutorial-controls-desktop').textContent = rhythmTutorial ? 'K / 右键格挡静步 · 空格闪避 · J / 左键反击 · Q 切换武器' : relayTutorial ? 'E 拾取 / 投掷 · K / 右键接住与静步 · Q 切换武器 · WASD 移动' : 'WASD 移动 · J / 左键攻击 · K / 右键格挡静步 · Q 切换武器 · 空格闪避 · E 互动';
    $('tutorial-controls-touch').textContent = rhythmTutorial ? '圈快合拢时点盾牌；防守会自动面向来招。Q 键切换短刃与枪。' : relayTutorial ? '互动键拾取 / 投掷，摇杆决定方向，盾牌键接住，Q 键切换武器。' : '左侧摇杆移动，右侧按钮攻击、防守、闪避、互动；Q 键切换短刃与枪。';
    $('tutorial-detail').textContent = rhythmTutorial ? '看到两圈快合拢或听到清脆提示时，按 K / 右键；会自动面向来招。先练连斩，熟悉后再加入突刺和横扫。' : relayTutorial ? '取走炉芯后，回程会出现追兵。带回入口撤离台，按 E 交付。按住防守可稳接，临近时按下可精准接住、短暂加速；单人也能先扔出再追过去。' : '房间自由进出；击杀唤醒守卫，精英掉落遗物。';
    if (huntTutorial) {
      $('tutorial-title').textContent = '这一次，猎物也在找你';
      $('tutorial-controls-desktop').textContent = 'WASD 移动 · 按住 K / 右键格挡静步 · J 攻击 · Q 切换武器 · E 互动 · 空格闪避';
      $('tutorial-controls-touch').textContent = '按住盾牌键格挡静步，互动键搬桶，Q 键切换短刃与枪。';
      $('tutorial-detail').textContent = '循足迹和邻室脚步追踪游荡猎兽。枪声、闪避与爆炸会引来它；提前摆好炸药桶，或轻步绕路。找到机会击败它，即可完成狩猎。';
    }
    if (state && state.mode === 'chapter') {
      $('tutorial-title').textContent = '借一簇火，照亮归途';
      $('tutorial-detail').textContent = '归途灯熄了，采集队还没回来。进入苔火工坊借回火种，再回营地点灯。路标和记录可按 E 查看，已读内容收在操作手册中。';
    }
    if (weaponTutorial) $('tutorial-detail').textContent += ' 每人固定携带一把短刃和一把枪；短刃打失衡，手枪追击暴露的破绽，散射枪近身击退。用枪格挡只减免 50% 伤害，每次实际挡到攻击有 10% 概率损坏，本局只能改用短刃。搬运时仍可静步，但不能格挡。';
    $('tutorial-dismiss').textContent = rhythmTutorial ? '准备好了，迎战 →' : '知道了，出发 →';
    $('tutorial-panel').hidden = !tutorialPending;
    if ((relayTutorial || huntTutorial) && net && net.connected) net.send({ type: 'pause', reason: 'tutorial', runId, paused: tutorialPending });
  }
  function dismissTutorial() {
    tutorialPending = false; $('tutorial-panel').hidden = true;
    try { localStorage.setItem(tutorialStore(), '1'); localStorage.setItem(WEAPONS_TUTORIAL_STORE, '1'); } catch (_) { /* Tutorial is optional. */ }
    if ((relayTutorial || huntTutorial) && net && net.connected) net.send({ type: 'pause', reason: 'tutorial', runId, paused: false });
    clearInput(); if (playing()) { enableAudio(); canvas.focus(); }
  }
  function escapeHTML(value) { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
  function showMission() {
    const gameMode = selectedGameMode(), random = gameMode === 'random', relay = gameMode === 'relay', hunt = gameMode === 'hunt', chapter = gameMode === 'chapter';
    const mission = missionInfo(selectedMission()), completion = camp.missions[mission.id];
    $('story-mission-field').hidden = gameMode !== 'story';
    $('game-wrap').setAttribute('data-mode', state ? state.mode : gameMode);
    $('mission-name').textContent = random ? '迷雾远征' : relay ? '接力夺宝 · 试玩' : hunt ? '苔火猎场 · 试玩' : mission.name;
    $('mission-description').textContent = random ? '沿巡逻、交叉火力和盾阵选择路线。找到避风灯室，在恢复生命与寻找遗物之间取舍，再以成形的打法迎战炉心。' : relay ? '炉芯藏在遗迹深处。抱着它穿过追兵，也可以抛给搭档，接住那一拍。' : hunt ? '猎兽在六间遗迹中游荡。循足迹追踪，以声音引诱，选择自己的伏击地点。' : mission.description;
    $('mission-goal').textContent = random ? '探索遗迹，击杀守卫唤醒深处的 Boss。' : relay ? '把炉芯带回入口撤离台，按 E 交付。' : hunt ? '追踪并击败游荡猎兽。' : mission.goal;
    $('mission-reward').textContent = `带回 ${relay ? 24 : hunt ? 32 : mission.reward + (selectedDifficulty() === 2 ? 20 : 0)} 星屑`;
    const unlocked = canStart(gameMode, mission.id, selectedDifficulty());
    $('mission-lock').textContent = chapter ? chapterProgress().completed ? `本节已完成 ${chapterProgress().clears} 次 · 可重新出发` : '第一节已开放 · 归途灯等待点亮' : random ? '3 名精英 · 避风灯室 · 3 种遗物组合' : relay ? '3 间遗迹 · 单人 / 双人 · 自由穿行' : hunt ? '6 间猎场 · 足迹追踪 · 声音诱敌' : unlocked ? (completion.clears ? `已完成 ${completion.clears} 次${completion.hardClears ? ` · 险境 ${completion.hardClears} 次` : ''}` : '首次完成，点亮一盏营灯') : '先完成前一项任务，三盏营灯点亮后可挑战险境。';
    $('mission-lock').hidden = false;
    $('solo-start').disabled = !unlocked;
    updateLobbyMenu();
    if (!state && net && net.connected && net.role === 'host') net.send({ type: 'lobby', mode: gameMode, mission: mission.id, difficulty: selectedDifficulty() });
  }
  function updateCamp() {
    const option = $('start-loadout').querySelector('option[value="scatter"]');
    option.disabled = !camp.scatter; option.textContent = camp.scatter ? '散射枪' : '散射枪 · 待解锁';
    const progress = C.progress(camp);
    const random = selectedGameMode() === 'random', relay = selectedGameMode() === 'relay', hunt = selectedGameMode() === 'hunt', chapter = selectedGameMode() === 'chapter';
    const chapterDone = chapterProgress();
    $('title-camp-status').textContent = chapterDone.completed ? '归途灯已亮 · 采集队已回营' : '归途灯尚未点亮';
    $('title-camp-status').setAttribute('data-complete', String(chapterDone.completed));
    $('campaign-status').textContent = chapter ? `${chapterDone.completed ? '归途灯已点亮' : '归途灯等待修复'} · 星屑 ${camp.coins} · 第一章 · 第一节${chapterDone.completed ? '已完成' : '已开放'}` : random || relay || hunt ? `星屑 ${camp.coins} · 归来 ${camp.wins} 次${relay ? ' · 接力夺宝试玩' : hunt ? ' · 苔火猎场试玩' : ` · 遗物图鉴 ${progress.relicCount} / ${progress.relicTotal}`}` : `营灯 ${progress.lit} / 3 · 星屑 ${camp.coins} · ${progress.allCleared ? '险境任务已开启' : '完成任务，点亮营地的三盏灯'}`;
    $('mission-progress').textContent = chapter ? chapterDone.completed ? '本节通关记录已保存 · 后续小节尚未开放' : '借回火种，再回营地点灯' : random ? '每局一张新地图' : relay ? '取回炉芯，原路撤离' : hunt ? '追踪、诱敌、伏击' : `营灯 ${progress.lit} / 3${progress.allCleared ? ` · 险境 ${progress.hardLit} / 3` : ''}`;
    $('chapter-camp-status').textContent = chapterDone.completed ? `第一章 · 第一节 · 借火归营 · 已完成 ${chapterDone.clears} 次` : '第一章 · 第一节 · 借火归营 · 归途灯尚未点亮';
    $('chapter-camp-status').setAttribute('data-complete', String(chapterDone.completed));
    $('chapter-camp-copy').textContent = chapterDone.completed ? '采集队已经循光回营。旧木场的微弱信号仍在等待回应，后续小节尚未开放。' : '进入苔火工坊借回火种，回营点亮归途灯。本节通关记录可随账号保存。';
    $('camp-copy').textContent = `现有 ${camp.coins} 星屑。${chapterDone.completed ? '第一章第一节的归途灯已点亮。' : '第一章第一节等待你从工坊借回火种。'}旧版任务营灯 ${progress.lit} / 3，${progress.allCleared ? '险境任务已开放。' : '完成旧版三项任务可开启险境任务。'}${account ? account.status : storageOK ? '进度保存在当前浏览器。' : '浏览器未允许保存，刷新后进度可能丢失。'}`;
    $('camp-objectives').innerHTML = C.MISSIONS.map((mission, i) => {
      const complete = camp.missions[mission.id].clears > 0;
      return `<div class="camp-lamp${complete ? ' lit' : ''}" data-complete="${complete}"><i aria-hidden="true"></i><strong>第 ${i + 1} 盏营灯</strong><span>${escapeHTML(mission.name)} · ${complete ? '已点亮' : '等待修复'}</span></div>`;
    }).join('');
    $('journal-list').innerHTML = C.BADGES.map(badge => {
      const earned = camp.badges.includes(badge.id);
      return `<div class="journal-item${earned ? ' earned' : ''}"><span class="journal-icon" aria-hidden="true"><span>${earned ? '◆' : '◇'}</span></span><div><strong>${escapeHTML(badge.name)}</strong><p>${escapeHTML(badge.description)}</p></div><span class="journal-status">${earned ? '已达成' : '未达成'}</span></div>`;
    }).join('');
    $('relic-journal').innerHTML = C.RELICS.map(id => {
      const relic = E.BUFFS[id] || { label: id, description: '' }, found = camp.relics.includes(id);
      return `<div class="journal-item${found ? ' earned' : ''}"><span class="journal-icon" aria-hidden="true">${found ? '◆' : '◇'}</span><div><strong>${escapeHTML(relic.label)}</strong><p>${escapeHTML(relic.description)}</p></div><span class="journal-status">${found ? '已发现' : '待发现'}</span></div>`;
    }).join('');
    for (const mission of C.MISSIONS) {
      const item = $('mission-select').querySelector(`option[value="${mission.id}"]`);
      item.disabled = !C.canPlay(camp, mission.id, 1);
      item.textContent = `${mission.name}${item.disabled ? ' · 待解锁' : camp.missions[mission.id].clears ? ' · 已完成' : ''}`;
    }
    if (selectedGameMode() === 'story' && !C.canPlay(camp, selectedMission(), 1)) $('mission-select').value = 'ember';
    const hard = $('difficulty-select').querySelector('option[value="2"]');
    $('difficulty-select').disabled = relay || hunt || chapter;
    hard.disabled = relay || hunt || chapter || !random && !progress.allCleared;
    hard.textContent = random || progress.allCleared ? '险境 · 更多危险与奖励' : '险境 · 三盏营灯后开启';
    if (relay || hunt || chapter || !random && !progress.allCleared) $('difficulty-select').value = '1';
    $('unlock-scatter').disabled = camp.scatter || camp.coins < 30;
    $('unlock-scatter').textContent = camp.scatter ? '已解锁 · 出发前可选择' : `30 星屑解锁${camp.coins < 30 ? ' · 通关一局即可' : ''}`;
    const departure = C.departure(camp), locked = !!(account && (account.busy || account.needsChoice));
    const fox = camp.camp.companion;
    $('companion-name').disabled = locked || !fox.rescued;
    $('companion-name-save').disabled = locked || !fox.rescued;
    $('companion-equipped').disabled = locked || !fox.rescued;
    $('companion-equipped').checked = fox.equipped;
    // Preserve an in-progress name edit through unrelated camp refreshes.
    if (document.activeElement !== $('companion-name') || !fox.rescued || locked) $('companion-name').value = fox.rescued ? fox.name : '';
    $('companion-status').textContent = locked ? account.needsChoice ? '请先完成账号存档选择。' : '正在同步，稍后可调整。' :
      !fox.rescued ? '随机远征的遗迹支路里，有一只被困的灰尾狐。靠近笼子即可救出。' : playing() ? `${fox.name} · 随行配置在下次出发生效。` : `${fox.name}已回营 · ${fox.equipped ? '下次出发同行' : '留在营地休息'}`;
    const spearUnlocked = C.canUseSpear(camp), spearOption = $('start-melee').querySelector('option[value="spear"]');
    spearOption.disabled = !spearUnlocked;
    spearOption.textContent = spearUnlocked ? '遗迹长枪' : '长枪 · 第一节首通解锁';
    $('start-melee').disabled = locked;
    $('start-melee').value = selectedMelee();
    $('melee-unlock-copy').textContent = locked ? account.needsChoice ? '请先完成账号存档选择，再调整近战。' : '正在读取或同步账号，完成后可调整近战。' :
      !spearUnlocked ? '完成第一章第一节，解锁遗迹长枪。' : selectedMelee() === 'spear' ? '长枪直线刺击，枪尖更有力；精准化解后按攻击可接贯穿追刺。' : '长枪已解锁，可在近战栏切换；每人携带一把近战和一把远程。';
    for (const upgrade of C.CAMP_UPGRADES) {
      const button = $('upgrade-' + upgrade.id), owned = departure.upgrades.includes(upgrade.id);
      button.disabled = locked || !C.canPurchaseUpgrade(camp, upgrade.id);
      button.textContent = owned ? '已解锁 · 每次生效' : upgrade.id === 'relicCase' && !camp.relics.length ? '先发现一件遗物' : camp.coins < upgrade.cost ? `还差 ${upgrade.cost - camp.coins} 星屑` : `${upgrade.cost} 星屑解锁`;
    }
    $('camp-upgrade-status').textContent = playing() ? '整备在下次出发生效，本局状态保持出发时的配置。' : '每项只解锁一次，每次探险自动生效。训练不启用。';
    $('starter-relic').disabled = locked || !departure.upgrades.includes('relicCase');
    $('starter-relic').value = departure.startingRelic || '';
    for (const id of C.RELICS) {
      const item = $('starter-relic').querySelector(`option[value="${id}"]`), found = camp.relics.includes(id);
      item.disabled = !found; item.textContent = (E.BUFFS[id] || { label: id }).label + (found ? '' : ' · 未发现');
    }
    const relicLabel = departure.startingRelic ? E.BUFFS[departure.startingRelic].label : null;
    $('starter-relic-copy').textContent = locked ? account.needsChoice ? '请先在账号面板选择要保留的存档，完成后即可继续整备。' : '账号正在读取或同步存档，完成后会自动恢复选择。' :
      !departure.upgrades.includes('relicCase') ? camp.relics.length ? '先用 80 星屑解锁上方的遗物匣，再选择已发现的遗物。' : '先在远征中取得遗物并完成结算，再用 80 星屑解锁上方的遗物匣。' :
      relicLabel ? `${relicLabel}：${E.BUFFS[departure.startingRelic].description} 下次出发生效；联机由房主携带，全队共享，同名效果不叠加。` :
      camp.relics.length ? '遗物匣已解锁，点击上方选择已发现的遗物。选择自动保存，下次出发生效；联机由房主携带，全队共享。' : '遗物匣已解锁，暂无已发现的遗物。远征中取得遗物并完成结算后，可在这里选择。';
    const preparationNames = C.CAMP_UPGRADES.filter(upgrade => departure.upgrades.includes(upgrade.id) && upgrade.id !== 'relicCase').map(upgrade => upgrade.name);
    if (net && net.connected && net.role === 'guest') preparationNames.push('出发遗物由房主携带');
    else if (relicLabel) preparationNames.push(relicLabel);
    if (fox.rescued && fox.equipped) preparationNames.push(fox.name + '随行');
    $('departure-summary').textContent = preparationNames.length ? '营地整备 · ' + preparationNames.join(' / ') : '营地整备 · 可在营地工坊解锁';
    sendCampLoadout();
    showMission();
  }
  function closeDialogs() {
    // Starting or leaving a run owns the resulting pause state. Dialog close
    // events must not resume an old run while this transition is in progress.
    dialogPaused = false;
    dialogIds.forEach(id => { if ($(id).open) $(id).close(); });
  }
  function displayPause() {
    $('pause-screen').hidden = !paused || !playing();
    $('pause-title').textContent = disconnected ? '搭档的灯火暂时熄了' : '在灯火边歇一会儿';
    $('pause-copy').textContent = disconnected ? '房主已离线。返回营地后，可以独自重新出发。' : '遗迹会等你。准备好后，继续向前。';
    $('resume-game').disabled = disconnected;
    $('restart-game').disabled = mode === 'guest';
  }
  function pause(value, announce) {
    if (!playing() || disconnected) return;
    paused = value; clearInput(); if (value) stopSounds(); displayPause();
    if (!hasDialog()) (value ? $(disconnected ? 'back-camp' : 'resume-game') : canvas).focus();
    if (announce !== false && net && net.connected) net.send({ type: 'pause', paused, reason: 'manual' });
  }
  function openDialog(id) {
    clearInput(); stopSounds();
    if (!hasDialog()) {
      dialogPaused = playing() && !paused;
      if (dialogPaused) pause(true);
    }
    if (!$(id).open) $(id).showModal();
  }
  dialogIds.forEach(id => {
    $(id).addEventListener('close', () => {
      if (!hasDialog()) {
        const resume = dialogPaused; dialogPaused = false;
        if (resume) pause(false);
      }
    });
  });
  function shutdownNet() {
    const old = net; net = null; if (old) old.close();
    remoteTutorialPending = false;
    remoteWeapon = 'pistol';
    remoteMelee = 'blade';
    remoteCompanion = null;
    remoteFoxRescued = false;
    remoteCamp = { upgrades: [] };
    remoteCampReady = false;
    remoteInput = {}; remoteAt = 0; remoteSeq = -1;
    $('room-id').textContent = '— — — —'; $('start-room').disabled = true;
    $('host-room').disabled = false; $('join-room').disabled = false;
    updateLobbyMenu();
  }
  function home() {
    companionUpdates();
    clearChapterEnding();
    shutdownNet(); state = null; mode = 'solo'; paused = false; disconnected = false;
    finished = ''; runId = ''; resultNext = null; clearInput(); resetSounds(); closeDialogs();
    $('start-screen').hidden = false; $('pause-screen').hidden = true; $('end-screen').hidden = true;
    $('interaction-hint').hidden = true; tutorialPending = false; $('tutorial-panel').hidden = true; updateCamp(); showMenu('title'); hud();
  }
  function newRunId() {
    return window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  function newSeed() {
    if (window.crypto && crypto.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0];
    return (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
  }
  function begin(isCoop) {
    if (account && (account.busy || account.needsChoice)) { toast('请先完成账号存档的读取或选择，再出发。'); return; }
    if (isCoop && (!net || !net.connected || net.role !== 'host')) return;
    if (isCoop && !remoteCampReady) { toast('正在接收搭档的出发整备，请稍候。'); return; }
    if (!isCoop) shutdownNet();
    mode = isCoop ? 'host' : 'solo';
    let mission = selectedMission(), difficulty = selectedDifficulty(), gameMode = selectedGameMode();
    // Restart the actual expedition, including after the player edited camp settings.
    if (state && state.mission) { mission = state.mission.id; difficulty = state.difficulty || 1; gameMode = state.mode || 'story'; }
    if (!canStart(gameMode, mission, difficulty)) { toast('这项故事任务尚未解锁，请先完成前一项任务。'); return; }
    state = E.create({ mode: gameMode, players: isCoop ? 2 : 1, loadout: 'blade', meleeLoadout: selectedMelee(), partnerMeleeLoadout: isCoop ? remoteMelee : 'blade', rangedLoadout: selectedWeapon(), seed: newSeed(), mission, difficulty, camp: C.departure(camp), partnerCamp: isCoop ? remoteCamp : undefined, companion: C.companionDeparture(camp), partnerCompanion: isCoop ? remoteCompanion : null, unlocks: { foxRescued: camp.camp.companion.rescued && (!isCoop || remoteFoxRescued) } });
    remoteTutorialPending = isCoop && ['relay', 'hunt'].includes(state.mode);
    if (state.players.p2) state.players.p2.weapons.ranged = remoteWeapon;
    clearChapterEnding(); runId = newRunId(); chapterEndingEligible = gameMode === 'chapter' ? runId : ''; finished = ''; paused = false; disconnected = false; accumulator = 0;
    remoteInput = {}; remoteAt = 0; remoteSeq = -1; clearInput(); resetSounds();
    closeDialogs(); $('start-screen').hidden = true; $('end-screen').hidden = true; showMenu('playing'); displayPause();
    if (isCoop && !net.send({ type: 'start', state: E.snapshot(state, true), runId })) {
      pause(true, false); toast('开局消息尚未送达，请稍后点“重新出发”。');
    }
    startTutorial(); primeChapterNarration(); enableAudio(); canvas.focus(); hud();
  }
  function beginPractice() {
    if (account && (account.busy || account.needsChoice)) { toast('请先完成账号存档的读取或选择，再出发。'); return; }
    clearChapterEnding(); shutdownNet(); mode = 'solo';
    state = E.create({ practice: true, mode: 'story', players: 1, loadout: 'blade', seed: newSeed(), mission: 'ember', difficulty: 1 });
    runId = newRunId(); finished = ''; paused = false; disconnected = false; accumulator = 0;
    remoteInput = {}; remoteAt = 0; remoteSeq = -1; clearInput(); resetSounds();
    closeDialogs(); $('start-screen').hidden = true; $('end-screen').hidden = true; showMenu('playing'); displayPause();
    startTutorial(); enableAudio(); canvas.focus(); hud();
  }
  function resultDetails(before, result) {
    const after = result.profile, practice = !!state.practice, won = state.status === 'won';
    const campUpgrade = C.CAMP_UPGRADES.find(upgrade => C.canPurchaseUpgrade(after, upgrade.id));
    const count = value => Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
    const seconds = count(state.elapsed), found = practice ? [] : after.relics.filter(id => !before.relics.includes(id));
    const discoveries = found.map(id => (E.BUFFS[id] || { label: id }).label);
    const changes = [];
    if (!practice && !result.duplicate) {
      if (!C.chapterProgress(before).completed && C.chapterProgress(after).completed) changes.push('归途灯已点亮 · 采集队已回营');
      if (!C.canUseSpear(before) && C.canUseSpear(after)) changes.push('遗迹长枪已解锁');
      if (state.mode === 'story') C.MISSIONS.forEach((mission, index) => {
        if (!before.missions[mission.id].clears && after.missions[mission.id].clears) changes.push(`第 ${index + 1} 盏营灯已点亮`);
      });
    }
    let next;
    if (practice) next = { kind: 'practice', label: '下一轮', title: '把这一拍接稳', copy: '试炼不消耗星屑。继续练习同一组来招，找到自己的节奏。', action: '再练一轮' };
    else if (mode === 'guest') next = { kind: 'wait', label: '下一趟', title: '等搭档一起出发', copy: '本次记录已经结算。队长可以重新出发，也可以一起回营地调整装备。', action: '等待队长出发' };
    else if (!after.scatter && after.coins >= 30) next = { kind: 'workshop', label: '工坊可用', title: '试试散射枪', copy: `现有 ${after.coins} 星屑，可用 30 星屑解锁散射枪。前往工坊后由你决定是否兑换。`, action: '前往工坊' };
    else if (campUpgrade) next = { kind: 'workshop', focusId: 'upgrade-' + campUpgrade.id, label: '星屑可用', title: '解锁' + campUpgrade.name, copy: `${state.mode === 'chapter' && won ? '第一节通关记录已保留，后续小节尚未开放。 ' : ''}${campUpgrade.cost} 星屑 · ${campUpgrade.description} 前往营地后由你决定是否解锁。`, action: '前往营地整备' };
    else if (state.mode === 'chapter' && won) next = { kind: 'prepare', gameMode: 'random', label: '下一趟', title: '进入迷雾远征', copy: '第一节通关记录已保留，后续小节尚未开放。随机地图里还有精英与遗物可探索。', action: '准备迷雾远征' };
    else if (!after.scatter) next = { kind: 'prepare', gameMode: state.mode, label: '下一个目标', title: `还差 ${30 - after.coins} 星屑`, copy: '攒够 30 星屑，可以在营地工坊解锁散射枪。先调整装备，再出发。', action: '调整装备再出发' };
    else if (state.mode === 'random' && after.relics.length < C.RELICS.length) next = { kind: 'prepare', gameMode: 'random', label: '下一个目标', title: `遗物图鉴 ${after.relics.length} / ${C.RELICS.length}`, copy: '击败精英，寻找尚未发现的遗物。下次远征会重新生成地图。', action: '准备下一次远征' };
    else next = { kind: 'prepare', gameMode: state.mode, label: '下一趟', title: won ? '换种打法，再走一趟' : '整备之后再来', copy: state.mode === 'chapter' ? '击败守卫后取走火种，再带回营地点灯。可以在出发前调整远程武器。' : state.mode === 'random' ? '调整远程武器，再进入一张新地图。已发现的遗物留在营地图鉴。' : '调整远程武器，再挑战一次这项玩法。', action: '前往出发准备' };
    return {
      kills: String(count(state.stats && state.stats.kills)), time: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
      combatLabel: practice ? '精准招架' : '累计受伤', combat: String(practice ? count(state.practiceParries) : Math.max(0, Number.isFinite(state.stats && state.stats.damage) ? Math.round(state.stats.damage * 100) / 100 : 0)),
      explored: `${state.rooms.filter(room => room.visited).length} / ${state.rooms.length}`,
      discoveries: practice ? '试炼不记录遗物与奖励' : (discoveries.length ? '新发现：' + discoveries.join('、') : '本次没有新增遗物发现') + (styleNames(state).length ? ' · 本局打法：' + styleNames(state).join(' / ') : ''),
      progress: practice ? '练习成绩仅展示于本轮' : result.duplicate ? '本次记录已保存，不重复结算' : changes.length ? changes.join(' · ') : `探险记录已保存 · 遗物图鉴 ${after.relics.length} / ${C.RELICS.length}`,
      next
    };
  }
  function showResultDetails(details) {
    $('end-kills').textContent = details.kills; $('end-time').textContent = details.time;
    $('end-combat-label').textContent = details.combatLabel; $('end-parries').textContent = details.combat;
    $('end-explored').textContent = details.explored; $('end-new-relics').textContent = details.discoveries;
    $('end-progress').textContent = details.progress;
    showResultNext(details.next);
  }
  function showResultNext(next) {
    resultNext = next;
    $('end-next-label').textContent = resultNext.label; $('end-next-title').textContent = resultNext.title;
    $('end-next-copy').textContent = resultNext.copy; $('end-next-action').textContent = resultNext.action;
    $('end-next-action').disabled = resultNext.kind === 'wait';
  }
  function prepareResultMode(gameMode) {
    if (mode === 'guest') return;
    clearChapterEnding();
    const mission = state && state.mission && state.mission.id, difficulty = state && state.difficulty || 1;
    // A host's room survives preparation; departure still requires its ordinary
    // explicit start button, and guests continue waiting in their own result.
    state = null; finished = ''; runId = ''; paused = false; disconnected = false; resultNext = null;
    clearInput(); resetSounds(); closeDialogs(); tutorialPending = false; $('tutorial-panel').hidden = true;
    $('start-screen').hidden = false; $('end-screen').hidden = true; $('pause-screen').hidden = true;
    $('difficulty-select').value = String(difficulty);
    if (gameMode === 'story' && C.MISSIONS.some(item => item.id === mission)) $('mission-select').value = mission;
    chooseMode(gameMode); hud();
  }
  function settle() {
    companionUpdates();
    if (!state || state.status === 'playing' || finished === runId) return;
    finished = runId; clearInput(); paused = false; $('pause-screen').hidden = true; $('tutorial-panel').hidden = true;
    if (state.practice) {
      const parries = Math.max(0, Math.floor(state.practiceParries || 0));
      $('end-title').textContent = state.status === 'won' ? '接住了，轮到你出手' : parries ? `这一轮接住了 ${parries} 次` : '先听提示，接住第一刀';
      $('end-copy').textContent = `本轮招架 ${parries} 次 · 用时 ${Math.floor(state.elapsed)} 秒${state.status === 'won' ? ' · 击败试炼守卫' : ''}`;
      $('end-reward').hidden = true;
      $('end-goal').textContent = '招架试炼';
      $('end-unlocks').textContent = parries ? '已经接住了它的攻击，下一轮试着连起来。' : '下一轮可以先不攻击，看到圈快合拢或听到提示就按防守。';
      $('end-badges').textContent = '';
      showResultDetails(resultDetails(camp, { profile: camp, duplicate: false }));
      $('end-restart').disabled = false; $('end-restart').textContent = '再试一轮 ↗';
      $('end-screen').hidden = false;
      $('end-next-action').focus(); menuSound(state.status === 'won' ? 'win' : 'lost');
      return;
    }
    $('end-reward').hidden = false;
    if (storageOK) camp = readCamp();
    const before = C.normalize(camp), result = C.applyResult(camp, state, runId);
    // Freeze feedback before writes can notify the account controller or update
    // a menu. The once-per-run guard above owns this whole settlement.
    const details = resultDetails(before, result);
    camp = result.profile;
    if (!result.duplicate) writeCamp();
    const won = state.status === 'won';
    const mission = missionInfo(state.mission && state.mission.id);
    const random = state.mode === 'random', relay = state.mode === 'relay', hunt = state.mode === 'hunt', chapter = state.mode === 'chapter';
    $('end-title').textContent = chapter ? won ? '归途灯，重新亮了' : '这簇火，还没带回家' : hunt ? won ? '猎场归来，巨兽倒下了' : '这次，猎物先找到了你' : won ? relay ? '炉芯已安全送达' : `${random ? '迷雾远征' : mission.name} · 探险完成` : relay ? '炉芯还在等下一次归途' : '这次，走到这里';
    $('end-copy').textContent = chapter ? won ? '采集队回来了，伤员也安顿下了。这趟没白跑。' : '先缓缓，别急。准备好了，再去把火种带回来。' : hunt ? `探索 ${state.rooms.filter(room => room.visited).length} / ${state.rooms.length} 间 · 诱敌 ${state.hunt.lures} 次 · 击败 ${state.stats.kills} 名敌人 · 用时 ${Math.floor(state.elapsed)} 秒` : relay ? `投掷 ${state.relay.throws} 次 · 接住 ${state.relay.catches} 次 · 精准接住 ${state.relay.perfectCatches} 次 · 用时 ${Math.floor(state.elapsed)} 秒` : won ? `击败 ${state.stats.kills} 名守卫 · 用时 ${Math.floor(state.elapsed / 60)} 分 ${Math.floor(state.elapsed % 60)} 秒${state.secretCleared ? ' · 找到了隐藏星藏' : ''}` : '探险暂时告一段落。营地的灯火仍在等你。';
    $('end-reward').textContent = result.duplicate ? `本次记录已保存 · 营地现有 ${camp.coins} 星屑` : won ? `+ ${camp.coins - before.coins} 星屑 · 营地现有 ${camp.coins}` : `本局未带回星屑 · 营地仍有 ${camp.coins}`;
    $('end-goal').textContent = chapter ? `第一章 · 第一节 · 借火归营 · ${won ? '已完成' : '未完成'} · ${Math.floor(state.elapsed)} 秒` : hunt ? won ? '苔火猎场 · 狩猎完成' : '苔火猎场 · 狩猎未完成' : relay ? won ? '接力夺宝 · 撤离成功' : '接力夺宝 · 撤离未完成' : random ? `探索 ${state.rooms.filter(room => room.visited).length} / ${state.rooms.length} 间 · 遗物 ${state.runBuffs.length} 件` : `营灯 ${C.progress(camp).lit} / 3 · ${won ? mission.goal : state.objective}`;
    $('end-unlocks').textContent = chapter ? won ? '阿禾：“旧木场那边打的是求援灯讯。咱们得去看看。”后续小节尚未开放。' : '把守卫解决了，还得取上火种，再回营地点灯。' : hunt ? won ? '下一次，可以换个地方设伏，或与搭档一人诱敌、一人截击。' : '猎兽会追随声响。换条路，先为下一次交手做好准备。' : relay ? won ? '下次试试换个位置传球，或与搭档轮流掩护。' : '可以先放下炉芯迎敌，再拾取继续撤离。' : random ? (won ? '下一次出发，地图与精英位置将重新生成。' : '本次发现的遗物已记入图鉴。') : result.unlocks.length ? result.unlocks.join(' · ') : (won ? '可以返回营地选择下一项任务，或挑战更好的成绩。' : '这次发现的遗物已记入图鉴，重新准备后再来。');
    if (!C.canUseSpear(before) && C.canUseSpear(camp)) $('end-unlocks').textContent = '遗迹长枪已解锁，可在出发前选择。' + $('end-unlocks').textContent;
    $('end-badges').textContent = result.newBadges.length ? '获得徽章：' + result.newBadges.map(id => (C.BADGES.find(badge => badge.id === id) || { name: id }).name).join('、') : '';
    if (state.mode === 'story' && won && C.progress(camp).nextMission) { $('mission-select').value = C.progress(camp).nextMission; showMission(); }
    $('end-restart').disabled = mode === 'guest';
    $('end-restart').textContent = mode === 'guest' ? '等待房主重新出发' : chapter ? '重玩第一节 ↗' : '再探一次 ↗';
    showResultDetails(details);
    // Rewards are already durable above. This local presentation never delays
    // a save or advances the ended simulation, and each partner can skip alone.
    if (chapter && won && chapterEndingEligible === runId && !result.duplicate) beginChapterEnding();
    else presentResults();
  }
  function safeInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const num = (n, min, max, fallback) => Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
    return { mx: num(raw.mx, -1, 1, 0), my: num(raw.my, -1, 1, 0),
      aimX: num(raw.aimX, 0, 960, 480), aimY: num(raw.aimY, 0, 600, 300),
      shoot: raw.shoot === true, dash: raw.dash === true, guard: raw.guard === true, guardPulse: raw.guardPulse === true, interact: raw.interact === true,
      switchWeapon: raw.switchWeapon === true, switchPulse: raw.switchPulse === true };
  }
  function validState(s) {
    if (!s || s.version !== 1 || s.combatVersion !== 1 || s.contentVersion !== 1 || s.weaponVersion !== 1 || s.tacticsVersion !== 1 || s.practice !== false || !['chapter', 'random', 'story', 'relay', 'hunt'].includes(s.mode) || !['playing', 'won', 'lost'].includes(s.status) || !s.room || !Number.isInteger(s.room.index) || s.room.index < 0 || !s.stats || !Number.isFinite(s.elapsed)) return false;
    if (!s.players || !s.players.p1 || !s.players.p2 || Object.keys(s.players).length !== 2) return false;
    if (!s.mission || !(s.mode === 'chapter' ? s.mission.id === 'chapter1' : C.MISSIONS.some(m => m.id === s.mission.id)) || ![1, 2].includes(s.difficulty) || !Array.isArray(s.runBuffs) || s.runBuffs.length > 6 || new Set(s.runBuffs).size !== s.runBuffs.length || s.runBuffs.some(id => !C.RELICS.includes(id))) return false;
    const limits = { enemies: 100, bullets: 500, props: 80, particles: 200, walls: 100, doors: 30, portals: 30, fires: 30, switches: 30, pickups: 80, events: 40, combatEvents: 24, rooms: 16, interactables: 30, decoys: 8, companions: 2 };
    for (const [key, cap] of Object.entries(limits)) if (!Array.isArray(s[key]) || s[key].length > cap || s[key].some(entry => !entry || typeof entry !== 'object' || Array.isArray(entry))) return false;
    const bounded = (n, max) => Number.isFinite(n) && n >= 0 && n <= max;
    const shortId = value => typeof value === 'string' && value.length > 0 && value.length <= 100;
    const volleyIds = value => Array.isArray(value) && value.length <= 8 && new Set(value).size === value.length && value.every(shortId);
    if (new Set(s.companions.map(fox => fox.ownerId)).size !== s.companions.length) return false;
    for (const fox of s.companions) {
      if (Object.keys(fox).length !== 14 || !['p1', 'p2'].includes(fox.ownerId) || !s.players[fox.ownerId] || fox.id !== 'fox-' + fox.ownerId || fox.kind !== 'fox' || !C.validFoxName(fox.name) || fox.name !== fox.name.trim() || fox.r !== 10 || !bounded(fox.x, 960) || !bounded(fox.y, 600) || !Number.isFinite(fox.facing) || Math.abs(fox.facing) > Math.PI * 4 || !['follow', 'idle', 'sniff', 'pounce'].includes(fox.mode) || ![null, 'bite', 'counter'].includes(fox.assistKind) || (fox.mode === 'pounce') !== (fox.assistKind !== null) || !bounded(fox.assistCd, 6) || !bounded(fox.assistTime, .25) || fox.targetId !== null && !shortId(fox.targetId) || fox.hintId !== null && !shortId(fox.hintId)) return false;
    }
    if (s.mode === 'random' && s.foxRescue !== null) {
      const rescue = s.foxRescue;
      if (!rescue || typeof rescue !== 'object' || Array.isArray(rescue) || Object.keys(rescue).length !== 2 || !Number.isInteger(rescue.roomIndex) || rescue.roomIndex < 1 || rescue.roomIndex >= s.rooms.length || typeof rescue.rescued !== 'boolean' || s.rooms[rescue.roomIndex].kind === 'boss' || rescue.rescued && !s.rooms[rescue.roomIndex].visited) return false;
    } else if (s.foxRescue !== null) return false;
    if (!['blade', 'spear'].includes(s.meleeLoadout) || !['blade', 'spear'].includes(s.partnerMeleeLoadout)) return false;
    const preparation = s.preparations;
    if (!preparation || typeof preparation !== 'object' || Array.isArray(preparation) || Object.keys(preparation).length !== 3 || !preparation.p1 || !preparation.p2 || !safeCampLoadout(preparation.p1) || !safeCampLoadout(preparation.p2) || ![null, ...C.RELICS].includes(preparation.startingRelic) || preparation.startingRelic !== null && (!preparation.p1.upgrades.includes('relicCase') || !s.runBuffs.includes(preparation.startingRelic))) return false;
    if (!s.runUpgrades || typeof s.runUpgrades !== 'object' || Array.isArray(s.runUpgrades) || Object.keys(s.runUpgrades).length !== 1 || typeof s.runUpgrades.tempered !== 'boolean' || s.runUpgrades.tempered && s.mode !== 'random') return false;
    for (const p of Object.values(s.players)) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.hp) || !Number.isFinite(p.maxHp)) return false;
      if (!['blade', 'spear', 'pistol', 'scatter'].includes(p.weapon) || typeof p.guarding !== 'boolean' || !bounded(p.guardWindow, 2) || !bounded(p.counterTime, 10) || !bounded(p.meleeTime, 2) || ![null, undefined, '', 'parry', 'mikiri', 'dodge'].includes(p.counterKind)) return false;
      if (!p.weapons || typeof p.weapons !== 'object' || Array.isArray(p.weapons) || Object.keys(p.weapons).length !== 2 || p.weapons.melee !== (p.id === 'p2' ? s.partnerMeleeLoadout : s.meleeLoadout) || !['pistol', 'scatter'].includes(p.weapons.ranged) || !['melee', 'ranged'].includes(p.activeSlot) || typeof p.rangedBroken !== 'boolean' || typeof p.prevSwitch !== 'boolean' || typeof p.sneaking !== 'boolean' || !bounded(p.switchCd, 2) || p.weapon !== p.weapons[p.activeSlot] || p.rangedBroken && p.activeSlot === 'ranged') return false;
      if (p.ward != null && (!Number.isInteger(p.ward) || !bounded(p.ward, 1))) return false;
      if (p.relayBoost != null && !bounded(p.relayBoost, 3)) return false;
    }
    for (const enemy of s.enemies) {
      if (!enemy || !bounded(enemy.stagger, 10) || !bounded(enemy.posture, 1000) || !bounded(enemy.maxPosture, 1000) || !bounded(enemy.weakTime, 1.6) || typeof enemy.lastScatterVolley !== 'string' || enemy.lastScatterVolley.length > 100 || !volleyIds(enemy.scatterVolleys) || !Array.isArray(enemy.rushHitIds) || enemy.rushHitIds.length > 100 || new Set(enemy.rushHitIds).size !== enemy.rushHitIds.length || !enemy.rushHitIds.every(shortId)) return false;
      if (enemy.pursuit !== undefined) {
        const pursuit = enemy.pursuit;
        if (s.practice || !['chapter', 'random'].includes(s.mode) || enemy.kind !== 'boss' || !pursuit || typeof pursuit !== 'object' || Array.isArray(pursuit) || Object.keys(pursuit).length !== 3 || !['time', 'cooldown', 'targetId'].every(key => Object.prototype.hasOwnProperty.call(pursuit, key)) || !bounded(pursuit.time, 1.6) || !bounded(pursuit.cooldown, 7.5) || ![null, 'p1', 'p2'].includes(pursuit.targetId) || pursuit.time > 0 && pursuit.targetId === null) return false;
      }
      if (enemy.ai !== undefined) {
        const ai = enemy.ai;
        if (s.practice || !['chaser', 'shooter', 'shield'].includes(enemy.kind) || !ai || typeof ai !== 'object' || Array.isArray(ai) || Object.keys(ai).length !== 3 || !['mode', 'time', 'side'].every(key => Object.prototype.hasOwnProperty.call(ai, key)) || !['approach', 'circle', 'recover', 'reposition', 'retreat', 'guard', 'wait', 'windup'].includes(ai.mode) || !bounded(ai.time, 2) || ![-1, 1].includes(ai.side)) return false;
      }
      if ((enemy.alertRadius != null || enemy.alerted != null) && (s.mode !== 'chapter' || s.room.index !== 1 || !bounded(enemy.alertRadius, 600) || enemy.alertRadius < 1 || typeof enemy.alerted !== 'boolean')) return false;
      if (enemy.kind === 'lamplighter' && (s.mode !== 'random' || enemy.elite === true || enemy.rhythm !== null)) return false;
      if (enemy.rhythm != null) {
        const attack = enemy.rhythm;
        if (!['combo', 'thrust', 'sweep', 'quake', 'rush', 'fireball', 'hook'].includes(attack.type) || !['windup', 'active', 'recover'].includes(attack.phase) || !bounded(attack.remaining, 10) || !bounded(attack.duration, 10) || !Number.isInteger(attack.beat) || !Number.isInteger(attack.beats) || attack.beat < 0 || attack.beat > attack.beats || attack.beats < 1 || attack.beats > 8 || !Number.isFinite(attack.angle) || Math.abs(attack.angle) > Math.PI * 4 || !bounded(attack.range, 1600) || !bounded(attack.arc, Math.PI * 2) || attack.type === 'hook' && enemy.kind !== 'hookwarden') return false;
      }
    }
    for (const bullet of s.bullets) {
      if (![null, 'pistol', 'scatter'].includes(bullet.weapon) || bullet.volleyId !== null && !shortId(bullet.volleyId) || !Number.isFinite(bullet.originX) || !Number.isFinite(bullet.originY)) return false;
      if (bullet.weapon !== null && bullet.volleyId === null) return false;
      if (bullet.hook != null && typeof bullet.hook !== 'boolean') return false;
      if (bullet.hook && (s.mode !== 'random' || bullet.friendly !== false || bullet.weapon !== null || bullet.volleyId !== null || !shortId(bullet.owner) || !bounded(bullet.ttl, 5) || !Number.isFinite(bullet.vx) || !Number.isFinite(bullet.vy) || Math.abs(bullet.vx) > 2000 || Math.abs(bullet.vy) > 2000 || !s.enemies.some(enemy => enemy.id === bullet.owner && enemy.kind === 'hookwarden' && enemy.hp > 0))) return false;
    }
    for (const event of s.combatEvents) {
      if (!event || !['rhythm-windup', 'rhythm-beat', 'perfect-parry', 'perfect-dodge', 'mikiri', 'counterattack', 'guard-break', 'fireball-reflected', 'boss-phase', 'event-start', 'event-complete', 'supply-collected', 'decoy', 'core-throw', 'core-catch', 'core-deliver', 'core-knock', 'hunt-arrival', 'hunt-lured', 'hunt-defeated', 'weapon-switch', 'weapon-broken', 'ranged-block', 'melee-block', 'player-hit', 'enemy-hit', 'weakpoint-open', 'weakpoint-hit', 'posture-break', 'scatter-push', 'environment-hit', 'hook-pull', 'hook-reflected', 'weapon-tempered', 'storehouse-open', 'wall-breached', 'spear-thrust', 'lantern-guard', 'fox-rescued', 'fox-assist', 'refuge-chosen', 'style-formed', 'style-trigger', 'boss-overload-open'].includes(event.type) || typeof event.id !== 'string' && !Number.isSafeInteger(event.id) || typeof event.id === 'string' && event.id.length > 100 || !bounded(event.time, 86400) || !Number.isFinite(event.x) || !Number.isFinite(event.y)) return false;
      if (event.duration != null && !bounded(event.duration, 10)) return false;
      if (event.type === 'refuge-chosen' && (s.mode !== 'random' || !['p1', 'p2'].includes(event.playerId) || !['rest', 'relic'].includes(event.choice) || !Number.isInteger(event.room) || event.room < 1 || event.room >= s.rooms.length || s.rooms[event.room].kind !== 'refuge' || !bounded(event.x, 960) || !bounded(event.y, 600))) return false;
      if (event.type === 'style-formed' && (s.mode !== 'random' || event.playerId !== null || !E.activeStyles(s).includes(event.style) || !bounded(event.x, 960) || !bounded(event.y, 600))) return false;
      if (event.type === 'style-trigger' && (s.mode !== 'random' || !['p1', 'p2'].includes(event.playerId) || !E.activeStyles(s).includes(event.style) || event.enemyId !== null && !shortId(event.enemyId) || !bounded(event.x, 960) || !bounded(event.y, 600))) return false;
      if (event.type === 'boss-overload-open' && (s.mode !== 'random' || !shortId(event.enemyId) || event.duration !== 2 || !bounded(event.x, 960) || !bounded(event.y, 600))) return false;
      if (event.type === 'fox-rescued' && (s.mode !== 'random' || !s.foxRescue || !s.foxRescue.rescued || !['p1', 'p2'].includes(event.playerId) || !bounded(event.x, 960) || !bounded(event.y, 600))) return false;
      if (event.type === 'fox-assist' && (!['p1', 'p2'].includes(event.playerId) || !shortId(event.enemyId) || !['bite', 'counter'].includes(event.assistKind) || !Number.isInteger(event.amount) || !bounded(event.amount, event.assistKind === 'counter' ? 3 : 1) || event.amount < 1 || !bounded(event.x, 960) || !bounded(event.y, 600))) return false;
      if (event.type === 'spear-thrust' && (!['p1', 'p2'].includes(event.playerId) || event.enemyId !== null && !shortId(event.enemyId) || event.weapon !== 'spear' || typeof event.perfect !== 'boolean' || !Number.isFinite(event.angle) || Math.abs(event.angle) > Math.PI * 4 || !bounded(event.range, 250))) return false;
      if (event.type === 'lantern-guard' && (s.mode !== 'random' || !shortId(event.enemyId) || !shortId(event.sourceId) || event.enemyId === event.sourceId || ![null, 'p1', 'p2'].includes(event.playerId) || ![null, 'blade', 'spear', 'pistol', 'scatter'].includes(event.weapon) || !Number.isInteger(event.amount) || !bounded(event.amount, 1000) || event.amount < 1 || !Number.isInteger(event.reduced) || !bounded(event.reduced, 1000) || event.reduced < 1)) return false;
      if (event.type === 'counterattack' && event.weapon != null && !['blade', 'spear'].includes(event.weapon)) return false;
      if (event.type === 'counterattack' && event.amount != null && (!Number.isInteger(event.amount) || !bounded(event.amount, 1000))) return false;
      if (event.type === 'hook-reflected' && (!shortId(event.enemyId) || !['p1', 'p2'].includes(event.playerId))) return false;
      if (event.type === 'hook-pull' && (!shortId(event.enemyId) || ![null, 'p1', 'p2'].includes(event.playerId) || !['player', 'enemy', 'prop'].includes(event.target) || !bounded(event.amount, 1000) || event.propId != null && !shortId(event.propId) || event.target === 'prop' && !shortId(event.propId) || event.target !== 'prop' && !['p1', 'p2'].includes(event.playerId))) return false;
      if (event.type === 'weapon-tempered' && (s.mode !== 'random' || !Number.isInteger(event.room) || !bounded(event.room, s.rooms.length - 1))) return false;
      if (event.type === 'storehouse-open' && (s.mode !== 'random' || event.kind !== 'storehouse' || !['quiet', 'loud'].includes(event.breach) || !Number.isInteger(event.room) || !bounded(event.room, s.rooms.length - 1))) return false;
      if (event.type === 'wall-breached' && (s.mode !== 'random' || event.kind !== 'breach' || !Number.isInteger(event.room) || event.room !== s.room.index || s.rooms[event.room]?.eventKind !== 'breach' || !shortId(event.wallId) || !shortId(event.enemyId) || s.roomEvent?.kind !== 'breach' || s.roomEvent.stage !== 'complete' || event.wallId !== s.roomEvent.wallId || event.enemyId !== s.roomEvent.guardianId)) return false;
      if (event.type === 'core-catch' && typeof event.perfect !== 'boolean') return false;
      if (['weapon-switch', 'weapon-broken', 'ranged-block', 'melee-block'].includes(event.type) && (!['p1', 'p2'].includes(event.playerId) || event.weapon != null && !['blade', 'spear', 'pistol', 'scatter'].includes(event.weapon) || event.slot != null && !['melee', 'ranged'].includes(event.slot) || event.perfect != null && typeof event.perfect !== 'boolean' || event.broken != null && typeof event.broken !== 'boolean' || event.damage != null && !bounded(event.damage, 100))) return false;
      if (event.type === 'player-hit' && (!['p1', 'p2'].includes(event.playerId) || !bounded(event.damage, 100) || !bounded(event.hp, 100) || !['combo', 'thrust', 'sweep', 'quake', 'rush', 'charge', 'melee', 'bullet', 'fire', 'fireball', 'hook'].includes(event.source))) return false;
      if (['enemy-hit', 'weakpoint-open', 'weakpoint-hit', 'posture-break', 'scatter-push', 'environment-hit'].includes(event.type)) {
        if (event.enemyId !== null && !shortId(event.enemyId) || ![null, 'p1', 'p2'].includes(event.playerId) || ![null, 'blade', 'spear', 'pistol', 'scatter'].includes(event.weapon)) return false;
        if (event.amount != null && !bounded(event.amount, 1000) || event.source != null && !['parry', 'dodge', 'mikiri', 'counter', 'posture', 'rush', 'fireball', 'quake', 'explosion', 'blade', 'spear', 'pistol', 'scatter'].includes(event.source) || event.propId != null && !shortId(event.propId) || event.target != null && !['prop', 'enemy'].includes(event.target) || event.volleyId != null && !shortId(event.volleyId)) return false;
        if (event.type === 'environment-hit' && (!['rush', 'fireball', 'quake', 'explosion'].includes(event.source) || !['prop', 'enemy'].includes(event.target))) return false;
        if (event.source === 'quake' && (event.type !== 'environment-hit' || event.target !== 'enemy' || !shortId(event.enemyId) || event.playerId !== null || event.weapon !== null || !Number.isInteger(event.amount) || !bounded(event.amount, 1000) || event.amount <= 0 || event.propId !== undefined)) return false;
      }
    }
    if (s.roomEvent != null) {
      const event = s.roomEvent;
      if (s.mode !== 'random' || !['sluice', 'lift', 'forge', 'storehouse', 'breach'].includes(event.kind) || !['ready', 'active', 'complete'].includes(event.stage) || typeof event.collected !== 'boolean' || event.collected && event.stage !== 'complete' || !Array.isArray(event.enemyIds) || event.enemyIds.length > 8 || new Set(event.enemyIds).size !== event.enemyIds.length || !event.enemyIds.every(shortId)) return false;
      if (event.kind === 'storehouse' && (!shortId(event.sealId) || !['sealed', 'quiet', 'loud'].includes(event.breach) || event.breach === 'sealed' && event.stage !== 'ready' || event.breach === 'quiet' && event.stage !== 'complete' || event.breach === 'loud' && event.stage === 'ready')) return false;
      if (event.kind === 'forge' && event.collected !== s.runUpgrades.tempered) return false;
      if (event.kind === 'breach') {
        const room = s.rooms[s.room.index], wall = s.walls.filter(item => item.breachWall === true), cache = s.interactables.filter(item => item.kind === 'breach-cache');
        if (!room || room.eventKind !== 'breach' || room.eliteKind !== 'brute' || !shortId(event.wallId) || !shortId(event.guardianId) || event.stage === 'active' || event.enemyIds.length !== 0 || wall.length !== (event.stage === 'ready' ? 1 : 0) || wall.some(item => item.id !== event.wallId) || cache.length !== 1 || cache[0].used !== event.collected || cache[0].active !== (event.stage === 'complete' && !event.collected)) return false;
        if (s.enemies.some(enemy => enemy.id === event.guardianId && (enemy.kind !== 'brute' || enemy.elite !== true))) return false;
      }
    }
    for (const wall of s.walls) {
      if (wall.breachWall != null && typeof wall.breachWall !== 'boolean' || wall.breachFrame != null && typeof wall.breachFrame !== 'boolean') return false;
      if ((wall.breachWall || wall.breachFrame) && (s.mode !== 'random' || s.roomEvent?.kind !== 'breach' || !bounded(wall.x, 960) || !bounded(wall.y, 600) || !bounded(wall.w, 960) || wall.w === 0 || !bounded(wall.h, 600) || wall.h === 0 || wall.x + wall.w > 960 || wall.y + wall.h > 600 || wall.breachWall && (!shortId(wall.id) || wall.id !== s.roomEvent.wallId))) return false;
    }
    for (const prop of s.props) if (prop.eventSeal != null && (typeof prop.eventSeal !== 'boolean' || prop.eventSeal && (prop.kind !== 'crate' || !s.roomEvent || s.roomEvent.kind !== 'storehouse' || prop.id !== s.roomEvent.sealId || prop.carriedBy || prop.thrown))) return false;
    for (const item of s.interactables) {
      if (['refuge-rest', 'refuge-relic'].includes(item.kind) && (s.mode !== 'random' || s.room.kind !== 'refuge' || !shortId(item.id) || !bounded(item.x, 960) || !bounded(item.y, 600) || !bounded(item.r, 50) || typeof item.label !== 'string' || item.label.length > 40 || typeof item.used !== 'boolean' || typeof item.active !== 'boolean')) return false;
      if (item.kind === 'fox-cage' && (s.mode !== 'random' || !s.foxRescue || s.room.index !== s.foxRescue.roomIndex || item.id !== 'fox-cage-' + s.room.index || typeof item.active !== 'boolean' || typeof item.used !== 'boolean' || item.used !== s.foxRescue.rescued || !bounded(item.x, 960) || !bounded(item.y, 600) || !bounded(item.r, 50) || typeof item.label !== 'string' || item.label.length > 40)) return false;
      if (['forge', 'forge-reward', 'storehouse-switch', 'storehouse-cache'].includes(item.kind) && (s.mode !== 'random' || !s.roomEvent || s.roomEvent.kind !== (item.kind.startsWith('forge') ? 'forge' : 'storehouse') || typeof item.active !== 'boolean' || typeof item.used !== 'boolean')) return false;
      if (item.kind === 'breach-cache' && (s.mode !== 'random' || s.roomEvent?.kind !== 'breach' || typeof item.active !== 'boolean' || typeof item.used !== 'boolean' || !shortId(item.id) || !bounded(item.x, 960) || !bounded(item.y, 600))) return false;
    }
    for (const d of s.decoys) if (!d || typeof d.id !== 'string' || !['p1', 'p2'].includes(d.playerId || d.owner) || !bounded(d.x, 960) || !bounded(d.y, 600) || !bounded(d.ttl, 5)) return false;
    if (s.room.index >= s.rooms.length || s.rooms.length < 2) return false;
    if (s.mode === 'random' && (s.room.kind !== s.rooms[s.room.index].kind || s.room.encounter !== s.rooms[s.room.index].encounter)) return false;
    const refuges = s.rooms.filter(room => room.kind === 'refuge');
    for (const room of s.rooms) if (room.encounter !== undefined && (s.mode !== 'random' || room.kind !== 'battle' || room.elite || room.eventKind || !['patrol', 'crossfire', 'bulwark'].includes(room.encounter))) return false;
    if (s.mode === 'random') {
      if (refuges.length !== 1 || refuges[0].index === 0 || refuges[0].index === s.bossIndex || refuges[0].elite || refuges[0].eventKind || !refuges[0].cleared) return false;
      if (s.room.kind === 'refuge') {
        const rest = s.interactables.filter(item => item.kind === 'refuge-rest'), relic = s.interactables.filter(item => item.kind === 'refuge-relic');
        if (s.enemies.length !== 0 || s.roomEvent !== null || rest.length !== 1 || relic.length !== 1 || rest[0].used !== relic[0].used || rest[0].used && (rest[0].active || relic[0].active) || !rest[0].used && (!rest[0].active || relic[0].active !== (s.runBuffs.length < C.RELICS.length))) return false;
      }
    } else if (refuges.length) return false;
    if (s.mode === 'story' && (s.rooms.length !== 7 || s.room.index > 6)) return false;
    if (s.mode === 'chapter') {
      const chapter = s.chapter;
      if (!chapter || typeof chapter !== 'object' || Array.isArray(chapter) || chapter.id !== 'chapter1' || chapter.version !== 1 || s.difficulty !== 1 || s.rooms.length !== 7 || !['depart', 'workshop', 'core', 'return', 'complete', 'failed'].includes(chapter.phase)) return false;
      if (!Array.isArray(chapter.clues) || chapter.clues.length > 3 || new Set(chapter.clues).size !== chapter.clues.length || chapter.clues.some(id => !['trail', 'cooling', 'missing-core'].includes(id))) return false;
      if (!['sluiceOpen', 'bossDefeated', 'fireTaken', 'lampLit', 'suppliesTaken', 'beaconLit'].every(key => typeof chapter[key] === 'boolean')) return false;
      if (chapter.lampLit !== (s.status === 'won') || (chapter.phase === 'complete') !== (s.status === 'won') || (chapter.phase === 'failed') !== (s.status === 'lost') || chapter.lampLit && !chapter.fireTaken || chapter.fireTaken && !chapter.bossDefeated || chapter.bossDefeated && !chapter.sluiceOpen) return false;
      const layout = [[0, 0], [1, 0], [2, 0], [2, 1], [3, 1], [2, -1], [1, -1]], graph = [[1], [0, 2, 6], [1, 3, 5], [2, 4], [3], [2, 6], [1, 5]];
      if (s.rooms.some((room, index) => !room || room.gx !== layout[index][0] || room.gy !== layout[index][1] || !Array.isArray(room.neighbors) || room.neighbors.length !== graph[index].length || graph[index].some(next => !room.neighbors.includes(next)))) return false;
      for (const item of s.interactables) {
        if (item.kind === 'chapter-note' && (!['trail', 'cooling', 'missing-core'].includes(item.clueId) || typeof item.title !== 'string' || item.title.length > 40 || typeof item.text !== 'string' || item.text.length > 240)) return false;
        if (typeof item.kind === 'string' && item.kind.startsWith('chapter-') && !['chapter-note', 'chapter-sluice', 'chapter-fire', 'chapter-lamp', 'chapter-supplies', 'chapter-beacon'].includes(item.kind)) return false;
      }
    }
    if (s.mode === 'relay') {
      const relay = s.relay;
      if (!relay || s.mission.id !== 'salvage' || s.difficulty !== 1 || s.rooms.length !== 3 || relay.extractionRoom !== 0 || typeof relay.coreId !== 'string' || !relay.coreId || relay.coreId.length > 100 || !Number.isInteger(relay.coreRoom) || !bounded(relay.coreRoom, 2) || typeof relay.delivered !== 'boolean' || relay.delivered !== (s.status === 'won') || relay.delivered && (relay.coreRoom !== 0 || s.room.index !== 0)) return false;
      if (!['throws', 'catches', 'perfectCatches'].every(key => Number.isSafeInteger(relay[key]) && bounded(relay[key], 100000)) || relay.perfectCatches > relay.catches) return false;
      const cores = s.props.filter(prop => prop.kind === 'core');
      if (cores.length > 1 || cores.some(core => core.id !== relay.coreId)) return false;
      const core = cores[0], carriers = Object.values(s.players).filter(player => player.carry === relay.coreId);
      if (carriers.length > 1 || relay.coreRoom !== s.room.index && (core || carriers.length)) return false;
      if (core && (!bounded(core.x, 960) || !bounded(core.y, 600) || !Number.isFinite(core.vx) || Math.abs(core.vx) > 2000 || !Number.isFinite(core.vy) || Math.abs(core.vy) > 2000 || ![null, 'p1', 'p2'].includes(core.carriedBy) || ![null, 'p1', 'p2'].includes(core.thrower) || typeof core.thrown !== 'boolean' || !bounded(core.flightTime, 1.25) || !bounded(core.catchLock, .3) || !bounded(core.knockCd, 1.2) || !Array.isArray(core.hitIds) || core.hitIds.length > 100 || core.hitIds.some(id => typeof id !== 'string' || id.length > 100))) return false;
      if (core && (core.carriedBy ? !carriers.some(player => player.id === core.carriedBy) || core.thrown : carriers.length)) return false;
      if (!relay.delivered && relay.coreRoom === s.room.index && !core) return false;
      if (carriers.length && !core) return false;
    }
    if (s.mode === 'hunt') {
      const hunt = s.hunt, roomId = value => Number.isInteger(value) && bounded(value, 5), optionalRoom = value => value === null || roomId(value);
      if (!hunt || s.mission.id !== 'salvage' || s.difficulty !== 1 || s.rooms.length !== 6 || typeof hunt.targetId !== 'string' || !hunt.targetId || hunt.targetId.length > 100 || !roomId(hunt.targetRoom) || typeof hunt.defeated !== 'boolean' || hunt.defeated !== (s.status === 'won')) return false;
      if (s.rooms.some(room => !room || !Array.isArray(room.neighbors))) return false;
      if (!['previousRoom', 'lastSeenRoom', 'heardFrom', 'noiseRoom'].every(key => optionalRoom(hunt[key])) || hunt.heardFrom != null && !s.rooms[s.room.index].neighbors.includes(hunt.heardFrom) || !['lastSeenAt', 'noiseAt', 'lastLureAt'].every(key => bounded(hunt[key], s.elapsed + .1)) || !bounded(hunt.noiseLevel, 3) || !bounded(hunt.roamTimer, 86400) || !Number.isSafeInteger(hunt.lures) || !bounded(hunt.lures, 100000)) return false;
      if (!hunt.stepAt || Object.keys(hunt.stepAt).some(id => !['p1', 'p2'].includes(id)) || !bounded(hunt.stepAt.p1, s.elapsed + .1) || hunt.stepAt.p2 != null && !bounded(hunt.stepAt.p2, s.elapsed + .1)) return false;
      if (!Array.isArray(hunt.tracks) || hunt.tracks.length > 24) return false;
      for (const track of hunt.tracks) if (!track || !['room', 'from', 'to'].every(key => roomId(track[key])) || ![track.from, track.to].includes(track.room) || !s.rooms[track.from].neighbors.includes(track.to) || !bounded(track.x, 960) || !bounded(track.y, 600) || !bounded(track.time, s.elapsed + .1)) return false;
      if (hunt.arrival != null && (!roomId(hunt.arrival.from) || !roomId(hunt.arrival.to) || !s.rooms[hunt.arrival.from].neighbors.includes(hunt.arrival.to) || !bounded(hunt.arrival.duration, 10) || !bounded(hunt.arrival.remaining, hunt.arrival.duration))) return false;
      const targets = s.enemies.filter(enemy => enemy.huntTarget === true);
      if (targets.length > 1 || targets.some(enemy => enemy.id !== hunt.targetId || enemy.kind !== 'brute') || s.enemies.some(enemy => enemy.id === hunt.targetId && enemy.huntTarget !== true) || targets.some(enemy => enemy.hp > 0) && (hunt.defeated || hunt.targetRoom !== s.room.index) || !hunt.defeated && hunt.targetRoom === s.room.index && targets.length !== 1) return false;
      const layout = [[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [0, 1]];
      if (s.rooms.some((room, index) => room.gx !== layout[index][0] || room.gy !== layout[index][1] || room.discovered !== true || !Array.isArray(room.neighbors) || room.neighbors.length !== 2 || !room.neighbors.includes((index + 5) % 6) || !room.neighbors.includes((index + 1) % 6))) return false;
    }
    if (s.mode === 'random' || s.mode === 'relay' || s.mode === 'hunt' || s.mode === 'chapter') {
      const map = s.exploration;
      if (s.mode === 'random') {
        if (s.mission.id !== 'ember' || !Number.isInteger(s.bossIndex) || s.bossIndex < 1 || s.bossIndex >= s.rooms.length || !map) return false;
        if (!['kills', 'target', 'totalEnemies'].every(key => Number.isSafeInteger(map[key]) && map[key] >= 0) || map.target < 1 || map.target > map.totalEnemies || map.kills > map.totalEnemies + 1) return false;
        if (!['bossAwake', 'bossSpawned', 'bossDefeated'].every(key => typeof map[key] === 'boolean')) return false;
      }
      for (let index = 0; index < s.rooms.length; index++) {
        const room = s.rooms[index];
        if (!room || room.index !== index || !Number.isInteger(room.gx) || !Number.isInteger(room.gy) || Math.abs(room.gx) > 16 || Math.abs(room.gy) > 16 || typeof room.visited !== 'boolean' || typeof room.discovered !== 'boolean' || !Array.isArray(room.neighbors) || room.neighbors.length > 4 || new Set(room.neighbors).size !== room.neighbors.length) return false;
        if (s.mode === 'relay' && (room.gx !== index || room.gy !== 0 || room.neighbors.length !== (index === 1 ? 2 : 1))) return false;
        for (const target of room.neighbors) {
          const next = s.rooms[target];
          if (!Number.isInteger(target) || target < 0 || target >= s.rooms.length || target === index || !next || !Array.isArray(next.neighbors) || !next.neighbors.includes(index) || Math.abs(room.gx - next.gx) + Math.abs(room.gy - next.gy) !== 1) return false;
        }
      }
      if (new Set(s.rooms.map(room => `${room.gx},${room.gy}`)).size !== s.rooms.length) return false;
    }
    return true;
  }
  function receive(msg) {
    if (!net || !msg || typeof msg !== 'object') return;
    if (net.role === 'host') {
      if (msg.type === 'input' && Number.isSafeInteger(msg.seq) && msg.seq > remoteSeq) {
        const input = safeInput(msg.input);
        if (input) {
          // Several packets may arrive before the next fixed step. Keep a fresh
          // tap until that step consumes it, even when a later packet is keyup.
          if (performance.now() - remoteAt < 600) {
            input.switchPulse = input.switchPulse || remoteInput.switchPulse === true;
            input.guardPulse = input.guardPulse || remoteInput.guardPulse === true;
          }
          remoteInput = input; remoteSeq = msg.seq; remoteAt = performance.now();
        }
      } else if (msg.type === 'loadout' && !playing() && ['pistol', 'scatter'].includes(msg.weapon) && (msg.melee === undefined || ['blade', 'spear'].includes(msg.melee)) && (msg.foxRescued === undefined || typeof msg.foxRescued === 'boolean')) {
        const preparation = safeCampLoadout(msg.camp), companion = safeCompanion(msg.companion);
        if (preparation && companion !== false && (msg.foxRescued !== false || companion === null)) { remoteWeapon = msg.weapon; remoteMelee = msg.melee || 'blade'; remoteCamp = preparation; remoteCompanion = companion; remoteFoxRescued = msg.foxRescued === true || !!companion; remoteCampReady = true; updateLobbyMenu(); }
      }
    } else if (msg.type === 'start' && typeof msg.runId === 'string' && msg.runId.length < 100 && validState(msg.state)) {
      if (msg.runId === runId && state) return;
      clearChapterEnding();
      mode = 'guest'; state = msg.state; runId = msg.runId; finished = ''; paused = false; disconnected = false;
      chapterEndingEligible = state.mode === 'chapter' && state.status === 'playing' ? runId : '';
      remoteTutorialPending = ['relay', 'hunt'].includes(state.mode);
      clearInput(); resetSounds(); closeDialogs(); $('start-screen').hidden = true; $('end-screen').hidden = true; showMenu('playing');
      startTutorial(); primeChapterNarration(); displayPause(); canvas.focus(); hud();
    } else if (msg.type === 'state' && msg.runId === runId && validState(msg.state)) {
      if (state && state.mode === 'chapter' && finished === runId && state.status !== msg.state.status) return;
      state = msg.state; settle();
    }
    if (msg.type === 'pause' && msg.reason === 'tutorial') {
      if (msg.runId === runId && playing() && ['relay', 'hunt'].includes(state.mode) && typeof msg.paused === 'boolean') {
        remoteTutorialPending = msg.paused;
        if (remoteTutorialPending) { clearInput(); stopSounds(); }
      }
    } else if (msg.type === 'pause' && typeof msg.paused === 'boolean') {
      // A fresh manual pause from the other player belongs to them. Closing a
      // local settings window must not undo it; a partner echo of our own pause
      // keeps the original automatic-resume intent.
      if (hasDialog() && msg.reason === 'manual') dialogPaused = false;
      pause(msg.paused, false);
      if (net.role === 'host') net.send({ type: 'pause', paused: msg.paused, reason: 'partner' });
    }
    if (msg.type === 'lobby' && net.role === 'guest' && ['chapter', 'random', 'story', 'relay', 'hunt'].includes(msg.mode) && [1, 2].includes(msg.difficulty) && (msg.mode === 'chapter' ? msg.mission === 'chapter1' && msg.difficulty === 1 : C.MISSIONS.some(m => m.id === msg.mission)) && (!['relay', 'hunt'].includes(msg.mode) || msg.mission === 'salvage' && msg.difficulty === 1)) {
      $('mode-select').value = msg.mode;
      if (msg.mode !== 'chapter') $('mission-select').value = msg.mission;
      $('difficulty-select').value = String(msg.difficulty); updateCamp();
      $('room-message').textContent = `队长选择：${msg.mode === 'chapter' ? '第一章 · 第一节 · 借火归营' : msg.mode === 'random' ? '随机探险' : msg.mode === 'relay' ? '接力夺宝 · 试玩' : msg.mode === 'hunt' ? '苔火猎场 · 试玩' : missionInfo(msg.mission).name}${msg.difficulty === 2 ? ' · 险境' : ' · 普通'}，等待出发。`;
    }
  }
  function disconnectedPeer() {
    if (!state) { shutdownNet(); $('room-message').textContent = '伙伴已离开，可以重新创建或加入房间。'; return; }
    if (mode === 'host') {
      E.removePlayer(state, 'p2'); shutdownNet(); mode = 'solo';
      toast('搭档已断线，你可以继续独自探险。');
    } else if (mode === 'guest') {
      // An already settled run has no simulation to pause. Its local return
      // scene and result actions must remain available when the host leaves.
      if (!playing()) {
        shutdownNet(); disconnected = true; paused = false; clearInput(); displayPause();
        return;
      }
      disconnected = true; paused = true; clearInput(); displayPause(); toast('与房主的连接已断开。');
    }
  }
  function setupNet() {
    shutdownNet();
    let instance;
    instance = window.AdventureNet.create({
      onStatus(info) {
        if (net !== instance) return;
        if (info.state === 'error' && !state) shutdownNet();
        $('room-message').textContent = info.message;
        if (info.roomCode && info.state !== 'error') $('room-id').textContent = info.roomCode;
      },
      onPeer() {
        if (net !== instance) return;
        if (instance.role === 'host') remoteCampReady = false;
        $('start-room').disabled = instance.role !== 'host';
        $('start-room').textContent = instance.role === 'host' ? '一起出发 →' : '等待房主出发';
        $('room-message').textContent = instance.role === 'host' ? '搭档已到齐，可以一起出发。' : '已加入，等待房主开始探险。';
        updateLobbyMenu();
        if (instance.role === 'guest') sendCampLoadout();
        else instance.send({ type: 'lobby', mode: selectedGameMode(), mission: selectedMission(), difficulty: selectedDifficulty() });
      }, onMessage: receive,
      onDisconnect() { if (net === instance) disconnectedPeer(); }
    });
    net = instance; updateLobbyMenu(); return instance;
  }
  $('menu-play').onclick = lobbyMenu;
  $('menu-coop').onclick = () => { enableAudio(); openDialog('coop-dialog'); };
  $('menu-camp').onclick = () => { updateCamp(); openDialog('camp-dialog'); };
  $('menu-settings').onclick = () => openDialog('settings-dialog');
  $('menu-modes-back').onclick = () => showMenu('title');
  $('menu-loadout-back').onclick = () => showMenu(net && net.connected && net.role === 'guest' ? 'title' : 'modes');
  $('menu-challenges-back').onclick = () => showMenu('modes');
  $('mode-chapter').onclick = () => chooseMode('chapter');
  $('mode-random').onclick = () => chooseMode('random');
  $('mode-hunt').onclick = () => chooseMode('hunt');
  $('mode-relay').onclick = () => chooseMode('relay');
  $('mode-legacy').onclick = () => chooseMode('story');
  $('mode-challenges').onclick = () => showMenu('challenges');
  $('mode-training').onclick = () => {
    if (net) { toast('训练为单人模式，请先在联机房间离队。'); openDialog('coop-dialog'); return; }
    beginPractice();
  };
  $('coop-choose-mode').onclick = lobbyMenu;
  $('loadout-coop').onclick = () => openDialog('coop-dialog');
  $('solo-start').onclick = () => {
    if (net && (!net.connected || net.role === 'guest')) return;
    begin(!!(net && net.connected && net.role === 'host'));
  };
  $('practice-start').onclick = beginPractice;
  $('start-loadout').addEventListener('change', () => {
    sendCampLoadout();
  });
  $('start-melee').addEventListener('change', () => {
    if (account && (account.busy || account.needsChoice)) { updateCamp(); return; }
    meleeChoice = C.canUseSpear(camp) && $('start-melee').value === 'spear' ? 'spear' : 'blade';
    try { localStorage.setItem(MELEE_STORE, meleeChoice); } catch (_) { /* Keep the choice for this page. */ }
    updateCamp();
  });
  $('mode-select').addEventListener('change', updateCamp);
  $('companion-name-save').onclick = () => {
    if (account && (account.busy || account.needsChoice) || !camp.camp.companion.rescued) { updateCamp(); return; }
    const name = $('companion-name').value.trim();
    if (!C.validFoxName(name)) { toast('名字用 1–12 个汉字、字母或数字，也可加空格、·、下划线和短横线。'); return; }
    camp = C.renameFox(camp, name); writeCamp(); toast('名字已保存。');
  };
  $('companion-equipped').addEventListener('change', () => {
    if (account && (account.busy || account.needsChoice) || !camp.camp.companion.rescued) { updateCamp(); return; }
    camp = C.equipFox(camp, $('companion-equipped').checked === true); writeCamp();
  });
  $('mission-select').addEventListener('change', showMission);
  $('difficulty-select').addEventListener('change', showMission);
  $('open-coop').onclick = () => { enableAudio(); openDialog('coop-dialog'); };
  $('host-room').onclick = async () => {
    const connection = setupNet(); $('host-room').disabled = true; $('join-room').disabled = true;
    $('room-message').textContent = '正在连接联机服务…';
    try { const code = await connection.host(); if (net === connection) { $('room-id').textContent = code; $('start-room').textContent = '等待伙伴'; } }
    catch (error) { if (net === connection) { $('room-message').textContent = error.message || '创建失败，请稍后重试。'; $('host-room').disabled = $('join-room').disabled = false; } }
  };
  $('join-room').onclick = async () => {
    const code = $('room-code').value.trim().toUpperCase();
    if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(code)) { $('room-message').textContent = '请填写朋友分享的 8 位房间码。'; return; }
    const connection = setupNet(); $('host-room').disabled = $('join-room').disabled = true;
    try { await connection.join(code); }
    catch (error) { if (net === connection) { $('room-message').textContent = error.message || '加入失败，请检查房间码。'; $('host-room').disabled = $('join-room').disabled = false; } }
  };
  $('room-code').addEventListener('keydown', event => { if (event.key === 'Enter') $('join-room').click(); });
  $('copy-room').onclick = async () => {
    if (!net || !net.roomCode) return;
    try { await navigator.clipboard.writeText(net.roomCode); toast('房间码已复制，发给朋友即可。'); }
    catch (_) { toast(`请手动复制房间码：${net.roomCode}`); }
  };
  $('start-room').onclick = () => begin(true);
  $('leave-room').onclick = () => { if (chapterEndingActive()) finishChapterEnding(); shutdownNet(); $('room-message').textContent = '已离开房间。'; };
  $('close-coop').onclick = () => $('coop-dialog').close();
  $('help-game').onclick = () => openDialog('help-dialog');
  $('help-button').onclick = () => openDialog('help-dialog');
  $('tutorial-dismiss').onclick = dismissTutorial;
  $('close-help').onclick = () => $('help-dialog').close();
  $('open-camp').onclick = () => { updateCamp(); openDialog('camp-dialog'); };
  $('camp-close').onclick = () => $('camp-dialog').close();
  $('unlock-scatter').onclick = () => {
    if (storageOK) camp = readCamp();
    if (camp.scatter || camp.coins < 30) { updateCamp(); return; }
    camp.coins -= 30; camp.scatter = true; writeCamp(); $('start-loadout').value = 'scatter'; toast('散射枪已解锁，下次出发就能使用。');
    if (state && state.status !== 'playing' && !$('end-screen').hidden) showResultNext(resultDetails(camp, { profile: camp, duplicate: false }).next);
  };
  function refreshResultPreparation() {
    if (state && state.status !== 'playing' && !$('end-screen').hidden) showResultNext(resultDetails(camp, { profile: camp, duplicate: false }).next);
  }
  function purchaseCampUpgrade(id) {
    const upgrade = C.CAMP_UPGRADES.find(item => item.id === id);
    if (!upgrade) return;
    if (account && (account.busy || account.needsChoice)) { toast('请先完成账号存档的读取或选择，再整备。'); return; }
    if (storageOK) camp = readCamp();
    if (!C.canPurchaseUpgrade(camp, upgrade.id)) { updateCamp(); return; }
    camp = C.purchaseUpgrade(camp, upgrade.id); writeCamp();
    toast(upgrade.name + '已解锁，下次出发自动生效。'); refreshResultPreparation();
  }
  for (const upgrade of C.CAMP_UPGRADES) $('upgrade-' + upgrade.id).onclick = () => purchaseCampUpgrade(upgrade.id);
  $('starter-relic').addEventListener('change', () => {
    if (account && (account.busy || account.needsChoice)) { updateCamp(); return; }
    const selected = $('starter-relic').value || null;
    if (storageOK) camp = readCamp();
    camp = C.equipRelic(camp, selected); writeCamp(); refreshResultPreparation();
  });
  $('pause-game').onclick = () => pause(!paused);
  $('pause-settings').onclick = () => openDialog('settings-dialog');
  $('close-settings').onclick = () => $('settings-dialog').close();
  $('settings-sound').onclick = () => $('mute-game').click();
  $('settings-touch').onclick = () => {
    const options = ['auto', 'show', 'hide'];
    touchPreference = options[(options.indexOf(touchPreference) + 1) % options.length];
    try { localStorage.setItem(TOUCH_STORE, touchPreference); } catch (_) { /* Keep the choice for this page. */ }
    clearInput(); updateTouchControls();
  };
  $('settings-help').onclick = () => openDialog('help-dialog');
  $('settings-account').onclick = () => $('open-account').click();
  $('home-account').onclick = () => {
    homeAccountReturn = true;
    $('open-account').click();
  };
  $('account-dialog').addEventListener('close', () => {
    const returnToHome = homeAccountReturn;
    homeAccountReturn = false;
    if (returnToHome && !state && !$('start-screen').hidden && !hasDialog()) $('home-account').focus();
  });
  $('resume-game').onclick = () => pause(false);
  $('restart-game').onclick = $('end-restart').onclick = () => { if (mode !== 'guest') { if (state && state.practice) beginPractice(); else begin(mode === 'host'); } };
  $('back-camp').onclick = $('end-camp').onclick = home;
  $('chapter-ending-skip').onclick = finishChapterEnding;
  $('end-next-action').onclick = () => {
    if (!resultNext || resultNext.kind === 'wait') return;
    if (resultNext.kind === 'practice') beginPractice();
    else if (resultNext.kind === 'workshop') { const focusId = resultNext.focusId || 'unlock-scatter'; updateCamp(); openDialog('camp-dialog'); $(focusId).focus(); }
    else prepareResultMode(resultNext.gameMode);
  };
  $('mute-game').onclick = () => {
    muted = !muted; if (muted) stopSounds(); enableAudio();
    $('mute-game').setAttribute('aria-pressed', String(muted)); $('mute-game').textContent = muted ? '×♪' : '♪';
    $('settings-sound').setAttribute('aria-pressed', String(muted)); $('settings-sound').textContent = muted ? '声音 · 已关闭' : '声音 · 已开启';
  };
  const menuButtons = {
    title: ['menu-play', 'menu-coop', 'menu-camp', 'menu-settings'],
    modes: ['mode-chapter', 'mode-random', 'mode-challenges', 'mode-training', 'menu-modes-back'],
    challenges: ['mode-hunt', 'mode-relay', 'mode-legacy', 'menu-challenges-back'],
    loadout: ['solo-start', 'loadout-coop', 'open-coop', 'menu-loadout-back']
  };
  const feedbackButtons = [...new Set([...Object.values(menuButtons).flat(), 'home-account', 'resume-game', 'restart-game', 'pause-settings', 'back-camp', 'end-restart', 'end-camp', 'end-next-action', 'settings-sound', 'settings-touch', 'settings-help', 'settings-account', 'close-settings'])];
  feedbackButtons.forEach(id => {
    $(id).addEventListener('click', () => menuSound('select'));
    $(id).addEventListener('pointerenter', () => menuSound('hover'));
    $(id).addEventListener('focus', () => menuSound('hover'));
  });
  function input() {
    const p = state && state.players[localId()];
    let mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + touch.mx;
    let my = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + touch.my;
    const length = Math.hypot(mx, my); if (length > 1) { mx /= length; my /= length; }
    let aimX = mouse.x, aimY = mouse.y;
    const defending = guardPulse || mouse.guard || touch.guard || keys.has('KeyK') || p && p.guardWindow > 0;
    const coreCarried = p && state.mode === 'relay' && state.relay && p.carry === state.relay.coreId;
    if (coreCarried && !mouse.active) {
      // On touch/keyboard, carrying follows the travel direction rather than aiming at a distant guard.
      const angle = Math.hypot(mx, my) > .05 ? Math.atan2(my, mx) : p.facing || 0;
      aimX = p.x + Math.cos(angle) * 100; aimY = p.y + Math.sin(angle) * 100;
    } else if (p && !coreCarried && (defending || !mouse.active || touch.shoot || keys.has('KeyJ'))) {
      const enemies = state.enemies.filter(enemy => enemy.hp > 0);
      // Defence follows the imminent blade instead of a stale mouse position.
      const incoming = defending && enemies.filter(enemy => enemy.rhythm && enemy.rhythm.type === 'combo' && enemy.rhythm.phase === 'windup' && enemy.stagger <= 0 && Math.hypot(enemy.x - p.x, enemy.y - p.y) <= enemy.rhythm.range + p.r)
        .sort((a, b) => a.rhythm.remaining - b.rhythm.remaining)[0];
      const nearest = incoming || enemies.reduce((best, enemy) => !best || Math.hypot(enemy.x - p.x, enemy.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? enemy : best, null);
      aimX = nearest ? nearest.x : p.x + Math.cos(p.facing || 0) * 100;
      aimY = nearest ? nearest.y : p.y + Math.sin(p.facing || 0) * 100;
    }
    return { mx, my, aimX, aimY, shoot: mouse.down || touch.shoot || keys.has('KeyJ'), dash: dashPulse || keys.has('Space') || touch.dash, guard: mouse.guard || touch.guard || keys.has('KeyK'), guardPulse, interact: interactPulse || keys.has('KeyE') || touch.interact,
      switchWeapon: keys.has('KeyQ') || touch.switchWeapon, switchPulse };
  }
  const controlKeys = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyE','KeyJ','KeyK','KeyQ']);
  window.addEventListener('keydown', event => {
    if (chapterEndingActive() && !hasDialog() && ['Enter', 'Escape'].includes(event.code)) {
      event.preventDefault();
      if (!event.repeat) finishChapterEnding();
      return;
    }
    if (event.code === 'Escape' && !hasDialog()) {
      event.preventDefault();
      if (!event.repeat) {
        if (!state) showMenu(menuScreen === 'challenges' || menuScreen === 'loadout' && !(net && net.connected && net.role === 'guest') ? 'modes' : 'title');
        else pause(!paused);
      }
      return;
    }
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (!state && !hasDialog() && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.code)) {
      const options = (menuButtons[menuScreen] || []).map($).filter(button => !button.hidden && !button.disabled);
      if (options.length) {
        const current = options.indexOf(document.activeElement), direction = event.code === 'ArrowUp' ? -1 : 1;
        const index = event.code === 'Home' ? 0 : event.code === 'End' ? options.length - 1 : current < 0 ? direction > 0 ? 0 : options.length - 1 : (current + direction + options.length) % options.length;
        event.preventDefault(); options[index].focus();
      }
      return;
    }
    if (playing() && !paused && !hasDialog() && controlKeys.has(event.code)) {
      event.preventDefault(); keys.add(event.code);
      if (!event.repeat && event.code === 'Space') dashPulse = true;
      if (!event.repeat && event.code === 'KeyE') interactPulse = true;
      if (!event.repeat && event.code === 'KeyK') guardPulse = true;
      if (!event.repeat && event.code === 'KeyQ') switchPulse = true;
    }
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && !touchSeen) { touchSeen = true; updateTouchControls(); }
  }, true);
  window.addEventListener('resize', () => { clearInput(); updateTouchControls(); });
  for (const query of ['(any-pointer: coarse)', '(pointer: coarse)']) {
    try {
      const media = window.matchMedia && window.matchMedia(query);
      const changed = () => { clearInput(); updateTouchControls(); };
      if (media && media.addEventListener) media.addEventListener('change', changed);
      else if (media && media.addListener) media.addListener(changed);
    } catch (_) { /* Actual touch and the manual setting remain available. */ }
  }
  function pointerAim(event) {
    const bounds = canvas.getBoundingClientRect();
    mouse.x = Math.max(0, Math.min(960, (event.clientX - bounds.left) * 960 / bounds.width));
    mouse.y = Math.max(0, Math.min(600, (event.clientY - bounds.top) * 600 / bounds.height));
    mouse.active = true;
  }
  canvas.addEventListener('pointermove', pointerAim);
  canvas.addEventListener('pointerdown', event => {
    if (!playing() || paused || hasDialog() || event.pointerType === 'touch') return;
    if (event.button === 0 || event.button === 2) {
      event.preventDefault(); pointerAim(event); canvas.focus(); enableAudio();
      if (event.button === 0) mouse.down = true;
      else { mouse.guard = true; guardPulse = true; }
    }
  });
  window.addEventListener('pointerup', event => { if (event.button === 0) mouse.down = false; if (event.button === 2) mouse.guard = false; });
  window.addEventListener('pointercancel', clearInput);
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  window.addEventListener('blur', () => { clearInput(); stopSounds(); if (playing() && !paused) pause(true); });
  document.addEventListener('visibilitychange', () => { if (chapterEnding) chapterEnding.last = 0; if (document.hidden) { clearInput(); stopSounds(); if (playing() && !paused) pause(true); } });
  const joystick = $('joystick');
  function moveStick(event) {
    const bounds = joystick.getBoundingClientRect(), radius = bounds.width * .32;
    const x = event.clientX - bounds.left - bounds.width / 2, y = event.clientY - bounds.top - bounds.height / 2;
    const length = Math.hypot(x, y), factor = Math.min(1, radius / (length || 1));
    touch.mx = x * factor / radius; touch.my = y * factor / radius;
    $('joystick-stick').style.transform = `translate(${x * factor}px,${y * factor}px)`;
  }
  joystick.addEventListener('pointerdown', event => { if (!touchGameActive() || touchPreference === 'hide' || joystickId !== null) return; event.preventDefault(); mouse.active = false; joystickId = event.pointerId; joystick.setPointerCapture(event.pointerId); moveStick(event); });
  joystick.addEventListener('pointermove', event => { if (event.pointerId === joystickId && touchGameActive()) moveStick(event); });
  function releaseStick(event) { if (event.pointerId === joystickId) { joystickId = null; touch.mx = touch.my = 0; $('joystick-stick').style.transform = 'translate(0px,0px)'; } }
  joystick.addEventListener('pointerup', releaseStick); joystick.addEventListener('pointercancel', releaseStick); joystick.addEventListener('lostpointercapture', releaseStick);
  for (const action of ['shoot', 'dash', 'guard', 'interact', 'switchWeapon']) {
    const button = $('touch-' + (action === 'switchWeapon' ? 'switch' : action));
    button.addEventListener('pointerdown', event => { if (!touchGameActive() || touchPreference === 'hide' || touchPointers.has(action)) return; event.preventDefault(); mouse.active = false; enableAudio(); button.setPointerCapture(event.pointerId); touchPointers.set(action, event.pointerId); touch[action] = true; if (action === 'dash') dashPulse = true; if (action === 'guard') guardPulse = true; if (action === 'interact') interactPulse = true; if (action === 'switchWeapon') switchPulse = true; });
    const release = (event, cancelled) => {
      if (!touchPointers.has(action) || touchPointers.get(action) !== event.pointerId) return;
      touchPointers.delete(action); touch[action] = false;
      if (cancelled) { if (action === 'guard') guardPulse = false; if (action === 'switchWeapon') switchPulse = false; if (action === 'dash') dashPulse = false; if (action === 'interact') interactPulse = false; }
    };
    button.addEventListener('pointerup', event => release(event, false)); button.addEventListener('pointercancel', event => release(event, true)); button.addEventListener('lostpointercapture', event => release(event, true));
  }
  function hud() {
    const p = state && state.players[localId()];
    const random = state && state.mode === 'random';
    const relay = state && state.mode === 'relay';
    const hunt = state && state.mode === 'hunt';
    const chapter = state && state.mode === 'chapter';
    $('game-wrap').setAttribute('data-mode', state ? state.mode : selectedGameMode());
    $('game-wrap').setAttribute('data-practice', String(!!(state && state.practice)));
    if (tutorialPending && state && state.room.index !== 0) dismissTutorial();
    $('tutorial-panel').hidden = !tutorialPending || !playing() || paused || hasDialog();
    $('hud-stage').textContent = state ? state.room.name : '苔灯营地';
    const core = relay && state.props.find(prop => prop.id === state.relay.coreId);
    let huntObjective = '';
    if (hunt) {
      const target = state.enemies.find(enemy => enemy.huntTarget && enemy.hp > 0);
      const heard = state.hunt.heardFrom;
      const currentRoom = state.rooms[state.room.index];
      if (state.hunt.defeated) huntObjective = '逐迹巨兽已击败';
      else if (target) huntObjective = `逐迹巨兽 · ${Math.ceil(target.hp)} / ${target.maxHp}`;
      else if (heard != null && currentRoom.neighbors.includes(heard)) {
        const source = state.rooms[heard], dx = source.gx - currentRoom.gx, dy = source.gy - currentRoom.gy;
        huntObjective = `${dx > 0 ? '东侧' : dx < 0 ? '西侧' : dy > 0 ? '南侧' : '北侧'}传来沉重脚步`;
      } else if (state.hunt.lastSeenRoom != null) huntObjective = `上次目击：${state.rooms[state.hunt.lastSeenRoom].name}`;
      else huntObjective = '追踪逐迹巨兽';
    }
    $('hud-objective').textContent = remoteTutorialPending && !tutorialPending ? '等待搭档准备好，一起出发' : hunt ? huntObjective : relay ? state.relay.delivered ? '炉芯已送达' : core && core.carriedBy ? core.carriedBy === localId() ? '炉芯在你手中 · 带回入口' : '搭档携带炉芯 · 掩护撤离' : `炉芯位于${state.rooms[state.relay.coreRoom].name}` : state ? state.objective : '独自探险，或邀请一位搭档';
    $('hud-objective').hidden = false;
    $('hud-health').textContent = p ? `${p.downed ? '倒地' : '♥'.repeat(Math.max(0, Math.ceil(p.hp)))} ${Math.max(0, p.hp)} / ${p.maxHp}${p.ward ? ' ◈' : ''}` : '6 / 6';
    $('hud-dash').textContent = p && p.relayBoost > 0 ? `接力加速 ${p.relayBoost.toFixed(1)}s` : p && p.dashCd > 0 ? `闪避 ${p.dashCd.toFixed(1)}s` : '闪避就绪';
    $('hud-loot').textContent = `${camp.coins} 星屑`;
    $('hud-team').textContent = state && state.practice ? '招架试炼' : state && Object.keys(state.players).length === 2 ? (mode === 'guest' ? '双人 · 搭档' : '双人 · 队长') : '独自探险';
    const rangedName = p && p.weapons.ranged === 'scatter' ? '散射枪' : '手枪';
    const meleeName = p && p.weapons.melee === 'spear' ? '长枪' : '短刃';
    $('hud-melee').textContent = meleeName;
    $('hud-ranged').textContent = rangedName + (p && p.rangedBroken ? ' · 已损坏' : '');
    $('hud-melee').setAttribute('data-active', String(!!p && p.activeSlot === 'melee'));
    $('hud-ranged').setAttribute('data-active', String(!!p && p.activeSlot === 'ranged'));
    $('hud-ranged').setAttribute('data-broken', String(!!p && p.rangedBroken));
    $('hud-quiet').hidden = !p || !p.sneaking;
    const opening = p && !p.downed && state.enemies.filter(enemy => enemy.hp > 0 && enemy.weakTime > 0 && Math.hypot(enemy.x - p.x, enemy.y - p.y) <= 360).sort((a, b) => b.weakTime - a.weakTime)[0];
    $('hud-opportunity').hidden = !opening || paused || tutorialPending || remoteTutorialPending || hasDialog() || !playing();
    $('hud-opportunity').textContent = opening ? `破绽暴露 ${opening.weakTime.toFixed(1)}s` : '';
    const buffs = Object.fromEntries(Object.entries(E.BUFFS).map(([id, buff]) => [id, buff.label]));
    $('route-progress').textContent = chapter ? `第一节 · 借火归营 · 记录 ${state.chapter.clues.length} / 3${state.chapter.fireTaken ? ' · 火种已带上' : ''}` : hunt ? `苔火猎场 · 诱敌 ${state.hunt.lures} 次` : relay ? '撤离台 ← 断桥庭院 ← 炉芯密库' : state && state.mission ? `${random ? (state.difficulty === 2 ? '险境' : '') : missionInfo(state.mission.id).name + ' · ' + state.mission.progress + ' / ' + state.mission.total}${state.runBuffs.length ? (random && state.difficulty !== 2 ? '' : ' · ') + state.runBuffs.map(id => buffs[id] || '').filter(Boolean).join(' / ') : ''}` : '';
    if (random && styleNames(state).length) $('route-progress').textContent = '流派 · ' + styleNames(state).join(' / ') + (state.difficulty === 2 ? ' · 险境' : '');
    $('route-progress').hidden = !!(state && state.practice) || !$('route-progress').textContent;
    const hint = state && !paused && !finished ? (E.getHint ? E.getHint(state, localId()) : state.hint) : '';
    $('interaction-hint').textContent = hint || ''; $('interaction-hint').hidden = !hint;
    updateTouchControls();
    $('touch-interact').textContent = relay && p && p.carry === state.relay.coreId ? state.room.index === state.relay.extractionRoom && Math.hypot(p.x - 120, p.y - 300) < 76 ? '交' : '掷' : 'E';
    $('touch-interact').setAttribute('aria-label', relay ? '拾取、投掷或交付炉芯' : '互动');
    $('touch-guard').setAttribute('aria-label', relay ? '接住炉芯、格挡与静步' : '格挡与静步');
    $('touch-shoot').textContent = p && p.activeSlot === 'ranged' ? '射' : p && p.weapons.melee === 'spear' ? '刺' : '斩';
    $('touch-switch').disabled = !p || p.rangedBroken;
    $('touch-switch').setAttribute('aria-label', p && p.rangedBroken ? '远程武器损坏，本局无法切换' : p && p.activeSlot === 'ranged' ? '切换为' + meleeName : '切换为' + rangedName);
    $('chapter-journal').hidden = !chapter;
    $('chapter-notes').innerHTML = chapter && state.chapter.clues.length ? state.chapter.clues.map(id => {
      const note = E.CHAPTER_NOTES[id];
      return `<article><strong>${escapeHTML(note.title)}</strong><p>${escapeHTML(note.text)}</p></article>`;
    }).join('') : '<p>尚未发现记录。路标与旧工单可以按 E 查看。</p>';
  }
  function frame(now) {
    const delta = last ? Math.min((now - last) / 1000, .1) : 0; last = now;
    if (playing() && !paused && !remoteTutorialPending && !hasDialog() && !((state.practice || relayTutorial || huntTutorial) && tutorialPending)) {
      if (mode === 'guest') {
        if (net && net.connected && now - lastSend >= 30) {
          if (net.send({ type: 'input', input: input(), seq: ++seq })) { dashPulse = guardPulse = interactPulse = switchPulse = false; lastSend = now; }
        }
      } else {
        accumulator += delta;
        while (accumulator >= 1 / 60 && state.status === 'playing') {
          const commands = { p1: input() };
          if (mode === 'host') commands.p2 = now - remoteAt < 600 ? remoteInput : {};
          E.step(state, commands, 1 / 60); soundEvents();
          // A received tap is consumed once, while held guard remains available to later steps.
          remoteInput.guardPulse = false;
          remoteInput.switchPulse = false;
          dashPulse = guardPulse = interactPulse = switchPulse = false; accumulator -= 1 / 60;
        }
      }
    } else accumulator = 0;
    companionUpdates(); chapterUpdates(); soundEvents();
    if (mode === 'host' && net && net.connected && state && now - lastSend >= 50) {
      net.send({ type: 'state', state: E.snapshot(state, true), runId }); lastSend = now;
    }
    settle();
    advanceChapterEnding(now);
    try { if (state) R.draw(ctx, state, { localId: localId(), now, paused: paused || remoteTutorialPending || hasDialog() || !!((state.practice || relayTutorial || huntTutorial) && tutorialPending), reducedMotion: reducedMotion(), chapterEndingAge: chapterEndingActive() ? chapterEnding.age : undefined }); else R.preview(ctx, { ...C.progress(camp), chapter1: chapterProgress().completed, companion: camp.camp.companion.rescued ? { kind: 'fox', name: camp.camp.companion.name } : null, now, reducedMotion: reducedMotion() }); }
    catch (error) { if (!frame.errorReported) { frame.errorReported = true; console.error(error); toast('画面绘制遇到问题，请刷新页面重试。'); } }
    if (now - lastHud > 100) { hud(); lastHud = now; }
    requestAnimationFrame(frame);
  }
  window.addEventListener('storage', event => {
    if (!account && event.key === STORE) { camp = readCamp(); updateCamp(); }
    if (event.key === TOUCH_STORE) { touchPreference = readTouchPreference(); clearInput(); updateTouchControls(); }
  });
  if (window.AdventureAccount && window.AdventureCloud) {
    const config = window.AdventureCloudConfig || {};
    const cloud = window.AdventureCloud.create(config, {
      onAuthChange(user) { if (account) return account.handleAuth(user); }
    });
    account = window.AdventureAccount.create({
      campaign: C, cloud, projectUrl: config.url || '', initialProfile: camp,
      setProfile(profile) { camp = C.normalize(profile); updateCamp(); },
      openDialog() { openDialog('account-dialog'); },
      isBusy() { return playing() || !!(net && net.connected); },
      onIdentityChange() {
        if (state || net) { home(); toast('账号已切换，已返回营地。正在进行的探险不结算奖励。'); }
      },
      onStatus() { if (account) updateCamp(); },
      onLockChange() { if (account) updateCamp(); }
    });
    account.init().catch(() => { toast('暂时连不上账号服务，本机存档仍保留。'); });
  } else {
    $('open-account').onclick = () => { $('account-message').textContent = '账号服务未加载，请刷新后再试。'; openDialog('account-dialog'); };
    $('close-account').onclick = () => $('account-dialog').close();
  }
  updateCamp(); showMenu('title'); hud(); requestAnimationFrame(frame);
})();
