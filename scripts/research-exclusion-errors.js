#!/usr/bin/env node

/**
 * Research exclusion error sources across historical data.
 *
 * Error definition: a candidate/method excludes the actual special number for
 * the prediction date. Reports compare realised error against random baseline
 * by excluded-number coverage.
 */

const fs = require('fs');
const path = require('path');

const lotteryService = require('../lib/services/lotteryService');
const historicalExclusionService = require('../lib/services/historicalExclusionService');
const exclusionLogic = require('../lib/services/exclusionLogicService');

const BET_PER_NUMBER = 10;
const WIN_MULTIPLIER = 70;
const MIN_EXCLUDED_TO_PLAY = 30;
const WARMUP_DAYS = Number(process.env.WARMUP_DAYS || 365);
const REPORT_DATE = new Date().toISOString().slice(0, 10);
const REPORT_DIR = path.join(process.cwd(), 'reports');

const PATTERN_SUFFIXES = [
    'LuiDeuLienTiep', 'TienDeuLienTiep',
    'LuiLienTiep', 'TienLienTiep',
    'LuiDeu', 'TienDeu',
    'VeLienTiep', 'VeCungGiaTri', 'VeSole', 'VeSoleMoi',
    'DongTien', 'DongLui',
    'TienLuiSoLe', 'LuiTienSoLe', 'SoLeTheoCap',
    'Lui', 'Tien'
];

const STRATEGIES = [
    {
        id: 'priority85',
        name: 'Ưu tiên >=85',
        select: candidates => candidates.filter(item => item.exclusionPriority >= 85)
    },
    {
        id: 'priority90',
        name: 'Ưu tiên >=90',
        select: candidates => candidates.filter(item => item.exclusionPriority >= 90)
    },
    {
        id: 'priority95',
        name: 'Ưu tiên >=95',
        select: candidates => candidates.filter(item => item.exclusionPriority >= 95)
    },
    {
        id: 'formedPriority85',
        name: 'Chỉ chuỗi đã HT >=85',
        select: candidates => candidates.filter(item => !item.isPotential && item.exclusionPriority >= 85)
    },
    {
        id: 'potentialPriority85',
        name: 'Chỉ chuỗi chưa HT >=85',
        select: candidates => candidates.filter(item => item.isPotential && item.exclusionPriority >= 85)
    },
    {
        id: 'edgePositive85',
        name: 'Ưu tiên >=85 + edge dương',
        select: candidates => candidates.filter(item => item.exclusionPriority >= 85 && item.predictedEdge > 0)
    },
    {
        id: 'lower70Priority85',
        name: 'Ưu tiên >=85 + lower >=70%',
        select: candidates => candidates.filter(item => item.exclusionPriority >= 85 && item.lowerBound >= 0.70)
    },
    {
        id: 'sample50Priority85',
        name: 'Ưu tiên >=85 + mẫu >=50',
        select: candidates => candidates.filter(item => item.exclusionPriority >= 85 && item.sampleSize >= 50)
    },
    {
        id: 'noFixed3Priority85',
        name: 'Ưu tiên >=85, bỏ nhóm 3 giá trị cố định',
        select: candidates => candidates.filter(item => item.exclusionPriority >= 85 && !item.isFixedThreeValueGroup)
    },
    {
        id: 'recordOr90',
        name: 'Kỷ lục hoặc ưu tiên >=90',
        select: candidates => candidates.filter(item => item.isRecordDropOffCritical || item.exclusionPriority >= 90)
    },
    {
        id: 'ranked60to70',
        name: 'Xếp hạng loại 60-70 số',
        select: candidates => selectTargetExcluded(candidates.filter(item => item.exclusionPriority >= 85), 60, 70)
    },
    {
        id: 'risk25Target75',
        name: 'Tổng hợp rủi ro 25 số đánh',
        select: candidates => selectTargetExcluded(candidates, 75, 75)
    }
];

function parseRawDate(rawDate) {
    return historicalExclusionService.parseDate(rawDate);
}

function formatRawDate(rawDate) {
    const parsed = parseRawDate(rawDate);
    return parsed ? historicalExclusionService.formatDate(parsed) : '';
}

function formatIsoDate(rawDate) {
    const parsed = parseRawDate(rawDate);
    if (!parsed) return '';
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function normalizeNumber(value) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 && parsed < 100 ? parsed : null;
}

