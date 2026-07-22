import { NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function hasRecordStatEntry(stat) {
    if (!stat || typeof stat !== 'object') return false;
    if (Array.isArray(stat.longest) && stat.longest.length > 0) return true;
    return Array.isArray(stat.secondLongest) && stat.secondLongest.length > 0;
}

const LEGACY_NO_RECORD_BLOCK_KEYS = [
    'dau_5:block2x1SoLe',
    'dau_5:block2x2SoLe',
    'dau_5:block3x2SoLe',
    'dau_5:block3x3SoLe',
    'dau_5:block4x2SoLe',
    'dau_5:block4x3SoLe'
];

function getAnnual20Window(rawRows = []) {
    const latestYear = rawRows.reduce((latest, row) => {
        const year = Number(String(row?.date || '').match(/(\d{4})/)?.[1]);
        return Number.isFinite(year) ? Math.max(latest, year) : latest;
    }, 0);
    const endYear = Math.max(2006, latestYear - 1);
    return {
        startYear: endYear - 19,
        endYear
    };
}

async function getStatsForKeys(keys, scope) {
    if (scope === 'annual20') {
        return getAnnualRecordSnapshot(keys);
    }

    const { getPatternStatsByKeysFromDb } = require('@/lib/data-access');
    const stats = await getPatternStatsByKeysFromDb(keys);
    const statisticsService = require('../../../../lib/services/statisticsService');
    return statisticsService.rehydrateCurrentStreaks(stats);
}

function makeAnnualRecordStreak(length) {
    if (!Number.isFinite(length) || length < 1) return [];
    // Baseline Mốc 20 năm deliberately stores aggregates only.  Mark these
    // entries so the UI does not pretend that it has per-occurrence dates.
    return [{
        length,
        annualBaseline: true,
        dates: [],
        values: []
    }];
}

function makeAnnualGapStats(counts) {
    return Object.fromEntries(Object.entries(counts || {})
        .filter(([length, count]) => Number(length) > 0 && Number(count) > 0)
        .map(([length, count]) => [String(length), {
            count: Number(count),
            pastCount: Number(count)
        }]));
}

async function getAnnualRecordSnapshot(keys, requestedYear) {
    // Rebuilding detailed record statistics loads every pattern/stat shard and
    // regularly exceeds Vercel's function budget.  The annual baseline is
    // generated once, stored in R2, and is the canonical data for this scope.
    const predictionYear = Math.max(2006, Number(requestedYear) || new Date().getFullYear());
    const { loadJsonWithSupabaseFallback } = require('@/lib/data-access');
    const baselinePayload = await loadJsonWithSupabaseFallback(`cached_milestone20y_baseline_${predictionYear}.json`);
    const baselineByKey = new Map((baselinePayload?.entries || [])
        .filter(entry => entry && entry.key)
        .map(entry => [entry.key, entry]));

    if (baselineByKey.size === 0) {
        throw new Error(`Không có baseline Mốc 20 năm cho năm ${predictionYear}.`);
    }

    const result = {};
    for (const key of keys) {
        const entry = baselineByKey.get(key);
        if (!entry) continue;

        const exactCounts = entry.exactCounts || {};
        const cumulative = entry.cumulative || {};
        const recordLength = Number(entry.recordLen) || 0;
        const secondLength = Object.keys(exactCounts)
            .map(Number)
            .filter(length => Number.isFinite(length) && length > 0 && length < recordLength && Number(exactCounts[length]) > 0)
            .reduce((largest, length) => Math.max(largest, length), 0);

        result[key] = {
            // The browser already owns the curated label from STATS_OPTIONS.
            // Leaving this empty prevents an internal key from becoming the
            // visible record title for generated pattern families.
            description: '',
            longest: makeAnnualRecordStreak(recordLength),
            secondLongest: makeAnnualRecordStreak(secondLength),
            averageInterval: null,
            daysSinceLast: null,
            gapStats: makeAnnualGapStats(cumulative),
            exactGapStats: makeAnnualGapStats(exactCounts),
            annualBaseline: true,
            annualSummary: {
                sample: Number(entry.sample) || 0,
                recordLength,
                actualYears: Number(entry.actualYears || baselinePayload?.historyYears) || 20
            }
        };
    }

    const startIso = baselinePayload?.startIso || `${predictionYear - 20}-01-01`;
    const cutoffIso = baselinePayload?.cutoffIso || `${predictionYear - 1}-12-31`;
    result._scope = {
        id: 'annual20',
        startDate: startIso.split('-').reverse().join('/'),
        endDate: cutoffIso.split('-').reverse().join('/'),
        totalYears: Number(baselinePayload?.historyYears) || 20,
        predictionYear
    };
    return result;
}

async function getAnnualFrequencySnapshot(candidates, requestedYear) {
    // The annual baseline is generated once and published to R2.  Loading it
    // avoids rebuilding all 60k pattern statistics inside a Vercel request.
    const predictionYear = Math.max(2006, Number(requestedYear) || new Date().getFullYear());
    const { loadJsonWithSupabaseFallback } = require('@/lib/data-access');
    const baselinePayload = await loadJsonWithSupabaseFallback(`cached_milestone20y_baseline_${predictionYear}.json`);
    const baselineByKey = new Map((baselinePayload?.entries || [])
        .filter(entry => entry && entry.key)
        .map(entry => [entry.key, entry]));
    if (baselineByKey.size === 0) {
        throw new Error(`Không có baseline Mốc 20 năm cho năm ${predictionYear}.`);
    }

    const frequencies = {};
    for (const candidate of candidates) {
        const currentLength = Number(candidate.currentLength);
        const targetLength = Number(candidate.targetLength);
        const sampleLength = Number(candidate.sampleLength);
        if (!candidate.id || !candidate.key || !Number.isFinite(currentLength) || !Number.isFinite(targetLength)) continue;
        const cumulative = baselineByKey.get(candidate.key)?.cumulative || {};
        frequencies[candidate.id] = {
            currentCount: Number(cumulative[currentLength] || 0),
            targetCount: Number(cumulative[targetLength] || 0),
            frequencyCount: Number(cumulative[Number.isFinite(sampleLength) ? sampleLength : currentLength] || 0)
        };
    }

    const startIso = baselinePayload?.startIso || `${predictionYear - 20}-01-01`;
    const cutoffIso = baselinePayload?.cutoffIso || `${predictionYear - 1}-12-31`;
    return {
        frequencies,
        _scope: {
            id: 'annual20',
            startDate: startIso.split('-').reverse().join('/'),
            endDate: cutoffIso.split('-').reverse().join('/'),
            totalYears: Number(baselinePayload?.historyYears) || 20,
            predictionYear
        }
    };
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const metaOnly = searchParams.get('metaOnly') === 'true';
        const keysOnly = searchParams.get('keysOnly') === 'true';
        const keysStr = searchParams.get('keys');
        const scope = searchParams.get('scope') === 'annual20' ? 'annual20' : 'history';
        const activeOnly = searchParams.get('activeOnly') === 'true';

        const { cachedResponse } = require('@/lib/cache-headers');
        const lotteryService = require('../../../../lib/services/lotteryService');

        // Chỉ cần rawData để hydrate current streaks; quick_stats lấy từ Supabase cache/DB.
        await lotteryService.loadRawData();

        if (metaOnly) {
            const totalYears = lotteryService.getTotalYears();
            return cachedResponse({ _meta: { totalYears } }, 'NO_CACHE');
        }

        const { getQuickStatsFromCache, getPatternStatsByKeysFromDb, getQuickStatsKeysFromCache } = require('@/lib/data-access');

        if (scope === 'annual20' && activeOnly) {
            await lotteryService.loadAll();
            const { getQuickStatsHistoryFromCache } = require('@/lib/data-access');
            const history = await getQuickStatsHistoryFromCache();
            const latest = Array.isArray(history)
                ? history.reduce((best, item) => String(item?.date || '') > String(best?.date || '') ? item : best, null)
                : null;
            const keys = [...new Set((latest?.streaks || []).map(item => item?.key).filter(Boolean))];
            const historicalExclusionService = require('../../../../lib/services/historicalExclusionService');
            const rawRows = lotteryService.getRawData() || [];
            const latestYear = rawRows.reduce((latestYearValue, row) => {
                const year = Number(String(row?.date || '').match(/(\d{4})/)?.[1]);
                return Number.isFinite(year) ? Math.max(latestYearValue, year) : latestYearValue;
            }, 0);
            const endYear = Math.max(2006, latestYear - 1);
            const startYear = endYear - 19;
            const stats = historicalExclusionService.getRecordStatsForKeysAtDate(keys, {
                fromDate: `01/01/${startYear}`,
                untilDate: `31/12/${endYear}`,
                totalYears: 20
            });
            return cachedResponse({
                stats,
                _scope: { id: 'annual20', startDate: `01/01/${startYear}`, endDate: `31/12/${endYear}`, totalYears: 20 }
            }, 'NO_CACHE');
        }

        if (keysOnly) {
            const recordsOnly = searchParams.get('recordsOnly') === 'true';
            if (recordsOnly) {
                const cachedKeys = await getQuickStatsKeysFromCache().catch(() => null);
                if (Array.isArray(cachedKeys) && !LEGACY_NO_RECORD_BLOCK_KEYS.some(key => cachedKeys.includes(key))) {
                    return cachedResponse({ keys: cachedKeys }, 'DAILY');
                }

                const quickStats = await getQuickStatsFromCache();
                const keys = Object.keys(quickStats || {})
                    .filter(key => key !== '_meta' && hasRecordStatEntry(quickStats[key]))
                    .sort();
                return cachedResponse({ keys }, 'DAILY');
            }
            const keys = await getQuickStatsKeysFromCache();
            return cachedResponse({ keys }, 'DAILY');
        }

        if (keysStr) {
            const keys = keysStr.split(',').filter(Boolean);
            return cachedResponse(await getStatsForKeys(keys, scope), 'NO_CACHE');
        }

        // Try cache first
        const cached = await getQuickStatsFromCache();
        if (cached) {
            // Re-hydrate current streaks on-the-fly để đảm bảo fullSequence luôn có
            const statisticsService = require('../../../../lib/services/statisticsService');
            const hydrated = statisticsService.rehydrateCurrentStreaks(cached);
            return cachedResponse(hydrated, 'NO_CACHE');
        }

        // If no cache, compute on the fly
        console.log('[quick-stats] Cache miss, computing on-the-fly...');
        
        const historicalExclusionService = require('../../../../lib/services/historicalExclusionService');
        if (historicalExclusionService.clearCache) historicalExclusionService.clearCache();
        
        const statisticsService = require('../../../../lib/services/statisticsService');
        if (statisticsService.clearCache) statisticsService.clearCache();
        if (lotteryService.clearCache) lotteryService.clearCache();
        
        await lotteryService.loadRawData();
        const quickStats = await statisticsService.getQuickStats();
        
        return cachedResponse(quickStats, 'NO_CACHE');
    } catch (error) {
        console.error('Error in quick-stats:', error);
        const { errorResponse } = require('@/lib/cache-headers');
        return errorResponse('Lỗi server: ' + error.message);
    }
}

