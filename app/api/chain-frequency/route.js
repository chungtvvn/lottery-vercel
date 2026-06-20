import { NextResponse } from 'next/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function normalizeBooleanParam(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized) ? '1' : '0';
}

function normalizeSortParam(value) {
    return String(value || 'frequency').trim().toLowerCase() === 'risk' ? 'risk' : 'frequency';
}

function withoutDefaultSelection(payload) {
    if (!payload || payload.error) return payload;
    const chainRows = Array.isArray(payload.chainRows)
        ? payload.chainRows.map(row => ({ ...row, selectedByDefault: false }))
        : [];
    const allNumbers = Array.from({ length: 100 }, (_, index) => index);
    return {
        ...payload,
        chainRows,
        excludedNumbers: [],
        betNumbers: allNumbers,
        summary: {
            ...(payload.summary || {}),
            selectedChainCount: 0,
            excludedNumberCount: 0,
            betNumberCount: allNumbers.length
        }
    };
}

export async function GET(request) {
    try {
        const simulationService = require('@/lib/services/simulationService');
        const { readCacheStore, shouldUseSupabaseDbStats, loadJsonWithSupabaseFallback } = require('@/lib/data-access');
        const url = new URL(request.url);
        const options = {
            targetBetCount: url.searchParams.get('targetBetCount'),
            minExclusionPriority: url.searchParams.get('minExclusionPriority'),
            minChainSignal: url.searchParams.get('minChainSignal'),
            includePotential: url.searchParams.get('includePotential'),
            excludeFixedThreeValueGroups: url.searchParams.get('excludeFixedThreeValueGroups'),
            sortBy: url.searchParams.get('sortBy')
        };
        const hasLegacyCustomParams = Boolean(options.targetBetCount || options.minExclusionPriority || options.minChainSignal);
        const includePotential = normalizeBooleanParam(options.includePotential, '1');
        const excludeFixed = normalizeBooleanParam(options.excludeFixedThreeValueGroups, '0');
        const sortBy = normalizeSortParam(options.sortBy);

        if (!hasLegacyCustomParams) {
            let cached = null;
            if (shouldUseSupabaseDbStats()) {
                cached = await readCacheStore(`chain_frequency:${sortBy}:potential:${includePotential}:exclude3:${excludeFixed}`);
            }
            if (!cached) {
                cached = await loadJsonWithSupabaseFallback(`chain_frequency_${sortBy}_potential_${includePotential}_exclude3_${excludeFixed}.json`);
            }
            if (
                cached &&
                !cached.error &&
                cached.averageDropoff?.ranking?.length === 100 &&
                cached.recommendedExclusion?.methodId === 'avgEdge50Hold70' &&
                cached.recommendedExclusion?.ranking?.length === 100
            ) {
                return NextResponse.json({
                    ...withoutDefaultSelection(cached),
                    cached: true
                });
            }
        }

        const result = await simulationService.runChainFrequencyAnalysis(options);

        if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
        return NextResponse.json(withoutDefaultSelection(result));
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
