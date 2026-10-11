(function () {
  'use strict';
  const G = window.IdleGame;
  const SAVE_KEY = 'xianxiu-save-v1';
  const LEASE_KEY = 'xianxiu-session-v1';
  const sessionId = window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random();
  const $ = (id) => document.getElementById(id);
  const n = (value) => Math.floor(value || 0).toLocaleString('zh-CN');
  const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sec = (ms) => (ms / 1000).toFixed(1) + ' 秒';
  const time = (ms) => {
    const minutes = Math.floor(ms / 60000);
    return minutes >= 60 ? Math.floor(minutes / 60) + ' 小时 ' + minutes % 60 + ' 分钟' : minutes ? minutes + ' 分钟' : Math.floor(ms / 1000) + ' 秒';
  };
  const actionById = Object.fromEntries(G.ACTIONS.map((a) => [a.id, a]));
  let state, view = 'cultivation', owner = false, storageOK = true, quarantined = false;
  let lastTick = Date.now(), lastSave = 0, lastLease = 0, pendingImport = null, toastTimer;
  let initialSummary = null;
  const views = {
    cultivation: { place: '清修洞府', tag: '引气入体，踏上仙途', title: '一息一念，皆是修行。', note: '打坐积累修为，满足条件后手动突破境界。', cards: '选择修炼功法', number: '01' },
    woodcutting: { place: '青竹药谷', tag: '灵草生于山野', title: '采天地灵气，入一炉丹香。', note: '采集灵草与朱果，供炼丹与炼器使用。', cards: '选择采药地点', number: '02' },
    mining: { place: '玄石矿脉', tag: '一矿一炼，铸就法器', title: '山中藏矿，器中藏锋。', note: '采矿获得原矿，再去炼器熔炼成锭。', cards: '选择开采矿脉', number: '03' },
    fishing: { place: '灵泉药圃', tag: '汲取灵露，涵养灵植', title: '一滴清露，温养灵根。', note: '收集灵露与灵泉，准备炼丹所需的辅材。', cards: '选择灵植采集', number: '04' },
    smithing: { place: '铸器阁', tag: '以灵材锻器，以法器护身', title: '淬火千锤，法器初成。', note: '制作完成后，在储物袋中穿戴法器。', cards: '选择炼器配方', number: '05' },
    cooking: { place: '丹房', tag: '丹火不息，药香常在', title: '灵草入炉，丹成护身。', note: '回血丹药会在历练气血偏低时自动消耗。', cards: '选择炼丹配方', number: '06' },
    combat: { place: '山外秘境', tag: '历练磨砺，斩妖除魔', title: '携剑入山，问道于险。', note: '自动迎战同一种妖兽，获得灵石与战利品。', cards: '选择历练目标', number: '07' },
    bag: { place: '储物袋', description: '灵材、丹药和法器，都在这里。出售多余物品换取灵石。', cards: '随身物品' },
    shop: { place: '仙坊', description: '用灵石购买修行工具和丹药，让下一段修行更顺利。', cards: '仙坊货品' }
  };

  function readStorage(key) {
    try { return localStorage.getItem(key); }
    catch (_) { storageOK = false; return null; }
  }
  function lease() {
    try { return JSON.parse(readStorage(LEASE_KEY)) || null; } catch (_) { return null; }
  }
  function acquire(force) {
    const old = lease(), now = Date.now();
    if (!force && old && old.id !== sessionId && old.expires > now) return false;
    try { localStorage.setItem(LEASE_KEY, JSON.stringify({ id: sessionId, expires: now + 45000 })); }
    catch (_) { storageOK = false; }
    lastLease = now;
    return !storageOK || lease()?.id === sessionId;
  }
  function renew() {
    if (!storageOK) return true;
    const current = lease();
    if (current && current.id !== sessionId && current.expires > Date.now()) {
      owner = false;
      loadSpectator();
      return false;
    }
    if (!current || current.id !== sessionId) {
      let summary = null;
      try {
        const loaded = readSaved(true);
        state = loaded.state; summary = loaded.summary;
      } catch (_) {
        quarantined = true; storageOK = false;
        showToast('最新存档无法读取，当前进度请导出备份。');
      }
      lastTick = Date.now();
      try { localStorage.setItem(LEASE_KEY, JSON.stringify({ id: sessionId, expires: lastTick + 45000 })); lastLease = lastTick; }
      catch (_) { storageOK = false; }
      render();
      if (document.visibilityState === 'visible') showOffline(summary);
      return true;
    }
    if (Date.now() - lastLease > 10000) {
      try { localStorage.setItem(LEASE_KEY, JSON.stringify({ id: sessionId, expires: Date.now() + 45000 })); lastLease = Date.now(); }
      catch (_) { storageOK = false; }
    }
    return true;
  }
  function readSaved(offline) {
    const raw = readStorage(SAVE_KEY);
    if (!raw) return G.hydrate(null, Date.now());
    const parsed = JSON.parse(raw);
    return G.hydrate(parsed, offline ? Date.now() : parsed.updatedAt);
  }
  owner = acquire(false);
  try {
    const loaded = readSaved(owner);
    state = loaded.state;
    initialSummary = owner ? loaded.summary : null;
  } catch (error) {
    const broken = readStorage(SAVE_KEY);
    let backedUp = false;
    try { if (broken) { localStorage.setItem(SAVE_KEY + '-backup-' + Date.now(), broken); backedUp = true; } }
    catch (_) { storageOK = false; quarantined = true; }
    state = G.fresh(Date.now());
    $('save-message').textContent = '原存档无法读取。' + (backedUp ? '已保留原数据备份。' : '原数据保持原样，新进度请导出备份。') + error.message;
    showToast(backedUp ? '存档无法读取，已保留原数据备份并开启新修行。' : '存档无法读取，新进度暂不自动保存，请导出备份。');
  }
  lastTick = Date.now();
  function loadSpectator() {
    try { state = readSaved(false).state; } catch (_) { /* Keep the last valid state. */ }
    lastTick = Date.now();
    render();
  }
  function showToast(message) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3800);
  }
  function persist() {
    if (!owner || !renew() || quarantined) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); storageOK = true; lastSave = Date.now(); }
    catch (_) { storageOK = false; }
    renderSaveStatus();
  }
  function tick(announce) {
    if (!owner || !renew()) { lastTick = Date.now(); return null; }
    const now = Date.now(), delta = Math.max(0, now - lastTick);
    lastTick = now;
    const summary = G.advance(state, delta);
    state.updatedAt = now;
    if (summary.actions || summary.stopped) render();
    else renderProgress();
    if (summary.stopped) showToast(summary.stopped);
    if (announce && delta > 30000) showOffline(summary);
    if (now - lastSave >= 5000) persist();
    return summary;
  }
  function mutate(fn) {
    if (!owner) return showToast('修行正在另一个标签页进行，请先接管存档。');
    tick(false);
    if (!owner) return;
    const result = fn();
    if (result?.reason) showToast(result.reason);
    persist();
    render();
  }
  function button(text, data, disabled, cls) {
    return '<button type="button" class="' + (cls || 'action-button') + '" ' + data + (disabled ? ' disabled' : '') + '>' + text + '</button>';
  }
  function itemsMarkup(items, requirements) {
    return Object.entries(items || {}).map(([id, qty]) => '<span class="' + (requirements ? 'material' + ((state.inventory[id] || 0) < qty ? ' missing' : '') : 'reward') + '">' + esc(G.ITEMS[id].icon) + ' ' + esc(G.ITEMS[id].name) + ' × ' + n(qty) + (requirements ? '<small>持有 ' + n(state.inventory[id]) + '</small>' : '') + '</span>').join('');
  }
  function renderSaveStatus() {
    $('save-status').textContent = !owner ? '此标签页查看存档' : !storageOK ? '无法自动保存，请导出备份' : '已自动保存 · ' + new Date(lastSave || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    $('save-dot').style.background = storageOK && owner ? '' : '#c49355';
  }
  function renderSession() {
    $('session-warning').hidden = owner;
    if (!owner) $('session-warning').innerHTML = '<span>修行正在另一个标签页进行。这里显示最近存档。</span>' + button('在这里继续修行', 'data-op="takeover"', false, 'secondary-button');
  }
  function renderNav() {
    $('skill-nav').innerHTML = Object.entries(G.SKILLS).map(([id, skill]) => '<button type="button" class="nav-button' + (view === id ? ' selected' : '') + '" data-view="' + id + '" data-key="nav-' + id + '"' + (view === id ? ' aria-current="page"' : '') + '><span class="nav-icon">' + skill.icon + '</span><span class="nav-name">' + skill.name + '</span><span class="nav-level">' + G.level(state.xp[id]) + '</span></button>').join('') + '<div class="nav-caption nav-separator">随身行囊</div>' + ['bag', 'shop'].map((id) => '<button type="button" class="nav-button' + (view === id ? ' selected' : '') + '" data-view="' + id + '" data-key="nav-' + id + '"' + (view === id ? ' aria-current="page"' : '') + '><span class="nav-icon">' + (id === 'bag' ? '▣' : '◈') + '</span><span class="nav-name">' + views[id].place + '</span><span class="nav-level">' + (id === 'bag' ? Object.keys(state.inventory).length : '↗') + '</span></button>').join('');
  }
  function scene() {
    return '<svg viewBox="0 0 400 210" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="295" cy="52" r="28" fill="#dfc78d" opacity=".78"/><path d="M0 148L76 56L125 112L196 33L258 112L311 79L400 144V210H0Z" fill="#769488" opacity=".55"/><path d="M0 172L54 137L127 164L206 91L282 160L338 118L400 174V210H0Z" fill="#416c5c"/><path d="M-10 168C83 145 140 175 216 157C274 143 315 168 412 151" stroke="#f5f0e2" stroke-width="12" opacity=".5"/><path d="M207 152H285V193H207Z" fill="#ddceae"/><path d="M198 153L245 126L295 153H198Z" fill="#244c40"/><path d="M218 170H234V193H218ZM248 166H268V180H248Z" fill="#244c40"/><path d="M0 195C122 176 208 200 400 189V210H0Z" fill="#234f42"/><path d="M89 169V119M67 143L89 109L111 143M69 128L89 96L109 128M320 193V155M301 172L320 139L339 172" stroke="#244c40" stroke-width="6" stroke-linejoin="round"/><path d="M159 191C198 188 221 200 235 210" stroke="#c4b58d" stroke-width="8"/></svg>';
  }
  function renderHeading() {
    const skill = G.SKILLS[view], info = views[view];
    $('breadcrumb').textContent = info.place;
    $('section-kicker').textContent = skill ? '修行技艺 / ' + info.number : '行囊与仙坊';
    $('section-title').textContent = skill ? skill.name : info.place;
    $('section-description').textContent = skill ? skill.description : info.description;
    $('section-level').hidden = !skill;
    $('skill-xp').hidden = !skill;
    $('region-banner').hidden = !skill;
    $('journey').hidden = !skill;
    $('cultivation-profile').hidden = view !== 'cultivation';
    $('cards-title').textContent = info.cards;
    $('cards-subtitle').textContent = view === 'bag' ? '出售材料或穿戴法器。' : view === 'shop' ? '工具升级购买一次，永久生效。' : '每次仅进行一项活动，切换后重新计时。';
    if (skill) {
      const xp = G.xpInfo(state.xp[view]);
      $('skill-level').textContent = xp.level;
      $('xp-label').textContent = xp.level === 50 ? '技艺已达圆满' : '距离 ' + (xp.level + 1) + ' 级';
      $('xp-number').textContent = xp.level === 50 ? '圆满' : n(xp.current) + ' / ' + n(xp.needed) + ' 经验';
      $('xp-fill').style.width = xp.percent + '%';
      document.querySelector('.region-tag').textContent = info.tag;
      document.querySelector('.region-copy h2').textContent = info.place;
      document.querySelector('.region-copy p').textContent = info.title;
      document.querySelector('.region-meta').innerHTML = '<span>● ' + (view === 'combat' ? '自动历练' : '持续修行') + '</span><span>离线结算上限 8 小时</span>';
      $('region-scene').innerHTML = scene();
    }
  }
  function renderJourney() {
    const goals = [
      { title: '引气入体', detail: '完成一次打坐', done: state.xp.cultivation > 0, view: 'cultivation' },
      { title: '初次突破', detail: '突破至炼气二层', done: state.realm > 0, view: 'cultivation' },
      { title: '法器护身', detail: '炼制并穿戴新法器', done: !!state.equipment.armor || !!state.equipment.weapon && state.equipment.weapon !== 'rusty_sword', view: 'smithing' },
      { title: '山外历练', detail: '击败一只妖兽', done: state.kills > 0, view: 'combat' }
    ];
    $('journey-count').textContent = goals.filter((g) => g.done).length + ' / 4';
    $('journey-steps').innerHTML = goals.map((g, i) => '<button type="button" class="journey-step' + (g.done ? ' done' : '') + '" data-view="' + g.view + '" data-key="journey-' + i + '"><span>' + (g.done ? '✓' : '0' + (i + 1)) + '</span><div><strong>' + g.title + '</strong><small>' + g.detail + '</small></div></button>').join('');
  }
  function renderRealm() {
    const r = G.realmInfo(state);
    $('realm-name').textContent = r.current.name;
    $('cultivation-number').textContent = n(state.cultivation);
    $('realm-next').textContent = r.next ? '下一境界 · ' + r.next.name + ' · ' + n(r.cost.cultivation) + ' 修为' : '境界已达化神';
    $('realm-fill').style.width = r.next ? r.percent + '%' : '100%';
    $('breakthrough').disabled = !owner || !r.canBreakthrough;
    $('breakthrough').textContent = r.next ? '突破境界' : '已至化神';
    $('breakthrough').title = r.reason || '消耗所需修为与材料，必定突破。';
    const cost = r.next ? '<div class="realm-cost"><span class="reward">✦ 修为 ' + n(r.cost.cultivation) + '</span>' + (r.cost.coins ? '<span class="reward">◈ 灵石 ' + n(r.cost.coins) + '</span>' : '') + itemsMarkup(r.cost.items) + '</div>' : '';
    const realmExpanded = $('cultivation-profile').querySelector('details')?.open;
    $('cultivation-profile').innerHTML = '<div class="section-row"><h2>境界 · ' + esc(r.current.name) + '</h2>' + button(r.next ? '突破境界' : '已至化神', 'data-op="breakthrough" data-key="main-breakthrough"', !owner || !r.canBreakthrough, 'primary-button') + '</div><p>已积累 ' + n(state.cultivation) + ' 修为。' + (r.next ? '下一境界：' + esc(r.next.name) + '，突破必定成功。' : '你已踏入化神境。') + '</p>' + cost + (r.next && !r.canBreakthrough ? '<p class="realm-hint">' + esc(r.reason) + '</p>' : '') + '<details' + (realmExpanded ? ' open' : '') + '><summary>查看境界进阶与加成</summary><div class="realm-grid">' + G.REALMS.map((realm, i) => '<span class="realm-step' + (i === r.index ? ' current' : i < r.index ? ' reached' : '') + '">' + (i < r.index ? '✓ ' : '') + esc(realm.name) + '</span>').join('') + '</div><div class="realm-bonuses"><span>境界攻击 +' + n(r.current.attack) + '</span><span>境界防御 +' + n(r.current.defense) + '</span><span>境界气血 +' + n(r.current.maxHp - 100) + '</span><span>修为收益 ×' + r.current.multiplier + '</span></div></details>';
  }
  function renderActions() {
    $('empty-state').hidden = true;
    $('cards').innerHTML = G.ACTIONS.filter((a) => a.skill === view).map((a) => {
      const active = state.active?.id === a.id, allowed = G.canStart(state, a.id), unlocked = G.level(state.xp[a.skill]) >= a.level;
      const rewards = a.kind === 'combat' ? '<span class="reward">◈ ' + n(a.enemy.coins) + ' 灵石 / 胜</span>' + itemsMarkup(a.enemy.loot) : (a.cultivation ? '<span class="reward">✦ +' + n(G.cultivationGain(state, a)) + ' 修为</span>' : '') + itemsMarkup(a.outputs);
      const icon = a.enemy ? a.enemy.icon : a.cultivation ? '☯' : G.ITEMS[Object.keys(a.outputs)[0]]?.icon || G.SKILLS[a.skill].icon;
      return '<article class="action-card' + (active ? ' active' : !unlocked ? ' locked' : '') + '"><div class="card-top"><span class="card-icon">' + icon + '</span><span class="card-level">' + (active ? '正在' + (a.kind === 'combat' ? '历练' : '修行') : '技艺 Lv.' + a.level) + '</span></div><h3>' + esc(a.name) + '</h3><p class="card-description">' + esc(a.description) + '</p><div class="card-rewards">' + rewards + '<span class="reward muted">+' + n(a.xp) + ' 经验' + (a.kind === 'combat' ? ' / 回合' : '') + '</span></div>' + (Object.keys(a.inputs).length ? '<div class="card-requirements"><small>每次消耗</small>' + itemsMarkup(a.inputs, true) + '</div>' : '') + (a.enemy ? '<div class="enemy-stats"><span>气血 ' + a.enemy.hp + '</span><span>攻击 ' + a.enemy.attack + '</span></div>' : '') + '<div class="card-footer"><span class="card-speed">◷ ' + sec(G.duration(state, a)) + (a.kind === 'combat' ? ' / 回合' : ' / 次') + '</span>' + button(active ? '暂停' : !unlocked ? a.level + ' 级解锁' : !allowed.ok ? '材料不足' : a.kind === 'combat' ? '开始历练' : '开始', 'data-op="action" data-id="' + a.id + '" data-key="action-' + a.id + '" title="' + esc(allowed.reason) + '"', !owner || !active && !allowed.ok, active ? 'secondary-button' : 'action-button') + '</div></article>';
    }).join('');
  }
  function itemType(item) { return item.slot ? '法器' : item.heal ? '丹药' : '灵材'; }
  function renderBag() {
    const entries = Object.entries(state.inventory).filter(([, qty]) => qty > 0);
    $('empty-state').hidden = !!entries.length;
    $('empty-state').textContent = '储物袋空空如也。先去采药或采矿吧。';
    $('cards').innerHTML = entries.map(([id, qty]) => {
      const item = G.ITEMS[id], equipped = Object.values(state.equipment).includes(id), available = qty - (equipped ? 1 : 0);
      return '<article class="action-card bag-card"><div class="card-top"><span class="card-icon">' + item.icon + '</span><span class="item-tag">' + (equipped ? '已穿戴' : itemType(item)) + '</span></div><h3>' + esc(item.name) + '<span class="item-quantity">× ' + n(qty) + '</span></h3><p class="card-description">' + (item.attack ? '攻击 +' + item.attack : item.defense ? '防御 +' + item.defense : item.heal ? '历练中自动使用，恢复 ' + item.heal + ' 气血。' : '用于制作、突破或出售。') + '</p><div class="shop-price">◈ ' + item.value + ' 灵石 / 件</div><div class="bag-actions">' + (item.slot ? button(equipped ? '已穿戴' : '穿戴', 'data-op="equip" data-id="' + id + '" data-key="equip-' + id + '"', !owner || equipped) : '') + button('卖 1 件', 'data-op="sell" data-id="' + id + '" data-qty="1" data-key="sell-' + id + '"', !owner || available < 1, 'secondary-button') + button('出售余量', 'data-op="sell" data-id="' + id + '" data-qty="all" data-key="sell-all-' + id + '"', !owner || available < 1, 'secondary-button') + '</div></article>';
    }).join('');
  }
  function renderShop() {
    $('empty-state').hidden = true;
    $('cards').innerHTML = G.SHOP.map((offer) => {
      const owned = offer.type === 'upgrade' && state.upgrades[offer.id];
      return '<article class="action-card shop-card"><div class="card-top"><span class="card-icon">' + offer.icon + '</span><span class="item-tag">' + (offer.type === 'upgrade' ? '永久升级' : '修行补给') + '</span></div><h3>' + esc(offer.name) + '</h3><p class="card-description">' + esc(offer.description) + '</p><div class="card-footer"><span class="shop-price">◈ ' + n(offer.cost) + ' 灵石</span>' + button(owned ? '已购入' : state.coins < offer.cost ? '灵石不足' : '购买', 'data-op="buy" data-id="' + offer.id + '" data-key="buy-' + offer.id + '"', !owner || owned || state.coins < offer.cost) + '</div></article>';
    }).join('');
  }
  function renderPlayer() {
    const stats = G.stats(state);
    $('coins').textContent = n(state.coins);
    $('hp-number').textContent = n(state.hp) + ' / ' + n(stats.maxHp);
    $('hp-fill').style.width = state.hp / stats.maxHp * 100 + '%';
    $('attack').textContent = stats.attack;
    $('defense').textContent = stats.defense;
    $('kills').textContent = n(state.kills);
    $('equipment').innerHTML = ['weapon', 'armor'].map((slot) => {
      const item = G.ITEMS[state.equipment[slot]];
      return '<button class="equipment-slot" type="button" data-view="bag"><span>' + (item ? item.icon : slot === 'weapon' ? '⚔' : '◇') + '</span><div><small>' + (slot === 'weapon' ? '法器' : '法袍') + '</small><strong>' + (item ? esc(item.name) : '尚未穿戴') + '</strong></div><span class="equipment-arrow">↗</span></button>';
    }).join('');
    $('food-count').textContent = n(Object.entries(state.inventory).reduce((sum, [id, qty]) => sum + (G.ITEMS[id].heal ? qty : 0), 0));
    $('event-log').innerHTML = state.log.slice().reverse().map((entry) => '<li>' + esc(entry) + '</li>').join('');
    $('game-tip').textContent = view === 'cultivation' ? '先打坐积累修为，约一分钟就能进行首次突破。突破按钮在上方境界卡片，后续境界还需准备丹药与灵石。' : view === 'combat' ? '开始历练前穿戴法器并备好丹药。气血偏低会自动服丹，丹药耗尽后受伤可能被击退。' : '采药和灵植提供丹药原料，采矿和炼器打造法器。背包里的多余物品可以出售换灵石。';
  }
  function renderProgress() {
    const a = state.active && actionById[state.active.id];
    $('stop-action').disabled = !a || !owner;
    $('activity-status').textContent = !owner ? '在其他标签页修行' : a ? a.kind === 'combat' ? '正在自动历练' : '正在持续修行' : '当前未修行';
    $('activity-icon').textContent = a ? a.enemy?.icon || G.SKILLS[a.skill].icon : '☯';
    $('activity-name').textContent = a ? a.name : '选择一项修行';
    $('activity-detail').textContent = a ? (a.kind === 'combat' ? '击败妖兽后自动迎战下一只。' : a.kind === 'craft' ? '每轮消耗材料，材料不足时自动停止。' : '每轮获得资源与经验。') : '打坐、采集、炼制或历练，仙途从这里开始。';
    const duration = a ? G.duration(state, a) : 1, percent = a ? Math.min(100, state.progress / duration * 100) : 0;
    $('activity-fill').style.width = percent + '%';
    $('activity-percent').textContent = a ? Math.floor(percent) + '%' : '—';
    $('activity-time').textContent = a ? sec(Math.max(0, duration - state.progress)) + ' 后完成' + (a.kind === 'combat' ? '回合' : '') : '等待开始';
    const combat = a?.kind === 'combat' && view === 'combat';
    $('combat-display').hidden = !combat;
    if (combat) {
      const stats = G.stats(state);
      $('combat-display').innerHTML = '<div class="combat-scene"><span class="enemy-avatar">' + a.enemy.icon + '</span><div><span class="eyebrow">当前对手</span><h2>' + esc(a.enemy.name) + '</h2><p>每回合攻击一次，击败后获得灵石与材料。</p></div></div><div class="combat-bars"><div class="combat-line"><span>妖兽气血</span><b>' + n(state.enemyHp) + ' / ' + a.enemy.hp + '</b><div class="track enemy-track"><span style="width:' + state.enemyHp / a.enemy.hp * 100 + '%"></span></div></div><div class="combat-line"><span>自身气血</span><b>' + n(state.hp) + ' / ' + stats.maxHp + '</b><div class="track hp-track"><span style="width:' + state.hp / stats.maxHp * 100 + '%"></span></div></div></div>';
    }
  }
  function render() {
    const focusKey = document.activeElement?.dataset?.key;
    renderSession(); renderNav(); renderHeading(); renderJourney(); renderRealm(); renderPlayer();
    if (view === 'bag') renderBag(); else if (view === 'shop') renderShop(); else renderActions();
    renderProgress(); renderSaveStatus();
    if (focusKey) document.querySelector('[data-key="' + CSS.escape(focusKey) + '"]')?.focus({ preventScroll: true });
  }
  function showOffline(summary) {
    if (!summary || summary.elapsed < 30000 || !summary.actions) return;
    $('offline-duration').textContent = '已结算 ' + time(summary.elapsed) + ' 的离线修行，最多结算 8 小时。';
    const rewards = Object.entries(summary.items).filter(([, qty]) => qty !== 0).map(([id, qty]) => '<div><span>' + G.ITEMS[id].icon + ' ' + esc(G.ITEMS[id].name) + '</span><b>' + (qty > 0 ? '+' : '') + n(qty) + '</b></div>');
    if (summary.cultivation) rewards.unshift('<div><span>✦ 修为</span><b>+' + n(summary.cultivation) + '</b></div>');
    if (summary.coins) rewards.push('<div><span>◈ 灵石</span><b>+' + n(summary.coins) + '</b></div>');
    if (summary.kills) rewards.push('<div><span>历练获胜</span><b>' + n(summary.kills) + ' 次</b></div>');
    Object.entries(summary.xp).forEach(([id, xp]) => rewards.push('<div><span>' + G.SKILLS[id].name + '经验</span><b>+' + n(xp) + '</b></div>'));
    $('offline-rewards').innerHTML = rewards.join('') || '<div><span>完成修行</span><b>' + n(summary.actions) + ' 次</b></div>';
    $('offline-stop').textContent = summary.stopped || '境界需要手动突破；离线时会继续你最后选择的活动。';
    if (!$('offline-dialog').open) $('offline-dialog').showModal();
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button[data-view], button[data-op]');
    if (!target) return;
    if (target.dataset.view) {
      view = target.dataset.view;
      render();
      return;
    }
    const id = target.dataset.id;
    switch (target.dataset.op) {
      case 'action': mutate(() => { if (state.active?.id === id) { G.stop(state); return { reason: '已暂停修行。' }; } return G.start(state, id); }); break;
      case 'equip': mutate(() => G.equip(state, id)); break;
      case 'sell': mutate(() => G.sell(state, id, target.dataset.qty === 'all' ? state.inventory[id] : Number(target.dataset.qty))); break;
      case 'buy': mutate(() => G.buy(state, id)); break;
      case 'breakthrough': mutate(() => G.breakthrough(state)); break;
      case 'takeover':
        owner = acquire(true);
        if (owner) {
          try { const loaded = readSaved(true); state = loaded.state; showOffline(loaded.summary); } catch (_) { /* The current valid state remains usable. */ }
          lastTick = Date.now(); persist(); render(); showToast('已在这里继续修行。');
        }
        break;
    }
  });
  $('breakthrough').addEventListener('click', () => mutate(() => G.breakthrough(state)));
  $('stop-action').addEventListener('click', () => mutate(() => { G.stop(state); return { reason: '已暂停修行。' }; }));
  $('save-menu').addEventListener('click', () => { tick(false); $('save-dialog').showModal(); });
  $('close-save').addEventListener('click', () => $('save-dialog').close());
  $('export-save').addEventListener('click', () => {
    tick(false); persist();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = '放置修仙-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('save-message').textContent = '已导出存档。换浏览器或清理数据前，请保留这个文件。';
  });
  $('import-file').addEventListener('change', async () => {
    pendingImport = null;
    $('import-preview').hidden = true;
    const file = $('import-file').files[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('存档文件过大，请选择游戏导出的 JSON 文件。');
      const parsed = JSON.parse(await file.text()), loaded = G.hydrate(parsed, Date.now());
      pendingImport = parsed;
      $('import-description').textContent = '境界：' + G.realmInfo(loaded.state).current.name + ' · 修为 ' + n(loaded.state.cultivation) + ' · 灵石 ' + n(loaded.state.coins) + ' · 历练获胜 ' + n(loaded.state.kills) + ' 次';
      $('import-preview').hidden = false;
      $('save-message').textContent = '已验证存档，点击载入后替换当前进度。';
    } catch (error) { $('save-message').textContent = '无法导入：' + error.message; }
    $('import-file').value = '';
  });
  $('confirm-import').addEventListener('click', () => {
    if (!pendingImport) return;
    if (!owner) return showToast('请先在这里接管修行，再载入存档。');
    tick(false);
    if (!owner) return;
    try {
      const loaded = G.hydrate(pendingImport, Date.now());
      state = loaded.state; lastTick = Date.now(); pendingImport = null; quarantined = false;
      persist(); render(); $('save-dialog').close(); $('import-preview').hidden = true;
      showToast('存档已载入。'); showOffline(loaded.summary);
    } catch (error) { $('save-message').textContent = '无法载入：' + error.message; }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(true); else { tick(false); persist(); } });
  window.addEventListener('pagehide', () => {
    tick(false); persist();
    try { if (lease()?.id === sessionId) localStorage.removeItem(LEASE_KEY); } catch (_) { /* Storage may be unavailable. */ }
  });
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    owner = acquire(false);
    if (!owner) { loadSpectator(); return; }
    try {
      const loaded = readSaved(true);
      state = loaded.state; lastTick = Date.now();
      persist(); render(); showOffline(loaded.summary);
    } catch (error) {
      quarantined = true; storageOK = false; lastTick = Date.now();
      render(); showToast('最新存档无法读取，当前进度请导出备份。');
    }
  });
  window.addEventListener('storage', (event) => {
    if (event.key === LEASE_KEY && owner) renew();
    if (event.key === SAVE_KEY && !owner) loadSpectator();
  });
  render();
  if (owner) persist();
  showOffline(initialSummary);
  setInterval(() => tick(true), 250);
})();
