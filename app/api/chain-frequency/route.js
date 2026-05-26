import { NextResponse } from 'next/server';

export const maxDuration = 300;

function normalizeBooleanParam(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized) ? '1' : '0';
}

function normalizeSortParam(value) {
    return String(value || 'frequency').trim().toLowerCase() === 'risk' ? 'risk' : 'frequency';
}

export async function GET(request) {
    try {
        const simulationService = require('@/lib/services/simulationService');
        const { readCacheStore } = require('@/lib/data-access');
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
            const cached = await readCacheStore(`chain_frequency:${sortBy}:potential:${includePotential}:exclude3:${excludeFixed}`);
            if (cached && !cached.error) {
                return NextResponse.json({
                    ...cached,
                    cached: true
                });
            }
        }

        const result = await simulationService.runChainFrequencyAnalysis(options);

        if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
        return NextResponse.json(result);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
