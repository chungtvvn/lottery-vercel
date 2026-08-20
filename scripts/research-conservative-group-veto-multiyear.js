#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
    createHierarchicalFamilies,
    buildFeatureRows,
    trainConditionalSoftmax,
    evaluateProbabilities,
    rankGroupProbabilities,
    summarizeSelections
} = require('../lib/research/hierarchicalSetDistribution');
const {
    rankBlockSmallSnapshot,
    rankMethodConsensusSnapshot,
    oneSidedWilsonUpper,
    oneSidedWilsonLower
} = require('../lib/research/conservativeGroupVeto');

const ROOT = path.resolve(__dirname, '..');
const RAW_FILE = path.join(ROOT, 'lib/data/xsmb-2-digits.json');
const INDEX_FILE = path.join(ROOT, 'reports/strict_pit_all_methods_2016_2026.json');
const ECONOMICS = Object.freeze({
    stakePerNumberK: 1000,
    payoutMultiplier: 84
});
const MODEL_CONFIGS = Object.freeze([
    { learningRate: 0.1, l2: 0.01, epochs: 5 },
    { learningRate: 0.2, l2: 0.03, epochs: 8 },
    { learningRate: 0.35, l2: 0.05, epochs: 10 },
    { learningRate: 0.5, l2: 0.1, epochs: 12 }
]);
const PERIODS = Object.freeze({
    modelTrain: ['2008-01-01', '2012-12-31'],
    modelSelection: ['2013-01-01', '2013-12-31'],
    vetoCalibration: ['2014-01-01', '2015-12-31'],
    development: ['2016-01-01', '2019-12-31'],
    validation: ['2020-01-01', '2022-12-31'],
    holdout: ['2023-01-01', '9999-12-31']
});
const BASE_METHODS = Object.freeze({
    block: ['chainBlockFirst'],
    small: ['chainSmallFirst'],
    consensus: ['chainBlockFirst', 'chainSmallFirst'],
    blockSmallEdge: [
        'chainBlockFirst',
        'chainSmallFirst',
        'dedupEdge50Hold'
    ],
    blockSmallPosterior: [
        'chainBlockFirst',
        'chainSmallFirst',
        'numberPosteriorDiversity'
    ],
    blockSmallActive: [
        'chainBlockFirst',
        'chainSmallFirst',
        'activeOnlyAvgRisk'
    ],
    blockSmallEdgePosterior: [
        'chainBlockFirst',
        'chainSmallFirst',
        'dedupEdge50Hold',
        'numberPosteriorDiversity'
    ],
    blockSmallFiveWay: [
        'chainBlockFirst',
        'chainSmallFirst',
        'dedupEdge50Hold',
        'numberPosteriorDiversity',
        'activeOnlyAvgRisk'
    ]
});

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function between(rows, range) {
    return rows.filter(row => row.date >= range[0] && row.date <= range[1]);
}

function selectModel(trainRows, selectionRows) {
    return MODEL_CONFIGS.map(config => {
        const weights = trainConditionalSoftmax(trainRows, config);
        return {
            config,
            weights,
            metrics: evaluateProbabilities(selectionRows, weights)
        };
    }).sort((left, right) =>
        left.metrics.logLoss - right.metrics.logLoss
        || left.config.l2 - right.config.l2
    )[0];
}

function loadStrictRows(indexFile) {
    const index = readJson(indexFile);
    const rows = [];
    const sources = [];
    for (const source of index.sourceReports || []) {
        const reportFile = path.join(ROOT, 'reports', path.basename(source.file));
        const report = readJson(reportFile);
        sources.push({
            year: source.year,
            file: path.relative(ROOT, reportFile),
            fingerprint: report.fingerprint?.runSha256 || null,
            rows: report.rows?.length || 0
        });
        rows.push(...(report.rows || []));
    }
    rows.sort((left, right) => left.date.localeCompare(right.date));
    return { rows, sources, index };
}

