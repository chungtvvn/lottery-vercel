'use strict';

const { buildAuditRow } = require('./exclusionFailureAudit');

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function logit(probability) {
    const value = clamp(probability, 1e-6, 1 - 1e-6);
    return Math.log(value / (1 - value));
}

function supportBucket(value) {
    if (value <= 1) return '0-1';
    if (value <= 3) return '2-3';
    if (value <= 6) return '4-6';
    return '7+';
}

function evidenceBucket(value) {
    if (value <= 10) return '0-10';
    if (value <= 30) return '11-30';
    if (value <= 80) return '31-80';
    if (value <= 160) return '81-160';
    return '161+';
}

function widthBucket(value) {
    if (value === null || value === undefined) return 'none';
    if (value <= 1) return '1';
    if (value <= 3) return '2-3';
    if (value <= 10) return '4-10';
    return '11+';
}

function stateBucket(sample) {
    if (sample.activeCount > 0 && sample.potentialCount > 0) return 'mixed';
    if (sample.activeCount > 0) return 'active';
    if (sample.potentialCount > 0) return 'potential';
    return 'none';
}

function featureGroups(sample) {
    const dominant = String(sample.dominantCause || 'none');
    const support = supportBucket(sample.supportFamilies);
    const evidence = evidenceBucket(sample.evidenceCount);
    const width = widthBucket(sample.minimumSetSize);
    const state = stateBucket(sample);
    return {
        dominant: [`dominant:${dominant}`],
        support: [`support:${support}`, `dominant-support:${dominant}|${support}`],
        evidence: [`evidence:${evidence}`, `dominant-evidence:${dominant}|${evidence}`],
        width: [`width:${width}`, `dominant-width:${dominant}|${width}`],
        state: [`state:${state}`, `dominant-state:${dominant}|${state}`],
        cause: Object.keys(sample.causes || {}).sort().map(cause => `cause:${cause}`),
        family: Object.keys(sample.families || {}).sort().map(family => `family:${family}`),
        pattern: Object.keys(sample.patterns || {}).sort().map(pattern => `pattern:${pattern}`)
    };
}

function buildTrainingRows(rows, strategyId = 'chainSmallFirst') {
    return (rows || []).map(raw => buildAuditRow(raw, strategyId)).filter(Boolean);
}

function trainFailureCalibrator(rows, options = {}) {
    const strategyId = String(options.strategyId || 'chainSmallFirst');
    const audits = buildTrainingRows(rows, strategyId);
    return trainFailureCalibratorFromAudits(audits, { ...options, strategyId });
}

function trainFailureCalibratorFromAudits(audits, options = {}) {
    const strategyId = String(options.strategyId || 'chainSmallFirst');
    if (!audits.length) throw new Error('Không có candidate diagnostics strict PIT để train failure calibrator.');
    const stats = new Map();
    const root = { exposures: 0, events: 0 };
    for (const row of audits) {
        for (const sample of row.numberSamples) {
            root.exposures++;
            root.events += Number(sample.actual);
            const tokens = Object.values(featureGroups(sample)).flat();
            for (const token of tokens) {
                const item = stats.get(token) || { exposures: 0, events: 0 };
                item.exposures++;
                item.events += Number(sample.actual);
                stats.set(token, item);
            }
        }
    }
    const priorStrength = Math.max(10, Number(options.priorStrength || 500));
    const priorRate = root.events / Math.max(1, root.exposures);
    const tokenModels = {};
    for (const [token, item] of stats) {
        const posterior = (item.events + priorRate * priorStrength) / (item.exposures + priorStrength);
        tokenModels[token] = {
            ...item,
            posterior,
            logLift: logit(posterior) - logit(priorRate),
            reliability: item.exposures / (item.exposures + priorStrength)
        };
    }
    return {
        strategyId,
        priorStrength,
        priorRate,
        trainingDays: audits.length,
        tokenModels
    };
}

function applyRanking(baselineNumbers, ranked, options = {}) {
    const baseline = new Set((baselineNumbers || []).map(Number));
    const byNumber = new Map(ranked.map(row => [row.number, row]));
    const incoming = ranked.filter(row => !baseline.has(row.number));
    const outgoing = [...baseline].map(number => byNumber.get(number))
        .filter(Boolean)
        .sort((left, right) => left.score - right.score || left.number - right.number);
    const swapLimit = Math.max(0, Number(options.swapLimit || 0));
    const minimumMargin = Number(options.minimumMargin || 0);
    const final = new Set(baseline);
    const swaps = [];
    for (let index = 0; index < Math.min(swapLimit, incoming.length, outgoing.length); index++) {
        const protect = incoming[index];
        const remove = outgoing[index];
        const margin = protect.score - remove.score;
        if (margin < minimumMargin) continue;
        final.delete(remove.number);
        final.add(protect.number);
        swaps.push({ out: remove.number, in: protect.number, margin });
    }
    return { betNumbers: [...final].sort((left, right) => left - right), swaps, ranked };
}

function scoreSample(sample, model, options = {}) {
    const groups = featureGroups(sample);
    const groupWeights = {
        dominant: 1,
        support: 0.7,
        evidence: 0.5,
        width: 0.7,
        state: 0.7,
        cause: 0.8,
        family: 0.5,
        pattern: 0.35,
        ...(options.groupWeights || {})
    };
    let weighted = 0;
    let totalWeight = 0;
    const contributions = [];
    for (const [group, tokens] of Object.entries(groups)) {
        const available = tokens.map(token => ({ token, model: model.tokenModels[token] })).filter(row => row.model);
        if (!available.length) continue;
        const groupValue = available.reduce((sum, row) => sum + row.model.logLift * row.model.reliability, 0) / available.length;
        const weight = Number(groupWeights[group] || 0);
        weighted += groupValue * weight;
        totalWeight += weight;
        contributions.push({ group, value: groupValue, tokens: available.map(row => row.token) });
    }
    return {
        score: totalWeight ? weighted / totalWeight : 0,
        contributions
    };
}

function rankAuditRow(audit, model, options = {}) {
    return audit.numberSamples.map(sample => ({
        number: sample.number,
        ...scoreSample(sample, model, options)
    })).sort((left, right) => right.score - left.score || left.number - right.number);
}

function refinePrediction(rawRow, model, options = {}) {
    const strategyId = String(options.strategyId || model.strategyId || 'chainSmallFirst');
    const audit = buildAuditRow(rawRow, strategyId);
    if (!audit) throw new Error(`Không có baseline ${strategyId} cho ${rawRow?.date || 'ngày không rõ'}.`);
    const ranked = rankAuditRow(audit, model, options);
    return applyRanking(rawRow.strategies[strategyId], ranked, options);
}

module.exports = {
    applyRanking,
    buildTrainingRows,
    featureGroups,
    rankAuditRow,
    refinePrediction,
    scoreSample,
    trainFailureCalibrator,
    trainFailureCalibratorFromAudits
};
