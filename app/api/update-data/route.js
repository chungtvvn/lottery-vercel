import { NextResponse } from 'next/server';
import { clearMemoryCache, upsertLotteryResults, saveStatsToDb, uploadFullStatsToStorage } from '@/lib/data-access';
import generateNumberStats from '@/lib/generators/statisticsGenerator';
import generateHeadTailStats from '@/lib/generators/headTailStatsGenerator';
import generateSumDifferenceStats from '@/lib/generators/sumDifferenceStatsGenerator';
import { getAdminClient } from '@/lib/supabase';
import * as lotteryService from '@/lib/services/lotteryService';
import * as statisticsService from '@/lib/services/statisticsService';
import * as historicalExclusionService from '@/lib/services/historicalExclusionService';

const DATA_SOURCE_URL = 'https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/refs/heads/main/data/xsmb-2-digits.json';

export const maxDuration = 60;

async function ensureDataFile() {
    const fs = require('fs');
    const path = require('path');
    const tmpDataDir = '/tmp/lottery_data';
    const dataFilePath = path.join(tmpDataDir, 'xsmb-2-digits.json');
    
    fs.mkdirSync(tmpDataDir, { recursive: true });
    if (!fs.existsSync(dataFilePath)) {
        const response = await fetch(DATA_SOURCE_URL, { cache: 'no-store' });
        const rawJsonData = await response.json();
        fs.writeFileSync(dataFilePath, JSON.stringify(rawJsonData));
    }
    return tmpDataDir;
}

function clearAllCaches() {
    clearMemoryCache();
    try { if (lotteryService.clearCache) lotteryService.clearCache(); } catch(e) {}
    try { if (statisticsService.clearCache) statisticsService.clearCache(); } catch(e) {}
    try { if (historicalExclusionService.clearCache) historicalExclusionService.clearCache(); } catch(e) {}
}

export async function POST(request) {
    try {
        const url = new URL(request.url);
        const step = url.searchParams.get('step') || 'data';
        const startTime = Date.now();
        const fs = require('fs');
        const path = require('path');

        if (step === 'data') {
            console.log('[Update] Fetching data from GitHub...');
            const response = await fetch(DATA_SOURCE_URL, { cache: 'no-store' });
            if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
            
            const rawJsonData = await response.json();
            await upsertLotteryResults(rawJsonData);
            clearAllCaches();
            
            // Delete stale quick_stats cache
            try {
                await getAdminClient().from('cache_store').delete().in('key', ['quick_stats', 'quick_stats_history']);
            } catch(e) {}

            // Write data for subsequent generator steps
            const tmpDataDir = '/tmp/lottery_data';
            fs.mkdirSync(tmpDataDir, { recursive: true });
            fs.writeFileSync(path.join(tmpDataDir, 'xsmb-2-digits.json'), JSON.stringify(rawJsonData));

            rawJsonData.sort((a, b) => new Date(a.date) - new Date(b.date));
            const lastEntry = rawJsonData[rawJsonData.length - 1];
            const d = new Date(lastEntry.date);
            const formattedDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            return NextResponse.json({
                success: true, step: 'data',
                message: `Đã cập nhật ${rawJsonData.length} bản ghi (${elapsed}s). Mới nhất: ${formattedDate}.`,
                latestDate: formattedDate
            });

        } else if (step === 'stats_number') {
            // Generate number stats → save to Postgres
            const tmpDataDir = await ensureDataFile();
            const tmpStatsDir = '/tmp/lottery_stats';
            fs.mkdirSync(tmpStatsDir, { recursive: true });
            
            await generateNumberStats(tmpDataDir, tmpStatsDir);
            
            const statsPath = path.join(tmpStatsDir, 'number_stats.json');
            if (fs.existsSync(statsPath)) {
                const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
                await Promise.all([
                    saveStatsToDb('number', stats),
                    uploadFullStatsToStorage('number', stats)
                ]);
            }
            clearAllCaches();
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            return NextResponse.json({ success: true, step, message: `Number Stats hoàn thành (${elapsed}s)` });

        } else if (step === 'stats_head_tail') {
            // Generate head/tail stats → save to Postgres
            const tmpDataDir = await ensureDataFile();
            const tmpStatsDir = '/tmp/lottery_stats';
            fs.mkdirSync(tmpStatsDir, { recursive: true });
            
            await generateHeadTailStats(tmpDataDir, tmpStatsDir);
            
            const statsPath = path.join(tmpStatsDir, 'head_tail_stats.json');
            if (fs.existsSync(statsPath)) {
                const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
                await Promise.all([
                    saveStatsToDb('head_tail', stats),
                    uploadFullStatsToStorage('head_tail', stats)
                ]);
            }
            clearAllCaches();
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            return NextResponse.json({ success: true, step, message: `Head/Tail Stats hoàn thành (${elapsed}s)` });

        } else if (step === 'stats_sum_diff') {
            // Generate sum/diff stats → save to Postgres
            const tmpDataDir = await ensureDataFile();
            const tmpStatsDir = '/tmp/lottery_stats';
            fs.mkdirSync(tmpStatsDir, { recursive: true });
            
            await generateSumDifferenceStats(tmpDataDir, tmpStatsDir);
            
            const statsPath = path.join(tmpStatsDir, 'sum_difference_stats.json');
            if (fs.existsSync(statsPath)) {
                const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
                await Promise.all([
                    saveStatsToDb('sum_diff', stats),
                    uploadFullStatsToStorage('sum_diff', stats)
                ]);
            }
            clearAllCaches();
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            return NextResponse.json({ success: true, step, message: `Sum/Diff Stats hoàn thành (${elapsed}s)` });

        } else if (step === 'stats_quick') {
            // Pre-compute quick stats to prevent 504 timeouts on the frontend
            console.log('[Update] Pre-computing Quick Stats...');
            clearAllCaches();
            await lotteryService.loadRawData(); // This now does sequential loads safely
            const [quickStats, history] = await Promise.all([
                statisticsService.getQuickStats(),
                statisticsService.getQuickStatsHistory()
            ]);
            
            const { saveCacheEntry } = require('@/lib/data-access');
            await saveCacheEntry('quick_stats', quickStats);
            await saveCacheEntry('quick_stats_history', history);
            
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            return NextResponse.json({ success: true, step, message: `Quick Stats và History hoàn thành (${elapsed}s)` });
        }

        return NextResponse.json({ success: false, message: 'Invalid step' }, { status: 400 });

    } catch (error) {
        console.error('[Update] Error:', error);
        return NextResponse.json({ success: false, message: 'Lỗi: ' + error.message }, { status: 500 });
    }
}
