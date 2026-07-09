#!/usr/bin/env node
const assert = require('assert');
const {
    predict,
    trainPairwise
} = require('./research-strict-evidence-ranker');
const {
    buildNumberEvidence
} = require('./research-true-pit-strategies');

function makeDays(count = 12) {
    return Array.from({ length: count }, (_, dayIndex) => {
        const actual = (dayIndex * 7) % 100;
        return {
            date: `fixture-${String(dayIndex).padStart(2, '0')}`,
            actual,
            features: Array.from({ length: 100 }, (_, number) => [
                Number(number === actual),
                Number(number % 2 === 0)
            ])
        };
    });
}

const days = makeDays();
const config = { learningRate: 0.05, l2: 0.01, epochs: 5 };
const first = trainPairwise(days, [0, 1], config);
const second = trainPairwise(days, [0, 1], config);
assert.deepStrictEqual(first, second);
for (const day of days) {
    const prediction = predict(first, day.features, 30);
    assert.strictEqual(prediction.length, 30);
    assert(prediction.includes(day.actual));
}

const evidence = buildNumberEvidence([
    {
        key: 'tong_1:tienLienTiep',
        numbers: [1, 10],
        tier: 1,
        isPotential: false,
        currentCount: 10,
        nextCount: 1
    },
    {
        key: 'tong_2:tienLienTiep',
        numbers: [1, 11],
        tier: 1,
        isPotential: true,
        currentCount: 8,
        nextCount: 1
    },
    {
        key: 'tong_1:tienLienTiep',
        numbers: [1, 10],
        tier: 1,
        isPotential: false,
        currentCount: 3,
        nextCount: 2
    }
])[1];
assert.strictEqual(evidence.supportGroups, 1);
assert.strictEqual(evidence.independentSets, 2);
assert.strictEqual(evidence.activeSets, 1);
assert.strictEqual(evidence.potentialSets, 1);
assert.strictEqual(evidence.groupDetails['sum|up'].independentSets, 2);
assert(evidence.groupDetails['sum|up'].combinedStrength > evidence.groups['sum|up']);
console.log('Strict evidence ranker tests passed.');
