#!/usr/bin/env node
const assert = require('assert');

const lotteryService = require('../lib/services/lotteryService');
const simulationService = require('../lib/services/simulationService');
const annualMilestoneService = require('../lib/services/annualMilestoneService');

function fixtureRows(count = 36) {
    const start = new Date('2026-01-01T00:00:00');
    return Array.from({ length: count }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return {
            date: date.toISOString().slice(0, 10),
            special: (index * 7 + 3) % 100
        };
    });
}

async function main() {
    const rows = fixtureRows();
    lotteryService.__setInMemoryCachesForBacktest({
        rawData: rows,
        numberStats: {},
        headTailStats: {},
        sumDiffStats: {}
    });

    const strict = await simulationService.runBacktest(2, rows, {
        methodIds: 'chainBlockFirstHold70',
        playMode: 'bet',
        summaryOnly: true,
        strictPointInTime: true
    });
    assert.strictEqual(strict.config.pointInTime.strict, true);
    assert.strictEqual(
        strict.config.pointInTime.dailyState,
        'strict-prefix-regenerated-before-each-prediction'
    );
    assert.strictEqual(strict.config.methodVersion, '2026-07-15-parallel-shared-ranking-v3');

    const originalBuildAnnualBaseline = annualMilestoneService.buildAnnualBaseline;
    const originalEnsureAnnualBaseline = annualMilestoneService.ensureAnnualBaseline;
    let strictBaselineBuilds = 0;
    let cachedBaselineReads = 0;
    annualMilestoneService.buildAnnualBaseline = (...args) => {
        strictBaselineBuilds++;
        return originalBuildAnnualBaseline(...args);
    };
    annualMilestoneService.ensureAnnualBaseline = (...args) => {
        cachedBaselineReads++;
        return originalEnsureAnnualBaseline(...args);
    };
    try {
        await simulationService.runBacktest(1, rows, {
            methodIds: 'deParallelBlock85Small65Hold70',
            playMode: 'bet',
            summaryOnly: true,
            strictPointInTime: true
        });
    } finally {
        annualMilestoneService.buildAnnualBaseline = originalBuildAnnualBaseline;
        annualMilestoneService.ensureAnnualBaseline = originalEnsureAnnualBaseline;
    }
    assert.strictEqual(strictBaselineBuilds, 0, 'Lịch sử song song must use daily point-in-time candidates, not the annual Mốc baseline.');
    assert.strictEqual(cachedBaselineReads, 0, 'Lịch sử song song must not read the annual Mốc baseline cache.');

    const nextPrediction = await simulationService.buildNextPrediction(rows, {
        methodIds: 'deParallelBlock85Small65Hold70',
        playMode: 'both',
        strictPointInTime: true
    });
    assert.strictEqual(
        nextPrediction.methods.deParallelBlock85Small65Hold70.methodVersion,
        simulationService.SIMULATION_METHOD_VERSION,
        'Daily pending snapshots must retain the method version used by R2 cache invalidation.'
    );

    const dedupParallelPrediction = await simulationService.buildNextPrediction(rows, {
        methodIds: 'deParallelDedupEdge75DropoffHold70',
        playMode: 'bet',
        strictPointInTime: true
    });
    const dedupParallel = dedupParallelPrediction.methods.deParallelDedupEdge75DropoffHold70;
    assert.strictEqual(
        dedupParallel.betNumbers.length + dedupParallel.intersectionNumbers.length,
        60,
        'Two parallel Hold 70 methods must preserve exactly 60 betting units.'
    );
    assert.strictEqual(dedupParallel.methodVersion, simulationService.SIMULATION_METHOD_VERSION);

    const annualCandidates = [
        {
            key: 'fixture-a', title: 'Fixture A', tier: 1, score: 100,
            riskRate: 0.95, exposureFrequencyPerYear: 0.2,
            currentCount: 20, nextCount: 1,
            currentLen: 2, baseLen: 2, targetLen: 3, recordLen: 3,
            numbers: Array.from({ length: 50 }, (_, index) => index)
        },
        {
            key: 'fixture-a-duplicate', title: 'Fixture A duplicate', tier: 2, score: 80,
            riskRate: 0.85, exposureFrequencyPerYear: 0.4,
            currentCount: 15, nextCount: 2,
            currentLen: 2, baseLen: 2, targetLen: 3, recordLen: 3,
            numbers: Array.from({ length: 50 }, (_, index) => index)
        },
        {
            key: 'fixture-b', title: 'Fixture B', tier: 3, score: 60,
            riskRate: 0.75, exposureFrequencyPerYear: 0.8,
            currentCount: 12, nextCount: 3,
            currentLen: 2, baseLen: 2, targetLen: 3, recordLen: 3,
            numbers: Array.from({ length: 50 }, (_, index) => index + 50)
        }
    ];
    const annualParallel = annualMilestoneService.buildPrediction(
        annualCandidates,
        70,
        'deParallelBlock85Small65'
    );
    const historyParallel = simulationService.buildDeParallelBlock85Small65Method(
        annualCandidates,
        70
    );
    assert.deepStrictEqual(
        historyParallel.betNumbers,
        annualParallel.betNumbers.map(Number),
        'Lịch sử và Mốc 20 năm phải dùng cùng công thức hợp dàn.'
    );
    assert.deepStrictEqual(
        historyParallel.intersectionNumbers,
        annualParallel.intersectionNumbers.map(Number),
        'Số giao nhau x2 phải giống nhau khi candidate đầu vào giống nhau.'
    );
    assert.deepStrictEqual(
        historyParallel.excluded,
        annualParallel.excludedNumbers.map(Number),
        'Danh sách loại phải giống nhau khi candidate đầu vào giống nhau.'
    );
    const calibratedCandidates = [
        {
            key: 'tong_moi:duplicate_a', numbers: Array.from({ length: 30 }, (_, index) => index + 40), tier: 1,
            currentCount: 40, nextCount: 1, exposureFrequencyPerYear: 2,
            riskRate: 0.975, isPotential: false
        },
        {
            key: 'tong_moi:duplicate_b', numbers: Array.from({ length: 30 }, (_, index) => index + 40), tier: 1,
            currentCount: 40, nextCount: 1, exposureFrequencyPerYear: 2,
            riskRate: 0.975, isPotential: false
        },
        {
            key: 'hieu_5:never_formed', numbers: [20], tier: 1,
            formationTrials: null, formationCount: 0, currentCount: 0, nextCount: 0, exposureFrequencyPerYear: 0,
            riskRate: 1, neverFormed: true, isPotential: true
        },
        {
            key: 'hieu_6:supported_non_formation', numbers: Array.from({ length: 30 }, (_, index) => index + 70), tier: 1,
            formationTrials: 30, formationCount: 1, currentCount: 1, nextCount: 0, exposureFrequencyPerYear: 0.05,
            riskRate: 1, neverFormed: false, isPotential: true
        }
    ];
    const calibratedRanking = annualMilestoneService.rankNumbersByAnnualCalibratedRisk(calibratedCandidates);
    const supported = calibratedRanking.find(row => row.num === 40);
    const duplicatePeer = calibratedRanking.find(row => row.num === 41);
    const unsupported = calibratedRanking.find(row => row.num === 20);
    const supportedPotential = calibratedRanking.find(row => row.num === 70);
    assert(supported.score > unsupported.score,
        'Bằng chứng có mẫu phải xếp trên risk 100% nhưng chưa có lần chuyển tiếp');
    assert.strictEqual(supported.memberships, 1,
        'Hai chuỗi cùng họ và cùng tập số chỉ được tính một bằng chứng');
    assert.strictEqual(supported.score, duplicatePeer.score,
        'Các số trong cùng tập tương đương phải nhận cùng điểm đã khử trùng');
    assert(supportedPotential.score > unsupported.score,
        'Chuỗi tiềm năng chỉ được dùng số cơ hội hình thành từ daily replay');

    const reliableRanking = annualMilestoneService.rankNumbersByReliableActiveEdge([
        {
            key: 'tong_moi:reliable', numbers: [40, 41], tier: 2,
            currentCount: 80, nextCount: 1, currentLen: 2, recordLen: 4,
            exposureFrequencyPerYear: 0.8, transitionEvidenceSource: 'annual-streak-transition',
            isPotential: false
        },
        {
            key: 'tong_moi:reliable_duplicate', numbers: [40, 41], tier: 2,
            currentCount: 80, nextCount: 1, currentLen: 2, recordLen: 4,
            exposureFrequencyPerYear: 0.8, transitionEvidenceSource: 'annual-streak-transition',
            isPotential: false
        },
        {
            key: 'hieu_5:potential_without_replay', numbers: [20], tier: 1,
            currentCount: 0, nextCount: 0, currentLen: 1, recordLen: 0,
            exposureFrequencyPerYear: 0, isPotential: true
        },
        {
            key: 'dong_5:harmful_number_family', numbers: [30], tier: 1,
            currentCount: 100, nextCount: 0, currentLen: 2, recordLen: 5,
            exposureFrequencyPerYear: 5, transitionEvidenceSource: 'annual-streak-transition',
            isPotential: false
        }
    ]);
    const reliable = reliableRanking.find(row => row.num === 40);
    assert(reliable.score > 0, 'Active có credible edge phải nhận điểm loại');
    assert.strictEqual(reliable.memberships, 1, 'Bằng chứng cùng họ/tập số phải được khử trùng');
    assert.strictEqual(reliableRanking.find(row => row.num === 20).score, 0,
        'Potential chưa có daily replay không được dùng');
    assert.strictEqual(reliableRanking.find(row => row.num === 30).score, 0,
        'Họ number có edge âm không được dùng trong phương pháp này');
    const verifiedSmallCandidates = [
        {
            key: 'block2x1SoLe:potential', numbers: [0, 1], tier: 1, score: 100,
            currentCount: 1, nextCount: 0, currentLen: 2, recordLen: 2,
            riskRate: 1, exposureFrequencyPerYear: 0.05,
            transitionCensoredAtRecord: true, isPotential: true
        },
        {
            key: 'tong_moi:potential', numbers: [10, 11], tier: 1, score: 100,
            currentCount: 1, nextCount: 0, currentLen: 2, recordLen: 2,
            riskRate: 1, exposureFrequencyPerYear: 0.05,
            transitionCensoredAtRecord: true, isPotential: true
        },
        {
            key: 'tong_moi:verified_active', numbers: [20, 21], tier: 1, score: 90,
            currentCount: 80, nextCount: 1, currentLen: 2, recordLen: 4,
            riskRate: 0.9875, exposureFrequencyPerYear: 0.8,
            transitionEvidenceSource: 'annual-streak-transition',
            transitionCensoredAtRecord: false, isPotential: false
        }
    ];
    for (const strategy of ['chainSmallVerifiedExact']) {
        const verifiedSmallPrediction = annualMilestoneService.buildPrediction(
            verifiedSmallCandidates,
            1,
            strategy
        );
        assert.deepStrictEqual(verifiedSmallPrediction.excludedNumbers, ['20'],
            `${strategy} phải ưu tiên active có chuyển tiếp hợp lệ trong cùng Tier/nhóm độ rộng`);
    }
    for (const strategy of ['dedupEdge75Hold', 'dedupDropoffHold']) {
        const prediction = annualMilestoneService.buildPrediction(annualCandidates, 70, strategy);
        assert.strictEqual(prediction.excludedNumbers.length, 70);
        assert.strictEqual(prediction.betNumbers.length, 30);
        assert.strictEqual(new Set(prediction.betNumbers).size, 30);
    }

    const legacy = await simulationService.runBacktest(2, rows, {
        methodIds: 'chainBlockFirstHold70',
        playMode: 'bet',
        summaryOnly: true,
        strictPointInTime: false
    });
    assert.strictEqual(legacy.config.pointInTime.strict, false);
    assert.match(legacy.config.pointInTime.warning, /không phải point-in-time/i);

    console.log('Strict point-in-time regression tests passed.');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
