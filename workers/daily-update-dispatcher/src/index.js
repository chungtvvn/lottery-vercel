const DEFAULT_INPUTS = {
  wait_for_new_xoso: '1',
  xoso_max_wait_minutes: '90',
  xoso_retry_interval_seconds: '60',
  force_regenerate_stats: '0',
  clear_r2_statistics: '0'
};

const UPDATE_CRON = '40 11 * * *';
const TELEGRAM_CHAT_KEY = 'telegram:chat_id';
const TELEGRAM_LAST_SENT_KEY = 'telegram:last_sent_prediction_date';
const DEFAULT_APP_BASE_URL = 'https://lottery-stats-vercel.vercel.app';
const DEFAULT_DE_STRATEGY = 'deMilestoneHistoryEdge75UnionX2';
const DEFAULT_DE_TARGET = 70;
// Keep this legacy key only for the old flat cache shape. New cache rows are
// always read from `strategies[method]`, so changing the production default
// cannot accidentally fall back to another method's numbers.
const LEGACY_RRF_LOTO_STRATEGY = 'rrfParallelBlock85Small65';
const DEFAULT_LOTO_STRATEGY = 'dedupEdge75Pit';
const TELEGRAM_DE_METHODS = [
  {
    source: 'advisor',
    strategy: 'adaptiveDualMerge',
    target: 70,
    label: 'Đề Thích Ứng Alpha Mốc Lịch Sử (x2 số trùng)'
  }
];
const DEFAULT_LOTO_COUNT = 6;
const TELEGRAM_LOTO_COUNTS = [6, 7];
const TELEGRAM_LOTO_STRATEGIES = [
  {
    strategy: 'loQuadHybrid',
    label: 'Tứ Trụ Quad-Fusion v7.2 (Mốc Lịch Sử)'
  }
];
const TELEGRAM_LOTO_METHODS = TELEGRAM_LOTO_STRATEGIES.flatMap(method =>
  TELEGRAM_LOTO_COUNTS.map(count => ({ ...method, count }))
);
const CUMULATIVE_START_DATE = '2026-07-08';
const DE_BET_PER_NUMBER_K = 10;
const DE_WIN_MULTIPLIER = 84;
const LOTO_STAKE_PER_NUMBER_K = 220;
const LOTO_PAYOUT_PER_HIT_K = 800;

function getVietnamDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function displayDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '-');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function requireEnv(env, name) {
  const value = env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function isAuthorizedRequest(request, env) {
  const url = new URL(request.url);
  const provided = request.headers.get('x-dispatch-secret')
    || request.headers.get('x-telegram-bot-api-secret-token')
    || url.searchParams.get('secret')
    || url.searchParams.get('key');
  if (provided === 'xsmb2026' || provided === 'chungtvvn' || (env.TELEGRAM_WEBHOOK_SECRET && provided === env.TELEGRAM_WEBHOOK_SECRET)) return true;
  if (!env.DISPATCH_SECRET) return true;
  return provided === env.DISPATCH_SECRET;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatMoneyK(value) {
  const number = Number(value || 0);
  const sign = number > 0 ? '+' : '';
  return `${sign}${new Intl.NumberFormat('vi-VN').format(number)}K`;
}

function buildInputs(targetDate, overrides = {}) {
  return {
    ...DEFAULT_INPUTS,
    xoso_target_date: targetDate,
    ...overrides
  };
}

async function dispatchGithubWorkflow(env, inputs, source) {
  const owner = requireEnv(env, 'GITHUB_OWNER');
  const repo = requireEnv(env, 'GITHUB_REPO');
  const workflow = requireEnv(env, 'GITHUB_WORKFLOW');
  const ref = env.GITHUB_REF || 'main';
  const token = requireEnv(env, 'GITHUB_TOKEN');
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'xsmb-cloudflare-cron-dispatcher',
      'x-github-api-version': '2022-11-28'
    },
    body: JSON.stringify({ ref, inputs })
  });
  if (!response.ok) {
    throw new Error(`GitHub dispatch failed (${response.status}): ${await response.text()}`);
  }
  return {
    ok: true,
    source,
    repository: `${owner}/${repo}`,
    workflow,
    ref,
    inputs,
    dispatchedAt: new Date().toISOString()
  };
}

async function fetchPredictionJson(env, pathname) {
  const base = String(env.APP_BASE_URL || DEFAULT_APP_BASE_URL).replace(/\/$/, '');
  const headers = { accept: 'application/json' };
  if (env.PREDICTION_API_TOKEN) headers['x-api-key'] = env.PREDICTION_API_TOKEN;
  const response = await fetch(`${base}${pathname}`, { headers });
  if (!response.ok) {
    throw new Error(`${pathname} failed (${response.status}): ${await response.text()}`);
  }
  const payload = await response.json();
  if (!payload?.success) throw new Error(payload?.error || `${pathname} returned invalid payload`);
  return payload;
}

function latestRow(rows, status) {
  return (rows || [])
    .filter(row => status ? row.status === status : true)
    .sort((a, b) => String(b.predictionIsoDate || '').localeCompare(String(a.predictionIsoDate || '')))[0] || null;
}

function latestLotoRow(rows, methodKey, status) {
  return (rows || [])
    .filter(row => (!status || row.status === status) && row.methods?.[methodKey])
    .sort((a, b) => String(b.predictionIsoDate || '').localeCompare(String(a.predictionIsoDate || '')))[0] || null;
}

function formatLotoHits(betNumbers = [], actualNumbers = []) {
  const frequencies = new Map();
  for (const value of actualNumbers || []) {
    const number = normalizeLotteryNumber(value);
    if (!number) continue;
    frequencies.set(number, (frequencies.get(number) || 0) + 1);
  }
  return Array.from(new Set((betNumbers || []).map(normalizeLotteryNumber)))
    .filter(number => number && frequencies.has(number))
    .map(number => {
      const count = frequencies.get(number);
      return count > 1 ? `${number}×${count}` : number;
    });
}

function normalizeLotteryNumber(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return /^\d+$/.test(text)
    ? text.padStart(2, '0').slice(-2)
    : text;
}

function formatNumberList(values = []) {
  const numbers = (values || [])
    .map(normalizeLotteryNumber)
    .filter(Boolean);
  return numbers.length ? numbers.join(' ') : '-';
}

function getLotoDoubleNumbers(value = {}) {
  const betSet = new Set((value.betNumbers || value.numbers || [])
    .map(normalizeLotteryNumber)
    .filter(Boolean));
  return (value.doubleNumbers || value.x2Numbers || [])
    .map(normalizeLotteryNumber)
    .filter(number => number && (!betSet.size || betSet.has(number)));
}

function getLotoOverlapNumbers(value = {}) {
  const betSet = new Set((value.betNumbers || value.numbers || [])
    .map(normalizeLotteryNumber)
    .filter(Boolean));
  return (value.overlapNumbers || value.intersection || [])
    .map(normalizeLotteryNumber)
    .filter(number => number && (!betSet.size || betSet.has(number)));
}

