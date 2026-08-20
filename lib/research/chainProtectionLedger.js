'use strict';

const EVENT_TYPES = Object.freeze({
    RECORD_BREAK: 'record-break',
    FIRST_FORMATION: 'first-formation'
});

function normalizeNumbers(values) {
    return [...new Set((values || []).map(Number))]
        .filter(number => Number.isInteger(number) && number >= 0 && number <= 99)
        .sort((left, right) => left - right);
}

function normalizeCandidate(candidate) {
    if (!candidate || typeof candidate !== 'object') return null;
    const numbers = normalizeNumbers(candidate.numbers);
    if (numbers.length === 0 || numbers.length >= 100) return null;
    return {
        ...candidate,
        key: String(candidate.key || ''),
        family: String(candidate.family || 'other'),
        pattern: String(candidate.pattern || 'other'),
        state: String(candidate.state || ''),
        recordState: String(candidate.recordState || ''),
        currentLen: Math.max(0, Number(candidate.currentLen || 0)),
        baseLen: Math.max(0, Number(candidate.baseLen || 0)),
        targetLen: Math.max(0, Number(candidate.targetLen || 0)),
        recordLen: Math.max(0, Number(candidate.recordLen || 0)),
        currentCount: Math.max(0, Number(candidate.currentCount || 0)),
        formationCount: candidate.formationCount === null || candidate.formationCount === undefined
            ? null
            : Math.max(0, Number(candidate.formationCount || 0)),
        numbers,
        setSize: numbers.length
    };
}

function classifyOpportunity(rawCandidate) {
    const candidate = normalizeCandidate(rawCandidate);
    if (!candidate) return null;

    const activeAtBoundary = candidate.state === 'active'
        && ['at-record', 'super-record'].includes(candidate.recordState)
        && candidate.recordLen > 0
        && candidate.targetLen > candidate.recordLen;
    if (activeAtBoundary) {
        return {
            ...candidate,
            eventType: EVENT_TYPES.RECORD_BREAK,
            boundaryDepth: Math.max(0, candidate.baseLen - candidate.recordLen),
            opportunitySignature: `${EVENT_TYPES.RECORD_BREAK}|${candidate.family}|${candidate.numbers.join(',')}`
        };
    }

    const neverFormedPotential = candidate.state === 'potential'
        && candidate.recordLen === 0
        && candidate.recordState === 'never-pattern'
        && candidate.currentLen > 0
        && candidate.baseLen > candidate.currentLen
        && candidate.targetLen >= candidate.baseLen;
    if (neverFormedPotential) {
        return {
            ...candidate,
            eventType: EVENT_TYPES.FIRST_FORMATION,
            boundaryDepth: 0,
            opportunitySignature: `${EVENT_TYPES.FIRST_FORMATION}|${candidate.family}|${candidate.numbers.join(',')}`
        };
    }

    return null;
}

function compareRepresentatives(left, right) {
    return right.boundaryDepth - left.boundaryDepth
        || right.baseLen - left.baseLen
        || left.setSize - right.setSize
        || left.key.localeCompare(right.key);
}

function buildOpportunities(candidateDiagnostics) {
    const raw = (candidateDiagnostics || []).map(classifyOpportunity).filter(Boolean);
    const deduplicated = new Map();
    for (const opportunity of raw) {
        const existing = deduplicated.get(opportunity.opportunitySignature);
        if (!existing || compareRepresentatives(opportunity, existing) < 0) {
            deduplicated.set(opportunity.opportunitySignature, opportunity);
        }
    }
    return {
        raw,
        deduplicated: [...deduplicated.values()].sort((left, right) =>
            left.eventType.localeCompare(right.eventType)
            || left.family.localeCompare(right.family)
            || left.numbers.join(',').localeCompare(right.numbers.join(','))
        )
    };
}

function settleOpportunities(opportunities, actual) {
    const actualNumber = Number(actual);
    if (!Number.isInteger(actualNumber) || actualNumber < 0 || actualNumber > 99) {
        throw new Error(`Kết quả thực tế không hợp lệ: ${actual}`);
    }
    return (opportunities || []).map(opportunity => ({
        ...opportunity,
        eventOccurred: opportunity.numbers.includes(actualNumber)
    }));
}

function buildDailyLedgerRow(row) {
    const { raw, deduplicated } = buildOpportunities(row?.candidateDiagnostics);
    const settled = settleOpportunities(deduplicated, row?.actual);
    const protectedNumbers = normalizeNumbers(deduplicated.flatMap(item => item.numbers));
    const byType = Object.values(EVENT_TYPES).reduce((result, eventType) => {
        const rows = settled.filter(item => item.eventType === eventType);
        result[eventType] = {
            opportunities: rows.length,
            events: rows.filter(item => item.eventOccurred).length,
            protectedNumbers: normalizeNumbers(rows.flatMap(item => item.numbers)).length
        };
        return result;
    }, {});
    return {
        date: String(row?.date || ''),
        actual: Number(row?.actual),
        rawOpportunities: raw.length,
        deduplicatedOpportunities: settled.length,
        events: settled.filter(item => item.eventOccurred).length,
        protectedNumbers: protectedNumbers.length,
        byType,
        opportunities: settled
    };
}

module.exports = {
    EVENT_TYPES,
    buildDailyLedgerRow,
    buildOpportunities,
    classifyOpportunity,
    normalizeNumbers,
    settleOpportunities
};
