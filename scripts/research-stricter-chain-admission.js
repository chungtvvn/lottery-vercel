#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { buildPrediction } = require('../lib/research/strictChainAdmission');

const ROOT = path.join(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports');
const HOLD = 70;
const STAKE_K = 1000;
const PAYOUT = 84;

function discoverReports() {
    const byYear = new Map();
    for (const filename of fs.readdirSync(REPORT_DIR)) {
        if (!filename.startsWith('research_true_pit_strategies_') || !filename.endsWith('.json')) continue;
        let report;
        try {
            report = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, filename), 'utf8'));
        } catch {
            continue;
        }
        if (report?.methodologyVersion !== 'strict-prefix-point-in-time-v1'
            || report?.options?.includeCandidateDiagnostics !== true
            || !Array.isArray(report.rows)
            || !report.rows.length
            || !Array.isArray(report.rows[0].candidateDiagnostics)
            || !Array.isArray(report.rows[0].strategies?.chainSmallFirst)) continue;
        const year = Number(String(report.options.startDate || '').slice(0, 4));
        if (!Number.isInteger(year)) continue;
        const preference = report.options.dateStep === 1 ? 2 : 1;
        const current = byYear.get(year);
        if (!current || preference > current.preference
            || (preference === current.preference && filename > current.filename)) {
            byYear.set(year, {
                year,
                filename,
                preference,
                dateStep: Number(report.options.dateStep || 1),
                rows: report.rows.slice().sort((left, right) => left.date.localeCompare(right.date))
            });
        }
    }
    return byYear;
}

function configId(config) {
    return [
        `m${String(Math.round(config.margin * 100)).padStart(2, '0')}`,
        `n${config.minTrials}`,
        `b${config.minBoundarySamples}`,
        `s${config.maxSwaps}`,
        config.allowUnknownPotentialBoundary ? 'pot' : 'known'
    ].join('-');
}

function buildConfigs() {
    const configs = [];
    for (const margin of [0.05, 0.1, 0.15]) {
        for (const minTrials of [5, 10, 20]) {
            for (const allowUnknownPotentialBoundary of [false, true]) {
                for (const maxSwaps of [1, 2, 4]) {
                    const config = {
                        margin,
                        minTrials,
                        wilsonZ: 1.28,
                        reliabilityPrior: 24,
                        activeFrequencyLimit: 0.5 * (1 - margin),
                        recordFrequencyLimit: 1.1 * (1 - margin),
                        maxBoundarySetSize: 20,
                        minBoundarySamples: margin >= 0.1 ? 2 : 1,
                        minPotentialCurrentLen: margin >= 0.1 ? 2 : 1,
                        allowUnknownPotentialBoundary,
                        maxSwaps,
                        maxFamiliesPerNumber: 4
                    };
                    configs.push({ ...config, id: configId(config) });
                }
            }
        }
    }
    return configs;
}

function createSummary(id) {
    return {
        id,
        days: 0,
        wins: 0,
        stakeK: 0,
        profitK: 0,
        longestLoss: 0,
        currentLoss: 0,
        qualifiedChains: 0,
        coveredNumbers: 0,
        changedNumbers: 0
    };
}

function settle(summary, row, prediction) {
    const bets = prediction.betNumbers.map(Number);
    const hit = bets.includes(Number(row.actual));
    summary.days++;
    summary.wins += Number(hit);
    summary.stakeK += bets.length * STAKE_K;
    summary.profitK += (hit ? STAKE_K * PAYOUT : 0) - bets.length * STAKE_K;
    summary.currentLoss = hit ? 0 : summary.currentLoss + 1;
    summary.longestLoss = Math.max(summary.longestLoss, summary.currentLoss);
    summary.qualifiedChains += Number(prediction.qualifiedChains || 0);
    summary.coveredNumbers += Number(prediction.coveredNumbers || 0);
    summary.changedNumbers += Number(prediction.changedNumbers || 0);
}

