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

function buildTelegramReport(dePayload, lotoPayload, historyPayload = {}, advisorPayload = {}) {
  // ── Data sources ──────────────────────────────────────────────────────────
  // Đề Tinh Hoa — MetaLearner (dàn 30 số quán quân)
  const metaLearner = advisorPayload?.metaLearner || null;
  const metaRec = metaLearner?.latestRecommendation || null;
  const metaSettledList = metaLearner?.settledLedger || [];
  const metaLearnerSummary = metaLearner?.summary || {};

  // Lô Tinh Hoa — Dynamic Meta-Selector (tự chọn PP tốt nhất mỗi ngày)
  const metaAdv = advisorPayload?.dynamicMetaAdvisor || null;
  const metaNext = metaAdv?.nextPrediction || null;
  const metaAdvSummary = metaAdv?.summary || null;
  const liveDiaryEntries = Array.isArray(metaAdv?.liveDiary) ? metaAdv.liveDiary : [];

  // predictionDate fallback chain
  const predictionDate = metaNext?.predictionDate
    || metaRec?.predictionDate
    || advisorPayload?.loQuantumBayesFusion?.latestRecommendation?.predictionDate
    || dePayload.nextPrediction?.predictionIsoDate
    || lotoPayload.nextPrediction?.predictionIsoDate;

  if (!predictionDate) {
    throw new Error('Payload chưa có đủ dự đoán Đề/Lô cho ngày tiếp theo.');
  }

  const divider = '━━━━━━━━━━━━━━━━━━━━';
  const formatM = profitK => {
    const numK = Number(profitK || 0);
    const inM = numK / 1000;
    const sign = inM > 0 ? '+' : (inM < 0 ? '-' : '');
    const abs = Math.abs(inM);
    const formatted = abs.toLocaleString('vi-VN', { minimumFractionDigits: abs % 1 ? 1 : 0, maximumFractionDigits: 1 });
    return `${sign}${formatted}M`;
  };

  const lines = [
    `🎯 <b>XSMB — GỢI Ý THỰC CHIẾN HÀNG NGÀY ${escapeHtml(displayDate(predictionDate))}</b>`,
    `<i>Cơ chế cược: Đề 1M/số · Lô Chuẩn 2.2M/số · Lô X2 4.4M/số · Xiên 4 quây 11M</i>`,
    ''
  ];

  // =========================================================================
  // 1. 💎 ĐỀ TINH HOA — DÀN 30 SỐ GỢI Ý
  // =========================================================================
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
    `<b>${escapeHtml(formatNumberList(std30))}</b>`,
    `⚡ <b>Core 10 VIP</b> (10M · Hạt nhân): <b>${escapeHtml(formatNumberList(core10))}</b>`,
    `🔥 <b>Core 20 Rút gọn</b> (20M): <b>${escapeHtml(formatNumberList(core20))}</b>`
  );
  lines.push(divider);

  // =========================================================================
  // 2. 🏆 LÔ CHUẨN TỐI ƯU (DÀN 20 SỐ)
  // =========================================================================
  lines.push(`<b>2. 🏆 LÔ CHUẨN TỐI ƯU (DÀN 20 SỐ)</b>`);

  let stdNums = metaNext?.standard?.numbers || [];
  if (!stdNums.length && lotoPayload.nextPrediction) {
    const strat = lotoPayload.nextPrediction?.strategies?.rrfParallelBlock85Small65
      || lotoPayload.nextPrediction?.strategies?.dedupEdge75Pit
      || Object.values(lotoPayload.nextPrediction?.strategies || {})[0];
    stdNums = strat?.predictions?.top20?.numbers || lotoPayload.nextPrediction?.predictions?.top6?.numbers || [];
  }
  lines.push(
    `🎯 <b>Dàn 20 số</b> (Vốn 44M · Cược 2.2M/số [2.200K / 100đ] · Ăn 8M/nháy):`,
    `<b>${escapeHtml(formatNumberList(stdNums))}</b>`
  );
  lines.push(divider);

  // =========================================================================
  // 3. 🚀 LÔ ĐÁNH X2 AN TOÀN CAO (DÀN 7 SỐ TĂNG TỐC)
  // =========================================================================
  lines.push(`<b>3. 🚀 LÔ ĐÁNH X2 AN TOÀN CAO (DÀN 7 SỐ TĂNG TỐC)</b>`);

  let x2Nums = metaNext?.x2?.numbers || [];
  if (!x2Nums.length && lotoPayload.nextPrediction) {
    const strat = lotoPayload.nextPrediction?.strategies?.rrfParallelBlock85Small65
      || lotoPayload.nextPrediction?.strategies?.dedupEdge75Pit
      || Object.values(lotoPayload.nextPrediction?.strategies || {})[0];
    x2Nums = strat?.predictions?.top7?.numbers || [];
  }
  lines.push(
    `🎯 <b>Dàn 7 số X2</b> (Vốn 30.8M · Cược 4.4M/số [4.400K / 200đ] · Ăn 16M/nháy):`,
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
    `<b>${escapeHtml(formatNumberList(overlapNums))}</b>`,
    `🛡️ <b>Nhóm Số Riêng (BỌC LÓT X1 · 2.2M/số [2.200K] - ${singleNums.length} số):</b>`,
    `<b>${escapeHtml(formatNumberList(singleNums))}</b>`
  );
  lines.push(divider);

  // =========================================================================
  // 5. 💎 LÔ XIÊN 4 TINH HOA (QUÂY 11 VÉ)
  // =========================================================================
  let xi4Nums = metaNext?.xien4?.numbers || [];
  if (!xi4Nums.length) {
    xi4Nums = overlapNums.length >= 4 ? overlapNums.slice(0, 4) : sList.slice(0, 4);
  }
  lines.push(`<b>5. 💎 LÔ XIÊN 4 TINH HOA (QUÂY 11 VÉ)</b>`);
  lines.push(
    `🎲 <b>Bộ 4 Số Vàng:</b> <b>${escapeHtml(formatNumberList(xi4Nums))}</b>`,
    `<i>Cơ cấu 11 vé (1 vé X4 + 4 vé X3 + 6 vé X2 · Vốn 11M):</i>`,
    `  • 💥 <b>Ăn 4 con</b>: Trúng cả bộ (+459M lãi ròng)`,
    `  • 🔥 <b>Ăn 3 con</b>: Nổ X3 + 3 vé X2 (+59M lãi ròng)`,
    `  • 🎯 <b>Ăn 2 con</b>: Nổ 1 vé X2 (10M - bảo toàn vốn)`
  );
  lines.push(divider);

  // =========================================================================
  // 6. 🎲 LÔ XIÊN 2 CHIẾN LƯỢC (3 CẶP VÀNG)
  // =========================================================================
  const goldenPairs = metaNext?.goldenXien2 || [];
  const topPairStrs = goldenPairs.length >= 3
    ? goldenPairs.slice(0, 3).map(p => Array.isArray(p.pair) ? p.pair.join(' - ') : String(p.pair || p.numbers?.join(' - ') || ''))
    : [
        xi4Nums.length >= 2 ? `${xi4Nums[0]} - ${xi4Nums[1]}` : '92 - 62',
        xi4Nums.length >= 3 ? `${xi4Nums[0]} - ${xi4Nums[2]}` : '92 - 93',
        xi4Nums.length >= 4 ? `${xi4Nums[1]} - ${xi4Nums[2]}` : '62 - 93'
      ];
  lines.push(`<b>6. 🎲 LÔ XIÊN 2 CHIẾN LƯỢC (3 CẶP VÀNG)</b>`);
  lines.push(`<i>Cược 1M/cặp · Vốn 3M · Ăn 10M-17M/cặp:</i>`);
  topPairStrs.forEach((pStr, idx) => {
    lines.push(`  • Cặp ${idx + 1}: <b>${escapeHtml(pStr)}</b>`);
  });
  lines.push(divider);

  // =========================================================================
  // 7. 📊 BẢNG THEO DÕI THỰC CHIẾN THEO GỢI Ý (BẮT ĐẦU TỪ 16/09/2026)
  // =========================================================================
  const NEW_BATTLE_START_DATE = '2026-09-16';
  const settledNewPeriodDe = metaSettledList.filter(r => (r.predictionDate || r.date) >= NEW_BATTLE_START_DATE);
  const settledNewPeriodLo = liveDiaryEntries.filter(r => (r.date || r.predictionDate) >= NEW_BATTLE_START_DATE && !r.isLive);

  lines.push(`<b>7. 📊 BẢNG THEO DÕI THỰC CHIẾN THEO GỢI Ý (BẮT ĐẦU TỪ 16/09/2026)</b>`);
  lines.push(`<i>Thống kê thực tế hoàn toàn theo các dàn gợi ý ở trên — Mốc khởi điểm 0đ</i>`);

  if (settledNewPeriodDe.length === 0 && settledNewPeriodLo.length === 0) {
    lines.push(
      `• 📅 <b>Kỳ 1 (${escapeHtml(displayDate(predictionDate))}):</b> ⏳ <b>ĐANG CHỜ KẾT QUẢ QUAY THƯỞNG 18:15</b>`,
      `• 💎 Đề Gợi Ý (Dàn 30): Chờ quay (Vốn 30M · Ăn 84M)`,
      `• 🏆 Lô Chuẩn Gợi Ý (Top 20): Chờ quay (Vốn 44M · Ăn 8M/nháy)`,
      `• 🚀 Lô X2 Gợi Ý (Top 7): Chờ quay (Vốn 30.8M · Ăn 16M/nháy)`,
      `• 💎 Lô Xiên 4 Gợi Ý (Quây 11 vé): Chờ quay (Vốn 11M)`,
      `• 💰 <b>Tổng Lũy Kế Thực Chiến Gợi Ý</b>: <b>0 VNĐ (Baseline khởi động)</b>`
    );
  } else {
    const totalDeProfit = settledNewPeriodDe.reduce((s, r) => s + (r.profitK || 0), 0);
    const deWins = settledNewPeriodDe.filter(r => (r.profitK || 0) > 0 || r.isHit).length;
    const totalLoProfit = settledNewPeriodLo.reduce((s, r) => s + (r.dayProfitK || 0), 0);
    const cumulativeAllProfit = totalDeProfit + totalLoProfit;
    const daysCount = Math.max(settledNewPeriodDe.length, settledNewPeriodLo.length);

    lines.push(
      `• 📅 <b>Số kỳ đã kết toán</b>: <b>${daysCount} kỳ</b>`,
      `• 💎 <b>Đề Gợi Ý</b>: <b>${formatM(totalDeProfit)}</b> (${deWins}/${daysCount} trúng)`,
      `• 🎰 <b>Lô Gợi Ý Combo</b>: <b>${formatM(totalLoProfit)}</b>`,
      `• 💰 <b>Tổng Lũy Kế Thực Chiến Gợi Ý</b>: <b>${formatM(cumulativeAllProfit)}</b>`
    );
  }
  lines.push(divider);

  // =========================================================================
  // 8. 💡 KHUYẾN NGHỊ PHÂN BỔ VỐN
  // =========================================================================
  lines.push(
    `<b>8. 💡 KHUYẾN NGHỊ PHÂN BỔ VỐN</b>`,
    `• 🛡️ <b>Phòng thủ (50%)</b>: <b>Đề Tinh Hoa 30 số</b> (1M/số · 30M/ngày) — Ăn đều đặn bảo vệ vốn.`,
    `• ⚔️ <b>Tấn công (50%)</b>: <b>Bảng Gộp Đánh Lô</b> (Trùng cược X2 4.4M, riêng cược X1 2.2M) + <b>Lô Xiên 4 Quây</b> (11M) săn đại thắng.`
  );
  lines.push('', `<i>Dữ liệu được niêm phong bất biến (Strict PIT) · Minh bạch &amp; đối soát tự động.</i>`);

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

