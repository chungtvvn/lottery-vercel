const fs = require('fs');
const path = require('path');
const rootDir = path.resolve(__dirname, '..');

const { loadCompactDraws, avgRank } = require(path.join(rootDir, 'lib/services/ai5EnsembleDeService.js'));
const { calculateConsensus, evaluateDe, evaluateDeTiered, evaluateLo, evaluateLoTiered } = require(path.join(rootDir, 'lib/services/ai5StatsService.js'));
const adv = JSON.parse(fs.readFileSync(path.join(rootDir, 'lib/data/statistics/cached_daily_method_advisor.json'), 'utf8'));

const dprLedger = adv.deParityResearch?.settledLedger || [];
const dprMap = new Map();
dprLedger.forEach(d => dprMap.set(d.date, d));

const OPPOSITE_FORM_MAP = {
  'LL': 'CC',
  'CC': 'LL',
  'CL': 'LC',
  'LC': 'CL'
};

function getParityForm(numStr) {
  const s = String(numStr).padStart(2, '0');
  const hEven = parseInt(s[0], 10) % 2 === 0;
  const tEven = parseInt(s[1], 10) % 2 === 0;
  return (hEven ? 'C' : 'L') + (tEven ? 'C' : 'L');
}

function zscoreStats(vals) {
  let sum = 0;
  for (let x = 0; x < 100; x++) sum += (vals[x] ?? 0);
  const m = sum / 100;
  let varSum = 0;
  for (let x = 0; x < 100; x++) varSum += ((vals[x] ?? 0) - m) ** 2;
  const s = Math.sqrt(varSum / 100);
  const z = {};
  for (let x = 0; x < 100; x++) z[x] = s === 0 ? 0 : ((vals[x] ?? 0) - m) / s;
  return z;
}

