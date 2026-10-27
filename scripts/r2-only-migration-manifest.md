# R2-only migration manifest — 27/10/2026

Owner decision 27/10/2026: **all computed data lives on Cloudflare R2 only**
(prefixes `statistics/` and `data/`). Local files under `lib/data/` and
`data/` are legacy copies, not a second source of truth. Nothing in this
manifest deletes, overwrites, or uploads anything by itself — it is the
disposition record that `scripts/migrate-local-to-r2.js` reads (dry-run by
default; `--apply` is a separate, credential-gated step that was NOT run in
this VM).

Source of the local-vs-R2 facts below:
`~/workspace/goals/xsmb-lottery-prediction-system/files/R2_DoiChieu_2026-10-27.md`
(public-URL comparison, 42 known file names: 41 under `statistics/` + 1
under `data/`). That report could only check known names — R2 may hold
other keys that a name-based check cannot see (see §4, unresolved items).

Conventions used in §2–§3:

- **UPLOAD-TO-R2** — local file has no R2 counterpart; upload it whole
  (gzip, except the two plain-`.json` files, per `scripts/upload-to-r2.js`).
- **MERGE-PER-DATE** — neither side is a superset; merge entry-by-entry
  keyed by date. A whole-file overwrite in either direction LOSES data and
  is forbidden for these files.
- **DISCARD** — do NOT upload the local copy. Either R2 already holds an
  identical copy (no-op), or R2 is newer / wins by default and uploading
  local would risk overwriting live data. DISCARD here means "no upload",
  not "delete the local file" — local cleanup is a separate step after the
  R2-only runtime is deployed and verified live.

## 1. Audit table — disk reads/writes of `lib/data/`, `data/`, `outputs/` in `app/` and `lib/`

Scope: every `fs.readFileSync` / `writeFileSync` / `existsSync` /
`readdirSync` / `fs.promises.readFile|writeFile` (plus `require()` of a
statistics JSON where it is a data source) in `app/` and `lib/`, found by
grep on 27/10/2026. Runtime (`app/`, `lib/` services) first; generators
and utilities last. **This audit does NOT fix anything** — the files
marked "other agents" are being converted by the concurrent agents that
own `lib/data-access.js`, `app/api` routes, and the registry/advisor
services. Files marked "NOT owned by concurrent agents" still read local
disk as a source after those conversions and are remaining work, listed
here so they are not silently forgotten.

Classification: **source** = the disk read supplies data served or used
when it hits; **fallback** = disk is tried only after R2/Supabase (or
another source) fails or returns empty; **override** = a disk read can
replace/extend data already obtained from elsewhere; **write** = the code
writes a local data file; **mtime-only** = the path is only stat'ed for
cache freshness, data comes from elsewhere; **non-data** = not a data
file at all (HTML view, config, fingerprint hash).

### 1a. `app/` routes (owned by concurrent agents — app/api routes)

| File:line | Reads / writes | Classification |
|---|---|---|
| `app/api/daily-advisor/route.js:233-234` | reads `lib/data/statistics/cached_prediction_history.json` | source — local-only read in this block (no R2 attempt here); feeds history payload |
| `app/api/daily-advisor/route.js:317-318` | reads `lib/data/statistics/cached_daily_method_advisor.json` | fallback — after `loadJsonWithSupabaseFallback` returns no usable records |
| `app/api/daily-advisor/route.js:330-332` | reads `lib/data/statistics/cached_daily_method_advisor.json` again | override — local copy can overwrite `latestDataDate` / pending fields of the payload already obtained, when local is newer-or-equal |
| `app/api/daily-advisor/route.js:443-444` | reads `lib/data/statistics/cached_de_dropoff_merge_shadow.json` | source (fill-if-missing) — supplies `deDropoffMerge` when payload lacks it; longer shadow is logged, never overwrites |
| `app/api/daily-advisor/route.js:452-453` | reads `lib/data/statistics/cached_lo_dropoff_27_shadow.json` | source (fill-if-missing) — supplies `loDropoff27` when payload lacks it |
| `app/api/exclusion/audit/route.js:11-12` | reads `lib/data/statistics/cached_exclusion_tier_audit.json` | source — sole source; 404 when the local file is absent |
| `app/chain-frequency/route.js:7`, `app/daily-advisor/route.js:7`, `app/daily-advisor-shadow/route.js:7-10`, `app/loto/route.js:7`, `app/probability-score/route.js:8`, `app/records/route.js:7`, `app/scoring/route.js:7`, `app/settings/route.js:7`, `app/simulation/route.js:7`, `app/statistics/route.js:7` | read `views/*.html` | non-data — HTML view files, not `lib/data/` data; no action |
| All other `app/api/*` routes (e.g. `analysis/latest`, `chain-frequency`, `config`, `daily-advisor/analysis`, `latest-date`, `loto/prediction`, `milestone-20y/prediction`, `performance-report`, `probability-score`, `recent-results`, `scoring/aggregate`, `simulation/backtest`, `statistics/*`, `suggestions`, `system/supabase-status`) | no direct `fs` data read found by grep | source-of-truth read — via `lib/data-access.js` (see §1b); converting data-access converts these |

