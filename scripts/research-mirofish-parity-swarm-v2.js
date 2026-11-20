'use strict';

/**
 * scripts/research-mirofish-parity-swarm-v2.js
 * 
 * KHẢO SÁT CHUYÊN SÂU: ÁP DỤNG MIROFISH SWARM CONSENSUS LÊN TỔNG HỢP CÁC ĐỘNG CƠ HỆ THỐNG
 * 
 * Kiểm tra xem khi kết hợp MiroFish Swarm Intelligence (GraphRAG, Multi-Agent Debate,
 * Dynamic PIT Accuracy Multiplier, Conflict Penalty) trên các động cơ Đề & Lô thực tế
 * thì có nâng độ chính xác Đầu / Đít Chẵn Lẻ vượt qua mốc 56.5% của Optimal Hybrid không?
 */

const fs = require('fs');
const path = require('path');

const cache = JSON.parse(fs.readFileSync(path.join(__dirname, '../lib/data/statistics/cached_daily_method_advisor.json'), 'utf8'));

const prizesByDate = cache.drawPrizesByDate || {};
const sortedDates = Object.keys(prizesByDate).filter(d => d.startsWith('2026') && prizesByDate[d] && prizesByDate[d].special !== undefined).sort();

console.log(`[Init] Nạp thành công ${sortedDates.length} kỳ quay năm 2026 từ cache.`);

const numStr = val => String(Number(val)).padStart(2, '0');
const isEvenDigit = d => parseInt(d, 10) % 2 === 0;

// Trích xuất danh sách số của từng động cơ
const deMarkovMap = {};
(cache.deMarkovGapHazard?.settledLedger || []).forEach(r => { if (r?.date) deMarkovMap[r.date] = r.numbers || r.rankedNumbers || []; });

const pentaCoreMap = {};
(cache.pentaCoreDe?.settledLedger || []).forEach(r => { if (r?.date) pentaCoreMap[r.date] = r.numbers || r.rankedNumbers || []; });

const triCoreMap = {};
(cache.triCoreDe?.allDaysLedger || []).forEach(r => { if (r?.date) triCoreMap[r.date] = r.numbers || r.rankedNumbers || []; });
(cache.triCoreDe?.settledLedger || []).forEach(r => { if (r?.date) triCoreMap[r.date] = r.numbers || r.rankedNumbers || []; });

const semanticMap = {};
(cache.semanticResonanceSuite?.settledLedger || []).forEach(r => { if (r?.date) semanticMap[r.date] = r.de?.numbers36 || r.de?.numbers || []; });

// Hàm tính Parity từ danh sách số
function getParityFromList(list) {
    let hC = 0, hL = 0, tC = 0, tL = 0;
    list.forEach(n => {
        const s = numStr(n);
        if (isEvenDigit(s[0])) hC++; else hL++;
        if (isEvenDigit(s[1])) tC++; else tL++;
    });
    const tot = list.length || 1;
    return {
        predHead: hC >= hL,
        headConf: Math.round((Math.max(hC, hL) / tot) * 100),
        predTail: tC >= tL,
        tailConf: Math.round((Math.max(tC, tL) / tot) * 100)
    };
}

/**
 * 6 AGENTS CỦA MIROFISH PARITY SWARM
 */
const AGENT_CONFIGS = [
    { id: 'Markov', name: 'Tác Tử Markov Hạt Nhân', weight: 0.22 },
    { id: 'Penta', name: 'Tác Tử Ngũ Trụ AI', weight: 0.20 },
    { id: 'TriCore', name: 'Tác Tử Tri-Core 24s', weight: 0.18 },
    { id: 'Resonance', name: 'Tác Tử Sóng Nhịp Điều Hòa', weight: 0.15 },
    { id: 'StreakAuditor', name: 'Tác Tử Kiểm Toán Sóng & Gan', weight: 0.25 }
];

const rollingWindow = 30;
const agentHistoryHead = { Markov: [], Penta: [], TriCore: [], Resonance: [], StreakAuditor: [] };
const agentHistoryTail = { Markov: [], Penta: [], TriCore: [], Resonance: [], StreakAuditor: [] };

