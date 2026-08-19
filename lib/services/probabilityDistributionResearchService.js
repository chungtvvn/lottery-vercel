'use strict';

// Long-horizon, strict point-in-time evaluation for semantic number
// distributions. This is deliberately research-only: it compares independent
// partitions against score v2, but never overwrites an issued daily dàn.

const { scoringForms } = require('../utils/lotteryScoring');
const {
    buildGroupCatalog,
    runStrictWalkForward,
    wilsonLower
} = require('./probabilityScoreModel');
const {
    buildSemanticPartitions,
    normalizeRows,
    runStrictDistributionWalkForward,
    validatePartitions
} = require('./probabilityDistributionModel');

const CACHE_VERSION = 'probability-distribution-research-v4';
const BET_COUNT = 30;
const STAKE_PER_NUMBER_K = 1000;
const PAYOUT_MULTIPLIER = 84;
const BREAK_EVEN_HIT_RATE = BET_COUNT / PAYOUT_MULTIPLIER;

function isoWeek(dateValue) {
    const date = new Date(`${String(dateValue || '').slice(0, 10)}T00:00:00.000Z`);
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
    return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function normalizeNumbers(values) {
    return [...new Set((values || []).map(Number).filter(number => Number.isInteger(number) && number >= 0 && number < 100))]
        .sort((left, right) => left - right);
}

function longestStreak(rows, target) {
    let current = 0;
    let longest = 0;
    for (const row of rows || []) {
        if (Boolean(row.hit) === target) current += 1;
        else current = 0;
        longest = Math.max(longest, current);
    }
    return longest;
}

function summarize(rows, period = 'toàn bộ') {
    const values = rows || [];
    const wins = values.filter(row => row.hit).length;
    const stakeK = values.length * BET_COUNT * STAKE_PER_NUMBER_K;
    const payoutK = wins * PAYOUT_MULTIPLIER * STAKE_PER_NUMBER_K;
    const profitK = payoutK - stakeK;
    return {
        period,
        days: values.length,
        wins,
        losses: values.length - wins,
        hitRate: values.length ? wins / values.length : 0,
        wilsonLower: wilsonLower(wins, values.length),
        breakEvenHitRate: BREAK_EVEN_HIT_RATE,
        stakeK,
        payoutK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestWin: longestStreak(values, true),
        longestLoss: longestStreak(values, false)
    };
}

function aggregate(rows, keyFn) {
    const buckets = new Map();
    (rows || []).forEach(row => {
        const key = keyFn(row.date);
        const bucket = buckets.get(key) || [];
        bucket.push(row);
        buckets.set(key, bucket);
    });
    return [...buckets.entries()].map(([period, values]) => summarize(values, period))
        .sort((left, right) => left.period.localeCompare(right.period));
}

function splitRanges(rows, options = {}) {
    return {
        development: {
            start: options.developmentStart || rows[0]?.date || null,
            end: options.developmentEnd || '2021-12-31'
        },
        validation: {
            start: options.validationStart || '2022-01-01',
            end: options.validationEnd || '2024-12-31'
        },
        holdout: {
            start: options.holdoutStart || '2025-01-01',
            end: options.holdoutEnd || rows.at(-1)?.date || null
        }
    };
}

function splitSummary(rows, ranges) {
    return Object.fromEntries(Object.entries(ranges).map(([id, range]) => [
        id,
        {
            range,
            ...summarize((rows || []).filter(row => row.date >= range.start && row.date <= range.end), id)
        }
    ]));
}

// A fixed-size rank fusion.  Both input dàn were created before the outcome
// of their shared date.  The fusion only combines those already-issued ranks.
function buildRankFusionRows(leftRows, rightRows) {
    const rightByDate = new Map((rightRows || []).map(row => [row.date, row]));
    return (leftRows || []).map(left => {
        const right = rightByDate.get(left.date);
        if (!right || !Number.isInteger(left.actual) || left.numbers?.length !== BET_COUNT || right.numbers?.length !== BET_COUNT) return null;
        const score = Array(100).fill(0);
        const votes = Array(100).fill(0);
        [left.numbers, right.numbers].forEach(numbers => {
            normalizeNumbers(numbers).forEach((number, rank) => {
                score[number] += (BET_COUNT - rank) / BET_COUNT;
                votes[number] += 1;
            });
        });
        const numbers = score.map((value, number) => ({ number, value, votes: votes[number] }))
            .sort((a, b) => b.value - a.value || b.votes - a.votes || a.number - b.number)
            .slice(0, BET_COUNT)
            .map(row => row.number)
            .sort((a, b) => a - b);
        return {
            date: left.date,
            actual: left.actual,
            numbers,
            hit: numbers.includes(left.actual),
            intersectionCount: numbers.filter(number => left.numbers.includes(number) && right.numbers.includes(number)).length
        };
    }).filter(Boolean);
}

function pairwiseComplementarity(methodRows) {
    const ids = Object.keys(methodRows || {});
    const pairs = [];
    for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
            const leftId = ids[leftIndex];
            const rightId = ids[rightIndex];
            const rightByDate = new Map((methodRows[rightId] || []).map(row => [row.date, row]));
            const rows = (methodRows[leftId] || []).map(left => {
                const right = rightByDate.get(left.date);
                if (!right || !Number.isInteger(left.actual) || left.numbers?.length !== BET_COUNT || right.numbers?.length !== BET_COUNT) return null;
                const leftHit = left.numbers.includes(left.actual);
                const rightHit = right.numbers.includes(left.actual);
                const union = new Set([...left.numbers, ...right.numbers]);
                const overlap = left.numbers.filter(number => right.numbers.includes(number)).length;
                return { leftHit, rightHit, unionHit: leftHit || rightHit, overlap };
            }).filter(Boolean);
            const unionWins = rows.filter(row => row.unionHit).length;
            pairs.push({
                leftId,
                rightId,
                days: rows.length,
                bothHit: rows.filter(row => row.leftHit && row.rightHit).length,
                onlyLeft: rows.filter(row => row.leftHit && !row.rightHit).length,
                onlyRight: rows.filter(row => !row.leftHit && row.rightHit).length,
                neither: rows.filter(row => !row.leftHit && !row.rightHit).length,
                unionHitRate: rows.length ? unionWins / rows.length : 0,
                unionWilsonLower: wilsonLower(unionWins, rows.length),
                averageOverlap: rows.length ? rows.reduce((sum, row) => sum + row.overlap, 0) / rows.length : 0
            });
        }
    }
    return pairs.sort((left, right) => right.unionWilsonLower - left.unionWilsonLower
        || right.unionHitRate - left.unionHitRate
        || left.leftId.localeCompare(right.leftId));
}

