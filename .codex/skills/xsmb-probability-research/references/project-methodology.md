# Project methodology

## Prediction unit

- **Đề:** one row per draw date, rank numbers `00..99`, exclude `target` numbers, and settle against the two final digits of the special prize.
- **Lô:** repeat the same chain logic independently for each of 27 prize positions, then aggregate position-level survivors into top 3–7 numbers.

## Allowed pre-result inputs

Use fields emitted by `annualMilestoneService.buildCandidatesForDate`:

- `key`, `numbers`, `isPotential`, `tier`
- `currentLen`, `baseLen`, `targetLen`, `recordLen`
- `currentCount`, `nextCount`
- `riskRate`, `exposureFrequencyPerYear`
- `neverFormed`, `isRecordOrSuper`

The annual baseline must end before the evaluated prediction year. Daily chain state may only use draws before the prediction date.

The precomputed streak files are unsafe for historical evaluation when their pattern identity or
active-date membership was inferred using later draws. For strict evaluation, regenerate number,
head-tail, and sum-difference statistics from the raw prefix before each prediction date. A
full-history index filtered by `endDate` is not equivalent.

## Posterior chain risk

For a chain with `n=currentCount`, `c=nextCount`, and `b=n-c` breaks:

```text
posterior_break = (b + alpha) / (n + alpha + beta)
```

Use stronger break priors only for semantically justified states such as never-formed or record/super-record. Always combine the posterior mean with a conservative lower bound and sample reliability.

## Correlation control

Many generated keys describe the same or nearly identical number set. Blind summation inflates confidence.

1. Deduplicate exact number sets within a pattern family.
2. Retain the strongest evidence from each family.
3. Aggregate only the top diverse families with decreasing weights.
4. Cap consensus bonuses.

Recommended families: block rhythm, fixed set, number, head, tail, head-tail, sum, difference, parity/size, and other.

## Evaluation

Use untouched holdout dates and compare the same rows:

- Đề baseline: current production Hold 70.
- Lô baseline: current production per-position strategy, hold, aggregation mode, and top count.
- Report both probability metrics and money metrics.
- Reject a comparison if row counts, date range, stake, payout, hold, or bet count differ.
- Report the break-even hit rate (`bet_count / payout_multiplier`) beside the observed hit rate.
- Use multiple calendar years or rolling-origin folds. Do not select a method on the same year used
  for the headline result.
- Apply a multiple-testing correction or confirm the winner on a second untouched regime when many
  strategies or hyperparameters were tried.
- Treat a method as unstable when the winning strategy changes sharply across years.

Do not interpret lottery draws as a conventional trend-following time series. Models may rank historical pattern evidence, but no method can establish guaranteed future profit.
