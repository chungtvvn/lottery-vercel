#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);
const STAKE_PER_NUMBER_K = 1000;
const PAYOUT_MULTIPLIER = 84;
const STRATEGY_IDS = [
    'chainBlockFirst',
    'chainSmallFirst',
    'numberAvgRisk',
    'numberConsensusRisk',
    'numberPosteriorDiversity'
];

function parseArgs(argv) {
    const args = {};
    for (const token of argv.slice(2)) {
        if (!token.startsWith('--')) continue;
        const [key, ...rest] = token.slice(2).split('=');
        args[key] = rest.join('=');
    }
    return args;
}

function loadRows(files) {
    const byDate = new Map();
    for (const filename of files) {
        const report = JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'));
        for (const row of report.rows || []) byDate.set(row.date, row);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function intersectionSize(left, right) {
    const rightSet = new Set(right);
    return left.filter(value => rightSet.has(value)).length;
}

function jaccard(left, right) {
    const common = intersectionSize(left, right);
    return common / Math.max(1, new Set([...left, ...right]).size);
}

function votePrediction(row) {
    const votes = ALL_NUMBERS.map(number => ({
        number,
        votes: STRATEGY_IDS.reduce(
            (sum, id) => sum + Number((row.strategies[id] || []).includes(number)),
            0
        )
    })).sort((a, b) => b.votes - a.votes || a.number - b.number);
    return {
        numbers: votes.slice(0, 30).map(item => item.number),
        votes
    };
}

function deriveRow(row) {
    const vote = votePrediction(row);
    const pairwise = [];
    for (let left = 0; left < STRATEGY_IDS.length; left++) {
        for (let right = left + 1; right < STRATEGY_IDS.length; right++) {
            pairwise.push(jaccard(
                row.strategies[STRATEGY_IDS[left]] || [],
                row.strategies[STRATEGY_IDS[right]] || []
            ));
        }
    }
    const block = row.strategies.chainBlockFirst || [];
    const avg = row.strategies.numberAvgRisk || [];
    const consensus = row.strategies.numberConsensusRisk || [];
    const selectedUnion = new Set(
        STRATEGY_IDS.flatMap(id => row.strategies[id] || [])
    );
    return {
        ...row,
        derivedStrategies: {
            chainBlockFirst: block,
            chainSmallFirst: row.strategies.chainSmallFirst || [],
            numberAvgRisk: avg,
            numberConsensusRisk: consensus,
            voteTop30: vote.numbers
        },
        features: {
            candidateCount: Number(row.candidateCount || 0),
            pairwiseAgreement: pairwise.reduce((sum, value) => sum + value, 0) /
                Math.max(1, pairwise.length),
            blockAvgOverlap: intersectionSize(block, avg) / 30,
            blockConsensusOverlap: intersectionSize(block, consensus) / 30,
            avgConsensusOverlap: intersectionSize(avg, consensus) / 30,
            top30MeanVotes: vote.votes.slice(0, 30)
                .reduce((sum, item) => sum + item.votes, 0) / 30,
            voteMargin: vote.votes[29].votes - vote.votes[30].votes,
            highConsensusCount: vote.votes.filter(item => item.votes >= 4).length,
            selectedUnionSize: selectedUnion.size
        }
    };
}

function summarize(rows, strategyId) {
    let wins = 0;
    let currentLoss = 0;
    let longestLoss = 0;
    const details = [];
    for (const row of rows) {
        const betNumbers = row.derivedStrategies[strategyId] || [];
        const win = betNumbers.includes(row.actual);
        wins += Number(win);
        if (win) currentLoss = 0;
        else {
            currentLoss++;
            longestLoss = Math.max(longestLoss, currentLoss);
        }
        details.push({
            date: row.date,
            actual: row.actual,
            win,
            betNumbers,
            features: row.features
        });
    }
    const stakeK = rows.length * 30 * STAKE_PER_NUMBER_K;
    const profitK = wins * PAYOUT_MULTIPLIER * STAKE_PER_NUMBER_K - stakeK;
    return {
        days: rows.length,
        wins,
        hitRate: rows.length ? wins / rows.length : 0,
        stakeK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestLoss,
        rows: details
    };
}

function quantile(values, probability) {
    const sorted = values.slice().sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const index = Math.min(
        sorted.length - 1,
        Math.max(0, Math.round((sorted.length - 1) * probability))
    );
    return sorted[index];
}

function buildSelectors(trainingRows) {
    const features = Object.keys(trainingRows[0].features);
    const selectors = [];
    for (const feature of features) {
        const values = trainingRows.map(row => row.features[feature]);
        for (const direction of ['high', 'low']) {
            for (const probability of [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95]) {
                selectors.push({
                    feature,
                    direction,
                    probability,
                    threshold: quantile(values, probability)
                });
            }
        }
    }
    return selectors;
}

function applySelector(rows, selector) {
    return rows.filter(row => selector.direction === 'high'
        ? row.features[selector.feature] >= selector.threshold
        : row.features[selector.feature] <= selector.threshold);
}

function evaluate(trainingRows) {
    const selectors = buildSelectors(trainingRows);
    const years = Array.from(new Set(trainingRows.map(row => row.date.slice(0, 4))));
    const candidates = [];
    for (const strategyId of Object.keys(trainingRows[0].derivedStrategies)) {
        for (const selector of selectors) {
            const yearly = years.map(year => {
                const selectedRows = applySelector(
                    trainingRows.filter(row => row.date.startsWith(year)),
                    selector
                );
                return {
                    year,
                    ...summarize(selectedRows, strategyId),
                    rows: undefined
                };
            });
            if (yearly.some(year => year.days < 10)) continue;
            candidates.push({
                strategyId,
                selector,
                yearly,
                minHitRate: Math.min(...yearly.map(year => year.hitRate)),
                minProfitK: Math.min(...yearly.map(year => year.profitK)),
                minDays: Math.min(...yearly.map(year => year.days)),
                totalDays: yearly.reduce((sum, year) => sum + year.days, 0),
                totalProfitK: yearly.reduce((sum, year) => sum + year.profitK, 0)
            });
        }
    }
    return candidates;
}

function choose(candidates) {
    const stable60 = candidates
        .filter(candidate => candidate.minHitRate >= 0.6)
        .sort((a, b) =>
            b.minDays - a.minDays ||
            b.minProfitK - a.minProfitK ||
            b.totalProfitK - a.totalProfitK
        )[0] || null;
    const bestRate = candidates.slice().sort((a, b) =>
        b.minHitRate - a.minHitRate ||
        b.minDays - a.minDays ||
        b.minProfitK - a.minProfitK
    )[0];
    const bestProfit = candidates.slice().sort((a, b) =>
        b.minProfitK - a.minProfitK ||
        b.totalProfitK - a.totalProfitK ||
        b.minHitRate - a.minHitRate
    )[0];
    return { stable60, bestRate, bestProfit };
}

function main() {
    const args = parseArgs(process.argv);
    const trainingFiles = String(args.trainingReports || '')
        .split(',').map(value => value.trim()).filter(Boolean);
    const holdoutFiles = String(args.holdoutReports || '')
        .split(',').map(value => value.trim()).filter(Boolean);
    if (!trainingFiles.length || !holdoutFiles.length) {
        throw new Error('Cần --trainingReports và --holdoutReports.');
    }
    const trainingRows = loadRows(trainingFiles).map(deriveRow);
    const holdoutRows = loadRows(holdoutFiles).map(deriveRow);
    const candidates = evaluate(trainingRows);
    const selected = choose(candidates);
    const evaluations = {};
    for (const [name, candidate] of Object.entries(selected)) {
        if (!candidate) {
            evaluations[name] = null;
            continue;
        }
        const rows = applySelector(holdoutRows, candidate.selector);
        evaluations[name] = {
            selection: candidate,
            holdout: summarize(rows, candidate.strategyId)
        };
    }
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            training: 'Chọn ngưỡng trên strict PIT 2024-2025.',
            holdout: 'Khóa strategy/feature/threshold rồi kiểm định strict PIT 2026.',
            minimumTrainingDays: 10,
            economics: 'Hold70, đánh 30 số, 1000K/số, ăn 84.',
            warning: 'Nhiều phép thử; stable60 chỉ là ứng viên nếu tiếp tục vượt ngoài mẫu.'
        },
        evaluations,
        topByMinRate: candidates.slice().sort((a, b) =>
            b.minHitRate - a.minHitRate || b.minDays - a.minDays
        ).slice(0, 30)
    };
    const reportPath = path.join(
        __dirname,
        '..',
        'reports',
        `research_pit_selective_confidence_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        reportPath,
        evaluations: Object.fromEntries(
            Object.entries(evaluations).map(([name, value]) => [name, value && {
                strategyId: value.selection.strategyId,
                selector: value.selection.selector,
                trainingYears: value.selection.yearly,
                holdout: { ...value.holdout, rows: undefined }
            }])
        )
    }, null, 2));
}

if (require.main === module) main();

module.exports = {
    deriveRow,
    summarize,
    applySelector,
    evaluate,
    choose
};
