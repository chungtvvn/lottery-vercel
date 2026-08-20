# Online membership ranker - strict PIT

Generated: 2026-07-18T07:22:06.289Z

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

Decision: **do-not-promote**

