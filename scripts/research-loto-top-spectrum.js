#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const PRIZE_KEYS = [
    'special', 'prize1', 'prize2_1', 'prize2_2',
    'prize3_1', 'prize3_2', 'prize3_3', 'prize3_4', 'prize3_5', 'prize3_6',
    'prize4_1', 'prize4_2', 'prize4_3', 'prize4_4',
    'prize5_1', 'prize5_2', 'prize5_3', 'prize5_4', 'prize5_5', 'prize5_6',
    'prize6_1', 'prize6_2', 'prize6_3',
    'prize7_1', 'prize7_2', 'prize7_3', 'prize7_4'
];
const DEFAULT_STAKE_K = 2200;
const DEFAULT_PAYOUT_K = 8000;
const DEFAULT_BASE_METHOD = 'chainSmallFirstHold65:twoHitGreedy:top20';

function parseArgs(argv) {
    return new Map(argv.slice(2).map(token => {
        const [key, ...rest] = token.replace(/^--/, '').split('=');
        return [key, rest.join('=') || '1'];
    }));
}

function normalizeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? ((Math.trunc(number) % 100) + 100) % 100 : null;
}

function rankFusionMany(experts, agreementBonus = 0, k = 5) {
    const rows = new Map();
    for (const expert of experts) {
        const values = expert.numbers || [];
        const weight = Number(expert.weight || 0);
        values.forEach((raw, index) => {
            const number = normalizeNumber(raw);
            if (number === null) return;
            const row = rows.get(number) || {
                number,
                score: 0,
                votes: 0,
                bestRank: Infinity
            };
            row.score += weight / (k + index + 1);
            row.votes += 1;
            row.bestRank = Math.min(row.bestRank, index + 1);
            rows.set(number, row);
        });
    }
    for (const row of rows.values()) {
        row.score += agreementBonus * Math.max(0, row.votes - 1);
    }
    return Array.from(rows.values()).sort((a, b) =>
        b.score - a.score ||
        b.votes - a.votes ||
        a.bestRank - b.bestRank ||
        a.number - b.number
    ).map(row => row.number);
}

function countActual(day) {
    const counts = new Map();
    for (const key of PRIZE_KEYS) {
        const number = normalizeNumber(day?.[key]);
        if (number === null) continue;
        counts.set(number, (counts.get(number) || 0) + 1);
    }
    return counts;
}

function createSummary() {
    return {
        days: 0,
        hitDays: 0,
        atLeast2Days: 0,
        atLeast3Days: 0,
        totalHits: 0,
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        longestNoHit: 0,
        currentNoHit: 0,
        longestUnder2: 0,
        currentUnder2: 0,
        longestLoss: 0,
        currentLoss: 0
    };
}

function updateSummary(summary, numbers, actualCounts, stakeK, payoutK) {
    const hits = numbers.reduce((sum, number) => sum + (actualCounts.get(number) || 0), 0);
    const dayStakeK = numbers.length * stakeK;
    const dayPayoutK = hits * payoutK;
    const profitK = dayPayoutK - dayStakeK;
    summary.days += 1;
    summary.hitDays += Number(hits >= 1);
    summary.atLeast2Days += Number(hits >= 2);
    summary.atLeast3Days += Number(hits >= 3);
    summary.totalHits += hits;
    summary.stakeK += dayStakeK;
    summary.payoutK += dayPayoutK;
    summary.profitK += profitK;
    summary.currentNoHit = hits === 0 ? summary.currentNoHit + 1 : 0;
    summary.longestNoHit = Math.max(summary.longestNoHit, summary.currentNoHit);
    summary.currentUnder2 = hits < 2 ? summary.currentUnder2 + 1 : 0;
    summary.longestUnder2 = Math.max(summary.longestUnder2, summary.currentUnder2);
    summary.currentLoss = profitK < 0 ? summary.currentLoss + 1 : 0;
    summary.longestLoss = Math.max(summary.longestLoss, summary.currentLoss);
}

function finalizeSummary(summary) {
    const {
        currentNoHit,
        currentUnder2,
        currentLoss,
        ...result
    } = summary;
    return {
        ...result,
        hitRate: result.days ? result.hitDays / result.days : 0,
        atLeast2Rate: result.days ? result.atLeast2Days / result.days : 0,
        atLeast3Rate: result.days ? result.atLeast3Days / result.days : 0,
        avgHitsPerDay: result.days ? result.totalHits / result.days : 0,
        roi: result.stakeK ? result.profitK / result.stakeK : 0
    };
}

function periodForDate(date, trainEnd, validationEnd) {
    if (date <= trainEnd) return 'training';
    if (date <= validationEnd) return 'validation';
    return 'test';
}

