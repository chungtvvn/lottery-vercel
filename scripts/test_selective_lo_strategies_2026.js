const fs = require('fs');
const path = require('path');

const advPath = path.join(__dirname, '../lib/data/statistics/cached_daily_method_advisor.json');
const adv = JSON.parse(fs.readFileSync(advPath, 'utf8'));

const qmbfLedger = adv.loQuantumBayesFusion?.settledLedger || [];
const lo4Ledger = adv.lo4EngineFusion?.modes?.top6?.settledLedger || [];
const lo4Ledger7 = adv.lo4EngineFusion?.modes?.top7?.settledLedger || [];

const BASE_UNIT_STAKE = 2200; // 100đ = 2.2M (K)
const BASE_UNIT_PAYOUT = 8000; // 100đ ăn 8.0M (K)
const M3_RATIO = 25 / 100;

// Map QMBF by date
const qmbfMap = new Map();
qmbfLedger.forEach(r => qmbfMap.set(r.date, r));

// Map LO4 by date
const lo4Map = new Map();
lo4Ledger.forEach(r => lo4Map.set(r.date, r));

const dates = lo4Ledger.map(r => r.date).filter(d => qmbfMap.has(d));
console.log('Khảo sát số ngày chung:', dates.length);

// Helper to calc stats
function evaluateStrategy(name, decisionFn) {
    let days = 0;
    let hitDays = 0;
    let winDays = 0;
    let lossDays = 0;
    let totalHits = 0;
    let totalStakeK = 0;
    let totalPayoutK = 0;
    let curLossStreak = 0;
    let maxLossStreak = 0;
    let curWinStreak = 0;
    let maxWinStreak = 0;

    let p1ChosenDays = 0; // 4 Động Cơ
    let p2ChosenDays = 0; // Nền Tảng

    let totalNumsBet = 0;

    dates.forEach((date, idx) => {
        days++;
        const qRow = qmbfMap.get(date);
        const l4Row = lo4Map.get(date);

        // Previous history for decision making (STRICT PIT)
        const prevDates = dates.slice(0, idx);

        // Decision: returns { methodType: '4ENGINE' | 'PLATFORM', numbers: [...], multipliers: [...] or stakeK, payoutK, hits }
        const decision = decisionFn({
            date,
            idx,
            prevDates,
            qRow,
            l4Row,
            qmbfMap,
            lo4Map
        });

        if (decision.chosenMethod === '4ENGINE') p1ChosenDays++;
        else p2ChosenDays++;

        const sK = decision.stakeK;
        const pK = decision.payoutK;
        const h = decision.hits;
        const prK = pK - sK;

        totalStakeK += sK;
        totalPayoutK += pK;
        totalHits += h;
        totalNumsBet += decision.betCount;

        if (h > 0) hitDays++;

        if (prK > 0) {
            winDays++;
            curWinStreak++;
            curLossStreak = 0;
            if (curWinStreak > maxWinStreak) maxWinStreak = curWinStreak;
        } else {
            lossDays++;
            curLossStreak++;
            curWinStreak = 0;
            if (curLossStreak > maxLossStreak) maxLossStreak = curLossStreak;
        }
    });

    const profitK = totalPayoutK - totalStakeK;
    const roi = totalStakeK > 0 ? (profitK / totalStakeK) : 0;
    const dailyStakeK = totalStakeK / days;
    const avgNums = totalNumsBet / days;

    return {
        name,
        days,
        p1ChosenDays,
        p2ChosenDays,
        p1Pct: ((p1ChosenDays / days) * 100).toFixed(1) + '%',
        p2Pct: ((p2ChosenDays / days) * 100).toFixed(1) + '%',
        avgNums: avgNums.toFixed(1),
        dailyStakeVIP_M: (dailyStakeK / 1000).toFixed(1),
        dailyStakeM3_M: (dailyStakeK * M3_RATIO / 1000).toFixed(2),
        winRate: ((winDays / days) * 100).toFixed(1) + '%',
        hitDayRate: ((hitDays / days) * 100).toFixed(1) + '%',
        avgHits: (totalHits / days).toFixed(2),
        totalStakeVIP_M: (totalStakeK / 1000).toFixed(1),
        profitVIP_M: (profitK / 1000).toFixed(1),
        profitM3_M: (profitK * M3_RATIO / 1000).toFixed(2),
        roi: (roi * 100).toFixed(1) + '%',
        maxLossStreak,
        maxWinStreak
    };
}