// Bảng thống kê
let totalDays = 0;
let headHitsSwarm = 0;
let tailHitsSwarm = 0;
let bothHitsSwarm = 0;
let oppFormElimHits = 0;

// Phân tầng theo độ đồng thuận Swarm
const consensusTiers = {
    high: { days: 0, headHits: 0, tailHits: 0, bothHits: 0 },   // >= 4/5 tác tử đồng thuận (80%+)
    medium: { days: 0, headHits: 0, tailHits: 0, bothHits: 0 }, // 3/5 tác tử đồng thuận (60%)
};

// Theo dõi từng tác tử
const agentStats = {
    Markov: { head: 0, tail: 0 },
    Penta: { head: 0, tail: 0 },
    TriCore: { head: 0, tail: 0 },
    Resonance: { head: 0, tail: 0 },
    StreakAuditor: { head: 0, tail: 0 },
    OptimalHybridBaseline: { head: 0, tail: 0, both: 0 }
};

sortedDates.forEach((targetDate, idx) => {
    const actualSp = numStr(prizesByDate[targetDate].special);
    const actHeadEven = isEvenDigit(actualSp[0]);
    const actTailEven = isEvenDigit(actualSp[1]);

    // 1. Lấy đề xuất của từng động cơ (Strict PIT)
    const markovNums = deMarkovMap[targetDate] || [];
    const pentaNums = pentaCoreMap[targetDate] || [];
    const triNums = triCoreMap[targetDate] || [];
    const semNums = semanticMap[targetDate] || [];

    const pMarkov = getParityFromList(markovNums.length ? markovNums : ['00']);
    const pPenta = getParityFromList(pentaNums.length ? pentaNums : ['00']);
    const pTri = getParityFromList(triNums.length ? triNums : ['00']);
    const pSem = getParityFromList(semNums.length ? semNums : ['00']);

    // 2. Tác tử Streak Auditor
    let streakPredHead = true, streakPredTail = true;
    let streakHCount = 1, streakTCount = 1;
    if (idx > 0) {
        const prevSp = numStr(prizesByDate[sortedDates[idx - 1]].special);
        const prevHIsEven = isEvenDigit(prevSp[0]);
        const prevTIsEven = isEvenDigit(prevSp[1]);

        for (let i = idx - 2; i >= 0; i--) {
            const sp = numStr(prizesByDate[sortedDates[i]].special);
            if (isEvenDigit(sp[0]) === prevHIsEven) streakHCount++; else break;
        }
        for (let i = idx - 2; i >= 0; i--) {
            const sp = numStr(prizesByDate[sortedDates[i]].special);
            if (isEvenDigit(sp[1]) === prevTIsEven) streakTCount++; else break;
        }
        streakPredHead = streakHCount >= 2 ? !prevHIsEven : prevHIsEven;
        streakPredTail = streakTCount >= 2 ? !prevTIsEven : prevTIsEven;
    }

    const pStreak = {
        predHead: streakPredHead,
        headConf: Math.min(85, 50 + streakHCount * 10),
        predTail: streakPredTail,
        tailConf: Math.min(85, 50 + streakTCount * 10)
    };

    // Baseline Optimal Hybrid
    const optHead = streakHCount >= 3 ? streakPredHead : pMarkov.predHead;
    const optTail = pPenta.predTail; // Chú ý: dùng đúng pentaCoreDe cho Đít!
    const isOptHeadHit = optHead === actHeadEven;
    const isOptTailHit = optTail === actTailEven;
    if (isOptHeadHit) agentStats.OptimalHybridBaseline.head++;
    if (isOptTailHit) agentStats.OptimalHybridBaseline.tail++;
    if (isOptHeadHit && isOptTailHit) agentStats.OptimalHybridBaseline.both++;

    // 3. MIROFISH SWARM DEBATE & DYNAMIC WEIGHTING
    const agentsHead = [
        { id: 'Markov', vote: pMarkov.predHead, conf: pMarkov.headConf / 100 },
        { id: 'Penta', vote: pPenta.predHead, conf: pPenta.headConf / 100 },
        { id: 'TriCore', vote: pTri.predHead, conf: pTri.headConf / 100 },
        { id: 'Resonance', vote: pSem.predHead, conf: pSem.headConf / 100 },
        { id: 'StreakAuditor', vote: pStreak.predHead, conf: pStreak.headConf / 100 }
    ];

    const agentsTail = [
        { id: 'Markov', vote: pMarkov.predTail, conf: pMarkov.tailConf / 100 },
        { id: 'Penta', vote: pPenta.predTail, conf: pPenta.tailConf / 100 },
        { id: 'TriCore', vote: pTri.predTail, conf: pTri.tailConf / 100 },
        { id: 'Resonance', vote: pSem.predTail, conf: pSem.tailConf / 100 },
        { id: 'StreakAuditor', vote: pStreak.predTail, conf: pStreak.tailConf / 100 }
    ];

    // Cập nhật thống kê từng tác tử
    agentsHead.forEach(a => {
        const isHit = a.vote === actHeadEven;
        if (isHit) agentStats[a.id].head++;
        agentHistoryHead[a.id].push(isHit ? 1 : 0);
        if (agentHistoryHead[a.id].length > rollingWindow) agentHistoryHead[a.id].shift();
    });

    agentsTail.forEach(a => {
        const isHit = a.vote === actTailEven;
        if (isHit) agentStats[a.id].tail++;
        agentHistoryTail[a.id].push(isHit ? 1 : 0);
        if (agentHistoryTail[a.id].length > rollingWindow) agentHistoryTail[a.id].shift();
    });

    // Hàm thực hiện bầu chọn đa tác tử MiroFish
    function executeSwarmVote(agents, history) {
        let weightedScore = 0;
        let totalW = 0;
        let votesEven = 0;

        agents.forEach(a => {
            const hist = history[a.id] || [];
            const rollingAcc = hist.length > 5 ? (hist.reduce((s, v) => s + v, 0) / hist.length) : 0.52;
            const dynamicMultiplier = Math.max(0.6, Math.min(1.4, rollingAcc / 0.5));
            const baseW = AGENT_CONFIGS.find(c => c.id === a.id)?.weight || 0.2;
            const w = baseW * (0.5 + a.conf * 0.5) * dynamicMultiplier;

            if (a.vote) {
                weightedScore += w;
                votesEven++;
            }
            totalW += w;
        });

        const probEven = totalW > 0 ? (weightedScore / totalW) : 0.5;
        const consensusCount = Math.max(votesEven, agents.length - votesEven);
        const isHighConsensus = consensusCount >= 4;

        return {
            voteEven: probEven >= 0.5,
            probEven,
            consensusCount,
            isHighConsensus
        };
    }

    const swarmHead = executeSwarmVote(agentsHead, agentHistoryHead);
    const swarmTail = executeSwarmVote(agentsTail, agentHistoryTail);

    totalDays++;

    const isHeadHit = swarmHead.voteEven === actHeadEven;
    const isTailHit = swarmTail.voteEven === actTailEven;
    const isBothHit = isHeadHit && isTailHit;
    const isNoneHit = !isHeadHit && !isTailHit;

    if (isHeadHit) headHitsSwarm++;
    if (isTailHit) tailHitsSwarm++;
    if (isBothHit) bothHitsSwarm++;
    if (!isNoneHit) oppFormElimHits++;

    if (swarmHead.isHighConsensus) {
        consensusTiers.high.days++;
        if (isHeadHit) consensusTiers.high.headHits++;
        if (isTailHit) consensusTiers.high.tailHits++;
        if (isBothHit) consensusTiers.high.bothHits++;
    } else {
        consensusTiers.medium.days++;
        if (isHeadHit) consensusTiers.medium.headHits++;
        if (isTailHit) consensusTiers.medium.tailHits++;
        if (isBothHit) consensusTiers.medium.bothHits++;
    }
});

