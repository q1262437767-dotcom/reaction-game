(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AdventureStoryDraw = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var KINDS = { mistwarden: 1, shadeling: 1, listener: 1, program: 1, pulseling: 1, echoguard: 1, surveyor: 1, grandfurnace: 1, wardenblade: 1 };
  var WORDS = { gust: '吹灯', slash: '斩', blink: '落点', ring: '扇火', vent: '炉口', lunge: '冲', beam: '扫描', slam: '砸地', hook: '钩' };

  function owns(kind) { return !!KINDS[kind]; }
  function num(value, fallback) { return typeof value === 'number' && isFinite(value) ? value : fallback || 0; }
  function box(c, x, y, w, h, color) { c.fillStyle = color; c.fillRect(x, y, w, h); }
  function words(c, text, x, y, color) {
    c.font = '600 14px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 3; c.strokeStyle = '#102028ee'; c.strokeText(text, x, y);
    c.fillStyle = color || '#f6e7bf'; c.fillText(text, x, y);
  }

  function telegraph(c, e, time) {
    var attack = e.attack || '';
    var x = num(e.x), y = num(e.y);
    var aim = Math.atan2(num(e.aimY, y) - y, num(e.aimX, x + 80) - x);
    var face = num(e.chargeTime) > 0 ? Math.atan2(num(e.chargeY), num(e.chargeX, 1)) : num(e.facing, aim);
    var word = WORDS[attack] || '';
    c.save();
    if (num(e.chargeTime) > 0 || attack === 'lunge') {
      var reach = e.kind === 'grandfurnace' ? 168 : 132;
      c.fillStyle = '#ffb0782e';
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(face - 0.22) * reach, y + Math.sin(face - 0.22) * reach);
      c.lineTo(x + Math.cos(face + 0.22) * reach, y + Math.sin(face + 0.22) * reach);
      c.closePath(); c.fill();
      c.setLineDash([8, 6]); c.strokeStyle = '#ffd0a4'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(face) * reach, y + Math.sin(face) * reach); c.stroke();
      word = '冲';
    } else if (attack === 'gust') {
      c.fillStyle = '#8fd4ff38';
      c.beginPath(); c.moveTo(x, y);
      c.lineTo(x + Math.cos(face - 0.7) * 118, y + Math.sin(face - 0.7) * 118);
      c.lineTo(x + Math.cos(face + 0.7) * 118, y + Math.sin(face + 0.7) * 118);
      c.closePath(); c.fill();
      c.strokeStyle = '#e7f7ff'; c.lineWidth = 2; c.stroke();
    } else if (attack === 'slam') {
      var slam = e.kind === 'grandfurnace' ? 118 : 100;
      c.fillStyle = '#ff9a5a30'; c.beginPath(); c.arc(x, y, slam, 0, Math.PI * 2); c.fill();
      c.setLineDash([7, 5]); c.strokeStyle = '#ffd2a4'; c.lineWidth = 3; c.stroke();
    } else if (attack === 'vent') {
      var vx = num(e.aimX, x), vy = num(e.aimY, y);
      c.fillStyle = '#ff6a3a40'; c.beginPath(); c.arc(vx, vy, 76, 0, Math.PI * 2); c.fill();
      c.setLineDash([5, 4]); c.strokeStyle = '#ffe0bf'; c.lineWidth = 3; c.stroke();
      c.setLineDash([]); c.strokeStyle = '#ffb08988'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, y); c.lineTo(vx, vy); c.stroke();
    } else if (attack === 'blink') {
      var bx = num(e.aimX, x), by = num(e.aimY, y);
      c.globalAlpha = 0.55 + Math.sin(num(time) * 0.012) * 0.15;
      c.fillStyle = '#8ec7ff55'; c.beginPath(); c.arc(bx, by, 28, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#f3fbff'; c.lineWidth = 2; c.setLineDash([4, 4]); c.stroke();
      c.setLineDash([]); c.beginPath(); c.moveTo(x, y); c.lineTo(bx, by); c.stroke();
    } else if (attack === 'ring') {
      c.strokeStyle = '#ffb27a'; c.lineWidth = 4; c.globalAlpha = 0.85;
      for (var i = -2; i <= 2; i += 1) {
        var a = face + i * 0.21;
        c.beginPath(); c.moveTo(x + Math.cos(a) * 20, y + Math.sin(a) * 20);
        c.lineTo(x + Math.cos(a) * 150, y + Math.sin(a) * 150); c.stroke();
      }
    } else if (attack === 'hook') {
      c.strokeStyle = '#f0d38a'; c.lineWidth = 3; c.setLineDash([9, 5]);
      c.beginPath(); c.moveTo(x, y); c.lineTo(num(e.aimX, x), num(e.aimY, y)); c.stroke();
      c.setLineDash([]); c.fillStyle = '#f0d38a';
      c.beginPath(); c.arc(num(e.aimX, x), num(e.aimY, y), 8, 0, Math.PI * 2); c.fill();
    } else {
      var length = attack === 'beam' ? 280 : 78;
      c.strokeStyle = attack === 'beam' ? '#f2e2a4' : '#ffd0b0';
      c.lineWidth = attack === 'beam' ? 5 : 3; c.globalAlpha = 0.9;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(face) * length, y + Math.sin(face) * length); c.stroke();
    }
    c.restore();
    if (word) words(c, word, x, y - (e.kind === 'grandfurnace' ? 78 : 58), '#fff4d2');
  }

  function pips(c, stage) {
    for (var i = 1; i <= 3; i += 1) {
      box(c, -18 + i * 11, -68, 8, 4, i <= stage ? '#f2d48a' : '#2c3e46');
    }
  }
  function core(c, x, y, w, h, hot) {
    box(c, x, y, w, h, '#2a241c');
    box(c, x + 2, y + 2, w - 4, h - 4, hot ? '#ffb15a' : '#8fd0e8');
    box(c, x + w / 2 - 1, y + 2, 2, h - 4, '#fff1c4');
  }

  function body(c, e, pose, time) {
    var kind = e.kind, step = pose && pose.step || 0, hot = (num(time) * 0.01 + (e.stage || 1)) % 2 > 0.35;
    if (kind === 'mistwarden') {
      box(c, -7, 2 + step, 5, 12, '#1c3344'); box(c, 2, 2 - step, 5, 12, '#1c3344');
      box(c, -10, -16, 20, 22, '#24506a'); box(c, -8, -14, 7, 18, '#8eb8c8');
      box(c, -12, -34, 24, 20, '#163246'); box(c, -9, -32, 18, 8, '#d7e7ef');
      box(c, -4, -28, 3, 3, '#9fd8ff'); box(c, 2, -28, 3, 3, '#9fd8ff');
      box(c, 8, -8, 8, 6, '#cfe8f4'); box(c, 14, -7, 6, 4, '#9fd4ff');
    } else if (kind === 'shadeling') {
      box(c, -16, -2, 32, 10, '#24182e'); box(c, -18, -6, 36, 6, '#4a3560');
      box(c, -12, -10, 8, 4, '#d7d2e4'); box(c, 4, -10, 8, 4, '#d7d2e4');
      box(c, -6, 6, 4, 5, '#1a1222'); box(c, 3, 6, 4, 5, '#1a1222');
    } else if (kind === 'listener') {
      box(c, -5, 2 + step, 4, 12, '#24343a'); box(c, 2, 2 - step, 4, 12, '#24343a');
      box(c, -8, -14, 16, 18, '#3d5962'); box(c, -6, -12, 5, 14, '#9cb8b4');
      box(c, -6, -30, 12, 16, '#1e3338'); box(c, -4, -26, 3, 3, '#b7f3ff'); box(c, 2, -26, 3, 3, '#b7f3ff');
      c.strokeStyle = '#b7f3ff'; c.lineWidth = 2;
      c.beginPath(); c.arc(-12, -24, 7, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(12, -24, 7, 0, Math.PI * 2); c.stroke();
    } else if (kind === 'program') {
      c.save(); c.translate(0, -16);
      box(c, -8, -8, 16, 16, '#3a3428'); core(c, -5, -5, 10, 10, true);
      c.strokeStyle = '#f0d48a'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 16, 0, Math.PI * 2); c.stroke();
      c.restore();
    } else if (kind === 'pulseling') {
      box(c, -8, 4 + step, 6, 10, '#3a2a22'); box(c, 3, 4 - step, 6, 10, '#3a2a22');
      box(c, -14, -12, 28, 18, '#4a3428'); box(c, -12, -10, 10, 14, '#a87848');
      core(c, -6, -8, 12, 12, hot);
      box(c, -10, -22, 20, 8, '#2c241c'); box(c, -3, -28, 6, 8, '#ffb15a');
    } else if (kind === 'echoguard') {
      box(c, -8, 4 + step, 6, 14, '#163246'); box(c, 2, 4 - step, 6, 14, '#163246');
      box(c, -14, -18, 28, 26, '#1d4c66'); box(c, -12, -16, 10, 20, '#9fd0e4');
      core(c, -6, -12, 12, 16, false);
      box(c, -11, -40, 22, 22, '#102838'); box(c, -8, -37, 16, 6, '#d5f3ff');
      box(c, -4, -32, 3, 4, '#bfe9ff'); box(c, 2, -32, 3, 4, '#bfe9ff');
      c.strokeStyle = '#9fd8ff88'; c.lineWidth = 2; c.beginPath(); c.arc(18, -8, 12, 0, Math.PI * 2); c.stroke();
      pips(c, e.stage || 1);
    } else if (kind === 'surveyor') {
      box(c, -16, 8, 4, 12, '#4a4034'); box(c, 12, 8, 4, 12, '#4a4034'); box(c, -2, 10, 4, 14, '#4a4034');
      box(c, -7, -28, 14, 36, '#6a5a40'); box(c, -5, -26, 4, 30, '#e6c98a');
      c.fillStyle = hot ? '#fff1c4' : '#f0d48a'; c.beginPath(); c.arc(0, -36, 8, 0, Math.PI * 2); c.fill();
      box(c, -10, -40, 20, 4, '#2c2418');
      pips(c, e.stage || 1);
    } else if (kind === 'grandfurnace') {
      box(c, -16, 8 + step, 12, 16, '#2a211c'); box(c, 6, 8 - step, 12, 16, '#2a211c');
      box(c, -24, -20, 48, 32, '#3a2c28'); box(c, -22, -18, 16, 26, '#8a6244');
      box(c, -28, -28, 56, 10, '#2a211c'); box(c, -22, -40, 44, 14, '#4a382c');
      core(c, -10, -14, 20, 18, true);
      box(c, -16, -8, 32, 6, '#1a1412');
      for (var tooth = -12; tooth <= 12; tooth += 8) box(c, tooth, -8, 3, 5, '#d7c3a4');
      pips(c, e.stage || 1);
    } else if (kind === 'wardenblade') {
      box(c, -6, 4 + step, 4, 14, '#2a3138'); box(c, 2, 4 - step, 4, 14, '#2a3138');
      box(c, -9, -18, 18, 24, '#3d4c5c'); box(c, -8, -16, 6, 20, '#c3b59a');
      box(c, -8, -36, 16, 18, '#2c3540'); box(c, -6, -34, 12, 5, '#e6d7b8');
      box(c, -3, -30, 2, 3, '#f2e2b0'); box(c, 2, -30, 2, 3, '#f2e2b0');
      box(c, -12, -28, 4, 10, '#e6c56a');
      c.strokeStyle = '#f0e2c0'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(10, -8); c.lineTo(22, -28); c.stroke();
      box(c, 18, -32, 6, 4, '#d7c4a4');
      pips(c, e.stage || 1);
    }
  }

  return { owns: owns, telegraph: telegraph, body: body };
});
