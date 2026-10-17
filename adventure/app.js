(function () {
  'use strict';
  const E = window.AdventureEngine, R = window.AdventureRenderer, C = window.AdventureCampaign;
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const STORE = 'ruins-squad-camp-v2', LEGACY_STORE = 'ruins-squad-camp-v1';
  const TUTORIAL_STORE = 'ruins-squad-tutorial-v1';
  const RHYTHM_TUTORIAL_STORE = 'ruins-squad-rhythm-tutorial-v1';
  let camp, storageOK = true, state = null, mode = 'solo', net = null;
  let account = null;
  let paused = false, disconnected = false, runId = '', finished = '', remoteWeapon = 'blade';
  let remoteInput = {}, remoteAt = 0, remoteSeq = -1, seq = 0, lastSend = 0;
  let last = 0, accumulator = 0, lastHud = 0, toastTimer, dialogPaused = false;
  let muted = false, audio = null, soundLast = 0;
  const heardEvents = new Set(), soundNodes = new Set();
  const keys = new Set(), mouse = { x: 650, y: 300, down: false, guard: false, active: false };
  const touch = { mx: 0, my: 0, shoot: false, dash: false, guard: false, interact: false };
  let dashPulse = false, guardPulse = false, interactPulse = false;
  let tutorialPending = false, rhythmTutorial = false;
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
  const hasDialog = () => ['help-dialog', 'camp-dialog', 'coop-dialog', 'account-dialog'].some(id => $(id).open);
  function toast(message) {
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3800);
  }
  function clearInput() {
    keys.clear(); mouse.down = mouse.guard = false; touch.mx = touch.my = 0;
    touch.shoot = touch.dash = touch.guard = touch.interact = false; dashPulse = guardPulse = interactPulse = false;
    $('joystick-stick').style.transform = 'translate(0px,0px)';
    remoteInput = {};
  }
  function stopSounds() {
    for (const oscillator of soundNodes) { try { oscillator.stop(); } catch (_) { /* Already ended. */ } }
    soundNodes.clear();
  }
  function resetSounds() { stopSounds(); heardEvents.clear(); soundLast = 0; }
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
  function soundEvents() {
    if (!state) return;
    for (const event of [...(state.combatEvents || []), ...(state.events || [])]) {
      if (!event || typeof event.id !== 'string' && !Number.isSafeInteger(event.id) || heardEvents.has(event.id)) continue;
      heardEvents.add(event.id);
      if (heardEvents.size > 512) heardEvents.delete(heardEvents.values().next().value);
      // Historical snapshots may contain an old cue: never play a late warning as a new beat.
      const age = Number.isFinite(event.time) ? Math.max(0, state.elapsed - event.time) : 0;
      if (age > .25 || paused || hasDialog()) continue;
      if (event.type === 'rhythm-windup') {
        const remaining = Math.max(0, Math.min(3, event.duration || .8) - age);
        if (remaining < .07) continue;
        tone(event.attack === 'thrust' ? 230 : 150, Math.min(.35, remaining), .018, 'triangle', 0, 390);
      } else if (event.type === 'rhythm-beat') {
        tone(65, .13, .035, 'triangle', 0, 35);
      } else if (['perfect-parry', 'mikiri', 'perfect-dodge'].includes(event.type)) {
        tone(event.type === 'mikiri' ? 1040 : 1460, .11, .045, 'triangle', 0, 780);
        tone(2180, .055, .022, 'sine', .025);
      } else if (event.type === 'counterattack') {
        tone(330, .17, .035, 'triangle', 0, 100);
      } else if (event.type === 'guard-break') {
        tone(120, .23, .035, 'sawtooth', 0, 45);
      } else if (event.type === 'shoot' && performance.now() - soundLast > 170) {
        tone(180 + Math.random() * 70, 0.035, 0.007, 'triangle'); soundLast = performance.now();
      } else if (event.type === 'player-hit') tone(92, 0.13, 0.04, 'sawtooth');
      else if (event.type === 'dash') tone(420, 0.075, 0.02);
      else if (event.type === 'explosion') tone(55, 0.22, 0.05, 'sawtooth');
      else if (['room-clear', 'revive', 'relic-selected', 'cache-searched', 'wave-clear'].includes(event.type)) tone(680, 0.18, 0.03);
      else if (event.type === 'boss-awakened') tone(240, 0.55, 0.045, 'triangle');
    }
    if (paused || hasDialog()) return;
    // Read the live windup, so a staggered or defeated attacker leaves no scheduled warning behind.
    for (const enemy of state.enemies || []) {
      const attack = enemy.rhythm;
      if (!attack || attack.phase !== 'windup' || attack.remaining <= 0 || attack.remaining > .15 || enemy.stagger > 0 || enemy.hp <= 0) continue;
      const windup = [...(state.combatEvents || [])].reverse().find(event => event.type === 'rhythm-windup' && event.enemyId === enemy.id && event.attack === attack.type && event.beat === attack.beat);
      if (!windup) continue;
      const cueId = 'cue:' + windup.id;
      if (heardEvents.has(cueId)) continue;
      heardEvents.add(cueId);
      tone(attack.type === 'sweep' ? 790 : 990, .045, .028, 'sine');
    }
  }
  function selectedWeapon() { return $('start-loadout').value === 'blade' ? 'blade' : camp.scatter && $('start-loadout').value === 'scatter' ? 'scatter' : 'pistol'; }
  function missionInfo(id) { return C.MISSIONS.find(mission => mission.id === id) || C.MISSIONS[0]; }
  function selectedGameMode() { return $('mode-select').value === 'story' ? 'story' : 'random'; }
  function selectedMission() { return selectedGameMode() === 'random' ? 'ember' : missionInfo($('mission-select').value).id; }
  function selectedDifficulty() { return $('difficulty-select').value === '2' ? 2 : 1; }
  function canStart(gameMode, mission, difficulty) { return gameMode === 'random' || C.canPlay(camp, mission, difficulty); }
  function startTutorial() {
    rhythmTutorial = !!(state && state.practice);
    try { tutorialPending = localStorage.getItem(rhythmTutorial ? RHYTHM_TUTORIAL_STORE : TUTORIAL_STORE) !== '1'; } catch (_) { tutorialPending = true; }
    $('tutorial-title').textContent = rhythmTutorial ? '先看动作，再接住那一拍' : '先试试手，再走进遗迹';
    $('tutorial-controls-desktop').textContent = rhythmTutorial ? 'K / 右键防守 · 空格闪避 · J / 左键反击' : 'WASD 移动 · J / 左键攻击 · K / 右键防守 · 空格闪避 · E 互动';
    $('tutorial-controls-touch').textContent = rhythmTutorial ? '按住盾牌防守；闪避避开横扫，攻击打出反击。' : '左侧摇杆移动，右侧按钮攻击、防守、闪避和互动。';
    $('tutorial-detail').textContent = rhythmTutorial ? '斩击落下前按防守可招架；突刺时迎面闪进，横扫时踩点闪避。此刻暂停，准备好再迎战。' : '房间自由进出；击杀唤醒守卫，精英掉落遗物。';
    $('tutorial-dismiss').textContent = rhythmTutorial ? '准备好了，迎战 →' : '知道了，出发 →';
    $('tutorial-panel').hidden = !tutorialPending;
  }
  function dismissTutorial() {
    tutorialPending = false; $('tutorial-panel').hidden = true;
    try { localStorage.setItem(rhythmTutorial ? RHYTHM_TUTORIAL_STORE : TUTORIAL_STORE, '1'); } catch (_) { /* Tutorial is optional. */ }
    clearInput(); if (playing()) { enableAudio(); canvas.focus(); }
  }
  function escapeHTML(value) { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
  function showMission() {
    const gameMode = selectedGameMode(), random = gameMode === 'random';
    const mission = missionInfo(selectedMission()), completion = camp.missions[mission.id];
    $('story-mission-field').hidden = random;
    $('game-wrap').setAttribute('data-mode', state ? state.mode : gameMode);
    $('mission-name').textContent = random ? '迷雾远征' : mission.name;
    $('mission-description').textContent = random ? '每次出发，遗迹都会重新排列。沿着迷雾寻找自己的路线。' : mission.description;
    $('mission-goal').textContent = random ? '探索遗迹，击杀守卫唤醒深处的 Boss。' : mission.goal;
    $('mission-reward').textContent = `带回 ${mission.reward + (selectedDifficulty() === 2 ? 20 : 0)} 星屑`;
    const unlocked = canStart(gameMode, mission.id, selectedDifficulty());
    $('mission-lock').textContent = random ? '自由探索 · 精英掉落遗物' : unlocked ? (completion.clears ? `已完成 ${completion.clears} 次${completion.hardClears ? ` · 险境 ${completion.hardClears} 次` : ''}` : '首次完成，点亮一盏营灯') : '先完成前一项任务，三盏营灯点亮后可挑战险境。';
    $('mission-lock').hidden = false;
    $('solo-start').disabled = !unlocked;
    if (!state && net && net.connected && net.role === 'host') net.send({ type: 'lobby', mode: gameMode, mission: mission.id, difficulty: selectedDifficulty() });
  }
  function updateCamp() {
    const option = $('start-loadout').querySelector('option[value="scatter"]');
    option.disabled = !camp.scatter; option.textContent = camp.scatter ? '散射枪' : '散射枪 · 待解锁';
    const progress = C.progress(camp);
    const random = selectedGameMode() === 'random';
    $('campaign-status').textContent = random ? `星屑 ${camp.coins} · 归来 ${camp.wins} 次 · 遗物图鉴 ${progress.relicCount} / ${progress.relicTotal}` : `营灯 ${progress.lit} / 3 · 星屑 ${camp.coins} · ${progress.allCleared ? '险境任务已开启' : '完成任务，点亮营地的三盏灯'}`;
    $('mission-progress').textContent = random ? '每局一张新地图' : `营灯 ${progress.lit} / 3${progress.allCleared ? ` · 险境 ${progress.hardLit} / 3` : ''}`;
    $('camp-copy').textContent = `营地三盏灯已点亮 ${progress.lit} 盏。${progress.allCleared ? '所有任务已完成，可挑战险境和收集遗物。' : '完成三个不同的任务，让营地重新亮起来。'}现有 ${camp.coins} 星屑。${account ? account.status : storageOK ? '进度保存在当前浏览器。' : '浏览器未允许保存，刷新后进度可能丢失。'}`;
    $('camp-objectives').innerHTML = C.MISSIONS.map((mission, i) => {
      const complete = camp.missions[mission.id].clears > 0;
      return `<div class="camp-lamp${complete ? ' lit' : ''}" data-complete="${complete}"><i aria-hidden="true"></i><strong>第 ${i + 1} 盏营灯</strong><span>${escapeHTML(mission.name)} · ${complete ? '已点亮' : '等待修复'}</span></div>`;
    }).join('');
    $('journal-list').innerHTML = C.BADGES.map(badge => {
      const earned = camp.badges.includes(badge.id);
      return `<div class="journal-item${earned ? ' earned' : ''}"><span class="journal-icon" aria-hidden="true"><span>${earned ? '◆' : '◇'}</span></span><div><strong>${escapeHTML(badge.name)}</strong><p>${escapeHTML(badge.description)}</p></div><span class="journal-status">${earned ? '已达成' : '未达成'}</span></div>`;
    }).join('');
    for (const mission of C.MISSIONS) {
      const item = $('mission-select').querySelector(`option[value="${mission.id}"]`);
      item.disabled = !C.canPlay(camp, mission.id, 1);
      item.textContent = `${mission.name}${item.disabled ? ' · 待解锁' : camp.missions[mission.id].clears ? ' · 已完成' : ''}`;
    }
    if (!C.canPlay(camp, selectedMission(), 1)) $('mission-select').value = 'ember';
    const hard = $('difficulty-select').querySelector('option[value="2"]');
    hard.disabled = !random && !progress.allCleared;
    hard.textContent = random || progress.allCleared ? '险境 · 更多危险与奖励' : '险境 · 三盏营灯后开启';
    if (!random && !progress.allCleared) $('difficulty-select').value = '1';
    $('unlock-scatter').disabled = camp.scatter || camp.coins < 30;
    $('unlock-scatter').textContent = camp.scatter ? '已解锁 · 出发前可选择' : `30 星屑解锁${camp.coins < 30 ? ' · 通关一局即可' : ''}`;
    showMission();
  }
  function closeDialogs() {
    ['help-dialog', 'camp-dialog', 'coop-dialog', 'account-dialog'].forEach(id => { if ($(id).open) $(id).close(); });
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
    if (announce !== false && net && net.connected) net.send({ type: 'pause', paused, reason: 'manual' });
  }
  function openDialog(id) {
    clearInput(); stopSounds(); dialogPaused = playing() && !paused;
    if (dialogPaused) pause(true);
    if (!$(id).open) $(id).showModal();
  }
  ['help-dialog', 'camp-dialog', 'account-dialog'].forEach(id => {
    $(id).addEventListener('close', () => { if (dialogPaused && !hasDialog()) { dialogPaused = false; pause(false); } });
  });
  function shutdownNet() {
    const old = net; net = null; if (old) old.close();
    remoteInput = {}; remoteAt = 0; remoteSeq = -1;
    $('room-id').textContent = '— — — —'; $('start-room').disabled = true;
    $('host-room').disabled = false; $('join-room').disabled = false;
  }
  function home() {
    shutdownNet(); state = null; mode = 'solo'; paused = false; disconnected = false;
    finished = ''; runId = ''; clearInput(); resetSounds(); closeDialogs();
    $('start-screen').hidden = false; $('pause-screen').hidden = true; $('end-screen').hidden = true;
    $('interaction-hint').hidden = true; tutorialPending = false; $('tutorial-panel').hidden = true; updateCamp(); hud();
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
    if (!isCoop) shutdownNet();
    mode = isCoop ? 'host' : 'solo';
    let mission = selectedMission(), difficulty = selectedDifficulty(), gameMode = selectedGameMode();
    // Restart the actual expedition, including after the player edited camp settings.
    if (state && state.mission) { mission = state.mission.id; difficulty = state.difficulty || 1; gameMode = state.mode || 'story'; }
    if (!canStart(gameMode, mission, difficulty)) { toast('这项故事任务尚未解锁，请先完成前一项任务。'); return; }
    state = E.create({ mode: gameMode, players: isCoop ? 2 : 1, loadout: selectedWeapon(), seed: newSeed(), mission, difficulty });
    if (state.players.p2) state.players.p2.weapon = remoteWeapon;
    runId = newRunId(); finished = ''; paused = false; disconnected = false; accumulator = 0;
    remoteInput = {}; remoteAt = 0; remoteSeq = -1; clearInput(); resetSounds();
    closeDialogs(); $('start-screen').hidden = true; $('end-screen').hidden = true; displayPause();
    if (isCoop && !net.send({ type: 'start', state: E.snapshot(state, true), runId })) {
      pause(true, false); toast('开局消息尚未送达，请稍后点“重新出发”。');
    }
    startTutorial(); enableAudio(); canvas.focus(); hud();
  }
  function beginPractice() {
    shutdownNet(); mode = 'solo';
    state = E.create({ practice: true, mode: 'story', players: 1, loadout: 'blade', seed: newSeed(), mission: 'ember', difficulty: 1 });
    runId = newRunId(); finished = ''; paused = false; disconnected = false; accumulator = 0;
    remoteInput = {}; remoteAt = 0; remoteSeq = -1; clearInput(); resetSounds();
    closeDialogs(); $('start-screen').hidden = true; $('end-screen').hidden = true; displayPause();
    startTutorial(); enableAudio(); canvas.focus(); hud();
  }
  function settle() {
    if (!state || state.status === 'playing' || finished === runId) return;
    finished = runId; clearInput(); paused = false; $('pause-screen').hidden = true; $('tutorial-panel').hidden = true;
    if (state.practice) {
      $('end-title').textContent = state.status === 'won' ? '接住了，轮到你出手' : '再听一遍它的节奏';
      $('end-copy').textContent = state.status === 'won' ? `击败试炼守卫 · 用时 ${Math.floor(state.elapsed)} 秒` : '下一次，你已经知道它会怎样出招。';
      $('end-reward').hidden = true;
      $('end-goal').textContent = '招架试炼';
      $('end-unlocks').textContent = '可以立即重试，或回营地继续探险。';
      $('end-badges').textContent = '';
      $('end-restart').disabled = false; $('end-restart').textContent = '再试一轮 ↗';
      $('end-screen').hidden = false;
      return;
    }
    $('end-reward').hidden = false;
    if (storageOK) camp = readCamp();
    const result = C.applyResult(camp, state, runId);
    camp = result.profile;
    if (!result.duplicate) writeCamp();
    const reward = result.reward;
    const won = state.status === 'won';
    const mission = missionInfo(state.mission && state.mission.id);
    const random = state.mode === 'random';
    $('end-title').textContent = won ? `${random ? '迷雾远征' : mission.name} · 探险完成` : '这次，走到这里';
    $('end-copy').textContent = won ? `击败 ${state.stats.kills} 名守卫 · 用时 ${Math.floor(state.elapsed / 60)} 分 ${Math.floor(state.elapsed % 60)} 秒${state.secretCleared ? ' · 找到了隐藏星藏' : ''}` : '探险暂时告一段落。营地的灯火仍在等你。';
    $('end-reward').textContent = won ? `+ ${reward} 星屑 · 营地现有 ${camp.coins}` : `本局未带回星屑 · 营地仍有 ${camp.coins}`;
    $('end-goal').textContent = random ? `探索 ${state.rooms.filter(room => room.visited).length} / ${state.rooms.length} 间 · 遗物 ${state.runBuffs.length} 件` : `营灯 ${C.progress(camp).lit} / 3 · ${won ? mission.goal : state.objective}`;
    $('end-unlocks').textContent = random ? (won ? '下一次出发，地图与精英位置将重新生成。' : '本次发现的遗物已记入图鉴。') : result.unlocks.length ? result.unlocks.join(' · ') : (won ? '可以返回营地选择下一项任务，或挑战更好的成绩。' : '这次发现的遗物已记入图鉴，重新准备后再来。');
    $('end-badges').textContent = result.newBadges.length ? '获得徽章：' + result.newBadges.map(id => (C.BADGES.find(badge => badge.id === id) || { name: id }).name).join('、') : '';
    if (!random && won && C.progress(camp).nextMission) { $('mission-select').value = C.progress(camp).nextMission; showMission(); }
    $('end-restart').disabled = mode === 'guest';
    $('end-restart').textContent = mode === 'guest' ? '等待房主重新出发' : '再探一次 ↗';
    $('end-screen').hidden = false;
  }
  function safeInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const num = (n, min, max, fallback) => Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
    return { mx: num(raw.mx, -1, 1, 0), my: num(raw.my, -1, 1, 0),
      aimX: num(raw.aimX, 0, 960, 480), aimY: num(raw.aimY, 0, 600, 300),
      shoot: raw.shoot === true, dash: raw.dash === true, guard: raw.guard === true, guardPulse: raw.guardPulse === true, interact: raw.interact === true };
  }
  function validState(s) {
    if (!s || s.version !== 1 || s.combatVersion !== 1 || s.practice !== false || !['random', 'story'].includes(s.mode) || !['playing', 'won', 'lost'].includes(s.status) || !s.room || !Number.isInteger(s.room.index) || s.room.index < 0 || !s.stats || !Number.isFinite(s.elapsed)) return false;
    if (!s.players || !s.players.p1 || !s.players.p2 || Object.keys(s.players).length !== 2) return false;
    if (!s.mission || !C.MISSIONS.some(m => m.id === s.mission.id) || ![1, 2].includes(s.difficulty) || !Array.isArray(s.runBuffs) || s.runBuffs.length > 3) return false;
    const limits = { enemies: 100, bullets: 500, props: 80, particles: 200, walls: 100, doors: 30, portals: 30, fires: 30, switches: 30, pickups: 80, events: 40, combatEvents: 24, rooms: 16, interactables: 30 };
    for (const [key, cap] of Object.entries(limits)) if (!Array.isArray(s[key]) || s[key].length > cap) return false;
    const bounded = (n, max) => Number.isFinite(n) && n >= 0 && n <= max;
    for (const p of Object.values(s.players)) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.hp) || !Number.isFinite(p.maxHp)) return false;
      if (!['blade', 'pistol', 'scatter'].includes(p.weapon) || typeof p.guarding !== 'boolean' || !bounded(p.guardWindow, 2) || !bounded(p.counterTime, 10) || !bounded(p.meleeTime, 2) || ![null, undefined, '', 'parry', 'mikiri', 'dodge'].includes(p.counterKind)) return false;
    }
    for (const enemy of s.enemies) {
      if (!enemy || !bounded(enemy.stagger, 10) || !bounded(enemy.posture, 1000) || !bounded(enemy.maxPosture, 1000)) return false;
      if (enemy.rhythm != null) {
        const attack = enemy.rhythm;
        if (!['combo', 'thrust', 'sweep', 'quake'].includes(attack.type) || !['windup', 'active', 'recover'].includes(attack.phase) || !bounded(attack.remaining, 10) || !bounded(attack.duration, 10) || !Number.isInteger(attack.beat) || !Number.isInteger(attack.beats) || attack.beat < 0 || attack.beat > attack.beats || attack.beats < 1 || attack.beats > 8 || !Number.isFinite(attack.angle) || Math.abs(attack.angle) > Math.PI * 4 || !bounded(attack.range, 1600) || !bounded(attack.arc, Math.PI * 2)) return false;
      }
    }
    for (const event of s.combatEvents) {
      if (!event || !['rhythm-windup', 'rhythm-beat', 'perfect-parry', 'perfect-dodge', 'mikiri', 'counterattack', 'guard-break'].includes(event.type) || typeof event.id !== 'string' && !Number.isSafeInteger(event.id) || typeof event.id === 'string' && event.id.length > 100 || !bounded(event.time, 86400) || !Number.isFinite(event.x) || !Number.isFinite(event.y)) return false;
      if (event.duration != null && !bounded(event.duration, 10)) return false;
    }
    if (s.room.index >= s.rooms.length || s.rooms.length < 2) return false;
    if (s.mode === 'story' && (s.rooms.length !== 7 || s.room.index > 6)) return false;
    if (s.mode === 'random') {
      const map = s.exploration;
      if (s.mission.id !== 'ember' || !Number.isInteger(s.bossIndex) || s.bossIndex < 1 || s.bossIndex >= s.rooms.length || !map) return false;
      if (!['kills', 'target', 'totalEnemies'].every(key => Number.isSafeInteger(map[key]) && map[key] >= 0) || map.target < 1 || map.target > map.totalEnemies || map.kills > map.totalEnemies + 1) return false;
      if (!['bossAwake', 'bossSpawned', 'bossDefeated'].every(key => typeof map[key] === 'boolean')) return false;
      for (let index = 0; index < s.rooms.length; index++) {
        const room = s.rooms[index];
        if (!room || room.index !== index || !Number.isInteger(room.gx) || !Number.isInteger(room.gy) || Math.abs(room.gx) > 16 || Math.abs(room.gy) > 16 || typeof room.visited !== 'boolean' || typeof room.discovered !== 'boolean' || !Array.isArray(room.neighbors) || room.neighbors.length > 4 || new Set(room.neighbors).size !== room.neighbors.length) return false;
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
        const input = safeInput(msg.input); if (input) { remoteInput = input; remoteSeq = msg.seq; remoteAt = performance.now(); }
      } else if (msg.type === 'loadout') remoteWeapon = ['blade', 'scatter'].includes(msg.weapon) ? msg.weapon : 'pistol';
    } else if (msg.type === 'start' && typeof msg.runId === 'string' && msg.runId.length < 100 && validState(msg.state)) {
      mode = 'guest'; state = msg.state; runId = msg.runId; finished = ''; paused = false; disconnected = false;
      clearInput(); resetSounds(); closeDialogs(); $('start-screen').hidden = true; $('end-screen').hidden = true;
      startTutorial(); displayPause(); canvas.focus(); hud();
    } else if (msg.type === 'state' && msg.runId === runId && validState(msg.state)) {
      state = msg.state; settle();
    }
    if (msg.type === 'pause' && typeof msg.paused === 'boolean') {
      pause(msg.paused, false);
      if (net.role === 'host') net.send({ type: 'pause', paused: msg.paused, reason: 'partner' });
    }
    if (msg.type === 'lobby' && net.role === 'guest' && ['random', 'story'].includes(msg.mode) && [1, 2].includes(msg.difficulty) && C.MISSIONS.some(m => m.id === msg.mission)) {
      $('room-message').textContent = `队长选择：${msg.mode === 'random' ? '随机探险' : missionInfo(msg.mission).name}${msg.difficulty === 2 ? ' · 险境' : ' · 普通'}，等待出发。`;
    }
  }
  function disconnectedPeer() {
    if (!state) { shutdownNet(); $('room-message').textContent = '伙伴已离开，可以重新创建或加入房间。'; return; }
    if (mode === 'host') {
      E.removePlayer(state, 'p2'); shutdownNet(); mode = 'solo';
      toast('搭档已断线，你可以继续独自探险。');
    } else if (mode === 'guest') {
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
        $('start-room').disabled = instance.role !== 'host';
        $('start-room').textContent = instance.role === 'host' ? '一起出发 →' : '等待房主出发';
        $('room-message').textContent = instance.role === 'host' ? '搭档已到齐，可以一起出发。' : '已加入，等待房主开始探险。';
        if (instance.role === 'guest') instance.send({ type: 'loadout', weapon: selectedWeapon() });
        else instance.send({ type: 'lobby', mode: selectedGameMode(), mission: selectedMission(), difficulty: selectedDifficulty() });
      }, onMessage: receive,
      onDisconnect() { if (net === instance) disconnectedPeer(); }
    });
    net = instance; return instance;
  }
  $('solo-start').onclick = () => begin(false);
  $('practice-start').onclick = beginPractice;
  $('mode-select').addEventListener('change', updateCamp);
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
  $('leave-room').onclick = () => { shutdownNet(); $('room-message').textContent = '已离开房间。'; };
  $('close-coop').onclick = () => { $('coop-dialog').close(); if (!state) shutdownNet(); };
  $('coop-dialog').addEventListener('cancel', () => { if (!state) shutdownNet(); });
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
  };
  $('pause-game').onclick = () => pause(!paused);
  $('resume-game').onclick = () => pause(false);
  $('restart-game').onclick = $('end-restart').onclick = () => { if (mode !== 'guest') { if (state && state.practice) beginPractice(); else begin(mode === 'host'); } };
  $('back-camp').onclick = $('end-camp').onclick = home;
  $('mute-game').onclick = () => { muted = !muted; if (muted) stopSounds(); enableAudio(); $('mute-game').setAttribute('aria-pressed', String(muted)); $('mute-game').textContent = muted ? '×♪' : '♪'; };
  function input() {
    const p = state && state.players[localId()];
    let mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + touch.mx;
    let my = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + touch.my;
    const length = Math.hypot(mx, my); if (length > 1) { mx /= length; my /= length; }
    let aimX = mouse.x, aimY = mouse.y;
    if (p && (!mouse.active || touch.shoot || keys.has('KeyJ'))) {
      const nearest = state.enemies.reduce((best, enemy) => !best || Math.hypot(enemy.x - p.x, enemy.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? enemy : best, null);
      aimX = nearest ? nearest.x : p.x + Math.cos(p.facing || 0) * 100;
      aimY = nearest ? nearest.y : p.y + Math.sin(p.facing || 0) * 100;
    }
    return { mx, my, aimX, aimY, shoot: mouse.down || touch.shoot || keys.has('KeyJ'), dash: dashPulse || keys.has('Space') || touch.dash, guard: mouse.guard || touch.guard || keys.has('KeyK'), guardPulse, interact: interactPulse || keys.has('KeyE') || touch.interact };
  }
  const controlKeys = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyE','KeyJ','KeyK']);
  window.addEventListener('keydown', event => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (event.code === 'Escape' && !hasDialog()) { event.preventDefault(); if (!event.repeat) pause(!paused); return; }
    if (playing() && !paused && !hasDialog() && controlKeys.has(event.code)) {
      event.preventDefault(); keys.add(event.code);
      if (!event.repeat && event.code === 'Space') dashPulse = true;
      if (!event.repeat && event.code === 'KeyE') interactPulse = true;
      if (!event.repeat && event.code === 'KeyK') guardPulse = true;
    }
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
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
  window.addEventListener('blur', () => { clearInput(); if (playing() && !paused) pause(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (playing() && !paused) pause(true); } });
  let joystickId = null;
  const joystick = $('joystick');
  function moveStick(event) {
    const bounds = joystick.getBoundingClientRect(), radius = bounds.width * .32;
    const x = event.clientX - bounds.left - bounds.width / 2, y = event.clientY - bounds.top - bounds.height / 2;
    const length = Math.hypot(x, y), factor = Math.min(1, radius / (length || 1));
    touch.mx = x * factor / radius; touch.my = y * factor / radius;
    $('joystick-stick').style.transform = `translate(${x * factor}px,${y * factor}px)`;
  }
  joystick.addEventListener('pointerdown', event => { if (!playing() || paused || hasDialog()) return; event.preventDefault(); joystickId = event.pointerId; joystick.setPointerCapture(event.pointerId); moveStick(event); });
  joystick.addEventListener('pointermove', event => { if (event.pointerId === joystickId) moveStick(event); });
  function releaseStick(event) { if (event.pointerId === joystickId) { joystickId = null; touch.mx = touch.my = 0; $('joystick-stick').style.transform = 'translate(0px,0px)'; } }
  joystick.addEventListener('pointerup', releaseStick); joystick.addEventListener('pointercancel', releaseStick);
  for (const action of ['shoot', 'dash', 'guard', 'interact']) {
    const button = $('touch-' + action);
    button.addEventListener('pointerdown', event => { if (!playing() || paused || hasDialog()) return; event.preventDefault(); enableAudio(); button.setPointerCapture(event.pointerId); touch[action] = true; if (action === 'dash') dashPulse = true; if (action === 'guard') guardPulse = true; if (action === 'interact') interactPulse = true; });
    button.addEventListener('pointerup', () => { touch[action] = false; });
    button.addEventListener('pointercancel', () => { touch[action] = false; if (action === 'guard') guardPulse = false; });
  }
  function hud() {
    const p = state && state.players[localId()];
    const random = state && state.mode === 'random';
    $('game-wrap').setAttribute('data-mode', state ? state.mode : selectedGameMode());
    $('game-wrap').setAttribute('data-practice', String(!!(state && state.practice)));
    if (tutorialPending && state && state.room.index !== 0) dismissTutorial();
    $('tutorial-panel').hidden = !tutorialPending || !playing() || paused || hasDialog();
    $('hud-stage').textContent = state ? state.room.name : '苔灯营地';
    $('hud-objective').textContent = state ? state.objective : '独自探险，或邀请一位搭档';
    $('hud-objective').hidden = !!random;
    $('hud-health').textContent = p ? `${p.downed ? '倒地' : '♥'.repeat(Math.max(0, Math.ceil(p.hp)))} ${Math.max(0, p.hp)} / ${p.maxHp}` : '6 / 6';
    $('hud-dash').textContent = p && p.dashCd > 0 ? `闪避 ${p.dashCd.toFixed(1)}s` : '闪避就绪';
    $('hud-loot').textContent = `${camp.coins} 星屑`;
    $('hud-team').textContent = state && state.practice ? '招架试炼' : state && Object.keys(state.players).length === 2 ? (mode === 'guest' ? '双人 · 搭档' : '双人 · 队长') : '独自探险';
    const buffs = { pierce: '穿透棱镜', swift: '疾风羽饰', vigor: '生命苔石' };
    $('route-progress').textContent = state && state.mission ? `${random ? (state.difficulty === 2 ? '险境' : '') : missionInfo(state.mission.id).name + ' · ' + state.mission.progress + ' / ' + state.mission.total}${state.runBuffs.length ? (random && state.difficulty !== 2 ? '' : ' · ') + state.runBuffs.map(id => buffs[id] || '').filter(Boolean).join(' / ') : ''}` : '';
    $('route-progress').hidden = !!(state && state.practice) || !$('route-progress').textContent;
    const hint = state && !paused && !finished ? (E.getHint ? E.getHint(state, localId()) : state.hint) : '';
    $('interaction-hint').textContent = hint || ''; $('interaction-hint').hidden = !hint;
    $('touch-controls').hidden = !playing() || paused || hasDialog();
  }
  function frame(now) {
    const delta = last ? Math.min((now - last) / 1000, .1) : 0; last = now;
    if (playing() && !paused && !hasDialog() && !(state.practice && tutorialPending)) {
      if (mode === 'guest') {
        if (net && net.connected && now - lastSend >= 30) {
          if (net.send({ type: 'input', input: input(), seq: ++seq })) { dashPulse = guardPulse = interactPulse = false; lastSend = now; }
        }
      } else {
        accumulator += delta;
        while (accumulator >= 1 / 60 && state.status === 'playing') {
          const commands = { p1: input() };
          if (mode === 'host') commands.p2 = now - remoteAt < 600 ? remoteInput : {};
          E.step(state, commands, 1 / 60); soundEvents();
          // A received tap is consumed once, while held guard remains available to later steps.
          remoteInput.guardPulse = false;
          dashPulse = guardPulse = interactPulse = false; accumulator -= 1 / 60;
        }
      }
    } else accumulator = 0;
    soundEvents();
    if (mode === 'host' && net && net.connected && state && now - lastSend >= 50) {
      net.send({ type: 'state', state: E.snapshot(state, true), runId }); lastSend = now;
    }
    settle();
    try { if (state) R.draw(ctx, state, { localId: localId(), now, paused: paused || hasDialog() || !!(state.practice && tutorialPending) }); else R.preview(ctx, C.progress(camp)); }
    catch (error) { if (!frame.errorReported) { frame.errorReported = true; console.error(error); toast('画面绘制遇到问题，请刷新页面重试。'); } }
    if (now - lastHud > 100) { hud(); lastHud = now; }
    requestAnimationFrame(frame);
  }
  window.addEventListener('storage', event => { if (!account && event.key === STORE) { camp = readCamp(); updateCamp(); } });
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
      onStatus() { if (account) updateCamp(); }
    });
    account.init().catch(() => { toast('暂时连不上账号服务，本机存档仍保留。'); });
  } else {
    $('open-account').onclick = () => { $('account-message').textContent = '账号服务未加载，请刷新后再试。'; openDialog('account-dialog'); };
    $('close-account').onclick = () => $('account-dialog').close();
  }
  updateCamp(); hud(); requestAnimationFrame(frame);
})();