### 1b. `lib/data-access.js` (owned by concurrent agents)

| File:line | Reads / writes | Classification |
|---|---|---|
| `lib/data-access.js:204-208` | `loadJsonFile(filePath)` — `existsSync` + `readFileSync`, the shared disk reader | source primitive — every fallback below funnels through it |
| `lib/data-access.js:330,348,351` | `loadJsonFromR2` → Supabase → `loadJsonFile(path.join(STATS_DIR, fileName))`, gated by `allowLocalJsonFallback('LOTTERY_STATS_SOURCE')` | fallback — disk read of `lib/data/statistics/<file>`; in production with R2 configured the fallback is already off unless `ALLOW_LOCAL_JSON_FALLBACK=1` or a local/dev source mode is set, but the path still exists in code |
| `lib/data-access.js:378,386,389` | R2/Supabase raw → `loadJsonFile(path.join(DATA_DIR, 'xsmb-2-digits.json'))`, gated by `allowLocalJsonFallback('LOTTERY_DATA_SOURCE')` | fallback — disk read of `lib/data/xsmb-2-digits.json` |
| `lib/data-access.js:568,719` | `path.join(STATS_DIR, 'quick_stats.json' / 'quick_stats_history.json')` passed only to `getFileMtimeMs` | mtime-only — data itself comes from `loadJsonWithSupabaseFallback`; the mtime probe must move to R2 metadata (or be dropped) once the file is gone, or the freshness check throws |
| `lib/data-access.js:1103` | `fs.readFile(path.join(DATA_DIR, 'statistics', 'quick_stats_history.json'))` then `writeCacheStore('quick_stats_history', ...)` | source (one-way sync) — local file is read to seed the Supabase `cache_store`; under R2-only this seed must come from R2 |

### 1c. Registry / advisor services (owned by concurrent agents)

| File:line | Reads / writes | Classification |
|---|---|---|
| `lib/services/dailyLockedBetsRegistryService.js:95-97` | reads `lib/data/statistics/daily_locked_bets_registry.json` | source — first registry location tried |
| `lib/services/dailyLockedBetsRegistryService.js:100-102` | reads `data/daily_locked_bets_registry.json` (repo-root `data/`) | fallback — second registry location; byte-identical to the `lib/` copy at audit time |
| `lib/services/dailyLockedBetsRegistryService.js:121-123` | `writeFileAtomic` (mkdir + `writeFileSync` tmp + rename) | write — used by `saveRegistry` for both locations below |
| `lib/services/dailyLockedBetsRegistryService.js:130-141` (`saveRegistry`) | writes BOTH `lib/data/statistics/daily_locked_bets_registry.json` AND `data/daily_locked_bets_registry.json` | write — dual local write; under R2-only the registry write must go to R2 (plain `.json`, not `.gz`) |
| `lib/services/dailyLockedBetsRegistryService.js:236-237` | reads `lib/data/xsmb-2-digits.json` for the raw draw row of a date | source (lookup fallback inside settlement) |
| `lib/services/dailyLockedBetsRegistryService.js:342-343,946-947` | reads `lib/data/statistics/cached_daily_method_advisor.json` | source — advisor cache consulted for penta/top8 settlement data |
| `lib/services/dailyMethodAdvisorService.js:1537-1538` | reads `lib/data/statistics/cached_daily_method_advisor.json` as `existingCache` | source — existing cache merged into a regenerated advisor cache |
| `lib/services/dailyMethodAdvisorService.js:2174` (`loadLocalJson`) | `readFileSync` helper, called at :2180 (prediction history), :2182 (advisor cache), :2182-adjacent (raw `xsmb-2-digits.json`) | source — all inputs to `generateAndWriteCache` come from local disk unless passed in via options |
| `lib/services/dailyMethodAdvisorService.js:2201-2202` | `mkdirSync` + `writeFileSync` `lib/data/statistics/cached_daily_method_advisor.json` | write — generated advisor cache written to local disk |
| `lib/services/deDropoffMergeAdvisorService.js:58-59,64` | reads `lib/data/statistics/cached_de_dropoff_merge_shadow.json` (`existsSync`/`readFileSync`, plus `require('../data/statistics/cached_de_dropoff_merge_shadow.json')` fallback) | source — disk cache is the service's data |
| `lib/services/loDropoff27AdvisorService.js:68-69,74` | reads `lib/data/statistics/cached_lo_dropoff_27_shadow.json` (same dual pattern) | source — disk cache is the service's data |
| `lib/services/probabilityDistributionService.js:139` | writes `lib/data/statistics/cached_probability_distribution.json` | write — generated cache to local disk (read path is via caller-supplied `raw`/`history` or `readLocalJson`-style helpers; the write is the local-disk coupling) |
| `lib/services/probabilityScoreService.js:494-495,505,550-551` | `readLocalJson` reads `cached_prediction_history.json`; `writeFileSync` writes `cached_probability_score.json` | source + write — history from disk, generated score cache to disk |
| `lib/services/predictionHistoryService.js:48-49,100` | `LOCAL_HISTORY_FILE` / `LOCAL_SIMULATION_FILE` constants; `require('../data/statistics/cached_prediction_history.json')` bundled fallback | source — bundled disk copy used when R2/other sources fail |
| `lib/services/predictionHistoryService.js:520-521` | reads `LOCAL_HISTORY_FILE` (prediction history) | source — local snapshot merged with R2 runs in `loadExistingPredictionHistory` |
| `lib/services/predictionHistoryService.js:569-573` | reads `LOCAL_SIMULATION_FILE` (`cached_simulation_90.json`) | fallback — used when rolling snapshot generation fails, strict-PIT-checked |
| `lib/services/predictionHistoryService.js:590-591,646-647` | `mkdir` + `writeFile` `LOCAL_HISTORY_FILE` | write — merged history written back to local disk |
| `lib/services/predictionHistoryService.js:692-699,959-960` | reads `cached_simulation_90.json` (backfill seed) and `LOCAL_HISTORY_FILE` (cached-history path) | source / fallback |
| `lib/services/predictionHistoryPerformanceService.js:9,327-328,333` | reads + writes `lib/data/statistics/cached_prediction_history_performance_2026.json` | source + write — performance cache round-trips through local disk |

