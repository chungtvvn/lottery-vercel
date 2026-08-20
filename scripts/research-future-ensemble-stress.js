#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
    adverseHitStress,
    blockBootstrap,
    fitConditionalSoftmax,
    methodVotes,
    multipleTestingNull,
    predictTopK,
    settle
} = require('../lib/research/strictEnsembleStress');

const METHODOLOGY = 'strict-prefix-point-in-time-v1';
const STAKE_PER_NUMBER_K = 1000;
const PAYOUT_MULTIPLIER = 84;
const BET_COUNTS = [10, 20, 30, 40];
const REPRESENTATIVE_METHODS = [
    'activeOnlyAvgRisk',
    'chainBlockFirst',
    'chainCredibleFirst',
    'chainFreqFirst',
    'chainSmallFirst',
    'dedupEdge50Hold',
    'dedupEdge50CombinedB40S05',
    'numberAvgRisk',
    'numberConsensusRisk',
    'numberLikelihoodRatio',
    'numberPosteriorDiversity',
    'numberWeightedRisk'
];

function readJson(filename) {
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function loadStrictRows(root) {
    const index = readJson(path.join(root, 'reports', 'strict_pit_all_methods_2016_2026.json'));
    const rows = [];
    const sources = [];
    for (const source of index.sourceReports || []) {
        const filename = path.join(root, 'reports', source.file);
        const report = readJson(filename);
        if (report.methodologyVersion !== METHODOLOGY || report.options?.dateStep !== 1) {
            throw new Error(`${source.file} không phải strict PIT dateStep=1.`);
        }
        for (const method of REPRESENTATIVE_METHODS) {
            if (!Array.isArray(report.rows?.[0]?.strategies?.[method])) {
                throw new Error(`${source.file} thiếu ${method}.`);
            }
        }
        rows.push(...report.rows);
        sources.push({
            year: source.year,
            file: source.file,
            rows: report.rows.length,
            baselineCutoffDate: report.baselineCutoffDate,
            fingerprint: report.fingerprint?.runSha256 || null
        });
    }
    rows.sort((left, right) => left.date.localeCompare(right.date));
    const dates = new Set();
    for (const row of rows) {
        if (dates.has(row.date)) throw new Error(`Trùng ngày ${row.date}.`);
        dates.add(row.date);
    }
    return { rows, sources };
}

function combinations(values, size, start = 0, prefix = [], output = []) {
    if (prefix.length === size) {
        output.push(prefix.slice());
        return output;
    }
    for (let index = start; index <= values.length - (size - prefix.length); index++) {
        prefix.push(values[index]);
        combinations(values, size, index + 1, prefix, output);
        prefix.pop();
    }
    return output;
}

function compact(summary) {
    const { daily, ...result } = summary;
    return result;
}

function summarizeBy(rows, selector, keySelector) {
    const groups = new Map();
    for (const row of rows) {
        const key = keySelector(row);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return Object.fromEntries([...groups.entries()].map(([key, groupRows]) => [
        key,
        compact(settle(groupRows, selector, {
            stakePerNumberK: STAKE_PER_NUMBER_K,
            payoutMultiplier: PAYOUT_MULTIPLIER
        }))
    ]));
}

function configId(config) {
    return `${config.mode}-top${config.betCount}__${config.methods.join('+')}` +
        (config.l2 === undefined ? '' : `__l2-${config.l2}`);
}

function selectorFor(config, model, globalMethods) {
    return row => predictTopK(
        row,
        config.methods,
        config.mode,
        config.betCount,
        model,
        globalMethods
    );
}

function evaluate(rows, config, model, globalMethods, includeDaily = false) {
    return settle(
        rows,
        selectorFor(config, model, globalMethods),
        { stakePerNumberK: STAKE_PER_NUMBER_K, payoutMultiplier: PAYOUT_MULTIPLIER },
        includeDaily
    );
}

function selectMethodPool(rows) {
    return REPRESENTATIVE_METHODS.map(method => {
        const summary = settle(rows, row => row.strategies[method].map(Number), {
            stakePerNumberK: STAKE_PER_NUMBER_K,
            payoutMultiplier: PAYOUT_MULTIPLIER
        });
        return { method, summary: compact(summary) };
    }).sort((left, right) =>
        right.summary.profitK - left.summary.profitK
        || right.summary.hitRate - left.summary.hitRate
    );
}

function buildStaticConfigs(pool) {
    const result = [];
    for (let size = 2; size <= 5; size++) {
        for (const methods of combinations(pool, size)) {
            for (const mode of ['consensus', 'exclusive', 'middle']) {
                for (const betCount of BET_COUNTS) {
                    const config = { methods, mode, betCount };
                    result.push({ ...config, id: configId(config) });
                }
            }
        }
    }
    return result;
}

function buildSoftmaxConfigs(pool) {
    const result = [];
    for (const methodCount of [4, 6]) {
        if (methodCount > pool.length) continue;
        const methods = pool.slice(0, methodCount);
        for (const l2 of [0.01, 0.1, 1]) {
            for (const betCount of BET_COUNTS) {
                const config = { methods, mode: 'softmax', betCount, l2 };
                result.push({ ...config, id: configId(config) });
            }
        }
    }
    return result;
}

function averageDailyProfit(summary) {
    return summary.days ? summary.profitK / summary.days : -Infinity;
}

function selectionScore(fit, validation) {
    const fitDaily = averageDailyProfit(fit);
    const validationDaily = averageDailyProfit(validation);
    return {
        worstDailyProfitK: Math.min(fitDaily, validationDaily),
        totalDailyProfitK: fitDaily + validationDaily,
        worstHitEdge: Math.min(
            fit.hitRate - fit.averageBets / PAYOUT_MULTIPLIER,
            validation.hitRate - validation.averageBets / PAYOUT_MULTIPLIER
        )
    };
}

function voteBucketSummary(rows, methods) {
    const buckets = new Map();
    for (const row of rows) {
        const actual = Number(row.actual);
        const votes = methodVotes(row, methods).find(item => item.number === actual)?.votes || 0;
        buckets.set(votes, (buckets.get(votes) || 0) + 1);
    }
    return Object.fromEntries([...buckets.entries()].sort((left, right) => left[0] - right[0]));
}

function oracleSummary(rows, methods) {
    const voteBuckets = voteBucketSummary(rows, methods);
    const any = Object.entries(voteBuckets)
        .filter(([votes]) => Number(votes) > 0)
        .reduce((sum, [, count]) => sum + count, 0);
    const all = Number(voteBuckets[methods.length] || 0);
    const exactlyOne = Number(voteBuckets[1] || 0);
    return {
        days: rows.length,
        anyMethodHits: any,
        anyMethodHitRate: rows.length ? any / rows.length : 0,
        allMethodsHits: all,
        allMethodsHitRate: rows.length ? all / rows.length : 0,
        exactlyOneMethodHits: exactlyOne,
        exactlyOneMethodHitRate: rows.length ? exactlyOne / rows.length : 0,
        voteBuckets
    };
}

function pct(value) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function money(value) {
    return `${Number(value || 0).toLocaleString('vi-VN')}K`;
}

function renderMarkdown(report) {
    const lines = [
        '# Ensemble giao/không giao và stress test tương lai',
        '',
        '## Quy trình chống leak',
        '',
        '- 2016–2020: xếp hạng pool và train softmax.',
        '- 2021–2023: fit-evaluation.',
        '- 2024–2025: validation và chọn cấu hình.',
        '- 2026: holdout khóa, không dùng để chọn.',
        '- Mọi cấu hình cùng Top K được so với cùng Top K; 1.000K/số, ăn 84.',
        '',
        `Pool: ${report.methodPool.join(', ')}.`,
        '',
        '## Phương án được chọn trước holdout',
        ''
    ];
    for (const betCount of BET_COUNTS) {
        const selected = report.selectedByBetCount[String(betCount)];
        lines.push(
            `### Top ${betCount}: \`${selected.config.id}\``,
            '',
            '| Giai đoạn | Trúng | Tỷ lệ | Profit | ROI | Thua dài nhất |',
            '|---|---:|---:|---:|---:|---:|',
            `| Fit 2021–2023 | ${selected.fit.wins}/${selected.fit.days} | ${pct(selected.fit.hitRate)} | ${money(selected.fit.profitK)} | ${pct(selected.fit.roi)} | ${selected.fit.longestLoss} |`,
            `| Validation 2024–2025 | ${selected.validation.wins}/${selected.validation.days} | ${pct(selected.validation.hitRate)} | ${money(selected.validation.profitK)} | ${pct(selected.validation.roi)} | ${selected.validation.longestLoss} |`,
            `| Holdout 2026 | ${selected.holdout.wins}/${selected.holdout.days} | ${pct(selected.holdout.hitRate)} | ${money(selected.holdout.profitK)} | ${pct(selected.holdout.roi)} | ${selected.holdout.longestLoss} |`,
            ''
        );
    }
    const top30 = report.selectedByBetCount['30'];
    lines.push(
        '## Giao và không giao của Top 30',
        '',
        `Trong holdout, ít nhất một phương pháp trong pool giữ đúng kết quả ở ${top30.oracleHoldout.anyMethodHits}/${top30.oracleHoldout.days} ngày (${pct(top30.oracleHoldout.anyMethodHitRate)}).`,
        `Kết quả chỉ được đúng đúng một phương pháp giữ ở ${top30.oracleHoldout.exactlyOneMethodHits} ngày (${pct(top30.oracleHoldout.exactlyOneMethodHitRate)}); tất cả phương pháp cùng giữ ở ${top30.oracleHoldout.allMethodsHits} ngày (${pct(top30.oracleHoldout.allMethodsHitRate)}).`,
        '',
        'Oracle chỉ là trần thông tin sau khi biết kết quả; không phải phương pháp có thể sử dụng thực tế.',
        '',
        '## Stress test Top 30 đã khóa',
        '',
        '| Kiểm tra | P có lãi | P05 | Median | P95 | Drawdown P95 |',
        '|---|---:|---:|---:|---:|---:|',
        `| Block bootstrap 365 ngày từ validation | ${pct(top30.stress.validationBlock.probabilityProfitable)} | ${money(top30.stress.validationBlock.profitP05K)} | ${money(top30.stress.validationBlock.profitMedianK)} | ${money(top30.stress.validationBlock.profitP95K)} | ${money(top30.stress.validationBlock.drawdownP95K)} |`,
        `| Block bootstrap 365 ngày từ holdout | ${pct(top30.stress.holdoutBlock.probabilityProfitable)} | ${money(top30.stress.holdoutBlock.profitP05K)} | ${money(top30.stress.holdoutBlock.profitMedianK)} | ${money(top30.stress.holdoutBlock.profitP95K)} | ${money(top30.stress.holdoutBlock.drawdownP95K)} |`,
        '',
        '### Dịch chuyển xác suất bất lợi',
        '',
        '| Giảm hit giả định | Hit dùng mô phỏng | P có lãi | P05 | Median |',
        '|---:|---:|---:|---:|---:|'
    );
    for (const stress of top30.stress.adverse) {
        lines.push(`| ${pct(stress.shift)} | ${pct(stress.assumedHitRate)} | ${pct(stress.probabilityProfitable)} | ${money(stress.profitP05K)} | ${money(stress.profitMedianK)} |`);
    }
    lines.push(
        '',
        '## Kết luận',
        '',
        `Kiểm định best-of-many Top 30: xác suất null vẫn tạo cấu hình đạt ít nhất ${report.top30SelectionBiasStress.observedBestHits} hit là ${pct(report.top30SelectionBiasStress.probabilityNullBestAtLeastObserved)}; P95 của best null là ${report.top30SelectionBiasStress.nullBestHitsP95} hit.`,
        '',
        report.conclusion,
        '',
        '> Stress test đo độ nhạy vốn dưới các giả định; nó không tạo thêm bằng chứng dự báo và không bảo đảm lợi nhuận tương lai.'
    );
    return `${lines.join('\n')}\n`;
}

function main() {
    const root = path.resolve(__dirname, '..');
    const { rows, sources } = loadStrictRows(root);
    const periods = {
        poolTrain2016To2020: rows.filter(row => row.date < '2021-01-01'),
        fit2021To2023: rows.filter(row => row.date >= '2021-01-01' && row.date < '2024-01-01'),
        validation2024To2025: rows.filter(row => row.date >= '2024-01-01' && row.date < '2026-01-01'),
        preHoldout2016To2025: rows.filter(row => row.date < '2026-01-01'),
        holdout2026: rows.filter(row => row.date >= '2026-01-01')
    };
    const standalone = selectMethodPool(periods.poolTrain2016To2020);
    // Pool is frozen using 2016-2020 only. Six methods still cover 56 subsets
    // of size 2-5 while keeping the daily membership search tractable.
    const pool = standalone.slice(0, 6).map(row => row.method);
    const staticConfigs = buildStaticConfigs(pool);
    const softmaxConfigs = buildSoftmaxConfigs(pool);
    const softmaxModels = new Map();
    for (const config of softmaxConfigs) {
        const key = `${config.methods.join('+')}|${config.l2}`;
        if (!softmaxModels.has(key)) {
            softmaxModels.set(key, fitConditionalSoftmax(
                periods.poolTrain2016To2020,
                config.methods,
                { epochs: 70, learningRate: 0.3, l2: config.l2 }
            ));
        }
    }
    const candidates = [...staticConfigs, ...softmaxConfigs].map(config => {
        const modelKey = `${config.methods.join('+')}|${config.l2}`;
        const model = config.mode === 'softmax' ? softmaxModels.get(modelKey) : null;
        const fit = evaluate(periods.fit2021To2023, config, model, REPRESENTATIVE_METHODS);
        const validation = evaluate(periods.validation2024To2025, config, model, REPRESENTATIVE_METHODS);
        return {
            config,
            model,
            fit,
            validation,
            selection: selectionScore(fit, validation)
        };
    });
    const selectedByBetCount = {};
    const finalSoftmaxModels = new Map();
    const finalModelFor = config => {
        if (config.mode !== 'softmax') return null;
        const key = `${config.methods.join('+')}|${config.l2}`;
        if (!finalSoftmaxModels.has(key)) {
            finalSoftmaxModels.set(key, fitConditionalSoftmax(
                periods.preHoldout2016To2025,
                config.methods,
                { epochs: 70, learningRate: 0.3, l2: config.l2 }
            ));
        }
        return finalSoftmaxModels.get(key);
    };
    for (const betCount of BET_COUNTS) {
        const selected = candidates.filter(row => row.config.betCount === betCount)
            .sort((left, right) =>
                right.selection.worstDailyProfitK - left.selection.worstDailyProfitK
                || right.selection.worstHitEdge - left.selection.worstHitEdge
                || right.selection.totalDailyProfitK - left.selection.totalDailyProfitK
                || left.config.id.localeCompare(right.config.id)
            )[0];
        const finalModel = finalModelFor(selected.config);
        const holdout = evaluate(
            periods.holdout2026,
            selected.config,
            finalModel || selected.model,
            REPRESENTATIVE_METHODS,
            true
        );
        const validationDaily = evaluate(
            periods.validation2024To2025,
            selected.config,
            selected.model,
            REPRESENTATIVE_METHODS,
            true
        );
        const holdoutSelector = selectorFor(
            selected.config,
            finalModel || selected.model,
            REPRESENTATIVE_METHODS
        );
        selectedByBetCount[String(betCount)] = {
            config: selected.config,
            fit: compact(selected.fit),
            validation: compact(selected.validation),
            holdout: compact(holdout),
            fitByYear: summarizeBy(
                periods.fit2021To2023,
                selectorFor(selected.config, selected.model, REPRESENTATIVE_METHODS),
                row => row.date.slice(0, 4)
            ),
            validationByYear: summarizeBy(
                periods.validation2024To2025,
                selectorFor(selected.config, selected.model, REPRESENTATIVE_METHODS),
                row => row.date.slice(0, 4)
            ),
            holdoutByMonth: summarizeBy(
                periods.holdout2026,
                holdoutSelector,
                row => row.date.slice(0, 7)
            ),
            oracleHoldout: oracleSummary(periods.holdout2026, selected.config.methods),
            stress: {
                validationBlock: blockBootstrap(validationDaily.daily, {
                    paths: 5000,
                    horizon: 365,
                    blockSize: 14,
                    seed: 20260717 + betCount
                }),
                holdoutBlock: blockBootstrap(holdout.daily, {
                    paths: 5000,
                    horizon: 365,
                    blockSize: 14,
                    seed: 20260817 + betCount
                }),
                adverse: adverseHitStress(compact(holdout), {
                    paths: 10000,
                    horizon: 365,
                    shifts: [0, 0.01, 0.02, 0.03],
                    stakePerNumberK: STAKE_PER_NUMBER_K,
                    payoutMultiplier: PAYOUT_MULTIPLIER,
                    seed: 20260917 + betCount
                })
            },
            holdoutDaily: holdout.daily
        };
    }
    const top30 = selectedByBetCount['30'];
    const baselineConfig = {
        id: 'chainSmallFirst:hold70',
        methods: ['chainSmallFirst'],
        mode: 'consensus',
        betCount: 30
    };
    const baselineSummaries = {
        fit2021To2023: compact(evaluate(
            periods.fit2021To2023,
            baselineConfig,
            null,
            REPRESENTATIVE_METHODS
        )),
        validation2024To2025: compact(evaluate(
            periods.validation2024To2025,
            baselineConfig,
            null,
            REPRESENTATIVE_METHODS
        )),
        holdout2026: compact(evaluate(
            periods.holdout2026,
            baselineConfig,
            null,
            REPRESENTATIVE_METHODS
        ))
    };
    const stablePositive = top30.fit.profitK > 0
        && top30.validation.profitK > 0
        && top30.holdout.profitK > 0
        && top30.stress.validationBlock.probabilityProfitable >= 0.8
        && top30.stress.holdoutBlock.probabilityProfitable >= 0.8;
    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: METHODOLOGY,
        selectionProtocol: 'Pool/train 2016-2020; fit-eval 2021-2023; validation/select 2024-2025; frozen holdout 2026.',
        economics: {
            stakePerNumberK: STAKE_PER_NUMBER_K,
            payoutMultiplier: PAYOUT_MULTIPLIER,
            betCounts: BET_COUNTS
        },
        sources,
        standalonePoolTraining: standalone.map(row => ({
            method: row.method,
            ...row.summary
        })),
        methodPool: pool,
        candidateCount: candidates.length,
        selectedByBetCount,
        baseline: {
            config: baselineConfig,
            summaries: baselineSummaries
        },
        summariesByWindow: {
            fit2021To2023: {
                'chainSmallFirst:hold70': baselineSummaries.fit2021To2023,
                [top30.config.id]: top30.fit
            },
            validation2024To2025: {
                'chainSmallFirst:hold70': baselineSummaries.validation2024To2025,
                [top30.config.id]: top30.validation
            },
            holdout2026: {
                'chainSmallFirst:hold70': baselineSummaries.holdout2026,
                [top30.config.id]: top30.holdout
            }
        },
        top30DiagnosticHoldoutOnly: candidates.filter(row => row.config.betCount === 30)
            .map(row => {
                const finalModel = finalModelFor(row.config) || row.model;
                return {
                    config: row.config,
                    holdout: compact(evaluate(
                        periods.holdout2026,
                        row.config,
                        finalModel,
                        REPRESENTATIVE_METHODS
                    ))
                };
            }).sort((left, right) =>
                right.holdout.profitK - left.holdout.profitK
                || right.holdout.hitRate - left.holdout.hitRate
            ).slice(0, 20),
        top30SelectionBiasStress: multipleTestingNull(
            periods.holdout2026,
            candidates.filter(row => row.config.betCount === 30).map(row => {
                const finalModel = finalModelFor(row.config) || row.model;
                return {
                    id: row.config.id,
                    selector: selectorFor(row.config, finalModel, REPRESENTATIVE_METHODS)
                };
            }),
            { paths: 5000, seed: 20260719 }
        ),
        decision: stablePositive ? 'eligible-for-independent-live-validation' : 'do-not-promote',
        conclusion: stablePositive
            ? 'Top 30 được chọn trước holdout dương qua mọi giai đoạn và stress; cần kiểm chứng live bất biến trước production.'
            : 'Không có bằng chứng đủ bền để thay production: phương án tốt nhất trước holdout không duy trì đồng thời profit dương và xác suất stress cao qua các chế độ.'
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(root, 'reports', `future-ensemble-stress-${stamp}.json`);
    const mdPath = path.join(root, 'reports', `future-ensemble-stress-${stamp}.md`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(mdPath, renderMarkdown(report));
    console.log(JSON.stringify({
        jsonPath,
        mdPath,
        methodPool: pool,
        candidateCount: candidates.length,
        selectedByBetCount: Object.fromEntries(Object.entries(selectedByBetCount).map(([key, value]) => [key, {
            config: value.config,
            fit: value.fit,
            validation: value.validation,
            holdout: value.holdout,
            stress: value.stress
        }])),
        decision: report.decision
    }, null, 2));
}

if (require.main === module) main();

module.exports = {
    buildSoftmaxConfigs,
    buildStaticConfigs,
    configId,
    loadStrictRows,
    oracleSummary,
    selectionScore
};
