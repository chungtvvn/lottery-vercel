#!/usr/bin/env node

/**
 * Backtest exclusion methods calibrated by historical false-exclusion error.
 *
 * Goal: keep roughly 20-30 bet numbers/day by excluding 70-80 numbers.
 * Calibration is rolling: for each prediction date, scoring uses only outcomes
 * observed before that date.
 */

const fs = require('fs');
const path = require('path');

const lotteryService = require('../lib/services/lotteryService');
const historicalExclusionService = require('../lib/services/historicalExclusionService');
const exclusionLogic = require('../lib/services/exclusionLogicService');

const BET_PER_NUMBER = 10;
const WIN_MULTIPLIER = 70;
const WARMUP_DAYS = Number(process.env.WARMUP_DAYS || 365);
const MIN_EXCLUDED_TO_PLAY = 30;
const REPORT_DATE = new Date().toISOString().slice(0, 10);
const REPORT_DIR = path.join(process.cwd(), 'reports');
const ALL_NUMBERS = Array.from({ length: 100 }, (_, i) => i);
const TARGETS = [70, 75, 80];

const PATTERN_SUFFIXES = [
    'LuiDeuLienTiep', 'TienDeuLienTiep',
    'LuiLienTiep', 'TienLienTiep',
    'LuiDeu', 'TienDeu',
    'VeLienTiep', 'VeCungGiaTri', 'VeSole', 'VeSoleMoi',
    'DongTien', 'DongLui',
    'TienLuiSoLe', 'LuiTienSoLe', 'SoLeTheoCap',
    'Lui', 'Tien'
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

function round(value, digits = 2) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    const base = 10 ** digits;
    return Math.round(number * base) / base;
}

function clamp(value, min = 0, max = 1) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
}

function wilsonUpperBound(successes, total, z = 1.64) {
    if (!total || total <= 0) return 1;
    const phat = successes / total;
    const z2 = z * z;
    const denominator = 1 + z2 / total;
    const centre = phat + z2 / (2 * total);
    const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total);
    return Math.min(1, (centre + margin) / denominator);
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

function createCalibrationStats() {
    return {
        days: 0,
        errors: 0,
        numbersSum: 0,
        lastErrorAt: -1
    };
}

function addCalibration(map, key, item, actualNumber, dayIndex) {
    if (!map.has(key)) map.set(key, createCalibrationStats());
    const stat = map.get(key);
    stat.days += 1;
    stat.numbersSum += item.numbersCount;
    if (item.numbers.includes(actualNumber)) {
        stat.errors += 1;
        stat.lastErrorAt = dayIndex;
    }
}

function getCalibration(map, key) {
    return map.get(key) || null;
}

function blendErrorEstimate(item, keyStat, groupStat) {
    const coverage = item.numbersCount / 100;
    const groupDays = groupStat ? groupStat.days : 0;
    const keyDays = keyStat ? keyStat.days : 0;

    const priorStrength = 80;
    const groupStrength = Math.min(groupDays, 180);
    const keyStrength = Math.min(keyDays, 120);

    const priorErrors = coverage * priorStrength;
    const groupErrors = groupStat ? groupStat.errors * (groupStrength / Math.max(1, groupDays)) : 0;
    const keyErrors = keyStat ? keyStat.errors * (keyStrength / Math.max(1, keyDays)) : 0;
    const totalWeight = priorStrength + groupStrength + keyStrength;
    const mean = (priorErrors + groupErrors + keyErrors) / Math.max(1, totalWeight);

    const keyUpper = keyDays >= 20 ? wilsonUpperBound(keyStat.errors, keyStat.days) : null;
    const groupUpper = groupDays >= 50 ? wilsonUpperBound(groupStat.errors, groupStat.days) : null;
    const conservativeUpper = Math.max(
        mean,
        keyUpper === null ? 0 : keyUpper,
        groupUpper === null ? 0 : groupUpper
    );

    return {
        meanErrorRate: clamp(mean),
        conservativeErrorRate: clamp(conservativeUpper),
        keyDays,
        groupDays,
        coverage
    };
}