// Record pages can contain very long generated pattern keys.  Use a request
// body rather than a query string so the selected 50 records are never lost
// to a proxy/URL length limit.
export async function POST(request) {
    try {
        const body = await request.json();
        if (body?.mode === 'annual-frequency-snapshot') {
            const candidates = Array.isArray(body?.candidates)
                ? body.candidates.filter(candidate => candidate && typeof candidate.id === 'string' && typeof candidate.key === 'string').slice(0, 5000)
                : [];
            if (candidates.length === 0) {
                return NextResponse.json({ error: 'Danh sách chuỗi không hợp lệ.' }, { status: 400 });
            }
            const { cachedResponse } = require('@/lib/cache-headers');
            return cachedResponse(await getAnnualFrequencySnapshot(candidates, body?.year), 'NO_CACHE');
        }
        const keys = Array.isArray(body?.keys)
            ? [...new Set(body.keys.filter(key => typeof key === 'string' && key.length > 0))]
            : [];
        if (keys.length === 0 || keys.length > 100) {
            return NextResponse.json({ error: 'Danh sách chỉ số không hợp lệ.' }, { status: 400 });
        }
        const scope = body?.scope === 'annual20' ? 'annual20' : 'history';
        const { cachedResponse } = require('@/lib/cache-headers');
        return cachedResponse(await getStatsForKeys(keys, scope), 'NO_CACHE');
    } catch (error) {
        console.error('Error in quick-stats POST:', error);
        return NextResponse.json({ error: 'Lỗi server: ' + error.message }, { status: 500 });
    }
}
