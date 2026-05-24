import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const maxDuration = 300;

export async function GET(request) {
    try {
        const lotteryService = require('@/lib/services/lotteryService');
        await lotteryService.loadAll();
        const simulationService = require('@/lib/services/simulationService');
        const url = new URL(request.url);
        const days = parseInt(url.searchParams.get('days')) || 7;
        if (days < 7 || days > 365) {
            return NextResponse.json({ error: 'Số ngày phải từ 7 đến 365' }, { status: 400 });
        }
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
        const cachedPath = path.join(process.cwd(), 'lib/data/statistics', `cached_simulation_${days}.json`);
        let cachedPayload = null;
        if (fs.existsSync(cachedPath)) {
            try {
                cachedPayload = JSON.parse(fs.readFileSync(cachedPath, 'utf8'));
            } catch {
                cachedPayload = null;
            }
        }
        const canUseStaticCache = days === 365
            && url.searchParams.get('refresh') !== '1'
            && simulationService.isDefaultCustomOptions
            && simulationService.isDefaultCustomOptions({ custom })
            && cachedPayload
            && cachedPayload.config?.methodVersion === simulationService.SIMULATION_METHOD_VERSION;
        if (canUseStaticCache) {
            return NextResponse.json(cachedPayload);
        }
        const results = await simulationService.runBacktest(days, null, {
            custom,
            compactDetails: days > 90
        });
        if (results.error) return NextResponse.json({ error: results.error }, { status: 400 });
        return NextResponse.json(results);
    } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
