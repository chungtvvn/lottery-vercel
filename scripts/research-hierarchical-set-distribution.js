#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
    DEFAULT_WINDOWS,
    TRANSITION_WINDOWS,
    createHierarchicalFamilies,
    validatePartitionFamilies,
    buildFeatureRows,
    trainConditionalSoftmax,
    evaluateProbabilities,
    rankGroupProbabilities,
    summarizeSelections,
    annualDistributionDiagnostics
} = require('../lib/research/hierarchicalSetDistribution');
const { rankBlockSmallFusion } = require('../lib/research/blockSmallFusion');

const ROOT = path.resolve(__dirname, '..');
const RAW_FILE = path.join(ROOT, 'lib/data/xsmb-2-digits.json');
const DEFAULT_TRAIN_REPORT = path.join(
    ROOT,
    'reports/research_true_pit_strategies_2026-07-27T14-43-16-097Z.json'
);
const DEFAULT_HOLDOUT_REPORT = path.join(
    ROOT,
    'reports/research_true_pit_strategies_2026-07-27T11-20-47-263Z.json'
);
const FEATURE_NAMES = [
    ...DEFAULT_WINDOWS.map(window => window.id),
    'normalizedGap',
    ...TRANSITION_WINDOWS.map(window => window.id)
];
const CHAIN_BASES = Object.freeze({
    blockOnly: {
        targets: [65, 70, 85],
        blockWeight: 1,
        smallWeight: 0
    },
    smallOnly: {
        targets: [65, 70, 85],
        blockWeight: 0,
        smallWeight: 1
    },
    blockSmall5050: {
        targets: [65, 70, 85],
        blockWeight: 0.5,
        smallWeight: 0.5
    }
});

