import { NextResponse } from 'next/server';
import { getCategoryStats } from '@/lib/data-access';

export const dynamic = 'force-dynamic';

/**
 * API: /api/statistics/stats?category=dau_chan&subcategory=veSole&exactLength=2&startDate=dd/mm/yyyy&endDate=dd/mm/yyyy
 * Tương đương: /statistics/api/v2/stats cũ
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const category = searchParams.get('category');
        const subcategory = searchParams.get('subcategory');
        const exactLength = searchParams.get('exactLength');
        const minLength = parseInt(searchParams.get('minLength')) || 2;
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        if (!category) {
            return NextResponse.json({ error: 'Thiếu tham số category' }, { status: 400 });
        }

        // Determine which bucket the category belongs to
        const sumDiffPrefixes = ['tong_tt', 'tong_moi', 'hieu'];
        const isSumDiff = sumDiffPrefixes.some(p => category.startsWith(p));
        
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
            for (const fallbackBucket of ['head_tail', 'sum_diff', 'number']) {
                if (fallbackBucket === bucket) continue;
                const fallbackData = await getCategoryStats(fallbackBucket, category);
                if (fallbackData) {
                    return handleCategoryResponse(fallbackData, subcategory, exactLength, minLength, startDate, endDate);
                }
            }
            return NextResponse.json({ error: `Category "${category}" không tìm thấy` }, { status: 404 });
        }

        return handleCategoryResponse(categoryData, subcategory, exactLength, minLength, startDate, endDate);
    } catch (error) {
        console.error('Error in stats API:', error);
        return NextResponse.json({ error: 'Lỗi server: ' + error.message }, { status: 500 });
    }
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
}

function handleCategoryResponse(categoryData, subcategory, exactLength, minLength, startDate, endDate) {
    let result;

    if (subcategory && categoryData[subcategory]) {
        result = categoryData[subcategory];
    } else if (categoryData.streaks) {
        result = categoryData;
    } else if (subcategory) {
        return NextResponse.json({ error: `Subcategory "${subcategory}" không tìm thấy` }, { status: 404 });
    } else {
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

    if (result && result.streaks) {
        let filtered = result.streaks;

        // Filter theo exactLength hoặc minLength
        if (exactLength && exactLength !== 'all') {
            const len = parseInt(exactLength);
            if (!isNaN(len)) {
                filtered = filtered.filter(s => s.length === len);
            }
        } else {
            filtered = filtered.filter(s => s.length >= minLength);
        }

        // Filter theo date range (overlap: streak phải nằm trong hoặc chồng lên khoảng thời gian)
        if (startDate || endDate) {
            const start = startDate ? parseDate(startDate) : null;
            const end = endDate ? parseDate(endDate) : null;
            filtered = filtered.filter(s => {
                const sEnd = parseDate(s.endDate);
                const sStart = parseDate(s.startDate);
                if (!sEnd || !sStart) return true;
                // Streak nằm trong range: endDate >= filterStart AND startDate <= filterEnd
                if (start && sEnd < start) return false;
                if (end && sStart > end) return false;
                return true;
            });
        }

        return NextResponse.json({
            ...result,
            streaks: filtered
        });
    }

    return NextResponse.json(result);
}
