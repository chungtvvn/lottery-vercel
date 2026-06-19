#!/usr/bin/env node
const assert = require('node:assert/strict');

const generateNumberStats = require('../lib/generators/statisticsGenerator');
const generateHeadTailStats = require('../lib/generators/headTailStatsGenerator');
const generateSumDiffStats = require('../lib/generators/sumDifferenceStatsGenerator');
const {
    getSoLeTheoCapConfigs,
    getSoLeTheoCapLabel,
    getSoLeTheoCapNextLabel,
    predictSoLeTheoCapNumbers
} = require('../lib/utils/soLeTheoCapPairs');

const allNumbers = Array.from({ length: 100 }, (_, number) => String(number).padStart(2, '0'));
const makeRows = values => values.map((special, index) => ({
    date: `2026-01-0${index + 1}`,
    special
}));

async function verifyAllPairCategories() {
    for (const config of getSoLeTheoCapConfigs()) {
        const a = allNumbers.find(number => getSoLeTheoCapLabel(number, config.key) === config.labels[0].key);
        const b = allNumbers.find(number => getSoLeTheoCapLabel(number, config.key) === config.labels[1].key);
        assert.ok(a && b, `${config.key}: thiếu số mẫu cho một trong hai nhãn`);

        const current = {
            values: [a, b, a, b],
            patternLabels: ['stale', 'cache', 'must', 'not-win']
        };
        assert.equal(
            getSoLeTheoCapNextLabel(current, config.key),
            config.labels[0].key,
            `${config.key}: ngày 5 phải cùng dạng ngày 3`
        );

        const predicted = predictSoLeTheoCapNumbers(current, config.key);
        assert.ok(predicted.length > 0, `${config.key}: dự báo rỗng`);
        for (const number of predicted) {
            assert.equal(
                getSoLeTheoCapLabel(String(number).padStart(2, '0'), config.key),
                config.labels[0].key,
                `${config.key}: chứa số không thuộc nhãn ngày 3`
            );
        }

        assert.equal(
            getSoLeTheoCapNextLabel({ values: [a, b, b, a] }, config.key),
            null,
            `${config.key}: chấp nhận chuỗi không phải ABAB`
        );
    }
}

async function verifyGeneratorMinimumLength() {
    const checks = [
        [generateNumberStats, 'so_chan_le', [2, 3, 4, 5]],
        [generateHeadTailStats, 'dau_chan_le', [20, 30, 40, 50]],
        [generateSumDiffStats, 'tong_tt_pair_chan_le', [20, 30, 40, 50]]
    ];

    for (const [generator, category, values] of checks) {
        const threeDays = await generator(null, null, makeRows(values.slice(0, 3)));
        const fourDays = await generator(null, null, makeRows(values));
        assert.equal(threeDays[category].soLeTheoCap.streaks.length, 0, `${category}: ABA chỉ được là tiềm năng`);
        assert.equal(fourDays[category].soLeTheoCap.streaks.length, 1, `${category}: ABAB phải hình thành chuỗi`);
        assert.equal(fourDays[category].soLeTheoCap.streaks[0].length, 4);
    }
}

async function main() {
    await verifyAllPairCategories();
    await verifyGeneratorMinimumLength();
    console.log(`So le theo cặp hợp lệ: 26 dạng đều tuân theo A-B-A-B-A-B.`);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
