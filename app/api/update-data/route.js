import { NextResponse } from 'next/server';
import { clearMemoryCache, upsertLotteryResults, saveStatsToDb, saveCacheEntry } from '@/lib/data-access';
import generateNumberStats from '@/lib/generators/statisticsGenerator';
import generateHeadTailStats from '@/lib/generators/headTailStatsGenerator';
import generateSumDifferenceStats from '@/lib/generators/sumDifferenceStatsGenerator';
import { getAdminClient, getPublicClient } from '@/lib/supabase';
import * as lotteryService from '@/lib/services/lotteryService';
import * as statisticsService from '@/lib/services/statisticsService';
import * as historicalExclusionService from '@/lib/services/historicalExclusionService';

const DATA_SOURCE_URL = 'https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/refs/heads/main/data/xsmb-2-digits.json';

export const maxDuration = 60;

function clearAllCaches() {
    clearMemoryCache();
    try { if (lotteryService.clearCache) lotteryService.clearCache(); } catch(e) {}
    try { if (statisticsService.clearCache) statisticsService.clearCache(); } catch(e) {}
    try { if (historicalExclusionService.clearCache) historicalExclusionService.clearCache(); } catch(e) {}
}

/**
 * Lấy ngày mới nhất trong DB — chỉ 1 query nhẹ
 */
async function getLatestDbDate() {
    const supabase = getPublicClient();
    const { data, error } = await supabase
        .from('lottery_results')
        .select('draw_date')
        .order('draw_date', { ascending: false })
        .limit(1)
        .single();

    if (error || !data) return null;
    return data.draw_date; // "2026-03-18" format
}

/**
 * So sánh dữ liệu JSON mới với DB và chỉ insert các ngày còn thiếu.
 * Trả về { newCount, latestDate, allData }
 */
async function incrementalInsert(rawJsonData) {
    // Sort ascending by date
    rawJsonData.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Lấy ngày mới nhất trong DB (1 lightweight read)
    const latestDbDate = await getLatestDbDate();
    console.log(`[Update] Latest date in DB: ${latestDbDate || 'EMPTY'}`);

    let newRecords;
    if (!latestDbDate) {
        // DB trống – insert tất cả
        newRecords = rawJsonData;
        console.log(`[Update] DB empty, inserting ALL ${rawJsonData.length} records`);
    } else {
        // Chỉ lấy các ngày > latestDbDate
        const latestDbTimestamp = new Date(latestDbDate).getTime();
        newRecords = rawJsonData.filter(r => {
            const d = new Date(r.date);
            return d.getTime() > latestDbTimestamp;
        });
        console.log(`[Update] Found ${newRecords.length} new records after ${latestDbDate}`);
    }

    const lastEntry = rawJsonData[rawJsonData.length - 1];
    const d = new Date(lastEntry.date);
    const formattedDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    if (newRecords.length === 0) {
        return { newCount: 0, latestDate: formattedDate, allData: rawJsonData };
    }

    // INSERT chỉ các ngày mới (thay vì upsert toàn bộ)
    await upsertLotteryResults(newRecords);

    return { newCount: newRecords.length, latestDate: formattedDate, allData: rawJsonData };
}

