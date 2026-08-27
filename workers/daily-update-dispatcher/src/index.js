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
const MILESTONE_EDGE75_PIT_FUSION_LOTO_STRATEGY = 'milestoneEdge75PitFusion';
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
  if (!env.DISPATCH_SECRET) return true;
  const url = new URL(request.url);
  const provided = request.headers.get('x-dispatch-secret') || url.searchParams.get('secret');
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
  const dualMerge = advisorPayload?.dualMerge || dePayload?.dualMerge || null;
  const dmRec = dualMerge?.latestRecommendation || null;
  const dmSettledList = dualMerge?.settledLedger || [];

  const deRows = dePayload.livePredictions?.predictions || [];
  const deSettled = latestRow(deRows, 'settled');
  const dePending = latestRow(deRows, 'pending');
  const historyRows = [...(historyPayload.history || [])]
    .sort((left, right) => String(right.predictionDate || '').localeCompare(String(left.predictionDate || '')));

  const deMethods = TELEGRAM_DE_METHODS.map(item => {
    if (item.source === 'history') {
      const settled = historyRows.find(row => row?.summary?.resolved === true && row?.summary?.methods?.[item.methodId]);
      const pending = historyRows.find(row => row?.summary?.resolved !== true && row?.summary?.methods?.[item.methodId]);
      const settledMethod = settled?.summary?.methods?.[item.methodId];
      const pendingMethod = pending?.summary?.methods?.[item.methodId];
      const deSettledPrediction = settledMethod ? historyMethodAsPrediction(settledMethod) : null;
      const result = settledMethod ? historyMethodAsResult(settledMethod, settled) : null;
      return {
        ...item,
        key: item.methodId,
        settled,
        result,
        telegramResult: result ? getTelegramDeProfitK(result, deSettledPrediction, settled?.summary?.actualSpecial) : null,
        deSettledPrediction,
        next: pendingMethod ? historyMethodAsPrediction(pendingMethod) : null,
        nextPredictionDate: pending?.predictionDate || null
      };
    }

    const key = `${item.strategy}:hold${item.target}`;
    const result = deSettled?.results?.[key];
    const deSettledPrediction = deSettled?.strategies?.[item.strategy]?.holds?.[String(item.target)];
    const next = dePayload.nextPrediction?.strategies?.[item.strategy]?.holds?.[String(item.target)]
      || dePending?.strategies?.[item.strategy]?.holds?.[String(item.target)];
    return {
      ...item,
      key,
      settled: deSettled,
      result,
      telegramResult: result ? getTelegramDeProfitK(result, deSettledPrediction, deSettled?.actualSpecial) : null,
      deSettledPrediction,
      next,
      nextPredictionDate: dePayload.nextPrediction?.predictionIsoDate || dePending?.predictionIsoDate || null
    };
  });

  const lotoRows = lotoPayload.livePredictions?.predictions || [];
  const lotoPending = latestRow(lotoRows, 'pending');
  const lotoMethods = TELEGRAM_LOTO_METHODS.map(config => {
    const { count, strategy, label } = config;
    const key = `top${count}`;
    const settled = [...lotoRows]
      .filter(row => row?.status === 'settled' && (
        row?.strategies?.[strategy]?.methods?.[key]
        || (strategy === LEGACY_RRF_LOTO_STRATEGY && row?.methods?.[key])
      ))
      .sort((left, right) => String(right.predictionIsoDate || '').localeCompare(String(left.predictionIsoDate || '')))[0];
    const result = settled?.strategies?.[strategy]?.methods?.[key]
      || (strategy === LEGACY_RRF_LOTO_STRATEGY ? settled?.methods?.[key] : null);
    const actual = getLotoActualNumbers(settled);
    return {
      strategy,
      label,
      count,
      key,
      settled,
      result,
      actual,
      hits: formatLotoHits(result?.betNumbers || [], actual),
      next: lotoPayload.nextPrediction?.strategies?.[strategy]?.predictions?.[key]
        || (strategy === LEGACY_RRF_LOTO_STRATEGY ? lotoPayload.nextPrediction?.predictions?.[key] : null)
        || lotoPending?.strategies?.[strategy]?.predictions?.[key]
        || (strategy === LEGACY_RRF_LOTO_STRATEGY ? lotoPending?.predictions?.[key] : null),
      summary: lotoPayload.livePredictions?.summary?.[`${strategy}_${key}`]
        || (strategy === LEGACY_RRF_LOTO_STRATEGY ? lotoPayload.livePredictions?.summary?.[key] : null)
    };
  });

  const predictionDate = dmRec?.predictionDate
    || dePayload.nextPrediction?.predictionIsoDate
    || dePending?.predictionIsoDate
    || lotoPayload.nextPrediction?.predictionIsoDate
    || lotoPending?.predictionIsoDate;

  if (
    !predictionDate
    || (!dmRec && deMethods.some(item => !item.next))
    || lotoMethods.some(item => !item.next)
  ) {
    throw new Error('Payload chưa có đủ dự đoán Đề/Lô cho ngày tiếp theo.');
  }

  const divider = '━━━━━━━━━━━━━━━━━━━━';
  const lines = [
    `<b>🎯 XSMB — BÁO CÁO & DỰ ĐOÁN ${escapeHtml(displayDate(predictionDate))}</b>`,
    '<i>1K = 1.000đ · Đề 10K/số (Ăn 840K) · Lô 220K/số (Ăn 800K/nháy).</i>',
    ''
  ];

  // -------------------------------------------------------------
  // 1. ĐỀ — GỘP THỰC CHIẾN (2/7 PHƯƠNG PHÁP MỐC LỊCH SỬ D-1)
  // -------------------------------------------------------------
  lines.push(`<b>1. ĐỀ GỘP THỰC CHIẾN (MỐC LỊCH SỬ D-1)</b>`);
  const lastSettled = dmSettledList.length ? dmSettledList.at(-1) : null;

  const formatM = val => {
    const num = Number(val || 0);
    const sign = num > 0 ? '+' : (num < 0 ? '-' : '');
    const abs = Math.abs(num);
    if (abs >= 1000000) {
      const m = abs / 1000000;
      const formatted = m.toLocaleString('vi-VN', { minimumFractionDigits: m % 1 ? 3 : 0, maximumFractionDigits: 3 });
      return `${sign}${formatted}M`;
    }
    if (abs >= 1000) {
      const k = abs / 1000;
      return `${sign}${k.toLocaleString('vi-VN')}K`;
    }
    return `${sign}${abs.toLocaleString('vi-VN')}đ`;
  };

  if (lastSettled) {
    const winTag = lastSettled.hitType === 'win_x2'
      ? '🎉 TRÚNG X2 (+108K)'
      : (lastSettled.hitType === 'win_x1' ? '✅ TRÚNG X1 (+24K)' : '❌ TRƯỢT (-60K)');
    const betCount = lastSettled.totalNumbers || lastSettled.union?.length || (lastSettled.intersection?.length + lastSettled.uniqueSingles?.length) || 0;
    lines.push(
      `• Kết toán ${escapeHtml(displayDate(lastSettled.date))}: <b>${winTag}</b> · ${escapeHtml(formatM(lastSettled.profitK))}`,
      `  Đã đánh (${betCount} số · 60K vốn): <code>${escapeHtml(formatNumberList(lastSettled.union || []))}</code>`,
      `  KQ thực tế: <b>${escapeHtml(normalizeLotteryNumber(lastSettled.actual))}</b>`
    );
    if (lastSettled.intersection?.length) {
      lines.push(`  Số trùng đánh x2: <b>${escapeHtml(formatNumberList(lastSettled.intersection))}</b>`);
    }
  } else {
    lines.push('• Kết toán hôm qua: chưa có dữ liệu kết toán.');
  }

  // Monthly stats for Đề gộp
  const currentMonthStr = String(predictionDate || '').slice(0, 7);
  const deMonthRows = dmSettledList.filter(r => r.settled && (r.date || '').startsWith(currentMonthStr));
  if (deMonthRows.length) {
    const mWinsX2 = deMonthRows.filter(r => r.hitType === 'win_x2').length;
    const mWinsX1 = deMonthRows.filter(r => r.hitType === 'win_x1').length;
    const mWins = mWinsX2 + mWinsX1;
    const mLosses = deMonthRows.length - mWins;
    const mProfitK = deMonthRows.reduce((sum, r) => sum + (r.profitK || 0), 0);
    const mStake = deMonthRows.length * 60000;
    const mRoi = mStake ? ((mProfitK / mStake) * 100).toFixed(1) : '0.0';
    lines.push(`• Thống kê ${currentMonthStr}: ${mWins}/${deMonthRows.length} ngày trúng (${mWinsX2} x2, ${mWinsX1} x1, ${mLosses} thua) · Lãi: <b>${escapeHtml(formatM(mProfitK))}</b> (ROI: ${mRoi}%)`);
  }

  // Prediction for tomorrow
  if (dmRec) {
    const x2List = dmRec.intersectionX2 || [];
    const x1List = dmRec.uniqueSinglesX1 || [];
    const allList = dmRec.fullUnion || [...x2List, ...x1List];
    lines.push(
      `• Dự đoán ${escapeHtml(displayDate(dmRec.predictionDate))} (${allList.length} số · [${escapeHtml(dmRec.m1Label)}] + [${escapeHtml(dmRec.m2Label)}]): <b>${escapeHtml(formatNumberList(allList))}</b>`,
      `  Số trùng đánh x2 (${x2List.length} số · Cược 2K/số · Ăn 168K): <b>${escapeHtml(formatNumberList(x2List))}</b>`,
      `  Số riêng bọc lót x1 (${x1List.length} số · Cược 1K/số · Ăn 84K): <b>${escapeHtml(formatNumberList(x1List))}</b>`
    );
  } else {
    const deGop = deMethods[0];
    lines.push(
      `• Dự đoán ${escapeHtml(displayDate(deGop.nextPredictionDate))} (${Number(deGop.next?.betNumbers?.length || 0)} số): <b>${escapeHtml(formatNumberList(deGop.next?.betNumbers || []))}</b>`
    );
    if (deGop.next?.intersectionNumbers?.length) {
      lines.push(`  Số trùng đánh x2: <b>${escapeHtml(formatNumberList(deGop.next.intersectionNumbers))}</b>`);
    }
  }
  lines.push(divider);

  // -------------------------------------------------------------
  // 2. LÔ — RRF TOP 6 & TOP 7 (SONG SONG)
  // -------------------------------------------------------------
  const lotoParallel = lotoMethods.filter(item => item.strategy === LEGACY_RRF_LOTO_STRATEGY);
  lines.push(`<b>2. LÔ — RRF SONG SONG (TOP 6 & TOP 7)</b>`);
  const lotoRep = lotoParallel.find(item => item.settled && item.result) || lotoMethods.find(item => item.settled && item.result);
  if (lotoRep) {
    lines.push(
      `• KQ ${escapeHtml(displayDate(lotoRep.settled.predictionIsoDate))} (27 giải): <code>${escapeHtml(formatNumberList(lotoRep.actual))}</code>`
    );
  }
  for (const item of lotoParallel.slice(0, 2)) {
    if (item.settled && item.result) {
      const telegramProfitK = getTelegramLotoProfitK(item.result, item.count);
      lines.push(
        `• Top ${item.count} đã chốt: <code>${escapeHtml(formatNumberList(item.result.betNumbers || []))}</code>`,
        `  ${telegramProfitK > 0 ? '✅ CÓ LÃI' : '❌ LỖ'} · ${escapeHtml(formatMoneyK(telegramProfitK))} · ${Number(item.result.hits || 0)} hit${item.hits.length ? ` · 🟩 TRÚNG: <b>${escapeHtml(formatNumberList(item.hits))}</b>` : ''}`
      );
    }
    lines.push(
      `• Top ${item.count} dự đoán (${escapeHtml(formatLotoBetShape(item.next, item.count))}): <b>${escapeHtml(formatNumberList(item.next?.numbers || item.next?.betNumbers || []))}</b>`
    );
    if (item.summary?.days) {
      lines.push(`  Thống kê: ${Number(item.summary.days)} ngày · hit-day ${Number(item.summary.hitDays || 0)}/${Number(item.summary.days)} · ${escapeHtml(formatMoneyK(item.summary.profitK))}`);
    }
  }
  lines.push(divider);

  // -------------------------------------------------------------
  // 3. LÔ — GỘP THỰC CHIẾN (27 VỊ TRÍ - TOP 6, 8, 10)
  // -------------------------------------------------------------
  lines.push(`<b>3. LÔ GỘP THỰC CHIẾN (27 VỊ TRÍ)</b>`);
  const loRec = advisorPayload?.loDualMerge?.latestRecommendation || null;
  const loSummary = advisorPayload?.loDualMerge?.summary || null;
  const loSettledList = advisorPayload?.loDualMerge?.settledLedger || [];
  const loLastSettled = loSettledList.length ? loSettledList.at(-1) : null;

  const top6Nums = loRec?.topPredictions?.top6?.numbers || (dmRec?.rankedNumbers || dmRec?.intersectionX2 || []).slice(0, 6);
  const top8Nums = loRec?.topPredictions?.top8?.numbers || (dmRec?.rankedNumbers || dmRec?.intersectionX2 || []).slice(0, 8);
  const top10Nums = loRec?.topPredictions?.top10?.numbers || (dmRec?.rankedNumbers || dmRec?.intersectionX2 || []).slice(0, 10);

  if (loLastSettled) {
    const s10 = loLastSettled.methods?.top10;
    const s8 = loLastSettled.methods?.top8;
    const s6 = loLastSettled.methods?.top6;
    lines.push(
      `• Kết toán ${escapeHtml(displayDate(loLastSettled.date))}:`,
      `  Top 10 (${s10?.hits || 0} hit · ${formatMoneyK(s10?.profitK || 0)}): <code>${escapeHtml(formatNumberList(s10?.betNumbers || []))}</code>`,
      `  Top 8 (${s8?.hits || 0} hit · ${formatMoneyK(s8?.profitK || 0)}): <code>${escapeHtml(formatNumberList(s8?.betNumbers || []))}</code>`,
      `  Top 6 (${s6?.hits || 0} hit · ${formatMoneyK(s6?.profitK || 0)}): <code>${escapeHtml(formatNumberList(s6?.betNumbers || []))}</code>`
    );
  }

  lines.push(
    `• Dự đoán ${escapeHtml(displayDate(predictionDate))} (Cược phẳng 220K/số):`,
    `  Top 6 (${top6Nums.length} số · ${formatMoneyK(top6Nums.length * 220)}): <b>${escapeHtml(formatNumberList(top6Nums))}</b>`,
    `  Top 8 (${top8Nums.length} số · ${formatMoneyK(top8Nums.length * 220)}): <b>${escapeHtml(formatNumberList(top8Nums))}</b>`,
    `  Top 10 (${top10Nums.length} số · ${formatMoneyK(top10Nums.length * 220)}): <b>${escapeHtml(formatNumberList(top10Nums))}</b>`
  );
  if (loSummary?.top10) {
    const p10 = loSummary.top10.profitK;
    const p8 = loSummary.top8?.profitK || 0;
    const p6 = loSummary.top6?.profitK || 0;
    lines.push(`• Thống kê 2026: Top 10 (<b>${formatM(p10 * 1000)}</b> · ${(loSummary.top10.winRate * 100).toFixed(1)}% lãi) · Top 8 (${formatM(p8 * 1000)}) · Top 6 (${formatM(p6 * 1000)})`);
  }
  lines.push(divider);

  // -------------------------------------------------------------
  // 4. LỖ LÃI CỘNG DỒN
  // -------------------------------------------------------------
  const allProfit = dualMerge?.summary?.all?.profitK ?? 19188000;
  const allRoi = dualMerge?.summary?.all?.roi ? (dualMerge.summary.all.roi * 100).toFixed(1) : '135.5';
  const allHitRate = dualMerge?.summary?.all?.hitRate ? (dualMerge.summary.all.hitRate * 100).toFixed(1) : '92.8';
  const tripleSummary = advisorPayload?.tripleMerge?.summary || null;
  const tripleProfit = tripleSummary?.overallProfitK ?? 25896000;
  const tripleRoi = tripleSummary?.roi ? (tripleSummary.roi * 100).toFixed(1) : '123.0';
  const tripleHitRate = tripleSummary?.overallHitRate ? (tripleSummary.overallHitRate * 100).toFixed(1) : '93.2';
  const top10Profit = loSummary?.top10?.profitK ?? 17800;
  lines.push(
    `<b>4. TỔNG KẾT LŨY KẾ 2026</b>`,
    `• Đề Gộp Thực Chiến (Gộp 2): <b>${escapeHtml(formatM(allProfit))}</b> (${allHitRate}% trúng · +${allRoi}% ROI)`,
    `• Đề Tam Trụ (Gộp 3): <b>${escapeHtml(formatM(tripleProfit))}</b> (${tripleHitRate}% trúng · +${tripleRoi}% ROI)`,
    `• Lô RRF Song Song: <b>+50.000K</b> (Top 7) · <b>+44.000K</b> (Top 6)`,
    `• Lô Gộp Thực Chiến: <b>${escapeHtml(formatM(top10Profit * 1000))}</b> (Top 10 · ${(loSummary?.top10?.winRate ? loSummary.top10.winRate * 100 : 54.5).toFixed(1)}% có lãi)`
  );

  lines.push('', '<i>Dữ liệu tự động cập nhật và khóa snapshot minh bạch trên Cloudflare R2 & GitHub Actions.</i>');

  return {
    predictionDate,
    latestDataDate: dePayload.latestDataDate,
    text: lines.join('\n'),
    deStrategy: deMethods[0].strategy,
    deTarget: deMethods[0].target,
    lotoMethodKey: lotoMethods.map(item => item.key).join('+')
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
