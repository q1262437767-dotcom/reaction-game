'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const skip = new Set(['node_modules', 'dist', 'vendor', '.git']);

function files(dir, found) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files(full, found);
    else if (/\.(js|html|json|md|sql|yml|yaml|css|txt)$/.test(entry.name)) found.push(full);
  }
  return found;
}

test('the shipped cloud config uses the publishable key, not a legacy anon JWT', () => {
  const source = fs.readFileSync(path.join(root, 'adventure', 'cloud-config.js'), 'utf8');
  assert.match(source, /publishableKey:\s*'sb_publishable_[A-Za-z0-9_-]+'/);
  assert.doesNotMatch(source, /eyJ[A-Za-z0-9_-]{8,}/);
  assert.doesNotMatch(source, /anonKey|anon_key|SUPABASE_ANON/i);

  const jwt = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;
  const hits = [];
  for (const file of files(root, [])) {
    const text = fs.readFileSync(file, 'utf8');
    if (jwt.test(text)) hits.push(path.relative(root, file));
  }
  assert.deepEqual(hits, []);
});