export async function POST(request) {
    try {
        const url = new URL(request.url);
        const step = url.searchParams.get('step') || 'data';
        const forceRecompute = url.searchParams.get('force') === 'true';
        const startTime = Date.now();

        if (step === 'data') {
            console.log('[Update] Fetching data from GitHub...');
            const response = await fetch(DATA_SOURCE_URL, { cache: 'no-store' });
            if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
            
            const rawJsonData = await response.json();
            
            // SMART: So sánh với DB, chỉ insert ngày mới
            const { newCount, latestDate, allData } = await incrementalInsert(rawJsonData);
            
            // Lưu metadata vào /tmp cho các bước sau (nếu Vercel serverless cùng instance)
            try {
                const fs = require('fs');
                const path = require('path');
                const tmpDataDir = '/tmp/lottery_data';
                fs.mkdirSync(tmpDataDir, { recursive: true });
                fs.writeFileSync(path.join(tmpDataDir, 'xsmb-2-digits.json'), JSON.stringify(allData));
                fs.writeFileSync(path.join(tmpDataDir, 'update_meta.json'), JSON.stringify({ 
                    newCount, 
                    latestDate, 
                    timestamp: Date.now() 
                }));
            } catch(e) {
                console.warn('[Update] Cannot write tmp files:', e.message);
            }

            if (newCount > 0) {
                clearAllCaches();
                // Xóa stale quick_stats cache khi có dữ liệu mới
                try {
                    await getAdminClient().from('cache_store').delete().in('key', ['quick_stats', 'quick_stats_history']);
                    await getAdminClient().from('cache_store').delete().like('key', 'quick_stats_chunk_%');
                } catch(e) {}
            }

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            return NextResponse.json({
                success: true, step: 'data',
                message: newCount > 0 
                    ? `Đã thêm ${newCount} ngày mới (${elapsed}s). Mới nhất: ${latestDate}.`
                    : `Dữ liệu đã cập nhật rồi (0 ngày mới, ${elapsed}s). Mới nhất: ${latestDate}.`,
                latestDate,
                newCount
            });

        } else if (step === 'stats_number' || step === 'stats_head_tail' || step === 'stats_sum_diff') {
            // SMART: Đọc meta từ /tmp để check có dữ liệu mới không
            let newCount = 0;
            try {
                const fs = require('fs');
                const meta = JSON.parse(fs.readFileSync('/tmp/lottery_data/update_meta.json', 'utf-8'));
                newCount = meta.newCount || 0;
            } catch(e) {
                newCount = 1; // Fallback: assume cần recompute
                console.log('[Update] Cannot read meta, assuming new data exists');
            }

            // SKIP nếu không có dữ liệu mới VÀ không force
            if (newCount === 0 && !forceRecompute) {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                const stepName = step.replace('stats_', '').replace('_', '/');
                return NextResponse.json({ 
                    success: true, step, 
                    message: `SKIP ${stepName} — không có dữ liệu mới (${elapsed}s)`,
                    skipped: true
                });
            }

            // SMART: Ưu tiên dùng GitHub data từ /tmp (không đọc lại từ DB)
            let rawJsonData;
            try {
                const fs = require('fs');
                const tmpData = fs.readFileSync('/tmp/lottery_data/xsmb-2-digits.json', 'utf-8');
                rawJsonData = JSON.parse(tmpData);
                console.log(`[Update] Using GitHub data from /tmp (${rawJsonData.length} records, 0 DB reads)`);
            } catch(e) {
                // Fallback: phải đọc từ DB
                console.log('[Update] /tmp data unavailable, loading from DB...');
                await lotteryService.loadRawData();
                rawJsonData = lotteryService.getRawData();
            }

            let stats;
            if (step === 'stats_number') {
                console.log('[Update] Generating Number Stats in-memory...');
                stats = await generateNumberStats(null, null, rawJsonData);
                await saveStatsToDb('number', stats);
            } else if (step === 'stats_head_tail') {
                console.log('[Update] Generating Head/Tail Stats in-memory...');
                stats = await generateHeadTailStats(null, null, rawJsonData);
                await saveStatsToDb('head_tail', stats);
            } else {
                console.log('[Update] Generating Sum/Diff Stats in-memory...');
                stats = await generateSumDifferenceStats(null, null, rawJsonData);
                await saveStatsToDb('sum_diff', stats);
            }
            
            clearAllCaches();
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            return NextResponse.json({ success: true, step, message: `${step} hoàn thành (${elapsed}s, ${newCount} ngày mới)` });

        } else if (step === 'stats_quick') {
            // SMART: Kiểm tra có dữ liệu mới không
            let newCount = 0;
            try {
                const fs = require('fs');
                const meta = JSON.parse(fs.readFileSync('/tmp/lottery_data/update_meta.json', 'utf-8'));
                newCount = meta.newCount || 0;
            } catch(e) {
                newCount = 1;
                console.log('[Update] Cannot read meta, assuming new data exists');
            }

            // SKIP nếu không có dữ liệu mới VÀ không force
            if (newCount === 0 && !forceRecompute) {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                return NextResponse.json({ 
                    success: true, step, 
                    message: `SKIP Quick Stats — không có dữ liệu mới (${elapsed}s)`,
                    skipped: true
                });
            }

            // Pre-compute quick stats
            console.log('[Update] Pre-computing Quick Stats...');
            clearAllCaches();
            await lotteryService.loadAll(); // Need both rawData + stats for getQuickStats
            const [quickStats, history] = await Promise.all([
                statisticsService.getQuickStats(),
                statisticsService.getQuickStatsHistory()
            ]);
            
            await saveCacheEntry('quick_stats', quickStats);
            await saveCacheEntry('quick_stats_history', history);
            
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            return NextResponse.json({ success: true, step, message: `Quick Stats và History hoàn thành (${elapsed}s, ${newCount} ngày mới)` });
        }

        return NextResponse.json({ success: false, message: 'Invalid step' }, { status: 400 });

    } catch (error) {
        console.error('[Update] Error:', error);
        return NextResponse.json({ success: false, message: 'Lỗi: ' + error.message }, { status: 500 });
    }
}
