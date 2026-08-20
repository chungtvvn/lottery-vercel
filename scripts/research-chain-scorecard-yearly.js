#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
    buildQualityMap,
    refinePrediction
} = require('../lib/research/chainScorecardStrategy');

const ROOT = path.join(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports');
const STAKE_K = 1000;
const PAYOUT = 84;
const HOLD = 70;
const CONFIG = {
    id: 'q10-n10-f1-s8-m0',
    minQualityScore: 10,
    minOpportunities: 10,
    topFamilies: 1,
    swapLimit: 8,
    minRiskScore: 0.1,
    minMargin: 0,
    priorStrengths: [60, 90, 120],
    conservativeZ: 1.28,
    reliabilityDays: 60,
    singleRegimeReliability: 0.5
};

function isDiagnosticReport(report) {
    return report?.options?.includeCandidateDiagnostics === true
        && report?.options?.target === HOLD
        && report?.errors?.length === 0
        && Array.isArray(report?.rows)
        && report.rows.length > 0
        && Array.isArray(report.rows[0].candidateDiagnostics);
}

function discoverReports() {
    const byYear = new Map();
    for (const filename of fs.readdirSync(REPORT_DIR)) {
        if (!filename.startsWith('research_true_pit_strategies_') || !filename.endsWith('.json')) continue;
        const fullPath = path.join(REPORT_DIR, filename);
        let report;
        try {
            report = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        } catch {
            continue;
        }
        if (!isDiagnosticReport(report)) continue;
        const startYear = String(report.options.startDate || '').slice(0, 4);
        const endYear = String(report.options.endDate || '').slice(0, 4);
        if (!/^20\d{2}$/.test(startYear) || startYear !== endYear) continue;
        const year = Number(startYear);
        const current = byYear.get(year);
        // A recent ad-hoc replay can contain only a few days. Prefer the
        // widest valid coverage for each year before preferring a finer step.
        const preference = report.options.dateStep === 1 ? 2 : 1;
        if (!current
            || report.rows.length > current.rows.length
            || (report.rows.length === current.rows.length && preference > current.preference)
            || (report.rows.length === current.rows.length
                && preference === current.preference
                && filename > current.filename)) {
            byYear.set(year, {
                year,
                filename,
                fullPath,
                preference,
                dateStep: report.options.dateStep,
                rows: report.rows.slice().sort((left, right) => left.date.localeCompare(right.date))
            });
        }
    }
    return byYear;
}

function createSummary(id) {
    return {
        id,
        days: 0,
        hits: 0,
        stakeK: 0,
        profitK: 0,
        longestWin: 0,
        longestLoss: 0,
        currentType: null,
        currentLength: 0,
        totalSwaps: 0
    };
}

function add(summary, actual, bets, swapCount = 0) {
    const hit = bets.includes(Number(actual));
    const stakeK = bets.length * STAKE_K;
    summary.days++;
    summary.hits += Number(hit);
    summary.stakeK += stakeK;
    summary.profitK += (hit ? STAKE_K * PAYOUT : 0) - stakeK;
    summary.totalSwaps += swapCount;
    const type = hit ? 'win' : 'loss';
    if (summary.currentType === type) summary.currentLength++;
    else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    if (hit) summary.longestWin = Math.max(summary.longestWin, summary.currentLength);
    else summary.longestLoss = Math.max(summary.longestLoss, summary.currentLength);
}

function finalize(summary) {
    const { currentType, currentLength, ...result } = summary;
    const hitRate = result.days ? result.hits / result.days : 0;
    return {
        ...result,
        hitRate,
        hitRateWilson95: wilsonInterval(result.hits, result.days),
        roi: result.stakeK ? result.profitK / result.stakeK : 0,
        averageSwaps: result.days ? result.totalSwaps / result.days : 0
    };
}

function wilsonInterval(successes, trials, z = 1.96) {
    if (!trials) return { lower: 0, upper: 0 };
    const rate = successes / trials;
    const z2 = z * z;
    const denominator = 1 + z2 / trials;
    const center = (rate + z2 / (2 * trials)) / denominator;
    const margin = z * Math.sqrt(
        (rate * (1 - rate) + z2 / (4 * trials)) / trials
    ) / denominator;
    return {
        lower: Math.max(0, center - margin),
        upper: Math.min(1, center + margin)
    };
}

function evaluateYear(rows, trainingRows) {
    const qualityMap = buildQualityMap(trainingRows, CONFIG);
    const candidate = createSummary('chainEvidenceScorecardHold70');
    const baseline = createSummary('chainSmallFirstHold70');
    let candidateOnly = 0;
    let baselineOnly = 0;
    for (const row of rows) {
        const baseBets = (row.strategies?.chainSmallFirst || []).map(Number);
        const prediction = refinePrediction(row, qualityMap, CONFIG);
        const candidateHit = prediction.betNumbers.includes(Number(row.actual));
        const baselineHit = baseBets.includes(Number(row.actual));
        candidateOnly += Number(candidateHit && !baselineHit);
        baselineOnly += Number(!candidateHit && baselineHit);
        add(candidate, row.actual, prediction.betNumbers, prediction.swaps.length);
        add(baseline, row.actual, baseBets);
    }
    const candidateResult = finalize(candidate);
    const baselineResult = finalize(baseline);
    return {
        candidate: candidateResult,
        baseline: baselineResult,
        deltaHits: candidateResult.hits - baselineResult.hits,
        deltaProfitK: candidateResult.profitK - baselineResult.profitK,
        paired: { candidateOnly, baselineOnly },
        qualityCohorts: qualityMap.size
    };
}

function pct(value) {
    return `${(100 * Number(value || 0)).toFixed(2)}%`;
}

function money(value) {
    return `${Number(value || 0).toLocaleString('vi-VN')}K`;
}

function markdown(report) {
    const lines = [
        '# Kiểm chứng từng năm: thang điểm chuỗi Hold70',
        '',
        '- Cấu hình được khóa từ nghiên cứu trước: `q10-n10-f1-s8-m0`.',
        '- Mỗi năm chỉ học chất lượng chuỗi từ các năm trước, không dùng kết quả của năm đang đánh giá.',
        '- Hold70, đánh 30 số; 1.000K/số; trúng nhận 84.000K.',
        '- Các năm có `step=10` là mẫu cố định khoảng 37 ngày/năm, không phải kết quả đầy đủ 365 ngày.',
        '',
        '| Năm | Mức kiểm tra | Baseline | Scorecard (Wilson 95%) | Δ hit | Profit scorecard | Δ profit | Chuỗi thua dài nhất | Swap TB |',
        '|---:|---|---:|---:|---:|---:|---:|---:|---:|'
    ];
    for (const item of report.years) {
        const interval = item.result.candidate.hitRateWilson95;
        lines.push(`| ${item.year} | ${item.dateStep === 1 ? 'đủ ngày' : `mẫu step=${item.dateStep}`} | ${item.result.baseline.hits}/${item.result.baseline.days} (${pct(item.result.baseline.hitRate)}) | ${item.result.candidate.hits}/${item.result.candidate.days} (${pct(item.result.candidate.hitRate)}; ${pct(interval.lower)}–${pct(interval.upper)}) | ${item.result.deltaHits >= 0 ? '+' : ''}${item.result.deltaHits} | ${money(item.result.candidate.profitK)} | ${money(item.result.deltaProfitK)} | ${item.result.candidate.longestLoss} | ${item.result.candidate.averageSwaps.toFixed(2)} |`);
    }
    lines.push(
        '',
        '## Kết luận',
        '',
        report.conclusion,
        '',
        '> Kết quả lấy mẫu dùng để kiểm tra độ ổn định theo chế độ thời gian. Không được nội suy trực tiếp thành lợi nhuận cả năm.'
    );
    return `${lines.join('\n')}\n`;
}

function main() {
    const byYear = discoverReports();
    const availableYears = [...byYear.keys()].sort((left, right) => left - right);
    const evaluationYears = availableYears.filter(year => year >= 2016);
    if (!evaluationYears.length) throw new Error('Không tìm thấy report candidate diagnostics để đánh giá.');
    const years = [];
    for (const year of evaluationYears) {
        const training = availableYears
            .filter(trainingYear => trainingYear < year)
            .flatMap(trainingYear => byYear.get(trainingYear).rows);
        if (!training.length) continue;
        const source = byYear.get(year);
        years.push({
            year,
            dateStep: source.dateStep,
            source: source.filename,
            trainingYears: availableYears.filter(trainingYear => trainingYear < year),
            trainingRows: training.length,
            result: evaluateYear(source.rows, training)
        });
    }
    const improved = years.filter(item => item.result.deltaHits > 0).length;
    const degraded = years.filter(item => item.result.deltaHits < 0).length;
    const flat = years.length - improved - degraded;
    const totalDeltaHits = years.reduce((sum, item) => sum + item.result.deltaHits, 0);
    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'annual-expanding-window-strict-pit-v1',
        status: 'research-only',
        config: CONFIG,
        availableYears,
        years,
        stability: { improved, degraded, flat, totalDeltaHits }
    };
    report.summariesByWindow = Object.fromEntries(years.map(item => [String(item.year), {
        chainSmallFirstHold70: {
            ...item.result.baseline,
            betCount: 30,
            target: HOLD,
            hold: HOLD
        },
        chainEvidenceScorecardHold70: {
            ...item.result.candidate,
            betCount: 30,
            target: HOLD,
            hold: HOLD
        }
    }]));
    report.conclusion = improved > degraded && totalDeltaHits > 0
        ? `Scorecard cải thiện ở ${improved}/${years.length} năm, giảm ở ${degraded}, hòa ${flat}; tổng chênh lệch ${totalDeltaHits >= 0 ? '+' : ''}${totalDeltaHits} hit. Vẫn cần kiểm tra đủ ngày ở các năm cũ trước khi dùng production.`
        : `Scorecard chưa ổn định: cải thiện ${improved}/${years.length} năm, giảm ${degraded}, hòa ${flat}; tổng chênh lệch ${totalDeltaHits >= 0 ? '+' : ''}${totalDeltaHits} hit. Không nên đưa vào production.`;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonFile = path.join(REPORT_DIR, `chain-scorecard-yearly-${stamp}.json`);
    const mdFile = path.join(REPORT_DIR, `chain-scorecard-yearly-${stamp}.md`);
    fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2));
    fs.writeFileSync(mdFile, markdown(report));
    console.log(JSON.stringify({ jsonFile, mdFile, stability: report.stability, years: years.map(item => ({ year: item.year, dateStep: item.dateStep, result: item.result })) }, null, 2));
}

if (require.main === module) main();

module.exports = { CONFIG, discoverReports, evaluateYear, wilsonInterval };
