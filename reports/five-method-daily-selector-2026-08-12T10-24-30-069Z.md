# Bộ chọn một phương pháp trong Top 5 strict PIT

- Top 5 cố định từ 2016-2023: activeOnlyAvgRisk, chainBlockFirst, numberLikelihoodRatio, chainFreqFirst, chainRiskFirst.
- “Ít nhất một phương pháp trúng” là benchmark oracle hậu nghiệm, không dùng làm khuyến nghị trước ngày quay.

| Giai đoạn | Oracle ít nhất một trúng | Union TB số | Hòa vốn union |
|---|---:|---:|---:|
| train | 1895/2868 (66.07%) | 64.85 | 77.20% |
| validation | 466/723 (64.45%) | 62.83 | 74.80% |
| holdout | 111/187 (59.36%) | 61.35 | 73.03% |

## Cấu hình chọn từ train

- wilson-gated-60; kết luận: no-single-method-selector-clears-independent-profit-gates.
| Giai đoạn | Ngày đánh | Trúng | Tỷ lệ | Profit | ROI | W/L dài nhất |
|---|---:|---:|---:|---:|---:|---:|
| train | 72/2868 | 27 | 37.50% | 108.000K | 5.00% | 4/5 |
| validation | 23/723 | 7 | 30.43% | -102.000K | -14.78% | 2/10 |
| holdout | 0/187 | 0 | 0.00% | 0K | 0.00% | 0/0 |

## Tất cả cấu hình

| Cấu hình | Validation profit | Holdout profit | Holdout hit | Holdout ngày đánh |
|---|---:|---:|---:|---:|
| posterior-30 | -2.202.000K | -990.000K | 29.41% | 187 |
| wilson-30 | -2.202.000K | -990.000K | 29.41% | 187 |
| wilson-gated-30 | -222.000K | -30.000K | 0.00% | 1 |
| posterior-60 | -2.454.000K | -822.000K | 30.48% | 187 |
| wilson-60 | -2.454.000K | -822.000K | 30.48% | 187 |
| wilson-gated-60 | -102.000K | 0K | 0.00% | 0 |
| posterior-90 | -2.286.000K | -990.000K | 29.41% | 187 |
| wilson-90 | -2.286.000K | -990.000K | 29.41% | 187 |
| wilson-gated-90 | 192.000K | -66.000K | 20.00% | 5 |
| posterior-180 | -2.538.000K | -1.242.000K | 27.81% | 187 |
| wilson-180 | -2.538.000K | -1.242.000K | 27.81% | 187 |
| wilson-gated-180 | 0K | 0K | 0.00% | 0 |
