import { NextResponse } from 'next/server';
import { getCategoryStats } from '@/lib/data-access';

export const dynamic = 'force-dynamic';

/**
 * API: /api/statistics/stats?category=dau_chan&subcategory=veSole&minLength=3
 * Tương đương: /statistics/api/v2/stats cũ
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const category = searchParams.get('category');
        const subcategory = searchParams.get('subcategory');
        const minLength = parseInt(searchParams.get('minLength')) || 2;

        if (!category) {
            return NextResponse.json({ error: 'Thiếu tham số category' }, { status: 400 });
        }

        // Determine which bucket the category belongs to
        // Categories from headTailStatsGenerator use 'head_tail' bucket
        // Categories from sumDifferenceStatsGenerator use 'sum_diff' bucket
        // Categories from statisticsGenerator use 'number' bucket
        
        const sumDiffPrefixes = ['tong_tt', 'tong_moi', 'hieu'];
        const isSumDiff = sumDiffPrefixes.some(p => category.startsWith(p));
        
        // Number stats categories
        const numberCategories = [
            'motSoVeLienTiep', 'motSoVeSole', 'motSoVeSoleMoi',
            'motSoTienLienTiep', 'motSoTienDeuLienTiep', 'motSoLuiLienTiep', 'motSoLuiDeuLienTiep',
            'cacSoTienLienTiep', 'cacSoTienDeuLienTiep', 'cacSoLuiLienTiep', 'cacSoLuiDeuLienTiep',
            'cacSoVeLienTiep', 'cacSoVeSole', 'cacSoVeSoleMoi',
            'cacDauVeLienTiep', 'cacDauVeSole', 'cacDauVeSoleMoi',
            'cacDauTienLienTiep', 'cacDauTienDeuLienTiep', 'cacDauLuiLienTiep', 'cacDauLuiDeuLienTiep',
            'cacDitVeLienTiep', 'cacDitVeSole', 'cacDitVeSoleMoi',
            'cacDitTienLienTiep', 'cacDitTienDeuLienTiep', 'cacDitLuiLienTiep', 'cacDitLuiDeuLienTiep'
        ];
        const isNumber = numberCategories.includes(category);
        
        let bucket;
        if (isNumber) {
            bucket = 'number';
        } else if (isSumDiff) {
            bucket = 'sum_diff';
        } else {
            bucket = 'head_tail';
        }

        const categoryData = await getCategoryStats(bucket, category);
        if (!categoryData) {
            // Try other buckets as fallback
            for (const fallbackBucket of ['head_tail', 'sum_diff', 'number']) {
                if (fallbackBucket === bucket) continue;
                const fallbackData = await getCategoryStats(fallbackBucket, category);
                if (fallbackData) {
                    return handleCategoryResponse(fallbackData, subcategory, minLength);
                }
            }
            return NextResponse.json({ error: `Category "${category}" không tìm thấy` }, { status: 404 });
        }

        return handleCategoryResponse(categoryData, subcategory, minLength);
    } catch (error) {
        console.error('Error in stats API:', error);
        return NextResponse.json({ error: 'Lỗi server: ' + error.message }, { status: 500 });
    }
}

function handleCategoryResponse(categoryData, subcategory, minLength) {
    let result;

    if (subcategory && categoryData[subcategory]) {
        // Category has subcategories (e.g., dau_chan.veSole)
        result = categoryData[subcategory];
    } else if (categoryData.streaks) {
        // Category is a direct stats object
        result = categoryData;
    } else if (subcategory) {
        return NextResponse.json({ error: `Subcategory "${subcategory}" không tìm thấy` }, { status: 404 });
    } else {
        // Return all subcategories info
        const summary = {};
        for (const [key, value] of Object.entries(categoryData)) {
            if (value && value.streaks) {
                summary[key] = {
                    description: value.description,
                    totalStreaks: value.streaks.length,
                    longestStreak: value.streaks.length > 0 ? Math.max(...value.streaks.map(s => s.length)) : 0
                };
            }
        }
        return NextResponse.json(summary);
    }

    // Apply minLength filter
    if (result && result.streaks) {
        const filtered = {
            ...result,
            streaks: result.streaks.filter(s => s.length >= minLength)
        };
        return NextResponse.json(filtered);
    }

    return NextResponse.json(result);
}
