(function () {
  'use strict';
  const E = window.AdventureEngine, R = window.AdventureRenderer, C = window.AdventureCampaign;
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const STORE = 'ruins-squad-camp-v2', LEGACY_STORE = 'ruins-squad-camp-v1';
  let camp, storageOK = true, state = null, mode = 'solo', net = null;
  let paused = false, disconnected = false, runId = '', finished = '', remoteWeapon = 'pistol';
  let remoteInput = {}, remoteAt = 0, remoteSeq = -1, seq = 0, lastSend = 0;
  let last = 0, accumulator = 0, lastHud = 0, toastTimer, dialogPaused = false;
  let muted = false, audio = null, soundLast = 0;
  const keys = new Set(), mouse = { x: 650, y: 300, down: false, active: false };
  const touch = { mx: 0, my: 0, shoot: false, dash: false, interact: false };
  let dashPulse = false, interactPulse = false;
  const blank = () => C.normalize(null);
  function readCamp() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || localStorage.getItem(LEGACY_STORE) || 'null');
      return C.normalize(raw);
    } catch (_) { storageOK = false; return camp || blank(); }
  }
  function writeCamp() {
    try { localStorage.setItem(STORE, JSON.stringify(camp)); }
    catch (_) { storageOK = false; toast('浏览器未允许保存，营地进度暂存在本次页面中。'); }
    updateCamp();
  }
  camp = readCamp();
  const localId = () => mode === 'guest' ? 'p2' : 'p1';
  const playing = () => !!state && state.status === 'playing';
  const hasDialog = () => ['help-dialog', 'camp-dialog', 'coop-dialog'].some(id => $(id).open);
  function toast(message) {
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3800);
  }
  function clearInput() {
    keys.clear(); mouse.down = false; touch.mx = touch.my = 0;
    touch.shoot = touch.dash = touch.interact = false; dashPulse = interactPulse = false;
    $('joystick-stick').style.transform = 'translate(0px,0px)';
    remoteInput = {};
  }
  function tone(frequency, duration, volume, type) {
    if (muted || !audio || audio.state !== 'running') return;
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = type || 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume || 0.025, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
    oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.start(); oscillator.stop(audio.currentTime + duration);
  }
  function enableAudio() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
    } catch (_) { /* Sound is optional. */ }
  }
  function soundEvents() {
    if (!state || mode === 'guest') return;
    for (const event of state.events || []) {
      if (event.type === 'shoot' && performance.now() - soundLast > 70) {
        tone(180 + Math.random() * 70, 0.045, 0.018, 'triangle'); soundLast = performance.now();
      } else if (event.type === 'player-hit') tone(92, 0.13, 0.04, 'sawtooth');
      else if (event.type === 'dash') tone(420, 0.075, 0.02);
      else if (event.type === 'explosion') tone(55, 0.22, 0.05, 'sawtooth');
      else if (['room-clear', 'revive', 'relic-selected', 'cache-searched', 'wave-clear'].includes(event.type)) tone(680, 0.18, 0.03);
    }
  }
  function selectedWeapon() { return camp.scatter && $('start-loadout').value === 'scatter' ? 'scatter' : 'pistol'; }
  function missionInfo(id) { return C.MISSIONS.find(mission => mission.id === id) || C.MISSIONS[0]; }
  function selectedMission() { return missionInfo($('mission-select').value).id; }
  function selectedDifficulty() { return $('difficulty-select').value === '2' ? 2 : 1; }
  function escapeHTML(value) { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
  function showMission() {
    const mission = missionInfo(selectedMission()), completion = camp.missions[mission.id];
    $('mission-name').textContent = mission.name;
    $('mission-description').textContent = mission.description;
    $('mission-goal').textContent = mission.goal;
    $('mission-reward').textContent = `带回 ${mission.reward + (selectedDifficulty() === 2 ? 20 : 0)} 星屑`;
    const unlocked = C.canPlay(camp, mission.id, selectedDifficulty());
    $('mission-lock').textContent = unlocked ? (completion.clears ? `已完成 ${completion.clears} 次${completion.hardClears ? ` · 险境 ${completion.hardClears} 次` : ''}` : '首次完成，点亮一盏营灯') : '先完成前一项任务，三盏营灯点亮后可挑战险境。';
    $('mission-lock').hidden = false;
    $('solo-start').disabled = !unlocked;
    if (!state && net && net.connected && net.role === 'host') net.send({ type: 'lobby', mission: mission.id, difficulty: selectedDifficulty() });
  }
  function updateCamp() {
    const option = $('start-loadout').querySelector('option[value="scatter"]');
    option.disabled = !camp.scatter; option.textContent = camp.scatter ? '散射枪' : '散射枪 · 待解锁';
    const progress = C.progress(camp);
    $('campaign-status').textContent = `营灯 ${progress.lit} / 3 · 星屑 ${camp.coins} · ${progress.allCleared ? '险境任务已开启' : '完成任务，点亮营地的三盏灯'}`;
    $('mission-progress').textContent = `营灯 ${progress.lit} / 3${progress.allCleared ? ` · 险境 ${progress.hardLit} / 3` : ''}`;
    $('camp-copy').textContent = `营地三盏灯已点亮 ${progress.lit} 盏。${progress.allCleared ? '所有任务已完成，可挑战险境和收集遗物。' : '完成三个不同的任务，让营地重新亮起来。'}现有 ${camp.coins} 星屑。${storageOK ? '进度保存在当前浏览器。' : '浏览器未允许保存，刷新后进度可能丢失。'}`;
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
    hard.disabled = !progress.allCleared;
    hard.textContent = progress.allCleared ? '险境 · 更多危险与奖励' : '险境 · 三盏营灯后开启';
    if (!progress.allCleared) $('difficulty-select').value = '1';
    $('unlock-scatter').disabled = camp.scatter || camp.coins < 30;
    $('unlock-scatter').textContent = camp.scatter ? '已解锁 · 出发前可选择' : `30 星屑解锁${camp.coins < 30 ? ' · 通关一局即可' : ''}`;
    showMission();
  }
  function closeDialogs() {
    ['help-dialog', 'camp-dialog', 'coop-dialog'].forEach(id => { if ($(id).open) $(id).close(); });
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
    paused = value; clearInput(); displayPause();
    if (announce !== false && net && net.connected) net.send({ type: 'pause', paused, reason: 'manual' });
  }
  function openDialog(id) {
    clearInput(); dialogPaused = playing() && !paused;
    if (dialogPaused) pause(true);
    if (!$(id).open) $(id).showModal();
  }
  ['help-dialog', 'camp-dialog'].forEach(id => {
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
    finished = ''; runId = ''; clearInput(); closeDialogs();
    $('start-screen').hidden = false; $('pause-screen').hidden = true; $('end-screen').hidden = true;
    $('interaction-hint').hidden = true; updateCamp(); hud();
  }
  function newRunId() {
    return window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  function begin(isCoop) {
    if (isCoop && (!net || !net.connected || net.role !== 'host')) return;
    if (!isCoop) shutdownNet();
    mode = isCoop ? 'host' : 'solo';
    let mission = selectedMission(), difficulty = selectedDifficulty();
    // Restart the actual expedition, including after the player edited camp settings.
    if (state && state.mission) { mission = state.mission.id; difficulty = state.difficulty || 1; }
    if (!C.canPlay(camp, mission, difficulty)) { toast('这项任务尚未解锁，请先完成前一项任务。'); return; }
    state = E.create({ players: isCoop ? 2 : 1, loadout: selectedWeapon(), seed: Date.now() >>> 0, mission, difficulty });
    if (state.players.p2) state.players.p2.weapon = remoteWeapon;
    runId = newRunId(); finished = ''; paused = false; disconnected = false; accumulator = 0;
    remoteInput = {}; remoteAt = 0; remoteSeq = -1; clearInput();
    closeDialogs(); $('start-screen').hidden = true; $('end-screen').hidden = true; displayPause();
    if (isCoop && !net.send({ type: 'start', state: E.snapshot(state, true), runId })) {
      pause(true, false); toast('开局消息尚未送达，请稍后点“重新出发”。');
    }
    enableAudio(); canvas.focus(); hud();
  }
  function settle() {
    if (!state || state.status === 'playing' || finished === runId) return;
    finished = runId; clearInput(); paused = false; $('pause-screen').hidden = true;
    if (storageOK) camp = readCamp();
    const result = C.applyResult(camp, state, runId);
    camp = result.profile;
    if (!result.duplicate) writeCamp();
    const reward = result.reward;
    const won = state.status === 'won';
    const mission = missionInfo(state.mission && state.mission.id);
    $('end-title').textContent = won ? `${mission.name} · 任务完成` : '这次，走到这里';
    $('end-copy').textContent = won ? `击败 ${state.stats.kills} 名守卫 · 用时 ${Math.floor(state.elapsed / 60)} 分 ${Math.floor(state.elapsed % 60)} 秒${state.secretCleared ? ' · 找到了隐藏星藏' : ''}` : '倒下也没关系。利用木箱挡弹，看到红色预警就闪避，再试一次。';
    $('end-reward').textContent = won ? `+ ${reward} 星屑 · 营地现有 ${camp.coins}` : `本局未带回星屑 · 营地仍有 ${camp.coins}`;
    $('end-goal').textContent = `营灯 ${C.progress(camp).lit} / 3 · ${won ? mission.goal : state.objective}`;
    $('end-unlocks').textContent = result.unlocks.length ? result.unlocks.join(' · ') : (won ? '可以返回营地选择下一项任务，或挑战更好的成绩。' : '这次发现的遗物已记入图鉴，重新准备后再来。');
    $('end-badges').textContent = result.newBadges.length ? '获得徽章：' + result.newBadges.map(id => (C.BADGES.find(badge => badge.id === id) || { name: id }).name).join('、') : '';
    if (won && C.progress(camp).nextMission) { $('mission-select').value = C.progress(camp).nextMission; showMission(); }
    $('end-restart').disabled = mode === 'guest';
    $('end-restart').textContent = mode === 'guest' ? '等待房主重新出发' : '再探一次 ↗';
    $('end-screen').hidden = false;
  }
  function safeInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const num = (n, min, max, fallback) => Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
    return { mx: num(raw.mx, -1, 1, 0), my: num(raw.my, -1, 1, 0),
      aimX: num(raw.aimX, 0, 960, 480), aimY: num(raw.aimY, 0, 600, 300),
      shoot: raw.shoot === true, dash: raw.dash === true, interact: raw.interact === true };
  }
  function validState(s) {
    if (!s || s.version !== 1 || !['playing', 'won', 'lost'].includes(s.status) || !s.room || !Number.isInteger(s.room.index) || s.room.index < 0 || s.room.index > 6 || !s.stats || !Number.isFinite(s.elapsed)) return false;
    if (!s.players || !s.players.p1 || !s.players.p2 || Object.keys(s.players).length !== 2) return false;
    if (!s.mission || !C.MISSIONS.some(m => m.id === s.mission.id) || ![1, 2].includes(s.difficulty) || !Array.isArray(s.runBuffs) || s.runBuffs.length > 3) return false;
    const limits = { enemies: 100, bullets: 500, props: 80, particles: 200, walls: 100, doors: 30, portals: 30, fires: 30, switches: 30, pickups: 80, events: 40, rooms: 7, interactables: 30 };
    for (const [key, cap] of Object.entries(limits)) if (!Array.isArray(s[key]) || s[key].length > cap) return false;
    for (const p of Object.values(s.players)) if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.hp) || !Number.isFinite(p.maxHp)) return false;
    return true;
  }
  function receive(msg) {
    if (!net || !msg || typeof msg !== 'object') return;
    if (net.role === 'host') {
      if (msg.type === 'input' && Number.isSafeInteger(msg.seq) && msg.seq > remoteSeq) {
        const input = safeInput(msg.input); if (input) { remoteInput = input; remoteSeq = msg.seq; remoteAt = performance.now(); }
      } else if (msg.type === 'loadout') remoteWeapon = msg.weapon === 'scatter' ? 'scatter' : 'pistol';
    } else if (msg.type === 'start' && typeof msg.runId === 'string' && msg.runId.length < 100 && validState(msg.state)) {
      mode = 'guest'; state = msg.state; runId = msg.runId; finished = ''; paused = false; disconnected = false;
      clearInput(); closeDialogs(); $('start-screen').hidden = true; $('end-screen').hidden = true;
      displayPause(); canvas.focus(); hud();
    } else if (msg.type === 'state' && msg.runId === runId && validState(msg.state)) {
      state = msg.state; settle();
    }
    if (msg.type === 'pause' && typeof msg.paused === 'boolean') {
      pause(msg.paused, false);
      if (net.role === 'host') net.send({ type: 'pause', paused: msg.paused, reason: 'partner' });
    }
    if (msg.type === 'lobby' && net.role === 'guest' && C.MISSIONS.some(m => m.id === msg.mission)) {
      $('room-message').textContent = `队长选择：${missionInfo(msg.mission).name}${msg.difficulty === 2 ? ' · 险境' : ' · 普通'}，等待出发。`;
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
        else instance.send({ type: 'lobby', mission: selectedMission(), difficulty: selectedDifficulty() });
      }, onMessage: receive,
      onDisconnect() { if (net === instance) disconnectedPeer(); }
    });
    net = instance; return instance;
  }
  $('solo-start').onclick = () => begin(false);
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
  $('restart-game').onclick = $('end-restart').onclick = () => { if (mode !== 'guest') begin(mode === 'host'); };
  $('back-camp').onclick = $('end-camp').onclick = home;
  $('mute-game').onclick = () => { muted = !muted; enableAudio(); $('mute-game').setAttribute('aria-pressed', String(muted)); $('mute-game').textContent = muted ? '×♪' : '♪'; };
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
    return { mx, my, aimX, aimY, shoot: mouse.down || touch.shoot || keys.has('KeyJ'), dash: dashPulse || keys.has('Space') || touch.dash, interact: interactPulse || keys.has('KeyE') || touch.interact };
  }
  const controlKeys = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyE','KeyJ']);
  window.addEventListener('keydown', event => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (event.code === 'Escape' && !hasDialog()) { event.preventDefault(); if (!event.repeat) pause(!paused); return; }
    if (playing() && !hasDialog() && controlKeys.has(event.code)) {
      event.preventDefault(); keys.add(event.code);
      if (!event.repeat && event.code === 'Space') dashPulse = true;
      if (!event.repeat && event.code === 'KeyE') interactPulse = true;
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
  canvas.addEventListener('pointerdown', event => { if (event.button === 0 && event.pointerType !== 'touch') { pointerAim(event); mouse.down = true; canvas.focus(); } });
  window.addEventListener('pointerup', () => { mouse.down = false; });
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
  joystick.addEventListener('pointerdown', event => { event.preventDefault(); joystickId = event.pointerId; joystick.setPointerCapture(event.pointerId); moveStick(event); });
  joystick.addEventListener('pointermove', event => { if (event.pointerId === joystickId) moveStick(event); });
  function releaseStick(event) { if (event.pointerId === joystickId) { joystickId = null; touch.mx = touch.my = 0; $('joystick-stick').style.transform = 'translate(0px,0px)'; } }
  joystick.addEventListener('pointerup', releaseStick); joystick.addEventListener('pointercancel', releaseStick);
  for (const action of ['shoot', 'dash', 'interact']) {
    const button = $('touch-' + action);
    button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); touch[action] = true; if (action === 'dash') dashPulse = true; if (action === 'interact') interactPulse = true; });
    for (const name of ['pointerup', 'pointercancel']) button.addEventListener(name, () => { touch[action] = false; });
  }
  function hud() {
    const p = state && state.players[localId()];
    $('hud-stage').textContent = state ? state.room.name : '苔灯营地';
    $('hud-objective').textContent = state ? state.objective : '独自探险，或邀请一位搭档';
    $('hud-health').textContent = p ? `${p.downed ? '倒地' : '♥'.repeat(Math.max(0, Math.ceil(p.hp)))} ${Math.max(0, p.hp)} / ${p.maxHp}` : '6 / 6';
    $('hud-dash').textContent = p && p.dashCd > 0 ? `闪避 ${p.dashCd.toFixed(1)}s` : '闪避就绪';
    $('hud-loot').textContent = `${camp.coins} 星屑`;
    $('hud-team').textContent = state && Object.keys(state.players).length === 2 ? (mode === 'guest' ? '双人 · 搭档' : '双人 · 队长') : '独自探险';
    const buffs = { pierce: '穿透棱镜', swift: '疾风羽饰', vigor: '生命苔石' };
    $('route-progress').textContent = state && state.mission ? `${missionInfo(state.mission.id).name} · ${state.difficulty === 2 ? '险境' : '普通'} · ${state.mission.progress} / ${state.mission.total}${state.runBuffs.length ? ' · ' + state.runBuffs.map(id => buffs[id] || '').filter(Boolean).join(' / ') : ''}` : '完成三个任务，点亮三盏营灯';
    const hint = state && !paused && !finished ? (E.getHint ? E.getHint(state, localId()) : state.hint) : '';
    $('interaction-hint').textContent = hint || ''; $('interaction-hint').hidden = !hint;
    $('touch-controls').hidden = !playing() || paused || hasDialog();
  }
  function frame(now) {
    const delta = last ? Math.min((now - last) / 1000, .1) : 0; last = now;
    if (playing() && !paused && !hasDialog()) {
      if (mode === 'guest') {
        if (net && net.connected && now - lastSend >= 30) {
          if (net.send({ type: 'input', input: input(), seq: ++seq })) { dashPulse = interactPulse = false; lastSend = now; }
        }
      } else {
        accumulator += delta;
        while (accumulator >= 1 / 60 && state.status === 'playing') {
          const commands = { p1: input() };
          if (mode === 'host') commands.p2 = now - remoteAt < 600 ? remoteInput : {};
          E.step(state, commands, 1 / 60); soundEvents();
          dashPulse = interactPulse = false; accumulator -= 1 / 60;
        }
      }
    } else accumulator = 0;
    if (mode === 'host' && net && net.connected && state && now - lastSend >= 50) {
      net.send({ type: 'state', state: E.snapshot(state, true), runId }); lastSend = now;
    }
    settle();
    try { if (state) R.draw(ctx, state, { localId: localId(), now }); else R.preview(ctx, C.progress(camp)); }
    catch (error) { if (!frame.errorReported) { frame.errorReported = true; console.error(error); toast('画面绘制遇到问题，请刷新页面重试。'); } }
    if (now - lastHud > 100) { hud(); lastHud = now; }
    requestAnimationFrame(frame);
  }
  window.addEventListener('storage', event => { if (event.key === STORE) { camp = readCamp(); updateCamp(); } });
  updateCamp(); hud(); requestAnimationFrame(frame);
})();