function enrichCandidate(item, calibration, dayIndex) {
    const numbers = normalizeNumberList(item.numbers);
    const numbersCount = numbers.length;
    const exclusionRate = Number(item.exclusionRate ?? item.dropOffRate ?? 0);
    const lowerBound = Number(item.exclusionLowerBound ?? 0);
    const sampleSize = Number(item.exclusionSampleSize ?? item.currentCount ?? 0);
    const patternType = getPatternType(item);
    const axis = getAxis(item);
    const formation = item.isPotential ? 'potential' : 'formed';
    const isFixed3 = isFixedThreeValueGroup(item);
    const groupKey = `${axis}|${patternType}|${formation}|${isFixed3 ? 'fixed3' : 'normal'}`;
    const keyStat = getCalibration(calibration.byKey, item.key);
    const groupStat = getCalibration(calibration.byGroup, groupKey);
    const error = blendErrorEstimate({ numbersCount }, keyStat, groupStat);
    const baselineBreakRate = 1 - numbersCount / 100;
    const predictedEdge = exclusionRate - baselineBreakRate;
    const safeErrorEdge = (numbersCount / 100) - error.conservativeErrorRate;
    const meanSafeEdge = (numbersCount / 100) - error.meanErrorRate;
    const groupBadPenalty = groupStat && groupStat.days >= 200
        ? Math.max(0, (groupStat.errors / groupStat.days) - (groupStat.numbersSum / groupStat.days / 100))
        : 0;
    const lastErrorGap = keyStat && keyStat.lastErrorAt >= 0 ? dayIndex - keyStat.lastErrorAt : null;
    const recentErrorPenalty = lastErrorGap !== null && lastErrorGap <= 30 ? (30 - lastErrorGap) / 30 : 0;

    const score =
        clamp((Number(item.exclusionPriority || 0)) / 100) * 0.22 +
        clamp(predictedEdge + 0.2, 0, 0.4) / 0.4 * 0.18 +
        clamp(meanSafeEdge + 0.2, 0, 0.4) / 0.4 * 0.22 +
        clamp(safeErrorEdge + 0.2, 0, 0.4) / 0.4 * 0.18 +
        clamp(lowerBound) * 0.10 +
        clamp(Math.log10(sampleSize + 1) / Math.log10(500)) * 0.07 +
        (item.isRecordDropOffCritical ? 0.03 : 0) -
        groupBadPenalty * 0.50 -
        recentErrorPenalty * 0.06 -
        (isFixed3 ? 0.05 : 0) -
        (patternType === 'so_le_theo_cap' && !item.isPotential ? 0.25 : 0);

    return {
        ...item,
        numbers,
        numbersCount,
        exclusionRate,
        dropOffRate: Number(item.dropOffRate ?? exclusionRate),
        lowerBound,
        sampleSize,
        patternType,
        axis,
        formation,
        groupKey,
        isFixedThreeValueGroup: isFixed3,
        baselineBreakRate,
        predictedEdge,
        safeErrorEdge,
        meanSafeEdge,
        calibratedErrorRate: error.meanErrorRate,
        conservativeErrorRate: error.conservativeErrorRate,
        keyCalibrationDays: error.keyDays,
        groupCalibrationDays: error.groupDays,
        groupBadPenalty,
        recentErrorPenalty,
        errorAdjustedScore: round(score, 6)
    };
}

function sortByErrorAdjustedScore(candidates) {
    return candidates.slice().sort((a, b) => {
        if ((b.errorAdjustedScore || 0) !== (a.errorAdjustedScore || 0)) return (b.errorAdjustedScore || 0) - (a.errorAdjustedScore || 0);
        if ((b.safeErrorEdge || 0) !== (a.safeErrorEdge || 0)) return (b.safeErrorEdge || 0) - (a.safeErrorEdge || 0);
        if ((b.exclusionPriority || 0) !== (a.exclusionPriority || 0)) return (b.exclusionPriority || 0) - (a.exclusionPriority || 0);
        return (b.predictedEdge || 0) - (a.predictedEdge || 0);
    });
}