function normalizeNumberList(values) {
    return [...new Set((values || [])
        .map(normalizeNumber)
        .filter(value => value !== null))]
        .sort((a, b) => a - b);
}

function getSortedLotteryData(rawData) {
    return (rawData || [])
        .filter(item => item && item.date && item.special !== null && item.special !== undefined)
        .slice()
        .sort((a, b) => {
            const da = parseRawDate(a.date);
            const db = parseRawDate(b.date);
            return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
        });
}

function getHistoryYearsAtIndex(sortedData, basisIndex) {
    if (!sortedData || sortedData.length === 0 || basisIndex <= 0) return 1;
    const firstDate = parseRawDate(sortedData[0].date);
    const basisDate = parseRawDate(sortedData[basisIndex].date);
    if (!firstDate || !basisDate || basisDate <= firstDate) return 1;
    const days = (basisDate - firstDate) / (1000 * 60 * 60 * 24);
    return Math.max(days / 365.25, 0.01);
}

function round(value, digits = 2) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    const base = 10 ** digits;
    return Math.round(number * base) / base;
}

function stripPatternSuffix(key = '') {
    if (key.includes(':')) return key.split(':')[0];
    for (const suffix of PATTERN_SUFFIXES) {
        if (key.endsWith(suffix)) return key.slice(0, -suffix.length);
    }
    return key;
}

function getPatternType(item = {}) {
    const text = `${item.key || ''} ${item.title || ''}`.toLowerCase();
    if (text.includes('so le theo cặp') || text.includes('soletheocap')) return 'so_le_theo_cap';
    if (text.includes('tiến-lùi') || text.includes('lùi-tiến') || text.includes('tienluisole') || text.includes('luitiensole')) return 'tien_lui_so_le';
    if (text.includes('về so le') || text.includes('vesole') || text.includes('solemoi')) return 've_so_le';
    if (text.includes('lùi đều') || text.includes('luideu')) return 'lui_deu';
    if (text.includes('tiến đều') || text.includes('tiendeu')) return 'tien_deu';
    if (text.includes('lùi liên tiếp') || text.includes('luilientiep')) return 'lui_lien_tiep';
    if (text.includes('tiến liên tiếp') || text.includes('tienlientiep')) return 'tien_lien_tiep';
    if (text.includes('đồng tiến') || text.includes('dongtien')) return 'dong_tien';
    if (text.includes('đồng lùi') || text.includes('donglui')) return 'dong_lui';
    if (text.includes('về liên tiếp') || text.includes('velientiep')) return 've_lien_tiep';
    return 'other';
}

function getAxis(item = {}) {
    const text = `${item.key || ''} ${item.title || ''}`.toLowerCase();
    if (text.includes('tổng mới') || text.includes('tong_moi')) return 'tong_moi';
    if (text.includes('tổng tt') || text.includes('tong_tt')) return 'tong_tt';
    if (text.includes('hiệu') || text.includes('hieu')) return 'hieu';
    if (text.includes('đầu') || text.includes('dau')) return 'dau';
    if (text.includes('đít') || text.includes('dit')) return 'dit';
    if (text.includes('số') || text.includes('so')) return 'so';
    return 'other';
}

function isFixedThreeValueGroup(item = {}) {
    const category = stripPatternSuffix(item.key || '');
    return /^(dau_3d_|dit_3d_)\d_\d_\d$/.test(category)
        || /^(tong_tt_|tong_moi_|hieu_)\d+_\d+_\d+$/.test(category);
}

function enrichCandidate(item) {
    const numbers = normalizeNumberList(item.numbers);
    const numbersCount = numbers.length;
    const exclusionRate = Number(item.exclusionRate ?? item.dropOffRate ?? 0);
    const lowerBound = Number(item.exclusionLowerBound ?? 0);
    const sampleSize = Number(item.exclusionSampleSize ?? item.currentCount ?? 0);
    const baselineBreakRate = 1 - numbersCount / 100;
    const predictedEdge = exclusionRate - baselineBreakRate;
    return {
        ...item,
        numbers,
        numbersCount,
        exclusionRate,
        dropOffRate: Number(item.dropOffRate ?? exclusionRate),
        lowerBound,
        sampleSize,
        baselineErrorRate: numbersCount / 100,
        baselineBreakRate,
        predictedEdge,
        patternType: getPatternType(item),
        axis: getAxis(item),
        isFixedThreeValueGroup: isFixedThreeValueGroup(item)
    };
}

