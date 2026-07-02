const assert = require('assert');
const {
    chooseBetCount,
    createState,
    updateState
} = require('./research-loto-adaptive-bet-count');

const state = createState({ id: 'test', type: 'ewma', alpha: 0.5 });
assert.equal(chooseBetCount(state), 6, 'Trạng thái trung tính phải bắt đầu ở Top 6');

const outcomes = new Map([
    [3, { profitK: -6600 }],
    [4, { profitK: -8800 }],
    [5, { profitK: -11000 }],
    [6, { profitK: 18800 }],
    [7, { profitK: -15400 }]
]);
updateState(state, outcomes);
assert.equal(chooseBetCount(state), 6);

outcomes.set(7, { profitK: 26600 });
updateState(state, outcomes);
updateState(state, outcomes);
assert.equal(chooseBetCount(state), 7);

console.log('Loto adaptive bet-count tests passed.');
