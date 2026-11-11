import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { measureTree } from './page-size.mjs';

const require = createRequire(import.meta.url);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const scripts = [
  'engine.js',
  'renderer.js',
  'net.js',
  'campaign.js',
  'cloud-config.js',
  'cloud.js',
  'account.js',
  'app.js'
];

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true });
}

async function minify(file, loader) {
  const source = fs.readFileSync(file);
  const result = await transform(source.toString('utf8'), {
    loader,
    minify: true,
    legalComments: 'none',
    target: 'es2020',
    charset: 'utf8'
  });
  fs.writeFileSync(file, result.code);
}

fs.rmSync(dist, { recursive: true, force: true });
copyFile(path.join(root, 'index.html'), path.join(dist, 'index.html'));
copyDir(path.join(root, 'adventure'), path.join(dist, 'adventure'));
copyDir(path.join(root, 'legacy'), path.join(dist, 'legacy'));

for (const name of scripts) {
  await minify(path.join(dist, 'adventure', name), 'js');
}
await minify(path.join(dist, 'adventure', 'style.css'), 'css');

for (const name of scripts) {
  const file = path.join(dist, 'adventure', name);
  const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (checked.status !== 0) {
    console.error(checked.stderr);
    throw new Error('minified script failed syntax check: ' + name);
  }
}

const engine = require(path.join(dist, 'adventure', 'engine.js'));
const state = engine.create({ mode: 'story', players: 1, seed: 1, mission: 'ember' });
engine.step(state, { p1: { mx: 1, my: 0, aimX: 400, aimY: 300, shoot: true } }, 1 / 60);
if (!state.players.p1 || !Number.isFinite(state.players.p1.x)) {
  throw new Error('minified engine did not step');
}
const campaign = require(path.join(dist, 'adventure', 'campaign.js'));
if (campaign.normalize(null).v !== 2) throw new Error('minified campaign did not load');
require(path.join(dist, 'adventure', 'cloud.js'));
require(path.join(dist, 'adventure', 'net.js'));

const cloud = fs.readFileSync(path.join(dist, 'adventure', 'cloud.js'), 'utf8');
const net = fs.readFileSync(path.join(dist, 'adventure', 'net.js'), 'utf8');
const html = fs.readFileSync(path.join(dist, 'adventure', 'index.html'), 'utf8');
if (!cloud.includes('vendor/supabase-2.118.0.js') || !cloud.includes('?v=55')) {
  throw new Error('minified cloud.js lost the lazy Supabase URL');
}
if (!net.includes('vendor/peerjs.min.js') || !net.includes('?v=55')) {
  throw new Error('minified net.js lost the lazy PeerJS URL');
}
if (!html.includes('engine.js?v=55') || html.includes('vendor/peerjs') || html.includes('vendor/supabase')) {
  throw new Error('adventure page should keep separate scripts and lazy vendor files');
}

const before = measureTree(root);
const after = measureTree(dist);
const summary = {
  before,
  after,
  rawDelta: after.raw - before.raw,
  gzipDelta: after.gzip - before.gzip
};
fs.writeFileSync(path.join(dist, 'page-size.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
