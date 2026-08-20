#!/usr/bin/env node
const assert = require('assert');

const annualMilestoneService = require('../lib/services/annualMilestoneService');

function candidate(key, number, overrides = {}) {
    const start = number < 50 ? 0 : 50;
    return {
        key,
        numbers: Array.from({ length: 30 }, (_, index) => start + index),
        tier: 2,
        currentCount: 100,
        nextCount: 5,
        exposureFrequencyPerYear: 5,
        riskRate: 0.95,
        isPotential: false,
        transitionEvidenceSource: 'annual-streak-transition',
        baseLen: 2,
        baseOccurrenceCount: 100,
        baseAvgLength: 2.4,
        targetOccurrenceCount: 20,
        targetGapSample: 19,
        targetGapRatio: 0.5,
        ...overrides
    };
}

function scoreFor(ranking, number) {
    return ranking.find(row => row.num === number)?.score ?? 0;
}

function run() {
    assert(
        annualMilestoneService.STRATEGY_IDS.includes('numberRecurrenceCalibratedRisk'),
        'Chiến lược recurrence phải được đăng ký.'
    );

    const recent = candidate('tong_moi:recent', 10, { targetGapRatio: 0.1 });
    const overdue = candidate('hieu_5:overdue', 60, { targetGapRatio: 1.5 });
    const ranking = annualMilestoneService.rankNumbersByRecurrenceCalibratedRisk([recent, overdue]);
    assert(
        scoreFor(ranking, 10) > scoreFor(ranking, 60),
        'Cùng bằng chứng gãy và đủ mẫu, lần target vừa xuất hiện phải nhận hiệu chỉnh loại nhẹ hơn trạng thái đã quá nhịp.'
    );

    const sparseRecent = candidate('tong_moi:sparse_recent', 10, {
        targetOccurrenceCount: 2,
        targetGapSample: 1,
        targetGapRatio: 0.1
    });
    const sparseOverdue = candidate('hieu_5:sparse_overdue', 60, {
        targetOccurrenceCount: 2,
        targetGapSample: 1,
        targetGapRatio: 1.5
    });
    const sparseRanking = annualMilestoneService.rankNumbersByRecurrenceCalibratedRisk([
        sparseRecent,
        sparseOverdue
    ]);
    assert.strictEqual(
        scoreFor(sparseRanking, 10),
        scoreFor(sparseRanking, 60),
        'Khoảng cách chỉ có một mẫu gap không được thay đổi điểm.'
    );

    const unsupportedPotential = candidate('tong_moi:potential', 50, {
        isPotential: true,
        currentCount: 0,
        nextCount: 0,
        formationTrials: null,
        formationCount: 0,
        transitionEvidenceSource: 'unavailable-requires-daily-replay'
    });
    const potentialRanking = annualMilestoneService.rankNumbersByRecurrenceCalibratedRisk([
        unsupportedPotential
    ]);
    assert.strictEqual(
        scoreFor(potentialRanking, 50),
        0,
        'Chuỗi tiềm năng chưa có daily replay không được suy diễn xác suất hình thành từ số streak tích lũy.'
    );

    console.log('PASS recurrence-calibrated risk strategy');
}

run();
