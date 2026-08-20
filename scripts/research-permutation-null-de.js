#!/usr/bin/env node
'use strict';

// Calibrates an apparent strict-PIT result against random outcomes.  The dàn
// stays frozen; only the outcome labels are permuted, so this estimates how
// often a result at least this good occurs without predictive information.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
    buildDailyPredictions,
    summarizeCombinedBetHold
} = require('../lib/research/walkforwardWilsonGate');

const SOURCE = path.resolve('reports/strict_pit_all_methods_2016_2026.json');
const REPLICATIONS = 10000;
const ECONOMICS = {
    stakePerNumberK: 1000,
    payoutMultiplier: 84,
    holdWinMultiplier: 0.705,
    holdLossMultiplier: 70,
    betCount: 3
};

function loadRows(source) {
    const root = path.dirname(SOURCE);
    return (source.sourceReports || [])
        .filter(item => Number(item.year) >= 2016 && Number(item.year) <= 2025)
        .flatMap(item => JSON.parse(fs.readFileSync(path.join(root, item.file), 'utf8')).rows || [])
        .sort((left, right) => left.date.localeCompare(right.date));
}

function createRng(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function shuffled(values, rng) {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index--) {
        const other = Math.floor(rng() * (index + 1));
        [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
}

function percentile(values, p) {
    if (!values.length) return 0;
    const index = Math.min(values.length - 1, Math.max(0, Math.floor(p * (values.length - 1))));
    return values[index];
}

function main() {
    const sourceBytes = fs.readFileSync(SOURCE);
    const source = JSON.parse(sourceBytes);
    const methodIds = source.fixed?.methodIds || [];
    const rows = loadRows(source).filter(row => methodIds.every(id => Array.isArray(row.strategies?.[id])));
    const daily = buildDailyPredictions(rows, {
        methodIds,
        scoreMode: 'weightedBeta',
        betCount: ECONOMICS.betCount,
        priorMean: 0.3,
        priorStrength: 60
    });
    const observed = summarizeCombinedBetHold(daily, ECONOMICS);
    const actuals = daily.map(row => row.actual);
    const nullResults = [];
    for (let replication = 0; replication < REPLICATIONS; replication++) {
        const outcomes = shuffled(actuals, createRng(0x9e3779b9 ^ replication));
        const simulated = daily.map((row, index) => ({
            ...row,
            actual: outcomes[index],
            hit: row.betNumbers.includes(outcomes[index])
        }));
        const summary = summarizeCombinedBetHold(simulated, ECONOMICS);
        nullResults.push({ hits: summary.wins, profitK: summary.profitK });
    }
    const orderedProfit = nullResults.map(row => row.profitK).sort((a, b) => a - b);
    const orderedHits = nullResults.map(row => row.hits).sort((a, b) => a - b);
    const report = {
        generatedAt: new Date().toISOString(),
        status: 'research-only',
        source: path.relative(process.cwd(), SOURCE),
        sourceSha256: crypto.createHash('sha256').update(sourceBytes).digest('hex'),
        methodology: {
            candidate: 'weightedBeta ensemble, top 3, strict PIT base dàn',
            nullModel: 'Permute observed outcomes across the same frozen daily predictions. This preserves the empirical outcome distribution and dàn sizes while breaking any prediction-outcome relation.',
            replications: REPLICATIONS,
            warning: 'This rejects or fails to reject evidence of edge; it does not prove future profitability.'
        },
        economics: ECONOMICS,
        observed: {
            days: observed.days,
            hits: observed.wins,
            hitRate: observed.hitRate,
            profitK: observed.profitK,
            roi: observed.roi
        },
        nullDistribution: {
            profitK: {
                p05: percentile(orderedProfit, 0.05),
                p50: percentile(orderedProfit, 0.5),
                p95: percentile(orderedProfit, 0.95),
                probabilityAtLeastObserved: nullResults.filter(row => row.profitK >= observed.profitK).length / REPLICATIONS
            },
            hits: {
                p05: percentile(orderedHits, 0.05),
                p50: percentile(orderedHits, 0.5),
                p95: percentile(orderedHits, 0.95),
                probabilityAtLeastObserved: nullResults.filter(row => row.hits >= observed.wins).length / REPLICATIONS
            }
        },
        decision: 'do-not-promote-without-independent-positive-validation'
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.resolve('reports', `permutation-null-de-${stamp}.json`);
    const markdownPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(markdownPath, `# Kiểm định hoán vị strict PIT - Đề\n\n` +
        `- Phương án: weightedBeta, dàn 3 số, Đánh + Ôm.\n` +
        `- Quan sát: ${observed.wins}/${observed.days} (${(observed.hitRate * 100).toFixed(3)}%), ${Math.round(observed.profitK).toLocaleString('vi-VN')}K.\n` +
        `- Null ${REPLICATIONS.toLocaleString('vi-VN')} lần, profit P05/P50/P95: ${percentile(orderedProfit, 0.05).toLocaleString('vi-VN')}K / ${percentile(orderedProfit, 0.5).toLocaleString('vi-VN')}K / ${percentile(orderedProfit, 0.95).toLocaleString('vi-VN')}K.\n` +
        `- Xác suất kết quả null đạt ít nhất mức quan sát: ${((report.nullDistribution.profitK.probabilityAtLeastObserved) * 100).toFixed(2)}%.\n\n` +
        `Kết luận: không đưa vào production chỉ từ mẫu này; cần validation độc lập dương.\n`);
    console.log(JSON.stringify({ jsonPath, markdownPath, observed: report.observed, nullDistribution: report.nullDistribution }, null, 2));
}

main();