// -------------------------------------------------------------
// Helper to get platform outcome
function getPlatformOutcome(qRow, tier) {
    const betCount = parseInt(tier.replace('top', ''), 10);
    const m = qRow.methods?.[tier];
    const hits = m?.hits || 0;
    const stakeK = betCount * BASE_UNIT_STAKE;
    const payoutK = hits * BASE_UNIT_PAYOUT;
    return {
        chosenMethod: 'PLATFORM',
        tier,
        betCount,
        hits,
        stakeK,
        payoutK
    };
}

// Helper to get 4Engine outcomes:
// Mode A: Consensus Only (multiplier gốc)
function get4EngineConsensusMultiplier(l4Row) {
    let stakeK = 0;
    let payoutK = 0;
    let hits = 0;
    let count = 0;
    (l4Row.betNumbers || []).forEach(bn => {
        if (bn.votes >= 2) {
            count++;
            stakeK += bn.multiplier * BASE_UNIT_STAKE;
            payoutK += bn.hits * bn.multiplier * BASE_UNIT_PAYOUT;
            hits += bn.hits;
        }
    });
    return {
        chosenMethod: '4ENGINE',
        betCount: count,
        hits,
        stakeK,
        payoutK
    };
}

// Mode B: Consensus Flat 1x (cực rẻ)
function get4EngineConsensusFlat(l4Row) {
    let stakeK = 0;
    let payoutK = 0;
    let hits = 0;
    let count = 0;
    (l4Row.betNumbers || []).forEach(bn => {
        if (bn.votes >= 2) {
            count++;
            stakeK += 1 * BASE_UNIT_STAKE;
            payoutK += bn.hits * 1 * BASE_UNIT_PAYOUT;
            hits += bn.hits;
        }
    });
    return {
        chosenMethod: '4ENGINE',
        betCount: count,
        hits,
        stakeK,
        payoutK
    };
}

// Mode C: Full 4-Engine (hiện tại)
function get4EngineFull(l4Row) {
    return {
        chosenMethod: '4ENGINE',
        betCount: l4Row.allNumbers?.length || 12,
        hits: l4Row.dayLotoHits || 0,
        stakeK: l4Row.dayLotoStakeK || 0,
        payoutK: l4Row.dayLotoPayoutK || 0
    };
}

// -------------------------------------------------------------
// Test Various Strategies:

const strategies = [];

// Base 1: Đánh cố định Nền Tảng Top 7
strategies.push(evaluateStrategy('1. Chuẩn Cố Định: Nền Tảng Top 7 (15.4M)', ctx => {
    return getPlatformOutcome(ctx.qRow, 'top7');
}));

// Base 2: Đánh cố định Nền Tảng Top 10
strategies.push(evaluateStrategy('2. Chuẩn Cố Định: Nền Tảng Top 10 (22.0M)', ctx => {
    return getPlatformOutcome(ctx.qRow, 'top10');
}));

// Base 3: Đánh cố định Nền Tảng Top 20 (Mỏ Neo)
strategies.push(evaluateStrategy('3. Chuẩn Cố Định: Nền Tảng Top 20 (44.0M)', ctx => {
    return getPlatformOutcome(ctx.qRow, 'top20');
}));

// Base 4: Đánh cố định 4 Động Cơ Full (67.5M)
strategies.push(evaluateStrategy('4. Chuẩn Cố Định: 4 Động Cơ Full (67.5M)', ctx => {
    return get4EngineFull(ctx.l4Row);
}));

// Base 5: Đánh cố định 4 Động Cơ Flat 1x Đồng Thuận (14.6M)
strategies.push(evaluateStrategy('5. Chuẩn Cố Định: 4 Động Cơ Flat Đồng Thuận (14.6M)', ctx => {
    return get4EngineConsensusFlat(ctx.l4Row);
}));

// Strategy S1: Ngưỡng Đồng Thuận (Consensus Threshold).
// Nếu số lượng số đồng thuận (votes >= 2) trong khoảng [4, 7]: Đánh 4 Động Cơ Flat Đồng Thuận.
// Ngược lại (quá ít < 4 hoặc quá phân tán > 7): Đánh Nền Tảng Top 7.
strategies.push(evaluateStrategy('S1. Chọn Lọc Theo Ngưỡng Đồng Thuận (Consensus 4-7 -> 4ĐC Flat, else -> Top 7)', ctx => {
    const consensusCount = (ctx.l4Row.numbersOver2 || []).length;
    if (consensusCount >= 4 && consensusCount <= 7) {
        return get4EngineConsensusFlat(ctx.l4Row);
    } else {
        return getPlatformOutcome(ctx.qRow, 'top7');
    }
}));

