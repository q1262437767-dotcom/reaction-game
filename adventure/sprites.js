/* Pixel sheets for Ruin Runners. Canonical actor and device frames are 48×48.
 * A 96×96 image is the nearest-neighbor 2× export, not a larger world sprite.
 * Locked palette only. Character frames are a swappable first pass: call
 * install('traveler', image) or install('ahe', image) to replace them.
 * Code-drawn fallbacks are listed on fallback(). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AdventureSprites = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PALETTE = {
    o: '#0F2024', i: '#142326', s: '#4E6555', m: '#6A8250', n: '#ABC592',
    g: '#E4B96B', e: '#E1B878', a: '#B6C2BC', k: '#EDDEBB', d: '#101F23',
    h: '#72837A', c: '#92C3B5', w: '#79B6C8', r: '#EEA093', t: '#BAA985',
    u: '#A8D3C3', p: '#F2EBDA'
  };
  var CANONICAL = 48;
  var EXPORT_SCALE = 2;

  function grid(w, h) {
    var rows = [];
    for (var y = 0; y < h; y += 1) {
      var row = new Array(w);
      for (var x = 0; x < w; x += 1) row[x] = '.';
      rows.push(row);
    }
    return rows;
  }
  function pix(g, x, y, ch) {
    if (y < 0 || x < 0 || y >= g.length || x >= g[0].length) return;
    g[y][x] = ch;
  }
  function fill(g, x, y, w, h, ch) {
    for (var yy = 0; yy < h; yy += 1) for (var xx = 0; xx < w; xx += 1) pix(g, x + xx, y + yy, ch);
  }
  function line(g, x0, y0, x1, y1, ch) {
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
    for (;;) {
      pix(g, x0, y0, ch);
      if (x0 === x1 && y0 === y1) break;
      var e2 = err * 2;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }
  function disc(g, cx, cy, r, ch) {
    for (var y = -r; y <= r; y += 1) for (var x = -r; x <= r; x += 1) {
      if (x * x + y * y <= r * r) pix(g, cx + x, cy + y, ch);
    }
  }
  function outline(g) {
    var h = g.length, w = g[0].length;
    var next = g.map(function (row) { return row.slice(); });
    for (var y = 0; y < h; y += 1) for (var x = 0; x < w; x += 1) {
      if (g[y][x] !== '.') continue;
      if ((y > 0 && g[y - 1][x] !== '.') || (y + 1 < h && g[y + 1][x] !== '.') ||
          (x > 0 && g[y][x - 1] !== '.') || (x + 1 < w && g[y][x + 1] !== '.')) next[y][x] = 'o';
    }
    return next;
  }
  function pack(g) {
    return { w: g[0].length, h: g.length, rows: g.map(function (row) { return row.join(''); }) };
  }

  function traveler() {
    var g = grid(48, 48);
    fill(g, 15, 2, 14, 5, 'm');
    fill(g, 17, 2, 6, 2, 'n');
    fill(g, 8, 6, 26, 3, 'm');
    fill(g, 10, 6, 14, 1, 'n');
    fill(g, 12, 9, 3, 20, 'i');
    fill(g, 17, 9, 9, 6, 'k');
    pix(g, 19, 11, 'i'); pix(g, 23, 11, 'i');
    pix(g, 24, 12, 'e');
    fill(g, 18, 14, 7, 1, 'e');
    fill(g, 14, 15, 16, 4, 'g');
    fill(g, 16, 16, 10, 2, 'e');
    fill(g, 13, 19, 18, 17, 'm');
    fill(g, 13, 20, 4, 14, 'n');
    fill(g, 27, 21, 3, 13, 's');
    fill(g, 29, 22, 4, 8, 'm');
    fill(g, 30, 28, 3, 2, 'g');
    fill(g, 16, 36, 4, 5, 's');
    fill(g, 23, 36, 4, 5, 's');
    fill(g, 16, 39, 4, 2, 'h');
    fill(g, 23, 39, 4, 2, 'h');
    pix(g, 17, 37, 'g'); pix(g, 24, 37, 'g');
    fill(g, 29, 24, 4, 3, 'k');
    return outline(g);
  }
  function ahe() {
    var g = grid(48, 48);
    fill(g, 14, 3, 16, 6, 'g');
    fill(g, 16, 3, 8, 2, 'e');
    fill(g, 12, 8, 20, 2, 'e');
    fill(g, 17, 10, 9, 6, 'k');
    pix(g, 19, 12, 'i'); pix(g, 23, 12, 'i');
    fill(g, 18, 15, 7, 1, 'e');
    fill(g, 13, 16, 18, 20, 's');
    fill(g, 17, 17, 9, 16, 'e');
    fill(g, 18, 18, 6, 10, 'g');
    fill(g, 4, 18, 8, 14, 'g');
    fill(g, 6, 20, 4, 10, 'e');
    fill(g, 7, 22, 2, 5, 'k');
    pix(g, 5, 19, 's'); pix(g, 10, 19, 's');
    pix(g, 5, 30, 's'); pix(g, 10, 30, 's');
    fill(g, 15, 36, 5, 5, 's');
    fill(g, 23, 36, 5, 5, 's');
    fill(g, 15, 39, 5, 2, 'h');
    fill(g, 23, 39, 5, 2, 'h');
    return outline(g);
  }
  function enemyBlade() {
    var g = grid(48, 48);
    fill(g, 16, 6, 14, 10, 's');
    fill(g, 18, 7, 10, 3, 'h');
    fill(g, 18, 12, 3, 2, 'k'); fill(g, 25, 12, 3, 2, 'k');
    fill(g, 14, 16, 18, 14, 'm');
    fill(g, 15, 17, 5, 10, 'n');
    fill(g, 30, 18, 5, 4, 'g');
    line(g, 34, 20, 44, 30, 'a');
    fill(g, 17, 30, 5, 6, 's');
    fill(g, 25, 30, 5, 6, 's');
    fill(g, 16, 38, 16, 2, 'g');
    return outline(g);
  }
  function enemyGun() {
    var g = grid(48, 48);
    fill(g, 16, 8, 14, 8, 'i');
    fill(g, 18, 14, 10, 4, 'k');
    pix(g, 20, 15, 'i'); pix(g, 24, 15, 'i');
    fill(g, 14, 18, 16, 14, 's');
    fill(g, 15, 19, 4, 10, 'h');
    fill(g, 28, 20, 12, 3, 'a');
    fill(g, 36, 18, 4, 3, 'g');
    fill(g, 17, 32, 5, 6, 's');
    fill(g, 24, 32, 5, 6, 's');
    return outline(g);
  }
  function enemyListener() {
    var g = grid(48, 48);
    disc(g, 10, 16, 5, 'c');
    disc(g, 36, 16, 5, 'c');
    disc(g, 10, 16, 2, 'u');
    disc(g, 36, 16, 2, 'u');
    fill(g, 18, 8, 12, 10, 's');
    fill(g, 20, 12, 3, 2, 'k'); fill(g, 25, 12, 3, 2, 'k');
    fill(g, 15, 18, 18, 14, 'h');
    fill(g, 18, 32, 5, 6, 's');
    fill(g, 25, 32, 5, 6, 's');
    return outline(g);
  }
  function enemyCharger() {
    var g = grid(48, 48);
    fill(g, 10, 14, 28, 8, 's');
    fill(g, 12, 10, 10, 6, 'h');
    fill(g, 14, 12, 3, 2, 'e');
    fill(g, 12, 22, 24, 12, 'm');
    fill(g, 14, 23, 6, 8, 'n');
    fill(g, 14, 34, 7, 6, 's');
    fill(g, 26, 34, 7, 6, 's');
    fill(g, 8, 28, 6, 4, 'g');
    return outline(g);
  }
  function enemyMist() {
    var g = grid(48, 48);
    fill(g, 16, 4, 16, 12, 's');
    fill(g, 18, 6, 8, 4, 'c');
    fill(g, 30, 10, 8, 3, 'u');
    fill(g, 32, 8, 4, 2, 'c');
    fill(g, 15, 16, 16, 16, 'h');
    fill(g, 17, 18, 5, 10, 'c');
    fill(g, 18, 32, 5, 6, 's');
    fill(g, 25, 32, 5, 6, 's');
    return outline(g);
  }
  function enemyShade() {
    var g = grid(48, 48);
    fill(g, 8, 18, 32, 12, 'd');
    fill(g, 10, 16, 28, 6, 's');
    fill(g, 14, 20, 6, 2, 'n');
    fill(g, 26, 20, 6, 2, 'n');
    fill(g, 12, 30, 8, 4, 'h');
    fill(g, 28, 30, 8, 4, 'h');
    return outline(g);
  }
  function enemyProgram() {
    var g = grid(48, 48);
    disc(g, 24, 22, 12, 's');
    disc(g, 24, 22, 6, 'g');
    disc(g, 24, 22, 3, 'e');
    fill(g, 20, 34, 8, 4, 'h');
    return outline(g);
  }
  function enemyPulse() {
    var g = grid(48, 48);
    fill(g, 14, 10, 18, 8, 's');
    fill(g, 18, 16, 10, 8, 'e');
    fill(g, 20, 18, 6, 4, 'g');
    fill(g, 12, 22, 22, 10, 'h');
    fill(g, 16, 32, 5, 6, 's');
    fill(g, 26, 32, 5, 6, 's');
    return outline(g);
  }
  function lamp() {
    var g = grid(48, 48);
    fill(g, 22, 6, 4, 6, 'h');
    fill(g, 16, 12, 16, 4, 'g');
    fill(g, 18, 16, 12, 16, 'e');
    fill(g, 21, 18, 6, 10, 'g');
    fill(g, 16, 32, 16, 3, 't');
    fill(g, 20, 35, 8, 4, 's');
    return outline(g);
  }
  function valve() {
    var g = grid(48, 48);
    disc(g, 24, 18, 10, 'h');
    disc(g, 24, 18, 4, 's');
    fill(g, 22, 8, 4, 8, 'g');
    fill(g, 30, 16, 10, 3, 'e');
    fill(g, 14, 30, 20, 6, 's');
    fill(g, 16, 32, 16, 2, 'c');
    return outline(g);
  }
  function pillar(open) {
    var g = grid(48, 48);
    fill(g, 14, 6, 20, 34, 's');
    fill(g, 16, 8, 16, 4, 'h');
    fill(g, 16, 30, 16, 4, 'h');
    fill(g, 18, 14, 12, 14, 'd');
    if (open) {
      fill(g, 20, 16, 8, 10, 'g');
      fill(g, 22, 18, 4, 6, 'e');
      fill(g, 10, 18, 4, 8, 'h');
      fill(g, 34, 18, 4, 8, 'h');
    } else {
      fill(g, 20, 16, 8, 10, 'h');
      fill(g, 23, 18, 2, 6, 'g');
    }
    fill(g, 12, 40, 24, 3, 't');
    return outline(g);
  }
  function pillarEast() {
    var g = grid(48, 48);
    fill(g, 16, 8, 16, 32, 's');
    fill(g, 18, 10, 12, 3, 'h');
    fill(g, 18, 18, 12, 12, 'd');
    fill(g, 22, 21, 4, 6, 'h');
    fill(g, 14, 40, 20, 3, 't');
    return outline(g);
  }
  function furnaceDoor() {
    var g = grid(48, 48);
    fill(g, 10, 4, 28, 40, 's');
    fill(g, 14, 8, 20, 28, 'd');
    fill(g, 22, 8, 2, 28, 'g');
    fill(g, 16, 14, 6, 4, 'e');
    fill(g, 26, 14, 6, 4, 'h');
    fill(g, 18, 32, 12, 4, 't');
    fill(g, 8, 42, 32, 3, 'h');
    return outline(g);
  }
  function gate() {
    var g = grid(48, 48);
    fill(g, 8, 6, 6, 34, 's');
    fill(g, 34, 6, 6, 34, 's');
    fill(g, 8, 6, 32, 4, 'h');
    fill(g, 8, 36, 32, 4, 't');
    fill(g, 18, 10, 3, 26, 'g');
    fill(g, 27, 10, 3, 26, 'h');
    return outline(g);
  }
  function vent() {
    var g = grid(48, 48);
    fill(g, 6, 26, 36, 10, 's');
    fill(g, 8, 24, 32, 4, 'h');
    fill(g, 10, 28, 28, 2, 'd');
    fill(g, 12, 16, 4, 10, 'g');
    fill(g, 20, 14, 8, 12, 'e');
    fill(g, 22, 16, 4, 6, 'g');
    fill(g, 32, 18, 4, 8, 'c');
    return outline(g);
  }
  function slab() {
    var g = grid(64, 32);
    fill(g, 1, 1, 62, 30, 's');
    fill(g, 0, 0, 64, 1, 'd');
    fill(g, 0, 31, 64, 1, 'd');
    fill(g, 0, 0, 1, 32, 'd');
    fill(g, 63, 0, 1, 32, 'd');
    fill(g, 32, 2, 1, 28, 'i');
    fill(g, 4, 24, 7, 4, 'm');
    fill(g, 6, 26, 3, 2, 'n');
    fill(g, 50, 4, 5, 2, 'h');
    return g;
  }
  function moss() {
    var g = grid(16, 16);
    fill(g, 2, 8, 8, 4, 'm');
    fill(g, 4, 5, 3, 5, 'n');
    fill(g, 8, 10, 5, 3, 'm');
    return g;
  }
  function water() {
    var g = grid(32, 32);
    fill(g, 0, 0, 32, 32, 's');
    fill(g, 2, 6, 28, 20, 'w');
    fill(g, 4, 10, 20, 4, 'c');
    fill(g, 8, 18, 12, 2, 'u');
    return g;
  }
  function knife() {
    var g = grid(32, 32);
    fill(g, 4, 20, 6, 4, 't');
    fill(g, 8, 18, 4, 6, 'g');
    line(g, 12, 18, 26, 6, 'a');
    line(g, 12, 20, 24, 8, 'h');
    return outline(g);
  }
  function pistol() {
    var g = grid(32, 32);
    fill(g, 6, 14, 16, 4, 'h');
    fill(g, 18, 12, 6, 4, 'a');
    fill(g, 8, 18, 5, 7, 't');
    fill(g, 10, 15, 3, 2, 'g');
    return outline(g);
  }
  function scatter() {
    var g = grid(32, 32);
    fill(g, 4, 14, 8, 6, 't');
    fill(g, 12, 12, 12, 5, 'h');
    fill(g, 20, 10, 6, 3, 'a');
    fill(g, 22, 16, 4, 3, 'g');
    fill(g, 8, 18, 4, 6, 's');
    return outline(g);
  }

  var built = {
    traveler: pack(traveler()),
    ahe: pack(ahe()),
    'enemy-blade': pack(enemyBlade()),
    'enemy-gun': pack(enemyGun()),
    'enemy-listener': pack(enemyListener()),
    'enemy-charger': pack(enemyCharger()),
    'enemy-mist': pack(enemyMist()),
    'enemy-shade': pack(enemyShade()),
    'enemy-program': pack(enemyProgram()),
    'enemy-pulse': pack(enemyPulse()),
    lamp: pack(lamp()),
    valve: pack(valve()),
    'pillar-west': pack(pillar(false)),
    'pillar-open': pack(pillar(true)),
    'pillar-east': pack(pillarEast()),
    'furnace-door': pack(furnaceDoor()),
    gate: pack(gate()),
    vent: pack(vent()),
    'floor-slab': pack(slab()),
    'floor-moss': pack(moss()),
    'floor-water': pack(water()),
    'weapon-knife': pack(knife()),
    'weapon-pistol': pack(pistol()),
    'weapon-scatter': pack(scatter())
  };

  var FALLBACK = [
    { id: 'fox', reason: '灰尾狐仍用代码绘制，没有单独的精灵表。' },
    { id: 'boss-furnace', reason: '炉心守卫的阶段、露芯和震地仍用代码绘制，避免一张静图盖住破绽。' },
    { id: 'boss-surveyor', reason: '检线官的钩索和阶段仍用代码绘制。' },
    { id: 'boss-grand', reason: '总归炉者的追、砸、吞仍用代码绘制。' },
    { id: 'boss-heng', reason: '衡石的招式姿势仍用代码绘制。' },
    { id: 'boss-echo', reason: '回声灯卫的灯腔和阶段仍用代码绘制。' },
    { id: 'prop-barrel', reason: '木桶、木箱和炉芯仍用代码绘制。' }
  ];

  var cache = {};
  var installed = {};

  function frame(id) { return built[id] || null; }
  function has(id) { return !!(built[id] || installed[id]); }
  function parse(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
  }
  function raster(id) {
    var spec = frame(id);
    if (!spec) return null;
    var data = new Uint8ClampedArray(spec.w * spec.h * 4);
    for (var y = 0; y < spec.h; y += 1) {
      var row = spec.rows[y];
      for (var x = 0; x < spec.w; x += 1) {
        var ch = row.charAt(x);
        if (ch === '.' || !PALETTE[ch]) continue;
        var px = parse(PALETTE[ch]);
        var at = (y * spec.w + x) * 4;
        data[at] = px[0]; data[at + 1] = px[1]; data[at + 2] = px[2]; data[at + 3] = 255;
      }
    }
    return { w: spec.w, h: spec.h, data: data };
  }
  function metrics(id) {
    var spec = frame(id);
    var raw = raster(id);
    if (!spec || !raw) return null;
    var colors = {};
    var minX = spec.w, minY = spec.h, maxX = -1, maxY = -1, opaque = 0, dark = 0, paper = 0;
    for (var y = 0; y < spec.h; y += 1) for (var x = 0; x < spec.w; x += 1) {
      var ch = spec.rows[y].charAt(x);
      if (ch === '.') continue;
      colors[PALETTE[ch]] = (colors[PALETTE[ch]] || 0) + 1;
      opaque += 1;
      if (ch === 'i' || ch === 'o') dark += 1;
      if (ch === 'p') paper += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return {
      id: id, w: spec.w, h: spec.h, opaque: opaque, dark: dark,
      inkShare: opaque ? dark / opaque : 0, paper: paper,
      colors: Object.keys(colors),
      box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
    };
  }
  function scaled(id, factor) {
    var src = raster(id);
    if (!src) return null;
    var scale = factor || EXPORT_SCALE;
    var w = src.w * scale, h = src.h * scale;
    var data = new Uint8ClampedArray(w * h * 4);
    for (var y = 0; y < h; y += 1) for (var x = 0; x < w; x += 1) {
      var from = ((y / scale | 0) * src.w + (x / scale | 0)) * 4;
      var at = (y * w + x) * 4;
      data[at] = src.data[from]; data[at + 1] = src.data[from + 1];
      data[at + 2] = src.data[from + 2]; data[at + 3] = src.data[from + 3];
    }
    return { w: w, h: h, data: data };
  }
  function canvas(id) {
    if (installed[id]) return installed[id];
    if (cache[id]) return cache[id];
    var raw = raster(id);
    if (!raw || typeof document === 'undefined' || !document.createElement) return null;
    try {
      var surface = document.createElement('canvas');
      surface.width = raw.w; surface.height = raw.h;
      var ctx = surface.getContext && surface.getContext('2d');
      if (!ctx || typeof ctx.createImageData !== 'function' || typeof ctx.putImageData !== 'function') return null;
      var image = ctx.createImageData(raw.w, raw.h);
      if (!image || !image.data || image.data.length < raw.data.length) return null;
      image.data.set(raw.data);
      ctx.putImageData(image, 0, 0);
      cache[id] = surface;
      return surface;
    } catch (err) { return null; }
  }
  function blit(ctx, id, x, y, opts) {
    if (!ctx || !has(id)) return false;
    var surface = canvas(id);
    if (!surface) return false;
    opts = opts || {};
    var dw = opts.dw || surface.width, dh = opts.dh || surface.height;
    var dx = x, dy = y;
    if (opts.anchor === 'center') { dx -= dw / 2; dy -= dh / 2; }
    else if (opts.anchor === 'feet') { dx -= dw / 2; dy -= dh - (opts.foot == null ? 2 : opts.foot); }
    var prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(surface, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh));
    ctx.imageSmoothingEnabled = prev;
    return true;
  }
  function install(id, source) {
    if (!id) return false;
    if (source) installed[id] = source;
    else delete installed[id];
    delete cache[id];
    return true;
  }

  return {
    PALETTE: PALETTE,
    CANONICAL: CANONICAL,
    EXPORT_SCALE: EXPORT_SCALE,
    frames: built,
    FALLBACK: FALLBACK,
    has: has,
    frame: frame,
    fallback: function () { return FALLBACK.slice(); },
    metrics: metrics,
    raster: raster,
    scaled: scaled,
    canvas: canvas,
    blit: blit,
    install: install
  };
});
