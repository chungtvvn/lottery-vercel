# Cloudflare Worker Cron for Daily XSMB Update

This Worker is only a scheduler. It dispatches the existing GitHub Actions workflow
`daily-update.yml`; GitHub Actions still fetches XSMB, regenerates stats, uploads R2,
and triggers the Vercel deploy hook.

## Schedule

- Cloudflare Cron: `40 11 * * *` UTC
- Vietnam time: `18:40` GMT+7
- GitHub Actions schedule remains enabled as a fallback with retry slots.

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

`DISPATCH_SECRET` is only used for manual HTTP dispatch. Cron dispatch does not need it,
but keeping it set prevents public manual triggering.

## Deploy

```bash
npm run cf:cron:deploy
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