### 1d. Other `lib/` services — NOT owned by the concurrent agents (remaining work)

Every row below is a disk read that still serves data after the
concurrent conversions. They are not fixed by this task; they are
recorded so the R2-only cutover does not declare victory while they
still exist. All read `lib/data/` (via `process.cwd()` or
`__dirname/../data`, which resolves to the same `lib/data/` tree).

| File:line | Reads / writes | Classification |
|---|---|---|
| `lib/services/lotteryService.js:111-113` | reads `lib/data/xsmb-2-digits.json` (`loadRawDataSync`) | source — raw data, local-only, no R2 attempt |
| `lib/services/lotteryService.js:129-133` | reads `lib/data/statistics/number_stats.json`, `head_tail_stats.json`, `sum_difference_stats.json` | source — stats caches, local-only |
| `lib/services/annualMilestoneService.js:584,2674-2675,2874-2875` | writes `cached_milestone20y_baseline_<year>.json`, `cached_milestone20y_prediction.json`, `cached_milestone20y_live_predictions.json` under `lib/data/statistics/` | write — generated caches to local disk |
| `lib/services/annualMilestoneService.js:2220-2221` | reads `cached_prediction_history.json` (Edge75 snapshots) | source |
| `lib/services/annualMilestoneService.js:2665-2666` (`loadLocalJson`, used at :564, :2690) | reads any `lib/data/statistics/*.json` passed in | source (generic helper) |
| `lib/services/adaptiveDualMergeAdvisorService.js:311-312` | reads `cached_prediction_history.json` | fallback — only when the candidate map has < 2 methods |
| `lib/services/advisorAnalysisService.js:1808` | reads `lib/data/xsmb-2-digits.json` | fallback — raw history when not supplied by caller |
| `lib/services/aiLotteryResearchService.js:3815,3821` | reads `cached_loto_live_predictions.json`, `cached_loto_prediction.json` | fallback — RRF inputs when not supplied via options |
| `lib/services/autoBestSelectionService.js:266-267,290-291` | reads `cached_daily_method_advisor.json`, `cached_prediction_history_performance_2026.json` | fallback — cache/context when not supplied |
| `lib/services/crossHedgingPortfolioService.js:1145-1146,1154-1155` | reads `xsmb-2-digits.json`, `cached_daily_method_advisor.json` | fallback — raw + advisor cache when not supplied |
| `lib/services/dualMergeAdvisorService.js:552-553` | reads `lib/data/xsmb-2-digits.json` | fallback — raw rows when not passed in |
| `lib/services/dualMergeAdvisorService.js:635-636,648-649` | reads `cached_prediction_history.json`, `cached_daily_method_advisor.json` | fallback — history / advisor records when not passed in |
| `lib/services/dynamicDeSelectorService.js:913-914,1394-1395` | reads `cached_daily_method_advisor.json` (two call sites) | fallback — advisor cache when not in context/options |
| `lib/services/dynamicDeSelectorService.js:1413-1414,1570-1571` | reads `cached_prediction_history_performance_2026.json` (two call sites) | fallback — Pool-7 performance when not supplied |
| `lib/services/metaLearnerAdvisorService.js:21-22` | reads `cached_daily_method_advisor.json` | fallback — advisor cache when not in context |
| `lib/services/tenTierLotteryResearchService.js:989-990,1262-1263` | reads `cached_daily_method_advisor.json` (two call sites) | fallback — advisor cache when not supplied |
| `lib/services/triCoreDeAdvisorService.js:200-201,210-211` | reads `xsmb-2-digits.json`, `cached_daily_method_advisor.json` | fallback — raw + cache when not passed in |
| `lib/services/probabilityScoreService.js` (see also §1c) | — | source + write (listed in §1c because the advisor-service agents own the neighbouring cache; the file itself is shared) |