function methodReport({ id, label, description, rows, ranges, recentDays = 180 }) {
    const allRows = rows || [];
    const issuedRows = allRows.filter(row => row?.numbers?.length === BET_COUNT && row?.abstained !== true);
    const coverage = {
        candidateDays: allRows.length,
        issuedDays: issuedRows.length,
        abstainedDays: allRows.length - issuedRows.length,
        coverageRate: allRows.length ? issuedRows.length / allRows.length : 0
    };
    const splits = splitSummary(issuedRows, ranges);
    const validation = splits.validation;
    const holdout = splits.holdout;
    // A method that abstains on many days may still be a useful diagnostic,
    // but cannot silently replace a fixed 30-number daily strategy.
    const promoted = coverage.coverageRate >= 0.98
        && validation.days >= 180
        && holdout.days >= 90
        && validation.profitK > 0
        && holdout.profitK > 0
        && validation.wilsonLower >= BREAK_EVEN_HIT_RATE
        && holdout.wilsonLower >= BREAK_EVEN_HIT_RATE;
    return {
        id,
        label,
        description,
        status: promoted
            ? 'Ứng viên nghiên cứu qua cổng đa kỳ; vẫn cần audit độc lập trước production.'
            : coverage.abstainedDays > 0
                ? `Nghiên cứu có điều kiện: chỉ phát dàn ${coverage.issuedDays}/${coverage.candidateDays} ngày khi trục đang hoạt động có lift prequential dương.`
                : 'Nghiên cứu: chưa đủ cổng promotion đa kỳ, không thay dàn production.',
        promoted,
        coverage,
        total: summarize(issuedRows),
        splits,
        yearly: aggregate(issuedRows, date => date.slice(0, 4)),
        monthly: aggregate(issuedRows, date => date.slice(0, 7)),
        weekly: aggregate(issuedRows, date => isoWeek(date)),
        recentRows: issuedRows.slice(-recentDays).map(row => ({
            date: row.date,
            actual: row.actual,
            hit: Boolean(row.hit),
            numbers: normalizeNumbers(row.numbers),
            ...(Number.isInteger(row.intersectionCount) ? { intersectionCount: row.intersectionCount } : {})
        }))
    };
}

