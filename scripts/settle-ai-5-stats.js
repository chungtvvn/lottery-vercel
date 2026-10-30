#!/usr/bin/env node
'use strict';

/**
 * scripts/settle-ai-5-stats.js
 * 
 * Script đối soát tự động hàng ngày cho 5 AI (ChatGPT, DeepSeek, Gemini, Grok, Muse) và Phương pháp Gộp Consensus:
 * - Chạy lúc 19:00 VN hàng ngày (12:00 UTC) hoặc trigger thủ công qua workflow_dispatch.
 * - Lấy kết quả mở thưởng XSMB (từ xoso.com.vn, R2, hoặc dailyLockedBetsRegistry).
 * - Nếu chưa có kết quả (chưa quay xong): thông báo và chờ hoặc kết thúc an toàn để lần chạy tiếp theo (1 tiếng sau) thử lại.
 * - Đối soát chi tiết Đề (20s) và Lô (6s) cho từng AI và Dàn Gộp.
 * - Cập nhật tỷ lệ lũy kế (rates, leaderboard) và lưu vào data/ai_5_stats.json.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const {
    loadAi5StatsData,
    saveAi5StatsData,
    settleDay,
    recomputeAllRates,
    AI_MODELS,
    CONSENSUS_META
} = require('../lib/services/ai5StatsService');

function getVietnamDateStr() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs() {
    const args = process.argv.slice(2);
    const parsed = {
        date: '',
        force: false,
        waitMinutes: 0
    };

    args.forEach(arg => {
        if (arg.startsWith('--date=')) {
            parsed.date = arg.split('=')[1].trim();
        } else if (arg === '--force') {
            parsed.force = true;
        } else if (arg.startsWith('--wait-minutes=')) {
            parsed.waitMinutes = parseInt(arg.split('=')[1], 10) || 0;
        }
    });

    if (!parsed.date) {
        parsed.date = getVietnamDateStr();
    }

    return parsed;
}

async function findActualDrawResult(targetDate) {
    // 1. Thử lấy từ xoso.com.vn trực tiếp
    try {
        const { fetchLatestXsmbResult, fetchAllRecentXsmbResults } = require('./sources/xoso-com-vn');
        const latest = await fetchLatestXsmbResult().catch(() => null);
        if (latest && latest.date === targetDate && latest.special !== null && latest.special !== undefined) {
            return latest;
        }
        const recentList = await fetchAllRecentXsmbResults().catch(() => []);
        const matchRecent = recentList.find(r => r.date === targetDate);
        if (matchRecent && matchRecent.special !== null && matchRecent.special !== undefined) {
            return matchRecent;
        }
    } catch (e) {
        console.warn(`[settle-ai-5-stats] Nguồn xoso.com.vn: ${e.message}`);
    }

    // 2. Thử lấy từ SSOT daily_locked_bets_registry.json
    try {
        const { loadRegistry } = require('../lib/services/dailyLockedBetsRegistryService');
        const reg = await loadRegistry();
        const dateEntry = reg?.dates?.[targetDate];
        if (dateEntry && dateEntry.isSettled && dateEntry.actualResult) {
            return {
                date: targetDate,
                special: dateEntry.actualResult.special,
                prizes27: dateEntry.actualResult.prizes || []
            };
        }
    } catch (_) {}

    // 3. Thử lấy từ raw data lịch sử (R2 / data-access)
    try {
        const { getRawData } = require('../lib/data-access');
        const raw = await getRawData();
        const found = raw.find(r => (r.date || r.ngay) === targetDate);
        if (found && found.special !== null && found.special !== undefined) {
            return found;
        }
    } catch (_) {}

    return null;
}

async function main() {
    const options = parseArgs();
    const targetDate = options.date;
    console.log(`\n======================================================`);
    console.log(`🤖 AI 5 AGENTS DAILY SETTLEMENT (ĐỐI SOÁT 5 SIÊU TRÍ TUỆ)`);
    console.log(`📅 Ngày đối soát: ${targetDate}`);
    console.log(`⚡ Chế độ: force=${options.force}, waitMinutes=${options.waitMinutes}`);
    console.log(`======================================================\n`);

    const data = loadAi5StatsData();
    const dayEntry = (data.days || []).find(d => d.date === targetDate);

    if (!dayEntry) {
        console.warn(`[settle-ai-5-stats] ⚠️ Không tìm thấy entry dự đoán của ngày ${targetDate} trong data/ai_5_stats.json.`);
        console.warn(`Vui lòng kiểm tra file data/ai_5_stats.json.`);
        process.exit(0);
    }

    const isAlreadySettled = Boolean(dayEntry.special && Array.isArray(dayEntry.prizes27) && dayEntry.prizes27.length === 27 && dayEntry.results);
    if (isAlreadySettled && !options.force) {
        console.log(`[settle-ai-5-stats] 🟢 Ngày ${targetDate} đã được đối soát từ trước (ĐB=${dayEntry.special}). Bỏ qua (dùng --force nếu muốn đối soát lại).`);
        process.exit(0);
    }

    // Tìm kết quả mở thưởng XSMB
    let actualDraw = await findActualDrawResult(targetDate);
    const startTime = Date.now();
    const maxWaitMs = options.waitMinutes * 60 * 1000;

    while (!actualDraw && options.waitMinutes > 0 && (Date.now() - startTime) < maxWaitMs) {
        console.log(`[settle-ai-5-stats] ⏳ Chưa có kết quả ngày ${targetDate}, chờ 30 giây thử lại... (đã chờ ${Math.round((Date.now() - startTime)/1000)}s / ${options.waitMinutes * 60}s)`);
        await sleep(30000);
        actualDraw = await findActualDrawResult(targetDate);
    }

    if (!actualDraw) {
        console.log(`[settle-ai-5-stats] ⏳ Chưa có kết quả quay thưởng XSMB ngày ${targetDate} (chưa đến 18:30 hoặc nguồn chưa cập nhật).`);
        console.log(`[settle-ai-5-stats] 🔄 Tiến trình sẽ tự động thử lại sau 1 tiếng (cron retry lúc 20:00 VN).`);
        process.exit(0);
    }

    console.log(`[settle-ai-5-stats] ✅ Đã tìm thấy kết quả mở thưởng ngày ${targetDate}:`);
    const specialStr = String(actualDraw.special).padStart(2, '0').slice(-2);
    console.log(`   Giải Đặc Biệt (Đề): [${specialStr}]`);

    // Thực hiện đối soát
    settleDay(dayEntry, actualDraw);
    console.log(`[settle-ai-5-stats] 🎯 Đối soát thành công cho cả 5 AI và Phương pháp Gộp Consensus!`);

    // Cập nhật lại tỷ lệ lũy kế
    recomputeAllRates(data);

    // Lưu dữ liệu vào file
    saveAi5StatsData(data);
    console.log(`[settle-ai-5-stats] 💾 Đã lưu dữ liệu đối soát vào data/ai_5_stats.json & lib/data/statistics/ai_5_stats.json.`);

    // In bảng kết quả chi tiết
    console.log(`\n------------------------------------------------------`);
    console.log(`📊 BẢNG KẾT QUẢ ĐỐI SOÁT NGÀY ${targetDate} (ĐB = ${specialStr}):`);
    console.log(`------------------------------------------------------`);
    
    const res = dayEntry.results;
    const modelOrder = ['consensus', ...Object.keys(AI_MODELS)];

    modelOrder.forEach(mKey => {
        const r = res[mKey];
        if (!r) return;
        const name = mKey === 'consensus' ? '👑 Gộp Consensus' : (AI_MODELS[mKey]?.name || mKey);
        const deHitText = r.de.isHit ? `🎯 TRÚNG (${specialStr}) +${r.de.profitK}K` : `❌ Trượt (${r.de.profitK}K)`;
        const loHitText = `Nổ ${r.lo.hits} nháy [${r.lo.hitNumbers.join(' ')}] (${r.lo.profitK >= 0 ? '+' : ''}${r.lo.profitK}K)`;
        const netProfitText = `${r.totalProfitK >= 0 ? '+' : ''}${r.totalProfitK}K`;
        console.log(`  * ${name.padEnd(18)}: Đề ${deHitText.padEnd(26)} | Lô ${loHitText.padEnd(30)} | Net: ${netProfitText}`);
    });

    console.log(`------------------------------------------------------\n`);
    console.log(`🎉 Hoàn tất đối soát AI 5 Stats.`);
}

main().catch(err => {
    console.error('[settle-ai-5-stats] Lỗi nghiêm trọng:', err);
    process.exit(1);
});
