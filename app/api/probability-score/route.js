import { NextResponse } from 'next/server';
import { getRawData, loadJsonWithSupabaseFallback } from '@/lib/data-access';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const HEADERS = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' };
const CACHE_VERSION = 'probability-score-v2';

function isAuthorized(request) {
    const expected = process.env.PREDICTION_API_TOKEN || process.env.EXTERNAL_API_TOKEN || '';
    if (!expected) return true;
    const url = new URL(request.url);
    const provided = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || url.searchParams.get('token') || '';
    return provided === expected || request.cookies.get('xsmb_session')?.value === 'authenticated';
}

function isoDate(value) { return String(value || '').slice(0, 10); }
function special(row) {
    const source = row?.special ?? row?.db ?? row?.giaiDb ?? row?.giai_dac_biet;
    if (source === null || source === undefined || source === '') return null;
    const result = Number(source);
    return Number.isInteger(result) ? result : null;
}

function summarize(records) {
    const currentRecords = records.filter(record => record?.modelVersion === CACHE_VERSION);
    const settled = currentRecords.filter(record => record?.settled);
    const wins = settled.filter(record => record?.hit).length;
    const stakeK = settled.reduce((sum, record) => sum + (record?.topNumbers?.length || 30) * 1000, 0);
    const payoutK = wins * 84 * 1000;
    const profitK = payoutK - stakeK;
    return {
        trackedDays: currentRecords.length,
        settledDays: settled.length,
        pendingDays: currentRecords.length - settled.length,
        wins,
        losses: settled.length - wins,
        hitRate: settled.length ? wins / settled.length : 0,
        stakeK,
        payoutK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        breakEvenHitRate: 30 / 84,
        isAboveBreakEven: settled.length > 0 && wins / settled.length >= 30 / 84,
        legacyRecordsExcluded: records.length - currentRecords.length
    };
}

export async function GET(request) {
    if (!isAuthorized(request)) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: HEADERS });
    try {
        const payload = await loadJsonWithSupabaseFallback('cached_probability_score.json');
        if (!payload || !Array.isArray(payload.records)) throw new Error('Cache Điểm xác suất chưa được sinh');
        const raw = await getRawData();
        const results = new Map(raw.map(row => [isoDate(row?.date || row?.ngay), special(row)]));
        const records = payload.records.map(record => {
            const actual = results.get(isoDate(record?.predictionDate));
            if (record?.settled || actual === null || actual === undefined) return record;
            return { ...record, settled: true, actual, hit: (record.topNumbers || []).some(item => Number(item.number) === actual) };
        });
        return NextResponse.json({ success: true, ...payload, records, summary: summarize(records) }, { headers: HEADERS });
    } catch (error) {
        return NextResponse.json({ success: false, error: `Không tải được Điểm xác suất từ R2: ${error.message}` }, { status: 503, headers: HEADERS });
    }
}
