#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
    buildQualityMap,
    refinePrediction
} = require('../lib/research/chainScorecardStrategy');

const ROOT = path.join(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports');
const METHOD_ID = 'chainEvidenceScorecardHold70';
const STAKE_K = 1000;
const PAYOUT = 84;

const SOURCE_FILES = {
    2024: 'research_true_pit_strategies_2026-07-16T16-45-16-880Z.json',
    2025: 'research_true_pit_strategies_2026-07-16T16-45-36-355Z.json',
    2026: 'research_true_pit_strategies_2026-07-16T17-18-22-555Z.json'
};

function load(year) {
    const file = path.join(REPORT_DIR, SOURCE_FILES[year]);
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (report.options?.includeCandidateDiagnostics !== true || report.errors?.length) {
        throw new Error(`${file} không phải candidate replay strict hợp lệ.`);
    }
    return report.rows.slice().sort((left, right) => left.date.localeCompare(right.date));
}

function configs() {
    const result = [];
    for (const minQualityScore of [10, 20, 30, 40]) {
        for (const minOpportunities of [5, 10, 20]) {
            for (const topFamilies of [1, 2, 4]) {
                for (const swapLimit of [1, 2, 4, 8]) {
                    for (const minMargin of [0, 0.05, 0.1]) {
                        result.push({
                            id: `q${minQualityScore}-n${minOpportunities}-f${topFamilies}-s${swapLimit}-m${minMargin}`,
                            minQualityScore,
                            minOpportunities,
                            topFamilies,
                            swapLimit,
                            minRiskScore: minQualityScore / 100,
                            minMargin,
                            priorStrengths: [60, 90, 120],
                            conservativeZ: 1.28,
                            reliabilityDays: 60,
                            // Chỉ dùng cho model chọn cấu hình học từ 2024. Kết quả vẫn
                            // phải vượt validation 2025 trước khi được mở holdout 2026.
                            singleRegimeReliability: 0.5
                        });
                    }
                }
            }
        }
    }
    return result;
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
        totalSwaps: 0,
        rows: []
    };
}

function add(summary, row, bets, swaps = []) {
    const actual = Number(row.actual);
    const hit = bets.includes(actual);
    const stakeK = bets.length * STAKE_K;
    const profitK = (hit ? STAKE_K * PAYOUT : 0) - stakeK;
    const type = hit ? 'win' : 'loss';
    summary.days++;
    summary.hits += Number(hit);
    summary.stakeK += stakeK;
    summary.profitK += profitK;
    summary.totalSwaps += swaps.length;
    if (summary.currentType === type) summary.currentLength++;
    else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    if (hit) summary.longestWin = Math.max(summary.longestWin, summary.currentLength);
    else summary.longestLoss = Math.max(summary.longestLoss, summary.currentLength);
    summary.rows.push({ date: row.date, actual, bets, hit, profitK, swaps });
}

function finalize(summary) {
    const { currentType, currentLength, ...result } = summary;
    result.hitRate = result.days ? result.hits / result.days : 0;
    result.roi = result.stakeK ? result.profitK / result.stakeK : 0;
    result.averageSwaps = result.days ? result.totalSwaps / result.days : 0;
    return result;
}

function evaluate(rows, qualityMap, config) {
    const summary = createSummary(METHOD_ID);
    for (const row of rows) {
        const prediction = refinePrediction(row, qualityMap, config);
        add(summary, row, prediction.betNumbers, prediction.swaps);
    }
    return finalize(summary);
}

function baseline(rows) {
    const summary = createSummary('chainSmallFirstHold70');
    for (const row of rows) add(summary, row, row.strategies.chainSmallFirst.map(Number));
    return finalize(summary);
}

function compact(summary) {
    const { rows, ...result } = summary;
    return result;
}

function paired(candidate, base) {
    const byDate = new Map(base.rows.map(row => [row.date, row]));
    const result = { bothHit: 0, bothMiss: 0, candidateOnly: 0, baselineOnly: 0 };
    for (const row of candidate.rows) {
        const other = byDate.get(row.date);
        if (row.hit && other?.hit) result.bothHit++;
        else if (!row.hit && !other?.hit) result.bothMiss++;
        else if (row.hit) result.candidateOnly++;
        else result.baselineOnly++;
    }
    return result;
}

function months(rows) {
    const grouped = new Map();
    for (const row of rows) {
        const month = row.date.slice(0, 7);
        if (!grouped.has(month)) grouped.set(month, []);
        grouped.get(month).push(row);
    }
    return [...grouped.entries()].map(([month, values]) => ({
        month,
        days: values.length,
        hits: values.filter(row => row.hit).length,
        hitRate: values.filter(row => row.hit).length / values.length,
        profitK: values.reduce((sum, row) => sum + row.profitK, 0)
    }));
}

function pct(value) {
    return `${(100 * Number(value || 0)).toFixed(2)}%`;
}

function money(value) {
    return `${Number(value || 0).toLocaleString('vi-VN')}K`;
}

