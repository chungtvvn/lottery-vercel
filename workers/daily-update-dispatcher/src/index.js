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
const DEFAULT_DE_STRATEGY = 'chainBlockFirst';
const DEFAULT_DE_TARGET = 70;
const DEFAULT_LOTO_COUNT = 6;

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

function getLotoActualNumbers(row = {}) {
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

function buildTelegramReport(dePayload, lotoPayload) {
  const deStrategy = dePayload.config?.defaultBetStrategy || DEFAULT_DE_STRATEGY;
  const deTarget = Number(dePayload.config?.defaultBetTarget || DEFAULT_DE_TARGET);
  const deKey = `${deStrategy}:hold${deTarget}`;
  const deRows = dePayload.livePredictions?.predictions || [];
  const deSettled = latestRow(deRows, 'settled');
  const dePending = latestRow(deRows, 'pending');
  const deNext = dePayload.nextPrediction?.strategies?.[deStrategy]?.holds?.[String(deTarget)]
    || dePending?.strategies?.[deStrategy]?.holds?.[String(deTarget)];

  const lotoRows = lotoPayload.livePredictions?.predictions || [];
  const lotoSettled = latestRow(lotoRows, 'settled');
  const lotoPending = latestRow(lotoRows, 'pending');
  const lotoMethodKey = `top${DEFAULT_LOTO_COUNT}`;
  const lotoNext = lotoPayload.nextPrediction?.predictions?.[lotoMethodKey]
    || lotoPending?.predictions?.[lotoMethodKey];

  const deResult = deSettled?.results?.[deKey];
  const deSettledPrediction = deSettled?.strategies?.[deStrategy]?.holds?.[String(deTarget)];
  const lotoResult = lotoSettled?.methods?.[lotoMethodKey];
  const lotoActual = getLotoActualNumbers(lotoSettled);
  const lotoHits = formatLotoHits(lotoResult?.betNumbers || [], lotoActual);
  const predictionDate = dePayload.nextPrediction?.predictionIsoDate
    || dePending?.predictionIsoDate
    || lotoPayload.nextPrediction?.predictionIsoDate
    || lotoPending?.predictionIsoDate;

  if (!predictionDate || !deNext || !lotoNext) {
    throw new Error('Payload chưa có đủ dự đoán Đề/Lô cho ngày tiếp theo.');
  }

  const lines = [
    `<b>XSMB - TỔNG HỢP ${escapeHtml(displayDate(predictionDate))}</b>`,
    '',
    '<b>1. KẾT TOÁN DỰ ĐOÁN TRƯỚC</b>'
  ];

  if (deSettled && deResult) {
    lines.push(
      `• <b>Đề ${escapeHtml(displayDate(deSettled.predictionIsoDate))}</b>`,
      `  Số đã đánh (${Number(deResult.betCount || deSettledPrediction?.betNumbers?.length || 0)}): <code>${escapeHtml(formatNumberList(deSettledPrediction?.betNumbers || []))}</code>`,
      `  Kết quả thực tế: <b>${escapeHtml(normalizeLotteryNumber(deSettled.actualSpecial ?? deResult.actual))}</b>`,
      `  ${deResult.hit ? '✅ TRÚNG' : '❌ TRƯỢT'} · ${escapeHtml(formatMoneyK(deResult.profitK))}`
    );
  } else {
    lines.push('• Đề: chưa có bản ghi đã kết toán.');
  }

  if (lotoSettled && lotoResult) {
    lines.push(
      `• <b>Lô top 6 ${escapeHtml(displayDate(lotoSettled.predictionIsoDate))}</b>`,
      `  Số đã đánh (${Number(lotoResult.betCount || lotoResult.betNumbers?.length || 0)}): <code>${escapeHtml(formatNumberList(lotoResult.betNumbers || []))}</code>`,
      `  Kết quả thực tế (${lotoActual.length} vị trí): <code>${escapeHtml(formatNumberList(lotoActual))}</code>`,
      `  ${Number(lotoResult.profitK || 0) > 0 ? '✅ CÓ LÃI' : '❌ LỖ'} · ${escapeHtml(formatMoneyK(lotoResult.profitK))}` +
        ` · ${Number(lotoResult.hits || 0)} hit` +
        `${lotoHits.length ? ` · Trúng: <b>${escapeHtml(formatNumberList(lotoHits))}</b>` : ''}`
    );
  } else {
    lines.push('• Lô: chưa có bản ghi đã kết toán.');
  }

  lines.push(
    '',
    '<b>2. DỰ ĐOÁN ĐỀ</b>',
    `• Phương pháp: ${escapeHtml(deStrategy)} · Hold ${deTarget}`,
    `• 30 số đánh: <b>${escapeHtml((deNext.betNumbers || []).join(' '))}</b>`,
    '',
    '<b>3. DỰ ĐOÁN LÔ TOP 6</b>',
    `• Phương pháp: ${escapeHtml(lotoPayload.nextPrediction?.methodId || 'Mốc 20 năm 27 vị trí')}`,
    `• Số đánh: <b>${escapeHtml((lotoNext.numbers || []).join(' '))}</b>`
  );

  const support = (lotoNext.support || []).slice(0, DEFAULT_LOTO_COUNT)
    .map(item => `${item.number}(${item.supportCount})`);
  if (support.length) lines.push(`• Đồng thuận 27 vị trí: ${escapeHtml(support.join(' · '))}`);
  lines.push('', '<i>Dữ liệu tự động từ cache R2 sau khi kết quả ngày mới được cập nhật.</i>');

  return {
    predictionDate,
    latestDataDate: dePayload.latestDataDate,
    text: lines.join('\n'),
    deStrategy,
    deTarget,
    lotoMethodKey
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

async function sendTelegramMessage(env, chatId, text) {
  return telegramApi(env, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  });
}

async function notifyTelegram(env, options = {}) {
  const chatId = await resolveTelegramChatId(env);
  if (!chatId) {
    return { ok: false, skipped: true, reason: 'telegram-chat-not-registered' };
  }

  const [dePayload, lotoPayload] = await Promise.all([
    fetchPredictionJson(env, `/api/milestone-20y/prediction?strategy=${DEFAULT_DE_STRATEGY}&target=${DEFAULT_DE_TARGET}`),
    fetchPredictionJson(env, `/api/loto/prediction?count=${DEFAULT_LOTO_COUNT}`)
  ]);
  const expectedDataDate = options.expectedDataDate || getVietnamDate();
  if (!options.force && (
    dePayload.latestDataDate !== expectedDataDate
    || lotoPayload.latestDataDate !== expectedDataDate
  )) {
    return {
      ok: false,
      skipped: true,
      reason: 'prediction-cache-not-ready',
      expectedDataDate,
      deLatestDataDate: dePayload.latestDataDate,
      lotoLatestDataDate: lotoPayload.latestDataDate
    };
  }

  const report = buildTelegramReport(dePayload, lotoPayload);
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
  if (command === '/send' || command === '/test') {
    const result = await notifyTelegram(env, { force: true });
    return json(result);
  }

  await sendTelegramMessage(
    env,
    chatId,
    '✅ Bot XSMB đã kết nối với @chungtvvn. Sau khi dữ liệu Đề và Lô cập nhật mỗi ngày, bot sẽ tự gửi kết toán và dự đoán mới.\n\nDùng /send để gửi thử ngay.'
  );
  return json({ ok: true, registered: true });
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
  getVietnamDate,
  notifyTelegram
};
