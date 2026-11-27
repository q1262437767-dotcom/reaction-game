'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const S = require('../adventure/sprites.js');

const LOCKED = new Set(Object.values(S.PALETTE).map(hex => hex.toUpperCase()));

test('actor and device sheets are 48×48 and export as an exact 2× nearest neighbor', () => {
  for (const id of ['traveler', 'ahe', 'lamp', 'valve', 'pillar-west', 'pillar-east', 'pillar-open', 'furnace-door', 'gate', 'vent']) {
    const frame = S.frame(id);
    assert.equal(frame.w, S.CANONICAL);
    assert.equal(frame.h, S.CANONICAL);
    const big = S.scaled(id, S.EXPORT_SCALE);
    assert.equal(big.w, 96);
    assert.equal(big.h, 96);
    const raw = S.raster(id);
    const x = 10, y = 8;
    const from = (y * frame.w + x) * 4;
    const to = ((y * 2) * big.w + (x * 2)) * 4;
    assert.equal(big.data[to], raw.data[from]);
    assert.equal(big.data[to + big.w * 4], raw.data[from]);
  }
});

test('shipped pixels stay inside the locked palette and have no soft alpha', () => {
  Object.keys(S.frames).forEach(id => {
    const metrics = S.metrics(id);
    metrics.colors.forEach(color => assert.ok(LOCKED.has(color.toUpperCase()), id + ' ' + color));
    const raw = S.raster(id);
    for (let i = 3; i < raw.data.length; i += 4) assert.ok(raw.data[i] === 0 || raw.data[i] === 255);
  });
});

test('traveler and ahe are swappable silhouettes, not the rejected block figures', () => {
  for (const id of ['traveler', 'ahe']) {
    const metrics = S.metrics(id);
    assert.ok(metrics.box.h >= 40 && metrics.box.h <= 46, id + ' height ' + metrics.box.h);
    assert.ok(metrics.inkShare < 0.42, id + ' ink ' + metrics.inkShare);
    assert.equal(metrics.paper, 0);
  }
  const knifeRows = S.frame('weapon-knife').rows;
  const ash = [];
  knifeRows.forEach((row, y) => { for (let x = 0; x < row.length; x += 1) if (row[x] === 'a') ash.push([x, y]); });
  assert.ok(ash.length >= 6);
  const minX = Math.min(...ash.map(point => point[0]));
  const maxX = Math.max(...ash.map(point => point[0]));
  const leftY = Math.max(...ash.filter(point => point[0] === minX).map(point => point[1]));
  const rightY = Math.min(...ash.filter(point => point[0] === maxX).map(point => point[1]));
  assert.ok(maxX - minX >= 8 && leftY - rightY >= 6, 'the knife runs up and to the right, not as a flat bar');
  const knife = S.metrics('weapon-knife');
  assert.equal(knife.paper, 0);
  assert.ok(S.has('weapon-pistol') && S.has('weapon-scatter'));
});

test('a missing sheet stays on the code-drawn fallback list and a swap replaces only that id', () => {
  const missing = S.fallback().map(item => item.id);
  assert.ok(missing.includes('fox'));
  assert.ok(missing.includes('boss-furnace'));
  assert.equal(S.has('fox'), false);
  const marker = { width: 48, height: 48 };
  assert.equal(S.install('traveler', marker), true);
  assert.equal(S.canvas('traveler'), marker);
  assert.equal(S.install('traveler', null), true);
  assert.notEqual(S.canvas('traveler'), marker);
});