function sortCandidates(candidates) {
    return candidates.slice().sort((a, b) => {
        const cmp = exclusionLogic.compareExclusionCandidates
            ? exclusionLogic.compareExclusionCandidates(a, b)
            : 0;
        if (cmp !== 0) return cmp;
        if ((b.exclusionPriority || 0) !== (a.exclusionPriority || 0)) return (b.exclusionPriority || 0) - (a.exclusionPriority || 0);
        if ((b.exclusionRate || 0) !== (a.exclusionRate || 0)) return (b.exclusionRate || 0) - (a.exclusionRate || 0);
        return (b.predictedEdge || 0) - (a.predictedEdge || 0);
    });
}

function selectTargetExcluded(candidates, targetMin, targetMax) {
    const excluded = new Set();
    const selected = [];
    for (const item of sortCandidates(candidates)) {
        const fresh = item.numbers.filter(num => !excluded.has(num));
        if (fresh.length === 0) continue;
        if (excluded.size + fresh.length > targetMax) continue;
        fresh.forEach(num => excluded.add(num));
        selected.push(item);
        if (excluded.size >= targetMin) break;
    }
    return selected;
}

function buildExcludedSet(selected) {
    const excluded = new Set();
    selected.forEach(item => item.numbers.forEach(num => excluded.add(num)));
    return excluded;
}

function createSummary() {
    return {
        days: 0,
        played: 0,
        skipped: 0,
        hits: 0,
        misses: 0,
        stake: 0,
        payout: 0,
        profit: 0,
        excludedSum: 0,
        betSum: 0,
        selectedStreaksSum: 0,
        falseExcludedByCoverageSum: 0
    };
}

function addMethodDay(summary, selected, actualNumber) {
    summary.days += 1;
    const excluded = buildExcludedSet(selected);
    const excludedCount = excluded.size;
    const betCount = 100 - excludedCount;
    if (excludedCount < MIN_EXCLUDED_TO_PLAY || betCount <= 0) {
        summary.skipped += 1;
        return { skipped: true, excluded, excludedCount, betCount, profit: 0 };
    }

    summary.played += 1;
    summary.excludedSum += excludedCount;
    summary.betSum += betCount;
    summary.selectedStreaksSum += selected.length;
    summary.falseExcludedByCoverageSum += excludedCount / 100;

    const miss = excluded.has(actualNumber);
    const stake = betCount * BET_PER_NUMBER;
    const payout = miss ? 0 : BET_PER_NUMBER * WIN_MULTIPLIER;
    const profit = payout - stake;
    summary.stake += stake;
    summary.payout += payout;
    summary.profit += profit;
    if (miss) summary.misses += 1;
    else summary.hits += 1;

    return { skipped: false, excluded, excludedCount, betCount, miss, profit };
}

function createAgg() {
    return {
        days: 0,
        errors: 0,
        numbersCountSum: 0,
        prioritySum: 0,
        dropOffSum: 0,
        lowerSum: 0,
        sampleSum: 0,
        predictedEdgeSum: 0,
        potentialDays: 0,
        recordCriticalDays: 0,
        fixed3Days: 0
    };
}

function addCandidateAgg(map, key, item, actualNumber) {
    if (!map.has(key)) {
        map.set(key, {
            key,
            title: item.title || item.pattern || item.key,
            patternType: item.patternType,
            axis: item.axis,
            isPotential: !!item.isPotential,
            isFixedThreeValueGroup: !!item.isFixedThreeValueGroup,
            ...createAgg()
        });
    }
    const agg = map.get(key);
    agg.days += 1;
    if (item.numbers.includes(actualNumber)) agg.errors += 1;
    agg.numbersCountSum += item.numbersCount;
    agg.prioritySum += Number(item.exclusionPriority || 0);
    agg.dropOffSum += Number(item.exclusionRate || 0);
    agg.lowerSum += Number(item.lowerBound || 0);
    agg.sampleSum += Number(item.sampleSize || 0);
    agg.predictedEdgeSum += Number(item.predictedEdge || 0);
    if (item.isPotential) agg.potentialDays += 1;
    if (item.isRecordDropOffCritical) agg.recordCriticalDays += 1;
    if (item.isFixedThreeValueGroup) agg.fixed3Days += 1;
}