// Strategy S2: Ngưỡng Đồng Thuận với Multiplier
strategies.push(evaluateStrategy('S2. Chọn Lọc Theo Đồng Thuận Mạnh (Consensus >= 4 -> 4ĐC Multiplier, else -> Top 7)', ctx => {
    const consensusCount = (ctx.l4Row.numbersOver2 || []).length;
    if (consensusCount >= 4) {
        return get4EngineConsensusMultiplier(ctx.l4Row);
    } else {
        return getPlatformOutcome(ctx.qRow, 'top7');
    }
}));

// Strategy S3: Tối Thiểu Chi Phí Tuyệt Đối (Chi Phí Siêu Thấp <= 15.4M)
// So sánh giữa [4 Động Cơ Flat] vs [Nền Tảng Top 6 / Top 7].
// Chọn bên nào có số lượng số ÍT HƠN và tập trung hơn để chi phí thấp nhất!
strategies.push(evaluateStrategy('S3. Tối Thiểu Chi Phí: Chọn Dàn Số Lượng Thấp Hơn (4ĐC Flat vs Top 7)', ctx => {
    const consensusCount = (ctx.l4Row.numbersOver2 || []).length;
    // Nếu 4ĐC chỉ có 2-6 con đồng thuận -> đánh 4ĐC Flat (vốn chỉ 4.4M - 13.2M)
    // Nếu 4ĐC có >= 7 con đồng thuận -> đánh Nền Tảng Top 7 (vốn 15.4M)
    if (consensusCount >= 2 && consensusCount <= 6) {
        return get4EngineConsensusFlat(ctx.l4Row);
    } else {
        return getPlatformOutcome(ctx.qRow, 'top7');
    }
}));

// Strategy S4: Tối Thiểu Chi Phí Kết Hợp Top 10 (Bảo Vệ Vốn Cao)
// Nếu consensusCount 3-7 -> 4ĐC Flat (vốn ~11M)
// Nếu không -> Nền Tảng Top 10 (vốn 22M, win rate 80%, nổ 99.6%)
strategies.push(evaluateStrategy('S4. An Toàn Cao: Consensus 3-7 -> 4ĐC Flat, else -> Top 10', ctx => {
    const consensusCount = (ctx.l4Row.numbersOver2 || []).length;
    if (consensusCount >= 3 && consensusCount <= 7) {
        return get4EngineConsensusFlat(ctx.l4Row);
    } else {
        return getPlatformOutcome(ctx.qRow, 'top10');
    }
}));

// Strategy S5: Dynamic Momentum (Theo Nhịp Phong Độ Gần Nhất 3 Kỳ)
strategies.push(evaluateStrategy('S5. Theo Phong Độ (Nếu 4ĐC vừa trượt -> Đổi sang Top 7, nếu đang ăn -> Giữ 4ĐC Flat)', ctx => {
    if (ctx.idx === 0) return getPlatformOutcome(ctx.qRow, 'top7');
    const lastDate = ctx.prevDates[ctx.prevDates.length - 1];
    const lastL4 = ctx.lo4Map.get(lastDate);
    const lastL4Won = (lastL4?.dayLotoPayoutK || 0) > (lastL4?.dayLotoStakeK || 0);

    if (lastL4Won) {
        // Đang có đà thắng -> Tiếp tục đánh 4 Động Cơ Flat
        return get4EngineConsensusFlat(ctx.l4Row);
    } else {
        // Vừa trượt -> Đổi sang Nền Tảng Top 7 phục hồi
        return getPlatformOutcome(ctx.qRow, 'top7');
    }
}));

console.log('\n=== KẾT QUẢ SO SÁNH CÁC CHIẾN LƯỢC CHỌN 1 TRONG 2 MỖI NGÀY ===');
console.table(strategies.map(s => ({
    'Chiến Lược': s.name,
    'P1 (4ĐC)': s.p1Pct,
    'P2 (Nền Tảng)': s.p2Pct,
    'Số Con/Ngày': s.avgNums,
    'Vốn VIP/Ngày': s.dailyStakeVIP_M + 'M',
    'Vốn M3/Ngày': s.dailyStakeM3_M + 'M',
    'Win Rate': s.winRate,
    'Tỷ Lệ Nổ': s.hitDayRate,
    'Nháy/Ngày': s.avgHits,
    'Lãi VIP': s.profitVIP_M + 'M',
    'Lãi M3': s.profitM3_M + 'M',
    'ROI': s.roi,
    'Chuỗi Thua Max': s.maxLossStreak
})));