function combineRows(featureRows, strictRows) {
    const featureByDate = new Map(featureRows.map(row => [row.date, row]));
    return strictRows.map(strictRow => {
        const featureRow = featureByDate.get(strictRow.date);
        return featureRow ? { ...featureRow, strictRow } : null;
    }).filter(Boolean);
}

function prepareRows(rows, weights) {
    for (const row of rows) {
        const rankedByBase = row.strictRow
            ? Object.fromEntries(
                Object.entries(BASE_METHODS).map(([baseId, methodIds]) => [
                    baseId,
                    ['block', 'small', 'consensus'].includes(baseId)
                        ? rankBlockSmallSnapshot(row.strictRow, baseId)
                        : rankMethodConsensusSnapshot(
                            row.strictRow,
                            methodIds,
                            baseId
                        )
                ])
            )
            : null;
        const groupRanking = rankGroupProbabilities(row, weights);
        const groupPercentileByNumber = new Float64Array(100);
        groupRanking.forEach((item, index) => {
            groupPercentileByNumber[item.number] = (99 - index) / 99;
        });
        row.vetoResearch = {
            rankings: row.strictRow
                ? Object.fromEntries(
                    Object.entries(rankedByBase).map(([baseId, ranking]) => [
                        baseId,
                        ranking.map(item => item.number)
                    ])
                )
                : null,
            supportByNumber: row.strictRow
                ? Int8Array.from(
                    Array.from({ length: 100 }, (_, number) => {
                        const item = rankedByBase.consensus.find(
                            entry => entry.number === number
                        );
                        return item.blockSelected + item.smallSelected;
                    })
                )
                : null,
            supportByBase: row.strictRow
                ? Object.fromEntries(
                    Object.entries(rankedByBase).map(([baseId, ranking]) => [
                        baseId,
                        Int8Array.from(
                            Array.from({ length: 100 }, (_, number) => {
                                const item = ranking.find(
                                    entry => entry.number === number
                                );
                                return item.support
                                    ?? (item.blockSelected + item.smallSelected);
                            })
                        )
                    ])
                )
                : null,
            groupPercentileByNumber,
            bins: Object.fromEntries(
                [5, 10, 20].map(binCount => {
                    const binByNumber = new Int16Array(100);
                    groupRanking.forEach((item, index) => {
                        binByNumber[item.number] = Math.floor(
                            index / (100 / binCount)
                        );
                    });
                    return [binCount, binByNumber];
                })
            )
        };
    }
    return rows;
}

function baseSelector(baseId, betCount) {
    return row => row.vetoResearch.rankings[baseId].slice(0, betCount);
}

function candidateSelector(calibration, config) {
    const vetoBins = new Set(calibration.vetoBins);
    return row => {
        const ranking = row.vetoResearch.rankings[config.baseId];
        const supportByNumber = row.vetoResearch.supportByBase[config.baseId];
        const binByNumber = row.vetoResearch.bins[calibration.binCount];
        const selected = ranking.slice(0, config.betCount);
        const selectedSet = new Set(selected);
        const rejected = selected
            .filter(number => {
                if (
                    config.protectShared
                    && supportByNumber[number]
                        >= Number(config.protectSupportAtLeast ?? 2)
                ) return false;
                return vetoBins.has(binByNumber[number]);
            })
            .slice(0, config.maxSwaps);
        const replacements = [];
        for (const number of ranking.slice(config.betCount)) {
            if (replacements.length >= rejected.length) break;
            if (selectedSet.has(number)) continue;
            if (vetoBins.has(binByNumber[number])) continue;
            if (
                supportByNumber[number]
                < Number(config.replacementMinSupport ?? 0)
            ) continue;
            replacements.push(number);
        }
        const replaceCount = Math.min(rejected.length, replacements.length);
        const rejectedSet = new Set(rejected.slice(0, replaceCount));
        const numbers = selected
            .filter(number => !rejectedSet.has(number))
            .concat(replacements.slice(0, replaceCount));
        if (numbers.length !== config.betCount) {
            throw new Error(`Sai số lượng ngày ${row.date}.`);
        }
        return numbers;
    };
}

