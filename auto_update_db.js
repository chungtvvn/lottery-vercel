require('dotenv').config({ path: '.env.local' });
const { getPublicClient } = require('./lib/supabase');
const { upsertLotteryResults, saveStatsToDb, saveCacheEntry } = require('./lib/data-access');
const generateNumberStats = require('./lib/generators/statisticsGenerator');
const generateHeadTailStats = require('./lib/generators/headTailStatsGenerator');
const generateSumDifferenceStats = require('./lib/generators/sumDifferenceStatsGenerator');
const lotteryService = require('./lib/services/lotteryService');
const statisticsService = require('./lib/services/statisticsService');

async function checkAndRun() {
    const supabase = getPublicClient();
    
    console.log("🛠️  Đang kiểm tra bảng lottery_results trong Supabase...");
    let retries = 0;
    while(retries < 30) {
        const { error } = await supabase.from('lottery_results').select('draw_date').limit(1);
        if (error && error.code === '42P01') {
            console.log("⏳ Bảng lottery_results chưa tồn tại. Đang đợi bạn tạo bảng trên Supabase SQL Editor... (Vui lòng dán mã SQL vào Supabase)");
            await new Promise(r => setTimeout(r, 10000));
            retries++;
        } else if (error && error.message.includes('Could not find')) {
            console.log("⏳ Bảng có vẻ chưa đúng chuẩn (thiếu cột). Đang đợi bạn tạo lại trên Supabase SQL Editor...");
            await new Promise(r => setTimeout(r, 10000));
            retries++;
        } else {
            console.log("✅ Đã tìm thấy bảng chuẩn! Tiến hành chạy tự động 5 bước...");
            break;
        }
    }

    if (retries >= 30) {
        console.log("❌ Đã hết thời gian chờ, vui lòng chạy lại script sau khi bạn đã tạo bảng SQL.");
        return;
    }

    try {
        console.log("\n🚀 BƯỚC 1: Đẩy kho dữ liệu KQXS từ GitHub vào Supabase...");
        const rawJsonData = await fetch('https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/refs/heads/main/data/xsmb-2-digits.json').then(r => r.json());
        await upsertLotteryResults(rawJsonData);
        console.log("✅ BƯỚC 1 XONG!");

        console.log("\n🚀 BƯỚC 2: Tính toán Number Stats In-Memory...");
        const sortedData = [...rawJsonData].sort((a,b) => new Date(a.date) - new Date(b.date));
        const numStats = await generateNumberStats(null, null, sortedData);
        await saveStatsToDb('number', numStats);
        console.log("✅ BƯỚC 2 XONG!");

        console.log("\n🚀 BƯỚC 3: Tính toán Head/Tail Stats In-Memory...");
        const htStats = await generateHeadTailStats(null, null, sortedData);
        await saveStatsToDb('head_tail', htStats);
        console.log("✅ BƯỚC 3 XONG!");

        console.log("\n🚀 BƯỚC 4: Tính toán Sum/Difference Stats In-Memory...");
        const sdStats = await generateSumDifferenceStats(null, null, sortedData);
        await saveStatsToDb('sum_diff', sdStats);
        console.log("✅ BƯỚC 4 XONG!");

        console.log("\n🚀 BƯỚC 5: Lên Cache cho Quick Stats...");
        try { if (lotteryService.clearCache) lotteryService.clearCache(); } catch(e) {}
        try { if (statisticsService.clearCache) statisticsService.clearCache(); } catch(e) {}
        await lotteryService.loadRawData();
        const quickStats = await statisticsService.getQuickStats();
        const history = await statisticsService.getQuickStatsHistory();
        await saveCacheEntry('quick_stats', quickStats);
        await saveCacheEntry('quick_stats_history', history);
        console.log("✅ BƯỚC 5 XONG!");

        console.log("\n🎉 HOÀN TẤT TOÀN BỘ CHUẨN BỊ. WEBSITE CỦA BẠN ĐÃ ĐẠT TỐC ĐỘ TỐI ĐA!");
        process.exit(0);

    } catch (e) {
        console.error("❌ LỖI TRONG QUÁ TRÌNH CHẠY AUTO:", e);
    }
}
checkAndRun();
