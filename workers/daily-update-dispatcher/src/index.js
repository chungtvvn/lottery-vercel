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
    source: 'milestone',
    strategy: 'deMilestoneHistoryEdge75UnionX2',
    target: 70,
    label: 'Gộp Edge75 Lịch sử + Song Song Mốc 20 năm (x2 số trùng)'
  }
];
const DEFAULT_LOTO_COUNT = 6;
const TELEGRAM_LOTO_COUNTS = [6, 7];
const TELEGRAM_LOTO_STRATEGIES = [
  {
    strategy: LEGACY_RRF_LOTO_STRATEGY,
    label: 'RRF Song song (Chuỗi nhỏ 65 + Nhịp block 85)'
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
    loX2Diem: 10,
    xien4K: 20
  },
  2: {
    id: 2,
    name: 'Mức 2: Tiêu Chuẩn Thực Chiến Hàng Ngày',
    deK: 20,
    loDiem: 10,
    loX2Diem: 20,
    xien4K: 50
  },
  3: {
    id: 3,
    name: 'Mức 3: Đề 200K/số · Lô 25đ/số (Đầu Tư Cao - Mặc Định)',
    deK: 200,
    loDiem: 25,
    loX2Diem: 50,
    xien4K: 200
  },
  vip: {
    id: 'vip',
    name: 'Mức VIP: Vốn Lớn Quy Chuẩn',
    deK: 1000,
    loDiem: 100,
    loX2Diem: 200,
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

function buildBetCalculationSheet(tier, date, advisorPayload = {}) {
  const divider = '━━━━━━━━━━━━━━━━━━━━';
  const deStakeK = 30 * tier.deK;
  const deWinProfitK = tier.deK * 84 - deStakeK;
  const loStdStakeK = 20 * tier.loDiem * 22;
  const loStdWinPerHitK = tier.loDiem * 80;
  const loX2StakeK = 7 * tier.loX2Diem * 22;
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
    divider,
    `<b>1. 💎 ĐỀ TINH HOA (DÀN 30 SỐ)</b>`,
    `  • Mức cược: <b>${tier.deK.toLocaleString('vi-VN')}K / số</b>`,
    `  • Tổng vốn: <b>${deStakeK.toLocaleString('vi-VN')}K</b> (30 số)`,
    `  • Trúng ăn: <b>${(tier.deK * 84).toLocaleString('vi-VN')}K</b> (nhân 84 lần)`,
    `  • 👉 <b>Lãi ròng khi trúng:</b> <b>+${deWinProfitK.toLocaleString('vi-VN')}K</b>`,
    `  • 👉 <b>Lỗ khi trượt:</b> <b>-${deStakeK.toLocaleString('vi-VN')}K</b>`,
    divider,
    `<b>2. 🏆 LÔ CHUẨN TỐI ƯU (DÀN 20 SỐ)</b>`,
    `  • Mức cược: <b>${tier.loDiem} điểm / số</b> (Tổng: ${20 * tier.loDiem} điểm)`,
    `  • Tổng vốn: <b>${loStdStakeK.toLocaleString('vi-VN')}K</b> (1 điểm = 22K)`,
    `  • Tiền thưởng: <b>${loStdWinPerHitK.toLocaleString('vi-VN')}K / nháy nổ</b> (1 điểm = 80K)`,
    `  • Hòa vốn: cần <b>5.5 nháy</b> (từ 6 nháy là có lãi)`,
    `  • Ví dụ: Nổ 6 nháy lãi <b>${formatK(6 * loStdWinPerHitK - loStdStakeK)}</b> · Nổ 8 nháy lãi <b>${formatK(8 * loStdWinPerHitK - loStdStakeK)}</b>`,
    divider,
    `<b>3. 🚀 LÔ ĐÁNH X2 AN TOÀN CAO (DÀN 7 SỐ TĂNG TỐC)</b>`,
    `  • Mức cược: <b>${tier.loX2Diem} điểm / số</b> (Tổng: ${7 * tier.loX2Diem} điểm)`,
    `  • Tổng vốn: <b>${loX2StakeK.toLocaleString('vi-VN')}K</b>`,
    `  • Tiền thưởng: <b>${loX2WinPerHitK.toLocaleString('vi-VN')}K / nháy nổ</b>`,
    `  • Hòa vốn: cần <b>2 nháy</b> nổ là có lãi ngay (2 nháy ăn ${(2 * loX2WinPerHitK).toLocaleString('vi-VN')}K -> lãi <b>${formatK(2 * loX2WinPerHitK - loX2StakeK)}</b>)`,
    divider,
    `<b>4. 💎 LÔ XIÊN 4 TINH HOA (QUÂY 11 VÉ)</b>`,
    `  • Mức cược: <b>${tier.xien4K.toLocaleString('vi-VN')}K / vé</b> (Tổng 11 vé: 1 X4 + 4 X3 + 6 X2)`,
    `  • Tổng vốn: <b>${xien4StakeK.toLocaleString('vi-VN')}K</b>`,
    `  • 🎯 Ăn 2 con: Ăn <b>${x4Win2K.toLocaleString('vi-VN')}K</b> -> Lãi ròng <b>${formatK(x4Profit2K)}</b>`,
    `  • 🔥 Ăn 3 con: Ăn <b>${x4Win3K.toLocaleString('vi-VN')}K</b> -> Lãi ròng <b>${formatK(x4Profit3K)}</b>`,
    `  • 💥 Ăn 4 con: Ăn <b>${x4Win4K.toLocaleString('vi-VN')}K</b> -> Lãi ròng <b>${formatK(x4Profit4K)}</b>`,
    divider,
    `💰 <b>TỔNG VỐN ĐẦU TƯ TRỌN GÓI HÔM NAY:</b> <b>${totalDailyStakeK.toLocaleString('vi-VN')}K VNĐ</b> (~${(totalDailyStakeK / 1000).toFixed(2)} Triệu VNĐ)`
  ];
  return lines.join('\n');
}

function buildTelegramReport(dePayload, lotoPayload, historyPayload = {}, advisorPayload = {}) {
  // ── Data sources ──────────────────────────────────────────────────────────
  // Đề Tinh Hoa — MetaLearner (dàn 30 số quán quân)
  const metaLearner = advisorPayload?.metaLearner || null;
  const metaRec = metaLearner?.latestRecommendation || null;
  const metaSettledList = metaLearner?.settledLedger || [];
  const metaLearnerSummary = metaLearner?.summary || {};

  // Đề Tri-Governor Đa Phương Pháp (Streak-Aware) & Lô Tứ Trụ Quad-Fusion & Xiên 4 Synergy
  const streakDeAdv = advisorPayload?.streakAwareDeAdvisor?.latestRecommendation || null;
  const loQuadAdv = advisorPayload?.loQuadHybrid?.latestRecommendation || null;
  const loXien4Adv = advisorPayload?.loXien4Synergy?.latestRecommendation || null;

  // Lô Tinh Hoa — Dynamic Meta-Selector (tự chọn PP tốt nhất mỗi ngày)
  const metaAdv = advisorPayload?.dynamicMetaAdvisor || null;
  const metaNext = metaAdv?.nextPrediction || null;
  const metaAdvSummary = metaAdv?.summary || null;
  const liveDiaryEntries = Array.isArray(metaAdv?.liveDiary) ? metaAdv.liveDiary : [];

  // predictionDate fallback chain
  const predictionDate = streakDeAdv?.predictionDate
    || loQuadAdv?.predictionDate
    || loXien4Adv?.predictionDate
    || metaNext?.predictionDate
    || metaRec?.predictionDate
    || advisorPayload?.loQuantumBayesFusion?.latestRecommendation?.predictionDate
    || dePayload.nextPrediction?.predictionIsoDate
    || lotoPayload.nextPrediction?.predictionIsoDate;

  if (!predictionDate) {
    throw new Error('Payload chưa có đủ dự đoán Đề/Lô cho ngày tiếp theo.');
  }

  const divider = '━━━━━━━━━━━━━━━━━━━━';

  const lines = [
    `🎯 <b>XSMB — GỢI Ý THỰC CHIẾN HÀNG NGÀY ${escapeHtml(displayDate(predictionDate))}</b>`,
    `<i>Cơ chế cược Mức 3 (Mặc định): Đề 200K/số · Lô 25đ/số (X2 50đ) · Xiên 4 quây 200K/vé (hoặc Mức VIP: Đề 1M · Lô 100đ)</i>`,
    ''
  ];

  // =========================================================================
  // 0. 🏆 BÁO CÁO KẾT QUẢ ĐỐI SOÁT HÔM NAY (NẾU ĐÃ CÓ KẾT QUẢ MỞ THƯỞNG)
  // =========================================================================
  const lastSettledDe = metaSettledList[metaSettledList.length - 1] || null;
  const lastSettledLo = liveDiaryEntries.filter(r => r.settled !== false && (r.db || r.dayProfitK !== undefined)).pop() || null;
  const settledDate = lastSettledDe?.predictionDate || lastSettledDe?.date || lastSettledLo?.date;

  if (settledDate && (lastSettledDe?.actualSpecial != null || lastSettledLo?.db != null)) {
    const actualSpecial = lastSettledDe?.actualSpecial ?? lastSettledDe?.actual ?? lastSettledLo?.db;
    const specStr = String(actualSpecial).padStart(2, '0');
    const deIsHit = Boolean(lastSettledDe?.isHit || (lastSettledDe?.profitK || 0) > 0 || lastSettledDe?.hitType === 'win_x1');
    const deProfitK = Number(lastSettledDe?.profitK ?? (deIsHit ? 54000 : -30000));
    const inCore10 = (lastSettledDe?.core10 || []).map(normalizeLotteryNumber).includes(specStr);

    const dmRow = (advisorPayload?.loDualMerge?.settledLedger || []).find(r => r.date === settledDate);
    const actual27List = (dmRow?.actual27 || []).map(normalizeLotteryNumber);

    const stdHits = Number(lastSettledLo?.standard?.hits ?? 0);
    const stdProfitK = Number(lastSettledLo?.standard?.profitK ?? (stdHits * 8000 - 44000));
    const stdHitNums = (lastSettledLo?.standard?.numbers || []).map(normalizeLotteryNumber).filter(n => actual27List.includes(n));
    const stdHitStr = stdHitNums.length ? ` (Nổ: <b>${stdHitNums.join(', ')}</b>)` : '';

    const x2Hits = Number(lastSettledLo?.x2?.hits ?? 0);
    const x2ProfitK = Number(lastSettledLo?.x2?.profitK ?? (x2Hits * 16000 - 30800));
    const x2HitNums = (lastSettledLo?.x2?.numbers || []).map(normalizeLotteryNumber).filter(n => actual27List.includes(n));
    const x2HitStr = x2HitNums.length ? ` (Nổ: <b>${x2HitNums.join(', ')}</b>)` : '';

    const xi4Hits = Number(lastSettledLo?.xien4?.hits ?? 0);
    const xi4ProfitK = Number(lastSettledLo?.xien4?.profitK ?? -11000);

    const todayTotalProfitK = deProfitK + (lastSettledLo?.dayProfitK ?? (stdProfitK + x2ProfitK + xi4ProfitK));

    // Standard Units (10K / 10đ / 20đ / 100K)
    const deStdProfitK = deIsHit ? 540 : -300;
    const loStdProfitK = stdHits * 800 - 4400;
    const loX2ProfitK = x2Hits * 1600 - 3080;
    let xi4StdProfitK = -1100;
    if (xi4Hits === 4) xi4StdProfitK = 38400 - 1100;
    else if (xi4Hits === 3) xi4StdProfitK = 7000 - 1100;
    else if (xi4Hits === 2) xi4StdProfitK = 1000 - 1100;
    const todayStdTotalK = deStdProfitK + loStdProfitK + loX2ProfitK + xi4StdProfitK;

    lines.push(
      `🏆 <b>BÁO CÁO KẾT QUẢ ĐỐI SOÁT HÔM NAY (${escapeHtml(displayDate(settledDate))})</b>`,
      `🎯 <b>Giải Đặc Biệt (Đề):</b> <b>${escapeHtml(specStr)}</b>`,
      `• 💎 <b>Đề Gợi Ý (Dàn 30)</b>: ${deIsHit ? `🎉 <b>TRÚNG ĐỀ ${escapeHtml(specStr)}</b> (+54M)` : '❌ <b>Trượt (-30M)</b>'}${inCore10 ? ' · <i>(Nổ ngay Core 10 VIP!)</i>' : ''}`,
      `   └ Mức chuẩn 10K: <b>${formatK(deStdProfitK)}</b> (Vốn 300K · Ăn ${deIsHit ? '840K' : '0K'}) · Mức VIP: <b>${formatM(deProfitK)}</b>`,
      `• 🏆 <b>Lô Chuẩn (Top 20)</b>: Nổ <b>${stdHits} nháy</b>${stdHitStr}`,
      `   └ Mức chuẩn 10đ/số: <b>${formatK(loStdProfitK)}</b> (Vốn 200đ [4.400K] · Ăn ${(stdHits * 800).toLocaleString('vi-VN')}K) · Mức VIP: <b>${formatM(stdProfitK)}</b>`,
      `• 🚀 <b>Lô X2 (Top 7)</b>: ${x2ProfitK > 0 ? '🚀 <b>THẮNG</b>' : '❌ Trượt'} nổ <b>${x2Hits} nháy</b>${x2HitStr}`,
      `   └ Mức chuẩn 20đ/số: <b>${formatK(loX2ProfitK)}</b> (Vốn 140đ [3.080K] · Ăn ${(x2Hits * 1600).toLocaleString('vi-VN')}K) · Mức VIP: <b>${formatM(x2ProfitK)}</b>`,
      `• 💎 <b>Lô Xiên 4 (Quây)</b>: ${xi4Hits >= 2 ? `🎉 <b>Ăn ${xi4Hits}/4 con</b>` : `❌ Trượt (${xi4Hits}/4 con)`}`,
      `   └ Mức chuẩn 100K/vé: <b>${formatK(xi4StdProfitK)}</b> (11 vé · Vốn 1.100K) · Mức VIP: <b>${formatM(xi4ProfitK)}</b>`,
      `💰 <b>TỔNG LÃI RÒNG HÔM NAY:</b>`,
      `   👉 <b>Mức Chuẩn Hàng Ngày:</b> <b>${formatK(todayStdTotalK)}</b> (${todayStdTotalK > 0 ? '+' : ''}${(todayStdTotalK / 1000).toFixed(2)} Triệu VNĐ)`,
      `   👉 <b>Mức VIP Vốn Lớn:</b> <b>${formatM(todayTotalProfitK)}</b> ${todayTotalProfitK > 0 ? '🎉 <b>(THẮNG LỢI RỰC RỠ)</b>' : ''}`,
      divider,
      `🔮 <b>GỢI Ý DÀN SỐ ĐÁNH TIẾP THEO (${escapeHtml(displayDate(predictionDate))})</b>`,
      divider
    );
  }

  // =========================================================================
  // 1. 💎 ĐỀ TINH HOA — TRI-GOVERNOR ĐA PHƯƠNG PHÁP GỢI Ý
  // =========================================================================
  if (streakDeAdv && Array.isArray(streakDeAdv.numbers) && streakDeAdv.numbers.length) {
    const sBadge = streakDeAdv.confidenceBadge || '🟢 THEO ĐÀ THẮNG KHỎE ALPHA (80.8% WIN)';
    const sMethod = streakDeAdv.selectedMethodLabel || 'Đề Thích Ứng Alpha';
    const sNumbers = streakDeAdv.numbers;
    const sTierX2 = streakDeAdv.tierX2 || [];
    const sSingles = streakDeAdv.singles || [];

    lines.push(
      `<b>1. 💎 ĐỀ TINH HOA — TRI-GOVERNOR ĐA PHƯƠNG PHÁP GỢI Ý</b>`,
      `👑 <b>Phương pháp: ${escapeHtml(sMethod)}</b> · ${escapeHtml(sBadge)}`,
      `💡 <i>${escapeHtml(streakDeAdv.rationale || '')}</i>`,
      `🎯 <b>Dàn Đề Tuyển Chọn (${sNumbers.length} số):</b>`,
      `<b>${escapeHtml(formatNumberList(sNumbers))}</b>`
    );
    if (sTierX2.length) {
      lines.push(
        `⚡ <b>Dàn VIP Trùng X2 (${sTierX2.length} số - Vào tiền gấp đôi):</b> <b>${escapeHtml(formatNumberList(sTierX2))}</b>`
      );
    }
    if (sSingles.length) {
      lines.push(
        `🛡️ <b>Dàn Bọc Lót X1 (${sSingles.length} số):</b> <b>${escapeHtml(formatNumberList(sSingles))}</b>`
      );
    }
    lines.push(
      `  • <i>Mức 3 mặc định: 200K/số · Trúng ăn 16.8M (x84)</i>`,
      `  • <i>Mức VIP: 1M/số · Trúng ăn 84M</i>`
    );
  } else {
    lines.push(`<b>1. 💎 ĐỀ TINH HOA — DÀN 30 SỐ GỢI Ý</b>`);
    let std30 = metaRec?.standard30 || metaRec?.numbers || [];
    let core10 = metaRec?.core10 || [];
    let core20 = metaRec?.core20 || [];

    if (!std30.length && dePayload.nextPrediction) {
      const strat = dePayload.nextPrediction?.strategies?.deMilestoneHistoryEdge75UnionX2
        || dePayload.nextPrediction?.strategies?.dedupEdge75Pit
        || Object.values(dePayload.nextPrediction?.strategies || {})[0];
      const hold = strat?.holds?.[70] || strat?.holds?.[30] || Object.values(strat?.holds || {})[0];
      std30 = hold?.betNumbers || [];
      core10 = std30.slice(0, 10);
      core20 = std30.slice(0, 20);
    }

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

  let stdNums = (loQuadAdv?.top20 || metaNext?.standard?.numbers || []).map(normalizeLotteryNumber);
  if (!stdNums.length && lotoPayload.nextPrediction) {
    const strat = lotoPayload.nextPrediction?.strategies?.rrfParallelBlock85Small65
      || lotoPayload.nextPrediction?.strategies?.dedupEdge75Pit
      || Object.values(lotoPayload.nextPrediction?.strategies || {})[0];
    stdNums = (strat?.predictions?.top20?.numbers || lotoPayload.nextPrediction?.predictions?.top6?.numbers || []).map(normalizeLotteryNumber);
  }
  const loMethodTitle = loQuadAdv ? 'Super-Hybrid Quad-Fusion v7.0 Top 20' : 'Dàn 20 số';
  const loMethodStat = loQuadAdv ? ' (3 Năm +10.32 TỶ · 6.669 Nháy)' : '';
  lines.push(
    `🎯 <b>${loMethodTitle}</b>${loMethodStat} (Vốn 44M · Cược 2.2M/số [2.200K / 100đ] · Ăn 8M/nháy):`,
    `  • <i>Mức chuẩn 10đ/số: Vốn 200 điểm (4.400K) · Ăn 800K/nháy (1đ = 22K ăn 80K)</i>`,
    `  • <i>Mức 3 mặc định: 25đ/số (500đ = 11M) · Ăn 2M/nháy</i>`,
    `  • <i>Mức VIP 100đ/số: Vốn 44M · Ăn 8M/nháy</i>`,
    `<b>${escapeHtml(formatNumberList(stdNums))}</b>`
  );
  lines.push(divider);

  // =========================================================================
  // 3. 🚀 LÔ ĐÁNH X2 AN TOÀN CAO (DÀN 7 SỐ TĂNG TỐC)
  // =========================================================================
  lines.push(`<b>3. 🚀 LÔ ĐÁNH X2 AN TOÀN CAO (DÀN 7 SỐ TĂNG TỐC)</b>`);

  let x2Nums = (loQuadAdv?.top7 || metaNext?.x2?.numbers || []).map(normalizeLotteryNumber);
  if (!x2Nums.length && lotoPayload.nextPrediction) {
    const strat = lotoPayload.nextPrediction?.strategies?.rrfParallelBlock85Small65
      || lotoPayload.nextPrediction?.strategies?.dedupEdge75Pit
      || Object.values(lotoPayload.nextPrediction?.strategies || {})[0];
    x2Nums = (strat?.predictions?.top7?.numbers || []).map(normalizeLotteryNumber);
  }
  if (loQuadAdv?.top2?.length) {
    lines.push(
      `🔥 <b>Song Thủ Siêu VIP: [${escapeHtml(formatNumberList(loQuadAdv.top2))}]</b> <i>(57.7% Nổ 3 Năm · +1.976 TỶ)</i> · Bạch Thủ: <b>[${loQuadAdv.top1?.[0] || loQuadAdv.top2[0]}]</b> <i>(+1.088 TỶ)</i>`
    );
  }
  lines.push(
    `🎯 <b>Dàn 7 số X2</b> (Vốn 30.8M · Cược 4.4M/số [4.400K / 200đ] · Ăn 16M/nháy):`,
    `  • <i>Mức chuẩn 20đ/số: Vốn 140 điểm (3.080K) · Ăn 1.600K/nháy</i>`,
    `  • <i>Mức 3 mặc định: 50đ/số (350đ = 7.7M) · Ăn 4M/nháy</i>`,
    `  • <i>Mức VIP 200đ/số: Vốn 30.8M · Ăn 16M/nháy</i>`,
    `<b>${escapeHtml(formatNumberList(x2Nums))}</b>`
  );
  lines.push(divider);

  // =========================================================================
  // 4. ⚡ BẢNG GỘP ĐÁNH LÔ TỔNG LỰC (21 SỐ - SỐ TRÙNG ĐÁNH X2)
  // =========================================================================
  const sList = (stdNums || []).map(normalizeLotteryNumber).filter(Boolean);
  const xList = (x2Nums || []).map(normalizeLotteryNumber).filter(Boolean);
  const sSet = new Set(sList);
  const overlapNums = xList.filter(n => sSet.has(n));
  const allMerged = Array.from(new Set([...sList, ...xList]));
  const singleNums = allMerged.filter(n => !overlapNums.includes(n));

  lines.push(`<b>4. ⚡ BẢNG GỘP ĐÁNH LÔ TỔNG LỰC (21 SỐ - SỐ TRÙNG ĐÁNH X2)</b>`);
  lines.push(`<i>Tổng hợp từ 2 dàn trên: Số nào trùng cược X2, số riêng cược X1 bọc lót:</i>`);
  lines.push(
    `🔥 <b>Nhóm Số Trùng (CỰC VIP X2 · 4.4M/số [4.400K] - ${overlapNums.length} số):</b>`,
    `  • <i>Mức chuẩn: 20đ/số (440K/số) · Mức 3: 50đ/số (1.1M/số) · Mức VIP: 4.4M/số</i>`,
    `<b>${escapeHtml(formatNumberList(overlapNums))}</b>`,
    `🛡️ <b>Nhóm Số Riêng (BỌC LÓT X1 · 2.2M/số [2.200K] - ${singleNums.length} số):</b>`,
    `  • <i>Mức chuẩn: 10đ/số (220K/số) · Mức 3: 25đ/số (550K/số) · Mức VIP: 2.2M/số</i>`,
    `<b>${escapeHtml(formatNumberList(singleNums))}</b>`
  );
  lines.push(divider);

  // =========================================================================
  // 5. 💎 LÔ XIÊN 4 TINH HOA (QUÂY 11 VÉ)
  // =========================================================================
  let xi4Nums = (loXien4Adv?.numbers || metaNext?.xien4?.numbers || []).map(normalizeLotteryNumber);
  if (!xi4Nums.length) {
    xi4Nums = overlapNums.length >= 4 ? overlapNums.slice(0, 4) : sList.slice(0, 4);
  }
  lines.push(`<b>5. 💎 LÔ XIÊN 4 TINH HOA (QUÂY 11 VÉ)</b>`);
  if (loXien4Adv) {
    lines.push(
      `👑 <i>Tứ Thủ Hiệp Đồng Đồ Thị: 3 Năm +4.314 TỶ (ROI +40.1%) · Điểm Hiệp Đồng: ${loXien4Adv.score || 252.2}</i>`
    );
  }
  lines.push(
    `🎲 <b>Bộ 4 Số Vàng:</b> <b>${escapeHtml(formatNumberList(xi4Nums))}</b>`,
    `<i>Cơ cấu 11 vé (1 vé X4 + 4 vé X3 + 6 vé X2) · Trúng từ 2 con trở lên là CÓ LÃI RÒNG:</i>`,
    `  • 💥 <b>Ăn 4 con</b>: Mức 200K ăn 76.8M (Lãi +74.6M) · Mức VIP ăn 384M (Lãi +373M)`,
    `  • 🔥 <b>Ăn 3 con</b>: Mức 200K ăn 16.8M (Lãi +14.6M) · Mức VIP ăn 84M (Lãi +73M)`,
    `  • 🎯 <b>Ăn 2 con</b>: Mức 200K ăn 2.4M (Lãi +200K) · Mức VIP ăn 12M (Lãi +1M)`,
    `  • <i>Vốn cược: Mức 3 mặc định 200K/vé (2.2M / 11 vé) · Mức VIP 1M/vé (11M)</i>`
  );
  lines.push(divider);

  // =========================================================================
  // 6. 📊 BẢNG THEO DÕI THỰC CHIẾN THEO GỢI Ý (BẮT ĐẦU TỪ 16/09/2026)
  // =========================================================================
  const NEW_BATTLE_START_DATE = '2026-09-16';
  const settledNewPeriodDe = metaSettledList.filter(r => (r.predictionDate || r.date) >= NEW_BATTLE_START_DATE);
  const settledNewPeriodLo = liveDiaryEntries.filter(r => (r.date || r.predictionDate) >= NEW_BATTLE_START_DATE && r.settled !== false && (r.db || r.dayProfitK !== undefined));

  lines.push(`<b>6. 📊 BẢNG THEO DÕI THỰC CHIẾN THEO GỢI Ý (BẮT ĐẦU TỪ 16/09/2026)</b>`);
  lines.push(`<i>Thống kê thực tế hoàn toàn theo các dàn gợi ý ở trên — Mốc khởi điểm 0đ</i>`);

  if (settledNewPeriodDe.length === 0 && settledNewPeriodLo.length === 0) {
    lines.push(
      `• 📅 <b>Kỳ 1 (${escapeHtml(displayDate(predictionDate))}):</b> ⏳ <b>ĐANG CHỜ KẾT QUẢ QUAY THƯỞNG 18:15</b>`,
      `• 💎 Đề Gợi Ý (Dàn 30): Chờ quay (Mức 3: Vốn 6.000K · VIP: Vốn 30M)`,
      `• 🏆 Lô Chuẩn Gợi Ý (Top 20): Chờ quay (Mức 3: Vốn 11.000K · VIP: Vốn 44M)`,
      `• 🚀 Lô X2 Gợi Ý (Top 7): Chờ quay (Mức 3: Vốn 7.700K · VIP: Vốn 30.8M)`,
      `• 💎 Lô Xiên 4 Gợi Ý (Quây 11 vé): Chờ quay (Mức 3: Vốn 2.200K · VIP: Vốn 11M)`,
      `• 💰 <b>Tổng Lũy Kế Thực Chiến Gợi Ý</b>: <b>0 VNĐ (Baseline khởi động)</b>`
    );
  } else {
    const totalDeProfit = settledNewPeriodDe.reduce((s, r) => s + (r.profitK || 0), 0);
    const deWins = settledNewPeriodDe.filter(r => (r.profitK || 0) > 0 || r.isHit).length;
    const totalLoProfit = settledNewPeriodLo.reduce((s, r) => s + (r.dayProfitK || 0), 0);
    const cumulativeAllProfit = totalDeProfit + totalLoProfit;
    const daysCount = Math.max(settledNewPeriodDe.length, settledNewPeriodLo.length);

    const totalDeM3ProfitK = deWins * 10800 - (daysCount - deWins) * 6000;
    const totalLoM3ProfitK = Math.round(totalLoProfit * 0.25);
    const cumulativeM3TotalK = totalDeM3ProfitK + totalLoM3ProfitK;

    lines.push(
      `• 📅 <b>Số kỳ đã kết toán</b>: <b>${daysCount} kỳ</b>`,
      `• 💎 <b>Đề Gợi Ý</b>: <b>${formatK(totalDeM3ProfitK)}</b> (${formatM(totalDeProfit)} VIP · ${deWins}/${daysCount} trúng)`,
      `• 🎰 <b>Lô Gợi Ý Combo</b>: <b>${formatK(totalLoM3ProfitK)}</b> (${formatM(totalLoProfit)} VIP)`,
      `• 💰 <b>Tổng Lũy Kế Thực Chiến Gợi Ý:</b>`,
      `   👉 <b>Mức 3 (Mặc Định)</b>: <b>${formatK(cumulativeM3TotalK)}</b> (${cumulativeM3TotalK > 0 ? '+' : ''}${(cumulativeM3TotalK / 1000).toFixed(2)} Triệu VNĐ)`,
      `   👉 <b>Mức VIP Vốn Lớn</b>: <b>${formatM(cumulativeAllProfit)}</b>`
    );
  }
  lines.push(divider);

  // =========================================================================
  // 7. 💡 KHUYẾN NGHỊ PHÂN BỔ VỐN
  // =========================================================================
  lines.push(
    `<b>7. 💡 KHUYẾN NGHỊ PHÂN BỔ VỐN</b>`,
    `• 🛡️ <b>Phòng thủ (50%)</b>: <b>Đề Tinh Hoa 30 số</b> — Ăn đều đặn bảo vệ vốn.`,
    `• ⚔️ <b>Tấn công (50%)</b>: <b>Bảng Gộp Đánh Lô</b> (Trùng cược X2, riêng cược X1) + <b>Lô Xiên 4 Quây</b> săn đại thắng.`
  );
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

async function notifyTelegram(env, options = {}) {
  const chatId = await resolveTelegramChatId(env);
  if (!chatId) {
    return { ok: false, skipped: true, reason: 'telegram-chat-not-registered' };
  }

  const [dePayload, lotoPayload, historyPayload, advisorPayload] = await Promise.all([
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
    fetchPredictionJson(env, '/api/daily-advisor').catch(err => {
      console.error('Failed to fetch /api/daily-advisor:', err);
      return {};
    })
  ]);
  const readiness = evaluatePredictionCacheReadiness(
    dePayload,
    lotoPayload,
    options.expectedDataDate || null
  );
  if (!options.force && !readiness.ready) {
    return {
      ok: false,
      skipped: true,
      reason: 'prediction-cache-not-ready',
      expectedDataDate: readiness.expectedDataDate,
      deLatestDataDate: readiness.deLatestDataDate,
      lotoLatestDataDate: readiness.lotoLatestDataDate
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
    const advisorPayload = await fetchPredictionJson(env, '/api/daily-advisor').catch(() => ({}));
    const predictionDate = advisorPayload?.loQuantumBayesFusion?.latestRecommendation?.predictionDate || getVietnamDate();
    const sheet = buildBetCalculationSheet(tier, predictionDate, advisorPayload);
    await sendTelegramMessage(env, chatId, sheet, BETTING_KEYBOARD);
    return json({ ok: true, callback: data, tier: tier.name });
  }

  const text = String(rawMessage?.text || '').trim();
  const lowerText = text.toLowerCase();
  const parts = lowerText.split(/\s+/);
  const cmd = parts[0];

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

    const advisorPayload = await fetchPredictionJson(env, '/api/daily-advisor').catch(() => ({}));
    const predictionDate = advisorPayload?.loQuantumBayesFusion?.latestRecommendation?.predictionDate || getVietnamDate();
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
    return json({
      ok: true,
      configured: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET),
      chatRegistered: Boolean(await resolveTelegramChatId(env)),
      lastSentPredictionDate: await env.TELEGRAM_STATE?.get(TELEGRAM_LAST_SENT_KEY) || null
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
  buildTelegramReport,
  evaluatePredictionCacheReadiness,
  formatK,
  formatM,
  getVietnamDate,
  notifyTelegram,
  splitTelegramText
};