function calibratePreparedGroupVeto(rows, options = {}) {
    const binCount = Number(options.binCount ?? 10);
    const z = Number(options.z ?? 1.282);
    const minimumLift = Number(options.minimumLift ?? 0);
    const tailFraction = Number(options.tailFraction ?? 0.2);
    const tailStart = Math.floor(binCount * (1 - tailFraction));
    const hits = Array.from({ length: binCount }, () => 0);
    for (const row of rows) {
        hits[row.vetoResearch.bins[binCount][row.actual]] += 1;
    }
    const baselineShare = 1 / binCount;
    const bins = hits.map((hitCount, bin) => {
        const observedShare = rows.length ? hitCount / rows.length : 0;
        const upperShare = oneSidedWilsonUpper(hitCount, rows.length, z);
        const exclusionLiftLower = baselineShare - upperShare;
        return {
            bin,
            rankStart: bin * (100 / binCount) + 1,
            rankEnd: (bin + 1) * (100 / binCount),
            hits: hitCount,
            days: rows.length,
            baselineShare,
            observedShare,
            upperShare,
            exclusionLiftLower,
            veto: bin >= tailStart && exclusionLiftLower >= minimumLift
        };
    });
    return {
        binCount,
        z,
        minimumLift,
        tailFraction,
        days: rows.length,
        vetoBins: bins.filter(bin => bin.veto).map(bin => bin.bin),
        bins
    };
}

function stripDaily(summary) {
    const { daily, ...rest } = summary;
    return rest;
}

function summarizeByYear(rows, selector) {
    const grouped = new Map();
    for (const row of rows) {
        const year = row.date.slice(0, 4);
        if (!grouped.has(year)) grouped.set(year, []);
        grouped.get(year).push(row);
    }
    return Object.fromEntries([...grouped.entries()].map(([year, yearRows]) => [
        year,
        stripDaily(summarizeSelections(yearRows, selector, ECONOMICS))
    ]));
}

function countChangedDays(rows, baseId, betCount, selector) {
    let changedDays = 0;
    let totalSwaps = 0;
    for (const row of rows) {
        const base = new Set(baseSelector(baseId, betCount)(row));
        const candidate = selector(row);
        const changed = candidate.filter(number => !base.has(number)).length;
        if (changed > 0) changedDays += 1;
        totalSwaps += changed;
    }
    return { changedDays, totalSwaps };
}

function evaluateConfig(rows, weights, calibration, config) {
    const base = baseSelector(config.baseId, config.betCount);
    const candidate = candidateSelector(calibration, config);
    const baseSummary = summarizeSelections(rows, base, ECONOMICS);
    const candidateSummary = summarizeSelections(rows, candidate, ECONOMICS);
    const baseByYear = summarizeByYear(rows, base);
    const candidateByYear = summarizeByYear(rows, candidate);
    const years = Object.keys(candidateByYear);
    const byYear = Object.fromEntries(years.map(year => [
        year,
        {
            days: candidateByYear[year].days,
            baseHitRate: baseByYear[year].hitRate,
            candidateHitRate: candidateByYear[year].hitRate,
            hitRateDelta: candidateByYear[year].hitRate - baseByYear[year].hitRate,
            baseProfitK: baseByYear[year].profitK,
            candidateProfitK: candidateByYear[year].profitK,
            profitDeltaK: candidateByYear[year].profitK - baseByYear[year].profitK
        }
    ]));
    const changed = countChangedDays(
        rows,
        config.baseId,
        config.betCount,
        candidate
    );
    return {
        config,
        calibration: {
            binCount: calibration.binCount,
            z: calibration.z,
            minimumLift: calibration.minimumLift,
            tailFraction: calibration.tailFraction,
            vetoBins: calibration.vetoBins,
            bins: calibration.bins
        },
        base: stripDaily(baseSummary),
        candidate: stripDaily(candidateSummary),
        delta: {
            hitRate: candidateSummary.hitRate - baseSummary.hitRate,
            profitK: candidateSummary.profitK - baseSummary.profitK,
            longestLoss: candidateSummary.longestLoss - baseSummary.longestLoss
        },
        changed,
        profitableYears: years.filter(year => byYear[year].candidateProfitK > 0).length,
        positiveDeltaYears: years.filter(year => byYear[year].profitDeltaK > 0).length,
        worstYearProfitK: Math.min(...years.map(year => byYear[year].candidateProfitK)),
        worstYearDeltaK: Math.min(...years.map(year => byYear[year].profitDeltaK)),
        byYear
    };
}