function createGroupAgg() {
    return {
        days: 0,
        errors: 0,
        candidates: 0,
        numbersCountSum: 0,
        prioritySum: 0,
        predictedEdgeSum: 0
    };
}

function addGroupAgg(map, key, item, actualNumber) {
    if (!map.has(key)) map.set(key, { key, ...createGroupAgg() });
    const agg = map.get(key);
    agg.days += 1;
    agg.candidates += 1;
    if (item.numbers.includes(actualNumber)) agg.errors += 1;
    agg.numbersCountSum += item.numbersCount;
    agg.prioritySum += Number(item.exclusionPriority || 0);
    agg.predictedEdgeSum += Number(item.predictedEdge || 0);
}

function finalizeCandidateAgg(agg) {
    const baselineErrorRate = agg.days > 0 ? agg.numbersCountSum / agg.days / 100 : 0;
    const errorRate = agg.days > 0 ? agg.errors / agg.days : 0;
    const realisedBreakRate = 1 - errorRate;
    return {
        key: agg.key,
        title: agg.title,
        axis: agg.axis,
        patternType: agg.patternType,
        days: agg.days,
        errors: agg.errors,
        errorRate: round(errorRate * 100, 2),
        expectedErrorRate: round(baselineErrorRate * 100, 2),
        errorLift: round((errorRate - baselineErrorRate) * 100, 2),
        realisedBreakRate: round(realisedBreakRate * 100, 2),
        avgNumbers: round(agg.numbersCountSum / Math.max(1, agg.days), 2),
        avgPriority: round(agg.prioritySum / Math.max(1, agg.days), 2),
        avgDropOff: round(agg.dropOffSum / Math.max(1, agg.days) * 100, 2),
        avgLower: round(agg.lowerSum / Math.max(1, agg.days) * 100, 2),
        avgSample: round(agg.sampleSum / Math.max(1, agg.days), 1),
        avgPredictedEdge: round(agg.predictedEdgeSum / Math.max(1, agg.days) * 100, 2),
        potentialShare: round(agg.potentialDays / Math.max(1, agg.days) * 100, 1),
        recordCriticalShare: round(agg.recordCriticalDays / Math.max(1, agg.days) * 100, 1),
        fixed3Share: round(agg.fixed3Days / Math.max(1, agg.days) * 100, 1),
        badness: round((errorRate - baselineErrorRate) * Math.sqrt(agg.days) * 100, 3)
    };
}

function finalizeMethodSummary(id, name, summary) {
    return {
        id,
        name,
        days: summary.days,
        played: summary.played,
        skipped: summary.skipped,
        hits: summary.hits,
        misses: summary.misses,
        hitRate: summary.played > 0 ? round(summary.hits / summary.played * 100, 2) : 0,
        missRate: summary.played > 0 ? round(summary.misses / summary.played * 100, 2) : 0,
        expectedMissRateByCoverage: summary.played > 0 ? round(summary.falseExcludedByCoverageSum / summary.played * 100, 2) : 0,
        missLiftVsCoverage: summary.played > 0
            ? round((summary.misses / summary.played - summary.falseExcludedByCoverageSum / summary.played) * 100, 2)
            : 0,
        avgExcluded: summary.played > 0 ? round(summary.excludedSum / summary.played, 2) : 0,
        avgBet: summary.played > 0 ? round(summary.betSum / summary.played, 2) : 0,
        avgSelectedStreaks: summary.played > 0 ? round(summary.selectedStreaksSum / summary.played, 2) : 0,
        stake: summary.stake,
        payout: summary.payout,
        profit: summary.profit,
        roi: summary.stake > 0 ? round(summary.profit / summary.stake * 100, 2) : 0
    };
}

