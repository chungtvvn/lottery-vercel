const assert = require('assert');
const {
    getVerifiedDeduplicatedEdge75Evidence,
    rankNumbersByVerifiedDeduplicatedEdge75
} = require('../lib/services/annualMilestoneService');

function active(overrides = {}) {
    return {
        key: 'test:active',
        title: 'Active test',
        numbers: [12, 34],
        isPotential: false,
        transitionEvidenceSource: 'annual-streak-transition',
        currentCount: 100,
        nextCount: 5,
        ...overrides
    };
}

const credible = getVerifiedDeduplicatedEdge75Evidence(active());
assert.ok(credible);
assert.strictEqual(credible.trials, 100);
assert.strictEqual(credible.breaks, 95);
assert.ok(credible.edge > 0);

assert.strictEqual(
    getVerifiedDeduplicatedEdge75Evidence(active({
        transitionEvidenceSource: 'unavailable-in-sample-record-boundary'
    })),
    null,
    'Không được dùng transition bị kiểm duyệt tại biên kỷ lục'
);

assert.strictEqual(
    getVerifiedDeduplicatedEdge75Evidence(active({
        isPotential: true,
        transitionEvidenceSource: 'unavailable-requires-daily-replay',
        formationEvidenceSource: 'unavailable-requires-daily-replay'
    })),
    null,
    'Không được suy diễn xác suất hình thành khi thiếu daily replay'
);

const ranking = rankNumbersByVerifiedDeduplicatedEdge75([
    active({ key: 'same-set-a' }),
    active({ key: 'same-set-b', currentCount: 10, nextCount: 9 }),
    active({ key: 'other-set', numbers: [56], currentCount: 80, nextCount: 40 })
]);
const row12 = ranking.find(row => row.num === 12);
const row34 = ranking.find(row => row.num === 34);
assert.strictEqual(row12.memberships, 1, 'Tập số trùng chỉ được tính một lần');
assert.strictEqual(row34.memberships, 1);
assert.deepStrictEqual(ranking.slice(0, 2).map(row => row.num).sort((a, b) => a - b), [12, 34]);

console.log('Edge75 PIT tests passed.');
