# kusa-image

PNG of GitHub's contribution graph, served by Cloudflare Workers.

```
https://kusa-image.swfz.dev/swfz
https://kusa-image.swfz.dev/?user=swfz
```

Successor of [swfz/deno-kusa-image](https://github.com/swfz/deno-kusa-image) (Deno Deploy shuts down in April 2027). The URL paths and parameters are the same; only the host changed.

## Parameters

| name       | example    | description                                                                                    |
| :--------- | :--------- | :--------------------------------------------------------------------------------------------- |
| user       | swfz       | GitHub user. The first path segment (`/swfz`) takes precedence over `?user=`                   |
| to         | 2023-12-31 | Last day of the one-year range (`YYYY-MM-DD`). Invalid values return 400                       |
| theme      | dark       | `dark`, otherwise light                                                                        |
| past_years | 3          | Show this many calendar years (oldest on top). Capped at the years since 2008; `to` is ignored |

Responses: `200 image/png`, `400` invalid `to`, `404` unknown user, `502` GitHub error, `503` GitHub rate limit.

## Development

Requires Node.js (see `.node-version`) and pnpm. Dependencies are installed with a 7-day cooldown (`minimumReleaseAge` in `pnpm-workspace.yaml`).

```sh
pnpm install
pnpm dev            # cf dev (uses the real GitHub API; needs GITHUB_TOKEN in .dev.vars)
pnpm test           # unit tests in the Workers runtime (vitest + @cloudflare/vitest-plugin)
pnpm test:vrt       # VRT: Playwright against `cf dev --mode test` and a GitHub mock (vrt/mock-github.ts)
pnpm typecheck
pnpm lint           # oxlint
pnpm format:check   # prettier
```

`cf dev --mode test` points the Worker at the GitHub mock on `localhost:8000` and pins the clock (see `cloudflare.config.ts`).

VRT snapshots are generated on Linux to match CI. Regenerate them with Docker (colima works):

```sh
./scripts/update-snapshots.sh
```

### Generated files

| file                              | command               | source                                                    |
| :-------------------------------- | :-------------------- | :-------------------------------------------------------- |
| `src/render/glyphs.generated.ts`  | `pnpm build:glyphs`   | `assets/fonts/NotoMono-Regular.ttf` (needs `uv`)          |
| `src/pages/top-page.generated.ts` | `pnpm build:top-page` | `src/pages/top.html`, `assets/favicon.ico`, test fixtures |

## How it works

- `src/params.ts` parses the request, `src/github.ts` calls the GitHub GraphQL API, `src/render/` draws the image.
- Rendering writes palette indices directly and encodes an indexed PNG with `CompressionStream`; text uses pre-rasterized Noto Mono 10px masks. This keeps a one-year image at a few ms of CPU on the Workers Free plan.
- `src/cache.ts`: images are cached with the Cache API (1 hour when the range includes today, 7 days for past-only ranges). Calendars of past years are cached per year, so a multi-year image only refetches the current year.
- `src/log.ts`: one access log row per request in D1 (no IP addresses or credentials). A daily Cron Trigger deletes rows older than 90 days.

## Deploy

```sh
pnpm deploy
```

First deploy only: secrets cannot be set before the Worker exists, so pass them as a file, then apply the D1 migrations.

```sh
echo "GITHUB_TOKEN=<read-only PAT>" > .dev.vars.secrets
pnpm exec cf deploy --secrets-file .dev.vars.secrets
pnpm exec cf d1 migrations apply <D1 database id>   # id: pnpm exec cf d1 list
```

Later secret updates: `pnpm exec cf workers secrets update --worker kusa-image --type secret_text`.

## Logs

Export a month of access logs as JSON Lines for BigQuery ([swfz/deno-logviewer-import-dataform](https://github.com/swfz/deno-logviewer-import-dataform)):

```sh
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... D1_DATABASE_ID=... pnpm export:logs 2027 1 > 2027-01-cf.jsonl
```

## Monitoring

The Worker runs on the Free plan. Multi-year images (`past_years` > ~5) can exceed its 10 ms CPU limit on the first, uncached render. Requests that hit the limit fail with error 1102 and cannot log themselves, so watch Workers Observability:

```sh
# requests that exceeded the CPU limit (last 24h)
pnpm exec cf o11y telemetry query --body '{"queryId":"exceeded-cpu","view":"events","limit":50,
  "timeframe":{"from":'$(( ($(date +%s) - 86400) * 1000 ))',"to":'$(( $(date +%s) * 1000 ))'},
  "parameters":{"filters":[{"key":"$metadata.service","operation":"eq","type":"string","value":"kusa-image"},
                           {"key":"$workers.outcome","operation":"eq","type":"string","value":"exceededCpu"}]}}'
```

If it shows up regularly, move the Worker to the Workers Paid plan (no code change needed).

GitHub API usage shares the rate limit of the PAT owner. The access log records `github_cost` / `github_remaining` per request; `error = 'rate_limited'` (HTTP 503) means the limit was hit.
