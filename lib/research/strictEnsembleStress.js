'use strict';

const ALL_NUMBERS = Array.from({ length: 100 }, (_, number) => number);

function stableHash(date, number) {
    let hash = 2166136261;
    const input = `${date}|${number}`;
    for (let index = 0; index < input.length; index++) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function methodVotes(row, methods) {
    const sets = methods.map(method => new Set((row.strategies?.[method] || []).map(Number)));
    return ALL_NUMBERS.map(number => {
        const memberships = sets.map(set => Number(set.has(number)));
        return {
            number,
            memberships,
            votes: memberships.reduce((sum, value) => sum + value, 0)
        };
    });
}

function featureVector(voteRow) {
    const methodCount = Math.max(1, voteRow.memberships.length);
    const ratio = voteRow.votes / methodCount;
    return [
        ...voteRow.memberships,
        ratio,
        ratio * ratio,
        Number(voteRow.votes === 1),
        Number(voteRow.votes === methodCount)
    ];
}

function dot(left, right) {
    let result = 0;
    for (let index = 0; index < left.length; index++) result += left[index] * right[index];
    return result;
}

function fitConditionalSoftmax(rows, methods, config = {}) {
    const featureCount = methods.length + 4;
    const weights = Array(featureCount).fill(0);
    const epochs = Math.max(1, Number(config.epochs || 60));
    const learningRate = Number(config.learningRate || 0.35);
    const l2 = Math.max(0, Number(config.l2 || 0.1));
    for (let epoch = 0; epoch < epochs; epoch++) {
        const gradient = Array(featureCount).fill(0);
        for (const row of rows) {
            const votes = methodVotes(row, methods);
            const features = votes.map(featureVector);
            const scores = features.map(feature => dot(feature, weights));
            const maxScore = Math.max(...scores);
            const probabilities = scores.map(score => Math.exp(score - maxScore));
            const denominator = probabilities.reduce((sum, value) => sum + value, 0);
            const actual = Number(row.actual);
            const actualIndex = votes.findIndex(item => item.number === actual);
            if (actualIndex < 0) continue;
            for (let featureIndex = 0; featureIndex < featureCount; featureIndex++) {
                let expected = 0;
                for (let numberIndex = 0; numberIndex < features.length; numberIndex++) {
                    expected += (probabilities[numberIndex] / denominator) *
                        features[numberIndex][featureIndex];
                }
                gradient[featureIndex] += features[actualIndex][featureIndex] - expected;
            }
        }
        const scale = learningRate / Math.max(1, rows.length);
        for (let index = 0; index < weights.length; index++) {
            weights[index] += scale * (gradient[index] - l2 * rows.length * weights[index]);
        }
    }
    return { weights, methods: methods.slice(), config: { epochs, learningRate, l2 } };
}

function conditionalSoftmaxProbabilities(row, methods, model) {
    if (!model || !Array.isArray(model.weights)) {
        throw new Error('Thiếu conditional softmax model.');
    }
    const votes = methodVotes(row, methods);
    const scores = votes.map(item => dot(featureVector(item), model.weights));
    const maxScore = Math.max(...scores);
    const exponentials = scores.map(score =>
        Math.exp(Math.max(-30, Math.min(30, score - maxScore)))
    );
    const denominator = exponentials.reduce((sum, value) => sum + value, 0);
    return exponentials.map(value => value / Math.max(Number.EPSILON, denominator));
}

function rankNumbers(row, methods, mode, model = null, globalMethods = methods) {
    const votes = methodVotes(row, methods);
    const globalVotes = new Map(
        methodVotes(row, globalMethods).map(item => [item.number, item.votes])
    );
    return votes.map(item => {
        let score;
        if (mode === 'exclusive') {
            score = item.votes === 0 ? -1 : 1 / item.votes;
        } else if (mode === 'middle') {
            const center = methods.length / 2;
            score = item.votes === 0 ? -1 : 1 - Math.abs(item.votes - center) / methods.length;
        } else if (mode === 'softmax') {
            score = dot(featureVector(item), model.weights);
        } else {
            score = item.votes / Math.max(1, methods.length);
        }
        return {
            number: item.number,
            score,
            votes: item.votes,
            globalVotes: globalVotes.get(item.number) || 0,
            tie: stableHash(row.date, item.number)
        };
    }).sort((left, right) =>
        right.score - left.score
        || right.globalVotes - left.globalVotes
        || right.votes - left.votes
        || left.tie - right.tie
        || left.number - right.number
    );
}

function predictTopK(row, methods, mode, betCount, model = null, globalMethods = methods) {
    return rankNumbers(row, methods, mode, model, globalMethods)
        .slice(0, betCount)
        .map(item => item.number)
        .sort((left, right) => left - right);
}

function allocateFixedUnits(row, methods, focus, multiplier, budgetUnits, globalMethods = methods) {
    const rankMode = focus === 'exclusive' ? 'exclusive' : 'consensus';
    const ranked = rankNumbers(row, methods, rankMode, null, globalMethods);
    const allocation = [];
    let remaining = Math.max(1, Number(budgetUnits));
    for (const item of ranked) {
        if (remaining <= 0) break;
        const focused = focus === 'exclusive'
            ? item.votes === 1
            : item.votes >= 2;
        const units = Math.min(remaining, focused ? multiplier : 1);
        allocation.push({ number: item.number, units });
        remaining -= units;
    }
    return allocation;
}

function longestStreak(rows, predicate) {
    let current = 0;
    let longest = 0;
    for (const row of rows) {
        current = predicate(row) ? current + 1 : 0;
        longest = Math.max(longest, current);
    }
    return longest;
}

function settle(rows, selector, economics = {}, includeDaily = false) {
    const stakePerNumberK = Number(economics.stakePerNumberK || 1000);
    const payoutMultiplier = Number(economics.payoutMultiplier || 84);
    const daily = [];
    for (const row of rows) {
        const betNumbers = selector(row);
        const hit = betNumbers.includes(Number(row.actual));
        const stakeK = betNumbers.length * stakePerNumberK;
        const payoutK = hit ? stakePerNumberK * payoutMultiplier : 0;
        daily.push({
            date: row.date,
            actual: Number(row.actual),
            hit,
            betCount: betNumbers.length,
            stakeK,
            payoutK,
            profitK: payoutK - stakeK,
            ...(includeDaily ? { betNumbers } : {})
        });
    }
    const wins = daily.reduce((sum, row) => sum + Number(row.hit), 0);
    const stakeK = daily.reduce((sum, row) => sum + row.stakeK, 0);
    const payoutK = daily.reduce((sum, row) => sum + row.payoutK, 0);
    return {
        days: daily.length,
        wins,
        losses: daily.length - wins,
        hitRate: daily.length ? wins / daily.length : 0,
        averageBets: daily.length
            ? daily.reduce((sum, row) => sum + row.betCount, 0) / daily.length
            : 0,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        roi: stakeK ? (payoutK - stakeK) / stakeK : 0,
        longestWin: longestStreak(daily, row => row.hit),
        longestLoss: longestStreak(daily, row => !row.hit),
        daily
    };
}

function settleWeighted(rows, allocator, economics = {}, includeDaily = false) {
    const stakePerUnitK = Number(economics.stakePerUnitK || 1000);
    const payoutMultiplier = Number(economics.payoutMultiplier || 84);
    const daily = rows.map(row => {
        const allocation = allocator(row);
        const actual = Number(row.actual);
        const actualUnits = allocation.find(item => item.number === actual)?.units || 0;
        const units = allocation.reduce((sum, item) => sum + item.units, 0);
        const stakeK = units * stakePerUnitK;
        const payoutK = actualUnits * stakePerUnitK * payoutMultiplier;
        return {
            date: row.date,
            actual,
            hit: actualUnits > 0,
            actualUnits,
            uniqueBets: allocation.length,
            units,
            stakeK,
            payoutK,
            profitK: payoutK - stakeK,
            ...(includeDaily ? { allocation } : {})
        };
    });
    const wins = daily.reduce((sum, row) => sum + Number(row.hit), 0);
    const stakeK = daily.reduce((sum, row) => sum + row.stakeK, 0);
    const payoutK = daily.reduce((sum, row) => sum + row.payoutK, 0);
    return {
        days: daily.length,
        wins,
        losses: daily.length - wins,
        hitRate: daily.length ? wins / daily.length : 0,
        averageUniqueBets: daily.length
            ? daily.reduce((sum, row) => sum + row.uniqueBets, 0) / daily.length
            : 0,
        averageUnits: daily.length
            ? daily.reduce((sum, row) => sum + row.units, 0) / daily.length
            : 0,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        roi: stakeK ? (payoutK - stakeK) / stakeK : 0,
        longestWin: longestStreak(daily, row => row.hit),
        longestLoss: longestStreak(daily, row => !row.hit),
        daily
    };
}

function seededRandom(seed) {
    let state = Number(seed) >>> 0;
    return () => {
        state = (Math.imul(1664525, state) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function percentile(sorted, probability) {
    if (!sorted.length) return 0;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(probability * sorted.length)));
    return sorted[index];
}

function maxDrawdown(profits) {
    let equity = 0;
    let peak = 0;
    let drawdown = 0;
    for (const profit of profits) {
        equity += profit;
        peak = Math.max(peak, equity);
        drawdown = Math.max(drawdown, peak - equity);
    }
    return drawdown;
}

function blockBootstrap(daily, options = {}) {
    const paths = Math.max(100, Number(options.paths || 5000));
    const horizon = Math.max(1, Number(options.horizon || 365));
    const blockSize = Math.max(1, Number(options.blockSize || 14));
    const random = seededRandom(options.seed || 20260717);
    const profits = [];
    const drawdowns = [];
    for (let pathIndex = 0; pathIndex < paths; pathIndex++) {
        const pathProfits = [];
        while (pathProfits.length < horizon) {
            const start = Math.floor(random() * daily.length);
            for (let offset = 0; offset < blockSize && pathProfits.length < horizon; offset++) {
                pathProfits.push(daily[(start + offset) % daily.length].profitK);
            }
        }
        profits.push(pathProfits.reduce((sum, value) => sum + value, 0));
        drawdowns.push(maxDrawdown(pathProfits));
    }
    profits.sort((left, right) => left - right);
    drawdowns.sort((left, right) => left - right);
    return {
        paths,
        horizon,
        blockSize,
        probabilityProfitable: profits.filter(value => value > 0).length / paths,
        profitP05K: percentile(profits, 0.05),
        profitMedianK: percentile(profits, 0.5),
        profitP95K: percentile(profits, 0.95),
        drawdownP95K: percentile(drawdowns, 0.95)
    };
}

function adverseHitStress(summary, options = {}) {
    const paths = Math.max(100, Number(options.paths || 10000));
    const horizon = Math.max(1, Number(options.horizon || 365));
    const stakePerNumberK = Number(options.stakePerNumberK || 1000);
    const payoutMultiplier = Number(options.payoutMultiplier || 84);
    const betCount = Math.round(summary.averageBets);
    const random = seededRandom(options.seed || 20260718);
    return (options.shifts || [0, 0.01, 0.02, 0.03]).map(shift => {
        const hitRate = Math.max(0, summary.hitRate - shift);
        const profits = [];
        for (let pathIndex = 0; pathIndex < paths; pathIndex++) {
            let wins = 0;
            for (let day = 0; day < horizon; day++) wins += Number(random() < hitRate);
            profits.push(
                wins * stakePerNumberK * payoutMultiplier -
                horizon * betCount * stakePerNumberK
            );
        }
        profits.sort((left, right) => left - right);
        return {
            shift,
            assumedHitRate: hitRate,
            probabilityProfitable: profits.filter(value => value > 0).length / paths,
            profitP05K: percentile(profits, 0.05),
            profitMedianK: percentile(profits, 0.5),
            profitP95K: percentile(profits, 0.95)
        };
    });
}

function multipleTestingNull(rows, candidates, options = {}) {
    const paths = Math.max(100, Number(options.paths || 5000));
    const random = seededRandom(options.seed || 20260719);
    const prepared = candidates.map(candidate => ({
        id: candidate.id,
        masks: rows.map(row => {
            const mask = new Uint8Array(100);
            for (const number of candidate.selector(row)) mask[Number(number)] = 1;
            return mask;
        })
    }));
    const observed = prepared.map(candidate => ({
        id: candidate.id,
        hits: candidate.masks.reduce(
            (sum, mask, index) => sum + Number(mask[Number(rows[index].actual)] === 1),
            0
        )
    })).sort((left, right) => right.hits - left.hits || left.id.localeCompare(right.id));
    const observedBestHits = observed[0]?.hits || 0;
    const nullMaxHits = [];
    for (let pathIndex = 0; pathIndex < paths; pathIndex++) {
        const syntheticActuals = rows.map(() => Math.floor(random() * 100));
        let bestHits = 0;
        for (const candidate of prepared) {
            let hits = 0;
            for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                hits += candidate.masks[rowIndex][syntheticActuals[rowIndex]];
            }
            bestHits = Math.max(bestHits, hits);
        }
        nullMaxHits.push(bestHits);
    }
    nullMaxHits.sort((left, right) => left - right);
    return {
        paths,
        candidateCount: candidates.length,
        observedBestId: observed[0]?.id || null,
        observedBestHits,
        observedTop5: observed.slice(0, 5),
        probabilityNullBestAtLeastObserved:
            nullMaxHits.filter(hits => hits >= observedBestHits).length / paths,
        nullBestHitsP50: percentile(nullMaxHits, 0.5),
        nullBestHitsP95: percentile(nullMaxHits, 0.95),
        nullBestHitsP99: percentile(nullMaxHits, 0.99)
    };
}

module.exports = {
    ALL_NUMBERS,
    allocateFixedUnits,
    adverseHitStress,
    blockBootstrap,
    conditionalSoftmaxProbabilities,
    featureVector,
    fitConditionalSoftmax,
    methodVotes,
    multipleTestingNull,
    predictTopK,
    rankNumbers,
    settle,
    settleWeighted,
    stableHash
};
