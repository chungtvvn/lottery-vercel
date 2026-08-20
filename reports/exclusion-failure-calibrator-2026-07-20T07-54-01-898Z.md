# Failure-risk calibrator - strict PIT

- Baseline: ChainSmallFirst Hold70, 30 số, 1000K/số, ăn 84.
- Train 2014-2020 sampled; chọn cấu hình riêng trên 2021, 2022, 2023; test 2024-2025; holdout 2026 full daily.
- Mô hình học nguy cơ một số bị loại nhưng lại về, dùng Beta shrinkage và bằng chứng candidate đã khử trùng.
- Giữ nguyên 30 số; chỉ swap số có nguy cơ failure cao vào dàn đánh.

| Giai đoạn / phương pháp | Ngày | Trúng | Tỷ lệ | Profit | ROI | Thua dài nhất | TB swap |
|---|---:|---:|---:|---:|---:|---:|---:|
| Test baseline | 74 | 23 | 31.08% | -288.000K | -12.97% | 15 | 0.00 |
| Test candidate | 74 | 23 | 31.08% | -288.000K | -12.97% | 15 | 3.00 |
| Holdout 2026 baseline | 191 | 68 | 35.60% | -18.000K | -0.31% | 9 | 0.00 |
| Holdout 2026 candidate | 191 | 68 | 35.60% | -18.000K | -0.31% | 10 | 3.00 |

- Cấu hình đã chọn trước test: `failure-cal-p1000-s3-m0`.
- Paired test: candidate-only 1, baseline-only 1.
- Paired holdout: candidate-only 5, baseline-only 5.
- Quyết định: **research-only-do-not-promote**.

