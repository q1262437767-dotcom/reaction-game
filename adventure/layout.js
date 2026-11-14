(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AdventureLayout = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Phone HUD geometry. Landscape keeps the original storage key so an
  // existing drag layout is not rewritten when the phone is turned upright.
  var WORLD_W = 960, WORLD_H = 600;
  var MAP_W = 190, MAP_H = 164, MAP_EDGE = 18;
  var STICK_BASE = 118, SKILLS_W = 200, SKILLS_H = 198;
  var HUD_LANDSCAPE = 'ruins-squad-hud-layout-v1';
  var HUD_PORTRAIT = 'ruins-squad-hud-layout-portrait-v1';
  var PORTRAIT_HINT = 'ruins-squad-portrait-hint-v1';
  // A tall phone shows the full room height and a little under half its width,
  // scaled to the screen width. Narrower and the doors leave the picture;
  // wider and the sprites shrink toward the old letterboxed strip.
  var PORTRAIT_VIEW_W = 440;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function hudOrientation(handheld, portrait) {
    return handheld && portrait ? 'portrait' : 'landscape';
  }
  function hudStoreKey(orientation) {
    return orientation === 'portrait' ? HUD_PORTRAIT : HUD_LANDSCAPE;
  }
  function defaultHudLayout(orientation) {
    if (orientation === 'portrait') {
      return { mapScale: 0.62, mapInsetX: 8, mapInsetY: 72, stickScale: 0.88, stickInsetX: 14, stickInsetY: 18, skillsScale: 0.78, skillsInsetX: 10, skillsInsetY: 14 };
    }
    return { mapScale: 0.76, mapInsetX: 6, mapInsetY: 4, stickScale: 1, stickInsetX: 36, stickInsetY: 24, skillsScale: 1, skillsInsetX: 22, skillsInsetY: 16 };
  }
  function normalizeHudLayout(raw, orientation) {
    var defaults = defaultHudLayout(orientation);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
    var ranges = {
      mapScale: [0.52, 1.2], mapInsetX: [0, 800], mapInsetY: [0, 600],
      stickScale: [0.72, 1.3], stickInsetX: [0, 1200], stickInsetY: [0, 900],
      skillsScale: [0.72, 1.3], skillsInsetX: [0, 1200], skillsInsetY: [0, 900]
    };
    var next = {};
    for (var key in defaults) {
      var value = Number(raw[key]);
      next[key] = Number.isFinite(value) ? clamp(value, ranges[key][0], ranges[key][1]) : defaults[key];
    }
    return next;
  }
  function clampHudLayout(layout, ctx) {
    var next = Object.assign({}, layout);
    var safe = ctx && ctx.safe || { top: 0, right: 0, bottom: 0, left: 0 };
    next.mapScale = clamp(next.mapScale, 0.52, 1.2);
    next.stickScale = clamp(next.stickScale, 0.72, 1.3);
    next.skillsScale = clamp(next.skillsScale, 0.72, 1.3);
    var space = ctx && ctx.map;
    if (space && space.rectW > 40 && space.w > 40 && space.h > 40 && space.rectH > 0) {
      var sx = space.w / space.rectW, sy = space.h / space.rectH;
      var mapW = MAP_W * next.mapScale, mapH = MAP_H * next.mapScale;
      next.mapInsetX = clamp(next.mapInsetX, 0, Math.max(0, Math.min(space.w * 0.5 - mapW, space.w - MAP_EDGE - safe.right * sx - mapW - 8)));
      next.mapInsetY = clamp(next.mapInsetY, 0, Math.max(0, Math.min(space.h * 0.46 - mapH, space.h - MAP_EDGE - safe.top * sy - mapH - 8)));
    }
    var viewW = ctx && ctx.viewW || 0, viewH = ctx && ctx.viewH || 0;
    if (viewW > 40 && viewH > 40) {
      var stick = STICK_BASE * next.stickScale, skillsW = SKILLS_W * next.skillsScale, skillsH = SKILLS_H * next.skillsScale;
      next.stickInsetX = clamp(next.stickInsetX, 0, Math.max(0, Math.min(viewW * 0.5 - safe.left - stick, viewW - safe.left - safe.right - stick - 8)));
      next.stickInsetY = clamp(next.stickInsetY, 0, Math.max(0, viewH - safe.top - safe.bottom - stick - 8));
      next.skillsInsetX = clamp(next.skillsInsetX, 0, Math.max(0, Math.min(viewW * 0.52 - safe.right - skillsW, viewW - safe.left - safe.right - skillsW - 8)));
      next.skillsInsetY = clamp(next.skillsInsetY, 0, Math.max(0, viewH - safe.top - safe.bottom - skillsH - 8));
    }
    return next;
  }
  // Top band is the hearts and objective. Bottom band is the thumb controls.
  // The canvas keeps the screen's width and only as much height as still shows
  // PORTRAIT_VIEW_W of the room.
  function portraitPlayBand(viewportW, viewportH, safe) {
    safe = safe || { top: 0, right: 0, bottom: 0, left: 0 };
    var top = Math.max(72, (safe.top || 0) + 64);
    var reserve = Math.max(176, (safe.bottom || 0) + 164);
    var maxH = Math.max(220, viewportW * (WORLD_H / PORTRAIT_VIEW_W));
    var available = Math.max(220, viewportH - top - reserve);
    var height = Math.round(Math.min(available, maxH));
    return { top: top, height: height, width: viewportW, bottom: Math.max(0, Math.round(viewportH - top - height)) };
  }
  function landscapePlayView(cssW, cssH, focusY) {
    var viewW = WORLD_W;
    var viewH = Math.max(280, Math.min(WORLD_H, viewW * cssH / Math.max(1, cssW)));
    var focus = Number.isFinite(focusY) ? focusY : 300;
    return {
      x: 0,
      y: Math.max(0, Math.min(WORLD_H - viewH, focus - viewH / 2)),
      w: viewW,
      h: viewH,
      bufferW: WORLD_W,
      bufferH: Math.round(viewH)
    };
  }
  function portraitPlayView(cssW, cssH, focusX, focusY) {
    var aspect = cssW / Math.max(1, cssH);
    var viewW = WORLD_W;
    var viewH = viewW / aspect;
    if (viewH > WORLD_H) {
      viewH = WORLD_H;
      viewW = viewH * aspect;
    }
    viewW = clamp(viewW, 1, WORLD_W);
    viewH = clamp(viewH, 1, WORLD_H);
    var fx = Number.isFinite(focusX) ? focusX : WORLD_W / 2;
    var fy = Number.isFinite(focusY) ? focusY : WORLD_H / 2;
    return {
      x: Math.max(0, Math.min(WORLD_W - viewW, fx - viewW / 2)),
      y: Math.max(0, Math.min(WORLD_H - viewH, fy - viewH / 2)),
      w: viewW,
      h: viewH,
      bufferW: Math.max(1, Math.round(viewW)),
      bufferH: Math.max(1, Math.round(viewH))
    };
  }
  function portraitHintVisible(options) {
    options = options || {};
    return !!(options.handheld && options.portrait && options.runActive && !options.dismissed);
  }
  function controlBounds(layout, viewW, viewH) {
    var stick = STICK_BASE * layout.stickScale;
    var skillsW = SKILLS_W * layout.skillsScale;
    var skillsH = SKILLS_H * layout.skillsScale;
    return {
      stick: { left: layout.stickInsetX, right: layout.stickInsetX + stick, top: viewH - layout.stickInsetY - stick, bottom: viewH - layout.stickInsetY },
      skills: { left: viewW - layout.skillsInsetX - skillsW, right: viewW - layout.skillsInsetX, top: viewH - layout.skillsInsetY - skillsH, bottom: viewH - layout.skillsInsetY }
    };
  }

  return {
    WORLD_W: WORLD_W, WORLD_H: WORLD_H, MAP_W: MAP_W, MAP_H: MAP_H, MAP_EDGE: MAP_EDGE,
    STICK_BASE: STICK_BASE, SKILLS_W: SKILLS_W, SKILLS_H: SKILLS_H,
    HUD_LANDSCAPE: HUD_LANDSCAPE, HUD_PORTRAIT: HUD_PORTRAIT, PORTRAIT_HINT: PORTRAIT_HINT,
    PORTRAIT_VIEW_W: PORTRAIT_VIEW_W,
    hudOrientation: hudOrientation, hudStoreKey: hudStoreKey,
    defaultHudLayout: defaultHudLayout, normalizeHudLayout: normalizeHudLayout, clampHudLayout: clampHudLayout,
    portraitPlayBand: portraitPlayBand, landscapePlayView: landscapePlayView, portraitPlayView: portraitPlayView,
    portraitHintVisible: portraitHintVisible, controlBounds: controlBounds
  };
});
