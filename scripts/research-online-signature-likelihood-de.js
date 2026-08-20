#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildPredictions } = require('../lib/research/onlineSignatureRanker');

const SOURCE = path.resolve('reports/strict_pit_all_methods_2016_2026.json');
const TRAIN = ['2016-01-01', '2020-12-31'];
const VALIDATION = ['2021-01-01', '2023-12-31'];
const HOLDOUT = ['2024-01-01', '2025-12-31'];
const PRIOR_STRENGTHS = [50, 100, 250, 500, 1000, 2000];
const BET_COUNT = 30;
const PAYOUT = 84;
const STAKE_K = 1000;

function loadRows(source) {
    const root = path.dirname(SOURCE);
    return (source.sourceReports || [])
        .filter(item => Number(item.year) >= 2016 && Number(item.year) <= 2025)
        .flatMap(item => JSON.parse(fs.readFileSync(path.join(root, item.file), 'utf8')).rows || [])
        .sort((a, b) => a.date.localeCompare(b.date));
}

function range(rows, [start, end]) {
    return rows.filter(row => row.date >= start && row.date <= end);
}

function summary(rows) {
    const wins = rows.filter(row => row.hit).length;
    const days = rows.length;
    const profitK = wins * PAYOUT * STAKE_K - days * BET_COUNT * STAKE_K;
    let longestWin = 0;
    let longestLoss = 0;
    let last = null;
    let length = 0;
    for (const row of rows) {
        const label = row.hit ? 'win' : 'loss';
        length = label === last ? length + 1 : 1;
        last = label;
        if (label === 'win') longestWin = Math.max(longestWin, length);
        else longestLoss = Math.max(longestLoss, length);
    }
    return {
        days,
        wins,
        losses: days - wins,
        hitRate: days ? wins / days : 0,
        breakEvenHitRate: BET_COUNT / PAYOUT,
        profitK,
        roi: days ? profitK / (days * BET_COUNT * STAKE_K) : 0,
        longestWin,
        longestLoss
    };
}

function main() {
    const sourceBytes = fs.readFileSync(SOURCE);
    const source = JSON.parse(sourceBytes);
    const methodIds = source.fixed?.methodIds || [];
    const rows = loadRows(source).filter(row => methodIds.every(id => Array.isArray(row.strategies?.[id])));
    const candidates = PRIOR_STRENGTHS.map(priorStrength => {
        const daily = buildPredictions(rows, { methodIds, betCount: BET_COUNT, priorMean: 0.01, priorStrength });
        return {
            id: `signatureLikelihood:s${priorStrength}:hold70`,
            priorStrength,
            train: summary(range(daily, TRAIN)),
            validation: summary(range(daily, VALIDATION)),
            holdout: summary(range(daily, HOLDOUT)),
            all: summary(daily),
            daily
        };
    });
    const selected = [...candidates].sort((a, b) =>
        b.train.profitK - a.train.profitK || b.train.hitRate - a.train.hitRate || a.priorStrength - b.priorStrength
    )[0];
    const decision = selected.validation.profitK > 0 && selected.holdout.profitK > 0
        ? 'candidate-clears-independent-regimes-needs-final-audit'
        : 'do-not-promote';
    const report = {
        generatedAt: new Date().toISOString(),
        status: 'research-only',
        source: path.relative(process.cwd(), SOURCE),
        sourceSha256: crypto.createHash('sha256').update(sourceBytes).digest('hex'),
        methodology: {
            method: 'Online signature likelihood. Each number is represented by its exact membership vector across the 13 strict PIT dàn. The score is the smoothed historical occurrence probability of that signature.',
            strictPit: 'The signature table is updated after settlement only. The prediction for date D reads only rows before D.',
            selection: 'Select prior strength using 2016-2020 only; report 2021-2023 and 2024-2025 untouched.',
            economics: `Đánh ${BET_COUNT} số, ${STAKE_K}K/số, ăn ${PAYOUT}.`
        },
        methodIds,
        candidates: candidates.map(({ daily, ...candidate }) => candidate),
        selected: {
            ...selected,
            daily: undefined,
            annual: Object.fromEntries(Array.from({ length: 10 }, (_, index) => {
                const year = String(2016 + index);
                return [year, summary(selected.daily.filter(row => row.date.startsWith(year)))];
            }))
        },
        decision
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.resolve('reports', `online-signature-likelihood-de-${stamp}.json`);
    const markdownPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    const format = value => `${(value * 100).toFixed(2)}%`;
    const money = value => `${Math.round(value).toLocaleString('vi-VN')}K`;
    const lines = [
        '# Online signature likelihood - Đề strict PIT',
        '',
        `Chọn theo train: **${selected.id}**. Quyết định: **${decision}**.`,
        '',
        '| Giai đoạn | Ngày | Hit | Hòa vốn | Profit | ROI | Chuỗi W/L |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
        ...[['Train', selected.train], ['Validation', selected.validation], ['Holdout', selected.holdout], ['All', selected.all]].map(([name, item]) =>
            `| ${name} | ${item.days} | ${item.wins}/${item.days} (${format(item.hitRate)}) | ${format(item.breakEvenHitRate)} | ${money(item.profitK)} | ${format(item.roi)} | ${item.longestWin}/${item.longestLoss} |`),
        '',
        '| Prior strength | Train P/L | Validation P/L | Holdout P/L |',
        '| ---: | ---: | ---: | ---: |',
        ...candidates.map(item => `| ${item.priorStrength} | ${money(item.train.profitK)} | ${money(item.validation.profitK)} | ${money(item.holdout.profitK)} |`)
    ];
    fs.writeFileSync(markdownPath, `${lines.join('\n')}\n`);
    console.log(JSON.stringify({ jsonPath, markdownPath, decision, selected: {
        id: selected.id, train: selected.train, validation: selected.validation, holdout: selected.holdout, all: selected.all
    } }, null, 2));
}

main();