### 1e. Generators and utilities (last)

| File:line | Reads / writes | Classification |
|---|---|---|
| `lib/generators/statisticsGenerator.js:800,1160` | reads `xsmb-2-digits.json`, writes `number_stats.json` | build-time source + write — offline generator, not a request path; its outputs must be uploaded to R2 (see `scripts/upload-to-r2.js`) rather than read from disk at runtime |
| `lib/generators/headTailStatsGenerator.js:756,1092` | reads `xsmb-2-digits.json`, writes `head_tail_stats.json` | build-time source + write (same note) |
| `lib/generators/sumDifferenceStatsGenerator.js:811,1060` | reads `xsmb-2-digits.json`, writes `sum_difference_stats.json` | build-time source + write (same note) |
| `lib/research/historicalChainSurvivalPrior.js:331` | reads caller-chosen files under `lib/data/statistics/` (default `statsDir`) | source — research utility; default dir is the local tree, callers must pass an R2-materialised dir or be converted |
| `lib/utils/backtestFingerprint.js:40,58,68` | reads caller-supplied file paths (hashing) and writes a snapshot file | test/fingerprint utility — does NOT serve data; allowlisted in `scripts/test-r2-only.js` |
| `lib/utils/statsOptionsManifest.js:26` | reads `public/js/stats-config.js` | config — not a data file; listed for completeness, does not match the statistics-disk-read pattern |
| `outputs/` (repo-root `outputs/`, e.g. `backtest-365-moc20y-*`, `profit-report-2026`) | no `fs` read/write of `outputs/` found in `app/` or `lib/` by grep | no runtime coupling found — outputs are report artefacts, not served data |

Notes on §1:

- No `app/` or `lib/` file writes to `data/` (repo-root) except the
  registry dual-write (§1c). The repo-root `data/` copy of the registry
  is byte-identical to the `lib/` copy (verified 27/10/2026).
- `scripts/` (not in the table above, out of the runtime audit scope)
  still reads/writes local files heavily — generators, `update-static-data.js`,
  and `upload-to-r2.js` (which reads local files to upload them). Those
  are the build/upload side and are expected to keep working until the
  build itself is R2-native; they are NOT request-time sources of truth.
- `scripts/update-static-data.js` does **not** invoke `sync-from-r2`
  (verified by grep); it invokes `scripts/upload-to-r2.js` (upload
  direction, kept).

## 2. Per-file dispositions

R2 key naming (from `scripts/upload-to-r2.js`): every statistics file
uploads as `statistics/<file>.json.gz`; `daily_locked_bets_registry.json`
and `cached_daily_method_advisor.json` additionally upload as plain
`statistics/<file>.json`. The raw file uploads as `data/xsmb-2-digits.json.gz`
(plus plain `data/xsmb-2-digits.json`). Local byte sizes below are from
the 27/10/2026 audit snapshot; `migrate-local-to-r2.js --dry-run`
re-stats the files at run time and reports live sizes.

### 2a. UPLOAD-TO-R2 — local-only files (20)

These 20 files returned 404 for both plain `.json` and `.json.gz` on R2.
Upload whole, gzipped, to the key shown. (Only `cached_simulation_90.json`
among the simulation family is already on R2 and identical — it is in §2d,
not here.)

