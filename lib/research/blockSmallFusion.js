const ALL_NUMBERS = Array.from({ length: 100 }, (_, number) => number);

function normalizeTargets(targets) {
    return [...new Set((targets || []).map(Number).filter(Number.isFinite))]
        .sort((left, right) => left - right);
}

function stableTieValue(date, number) {
    const text = `${date}|block-small-fusion-v1|${number}`;
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function buildSet(row, target, strategyId) {
    const values = row.strategiesByTarget?.[String(target)]?.[strategyId];
    if (!Array.isArray(values)) {
        throw new Error(`Thiếu ${strategyId} Hold ${target} ngày ${row.date}.`);
    }
    return new Set(values.map(Number));
}

function buildMethodStrengths(row, strategyId, targets) {
    const normalizedTargets = normalizeTargets(targets);
    const sets = normalizedTargets.map(target => buildSet(row, target, strategyId));
    const strengths = new Map();
    for (const number of ALL_NUMBERS) {
        let strength = 0;
        for (let index = 0; index < normalizedTargets.length; index += 1) {
            if (sets[index].has(number)) {
                strength += 2 ** index;
            }
        }
        strengths.set(number, strength);
    }
    return strengths;
}

function rankBlockSmallFusion(row, config = {}) {
    const targets = normalizeTargets(config.targets || [65, 70, 85]);
    const blockWeight = Number(config.blockWeight ?? 0.5);
    const smallWeight = Number(config.smallWeight ?? (1 - blockWeight));
    const agreementBonus = Number(config.agreementBonus ?? 0);
    const disagreementPenalty = Number(config.disagreementPenalty ?? 0);
    const blockStrengths = buildMethodStrengths(row, 'chainBlockFirst', targets);
    const smallStrengths = buildMethodStrengths(row, 'chainSmallFirst', targets);

    return ALL_NUMBERS.map(number => {
        const blockStrength = blockStrengths.get(number);
        const smallStrength = smallStrengths.get(number);
        const sharedStrength = Math.min(blockStrength, smallStrength);
        const disagreement = Math.abs(blockStrength - smallStrength);
        return {
            number,
            blockStrength,
            smallStrength,
            sharedStrength,
            disagreement,
            score: blockWeight * blockStrength
                + smallWeight * smallStrength
                + agreementBonus * sharedStrength
                - disagreementPenalty * disagreement,
            tieValue: stableTieValue(row.date, number)
        };
    }).sort((left, right) => right.score - left.score
        || right.sharedStrength - left.sharedStrength
        || left.disagreement - right.disagreement
        || left.tieValue - right.tieValue
        || left.number - right.number);
}

function selectBlockSmallFusion(row, config = {}) {
    const betCount = Number(config.betCount ?? 30);
    return rankBlockSmallFusion(row, config)
        .slice(0, betCount)
        .map(item => item.number)
        .sort((left, right) => left - right);
}

module.exports = {
    normalizeTargets,
    rankBlockSmallFusion,
    selectBlockSmallFusion
};
