const DEFAULT_PRIZE_KEYS = [
    'special', 'prize1', 'prize2_1', 'prize2_2',
    'prize3_1', 'prize3_2', 'prize3_3', 'prize3_4', 'prize3_5', 'prize3_6',
    'prize4_1', 'prize4_2', 'prize4_3', 'prize4_4',
    'prize5_1', 'prize5_2', 'prize5_3', 'prize5_4', 'prize5_5', 'prize5_6',
    'prize6_1', 'prize6_2', 'prize6_3',
    'prize7_1', 'prize7_2', 'prize7_3', 'prize7_4'
];

const MODE_BINS = {
    de: [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180, 365, Infinity],
    loto: [1, 2, 3, 4, 5, 7, 10, 14, 21, Infinity]
};

function quantile(values, probability) {
    if (!values.length) return null;
    const sorted = values.slice().sort((left, right) => left - right);
    return sorted[Math.floor((sorted.length - 1) * probability)];
}

function mean(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function daysBetween(left, right) {
    return Math.round((new Date(`${right}T00:00:00Z`) - new Date(`${left}T00:00:00Z`)) / 86400000) + 1;
}

function extractDrawNumbers(row, mode = 'loto', prizeKeys = DEFAULT_PRIZE_KEYS) {
    if (mode === 'de') return [Number(row.special)];
    return [...new Set(prizeKeys.map(key => Number(row[key])).filter(Number.isFinite))];
}

function summarizeCoverage(rawData, mode = 'loto', options = {}) {
    const universeSize = Number(options.universeSize || 100);
    const prizeKeys = options.prizeKeys || DEFAULT_PRIZE_KEYS;
    const completedCycles = [];
    const rolling = [];
    const currentSeen = new Set();
    const lastSeen = Array(universeSize).fill(-1);
    let cycleStart = 0;
    for (let index = 0; index < rawData.length; index++) {
        const numbers = extractDrawNumbers(rawData[index], mode, prizeKeys).filter(number => number < universeSize);
        for (const number of numbers) {
            currentSeen.add(number);
            lastSeen[number] = index;
        }
        if (currentSeen.size === universeSize) {
            completedCycles.push({
                startDate: rawData[cycleStart].date,
                endDate: rawData[index].date,
                drawDays: index - cycleStart + 1,
                calendarDays: daysBetween(rawData[cycleStart].date, rawData[index].date)
            });
            currentSeen.clear();
            cycleStart = index + 1;
        }
        if (lastSeen.every(value => value >= 0)) {
            const earliest = Math.min(...lastSeen);
            rolling.push({
                date: rawData[index].date,
                drawDays: index - earliest + 1,
                calendarDays: daysBetween(rawData[earliest].date, rawData[index].date)
            });
        }
    }
    const drawLengths = completedCycles.map(cycle => cycle.drawDays);
    const calendarLengths = completedCycles.map(cycle => cycle.calendarDays);
    const startDate = cycleStart < rawData.length ? rawData[cycleStart].date : null;
    return {
        mode,
        universeSize,
        completedCycleCount: completedCycles.length,
        completedCycles,
        rolling,
        cycleDistribution: {
            drawDays: {
                mean: mean(drawLengths),
                median: quantile(drawLengths, 0.5),
                p10: quantile(drawLengths, 0.1),
                p90: quantile(drawLengths, 0.9),
                min: drawLengths.length ? Math.min(...drawLengths) : null,
                max: drawLengths.length ? Math.max(...drawLengths) : null
            },
            calendarDays: {
                mean: mean(calendarLengths),
                median: quantile(calendarLengths, 0.5),
                p90: quantile(calendarLengths, 0.9),
                min: calendarLengths.length ? Math.min(...calendarLengths) : null,
                max: calendarLengths.length ? Math.max(...calendarLengths) : null
            }
        },
        currentCycle: {
            startDate,
            endDate: rawData.at(-1)?.date || null,
            drawDays: startDate ? rawData.length - cycleStart : 0,
            seenCount: currentSeen.size,
            missingNumbers: Array.from({ length: universeSize }, (_, number) => number)
                .filter(number => !currentSeen.has(number))
        }
    };
}

function bucketIndex(age, bins) {
    return bins.findIndex(upper => age <= upper);
}

function lowerBound(values, target) {
    let left = 0;
    let right = values.length;
    while (left < right) {
        const middle = Math.floor((left + right) / 2);
        if (values[middle] < target) left = middle + 1;
        else right = middle;
    }
    return left;
}

function countSince(indexes, minimumIndex) {
    return indexes.length - lowerBound(indexes, minimumIndex);
}

function empiricalPercentile(values, target) {
    if (!values.length) return 0.5;
    let count = 0;
    for (const value of values) count += Number(value <= target);
    return (count + 0.5) / (values.length + 1);
}

function buildPointInTimeCoverageRows(rawData, mode = 'de', options = {}) {
    const universeSize = Number(options.universeSize || 100);
    const prizeKeys = options.prizeKeys || DEFAULT_PRIZE_KEYS;
    const bins = options.bins || MODE_BINS[mode] || MODE_BINS.de;
    const baseRate = mode === 'de' ? 1 / universeSize : 1 - ((universeSize - 1) / universeSize) ** prizeKeys.length;
    const lastSeen = Array(universeSize).fill(-1);
    const occurrenceIndexes = Array.from({ length: universeSize }, () => []);
    const gapSamples = Array.from({ length: universeSize }, () => []);
    const gapSums = Array(universeSize).fill(0);
    const exposures = Array.from({ length: universeSize }, () => Array(bins.length).fill(0));
    const events = Array.from({ length: universeSize }, () => Array(bins.length).fill(0));
    const globalExposures = Array(bins.length).fill(0);
    const globalEvents = Array(bins.length).fill(0);
    const cycleSeen = new Set();
    const completedCycleLengths = [];
    let cycleStart = 0;
    const rows = [];

    for (let index = 0; index < rawData.length; index++) {
        const averageCycleLength = mean(completedCycleLengths) || (mode === 'de' ? universeSize * 5 : 20);
        const currentCycleAge = index - cycleStart;
        const samples = Array.from({ length: universeSize }, (_, number) => {
            const appearances = occurrenceIndexes[number];
            const currentGap = lastSeen[number] >= 0 ? index - lastSeen[number] : index + 1;
            const bucket = bucketIndex(currentGap, bins);
            const globalHazard = (globalEvents[bucket] + baseRate * 100) / (globalExposures[bucket] + 100);
            const hazard = (events[number][bucket] + globalHazard * 20) / (exposures[number][bucket] + 20);
            const lifetimeRate = (appearances.length + baseRate * 100) / (Math.max(0, index) + 100);
            const averageGap = gapSamples[number].length ? gapSums[number] / gapSamples[number].length : 1 / baseRate;
            return {
                number,
                currentGap,
                averageGap,
                gapRatio: currentGap / Math.max(1, averageGap),
                gapPercentile: empiricalPercentile(gapSamples[number], currentGap),
                hazard,
                hazardRatio: hazard / Math.max(1e-9, baseRate),
                lifetimeRate,
                lifetimeRateRatio: lifetimeRate / Math.max(1e-9, baseRate),
                rate7: (countSince(appearances, index - 7) + baseRate * 10) / (Math.min(7, index) + 10),
                rate30: (countSince(appearances, index - 30) + baseRate * 20) / (Math.min(30, index) + 20),
                rate90: (countSince(appearances, index - 90) + baseRate * 30) / (Math.min(90, index) + 30),
                rate365: (countSince(appearances, index - 365) + baseRate * 50) / (Math.min(365, index) + 50),
                missingInCycle: !cycleSeen.has(number),
                cycleAge: currentCycleAge,
                cycleProgress: currentCycleAge / Math.max(1, averageCycleLength),
                cycleSeenCount: cycleSeen.size,
                historyDays: index,
                appearanceCount: appearances.length,
                gapSample: gapSamples[number].length,
                hazardExposure: exposures[number][bucket]
            };
        });
        rows.push({
            date: rawData[index].date,
            actualNumbers: extractDrawNumbers(rawData[index], mode, prizeKeys).filter(number => number < universeSize),
            actualOccurrences: mode === 'de'
                ? [Number(rawData[index].special)]
                : prizeKeys.map(key => Number(rawData[index][key])).filter(number => Number.isFinite(number) && number < universeSize),
            samples,
            coverageState: {
                cycleStartDate: rawData[cycleStart]?.date || rawData[index].date,
                cycleAge: currentCycleAge,
                cycleSeenCount: cycleSeen.size,
                cycleMissingCount: universeSize - cycleSeen.size,
                averageCompletedCycleLength: averageCycleLength,
                completedCycles: completedCycleLengths.length
            }
        });

        const actualNumbers = new Set(rows.at(-1).actualNumbers);
        for (const number of actualNumbers) {
            if (lastSeen[number] >= 0) {
                const gap = index - lastSeen[number];
                gapSamples[number].push(gap);
                gapSums[number] += gap;
                for (let age = 1; age <= gap; age++) {
                    const bucket = bucketIndex(age, bins);
                    exposures[number][bucket]++;
                    globalExposures[bucket]++;
                    if (age === gap) {
                        events[number][bucket]++;
                        globalEvents[bucket]++;
                    }
                }
            }
            lastSeen[number] = index;
            occurrenceIndexes[number].push(index);
            cycleSeen.add(number);
        }
        if (cycleSeen.size === universeSize) {
            completedCycleLengths.push(index - cycleStart + 1);
            cycleSeen.clear();
            cycleStart = index + 1;
        }
    }
    return rows;
}

module.exports = {
    DEFAULT_PRIZE_KEYS,
    MODE_BINS,
    buildPointInTimeCoverageRows,
    bucketIndex,
    extractDrawNumbers,
    summarizeCoverage
};
