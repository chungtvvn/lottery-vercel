---
name: xsmb-probability-research
description: Design, implement, and validate probability-ranking methods for the XSMB project using active/potential chain evidence, annual 20-year baselines, immutable predictions, and point-in-time backtests. Use for new Đề or Lô strategies, Bayesian shrinkage, probability calibration, chain deduplication, walk-forward evaluation, leakage audits, or comparisons against current production methods.
---

# XSMB Probability Research

Build research methods without contaminating future information or rewriting issued predictions.

## Required workflow

1. Read `references/project-methodology.md`.
2. Identify the exact baseline, date range, stake, payout, target hold, and Lô aggregation mode.
3. Reuse `annualMilestoneService.buildCandidatesForDate`; do not create a second chain parser.
4. Derive scores only from candidate fields available before the prediction date.
5. Deduplicate equivalent number sets and limit correlated evidence by pattern family.
6. Add a named non-default strategy. Do not replace production defaults before validation.
7. Run a deterministic unit test.
8. Run point-in-time backtests with identical dates and economics for baseline and candidate.
9. Use `.codex/skills/xsmb-probability-research/scripts/audit-backtest-report.js` to reject mismatched comparisons.
10. Promote only when the candidate improves holdout performance without materially worsening loss streaks.

Pass `allow-aggregation-change` as the final audit argument only when the aggregation algorithm itself is the tested variable; dates, Hold, bet count, and stake must still match.

## Statistical rules

- Smooth small samples. Never rank raw `100%` from one or two observations as certainty.
- Prefer posterior distributions or conservative lower bounds over point estimates.
- Evaluate Đề with hit rate, profit, ROI, longest win/loss, and month/year stability.
- Evaluate Lô with hit-day rate, at-least-two-hit rate, average hits, profit, ROI, and longest under-two streak.
- Keep selection count fixed when comparing methods.
- Treat 2026 or another untouched period as holdout after weights are chosen.
- For online ensembles, update weights only after settling the current day and freeze hyperparameter selection before holdout.
- Calibrate probabilities with a proper score such as log-loss; do not select calibration temperature directly from holdout profit.
- For adaptive Lô bet counts, compare against every fixed Top 3–7 baseline on the same dates.
- Report negative and null results. Do not tune repeatedly on the reported holdout.
- A profitable historical result is evidence, not a guarantee.

## Promotion gates

Require all of these before changing a default:

- Same settled dates and same stake/payout as baseline.
- No future result, full-history statistic, or post-settlement snapshot enters prediction features.
- Candidate profit and hit rate improve on holdout, or one improves materially without unacceptable degradation in the other.
- Longest loss does not increase by more than 20% unless profit improvement is substantial.
- Daily predictions remain immutable after publication.
- New strategy has a stable ID, explanation, tests, and cache version.

## Project commands

```bash
# Đề variants
node scripts/research-milestone20y-variants.js \
  --startDate=2026-01-01 --targets=70

# Lô, same period and economics
node scripts/backtest-loto-milestone20y.js \
  --startDate=2026-01-01 --endDate=YYYY-MM-DD \
  --strategies=chainSmallFirst,numberPosteriorDiversity \
  --holds=65,70 --betCounts=3,4,5,6,7 \
  --aggregationModes=twoHitGreedy \
  --stakeK=2200 --payoutK=8000

# Online Đề ensemble, train through 2025 and freeze before 2026
node scripts/research-online-expert-ensemble.js

# Calibrated dynamic Đề cutoff
node scripts/research-posterior-calibrated-cutoff.js

# Adaptive Lô bet count from a detailed point-in-time report
node scripts/research-loto-adaptive-bet-count.js \
  --report=reports/backtest_loto_milestone20y_<timestamp>.json
```

Keep generated research reports under `reports/`; do not commit them unless explicitly requested.
