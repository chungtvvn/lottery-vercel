#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildBlendedPredictions } = require('../lib/research/onlineSignatureRanker');

const SOURCE = path.resolve('reports/strict_pit_all_methods_2016_2026.json');
const PERIODS = {
    train: ['2016-01-01', '2020-12-31'],
    validation: ['2021-01-01', '2023-12-31'],
    holdout: ['2024-01-01', '2025-12-31']
};
const SIGNATURE_STRENGTHS = [50, 250, 1000];
const NUMBER_STRENGTHS = [50, 250, 1000];
const WEIGHTS = [0, 0.25, 0.5, 0.75, 1];
const BET_COUNT = 30;
const PAYOUT = 84;
const STAKE_K = 1000;

function loadRows(source) {
    const root = path.dirname(SOURCE);
    return (source.sourceReports || []).filter(item => Number(item.year) >= 2016 && Number(item.year) <= 2025)
        .flatMap(item => JSON.parse(fs.readFileSync(path.join(root, item.file), 'utf8')).rows || [])
        .sort((a, b) => a.date.localeCompare(b.date));
}

function summarize(rows) {
    const wins = rows.filter(row => row.hit).length;
    const days = rows.length;
    const profitK = wins * PAYOUT * STAKE_K - days * BET_COUNT * STAKE_K;
    return { days, wins, hitRate: days ? wins / days : 0, profitK, roi: days ? profitK / (days * BET_COUNT * STAKE_K) : 0 };
}

function period(rows, bounds) {
    return rows.filter(row => row.date >= bounds[0] && row.date <= bounds[1]);
}

function money(value) { return `${Math.round(value).toLocaleString('vi-VN')}K`; }

function main() {
    const bytes = fs.readFileSync(SOURCE);
    const source = JSON.parse(bytes);
    const methodIds = source.fixed?.methodIds || [];
    const rows = loadRows(source).filter(row => methodIds.every(id => Array.isArray(row.strategies?.[id])));
    const candidates = [];
    for (const signatureStrength of SIGNATURE_STRENGTHS) {
        for (const numberStrength of NUMBER_STRENGTHS) {
            for (const signatureWeight of WEIGHTS) {
                const daily = buildBlendedPredictions(rows, {
                    methodIds,
                    betCount: BET_COUNT,
                    priorMean: 0.01,
                    priorStrength: signatureStrength,
                    numberPriorMean: 0.01,
                    numberPriorStrength: numberStrength,
                    signatureWeight
                });
                candidates.push({
                    id: `signatureNumberBlend:w${signatureWeight}:ss${signatureStrength}:ns${numberStrength}:hold70`,
                    signatureWeight,
                    signatureStrength,
                    numberStrength,
                    train: summarize(period(daily, PERIODS.train)),
                    validation: summarize(period(daily, PERIODS.validation)),
                    holdout: summarize(period(daily, PERIODS.holdout)),
                    all: summarize(daily)
                });
            }
        }
    }
    const selected = [...candidates].sort((a, b) => b.train.profitK - a.train.profitK || b.train.hitRate - a.train.hitRate)[0];
    const report = {
        generatedAt: new Date().toISOString(),
        status: 'research-only',
        source: path.relative(process.cwd(), SOURCE),
        sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        methodology: 'Online empirical-Bayes blend of membership signature likelihood and per-number occurrence likelihood. Every state update happens only after the predicted date settles. Hyperparameters selected solely on 2016-2020.',
        selection: { periods: PERIODS, selectedId: selected.id, candidateCount: candidates.length },
        selected,
        topTrain: [...candidates].sort((a, b) => b.train.profitK - a.train.profitK).slice(0, 10),
        decision: selected.validation.profitK > 0 && selected.holdout.profitK > 0 ? 'needs-final-audit' : 'do-not-promote'
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.resolve('reports', `signature-number-blend-de-${stamp}.json`);
    const markdownPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(markdownPath, [
        '# Signature + number empirical-Bayes blend - strict PIT', '',
        `Ứng viên được chọn trên train: **${selected.id}**. Quyết định: **${report.decision}**.`, '',
        '| Period | Hit | Profit | ROI |', '| --- | ---: | ---: | ---: |',
        ...Object.entries({ Train: selected.train, Validation: selected.validation, Holdout: selected.holdout, All: selected.all })
            .map(([name, item]) => `| ${name} | ${item.wins}/${item.days} (${(item.hitRate * 100).toFixed(2)}%) | ${money(item.profitK)} | ${(item.roi * 100).toFixed(2)}% |`), '',
        'Không đưa vào production nếu validation hoặc holdout âm.'
    ].join('\n') + '\n');
    console.log(JSON.stringify({ jsonPath, markdownPath, decision: report.decision, selected }, null, 2));
}

main();
