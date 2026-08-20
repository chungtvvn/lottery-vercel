#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
    runOnline
} = require('../lib/research/onlineMembershipRanker');

const STAKE_PER_NUMBER_K = 1000;
const PAYOUT_MULTIPLIER = 84;
const BET_COUNTS = [10, 15, 20, 25, 30, 35, 40, 50, 60];
const EXCLUDED_IDS = new Set(['chainRiskFirst', 'deParallelBlock85Small65']);

function reportFiles() {
    const index = JSON.parse(fs.readFileSync(path.resolve(
        'reports/strict_pit_all_methods_2016_2026.json'
    ), 'utf8'));
    if (!index.audit?.passed) throw new Error('Strict PIT index audit chua pass.');
    return index.sourceReports.map(item => path.resolve('reports', item.file));
}

function loadRows() {
    return reportFiles().flatMap(file => {
        const report = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (report.methodologyVersion !== 'strict-prefix-point-in-time-v1') {
            throw new Error(`Sai methodologyVersion: ${file}`);
        }
        return report.rows || [];
    }).sort((left, right) => left.date.localeCompare(right.date));
}

function strategyIds(rows) {
    return Object.keys(rows[0]?.strategies || {}).filter(id =>
        !EXCLUDED_IDS.has(id) && rows.every(row => Array.isArray(row.strategies?.[id]))
    );
}

function configs() {
    return [
        { id: 'linear-slow', learningRate: 0.03, l2: 0.001, decay: 1, positiveWeight: 1, interactions: false, numberBias: false },
        { id: 'linear-balanced', learningRate: 0.08, l2: 0.001, decay: 0.9995, positiveWeight: 1, interactions: false, numberBias: false },
        { id: 'linear-recent', learningRate: 0.08, l2: 0.003, decay: 0.997, positiveWeight: 1, interactions: false, numberBias: false },
        { id: 'linear-positive10', learningRate: 0.05, l2: 0.001, decay: 0.9995, positiveWeight: 10, interactions: false, numberBias: false },
        { id: 'linear-number', learningRate: 0.05, l2: 0.003, decay: 0.999, positiveWeight: 1, interactions: false, numberBias: true },
        { id: 'pair-slow', learningRate: 0.03, l2: 0.003, decay: 1, positiveWeight: 1, interactions: true, numberBias: false },
        { id: 'pair-balanced', learningRate: 0.05, l2: 0.003, decay: 0.9995, positiveWeight: 1, interactions: true, numberBias: false },
        { id: 'pair-number', learningRate: 0.03, l2: 0.005, decay: 0.999, positiveWeight: 1, interactions: true, numberBias: true }
    ];
}

function summarize(predictions, betCount) {
    const byYear = new Map();
    let currentType = null;
    let currentLength = 0;
    let longestWin = 0;
    let longestLoss = 0;
    for (const row of predictions) {
        const year = row.date.slice(0, 4);
        if (!byYear.has(year)) byYear.set(year, { year, days: 0, wins: 0 });
        const bucket = byYear.get(year);
        const win = row.actualRank <= betCount;
        bucket.days++;
        bucket.wins += Number(win);
        const type = win ? 'win' : 'loss';
        if (type === currentType) currentLength++;
        else {
            currentType = type;
            currentLength = 1;
        }
        longestWin = Math.max(longestWin, win ? currentLength : 0);
        longestLoss = Math.max(longestLoss, win ? 0 : currentLength);
    }
    const years = Object.fromEntries([...byYear].map(([year, row]) => {
        const stakeK = row.days * betCount * STAKE_PER_NUMBER_K;
        const payoutK = row.wins * PAYOUT_MULTIPLIER * STAKE_PER_NUMBER_K;
        return [year, {
            ...row,
            hitRate: row.wins / row.days,
            stakeK,
            profitK: payoutK - stakeK,
            roi: (payoutK - stakeK) / stakeK
        }];
    }));
    return { betCount, years, longestWin, longestLoss };
}

