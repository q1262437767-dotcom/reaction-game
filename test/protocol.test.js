'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

require('../adventure/net.js');

test('coop protocol stays at 23', () => {
  assert.equal(global.AdventureNet.protocolVersion, 23);
});
