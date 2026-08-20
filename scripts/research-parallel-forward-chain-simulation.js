#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const annualMilestoneService = require('../lib/services/annualMilestoneService');
const historicalExclusionService = require('../lib/services/historicalExclusionService');
const lotteryService = require('../lib/services/lotteryService');
const {
    formatDisplayDate,
    generateStats,
    mergeEntries,
    normalizeRaw
} = require('../lib/research/strictPitStats');
const {
    buildFrequencyProbabilities,
    buildMarkovProbabilities,
    createScenarioGenerator,
    jaccard,
    sampleCategorical,
    seededRandom,
    settleParallelDay
} = require('../lib/research/forwardScenarioModels');
const {
    conditionalSoftmaxProbabilities,
    fitConditionalSoftmax,
    predictTopK
} = require('../lib/research/strictEnsembleStress');
const { mergeHistoricalAndSuffixStats } = require('../lib/research/rollingStatsMerge');

const ROOT = path.join(__dirname, '..');
const MODELS = [
    'uniform',
    'frequency-posterior',
    'markov-posterior',
    'block-bootstrap',
    'chain-conditional-softmax'
];
const MULTIPLIERS = [1, 2, 3, 4];
const STAKE_PER_UNIT_K = 1000;
const ENSEMBLE_METHODS = [
    'activeOnlyAvgRisk',
    'chainBlockFirst',
    'numberLikelihoodRatio',
    'chainFreqFirst',
    'dedupEdge50Hold',
    'chainSmallFirst'
];
const ENSEMBLE_CONFIGS = [
    { id: 'chainSmallFirst-h70', methods: ['chainSmallFirst'], mode: 'consensus' },
    { id: 'chainBlockFirst-h70', methods: ['chainBlockFirst'], mode: 'consensus' },
    { id: 'numberLikelihoodRatio-h70', methods: ['numberLikelihoodRatio'], mode: 'consensus' },
    { id: 'dedupEdge50Hold-h70', methods: ['dedupEdge50Hold'], mode: 'consensus' },
    {
        id: 'consensus-likelihood-edge-small-top30',
        methods: ['numberLikelihoodRatio', 'dedupEdge50Hold', 'chainSmallFirst'],
        mode: 'consensus'
    },
    {
        id: 'consensus-active-block-small-top30',
        methods: ['activeOnlyAvgRisk', 'chainBlockFirst', 'chainSmallFirst'],
        mode: 'consensus'
    },
    {
        id: 'exclusive-likelihood-frequency-edge-top30',
        methods: ['numberLikelihoodRatio', 'chainFreqFirst', 'dedupEdge50Hold'],
        mode: 'exclusive'
    },
    {
        id: 'consensus-all-six-top30',
        methods: ENSEMBLE_METHODS,
        mode: 'consensus'
    }
];

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value ?? '1'];
    }));
    const lookbackArgument = String(args.get('lookback') || '730').trim().toLowerCase();
    const lookbackDays = lookbackArgument === 'full'
        ? null
        : Math.max(60, Number(lookbackArgument));
    return {
        pathsPerModel: Math.max(1, Number(args.get('paths') || 16)),
        horizonDays: Math.max(1, Number(args.get('horizon') || 14)),
        workers: Math.max(1, Math.min(
            Number(args.get('workers') || Math.min(8, os.cpus().length)),
            os.cpus().length
        )),
        lookbackDays,
        payout: Math.max(1, Number(args.get('payout') || 84)),
        seed: Number(args.get('seed') || 20260717),
        blockSize: Math.max(1, Number(args.get('blockSize') || 7)),
        models: String(args.get('models') || MODELS.join(','))
            .split(',')
            .map(value => value.trim())
            .filter(value => MODELS.includes(value)),
        minAuditJaccard: Math.min(1, Math.max(0, Number(args.get('minAuditJaccard') || 0.9))),
        allowYearRollover: args.get('allowYearRollover') === '1'
    };
}