const pct = (a, b) => b > 0 ? (a / b * 100).toFixed(2) + '%' : '0.00%';

console.log(`\n======================================================`);
console.log(`📊 ĐỐI SOÁT HIỆU SUẤT TỪNG TÁC TỬ RIÊNG LẺ (299 KỲ NĂM 2026):`);
console.log(`------------------------------------------------------`);
console.log(`- Markov Hạt Nhân      : Đầu ${agentStats.Markov.head}/${totalDays} (${pct(agentStats.Markov.head, totalDays)}) | Đít ${agentStats.Markov.tail}/${totalDays} (${pct(agentStats.Markov.tail, totalDays)})`);
console.log(`- Ngũ Trụ AI (Penta)   : Đầu ${agentStats.Penta.head}/${totalDays} (${pct(agentStats.Penta.head, totalDays)}) | Đít ${agentStats.Penta.tail}/${totalDays} (${pct(agentStats.Penta.tail, totalDays)})`);
console.log(`- Tri-Core 24s         : Đầu ${agentStats.TriCore.head}/${totalDays} (${pct(agentStats.TriCore.head, totalDays)}) | Đít ${agentStats.TriCore.tail}/${totalDays} (${pct(agentStats.TriCore.tail, totalDays)})`);
console.log(`- Sóng Nhịp Điều Hòa   : Đầu ${agentStats.Resonance.head}/${totalDays} (${pct(agentStats.Resonance.head, totalDays)}) | Đít ${agentStats.Resonance.tail}/${totalDays} (${pct(agentStats.Resonance.tail, totalDays)})`);
console.log(`- Streak Auditor       : Đầu ${agentStats.StreakAuditor.head}/${totalDays} (${pct(agentStats.StreakAuditor.head, totalDays)}) | Đít ${agentStats.StreakAuditor.tail}/${totalDays} (${pct(agentStats.StreakAuditor.tail, totalDays)})`);
console.log(`------------------------------------------------------`);
console.log(`👑 BASELINE HIỆN TẠI (Optimal Hybrid):`);
console.log(`- Đầu: ${agentStats.OptimalHybridBaseline.head}/${totalDays} (${pct(agentStats.OptimalHybridBaseline.head, totalDays)})`);
console.log(`- Đít: ${agentStats.OptimalHybridBaseline.tail}/${totalDays} (${pct(agentStats.OptimalHybridBaseline.tail, totalDays)})`);
console.log(`- Cặp Hoàn Hảo (Đầu & Đít): ${agentStats.OptimalHybridBaseline.both}/${totalDays} (${pct(agentStats.OptimalHybridBaseline.both, totalDays)})`);

