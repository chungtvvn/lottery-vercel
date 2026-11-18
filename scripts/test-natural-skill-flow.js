'use strict';

const fs = require('fs');
const path = require('path');
const deTinhGonService = require('../lib/services/deTinhGonService');
const deFusionService = require('../lib/services/deFusionService');

const { numStr, getParityForm } = deFusionService;
const fusionRep = deFusionService.getDeFusionReport();
const ledger = (fusionRep.settledLedger || []).sort((a, b) => a.date.localeCompare(b.date));

console.log('--- KHẢO SÁT CÁC CƠ CHẾ DÙNG SKILL THEO ĐÚNG NHỊP THAO TÁC THƯỜNG ---');

// Thao tác thường:
// Phần lớn thời gian là "BẮN THƯỜNG" (Đánh đều tay, cược phẳng 1M trên dàn Sweet-Spot 15s hoặc TriCore).
// "DÙNG SKILL" chỉ diễn ra khi có điều kiện ĐẶC BIỆT THỰC SỰ:
// Ví dụ:
// Mode 1: Chỉ dùng skill khi intSameHead >= 3 (Hội tụ cực cao ~ 30-40% số ngày)
// Mode 2: Dùng skill khi intSameHead >= 2 VÀ sau khi trượt 1 ngày (nhịp hồi sau cooldown)
// Mode 3: Dùng skill khi intSameHead >= 2 VÀ parityHeadConf >= 60%

function simulateFlow(name, triggerFn, skillStakeFn, normalStakeFn) {
    let skillDays = 0, normalDays = 0;
    let skillWins = 0, normalWins = 0;
    let skillStakeK = 0, skillPayK = 0;
    let normalStakeK = 0, normalPayK = 0;
    let cooldownDays = 0;
    let lossStreak = 0;

    ledger.filter(r => r.date <= '2026-10-30').forEach(row => {
        const actualStr = numStr(row.actualSpecial);
        const pPred = row.parityPrediction || {};
        const pForm = pPred.predForm || 'LL';
        const pHead = pForm[0];
        const headConf = pPred.headConf || 50;

        const triS = row.strategies?.triCore;
        const ai5S = row.strategies?.ai5Ensemble;
        if (!triS || !ai5S || !triS.filteredNumbers) return;

        const triFiltered = triS.filteredNumbers || [];
        const ssExt = deTinhGonService.extractSweetSpotFromFiltered(ai5S.filteredTop, ai5S.filteredBot);
        const ss15Pool = ssExt.pool15 || [];
        const ss17Pool = ssExt.pool17 || [];

        const triSet = new Set(triFiltered);
        const intersect = ss17Pool.filter(n => triSet.has(n));
        const headSplit = deTinhGonService.splitByHeadTail(triFiltered, pForm);

        const intSameHead = intersect.filter(n => getParityForm(n)[0] === pHead);
        const triSameHeadRest = headSplit.sameHead.filter(n => !intSameHead.includes(n));
        const triSameTail = headSplit.sameTail;

        const ctx = {
            intSameHead,
            triSameHeadRest,
            triSameTail,
            ss15Pool,
            ss17Pool,
            headConf,
            cooldownDays,
            lossStreak,
            actualStr
        };

        const isSkill = triggerFn(ctx);

        if (isSkill) {
            skillDays++;
            const res = skillStakeFn(ctx);
            skillStakeK += res.stakeK;
            skillPayK += res.payoutK;
            if (res.isWin) {
                skillWins++;
                lossStreak = 0;
                cooldownDays = 1; // Sau khi dùng skill thắng -> vào cooldown 1 ngày đánh thường
            } else {
                lossStreak++;
                cooldownDays = 0;
            }
        } else {
            normalDays++;
            const res = normalStakeFn(ctx);
            normalStakeK += res.stakeK;
            normalPayK += res.payoutK;
            if (res.isWin) {
                normalWins++;
                lossStreak = 0;
            } else {
                lossStreak++;
            }
            if (cooldownDays > 0) cooldownDays--;
        }
    });

    const totStake = skillStakeK + normalStakeK;
    const totPay = skillPayK + normalPayK;
    const totProfit = totPay - totStake;
    const totWins = skillWins + normalWins;
    const totalDays = skillDays + normalDays;

    console.log(`\n▶ [${name}]`);
    console.log(`   🔥 DÙNG SKILL: ${skillDays} ngày (${((skillDays/totalDays)*100).toFixed(1)}%) | Trúng: ${skillWins}/${skillDays} (${((skillWins/skillDays)*100).toFixed(1)}%) | Lãi: +${Math.round((skillPayK-skillStakeK)/1000)}M (ROI: ${(((skillPayK-skillStakeK)/skillStakeK)*100).toFixed(1)}%)`);
    console.log(`   🛡️ BẮN THƯỜNG: ${normalDays} ngày (${((normalDays/totalDays)*100).toFixed(1)}%) | Trúng: ${normalWins}/${normalDays} (${((normalWins/normalDays)*100).toFixed(1)}%) | Lãi: +${Math.round((normalPayK-normalStakeK)/1000)}M (ROI: ${(((normalPayK-normalStakeK)/normalStakeK)*100).toFixed(1)}%)`);
    console.log(`   🌟 TỔNG CẢ NĂM: Cược: ${Math.round(totStake/1000)}M | Thắng: ${Math.round(totPay/1000)}M | LÃI: +${Math.round(totProfit/1000)}M | ROI: +${((totProfit/totStake)*100).toFixed(1)}% | Win: ${totWins}/${totalDays} (${((totWins/totalDays)*100).toFixed(1)}%)`);
}

