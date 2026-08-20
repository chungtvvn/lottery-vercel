#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
    fitPotentialFormationModel,
    getPotentialEvidence,
    refinePredictionWithPotential
} = require('../lib/research/potentialFormationCalibrator');

const BET_PER_NUMBER_K = 1000;
const WIN_MULTIPLIER = 84;

function parseArgs(argv = process.argv.slice(2)) {
    const values = new Map(argv.map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        train: values.get('train'),
        validation: values.get('validation'),
        holdout: values.get('holdout'),
        baselineStrategy: values.get('baselineStrategy') || 'numberAnnualCalibratedRisk'
    };
}

function loadRows(value) {
    const rowsByDate = new Map();
    for (const filename of String(value || '').split(',').map(item => item.trim()).filter(Boolean)) {
        const absolute = path.resolve(filename);
        const payload = JSON.parse(fs.readFileSync(absolute, 'utf8'));
        if (payload.options?.includeCandidateDiagnostics !== true) {
            throw new Error(`${absolute} thiếu candidateDiagnostics strict PIT.`);
        }
        for (const row of payload.rows || []) rowsByDate.set(row.date, row);
    }
    return [...rowsByDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function configs(baselineStrategy) {
    const result = [];
    for (const conservativeZ of [0, 0.67, 1.28]) {
        for (const swapLimit of [1, 2, 4]) {
            for (const minDays of [10, 16, 20]) {
                result.push({
                    id: `potential-z${conservativeZ}-s${swapLimit}-m${minDays}`,
                    baselineStrategy,
                    priorStrengths: [90, 80, 70, 60, 50],
                    minDaysByDepth: [minDays, minDays, Math.max(10, minDays - 2), 10, 10],
                    reliabilityDays: 50,
                    conservativeZ,
                    minEdge: 0,
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
        swaps: 0,
        longestWin: 0,
        longestLoss: 0,
        currentType: '',
        currentLength: 0,
        rows: []
    };
}

function settle(summary, row, betNumbers, swaps = []) {
    const actual = Number(row.actual);
    const win = betNumbers.includes(actual);
    const stakeK = betNumbers.length * BET_PER_NUMBER_K;
    const profitK = (win ? BET_PER_NUMBER_K * WIN_MULTIPLIER : 0) - stakeK;
    const type = win ? 'win' : 'loss';
    summary.days++;
    summary.wins += Number(win);
    summary.stakeK += stakeK;
    summary.profitK += profitK;
    summary.swaps += swaps.length;
    if (summary.currentType === type) summary.currentLength++;
    else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    summary.longestWin = Math.max(summary.longestWin, win ? summary.currentLength : 0);
    summary.longestLoss = Math.max(summary.longestLoss, win ? 0 : summary.currentLength);
    summary.rows.push({ date: row.date, actual, win, profitK, swaps });
}

function finalize(summary) {
    const { currentType, currentLength, ...result } = summary;
    return {
        ...result,
        losses: result.days - result.wins,
        hitRate: result.days ? result.wins / result.days : 0,
        roi: result.stakeK ? result.profitK / result.stakeK : 0,
        averageSwaps: result.days ? result.swaps / result.days : 0
    };
}

function evaluateBaseline(rows, baselineStrategy) {
    const summary = createSummary(baselineStrategy);
    for (const row of rows) {
        const numbers = (row.strategies?.[baselineStrategy] || []).map(Number);
        settle(summary, row, numbers);
    }
    return finalize(summary);
}

function evaluate(rows, model, config) {
    const summary = createSummary(config.id);
    for (const row of rows) {
        const prediction = refinePredictionWithPotential(row, model, config);
        settle(summary, row, prediction.betNumbers, prediction.swaps);
    }
    return finalize(summary);
}

function calibration(rows, model, config) {
    let baseBrier = 0;
    let adjustedBrier = 0;
    let baseLogLoss = 0;
    let adjustedLogLoss = 0;
    let days = 0;
    let candidateOpportunities = 0;
    for (const row of rows) {
        const daily = { baseBrier: 0, adjustedBrier: 0, baseLog: 0, adjustedLog: 0, count: 0 };
        for (const candidate of row.candidateDiagnostics || []) {
            if (candidate.state !== 'potential') continue;
            const actualExcluded = Number(Boolean(candidate.observedExcluded));
            const base = Math.min(1 - 1e-6, Math.max(1e-6, Number(candidate.baseExclusionRate)));
            const evidence = getPotentialEvidence(candidate, model, config);
            const adjusted = Math.min(1 - 1e-6, Math.max(
                1e-6,
                evidence?.adjustedExclusionRate ?? base
            ));
            daily.baseBrier += (base - actualExcluded) ** 2;
            daily.adjustedBrier += (adjusted - actualExcluded) ** 2;
            daily.baseLog += -(actualExcluded * Math.log(base) + (1 - actualExcluded) * Math.log(1 - base));
            daily.adjustedLog += -(actualExcluded * Math.log(adjusted) + (1 - actualExcluded) * Math.log(1 - adjusted));
            daily.count++;
        }
        if (!daily.count) continue;
        days++;
        candidateOpportunities += daily.count;
        baseBrier += daily.baseBrier / daily.count;
        adjustedBrier += daily.adjustedBrier / daily.count;
        baseLogLoss += daily.baseLog / daily.count;
        adjustedLogLoss += daily.adjustedLog / daily.count;
    }
    return {
        days,
        candidateOpportunities,
        baseBrier: days ? baseBrier / days : null,
        adjustedBrier: days ? adjustedBrier / days : null,
        brierDelta: days ? (adjustedBrier - baseBrier) / days : null,
        baseLogLoss: days ? baseLogLoss / days : null,
        adjustedLogLoss: days ? adjustedLogLoss / days : null,
        logLossDelta: days ? (adjustedLogLoss - baseLogLoss) / days : null
    };
}

function compact(summary) {
    const { rows, ...result } = summary;
    return result;
}

function delta(candidate, baseline) {
    return {
        wins: candidate.wins - baseline.wins,
        profitK: candidate.profitK - baseline.profitK,
        hitRate: candidate.hitRate - baseline.hitRate,
        longestLoss: candidate.longestLoss - baseline.longestLoss
    };
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
    return result;
}

function renderMarkdown(report) {
    const percent = value => `${(Number(value || 0) * 100).toFixed(2)}%`;
    const money = value => `${Number(value || 0).toLocaleString('vi-VN')}K`;
    const metric = value => Number(value || 0).toFixed(6);
    const lines = [
        '# Hiệu chỉnh khả năng hình thành chuỗi tiềm năng bằng daily replay',
        '',
        '## Thiết kế',
        '',
        '- Mỗi candidate tiềm năng xuất hiện trong một ngày strict PIT là đúng một cơ hội tiền đề.',
        '- Kết quả thuộc tập số candidate = hình thành; ngoài tập = không hình thành.',
        '- Candidate tương quan trong cùng cohort/ngày được gộp thành một đơn vị ngày trước khi fit.',
        '- Partial pooling theo độ rộng tập số → họ → trạng thái kỷ lục/độ dài → pattern → tần suất/độ dài trung bình.',
        '- Chọn cấu hình trên validation; holdout không tham gia chọn tham số.',
        '',
        `Baseline dàn số: \`${report.baselineStrategy}\`.`,
        `Cấu hình chọn trước holdout: \`${report.selectedConfig.id}\`.`,
        '',
        '## Kết quả validation',
        '',
        '| Phương pháp | Trúng | Profit | ROI | TB hoán đổi |',
        '|---|---:|---:|---:|---:|',
        `| Baseline | ${report.validation.baseline.wins}/${report.validation.baseline.days} (${percent(report.validation.baseline.hitRate)}) | ${money(report.validation.baseline.profitK)} | ${percent(report.validation.baseline.roi)} | 0 |`,
        `| Potential calibrated | ${report.validation.candidate.wins}/${report.validation.candidate.days} (${percent(report.validation.candidate.hitRate)}) | ${money(report.validation.candidate.profitK)} | ${percent(report.validation.candidate.roi)} | ${report.validation.candidate.averageSwaps.toFixed(2)} |`,
        '',
        '## Holdout',
        '',
        '| Phương pháp | Trúng | Profit | ROI | Thua dài nhất |',
        '|---|---:|---:|---:|---:|',
        `| Baseline | ${report.holdout.baseline.wins}/${report.holdout.baseline.days} (${percent(report.holdout.baseline.hitRate)}) | ${money(report.holdout.baseline.profitK)} | ${percent(report.holdout.baseline.roi)} | ${report.holdout.baseline.longestLoss} |`,
        `| Potential calibrated | ${report.holdout.candidate.wins}/${report.holdout.candidate.days} (${percent(report.holdout.candidate.hitRate)}) | ${money(report.holdout.candidate.profitK)} | ${percent(report.holdout.candidate.roi)} | ${report.holdout.candidate.longestLoss} |`,
        `| Chênh lệch | ${report.holdout.delta.wins >= 0 ? '+' : ''}${report.holdout.delta.wins} | ${money(report.holdout.delta.profitK)} | - | ${report.holdout.delta.longestLoss >= 0 ? '+' : ''}${report.holdout.delta.longestLoss} |`,
        '',
        `Đối chiếu cặp ngày: candidate-only ${report.holdout.paired.candidateOnly}, baseline-only ${report.holdout.paired.baselineOnly}, cùng trúng ${report.holdout.paired.bothWin}, cùng trượt ${report.holdout.paired.bothLoss}.`,
        '',
        '## Chất lượng xác suất chuỗi tiềm năng',
        '',
        '| Giai đoạn | Brier nền | Brier hiệu chỉnh | Δ Brier | Log loss nền | Log loss hiệu chỉnh | Δ log loss |',
        '|---|---:|---:|---:|---:|---:|---:|',
        `| Validation | ${metric(report.validation.calibration.baseBrier)} | ${metric(report.validation.calibration.adjustedBrier)} | ${metric(report.validation.calibration.brierDelta)} | ${metric(report.validation.calibration.baseLogLoss)} | ${metric(report.validation.calibration.adjustedLogLoss)} | ${metric(report.validation.calibration.logLossDelta)} |`,
        `| Holdout | ${metric(report.holdout.calibration.baseBrier)} | ${metric(report.holdout.calibration.adjustedBrier)} | ${metric(report.holdout.calibration.brierDelta)} | ${metric(report.holdout.calibration.baseLogLoss)} | ${metric(report.holdout.calibration.adjustedLogLoss)} | ${metric(report.holdout.calibration.logLossDelta)} |`,
        '',
        'Giá trị Δ âm là cải thiện. Việc giảm Brier/log loss quan trọng hơn một vài ngày trúng tăng do mẫu holdout còn nhỏ.',
        '',
        '## Quyết định',
        '',
        report.decision === 'promising-research-only'
            ? '**promising-research-only**: có tín hiệu ngoài mẫu, nhưng cần replay đủ ngày và nhiều năm trước khi cân nhắc production.'
            : '**do-not-promote**: chưa có cải thiện ngoài mẫu đủ nhất quán; không thay production.',
        '',
        '> Backtest lịch sử không bảo đảm lợi nhuận tương lai.'
    ];
    return `${lines.join('\n')}\n`;
}

function main() {
    const options = parseArgs();
    if (!options.train || !options.validation || !options.holdout) {
        throw new Error('Cần --train=... --validation=... --holdout=...');
    }
    const train = loadRows(options.train);
    const validation = loadRows(options.validation);
    const holdout = loadRows(options.holdout);
    const trainModel = fitPotentialFormationModel(train);
    const validationBaseline = evaluateBaseline(validation, options.baselineStrategy);
    const evaluatedConfigs = configs(options.baselineStrategy).map(config => {
        const candidate = evaluate(validation, trainModel, config);
        return {
            config,
            candidate,
            delta: delta(candidate, validationBaseline),
            calibration: calibration(validation, trainModel, config)
        };
    }).sort((left, right) =>
        right.delta.wins - left.delta.wins ||
        left.calibration.brierDelta - right.calibration.brierDelta ||
        left.candidate.averageSwaps - right.candidate.averageSwaps
    );
    const selected = evaluatedConfigs[0];

    const holdoutModel = fitPotentialFormationModel([...train, ...validation], {
        priorStrengths: selected.config.priorStrengths
    });
    const holdoutBaseline = evaluateBaseline(holdout, options.baselineStrategy);
    const holdoutCandidate = evaluate(holdout, holdoutModel, selected.config);
    const holdoutCalibration = calibration(holdout, holdoutModel, selected.config);
    const holdoutDelta = delta(holdoutCandidate, holdoutBaseline);
    const decision = holdoutDelta.wins > 0 && holdoutCalibration.brierDelta < 0 && holdoutCalibration.logLossDelta < 0
        ? 'promising-research-only'
        : 'do-not-promote';
    const report = {
        generatedAt: new Date().toISOString(),
        baselineStrategy: options.baselineStrategy,
        source: {
            trainDays: train.length,
            validationDays: validation.length,
            holdoutDays: holdout.length
        },
        selectedConfig: selected.config,
        validation: {
            baseline: compact(validationBaseline),
            candidate: compact(selected.candidate),
            delta: selected.delta,
            calibration: selected.calibration
        },
        holdout: {
            baseline: compact(holdoutBaseline),
            candidate: compact(holdoutCandidate),
            delta: holdoutDelta,
            paired: pairedComparison(holdoutCandidate, holdoutBaseline),
            calibration: holdoutCalibration
        },
        sensitivity: evaluatedConfigs.map(item => ({
            config: item.config.id,
            delta: item.delta,
            calibration: item.calibration,
            candidate: compact(item.candidate)
        })),
        decision
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputBase = path.join(__dirname, '..', 'reports', `potential-formation-calibration-${stamp}`);
    fs.writeFileSync(`${outputBase}.json`, JSON.stringify(report, null, 2));
    fs.writeFileSync(`${outputBase}.md`, renderMarkdown(report));
    console.log(JSON.stringify({
        output: `${outputBase}.md`,
        selected: selected.config.id,
        validation: selected.delta,
        holdout: holdoutDelta,
        calibration: holdoutCalibration,
        decision
    }, null, 2));
}

main();