function parseArgs(argv) {
    const output = {};
    for (const token of argv) {
        if (!token.startsWith('--')) continue;
        const [key, ...rest] = token.slice(2).split('=');
        output[key] = rest.join('=');
    }
    return output;
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

function rowsBetween(rows, startDate, endDate) {
    return rows.filter(row => row.date >= startDate && row.date <= endDate);
}

function percentileScores(ranking) {
    const result = new Float64Array(100);
    const denominator = Math.max(1, ranking.length - 1);
    ranking.forEach((item, index) => {
        result[item.number] = (ranking.length - 1 - index) / denominator;
    });
    return result;
}

function chainPercentiles(strictRow, chainBaseId) {
    return percentileScores(rankBlockSmallFusion(strictRow, CHAIN_BASES[chainBaseId]));
}

function groupPercentiles(featureRow, weights) {
    return percentileScores(rankGroupProbabilities(featureRow, weights));
}

function selectBlendedNumbers(featureRow, strictRow, weights, config) {
    const group = groupPercentiles(featureRow, weights);
    const chain = chainPercentiles(strictRow, config.chainBaseId);
    const alpha = Number(config.groupWeight);
    return Array.from({ length: 100 }, (_, number) => ({
        number,
        score: alpha * group[number] + (1 - alpha) * chain[number]
    }))
        .sort((left, right) => right.score - left.score || left.number - right.number)
        .slice(0, config.betCount)
        .map(item => item.number)
        .sort((left, right) => left - right);
}

function combineRows(featureRows, strictRows) {
    const featureByDate = new Map(featureRows.map(row => [row.date, row]));
    return strictRows
        .map(strictRow => {
            const featureRow = featureByDate.get(strictRow.date);
            return featureRow ? { ...featureRow, strictRow } : null;
        })
        .filter(Boolean);
}

function summarizeConfig(rows, weights, config, economics) {
    return summarizeSelections(
        rows,
        row => selectBlendedNumbers(row, row.strictRow, weights, config),
        economics
    );
}

function summarizeGroupOnly(rows, weights, betCount, economics) {
    return summarizeSelections(
        rows,
        row => rankGroupProbabilities(row, weights)
            .slice(0, betCount)
            .map(item => item.number),
        economics
    );
}

function summarizeChainOnly(rows, chainBaseId, betCount, economics) {
    return summarizeSelections(
        rows,
        row => rankBlockSmallFusion(row.strictRow, {
            ...CHAIN_BASES[chainBaseId],
            betCount
        }).slice(0, betCount).map(item => item.number),
        economics
    );
}

function stripDaily(summary) {
    const { daily, ...rest } = summary;
    return rest;
}

function monthlySummary(daily) {
    const grouped = new Map();
    for (const row of daily) {
        const month = row.date.slice(0, 7);
        if (!grouped.has(month)) grouped.set(month, []);
        grouped.get(month).push(row);
    }
    return [...grouped.entries()].map(([month, rows]) => {
        const wins = rows.filter(row => row.hit).length;
        const stakeK = rows.reduce((sum, row) => sum + row.stakeK, 0);
        const payoutK = rows.reduce((sum, row) => sum + row.payoutK, 0);
        return {
            month,
            days: rows.length,
            wins,
            hitRate: wins / rows.length,
            profitK: payoutK - stakeK,
            roi: stakeK ? (payoutK - stakeK) / stakeK : 0
        };
    });
}

function wilsonInterval(wins, total, z = 1.96) {
    if (!total) return { lower: 0, upper: 0 };
    const probability = wins / total;
    const zSquared = z * z;
    const denominator = 1 + zSquared / total;
    const center = probability + zSquared / (2 * total);
    const margin = z * Math.sqrt(
        (probability * (1 - probability) + zSquared / (4 * total)) / total
    );
    return {
        lower: (center - margin) / denominator,
        upper: (center + margin) / denominator
    };
}

function enrichSummary(summary, betCount, payoutMultiplier) {
    const clean = stripDaily(summary);
    const interval = wilsonInterval(summary.wins, summary.days);
    return {
        ...clean,
        randomBaseline: betCount / 100,
        liftVsRandom: summary.hitRate - betCount / 100,
        breakEvenHitRate: betCount / payoutMultiplier,
        wilson95: interval,
        monthly: monthlySummary(summary.daily)
    };
}

function chooseModelConfig(trainRows, selectionRows) {
    const configs = [
        { learningRate: 0.1, l2: 0.01, epochs: 5 },
        { learningRate: 0.2, l2: 0.03, epochs: 8 },
        { learningRate: 0.35, l2: 0.05, epochs: 10 },
        { learningRate: 0.5, l2: 0.1, epochs: 12 }
    ];
    return configs.map(config => {
        const weights = trainConditionalSoftmax(trainRows, config);
        return {
            config,
            weights,
            selectionMetrics: evaluateProbabilities(selectionRows, weights)
        };
    }).sort((left, right) =>
        left.selectionMetrics.logLoss - right.selectionMetrics.logLoss
        || left.config.l2 - right.config.l2
    )[0];
}

function chooseFusionConfigs(rows, weights, betCounts, economics) {
    const groupWeights = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
    const output = {};
    for (const betCount of betCounts) {
        const candidates = [];
        for (const chainBaseId of Object.keys(CHAIN_BASES)) {
            for (const groupWeight of groupWeights) {
                const config = { chainBaseId, groupWeight, betCount };
                const summary = summarizeConfig(rows, weights, config, economics);
                candidates.push({ config, summary: stripDaily(summary) });
            }
        }
        output[betCount] = candidates.sort((left, right) =>
            right.summary.hitRate - left.summary.hitRate
            || right.summary.profitK - left.summary.profitK
            || left.summary.longestLoss - right.summary.longestLoss
            || left.config.groupWeight - right.config.groupWeight
        )[0];
    }
    return output;
}

function formatPercent(value) {
    return `${(Number(value || 0) * 100).toFixed(4)}%`;
}

function formatMoney(value) {
    return `${Number(value || 0).toLocaleString('vi-VN')}K`;
}

function renderMarkdown(report) {
    const lines = [
        '# Nghiên cứu phân bổ phân cấp nhóm số',
        '',
        `Sinh lúc: ${report.generatedAt}`,
        '',
        '## Phương pháp',
        '',
        '- 15 phân hoạch chuẩn, gom vào 7 trục độc lập: đầu, đít, hai chữ số, tổng truyền thống, tổng mới, hiệu và bộ.',
        '- Mỗi nhóm được chuẩn hóa theo xác suất nền `số lượng nhóm / 100` và co Bayes để nhóm nhỏ không tạo tín hiệu ảo.',
        '- Đặc trưng chỉ dùng dữ liệu trước ngày dự đoán: 20 năm, từ đầu năm, 365/90/30 ngày, gap và chuyển tiếp trạng thái.',
        '- Huấn luyện 2008-2024; chọn tham số và trọng số kết hợp trên nửa đầu 2025; kiểm tra nửa cuối 2025 và giữ 2026 làm holdout.',
        '',
        '## Trọng số mô hình đã học',
        '',
        '| Đặc trưng | Trọng số trước 2025 | Trọng số refit trước 2026 |',
        '|---|---:|---:|'
    ];
    FEATURE_NAMES.forEach((name, index) => {
        lines.push(
            `| ${name} | ${report.model.selectionWeights[index].toFixed(6)} | ${report.model.holdoutWeights[index].toFixed(6)} |`
        );
    });

    lines.push(
        '',
        'Dấu dương nghĩa là nhóm xuất hiện nhiều/gap lớn làm tăng xếp hạng; dấu âm nghĩa là mô hình học hồi quy về trung bình.',
        '',
        '## Kết quả strict PIT',
        '',
        '| Giai đoạn | Số đánh | Cấu hình | Trúng | Nền ngẫu nhiên | Lift | Hòa vốn | Profit | ROI | Chuỗi thua | Wilson 95% |',
        '|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|'
    );
    for (const [windowId, window] of Object.entries(report.evaluation)) {
        for (const [betCount, result] of Object.entries(window.byBetCount)) {
            const summary = result.blend;
            lines.push(
                `| ${windowId} | ${betCount} | ${result.config.chainBaseId} + nhóm ${(result.config.groupWeight * 100).toFixed(0)}% | ${formatPercent(summary.hitRate)} | ${formatPercent(summary.randomBaseline)} | ${formatPercent(summary.liftVsRandom)} | ${formatPercent(summary.breakEvenHitRate)} | ${formatMoney(summary.profitK)} | ${formatPercent(summary.roi)} | ${summary.longestLoss} | ${formatPercent(summary.wilson95.lower)}–${formatPercent(summary.wilson95.upper)} |`
            );
        }
    }

    lines.push(
        '',
        '## So sánh riêng ở Hold 70 / đánh 30',
        '',
        '| Giai đoạn | Chuỗi gốc | Nhóm độc lập | Kết hợp đã khóa |',
        '|---|---:|---:|---:|'
    );
    for (const [windowId, window] of Object.entries(report.evaluation)) {
        const result = window.byBetCount['30'];
        lines.push(
            `| ${windowId} | ${formatPercent(result.chain.hitRate)} (${formatMoney(result.chain.profitK)}) | ${formatPercent(result.group.hitRate)} (${formatMoney(result.group.profitK)}) | ${formatPercent(result.blend.hitRate)} (${formatMoney(result.blend.profitK)}) |`
        );
    }

    lines.push(
        '',
        '## Độ lệch phân bổ theo năm',
        '',
        '| Phân hoạch | Số nhóm | TV trung bình | TV xấu nhất | Chi-square trung bình |',
        '|---|---:|---:|---:|---:|'
    );
    for (const row of report.annualDistribution) {
        lines.push(
            `| ${row.id} | ${row.groups} | ${formatPercent(row.averageTotalVariation)} | ${formatPercent(row.worstTotalVariation)} | ${row.averageChiSquare.toFixed(3)} |`
        );
    }
    return `${lines.join('\n')}\n`;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const rawFile = args.raw || RAW_FILE;
    const trainReportFile = args.train || DEFAULT_TRAIN_REPORT;
    const holdoutReportFile = args.test || DEFAULT_HOLDOUT_REPORT;
    const draws = readJson(rawFile)
        .filter(row => row?.date && Number.isInteger(Number(row.special)))
        .sort((left, right) => left.date.localeCompare(right.date));
    const trainReport = readJson(trainReportFile);
    const holdoutReport = readJson(holdoutReportFile);
    const families = createHierarchicalFamilies();
    const partitionDiagnostics = validatePartitionFamilies(families);
    const featureData = buildFeatureRows(draws, {
        families,
        minimumHistory: 365 * 2,
        priorStrength: Number(args.priorStrength || 120)
    });
    const featureRows = featureData.rows;
    const trainingRows = rowsBetween(featureRows, '2008-01-01', '2024-12-31');
    const selectionRows = rowsBetween(featureRows, '2025-01-01', '2025-06-30');
    const validationFeatureRows = rowsBetween(featureRows, '2025-07-01', '2025-12-31');
    const holdoutFeatureRows = rowsBetween(featureRows, '2026-01-01', '9999-12-31');
    const selectedModel = chooseModelConfig(trainingRows, selectionRows);
    const pre2025Weights = selectedModel.weights;
    const holdoutWeights = trainConditionalSoftmax(
        [...trainingRows, ...rowsBetween(featureRows, '2025-01-01', '2025-12-31')],
        selectedModel.config
    );

    const trainStrictRows = trainReport.rows || [];
    const holdoutStrictRows = holdoutReport.rows || [];
    const selectionCombinedRows = combineRows(
        selectionRows,
        trainStrictRows.filter(row => row.date <= '2025-06-30')
    );
    const validationRows = combineRows(
        validationFeatureRows,
        trainStrictRows.filter(row => row.date >= '2025-07-01')
    );
    const holdoutRows = combineRows(holdoutFeatureRows, holdoutStrictRows);
    if (!selectionCombinedRows.length || !validationRows.length || !holdoutRows.length) {
        throw new Error('Không ghép được đầy đủ feature và strict-PIT rows.');
    }

    const betCounts = [30, 40, 45, 50];
    const economics = { stakePerNumberK: 1000, payoutMultiplier: 84 };
    const selectedFusion = chooseFusionConfigs(
        selectionCombinedRows,
        pre2025Weights,
        betCounts,
        economics
    );

    const evaluateWindow = (rows, weights) => {
        const byBetCount = {};
        for (const betCount of betCounts) {
            const config = selectedFusion[betCount].config;
            const blend = summarizeConfig(rows, weights, config, economics);
            const group = summarizeGroupOnly(rows, weights, betCount, economics);
            const chain = summarizeChainOnly(rows, config.chainBaseId, betCount, economics);
            byBetCount[betCount] = {
                config,
                chain: enrichSummary(chain, betCount, economics.payoutMultiplier),
                group: enrichSummary(group, betCount, economics.payoutMultiplier),
                blend: enrichSummary(blend, betCount, economics.payoutMultiplier)
            };
        }
        return { days: rows.length, byBetCount };
    };

    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'hierarchical-set-distribution-v2-transition',
        strictPointInTime: true,
        productionPromotion: false,
        sources: {
            rawFile: path.relative(ROOT, rawFile),
            trainReport: path.relative(ROOT, trainReportFile),
            holdoutReport: path.relative(ROOT, holdoutReportFile),
            trainFingerprint: trainReport.fingerprint?.runSha256 || null,
            holdoutFingerprint: holdoutReport.fingerprint?.runSha256 || null
        },
        economics,
        partitionDiagnostics,
        model: {
            featureNames: FEATURE_NAMES,
            selectedConfig: selectedModel.config,
            selectionMetrics: selectedModel.selectionMetrics,
            selectionWeights: pre2025Weights,
            holdoutWeights,
            trainingPeriod: '2008-01-01..2024-12-31',
            selectionPeriod: '2025-01-01..2025-06-30',
            validationPeriod: '2025-07-01..2025-12-31',
            holdoutPeriod: `${holdoutRows[0].date}..${holdoutRows.at(-1).date}`
        },
        selectedFusion,
        probabilityMetrics: {
            validation2025H2: evaluateProbabilities(validationFeatureRows, pre2025Weights),
            holdout2026: evaluateProbabilities(holdoutFeatureRows, holdoutWeights)
        },
        evaluation: {
            selection2025H1: evaluateWindow(selectionCombinedRows, pre2025Weights),
            validation2025H2: evaluateWindow(validationRows, pre2025Weights),
            holdout2026: evaluateWindow(holdoutRows, holdoutWeights)
        },
        annualDistribution: annualDistributionDiagnostics(
            draws.filter(row => row.date <= '2025-12-31'),
            families
        )
    };
    report.summariesByWindow = Object.fromEntries(
        Object.entries(report.evaluation).flatMap(([windowId, window]) =>
            Object.entries(window.byBetCount).map(([betCount, result]) => [
                `${windowId}-${betCount}`,
                Object.fromEntries(
                    ['chain', 'group', 'blend'].map(methodId => {
                        const summary = result[methodId];
                        return [
                            methodId,
                            {
                                days: summary.days,
                                betCount: Number(betCount),
                                stakeK: summary.days * Number(betCount) * economics.stakePerNumberK,
                                hitRate: summary.hitRate,
                                profitK: summary.profitK,
                                roi: summary.roi,
                                longestLoss: summary.longestLoss
                            }
                        ];
                    })
                )
            ])
        )
    );

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonFile = path.join(ROOT, `reports/hierarchical-set-distribution-${stamp}.json`);
    const markdownFile = path.join(ROOT, `reports/hierarchical-set-distribution-${stamp}.md`);
    fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2));
    fs.writeFileSync(markdownFile, renderMarkdown(report));
    console.log(JSON.stringify({
        jsonFile,
        markdownFile,
        selectedModel: report.model,
        validation: report.evaluation.validation2025H2.byBetCount,
        holdout: report.evaluation.holdout2026.byBetCount
    }, null, 2));
}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = {
    parseArgs,
    percentileScores,
    selectBlendedNumbers,
    combineRows,
    chooseModelConfig,
    chooseFusionConfigs,
    enrichSummary,
    wilsonInterval
};
