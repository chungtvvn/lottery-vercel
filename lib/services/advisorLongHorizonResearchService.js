'use strict';

// Long-horizon research for the Gợi ý laboratory.  This module is deliberately
// pure: it only accepts raw historical rows and never reads a cache or changes
// a live prediction.  Every candidate below is generated before the outcome
// on its own row is revealed.

const { scoringForms } = require('../utils/lotteryScoring');
const {
    buildGroupCatalog,
    normalizeRows,
    runStrictWalkForward,
    runOnlineExpertEnsemble,
    wilsonLower
} = require('./probabilityScoreModel');

const BET_COUNT = 30;
const PAYOUT_MULTIPLIER = 84;
const STAKE_PER_NUMBER_K = 1000;
const BREAK_EVEN_HIT_RATE = BET_COUNT / PAYOUT_MULTIPLIER;
const CACHE_VERSION = 'advisor-long-horizon-research-v1';

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

function numbersKey(numbers) {
    return (numbers || []).map(Number).filter(Number.isInteger).join(',');
}

function normalizeNumbers(values) {
    return [...new Set((values || []).map(Number).filter(number => Number.isInteger(number) && number >= 0 && number < 100))]
        .sort((left, right) => left - right);
}

function softmax(values) {
    const maximum = Math.max(...values);
    const exp = values.map(value => Math.exp(clamp(value - maximum, -30, 30)));
    const total = exp.reduce((sum, value) => sum + value, 0) || 1;
    return exp.map(value => value / total);
}

