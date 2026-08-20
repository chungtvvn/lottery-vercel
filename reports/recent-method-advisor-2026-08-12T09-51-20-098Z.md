# Bộ chọn phương pháp theo hiệu quả gần đây (strict PIT)

- Dữ liệu: 2016-01-01 -> 2026-07-10, 3778 ngày, 13 phương pháp, mỗi dàn 30 số.
- Hòa vốn với ăn 84: 35.71%.
- Mỗi lựa chọn ngày D dùng kết quả đã chốt trước D; không dùng kết quả D hay dữ liệu tương lai.

## Xếp hạng hiện tại theo Wilson 90% one-sided

### 30 ngày

| Phương pháp | Trúng/mẫu | Posterior | Wilson lower |
|---|---:|---:|---:|
| chainSmallFirst | 11/30 | 33.33% | 23.86% |
| dedupEdge50Hold | 11/30 | 33.33% | 23.86% |
| chainCredibleFirst | 10/30 | 31.67% | 21.08% |
| dedupEdge50CombinedB40S05 | 10/30 | 31.67% | 21.08% |
| numberPosteriorDiversity | 10/30 | 31.67% | 21.08% |

### 90 ngày

| Phương pháp | Trúng/mẫu | Posterior | Wilson lower |
|---|---:|---:|---:|
| chainSmallFirst | 33/90 | 35.00% | 28.81% |
| dedupEdge50CombinedB40S05 | 33/90 | 35.00% | 28.81% |
| dedupEdge50Hold | 33/90 | 35.00% | 28.81% |
| numberWeightedRisk | 32/90 | 34.17% | 27.79% |
| numberConsensusRisk | 29/90 | 31.67% | 24.74% |

### 180 ngày

| Phương pháp | Trúng/mẫu | Posterior | Wilson lower |
|---|---:|---:|---:|
| chainSmallFirst | 65/180 | 35.24% | 30.47% |
| numberWeightedRisk | 65/180 | 35.24% | 30.47% |
| numberAvgRisk | 64/180 | 34.76% | 29.94% |
| chainCredibleFirst | 63/180 | 34.29% | 29.41% |
| numberConsensusRisk | 63/180 | 34.29% | 29.41% |

## Kiểm định bộ chọn

| Cấu hình | Validation 2024-2025 profit | Holdout 2026 profit | Holdout trúng | Ngày đánh holdout |
|---|---:|---:|---:|---:|
| posterior-30 | -3.714.000K | -402.000K | 33.16% | 187 |
| wilson-30 | -3.714.000K | -402.000K | 33.16% | 187 |
| wilson-gated-30 | -180.000K | -12.000K | 35.29% | 34 |
| posterior-90 | -2.538.000K | -990.000K | 29.41% | 187 |
| wilson-90 | -2.538.000K | -990.000K | 29.41% | 187 |
| wilson-gated-90 | 192.000K | -168.000K | 28.57% | 28 |
| posterior-180 | -2.622.000K | -1.410.000K | 26.74% | 187 |
| wilson-180 | -2.622.000K | -1.410.000K | 26.74% | 187 |
| wilson-gated-180 | 0K | 0K | 0.00% | 0 |

## Kết luận: no-recent-window-selector-clears-independent-profit-gates

Điểm Scoring hiện tại không được dùng trực tiếp: các nhóm số chồng lấp và score tần suất thô chưa phải feature strict PIT. Chỉ xem xét sau khi xây dựng feature snapshot D-1, khử trùng nhóm và hiệu chỉnh out-of-sample.
