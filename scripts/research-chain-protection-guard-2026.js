#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { buildDailyLedgerRow } = require('../lib/research/chainProtectionLedger');
const { fitModel } = require('../lib/research/chainProtectionCalibrator');
const { applyProtectionGuard } = require('../lib/research/chainProtectionRanker');

const ROOT = path.join(__dirname, '..');
const TRAIN_INPUTS = [
    'reports/research_true_pit_strategies_2026-07-18T05-07-58-141Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-10-27-615Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-13-50-218Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-17-18-007Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-20-47-671Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-24-29-803Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-28-05-368Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-32-38-749Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-37-44-713Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-42-58-943Z.json',
    'reports/research_true_pit_strategies_2026-07-18T08-07-35-994Z.json',
    'reports/research_true_pit_strategies_2026-07-18T08-15-14-027Z.json'
];
const HOLDOUT_INPUT = 'reports/research_true_pit_strategies_2026-07-16T17-18-22-555Z.json';

function loadOpportunities(inputs) {
    const byDate = new Map();
    for (const input of inputs) {
        const report = JSON.parse(fs.readFileSync(path.join(ROOT, input), 'utf8'));
        for (const row of report.rows || []) {
            if (!Array.isArray(row.candidateDiagnostics)) continue;
            const ledger = buildDailyLedgerRow(row);
            byDate.set(row.date, ledger.opportunities);
        }
    }
    return byDate;
}

function summarize(rows) {
    const wins = rows.filter(row => row.hits > 0).length;
    let profit = 0;
    let currentWin = 0;
    let currentLoss = 0;
    let longestWin = 0;
    let longestLoss = 0;
    for (const row of rows) {
        profit += row.profit;
        if (row.hits > 0) {
            currentWin++;
            currentLoss = 0;
        } else {
            currentLoss++;
            currentWin = 0;
        }
        longestWin = Math.max(longestWin, currentWin);
        longestLoss = Math.max(longestLoss, currentLoss);
    }
    return {
        days: rows.length,
        wins,
        winRate: rows.length ? wins / rows.length : 0,
        hits: rows.reduce((sum, row) => sum + row.hits, 0),
        bets: rows.reduce((sum, row) => sum + row.bets.length, 0),
        profit,
        roi: rows.reduce((sum, row) => sum + row.bets.length, 0)
            ? profit / rows.reduce((sum, row) => sum + row.bets.length, 0)
            : 0,
        longestWin,
        longestLoss
    };
}

function aggregate(rows, keyFn) {
    const groups = new Map();
    for (const row of rows) {
        const key = keyFn(row);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return Object.fromEntries([...groups].map(([key, values]) => [key, summarize(values)]));
}

function main() {
    const trainByDate = loadOpportunities(TRAIN_INPUTS);
    const train = [...trainByDate.entries()].flatMap(([date, opportunities]) =>
        opportunities.map(opportunity => ({ ...opportunity, date }))
    );
    const model = fitModel(train, { minEffectiveTrials: 25, minAbsoluteLift: 0.015 });
    const report = JSON.parse(fs.readFileSync(path.join(ROOT, HOLDOUT_INPUT), 'utf8'));
    const configs = [0, 1, 3, 5];
    const rowsByConfig = Object.fromEntries(configs.map(value => [String(value), []]));
    for (const sourceRow of report.rows || []) {
        if (!Array.isArray(sourceRow.candidateDiagnostics)) continue;
        const ledger = buildDailyLedgerRow(sourceRow);
        const opportunities = ledger.opportunities;
        const baseline = sourceRow.strategies?.chainSmallFirst || [];
        for (const maxProtected of configs) {
            const guarded = applyProtectionGuard(baseline, opportunities, model, {
                maxProtected,
                budget: 30
            });
            const bets = guarded.betNumbers;
            const hits = bets.filter(number => Number(number) === Number(sourceRow.actual)).length;
            rowsByConfig[String(maxProtected)].push({
                date: sourceRow.date,
                actual: sourceRow.actual,
                bets,
                protectedNumbers: guarded.protectedNumbers,
                hits,
                profit: hits * 84 - bets.length
            });
        }
    }
    const summaries = Object.fromEntries(configs.map(value => [
        String(value), {
            overall: summarize(rowsByConfig[String(value)]),
            monthly: aggregate(rowsByConfig[String(value)], row => row.date.slice(0, 7)),
            weekly: aggregate(rowsByConfig[String(value)], row => {
                const date = new Date(`${row.date}T00:00:00Z`);
                const day = date.getUTCDay() || 7;
                date.setUTCDate(date.getUTCDate() - day + 1);
                return date.toISOString().slice(0, 10);
            })
        }
    ]));
    const output = {
        generatedAt: new Date().toISOString(),
        methodology: 'strict-pit-chain-protection-guard-v1',
        baseline: 'chainSmallFirst:hold70',
        economics: { stakePerNumberK: 1, payoutK: 84, fixedBudget: 30 },
        training: '2014-2025 sampled candidate ledgers; no 2026 outcomes used in model',
        holdout: '2026 full daily candidate diagnostics',
        summaries,
        rowsByConfig
    };
    const base = path.join(ROOT, 'reports', `chain-protection-guard-2026-${new Date().toISOString().slice(0, 10)}`);
    fs.writeFileSync(`${base}.json`, `${JSON.stringify(output, null, 2)}\n`);
    console.log(JSON.stringify({
        report: `${base}.json`,
        summaries: Object.fromEntries(configs.map(value => [String(value), summaries[String(value)].overall]))
    }, null, 2));
}

main();
