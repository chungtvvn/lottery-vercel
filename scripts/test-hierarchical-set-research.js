const assert = require('assert');
const {
    percentileScores,
    wilsonInterval
} = require('./research-hierarchical-set-distribution');

const scores = percentileScores([
    { number: 2 },
    { number: 1 },
    { number: 0 }
]);
assert.equal(scores[2], 1);
assert.equal(scores[1], 0.5);
assert.equal(scores[0], 0);

const interval = wilsonInterval(50, 100);
assert.ok(interval.lower < 0.5);
assert.ok(interval.upper > 0.5);

console.log('hierarchical set research helpers: OK');
