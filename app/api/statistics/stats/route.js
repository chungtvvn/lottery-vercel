import { NextResponse } from 'next/server';
import { getCategoryStats, getRawData } from '@/lib/data-access';
import { cachedResponse, errorResponse } from '@/lib/cache-headers';

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
                    return await handleCategoryResponse(fallbackData, subcategory, exactLength, minLength, startDate, endDate, category);
                }
            }
            return errorResponse(`Category "${category}" không tìm thấy`, 404);
        }

        return await handleCategoryResponse(categoryData, subcategory, exactLength, minLength, startDate, endDate, category);
    } catch (error) {
        console.error('Error in stats API:', error);
        return errorResponse('Lỗi server: ' + error.message);
    }
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
}

/**
 * Hydrate streak: Xây dựng lại fullSequence từ raw data
 * để frontend có đủ dữ liệu hiển thị chuỗi số (bubbles)
 */
function hydrateStreak(streak, rawData, categoryName = '') {
    if (!streak || !streak.startDate || !streak.endDate || !rawData || rawData.length === 0) {
        return streak;
    }

    // Nếu streak đã có fullSequence (từ cache), bỏ qua
    if (streak.fullSequence && streak.fullSequence.length > 0) {
        return streak;
    }

    const formatToDDMMYYYY = (dateStr) => {
        if (!dateStr) return '';
        if (dateStr.includes('-')) {
            const parts = dateStr.split('-');
            const year = parts[0];
            const month = parts[1];
            const day = parts[2].substring(0, 2);
            return `${day}/${month}/${year}`;
        }
        return dateStr;
    };

    const startIndex = rawData.findIndex(item => formatToDDMMYYYY(item.date) === streak.startDate);
    const endIndex = rawData.findIndex(item => formatToDDMMYYYY(item.date) === streak.endDate);

    if (startIndex !== -1 && endIndex !== -1 && startIndex <= endIndex) {
        const fSeq = rawData.slice(startIndex, endIndex + 1).map(item => ({
            date: formatToDDMMYYYY(item.date),
            value: item.special !== null && item.special !== undefined ? String(item.special).padStart(2, '0') : null
        })).filter(i => i.value !== null);

        // Xử lý pattern So Le: thêm ngày tiếp theo với isLatest flag
        // Chuẩn hoá tên category (loại bỏ dấu cách) để check pattern chính xác hơn
        const normalizedName = categoryName ? categoryName.toLowerCase().replace(/\s+/g, '') : '';
        const isSoLe = (normalizedName.includes('sole') || normalizedName.includes('xenke')) &&
            !normalizedName.includes('tienluisole') &&
            !normalizedName.includes('luitiensole');

        if (isSoLe && endIndex + 1 < rawData.length) {
            const nextItem = rawData[endIndex + 1];
            if (nextItem && nextItem.special !== null && nextItem.special !== undefined) {
                fSeq.push({
                    date: formatToDDMMYYYY(nextItem.date),
                    value: String(nextItem.special).padStart(2, '0'),
                    isLatest: true
                });
            }
        }

        let actualDates = streak.dates;
        let actualValues = streak.values;

        if (!actualDates || !actualValues) {
            if (isSoLe) {
                actualDates = [];
                actualValues = [];
                for (let i = startIndex; i <= endIndex; i += 2) {
                    const item = rawData[i];
                    if (item && item.special !== null) {
                        actualDates.push(formatToDDMMYYYY(item.date));
                        actualValues.push(String(item.special).padStart(2, '0'));
                    }
                }
            } else {
                actualDates = fSeq.filter(i => !i.isLatest).map(i => i.date);
                actualValues = fSeq.filter(i => !i.isLatest).map(i => i.value);
            }
        }

        return {
            ...streak,
            fullSequence: fSeq,
            dates: actualDates,
            values: actualValues
        };
    }

    return streak;
}

async function handleCategoryResponse(categoryData, subcategory, exactLength, minLength, startDate, endDate, categoryKey) {
    let result;

    if (subcategory && categoryData[subcategory]) {
        result = categoryData[subcategory];
    } else if (categoryData.streaks) {
        result = categoryData;
    } else if (subcategory) {
        return errorResponse(`Subcategory "${subcategory}" không tìm thấy`, 404);
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
        return cachedResponse(summary, 'MEDIUM');
    }

    if (result && result.streaks) {
        let filtered = [...result.streaks];

        // 🔥 NEW: Tích hợp "Chuỗi Hiện Tại" (Ongoing Streaks) từ quick_stats.json
        // Điều này đảm bảo khi user click từ dashboard vào xem chi tiết, chuỗi đang diễn ra vẫn hiện ra
        try {
            const { getQuickStatsFromCache } = require('@/lib/data-access');
            const quickStatsData = await getQuickStatsFromCache();
            if (quickStatsData) {
                const fullKey = subcategory ? `${categoryKey}:${subcategory}` : categoryKey;
                const quickEntry = quickStatsData[fullKey];
                if (quickEntry && quickEntry.current) {
                    // Kiểm tra xem chuỗi này đã có trong filtered chưa (tránh trùng lặp nếu nó vừa được update vào JSON lịch sử)
                    const isAlreadyPresent = filtered.some(s => 
                        s.startDate === quickEntry.current.startDate && 
                        s.endDate === quickEntry.current.endDate &&
                        s.length === quickEntry.current.length
                    );
                    if (!isAlreadyPresent) {
                        filtered.push({
                            ...quickEntry.current,
                            isCurrent: true // Đánh dấu là chuỗi đang diễn ra
                        });
                    }
                }
            }
        } catch (e) {
            console.warn('[StatsAPI] Không thể load Quick Stats cho Current Streak:', e.message);
        }

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
                if (start && sEnd < start) return false;
                if (end && sStart > end) return false;
                return true;
            });
        }

        // 🔥 HYDRATE: Xây dựng fullSequence cho mỗi streak để frontend render bubbles
        const rawData = await getRawData();
        const categoryName = (categoryData.description || '') + ' ' + (subcategory || '');
        filtered = filtered.map(s => hydrateStreak(s, rawData, categoryName));

        // Sắp xếp lại: Mới nhất lên đầu
        filtered.sort((a, b) => {
            const dateA = parseDate(a.endDate);
            const dateB = parseDate(b.endDate);
            if (!dateA || !dateB) return 0;
            return dateB - dateA;
        });

        return cachedResponse({
            ...result,
            streaks: filtered
        }, 'MEDIUM');
    }

    return cachedResponse(result, 'MEDIUM');
}

