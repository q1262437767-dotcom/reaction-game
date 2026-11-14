'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function grab(file, name) {
  const text = fs.readFileSync(file, 'utf8');
  const marker = 'create or replace function ruins_private.' + name;
  const start = text.lastIndexOf(marker);
  assert.ok(start >= 0, name + ' missing from ' + file);
  const end = text.indexOf('$function$;', start);
  assert.ok(end > start, name + ' body missing from ' + file);
  return text.slice(start, end);
}

test('schema.sql matches the latest upgrade and is the fresh-database source', () => {
  const root = path.join(__dirname, '..', 'adventure', 'backend');
  const schema = path.join(root, 'schema.sql');
  const latest = path.join(root, 'upgrade-story-arc.sql');
  const header = fs.readFileSync(schema, 'utf8').slice(0, 700);
  assert.match(header, /fresh database/i);
  assert.match(header, /upgrade-\*\.sql/);
  assert.equal(grab(schema, 'save_ruins_profile_impl'), grab(latest, 'save_ruins_profile_impl'));
  assert.equal(grab(schema, 'reject_ruins_progress_jump'), grab(latest, 'reject_ruins_progress_jump'));
});
