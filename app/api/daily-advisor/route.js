import { NextResponse } from 'next/server';
import { getRawData, loadJsonWithSupabaseFallback } from '@/lib/data-access';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0'
};

function isAuthorized(request) {
    if (request.cookies?.get('xsmb_session')?.value === 'authenticated') {
        return true;
    }
    const expected = process.env.PREDICTION_API_TOKEN || process.env.EXTERNAL_API_TOKEN || '';
    if (!expected) return true;

    const url = new URL(request.url);
    const provided = request.headers.get('x-api-key')
        || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
        || url.searchParams.get('token')
        || '';
    return Boolean(provided === expected);
}

function computeWilsonCI95(wins, n) {
    if (!n || n <= 0) return { low: 0, high: 0, formatted: '0.0% – 0.0%' };
    const p = wins / n;
    const z = 1.96;
    const z2 = z * z;
    const denom = 1 + z2 / n;
    const center = p + z2 / (2 * n);
    const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
    const low = Math.max(0, (center - margin) / denom);
    const high = Math.min(1, (center + margin) / denom);
    return {
        low: Number(low.toFixed(4)),
        high: Number(high.toFixed(4)),
        formatted: `${(low * 100).toFixed(1)}% – ${(high * 100).toFixed(1)}%`
    };
}

function computeDrawdown(rows, payoutPerWinK = 84 * 1000) {
    let peak = 0;
    let equity = 0;
    let maxDrawdownK = 0;
    let currentDrawdownDays = 0;
    let maxDrawdownDays = 0;

    rows.forEach(row => {
        const isHit = Boolean(row.hit ?? row.strategy?.hit);
        const dayStakeK = Number(row.strategy?.betCount || row.betCount || 30) * 1000;
        const dayPayoutK = isHit ? payoutPerWinK : 0;
        const dayProfitK = dayPayoutK - dayStakeK;

        equity += dayProfitK;
        if (equity > peak) {
            peak = equity;
            currentDrawdownDays = 0;
        } else {
            currentDrawdownDays += 1;
            const ddK = peak - equity;
            if (ddK > maxDrawdownK) {
                maxDrawdownK = ddK;
            }
            if (currentDrawdownDays > maxDrawdownDays) {
                maxDrawdownDays = currentDrawdownDays;
            }
        }
    });

    return { maxDrawdownK, maxDrawdownDays };
}

function normalizeDate(value) {
    return String(value || '').slice(0, 10);
}

