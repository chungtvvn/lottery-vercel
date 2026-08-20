#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
    fitReliabilityModel,
    refinePrediction
} = require('../lib/research/chainReliabilityRanker');

const METHOD_ID = 'hierarchicalReplayCredibleHold70';
const BET_PER_NUMBER_K = 1000;
const WIN_MULTIPLIER = 84;

function parseArgs(argv = process.argv.slice(2)) {
    const values = new Map(argv.map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        train2024: values.get('train2024'),
        validation2025: values.get('validation2025'),
        holdout2026: values.get('holdout2026')
    };
}

function loadRows(filenames) {
    const byDate = new Map();
    for (const filename of String(filenames || '').split(',').map(value => value.trim()).filter(Boolean)) {
        const absolute = path.resolve(filename);
        const payload = JSON.parse(fs.readFileSync(absolute, 'utf8'));
        if (payload.options?.includeCandidateDiagnostics !== true) {
            throw new Error(`${absolute} không phải report candidate diagnostics strict PIT.`);
        }
        for (const row of payload.rows || []) {
            if (!Array.isArray(row.candidateDiagnostics) || !row.candidateDiagnostics.length) {
                throw new Error(`${absolute} thiếu candidateDiagnostics tại ${row.date}.`);
            }
            if (!Array.isArray(row.strategies?.chainSmallFirst)) {
                throw new Error(`${absolute} thiếu dàn chainSmallFirst tại ${row.date}.`);
            }
            byDate.set(row.date, row);
        }
    }
    return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function configs() {
    const result = [];
    for (const minOpportunities of [10, 20]) {
        for (const conservativeZ of [0.67, 1.28]) {
            for (const swapLimit of [1, 2, 4]) {
                result.push({
                    id: `replay-m${minOpportunities}-z${conservativeZ}-s${swapLimit}`,
                    priorStrengths: [40, 60, 90],
                    minOpportunities,
                    conservativeZ,
                    minEdge: 0,
                    reliabilityDays: 40,
                    familyWeights: [1, 0.5, 0.25, 0.125],
                    swapLimit,
                    minSwapMargin: 0.001
                });
            }
        }
    }
    return result;
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
        activeSwapEvidence: 0,
        potentialSwapEvidence: 0,
        rows: []
    };
}

