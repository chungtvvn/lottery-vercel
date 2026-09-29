'use strict';

const { classifyOpportunity } = require('./chainProtectionLedger');

const CAUSES = Object.freeze({
    RECORD_ALREADY_BROKEN: 'active-super-record-continued',
    RECORD_BREAK: 'active-record-broken',
    FIRST_FORMATION: 'potential-first-formation',
    ACTIVE_NEAR_RECORD: 'active-near-record-continued',
    ACTIVE_OTHER: 'active-other-continued',
    POTENTIAL_RECORD: 'potential-record-formation',
    POTENTIAL_OTHER: 'potential-other-formation',
    FILL_OR_TIE_BREAK: 'fill-or-tie-break'
});

function normalizeNumbers(values) {
    return [...new Set((values || []).map(Number))]
        .filter(number => Number.isInteger(number) && number >= 0 && number <= 99)
        .sort((left, right) => left - right);
}

function widthBucket(size) {
    if (size <= 1) return '1';
    if (size <= 3) return '2-3';
    if (size <= 7) return '4-7';
    if (size <= 15) return '8-15';
    if (size <= 30) return '16-30';
    return '31-99';
}

function lengthBucket(length) {
    if (length <= 1) return '1';
    if (length <= 3) return '2-3';
    if (length <= 6) return '4-6';
    return '7+';
}

function normalizeCandidate(raw) {
    const numbers = normalizeNumbers(raw?.numbers);
    if (!raw || numbers.length === 0 || numbers.length >= 100) return null;
    return {
        ...raw,
        key: String(raw.key || ''),
        family: String(raw.family || 'other'),
        pattern: String(raw.pattern || 'other'),
        state: String(raw.state || ''),
        recordState: String(raw.recordState || ''),
        tier: Math.max(1, Number(raw.tier || 4)),
        currentLen: Math.max(0, Number(raw.currentLen || 0)),
        baseLen: Math.max(0, Number(raw.baseLen || 0)),
        targetLen: Math.max(0, Number(raw.targetLen || 0)),
        recordLen: Math.max(0, Number(raw.recordLen || 0)),
        exposureFrequencyPerYear: Math.max(0, Number(raw.exposureFrequencyPerYear || 0)),
        numbers,
        setSize: numbers.length
    };
}

function evidenceScore(candidate) {
    return (5 - candidate.tier) * 100
        + Math.min(20, candidate.currentLen) * 4
        + Number(candidate.state === 'active') * 12
        - candidate.setSize / 10;
}

function deduplicateCandidates(rawCandidates) {
    const representatives = new Map();
    for (const raw of rawCandidates || []) {
        const candidate = normalizeCandidate(raw);
        if (!candidate) continue;
        const signature = [
            candidate.state,
            candidate.family,
            candidate.pattern,
            candidate.recordState,
            widthBucket(candidate.setSize),
            lengthBucket(candidate.baseLen || candidate.currentLen),
            candidate.numbers.join(',')
        ].join('|');
        const existing = representatives.get(signature);
        if (!existing || evidenceScore(candidate) > evidenceScore(existing)) {
            representatives.set(signature, candidate);
        }
    }
    return [...representatives.values()];
}

function classifyCause(candidate) {
    const opportunity = classifyOpportunity(candidate);
    if (opportunity?.eventType === 'record-break') {
        return candidate.recordState === 'super-record'
            ? CAUSES.RECORD_ALREADY_BROKEN
            : CAUSES.RECORD_BREAK;
    }
    if (opportunity?.eventType === 'first-formation') return CAUSES.FIRST_FORMATION;
    if (candidate.state === 'active') {
        if (candidate.recordState === 'super-record') return CAUSES.RECORD_ALREADY_BROKEN;
        if (candidate.recordState === 'at-record') return CAUSES.RECORD_BREAK;
        if (candidate.recordState === 'near-record') return CAUSES.ACTIVE_NEAR_RECORD;
        return CAUSES.ACTIVE_OTHER;
    }
    if (candidate.state === 'potential') {
        if (['at-record', 'super-record'].includes(candidate.recordState)) return CAUSES.POTENTIAL_RECORD;
        if (candidate.recordState === 'never-pattern') return CAUSES.FIRST_FORMATION;
        return CAUSES.POTENTIAL_OTHER;
    }
    return CAUSES.POTENTIAL_OTHER;
}

