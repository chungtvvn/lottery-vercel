import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const simulationService = require('@/lib/services/simulationService');
        const url = new URL(request.url);
        const days = parseInt(url.searchParams.get('days')) || 7;
        if (days < 7 || days > 365) {
            return NextResponse.json({ error: 'Số ngày phải từ 7 đến 365' }, { status: 400 });
        }
        const playModeParam = String(url.searchParams.get('playMode') || 'both').trim().toLowerCase();
        const playMode = ['bet', 'hold', 'both'].includes(playModeParam) ? playModeParam : 'both';
        const betWinMultiplier = url.searchParams.get('betWinMultiplier') || undefined;
        const betWinFactor = url.searchParams.get('betWinFactor') || undefined;
        const holdWinMultiplier = url.searchParams.get('holdWinMultiplier') || undefined;
        const custom = {
            minPriority: url.searchParams.get('customMinPriority'),
            minDropOffPercent: url.searchParams.get('customMinDropOffPercent'),
            maxFrequencyPerYear: url.searchParams.get('customMaxFrequencyPerYear'),
            maxPotentialFrequencyPerYear: url.searchParams.get('customMaxPotentialFrequencyPerYear'),
            minLowerBoundPercent: url.searchParams.get('customMinLowerBoundPercent'),
            minSampleSize: url.searchParams.get('customMinSampleSize'),
            targetExcluded: url.searchParams.get('customTargetExcluded'),
            requirePositiveEdge: url.searchParams.get('customRequirePositiveEdge'),
            includeFormed: url.searchParams.get('customIncludeFormed'),
            includePotential: url.searchParams.get('customIncludePotential'),
            includeHighFrequency: url.searchParams.get('customIncludeHighFrequency'),
            excludeFixedThreeValueGroups: url.searchParams.get('customExcludeFixedThreeValueGroups')
        };
        const { readCacheStore, shouldUseSupabaseDbStats, loadJsonWithSupabaseFallback } = require('@/lib/data-access');
        const dbStatsActive = shouldUseSupabaseDbStats();
        let cachedPayload = null;
        const defaultCustom = simulationService.isDefaultCustomOptions
            && simulationService.isDefaultCustomOptions({ custom });
        const canReadPrecomputedCache = url.searchParams.get('refresh') !== '1'
            && !url.searchParams.get('methods')
            && !betWinMultiplier
            && !betWinFactor
            && !holdWinMultiplier
            && defaultCustom;
        if (dbStatsActive) {
            try {
                cachedPayload = await readCacheStore(`cached_simulation_${days}_${playMode}`)
                    || (playMode === 'both' ? await readCacheStore(`cached_simulation_${days}`) : null);
            } catch (dbErr) {
                console.error(`Lỗi khi đọc cached_simulation_${days} từ DB:`, dbErr.message);
            }
        }
        if (!cachedPayload) {
            const fileName = playMode === 'both' ? `cached_simulation_${days}.json` : `cached_simulation_${days}_${playMode}.json`;
            try {
                cachedPayload = await loadJsonWithSupabaseFallback(fileName);
            } catch {
                cachedPayload = null;
            }
        }
        const canUseStaticCache = canReadPrecomputedCache
            && cachedPayload
            && cachedPayload.config?.methodVersion === simulationService.SIMULATION_METHOD_VERSION
            && (cachedPayload.config?.playMode || 'both') === playMode;
        const canUseDbCache = dbStatsActive
            && canReadPrecomputedCache
            && cachedPayload
            && cachedPayload.config?.methodVersion === simulationService.SIMULATION_METHOD_VERSION
            && cachedPayload.config?.playMode === playMode;
        if (canUseStaticCache || canUseDbCache) {
            return NextResponse.json(cachedPayload);
        }
        const lotteryService = require('@/lib/services/lotteryService');
        await lotteryService.loadAll();
        const results = await simulationService.runBacktest(days, null, {
            custom,
            playMode,
            betWinMultiplier,
            betWinFactor,
            holdWinMultiplier,
            compactDetails: days > 90,
            methodIds: url.searchParams.get('methods')
        });
        if (results.error) return NextResponse.json({ error: results.error }, { status: 400 });
        return NextResponse.json(results);
    } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
