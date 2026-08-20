# Online membership ranker - strict PIT

Generated: 2026-07-18T07:26:20.951Z

## Protocol

- Predictions are made before the same-day result updates model weights.
- Config and bet count are selected only on 2017-2020 by worst annual profit.
- 2016 is warm-up; 2021-2022 validation; 2023-2025 frozen test; 2026 final holdout.
- Payout x84, stake 1000K per number.

## Selected candidate

- pair-number:bet10
- Bet count: 10

| Period | Hit rate | Profit K | Positive years | Worst year K |
|---|---:|---:|---:|---:|
| warmup | 12.98% | 328,000 | 1/1 | 328,000 |
| fit | 10.12% | -2,134,000 | 1/4 | -964,000 |
| validation | 9.70% | -1,340,000 | 0/2 | -1,258,000 |
| test | 9.96% | -1,768,000 | 0/3 | -764,000 |
| holdout | 13.90% | 314,000 | 1/1 | 314,000 |

## Annual results

| Year | Days | Wins | Hit rate | Profit K | ROI |
|---|---:|---:|---:|---:|---:|
| 2016 | 362 | 47 | 12.98% | 328,000 | 9.06% |
| 2017 | 361 | 32 | 8.86% | -922,000 | -25.54% |
| 2018 | 361 | 39 | 10.80% | -334,000 | -9.25% |
| 2019 | 361 | 44 | 12.19% | 86,000 | 2.38% |
| 2020 | 340 | 29 | 8.53% | -964,000 | -28.35% |
| 2021 | 361 | 28 | 7.76% | -1,258,000 | -34.85% |
| 2022 | 361 | 42 | 11.63% | -82,000 | -2.27% |
| 2023 | 361 | 34 | 9.42% | -754,000 | -20.89% |
| 2024 | 362 | 34 | 9.39% | -764,000 | -21.10% |
| 2025 | 361 | 40 | 11.08% | -250,000 | -6.93% |
| 2026 | 187 | 26 | 13.90% | 314,000 | 16.79% |

## Evidence diagnostics

| Year | Actual avg votes | All-number avg votes | Vote lift | No-vote actual | Ex-post best fixed | Profit K |
|---|---:|---:|---:|---:|---|---:|
| 2016 | 3.62 | 3.60 | 1.006 | 14.36% | numberConsensusRisk | -696,000 |
| 2017 | 3.77 | 3.60 | 1.046 | 12.47% | activeOnlyAvgRisk | 846,000 |
| 2018 | 3.37 | 3.60 | 0.936 | 14.40% | chainFreqFirst | -1,170,000 |
| 2019 | 3.46 | 3.60 | 0.961 | 16.34% | dedupEdge50CombinedB40S05 | -1,170,000 |
| 2020 | 3.63 | 3.60 | 1.009 | 12.35% | chainBlockFirst | -624,000 |
| 2021 | 3.55 | 3.60 | 0.985 | 13.30% | numberLikelihoodRatio | -918,000 |
| 2022 | 3.46 | 3.60 | 0.962 | 15.79% | chainSmallFirst | -1,338,000 |
| 2023 | 3.78 | 3.60 | 1.051 | 15.24% | chainCredibleFirst | 6,000 |
| 2024 | 3.59 | 3.60 | 0.997 | 12.71% | activeOnlyAvgRisk | -780,000 |
| 2025 | 3.63 | 3.60 | 1.009 | 15.79% | dedupEdge50Hold | -1,002,000 |
| 2026 | 4.04 | 3.60 | 1.122 | 18.72% | chainSmallFirst | 102,000 |

Candidates positive in every fit year: **0/72**.
Candidates positive in every validation, test and holdout year after fit selection: **0**.

Decision: **do-not-promote**