function periodStats(summary, yearList) {
    const rows = yearList.map(year => summary.years[year]).filter(Boolean);
    const profitK = rows.reduce((sum, row) => sum + row.profitK, 0);
    const days = rows.reduce((sum, row) => sum + row.days, 0);
    const wins = rows.reduce((sum, row) => sum + row.wins, 0);
    return {
        years: yearList,
        days,
        wins,
        hitRate: wins / days,
        profitK,
        profitableYears: rows.filter(row => row.profitK > 0).length,
        worstYearProfitK: Math.min(...rows.map(row => row.profitK)),
        averageAnnualProfitK: profitK / rows.length
    };
}

function candidateScore(candidate) {
    const fit = candidate.periods.fit;
    return [fit.worstYearProfitK, fit.profitableYears, fit.averageAnnualProfitK];
}

function evidenceDiagnostics(rows, ids) {
    const grouped = new Map();
    for (const row of rows) {
        const year = row.date.slice(0, 4);
        if (!grouped.has(year)) grouped.set(year, []);
        grouped.get(year).push(row);
    }
    return Object.fromEntries([...grouped].map(([year, yearRows]) => {
        const expertWins = new Map(ids.map(id => [id, 0]));
        let actualVotes = 0;
        let candidateVotes = 0;
        let noVoteDays = 0;
        for (const row of yearRows) {
            const actual = Number(row.actual);
            let dailyActualVotes = 0;
            for (const id of ids) {
                const values = (row.strategies[id] || []).map(Number);
                candidateVotes += values.length;
                if (!values.includes(actual)) continue;
                dailyActualVotes++;
                expertWins.set(id, expertWins.get(id) + 1);
            }
            actualVotes += dailyActualVotes;
            noVoteDays += Number(dailyActualVotes === 0);
        }
        const bestExpert = [...expertWins]
            .map(([id, wins]) => ({ id, wins }))
            .sort((left, right) => right.wins - left.wins || left.id.localeCompare(right.id))[0];
        const days = yearRows.length;
        const bestStakeK = days * 30 * STAKE_PER_NUMBER_K;
        return [year, {
            days,
            actualAverageVotes: actualVotes / days,
            allNumberAverageVotes: candidateVotes / (days * 100),
            voteLift: (actualVotes / days) / (candidateVotes / (days * 100)),
            noVoteDays,
            noVoteRate: noVoteDays / days,
            exPostBestFixedExpert: {
                ...bestExpert,
                hitRate: bestExpert.wins / days,
                profitK: bestExpert.wins * PAYOUT_MULTIPLIER * STAKE_PER_NUMBER_K - bestStakeK
            }
        }];
    }));
}

function compareScore(left, right) {
    const a = candidateScore(left);
    const b = candidateScore(right);
    for (let index = 0; index < a.length; index++) {
        if (a[index] !== b[index]) return b[index] - a[index];
    }
    return left.id.localeCompare(right.id);
}