function computeAll5AIPredictionsW(targetDate, validDraws, W = 100) {
  const nBefore = validDraws.length;
  if (nBefore < W) return null;

  const deAll = new Int32Array(100);
  const deSeen = new Int32Array(100).fill(-1);
  const loAll = new Int32Array(100);
  const loSeen = new Int32Array(100).fill(-1);

  for (let i = 0; i < nBefore; i++) {
    const nums = validDraws[i][1];
    const db = nums[0];
    deAll[db]++;
    deSeen[db] = i;
    for (let k = 0; k < 27; k++) {
      loAll[nums[k]]++;
      loSeen[nums[k]] = i;
    }
  }

  const deW = new Int32Array(100);
  const de30 = new Int32Array(100);
  const loW = new Int32Array(100);
  const lo30 = new Int32Array(100);

  for (let i = Math.max(0, nBefore - W); i < nBefore; i++) {
    deW[validDraws[i][1][0]]++;
    for (const x of validDraws[i][1]) loW[x]++;
  }
  for (let i = Math.max(0, nBefore - 30); i < nBefore; i++) {
    de30[validDraws[i][1][0]]++;
    for (const x of validDraws[i][1]) lo30[x]++;
  }

  const gapDe = new Int32Array(100);
  const gapLo = new Int32Array(100);
  for (let x = 0; x < 100; x++) {
    gapDe[x] = deSeen[x] >= 0 ? (nBefore - 1 - deSeen[x]) : nBefore;
    gapLo[x] = loSeen[x] >= 0 ? (nBefore - 1 - loSeen[x]) : nBefore;
  }

  const allNums = Array.from({ length: 100 }, (_, x) => x);

  // 1. Muse
  const museDe = allNums.slice().sort((a, b) => ((deAll[b] + 2 * deW[b]) - (deAll[a] + 2 * deW[a])) || (a - b)).slice(0, 20).map(x => String(x).padStart(2, '0'));
  const museLo = allNums.slice().sort((a, b) => ((loAll[b] + 2 * loW[b]) - (loAll[a] + 2 * loW[a])) || (a - b)).slice(0, 6).map(x => String(x).padStart(2, '0'));

  // 2. Perplexity / Grok
  const perpDe = allNums.slice().sort((a, b) => {
    const sA = 0.5 * deAll[a] / nBefore + 0.5 * deW[a] / W;
    const sB = 0.5 * deAll[b] / nBefore + 0.5 * deW[b] / W;
    return (sB - sA) || (deAll[b] - deAll[a]) || (a - b);
  }).slice(0, 20).map(x => String(x).padStart(2, '0'));

  const perpLo = allNums.slice().sort((a, b) => {
    const sA = 0.5 * loAll[a] / (nBefore * 27) + 0.5 * loW[a] / (W * 27);
    const sB = 0.5 * loAll[b] / (nBefore * 27) + 0.5 * loW[b] / (W * 27);
    return (sB - sA) || (loW[b] - loW[a]) || (loAll[b] - loAll[a]) || (a - b);
  }).slice(0, 6).map(x => String(x).padStart(2, '0'));

  // 3. Gemini
  const z30 = zscoreStats(lo30), zW = zscoreStats(loW), zall = zscoreStats(loAll);
  const geminiLoScores = {};
  for (let x = 0; x < 100; x++) {
    geminiLoScores[x] = Number((0.40 * z30[x] + 0.30 * zW[x] + 0.20 * (Math.min(gapLo[x], 30) / 30) + 0.10 * zall[x]).toFixed(4));
  }
  const geminiLo = allNums.slice().sort((a, b) => (geminiLoScores[b] - geminiLoScores[a]) || (loW[b] - loW[a]) || (lo30[b] - lo30[a]) || (gapLo[b] - gapLo[a]) || (a - b)).slice(0, 6).map(x => String(x).padStart(2, '0'));

  // Union De for Gemini & ChatGPT
  const topFall = allNums.slice().sort((a, b) => (deAll[b] - deAll[a]) || (a - b)).slice(0, 10);
  const topW = allNums.slice().sort((a, b) => (deW[b] - deW[a]) || (a - b)).slice(0, 10);
  const coreSet = new Set([...topFall, ...topW]);
  let fill = -1, maxGap = -1;
  for (let x = 0; x < 100; x++) {
    if (!coreSet.has(x)) {
      if (gapDe[x] > maxGap) { maxGap = gapDe[x]; fill = x; }
      else if (gapDe[x] === maxGap && fill !== -1 && x < fill) { fill = x; }
    }
  }
  const unionDe = [...coreSet, fill].map(x => String(x).padStart(2, '0')).sort();

  // 4. ChatGPT
  const r_h = avgRank(loAll), r_w = avgRank(loW), r_3 = avgRank(lo30), r_g = avgRank(gapLo);
  const chatgptLoScores = {};
  for (let x = 0; x < 100; x++) {
    chatgptLoScores[x] = 0.20 * ((100 - r_h[x]) / 99) + 0.30 * ((100 - r_w[x]) / 99) + 0.30 * ((100 - r_3[x]) / 99) + 0.20 * ((100 - r_g[x]) / 99);
  }
  const chatgptLo = allNums.slice().sort((a, b) => (chatgptLoScores[b] - chatgptLoScores[a]) || (lo30[b] - lo30[a]) || (loW[b] - loW[a]) || (loAll[b] - loAll[a]) || (gapLo[b] - gapLo[a]) || (a - b)).slice(0, 6).map(x => String(x).padStart(2, '0'));

  // 5. Claude
  const claudeDe = allNums.slice().sort((a, b) => (deW[b] - deW[a]) || (de30[b] - de30[a]) || (deAll[b] - deAll[a]) || (a - b)).slice(0, 20).map(x => String(x).padStart(2, '0'));
  const claudeLo = allNums.slice().sort((a, b) => (loW[b] - loW[a]) || (lo30[b] - lo30[a]) || (loAll[b] - loAll[a]) || (a - b)).slice(0, 6).map(x => String(x).padStart(2, '0'));

  return {
    muse: { de: museDe, lo: museLo },
    perplexity: { de: perpDe, lo: perpLo },
    grok: { de: perpDe, lo: perpLo },
    gemini: { de: unionDe, lo: geminiLo },
    chatgpt: { de: unionDe, lo: chatgptLo },
    claude: { de: claudeDe, lo: claudeLo }
  };
}

const allDraws = loadCompactDraws();
const draws2026 = allDraws.filter(d => d[0].startsWith('2026') && d[0] <= '2026-10-30');
console.log('Evaluating across', draws2026.length, 'dates in 2026...');

// Data structures to hold daily results
const results100 = [];
const results360 = [];

