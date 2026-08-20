#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
    collectMethodStats,
    rankNumbers
} = require('../lib/research/twoStageHitMissFusion');

const STAKE_K = 1000;
const PAYOUT = 84;

function parseArgs(argv) {
    const result = {};
    for (const token of argv.slice(2)) {
        if (!token.startsWith('--')) continue;
        const [key, ...rest] = token.slice(2).split('=');
        result[key] = rest.join('=');
    }
    return result;
}

function loadJson(filename) {
    return JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'));
}

function loadYearRows(sourceByYear, years) {
    return years.flatMap(year => {
        const source = sourceByYear.get(year);
        if (!source) throw new Error(`Khong co strict PIT report nam ${year}`);
        const payload = loadJson(source);
        return payload.rows.map(row => ({ ...row, sourceYear: year }));
    }).sort((a, b) => a.date.localeCompare(b.date));
}

function mergeRows(rows, extensionFile) {
    if (!extensionFile) return rows;
    const extension = loadJson(extensionFile).rows || [];
    const byDate = new Map(rows.map(row => [row.date, row]));
    for (const row of extension) byDate.set(row.date, row);
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function fixedCardinalityMethods(rows) {
    const first = rows[0];
    return Object.keys(first.strategies).filter(id => {
        const lengths = new Set(rows.map(row => row.strategies?.[id]?.length));
        return lengths.size === 1 && lengths.has(30);
    }).sort();
}

function longest(values, expected) {
    let current = 0;
    let result = 0;
    for (const value of values) {
        current = value === expected ? current + 1 : 0;
        result = Math.max(result, current);
    }
    return result;
}

function summarizeRows(details, betCount) {
    const wins = details.filter(row => row.win).length;
    const stakeK = details.length * betCount * STAKE_K;
    const profitK = wins * PAYOUT * STAKE_K - stakeK;
    return {
        days: details.length,
        betCount,
        wins,
        hitRate: details.length ? wins / details.length : 0,
        stakeK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestWin: longest(details.map(row => row.win), true),
        longestLoss: longest(details.map(row => row.win), false)
    };
}

function evaluate(rows, methodStats, config, includeRows = false) {
    const details = rows.map(row => {
        const prediction = rankNumbers(row, methodStats, config);
        return {
            date: row.date,
            actual: Number(row.actual),
            win: prediction.betNumbers.includes(Number(row.actual)),
            betNumbers: prediction.betNumbers,
            missNumbers: prediction.missNumbers,
            missCorrect: !prediction.missNumbers.includes(Number(row.actual))
        };
    });
    const summary = summarizeRows(details, config.betCount);
    const missCorrectDays = details.filter(row => row.missCorrect).length;
    const result = {
        ...summary,
        missListSize: config.missListSize,
        missCorrectDays,
        missAccuracy: details.length ? missCorrectDays / details.length : 0
    };
    if (includeRows) result.rows = details;
    return result;
}

function monthly(rows, betCount) {
    const groups = new Map();
    for (const row of rows) {
        const key = row.date.slice(0, 7);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return Array.from(groups.entries()).map(([month, values]) => ({
        month,
        ...summarizeRows(values, betCount)
    }));
}

function compact(value) {
    if (!value) return value;
    const { rows, ...rest } = value;
    return rest;
}

function main() {
    const args = parseArgs(process.argv);
    const indexFile = path.resolve(
        args.index || 'reports/strict_pit_all_methods_2016_2026.json'
    );
    const index = loadJson(indexFile);
    if (index.methodologyVersion !== 'strict-prefix-point-in-time-v1') {
        throw new Error(`Report index khong phai strict PIT: ${index.methodologyVersion}`);
    }
    const sourceByYear = new Map(index.sourceReports.map(item => [
        Number(item.year),
        path.resolve(path.dirname(indexFile), item.file)
    ]));
    const trainRows = loadYearRows(sourceByYear, [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023]);
    const selectionRows = loadYearRows(sourceByYear, [2024]);
    const validationRows = loadYearRows(sourceByYear, [2025]);
    const testRows = mergeRows(
        loadYearRows(sourceByYear, [2026]),
        args.testExtension ? path.resolve(args.testExtension) : null
    );
    const refitRows = [...trainRows, ...selectionRows, ...validationRows]
        .sort((a, b) => a.date.localeCompare(b.date));
    const strategyIds = fixedCardinalityMethods(trainRows);

    const candidates = [];
    for (const priorStrength of [30, 100, 300, 1000]) {
        const methodStats = collectMethodStats(trainRows, strategyIds, {
            priorStrength,
            baseRate: 0.3
        });
        for (const useWeights of [false, true]) {
            for (const missListSize of [0, 10, 15, 20]) {
                for (const betCount of [10, 15, 20, 30]) {
                    const config = { priorStrength, useWeights, missListSize, betCount };
                    candidates.push({
                        config,
                        methodStats,
                        selection: evaluate(selectionRows, methodStats, config),
                        validation: evaluate(validationRows, methodStats, config)
                    });
                }
            }
        }
    }

    const stableCandidates = candidates.filter(item =>
        item.selection.profitK > 0 && item.validation.profitK > 0
    ).sort((left, right) =>
        Math.min(right.selection.profitK, right.validation.profitK) -
            Math.min(left.selection.profitK, left.validation.profitK) ||
        right.validation.profitK - left.validation.profitK
    ).map(item => ({
        config: item.config,
        selection2024: item.selection,
        validation2025: item.validation,
        test2026: evaluate(testRows, item.methodStats, item.config)
    }));
    const candidateDiagnostics = candidates.map(item => ({
        config: item.config,
        selection2024: item.selection,
        validation2025: item.validation,
        test2026: evaluate(testRows, item.methodStats, item.config)
    }));

    const selectedByBetCount = [];
    for (const betCount of [10, 15, 20, 30]) {
        const selected = candidates
            .filter(item => item.config.betCount === betCount)
            .sort((left, right) =>
                right.selection.profitK - left.selection.profitK ||
                right.selection.hitRate - left.selection.hitRate ||
                right.selection.missAccuracy - left.selection.missAccuracy ||
                left.config.missListSize - right.config.missListSize
            )[0];
        const validation = evaluate(validationRows, selected.methodStats, selected.config, true);
        const test = evaluate(testRows, selected.methodStats, selected.config, true);
        const refitMethodStats = collectMethodStats(refitRows, strategyIds, {
            priorStrength: selected.config.priorStrength,
            baseRate: 0.3
        });
        const refitTest = evaluate(testRows, refitMethodStats, selected.config, true);
        selectedByBetCount.push({
            config: selected.config,
            methodStats: selected.methodStats,
            selection: selected.selection,
            validation,
            test: {
                ...test,
                months: monthly(test.rows, betCount)
            },
            refitTest: {
                ...refitTest,
                months: monthly(refitTest.rows, betCount)
            }
        });
    }

    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            version: 'two-stage-hit-miss-fusion-v1',
            training: '2016-2023 strict PIT; fit hit/miss reliability only.',
            selection: '2024 chooses prior, weighted/equal votes and miss-list size independently for each bet count.',
            validation: '2025 untouched confirmation.',
            test: '2026 untouched after all choices are frozen.',
            testExtension: args.testExtension ? path.resolve(args.testExtension) : null,
            economics: `${STAKE_K}K/number, payout ${PAYOUT}, daily fixed bet count.`,
            excludedMethods: 'Any method not returning exactly 30 numbers on every training date.',
            strategyIds
        },
        selectedByBetCount,
        stableCandidates,
        candidateDiagnostics,
        compact: selectedByBetCount.map(item => ({
            config: item.config,
            selection2024: compact(item.selection),
            validation2025: compact(item.validation),
            test2026: compact(item.test),
            testMonths2026: item.test.months,
            refitThrough2025Test2026: compact(item.refitTest),
            refitMonths2026: item.refitTest.months
        }))
    };
    const output = path.join(
        __dirname,
        '..',
        'reports',
        `research_two_stage_hit_miss_fusion_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        output,
        strategyIds,
        results: report.compact,
        stableCandidates: report.stableCandidates,
        diagnostics: {
            candidateCount: report.candidateDiagnostics.length,
            positive2024: report.candidateDiagnostics.filter(item => item.selection2024.profitK > 0).length,
            positive2025: report.candidateDiagnostics.filter(item => item.validation2025.profitK > 0).length,
            positive2026: report.candidateDiagnostics.filter(item => item.test2026.profitK > 0).length,
            positiveAllThree: report.candidateDiagnostics.filter(item =>
                item.selection2024.profitK > 0 &&
                item.validation2025.profitK > 0 &&
                item.test2026.profitK > 0
            ).length
        }
    }, null, 2));
}

main();
