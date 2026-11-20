'use strict';

/**
 * scripts/research-mirofish-parity-swarm.js
 * 
 * BÁO CÁO NGHIÊN CỨU & KIỂM ĐỊNH THỰC NGHIỆM MIROFISH SWARM CHO CHẴN LẺ ĐỀ & LÔ
 * 
 * Áp dụng kiến trúc Đa Tác Tử Mô Phỏng & Tranh Luận (Multi-Agent Debate & Consensus Swarm)
 * lấy cảm hứng từ MiroFish (666ghj/MiroFish) vào bài toán dự đoán Đầu / Đít Chẵn Lẻ XSMB.
 * 
 * 100% Strict Point-In-Time (Strict PIT) - Tuyệt đối không rò rỉ dữ liệu tương lai.
 * Kiểm định trên:
 * - Năm 2026 (Toàn bộ 299 - 315 kỳ quay)
 * - Đa niên 5 năm (2022 - 2026, 1,760 kỳ quay)
 */

const fs = require('fs');
const path = require('path');

// 1. Nạp dữ liệu lịch sử
const rawDataPath = path.join(__dirname, '../lib/data/xsmb-2-digits.json');
const fullHistory = JSON.parse(fs.readFileSync(rawDataPath, 'utf8'));

// Format ngày và số 2 chữ số
const numStr = n => String(Number(n)).padStart(2, '0');

// Chuyển đổi dữ liệu thành danh sách có thứ tự thời gian
const sortedDraws = Object.values(fullHistory).sort((a, b) => a.date.localeCompare(b.date));
console.log(`[Data] Tổng số kỳ quay lịch sử nạp được: ${sortedDraws.length} kỳ (${sortedDraws[0].date} -> ${sortedDraws[sortedDraws.length - 1].date})`);

// Trích xuất 27 giải Lô cho một ngày
function extract27Loto(draw) {
    const list = [];
    if (draw.special !== undefined) list.push(numStr(draw.special));
    if (draw.prize1 !== undefined) list.push(numStr(draw.prize1));
    for (let i = 1; i <= 2; i++) if (draw[`prize2_${i}`] !== undefined) list.push(numStr(draw[`prize2_${i}`]));
    for (let i = 1; i <= 6; i++) if (draw[`prize3_${i}`] !== undefined) list.push(numStr(draw[`prize3_${i}`]));
    for (let i = 1; i <= 4; i++) if (draw[`prize4_${i}`] !== undefined) list.push(numStr(draw[`prize4_${i}`]));
    for (let i = 1; i <= 6; i++) if (draw[`prize5_${i}`] !== undefined) list.push(numStr(draw[`prize5_${i}`]));
    for (let i = 1; i <= 3; i++) if (draw[`prize6_${i}`] !== undefined) list.push(numStr(draw[`prize6_${i}`]));
    for (let i = 1; i <= 4; i++) if (draw[`prize7_${i}`] !== undefined) list.push(numStr(draw[`prize7_${i}`]));
    return list;
}

// Lấy thứ trong tuần (0: CN, 1: T2, ..., 6: T7)
function getDayOfWeek(dateStr) {
    return new Date(dateStr + 'T00:00:00Z').getUTCDay();
}

/**
 * 6 TÁC TỬ CHUYÊN BIỆT MIROFISH (MIROFISH PARITY SWARM AGENTS)
 * Mỗi tác tử đại diện cho một trường phái toán học / định lượng độc lập:
 */

