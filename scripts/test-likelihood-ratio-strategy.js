#!/usr/bin/env node
const assert = require('assert');
const {
    buildPrediction,
    rankNumbersByLikelihoodRatio
} = require('../lib/services/annualMilestoneService');

function candidate(overrides = {}) {
    return {
        key: 'tong_test:tienLienTiep',
        numbers: Array.from({ length: 20 }, (_, index) => index),
        tier: 1,
        currentCount: 100,
        nextCount: 5,
        isPotential: false,
        ...overrides
    };
}

const broadRare = candidate();
const narrowCommon = candidate({
    key: 'dau_test:tienLienTiep',
    numbers: [50, 51],
    nextCount: 8
});
const ranked = rankNumbersByLikelihoodRatio([broadRare, narrowCommon]);
const byNumber = new Map(ranked.map(row => [row.num, row]));

assert(byNumber.get(0).score > 0, 'Tập 20 số chỉ tiếp tục 5% phải tạo bằng chứng loại.');
assert.strictEqual(
    byNumber.get(50).score,
    0,
    'Tập 2 số tiếp tục 8% không được xem là rủi ro so với xác suất nền 2%.'
);

const duplicateFamily = candidate({
    key: 'tong_test:luiLienTiep',
    nextCount: 4
});
const oneFamily = rankNumbersByLikelihoodRatio([broadRare, duplicateFamily]);
const twoFamilies = rankNumbersByLikelihoodRatio([
    broadRare,
    candidate({ key: 'dau_test:tienLienTiep', nextCount: 5 })
]);
assert(
    twoFamilies.find(row => row.num === 0).score >
    oneFamily.find(row => row.num === 0).score,
    'Hai họ độc lập phải mạnh hơn hai biến thể trong cùng một họ.'
);

const weakNarrow = candidate({
    key: 'dau_weak:tienLienTiep',
    numbers: [80, 81],
    nextCount: 8
});
const credibleBroad = candidate({
    key: 'tong_credible:tienLienTiep',
    numbers: Array.from({ length: 20 }, (_, index) => index + 20),
    nextCount: 5
});
const chainPrediction = buildPrediction(
    [weakNarrow, credibleBroad],
    20,
    'chainCredibleFirst'
);
assert.strictEqual(
    chainPrediction.selectedChains[0].key,
    credibleBroad.key,
    'Chuỗi có likelihood bảo thủ phải được chọn trước chuỗi nhỏ nhưng không có edge.'
);

console.log('Likelihood ratio strategy tests passed.');