function nextIsoDate(isoDate) {
    const date = new Date(`${isoDate}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
}

function loadStrictRowsForConditionalModel() {
    const indexPath = path.join(ROOT, 'reports', 'strict_pit_all_methods_2016_2026.json');
    if (!fs.existsSync(indexPath)) {
        throw new Error(`Thiếu strict PIT index: ${indexPath}`);
    }
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const rows = [];
    for (const source of index.sourceReports || []) {
        const filename = path.join(ROOT, 'reports', source.file);
        const report = JSON.parse(fs.readFileSync(filename, 'utf8'));
        if (report.methodologyVersion !== 'strict-prefix-point-in-time-v1') {
            throw new Error(`${source.file} không phải strict PIT.`);
        }
        rows.push(...(report.rows || []));
    }
    rows.sort((left, right) => left.date.localeCompare(right.date));
    return rows;
}

function sampleChainConditional(prediction, conditionalModel, random, predictionDate) {
    const probabilities = conditionalSoftmaxProbabilities(
        { date: predictionDate, strategies: prediction.strategies },
        conditionalModel.methods,
        conditionalModel
    );
    return sampleCategorical(probabilities, random);
}

function serializeBaseline(baseline) {
    return Array.from(baseline.entries()).map(([key, value]) => ({
        ...value,
        key,
        exactCounts: Array.from(value.exactCounts || []),
        cumulative: Array.from(value.cumulative || [])
    }));
}

function deserializeBaseline(rows) {
    return new Map((rows || []).map(row => [row.key, {
        ...row,
        exactCounts: new Map(row.exactCounts || []),
        cumulative: new Map(row.cumulative || [])
    }]));
}

function predictionFromStats(raw, stats, baseline, predictionIsoDate) {
    lotteryService.__setInMemoryCachesForBacktest({ rawData: raw, ...stats });
    historicalExclusionService.clearCache();
    const candidates = annualMilestoneService.buildCandidatesForDate(
        formatDisplayDate(predictionIsoDate),
        baseline,
        {
            historyYears: 20,
            minPotentialCurrentLenForNeverFormed: 4,
            activeFrequencyLimit: 0.5,
            recordFrequencyLimit: 1.1
        }
    );
    const block = annualMilestoneService.buildPrediction(candidates, 85, 'chainBlockFirst');
    const small = annualMilestoneService.buildPrediction(candidates, 65, 'chainSmallFirst');
    const blockNumbers = (block.betNumbers || []).map(Number).sort((a, b) => a - b);
    const smallNumbers = (small.betNumbers || []).map(Number).sort((a, b) => a - b);
    const blockSet = new Set(blockNumbers);
    const smallSet = new Set(smallNumbers);
    const strategies = Object.fromEntries(ENSEMBLE_METHODS.map(method => [
        method,
        (annualMilestoneService.buildPrediction(candidates, 70, method).betNumbers || [])
            .map(Number)
            .sort((a, b) => a - b)
    ]));
    const rankRow = { date: predictionIsoDate, strategies };
    const ensembles = Object.fromEntries(ENSEMBLE_CONFIGS.map(config => [
        config.id,
        predictTopK(rankRow, config.methods, config.mode, 30, null, ENSEMBLE_METHODS)
    ]));
    return {
        blockNumbers,
        smallNumbers,
        unionNumbers: [...new Set([...blockNumbers, ...smallNumbers])].sort((a, b) => a - b),
        intersectionNumbers: [...blockSet].filter(number => smallSet.has(number)).sort((a, b) => a - b),
        strategies,
        ensembles,
        candidateCount: candidates.length
    };
}

async function buildBaselineForYear(raw, predictionYear) {
    const cutoffIso = `${predictionYear - 1}-12-31`;
    const baselineRaw = raw.filter(row => (row._iso || row.date.slice(0, 10)) <= cutoffIso);
    const stats = await generateStats(baselineRaw, true);
    return {
        baseline: annualMilestoneService.buildAnnualBaseline(
            mergeEntries(stats),
            predictionYear,
            { historyYears: 20, writeBaseline: false }
        ),
        historicalStats: stats
    };
}

async function buildPredictionForPrefix(raw, baseline, lookbackDays, historicalStats = null) {
    const stateRaw = lookbackDays ? raw.slice(-lookbackDays) : raw;
    const predictionIsoDate = nextIsoDate(raw.at(-1)._iso || raw.at(-1).date.slice(0, 10));
    const generatedStats = await generateStats(stateRaw, true);
    const stats = lookbackDays && historicalStats
        ? mergeHistoricalAndSuffixStats(historicalStats, generatedStats, stateRaw[0]._iso)
        : generatedStats;
    return {
        predictionIsoDate,
        generationSeconds: generatedStats.elapsedMs / 1000,
        stats,
        prediction: predictionFromStats(raw, stats, baseline, predictionIsoDate)
    };
}

function createPathSummary(model, pathIndex) {
    return {
        model,
        pathIndex,
        days: 0,
        unionHits: 0,
        overlapHits: 0,
        unionCounts: 0,
        intersectionCounts: 0,
        generationSeconds: 0,
        multipliers: Object.fromEntries(MULTIPLIERS.map(multiplier => [multiplier, {
            profitK: 0,
            stakeK: 0,
            peakK: 0,
            maxDrawdownK: 0,
            currentLoss: 0,
            longestLoss: 0
        }])),
        ensembles: Object.fromEntries(ENSEMBLE_CONFIGS.map(config => [config.id, {
            profitK: 0,
            stakeK: 0,
            hits: 0,
            peakK: 0,
            maxDrawdownK: 0,
            currentLoss: 0,
            longestLoss: 0
        }]))
    };
}

async function simulatePath(task, shared) {
    let baseline = deserializeBaseline(shared.baseline);
    let baselineYear = shared.baselineYear;
    let historicalStats = shared.historicalStats;
    const raw = shared.raw.map(row => ({ ...row }));
    const scenario = createScenarioGenerator(task.model, raw, task.seed, {
        frequencyProbabilities: shared.frequencyProbabilities,
        markovProbabilities: shared.markovProbabilities,
        blockSize: shared.blockSize
    });
    const conditionalRandom = seededRandom(task.seed ^ 0x9e3779b9);
    const summary = createPathSummary(task.model, task.pathIndex);
    let prediction = shared.initialPrediction;
    let previousNumber = Number(raw.at(-1).special);

    for (let dayIndex = 0; dayIndex < shared.horizonDays; dayIndex++) {
        const date = nextIsoDate(raw.at(-1)._iso || raw.at(-1).date.slice(0, 10));
        const actual = task.model === 'chain-conditional-softmax'
            ? sampleChainConditional(prediction, shared.conditionalModel, conditionalRandom, date)
            : scenario({ previousNumber, dayIndex });
        const unionSet = new Set(prediction.unionNumbers);
        const intersectionSet = new Set(prediction.intersectionNumbers);
        summary.days++;
        summary.unionHits += unionSet.has(actual) ? 1 : 0;
        summary.overlapHits += intersectionSet.has(actual) ? 1 : 0;
        summary.unionCounts += unionSet.size;
        summary.intersectionCounts += intersectionSet.size;

        for (const multiplier of MULTIPLIERS) {
            const settled = settleParallelDay({
                unionNumbers: prediction.unionNumbers,
                intersectionNumbers: prediction.intersectionNumbers,
                actual,
                multiplier,
                payout: shared.payout
            });
            const state = summary.multipliers[multiplier];
            const profitK = settled.profitUnits * STAKE_PER_UNIT_K;
            state.profitK += profitK;
            state.stakeK += settled.units * STAKE_PER_UNIT_K;
            state.peakK = Math.max(state.peakK, state.profitK);
            state.maxDrawdownK = Math.max(state.maxDrawdownK, state.peakK - state.profitK);
            if (profitK < 0) {
                state.currentLoss++;
                state.longestLoss = Math.max(state.longestLoss, state.currentLoss);
            } else {
                state.currentLoss = 0;
            }
        }

        for (const config of ENSEMBLE_CONFIGS) {
            const state = summary.ensembles[config.id];
            const numbers = prediction.ensembles[config.id] || [];
            const hit = numbers.includes(actual);
            const profitK = (
                (hit ? shared.payout : 0) - numbers.length
            ) * STAKE_PER_UNIT_K;
            state.profitK += profitK;
            state.stakeK += numbers.length * STAKE_PER_UNIT_K;
            state.hits += Number(hit);
            state.peakK = Math.max(state.peakK, state.profitK);
            state.maxDrawdownK = Math.max(state.maxDrawdownK, state.peakK - state.profitK);
            if (profitK < 0) {
                state.currentLoss++;
                state.longestLoss = Math.max(state.longestLoss, state.currentLoss);
            } else {
                state.currentLoss = 0;
            }
        }

        raw.push({ date, _iso: date, special: actual });
        previousNumber = actual;
        if (dayIndex < shared.horizonDays - 1) {
            const nextPredictionYear = Number(nextIsoDate(date).slice(0, 4));
            if (nextPredictionYear !== baselineYear) {
                const annualState = await buildBaselineForYear(raw, nextPredictionYear);
                baseline = annualState.baseline;
                historicalStats = annualState.historicalStats;
                baselineYear = nextPredictionYear;
            }
            const rebuilt = await buildPredictionForPrefix(
                raw,
                baseline,
                shared.lookbackDays,
                historicalStats
            );
            summary.generationSeconds += rebuilt.generationSeconds;
            prediction = rebuilt.prediction;
        }
    }
    return summary;
}

async function runWorker() {
    for (const task of workerData.tasks) {
        try {
            const summary = await simulatePath(task, workerData.shared);
            parentPort.postMessage({ type: 'path', summary });
        } catch (error) {
            parentPort.postMessage({
                type: 'error',
                task,
                error: error?.stack || String(error)
            });
        }
    }
    parentPort.postMessage({ type: 'done' });
}

function percentile(values, probability) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const index = (sorted.length - 1) * probability;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function mean(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function summarizeModel(model, paths) {
    const relevant = paths.filter(path => path.model === model);
    return {
        model,
        paths: relevant.length,
        horizonDays: relevant[0]?.days || 0,
        meanUnionHitRate: mean(relevant.map(path => path.unionHits / path.days)),
        meanOverlapHitRate: mean(relevant.map(path => path.overlapHits / path.days)),
        meanUnionCount: mean(relevant.map(path => path.unionCounts / path.days)),
        meanIntersectionCount: mean(relevant.map(path => path.intersectionCounts / path.days)),
        multipliers: MULTIPLIERS.map(multiplier => {
            const rows = relevant.map(path => path.multipliers[multiplier]);
            const profits = rows.map(row => row.profitK);
            return {
                multiplier,
                probabilityPositive: profits.filter(value => value > 0).length / Math.max(1, profits.length),
                meanProfitK: mean(profits),
                profitP05K: percentile(profits, 0.05),
                medianProfitK: percentile(profits, 0.5),
                profitP95K: percentile(profits, 0.95),
                meanRoi: mean(rows.map(row => row.stakeK ? row.profitK / row.stakeK : 0)),
                drawdownP95K: percentile(rows.map(row => row.maxDrawdownK), 0.95),
                longestLossP95: percentile(rows.map(row => row.longestLoss), 0.95)
            };
        }),
        ensembles: ENSEMBLE_CONFIGS.map(config => {
            const rows = relevant.map(path => path.ensembles[config.id]);
            const profits = rows.map(row => row.profitK);
            return {
                id: config.id,
                methods: config.methods,
                mode: config.mode,
                betCount: 30,
                meanHitRate: mean(rows.map(row => row.hits / Math.max(1, relevant[0]?.days || 0))),
                probabilityPositive: profits.filter(value => value > 0).length / Math.max(1, profits.length),
                meanProfitK: mean(profits),
                profitP05K: percentile(profits, 0.05),
                medianProfitK: percentile(profits, 0.5),
                profitP95K: percentile(profits, 0.95),
                meanRoi: mean(rows.map(row => row.stakeK ? row.profitK / row.stakeK : 0)),
                drawdownP95K: percentile(rows.map(row => row.maxDrawdownK), 0.95),
                longestLossP95: percentile(rows.map(row => row.longestLoss), 0.95)
            };
        })
    };
}

function sha256(value) {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function formatPercent(value) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function formatMoney(value) {
    return `${Math.round(Number(value || 0)).toLocaleString('vi-VN')}K`;
}

function buildMarkdown(report) {
    const lines = [
        '# Forward simulation tái sinh chuỗi Đề Song song',
        '',
        `- Raw thật R2: ${report.source.firstDate} -> ${report.source.latestDate} (${report.source.days.toLocaleString('vi-VN')} ngày).`,
        `- Baseline khóa: ${report.baseline.startIso} -> ${report.baseline.cutoffIso}.`,
        `- ${report.config.pathsPerModel} path/model × ${report.config.models.length} model × ${report.config.horizonDays} ngày = ${report.config.totalSimulatedDays.toLocaleString('vi-VN')} ngày giả lập.`,
        `- Tái sinh pattern với ${report.config.lookbackDays ? `lookback ${report.config.lookbackDays} ngày` : 'toàn bộ raw prefix'} sau từng kết quả; ${report.config.workers} worker.`,
        '- Số đường mô phỏng không phải mẫu lịch sử mới và không chứng minh khả năng dự đoán.',
        '',
        '## Audit xấp xỉ so với full-prefix',
        '',
        `- Block Jaccard: ${formatPercent(report.approximationAudit.blockJaccard)}.`,
        `- Small Jaccard: ${formatPercent(report.approximationAudit.smallJaccard)}.`,
        `- Union Jaccard: ${formatPercent(report.approximationAudit.unionJaccard)}.`,
        `- Trạng thái: ${report.approximationAudit.passed ? 'đạt ngưỡng nghiên cứu' : 'không đạt; không được dùng kết luận'}.`,
        '',
        '## Kết quả theo mô hình sinh tương lai',
        '',
        '| Mô hình | Hit hợp | Hit giao | Số hợp | Số giao | x | P(profit>0) | Profit P05 | Profit giữa | Profit P95 | ROI TB | DD P95 |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|'
    ];
    for (const model of report.models) {
        for (const row of model.multipliers) {
            lines.push(`| ${model.model} | ${formatPercent(model.meanUnionHitRate)} | ${formatPercent(model.meanOverlapHitRate)} | ${model.meanUnionCount.toFixed(2)} | ${model.meanIntersectionCount.toFixed(2)} | x${row.multiplier} | ${formatPercent(row.probabilityPositive)} | ${formatMoney(row.profitP05K)} | ${formatMoney(row.medianProfitK)} | ${formatMoney(row.profitP95K)} | ${formatPercent(row.meanRoi)} | ${formatMoney(row.drawdownP95K)} |`);
        }
    }
    lines.push(
        '',
        '## Top 30 cố định theo phương pháp/tổ hợp',
        '',
        '| Mô hình sinh | Phương pháp | Hit TB | P(profit>0) | Profit P05 | Median | P95 | ROI TB | DD P95 | Thua dài P95 |',
        '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|'
    );
    for (const model of report.models) {
        for (const row of model.ensembles) {
            lines.push(`| ${model.model} | ${row.id} | ${formatPercent(row.meanHitRate)} | ${formatPercent(row.probabilityPositive)} | ${formatMoney(row.profitP05K)} | ${formatMoney(row.medianProfitK)} | ${formatMoney(row.profitP95K)} | ${formatPercent(row.meanRoi)} | ${formatMoney(row.drawdownP95K)} | ${row.longestLossP95.toFixed(1)} |`);
        }
    }
    lines.push(
        '',
        '## Diễn giải',
        '',
        '- Uniform là giả thuyết xổ số độc lập đều; frequency-posterior và markov-posterior đều co mạnh về phân phối đều để tránh học nhiễu.',
        '- Block-bootstrap giữ cụm kết quả lịch sử ngắn hạn nhưng vẫn tái tính chuỗi trên prefix giả lập mới.',
        '- Chain-conditional-softmax học quan hệ giữa membership của sáu phương pháp và kết quả thật strict PIT, rồi tính lại xác suất 00-99 sau mỗi trạng thái chuỗi giả lập. Đây là sensitivity scenario tự tham chiếu, không phải holdout độc lập.',
        '- Chỉ dữ liệu thật walk-forward/holdout mới đo được predictive edge. Forward simulation chủ yếu đo độ nhạy vốn và tính nhất quán dưới các thế giới giả định.',
        `- Production thay đổi: ${report.conclusion.productionChange ? 'Có' : 'Không'}. ${report.conclusion.reason}`
    );
    return `${lines.join('\n')}\n`;
}

async function main() {
    const config = parseArgs();
    if (!config.models.length) throw new Error('Không có mô hình kịch bản hợp lệ.');
    await lotteryService.loadRawData();
    const raw = normalizeRaw(lotteryService.getRawData());
    if (!raw.length) throw new Error('Raw R2 rỗng.');
    const latestDate = raw.at(-1)._iso;
    const predictionYear = Number(latestDate.slice(0, 4));
    let horizonEndDate = latestDate;
    for (let dayIndex = 0; dayIndex < config.horizonDays; dayIndex++) {
        horizonEndDate = nextIsoDate(horizonEndDate);
    }
    if (!config.allowYearRollover && Number(horizonEndDate.slice(0, 4)) !== predictionYear) {
        throw new Error(
            `Horizon ${config.horizonDays} ngày đi qua năm ${predictionYear + 1}. ` +
            'Hãy chia thành từng năm để mỗi năm dùng đúng baseline chốt ngày 31/12 năm trước.'
        );
    }
    const cutoffIso = `${predictionYear - 1}-12-31`;
    const baselineRaw = raw.filter(row => row._iso <= cutoffIso);
    console.log(`[Forward] Sinh annual baseline từ ${baselineRaw.length} ngày R2 đến ${cutoffIso}...`);
    const baselineStats = await generateStats(baselineRaw, true);
    const baseline = annualMilestoneService.buildAnnualBaseline(
        mergeEntries(baselineStats),
        predictionYear,
        { historyYears: 20, writeBaseline: false }
    );
    const serializedBaseline = serializeBaseline(baseline);

    console.log('[Forward] Audit full-prefix và lookback tăng tốc tại ngày mới nhất...');
    const exact = await buildPredictionForPrefix(raw, baseline, null);
    const fast = config.lookbackDays
        ? await buildPredictionForPrefix(raw, baseline, config.lookbackDays, exact.stats)
        : exact;
    const approximationAudit = {
        predictionIsoDate: exact.predictionIsoDate,
        fullGenerationSeconds: exact.generationSeconds,
        fastGenerationSeconds: fast.generationSeconds,
        blockJaccard: jaccard(exact.prediction.blockNumbers, fast.prediction.blockNumbers),
        smallJaccard: jaccard(exact.prediction.smallNumbers, fast.prediction.smallNumbers),
        unionJaccard: jaccard(exact.prediction.unionNumbers, fast.prediction.unionNumbers)
    };
    approximationAudit.passed = approximationAudit.unionJaccard >= config.minAuditJaccard;
    if (!approximationAudit.passed) {
        throw new Error(
            `Lookback ${config.lookbackDays || 'full'} chỉ đạt union Jaccard ${approximationAudit.unionJaccard.toFixed(4)}, ` +
            `thấp hơn ngưỡng ${config.minAuditJaccard}.`
        );
    }

    const frequencyProbabilities = buildFrequencyProbabilities(raw, 100);
    const markovProbabilities = buildMarkovProbabilities(raw, 200);
    const strictRows = config.models.includes('chain-conditional-softmax')
        ? loadStrictRowsForConditionalModel()
        : [];
    const conditionalModel = strictRows.length
        ? fitConditionalSoftmax(strictRows, ENSEMBLE_METHODS, {
            epochs: 100,
            learningRate: 0.25,
            l2: 1
        })
        : null;
    if (conditionalModel) {
        conditionalModel.trainingRows = strictRows.length;
        conditionalModel.firstTrainingDate = strictRows[0].date;
        conditionalModel.lastTrainingDate = strictRows.at(-1).date;
        console.log(
            `[Forward] Chain conditional model: ${strictRows.length} strict rows ` +
            `${strictRows[0].date} -> ${strictRows.at(-1).date}.`
        );
    }
    const tasks = [];
    for (let modelIndex = 0; modelIndex < config.models.length; modelIndex++) {
        const model = config.models[modelIndex];
        for (let pathIndex = 0; pathIndex < config.pathsPerModel; pathIndex++) {
            tasks.push({
                model,
                pathIndex,
                seed: config.seed + modelIndex * 1000003 + pathIndex * 7919
            });
        }
    }
    const workerCount = Math.min(config.workers, tasks.length);
    const assignments = Array.from({ length: workerCount }, () => []);
    tasks.forEach((task, index) => assignments[index % workerCount].push(task));
    const shared = {
        raw: raw.map(row => ({ date: row._iso, _iso: row._iso, special: row.special })),
        baseline: serializedBaseline,
        baselineYear: predictionYear,
        historicalStats: exact.stats,
        initialPrediction: exact.prediction,
        horizonDays: config.horizonDays,
        lookbackDays: config.lookbackDays,
        payout: config.payout,
        blockSize: config.blockSize,
        frequencyProbabilities,
        markovProbabilities,
        conditionalModel
    };
    console.log(`[Forward] Chạy ${tasks.length} path × ${config.horizonDays} ngày trên ${workerCount} worker...`);
    const paths = [];
    const errors = [];
    let completedWorkers = 0;
    let completedPaths = 0;
    await new Promise((resolve, reject) => {
        assignments.forEach(workerTasks => {
            const worker = new Worker(__filename, { workerData: { tasks: workerTasks, shared } });
            worker.on('message', message => {
                if (message.type === 'path') {
                    paths.push(message.summary);
                    completedPaths++;
                    console.log(`[Forward] ${completedPaths}/${tasks.length} ${message.summary.model} #${message.summary.pathIndex}`);
                } else if (message.type === 'error') {
                    errors.push(message);
                    console.error(`[Forward] Lỗi ${message.task?.model} #${message.task?.pathIndex}: ${message.error}`);
                } else if (message.type === 'done') {
                    completedWorkers++;
                    if (completedWorkers === workerCount) resolve();
                }
            });
            worker.on('error', reject);
            worker.on('exit', code => {
                if (code !== 0) reject(new Error(`Worker kết thúc với mã ${code}.`));
            });
        });
    });
    if (errors.length || paths.length !== tasks.length) {
        throw new Error(`Forward simulation thiếu path: ${paths.length}/${tasks.length}, lỗi=${errors.length}.`);
    }

    const models = config.models.map(model => summarizeModel(model, paths));
    const allStable = models.every(model => model.multipliers[1].meanProfitK > 0);
    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'full-forward-chain-replay-v1',
        strictFutureOrder: 'predict -> generate result -> settle -> append -> rebuild chains',
        source: {
            type: 'Cloudflare R2 raw via lotteryService',
            firstDate: raw[0]._iso,
            latestDate,
            days: raw.length,
            sha256: sha256(raw.map(row => ({ date: row._iso, special: row.special })))
        },
        baseline: {
            year: predictionYear,
            startIso: baseline.values().next().value?.startIso,
            cutoffIso,
            entries: baseline.size,
            sha256: sha256(serializedBaseline)
        },
        config: {
            ...config,
            totalPaths: tasks.length,
            totalSimulatedDays: tasks.length * config.horizonDays
        },
        initialPrediction: exact.prediction,
        approximationAudit,
        conditionalModel: conditionalModel ? {
            methods: conditionalModel.methods,
            config: conditionalModel.config,
            weights: conditionalModel.weights,
            trainingRows: conditionalModel.trainingRows,
            firstTrainingDate: conditionalModel.firstTrainingDate,
            lastTrainingDate: conditionalModel.lastTrainingDate
        } : null,
        models,
        conclusion: {
            productionChange: false,
            reason: allStable
                ? 'Mô phỏng ổn định nhưng vẫn cần holdout thật; không tự động đổi production.'
                : 'Profit không dương đồng thời trong mọi cơ chế sinh tương lai.'
        }
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = path.join(ROOT, 'reports', `parallel-forward-chain-simulation-${stamp}`);
    fs.writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));
    fs.writeFileSync(`${base}.md`, buildMarkdown(report));
    console.log(JSON.stringify({
        json: `${base}.json`,
        markdown: `${base}.md`,
        approximationAudit,
        models,
        productionChange: false
    }, null, 2));
}

if (!isMainThread) {
    runWorker().catch(error => {
        parentPort.postMessage({ type: 'error', error: error?.stack || String(error) });
        process.exitCode = 1;
    });
} else {
    main().catch(error => {
        console.error(error.stack || error.message);
        process.exit(1);
    });
}