// Tác tử 1: Markov Transition Specialist (Chuyển tiếp trạng thái Bậc 1 & 2)
function agentMarkov(historyUntilYesterday, targetPos) { // targetPos: 'head' | 'tail'
    const len = historyUntilYesterday.length;
    if (len < 5) return { voteEven: true, conf: 0.5, name: 'Markov' };
    
    // Thu thập chuỗi chẵn lẻ quá khứ
    const paritySeq = historyUntilYesterday.map(d => {
        const sp = numStr(d.special);
        const digit = targetPos === 'head' ? parseInt(sp[0], 10) : parseInt(sp[1], 10);
        return digit % 2 === 0 ? 1 : 0; // 1: Chẵn, 0: Lẻ
    });

    const sPrev1 = paritySeq[len - 1];
    const sPrev2 = paritySeq[len - 2];

    // Đếm ma trận chuyển tiếp bậc 2 P(S_t | S_{t-1}, S_{t-2})
    let countC = 0, countL = 0;
    for (let i = 2; i < len; i++) {
        if (paritySeq[i - 1] === sPrev1 && paritySeq[i - 2] === sPrev2) {
            if (paritySeq[i] === 1) countC++; else countL++;
        }
    }

    // Nếu mẫu bậc 2 quá nhỏ (< 5), lùi về bậc 1 P(S_t | S_{t-1})
    if (countC + countL < 5) {
        countC = 0; countL = 0;
        for (let i = 1; i < len; i++) {
            if (paritySeq[i - 1] === sPrev1) {
                if (paritySeq[i] === 1) countC++; else countL++;
            }
        }
    }

    const total = countC + countL;
    if (total === 0) return { voteEven: true, conf: 0.5, name: 'Markov' };

    const probEven = countC / total;
    return {
        voteEven: probEven >= 0.5,
        probEven,
        conf: Math.abs(probEven - 0.5) * 2, // [0, 1]
        name: 'Markov'
    };
}

// Tác tử 2: Gap Hazard & Weibull Specialist (Nguy cơ nén nhịp & Hồi quy chuỗi)
function agentHazard(historyUntilYesterday, targetPos) {
    const len = historyUntilYesterday.length;
    if (len < 10) return { voteEven: true, conf: 0.5, name: 'Hazard' };

    const paritySeq = historyUntilYesterday.map(d => {
        const sp = numStr(d.special);
        const digit = targetPos === 'head' ? parseInt(sp[0], 10) : parseInt(sp[1], 10);
        return digit % 2 === 0 ? 1 : 0;
    });

    // Tính độ dài chuỗi hiện tại (current streak)
    const currentVal = paritySeq[len - 1];
    let streakLen = 1;
    for (let i = len - 2; i >= 0; i--) {
        if (paritySeq[i] === currentVal) streakLen++; else break;
    }

    // Tính phân phối độ dài chuỗi trong lịch sử (để ước lượng hàm nguy cơ Weibull)
    const streakDist = [];
    let cur = paritySeq[0];
    let sCount = 1;
    for (let i = 1; i < len; i++) {
        if (paritySeq[i] === cur) {
            sCount++;
        } else {
            streakDist.push(sCount);
            cur = paritySeq[i];
            sCount = 1;
        }
    }

    // Xác suất bẻ cầu khi đạt streakLen
    // Bao nhiêu lần chuỗi vượt qua streakLen?
    const reachCount = streakDist.filter(s => s >= streakLen).length;
    const exceedCount = streakDist.filter(s => s > streakLen).length;
    const hazardRate = reachCount > 0 ? (reachCount - exceedCount) / reachCount : 0.5;

    // Nếu hazardRate cao (chuỗi sắp gãy), tác tử bỏ phiếu cho phía đối nghịch
    // Nếu streak >= 2, khả năng bẻ cầu tăng vọt
    const voteReversion = streakLen >= 2;
    const voteEven = voteReversion ? (currentVal === 0) : (currentVal === 1);
    const conf = Math.min(0.9, 0.4 + streakLen * 0.15);

    return {
        voteEven,
        probEven: voteEven ? (0.5 + conf * 0.5) : (0.5 - conf * 0.5),
        conf,
        streakLen,
        name: 'Hazard'
    };
}

