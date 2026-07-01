# Cloudflare Worker Cron for Daily XSMB Update

This Worker dispatches `daily-update.yml`. The workflow sends one daily Telegram
report after both Đề and Lô caches are ready. GitHub Actions still fetches XSMB,
regenerates stats, uploads R2, and triggers the Vercel deploy hook.

## Schedule

- Cloudflare Cron: `40 11 * * *` UTC
- Vietnam time: `18:40` GMT+7
- GitHub Actions schedule remains enabled as a fallback.
- Telegram delivery has one source: the final verification job in
  `daily-update.yml`.
- KV deduplicates by prediction date, so fallback and repeated workflow runs do
  not send the same report again.

## Required Cloudflare Worker Secrets

Create a GitHub fine-grained token or classic token with permission to dispatch workflows:

- Repository: `chungtvvn/lottery-vercel`
- Permission: Actions/workflows write access
- Classic token alternative: `repo` + `workflow`

Then set secrets:

```bash
npm run cf:cron:secret:github
npm run cf:cron:secret:dispatch
```

Create and bind the KV namespace used for Telegram state:

```bash
npm run cf:cron:kv:create
```

Copy the returned namespace id into `wrangler.daily-update.toml`:

```toml
[[kv_namespaces]]
binding = "TELEGRAM_STATE"
id = "<namespace-id>"
```

Create a bot with `@BotFather`, then set these Worker secrets:

```bash
npm run cf:cron:secret:telegram-token
npm run cf:cron:secret:telegram-webhook
```

If KV is not configured yet, set the numeric chat id directly:

```bash
npm run cf:cron:secret:telegram-chat
```

`TELEGRAM_WEBHOOK_SECRET` should be a private random string containing only
letters, digits, `_`, and `-`. If the prediction APIs require a token, also set:

```bash
npx wrangler secret put PREDICTION_API_TOKEN -c wrangler.daily-update.toml
```

`DISPATCH_SECRET` is only used for manual HTTP dispatch. Cron dispatch does not need it,
but keeping it set prevents public manual triggering.

## Deploy

```bash
npm run cf:cron:deploy
```

Register the Telegram webhook:

```bash
curl -X POST \
  "https://xsmb-daily-update-dispatcher.<your-subdomain>.workers.dev/telegram/setup-webhook" \
  -H "x-dispatch-secret: <DISPATCH_SECRET>"
```

Open the new bot in Telegram from account `@chungtvvn` and send `/start`.
Telegram bots cannot initiate a private chat; the user must start the bot first.
The Worker validates the username and stores its numeric `chat_id` in KV.

For immediate notification as soon as GitHub Actions verifies both caches, add
these GitHub repository secrets:

- `TELEGRAM_WORKER_NOTIFY_URL`: Worker origin, without trailing slash.
- `TELEGRAM_DISPATCH_SECRET`: same value as the Worker `DISPATCH_SECRET`.

KV is required for daily delivery so repeated workflow runs can deduplicate
safely.

Send a test report:

```bash
curl -X POST \
  "https://xsmb-daily-update-dispatcher.<your-subdomain>.workers.dev/telegram/notify?force=1" \
  -H "x-dispatch-secret: <DISPATCH_SECRET>"
```

Check setup and last sent date:

```bash
curl \
  "https://xsmb-daily-update-dispatcher.<your-subdomain>.workers.dev/telegram/status?secret=<DISPATCH_SECRET>"
```

## Test Manually

After deploy, open the Worker URL with `GET` to verify configuration.

To trigger a manual dispatch:

```bash
curl -X POST "https://xsmb-daily-update-dispatcher.<your-subdomain>.workers.dev/?wait=0" \
  -H "x-dispatch-secret: <DISPATCH_SECRET>"
```

Useful query params:

- `targetDate=YYYY-MM-DD`
- `wait=0|1`
- `maxWait=90`
- `retrySeconds=60`
- `force=0|1`
- `clearStats=0|1`

## Logs

```bash
npm run cf:cron:tail
```
