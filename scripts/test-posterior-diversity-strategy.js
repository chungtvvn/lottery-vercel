const assert = require('assert');
const annualMilestoneService = require('../lib/services/annualMilestoneService');

function candidate({
    key,
    numbers,
    currentCount,
    nextCount,
    tier = 2,
    isPotential = false,
    exposureFrequencyPerYear = 0.4,
    isRecordOrSuper = false,
    neverFormed = false
}) {
    return {
        key,
        title: key,
        numbers,
        currentCount,
        nextCount,
        riskRate: currentCount > 0 ? 1 - (nextCount / currentCount) : 1,
        tier,
        isPotential,
        exposureFrequencyPerYear,
        isRecordOrSuper,
        neverFormed,
        currentLen: 2,
        baseLen: 2,
        targetLen: 3,
        recordLen: 3
    };
}

const candidates = [
    candidate({ key: 'dau_1:lienTiep', numbers: [10, 11], currentCount: 40, nextCount: 2 }),
    candidate({ key: 'dau_1:alias', numbers: [10, 11], currentCount: 38, nextCount: 2 }),
    candidate({ key: 'tong_1:lienTiep', numbers: [10, 19], currentCount: 30, nextCount: 1 }),
    candidate({ key: 'hieu_1:lienTiep', numbers: [10, 21], currentCount: 28, nextCount: 1 }),
    candidate({ key: 'dit_9:lienTiep', numbers: [19, 29], currentCount: 20, nextCount: 16, tier: 3 }),
    candidate({
        key: 'dit_9:oneSample',
        numbers: [99],
        currentCount: 1,
        nextCount: 0,
        tier: 1,
        isRecordOrSuper: true
    })
];

const prediction = annualMilestoneService.buildPrediction(
    candidates,
    1,
    'numberPosteriorDiversity'
);

assert.deepStrictEqual(prediction.excludedNumbers, ['10']);
assert.equal(prediction.ranking[0].number, '10');
assert.equal(
    prediction.ranking[0].supportCount,
    3,
    'Chuỗi alias cùng họ và cùng tập số chỉ được tính một lần'
);
assert.ok(
    prediction.ranking.find(row => row.number === '99').rank > 1,
    'Một quan sát 100% duy nhất không được lấn át đồng thuận đa họ có mẫu lớn'
);
assert.ok(
    annualMilestoneService.STRATEGIES.numberPosteriorDiversity,
    'Strategy phải được đăng ký trong service'
);

console.log('Posterior diversity strategy tests passed.');
