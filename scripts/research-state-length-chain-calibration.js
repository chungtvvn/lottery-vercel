#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
    fitStateLengthModel,
    refineBaselinePrediction
} = require('../lib/research/stateLengthChainCalibrator');
const {
    exactMcNemarPValue,
    wilsonInterval
} = require('./research-hierarchical-chain-calibration');

const BET_PER_NUMBER_K = 1000;
const WIN_MULTIPLIER = 84;

function parseArgs(argv = process.argv.slice(2)) {
    const args = new Map(argv.map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        diagnostics2024: args.get('diagnostics2024'),
        diagnostics2025: args.get('diagnostics2025'),
        diagnostics2026: args.get('diagnostics2026'),
        baselines: args.get('baselines')
    };
}

function readPayload(filename) {
    return JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'));
}

function loadBaselineMap(filenames) {
    const rows = new Map();
    for (const filename of String(filenames || '').split(',').map(value => value.trim()).filter(Boolean)) {
        for (const row of readPayload(filename).rows || []) {
            const chainSmallFirst = row.strategies?.chainSmallFirst;
            if (!Array.isArray(chainSmallFirst) || chainSmallFirst.length !== 30) continue;
            rows.set(row.date, {
                actual: Number(row.actual),
                chainSmallFirst: chainSmallFirst.map(Number).sort((left, right) => left - right)
            });
        }
    }
    return rows;
}

function loadDiagnosticRows(filename, baselineMap) {
    return (readPayload(filename).rows || []).map(row => {
        const baseline = baselineMap.get(row.date);
        if (!baseline) throw new Error(`Thiếu dàn chainSmallFirst strict PIT tại ${row.date}.`);
        if (baseline.actual !== Number(row.actual)) throw new Error(`Kết quả lệch tại ${row.date}.`);
        if (!Array.isArray(row.candidateDiagnostics) || row.candidateDiagnostics.length === 0) {
            throw new Error(`Thiếu candidateDiagnostics tại ${row.date}.`);
        }
        return {
            ...row,
            actual: Number(row.actual),
            strategies: { ...row.strategies, chainSmallFirst: baseline.chainSmallFirst }
        };
    }).sort((left, right) => left.date.localeCompare(right.date));
}

function configs() {
    const rows = [];
    for (const prior of [12, 24, 40]) {
        for (const minDays of [5, 8, 12]) {
            for (const minConfidence of [0.7, 0.8, 0.9]) {
                for (const topFamilies of [1, 2]) {
                    for (const swapLimit of [1, 2, 3]) {
                        rows.push({
                            id: `state-len-p${prior}-d${minDays}-c${minConfidence}-f${topFamilies}-s${swapLimit}`,
                            priorStrengths: [prior, prior * 1.4, prior * 2, prior * 2.8],
                            minDays,
                            minConfidence,
                            reliabilityDays: 20,
                            topFamilies,
                            swapLimit,
                            minMargin: 0
                        });
                    }
                }
            }
        }
    }
    return rows;
}