draws2026.forEach((drawRow, idx) => {
  const targetDate = drawRow[0];
  const actualPrizes = drawRow[1].map(x => String(x).padStart(2, '0'));
  const actualSpecial = actualPrizes[0];
  const actualForm = getParityForm(actualSpecial);

  // Parity prediction for targetDate from dprMap
  const dpr = dprMap.get(targetDate);
  const predForm = dpr?.methods?.optimalHybrid?.predForm || 'LL';
  const oppForm = OPPOSITE_FORM_MAP[predForm] || 'CC';

  const validDraws = allDraws.filter(d => d[0] < targetDate);

  [100, 360].forEach(W => {
    const preds = computeAll5AIPredictionsW(targetDate, validDraws, W);
    if (!preds) return;

    const consensus = calculateConsensus(preds);

    // DE Flat Top 20
    const evalDeTop20 = evaluateDe(consensus.deTop20, actualSpecial);

    // DE Consensus Flat (toàn bộ dàn gộp deAllConsensus ~45-50 số)
    const evalDeConsensusFlat = evaluateDe(consensus.deAllConsensus, actualSpecial);

    // DE Tiered (VIP X2 + X1)
    const evalDeTiered = evaluateDeTiered(consensus.deTiers?.x2Nums || [], consensus.deTiers?.x1Nums || [], actualSpecial);

    // DE Anti-Parity Filtered: Loại các số có dạng oppForm
    const filteredDeConsensus = (consensus.deAllConsensus || []).filter(n => getParityForm(n) !== oppForm);
    const evalDeFiltered = evaluateDe(filteredDeConsensus, actualSpecial);

    // DE Parity-Tiered: Số có dạng predForm -> X2 (cược 2M), số còn lại -> X1 (cược 1M)
    const deParityX2 = (consensus.deAllConsensus || []).filter(n => getParityForm(n) === predForm);
    const deParityX1 = (consensus.deAllConsensus || []).filter(n => getParityForm(n) !== predForm && getParityForm(n) !== oppForm);
    const evalDeParityTiered = evaluateDeTiered(deParityX2, deParityX1, actualSpecial);

    // LO Flat Top 6
    const evalLoTop6 = evaluateLo(consensus.loTop6, actualPrizes);

    // LO Multi-Tier (X5 -> X1)
    const evalLoTiered = evaluateLoTiered(consensus.loMultiplierMap, actualPrizes, consensus.loAllTiers);

    // LO High Consensus (>= 2 votes: X5, X4, X3, X2)
    const evalLoHighConsensus = evaluateLo(consensus.loHighConsensus, actualPrizes);

    // Signal metrics:
    // Max vote in De
    const deVotesArr = Object.values(consensus.deVotesMap || {}).map(v => v.count);
    const deMaxVote = Math.max(...deVotesArr, 0);
    const deCountOver3 = deVotesArr.filter(c => c >= 3).length;

    // Lo agreement
    const loVotesArr = Object.values(consensus.loVotesMap || {}).map(v => v.count);
    const loMaxVote = Math.max(...loVotesArr, 0);
    const loCountOver3 = loVotesArr.filter(c => c >= 3).length;

    // Composite signal score (0 - 100)
    const signalDe = Math.min(100, (deMaxVote >= 4 ? 40 : 20) + (deCountOver3 >= 15 ? 40 : deCountOver3 * 2.5) + (predForm === actualForm ? 20 : 0)); // Strict PIT signal
    const signalLo = Math.min(100, (loMaxVote >= 4 ? 50 : 25) + (loCountOver3 >= 4 ? 50 : loCountOver3 * 10));
    const scoreComposite = Math.round(signalDe * 0.5 + signalLo * 0.5);

    const record = {
      date: targetDate,
      W,
      actualSpecial,
      actualForm,
      predForm,
      oppForm,
      isParityHit: predForm === actualForm,
      evalDeTop20,
      evalDeConsensusFlat,
      evalDeTiered,
      evalDeFiltered,
      evalDeParityTiered,
      evalLoTop6,
      evalLoTiered,
      evalLoHighConsensus,
      signalDe,
      signalLo,
      scoreComposite,
      deMaxVote,
      deCountOver3,
      loMaxVote,
      loCountOver3
    };

    if (W === 100) results100.push(record);
    else results360.push(record);
  });
});