function evaluateRanking(rankedByDate, dates, actualByDate, topCount, options) {
    const periods = {
        training: createSummary(),
        validation: createSummary(),
        test: createSummary(),
        full: createSummary()
    };
    const monthly = new Map();
    for (const date of dates) {
        const numbers = (rankedByDate.get(date) || []).slice(0, topCount);
        const actual = actualByDate.get(date) || new Map();
        const period = periodForDate(date, options.trainEnd, options.validationEnd);
        updateSummary(periods[period], numbers, actual, options.stakeK, options.payoutK);
        updateSummary(periods.full, numbers, actual, options.stakeK, options.payoutK);
        if (period === 'test') {
            const month = date.slice(0, 7);
            if (!monthly.has(month)) monthly.set(month, createSummary());
            updateSummary(monthly.get(month), numbers, actual, options.stakeK, options.payoutK);
        }
    }
    return {
        training: finalizeSummary(periods.training),
        validation: finalizeSummary(periods.validation),
        test: finalizeSummary(periods.test),
        full: finalizeSummary(periods.full),
        testMonthly: Object.fromEntries(
            Array.from(monthly.entries()).map(([month, summary]) => [month, finalizeSummary(summary)])
        )
    };
}

function robustCompare(left, right) {
    const leftWorstRoi = Math.min(left.training.roi, left.validation.roi);
    const rightWorstRoi = Math.min(right.training.roi, right.validation.roi);
    if (rightWorstRoi !== leftWorstRoi) return rightWorstRoi - leftWorstRoi;
    const leftWorstHit2 = Math.min(left.training.atLeast2Rate, left.validation.atLeast2Rate);
    const rightWorstHit2 = Math.min(right.training.atLeast2Rate, right.validation.atLeast2Rate);
    if (rightWorstHit2 !== leftWorstHit2) return rightWorstHit2 - leftWorstHit2;
    const leftProfit = left.training.profitK + left.validation.profitK;
    const rightProfit = right.training.profitK + right.validation.profitK;
    if (rightProfit !== leftProfit) return rightProfit - leftProfit;
    return left.id.localeCompare(right.id);
}

