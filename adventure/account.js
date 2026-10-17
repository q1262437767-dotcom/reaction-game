(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.AdventureAccount = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function create(options) {
    var C = options.campaign, cloud = options.cloud, doc = options.document || root.document;
    var storage = options.storage || root.localStorage, $ = function (id) { return doc.getElementById(id); };
    var guestKey = 'ruins-squad-camp-v2', legacyKey = 'ruins-squad-camp-v1';
    var namespace = String(options.projectUrl || 'unconfigured').replace(/[^a-z0-9]/gi, '').slice(0, 100);
    var tabId;
    try {
      tabId = root.sessionStorage.getItem('ruins-squad-cloud-tab');
      if (!tabId) { tabId = root.crypto.randomUUID(); root.sessionStorage.setItem('ruins-squad-cloud-tab', tabId); }
    } catch (_) { tabId = String(Date.now()) + '-' + Math.random().toString(36).slice(2); }
    var user = null, profile = C.normalize(options.initialProfile), revision = 0, dirty = false;
    var loaded = false, busy = false, sending = false, verifying = false, signingOut = false;
    var epoch = 0, mutation = 0, upload = null, choice = null, timer = null, resendAt = 0, resendTimer = null;
    var lastStatus = '游客模式 · 进度保存在本机', disposed = false, deferredUser;
    var authMode = 'password', codePurpose = 'login', codeEmail = null;

    function copy(value) { return C.normalize(value); }
    function cacheKey(id) { return 'ruins-squad-cloud-v1:' + namespace + ':' + id; }
    function draftKey(id) { return cacheKey(id) + ':draft:' + tabId; }
    function read(key) { try { return JSON.parse(storage.getItem(key) || 'null'); } catch (_) { return null; } }
    function put(key, value) {
      try { storage.setItem(key, JSON.stringify(value)); return true; }
      catch (_) { message('浏览器未允许保存本机备份，请尽快导出备份。', true); return false; }
    }
    function remove(key) { try { storage.removeItem(key); } catch (_) {} }
    function guest() { return copy(read(guestKey) || read(legacyKey)); }
    function progressText(value) {
      var p = copy(value);
      return '星屑 ' + p.coins + ' · 营灯 ' + C.progress(p).lit + '/3 · 探险 ' + p.runs + ' 次';
    }
    function hasProgress(value) {
      var p = copy(value);
      return p.coins > 0 || p.runs > 0 || p.scatter || p.badges.length > 0 || p.relics.length > 0;
    }
    function safeEnvelope(value) {
      if (!value || !value.profile || !Number.isSafeInteger(value.revision) || value.revision < 0) return null;
      return { profile: copy(value.profile), revision: value.revision, dirty: value.dirty === true };
    }
    function otherDrafts(id, remote) {
      var prefix = cacheKey(id) + ':draft:', ownKey = draftKey(id), drafts = [], seen = Object.create(null);
      var remoteProfile = remote ? JSON.stringify(copy(remote.profile)) : null;
      try {
        if (typeof storage.key !== 'function') return drafts;
        for (var index = 0; index < storage.length; index++) {
          var key = storage.key(index);
          if (typeof key !== 'string' || key === ownKey || !key.startsWith(prefix) || key.length === prefix.length) continue;
          var saved = safeEnvelope(read(key));
          if (!saved || !saved.dirty) continue;
          var signature = JSON.stringify(saved.profile);
          if (signature === remoteProfile || seen[signature]) continue;
          seen[signature] = true; drafts.push({ key: key, profile: saved.profile });
        }
      } catch (_) { /* A storage restriction must not prevent cloud login. */ }
      return drafts.sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; });
    }
    function persist() {
      if (!user) return put(guestKey, profile);
      var envelope = { profile: copy(profile), revision: revision, dirty: dirty };
      if (dirty) return put(draftKey(user.id), envelope);
      var ok = put(cacheKey(user.id), envelope);
      if (ok) remove(draftKey(user.id));
      return ok;
    }
    function applyProfile(value) { profile = copy(value); options.setProfile(copy(profile)); }
    function message(text, error) {
      $('account-message').textContent = text || '';
      $('account-message').setAttribute('data-state', error ? 'error' : 'normal');
    }
    function clearPasswords() {
      ['login-password', 'register-password', 'register-password-confirm', 'new-password', 'new-password-confirm'].forEach(function (id) { $(id).value = ''; });
    }
    function gameBusy() { return !!(options.isBusy && options.isBusy()); }
    function authLocked() { return disposed || !cloud.available || busy || sending || verifying || signingOut || gameBusy(); }
    function authAllowed() {
      if (gameBusy()) { clearPasswords(); message('请先返回营地并结束联机，再操作账号。', true); render(); return false; }
      if (authLocked()) { clearPasswords(); return false; }
      return true;
    }
    function emailValue() { return String($('account-email').value || '').trim(); }
    function sameEmail(left, right) { return String(left || '').toLowerCase() === String(right || '').toLowerCase(); }
    function resetCode() { codeEmail = null; codePurpose = 'login'; $('account-code').value = ''; }
    function invalidateCode() {
      var purpose = codePurpose; resetCode();
      if (purpose === 'recovery') codePurpose = 'recovery';
      if (purpose === 'register') authMode = 'register';
    }
    function setMode(mode, purpose) {
      clearPasswords(); resetCode(); authMode = mode; codePurpose = purpose || 'login'; message(''); render();
    }
    function startCooldown() {
      resendAt = Date.now() + 60000;
      if (resendTimer) root.clearTimeout(resendTimer);
      resendTimer = root.setTimeout(function () { resendTimer = null; render(); }, 60010);
    }
    function noteRateLimit(error) { if (error && error.code === 'rate_limit') startCooldown(); }
    function status(text, kind) {
      lastStatus = text;
      $('account-status').textContent = text;
      $('account-status').setAttribute('data-state', kind || 'normal');
      $('cloud-status').textContent = text;
      if (options.onStatus) options.onStatus(text);
      render();
    }
    function render() {
      var locked = authLocked(), cooling = Date.now() < resendAt;
      $('account-login-panel').hidden = !!user;
      $('account-user-panel').hidden = !user;
      $('account-email-display').textContent = user ? user.email : '';
      $('cloud-choice-panel').hidden = !choice;
      $('account-setup-note').hidden = cloud.available;
      $('account-setup-note').textContent = cloud.available ? '' : '云存档正在开通。你可以继续游客试玩，已有本机存档会保留。';
      ['password', 'register', 'code'].forEach(function (mode) {
        var selected = mode === authMode, tab = $('auth-tab-' + mode);
        tab.setAttribute('aria-selected', selected ? 'true' : 'false');
        tab.disabled = locked;
        $('auth-' + mode + '-panel').hidden = !selected;
      });
      $('account-email').disabled = locked;
      ['login-password', 'register-password', 'register-password-confirm', 'new-password', 'new-password-confirm', 'account-code'].forEach(function (id) { $(id).disabled = locked; });
      $('password-login').disabled = locked;
      $('register-account').disabled = locked || cooling;
      $('forgot-password').disabled = locked;
      $('send-login-code').disabled = locked || cooling;
      $('send-login-code').textContent = cooling ? '请在一分钟后重新发送' : codePurpose === 'register' ? '重新发送注册验证码' : codePurpose === 'recovery' ? '发送找回密码验证码' : '发送登录验证码';
      $('verify-login-code').disabled = locked || !codeEmail;
      $('auth-code-input-wrap').hidden = !codeEmail;
      $('account-code-note').textContent = codePurpose === 'register' ? '验证码用于确认注册；请查看刚才注册的邮箱。' : codePurpose === 'recovery' ? '验证已有账号的邮箱后，可在当前账号设置新密码。' : '请输入刚才发送到该邮箱的验证码。';
      $('set-password-panel').hidden = !user;
      $('save-password').disabled = !user || locked;
      $('sync-cloud').disabled = !user || busy || !!upload || !!choice;
      $('logout-account').disabled = !user || locked;
      $('use-cloud-save').disabled = busy;
      $('use-local-save').disabled = busy;
    }
    function cancelTimer() { if (timer) root.clearTimeout(timer); timer = null; }
    function schedule() {
      cancelTimer();
      if (!user || !dirty || choice || disposed) return;
      timer = root.setTimeout(function () { timer = null; sync().catch(function () {}); }, 650);
    }
    function openChoice(kind, remote, local, title, description, cloudLabel, localLabel) {
      choice = { kind: kind, remote: remote, local: copy(local), epoch: epoch, owner: user && user.id };
      $('choice-title').textContent = title;
      $('choice-copy').textContent = description + '\n云端 / 当前：' + progressText(remote ? remote.profile : C.normalize(null)) + '\n本机 / 导入：' + progressText(local);
      $('use-cloud-save').textContent = cloudLabel;
      $('use-local-save').textContent = localLabel;
      status('请选择要保留的存档 · 不会自动叠加星屑', 'offline');
      options.openDialog(); render();
    }
    function same(ticket, id) { return !disposed && epoch === ticket && user && user.id === id; }
    function adopt(record) {
      revision = record ? record.revision : 0; loaded = true; dirty = false; mutation++;
      applyProfile(record ? record.profile : C.normalize(null)); persist();
      status(record ? '云存档已同步 · 版本 ' + revision : '账号已登录 · 云存档将在首次保存时建立');
    }
    function offerRecovery(remote, drafts, index, fresh) {
      var more = index + 1 < drafts.length;
      openChoice('recovery', remote, drafts[index].profile, '发现其他页面未同步的进度（' + (index + 1) + '/' + drafts.length + '）',
        '这份进度属于当前账号，可能来自已经关闭或仍在使用的页面。恢复会替换当前云端进度，不会叠加奖励。原草稿会继续保留。',
        more ? '跳过，查看下一份' : remote ? '使用云端，暂不恢复' : '暂不恢复，继续设置', '恢复这份并上传');
      choice.drafts = drafts; choice.index = index; choice.fresh = fresh;
    }
    async function continueClean(remote, fresh) {
      if (remote) { adopt(remote); return; }
      revision = 0;
      var visitor = guest();
      if (fresh && hasProgress(visitor)) {
        openChoice('initial', null, visitor, '把游客营地带入这个账号？', '账号还没有云存档。可以导入这台设备的游客进度，也可以从新营地开始。游客原档会单独保留。', '从新营地开始', '导入游客进度');
      } else {
        dirty = true; persist(); await push();
      }
    }
    async function reconcile(ticket, id, fresh) {
      var remote = await cloud.load();
      if (!same(ticket, id)) return;
      loaded = true;
      if (dirty) {
        if (remote && JSON.stringify(copy(remote.profile)) === JSON.stringify(profile)) { adopt(remote); return; }
        if ((remote ? remote.revision : 0) === revision) { await push(); return; }
        openChoice('conflict', remote, profile, '发现另一份更新的进度', '请比较两份存档。选择本机进度会替换当前云端进度，其他设备之后也会读取它。', '使用云端存档', '保留本机并上传');
        return;
      }
      var drafts = otherDrafts(id, remote);
      if (drafts.length) { adopt(remote); offerRecovery(remote, drafts, 0, fresh); return; }
      await continueClean(remote, fresh);
    }
    async function handleAuth(next) {
      if (disposed) return;
      if (verifying) { deferredUser = next; return; }
      if ((next && next.id) === (user && user.id)) { if (next) user = next; render(); return; }
      clearPasswords(); resetCode(); authMode = 'password';
      if (user && dirty) persist();
      cancelTimer(); choice = null; epoch++; mutation++; upload = null;
      if (options.onIdentityChange) options.onIdentityChange();
      user = next && typeof next.id === 'string' ? { id: next.id, email: String(next.email || '') } : null;
      revision = 0; dirty = false; loaded = false;
      if (!user) { busy = false; applyProfile(guest()); status('游客模式 · 进度保存在本机'); return; }
      var cached = safeEnvelope(read(draftKey(user.id))) || safeEnvelope(read(cacheKey(user.id)));
      applyProfile(cached ? cached.profile : C.normalize(null));
      if (cached) { revision = cached.revision; dirty = cached.dirty; }
      var ticket = epoch, id = user.id; busy = true; status('正在读取你的云存档…');
      try { await reconcile(ticket, id, true); }
      catch (error) {
        if (same(ticket, id)) { loaded = false; status('云端暂时不可达 · 当前进度只保存在本机', 'offline'); message(error.message, true); }
      } finally { if (same(ticket, id)) { busy = false; render(); } }
    }
    async function push() {
      if (!user || !loaded || !dirty || choice || disposed) return;
      if (upload) return upload;
      var ticket = epoch, id = user.id, sentMutation = mutation, expected = revision, sent = copy(profile);
      status('正在保存到云端…');
      var operation = (async function () {
        try {
          var record = await cloud.save(sent, expected);
          if (!same(ticket, id)) return;
          revision = record.revision;
          if (sentMutation === mutation) { applyProfile(record.profile); dirty = false; }
          persist(); status(dirty ? '新进度等待保存…' : '云存档已保存 · 版本 ' + revision);
        } catch (error) {
          if (!same(ticket, id)) return;
          persist();
          if (error.code === 'conflict') {
            loaded = false;
            try {
              var remote = await cloud.load();
              if (same(ticket, id)) { loaded = true; openChoice('conflict', remote, profile, '其他设备更新了云存档', '两份进度不会自动合并，请选择要继续使用的一份。', '使用云端存档', '保留本机并上传'); }
            } catch (loadError) { if (same(ticket, id)) { status('同步中断 · 本机进度已保留', 'offline'); message(loadError.message, true); } }
          } else { status('尚未同步 · 本机进度已保留', 'offline'); message(error.message, true); }
        } finally {
          if (same(ticket, id)) { upload = null; render(); if (dirty && loaded && !choice && sentMutation !== mutation) schedule(); }
        }
      })();
      upload = operation; render(); return operation;
    }
    async function sync() {
      if (!user || busy || choice || disposed) return;
      if (upload) return upload;
      busy = true; var ticket = epoch, id = user.id; render();
      try { await reconcile(ticket, id, false); }
      catch (error) { if (same(ticket, id)) { status('尚未同步 · 本机进度已保留', 'offline'); message(error.message, true); } }
      finally { if (same(ticket, id)) { busy = false; render(); } }
    }
    function readLocal() {
      if (!user) return guest();
      if (!dirty && !busy && !choice) {
        var cached = safeEnvelope(read(cacheKey(user.id)));
        if (cached && cached.revision > revision) { revision = cached.revision; profile = copy(cached.profile); }
      }
      return copy(profile);
    }
    function writeLocal(value) {
      profile = copy(value); mutation++;
      if (!user) { persist(); status('游客模式 · 进度保存在本机'); return; }
      dirty = true; persist(); status('新进度已保存在本机 · 等待云同步'); schedule();
    }
    async function choose(useLocal) {
      if (!choice || choice.epoch !== epoch || choice.owner !== (user && user.id)) return;
      var selected = choice; choice = null;
      if (selected.kind === 'import') {
        if (useLocal) { applyProfile(selected.local); writeLocal(profile); }
        message(useLocal ? '备份已导入。' : '已保留当前存档。'); render(); return;
      }
      if (selected.kind === 'recovery' && !useLocal) {
        if (selected.index + 1 < selected.drafts.length) offerRecovery(selected.remote, selected.drafts, selected.index + 1, selected.fresh);
        else { await continueClean(selected.remote, selected.fresh); message('其他页面的原草稿仍保留；需要时可再次点击同步查看。'); }
        render(); return;
      }
      if (!useLocal) {
        adopt(selected.remote);
        if (!selected.remote) { dirty = true; persist(); await push(); }
      } else {
        revision = selected.remote ? selected.remote.revision : 0; loaded = true;
        applyProfile(selected.local); dirty = true; mutation++; persist(); await push();
      }
      render();
    }
    async function init() {
      if (!cloud.available) { status('游客模式 · 云存档尚未开通'); render(); return; }
      busy = true; status('正在检查登录状态…');
      try {
        var next = await cloud.init(); busy = false;
        if (next) await handleAuth(next); else status('游客模式 · 登录后可使用云存档');
      } catch (error) { busy = false; status('暂时无法验证账号 · 游客进度保存在本机', 'offline'); message(error.message, true); }
      render();
    }
    function exportSave() {
      var backup = { format: 'ruins-squad-save', version: 1, exportedAt: new Date().toISOString(), profile: copy(profile) };
      var blob = new root.Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      var url = root.URL.createObjectURL(blob), anchor = doc.createElement('a');
      anchor.href = url; anchor.download = 'ruins-squad-' + backup.exportedAt.slice(0, 10) + '.json'; anchor.click();
      root.setTimeout(function () { root.URL.revokeObjectURL(url); }, 1000);
      message('已导出游戏进度备份，文件不包含邮箱和登录凭据。');
    }
    async function importSave(file) {
      if (!file || file.size > 65536) { message('备份文件过大或无法读取。', true); return; }
      if (options.isBusy && options.isBusy()) { message('请先返回营地再导入存档。', true); return; }
      var ticket = epoch;
      try {
        var data = JSON.parse(await file.text());
        if (epoch !== ticket) return;
        if (!data || data.format !== 'ruins-squad-save' || data.version !== 1 || !data.profile || data.profile.v !== 2 || !Array.isArray(data.profile.clearedRuns) || !data.profile.missions || !Number.isFinite(data.profile.coins)) throw new Error();
        openChoice('import', { profile: copy(profile), revision: revision }, data.profile, '确认导入这份备份？', '导入会替换当前进度；登录状态下还会同步到该账号的云存档。', '保留当前进度', '替换为备份进度');
      } catch (_) { message('这不是有效的遗迹小队备份文件，当前存档没有改变。', true); }
    }

    async function runAuth(operation, onSuccess) {
      verifying = true; deferredUser = undefined; render();
      try {
        var pending = operation(); clearPasswords();
        var result = await pending;
        if (disposed) return;
        verifying = false; await onSuccess(result);
      } catch (error) { if (!disposed) { noteRateLimit(error); message(error.message, true); } }
      finally {
        verifying = false; clearPasswords();
        if (!disposed && deferredUser !== undefined) {
          var next = deferredUser; deferredUser = undefined;
          if ((next && next.id) !== (user && user.id)) await handleAuth(next);
        }
        if (!disposed) render();
      }
    }
    function passwordPair(first, second) {
      var value = $(first).value;
      if (value.length < 8 || value.length > 128) { clearPasswords(); message('密码请使用 8–128 个字符。', true); return false; }
      if (value !== $(second).value) { clearPasswords(); message('两次输入的密码不一致，请重新输入。', true); return false; }
      return true;
    }
    $('open-account').onclick = function () { clearPasswords(); options.openDialog(); render(); };
    $('close-account').onclick = function () { clearPasswords(); $('account-dialog').close(); };
    $('account-dialog').addEventListener('close', clearPasswords);
    $('account-dialog').addEventListener('cancel', clearPasswords);
    ['password', 'register', 'code'].forEach(function (mode) {
      $('auth-tab-' + mode).onclick = function () { if (!authAllowed()) return; setMode(mode); };
    });
    $('account-email').addEventListener('input', function () {
      clearPasswords();
      if (codeEmail && !sameEmail(emailValue(), codeEmail)) {
        invalidateCode(); message('邮箱已修改，请为这个邮箱重新发送验证码；注册请重新填写密码。'); render();
      }
    });
    $('password-login').onclick = async function () {
      if (!authAllowed() || user) return;
      if (!$('login-password').value) { clearPasswords(); message('请输入密码。', true); return; }
      var email = emailValue(); message('正在登录…');
      return runAuth(function () { return cloud.signInWithPassword(email, $('login-password').value); }, async function (next) {
        await handleAuth(next); message('登录成功，已读取当前账号的存档。');
      });
    };
    $('register-account').onclick = async function () {
      if (!authAllowed() || user) return;
      if (Date.now() < resendAt) { clearPasswords(); message('请在一分钟后再发送注册验证码。', true); return; }
      if (!passwordPair('register-password', 'register-password-confirm')) return;
      var email = emailValue(); message('正在注册并发送确认邮件…');
      return runAuth(function () { return cloud.signUp(email, $('register-password').value); }, async function (result) {
        startCooldown();
        if (result.requiresEmailVerification) {
          authMode = 'code'; codePurpose = 'register'; codeEmail = email; $('account-code').value = '';
          message('请检查邮箱，输入验证码完成注册验证；如果已注册，请改用密码登录或找回密码。');
        } else {
          await handleAuth(result.user); message('注册成功，已登录。');
        }
      });
    };
    $('forgot-password').onclick = function () {
      if (!authAllowed() || user) return;
      setMode('code', 'recovery');
      message('请输入已有账号的邮箱并发送验证码；验证成功后可设置新密码。');
    };
    $('send-login-code').onclick = async function () {
      if (!authAllowed() || user || Date.now() < resendAt) return;
      var email = emailValue(), purpose = codePurpose;
      if (codeEmail && !sameEmail(email, codeEmail)) {
        invalidateCode(); clearPasswords(); message('邮箱已修改，请重新确认邮箱后发送验证码；注册请重新填写密码。', true); render(); return;
      }
      sending = true; clearPasswords(); message('正在发送邮箱验证码…'); render();
      try {
        if (purpose === 'register') await cloud.resendSignup(email);
        else await cloud.requestCode(email, purpose === 'recovery' ? { shouldCreateUser: false } : undefined);
        if (disposed) return;
        codeEmail = email; codePurpose = purpose; $('account-code').value = ''; startCooldown();
        message(purpose === 'recovery' ? '验证码已发送。验证已有邮箱后，请设置新密码。' : '验证码已发送，请检查邮箱（也看看垃圾邮件）。');
      } catch (error) { if (!disposed) { noteRateLimit(error); message(error.message, true); } }
      finally { sending = false; clearPasswords(); if (!disposed) render(); }
    };
    $('verify-login-code').onclick = async function () {
      if (!authAllowed() || user) return;
      if (!codeEmail || !sameEmail(emailValue(), codeEmail)) {
        invalidateCode(); clearPasswords(); message('邮箱已修改或尚未发送验证码，请先重新发送；注册请重新填写密码。', true); render(); return;
      }
      var email = codeEmail, purpose = codePurpose; message('正在验证邮箱…');
      return runAuth(function () { return cloud.verifyCode(email, $('account-code').value); }, async function (next) {
        $('account-code').value = ''; await handleAuth(next);
        message(purpose === 'recovery' ? '邮箱验证成功。请在下方输入并保存新密码；账号和营地进度会保留。' : purpose === 'register' ? '邮箱确认成功，注册已完成。' : '邮箱验证成功。');
      });
    };
    $('save-password').onclick = async function () {
      if (!authAllowed() || !user) return;
      if (!passwordPair('new-password', 'new-password-confirm')) return;
      var owner = user.id; message('正在保存密码…');
      return runAuth(function () { return cloud.setPassword($('new-password').value); }, async function (next) {
        if (!next || next.id !== owner) throw new Error('账号状态已变化，请重新登录后设置密码。');
        await handleAuth(next); message('密码已保存。下次可用邮箱和密码登录，原有账号和进度均已保留。');
      });
    };
    ['login-password', 'register-password-confirm', 'new-password-confirm'].forEach(function (id, index) {
      $(id).addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); $(['password-login', 'register-account', 'save-password'][index]).click(); } });
    });
    $('account-code').addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); $('verify-login-code').click(); } });
    $('sync-cloud').onclick = function () { return sync(); };
    $('logout-account').onclick = async function () {
      if (!authAllowed() || !user) return;
      clearPasswords(); resetCode(); authMode = 'password';
      signingOut = true; cancelTimer(); if (user && dirty) persist(); render();
      try { await cloud.signOut(); await handleAuth(null); message('已退出账号，游客存档仍单独保留。'); }
      catch (error) { message(error.message, true); }
      finally { signingOut = false; render(); }
    };
    $('use-cloud-save').onclick = function () { return choose(false); };
    $('use-local-save').onclick = function () { return choose(true); };
    $('cancel-cloud-choice').onclick = function () {
      var recovering = choice && choice.kind === 'recovery';
      choice = null; cancelTimer();
      status(recovering ? '已暂缓恢复其他页面草稿 · 原备份仍保留' : '暂未同步 · 当前进度已保留在本机', 'offline'); render();
    };
    $('export-save').onclick = exportSave;
    $('import-save').addEventListener('change', function (event) { var file = event.target.files && event.target.files[0]; event.target.value = ''; importSave(file); });
    function online() { if (user && dirty && !choice) sync().catch(function () {}); }
    function storageChanged(event) {
      if (!user && event.key === guestKey) { applyProfile(guest()); return; }
      if (user && event.key === cacheKey(user.id) && !dirty && !busy && !choice) {
        var saved = safeEnvelope(read(cacheKey(user.id)));
        if (saved && saved.revision > revision) { revision = saved.revision; applyProfile(saved.profile); status('已载入同账号的新进度 · 版本 ' + revision); }
      }
    }
    if (root.addEventListener) { root.addEventListener('online', online); root.addEventListener('storage', storageChanged); }
    render();
    return Object.freeze({ init: init, handleAuth: handleAuth, readLocal: readLocal, writeLocal: writeLocal, sync: sync,
      importSave: importSave, exportSave: exportSave, get user() { return user; }, get busy() { return busy || sending || verifying || signingOut; },
      get status() { return lastStatus; }, get needsChoice() { return !!choice; },
      dispose: function () { disposed = true; cancelTimer(); if (resendTimer) root.clearTimeout(resendTimer); clearPasswords(); if (user && dirty) persist(); if (root.removeEventListener) { root.removeEventListener('online', online); root.removeEventListener('storage', storageChanged); } }
    });
  }
  return Object.freeze({ create: create });
});