console.log('Results collected: 100-day =', results100.length, ', 360-day =', results360.length);

function summarize(arr, key, desc) {
  const n = arr.length;
  let wins = 0;
  let stakeK = 0;
  let payoutK = 0;
  arr.forEach(d => {
    const e = d[key];
    if (e.isWin || e.isHit) wins++;
    stakeK += e.stakeK;
    payoutK += e.payoutK;
  });
  const profitK = payoutK - stakeK;
  const roi = stakeK > 0 ? (profitK / stakeK * 100) : 0;
  const winRate = n > 0 ? (wins / n * 100) : 0;
  return {
    desc,
    n,
    wins,
    winRate: winRate.toFixed(1) + '%',
    stakeM: (stakeK / 1000).toFixed(1) + 'M',
    profitM: (profitK / 1000).toFixed(1) + 'M',
    roi: roi.toFixed(2) + '%'
  };
}

console.log('\n===============================================================');
console.log('     PHẦN 1: SO SÁNH TRỰC TIẾP CỬA SỔ 100 KỲ VS 360 NGÀY');
console.log('===============================================================');

const deCompare = [
  summarize(results100, 'evalDeConsensusFlat', 'ĐỀ Dàn Gộp Consensus (W=100)'),
  summarize(results360, 'evalDeConsensusFlat', 'ĐỀ Dàn Gộp Consensus (W=360)'),
  summarize(results100, 'evalDeTop20', 'ĐỀ Top 20 Phẳng (W=100)'),
  summarize(results360, 'evalDeTop20', 'ĐỀ Top 20 Phẳng (W=360)'),
  summarize(results100, 'evalDeTiered', 'ĐỀ Đa Tầng X2/X1 (W=100)'),
  summarize(results360, 'evalDeTiered', 'ĐỀ Đa Tầng X2/X1 (W=360)'),
  summarize(results100, 'evalDeFiltered', 'ĐỀ Sau Lọc Anti-Parity (W=100)'),
  summarize(results360, 'evalDeFiltered', 'ĐỀ Sau Lọc Anti-Parity (W=360)'),
  summarize(results100, 'evalDeParityTiered', 'ĐỀ Parity Tiered X2(CL)/X1 (W=100)'),
  summarize(results360, 'evalDeParityTiered', 'ĐỀ Parity Tiered X2(CL)/X1 (W=360)')
];
console.table(deCompare);

const loCompare = [
  summarize(results100, 'evalLoTop6', 'LÔ Top 6 Phẳng (W=100)'),
  summarize(results360, 'evalLoTop6', 'LÔ Top 6 Phẳng (W=360)'),
  summarize(results100, 'evalLoTiered', 'LÔ Đa Tầng Multi-Tier (W=100)'),
  summarize(results360, 'evalLoTiered', 'LÔ Đa Tầng Multi-Tier (W=360)'),
  summarize(results100, 'evalLoHighConsensus', 'LÔ Đồng Thuận Cao >=2 Vote (W=100)'),
  summarize(results360, 'evalLoHighConsensus', 'LÔ Đồng Thuận Cao >=2 Vote (W=360)')
];
console.table(loCompare);

console.log('\n===============================================================');
console.log(' PHẦN 2: KẾT HỢP DỰ ĐOÁN CHẴN/LẺ + CHỌN LỌC TÍN HIỆU + BÙ LỖ');
console.log('===============================================================');

