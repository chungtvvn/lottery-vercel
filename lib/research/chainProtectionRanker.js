'use strict';

const ALL_NUMBERS = Array.from({ length: 100 }, (_, number) => number);
const { normalizeNumbers } = require('./chainProtectionLedger');
const { scoreOpportunity } = require('./chainProtectionCalibrator');

function rankProtectionNumbers(opportunities, model, options = {}) {
    const maxFamiliesPerNumber = Math.max(1, Number(options.maxFamiliesPerNumber || 3));
    const evidenceByNumber = ALL_NUMBERS.map(() => new Map());
    for (const opportunity of opportunities || []) {
        const scored = scoreOpportunity(opportunity, model);
        if (!scored.protect) continue;
        const family = String(opportunity.family || 'other');
        const signature = `${opportunity.eventType}|${family}|${normalizeNumbers(opportunity.numbers).join(',')}`;
        const reliability = Math.sqrt(scored.effectiveTrials / (
            scored.effectiveTrials + Number(options.reliabilityPrior || 40)
        ));
        const weight = Math.max(0, scored.lowerAbsoluteLift) * reliability /
            Math.max(1, Number(opportunity.setSize || opportunity.numbers?.length || 1));
        for (const rawNumber of opportunity.numbers || []) {
            const number = Number(rawNumber);
            if (!Number.isInteger(number) || number < 0 || number > 99) continue;
            const existing = evidenceByNumber[number].get(signature);
            if (!existing || weight > existing.weight) {
                evidenceByNumber[number].set(signature, {
                    number,
                    weight,
                    family,
                    eventType: opportunity.eventType,
                    key: opportunity.key,
                    scored
                });
            }
        }
    }
    const ranked = ALL_NUMBERS.map(number => {
        const byFamily = new Map();
        for (const evidence of evidenceByNumber[number].values()) {
            const familyKey = `${evidence.eventType}|${evidence.family}`;
            const existing = byFamily.get(familyKey);
            if (!existing || evidence.weight > existing.weight) byFamily.set(familyKey, evidence);
        }
        const evidence = [...byFamily.values()]
            .sort((left, right) => right.weight - left.weight || left.key.localeCompare(right.key))
            .slice(0, maxFamiliesPerNumber);
        return {
            number,
            score: evidence.reduce((sum, item, index) => sum + item.weight * (1 / (index + 1)), 0),
            support: evidence.length,
            evidence
        };
    }).sort((left, right) => right.score - left.score || right.support - left.support || left.number - right.number);
    return ranked;
}

function applyProtectionGuard(baselineBets, opportunities, model, options = {}) {
    const baseline = new Set(normalizeNumbers(baselineBets));
    const ranked = rankProtectionNumbers(opportunities, model, options);
    const maxProtected = Math.max(0, Number(options.maxProtected || 0));
    const protectedNumbers = ranked
        .filter(row => row.score > 0 && !baseline.has(row.number))
        .slice(0, maxProtected)
        .map(row => row.number);
    const betSet = new Set(baseline);
    protectedNumbers.forEach(number => betSet.add(number));
    const budget = Number(options.budget || 0);
    if (budget > 0 && betSet.size > budget) {
        const protectedSet = new Set(protectedNumbers);
        const removable = [...betSet]
            .filter(number => !protectedSet.has(number))
            .sort((left, right) => left - right);
        while (betSet.size > budget && removable.length) betSet.delete(removable.shift());
    }
    const betNumbers = [...betSet].sort((left, right) => left - right);
    return {
        betNumbers,
        protectedNumbers,
        ranked
    };
}

module.exports = {
    applyProtectionGuard,
    rankProtectionNumbers
};