function selectUnion(candidates, targetExcluded, options = {}) {
    const excluded = new Set();
    const selected = [];
    const minScore = Number.isFinite(Number(options.minScore)) ? Number(options.minScore) : 0;
    const allowOverflow = !!options.allowOverflow;

    for (const item of sortByErrorAdjustedScore(candidates)) {
        if (item.errorAdjustedScore < minScore) continue;
        if (options.requirePositiveSafeEdge && item.safeErrorEdge <= 0) continue;
        if (options.requirePositivePredictedEdge && item.predictedEdge <= 0) continue;
        if (options.excludeFixed3 && item.isFixedThreeValueGroup) continue;
        if (options.excludeBadPair && item.patternType === 'so_le_theo_cap' && !item.isPotential) continue;

        const fresh = item.numbers.filter(num => !excluded.has(num));
        if (fresh.length === 0) continue;
        if (!allowOverflow && excluded.size + fresh.length > targetExcluded) continue;
        fresh.forEach(num => excluded.add(num));
        selected.push({
            ...item,
            addedNumbersCount: fresh.length
        });
        if (excluded.size >= targetExcluded) break;
    }

    return {
        excluded: [...excluded].sort((a, b) => a - b),
        selectedStreaks: selected
    };
}

function selectNumberRisk(candidates, targetExcluded, options = {}) {
    const scores = new Map(ALL_NUMBERS.map(num => [num, {
        number: num,
        score: 0,
        support: 0,
        bestScore: 0
    }]));
    const selectedStreaks = [];

    for (const item of candidates) {
        if (options.requirePositiveSafeEdge && item.safeErrorEdge <= 0) continue;
        if (options.requirePositivePredictedEdge && item.predictedEdge <= 0) continue;
        if (options.excludeFixed3 && item.isFixedThreeValueGroup) continue;
        if (options.excludeBadPair && item.patternType === 'so_le_theo_cap' && !item.isPotential) continue;

        const baseWeight = Math.max(0, item.errorAdjustedScore)
            * (1 + Math.max(0, item.safeErrorEdge) * 2.2)
            * (1 + Math.max(0, item.predictedEdge) * 1.2);
        if (baseWeight <= 0) continue;

        const weight = baseWeight / Math.pow(Math.max(1, item.numbersCount), options.penalty || 0.8);
        if (weight <= 0) continue;
        selectedStreaks.push(item);
        item.numbers.forEach(num => {
            const entry = scores.get(num);
            entry.score += weight;
            entry.support += 1;
            entry.bestScore = Math.max(entry.bestScore, weight);
        });
    }

    const ranked = [...scores.values()].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
        return a.number - b.number;
    });

    return {
        excluded: ranked.slice(0, targetExcluded).map(item => item.number).sort((a, b) => a - b),
        selectedStreaks: selectedStreaks.slice(0, 80),
        numberScores: ranked.slice(0, 20)
    };
}

function createSummary() {
    return {
        days: 0,
        played: 0,
        skipped: 0,
        wins: 0,
        losses: 0,
        stake: 0,
        payout: 0,
        profit: 0,
        excludedSum: 0,
        betSum: 0,
        selectedStreaksSum: 0,
        best: null,
        worst: null
    };
}

function evaluateMethod(summary, method, actualNumber) {
    summary.days += 1;
    const excluded = normalizeNumberList(method.excluded);
    const excludedSet = new Set(excluded);
    const excludedCount = excluded.length;
    const betCount = 100 - excludedCount;
    const skipped = excludedCount < MIN_EXCLUDED_TO_PLAY || betCount <= 0;

    if (skipped) {
        summary.skipped += 1;
        return { skipped, profit: 0, hit: false, miss: false, excludedCount, betCount };
    }

    const miss = excludedSet.has(actualNumber);
    const hit = !miss;
    const stake = betCount * BET_PER_NUMBER;
    const payout = hit ? BET_PER_NUMBER * WIN_MULTIPLIER : 0;
    const profit = payout - stake;

    summary.played += 1;
    summary.excludedSum += excludedCount;
    summary.betSum += betCount;
    summary.selectedStreaksSum += method.selectedStreaks.length;
    summary.stake += stake;
    summary.payout += payout;
    summary.profit += profit;
    if (hit) summary.wins += 1;
    else summary.losses += 1;
    summary.best = summary.best === null ? profit : Math.max(summary.best, profit);
    summary.worst = summary.worst === null ? profit : Math.min(summary.worst, profit);

    return { skipped, profit, hit, miss, excludedCount, betCount };
}

