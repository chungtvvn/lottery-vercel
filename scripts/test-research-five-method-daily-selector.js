#!/usr/bin/env node
'use strict';
const assert = require('assert');
const { rankFromHistory } = require('./research-five-method-daily-selector');

const rows = Array.from({ length: 35 }, (_, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    actual: 1,
    strategies: { alpha: Array.from({ length: 30 }, (_, number) => number), beta: Array.from({ length: 30 }, (_, number) => number + 20) }
}));
const result = rankFromHistory(rows, 35, ['alpha', 'beta'], { window: 30, metric: 'posterior', alpha: 9, beta: 21 });
assert.equal(result[0].id, 'alpha');
assert.equal(result[0].total, 30);
console.log('PASS five-method selector only ranks settlements before the prediction row.');
