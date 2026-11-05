'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

require('../adventure/net.js');

test('coop protocol is 24', () => {
  assert.equal(global.AdventureNet.protocolVersion, 24);
});