function toCsv(rows, columns) {
    const escape = value => {
        const str = value === null || value === undefined ? '' : String(value);
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    return [
        columns.join(','),
        ...rows.map(row => columns.map(col => escape(row[col])).join(','))
    ].join('\n');
}

async function main() {
    await lotteryService.loadAll();
    const sortedData = getSortedLotteryData(lotteryService.getRawData());
    if (sortedData.length < WARMUP_DAYS + 2) {
        throw new Error('Không đủ dữ liệu để nghiên cứu.');
    }

    fs.mkdirSync(REPORT_DIR, { recursive: true });

    const methodSummaries = Object.fromEntries(STRATEGIES.map(strategy => [strategy.id, createSummary()]));
    const candidateAgg = new Map();
    const priority85Agg = new Map();
    const methodHarmAgg = new Map();
    const groupAgg = new Map();
    const yearly = {};

    const startIndex = Math.max(1, WARMUP_DAYS);
    const totalDays = sortedData.length - startIndex;
    const progressEvery = Math.max(250, Math.round(totalDays / 20));

    for (let actualIndex = startIndex; actualIndex < sortedData.length; actualIndex++) {
        const actualDay = sortedData[actualIndex];
        const actualNumber = normalizeNumber(actualDay.special);
        if (actualNumber === null) continue;

        const predictionDate = formatRawDate(actualDay.date);
        const predictionIsoDate = formatIsoDate(actualDay.date);
        const year = predictionIsoDate.slice(0, 4);
        const totalYears = getHistoryYearsAtIndex(sortedData, actualIndex - 1);
        const quickStats = historicalExclusionService.computeQuickStatsForDateFast(predictionDate, totalYears);
        const result = exclusionLogic.getDropOffExclusions(quickStats, {
            minPriority: 0,
            includePotential: true,
            includeHighFrequency: true,
            maxPotentialFormationPerYear: 1
        });
        const candidates = sortCandidates((result.explanations || [])
            .map(enrichCandidate)
            .filter(item => item.numbers.length > 0));

        candidates.forEach(item => {
            addCandidateAgg(candidateAgg, item.key, item, actualNumber);
            addGroupAgg(groupAgg, `${item.axis}|${item.patternType}|${item.isPotential ? 'potential' : 'formed'}`, item, actualNumber);
            if (item.exclusionPriority >= 85) addCandidateAgg(priority85Agg, item.key, item, actualNumber);
        });

        if (!yearly[year]) {
            yearly[year] = Object.fromEntries(STRATEGIES.map(strategy => [strategy.id, createSummary()]));
        }

        for (const strategy of STRATEGIES) {
            const selected = strategy.select(candidates);
            const dayResult = addMethodDay(methodSummaries[strategy.id], selected, actualNumber);
            addMethodDay(yearly[year][strategy.id], selected, actualNumber);
            if (!dayResult.skipped && dayResult.miss) {
                for (const item of selected) {
                    if (item.numbers.includes(actualNumber)) {
                        const harmKey = `${strategy.id}|${item.key}`;
                        addCandidateAgg(methodHarmAgg, harmKey, item, actualNumber);
                    }
                }
            }
        }

        if ((actualIndex - startIndex + 1) % progressEvery === 0) {
            console.log(`[research] ${actualIndex - startIndex + 1}/${totalDays} days`);
        }
    }

    const methodRows = STRATEGIES
        .map(strategy => finalizeMethodSummary(strategy.id, strategy.name, methodSummaries[strategy.id]))
        .sort((a, b) => b.profit - a.profit);

    const highErrorCandidates = [...priority85Agg.values()]
        .map(finalizeCandidateAgg)
        .filter(row => row.days >= 20)
        .sort((a, b) => b.badness - a.badness || b.errors - a.errors)
        .slice(0, 100);

    const bestCandidates = [...priority85Agg.values()]
        .map(finalizeCandidateAgg)
        .filter(row => row.days >= 20)
        .sort((a, b) => a.badness - b.badness || a.errorRate - b.errorRate)
        .slice(0, 100);

    const harmfulByMethod = [...methodHarmAgg.entries()]
        .map(([compoundKey, agg]) => {
            const [methodId] = compoundKey.split('|');
            return {
                methodId,
                ...finalizeCandidateAgg(agg)
            };
        })
        .filter(row => row.days >= 5)
        .sort((a, b) => b.errors - a.errors || b.badness - a.badness)
        .slice(0, 150);

    const groupRows = [...groupAgg.values()]
        .map(agg => {
            const [axis, patternType, formation] = agg.key.split('|');
            const expectedErrorRate = agg.days > 0 ? agg.numbersCountSum / agg.days / 100 : 0;
            const errorRate = agg.days > 0 ? agg.errors / agg.days : 0;
            return {
                axis,
                patternType,
                formation,
                days: agg.days,
                errors: agg.errors,
                errorRate: round(errorRate * 100, 2),
                expectedErrorRate: round(expectedErrorRate * 100, 2),
                errorLift: round((errorRate - expectedErrorRate) * 100, 2),
                avgNumbers: round(agg.numbersCountSum / Math.max(1, agg.days), 2),
                avgPriority: round(agg.prioritySum / Math.max(1, agg.days), 2),
                avgPredictedEdge: round(agg.predictedEdgeSum / Math.max(1, agg.days) * 100, 2)
            };
        })
        .filter(row => row.days >= 50)
        .sort((a, b) => b.errorLift - a.errorLift || b.errors - a.errors);

    const yearlyRows = [];
    for (const year of Object.keys(yearly).sort()) {
        for (const strategy of STRATEGIES) {
            yearlyRows.push({
                year,
                ...finalizeMethodSummary(strategy.id, strategy.name, yearly[year][strategy.id])
            });
        }
    }

    const report = {
        generatedAt: new Date().toISOString(),
        data: {
            records: sortedData.length,
            firstDate: formatRawDate(sortedData[0].date),
            lastDate: formatRawDate(sortedData[sortedData.length - 1].date),
            warmupDays: WARMUP_DAYS,
            evaluatedDays: totalDays
        },
        assumptions: {
            errorDefinition: 'Sai số loại trừ = số thực tế nằm trong tập bị loại.',
            expectedErrorRate: 'Baseline theo coverage = số lượng số bị loại / 100.',
            moneyUnit: 'K VND',
            betPerNumber: BET_PER_NUMBER,
            winMultiplier: WIN_MULTIPLIER,
            minExcludedToPlay: MIN_EXCLUDED_TO_PLAY
        },
        methodRows,
        highErrorCandidates,
        bestCandidates,
        harmfulByMethod,
        groupRows,
        yearlyRows
    };

    const jsonPath = path.join(REPORT_DIR, `exclusion-error-research-${REPORT_DATE}.json`);
    const methodCsvPath = path.join(REPORT_DIR, `exclusion-error-methods-${REPORT_DATE}.csv`);
    const highErrorCsvPath = path.join(REPORT_DIR, `exclusion-error-high-candidates-${REPORT_DATE}.csv`);
    const groupCsvPath = path.join(REPORT_DIR, `exclusion-error-groups-${REPORT_DATE}.csv`);
    const yearlyCsvPath = path.join(REPORT_DIR, `exclusion-error-yearly-${REPORT_DATE}.csv`);

    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(methodCsvPath, toCsv(methodRows, [
        'id', 'name', 'days', 'played', 'skipped', 'hits', 'misses', 'hitRate', 'missRate',
        'expectedMissRateByCoverage', 'missLiftVsCoverage', 'avgExcluded', 'avgBet',
        'avgSelectedStreaks', 'stake', 'payout', 'profit', 'roi'
    ]));
    fs.writeFileSync(highErrorCsvPath, toCsv(highErrorCandidates, [
        'key', 'title', 'axis', 'patternType', 'days', 'errors', 'errorRate',
        'expectedErrorRate', 'errorLift', 'realisedBreakRate', 'avgNumbers',
        'avgPriority', 'avgDropOff', 'avgLower', 'avgSample', 'avgPredictedEdge',
        'potentialShare', 'recordCriticalShare', 'fixed3Share', 'badness'
    ]));
    fs.writeFileSync(groupCsvPath, toCsv(groupRows, [
        'axis', 'patternType', 'formation', 'days', 'errors', 'errorRate',
        'expectedErrorRate', 'errorLift', 'avgNumbers', 'avgPriority', 'avgPredictedEdge'
    ]));
    fs.writeFileSync(yearlyCsvPath, toCsv(yearlyRows, [
        'year', 'id', 'name', 'played', 'skipped', 'hits', 'misses', 'hitRate',
        'missRate', 'avgExcluded', 'avgBet', 'profit', 'roi'
    ]));

    console.log(JSON.stringify({
        jsonPath,
        methodCsvPath,
        highErrorCsvPath,
        groupCsvPath,
        yearlyCsvPath,
        topMethods: methodRows.slice(0, 5),
        worstGroups: groupRows.slice(0, 10),
        highErrorCandidates: highErrorCandidates.slice(0, 10)
    }, null, 2));
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
