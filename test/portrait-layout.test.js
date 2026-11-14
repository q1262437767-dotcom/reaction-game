'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const L = require('../adventure/layout.js');

const phone = { w: 390, h: 844 };
const safe = { top: 0, right: 0, bottom: 0, left: 0 };

function phoneContext(layoutSpace) {
  return {
    safe: safe,
    viewW: phone.w,
    viewH: phone.h,
    map: layoutSpace || { w: 480, h: 600, rectW: 390, rectH: 488 }
  };
}

test('landscape HUD keeps its original storage key and defaults', () => {
  assert.equal(L.hudStoreKey('landscape'), 'ruins-squad-hud-layout-v1');
  assert.equal(L.HUD_LANDSCAPE, 'ruins-squad-hud-layout-v1');
  assert.notEqual(L.hudStoreKey('portrait'), L.hudStoreKey('landscape'));
  assert.equal(L.hudStoreKey('portrait'), 'ruins-squad-hud-layout-portrait-v1');
  assert.equal(L.PORTRAIT_HINT, 'ruins-squad-portrait-hint-v1');
  assert.notEqual(L.PORTRAIT_HINT, 'ruins-squad-camp-v2');
  const landscape = L.defaultHudLayout('landscape');
  assert.deepEqual(landscape, {
    mapScale: 0.76, mapInsetX: 6, mapInsetY: 4,
    stickScale: 1, stickInsetX: 36, stickInsetY: 24,
    skillsScale: 1, skillsInsetX: 22, skillsInsetY: 16
  });
  assert.deepEqual(L.normalizeHudLayout(landscape, 'landscape'), landscape);
});

test('portrait and landscape layouts do not read each other', () => {
  const savedLandscape = { mapScale: 1.1, mapInsetX: 40, mapInsetY: 20, stickScale: 1.2, stickInsetX: 48, stickInsetY: 30, skillsScale: 0.9, skillsInsetX: 18, skillsInsetY: 12 };
  const portrait = L.normalizeHudLayout(null, 'portrait');
  const landscape = L.normalizeHudLayout(savedLandscape, 'landscape');
  assert.equal(portrait.stickScale, L.defaultHudLayout('portrait').stickScale);
  assert.equal(landscape.stickScale, 1.2);
  assert.equal(landscape.mapInsetX, 40);
  assert.notEqual(portrait.stickInsetX, landscape.stickInsetX);
  assert.deepEqual(L.normalizeHudLayout(savedLandscape, 'portrait').stickScale, 1.2);
  assert.equal(L.normalizeHudLayout({ stickScale: 9, mapScale: 'nope' }, 'portrait').stickScale, 1.3);
  assert.equal(L.normalizeHudLayout({ stickScale: 9, mapScale: 'nope' }, 'portrait').mapScale, L.defaultHudLayout('portrait').mapScale);
  assert.equal(L.hudOrientation(true, true), 'portrait');
  assert.equal(L.hudOrientation(true, false), 'landscape');
  assert.equal(L.hudOrientation(false, true), 'landscape');
});

test('portrait thumbs stay in opposite corners on a 390x844 phone', () => {
  const layout = L.clampHudLayout(L.defaultHudLayout('portrait'), phoneContext());
  assert.deepEqual(layout, L.defaultHudLayout('portrait'));
  const bounds = L.controlBounds(layout, phone.w, phone.h);
  assert.ok(bounds.stick.right < bounds.skills.left - 24, 'stick and skill cluster need a gap');
  assert.ok(bounds.stick.left >= 0 && bounds.skills.right <= phone.w);
  assert.ok(bounds.stick.bottom <= phone.h && bounds.skills.bottom <= phone.h);
  assert.ok(bounds.stick.top > phone.h * 0.55 && bounds.skills.top > phone.h * 0.55);
  const landscape = L.clampHudLayout(L.defaultHudLayout('landscape'), {
    safe: safe, viewW: 844, viewH: 390,
    map: { w: 960, h: 444, rectW: 844, rectH: 390 }
  });
  assert.deepEqual(landscape, L.defaultHudLayout('landscape'));
});

