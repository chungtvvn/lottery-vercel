import { NextResponse } from 'next/server';
import { getRawData, loadJsonWithSupabaseFallback } from '@/lib/data-access';
import { getR2Json } from '@/lib/r2Store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0'
};

const API_CACHE_TTL_MS = 60 * 1000; // 60 giây cache in-memory trên server
let _apiCache = {
    full: null,
    shadow: null,
    telegram: null,
    timestamp: 0,
    etag: null
};

function getCacheHeaders(etag) {
    return {
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=120',
        'ETag': etag || '"daily_advisor_v1"',
        'Vary': 'Accept-Encoding, Cookie, Authorization, x-api-key'
    };
}

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

async function settleFromRaw(payload, rawRows) {
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
    // R2-only (was a local disk read). historyPayload is currently assigned
    // but never consumed downstream, so a missing key is logged loudly and
    // does not fail the whole advisor response.
    let historyPayload = null;
    try {
        historyPayload = await getR2Json('cached_prediction_history.json', 'statistics');
    } catch (error) {
        console.error(`[daily-advisor] R2 history unavailable (statistics/cached_prediction_history.json): ${error.message}`);
    }

    // SSOT: Khóa bất biến tuyệt đối dữ liệu đã sinh và lưu trong cache/file
    // CẤM TUYỆT ĐỐI tái sinh (re-synthesize/re-train) thuật toán on-the-fly trong GET request
    let dualMerge = payload.dualMerge || null;
    let adaptiveDualMerge = payload.adaptiveDualMerge || null;
    let tripleMerge = payload.tripleMerge || null;
    let metaLearner = payload.metaLearner || null;
    let loDualMerge = payload.loDualMerge || null;
    let loTriHarmonic = payload.loTriHarmonic || null;
    let loQuantumBayesFusion = payload.loQuantumBayesFusion || null;
    let dynamicMetaAdvisor = payload.dynamicMetaAdvisor || null;
    let streakAwareDeAdvisor = payload.streakAwareDeAdvisor || null;
    let loQuadHybrid = payload.loQuadHybrid || null;
    let loXien4Synergy = payload.loXien4Synergy || null;
    let crossHedgingPortfolio = payload.crossHedgingPortfolio || null;
    let triCoreDe = payload.triCoreDe || null;
    let deDropoffMerge = payload.deDropoffMerge || null;
    let loDropoff27 = payload.loDropoff27 || null;
    let semanticResonanceSuite = payload.semanticResonanceSuite || null;

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
        top8ParityXien4: payload.top8ParityXien4 || null,
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
        const url = new URL(request.url);
        const force = url.searchParams.get('force') === '1';
        const isShadowView = url.searchParams.get('view') === 'shadow';
        const isTelegramView = url.searchParams.get('view') === 'telegram';
        const viewKey = isTelegramView ? 'telegram' : (isShadowView ? 'shadow' : 'full');

        // FAST PATH: Phục vụ tức thì từ cache in-memory trên server (< 2ms)
        if (!force && _apiCache[viewKey] && (Date.now() - _apiCache.timestamp < API_CACHE_TTL_MS)) {
            const clientEtag = request.headers.get('if-none-match');
            if (clientEtag && clientEtag === _apiCache.etag) {
                return new NextResponse(null, { status: 304, headers: getCacheHeaders(_apiCache.etag) });
            }
            return NextResponse.json(_apiCache[viewKey], { headers: getCacheHeaders(_apiCache.etag) });
        }

        let payload = null;
        try {
            payload = await loadJsonWithSupabaseFallback('cached_daily_method_advisor.json');
        } catch (_) {}

        // R2-only: the first load above already read R2. No local-file
        // substitute — a missing/invalid cache fails loudly here.
        if (!payload || !Array.isArray(payload.records)) {
            throw new Error('Cache gợi ý chưa được sinh (R2 statistics/cached_daily_method_advisor.json thiếu hoặc không hợp lệ)');
        }

        // Guarantee that dualMerge, tripleMerge, adaptiveDualMerge are populated with complete full-year backtest ledgers
        // Payload was already loaded from R2 above; avoid redundant re-download of 60MB.
        let cachePayload = payload;
        if (cachePayload) {
            try {
                if (cachePayload?.latestDataDate && (!payload.latestDataDate || cachePayload.latestDataDate >= payload.latestDataDate)) {
                    payload.latestDataDate = cachePayload.latestDataDate;
                    if (cachePayload.pendingPredictionDate) {
                        payload.pendingPredictionDate = cachePayload.pendingPredictionDate;
                    }
                }
                if (!payload?.dualMerge) { payload.dualMerge = cachePayload.dualMerge; } else if ((cachePayload?.dualMerge?.settledLedger?.length || 0) > (payload?.dualMerge?.settledLedger?.length || 0)) { console.log('[daily-advisor] registry wins: ignoring longer cache ledger for dualMerge'); }
                if (!payload?.adaptiveDualMerge) { payload.adaptiveDualMerge = cachePayload.adaptiveDualMerge; } else if ((cachePayload?.adaptiveDualMerge?.settledLedger?.length || 0) > (payload?.adaptiveDualMerge?.settledLedger?.length || 0)) { console.log('[daily-advisor] registry wins: ignoring longer cache ledger for adaptiveDualMerge'); }
                if (!payload?.tripleMerge) { payload.tripleMerge = cachePayload.tripleMerge; } else if ((cachePayload?.tripleMerge?.settledLedger?.length || 0) > (payload?.tripleMerge?.settledLedger?.length || 0)) { console.log('[daily-advisor] registry wins: ignoring longer cache ledger for tripleMerge'); }
                if (!payload?.loDualMerge) { payload.loDualMerge = cachePayload.loDualMerge; } else if ((cachePayload?.loDualMerge?.settledLedger?.length || 0) > (payload?.loDualMerge?.settledLedger?.length || 0)) { console.log('[daily-advisor] registry wins: ignoring longer cache ledger for loDualMerge'); }
                if (!payload?.loQuantumBayesFusion) { payload.loQuantumBayesFusion = cachePayload.loQuantumBayesFusion; } else if ((cachePayload?.loQuantumBayesFusion?.settledLedger?.length || 0) > (payload?.loQuantumBayesFusion?.settledLedger?.length || 0)) { console.log('[daily-advisor] registry wins: ignoring longer cache ledger for loQuantumBayesFusion'); }
                if (!payload?.loTriHarmonic) { payload.loTriHarmonic = cachePayload.loTriHarmonic; } else if ((cachePayload?.loTriHarmonic?.settledLedger?.length || 0) > (payload?.loTriHarmonic?.settledLedger?.length || 0)) { console.log('[daily-advisor] registry wins: ignoring longer cache ledger for loTriHarmonic'); }
                // CANONICAL (registry wins): cache only fills a missing
                // dynamicMetaAdvisor; a longer cache copy is logged, not used.
                if (cachePayload?.dynamicMetaAdvisor && !payload?.dynamicMetaAdvisor) {
                    payload.dynamicMetaAdvisor = cachePayload.dynamicMetaAdvisor;
                } else if (cachePayload?.dynamicMetaAdvisor && (cachePayload.dynamicMetaAdvisor.liveDiary?.length || 0) > (payload.dynamicMetaAdvisor.liveDiary?.length || 0)) {
                    console.log('[daily-advisor] registry wins: ignoring longer cache dynamicMetaAdvisor');
                }
                // CANONICAL (registry wins): cache only fills a missing
                // metaLearner; a longer cache copy is logged, not used.
                if (cachePayload?.metaLearner && !payload?.metaLearner) {
                    payload.metaLearner = cachePayload.metaLearner;
                } else if (cachePayload?.metaLearner && (cachePayload.metaLearner.settledLedger?.length || 0) > (payload.metaLearner.settledLedger?.length || 0)) {
                    console.log('[daily-advisor] registry wins: ignoring longer cache metaLearner ledger');
                }
                if (!payload?.streakAwareDeAdvisor && cachePayload?.streakAwareDeAdvisor) {
                    payload.streakAwareDeAdvisor = cachePayload.streakAwareDeAdvisor;
                }
                if (!payload?.deMarkovGapHazard && cachePayload?.deMarkovGapHazard) {
                    payload.deMarkovGapHazard = cachePayload.deMarkovGapHazard;
                }
                if (!payload?.dePositionalGraphFlow && cachePayload?.dePositionalGraphFlow) {
                    payload.dePositionalGraphFlow = cachePayload.dePositionalGraphFlow;
                }
                if (!payload?.loQuadHybrid && cachePayload?.loQuadHybrid) {
                    payload.loQuadHybrid = cachePayload.loQuadHybrid;
                }
                if (!payload?.loPentaMatrix && cachePayload?.loPentaMatrix) {
                    payload.loPentaMatrix = cachePayload.loPentaMatrix;
                }
                if (!payload?.loPositionalBridgeFlow && cachePayload?.loPositionalBridgeFlow) {
                    payload.loPositionalBridgeFlow = cachePayload.loPositionalBridgeFlow;
                }
                if (!payload?.loHawkesClustering && cachePayload?.loHawkesClustering) {
                    payload.loHawkesClustering = cachePayload.loHawkesClustering;
                }
                if (!payload?.loXien4Synergy && cachePayload?.loXien4Synergy) {
                    payload.loXien4Synergy = cachePayload.loXien4Synergy;
                }
                // CANONICAL (registry wins): cache only fills a missing
                // lo4EngineFusion; a longer cache copy is logged, not used.
                if (!payload?.lo4EngineFusion?.modes && !payload?.lo4EngineFusion?.settledLedger) {
                    payload.lo4EngineFusion = cachePayload.lo4EngineFusion;
                } else if ((cachePayload?.lo4EngineFusion?.settledLedger?.length || 0) > (payload?.lo4EngineFusion?.settledLedger?.length || 0)) {
                    console.log('[daily-advisor] registry wins: ignoring longer cache lo4EngineFusion ledger');
                }
                if (!payload?.loTop5ConsensusXien && cachePayload?.loTop5ConsensusXien) {
                    payload.loTop5ConsensusXien = cachePayload.loTop5ConsensusXien;
                }
                if (cachePayload?.crossHedgingPortfolio) {
                    const cacheLedgerLen = cachePayload.crossHedgingPortfolio.settledLedger?.length || 0;
                    const r2LedgerLen = payload.crossHedgingPortfolio?.settledLedger?.length || 0;
                    // CANONICAL (registry wins): cache only fills a missing
                    // crossHedgingPortfolio; a longer cache copy is logged.
                    if (!payload.crossHedgingPortfolio) {
                        payload.crossHedgingPortfolio = cachePayload.crossHedgingPortfolio;
                    } else if (cacheLedgerLen > r2LedgerLen) {
                        console.log('[daily-advisor] registry wins: ignoring longer cache crossHedgingPortfolio ledger');
                    }
                }
                if (cachePayload?.triCoreDe) {
                    const cacheTarget = cachePayload.triCoreDe.latestRecommendation?.targetDate || '';
                    const r2Target = payload?.triCoreDe?.latestRecommendation?.targetDate || '';
                    if (!payload.triCoreDe || cacheTarget >= r2Target) {
                        payload.triCoreDe = cachePayload.triCoreDe;
                    }
                }
                if (cachePayload?.deDropoffMerge) {
                    const cacheTarget = cachePayload.deDropoffMerge.latestRecommendation?.targetDate || '';
                    const r2Target = payload?.deDropoffMerge?.latestRecommendation?.targetDate || '';
                    const cacheLen = cachePayload.deDropoffMerge.settledLedger?.length || 0;
                    const r2Len = payload?.deDropoffMerge?.settledLedger?.length || 0;
                    if (!payload.deDropoffMerge || cacheLen >= r2Len || cacheTarget >= r2Target) {
                        payload.deDropoffMerge = cachePayload.deDropoffMerge;
                    }
                }
                if (cachePayload?.loDropoff27) {
                    const cacheTarget = cachePayload.loDropoff27.latestRecommendation?.targetDate || '';
                    const r2Target = payload?.loDropoff27?.latestRecommendation?.targetDate || '';
                    const cacheLen = cachePayload.loDropoff27.settledLedger?.length || 0;
                    const r2Len = payload?.loDropoff27?.settledLedger?.length || 0;
                    if (!payload.loDropoff27 || cacheLen >= r2Len || cacheTarget >= r2Target) {
                        payload.loDropoff27 = cachePayload.loDropoff27;
                    }
                }
                if (cachePayload?.semanticResonanceSuite) {
                    const cacheTarget = cachePayload.semanticResonanceSuite.latestRecommendation?.targetDate || '';
                    const r2Target = payload?.semanticResonanceSuite?.latestRecommendation?.targetDate || '';
                    if (!payload.semanticResonanceSuite || cacheTarget >= r2Target) {
                        payload.semanticResonanceSuite = cachePayload.semanticResonanceSuite;
                    }
                }

                // Explicit shadow cache (R2) fill-in for deDropoffMerge and loDropoff27
                // CANONICAL (registry wins, same rule as the main merge above):
                // a shadow cache copy only fills a section missing in the
                // payload; a longer shadow copy is logged, never overwrites.
                // A missing R2 shadow key is logged loudly for that section
                // and leaves the payload section untouched.
                // Explicit shadow cache (R2) fill-in for deDropoffMerge and loDropoff27
                // CANONICAL (registry wins, same rule as the main merge above):
                // a shadow cache copy only fills a section missing in the
                // payload; a longer shadow copy is logged, never overwrites.
                // A missing R2 shadow key is logged loudly for that section
                // and leaves the payload section untouched.
                try {
                    const shadowDe = await getR2Json('cached_de_dropoff_merge_shadow.json', 'statistics');
                    if (!payload?.deDropoffMerge) {
                        payload.deDropoffMerge = shadowDe;
                    } else if ((shadowDe?.settledLedger?.length || 0) > (payload.deDropoffMerge.settledLedger?.length || 0)) {
                        console.log('[daily-advisor] registry wins: ignoring longer shadow cache for deDropoffMerge');
                    }
                } catch (error) {
                    console.error(`[daily-advisor] R2 shadow unavailable (statistics/cached_de_dropoff_merge_shadow.json): ${error.message}`);
                }
                try {
                    const shadowLo = await getR2Json('cached_lo_dropoff_27_shadow.json', 'statistics');
                    if (!payload?.loDropoff27) {
                        payload.loDropoff27 = shadowLo;
                    } else if ((shadowLo?.settledLedger?.length || 0) > (payload.loDropoff27.settledLedger?.length || 0)) {
                        console.log('[daily-advisor] registry wins: ignoring longer shadow cache for loDropoff27');
                    }
                } catch (error) {
                    console.error(`[daily-advisor] R2 shadow unavailable (statistics/cached_lo_dropoff_27_shadow.json): ${error.message}`);
                }
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
                localReg = await (regService.loadRegistry || regService.getRegistry)();
            } catch (_) {}
            let r2Reg = null;
            try {
                r2Reg = await loadJsonWithSupabaseFallback('daily_locked_bets_registry.json').catch(() => null);
            } catch (_) {}

            // HỢP NHẤT THÔNG MINH BẢO TOÀN SSOT (PAYLOAD + LOCAL + R2)
            const allDateKeys = new Set([
                ...Object.keys(payload.dailyLockedBetsRegistry?.dates || {}),
                ...Object.keys(localReg?.dates || {}),
                ...Object.keys(r2Reg?.dates || {})
            ]);
            const mergedDates = {};
            for (const d of allDateKeys) {
                const pEntry = payload.dailyLockedBetsRegistry?.dates?.[d];
                const lEntry = localReg?.dates?.[d];
                const rEntry = r2Reg?.dates?.[d];
                const candidates = [lEntry, rEntry, pEntry].filter(Boolean);
                // Ưu tiên bản ghi đã có bets hợp lệ và đã kết toán
                const bestEntry = candidates.find(c => c.isSettled && Object.keys(c.bets || {}).length > 0)
                    || candidates.find(c => Object.keys(c.bets || {}).length > 0)
                    || candidates[0];
                if (bestEntry) {
                    mergedDates[d] = bestEntry;
                }
            }
            if (Object.keys(mergedDates).length > 0) {
                payload.dailyLockedBetsRegistry = {
                    version: '1.0.0',
                    description: 'Merged SSOT Daily Locked Bets Registry',
                    updatedAt: new Date().toISOString(),
                    dates: mergedDates
                };
            }
        } catch (_) {}

        const raw = await getRawData();
        const { isPredictionLockActive } = require('@/lib/utils/predictionLockGuard');
        const nextTargetDate = payload?.streakAwareDeAdvisor?.latestRecommendation?.predictionDate || payload?.pendingPredictionDate;
        const { isPredictionLockActiveAsync } = require('@/lib/utils/predictionLockGuard');
        const lockStatus = await isPredictionLockActiveAsync(nextTargetDate, raw);
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
            if (payload?.loTop5ConsensusXien) {
                payload.loTop5ConsensusXien.snapshotLock = lockStatus;
            }
            payload.snapshotLock = lockStatus;
        }

        // Đóng băng SSOT cho pending prediction nếu có trong dailyLockedBetsRegistry
        if (payload?.loTop5ConsensusXien && nextTargetDate) {
            const pendingReg = payload.dailyLockedBetsRegistry?.dates?.[nextTargetDate];
            if (pendingReg) {
                const lockedTop5 = pendingReg.settlement?.loXien5?.top5 || pendingReg.bets?.loXien5?.top5;
                if (lockedTop5 && lockedTop5.length >= 5) {
                    payload.loTop5ConsensusXien.top5Xien = lockedTop5.slice(0, 5).map(v => String(v).padStart(2, '0'));
                }
                const lockedTop4 = pendingReg.settlement?.lo4EngineFusion?.xienTop4 
                    || pendingReg.bets?.lo4EngineFusion?.xien4?.top4 
                    || pendingReg.bets?.lo4EngineFusion?.xien4?.numbers;
                if (lockedTop4 && lockedTop4.length >= 4) {
                    payload.loTop5ConsensusXien.top4Xien = lockedTop4.slice(0, 4).map(v => String(v).padStart(2, '0'));
                } else if (payload.loTop5ConsensusXien.top5Xien?.length >= 4) {
                    payload.loTop5ConsensusXien.top4Xien = payload.loTop5ConsensusXien.top5Xien.slice(0, 4);
                }
            }
        }

        const settled = await settleFromRaw(payload, raw);

        // ĐỒNG BỘ VÀ ĐỐI SOÁT SSOT REGISTRY VỚI KẾT QUẢ MỞ THƯỞNG
        if (payload.dailyLockedBetsRegistry && Array.isArray(raw)) {
            const rawMap = new Map();
            raw.forEach(r => {
                const d = normalizeDate(r?.date || r?.ngay);
                if (d) rawMap.set(d, r);
            });
            const { settleDateDirectly } = require('@/lib/services/dailyLockedBetsRegistryService');
            for (const [d, entry] of Object.entries(payload.dailyLockedBetsRegistry.dates || {})) {
                if (!entry.isSettled && rawMap.has(d)) {
                    try {
                        const settledEntry = await settleDateDirectly(d, rawMap.get(d));
                        if (settledEntry) {
                            payload.dailyLockedBetsRegistry.dates[d] = settledEntry;
                        }
                    } catch (err) {
                        console.error(`[API daily-advisor] Error settling locked bets for ${d}:`, err);
                    }
                }
            }

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
            const loTop5Ledger = settled.loTop5ConsensusXien?.settledLedger || [];
            const pentaLedger = settled.pentaConsensus?.settledLedger || [];

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
                    // Cross Hedging: SSOT Đảm bảo nhất quán tuyệt đối giữa Đề, Lô và Xiên
                    if (s.crossHedgingPortfolio || (s.de && s.lo4EngineFusion)) {
                        const deProf = s.de?.profitK != null ? s.de.profitK : (s.crossHedgingPortfolio?.deProfitK ?? 0);
                        const loProf = s.lo4EngineFusion?.lotoProfitK != null ? s.lo4EngineFusion.lotoProfitK : (s.crossHedgingPortfolio?.loProfitK ?? 0);
                        const xienProf = s.lo4EngineFusion?.xienProfitK != null ? s.lo4EngineFusion.xienProfitK : (s.crossHedgingPortfolio?.xienProfitK ?? 0);
                        const totProf = deProf + loProf + xienProf;
                        const deStk = s.de?.stakeK || 77000;
                        const loStk = s.lo4EngineFusion?.lotoStakeK || 66000;
                        const xienStk = s.lo4EngineFusion?.xienStakeK || 11000;
                        const totStk = deStk + loStk + xienStk;
                        const dePay = s.de?.payoutK != null ? s.de.payoutK : (deProf + deStk);
                        const loPay = s.lo4EngineFusion?.lotoPayoutK != null ? s.lo4EngineFusion.lotoPayoutK : (loProf + loStk);
                        const xienPay = s.lo4EngineFusion?.xienPayoutK != null ? s.lo4EngineFusion.xienPayoutK : (xienProf + xienStk);
                        const totPay = dePay + loPay + xienPay;

                        upsertLedgerRow(chLedger, d, {
                            ...(s.crossHedgingPortfolio || {}),
                            date: d,
                            deHits: s.de?.isHit ? 1 : 0,
                            isDeHit: Boolean(s.de?.isHit),
                            isVipHit: Boolean(s.de?.isVipHit),
                            dePayoutK: dePay,
                            deStakeK: deStk,
                            deProfitK: deProf,
                            dePnlK: deProf,
                            loHits: s.lo4EngineFusion?.totalHits || 0,
                            loPayoutK: loPay,
                            loStakeK: loStk,
                            loProfitK: loProf,
                            loPnlK: loProf,
                            uniqueTop4Hits: s.lo4EngineFusion?.xienHitsCount || 0,
                            xienPayoutK: xienPay,
                            xienStakeK: xienStk,
                            xienProfitK: xienProf,
                            xienPnlK: xienProf,
                            totalPayoutK: totPay,
                            totalStakeK: totStk,
                            totalProfitK: totProf,
                            isWin: totProf > 0
                        });
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
                            dayXien4ProfitK: s.lo4EngineFusion.xienProfitK != null ? s.lo4EngineFusion.xienProfitK : -11000,
                            isXien4Win: (s.lo4EngineFusion.xienProfitK || 0) > 0,
                            crossX2: s.lo4EngineFusion.crossX2 || null,
                            totalDayProfitK: s.lo4EngineFusion.totalProfitK != null ? s.lo4EngineFusion.totalProfitK : 0
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
                            dayXien4ProfitK: s.lo4EngineFusion.xienProfitK != null ? s.lo4EngineFusion.xienProfitK : -11000,
                            isXien4Win: (s.lo4EngineFusion.xienProfitK || 0) > 0,
                            crossX2: s.lo4EngineFusion.crossX2 || null,
                            totalDayProfitK: s.lo4EngineFusion.totalProfitK != null ? s.lo4EngineFusion.totalProfitK : 0
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
                    // Lô Xiên 5 / Top 5 Consensus
                    if (s.loXien5 || s.lo4EngineFusion?.xienTop4) {
                        const top5 = s.loXien5?.top5 || entry.bets?.loXien5?.top5 || [];
                        const top4 = s.lo4EngineFusion?.xienTop4 || entry.bets?.lo4EngineFusion?.xien4?.top4 || top5.slice(0, 4);
                        const h4 = s.lo4EngineFusion?.xienHitsCount != null ? s.lo4EngineFusion.xienHitsCount : (s.loXien5?.h4 || 0);
                        const h5 = s.loXien5?.h5 != null ? s.loXien5.h5 : 0;
                        const x5StakeK = s.loXien5?.stakeK || 55000;
                        const x5PayoutK = s.loXien5?.payoutK || 0;
                        const x5ProfitK = s.loXien5?.profitK != null ? s.loXien5.profitK : -55000;
                        const q11StakeVIP_K = s.lo4EngineFusion?.xienStakeK || 11000;
                        const q11PayoutVIP_K = s.lo4EngineFusion?.xienPayoutK || 0;
                        const q11ProfitVIP_K = s.lo4EngineFusion?.xienProfitK != null ? s.lo4EngineFusion.xienProfitK : -11000;
                        upsertLedgerRow(loTop5Ledger, d, {
                            date: d,
                            predictionDate: d,
                            top4,
                            top5,
                            h4,
                            h5,
                            isWin: h4 >= 2,
                            q11StakeVIP_K,
                            q11PayoutVIP_K,
                            q11ProfitVIP_K,
                            x5Stake55K: x5StakeK,
                            x5Payout55K: x5PayoutK,
                            x5Profit55K: x5ProfitK,
                            x5StakeK,
                            x5PayoutK,
                            x5ProfitK,
                            isX5Win55: x5ProfitK > 0,
                            isLive: true
                        });
                    }
                    // Phương Pháp Gộp 5 ở Shadow Monitor (pentaConsensus)
                    if (s.pentaConsensus) {
                        upsertLedgerRow(pentaLedger, d, {
                            date: d,
                            predictionDate: d,
                            actualSpecial: s.pentaConsensus.actualSpecial,
                            de: s.pentaConsensus.de,
                            lo: s.pentaConsensus.lo,
                            loCrossX2: s.pentaConsensus.loCrossX2,
                            xien5: s.pentaConsensus.xien5,
                            combo: s.pentaConsensus.combo || {
                                stakeK: (s.pentaConsensus.de?.stakeK || 0) + (s.pentaConsensus.lo?.stakeK || 0) + (s.pentaConsensus.xien5?.stakeK || 0),
                                payoutK: (s.pentaConsensus.de?.payoutK || 0) + (s.pentaConsensus.lo?.payoutK || 0) + (s.pentaConsensus.xien5?.payoutK || 0),
                                profitK: (s.pentaConsensus.de?.profitK || 0) + (s.pentaConsensus.lo?.profitK || 0) + (s.pentaConsensus.xien5?.profitK || 0),
                                isWin: ((s.pentaConsensus.de?.profitK || 0) + (s.pentaConsensus.lo?.profitK || 0) + (s.pentaConsensus.xien5?.profitK || 0)) > 0
                            }
                        });
                    }
                }
            });
            if (settled.crossHedgingPortfolio) {
                chLedger.sort((a, b) => a.date.localeCompare(b.date));
                let runDe = 0, runLo = 0, runXien = 0, runTot = 0;
                chLedger.forEach(row => {
                    runDe += (row.deProfitK || 0);
                    runLo += (row.loProfitK || 0);
                    runXien += (row.xienProfitK || 0);
                    runTot += (row.totalProfitK || 0);
                    row.cumDeProfitK = runDe;
                    row.cumLoProfitK = runLo;
                    row.cumXienProfitK = runXien;
                    row.cumulativeProfitK = runTot;
                });
                settled.crossHedgingPortfolio.settledLedger = chLedger;
            }
            if (settled.loTop5ConsensusXien) {
                settled.loTop5ConsensusXien.settledLedger = loTop5Ledger.sort((a, b) => a.date.localeCompare(b.date));
            }
            if (settled.lo4EngineFusion) {
                settled.lo4EngineFusion.settledLedger = lo7Ledger.sort((a, b) => a.date.localeCompare(b.date));
            }
            if (settled.lo4EngineFusion?.modes?.top7) {
                settled.lo4EngineFusion.modes.top7.settledLedger = lo7Ledger.sort((a, b) => a.date.localeCompare(b.date));
            }
            if (settled.lo4EngineFusion?.modes?.top6) {
                settled.lo4EngineFusion.modes.top6.settledLedger = lo6Ledger.sort((a, b) => a.date.localeCompare(b.date));
            }
            if (settled.pentaConsensus) {
                settled.pentaConsensus.settledLedger = pentaLedger.sort((a, b) => a.date.localeCompare(b.date));
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

        // BẢO VỆ BẤT BIẾN LÔ ĐỘT PHÁ X2 TRÊN API CHO CẢ 2 BÊN (ADVISOR & SHADOW)
        if (settled.lo4EngineFusion?.latestRecommendation && !settled.lo4EngineFusion.latestRecommendation.crossX2) {
            const nextTarget = settled.lo4EngineFusion.latestRecommendation.predictionDate || settled.pendingPredictionDate;
            const regCross = settled.dailyLockedBetsRegistry?.dates?.[nextTarget]?.bets?.lo4EngineFusion?.crossX2;
            if (regCross) {
                settled.lo4EngineFusion.latestRecommendation.crossX2 = regCross;
            } else {
                const pentaRecLo = settled.pentaConsensus?.latestRecommendation?.lo;
                if (pentaRecLo) {
                    const pentaHigh = new Set([
                        ...(pentaRecLo.x5Nums || []),
                        ...(pentaRecLo.x4Nums || []),
                        ...(pentaRecLo.x3Nums || [])
                    ].map(n => String(n).padStart(2, '0')));
                    const t5 = (settled.lo4EngineFusion.latestRecommendation.tierX5 || []).map(n => String(n).padStart(2, '0'));
                    const t4 = (settled.lo4EngineFusion.latestRecommendation.tierX4 || []).map(n => String(n).padStart(2, '0'));
                    const t3 = (settled.lo4EngineFusion.latestRecommendation.tierX3 || []).map(n => String(n).padStart(2, '0'));
                    const t1 = (settled.lo4EngineFusion.latestRecommendation.tierX1 || []).map(n => String(n).padStart(2, '0'));
                    const promoted = t1.filter(n => pentaHigh.has(n));
                    const rem = t1.filter(n => !pentaHigh.has(n));
                    settled.lo4EngineFusion.latestRecommendation.crossX2 = {
                        tierX5: t5,
                        tierX4: t4,
                        tierX3: t3,
                        tierX2: promoted,
                        tierX1: rem,
                        stakeKX2: (t5.length * 5 + t4.length * 4 + t3.length * 3 + promoted.length * 2 + rem.length * 1) * 2200,
                        promotedRationale: promoted.length > 0
                            ? `Số [${promoted.join(', ')}] xuất hiện ở nhóm đồng thuận cao (>= X3) bên Shadow Monitor -> Nâng lên Tier X2 (cược 4.4M/số, ăn 16M/nháy).`
                            : 'Không có số nào cần nâng hạng hôm nay.'
                    };
                }
            }
        }
        if (settled.pentaConsensus?.latestRecommendation?.lo && !settled.pentaConsensus.latestRecommendation.loCrossX2) {
            const nextTarget = settled.pentaConsensus.latestRecommendation.date || settled.pendingPredictionDate;
            const regCross = settled.dailyLockedBetsRegistry?.dates?.[nextTarget]?.bets?.pentaConsensus?.loCrossX2;
            if (regCross) {
                settled.pentaConsensus.latestRecommendation.loCrossX2 = regCross;
            } else {
                const lo4Rec = settled.lo4EngineFusion?.latestRecommendation;
                if (lo4Rec) {
                    const lo4High = new Set([
                        ...(lo4Rec.tierX5 || []),
                        ...(lo4Rec.tierX4 || []),
                        ...(lo4Rec.tierX3 || [])
                    ].map(n => String(n).padStart(2, '0')));
                    const x1 = (settled.pentaConsensus.latestRecommendation.lo.x1Nums || []).map(n => String(n).padStart(2, '0'));
                    const promoted = x1.filter(n => lo4High.has(n));
                    const rem = x1.filter(n => !lo4High.has(n));
                    const allLo = (settled.pentaConsensus.latestRecommendation.lo.numbers || []).map(n => String(n).padStart(2, '0'));
                    const multMap = { ...(settled.pentaConsensus.latestRecommendation.lo.multiplierMap || {}) };
                    promoted.forEach(n => { multMap[n] = 2; });
                    settled.pentaConsensus.latestRecommendation.loCrossX2 = {
                        numbers: allLo,
                        x5Nums: settled.pentaConsensus.latestRecommendation.lo.x5Nums || [],
                        x4Nums: settled.pentaConsensus.latestRecommendation.lo.x4Nums || [],
                        x3Nums: settled.pentaConsensus.latestRecommendation.lo.x3Nums || [],
                        x2Nums: promoted,
                        x1Nums: rem,
                        multiplierMap: multMap,
                        stakeK: ((settled.pentaConsensus.latestRecommendation.lo.x5Nums || []).length * 5 + (settled.pentaConsensus.latestRecommendation.lo.x4Nums || []).length * 4 + (settled.pentaConsensus.latestRecommendation.lo.x3Nums || []).length * 3 + promoted.length * 2 + rem.length * 1) * 2200
                    };
                }
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
        // 1. Shadow View
        const shadowKeys = [
            'version', 'generatedAt', 'latestDataDate', 'pendingPredictionDate',
            'snapshotLock', 'targetDate', 'dailyLockedBetsRegistry', 'deDropoffMerge',
            'loDropoff27', 'triCoreDe', 'semanticResonanceSuite', 'lo4EngineFusion',
            'loTop5ConsensusXien', 'loQuadHybrid', 'loTriHarmonic', 'pentaConsensus',
            'top8ParityXien4', 'crossHedgingPortfolio', 'mirofishSwarm',
            'autoBestSelection', 'drawPrizesByDate'
        ];
        const shadowSettled = {
            success: true,
            dailyLockedBetsRegistry: settled.dailyLockedBetsRegistry || payload.dailyLockedBetsRegistry || null
        };
        for (const k of shadowKeys) {
            if (settled[k] !== undefined) shadowSettled[k] = settled[k];
        }
        if (settled.records && Array.isArray(settled.records)) {
            shadowSettled.records = settled.records.slice(-5);
        }

        // 2. Telegram View (siêu gọn ~250KB thay vì 25MB, tối ưu hóa cho Bot Telegram)
        const telegramSettled = {
            success: true,
            version: settled.version,
            generatedAt: settled.generatedAt,
            latestDataDate: settled.latestDataDate,
            pendingPredictionDate: settled.pendingPredictionDate,
            snapshotLock: settled.snapshotLock,
            dailyLockedBetsRegistry: settled.dailyLockedBetsRegistry || payload.dailyLockedBetsRegistry || null,
            crossHedgingPortfolio: settled.crossHedgingPortfolio ? {
                latestRecommendation: settled.crossHedgingPortfolio.latestRecommendation,
                settledLedger: (settled.crossHedgingPortfolio.settledLedger || []).slice(-45)
            } : null,
            streakAwareDeAdvisor: settled.streakAwareDeAdvisor ? {
                latestRecommendation: settled.streakAwareDeAdvisor.latestRecommendation
            } : null,
            lo4EngineFusion: settled.lo4EngineFusion ? {
                latestRecommendation: settled.lo4EngineFusion.latestRecommendation
            } : null,
            pentaConsensus: settled.pentaConsensus ? {
                latestRecommendation: settled.pentaConsensus.latestRecommendation
            } : null,
            top8ParityXien4: settled.top8ParityXien4 ? {
                latestRecommendation: settled.top8ParityXien4.latestRecommendation
            } : null,
            drawPrizesByDate: settled.drawPrizesByDate || null
        };

        // 3. Full View (giữ nguyên đầy đủ phân tích, trim records xuống 10 ngày để giảm dung lượng mạng)
        const fullSettled = {
            success: true,
            ...settled,
            dailyLockedBetsRegistry: settled.dailyLockedBetsRegistry || payload.dailyLockedBetsRegistry || null
        };
        if (fullSettled.records && Array.isArray(fullSettled.records)) {
            fullSettled.records = fullSettled.records.slice(-10);
        }

        // Cập nhật in-memory cache cho tất cả các view
        const currentEtag = `"adv_${settled.latestDataDate || ''}_${settled.dailyLockedBetsRegistry?.updatedAt || Date.now()}"`;
        _apiCache = {
            full: fullSettled,
            shadow: shadowSettled,
            telegram: telegramSettled,
            timestamp: Date.now(),
            etag: currentEtag
        };

        const result = _apiCache[viewKey];
        return NextResponse.json(result, { headers: getCacheHeaders(currentEtag) });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: `Không tải được cache Gợi ý từ R2: ${error.message}` },
            { status: 503, headers: NO_STORE_HEADERS }
        );
    }
}
