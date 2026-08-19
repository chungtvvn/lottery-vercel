# Selection and distribution research

Read this reference when changing probability-score, daily-advisor, method fusion, semantic number groups, or skip-day logic.

## Semantic number distributions

Model each axis as a mutually exclusive partition of `00..99`. Suitable axes include number parity, head/tail parity, head/tail size, head, tail, digit sum, digit difference, and number class. Validate that every number belongs to exactly one category per axis before training.

Include coarse ranges such as `00–24`, `25–49`, `50–74`, and `75–99` only as a separate complete partition. Related axes are not independent: head/tail, parity combinations, sum/difference, and coarse ranges may encode overlapping digit information. Assign them to correlation families and normalize the total contribution inside each family before summing evidence.

For prediction day `D`, update the model only through `D-1`. Useful evidence may include:

- a smoothed one-step transition from the latest category;
- a smoothed two-state context from the two latest categories;
- a recent residual against the long-run category rate;
- prequential log-lift or log-loss proving that the signal helped before `D`.

Shrink sparse contexts toward their one-step transition and long-run base rate. If reliability and score spread are below configured gates, emit `abstained: true` and no numbers. Never let a tie produce the artificial list `00..29` or another order-based fallback.

For every displayed category report structural share, historical empirical share, recent-window share, smoothed transition probability, two-state context probability, forecast probability, sample count, and prequential reliability. A probability chart must distinguish category probability from per-number hit probability.

Useful visual diagnostics include:

- a 10×10 number matrix colored by relative rank, never labelled as absolute probability;
- side-by-side historical, recent, and forecast bars for one selected semantic axis;
- a four-outcome method matrix showing both-hit, only-left, only-right, and neither;
- reliability and sample-size labels beside every transition/context forecast.

Do not treat semantic distribution evidence as independent from chain evidence until a fixed holdout confirms incremental value. Evaluate a standalone lane and a fusion lane separately.

## Selecting among issued methods

The selector may only choose from dàn stored in the immutable snapshot for that prediction date. It must not regenerate an old candidate from current statistics or copy the one production dàn under multiple method labels.

Assess complementarity with:

- both methods hit;
- only the left method hits;
- only the right method hits;
- neither method hits;
- average number-set overlap;
- conditional performance after a prior method miss, using only earlier transitions.

Do not infer alternating behavior from a chart or a short winning run. A handoff policy needs Bayesian shrinkage, a minimum transition sample, and an untouched calendar holdout. If those conditions fail, retain the locked production dàn and label the policy research-only.

When methods appear to alternate, compare the proposed handoff rule against always-left, always-right, prior-only selector, and fixed-count consensus on exactly the same dates. Update the handoff state only after the previous result settles. Report how often the rule changed methods, its conditional sample, Wilson lower bound, and worst calendar period; otherwise the alternation is descriptive only.

When fusing methods at a fixed bet count, compare at least:

- selection of one complete issued dàn;
- rank-weighted consensus at the same count;
- a complementarity-aware selector;
- the unmodified production baseline.

Never compare a 30-number selector with a larger union without explicitly changing the economics and audit mode.

## Skip-day and evidence gates

For fixed 30-number Đề at payout `84`, the point hit-rate break-even is `30/84`. A skip-day candidate should normally require all of these from data before `D`:

- adequate observations in the matching context;
- posterior mean above break-even;
- conservative Wilson lower bound near or above break-even;
- positive validation profit in a separate calendar regime;
- no material deterioration in longest loss streak.

Track skipped dates separately. Report coverage and profit across the complete evaluation window, not only conditional hit rate on issued days.

## Immutable and leakage tests

Tests for selection and distribution work must cover these invariants:

1. Changing a result after prediction date `D` cannot change the dàn or decision for `D`.
2. An unresolved result is never converted to `00`.
3. A settled snapshot keeps its originally issued numbers and method ID.
4. Missing candidate methods remain missing; they are not relabelled from the production dàn.
5. Abstention never creates stake, win, or loss.
6. Every daily feature is derived from raw rows or snapshots strictly before `D`.

## R2 and runtime boundaries

R2 is the operational source of truth. Keep the daily action bounded: settle immutable ledgers, compute the next snapshot, and upload compact caches. Run multi-year strict-PIT research separately or on demand, then upload only its compact report when requested. A research timeout must not block settlement of Đề/Lô predictions or the next-day snapshot.