| Local file | R2 key | Local bytes |
|---|---|---|
| `lib/data/statistics/cached_simulation_7.json` | `statistics/cached_simulation_7.json.gz` | 762927 |
| `lib/data/statistics/cached_simulation_7_bet.json` | `statistics/cached_simulation_7_bet.json.gz` | 762455 |
| `lib/data/statistics/cached_simulation_7_hold.json` | `statistics/cached_simulation_7_hold.json.gz` | 760014 |
| `lib/data/statistics/cached_simulation_14.json` | `statistics/cached_simulation_14.json.gz` | 1449919 |
| `lib/data/statistics/cached_simulation_14_bet.json` | `statistics/cached_simulation_14_bet.json.gz` | 1448976 |
| `lib/data/statistics/cached_simulation_14_hold.json` | `statistics/cached_simulation_14_hold.json.gz` | 1444511 |
| `lib/data/statistics/cached_simulation_30.json` | `statistics/cached_simulation_30.json.gz` | 2882770 |
| `lib/data/statistics/cached_simulation_30_bet.json` | `statistics/cached_simulation_30_bet.json.gz` | 2880909 |
| `lib/data/statistics/cached_simulation_30_hold.json` | `statistics/cached_simulation_30_hold.json.gz` | 2871599 |
| `lib/data/statistics/cached_simulation_60.json` | `statistics/cached_simulation_60.json.gz` | 5590156 |
| `lib/data/statistics/cached_simulation_60_bet.json` | `statistics/cached_simulation_60_bet.json.gz` | 5586487 |
| `lib/data/statistics/cached_simulation_60_hold.json` | `statistics/cached_simulation_60_hold.json.gz` | 5568185 |
| `lib/data/statistics/cached_simulation_90_bet.json` | `statistics/cached_simulation_90_bet.json.gz` | 8197354 |
| `lib/data/statistics/cached_simulation_90_hold.json` | `statistics/cached_simulation_90_hold.json.gz` | 8169974 |
| `lib/data/statistics/cached_simulation_180.json` | `statistics/cached_simulation_180.json.gz` | 2016591 |
| `lib/data/statistics/cached_simulation_180_bet.json` | `statistics/cached_simulation_180_bet.json.gz` | 2005757 |
| `lib/data/statistics/cached_simulation_180_hold.json` | `statistics/cached_simulation_180_hold.json.gz` | 1951408 |
| `lib/data/statistics/cached_simulation_365.json` | `statistics/cached_simulation_365.json.gz` | 3955581 |
| `lib/data/statistics/cached_simulation_365_bet.json` | `statistics/cached_simulation_365_bet.json.gz` | 3933642 |
| `lib/data/statistics/cached_simulation_365_hold.json` | `statistics/cached_simulation_365_hold.json.gz` | 3823827 |

Caution for §2a: `scripts/upload-to-r2.js` by default only uploads the
simulation window(s) in `SIMULATION_CACHE_DAYS` (default `90`) — a plain
run of that script would SKIP most of these 20. The migration `--apply`
must upload this exact list explicitly, not rely on the default filter.

### 2b. MERGE-PER-DATE — neither side is a superset (3)

Whole-file overwrite in either direction loses data. Merge keyed by
date; `--apply` must re-read the live R2 object, merge, and only then
PutObject the merged result (gzip, plus plain `.json` for the registry).

| Local file | R2 key | Per-date winners (dry-run prints these) |
|---|---|---|
| `lib/data/statistics/daily_locked_bets_registry.json` | `statistics/daily_locked_bets_registry.json` (+ plain `.json`) | LOCAL wins for the 7 restated Markov dates only — 2026-10-12, 2026-10-15, 2026-10-16, 2026-10-17, 2026-10-18, 2026-10-19, 2026-10-20 (local capital 77000K vs R2 70000K; local CHP totals −98000, 103800, −100200, −40200, 14000, −114000, 382000K). R2 wins for 2026-10-26 (settled on R2, unsettled locally) and 2026-10-27 (pending, R2-only). The other 33 shared dates are identical — no action. |
| `lib/data/statistics/cached_prediction_history.json` | `statistics/cached_prediction_history.json.gz` | LOCAL wins for runs R2 lacks: local has 113 runs 2026-07-01→2026-10-21, R2 has 90 runs 2026-07-28→2026-10-27. At minimum the 27 local runs with `predictionDate` < 2026-07-28 are local-only and must be carried into the merged file. R2 wins for all runs after 2026-10-21 (through 2026-10-27) and for any R2-only run inside the overlap — `--apply` must diff by `predictionDate` against the live R2 object, not assume the overlap is identical. Merged file = union by `predictionDate`, local entry winning only where R2 has no entry for that date. |
| `lib/data/statistics/cached_de_dropoff_merge_shadow.json` | `statistics/cached_de_dropoff_merge_shadow.json` (+ plain `.json` per current R2 presence) | MERGE ledger entries by date, do NOT whole-file upload: local is newer (`generatedAt` 2026-10-18 vs R2 2026-10-09, `settledLedger` 35 vs 24) BUT R2 carries a different, much larger ledger scope (`all2026Ledger` 278 vs local 35) that a local upload would destroy. Local entries win for their dates; R2-only entries (including the whole `all2026Ledger` scope) are preserved. Because the two files' ledger scopes differ, the merged result needs owner verification before `--apply` — dry-run flags this file as NEEDS-REVIEW. |

### 2c. DISCARD — R2 wins, do not upload local (14)

Local differs but R2 is newer (timestamp/date evidence) or wins by
default as the live store. Uploading local would risk overwriting live
data. No upload, no merge, no action — the local copy is simply
superseded once the R2-only runtime is live.

