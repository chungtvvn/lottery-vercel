---
name: xsmb-probability-research
description: Design, implement, and validate probability-ranking or method-selection research for the XSMB project using active/potential chain evidence, annual 20-year baselines, immutable predictions, semantic number partitions, and point-in-time backtests. Use for new Đề or Lô strategies, Bayesian shrinkage, probability calibration, chain deduplication, method complementarity, abstention gates, walk-forward evaluation, leakage audits, or comparisons against current production methods.
---

# XSMB Probability Research

Build research methods without contaminating future information or rewriting issued predictions.

## Required workflow

1. Read `references/project-methodology.md`.
2. For number-distribution, daily-advisor, or method-fusion work, also read `references/selection-and-distribution.md`.
3. Identify the exact baseline, date range, stake, payout, target hold, selection count, and Lô aggregation mode.
4. Reuse `annualMilestoneService.buildCandidatesForDate`; do not create a second chain parser.
5. Verify the chain-statistics index itself was generated only from draws before the prediction date.
6. Derive scores only from candidate fields available before the prediction date.
7. Deduplicate equivalent number sets and limit correlated evidence by pattern family.
8. Treat `abstain` as a first-class decision. Do not synthesize a default dàn when evidence is absent.
9. Add a named non-default strategy. Do not replace production defaults before validation.
10. Run deterministic unit tests, including future-mutation and immutable-ledger checks.
11. Run point-in-time backtests with identical dates and economics for baseline and candidate.
12. Run at least two calendar-regime checks before treating a profitable period as stable.
13. Use `.codex/skills/xsmb-probability-research/scripts/audit-backtest-report.js` to reject mismatched comparisons.
14. Promote only when the candidate improves holdout performance without materially worsening loss streaks.

## Strict point-in-time rule

Do not treat date filtering on a full-history streak index as point-in-time safety. A streak may be
classified only because later draws completed its pattern.

- Regenerate statistics from the raw-data prefix ending before each prediction date, or load an
  immutable snapshot proven to have been generated at that time.
- Generate the annual baseline from data ending on 31 December before the prediction year.
- Compare a sample of full-index and regenerated predictions. Large dàn changes indicate leakage.
- Reject model results trained on leaked candidates even if shifted-date checks look good.

Pass `allow-aggregation-change` as the final audit argument only when the aggregation algorithm itself is the tested variable; dates, Hold, bet count, and stake must still match.

## Statistical rules

- Smooth small samples. Never rank raw `100%` from one or two observations as certainty.
- Prefer posterior distributions or conservative lower bounds over point estimates.
- Evaluate Đề with hit rate, profit, ROI, longest win/loss, and month/year stability.
- Evaluate Lô with hit-day rate, at-least-two-hit rate, average hits, profit, ROI, and longest under-two streak.
- Keep selection count fixed when comparing methods.
- Treat 2026 or another untouched period as holdout after weights are chosen.
- Account for trying multiple strategies. A nominal p-value from the best of many methods is not
  sufficient evidence without correction or a second untouched year.
- Require regime stability: report results by year and month, plus the worst year and worst month.
- Compute the break-even hit rate before model selection: `bet_count / payout_multiplier`.
- For online ensembles, update weights only after settling the current day and freeze hyperparameter selection before holdout.
- Calibrate probabilities with a proper score such as log-loss; do not select calibration temperature directly from holdout profit.
- For semantic groups, use mutually exclusive partitions that cover `00..99` exactly once per axis. Do not sum overlapping large and nested groups as independent evidence.
- For method selection, report pairwise same-hit, only-left, only-right, neither, and set overlap. A visually alternating short run is not evidence of a handoff rule.
- For abstaining strategies, report candidate days, issued days, coverage, conditional hit rate, and total profit. An abstained day is neither a win nor a loss.
- For adaptive Lô bet counts, compare against every fixed Top 3–7 baseline on the same dates.
- Report negative and null results. Do not tune repeatedly on the reported holdout.
- A profitable historical result is evidence, not a guarantee.

## Promotion gates

Require all of these before changing a default:

- Same settled dates and same stake/payout as baseline.
- No future result, full-history statistic, or post-settlement snapshot enters prediction features.
- At least one independent calendar regime remains profitable or improves hit rate after selection.
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

# Semantic number-partition model and method-complementarity laboratory
npm run test:probability-distribution
npm run research:probability-distribution
npm run test:advisor-analysis

# Calibrated dynamic Đề cutoff
node scripts/research-posterior-calibrated-cutoff.js

# Strict point-in-time audit and strategy comparison
node scripts/audit-point-in-time-leakage.js
node scripts/research-true-pit-strategies.js \
  --startDate=2026-01-01 --endDate=2026-12-31 \
  --dateStep=1 --workers=8 --target=70 --minPotentialLen=4

# Regime-adaptive expert selected on earlier calendar years
node scripts/research-fixed-share-expert.js

# Adaptive Lô bet count from a detailed point-in-time report
node scripts/research-loto-adaptive-bet-count.js \
  --report=reports/backtest_loto_milestone20y_<timestamp>.json
```

Keep generated research reports under `reports/`; do not commit them unless explicitly requested.
