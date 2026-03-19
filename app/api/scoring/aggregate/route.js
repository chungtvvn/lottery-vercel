import { NextResponse } from 'next/server';
import { cachedResponse } from '@/lib/cache-headers';
import { getRawData } from '@/lib/data-access';

export async function GET() {
    try {
        const lotteryScoring = require('../../../../lib/utils/lotteryScoring');

        const rawData = await getRawData();
        if (!rawData || rawData.length === 0) {
            return cachedResponse({ results: [], scoringForms: [] }, 'DAILY');
        }

        const currentYear = new Date().getFullYear();
        const aggStartDate = `${currentYear}-01-01`;
        const today = new Date();
        const aggEndDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const processedData = rawData
            .filter(row => {
                const rowDate = row.date.substring(0, 10);
                return rowDate >= aggStartDate && rowDate <= aggEndDate;
            })
            .map(row => {
                const numbers = [];
                if (row.special !== undefined && row.special !== null) {
                    numbers.push(row.special);
                }
                return { date: row.date, numbers };
            });

        const { results } = lotteryScoring.calculateAggregateScoreForAllNumbers(processedData);

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

        const formatDate = (dateStr) => {
            const d = new Date(dateStr);
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        };

        const serializedForms = lotteryScoring.scoringForms.map(f => ({
            n: f.n,
            description: f.description,
            multiplier: f.multiplier
        }));

        return cachedResponse({
            results: mappedResults,
            scoringForms: serializedForms,
            aggStartDate: formatDate(aggStartDate),
            aggEndDate: formatDate(aggEndDate)
        }, 'DAILY');
    } catch (error) {
        console.error('[Scoring Aggregate] Error:', error);
        return NextResponse.json({ results: [], scoringForms: [], error: error.message });
    }
}
