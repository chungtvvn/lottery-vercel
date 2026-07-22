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
    const lotteryService = require('../../../../lib/services/lotteryService');
    await lotteryService.loadRawData();

    if (scope === 'annual20') {
        await lotteryService.loadAll();
        const historicalExclusionService = require('../../../../lib/services/historicalExclusionService');
        const { startYear, endYear } = getAnnual20Window(lotteryService.getRawData() || []);
        const stats = historicalExclusionService.getRecordStatsForKeysAtDate(keys, {
            fromDate: `01/01/${startYear}`,
            untilDate: `31/12/${endYear}`,
            totalYears: 20
        });
        return {
            ...stats,
            _scope: {
                id: 'annual20',
                startDate: `01/01/${startYear}`,
                endDate: `31/12/${endYear}`,
                totalYears: 20
            }
        };
    }

    const { getPatternStatsByKeysFromDb } = require('@/lib/data-access');
    const stats = await getPatternStatsByKeysFromDb(keys);
    const statisticsService = require('../../../../lib/services/statisticsService');
    return statisticsService.rehydrateCurrentStreaks(stats);
}

async function getAnnualFrequencySnapshot(candidates) {
    const lotteryService = require('../../../../lib/services/lotteryService');
    await lotteryService.loadAll();
    const { startYear, endYear } = getAnnual20Window(lotteryService.getRawData() || []);
    const uniqueKeys = [...new Set(candidates.map(candidate => candidate.key).filter(Boolean))];
    const historicalExclusionService = require('../../../../lib/services/historicalExclusionService');
    const stats = historicalExclusionService.getRecordStatsForKeysAtDate(uniqueKeys, {
        fromDate: `01/01/${startYear}`,
        untilDate: `31/12/${endYear}`,
        totalYears: 20
    });

    const frequencies = {};
    for (const candidate of candidates) {
        const currentLength = Number(candidate.currentLength);
        const targetLength = Number(candidate.targetLength);
        const sampleLength = Number(candidate.sampleLength);
        if (!candidate.id || !candidate.key || !Number.isFinite(currentLength) || !Number.isFinite(targetLength)) continue;
        const gapStats = stats[candidate.key]?.gapStats || {};
        frequencies[candidate.id] = {
            currentCount: Number(gapStats[currentLength]?.count || 0),
            targetCount: Number(gapStats[targetLength]?.count || 0),
            frequencyCount: Number(gapStats[Number.isFinite(sampleLength) ? sampleLength : currentLength]?.count || 0)
        };
    }

    return {
        frequencies,
        _scope: {
            id: 'annual20',
            startDate: `01/01/${startYear}`,
            endDate: `31/12/${endYear}`,
            totalYears: 20
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
            return cachedResponse(await getAnnualFrequencySnapshot(candidates), 'NO_CACHE');
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