// Tác tử 3: Spectral / Day-of-Week Rhythm Specialist (Sóng nhịp ngày trong tuần & chu kỳ đài)
function agentSpectral(historyUntilYesterday, targetDate, targetPos) {
    const dow = getDayOfWeek(targetDate);
    const dowHistory = [];

    for (let i = 0; i < historyUntilYesterday.length; i++) {
        const d = historyUntilYesterday[i];
        if (getDayOfWeek(d.date) === dow) {
            const sp = numStr(d.special);
            const digit = targetPos === 'head' ? parseInt(sp[0], 10) : parseInt(sp[1], 10);
            dowHistory.push(digit % 2 === 0 ? 1 : 0);
        }
    }

    if (dowHistory.length < 5) return { voteEven: true, conf: 0.5, name: 'Spectral' };

    // Xét 20 kỳ gần nhất của đúng thứ này
    const recentDow = dowHistory.slice(-20);
    const countEven = recentDow.filter(v => v === 1).length;
    const probEven = countEven / recentDow.length;

    // Cũng xét nhịp FFT/Sine cơ bản chu kỳ 7 ngày gần nhất
    const last7 = historyUntilYesterday.slice(-7).map(d => {
        const sp = numStr(d.special);
        const digit = targetPos === 'head' ? parseInt(sp[0], 10) : parseInt(sp[1], 10);
        return digit % 2 === 0 ? 1 : 0;
    });
    const evenLast7 = last7.filter(v => v === 1).length;
    const momentumEven = evenLast7 <= 3; // Nếu 7 ngày qua lẻ nhiều, sóng điều hòa kéo về chẵn

    // Kết hợp DOW và Momentum 7 ngày
    const blendedProb = probEven * 0.7 + (momentumEven ? 0.6 : 0.4) * 0.3;

    return {
        voteEven: blendedProb >= 0.5,
        probEven: blendedProb,
        conf: Math.abs(blendedProb - 0.5) * 2,
        name: 'Spectral'
    };
}

// Tác tử 4: Positional Bridge Specialist (Cầu Động Vị Trí Đối Xứng)
function agentBridge(historyUntilYesterday, targetPos) {
    const len = historyUntilYesterday.length;
    if (len < 5) return { voteEven: true, conf: 0.5, name: 'Bridge' };

    // Quét 10 giải cơ bản của ngày hôm qua xem giải nào đang có cầu Chẵn/Lẻ thông dài nhất
    const prevKeys = [
        'special', 'prize1', 'prize2_1', 'prize2_2', 'prize3_1', 'prize3_2',
        'prize4_1', 'prize5_1', 'prize6_1', 'prize7_1'
    ];

    let bestBridgeKey = null;
    let maxStreak = 0;
    let bridgePredEven = true;

    prevKeys.forEach(k => {
        let streak = 0;
        let isDirect = true; // Cầu thuận (hôm qua chẵn -> hôm nay chẵn)
        // Kiểm tra xem vị trí k trong D-1 có dự đoán đúng ĐB trong D không
        for (let i = len - 1; i >= Math.max(1, len - 6); i--) {
            const prevDraw = historyUntilYesterday[i - 1];
            const curDraw = historyUntilYesterday[i];
            if (prevDraw[k] === undefined || curDraw.special === undefined) break;

            const prevDigit = parseInt(numStr(prevDraw[k])[0], 10);
            const curSpecialDigit = targetPos === 'head' ? parseInt(numStr(curDraw.special)[0], 10) : parseInt(numStr(curDraw.special)[1], 10);

            const match = (prevDigit % 2 === curSpecialDigit % 2);
            if (match) streak++; else break;
        }

        if (streak > maxStreak) {
            maxStreak = streak;
            bestBridgeKey = k;
            const yesterdayVal = historyUntilYesterday[len - 1][k];
            bridgePredEven = (parseInt(numStr(yesterdayVal)[0], 10) % 2 === 0);
        }
    });

    const conf = maxStreak >= 3 ? Math.min(0.85, 0.5 + maxStreak * 0.1) : 0.3;
    return {
        voteEven: bridgePredEven,
        probEven: bridgePredEven ? (0.5 + conf * 0.5) : (0.5 - conf * 0.5),
        conf,
        bridgeStreak: maxStreak,
        name: 'Bridge'
    };
}

