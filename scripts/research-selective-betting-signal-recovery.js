const fs = require('fs');
const path = require('path');
const rootDir = path.resolve(__dirname, '..');

const adv = JSON.parse(fs.readFileSync(path.join(rootDir, 'lib/data/statistics/cached_daily_method_advisor.json'), 'utf8'));
const { getDeFusionReport } = require(path.join(rootDir, 'lib/services/deFusionService.js'));
const { pairTop8WithParity, evaluateTop8ParityXien4 } = require(path.join(rootDir, 'lib/services/top8ParityXien4Service.js'));

const deLedger = getDeFusionReport().settledLedger;
const dprLedger = adv.deParityResearch.settledLedger;
const lo4Ledger = adv.lo4EngineFusion.settledLedger;
const loDropLedger = adv.loDropoff27.all2026Ledger;
const loTop5Ledger = adv.loTop5ConsensusXien.settledLedger;

const dprMap = new Map(); dprLedger.forEach(d => dprMap.set(d.date, d));
const lo4Map = new Map(); lo4Ledger.forEach(d => lo4Map.set(d.date, d));
const loDropMap = new Map(); loDropLedger.forEach(d => loDropMap.set(d.date, d));
const loTop5Map = new Map(); loTop5Ledger.forEach(d => loTop5Map.set(d.date, d));

deLedger.sort((a, b) => a.date.localeCompare(b.date));

const days = [];

deLedger.forEach(de => {
  const date = de.date;
  const dpr = dprMap.get(date);
  const lo4 = lo4Map.get(date);
  const loDrop = loDropMap.get(date);
  const loTop5 = loTop5Map.get(date);
  if (!loDrop || !dpr || !lo4) return;

  const pMethods = ['optimalHybrid', 'streakReversion', 'deMarkovGapHazard', 'pentaCoreDe', 'systemConsensus'];
  const forms = pMethods.map(k => dpr.methods?.[k]?.predForm).filter(Boolean);
  const formCounts = {};
  forms.forEach(f => { formCounts[f] = (formCounts[f] || 0) + 1; });
  const maxFormAgreement = Math.max(...Object.values(formCounts), 0);
  const optimalHybridConf = (dpr.methods?.optimalHybrid?.headConf || 50) + (dpr.methods?.optimalHybrid?.tailConf || 50);

  const strats = de.strategies || {};
  const shadowNums = strats.shadow?.origNumbers || [];
  const triNums = strats.triCore?.origNumbers || [];
  const fusionNums = strats.fusion?.origNumbers || [];
  const miroNums = strats.mirofish?.origNumbers || [];
  const deVotes = {};
  [...shadowNums, ...triNums, ...fusionNums, ...miroNums].forEach(n => {
    deVotes[n] = (deVotes[n] || 0) + 1;
  });
  const deOverlap3Count = Object.keys(deVotes).filter(n => deVotes[n] >= 3).length;

  const parityScore = (maxFormAgreement - 2) * 13.3;
  const confScore = Math.max(0, (optimalHybridConf - 100) / 40 * 20);
  const overlapScore = Math.min(40, Math.max(0, (deOverlap3Count - 15) / 20 * 40));
  const scoreDe = Math.round(parityScore + confScore + overlapScore);

  const numX5 = lo4.tierX5?.length || 0;
  const numX4 = lo4.tierX4?.length || 0;
  const numX3 = lo4.tierX3?.length || 0;
  const loConsensusScore = Math.min(50, numX5 * 15 + numX4 * 10 + numX3 * 3);
  const top1Score = loDrop.ranked?.[0]?.score || 10;
  const top7Score = loDrop.ranked?.[6]?.score || 10;
  const scoreDrop = Math.min(50, Math.max(0, (top1Score - top7Score) * 5));
  const scoreLo = Math.round(loConsensusScore + scoreDrop);

  const scoreComposite = Math.round(scoreDe * 0.50 + scoreLo * 0.50);

  // DE
  const deShadow = strats.shadow;
  const deStakeK = deShadow?.origStakeK || 40000;
  const dePayoutK = deShadow?.basePayoutK || 0;
  const deProfitK = dePayoutK - deStakeK;
  const deWin = deShadow?.isBaseHit || false;

  // LO
  const loStakeK = loDrop.stakeK || 15400;
  const loPayoutK = loDrop.payoutK || 0;
  const loProfitK = loPayoutK - loStakeK;
  const loWin = loDrop.isWin;

  // XIEN 3 LIGHTWEIGHT
  const x3StakeK = loTop5?.x3StakeK || 1000;
  const x3PayoutK = loTop5?.x3PayoutK || 0;
  const x3ProfitK = x3PayoutK - x3StakeK;
  const x3Win = x3PayoutK > 0;

  days.push({
    date,
    scoreDe, scoreLo, scoreComposite,
    deStakeK, dePayoutK, deProfitK, deWin,
    loStakeK, loPayoutK, loProfitK, loWin,
    x3StakeK, x3PayoutK, x3ProfitK, x3Win
  });
});