const CAUSE_PRIORITY = [
    CAUSES.RECORD_ALREADY_BROKEN,
    CAUSES.RECORD_BREAK,
    CAUSES.FIRST_FORMATION,
    CAUSES.ACTIVE_NEAR_RECORD,
    CAUSES.POTENTIAL_RECORD,
    CAUSES.ACTIVE_OTHER,
    CAUSES.POTENTIAL_OTHER,
    CAUSES.FILL_OR_TIE_BREAK
];

function summarizeEvidence(rawCandidates, number) {
    const evidence = deduplicateCandidates(rawCandidates)
        .filter(candidate => candidate.numbers.includes(Number(number)));
    const causes = {};
    const families = {};
    const patterns = {};
    let activeCount = 0;
    let potentialCount = 0;
    let tier1Count = 0;
    let minimumSetSize = 100;
    let frequencySum = 0;
    for (const candidate of evidence) {
        const cause = classifyCause(candidate);
        causes[cause] = (causes[cause] || 0) + 1;
        families[candidate.family] = (families[candidate.family] || 0) + 1;
        patterns[candidate.pattern] = (patterns[candidate.pattern] || 0) + 1;
        activeCount += Number(candidate.state === 'active');
        potentialCount += Number(candidate.state === 'potential');
        tier1Count += Number(candidate.tier === 1);
        minimumSetSize = Math.min(minimumSetSize, candidate.setSize);
        frequencySum += candidate.exposureFrequencyPerYear;
    }
    if (evidence.length === 0) causes[CAUSES.FILL_OR_TIE_BREAK] = 1;
    const dominantCause = CAUSE_PRIORITY.find(cause => causes[cause]) || CAUSES.FILL_OR_TIE_BREAK;
    return {
        evidenceCount: evidence.length,
        supportFamilies: Object.keys(families).length,
        activeCount,
        potentialCount,
        tier1Count,
        minimumSetSize: evidence.length ? minimumSetSize : null,
        meanFrequencyPerYear: evidence.length ? frequencySum / evidence.length : null,
        dominantCause,
        causes,
        families,
        patterns
    };
}

function buildAuditRow(row, strategyId = 'chainSmallFirst') {
    const actual = Number(row?.actual);
    const bets = normalizeNumbers(row?.strategies?.[strategyId]);
    if (!Number.isInteger(actual) || bets.length === 0) return null;
    const excluded = Array.from({ length: 100 }, (_, number) => number)
        .filter(number => !bets.includes(number));
    const wrong = excluded.includes(actual);
    const numberSamples = Array.from({ length: 100 }, (_, number) => ({
        number,
        wasExcluded: excluded.includes(number),
        actual: number === actual,
        failed: number === actual && excluded.includes(number),
        ...summarizeEvidence(row.candidateDiagnostics, number)
    }));
    return {
        date: String(row.date || ''),
        actual,
        strategyId,
        betCount: bets.length,
        betNumbers: bets,
        wrong,
        actualEvidence: summarizeEvidence(row.candidateDiagnostics, actual),
        candidateDiagnostics: row.candidateDiagnostics || [],
        numberSamples,
        excludedSamples: numberSamples.filter(sample => sample.wasExcluded)
    };
}

function incrementMap(target, values) {
    for (const [key, value] of Object.entries(values || {})) {
        target[key] = (target[key] || 0) + Number(value || 0);
    }
}