function compareDevelopment(left, right) {
    return right.profitableYears - left.profitableYears
        || right.positiveDeltaYears - left.positiveDeltaYears
        || right.worstYearProfitK - left.worstYearProfitK
        || right.candidate.profitK - left.candidate.profitK
        || right.delta.profitK - left.delta.profitK
        || left.candidate.longestLoss - right.candidate.longestLoss
        || left.config.betCount - right.config.betCount;
}

function searchDevelopment(rows, weights, calibrationRows) {
    const calibrationProfiles = [];
    const calibrationAudits = [];
    const seenProfiles = new Set();
    for (const binCount of [5, 10, 20]) {
        for (const z of [1.282, 1.645]) {
            for (const minimumLift of [0, 0.005, 0.01, 0.02]) {
                const calibration = calibratePreparedGroupVeto(
                    calibrationRows,
                    { binCount, z, minimumLift, tailFraction: 0.2 }
                );
                calibrationAudits.push(calibration);
                if (!calibration.vetoBins.length) continue;
                const signature = [
                    binCount,
                    calibration.vetoBins.join(',')
                ].join('|');
                if (seenProfiles.has(signature)) continue;
                seenProfiles.add(signature);
                calibrationProfiles.push(calibration);
            }
        }
    }

    const candidates = [];
    for (const calibration of calibrationProfiles) {
        for (const [baseId, methodIds] of Object.entries(BASE_METHODS)) {
            // Annual strict snapshots preserve the selected 30-number set, not
            // the internal ranking. Other counts would introduce an arbitrary
            // tie-break and are therefore invalid for this comparison.
            for (const betCount of [30]) {
                for (const maxSwaps of [1, 2, 3, 5, 8]) {
                    const result = evaluateConfig(
                        rows,
                        weights,
                        calibration,
                        {
                            baseId,
                            betCount,
                            maxSwaps,
                            protectShared: true,
                            protectSupportAtLeast: Math.max(
                                2,
                                Math.ceil(methodIds.length * 0.6)
                            ),
                            replacementMinSupport: 1
                        }
                    );
                    if (result.changed.changedDays > 0) candidates.push(result);
                }
            }
        }
    }
    candidates.sort(compareDevelopment);
    return {
        profileCount: calibrationProfiles.length,
        calibrationAudits,
        candidateCount: candidates.length,
        winner: candidates[0],
        top: candidates.slice(0, 20)
    };
}

function renderNoCandidateMarkdown(report) {
    const lines = [
        '# Bộ lọc phủ quyết nhóm bảo thủ - không đủ bằng chứng',
        '',
        `Sinh lúc: ${report.generatedAt}`,
        '',
        '## Kết quả',
        '',
        '- Không có bin nào trong 20% cuối của thứ hạng nhóm đạt cận Wilson một phía 90%.',
        '- Vì không có tín hiệu đạt chuẩn, hệ thống không hoán đổi số và không chạy tối ưu profit trên validation/holdout.',
        '- Đây là hành vi chủ đích để tránh hạ ngưỡng thống kê hoặc dò holdout cho đến khi xuất hiện profit dương giả.',
        '',
        '## Phạm vi',
        '',
        `- Huấn luyện mô hình nhóm: ${report.periods.modelTrain.join(' đến ')}.`,
        `- Chọn cấu hình mô hình: ${report.periods.modelSelection.join(' đến ')}.`,
        `- Hiệu chuẩn phủ quyết: ${report.periods.vetoCalibration.join(' đến ')}.`,
        '- Tập strict PIT 2016-2026 chỉ được giữ lại để so sánh khi có tín hiệu vượt cổng hiệu chuẩn.',
        '',
        '## Kết luận',
        '',
        '- Không đưa phương pháp vào production.',
        '- Tín hiệu nhóm có thể dùng để giải thích/phân tầng, nhưng chưa đủ độ tin cậy để phủ quyết Block/Small.',
        ''
    ];
    return `${lines.join('\n')}\n`;
}