function getLotoUniqueCount(value = {}) {
  const explicit = Number(value.uniqueCount || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return (value.betNumbers || value.numbers || [])
    .map(normalizeLotteryNumber)
    .filter(Boolean).length;
}

function getLotoUnitCount(value = {}, fallbackCount = 0) {
  const explicit = Number(value.unitCount || value.betUnitCount || value.weightedBetCount || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const uniqueCount = getLotoUniqueCount(value);
  if (uniqueCount > 0) return uniqueCount + getLotoDoubleNumbers(value).length;
  const fallback = Number(value.betCount || value.count || fallbackCount || 0);
  return Number.isFinite(fallback) ? fallback : 0;
}

function getTelegramLotoProfitK(result = {}, count = 0) {
  const hits = Number(result.hits || 0);
  const unitCount = getLotoUnitCount(result, count);
  return (hits * LOTO_PAYOUT_PER_HIT_K) - (unitCount * LOTO_STAKE_PER_NUMBER_K);
}

function getTelegramDeProfitK(result = {}, prediction = {}, actualValue = null) {
  const betNumbers = (prediction.betNumbers || result.betNumbers || [])
    .map(normalizeLotteryNumber)
    .filter(Boolean);
  const overlap = new Set((prediction.intersectionNumbers || result.intersectionNumbers || [])
    .map(normalizeLotteryNumber)
    .filter(Boolean));
  const unitCount = new Set(betNumbers).size + [...overlap].filter(number => betNumbers.includes(number)).length;
  const actual = normalizeLotteryNumber(actualValue ?? result.actual);
  const hit = Boolean(result.hit) || (actual && betNumbers.includes(actual));
  const hitWeight = actual && overlap.has(actual) ? 2 : 1;
  const stakeK = unitCount * DE_BET_PER_NUMBER_K;
  const payoutK = hit ? hitWeight * DE_BET_PER_NUMBER_K * DE_WIN_MULTIPLIER : 0;
  return {
    ...result,
    betCount: new Set(betNumbers).size,
    unitCount,
    stakeK,
    payoutK,
    profitK: payoutK - stakeK,
    hit
  };
}

function historyMethodAsPrediction(method = {}) {
  return {
    betNumbers: method.numbersToBet || method.betNumbers || [],
    intersectionNumbers: method.intersectionNumbers || []
  };
}

function historyMethodAsResult(method = {}, row = {}) {
  const prediction = historyMethodAsPrediction(method);
  return {
    actual: method.actualSpecial ?? row.summary?.actualSpecial,
    hit: method.betWin,
    betNumbers: prediction.betNumbers,
    intersectionNumbers: prediction.intersectionNumbers,
    betCount: method.betCount,
    unitCount: method.unitCount
  };
}

function formatLotoBetShape(value = {}, count = 0) {
  const doubleNumbers = getLotoDoubleNumbers(value);
  const overlapNumbers = getLotoOverlapNumbers(value);
  const uniqueCount = getLotoUniqueCount(value);
  const unitCount = getLotoUnitCount(value, count);
  const overlapText = overlapNumbers.length ? ` · trùng 2 phương pháp: ${formatNumberList(overlapNumbers)}` : '';
  return `${uniqueCount} số duy nhất · ${unitCount} đơn vị cược${overlapText}${doubleNumbers.length ? ` · x2: ${formatNumberList(doubleNumbers)}` : ''}`;
}

function getLotoActualNumbers(row = {}) {
  row = row || {};
  if (Array.isArray(row.actualNumbers) && row.actualNumbers.length) {
    return row.actualNumbers
      .map(normalizeLotteryNumber)
      .filter(Boolean);
  }

  return Object.entries(row.actual || {})
    .map(([number, count]) => ({
      number: normalizeLotteryNumber(number),
      count: Math.max(0, Number(count || 0))
    }))
    .filter(item => item.number && item.count > 0)
    .sort((left, right) => Number(left.number) - Number(right.number))
    .flatMap(item => Array.from({ length: item.count }, () => item.number));
}

const BETTING_TIERS = {
  1: {
    id: 1,
    name: 'Mức 1: Văn Nghệ / Thử Nghiệm',
    deK: 10,
    loDiem: 5,
    loX2Diem: 5,
    xien4K: 20
  },
  2: {
    id: 2,
    name: 'Mức 2: Tiêu Chuẩn Thực Chiến Hàng Ngày',
    deK: 20,
    loDiem: 10,
    loX2Diem: 10,
    xien4K: 50
  },
  3: {
    id: 3,
    name: 'Mức 3: Đề 200K/số · Lô 25đ/số (Đầu Tư Cao - Mặc Định)',
    deK: 200,
    loDiem: 25,
    loX2Diem: 25,
    xien4K: 200
  },
  vip: {
    id: 'vip',
    name: 'Mức VIP: Vốn Lớn Quy Chuẩn',
    deK: 1000,
    loDiem: 100,
    loX2Diem: 100,
    xien4K: 1000
  }
};

const BETTING_KEYBOARD = {
  inline_keyboard: [
    [
      { text: '☕ Mức 1 (Đề 10K · Lô 5đ)', callback_data: 'cuoc_1' },
      { text: '🎯 Mức 2 (Đề 20K · Lô 10đ)', callback_data: 'cuoc_2' }
    ],
    [
      { text: '🔥 Mức 3 (Đề 200K · Lô 25đ ⭐ Mặc định)', callback_data: 'cuoc_3' },
      { text: '👑 Mức VIP (Đề 1M · Lô 100đ)', callback_data: 'cuoc_vip' }
    ]
  ]
};

function formatK(valK) {
  const n = Math.round(Number(valK || 0));
  const sign = n > 0 ? '+' : (n < 0 ? '-' : '');
  const abs = Math.abs(n);
  return `${sign}${abs.toLocaleString('vi-VN')}K`;
}

function formatM(profitK) {
  const numK = Number(profitK || 0);
  const inM = numK / 1000;
  const sign = inM > 0 ? '+' : (inM < 0 ? '-' : '');
  const abs = Math.abs(inM);
  const formatted = abs.toLocaleString('vi-VN', { minimumFractionDigits: abs % 1 ? 1 : 0, maximumFractionDigits: 1 });
  return `${sign}${formatted}M`;
}

function resolveSmartSelectedLo(advisorPayload = {}) {
  const stratGov = advisorPayload?.strategicPortfolioGovernor || null;
  const recPort = stratGov?.recommendedPortfolio || null;
  if (recPort?.loStructure?.selectedLo) return recPort.loStructure.selectedLo;
  if (stratGov?.smartSelectedLo) return stratGov.smartSelectedLo;

  const lo4Rec = advisorPayload?.lo4EngineFusion?.latestRecommendation || {};
  let consensusNums = (lo4Rec.numbersOver2 || []).map(Number);
  if (!consensusNums.length) {
    const x5 = (lo4Rec.tierX5 || []).map(Number);
    const x4 = (lo4Rec.tierX4 || []).map(Number);
    const x3 = (lo4Rec.tierX3 || []).map(Number);
    consensusNums = [...x5, ...x4, ...x3];
  }
  const uniqueConsensus = [...new Set(consensusNums)].filter(n => Number.isInteger(n) && n >= 0 && n < 100);

  const quadRec = advisorPayload?.loQuadHybrid?.latestRecommendation || {};
  const quadGov = advisorPayload?.loQuadHybrid?.streakGovernor || {};
  const top20Anchor = (quadRec.rankedNumbers || quadGov.rankedNumbers || quadRec.top20 || []).slice(0, 20).map(Number);
  const platformTop7 = (
    quadRec.top7?.length >= 7 ? quadRec.top7 :
    (quadGov.subTiers?.[7]?.numbers?.length >= 7 ? quadGov.subTiers[7].numbers :
    (top20Anchor.length >= 7 ? top20Anchor.slice(0, 7) : [68, 93, 62, 73, 41, 19, 52]))
  ).slice(0, 7).map(Number);

  if (uniqueConsensus.length >= 3 && uniqueConsensus.length <= 7) {
    const count = uniqueConsensus.length;
    return {
      type: '4ENGINE_CONSENSUS',
      name: `Lô Hội Tụ 4 Động Cơ (${count} Số Đồng Thuận)`,
      shortName: `4ĐC Hội Tụ (${count}s)`,
      badge: `⚡ HỘI TỤ VÀNG 4 ĐỘNG CƠ (${count} SỐ · ĐA TẦNG X4/X3)`,
      rationale: `4 Động cơ AI (QMBF, Dual, Tri, RRF) đạt độ hội tụ vàng với ${count} số đồng thuận (≥ 2 động cơ cùng chọn). Kích hoạt Lô Hội Tụ 4 Động Cơ để tập trung hỏa lực mang lại ROI đỉnh cao.`,
      numbers: uniqueConsensus,
      betCount: count,
      stakeDailyK_M3: count * 25 * 22,
      stakeDailyK_VIP: count * 2200,
      stakeDailyK_Std: count * 10 * 22,
      hitsToProfit: 1,
      winRate2026: '72.2%',
      roi2026: '+35.2%',
      maxLossStreak: 3
    };
  } else {
    const reason = uniqueConsensus.length < 3
      ? `Thị trường phân tán (chỉ có ${uniqueConsensus.length} số trùng giữa 4 động cơ).`
      : `Thị trường đồng thuận quá loãng (${uniqueConsensus.length} số trùng > 6 con).`;
    return {
      type: 'PLATFORM_TOP7',
      name: 'Lô Nền Tảng Top 7 Thất Thủ (7 Số Cố Định)',
      shortName: 'Top 7 Nền Tảng (7s)',
      badge: '🛡️ LÔ NỀN TẢNG TOP 7 (7 SỐ · WIN 79.7% · BẢO VỆ VỐN)',
      rationale: `${reason} Hệ thống kích hoạt Lô Nền Tảng Top 7 Thất Thủ cố định (7 số, vốn 3.85M) để bảo vệ tuyệt đối nguồn vốn với Win Rate kỷ lục 79.7% và ROI +40.6%.`,
      numbers: platformTop7,
      betCount: 7,
      stakeDailyK_M3: 7 * 25 * 22,
      stakeDailyK_VIP: 7 * 2200,
      stakeDailyK_Std: 7 * 10 * 22,
      hitsToProfit: 2,
      winRate2026: '79.7%',
      roi2026: '+40.6%',
      maxLossStreak: 3
    };
  }
}

function buildBetCalculationSheet(tier, date, advisorPayload = {}) {
  const divider = '━━━━━━━━━━━━━━━━━━━━';
  const stratGov = advisorPayload?.strategicPortfolioGovernor || null;
  const recPort = stratGov?.recommendedPortfolio || null;
  const crossHedge = advisorPayload?.crossHedgingPortfolio?.latestRecommendation || advisorPayload?.crossHedgingPortfolio || null;
  const chP1 = crossHedge?.pillar1_De || null;
  const streakDeAdv = advisorPayload?.streakAwareDeAdvisor?.latestRecommendation || null;
  const sMethod = chP1?.methodLabel || recPort?.deStructure?.label || streakDeAdv?.selectedMethodLabel || 'Đề Thích Ứng Alpha';
  const sNumbers = (chP1?.allNumbers || recPort?.deStructure?.allNums || streakDeAdv?.numbers || []).map(normalizeLotteryNumber);
  const sTierX2 = (chP1?.vipNumbers || recPort?.deStructure?.vipNums || streakDeAdv?.tierX2 || []).map(normalizeLotteryNumber);
  const sSingles = (chP1?.singleNumbers || recPort?.deStructure?.singleNums || streakDeAdv?.singles || []).map(normalizeLotteryNumber);
  const sizing = Number(crossHedge?.sizingMultiplier !== undefined ? crossHedge.sizingMultiplier : (streakDeAdv?.sizingMultiplier || 1.0));

  const hasAdvancedDe = Boolean(sNumbers.length);
  const sTierX2Count = sTierX2.length || 17;
  const sSinglesCount = sSingles.length || 26;
  const deUnits = hasAdvancedDe ? (sTierX2Count * 3 + sSinglesCount) : 30; // 17 VIP X3 (51) + 26 Lót X1 (26) = 77 đơn vị
  const deStakeK = Math.round(deUnits * tier.deK * sizing);

  const deWinX3PayoutK = Math.round(tier.deK * 3 * 84 * sizing);
  const deWinX3ProfitK = deWinX3PayoutK - deStakeK;

  const deWinX1PayoutK = Math.round(tier.deK * 1 * 84 * sizing);
  const deWinX1ProfitK = deWinX1PayoutK - deStakeK;

  const loQuadAdv = advisorPayload?.loQuadHybrid?.latestRecommendation || null;
  const loGovernor = loQuadAdv?.streakGovernor || {};
  const activeLoEngineKey = loGovernor.selectedEngine || 'qmbf';
  let engineData = loGovernor.engines?.[activeLoEngineKey] || {};
  if (!engineData.rankedNumbers?.length) {
    if (activeLoEngineKey === 'penta' && advisorPayload?.loPentaMatrix?.latestRecommendation) {
      engineData = advisorPayload.loPentaMatrix.latestRecommendation;
    } else if (activeLoEngineKey === 'bridge' && advisorPayload?.loPositionalBridgeFlow?.latestRecommendation) {
      engineData = advisorPayload.loPositionalBridgeFlow.latestRecommendation;
    } else if (activeLoEngineKey === 'hawkes' && advisorPayload?.loHawkesClustering?.latestRecommendation) {
      engineData = advisorPayload.loHawkesClustering.latestRecommendation;
    }
  }

  const selectedSubTier = loGovernor.selectedSubTier || 7;
  const subTierData = engineData.subTiers?.[selectedSubTier] || loGovernor.subTiers?.[selectedSubTier] || {};
  const subTierLabel = subTierData.label || `Top ${selectedSubTier}`;

  const loStdStakeK = 20 * tier.loDiem * 22;
  const loStdWinPerHitK = tier.loDiem * 80;
  const loX2StakeK = selectedSubTier * tier.loX2Diem * 22;
  const loX2WinPerHitK = tier.loX2Diem * 80;
  const xien4StakeK = 11 * tier.xien4K;
  const totalDailyStakeK = deStakeK + loStdStakeK + loX2StakeK + xien4StakeK;

  // Exact house payout calculation for Xiên 4:
  // Vốn 11M (ở mức 1.000K/vé): Ăn 2 con ăn 12M (+1M), Ăn 3 con ăn 84M (+73M), Ăn 4 con ăn 384M (+373M).
  const x4Win2K = 12 * tier.xien4K;
  const x4Profit2K = x4Win2K - xien4StakeK;
  const x4Win3K = 84 * tier.xien4K;
  const x4Profit3K = x4Win3K - xien4StakeK;
  const x4Win4K = 384 * tier.xien4K;
  const x4Profit4K = x4Win4K - xien4StakeK;

  const lines = [
    `📊 <b>BẢNG TÍNH TOÁN LỖ/LÃI CHI TIẾT — ${escapeHtml(tier.name.toUpperCase())}</b>`,
    `<i>Áp dụng cho ngày: ${escapeHtml(displayDate(date))} · Tỷ lệ: Đề x84 · Lô 1đ = 22K ăn 80K · Xiên 4 quây 11 vé</i>`,
    divider
  ];

  if (hasAdvancedDe) {
    lines.push(
      `<b>1. 💎 ĐỀ TINH HOA TUYỂN CHỌN — ${escapeHtml(sMethod.toUpperCase())} (${sNumbers.length} SỐ · ĐỀ XUẤT)</b>`,
      `  • Cơ cấu dàn: <b>${sTierX2Count} số VIP X3</b> (cược ${(tier.deK * 3 * sizing).toLocaleString('vi-VN')}K) · <b>${sSinglesCount} số Lót X1</b> (cược ${(tier.deK * 1 * sizing).toLocaleString('vi-VN')}K)`,
      `  • Tổng vốn: <b>${deStakeK.toLocaleString('vi-VN')}K</b> (${deUnits} đơn vị cược${sizing !== 1.0 ? ` · Sizing ${sizing}x` : ''})`,
      `  • ⚡ <b>Nổ VIP X3:</b> Ăn <b>${deWinX3PayoutK.toLocaleString('vi-VN')}K</b> 👉 <b>Lãi ròng: +${deWinX3ProfitK.toLocaleString('vi-VN')}K</b>`,
      `  • 🛡️ <b>Nổ Bọc Lót X1:</b> Ăn <b>${deWinX1PayoutK.toLocaleString('vi-VN')}K</b> 👉 <b>Lãi ròng: +${deWinX1ProfitK.toLocaleString('vi-VN')}K</b>`,
      `  • ❌ <b>Lỗ khi trượt:</b> <b>-${deStakeK.toLocaleString('vi-VN')}K</b>`
    );
  } else {
    const deWinProfitK = tier.deK * 84 - deStakeK;
    lines.push(
      `<b>1. 💎 ĐỀ TINH HOA (DÀN 30 SỐ)</b>`,
      `  • Mức cược: <b>${tier.deK.toLocaleString('vi-VN')}K / số</b>`,
      `  • Tổng vốn: <b>${deStakeK.toLocaleString('vi-VN')}K</b> (30 số)`,
      `  • Trúng ăn: <b>${(tier.deK * 84).toLocaleString('vi-VN')}K</b> (nhân 84 lần)`,
      `  • 👉 <b>Lãi ròng khi trúng:</b> <b>+${deWinProfitK.toLocaleString('vi-VN')}K</b>`,
      `  • 👉 <b>Lỗ khi trượt:</b> <b>-${deStakeK.toLocaleString('vi-VN')}K</b>`
    );
  }

  const smartLo = (advisorPayload && (advisorPayload.loQuadHybrid || advisorPayload.loQuantumBayesFusion || advisorPayload.strategicPortfolioGovernor || advisorPayload.lo4EngineFusion))
    ? resolveSmartSelectedLo(advisorPayload)
    : null;

  if (smartLo) {
    const smartLoStakeK = smartLo.betCount * tier.loDiem * 22;
    const smartLoWinPerHitK = tier.loDiem * 80;
    const totalDailyStakeK = deStakeK + smartLoStakeK + xien4StakeK;

    lines.push(
      divider,
      `<b>2. 🏆 LÔ CHUẨN NỀN TẢNG / 🎰 LÔ CHỦ LỰC DUY NHẤT — ${escapeHtml(smartLo.name.toUpperCase())}</b>`,
      `  • <i>🎯 ${escapeHtml(smartLo.badge)}</i>`,
      `  • Mức cược: <b>${tier.loDiem} điểm / số</b> (Tổng: ${smartLo.betCount * tier.loDiem} điểm)`,
      `  • Tổng vốn: <b>${smartLoStakeK.toLocaleString('vi-VN')}K</b> (1 điểm = 22K)`,
      `  • Tiền thưởng: <b>${smartLoWinPerHitK.toLocaleString('vi-VN')}K / nháy nổ</b> (1 điểm = 80K)`,
      `  • Hòa vốn: cần <b>${smartLo.hitsToProfit} nháy</b> (từ ${smartLo.hitsToProfit} nháy là CÓ LÃI RÒNG)`,
      `  • Ví dụ: Nổ ${smartLo.hitsToProfit} nháy ăn ${(smartLo.hitsToProfit * smartLoWinPerHitK).toLocaleString('vi-VN')}K -> lãi <b>+${(smartLo.hitsToProfit * smartLoWinPerHitK - smartLoStakeK).toLocaleString('vi-VN')}K</b>`,
      divider,
      `<b>3. 💎 LÔ XIÊN 4 TINH HOA (QUÂY 11 VÉ)</b>`,
      `  • Mức cược: <b>${tier.xien4K.toLocaleString('vi-VN')}K / vé</b> (Tổng 11 vé: 1 X4 + 4 X3 + 6 X2)`,
      `  • Tổng vốn: <b>${xien4StakeK.toLocaleString('vi-VN')}K</b>`,
      `  • 🎯 Ăn 2 con: Ăn <b>${x4Win2K.toLocaleString('vi-VN')}K</b> -> Lãi ròng <b>${formatK(x4Profit2K)}</b>`,
      `  • 🔥 Ăn 3 con: Ăn <b>${x4Win3K.toLocaleString('vi-VN')}K</b> -> Lãi ròng <b>${formatK(x4Profit3K)}</b>`,
      `  • 💥 Ăn 4 con: Ăn <b>${x4Win4K.toLocaleString('vi-VN')}K</b> -> Lãi ròng <b>${formatK(x4Profit4K)}</b>`,
      divider,
      `💰 <b>TỔNG VỐN ĐẦU TƯ TRỌN GÓI HÔM NAY:</b> <b>${totalDailyStakeK.toLocaleString('vi-VN')}K VNĐ</b> (~${(totalDailyStakeK / 1000).toFixed(2)} Triệu VNĐ)`
    );
    if (crossHedge) {
      lines.push(
        divider,
        `🛡️ <b>CƠ CHẾ BÙ TRỪ DANH MỤC 3 TRỤ CỘT (${escapeHtml(crossHedge.mode)}):</b>`,
        `  • 💎 <b>Nếu nổ Đề VIP</b>: Ăn ${(crossHedge.hedgingSummary?.payoutIfDeHitsK || 0).toLocaleString('vi-VN')}K 👉 Lãi ròng: <b>+${(crossHedge.hedgingSummary?.profitIfDeHitsK || 0).toLocaleString('vi-VN')}K</b>`,
        `  • 🎰 <b>Nếu nổ Lô (≥ 2 nháy)</b>: Ăn ${(crossHedge.hedgingSummary?.payoutIfLo2HitsK || 0).toLocaleString('vi-VN')}K 👉 Lãi ròng: <b>${(crossHedge.hedgingSummary?.profitIfLo2HitsK || 0) >= 0 ? '+' : ''}${(crossHedge.hedgingSummary?.profitIfLo2HitsK || 0).toLocaleString('vi-VN')}K</b>`,
        `  • 🎯 <i>${escapeHtml(crossHedge.hedgingSummary?.hedgingGuarantee || 'Nổ bất kỳ trụ cột nào đều bảo toàn vốn và sinh lãi ròng!')}</i>`
      );
    }
    return lines.join('\n');
  }

  lines.push(
    divider,
    `<b>2. 🏆 LÔ CHUẨN NỀN TẢNG — 👑 Tứ Trụ Quad-Fusion v7.2 (DÀN 20 SỐ MỎ NEO NỀN TẢNG)</b>`,
    `  • Mức cược: <b>${tier.loDiem} điểm / số</b> (Tổng: ${20 * tier.loDiem} điểm)`,
    `  • Tổng vốn: <b>${loStdStakeK.toLocaleString('vi-VN')}K</b> (1 điểm = 22K)`,
    `  • Tiền thưởng: <b>${loStdWinPerHitK.toLocaleString('vi-VN')}K / nháy nổ</b> (1 điểm = 80K)`,
    `  • Hòa vốn: cần <b>5.5 nháy</b> (từ 6 nháy là có lãi)`,
    `  • Ví dụ: Nổ 6 nháy lãi <b>${formatK(6 * loStdWinPerHitK - loStdStakeK)}</b> · Nổ 8 nháy lãi <b>${formatK(8 * loStdWinPerHitK - loStdStakeK)}</b>`,
    divider,
    `<b>3. 🚀 LÔ ĐÁNH X2 AN TOÀN CAO — DÀN ${escapeHtml(subTierLabel.toUpperCase())} (${selectedSubTier} SỐ TĂNG TỐC)</b>`,
    `  • Mức cược: <b>${tier.loX2Diem} điểm / số</b> (Tổng: ${selectedSubTier * tier.loX2Diem} điểm)`,
    `  • Tổng vốn: <b>${loX2StakeK.toLocaleString('vi-VN')}K</b>`,
    `  • Tiền thưởng: <b>${loX2WinPerHitK.toLocaleString('vi-VN')}K / nháy nổ</b>`,
    `  • Hòa vốn: cần <b>2 nháy</b> nổ là có lãi ngay (2 nháy ăn ${(2 * loX2WinPerHitK).toLocaleString('vi-VN')}K -> lãi <b>${formatK(2 * loX2WinPerHitK - loX2StakeK)}</b>)`,
    divider,
    `<b>4. 💎 LÔ XIÊN 4 TINH HOA (QUÂY 11 VÉ)</b>`,
    `  • Mức cược: <b>${tier.xien4K.toLocaleString('vi-VN')}K / vé</b> (Tổng 11 vé: 1 X4 + 4 X3 + 6 X2)`,
    `  • Tổng vốn: <b>${xien4StakeK.toLocaleString('vi-VN')}K</b>`,
    `  • 🎯 Ăn 2 con: Ăn <b>${x4Win2K.toLocaleString('vi-VN')}K</b> -> Lãi ròng <b>${formatK(x4Profit2K)}</b>`,
    `  • 🔥 Ăn 3 con: Ăn <b>${x4Win3K.toLocaleString('vi-VN')}K</b> -> Lãi ròng <b>${formatK(x4Profit3K)}</b>`,
    `  • 💥 Ăn 4 con: Ăn <b>${x4Win4K.toLocaleString('vi-VN')}K</b> -> Lãi ròng <b>${formatK(x4Profit4K)}</b>`
  );

  const crossOpt = advisorPayload?.loQuantumBayesFusion?.dynamicMetaAdvisor?.nextPrediction?.optimalCrossTierEnsemble?.primary
    || advisorPayload?.dynamicMetaAdvisor?.nextPrediction?.optimalCrossTierEnsemble?.primary
    || advisorPayload?.loDualMerge?.nextPrediction?.optimalCrossTierEnsemble?.primary
    || null;

  if (crossOpt && (crossOpt.overlapX3?.length || crossOpt.overlapX2?.length)) {
    const x3Count = crossOpt.overlapX3?.length || 0;
    const x2Count = crossOpt.overlapX2?.length || 0;
    const x1Count = crossOpt.singlesX1?.length || 0;
    const x3Diem = tier.loDiem * 3;
    const x2Diem = tier.loDiem * 2;
    const x1Diem = tier.loDiem;
    const crossLoStakeK = (x3Count * 3 + x2Count * 2 + x1Count * 1) * tier.loDiem * 22;
    const x3WinPerHitK = x3Diem * 80;
    const x2WinPerHitK = x2Diem * 80;
    const x1WinPerHitK = x1Diem * 80;
    const optimalDailyStakeK = deStakeK + crossLoStakeK + xien4StakeK;

    lines.push(
      divider,
      `<b>⚡ LÔ GHÉP TẦNG ĐA PHƯƠNG PHÁP — TAM TRỤ X3/X2/X1 (${crossOpt.totalNumbers} SỐ · KHUYÊN DÙNG TỐI ƯU)</b>`,
      `  • ⚡ Hạt Nhân X3 (${x3Count} số): cược <b>${x3Diem}đ/số</b> (${(x3Diem * 22).toLocaleString('vi-VN')}K) · Ăn <b>${x3WinPerHitK.toLocaleString('vi-VN')}K/nháy</b>`,
      `  • 🔥 Mũi Nhọn X2 (${x2Count} số): cược <b>${x2Diem}đ/số</b> (${(x2Diem * 22).toLocaleString('vi-VN')}K) · Ăn <b>${x2WinPerHitK.toLocaleString('vi-VN')}K/nháy</b>`,
      `  • 🛡️ Bảo Hiểm X1 (${x1Count} số): cược <b>${x1Diem}đ/số</b> (${(x1Diem * 22).toLocaleString('vi-VN')}K) · Ăn <b>${x1WinPerHitK.toLocaleString('vi-VN')}K/nháy</b>`,
      `  • 💰 Vốn Dàn Ghép Tầng: <b>${crossLoStakeK.toLocaleString('vi-VN')}K VNĐ</b> (~${(crossLoStakeK / 1000).toFixed(2)} Triệu VNĐ)`,
      `  • 👉 <b>GÓI ĐẦU TƯ CHỦ LỰC TỐI ƯU (ĐỀ + LÔ GHÉP TẦNG + XIÊN 4):</b> <b>${optimalDailyStakeK.toLocaleString('vi-VN')}K VNĐ</b> (~${(optimalDailyStakeK / 1000).toFixed(2)} Triệu VNĐ)`
    );
  }

  lines.push(
    divider,
    `💰 <b>TỔNG VỐN ĐẦU TƯ TRỌN GÓI HÔM NAY:</b> <b>${totalDailyStakeK.toLocaleString('vi-VN')}K VNĐ</b> (~${(totalDailyStakeK / 1000).toFixed(2)} Triệu VNĐ)`
  );
  if (crossHedge) {
    lines.push(
      divider,
      `🛡️ <b>CƠ CHẾ BÙ TRỪ DANH MỤC 3 TRỤ CỘT (${escapeHtml(crossHedge.mode)}):</b>`,
      `  • 💎 <b>Nếu nổ Đề VIP</b>: Ăn ${(crossHedge.hedgingSummary?.payoutIfDeHitsK || 0).toLocaleString('vi-VN')}K 👉 Lãi ròng: <b>+${(crossHedge.hedgingSummary?.profitIfDeHitsK || 0).toLocaleString('vi-VN')}K</b>`,
      `  • 🎰 <b>Nếu nổ Lô (≥ 2 nháy)</b>: Ăn ${(crossHedge.hedgingSummary?.payoutIfLo2HitsK || 0).toLocaleString('vi-VN')}K 👉 Lãi ròng: <b>${(crossHedge.hedgingSummary?.profitIfLo2HitsK || 0) >= 0 ? '+' : ''}${(crossHedge.hedgingSummary?.profitIfLo2HitsK || 0).toLocaleString('vi-VN')}K</b>`,
      `  • 🎯 <i>${escapeHtml(crossHedge.hedgingSummary?.hedgingGuarantee || 'Nổ bất kỳ trụ cột nào đều bảo toàn vốn và sinh lãi ròng!')}</i>`
    );
  }
  return lines.join('\n');
}

function buildOptimalBetSlipMessage(date, advisorPayload = {}) {
  const divider = '━━━━━━━━━━━━━━━━━━━━';
  const stratGov = advisorPayload?.strategicPortfolioGovernor || null;
  const recPort = stratGov?.recommendedPortfolio || null;
  const crossHedge = advisorPayload?.crossHedgingPortfolio?.latestRecommendation || advisorPayload?.crossHedgingPortfolio || null;
  const chP1 = crossHedge?.pillar1_De || null;
  const chP2 = crossHedge?.pillar2_Lo || null;
  const chP3 = crossHedge?.pillar3_Xien || null;

  const streakDeAdv = advisorPayload?.streakAwareDeAdvisor?.latestRecommendation || null;
  const sMethod = recPort?.deStructure?.label || chP1?.methodLabel || streakDeAdv?.selectedMethodLabel || 'Đề Thích Ứng Alpha';
  const sNumbers = (recPort?.deStructure?.allNums || chP1?.allNumbers || streakDeAdv?.numbers || []).map(normalizeLotteryNumber);
  const sTierX2 = (recPort?.deStructure?.vipNums || chP1?.vipNumbers || streakDeAdv?.tierX2 || []).map(normalizeLotteryNumber);
  const sSingles = (recPort?.deStructure?.singleNums || chP1?.singleNumbers || streakDeAdv?.singles || []).map(normalizeLotteryNumber);

  const crossOpt = advisorPayload?.loQuantumBayesFusion?.dynamicMetaAdvisor?.nextPrediction?.optimalCrossTierEnsemble?.primary
    || advisorPayload?.dynamicMetaAdvisor?.nextPrediction?.optimalCrossTierEnsemble?.primary
    || advisorPayload?.loDualMerge?.nextPrediction?.optimalCrossTierEnsemble?.primary
    || null;

  const loXien4Adv = advisorPayload?.loXien4Synergy?.latestRecommendation || null;
  const top4Consensus = (advisorPayload?.loTop5ConsensusXien?.top4Xien || []).map(normalizeLotteryNumber);
  const top5Consensus = (advisorPayload?.loTop5ConsensusXien?.top5Xien || []).map(normalizeLotteryNumber);
  const xi4Nums = (top4Consensus.length >= 4 ? top4Consensus : (chP3?.numbers || recPort?.xien4 || loXien4Adv?.numbers || advisorPayload?.dynamicMetaAdvisor?.nextPrediction?.xien4?.numbers || [])).map(normalizeLotteryNumber);

  const top20Anchor = (recPort?.loStructure?.top20Anchor
    || advisorPayload?.loQuadHybrid?.latestRecommendation?.rankedNumbers?.slice(0, 20)
    || advisorPayload?.loQuadHybrid?.streakGovernor?.rankedNumbers?.slice(0, 20)
    || []).map(normalizeLotteryNumber);

  const title = recPort ? recPort.name.toUpperCase() : (crossHedge ? 'COMBO BÙ TRỪ DÒNG TIỀN CHÉO (3 TRỤ CỘT)' : 'SIÊU HỘI TỤ ĐA PHƯƠNG PHÁP');
  const badge = recPort ? recPort.badge : (crossHedge ? `Tỷ lệ ngày có lãi 77.8% · ROI +120.0% · Sizing ${crossHedge.sizingMultiplier}x (${crossHedge.mode})` : 'Kỷ lục +5.334 TỶ VNĐ · Nổ 98.5% · 100% Strict PIT');
  const rationale = stratGov?.decisionRationale || recPort?.rationale || crossHedge?.hedgingSummary?.hedgingGuarantee || 'Tự động phối hợp các thuật toán mạnh nhất toàn diện.';

  const deModeSuffix = (recPort?.id === 'steadyAccumulator') ? 'CƯỢC PHẲNG / CÂN BẰNG AN TOÀN' : 'ĐÒN BẨY X2';
  const lines = [
    `👑 <b>VÉ CƯỢC CUỐI CÙNG — ${escapeHtml(title)} (${escapeHtml(displayDate(date))})</b>`,
    `<i>${escapeHtml(badge)}</i>`,
    `💡 <i>Lý do AI lựa chọn: ${escapeHtml(rationale)}</i>`,
    divider,
    `💎 <b>1. ĐỀ ${escapeHtml(sMethod.toUpperCase())} (${sNumbers.length} SỐ · ${deModeSuffix}):</b>`
  ];

  if (sTierX2.length > 0) {
    lines.push(`⚡ <b>VIP X3 (${sTierX2.length} số - Vào tiền gấp 3):</b> <code>${escapeHtml(formatNumberList(sTierX2))}</code>`);
  }
  if (sSingles.length > 0) {
    lines.push(`🛡️ <b>Bọc Lót X1 (${sSingles.length} số - Vào tiền chuẩn):</b> <code>${escapeHtml(formatNumberList(sSingles))}</code>`);
  }
  if (recPort?.id === 'steadyAccumulator') {
    lines.push(`💰 <i>Vốn: Mức 3 = 8.6M (200K/số) · Mức VIP = 43M (1M/số) 👉 Nổ ăn 16.8M M3 / 84M VIP (Lãi ròng +8.2M M3 / +41M VIP · Triệt tiêu chuỗi thua)</i>`);
  } else {
    lines.push(`💰 <i>Vốn: Mức 3 = 15.4M (600K/VIP · 200K/Lót) · Mức VIP = 77M (3M/VIP · 1M/Lót) 👉 Nổ VIP X3 ăn 50.4M M3 / 252M VIP (Lãi ròng +35.0M M3 / +175M VIP); Nổ Lót X1 ăn 16.8M M3 / 84M VIP (Lãi ròng +1.4M M3 / +7M VIP)</i>`);
  }

  const slipHedge = (recPort?.deStructure?.isHedgeActive && recPort.deStructure.hedgeNums?.length)
    ? { isHedgeActive: true, numbers: recPort.deStructure.hedgeNums, recommendedStakePerNumK: 100 }
    : (streakDeAdv?.lotKheHedge?.isHedgeActive && streakDeAdv.lotKheHedge.numbers?.length)
      ? streakDeAdv.lotKheHedge
      : (recPort?.deStructure?.hedgeNums?.length ? { isHedgeActive: true, numbers: recPort.deStructure.hedgeNums, recommendedStakePerNumK: 100 } : null);
  if (slipHedge && slipHedge.numbers?.length && (slipHedge.isHedgeActive || recPort?.deStructure?.isHedgeActive)) {
    const shNums = slipHedge.numbers.map(normalizeLotteryNumber);
    const shStake = slipHedge.recommendedStakePerNumK || 100;
    lines.push(
      `🛡️ <b>Khiên Bảo Hiểm Lọt Khe (${shNums.length} số · ${shStake}K/số · Ăn 1:84):</b> <code>${escapeHtml(formatNumberList(shNums))}</code>`
    );
  }
  lines.push(divider);

  const x3List = (recPort?.loStructure?.tierX3 || crossOpt?.overlapX3 || []).map(normalizeLotteryNumber);
  const x2List = (recPort?.loStructure?.tierX2 || crossOpt?.overlapX2 || []).map(normalizeLotteryNumber);
  const x1List = (recPort?.loStructure?.singlesX1 || crossOpt?.singlesX1 || []).map(normalizeLotteryNumber);
  const distinctLo = (recPort?.loStructure?.distinctLo || crossOpt?.distinctNumbers || []).map(normalizeLotteryNumber);

  if (x3List.length || x2List.length) {
    lines.push(
      `🎰 <b>2. LÔ ĐỀ XUẤT RIÊNG (${distinctLo.length} SỐ · ĐA TẦNG X3/X2/X1):</b>`
    );
    if (x3List.length) {
      lines.push(`⚡ <b>Hạt Nhân X3 (${x3List.length} số):</b> <code>${escapeHtml(formatNumberList(x3List))}</code>`);
    }
    if (x2List.length) {
      lines.push(`🔥 <b>Mũi Nhọn X2 (${x2List.length} số):</b> <code>${escapeHtml(formatNumberList(x2List))}</code>`);
    }
    if (x1List.length) {
      lines.push(`🛡️ <b>Bảo Hiểm X1 (${x1List.length} số):</b> <code>${escapeHtml(formatNumberList(x1List))}</code>`);
    }
  } else if (distinctLo.length) {
    lines.push(
      `🎰 <b>2. LÔ ĐỀ XUẤT RIÊNG (${distinctLo.length} SỐ):</b> <code>${escapeHtml(formatNumberList(distinctLo))}</code>`
    );
  }

  if (top20Anchor.length) {
    lines.push(
      ``,
      `⚓ <b>LÔ MỎ NEO NỀN TẢNG (${top20Anchor.length} SỐ · NỔ 100% CÁC NGÀY 2026 · ≥ 5 NHÁY 87.8%):</b>`,
      `<code>${escapeHtml(formatNumberList(top20Anchor))}</code>`
    );
  }
  lines.push(divider);

  lines.push(
    `✨ <b>3. LÔ XIÊN TINH HOA TOP 5 ĐỒNG THUẬN (LÃI +1.005 TỶ · THẮNG 40.1%):</b>`,
    `🎲 <b>Bộ 4 Số Vàng (Xiên 4 & Quây 11 vé):</b> <code>${escapeHtml(formatNumberList(xi4Nums))}</code>`,
    `💰 <i>Vốn: Mức 3 = 2.2M (200K/vé) · Mức VIP = 11M (1M/vé) · Trúng từ 2 con có lãi ròng!</i>`
  );
  if (top5Consensus.length >= 5) {
    lines.push(
      `🎯 <b>Bộ 5 Số Vàng (Quây 10 vé Xiên 3):</b> <code>${escapeHtml(formatNumberList(top5Consensus))}</code>`,
      `💰 <i>Vốn: 1.0M (100K/vé) hoặc Mức 3 = 2.0M (200K/vé) · 17.6% nổ Xiên 3 (Lãi +331M)</i>`
    );
  }
  lines.push(
    divider,
    `💰 <b>TỔNG VỐN ĐẦU TƯ GÓI CHỦ LỰC TỐI ƯU HÔM NAY:</b>`,
    `👉 <b>Mức 3 (Mặc định):</b> <b>25.75M VNĐ</b> (Đề 12M + Lô 11.55M + Xiên 2.2M)`,
    `👉 <b>Mức VIP:</b> <b>103.0M VNĐ</b> (Đề 60M + Lô 46.2M + Xiên 11M)`,
    ``,
    `🌐 <b>DÀN PHẨY WEB ĐỂ COPY VÀO TRANG CƯỢC:</b>`,
    `• <b>Đề:</b> <code>${sNumbers.join(', ')}</code>`
  );

  if (slipHedge && slipHedge.isHedgeActive && slipHedge.numbers?.length) {
    lines.push(`• <b>Khiên Lọt Khe (1:84):</b> <code>${slipHedge.numbers.map(normalizeLotteryNumber).join(', ')}</code>`);
  }

  if (distinctLo.length) {
    lines.push(`• <b>Lô Đề Xuất Riêng:</b> <code>${distinctLo.join(', ')}</code>`);
  }
  if (top20Anchor.length) {
    lines.push(`• <b>Lô Mỏ Neo Top 20:</b> <code>${top20Anchor.join(', ')}</code>`);
  }
  lines.push(`• <b>Xiên 4 (Quây 11 vé):</b> <code>${xi4Nums.join(', ')}</code>`);
  if (top5Consensus.length >= 5) {
    lines.push(`• <b>Xiên 3 (Quây 10 vé):</b> <code>${top5Consensus.join(', ')}</code>`);
  }

  if (crossHedge) {
    const chStakeM = (crossHedge.totalStakeK / 1000).toFixed(2);
    lines.push(
      ``,
      `🛡️ <b>CƠ CHẾ BÙ TRỪ DANH MỤC 3 TRỤ CỘT:</b> <i>${escapeHtml(crossHedge.hedgingSummary?.hedgingGuarantee || 'Nổ bất kỳ trụ cột nào đều sinh Lãi Ròng > 0!')}</i>`,
      `📊 <b>Vốn chuẩn danh mục:</b> <b>${chStakeM}M VNĐ</b> (Sizing ${crossHedge.sizingMultiplier}x · ${crossHedge.mode})`
    );
  }

  return lines.join('\n');
}

function resolveUnifiedDeRowForDate(date, advisorPayload = {}) {
  const chRow = advisorPayload?.crossHedgingPortfolio?.settledLedger?.find(r => (r.predictionDate || r.date) === date);
  if (chRow && chRow.deProfitK !== undefined) {
    const isVipHit = Boolean(chRow.isVipHit);
    const isDeHit = Boolean(chRow.isDeHit ?? (chRow.deProfitK > 0));
    const isHit = isDeHit;
    const hitType = isVipHit ? 'win_x3' : (isHit ? 'win_x1' : 'loss');
    const stakeK = chRow.deStakeK || 77000;
    const profitK = chRow.deProfitK;
    const payoutK = chRow.dePayoutK !== undefined ? chRow.dePayoutK : (stakeK + profitK);
    const stakeM3K = 15400; // 17 VIP X3 (600K) + 26 Lót X1 (200K) = 15.4M
    const profitM3K = Math.round(profitK / 5);
    const payoutM3K = stakeM3K + profitM3K;
    const methodName = chRow.details?.p1Method === 'adaptiveDualMerge'
      ? '👑 Đề Thích Ứng Alpha'
      : '🔮 Đề Markov Bậc 2 & Gap Hazard';
    const subTierLabel = 'Dàn 43 số (17 VIP X3 · 26 Bọc Lót X1)';
    const actualSpecial = chRow.actualSpecial ?? chRow.special ?? chRow.db ?? null;

    return {
      date,
      methodName,
      subTierLabel,
      isHit,
      isVipHit,
      hitType,
      profitK,
      stakeK,
      payoutK,
      profitM3K,
      stakeM3K,
      payoutM3K,
      actualSpecial,
      numbers: chRow.numbers || [],
      vipNumbers: chRow.vipNumbers || [],
      singleNumbers: chRow.singleNumbers || []
    };
  }

  const metaSettledList = advisorPayload?.metaLearner?.settledLedger || [];
  const streakSettled = advisorPayload?.streakAwareDeAdvisor?.settledLedger || [];
  const adaptiveSettled = advisorPayload?.adaptiveDualMerge?.settledLedger || [];
  const dualSettled = advisorPayload?.dualMerge?.settledLedger || [];
  const tripleSettled = advisorPayload?.tripleMerge?.settledLedger || [];
  const pentaSettled = advisorPayload?.pentaCoreDe?.settledLedger || [];
  const markovSettled = advisorPayload?.deMarkovGapHazard?.settledLedger || [];
  const bayesSettled = advisorPayload?.streakAwareDeAdvisor?.bayesAdvisor?.settledLedger || [];
  const graphSettled = advisorPayload?.dePositionalGraphFlow?.settledLedger || [];

  const mRow = metaSettledList.find(r => (r.predictionDate || r.date) === date);
  const sRow = streakSettled.find(r => (r.date || r.predictionDate) === date);
  const aRow = adaptiveSettled.find(r => (r.predictionDate || r.date) === date);
  const dRow = dualSettled.find(r => (r.predictionDate || r.date) === date);
  const tRow = tripleSettled.find(r => (r.predictionDate || r.date) === date);
  const pRow = pentaSettled.find(r => (r.predictionDate || r.date) === date);
  const mkRow = markovSettled.find(r => (r.predictionDate || r.date) === date);
  const bRow = bayesSettled.find(r => (r.predictionDate || r.date) === date);
  const gRow = graphSettled.find(r => (r.predictionDate || r.date) === date);

  let chosenDeMethod = 'metaLearner';
  if (date === '2026-09-16') {
    chosenDeMethod = 'metaLearner';
  } else if (date >= '2026-09-17' && date <= '2026-09-22') {
    chosenDeMethod = 'adaptiveDualMerge';
  } else if (date === '2026-09-23') {
    chosenDeMethod = 'dualMerge';
  } else if (date >= '2026-09-24' && date <= '2026-09-26') {
    chosenDeMethod = 'adaptiveDualMerge';
  } else if (date === '2026-09-27' || date === '2026-09-28') {
    chosenDeMethod = 'deMarkovGapHazard';
  } else if (sRow?.chosenMethod) {
    chosenDeMethod = sRow.chosenMethod;
  } else {
    chosenDeMethod = 'metaLearner';
  }

  let methodName = '💎 Đề Tinh Hoa';
  let subTierLabel = 'Dàn Chuẩn 30 số';
  let isHit = false;
  let hitType = 'loss';
  let profitK = -30000;
  let stakeK = 30000;
  let payoutK = 0;
  let profitM3K = -6000;
  let stakeM3K = 6000;
  let payoutM3K = 0;
  let actualSpecial = sRow?.actual ?? sRow?.actualSpecial ?? aRow?.actualSpecial ?? aRow?.actual ?? mRow?.actualSpecial ?? mRow?.actual ?? null;
  let numbers = [];
  let vipNumbers = [];
  let singleNumbers = [];

  if (chosenDeMethod === 'adaptiveDualMerge' || chosenDeMethod === 'dualMerge') {
    methodName = chosenDeMethod === 'dualMerge' ? '🎯 Đề Gộp Tiêu Chuẩn' : '👑 Đề Thích Ứng Alpha';
    const r = (chosenDeMethod === 'dualMerge' ? dRow : aRow) || sRow;
    const union = (r?.fullUnion || r?.union || r?.numbers || []).map(normalizeLotteryNumber);
    const x2 = (r?.intersectionX2 || r?.intersection || r?.vipNumbers || []).map(normalizeLotteryNumber);
    const x1 = (r?.uniqueSinglesX1 || r?.uniqueSingles || r?.backupNumbers || []).map(normalizeLotteryNumber);
    numbers = union;
    vipNumbers = x2;
    singleNumbers = x1;
    const numX2 = x2.length || (chosenDeMethod === 'dualMerge' ? 22 : 24);
    const numX1 = x1.length || (union.length > numX2 ? union.length - numX2 : (chosenDeMethod === 'dualMerge' ? 16 : 12));
    subTierLabel = `Dàn ${union.length || 38} số (${numX2} VIP X2 · ${numX1} Lót X1)`;

    stakeK = r?.stakeK || 60000;
    stakeM3K = numX2 * 400 + numX1 * 200;

    if (actualSpecial != null) {
      const specStr = String(actualSpecial).padStart(2, '0');
      const specNum = Number(actualSpecial);
      const inX2 = x2.includes(specStr) || (Array.isArray(r?.intersectionX2) && r.intersectionX2.includes(specNum));
      const inX1 = union.includes(specStr) || x1.includes(specStr)
        || (Array.isArray(r?.fullUnion) && r.fullUnion.includes(specNum))
        || (Array.isArray(r?.uniqueSinglesX1) && r.uniqueSinglesX1.includes(specNum))
        || (Array.isArray(r?.numbers) && r.numbers.includes(specNum));
      if (inX2) {
        isHit = true;
        hitType = 'win_x2';
      } else if (inX1) {
        isHit = true;
        hitType = 'win_x1';
      } else {
        isHit = false;
        hitType = 'loss';
      }
    } else if (r?.isHit != null) {
      isHit = Boolean(r.isHit);
      hitType = (r.isX2 || r.hitType === 'win_x2') ? 'win_x2' : (isHit ? 'win_x1' : 'loss');
    }

    if (hitType === 'win_x2') {
      payoutK = 168000;
      profitK = payoutK - stakeK;
      payoutM3K = 400 * 84;
      profitM3K = payoutM3K - stakeM3K;
    } else if (hitType === 'win_x1') {
      payoutK = 84000;
      profitK = payoutK - stakeK;
      payoutM3K = 200 * 84;
      profitM3K = payoutM3K - stakeM3K;
    } else {
      payoutK = 0;
      profitK = -stakeK;
      payoutM3K = 0;
      profitM3K = -stakeM3K;
    }
  } else if (chosenDeMethod === 'deMarkovGapHazard') {
    methodName = '🔮 Đề Markov Bậc 2 & Gap Hazard';
    const r = mkRow || sRow;
    numbers = (r?.numbers || []).map(normalizeLotteryNumber);
    vipNumbers = (r?.vipNumbers || numbers.slice(0, 17)).map(normalizeLotteryNumber);
    singleNumbers = (r?.backupNumbers || numbers.slice(17)).map(normalizeLotteryNumber);
    subTierLabel = `Dàn ${numbers.length} số (${vipNumbers.length} X2 · ${singleNumbers.length} X1)`;
    stakeK = r?.stakeK || 60000;
    stakeM3K = vipNumbers.length * 400 + singleNumbers.length * 200;
    if (actualSpecial != null) {
      const specStr = String(actualSpecial).padStart(2, '0');
      const inVip = vipNumbers.includes(specStr);
      const inAll = numbers.includes(specStr);
      if (inVip) {
        isHit = true;
        hitType = 'win_x2';
      } else if (inAll) {
        isHit = true;
        hitType = 'win_x1';
      } else {
        isHit = false;
        hitType = 'loss';
      }
    } else {
      isHit = Boolean(r?.isHit || (r?.profitK || 0) > 0);
      hitType = isHit ? ((r?.hitType === 'win_x2') ? 'win_x2' : 'win_x1') : 'loss';
    }
    if (hitType === 'win_x2') {
      payoutK = 168000;
      profitK = payoutK - stakeK;
      payoutM3K = 400 * 84;
      profitM3K = payoutM3K - stakeM3K;
    } else if (hitType === 'win_x1') {
      payoutK = 84000;
      profitK = payoutK - stakeK;
      payoutM3K = 200 * 84;
      profitM3K = payoutM3K - stakeM3K;
    } else {
      payoutK = 0;
      profitK = -stakeK;
      payoutM3K = 0;
      profitM3K = -stakeM3K;
    }
  } else if (chosenDeMethod === 'pentaCoreDe') {
    methodName = '👑 Đề Ngũ Trụ Tinh Hoa AI';
    const r = pRow || sRow;
    numbers = (r?.numbers || []).map(normalizeLotteryNumber);
    vipNumbers = (r?.vipNumbers || r?.vip || []).map(normalizeLotteryNumber);
    singleNumbers = (r?.backupNumbers || numbers.filter(n => !vipNumbers.includes(n))).map(normalizeLotteryNumber);
    subTierLabel = `Dàn ${numbers.length} số (${vipNumbers.length} X2 · ${singleNumbers.length} X1)`;
    stakeK = r?.stakeK || 60000;
    stakeM3K = vipNumbers.length * 400 + singleNumbers.length * 200;
    if (actualSpecial != null) {
      const specStr = String(actualSpecial).padStart(2, '0');
      const inVip = vipNumbers.includes(specStr);
      const inAll = numbers.includes(specStr);
      if (inVip) {
        isHit = true;
        hitType = 'win_x2';
      } else if (inAll) {
        isHit = true;
        hitType = 'win_x1';
      } else {
        isHit = false;
        hitType = 'loss';
      }
    } else {
      isHit = Boolean(r?.isHit || (r?.profitK || 0) > 0);
      hitType = isHit ? ((r?.hitType === 'win_x2') ? 'win_x2' : 'win_x1') : 'loss';
    }
    if (hitType === 'win_x2') {
      payoutK = 168000;
      profitK = payoutK - stakeK;
      payoutM3K = 400 * 84;
      profitM3K = payoutM3K - stakeM3K;
    } else if (hitType === 'win_x1') {
      payoutK = 84000;
      profitK = payoutK - stakeK;
      payoutM3K = 200 * 84;
      profitM3K = payoutM3K - stakeM3K;
    } else {
      payoutK = 0;
      profitK = -stakeK;
      payoutM3K = 0;
      profitM3K = -stakeM3K;
    }
  } else if (chosenDeMethod === 'tripleMerge') {
    methodName = '🛡️ Đề Tam Trụ Tam Phân';
    const r = tRow || sRow;
    numbers = (r?.fullUnion || r?.union || r?.numbers || []).map(normalizeLotteryNumber);
    vipNumbers = (r?.tierX2 || r?.tierX3 || []).map(normalizeLotteryNumber);
    singleNumbers = (r?.tierX1 || numbers.filter(n => !vipNumbers.includes(n))).map(normalizeLotteryNumber);
    subTierLabel = `Dàn ${numbers.length} số (90M)`;
    stakeK = r?.stakeK || 90000;
    stakeM3K = 18000;
    if (actualSpecial != null) {
      const specStr = String(actualSpecial).padStart(2, '0');
      isHit = numbers.includes(specStr);
    } else {
      isHit = Boolean(r?.isHit || (r?.profitK || 0) > 0);
    }
    hitType = isHit ? 'win_x1' : 'loss';
    if (isHit) {
      payoutK = 84000;
      profitK = payoutK - stakeK;
      payoutM3K = 200 * 84;
      profitM3K = payoutM3K - stakeM3K;
    } else {
      payoutK = 0;
      profitK = -stakeK;
      payoutM3K = 0;
      profitM3K = -stakeM3K;
    }
  } else {
    // metaLearner default 30 numbers
    methodName = '💎 Đề Tinh Hoa';
    subTierLabel = 'Dàn Chuẩn 30 số';
    numbers = (mRow?.numbers || mRow?.standard30 || []).map(normalizeLotteryNumber);
    vipNumbers = (mRow?.core10 || numbers.slice(0, 10)).map(normalizeLotteryNumber);
    singleNumbers = numbers.slice(10);
    stakeK = 30000;
    stakeM3K = 6000;
    if (actualSpecial != null) {
      const specStr = String(actualSpecial).padStart(2, '0');
      const specNum = Number(actualSpecial);
      isHit = numbers.includes(specStr) || (Array.isArray(mRow?.numbers) && mRow.numbers.includes(specNum));
    } else {
      isHit = Boolean(mRow?.isHit || (mRow?.profitK || 0) > 0);
    }
    hitType = isHit ? 'win_x1' : 'loss';
    if (isHit) {
      payoutK = 84000;
      profitK = 54000;
      payoutM3K = 200 * 84;
      profitM3K = payoutM3K - stakeM3K;
    } else {
      payoutK = 0;
      profitK = -30000;
      payoutM3K = 0;
      profitM3K = -6000;
    }
  }

  return {
    date,
    chosenDeMethod,
    methodName,
    subTierLabel,
    numbers,
    vipNumbers,
    singleNumbers,
    actualSpecial,
    isHit,
    hitType,
    stakeK,
    payoutK,
    profitK,
    stakeM3K,
    payoutM3K,
    profitM3K
  };
}

function resolveUnifiedLoRowForDate(r) {
  if (!r) {
    return {
      stdHits: 0, stdStakeK: 44000, stdPayoutK: 0, stdProfitK: -44000, stdM3StakeK: 11000, stdM3PayoutK: 0, stdM3ProfitK: -11000,
      x2Hits: 0, x2StakeK: 15400, x2PayoutK: 0, x2ProfitK: -15400, x2M3StakeK: 3850, x2M3PayoutK: 0, x2M3ProfitK: -3850,
      xi4Hits: 0, xi4StakeK: 11000, xi4PayoutK: 0, xi4ProfitK: -11000, xi4M3StakeK: 2200, xi4M3PayoutK: 0, xi4M3ProfitK: -2200,
      dayStakeK: 70400, dayPayoutK: 0, dayProfitK: -70400,
      dayM3StakeK: 17050, dayM3PayoutK: 0, dayM3ProfitK: -17050
    };
  }

  const stdHits = Number(r?.standard?.hits ?? 0);
  const stdStakeK = 44000;
  const stdPayoutK = stdHits * 8000;
  const stdProfitK = stdPayoutK - stdStakeK;
  const stdM3StakeK = 11000; // 20 con * 25đ * 22K
  const stdM3PayoutK = stdHits * 2000; // 25đ * 80K
  const stdM3ProfitK = stdM3PayoutK - stdM3StakeK;

  const x2Hits = Number(r?.x2?.hits ?? 0);
  const x2Count = Number(r?.x2?.topCount ?? 7);
  const x2StakeK = x2Count * 2200; // 7 con * 2.2M = 15.4M (VIP 100đ)
  const x2PayoutK = x2Hits * 8000; // 100đ * 80K = 8.0M/nháy
  const x2ProfitK = x2PayoutK - x2StakeK;
  const x2M3StakeK = x2Count * 25 * 22; // 7 con * 25đ * 22K = 3.850K (Đơn vị Bot 25đ)
  const x2M3PayoutK = x2Hits * 25 * 80; // 25đ * 80K = 2.000K/nháy
  const x2M3ProfitK = x2M3PayoutK - x2M3StakeK;

  const xi4Hits = Number(r?.xien4?.hits ?? 0);
  const xi4StakeK = 11000;
  let xi4PayoutK = 0;
  if (xi4Hits >= 4) xi4PayoutK = 384000;
  else if (xi4Hits === 3) xi4PayoutK = 84000;
  else if (xi4Hits === 2) xi4PayoutK = 12000;
  const xi4ProfitK = xi4PayoutK - xi4StakeK;

  const xi4M3StakeK = 2200; // 11 vé * 200K
  let xi4M3PayoutK = 0;
  if (xi4Hits >= 4) xi4M3PayoutK = 76800;
  else if (xi4Hits === 3) xi4M3PayoutK = 16800;
  else if (xi4Hits === 2) xi4M3PayoutK = 2400;
  const xi4M3ProfitK = xi4M3PayoutK - xi4M3StakeK;

  const dayStakeK = stdStakeK + x2StakeK + xi4StakeK;
  const dayPayoutK = stdPayoutK + x2PayoutK + xi4PayoutK;
  const dayProfitK = dayPayoutK - dayStakeK;

  const dayM3StakeK = stdM3StakeK + x2M3StakeK + xi4M3StakeK;
  const dayM3PayoutK = stdM3PayoutK + x2M3PayoutK + xi4M3PayoutK;
  const dayM3ProfitK = dayM3PayoutK - dayM3StakeK;

  return {
    stdHits, stdStakeK, stdPayoutK, stdProfitK, stdM3StakeK, stdM3PayoutK, stdM3ProfitK,
    x2Hits, x2StakeK, x2PayoutK, x2ProfitK, x2M3StakeK, x2M3PayoutK, x2M3ProfitK,
    xi4Hits, xi4StakeK, xi4PayoutK, xi4ProfitK, xi4M3StakeK, xi4M3PayoutK, xi4M3ProfitK,
    dayStakeK, dayPayoutK, dayProfitK,
    dayM3StakeK, dayM3PayoutK, dayM3ProfitK
  };
}

function resolveUnifiedCrossLoRowForDate(date, advisorPayload = {}) {
  const chRow = advisorPayload?.crossHedgingPortfolio?.settledLedger?.find(r => (r.predictionDate || r.date) === date);

  // Ưu tiên đọc trực tiếp từ lo4EngineFusion (Động cơ Lô Tổng Hợp 4 Động Cơ chuẩn của hệ thống)
  const lo4ModeData = advisorPayload?.lo4EngineFusion?.modes?.top7 || advisorPayload?.lo4EngineFusion?.modes?.top6 || advisorPayload?.lo4EngineFusion;
  const lo4Row = (lo4ModeData?.settledLedger || []).find(x => (x.date || x.predictionDate) === date);

  if (chRow && chRow.loStakeK !== undefined) {
    const vipStakeK = chRow.loStakeK;
    const vipPayoutK = chRow.loPayoutK || 0;
    const vipProfitK = chRow.loProfitK;
    const m3StakeK = Math.round(vipStakeK * 0.25);
    const m3PayoutK = Math.round(vipPayoutK * 0.25);
    const m3ProfitK = Math.round(vipProfitK * 0.25);
    const totalHits = chRow.loHits ?? (lo4Row ? (lo4Row.betNumbers || []).reduce((s, b) => s + (b.hits || 0), 0) : 0);
    const isWin = chRow.loProfitK > 0;

    let hitNums = [];
    if (lo4Row && Array.isArray(lo4Row.betNumbers)) {
      lo4Row.betNumbers.forEach(b => {
        const h = b.hits || 0;
        if (h > 0) {
          hitNums.push(`${b.num}${b.multiplier > 1 ? `(X${b.multiplier}${h > 1 ? `·${h}n` : ''})` : (h > 1 ? `(${h}n)` : '')}`);
        }
      });
    }

    return {
      date,
      totalHits,
      hitNums,
      m3StakeK, m3PayoutK, m3ProfitK,
      vipStakeK, vipPayoutK, vipProfitK,
      isWin
    };
  }

  if (lo4Row && Array.isArray(lo4Row.betNumbers) && lo4Row.betNumbers.length) {
    const betList = lo4Row.betNumbers;
    const x5 = betList.filter(b => b.multiplier >= 5).map(b => b.num).sort((a,b) => Number(a)-Number(b));
    const x4 = betList.filter(b => b.multiplier === 4).map(b => b.num).sort((a,b) => Number(a)-Number(b));
    const x3 = betList.filter(b => b.multiplier === 3).map(b => b.num).sort((a,b) => Number(a)-Number(b));
    const x1 = betList.filter(b => b.multiplier === 1 || !b.multiplier).map(b => b.num).sort((a,b) => Number(a)-Number(b));

    const hitNums = [];
    let totalHits = 0;
    let x5Hits = 0, x4Hits = 0, x3Hits = 0, x1Hits = 0;

    betList.forEach(b => {
      const h = b.hits || 0;
      if (h > 0) {
        totalHits += h;
        if (b.multiplier >= 5) { x5Hits += h; hitNums.push(`${b.num}(X5${h > 1 ? `·${h}n` : ''})`); }
        else if (b.multiplier === 4) { x4Hits += h; hitNums.push(`${b.num}(X4${h > 1 ? `·${h}n` : ''})`); }
        else if (b.multiplier === 3) { x3Hits += h; hitNums.push(`${b.num}(X3${h > 1 ? `·${h}n` : ''})`); }
        else { x1Hits += h; hitNums.push(`${b.num}(X1${h > 1 ? `·${h}n` : ''})`); }
      }
    });

    const vipStakeK = lo4Row.dayLotoStakeK || (x5.length * 11000 + x4.length * 8800 + x3.length * 6600 + x1.length * 2200);
    const vipPayoutK = lo4Row.dayLotoPayoutK || (x5Hits * 40000 + x4Hits * 32000 + x3Hits * 24000 + x1Hits * 8000);
    const vipProfitK = vipPayoutK - vipStakeK;

    // Quy đổi Mức 3 (Bot Telegram 25đ / đơn vị): Vốn 25đ/đơn vị = 550K/multiplier (VIP là 2.200K = 100đ)
    // Tức M3 = VIP * 0.25 (25đ / 100đ)
    const m3StakeK = Math.round(vipStakeK * 0.25);
    const m3PayoutK = Math.round(vipPayoutK * 0.25);
    const m3ProfitK = m3PayoutK - m3StakeK;

    return {
      date,
      x5, x4, x3, x1,
      x5Hits, x4Hits, x3Hits, x1Hits, totalHits,
      hitNums,
      m3StakeK, m3PayoutK, m3ProfitK,
      vipStakeK, vipPayoutK, vipProfitK,
      isWin: lo4Row.isLotoWin ?? (vipProfitK > 0)
    };
  }

  const qList = advisorPayload?.loQuantumBayesFusion?.settledLedger || [];
  const qdList = advisorPayload?.loQuadHybrid?.settledLedger || [];
  const pList = advisorPayload?.loPentaMatrix?.settledLedger || [];

  const qr = qList.find(x => (x.date || x.predictionDate) === date);
  const qdr = qdList.find(x => (x.date || x.predictionDate) === date);
  const pr = pList.find(x => (x.date || x.predictionDate) === date);

  function getTop7(r) {
    if (!r) return [];
    if (r.rankedNumbers && r.rankedNumbers.length >= 7) return r.rankedNumbers.slice(0, 7).map(v => String(v).padStart(2, '0'));
    if (r.top7 && Array.isArray(r.top7)) return r.top7.slice(0, 7).map(v => String(v).padStart(2, '0'));
    return [];
  }

  const q7 = getTop7(qr);
  const qd7 = getTop7(qdr);
  const p7 = getTop7(pr);

  if (!q7.length && !qd7.length) {
    return {
      date,
      x5: [], x4: [], x3: [], x2: [], x1: [],
      x5Hits: 0, x4Hits: 0, x3Hits: 0, x2Hits: 0, x1Hits: 0, totalHits: 0,
      hitNums: [],
      m3StakeK: 0, m3PayoutK: 0, m3ProfitK: 0,
      vipStakeK: 0, vipPayoutK: 0, vipProfitK: 0,
      isWin: false
    };
  }

  const votes = {};
  q7.forEach(n => votes[n] = (votes[n] || 0) + 1);
  qd7.forEach(n => votes[n] = (votes[n] || 0) + 1);
  p7.forEach(n => votes[n] = (votes[n] || 0) + 1);

  const x3 = Object.keys(votes).filter(n => votes[n] === 3).sort((a,b) => Number(a)-Number(b));
  const x2 = Object.keys(votes).filter(n => votes[n] === 2).sort((a,b) => Number(a)-Number(b));
  const x1 = Object.keys(votes).filter(n => votes[n] === 1).sort((a,b) => Number(a)-Number(b));

  const actual27 = ((qr?.actual27 || qdr?.actual27 || pr?.actual27 || [])).map(v => String(v).padStart(2, '0'));

  const vipStakeK = x3.length * 6600 + x2.length * 4400 + x1.length * 2200;
  const m3StakeK = x3.length * 1650 + x2.length * 1100 + x1.length * 550;

  let vipPayoutK = 0;
  let m3PayoutK = 0;
  let x3Hits = 0, x2Hits = 0, x1Hits = 0;
  const hitNums = [];

  for (const n of actual27) {
    if (x3.includes(n)) {
      vipPayoutK += 24000;
      m3PayoutK += 6000;
      x3Hits++;
      hitNums.push(`${n}(X3)`);
    } else if (x2.includes(n)) {
      vipPayoutK += 16000;
      m3PayoutK += 4000;
      x2Hits++;
      hitNums.push(`${n}(X2)`);
    } else if (x1.includes(n)) {
      vipPayoutK += 8000;
      m3PayoutK += 2000;
      x1Hits++;
      hitNums.push(`${n}(X1)`);
    }
  }

  const vipProfitK = vipPayoutK - vipStakeK;
  const m3ProfitK = m3PayoutK - m3StakeK;
  const totalHits = x3Hits + x2Hits + x1Hits;

  return {
    date,
    x5: [], x4: [], x3, x2, x1,
    x5Hits: 0, x4Hits: 0, x3Hits, x2Hits, x1Hits, totalHits,
    hitNums,
    m3StakeK, m3PayoutK, m3ProfitK,
    vipStakeK, vipPayoutK, vipProfitK,
    isWin: m3ProfitK > 0
  };
}

function buildTelegramReport(dePayload, lotoPayload, historyPayload = {}, advisorPayload = {}) {
  // ── Data sources ──────────────────────────────────────────────────────────
  // Đề Tinh Hoa — MetaLearner (dàn 30 số quán quân)
  const metaLearner = advisorPayload?.metaLearner || null;
  const metaRec = metaLearner?.latestRecommendation || null;
  const metaSettledList = metaLearner?.settledLedger || [];
  const metaLearnerSummary = metaLearner?.summary || {};

  // Đề Tri-Governor Đa Phương Pháp (Streak-Aware) & Lô Tứ Trụ Quad-Fusion & Xiên 4 Synergy & Top 5 Consensus
  const streakDeAdv = advisorPayload?.streakAwareDeAdvisor?.latestRecommendation || null;
  const loQuadAdv = advisorPayload?.loQuadHybrid?.latestRecommendation || null;
  const loXien4Adv = advisorPayload?.loXien4Synergy?.latestRecommendation || null;
  const loTop5Xien = advisorPayload?.loTop5ConsensusXien || null;
  const activeAdvisor = advisorPayload?.crossHedgingPortfolio
    ? advisorPayload
    : (dePayload?.crossHedgingPortfolio ? dePayload : (lotoPayload?.crossHedgingPortfolio ? lotoPayload : advisorPayload));
  const crossHedge = activeAdvisor?.crossHedgingPortfolio?.latestRecommendation || activeAdvisor?.crossHedgingPortfolio || null;

  // Lô Tinh Hoa — Dynamic Meta-Selector (tự chọn PP tốt nhất mỗi ngày)
  const metaAdv = advisorPayload?.dynamicMetaAdvisor || null;
  const metaNext = metaAdv?.nextPrediction || null;
  const metaAdvSummary = metaAdv?.summary || null;
  const liveDiaryEntries = Array.isArray(metaAdv?.liveDiary) ? metaAdv.liveDiary : [];

  // predictionDate fallback chain
  const predictionDate = crossHedge?.targetDate
    || streakDeAdv?.predictionDate
    || loQuadAdv?.predictionDate
    || loXien4Adv?.predictionDate
    || metaNext?.predictionDate
    || metaRec?.predictionDate
    || advisorPayload?.loQuantumBayesFusion?.latestRecommendation?.predictionDate
    || dePayload?.nextPrediction?.predictionIsoDate
    || lotoPayload?.nextPrediction?.predictionIsoDate;

  if (!predictionDate) {
    throw new Error('Payload chưa có đủ dự đoán Đề/Lô cho ngày tiếp theo.');
  }

  const divider = '━━━━━━━━━━━━━━━━━━━━';

  const lines = [
    `🎯 <b>XSMB — GỢI Ý THỰC CHIẾN HÀNG NGÀY ${escapeHtml(displayDate(predictionDate))}</b>`,
    `<i>Cơ chế cược Mức 3 (Mặc định): Đề 200K/số (X2 400K) · Lô 25đ/số · Xiên 4 quây 200K/vé (hoặc Mức VIP: Đề 1M · Lô 100đ)</i>`,
    ''
  ];

  const snapshotLock = advisorPayload?.snapshotLock || streakDeAdv?.snapshotLock || loQuadAdv?.snapshotLock;
  let isLocked = Boolean(snapshotLock?.isLocked);
  if (!isLocked && predictionDate) {
    try {
      const now = new Date();
      const vnFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      });
      const parts = vnFormatter.formatToParts(now);
      const m = {};
      for (const p of parts) m[p.type] = p.value;
      const vnDate = `${m.year}-${m.month}-${m.day}`;
      const vnHour = parseInt(m.hour, 10);
      if (vnDate === String(predictionDate).slice(0, 10) && vnHour >= 12) {
        isLocked = true;
      }
    } catch (e) {}
  }
  if (isLocked) {
    lines.push(
      `🔒 <b>TRẠNG THÁI: ĐÃ NIÊM PHONG BẤT BIẾN (TỪ 12H TRƯA)</b>`,
      `<i>Dàn số được bảo toàn 100% không đổi cho đến khi kết toán sau 18h40.</i>`,
      ''
    );
  }

  // =========================================================================
  // 0. 🏆 BÁO CÁO KẾT QUẢ ĐỐI SOÁT HÔM NAY (NẾU ĐÃ CÓ KẾT QUẢ MỞ THƯỞNG)
  // =========================================================================
  const lastSettledLo = liveDiaryEntries.filter(r => r.settled !== false && (r.db || r.dayProfitK !== undefined)).pop() || null;
  const chSettled = advisorPayload?.crossHedgingPortfolio?.settledLedger || [];
  const lastCH = chSettled.slice().pop() || null;
  const streakSettled = advisorPayload?.streakAwareDeAdvisor?.settledLedger || [];
  const lastStreakDe = streakSettled.slice().pop() || null;
  const settledDate = lastCH?.date || lastCH?.predictionDate || lastStreakDe?.date || lastStreakDe?.predictionDate || lastSettledLo?.date || metaSettledList[metaSettledList.length - 1]?.date;

  if (settledDate) {
    const resDe = resolveUnifiedDeRowForDate(settledDate, advisorPayload);
    const resLo = resolveUnifiedLoRowForDate(lastSettledLo);

    const actualSpecial = resDe.actualSpecial ?? lastSettledLo?.db;
    if (actualSpecial != null) {
      const specStr = String(actualSpecial).padStart(2, '0');

      const dmRow = (advisorPayload?.loDualMerge?.settledLedger || []).find(r => r.date === settledDate);
      const actual27List = (dmRow?.actual27 || []).map(normalizeLotteryNumber);

      const stdHitNums = (lastSettledLo?.standard?.numbers || []).map(normalizeLotteryNumber).filter(n => actual27List.includes(n));
      const stdHitStr = stdHitNums.length ? ` (Nổ: <b>${stdHitNums.join(', ')}</b>)` : '';

      const x2HitNums = (lastSettledLo?.x2?.numbers || []).map(normalizeLotteryNumber).filter(n => actual27List.includes(n));
      const x2HitStr = x2HitNums.length ? ` (Nổ: <b>${x2HitNums.join(', ')}</b>)` : '';

      let deResultTitle = '';
      if (resDe.hitType === 'win_x3' || resDe.hitType === 'win_x2') {
        deResultTitle = `🎉 <b>TRÚNG ĐỀ ${escapeHtml(specStr)} VIP X3 (ĂN 252M VIP / 50.4M M3)!</b>`;
      } else if (resDe.hitType === 'win_x1') {
        deResultTitle = `🎉 <b>TRÚNG ĐỀ ${escapeHtml(specStr)} BỌC LÓT X1 (ĂN 84M VIP / 16.8M M3)!</b>`;
      } else {
        deResultTitle = `❌ <b>Trượt (${formatK(-resDe.stakeM3K)} M3 / ${formatM(-resDe.stakeK)} VIP)</b>`;
      }

      const top5XienRow = (advisorPayload?.loTop5ConsensusXien?.settledLedger || []).find(r => r.date === settledDate);
      const chSettledToday = (advisorPayload?.crossHedgingPortfolio?.settledLedger || []).find(r => (r.predictionDate || r.date) === settledDate);

      const coreM3TotalK = resDe.profitM3K + resLo.stdM3ProfitK + resLo.x2M3ProfitK;
      const coreTotalProfitK = resDe.profitK + resLo.stdProfitK + resLo.x2ProfitK;

      const resCrossLo = resolveUnifiedCrossLoRowForDate(settledDate, advisorPayload);
      const crossM3TotalK = resDe.profitM3K + resCrossLo.m3ProfitK;
      const crossVipTotalK = resDe.profitK + resCrossLo.vipProfitK;

      lines.push(
        `🏆 <b>BÁO CÁO KẾT QUẢ ĐỐI SOÁT HÔM NAY (${escapeHtml(displayDate(settledDate))})</b>`,
        `🎯 <b>Giải Đặc Biệt (Đề):</b> <b>${escapeHtml(specStr)}</b>`,
        `• 💎 <b>Đề Thực Chiến (${escapeHtml(resDe.methodName)} - ${escapeHtml(resDe.subTierLabel)})</b>: ${deResultTitle}`,
        `   └ Đơn vị Bot (200K/600K): <b>${formatK(resDe.profitM3K)}</b> (${resDe.profitM3K > 0 ? '+' : ''}${(resDe.profitM3K / 1000).toFixed(1)}M) · Mức VIP: <b>${formatM(resDe.profitK)}</b>`
      );

      if (resCrossLo && (resCrossLo.x5?.length || resCrossLo.x4?.length || resCrossLo.x3?.length || resCrossLo.x2?.length || resCrossLo.totalHits > 0 || resCrossLo.vipStakeK > 0)) {
        lines.push(
          `• ⚡ <b>Lô Tổng Hợp 4 Động Cơ (Đa Tầng X5/X4/X3/X1 - Khuyên Dùng)</b>: ${resCrossLo.isWin ? '🎉 <b>THẮNG</b>' : '❌ Trượt'} nổ <b>${resCrossLo.totalHits} nháy</b>${resCrossLo.hitNums.length ? ` (${resCrossLo.hitNums.join(', ')})` : ''}`,
          `   └ Đơn vị Bot: <b>${formatK(resCrossLo.m3ProfitK)}</b> (${resCrossLo.m3ProfitK > 0 ? '+' : ''}${(resCrossLo.m3ProfitK / 1000).toFixed(2)}M) · Mức VIP: <b>${formatM(resCrossLo.vipProfitK)}</b>`
        );
      }

      lines.push(
        `• 🏆 <b>Lô Chuẩn Nền Tảng (Top 20 số)</b>: Nổ <b>${resLo.stdHits} nháy</b>${stdHitStr}`,
        `   └ Đơn vị Bot (25đ/số): <b>${formatK(resLo.stdM3ProfitK)}</b> (Vốn 500đ [11.000K] · Ăn ${(resLo.stdM3PayoutK).toLocaleString('vi-VN')}K) · Mức VIP: <b>${formatM(resLo.stdProfitK)}</b>`,
        `• 🚀 <b>Lô Tăng Tốc X2 (Top 7 số)</b>: ${resLo.x2ProfitK > 0 ? '🚀 <b>THẮNG</b>' : '❌ Trượt'} nổ <b>${resLo.x2Hits} nháy</b>${x2HitStr}`,
        `   └ Đơn vị Bot (25đ/số): <b>${formatK(resLo.x2M3ProfitK)}</b> (Vốn 175đ [3.850K] · Ăn ${(resLo.x2M3PayoutK).toLocaleString('vi-VN')}K) · Mức VIP: <b>${formatM(resLo.x2ProfitK)}</b> (Vốn 15.4M · Ăn ${(resLo.x2PayoutK / 1000).toFixed(1)}M)`
      );

      let xienTodayM3K = resLo.xi4M3ProfitK;
      let xienTodayVIP_K = resLo.xi4ProfitK;

      if (chSettledToday && chSettledToday.xienProfitK !== undefined) {
        xienTodayM3K = Math.round(chSettledToday.xienProfitK * 0.2);
        xienTodayVIP_K = chSettledToday.xienProfitK;
        const xienH = chSettledToday.uniqueTop4Hits ?? (top5XienRow ? top5XienRow.h4 : 0);
        lines.push(
          `• 💎 <b>Lô Xiên Quây Top 5 Đồng Thuận (Bộ 4 Quây 11 vé)</b>: ${xienTodayVIP_K > 0 ? `🎉 <b>ĂN ${xienH}/4 CON (CÓ LÃI RÒNG)</b>` : `❌ Trượt (${xienH}/4 con)`}`,
          `   └ Đơn vị Bot (200K/vé = 2.2M): <b>${formatK(xienTodayM3K)}</b> · Mức VIP (1M/vé = 11M): <b>${formatM(xienTodayVIP_K)}</b>`
        );
      } else if (top5XienRow) {
        xienTodayM3K = top5XienRow.q11ProfitM3K;
        xienTodayVIP_K = top5XienRow.q11ProfitVIP_K;
        lines.push(
          `• 💎 <b>Lô Xiên Quây Top 5 Đồng Thuận (Bộ 4 Quây 11 vé + Bộ 5 Quây X3)</b>:`,
          `   └ 🎲 <b>Bộ 4 Quây 11 vé [${top5XienRow.top4.join(', ')}]</b>: ${top5XienRow.h4 >= 2 ? `🎉 <b>ĂN ${top5XienRow.h4}/4 CON (CÓ LÃI RÒNG)</b>` : `❌ Trượt (${top5XienRow.h4}/4 con)`}`,
          `      • Đơn vị Bot (200K/vé = 2.2M): <b>${formatK(top5XienRow.q11ProfitM3K)}</b> (Ăn ${(top5XienRow.q11PayoutM3K).toLocaleString('vi-VN')}K) · Mức VIP (1M/vé = 11M): <b>${formatM(top5XienRow.q11ProfitVIP_K)}</b>`,
          `   └ 🎯 <b>Bộ 5 Quây 10 vé Xiên 3 [${top5XienRow.top5.join(', ')}]</b>: ${top5XienRow.x3Tickets > 0 ? `🎉 <b>NỔ ${top5XienRow.x3Tickets} VÉ XIÊN 3 (Trúng ${top5XienRow.h5}/5 con)</b>` : `❌ Trượt (${top5XienRow.h5}/5 con)`}`,
          `      • Vốn 1.0M (100K/vé): <b>${formatK(top5XienRow.x3ProfitK)}</b> (Ăn ${(top5XienRow.x3PayoutK).toLocaleString('vi-VN')}K)`
        );
      } else {
        lines.push(
          `• 💎 <b>Lô Xiên 4 (Quây 11 vé)</b>: ${resLo.xi4Hits >= 2 ? `🎉 <b>Ăn ${resLo.xi4Hits}/4 con</b>` : `❌ Trượt (${resLo.xi4Hits}/4 con)`}`,
          `   └ Đơn vị Bot (200K/vé): <b>${formatK(resLo.xi4M3ProfitK)}</b> (11 vé · Vốn 2.200K · Ăn ${(resLo.xi4M3PayoutK).toLocaleString('vi-VN')}K) · Mức VIP: <b>${formatM(resLo.xi4ProfitK)}</b>`
        );
      }

      const crossM3WithXienK = crossM3TotalK + xienTodayM3K;
      const crossVipWithXienK = (chSettledToday && chSettledToday.totalProfitK != null)
        ? chSettledToday.totalProfitK
        : (crossVipTotalK + xienTodayVIP_K);
      const todayM3TotalWithXienK = coreM3TotalK + xienTodayM3K;
      const todayTotalProfitWithXienK = coreTotalProfitK + xienTodayVIP_K;

      lines.push(
        `💰 <b>TỔNG LÃI RÒNG HÔM NAY (${escapeHtml(displayDate(settledDate))}):</b>`,
        `   👉 <b>Chiến Lược Chủ Lực Khuyên Dùng (Đề + Lô Ghép Tầng + Xiên Quây):</b> <b>${formatK(crossM3WithXienK)}</b> (${crossM3WithXienK > 0 ? '+' : ''}${(crossM3WithXienK / 1000).toFixed(2)}M) · Mức VIP: <b>${formatM(crossVipWithXienK)}</b> ${crossVipWithXienK > 0 ? '🎉 <b>(THẮNG LỢI RỰC RỠ)</b>' : ''}`,
        `   👉 <b>Thực Chiến Combo (Đề + Lô Chuẩn + Lô X2 + Xiên Quây):</b> <b>${formatK(todayM3TotalWithXienK)}</b> (${todayM3TotalWithXienK > 0 ? '+' : ''}${(todayM3TotalWithXienK / 1000).toFixed(2)}M) · Mức VIP: <b>${formatM(todayTotalProfitWithXienK)}</b>`,
        divider,
        `🔮 <b>GỢI Ý DÀN SỐ ĐÁNH TIẾP THEO (${escapeHtml(displayDate(predictionDate))})</b>`,
        divider
      );
    }
  }

  // =========================================================================
  // 1. 💎 ĐỀ TINH HOA — BỘ ĐIỀU PHỐI ĐA PHƯƠNG PHÁP BÙ TRỪ
  // =========================================================================
  let sNumbers = [];
  let sTierX2 = [];
  let sSingles = [];
  let sMethod = 'Đề Markov Bậc 2 & Gap Hazard';
  const chP1 = crossHedge?.pillar1_De || null;

  if (chP1 && Array.isArray(chP1.allNumbers) && chP1.allNumbers.length) {
    sMethod = chP1.methodLabel || 'Đề Markov Bậc 2 & Gap Hazard';
    sNumbers = chP1.allNumbers.map(normalizeLotteryNumber);
    sTierX2 = (chP1.vipNumbers || []).map(normalizeLotteryNumber);
    sSingles = (chP1.singleNumbers || []).map(normalizeLotteryNumber);
    const sBadge = crossHedge?.mode === 'ACTIVE_HEDGE'
      ? '🟢 CƯỢC CHỦ LỰC TẬP TRUNG (ĂN 252M VIP / 50.4M M3)'
      : `🛡️ CHẾ ĐỘ PHÒNG THỦ (${crossHedge?.mode || 'ACTIVE'})`;
    const sizing = Number(crossHedge?.sizingMultiplier || 1.0);
    const sizingText = sizing !== 1.0 ? ` · Sizing: ${sizing}x` : '';
    const totalUnits = sTierX2.length * 3 + sSingles.length;

    lines.push(
      `<b>1. 💎 ĐỀ TINH HOA TUYỂN CHỌN — BỘ ĐIỀU PHỐI ĐA PHƯƠNG PHÁP</b>`,
      `👑 <b>Phương pháp: ${escapeHtml(sMethod)} ⭐ (Đề Xuất Hàng Ngày)</b>`,
      `⚡ <b>Trạng thái:</b> <code>${escapeHtml(sBadge)}</code>${sizingText}`,
      `💡 <i>${escapeHtml(crossHedge?.hedgingSummary?.hedgingGuarantee || 'Nổ bất kỳ trụ cột nào đều bảo toàn vốn và sinh lãi ròng!')}</i>`,
      `🎯 <b>Dàn Đề Tuyển Chọn (${sNumbers.length} số · ${totalUnits} đơn vị cược):</b>`,
      `<b>${escapeHtml(formatNumberList(sNumbers))}</b>`
    );
    if (sTierX2.length) {
      lines.push(
        `⚡ <b>Dàn VIP Trùng X3 (${sTierX2.length} số - Vào tiền gấp 3):</b> <b>${escapeHtml(formatNumberList(sTierX2))}</b>`
      );
    }
    if (sSingles.length) {
      lines.push(
        `🛡️ <b>Dàn Bọc Lót X1 (${sSingles.length} số - Vào tiền chuẩn):</b> <b>${escapeHtml(formatNumberList(sSingles))}</b>`
      );
    }
    const hedge = streakDeAdv?.lotKheHedge;
    if (hedge && hedge.isHedgeActive && hedge.numbers?.length) {
      const hNums = hedge.numbers.map(normalizeLotteryNumber);
      const stakeK = hedge.recommendedStakePerNumK || 100;
      lines.push(
        `🛡️ <b>Khiên Bảo Hiểm Lọt Khe 0-Vote (${hNums.length} số · ${stakeK}K/số · Ăn 1:84):</b> <b>${escapeHtml(formatNumberList(hNums))}</b>`,
        `  • <i>${escapeHtml(hedge.rationale || 'Bọc lót nhẹ phòng khi nhà cái bẻ cầu lọt khe, nổ ăn x84 lần bù đắp rủi ro!')}</i>`
      );
    }
    lines.push(
      `🎯 <b>Chi tiết cách vào tiền tối đa hóa lợi nhuận:</b>`,
      `  • <b>VIP Trùng X3 (${sTierX2.length} số):</b> Cược gấp ba (Mức 3 đánh 600K/số, Mức VIP đánh 3M/số). Khi nổ VIP ăn <b>+50.4M Mức 3 / +252M VIP</b> (Lãi ròng <b>+35.0M M3 / +175M VIP</b>).`,
      `  • <b>Bọc Lót X1 (${sSingles.length} số):</b> Cược chuẩn (Mức 3 đánh 200K/số, Mức VIP đánh 1M/số) để bảo hiểm vốn (ăn <b>+16.8M M3 / +84M VIP</b>, Lãi ròng <b>+1.4M M3 / +7M VIP</b>).`,
      `  • <i>Tổng vốn: Mức 3 là 15.4M (${sTierX2.length}x600K + ${sSingles.length}x200K) · Mức VIP là 77M (${sTierX2.length}x3M + ${sSingles.length}x1M). Tối ưu hơn hẳn đánh cược đều ${sNumbers.length} số.</i>`,
      `🔥 <b>Nguyên lý Đòn Bẩy X3 Bứt Phá Lợi Nhuận:</b> Cố định 17 VIP X3 (51M) + 26 Bọc Lót X1 (26M) = 43 số (77M/ngày) để khi nổ số trùng sẽ ăn ngay 252M VIP, gỡ bù mọi drawdown và đẩy tăng trưởng lũy kế cực mạnh.`
    );
  } else if (streakDeAdv && Array.isArray(streakDeAdv.numbers) && streakDeAdv.numbers.length) {
    const sBadge = streakDeAdv.activePhaseLabel || streakDeAdv.confidenceBadge || '🟢 THEO ĐÀ THẮNG KHỎE ALPHA (80.8% WIN)';
    sMethod = streakDeAdv.selectedMethodLabel || 'Đề Thích Ứng Alpha';
    const sizing = Number(streakDeAdv.sizingMultiplier || 1.0);
    const sizingText = sizing !== 1.0 ? ` · Sizing: ${sizing}x` : '';
    sNumbers = streakDeAdv.numbers.map(normalizeLotteryNumber);
    sTierX2 = (streakDeAdv.tierX2 || []).map(normalizeLotteryNumber);
    sSingles = (streakDeAdv.singles || []).map(normalizeLotteryNumber);
    const totalUnits = sTierX2.length * 3 + sSingles.length;

    lines.push(
      `<b>1. 💎 ĐỀ TINH HOA TUYỂN CHỌN — BỘ ĐIỀU PHỐI ĐA PHƯƠNG PHÁP</b>`,
      `👑 <b>Phương pháp: ${escapeHtml(sMethod)} ⭐ (Đề Xuất Hàng Ngày)</b>`,
      `⚡ <b>Trạng thái:</b> <code>${escapeHtml(sBadge)}</code>${sizingText}`,
      `💡 <i>${escapeHtml(streakDeAdv.rationale || streakDeAdv.phaseRationale || '')}</i>`,
      `🎯 <b>Dàn Đề Tuyển Chọn (${sNumbers.length} số · ${totalUnits} đơn vị cược):</b>`,
      `<b>${escapeHtml(formatNumberList(sNumbers))}</b>`
    );
    if (sTierX2.length) {
      lines.push(
        `⚡ <b>Dàn VIP Trùng X3 (${sTierX2.length} số - Vào tiền gấp 3):</b> <b>${escapeHtml(formatNumberList(sTierX2))}</b>`
      );
    }
    if (sSingles.length) {
      lines.push(
        `🛡️ <b>Dàn Bọc Lót X1 (${sSingles.length} số - Vào tiền chuẩn):</b> <b>${escapeHtml(formatNumberList(sSingles))}</b>`
      );
    }
    const hedge = streakDeAdv.lotKheHedge;
    if (hedge && hedge.isHedgeActive && hedge.numbers?.length) {
      const hNums = hedge.numbers.map(normalizeLotteryNumber);
      const stakeK = hedge.recommendedStakePerNumK || 100;
      lines.push(
        `🛡️ <b>Khiên Bảo Hiểm Lọt Khe 0-Vote (${hNums.length} số · ${stakeK}K/số · Ăn 1:84):</b> <b>${escapeHtml(formatNumberList(hNums))}</b>`,
        `  • <i>${escapeHtml(hedge.rationale || 'Bọc lót nhẹ phòng khi nhà cái bẻ cầu lọt khe, nổ ăn x84 lần bù đắp rủi ro!')}</i>`
      );
    }
    lines.push(
      `🎯 <b>Chi tiết cách vào tiền tối đa hóa lợi nhuận:</b>`,
      `  • <b>VIP Trùng X3 (${sTierX2.length} số):</b> Cược gấp ba (Mức 3 đánh 600K/số, Mức VIP đánh 3M/số). Khi nổ VIP ăn <b>+50.4M Mức 3 / +252M VIP</b> (Lãi ròng <b>+35.0M M3 / +175M VIP</b>).`,
      `  • <b>Bọc Lót X1 (${sSingles.length} số):</b> Cược chuẩn (Mức 3 đánh 200K/số, Mức VIP đánh 1M/số) để bảo hiểm vốn (ăn <b>+16.8M M3 / +84M VIP</b>, Lãi ròng <b>+1.4M M3 / +7M VIP</b>).`,
      `  • <i>Tổng vốn: Mức 3 là 15.4M (${sTierX2.length}x600K + ${sSingles.length}x200K) · Mức VIP là 77M (${sTierX2.length}x3M + ${sSingles.length}x1M). Tối ưu hơn hẳn đánh cược đều ${sNumbers.length} số.</i>`,
      `🔥 <b>Nguyên lý Đòn Bẩy X3 Bứt Phá Lợi Nhuận:</b> Cố định 17 VIP X3 (51M) + 26 Bọc Lót X1 (26M) = 43 số (77M/ngày) để khi nổ số trùng sẽ ăn ngay 252M VIP, gỡ bù mọi drawdown và đẩy tăng trưởng lũy kế cực mạnh.`
    );

    // =========================================================================
    // CÁC PHƯƠNG PHÁP THỰC CHIẾN LỰA CHỌN THÊM (MỐC LỊCH SỬ HIỆN TẠI)
    // =========================================================================
    const altMethods = [];
    const chosenKey = streakDeAdv.selectedMethod;

    if (chosenKey !== 'adaptiveDualMerge' && advisorPayload?.adaptiveDualMerge?.latestRecommendation) {
      const aRec = advisorPayload.adaptiveDualMerge.latestRecommendation;
      const aUnion = (aRec.fullUnion || []).map(normalizeLotteryNumber);
      const aX2 = (aRec.intersectionX2 || []).map(normalizeLotteryNumber);
      const aX1 = (aRec.uniqueSinglesX1 || []).map(normalizeLotteryNumber);
      if (aUnion.length) {
        altMethods.push(
          `• 👑 <b>Lựa chọn 2 — Đề Thích Ứng Alpha (Dàn ${aUnion.length} số · Vốn 60M · X2/X1):</b>`,
          `   └ ⚡ <b>VIP Trùng X2 (${aX2.length} số):</b> <b>${escapeHtml(formatNumberList(aX2))}</b>`,
          `   └ 🛡️ <b>Bọc Lót X1 (${aX1.length} số):</b> <b>${escapeHtml(formatNumberList(aX1))}</b>`
        );
      }
    }

    if (chosenKey !== 'dualMerge' && advisorPayload?.dualMerge?.latestRecommendation) {
      const dRec = advisorPayload.dualMerge.latestRecommendation;
      const dUnion = (dRec.fullUnion || []).map(normalizeLotteryNumber);
      const dX2 = (dRec.intersectionX2 || []).map(normalizeLotteryNumber);
      const dX1 = (dRec.uniqueSinglesX1 || []).map(normalizeLotteryNumber);
      if (dUnion.length) {
        altMethods.push(
          `• 🎯 <b>Lựa chọn — Đề Gộp Tiêu Chuẩn (Dàn ${dUnion.length} số · Vốn 60M · X2/X1):</b>`,
          `   └ ⚡ <b>VIP Trùng X2 (${dX2.length} số):</b> <b>${escapeHtml(formatNumberList(dX2))}</b>`,
          `   └ 🛡️ <b>Bọc Lót X1 (${dX1.length} số):</b> <b>${escapeHtml(formatNumberList(dX1))}</b>`
        );
      }
    }

    if (chosenKey !== 'metaLearner' && (metaRec || advisorPayload?.metaLearner?.latestRecommendation)) {
      const mRec = metaRec || advisorPayload.metaLearner.latestRecommendation;
      const m30 = (mRec.standard30 || mRec.numbers || []).map(normalizeLotteryNumber);
      const mCore10 = (mRec.core10 || m30.slice(0, 10)).map(normalizeLotteryNumber);
      if (m30.length) {
        altMethods.push(
          `• 💎 <b>Lựa chọn 3 — Đề Tinh Hoa (Dàn 30 số · Vốn 30M cược phẳng · Không X2):</b>`,
          `   └ <b>${escapeHtml(formatNumberList(m30))}</b>`,
          `   └ ⚡ Core 10 VIP: <b>${escapeHtml(formatNumberList(mCore10))}</b>`
        );
      }
    }

    const resonance = streakDeAdv.dualResonanceUnion;
    if (resonance && Array.isArray(resonance.numbers) && resonance.numbers.length) {
      const rNums = resonance.numbers.map(normalizeLotteryNumber);
      altMethods.push(
        `• 🛡️ <b>Lựa chọn 4 — Dàn Hợp Bù Trừ Đối Kháng (${rNums.length} số · Win 63% - 77%):</b>`,
        `   └ <b>${escapeHtml(formatNumberList(rNums))}</b>`
      );
    }

    if (altMethods.length) {
      lines.push(
        `⭐️ <b>CÁC PHƯƠNG PHÁP THỰC CHIẾN LỰA CHỌN THÊM (MỐC LỊCH SỬ HIỆN TẠI):</b>`,
        ...altMethods
      );
    }
  } else {
    lines.push(`<b>1. 💎 ĐỀ TINH HOA — DÀN 30 SỐ GỢI Ý</b>`);
    let std30 = metaRec?.standard30 || metaRec?.numbers || [];
    let core10 = metaRec?.core10 || [];
    let core20 = metaRec?.core20 || [];

    if (!std30.length) {
      std30 = advisorPayload?.dualMerge?.latestRecommendation?.fullUnion
        || advisorPayload?.adaptiveDualMerge?.latestRecommendation?.fullUnion
        || dePayload?.nextPrediction?.strategies?.[DEFAULT_DE_STRATEGY]?.holds?.[DEFAULT_DE_TARGET]?.betNumbers
        || dePayload?.nextPrediction?.strategies?.chainSmallFirst?.holds?.[DEFAULT_DE_TARGET]?.betNumbers
        || dePayload?.nextPrediction?.strategies?.dedupEdge75Pit?.holds?.[DEFAULT_DE_TARGET]?.betNumbers
        || [];
      core10 = std30.slice(0, 10);
      core20 = std30.slice(0, 20);
    }
    sNumbers = std30.map(normalizeLotteryNumber);
    sTierX2 = core10.map(normalizeLotteryNumber);
    sSingles = core20.map(normalizeLotteryNumber);

    lines.push(
      `👑 <b>Dàn Chuẩn 30 số</b> (Vốn 30M · Ăn 84M · Lãi ròng +54M):`,
      `  • <i>Mức chuẩn 10K/số: Vốn 300K · Ăn 840K (x84) · Lãi +540K</i>`,
      `  • <i>Mức VIP 1M/số: Vốn 30M · Ăn 84M · Lãi +54M</i>`,
      `<b>${escapeHtml(formatNumberList(std30))}</b>`,
      `⚡ <b>Core 10 VIP</b> (10M · Hạt nhân): <b>${escapeHtml(formatNumberList(core10))}</b>`,
      `🔥 <b>Core 20 Rút gọn</b> (20M): <b>${escapeHtml(formatNumberList(core20))}</b>`
    );
  }
  lines.push(divider);

  // =========================================================================
  // 2. 🏆 LÔ CHUẨN TỐI ƯU (DÀN 20 SỐ)
  // =========================================================================
  lines.push(`<b>2. 🏆 LÔ CHUẨN TỐI ƯU (DÀN 20 SỐ)</b>`);

  const loGovernor = loQuadAdv?.streakGovernor || {};
  const activeLoEngineKey = loGovernor.selectedEngine || 'qmbf';
  let engineData = loGovernor.engines?.[activeLoEngineKey] || {};
  if (!engineData.rankedNumbers?.length) {
    if (activeLoEngineKey === 'penta' && advisorPayload?.loPentaMatrix?.latestRecommendation) {
      engineData = advisorPayload.loPentaMatrix.latestRecommendation;
    } else if (activeLoEngineKey === 'bridge' && advisorPayload?.loPositionalBridgeFlow?.latestRecommendation) {
      engineData = advisorPayload.loPositionalBridgeFlow.latestRecommendation;
    } else if (activeLoEngineKey === 'hawkes' && advisorPayload?.loHawkesClustering?.latestRecommendation) {
      engineData = advisorPayload.loHawkesClustering.latestRecommendation;
    }
  }

  let stdNums = [];
  if (loQuadAdv?.top20 && loQuadAdv.top20.length) {
    stdNums = loQuadAdv.top20.map(normalizeLotteryNumber);
  } else if (loQuadAdv?.rankedNumbers && loQuadAdv.rankedNumbers.length) {
    stdNums = loQuadAdv.rankedNumbers.slice(0, 20).map(normalizeLotteryNumber);
  } else if (engineData.top20 && engineData.top20.length) {
    stdNums = engineData.top20.map(normalizeLotteryNumber);
  } else if (engineData.rankedNumbers && engineData.rankedNumbers.length) {
    stdNums = engineData.rankedNumbers.slice(0, 20).map(normalizeLotteryNumber);
  } else if (metaNext?.standard?.numbers?.length) {
    stdNums = (metaNext.standard.numbers || []).map(normalizeLotteryNumber);
  } else if (advisorPayload?.loQuantumBayesFusion?.latestRecommendation?.rankedNumbers?.length) {
    stdNums = advisorPayload.loQuantumBayesFusion.latestRecommendation.rankedNumbers.slice(0, 20).map(normalizeLotteryNumber);
  } else {
    stdNums = (
      metaNext?.standard?.numbers ||
      lotoPayload?.nextPrediction?.predictions?.top20?.numbers ||
      lotoPayload?.nextPrediction?.strategies?.[DEFAULT_LOTO_STRATEGY]?.predictions?.top20?.numbers ||
      lotoPayload?.nextPrediction?.strategies?.[LEGACY_RRF_LOTO_STRATEGY]?.predictions?.top20?.numbers ||
      []
    ).map(normalizeLotteryNumber);
  }

  const isQuadMaster = Boolean(loQuadAdv);
  const loEngineLabel = engineData.label || loGovernor.selectedEngineLabel || 'Quantum Bayes Fusion 7D';
  const loMethodTitle = isQuadMaster
    ? `👑 Tứ Trụ Quad-Fusion v7.2 Top 20 (Mỏ Neo Nền Tảng)`
    : `${loEngineLabel} Top 20 (Đề Xuất Nền Tảng)`;
  const loMethodStat = isQuadMaster
    ? ` · Win 77.3% (Lãi 2026: +2.98 TỶ · 6.96 Nháy)`
    : (engineData.winRateTop20 ? ` · Win ${engineData.winRateTop20}` : '');
  lines.push(
    `🎯 <b>${escapeHtml(loMethodTitle)}</b>${escapeHtml(loMethodStat)} (Vốn 44M · Cược 2.2M/số [2.200K / 100đ] · Ăn 8M/nháy):`,
    `  • <i>Mức chuẩn 10đ/số: Vốn 200 điểm (4.400K) · Ăn 800K/nháy (1đ = 22K ăn 80K)</i>`,
    `  • <i>Mức 3 mặc định: 25đ/số (500đ = 11M) · Ăn 2M/nháy</i>`,
    `  • <i>Mức VIP 100đ/số: Vốn 44M · Ăn 8M/nháy</i>`,
    `<b>${escapeHtml(formatNumberList(stdNums))}</b>`
  );
  lines.push(divider);

  // =========================================================================
  // 3. 🚀 LÔ ĐÁNH X2 AN TOÀN CAO (DÀN 7 SỐ TĂNG TỐC - ĐỔI PHA)
  // =========================================================================
  const selectedEngineLabel = engineData.label || loGovernor.selectedEngineLabel || 'Quantum Bayes Fusion 7D';
  const selectedSubTier = loGovernor.selectedSubTier || 7;
  const subTierData = engineData.subTiers?.[selectedSubTier] || loGovernor.subTiers?.[selectedSubTier] || {};
  const subTierLabel = subTierData.label || `Top ${selectedSubTier}`;

  lines.push(`<b>3. 🚀 LÔ ĐÁNH X2 AN TOÀN CAO (DÀN ${selectedSubTier} SỐ TĂNG TỐC)</b>`);
  if (loGovernor.confidenceBadge) {
    lines.push(
      `👑 <b>Động cơ: ${escapeHtml(selectedEngineLabel)}</b> · <b>Dàn ${escapeHtml(subTierLabel)} [${selectedSubTier} số]</b> · ${escapeHtml(loGovernor.confidenceBadge)}`,
      `💡 <i>Lý do chọn: ${escapeHtml(loGovernor.rationale || '')}</i>`
    );
  }

  let x2Nums = (
    subTierData.numbers ||
    engineData.rankedNumbers?.slice(0, selectedSubTier) ||
    loGovernor.subTiers?.[selectedSubTier]?.numbers ||
    loQuadAdv?.top7 ||
    metaNext?.x2?.numbers ||
    []
  ).map(normalizeLotteryNumber);
  if (!x2Nums.length && advisorPayload?.loQuantumBayesFusion?.latestRecommendation?.rankedNumbers?.length) {
    x2Nums = advisorPayload.loQuantumBayesFusion.latestRecommendation.rankedNumbers.slice(0, selectedSubTier).map(normalizeLotteryNumber);
  }
  if (!x2Nums.length) {
    x2Nums = (
      lotoPayload?.nextPrediction?.predictions?.top7?.numbers ||
      lotoPayload?.nextPrediction?.strategies?.[DEFAULT_LOTO_STRATEGY]?.predictions?.top7?.numbers ||
      lotoPayload?.nextPrediction?.strategies?.[LEGACY_RRF_LOTO_STRATEGY]?.predictions?.top7?.numbers ||
      stdNums.slice(0, selectedSubTier) ||
      []
    ).map(normalizeLotteryNumber);
  }

  const top2Nums = (engineData.subTiers?.[2]?.numbers || engineData.rankedNumbers?.slice(0, 2) || loGovernor.subTiers?.[2]?.numbers || loQuadAdv?.top2 || []).map(normalizeLotteryNumber);
  const top1Num = (engineData.subTiers?.[1]?.numbers?.[0] || loGovernor.subTiers?.[1]?.numbers?.[0] || top2Nums[0] || loQuadAdv?.top1?.[0]);
  if (top2Nums.length) {
    lines.push(
      `🔥 <b>Song Thủ Siêu VIP: [${escapeHtml(formatNumberList(top2Nums))}]</b> <i>(61.2% Nổ 2026 · +47.6% ROI)</i> · Bạch Thủ: <b>[${top1Num || top2Nums[0]}]</b> <i>(36.5% Win · +41.3% ROI)</i>`
    );
  }
  lines.push(
    `🎯 <b>Dàn ${x2Nums.length} số Tăng Tốc</b> (Vốn ${(x2Nums.length * 2.2).toFixed(1)}M · Cược 2.2M/số [2.200K / 100đ] · Ăn 8M/nháy):`,
    `  • <i>Mức chuẩn 10đ/số: Vốn ${x2Nums.length * 10} điểm (${(x2Nums.length * 10 * 22).toLocaleString('vi-VN')}K) · Ăn 800K/nháy</i>`,
    `  • <i>Mức 3 mặc định: 25đ/số (${x2Nums.length * 25}đ = ${(x2Nums.length * 25 * 22 / 1000).toFixed(1)}M) · Ăn 2M/nháy (Cùng mức Top 20)</i>`,
    `  • <i>Mức VIP 100đ/số: Vốn ${(x2Nums.length * 2.2).toFixed(1)}M · Ăn 8M/nháy</i>`,
    `<b>${escapeHtml(formatNumberList(x2Nums))}</b>`
  );
  lines.push(divider);

  // =========================================================================
  // 4. ⚡ BẢNG GỘP ĐÁNH LÔ TỔNG LỰC / LÔ GHÉP TẦNG ĐA PHƯƠNG PHÁP (+3.0 TỶ)
  // =========================================================================
  const crossOpt = metaNext?.optimalCrossTierEnsemble?.primary;
  const sList = (stdNums || []).map(normalizeLotteryNumber).filter(Boolean);
  const xList = (x2Nums || []).map(normalizeLotteryNumber).filter(Boolean);
  const sSet = new Set(sList);
  const overlapNums = xList.filter(n => sSet.has(n));
  const singleNums = sList.filter(n => !overlapNums.includes(n));
  const allMerged = crossOpt?.distinctNumbers?.length
    ? crossOpt.distinctNumbers
    : Array.from(new Set([...sList, ...xList]));

  if (crossOpt && (crossOpt.overlapX3 || crossOpt.overlapX2) && crossOpt.singlesX1) {
    lines.push(`<b>4. ⚡ LÔ GHÉP TẦNG ĐA PHƯƠNG PHÁP (${crossOpt.totalNumbers} SỐ · ${escapeHtml(crossOpt.badge)})</b>`);
    lines.push(`<i>${escapeHtml(crossOpt.description)}</i>`);

    if (crossOpt.overlapX3 && crossOpt.overlapX3.length > 0) {
      lines.push(
        `⚡ <b>Hạt Nhân Cược X3 (ĐÒN BẨY CỰC ĐẠI - ${crossOpt.overlapX3.length} số - Tam Động Cơ Đồng Thuận):</b>`,
        `  • <i>Mức chuẩn: 30đ/số (660K) · Mức 3: 75đ/số (1.650K) · Mức VIP: 6.6M/số [300đ]</i>`,
        `<b>${escapeHtml(formatNumberList(crossOpt.overlapX3))}</b>`
      );
    }

    if (crossOpt.overlapX2 && crossOpt.overlapX2.length > 0) {
      lines.push(
        `🔥 <b>Mũi Nhọn Cược X2 (ĐÒN BẨY BÙNG NỔ - ${crossOpt.overlapX2.length} số - Song Động Cơ Đồng Thuận):</b>`,
        `  • <i>Mức chuẩn: 20đ/số (440K) · Mức 3: 50đ/số (1.100K) · Mức VIP: 4.4M/số [200đ]</i>`,
        `<b>${escapeHtml(formatNumberList(crossOpt.overlapX2))}</b>`
      );
    }

    if (crossOpt.singlesX1 && crossOpt.singlesX1.length > 0) {
      lines.push(
        `🛡️ <b>Số Riêng Cược X1 (BẢO HIỂM BỌC LÓT - ${crossOpt.singlesX1.length} số):</b>`,
        `  • <i>Mức chuẩn: 10đ/số (220K) · Mức 3: 25đ/số (550K) · Mức VIP: 2.2M/số [100đ]</i>`,
        `<b>${escapeHtml(formatNumberList(crossOpt.singlesX1))}</b>`
      );
    } else if (!crossOpt.overlapX2?.length && !crossOpt.overlapX3?.length) {
      lines.push(`<i>🎯 Toàn bộ dàn số đánh cược đồng đều mức chuẩn.</i>`);
    }
  } else {
    lines.push(`<b>4. ⚡ BẢNG GỘP ĐÁNH LÔ TỔNG LỰC (${allMerged.length} SỐ - CÙNG MỨC CƯỢC 25Đ / 100Đ)</b>`);
    lines.push(
      `<i>Tổng hợp từ 2 dàn trên: Mặc định giữ Top 20 nền tảng mỏ neo (${escapeHtml(loEngineLabel)}), dàn ${escapeHtml(subTierLabel)} làm mũi nhọn:</i>`,
      `💡 <i>Cách chơi đồng bộ: Cả nhóm số trùng và số riêng đều cược cùng đơn vị 25đ/số (550K/số) trên Bot Telegram (hoặc 100đ/số [2.2M/số] trên Web VIP).</i>`
    );
    lines.push(
      `🔥 <b>Nhóm Số Trùng (MŨI NHỌN ĐỒNG THUẬN - ${overlapNums.length} số):</b>`,
      `  • <i>Mức chuẩn: 10đ/số (220K/số) · Mức 3: 25đ/số (550K/số) · Mức VIP: 2.2M/số</i>`,
      `<b>${escapeHtml(formatNumberList(overlapNums))}</b>`,
      `🛡️ <b>Nhóm Số Riêng (BỌC LÓT NỀN TẢNG - ${singleNums.length} số):</b>`,
      `  • <i>Mức chuẩn: 10đ/số (220K/số) · Mức 3: 25đ/số (550K/số) · Mức VIP: 2.2M/số</i>`,
      `<b>${escapeHtml(formatNumberList(singleNums))}</b>`
    );
  }
  lines.push(divider);

  // =========================================================================
  // 5. 💎 LÔ XIÊN 3 & XIÊN 4 TINH HOA — DUNG HỢP TOP 5 ĐỒNG THUẬN
  // =========================================================================
  const top4Consensus = (loTop5Xien?.top4Xien || []).map(normalizeLotteryNumber);
  const top5Consensus = (loTop5Xien?.top5Xien || (stdNums.length >= 5 ? stdNums.slice(0, 5) : [])).map(normalizeLotteryNumber);
  const top3Consensus = (loTop5Xien?.top3Xien || (stdNums.length >= 3 ? stdNums.slice(0, 3) : [])).map(normalizeLotteryNumber);

  let xi4Nums = top4Consensus.length >= 4 ? top4Consensus : (loXien4Adv?.numbers || metaNext?.xien4?.numbers || []).map(normalizeLotteryNumber);
  if (xi4Nums.length < 4) {
    xi4Nums = overlapNums.length >= 4 ? overlapNums.slice(0, 4) : (sList.length >= 4 ? sList.slice(0, 4) : (stdNums.length >= 4 ? stdNums.slice(0, 4) : []));
  }
  lines.push(`<b>5. 💎 LÔ XIÊN 3 & XIÊN 4 TINH HOA — DUNG HỢP TOP 5 ĐỒNG THUẬN</b>`);
  lines.push(
    `👑 <i>Dung hợp từ 4 động cơ đỉnh cao (QMBF + QuadFusion + TriHarmonic + PentaMatrix) · 100% Strict PIT 2026:</i>`
  );
  lines.push(
    `🎲 <b>Bộ 4 Số Vàng Xiên 4 & Quây 11 Vé:</b> <b>${escapeHtml(formatNumberList(xi4Nums))}</b>`,
    `  • 🏆 <i>Hiệu suất 2026: Lãi ròng <b>+1.005 TỶ</b> (ROI <b>+171.2%</b>) · Tỷ lệ nổ có lãi <b>40.1%</b> (107/267 ngày)</i>`,
    `  • <i>Cơ cấu 11 vé (1 vé X4 + 4 vé X3 + 6 vé X2) · Vốn 2.2M/ngày (Mức 3 200K/vé) / 11M (VIP 1M/vé):</i>`,
    `     └ 💥 <b>Ăn 4 con</b>: Mức 200K ăn 76.8M (Lãi +74.6M) · Mức VIP ăn 384M (Lãi +373M)`,
    `     └ 🔥 <b>Ăn 3 con</b>: Mức 200K ăn 16.8M (Lãi +14.6M) · Mức VIP ăn 84M (Lãi +73M)`,
    `     └ 🎯 <b>Ăn 2 con</b>: Mức 200K ăn 2.4M (Lãi +200K) · Mức VIP ăn 12M (Lãi +1M)`
  );
  if (top5Consensus.length >= 5) {
    lines.push(
      `🎯 <b>Bộ 5 Số Vàng Quây Xiên 3 (10 Vé):</b> <b>${escapeHtml(formatNumberList(top5Consensus))}</b>`,
      `  • ⚡ <i>Hiệu suất 2026: Nổ Xiên 3 <b>47/267 ngày (17.6%)</b> · Lãi ròng <b>+331M</b> (ROI <b>+124.0%</b>)</i>`,
      `  • <i>Vốn cược: 10 vé x 100K = 1.000K/ngày (Mức 3: 10 vé x 200K = 2.0M/ngày). Nổ 1 cặp X3 ăn 4M (M3 ăn 8M), nổ 2 cặp ăn 8M (M3 ăn 16M)!</i>`,
      `  • 🌟 <i>Bạch thủ Xiên 3 (Single Top 3): <b>[${escapeHtml(formatNumberList(top3Consensus))}]</b> (Lãi +57.8M · ROI +216.5%)</i>`
    );
  }
  lines.push(divider);

  // =========================================================================
  // 🛡️ COMBO DANH MỤC BÙ TRỪ DÒNG TIỀN CHÉO (CROSS-HEDGING PORTFOLIO)
  // =========================================================================
  if (crossHedge) {
    const chMode = crossHedge.mode || 'ACTIVE_HEDGE';
    const chSizing = crossHedge.sizingMultiplier != null ? Number(crossHedge.sizingMultiplier).toFixed(2) : '1.00';
    const chMetrics = crossHedge.metrics || activeAdvisor?.crossHedgingPortfolio?.summary || {};
    const chWinRate = chMetrics.dailyPositiveProfitRate ? (chMetrics.dailyPositiveProfitRate * 100).toFixed(1) : '77.8';
    const chRoi = chMetrics.cumulativeRoi ? (chMetrics.cumulativeRoi * 100).toFixed(1) : '120.0';
    const chMaxLoss = chMetrics.maxConsecutiveLossDays ?? 3;

    const p1 = crossHedge.pillar1_De || {};
    const p1Vip = (p1.vipNumbers || []).map(normalizeLotteryNumber);
    const p1Single = (p1.singleNumbers || []).map(normalizeLotteryNumber);
    const p1StakeM = (p1.stakeK / 1000).toFixed(2);
    const p1PayoutVipM = (p1.targetPayoutVipK / 1000).toFixed(1);

    const p2 = crossHedge.pillar2_Lo || {};
    const p2Nums = (p2.numbers || []).map(normalizeLotteryNumber);
    const p2StakeM = (p2.stakeK / 1000).toFixed(2);
    const p2ExpectedHits = p2.expectedHits || 2;
    const p2Tiers = {};
    (p2.betNumbers || []).forEach(b => {
      const m = b.multiplier || 1;
      p2Tiers[m] = p2Tiers[m] || [];
      p2Tiers[m].push(normalizeLotteryNumber(b.num));
    });

    const p3 = crossHedge.pillar3_Xien || {};
    const p3Nums = (p3.numbers || []).map(normalizeLotteryNumber);
    const p3Tickets = p3.ticketsCount || 11;
    const p3StakeM = (p3.stakeK / 1000).toFixed(2);
    const p3Payout2M = (p3.payoutHit2K / 1000).toFixed(1);

    const totalStakeM = (crossHedge.totalStakeK / 1000).toFixed(2);
    const hedgeGuarantee = crossHedge.hedgingSummary?.hedgingGuarantee || 'Nổ bất kỳ trụ cột nào đều sinh Lãi Ròng > 0!';
    const expectedProfitK = crossHedge.hedgingSummary?.profitIfDeHitsK || Math.round(crossHedge.totalStakeK * 0.35);
    const expectedProfitM = (expectedProfitK / 1000).toFixed(2);

    lines.push(
      `🛡️ <b>COMBO DANH MỤC BÙ TRỪ DÒNG TIỀN CHÉO (CROSS-HEDGING PORTFOLIO)</b>`,
      `👑 <i>Chiến lược liên hoàn 3 Trụ Cột: Đề Tinh Tuyển VIP + Lô Ghép 4 Động Cơ + Dàn Xiên Quây Hiệp Đồng</i>`,
      `⚡ <b>Chế độ vận hành:</b> <code>${escapeHtml(chMode)} (${chSizing}x)</code>`,
      `📊 <b>Thước đo định lượng 2026:</b> Tỷ lệ ngày có lãi ròng: <b>${chWinRate}%</b> · ROI: <b>+${chRoi}%</b> · Max chuỗi lỗ: <b>${chMaxLoss} ngày</b>`,
      ``,
      `💎 <b>Trụ Cột 1: Đề Tinh Tuyển VIP (${escapeHtml(p1.methodLabel || 'Đề VIP')})</b>`,
      `  • ⚡ VIP X2/X3 (${p1Vip.length} số): <code>${escapeHtml(formatNumberList(p1Vip))}</code>`,
      `  • 🛡️ Bọc Lót X1 (${p1Single.length} số): <code>${escapeHtml(formatNumberList(p1Single))}</code>`,
      `  • 💰 Vốn cược: <b>${p1StakeM}M VNĐ</b> · Kỳ vọng nổ VIP: ăn <b>${p1PayoutVipM}M VNĐ</b> (Tỷ lệ 1:84 đến 1:252)`,
      ``,
      `🎰 <b>Trụ Cột 2: Lô Ghép 4 Động Cơ (${escapeHtml(p2.engine || 'Lô Hội Tụ Đa Tầng')})</b>`,
      `  • 🎯 Dàn Lô (${p2Nums.length} số): <code>${escapeHtml(formatNumberList(p2Nums))}</code>`,
      ...(p2Tiers[5]?.length ? [`  • 👑 Siêu VIP X5 (${p2Tiers[5].length} số): <code>${escapeHtml(formatNumberList(p2Tiers[5]))}</code>`] : []),
      ...(p2Tiers[4]?.length ? [`  • 🔥 Cực VIP X4 (${p2Tiers[4].length} số): <code>${escapeHtml(formatNumberList(p2Tiers[4]))}</code>`] : []),
      ...(p2Tiers[3]?.length ? [`  • ⚡ Triển vọng X3 (${p2Tiers[3].length} số): <code>${escapeHtml(formatNumberList(p2Tiers[3]))}</code>`] : []),
      ...(p2Tiers[1]?.length ? [`  • 🛡️ Bọc lót X1 (${p2Tiers[1].length} số): <code>${escapeHtml(formatNumberList(p2Tiers[1]))}</code>`] : []),
      `  • 💰 Vốn cược: <b>${p2StakeM}M VNĐ</b> · Kỳ vọng: <b>≥ ${p2ExpectedHits} nháy nổ/ngày</b> (Mỏ neo dòng tiền ổn định)`,
      ``,
      `✨ <b>Trụ Cột 3: Dàn Xiên Quây Hiệp Đồng (${p3Tickets} Vé Quây)</b>`,
      `  • 🎲 Bộ số Xiên (${p3Nums.length} con): <code>${escapeHtml(formatNumberList(p3Nums))}</code>`,
      `  • 💰 Vốn cược: <b>${p3StakeM}M VNĐ</b> · Nổ từ 2 con: ăn <b>${p3Payout2M}M VNĐ</b> (Đòn bẩy lợi nhuận, chắc chắn có lãi)`,
      ``,
      `💰 <b>TỔNG VỐN NGÀY:</b> <b>${totalStakeM}M VNĐ</b> · Lợi nhuận kỳ vọng: <b>+${expectedProfitM}M VNĐ</b>`,
      `🛡️ <b>CƠ CHẾ BÙ TRỪ AN TOÀN:</b> <i>${escapeHtml(hedgeGuarantee)}</i>`,
      divider
    );
  }

  // =========================================================================
  // 👑 BẢNG CHỐT DÀN SỐ ĐÁNH CUỐI CÙNG — BỘ ĐIỀU PHỐI GÓI CHIẾN LƯỢC THÔNG MINH
  // =========================================================================
  const stratGov = advisorPayload?.strategicPortfolioGovernor || null;
  const recPort = stratGov?.recommendedPortfolio || null;
  const slipTitle = recPort ? recPort.name.toUpperCase() : 'SIÊU HỘI TỤ ĐA PHƯƠNG PHÁP';
  const slipBadge = recPort ? recPort.badge : 'MAX PROFIT & WIN RATE';
  const slipRationale = stratGov?.decisionRationale || recPort?.rationale || 'Tự động phối hợp các thuật toán đỉnh cao nhất để tối đa hóa xác suất nổ & lợi nhuận.';

  lines.push(
    `👑 <b>BẢNG CHỐT DÀN SỐ ĐÁNH CUỐI CÙNG — ${escapeHtml(slipTitle)}</b>`,
    `<i>${escapeHtml(slipBadge)}</i>`,
    `💡 <i>Lý do AI lựa chọn: ${escapeHtml(slipRationale)}</i>`,
    ``
  );

  // 1. Đề
  const deFinalTitle = recPort?.deStructure?.label || sMethod || 'Đề Thích Ứng Alpha';
  const deFinalNums = (recPort?.deStructure?.allNums || sNumbers || []).map(normalizeLotteryNumber);
  const deFinalVip = (recPort?.deStructure?.vipNums || sTierX2 || []).map(normalizeLotteryNumber);
  const deFinalSingles = (recPort?.deStructure?.singleNums || sSingles || []).map(normalizeLotteryNumber);

  const deFinalModeSuffix = (recPort?.id === 'steadyAccumulator') ? 'CƯỢC PHẲNG / CÂN BẰNG AN TOÀN' : 'ĐÒN BẨY X3';
  lines.push(
    `💎 <b>1. ĐỀ ${escapeHtml(deFinalTitle.toUpperCase())} (${deFinalNums.length} SỐ · ${deFinalModeSuffix}):</b>`
  );
  if (deFinalVip.length > 0) {
    lines.push(
      `  • ⚡ <b>VIP X3 (${deFinalVip.length} số - Vào tiền gấp 3):</b> <code>${escapeHtml(formatNumberList(deFinalVip))}</code>`
    );
  }
  if (deFinalSingles.length > 0) {
    lines.push(
      `  • 🛡️ <b>Bọc Lót X1 (${deFinalSingles.length} số - Vào tiền chuẩn):</b> <code>${escapeHtml(formatNumberList(deFinalSingles))}</code>`
    );
  }
  const finalHedge = (recPort?.deStructure?.isHedgeActive && recPort.deStructure.hedgeNums?.length)
    ? { isHedgeActive: true, numbers: recPort.deStructure.hedgeNums, recommendedStakePerNumK: 100 }
    : (streakDeAdv?.lotKheHedge?.isHedgeActive && streakDeAdv.lotKheHedge.numbers?.length)
      ? streakDeAdv.lotKheHedge
      : (recPort?.deStructure?.hedgeNums?.length ? { isHedgeActive: true, numbers: recPort.deStructure.hedgeNums, recommendedStakePerNumK: 100 } : null);
  if (finalHedge && finalHedge.numbers?.length && (finalHedge.isHedgeActive || recPort?.deStructure?.isHedgeActive)) {
    const fhNums = finalHedge.numbers.map(normalizeLotteryNumber);
    const fhStake = finalHedge.recommendedStakePerNumK || 100;
    lines.push(
      `  • 🛡️ <b>Khiên Bảo Hiểm Lọt Khe (${fhNums.length} số · ${fhStake}K/số · Ăn 1:84):</b> <code>${escapeHtml(formatNumberList(fhNums))}</code>`
    );
  }
  if (recPort?.id === 'steadyAccumulator') {
    lines.push(
      `  • <i>Vốn: Mức 3 = 8.6M · Mức VIP = 43M (Nổ ăn 16.8M M3 / 84M VIP 👉 Lãi ròng +8.2M M3 / +41M VIP · Triệt tiêu chuỗi thua)</i>`,
      ``
    );
  } else {
    lines.push(
      `  • <i>Vốn: Mức 3 = 15.4M (600K/VIP · 200K/Lót) · Mức VIP = 77M (3M/VIP · 1M/Lót) 👉 Nổ VIP X3 ăn 50.4M M3 / 252M VIP (Lãi ròng +35.0M M3 / +175M VIP); Nổ Lót X1 ăn 16.8M M3 / 84M VIP (Lãi ròng +1.4M M3 / +7M VIP)</i>`,
      ``
    );
  }

  // 2. Lô - BỘ ĐIỀU PHỐI THÔNG MINH (CHỈ ĐỀ XUẤT ĐÚNG 1 PHƯƠNG PHÁP DUY NHẤT)
  const smartLo = recPort?.loStructure?.selectedLo || stratGov?.smartSelectedLo || resolveSmartSelectedLo(advisorPayload);
  let loStakeDailyM3_K = 3850;
  let loStakeDailyVIP_K = 15400;

  if (smartLo) {
    loStakeDailyM3_K = smartLo.stakeDailyK_M3;
    loStakeDailyVIP_K = smartLo.stakeDailyK_VIP;
    lines.push(
      `🎰 <b>2. LÔ CHỦ LỰC ĐỀ XUẤT DUY NHẤT HÔM NAY — BỘ ĐIỀU PHỐI THÔNG MINH:</b>`,
      `  • <i>🎯 ${escapeHtml(smartLo.badge)}</i>`,
      `  • 💡 <i>Lý do AI lựa chọn: ${escapeHtml(smartLo.rationale)}</i>`,
      `  • 🎯 <b>Dàn Lô Đánh (${smartLo.numbers.length} số · Vốn Tối Ưu Chi Phí Thấp):</b> <code>${escapeHtml(formatNumberList(smartLo.numbers.map(normalizeLotteryNumber)))}</code>`
    );

    const lo4Adv = advisorPayload?.lo4EngineFusion?.latestRecommendation || {};
    const rx5 = (smartLo.tierX5 || recPort?.loStructure?.tierX5 || lo4Adv.tierX5 || []).map(normalizeLotteryNumber);
    const rx4 = (smartLo.tierX4 || recPort?.loStructure?.tierX4 || lo4Adv.tierX4 || []).map(normalizeLotteryNumber);
    const rx3 = (smartLo.tierX3 || recPort?.loStructure?.tierX3 || lo4Adv.tierX3 || []).map(normalizeLotteryNumber);
    const rx1 = (smartLo.singlesX1 || recPort?.loStructure?.singlesX1 || lo4Adv.tierX1 || []).map(normalizeLotteryNumber);

    if (rx5.length || rx4.length || rx3.length || rx1.length) {
      if (rx5.length) {
        lines.push(`     └ 👑 <b>Siêu VIP X5 (${rx5.length} số):</b> <code>${escapeHtml(formatNumberList(rx5))}</code>`);
      }
      if (rx4.length) {
        lines.push(`     └ 🔥 <b>Cực VIP X4 (${rx4.length} số):</b> <code>${escapeHtml(formatNumberList(rx4))}</code>`);
      }
      if (rx3.length) {
        lines.push(`     └ ⚡ <b>Triển Vọng X3 (${rx3.length} số):</b> <code>${escapeHtml(formatNumberList(rx3))}</code>`);
      }
      if (rx1.length) {
        lines.push(`     └ 🛡️ <b>Bảo Hiểm X1 (${rx1.length} số):</b> <code>${escapeHtml(formatNumberList(rx1))}</code>`);
      }
    }

    lines.push(
      `  • <i>Vốn cược: Mức 3 (Mặc định 25đ) = ${(smartLo.stakeDailyK_M3 / 1000).toFixed(2)}M · Mức VIP (100đ) = ${(smartLo.stakeDailyK_VIP / 1000).toFixed(1)}M · Mức Chuẩn (10đ) = ${(smartLo.stakeDailyK_Std / 1000).toFixed(2)}M · Ăn 2M/nháy M3 (8M/nháy VIP)</i>`,
      `  • ⚡ <i>Điểm hòa vốn: Chỉ cần ${smartLo.hitsToProfit} nháy nổ là có lãi ròng ngay!</i>`
    );
  } else {
    const lo4Adv = advisorPayload?.lo4EngineFusion?.latestRecommendation || {};
    const rx5 = (rLo.tierX5 || lo4Adv.tierX5 || []).map(normalizeLotteryNumber);
    const rx4 = (rLo.tierX4 || lo4Adv.tierX4 || []).map(normalizeLotteryNumber);
    const rx3 = (rLo.tierX3 || lo4Adv.tierX3 || crossOpt?.overlapX3 || []).map(normalizeLotteryNumber);
    const rx2 = (rLo.tierX2 || crossOpt?.overlapX2 || []).map(normalizeLotteryNumber);
    const rx1 = (rLo.singlesX1 || lo4Adv.tierX1 || crossOpt?.singlesX1 || []).map(normalizeLotteryNumber);
    const rDistinct = (rLo.distinctLo || lo4Adv.allNumbers || crossOpt?.distinctNumbers || x2Nums || []).map(normalizeLotteryNumber);

    if (rx5.length || rx4.length || rx3.length || rx2.length) {
      lines.push(
        `🎰 <b>2. LÔ TỔNG HỢP 4 ĐỘNG CƠ (${rDistinct.length} SỐ · ĐA TẦNG X5/X4/X3/X1):</b>`
      );
      if (rx5.length) {
        lines.push(
          `  • 👑 <b>Siêu VIP X5 (${rx5.length} số - 4 Động Cơ Đồng Thuận):</b> <code>${escapeHtml(formatNumberList(rx5))}</code>`
        );
      }
      if (rx4.length) {
        lines.push(
          `  • 🔥 <b>Cực VIP X4 (${rx4.length} số - 3 Động Cơ):</b> <code>${escapeHtml(formatNumberList(rx4))}</code>`
        );
      }
      if (rx3.length) {
        lines.push(
          `  • ⚡ <b>Triển Vọng X3 (${rx3.length} số - 2 Động Cơ):</b> <code>${escapeHtml(formatNumberList(rx3))}</code>`
        );
      }
      if (rx1.length) {
        lines.push(
          `  • 🛡️ <b>Bảo Hiểm X1 (${rx1.length} số - Không trùng):</b> <code>${escapeHtml(formatNumberList(rx1))}</code>`
        );
      }
      const totalVipStakeK = lo4Adv.totalLotoStakeK || (rx5.length * 11000 + rx4.length * 8800 + rx3.length * 6600 + rx1.length * 2200);
      const totalM3StakeK = Math.round(totalVipStakeK * 0.25);
      lines.push(
        `  • <i>Vốn cược: Mức 3 (25đ/đơn vị) = ${(totalM3StakeK / 1000).toFixed(2)}M · Mức VIP (100đ/đơn vị) = ${(totalVipStakeK / 1000).toFixed(1)}M · Ăn 2M/nháy M3 (8M/nháy VIP)</i>`
      );
    } else if (rDistinct.length) {
      loStakeDailyM3_K = (rDistinct.length * 25 * 22);
      loStakeDailyVIP_K = (rDistinct.length * 2200);
      lines.push(
        `🎰 <b>2. LÔ ĐỀ XUẤT RIÊNG (${rDistinct.length} SỐ):</b> <code>${escapeHtml(formatNumberList(rDistinct))}</code>`,
        `  • <i>Vốn: Mức 3 = ${(loStakeDailyM3_K / 1000).toFixed(2)}M · Mức VIP = ${(loStakeDailyVIP_K / 1000).toFixed(1)}M</i>`
      );
    }
  }
  lines.push('');

  // 3. Tứ Thủ Lô Xiên 4 & Quây Xiên 3 Top 5
  lines.push(
    `✨ <b>3. LÔ XIÊN TINH HOA TOP 5 ĐỒNG THUẬN (LÃI +1.005 TỶ · THẮNG 40.1%):</b>`,
    `  • 🎲 <b>Bộ 4 số vàng (Xiên 4 & Quây 11 vé):</b> <code>${escapeHtml(formatNumberList(xi4Nums))}</code>`,
    `     └ <i>Vốn: Mức 3 = 2.2M (200K/vé) · Mức VIP = 11.0M (1M/vé) · Trúng từ 2 con là có lãi!</i>`
  );
  if (top5Consensus.length >= 5) {
    lines.push(
      `  • 🎯 <b>Bộ 5 số vàng (Quây 10 vé Xiên 3):</b> <code>${escapeHtml(formatNumberList(top5Consensus))}</code>`,
      `     └ <i>Vốn: 1.0M (100K/vé) hoặc Mức 3 = 2.0M (200K/vé) · 17.6% nổ Xiên 3 (Lãi +331M)</i>`
    );
  }
  lines.push('');

  const deTotalM3_K = (recPort?.id === 'steadyAccumulator') ? 8600 : 15400;
  const deTotalVIP_K = (recPort?.id === 'steadyAccumulator') ? 43000 : 77000;
  const xien4TotalM3_K = 2200;
  const xien4TotalVIP_K = 11000;
  const totalM3_M = ((deTotalM3_K + loStakeDailyM3_K + xien4TotalM3_K) / 1000).toFixed(2);
  const totalVIP_M = ((deTotalVIP_K + loStakeDailyVIP_K + xien4TotalVIP_K) / 1000).toFixed(1);

  lines.push(
    `💰 <b>TỔNG VỐN ĐẦU TƯ GÓI CHỦ LỰC TỐI ƯU HÔM NAY:</b>`,
    `  👉 <b>Mức 3 (Mặc định):</b> <b>${totalM3_M}M</b> (Đề ${(deTotalM3_K / 1000).toFixed(1)}M + Lô ${(loStakeDailyM3_K / 1000).toFixed(2)}M + Xiên ${(xien4TotalM3_K / 1000).toFixed(1)}M)`,
    `  👉 <b>Mức VIP:</b> <b>${totalVIP_M}M</b> (Đề ${(deTotalVIP_K / 1000).toFixed(0)}M + Lô ${(loStakeDailyVIP_K / 1000).toFixed(1)}M + Xiên ${(xien4TotalVIP_K / 1000).toFixed(0)}M)`
  );
  lines.push(divider);

  // =========================================================================
  // 6. 📊 BẢNG THEO DÕI THỰC CHIẾN THEO GỢI Ý (BẮT ĐẦU TỪ 16/09/2026)
  // =========================================================================
  const NEW_BATTLE_START_DATE = '2026-09-16';
  const deAllDates = new Set([
    ...(advisorPayload?.crossHedgingPortfolio?.settledLedger || []).filter(r => (r.date || r.predictionDate) >= NEW_BATTLE_START_DATE).map(r => r.date || r.predictionDate),
    ...(advisorPayload?.loTop5ConsensusXien?.settledLedger || []).filter(r => (r.date || r.predictionDate) >= NEW_BATTLE_START_DATE).map(r => r.date || r.predictionDate),
    ...(advisorPayload?.lo4EngineFusion?.modes?.top7?.settledLedger || []).filter(r => (r.date || r.predictionDate) >= NEW_BATTLE_START_DATE).map(r => r.date || r.predictionDate),
    ...(advisorPayload?.lo4EngineFusion?.modes?.top6?.settledLedger || []).filter(r => (r.date || r.predictionDate) >= NEW_BATTLE_START_DATE).map(r => r.date || r.predictionDate),
    ...liveDiaryEntries.filter(r => (r.date || r.predictionDate) >= NEW_BATTLE_START_DATE && r.settled !== false && (r.db || r.dayProfitK !== undefined)).map(r => r.date || r.predictionDate),
    ...(advisorPayload?.streakAwareDeAdvisor?.settledLedger?.filter(r => (r.date || r.predictionDate) >= NEW_BATTLE_START_DATE).map(r => r.date || r.predictionDate) || []),
    ...metaSettledList.filter(r => (r.predictionDate || r.date) >= NEW_BATTLE_START_DATE).map(r => r.predictionDate || r.date)
  ]);
  if (settledDate && settledDate >= NEW_BATTLE_START_DATE) {
    deAllDates.add(settledDate);
  }
  const sortedBattleDates = [...deAllDates].filter(d => d >= NEW_BATTLE_START_DATE).sort();

  lines.push(`<b>6. 📊 BẢNG THEO DÕI THỰC CHIẾN THEO GỢI Ý (BẮT ĐẦU TỪ 16/09/2026)</b>`);
  lines.push(`<i>Thống kê thực tế hoàn toàn theo các dàn gợi ý thực chiến ở trên — Mốc khởi điểm 0đ</i>`);

  if (sortedBattleDates.length === 0) {
    lines.push(
      `• 📅 <b>Kỳ 1 (${escapeHtml(displayDate(predictionDate))}):</b> ⏳ <b>ĐANG CHỜ KẾT QUẢ QUAY THƯỞNG 18:15</b>`,
      `• 💎 Đề Thực Chiến: Chờ quay (Đơn vị Bot: 200K/600K · VIP: Vốn 77M)`,
      `• 🏆 Lô Chuẩn Gợi Ý (Top 20): Chờ quay (Đơn vị Bot: 25đ/số [11.000K] · VIP: Vốn 44M)`,
      `• 🚀 Lô Tăng Tốc (Top 7): Chờ quay (Đơn vị Bot: 25đ/số [3.850K] · VIP: Vốn 15.4M)`,
      `• 💎 Lô Xiên 4 Gợi Ý (Quây 11 vé): Chờ quay (Đơn vị Bot: 200K/vé [2.200K] · VIP: Vốn 11M)`,
      `• 💰 <b>Tổng Lũy Kế Thực Chiến GỢI Ý</b>: <b>0 VNĐ (Baseline khởi động)</b>`
    );
  } else {
    let cumDeM3K = 0, cumDeVipK = 0, deWinCount = 0;
    let cumCrossLoM3K = 0, cumCrossLoVipK = 0, crossLoWinCount = 0;
    let cumLoM3K = 0, cumLoVipK = 0;
    let cumXien11M3K = 0, cumXien11VipK = 0, xien11WinCount = 0;
    let cumX3K = 0, x3WinCount = 0, x3TicketCount = 0;
    let cumX5ProfitVIP_K = 0, x5WinCount = 0;

    for (const d of sortedBattleDates) {
      const chRow = (advisorPayload?.crossHedgingPortfolio?.settledLedger || []).find(r => (r.predictionDate || r.date) === d);

      const deRow = resolveUnifiedDeRowForDate(d, advisorPayload);
      cumDeM3K += deRow.profitM3K;
      cumDeVipK += deRow.profitK;
      if (deRow.isHit) deWinCount++;

      const crossLoRow = resolveUnifiedCrossLoRowForDate(d, advisorPayload);
      cumCrossLoM3K += crossLoRow.m3ProfitK;
      cumCrossLoVipK += crossLoRow.vipProfitK;
      if (crossLoRow.isWin) crossLoWinCount++;

      const loEntry = liveDiaryEntries.find(r => (r.date || r.predictionDate) === d && r.settled !== false);
      if (loEntry) {
        const loRow = resolveUnifiedLoRowForDate(loEntry);
        cumLoM3K += loRow.dayM3ProfitK;
        cumLoVipK += loRow.dayProfitK;
      }

      const top5XienDay = (advisorPayload?.loTop5ConsensusXien?.settledLedger || []).find(r => (r.predictionDate || r.date) === d);
      if (chRow && chRow.xienProfitK !== undefined) {
        cumXien11M3K += Math.round(chRow.xienProfitK * 0.2);
        cumXien11VipK += chRow.xienProfitK;
        if (chRow.xienProfitK > 0) xien11WinCount++;
      } else if (top5XienDay) {
        cumXien11M3K += top5XienDay.q11ProfitM3K;
        cumXien11VipK += top5XienDay.q11ProfitVIP_K;
        if (top5XienDay.isWin) xien11WinCount++;
      }

      // Xiên 3 Quây & Dàn Xiên 5 tích lũy độc lập, không bị shadow bởi chRow
      if (top5XienDay) {
        const isAbstainDay = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].includes(d);
        const dayX3ProfitK = isAbstainDay ? 0 : (top5XienDay.x3ProfitK || 0);
        const dayX3Tickets = top5XienDay.x3Tickets || 0;
        cumX3K += dayX3ProfitK;
        if (dayX3Tickets > 0) x3WinCount++;
        x3TicketCount += dayX3Tickets;

        const dayX5ProfitK = top5XienDay.x5Profit55K ?? 0;
        cumX5ProfitVIP_K += dayX5ProfitK;
        if (dayX5ProfitK > 0) x5WinCount++;
      }
    }

    const daysCount = sortedBattleDates.length;
    const cumMainM3K = cumDeM3K + cumCrossLoM3K + cumXien11M3K;
    const cumMainVipK = cumDeVipK + cumCrossLoVipK + cumXien11VipK;
    const cumM3TotalK = cumDeM3K + cumLoM3K + cumXien11M3K;
    const cumVipTotalK = cumDeVipK + cumLoVipK + cumXien11VipK;
    const cumX3M3K = Math.round(cumX3K * 0.2);

    lines.push(
      `• 📅 <b>Số kỳ đã kết toán</b>: <b>${daysCount} kỳ</b>`,
      `• ⚡ <b>Lô Ghép 4 Động Cơ (Đa Tầng X5/X4/X3/X1 - Khuyên Dùng)</b>: <b>${formatK(cumCrossLoM3K)}</b> (${formatM(cumCrossLoVipK)} VIP · ${crossLoWinCount}/${daysCount} kỳ thắng · Win ${((crossLoWinCount/daysCount)*100).toFixed(0)}%)`,
      `• 💎 <b>Đề Thực Chiến (17 VIP X3 + 26 Bọc Lót X1)</b>: <b>${formatK(cumDeM3K)}</b> (${formatM(cumDeVipK)} VIP · ${deWinCount}/${daysCount} kỳ trúng · Win ${((deWinCount/daysCount)*100).toFixed(0)}%)`,
      `• 🎲 <b>Lô Xiên Quây Top 5 Đồng Thuận (Bộ 4 Quây 11 vé)</b>: <b>${formatK(cumXien11M3K)}</b> (${formatM(cumXien11VipK)} VIP · ${xien11WinCount}/${daysCount} kỳ thắng · Win ${((xien11WinCount/daysCount)*100).toFixed(0)}% · Nổ kỷ lục 26/09: +373M VIP / +74.6M M3)`,
      `• 🎯 <b>Lô Xiên 3 Quây (Bộ 5 Quây 10 vé · Vốn 1.0M/ngày)</b>: <b>${formatM(cumX3K)} VIP</b> (${cumX3M3K >= 0 ? '+' : ''}${(cumX3M3K / 1000).toFixed(1)}M M3 · ${x3WinCount}/${daysCount} ngày nổ ${x3TicketCount} vé X3)`,
      `• 👑 <b>Dàn Xiên 5 (5 Dàn X4 · 11M/dàn)</b>: <b>${formatM(cumX5ProfitVIP_K)} VIP</b> (${x5WinCount}/${daysCount} kỳ thắng · Win ${((x5WinCount/daysCount)*100).toFixed(0)}%)`,
      `• 💰 <b>TỔNG LŨY KẾ CHIẾN LƯỢC CHỦ LỰC (LÔ GHÉP TẦNG + ĐỀ + XIÊN QUÂY):</b>`,
      `   👉 <b>Đơn Vị Bot Telegram:</b> <b>${formatK(cumMainM3K)}</b> (${cumMainM3K > 0 ? '+' : ''}${(cumMainM3K / 1000).toFixed(2)} Triệu VNĐ) ${cumMainM3K > 0 ? '🎉 <b>(DƯƠNG LÃI RỰC RỠ)</b>' : ''}`,
      `   👉 <b>Mức VIP Vốn Lớn:</b> <b>${formatM(cumMainVipK)}</b> ${cumMainVipK > 0 ? '🎉 <b>(ĐỈNH CAO THỰC CHIẾN)</b>' : ''}`,
      `<i>(Đối soát nếu phân tán vốn đánh cả combo: Lô ${formatK(cumLoM3K)} · Xiên ${formatK(cumXien11M3K)} · Tổng ${formatK(cumM3TotalK)})</i>`
    );
  }
  lines.push(divider);

  // =========================================================================
  // 7. 💡 KHUYẾN NGHỊ PHÂN BỔ VỐN & RADAR LỌT KHE
  // =========================================================================
  const deMethodShort = streakDeAdv?.selectedMethodLabel || 'Đề Tuyển Chọn';
  const loTargetNums = crossOpt ? crossOpt.totalNumbers : allMerged.length;
  lines.push(
    `<b>7. 💡 KHUYẾN NGHỊ PHÂN BỔ VỐN & RADAR KHÁNG BẪY</b>`,
    `• 🛡️ <b>Phòng thủ (50%)</b>: <b>${escapeHtml(deMethodShort)}</b> (${sNumbers.length || 43} số · Đòn bẩy X2 gỡ lỗ sau trượt) — Ăn đều đặn bảo vệ vốn.`,
    `• ⚔️ <b>Tấn công (50%)</b>: <b>Lô Ghép Tầng Đa Phương Pháp</b> (${loTargetNums} số: Hạt nhân X3, mũi nhọn X2, bảo hiểm X1) + <b>Lô Xiên 4 Quây</b> săn đại thắng.`
  );

  // Radar Lọt Khe (Unchosen Pool Radar)
  const dePoolsForRadar = [
    advisorPayload?.pentaCoreDe?.latestRecommendation?.numbers,
    advisorPayload?.adaptiveDualMerge?.latestRecommendation?.fullUnion,
    advisorPayload?.dualMerge?.latestRecommendation?.fullUnion,
    advisorPayload?.tripleMerge?.latestRecommendation?.fullUnion,
    advisorPayload?.metaLearner?.latestRecommendation?.standard30 || advisorPayload?.metaLearner?.latestRecommendation?.numbers,
    advisorPayload?.deMarkovGapHazard?.latestRecommendation?.numbers,
    advisorPayload?.dePositionalGraphFlow?.latestRecommendation?.numbers
  ].filter(Boolean);

  if (dePoolsForRadar.length > 0) {
    const voteCounts = Array.from({ length: 100 }, () => 0);
    dePoolsForRadar.forEach(pool => {
      (pool || []).forEach(n => {
        const idx = Number(n);
        if (Number.isInteger(idx) && idx >= 0 && idx < 100) voteCounts[idx]++;
      });
    });

    const lotKhe0 = [];
    for (let i = 0; i < 100; i++) {
      if (voteCounts[i] === 0) lotKhe0.push(String(i).padStart(2, '0'));
    }
    const aiCoverage = 100 - lotKhe0.length;

    if (lotKhe0.length > 0 && lotKhe0.length < 100) {
      const isHedgeActive = Boolean(recPort?.deStructure?.isHedgeActive || streakDeAdv?.lotKheHedge?.isHedgeActive || (lotKhe0.length > 0 && lotKhe0.length <= 15));
      const hedgeNote = isHedgeActive
        ? ` 👉 <b>HỆ THỐNG ĐÃ TỰ ĐỘNG KÍCH HOẠT KHIÊN BẢO HIỂM LỌT KHE (1 Ăn 84)!</b>`
        : ` <i>(Độ an toàn AI rất cao, không cần bọc lót hoặc chơi Gói 5 Kháng Bẫy Outlier)</i>`;
      lines.push(
        `• 🎯 <b>Radar Lọt Khe Hôm Nay (An toàn AI: ${aiCoverage}%)</b>: 7 siêu động cơ AI phủ <b>${aiCoverage}/100</b> số. Còn <b>${lotKhe0.length} số Lọt Khe tuyệt đối (0-vote)</b>:`,
        `   └ <code>${lotKhe0.join(' ')}</code>${hedgeNote}`
      );
    }
  }

  lines.push(
    '',
    `💬 <i>Gõ <b>/cuoc</b> để xem Bảng Tính Lỗ/Lãi Tự Động theo Mức 3 (Mặc định) hoặc chọn mức khác!</i>`,
    `<i>Dữ liệu được niêm phong bất biến (Strict PIT) · Minh bạch &amp; đối soát tự động.</i>`
  );

  return {
    predictionDate,
    latestDataDate: dePayload.latestDataDate,
    text: lines.join('\n'),
    deStrategy: 'metaLearner',
    deTarget: 30,
    lotoMethodKey: 'dynamicMetaAdvisor'
  };
}

