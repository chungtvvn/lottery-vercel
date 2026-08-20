#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const {
    Worker,
    isMainThread,
    parentPort,
    workerData
} = require('worker_threads');
const { wilsonInterval } = require('../lib/research/multiyearProfitGuard');

const ROOT = path.join(__dirname, '..');
const STAKE_PER_UNIT_K = 1000;
const DEFAULT_PAYOUT = 84;
const DEFAULT_MULTIPLIERS = [1, 2, 3, 4, 5, 6, 7, 8];

function seededRandom(seed) {
    let state = Number(seed) >>> 0;
    return () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function workerSimulation(data) {
    const {
        rows,
        iterations,
        horizonDays,
        blockSize,
        payoutMultiplier,
        multipliers,
        seed
    } = data;
    const random = seededRandom(seed);
    const result = Object.fromEntries(multipliers.map(multiplier => [multiplier, {
        profits: [],
        rois: [],
        maxDrawdowns: [],
        longestLosses: [],
        hitRates: [],
        overlapRates: []
    }]));

    for (let iteration = 0; iteration < iterations; iteration++) {
        const states = Object.fromEntries(multipliers.map(multiplier => [multiplier, {
            profit: 0,
            stake: 0,
            peak: 0,
            maxDrawdown: 0,
            currentLoss: 0,
            longestLoss: 0
        }]));
        let hitDays = 0;
        let overlapDays = 0;
        let sampled = 0;
        while (sampled < horizonDays) {
            const start = Math.floor(random() * rows.length);
            for (let offset = 0; offset < blockSize && sampled < horizonDays; offset++) {
                const row = rows[(start + offset) % rows.length];
                const basePayout = row.unionHit ? payoutMultiplier * STAKE_PER_UNIT_K : 0;
                const baseProfit = basePayout - row.unionCount * STAKE_PER_UNIT_K;
                const marginalProfit = (
                    row.overlapHit ? payoutMultiplier * STAKE_PER_UNIT_K : 0
                ) - row.intersectionCount * STAKE_PER_UNIT_K;
                hitDays += row.unionHit ? 1 : 0;
                overlapDays += row.overlapHit ? 1 : 0;

                for (const multiplier of multipliers) {
                    const state = states[multiplier];
                    const dailyProfit = baseProfit + (multiplier - 1) * marginalProfit;
                    const dailyStake = (
                        row.unionCount + (multiplier - 1) * row.intersectionCount
                    ) * STAKE_PER_UNIT_K;
                    state.profit += dailyProfit;
                    state.stake += dailyStake;
                    state.peak = Math.max(state.peak, state.profit);
                    state.maxDrawdown = Math.max(state.maxDrawdown, state.peak - state.profit);
                    if (dailyProfit < 0) {
                        state.currentLoss++;
                        state.longestLoss = Math.max(state.longestLoss, state.currentLoss);
                    } else {
                        state.currentLoss = 0;
                    }
                }
                sampled++;
            }
        }

        for (const multiplier of multipliers) {
            const state = states[multiplier];
            const bucket = result[multiplier];
            bucket.profits.push(state.profit);
            bucket.rois.push(state.stake ? state.profit / state.stake : 0);
            bucket.maxDrawdowns.push(state.maxDrawdown);
            bucket.longestLosses.push(state.longestLoss);
            bucket.hitRates.push(hitDays / horizonDays);
            bucket.overlapRates.push(overlapDays / horizonDays);
        }
    }
    return result;
}

if (!isMainThread) {
    parentPort.postMessage(workerSimulation(workerData));
} else {
    function parseArgs() {
        return new Map(process.argv.slice(2).map(argument => {
            const [key, value] = argument.replace(/^--/, '').split('=');
            return [key, value ?? '1'];
        }));
    }

    function readJson(file) {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    }

    function sha256(file) {
        return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }

    function latestMultiplierReport() {
        const files = fs.readdirSync(path.join(ROOT, 'reports'))
            .filter(file => /^parallel-hold-multipliers-.*\.json$/.test(file));
        const reports = files.map(file => {
            const absolute = path.join(ROOT, 'reports', file);
            const payload = readJson(absolute);
            return { absolute, payload };
        }).filter(item => item.payload.methodology?.version === 'strict-prefix-point-in-time-v1');
        reports.sort((left, right) => String(right.payload.generatedAt).localeCompare(String(left.payload.generatedAt)));
        if (!reports.length) throw new Error('Không tìm thấy báo cáo multiplier strict PIT.');
        return reports[0];
    }

    function readStrictReport(file) {
        const report = readJson(file);
        if (report.methodologyVersion !== 'strict-prefix-point-in-time-v1') {
            throw new Error(`${file} không phải strict-prefix-point-in-time-v1.`);
        }
        if (!Array.isArray(report.rows) || !report.rows.length) {
            throw new Error(`${file} không có dữ liệu ngày.`);
        }
        return report;
    }

    function numberSet(row, strategy, target) {
        const values = row.strategiesByTarget?.[String(target)]?.[strategy];
        if (!Array.isArray(values)) {
            throw new Error(`Thiếu ${strategy} Hold ${target} ngày ${row.date}.`);
        }
        return new Set(values.map(Number));
    }

    function outcomeRows(report) {
        return report.rows.map(row => {
            const block = numberSet(row, 'chainBlockFirst', 85);
            const small = numberSet(row, 'chainSmallFirst', 65);
            const union = new Set([...block, ...small]);
            const intersection = new Set([...block].filter(number => small.has(number)));
            const actual = Number(row.actual);
            return {
                date: row.date,
                actual,
                unionCount: union.size,
                intersectionCount: intersection.size,
                unionHit: union.has(actual),
                overlapHit: intersection.has(actual)
            };
        });
    }

    function longestLoss(rows, multiplier, payoutMultiplier) {
        let current = 0;
        let longest = 0;
        for (const row of rows) {
            const units = row.unionCount + (multiplier - 1) * row.intersectionCount;
            const payoutUnits = row.overlapHit ? multiplier : (row.unionHit ? 1 : 0);
            const profit = (payoutUnits * payoutMultiplier - units) * STAKE_PER_UNIT_K;
            current = profit < 0 ? current + 1 : 0;
            longest = Math.max(longest, current);
        }
        return longest;
    }

    function summarizeActual(rows, multiplier, payoutMultiplier) {
        const units = rows.reduce(
            (sum, row) => sum + row.unionCount + (multiplier - 1) * row.intersectionCount,
            0
        );
        const payoutUnits = rows.reduce(
            (sum, row) => sum + (row.overlapHit ? multiplier : (row.unionHit ? 1 : 0)),
            0
        );
        const unionHits = rows.filter(row => row.unionHit).length;
        const overlapHits = rows.filter(row => row.overlapHit).length;
        const stakeK = units * STAKE_PER_UNIT_K;
        const payoutK = payoutUnits * payoutMultiplier * STAKE_PER_UNIT_K;
        return {
            multiplier,
            days: rows.length,
            unionHits,
            unionHitRate: unionHits / rows.length,
            overlapHits,
            overlapHitRate: overlapHits / rows.length,
            overlapShareOfHits: unionHits ? overlapHits / unionHits : 0,
            averageUnionCount: rows.reduce((sum, row) => sum + row.unionCount, 0) / rows.length,
            averageIntersectionCount: rows.reduce((sum, row) => sum + row.intersectionCount, 0) / rows.length,
            averageUnitCount: units / rows.length,
            stakeK,
            payoutK,
            profitK: payoutK - stakeK,
            roi: stakeK ? (payoutK - stakeK) / stakeK : 0,
            longestLoss: longestLoss(rows, multiplier, payoutMultiplier)
        };
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

    function mergeWorkerResults(results, multipliers) {
        return Object.fromEntries(multipliers.map(multiplier => {
            const merged = {
                profits: [], rois: [], maxDrawdowns: [], longestLosses: [], hitRates: [], overlapRates: []
            };
            for (const result of results) {
                for (const key of Object.keys(merged)) merged[key].push(...result[multiplier][key]);
            }
            return [multiplier, merged];
        }));
    }

    function summarizeSimulation(values, multiplier) {
        const mean = list => list.reduce((sum, value) => sum + value, 0) / list.length;
        return {
            multiplier,
            iterations: values.profits.length,
            probabilityPositive: values.profits.filter(value => value > 0).length / values.profits.length,
            meanProfitK: mean(values.profits),
            medianProfitK: percentile(values.profits, 0.5),
            profitP05K: percentile(values.profits, 0.05),
            profitP95K: percentile(values.profits, 0.95),
            meanRoi: mean(values.rois),
            drawdownP50K: percentile(values.maxDrawdowns, 0.5),
            drawdownP95K: percentile(values.maxDrawdowns, 0.95),
            longestLossP50: percentile(values.longestLosses, 0.5),
            longestLossP95: percentile(values.longestLosses, 0.95),
            meanHitRate: mean(values.hitRates),
            meanOverlapRate: mean(values.overlapRates)
        };
    }

    async function simulateModel(rows, options) {
        const workers = Math.max(1, Math.min(options.workers, options.iterations));
        const base = Math.floor(options.iterations / workers);
        const remainder = options.iterations % workers;
        const tasks = [];
        for (let index = 0; index < workers; index++) {
            const iterations = base + (index < remainder ? 1 : 0);
            tasks.push(new Promise((resolve, reject) => {
                const worker = new Worker(__filename, {
                    workerData: {
                        rows,
                        iterations,
                        horizonDays: options.horizonDays,
                        blockSize: options.blockSize,
                        payoutMultiplier: options.payoutMultiplier,
                        multipliers: options.multipliers,
                        seed: options.seed + index * 7919
                    }
                });
                worker.once('message', resolve);
                worker.once('error', reject);
                worker.once('exit', code => {
                    if (code !== 0) reject(new Error(`Worker kết thúc với mã ${code}.`));
                });
            }));
        }
        const merged = mergeWorkerResults(await Promise.all(tasks), options.multipliers);
        return options.multipliers.map(multiplier => summarizeSimulation(merged[multiplier], multiplier));
    }

    function pct(value) {
        return `${(Number(value || 0) * 100).toFixed(2)}%`;
    }

    function money(value) {
        return `${Math.round(Number(value || 0)).toLocaleString('vi-VN')}K`;
    }

    function markdown(report) {
        const lines = [
            '# Mô phỏng tương lai Đề song song Block85 + Small65',
            '',
            `- Nguồn train: ${report.sources.train.startDate} -> ${report.sources.train.endDate}.`,
            `- Holdout thực tế: ${report.sources.holdout.startDate} -> ${report.sources.holdout.endDate}.`,
            `- Mô phỏng: ${report.simulation.iterationsPerModel.toLocaleString('vi-VN')} đường/model × ${report.simulation.models.length} model × ${report.simulation.horizonDays} ngày, ${report.simulation.workers} worker.`,
            '- Mô phỏng đo phân phối rủi ro theo giả định; không làm tăng cỡ mẫu thực và không chứng minh dự đoán chính xác.',
            '',
            '## Đối chiếu kết quả thật',
            '',
            '| Giai đoạn | x | Trúng hợp | Trúng giao | Số giao/ngày | Profit | ROI | Thua dài |',
            '|---|---:|---:|---:|---:|---:|---:|---:|'
        ];
        for (const period of ['train', 'holdout', 'combined']) {
            for (const row of report.actual[period]) {
                lines.push(`| ${period} | x${row.multiplier} | ${row.unionHits}/${row.days} (${pct(row.unionHitRate)}) | ${row.overlapHits}/${row.days} (${pct(row.overlapHitRate)}) | ${row.averageIntersectionCount.toFixed(2)} | ${money(row.profitK)} | ${pct(row.roi)} | ${row.longestLoss} |`);
            }
        }
        lines.push('', '## Monte Carlo 365 ngày', '');
        lines.push('| Model | x | P(profit > 0) | Profit P05 | Profit giữa | Profit P95 | ROI TB | Drawdown P95 | Thua dài P95 |');
        lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
        for (const model of report.simulation.models) {
            for (const row of model.results) {
                lines.push(`| ${model.id} | x${row.multiplier} | ${pct(row.probabilityPositive)} | ${money(row.profitP05K)} | ${money(row.medianProfitK)} | ${money(row.profitP95K)} | ${pct(row.meanRoi)} | ${money(row.drawdownP95K)} | ${row.longestLossP95.toFixed(0)} |`);
            }
        }
        lines.push(
            '',
            '## Kết luận kiểm định',
            '',
            `- Tỷ lệ giao train: ${pct(report.calibration.trainOverlapRate)}, holdout: ${pct(report.calibration.holdoutOverlapRate)}; Wilson holdout ${pct(report.calibration.holdoutOverlapWilson95.lower)}–${pct(report.calibration.holdoutOverlapWilson95.upper)}.`,
            `- Điểm hòa vốn marginal xN tại ăn ${report.economics.payoutMultiplier}: ${pct(report.calibration.combinedMarginalBreakEvenRate)}; quan sát ${pct(report.calibration.combinedOverlapRate)}.`,
            `- Wilson lower của giao trên dữ liệu gộp là ${pct(report.calibration.combinedOverlapWilson95.lower)}, ${report.calibration.multiplierEvidencePasses ? 'vượt' : 'chưa vượt'} điểm hòa vốn marginal.`,
            '- Không tăng hệ số production chỉ vì median Monte Carlo dương; cần tín hiệu giao vượt hòa vốn trên holdout thực và snapshot bất biến.'
        );
        return `${lines.join('\n')}\n`;
    }

    async function main() {
        const args = parseArgs();
        const index = latestMultiplierReport();
        const trainFile = path.resolve(args.get('train') || index.payload.sources.train.file);
        const holdoutFile = path.resolve(args.get('holdout') || index.payload.sources.frozenTest.file);
        const trainReport = readStrictReport(trainFile);
        const holdoutReport = readStrictReport(holdoutFile);
        const trainRows = outcomeRows(trainReport);
        const holdoutRows = outcomeRows(holdoutReport);
        const combinedRows = [...trainRows, ...holdoutRows].sort((a, b) => a.date.localeCompare(b.date));
        const payoutMultiplier = Number(args.get('payout') || DEFAULT_PAYOUT);
        const multipliers = DEFAULT_MULTIPLIERS;
        const iterationsPerModel = Math.max(100, Number(args.get('iterations') || 25000));
        const horizonDays = Math.max(7, Number(args.get('horizon') || 365));
        const workers = Math.max(1, Math.min(
            Number(args.get('workers') || Math.min(8, os.cpus().length)),
            os.cpus().length
        ));
        const actual = {
            train: multipliers.map(multiplier => summarizeActual(trainRows, multiplier, payoutMultiplier)),
            holdout: multipliers.map(multiplier => summarizeActual(holdoutRows, multiplier, payoutMultiplier)),
            combined: multipliers.map(multiplier => summarizeActual(combinedRows, multiplier, payoutMultiplier))
        };

        const modelConfigs = [
            { id: 'iid-combined', rows: combinedRows, blockSize: 1 },
            { id: 'weekly-block-combined', rows: combinedRows, blockSize: 7 },
            { id: 'monthly-block-combined', rows: combinedRows, blockSize: 28 },
            { id: 'stress-2025-monthly', rows: trainRows, blockSize: 28 }
        ];
        const models = [];
        for (let index = 0; index < modelConfigs.length; index++) {
            const config = modelConfigs[index];
            console.log(`[MonteCarlo] ${config.id}: ${iterationsPerModel.toLocaleString()} paths...`);
            models.push({
                id: config.id,
                blockSize: config.blockSize,
                sourceDays: config.rows.length,
                results: await simulateModel(config.rows, {
                    iterations: iterationsPerModel,
                    horizonDays,
                    blockSize: config.blockSize,
                    payoutMultiplier,
                    multipliers,
                    workers,
                    seed: 20260717 + index * 1000003
                })
            });
        }

        const trainOverlapHits = trainRows.filter(row => row.overlapHit).length;
        const holdoutOverlapHits = holdoutRows.filter(row => row.overlapHit).length;
        const combinedOverlapHits = combinedRows.filter(row => row.overlapHit).length;
        const averageIntersection = combinedRows.reduce((sum, row) => sum + row.intersectionCount, 0) / combinedRows.length;
        const calibration = {
            trainOverlapRate: trainOverlapHits / trainRows.length,
            holdoutOverlapRate: holdoutOverlapHits / holdoutRows.length,
            combinedOverlapRate: combinedOverlapHits / combinedRows.length,
            trainOverlapWilson95: wilsonInterval(trainOverlapHits, trainRows.length),
            holdoutOverlapWilson95: wilsonInterval(holdoutOverlapHits, holdoutRows.length),
            combinedOverlapWilson95: wilsonInterval(combinedOverlapHits, combinedRows.length),
            averageIntersectionCount: averageIntersection,
            combinedMarginalBreakEvenRate: averageIntersection / payoutMultiplier
        };
        calibration.multiplierEvidencePasses = calibration.combinedOverlapWilson95.lower
            > calibration.combinedMarginalBreakEvenRate;

        const report = {
            generatedAt: new Date().toISOString(),
            methodologyVersion: 'parallel-future-monte-carlo-v1',
            sources: {
                multiplierIndex: index.absolute,
                train: {
                    file: trainFile,
                    sha256: sha256(trainFile),
                    baselineCutoffDate: trainReport.baselineCutoffDate,
                    startDate: trainRows[0].date,
                    endDate: trainRows.at(-1).date,
                    days: trainRows.length
                },
                holdout: {
                    file: holdoutFile,
                    sha256: sha256(holdoutFile),
                    baselineCutoffDate: holdoutReport.baselineCutoffDate,
                    startDate: holdoutRows[0].date,
                    endDate: holdoutRows.at(-1).date,
                    days: holdoutRows.length
                }
            },
            economics: {
                unit: 'K_VND',
                stakePerUnitK: STAKE_PER_UNIT_K,
                payoutMultiplier
            },
            calibration,
            actual,
            simulation: {
                horizonDays,
                iterationsPerModel,
                totalPaths: iterationsPerModel * modelConfigs.length,
                workers,
                models
            },
            conclusion: {
                productionChange: false,
                reason: calibration.multiplierEvidencePasses
                    ? 'Marginal overlap passes the combined lower-bound gate, but still needs a fresh immutable holdout.'
                    : 'Marginal overlap does not pass the Wilson lower-bound break-even gate.'
            }
        };
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputBase = path.join(ROOT, 'reports', `parallel-future-monte-carlo-${stamp}`);
        fs.writeFileSync(`${outputBase}.json`, JSON.stringify(report, null, 2));
        fs.writeFileSync(`${outputBase}.md`, markdown(report));
        console.log(JSON.stringify({
            json: `${outputBase}.json`,
            markdown: `${outputBase}.md`,
            calibration,
            actual: {
                train: actual.train,
                holdout: actual.holdout,
                combined: actual.combined
            },
            productionChange: report.conclusion.productionChange
        }, null, 2));
    }

    main().catch(error => {
        console.error(error.stack || error.message);
        process.exit(1);
    });
}