function finalize(summary) {
    const { currentLoss, ...result } = summary;
    return {
        ...result,
        hitRate: result.days ? result.wins / result.days : 0,
        roi: result.stakeK ? result.profitK / result.stakeK : 0,
        avgQualifiedChains: result.days ? result.qualifiedChains / result.days : 0,
        avgCoveredNumbers: result.days ? result.coveredNumbers / result.days : 0,
        avgChangedNumbers: result.days ? result.changedNumbers / result.days : 0
    };
}

function evaluate(rows, config) {
    const summary = createSummary(config?.id || 'chainSmallFirst');
    for (const row of rows) {
        const baselineBets = row.strategies.chainSmallFirst.map(Number);
        const prediction = config
            ? buildPrediction(row.candidateDiagnostics, baselineBets, HOLD, config)
            : { betNumbers: baselineBets };
        settle(summary, row, prediction);
    }
    return finalize(summary);
}

function aggregate(byYear, years, config) {
    return evaluate(years.flatMap(year => byYear.get(year)?.rows || []), config);
}

function selectConfig(byYear, configs, fitYears) {
    const baselineByYear = new Map(fitYears.map(year => [
        year,
        evaluate(byYear.get(year).rows, null)
    ]));
    const ranking = configs.map(config => {
        const yearly = fitYears.map(year => ({
            year,
            baseline: baselineByYear.get(year),
            result: evaluate(byYear.get(year).rows, config)
        }));
        const deltas = yearly.map(row => row.result.wins - row.baseline.wins);
        return {
            config,
            yearly,
            worstDeltaWins: Math.min(...deltas),
            nonDegradedYears: deltas.filter(delta => delta >= 0).length,
            totalDeltaWins: deltas.reduce((sum, delta) => sum + delta, 0),
            total: aggregate(byYear, fitYears, config)
        };
    }).sort((left, right) =>
        right.worstDeltaWins - left.worstDeltaWins
        || right.nonDegradedYears - left.nonDegradedYears
        || right.totalDeltaWins - left.totalDeltaWins
        || right.total.wins - left.total.wins
        || left.config.id.localeCompare(right.config.id)
    );
    return ranking;
}

function pct(value) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function money(value) {
    return `${Number(value || 0).toLocaleString('vi-VN')}K`;
}

function markdown(report) {
    const lines = [
        '# Siết điều kiện chuỗi loại trừ',
        '',
        '- Strict point-in-time; baseline năm khóa tại 31/12 năm trước.',
        '- Hold 70 cố định, đánh 30 số; 1.000K/số; trúng nhận x84.',
        '- Cấu hình chỉ được chọn trên 2014–2020; 2021–2023 validation; 2024–2025 test; 2026 holdout.',
        '- Mức `m10` yêu cầu cận bảo thủ cải thiện ít nhất 10% tương đối trên phần xác suất tiếp diễn nền. Chuỗi ở biên kỷ lục phải thêm điều kiện hiếm, đặc hiệu và đủ mẫu.',
        '',
        `**Cấu hình được khóa:** \`${report.selectedConfig.id}\``,
        '',
        '| Giai đoạn | Baseline hit | Baseline profit | Gate hit | Gate profit | Δ hit | Chuỗi đủ điều kiện/ngày | Số đổi/ngày |',
        '|---|---:|---:|---:|---:|---:|---:|---:|'
    ];
    for (const period of report.periods) {
        lines.push(`| ${period.label} | ${period.baseline.wins}/${period.baseline.days} (${pct(period.baseline.hitRate)}) | ${money(period.baseline.profitK)} | ${period.candidate.wins}/${period.candidate.days} (${pct(period.candidate.hitRate)}) | ${money(period.candidate.profitK)} | ${period.deltaWins >= 0 ? '+' : ''}${period.deltaWins} | ${period.candidate.avgQualifiedChains.toFixed(1)} | ${period.candidate.avgChangedNumbers.toFixed(1)} |`);
    }
    lines.push(
        '',
        '## Theo năm',
        '',
        '| Năm | Mẫu | Baseline | Gate | Δ hit | Profit gate | Chuỗi đủ/ngày |',
        '|---:|---:|---:|---:|---:|---:|---:|'
    );
    for (const row of report.yearly) {
        lines.push(`| ${row.year} | ${row.dateStep === 1 ? 'đủ ngày' : `step=${row.dateStep}`} | ${row.baseline.wins}/${row.baseline.days} (${pct(row.baseline.hitRate)}) | ${row.candidate.wins}/${row.candidate.days} (${pct(row.candidate.hitRate)}) | ${row.deltaWins >= 0 ? '+' : ''}${row.deltaWins} | ${money(row.candidate.profitK)} | ${row.candidate.avgQualifiedChains.toFixed(1)} |`);
    }
    lines.push('', `**Kết luận:** ${report.conclusion}`);
    return `${lines.join('\n')}\n`;
}

