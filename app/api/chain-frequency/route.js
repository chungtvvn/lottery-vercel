import { NextResponse } from 'next/server';

export const maxDuration = 300;

export async function GET(request) {
    try {
        const simulationService = require('@/lib/services/simulationService');
        const url = new URL(request.url);
        const result = await simulationService.runChainFrequencyAnalysis({
            targetBetCount: url.searchParams.get('targetBetCount'),
            minExclusionPriority: url.searchParams.get('minExclusionPriority'),
            minChainSignal: url.searchParams.get('minChainSignal'),
            includePotential: url.searchParams.get('includePotential'),
            excludeFixedThreeValueGroups: url.searchParams.get('excludeFixedThreeValueGroups'),
            sortBy: url.searchParams.get('sortBy')
        });

        if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
        return NextResponse.json(result);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
