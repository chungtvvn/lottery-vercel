#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function loadEnvironment(filePath) {
    try {
        if (typeof process.loadEnvFile === 'function') {
            process.loadEnvFile(filePath);
            return;
        }
        const dotenv = require('dotenv');
        dotenv.config({ path: filePath, quiet: true });
    } catch {
        // CI supplies R2 configuration directly; local files are optional.
    }
}

loadEnvironment(path.join(process.cwd(), '.env.local'));
loadEnvironment(path.join(process.cwd(), '.env'));

const { getRawData } = require('../lib/data-access');
const { scoringForms } = require('../lib/utils/lotteryScoring');
const {
    buildGroupCatalog,
    runStrictWalkForward,
    runOnlineExpertEnsemble,
    wilsonLower
} = require('../lib/services/probabilityScoreModel');

const BET_COUNT = 30;
const BREAK_EVEN = BET_COUNT / 84;

const REGIMES = [
    { id: 'development', label: 'Phát triển độc lập', startDate: '2016-01-01', endDate: '2023-12-31' },
    { id: 'holdoutA', label: 'Holdout A', startDate: '2024-01-01', endDate: '2025-12-31' },
    { id: 'holdoutB', label: 'Holdout B', startDate: '2026-01-01', endDate: '9999-12-31' }
];

const CANDIDATES = [
    {
        id: 'scoreV2Default',
        label: 'Score v2: nhóm khử tương quan + EB + hazard',
        kind: 'ranker',
        options: { groupWindow: 180, shortWindow: 45, maxDiverseGroups: 10, learningRate: 0.12, l2: 0.012 }
    },
    {
        id: 'scoreV2ShortRegularized',
        label: 'Score v2: cửa sổ ngắn regularized',
        kind: 'ranker',
        options: { groupWindow: 90, shortWindow: 30, maxDiverseGroups: 6, learningRate: 0.04, l2: 0.04 }
    },
    {
        id: 'scoreV2LongRegularized',
        label: 'Score v2: cửa sổ dài regularized',
        kind: 'ranker',
        options: { groupWindow: 365, shortWindow: 90, maxDiverseGroups: 6, learningRate: 0.025, l2: 0.05 }
    },
    {
        id: 'scoreV2FrequencyHazard',
        label: 'Score v2: EB tần suất + hazard, không dùng nhóm',
        kind: 'ranker',
        options: { groupMinSize: 101, maxDiverseGroups: 0, learningRate: 0.05, l2: 0.04 }
    },
    {
        id: 'onlineHedgeSlow',
        label: 'Ensemble online Hedge, cập nhật chậm',
        kind: 'ensemble',
        options: { hedgeLearningRate: 0.30, hedgeDecay: 0.998 }
    },
    {
        id: 'onlineHedgeDefault',
        label: 'Ensemble online Hedge, cập nhật chuẩn',
        kind: 'ensemble',
        options: { hedgeLearningRate: 0.85, hedgeDecay: 0.995 }
    }
];

function compactDate(value) { return String(value || '').slice(0, 10); }

function summarize(rows) {
    const days = rows.length;
    const wins = rows.filter(row => row.hit).length;
    const stakeK = days * BET_COUNT * 1000;
    const payoutK = wins * 84 * 1000;
    const profitK = payoutK - stakeK;
    let longestWin = 0;
    let longestLoss = 0;
    let runningWin = 0;
    let runningLoss = 0;
    rows.forEach(row => {
        if (row.hit) {
            runningWin += 1;
            runningLoss = 0;
        } else {
            runningLoss += 1;
            runningWin = 0;
        }
        longestWin = Math.max(longestWin, runningWin);
        longestLoss = Math.max(longestLoss, runningLoss);
    });
    return {
        days,
        wins,
        losses: days - wins,
        hitRate: days ? wins / days : 0,
        wilsonLower: wilsonLower(wins, days),
        breakEvenHitRate: BREAK_EVEN,
        stakeK,
        payoutK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestWin,
        longestLoss
    };
}

function groupRows(rows, group) {
    const buckets = new Map();
    rows.forEach(row => {
        const key = group === 'month' ? row.date.slice(0, 7) : row.date.slice(0, 4);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(row);
    });
    return [...buckets.entries()].map(([period, entries]) => ({ period, ...summarize(entries) }));
}

function eligibleForPromotion(regimes) {
    const holdouts = regimes.filter(regime => regime.id.startsWith('holdout'));
    return holdouts.length >= 2 && holdouts.every(regime =>
        regime.summary.profitK > 0 && regime.summary.wilsonLower >= BREAK_EVEN
    );
}

async function main() {
    const raw = await getRawData();
    const dataThrough = compactDate(raw.at(-1)?.date);
    const reports = [];
    const daily = {};

    for (const candidate of CANDIDATES) {
        const catalog = buildGroupCatalog(scoringForms, candidate.options);
        const run = candidate.kind === 'ensemble'
            ? runOnlineExpertEnsemble(raw, { catalog, betCount: BET_COUNT, ...candidate.options })
            : runStrictWalkForward(raw, { catalog, betCount: BET_COUNT, ...candidate.options });
        const regimes = REGIMES.map(regime => {
            const rows = run.rows.filter(row => row.date >= regime.startDate && row.date <= regime.endDate);
            return { ...regime, summary: summarize(rows) };
        });
        reports.push({
            ...candidate,
            groups: catalog.groups.length,
            strictPointInTime: true,
            promotionEligible: eligibleForPromotion(regimes),
            regimes
        });
        daily[candidate.id] = run.rows.filter(row => row.date >= '2026-01-01');
    }

    const output = {
        generatedAt: new Date().toISOString(),
        source: 'Cloudflare R2 raw data',
        dataThrough,
        strictPointInTime: true,
        betCount: BET_COUNT,
        breakEvenHitRate: BREAK_EVEN,
        rule: 'Chỉ đề xuất production khi dương và Wilson lower >= hòa vốn ở cả Holdout A và Holdout B.',
        reports
    };
    const outputDir = path.join(process.cwd(), 'outputs', `probability-score-v2-${dataThrough}`);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'bao_cao_score_v2_strict_pit.json'), JSON.stringify(output, null, 2));
    fs.writeFileSync(path.join(outputDir, 'score_v2_2026_theo_ngay.json'), JSON.stringify(daily, null, 2));

    const csvRows = ['method,period,days,wins,losses,hitRate,wilsonLower,breakEven,profitK,roi,longestWin,longestLoss,promotionEligible'];
    reports.forEach(report => report.regimes.forEach(regime => {
        const row = regime.summary;
        csvRows.push([
            report.id,
            regime.id,
            row.days,
            row.wins,
            row.losses,
            row.hitRate,
            row.wilsonLower,
            row.breakEvenHitRate,
            row.profitK,
            row.roi,
            row.longestWin,
            row.longestLoss,
            report.promotionEligible
        ].join(','));
    }));
    fs.writeFileSync(path.join(outputDir, 'tom_tat_score_v2_strict_pit.csv'), `${csvRows.join('\n')}\n`);

    console.table(reports.flatMap(report => report.regimes.map(regime => ({
        method: report.id,
        regime: regime.id,
        days: regime.summary.days,
        hitRate: `${(regime.summary.hitRate * 100).toFixed(2)}%`,
        wilson: `${(regime.summary.wilsonLower * 100).toFixed(2)}%`,
        profitK: regime.summary.profitK,
        roi: `${(regime.summary.roi * 100).toFixed(2)}%`,
        eligible: report.promotionEligible
    }))));
    console.log(`\nBáo cáo: ${outputDir}`);
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
