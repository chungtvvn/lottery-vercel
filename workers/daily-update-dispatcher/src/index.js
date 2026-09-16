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
  // ── Data sources ──────────────────────────────────────────────────────────
  // Đề Tinh Hoa — MetaLearner (dàn 30 số quán quân)
  const metaLearner = advisorPayload?.metaLearner || null;
  const metaRec = metaLearner?.latestRecommendation || null;
  const metaSettledList = metaLearner?.settledLedger || [];
  const lastSettledMeta = metaSettledList.length ? metaSettledList.at(-1) : null;
  const metaLearnerSummary = metaLearner?.summary || {};

  // Lô Tinh Hoa — Dynamic Meta-Selector (tự chọn PP tốt nhất mỗi ngày)
  const metaAdv = advisorPayload?.dynamicMetaAdvisor || null;
  const metaNext = metaAdv?.nextPrediction || null;
  const metaAdvSummary = metaAdv?.summary || null;
  const liveDiaryEntries = Array.isArray(metaAdv?.liveDiary) ? metaAdv.liveDiary : [];
  const lastLoMetaSettled = [...liveDiaryEntries].reverse().find(r => !r.isLive) || null;
  const liveDiaryDays = liveDiaryEntries.length;

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
    `🎯 <b>XSMB — ĐỀ XUẤT TINH HOA ${escapeHtml(displayDate(predictionDate))}</b>`,
    `<i>Đề Tinh Hoa 10K/số · Lô Tinh Hoa 2.2M/số · Xiên 4 quây 11M</i>`,
    ''
  ];

  // =========================================================================
  // 1. 💎 ĐỀ TINH HOA — META-LEARNER (DÀN 30 SỐ QUÁN QUÂN)
  // =========================================================================
  lines.push(`<b>1. 💎 ĐỀ TINH HOA — MỐC LỊCH SỬ D-1 (DÀN 30 SỐ QUÁN QUÂN)</b>`);

  // Kết toán hôm qua
  if (lastSettledMeta) {
    const isHit = lastSettledMeta.hitType === 'win_x1' || lastSettledMeta.isHit || (lastSettledMeta.profitK > 0);
    const profitTag = isHit ? `🎉 TRÚNG (+54M)` : `❌ TRƯỢT (-30M)`;
    const betCount = lastSettledMeta.totalNumbers || lastSettledMeta.numbers?.length || 30;
    lines.push(
      `📋 <b>Kết toán ${escapeHtml(displayDate(lastSettledMeta.predictionDate || lastSettledMeta.date))}</b>: <b>${profitTag}</b>`,
      `  - Đã đánh (${betCount} số · 30M vốn): <code>${escapeHtml(formatNumberList(lastSettledMeta.numbers || []))}</code>`,
      `  - KQ thực tế: <b>${escapeHtml(String(lastSettledMeta.actualSpecial || lastSettledMeta.actual || '-').padStart(2, '0'))}</b>${isHit ? ' 🟩' : ' 🟥'}`
    );
  }

  // Dự đoán hôm nay
  if (metaRec) {
    const std30 = metaRec.standard30 || metaRec.numbers || [];
    const core10 = metaRec.core10 || [];
    const core20 = metaRec.core20 || [];
    lines.push(
      `🎯 <b>Dự đoán ${escapeHtml(displayDate(metaRec.predictionDate || predictionDate))}</b> [${escapeHtml(metaRec.label || 'Quán quân Cắt tỉa Động')}]:`,
      `  👑 <b>Dàn Chuẩn 30 số</b> (30M · Ăn 84M): <b>${escapeHtml(formatNumberList(std30))}</b>`,
      `  ⚡ <b>Core 10 VIP</b> (10M · Hạt nhân): <b>${escapeHtml(formatNumberList(core10))}</b>`,
      `  🔥 <b>Core 20 Rút gọn</b> (20M): <b>${escapeHtml(formatNumberList(core20))}</b>`
    );
  }

  // Thống kê Live
  const metaLiveRows = metaSettledList.filter(r => (r.predictionDate || r.date) >= '2026-08-28');
  const metaLiveProfit = metaLiveRows.reduce((s, r) => s + (r.profitK || 0), 0);
  const metaLiveWins = metaLiveRows.filter(r => (r.profitK || 0) > 0 || r.isHit || r.hitType === 'win_x1').length;
  const metaAllProfit = metaLearnerSummary.profitK ?? 0;
  const metaAllRoi = metaLearnerSummary.roi != null ? (metaLearnerSummary.roi * 100).toFixed(1) : '?';
  const metaAllHit = metaLearnerSummary.hitRate != null ? (metaLearnerSummary.hitRate * 100).toFixed(1) : '?';
  lines.push(
    `📊 <b>Live ${metaLiveRows.length} kỳ</b>: <b>${formatM(metaLiveProfit)}</b> (${metaLiveWins}/${metaLiveRows.length} trúng)`,
    `📈 <b>Toàn 2026</b>: <b>${escapeHtml(formatM(metaAllProfit))}</b> · Trúng ${metaAllHit}% · ROI +${metaAllRoi}%`
  );
  lines.push(divider);

  // =========================================================================
  // 2. 🏆 LÔ TINH HOA ĐA PHƯƠNG PHÁP — TỰ ĐỘNG CHỌN TỐT NHẤT
  // =========================================================================
  lines.push(`<b>2. 🏆 LÔ TINH HOA ĐA PHƯƠNG PHÁP — TỰ ĐỘNG CHỌN TỐT NHẤT</b>`);
  lines.push(`<i>Mỗi ngày chọn PP HOT nhất (profit · ROI 14 ngày · chuỗi thắng) — không cần chọn thủ công.</i>`);

  // Kết toán hôm qua
  if (lastLoMetaSettled) {
    const stdEntry = lastLoMetaSettled.standard || {};
    const x2Entry = lastLoMetaSettled.x2 || {};
    const xi4Entry = lastLoMetaSettled.xien4 || {};
    const stdName = stdEntry.methodName || stdEntry.methodId || stdEntry.method || '—';
    const x2Name = x2Entry.methodName || x2Entry.methodId || x2Entry.method || '—';
    const xi4Name = xi4Entry.methodName || xi4Entry.methodId || xi4Entry.method || '—';
    lines.push(`📋 <b>Kết toán ${escapeHtml(displayDate(lastLoMetaSettled.date))}:</b>`);
    if (stdEntry.methodName || stdEntry.methodId || stdEntry.method) {
      lines.push(`  🏆 Chuẩn [${escapeHtml(stdName)}]: ${stdEntry.hits || 0} nháy · <b>${formatMoneyK(stdEntry.profitK || 0)}</b>`);
    }
    if (x2Entry.methodName || x2Entry.methodId || x2Entry.method) {
      lines.push(`  🚀 X2 [${escapeHtml(x2Name)}]: ${x2Entry.hits || 0} nháy · <b>${formatMoneyK(x2Entry.profitK || 0)}</b>`);
    }
    if (xi4Entry.methodName || xi4Entry.methodId || xi4Entry.method) {
      const xi4Res = (xi4Entry.profitK || 0) > 0 ? `Ăn ${xi4Entry.hits || 0} nháy` : `Trượt`;
      lines.push(`  💎 Xiên 4 [${escapeHtml(xi4Name)}]: ${xi4Res} · <b>${formatMoneyK(xi4Entry.profitK || 0)}</b>`);
    }
    lines.push(`  ➜ Tổng ngày: <b>${formatMoneyK(lastLoMetaSettled.dayProfitK || 0)}</b> · Lũy kế: <b>${formatMoneyK(lastLoMetaSettled.cumulativeProfitK || 0)}</b>`);
    lines.push('');
  }

  // Dự đoán hôm nay
  if (metaNext) {
    const stdNext = metaNext.standard || {};
    const x2Next = metaNext.x2 || {};
    const xi4Next = metaNext.xien4 || {};
    const xi3Next = metaNext.xien3 || {};
    const xi2Next = metaNext.goldenXien2 || {};

    lines.push(`🎯 <b>Dự đoán ${escapeHtml(displayDate(metaNext.predictionDate || predictionDate))}:</b>`);

    const stdMethodName = stdNext.methodName || stdNext.methodId || stdNext.method;
    if (stdMethodName && stdNext.numbers?.length) {
      const roi = metaAdvSummary?.standard?.roi != null ? ` · ROI Live +${(metaAdvSummary.standard.roi * 100).toFixed(1)}%` : '';
      lines.push(`  🏆 <b>Chuẩn · ${escapeHtml(stdMethodName)} Top ${stdNext.topCount || stdNext.numbers.length}</b>${escapeHtml(roi)}`);
      lines.push(`     <b>${escapeHtml(formatNumberList(stdNext.numbers))}</b>`);
    }

    const x2MethodName = x2Next.methodName || x2Next.methodId || x2Next.method;
    if (x2MethodName && x2Next.numbers?.length) {
      const roi = metaAdvSummary?.x2?.roi != null ? ` · ROI Live +${(metaAdvSummary.x2.roi * 100).toFixed(1)}%` : '';
      lines.push(`  🚀 <b>X2 · ${escapeHtml(x2MethodName)} Top ${x2Next.topCount || x2Next.numbers.length}</b>${escapeHtml(roi)}`);
      lines.push(`     <b>${escapeHtml(formatNumberList(x2Next.numbers))}</b>`);
    }

    // Dàn Gộp Mục 1 & 2 (Số trùng cược X2)
    const stdNums = (stdNext.numbers || []).map(v => String(v).padStart(2, '0'));
    const x2Nums = (x2Next.numbers || []).map(v => String(v).padStart(2, '0'));
    if (stdNums.length && x2Nums.length) {
      const stdSet = new Set(stdNums);
      const overlapNums = x2Nums.filter(n => stdSet.has(n));
      const allMerged = Array.from(new Set([...stdNums, ...x2Nums]));
      const singleNums = allMerged.filter(n => !overlapNums.includes(n));
      if (overlapNums.length) {
        lines.push(`  ⚡ <b>Dàn Gộp Mục 1 & 2 (${allMerged.length}s · Trùng cược X2):</b>`);
        lines.push(`     🔥 <b>Cực VIP X2 (${overlapNums.length}s · 4.4M/số):</b> <b>${escapeHtml(formatNumberList(overlapNums))}</b>`);
        lines.push(`     🛡️ <b>Bọc Lót X1 (${singleNums.length}s · 2.2M/số):</b> <b>${escapeHtml(formatNumberList(singleNums))}</b>`);
      }
    }

    const xi4MethodName = xi4Next.methodName || xi4Next.methodId || xi4Next.method;
    if (xi4MethodName && xi4Next.numbers?.length) {
      const roi = metaAdvSummary?.xien4?.roi != null ? ` · ROI Live +${(metaAdvSummary.xien4.roi * 100).toFixed(1)}%` : '';
      lines.push(`  💎 <b>Tứ Thủ Xiên 4 · ${escapeHtml(xi4MethodName)}</b> (11M${escapeHtml(roi)})`);
      lines.push(`     <b>${escapeHtml(formatNumberList(xi4Next.numbers))}</b>`);
    }
    lines.push('');
  }

  // Thống kê Live Lô Tinh Hoa
  if (metaAdvSummary && liveDiaryDays > 0) {
    const std = metaAdvSummary.standard || {};
    const x2s = metaAdvSummary.x2 || {};
    const xi4s = metaAdvSummary.xien4 || {};
    const combos = metaAdvSummary.combo || {};
    const firstDate = liveDiaryEntries[0]?.date ? escapeHtml(displayDate(liveDiaryEntries[0].date)) : '';
    lines.push(`📊 <b>Live ${liveDiaryDays} kỳ${firstDate ? ` (${firstDate}→nay)` : ''}:</b>`);
    lines.push(`  🏆 Chuẩn: <b>${formatMoneyK(std.profitK || 0)}</b> · ${std.winDays || 0}/${liveDiaryDays} thắng · ROI +${std.roi != null ? (std.roi * 100).toFixed(1) : '?'}%`);
    lines.push(`  🚀 X2: <b>${formatMoneyK(x2s.profitK || 0)}</b> · ${x2s.winDays || 0}/${liveDiaryDays} thắng · ROI +${x2s.roi != null ? (x2s.roi * 100).toFixed(1) : '?'}%`);
    lines.push(`  💎 Xiên 4: <b>${formatMoneyK(xi4s.profitK || 0)}</b> · ${xi4s.winDays || 0}/${liveDiaryDays} kỳ · ROI +${xi4s.roi != null ? (xi4s.roi * 100).toFixed(1) : '?'}%`);
    lines.push(`  🔥 Combo: <b>${formatMoneyK(combos.profitK || 0)}</b> · ROI +${combos.roi != null ? (combos.roi * 100).toFixed(1) : '?'}%`);
  }
  lines.push(divider);

  // =========================================================================
  // 3. 📊 TỔNG KẾT LIVE (Từ 28/08/2026)
  // =========================================================================
  const metaLoStd = metaAdvSummary?.standard || {};
  const metaLoX2 = metaAdvSummary?.x2 || {};
  const metaLoXi4 = metaAdvSummary?.xien4 || {};
  const metaLoCombo = metaAdvSummary?.combo || {};

  lines.push(
    `<b>3. 📊 TỔNG KẾT LIVE (Từ 28/08/2026)</b>`,
    `• 💎 Đề Tinh Hoa: <b>${formatM(metaLiveProfit)}</b> (${metaLiveWins}/${metaLiveRows.length} trúng)`,
    `• 🏆 Lô Chuẩn: <b>${formatMoneyK(metaLoStd.profitK || 0)}</b> (${metaLoStd.winDays || 0}/${liveDiaryDays} thắng · ROI +${metaLoStd.roi != null ? (metaLoStd.roi * 100).toFixed(1) : '?'}%)`,
    `• 🚀 Lô X2: <b>${formatMoneyK(metaLoX2.profitK || 0)}</b> (${metaLoX2.winDays || 0}/${liveDiaryDays} thắng · ROI +${metaLoX2.roi != null ? (metaLoX2.roi * 100).toFixed(1) : '?'}%)`,
    `• 💎 Lô Xiên 4: <b>${formatMoneyK(metaLoXi4.profitK || 0)}</b> (${metaLoXi4.winDays || 0}/${liveDiaryDays} kỳ · ROI +${metaLoXi4.roi != null ? (metaLoXi4.roi * 100).toFixed(1) : '?'}%)`,
    `• 🔥 Lô Combo: <b>${formatMoneyK(metaLoCombo.profitK || 0)}</b> (ROI +${metaLoCombo.roi != null ? (metaLoCombo.roi * 100).toFixed(1) : '?'}%)`
  );
  lines.push(divider);

  // =========================================================================
  // 4. 💡 KHUYẾN NGHỊ VỐN
  // =========================================================================
  lines.push(
    `<b>4. 💡 KHUYẾN NGHỊ VỐN THỰC CHIẾN</b>`,
    `• 🛡️ <b>Phòng thủ (50%)</b>: <b>Đề Tinh Hoa 30 số</b> (1M/số · 30M/ngày · trúng ~49%)`,
    `• ⚔️ <b>Tấn công (50%)</b>: <b>Lô Tinh Hoa</b> — Chuẩn Top 20 (2.2M/số · 44M) + X2 Top 7 (4.4M/số · 30.8M) + Xiên 4 (11M quây).`
  );

  lines.push('', `<i>Dữ liệu tự động cập nhật · Snapshot minh bạch trên R2 &amp; GitHub Actions.</i>`);

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