function isoWeek(dateValue) {
    const date = new Date(`${String(dateValue || '').slice(0, 10)}T00:00:00.000Z`);
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
    return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function longestStreak(rows, hit) {
    let current = 0;
    let longest = 0;
    for (const row of rows || []) {
        if (Boolean(row.hit) === hit) current += 1;
        else current = 0;
        longest = Math.max(longest, current);
    }
    return longest;
}

function periodSummary(rows, selector) {
    const values = rows || [];
    const wins = values.filter(row => row.hit).length;
    const stakeK = values.length * BET_COUNT * STAKE_PER_NUMBER_K;
    const payoutK = wins * PAYOUT_MULTIPLIER * STAKE_PER_NUMBER_K;
    const profitK = payoutK - stakeK;
    const hitRate = values.length ? wins / values.length : 0;
    return {
        period: selector,
        days: values.length,
        wins,
        losses: values.length - wins,
        hitRate,
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

function aggregatePeriods(rows, keyFn) {
    const groups = new Map();
    (rows || []).forEach(row => {
        const key = keyFn(row.date);
        const group = groups.get(key) || [];
        group.push(row);
        groups.set(key, group);
    });
    return [...groups.entries()]
        .map(([period, entries]) => periodSummary(entries, period))
        .sort((left, right) => left.period.localeCompare(right.period));
}

function splitSummary(rows, ranges) {
    return Object.fromEntries(Object.entries(ranges).map(([id, range]) => {
        const entries = (rows || []).filter(row => row.date >= range.start && row.date <= range.end);
        return [id, { range, ...periodSummary(entries, id) }];
    }));
}

function rangesFor(rows, options = {}) {
    const first = rows[0]?.date || null;
    const last = rows.at(-1)?.date || null;
    return {
        development: {
            start: options.developmentStart || first,
            end: options.developmentEnd || '2021-12-31'
        },
        validation: {
            start: options.validationStart || '2022-01-01',
            end: options.validationEnd || '2024-12-31'
        },
        holdout: {
            start: options.holdoutStart || '2025-01-01',
            end: options.holdoutEnd || last
        }
    };
}

// Combine two strict-PIT 30-number lists with rank-Borda.  A number in both
// lists receives support from both independent rankers, but the method never
// looks at the current outcome to decide its order.
function buildRankAgreementRows(onlineRows, hedgeRows) {
    const hedgeByDate = new Map((hedgeRows || []).map(row => [row.date, row]));
    return (onlineRows || []).map(online => {
        const hedge = hedgeByDate.get(online.date);
        if (!hedge || !Array.isArray(online.numbers) || !Array.isArray(hedge.numbers)) return null;
        const support = Array.from({ length: 100 }, () => 0);
        const votes = Array.from({ length: 100 }, () => 0);
        [online.numbers, hedge.numbers].forEach(numbers => {
            numbers.forEach((number, rank) => {
                support[number] += (BET_COUNT - rank) / BET_COUNT;
                votes[number] += 1;
            });
        });
        const numbers = support.map((score, number) => ({ number, score, votes: votes[number] }))
            .sort((left, right) => right.score - left.score || right.votes - left.votes || left.number - right.number)
            .slice(0, BET_COUNT)
            .map(row => row.number)
            .sort((left, right) => left - right);
        return {
            date: online.date,
            actual: online.actual,
            numbers,
            hit: numbers.includes(online.actual),
            sources: ['onlineRegularized', 'featureExpertHedge'],
            agreementCount: numbers.filter(number => online.numbers.includes(number) && hedge.numbers.includes(number)).length
        };
    }).filter(Boolean);
}

// Hedge across complete dàn methods.  At prediction day D, the weight of a
// method only reflects outcomes before D.  It differs from a number-level
// fusion because it chooses one already-issued 30-number candidate.
function buildMethodHedgeRows(candidatesByMethod, options = {}) {
    const ids = Object.keys(candidatesByMethod || {});
    const byDate = new Map();
    ids.forEach(id => (candidatesByMethod[id] || []).forEach(row => {
        const entry = byDate.get(row.date) || { date: row.date, actual: row.actual, candidates: {} };
        entry.candidates[id] = row;
        byDate.set(row.date, entry);
    }));
    const learningRate = Number(options.methodHedgeLearningRate || 0.65);
    const decay = Number(options.methodHedgeDecay || 0.996);
    const logWeights = Object.fromEntries(ids.map(id => [id, 0]));
    const output = [];
    [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date)).forEach(entry => {
        const available = ids.filter(id => normalizeNumbers(entry.candidates[id]?.numbers).length === BET_COUNT);
        if (available.length < 2 || !Number.isInteger(entry.actual)) return;
        const probabilities = softmax(available.map(id => logWeights[id] || 0));
        const weights = Object.fromEntries(available.map((id, index) => [id, Number(probabilities[index].toFixed(6))]));
        const selectedId = available.slice().sort((left, right) => (weights[right] - weights[left]) || left.localeCompare(right))[0];
        const selected = entry.candidates[selectedId];
        const numbers = normalizeNumbers(selected.numbers);
        const hit = numbers.includes(entry.actual);
        output.push({
            date: entry.date,
            actual: entry.actual,
            numbers,
            hit,
            selectedId,
            weights
        });
        available.forEach(id => {
            const candidateHit = normalizeNumbers(entry.candidates[id].numbers).includes(entry.actual);
            const reward = Number(candidateHit) - BET_COUNT / 100;
            logWeights[id] = clamp((logWeights[id] || 0) * decay + learningRate * reward, -6, 6);
        });
    });
    return output;
}

function compactRows(rows, limit = 180) {
    return (rows || []).slice(-limit).map(row => ({
        date: row.date,
        actual: row.actual,
        hit: Boolean(row.hit),
        numbers: normalizeNumbers(row.numbers),
        ...(row.selectedId ? { selectedId: row.selectedId } : {}),
        ...(row.weights ? { weights: row.weights } : {}),
        ...(Number.isInteger(row.agreementCount) ? { agreementCount: row.agreementCount } : {})
    }));
}

function methodReport(id, label, description, rows, ranges, options = {}) {
    const full = periodSummary(rows, 'toàn bộ');
    const splits = splitSummary(rows, ranges);
    const validation = splits.validation || {};
    const holdout = splits.holdout || {};
    const promoted = validation.days >= 180
        && holdout.days >= 90
        && validation.profitK > 0
        && holdout.profitK > 0
        && validation.wilsonLower >= BREAK_EVEN_HIT_RATE
        && holdout.wilsonLower >= BREAK_EVEN_HIT_RATE;
    return {
        id,
        label,
        description,
        status: promoted ? 'Đủ điều kiện ứng viên, vẫn cần audit độc lập' : 'Nghiên cứu: chưa đạt cổng promotion đa kỳ',
        promoted,
        total: full,
        splits,
        yearly: aggregatePeriods(rows, date => date.slice(0, 4)),
        monthly: aggregatePeriods(rows, date => date.slice(0, 7)),
        weekly: aggregatePeriods(rows, isoWeek),
        recentRows: compactRows(rows, options.recentDays || 180)
    };
}

function buildLongHorizonResearch(rawRows, options = {}) {
    const rows = normalizeRows(rawRows);
    if (rows.length < 240) throw new Error('Không đủ raw data để huấn luyện Gợi ý dài hạn.');
    const modelOptions = {
        betCount: BET_COUNT,
        minWarmup: options.minWarmup || 180,
        groupWindow: options.groupWindow || 180,
        shortWindow: options.shortWindow || 45,
        calibrationWindow: options.calibrationWindow || 180,
        learningRate: options.learningRate || 0.12,
        l2: options.l2 || 0.012
    };
    const catalog = buildGroupCatalog(scoringForms, modelOptions);
    const online = runStrictWalkForward(rows, { ...modelOptions, catalog });
    const experts = runOnlineExpertEnsemble(rows, { ...modelOptions, catalog });
    const agreementRows = buildRankAgreementRows(online.rows, experts.rows);
    const selectorRows = buildMethodHedgeRows({
        onlineRegularized: online.rows,
        featureExpertHedge: experts.rows,
        rankAgreement: agreementRows
    }, modelOptions);
    const ranges = rangesFor(rows, options);
    const methods = [
        methodReport(
            'onlineRegularized',
            'Mô hình xác suất trực tuyến',
            'Học trọng số từ nhóm số đã khử trùng, tần suất co rút Bayes và hazard gap. Trọng số của ngày D chỉ học từ kết quả trước D.',
            online.rows,
            ranges,
            options
        ),
        methodReport(
            'featureExpertHedge',
            'Hedge chuyên gia đặc trưng',
            'Gộp động các chuyên gia nhóm, tần suất, gap-hazard và mô hình online; trọng số chỉ cập nhật sau khi kết quả đã được công bố.',
            experts.rows,
            ranges,
            options
        ),
        methodReport(
            'rankAgreement',
            'Đồng thuận xếp hạng',
            'Ưu tiên số cùng được hai mô hình xếp cao, sau đó lấp dàn theo điểm Borda. Không cộng trực tiếp các nhóm tương quan.',
            agreementRows,
            ranges,
            options
        ),
        methodReport(
            'methodHedge',
            'Bộ chọn Hedge giữa các dàn',
            'Mỗi ngày chọn đúng một dàn trong ba ứng viên bằng hiệu suất đã kết toán trước đó. Đây là bộ chọn, không phải oracle hậu nghiệm.',
            selectorRows,
            ranges,
            options
        )
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
            groupCatalog: { groups: catalog.groups.length, ...catalog.config },
            methodology: 'Toàn bộ mô hình duyệt theo thời gian; ở ngày D chỉ dùng raw data trước D. Mọi số trong báo cáo là dàn cố định 30 số.'
        },
        economics: {
            betCount: BET_COUNT,
            stakePerNumberK: STAKE_PER_NUMBER_K,
            payoutMultiplier: PAYOUT_MULTIPLIER,
            breakEvenHitRate: BREAK_EVEN_HIT_RATE
        },
        ranges,
        methods,
        recommendation: {
            methodId: recommended?.id || null,
            label: recommended?.label || null,
            status: recommended?.promoted
                ? 'Ứng viên nghiên cứu qua hai holdout; cần audit độc lập trước production.'
                : 'Không mô hình nào tự động thay dàn production. Kết quả được hiển thị để so sánh và tiếp tục kiểm chứng.',
            promotionGate: 'Validation và holdout phải cùng dương, mỗi giai đoạn đủ mẫu và cận Wilson 90% vượt hòa vốn.'
        }
    };
}

module.exports = {
    BET_COUNT,
    BREAK_EVEN_HIT_RATE,
    CACHE_VERSION,
    buildRankAgreementRows,
    buildMethodHedgeRows,
    buildLongHorizonResearch
};