| Local file | R2 key (already live, do not overwrite) | Why R2 wins |
|---|---|---|
| `lib/data/statistics/cached_daily_method_advisor.json` | `statistics/cached_daily_method_advisor.json` (plain) | R2 newer: `generatedAt` 2026-10-26T18:44 vs local 2026-10-25T16:07; pending 2026-10-27 vs 2026-10-26 |
| `lib/data/statistics/cached_loto_live_predictions.json` | `statistics/cached_loto_live_predictions.json.gz` | R2 newer: `generatedAt` 2026-10-26 vs local 2026-10-08; 72 vs 68 predictions |
| `lib/data/statistics/cached_loto_prediction.json` | `statistics/cached_loto_prediction.json.gz` | R2 newer: `generatedAt` 2026-10-26 vs local 2026-10-08 |
| `lib/data/statistics/cached_prediction_history_performance_2026.json` | `statistics/cached_prediction_history_performance_2026.json.gz` | R2 newer: `generatedAt` 2026-10-26 vs local 2026-10-21 |
| `lib/data/statistics/cached_probability_distribution.json` | `statistics/cached_probability_distribution.json.gz` | R2 newer: `generatedAt` 2026-10-26 vs local 2026-10-08; 7 vs 6 records |
| `lib/data/statistics/cached_probability_score.json` | `statistics/cached_probability_score.json.gz` | R2 newer: `generatedAt` 2026-10-26 vs local 2026-10-08; 12 vs 11 records |
| `lib/data/statistics/cached_suggestions.json` | `statistics/cached_suggestions.json.gz` | Undetermined from content (no timestamp; R2 414 vs local 362 explanations) — R2 wins by default as the live store; do not upload local |
| `lib/data/statistics/chain_frequency_frequency_potential_0_exclude3_0.json` | `statistics/chain_frequency_frequency_potential_0_exclude3_0.json.gz` | R2 timestamp newer (2026-10-26 vs 2026-10-08) BUT `chainRows` 1 vs local 3 — R2 is NOT a superset. Still DISCARD for upload purposes (uploading local would overwrite live), but the chainRows discrepancy must be reviewed before the next regeneration of these files |
| `lib/data/statistics/chain_frequency_frequency_potential_1_exclude3_0.json` | `statistics/chain_frequency_frequency_potential_1_exclude3_0.json.gz` | Same chainRows caveat as above |
| `lib/data/statistics/chain_frequency_risk_potential_0_exclude3_0.json` | `statistics/chain_frequency_risk_potential_0_exclude3_0.json.gz` | Same chainRows caveat as above |
| `lib/data/statistics/chain_frequency_risk_potential_1_exclude3_0.json` | `statistics/chain_frequency_risk_potential_1_exclude3_0.json.gz` | Same chainRows caveat as above |
| `lib/data/statistics/number_stats.json` | `statistics/number_stats.json.gz` | Undetermined from content (no timestamp) — R2 wins by default; do not upload local |
| `lib/data/statistics/quick_stats_keys.json` | `statistics/quick_stats_keys.json.gz` | Undetermined from content (no timestamp; R2 55950 vs local 55941 entries) — R2 wins by default; do not upload local |
| `lib/data/xsmb-2-digits.json` | `data/xsmb-2-digits.json.gz` (+ plain `data/xsmb-2-digits.json`) | R2 newer by exactly 1 draw: 7595 records through 2026-10-26 (ĐB 21) vs local 7594 through 2026-10-25 (ĐB 28) |

### 2d. DISCARD (no-op) — identical on R2 (5) + duplicate copy (1)

| Local file | R2 key | Note |
|---|---|---|
| `lib/data/statistics/cached_advisor_long_horizon_research.json` | `statistics/cached_advisor_long_horizon_research.json.gz` | sha256 identical |
| `lib/data/statistics/cached_exclusion_tier_audit.json` | `statistics/cached_exclusion_tier_audit.json.gz` | sha256 identical |
| `lib/data/statistics/cached_lo_dropoff_27_shadow.json` | `statistics/cached_lo_dropoff_27_shadow.json` (plain) | sha256 identical |
| `lib/data/statistics/cached_profit_report_2026.json` | `statistics/cached_profit_report_2026.json.gz` | sha256 identical |
| `lib/data/statistics/cached_simulation_90.json` | `statistics/cached_simulation_90.json.gz` | sha256 identical — the only simulation file already on R2 |
| `data/daily_locked_bets_registry.json` (repo-root copy) | — (covered by §2b via the `lib/` copy) | Byte-identical to `lib/data/statistics/daily_locked_bets_registry.json` at audit time; do NOT upload separately — the §2b merge is the single disposition for this registry |

## 3. Summary counts per disposition

| Disposition | Count | Files |
|---|---|---|
| UPLOAD-TO-R2 | 20 | §2a simulation files |
| MERGE-PER-DATE | 3 | §2b registry, prediction history, de-dropoff shadow |
| DISCARD (R2 wins) | 14 | §2c |
| DISCARD (identical / duplicate, no-op) | 6 | §2d (5 identical + 1 duplicate copy) |
| **Total manifest rows** | **43** | 42 comparison files + 1 repo-root duplicate copy |

## 4. Unresolved items — NOT dispositioned (do not upload, do not delete)