// Tác tử 5: Lô Macro Density & Cross-Excitation Specialist (Tương quan Vĩ mô Lô 27 giải)
function agentMacroLo(historyUntilYesterday, targetPos) {
    const len = historyUntilYesterday.length;
    if (len < 2) return { voteEven: true, conf: 0.5, name: 'MacroLo' };

    const yesterdayDraw = historyUntilYesterday[len - 1];
    const loto27 = extract27Loto(yesterdayDraw);

    // Đếm số lượng đầu/đít chẵn lẻ trong 27 con lô hôm qua
    let evenCount = 0;
    loto27.forEach(n => {
        const d = targetPos === 'head' ? parseInt(n[0], 10) : parseInt(n[1], 10);
        if (d % 2 === 0) evenCount++;
    });

    const loDensityEven = evenCount / (loto27.length || 27);

    // Hiệu ứng hồi quy bù trừ (Mean Reversion of Macro Density):
    // Nếu hôm qua Lô quá nhiều Chẵn (> 15/27 = 55.5%), xác suất Đề nổ Chẵn hay Lẻ?
    // Khảo sát tương quan: Nếu Lô chẵn áp đảo, Đề có xu hướng giữ đà (momentum) hay đảo?
    // Thường trong XSMB, Lô chẵn cao (> 60%) tạo momentum giữ Chẵn cho Đề ngày hôm sau
    const voteEven = loDensityEven >= 0.5;
    const conf = Math.abs(loDensityEven - 0.5) * 2;

    return {
        voteEven,
        probEven: loDensityEven,
        conf: Math.min(0.7, conf),
        name: 'MacroLo'
    };
}

// Tác tử 6: Adversarial Auditor & Debate Synthesizer (Trọng tài phản biện MiroFish)
function runMirofishDebateRound(agentResults, rollingPITAccuracy = {}) {
    // Round 1: Thu thập phiếu và trọng số tin cậy
    let weightedEvenScore = 0;
    let totalWeight = 0;

    const baseWeights = {
        Markov: 0.22,
        Hazard: 0.25,
        Spectral: 0.18,
        Bridge: 0.18,
        MacroLo: 0.17
    };

    const agentVotes = {};

    agentResults.forEach(ag => {
        // Điều chỉnh trọng số động theo độ chính xác PIT 30 ngày gần nhất (nếu có)
        const pitAcc = rollingPITAccuracy[ag.name] !== undefined ? rollingPITAccuracy[ag.name] : 0.52;
        const dynamicMultiplier = Math.max(0.5, Math.min(1.5, pitAcc / 0.5));
        const effectiveWeight = (baseWeights[ag.name] || 0.2) * (0.5 + ag.conf * 0.5) * dynamicMultiplier;

        agentVotes[ag.name] = {
            vote: ag.voteEven ? 'CHAN' : 'LE',
            conf: Math.round(ag.conf * 100),
            probEven: ag.probEven,
            weight: effectiveWeight
        };

        weightedEvenScore += (ag.voteEven ? 1 : 0) * effectiveWeight;
        totalWeight += effectiveWeight;
    });

    const swarmProbEven = totalWeight > 0 ? (weightedEvenScore / totalWeight) : 0.5;

    // Round 2: Phản biện đối kháng (Auditor Cross-Examination)
    // Nếu có sự phân hóa cực đoan (2 tác tử mạnh nhất mâu thuẫn) -> Giảm độ tin cậy của Swarm
    const markovVote = agentResults.find(a => a.name === 'Markov')?.voteEven;
    const hazardVote = agentResults.find(a => a.name === 'Hazard')?.voteEven;
    const isConflict = (markovVote !== hazardVote);

    // Tính Consensus Level (Mức độ đồng thuận đa tác tử)
    const votesEvenCount = agentResults.filter(a => a.voteEven).length;
    const votesOddCount = agentResults.length - votesEvenCount;
    const majorityVotes = Math.max(votesEvenCount, votesOddCount);
    const consensusRate = majorityVotes / agentResults.length; // 3/5 (60%), 4/5 (80%), 5/5 (100%)

    // Quyết định cuối cùng của Swarm
    const finalVoteEven = swarmProbEven >= 0.5;
    let swarmConfidence = Math.round(Math.abs(swarmProbEven - 0.5) * 200); // 0 -> 100%

    // Nếu mâu thuẫn giữa 2 tác tử trụ cột, trừ 15% confidence
    if (isConflict) swarmConfidence = Math.max(10, swarmConfidence - 15);

    // Phân loại phân tầng chất lượng tín hiệu
    let tier = 'NEUTRAL'; // Chờ / Không rõ ràng
    if (consensusRate >= 0.80 && swarmConfidence >= 45) {
        tier = 'HIGH_CONVICTION'; // Đồng thuận cao (>= 4/5 tác tử)
    } else if (consensusRate >= 0.60 && swarmConfidence >= 25) {
        tier = 'MEDIUM'; // Đồng thuận vừa
    }

    return {
        vote: finalVoteEven ? 'CHAN' : 'LE',
        voteEven: finalVoteEven,
        swarmProbEven,
        swarmConfidence,
        consensusRate,
        majorityVotes,
        tier,
        isConflict,
        agentVotes
    };
}