function createSummary(id) {
    return {
        id,
        days: 0,
        wins: 0,
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

function addResult(summary, row, betNumbers, swaps = []) {
    const win = betNumbers.includes(Number(row.actual));
    const profitK = (win ? BET_PER_NUMBER_K * WIN_MULTIPLIER : 0) -
        betNumbers.length * BET_PER_NUMBER_K;
    const type = win ? 'win' : 'loss';
    summary.days++;
    summary.wins += Number(win);
    summary.stakeK += betNumbers.length * BET_PER_NUMBER_K;
    summary.profitK += profitK;
    summary.totalSwaps += swaps.length;
    if (summary.currentType === type) summary.currentLength++;
    else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    summary.longestWin = Math.max(summary.longestWin, win ? summary.currentLength : 0);
    summary.longestLoss = Math.max(summary.longestLoss, win ? 0 : summary.currentLength);
    summary.rows.push({
        date: row.date,
        actual: Number(row.actual),
        win,
        profitK,
        betNumbers,
        swaps
    });
}

function finalize(summary) {
    const { currentType, currentLength, ...result } = summary;
    return {
        ...result,
        losses: result.days - result.wins,
        hitRate: result.days ? result.wins / result.days : 0,
        roi: result.stakeK ? result.profitK / result.stakeK : 0,
        averageSwaps: result.days ? result.totalSwaps / result.days : 0
    };
}

function evaluate(rows, model, config) {
    const summary = createSummary(config.id);
    for (const row of rows) {
        const prediction = refineBaselinePrediction(row, model, config);
        addResult(summary, row, prediction.betNumbers, prediction.swaps);
    }
    return finalize(summary);
}

function evaluateBaseline(rows) {
    const summary = createSummary('chainSmallFirstHold70');
    for (const row of rows) {
        addResult(summary, row, row.strategies.chainSmallFirst.map(Number));
    }
    return finalize(summary);
}

function compact(summary) {
    const { rows, ...result } = summary;
    return result;
}

function delta(candidate, baseline) {
    return {
        wins: candidate.wins - baseline.wins,
        hitRate: candidate.hitRate - baseline.hitRate,
        profitK: candidate.profitK - baseline.profitK,
        longestLoss: candidate.longestLoss - baseline.longestLoss
    };
}

function pairedComparison(candidate, baseline) {
    const baselineByDate = new Map(baseline.rows.map(row => [row.date, row]));
    let bothWin = 0;
    let bothLoss = 0;
    let candidateOnly = 0;
    let baselineOnly = 0;
    for (const row of candidate.rows) {
        const other = baselineByDate.get(row.date);
        if (!other) continue;
        if (row.win && other.win) bothWin++;
        else if (!row.win && !other.win) bothLoss++;
        else if (row.win) candidateOnly++;
        else baselineOnly++;
    }
    return {
        bothWin,
        bothLoss,
        candidateOnly,
        baselineOnly,
        netAdditionalWins: candidateOnly - baselineOnly,
        exactMcNemarPValue: exactMcNemarPValue(candidateOnly, baselineOnly)
    };
}

function summarizeMonths(rows) {
    const groups = new Map();
    for (const row of rows) {
        const month = row.date.slice(0, 7);
        if (!groups.has(month)) groups.set(month, { month, days: 0, wins: 0, profitK: 0 });
        const current = groups.get(month);
        current.days++;
        current.wins += Number(row.win);
        current.profitK += row.profitK;
    }
    return [...groups.values()].map(row => ({ ...row, hitRate: row.wins / row.days }));
}

function renderMarkdown(report) {
    const pct = value => `${(Number(value || 0) * 100).toFixed(2)}%`;
    const money = value => `${Number(value || 0).toLocaleString('vi-VN')}K`;
    return [
        '# State-length Bayes cho active/potential chains',
        '',
        '## Thiết kế',
        '',
        '- Candidate được sinh strict point-in-time từ raw prefix trước ngày dự đoán.',
        '- Một scope family/pattern/state/độ dài/kỷ lục/độ rộng chỉ đóng góp một Bernoulli mỗi ngày.',
        '- Potential được học từ cơ hội xuất hiện thực tế từng ngày, không suy diễn từ cumulative streak.',
        '- 2024–2025 chọn cấu hình; 2026 chỉ dùng đánh giá sau khi khóa.',
        `- Đã thử ${report.selection.configsTried} cấu hình; p hiệu chỉnh Bonferroni tham khảo = ${report.holdout.bonferroniPValue.toFixed(6)}.`,
        '',
        '## Fold lựa chọn',
        '',
        '| Giai đoạn | Nền | Candidate | Δ trúng | Δ profit |',
        '|---|---:|---:|---:|---:|',
        ...report.selected.folds.map(fold =>
            `| ${fold.period} | ${fold.baseline.wins}/${fold.baseline.days} | ${fold.candidate.wins}/${fold.candidate.days} | ${fold.delta.wins >= 0 ? '+' : ''}${fold.delta.wins} | ${money(fold.delta.profitK)} |`
        ),
        '',
        `Cấu hình khóa: **${report.selected.config.id}**.`,
        '',
        '## Holdout 2026',
        '',
        '| Phương pháp | Trúng | Tỷ lệ | Profit | ROI | Thua dài nhất |',
        '|---|---:|---:|---:|---:|---:|',
        `| Chuỗi nhỏ Hold 70 | ${report.holdout.baseline.wins}/${report.holdout.baseline.days} | ${pct(report.holdout.baseline.hitRate)} | ${money(report.holdout.baseline.profitK)} | ${pct(report.holdout.baseline.roi)} | ${report.holdout.baseline.longestLoss} |`,
        `| State-length Bayes | ${report.holdout.candidate.wins}/${report.holdout.candidate.days} | ${pct(report.holdout.candidate.hitRate)} | ${money(report.holdout.candidate.profitK)} | ${pct(report.holdout.candidate.roi)} | ${report.holdout.candidate.longestLoss} |`,
        '',
        `- McNemar p: ${report.holdout.pairedComparison.exactMcNemarPValue.toFixed(6)}.`,
        `- Wilson candidate: ${pct(report.holdout.candidateHitRate95.lower)}–${pct(report.holdout.candidateHitRate95.upper)}.`,
        `- Kết luận: **${report.promotionDecision}**.`,
        '',
        '## Theo tháng 2026',
        '',
        '| Tháng | Trúng | Tỷ lệ | Profit |',
        '|---|---:|---:|---:|',
        ...report.holdout.candidateMonths.map(row =>
            `| ${row.month} | ${row.wins}/${row.days} | ${pct(row.hitRate)} | ${money(row.profitK)} |`
        ),
        '',
        report.conclusion,
        ''
    ].join('\n');
}

function main() {
    const options = parseArgs();
    for (const key of ['diagnostics2024', 'diagnostics2025', 'diagnostics2026', 'baselines']) {
        if (!options[key]) throw new Error(`Thiếu --${key}.`);
    }
    const baselineMap = loadBaselineMap(options.baselines);
    const rows2024 = loadDiagnosticRows(options.diagnostics2024, baselineMap);
    const rows2025 = loadDiagnosticRows(options.diagnostics2025, baselineMap);
    const rows2026 = loadDiagnosticRows(options.diagnostics2026, baselineMap);
    const split = Math.floor(rows2024.length * 2 / 3);
    const early2024 = rows2024.slice(0, split);
    const late2024 = rows2024.slice(split);
    const candidates = configs();
    const modelCache = new Map();
    const getModel = (label, rows, config) => {
        const key = `${label}|${config.priorStrengths.join(',')}`;
        if (!modelCache.has(key)) modelCache.set(key, fitStateLengthModel(rows, config));
        return modelCache.get(key);
    };
    const selection = candidates.map(config => {
        const folds = [
            { period: 'late-2024-sampled', train: early2024, test: late2024, label: 'early2024' },
            { period: '2025-sampled', train: rows2024, test: rows2025, label: 'all2024' }
        ].map(fold => {
            const baseline = evaluateBaseline(fold.test);
            const candidate = evaluate(fold.test, getModel(fold.label, fold.train, config), config);
            return {
                period: fold.period,
                baseline: compact(baseline),
                candidate: compact(candidate),
                delta: delta(candidate, baseline)
            };
        });
        return {
            config,
            folds,
            minimumWinDelta: Math.min(...folds.map(fold => fold.delta.wins)),
            totalWinDelta: folds.reduce((sum, fold) => sum + fold.delta.wins, 0),
            totalProfitDeltaK: folds.reduce((sum, fold) => sum + fold.delta.profitK, 0),
            maximumLossDelta: Math.max(...folds.map(fold => fold.delta.longestLoss))
        };
    }).sort((left, right) =>
        right.minimumWinDelta - left.minimumWinDelta
        || right.totalWinDelta - left.totalWinDelta
        || left.maximumLossDelta - right.maximumLossDelta
        || right.totalProfitDeltaK - left.totalProfitDeltaK
        || left.config.id.localeCompare(right.config.id)
    );
    const selected = selection[0];
    const finalModel = fitStateLengthModel([...rows2024, ...rows2025], selected.config);
    const holdoutBaseline = evaluateBaseline(rows2026);
    const holdoutCandidate = evaluate(rows2026, finalModel, selected.config);
    const paired = pairedComparison(holdoutCandidate, holdoutBaseline);
    const bonferroniPValue = Math.min(1, paired.exactMcNemarPValue * candidates.length);
    const stableSelection = selected.minimumWinDelta >= 0 && selected.totalWinDelta > 0;
    const strongHoldout = holdoutCandidate.wins > holdoutBaseline.wins &&
        holdoutCandidate.profitK > holdoutBaseline.profitK &&
        paired.exactMcNemarPValue < 0.05 &&
        holdoutCandidate.longestLoss <= Math.ceil(holdoutBaseline.longestLoss * 1.2);
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            method: 'Hierarchical Beta-Binomial by state, length, record state and set width',
            dailyUnit: 'One bounded observation per descriptor/day, averaged over unique exact number sets.',
            selection: 'Sampled 2024 folds and sampled 2025; configuration frozen before full 2026.',
            caveat: '2026 has been reused by previous research in this repository, so it is not a globally untouched holdout.'
        },
        economics: {
            betCount: 30,
            targetExcluded: 70,
            betPerNumberK: BET_PER_NUMBER_K,
            winMultiplier: WIN_MULTIPLIER,
            breakEvenHitRate: 30 / 84
        },
        coverage: {
            rows2024: [rows2024[0].date, rows2024.at(-1).date, rows2024.length],
            rows2025: [rows2025[0].date, rows2025.at(-1).date, rows2025.length],
            rows2026: [rows2026[0].date, rows2026.at(-1).date, rows2026.length]
        },
        selection: {
            configsTried: candidates.length,
            stableSelection,
            top: selection.slice(0, 20)
        },
        selected,
        holdout: {
            baseline: compact(holdoutBaseline),
            candidate: compact(holdoutCandidate),
            delta: delta(holdoutCandidate, holdoutBaseline),
            pairedComparison: paired,
            bonferroniPValue,
            baselineHitRate95: wilsonInterval(holdoutBaseline.wins, holdoutBaseline.days),
            candidateHitRate95: wilsonInterval(holdoutCandidate.wins, holdoutCandidate.days),
            candidateMonths: summarizeMonths(holdoutCandidate.rows)
        },
        promotionDecision: stableSelection && strongHoldout
            ? 'eligible-for-live-shadow-validation'
            : 'do-not-promote',
        conclusion: stableSelection && strongHoldout
            ? 'Đạt guardrail nội bộ; chỉ được chạy shadow bất biến vì 2026 không còn là holdout độc lập toàn cục.'
            : 'Không đạt đủ điều kiện ổn định và ý nghĩa thống kê để thay phương pháp production.'
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.resolve('reports', `research_state_length_chain_calibration_${stamp}.json`);
    const mdPath = path.resolve('reports', `state-length-chain-calibration-${stamp}.md`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(mdPath, renderMarkdown(report));
    console.log(JSON.stringify({
        jsonPath,
        mdPath,
        coverage: report.coverage,
        configsTried: candidates.length,
        selected,
        holdout: report.holdout,
        promotionDecision: report.promotionDecision
    }, null, 2));
}

if (require.main === module) main();

module.exports = {
    configs,
    evaluate,
    evaluateBaseline,
    loadBaselineMap,
    loadDiagnosticRows,
    pairedComparison,
    renderMarkdown
};