function buildProbabilityDistributionResearch(rawRows, options = {}) {
    const rows = normalizeRows(rawRows);
    if (rows.length < 240) throw new Error('Không đủ raw data để nghiên cứu phân bổ nhóm số.');
    const partitions = buildSemanticPartitions();
    const validation = validatePartitions(partitions);
    if (!validation.valid) throw new Error(`Partition không hợp lệ: ${validation.failures.join(', ')}`);
    const common = {
        betCount: BET_COUNT,
        minWarmup: Number(options.minWarmup || 180),
        recentWindow: Number(options.recentWindow || 90),
        basePriorStrength: Number(options.basePriorStrength || 120),
        transitionPriorStrength: Number(options.transitionPriorStrength || 36)
    };
    const transition = runStrictDistributionWalkForward(rows, { ...common, mode: 'transition' });
    const contextual = runStrictDistributionWalkForward(rows, { ...common, mode: 'context' });
    const residual = runStrictDistributionWalkForward(rows, { ...common, mode: 'residual' });
    const calibrated = runStrictDistributionWalkForward(rows, { ...common, mode: 'calibrated' });
    const catalog = buildGroupCatalog(scoringForms, {
        betCount: BET_COUNT,
        minWarmup: common.minWarmup,
        groupWindow: 180,
        shortWindow: 45,
        learningRate: 0.12,
        l2: 0.012
    });
    const online = runStrictWalkForward(rows, {
        betCount: BET_COUNT,
        minWarmup: common.minWarmup,
        catalog,
        groupWindow: 180,
        shortWindow: 45,
        learningRate: 0.12,
        l2: 0.012
    });
    const fusion = buildRankFusionRows(calibrated.rows, online.rows);
    const ranges = splitRanges(rows, options);
    const rowSets = {
        distributionTransition: transition.rows,
        distributionContextual: contextual.rows,
        distributionResidual: residual.rows,
        distributionCalibrated: calibrated.rows,
        scoreV2Online: online.rows,
        distributionOnlineFusion: fusion
    };
    const methods = [
        methodReport({
            id: 'distributionTransition',
            label: 'Chuyển tiếp phân bổ nhóm',
            description: 'Dự đoán nhóm kế tiếp theo trục chẵn/lẻ, đầu–đít, to–nhỏ, tổng, hiệu và loại số; mọi transition được co rút về tỷ lệ nền.',
            rows: rowSets.distributionTransition,
            ranges,
            recentDays: options.recentDays
        }),
        methodReport({
            id: 'distributionContextual',
            label: 'Chuỗi hai trạng thái phân bổ',
            description: 'Dùng ngữ cảnh hai trạng thái gần nhất trên từng trục, ví dụ chẵn–lẻ rồi xét nhóm kế tiếp; mọi ngữ cảnh được co rút về transition một bước và chỉ phát dàn khi chính ngữ cảnh hiện tại có lift prequential dương.',
            rows: rowSets.distributionContextual,
            ranges,
            recentDays: options.recentDays
        }),
        methodReport({
            id: 'distributionResidual',
            label: 'Thiếu hụt phân bổ nhóm',
            description: 'Chỉ dùng residual gần đây của các partition không chồng lấn; độ tin cậy phải có log-lift prequential dương trước ngày dự đoán.',
            rows: rowSets.distributionResidual,
            ranges,
            recentDays: options.recentDays
        }),
        methodReport({
            id: 'distributionCalibrated',
            label: 'Phân bổ hiệu chỉnh',
            description: 'Kết hợp transition, ngữ cảnh và residual theo reliability đã học trước ngày D; các trục tương quan dùng chung ngân sách theo họ để tránh đếm lặp.',
            rows: rowSets.distributionCalibrated,
            ranges,
            recentDays: options.recentDays
        }),
        methodReport({
            id: 'scoreV2Online',
            label: 'Điểm xác suất online v2',
            description: 'Mốc so sánh hiện có: nhóm khử tương quan, empirical-Bayes, hazard gap và trọng số online.',
            rows: rowSets.scoreV2Online,
            ranges,
            recentDays: options.recentDays
        }),
        methodReport({
            id: 'distributionOnlineFusion',
            label: 'Đồng thuận Điểm v2 + phân bổ',
            description: 'Gộp rank Borda hai dàn strict PIT trước khi biết kết quả. Đây là phép so sánh nghiên cứu, không phải tự động gộp vốn hoặc thay dàn.',
            rows: rowSets.distributionOnlineFusion,
            ranges,
            recentDays: options.recentDays
        })
    ];
    const recommended = methods.slice().sort((left, right) => {
        const leftHoldout = left.splits.holdout || {};
        const rightHoldout = right.splits.holdout || {};
        return Number(rightHoldout.profitK || 0) - Number(leftHoldout.profitK || 0)
            || Number(rightHoldout.wilsonLower || 0) - Number(leftHoldout.wilsonLower || 0)
            || left.id.localeCompare(right.id);
    })[0];
    return {
        version: CACHE_VERSION,
        generatedAt: options.generatedAt || new Date().toISOString(),
        status: 'research-only',
        strictPointInTime: true,
        source: {
            dataStart: rows[0].date,
            dataEnd: rows.at(-1).date,
            rawRows: rows.length,
            partitions: partitions.map(partition => ({ id: partition.id, label: partition.label, categories: partition.categories.length })),
            partitionValidation: validation,
            note: 'Mỗi ngày D được xếp hạng bằng raw data trước D. Chuyển tiếp, residual và độ tin cậy đều cập nhật sau khi kết quả ngày trước đã chốt.'
        },
        economics: {
            betCount: BET_COUNT,
            stakePerNumberK: STAKE_PER_NUMBER_K,
            payoutMultiplier: PAYOUT_MULTIPLIER,
            breakEvenHitRate: BREAK_EVEN_HIT_RATE
        },
        ranges,
        methods,
        complementarity: pairwiseComplementarity(rowSets),
        recommendation: {
            methodId: recommended?.id || null,
            label: recommended?.label || null,
            status: recommended?.promoted
                ? 'Ứng viên nghiên cứu qua hai holdout; cần audit độc lập trước production.'
                : 'Không mô hình phân bổ nào được tự động đưa vào dàn production nếu chưa qua hai holdout độc lập.',
            promotionGate: 'Validation và holdout phải cùng dương, mỗi giai đoạn có đủ mẫu và cận Wilson vượt tỷ lệ hòa vốn 30/84.'
        }
    };
}

module.exports = {
    BET_COUNT,
    BREAK_EVEN_HIT_RATE,
    CACHE_VERSION,
    buildProbabilityDistributionResearch,
    buildRankFusionRows,
    pairwiseComplementarity,
    summarize
};