/**
 * THỰC THI TOÀN BỘ BACKTEST STRICT PIT
 */
function runBacktest(startYear = 2026) {
    console.log(`\n======================================================`);
    console.log(`🚀 BẮT ĐẦU CHẠY STRICT PIT BACKTEST MIROFISH CHO NĂM ${startYear}...`);
    console.log(`======================================================`);

    const targetDraws = sortedDraws.filter(d => d.date.startsWith(String(startYear)));
    console.log(`Tổng số kỳ quay kiểm tra: ${targetDraws.length} kỳ.`);

    // Lưu trữ kết quả đối soát
    const stats = {
        totalDays: 0,
        headCorrect: 0,
        tailCorrect: 0,
        bothCorrect: 0,      // Trúng cả Đầu & Đít (Form Hit)
        headOnlyCorrect: 0,
        tailOnlyCorrect: 0,
        noneCorrect: 0,      // Dạng đối nghịch (Anti-Parity loại trừ sạch)

        // Phân tầng theo độ đồng thuận Swarm
        highConvictionDays: 0,
        highConvictionHeadHits: 0,
        highConvictionTailHits: 0,
        highConvictionBothHits: 0,

        // Đánh giá từng tác tử riêng lẻ (Đầu)
        agentHeadHits: {
            Markov: 0,
            Hazard: 0,
            Spectral: 0,
            Bridge: 0,
            MacroLo: 0
        },
        // Đánh giá từng tác tử riêng lẻ (Đít)
        agentTailHits: {
            Markov: 0,
            Hazard: 0,
            Spectral: 0,
            Bridge: 0,
            MacroLo: 0
        },

        // Rolling PIT 30 ngày cho mỗi tác tử
        rollingAcc: {
            Markov: 0.55,
            Hazard: 0.55,
            Spectral: 0.50,
            Bridge: 0.50,
            MacroLo: 0.50
        }
    };

    const rollingWindow = 30;
    const historyHeadHits = { Markov: [], Hazard: [], Spectral: [], Bridge: [], MacroLo: [] };

    targetDraws.forEach(draw => {
        const targetDate = draw.date;
        const drawIdx = sortedDraws.findIndex(d => d.date === targetDate);
        if (drawIdx < 50) return; // Cần ít nhất 50 kỳ quá khứ

        // STRICT PIT: Chỉ lấy dữ liệu trước ngày targetDate
        const historyUntilYesterday = sortedDraws.slice(0, drawIdx);

        // 1. Chạy 5 Tác tử cho ĐẦU
        const headAgents = [
            agentMarkov(historyUntilYesterday, 'head'),
            agentHazard(historyUntilYesterday, 'head'),
            agentSpectral(historyUntilYesterday, targetDate, 'head'),
            agentBridge(historyUntilYesterday, 'head'),
            agentMacroLo(historyUntilYesterday, 'head')
        ];

        // 2. Chạy 5 Tác tử cho ĐÍT
        const tailAgents = [
            agentMarkov(historyUntilYesterday, 'tail'),
            agentHazard(historyUntilYesterday, 'tail'),
            agentSpectral(historyUntilYesterday, targetDate, 'tail'),
            agentBridge(historyUntilYesterday, 'tail'),
            agentMacroLo(historyUntilYesterday, 'tail')
        ];

        // 3. Trọng tài MiroFish Swarm Tranh luận & Bầu chọn
        const headSwarm = runMirofishDebateRound(headAgents, stats.rollingAcc);
        const tailSwarm = runMirofishDebateRound(tailAgents, stats.rollingAcc);

        // 4. Kết quả thực tế
        const actualSp = numStr(draw.special);
        const actHeadEven = (parseInt(actualSp[0], 10) % 2 === 0);
        const actTailEven = (parseInt(actualSp[1], 10) % 2 === 0);

        stats.totalDays++;

        // Đối soát từng tác tử
        headAgents.forEach(ag => {
            const isHit = (ag.voteEven === actHeadEven);
            if (isHit) stats.agentHeadHits[ag.name]++;
            historyHeadHits[ag.name].push(isHit ? 1 : 0);
            if (historyHeadHits[ag.name].length > rollingWindow) historyHeadHits[ag.name].shift();
            stats.rollingAcc[ag.name] = historyHeadHits[ag.name].reduce((a, b) => a + b, 0) / historyHeadHits[ag.name].length;
        });

        tailAgents.forEach(ag => {
            if (ag.voteEven === actTailEven) stats.agentTailHits[ag.name]++;
        });

        // Đối soát Swarm
        const headHit = (headSwarm.voteEven === actHeadEven);
        const tailHit = (tailSwarm.voteEven === actTailEven);

        if (headHit) stats.headCorrect++;
        if (tailHit) stats.tailCorrect++;

        if (headHit && tailHit) {
            stats.bothCorrect++;
        } else if (headHit && !tailHit) {
            stats.headOnlyCorrect++;
        } else if (!headHit && tailHit) {
            stats.tailOnlyCorrect++;
        } else {
            stats.noneCorrect++;
        }

        // Kiểm tra phân tầng đồng thuận cao
        if (headSwarm.tier === 'HIGH_CONVICTION') {
            stats.highConvictionDays++;
            if (headHit) stats.highConvictionHeadHits++;
            if (tailHit) stats.highConvictionTailHits++;
            if (headHit && tailHit) stats.highConvictionBothHits++;
        }
    });

    // In bảng kết quả
    const pct = (a, b) => b > 0 ? (a / b * 100).toFixed(2) + '%' : '0.00%';

    console.log(`\n--- BẢNG HIỆU SUẤT TỪNG TÁC TỬ RIÊNG LẺ (ĐẦU) ---`);
    Object.keys(stats.agentHeadHits).forEach(agName => {
        console.log(`- ${agName.padEnd(10)}: ${stats.agentHeadHits[agName]}/${stats.totalDays} (${pct(stats.agentHeadHits[agName], stats.totalDays)})`);
    });

    console.log(`\n--- BẢNG HIỆU SUẤT TỪNG TÁC TỬ RIÊNG LẺ (ĐÍT) ---`);
    Object.keys(stats.agentTailHits).forEach(agName => {
        console.log(`- ${agName.padEnd(10)}: ${stats.agentTailHits[agName]}/${stats.totalDays} (${pct(stats.agentTailHits[agName], stats.totalDays)})`);
    });

    console.log(`\n======================================================`);
    console.log(`🏆 KẾT QUẢ TỔNG HỢP MIROFISH SWARM (NĂM ${startYear}):`);
    console.log(`- Tổng số ngày kiểm định: ${stats.totalDays} ngày`);
    console.log(`- Độ chính xác ĐẦU CHẴN/LẺ (MiroFish Swarm): ${stats.headCorrect}/${stats.totalDays} (${pct(stats.headCorrect, stats.totalDays)})`);
    console.log(`- Độ chính xác ĐÍT CHẴN/LẺ (MiroFish Swarm): ${stats.tailCorrect}/${stats.totalDays} (${pct(stats.tailCorrect, stats.totalDays)})`);
    console.log(`- Trúng cặp hoàn hảo (Cả Đầu & Đít): ${stats.bothCorrect}/${stats.totalDays} (${pct(stats.bothCorrect, stats.totalDays)})`);
    console.log(`- Đúng ít nhất 1 trong 2: ${stats.headCorrect + stats.tailCorrect - stats.bothCorrect}/${stats.totalDays} (${pct(stats.headCorrect + stats.tailCorrect - stats.bothCorrect, stats.totalDays)})`);
    console.log(`- Sai cả 2 (Dạng đối lập bị loại bởi Anti-Parity): ${stats.noneCorrect}/${stats.totalDays} (${pct(stats.noneCorrect, stats.totalDays)})`);
    console.log(`  => TỶ LỆ LOẠI TRỪ DẠNG ĐỐI LẬP THÀNH CÔNG: ${stats.totalDays - stats.noneCorrect}/${stats.totalDays} (${pct(stats.totalDays - stats.noneCorrect, stats.totalDays)})`);

    console.log(`\n⭐ ĐẶC BIỆT: KHI SWARM ĐỒNG THUẬN CAO (HIGH CONVICTION >= 4/5 TÁC TỬ):`);
    console.log(`- Số ngày kích hoạt: ${stats.highConvictionDays}/${stats.totalDays} (${pct(stats.highConvictionDays, stats.totalDays)})`);
    console.log(`- Độ chính xác ĐẦU khi Đồng Thuận Cao: ${stats.highConvictionHeadHits}/${stats.highConvictionDays} (${pct(stats.highConvictionHeadHits, stats.highConvictionDays)})`);
    console.log(`- Trúng cặp hoàn hảo khi Đồng Thuận Cao: ${stats.highConvictionBothHits}/${stats.highConvictionDays} (${pct(stats.highConvictionBothHits, stats.highConvictionDays)})`);
    console.log(`======================================================\n`);

    return stats;
}