function finalizeSummary(id, name, summary) {
    return {
        id,
        name,
        days: summary.days,
        played: summary.played,
        skipped: summary.skipped,
        wins: summary.wins,
        losses: summary.losses,
        hitRate: summary.played > 0 ? round(summary.wins / summary.played * 100, 2) : 0,
        avgExcluded: summary.played > 0 ? round(summary.excludedSum / summary.played, 2) : 0,
        avgBet: summary.played > 0 ? round(summary.betSum / summary.played, 2) : 0,
        avgSelectedStreaks: summary.played > 0 ? round(summary.selectedStreaksSum / summary.played, 2) : 0,
        stake: summary.stake,
        payout: summary.payout,
        profit: summary.profit,
        roi: summary.stake > 0 ? round(summary.profit / summary.stake * 100, 2) : 0,
        best: summary.best,
        worst: summary.worst
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

function buildMethods(candidates) {
    const methods = {};
    for (const target of TARGETS) {
        methods[`errUnion${target}`] = {
            name: `Union sai số tốt, loại ${target}`,
            ...selectUnion(candidates, target, {
                minScore: 0.48,
                requirePositiveSafeEdge: true,
                excludeBadPair: true
            })
        };
        methods[`errUnionStrict${target}`] = {
            name: `Union strict sai số, loại ${target}`,
            ...selectUnion(candidates, target, {
                minScore: 0.56,
                requirePositiveSafeEdge: true,
                requirePositivePredictedEdge: true,
                excludeBadPair: true,
                excludeFixed3: true
            })
        };
        methods[`errNumberRisk${target}`] = {
            name: `Điểm số theo sai số, loại ${target}`,
            ...selectNumberRisk(candidates, target, {
                requirePositiveSafeEdge: false,
                requirePositivePredictedEdge: false,
                excludeBadPair: true,
                penalty: 0.85
            })
        };
        methods[`errNumberRiskStrict${target}`] = {
            name: `Điểm số strict theo sai số, loại ${target}`,
            ...selectNumberRisk(candidates, target, {
                requirePositiveSafeEdge: true,
                requirePositivePredictedEdge: false,
                excludeBadPair: true,
                excludeFixed3: true,
                penalty: 0.85
            })
        };
    }
    return methods;
}

function updateCalibration(calibration, candidates, actualNumber, dayIndex) {
    for (const item of candidates) {
        addCalibration(calibration.byKey, item.key, item, actualNumber, dayIndex);
        addCalibration(calibration.byGroup, item.groupKey, item, actualNumber, dayIndex);
    }
}

async function main() {
    await lotteryService.loadAll();
    const sortedData = getSortedLotteryData(lotteryService.getRawData());
    if (sortedData.length < WARMUP_DAYS + 2) {
        throw new Error('Không đủ dữ liệu để chạy backtest.');
    }

    fs.mkdirSync(REPORT_DIR, { recursive: true });

    const calibration = {
        byKey: new Map(),
        byGroup: new Map()
    };
    const summaries = {};
    const yearly = {};
    const sampleDays = [];
    let methodNames = {};

    const startIndex = Math.max(1, WARMUP_DAYS);
    const totalDays = sortedData.length - 1;
    const progressEvery = Math.max(250, Math.round((sortedData.length - startIndex) / 20));

    for (let actualIndex = 1; actualIndex < sortedData.length; actualIndex++) {
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
        const candidates = (result.explanations || [])
            .map(item => enrichCandidate(item, calibration, actualIndex))
            .filter(item => item.numbers.length > 0);

        if (actualIndex >= startIndex) {
            const methods = buildMethods(candidates);
            methodNames = Object.fromEntries(Object.entries(methods).map(([id, method]) => [id, method.name]));
            if (!yearly[year]) yearly[year] = {};

            for (const [id, method] of Object.entries(methods)) {
                if (!summaries[id]) summaries[id] = createSummary();
                if (!yearly[year][id]) yearly[year][id] = createSummary();
                const evaluated = evaluateMethod(summaries[id], method, actualNumber);
                evaluateMethod(yearly[year][id], method, actualNumber);

                if (sampleDays.length < 20 && id === 'errNumberRisk75') {
                    sampleDays.push({
                        predictionDate,
                        actualNumber,
                        hit: evaluated.hit,
                        excludedCount: evaluated.excludedCount,
                        betCount: evaluated.betCount,
                        betNumbers: ALL_NUMBERS.filter(num => !new Set(method.excluded).has(num)),
                        topStreaks: method.selectedStreaks.slice(0, 8).map(item => ({
                            key: item.key,
                            title: item.title,
                            score: item.errorAdjustedScore,
                            safeErrorEdge: round(item.safeErrorEdge * 100, 2),
                            calibratedErrorRate: round(item.calibratedErrorRate * 100, 2),
                            numbersCount: item.numbersCount
                        }))
                    });
                }
            }

            if ((actualIndex - startIndex + 1) % progressEvery === 0) {
                console.log(`[error-calibrated] ${actualIndex - startIndex + 1}/${sortedData.length - startIndex} days`);
            }
        }

        updateCalibration(calibration, candidates, actualNumber, actualIndex);
    }

    const methodRows = Object.keys(summaries)
        .map(id => finalizeSummary(id, methodNames[id] || id, summaries[id]))
        .sort((a, b) => b.profit - a.profit || b.roi - a.roi);

    const yearlyRows = [];
    for (const year of Object.keys(yearly).sort()) {
        for (const id of Object.keys(yearly[year]).sort()) {
            yearlyRows.push({
                year,
                ...finalizeSummary(id, methodNames[id] || id, yearly[year][id])
            });
        }
    }

    const byGroupRows = [...calibration.byGroup.entries()]
        .map(([key, stat]) => {
            const [axis, patternType, formation, fixed] = key.split('|');
            const expectedErrorRate = stat.days > 0 ? stat.numbersSum / stat.days / 100 : 0;
            const errorRate = stat.days > 0 ? stat.errors / stat.days : 0;
            return {
                axis,
                patternType,
                formation,
                fixed,
                days: stat.days,
                errors: stat.errors,
                errorRate: round(errorRate * 100, 2),
                expectedErrorRate: round(expectedErrorRate * 100, 2),
                errorLift: round((errorRate - expectedErrorRate) * 100, 2)
            };
        })
        .filter(row => row.days >= 100)
        .sort((a, b) => b.errorLift - a.errorLift);

    const report = {
        generatedAt: new Date().toISOString(),
        data: {
            records: sortedData.length,
            firstDate: formatRawDate(sortedData[0].date),
            lastDate: formatRawDate(sortedData[sortedData.length - 1].date),
            warmupDays: WARMUP_DAYS,
            evaluatedDays: sortedData.length - startIndex
        },
        assumptions: {
            calibration: 'Rolling only, each date uses false-exclusion outcomes before that date.',
            target: 'Exclude 70/75/80 numbers so bet list is around 30/25/20 numbers.',
            moneyUnit: 'K VND',
            betPerNumber: BET_PER_NUMBER,
            winMultiplier: WIN_MULTIPLIER
        },
        methodRows,
        yearlyRows,
        highErrorGroupsAfterCalibration: byGroupRows.slice(0, 50),
        sampleDays
    };

    const jsonPath = path.join(REPORT_DIR, `error-calibrated-backtest-${REPORT_DATE}.json`);
    const methodsCsvPath = path.join(REPORT_DIR, `error-calibrated-methods-${REPORT_DATE}.csv`);
    const yearlyCsvPath = path.join(REPORT_DIR, `error-calibrated-yearly-${REPORT_DATE}.csv`);
    const groupsCsvPath = path.join(REPORT_DIR, `error-calibrated-groups-${REPORT_DATE}.csv`);

    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(methodsCsvPath, toCsv(methodRows, [
        'id', 'name', 'days', 'played', 'skipped', 'wins', 'losses', 'hitRate',
        'avgExcluded', 'avgBet', 'avgSelectedStreaks', 'stake', 'payout', 'profit',
        'roi', 'best', 'worst'
    ]));
    fs.writeFileSync(yearlyCsvPath, toCsv(yearlyRows, [
        'year', 'id', 'name', 'played', 'skipped', 'wins', 'losses', 'hitRate',
        'avgExcluded', 'avgBet', 'profit', 'roi'
    ]));
    fs.writeFileSync(groupsCsvPath, toCsv(byGroupRows, [
        'axis', 'patternType', 'formation', 'fixed', 'days', 'errors',
        'errorRate', 'expectedErrorRate', 'errorLift'
    ]));

    console.log(JSON.stringify({
        jsonPath,
        methodsCsvPath,
        yearlyCsvPath,
        groupsCsvPath,
        topMethods: methodRows.slice(0, 12),
        highErrorGroupsAfterCalibration: byGroupRows.slice(0, 10)
    }, null, 2));
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