function summarizeAudit(rows) {
    const summary = {
        days: rows.length,
        wrongDays: 0,
        hitRate: 0,
        wrongByDominantCause: {},
        wrongEvidenceCauses: {},
        wrongFamilies: {},
        wrongPatterns: {},
        causeDayOutcomes: {},
        wrongWithRecordBreakEvidence: 0,
        wrongWithFirstFormationEvidence: 0,
        wrongWithNoAssociatedEvidence: 0,
        meanWrongEvidenceCount: 0,
        meanWrongSupportFamilies: 0
    };
    let evidenceCount = 0;
    let familyCount = 0;
    for (const row of rows) {
        for (const cause of Object.keys(row.actualEvidence.causes || {})) {
            const outcome = summary.causeDayOutcomes[cause] || { days: 0, wrongDays: 0 };
            outcome.days++;
            outcome.wrongDays += Number(row.wrong);
            summary.causeDayOutcomes[cause] = outcome;
        }
        if (!row.wrong) continue;
        summary.wrongDays++;
        const evidence = row.actualEvidence;
        summary.wrongByDominantCause[evidence.dominantCause] =
            (summary.wrongByDominantCause[evidence.dominantCause] || 0) + 1;
        incrementMap(summary.wrongEvidenceCauses, evidence.causes);
        incrementMap(summary.wrongFamilies, evidence.families);
        incrementMap(summary.wrongPatterns, evidence.patterns);
        summary.wrongWithRecordBreakEvidence += Number(
            Boolean(evidence.causes[CAUSES.RECORD_BREAK] || evidence.causes[CAUSES.RECORD_ALREADY_BROKEN])
        );
        summary.wrongWithFirstFormationEvidence += Number(Boolean(evidence.causes[CAUSES.FIRST_FORMATION]));
        summary.wrongWithNoAssociatedEvidence += Number(evidence.evidenceCount === 0);
        evidenceCount += evidence.evidenceCount;
        familyCount += evidence.supportFamilies;
    }
    summary.hitRate = summary.days ? (summary.days - summary.wrongDays) / summary.days : 0;
    summary.meanWrongEvidenceCount = summary.wrongDays ? evidenceCount / summary.wrongDays : 0;
    summary.meanWrongSupportFamilies = summary.wrongDays ? familyCount / summary.wrongDays : 0;
    for (const outcome of Object.values(summary.causeDayOutcomes)) {
        outcome.wrongRate = outcome.days ? outcome.wrongDays / outcome.days : 0;
        outcome.liftVsOverall = summary.wrongDays && summary.days
            ? outcome.wrongRate / (summary.wrongDays / summary.days)
            : 0;
    }
    summary.tierEffectiveness = auditTierEffectiveness(rows);
    return summary;
}

/**
 * Định nghĩa hiệu quả loại trừ theo chuẩn xác suất:
 * - precision = tỷ lệ số bị loại thực sự KHÔNG về
 * - falseExclusionRate = số kỳ loại nhầm (số bị loại nhưng vẫn về) / tổng số kỳ hoạt động
 * - baselineFalseRate = meanExclusionSize / 100 (tỷ lệ loại nhầm kỳ vọng của random với cùng kích thước loại trừ)
 * - edgeVsBaseline = baselineFalseRate - falseExclusionRate:
 *     Nếu edge <= 0: Tier KHÔNG hơn random (thậm chí tệ hơn), đề xuất DROP hoặc giảm weight về 0.
 *     Nếu edge > 0: Tier có edge thật sự (bớt sai hơn random).
 */