// Hàm cược Skill Tri-Tier: X3 intSameHead, X2 triSameHeadRest, X1 triSameTail
const skillTriTier = (ctx) => {
    const { intSameHead, triSameHeadRest, triSameTail, actualStr } = ctx;
    const hitX3 = intSameHead.includes(actualStr);
    const hitX2 = !hitX3 && triSameHeadRest.includes(actualStr);
    const hitX1 = !hitX3 && !hitX2 && triSameTail.includes(actualStr);
    const stakeK = intSameHead.length * 3000 + triSameHeadRest.length * 2000 + triSameTail.length * 1000;
    const payoutK = hitX3 ? (3000 * 84) : (hitX2 ? (2000 * 84) : (hitX1 ? (1000 * 84) : 0));
    return { isWin: hitX3 || hitX2 || hitX1, stakeK, payoutK };
};

// Hàm cược Thường: Sweet-Spot 15s phẳng 1M
const normalSS15 = (ctx) => {
    const { ss15Pool, actualStr } = ctx;
    const hit = ss15Pool.includes(actualStr);
    const stakeK = ss15Pool.length * 1000;
    const payoutK = hit ? (1000 * 84) : 0;
    return { isWin: hit, stakeK, payoutK };
};

// 1. Dùng skill chỉ khi có siêu hội tụ >= 3 số Cùng Đầu (Bắn thường ~60%, Dùng skill ~40%)
simulateFlow('1. Siêu Hội Tụ (intSameHead >= 3 số)', 
    ctx => ctx.intSameHead.length >= 3,
    skillTriTier,
    normalSS15
);

// 2. Hội tụ >= 2 số VÀ không trong cooldown (sau khi ăn skill thì nghỉ 1 ngày bắn thường)
simulateFlow('2. Hội tụ >= 2 số & Có Cooldown (Sau khi nổ skill thì quay về bắn thường giữ lãi)', 
    ctx => ctx.intSameHead.length >= 2 && ctx.cooldownDays === 0,
    skillTriTier,
    normalSS15
);

// 3. Hội tụ >= 2 số VÀ sau khi trượt >= 1 ngày (Bắt nhịp đàn hồi)
simulateFlow('3. Hội tụ >= 2 số & Sau khi trượt >= 1 ngày (Bắn thường cầm chừng, trượt mới dồn skill)', 
    ctx => ctx.intSameHead.length >= 2 && ctx.lossStreak >= 1,
    skillTriTier,
    normalSS15
);

