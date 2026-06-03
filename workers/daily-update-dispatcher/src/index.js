const DEFAULT_INPUTS = {
  wait_for_new_xoso: '1',
  xoso_max_wait_minutes: '90',
  xoso_retry_interval_seconds: '60',
  force_regenerate_stats: '0',
  clear_r2_statistics: '0'
};

function getVietnamDate(offsetHours = 0) {
  const date = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
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
    const body = await response.text();
    throw new Error(`GitHub dispatch failed (${response.status}): ${body}`);
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

async function handleManualRequest(request, env) {
  const url = new URL(request.url);

  if (request.method === 'GET') {
    return json({
      ok: true,
      service: 'xsmb-daily-update-dispatcher',
      cronUtc: '40 11 * * *',
      cronVietnamTime: '18:40',
      githubWorkflow: env.GITHUB_WORKFLOW || 'daily-update.yml',
      targetDateToday: getVietnamDate()
    });
  }

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  if (env.DISPATCH_SECRET) {
    const provided = request.headers.get('x-dispatch-secret') || url.searchParams.get('secret');
    if (provided !== env.DISPATCH_SECRET) {
      return json({ ok: false, error: 'Unauthorized' }, 401);
    }
  }

  const targetDate = url.searchParams.get('targetDate') || getVietnamDate();
  const waitForNew = url.searchParams.get('wait_for_new_xoso') || url.searchParams.get('wait') || '1';
  const inputs = buildInputs(targetDate, {
    wait_for_new_xoso: waitForNew,
    xoso_max_wait_minutes: url.searchParams.get('maxWait') || DEFAULT_INPUTS.xoso_max_wait_minutes,
    xoso_retry_interval_seconds: url.searchParams.get('retrySeconds') || DEFAULT_INPUTS.xoso_retry_interval_seconds,
    force_regenerate_stats: url.searchParams.get('force') || DEFAULT_INPUTS.force_regenerate_stats,
    clear_r2_statistics: url.searchParams.get('clearStats') || DEFAULT_INPUTS.clear_r2_statistics
  });

  const result = await dispatchGithubWorkflow(env, inputs, 'manual-http');
  return json(result);
}

export default {
  async fetch(request, env) {
    try {
      return await handleManualRequest(request, env);
    } catch (error) {
      return json({ ok: false, error: error.message }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    const targetDate = getVietnamDate();
    const inputs = buildInputs(targetDate);
    ctx.waitUntil(dispatchGithubWorkflow(env, inputs, `cron:${event.cron}`));
  }
};
