'use strict';

const DEFAULT_VARIANTS = [
    'crossUnionFlat',
    'crossIntersectionFlat',
    'crossExclusiveFlat'
];

function wilsonLower(successes, trials, z = 1.28) {
    if (!Number.isFinite(trials) || trials <= 0) return 0;
    const p = successes / trials;
    const zSquared = z * z;
    const denominator = 1 + zSquared / trials;
    const center = p + zSquared / (2 * trials);
    const spread = z * Math.sqrt((p * (1 - p) + zSquared / (4 * trials)) / trials);
    return Math.max(0, (center - spread) / denominator);
}

function bucketStart(unitCount, bucketWidth) {
    return Math.floor(Number(unitCount) / bucketWidth) * bucketWidth;
}

function calibrationKey(variantId, unitCount, bucketWidth) {
    return `${variantId}|${bucketStart(unitCount, bucketWidth)}`;
}

function assertFlatVariant(row, variantId) {
    if (Number(row.unitCount) !== Number(row.uniqueCount)) {
        throw new Error(`${variantId} is weighted; Wilson hit-rate gate requires flat stakes.`);
    }
}

function buildCalibration(reports, options = {}) {
    const variantIds = options.variantIds || DEFAULT_VARIANTS;
    const bucketWidth = Number(options.bucketWidth || 10);
    const calibration = new Map();

    for (const report of reports) {
        for (const variantId of variantIds) {
            const rows = report?.variants?.[variantId]?.rows || [];
            for (const row of rows) {
                assertFlatVariant(row, variantId);
                const key = calibrationKey(variantId, row.unitCount, bucketWidth);
                const entry = calibration.get(key) || {
                    variantId,
                    bucketStart: bucketStart(row.unitCount, bucketWidth),
                    trials: 0,
                    successes: 0,
                    totalUnits: 0
                };
                entry.trials += 1;
                entry.successes += row.hit ? 1 : 0;
                entry.totalUnits += Number(row.unitCount);
                calibration.set(key, entry);
            }
        }
    }
    return calibration;
}

function selectForDate(report, rowIndex, calibration, options = {}) {
    const variantIds = options.variantIds || DEFAULT_VARIANTS;
    const bucketWidth = Number(options.bucketWidth || 10);
    const minSamples = Number(options.minSamples || 8);
    const payoutMultiplier = Number(options.payoutMultiplier || 84);
    const z = Number(options.z ?? 1.28);
    const candidates = [];

    for (const variantId of variantIds) {
        const row = report?.variants?.[variantId]?.rows?.[rowIndex];
        if (!row) continue;
        assertFlatVariant(row, variantId);
        const entry = calibration.get(calibrationKey(variantId, row.unitCount, bucketWidth));
        if (!entry || entry.trials < minSamples) continue;
        const lowerProbability = wilsonLower(entry.successes, entry.trials, z);
        const breakEvenProbability = Number(row.unitCount) / payoutMultiplier;
        candidates.push({
            variantId,
            row,
            trials: entry.trials,
            successes: entry.successes,
            observedProbability: entry.successes / entry.trials,
            lowerProbability,
            breakEvenProbability,
            margin: lowerProbability - breakEvenProbability
        });
    }

    candidates.sort((a, b) => b.margin - a.margin
        || b.trials - a.trials
        || a.row.unitCount - b.row.unitCount
        || a.variantId.localeCompare(b.variantId));
    return {
        selected: candidates[0]?.margin > 0 ? candidates[0] : null,
        candidates
    };
}

function summarize(rows) {
    let longestLoss = 0;
    let currentLoss = 0;
    let longestWin = 0;
    let currentWin = 0;
    for (const row of rows) {
        if (row.hit) {
            currentWin += 1;
            currentLoss = 0;
            longestWin = Math.max(longestWin, currentWin);
        } else {
            currentLoss += 1;
            currentWin = 0;
            longestLoss = Math.max(longestLoss, currentLoss);
        }
    }
    const stakeK = rows.reduce((sum, row) => sum + row.stakeK, 0);
    const payoutK = rows.reduce((sum, row) => sum + row.payoutK, 0);
    const hitDays = rows.filter(row => row.hit).length;
    return {
        availableDays: rows.availableDays || null,
        playedDays: rows.length,
        skippedDays: Number(rows.availableDays || rows.length) - rows.length,
        hitDays,
        hitRate: rows.length ? hitDays / rows.length : 0,
        averageUnitCount: rows.length
            ? rows.reduce((sum, row) => sum + row.unitCount, 0) / rows.length
            : 0,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        roi: stakeK ? (payoutK - stakeK) / stakeK : 0,
        longestWin,
        longestLoss
    };
}

function evaluateReport(report, calibration, options = {}) {
    const anchorVariant = (options.variantIds || DEFAULT_VARIANTS)[0];
    const availableDays = report?.variants?.[anchorVariant]?.rows?.length || 0;
    const playedRows = [];
    for (let index = 0; index < availableDays; index += 1) {
        const decision = selectForDate(report, index, calibration, options);
        if (!decision.selected) continue;
        const selected = decision.selected;
        playedRows.push({
            date: selected.row.date,
            actual: selected.row.actual,
            variantId: selected.variantId,
            numbers: selected.row.numbers,
            unitCount: selected.row.unitCount,
            hit: selected.row.hit,
            stakeK: selected.row.stakeK,
            payoutK: selected.row.payoutK,
            profitK: selected.row.profitK,
            trials: selected.trials,
            successes: selected.successes,
            observedProbability: selected.observedProbability,
            lowerProbability: selected.lowerProbability,
            breakEvenProbability: selected.breakEvenProbability,
            margin: selected.margin
        });
    }
    playedRows.availableDays = availableDays;
    return { summary: summarize(playedRows), rows: playedRows };
}

module.exports = {
    DEFAULT_VARIANTS,
    wilsonLower,
    bucketStart,
    buildCalibration,
    selectForDate,
    evaluateReport,
    summarize
};