console.log(`\n======================================================`);
console.log(`🚀 KẾT QUẢ MIROFISH SWARM CONSENSUS (NĂM 2026):`);
console.log(`------------------------------------------------------`);
console.log(`- Độ chính xác ĐẦU CHẴN/LẺ : ${headHitsSwarm}/${totalDays} (${pct(headHitsSwarm, totalDays)})`);
console.log(`- Độ chính xác ĐÍT CHẴN/LẺ : ${tailHitsSwarm}/${totalDays} (${pct(tailHitsSwarm, totalDays)})`);
console.log(`- Trúng cặp hoàn hảo       : ${bothHitsSwarm}/${totalDays} (${pct(bothHitsSwarm, totalDays)})`);
console.log(`- Loại trừ Anti-Parity (25s): ${oppFormElimHits}/${totalDays} (${pct(oppFormElimHits, totalDays)})`);

console.log(`\n🔥 KHI MIROFISH SWARM ĐỒNG THUẬN CAO (>= 4/5 TÁC TỬ CÙNG HƯỚNG):`);
console.log(`- Số kỳ kích hoạt: ${consensusTiers.high.days}/${totalDays} (${pct(consensusTiers.high.days, totalDays)})`);
console.log(`- Độ chính xác ĐẦU khi Đồng Thuận Cao: ${consensusTiers.high.headHits}/${consensusTiers.high.days} (${pct(consensusTiers.high.headHits, consensusTiers.high.days)})`);
console.log(`- Độ chính xác ĐÍT khi Đồng Thuận Cao: ${consensusTiers.high.tailHits}/${consensusTiers.high.days} (${pct(consensusTiers.high.tailHits, consensusTiers.high.days)})`);
console.log(`- Trúng cặp hoàn hảo khi Đồng Thuận Cao: ${consensusTiers.high.bothHits}/${consensusTiers.high.days} (${pct(consensusTiers.high.bothHits, consensusTiers.high.days)})`);
console.log(`======================================================\n`);
