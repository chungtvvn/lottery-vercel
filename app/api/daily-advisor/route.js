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
    return {
        ...payload,
        records,
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
        const payload = await loadJsonWithSupabaseFallback('cached_daily_method_advisor.json');
        if (!payload || !Array.isArray(payload.records)) {
            throw new Error('Cache gợi ý chưa được sinh');
        }
        // Raw R2 is the source of truth for a draw result. This keeps a just
        // settled day accurate while the scheduled action is still writing its
        // immutable cache snapshot and tomorrow's prediction.
        const raw = await getRawData();
        return NextResponse.json({ success: true, ...settleFromRaw(payload, raw) }, { headers: NO_STORE_HEADERS });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: `Không tải được cache Gợi ý từ R2: ${error.message}` },
            { status: 503, headers: NO_STORE_HEADERS }
        );
    }
}