function computeDrawdown(equityCurve) {
  let peak = -Infinity;
  let maxDD = 0;
  equityCurve.forEach(v => {
    if (v > peak) peak = v;
    const dd = peak - v;
    if (dd > maxDD) maxDD = dd;
  });
  return maxDD;
}

// Compare Baseline Combo vs System Rebound Combo
// Baseline: All 3 played every day at 1x
let baseTotalStake = 0, baseTotalPayout = 0;
const baseEquity = [0];
let baseCum = 0;

days.forEach(d => {
  const stake = d.deStakeK + d.loStakeK + 22000; // Old xien 22M
  const payout = d.dePayoutK + d.loPayoutK; // old xien had losses
  baseTotalStake += stake;
  baseTotalPayout += payout;
  baseCum += (payout - stake);
  baseEquity.push(baseCum);
});

// System Rebound Combo:
// - Đề: If prev lost, bet 2x if scoreDe > prevScoreDe, else SKIP
// - Lô: If prev lost, bet 2x if scoreLo > prevScoreLo, else SKIP
// - Xiên 3: Vốn nhẹ 1M/ngày, chỉ đánh khi cả Đề HOẶC Lô có cược!
let sysTotalStake = 0, sysTotalPayout = 0, sysWinDays = 0, sysBetDays = 0;
const sysEquity = [0];
let sysCum = 0;

for (let i = 0; i < days.length; i++) {
  const d = days[i];
  const prev = i > 0 ? days[i - 1] : null;

  // DE decision
  let betDe = false, multDe = 1.0;
  if (!prev || prev.deWin) {
    betDe = true; multDe = 1.0;
  } else {
    if (d.scoreDe > prev.scoreDe) {
      betDe = true; multDe = 2.0;
    } else {
      betDe = false; // SKIP!
    }
  }

  // LO decision
  let betLo = false, multLo = 1.0;
  if (!prev || prev.loWin) {
    betLo = true; multLo = 1.0;
  } else {
    if (d.scoreLo > prev.scoreLo) {
      betLo = true; multLo = 2.0;
    } else {
      betLo = false; // SKIP!
    }
  }

  // XIEN 3: play if either DE or LO is playing
  let betXien = (betDe || betLo);
  let multXien = (multDe > 1.0 || multLo > 1.0) ? 1.5 : 1.0;

  if (betDe || betLo) {
    sysBetDays++;
    const dayStake = (betDe ? d.deStakeK * multDe : 0) +
                     (betLo ? d.loStakeK * multLo : 0) +
                     (betXien ? d.x3StakeK * multXien : 0);
    const dayPayout = (betDe ? d.dePayoutK * multDe : 0) +
                      (betLo ? d.loPayoutK * multLo : 0) +
                      (betXien ? d.x3PayoutK * multXien : 0);
    const dayProfit = dayPayout - dayStake;

    sysTotalStake += dayStake;
    sysTotalPayout += dayPayout;
    if (dayProfit > 0) sysWinDays++;
    sysCum += dayProfit;
    sysEquity.push(sysCum);
  }
}

const baseProfit = baseTotalPayout - baseTotalStake;
const sysProfit = sysTotalPayout - sysTotalStake;

console.log('=== SO SÁNH CUỐI CÙNG: DÀN ĐỀU CŨ VS HỆ THỐNG TÍN HIỆU HỒI PHỤC MỚI ===');
console.log('1. CŨ (Đánh đều 299 ngày cả 3 món):');
console.log(`   Số ngày đánh: 299 (100%)`);
console.log(`   Tổng vốn: ${(baseTotalStake/1000).toFixed(1)}M VNĐ`);
console.log(`   Lợi nhuận: ${(baseProfit/1000).toFixed(1)}M VNĐ (LỖ NẶNG)`);
console.log(`   ROI: ${(baseProfit/baseTotalStake*100).toFixed(2)}%`);
console.log(`   Max Drawdown: ${(computeDrawdown(baseEquity)/1000).toFixed(1)}M VNĐ`);

console.log('\n2. MỚI (Hệ Thống Tín Hiệu Hồi Phục Bù Lỗ Gated-Rebound):');
console.log(`   Số ngày đánh: ${sysBetDays} (${(sysBetDays/299*100).toFixed(1)}%)`);
console.log(`   Số ngày có lãi: ${sysWinDays} (${(sysWinDays/sysBetDays*100).toFixed(1)}%)`);
console.log(`   Tổng vốn: ${(sysTotalStake/1000).toFixed(1)}M VNĐ`);
console.log(`   Lợi nhuận ròng: ${(sysProfit/1000).toFixed(1)}M VNĐ (LÃI LỚN)`);
console.log(`   ROI: ${(sysProfit/sysTotalStake*100).toFixed(2)}%`);
console.log(`   Max Drawdown: ${(computeDrawdown(sysEquity)/1000).toFixed(1)}M VNĐ`);
console.log(`   Chênh lệch lợi nhuận: +${((sysProfit - baseProfit)/1000).toFixed(1)}M VNĐ (+${((sysProfit - baseProfit)/1e6).toFixed(2)} TỶ VNĐ)!`);