- `lib/data/xsmb_full.json` and `lib/data/research_advisor_vs_shadow_split_results.json`:
  present locally but absent from the 27/10 comparison table (only known
  names were checked). No R2 counterpart can be asserted either way
  without an R2 bucket listing. Disposition requires a bucket list first.
- `*.bak` / `*.bak.20261027-080526` files (`lib/data/statistics/*.bak`,
  registry `.bak` copies, `data/*.bak`): backups, not data — not
  dispositioned here; delete only under the later local-cleanup step.
- R2 keys not present in the repo at all (if any): the name-based
  comparison cannot see them. A bucket listing before `--apply` is
  required to confirm no live key is orphaned by the cutover.
- 2026-10-27 pending registry row: the §2b merge must happen (or be
  explicitly deferred) BEFORE the 27/10 settlement runs, or the
  settlement code must decide whether the pending row's stored capital
  (70000K on R2) or the restated capital (77000K) governs — otherwise
  the 7-date drift repeats for 27/10.
- Chain-frequency `chainRows` discrepancy (§2c): R2 files have 1 row
  where local has 3 despite a newer R2 timestamp. Review before the
  next regeneration; neither side is declared a superset.

## 5. Machine-readable dispositions (read by `scripts/migrate-local-to-r2.js`)

Format: `| Local file | Disposition | R2 key | Local bytes (audit snapshot) | Date scope / note |`.
The migration script parses this table only; edit dispositions here, not
in the script.