function markdown(report) {
    const lines = [
        '# Xep hang membership online - strict PIT',
        '',
        `Thoi diem sinh: ${report.generatedAt}`,
        '',
        '## Giao thuc kiem dinh',
        '',
        '- Du doan duoc tao truoc, ket qua cung ngay chi duoc cap nhat sau khi da chot dan.',
        '- Cau hinh va so luong so danh chi duoc chon tren 2017-2020 theo profit nam te nhat.',
        '- 2016 la warm-up; 2021-2022 validation; 2023-2025 test dong bang; 2026 holdout cuoi.',
        '- Ty le an x84, moi so 1000K.',
        '',
        '## Ung vien duoc chon',
        '',
        `- ${report.selected.id}`,
        `- So danh: ${report.selected.betCount}`,
        '',
        '| Giai doan | Ty le trung | Profit K | Nam duong | Nam te nhat K |',
        '|---|---:|---:|---:|---:|'
    ];
    for (const [name, row] of Object.entries(report.selected.periods)) {
        lines.push(`| ${name} | ${(row.hitRate * 100).toFixed(2)}% | ${row.profitK.toLocaleString('en-US')} | ${row.profitableYears}/${row.years.length} | ${row.worstYearProfitK.toLocaleString('en-US')} |`);
    }
    lines.push('', '## Ket qua tung nam', '', '| Nam | Ngay | Trung | Ty le trung | Profit K | ROI |', '|---|---:|---:|---:|---:|---:|');
    for (const row of Object.values(report.selected.summary.years)) {
        lines.push(`| ${row.year} | ${row.days} | ${row.wins} | ${(row.hitRate * 100).toFixed(2)}% | ${row.profitK.toLocaleString('en-US')} | ${(row.roi * 100).toFixed(2)}% |`);
    }
    lines.push(
        '',
        '## Chan doan tin hieu',
        '',
        '| Nam | Phieu TB cua so that | Phieu TB nen | Vote lift | So that 0 phieu | Phuong phap tot nhat ex-post | Profit K |',
        '|---|---:|---:|---:|---:|---|---:|'
    );
    for (const [year, row] of Object.entries(report.evidenceDiagnostics)) {
        lines.push(`| ${year} | ${row.actualAverageVotes.toFixed(2)} | ${row.allNumberAverageVotes.toFixed(2)} | ${row.voteLift.toFixed(3)} | ${(row.noVoteRate * 100).toFixed(2)}% | ${row.exPostBestFixedExpert.id} | ${row.exPostBestFixedExpert.profitK.toLocaleString('en-US')} |`);
    }
    lines.push(
        '',
        `Ung vien duong o moi nam train: **${report.searchAudit.positiveEveryFitYear}/${report.searchAudit.candidates}**.`,
        `Ung vien duong o moi nam validation, test va holdout: **${report.searchAudit.positiveEveryEvaluationYear}**.`
    );
    lines.push('', `Quyet dinh: **${report.decision}**`, '');
    return `${lines.join('\n')}\n`;
}

function main() {
    const rows = loadRows();
    const ids = strategyIds(rows);
    const candidates = [];
    for (const config of configs()) {
        console.log(`[OnlineMembership] ${config.id}`);
        const result = runOnline(rows, ids, config);
        for (const betCount of BET_COUNTS) {
            const summary = summarize(result.predictions, betCount);
            candidates.push({
                id: `${config.id}:bet${betCount}`,
                config,
                betCount,
                summary,
                periods: {
                    warmup: periodStats(summary, ['2016']),
                    fit: periodStats(summary, ['2017', '2018', '2019', '2020']),
                    validation: periodStats(summary, ['2021', '2022']),
                    test: periodStats(summary, ['2023', '2024', '2025']),
                    holdout: periodStats(summary, ['2026'])
                }
            });
        }
    }
    candidates.sort(compareScore);
    const selected = candidates[0];
    const passes = ['fit', 'validation', 'test', 'holdout'].every(period =>
        selected.periods[period].worstYearProfitK > 0
    );
    const report = {
        generatedAt: new Date().toISOString(),
        status: 'research-only',
        methodologyVersion: 'online-membership-strict-pit-v1',
        audit: {
            strictSourcePassed: true,
            rows: rows.length,
            firstDate: rows[0].date,
            lastDate: rows.at(-1).date,
            strategyIds: ids,
            selectionUsesOnly: ['2017', '2018', '2019', '2020']
        },
        economics: { stakePerNumberK: STAKE_PER_NUMBER_K, payoutMultiplier: PAYOUT_MULTIPLIER },
        searchAudit: {
            candidates: candidates.length,
            positiveEveryFitYear: candidates.filter(row => row.periods.fit.worstYearProfitK > 0).length,
            positiveEveryEvaluationYear: candidates.filter(row =>
                ['validation', 'test', 'holdout'].every(period =>
                    row.periods[period].worstYearProfitK > 0
                )
            ).length
        },
        evidenceDiagnostics: evidenceDiagnostics(rows, ids),
        selected,
        topCandidates: candidates.slice(0, 20).map(row => ({
            id: row.id,
            betCount: row.betCount,
            periods: row.periods
        })),
        decision: passes ? 'eligible-for-independent-replication' : 'do-not-promote'
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.resolve('reports', `online-membership-worst-year-${stamp}.json`);
    const mdPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(mdPath, markdown(report));
    console.log(JSON.stringify({ jsonPath, mdPath, selected, decision: report.decision }, null, 2));
}

if (require.main === module) main();

module.exports = {
    BET_COUNTS,
    compareScore,
    configs,
    evidenceDiagnostics,
    periodStats,
    strategyIds,
    summarize
};