function validationGate(result) {
    const years = Object.values(result.byYear);
    return {
        passed: result.candidate.profitK > 0
            && years.filter(year => year.candidateProfitK > 0).length >= 2
            && years.filter(year => year.profitDeltaK > 0).length >= 2
            && result.delta.longestLoss <= Math.ceil(result.base.longestLoss * 0.2),
        requirements: {
            totalProfitPositive: result.candidate.profitK > 0,
            atLeastTwoProfitableYears:
                years.filter(year => year.candidateProfitK > 0).length >= 2,
            improvesAtLeastTwoYears:
                years.filter(year => year.profitDeltaK > 0).length >= 2,
            longestLossIncreaseWithin20Percent:
                result.delta.longestLoss <= Math.ceil(result.base.longestLoss * 0.2)
        }
    };
}

function dailyConfidenceScore(row, numbers, mode) {
    const groupMean = numbers.reduce(
        (sum, number) => sum + row.vetoResearch.groupPercentileByNumber[number],
        0
    ) / numbers.length;
    const sharedRatio = numbers.reduce(
        (sum, number) => sum
            + (row.vetoResearch.supportByNumber[number] >= 2 ? 1 : 0),
        0
    ) / numbers.length;
    if (mode === 'groupMean') return groupMean;
    if (mode === 'sharedRatio') return sharedRatio;
    if (mode === 'conservativeMin') return Math.min(groupMean, sharedRatio);
    return (groupMean + sharedRatio) / 2;
}

function assignScoreBin(score, thresholds) {
    let bin = 0;
    while (bin < thresholds.length && score > thresholds[bin]) bin += 1;
    return bin;
}

function buildSelectivePlayGate(rows, selector, options = {}) {
    const mode = options.mode || 'composite';
    const binCount = Number(options.binCount ?? 5);
    const z = Number(options.z ?? 1.282);
    const breakEven = Number(options.breakEven ?? (30 / 84));
    const samples = rows.map(row => {
        const numbers = selector(row);
        return {
            score: dailyConfidenceScore(row, numbers, mode),
            hit: numbers.includes(row.actual)
        };
    });
    const sorted = samples.map(sample => sample.score).sort((a, b) => a - b);
    const thresholds = Array.from({ length: binCount - 1 }, (_, index) =>
        sorted[Math.min(
            sorted.length - 1,
            Math.floor(((index + 1) * sorted.length) / binCount) - 1
        )]
    );
    const bins = Array.from({ length: binCount }, (_, bin) => ({
        bin,
        days: 0,
        wins: 0
    }));
    for (const sample of samples) {
        const bin = assignScoreBin(sample.score, thresholds);
        bins[bin].days += 1;
        bins[bin].wins += sample.hit ? 1 : 0;
    }
    for (const bin of bins) {
        bin.hitRate = bin.days ? bin.wins / bin.days : 0;
        bin.wilsonLower = oneSidedWilsonLower(bin.wins, bin.days, z);
        bin.play = bin.days > 0 && bin.wilsonLower > breakEven;
    }
    return {
        mode,
        binCount,
        z,
        breakEven,
        thresholds,
        playBins: bins.filter(bin => bin.play).map(bin => bin.bin),
        bins
    };
}

function evaluateSelectiveGate(rows, selector, gate) {
    const playBins = new Set(gate.playBins);
    const playedRows = rows.filter(row => {
        const numbers = selector(row);
        const score = dailyConfidenceScore(row, numbers, gate.mode);
        return playBins.has(assignScoreBin(score, gate.thresholds));
    });
    const summary = summarizeSelections(playedRows, selector, ECONOMICS);
    return {
        ...stripDaily(summary),
        calendarDays: rows.length,
        playRate: rows.length ? playedRows.length / rows.length : 0,
        byYear: summarizeByYear(playedRows, selector)
    };
}

