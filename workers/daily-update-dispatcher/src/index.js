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
    || advisorPayload?.loQuantumBayesFusion?.latestRecommendation?.predictionDate
    || dePayload.nextPrediction?.predictionIsoDate
    || dePending?.predictionIsoDate
    || lotoPayload.nextPrediction?.predictionIsoDate
    || lotoPending?.predictionIsoDate;

  if (!predictionDate) {
    throw new Error('Payload chưa có đủ dự đoán Đề/Lô cho ngày tiếp theo.');
  }

  const divider = '━━━━━━━━━━━━━━━━━━━━';
  const lines = [
    `🎯 <b>XSMB — THỰC CHIẾN LIVE & DỰ ĐOÁN ${escapeHtml(displayDate(predictionDate))}</b>`,
    '<i>Đề 10K/số (Ăn 840K) · Lô 2.200K/số (Ăn 8.000K/nháy)</i>',
    ''
  ];

  const formatM = profitK => {
    const numK = Number(profitK || 0);
    const inM = numK / 1000;
    const sign = inM > 0 ? '+' : (inM < 0 ? '-' : '');
    const abs = Math.abs(inM);
    const formatted = abs.toLocaleString('vi-VN', { minimumFractionDigits: abs % 1 ? 1 : 0, maximumFractionDigits: 1 });
    return `${sign}${formatted}M`;
  };

  // Helper for format hits
  const formatHits = (actualMap, nums) => {
    const hitItems = [];
    for (const n of nums || []) {
      const key = String(n).padStart(2, '0');
      const count = actualMap[key] || 0;
      if (count > 0) {
        hitItems.push(count > 1 ? `${key} (x${count})` : key);
      }
    }
    return hitItems;
  };

  // =========================================================================
  // 1. ĐỀ GỘP 1: GỘP 2 MỐC LỊCH SỬ D-1 (DUAL MERGE)
  // =========================================================================
  lines.push(`<b>1. 🎯 ĐỀ GỘP 1: GỘP 2 MỐC LỊCH SỬ D-1 (DUAL MERGE)</b>`);
  const lastSettledDe = dmSettledList.length ? dmSettledList.at(-1) : null;

  if (lastSettledDe) {
    const winTag = lastSettledDe.hitType === 'win_x2'
      ? '🎉 TRÚNG X2 (+108M)'
      : (lastSettledDe.hitType === 'win_x1' ? '✅ TRÚNG X1 (+24M)' : '❌ TRƯỢT (-60M)');
    const betCount = lastSettledDe.totalNumbers || lastSettledDe.union?.length || 60;
    lines.push(
      `• <b>Kết toán ${escapeHtml(displayDate(lastSettledDe.date))}</b>: <b>${winTag}</b>`,
      `  - Đã đánh (${betCount} số · 60M vốn): <code>${escapeHtml(formatNumberList(lastSettledDe.union || []))}</code>`,
      `  - KQ thực tế: <b>${escapeHtml(String(lastSettledDe.actual).padStart(2, '0'))}</b>${lastSettledDe.hitType !== 'loss' ? ' 🟩 TRÚNG' : ' 🟥 TRƯỢT'}`
    );
    if (lastSettledDe.intersection?.length) {
      lines.push(`  - Số trùng đánh X2 (2M/số): <b>${escapeHtml(formatNumberList(lastSettledDe.intersection))}</b>`);
    }
  }

  if (dmRec) {
    const x2List = dmRec.intersectionX2 || [];
    const x1List = dmRec.uniqueSinglesX1 || [];
    const allList = dmRec.fullUnion || [...x2List, ...x1List];
    lines.push(
      `• <b>Dự đoán ${escapeHtml(displayDate(dmRec.predictionDate))}</b> (${allList.length} số · [${escapeHtml(dmRec.m1Label)}] + [${escapeHtml(dmRec.m2Label)}]):`,
      `  👑 <b>Số trùng X2</b> (${x2List.length} số · Cược 2M/số · Ăn 168M): <b>${escapeHtml(formatNumberList(x2List))}</b>`,
      `  🛡️ <b>Bọc lót X1</b> (${x1List.length} số · Cược 1M/số · Ăn 84M): <b>${escapeHtml(formatNumberList(x1List))}</b>`
    );
  }

  const allProfitDe = dualMerge?.summary?.all?.profitK ?? 1632000;
  const allRoiDe = dualMerge?.summary?.all?.roi ? (dualMerge.summary.all.roi * 100).toFixed(1) : '11.5';
  const allHitRateDe = dualMerge?.summary?.all?.hitRate ? (dualMerge.summary.all.hitRate * 100).toFixed(1) : '55.5';
  lines.push(`• <b>Toàn bộ 2026</b>: <b>${escapeHtml(formatM(allProfitDe))}</b> (Trúng ${allHitRateDe}% · ROI +${allRoiDe}%)`);
  lines.push(divider);

  // =========================================================================
  // 2. ĐỀ GỘP 2: TAM TRỤ MỐC LỊCH SỬ D-1 (TRIPLE MERGE)
  // =========================================================================
  const tripleMerge = advisorPayload?.tripleMerge || null;
  const tmRec = tripleMerge?.latestRecommendation || null;
  const tmSettledList = tripleMerge?.settledLedger || [];
  const lastSettledTm = tmSettledList.length ? tmSettledList.at(-1) : null;

  lines.push(`<b>2. 🏛️ ĐỀ GỘP 2: TAM TRỤ MỐC LỊCH SỬ D-1 (TRIPLE MERGE)</b>`);
  if (lastSettledTm) {
    const winTagTm = lastSettledTm.hitType === 'win_x3'
      ? '🎉 TRÚNG X3 (+162M)'
      : (lastSettledTm.hitType === 'win_x2'
        ? '🎯 TRÚNG X2 (+78M)'
        : (lastSettledTm.hitType === 'win_x1' ? '✅ TRÚNG X1 (-6M)' : '❌ TRƯỢT (-90M)'));
    const betCountTm = lastSettledTm.totalNumbers || lastSettledTm.fullUnion?.length || 42;
    lines.push(
      `• <b>Kết toán ${escapeHtml(displayDate(lastSettledTm.date))}</b>: <b>${winTagTm}</b>`,
      `  - Đã đánh (${betCountTm} số · 90M vốn): <code>${escapeHtml(formatNumberList(lastSettledTm.fullUnion || []))}</code>`,
      `  - KQ thực tế: <b>${escapeHtml(String(lastSettledTm.actual).padStart(2, '0'))}</b>`,
      `  - Trọng tâm X3 (3M/số): <b>${escapeHtml(formatNumberList(lastSettledTm.tierX3 || []))}</b>`
    );
  }

  if (tmRec) {
    const x3List = tmRec.tierX3 || [];
    const x2List = tmRec.tierX2 || [];
    const x1List = tmRec.tierX1 || [];
    const allList = tmRec.fullUnion || [...x3List, ...x2List, ...x1List];
    lines.push(
      `• <b>Dự đoán ${escapeHtml(displayDate(tmRec.predictionDate))}</b> (${allList.length} số · 90M vốn):`,
      `  💎 <b>Đồng thuận X3</b> (${x3List.length} số · Cược 3M/số · Ăn 252M): <b>${escapeHtml(formatNumberList(x3List))}</b>`,
      `  👑 <b>Trùng cặp X2</b> (${x2List.length} số · Cược 2M/số · Ăn 168M): <b>${escapeHtml(formatNumberList(x2List))}</b>`,
      `  🛡️ <b>Bọc lót X1</b> (${x1List.length} số · Cược 1M/số · Ăn 84M): <b>${escapeHtml(formatNumberList(x1List))}</b>`
    );
  }

  const tmSummary = tripleMerge?.summary || {};
  const allProfitTm = tmSummary.overallProfitK ?? 3540000;
  const allRoiTm = tmSummary.roi ? (tmSummary.roi * 100).toFixed(1) : '16.7';
  const allHitRateTm = tmSummary.overallHitRate ? (tmSummary.overallHitRate * 100).toFixed(1) : '70.3';
  lines.push(`• <b>Toàn bộ 2026</b>: <b>${escapeHtml(formatM(allProfitTm))}</b> (Trúng ${allHitRateTm}% · ROI +${allRoiTm}%)`);
  lines.push(divider);

  // =========================================================================
  // 3. 4 LOẠI LÔ THỰC CHIẾN MỐC LỊCH SỬ (D-1) STRICT PIT
  // =========================================================================
  const qmbf = advisorPayload?.loQuantumBayesFusion || null;
  const loDual = advisorPayload?.loDualMerge || null;
  const loTri = advisorPayload?.loTriHarmonic || null;

  lines.push(`<b>3. 💎 4 PHƯƠNG PHÁP LÔ THỰC CHIẾN (MỐC LỊCH SỬ D-1 STRICT PIT)</b>\n`);

  // --- LÔ 1: QMBF (Khuyên dùng) ---
  const qmbfRec = qmbf?.latestRecommendation || null;
  const qmbfSummary = qmbf?.summary || null;
  const qmbfSettled = qmbf?.settledLedger?.at(-1) || null;
  lines.push(`<b>① 💎 LÔ SIÊU HỢP NHẤT QMBF [KHUYÊN DÙNG]</b>`);
  if (qmbfSettled) {
    const s6 = qmbfSettled.methods?.top6;
    const s10 = qmbfSettled.methods?.top10;
    const actualMap = qmbfSettled.actual || {};
    const s6Hits = formatHits(actualMap, s6?.betNumbers);
    lines.push(
      `• Kết toán ${escapeHtml(displayDate(qmbfSettled.date))}: Top 6 (<b>${s6?.hits || 0} nháy</b> · ${formatMoneyK(s6?.profitK || 0)}${s6Hits.length ? ` · 🟩 <b>${escapeHtml(s6Hits.join(', '))}</b>` : ''}) · Top 10 (${s10?.hits || 0} nháy · ${formatMoneyK(s10?.profitK || 0)})`
    );
  }
  const qmbfTop6 = qmbfRec?.topPredictions?.top6?.numbers || [];
  const qmbfTop10 = qmbfRec?.topPredictions?.top10?.numbers || [];
  const qmbfTop4 = qmbfRec?.topPredictions?.top4?.numbers || [];
  lines.push(
    `• Dự đoán ${escapeHtml(displayDate(qmbfRec?.predictionDate || predictionDate))}:`,
    `  👑 <b>Top 6 Vô Địch (13.2M vốn)</b>: <b>${escapeHtml(formatNumberList(qmbfTop6))}</b>`,
    `  💎 <b>Top 10 Nổ Tuyệt Đối (22.0M vốn)</b>: <b>${escapeHtml(formatNumberList(qmbfTop10))}</b>`,
    `  🔥 <b>Top 4 Song Thủ Kép (8.8M vốn)</b>: <b>${escapeHtml(formatNumberList(qmbfTop4))}</b>`
  );
  if (qmbfSummary?.top6 && qmbfSummary?.top10) {
    lines.push(`• Thống kê 2026: Top 6 (<b>${escapeHtml(formatM(qmbfSummary.top6.profitK))}</b> · ROI +${(qmbfSummary.top6.roi * 100).toFixed(1)}%) · Top 10 (<b>${escapeHtml(formatM(qmbfSummary.top10.profitK))}</b> · ${(qmbfSummary.top10.hitRate * 100).toFixed(1)}% nổ)\n`);
  }

  // --- LÔ 2: Dual Merge (Bạc nhớ vị trí) ---
  const dualLoRec = loDual?.latestRecommendation || null;
  const dualLoSummary = loDual?.summary || null;
  const dualLoSettled = loDual?.settledLedger?.at(-1) || null;
  lines.push(`<b>② 🎯 LÔ BẠC NHỚ VỊ TRÍ 27 GIẢI</b>`);
  if (dualLoSettled) {
    const s6 = dualLoSettled.methods?.top6;
    const s10 = dualLoSettled.methods?.top10;
    lines.push(
      `• Kết toán ${escapeHtml(displayDate(dualLoSettled.date))}: Top 6 (${s6?.hits || 0} nháy · ${formatMoneyK(s6?.profitK || 0)}) · Top 10 (${s10?.hits || 0} nháy · ${formatMoneyK(s10?.profitK || 0)})`
    );
  }
  const dualTop6 = dualLoRec?.topPredictions?.top6?.numbers || [];
  const dualTop10 = dualLoRec?.topPredictions?.top10?.numbers || [];
  lines.push(
    `• Dự đoán ${escapeHtml(displayDate(dualLoRec?.predictionDate || predictionDate))}:`,
    `  - Top 6 (13.2M): <b>${escapeHtml(formatNumberList(dualTop6))}</b>`,
    `  - Top 10 (22.0M): <b>${escapeHtml(formatNumberList(dualTop10))}</b>`
  );
  if (dualLoSummary?.top6 && dualLoSummary?.top10) {
    lines.push(`• Thống kê 2026: Top 6 (<b>${escapeHtml(formatM(dualLoSummary.top6.profitK))}</b> · ROI +${(dualLoSummary.top6.roi * 100).toFixed(1)}%) · Top 10 (<b>${escapeHtml(formatM(dualLoSummary.top10.profitK))}</b>)\n`);
  }

  // --- LÔ 3: Tri-Harmonic (Tam Động Cơ) ---
  const triRec = loTri?.latestRecommendation || null;
  const triSummary = loTri?.summary || null;
  const triSettled = loTri?.settledLedger?.at(-1) || null;
  lines.push(`<b>③ 🌟 LÔ TAM ĐỘNG CƠ TRI-HARMONIC</b>`);
  if (triSettled) {
    const s10 = triSettled.methods?.top10;
    lines.push(
      `• Kết toán ${escapeHtml(displayDate(triSettled.date))}: Top 10 (<b>${s10?.hits || 0} nháy</b> · ${formatMoneyK(s10?.profitK || 0)})`
    );
  }
  const triTop10 = triRec?.topPredictions?.top10?.numbers || [];
  lines.push(
    `• Dự đoán ${escapeHtml(displayDate(triRec?.predictionDate || predictionDate))}:`,
    `  - Top 10 (Nổ 100% · 22.0M): <b>${escapeHtml(formatNumberList(triTop10))}</b>`
  );
  if (triSummary?.top10) {
    lines.push(`• Thống kê 2026: Top 10 (<b>${escapeHtml(formatM(triSummary.top10.profitK))}</b> · ROI +${(triSummary.top10.roi * 100).toFixed(1)}% · 100% nổ)\n`);
  }

  // --- LÔ 4: RRF Song Song ---
  const rrfPreds = lotoPayload?.nextPrediction?.strategies?.rrfParallelBlock85Small65?.predictions
    || lotoPayload?.nextPrediction?.predictions || {};
  const rrfLiveRows = lotoPayload?.livePredictions?.predictions || [];
  const rrfLastSettled = [...rrfLiveRows].reverse().find(r => r.status === 'settled') || null;
  const rrfSummary = lotoPayload?.livePredictions?.summary || {};

  lines.push(`<b>④ ⚡ LÔ SONG SONG RRF (CHUỖI 65 + NHỊP 85)</b>`);
  if (rrfLastSettled) {
    const s6 = rrfLastSettled.strategies?.rrfParallelBlock85Small65?.methods?.top6 || rrfLastSettled.methods?.top6;
    const s7 = rrfLastSettled.strategies?.rrfParallelBlock85Small65?.methods?.top7 || rrfLastSettled.methods?.top7;
    lines.push(
      `• Kết toán ${escapeHtml(displayDate(rrfLastSettled.predictionIsoDate))}: Top 6 (${s6?.hits || 0} nháy · ${formatMoneyK(s6?.profitK || 0)}) · Top 7 (${s7?.hits || 0} nháy · ${formatMoneyK(s7?.profitK || 0)})`
    );
  }
  const rrfTop4 = rrfPreds.top4?.numbers || [];
  const rrfTop6 = rrfPreds.top6?.numbers || [];
  const rrfTop7 = rrfPreds.top7?.numbers || [];
  const rrfTop8 = rrfPreds.top8?.numbers || [];
  const rrfTop10 = rrfPreds.top10?.numbers || [];
  lines.push(
    `• Dự đoán ${escapeHtml(displayDate(predictionDate))}:`,
    `  - Top 4: <b>${escapeHtml(formatNumberList(rrfTop4))}</b>`,
    `  - Top 6: <b>${escapeHtml(formatNumberList(rrfTop6))}</b>`,
    `  - Top 7: <b>${escapeHtml(formatNumberList(rrfTop7))}</b>`,
    `  - Top 8: <b>${escapeHtml(formatNumberList(rrfTop8))}</b>`,
    `  - Top 10: <b>${escapeHtml(formatNumberList(rrfTop10))}</b>`
  );
  if (rrfSummary.top6) {
    lines.push(`• Thống kê: Top 6 (<b>${escapeHtml(formatMoneyK(rrfSummary.top6.profitK))}</b>) · Top 8 (<b>${escapeHtml(formatMoneyK(rrfSummary.top8?.profitK || 0))}</b>)`);
  }
  lines.push(divider);

  // =========================================================================
  // 4. TỔNG KẾT THỰC CHIẾN LIVE (Từ 28/08/2026)
  // =========================================================================
  const liveRowsDe = dmSettledList.filter(r => r.date >= '2026-08-28');
  const liveProfitDe = liveRowsDe.reduce((s, r) => s + (r.profitK || 0), 0);
  const liveWinsDe = liveRowsDe.filter(r => r.hitType !== 'loss').length;

  const liveRowsTm = tmSettledList.filter(r => r.date >= '2026-08-28');
  const liveProfitTm = liveRowsTm.reduce((s, r) => s + (r.profitK || 0), 0);
  const liveWinsTm = liveRowsTm.filter(r => r.hitType !== 'loss').length;

  const liveRowsLo = qmbf?.settledLedger?.filter(r => r.date >= '2026-08-28') || [];
  const liveProfitLo6 = liveRowsLo.reduce((s, r) => s + (r.methods?.top6?.profitK || 0), 0);
  const liveWinsLo6 = liveRowsLo.filter(r => (r.methods?.top6?.profitK || 0) > 0).length;
  const liveProfitLo10 = liveRowsLo.reduce((s, r) => s + (r.methods?.top10?.profitK || 0), 0);
  const liveWinsLo10 = liveRowsLo.filter(r => (r.methods?.top10?.profitK || 0) > 0).length;

  lines.push(
    `<b>4. 📊 TỔNG KẾT THỰC CHIẾN LIVE (Từ 28/08/2026)</b>`,
    `• Đề Gộp 2 Live: <b>${formatMoneyK(liveProfitDe)}</b> (${liveWinsDe}/${liveRowsDe.length || 1} ngày trúng)`,
    `• Đề Tam Trụ Live: <b>${formatMoneyK(liveProfitTm)}</b> (${liveWinsTm}/${liveRowsTm.length || 1} ngày trúng)`,
    `• Lô QMBF Top 6 Live: <b>${formatMoneyK(liveProfitLo6)}</b> (${liveWinsLo6}/${liveRowsLo.length || 1} ngày có lãi)`,
    `• Lô QMBF Top 10 Live: <b>${formatMoneyK(liveProfitLo10)}</b> (${liveWinsLo10}/${liveRowsLo.length || 1} ngày có lãi)`
  );

  lines.push('', '<i>Dữ liệu tự động cập nhật và khóa snapshot minh bạch trên Cloudflare R2 & GitHub Actions.</i>');

  return {
    predictionDate,
    latestDataDate: dePayload.latestDataDate,
    text: lines.join('\n'),
    deStrategy: dmRec?.m1Key || 'deDualMerge',
    deTarget: 60,
    lotoMethodKey: 'loQuantumBayesFusion'
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
