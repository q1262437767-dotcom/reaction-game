/* Original, code-drawn art for Ruin Runners. No image assets required. */
(() => {
  'use strict';
  const W = 960, H = 600, TILE = 32;
  const palette = { ink: '#142326', outline: '#0f2024', stone: '#4e6555', moss: '#6a8250', gold: '#e4b96b', mint: '#abc592' };
  const relicColors = { pierce: '#a0c8df', swift: '#b9d698', vigor: '#e3a38a', resonance: '#e5c88a', riposte: '#edb6a0', decoy: '#a8d6cc' };
  const styleColors = { echo: '#d5c4ec', pursuit: '#edcf91', phantom: '#b0dfd2' };
  const styleNames = { echo: '回响反击', pursuit: '闪身射击', phantom: '残影牵制' };
  const floorCache = new Map();
  // Per surface presentation history. It never belongs to the simulation or a
  // network snapshot, and advancing wall time alone cannot move an enemy.
  const enemyMotionCache = new WeakMap();
  const font = '"Microsoft YaHei", "Noto Sans SC", sans-serif';
  const num = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const values = (v) => Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [];
  const rect = (c, x, y, w, h, color) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  function seedRandom(seed) { return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash(value) { return String(value).split('').reduce((a, v) => (a * 31 + v.charCodeAt(0)) | 0, 227); }
  function alpha(c, a, fn) { c.save(); c.globalAlpha *= Math.max(0, Math.min(1, a)); fn(); c.restore(); }
  function ellipse(c, x, y, rx, ry, color) { c.fillStyle = color; c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); c.fill(); }
  function glow(c, x, y, radius, color) { if (radius <= 0) return; const g = c.createRadialGradient(x, y, 0, x, y, radius); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - radius, y - radius, radius * 2, radius * 2); }
  function label(c, text, x, y, color = '#d6dfbd', size = 11, align = 'center') { c.font = `600 ${size}px ${font}`; c.textAlign = align; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = '#112225df'; c.strokeText(String(text), Math.round(x), Math.round(y)); c.fillStyle = color; c.fillText(String(text), Math.round(x), Math.round(y)); }
  function path(c, points, color, width = 1) { c.strokeStyle = color; c.lineWidth = width; c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); }
  function grass(c, x, y, color = '#677e4f', scale = 1) { rect(c, x, y - 5 * scale, 2 * scale, 5 * scale, color); rect(c, x - 3 * scale, y - 3 * scale, 2 * scale, 3 * scale, color); rect(c, x + 3 * scale, y - 4 * scale, 2 * scale, 4 * scale, color); }
  function crystal(c, x, y, size = 1, color = '#a5cba0') { c.fillStyle = color; c.beginPath(); c.moveTo(x, y - 9 * size); c.lineTo(x + 5 * size, y - 2 * size); c.lineTo(x + 3 * size, y + 5 * size); c.lineTo(x - 3 * size, y + 5 * size); c.lineTo(x - 5 * size, y - 2 * size); c.closePath(); c.fill(); rect(c, x - size, y - 5 * size, 2 * size, 7 * size, '#e9edb4'); }

  function makeFloor(key, kind) {
    const surface = document.createElement('canvas'); surface.width = W; surface.height = H;
    const c = surface.getContext('2d'); const rand = seedRandom(hash(key));
    rect(c, 0, 0, W, H, '#182c2b');
    for (let y = 0; y < H; y += TILE) {
      for (let x = 0; x < W; x += TILE) {
        const variant = rand();
        const color = variant < .18 ? '#2a4036' : variant < .50 ? '#293e35' : variant < .80 ? '#2c4238' : '#2b4136';
        rect(c, x + 1, y + 1, TILE - 2, TILE - 2, color);
        rect(c, x + 2, y + 2, TILE - 4, 1, '#354a3b');
        rect(c, x + 2, y + 3, 1, TILE - 5, '#304739');
        rect(c, x + 2, y + TILE - 3, TILE - 4, 1, '#20362f');
        if (rand() < .17) {
          const px = x + 6 + Math.floor(rand() * 17), py = y + 7 + Math.floor(rand() * 15);
          path(c, [[px, py], [px + 4, py + 2], [px + 3, py + 7]], '#1c342e');
          rect(c, px + 4, py + 2, 3, 1, '#3e503b');
        }
        if (rand() < .32) {
          const px = x + 4 + Math.floor(rand() * 22), py = y + 5 + Math.floor(rand() * 21);
          rect(c, px, py, 3, 1, '#3e513d');
          if (rand() < .45) rect(c, px - 2, py + 3, 2, 1, '#3a4c37');
        }
      }
    }
    // Inlaid stone medallion: subtle enough to keep projectiles legible.
    c.save(); c.translate(W / 2, H / 2);
    c.strokeStyle = '#4e644944'; c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, 114, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(0, 0, 102, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 8; i++) { c.save(); c.rotate(i * Math.PI / 4); rect(c, -3, -112, 6, 8, '#63744944'); c.restore(); }
    path(c, [[0, -66], [48, 0], [0, 66], [-48, 0], [0, -66]], '#556b4b30', 2);
    path(c, [[0, -37], [25, 0], [0, 37], [-25, 0], [0, -37]], '#556b4b30', 2);
    c.restore();
    // Windblown grit and moss gather along the outer edges.
    for (let i = 0; i < 150; i++) {
      const edge = Math.floor(rand() * 4); let x = rand() * W, y = rand() * H;
      if (edge === 0) y = 15 + rand() * 45; if (edge === 1) y = H - 15 - rand() * 40;
      if (edge === 2) x = 15 + rand() * 45; if (edge === 3) x = W - 15 - rand() * 45;
      rect(c, x, y, 3 + rand() * 7, 2 + rand() * 3, rand() < .6 ? '#516b425c' : '#122c2855');
      if (rand() < .1) grass(c, x, y, '#597544');
    }
    if (kind === 'boss') { for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; crystal(c, 480 + Math.cos(a) * 180, 300 + Math.sin(a) * 150, .5, '#727e63'); } }
    const edgeShade = c.createRadialGradient(480, 300, 170, 480, 300, 570); edgeShade.addColorStop(0, 'rgba(7,24,28,0)'); edgeShade.addColorStop(1, 'rgba(6,21,27,.46)'); c.fillStyle = edgeShade; c.fillRect(0, 0, W, H);
    return surface;
  }

  function floor(c, state) {
    const room = state.room || {}, key = `${room.id ?? room.index ?? 'room'}:${room.kind || ''}`;
    if (!floorCache.has(key)) { if (floorCache.size > 12) floorCache.clear(); floorCache.set(key, makeFloor(key, room.kind)); }
    c.drawImage(floorCache.get(key), 0, 0);
  }
  function chapterFloor(c, state, time) {
    if (state.mode !== 'chapter') return;
    const index = num(state.room && state.room.index), run = state.chapter || {};
    // Recessed copper conduits and cooling channels belong to the floor; their
    // low contrast leaves the engine's actual cover and attack shapes readable.
    if (index > 0) {
      for (const y of [92, 508]) {
        rect(c, 82, y, 796, 10, '#263c36'); rect(c, 84, y + 2, 792, 3, '#806347');
        rect(c, 84, y + 5, 792, 2, '#433e31');
        for (let x = 96; x < 880; x += 64) { rect(c, x, y, 8, 10, '#a07b51'); rect(c, x + 2, y + 1, 2, 2, '#c9a36a'); }
      }
      for (const x of [115, 845]) {
        rect(c, x - 16, 265, 32, 70, '#23352f');
        for (let y = 269; y < 333; y += 8) rect(c, x - 13, y, 26, 3, '#536053');
      }
    }
    if (index === 2 || index === 3) {
      const flowing = !!run.sluiceOpen;
      for (const y of [172, 420]) {
        rect(c, 120, y, 720, 16, '#1c3532'); rect(c, 124, y + 3, 712, 9, flowing ? '#427c79' : '#2c4740');
        if (flowing) for (let x = 132; x < 833; x += 35) rect(c, x + (time * .012) % 22, y + 5, 12, 2, '#a8ccc078');
      }
    }
    if (index === 4) {
      c.strokeStyle = run.fireTaken ? '#746a4d55' : '#c297514d'; c.lineWidth = 3;
      c.beginPath(); c.ellipse(660, 300, 128, 83, 0, 0, Math.PI * 2); c.stroke();
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; rect(c, 657 + Math.cos(a) * 135, 298 + Math.sin(a) * 89, 6, 4, '#8d7752'); }
    }
  }
  function expeditionFloor(c, state, time, still) {
    if (state.mode !== 'random') return;
    const room = state.room || {};
    if (room.kind === 'refuge') {
      // Warm woven rugs and a sheltered light give the empty room its pause.
      // They are floor decoration, never new collision or danger geometry.
      glow(c, 480, 286, 245, '#e3b46a17');
      ellipse(c, 480, 305, 175, 91, '#8a785215');
      rect(c, 329, 273, 102, 68, '#4a4c393e'); rect(c, 333, 277, 94, 60, '#6e654836');
      for (const x of [336, 420]) for (let y = 279; y < 336; y += 9) rect(c, x, y, 4, 4, '#9c8c593a');
      for (const side of [-1, 1]) { rect(c, 480 + side * 143 - 18, 213, 36, 9, '#4b594536'); grass(c, 480 + side * 156, 226, '#61744d', 1.2); }
      lantern(c, 480, 245, still ? 0 : time, 1.15);
      return;
    }
    // Quiet edge markings identify the room's former use without announcing
    // an encounter type or drawing false cover on the traversable floor.
    if (room.encounter === 'crossfire') {
      for (const side of [-1, 1]) {
        const x = side < 0 ? 111 : 849;
        path(c, [[x - 12, 108], [x + 12, 131]], '#9276534a', 2);
        path(c, [[x + 12, 108], [x - 12, 131]], '#9276534a', 2);
      }
    } else if (room.encounter === 'bulwark') {
      for (const x of [104, 846]) {
        path(c, [[x, 104], [x, 121], [x + 10, 130], [x + 20, 121], [x + 20, 104], [x, 104]], '#8c8c6255', 2);
        rect(c, x + 9, 109, 2, 13, '#b7a16e3d');
      }
    } else if (room.encounter === 'patrol') {
      for (let i = 0; i < 4; i++) {
        const x = 102 + i * 13, y = 113 + i * 6;
        ellipse(c, x, y, 2, 4, '#ac9e6833'); ellipse(c, x + 5, y + 8, 2, 4, '#ac9e6826');
      }
    }
  }
  function wall(c, w) {
    const x = num(w.x), y = num(w.y), width = num(w.w ?? w.width, 32), height = num(w.h ?? w.height, 32);
    // The lower facade adds height without shifting the collision silhouette.
    rect(c, x + 4, y + 7, width, height, '#0c2426a6');
    rect(c, x, y, width, height, '#344e44');
    rect(c, x, y, width, Math.min(height, 6), '#66816a');
    rect(c, x, y + 6, width, 2, '#8ba27933');
    rect(c, x, y + height - Math.min(8, height / 2), width, Math.min(8, height / 2), '#253f39');
    rect(c, x, y, 3, height, '#536f5b'); rect(c, x + width - 3, y, 3, height, '#263f39');
    for (let ty = y + 9; ty < y + height - 2; ty += 23) {
      const row = Math.floor((ty - y) / 23);
      rect(c, x + 3, ty, width - 6, 2, '#273e37');
      for (let tx = x + 18 + (row % 2) * 17; tx < x + width - 3; tx += 36) rect(c, tx, ty - 18, 2, Math.min(20, ty - y), '#29453b');
    }
    if (width > 35 && height > 12) {
      const rand = seedRandom(hash(`${x},${y}`));
      for (let i = 0; i < Math.ceil(width / 46); i++) {
        const px = x + 7 + rand() * (width - 16), py = y + rand() * Math.min(11, height);
        rect(c, px, py, 8, 3, '#77905a'); rect(c, px + 5, py + 3, 6, 3, '#5e7b4b');
        if (rand() > .6) rect(c, px + 7, py + 6, 3, 7, '#4f7246');
      }
    }
  }

  function lantern(c, x, y, time, scale = 1) {
    const flicker = 1 + Math.sin(time * .005 + x) * .04 + Math.sin(time * .012) * .025;
    glow(c, x, y, 78 * scale * flicker, '#e6a14c25');
    glow(c, x, y - 2, 24 * scale, '#f0ba5b2b');
    c.save(); c.translate(Math.round(x), Math.round(y)); c.scale(scale, scale);
    rect(c, -7, -11, 14, 20, '#142a28'); rect(c, -6, -10, 12, 18, '#614d31');
    rect(c, -4, -8, 8, 13, '#ba8145'); rect(c, -3, -7, 6, 10, '#f3bd6b');
    rect(c, -1, -6 + Math.round(Math.sin(time * .008 + x)), 3, 7, '#ffdf95');
    rect(c, -8, -12, 16, 3, '#83906a'); rect(c, -8, 7, 16, 3, '#7a7854');
    rect(c, -2, -16, 4, 4, '#6f7a59'); rect(c, -6, -10, 2, 18, '#7e7b54'); rect(c, 4, -10, 2, 18, '#635d40');
    c.restore();
    if (Math.sin(time * .0015 + x) > .1) { const rise = (time * .018 + x * 3) % 23; alpha(c, 1 - rise / 23, () => rect(c, x + Math.sin(rise) * 5, y - 14 - rise, 2, 2, '#e6ba6d')); }
  }
  function door(c, d, time) {
    const x = num(d.x), y = num(d.y), w = num(d.w, 48), h = num(d.h, 28), vertical = h > w;
    const isLocked = !!d.locked, color = isLocked ? '#b79c64' : '#a4c29a';
    rect(c, x - 3, y - 3, w + 6, h + 6, '#102829'); rect(c, x, y, w, h, '#1c3331');
    if (vertical) {
      rect(c, x, y, 6, h, '#5a6e56'); rect(c, x + w - 6, y, 6, h, '#405d4c');
      for (let gy = y + 8; gy < y + h - 5; gy += 12) rect(c, x + 7, gy, w - 14, 3, isLocked ? '#7f7851' : '#365744');
    } else {
      rect(c, x, y, w, 6, '#5e745b'); rect(c, x, y + h - 5, w, 5, '#365445');
      for (let gx = x + 8; gx < x + w - 5; gx += 12) rect(c, gx, y + 5, 3, h - 10, isLocked ? '#7f7851' : '#365744');
    }
    const cx = x + w / 2, cy = y + h / 2;
    if (isLocked) { rect(c, cx - 6, cy - 6, 12, 13, '#2b3b31'); rect(c, cx - 4, cy - 4, 8, 8, '#ae9260'); rect(c, cx - 1, cy - 2, 2, 5, '#4e543b'); }
    else { glow(c, cx, cy, 44, '#b9d38b22'); crystal(c, cx, cy, .6, '#c2d6a3'); }
    if (d.label) label(c, d.label, cx, y + h + 12, color, 9);
  }
  function portal(c, p, time) {
    const x = num(p.x), y = num(p.y), r = num(p.r, 22), active = p.active !== false;
    if (p.direction) {
      const angle = { north: -Math.PI / 2, east: 0, south: Math.PI / 2, west: Math.PI }[p.direction];
      if (Number.isFinite(angle)) {
        c.save(); c.translate(x, y); c.rotate(angle);
        rect(c, -18, -19, 36, 38, '#132d2a80');
        if (active) {
          glow(c, 0, 0, 34, '#b9d38b20');
          path(c, [[-8,-8],[0,0],[-8,8]], '#c9d8a4', 3);
          path(c, [[1,-8],[9,0],[1,8]], '#9ab68a', 2);
        }
        c.restore(); return;
      }
    }
    c.save(); c.translate(x, y);
    ellipse(c, 0, 5, r + 8, (r + 8) * .48, '#0d252999');
    ellipse(c, 0, 1, r + 5, (r + 5) * .55, '#546b53'); ellipse(c, 0, -1, r + 1, (r + 1) * .55, '#263e38');
    c.strokeStyle = active ? '#acd3b0' : '#596e53'; c.lineWidth = 2; c.beginPath(); c.ellipse(0, -2, r - 3, (r - 3) * .55, 0, 0, Math.PI * 2); c.stroke();
    if (active) {
      glow(c, 0, -5, 45, '#a5d4ad2b');
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + time * .0003; rect(c, Math.cos(a) * (r - 5), Math.sin(a) * (r - 5) * .55 - 3, 3, 2, '#c7e0b3'); }
      const float = Math.sin(time * .003 + x) * 3; crystal(c, 0, -16 + float, .85, '#b8d3ad');
      for (let i = 0; i < 4; i++) { const rise = (time * .025 + i * 13) % 48; alpha(c, (1 - rise / 48) * .7, () => rect(c, Math.sin(i * 7 + time * .0005) * 14, -rise, 2, 3, '#d2e2b8')); }
    } else { rect(c, -5, -9, 10, 12, '#65775a'); rect(c, -2, -5, 4, 4, '#2c4338'); }
    c.restore();
    if (p.label && active) label(c, p.label, x, y + r * .6 + 19, '#bdd1a7', 9);
  }
  function pressureSwitch(c, s, time) {
    const x = num(s.x), y = num(s.y), r = num(s.r, 16), pressed = !!s.pressed;
    ellipse(c, x, y + 4, r + 3, r * .62, '#112a28');
    ellipse(c, x, y, r, r * .6, pressed ? '#99b37b' : '#6c7d59');
    ellipse(c, x, y - 2, r - 4, (r - 4) * .6, pressed ? '#536d48' : '#374f3c');
    c.save(); c.translate(x, y - 2); c.rotate(Math.PI / 4); rect(c, -4, -4, 8, 8, pressed ? '#d3d69a' : '#8a9666'); c.restore();
    if (pressed) glow(c, x, y, 35, '#b6d28420');
  }
  function portalDestination(c, gate, state, localId) {
    if (state.mode !== 'random' || gate.active === false || !gate.direction) return;
    const p = state.players && state.players[localId];
    if (!p || p.downed || Math.hypot(num(p.x) - num(gate.x), num(p.y) - num(gate.y)) >= 104) return;
    if (values(state.interactables).some(item => item.active !== false && !item.used && Math.hypot(num(p.x) - num(item.x), num(p.y) - num(item.y)) < 100)) return;
    const target = values(state.rooms).find(room => room.index === gate.target && (room.visited || room.discovered));
    if (!target) return;
    const caption = (target.kind === 'refuge' ? '灯室 · ' : '') + (target.name || '遗迹通道');
    const x = Math.max(122, Math.min(W - 122, num(gate.x)));
    const y = gate.direction === 'south' ? num(gate.y) - 38 : gate.direction === 'north' ? num(gate.y) + 40 : num(gate.y) - 39;
    const width = Math.min(235, caption.length * 9 + 18);
    rect(c, x - width / 2, y - 10, width, 20, '#102823d9'); label(c, caption, x, y, target.kind === 'refuge' ? '#d8c99d' : '#bccbab', 9);
  }
  function fountain(c, f, time) {
    const x=num(f.x),y=num(f.y),r=num(f.r,24);
    ellipse(c,x,y+4,r+4,r*.62,'#122a2a');ellipse(c,x,y,r+2,r*.6,'#657c68');ellipse(c,x,y-2,r-3,(r-3)*.56,'#214c50');ellipse(c,x,y-3,r-6,(r-6)*.5,'#4f8582');
    c.strokeStyle='#b5d4bb77';c.lineWidth=1;c.beginPath();c.ellipse(x,y-3,r*.46+Math.sin(time*.003)*2,r*.23,0,0,Math.PI*2);c.stroke();
    rect(c,x-2,y-13,4,10,'#b7d8c0');rect(c,x-1,y-17+Math.sin(time*.004)*2,2,4,'#d2e4c9');
    for(let i=0;i<4;i++){const a=i*Math.PI/2+.5;rect(c,x+Math.cos(a)*r-3,y+Math.sin(a)*r*.5-4,6,4,'#8d9b7a');}
    label(c,'补水泉',x,y+r*.6+12,'#a6c5ad',8);
  }
  function eventMachine(c, item, time, state) {
    const current = state.roomEvent || {}, stage = current.kind === item.kind ? current.stage : item.used ? 'complete' : 'ready';
    const complete = stage === 'complete', running = stage === 'active', flowing = running || complete;
    if (item.kind === 'sluice') {
      // The dry channels become a visible water route after turning the wheel.
      for (let i = 0; i < 3; i++) {
        rect(c,-31+i*21,10,12,40,'#153738');rect(c,-29+i*21,12,8,36,flowing ? '#4d9290' : '#254e4a');
        if (flowing) for (let j = 0; j < 3; j++) rect(c,-28+i*21,14+(j*13+time*.017)%33,6,2,'#b4d6be');
      }
      rect(c,-29,-9,58,24,'#183631');rect(c,-25,-11,50,22,'#597568');rect(c,-25,-11,50,4,'#9ba88a');
      rect(c,-4,-45,8,39,'#284b43');rect(c,-2,-45,3,37,'#99a77b');
      c.save();c.translate(0,-31);c.rotate(flowing ? Math.PI/4 : 0);
      c.strokeStyle=complete?'#a9d2be':'#d5b479';c.lineWidth=4;c.beginPath();c.arc(0,0,16,0,Math.PI*2);c.stroke();
      for(let i=0;i<4;i++){const a=i*Math.PI/2;path(c,[[Math.cos(a)*4,Math.sin(a)*4],[Math.cos(a)*14,Math.sin(a)*14]],complete?'#a9d2be':'#d5b479',3);}
      rect(c,-4,-4,8,8,'#e7d7a1');c.restore();
      if (complete) { path(c,[[-9,-57],[-2,-50],[11,-64]],'#bfe3bb',3); }
    } else if (item.kind === 'lift') {
      ellipse(c,0,13,42,22,'#102c2b');ellipse(c,0,8,40,22,'#7d8265');ellipse(c,0,5,35,18,'#2b4740');
      for(let i=0;i<5;i++){rect(c,-29+i*13,-7,7,25,complete?'#9b9b75':'#697459');rect(c,-28+i*13,-6,2,23,'#a6aa81');}
      for(const side of [-1,1]){rect(c,side*39-4,-48,8,58,'#1d3b34');rect(c,side*39-3,-46,3,55,'#7c8d70');
        for(let j=0;j<4;j++){rect(c,side*39-2,-40+j*12,4,3,'#a2ab80');}}
      rect(c,-43,-51,86,7,'#7c8c69');rect(c,-40,-51,80,2,'#adb38b');
      if (running) { const offset=(time*.018)%20;path(c,[[-22,offset-38],[-15,offset-46],[-8,offset-38]],'#f0d293',3);path(c,[[8,offset-38],[15,offset-46],[22,offset-38]],'#f0d293',3); }
      else if (complete) { path(c,[[-9,-30],[-2,-23],[11,-37]],'#bfe3bb',3); }
      else crystal(c,0,-26,.7,'#ddc27d');
    }
  }
  function chapterInteractable(c, item, time, state, localId, still = false) {
    time = still ? 0 : time;
    const x = num(item.x), y = num(item.y), run = state.chapter || {}, kind = item.kind;
    const p = state.players && state.players[localId], nearby = p && !p.downed && Math.hypot(num(p.x) - x, num(p.y) - y) < 100;
    const active = item.active !== false && !item.used;
    shadow(c, x, y, kind === 'chapter-lamp' || kind === 'chapter-fire' ? 29 : 21, .3);
    c.save(); c.translate(Math.round(x), Math.round(y));
    if (kind === 'chapter-note') {
      rect(c, -18, -3, 36, 11, '#33473d'); rect(c, -15, -7, 30, 5, '#839078');
      c.save(); c.rotate(-.16); rect(c, -12, -25, 24, 20, '#695d41'); rect(c, -10, -26, 20, 18, item.used ? '#a39670' : '#d3bf8a');
      for (let i = 0; i < 3; i++) rect(c, -6, -22 + i * 5, i === 2 ? 9 : 13, 2, '#7f7757');
      rect(c, 7, -25, 3, 4, '#efe0a7'); c.restore();
      if (!item.used) crystal(c, 0, -39, .38, '#e9ce8c');
    } else if (kind === 'chapter-sluice') {
      eventMachine(c, { ...item, kind: 'sluice', used: !!run.sluiceOpen }, time,
        { roomEvent: { kind: 'sluice', stage: run.sluiceOpen ? 'complete' : 'ready' } });
      rect(c, -29, -15, 58, 4, '#a77b50');
    } else if (kind === 'chapter-fire') {
      const taken = !!run.fireTaken;
      ellipse(c, 0, 12, 38, 17, '#182d2a'); ellipse(c, 0, 7, 35, 16, '#6d7867'); ellipse(c, 0, 3, 28, 12, '#2b3a30');
      for (const side of [-1, 1]) { rect(c, side * 27 - 5, -37, 10, 43, '#8c6748'); rect(c, side * 27 - 3, -36, 3, 40, '#bc9660'); }
      rect(c, -32, -40, 64, 6, '#a77d4f'); rect(c, -30, -40, 60, 2, '#d1ad71');
      if (!taken) {
        glow(c, 0, -27, 77, '#f4b35438');
        for (const a of [-.7, .7]) { c.save(); c.rotate(a); rect(c, -3, -38, 6, 24, '#aa7849'); c.restore(); }
        crystal(c, 0, -25 + Math.sin(time * .004) * 2, 1.5, '#f4be6b'); crystal(c, 0, -25 + Math.sin(time * .004) * 2, .65, '#fff0bf');
      } else { ellipse(c, 0, 0, 17, 7, '#162b27'); rect(c, -9, -4, 18, 3, '#6c654b'); }
    } else if (kind === 'chapter-lamp') {
      const lit = !!run.lampLit;
      ellipse(c, 0, 12, 31, 14, '#182d2a'); rect(c, -24, 0, 48, 10, '#5e715d'); rect(c, -27, -5, 54, 7, '#849278');
      rect(c, -5, -44, 10, 40, '#766445'); rect(c, -3, -44, 4, 38, '#b68b55');
      if (lit) { lantern(c, 0, -52, time, 1.55); glow(c, 0, -49, 105, '#eeba5830'); }
      else { rect(c, -13, -68, 26, 29, '#26372d'); rect(c, -9, -64, 18, 21, '#4b5340'); rect(c, -6, -62, 12, 16, '#26382d'); rect(c, -16, -71, 32, 6, '#a08b5e'); rect(c, -16, -40, 32, 5, '#8a7b50'); }
    } else if (kind === 'chapter-supplies') {
      const taken = !!run.suppliesTaken;
      if (!taken) {
        // The cloth and soft pool identify medicine from the doorway, without
        // advertising a permanent interaction prompt across the room.
        glow(c, 0, -13, 63, '#b5d6ba22');
        ellipse(c, 0, 10, 33, 12, '#a8d6b113');
        rect(c, -31, -4, 61, 10, '#c8cfab'); rect(c, -28, -3, 55, 3, '#e5dfb5');
        const rise = (time * .008) % 20;
        alpha(c, .35 * (1 - rise / 20), () => {
          rect(c, 21, -38 - rise, 3, 9, '#c5e7c4'); rect(c, 18, -35 - rise, 9, 3, '#c5e7c4');
        });
      }
      for (let i = 0; i < 2; i++) { rect(c, -26 + i * 26, -14 + i * 5, 25, 29, '#364a3c'); rect(c, -24 + i * 26, -13 + i * 5, 21, 24, taken ? '#52614c' : '#8d7954'); rect(c, -18 + i * 26, -13 + i * 5, 5, 24, '#b49b66'); }
      if (!taken) { rect(c, -11, -27, 27, 20, '#566c56'); rect(c, -9, -28, 23, 4, '#aeb188'); rect(c, 0, -24, 5, 15, '#e2d99f'); rect(c, -5, -19, 15, 5, '#e2d99f'); }
      else path(c, [[-8, -24], [-2, -18], [10, -31]], '#b6d2a5', 3);
    } else if (kind === 'chapter-beacon') {
      const lit = !!run.beaconLit;
      rect(c, -21, 1, 42, 13, '#4b5e4c'); rect(c, -26, -4, 52, 8, '#839077');
      rect(c, -5, -67, 10, 65, '#766547'); rect(c, -3, -66, 3, 60, '#c0965c');
      rect(c, -20, -65, 40, 5, '#9e774e'); rect(c, -20, -63, 4, 20, '#9e774e'); rect(c, 16, -63, 4, 20, '#9e774e');
      if (lit) { lantern(c, 0, -48, time, 1.1); path(c, [[0, -65], [0, -118]], '#e9cd8d2a', 15); path(c, [[0, -65], [0, -118]], '#e9cd8d66', 2); }
      else {
        rect(c, -9, -61, 18, 28, '#26392f'); rect(c, -6, -57, 12, 19, '#677050'); rect(c, -3, -55, 6, 15, '#344536');
        // A failing pilot light is readable while distant. Activation replaces
        // this modest signal with the existing steady beam and warm lantern.
        const pulse = .5 + Math.cos(time * .0018) * .5;
        glow(c, 0, -48, 44, '#c7c78518');
        alpha(c, .28 + pulse * .25, () => {
          rect(c, -2, -52, 4, 9, '#e2c582');
          for (const side of [-1, 1]) path(c, [[side * 25, -54], [side * 30, -48], [side * 25, -42]], '#b7c393', 2);
        });
      }
      c.fillStyle = lit ? '#cfab67' : '#657753'; c.beginPath(); c.moveTo(6, -81); c.lineTo(34, -72); c.lineTo(6, -63); c.closePath(); c.fill();
    }
    c.restore();
    // Information is contextual. Neither a remote note nor an inactive story
    // prop becomes a permanent instruction label across the room.
    if (nearby && active) label(c, 'E · ' + (item.label || item.title || '查看'), x, y + (kind === 'chapter-sluice' ? 64 : 34), '#ead7a3', 10);
    else if (nearby && item.used && kind === 'chapter-note') label(c, item.title || '已读记录', x, y + 30, '#93aa92', 9);
  }
  function interactable(c, item, time, state, localId, still = false) {
    if (!item || (item.kind === 'relic' && item.used)) return;
    if (item.kind === 'fox-cage') { foxCage(c,item,time,state,localId,still); return; }
    if (state.mode === 'random' && (item.kind === 'refuge-rest' || item.kind === 'refuge-relic')) { refugeInteractable(c, item, time, state, localId, still); return; }
    if (state.mode === 'chapter' && /^chapter-/.test(item.kind)) { chapterInteractable(c, item, time, state, localId, still); return; }
    if (item.kind === 'breach-cache') { breachCache(c,item,state,localId); return; }
    if (['forge','forge-reward','storehouse-switch','storehouse-cache'].includes(item.kind)) { expeditionInteractable(c, item, still ? 0 : time, state, localId); return; }
    const x = num(item.x), y = num(item.y), kind = item.kind, active = item.active !== false && !item.used;
    const p = state.players && state.players[localId], nearby = p && !p.downed && Math.hypot(num(p.x) - x, num(p.y) - y) < 100;
    const color = kind === 'cache' || kind === 'supply-cache' ? '#9ac9c3' : kind === 'relic' ? relicColors[item.buff] || relicColors.pierce : kind === 'extraction' || kind === 'relay-extraction' ? '#bed6a3' : '#e9c780';
    shadow(c, x, y, kind === 'beacon' ? 28 : 19, .3);
    if (active) {
      glow(c, x, y - 8, nearby ? 66 : 44, kind === 'cache' ? '#a6d8cc1c' : '#d3d8a51c');
      c.strokeStyle = color + (nearby ? 'a0' : '48'); c.lineWidth = nearby ? 2 : 1; c.setLineDash([4,5]); c.beginPath(); c.ellipse(x, y + 7, 25 + Math.sin(time * .003) * 2, 11, 0, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    }
    c.save(); c.translate(Math.round(x), Math.round(y));
    if (kind === 'sluice' || kind === 'lift') {
      eventMachine(c, item, time, state);
    } else if (kind === 'cache' || kind === 'supply-cache') {
      rect(c, -20, -11, 40, 26, '#112c2c'); rect(c, -18, -11, 36, 23, '#405d58'); rect(c, -16, -9, 32, 18, '#5a7970'); rect(c, -16, -9, 5, 18, '#829982'); rect(c, 11, -9, 5, 18, '#345650');
      rect(c, -19, item.used ? -21 : -16, 38, 7, item.used ? '#849f87' : '#7d9e8b'); rect(c, -16, item.used ? -22 : -17, 32, 3, '#a7bca0');
      if (item.used) { rect(c, -14, -11, 28, 6, '#203f39'); rect(c, -9, -6, 18, 3, '#b6b389'); }
      else { rect(c, -4, -11, 8, 16, active ? '#b9d9c3' : '#857e60'); rect(c, -8, -7, 16, 7, active ? '#9fc9b6' : '#857e60'); rect(c, -2, -6, 4, 5, active ? '#edf2c7' : '#263e36'); }
      rect(c, -18, 10, 36, 4, '#294b40');
      if(kind==='supply-cache'&&!item.used){rect(c,-3,-11,6,15,'#d5e3b5');rect(c,-8,-6,16,5,'#d5e3b5');rect(c,-1,-9,2,11,'#f8f2cd');}
    } else if (kind === 'beacon') {
      const mission = state.mission || {}, running = mission.phase === 'defend', lit = mission.started || mission.phase === 'extract';
      ellipse(c, 0, 11, 29, 12, '#152e2c'); ellipse(c, 0, 7, 25, 11, '#5d7258'); ellipse(c, 0, 3, 21, 9, '#81916a'); ellipse(c, 0, 1, 15, 6, '#3e5948');
      rect(c, -8, -28, 16, 30, '#233e33'); rect(c, -6, -28, 12, 27, '#75855f'); rect(c, -5, -28, 4, 26, '#acac77'); rect(c, -11, -34, 22, 8, '#9a9b65'); rect(c, -8, -37, 16, 4, '#c6b87a');
      crystal(c, 0, -45 + Math.sin(time * .004) * 2, 1.05, lit ? '#f5d98a' : '#90a379');
      if (lit) {
        glow(c, 0, -44, 80, '#f0c66d2b'); path(c, [[0,-50],[0,-105]], '#ead59318', 15); path(c, [[0,-50],[0,-105]], '#eed79a50', 2);
        for (let i = 0; i < 3; i++) { const rise = (time * .022 + i * 21) % 65; alpha(c, 1 - rise / 65, () => rect(c, Math.sin(i * 5 + time * .002) * 11, -42 - rise, 2, 4, '#f0d791')); }
        c.strokeStyle = running ? '#e5bd6c66' : '#d6d8a066'; c.lineWidth = 2; c.beginPath(); c.ellipse(0, 6, 41 + Math.sin(time * .004) * 3, 18, 0, 0, Math.PI * 2); c.stroke();
      }
      c.restore();
      const waveText = running ? `第 ${num(mission.wave, 1)} / ${num(mission.waves, 3)} 波` : mission.phase === 'prep' ? `下一波 ${Math.ceil(num(mission.prep))} 秒` : mission.phase === 'extract' ? '守夜完成' : '启动后守住三波';
      label(c, waveText, x, y - 74, lit ? '#f1d78e' : '#a9bd93', 10);
      if (lit) { bar(c, x, y + 28, 58, num(mission.progress) / Math.max(1, num(mission.total, 3)), '#d9bd77', 3); }
      label(c, nearby && active ? 'E · ' + (item.label || '启动信标') : item.label || '守夜信标', x, y + 43, nearby && active ? '#f3dfaa' : color, 9);
      return;
    } else if (kind === 'relay-extraction') {
      const delivered = !!(state.relay && state.relay.delivered), carrying = !!(p && state.relay && p.carry === state.relay.coreId);
      ellipse(c,0,8,40,20,'#112b2b');ellipse(c,0,3,37,19,'#77936e');ellipse(c,0,0,31,15,'#24483e');
      c.strokeStyle=carrying||delivered?'#ddedb8':'#8aaf92';c.lineWidth=2;c.beginPath();c.ellipse(0,0,25,12,0,0,Math.PI*2);c.stroke();
      for(let i=0;i<6;i++){const a=i*Math.PI/3;rect(c,Math.cos(a)*32-3,Math.sin(a)*16-2,6,4,'#c2ce9a');}
      for(const side of [-1,1]){rect(c,side*35-4,-43,8,47,'#33584b');rect(c,side*35-3,-43,3,42,'#a2b787');crystal(c,side*35,-46,.65,'#d0dfad');}
      glow(c,0,-21,73,carrying||delivered?'#d2e9ac30':'#a2d4bd1a');
      path(c,[[0,-4],[0,-90]],carrying||delivered?'#d8edb518':'#aedcc014',35);
      path(c,[[0,-8],[0,-91]],carrying||delivered?'#e1efbf55':'#c0dfc433',2);
      if(delivered){crystal(c,0,-34,1.4,'#ffe2a0');path(c,[[-8,-67],[-1,-60],[12,-74]],'#e1efbf',3);}
      c.restore();
      label(c,delivered?'炉芯已归位':nearby&&carrying?'E · 交付炉芯':'炉芯撤离台',x,y+39,carrying||delivered?'#e1edb8':'#a5c3a4',10);
      return;
    } else if (kind === 'extraction') {
      ellipse(c, 0, 6, 31, 14, '#16342d'); ellipse(c, 0, 3, 27, 12, active ? '#6a8c61' : '#4c6250'); ellipse(c, 0, 1, 21, 9, '#254837');
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; rect(c, Math.cos(a) * 25 - 3, Math.sin(a) * 10 - 1, 6, 4, active ? '#b2d097' : '#667e5b'); }
      rect(c, -3, -43, 6, 43, '#445f45'); rect(c, -2, -44, 3, 42, active ? '#c8d4a1' : '#7b9067');
      c.fillStyle = active ? '#a4c786' : '#637b58'; c.beginPath(); c.moveTo(1,-42); c.lineTo(25,-35); c.lineTo(4,-25); c.closePath(); c.fill();
      if (active) { glow(c, 1, -35, 55, '#a9d59220'); path(c, [[-13,-12],[-6,-19],[1,-12]], '#c4ddac', 3); path(c, [[-13,-20],[-6,-27],[1,-20]], '#c4ddac88', 2); }
    } else if (kind === 'relic') {
      ellipse(c, 0, 6, 19, 8, '#213e36'); rect(c, -14, -3, 28, 9, '#4d6753'); rect(c, -12, -6, 24, 5, '#879a72');
      const bob = Math.sin(time * .003 + x) * 3; c.translate(0, bob - 22); glow(c, 0, 0, 37, color+'22');
      if (item.buff === 'swift') {
        c.save(); c.rotate(.45); rect(c,-3,-13,6,26,'#729675');rect(c,-1,-13,2,28,'#e1e6b6');for(let i=0;i<4;i++){rect(c,-9+i*2,-10+i*5,8-i,4,'#b8cf99');rect(c,2,-9+i*5,7-i,4,'#8eb789');}c.restore();
      } else if (item.buff === 'vigor') {
        rect(c,-10,-6,20,13,'#56774f');rect(c,-7,-10,14,20,'#8cab76');rect(c,-3,-8,6,16,'#e5bd92');rect(c,-8,-3,16,6,'#e5bd92');rect(c,-2,-7,3,14,'#f5d8aa');
      } else if (item.buff === 'resonance') {
        rect(c,-4,-11,8,23,'#a78956');rect(c,-2,-10,4,21,'#f2dca1');
        for(const side of [-1,1])for(const radius of [10,17]){c.strokeStyle=radius===10?'#efd798':'#bca16c';c.lineWidth=2;c.beginPath();c.arc(0,0,radius,side>0?-.65:Math.PI-.65,side>0?.65:Math.PI+.65);c.stroke();}
      } else if (item.buff === 'riposte') {
        for(const angle of [-.7,.7]){c.save();c.rotate(angle);rect(c,-2,-16,4,29,'#a87561');rect(c,-1,-15,2,23,'#f4ddbf');rect(c,-6,6,12,3,'#d4a772');c.restore();}
        crystal(c,0,2,.55,'#f1bca0');
      } else if (item.buff === 'decoy') {
        for(const side of [-1,1]){alpha(c,side===-1?.5:1,()=>{rect(c,side*6-5,-7,10,18,'#7fbbac');rect(c,side*6-4,-14,8,8,'#cbe6cb');rect(c,side*6-7,-8,14,3,'#e1ebbe');});}
        path(c,[[-13,10],[0,15],[13,10]],'#b7e1d4',2);
      } else {
        c.save();c.rotate(Math.PI/4);rect(c,-10,-10,20,20,'#527c87');rect(c,-7,-7,14,14,'#9cc8ce');rect(c,-4,-4,8,8,'#e6eac2');c.restore();path(c,[[-17,1],[17,-2]],'#cfebe0',2);rect(c,12,-4,7,4,'#eff5c7');
      }
    }
    c.restore();
    const machine = kind==='sluice'||kind==='lift', current = state.roomEvent || {};
    const stageText = machine && current.kind===kind ? current.stage==='complete'?'已运转':current.stage==='active'?'运转中':'' : '';
    const name = stageText || (item.used ? '已回收' : item.label || (kind === 'cache' ? '物资箱' : kind==='supply-cache'?'全队补给':kind==='sluice'?'水闸手轮':kind==='lift'?'废弃升降台':kind === 'extraction' ? '撤离点' : '遗物'));
    const engine = globalThis.AdventureEngine;
    const relicHint = kind === 'relic' && nearby && active && state.mode === 'random' && engine && typeof engine.relicStyleHint === 'function' ? engine.relicStyleHint(state, item.buff) : '';
    let textY = y + (machine ? 62 : kind === 'relic' ? 25 : 30);
    if (kind === 'relic' && nearby && active && state.mode === 'random' && Math.abs(num(p.x) - x) < 105 && num(p.y) > y && num(p.y) < y + 105) {
      const lastLine = relicHint ? item.description ? 33 : 17 : item.description ? 17 : 0;
      textY = Math.max(textY, num(p.y) + 35);
      if (textY + lastLine > H - 22) textY = y - 77;
    }
    label(c, nearby && active ? 'E · ' + name : name, x, textY, item.used ? '#758f7b' : active ? color : '#7e927b', kind === 'relic' ? 9 : 10);
    if (nearby && item.description && !item.used) label(c, item.description, x, textY+17, active ? '#c6d0aa' : '#94a58c', 8);
    if (relicHint) label(c, relicHint, Math.max(170, Math.min(W - 170, x)), textY + (item.description ? 33 : 17), '#d7cce6', 8);
  }
  function refugeInteractable(c, item, time, state, localId, still) {
    const x = num(item.x), y = num(item.y), rest = item.kind === 'refuge-rest', active = item.active !== false && !item.used;
    const p = state.players && state.players[localId];
    const nearby = p && !p.downed && !p.carry && Math.hypot(num(p.x) - x, num(p.y) - y) < 76;
    time = still ? 0 : time;
    shadow(c, x, y, rest ? 33 : 25, .27);
    c.save(); c.translate(Math.round(x), Math.round(y));
    if (rest) {
      rect(c, -34, -14, 68, 36, '#3f4936'); rect(c, -32, -16, 64, 35, '#948663');
      rect(c, -28, -12, 20, 26, '#d1c397'); rect(c, -5, -13, 32, 30, active ? '#778c6b' : '#65745c');
      rect(c, -3, -13, 4, 30, '#9ca984'); rect(c, 2, 11, 25, 3, '#4b6753');
      rect(c, -36, 19, 72, 4, '#6d6447');
      if (active) { rect(c, 32, -9, 10, 15, '#a78c5f'); rect(c, 34, -12, 6, 3, '#d4bf8b'); rect(c, 35, -5, 4, 7, '#dfe2b6'); }
    } else {
      ellipse(c, 0, 13, 33, 13, '#263b30'); rect(c, -26, 0, 52, 13, '#53634b'); rect(c, -29, -6, 58, 9, '#8f9670');
      rect(c, -25, -7, 50, 3, '#bac299'); rect(c, -19, 5, 3, 9, '#a8a47a'); rect(c, 16, 5, 3, 9, '#a8a47a');
      if (active) {
        const bob = Math.sin(time * .0025) * 2;
        glow(c, 0, -23, 48, '#c9bbdc1a'); crystal(c, -10, -22 + bob, .85, '#c0b5d8'); crystal(c, 11, -19 - bob, .65, '#d6cf9e');
        path(c, [[-12, -2], [-12, 3], [12, 3], [12, -2]], '#e5d7ac', 1);
      } else { rect(c, -18, -2, 36, 3, '#56634d'); }
    }
    c.restore();
    if (nearby && active) {
      const belowPlayer = Math.abs(num(p.x) - x) < 104 && num(p.y) > y && num(p.y) < y + 70;
      const ty = Math.min(H - 34, Math.max(y + 49, belowPlayer ? num(p.y) + 32 : 0));
      const caption = 'E · ' + (item.label || (rest ? '歇息 · 全队恢复2点生命' : '借取遗物 · 放弃治疗'));
      const width = Math.min(280, caption.length * 10 + 20);
      rect(c, x - width / 2, ty - 11, width, 21, '#102823e8'); label(c, caption, x, ty, rest ? '#dce6ba' : '#e0d0eb', 10);
      label(c, '本局只能选择一项', x, ty + 17, '#b0b494', 8);
    }
  }
  function breachGeometry(state) {
    const run=state.roomEvent;
    if(state.mode!=='random'||!run||run.kind!=='breach')return null;
    const solid=values(state.walls).find(w=>w.id===run.wallId&&w.breachWall);
    if(solid)return{run,wall:solid};
    // The permanent chamber frame also describes the missing wall after a
    // revisit. No renderer history is needed to remember the collapsed gap.
    if(run.stage!=='complete')return null;
    const frame=values(state.walls).filter(w=>w.breachFrame&&num(w.w)>num(w.h)&&num(w.h)<30);
    if(frame.length<2)return null;
    const y=Math.max(...frame.map(w=>num(w.y))),bottom=frame.filter(w=>num(w.y)===y).sort((a,b)=>num(a.x)-num(b.x));
    if(bottom.length<2)return null;
    const left=bottom[0],right=bottom[bottom.length-1],x=num(left.x)+num(left.w),width=num(right.x)-x;
    if(width<=0)return null;
    return{run,wall:{x,y,w:width,h:num(left.h,18)}};
  }
  function breachCache(c,item,state,localId) {
    if(!state.roomEvent||state.roomEvent.kind!=='breach')return;
    const x=num(item.x),y=num(item.y),used=!!item.used||state.roomEvent.collected,active=item.active!==false&&!used;
    const p=state.players&&state.players[localId],near=p&&!p.downed&&Math.hypot(num(p.x)-x,num(p.y)-y)<96;
    shadow(c,x,y,26,.32);c.save();c.translate(Math.round(x),Math.round(y));
    if(!used)glow(c,0,-9,active?60:34,active?'#b6d7b828':'#b6d7b80e');
    rect(c,-27,-8,54,25,'#253d32');rect(c,-24,-8,48,22,'#7a8565');rect(c,-24,9,48,6,'#4d6651');
    rect(c,-26,used?-26:-15,52,8,'#9d9f77');rect(c,-23,used?-26:-15,46,3,'#d0cda0');
    for(const side of[-1,1])rect(c,side*19-3,-5,6,18,'#b7b98a');
    if(used){rect(c,-18,-8,36,12,'#19372c');rect(c,-17,-7,34,3,'#102c25');rect(c,-13,5,26,3,'#526c54');}
    else{
      rect(c,-12,-9,24,23,'#d3d6af');rect(c,-3,-6,6,17,'#627e65');rect(c,-8,-1,16,6,'#627e65');
      rect(c,16,-24,8,16,'#678e7a');rect(c,17,-23,3,13,'#bad1aa');rect(c,17,-27,6,4,'#d6ce9e');
      rect(c,-22,-10,10,5,'#aeb99a');
    }
    c.restore();
    // Locked supplies remain visible behind the stone, with no misleading
    // interaction invitation through that intact wall.
    if(near&&(active||used)){
      const hintY=Math.max(y+55,num(p.y)+38);
      rect(c,x-(active?88:58),hintY-12,active?176:116,active?42:24,'#102823ed');
      if(active){label(c,'E · 领取藏室补给',x,hintY,'#d8dfaf',10);label(c,'全队恢复 2 点生命',x,hintY+16,'#adbf9d',9);}
      else label(c,'补给已取走',x,hintY,'#91a58d',9);
    }
  }
  function breachWindupClear(state,guardian,wall) {
    const run=state.roomEvent;
    if(state.mode!=='random'||!run||run.kind!=='breach'||run.stage!=='ready'||guardian.id!==run.guardianId||guardian.kind!=='brute'||!guardian.elite||guardian.hp<=0)return false;
    const x=num(wall.x),y=num(wall.y),width=num(wall.w),height=num(wall.h);
    if(x<=28||y<=28||x+width>=W-28||y+height>=H-28)return false;
    const target={x:Math.max(x,Math.min(x+width,num(guardian.x))),y:Math.max(y,Math.min(y+height,num(guardian.y)))};
    const distance=Math.hypot(num(guardian.x)-target.x,num(guardian.y)-target.y);if(distance>180)return false;
    const count=Math.max(1,Math.ceil(distance/4));
    const circleRect=(px,py,w)=>{
      const nearestX=Math.max(num(w.x),Math.min(num(w.x)+num(w.w),px)),nearestY=Math.max(num(w.y),Math.min(num(w.y)+num(w.h),py));
      return(px-nearestX)*(px-nearestX)+(py-nearestY)*(py-nearestY)<4;
    };
    // Mirror the simulation's small swept ray. The broad quake footprint is
    // deliberately insufficient: intervening cover prevents this invitation.
    for(let i=0;i<=count;i++){
      const px=num(guardian.x)+(target.x-num(guardian.x))*i/count,py=num(guardian.y)+(target.y-num(guardian.y))*i/count;
      if(values(state.walls).some(w=>w!==wall&&circleRect(px,py,w))||values(state.doors).some(d=>d.locked&&circleRect(px,py,d))||
        values(state.props).some(q=>!q.destroyed&&(q.kind==='crate'||q.kind==='barrel')&&Math.hypot(num(q.x)-px,num(q.y)-py)<num(q.r)+2))return false;
    }
    return true;
  }
  function breachScene(c,state,time,localId,still) {
    const info=breachGeometry(state);if(!info)return;
    const{run,wall:w}=info,x=num(w.x),y=num(w.y),width=num(w.w),height=num(w.h),cx=x+width/2;
    if(run.stage==='complete'){
      // Rubble stays at the jambs. The clear central strip matches the newly
      // walkable collision gap and is not painted like a remaining barrier.
      for(const side of[-1,1])for(let i=0;i<4;i++){
        const px=cx+side*(width/2-4+i*3),py=y+height/2+(i%2?9:-3);
        rect(c,px-5,py-3,9-i,5+i%2,'#596d56');rect(c,px-4,py-3,7-i,2,'#98a080');
      }
      for(const [dx,dy]of[[-23,7],[17,18],[32,-1],[-38,23]])rect(c,cx+dx,y+dy,3,2,'#7d8c6a66');
      path(c,[[x+3,y-2],[x+7,y+4],[x+3,y+11],[x+5,y+height+4]],'#b2b18b',2);
      path(c,[[x+width-3,y-2],[x+width-8,y+5],[x+width-3,y+12],[x+width-6,y+height+4]],'#9fa27c',2);
      return;
    }
    const guardian=values(state.enemies).find(e=>e.id===run.guardianId&&e.hp>0&&!e.dead);
    const charged=guardian&&guardian.rhythm&&guardian.rhythm.type==='quake'&&guardian.rhythm.phase==='windup'&&breachWindupClear(state,guardian,w);
    const progress=charged?1-Math.max(0,Math.min(1,num(guardian.rhythm.remaining)/Math.max(.01,num(guardian.rhythm.duration,1)))):0;
    const fractures=[[[.13,0],[.27,.31],[.20,.55],[.36,1]],[[.68,0],[.57,.35],[.65,.69],[.51,1]],[[.27,.31],[.48,.52],[.57,.35]],[[.65,.69],[.84,.55],[.95,.78]]];
    for(const points of fractures){const a=points.map(([px,py])=>[x+px*width,y+py*height]);path(c,a,'#1a322c',4);path(c,a,charged?'#f0cf91':'#c1b88b',charged?2.5:1.5);}
    for(const px of[.05,.44,.91])rect(c,x+px*width,y+height-1,4,3,'#8f9b78');
    if(charged){
      glow(c,cx,y+height/2,58,'#e2bd6222');
      const phaseTime=still?0:time;
      for(let i=0;i<5;i++){
        const phase=((phaseTime*.0008+i*.173)%1+1)%1,px=x+width*(.12+i*.18);
        alpha(c,(.2+progress*.5)*(1-phase),()=>rect(c,px+Math.sin(i*4)*phase*7,y+height+phase*17,2,2,'#d9ca9a'));
      }
    }
    const p=state.players&&state.players[localId],px=p?Math.max(x,Math.min(x+width,num(p.x))):0,py=p?Math.max(y,Math.min(y+height,num(p.y))):0;
    if(p&&!p.downed&&Math.hypot(num(p.x)-px,num(p.y)-py)<112){
      const hintY=Math.max(y+height+39,num(p.y)+38);
      const crowded=hintX=>values(state.enemies).some(e=>!e.dead&&e.hp>0&&Math.abs(num(e.x)-hintX)<104+num(e.r,20)+16&&hintY+12>num(e.y)-num(e.r,20)-25&&hintY-12<num(e.y)+num(e.r,20)+15);
      const hintX=crowded(cx)?[Math.max(116,num(p.x)-140),Math.min(W-116,num(p.x)+140)].find(x=>!crowded(x))??cx:cx;
      rect(c,hintX-104,hintY-12,208,24,'#102823ed');
      label(c,guardian?'贴近裂墙的重砸能震开它':'守卫已倒下 · 本局无法震开',hintX,hintY,guardian?'#c8c39d':'#93a58e',10);
    }
  }
  function expeditionInteractable(c, item, time, state, localId) {
    const x = num(item.x), y = num(item.y), current = state.roomEvent || {}, kind = item.kind;
    const p = state.players && state.players[localId], nearby = p && !p.downed && Math.hypot(num(p.x)-x,num(p.y)-y) < 100;
    const forge = kind === 'forge' || kind === 'forge-reward';
    const used = forge ? !!current.collected || kind === 'forge-reward' && item.used : item.used || current.collected;
    const running = forge && current.kind === 'forge' && current.stage === 'active';
    const complete = current.stage === 'complete', active = item.active !== false && !item.used;
    if (kind === 'forge' && values(state.interactables).some(v => v.kind === 'forge-reward')) return;
    shadow(c,x,y,forge?41:kind==='storehouse-cache'?25:21,.35);
    c.save(); c.translate(Math.round(x),Math.round(y));
    if (forge) {
      // A recessed hearth, bellows and anvil make the encounter recognizable
      // without putting a permanent task list over the arena.
      ellipse(c,0,15,47,22,'#192f2b'); rect(c,-40,0,80,17,'#43574b'); rect(c,-37,0,74,4,'#849078');
      rect(c,-31,-40,62,42,'#273e35'); rect(c,-26,-35,52,34,'#645d46'); rect(c,-21,-30,42,27,'#1f3029');
      const hot = running || complete && !used;
      glow(c,0,-16,hot?92:48,hot?'#eda14b35':'#c7974e17');
      rect(c,-16,-18,32,14,used?'#4d4b35':hot?'#bb733c':'#795537');
      for (let i=0;i<4;i++) rect(c,-14+i*8,-15,5,10,used?'#796448':hot?'#f1ba66':'#af7c47');
      for (const side of [-1,1]) { rect(c,side*32-6,-34,12,37,'#7c6747'); rect(c,side*32-5,-34,3,33,'#c1935e'); }
      rect(c,-38,-42,76,8,'#a27b4e'); rect(c,-34,-42,68,3,'#d4aa6b');
      rect(c,-10,-59,20,20,'#42584b'); rect(c,-13,-61,26,5,'#78876b'); rect(c,-9,-55,18,3,'#263e33');
      // The glowing blade is the actual pending reward, rather than a loot box.
      if (complete && !used) {
        c.save(); c.translate(0,-22); c.rotate(-.23); rect(c,-3,-18,6,35,'#b8c9b7'); rect(c,-1,-18,2,33,'#fff0bc'); rect(c,-10,11,20,4,'#dfa760'); rect(c,-3,15,6,12,'#806044'); c.restore();
        glow(c,0,-28,36,'#ffcf7940');
      }
      if (running) for (let i=0;i<7;i++) {
        const phase=((time*.0006+i*.149)%1+1)%1, dx=Math.sin(i*5.7)*phase*45;
        alpha(c,(1-phase)*.8,()=>rect(c,dx,-20-phase*59,2,i%2?3:2,'#f5cd7e'));
      }
      // A hand-operated bellows sits to one side of the fire.
      path(c,[[35,-16],[55,-23],[64,-14],[54,-5],[35,-9]],'#8d6a43',4); rect(c,49,-25,17,4,'#b7955e');
    } else if (kind === 'storehouse-switch') {
      rect(c,-19,2,38,12,'#3c5547'); rect(c,-21,-4,42,7,'#899373'); rect(c,-7,-37,14,35,'#5d6952');
      rect(c,-5,-36,4,32,'#a59161');
      const open = current.breach === 'quiet' || current.breach === 'loud';
      c.save(); c.translate(0,-30); c.rotate(open?Math.PI*.25:0); c.strokeStyle=open?'#b4c99a':'#d2b275';c.lineWidth=4;c.beginPath();c.arc(0,0,14,0,Math.PI*2);c.stroke();
      for (let i=0;i<4;i++) { const a=i*Math.PI/2; path(c,[[Math.cos(a)*4,Math.sin(a)*4],[Math.cos(a)*13,Math.sin(a)*13]],'#b7a575',3); } c.restore();
      if (!open) path(c,[[-25,-36],[-30,-30],[-25,-24]],'#a8c4b0',2);
    } else {
      // Pale medical cloth and a repair wrench distinguish supplies from the
      // rough wood seal that can be broken outside the enclosure.
      rect(c,-27,-3,54,19,'#2a4037'); rect(c,-25,-13,50,28,'#658271'); rect(c,-23,-12,46,5,'#b2c9a3');
      rect(c,-25,10,50,5,'#3a5b49'); rect(c,-21,-8,6,20,'#9bb28b'); rect(c,15,-8,6,20,'#9bb28b');
      rect(c,-12,-7,24,19,used?'#788671':'#c9d4ad');
      if (!used) { rect(c,-3,-5,6,15,'#547b6e'); rect(c,-8,0,16,5,'#547b6e'); path(c,[[26,-22],[18,-13]],'#c8bc8b',4); path(c,[[24,-28],[29,-23],[26,-18],[20,-21]],'#c8bc8b',3); }
      else { rect(c,-24,-21,48,7,'#a4b995'); rect(c,-20,-13,40,4,'#243e32'); path(c,[[-8,-9],[-2,-3],[10,-15]],'#d2e3b6',3); }
      if (active && !used) glow(c,0,-6,62,'#b1dbbc25');
    }
    c.restore();
    if (!nearby) return;
    let name = '', detail = '', color = '#d8d1a4';
    if (forge) {
      name = used ? '淬火已领取' : running ? '锻炉运转中' : complete ? '领取武器淬火' : '启动锻炉';
      detail = used ? '' : running ? '击退追兵后领取' : complete ? '本局近战 +1 · 远程每轮 +1' : '引来追兵 · 本局近战 / 远程每轮伤害 +1';
      if (used) color = '#91a38b';
    } else if (kind === 'storehouse-switch') {
      name = current.breach === 'sealed' ? '转动仓门机关' : current.breach === 'quiet' ? '仓门已安静开启' : '仓门已被击碎';
      detail = current.breach === 'sealed' ? '安静开门 / 击碎封板会引来守卫' : current.stage === 'active' ? '追兵赶来 · 击退后领取存货' : '';
    } else {
      name = used ? '存货已领取' : active ? '领取仓库存货' : current.stage === 'active' ? '击退守卫后领取' : '仓库存货';
      detail = !used && active ? '全队治疗 2 · 修复远程 · 护盾 1 层' : '';
      if (!active || used) color = '#9eaf91';
    }
    const prefix = active && !used && !running ? 'E · ' : '';
    label(c,prefix+name,x,y+(forge?39:34),color,10);
    if (detail) label(c,detail,x,y+(forge?56:51),'#aebc9e',9);
  }
  function fire(c, f, time) {
    const x = num(f.x), y = num(f.y), r = num(f.r, 20);
    ellipse(c, x, y + 4, r, r * .5, '#1b2925');
    rect(c, x - r * .7, y, r * 1.3, 4, '#474439'); rect(c, x - r * .45, y - 3, r * .9, 3, '#5b4c38');
    if (f.active === false) { alpha(c, .3, () => ellipse(c, x + Math.sin(time * .001) * 5, y - 11, 6, 5, '#8fa293')); return; }
    glow(c, x, y - 8, r * 3.5, '#ed993c35');
    for (let i = 0; i < 5; i++) { const dx = (i - 2) * r * .25, flame = Math.sin(time * .012 + i * 3) * 4; rect(c, x + dx - 4, y - 8 - Math.abs(dx) * .2 + flame, 8, 11, '#b86739'); rect(c, x + dx - 3, y - 12 - Math.abs(dx) * .1 + flame, 6, 12, '#e49e47'); rect(c, x + dx - 1, y - 7 + flame, 3, 7, '#ffe4a0'); }
    for (let i = 0; i < 3; i++) { const rise = (time * .04 + i * 17) % 44; alpha(c, 1 - rise / 44, () => rect(c, x + Math.sin(rise + i) * 8, y - rise - 8, 2, 2, '#f2c16b')); }
  }

  function shadow(c, x, y, r = 14, opacity = .38) { ellipse(c, x + 2, y + 10, r * 1.05, r * .42, `rgba(5,19,24,${opacity})`); }
  function prop(c, p, time, held = false) {
    const x = num(p.x), y = num(p.y), kind = p.kind || p.type || 'crate';
    if (p.carriedBy && !held) return;
    if (kind === 'core') {
      // The furnace core is unmistakable beside brown crates and red barrels.
      // Its trail follows simulation velocity, so paused/repeated snapshots stay stable.
      if (!held) shadow(c, x, y, 19, p.thrown ? .2 : .36);
      if (p.thrown && Math.hypot(num(p.vx), num(p.vy)) > 1) {
        const a = Math.atan2(num(p.vy), num(p.vx));
        for (let i = 3; i > 0; i--) alpha(c, .25 / i, () => crystal(c, x - Math.cos(a) * i * 13, y - Math.sin(a) * i * 13 - 4, .8 - i * .12, '#ffc56e'));
      }
      c.save(); c.translate(Math.round(x), Math.round(y - 7));
      glow(c, 0, 0, held ? 48 : 62, '#f1ae482d');
      c.strokeStyle = '#9d7b4c'; c.lineWidth = 3; c.beginPath(); c.ellipse(0, 0, 18, 10, -.3, 0, Math.PI * 2); c.stroke();
      crystal(c, 0, -1, 1.65, '#f9bd68');
      path(c, [[-10,-12],[-17,-7],[-14,8],[-7,12]], '#dca65f', 3);
      path(c, [[10,-12],[17,-7],[14,8],[7,12]], '#dca65f', 3);
      rect(c,-2,-12,4,19,'#fff0ba'); rect(c,-6,-4,12,3,'#ffe0a0');
      c.restore();
      if (!held && !p.thrown) label(c, '炉芯', x, y + 26, '#f0d299', 10);
      return;
    }
    const bob = p.thrown ? Math.sin(time * .022) * 3 : 0;
    if (!held) shadow(c, x, y, num(p.r, 15), p.thrown ? .2 : .36);
    c.save(); c.translate(Math.round(x), Math.round(y - bob)); if (p.thrown) c.rotate(time * .009);
    if (kind === 'barrel' || kind === 'explosive') {
      rect(c, -12, -17, 24, 30, '#172724'); rect(c, -10, -17, 20, 28, '#955c40'); rect(c, -8, -15, 6, 24, '#ae744b'); rect(c, 5, -15, 4, 24, '#714b38');
      rect(c, -11, -13, 22, 4, '#656c50'); rect(c, -11, 3, 22, 4, '#5b654c'); rect(c, -8, -19, 16, 4, '#b58c54'); rect(c, 2, -21, 4, 3, '#d0af6d');
      rect(c, -4, -7, 8, 8, '#382e28'); rect(c, -1, -8, 3, 6, '#e0b76b'); rect(c, -4, -2, 9, 2, '#e0b76b');
      if (p.lit || p.fuse > 0) { glow(c, 3, -22, 35, '#ffb65c55'); rect(c, 1, -25 + Math.sin(time * .02) * 2, 4, 5, '#ffe3a1'); }
    } else if (kind === 'water' || kind === 'waterjar') {
      rect(c, -9, -10, 18, 21, '#183c42'); rect(c, -12, -6, 24, 13, '#355c61'); rect(c, -8, -13, 16, 25, p.charges === 0 ? '#50665e' : '#427a7c'); rect(c, -8, -12, 6, 22, p.charges === 0 ? '#7c8973' : '#6ca3a0'); rect(c, 5, -7, 5, 15, '#2e6268');
      rect(c, -6, -17, 12, 5, '#92ada2'); rect(c, -4, -18, 8, 3, '#264e53'); rect(c, -10, 8, 20, 3, '#284c50'); rect(c, -2, -5, 4, 7, '#b2d1b9'); rect(c, -4, -1, 8, 4, '#b2d1b9');
    } else if (kind === 'relic' || kind === 'loot' || kind === 'gem') {
      glow(c, 0, 0, 30, '#d5c27e22'); crystal(c, 0, Math.sin(time * .003 + x) * 2, 1, '#dfc780');
    } else {
      rect(c, -15, -14, 30, 28, '#192b25'); rect(c, -13, -15, 26, 25, '#97784d'); rect(c, -11, -12, 22, 23, '#806443'); rect(c, -10, -11, 20, 19, '#69563a');
      rect(c, -1, -10, 2, 19, '#453f2e'); rect(c, -10, -2, 20, 2, '#453f2e');
      rect(c, -13, -14, 26, 4, '#b19561'); rect(c, -13, 7, 26, 4, '#98794d'); rect(c, -13, -11, 4, 20, '#a88a56'); rect(c, 9, -11, 4, 20, '#876b47');
      for (const [px, py] of [[-11,-12],[10,-12],[-11,8],[10,8]]) rect(c, px, py, 2, 2, '#d0b779');
      if (p.eventSeal) {
        // Broad crossed planks read as a breakable warehouse closure, with
        // exactly the same ground footprint as the engine's larger crate.
        const radius=Math.max(16,num(p.r,30));
        rect(c,-radius,-14,radius*2,28,'#715d3d');rect(c,-radius,-14,radius*2,4,'#bd9a5d');rect(c,-radius,10,radius*2,4,'#a17f4d');
        for(const angle of [-.38,.38]){c.save();c.rotate(angle);rect(c,-radius+1,-3,radius*2-2,6,'#c2a16a');rect(c,-radius+3,-3,radius*2-6,2,'#dfbf81');c.restore();}
        for (const side of [-1,1]) rect(c,side*(radius-5)-1,-9,3,18,'#344b3e');
      }
    }
    c.restore();
    if (p.hp > 0 && p.maxHp && p.hp < p.maxHp) bar(c, x, y - 23, 24, p.hp / p.maxHp, '#b19b67');
  }
  function bar(c, x, y, width, ratio, color, height = 3) { rect(c, x - width / 2 - 1, y - 1, width + 2, height + 2, '#132828'); rect(c, x - width / 2, y, width, height, '#283e36'); rect(c, x - width / 2, y, width * Math.max(0, Math.min(1, ratio)), height, color); }
  function gun(c, x, y, angle, kind, color = '#b8b99a', enemy = false) {
    c.save(); c.translate(Math.round(x), Math.round(y)); c.rotate(angle || 0); const length = kind === 'scatter' ? 23 : enemy ? 14 : 17;
    rect(c, 4, -4, length, 8, '#152928'); rect(c, 6, -3, length - 2, 5, enemy ? '#aa9970' : color); rect(c, 7, -3, length - 3, 2, '#d0d5b2'); rect(c, 6, 2, 5, 5, '#735945'); rect(c, 4, -2, 4, 5, '#d6b38a');
    if (kind === 'scatter') { rect(c, length + 1, -5, 4, 9, '#52675b'); rect(c, 12, 2, 7, 3, '#8f7050'); }
    c.restore();
  }
  function blade(c, x, y, angle, guarding, striking, large = false) {
    c.save(); c.translate(x, y); c.rotate(angle);
    const length = large ? 43 : 30;
    if (striking) {
      c.strokeStyle = '#f7e5b8b0'; c.lineWidth = large ? 8 : 5;
      c.beginPath(); c.arc(0, 0, length + 9, -.85, .85); c.stroke();
      c.strokeStyle = '#fff2cd'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, length + 12, -.75, .75); c.stroke();
    }
    if (guarding) c.rotate(-.8);
    rect(c, 8, -3, length, 6, '#172b2b'); rect(c, 12, -2, length - 3, 4, '#b7c9bd');
    rect(c, 14, -2, length - 6, 1, '#f2eed0'); rect(c, length + 9, -1, 5, 2, '#f8eed1');
    rect(c, 9, -7, 4, 14, '#c7a265'); rect(c, 2, -2, 7, 4, '#776448'); rect(c, 4, -3, 5, 6, '#d4b28a');
    c.restore();
  }
  function spear(c, x, y, angle, guarding, striking) {
    c.save(); c.translate(x, y); c.rotate(angle + (guarding ? -.8 : 0));
    // Only the held polearm is drawn. The long, narrow steel head reads as a
    // thrusting weapon at half scale without resembling a second gun or blade.
    const extension = striking && !guarding ? 6 : 0;
    path(c, [[-17 + extension, 0], [46 + extension, 0]], '#152c29', 7);
    path(c, [[-15 + extension, -1], [47 + extension, -1]], '#9c7c52', 3);
    path(c, [[-13 + extension, -2], [43 + extension, -2]], '#d0b57e', 1);
    rect(c, 10 + extension, -4, 9, 8, '#c7a67b');
    rect(c, 37 + extension, -4, 8, 7, '#685d45');
    c.fillStyle = '#c7d7c8'; c.beginPath(); c.moveTo(43 + extension, -5);
    c.lineTo(66 + extension, 0); c.lineTo(43 + extension, 5); c.closePath(); c.fill();
    path(c, [[45 + extension, -3], [61 + extension, 0]], '#f4efcc', 1.5);
    rect(c, 36 + extension, 2, 3, 9, '#a9764e'); rect(c, 38 + extension, 4, 3, 7, '#cda46c');
    c.restore();
  }
  function decoy(c, d, time) {
    if (!d || num(d.ttl) <= 0) return;
    const x=num(d.x),y=num(d.y),opacity=Math.min(.42,num(d.ttl)*.6);
    alpha(c,opacity,()=>{
      ellipse(c,x,y+9,18,7,'#a8ded24d');
      rect(c,x-10,y-13,20,23,'#a8ded2');rect(c,x-7,y-30,14,17,'#d2e6c6');rect(c,x-12,y-28,24,5,'#c5e1ba');
      rect(c,x-6,y+7,4,9,'#b3d6c4');rect(c,x+3,y+7,4,9,'#b3d6c4');
      const scan=(time*.015+hash(d.id))%37;path(c,[[x-11,y-29+scan],[x+11,y-29+scan]],'#edffe3',2);
    });
  }
  function foxBody(c, fox, time, still = false, caged = false) {
    const mode = caged ? 'idle' : fox.mode, pouncing = mode === 'pounce', sniffing = mode === 'sniff', sitting = mode === 'idle';
    const clock = still ? 0 : time, side = Math.cos(num(fox.facing)) < 0 ? -1 : 1;
    const stride = mode === 'follow' ? Math.sin(clock * .022 + hash(fox.id) % 13) * 2 : pouncing ? 2 : 0;
    const wag = caged ? 0 : sniffing ? Math.sin(clock * .012) * 3 : Math.sin(clock * .004 + hash(fox.id) % 7);
    const leap = pouncing ? Math.sin(Math.max(0, Math.min(1, num(fox.assistTime) / .24)) * Math.PI) * (still ? 2 : fox.assistKind === 'counter' ? 7 : 4) : 0;
    c.save(); c.scale(side,1); c.translate(0,-leap);
    // The broad pale tail and two triangular ears stay recognizable beside
    // the coats, bronze helmets and square crates at the game's small scale.
    c.save(); c.translate(-7,sitting?1:-2); c.rotate((sitting?-.25:sniffing?.12:0)+wag*.055);
    c.fillStyle='#344842'; c.beginPath(); c.moveTo(1,1); c.lineTo(-8,-11); c.lineTo(-19,-16); c.lineTo(-23,-9); c.lineTo(-21,0); c.lineTo(-11,6); c.lineTo(-2,6); c.closePath(); c.fill();
    c.fillStyle='#a7b2aa'; c.beginPath(); c.moveTo(-1,1); c.lineTo(-9,-9); c.lineTo(-18,-13); c.lineTo(-20,-8); c.lineTo(-18,-1); c.lineTo(-10,3); c.lineTo(-2,4); c.closePath(); c.fill();
    c.fillStyle='#e4e5d8'; c.beginPath(); c.moveTo(-11,-11); c.lineTo(-18,-13); c.lineTo(-20,-8); c.lineTo(-18,-1); c.lineTo(-13,1); c.lineTo(-14,-5); c.closePath(); c.fill(); c.restore();
    if(sitting){rect(c,-7,-14,15,21,'#52665b');rect(c,-6,-14,12,18,'#aab7ad');rect(c,-4,-10,10,15,'#e4e6d8');rect(c,-8,4,8,4,'#8e9d90');rect(c,3,4,9,4,'#c7d1c2');}
    else{
      rect(c,-10,-10,22,14,'#344a42');rect(c,-9,-10,20,11,'#a7b4a8');rect(c,-8,-10,17,4,'#cbd2c4');rect(c,-6,-1,17,4,'#e0e3d2');
      for(const [x,phase] of [[-7,1],[6,-1]]){rect(c,x,1+stride*phase,4,pouncing?3:7,'#8c9c8d');rect(c,x,6+stride*phase,6,2,'#cbd4c4');}
    }
    const hx=sitting?5:sniffing?11:9,hy=sitting?-16:sniffing?-7:-13;
    c.save(); c.translate(hx,hy); if(sniffing)c.rotate(Math.sin(num(fox.facing))*side*.45);
    c.fillStyle='#354c42';c.beginPath();c.moveTo(-8,-2);c.lineTo(-8,-12);c.lineTo(-1,-6);c.lineTo(5,-12);c.lineTo(9,-2);c.lineTo(7,8);c.lineTo(-4,9);c.closePath();c.fill();
    c.fillStyle='#bdc8bb';c.beginPath();c.moveTo(-6,-2);c.lineTo(-6,-9);c.lineTo(-1,-4);c.lineTo(4,-9);c.lineTo(7,-2);c.lineTo(6,6);c.lineTo(-3,7);c.closePath();c.fill();
    rect(c,-5,-6,2,4,'#9a8e80');rect(c,3,-6,2,4,'#9a8e80');
    c.fillStyle='#edf0dd';c.beginPath();c.moveTo(-4,2);c.lineTo(5,1);c.lineTo(13,5);c.lineTo(7,9);c.lineTo(0,7);c.closePath();c.fill();
    rect(c,11,4,3,3,'#30473d');rect(c,4,-1,2,3,'#334638');rect(c,5,-1,1,1,'#eee3b9');
    // The owner's small cloth tie identifies two foxes without another HUD.
    rect(c,-5,7,10,3,fox.ownerId==='p2'?'#bd8b75':'#88b39d');
    c.restore();
    if(pouncing){path(c,[[-17,3],[-11,0],[-6,-3]],'#c6d7c064',1);path(c,[[-18,7],[-12,5]],'#c6d7c048',1);}
    c.restore();
  }
  function foxCompanion(c, fox, time, state, localId, still = false) {
    if(!fox||fox.kind!=='fox')return;
    const owner=state.players&&state.players[fox.ownerId];if(!owner)return;
    const x=num(fox.x),y=num(fox.y),crowded=values(state.players).some(p=>!p.downed&&Math.hypot(num(p.x)-x,num(p.y)-y)<33)||values(state.enemies).some(e=>e.hp>0&&!e.dead&&Math.hypot(num(e.x)-x,num(e.y)-y)<num(e.r,16)+21);
    shadow(c,x,y,10,.2);
    c.save();c.translate(Math.round(x),Math.round(y));if(crowded)c.globalAlpha*=.48;
    foxBody(c,fox,time,still);c.restore();
    const observer=state.players&&state.players[localId],peaceful=!values(state.enemies).some(e=>e.hp>0&&!e.dead&&Math.hypot(num(e.x)-x,num(e.y)-y)<180);
    if(fox.mode==='idle'&&fox.ownerId===localId&&observer&&!observer.downed&&!crowded&&peaceful&&Math.hypot(num(observer.x)-x,num(observer.y)-y)<110)label(c,String(fox.name||'灰尾狐').slice(0,12),x,y+20,'#b9ccbd',8);
  }
  function foxCage(c,item,time,state,localId,still=false){
    const x=num(item.x),y=num(item.y),p=state.players&&state.players[localId],nearby=p&&!p.downed&&Math.hypot(num(p.x)-x,num(p.y)-y)<76,used=!!item.used,active=item.active!==false&&!used;
    shadow(c,x,y,24,.3);c.save();c.translate(Math.round(x),Math.round(y));
    rect(c,-25,-3,50,18,'#273e34');rect(c,-23,-1,46,12,'#685c42');rect(c,-20,2,40,7,'#393e2e');
    rect(c,-23,-30,46,5,'#8f8056');rect(c,-22,-29,44,2,'#c1aa71');
    rect(c,-24,-28,4,34,'#536554');rect(c,20,-28,4,34,'#536554');
    for(const px of[-13,0,13])rect(c,px-1,-28,2,29,'#5a6b54');
    if(!used){c.save();c.translate(1,1);c.scale(.72,.72);foxBody(c,{id:item.id,kind:'fox',ownerId:'p1',facing:0,mode:'idle',assistTime:0},time,still,true);c.restore();}
    rect(c,-25,9,50,5,'#998254');rect(c,-24,9,48,2,'#c6ac72');
    if(used){
      // An open front, empty straw and tilted door survive return visits.
      rect(c,-17,3,7,2,'#a69561');rect(c,4,4,11,2,'#9c8c58');
      path(c,[[-22,-25],[-37,-18],[-37,13],[-22,9]],'#93a080',3);path(c,[[-29,-21],[-29,11]],'#667b63',2);
    }else{
      for(const px of[-15,-4,8,19])rect(c,px,-26,2,35,'#8c9b7d');
      rect(c,-22,-15,44,3,'#859374');rect(c,-3,-11,9,10,'#334b3c');rect(c,-1,-9,5,6,'#d0b77a');rect(c,1,-8,1,3,'#695a3d');
      rect(c,-10,-33,22,4,'#596c53');rect(c,-7,-34,16,2,'#8a9b77');
    }
    c.restore();
    if(nearby&&(active||used)){
      const caption=active?'E · '+(item.label||'打开兽笼'):'兽笼已空',width=Math.min(210,String(caption).length*10+16);
      const belowPlayer=Math.abs(num(p.x)-x)<92&&num(p.y)>y&&num(p.y)<y+70,ty=Math.min(H-22,Math.max(y+40,belowPlayer?num(p.y)+30:0));
      rect(c,x-width/2,ty-10,width,20,'#102823e8');label(c,caption,x,ty,active?'#e1d5a8':'#9aac95',active?10:9);
    }
  }
  function player(c, p, time, localId, state) {
    if (!p || p.dead) return;
    const x = num(p.x), y = num(p.y), isLocal = (p.id || '') === localId || (!localId && (p.id === 'p1' || !p.id));
    const second = p.id === 'p2' || p.color === '#f08c69', main = second ? '#bb7867' : '#8fae7d', light = second ? '#e1a179' : '#c1d09c', dark = second ? '#805e58' : '#536f56';
    const movement = Math.hypot(num(p.vx), num(p.vy)) > 3 || p.moving;
    const step = movement ? Math.sin(time * (p.sneaking ? .012 : .02)) * (p.sneaking ? .85 : 2) : Math.sin(time * .0025 + x) * .5;
    const isDash = p.dashing || p.dashTime > 0 || p.dashTimer > 0;
    shadow(c, x, y, num(p.r, 14));
    if (isDash) {
      const angle = Math.atan2(num(p.vy, Math.sin(p.facing)), num(p.vx, Math.cos(p.facing)));
      for (let i = 1; i < 4; i++) alpha(c, .2 - i * .04, () => { rect(c, x - Math.cos(angle) * i * 12 - 8, y - Math.sin(angle) * i * 12 - 18, 16, 27, light); });
    }
    if (isLocal) {
      c.strokeStyle = second ? '#dca58970' : '#bed29b65'; c.lineWidth = 1; c.setLineDash([4,4]); c.beginPath(); c.ellipse(x, y + 10, 18, 8, 0, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      rect(c, x - 3, y + 21, 6, 2, second ? '#d69d80' : '#adc98d');
    }
    if (p.downed || p.hp <= 0) {
      c.save(); c.translate(x, y); c.rotate(-.5); rect(c, -15, -3, 25, 12, '#172925'); rect(c, -12, -3, 17, 10, main); rect(c, 5, -7, 10, 12, '#ddb591'); rect(c, 3, -9, 15, 5, light); c.restore();
      const pulse = .65 + Math.sin(time * .005) * .2; alpha(c, pulse, () => { rect(c, x - 2, y - 33, 5, 14, '#e2bb79'); rect(c, x - 7, y - 29, 15, 5, '#e2bb79'); });
      label(c, '等待救援', x, y + 31, '#e6c38a', 9); return;
    }
    const blink = p.invuln > 0 && Math.floor(time / 80) % 2 === 0;
    c.save(); if (blink) c.globalAlpha = .48; c.translate(Math.round(x), Math.round(y));
    // Boots and the little traveling coat.
    rect(c, -8, 4 + step, 6, 9, '#172b29'); rect(c, 3, 4 - step, 6, 9, '#172b29');
    rect(c, -7, 4 + step, 5, 6, '#655e46'); rect(c, 3, 4 - step, 5, 6, '#655e46');
    rect(c, -11, -12, 22, 18, '#122b29'); rect(c, -9, -12, 18, 17, dark); rect(c, -8, -11, 15, 14, main); rect(c, -8, -10, 4, 13, light); rect(c, -8, 3, 16, 3, '#5e5940');
    rect(c, -12, -8 + step, 4, 11, dark); rect(c, -12, -1 + step, 4, 5, '#cfa57e');
    // Backpack, scarf and a readable silhouette at the small game scale.
    rect(c, -13, -12, 7, 12, '#344f45'); rect(c, -12, -11, 5, 4, '#9f9163');
    rect(c, -5, -15, 12, 6, '#e0b35f'); rect(c, -8, -12, 8, 3, '#c3914d'); rect(c, -7, -9, 4, 8, '#c3914d');
    rect(c, -9, -27, 19, 16, '#122a27'); rect(c, -7, -24, 15, 13, '#ddb48b'); rect(c, -7, -24, 4, 10, '#bd9470'); rect(c, -3, -15, 9, 3, '#c1956e');
    const facing = num(p.facing);
    if (Math.sin(facing) > -.6) { const look = Math.cos(facing) >= 0 ? 2 : -3; rect(c, look, -20, 2, 3, '#263b32'); rect(c, look + 5, -20, 2, 3, '#263b32'); }
    rect(c, -10, -28, 20, 7, dark); rect(c, -8, -31, 16, 7, main); rect(c, -7, -31, 12, 2, light); rect(c, -12, -23, 25, 4, light); rect(c, -11, -21, 23, 2, dark); rect(c, 4, -30, 3, 6, '#dac783');
    const melee = p.weapon === 'blade' || p.weapon === 'spear';
    if (p.weapon === 'spear') spear(c, 0, -3, facing, p.guarding, p.meleeTime > 0);
    else if (p.weapon === 'blade') blade(c, 0, -3, facing, p.guarding, p.meleeTime > 0);
    else gun(c, 0, -3, facing - (p.guarding ? .65 : 0), p.weapon, '#aebaa0');
    if (state.runUpgrades && state.runUpgrades.tempered) {
      // Warm steel follows the equipped weapon; a stowed second weapon never
      // reappears on the player's back and the HUD gains no permanent panel.
      const reach = p.weapon === 'spear' ? 62 : p.weapon === 'blade' ? 30 : p.weapon === 'scatter' ? 24 : 18;
      c.save(); c.rotate(facing - (p.guarding && !melee ? .65 : p.guarding ? .8 : 0));
      path(c,[[reach-5,-4],[reach+3,-4]],'#e8b467',1);
      rect(c,reach,-5,2,2,'#ffe0a0'); c.restore();
    }
    if (!melee && p.fireCd > (p.weapon === 'scatter' ? .48 : .155)) {
      c.save(); c.translate(Math.cos(facing) * (p.weapon === 'scatter' ? 31 : 25), -3 + Math.sin(facing) * (p.weapon === 'scatter' ? 31 : 25)); c.rotate(facing);
      rect(c,-2,-4,10,8,'#f3d496');rect(c,2,-2,10,4,'#fff3c6');rect(c,2,-7,4,14,'#f3d496');c.restore();
      if(p.weapon==='scatter')for(const side of [-1,1]){
        const angle=facing+side*.24;
        path(c,[[Math.cos(angle)*34,-3+Math.sin(angle)*34],[Math.cos(angle)*53,-3+Math.sin(angle)*53]],'#edc89090',2);
      }
    }
    c.restore();
    if (p.guarding) {
      const ready = p.guardWindow > 0, ranged = !melee, color = ranged ? '#e2af7d' : ready ? '#fff1b9' : '#9cb9af';
      c.strokeStyle = color; c.lineWidth = ranged ? 2 : ready ? 4 : 2;
      if(ranged)c.setLineDash([5,5]);
      c.beginPath(); c.arc(x, y, 24, facing - .85, facing + .85); c.stroke(); c.setLineDash([]);
      if (ready && !ranged) { c.strokeStyle = '#ffe6a650'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 29, facing - .85, facing + .85); c.stroke(); }
      else if(ready){c.strokeStyle='#e2af7d66';c.lineWidth=1;c.setLineDash([3,5]);c.beginPath();c.arc(x,y,29,facing-.85,facing+.85);c.stroke();c.setLineDash([]);}
    }
    if (p.counterTime > 0) {
      const color = p.counterKind === 'mikiri' ? '#eac2a2' : p.counterKind === 'dodge' ? '#a8ddd5' : '#f4d58c';
      c.strokeStyle = color; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 23, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p.counterTime / 1.25)); c.stroke();
      // A short-lived actionable state, rather than a permanent control reminder.
      label(c, '反击', x, y + 34, color, 10);
      const chain=Math.max(0,Math.min(4,Math.floor(num(p.parryChain))));
      if(chain>=2)for(let i=0;i<chain;i++)rect(c,x-(chain*6-2)/2+i*6,y+44,4,2,'#f3d694');
    }
    if (p.ward > 0) {
      c.strokeStyle='#d5ddab80';c.lineWidth=1;c.beginPath();c.arc(x,y-6,23,Math.PI*.12,Math.PI*.87);c.stroke();
      c.save();c.translate(x+19,y-25);c.rotate(Math.PI/4);rect(c,-4,-4,8,8,'#dce8b2');rect(c,-2,-2,4,4,'#758e70');c.restore();
    }
    if (num(p.relayBoost) > 0 && state.mode === 'relay') {
      const ratio = Math.min(1, num(p.relayBoost) / 3);
      c.strokeStyle='#f8d696';c.lineWidth=2;c.beginPath();c.ellipse(x,y+9,25,11,0,-Math.PI/2,-Math.PI/2+Math.PI*2*ratio);c.stroke();
      for(const side of [-1,1])path(c,[[x+side*24,y-2],[x+side*29,y-8],[x+side*24,y-14]],'#f8d696',2);
    }
    if (p.hp < p.maxHp) bar(c, x, y - 39, 28, p.hp / Math.max(1, p.maxHp), p.hp / p.maxHp < .3 ? '#df8e73' : '#adc98d');
    if (values(state.players).length > 1) label(c, second ? '伙伴' : isLocal ? '你' : '队长', x, y - 48, second ? '#e0ae93' : '#bdcf9f', 8);
    if (p.carry) {
      const heldProp = values(state.props).find(v => v.id === p.carry);
      if (!heldProp && state.mode === 'relay' && state.relay && p.carry === state.relay.coreId) return;
      const carried = heldProp || { kind: 'crate' };
      if (carried.kind === 'core' && state.relay && (state.relay.delivered || state.relay.coreRoom !== (state.room && state.room.index))) return;
      const ang = num(p.facing); prop(c, { ...carried, x: x + Math.cos(ang) * 22, y: y + Math.sin(ang) * 17 - 9, thrown: false }, time, true);
    }
  }

  function lanternActive(e) { return e && e.kind === 'lamplighter' && e.hp > 0 && !e.dead && num(e.stun) <= 0 && num(e.stagger) <= 0; }
  function lanternBlocked(state, x, y) {
    if (x < 31 || x > W - 31 || y < 31 || y > H - 31) return true;
    const inside = w => { const nx = Math.max(num(w.x), Math.min(num(w.x) + num(w.w), x)), ny = Math.max(num(w.y), Math.min(num(w.y) + num(w.h), y)); return (x - nx) ** 2 + (y - ny) ** 2 < 9; };
    return values(state.walls).some(inside) || values(state.doors).some(d => d.locked && inside(d));
  }
  function lanternLineClear(state, a, b) {
    // Same radius and sampling as the simulation. Low movable props do not
    // cut the lamp's protection, whereas walls and closed doors do.
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 20));
    for (let i = 1; i < n; i++) if (lanternBlocked(state, a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n)) return false;
    return true;
  }
  function lanternSource(state, target) {
    const engine = globalThis.AdventureEngine;
    if (engine && typeof engine.lanternSource === 'function') return engine.lanternSource(state, target);
    if (!target || target.hp <= 0 || target.dead || target.kind === 'lamplighter' || target.kind === 'boss') return null;
    return values(state.enemies).find(e => lanternActive(e) && Math.hypot(num(e.x) - num(target.x), num(e.y) - num(target.y)) <= 165 && lanternLineClear(state, e, target)) || null;
  }
  function lanternAuras(c, state) {
    const active = values(state.enemies).filter(lanternActive);
    if (!active.length) return;
    for (const e of active) {
      const x = num(e.x), y = num(e.y), rim = [];
      // Clip the faint pool to visible floor. A circle painted through a wall
      // would suggest that enemies on the other side were still protected.
      for (let i = 0; i < 72; i++) {
        const a = i * Math.PI / 36, dx = Math.cos(a), dy = Math.sin(a); let reach = 165;
        for (let d = 4; d <= 165; d += 4) if (lanternBlocked(state, x + dx * d, y + dy * d)) { reach = Math.max(0, d - 4); break; }
        rim.push([x + dx * reach, y + dy * reach]);
      }
      c.fillStyle = '#e4b9770a'; c.beginPath(); rim.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); c.fill();
      c.save(); c.setLineDash([3, 7]); path(c, rim.concat([rim[0]]), '#d6bd8037', 1); c.restore();
    }
    for (const target of values(state.enemies)) {
      if (target.hp <= 0 || target.dead) continue;
      const source = lanternSource(state, target); if (!source) continue;
      path(c, [[num(source.x), num(source.y)], [num(target.x), num(target.y)]], '#d6bc7c32', 1);
      ellipse(c, num(target.x), num(target.y) + 7, num(target.r, 15) + 5, (num(target.r, 15) + 5) * .46, '#e1c58b13');
      c.strokeStyle = '#ddc68b94'; c.lineWidth = 1.5; c.beginPath(); c.arc(num(target.x), num(target.y) - 4, num(target.r, 15) + 5, -.8, .8); c.stroke();
    }
  }

  const chapterEnemyNames = { chaser: '巡炉刀兵', shooter: '炉火枪兵', shield: '执盾守卫', charger: '搬运撞兽',
    duelist: '守刃监工', brute: '重装炉卫', pyromancer: '提灯司炉者', boss: '炉心守卫' };
  const motionClamp = value => Math.max(0, Math.min(1, value));
  const motionEase = value => { const p = motionClamp(value); return p * p * (3 - 2 * p); };
  const ordinaryWindup = { chaser: .36, shooter: .6, ranged: .6, shield: .85, charger: .85 };
  const ordinaryCooldown = { chaser: .9, shooter: 1.3, ranged: 1.3, shield: 1.65, charger: 1.7 };
  function enemyPose(e, motion = {}, reduced = false) {
    const rhythm = e.rhythm, kind = e.kind || e.type, stunned = num(e.stun) > 0 || num(e.stagger) > 0;
    const locked = rhythm || num(e.windup) > 0 || num(e.chargeTime) > 0 || num(motion.release) > 0;
    const aim = Math.atan2(num(e.aimY, num(e.y)) - num(e.y), num(e.aimX, num(e.x) + 100) - num(e.x));
    const attackFacing = rhythm ? num(rhythm.angle, num(e.facing)) : num(e.chargeTime) > 0 ? Math.atan2(num(e.chargeY), num(e.chargeX, 1)) : locked ? num(e.windup) > 0 || num(motion.release) > 0 ? aim : num(e.facing) : num(motion.facing, num(e.facing));
    // A shield's front is gameplay geometry. Unlike a cosmetic body turn it
    // must never lead or trail its real defense arc while its gun takes aim.
    const facing = kind === 'shield' ? num(e.facing) : attackFacing;
    let phase = 'idle', type = '', progress = 0;
    if (rhythm) {
      phase = rhythm.phase; type = rhythm.type;
      progress = motionClamp(1 - num(rhythm.remaining) / Math.max(.001, num(rhythm.duration, 1)));
    } else if (num(e.chargeTime) > 0) {
      phase = 'active'; type = 'rush'; progress = motionClamp(1 - num(e.chargeTime) / .65);
    } else if (num(e.windup) > 0) {
      phase = 'windup'; type = kind === 'charger' ? 'rush' : kind === 'chaser' ? 'combo' : 'shot';
      progress = motionClamp(1 - num(e.windup) / (ordinaryWindup[kind] || .78));
    } else if (num(motion.release) > 0 && !stunned) {
      // The first rendered release frame is already the authoritative hit.
      // Only its follow-through is retained, never a delayed visual windup.
      type = kind === 'chaser' ? 'combo' : 'shot';
      const age = .28 - motion.release;
      phase = age < .075 ? 'active' : 'recover';
      progress = phase === 'active' ? motionClamp(age / .075) : motionClamp((age - .075) / .205);
    }
    if (stunned) { phase = 'stagger'; type = ''; progress = 0; }
    const winding = phase === 'windup', active = phase === 'active', recovering = phase === 'recover';
    const p = motionEase(progress), side = rhythm && num(rhythm.beat, 1) % 2 === 0 ? -1 : 1;
    const attack = winding || active || recovering;
    const walking = !attack && !stunned && !!motion.moving && !reduced;
    const step = walking ? Math.sin(num(motion.walk)) * (kind === 'brute' || kind === 'boss' ? 2.8 : 2.3) : 0;
    const pose = { facing, step, bob: walking ? -Math.abs(Math.sin(num(motion.walk))) * 1.2 : 0,
      tilt: walking ? Math.sin(num(motion.walk)) * .025 : 0,
      turn: Math.cos(facing) * .025,
      phase, type, progress, side, weaponAngle: facing, gunAngle: kind === 'shield' && attack ? aim : facing,
      reach: 0, lift: 0, recoil: 0, brace: 0 };
    if (type === 'quake') {
      // Strike damage resolves on the first active tick, so both fists must
      // already be down then rather than finishing their fall after the hit.
      pose.lift = winding ? motionEase(Math.min(1, progress * 1.4)) : recovering ? -(.7 * (1 - p)) : 0;
      pose.brace = winding ? p * .7 : active ? 1 : recovering ? (1 - p) * .8 : 0;
      pose.bob += winding ? 1.5 * p : active ? 3 : recovering ? 2 * (1 - p) : 0;
      const raiseTurn = Math.atan2(Math.sin(-Math.PI / 2 - facing), Math.cos(-Math.PI / 2 - facing));
      pose.weaponAngle = winding ? facing + raiseTurn * motionEase(Math.min(1, progress * 1.4)) : active ? facing : facing + side * .65 * (1 - p);
    } else if (type === 'rush') {
      pose.brace = winding ? p : active ? 1 : recovering ? (1 - p) : 0;
      pose.bob += pose.brace * 1.5;
      pose.tilt += Math.cos(facing) * (active ? .035 : -.025 * p);
      pose.reach = winding ? -4 * p : active ? 5 : 0;
      // The feet pump only while a charging body actually changes position.
      if (active && motion.moving && !reduced) pose.step = Math.sin(num(motion.walk) * 1.4) * 3;
    } else if (type === 'thrust' || type === 'hook') {
      pose.reach = winding ? -9 * p : active ? 13 : recovering ? 10 * (1 - p) : 0;
      pose.brace = winding ? p * .8 : active ? 1 : recovering ? .5 * (1 - p) : 0;
      pose.tilt += Math.cos(facing) * (winding ? -.02 * p : active ? .03 : recovering ? .02 * (1 - p) : 0);
      pose.lift = type === 'hook' && winding ? .5 * p : 0;
    } else if (type === 'combo' || type === 'sweep') {
      const swing = type === 'sweep' ? 1.35 : 1.0;
      pose.weaponAngle = facing + (winding ? side * (-.2 - swing * p) : active ? side * swing * p : recovering ? side * swing * (1 - p) : 0);
      pose.reach = winding ? -3 * p : active ? 5 : recovering ? 3 * (1 - p) : 0;
      pose.tilt += winding ? -side * .025 * p : active ? side * .03 : recovering ? side * .02 * (1 - p) : 0;
      pose.brace = winding ? p * .5 : active ? .8 : recovering ? .5 * (1 - p) : 0;
    } else if (type === 'shot' || type === 'fireball') {
      pose.lift = winding ? p * (type === 'fireball' ? 1 : .25) : recovering ? .2 * (1 - p) : 0;
      pose.recoil = active ? 5 * (1 - p * .7) : recovering ? 2 * (1 - p) : 0;
      pose.reach = winding ? 3 * p : -pose.recoil;
      pose.brace = winding ? p * .4 : active ? .6 : recovering ? .3 * (1 - p) : 0;
      pose.tilt -= Math.cos(facing) * pose.recoil * .005;
    }
    if (stunned) { pose.bob = 2; pose.tilt = -.035; }
    if (reduced) { pose.step = 0; pose.bob = 0; pose.tilt = 0; pose.turn = 0; }
    return pose;
  }
  function enemyMotionFrame(c, state, options = {}) {
    const room = state.room || {}, time = num(state.time), paused = !!options.paused;
    const key = [state.seed, state.mode, !!state.practice, room.id, room.index].join(':');
    let history = enemyMotionCache.get(c);
    if (!history || history.key !== key || time < history.time || time === 0 && history.time !== 0) {
      history = { key, time, enemies: new Map() }; enemyMotionCache.set(c, history);
    }
    const dt = Math.max(0, time - history.time), poses = new Map(), live = new Set();
    for (const e of values(state.enemies)) {
      if (!e || num(e.hp) <= 0 || e.dead) continue;
      const id = e.id, x = num(e.x), y = num(e.y); live.add(id);
      let entry = history.enemies.get(id);
      if (!entry || entry.kind !== (e.kind || e.type)) {
        entry = { kind: e.kind || e.type, x, y, facing: num(e.facing), walk: (Math.abs(hash(id)) % 13) * .2,
          moving: false, windup: num(e.windup), cooldown: num(e.attackCd), firedAt: -100 };
        history.enemies.set(id, entry);
      }
      if (dt > 0) {
        const distance = Math.hypot(x - entry.x, y - entry.y), stable = distance < 96 && dt <= .6;
        const movement = !paused && stable && distance > .025 && !num(e.stun) && !num(e.stagger);
        if (!paused) entry.moving = movement;
        if (movement) entry.walk += distance / (e.kind === 'boss' || e.kind === 'brute' ? 9 : 6);
        const releaseAge = num(ordinaryCooldown[e.kind || e.type]) - num(e.attackCd);
        // A delayed guest snapshot must not make an old shot look newly fired.
        // The live cooldown places follow-through at its actual release age.
        if (!paused && stable && entry.windup > 0 && num(e.windup) <= 0 && !e.rhythm && !num(e.stun) && !num(e.stagger) && num(e.attackCd) > entry.cooldown + .1 && releaseAge >= -1e-6 && releaseAge < .28) entry.firedAt = time - Math.max(0, releaseAge);
        const delta = Math.atan2(Math.sin(num(e.facing) - entry.facing), Math.cos(num(e.facing) - entry.facing));
        if (!paused) entry.facing += delta * Math.min(1, dt * 13);
        entry.x = x; entry.y = y; entry.windup = num(e.windup); entry.cooldown = num(e.attackCd);
      }
      const age = time - entry.firedAt;
      poses.set(id, enemyPose(e, { facing: entry.facing, walk: entry.walk, moving: entry.moving,
        release: age >= 0 && age < .28 ? .28 - age : 0 }, !!options.reducedMotion));
    }
    for (const id of history.enemies.keys()) if (!live.has(id)) history.enemies.delete(id);
    history.time = time;
    return poses;
  }
  function enemyBlade(c, e, pose, large = false) {
    const active = pose.phase === 'active', winding = pose.phase === 'windup';
    const reach = pose.reach, facing = pose.facing;
    const x = Math.cos(facing) * reach, y = -3 + Math.sin(facing) * reach * .65 - Math.max(0, pose.lift) * 22;
    path(c, [[Math.cos(facing) * 7, -9], [x + Math.cos(pose.weaponAngle) * 6, y + Math.sin(pose.weaponAngle) * 6]], '#8f987b', large ? 7 : 5);
    blade(c, x, y, pose.weaponAngle, false, active && pose.type !== 'thrust', large);
    if (winding && pose.type === 'thrust') rect(c, x - 2, y - 3, 5, 6, '#d6bb86');
  }
  function enemyGun(c, pose, color = '#c8ae79') {
    const facing = num(pose.gunAngle, pose.facing);
    const x = Math.cos(facing) * pose.reach, y = -3 + Math.sin(facing) * pose.reach * .65 - pose.lift * 8;
    path(c, [[Math.cos(facing) * 5, -10], [x + Math.cos(facing) * 7, y + Math.sin(facing) * 7]], '#99876a', 5);
    gun(c, x, y, facing, 'pistol', color, true);
  }
  function quakeArms(c, pose, chapter = false, boss = false) {
    const down = pose.phase === 'active' || pose.phase === 'recover', lift = Math.max(0, pose.lift);
    const top = -21 - lift * 31 + (down ? 11 * (pose.phase === 'recover' ? 1 - motionEase(pose.progress) : 1) : 0);
    for (const side of [-1, 1]) {
      const x = side * (boss ? 31 : 28), hand = top + (down ? 16 : 0);
      path(c, [[side * 20, -19], [x, top + 8], [x + (down ? side * 3 : 0), hand]], chapter ? '#7e6650' : '#66765b', 11);
      rect(c, x - 8, hand - 5, 17, 13, chapter ? '#a2744d' : '#b1aa7b');
      rect(c, x - 7, hand - 5, 15, 3, chapter ? '#d09c60' : '#d2c694');
    }
  }
  function chapterConstruct(c, e, time, step, pose) {
    const kind = e.kind, attack = e.rhythm || {}, facing = pose.facing;
    const large = kind === 'brute', low = kind === 'charger', width = large ? 44 : low ? 38 : kind === 'shield' ? 28 : 24;
    const top = large ? -26 : low ? -13 : -17, height = large ? 36 : low ? 25 : 26;
    const stone = '#67716b', lightStone = '#98a08c', darkStone = '#3e5048', copper = '#9e6947', brightCopper = '#cb965e', amber = '#f4be6b';
    if (low) {
      // A squat load carrier with four piston legs and forked copper tusks.
      for (const side of [-1, 1]) for (const end of [-1, 1]) {
        const x = side * 16, y = end * 6 + 7 + step * side * end;
        rect(c, x - 5, y - 3, 10, 13, '#1c302a'); rect(c, x - 4, y - 2, 8, 8, copper); rect(c, x - 3, y - 2, 3, 6, brightCopper);
      }
    } else {
      for (const side of [-1, 1]) {
        const x = side * (large ? 13 : 7), y = 6 + step * side;
        rect(c, x - (large ? 6 : 4), y, large ? 12 : 8, large ? 16 : 12, '#1b302a');
        rect(c, x - (large ? 5 : 3), y, large ? 10 : 6, large ? 11 : 8, darkStone);
        rect(c, x - (large ? 5 : 3), y + 2, large ? 10 : 6, 3, copper);
      }
    }
    rect(c, -width / 2 - 3, top - 2, width + 6, height + 3, '#172e2b');
    rect(c, -width / 2, top, width, height, stone); rect(c, -width / 2 + 1, top + 1, 6, height - 2, lightStone);
    rect(c, width / 2 - 7, top + 2, 7, height - 3, darkStone);
    rect(c, -width / 2, top + height - 8, width, 5, copper); rect(c, -width / 2, top + height - 8, width, 2, brightCopper);
    for (const side of [-1, 1]) { rect(c, side * (width / 2 - 5) - 1, top + 3, 3, 3, brightCopper); rect(c, side * (width / 2 - 5) - 1, top + height - 6, 2, 2, '#e1bc80'); }
    // Every construct shares an inset amber furnace, never an exposed face.
    const coreY = low ? -3 : -7, coreW = large ? 18 : 11;
    rect(c, -coreW / 2 - 3, coreY - 6, coreW + 6, 16, '#29352d'); rect(c, -coreW / 2 - 1, coreY - 5, coreW + 2, 13, copper);
    rect(c, -coreW / 2 + 1, coreY - 3, coreW - 2, 9, amber); rect(c, -2, coreY - 3, 3, 9, '#ffe6aa');
    for (let i = -1; i <= 1; i++) rect(c, i * 5 - 1, coreY - 5, 2, 13, '#5c4c36');
    if (attack.phase === 'windup') glow(c, 0, coreY, large ? 38 : 26, '#efad5225');
    if (!low) {
      const headY = large ? -45 : kind === 'pyromancer' ? -39 : -35, headW = large ? 29 : 22;
      rect(c, -headW / 2 - 2, headY, headW + 4, 23, '#1b302b'); rect(c, -headW / 2, headY + 1, headW, 20, stone);
      rect(c, -headW / 2 + 1, headY + 2, 5, 17, lightStone); rect(c, headW / 2 - 5, headY + 2, 5, 17, darkStone);
      rect(c, -headW / 2 - 3, headY, headW + 6, 5, copper); rect(c, -headW / 2 - 2, headY, headW + 4, 2, brightCopper);
      rect(c, -headW / 2 + 2, headY + 9, headW - 4, 5, '#24372f'); rect(c, -headW / 2 + 4, headY + 10, headW - 8, 2, amber);
      rect(c, -headW / 2 + 4, headY + 18, headW - 8, 2, copper);
    } else {
      rect(c, -17, -20, 34, 10, copper); rect(c, -15, -19, 30, 3, brightCopper); rect(c, -10, -16, 20, 3, '#f4be6b');
    }
    if (kind === 'chaser' || kind === 'duelist') {
      if (kind === 'duelist') {
        rect(c, -16, -22, 32, 6, copper); rect(c, -18, -25, 12, 6, brightCopper); rect(c, 7, -25, 12, 6, brightCopper);
        rect(c, -3, -48, 6, 14, copper); rect(c, -2, -50, 4, 8, '#e6bd76');
      }
      enemyBlade(c, e, pose, kind === 'duelist');
    } else if (kind === 'shooter') {
      rect(c, -19, -25, 8, 19, '#34473b'); rect(c, -18, -27, 6, 4, copper);
      for (let y = -22; y < -9; y += 4) rect(c, -18, y, 6, 2, brightCopper);
      enemyGun(c, pose, brightCopper);
    } else if (kind === 'shield') {
      enemyGun(c, { ...pose, reach: pose.reach + 7 }, brightCopper);
      c.save(); c.translate(Math.cos(facing) * (17 + pose.reach * .35), -3 + Math.sin(facing) * 12 - pose.lift * 6); c.rotate(facing);
      rect(c, -5, -20, 11, 40, '#22382f'); rect(c, -3, -19, 9, 38, copper); rect(c, -2, -18, 3, 36, brightCopper);
      for (const y of [-13, 0, 13]) { rect(c, -3, y - 2, 9, 4, '#d7b37b'); }
      rect(c, 1, -6, 4, 12, '#5f5f4b'); c.restore();
    } else if (low) {
      for (const side of [-1, 1]) {
        const sx = Math.cos(facing) * 18 + Math.cos(facing + Math.PI / 2) * side * 12;
        const sy = -1 + Math.sin(facing) * 13 + Math.sin(facing + Math.PI / 2) * side * 8;
        path(c, [[sx, sy], [sx + Math.cos(facing) * 19, sy + Math.sin(facing) * 15]], copper, 7);
        path(c, [[sx, sy - 2], [sx + Math.cos(facing) * 19, sy + Math.sin(facing) * 15 - 2]], brightCopper, 3);
      }
      rect(c, -10, -26, 20, 6, darkStone); for (let x = -7; x <= 7; x += 7) rect(c, x, -28, 3, 6, copper);
    } else if (large) {
      for (const side of [-1, 1]) {
        if (pose.type === 'quake') {
          rect(c, side * 22 - 6, -24, 12, 4, brightCopper);
        } else {
          const y = -17 + step * side;
          rect(c, side * 27 - 7, y, 14, 26, darkStone); rect(c, side * 27 - 9, y - 4, 18, 14, stone);
          rect(c, side * 27 - 9, y - 4, 18, 4, brightCopper); rect(c, side * 27 - 6, y + 6, 12, 7, copper);
        }
      }
      if (pose.type === 'quake') quakeArms(c, pose, true);
      rect(c, -18, -29, 36, 6, copper); rect(c, -15, -29, 30, 2, brightCopper);
      for (const side of [-1, 1]) { rect(c, side * 12 - 3, -53, 6, 12, '#3e5048'); rect(c, side * 12 - 2, -53, 4, 3, copper); }
    } else if (kind === 'pyromancer') {
      rect(c, -15, 5, 30, 8, '#46574b'); rect(c, -12, 8, 24, 5, copper);
      rect(c, -16, -42, 32, 5, copper); rect(c, -19, -38, 38, 4, brightCopper);
      const handX = Math.cos(facing) * (22 + pose.reach), handY = -4 + Math.sin(facing) * 13 - pose.lift * 24;
      path(c, [[Math.cos(facing) * 9, -8], [handX, handY]], copper, 6);
      rect(c, handX - 2, handY - 43, 4, 57, '#594c35'); rect(c, handX - 1, handY - 43, 2, 53, '#bd945c');
      rect(c, handX - 14, handY - 45, 28, 4, brightCopper); lantern(c, handX, handY - 26, time, .8);
    }
  }
  function enemy(c, e, time, events = [], still = false, chapter = false, random = false, pose = null) {
    if (!e || e.hp <= 0 || e.dead) return;
    const x = num(e.x), y = num(e.y), kind = e.kind || e.type, boss = kind === 'boss', r = num(e.r, boss ? 27 : 15);
    const recovering = boss && e.rhythm && e.rhythm.phase === 'recover' && num(e.stagger) <= 0;
    const overload = random && recovering && e.stage >= 2 && e.rhythm.type === 'quake' && num(e.rhythm.beats) === 2 && num(e.rhythm.beat) === 2 && num(e.weakTime) > 0;
    pose = pose || enemyPose(e);
    const step = pose.step, facing = pose.facing;
    // Furnace flicker and hanging equipment share the simulation clock passed
    // by draw; pausing or repeating a guest snapshot preserves their position.
    shadow(c, x, y, r, .43);
    if (recovering) {
      // This small mint opening belongs to the body, not an attack footprint.
      // Its arc drains with the authoritative recovery timer on every client.
      const left = Math.max(0, Math.min(1, num(e.rhythm.remaining) / Math.max(.01, num(e.rhythm.duration, 1))));
      ellipse(c, x, y + 9, r + 13, (r + 13) * .42, '#aadac51b');
      c.strokeStyle = '#b9e4c1a8'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(x, y + 9, r + 14, (r + 14) * .42, 0, -.5 * Math.PI, -.5 * Math.PI + Math.PI * 2 * left); c.stroke();
      for (const side of [-1, 1]) path(c, [[x + side * (r + 21), y - 4], [x + side * (r + 15), y + 2], [x + side * (r + 21), y + 8]], '#c5e8c6', 2);
    }
    if (e.elite && !boss) {
      glow(c, x, y - 12, 47, '#e4b96b1f');
      c.strokeStyle = '#dbb66c90'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(x, y + 6, r + 7, (r + 7) * .47, 0, 0, Math.PI * 2); c.stroke();
    }
    if (e.windup > 0 && !e.rhythm) {
      if (e.attack === 'ring') {
        const rr = boss ? 104 : 38;
        ellipse(c, x, y + 5, rr, rr * .65, '#e696631b'); c.strokeStyle = '#de947a'; c.lineWidth = 2; c.setLineDash([6,5]); c.beginPath(); c.ellipse(x, y + 5, rr, rr * .65, 0, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      } else {
        const angle = Math.atan2(num(e.aimY, y) - y, num(e.aimX, x + 100) - x), length = boss ? 550 : kind === 'shooter' ? 500 : kind === 'charger' ? 360 : 60;
        const tx = x + Math.cos(angle) * length, ty = y + Math.sin(angle) * length;
        path(c, [[x,y],[tx,ty]], kind === 'charger' ? '#ef8d702b' : '#d0876a22', boss ? 18 : kind === 'charger' ? 29 : 9); c.setLineDash([7,5]); path(c, [[x,y],[tx,ty]], kind === 'charger' ? '#ffb692cc' : '#eea17b9c', 2); c.setLineDash([]);
      }
    }
    if ((kind === 'charger' || kind==='brute') && (e.chargeTime > 0 || e.rhythm && e.rhythm.type==='rush' && e.rhythm.phase==='active')) { const a = e.rhythm ? num(e.rhythm.angle) : Math.atan2(num(e.chargeY), num(e.chargeX, 1)); path(c, [[x - Math.cos(a) * 46, y - Math.sin(a) * 46],[x,y]], '#e6ab7470', kind==='brute'?28:18); }
    const impact = events.find(({ event, age }) => event.enemyId === e.id && age <= .13 && ['enemy-hit','weakpoint-hit','environment-hit'].includes(event.type));
    c.save(); c.translate(Math.round(x), Math.round(y));
    c.translate(0, pose.bob); c.rotate(pose.tilt); c.transform(1, 0, pose.turn, 1, 0, 0);
    if (impact && !still) {
      const recoil = (1 - impact.age / .13) * (impact.event.type === 'weakpoint-hit' ? 3 : 1.7);
      c.translate(Math.cos(num(e.facing)) * -recoil, Math.sin(num(e.facing)) * -recoil);
    }
    if (chapter && !boss) {
      chapterConstruct(c, e, time, step, pose);
    } else if (boss) {
      const awakened = e.stage >= 2;
      glow(c, 0, -12, awakened?76:56, awakened?'#ef8b4532':'#cfa66217');
      rect(c, -21, 5 + step, 15, 16, '#192c2b'); rect(c, 8, 5 - step, 15, 16, '#192c2b'); rect(c, -20, 6 + step, 13, 12, '#62725c'); rect(c, 9, 6 - step, 13, 12, '#62725c');
      rect(c, -25, -24, 50, 34, '#142b29'); rect(c, -21, -23, 43, 31, '#71836a'); rect(c, -20, -21, 10, 28, '#8c9b7b'); rect(c, 10, -21, 11, 28, '#526a56'); rect(c, -16, -12, 33, 17, '#4e6552');
      if (pose.type === 'quake') {
        rect(c, -31, -26, 14, 7, '#7e8b6a'); rect(c, 19, -26, 14, 7, '#718363');
      } else {
        rect(c, -31, -26 + step, 14, 27, '#7e8b6a'); rect(c, -34, -22 + step, 5, 21, '#475f4b'); rect(c, 19, -26 - step, 14, 27, '#718363'); rect(c, 30, -22 - step, 5, 21, '#405947');
      }
      rect(c, -17, -47, 34, 25, '#162d2b'); rect(c, -15, -45, 30, 23, '#7f8f70'); rect(c, -13, -45, 8, 20, '#a1ad84'); rect(c, 7, -45, 8, 20, '#5a7257'); rect(c, -20, -45, 40, 7, '#596f52'); rect(c, -12, -49, 24, 5, '#a1ad78');
      rect(c, -10, -35, 7, 4, '#e7b96d'); rect(c, 4, -35, 7, 4, '#e7b96d'); rect(c, -8, -26, 16, 3, '#334b3e');
      c.save(); c.rotate(Math.PI / 4); rect(c, -6, -7, 12, 12, '#c8ab63'); rect(c, -3, -4, 6, 6, '#eee0a0'); c.restore();
      grass(c, -12, -48, '#9cab6b'); grass(c, 12, -42, '#879f63');
      if(awakened){
        rect(c,-12,-18,24,22,'#302e25');rect(c,-9,-16,18,19,'#c3713f');rect(c,-5,-14,10,16,'#e8a355');rect(c,-2,-12,4,12,'#ffe3a1');
        for(const side of [-1,1]){path(c,[[side*10,-17],[side*17,-12],[side*15,-3],[side*21,2]],'#f4bb6f',2);rect(c,side*7-3,-36,6,4,'#ffe0a0');}
        for(let i=0;i<3;i++){const rise=(time*.024+i*13)%31;alpha(c,1-rise/31,()=>rect(c,-9+i*9,y%3-25-rise,2,3,'#eab36d'));}
      }
      if (overload) {
        // The final shock has opened the real, consumable weak point. Use the
        // chest rather than a second floor warning to separate it from danger.
        glow(c, 0, -8, 41, '#b2f2dc3a');
        rect(c, -11, -17, 22, 22, '#334b42'); rect(c, -8, -16, 16, 19, '#86c9b3'); rect(c, -4, -14, 8, 15, '#dbffe0');
        for (const side of [-1, 1]) path(c, [[side * 12, -19], [side * 18, -14], [side * 18, 3], [side * 12, 8]], '#b4e3c7', 2);
      }
      if (recovering) { glow(c, 0, -9, 33, '#b4e5c527'); rect(c, -5, -13, 10, 14, '#b9dcb4'); rect(c, -2, -11, 4, 10, '#f0f3cf'); }
      if (pose.type === 'quake') quakeArms(c, pose, false, true);
    } else if (kind === 'lamplighter') {
      const active = lanternActive(e), side = Math.cos(facing) < 0 ? -1 : 1;
      if (!active) c.rotate(-.13);
      // A low cloth hood, copper shoulder and one hanging square lantern make
      // this small supporter distinct from the tall, pointed fireball caster.
      rect(c, -9, 4 + step, 6, 10, '#1b302b'); rect(c, 4, 4 - step, 6, 10, '#1b302b');
      rect(c, -8, 5 + step, 5, 6, '#775b45'); rect(c, 4, 5 - step, 5, 6, '#775b45');
      c.fillStyle = '#766c51'; c.beginPath(); c.moveTo(-9, -18); c.lineTo(9, -18); c.lineTo(14, 9); c.lineTo(-13, 9); c.closePath(); c.fill();
      rect(c, -9, -16, 6, 23, '#aaa17a'); rect(c, 6, -14, 5, 22, '#514f3d'); rect(c, -11, 3, 23, 4, '#9b754d');
      rect(c, -11, -17, 8, 6, '#b08451'); rect(c, 5, -17, 8, 6, '#936643'); rect(c, -11, -17, 8, 2, '#d1aa6c');
      rect(c, -10, -30, 20, 18, '#263b2f'); rect(c, -8, -29, 16, 16, '#928063'); rect(c, -7, -28, 5, 13, '#b9a07a');
      rect(c, -9, -24, 18, 11, '#2a3b30'); rect(c, -5, -22, 3, 2, '#dbbd7c'); rect(c, 3, -22, 3, 2, '#dbbd7c');
      rect(c, -12, -30, 24, 5, '#b38f60'); rect(c, -10, -33, 20, 4, '#89734f'); rect(c, -5, -34, 10, 3, '#c3a571');
      const handX = side * 19 + step * .45, handY = (active ? -7 : 0) + Math.abs(step) * .5;
      path(c, [[side * 8, -13], [handX, handY]], '#ae8a60', 5); rect(c, handX - 3, handY - 3, 6, 6, '#ddba83');
      path(c, [[handX, handY], [handX, handY + 7]], '#c9ad71', 2);
      if (active) lantern(c, handX, handY + 14, still ? 0 : time, .62);
      else { rect(c, handX - 5, handY + 7, 10, 13, '#5d5c43'); rect(c, handX - 3, handY + 9, 6, 8, '#847756'); rect(c, handX - 6, handY + 6, 12, 2, '#b7a472'); }
    } else if (kind === 'hookwarden') {
      const attack=e.rhythm||{},casting=attack.type==='hook'&&attack.phase==='windup',side=Math.cos(facing)<0?-1:1;
      rect(c,-12,4+step,8,13,'#1b302b');rect(c,5,4-step,8,13,'#1b302b');rect(c,-11,5+step,7,8,'#a08659');rect(c,5,5-step,7,8,'#84764f');
      rect(c,-17,-18,34,28,'#1c352e');rect(c,-14,-17,28,25,'#6a7767');rect(c,-13,-16,8,22,'#a3a786');rect(c,6,-15,8,22,'#435f52');
      rect(c,-18,-18,10,12,'#9c6d46');rect(c,8,-18,10,12,'#9c6d46');rect(c,-17,-18,8,3,'#d0a569');rect(c,9,-18,8,3,'#c39259');
      rect(c,-13,3,27,5,'#97764c');rect(c,-3,3,7,7,'#c7a66d');
      // The broad, low copper helmet and large exposed hook stay different
      // from the swordsman's tall crest and the lantern caster's pointed hat.
      rect(c,-13,-31,26,18,'#283e32');rect(c,-11,-31,22,17,'#896c49');rect(c,-10,-30,7,15,'#be955f');rect(c,5,-28,6,13,'#65583f');
      rect(c,-18,-31,36,6,'#a87848');rect(c,-15,-34,30,4,'#ce9a5b');rect(c,-10,-24,21,5,'#243b32');rect(c,-6,-23,4,2,'#f1c579');rect(c,3,-23,4,2,'#f1c579');
      const handX=Math.cos(pose.weaponAngle)*(23+pose.reach),handY=-3-pose.lift*26+Math.sin(pose.weaponAngle)*(13+pose.reach*.6);
      path(c,[[side*9,-12],[handX,handY]],'#9e8056',6);rect(c,handX-4,handY-4,8,8,'#d0ac77');
      const hx=handX+side*13,hy=handY+(casting?-9*motionEase(pose.progress):4);
      for(let i=0;i<3;i++){c.strokeStyle=i%2?'#788a79':'#c2b383';c.lineWidth=2;c.beginPath();c.ellipse(side*(5+i*8),-5+i*3,5,3,i%2?.6:-.4,0,Math.PI*2);c.stroke();}
      path(c,[[handX,handY],[hx,hy]],'#b6b486',3);
      c.save();c.translate(hx,hy);c.scale(side,1);path(c,[[0,-10],[9,-11],[15,-4],[14,7],[7,13],[0,9],[5,3]],'#344d41',7);path(c,[[0,-10],[9,-11],[15,-4],[14,7],[7,13],[0,9],[5,3]],'#d8c797',3);c.restore();
      if(casting)path(c,[[hx-5,hy-16],[hx+7,hy-19],[hx+16,hy-12]],'#edce8f',2);
    } else if (kind === 'duelist') {
      rect(c,-10,4+step,7,12,'#172b29');rect(c,4,4-step,7,12,'#172b29');rect(c,-9,5+step,6,8,'#8b8570');rect(c,4,5-step,6,8,'#8b8570');
      rect(c,-15,-17,30,25,'#142c2a');rect(c,-12,-16,24,22,'#787f72');rect(c,-11,-16,7,20,'#a8ac8a');rect(c,5,-15,7,20,'#4e655c');
      rect(c,-14,2,29,5,'#b7a273');rect(c,-3,-16,6,20,'#a66453');rect(c,-8,7,7,10,'#675a4c');rect(c,2,7,7,10,'#675a4c');
      rect(c,-12,-35,24,22,'#203733');rect(c,-10,-34,20,19,'#9b9f86');rect(c,-9,-33,6,16,'#c5c6a4');rect(c,5,-31,5,15,'#647d6c');
      rect(c,-10,-26,20,6,'#243d36');rect(c,-6,-25,4,2,'#efc997');rect(c,3,-25,4,2,'#efc997');
      rect(c,-14,-36,28,5,'#70826b');rect(c,-4,-42,8,7,'#b89d68');rect(c,-2,-46,4,5,'#e0bd79');
      enemyBlade(c, e, pose, true);
    } else if (kind === 'brute') {
      const attack=e.rhythm||{},charging=attack.type==='rush'&&attack.phase==='active',staggered=e.stagger>0||e.stun>0;
      rect(c,-19,4+step,13,16,'#1b302b');rect(c,7,4-step,13,16,'#1b302b');rect(c,-18,5+step,11,11,'#a1875c');rect(c,8,5-step,11,11,'#90794f');
      rect(c,-26,-27,52,37,'#1c342c');rect(c,-22,-25,44,34,'#8c7957');rect(c,-21,-24,12,30,'#b19c6b');rect(c,10,-23,12,30,'#635e47');
      if(pose.type==='quake'){
        rect(c,-26,-25,11,5,'#b5ad7c');rect(c,15,-25,11,5,'#b5ad7c');
      }else{
        rect(c,-29,-23,13,29,'#65755a');rect(c,17,-23,13,29,'#596e52');rect(c,-32,-24,18,7,'#b5ad7c');rect(c,15,-24,18,7,'#b5ad7c');
      }
      rect(c,-15,-43,30,22,'#293b2e');rect(c,-12,-42,24,20,'#ac9f72');rect(c,-11,-41,7,17,'#d0bf8a');rect(c,5,-40,7,17,'#7f825f');
      rect(c,-18,-39,8,6,'#b5a77c');rect(c,-22,-45,6,11,'#dfc99a');rect(c,10,-39,8,6,'#a79870');rect(c,16,-45,6,11,'#d5c08c');
      rect(c,-8,-34,5,3,charging?'#ffe2a0':'#5a4838');rect(c,4,-34,5,3,charging?'#ffe2a0':'#5a4838');rect(c,-7,-25,14,4,'#4f4f37');
      rect(c,-20,2,40,6,'#626f50');rect(c,-4,1,8,9,'#d0b573');
      if(pose.type==='quake')quakeArms(c,pose);
      if(staggered){path(c,[[-24,-51],[-30,-58]],'#edcf8d',2);path(c,[[22,-53],[29,-58]],'#edcf8d',2);}
      if(e.huntTarget){
        // A broken red crest marks the quarry without changing its collision body.
        rect(c,-10,-46,20,5,'#713d35');rect(c,-7,-51,14,6,'#b8674b');rect(c,-3,-57,6,9,'#e5aa73');
        path(c,[[-19,-19],[-10,-13],[-16,-2]],'#d69362',3);path(c,[[17,-20],[10,-14],[15,-6]],'#c7895d',3);
        rect(c,-7,-34,4,3,'#eabd84');rect(c,4,-34,4,3,'#eabd84');
      }
    } else if (kind === 'pyromancer') {
      const attack=e.rhythm||{},casting=attack.phase==='windup';
      c.fillStyle='#233a33';c.beginPath();c.moveTo(-9,-23);c.lineTo(10,-23);c.lineTo(19,16);c.lineTo(-18,16);c.closePath();c.fill();
      rect(c,-11,-18,22,30,'#715f55');rect(c,-9,-17,7,28,'#9d7c5b');rect(c,5,-17,7,28,'#4e5147');rect(c,-2,-15,4,28,'#c6a05e');
      rect(c,-10,-35,20,21,'#20352f');rect(c,-8,-33,16,17,'#837a5d');rect(c,-6,-28,12,10,'#223831');rect(c,-4,-26,3,3,'#efbf75');rect(c,3,-26,3,3,'#efbf75');
      c.fillStyle='#927c57';c.beginPath();c.moveTo(-14,-31);c.lineTo(0,-50);c.lineTo(14,-31);c.closePath();c.fill();rect(c,-15,-33,30,4,'#c5a66c');
      const side=Math.cos(facing)<0?-1:1,handX=side*23+Math.cos(facing)*pose.reach,handY=-6-pose.lift*23+Math.sin(facing)*pose.reach*.6;
      path(c,[[side*8,-14],[handX,handY-5]],'#a78b66',5);path(c,[[handX,handY-9],[handX,handY+9]],'#c4aa71',2);
      lantern(c,handX,handY+12,time,casting?.88:.68);
      if(casting){glow(c,handX,handY+10,44,'#eaa35435');path(c,[[handX-12,handY+13],[handX,handY+20],[handX+12,handY+13]],'#f0d195',2);}
    } else if (kind === 'shield') {
      rect(c,-10,3+step,7,12,'#172b29');rect(c,4,3-step,7,12,'#172b29');rect(c,-10,4+step,7,7,'#827f68');rect(c,4,4-step,7,7,'#827f68');
      rect(c,-14,-16,28,24,'#172c2b');rect(c,-12,-15,24,21,'#65796c');rect(c,-11,-14,7,19,'#a0a68a');rect(c,5,-13,7,18,'#405d54');rect(c,-13,3,27,5,'#b49b66');
      rect(c,-11,-33,22,21,'#1c3330');rect(c,-10,-32,20,18,'#a4aa8b');rect(c,-9,-31,5,16,'#bec29a');rect(c,4,-30,5,16,'#6e8770');rect(c,-9,-24,18,5,'#293f37');rect(c,-6,-23,4,2,'#e7c584');rect(c,3,-23,4,2,'#e7c584');rect(c,-13,-33,26,5,'#687f62');rect(c,-3,-37,6,5,'#c5b078');
      enemyGun(c, { ...pose, reach: pose.reach + 7 });
      c.save();c.translate(Math.cos(facing)*pose.reach*.45,Math.sin(facing)*pose.reach*.3-pose.lift*8);c.rotate(facing+(e.shieldOpen>0||e.stun>0?-.5:0));rect(c,14,-18,9,36,'#142e2a');rect(c,15,-17,8,34,e.shieldOpen>0||e.stun>0?'#748975':'#b3a56c');rect(c,14,-13,8,26,'#6e8163');rect(c,20,-11,4,22,e.shieldOpen>0||e.stun>0?'#91a080':'#d4c18a');rect(c,17,-5,8,10,'#b8aa75');rect(c,18,-2,6,4,'#e1ce97');c.restore();
    } else if (kind === 'charger') {
      rect(c,-12,2+step,8,12,'#263b31');rect(c,5,2-step,8,12,'#263b31');rect(c,-11,4+step,7,7,'#9d7d5e');rect(c,5,4-step,7,7,'#9d7d5e');
      rect(c,-15,-14,30,23,'#20382d');rect(c,-13,-13,26,20,'#a87e58');rect(c,-12,-12,7,18,'#d1a06d');rect(c,6,-11,7,17,'#785c47');rect(c,-14,3,29,5,'#6d6549');
      rect(c,-12,-30,24,19,'#263a30');rect(c,-10,-29,20,19,'#b69b70');rect(c,-9,-28,6,16,'#d6bf87');rect(c,-7,-22,4,4,e.windup>0?'#f3b071':'#493c31');rect(c,4,-22,4,4,e.windup>0?'#f3b071':'#493c31');rect(c,-5,-14,10,4,'#69593d');
      rect(c,-17,-28,7,5,'#bbab7f');rect(c,-20,-33,5,9,'#dec996');rect(c,10,-28,7,5,'#aa9b74');rect(c,15,-33,5,9,'#d9c38e');rect(c,-5,-33,10,6,'#8a674a');rect(c,-2,-37,4,7,'#ca8858');
      if(e.windup>0){rect(c,-2,-52,5,9,'#efb281');rect(c,-2,-40,5,3,'#efb281');}
    } else if (kind === 'shooter' || kind === 'ranged') {
      rect(c, -8, 4 + step, 6, 10, '#172b29'); rect(c, 3, 4 - step, 6, 10, '#172b29'); rect(c, -8, 5 + step, 5, 6, '#6f6456'); rect(c, 3, 5 - step, 5, 6, '#6f6456');
      rect(c, -12, -13, 24, 21, '#142a2a'); rect(c, -10, -12, 20, 18, '#746a65'); rect(c, -9, -12, 5, 16, '#968979'); rect(c, 4, -9, 6, 15, '#514f50'); rect(c, -10, 4, 21, 4, '#a7895b');
      rect(c, -12, -27, 24, 19, '#26383a'); rect(c, -9, -28, 18, 19, '#8c8170'); rect(c, -6, -23, 12, 12, '#273d38'); rect(c, -4, -20, 3, 3, '#e1a979'); rect(c, 3, -20, 3, 3, '#e1a979'); rect(c, -11, -28, 22, 5, '#a38f6e');
      enemyGun(c, pose);
    } else {
      rect(c, -9, 4 + step, 6, 9, '#1a302b'); rect(c, 4, 4 - step, 6, 9, '#1a302b'); rect(c, -9, 5 + step, 5, 5, '#675d45'); rect(c, 4, 5 - step, 5, 5, '#675d45');
      rect(c, -11, -10, 22, 17, '#193029'); rect(c, -9, -10, 18, 16, '#60724d'); rect(c, -8, -10, 5, 14, '#83915e'); rect(c, -10, 2, 21, 5, '#5b5c3f');
      rect(c, -15, -22, 30, 6, '#213b2c'); rect(c, -13, -21, 26, 4, '#81925c'); rect(c, -10, -26, 20, 17, '#20392d'); rect(c, -8, -25, 16, 15, '#9ca773'); rect(c, -8, -24, 5, 13, '#b6ba84'); rect(c, -5, -19, 3, 3, '#422f2a'); rect(c, 4, -19, 3, 3, '#422f2a'); rect(c, -2, -12, 8, 3, '#586a44');
      rect(c, -5, -29, 10, 5, '#5d774d'); rect(c, 0, -30, 6, 3, '#8ca165');
      enemyBlade(c, e, pose);
    }
    if (boss && e.rhythm && pose.type !== 'quake') {
      if (recovering && pose.type !== 'thrust') blade(c, 1, 8, Math.cos(facing) < 0 ? Math.PI * .75 : Math.PI * .25, false, false, true);
      else enemyBlade(c, e, pose, true);
    }
    if (e.hitFlash > 0 || e.flash > 0) { c.globalCompositeOperation = 'screen'; rect(c, boss ? -21 : -10, boss ? -43 : -24, boss ? 42 : 20, boss ? 55 : 31, '#d9d69c60'); }
    c.restore();
    if (num(e.weakTime) > 0) {
      // The mark sits on the body, away from its name and health/posture bars.
      // Its remaining arc is simulation state, so repeated snapshots cannot
      // restart the opportunity or make a consumed weak point look available.
      const radius = boss ? 13 : kind === 'brute' ? 12 : 9, cy = y - (boss ? 10 : 7);
      const ratio = Math.min(1, num(e.weakTime) / 1.6);
      glow(c,x,cy,radius*2.6,'#e9bd6628');
      for(const side of [-1,1]){
        path(c,[[x+side*(radius+4),cy-5],[x+side*radius,cy-5],[x+side*radius,cy+5],[x+side*(radius+4),cy+5]],'#f9d68e',2);
      }
      path(c,[[x,cy-5],[x+4,cy],[x,cy+5],[x-4,cy],[x,cy-5]],'#fff0bb',2);
      c.strokeStyle='#edbf73';c.lineWidth=1;c.beginPath();c.arc(x,cy,radius+7,-Math.PI/2,-Math.PI/2+Math.PI*2*ratio);c.stroke();
    }
    if (kind === 'shield') { if(e.shieldOpen>0||e.stun>0)label(c,'破绽',x,y-46,'#eac891',8);else{c.strokeStyle='#d3c38b88';c.lineWidth=2;c.beginPath();c.arc(x,y,num(e.r,18)+10,num(e.facing)-Math.PI/3,num(e.facing)+Math.PI/3);c.stroke();} }
    if (e.hp < e.maxHp || boss || e.elite) bar(c, x, y - (boss ? 60 : e.elite ? 51 : 36), boss ? 64 : e.elite ? 43 : 25, e.hp / Math.max(1, e.maxHp || e.hp), boss || e.elite ? '#e2bb70' : '#d08d6f', boss || e.elite ? 4 : 3);
    if (e.maxPosture > 0 && (num(e.posture) > 0 || kind === 'duelist' || boss || e.elite && e.rhythm)) {
      const ratio=num(e.posture)/e.maxPosture, width=boss?64:e.elite?43:25, by=y-(boss?53:e.elite?44:30), nearBreak=ratio>=.75;
      bar(c, x, by, width, ratio, e.stagger > 0 ? '#fff0b5' : nearBreak ? '#f7d18d' : '#d99c69', 3);
      if(nearBreak)for(const side of [-1,1])path(c,[[x+side*(width/2+7),by-3],[x+side*(width/2+4),by],[x+side*(width/2+7),by+3]],'#f7d18d',1);
      if (e.stagger > 0) label(c, '失衡', x, y - (boss ? 91 : 87), '#ffe2a4', 10);
    }
    if (e.elite && !boss) {
      const crownY = y - 64;
      path(c, [[x - 8, crownY - 4],[x - 6, crownY + 2],[x + 6, crownY + 2],[x + 8, crownY - 4],[x + 3, crownY - 1],[x, crownY - 7],[x - 3, crownY - 1],[x - 8, crownY - 4]], '#e8c67d', 2);
      label(c, chapter ? chapterEnemyNames[kind] || '炉卫' : e.huntTarget ? '逐迹巨兽' : {duelist:'守刃者',brute:'冲撞巨兽',pyromancer:'引火祭司',hookwarden:'链钩监工'}[kind] || '精英', x, crownY - 15, e.huntTarget ? '#e7b18a' : '#ebcf8e', 8);
    }
    if (chapter && !boss && !e.elite) label(c, chapterEnemyNames[kind] || '炉卫', x, y - (kind === 'charger' ? 40 : 50), '#d6b789', 8);
    if (kind === 'lamplighter') label(c, '提灯侍从', x, y - 48, '#d8c18e', 8);
    if (boss) label(c, e.stage>=2?'炉心守卫 · 炉火觉醒':'炉心守卫', x, y - 72, e.stage>=2?'#efbc84':'#ddca97', 9);
  }
  function bullet(c, b, state) {
    const x = num(b.x), y = num(b.y), r = num(b.r, 3), friendly = b.friendly !== false;
    const vx = num(b.vx), vy = num(b.vy), speed = Math.hypot(vx, vy) || 1, dx = vx / speed, dy = vy / speed;
    if (b.hook) {
      const owner = values(state && state.enemies).find(e=>e.id===b.owner&&e.hp>0&&!e.dead);
      if (!owner || b.ttl !== undefined && num(b.ttl) <= 0 || b.life !== undefined && num(b.life) <= 0) return;
      const ox=num(owner.x),oy=num(owner.y)-3,length=Math.hypot(x-ox,y-oy),links=Math.min(64,Math.floor(length/12));
      // Each link spans only the authoritative live projectile. No trail is
      // retained after wall collision, room transition or the caster's death.
      path(c,[[ox,oy],[x,y]],'#263c32',4);
      for(let i=1;i<=links;i++){
        const t=i/(links+1),cx=ox+(x-ox)*t,cy=oy+(y-oy)*t;
        c.save();c.translate(cx,cy);c.rotate(Math.atan2(y-oy,x-ox));c.strokeStyle=i%2?'#a4ab82':'#c8ba8d';c.lineWidth=1.5;
        c.beginPath();c.ellipse(0,0,4.5,i%2?2.4:1.1,0,0,Math.PI*2);c.stroke();c.restore();
      }
      c.save();c.translate(x,y);c.rotate(Math.atan2(vy,vx));
      path(c,[[-11,-5],[-2,-9],[7,-6],[12,2],[8,11],[-1,12],[-7,7],[-1,2]],'#203b32',8);
      path(c,[[-11,-5],[-2,-9],[7,-6],[12,2],[8,11],[-1,12],[-7,7],[-1,2]],'#dfce9a',4);
      path(c,[[-2,-9],[7,-6],[12,2]],'#fff0c0',1.5); c.restore();
      return;
    }
    if(b.kind==='fireball'||b.fireball){
      const core=friendly?'#d2f0d2':'#ffe2a0',edge=friendly?'#6db9ac':'#dd8e50';
      glow(c,x,y,Math.max(20,r*4),friendly?'#86d4c441':'#f2a4553b');
      for(let i=3;i>=1;i--)alpha(c,.34-i*.06,()=>ellipse(c,x-dx*i*9,y-dy*i*9,Math.max(2,r-i),Math.max(2,r-i),edge));
      ellipse(c,x,y,r+2,r+2,edge);ellipse(c,x,y,Math.max(1,r-1),Math.max(1,r-1),core);
      if((b.reflectable||b.fireball)&&!friendly){c.strokeStyle='#f5d99d';c.lineWidth=2;c.beginPath();c.arc(x,y,r+6,-Math.PI*.25,Math.PI*.25);c.stroke();c.beginPath();c.arc(x,y,r+6,Math.PI*.75,Math.PI*1.25);c.stroke();}
      if(friendly)path(c,[[x-dx*(r+7)-dy*5,y-dy*(r+7)+dx*5],[x-dx*(r+2),y-dy*(r+2)],[x-dx*(r+7)+dy*5,y-dy*(r+7)-dx*5]],'#d8f5db',2);
      return;
    }
    const scatter=friendly&&b.weapon==='scatter',trail=friendly?(scatter?7:14):7;
    c.lineCap = 'round'; path(c, [[x - dx * trail, y - dy * trail], [x, y]], friendly ? scatter?'#edc89080':'#efd89b60' : '#d98c7066', friendly ? scatter?4:2 : 4); c.lineCap = 'butt';
    if (friendly) { rect(c, x - r, y - r, r * 2, r * 2, '#efd293'); rect(c, x - 1, y - 1, 3, 3, '#fff4c6'); }
    else { glow(c, x, y, 14, '#e8a67533'); ellipse(c, x, y, r + 1, r + 1, '#8d594c'); ellipse(c, x, y, r, r, '#e4a576'); rect(c, x - 1, y - 1, 2, 2, '#ffe5a5'); }
  }
  function particle(c, p, time) {
    const x = num(p.x), y = num(p.y), life = num(p.ttl ?? p.life, 1), maxLife = num(p.maxLife ?? p.duration ?? p.life, 1), ratio = Math.max(0, Math.min(1, life / Math.max(.01, maxLife))), opacity = Math.min(1, ratio * 1.5);
    const kind = p.kind || p.type;
    alpha(c, opacity, () => {
      if (p.text != null || kind === 'text' || kind === 'damage') label(c, p.text ?? p.amount ?? '', x, y, p.color || '#f2d7a2', num(p.size, 12));
      else if (kind === 'ring' || kind === 'explosion' || kind === 'blast') { const radius = num(p.r ?? p.radius, 20) * (.35 + (1 - ratio) * .65); glow(c, x, y, radius, '#f4c0794d'); c.strokeStyle = p.color || '#e5b16f'; c.lineWidth = 3 * ratio + 1; c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.stroke(); }
      else if (kind === 'water') { const radius = num(p.r, 40) * (.45 + (1 - ratio) * .55); ellipse(c,x,y,radius,radius*.58,'#9acdd014'); c.strokeStyle='#addbce';c.lineWidth=2;c.beginPath();c.ellipse(x,y,radius,radius*.58,0,0,Math.PI*2);c.stroke();for(let i=0;i<9;i++){const angle=i*Math.PI*2/9;rect(c,x+Math.cos(angle)*radius,y+Math.sin(angle)*radius*.58,3,5,'#aed8ce');} }
      else if (kind === 'smoke' || kind === 'steam') ellipse(c, x, y, num(p.r, 5), num(p.r, 5) * .7, p.color || '#a2ae8870');
      else if (kind === 'trail') { ellipse(c,x,y+7,num(p.r,14)*.8,num(p.r,14)*.36,'#bad4aa45');rect(c,x-7,y-22,14,24,p.color||'#a7c6a3'); }
      else if (kind === 'slash') { const angle=num(p.angle,.25),arc=num(p.arc,2.1);c.strokeStyle=p.color||'#e5c78e';c.lineWidth=2+ratio*3;c.beginPath();c.arc(x,y,num(p.r,22),angle-arc/2,angle+arc/2);c.stroke(); }
      else if (kind === 'shockwave') { const radius=num(p.r,80)*(.86+(1-ratio)*.14);c.strokeStyle=p.color||'#e5c78e';c.lineWidth=2+ratio*4;c.beginPath();c.arc(x,y,radius,0,Math.PI*2);c.stroke();c.strokeStyle='#f0d7a340';c.lineWidth=2;c.beginPath();c.arc(x,y,radius*.92,0,Math.PI*2);c.stroke(); }
      else if (kind === 'counter') { const radius=9+(1-ratio)*num(p.r,30);c.strokeStyle=p.color||'#d9e6bd';c.lineWidth=1+ratio*2;c.beginPath();c.arc(x,y,radius,0,Math.PI*2);c.stroke(); }
      else { const size = num(p.size ?? p.r, 3); rect(c, x - size / 2, y - size / 2, size, size, p.color || '#c6c396'); }
    });
  }
  function pickup(c, item, time) {
    const x=num(item.x),y=num(item.y)+Math.sin(time*.004+num(item.x))*3;shadow(c,x,y,10,.25);glow(c,x,y,27,'#e5a08e1a');
    if(item.kind==='heart'){const s=2;const shape=['0110110','1111111','1111111','0111110','0011100','0001000'];shape.forEach((row,iy)=>[...row].forEach((v,ix)=>{if(v==='1')rect(c,x+(ix-3)*s,y+(iy-3)*s,s,s,iy<2?'#e9ad89':'#cb8c76');}));rect(c,x-3,y-4,3,2,'#f3d4ac');}
    else crystal(c,x,y,.7,'#dfc780');
  }
  function aimReticle(c, p, time) {
    if (!p || p.downed || !Number.isFinite(p.aimX) || !Number.isFinite(p.aimY)) return;
    const x = p.aimX, y = p.aimY; c.strokeStyle = '#d9dfb480'; c.lineWidth = 1;
    for (const [dx,dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) { path(c, [[x + dx * 5, y + dy * 9],[x + dx * 9, y + dy * 9],[x + dx * 9, y + dy * 5]], '#d9dfb480'); }
    rect(c, x, y, 1, 1, '#e6ddb4');
  }
  function ambient(c, state, time) {
    // A few slow gold specks give still rooms life, without resembling bullets.
    for (let i = 0; i < 13; i++) {
      const x = (i * 137.7 + 49 + Math.sin(time * .0002 + i) * 14) % W, y = (i * 83.4 + 50 - time * .003) % H;
      if (y > 0) alpha(c, (.25 + Math.sin(time * .001 + i) * .2), () => rect(c, x, y, 1, 1, '#d8c795'));
    }
    const vignette = c.createRadialGradient(480, 300, 200, 480, 300, 590); vignette.addColorStop(0, '#071a2300'); vignette.addColorStop(.75, '#071a2315'); vignette.addColorStop(1, '#071a2399'); c.fillStyle = vignette; c.fillRect(0, 0, W, H);
  }
  const rhythmColors = { combo: '#efc485', thrust: '#e8aa8e', sweep: '#a9d1cd', quake: '#dcba7b', rush: '#e9b37c', fireball: '#eab475', hook: '#c9d5a0' };
  function rhythmArea(c, e, state, localId) {
    const r = e && e.rhythm;
    if (!r || e.hp <= 0 || e.dead || !rhythmColors[r.type] || !['windup','active'].includes(r.phase)) return;
    const x = num(e.x), y = num(e.y), radius = Math.max(1, Math.min(1100, num(r.range, 100)));
    const angle = num(r.angle), arc = Math.max(.03, Math.min(Math.PI * 2, num(r.arc, Math.PI / 2)));
    const progress = 1 - Math.max(0, Math.min(1, num(r.remaining) / Math.max(.01, num(r.duration, 1))));
    const active = r.phase === 'active', color = rhythmColors[r.type];
    const doubleQuake = state && state.mode === 'random' && e.kind === 'boss' && e.stage >= 2 && r.type === 'quake' && num(r.beats) === 2;
    // Reach the target at the start of the usable parry window, so players do
    // not wait for the impact flash before pressing. The cue is slightly inside
    // the simulation's 0.38s window to leave room for input/frame timing.
    const parryReady = !active && r.type === 'combo' && num(r.remaining) <= .32;
    const circle = r.type === 'quake' || arc >= Math.PI * 2 - .01;
    c.save(); c.translate(x, y); c.rotate(angle);
    const shape = () => { c.beginPath(); if (!circle) c.moveTo(0, 0); c.arc(0, 0, radius, circle ? 0 : -arc / 2, circle ? Math.PI * 2 : arc / 2); c.closePath(); };
    if (r.type === 'hook') {
      // A narrow locked lane plus hooked arrowheads identifies a travelling
      // chain. Its edge uses the engine's exact 430px range and .18rad arc.
      shape();c.fillStyle=color+(active?'27':'0d');c.fill();
      c.strokeStyle=color+(active?'da':'75');c.lineWidth=active?3:1;
      if(!active)c.setLineDash([8,7]);shape();c.stroke();c.setLineDash([]);
      path(c,[[num(e.r,20)+8,0],[radius,0]],color+'68',1.5);
      for(let i=1;i<=3;i++){
        const px=radius*(.18+i*.2);
        path(c,[[px-7,-5],[px,0],[px-7,5],[px-12,2]],color+'b8',2);
      }
    } else if (r.type === 'fireball') {
      // This line previews a travelling projectile, not an instant floor-wide hit.
      path(c,[[num(e.r,20)+8,0],[radius,0]],color+'28',12);
      if(!active)c.setLineDash([9,7]);path(c,[[num(e.r,20)+8,0],[radius,0]],color+(active?'cf':'88'),2);c.setLineDash([]);
      for(let i=1;i<=3;i++){const dx=radius*(.22+i*.19);path(c,[[dx-7,-5],[dx,0],[dx-7,5]],color+'a0',2);}
    } else {
      shape(); c.fillStyle = color + (active ? '38' : '13'); c.fill();
      c.strokeStyle = color + (active ? 'ee' : '88'); c.lineWidth = active ? 4 : 2;
      if (!active) c.setLineDash([7, 6]); shape(); c.stroke(); c.setLineDash([]);
    }
    if (r.type === 'thrust' || r.type === 'rush') {
      // Directional spearheads also identify a thrust when color is hard to see.
      for (let i = 1; i <= 3; i++) { const dx = radius * (.26 + i * .17); path(c, [[dx-9,-8],[dx,0],[dx-9,8]], color + (active ? 'ed' : '99'), active ? 3 : 2); }
      if (e.kind === 'boss' && r.type === 'thrust') {
        const edge = Math.min(22, Math.sin(arc / 2) * radius * .45);
        for (const side of [-1, 1]) path(c, [[radius * .25, side * edge * .3], [radius * .82, side * edge]], color + (active ? 'd0' : '68'), 2);
      }
    } else if (r.type === 'combo' && e.kind === 'boss') {
      // Parallel blade tracks and the existing beat pips read as a sequence;
      // thrust keeps its straight arrows and quake keeps its radial cracks.
      for (const scale of [.57, .74]) {
        c.strokeStyle = color + (active ? 'c8' : '6b'); c.lineWidth = active ? 4 : 2;
        c.beginPath(); c.arc(0, 0, radius * scale, -arc * .38, arc * .38); c.stroke();
      }
    } else if (r.type === 'sweep') {
      for (const scale of [.52, .76]) { c.strokeStyle = color + '60'; c.lineWidth = 2; c.beginPath(); c.arc(0,0,radius*scale,-arc/2,arc/2); c.stroke(); }
      const tip = arc / 2; const tx = Math.cos(tip) * radius * .76, ty = Math.sin(tip) * radius * .76;
      path(c, [[tx-10,ty-5],[tx,ty],[tx+4,ty-10]], color + 'c0', 2);
    } else if (r.type === 'quake') {
      c.strokeStyle = color + (active ? 'a0' : '48'); c.lineWidth = 2; c.beginPath(); c.arc(0,0,radius*.66,0,Math.PI*2); c.stroke();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; path(c, [[Math.cos(a)*radius*.72,Math.sin(a)*radius*.72],[Math.cos(a+.03)*radius*.86,Math.sin(a+.03)*radius*.86],[Math.cos(a)*radius,Math.sin(a)*radius]], color + '66', 2); }
      if (e.kind === 'boss') for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4, rr = radius * .42;
        const tx = Math.cos(a) * rr, ty = Math.sin(a) * rr;
        path(c, [[tx - Math.cos(a - .5) * 11, ty - Math.sin(a - .5) * 11], [tx, ty], [tx - Math.cos(a + .5) * 11, ty - Math.sin(a + .5) * 11]], color + (active ? 'db' : '82'), 2);
      }
    }
    if (!active) {
      const target = num(e.r, 20) + 12;
      const arrival = r.type === 'combo' ? Math.max(0, num(r.remaining) - .32) / Math.max(.01, num(r.duration, 1) - .32) : 1 - progress;
      const contracting = target + Math.min(1, arrival) * 48;
      c.strokeStyle = parryReady ? '#c6f2cb' : '#e6d9b360'; c.lineWidth = parryReady ? 5 : 2; c.beginPath(); c.arc(0,0,target,0,Math.PI*2); c.stroke();
      c.strokeStyle = parryReady ? '#efffe4' : color; c.lineWidth = parryReady ? 3 : progress > .8 ? 3 : 2; c.beginPath(); c.arc(0,0,contracting,0,Math.PI*2); c.stroke();
      if (parryReady) {
        // Four steady notches mark an interval, rather than another flash that
        // can be confused with the attack's impact.
        for (let i=0;i<4;i++) { const a=i*Math.PI/2;path(c,[[Math.cos(a)*(target+6),Math.sin(a)*(target+6)],[Math.cos(a)*(target+13),Math.sin(a)*(target+13)]],'#c6f2cb',3); }
      }
    }
    c.restore();
    if (!active) {
      const glyph = { combo: '刃', thrust: '突', sweep: '扫', quake: '震', rush: '冲', fireball: '炎', hook: '钩' }[r.type];
      const gy = y - (e.kind === 'boss' ? 108 : 103);
      c.save(); c.translate(x, gy); c.rotate(Math.PI / 4); rect(c,-10,-10,20,20,'#142c2be8'); c.strokeStyle=color;c.lineWidth=2;c.strokeRect(-10,-10,20,20);c.restore();
      label(c, glyph, x, gy, color, 13);
      const beats = Math.max(1, Math.min(4, Math.floor(num(r.beats, 1)))), beat = Math.max(1, Math.floor(num(r.beat, 1)));
      if (beats > 1) for (let i = 0; i < beats; i++) rect(c,x-(beats*9-3)/2+i*9,gy+22,6,3,i<beat?color:'#566e62');
      if (doubleQuake) label(c, `${Math.max(1, Math.min(2, beat))} / 2`, x, gy - 24, '#ead7ae', 10);
      const p = state && state.players && state.players[localId];
      if (state && state.practice && parryReady && p && !p.downed && !p.carry && num(p.guardAttackLock) <= 0 && num(p.dashTime) <= 0 && num(p.invuln) <= .3) {
        const direction = Math.atan2(num(p.y)-y,num(p.x)-x);
        const delta = Math.atan2(Math.sin(direction-angle),Math.cos(direction-angle));
        if (Math.hypot(num(p.x)-x,num(p.y)-y) <= radius+num(p.r,14) && Math.abs(delta) <= arc/2+.08) {
          label(c,'招架',num(p.x),num(p.y)-63,'#dcffd2',13);
        }
      }
    }
    if (active && doubleQuake) label(c, `${Math.max(1, Math.min(2, Math.floor(num(r.beat, 1))))} / 2`, x, y - 108, '#ead7ae', 10);
  }
  function combatEvents(state) {
    const source = Array.isArray(state.combatEvents) ? state.combatEvents : values(state.events);
    // A retained history can arrive again in every network snapshot. Rendering is
    // a pure function of simulation age: it never restarts an effect on receipt.
    return source.slice(-24).map(e => ({ event: e, age: num(state.time) - num(e.time, -10) }))
      .filter(({ event, age }) => age >= 0 && age <= (event.type === 'boss-phase' || event.type === 'core-deliver' || event.type === 'hunt-defeated' || event.type === 'weapon-broken' ? 1 : /^event-|^supply-collected$|^hunt-|^weapon-tempered$|^storehouse-open$|^wall-breached$|^fox-rescued$|^style-formed$|^refuge-chosen$|^boss-overload-open$/.test(event.type) ? .85 : .62) && ['rhythm-windup','rhythm-beat','perfect-parry','perfect-dodge','mikiri','counterattack','guard-break','fireball-reflected','hook-reflected','hook-pull','weapon-tempered','storehouse-open','wall-breached','spear-thrust','lantern-guard','fox-rescued','fox-assist','fox-sniff','boss-phase','event-start','event-complete','supply-collected','decoy','core-throw','core-catch','core-deliver','core-knock','hunt-arrival','hunt-lured','hunt-defeated','weapon-switch','weapon-broken','ranged-block','melee-block','player-hit','enemy-hit','weakpoint-open','weakpoint-hit','posture-break','scatter-push','environment-hit','refuge-chosen','style-formed','style-trigger','boss-overload-open'].includes(event.type));
  }
  function combatMotion(events, disabled) {
    if (disabled) return { x:0, y:0, flash:0 };
    let x = 0, y = 0, flash = 0;
    for (const {event:e, age} of events) {
      const success = ['perfect-parry','mikiri','counterattack','fireball-reflected'].includes(e.type), beat = e.type === 'rhythm-beat', phase = e.type === 'boss-phase';
      if (!success && !beat && !phase) continue;
      const duration = phase ? .24 : beat ? .16 : .13;
      if (age > duration) continue;
      const amplitude = (phase ? 1.5 : beat ? 1.8 : 2.5) * (1 - age / duration), oscillation = (hash(e.id || e.type) % 17) + age * 175;
      x += Math.sin(oscillation) * amplitude; y += Math.cos(oscillation * 1.3) * amplitude * .7;
      if (success || beat) flash = Math.max(flash, (success ? .07 : .035) * Math.max(0, 1 - age / .09));
    }
    return { x:Math.max(-3, Math.min(3, x)), y:Math.max(-2, Math.min(2, y)), flash:Math.min(.07,flash) };
  }
  function damageText(amount) { return '-' + String(Math.round(Math.abs(num(amount)) * 100) / 100); }
  function impactLabel(c,text,x,y,color,size) {
    // Keep local hit feedback on the playing field. The map and mode status
    // are painted after these effects and remain completely stationary.
    label(c,text,Math.max(62,Math.min(W-62,x)),Math.max(112,Math.min(H-24,y)),color,size);
  }
  function tacticsEffect(c, e, age, events, state, still) {
    if(!['melee-block','player-hit','enemy-hit','weakpoint-open','weakpoint-hit','posture-break','scatter-push','environment-hit'].includes(e.type))return false;
    const weak=e.type==='weakpoint-hit',ordinary=e.type==='enemy-hit',opening=e.type==='weakpoint-open',posture=e.type==='posture-break',environment=e.type==='environment-hit',scatter=e.type==='scatter-push',blocked=e.type==='melee-block',hurt=e.type==='player-hit';
    const life=opening||posture?.58:weak?.6:blocked?.38:.48;
    if(age>life)return true;
    // A single physical hit can produce several semantic events. Keep its
    // strongest useful feedback rather than stacking several damage numbers.
    if(ordinary&&e.weapon==null&&events.some(other=>other.event!==e&&other.event.enemyId===e.enemyId&&Math.abs(other.age-age)<.09&&other.event.type==='environment-hit'))return true;
    if(opening&&events.some(other=>other.event!==e&&other.event.enemyId===e.enemyId&&Math.abs(other.age-age)<.09&&other.event.type==='posture-break'))return true;
    if(hurt&&events.some(other=>other.event.playerId===e.playerId&&Math.abs(other.age-age)<.09&&other.event.type==='ranged-block'))return true;
    const weakAlongside=ordinary&&events.some(other=>other.event.enemyId===e.enemyId&&Math.abs(other.age-age)<.09&&other.event.type==='weakpoint-hit');
    const ratio=age/life,motion=still?.25:ratio,x=num(e.x),y=num(e.y),propItem=environment&&values(state.props).find(item=>item.id===e.propId);
    const wood=environment&&e.target==='prop'&&(e.kind==='crate'||propItem&&propItem.kind==='crate');
    const color=weak?'#fff0b1':posture?'#f3ce8c':opening?'#f9d68e':blocked?'#b4d8c8':hurt?'#f0a18b':environment?wood?'#c9a673':e.source==='fireball'||e.source==='explosion'?'#f0b078':'#d5c09a':scatter?'#efd1a0':'#dfd5ad';
    alpha(c,1-ratio,()=>{
      if(blocked){
        const actor=state.players&&state.players[e.playerId],facing=num(actor&&actor.facing);
        c.save();c.translate(x,y);c.rotate(facing);
        c.strokeStyle=color;c.lineWidth=3;c.beginPath();c.arc(0,0,22+motion*7,-.85,.85);c.stroke();
        path(c,[[13,-11],[20,-4],[30,-16]],'#e0efcc',2);c.restore();
        impactLabel(c,'格挡',x,y-55-motion*5,color,10);return;
      }
      if(opening){
        for(const side of [-1,1])path(c,[[x+side*(12+motion*9),y-17],[x+side*(7+motion*9),y-17],[x+side*(7+motion*9),y-3],[x+side*(12+motion*9),y-3]],color,2);
        impactLabel(c,'破绽',x,y+26+motion*5,color,10);return;
      }
      if(scatter){
        const owner=state.players&&state.players[e.playerId],angle=num(e.angle,owner?Math.atan2(y-num(owner.y),x-num(owner.x)):0);
        c.save();c.translate(x,y);c.rotate(angle);
        for(const side of [-1,1]){
          path(c,[[6+motion*15,side*(5+motion*9)],[18+motion*29,side*(9+motion*14)]],color,2);
          path(c,[[-4+motion*11,side*(12+motion*10)],[6+motion*23,side*(17+motion*15)]],color,1);
        }
        c.strokeStyle='#efd1a066';c.lineWidth=3;c.beginPath();c.arc(0,0,15+motion*24,-.7,.7);c.stroke();c.restore();
        // Only the shove is illustrated here; its pellet damage is already
        // coalesced by the engine and shown once by enemy-hit.
        return;
      }
      if(posture){
        path(c,[[x-22-motion*8,y-17],[x-6,y-9],[x-13-motion*7,y+7]],color,3);
        path(c,[[x+22+motion*8,y-17],[x+6,y-9],[x+13+motion*7,y+7]],color,3);
        impactLabel(c,'架势击破',x,y+30+motion*7,color,12);return;
      }
      const count=environment?wood?7:8:weak?6:hurt?3:4;
      for(let i=0;i<count;i++){
        const angle=i*Math.PI*2/count+(hash(e.id)%13)*.1,inner=weak?7:3,outer=inner+(weak?13:environment?17:7)+motion*(environment?23:12);
        if(wood){
          c.save();c.translate(x+Math.cos(angle)*outer,y+Math.sin(angle)*outer*.7+motion*9);c.rotate(angle+motion*2);rect(c,-3,-1,7,3,color);rect(c,-3,-1,4,1,'#e1c195');c.restore();
        }else path(c,[[x+Math.cos(angle)*inner,y-7+Math.sin(angle)*inner],[x+Math.cos(angle)*outer,y-7+Math.sin(angle)*outer]],color,weak?i%2?2:3:1.5);
      }
      if(environment&&e.target==='prop'){
        if(wood)impactLabel(c,'木箱破裂',x,y+28+motion*5,color,10);
        return;
      }
      const amount=num(e.amount??e.damage);
      if(amount>0){
        const prefix=weak?'弱点 ':environment&&e.source==='rush'?'撞击 ':'';
        impactLabel(c,prefix+damageText(amount),x+(hurt?20:weak?0:environment?-18:weakAlongside?25:15),y+(hurt?25:environment?-13:weakAlongside?18:-25)-motion*(weak?20:13),color,weak?15:hurt?11:12);
      }
    });
    return true;
  }
  function combatEffects(c, events, state, still) {
    for (const {event:e, age} of events) {
      if (e.type === 'rhythm-windup') continue;
      if (e.type === 'weakpoint-open' && events.some(other => other.event.type === 'boss-overload-open' && other.event.enemyId === e.enemyId && Math.abs(other.age - age) < .09)) continue;
      if (e.kind === 'breach' && e.type === 'event-complete') continue;
      if (e.kind === 'storehouse' && (e.type === 'event-start' || e.type === 'event-complete' && events.some(other=>other.event.type==='storehouse-open'&&other.event.room===e.room))) continue;
      if(tacticsEffect(c,e,age,events,state,still))continue;
      if (e.type === 'style-formed' || e.type === 'style-trigger') {
        if (state.mode !== 'random' || !styleColors[e.style]) continue;
        const formed = e.type === 'style-formed', life = formed ? .8 : .34; if (age > life) continue;
        const ratio = age / life, motion = still ? .2 : ratio, x = num(e.x), y = num(e.y), color = styleColors[e.style];
        alpha(c, (1 - ratio) * (formed ? .85 : .72), () => {
          if (formed || e.style === 'echo') {
            for (const offset of formed ? [0, 8] : [0, 6]) {
              c.strokeStyle = offset ? color + '70' : color; c.lineWidth = formed ? 1.5 : 1;
              c.beginPath(); c.ellipse(x, y + 6, 13 + motion * 23 + offset, 6 + motion * 9 + offset * .4, 0, 0, Math.PI * 2); c.stroke();
            }
          } else if (e.style === 'pursuit') {
            const p = state.players && state.players[e.playerId], angle = num(p && p.facing);
            c.save(); c.translate(x, y - 5); c.rotate(angle);
            for (const side of [-1, 1]) path(c, [[8 + motion * 8, side * 7], [17 + motion * 15, 0], [8 + motion * 8, -side * 7]], color, 1.5);
            c.restore();
          } else {
            for (const side of [-1, 1]) {
              const dx = side * (8 + motion * 10);
              path(c, [[x + dx, y - 18], [x + dx + side * 4, y - 12], [x + dx + side * 4, y + 5], [x + dx, y + 10]], color, 1.5);
            }
          }
          if (formed) {
            const same = events.filter(other => other.event.type === 'style-formed' && styleNames[other.event.style] && Math.abs(other.age - age) < .09 && Math.hypot(num(other.event.x) - x, num(other.event.y) - y) < 8);
            if (same.length < 2 || same[0].event === e) {
              const caption = [...new Set(same.map(other => styleNames[other.event.style]))].join(' / ') || styleNames[e.style];
              impactLabel(c, caption + ' · 成形', x, y - 55 - motion * 5, color, 11);
            }
          }
        });
        continue;
      }
      if (e.type === 'refuge-chosen' || e.type === 'boss-overload-open') {
        if (state.mode !== 'random') continue;
        const overload = e.type === 'boss-overload-open', life = overload ? .8 : .7; if (age > life) continue;
        const ratio = age / life, motion = still ? .2 : ratio, x = num(e.x), y = num(e.y), color = overload ? '#bfe8ca' : e.choice === 'rest' ? '#d9e4b7' : '#dfccec';
        alpha(c, (1 - ratio) * .82, () => {
          c.strokeStyle = color; c.lineWidth = 1.5; c.beginPath(); c.ellipse(x, y + 9, 18 + motion * 31, 8 + motion * 12, 0, 0, Math.PI * 2); c.stroke();
          if (overload) impactLabel(c, '炉芯外露', x, y - 104 - motion * 7, color, 12);
          else impactLabel(c, e.choice === 'rest' ? '灯下歇息' : '借取遗物', x, y - 56 - motion * 7, color, 11);
        });
        continue;
      }
      if(e.type==='fox-rescued'||e.type==='fox-assist'||e.type==='fox-sniff'){
        const rescued=e.type==='fox-rescued',assist=e.type==='fox-assist',life=rescued?.8:.3;if(age>life)continue;
        const ratio=age/life,motion=still?.2:ratio,x=num(e.x),y=num(e.y);
        alpha(c,1-ratio,()=>{
          if(rescued){c.strokeStyle='#b7d4bc88';c.lineWidth=1;c.beginPath();c.ellipse(x,y+8,18+motion*16,8+motion*6,0,0,Math.PI*2);c.stroke();label(c,'小狐脱困',x,y-47-motion*6,'#d0e0c6',11);}
          else if(assist){
            const strong=e.assistKind==='counter',ink=strong?'#efd599':'#d9e2c7';
            for(let i=0;i<3;i++)path(c,[[x-8+i*6,y-10],[x-4+i*6,y-3]],ink,strong?2:1.5);
            if(num(e.amount)>0)impactLabel(c,damageText(e.amount),x-20,y+21-motion*6,strong?'#efd599':'#d5dfc3',strong?11:10);
          }else{for(const side of[-1,1])path(c,[[x+side*7,y-9],[x+side*10,y-13]],'#b8cbb184',1);}
        });continue;
      }
      if (e.type === 'spear-thrust') {
        const life = e.perfect ? .28 : .22; if (age > life) continue;
        const reach = Math.max(0, Math.min(e.perfect ? 250 : 156, num(e.range))); if (reach < 2) continue;
        const ratio = age / life, color = e.perfect ? '#fff0ba' : '#e1e8c6', from = Math.min(15, reach);
        alpha(c, (1 - ratio) * (e.perfect ? .9 : .72), () => {
          c.save(); c.translate(num(e.x), num(e.y)); c.rotate(num(e.angle));
          // The engine publishes the collision-limited extent. No trail,
          // spearhead or sparkle is allowed to overshoot that exact endpoint.
          path(c, [[from, 0], [reach, 0]], e.perfect ? '#e6c98360' : '#d1dfb74d', e.perfect ? 9 : 5);
          path(c, [[from, 0], [reach, 0]], color, e.perfect ? 2.5 : 1.5);
          for (const side of [-1, 1]) path(c, [[Math.max(from, reach - (e.perfect ? 25 : 15)), side * (e.perfect ? 5 : 3)], [reach, 0]], color, e.perfect ? 2 : 1);
          c.restore();
        });
        continue;
      }
      if (e.type === 'lantern-guard') {
        if (age > .3 || num(e.reduced) <= 0) continue;
        const ratio = age / .3, x = num(e.x), y = num(e.y);
        alpha(c, (1 - ratio) * .8, () => {
          // One brief shield at the target's feet leaves the actual enemy-hit
          // damage number clear. The steady aura is derived afresh each draw.
          path(c, [[x - 10, y + 6], [x - 9, y + 15], [x, y + 21], [x + 9, y + 15], [x + 10, y + 6]], '#e4c78d', 2);
          path(c, [[x, y + 9], [x, y + 15]], '#fff0bd', 1.5);
        });
        continue;
      }
      if(e.type==='wall-breached'){
        const life=.8;if(age>life)continue;
        const ratio=age/life,motion=still?.22:ratio,x=num(e.x),y=num(e.y);
        alpha(c,1-ratio,()=>{
          for(let i=0;i<12;i++){
            const side=i%2?-1:1,dx=side*(9+(i%6)*8+motion*15),dy=Math.sin(i*3.7)*10+motion*15;
            rect(c,x+dx,y+dy,3+i%3,2+i%2,i%3?'#a5ad89':'#d7c9a1');
          }
          ellipse(c,x,y+7,21+motion*31,8+motion*8,'#b6b59a12');
          label(c,'裂墙震开',x,y-44-motion*8,'#d8d6af',12);
        });
        continue;
      }
      if (e.type === 'hook-pull') {
        if(age>.42)continue;
        const ratio=age/.42,x=num(e.x),y=num(e.y),color=e.target==='enemy'?'#d2e5b1':'#d7bc88';
        alpha(c,1-ratio,()=>{
          for(const side of [-1,1])path(c,[[x+side*(23+ratio*12),y-4],[x+side*(16+ratio*12),y+2],[x+side*(23+ratio*12),y+8]],color,2);
        });
        continue;
      }
      if (e.type === 'weapon-switch' || e.type === 'weapon-broken' || e.type === 'ranged-block') {
        const broken=e.type==='weapon-broken',blocked=e.type==='ranged-block',life=broken?1:blocked?.55:.45;
        if(age>life)continue;
        const ratio=age/life,x=num(e.x),y=num(e.y),color=broken?'#e9a083':blocked?'#e2af7d':'#c9d8ae';
        alpha(c,1-ratio,()=>{
          if(broken){for(const side of [-1,1])path(c,[[x+side*9,y-9],[x+side*(14+ratio*11),y-14-ratio*9]],color,2);}
          else if(blocked){c.strokeStyle=color;c.lineWidth=2;c.setLineDash([4,4]);c.beginPath();c.arc(x,y,22+ratio*10,0,Math.PI*2);c.stroke();c.setLineDash([]);}
          // A break can accompany the same block: show its single useful label.
          if(!blocked||!e.broken){const name=broken?'远程武器损坏':blocked?'半效格挡':e.weapon==='spear'?'近战 · 遗迹长枪':e.weapon==='blade'?'近战 · 旅人短刃':e.weapon==='scatter'?'远程 · 散射枪':'远程 · 手枪';label(c,name,x,y-57-ratio*10,color,broken?12:10);}
          if(blocked&&num(e.damage)>0)impactLabel(c,damageText(e.damage),x+20,y+25-(still?.25:ratio)*9,'#f0a18b',11);
        });
        continue;
      }
      if (/^hunt-/.test(e.type)) {
        const won=e.type==='hunt-defeated',life=won?1:.8;
        if(age>life)continue;
        const ratio=age/life,x=num(e.x),y=num(e.y),color=won?'#d4deb0':e.type==='hunt-lured'?'#e9c285':'#dfad83';
        alpha(c,1-ratio,()=>{
          c.strokeStyle=color;c.lineWidth=won?2:1;c.beginPath();c.ellipse(x,y,18+ratio*(won?65:31),10+ratio*(won?32:15),0,0,Math.PI*2);c.stroke();
          const name=won?'狩猎完成':e.type==='hunt-lured'?'巨兽循声而来':'沉重脚步逼近';
          label(c,name,x,y-59-ratio*12,color,won?15:11);
        });
        continue;
      }
      if (/^core-/.test(e.type)) {
        const delivered=e.type==='core-deliver',caught=e.type==='core-catch',perfect=caught&&e.perfect,life=delivered?1:.58;
        if(age>life)continue;
        const ratio=age/life,x=num(e.x),y=num(e.y),color=delivered?'#c9e5b5':perfect?'#ffe4a6':'#eac17e';
        alpha(c,1-ratio,()=>{
          c.strokeStyle=color;c.lineWidth=delivered||perfect?3:1;c.beginPath();c.ellipse(x,y,16+ratio*(delivered?88:36),(16+ratio*(delivered?88:36))*.55,0,0,Math.PI*2);c.stroke();
          if(perfect)for(let i=0;i<6;i++){const a=i*Math.PI/3,inner=20+ratio*17,outer=inner+8;path(c,[[x+Math.cos(a)*inner,y+Math.sin(a)*inner],[x+Math.cos(a)*outer,y+Math.sin(a)*outer]],color,2);}
          const name=delivered?'炉芯归位':caught?perfect?'精准接力':'接住了':e.type==='core-knock'?'炉芯掉落':'';
          if(name)label(c,name,x,y-52-ratio*12,color,perfect||delivered?15:12);
        });
        continue;
      }
      if (e.type === 'boss-phase' || e.type === 'event-start' || e.type === 'event-complete' || e.type === 'supply-collected' || e.type === 'decoy' || e.type === 'weapon-tempered' || e.type === 'storehouse-open') {
        const phase=e.type==='boss-phase',supplied=e.type==='supply-collected',ghost=e.type==='decoy',life=phase?1:ghost?.48:.85;
        if(age>life)continue;
        const ratio=age/life,x=num(e.x),y=num(e.y),color=phase?'#eeb77d':supplied||ghost?'#b7e1cf':e.kind==='sluice'?'#9bd0c4':'#e3ce91';
        alpha(c,1-ratio,()=>{
          const radius=14+ratio*(phase?94:ghost?27:56);
          c.strokeStyle=color;c.lineWidth=phase?3:2;c.beginPath();c.ellipse(x,y,radius,radius*(phase?.62:.5),0,0,Math.PI*2);c.stroke();
          if(phase){for(let i=0;i<6;i++){const angle=i*Math.PI/3,inner=17+ratio*12,outer=inner+19+ratio*31;path(c,[[x+Math.cos(angle)*inner,y+Math.sin(angle)*inner*.65],[x+Math.cos(angle+.05)*outer,y+Math.sin(angle+.05)*outer*.65]],color,2);}label(c,'炉火觉醒',x,y-88-ratio*12,color,16);}
          else if(!ghost){const name=e.type==='weapon-tempered'?'武器淬火 · 本局生效':e.type==='storehouse-open'?e.breach==='loud'?'封板碎裂 · 追兵赶来':'仓门安静开启':supplied?'补给已领取':e.type==='event-complete'?e.kind==='forge'?'淬火已就绪':e.kind==='storehouse'?'存货可以领取':'机关已运转':e.kind==='sluice'?'水路开启':e.kind==='forge'?'锻炉启动 · 追兵赶来':'升降台启动';label(c,name,x,y-66-ratio*10,color,12);}
        });
        continue;
      }
      const beat = e.type === 'rhythm-beat', broken = e.type === 'guard-break';
      const life = beat ? .24 : .55;
      if (age > life) continue;
      const ratio = age / life, x = num(e.x), y = num(e.y), color = broken ? '#e39b83' : e.type === 'perfect-dodge' || e.type === 'fireball-reflected' ? '#b4e1da' : '#ffe0a2';
      alpha(c, 1-ratio, () => {
        c.strokeStyle = color; c.lineWidth = beat ? 2 : 3 * (1-ratio) + 1;
        c.beginPath(); c.arc(x,y,11+ratio*(beat?36:49),0,Math.PI*2); c.stroke();
        if (!beat) {
          for (let i=0; i<8; i++) { const a=i*Math.PI/4+(hash(e.id)%7)*.1, inner=7+ratio*12, outer=inner+9+ratio*15;
            path(c,[[x+Math.cos(a)*inner,y+Math.sin(a)*inner],[x+Math.cos(a)*outer,y+Math.sin(a)*outer]],color,i%2?2:3); }
          const name = { 'perfect-parry':'铮', 'perfect-dodge':'闪', mikiri:'看破', counterattack:'反击', 'guard-break':'破防', 'fireball-reflected':'反射', 'hook-reflected':'反拉' }[e.type];
          if (name) label(c,name,x,y-45-ratio*12,color,e.type==='counterattack'?17:14);
        }
      });
    }
  }
  function practiceStatus(c, state) {
    if (!state.practice) return;
    const e = values(state.enemies).find(enemy => enemy.hp > 0 && enemy.maxPosture > 0);
    if (!e) return;
    const x = W / 2;
    rect(c,x-128,18,256,84,'#102523e8'); c.strokeStyle='#a58d5f70';c.lineWidth=1;c.strokeRect(x-127.5,18.5,255,83);
    label(c,e.kind==='boss'?'炉心守卫':'听刃试炼',x,32,'#e5cd99',12);
    bar(c,x,46,222,num(e.hp)/Math.max(1,num(e.maxHp,1)),'#b79a6d',4);
    label(c,'架势',x-111,66,'#b9b692',9,'left');
    bar(c,x+16,64,188,num(e.posture)/Math.max(1,num(e.maxPosture,1)),e.stagger>0?'#ffedb3':'#dfa576',5);
    label(c,`成功招架 ${Math.max(0,Math.floor(num(state.practiceParries)))} 次`,x,88,'#c7dfb0',10);
  }
  function relayMap(c, state) {
    if (state.practice || !state.relay || !Array.isArray(state.rooms)) return;
    const rooms=state.rooms.filter(room=>Number.isFinite(room.gx)&&Number.isFinite(room.gy));
    if(!rooms.length)return;
    const run=state.relay,current=state.room&&state.room.index,visible=rooms.filter(room=>room.visited||room.discovered||room.index===run.extractionRoom);
    const left=752,top=18,width=190,height=126,minX=Math.min(...rooms.map(room=>room.gx)),maxX=Math.max(...rooms.map(room=>room.gx)),minY=Math.min(...rooms.map(room=>room.gy)),maxY=Math.max(...rooms.map(room=>room.gy));
    const spacing=Math.min(54,144/Math.max(1,maxX-minX),52/Math.max(1,maxY-minY));
    const points=new Map(rooms.map(room=>[room.index,{x:left+width/2+(room.gx-(minX+maxX)/2)*spacing,y:top+66+(room.gy-(minY+maxY)/2)*spacing,room}]));
    c.save();rect(c,left,top,width,height,'#102523e8');c.strokeStyle='#71886865';c.lineWidth=1;c.strokeRect(left+.5,top+.5,width-1,height-1);
    label(c,'接力路线',left+12,top+14,'#d7c498',10,'left');
    if(num(run.perfectCatches)>0)label(c,`精准 ${Math.floor(num(run.perfectCatches))}`,left+width-12,top+14,'#eacb91',8,'right');
    for(const room of visible){
      if(!room.visited)continue;
      const point=points.get(room.index);
      for(const adjacent of values(room.neighbors)){
        const next=points.get(adjacent);
        if(next&&(next.room.visited||next.room.discovered))path(c,[[point.x,point.y],[next.x,next.y]],next.room.visited?'#7b9270aa':'#70866a55',2);
      }
    }
    for(const room of visible){
      const point=points.get(room.index),isCurrent=room.index===current,isExit=room.index===run.extractionRoom,size=isCurrent?15:12;
      rect(c,point.x-size/2-2,point.y-size/2-2,size+4,size+4,'#102523');rect(c,point.x-size/2,point.y-size/2,size,size,isCurrent?'#d9dca6':room.visited?'#657f63':'#203a32');
      c.strokeStyle=isCurrent?'#f2e4ad':isExit?'#b8d1a5':'#7c927466';c.lineWidth=isCurrent?2:1;c.strokeRect(Math.round(point.x-size/2)+.5,Math.round(point.y-size/2)+.5,size,size);
      if(isExit){path(c,[[point.x-3,point.y+4],[point.x-3,point.y-5],[point.x+4,point.y-2],[point.x-3,point.y]],'#c8dfb4',2);label(c,'撤离',point.x,point.y+21,'#b8cfaa',8);}
      if(!run.delivered&&room.index===run.coreRoom){
        c.fillStyle='#ffc66d';c.beginPath();c.moveTo(point.x,point.y-24);c.lineTo(point.x+5,point.y-17);c.lineTo(point.x,point.y-10);c.lineTo(point.x-5,point.y-17);c.closePath();c.fill();
      }
    }
    const known=visible.some(room=>room.index===run.coreRoom),carried=values(state.players).some(p=>p.carry===run.coreId),flying=values(state.props).some(p=>p.id===run.coreId&&p.thrown);
    const status=run.delivered?'炉芯已交付':carried?'炉芯搬运中':known?flying?'炉芯飞行中':'炉芯已定位':'寻找炉芯';
    label(c,status,left+12,top+height-12,run.delivered?'#c9dfaf':'#dec695',9,'left');
    label(c,`${rooms.filter(room=>room.visited).length} / ${rooms.length}`,left+width-12,top+height-12,'#92a38a',8,'right');
    c.restore();
  }
  function huntTracks(c, state) {
    if(state.mode!=='hunt'||!state.hunt)return;
    const current=state.room&&state.room.index,run=state.hunt,rooms=values(state.rooms),time=num(state.time);
    const tracks=values(run.tracks).filter(track=>track.room===current&&num(track.time)<=time);
    for(const track of tracks){
      const from=rooms.find(room=>room.index===track.from),to=rooms.find(room=>room.index===track.to);
      if(!from||!to)continue;
      const dx=num(to.gx)-num(from.gx),dy=num(to.gy)-num(from.gy);
      if(!dx&&!dy)continue;
      const angle=Math.atan2(dy,dx),age=Math.max(0,time-num(track.time)),strength=Math.max(.22,.64-age*.004);
      c.save();c.translate(Math.max(44,Math.min(W-44,num(track.x))),Math.max(44,Math.min(H-44,num(track.y))));c.rotate(angle);
      alpha(c,strength,()=>{
        for(let i=0;i<3;i++){
          ellipse(c,-19+i*16,(i%2?-1:1)*6,6,3.4,'#ba9369');
          rect(c,-15+i*16,(i%2?-1:1)*6-2,3,4,'#d3ac7a');
        }
      });
      c.restore();
    }
    // Hearing reveals the doorway that made the sound, never a remote position.
    const arrival=run.arrival&&run.arrival.to===current?run.arrival:null;
    const heard=arrival?arrival.from:run.heardFrom;
    const doorway=values(state.portals).find(portal=>portal.target===heard);
    if(doorway&&!run.defeated&&heard!==null&&heard!==undefined){
      const x=num(doorway.x),y=num(doorway.y),room=rooms.find(value=>value.index===current),other=rooms.find(value=>value.index===heard);
      const dx=room&&other?num(room.gx)-num(other.gx):W/2-x,dy=room&&other?num(room.gy)-num(other.gy):H/2-y;
      const angle=Math.atan2(dy,dx);
      c.save();c.translate(x,y);c.rotate(angle);
      for(let i=0;i<3;i++){
        c.strokeStyle=i===0?'#efc797':'#c69c7190';c.lineWidth=i===0?2:1;
        c.beginPath();c.arc(5+i*10,0,13+i*5,-.65,.65);c.stroke();
      }
      c.restore();
      const inwardX=x+Math.cos(angle)*50,inwardY=y+Math.sin(angle)*50;
      label(c,arrival?'巨兽将至':'沉重脚步',inwardX,Math.max(46,Math.min(H-38,inwardY-33)),'#e7ba8b',10);
      if(arrival){
        const ratio=1-Math.max(0,Math.min(1,num(arrival.remaining)/Math.max(.01,num(arrival.duration,1.15))));
        bar(c,inwardX,Math.max(53,Math.min(H-26,inwardY-19)),38,ratio,'#e4ad7c',3);
      }
    }
  }
  function huntStatus(c,state){
    if(state.mode!=='hunt'||!state.hunt)return;
    const target=values(state.enemies).find(enemy=>enemy.huntTarget&&enemy.hp>0&&!enemy.dead);
    if(!target)return;
    const x=W/2;
    rect(c,x-136,18,272,61,'#102523e8');c.strokeStyle='#b77d5e70';c.lineWidth=1;c.strokeRect(x-135.5,18.5,271,60);
    label(c,'逐迹巨兽',x,31,'#e7b18a',12);
    bar(c,x,49,234,num(target.hp)/Math.max(1,num(target.maxHp,1)),'#c58d67',6);
    label(c,`${Math.max(0,Math.ceil(num(target.hp)))} / ${Math.max(1,Math.ceil(num(target.maxHp,1)))}`,x,66,'#dfc8a7',9);
  }
  function huntMap(c,state){
    if(state.practice||!state.hunt||!Array.isArray(state.rooms))return;
    const rooms=state.rooms.filter(room=>Number.isFinite(room.gx)&&Number.isFinite(room.gy));
    if(!rooms.length)return;
    const run=state.hunt,current=state.room&&state.room.index,visible=rooms.filter(room=>room.visited||room.discovered),time=num(state.time);
    const left=752,top=18,width=190,height=164,minX=Math.min(...rooms.map(room=>room.gx)),maxX=Math.max(...rooms.map(room=>room.gx)),minY=Math.min(...rooms.map(room=>room.gy)),maxY=Math.max(...rooms.map(room=>room.gy));
    const spacing=Math.min(44,140/Math.max(1,maxX-minX),67/Math.max(1,maxY-minY));
    const points=new Map(visible.map(room=>[room.index,{x:left+width/2+(room.gx-(minX+maxX)/2)*spacing,y:top+77+(room.gy-(minY+maxY)/2)*spacing,room}]));
    const targetVisible=values(state.enemies).some(enemy=>enemy.huntTarget&&enemy.hp>0&&!enemy.dead),lastSeen=run.lastSeenRoom===null||run.lastSeenRoom===undefined?null:points.get(run.lastSeenRoom);
    c.save();rect(c,left,top,width,height,'#102523e8');c.strokeStyle='#71886865';c.lineWidth=1;c.strokeRect(left+.5,top+.5,width-1,height-1);
    label(c,'苔火猎场',left+12,top+14,'#d8bb93',10,'left');
    label(c,run.defeated?'狩猎完成':targetVisible?'猎物在场':'追踪巨兽',left+width-12,top+14,run.defeated?'#bed9ad':'#d7b48d',8,'right');
    for(const room of visible){
      const point=points.get(room.index);
      for(const adjacent of values(room.neighbors)){
        const next=points.get(adjacent);
        if(next&&adjacent>room.index)path(c,[[point.x,point.y],[next.x,next.y]],room.visited&&next.room.visited?'#7b9270aa':'#70866a55',2);
      }
    }
    for(const room of visible){
      const point=points.get(room.index),active=room.index===current,size=active?15:12;
      rect(c,point.x-size/2-2,point.y-size/2-2,size+4,size+4,'#102523');rect(c,point.x-size/2,point.y-size/2,size,size,active?'#d9dca6':room.visited?'#657f63':'#203a32');
      c.strokeStyle=active?'#f2e4ad':'#7c927477';c.lineWidth=active?2:1;c.strokeRect(Math.round(point.x-size/2)+.5,Math.round(point.y-size/2)+.5,size,size);
      if(active)rect(c,point.x-2,point.y-2,4,4,'#20372e');
    }
    // The server's actual targetRoom is deliberately not consulted by this map.
    if(lastSeen&&!run.defeated){
      c.strokeStyle='#df9c73';c.lineWidth=2;c.beginPath();c.arc(lastSeen.x,lastSeen.y,11,0,Math.PI*2);c.stroke();
      label(c,targetVisible&&run.lastSeenRoom===current?'在场':'目击',lastSeen.x,lastSeen.y-19,'#dfad82',8);
    }
    const arrival=run.arrival&&run.arrival.to===current?run.arrival:null,heard=arrival?arrival.from:run.heardFrom,from=points.get(current),toward=points.get(heard);
    const currentRoom=rooms.find(room=>room.index===current);
    if(from&&toward&&!run.defeated&&values(currentRoom&&currentRoom.neighbors).includes(heard)){
      const x=(from.x+toward.x)/2,y=(from.y+toward.y)/2,angle=Math.atan2(toward.y-from.y,toward.x-from.x);
      c.save();c.translate(x,y);c.rotate(angle);path(c,[[-4,-4],[1,0],[-4,4]],'#efc797',2);c.restore();
    }
    const seenAge=Math.max(0,Math.floor(time-num(run.lastSeenAt))),caption=run.defeated?'猎场已肃清':arrival?'沉重脚步正在逼近':heard!==null&&heard!==undefined?'邻室传来沉重脚步':targetVisible?'目标就在这里':lastSeen?`目击 · ${seenAge} 秒前`:'寻找足迹与脚步';
    label(c,caption,left+12,top+height-38,'#c4c7a5',9,'left');
    const audible=run.noiseRoom===current&&time-num(run.noiseAt)<=1.5?Math.max(0,Math.min(3,Math.floor(num(run.noiseLevel)))):0;
    const noiseText=['静谧','轻微脚步','交战声响','巨响回荡'][audible],noiseColor=audible>=2?'#e2b587':'#a5bd9a';
    label(c,noiseText,left+12,top+height-14,noiseColor,8,'left');
    for(let i=0;i<3;i++)rect(c,left+width-37+i*8,top+height-16-i*2,5,4+i*2,i<audible?noiseColor:'#415c4d');
    c.restore();
  }
  function chapterMap(c, state) {
    if (!state.chapter || !Array.isArray(state.rooms)) return;
    const rooms = state.rooms.filter(room => Number.isFinite(room.gx) && Number.isFinite(room.gy));
    if (!rooms.length) return;
    const run = state.chapter, current = state.room && state.room.index, visible = rooms.filter(room => room.visited || room.discovered);
    const left = 752, top = 18, width = 190, height = 162;
    const minX = Math.min(...rooms.map(room => room.gx)), maxX = Math.max(...rooms.map(room => room.gx));
    const minY = Math.min(...rooms.map(room => room.gy)), maxY = Math.max(...rooms.map(room => room.gy));
    const spacing = Math.min(36, 144 / Math.max(1, maxX - minX), 74 / Math.max(1, maxY - minY));
    const points = new Map(visible.map(room => [room.index, { room, x: left + width / 2 + (room.gx - (minX + maxX) / 2) * spacing,
      y: top + 79 + (room.gy - (minY + maxY) / 2) * spacing }]));
    c.save(); rect(c, left, top, width, height, '#102523e8'); c.strokeStyle = '#a0845e80'; c.lineWidth = 1; c.strokeRect(left + .5, top + .5, width - 1, height - 1);
    label(c, '第一节 · 借火归营', left + 12, top + 15, '#e1c08a', 9, 'left');
    const phase = { depart: '启程', workshop: '探查工坊', core: '前往炉心', return: '带火归营', complete: '归火已成', failed: '探险中断' }[run.phase] || '第一节';
    label(c, phase, left + width - 12, top + 15, run.lampLit ? '#dce3b0' : '#bda98b', 8, 'right');
    for (const room of visible) {
      if (!room.visited) continue;
      const point = points.get(room.index);
      for (const nextIndex of values(room.neighbors)) {
        const next = points.get(nextIndex); if (!next) continue;
        path(c, [[point.x, point.y], [next.x, next.y]], run.fireTaken && next.room.visited ? '#c69b6380' : next.room.visited ? '#82937899' : '#63785e66', 2);
      }
    }
    for (const room of visible) {
      const point = points.get(room.index), active = room.index === current, size = active ? 14 : 10;
      rect(c, point.x - size / 2 - 2, point.y - size / 2 - 2, size + 4, size + 4, '#142c28');
      rect(c, point.x - size / 2, point.y - size / 2, size, size, active ? '#dfd7a0' : room.visited ? '#78866c' : '#334c3e');
      c.strokeStyle = active ? '#f2dda5' : room.index === 4 ? '#b99462' : '#8d987b70'; c.lineWidth = active ? 2 : 1;
      c.strokeRect(Math.round(point.x - size / 2) + .5, Math.round(point.y - size / 2) + .5, size, size);
      if (room.index === 0) {
        rect(c, point.x - 2, point.y - 6, 4, 11, run.lampLit ? '#f7ce7c' : '#9ba783');
        rect(c, point.x - 4, point.y - 5, 8, 3, run.lampLit ? '#fff0b5' : '#c5c8a0');
      } else if (room.index === 4) {
        path(c, [[point.x, point.y - 5], [point.x + 4, point.y], [point.x, point.y + 5], [point.x - 4, point.y], [point.x, point.y - 5]], run.fireTaken ? '#f6ce86' : '#a5ae91', 2);
      } else if (room.visited && room.index === 3) {
        path(c, [[point.x - 4, point.y], [point.x - 1, point.y + 2], [point.x + 3, point.y]], run.sluiceOpen ? '#a5d3c2' : '#6e9c96', 2);
      } else if (room.visited && (room.index === 5 || room.index === 6)) {
        rect(c, point.x - 2, point.y - 2, 4, 4, (room.index === 5 ? run.suppliesTaken : run.beaconLit) ? '#f0ca83' : '#b0b394');
      }
    }
    label(c, run.lampLit ? '第一盏归途灯已点亮' : run.fireTaken ? '火种同行 · 返回哨站' : '循着回收队的痕迹', left + 12, top + height - 33, run.lampLit ? '#e8d79e' : '#c1b895', 8, 'left');
    label(c, `线索 ${values(run.clues).length} / 3`, left + 12, top + height - 13, '#a8b39a', 8, 'left');
    label(c, `${rooms.filter(room => room.visited).length} / ${rooms.length}`, left + width - 12, top + height - 13, '#92a38a', 8, 'right');
    c.restore();
  }
  function minimap(c, state) {
    if (state.mode === 'chapter') { chapterMap(c, state); return; }
    if (state.mode === 'relay') { relayMap(c, state); return; }
    if (state.mode === 'hunt') { huntMap(c, state); return; }
    if (state.practice || state.mode !== 'random' || !Array.isArray(state.rooms) || !state.rooms.length) return;
    const rooms = state.rooms.filter(room => Number.isFinite(room.gx) && Number.isFinite(room.gy));
    if (!rooms.length) return;
    const bossIndex = state.bossIndex, current = state.room && state.room.index, progress = state.exploration || {};
    const visible = rooms.filter(room => room.visited || room.discovered || room.index === bossIndex);
    // Concealed rooms and their connections never reach the drawing pass.
    const points = new Map(), left = 752, top = 18, width = 190, height = 150;
    const minX = Math.min(...rooms.map(room => room.gx)), maxX = Math.max(...rooms.map(room => room.gx));
    const minY = Math.min(...rooms.map(room => room.gy)), maxY = Math.max(...rooms.map(room => room.gy));
    const spacing = Math.min(30, 152 / Math.max(1, maxX - minX), 92 / Math.max(1, maxY - minY));
    const centerX = left + width / 2, centerY = top + 77;
    rooms.forEach(room => points.set(room.index, { x: centerX + (room.gx - (minX + maxX) / 2) * spacing, y: centerY + (room.gy - (minY + maxY) / 2) * spacing, room }));
    c.save();
    rect(c, left, top, width, height, '#102523e8');
    c.strokeStyle = '#71886865'; c.lineWidth = 1; c.strokeRect(left + .5, top + .5, width - 1, height - 1);
    label(c, '遗迹地图', left + 12, top + 13, '#a9ba97', 9, 'left');
    const wakeColor = progress.bossDefeated ? '#b8d8a0' : progress.bossAwake ? '#e9bc78' : '#879c8b';
    label(c, progress.bossDefeated ? '已击败' : progress.bossAwake ? '已苏醒' : '沉睡', left + width - 12, top + 13, wakeColor, 8, 'right');
    for (const room of visible) {
      if (!room.visited) continue;
      const point = points.get(room.index);
      for (const adjacent of values(room.neighbors)) {
        const next = points.get(adjacent);
        if (!next || !(next.room.visited || next.room.discovered)) continue;
        path(c, [[point.x, point.y],[next.x, next.y]], next.room.visited ? '#7b9270aa' : '#70866a55', 2);
      }
    }
    for (const room of visible) {
      const point = points.get(room.index), isCurrent = room.index === current, isBoss = room.index === bossIndex;
      const size = isCurrent ? 13 : 10, half = size / 2;
      rect(c, point.x - half - 2, point.y - half - 2, size + 4, size + 4, '#102523');
      rect(c, point.x - half, point.y - half, size, size, isCurrent ? '#d9dca6' : room.visited ? '#657f63' : '#203a32');
      c.strokeStyle = isCurrent ? '#f2e4ad' : isBoss ? wakeColor : '#7c927466'; c.lineWidth = isCurrent || isBoss ? 2 : 1;
      c.strokeRect(Math.round(point.x - half) + .5, Math.round(point.y - half) + .5, size, size);
      // A discovered refuge is an optional safe landmark. Its hidden room and
      // connections still never enter this pass; combat content needs a visit.
      if (isBoss) {
        c.fillStyle = progress.bossAwake ? '#f2c77c' : '#8fa295';
        c.beginPath(); c.moveTo(point.x, point.y - 5); c.lineTo(point.x + 4, point.y); c.lineTo(point.x, point.y + 5); c.lineTo(point.x - 4, point.y); c.closePath(); c.fill();
      } else if (room.kind === 'refuge') {
        path(c, [[point.x - 4, point.y + 4], [point.x + 4, point.y + 4]], '#d9bc83', 1.5);
        c.fillStyle = '#e6c58c'; c.beginPath(); c.moveTo(point.x - 3, point.y + 2); c.lineTo(point.x - 1, point.y - 4); c.lineTo(point.x + 1, point.y - 1); c.lineTo(point.x + 2, point.y - 3); c.lineTo(point.x + 3, point.y + 2); c.closePath(); c.fill();
      } else if (room.visited && room.elite) {
        rect(c, point.x - 2, point.y - 2, 4, 4, '#e5bc70');
        if(room.eventKind==='breach')path(c,[[point.x-5,point.y-5],[point.x-2,point.y-1],[point.x-4,point.y+1],[point.x-1,point.y+5]],'#c6c19b',1.5);
      } else if (room.visited && room.eventKind === 'sluice') {
        path(c,[[point.x-3,point.y-1],[point.x,point.y+1],[point.x+3,point.y-1]],'#8dbcb8',2);
      } else if (room.visited && room.eventKind === 'lift') {
        rect(c,point.x-3,point.y-3,2,6,'#d3c795');rect(c,point.x+1,point.y-3,2,6,'#d3c795');
      } else if (room.visited && room.eventKind === 'forge') {
        path(c,[[point.x-4,point.y-3],[point.x+4,point.y-3],[point.x+2,point.y],[point.x-2,point.y],[point.x-4,point.y-3]],'#e0bb7e',1);rect(c,point.x-1,point.y,2,4,'#e0bb7e');
      } else if (room.visited && room.eventKind === 'storehouse') {
        c.strokeStyle='#b5c8a1';c.lineWidth=1;c.strokeRect(point.x-3.5,point.y-2.5,7,6);rect(c,point.x-1,point.y-1,2,3,'#b5c8a1');
      } else if (room.visited && room.encounter === 'crossfire') {
        path(c, [[point.x - 3, point.y - 3], [point.x + 3, point.y + 3]], '#c6b38a', 1);
        path(c, [[point.x + 3, point.y - 3], [point.x - 3, point.y + 3]], '#c6b38a', 1);
      } else if (room.visited && room.encounter === 'bulwark') {
        path(c, [[point.x - 3, point.y - 3], [point.x + 3, point.y - 3], [point.x + 3, point.y + 1], [point.x, point.y + 4], [point.x - 3, point.y + 1], [point.x - 3, point.y - 3]], '#c6bc92', 1);
      } else if (room.visited && room.encounter === 'patrol') {
        rect(c, point.x - 3, point.y - 2, 2, 2, '#b9c6a2'); rect(c, point.x + 1, point.y + 1, 2, 2, '#b9c6a2');
      }
      if (isCurrent) rect(c, point.x - 1, point.y - 1, 2, 2, '#20372e');
    }
    const kills = Math.min(num(progress.target), num(progress.kills)), target = num(progress.target);
    label(c, progress.bossDefeated ? '归途已开启' : progress.bossAwake ? '◆  炉心守卫' : `唤醒 ${kills} / ${target}`, left + 12, top + height - 12, wakeColor, 9, 'left');
    const discovered = rooms.filter(room => room.visited).length;
    label(c, `${discovered} / ${rooms.length}`, left + width - 12, top + height - 12, '#92a38a', 8, 'right');
    c.restore();
  }
  function draw(c, state, options = {}) {
    if (!c || !state) { if (c) preview(c); return; }
    const time = num(options.now, performance.now()), localId = options.localId || 'p1';
    const still=!!(options.paused||options.reducedMotion),events = combatEvents(state), motion = combatMotion(events, still);
    const enemyPoses = enemyMotionFrame(c, state, options), enemyTime = num(state.time) * 1000;
    c.save(); c.imageSmoothingEnabled = false; c.clearRect(0, 0, W, H);
    rect(c,0,0,W,H,'#142a28'); c.save(); c.translate(motion.x,motion.y);
    floor(c, state);
    chapterFloor(c, state, time);
    expeditionFloor(c, state, time, still);
    lanternAuras(c, state);
    values(state.walls).forEach(w => wall(c, w));
    breachScene(c,state,time,localId,still);
    values(state.doors).forEach(d => door(c, d, time));
    values(state.portals).forEach(p => portal(c, p, time));
    values(state.portals).forEach(p => portalDestination(c, p, state, localId));
    huntTracks(c,state);
    values(state.switches).forEach(s => pressureSwitch(c, s, time));
    values(state.fountains).forEach(f => fountain(c, f, time));
    values(state.fires).forEach(f => fire(c, f, time));
    values(state.pickups).forEach(p => pickup(c, p, time));
    const torchList = values(state.torches || state.lanterns);
    if (torchList.length) torchList.forEach(t => lantern(c, t.x, t.y, time));
    else { lantern(c, 77, 53, time); lantern(c, W - 77, 53, time); lantern(c, 77, H - 47, time); lantern(c, W - 77, H - 47, time); }
    // Small friendly bodies stay below both danger footprints and all actors.
    // Their position belongs to the engine; the renderer adds only a tiny hop.
    values(state.companions).forEach(fox=>foxCompanion(c,fox,time,state,localId,still));
    values(state.enemies).forEach(e => rhythmArea(c, e, state, localId));
    // All sprites share a ground plane, so passing behind a crate feels natural.
    const sprites = [
      ...values(state.decoys).map(d => ({ y: num(d.y)-.25, draw: () => decoy(c, d, time) })),
      ...values(state.props).filter(p => !p.carriedBy && !p.destroyed && (p.hp == null || p.hp > 0) && (p.kind !== 'core' || !state.relay || !state.relay.delivered && state.relay.coreRoom === (state.room && state.room.index))).map(p => ({ y: p.y, draw: () => prop(c, p, time) })),
      ...values(state.interactables).map(item => ({ y: item.y, draw: () => interactable(c, item, time, state, localId, still) })),
      ...values(state.enemies).map(e => ({ y: e.y, draw: () => enemy(c, e, enemyTime, events, still, state.mode === 'chapter', state.mode === 'random', enemyPoses.get(e.id)) })),
      ...values(state.players).map(p => ({ y: p.y, draw: () => player(c, p, time, localId, state) }))
    ];
    sprites.sort((a,b) => num(a.y) - num(b.y)).forEach(s => s.draw());
    values(state.bullets).forEach(b => bullet(c, b, state));
    values(state.particles).forEach(p => particle(c, p, time));
    combatEffects(c, events, state, still);
    aimReticle(c, state.players && state.players[localId], time);
    ambient(c, state, time);
    c.restore();
    if (motion.flash > 0) alpha(c,motion.flash,()=>rect(c,0,0,W,H,'#fff0c4'));
    practiceStatus(c,state);
    huntStatus(c,state);
    minimap(c, state);
    c.restore();
  }

  function previewAtmosphere(c, time) {
    // Title-menu atmosphere stays in the courtyard on the right. Slow, faint
    // specks do not drift through the navigation or resemble combat bullets.
    for (let i = 0; i < 12; i++) {
      const x = 574 + (i * 61.7) % 314 + Math.sin(time * .00012 + i * 1.7) * 8;
      const y = 89 + ((i * 43.3 + 371 - time * .0018) % 371 + 371) % 371;
      alpha(c, .10 + (1 + Math.sin(time * .0004 + i)) * .045,
        () => rect(c, x, y, 1, 1, '#d8c795'));
    }
    // Each ember fades out before returning to the hearth. A low-opacity wisp
    // and steady warm pool connect the flame to the quiet courtyard around it.
    glow(c, 703, 369, 108 + Math.sin(time * .0007) * 2, '#eda45112');
    for (let i = 0; i < 5; i++) {
      const phase = ((time * (.00011 + i * .000006) + i * .21) % 1 + 1) % 1;
      const x = 703 + Math.sin(phase * 5 + i * 2.1) * (7 + phase * 12);
      const y = 365 - phase * 105;
      alpha(c, Math.sin(phase * Math.PI) * .46,
        () => rect(c, x, y, i % 2 ? 1 : 2, 2, '#efbe78'));
    }
    for (let i = 0; i < 2; i++) {
      const phase = ((time * .00007 + i * .5) % 1 + 1) % 1;
      alpha(c, Math.sin(phase * Math.PI) * .034,
        () => ellipse(c, 705 + Math.sin(phase * 3 + i) * 11, 346 - phase * 66, 10 + phase * 12, 6 + phase * 10, '#b8b19a'));
    }
    const vignette = c.createRadialGradient(480, 300, 200, 480, 300, 590);
    vignette.addColorStop(0, '#071a2300'); vignette.addColorStop(.75, '#071a2315'); vignette.addColorStop(1, '#071a2399');
    c.fillStyle = vignette; c.fillRect(0, 0, W, H);
  }

  function preview(c, profile = {}) {
    enemyMotionCache.delete(c);
    if (!c) return;
    // Callers explicitly supply animation time. Older calls are deterministic,
    // while reduced motion keeps the complete lit scene without moving specks.
    const time = profile.reducedMotion ? 0 : Math.max(0, num(profile.now)) * .68;
    c.save(); c.imageSmoothingEnabled = false;
    if (!floorCache.has('camp-preview')) floorCache.set('camp-preview', makeFloor('camp-preview', 'camp'));
    c.drawImage(floorCache.get('camp-preview'), 0, 0);
    // The camp is a title backdrop: soften the tile pattern so the fire,
    // adventurers and account entrance each keep a clear visual place.
    rect(c, 0, 0, W, H, '#10202791');
    // A camp tucked into the open courtyard, visible to the right of the title.
    c.save(); c.globalAlpha *= .62;
    wall(c, { x: 0, y: 0, w: 960, h: 32 }); wall(c, { x: 0, y: 0, w: 31, h: 600 }); wall(c, { x: 929, y: 0, w: 31, h: 600 }); wall(c, { x: 0, y: 568, w: 960, h: 32 });
    wall(c, { x: 652, y: 47, w: 237, h: 34 });
    wall(c, { x: 653, y: 48, w: 34, h: 145 }); wall(c, { x: 855, y: 48, w: 34, h: 145 });
    // The sleeping doorway: an original arched ruin built from blocky stones.
    rect(c, 712, 68, 117, 122, '#10282a'); rect(c, 725, 81, 91, 109, '#192f2d');
    rect(c, 707, 102, 18, 89, '#5c755e'); rect(c, 816, 102, 18, 89, '#49644e');
    rect(c, 721, 81, 19, 30, '#718566'); rect(c, 801, 81, 19, 30, '#637d5b'); rect(c, 737, 66, 65, 24, '#6b825e');
    rect(c, 749, 61, 42, 12, '#84966c'); rect(c, 750, 89, 40, 3, '#3d5d46');
    crystal(c, 770, 116, 1.1, '#b3c08a');
    rect(c, 729, 170, 83, 10, '#2a4438'); rect(c, 718, 181, 106, 9, '#5b7052'); rect(c, 708, 191, 126, 9, '#465d45');
    for (let i = 0; i < 4; i++) { grass(c, 652 + i * 10, 89 + (i % 2) * 4, '#8fa15f'); grass(c, 864 + i * 6, 98 + (i % 2) * 5, '#708c52'); }
    lantern(c, 682, 116, time, 1.1); lantern(c, 860, 116, time, 1.1);
    c.restore();
    // Faded path from the campfire to the old gate.
    for (let i = 0; i < 6; i++) { const x = 736 + Math.sin(i * .8) * 14, y = 225 + i * 42; rect(c, x, y, 35, 23, '#50614444'); rect(c, x + 2, y + 2, 30, 1, '#75825a33'); }
    // A bedroll and one supply crate frame the quiet camp rather than a row
    // of interactive-looking objects competing with the menu.
    c.save(); c.globalAlpha *= .62;
    shadow(c, 854, 331, 31); rect(c, 831, 307, 42, 38, '#1a302c'); rect(c, 834, 309, 36, 33, '#697858'); rect(c, 835, 311, 34, 7, '#a5aa79'); rect(c, 836, 320, 4, 20, '#859165'); rect(c, 867, 320, 3, 20, '#425e47'); rect(c, 843, 312, 16, 4, '#bec096');
    prop(c, { kind:'crate', x: 870, y: 404 }, time);
    c.restore();
    // Deliberately roomy camp: the title and scene can breathe together.
    glow(c, 703, 376, 145, '#d69e5121');
    fire(c, { x: 703, y: 376, r: 24, active:true }, time);
    for (const [x,y] of [[676,376],[684,391],[705,396],[727,385],[729,369],[712,357],[689,357]]) { ellipse(c,x,y,7,4,'#182e2b'); rect(c,x-5,y-4,10,6,'#788369'); rect(c,x-4,y-4,8,2,'#9a9e7b'); }
    player(c, { id:'p1',x:647,y:375,r:14,hp:100,maxHp:100,weapon:'pistol',facing:.2 }, time, '', { players:[],props:[] });
    player(c, { id:'p2',x:754,y:411,r:14,hp:100,maxHp:100,weapon:'pistol',facing:-2.2 }, time, '', { players:[],props:[] });
    if(profile.companion&&profile.companion.kind==='fox'){
      shadow(c,679,439,10,.22);c.save();c.translate(679,439);
      foxBody(c,{id:'camp-fox',kind:'fox',ownerId:'p1',name:profile.companion.name,facing:-.4,mode:'idle',assistTime:0},time,!!profile.reducedMotion);c.restore();
    }
    // Broken column in the foreground, with a scattering of young plants.
    c.save(); c.globalAlpha *= .48;
    wall(c, { x: 551, y: 481, w: 53, h: 40 }); rect(c, 546, 477, 63, 9, '#78906b'); rect(c, 552, 474, 48, 4, '#9caa7b'); grass(c, 558, 476, '#a1af74');
    for (const [x,y,s] of [[629,491,1.4],[907,510,1.3],[803,527,1]]) grass(c,x,y,'#6f8c50',s);
    c.restore();
    // These three repaired lamps are the expedition campaign's visible goal.
    const lit = Math.max(profile.chapter1 ? 1 : 0, Math.max(0, Math.min(3, Math.floor(num(profile.lit)))));
    for (let i = 0; i < 3; i++) {
      const x = 665 + i * 73, y = 511;
      shadow(c,x,y,19,.25);rect(c,x-16,y-4,32,11,'#334f42');rect(c,x-18,y-8,36,6,'#6c8160');rect(c,x-13,y-11,26,4,'#92a078');rect(c,x-2,y-21,4,12,'#6d7d55');
      if (i < lit) lantern(c,x,y-33,time,.9);
      else { rect(c,x-7,y-44,14,18,'#263d34');rect(c,x-5,y-42,10,13,'#405846');rect(c,x-3,y-40,6,10,'#2a4136');rect(c,x-8,y-45,16,3,'#7b8b65');rect(c,x-8,y-28,16,3,'#6a7d59');rect(c,x-2,y-48,4,3,'#70845d'); }
      alpha(c,.45,()=>label(c,['炉心','物资','守夜'][i],x,y+15,i<lit?'#d8c58b':'#809676',8));
    }
    alpha(c,.45,()=>label(c,`归途灯 · ${lit} / 3`,739,553,'#bdc499',9));
    if (profile.chapter1) {
      // Returning collectors and their recovered cart stay in the camp after
      // chapter completion, giving the restored lamp a visible consequence.
      for (const [x, y, flip] of [[842, 253, 1], [898, 291, -1]]) {
        shadow(c, x, y, 14, .3); rect(c, x - 7, y + 3, 5, 10, '#23382d'); rect(c, x + 3, y + 3, 5, 10, '#23382d');
        rect(c, x - 10, y - 14, 20, 20, '#7c7651'); rect(c, x - 9, y - 13, 5, 17, '#b5a571');
        rect(c, x - 8, y - 28, 16, 15, '#bd9e76'); rect(c, x - 11, y - 29, 22, 6, '#786a45');
        rect(c, x - 6, y - 16, 13, 4, '#b67d48'); rect(c, x + flip * 10 - 3, y - 12, 6, 17, '#53674a');
        rect(c, x - 14, y - 5, 28, 18, '#715e3e'); rect(c, x - 12, y - 4, 24, 14, '#aa8c58'); rect(c, x - 2, y - 5, 4, 18, '#d0b978');
      }
      rect(c, 861, 313, 47, 6, '#88754c'); rect(c, 866, 293, 37, 23, '#5e6648'); rect(c, 869, 294, 31, 5, '#adb183');
      for (const x of [870, 899]) { ellipse(c, x, 322, 6, 6, '#22372b'); ellipse(c, x, 322, 3, 3, '#a78b57'); }
      alpha(c,.5,()=>label(c, '采集队已归营', 868, 228, '#d7c48f', 9));
    }
    lantern(c, 904, 529, time, .85);
    previewAtmosphere(c, time); c.restore();
  }
  window.AdventureRenderer = { draw, preview };
})();