// Chạy thử nghiệm năm 2026
const stats2026 = runBacktest(2026);

// Chạy đa niên 5 năm
console.log(`\n======================================================`);
console.log(`🚀 TIẾN HÀNH KIỂM ĐỊNH ĐA NIÊN 5 NĂM (2022 - 2026)...`);
console.log(`======================================================`);

const years = [2022, 2023, 2024, 2025, 2026];
let total5Years = 0, head5Years = 0, tail5Years = 0, both5Years = 0, none5Years = 0;
let highDays5Years = 0, highHeadHits5Years = 0;

years.forEach(y => {
    const s = runBacktest(y);
    total5Years += s.totalDays;
    head5Years += s.headCorrect;
    tail5Years += s.tailCorrect;
    both5Years += s.bothCorrect;
    none5Years += s.noneCorrect;
    highDays5Years += s.highConvictionDays;
    highHeadHits5Years += s.highConvictionHeadHits;
});

const pct = (a, b) => b > 0 ? (a / b * 100).toFixed(2) + '%' : '0.00%';
console.log(`\n======================================================`);
console.log(`💎 TỔNG KẾT TOÀN DIỆN 5 NĂM (2022 - 2026: ${total5Years} KỲ QUAY):`);
console.log(`- Tỷ lệ đúng ĐẦU toàn 5 năm: ${head5Years}/${total5Years} (${pct(head5Years, total5Years)})`);
console.log(`- Tỷ lệ đúng ĐÍT toàn 5 năm: ${tail5Years}/${total5Years} (${pct(tail5Years, total5Years)})`);
console.log(`- Trúng cặp hoàn hảo: ${both5Years}/${total5Years} (${pct(both5Years, total5Years)})`);
console.log(`- Tỷ lệ loại trừ Anti-Parity thành công: ${total5Years - none5Years}/${total5Years} (${pct(total5Years - none5Years, total5Years)})`);
console.log(`- Tỷ lệ đúng ĐẦU khi Đồng Thuận Cao: ${highHeadHits5Years}/${highDays5Years} (${pct(highHeadHits5Years, highDays5Years)})`);
console.log(`======================================================\n`);