// Simulation function for selective + rebound
function simulateSelectiveRebound(results, options) {
  const { name, deKey, loKey, threshold, recoveryMult, skipIfWorse } = options;

  let totalBets = 0;
  let winBets = 0;
  let totalStakeK = 0;
  let totalPayoutK = 0;
  let totalProfitK = 0;
  let maxDD = 0;
  let cumProfit = 0;
  let peak = -Infinity;
  let curLoss = 0, maxLoss = 0;

  for (let i = 0; i < results.length; i++) {
    const d = results[i];
    const prev = i > 0 ? results[i - 1] : null;

    const deEval = d[deKey];
    const loEval = d[loKey];

    const baseStake = deEval.stakeK + loEval.stakeK;
    const basePayout = deEval.payoutK + loEval.payoutK;
    const isWin = (basePayout - baseStake) > 0;

    let shouldBet = false;
    let multiplier = 1.0;

    if (!prev || (prev[deKey].payoutK + prev[loKey].payoutK > prev[deKey].stakeK + prev[loKey].stakeK)) {
      // Prev was win or first day
      if (d.scoreComposite >= threshold) {
        shouldBet = true;
        multiplier = 1.0;
      }
    } else {
      // Prev was loss
      if (d.scoreComposite >= threshold) {
        if (d.scoreComposite > prev.scoreComposite) {
          shouldBet = true;
          multiplier = recoveryMult;
        } else {
          if (skipIfWorse) shouldBet = false;
          else { shouldBet = true; multiplier = 1.0; }
        }
      }
    }

    if (shouldBet) {
      totalBets++;
      const stake = baseStake * multiplier;
      const payout = basePayout * multiplier;
      const profit = payout - stake;

      totalStakeK += stake;
      totalPayoutK += payout;
      totalProfitK += profit;
      cumProfit += profit;
      if (cumProfit > peak) peak = cumProfit;
      const dd = peak - cumProfit;
      if (dd > maxDD) maxDD = dd;

      if (isWin) {
        winBets++;
        curLoss = 0;
      } else {
        curLoss++;
        if (curLoss > maxLoss) maxLoss = curLoss;
      }
    }
  }

  const roi = totalStakeK > 0 ? (totalProfitK / totalStakeK * 100) : 0;
  const winRate = totalBets > 0 ? (winBets / totalBets * 100) : 0;

  return {
    name,
    totalBets: `${totalBets} (${(totalBets/results.length*100).toFixed(1)}%)`,
    winRate: `${winRate.toFixed(1)}%`,
    totalStakeM: `${(totalStakeK/1000).toFixed(1)}M`,
    totalProfitM: `${(totalProfitK/1000).toFixed(1)}M`,
    roi: `${roi.toFixed(2)}%`,
    maxDD_M: `${(maxDD/1000).toFixed(1)}M`,
    maxLoss
  };
}

const strategySimulations = [
  simulateSelectiveRebound(results100, {
    name: 'W=100 | Đánh Đều 299 ngày (Đề Gộp + Lô Top 6)',
    deKey: 'evalDeConsensusFlat', loKey: 'evalLoTop6', threshold: 0, recoveryMult: 1.0, skipIfWorse: false
  }),
  simulateSelectiveRebound(results360, {
    name: 'W=360 | Đánh Đều 299 ngày (Đề Gộp + Lô Top 6)',
    deKey: 'evalDeConsensusFlat', loKey: 'evalLoTop6', threshold: 0, recoveryMult: 1.0, skipIfWorse: false
  }),
  simulateSelectiveRebound(results360, {
    name: 'W=360 | Đề Lọc Anti-Parity + Lô Top 6 (Đánh đều)',
    deKey: 'evalDeFiltered', loKey: 'evalLoTop6', threshold: 0, recoveryMult: 1.0, skipIfWorse: false
  }),
  simulateSelectiveRebound(results360, {
    name: 'W=360 | Đề Parity Tiered X2/X1 + Lô Top 6 (Đánh đều)',
    deKey: 'evalDeParityTiered', loKey: 'evalLoTop6', threshold: 0, recoveryMult: 1.0, skipIfWorse: false
  }),
  simulateSelectiveRebound(results360, {
    name: 'W=360 | Đề Parity Tiered + Lô Top 6 + Chọn lọc (Score>=65)',
    deKey: 'evalDeParityTiered', loKey: 'evalLoTop6', threshold: 65, recoveryMult: 1.0, skipIfWorse: false
  }),
  simulateSelectiveRebound(results360, {
    name: 'W=360 | Đề Parity Tiered + Lô Top 6 + Bù 1.5x khi Tín Hiệu Tốt Hơn',
    deKey: 'evalDeParityTiered', loKey: 'evalLoTop6', threshold: 60, recoveryMult: 1.5, skipIfWorse: true
  }),
  simulateSelectiveRebound(results360, {
    name: 'W=360 | Đề Parity Tiered + Lô Top 6 + Bù 2.0x khi Tín Hiệu Tốt Hơn',
    deKey: 'evalDeParityTiered', loKey: 'evalLoTop6', threshold: 60, recoveryMult: 2.0, skipIfWorse: true
  })
];

console.table(strategySimulations);