| Local file | Disposition | R2 key | Local bytes | Date scope / note |
| lib/data/statistics/cached_simulation_7.json | UPLOAD-TO-R2 | statistics/cached_simulation_7.json.gz | 762927 | whole file |
| lib/data/statistics/cached_simulation_7_bet.json | UPLOAD-TO-R2 | statistics/cached_simulation_7_bet.json.gz | 762455 | whole file |
| lib/data/statistics/cached_simulation_7_hold.json | UPLOAD-TO-R2 | statistics/cached_simulation_7_hold.json.gz | 760014 | whole file |
| lib/data/statistics/cached_simulation_14.json | UPLOAD-TO-R2 | statistics/cached_simulation_14.json.gz | 1449919 | whole file |
| lib/data/statistics/cached_simulation_14_bet.json | UPLOAD-TO-R2 | statistics/cached_simulation_14_bet.json.gz | 1448976 | whole file |
| lib/data/statistics/cached_simulation_14_hold.json | UPLOAD-TO-R2 | statistics/cached_simulation_14_hold.json.gz | 1444511 | whole file |
| lib/data/statistics/cached_simulation_30.json | UPLOAD-TO-R2 | statistics/cached_simulation_30.json.gz | 2882770 | whole file |
| lib/data/statistics/cached_simulation_30_bet.json | UPLOAD-TO-R2 | statistics/cached_simulation_30_bet.json.gz | 2880909 | whole file |
| lib/data/statistics/cached_simulation_30_hold.json | UPLOAD-TO-R2 | statistics/cached_simulation_30_hold.json.gz | 2871599 | whole file |
| lib/data/statistics/cached_simulation_60.json | UPLOAD-TO-R2 | statistics/cached_simulation_60.json.gz | 5590156 | whole file |
| lib/data/statistics/cached_simulation_60_bet.json | UPLOAD-TO-R2 | statistics/cached_simulation_60_bet.json.gz | 5586487 | whole file |
| lib/data/statistics/cached_simulation_60_hold.json | UPLOAD-TO-R2 | statistics/cached_simulation_60_hold.json.gz | 5568185 | whole file |
| lib/data/statistics/cached_simulation_90_bet.json | UPLOAD-TO-R2 | statistics/cached_simulation_90_bet.json.gz | 8197354 | whole file |
| lib/data/statistics/cached_simulation_90_hold.json | UPLOAD-TO-R2 | statistics/cached_simulation_90_hold.json.gz | 8169974 | whole file |
| lib/data/statistics/cached_simulation_180.json | UPLOAD-TO-R2 | statistics/cached_simulation_180.json.gz | 2016591 | whole file |
| lib/data/statistics/cached_simulation_180_bet.json | UPLOAD-TO-R2 | statistics/cached_simulation_180_bet.json.gz | 2005757 | whole file |
| lib/data/statistics/cached_simulation_180_hold.json | UPLOAD-TO-R2 | statistics/cached_simulation_180_hold.json.gz | 1951408 | whole file |
| lib/data/statistics/cached_simulation_365.json | UPLOAD-TO-R2 | statistics/cached_simulation_365.json.gz | 3955581 | whole file |
| lib/data/statistics/cached_simulation_365_bet.json | UPLOAD-TO-R2 | statistics/cached_simulation_365_bet.json.gz | 3933642 | whole file |
| lib/data/statistics/cached_simulation_365_hold.json | UPLOAD-TO-R2 | statistics/cached_simulation_365_hold.json.gz | 3823827 | whole file |
| lib/data/statistics/daily_locked_bets_registry.json | MERGE-PER-DATE | statistics/daily_locked_bets_registry.json | 2020219 | LOCAL-WINS: 2026-10-12,2026-10-15,2026-10-16,2026-10-17,2026-10-18,2026-10-19,2026-10-20; R2-WINS: 2026-10-26,2026-10-27; other 33 dates identical |
| lib/data/statistics/cached_prediction_history.json | MERGE-PER-DATE | statistics/cached_prediction_history.json.gz | 3667137 | LOCAL-WINS: runs with predictionDate < 2026-07-28 (27 runs locally) + any local-only date in overlap (verify against live R2 at apply); R2-WINS: runs after 2026-10-21 through 2026-10-27 |
| lib/data/statistics/cached_de_dropoff_merge_shadow.json | MERGE-PER-DATE | statistics/cached_de_dropoff_merge_shadow.json | 278398 | NEEDS-REVIEW: merge settledLedger by date, local wins for its dates, preserve R2-only all2026Ledger scope; do NOT whole-file upload |
| lib/data/statistics/cached_daily_method_advisor.json | DISCARD | statistics/cached_daily_method_advisor.json | 53913092 | R2 wins (newer) |
| lib/data/statistics/cached_loto_live_predictions.json | DISCARD | statistics/cached_loto_live_predictions.json.gz | 23814164 | R2 wins (newer) |
| lib/data/statistics/cached_loto_prediction.json | DISCARD | statistics/cached_loto_prediction.json.gz | 23837612 | R2 wins (newer) |
| lib/data/statistics/cached_prediction_history_performance_2026.json | DISCARD | statistics/cached_prediction_history_performance_2026.json.gz | 590081 | R2 wins (newer) |
| lib/data/statistics/cached_probability_distribution.json | DISCARD | statistics/cached_probability_distribution.json.gz | 1646242 | R2 wins (newer) |
| lib/data/statistics/cached_probability_score.json | DISCARD | statistics/cached_probability_score.json.gz | 799346 | R2 wins (newer) |
| lib/data/statistics/cached_suggestions.json | DISCARD | statistics/cached_suggestions.json.gz | 297817 | R2 wins by default (undetermined) |
| lib/data/statistics/chain_frequency_frequency_potential_0_exclude3_0.json | DISCARD | statistics/chain_frequency_frequency_potential_0_exclude3_0.json.gz | 331094 | R2 wins by timestamp; chainRows discrepancy needs review |
| lib/data/statistics/chain_frequency_frequency_potential_1_exclude3_0.json | DISCARD | statistics/chain_frequency_frequency_potential_1_exclude3_0.json.gz | 331093 | R2 wins by timestamp; chainRows discrepancy needs review |
| lib/data/statistics/chain_frequency_risk_potential_0_exclude3_0.json | DISCARD | statistics/chain_frequency_risk_potential_0_exclude3_0.json.gz | 331089 | R2 wins by timestamp; chainRows discrepancy needs review |
| lib/data/statistics/chain_frequency_risk_potential_1_exclude3_0.json | DISCARD | statistics/chain_frequency_risk_potential_1_exclude3_0.json.gz | 331088 | R2 wins by timestamp; chainRows discrepancy needs review |
| lib/data/statistics/number_stats.json | DISCARD | statistics/number_stats.json.gz | 4559276 | R2 wins by default (undetermined) |
| lib/data/statistics/quick_stats_keys.json | DISCARD | statistics/quick_stats_keys.json.gz | 2176665 | R2 wins by default (undetermined) |
| lib/data/xsmb-2-digits.json | DISCARD | data/xsmb-2-digits.json.gz | 2994399 | R2 wins (newer by 1 draw) |
| lib/data/statistics/cached_advisor_long_horizon_research.json | DISCARD | statistics/cached_advisor_long_horizon_research.json.gz | 1440712 | identical on R2 (no-op) |
| lib/data/statistics/cached_exclusion_tier_audit.json | DISCARD | statistics/cached_exclusion_tier_audit.json.gz | 5221 | identical on R2 (no-op) |
| lib/data/statistics/cached_lo_dropoff_27_shadow.json | DISCARD | statistics/cached_lo_dropoff_27_shadow.json | 961431 | identical on R2 (no-op) |
| lib/data/statistics/cached_profit_report_2026.json | DISCARD | statistics/cached_profit_report_2026.json.gz | 198016 | identical on R2 (no-op) |
| lib/data/statistics/cached_simulation_90.json | DISCARD | statistics/cached_simulation_90.json.gz | 3223916 | identical on R2 (no-op) |
| data/daily_locked_bets_registry.json | DISCARD | statistics/daily_locked_bets_registry.json | 2020219 | duplicate of lib copy; covered by registry MERGE-PER-DATE; do NOT upload separately |