function main() {
    const args = parseArgs(process.argv);
    const reportFile = args.get('report');
    if (!reportFile) throw new Error('Cần --report=<backtest_loto_milestone20y_*.json>.');
    const trainEnd = args.get('trainEnd') || '2026-03-31';
    const validationEnd = args.get('validationEnd') || '2026-04-30';
    const topCounts = String(args.get('topCounts') || Array.from({ length: 18 }, (_, i) => i + 3).join(','))
        .split(',').map(Number).filter(value => value >= 1 && value <= 20);
    const weights = String(args.get('weights') || '0.2,0.35,0.5,0.65,0.8')
        .split(',').map(Number).filter(value => value > 0 && value < 1);
    const agreementBonuses = String(args.get('agreementBonuses') || '0,0.01,0.03')
        .split(',').map(Number).filter(value => value >= 0);
    const stakeK = Number(args.get('stakeK') || DEFAULT_STAKE_K);
    const payoutK = Number(args.get('payoutK') || DEFAULT_PAYOUT_K);
    const report = JSON.parse(fs.readFileSync(path.resolve(reportFile), 'utf8'));
    const details = report.dailyDetailsByWindow?.dateRange || [];
    if (!details.length) throw new Error('Report không có dailyDetailsByWindow.dateRange.');
    const raw = JSON.parse(fs.readFileSync(
        path.join(process.cwd(), 'lib', 'data', 'xsmb-2-digits.json'),
        'utf8'
    ));
    const actualByDate = new Map(raw.map(day => [day.date, countActual(day)]));
    const top20Rows = details.filter(row => row.betCount === 20);
    const byMethod = new Map();
    for (const row of top20Rows) {
        if (!byMethod.has(row.methodId)) byMethod.set(row.methodId, new Map());
        byMethod.get(row.methodId).set(row.date, row.numbers.map(Number));
    }
    if (!byMethod.has(DEFAULT_BASE_METHOD)) {
        throw new Error(`Report thiếu baseline ${DEFAULT_BASE_METHOD}.`);
    }
    const dates = Array.from(new Set(top20Rows.map(row => row.date))).sort();
    const smallMethods = Array.from(byMethod.keys()).filter(id => id.startsWith('chainSmallFirst'));
    const blockMethods = Array.from(byMethod.keys()).filter(id => id.startsWith('chainBlockFirst'));
    const candidatesByTop = new Map(topCounts.map(top => [top, []]));
    const options = { trainEnd, validationEnd, stakeK, payoutK };

    const addCandidate = (id, kind, rankedByDate, metadata = {}) => {
        for (const topCount of topCounts) {
            const metrics = evaluateRanking(rankedByDate, dates, actualByDate, topCount, options);
            candidatesByTop.get(topCount).push({
                id: `${id}:top${topCount}`,
                kind,
                topCount,
                ...metadata,
                ...metrics
            });
        }
    };

    for (const methodId of byMethod.keys()) {
        addCandidate(methodId.replace(/:top20$/, ''), 'base', byMethod.get(methodId), { sourceMethods: [methodId] });
    }

    for (const smallMethod of smallMethods) {
        for (const blockMethod of blockMethods) {
            for (const smallWeight of weights) {
                for (const agreementBonus of agreementBonuses) {
                    const rankedByDate = new Map(dates.map(date => [
                        date,
                        rankFusionMany([
                            { numbers: byMethod.get(smallMethod)?.get(date), weight: smallWeight },
                            { numbers: byMethod.get(blockMethod)?.get(date), weight: 1 - smallWeight }
                        ], agreementBonus)
                    ]));
                    addCandidate(
                        `rrf-w${smallWeight}-a${agreementBonus}-${smallMethod}+${blockMethod}`,
                        agreementBonus > 0 ? 'rrf-agreement' : 'rrf',
                        rankedByDate,
                        {
                            sourceMethods: [smallMethod, blockMethod],
                            smallWeight,
                            agreementBonus
                        }
                    );
                }
            }
        }
    }

    const fourExpertGroups = [
        [
            'chainSmallFirstHold65:twoHitGreedy:top20',
            'chainSmallFirstHold65:support:top20',
            'chainBlockFirstHold75:positionPosterior:top20',
            'chainBlockFirstHold75:support:top20'
        ],
        [
            'chainSmallFirstHold65:twoHitGreedy:top20',
            'chainSmallFirstHold65:weightedTwoHit:top20',
            'chainBlockFirstHold75:positionPosterior:top20',
            'chainBlockFirstHold75:positionPosteriorPortfolio:top20'
        ]
    ].filter(group => group.every(method => byMethod.has(method)));
    fourExpertGroups.forEach((group, groupIndex) => {
        for (const agreementBonus of agreementBonuses) {
            const rankedByDate = new Map(dates.map(date => [
                date,
                rankFusionMany(group.map(method => ({
                    numbers: byMethod.get(method)?.get(date),
                    weight: 1 / group.length
                })), agreementBonus)
            ]));
            addCandidate(
                `multi-${groupIndex + 1}-a${agreementBonus}`,
                'multi-expert',
                rankedByDate,
                { sourceMethods: group, agreementBonus }
            );
        }
    });

    const selectedByTop = {};
    const fixedDefinitions = {
        production: {
            kind: 'base',
            sourceMethods: [DEFAULT_BASE_METHOD]
        },
        rrfCoreSupport: {
            kind: 'rrf',
            sourceMethods: [
                DEFAULT_BASE_METHOD,
                'chainBlockFirstHold75:support:top20'
            ],
            smallWeight: 0.5,
            agreementBonus: 0
        },
        rrfCorePosterior: {
            kind: 'rrf',
            sourceMethods: [
                DEFAULT_BASE_METHOD,
                'chainBlockFirstHold75:positionPosterior:top20'
            ],
            smallWeight: 0.5,
            agreementBonus: 0
        },
        rrfCorePortfolio: {
            kind: 'rrf',
            sourceMethods: [
                DEFAULT_BASE_METHOD,
                'chainBlockFirstHold75:positionPosteriorPortfolio:top20'
            ],
            smallWeight: 0.5,
            agreementBonus: 0
        },
        rrfHold65Support: {
            kind: 'rrf',
            sourceMethods: [
                DEFAULT_BASE_METHOD,
                'chainBlockFirstHold65:support:top20'
            ],
            smallWeight: 0.5,
            agreementBonus: 0
        },
        rrfHold65Posterior: {
            kind: 'rrf',
            sourceMethods: [
                DEFAULT_BASE_METHOD,
                'chainBlockFirstHold65:positionPosterior:top20'
            ],
            smallWeight: 0.5,
            agreementBonus: 0
        },
        rrfHold65Portfolio: {
            kind: 'rrf',
            sourceMethods: [
                DEFAULT_BASE_METHOD,
                'chainBlockFirstHold65:positionPosteriorPortfolio:top20'
            ],
            smallWeight: 0.5,
            agreementBonus: 0
        }
    };
    const fixedBenchmarks = {};
    for (const topCount of topCounts) {
        const candidates = candidatesByTop.get(topCount);
        const eligible = candidates.filter(candidate =>
            candidate.training.profitK > 0 &&
            candidate.validation.profitK > 0
        );
        const ranking = (eligible.length ? eligible : candidates).slice().sort(robustCompare);
        const selected = ranking[0];
        const baseline = candidates.find(candidate =>
            candidate.id === DEFAULT_BASE_METHOD.replace(/:top20$/, `:top${topCount}`)
        );
        selectedByTop[topCount] = {
            selected,
            baseline,
            deltaTest: {
                hitRate: selected.test.hitRate - baseline.test.hitRate,
                atLeast2Rate: selected.test.atLeast2Rate - baseline.test.atLeast2Rate,
                avgHitsPerDay: selected.test.avgHitsPerDay - baseline.test.avgHitsPerDay,
                profitK: selected.test.profitK - baseline.test.profitK,
                roi: selected.test.roi - baseline.test.roi,
                longestUnder2: selected.test.longestUnder2 - baseline.test.longestUnder2
            },
            candidateCount: candidates.length,
            eligibleCount: eligible.length,
            topValidationCandidates: ranking.slice(0, 10).map(candidate => ({
                id: candidate.id,
                kind: candidate.kind,
                training: candidate.training,
                validation: candidate.validation,
                test: candidate.test
            }))
        };
        fixedBenchmarks[topCount] = Object.fromEntries(
            Object.entries(fixedDefinitions).map(([key, definition]) => {
                const candidate = candidates.find(row =>
                    row.kind === definition.kind &&
                    JSON.stringify(row.sourceMethods) === JSON.stringify(definition.sourceMethods) &&
                    (definition.smallWeight === undefined || row.smallWeight === definition.smallWeight) &&
                    (definition.agreementBonus === undefined || row.agreementBonus === definition.agreementBonus)
                );
                return [key, candidate || null];
            })
        );
    }

    const output = {
        generatedAt: new Date().toISOString(),
        sourceReport: path.resolve(reportFile),
        methodology: {
            annualBaseline: report.methodology?.annualBaseline,
            sourceWarning: report.methodology?.warning,
            selection: `Train đến ${trainEnd}; chọn bằng độ bền train/validation đến ${validationEnd}; test sau ${validationEnd}.`,
            candidateRules: 'Chỉ chọn cấu hình dương ở cả train và validation; xếp theo ROI tệ hơn của hai giai đoạn, sau đó ≥2 hit.',
            productionBaseline: DEFAULT_BASE_METHOD,
            economics: `${stakeK}K/số, ${payoutK}K/hit.`,
            multipleTesting: 'Đây là sàng lọc nhiều cấu hình. Không promote nếu chưa xác nhận bằng strict PIT hoặc immutable live snapshot.'
        },
        coverage: {
            firstDate: dates[0],
            lastDate: dates.at(-1),
            days: dates.length,
            trainEnd,
            validationEnd,
            testStart: dates.find(date => date > validationEnd)
        },
        config: {
            topCounts,
            weights,
            agreementBonuses,
            smallMethodCount: smallMethods.length,
            blockMethodCount: blockMethods.length,
            stakeK,
            payoutK
        },
        randomBaseline: Object.fromEntries(topCounts.map(topCount => [topCount, {
            expectedHitsPerDay: PRIZE_KEYS.length * topCount / 100,
            breakEvenHitsPerDay: topCount * stakeK / payoutK,
            expectedProfitPerDayK: topCount * (PRIZE_KEYS.length * payoutK / 100 - stakeK)
        }])),
        fixedBenchmarks,
        selectedByTop
    };
    const outputDir = path.join(process.cwd(), 'reports');
    fs.mkdirSync(outputDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(outputDir, `research_loto_top_spectrum_${stamp}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`Report: ${outputPath}`);
    console.table(topCounts.map(topCount => {
        const row = selectedByTop[topCount];
        return {
            top: topCount,
            selected: row.selected.id.replace(`:top${topCount}`, ''),
            kind: row.selected.kind,
            testDays: row.selected.test.days,
            hit: `${(row.selected.test.hitRate * 100).toFixed(2)}%`,
            hit2: `${(row.selected.test.atLeast2Rate * 100).toFixed(2)}%`,
            avgHits: row.selected.test.avgHitsPerDay.toFixed(2),
            profitK: row.selected.test.profitK,
            roi: `${(row.selected.test.roi * 100).toFixed(2)}%`,
            deltaProfitK: row.deltaTest.profitK,
            deltaHit2: `${(row.deltaTest.atLeast2Rate * 100).toFixed(2)}pp`,
            under2: row.selected.test.longestUnder2
        };
    }));
}

if (require.main === module) main();

module.exports = {
    rankFusionMany,
    countActual,
    createSummary,
    updateSummary,
    finalizeSummary,
    periodForDate,
    robustCompare
};