test('portrait camera fits the width, follows the player, and stays inside the room', () => {
  const band = L.portraitPlayBand(phone.w, phone.h, safe);
  assert.equal(band.width, phone.w);
  assert.ok(band.top >= 72);
  assert.ok(band.bottom >= 176);
  assert.equal(band.top + band.height + band.bottom, phone.h);
  const view = L.portraitPlayView(band.width, band.height, 800, 420);
  assert.ok(Math.abs(view.w / view.h - band.width / band.height) < 1e-9);
  assert.ok(view.w >= L.PORTRAIT_VIEW_W - 1 && view.w <= L.PORTRAIT_VIEW_W + 8);
  assert.equal(view.h, L.WORLD_H);
  assert.ok(view.x > 0, 'a player on the right pulls the camera off the west wall');
  assert.ok(view.x + view.w <= L.WORLD_W + 1e-6);
  assert.equal(view.y, 0);
  const west = L.portraitPlayView(band.width, band.height, 40, 80);
  assert.equal(west.x, 0);
  assert.equal(west.y, 0);
  const center = L.portraitPlayView(band.width, band.height, 480, 300);
  assert.ok(Math.abs(center.x + center.w / 2 - 480) < 1);
});

test('landscape camera still shows the full room width and only crops vertically', () => {
  const view = L.landscapePlayView(844, 390, 300);
  assert.equal(view.x, 0);
  assert.equal(view.w, 960);
  assert.equal(view.bufferW, 960);
  assert.ok(view.h > 280 && view.h < 600);
  assert.ok(Math.abs(view.y + view.h / 2 - 300) < 1);
  const north = L.landscapePlayView(844, 390, 20);
  assert.equal(north.y, 0);
  const south = L.landscapePlayView(844, 390, 590);
  assert.ok(Math.abs(south.y + south.h - 600) < 1e-6);
  const short = L.landscapePlayView(900, 200, 300);
  assert.equal(short.h, 280);
  assert.equal(short.bufferH, 280);
});

test('the rotate overlay is only a dismissible portrait hint', () => {
  assert.equal(L.portraitHintVisible({ handheld: true, portrait: true, runActive: true, dismissed: false }), true);
  assert.equal(L.portraitHintVisible({ handheld: true, portrait: true, runActive: true, dismissed: true }), false);
  assert.equal(L.portraitHintVisible({ handheld: true, portrait: false, runActive: true, dismissed: false }), false);
  assert.equal(L.portraitHintVisible({ handheld: false, portrait: true, runActive: true, dismissed: false }), false);
  assert.equal(L.portraitHintVisible({ handheld: true, portrait: true, runActive: false, dismissed: false }), false);
});

test('the joystick ignores the inner 12% and keeps the thumb graphic', () => {
  assert.equal(L.STICK_DEADZONE, 0.12);
  const still = L.stickOutput(2, 1, 40, 0.12);
  assert.equal(still.x, 0);
  assert.equal(still.y, 0);
  assert.ok(still.knobX !== 0 || still.knobY !== 0);
  const full = L.stickOutput(40, 0, 40, 0.12);
  assert.ok(Math.abs(full.x - 1) < 1e-9);
  assert.equal(full.y, 0);
  const mid = L.stickOutput(20, 0, 40, 0.12);
  assert.ok(mid.x > 0.35 && mid.x < 0.5);
  assert.equal(L.stickOutput(0, 0, 40).x, 0);
});

test('a safe-area inset still leaves the portrait playfield on screen', () => {
  const band = L.portraitPlayBand(390, 844, { top: 47, right: 0, bottom: 34, left: 0 });
  assert.ok(band.top >= 47 + 64);
  assert.ok(band.bottom >= 34 + 164);
  assert.ok(band.height >= 220);
  assert.ok(band.top + band.height <= 844);
  const view = L.portraitPlayView(band.width, band.height, 480, 300);
  assert.ok(view.w > 0 && view.h > 0);
  assert.ok(view.x >= 0 && view.y >= 0);
  assert.ok(view.x + view.w <= 960 + 1e-6);
  assert.ok(view.y + view.h <= 600 + 1e-6);
});
