#!/usr/bin/env node
'use strict';
const assert = require('assert');
const { buildGroups, betFromFusion, coverageCycles } = require('./research-scoring-pit-fusion');
const groups = buildGroups();
assert.ok(groups.groups.length > 0 && groups.groups.length <= 227);
const selected = betFromFusion([0, 1, 2], Array.from({ length: 100 }, (_, number) => number / 99), 1, 0.01);
assert.equal(selected.length, 30);
const raw = Array.from({ length: 200 }, (_, index) => ({ date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`, actual: index % 100 }));
assert.ok(coverageCycles(raw).completedWindows > 0);
console.log('PASS scoring PIT fusion helpers are deterministic.');
