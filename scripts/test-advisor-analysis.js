#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { buildAdvisorAnalysis, RESEARCH_POLICIES, buildConsensusFusion, mergeImmutableResearchHistory } = require('../lib/services/advisorAnalysisService');

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
assert.equal(analysis.version, 'advisor-analysis-v7');
assert.equal(analysis.researchReport.strictPointInTime, true);
assert.equal(analysis.researchReport.policies.length, RESEARCH_POLICIES.length);
assert.ok(analysis.researchReport.policies.every(policy => policy.coverage.candidateDays > 0), 'every policy should report its eligible PIT opportunities');
assert.ok(analysis.researchReport.policies.every(policy => policy.coverage.issuedDays === policy.overall.days), 'coverage must count only days where a fixed 30-number dàn was issued');
assert.ok(analysis.researchReport.policies.every(policy => policy.coverage.issuedDays <= policy.coverage.candidateDays), 'an abstaining policy cannot issue more dàn than eligible days');
assert.ok(analysis.researchReport.policies.every(policy => policy.decisions.every(row => row.date !== history.at(-1).predictionDate)), 'unresolved snapshots must not become a fake 00 result');
assert.ok(analysis.researchReport.policies.every(policy => policy.decisions.every(row => row.numbers.length === 30 && !row.abstained)), 'PIT decisions must retain their issued 30-number dàn for research inspection');
assert.equal(analysis.replayLedger.kind, 'pit-replay', 'research decisions are exposed separately from live snapshots');
assert.ok(analysis.replayLedger.summary.totalSettled > 0, 'PIT replay ledger must summarize retained dàn rather than rendering as unissued');
assert.ok(analysis.currentCandidates.every(candidate => candidate.numbers.length === 30), 'current candidates use the snapshot candidate dàn');
assert.equal(analysis.warnings.scoreDateMismatch, false);

const liveAdvisorCache = {
    records: [
        {
            predictionDate: '2026-03-08',
            settled: true,
            actual: 3,
            lifecycle: { mode: 'live-issued', immutableNumbers: true },
            recommendation: { selected: { methodId: methodIds[0], label: methodIds[0] } },
            main: { methodId: methodIds[0], label: methodIds[0], numbers: methodSets[methodIds[0]].numbersToBet },
            strategySnapshots: [{
                strategyId: 'balanced-selector-fixed30-v1',
                methodId: methodIds[0],
                methodLabel: methodIds[0],
                numbers: methodSets[methodIds[0]].numbersToBet,
                abstained: false,
                hit: true
            }]
        },
        {
            predictionDate: '2026-03-09',
            settled: false,
            actual: null,
            lifecycle: { mode: 'live-issued', immutableNumbers: true },
            recommendation: { selected: { methodId: methodIds[1], label: methodIds[1] } },
            main: { methodId: methodIds[1], label: methodIds[1], numbers: methodSets[methodIds[1]].numbersToBet },
            strategySnapshots: [{
                strategyId: 'balanced-selector-fixed30-v1',
                methodId: methodIds[1],
                methodLabel: methodIds[1],
                numbers: methodSets[methodIds[1]].numbersToBet,
                abstained: false,
                hit: null
            }]
        }
    ]
};
const liveLedgerAnalysis = buildAdvisorAnalysis({ advisorCache: liveAdvisorCache, probabilityCache, history });
assert.equal(liveLedgerAnalysis.liveSelectorLedger.kind, 'live-issued');
assert.equal(liveLedgerAnalysis.liveSelectorLedger.summary.totalSettled, 1, 'only a settled, frozen strategy snapshot may enter the live result');
assert.equal(liveLedgerAnalysis.liveSelectorLedger.summary.totalWins, 1);
assert.equal(liveLedgerAnalysis.liveSelectorLedger.records[0].numbers.length, 30, 'the actual ledger must retain the frozen dàn');
assert.equal(liveLedgerAnalysis.liveSelectorLedger.records[1].settled, false, 'a pending dàn remains pending instead of being treated as a loss');
assert.equal(analysis.currentAdvice.agreement.availablePolicies, RESEARCH_POLICIES.length, 'advice reports the available fixed dàn policies');
assert.ok(analysis.currentAdvice.recommendations.length >= 2, 'advice must explain the operational recommendation and its evidence');
assert.ok(analysis.methodComplementarity.length > 0, 'analysis must expose pairwise method complementarity diagnostics');
assert.ok(
    analysis.researchReport.policies.some(policy => policy.id === 'handoffGuard'),
    'the research lab must evaluate the conditional handoff policy without promoting it automatically'
);
assert.ok(
    analysis.researchReport.policies.some(policy => policy.id === 'consensusFusion' && policy.overall.days > 0),
    'the research lab must evaluate a fixed-count membership consensus lane'
);
assert.ok(
    analysis.researchReport.policies.some(policy => policy.id === 'wilsonAbstain'),
    'the research lab must retain an explicit skip-day lane'
);

const consensus = buildConsensusFusion({
    ranking: methodIds.map(methodId => ({
        methodId,
        posteriorMean: 0.4,
        posterior30: 0.4,
        wilsonLower90: 0.36
    }))
}, { summary: { methods: methodSets } }, methodIds);
assert.equal(consensus.numbers.length, 30, 'membership consensus must keep the same 30-number capital exposure');
assert.ok(consensus.sources.length >= 2, 'membership consensus requires at least two immutable candidate dàn');

const newerAdvisorRun = {
    predictionDate: '2026-03-09',
    sourceDrawDate: '2026-03-08',
    settled: true,
    actual: 35,
    lifecycle: { mode: 'live-issued', immutableNumbers: true },
    main: { methodId: methodIds[0], numbers: methodSets[methodIds[0]].numbersToBet },
    recommendation: {
        candidateMethods: methodIds.map(methodId => ({ methodId, numbers: methodSets[methodId].numbersToBet }))
    }
};
const mergedHistory = mergeImmutableResearchHistory(history, [newerAdvisorRun]);
assert.ok(mergedHistory.some(run => run.predictionDate === '2026-03-09' && run.summary.actualSpecial === 35), 'a newer settled advisor ledger may extend research without rebuilding its dàn');

const longHorizonCache = {
    version: 'advisor-long-horizon-research-v1',
    generatedAt: '2026-03-07T00:00:00.000Z',
    strictPointInTime: true,
    methods: [{
        id: 'synthetic',
        label: 'Synthetic',
        total: {},
        splits: {},
        yearly: Array.from({ length: 30 }, (_, index) => ({ period: String(index) })),
        monthly: Array.from({ length: 48 }, (_, index) => ({ period: String(index) })),
        weekly: Array.from({ length: 60 }, (_, index) => ({ period: String(index) })),
        recentRows: Array.from({ length: 220 }, (_, index) => ({ date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}` }))
    }]
};
const compactAnalysis = buildAdvisorAnalysis({ advisorCache, probabilityCache, longHorizonCache, history });
const compactMethod = compactAnalysis.longHorizonResearch.methods[0];
assert.equal(compactMethod.yearly.length, 22, 'the browser receives a compact multi-year payload');
assert.equal(compactMethod.monthly.length, 36, 'the browser receives recent monthly periods only');
assert.equal(compactMethod.weekly.length, 52, 'the browser receives recent weekly periods only');
assert.equal(compactMethod.recentRows.length, 180, 'the browser receives a bounded recent trace');

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
