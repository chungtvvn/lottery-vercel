'use strict';

/**
 * scripts/research-mirofish-parity-betting-roi.js
 * 
 * ĐO LƯỜNG TÁC ĐỘNG TÀI CHÍNH (PNL & ROI):
 * KHI TÍCH HỢP MIROFISH PARITY SWARM VÀO TRICORE VÀ ĐỀ TINH GỌN SWEET-SPOT
 * 
 * Kiểm tra:
 * 1. Đánh thường tất cả các ngày
 * 2. Đánh chiến thuật linh hoạt (Dynamic Tactical Mode):
 *    - Ngày High Conviction (>= 4/5 tác tử): Dồn hỏa lực X2 cho Cùng Đầu, loại bỏ hoàn toàn dạng đối lập (Anti-Parity).
 *    - Ngày Medium/Deadlock (3/2 tác tử): Chuyển về Đánh Thường (Bảo thủ, không lọc hoặc hạ cược).
 */

const fs = require('fs');
const path = require('path');

const cache = JSON.parse(fs.readFileSync(path.join(__dirname, '../lib/data/statistics/cached_daily_method_advisor.json'), 'utf8'));
const prizesByDate = cache.drawPrizesByDate || {};
const sortedDates = Object.keys(prizesByDate).filter(d => d.startsWith('2026') && prizesByDate[d] && prizesByDate[d].special !== undefined).sort();

const numStr = val => String(Number(val)).padStart(2, '0');
const isEvenDigit = d => parseInt(d, 10) % 2 === 0;

const deMarkovMap = {};
(cache.deMarkovGapHazard?.settledLedger || []).forEach(r => { if (r?.date) deMarkovMap[r.date] = r.numbers || r.rankedNumbers || []; });

const pentaCoreMap = {};
(cache.pentaCoreDe?.settledLedger || []).forEach(r => { if (r?.date) pentaCoreMap[r.date] = r.numbers || r.rankedNumbers || []; });

const triCoreMap = {};
(cache.triCoreDe?.allDaysLedger || []).forEach(r => { if (r?.date) triCoreMap[r.date] = r.numbers || r.rankedNumbers || []; });
(cache.triCoreDe?.settledLedger || []).forEach(r => { if (r?.date) triCoreMap[r.date] = r.numbers || r.rankedNumbers || []; });

const semanticMap = {};
(cache.semanticResonanceSuite?.settledLedger || []).forEach(r => { if (r?.date) semanticMap[r.date] = r.de?.numbers36 || r.de?.numbers || []; });

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

// Bảng kết quả mô phỏng
const strategies = {
    tricore_baseline_flat: { name: 'TriCore 24s Gốc (Đánh phẳng)', costK: 0, pnlK: 0, wins: 0, days: 0 },
    tricore_static_hybrid: { name: 'TriCore 24s + Optimal Hybrid Cố Định', costK: 0, pnlK: 0, winsX2: 0, winsX1: 0, wins: 0, days: 0 },
    tricore_mirofish_dynamic: { name: 'TriCore 24s + MIROFISH DYNAMIC SWARM 🚀', costK: 0, pnlK: 0, winsX2: 0, winsX1: 0, wins: 0, days: 0 },
    
    sweetspot17_baseline: { name: 'Đề Tinh Gọn 17s Gốc (12 X2 + 5 X1)', costK: 0, pnlK: 0, winsX2: 0, winsX1: 0, wins: 0, days: 0 },
    sweetspot17_mirofish_dynamic: { name: 'Đề Tinh Gọn 17s + MIROFISH DYNAMIC SWARM 🚀', costK: 0, pnlK: 0, winsX2: 0, winsX1: 0, wins: 0, days: 0 }
};

const AGENT_CONFIGS = [
    { id: 'Markov', weight: 0.22 },
    { id: 'Penta', weight: 0.20 },
    { id: 'TriCore', weight: 0.18 },
    { id: 'Resonance', weight: 0.15 },
    { id: 'StreakAuditor', weight: 0.25 }
];