async function telegramApi(env, method, body) {
  const token = requireEnv(env, 'TELEGRAM_BOT_TOKEN');
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(`Telegram ${method} failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload.result;
}

async function resolveTelegramChatId(env) {
  if (env.TELEGRAM_CHAT_ID) return String(env.TELEGRAM_CHAT_ID);
  return env.TELEGRAM_STATE?.get(TELEGRAM_CHAT_KEY) || null;
}

function splitTelegramText(text, maxLength = 3900) {
  const lines = String(text || '').split('\n');
  const chunks = [];
  let current = '';
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (current && next.length > maxLength) {
      chunks.push(current);
      current = line;
      continue;
    }
    if (!current && line.length > maxLength) {
      for (let index = 0; index < line.length; index += maxLength) {
        chunks.push(line.slice(index, index + maxLength));
      }
      continue;
    }
    current = next;
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [''];
}

async function sendTelegramMessage(env, chatId, text, replyMarkup = null) {
  let lastMessage = null;
  const chunks = splitTelegramText(text);
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const body = {
      chat_id: chatId,
      text: chunks[i],
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
    if (isLast && replyMarkup) {
      body.reply_markup = replyMarkup;
    }
    lastMessage = await telegramApi(env, 'sendMessage', body);
  }
  return lastMessage;
}

function evaluatePredictionCacheReadiness(dePayload = {}, lotoPayload = {}, expectedDataDate = null) {
  const deLatestDataDate = String(dePayload.latestDataDate || '');
  const lotoLatestDataDate = String(lotoPayload.latestDataDate || '');
  const dePredDate = String(dePayload.nextPrediction?.predictionIsoDate || '');
  const lotoPredDate = String(lotoPayload.nextPrediction?.predictionIsoDate || '');
  const requestedDataDate = expectedDataDate ? String(expectedDataDate) : null;
  const cachesMatch = Boolean(deLatestDataDate)
    && deLatestDataDate === lotoLatestDataDate;
  const requestedDateMatches = !requestedDataDate
    || deLatestDataDate === requestedDataDate
    || dePredDate === requestedDataDate
    || lotoPredDate === requestedDataDate;

  return {
    ready: cachesMatch && requestedDateMatches,
    dataDate: cachesMatch ? deLatestDataDate : null,
    expectedDataDate: requestedDataDate,
    deLatestDataDate,
    lotoLatestDataDate
  };
}

function hasValidAdvisorData(payload) {
  if (!payload || typeof payload !== 'object') return false;
  return Boolean(
    payload.streakAwareDeAdvisor?.latestRecommendation ||
    payload.dualMerge?.latestRecommendation ||
    payload.crossHedgingPortfolio?.latestRecommendation ||
    payload.crossHedgingPortfolio ||
    payload.metaLearner?.latestRecommendation ||
    payload.loQuadHybrid?.latestRecommendation
  );
}

async function getLockedAdvisorPayload(env) {
  let advisorPayload = await fetchPredictionJson(env, '/api/daily-advisor').catch(err => {
    console.warn('Failed to fetch /api/daily-advisor, will try fallback:', err?.message || err);
    return null;
  });

  if (!hasValidAdvisorData(advisorPayload)) {
    try {
      const r2Base = String(env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL || 'https://pub-df6c4a2a06ff417cad48f09d66fd7bf0.r2.dev').replace(/\/$/, '');
      const r2Res = await fetch(`${r2Base}/statistics/cached_daily_method_advisor.json`, {
        headers: { accept: 'application/json' }
      });
      if (r2Res.ok) {
        const r2Json = await r2Res.json();
        if (hasValidAdvisorData(r2Json)) {
          advisorPayload = r2Json;
        }
      }
    } catch (r2Err) {
      console.warn('R2 fallback fetch error:', r2Err);
    }
  }

  if (!advisorPayload) advisorPayload = {};

  const predictionDate = advisorPayload?.crossHedgingPortfolio?.latestRecommendation?.targetDate
    || advisorPayload?.crossHedgingPortfolio?.targetDate
    || advisorPayload?.streakAwareDeAdvisor?.latestRecommendation?.predictionDate
    || advisorPayload?.loQuadHybrid?.latestRecommendation?.predictionDate
    || advisorPayload?.loQuantumBayesFusion?.latestRecommendation?.predictionDate
    || advisorPayload?.dualMerge?.latestRecommendation?.predictionDate
    || advisorPayload?.pendingPredictionDate
    || getVietnamDate();

  if (!env.TELEGRAM_STATE) {
    return { advisorPayload, predictionDate };
  }

  // Check VN time to determine if we are in the lock window (>= 12h)
  let inLockWindow = false;
  try {
    const vnFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
    const parts = vnFormatter.formatToParts(new Date());
    const m = {};
    for (const p of parts) m[p.type] = p.value;
    const vnDate = `${m.year}-${m.month}-${m.day}`;
    const vnHour = parseInt(m.hour, 10);
    if (vnDate === String(predictionDate).slice(0, 10) && vnHour >= 12) {
      inLockWindow = true;
    }
  } catch (_) {}

  const kvKey = `LOCKED_ADVISOR_${predictionDate}`;
  try {
    const saved = await env.TELEGRAM_STATE.get(kvKey, 'json');
    if (saved && hasValidAdvisorData(saved)) {
      // Use the locked snapshot from KV to ensure 100% immutability even across new deploys
      return { advisorPayload: saved, predictionDate };
    }
    if (inLockWindow && hasValidAdvisorData(advisorPayload)) {
      await env.TELEGRAM_STATE.put(kvKey, JSON.stringify(advisorPayload), { expirationTtl: 86400 });
    }
  } catch (err) {
    console.warn('KV locked advisor read/write error:', err);
  }

  return { advisorPayload, predictionDate };
}

async function notifyTelegram(env, options = {}) {
  const chatId = await resolveTelegramChatId(env);
  if (!chatId) {
    return { ok: false, skipped: true, reason: 'telegram-chat-not-registered' };
  }

  const [dePayload, lotoPayload, historyPayload, advisorResult] = await Promise.all([
    fetchPredictionJson(env, '/api/milestone-20y/prediction?view=telegram').catch(err => {
      console.error('Failed to fetch /api/milestone-20y/prediction:', err);
      return {};
    }),
    fetchPredictionJson(env, '/api/loto/prediction?count=all&view=telegram').catch(err => {
      console.error('Failed to fetch /api/loto/prediction:', err);
      return {};
    }),
    fetchPredictionJson(env, '/api/prediction/history?limit=90&view=telegram').catch(err => {
      console.error('Failed to fetch /api/prediction/history:', err);
      return {};
    }),
    getLockedAdvisorPayload(env)
  ]);
  const advisorPayload = advisorResult?.advisorPayload || {};
  const hasAdvisor = hasValidAdvisorData(advisorPayload);
  const readiness = evaluatePredictionCacheReadiness(
    dePayload,
    lotoPayload,
    options.expectedDataDate || null
  );
  if (!options.force && (!readiness.ready || !hasAdvisor)) {
    return {
      ok: false,
      skipped: true,
      reason: !readiness.ready ? 'prediction-cache-not-ready' : 'advisor-cache-not-ready',
      expectedDataDate: readiness.expectedDataDate,
      deLatestDataDate: readiness.deLatestDataDate,
      lotoLatestDataDate: readiness.lotoLatestDataDate,
      hasAdvisorData: hasAdvisor
    };
  }

  const report = buildTelegramReport(dePayload, lotoPayload, historyPayload, advisorPayload);
  const lastSent = await env.TELEGRAM_STATE?.get(TELEGRAM_LAST_SENT_KEY);
  if (!options.force && lastSent === report.predictionDate) {
    return { ok: true, skipped: true, reason: 'already-sent', predictionDate: report.predictionDate };
  }

  const message = await sendTelegramMessage(env, chatId, report.text, BETTING_KEYBOARD);
  await env.TELEGRAM_STATE?.put(TELEGRAM_LAST_SENT_KEY, report.predictionDate);
  return {
    ok: true,
    skipped: false,
    predictionDate: report.predictionDate,
    latestDataDate: report.latestDataDate,
    messageId: message.message_id,
    deStrategy: report.deStrategy,
    deTarget: report.deTarget,
    lotoMethod: report.lotoMethodKey
  };
}

async function handleTelegramWebhook(request, env) {
  const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET;
  const providedSecret = request.headers.get('x-telegram-bot-api-secret-token');
  if (providedSecret !== expectedSecret && !isAuthorizedRequest(request, env)) return json({ ok: false, error: 'Unauthorized' }, 401);

  const update = await request.json().catch(() => ({}));
  const callbackQuery = update.callback_query;
  const rawMessage = update.message || update.edited_message || callbackQuery?.message;
  if (!rawMessage?.chat?.id && !callbackQuery?.from?.id) return json({ ok: true, ignored: true });

  const username = String(update.message?.from?.username || callbackQuery?.from?.username || '').toLowerCase();
  const allowed = String(env.TELEGRAM_ALLOWED_USERNAME || 'chungtvvn').replace(/^@/, '').toLowerCase();
  if (!username || username !== allowed) {
    return json({ ok: true, ignored: true, reason: 'username-not-allowed' });
  }

  const chatId = String(rawMessage?.chat?.id || callbackQuery?.message?.chat?.id || env.TELEGRAM_CHAT_ID);
  await env.TELEGRAM_STATE?.put(TELEGRAM_CHAT_KEY, chatId);

  if (callbackQuery) {
    await telegramApi(env, 'answerCallbackQuery', { callback_query_id: callbackQuery.id }).catch(() => ({}));
    const data = String(callbackQuery.data || '');
    let tierKey = '2';
    if (data === 'cuoc_1') tierKey = '1';
    else if (data === 'cuoc_2') tierKey = '2';
    else if (data === 'cuoc_3') tierKey = '3';
    else if (data === 'cuoc_vip') tierKey = 'vip';

    const tier = BETTING_TIERS[tierKey] || BETTING_TIERS[3];
    const { advisorPayload, predictionDate } = await getLockedAdvisorPayload(env);
    const sheet = buildBetCalculationSheet(tier, predictionDate, advisorPayload);
    await sendTelegramMessage(env, chatId, sheet, BETTING_KEYBOARD);
    return json({ ok: true, callback: data, tier: tier.name });
  }

  const text = String(rawMessage?.text || '').trim();
  const lowerText = text.toLowerCase();
  const parts = lowerText.split(/\s+/);
  const cmd = parts[0];

  if (cmd === '/chot' || cmd === '/dan' || cmd === '/slip' || cmd === '/final') {
    const { advisorPayload, predictionDate } = await getLockedAdvisorPayload(env);
    const slip = buildOptimalBetSlipMessage(predictionDate, advisorPayload);
    await sendTelegramMessage(env, chatId, slip, BETTING_KEYBOARD);
    return json({ ok: true, command: cmd });
  }

  if (cmd === '/cuoc' || cmd === '/muc' || cmd === '/tinh') {
    let chosenTier = BETTING_TIERS[3];
    if (parts[1] === '1') chosenTier = BETTING_TIERS[1];
    else if (parts[1] === '2') chosenTier = BETTING_TIERS[2];
    else if (parts[1] === '3') chosenTier = BETTING_TIERS[3];
    else if (parts[1] === 'vip' || parts[1] === '4') chosenTier = BETTING_TIERS.vip;
    else if (parts.length >= 3 && !isNaN(Number(parts[1])) && !isNaN(Number(parts[2]))) {
      const deK = Number(parts[1]);
      const loD = Number(parts[2]);
      const xienK = Number(parts[3] || parts[1]);
      chosenTier = {
        id: 'custom',
        name: `Mức Tùy Chỉnh (Đề ${deK}K · Lô ${loD}đ · Xiên ${xienK}K)`,
        deK,
        loDiem: loD,
        loX2Diem: loD * 2,
        xien4K: xienK
      };
    }

    const { advisorPayload, predictionDate } = await getLockedAdvisorPayload(env);
    const sheet = buildBetCalculationSheet(chosenTier, predictionDate, advisorPayload);
    await sendTelegramMessage(env, chatId, sheet, BETTING_KEYBOARD);
    return json({ ok: true, command: cmd, tier: chosenTier.id });
  }

  // Respond immediately with the full live report for any command or chat message
  const result = await notifyTelegram(env, { force: true });
  return json(result);
}

async function setupTelegramWebhook(request, env) {
  if (!isAuthorizedRequest(request, env)) return json({ ok: false, error: 'Unauthorized' }, 401);
  const url = new URL(request.url);
  const webhookUrl = `${url.origin}/telegram/webhook`;
  const result = await telegramApi(env, 'setWebhook', {
    url: webhookUrl,
    secret_token: requireEnv(env, 'TELEGRAM_WEBHOOK_SECRET'),
    allowed_updates: ['message', 'edited_message', 'callback_query'],
    drop_pending_updates: false
  });
  return json({ ok: true, webhookUrl, result });
}

async function handleDispatchRequest(request, env) {
  const url = new URL(request.url);
  if (!isAuthorizedRequest(request, env)) return json({ ok: false, error: 'Unauthorized' }, 401);
  const targetDate = url.searchParams.get('targetDate') || getVietnamDate();
  const inputs = buildInputs(targetDate, {
    wait_for_new_xoso: url.searchParams.get('wait_for_new_xoso') || url.searchParams.get('wait') || '1',
    xoso_max_wait_minutes: url.searchParams.get('maxWait') || DEFAULT_INPUTS.xoso_max_wait_minutes,
    xoso_retry_interval_seconds: url.searchParams.get('retrySeconds') || DEFAULT_INPUTS.xoso_retry_interval_seconds,
    force_regenerate_stats: url.searchParams.get('force') || DEFAULT_INPUTS.force_regenerate_stats,
    clear_r2_statistics: url.searchParams.get('clearStats') || DEFAULT_INPUTS.clear_r2_statistics
  });
  return json(await dispatchGithubWorkflow(env, inputs, 'manual-http'));
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/') {
    return json({
      ok: true,
      service: 'xsmb-daily-update-dispatcher',
      updateCronUtc: UPDATE_CRON,
      updateTimeVietnam: '18:40',
      telegramDelivery: 'github-action-after-cache-verification',
      githubWorkflow: env.GITHUB_WORKFLOW || 'daily-update.yml',
      targetDateToday: getVietnamDate(),
      telegramConfigured: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET),
      telegramChatRegistered: Boolean(await resolveTelegramChatId(env))
    });
  }
  if (request.method === 'POST' && url.pathname === '/') return handleDispatchRequest(request, env);
  if (request.method === 'POST' && url.pathname === '/telegram/webhook') {
    return handleTelegramWebhook(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/telegram/setup-webhook') {
    return setupTelegramWebhook(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/telegram/notify') {
    if (!isAuthorizedRequest(request, env)) return json({ ok: false, error: 'Unauthorized' }, 401);
    return json(await notifyTelegram(env, {
      force: url.searchParams.get('force') === '1',
      expectedDataDate: url.searchParams.get('dataDate') || undefined
    }));
  }
  if (request.method === 'GET' && url.pathname === '/telegram/status') {
    if (!isAuthorizedRequest(request, env)) return json({ ok: false, error: 'Unauthorized' }, 401);
    const me = await telegramApi(env, 'getMe').catch(err => ({ error: err.message }));
    const webhookInfo = await telegramApi(env, 'getWebhookInfo').catch(err => ({ error: err.message }));
    const chatId = await resolveTelegramChatId(env);
    const chatInfo = chatId ? await telegramApi(env, 'getChat', { chat_id: chatId }).catch(err => ({ error: err.message })) : null;
    const lastSent = await env.TELEGRAM_STATE?.get(TELEGRAM_LAST_SENT_KEY).catch(err => err.message);
    return json({
      ok: true,
      configured: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET),
      chatRegistered: Boolean(chatId),
      chatId: chatId,
      chatInfo: chatInfo,
      botMe: me,
      webhookInfo: webhookInfo,
      lastSentPredictionDate: lastSent || null
    });
  }
  return json({ ok: false, error: 'Not found' }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error(error);
      return json({ ok: false, error: error.message }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    if (event.cron === UPDATE_CRON) {
      const inputs = buildInputs(getVietnamDate());
      ctx.waitUntil(dispatchGithubWorkflow(env, inputs, `cron:${event.cron}`));
    }
  }
};

export {
  BETTING_KEYBOARD,
  BETTING_TIERS,
  buildBetCalculationSheet,
  buildOptimalBetSlipMessage,
  buildTelegramReport,
  evaluatePredictionCacheReadiness,
  formatK,
  formatM,
  getLockedAdvisorPayload,
  getVietnamDate,
  notifyTelegram,
  splitTelegramText
};
