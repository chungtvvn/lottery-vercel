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
    const expected = process.env.PREDICTION_API_TOKEN || process.env.EXTERNAL_API_TOKEN || '';
    if (!expected) return true;
    const url = new URL(request.url);
    const provided = request.headers.get('x-api-key')
        || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
        || url.searchParams.get('token')
        || '';
    return provided === expected || request.cookies.get('xsmb_session')?.value === 'authenticated';
}

function normalizeDate(value) {
    return String(value || '').slice(0, 10);
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
        return {
            days: settled.length,
            wins,
            losses,
            hitRate,
            stakeK,
            profitK,
            roi: stakeK ? profitK / stakeK : 0,
            breakEvenHitRate,
            breakEvenWins: Math.ceil(settled.length * breakEvenHitRate),
            isAboveBreakEven: settled.length > 0 && hitRate >= breakEvenHitRate,
            marginToBreakEven: hitRate - breakEvenHitRate
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
        return {
            candidateDays: candidateRows.length,
            issuedDays: issuedRows.length,
            abstainedDays: candidateRows.length - issuedRows.length,
            coverage: candidateRows.length ? issuedRows.length / candidateRows.length : 0,
            days: issuedRows.length,
            wins,
            losses,
            hitRate,
            averageBetCount,
            stakeK,
            profitK,
            roi: stakeK ? profitK / stakeK : 0,
            longestLoss,
            breakEvenHitRate,
            breakEvenWins: Math.ceil(issuedRows.length * breakEvenHitRate),
            isAboveBreakEven: issuedRows.length > 0 && hitRate >= breakEvenHitRate,
            marginToBreakEven: hitRate - breakEvenHitRate
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

    let dualMerge = payload.dualMerge;
    if (!dualMerge || !Array.isArray(dualMerge.settledLedger) || dualMerge.settledLedger.length === 0) {
        const dualMergeService = require('@/lib/services/dualMergeAdvisorService');
        dualMerge = dualMergeService.buildDualMergeAdvisor(historyPayload, rawRows, { existingAdvisorRecords: payload.records, existingDualMerge: payload.dualMerge });
    }

    let adaptiveDualMerge = payload.adaptiveDualMerge;
    if (!adaptiveDualMerge || !Array.isArray(adaptiveDualMerge.settledLedger) || adaptiveDualMerge.settledLedger.length === 0 || !adaptiveDualMerge.latestRecommendation?.overlapCount) {
        const { buildAdaptiveDualMergeAdvisor } = require('@/lib/services/adaptiveDualMergeAdvisorService');
        adaptiveDualMerge = buildAdaptiveDualMergeAdvisor(historyPayload, rawRows, { existingAdvisorRecords: payload.records, existingAdaptiveDualMerge: payload.adaptiveDualMerge });
    }

    let tripleMerge = payload.tripleMerge;
    if (!tripleMerge || !Array.isArray(tripleMerge.settledLedger) || tripleMerge.settledLedger.length === 0 || !tripleMerge.latestRecommendation?.tierX3?.length) {
        const { buildTripleMergeAdvisor } = require('@/lib/services/tripleMergeAdvisorService');
        tripleMerge = buildTripleMergeAdvisor(historyPayload, rawRows, { existingAdvisorRecords: payload.records, existingTripleMerge: payload.tripleMerge });
    }

    let loDualMerge = payload.loDualMerge;
    if (!loDualMerge || !Array.isArray(loDualMerge.settledLedger) || loDualMerge.settledLedger.length === 0) {
        const { buildLoDualMergeAdvisor } = require('@/lib/services/loDualMergeAdvisorService');
        loDualMerge = buildLoDualMergeAdvisor(dualMerge, rawRows, tripleMerge);
    }

    let loTriHarmonic = payload.loTriHarmonic;
    if (!loTriHarmonic || !Array.isArray(loTriHarmonic.settledLedger) || loTriHarmonic.settledLedger.length === 0) {
        const { buildLoTriHarmonicAdvisor } = require('@/lib/services/loDualMergeAdvisorService');
        loTriHarmonic = buildLoTriHarmonicAdvisor(dualMerge, rawRows, tripleMerge);
    }

    let loQuantumBayesFusion = payload.loQuantumBayesFusion;
    if (!loQuantumBayesFusion || !Array.isArray(loQuantumBayesFusion.settledLedger) || loQuantumBayesFusion.settledLedger.length === 0) {
        const { buildLoQuantumBayesFusionAdvisor } = require('@/lib/services/loDualMergeAdvisorService');
        loQuantumBayesFusion = buildLoQuantumBayesFusionAdvisor(dualMerge, rawRows, tripleMerge);
    }

    return {
        ...payload,
        records,
        dualMerge,
        tripleMerge,
        adaptiveDualMerge,
        loDualMerge,
        loTriHarmonic,
        loQuantumBayesFusion,
        latestDataDate: rawRows?.at(-1)?.date || payload.latestDataDate,
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
                if (!payload.dualMerge || !Array.isArray(payload.dualMerge.settledLedger) || payload.dualMerge.settledLedger.length < 200) {
                    if (localPayload?.dualMerge?.settledLedger?.length > (payload.dualMerge?.settledLedger?.length || 0)) {
                        payload.dualMerge = localPayload.dualMerge;
                    }
                }
                if (!payload.adaptiveDualMerge || !Array.isArray(payload.adaptiveDualMerge.settledLedger) || payload.adaptiveDualMerge.settledLedger.length < 200 || !payload.adaptiveDualMerge.latestRecommendation?.overlapCount) {
                    if (localPayload?.adaptiveDualMerge) {
                        payload.adaptiveDualMerge = localPayload.adaptiveDualMerge;
                    }
                }
                if (!payload.tripleMerge || !Array.isArray(payload.tripleMerge.settledLedger) || payload.tripleMerge.settledLedger.length < 200 || !payload.tripleMerge.latestRecommendation?.tierX3?.length) {
                    if (localPayload?.tripleMerge) {
                        payload.tripleMerge = localPayload.tripleMerge;
                    }
                }
                if (!payload.loQuantumBayesFusion || !Array.isArray(payload.loQuantumBayesFusion.settledLedger) || payload.loQuantumBayesFusion.settledLedger.length < 200) {
                    if (localPayload?.loQuantumBayesFusion) {
                        payload.loQuantumBayesFusion = localPayload.loQuantumBayesFusion;
                    }
                }
                if (!payload.loTriHarmonic || !Array.isArray(payload.loTriHarmonic.settledLedger) || payload.loTriHarmonic.settledLedger.length < 200) {
                    if (localPayload?.loTriHarmonic) {
                        payload.loTriHarmonic = localPayload.loTriHarmonic;
                    }
                }
            } catch (_) {}
        }

        const raw = await getRawData();
        return NextResponse.json({ success: true, ...settleFromRaw(payload, raw) }, { headers: NO_STORE_HEADERS });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: `Không tải được cache Gợi ý từ R2: ${error.message}` },
            { status: 503, headers: NO_STORE_HEADERS }
        );
    }
}