function settle(summary, row, betNumbers, swaps = [], scores = []) {
    const actual = Number(row.actual);
    const win = betNumbers.includes(actual);
    const stakeK = betNumbers.length * BET_PER_NUMBER_K;
    const profitK = (win ? BET_PER_NUMBER_K * WIN_MULTIPLIER : 0) - stakeK;
    const type = win ? 'win' : 'loss';
    summary.days++;
    summary.wins += Number(win);
    summary.stakeK += stakeK;
    summary.profitK += profitK;
    summary.totalSwaps += swaps.length;
    if (summary.currentType === type) summary.currentLength++;
    else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    summary.longestWin = Math.max(summary.longestWin, win ? summary.currentLength : 0);
    summary.longestLoss = Math.max(summary.longestLoss, win ? 0 : summary.currentLength);
    const scoreByNumber = new Map(scores.map(item => [item.number, item]));
    for (const swap of swaps) {
        const evidence = scoreByNumber.get(swap.out)?.topEvidence || [];
        summary.activeSwapEvidence += Number(evidence.some(item => item.state === 'active'));
        summary.potentialSwapEvidence += Number(evidence.some(item => item.state === 'potential'));
    }
    summary.rows.push({
        date: row.date,
        actual,
        win,
        stakeK,
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

function evaluateBaseline(rows) {
    const summary = createSummary('chainSmallFirstHold70');
    for (const row of rows) {
        settle(summary, row, row.strategies.chainSmallFirst.map(Number));
    }
    return finalize(summary);
}

function evaluate(rows, model, config) {
    const summary = createSummary(METHOD_ID);
    for (const row of rows) {
        const prediction = refinePrediction(row, model, config);
        settle(
            summary,
            row,
            prediction.betNumbers,
            prediction.swaps,
            prediction.scores
        );
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
    return [...groups.values()].map(row => ({
        ...row,
        hitRate: row.days ? row.wins / row.days : 0
    }));
}

function binomialCoefficient(n, k) {
    const selected = Math.min(k, n - k);
    let result = 1;
    for (let index = 1; index <= selected; index++) {
        result *= (n - selected + index) / index;
    }
    return result;
}

function pairedComparison(candidate, baseline) {
    const baselineByDate = new Map(baseline.rows.map(row => [row.date, row]));
    const result = { bothWin: 0, bothLoss: 0, candidateOnly: 0, baselineOnly: 0 };
    for (const row of candidate.rows) {
        const base = baselineByDate.get(row.date);
        if (!base) continue;
        if (row.win && base.win) result.bothWin++;
        else if (!row.win && !base.win) result.bothLoss++;
        else if (row.win) result.candidateOnly++;
        else result.baselineOnly++;
    }
    const discordant = result.candidateOnly + result.baselineOnly;
    const tail = Math.min(result.candidateOnly, result.baselineOnly);
    let probability = 0;
    for (let index = 0; index <= tail; index++) {
        probability += binomialCoefficient(discordant, index) * (0.5 ** discordant);
    }
    return {
        ...result,
        netAdditionalWins: result.candidateOnly - result.baselineOnly,
        exactMcNemarPValue: discordant ? Math.min(1, probability * 2) : 1
    };
}

function renderMarkdown(report) {
    const percent = value => `${(Number(value || 0) * 100).toFixed(2)}%`;
    const money = value => `${Number(value || 0).toLocaleString('vi-VN')}K`;
    const lines = [
        '# Xếp hạng độ tin cậy gãy/không hình thành bằng replay phân cấp',
        '',
        '## Thiết kế',
        '',
        '- Candidate từng ngày được sinh strict point-in-time; baseline năm khóa tại 31/12 năm trước.',
        '- Chuỗi active và potential được tách trạng thái. Potential chỉ học từ những ngày precursor thực sự xuất hiện trong replay.',
        '- Partial pooling theo trạng thái → kỷ lục → độ rộng → độ dài → họ → pattern.',
        '- Xác suất loại được co về xác suất nền của đúng tập số và trừ độ bất định trước khi dùng.',
        '- Tập số tương đương được khử trùng; mỗi họ chỉ đóng góp bằng chứng mạnh nhất.',
        '- Phương pháp chỉ hoán đổi vài số quanh `chainSmallFirst`, vẫn đánh đúng 30/100 số.',
        '',
        '## Chọn cấu hình trước holdout',
        '',
        `Cấu hình: \`${report.selected.config.id}\`.`,
        '',
        '| Giai đoạn | Nền | Reliability ranker | Δ trúng | Δ profit |',
        '|---|---:|---:|---:|---:|'
    ];
    for (const fold of report.selected.folds) {
        lines.push(
            `| ${fold.period} | ${fold.baseline.wins}/${fold.baseline.days} (${percent(fold.baseline.hitRate)}) | ` +
            `${fold.candidate.wins}/${fold.candidate.days} (${percent(fold.candidate.hitRate)}) | ` +
            `${fold.delta.wins >= 0 ? '+' : ''}${fold.delta.wins} | ${money(fold.delta.profitK)} |`
        );
    }
    const holdout = report.holdout;
    lines.push(
        '',
        '## Holdout 2026 chưa dùng để chọn cấu hình',
        '',
        '| Phương pháp | Trúng | Profit | ROI | Thua dài nhất |',
        '|---|---:|---:|---:|---:|',
        `| chainSmallFirst | ${holdout.baseline.wins}/${holdout.baseline.days} (${percent(holdout.baseline.hitRate)}) | ${money(holdout.baseline.profitK)} | ${percent(holdout.baseline.roi)} | ${holdout.baseline.longestLoss} |`,
        `| ${METHOD_ID} | ${holdout.candidate.wins}/${holdout.candidate.days} (${percent(holdout.candidate.hitRate)}) | ${money(holdout.candidate.profitK)} | ${percent(holdout.candidate.roi)} | ${holdout.candidate.longestLoss} |`,
        `| Chênh lệch | ${holdout.delta.wins >= 0 ? '+' : ''}${holdout.delta.wins} | ${money(holdout.delta.profitK)} | - | ${holdout.delta.longestLoss >= 0 ? '+' : ''}${holdout.delta.longestLoss} |`,
        '',
        `McNemar exact: p = ${holdout.pairedComparison.exactMcNemarPValue.toFixed(6)}.`,
        '',
        '## Theo tháng holdout',
        '',
        '| Tháng | Ngày | Trúng | Tỷ lệ | Profit |',
        '|---|---:|---:|---:|---:|'
    );
    for (const month of holdout.monthly) {
        lines.push(`| ${month.month} | ${month.days} | ${month.wins} | ${percent(month.hitRate)} | ${money(month.profitK)} |`);
    }
    lines.push(
        '',
        '## Nguồn bằng chứng được học',
        '',
        `Trong holdout, ${holdout.candidate.totalSwaps} lần hoán đổi có ` +
        `${holdout.candidate.activeSwapEvidence} lần nhận hỗ trợ active và ` +
        `${holdout.candidate.potentialSwapEvidence} lần nhận hỗ trợ potential (một swap có thể có cả hai).`,
        '',
        '| Cohort | Ngày bằng chứng | Nền loại | Posterior loại | Edge |',
        '|---|---:|---:|---:|---:|'
    );
    for (const signal of report.topSignals.slice(0, 10)) {
        lines.push(
            `| ${signal.id} | ${signal.opportunities} | ${percent(signal.baseline)} | ` +
            `${percent(signal.posteriorExclusionRate)} | ${percent(signal.edge)} |`
        );
    }
    lines.push(
        '',
        'Cỡ mẫu trên là số **ngày**, không phải số candidate; các candidate tương quan trong cùng ngày đã được gộp để tránh phóng đại độ tin cậy.',
        '',
        '## Độ nhạy cấu hình trên holdout (chỉ chẩn đoán sau chấm)',
        '',
        'Bảng này không được dùng để chọn lại cấu hình. Nó cho biết việc chọn tham số theo 2026 sẽ gây overfit ra sao.',
        '',
        '| Cấu hình | Δ trúng | Profit | Thua dài nhất |',
        '|---|---:|---:|---:|'
    );
    for (const row of report.holdoutSensitivity) {
        lines.push(
            `| ${row.id} | ${row.deltaWins >= 0 ? '+' : ''}${row.deltaWins} | ` +
            `${money(row.profitK)} | ${row.longestLoss} |`
        );
    }
    lines.push(
        '',
        '## Quyết định',
        '',
        `**${report.promotionDecision}**`,
        '',
        report.conclusion,
        '',
        'Giới hạn hiện tại: tập train strict có 37 ngày lấy mẫu cho 2024 và 37 ngày cho 2025. Vì vậy tín hiệu cohort đủ để thử nghiệm nhưng chưa đủ để coi là xác suất ổn định dài hạn.',
        '',
        '> Kết quả lịch sử là bằng chứng thực nghiệm, không bảo đảm lợi nhuận tương lai.'
    );
    return `${lines.join('\n')}\n`;
}

function main() {
    const options = parseArgs();
    if (!options.train2024 || !options.validation2025 || !options.holdout2026) {
        throw new Error('Cần --train2024, --validation2025 và --holdout2026.');
    }
    const train2024 = loadRows(options.train2024);
    const validation2025 = loadRows(options.validation2025);
    const holdout2026 = loadRows(options.holdout2026);
    const split = Math.max(1, Math.floor(train2024.length * 2 / 3));
    const early2024 = train2024.slice(0, split);
    const late2024 = train2024.slice(split);
    const selections = configs().map(config => {
        const folds = [
            { period: 'late-2024', train: early2024, evaluate: late2024 },
            { period: '2025', train: train2024, evaluate: validation2025 }
        ].map(fold => {
            const model = fitReliabilityModel(fold.train, config);
            const baseline = evaluateBaseline(fold.evaluate);
            const candidate = evaluate(fold.evaluate, model, config);
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
    const selected = selections[0];
    const finalModel = fitReliabilityModel([...train2024, ...validation2025], selected.config);
    const baseline = evaluateBaseline(holdout2026);
    const candidate = evaluate(holdout2026, finalModel, selected.config);
    const holdoutDelta = delta(candidate, baseline);
    const paired = pairedComparison(candidate, baseline);
    const improvesBothRegimes = selected.minimumWinDelta >= 0 && selected.totalWinDelta > 0;
    const eligible = improvesBothRegimes
        && holdoutDelta.wins > 0
        && holdoutDelta.profitK > 0
        && candidate.longestLoss <= Math.ceil(baseline.longestLoss * 1.2)
        && paired.exactMcNemarPValue < 0.05;
    const topSignals = [...finalModel.values()]
        .map(entry => ({
            id: entry.id,
            opportunities: entry.opportunities,
            baseline: entry.baseline,
            posteriorExclusionRate: entry.posteriorExclusionRate,
            edge: entry.posteriorExclusionRate - entry.baseline
        }))
        .filter(entry => entry.opportunities >= selected.config.minOpportunities && entry.edge > 0)
        .sort((left, right) => right.edge - left.edge || right.opportunities - left.opportunities)
        .slice(0, 30);
    const holdoutSensitivity = configs().map(config => {
        const configModel = fitReliabilityModel([...train2024, ...validation2025], config);
        const result = evaluate(holdout2026, configModel, config);
        return {
            id: config.id,
            wins: result.wins,
            deltaWins: result.wins - baseline.wins,
            profitK: result.profitK,
            longestLoss: result.longestLoss
        };
    }).sort((left, right) =>
        right.wins - left.wins || right.profitK - left.profitK || left.id.localeCompare(right.id)
    );
    const report = {
        generatedAt: new Date().toISOString(),
        methodId: METHOD_ID,
        methodology: {
            train: 'Candidate opportunity replay strict PIT; potential không dùng cumulative streak làm formation trials.',
            calibration: 'Hierarchical empirical Bayes + conservative posterior edge against exact set-size baseline.',
            correlationControl: 'Deduplicate state/family/number-set/length and retain strongest evidence per family.',
            selection: 'Select on late-2024 and 2025; freeze before 2026 holdout.'
        },
        economics: {
            hold: 70,
            betCount: 30,
            betPerNumberK: BET_PER_NUMBER_K,
            winMultiplier: WIN_MULTIPLIER,
            breakEvenHitRate: 30 / 84
        },
        coverage: {
            early2024: [early2024[0]?.date, early2024.at(-1)?.date, early2024.length],
            late2024: [late2024[0]?.date, late2024.at(-1)?.date, late2024.length],
            validation2025: [validation2025[0]?.date, validation2025.at(-1)?.date, validation2025.length],
            holdout2026: [holdout2026[0]?.date, holdout2026.at(-1)?.date, holdout2026.length]
        },
        selected,
        holdout: {
            baseline: compact(baseline),
            candidate: compact(candidate),
            delta: holdoutDelta,
            pairedComparison: paired,
            monthly: summarizeMonths(candidate.rows)
        },
        summariesByWindow: {
            holdout2026: {
                chainSmallFirstHold70: {
                    ...compact(baseline),
                    betCount: 30,
                    target: 70
                },
                [METHOD_ID]: {
                    ...compact(candidate),
                    betCount: 30,
                    target: 70
                }
            }
        },
        holdoutSensitivity,
        topSignals,
        promotionDecision: eligible ? 'eligible-for-independent-live-validation' : 'do-not-promote',
        conclusion: eligible
            ? 'Phương pháp vượt guardrail offline; vẫn cần snapshot live bất biến trước khi cân nhắc đổi production.'
            : 'Chưa đủ bằng chứng để thay production. Giữ research-only; không sửa dự đoán đã phát hành.',
        selectionTable: selections.map(item => ({
            config: item.config,
            folds: item.folds,
            minimumWinDelta: item.minimumWinDelta,
            totalWinDelta: item.totalWinDelta,
            totalProfitDeltaK: item.totalProfitDeltaK,
            maximumLossDelta: item.maximumLossDelta
        }))
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.resolve('reports', `research_chain_reliability_ranker_${stamp}.json`);
    const mdPath = path.resolve('reports', `chain-reliability-ranker-${stamp}.md`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(mdPath, renderMarkdown(report));
    console.log(JSON.stringify({
        jsonPath,
        mdPath,
        selected: selected.config,
        folds: selected.folds,
        holdout: report.holdout,
        promotionDecision: report.promotionDecision
    }, null, 2));
}

if (require.main === module) main();

module.exports = {
    configs,
    evaluate,
    evaluateBaseline,
    loadRows,
    pairedComparison,
    renderMarkdown
};