function selectGateOnDevelopment(rows, selector) {
    const gates = ['groupMean', 'sharedRatio', 'composite', 'conservativeMin']
        .map(mode => buildSelectivePlayGate(rows, selector, {
            mode,
            binCount: 5,
            z: 1.282,
            breakEven: 30 / 84
        }))
        .map(gate => ({
            gate,
            result: evaluateSelectiveGate(rows, selector, gate)
        }))
        .filter(item => item.result.days >= 100)
        .sort((left, right) =>
            right.result.profitK - left.result.profitK
            || right.result.hitRate - left.result.hitRate
            || right.result.days - left.result.days
        );
    return gates[0] || null;
}

function formatPercent(value) {
    return `${(Number(value || 0) * 100).toFixed(3)}%`;
}

function formatMoney(value) {
    return `${Number(value || 0).toLocaleString('vi-VN')}K`;
}

function renderWindow(lines, title, result) {
    lines.push(
        `## ${title}`,
        '',
        `- Dàn cố định: ${result.config.betCount} số; hòa vốn: ${formatPercent(result.config.betCount / 84)}.`,
        `- Baseline: ${formatPercent(result.base.hitRate)}, ${formatMoney(result.base.profitK)}, chuỗi thua dài nhất ${result.base.longestLoss}.`,
        `- Có phủ quyết: ${formatPercent(result.candidate.hitRate)}, ${formatMoney(result.candidate.profitK)}, chuỗi thua dài nhất ${result.candidate.longestLoss}.`,
        `- Chênh lệch: ${formatPercent(result.delta.hitRate)}, ${formatMoney(result.delta.profitK)}; đổi ${result.changed.totalSwaps} lượt số trên ${result.changed.changedDays} ngày.`,
        '',
        '| Năm | Ngày | Baseline trúng | Phủ quyết trúng | Δ trúng | Baseline profit | Phủ quyết profit | Δ profit |',
        '|---|---:|---:|---:|---:|---:|---:|---:|'
    );
    for (const [year, row] of Object.entries(result.byYear)) {
        lines.push(
            `| ${year} | ${row.days} | ${formatPercent(row.baseHitRate)} | ${formatPercent(row.candidateHitRate)} | ${formatPercent(row.hitRateDelta)} | ${formatMoney(row.baseProfitK)} | ${formatMoney(row.candidateProfitK)} | ${formatMoney(row.profitDeltaK)} |`
        );
    }
    lines.push('');
}

function renderMarkdown(report) {
    const lines = [
        '# Bộ lọc phủ quyết nhóm bảo thủ - strict PIT nhiều năm',
        '',
        `Sinh lúc: ${report.generatedAt}`,
        '',
        '## Thiết kế kiểm định',
        '',
        '- Tín hiệu nhóm không được cộng trực tiếp vào điểm của 100 số.',
        '- Chỉ các quantile có cận trên Wilson của tỷ trọng hit thấp hơn tỷ trọng nền mới được phủ quyết.',
        '- Phủ quyết chỉ hoán đổi 1:1 trong thứ hạng Block/Small; số con đánh và vốn mỗi ngày không đổi.',
        '- Cấu hình chọn trên 2016-2019, khóa trước kiểm định 2020-2022 và holdout 2023-2026.',
        '- Không dùng kết quả ngày D để tạo tín hiệu hay chọn số ngày D.',
        '',
        '## Cấu hình được khóa',
        '',
        `- Base: ${report.selectedConfig.baseId}; đánh ${report.selectedConfig.betCount}; tối đa ${report.selectedConfig.maxSwaps} hoán đổi/ngày.`,
        `- Quantile: ${report.calibration.binCount}; bin phủ quyết: ${report.calibration.vetoBins.join(', ') || 'không có'}.`,
        `- Wilson z=${report.calibration.z}; lợi thế loại trừ tối thiểu=${formatPercent(report.calibration.minimumLift)}.`,
        `- Số cấu hình đã thử ở development: ${report.search.candidateCount} (${report.search.profileCount} profile phủ quyết khác nhau).`,
        ''
    ];
    renderWindow(lines, 'Development 2016-2019', report.evaluation.development);
    renderWindow(lines, 'Validation 2020-2022', report.evaluation.validation);
    lines.push(
        '## Cổng validation',
        '',
        `- Kết quả: **${report.validationGate.passed ? 'ĐẠT' : 'KHÔNG ĐẠT'}**.`,
        `- Chi tiết: \`${JSON.stringify(report.validationGate.requirements)}\`.`,
        ''
    );
    renderWindow(lines, 'Holdout 2023-2026', report.evaluation.holdout);
    lines.push(
        '## Kết luận',
        '',
        report.productionPromotion
            ? '- Bộ lọc vượt cổng kiểm định; vẫn cần audit cache production trước khi cân nhắc bổ sung dưới ID không mặc định.'
            : '- Không đưa vào production: chưa đạt đủ điều kiện lợi nhuận và ổn định trên giai đoạn độc lập.',
        '- Không có kết quả lịch sử nào đảm bảo lợi nhuận tương lai.',
        ''
    );
    return `${lines.join('\n')}\n`;
}

