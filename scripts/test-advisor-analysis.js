#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { buildAdvisorAnalysis, RESEARCH_POLICIES } = require('../lib/services/advisorAnalysisService');

const numbers = start => Array.from({ length: 30 }, (_, index) => (start + index) % 100).sort((left, right) => left - right);
const methodIds = [
    'dedupEdge75Hold70',
    'dedupEdge50CombinedB40S05Hold70',
    'dedupDropoffHold70',
    'avgEdge50Hold70',
    'chainSmallFirstHold70'
];
const methodSets = Object.fromEntries(methodIds.map((methodId, index) => [methodId, { numbersToBet: numbers(index * 17) }]));

const history = Array.from({ length: 66 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10);
    // The last day is deliberately unresolved. It must never be treated as
    // number 00 in a strict point-in-time report.
    const actualSpecial = index === 65 ? null : (index % 5 === 0 ? 3 : (index % 3 === 0 ? 35 : 68));
    return {
        predictionDate: date,
        sourceDrawDate: new Date(Date.UTC(2025, 11, index + 31)).toISOString().slice(0, 10),
        snapshotImmutable: true,
        summary: { actualSpecial, methods: methodSets }
    };
});

const targetDate = '2026-03-08';
const advisorCache = {
    records: [{
        predictionDate: targetDate,
        main: { methodId: methodIds[0], numbers: methodSets[methodIds[0]].numbersToBet },
        recommendation: {
            methodPool: methodIds,
            ranking: methodIds.map((methodId, index) => ({
                methodId,
                label: methodId,
                score: 0.5 - index * 0.02,
                posteriorMean: 0.4,
                posterior30: 0.4,
                posterior7: 0.4,
                weightedRate7: 0.4,
                weightedRate30: 0.4,
                wilsonLower90: 0.35,
                trend: 0
            })),
            candidateMethods: methodIds.map(methodId => ({ methodId, label: methodId, numbers: methodSets[methodId].numbersToBet }))
        }
    }]
};
const probabilityCache = {
    records: [{
        predictionDate: targetDate,
        rankedNumbers: Array.from({ length: 100 }, (_, number) => ({ number, score: 100 - number, rank: number + 1 }))
    }]
};

const analysis = buildAdvisorAnalysis({ advisorCache, probabilityCache, history });
assert.equal(analysis.version, 'advisor-analysis-v2');
assert.equal(analysis.researchReport.strictPointInTime, true);
assert.equal(analysis.researchReport.policies.length, RESEARCH_POLICIES.length);
assert.ok(analysis.researchReport.policies.every(policy => policy.overall.days > 0), 'every policy should receive immutable resolved samples');
assert.ok(analysis.researchReport.policies.every(policy => policy.decisions.every(row => row.date !== history.at(-1).predictionDate)), 'unresolved snapshots must not become a fake 00 result');
assert.ok(analysis.currentCandidates.every(candidate => candidate.numbers.length === 30), 'current candidates use the snapshot candidate dàn');
assert.equal(analysis.warnings.scoreDateMismatch, false);
assert.equal(analysis.currentAdvice.agreement.availablePolicies, RESEARCH_POLICIES.length, 'advice reports the available fixed dàn policies');
assert.ok(analysis.currentAdvice.recommendations.length >= 2, 'advice must explain the operational recommendation and its evidence');

const legacyAdvisorCache = {
    records: [{
        ...advisorCache.records[0],
        recommendation: {
            ...advisorCache.records[0].recommendation,
            candidateMethods: undefined
        }
    }]
};
const legacyAnalysis = buildAdvisorAnalysis({ advisorCache: legacyAdvisorCache, probabilityCache, history });
assert.ok(
    legacyAnalysis.currentCandidates
        .filter(candidate => candidate.id !== 'balanced')
        .every(candidate => candidate.numbers.length === 0),
    'legacy snapshots must not relabel the one issued dàn as every research candidate'
);

const beforeFutureMutation = analysis.researchReport.policies.find(policy => policy.id === 'balanced').decisions[0];
const mutatedHistory = history.map((run, index) => index === 60
    ? { ...run, summary: { ...run.summary, actualSpecial: 99 } }
    : run);
const afterFutureMutation = buildAdvisorAnalysis({ advisorCache, probabilityCache, history: mutatedHistory })
    .researchReport.policies.find(policy => policy.id === 'balanced').decisions[0];
assert.deepEqual(
    { date: afterFutureMutation.date, methodId: afterFutureMutation.methodId, selectionScore: afterFutureMutation.selectionScore },
    { date: beforeFutureMutation.date, methodId: beforeFutureMutation.methodId, selectionScore: beforeFutureMutation.selectionScore },
    'a later draw must not change an earlier strict PIT decision'
);

console.log('PASS advisor analysis uses immutable snapshots, excludes unresolved rows, and keeps earlier selections independent from future results.');