function nextIsoDate(value) {
    const date = new Date(`${String(value || '').slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
}

function readSpecial(row) {
    const value = row?.special ?? row?.db ?? row?.giaiDb ?? row?.giai_dac_biet;
    const number = Number(value);
    return Number.isInteger(number) ? number : null;
}

function settleFromRaw(payload, rawRows) {
    const actualByDate = new Map(
        (rawRows || []).map(row => [normalizeDate(row?.date || row?.ngay), readSpecial(row)])
            .filter(([date, actual]) => date && actual !== null)
    );
    const records = payload.records.map(record => {
        const actual = actualByDate.get(normalizeDate(record?.predictionDate));
        if (actual === undefined || record?.settled === true) return record;
        return {
            ...record,
            settled: true,
            actual,
            main: { ...record.main, hit: Array.isArray(record.main?.numbers) && record.main.numbers.includes(actual) },
            ...(record.strategySnapshots ? {
                strategySnapshots: record.strategySnapshots.map(strategy => ({
                    ...strategy,
                    hit: strategy.abstained || !Array.isArray(strategy.numbers) || !strategy.numbers.length
                        ? null
                        : strategy.numbers.includes(actual)
                }))
            } : {}),
            ...(record.hybrid ? {
                hybrid: {
                    ...record.hybrid,
                    hit: Array.isArray(record.hybrid?.numbers) && record.hybrid.numbers.includes(actual),
                    core10Hit: Array.isArray(record.hybrid?.core10) ? record.hybrid.core10.includes(actual) : null,
                    core20Hit: Array.isArray(record.hybrid?.core20) ? record.hybrid.core20.includes(actual) : null,
                    expanded36Hit: Array.isArray(record.hybrid?.expanded36) ? record.hybrid.expanded36.includes(actual) : null
                }
            } : {})
        };
    });
    const summarize = key => {
        const settled = records.filter(record => record.settled && record[key]);
        const wins = settled.filter(record => record[key]?.hit).length;
        const losses = settled.length - wins;
        const breakEvenHitRate = 30 / 84;
        const hitRate = settled.length ? wins / settled.length : 0;
        const stakeK = settled.length * 30 * 1000;
        const profitK = wins * 84 * 1000 - stakeK;
        const confidenceInterval95 = computeWilsonCI95(wins, settled.length);
        const { maxDrawdownK, maxDrawdownDays } = computeDrawdown(settled.map(r => ({ hit: r[key]?.hit, betCount: 30 })));
        const realisticPayoutMultiplier = 81.5;
        const realisticBreakEvenHitRate = 30 / realisticPayoutMultiplier;
        const realisticProfitK = wins * realisticPayoutMultiplier * 1000 - stakeK;
        return {
            days: settled.length,
            wins,
            losses,
            hitRate,
            confidenceInterval95,
            maxDrawdownK,
            maxDrawdownDays,
            stakeK,
            profitK,
            roi: stakeK ? profitK / stakeK : 0,
            breakEvenHitRate,
            breakEvenWins: Math.ceil(settled.length * breakEvenHitRate),
            isAboveBreakEven: settled.length > 0 && hitRate >= breakEvenHitRate,
            marginToBreakEven: hitRate - breakEvenHitRate,
            realisticPayoutMultiplier,
            realisticBreakEvenHitRate,
            realisticProfitK,
            realisticRoi: stakeK ? realisticProfitK / stakeK : 0,
            isAboveRealisticBreakEven: settled.length > 0 && hitRate >= realisticBreakEvenHitRate,
            marginToRealisticBreakEven: hitRate - realisticBreakEvenHitRate
        };
    };
    const summarizeStrategy = strategyId => {
        const candidateRows = records.map(record => ({
            record,
            strategy: (record.strategySnapshots || []).find(row => row.strategyId === strategyId)
        })).filter(row => row.record.settled && row.strategy);
        const issuedRows = candidateRows.filter(row => !row.strategy.abstained && row.strategy.numbers?.length);
        const wins = issuedRows.filter(row => row.strategy.hit).length;
        const losses = issuedRows.length - wins;
        let currentLoss = 0;
        let longestLoss = 0;
        issuedRows.forEach(row => {
            currentLoss = row.strategy.hit ? 0 : currentLoss + 1;
            longestLoss = Math.max(longestLoss, currentLoss);
        });
        const stakeK = issuedRows.reduce((sum, row) => sum + Number(row.strategy.betCount || row.strategy.numbers.length) * 1000, 0);
        const profitK = wins * 84 * 1000 - stakeK;
        const averageBetCount = issuedRows.length
            ? issuedRows.reduce((sum, row) => sum + Number(row.strategy.betCount || row.strategy.numbers.length), 0) / issuedRows.length
            : 0;
        const hitRate = issuedRows.length ? wins / issuedRows.length : 0;
        const breakEvenHitRate = averageBetCount / 84;
        const confidenceInterval95 = computeWilsonCI95(wins, issuedRows.length);
        const { maxDrawdownK, maxDrawdownDays } = computeDrawdown(issuedRows);
        const realisticPayoutMultiplier = 81.5;
        const realisticBreakEvenHitRate = averageBetCount ? averageBetCount / realisticPayoutMultiplier : 0;
        const realisticProfitK = wins * realisticPayoutMultiplier * 1000 - stakeK;
        return {
            candidateDays: candidateRows.length,
            issuedDays: issuedRows.length,
            abstainedDays: candidateRows.length - issuedRows.length,
            coverage: candidateRows.length ? issuedRows.length / candidateRows.length : 0,
            days: issuedRows.length,
            wins,
            losses,
            hitRate,
            confidenceInterval95,
            maxDrawdownK,
            maxDrawdownDays,
            averageBetCount,
            stakeK,
            profitK,
            roi: stakeK ? profitK / stakeK : 0,
            longestLoss,
            breakEvenHitRate,
            breakEvenWins: Math.ceil(issuedRows.length * breakEvenHitRate),
            isAboveBreakEven: issuedRows.length > 0 && hitRate >= breakEvenHitRate,
            marginToBreakEven: hitRate - breakEvenHitRate,
            realisticPayoutMultiplier,
            realisticBreakEvenHitRate,
            realisticProfitK,
            realisticRoi: stakeK ? realisticProfitK / stakeK : 0,
            isAboveRealisticBreakEven: issuedRows.length > 0 && hitRate >= realisticBreakEvenHitRate,
            marginToRealisticBreakEven: hitRate - realisticBreakEvenHitRate
        };
    };
    const strategyMetadata = new Map((payload.strategyCatalog || []).map(strategy => [strategy.id, strategy]));
    records.forEach(record => (record.strategySnapshots || []).forEach(strategy => {
        if (!strategyMetadata.has(strategy.strategyId)) {
            strategyMetadata.set(strategy.strategyId, {
                id: strategy.strategyId,
                label: strategy.label || strategy.strategyId,
                status: strategy.status || 'research-only',
                description: strategy.description || ''
            });
        }
    }));
    let historyPayload = null;
    try {
        const fs = require('fs');
        const path = require('path');
        const localHist = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_prediction_history.json');
        if (fs.existsSync(localHist)) {
            historyPayload = JSON.parse(fs.readFileSync(localHist, 'utf8'));
        }
    } catch (_) {}

    const latestRawDate = normalizeDate(rawRows?.at(-1)?.date || rawRows?.at(-1)?.ngay);

    let dualMerge = payload.dualMerge;
    const lastDualMergeDate = normalizeDate(dualMerge?.settledLedger?.at(-1)?.date);
    if (!dualMerge || !Array.isArray(dualMerge.settledLedger) || dualMerge.settledLedger.length === 0 || (latestRawDate && lastDualMergeDate && lastDualMergeDate < latestRawDate)) {
        const dualMergeService = require('@/lib/services/dualMergeAdvisorService');
        dualMerge = dualMergeService.buildDualMergeAdvisor(historyPayload, rawRows, { existingAdvisorRecords: payload.records, existingDualMerge: payload.dualMerge });
    }

    let adaptiveDualMerge = payload.adaptiveDualMerge;
    const lastAdaptiveDate = normalizeDate(adaptiveDualMerge?.settledLedger?.at(-1)?.predictionDate || adaptiveDualMerge?.settledLedger?.at(-1)?.date);
    if (!adaptiveDualMerge || !Array.isArray(adaptiveDualMerge.settledLedger) || adaptiveDualMerge.settledLedger.length === 0 || !adaptiveDualMerge.latestRecommendation?.overlapCount || (latestRawDate && lastAdaptiveDate && lastAdaptiveDate < latestRawDate)) {
        const { buildAdaptiveDualMergeAdvisor } = require('@/lib/services/adaptiveDualMergeAdvisorService');
        adaptiveDualMerge = buildAdaptiveDualMergeAdvisor(historyPayload, rawRows, { existingAdvisorRecords: payload.records, existingAdaptiveDualMerge: payload.adaptiveDualMerge });
    }

    let tripleMerge = payload.tripleMerge;
    const lastTripleDate = normalizeDate(tripleMerge?.settledLedger?.at(-1)?.date);
    if (!tripleMerge || !Array.isArray(tripleMerge.settledLedger) || tripleMerge.settledLedger.length === 0 || !tripleMerge.latestRecommendation?.tierX3?.length || (latestRawDate && lastTripleDate && lastTripleDate < latestRawDate)) {
        const { buildTripleMergeAdvisor } = require('@/lib/services/tripleMergeAdvisorService');
        tripleMerge = buildTripleMergeAdvisor(historyPayload, rawRows, { existingAdvisorRecords: payload.records, existingTripleMerge: payload.tripleMerge });
    }

    let metaLearner = payload.metaLearner;
    const lastMetaLearnerDate = normalizeDate(metaLearner?.settledLedger?.at(-1)?.date);
    if (!metaLearner || !Array.isArray(metaLearner.settledLedger) || metaLearner.settledLedger.length === 0 || (latestRawDate && lastMetaLearnerDate && lastMetaLearnerDate < latestRawDate)) {
        const { buildMetaLearnerAdvisor } = require('@/lib/services/metaLearnerAdvisorService');
        metaLearner = buildMetaLearnerAdvisor(historyPayload, rawRows, { existingAdvisorCache: payload, existingMetaLearner: payload.metaLearner });
    }

    let loDualMerge = payload.loDualMerge;
    const lastLoDualDate = normalizeDate(loDualMerge?.settledLedger?.at(-1)?.date);
    if (!loDualMerge || !Array.isArray(loDualMerge.settledLedger) || loDualMerge.settledLedger.length === 0 || (latestRawDate && lastLoDualDate && lastLoDualDate < latestRawDate)) {
        const { buildLoDualMergeAdvisor } = require('@/lib/services/loDualMergeAdvisorService');
        loDualMerge = buildLoDualMergeAdvisor(dualMerge, rawRows, tripleMerge);
    }

    let loTriHarmonic = payload.loTriHarmonic;
    const lastLoTriDate = normalizeDate(loTriHarmonic?.settledLedger?.at(-1)?.date);
    if (!loTriHarmonic || !Array.isArray(loTriHarmonic.settledLedger) || loTriHarmonic.settledLedger.length === 0 || (latestRawDate && lastLoTriDate && lastLoTriDate < latestRawDate)) {
        const { buildLoTriHarmonicAdvisor } = require('@/lib/services/loDualMergeAdvisorService');
        loTriHarmonic = buildLoTriHarmonicAdvisor(rawRows);
    }

    let loQuantumBayesFusion = payload.loQuantumBayesFusion;
    const lastLoQmbDate = normalizeDate(loQuantumBayesFusion?.settledLedger?.at(-1)?.date);
    if (!loQuantumBayesFusion || !Array.isArray(loQuantumBayesFusion.settledLedger) || loQuantumBayesFusion.settledLedger.length === 0 || (latestRawDate && lastLoQmbDate && lastLoQmbDate < latestRawDate)) {
        const { buildLoQuantumBayesFusionAdvisor } = require('@/lib/services/loDualMergeAdvisorService');
        loQuantumBayesFusion = buildLoQuantumBayesFusionAdvisor(rawRows, { existingLoQuantumBayesFusion: payload.loQuantumBayesFusion });
    }

    let dynamicMetaAdvisor = payload.dynamicMetaAdvisor;
    const lastDynamicDate = normalizeDate(dynamicMetaAdvisor?.liveDiary?.at(-1)?.date);
    if (!dynamicMetaAdvisor || !Array.isArray(dynamicMetaAdvisor.liveDiary) || dynamicMetaAdvisor.liveDiary.length === 0 || (latestRawDate && lastDynamicDate && lastDynamicDate < latestRawDate)) {
        const { buildDynamicCrossMethodAdvisor } = require('@/lib/services/loDualMergeAdvisorService');
        dynamicMetaAdvisor = buildDynamicCrossMethodAdvisor({
            loQuantumBayesFusion,
            loDualMerge,
            loTriHarmonic
        }, rawRows, { existingDynamicMetaAdvisor: payload.dynamicMetaAdvisor });
    }
    let streakAwareDeAdvisor = payload.streakAwareDeAdvisor;
    if (!streakAwareDeAdvisor && dualMerge && tripleMerge) {
        try {
            const { buildStreakAwareDeAdvisor } = require('@/lib/services/aiLotteryResearchService');
            streakAwareDeAdvisor = buildStreakAwareDeAdvisor(dualMerge, tripleMerge, adaptiveDualMerge, rawRows);
        } catch (_) {}
    }

    let loQuadHybrid = payload.loQuadHybrid;
    if (!loQuadHybrid && loQuantumBayesFusion && loDualMerge) {
        try {
            const { buildLoQuadHybridAdvisor } = require('@/lib/services/aiLotteryResearchService');
            loQuadHybrid = buildLoQuadHybridAdvisor(loQuantumBayesFusion, loDualMerge, rawRows, loTriHarmonic);
        } catch (_) {}
    }

    let loXien4Synergy = payload.loXien4Synergy;
    if (!loXien4Synergy && loQuadHybrid) {
        try {
            const { buildLoXien4SynergyAdvisor } = require('@/lib/services/aiLotteryResearchService');
            loXien4Synergy = buildLoXien4SynergyAdvisor(loQuadHybrid, rawRows);
        } catch (_) {}
    }

    let crossHedgingPortfolio = payload.crossHedgingPortfolio || null;
    let crossHedgingService = null;
    try {
        crossHedgingService = require('@/lib/services/crossHedgingPortfolioService');
    } catch (_) {
        try {
            crossHedgingService = require('../../../lib/services/crossHedgingPortfolioService');
        } catch (_) {}
    }

    if (crossHedgingService) {
        // Bước 1: Luôn ưu tiên đối soát on-the-fly cho pending recommendation nếu ngày đó đã có kết quả mở thưởng
        const pendingTargetDate = normalizeDate(crossHedgingPortfolio?.targetDate || crossHedgingPortfolio?.latestRecommendation?.targetDate);
        const actualRow = pendingTargetDate ? (rawRows || []).find(r => normalizeDate(r?.date || r?.ngay) === pendingTargetDate) : null;
        if (actualRow && (actualRow.special != null || actualRow.prize1 != null)) {
            try {
                const decision = crossHedgingPortfolio.latestRecommendation || crossHedgingPortfolio;
                const settled = crossHedgingService.settleCrossAssetPortfolio(decision, actualRow);
                crossHedgingPortfolio = {
                    ...crossHedgingPortfolio,
                    lastSettled: settled
                };
                const existsInLedger = (crossHedgingPortfolio.settledLedger || []).some(r => normalizeDate(r?.date) === pendingTargetDate);
                if (!existsInLedger && Array.isArray(crossHedgingPortfolio.settledLedger)) {
                    crossHedgingPortfolio.settledLedger = [...crossHedgingPortfolio.settledLedger, settled];
                }
            } catch (err) {
                console.error('[API daily-advisor] Error settling crossHedging on-the-fly:', err);
            }
        }

        const lastHedgingDate = normalizeDate(
            crossHedgingPortfolio?.settledLedger?.at(-1)?.date ||
            crossHedgingPortfolio?.targetDate
        );

        if (!crossHedgingPortfolio || !Array.isArray(crossHedgingPortfolio.settledLedger) || crossHedgingPortfolio.settledLedger.length === 0 || (latestRawDate && lastHedgingDate && lastHedgingDate < latestRawDate)) {
            try {
                const backtestRes = crossHedgingService.runCrossHedgingBacktest2026(rawRows, {
                    advisorCache: payload
                });
                const nextTargetDate = normalizeDate(payload?.pendingPredictionDate || (rawRows.length ? nextIsoDate(rawRows.at(-1)?.date) : null));
                const pendingDecision = crossHedgingService.evaluateCrossAssetPortfolio(
                    nextTargetDate,
                    rawRows,
                    payload,
                    {
                        metrics: backtestRes.summary,
                        priorState: backtestRes.latestDecision ? {
                            mode: backtestRes.latestDecision.mode,
                            abstainConsecutive: backtestRes.latestDecision.regimeDetails?.abstainConsecutive || 0
                        } : null,
                        ledgerHistory: backtestRes.settledLedger
                    }
                );
                const { isPredictionLockActive, preserveLockedRecommendation } = require('@/lib/utils/predictionLockGuard');
                const lockStatus = isPredictionLockActive(nextTargetDate, rawRows);
                const finalPendingDecision = preserveLockedRecommendation(
                    payload.crossHedgingPortfolio?.latestRecommendation || payload.crossHedgingPortfolio,
                    pendingDecision,
                    lockStatus
                );
                crossHedgingPortfolio = {
                    ...finalPendingDecision,
                    latestRecommendation: finalPendingDecision,
                    summary: backtestRes.summary,
                    metrics: {
                        dailyPositiveProfitRate: backtestRes.summary.dailyPositiveProfitRate,
                        cumulativeProfitK: backtestRes.summary.cumulativeProfitK,
                        cumulativeRoi: backtestRes.summary.cumulativeRoi,
                        maxConsecutiveLossDays: backtestRes.summary.maxConsecutiveLossDays,
                        totalDraws2026: backtestRes.summary.totalDraws2026,
                        positiveDays2026: backtestRes.summary.positiveDays2026,
                        activeDays: backtestRes.summary.activeDays
                    },
                    settledLedger: backtestRes.settledLedger
                };
            } catch (err) {
                console.error('[API daily-advisor] Error rebuilding crossHedgingPortfolio:', err);
            }
        }
    }

    let triCoreDe = payload.triCoreDe || null;
    try {
        const { buildTriCoreDeAdvisor } = require('@/lib/services/triCoreDeAdvisorService');
        triCoreDe = buildTriCoreDeAdvisor(rawRows, payload, { existingTriCoreDe: payload.triCoreDe });
    } catch (err) {
        console.error('[API daily-advisor] Error building triCoreDe:', err);
    }

    let deDropoffMerge = payload.deDropoffMerge || null;
    try {
        const { buildDeDropoffMergeAdvisor } = require('@/lib/services/deDropoffMergeAdvisorService');
        deDropoffMerge = buildDeDropoffMergeAdvisor(rawRows, payload, { existingDeDropoffMerge: payload.deDropoffMerge });
    } catch (err) {
        console.error('[API daily-advisor] Error building deDropoffMerge:', err);
    }

    let loDropoff27 = payload.loDropoff27 || null;
    try {
        const { buildLoDropoff27Advisor } = require('@/lib/services/loDropoff27AdvisorService');
        loDropoff27 = buildLoDropoff27Advisor(rawRows, payload, { existingLoDropoff27: payload.loDropoff27 });
    } catch (err) {
        console.error('[API daily-advisor] Error building loDropoff27:', err);
    }

    let semanticResonanceSuite = payload.semanticResonanceSuite || null;
    try {
        const { buildSemanticResonanceSuiteAdvisor } = require('@/lib/services/semanticResonanceSuiteAdvisorService');
        semanticResonanceSuite = buildSemanticResonanceSuiteAdvisor(rawRows, payload, { existingSemanticResonanceSuite: payload.semanticResonanceSuite });
    } catch (err) {
        console.error('[API daily-advisor] Error building semanticResonanceSuite:', err);
    }

    return {
        ...payload,
        records,
        metaLearner,
        dualMerge,
        tripleMerge,
        adaptiveDualMerge,
        streakAwareDeAdvisor: streakAwareDeAdvisor || payload.streakAwareDeAdvisor || null,
        deMarkovGapHazard: payload.deMarkovGapHazard || streakAwareDeAdvisor?.markovAdvisor || null,
        dePositionalGraphFlow: payload.dePositionalGraphFlow || streakAwareDeAdvisor?.graphAdvisor || null,
        loDualMerge,
        loTriHarmonic,
        loQuantumBayesFusion,
        loQuadHybrid: loQuadHybrid || payload.loQuadHybrid || null,
        loPentaMatrix: payload.loPentaMatrix || null,
        loPositionalBridgeFlow: payload.loPositionalBridgeFlow || null,
        loHawkesClustering: payload.loHawkesClustering || null,
        loXien4Synergy: loXien4Synergy || payload.loXien4Synergy || null,
        lo4EngineFusion: payload.lo4EngineFusion || null,
        crossHedgingPortfolio: crossHedgingPortfolio || payload.crossHedgingPortfolio || null,
        dynamicMetaAdvisor: dynamicMetaAdvisor || payload.dynamicMetaAdvisor || loQuantumBayesFusion?.dynamicMetaAdvisor || null,
        triCoreDe: triCoreDe || payload.triCoreDe || null,
        deDropoffMerge: deDropoffMerge || payload.deDropoffMerge || null,
        loDropoff27: loDropoff27 || payload.loDropoff27 || null,
        semanticResonanceSuite: semanticResonanceSuite || payload.semanticResonanceSuite || null,
        dailyLockedBetsRegistry: payload.dailyLockedBetsRegistry || null,
        latestDataDate: rawRows?.at(-1)?.date || payload.latestDataDate,
        snapshotLock: (() => {
            try {
                const { isPredictionLockActive } = require('@/lib/utils/predictionLockGuard');
                const nextTargetDate = payload?.streakAwareDeAdvisor?.latestRecommendation?.predictionDate || payload?.pendingPredictionDate;
                return isPredictionLockActive(nextTargetDate, rawRows);
            } catch (_) {
                return payload.snapshotLock || null;
            }
        })(),
        summary: { main: summarize('main'), hybrid: summarize('hybrid') },
        strategyCatalog: [...strategyMetadata.values()],
        strategySummaries: [...strategyMetadata.values()].map(strategy => ({
            ...strategy,
            summary: summarizeStrategy(strategy.id)
        }))
    };
}

export async function GET(request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS });
    }
    try {
        let payload = null;
        try {
            payload = await loadJsonWithSupabaseFallback('cached_daily_method_advisor.json');
        } catch (_) {}

        if (!payload || !Array.isArray(payload.records)) {
            const fs = require('fs');
            const path = require('path');
            const localFile = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
            if (fs.existsSync(localFile)) {
                payload = JSON.parse(fs.readFileSync(localFile, 'utf8'));
            }
        }

        if (!payload || !Array.isArray(payload.records)) {
            throw new Error('Cache gợi ý chưa được sinh');
        }

        // Guarantee that dualMerge, tripleMerge, adaptiveDualMerge are populated with complete full-year backtest ledgers
        const fs = require('fs');
        const path = require('path');
        const localFile = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
        if (fs.existsSync(localFile)) {
            try {
                const localPayload = JSON.parse(fs.readFileSync(localFile, 'utf8'));
                if ((localPayload?.dualMerge?.settledLedger?.length || 0) > (payload?.dualMerge?.settledLedger?.length || 0)) {
                    payload.dualMerge = localPayload.dualMerge;
                }
                if ((localPayload?.adaptiveDualMerge?.settledLedger?.length || 0) > (payload?.adaptiveDualMerge?.settledLedger?.length || 0)) {
                    payload.adaptiveDualMerge = localPayload.adaptiveDualMerge;
                }
                if ((localPayload?.tripleMerge?.settledLedger?.length || 0) > (payload?.tripleMerge?.settledLedger?.length || 0)) {
                    payload.tripleMerge = localPayload.tripleMerge;
                }
                if ((localPayload?.loDualMerge?.settledLedger?.length || 0) > (payload?.loDualMerge?.settledLedger?.length || 0)) {
                    payload.loDualMerge = localPayload.loDualMerge;
                }
                if ((localPayload?.loQuantumBayesFusion?.settledLedger?.length || 0) > (payload?.loQuantumBayesFusion?.settledLedger?.length || 0)) {
                    payload.loQuantumBayesFusion = localPayload.loQuantumBayesFusion;
                }
                if ((localPayload?.loTriHarmonic?.settledLedger?.length || 0) > (payload?.loTriHarmonic?.settledLedger?.length || 0)) {
                    payload.loTriHarmonic = localPayload.loTriHarmonic;
                }
                if (localPayload?.dynamicMetaAdvisor && (!payload?.dynamicMetaAdvisor || (localPayload.dynamicMetaAdvisor.liveDiary?.length || 0) >= (payload.dynamicMetaAdvisor.liveDiary?.length || 0))) {
                    payload.dynamicMetaAdvisor = localPayload.dynamicMetaAdvisor;
                }
                if (localPayload?.metaLearner && (!payload?.metaLearner || (localPayload.metaLearner.settledLedger?.length || 0) > (payload.metaLearner.settledLedger?.length || 0))) {
                    payload.metaLearner = localPayload.metaLearner;
                }
                if (!payload?.streakAwareDeAdvisor && localPayload?.streakAwareDeAdvisor) {
                    payload.streakAwareDeAdvisor = localPayload.streakAwareDeAdvisor;
                }
                if (!payload?.deMarkovGapHazard && localPayload?.deMarkovGapHazard) {
                    payload.deMarkovGapHazard = localPayload.deMarkovGapHazard;
                }
                if (!payload?.dePositionalGraphFlow && localPayload?.dePositionalGraphFlow) {
                    payload.dePositionalGraphFlow = localPayload.dePositionalGraphFlow;
                }
                if (!payload?.loQuadHybrid && localPayload?.loQuadHybrid) {
                    payload.loQuadHybrid = localPayload.loQuadHybrid;
                }
                if (!payload?.loPentaMatrix && localPayload?.loPentaMatrix) {
                    payload.loPentaMatrix = localPayload.loPentaMatrix;
                }
                if (!payload?.loPositionalBridgeFlow && localPayload?.loPositionalBridgeFlow) {
                    payload.loPositionalBridgeFlow = localPayload.loPositionalBridgeFlow;
                }
                if (!payload?.loHawkesClustering && localPayload?.loHawkesClustering) {
                    payload.loHawkesClustering = localPayload.loHawkesClustering;
                }
                if (!payload?.loXien4Synergy && localPayload?.loXien4Synergy) {
                    payload.loXien4Synergy = localPayload.loXien4Synergy;
                }
                if (!payload?.lo4EngineFusion?.modes || (localPayload?.lo4EngineFusion?.settledLedger?.length || 0) > (payload?.lo4EngineFusion?.settledLedger?.length || 0)) {
                    payload.lo4EngineFusion = localPayload.lo4EngineFusion;
                }
                if (!payload?.loTop5ConsensusXien && localPayload?.loTop5ConsensusXien) {
                    payload.loTop5ConsensusXien = localPayload.loTop5ConsensusXien;
                }
                if (localPayload?.crossHedgingPortfolio) {
                    const localLedgerLen = localPayload.crossHedgingPortfolio.settledLedger?.length || 0;
                    const r2LedgerLen = payload.crossHedgingPortfolio?.settledLedger?.length || 0;
                    const localVipCount = localPayload.crossHedgingPortfolio?.pillar1_De?.vipNumbers?.length || 0;
                    const r2VipCount = payload.crossHedgingPortfolio?.pillar1_De?.vipNumbers?.length || 0;
                    if (!payload.crossHedgingPortfolio || localLedgerLen >= r2LedgerLen || (localVipCount === 17 && r2VipCount !== 17)) {
                        payload.crossHedgingPortfolio = localPayload.crossHedgingPortfolio;
                    }
                }
                if (localPayload?.triCoreDe) {
                    const localTarget = localPayload.triCoreDe.latestRecommendation?.targetDate || '';
                    const r2Target = payload?.triCoreDe?.latestRecommendation?.targetDate || '';
                    if (!payload.triCoreDe || localTarget >= r2Target) {
                        payload.triCoreDe = localPayload.triCoreDe;
                    }
                }
                if (localPayload?.deDropoffMerge) {
                    const localTarget = localPayload.deDropoffMerge.latestRecommendation?.targetDate || '';
                    const r2Target = payload?.deDropoffMerge?.latestRecommendation?.targetDate || '';
                    const localLen = localPayload.deDropoffMerge.settledLedger?.length || 0;
                    const r2Len = payload?.deDropoffMerge?.settledLedger?.length || 0;
                    if (!payload.deDropoffMerge || localLen >= r2Len || localTarget >= r2Target) {
                        payload.deDropoffMerge = localPayload.deDropoffMerge;
                    }
                }
                if (localPayload?.loDropoff27) {
                    const localTarget = localPayload.loDropoff27.latestRecommendation?.targetDate || '';
                    const r2Target = payload?.loDropoff27?.latestRecommendation?.targetDate || '';
                    const localLen = localPayload.loDropoff27.settledLedger?.length || 0;
                    const r2Len = payload?.loDropoff27?.settledLedger?.length || 0;
                    if (!payload.loDropoff27 || localLen >= r2Len || localTarget >= r2Target) {
                        payload.loDropoff27 = localPayload.loDropoff27;
                    }
                }
                if (localPayload?.semanticResonanceSuite) {
                    const localTarget = localPayload.semanticResonanceSuite.latestRecommendation?.targetDate || '';
                    const r2Target = payload?.semanticResonanceSuite?.latestRecommendation?.targetDate || '';
                    if (!payload.semanticResonanceSuite || localTarget >= r2Target) {
                        payload.semanticResonanceSuite = localPayload.semanticResonanceSuite;
                    }
                }

                // Explicit shadow cache file fallback for deDropoffMerge and loDropoff27
                try {
                    const deDropoffShadowFile = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_de_dropoff_merge_shadow.json');
                    if (fs.existsSync(deDropoffShadowFile)) {
                        const shadowDe = JSON.parse(fs.readFileSync(deDropoffShadowFile, 'utf8'));
                        if ((shadowDe?.settledLedger?.length || 0) >= (payload?.deDropoffMerge?.settledLedger?.length || 0)) {
                            payload.deDropoffMerge = shadowDe;
                        }
                    }
                    const loDropoffShadowFile = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_lo_dropoff_27_shadow.json');
                    if (fs.existsSync(loDropoffShadowFile)) {
                        const shadowLo = JSON.parse(fs.readFileSync(loDropoffShadowFile, 'utf8'));
                        if ((shadowLo?.settledLedger?.length || 0) >= (payload?.loDropoff27?.settledLedger?.length || 0)) {
                            payload.loDropoff27 = shadowLo;
                        }
                    }
                    const regFile = path.join(process.cwd(), 'lib', 'data', 'statistics', 'daily_locked_bets_registry.json');
                    if (fs.existsSync(regFile)) {
                        payload.dailyLockedBetsRegistry = JSON.parse(fs.readFileSync(regFile, 'utf8'));
                    }
                } catch (_) {}
            } catch (_) {}
        }

        // Secondary R2 fallback for standalone shadow files if payload ledgers lag behind
        try {
            const latestRawDateStr = String(payload.latestDataDate || '').slice(0, 10);
            const deLastSettled = payload.deDropoffMerge?.settledLedger?.at(-1)?.date || '';
            if (latestRawDateStr && deLastSettled < latestRawDateStr) {
                const r2ShadowDe = await loadJsonWithSupabaseFallback('cached_de_dropoff_merge_shadow.json').catch(() => null);
                if ((r2ShadowDe?.settledLedger?.length || 0) > (payload.deDropoffMerge?.settledLedger?.length || 0)) {
                    payload.deDropoffMerge = r2ShadowDe;
                }
            }
            const loLastSettled = payload.loDropoff27?.settledLedger?.at(-1)?.date || '';
            if (latestRawDateStr && loLastSettled < latestRawDateStr) {
                const r2ShadowLo = await loadJsonWithSupabaseFallback('cached_lo_dropoff_27_shadow.json').catch(() => null);
                if ((r2ShadowLo?.settledLedger?.length || 0) > (payload.loDropoff27?.settledLedger?.length || 0)) {
                    payload.loDropoff27 = r2ShadowLo;
                }
            }
            let localReg = null;
            try {
                const regService = require('@/lib/services/dailyLockedBetsRegistryService');
                localReg = (regService.loadRegistry || regService.getRegistry)();
            } catch (_) {}
            if (localReg && Object.keys(localReg.dates || {}).length > 0) {
                payload.dailyLockedBetsRegistry = localReg;
            } else if (!payload.dailyLockedBetsRegistry) {
                const r2Reg = await loadJsonWithSupabaseFallback('daily_locked_bets_registry.json').catch(() => null);
                if (r2Reg) payload.dailyLockedBetsRegistry = r2Reg;
            }
        } catch (_) {}

        const raw = await getRawData();
        const { isPredictionLockActive } = require('@/lib/utils/predictionLockGuard');
        const nextTargetDate = payload?.streakAwareDeAdvisor?.latestRecommendation?.predictionDate || payload?.pendingPredictionDate;
        const lockStatus = isPredictionLockActive(nextTargetDate, raw);
        if (lockStatus.isLocked) {
            if (payload?.streakAwareDeAdvisor?.latestRecommendation) {
                payload.streakAwareDeAdvisor.latestRecommendation.snapshotLock = lockStatus;
            }
            if (payload?.loQuadHybrid?.latestRecommendation) {
                payload.loQuadHybrid.latestRecommendation.snapshotLock = lockStatus;
            }
            if (payload?.loQuadHybrid?.streakGovernor) {
                payload.loQuadHybrid.streakGovernor.snapshotLock = lockStatus;
            }
            if (payload?.loXien4Synergy?.latestRecommendation) {
                payload.loXien4Synergy.latestRecommendation.snapshotLock = lockStatus;
            }
            if (payload?.lo4EngineFusion?.latestRecommendation) {
                payload.lo4EngineFusion.latestRecommendation.snapshotLock = lockStatus;
            }
            payload.snapshotLock = lockStatus;
        }

        const settled = settleFromRaw(payload, raw);

        // ĐỒNG BỘ VÀ ĐỐI SOÁT SSOT REGISTRY VỚI KẾT QUẢ MỞ THƯỞNG
        if (payload.dailyLockedBetsRegistry && Array.isArray(raw)) {
            const rawMap = new Map();
            raw.forEach(r => {
                const d = normalizeDate(r?.date || r?.ngay);
                if (d) rawMap.set(d, r);
            });
            const { settleDateDirectly } = require('@/lib/services/dailyLockedBetsRegistryService');
            Object.entries(payload.dailyLockedBetsRegistry.dates || {}).forEach(([d, entry]) => {
                if (!entry.isSettled && rawMap.has(d)) {
                    try {
                        const settledEntry = settleDateDirectly(d, rawMap.get(d));
                        if (settledEntry) {
                            payload.dailyLockedBetsRegistry.dates[d] = settledEntry;
                        }
                    } catch (err) {
                        console.error(`[API daily-advisor] Error settling locked bets for ${d}:`, err);
                    }
                }
            });

            // Đồng bộ ngược vào settled ledgers để frontend luôn nhận đủ 100% dữ liệu
            const chLedger = settled.crossHedgingPortfolio?.settledLedger || [];
            const lo7Ledger = settled.lo4EngineFusion?.modes?.top7?.settledLedger || [];
            const lo6Ledger = settled.lo4EngineFusion?.modes?.top6?.settledLedger || [];
            const dmLedger = settled.dualMerge?.settledLedger || [];
            const adLedger = settled.adaptiveDualMerge?.settledLedger || [];
            const tmLedger = settled.tripleMerge?.settledLedger || [];
            const metaLedger = settled.metaLearner?.settledLedger || [];
            const deDropoffLedger = settled.deDropoffMerge?.settledLedger || [];
            const loDropoffLedger = settled.loDropoff27?.settledLedger || [];
            const triCoreLedger = settled.triCoreDe?.settledLedger || [];
            const resSuiteLedger = settled.semanticResonanceSuite?.settledLedger || [];

            const upsertLedgerRow = (ledger, dateKey, row) => {
                const idx = ledger.findIndex(r => normalizeDate(r?.date || r?.predictionDate) === dateKey);
                if (idx >= 0) {
                    ledger[idx] = { ...ledger[idx], ...row };
                } else {
                    ledger.push(row);
                }
            };

            Object.entries(payload.dailyLockedBetsRegistry.dates || {}).forEach(([d, entry]) => {
                if (entry?.isSettled && entry.settlement) {
                    const s = entry.settlement;
                    // Cross Hedging
                    if (s.crossHedgingPortfolio) {
                        upsertLedgerRow(chLedger, d, { ...s.crossHedgingPortfolio, date: d });
                    }
                    // Lô Ghép 4 Top 7
                    if (s.lo4EngineFusion) {
                        upsertLedgerRow(lo7Ledger, d, {
                            date: d,
                            isLive: true,
                            topN: 7,
                            h4: s.lo4EngineFusion.xienHitsCount || 0,
                            countTotal: s.lo4EngineFusion.betNumbers?.length || 15,
                            countOver2: (s.lo4EngineFusion.tierX5?.length || 0) + (s.lo4EngineFusion.tierX4?.length || 0) + (s.lo4EngineFusion.tierX3?.length || 0),
                            tierX5: s.lo4EngineFusion.tierX5 || [],
                            tierX4: s.lo4EngineFusion.tierX4 || [],
                            tierX3: s.lo4EngineFusion.tierX3 || [],
                            tierX1: s.lo4EngineFusion.tierX1 || [],
                            allNumbers: s.lo4EngineFusion.betNumbers?.map(b => b.num) || [],
                            betNumbers: s.lo4EngineFusion.betNumbers || [],
                            dayLotoStakeK: s.lo4EngineFusion.lotoStakeK || 66000,
                            dayLotoPayoutK: s.lo4EngineFusion.lotoPayoutK || 0,
                            dayLotoProfitK: s.lo4EngineFusion.lotoProfitK || 0,
                            dayLotoHits: s.lo4EngineFusion.totalHits || 0,
                            isLotoWin: (s.lo4EngineFusion.lotoProfitK || 0) > 0,
                            xien4StakeK: s.lo4EngineFusion.xienStakeK || 11000,
                            xien4PayoutK: s.lo4EngineFusion.xienPayoutK || 0,
                            dayXien4ProfitK: s.lo4EngineFusion.xienProfitK || -11000,
                            isXien4Win: (s.lo4EngineFusion.xienProfitK || 0) > 0,
                            totalDayProfitK: s.lo4EngineFusion.totalProfitK || 0
                        });
                    }
                    // Lô Ghép 4 Top 6
                    if (s.lo4EngineFusion) {
                        upsertLedgerRow(lo6Ledger, d, {
                            date: d,
                            isLive: true,
                            topN: 6,
                            h4: s.lo4EngineFusion.xienHitsCount || 0,
                            countTotal: s.lo4EngineFusion.betNumbers?.length || 15,
                            countOver2: (s.lo4EngineFusion.tierX5?.length || 0) + (s.lo4EngineFusion.tierX4?.length || 0) + (s.lo4EngineFusion.tierX3?.length || 0),
                            tierX5: s.lo4EngineFusion.tierX5 || [],
                            tierX4: s.lo4EngineFusion.tierX4 || [],
                            tierX3: s.lo4EngineFusion.tierX3 || [],
                            tierX1: s.lo4EngineFusion.tierX1 || [],
                            allNumbers: s.lo4EngineFusion.betNumbers?.map(b => b.num) || [],
                            betNumbers: s.lo4EngineFusion.betNumbers || [],
                            dayLotoStakeK: s.lo4EngineFusion.lotoStakeK || 66000,
                            dayLotoPayoutK: s.lo4EngineFusion.lotoPayoutK || 0,
                            dayLotoProfitK: s.lo4EngineFusion.lotoProfitK || 0,
                            dayLotoHits: s.lo4EngineFusion.totalHits || 0,
                            isLotoWin: (s.lo4EngineFusion.lotoProfitK || 0) > 0,
                            xien4StakeK: s.lo4EngineFusion.xienStakeK || 11000,
                            xien4PayoutK: s.lo4EngineFusion.xienPayoutK || 0,
                            dayXien4ProfitK: s.lo4EngineFusion.xienProfitK || -11000,
                            isXien4Win: (s.lo4EngineFusion.xienProfitK || 0) > 0,
                            totalDayProfitK: s.lo4EngineFusion.totalProfitK || 0
                        });
                    }
                    // Đề Ledgers (Dual Merge, Adaptive, Triple, Meta)
                    if (s.de) {
                        const deRecord = {
                            date: d,
                            predictionDate: d,
                            actual: Number(s.de.actualSpecial),
                            actualSpecial: Number(s.de.actualSpecial),
                            special: Number(s.de.actualSpecial),
                            settled: true,
                            isLocked: true,
                            isHit: Boolean(s.de.isHit),
                            isVipHit: Boolean(s.de.isVipHit),
                            hitType: s.de.isVipHit ? 'win_x3' : (s.de.isHit ? 'win_x1' : 'loss'),
                            numbers: s.de.numbers || [],
                            vipNumbers: s.de.vipNumbers || [],
                            singleNumbers: s.de.singleNumbers || [],
                            intersection: s.de.vipNumbers || [],
                            uniqueSingles: s.de.singleNumbers || [],
                            union: s.de.numbers || [],
                            stakeK: s.de.stakeK || 77000,
                            payoutK: s.de.payoutK || 0,
                            profitK: s.de.profitK != null ? s.de.profitK : -77000,
                            isLiveSnapshot: true,
                            sourceType: 'live-snapshot',
                            m1Label: s.de.methodName || 'Đề Gộp Thực Chiến'
                        };
                        upsertLedgerRow(dmLedger, d, deRecord);
                        upsertLedgerRow(adLedger, d, deRecord);
                        upsertLedgerRow(tmLedger, d, deRecord);
                        upsertLedgerRow(metaLedger, d, deRecord);
                    }
                    // Đề Dropoff
                    if (s.deDropoffMerge) {
                        upsertLedgerRow(deDropoffLedger, d, {
                            date: d,
                            predictionDate: d,
                            actual: Number(s.deDropoffMerge.actualSpecial),
                            actualSpecial: Number(s.deDropoffMerge.actualSpecial),
                            actualStr: String(s.deDropoffMerge.actualSpecial),
                            hit: Boolean(s.deDropoffMerge.isHit40),
                            isHit: Boolean(s.deDropoffMerge.isHit40),
                            isHit40: Boolean(s.deDropoffMerge.isHit40),
                            isHit36: Boolean(s.deDropoffMerge.isHit36),
                            numbers: s.deDropoffMerge.top40 || [],
                            numbers36: s.deDropoffMerge.top36 || [],
                            top40: s.deDropoffMerge.top40 || [],
                            top36: s.deDropoffMerge.top36 || [],
                            stakeK: s.deDropoffMerge.stake40K || 40000,
                            payoutK: s.deDropoffMerge.payout40K || 0,
                            profitK: s.deDropoffMerge.profit40K != null ? s.deDropoffMerge.profit40K : -40000,
                            stake36K: s.deDropoffMerge.stake36K || 36000,
                            payout36K: s.deDropoffMerge.payout36K || 0,
                            profit36K: s.deDropoffMerge.profit36K != null ? s.deDropoffMerge.profit36K : -36000
                        });
                    }
                    // Lô Dropoff 27
                    if (s.loDropoff27) {
                        const numHitsMap = {};
                        (entry.actualResult?.prizes || []).forEach(p => {
                            const ps = String(p).padStart(2, '0');
                            numHitsMap[ps] = (numHitsMap[ps] || 0) + 1;
                        });
                        upsertLedgerRow(loDropoffLedger, d, {
                            date: d,
                            predictionDate: d,
                            numbers: s.loDropoff27.top7 || [],
                            top7: s.loDropoff27.top7 || [],
                            top6: s.loDropoff27.top6 || [],
                            top2: s.loDropoff27.top2 || [],
                            hits: s.loDropoff27.hits7 || 0,
                            hits7: s.loDropoff27.hits7 || 0,
                            hits6: s.loDropoff27.hits6 || 0,
                            hits2: s.loDropoff27.hits2 || 0,
                            numHitsMap,
                            actualPrizes: entry.actualResult?.prizes || [],
                            actualSpecial: entry.actualResult?.special,
                            isHit: (s.loDropoff27.hits7 || 0) > 0,
                            isWin: Boolean(s.loDropoff27.isFlatWin),
                            stakeK: s.loDropoff27.flatStake7K || 15400,
                            payoutK: s.loDropoff27.flatPayout7K || 0,
                            profitK: s.loDropoff27.flatProfit7K != null ? s.loDropoff27.flatProfit7K : -15400,
                            tierStakeK: s.loDropoff27.tierStakeK || 22000,
                            tierPayoutK: s.loDropoff27.tierPayoutK || 0,
                            tierProfitK: s.loDropoff27.tierProfitK != null ? s.loDropoff27.tierProfitK : -22000,
                            isTierWin: Boolean(s.loDropoff27.isTierWin)
                        });
                    }
                    // Tri-Core Đề
                    if (s.triCoreDe) {
                        upsertLedgerRow(triCoreLedger, d, {
                            date: d,
                            predictionDate: d,
                            action: s.triCoreDe.action || 'BET',
                            numbers: s.triCoreDe.numbers || [],
                            actualSpecial: s.triCoreDe.actualSpecial != null ? Number(s.triCoreDe.actualSpecial) : null,
                            actual: s.triCoreDe.actualSpecial != null ? Number(s.triCoreDe.actualSpecial) : null,
                            hit: s.triCoreDe.hit,
                            stakeK: s.triCoreDe.stakeK || 24000,
                            payoutK: s.triCoreDe.payoutK || 0,
                            profitK: s.triCoreDe.profitK != null ? s.triCoreDe.profitK : -24000,
                            isWin: Boolean(s.triCoreDe.isWin)
                        });
                    }
                    // Cộng Hưởng Suite
                    if (s.semanticResonanceSuite) {
                        upsertLedgerRow(resSuiteLedger, d, {
                            date: d,
                            actualSpecial: s.semanticResonanceSuite.actualSpecial,
                            de: s.semanticResonanceSuite.de,
                            lo: s.semanticResonanceSuite.lo,
                            xien5: s.semanticResonanceSuite.xien5,
                            comboFlat: s.semanticResonanceSuite.comboFlat
                        });
                    }
                }
            });
            if (settled.crossHedgingPortfolio) {
                settled.crossHedgingPortfolio.settledLedger = chLedger.sort((a, b) => a.date.localeCompare(b.date));
            }
            if (settled.lo4EngineFusion?.modes?.top7) {
                settled.lo4EngineFusion.modes.top7.settledLedger = lo7Ledger.sort((a, b) => a.date.localeCompare(b.date));
            }
            if (settled.lo4EngineFusion?.modes?.top6) {
                settled.lo4EngineFusion.modes.top6.settledLedger = lo6Ledger.sort((a, b) => a.date.localeCompare(b.date));
            }
            if (settled.dualMerge) {
                settled.dualMerge.settledLedger = dmLedger.sort((a, b) => (a.date || a.predictionDate).localeCompare(b.date || b.predictionDate));
            }
            if (settled.adaptiveDualMerge) {
                settled.adaptiveDualMerge.settledLedger = adLedger.sort((a, b) => (a.date || a.predictionDate).localeCompare(b.date || b.predictionDate));
            }
            if (settled.tripleMerge) {
                settled.tripleMerge.settledLedger = tmLedger.sort((a, b) => (a.date || a.predictionDate).localeCompare(b.date || b.predictionDate));
            }
            if (settled.metaLearner) {
                settled.metaLearner.settledLedger = metaLedger.sort((a, b) => (a.date || a.predictionDate).localeCompare(b.date || b.predictionDate));
            }
            if (settled.deDropoffMerge) {
                settled.deDropoffMerge.settledLedger = deDropoffLedger.sort((a, b) => a.date.localeCompare(b.date));
            }
            if (settled.loDropoff27) {
                settled.loDropoff27.settledLedger = loDropoffLedger.sort((a, b) => a.date.localeCompare(b.date));
            }
            if (settled.triCoreDe) {
                settled.triCoreDe.settledLedger = triCoreLedger.sort((a, b) => a.date.localeCompare(b.date));
            }
            if (settled.semanticResonanceSuite) {
                settled.semanticResonanceSuite.settledLedger = resSuiteLedger.sort((a, b) => a.date.localeCompare(b.date));
            }
        }
        if (!settled.deResearchEnsemble) {
            try {
                const { buildDeResearchEnsembleAdvisor } = require('@/lib/services/deResearchEnsembleAdvisorService');
                settled.deResearchEnsemble = buildDeResearchEnsembleAdvisor(raw, settled);
            } catch (_) {}
        }
        if (!settled.drawPrizesByDate) {
            const drawPrizesByDate = {};
            for (const row of (raw || []).slice(-365)) {
                const d = normalizeDate(row?.date || row?.ngay);
                if (!d) continue;
                const prizes = [
                    row.special, row.prize1,
                    row.prize2_1, row.prize2_2,
                    row.prize3_1, row.prize3_2, row.prize3_3, row.prize3_4, row.prize3_5, row.prize3_6,
                    row.prize4_1, row.prize4_2, row.prize4_3, row.prize4_4,
                    row.prize5_1, row.prize5_2, row.prize5_3, row.prize5_4, row.prize5_5, row.prize5_6,
                    row.prize6_1, row.prize6_2, row.prize6_3,
                    row.prize7_1, row.prize7_2, row.prize7_3, row.prize7_4
                ].filter(v => v != null).map(v => String(Number(v)).padStart(2, '0'));
                drawPrizesByDate[d] = {
                    special: row.special != null ? String(Number(row.special)).padStart(2, '0') : null,
                    prizes
                };
            }
            const regDates = (settled.dailyLockedBetsRegistry || payload.dailyLockedBetsRegistry)?.dates || {};
            Object.entries(regDates).forEach(([d, entry]) => {
                if (entry?.isSettled && entry.actualResult) {
                    drawPrizesByDate[d] = {
                        special: entry.actualResult.special != null ? String(Number(entry.actualResult.special)).padStart(2, '0') : null,
                        prizes: (entry.actualResult.prizes || []).map(p => String(Number(p)).padStart(2, '0'))
                    };
                }
            });
            settled.drawPrizesByDate = drawPrizesByDate;
        }
        if (!settled.mirofishSwarm) {
            try {
                const { buildMiroFishSwarmAdvisor } = require('@/lib/services/mirofishSwarmService');
                settled.mirofishSwarm = buildMiroFishSwarmAdvisor(raw, settled);
            } catch (err) {
                console.error('[API] MiroFish Swarm Build Error:', err);
            }
        }
        return NextResponse.json({
            success: true,
            ...settled,
            dailyLockedBetsRegistry: settled.dailyLockedBetsRegistry || payload.dailyLockedBetsRegistry || null
        }, { headers: NO_STORE_HEADERS });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: `Không tải được cache Gợi ý từ R2: ${error.message}` },
            { status: 503, headers: NO_STORE_HEADERS }
        );
    }
}
