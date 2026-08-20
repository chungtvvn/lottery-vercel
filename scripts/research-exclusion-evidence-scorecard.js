#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
    buildMethodWeights,
    buildSimilarityMatrix,
    collectMethodStats,
    predict,
    settle
} = require('../lib/research/exclusionEvidenceScorecard');
const {
    fitReliabilityModel
} = require('../lib/research/chainReliabilityRanker');

const ROOT = path.join(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports');
const STRICT_VERSION = 'strict-prefix-point-in-time-v1';
const BET_COUNT = 30;
const STAKE_K = 1000;
const PAYOUT = 84;

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function chooseStrictReport(startDate, endDate) {
    const candidates = fs.readdirSync(REPORT_DIR)
        .filter(file => /^research_true_pit_strategies_.*\.json$/.test(file))
        .map(file => ({ file, report: readJson(path.join(REPORT_DIR, file)) }))
        .filter(item => {
            const options = item.report.options || {};
            return item.report.methodologyVersion === STRICT_VERSION
                && item.report.errors?.length === 0
                && options.startDate === startDate
                && options.endDate === endDate
                && Number(options.dateStep) === 1
                && Number(options.target) === 70
                && Array.isArray(item.report.rows);
        })
        .sort((left, right) => String(left.report.generatedAt).localeCompare(String(right.report.generatedAt)));
    if (!candidates.length) throw new Error(`Thiếu strict report ${startDate} -> ${endDate}`);
    return candidates.at(-1);
}

function loadStrictRows() {
    const auditFile = path.join(REPORT_DIR, 'strict_pit_all_methods_2016_2026.json');
    if (fs.existsSync(auditFile)) {
        const audit = readJson(auditFile);
        const selected = (audit.audit?.strictReports || [])
            .map(item => item.file)
            .filter(Boolean);
        if (selected.length >= 11) {
            const rows = selected.flatMap(file => readJson(path.join(REPORT_DIR, file)).rows || []);
            return {
                sources: selected,
                rows: [...new Map(rows.map(row => [row.date, row])).values()]
                    .sort((left, right) => left.date.localeCompare(right.date))
            };
        }
    }
    const sources = [];
    const rows = [];
    for (let year = 2016; year <= 2025; year++) {
        const selected = chooseStrictReport(`${year}-01-01`, `${year}-12-31`);
        sources.push(selected.file);
        rows.push(...selected.report.rows);
    }
    const selected2026 = chooseStrictReport('2026-01-01', '2026-07-10');
    sources.push(selected2026.file);
    rows.push(...selected2026.report.rows);
    return {
        sources,
        rows: [...new Map(rows.map(row => [row.date, row])).values()]
            .sort((left, right) => left.date.localeCompare(right.date))
    };
}

let diagnosticCache = null;

function diagnosticReports() {
    if (diagnosticCache) return diagnosticCache;
    diagnosticCache = new Map();
    const files = [
        'research_true_pit_strategies_2026-07-16T16-45-16-880Z.json',
        'research_true_pit_strategies_2026-07-16T16-45-36-355Z.json',
        'research_true_pit_strategies_2026-07-16T17-18-22-555Z.json'
    ].filter(file => fs.existsSync(path.join(REPORT_DIR, file)));
    for (const file of files) {
        const report = readJson(path.join(REPORT_DIR, file));
        const year = Number(String(report.options?.startDate || '').slice(0, 4));
        if (year) diagnosticCache.set(year, { file, report });
    }
    return diagnosticCache;
}

function diagnosticReport(year) {
    return diagnosticReports().get(year) || null;
}

function configs() {
    const result = [];
    for (const priorStrength of [100, 300, 600]) {
        for (const conservativeZ of [0, 0.67, 1.28]) {
            for (const temperature of [0.01, 0.025, 0.05]) {
                for (const similarityPenalty of [0, 0.75, 1.5]) {
                    for (const maxExperts of [3, 5, 8, 13]) {
                        result.push({
                            id: `p${priorStrength}-z${conservativeZ}-t${temperature}-r${similarityPenalty}-e${maxExperts}`,
                            priorMean: 0.3,
                            priorStrength,
                            conservativeZ,
                            temperature,
                            similarityPenalty,
                            maxExperts
                        });
                    }
                }
            }
        }
    }
    return result;
}

function compact(summary) {
    const { rows, ...result } = summary;
    return result;
}

function evaluateFrozen(trainRows, evaluateRows, methodIds, config) {
    const weights = buildMethodWeights(trainRows, methodIds, config);
    return {
        weights,
        summary: settle(
            evaluateRows,
            row => predict(row, weights, BET_COUNT),
            { stakePerNumberK: STAKE_K, winMultiplier: PAYOUT }
        )
    };
}

function evaluateWalkForward(rows, startYear, endYear, methodIds, config) {
    const daily = [];
    const annualModels = [];
    for (let year = startYear; year <= endYear; year++) {
        const train = rows.filter(row => row.date < `${year}-01-01`);
        const evaluate = rows.filter(row => row.date >= `${year}-01-01` && row.date <= `${year}-12-31`);
        if (!train.length || !evaluate.length) continue;
        const result = evaluateFrozen(train, evaluate, methodIds, config);
        daily.push(...result.summary.rows);
        annualModels.push({
            year,
            trainDays: train.length,
            evaluationDays: evaluate.length,
            topWeights: result.weights.slice().sort((a, b) => b.normalizedWeight - a.normalizedWeight).slice(0, 8)
        });
    }
    const synthetic = daily.map(row => ({
        date: row.date,
        actual: row.actual,
        strategies: { candidate: row.bets }
    }));
    return {
        annualModels,
        summary: settle(synthetic, row => row.strategies.candidate, {
            stakePerNumberK: STAKE_K,
            winMultiplier: PAYOUT
        })
    };
}

function summarizeYears(rows) {
    const groups = new Map();
    for (const row of rows) {
        const year = row.date.slice(0, 4);
        if (!groups.has(year)) groups.set(year, []);
        groups.get(year).push(row);
    }
    return [...groups.entries()].map(([year, values]) => {
        const synthetic = values.map(row => ({
            date: row.date,
            actual: row.actual,
            strategies: { candidate: row.bets }
        }));
        return { year, ...compact(settle(synthetic, row => row.strategies.candidate, {
            stakePerNumberK: STAKE_K,
            winMultiplier: PAYOUT
        })) };
    });
}

function chainScorecard() {
    const reports = [2024, 2025].map(diagnosticReport).filter(Boolean);
    const rows = reports.flatMap(item => item.report.rows || []);
    const model = fitReliabilityModel(rows, { priorStrengths: [60, 90, 120] });
    const byYear = new Map();
    for (const year of [2024, 2025]) {
        const report = diagnosticReport(year);
        if (report) byYear.set(year, fitReliabilityModel(report.report.rows || [], {
            priorStrengths: [60, 90, 120]
        }));
    }
    const scores = [...model.values()].map(entry => {
        const variance = Number(entry.variance || 0);
        const conservativeRate = Math.max(0, entry.posteriorExclusionRate - 1.28 * Math.sqrt(variance));
        const conservativeEdge = conservativeRate - entry.baseline;
        const reliability = Math.sqrt(entry.opportunities / (entry.opportunities + 60));
        const yearlyEdges = [...byYear.values()].map(yearModel => {
            const row = yearModel.get(entry.id);
            return row ? row.posteriorExclusionRate - row.baseline : null;
        }).filter(value => value !== null);
        const positiveYears = yearlyEdges.filter(value => value > 0).length;
        const stability = yearlyEdges.length ? positiveYears / yearlyEdges.length : 0;
        const credibleStrength = Math.max(0, Math.min(1, conservativeEdge / 0.05));
        const regimeReliability = yearlyEdges.length >= 2
            ? (0.5 + 0.5 * stability)
            : 0.2;
        // Các thành phần được nhân thay vì cộng: cohort ít ngày hoặc chỉ xuất hiện
        // trong một năm không thể lấy edge lớn do nhiễu để đạt điểm cao.
        const qualityScore = Math.round(
            100 * credibleStrength * reliability * regimeReliability
        );
        const qualityGrade = qualityScore >= 60 ? 'A'
            : qualityScore >= 40 ? 'B'
                : qualityScore >= 20 ? 'C' : 'D';
        return {
            id: entry.id,
            opportunities: entry.opportunities,
            baseline: entry.baseline,
            rawExclusionRate: entry.rawExclusionRate,
            posteriorExclusionRate: entry.posteriorExclusionRate,
            conservativeRate,
            conservativeEdge,
            reliability,
            positiveYears,
            evaluatedYears: yearlyEdges.length,
            stability,
            qualityScore,
            qualityGrade
        };
    }).sort((left, right) =>
        right.qualityScore - left.qualityScore
        || right.conservativeEdge - left.conservativeEdge
        || right.opportunities - left.opportunities
    );
    return {
        sources: reports.map(item => item.file),
        trainingDays: rows.length,
        scoreDefinition: {
            formula: '100 * credibleStrength * sampleReliability * regimeReliability.',
            credibleEdge: 'credibleStrength = min(1, max(0, credibleEdge) / 5%).',
            sampleReliability: 'sampleReliability = sqrt(n/(n+60)), dùng số ngày cơ hội thay vì đếm candidate tương quan.',
            yearStability: 'regimeReliability = 0,5 + 0,5 * tỷ lệ năm có edge dương; cohort chỉ có một năm bị giới hạn ở 0,2.',
            safeguards: 'Partial pooling trạng thái -> họ -> pattern; exact-set/family dedupe được áp dụng lúc xếp số.'
        },
        scores
    };
}

function pct(value) {
    return `${(100 * Number(value || 0)).toFixed(2)}%`;
}

function money(value) {
    return `${Number(value || 0).toLocaleString('vi-VN')}K`;
}

function renderMarkdown(report) {
    const lines = [
        '# Scorecard phương pháp và chuỗi loại trừ',
        '',
        '## Nguyên tắc',
        '',
        '- Tất cả dòng đánh giá là strict point-in-time; report fast/full-history bị loại.',
        '- Phương pháp được chấm bằng posterior hit rate, cận bảo thủ, độ ổn định theo năm và phạt mức trùng dàn bằng Jaccard.',
        '- Chuỗi được chấm bằng credible edge so với xác suất nền của đúng tập số, cỡ mẫu theo ngày và độ ổn định qua năm.',
        '- Giữ đúng Hold70: đánh 30 số, 1.000K/số, ăn 84; hòa vốn 35,71%.',
        '',
        '## Cấu hình được chọn trước test',
        '',
        `Cấu hình: \`${report.selected.config.id}\`. Chọn trên 2021-2023, không dùng 2024-2026 để chọn.`,
        '',
        '| Giai đoạn | Ngày | Trúng | Tỷ lệ | Profit | ROI | Thua dài nhất |',
        '|---|---:|---:|---:|---:|---:|---:|'
    ];
    for (const row of [report.test, report.holdout]) {
        lines.push(`| ${row.period} | ${row.summary.days} | ${row.summary.hits} | ${pct(row.summary.hitRate)} | ${money(row.summary.profitK)} | ${pct(row.summary.roi)} | ${row.summary.longestLoss} |`);
    }
    lines.push('', '## So với baseline tốt nhất cùng giai đoạn', '',
        '| Giai đoạn | Candidate | Baseline | Δ trúng | Δ profit |',
        '|---|---:|---:|---:|---:|',
        `| 2024-2025 | ${report.test.summary.hits}/${report.test.summary.days} | ${report.test.baseline.methodId}: ${report.test.baseline.summary.hits}/${report.test.baseline.summary.days} | ${report.test.delta.hits >= 0 ? '+' : ''}${report.test.delta.hits} | ${money(report.test.delta.profitK)} |`,
        `| 2026 | ${report.holdout.summary.hits}/${report.holdout.summary.days} | ${report.holdout.baseline.methodId}: ${report.holdout.baseline.summary.hits}/${report.holdout.baseline.summary.days} | ${report.holdout.delta.hits >= 0 ? '+' : ''}${report.holdout.delta.hits} | ${money(report.holdout.delta.profitK)} |`,
        '', '## Điểm phương pháp dùng cho 2026', '',
        '| Phương pháp | Posterior | Cận bảo thủ | Edge | Năm dương | Trùng lặp | Trọng số |',
        '|---|---:|---:|---:|---:|---:|---:|');
    for (const method of report.holdout.methodWeights.slice().sort((a, b) => b.normalizedWeight - a.normalizedWeight)) {
        lines.push(`| ${method.methodId} | ${pct(method.posteriorHitRate)} | ${pct(method.conservativeHitRate)} | ${pct(method.conservativeEdge)} | ${method.profitableYears}/${method.years} | ${pct(method.redundancy)} | ${pct(method.normalizedWeight)} |`);
    }
    lines.push('', '## Chuỗi có điểm chất lượng cao nhất (học trước 2026)', '',
        '| Điểm | Hạng | Cohort | Ngày mẫu | Nền | Posterior | Cận bảo thủ | Edge bảo thủ | Ổn định |',
        '|---:|---:|---|---:|---:|---:|---:|---:|---:|');
    for (const chain of report.chainScorecard.scores.slice(0, 25)) {
        lines.push(`| ${chain.qualityScore} | ${chain.qualityGrade} | ${chain.id} | ${chain.opportunities} | ${pct(chain.baseline)} | ${pct(chain.posteriorExclusionRate)} | ${pct(chain.conservativeRate)} | ${pct(chain.conservativeEdge)} | ${chain.positiveYears}/${chain.evaluatedYears} |`);
    }
    lines.push('', '## Quyết định', '', `**${report.promotionDecision}**`, '', report.conclusion,
        '', '> Score cao là bằng chứng lịch sử đã hiệu chỉnh, không phải xác suất chắc chắn hay bảo đảm lợi nhuận tương lai.');
    return `${lines.join('\n')}\n`;
}

function main() {
    const strict = loadStrictRows();
    const rows = strict.rows;
    const methodIds = Object.keys(rows[0]?.strategies || {}).filter(id => !id.startsWith('deParallel')).sort();
    const train = rows.filter(row => row.date <= '2020-12-31');
    const validation = rows.filter(row => row.date >= '2021-01-01' && row.date <= '2023-12-31');
    const testRows = rows.filter(row => row.date >= '2024-01-01' && row.date <= '2025-12-31');
    const holdoutRows = rows.filter(row => row.date >= '2026-01-01');
    const trainSimilarity = buildSimilarityMatrix(train, methodIds);
    const selected = configs().map(config => {
        const configured = { ...config, similarityMatrix: trainSimilarity };
        const result = evaluateFrozen(train, validation, methodIds, configured);
        return { config, summary: compact(result.summary) };
    }).sort((left, right) =>
        right.summary.profitK - left.summary.profitK
        || right.summary.hitRate - left.summary.hitRate
        || left.summary.longestLoss - right.summary.longestLoss
        || left.config.id.localeCompare(right.config.id)
    )[0];

    const test = evaluateWalkForward(rows, 2024, 2025, methodIds, selected.config);
    const preHoldoutRows = rows.filter(row => row.date <= '2025-12-31');
    const holdoutWeights = buildMethodWeights(
        preHoldoutRows,
        methodIds,
        { ...selected.config, similarityMatrix: buildSimilarityMatrix(preHoldoutRows, methodIds) }
    );
    const holdout = settle(holdoutRows, row => predict(row, holdoutWeights, BET_COUNT), {
        stakePerNumberK: STAKE_K,
        winMultiplier: PAYOUT
    });

    const baselineFor = periodRows => methodIds.map(methodId => ({
        methodId,
        summary: settle(periodRows, row => row.strategies[methodId], {
            stakePerNumberK: STAKE_K,
            winMultiplier: PAYOUT
        })
    })).sort((left, right) => right.summary.profitK - left.summary.profitK)[0];
    const testBaseline = baselineFor(testRows);
    const holdoutBaseline = baselineFor(holdoutRows);
    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: STRICT_VERSION,
        status: 'research-only',
        economics: { betCount: BET_COUNT, stakeK: STAKE_K, payout: PAYOUT, breakEvenHitRate: BET_COUNT / PAYOUT },
        coverage: {
            train: [train[0]?.date, train.at(-1)?.date, train.length],
            validation: [validation[0]?.date, validation.at(-1)?.date, validation.length],
            test: [testRows[0]?.date, testRows.at(-1)?.date, testRows.length],
            holdout: [holdoutRows[0]?.date, holdoutRows.at(-1)?.date, holdoutRows.length]
        },
        sources: strict.sources,
        selected,
        test: {
            period: '2024-2025 walk-forward',
            summary: compact(test.summary),
            yearly: summarizeYears(test.summary.rows),
            annualModels: test.annualModels,
            baseline: { methodId: testBaseline.methodId, summary: compact(testBaseline.summary) },
            delta: { hits: test.summary.hits - testBaseline.summary.hits, profitK: test.summary.profitK - testBaseline.summary.profitK }
        },
        holdout: {
            period: '2026 frozen holdout',
            summary: compact(holdout),
            yearly: summarizeYears(holdout.rows),
            methodWeights: holdoutWeights,
            baseline: { methodId: holdoutBaseline.methodId, summary: compact(holdoutBaseline.summary) },
            delta: { hits: holdout.hits - holdoutBaseline.summary.hits, profitK: holdout.profitK - holdoutBaseline.summary.profitK }
        },
        methodScorecard: collectMethodStats(rows.filter(row => row.date <= '2025-12-31'), methodIds, selected.config),
        chainScorecard: chainScorecard()
    };
    const improvesTest = report.test.delta.hits > 0 && report.test.delta.profitK > 0;
    const improvesHoldout = report.holdout.delta.hits > 0 && report.holdout.delta.profitK > 0;
    report.promotionDecision = improvesTest && improvesHoldout ? 'eligible-for-independent-confirmation' : 'do-not-promote';
    report.conclusion = improvesTest && improvesHoldout
        ? 'Scorecard vượt baseline tốt nhất ở cả test và holdout, nhưng vẫn cần một giai đoạn độc lập mới trước khi đổi production.'
        : 'Scorecard chưa vượt baseline tốt nhất ổn định ở cả hai chế độ. Giữ research-only; dùng bảng điểm chuỗi để giải thích và thu thập thêm bằng chứng, không ghi đè dự đoán đã phát hành.';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputJson = path.join(REPORT_DIR, `exclusion-evidence-scorecard-${stamp}.json`);
    const outputMarkdown = path.join(REPORT_DIR, `exclusion-evidence-scorecard-${stamp}.md`);
    fs.writeFileSync(outputJson, JSON.stringify(report, null, 2));
    fs.writeFileSync(outputMarkdown, renderMarkdown(report));
    console.log(JSON.stringify({
        outputJson,
        outputMarkdown,
        selected: selected.config,
        test: report.test,
        holdout: report.holdout,
        promotionDecision: report.promotionDecision,
        topChains: report.chainScorecard.scores.slice(0, 10)
    }, null, 2));
}

main();