function main() {
    const byYear = discoverReports();
    const availableYears = [...byYear.keys()].sort((left, right) => left - right);
    const fitYears = availableYears.filter(year => year >= 2014 && year <= 2020);
    const validationYears = availableYears.filter(year => year >= 2021 && year <= 2023);
    const testYears = availableYears.filter(year => year >= 2024 && year <= 2025);
    const holdoutYears = availableYears.filter(year => year >= 2026);
    if (!fitYears.length || !validationYears.length || !testYears.length || !holdoutYears.length) {
        throw new Error(`Thiếu regime strict PIT; hiện có ${availableYears.join(', ')}.`);
    }
    const allConfigs = buildConfigs();
    const ranking = selectConfig(
        byYear,
        allConfigs.filter(config => config.margin === 0.1),
        fitYears
    );
    const selectedConfig = ranking[0].config;
    const periodDefs = [
        ['Fit 2014–2020', fitYears],
        ['Validation 2021–2023', validationYears],
        ['Test 2024–2025', testYears],
        ['Holdout 2026', holdoutYears]
    ];
    const periods = periodDefs.map(([label, years]) => {
        const baseline = aggregate(byYear, years, null);
        const candidate = aggregate(byYear, years, selectedConfig);
        return { label, years, baseline, candidate, deltaWins: candidate.wins - baseline.wins };
    });
    const yearly = availableYears.filter(year => year >= 2014).map(year => {
        const baseline = evaluate(byYear.get(year).rows, null);
        const candidate = evaluate(byYear.get(year).rows, selectedConfig);
        return {
            year,
            dateStep: byYear.get(year).dateStep,
            baseline,
            candidate,
            deltaWins: candidate.wins - baseline.wins
        };
    });
    const holdout = periods.at(-1);
    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'strict-chain-admission-annual-regimes-v1',
        status: 'research-only',
        economics: { hold: HOLD, betCount: 30, stakeK: STAKE_K, payoutMultiplier: PAYOUT },
        availableYears,
        fitYears,
        validationYears,
        testYears,
        holdoutYears,
        selectedConfig,
        fitRanking: ranking.map(row => ({
            id: row.config.id,
            worstDeltaWins: row.worstDeltaWins,
            nonDegradedYears: row.nonDegradedYears,
            totalDeltaWins: row.totalDeltaWins,
            totalWins: row.total.wins,
            totalDays: row.total.days,
            totalProfitK: row.total.profitK
        })),
        periods,
        yearly
    };
    report.conclusion = holdout.deltaWins > 0 && holdout.candidate.profitK > holdout.baseline.profitK
        ? `Gate cải thiện holdout ${holdout.deltaWins} hit và ${money(holdout.candidate.profitK - holdout.baseline.profitK)}, nhưng vẫn chỉ được cân nhắc nếu validation/test không suy giảm đáng kể.`
        : `Gate không cải thiện holdout (Δ ${holdout.deltaWins} hit; Δ profit ${money(holdout.candidate.profitK - holdout.baseline.profitK)}). Không đưa vào production.`;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonFile = path.join(REPORT_DIR, `stricter-chain-admission-${stamp}.json`);
    const mdFile = path.join(REPORT_DIR, `stricter-chain-admission-${stamp}.md`);
    fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2));
    fs.writeFileSync(mdFile, markdown(report));
    console.log(JSON.stringify({ jsonFile, mdFile, selectedConfig, periods, conclusion: report.conclusion }, null, 2));
}

if (require.main === module) main();

module.exports = { buildConfigs, discoverReports, evaluate, selectConfig };