const agentHistoryHead = { Markov: [], Penta: [], TriCore: [], Resonance: [], StreakAuditor: [] };

sortedDates.forEach((targetDate, idx) => {
    const actualSp = numStr(prizesByDate[targetDate].special);
    const actHeadEven = isEvenDigit(actualSp[0]);
    const actTailEven = isEvenDigit(actualSp[1]);

    const markovNums = (deMarkovMap[targetDate] || []).map(numStr);
    const pentaNums = (pentaCoreMap[targetDate] || []).map(numStr);
    const triNums = (triCoreMap[targetDate] || []).map(numStr);
    const semNums = (semanticMap[targetDate] || []).map(numStr);

    if (triNums.length < 24) return;

    const pMarkov = getParityFromList(markovNums.length ? markovNums : ['00']);
    const pPenta = getParityFromList(pentaNums.length ? pentaNums : ['00']);
    const pTri = getParityFromList(triNums.length ? triNums : ['00']);
    const pSem = getParityFromList(semNums.length ? semNums : ['00']);

    let streakPredHead = true, streakHCount = 1;
    if (idx > 0) {
        const prevSp = numStr(prizesByDate[sortedDates[idx - 1]].special);
        const prevHIsEven = isEvenDigit(prevSp[0]);
        for (let i = idx - 2; i >= 0; i--) {
            const sp = numStr(prizesByDate[sortedDates[i]].special);
            if (isEvenDigit(sp[0]) === prevHIsEven) streakHCount++; else break;
        }
        streakPredHead = streakHCount >= 2 ? !prevHIsEven : prevHIsEven;
    }
    const pStreak = { predHead: streakPredHead, headConf: Math.min(85, 50 + streakHCount * 10) };

    const agentsHead = [
        { id: 'Markov', vote: pMarkov.predHead, conf: pMarkov.headConf / 100 },
        { id: 'Penta', vote: pPenta.predHead, conf: pPenta.headConf / 100 },
        { id: 'TriCore', vote: pTri.predHead, conf: pTri.headConf / 100 },
        { id: 'Resonance', vote: pSem.predHead, conf: pSem.headConf / 100 },
        { id: 'StreakAuditor', vote: pStreak.predHead, conf: pStreak.headConf / 100 }
    ];

    let weightedScore = 0, totalW = 0, votesEven = 0;
    agentsHead.forEach(a => {
        const hist = agentHistoryHead[a.id] || [];
        const rollingAcc = hist.length > 5 ? (hist.reduce((s, v) => s + v, 0) / hist.length) : 0.52;
        const dynamicMultiplier = Math.max(0.6, Math.min(1.4, rollingAcc / 0.5));
        const baseW = AGENT_CONFIGS.find(c => c.id === a.id)?.weight || 0.2;
        const w = baseW * (0.5 + a.conf * 0.5) * dynamicMultiplier;
        if (a.vote) { weightedScore += w; votesEven++; }
        totalW += w;
    });

    const probEven = totalW > 0 ? (weightedScore / totalW) : 0.5;
    const consensusCount = Math.max(votesEven, agentsHead.length - votesEven);
    const isHighConsensus = consensusCount >= 4;
    const swarmPredHeadEven = probEven >= 0.5;

    // Cập nhật rolling history
    agentsHead.forEach(a => {
        const isHit = a.vote === actHeadEven;
        agentHistoryHead[a.id].push(isHit ? 1 : 0);
        if (agentHistoryHead[a.id].length > 30) agentHistoryHead[a.id].shift();
    });

    // 1. TriCore Gốc: 24 số, chia 12 X2 (2000K) + 12 X1 (1000K)
    const tri24 = triNums.slice(0, 24);
    const triTop12 = tri24.slice(0, 12);
    const triBot12 = tri24.slice(12, 24);
    const costTriFlat = 12 * 2000 + 12 * 1000; // 36,000K/ngày
    const hitTriX2 = triTop12.includes(actualSp);
    const hitTriX1 = triBot12.includes(actualSp);
    const winTriFlat = hitTriX2 || hitTriX1;
    const payoutTriFlat = hitTriX2 ? 168000 : (hitTriX1 ? 84000 : 0);

    strategies.tricore_baseline_flat.days++;
    strategies.tricore_baseline_flat.costK += costTriFlat;
    strategies.tricore_baseline_flat.pnlK += (payoutTriFlat - costTriFlat);
    if (winTriFlat) strategies.tricore_baseline_flat.wins++;

    // 2. TriCore Optimal Hybrid Cố Định (Lọc Anti-Parity mọi ngày)
    // Giả định oppForm là dạng đối lập của swarm
    const oppHeadEven = !swarmPredHeadEven;
    // Cùng Đầu: LL + LC (nếu đoán L) hoặc CC + CL (nếu đoán C)
    const triSameHead = tri24.filter(n => isEvenDigit(n[0]) === swarmPredHeadEven);
    const triOppHead = tri24.filter(n => isEvenDigit(n[0]) !== swarmPredHeadEven);
    // Phương án B: Cùng Đầu đánh X2, Còn lại đánh X1
    const costStatic = triSameHead.length * 2000 + triOppHead.length * 1000;
    const hitSameHead = triSameHead.includes(actualSp);
    const hitOppHead = triOppHead.includes(actualSp);
    const payoutStatic = hitSameHead ? 168000 : (hitOppHead ? 84000 : 0);

    strategies.tricore_static_hybrid.days++;
    strategies.tricore_static_hybrid.costK += costStatic;
    strategies.tricore_static_hybrid.pnlK += (payoutStatic - costStatic);
    if (hitSameHead) strategies.tricore_static_hybrid.winsX2++;
    if (hitOppHead) strategies.tricore_static_hybrid.winsX1++;
    if (hitSameHead || hitOppHead) strategies.tricore_static_hybrid.wins++;

    // 3. TriCore MIROFISH DYNAMIC SWARM:
    // Nếu High Consensus (>= 4/5 tác tử): Dồn hỏa lực X2 cho Cùng Đầu, CẮT BỎ hoàn toàn dạng đối lập!
    // Nếu Medium / Đấu đá (3/2): Đánh phẳng an toàn (hoặc bảo tồn vốn, đánh X1 toàn bộ)
    let costDynamic = 0, payoutDynamic = 0, isDynHitX2 = false, isDynHitX1 = false;
    if (isHighConsensus) {
        // High conviction: Cùng Đầu đánh X2 (2000K), giữ Cùng Đít đánh X1, CẮT Anti-Parity
        const filteredSameHead = triSameHead; // ~12 số
        costDynamic = filteredSameHead.length * 2000;
        if (filteredSameHead.includes(actualSp)) {
            payoutDynamic = 168000;
            isDynHitX2 = true;
        }
    } else {
        // Đấu đá: Đánh thường bảo thủ toàn bộ X1 (1000K/số)
        costDynamic = tri24.length * 1000; // 24,000K
        if (tri24.includes(actualSp)) {
            payoutDynamic = 84000;
            isDynHitX1 = true;
        }
    }

    strategies.tricore_mirofish_dynamic.days++;
    strategies.tricore_mirofish_dynamic.costK += costDynamic;
    strategies.tricore_mirofish_dynamic.pnlK += (payoutDynamic - costDynamic);
    if (isDynHitX2) strategies.tricore_mirofish_dynamic.winsX2++;
    if (isDynHitX1) strategies.tricore_mirofish_dynamic.winsX1++;
    if (isDynHitX2 || isDynHitX1) strategies.tricore_mirofish_dynamic.wins++;

    // 4. ĐỀ TINH GỌN SWEET-SPOT 17S
    // Gốc 17s: 12 Top cược X2, 5 Bot cược X1
    const p5Nums = [...markovNums, ...pentaNums, ...triNums];
    const freq = {};
    p5Nums.forEach(n => { freq[n] = (freq[n] || 0) + 1; });
    const sortedNums = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
    const sweet17 = sortedNums.slice(0, 17);
    const sweet12 = sweet17.slice(0, 12);
    const sweet5 = sweet17.slice(12, 17);

    const costSweetBase = 12 * 2000 + 5 * 1000; // 29,000K
    const hitSweetX2 = sweet12.includes(actualSp);
    const hitSweetX1 = sweet5.includes(actualSp);
    const payoutSweetBase = hitSweetX2 ? 168000 : (hitSweetX1 ? 84000 : 0);

    strategies.sweetspot17_baseline.days++;
    strategies.sweetspot17_baseline.costK += costSweetBase;
    strategies.sweetspot17_baseline.pnlK += (payoutSweetBase - costSweetBase);
    if (hitSweetX2) strategies.sweetspot17_baseline.winsX2++;
    if (hitSweetX1) strategies.sweetspot17_baseline.winsX1++;
    if (hitSweetX2 || hitSweetX1) strategies.sweetspot17_baseline.wins++;

    // 5. ĐỀ TINH GỌN + MIROFISH DYNAMIC SWARM
    let costSwarmSweet = 0, payoutSwarmSweet = 0, hitSwarmSweetX2 = false, hitSwarmSweetX1 = false;
    if (isHighConsensus) {
        // High consensus: Lọc bỏ số không cùng đầu, dồn hỏa lực 12 số cùng đầu cược X2
        const sameHeadSweet = sweet17.filter(n => isEvenDigit(n[0]) === swarmPredHeadEven);
        const playSweet = sameHeadSweet.slice(0, 12);
        costSwarmSweet = playSweet.length * 2000;
        if (playSweet.includes(actualSp)) {
            payoutSwarmSweet = 168000;
            hitSwarmSweetX2 = true;
        }
    } else {
        // Neutral: Đánh phẳng 15s (1000K/số) để phòng thủ vốn
        const safe15 = sweet17.slice(0, 15);
        costSwarmSweet = safe15.length * 1000;
        if (safe15.includes(actualSp)) {
            payoutSwarmSweet = 84000;
            hitSwarmSweetX1 = true;
        }
    }

    strategies.sweetspot17_mirofish_dynamic.days++;
    strategies.sweetspot17_mirofish_dynamic.costK += costSwarmSweet;
    strategies.sweetspot17_mirofish_dynamic.pnlK += (payoutSwarmSweet - costSwarmSweet);
    if (hitSwarmSweetX2) strategies.sweetspot17_mirofish_dynamic.winsX2++;
    if (hitSwarmSweetX1) strategies.sweetspot17_mirofish_dynamic.winsX1++;
    if (hitSwarmSweetX2 || hitSwarmSweetX1) strategies.sweetspot17_mirofish_dynamic.wins++;
});

const fmtM = k => (k / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + 'M';
const pct = (a, b) => (a / b * 100).toFixed(2) + '%';

console.log(`\n======================================================`);
console.log(`💰 SO SÁNH HIỆU QUẢ TÀI CHÍNH KHI ÁP DỤNG MIROFISH SWARM (2026):`);
console.log(`======================================================`);

Object.keys(strategies).forEach(k => {
    const s = strategies[k];
    const roi = (s.pnlK / s.costK * 100).toFixed(2);
    console.log(`\n📌 ${s.name}`);
    console.log(`   - Số ngày đánh       : ${s.days} ngày`);
    console.log(`   - Tổng vốn cược      : ${fmtM(s.costK)}`);
    console.log(`   - LÃI RÒNG           : ${fmtM(s.pnlK)} (ROI: ${roi}%)`);
    console.log(`   - Tổng kỳ trúng      : ${s.wins} kỳ (${pct(s.wins, s.days)})`);
    if (s.winsX2 !== undefined) {
        console.log(`   - Ăn cược X2 (168M)  : ${s.winsX2} kỳ | Ăn cược X1 (84M): ${s.winsX1 || 0} kỳ`);
    }
});
console.log(`\n======================================================\n`);
