(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.AdventureCloud = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var MAX_PROFILE_BYTES = 32768;
  var messages = Object.freeze({
    unavailable: '云存档服务尚未接通，当前仍可使用游客存档。',
    config: '云存档配置未就绪，请联系游戏维护者。',
    auth: '登录已过期，请重新输入邮箱验证码。',
    rate_limit: '操作太频繁，请稍等一分钟再试。',
    network: '暂时连不上云服务，请检查网络后重试。',
    conflict: '云端存档已有新进度，请先读取并选择要保留的存档。',
    invalid_email: '请输入有效的邮箱地址。',
    invalid_code: '验证码不正确或已过期，请检查后重试。',
    invalid_profile: '存档数据格式不正确，请保留本地存档并联系游戏维护者。',
    unknown: '云服务暂时无法完成操作，请稍后重试。'
  });

  function failure(code) {
    var error = new Error(messages[code] || messages.unknown);
    error.name = 'AdventureCloudError';
    error.code = code in messages ? code : 'unknown';
    return error;
  }

  // Do not return SDK error text: it may contain email addresses or request data.
  function translate(error, operation) {
    if (error && error.name === 'AdventureCloudError') return error;
    var code = String(error && error.code || '').toLowerCase();
    var text = String(error && error.message || '').toLowerCase();
    var status = Number(error && error.status || 0);
    if (code === 'p0001' && text.includes('save_conflict')) return failure('conflict');
    if (status === 429 || /rate_limit|over_email_send_rate_limit|over_request_rate_limit/.test(code) || /rate limit|too many requests/.test(text)) return failure('rate_limit');
    if (code === '22023' || text.includes('invalid_profile')) return failure('invalid_profile');
    if (code === 'otp_expired' || code === 'otp_disabled' || /token.*expired|invalid.*token|token.*invalid/.test(text) && operation === 'verify') return failure('invalid_code');
    if (status === 401 || code === '42501' || /session_not_found|refresh_token_not_found|refresh_token_already_used|bad_jwt|user_not_found|no_authorization/.test(code) || /auth_required|jwt expired|auth session missing|invalid refresh token/.test(text)) return failure('auth');
    if (/email_address_invalid|validation_failed/.test(code) && operation === 'request') return failure('invalid_email');
    if (status === 403 && /email_address_not_authorized|signup_disabled|email_provider_disabled/.test(code)) return failure('config');
    if (/pgrst20[25]|42p01|42883/.test(code) || /invalid api key|api key.*invalid|relation .*does not exist|function .*does not exist|schema cache|email.*not.*authorized|smtp/.test(text)) return failure('config');
    if (error && (error.name === 'TypeError' || error.name === 'AbortError') || /fetch|network|timed? ?out|failed to connect|load failed/.test(text) || status >= 500) return failure('network');
    if (operation === 'verify' && status === 403) return failure('invalid_code');
    return failure('unknown');
  }

  function safeUser(user) {
    if (!user || typeof user.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id) || typeof user.email !== 'string' || user.email.length > 254) return null;
    return Object.freeze({ id: user.id, email: user.email });
  }

  function validateConfig(config) {
    if (!config || !config.url || !config.publishableKey) return { error: 'unavailable' };
    if (typeof config.url !== 'string' || typeof config.publishableKey !== 'string') return { error: 'config' };
    var address;
    try { address = new URL(config.url); } catch (_) { return { error: 'config' }; }
    if (address.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(address.hostname) || address.username || address.password || address.port || address.pathname !== '/' || address.search || address.hash) return { error: 'config' };
    var key = config.publishableKey.trim();
    if (!/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(key)) {
      // Reading claims only rejects privileged legacy keys; it does not verify a JWT.
      try {
        var pieces = key.split('.');
        if (pieces.length !== 3 || !pieces.every(function (piece) { return /^[A-Za-z0-9_-]+$/.test(piece); })) return { error: 'config' };
        var payload = pieces[1].replace(/-/g, '+').replace(/_/g, '/');
        var claims = JSON.parse(root.atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
        if (claims.role !== 'anon' || claims.ref && claims.ref !== address.hostname.split('.')[0]) return { error: 'config' };
      } catch (_) { return { error: 'config' }; }
    }
    return { url: address.origin, key: key, ref: address.hostname.split('.')[0] };
  }

  function emailAddress(email) {
    if (typeof email !== 'string') throw failure('invalid_email');
    var clean = email.trim();
    if (clean.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw failure('invalid_email');
    return clean;
  }

  function profileCopy(profile) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw failure('invalid_profile');
    try {
      var json = JSON.stringify(profile);
      if (typeof json !== 'string' || json.length > MAX_PROFILE_BYTES || new TextEncoder().encode(json).length > MAX_PROFILE_BYTES) throw failure('invalid_profile');
      return JSON.parse(json);
    } catch (_) { throw failure('invalid_profile'); }
  }

  function saveRecord(row) {
    if (!row || !Number.isSafeInteger(row.revision) || row.revision < 1 || typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) throw failure('invalid_profile');
    return { profile: profileCopy(row.profile), revision: row.revision, updatedAt: row.updated_at };
  }

  function create(config, options) {
    options = options || {};
    var checked = validateConfig(config), sdk = root.supabase;
    var disabled = checked.error || (!sdk || typeof sdk.createClient !== 'function' ? 'unavailable' : null);
    var client = null, user = null, subscription = null, initialized = false, initializing = null, generation = 0, disposed = false;
    if (!disabled) {
      try {
        var network = { headers: { 'X-Client-Info': 'ruins-squad-cloud/1' } };
        if (typeof root.fetch === 'function' && typeof root.AbortController === 'function' && typeof root.clearTimeout === 'function') {
          network.fetch = async function (input, init) {
            init = init || {};
            var controller = new root.AbortController(), original = init.signal;
            var abort = function () { controller.abort(); };
            if (original) { if (original.aborted) abort(); else original.addEventListener('abort', abort, { once: true }); }
            var timeout = root.setTimeout(abort, 12000);
            try { return await root.fetch(input, Object.assign({}, init, { signal: controller.signal })); }
            finally { root.clearTimeout(timeout); if (original) original.removeEventListener('abort', abort); }
          };
        }
        client = sdk.createClient(checked.url, checked.key, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
            storageKey: 'ruins-squad-auth-' + checked.ref },
          global: network
        });
        var registration = client.auth.onAuthStateChange(function (event, session) {
          if (disposed || event === 'INITIAL_SESSION') return;
          var previousId = user && user.id;
          user = safeUser(session && session.user);
          if (previousId !== (user && user.id)) generation += 1;
          var next = user;
          // Supabase holds an auth lock while invoking this callback. Leave it first.
          root.setTimeout(function () {
            if (disposed || typeof options.onAuthChange !== 'function') return;
            try {
              var result = options.onAuthChange(next, event);
              if (result && typeof result.catch === 'function') result.catch(function () {});
            } catch (_) { /* Consumer errors must not break auth refresh. */ }
          }, 0);
        });
        subscription = registration && registration.data && registration.data.subscription;
      } catch (_) { disabled = 'config'; }
    }

    function ready() {
      if (disposed || disabled || !client) throw failure(disabled || 'unavailable');
    }

    async function init() {
      ready();
      if (initialized) return user;
      if (initializing) return initializing;
      initializing = (async function () {
        var observedGeneration = generation;
        try {
          var local = await client.auth.getSession();
          if (local.error) throw translate(local.error, 'init');
          if (observedGeneration !== generation) throw failure('auth');
          if (!local.data || !local.data.session) { user = null; initialized = true; return null; }
          observedGeneration = generation;
          var checkedUser = await client.auth.getUser();
          if (checkedUser.error) throw translate(checkedUser.error, 'init');
          if (observedGeneration !== generation) throw failure('auth');
          user = safeUser(checkedUser.data && checkedUser.data.user);
          if (!user) throw failure('auth');
          initialized = true;
          return user;
        } catch (error) {
          if (observedGeneration === generation) user = null;
          throw translate(error, 'init');
        }
        finally { initializing = null; }
      })();
      return initializing;
    }

    async function requestCode(email) {
      ready();
      var clean = emailAddress(email);
      try {
        var response = await client.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true } });
        if (response.error) throw response.error;
        return { sent: true };
      } catch (error) { throw translate(error, 'request'); }
    }

    async function verifyCode(email, token) {
      ready();
      var clean = emailAddress(email), code = typeof token === 'string' ? token.trim() : '';
      if (!/^\d{6,8}$/.test(code)) throw failure('invalid_code');
      try {
        var response = await client.auth.verifyOtp({ email: clean, token: code, type: 'email' });
        if (response.error) throw response.error;
        var verified = safeUser(response.data && (response.data.user || response.data.session && response.data.session.user));
        if (!verified) throw failure('auth');
        if (!user || user.id !== verified.id) generation += 1;
        user = verified; initialized = true;
        return user;
      } catch (error) { throw translate(error, 'verify'); }
    }

    async function signOut() {
      ready();
      try {
        // Signing out this browser does not evict the player's other devices.
        var response = await client.auth.signOut({ scope: 'local' });
        if (response.error) throw response.error;
        user = null; initialized = true; generation += 1;
        return null;
      } catch (error) { throw translate(error, 'signOut'); }
    }

    async function signedIn() {
      ready();
      if (!initialized) await init();
      if (!user) throw failure('auth');
      var request = { id: user.id, generation: generation };
      try {
        var response = await client.auth.getSession();
        if (response.error) throw response.error;
        sameAccount(request);
        var session = response.data && response.data.session;
        if (!session || !session.user || session.user.id !== request.id || typeof session.access_token !== 'string' || !session.access_token || session.access_token.length > 16384) throw failure('auth');
        // Keep credentials private and pin them to this operation. The SDK's
        // default async token lookup could otherwise observe a later account.
        request.token = session.access_token;
        return request;
      } catch (error) { throw translate(error, 'load'); }
    }

    function sameAccount(request) {
      if (!user || user.id !== request.id || generation !== request.generation) throw failure('auth');
    }

    async function load() {
      var request = await signedIn();
      try {
        sameAccount(request);
        var response = await client.from('ruins_saves').select('profile,revision,updated_at').eq('user_id', request.id)
          .setHeader('Authorization', 'Bearer ' + request.token).maybeSingle();
        if (response.error) throw response.error;
        sameAccount(request);
        return response.data === null ? null : saveRecord(response.data);
      } catch (error) { throw translate(error, 'load'); }
    }

    async function save(profile, expectedRevision) {
      var request = await signedIn();
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw failure('invalid_profile');
      var clean = profileCopy(profile);
      try {
        sameAccount(request);
        var response = await client.rpc('save_ruins_profile', { p_profile: clean, p_expected_revision: expectedRevision })
          .setHeader('Authorization', 'Bearer ' + request.token);
        if (response.error) throw response.error;
        sameAccount(request);
        if (!Array.isArray(response.data) || response.data.length !== 1) throw failure('invalid_profile');
        var record = saveRecord(response.data[0]);
        if (record.revision !== expectedRevision + 1) throw failure('invalid_profile');
        return record;
      } catch (error) { throw translate(error, 'save'); }
    }

    function dispose() {
      disposed = true; user = null; generation += 1;
      if (subscription && typeof subscription.unsubscribe === 'function') subscription.unsubscribe();
    }

    return Object.freeze({ available: !disabled, reason: disabled ? messages[disabled] : '',
      init: init, requestCode: requestCode, verifyCode: verifyCode, signOut: signOut, load: load, save: save, dispose: dispose });
  }

  return Object.freeze({ create: create });
});