async function sendTelegramMessage(env, chatId, text) {
  let lastMessage = null;
  for (const chunk of splitTelegramText(text)) {
    lastMessage = await telegramApi(env, 'sendMessage', {
      chat_id: chatId,
      text: chunk,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
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

  const message = await sendTelegramMessage(env, chatId, report.text);
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
  const expectedSecret = requireEnv(env, 'TELEGRAM_WEBHOOK_SECRET');
  const providedSecret = request.headers.get('x-telegram-bot-api-secret-token');
  if (providedSecret !== expectedSecret) return json({ ok: false, error: 'Unauthorized' }, 401);

  const update = await request.json().catch(() => ({}));
  const message = update.message || update.edited_message;
  if (!message?.chat?.id) return json({ ok: true, ignored: true });
  const username = String(message.from?.username || '').toLowerCase();
  const allowed = String(env.TELEGRAM_ALLOWED_USERNAME || 'chungtvvn').replace(/^@/, '').toLowerCase();
  if (!username || username !== allowed) {
    return json({ ok: true, ignored: true, reason: 'username-not-allowed' });
  }

  const chatId = String(message.chat.id);
  await env.TELEGRAM_STATE?.put(TELEGRAM_CHAT_KEY, chatId);
  const command = String(message.text || '').trim().toLowerCase().split(/\s+/)[0];
  
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
    allowed_updates: ['message', 'edited_message'],
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
  buildTelegramReport,
  evaluatePredictionCacheReadiness,
  getVietnamDate,
  notifyTelegram,
  splitTelegramText
};