function markdown(report) {
    const lines = [
        '# Phương pháp Đề loại trừ theo thang điểm chuỗi',
        '',
        '- Hold70, đánh 30 số, 1.000K/số, ăn 84; hòa vốn 35,71%.',
        '- Điểm chuỗi = credible edge × độ tin cậy mẫu × độ ổn định năm.',
        '- Chuỗi cùng tập/họ được khử trùng; mỗi họ chỉ giữ bằng chứng mạnh nhất.',
        '- Cấu hình chọn trên 2025 từ model học 2024; khóa trước holdout 2026.',
        '',
        `Cấu hình được chọn: \`${report.selected.config.id}\`.`,
        '',
        '| Giai đoạn | Baseline | Scorecard | Δ hit | Δ profit |',
        '|---|---:|---:|---:|---:|',
        `| Validation 2025 (mẫu 10 ngày) | ${report.validation.baseline.hits}/${report.validation.baseline.days} (${pct(report.validation.baseline.hitRate)}) | ${report.validation.candidate.hits}/${report.validation.candidate.days} (${pct(report.validation.candidate.hitRate)}) | ${report.validation.deltaHits >= 0 ? '+' : ''}${report.validation.deltaHits} | ${money(report.validation.deltaProfitK)} |`,
        `| Holdout 2026 | ${report.holdout.baseline.hits}/${report.holdout.baseline.days} (${pct(report.holdout.baseline.hitRate)}) | ${report.holdout.candidate.hits}/${report.holdout.candidate.days} (${pct(report.holdout.candidate.hitRate)}) | ${report.holdout.deltaHits >= 0 ? '+' : ''}${report.holdout.deltaHits} | ${money(report.holdout.deltaProfitK)} |`,
        '',
        '## Theo tháng holdout', '',
        '| Tháng | Ngày | Trúng | Tỷ lệ | Profit |',
        '|---|---:|---:|---:|---:|'
    ];
    for (const row of report.holdout.monthly) {
        lines.push(`| ${row.month} | ${row.days} | ${row.hits} | ${pct(row.hitRate)} | ${money(row.profitK)} |`);
    }
    lines.push('', '## Quyết định', '', `**${report.promotionDecision}**`, '', report.conclusion,
        '', '> Dữ liệu validation 2024–2025 chỉ lấy mẫu 10 ngày một lần; kết quả chưa đủ để bảo đảm lợi nhuận tương lai.');
    return `${lines.join('\n')}\n`;
}

function main() {
    const rows2024 = load(2024);
    const rows2025 = load(2025);
    const rows2026 = load(2026);
    const validationBaseline = baseline(rows2025);
    const selectionQualityMap = buildQualityMap(rows2024, configs()[0]);
    const selection = configs().map(config => {
        const candidate = evaluate(rows2025, selectionQualityMap, config);
        return {
            config,
            candidate: compact(candidate),
            deltaHits: candidate.hits - validationBaseline.hits,
            deltaProfitK: candidate.profitK - validationBaseline.profitK
        };
    }).sort((left, right) =>
        right.deltaHits - left.deltaHits
        || right.deltaProfitK - left.deltaProfitK
        || left.candidate.longestLoss - right.candidate.longestLoss
        || left.config.id.localeCompare(right.config.id)
    );
    const selected = selection[0];
    const finalQualityMap = buildQualityMap([...rows2024, ...rows2025], selected.config);
    const holdoutCandidate = evaluate(rows2026, finalQualityMap, selected.config);
    const holdoutBaseline = baseline(rows2026);
    const report = {
        generatedAt: new Date().toISOString(),
        methodId: METHOD_ID,
        methodologyVersion: 'strict-prefix-point-in-time-v1',
        status: 'research-only',
        sources: SOURCE_FILES,
        selected,
        validation: {
            baseline: compact(validationBaseline),
            candidate: selected.candidate,
            deltaHits: selected.deltaHits,
            deltaProfitK: selected.deltaProfitK
        },
        holdout: {
            baseline: compact(holdoutBaseline),
            candidate: compact(holdoutCandidate),
            deltaHits: holdoutCandidate.hits - holdoutBaseline.hits,
            deltaProfitK: holdoutCandidate.profitK - holdoutBaseline.profitK,
            paired: paired(holdoutCandidate, holdoutBaseline),
            monthly: months(holdoutCandidate.rows)
        },
        topQualityCohorts: [...finalQualityMap.values()]
            .sort((left, right) => right.qualityScore - left.qualityScore || right.opportunities - left.opportunities)
            .slice(0, 50),
        selectionSensitivity: selection.slice(0, 30)
    };
    const passes = report.validation.deltaHits >= 0
        && report.holdout.deltaHits > 0
        && report.holdout.candidate.profitK > report.holdout.baseline.profitK
        && report.holdout.candidate.longestLoss <= Math.ceil(report.holdout.baseline.longestLoss * 1.2);
    report.promotionDecision = passes ? 'eligible-for-further-independent-validation' : 'do-not-promote';
    report.conclusion = passes
        ? 'Phương pháp vượt baseline ở holdout nhưng vẫn chỉ được theo dõi shadow vì validation trước holdout quá thưa.'
        : 'Phương pháp chưa vượt baseline ổn định. Giữ research-only và không sửa snapshot production.';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonFile = path.join(REPORT_DIR, `chain-scorecard-hold70-${stamp}.json`);
    const mdFile = path.join(REPORT_DIR, `chain-scorecard-hold70-${stamp}.md`);
    fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2));
    fs.writeFileSync(mdFile, markdown(report));
    console.log(JSON.stringify({ jsonFile, mdFile, selected, holdout: report.holdout, promotionDecision: report.promotionDecision }, null, 2));
}

main();
