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
  let tutorialPending = false, remoteTutorialPending = false, rhythmTutorial = false, relayTutorial = false, huntTutorial = false;
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
      if (age > .25 || paused || remoteTutorialPending || hasDialog()) continue;
      if (event.type === 'rhythm-windup') {
        const remaining = Math.max(0, Math.min(3, event.duration || .8) - age);
        if (remaining < .07) continue;
        tone(event.attack === 'thrust' ? 230 : 150, Math.min(.35, remaining), .018, 'triangle', 0, 390);
      } else if (event.type === 'rhythm-beat') {
        tone(65, .13, .035, 'triangle', 0, 35);
      } else if (['perfect-parry', 'mikiri', 'perfect-dodge', 'fireball-reflected'].includes(event.type)) {
        tone(event.type === 'mikiri' ? 1040 : 1460, .11, .045, 'triangle', 0, 780);
        tone(2180, .055, .022, 'sine', .025);
      } else if (event.type === 'counterattack') {
        tone(330, .17, .035, 'triangle', 0, 100);
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
      } else if (event.type === 'shoot' && performance.now() - soundLast > 170) {
        tone(180 + Math.random() * 70, 0.035, 0.007, 'triangle'); soundLast = performance.now();
      } else if (event.type === 'player-hit') tone(92, 0.13, 0.04, 'sawtooth');
      else if (event.type === 'dash') tone(420, 0.075, 0.02);
      else if (event.type === 'explosion') tone(55, 0.22, 0.05, 'sawtooth');
      else if (['room-clear', 'revive', 'relic-selected', 'cache-searched', 'wave-clear'].includes(event.type)) tone(680, 0.18, 0.03);
      else if (event.type === 'boss-awakened') tone(240, 0.55, 0.045, 'triangle');
    }
    if (paused || remoteTutorialPending || hasDialog()) return;
    const local = state.players && state.players[localId()];
    if (local && !local.downed) for (const ball of state.bullets || []) {
      if (ball.friendly || !ball.reflectable || ball.dead) continue;
      const dx = local.x - ball.x, dy = local.y - ball.y, speed = Math.hypot(ball.vx, ball.vy);
      if (!speed) continue;
      const along = (dx * ball.vx + dy * ball.vy) / speed;
      const side = Math.abs(dx * ball.vy - dy * ball.vx) / speed;
      const arrival = (along - local.r - ball.r) / speed;
      const cue = 'fireball-cue:' + ball.id;
      if (arrival > 0 && arrival <= .28 && side < local.r + ball.r + 9 && !heardEvents.has(cue)) {
        heardEvents.add(cue); tone(1180, .06, .028, 'sine');
      }
    }
    // Read the live windup, so a staggered or defeated attacker leaves no scheduled warning behind.
    for (const enemy of state.enemies || []) {
      const attack = enemy.rhythm;
      if (!attack || attack.type === 'fireball' || attack.phase !== 'windup' || attack.remaining <= 0 || attack.remaining > .30 || enemy.stagger > 0 || enemy.hp <= 0) continue;
      const windup = [...(state.combatEvents || [])].reverse().find(event => event.type === 'rhythm-windup' && event.enemyId === enemy.id && event.attack === attack.type && event.beat === attack.beat);
      if (!windup) continue;
      const cueId = 'cue:' + windup.id;
      if (heardEvents.has(cueId)) continue;
      heardEvents.add(cueId);
      tone(attack.type === 'sweep' ? 790 : 1180, .075, .04, 'triangle');
    }
  }
  function selectedWeapon() { return $('start-loadout').value === 'blade' ? 'blade' : camp.scatter && $('start-loadout').value === 'scatter' ? 'scatter' : 'pistol'; }
  function missionInfo(id) { return C.MISSIONS.find(mission => mission.id === id) || C.MISSIONS[0]; }
  function selectedGameMode() { return ['story', 'relay', 'hunt'].includes($('mode-select').value) ? $('mode-select').value : 'random'; }
  function selectedMission() { return selectedGameMode() === 'random' ? 'ember' : ['relay', 'hunt'].includes(selectedGameMode()) ? 'salvage' : missionInfo($('mission-select').value).id; }
  function selectedDifficulty() { return !['relay', 'hunt'].includes(selectedGameMode()) && $('difficulty-select').value === '2' ? 2 : 1; }
  function canStart(gameMode, mission, difficulty) { return gameMode !== 'story' || C.canPlay(camp, mission, difficulty); }
  function tutorialStore() { return rhythmTutorial ? RHYTHM_TUTORIAL_STORE : relayTutorial ? RELAY_TUTORIAL_STORE : huntTutorial ? HUNT_TUTORIAL_STORE : TUTORIAL_STORE; }
  function startTutorial() {
    rhythmTutorial = !!(state && state.practice);
    relayTutorial = !!(state && state.mode === 'relay');
    huntTutorial = !!(state && state.mode === 'hunt');
    try { tutorialPending = localStorage.getItem(tutorialStore()) !== '1'; } catch (_) { tutorialPending = true; }
    $('tutorial-title').textContent = rhythmTutorial ? '先接住一刀，再练连续招架' : relayTutorial ? '把炉芯，接力带回家' : '先试试手，再走进遗迹';
    $('tutorial-controls-desktop').textContent = rhythmTutorial ? 'K / 右键防守 · 空格闪避 · J / 左键反击' : relayTutorial ? 'E 拾取 / 投掷 · 鼠标瞄准 · K / 右键接住 · WASD 移动' : 'WASD 移动 · J / 左键攻击 · K / 右键防守 · 空格闪避 · E 互动';
    $('tutorial-controls-touch').textContent = rhythmTutorial ? '圈快合拢时点盾牌；防守会自动面向来招。' : relayTutorial ? '互动键拾取 / 投掷，摇杆决定投掷方向，盾牌键接住。' : '左侧摇杆移动，右侧按钮攻击、防守、闪避和互动。';
    $('tutorial-detail').textContent = rhythmTutorial ? '看到两圈快合拢或听到清脆提示时，按 K / 右键；会自动面向来招。先练连斩，熟悉后再加入突刺和横扫。' : relayTutorial ? '取走炉芯后，回程会出现追兵。带回入口撤离台，按 E 交付。按住防守可稳接，临近时按下可精准接住、短暂加速；单人也能先扔出再追过去。' : '房间自由进出；击杀唤醒守卫，精英掉落遗物。';
    if (huntTutorial) {
      $('tutorial-title').textContent = '这一次，猎物也在找你';
      $('tutorial-controls-desktop').textContent = 'WASD 移动 · 按住 K / 右键轻步 · J 攻击 · E 互动 · 空格闪避';
      $('tutorial-controls-touch').textContent = '按住盾牌键轻步，互动键搬起或投出炸药桶。';
      $('tutorial-detail').textContent = '循足迹和邻室脚步追踪游荡猎兽。枪声、闪避与爆炸会引来它；提前摆好炸药桶，或轻步绕路。找到机会击败它，即可完成狩猎。';
    }
    $('tutorial-dismiss').textContent = rhythmTutorial ? '准备好了，迎战 →' : '知道了，出发 →';
    $('tutorial-panel').hidden = !tutorialPending;
    if ((relayTutorial || huntTutorial) && net && net.connected) net.send({ type: 'pause', reason: 'tutorial', runId, paused: tutorialPending });
  }
  function dismissTutorial() {
    tutorialPending = false; $('tutorial-panel').hidden = true;
    try { localStorage.setItem(tutorialStore(), '1'); } catch (_) { /* Tutorial is optional. */ }
    if ((relayTutorial || huntTutorial) && net && net.connected) net.send({ type: 'pause', reason: 'tutorial', runId, paused: false });
    clearInput(); if (playing()) { enableAudio(); canvas.focus(); }
  }
  function escapeHTML(value) { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
  function showMission() {
    const gameMode = selectedGameMode(), random = gameMode === 'random', relay = gameMode === 'relay', hunt = gameMode === 'hunt';
    const mission = missionInfo(selectedMission()), completion = camp.missions[mission.id];
    $('story-mission-field').hidden = gameMode !== 'story';
    $('game-wrap').setAttribute('data-mode', state ? state.mode : gameMode);
    $('mission-name').textContent = random ? '迷雾远征' : relay ? '接力夺宝 · 试玩' : hunt ? '苔火猎场 · 试玩' : mission.name;
    $('mission-description').textContent = random ? '三种精英守着遗物，旧水闸与升降台仍在运转。绕路做准备，或直接深入炉心。' : relay ? '炉芯藏在遗迹深处。抱着它穿过追兵，也可以抛给搭档，接住那一拍。' : hunt ? '猎兽在六间遗迹中游荡。循足迹追踪，以声音引诱，选择自己的伏击地点。' : mission.description;
    $('mission-goal').textContent = random ? '探索遗迹，击杀守卫唤醒深处的 Boss。' : relay ? '把炉芯带回入口撤离台，按 E 交付。' : hunt ? '追踪并击败游荡猎兽。' : mission.goal;
    $('mission-reward').textContent = `带回 ${relay ? 24 : hunt ? 32 : mission.reward + (selectedDifficulty() === 2 ? 20 : 0)} 星屑`;
    const unlocked = canStart(gameMode, mission.id, selectedDifficulty());
    $('mission-lock').textContent = random ? '3 种精英 · 2 种事件 · 6 件遗物' : relay ? '3 间遗迹 · 单人 / 双人 · 自由穿行' : hunt ? '6 间猎场 · 足迹追踪 · 声音诱敌' : unlocked ? (completion.clears ? `已完成 ${completion.clears} 次${completion.hardClears ? ` · 险境 ${completion.hardClears} 次` : ''}` : '首次完成，点亮一盏营灯') : '先完成前一项任务，三盏营灯点亮后可挑战险境。';
    $('mission-lock').hidden = false;
    $('solo-start').disabled = !unlocked;
    if (!state && net && net.connected && net.role === 'host') net.send({ type: 'lobby', mode: gameMode, mission: mission.id, difficulty: selectedDifficulty() });
  }
  function updateCamp() {
    const option = $('start-loadout').querySelector('option[value="scatter"]');
    option.disabled = !camp.scatter; option.textContent = camp.scatter ? '散射枪' : '散射枪 · 待解锁';
    const progress = C.progress(camp);
    const random = selectedGameMode() === 'random', relay = selectedGameMode() === 'relay', hunt = selectedGameMode() === 'hunt';
    $('campaign-status').textContent = random || relay || hunt ? `星屑 ${camp.coins} · 归来 ${camp.wins} 次${relay ? ' · 接力夺宝试玩' : hunt ? ' · 苔火猎场试玩' : ` · 遗物图鉴 ${progress.relicCount} / ${progress.relicTotal}`}` : `营灯 ${progress.lit} / 3 · 星屑 ${camp.coins} · ${progress.allCleared ? '险境任务已开启' : '完成任务，点亮营地的三盏灯'}`;
    $('mission-progress').textContent = random ? '每局一张新地图' : relay ? '取回炉芯，原路撤离' : hunt ? '追踪、诱敌、伏击' : `营灯 ${progress.lit} / 3${progress.allCleared ? ` · 险境 ${progress.hardLit} / 3` : ''}`;
    $('camp-copy').textContent = `营地三盏灯已点亮 ${progress.lit} 盏。${progress.allCleared ? '所有任务已完成，可挑战险境和收集遗物。' : '完成三个不同的任务，让营地重新亮起来。'}现有 ${camp.coins} 星屑。${account ? account.status : storageOK ? '进度保存在当前浏览器。' : '浏览器未允许保存，刷新后进度可能丢失。'}`;
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
    if (!C.canPlay(camp, selectedMission(), 1)) $('mission-select').value = 'ember';
    const hard = $('difficulty-select').querySelector('option[value="2"]');
    $('difficulty-select').disabled = relay || hunt;
    hard.disabled = relay || hunt || !random && !progress.allCleared;
    hard.textContent = random || progress.allCleared ? '险境 · 更多危险与奖励' : '险境 · 三盏营灯后开启';
    if (relay || hunt || !random && !progress.allCleared) $('difficulty-select').value = '1';
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
    remoteTutorialPending = false;
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
    remoteTutorialPending = isCoop && ['relay', 'hunt'].includes(state.mode);
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
      const parries = Math.max(0, Math.floor(state.practiceParries || 0));
      $('end-title').textContent = state.status === 'won' ? '接住了，轮到你出手' : parries ? `这一轮接住了 ${parries} 次` : '先听提示，接住第一刀';
      $('end-copy').textContent = `本轮招架 ${parries} 次 · 用时 ${Math.floor(state.elapsed)} 秒${state.status === 'won' ? ' · 击败试炼守卫' : ''}`;
      $('end-reward').hidden = true;
      $('end-goal').textContent = '招架试炼';
      $('end-unlocks').textContent = parries ? '已经接住了它的攻击，下一轮试着连起来。' : '下一轮可以先不攻击，看到圈快合拢或听到提示就按防守。';
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
    const random = state.mode === 'random', relay = state.mode === 'relay', hunt = state.mode === 'hunt';
    $('end-title').textContent = hunt ? won ? '猎场归来，巨兽倒下了' : '这次，猎物先找到了你' : won ? relay ? '炉芯已安全送达' : `${random ? '迷雾远征' : mission.name} · 探险完成` : relay ? '炉芯还在等下一次归途' : '这次，走到这里';
    $('end-copy').textContent = hunt ? `探索 ${state.rooms.filter(room => room.visited).length} / ${state.rooms.length} 间 · 诱敌 ${state.hunt.lures} 次 · 击败 ${state.stats.kills} 名敌人 · 用时 ${Math.floor(state.elapsed)} 秒` : relay ? `投掷 ${state.relay.throws} 次 · 接住 ${state.relay.catches} 次 · 精准接住 ${state.relay.perfectCatches} 次 · 用时 ${Math.floor(state.elapsed)} 秒` : won ? `击败 ${state.stats.kills} 名守卫 · 用时 ${Math.floor(state.elapsed / 60)} 分 ${Math.floor(state.elapsed % 60)} 秒${state.secretCleared ? ' · 找到了隐藏星藏' : ''}` : '探险暂时告一段落。营地的灯火仍在等你。';
    $('end-reward').textContent = won ? `+ ${reward} 星屑 · 营地现有 ${camp.coins}` : `本局未带回星屑 · 营地仍有 ${camp.coins}`;
    $('end-goal').textContent = hunt ? won ? '苔火猎场 · 狩猎完成' : '苔火猎场 · 狩猎未完成' : relay ? won ? '接力夺宝 · 撤离成功' : '接力夺宝 · 撤离未完成' : random ? `探索 ${state.rooms.filter(room => room.visited).length} / ${state.rooms.length} 间 · 遗物 ${state.runBuffs.length} 件` : `营灯 ${C.progress(camp).lit} / 3 · ${won ? mission.goal : state.objective}`;
    $('end-unlocks').textContent = hunt ? won ? '下一次，可以换个地方设伏，或与搭档一人诱敌、一人截击。' : '猎兽会追随声响。换条路，先为下一次交手做好准备。' : relay ? won ? '下次试试换个位置传球，或与搭档轮流掩护。' : '可以先放下炉芯迎敌，再拾取继续撤离。' : random ? (won ? '下一次出发，地图与精英位置将重新生成。' : '本次发现的遗物已记入图鉴。') : result.unlocks.length ? result.unlocks.join(' · ') : (won ? '可以返回营地选择下一项任务，或挑战更好的成绩。' : '这次发现的遗物已记入图鉴，重新准备后再来。');
    $('end-badges').textContent = result.newBadges.length ? '获得徽章：' + result.newBadges.map(id => (C.BADGES.find(badge => badge.id === id) || { name: id }).name).join('、') : '';
    if (state.mode === 'story' && won && C.progress(camp).nextMission) { $('mission-select').value = C.progress(camp).nextMission; showMission(); }
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
    if (!s || s.version !== 1 || s.combatVersion !== 1 || s.contentVersion !== 1 || s.practice !== false || !['random', 'story', 'relay', 'hunt'].includes(s.mode) || !['playing', 'won', 'lost'].includes(s.status) || !s.room || !Number.isInteger(s.room.index) || s.room.index < 0 || !s.stats || !Number.isFinite(s.elapsed)) return false;
    if (!s.players || !s.players.p1 || !s.players.p2 || Object.keys(s.players).length !== 2) return false;
    if (!s.mission || !C.MISSIONS.some(m => m.id === s.mission.id) || ![1, 2].includes(s.difficulty) || !Array.isArray(s.runBuffs) || s.runBuffs.length > 6 || new Set(s.runBuffs).size !== s.runBuffs.length || s.runBuffs.some(id => !C.RELICS.includes(id))) return false;
    const limits = { enemies: 100, bullets: 500, props: 80, particles: 200, walls: 100, doors: 30, portals: 30, fires: 30, switches: 30, pickups: 80, events: 40, combatEvents: 24, rooms: 16, interactables: 30, decoys: 8 };
    for (const [key, cap] of Object.entries(limits)) if (!Array.isArray(s[key]) || s[key].length > cap || s[key].some(entry => !entry || typeof entry !== 'object' || Array.isArray(entry))) return false;
    const bounded = (n, max) => Number.isFinite(n) && n >= 0 && n <= max;
    for (const p of Object.values(s.players)) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.hp) || !Number.isFinite(p.maxHp)) return false;
      if (!['blade', 'pistol', 'scatter'].includes(p.weapon) || typeof p.guarding !== 'boolean' || !bounded(p.guardWindow, 2) || !bounded(p.counterTime, 10) || !bounded(p.meleeTime, 2) || ![null, undefined, '', 'parry', 'mikiri', 'dodge'].includes(p.counterKind)) return false;
      if (p.ward != null && (!Number.isInteger(p.ward) || !bounded(p.ward, 1))) return false;
      if (p.relayBoost != null && !bounded(p.relayBoost, 3)) return false;
    }
    for (const enemy of s.enemies) {
      if (!enemy || !bounded(enemy.stagger, 10) || !bounded(enemy.posture, 1000) || !bounded(enemy.maxPosture, 1000)) return false;
      if (enemy.rhythm != null) {
        const attack = enemy.rhythm;
        if (!['combo', 'thrust', 'sweep', 'quake', 'rush', 'fireball'].includes(attack.type) || !['windup', 'active', 'recover'].includes(attack.phase) || !bounded(attack.remaining, 10) || !bounded(attack.duration, 10) || !Number.isInteger(attack.beat) || !Number.isInteger(attack.beats) || attack.beat < 0 || attack.beat > attack.beats || attack.beats < 1 || attack.beats > 8 || !Number.isFinite(attack.angle) || Math.abs(attack.angle) > Math.PI * 4 || !bounded(attack.range, 1600) || !bounded(attack.arc, Math.PI * 2)) return false;
      }
    }
    for (const event of s.combatEvents) {
      if (!event || !['rhythm-windup', 'rhythm-beat', 'perfect-parry', 'perfect-dodge', 'mikiri', 'counterattack', 'guard-break', 'fireball-reflected', 'boss-phase', 'event-start', 'event-complete', 'supply-collected', 'decoy', 'core-throw', 'core-catch', 'core-deliver', 'core-knock', 'hunt-arrival', 'hunt-lured', 'hunt-defeated'].includes(event.type) || typeof event.id !== 'string' && !Number.isSafeInteger(event.id) || typeof event.id === 'string' && event.id.length > 100 || !bounded(event.time, 86400) || !Number.isFinite(event.x) || !Number.isFinite(event.y)) return false;
      if (event.duration != null && !bounded(event.duration, 10)) return false;
      if (event.type === 'core-catch' && typeof event.perfect !== 'boolean') return false;
    }
    if (s.roomEvent != null && (!['sluice', 'lift'].includes(s.roomEvent.kind) || !['ready', 'active', 'complete'].includes(s.roomEvent.stage) || !Array.isArray(s.roomEvent.enemyIds) || s.roomEvent.enemyIds.length > 8 || s.roomEvent.enemyIds.some(id => typeof id !== 'string' || id.length > 100))) return false;
    for (const d of s.decoys) if (!d || typeof d.id !== 'string' || !['p1', 'p2'].includes(d.playerId || d.owner) || !bounded(d.x, 960) || !bounded(d.y, 600) || !bounded(d.ttl, 5)) return false;
    if (s.room.index >= s.rooms.length || s.rooms.length < 2) return false;
    if (s.mode === 'story' && (s.rooms.length !== 7 || s.room.index > 6)) return false;
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
    if (s.mode === 'random' || s.mode === 'relay' || s.mode === 'hunt') {
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
        const input = safeInput(msg.input); if (input) { remoteInput = input; remoteSeq = msg.seq; remoteAt = performance.now(); }
      } else if (msg.type === 'loadout') remoteWeapon = ['blade', 'scatter'].includes(msg.weapon) ? msg.weapon : 'pistol';
    } else if (msg.type === 'start' && typeof msg.runId === 'string' && msg.runId.length < 100 && validState(msg.state)) {
      mode = 'guest'; state = msg.state; runId = msg.runId; finished = ''; paused = false; disconnected = false;
      remoteTutorialPending = ['relay', 'hunt'].includes(state.mode);
      clearInput(); resetSounds(); closeDialogs(); $('start-screen').hidden = true; $('end-screen').hidden = true;
      startTutorial(); displayPause(); canvas.focus(); hud();
    } else if (msg.type === 'state' && msg.runId === runId && validState(msg.state)) {
      state = msg.state; settle();
    }
    if (msg.type === 'pause' && msg.reason === 'tutorial') {
      if (msg.runId === runId && playing() && ['relay', 'hunt'].includes(state.mode) && typeof msg.paused === 'boolean') {
        remoteTutorialPending = msg.paused;
        if (remoteTutorialPending) { clearInput(); stopSounds(); }
      }
    } else if (msg.type === 'pause' && typeof msg.paused === 'boolean') {
      pause(msg.paused, false);
      if (net.role === 'host') net.send({ type: 'pause', paused: msg.paused, reason: 'partner' });
    }
    if (msg.type === 'lobby' && net.role === 'guest' && ['random', 'story', 'relay', 'hunt'].includes(msg.mode) && [1, 2].includes(msg.difficulty) && C.MISSIONS.some(m => m.id === msg.mission) && (!['relay', 'hunt'].includes(msg.mode) || msg.mission === 'salvage' && msg.difficulty === 1)) {
      $('room-message').textContent = `队长选择：${msg.mode === 'random' ? '随机探险' : msg.mode === 'relay' ? '接力夺宝 · 试玩' : msg.mode === 'hunt' ? '苔火猎场 · 试玩' : missionInfo(msg.mission).name}${msg.difficulty === 2 ? ' · 险境' : ' · 普通'}，等待出发。`;
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
  joystick.addEventListener('pointerdown', event => { if (!playing() || paused || hasDialog()) return; event.preventDefault(); mouse.active = false; joystickId = event.pointerId; joystick.setPointerCapture(event.pointerId); moveStick(event); });
  joystick.addEventListener('pointermove', event => { if (event.pointerId === joystickId) moveStick(event); });
  function releaseStick(event) { if (event.pointerId === joystickId) { joystickId = null; touch.mx = touch.my = 0; $('joystick-stick').style.transform = 'translate(0px,0px)'; } }
  joystick.addEventListener('pointerup', releaseStick); joystick.addEventListener('pointercancel', releaseStick);
  for (const action of ['shoot', 'dash', 'guard', 'interact']) {
    const button = $('touch-' + action);
    button.addEventListener('pointerdown', event => { if (!playing() || paused || hasDialog()) return; event.preventDefault(); mouse.active = false; enableAudio(); button.setPointerCapture(event.pointerId); touch[action] = true; if (action === 'dash') dashPulse = true; if (action === 'guard') guardPulse = true; if (action === 'interact') interactPulse = true; });
    button.addEventListener('pointerup', () => { touch[action] = false; });
    button.addEventListener('pointercancel', () => { touch[action] = false; if (action === 'guard') guardPulse = false; });
  }
  function hud() {
    const p = state && state.players[localId()];
    const random = state && state.mode === 'random';
    const relay = state && state.mode === 'relay';
    const hunt = state && state.mode === 'hunt';
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
    $('hud-objective').hidden = !!random;
    $('hud-health').textContent = p ? `${p.downed ? '倒地' : '♥'.repeat(Math.max(0, Math.ceil(p.hp)))} ${Math.max(0, p.hp)} / ${p.maxHp}${p.ward ? ' ◈' : ''}` : '6 / 6';
    $('hud-dash').textContent = p && p.relayBoost > 0 ? `接力加速 ${p.relayBoost.toFixed(1)}s` : p && p.dashCd > 0 ? `闪避 ${p.dashCd.toFixed(1)}s` : '闪避就绪';
    $('hud-loot').textContent = `${camp.coins} 星屑`;
    $('hud-team').textContent = state && state.practice ? '招架试炼' : state && Object.keys(state.players).length === 2 ? (mode === 'guest' ? '双人 · 搭档' : '双人 · 队长') : '独自探险';
    const buffs = Object.fromEntries(Object.entries(E.BUFFS).map(([id, buff]) => [id, buff.label]));
    $('route-progress').textContent = hunt ? `苔火猎场 · 诱敌 ${state.hunt.lures} 次${p && p.guarding && p.moving ? ' · 轻步中' : ''}` : relay ? '撤离台 ← 断桥庭院 ← 炉芯密库' : state && state.mission ? `${random ? (state.difficulty === 2 ? '险境' : '') : missionInfo(state.mission.id).name + ' · ' + state.mission.progress + ' / ' + state.mission.total}${state.runBuffs.length ? (random && state.difficulty !== 2 ? '' : ' · ') + state.runBuffs.map(id => buffs[id] || '').filter(Boolean).join(' / ') : ''}` : '';
    $('route-progress').hidden = !!(state && state.practice) || !$('route-progress').textContent;
    const hint = state && !paused && !finished ? (E.getHint ? E.getHint(state, localId()) : state.hint) : '';
    $('interaction-hint').textContent = hint || ''; $('interaction-hint').hidden = !hint;
    $('touch-controls').hidden = !playing() || paused || hasDialog();
    $('touch-interact').textContent = relay && p && p.carry === state.relay.coreId ? state.room.index === state.relay.extractionRoom && Math.hypot(p.x - 120, p.y - 300) < 76 ? '交' : '掷' : 'E';
    $('touch-interact').setAttribute('aria-label', relay ? '拾取、投掷或交付炉芯' : '互动');
    $('touch-guard').setAttribute('aria-label', hunt ? '按住轻步或防守招架' : relay ? '接住炉芯或防守招架' : '防守与招架');
  }
  function frame(now) {
    const delta = last ? Math.min((now - last) / 1000, .1) : 0; last = now;
    if (playing() && !paused && !remoteTutorialPending && !hasDialog() && !((state.practice || relayTutorial || huntTutorial) && tutorialPending)) {
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
    try { if (state) R.draw(ctx, state, { localId: localId(), now, paused: paused || remoteTutorialPending || hasDialog() || !!((state.practice || relayTutorial || huntTutorial) && tutorialPending), reducedMotion: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) }); else R.preview(ctx, C.progress(camp)); }
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
