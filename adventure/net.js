/* Two-player transport. PeerJS 1.5.5 is vendored in vendor/peerjs.min.js (MIT).
 * PeerServer Cloud is free signaling only; no TURN credentials or relay is bundled.
 * Some NAT/firewall combinations cannot connect. A timeout is a failure, never a
 * successful lobby. Room codes contain 40 cryptographically random bits.
 */
(function (global) {
  'use strict';

  const APP = 'coop-adventure';
  const VERSION = 19;
  const PREFIX = 'coop-adventure-v1-';
  const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const MAX_BYTES = 64 * 1024;
  const OPEN_TIMEOUT = 15000;
  const CONNECT_TIMEOUT = 22000;
  const HEARTBEAT_MS = 2000;
  const SILENCE_TIMEOUT = 20000;
  const TYPES = new Set(['start', 'state', 'input', 'pause', 'lobby', 'loadout']);
  const HOST_TYPES = new Set(['start', 'state', 'pause', 'lobby', 'loadout']);
  const GUEST_TYPES = new Set(['input', 'pause', 'lobby', 'loadout']);
  const REJECTIONS = {
    'room-full': '房间已有两名玩家，请创建新的房间。',
    'protocol': '游戏版本不一致，请双方刷新页面后重试。',
    'wrong-room': '房间信息不匹配，请检查房间码。',
    'not-host': '无法加入这个玩家，请使用房主分享的房间码。'
  };

  function isRecord(value) {
    return value !== null && Object.prototype.toString.call(value) === '[object Object]';
  }

  function validMessage(message) {
    if (!isRecord(message) || !TYPES.has(message.type)) return false;
    // A current lobby always identifies its mode. Never interpret an old or altered
    // lobby as the default mode; the app validates mission/difficulty and state.
    if (message.type === 'loadout') {
      if (message.weapon !== 'pistol' && message.weapon !== 'scatter') return false;
      if (message.melee !== undefined && message.melee !== 'blade' && message.melee !== 'spear') return false;
      if (message.foxRescued !== undefined && typeof message.foxRescued !== 'boolean') return false;
      if (message.companion !== undefined && message.companion !== null) {
        const fox = message.companion;
        if (!isRecord(fox) || Object.keys(fox).length !== 2 || fox.kind !== 'fox' || typeof fox.name !== 'string' || fox.name !== fox.name.trim() || !/^[\u3400-\u9fffA-Za-z0-9 ·_-]{1,12}$/.test(fox.name) || message.foxRescued === false) return false;
      }
      const camp = message.camp;
      return camp === undefined || isRecord(camp) && Object.keys(camp).length === 1 && Array.isArray(camp.upgrades) && camp.upgrades.length <= 3 && new Set(camp.upgrades).size === camp.upgrades.length && camp.upgrades.every(id => ['ward', 'stride', 'relicCase'].includes(id));
    }
    if (message.type === 'lobby' && message.mode === 'chapter') return message.mission === 'chapter1' && message.difficulty === 1;
    return message.type !== 'lobby' || message.mode === 'chapter' || message.mode === 'random' || message.mode === 'story' || message.mode === 'relay' || message.mode === 'hunt';
  }

  // Bound both JSON size and nesting. Ignore no fields and accept no binary,
  // functions, non-finite numbers, cyclic objects, or prototype-related keys.
  function validJSON(value) {
    const seen = new Set();
    let nodes = 0;
    function visit(item, depth) {
      if (++nodes > 8192 || depth > 16) return false;
      if (item === null || typeof item === 'boolean') return true;
      if (typeof item === 'number') return Number.isFinite(item);
      if (typeof item === 'string') return item.length <= MAX_BYTES;
      if (typeof item !== 'object' || seen.has(item)) return false;
      seen.add(item);
      if (!Array.isArray(item) && !isRecord(item)) return false;
      for (const key of Object.keys(item)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype' || key.length > 128) return false;
        if (!visit(item[key], depth + 1)) return false;
      }
      seen.delete(item);
      return true;
    }
    return visit(value, 0);
  }

  function bytes(text) {
    return new TextEncoder().encode(text).byteLength;
  }

  function normalizeCode(value) {
    return String(value || '').toUpperCase().replace(/[\s-]/g, '');
  }

  function randomCode() {
    if (!global.crypto || !global.crypto.getRandomValues) throw new Error('此浏览器不支持安全房间码，请使用新版浏览器并通过 HTTPS 打开。');
    const data = new Uint8Array(5);
    global.crypto.getRandomValues(data);
    let bits = 0;
    let value = 0;
    let result = '';
    for (const byte of data) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        bits -= 5;
        result += ALPHABET[(value >>> bits) & 31];
      }
    }
    return result;
  }

  function create(callbacks) {
    const hooks = callbacks || {};
    let peer = null;
    let connection = null;
    let role = null;
    let roomCode = '';
    let localId = '';
    let connected = false;
    let generation = 0;
    let pending = null;
    let openTimer = null;
    let connectTimer = null;
    let lastReceived = 0;
    let rateStart = 0;
    let rateCount = 0;
    let pageListeners = false;
    const timers = new Set();
    const rejected = new Set();

    function call(name, value) {
      try {
        if (typeof hooks[name] === 'function') hooks[name](value);
      } catch (error) {
        if (global.console) global.console.error('AdventureNet callback failed:', error);
      }
    }

    function status(state, message, code) {
      call('onStatus', { state, message, code: code || '', role, roomCode, connected });
    }

    function later(fn, delay) {
      const timer = global.setTimeout(function () {
        timers.delete(timer);
        fn();
      }, delay);
      timers.add(timer);
      return timer;
    }

    function clearTimer(timer) {
      if (timer === null) return;
      global.clearTimeout(timer);
      timers.delete(timer);
    }

    function settle(error, value) {
      if (!pending) return;
      const operation = pending;
      pending = null;
      if (error) operation.reject(error);
      else operation.resolve(value);
    }

    function detachPageListeners() {
      if (!pageListeners) return;
      global.removeEventListener('pagehide', close);
      global.removeEventListener('beforeunload', close);
      pageListeners = false;
    }

    function cleanup() {
      generation += 1;
      for (const timer of timers) global.clearTimeout(timer);
      timers.clear();
      openTimer = connectTimer = null;
      const oldConnection = connection;
      const oldPeer = peer;
      connection = peer = null;
      connected = false;
      if (oldConnection) { try { oldConnection.close(); } catch (_) {} }
      for (const extra of rejected) { try { extra.close(); } catch (_) {} }
      rejected.clear();
      if (oldPeer) { try { oldPeer.destroy(); } catch (_) {} }
      detachPageListeners();
    }

    function failure(code, message) {
      const hadPeer = connected;
      const error = new Error(message);
      error.code = code;
      cleanup();
      settle(error);
      status(hadPeer ? 'disconnected' : 'error', message, code);
      if (hadPeer) call('onDisconnect', { code, message });
    }

    function close() {
      const error = new Error('连接已取消。');
      error.code = 'cancelled';
      cleanup();
      settle(error);
      role = null;
      roomCode = localId = '';
      status('closed', '已离开房间。', 'closed');
    }

    function encode(kind, fields) {
      return JSON.stringify(Object.assign({ app: APP, v: VERSION, kind }, fields || {}));
    }

    function wire(conn, kind, fields) {
      if (!conn || !conn.open) return false;
      try {
        const payload = encode(kind, fields);
        if (bytes(payload) > MAX_BYTES) return false;
        conn.send(payload);
        return true;
      } catch (_) { return false; }
    }

    function rejectConnection(conn, code) {
      const token = generation;
      rejected.add(conn);
      function discard() {
        rejected.delete(conn);
        try { conn.close(); } catch (_) {}
      }
      const expiry = later(discard, 2000);
      function sendRejection() {
        if (token !== generation || !rejected.has(conn)) return;
        wire(conn, 'reject', { code });
        clearTimer(expiry);
        later(discard, 100);
      }
      conn.on('open', sendRejection);
      conn.on('error', discard);
      conn.on('close', function () { rejected.delete(conn); clearTimer(expiry); });
      if (conn.open) sendRejection();
    }

    function dropAttempt(code, message) {
      if (connected || role !== 'host') {
        failure(code, message);
        return;
      }
      clearTimer(connectTimer);
      connectTimer = null;
      const old = connection;
      connection = null;
      if (old) { try { old.close(); } catch (_) {} }
      status('hosting', message + ' 房间仍开放，可让队友重试。', code);
    }

    function heartbeat(token) {
      if (token !== generation || !connected) return;
      if (Date.now() - lastReceived > SILENCE_TIMEOUT) {
        failure('timeout', '队友连接已超时，游戏已暂停。请重新创建或加入房间。');
        return;
      }
      if (!wire(connection, 'ping')) {
        failure('send-failed', '与队友的连接已中断，请重新加入房间。');
        return;
      }
      later(function () { heartbeat(token); }, HEARTBEAT_MS);
    }

    function markConnected(conn, token) {
      if (token !== generation || connection !== conn || connected) return;
      clearTimer(connectTimer);
      connectTimer = null;
      connected = true;
      lastReceived = Date.now();
      later(function () { heartbeat(token); }, HEARTBEAT_MS);
      status('connected', '两位探险家已连接。', 'connected');
      call('onPeer', { role, peerId: conn.peer, roomCode });
      if (role === 'guest') settle(null);
    }

    function receive(conn, raw, token) {
      if (token !== generation || connection !== conn) return;
      if (typeof raw !== 'string' || raw.length > MAX_BYTES || bytes(raw) > MAX_BYTES) {
        dropAttempt('invalid-message', '收到超出限制的数据，连接已停止。');
        return;
      }
      let frame;
      try { frame = JSON.parse(raw); } catch (_) {
        dropAttempt('invalid-message', '收到无效的联机数据。');
        return;
      }
      if (!isRecord(frame) || frame.app !== APP || frame.v !== VERSION || !validJSON(frame)) {
        if (!connected && role === 'host') wire(conn, 'reject', { code: 'protocol' });
        dropAttempt('protocol', REJECTIONS.protocol);
        return;
      }
      const now = Date.now();
      if (now - rateStart >= 1000) { rateStart = now; rateCount = 0; }
      if (++rateCount > 160) {
        dropAttempt('rate-limit', '队友发送的数据过于频繁，连接已停止。');
        return;
      }
      if (frame.kind === 'reject' && role === 'guest' && !connected) {
        const code = Object.hasOwn(REJECTIONS, frame.code) ? frame.code : 'protocol';
        failure(code, REJECTIONS[code]);
        return;
      }
      if (!connected) {
        if (role === 'host' && frame.kind === 'hello' && frame.roomCode === roomCode) {
          if (!wire(conn, 'welcome', { roomCode })) { dropAttempt('send-failed', '无法完成联机握手。'); return; }
          markConnected(conn, token);
        } else if (role === 'guest' && frame.kind === 'welcome' && frame.roomCode === roomCode) {
          markConnected(conn, token);
        } else {
          if (role === 'host') wire(conn, 'reject', { code: 'wrong-room' });
          dropAttempt('protocol', '联机握手失败，请刷新页面后重试。');
        }
        return;
      }
      lastReceived = now;
      if (frame.kind === 'ping') {
        if (!wire(conn, 'pong')) failure('send-failed', '与队友的连接已中断，请重新加入房间。');
        return;
      }
      if (frame.kind === 'pong') return;
      const incomingTypes = role === 'host' ? GUEST_TYPES : HOST_TYPES;
      if (frame.kind !== 'message' || !validMessage(frame.body) || !incomingTypes.has(frame.body.type)) {
        failure('invalid-message', '收到不符合游戏协议的数据，连接已停止。');
        return;
      }
      call('onMessage', frame.body);
    }

    function attach(conn, token) {
      connection = conn;
      rateStart = Date.now();
      rateCount = 0;
      connectTimer = later(function () {
        if (token === generation && connection === conn && !connected) {
          dropAttempt('connection-timeout', '连接超时；当前网络可能无法建立 WebRTC 直连，请尝试更换网络。');
        }
      }, CONNECT_TIMEOUT);
      conn.on('data', function (data) { receive(conn, data, token); });
      conn.on('open', function () {
        if (token !== generation || connection !== conn) return;
        status('connecting', '直连已建立，正在核对游戏版本与房间。', 'handshake');
        if (role === 'guest' && !wire(conn, 'hello', { roomCode })) dropAttempt('send-failed', '无法发送联机握手。');
      });
      conn.on('close', function () {
        if (token === generation && connection === conn) dropAttempt('peer-left', '队友已离开或连接已中断。');
      });
      conn.on('error', function () {
        if (token === generation && connection === conn) dropAttempt('connection-error', '无法建立稳定的 WebRTC 连接，请更换网络后重试。');
      });
    }

    function handlePeerError(error) {
      const type = error && error.type;
      const messages = {
        'peer-unavailable': '房间不存在或已关闭，请检查房间码并让房主保持页面打开。',
        'unavailable-id': '房间码暂时冲突，请重新创建房间。',
        'browser-incompatible': '此浏览器不支持 WebRTC 联机，请使用新版 Chrome、Edge、Firefox 或 Safari。',
        'webrtc': '浏览器无法建立直连，请更换网络后重试。'
      };
      // Existing WebRTC traffic can survive loss of the signaling websocket.
      if (connected && ['network', 'socket-error', 'socket-closed', 'server-error', 'disconnected'].includes(type)) {
        status('connected', '联机服务暂时不可达，现有直连仍在继续。', 'signaling-lost');
        return;
      }
      failure(type || 'network-error', messages[type] || '无法连接免费联机服务，请检查网络后重试。');
    }

    function begin(nextRole, code) {
      const cancelled = new Error('上一次连接已取消。');
      cancelled.code = 'cancelled';
      cleanup();
      settle(cancelled);
      role = nextRole;
      localId = '';
      roomCode = code || '';
      return new Promise(function (resolve, reject) {
        pending = { resolve, reject };
        if (typeof global.Peer !== 'function') { failure('library-missing', '联机组件未加载，请刷新页面后重试。'); return; }
        if (role === 'guest' && !/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(roomCode)) {
          failure('invalid-code', '请输入有效的 8 位房间码。');
          return;
        }
        try {
          if (role === 'host') roomCode = randomCode();
          const token = generation;
          status('connecting', role === 'host' ? '正在创建联机房间…' : '正在寻找房间并建立直连…', 'signaling');
          // Omit host/key to use official free PeerServer Cloud. Only public
          // STUN is configured: no account, shared secret, or paid TURN relay.
          peer = new global.Peer(role === 'host' ? PREFIX + roomCode : undefined, {
            secure: true,
            debug: 0,
            config: { iceServers: [
              { urls: 'stun:stun.cloudflare.com:3478' },
              { urls: 'stun:stun.l.google.com:19302' }
            ] }
          });
          global.addEventListener('pagehide', close);
          global.addEventListener('beforeunload', close);
          pageListeners = true;
          openTimer = later(function () {
            if (token === generation && !localId) failure('signaling-timeout', '连接联机服务超时，请检查网络后重试。');
          }, OPEN_TIMEOUT);
          peer.on('open', function (id) {
            if (token !== generation) return;
            clearTimer(openTimer);
            openTimer = null;
            localId = id;
            if (role === 'host') {
              status('hosting', '房间已创建，将房间码分享给一位队友。', 'room-created');
              settle(null, roomCode);
            } else {
              try {
                const conn = peer.connect(PREFIX + roomCode, {
                  reliable: true,
                  // PeerJS 1.5.5 calls its unencoded serializer "raw".
                  serialization: 'raw',
                  label: APP,
                  metadata: { app: APP, v: VERSION }
                });
                if (!conn) { failure('connection-error', '无法发起连接，请重新加入房间。'); return; }
                attach(conn, token);
              } catch (_) { failure('connection-error', '无法发起连接，请重新加入房间。'); }
            }
          });
          peer.on('connection', function (conn) {
            if (token !== generation) { try { conn.close(); } catch (_) {} return; }
            if (role !== 'host') { rejectConnection(conn, 'not-host'); return; }
            if (connection) { rejectConnection(conn, 'room-full'); return; }
            if (!conn.metadata || conn.metadata.app !== APP || conn.metadata.v !== VERSION || conn.serialization !== 'raw') {
              rejectConnection(conn, 'protocol');
              return;
            }
            attach(conn, token);
          });
          peer.on('call', function (callObject) { try { callObject.close(); } catch (_) {} });
          peer.on('error', function (error) { if (token === generation) handlePeerError(error); });
          peer.on('disconnected', function () {
            if (token !== generation) return;
            if (connected) status('connected', '联机服务暂时不可达，现有直连仍在继续。', 'signaling-lost');
            else failure('signaling-lost', '与联机服务的连接已断开，请重试。');
          });
          peer.on('close', function () {
            if (token === generation) failure('peer-closed', '联机连接已关闭，请重新创建或加入房间。');
          });
        } catch (error) {
          failure('browser-error', error.message || '此浏览器无法创建联机连接。');
        }
      });
    }

    return {
      host: function () { return begin('host'); },
      join: function (code) { return begin('guest', normalizeCode(code)); },
      send: function (message) {
        const outgoingTypes = role === 'host' ? HOST_TYPES : GUEST_TYPES;
        if (!connected || !connection || !validMessage(message) || !outgoingTypes.has(message.type) || !validJSON(message)) return false;
        // Drop stale application updates rather than build an unbounded queue.
        const dc = connection.dataChannel;
        if (connection.bufferSize > 8 || (dc && dc.bufferedAmount > 256 * 1024)) return false;
        if (wire(connection, 'message', { body: message })) return true;
        // Oversized caller messages are rejected without dropping a healthy peer.
        let tooLarge = false;
        try { tooLarge = bytes(encode('message', { body: message })) > MAX_BYTES; } catch (_) { return false; }
        if (!tooLarge) failure('send-failed', '与队友的连接已中断，请重新加入房间。');
        return false;
      },
      close,
      get role() { return role; },
      get localId() { return localId; },
      get roomCode() { return roomCode; },
      get connected() { return connected; }
    };
  }

  global.AdventureNet = Object.freeze({ create, protocolVersion: VERSION });
})(window);
