/* Original, code-drawn art for Ruin Runners. No image assets required. */
(() => {
  'use strict';
  const W = 960, H = 600, TILE = 32;
  const palette = { ink: '#142326', outline: '#0f2024', stone: '#4e6555', moss: '#6a8250', gold: '#e4b96b', mint: '#abc592' };
  const floorCache = new Map();
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
  function fountain(c, f, time) {
    const x=num(f.x),y=num(f.y),r=num(f.r,24);
    ellipse(c,x,y+4,r+4,r*.62,'#122a2a');ellipse(c,x,y,r+2,r*.6,'#657c68');ellipse(c,x,y-2,r-3,(r-3)*.56,'#214c50');ellipse(c,x,y-3,r-6,(r-6)*.5,'#4f8582');
    c.strokeStyle='#b5d4bb77';c.lineWidth=1;c.beginPath();c.ellipse(x,y-3,r*.46+Math.sin(time*.003)*2,r*.23,0,0,Math.PI*2);c.stroke();
    rect(c,x-2,y-13,4,10,'#b7d8c0');rect(c,x-1,y-17+Math.sin(time*.004)*2,2,4,'#d2e4c9');
    for(let i=0;i<4;i++){const a=i*Math.PI/2+.5;rect(c,x+Math.cos(a)*r-3,y+Math.sin(a)*r*.5-4,6,4,'#8d9b7a');}
    label(c,'补水泉',x,y+r*.6+12,'#a6c5ad',8);
  }
  function interactable(c, item, time, state, localId) {
    if (!item || (item.kind === 'relic' && item.used)) return;
    const x = num(item.x), y = num(item.y), kind = item.kind, active = item.active !== false && !item.used;
    const p = state.players && state.players[localId], nearby = p && !p.downed && Math.hypot(num(p.x) - x, num(p.y) - y) < 100;
    const color = kind === 'cache' ? '#9ac9c3' : kind === 'relic' ? item.buff === 'vigor' ? '#e3a38a' : item.buff === 'swift' ? '#b9d698' : '#a0c8df' : kind === 'extraction' ? '#bed6a3' : '#e9c780';
    shadow(c, x, y, kind === 'beacon' ? 28 : 19, .3);
    if (active) {
      glow(c, x, y - 8, nearby ? 66 : 44, kind === 'cache' ? '#a6d8cc1c' : '#d3d8a51c');
      c.strokeStyle = color + (nearby ? 'a0' : '48'); c.lineWidth = nearby ? 2 : 1; c.setLineDash([4,5]); c.beginPath(); c.ellipse(x, y + 7, 25 + Math.sin(time * .003) * 2, 11, 0, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    }
    c.save(); c.translate(Math.round(x), Math.round(y));
    if (kind === 'cache') {
      rect(c, -20, -11, 40, 26, '#112c2c'); rect(c, -18, -11, 36, 23, '#405d58'); rect(c, -16, -9, 32, 18, '#5a7970'); rect(c, -16, -9, 5, 18, '#829982'); rect(c, 11, -9, 5, 18, '#345650');
      rect(c, -19, item.used ? -21 : -16, 38, 7, item.used ? '#849f87' : '#7d9e8b'); rect(c, -16, item.used ? -22 : -17, 32, 3, '#a7bca0');
      if (item.used) { rect(c, -14, -11, 28, 6, '#203f39'); rect(c, -9, -6, 18, 3, '#b6b389'); }
      else { rect(c, -4, -11, 8, 16, active ? '#b9d9c3' : '#857e60'); rect(c, -8, -7, 16, 7, active ? '#9fc9b6' : '#857e60'); rect(c, -2, -6, 4, 5, active ? '#edf2c7' : '#263e36'); }
      rect(c, -18, 10, 36, 4, '#294b40');
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
    } else if (kind === 'extraction') {
      ellipse(c, 0, 6, 31, 14, '#16342d'); ellipse(c, 0, 3, 27, 12, active ? '#6a8c61' : '#4c6250'); ellipse(c, 0, 1, 21, 9, '#254837');
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; rect(c, Math.cos(a) * 25 - 3, Math.sin(a) * 10 - 1, 6, 4, active ? '#b2d097' : '#667e5b'); }
      rect(c, -3, -43, 6, 43, '#445f45'); rect(c, -2, -44, 3, 42, active ? '#c8d4a1' : '#7b9067');
      c.fillStyle = active ? '#a4c786' : '#637b58'; c.beginPath(); c.moveTo(1,-42); c.lineTo(25,-35); c.lineTo(4,-25); c.closePath(); c.fill();
      if (active) { glow(c, 1, -35, 55, '#a9d59220'); path(c, [[-13,-12],[-6,-19],[1,-12]], '#c4ddac', 3); path(c, [[-13,-20],[-6,-27],[1,-20]], '#c4ddac88', 2); }
    } else if (kind === 'relic') {
      ellipse(c, 0, 6, 19, 8, '#213e36'); rect(c, -14, -3, 28, 9, '#4d6753'); rect(c, -12, -6, 24, 5, '#879a72');
      const bob = Math.sin(time * .003 + x) * 3; c.translate(0, bob - 22); glow(c, 0, 0, 37, item.buff === 'vigor' ? '#e3a38a22' : item.buff === 'swift' ? '#b9d69822' : '#a0c8df22');
      if (item.buff === 'swift') {
        c.save(); c.rotate(.45); rect(c,-3,-13,6,26,'#729675');rect(c,-1,-13,2,28,'#e1e6b6');for(let i=0;i<4;i++){rect(c,-9+i*2,-10+i*5,8-i,4,'#b8cf99');rect(c,2,-9+i*5,7-i,4,'#8eb789');}c.restore();
      } else if (item.buff === 'vigor') {
        rect(c,-10,-6,20,13,'#56774f');rect(c,-7,-10,14,20,'#8cab76');rect(c,-3,-8,6,16,'#e5bd92');rect(c,-8,-3,16,6,'#e5bd92');rect(c,-2,-7,3,14,'#f5d8aa');
      } else {
        c.save();c.rotate(Math.PI/4);rect(c,-10,-10,20,20,'#527c87');rect(c,-7,-7,14,14,'#9cc8ce');rect(c,-4,-4,8,8,'#e6eac2');c.restore();path(c,[[-17,1],[17,-2]],'#cfebe0',2);rect(c,12,-4,7,4,'#eff5c7');
      }
    }
    c.restore();
    const name = item.used ? '已回收' : item.label || (kind === 'cache' ? '物资箱' : kind === 'extraction' ? '撤离点' : '遗物');
    label(c, nearby && active ? 'E · ' + name : name, x, y + (kind === 'relic' ? 25 : 30), item.used ? '#758f7b' : active ? color : '#7e927b', kind === 'relic' ? 9 : 10);
    if (nearby && item.description && !item.used) label(c, item.description, x, y + (kind === 'relic' ? 42 : 47), active ? '#c6d0aa' : '#94a58c', 8);
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
  function player(c, p, time, localId, state) {
    if (!p || p.dead) return;
    const x = num(p.x), y = num(p.y), isLocal = (p.id || '') === localId || (!localId && (p.id === 'p1' || !p.id));
    const second = p.id === 'p2' || p.color === '#f08c69', main = second ? '#bb7867' : '#8fae7d', light = second ? '#e1a179' : '#c1d09c', dark = second ? '#805e58' : '#536f56';
    const movement = Math.hypot(num(p.vx), num(p.vy)) > 3 || p.moving;
    const step = movement ? Math.sin(time * .02) * 2 : Math.sin(time * .0025 + x) * .5;
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
    if (p.weapon === 'blade') blade(c, 0, -3, facing, p.guarding, p.meleeTime > 0);
    else gun(c, 0, -3, facing, p.weapon, '#aebaa0');
    if (p.weapon !== 'blade' && p.fireCd > (p.weapon === 'scatter' ? .48 : .155)) {
      c.save(); c.translate(Math.cos(facing) * (p.weapon === 'scatter' ? 31 : 25), -3 + Math.sin(facing) * (p.weapon === 'scatter' ? 31 : 25)); c.rotate(facing);
      rect(c,-2,-4,10,8,'#f3d496');rect(c,2,-2,10,4,'#fff3c6');rect(c,2,-7,4,14,'#f3d496');c.restore();
    }
    c.restore();
    if (p.guarding) {
      const ready = p.guardWindow > 0, color = ready ? '#fff1b9' : '#9cb9af';
      c.strokeStyle = color; c.lineWidth = ready ? 4 : 2; c.beginPath(); c.arc(x, y, 24, facing - .85, facing + .85); c.stroke();
      if (ready) { c.strokeStyle = '#ffe6a650'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 29, facing - .85, facing + .85); c.stroke(); }
    }
    if (p.counterTime > 0) {
      const color = p.counterKind === 'mikiri' ? '#eac2a2' : p.counterKind === 'dodge' ? '#a8ddd5' : '#f4d58c';
      c.strokeStyle = color; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 23, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p.counterTime / 1.25)); c.stroke();
      // A short-lived actionable state, rather than a permanent control reminder.
      label(c, '反击', x, y + 34, color, 10);
    }
    if (p.hp < p.maxHp) bar(c, x, y - 39, 28, p.hp / Math.max(1, p.maxHp), p.hp / p.maxHp < .3 ? '#df8e73' : '#adc98d');
    if (values(state.players).length > 1) label(c, second ? '伙伴' : isLocal ? '你' : '队长', x, y - 48, second ? '#e0ae93' : '#bdcf9f', 8);
    if (p.carry) {
      const heldProp = values(state.props).find(v => v.id === p.carry) || { kind: 'crate' };
      const ang = num(p.facing); prop(c, { ...heldProp, x: x + Math.cos(ang) * 22, y: y + Math.sin(ang) * 17 - 9, thrown: false }, time, true);
    }
  }

  function enemy(c, e, time) {
    if (!e || e.hp <= 0 || e.dead) return;
    const x = num(e.x), y = num(e.y), kind = e.kind || e.type, boss = kind === 'boss', r = num(e.r, boss ? 27 : 15), step = Math.sin(time * .012 + x) * 1.5;
    shadow(c, x, y, r, .43);
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
    if (kind === 'charger' && e.chargeTime > 0) { const a = Math.atan2(num(e.chargeY), num(e.chargeX, 1)); path(c, [[x - Math.cos(a) * 46, y - Math.sin(a) * 46],[x,y]], '#e6ab7470', 18); }
    c.save(); c.translate(Math.round(x), Math.round(y));
    if (boss) {
      glow(c, 0, -12, 56, '#cfa66217');
      rect(c, -21, 5 + step, 15, 16, '#192c2b'); rect(c, 8, 5 - step, 15, 16, '#192c2b'); rect(c, -20, 6 + step, 13, 12, '#62725c'); rect(c, 9, 6 - step, 13, 12, '#62725c');
      rect(c, -25, -24, 50, 34, '#142b29'); rect(c, -21, -23, 43, 31, '#71836a'); rect(c, -20, -21, 10, 28, '#8c9b7b'); rect(c, 10, -21, 11, 28, '#526a56'); rect(c, -16, -12, 33, 17, '#4e6552');
      rect(c, -31, -26 + step, 14, 27, '#7e8b6a'); rect(c, -34, -22 + step, 5, 21, '#475f4b'); rect(c, 19, -26 - step, 14, 27, '#718363'); rect(c, 30, -22 - step, 5, 21, '#405947');
      rect(c, -17, -47, 34, 25, '#162d2b'); rect(c, -15, -45, 30, 23, '#7f8f70'); rect(c, -13, -45, 8, 20, '#a1ad84'); rect(c, 7, -45, 8, 20, '#5a7257'); rect(c, -20, -45, 40, 7, '#596f52'); rect(c, -12, -49, 24, 5, '#a1ad78');
      rect(c, -10, -35, 7, 4, '#e7b96d'); rect(c, 4, -35, 7, 4, '#e7b96d'); rect(c, -8, -26, 16, 3, '#334b3e');
      c.save(); c.rotate(Math.PI / 4); rect(c, -6, -7, 12, 12, '#c8ab63'); rect(c, -3, -4, 6, 6, '#eee0a0'); c.restore();
      grass(c, -12, -48, '#9cab6b'); grass(c, 12, -42, '#879f63');
    } else if (kind === 'duelist') {
      const staggered = e.stagger > 0, attack = e.rhythm || {}, raised = attack.phase === 'windup';
      if (staggered) c.rotate(-.13);
      rect(c,-10,4+step,7,12,'#172b29');rect(c,4,4-step,7,12,'#172b29');rect(c,-9,5+step,6,8,'#8b8570');rect(c,4,5-step,6,8,'#8b8570');
      rect(c,-15,-17,30,25,'#142c2a');rect(c,-12,-16,24,22,'#787f72');rect(c,-11,-16,7,20,'#a8ac8a');rect(c,5,-15,7,20,'#4e655c');
      rect(c,-14,2,29,5,'#b7a273');rect(c,-3,-16,6,20,'#a66453');rect(c,-8,7,7,10,'#675a4c');rect(c,2,7,7,10,'#675a4c');
      rect(c,-12,-35,24,22,'#203733');rect(c,-10,-34,20,19,'#9b9f86');rect(c,-9,-33,6,16,'#c5c6a4');rect(c,5,-31,5,15,'#647d6c');
      rect(c,-10,-26,20,6,'#243d36');rect(c,-6,-25,4,2,'#efc997');rect(c,3,-25,4,2,'#efc997');
      rect(c,-14,-36,28,5,'#70826b');rect(c,-4,-42,8,7,'#b89d68');rect(c,-2,-46,4,5,'#e0bd79');
      const facing = num(attack.angle, num(e.facing));
      blade(c, 0, -3, facing + (raised && attack.type === 'quake' ? -1.15 : raised && attack.type === 'sweep' ? .8 : 0), raised, attack.phase === 'active', true);
    } else if (kind === 'shield') {
      rect(c,-10,3+step,7,12,'#172b29');rect(c,4,3-step,7,12,'#172b29');rect(c,-10,4+step,7,7,'#827f68');rect(c,4,4-step,7,7,'#827f68');
      rect(c,-14,-16,28,24,'#172c2b');rect(c,-12,-15,24,21,'#65796c');rect(c,-11,-14,7,19,'#a0a68a');rect(c,5,-13,7,18,'#405d54');rect(c,-13,3,27,5,'#b49b66');
      rect(c,-11,-33,22,21,'#1c3330');rect(c,-10,-32,20,18,'#a4aa8b');rect(c,-9,-31,5,16,'#bec29a');rect(c,4,-30,5,16,'#6e8770');rect(c,-9,-24,18,5,'#293f37');rect(c,-6,-23,4,2,'#e7c584');rect(c,3,-23,4,2,'#e7c584');rect(c,-13,-33,26,5,'#687f62');rect(c,-3,-37,6,5,'#c5b078');
      c.save();c.rotate(num(e.facing)+(e.shieldOpen>0||e.stun>0?-.5:0));rect(c,14,-18,9,36,'#142e2a');rect(c,15,-17,8,34,e.shieldOpen>0||e.stun>0?'#748975':'#b3a56c');rect(c,14,-13,8,26,'#6e8163');rect(c,20,-11,4,22,e.shieldOpen>0||e.stun>0?'#91a080':'#d4c18a');rect(c,17,-5,8,10,'#b8aa75');rect(c,18,-2,6,4,'#e1ce97');c.restore();
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
      gun(c, 0, -3, num(e.facing), 'pistol', '#c8ae79', true);
    } else {
      rect(c, -9, 4 + step, 6, 9, '#1a302b'); rect(c, 4, 4 - step, 6, 9, '#1a302b'); rect(c, -9, 5 + step, 5, 5, '#675d45'); rect(c, 4, 5 - step, 5, 5, '#675d45');
      rect(c, -11, -10, 22, 17, '#193029'); rect(c, -9, -10, 18, 16, '#60724d'); rect(c, -8, -10, 5, 14, '#83915e'); rect(c, -10, 2, 21, 5, '#5b5c3f');
      rect(c, -15, -22, 30, 6, '#213b2c'); rect(c, -13, -21, 26, 4, '#81925c'); rect(c, -10, -26, 20, 17, '#20392d'); rect(c, -8, -25, 16, 15, '#9ca773'); rect(c, -8, -24, 5, 13, '#b6ba84'); rect(c, -5, -19, 3, 3, '#422f2a'); rect(c, 4, -19, 3, 3, '#422f2a'); rect(c, -2, -12, 8, 3, '#586a44');
      rect(c, -5, -29, 10, 5, '#5d774d'); rect(c, 0, -30, 6, 3, '#8ca165');
      c.save(); c.translate(13, -1 + step); c.rotate(.35); rect(c, -2, -12, 4, 20, '#2a3c2c'); rect(c, -1, -18, 3, 14, '#b7ba8a'); rect(c, -4, -5, 9, 3, '#8b7b4d'); c.restore();
    }
    if (boss && e.rhythm) {
      const attack = e.rhythm;
      blade(c, 0, -5, num(attack.angle, num(e.facing)) + (attack.phase === 'windup' && attack.type === 'quake' ? -1.1 : 0), attack.phase === 'windup', attack.phase === 'active', true);
    }
    if (e.hitFlash > 0 || e.flash > 0) { c.globalCompositeOperation = 'screen'; rect(c, boss ? -21 : -10, boss ? -43 : -24, boss ? 42 : 20, boss ? 55 : 31, '#d9d69c60'); }
    c.restore();
    if (kind === 'shield') { if(e.shieldOpen>0||e.stun>0)label(c,'破绽',x,y-46,'#eac891',8);else{c.strokeStyle='#d3c38b88';c.lineWidth=2;c.beginPath();c.arc(x,y,num(e.r,18)+10,num(e.facing)-Math.PI/3,num(e.facing)+Math.PI/3);c.stroke();} }
    if (e.hp < e.maxHp || boss || e.elite) bar(c, x, y - (boss ? 60 : e.elite ? 51 : 36), boss ? 64 : e.elite ? 43 : 25, e.hp / Math.max(1, e.maxHp || e.hp), boss || e.elite ? '#e2bb70' : '#d08d6f', boss || e.elite ? 4 : 3);
    if (e.maxPosture > 0 && (kind === 'duelist' || boss || e.elite && e.rhythm)) {
      bar(c, x, y - (boss ? 53 : e.elite ? 44 : 30), boss ? 64 : 43, num(e.posture) / e.maxPosture, e.stagger > 0 ? '#fff0b5' : '#d99c69', 3);
      if (e.stagger > 0) label(c, '失衡', x, y - (boss ? 91 : 87), '#ffe2a4', 10);
    }
    if (e.elite && !boss) {
      const crownY = y - 64;
      path(c, [[x - 8, crownY - 4],[x - 6, crownY + 2],[x + 6, crownY + 2],[x + 8, crownY - 4],[x + 3, crownY - 1],[x, crownY - 7],[x - 3, crownY - 1],[x - 8, crownY - 4]], '#e8c67d', 2);
      label(c, kind === 'duelist' ? '守刃者' : '精英', x, crownY - 15, '#ebcf8e', 8);
    }
    if (boss) label(c, '炉心守卫', x, y - 72, '#ddca97', 9);
  }
  function bullet(c, b) {
    const x = num(b.x), y = num(b.y), r = num(b.r, 3), friendly = b.friendly !== false;
    const vx = num(b.vx), vy = num(b.vy), speed = Math.hypot(vx, vy) || 1, dx = vx / speed, dy = vy / speed;
    c.lineCap = 'round'; path(c, [[x - dx * (friendly ? 11 : 7), y - dy * (friendly ? 11 : 7)], [x, y]], friendly ? '#efd89b60' : '#d98c7066', friendly ? 3 : 4); c.lineCap = 'butt';
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
  const rhythmColors = { combo: '#efc485', thrust: '#e8aa8e', sweep: '#a9d1cd', quake: '#dcba7b' };
  function rhythmArea(c, e, state, localId) {
    const r = e && e.rhythm;
    if (!r || e.hp <= 0 || e.dead || !rhythmColors[r.type] || !['windup','active'].includes(r.phase)) return;
    const x = num(e.x), y = num(e.y), radius = Math.max(1, Math.min(1100, num(r.range, 100)));
    const angle = num(r.angle), arc = Math.max(.03, Math.min(Math.PI * 2, num(r.arc, Math.PI / 2)));
    const progress = 1 - Math.max(0, Math.min(1, num(r.remaining) / Math.max(.01, num(r.duration, 1))));
    const active = r.phase === 'active', color = rhythmColors[r.type];
    // Reach the target at the start of the usable parry window, so players do
    // not wait for the impact flash before pressing. The cue is slightly inside
    // the simulation's 0.38s window to leave room for input/frame timing.
    const parryReady = !active && r.type === 'combo' && num(r.remaining) <= .32;
    const circle = r.type === 'quake' || arc >= Math.PI * 2 - .01;
    c.save(); c.translate(x, y); c.rotate(angle);
    const shape = () => { c.beginPath(); if (!circle) c.moveTo(0, 0); c.arc(0, 0, radius, circle ? 0 : -arc / 2, circle ? Math.PI * 2 : arc / 2); c.closePath(); };
    shape(); c.fillStyle = color + (active ? '38' : '13'); c.fill();
    c.strokeStyle = color + (active ? 'ee' : '88'); c.lineWidth = active ? 4 : 2;
    if (!active) c.setLineDash([7, 6]); shape(); c.stroke(); c.setLineDash([]);
    if (r.type === 'thrust') {
      // Directional spearheads also identify a thrust when color is hard to see.
      for (let i = 1; i <= 3; i++) { const dx = radius * (.26 + i * .17); path(c, [[dx-9,-8],[dx,0],[dx-9,8]], color + (active ? 'ed' : '99'), active ? 3 : 2); }
    } else if (r.type === 'sweep') {
      for (const scale of [.52, .76]) { c.strokeStyle = color + '60'; c.lineWidth = 2; c.beginPath(); c.arc(0,0,radius*scale,-arc/2,arc/2); c.stroke(); }
      const tip = arc / 2; const tx = Math.cos(tip) * radius * .76, ty = Math.sin(tip) * radius * .76;
      path(c, [[tx-10,ty-5],[tx,ty],[tx+4,ty-10]], color + 'c0', 2);
    } else if (r.type === 'quake') {
      c.strokeStyle = color + (active ? 'a0' : '48'); c.lineWidth = 2; c.beginPath(); c.arc(0,0,radius*.66,0,Math.PI*2); c.stroke();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; path(c, [[Math.cos(a)*radius*.72,Math.sin(a)*radius*.72],[Math.cos(a+.03)*radius*.86,Math.sin(a+.03)*radius*.86],[Math.cos(a)*radius,Math.sin(a)*radius]], color + '66', 2); }
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
      const glyph = { combo: '刃', thrust: '突', sweep: '扫', quake: '震' }[r.type];
      const gy = y - (e.kind === 'boss' ? 108 : 103);
      c.save(); c.translate(x, gy); c.rotate(Math.PI / 4); rect(c,-10,-10,20,20,'#142c2be8'); c.strokeStyle=color;c.lineWidth=2;c.strokeRect(-10,-10,20,20);c.restore();
      label(c, glyph, x, gy, color, 13);
      const beats = Math.max(1, Math.min(4, Math.floor(num(r.beats, 1)))), beat = Math.max(1, Math.floor(num(r.beat, 1)));
      if (beats > 1) for (let i = 0; i < beats; i++) rect(c,x-(beats*9-3)/2+i*9,gy+22,6,3,i<beat?color:'#566e62');
      const p = state && state.players && state.players[localId];
      if (state && state.practice && parryReady && p && !p.downed && !p.carry && num(p.guardAttackLock) <= 0 && num(p.dashTime) <= 0 && num(p.invuln) <= .3) {
        const direction = Math.atan2(num(p.y)-y,num(p.x)-x);
        const delta = Math.atan2(Math.sin(direction-angle),Math.cos(direction-angle));
        if (Math.hypot(num(p.x)-x,num(p.y)-y) <= radius+num(p.r,14) && Math.abs(delta) <= arc/2+.08) {
          label(c,'招架',num(p.x),num(p.y)-63,'#dcffd2',13);
        }
      }
    }
  }
  function combatEvents(state) {
    const source = Array.isArray(state.combatEvents) ? state.combatEvents : values(state.events);
    // A retained history can arrive again in every network snapshot. Rendering is
    // a pure function of simulation age: it never restarts an effect on receipt.
    return source.slice(-24).map(e => ({ event: e, age: num(state.time) - num(e.time, -10) }))
      .filter(({ event, age }) => age >= 0 && age <= .62 && ['rhythm-windup','rhythm-beat','perfect-parry','perfect-dodge','mikiri','counterattack','guard-break'].includes(event.type));
  }
  function combatMotion(events, disabled) {
    if (disabled) return { x:0, y:0, flash:0 };
    let x = 0, y = 0, flash = 0;
    for (const {event:e, age} of events) {
      const success = ['perfect-parry','mikiri','counterattack'].includes(e.type), beat = e.type === 'rhythm-beat';
      if (!success && !beat) continue;
      const duration = beat ? .16 : .13;
      if (age > duration) continue;
      const amplitude = (beat ? 1.8 : 2.5) * (1 - age / duration), phase = (hash(e.id || e.type) % 17) + age * 175;
      x += Math.sin(phase) * amplitude; y += Math.cos(phase * 1.3) * amplitude * .7;
      if (success || beat) flash = Math.max(flash, (success ? .07 : .035) * Math.max(0, 1 - age / .09));
    }
    return { x:Math.max(-3, Math.min(3, x)), y:Math.max(-2, Math.min(2, y)), flash:Math.min(.07,flash) };
  }
  function combatEffects(c, events) {
    for (const {event:e, age} of events) {
      if (e.type === 'rhythm-windup') continue;
      const beat = e.type === 'rhythm-beat', broken = e.type === 'guard-break';
      const life = beat ? .24 : .55;
      if (age > life) continue;
      const ratio = age / life, x = num(e.x), y = num(e.y), color = broken ? '#e39b83' : e.type === 'perfect-dodge' ? '#b4e1da' : '#ffe0a2';
      alpha(c, 1-ratio, () => {
        c.strokeStyle = color; c.lineWidth = beat ? 2 : 3 * (1-ratio) + 1;
        c.beginPath(); c.arc(x,y,11+ratio*(beat?36:49),0,Math.PI*2); c.stroke();
        if (!beat) {
          for (let i=0; i<8; i++) { const a=i*Math.PI/4+(hash(e.id)%7)*.1, inner=7+ratio*12, outer=inner+9+ratio*15;
            path(c,[[x+Math.cos(a)*inner,y+Math.sin(a)*inner],[x+Math.cos(a)*outer,y+Math.sin(a)*outer]],color,i%2?2:3); }
          const name = { 'perfect-parry':'铮', 'perfect-dodge':'闪', mikiri:'看破', counterattack:'反击', 'guard-break':'破防' }[e.type];
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
  function minimap(c, state) {
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
      // Content symbols only appear after visiting. The boss is the sole known landmark.
      if (isBoss) {
        c.fillStyle = progress.bossAwake ? '#f2c77c' : '#8fa295';
        c.beginPath(); c.moveTo(point.x, point.y - 5); c.lineTo(point.x + 4, point.y); c.lineTo(point.x, point.y + 5); c.lineTo(point.x - 4, point.y); c.closePath(); c.fill();
      } else if (room.visited && room.elite) {
        rect(c, point.x - 2, point.y - 2, 4, 4, '#e5bc70');
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
    const events = combatEvents(state), motion = combatMotion(events, !!(options.paused || options.reducedMotion));
    c.save(); c.imageSmoothingEnabled = false; c.clearRect(0, 0, W, H);
    rect(c,0,0,W,H,'#142a28'); c.save(); c.translate(motion.x,motion.y);
    floor(c, state);
    values(state.walls).forEach(w => wall(c, w));
    values(state.doors).forEach(d => door(c, d, time));
    values(state.portals).forEach(p => portal(c, p, time));
    values(state.switches).forEach(s => pressureSwitch(c, s, time));
    values(state.fountains).forEach(f => fountain(c, f, time));
    values(state.fires).forEach(f => fire(c, f, time));
    values(state.pickups).forEach(p => pickup(c, p, time));
    const torchList = values(state.torches || state.lanterns);
    if (torchList.length) torchList.forEach(t => lantern(c, t.x, t.y, time));
    else { lantern(c, 77, 53, time); lantern(c, W - 77, 53, time); lantern(c, 77, H - 47, time); lantern(c, W - 77, H - 47, time); }
    values(state.enemies).forEach(e => rhythmArea(c, e, state, localId));
    // All sprites share a ground plane, so passing behind a crate feels natural.
    const sprites = [
      ...values(state.props).filter(p => !p.carriedBy && !p.destroyed && (p.hp == null || p.hp > 0)).map(p => ({ y: p.y, draw: () => prop(c, p, time) })),
      ...values(state.interactables).map(item => ({ y: item.y, draw: () => interactable(c, item, time, state, localId) })),
      ...values(state.enemies).map(e => ({ y: e.y, draw: () => enemy(c, e, time) })),
      ...values(state.players).map(p => ({ y: p.y, draw: () => player(c, p, time, localId, state) }))
    ];
    sprites.sort((a,b) => num(a.y) - num(b.y)).forEach(s => s.draw());
    values(state.bullets).forEach(b => bullet(c, b));
    values(state.particles).forEach(p => particle(c, p, time));
    combatEffects(c, events);
    aimReticle(c, state.players && state.players[localId], time);
    ambient(c, state, time);
    c.restore();
    if (motion.flash > 0) alpha(c,motion.flash,()=>rect(c,0,0,W,H,'#fff0c4'));
    practiceStatus(c,state);
    minimap(c, state);
    c.restore();
  }

  function preview(c, profile = {}) {
    if (!c) return;
    const time = performance.now(); c.save(); c.imageSmoothingEnabled = false;
    if (!floorCache.has('camp-preview')) floorCache.set('camp-preview', makeFloor('camp-preview', 'camp'));
    c.drawImage(floorCache.get('camp-preview'), 0, 0);
    // A camp tucked into the open courtyard, visible to the right of the title.
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
    // Faded path from the campfire to the old gate.
    for (let i = 0; i < 6; i++) { const x = 736 + Math.sin(i * .8) * 14, y = 225 + i * 42; rect(c, x, y, 35, 23, '#50614444'); rect(c, x + 2, y + 2, 30, 1, '#75825a33'); }
    // Bedroll, supplies, and a cartographer's folded map.
    shadow(c, 854, 331, 31); rect(c, 831, 307, 42, 38, '#1a302c'); rect(c, 834, 309, 36, 33, '#697858'); rect(c, 835, 311, 34, 7, '#a5aa79'); rect(c, 836, 320, 4, 20, '#859165'); rect(c, 867, 320, 3, 20, '#425e47'); rect(c, 843, 312, 16, 4, '#bec096');
    prop(c, { kind:'crate', x: 870, y: 404 }, time); prop(c, { kind:'water', x: 890, y: 375 }, time); prop(c, { kind:'crate', x: 900, y: 439 }, time);
    rect(c, 828, 453, 40, 10, '#1b302c'); rect(c, 831, 438, 34, 19, '#7c6744'); rect(c, 835, 434, 28, 16, '#c1b784'); rect(c, 842, 438, 13, 2, '#7b8860'); rect(c, 848, 440, 2, 7, '#7b8860'); rect(c, 832, 457, 5, 9, '#5d533a'); rect(c, 860, 457, 5, 9, '#5d533a');
    // Deliberately roomy camp: the title and scene can breathe together.
    fire(c, { x: 703, y: 376, r: 24, active:true }, time);
    for (const [x,y] of [[676,376],[684,391],[705,396],[727,385],[729,369],[712,357],[689,357]]) { ellipse(c,x,y,7,4,'#182e2b'); rect(c,x-5,y-4,10,6,'#788369'); rect(c,x-4,y-4,8,2,'#9a9e7b'); }
    player(c, { id:'p1',x:647,y:375,r:14,hp:100,maxHp:100,weapon:'pistol',facing:.2 }, time, '', { players:[],props:[] });
    player(c, { id:'p2',x:754,y:411,r:14,hp:100,maxHp:100,weapon:'pistol',facing:-2.2 }, time, '', { players:[],props:[] });
    // Broken column in the foreground, with a scattering of young plants.
    wall(c, { x: 551, y: 481, w: 53, h: 40 }); rect(c, 546, 477, 63, 9, '#78906b'); rect(c, 552, 474, 48, 4, '#9caa7b'); grass(c, 558, 476, '#a1af74');
    for (const [x,y,s] of [[629,491,1.4],[907,510,1.3],[892,241,1],[587,154,1],[803,527,1]]) grass(c,x,y,'#6f8c50',s);
    // These three repaired lamps are the expedition campaign's visible goal.
    const lit = Math.max(0, Math.min(3, Math.floor(num(profile.lit))));
    for (let i = 0; i < 3; i++) {
      const x = 665 + i * 73, y = 511;
      shadow(c,x,y,19,.25);rect(c,x-16,y-4,32,11,'#334f42');rect(c,x-18,y-8,36,6,'#6c8160');rect(c,x-13,y-11,26,4,'#92a078');rect(c,x-2,y-21,4,12,'#6d7d55');
      if (i < lit) lantern(c,x,y-33,time,.9);
      else { rect(c,x-7,y-44,14,18,'#263d34');rect(c,x-5,y-42,10,13,'#405846');rect(c,x-3,y-40,6,10,'#2a4136');rect(c,x-8,y-45,16,3,'#7b8b65');rect(c,x-8,y-28,16,3,'#6a7d59');rect(c,x-2,y-48,4,3,'#70845d'); }
      label(c,['炉心','物资','守夜'][i],x,y+15,i<lit?'#d8c58b':'#809676',8);
    }
    label(c,`归途灯 · ${lit} / 3`,739,553,'#bdc499',9);
    lantern(c, 904, 529, time, .85);
    ambient(c, {}, time); c.restore();
  }
  window.AdventureRenderer = { draw, preview };
})();
