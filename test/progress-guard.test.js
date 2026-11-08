'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const sqlDir = path.join(__dirname, 'sql');

function connectionEnv() {
  const database = process.env.PGDATABASE || 'ruins_guard_test';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(database)) {
    throw new Error('PGDATABASE must be a plain identifier');
  }
  return {
    env: {
      ...process.env,
      PGHOST: process.env.PGHOST || '127.0.0.1',
      PGPORT: process.env.PGPORT || '5432',
      PGUSER: process.env.PGUSER || 'postgres',
      PGPASSWORD: process.env.PGPASSWORD || 'postgres',
      PGDATABASE: database,
      PGCLIENTENCODING: 'UTF8'
    },
    database
  };
}

function psql(env, args, input) {
  const result = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-X', '-q', ...args], {
    env,
    input,
    encoding: 'utf8'
  });
  const detail = [result.stdout, result.stderr].filter(Boolean).join('\n');
  if (result.error) {
    throw new Error('psql failed to start. Install the PostgreSQL client.\n' + result.error.message);
  }
  if (result.status !== 0) {
    throw new Error(detail || 'psql exited ' + result.status);
  }
  return detail;
}

test('cloud save progress guard accepts the first save and rejects regressions and spikes', () => {
  const { env, database } = connectionEnv();
  const exists = spawnSync('psql', ['-d', 'postgres', '-tAc', 'SELECT 1 FROM pg_database WHERE datname = ' + "'" + database + "'"], {
    env: { ...env, PGDATABASE: 'postgres' },
    encoding: 'utf8'
  });
  if (exists.error) throw new Error('psql is required for the progress-guard test.\n' + exists.error.message);
  if (exists.status !== 0) throw new Error(exists.stderr || exists.stdout || 'could not connect to postgres');
  if (!String(exists.stdout).includes('1')) {
    psql({ ...env, PGDATABASE: 'postgres' }, ['-d', 'postgres', '-c', 'CREATE DATABASE ' + database]);
  }
  psql(env, ['-d', database, '-f', path.join(sqlDir, 'progress-guard-bootstrap.sql')]);
  psql(env, ['-d', database, '-f', path.join(root, 'adventure', 'backend', 'upgrade-progress-guard.sql')]);
  psql(env, ['-d', database, '-f', path.join(root, 'adventure', 'backend', 'upgrade-rail-section.sql')]);
  psql(env, ['-d', database, '-f', path.join(root, 'adventure', 'backend', 'upgrade-route-section.sql')]);
  psql(env, ['-d', database, '-f', path.join(sqlDir, 'progress-guard.sql')]);
  assert.ok(true);
});
