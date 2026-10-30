#!/usr/bin/env node
'use strict';

/**
 * scripts/settle-ai-5-stats.js
 * 
 * Script đối soát tự động hàng ngày cho 5 AI (ChatGPT, DeepSeek, Gemini, Grok, Muse) và Phương pháp Gộp Consensus:
 * - Chạy lúc 19:00 VN hàng ngày (12:00 UTC) qua GitHub Actions, tự động retry mỗi 1 tiếng (19h, 20h, 21h, 22h, 23h VN).
 * - Lấy kết quả mở thưởng XSMB (từ xoso.com.vn, SSOT registry, hoặc R2).
 * - Nếu chưa có kết quả (chưa quay xong): log thông báo và chờ hoặc kết thúc an toàn để retry sau 1 tiếng.
 * - Đối soát chi tiết Đề (20s phẳng, Tiered X2/X1) và Lô (6s phẳng, Tiered X5..X1) cho từng AI và Dàn Gộp.
 * - Cập nhật tỷ lệ lũy kế (rates, leaderboard) và lưu vào data/ai_5_stats.json.
 * - Tự động chuẩn bị và tính toán dự đoán ngày tiếp theo (Next Day): tự động nạp Muse từ lịch sử raw, kiểm tra độ sẵn sàng của 5 AI.
 * - Nếu chưa có ngày tiếp theo hoặc chưa đủ 5 AI: log thông báo retry sau 1 tiếng.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const {
    loadAi5StatsData,
    saveAi5StatsData,
    settleDay,
    recomputeAllRates,
    calculateConsensus,
    computeMusePredictions,
    AI_MODELS,
    CONSENSUS_META
} = require('../lib/services/ai5StatsService');

function getVietnamDateStr() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function getNextDayStr(dateStr) {
    const d = new Date(`${dateStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
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

async function handleNextDayPredictions(data, targetDate) {
    const nextDate = getNextDayStr(targetDate);
    console.log(`\n======================================================`);
    console.log(`🔮 KIỂM TRA DỰ ĐOÁN NGÀY TIẾP THEO (${nextDate}):`);
    console.log(`======================================================`);

    let nextDayEntry = (data.days || []).find(d => d.date === nextDate);
    if (!nextDayEntry) {
        nextDayEntry = {
            date: nextDate,
            sources: {
                chatgpt: { de: [], lo: [] },
                deepseek: { de: [], lo: [] },
                gemini: { de: [], lo: [] },
                grok: { de: [], lo: [] },
                muse: { de: [], lo: [] }
            }
        };
        data.days.push(nextDayEntry);
        console.log(`[settle-ai-5-stats] ➕ Đã khởi tạo entry dự thảo cho ngày tiếp theo: ${nextDate}`);
    }

    // Tự động tính toán dự đoán Muse (AI nội bộ hệ thống) nếu chưa có
    const museSources = nextDayEntry.sources?.muse;
    const hasMuseDe = Array.isArray(museSources?.de) && museSources.de.length >= 20;
    const hasMuseLo = Array.isArray(museSources?.lo) && museSources.lo.length >= 6;

    if (!hasMuseDe || !hasMuseLo) {
        try {
            const { getRawData } = require('../lib/data-access');
            const raw = await getRawData();
            if (Array.isArray(raw) && raw.length > 0) {
                const musePred = computeMusePredictions(raw);
                if (!nextDayEntry.sources) nextDayEntry.sources = {};
                nextDayEntry.sources.muse = musePred;
                console.log(`[settle-ai-5-stats] 🧠 Đã tự động kích hoạt Muse AI và tính toán thành công cho ngày ${nextDate}:`);
                console.log(`   - Đề (20s): ${musePred.de.slice(0, 10).join(', ')}...`);
                console.log(`   - Lô (6s):  ${musePred.lo.join(', ')}`);
            }
        } catch (e) {
            console.warn(`[settle-ai-5-stats] ⚠️ Không thể tự động tính Muse AI: ${e.message}`);
        }
    } else {
        console.log(`[settle-ai-5-stats] 🧠 Muse AI ngày ${nextDate} đã sẵn sàng (${museSources.de.length} Đề, ${museSources.lo.length} Lô).`);
    }

    // Đếm số lượng AI đã nạp số cho ngày tiếp theo
    const modelKeys = Object.keys(AI_MODELS);
    let readyAiCount = 0;
    const missingAis = [];

    modelKeys.forEach(k => {
        const s = nextDayEntry.sources?.[k];
        const deCount = Array.isArray(s?.de) ? s.de.length : 0;
        const loCount = Array.isArray(s?.lo) ? s.lo.length : 0;
        if (deCount >= 20 && loCount >= 6) {
            readyAiCount++;
        } else {
            missingAis.push(`${AI_MODELS[k]?.name || k} (Đề: ${deCount}/20, Lô: ${loCount}/6)`);
        }
    });

    console.log(`[settle-ai-5-stats] 📊 Trạng thái nạp dữ liệu ngày ${nextDate}: ${readyAiCount}/${modelKeys.length} AI đã sẵn sàng.`);
    
    if (readyAiCount === modelKeys.length) {
        // Tính dàn Gộp Consensus khi cả 5 AI đã có mặt
        const consensus = calculateConsensus(nextDayEntry.sources);
        console.log(`[settle-ai-5-stats] 👑 ĐẠI ĐỒNG THUẬN 5 AI NGÀY ${nextDate} ĐÃ SẴN SÀNG:`);
        console.log(`   - Đề X2 (VIP): ${consensus.deTiers?.x2Nums?.join(', ') || 'N/A'}`);
        console.log(`   - Đề X1 (Lót): ${consensus.deTiers?.x1Nums?.join(', ') || 'N/A'}`);
        console.log(`   - Lô X5 (5 vote): ${consensus.loTiers?.x5Nums?.join(', ') || 'Không có'}`);
        console.log(`   - Lô X4 (4 vote): ${consensus.loTiers?.x4Nums?.join(', ') || 'Không có'}`);
        console.log(`   - Lô X3 (3 vote): ${consensus.loTiers?.x3Nums?.join(', ') || 'Không có'}`);
        console.log(`   - Lô X2 (2 vote): ${consensus.loTiers?.x2Nums?.join(', ') || 'Không có'}`);
        console.log(`[settle-ai-5-stats] 🚀 Đầy đủ 5 AI! Sẵn sàng phục vụ thực chiến.`);
    } else {
        console.log(`[settle-ai-5-stats] ⚠️ Các AI còn thiếu số ngày ${nextDate}:`);
        missingAis.forEach(m => console.log(`   - ${m}`));
        console.log(`[settle-ai-5-stats] 🔄 [Auto-Retry] GitHub Actions sẽ tự động chạy lại sau 1 tiếng (19h, 20h, 21h, 22h, 23h VN) để đối chiếu và kiểm tra dữ liệu tiếp theo.`);
    }
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
    let dayEntry = (data.days || []).find(d => d.date === targetDate);

    if (!dayEntry) {
        console.warn(`[settle-ai-5-stats] ⚠️ Không tìm thấy entry dự đoán của ngày ${targetDate} trong data/ai_5_stats.json.`);
        console.warn(`Tiến hành khởi tạo và kiểm tra ngày tiếp theo...`);
    } else {
        const isAlreadySettled = Boolean(dayEntry.special && Array.isArray(dayEntry.prizes27) && dayEntry.prizes27.length === 27 && dayEntry.results);
        
        if (isAlreadySettled && !options.force) {
            console.log(`[settle-ai-5-stats] 🟢 Ngày ${targetDate} đã được đối soát từ trước (ĐB=${dayEntry.special}). Bỏ qua phần đối soát.`);
        } else {
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
                console.log(`[settle-ai-5-stats] 🔄 Tiến trình sẽ tự động thử lại sau 1 tiếng (cron retry tiếp theo qua GitHub Actions).`);
            } else {
                console.log(`[settle-ai-5-stats] ✅ Đã tìm thấy kết quả mở thưởng ngày ${targetDate}:`);
                const specialStr = String(actualDraw.special).padStart(2, '0').slice(-2);
                console.log(`   Giải Đặc Biệt (Đề): [${specialStr}]`);

                // Thực hiện đối soát
                settleDay(dayEntry, actualDraw);
                console.log(`[settle-ai-5-stats] 🎯 Đối soát thành công cho cả 5 AI và Phương pháp Gộp Consensus (cả Phẳng và Đa Tầng)!`);

                // Cập nhật lại tỷ lệ lũy kế
                recomputeAllRates(data);

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

                if (dayEntry.resultsTiered) {
                    const ct = dayEntry.resultsTiered.consensus;
                    if (ct) {
                        console.log(`\n  👑 [Consensus Đa Tầng]:`);
                        console.log(`     - Đề Tiered: ${ct.de.isHit ? `🎯 TRÚNG (${ct.de.hitTier}) +${ct.de.profitK}K` : `❌ Trượt (${ct.de.profitK}K)`}`);
                        console.log(`     - Lô Tiered: Nổ ${ct.lo.hits} nháy (${ct.lo.profitK >= 0 ? '+' : ''}${ct.lo.profitK}K, stake: ${ct.lo.stakeK}K, payout: ${ct.lo.payoutK}K)`);
                    }
                }

                console.log(`------------------------------------------------------\n`);
            }
        }
    }

    // Tiếp tục: Xử lý và kiểm tra dự đoán ngày tiếp theo (Next Day)
    await handleNextDayPredictions(data, targetDate);

    // Lưu dữ liệu vào file
    saveAi5StatsData(data);
    console.log(`[settle-ai-5-stats] 💾 Đã lưu dữ liệu đối soát vào data/ai_5_stats.json & lib/data/statistics/ai_5_stats.json.`);
    console.log(`🎉 Hoàn tất chu trình đối soát AI 5 Stats.\n`);
}

main().catch(err => {
    console.error('[settle-ai-5-stats] Lỗi nghiêm trọng:', err);
    process.exit(1);
});