async function main() {
    const draws = readJson(RAW_FILE)
        .filter(row => row?.date && Number.isInteger(Number(row.special)))
        .sort((left, right) => left.date.localeCompare(right.date));
    const { rows: strictRows, sources, index } = loadStrictRows(INDEX_FILE);
    const featureData = buildFeatureRows(draws, {
        families: createHierarchicalFamilies(),
        minimumHistory: 365 * 2,
        priorStrength: 120
    });
    const featureRows = featureData.rows;
    const modelTrainRows = between(featureRows, PERIODS.modelTrain);
    const modelSelectionRows = between(featureRows, PERIODS.modelSelection);
    const selectedModel = selectModel(modelTrainRows, modelSelectionRows);
    const calibrationRows = between(featureRows, PERIODS.vetoCalibration);
    prepareRows(calibrationRows, selectedModel.weights);
    const combinedRows = prepareRows(
        combineRows(featureRows, strictRows),
        selectedModel.weights
    );
    const developmentRows = between(combinedRows, PERIODS.development);
    const validationRows = between(combinedRows, PERIODS.validation);
    const holdoutRows = between(combinedRows, PERIODS.holdout);

    const search = searchDevelopment(
        developmentRows,
        selectedModel.weights,
        calibrationRows
    );
    if (!search.winner) {
        const report = {
            generatedAt: new Date().toISOString(),
            methodologyVersion: 'conservative-group-veto-strict-pit-v2',
            strictPointInTime: true,
            fixedBetCount: true,
            productionPromotion: false,
            status: 'no-credible-veto-bin',
            economics: ECONOMICS,
            periods: PERIODS,
            sources: {
                rawFile: path.relative(ROOT, RAW_FILE),
                strictIndex: path.relative(ROOT, INDEX_FILE),
                strictMethodology: index.methodologyVersion,
                strictReports: sources
            },
            model: {
                selectedConfig: selectedModel.config,
                selectionMetrics: selectedModel.metrics,
                weights: selectedModel.weights
            },
            search: {
                profileCount: search.profileCount,
                candidateCount: search.candidateCount,
                calibrationAudits: search.calibrationAudits
            },
            conclusion: 'Không có bin thuộc 20% cuối đạt Wilson một phía 90%.'
        };
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const jsonFile = path.join(
            ROOT,
            `reports/conservative-group-veto-multiyear-${stamp}.json`
        );
        const markdownFile = path.join(
            ROOT,
            `reports/conservative-group-veto-multiyear-${stamp}.md`
        );
        fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2));
        fs.writeFileSync(markdownFile, renderNoCandidateMarkdown(report));
        console.log(JSON.stringify({
            jsonFile,
            markdownFile,
            status: report.status,
            profileCount: report.search.profileCount,
            candidateCount: report.search.candidateCount,
            conclusion: report.conclusion
        }, null, 2));
        return;
    }
    const selectedConfig = search.winner.config;
    const calibration = search.winner.calibration;
    const frozenCalibration = calibratePreparedGroupVeto(
        calibrationRows,
        {
            binCount: calibration.binCount,
            z: calibration.z,
            minimumLift: calibration.minimumLift,
            tailFraction: calibration.tailFraction
        }
    );
    const validation = evaluateConfig(
        validationRows,
        selectedModel.weights,
        frozenCalibration,
        selectedConfig
    );
    const gate = validationGate(validation);
    const holdout = evaluateConfig(
        holdoutRows,
        selectedModel.weights,
        frozenCalibration,
        selectedConfig
    );
    const selectedCandidate = candidateSelector(
        frozenCalibration,
        selectedConfig
    );
    const selectedPlayGate = selectGateOnDevelopment(
        developmentRows,
        selectedCandidate
    );
    const selectiveEvaluation = selectedPlayGate
        ? {
            gate: selectedPlayGate.gate,
            development: selectedPlayGate.result,
            validation: evaluateSelectiveGate(
                validationRows,
                selectedCandidate,
                selectedPlayGate.gate
            ),
            holdout: evaluateSelectiveGate(
                holdoutRows,
                selectedCandidate,
                selectedPlayGate.gate
            )
        }
        : null;

    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'conservative-group-veto-strict-pit-v1',
        strictPointInTime: true,
        fixedBetCount: true,
        productionPromotion: gate.passed
            && holdout.candidate.profitK > 0
            && holdout.delta.profitK > 0,
        economics: ECONOMICS,
        periods: PERIODS,
        sources: {
            rawFile: path.relative(ROOT, RAW_FILE),
            strictIndex: path.relative(ROOT, INDEX_FILE),
            strictMethodology: index.methodologyVersion,
            strictReports: sources
        },
        model: {
            selectedConfig: selectedModel.config,
            selectionMetrics: selectedModel.metrics,
            weights: selectedModel.weights
        },
        search: {
            profileCount: search.profileCount,
            candidateCount: search.candidateCount,
            topDevelopmentConfigs: search.top.map(result => ({
                config: result.config,
                calibration: {
                    binCount: result.calibration.binCount,
                    z: result.calibration.z,
                    minimumLift: result.calibration.minimumLift,
                    vetoBins: result.calibration.vetoBins
                },
                candidate: result.candidate,
                delta: result.delta,
                profitableYears: result.profitableYears,
                positiveDeltaYears: result.positiveDeltaYears,
                worstYearProfitK: result.worstYearProfitK
            }))
        },
        selectedConfig,
        calibration: frozenCalibration,
        evaluation: {
            development: search.winner,
            validation,
            holdout
        },
        selectivePlayGate: selectiveEvaluation,
        validationGate: gate
    };

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonFile = path.join(
        ROOT,
        `reports/conservative-group-veto-multiyear-${stamp}.json`
    );
    const markdownFile = path.join(
        ROOT,
        `reports/conservative-group-veto-multiyear-${stamp}.md`
    );
    fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2));
    fs.writeFileSync(markdownFile, renderMarkdown(report));
    console.log(JSON.stringify({
        jsonFile,
        markdownFile,
        selectedConfig,
        calibration: {
            binCount: frozenCalibration.binCount,
            z: frozenCalibration.z,
            minimumLift: frozenCalibration.minimumLift,
            vetoBins: frozenCalibration.vetoBins
        },
        validationGate: gate,
        evaluation: Object.fromEntries(
            Object.entries(report.evaluation).map(([key, result]) => [
                key,
                {
                    base: result.base,
                    candidate: result.candidate,
                    delta: result.delta,
                    byYear: result.byYear
                }
            ])
        ),
        selectivePlayGate: report.selectivePlayGate,
        productionPromotion: report.productionPromotion
    }, null, 2));
}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = {
    selectModel,
    loadStrictRows,
    combineRows,
    evaluateConfig,
    searchDevelopment,
    validationGate
    ,
    buildSelectivePlayGate,
    evaluateSelectiveGate
};
