# SmallChainFirst Safety Refiner - strict PIT

- Chỉ dùng daily candidate diagnostics được sinh trước kết quả ngày dự đoán.
- Baseline cố định: ChainSmallFirst Hold70, đánh 30 số; candidate chỉ swap tối đa 1-3 số.
- Train: 2014-2020 sampled 10 ngày; chọn cấu hình: 2021-2023 sampled; test: 2024-2025 sampled; holdout: 2026 full-daily.

| Giai đoạn / phương pháp | Ngày | Trúng | Tỷ lệ | Profit | ROI | Chuỗi thua dài nhất | TB swap |
|---|---:|---:|---:|---:|---:|---:|---:|
| Test baseline | 74 | 23 | 31.08% | -288.000K | -12.97% | 15 | 0.00 |
| Test safety | 74 | 23 | 31.08% | -288.000K | -12.97% | 7 | 3.00 |
| Holdout 2026 baseline | 191 | 68 | 35.60% | -18.000K | -0.31% | 9 | 0.00 |
| Holdout 2026 safety | 191 | 65 | 34.03% | -270.000K | -4.71% | 12 | 3.00 |

- Cấu hình chọn trước test/holdout: `diag-safe-l2.01-lr.02-e80-s3`.
- Quyết định: **research-only-do-not-promote**.

