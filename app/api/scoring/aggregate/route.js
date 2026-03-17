import { NextResponse } from 'next/server';
import { getRawData } from '@/lib/data-access';

export async function GET() {
    try {
        const lotteryScoring = require('../../../../lib/utils/lotteryScoring');

        const rawData = await getRawData();
        if (!rawData || rawData.length === 0) {
            return NextResponse.json({ results: [], scoringForms: [] });
        }

        // Filter data to current year and process into format expected by lotteryScoring
        const currentYear = new Date().getFullYear();
        const aggStartDate = `${currentYear}-01-01`;
        const today = new Date();
        const aggEndDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        // Process rawData into the format expected by calculateAggregateScoreForAllNumbers
        // It needs: [{date, numbers: [...]}]
        const processedData = rawData
            .filter(row => {
                const rowDate = row.date.substring(0, 10);
                return rowDate >= aggStartDate && rowDate <= aggEndDate;
            })
            .map(row => {
                // Extract all 2-digit numbers from the row (lottery "de" mode)
                const numbers = [];
                if (row.special !== undefined && row.special !== null) {
                    numbers.push(row.special);
                }
                return { date: row.date, numbers };
            });

        const { results } = lotteryScoring.calculateAggregateScoreForAllNumbers(processedData);

        // Map statusClass from Bootstrap to Tailwind
        const classMap = {
            'bg-success': 'bg-green-500',
            'bg-info': 'bg-blue-500',
            'bg-secondary': 'bg-gray-500',
            'bg-warning text-dark': 'bg-yellow-500',
            'bg-danger': 'bg-red-500'
        };
        const mappedResults = (results || []).map(r => ({
            ...r,
            statusClass: classMap[r.statusClass] || r.statusClass
        }));

        // Format dates for display
        const formatDate = (dateStr) => {
            const d = new Date(dateStr);
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        };

        // Serialize scoringForms without checkFunction
        const serializedForms = lotteryScoring.scoringForms.map(f => ({
            n: f.n,
            description: f.description,
            multiplier: f.multiplier
        }));

        return NextResponse.json({
            results: mappedResults,
            scoringForms: serializedForms,
            aggStartDate: formatDate(aggStartDate),
            aggEndDate: formatDate(aggEndDate)
        });
    } catch (error) {
        console.error('[Scoring Aggregate] Error:', error);
        return NextResponse.json({ results: [], scoringForms: [], error: error.message });
    }
}
