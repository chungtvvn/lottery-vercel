#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { choose } = require('./research-recent-method-advisor');

const rows = Array.from({ length: 40 }, (_, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    actual: index % 2,
    strategies: {
        alpha: Array.from({ length: 30 }, (_, number) => number),
        beta: Array.from({ length: 30 }, (_, number) => number + 20)
    }
}));
const selection = choose(rows, 40, ['alpha', 'beta'], {
    window: 30,
    minSamples: 30,
    score: 'posteriorMean',
    gate: false
});
assert.equal(selection.chosen.id, 'alpha');
assert.equal(selection.chosen.total, 30);
console.log('PASS recent method advisor uses only settled rows before prediction date.');
