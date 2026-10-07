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
        loQuantumBayesFusion = buildLoQuantumBayesFusionAdvisor(rawRows);
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
            loQuadHybrid = buildLoQuadHybridAdvisor(loQuantumBayesFusion, loDualMerge, rawRows);
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
                crossHedgingPortfolio = {
                    ...pendingDecision,
                    latestRecommendation: pendingDecision,
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
        } else {
            // Settle pending recommendation on-the-fly if raw results are available for targetDate
            const targetDate = normalizeDate(crossHedgingPortfolio.targetDate || crossHedgingPortfolio.latestRecommendation?.targetDate);
            const actualRow = targetDate ? (rawRows || []).find(r => normalizeDate(r?.date || r?.ngay) === targetDate) : null;
            if (actualRow && (actualRow.special != null || actualRow.prize1 != null)) {
                try {
                    const decision = crossHedgingPortfolio.latestRecommendation || crossHedgingPortfolio;
                    const settled = crossHedgingService.settleCrossAssetPortfolio(decision, actualRow);
                    crossHedgingPortfolio = {
                        ...crossHedgingPortfolio,
                        lastSettled: settled
                    };
                    const existsInLedger = (crossHedgingPortfolio.settledLedger || []).some(r => normalizeDate(r?.date) === targetDate);
                    if (!existsInLedger && Array.isArray(crossHedgingPortfolio.settledLedger)) {
                        crossHedgingPortfolio.settledLedger = [...crossHedgingPortfolio.settledLedger, settled];
                    }
                } catch (_) {}
            }
        }
    }

    let triCoreDe = payload.triCoreDe || null;
    try {
        const { buildTriCoreDeAdvisor } = require('@/lib/services/triCoreDeAdvisorService');
        triCoreDe = buildTriCoreDeAdvisor(rawRows, payload);
    } catch (err) {
        console.error('[API daily-advisor] Error building triCoreDe:', err);
    }

    let deDropoffMerge = payload.deDropoffMerge || null;
    try {
        const { buildDeDropoffMergeAdvisor } = require('@/lib/services/deDropoffMergeAdvisorService');
        deDropoffMerge = buildDeDropoffMergeAdvisor(rawRows, payload);
    } catch (err) {
        console.error('[API daily-advisor] Error building deDropoffMerge:', err);
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
            } catch (_) {}
        }

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
            settled.drawPrizesByDate = drawPrizesByDate;
        }
        return NextResponse.json({ success: true, ...settled }, { headers: NO_STORE_HEADERS });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: `Không tải được cache Gợi ý từ R2: ${error.message}` },
            { status: 503, headers: NO_STORE_HEADERS }
        );
    }
}
