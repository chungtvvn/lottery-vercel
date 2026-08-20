#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { evaluate } = require('../lib/research/onlineConsensusEnsemble');

const MODES = ['betaWeighted', 'emaWeighted', 'leaderBeta', 'leaderEma', 'majority'];
const BASELINE_ID = 'chainBlockFirst';
const ECONOMICS = {
    betCount: 30,
    stakePerNumberK: 1000,
    winMultiplier: 84
};

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return { report: args.get('report') };
}

function compact(summary) {
    const { rows, ...result } = summary;
    return result;
}

function monthly(rows) {
    const groups = new Map();
    for (const row of rows) {
        const month = row.date.slice(0, 7);
        const current = groups.get(month) || { month, days: 0, wins: 0, profitK: 0 };
        current.days++;
        current.wins += Number(row.hit);
        current.profitK += row.profitK;
        groups.set(month, current);
    }
    return [...groups.values()].map(item => ({
        ...item,
        hitRate: item.days ? item.wins / item.days : 0
    }));
}

function baseline(rows) {
    const normalized = rows.map(row => ({
        ...row,
        strategies: { [BASELINE_ID]: row.strategies?.[BASELINE_ID] }
    }));
    return evaluate(normalized, {
        ...ECONOMICS,
        mode: 'leaderBeta',
        strategyIds: [BASELINE_ID]
    });
}

function main() {
    const options = parseArgs();
    if (!options.report) throw new Error('Thiếu --report.');
    const sourcePath = path.resolve(options.report);
    const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const rows = (source.rows || []).filter(row =>
        row.strategies?.chainBlockFirst &&
        row.strategies?.chainSmallFirst &&
        row.strategies?.numberSurvivalCredibleRisk
    );
    const base = baseline(rows);
    const candidates = MODES.map(mode => {
        const summary = evaluate(rows, {
            ...ECONOMICS,
            mode,
            decay: 0.95,
            priorMean: 0.3,
            priorStrength: 10
        });
        const promote =
            summary.wins > base.wins &&
            summary.profitK > base.profitK &&
            summary.profitK > 0 &&
            summary.longestLoss <= Math.ceil(base.longestLoss * 1.2);
        return {
            mode,
            summary: compact(summary),
            monthly: monthly(summary.rows),
            delta: {
                wins: summary.wins - base.wins,
                profitK: summary.profitK - base.profitK,
                longestLoss: summary.longestLoss - base.longestLoss
            },
            promote
        };
    }).sort((left, right) =>
        right.summary.profitK - left.summary.profitK ||
        right.summary.wins - left.summary.wins ||
        left.mode.localeCompare(right.mode)
    );
    const report = {
        generatedAt: new Date().toISOString(),
        status: 'research-only',
        source: sourcePath,
        methodology: {
            pointInTime: 'Dàn ngày D được tạo trước khi dùng kết quả D.',
            update: 'Trọng số expert chỉ cập nhật sau khi settle ngày D.',
            hyperparameters: 'Prior 30%, strength 10 và EMA decay 0.95 được cố định, không chọn bằng holdout.',
            promotion: 'Phải tăng wins và profit, profit dương, chuỗi thua không tăng quá 20%.'
        },
        economics: ECONOMICS,
        baseline: compact(base),
        candidates,
        decision: candidates.some(item => item.promote)
            ? 'candidate-needs-independent-calendar-validation'
            : 'do-not-promote'
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const output = path.resolve('reports', `research_online_consensus_${stamp}.json`);
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({
        output,
        baseline: report.baseline,
        candidates: candidates.map(item => ({
            mode: item.mode,
            summary: item.summary,
            delta: item.delta,
            promote: item.promote
        })),
        decision: report.decision
    }, null, 2));
}

main();
