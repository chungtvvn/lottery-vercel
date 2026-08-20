'use strict';

const NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function signatureFor(number, strategySets, methodIds) {
    return methodIds.map(id => strategySets[id].has(number) ? '1' : '0').join('');
}

function createState() {
    return new Map();
}

function posterior(state, signature, options = {}) {
    const priorMean = Number(options.priorMean ?? 0.01);
    const priorStrength = Math.max(1, Number(options.priorStrength ?? 250));
    const cell = state.get(signature) || { exposures: 0, hits: 0 };
    return (cell.hits + priorMean * priorStrength) /
        (cell.exposures + priorStrength);
}

function rankDaily(strategySets, methodIds, state, options = {}) {
    return NUMBERS.map(number => {
        const signature = signatureFor(number, strategySets, methodIds);
        return {
            number,
            signature,
            probability: posterior(state, signature, options)
        };
    }).sort((left, right) =>
        right.probability - left.probability ||
        left.number - right.number
    );
}

function updateState(state, strategySets, methodIds, actual) {
    for (const number of NUMBERS) {
        const signature = signatureFor(number, strategySets, methodIds);
        const cell = state.get(signature) || { exposures: 0, hits: 0 };
        cell.exposures++;
        if (number === actual) cell.hits++;
        state.set(signature, cell);
    }
}

function buildPredictions(rows, options = {}) {
    const methodIds = options.methodIds || [];
    const betCount = Math.max(1, Number(options.betCount ?? 30));
    const state = createState();
    const predictions = [];
    for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
        const strategySets = Object.fromEntries(methodIds.map(id => [
            id,
            new Set((row.strategies?.[id] || []).map(Number))
        ]));
        const ranked = rankDaily(strategySets, methodIds, state, options);
        const actual = Number(row.actual);
        const betNumbers = ranked.slice(0, betCount).map(entry => entry.number);
        predictions.push({
            date: row.date,
            actual,
            betNumbers,
            hit: betNumbers.includes(actual),
            topProbability: ranked[0]?.probability || 0,
            meanProbability: ranked.slice(0, betCount)
                .reduce((sum, entry) => sum + entry.probability, 0) / betCount,
            uniqueSignatures: state.size
        });
        // Update only after this day's dàn has been finalized and settled.
        updateState(state, strategySets, methodIds, actual);
    }
    return predictions;
}

function buildBlendedPredictions(rows, options = {}) {
    const methodIds = options.methodIds || [];
    const betCount = Math.max(1, Number(options.betCount ?? 30));
    const signatureWeight = Math.min(1, Math.max(0, Number(options.signatureWeight ?? 0.5)));
    const numberPriorMean = Number(options.numberPriorMean ?? 0.01);
    const numberPriorStrength = Math.max(1, Number(options.numberPriorStrength ?? 250));
    const signatureState = createState();
    const numberState = NUMBERS.map(() => ({ exposures: 0, hits: 0 }));
    const predictions = [];
    for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
        const strategySets = Object.fromEntries(methodIds.map(id => [
            id,
            new Set((row.strategies?.[id] || []).map(Number))
        ]));
        const ranked = NUMBERS.map(number => {
            const signature = signatureFor(number, strategySets, methodIds);
            const signatureProbability = posterior(signatureState, signature, options);
            const cell = numberState[number];
            const numberProbability = (cell.hits + numberPriorMean * numberPriorStrength) /
                (cell.exposures + numberPriorStrength);
            return {
                number,
                signature,
                signatureProbability,
                numberProbability,
                probability: signatureWeight * signatureProbability + (1 - signatureWeight) * numberProbability
            };
        }).sort((left, right) => right.probability - left.probability || left.number - right.number);
        const actual = Number(row.actual);
        const betNumbers = ranked.slice(0, betCount).map(entry => entry.number);
        predictions.push({
            date: row.date,
            actual,
            betNumbers,
            hit: betNumbers.includes(actual),
            topProbability: ranked[0]?.probability || 0,
            meanProbability: ranked.slice(0, betCount)
                .reduce((sum, entry) => sum + entry.probability, 0) / betCount
        });
        updateState(signatureState, strategySets, methodIds, actual);
        for (const cell of numberState) cell.exposures++;
        numberState[actual].hits++;
    }
    return predictions;
}

module.exports = {
    buildBlendedPredictions,
    buildPredictions,
    posterior,
    signatureFor
};