function auditTierEffectiveness(rows) {
    const tierStats = {};

    for (const row of rows || []) {
        const actual = Number(row?.actual);
        const candidates = row?.candidateDiagnostics || [];
        const excludedNumbers = new Set(
            row?.excludedSamples ? row.excludedSamples.map(s => s.number) : []
        );

        // Gom nhóm các số bị loại theo từng tier trong ngày
        const tierNumbersMap = new Map();
        for (const raw of candidates) {
            const candidate = normalizeCandidate(raw);
            if (!candidate) continue;
            const tierKey = candidate.tier ? `tier_${candidate.tier}` : 'other';
            if (!tierNumbersMap.has(tierKey)) {
                tierNumbersMap.set(tierKey, new Set());
            }
            const set = tierNumbersMap.get(tierKey);
            for (const num of candidate.numbers) {
                if (excludedNumbers.size === 0 || excludedNumbers.has(num)) {
                    set.add(num);
                }
            }
        }

        for (const [tierKey, numSet] of tierNumbersMap.entries()) {
            if (numSet.size === 0) continue;
            if (!tierStats[tierKey]) {
                tierStats[tierKey] = {
                    tier: tierKey,
                    daysActive: 0,
                    totalExclusions: 0,
                    falseExclusionDays: 0,
                    hitsCount: 0
                };
            }
            const stats = tierStats[tierKey];
            stats.daysActive++;
            stats.totalExclusions += numSet.size;
            if (numSet.has(actual)) {
                stats.falseExclusionDays++;
                stats.hitsCount++;
            }
        }
    }

    const results = {};
    for (const [tierKey, stats] of Object.entries(tierStats)) {
        const meanExclusionSize = stats.daysActive ? stats.totalExclusions / stats.daysActive : 0;
        const falseExclusionRate = stats.daysActive ? stats.falseExclusionDays / stats.daysActive : 0;
        const baselineFalseRate = meanExclusionSize / 100;
        const edgeVsBaseline = baselineFalseRate - falseExclusionRate;
        const precision = stats.totalExclusions > 0
            ? 1 - (stats.hitsCount / stats.totalExclusions)
            : 1;

        const isBetterThanRandom = edgeVsBaseline > 0;
        const recommendedWeight = isBetterThanRandom && baselineFalseRate > 0
            ? Math.min(1, Math.max(0, edgeVsBaseline / baselineFalseRate))
            : 0;

        results[tierKey] = {
            tier: tierKey,
            daysActive: stats.daysActive,
            totalExclusions: stats.totalExclusions,
            meanExclusionSize: Number(meanExclusionSize.toFixed(2)),
            falseExclusionDays: stats.falseExclusionDays,
            falseExclusionRate: Number(falseExclusionRate.toFixed(4)),
            baselineFalseRate: Number(baselineFalseRate.toFixed(4)),
            edgeVsBaseline: Number(edgeVsBaseline.toFixed(4)),
            precision: Number(precision.toFixed(4)),
            verdict: isBetterThanRandom ? 'VALID_EDGE' : 'DROP_OR_REDUCE',
            recommendedWeight: Number(recommendedWeight.toFixed(3)),
            auditMessage: isBetterThanRandom
                ? `Tier ${tierKey} bớt sai hơn ngẫu nhiên (Edge: +${(edgeVsBaseline * 100).toFixed(2)}%)`
                : `Tier ${tierKey} loại nhầm >= baseline ngẫu nhiên (${(falseExclusionRate * 100).toFixed(1)}% vs ${(baselineFalseRate * 100).toFixed(1)}%). Đề xuất giảm weight hoặc loại bỏ!`
        };
    }

    return results;
}

/**
 * Vòng audit liên tục:
 * Tự động tính toán lại trọng số cho các tier/family định kỳ.
 * Bất kỳ tier nào loại nhầm nhiều hơn baseline thì tự động giảm weight hoặc gán 0.
 */
function auditContinuousPruning(rows, options = {}) {
    const minActiveDays = Math.max(5, Number(options.minActiveDays || 10));
    const tierAudit = auditTierEffectiveness(rows);
    const dynamicWeights = {};
    const prunedTiers = [];

    for (const [tierKey, stats] of Object.entries(tierAudit)) {
        if (stats.daysActive < minActiveDays) {
            // Không đủ mẫu kiểm toán
            dynamicWeights[tierKey] = 0;
            prunedTiers.push({ tier: tierKey, reason: `Không đủ mẫu (${stats.daysActive} < ${minActiveDays} ngày)` });
            continue;
        }

        if (stats.edgeVsBaseline <= 0) {
            // Tỷ lệ loại nhầm >= baseline ngẫu nhiên
            dynamicWeights[tierKey] = 0;
            prunedTiers.push({
                tier: tierKey,
                reason: `Loại nhầm ${(stats.falseExclusionRate * 100).toFixed(1)}% >= Baseline ${(stats.baselineFalseRate * 100).toFixed(1)}% (Không hơn random)`
            });
        } else {
            dynamicWeights[tierKey] = stats.recommendedWeight;
        }
    }

    return {
        tierAudit,
        dynamicWeights,
        prunedTiers
    };
}

module.exports = {
    CAUSES,
    auditContinuousPruning,
    auditTierEffectiveness,
    buildAuditRow,
    classifyCause,
    deduplicateCandidates,
    summarizeAudit,
    summarizeEvidence
};
