# Walk-forward membership model

- Decision: **do-not-promote**
- Selected without 2024+: **membership-l2-1-s5-m0**
- Validation delta: +13 hits; worst year +3
- Test 2024-2025: baseline 206/723, candidate 210/723, paired net +4
- Untouched 2026: baseline 68/187, candidate 61/187, paired net -7

## Annual results

| Regime | Year | Wins | Hit rate | Delta vs baseline | Profit |
|---|---:|---:|---:|---:|---:|
| Test | 2024 | 116/362 | 32.04% | +9 | -1.116.000K |
| Test | 2025 | 94/361 | 26.04% | -5 | -2.934.000K |
| Holdout | 2026 | 61/187 | 32.62% | -7 | -486.000K |

## Interpretation

The model is eligible for production only when it improves validation, both test years, and the untouched holdout without changing bet economics. A holdout-only gain is not sufficient.
