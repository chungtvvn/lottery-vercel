# Scorecard phương pháp và chuỗi loại trừ

## Nguyên tắc

- Tất cả dòng đánh giá là strict point-in-time; report fast/full-history bị loại.
- Phương pháp được chấm bằng posterior hit rate, cận bảo thủ, độ ổn định theo năm và phạt mức trùng dàn bằng Jaccard.
- Chuỗi được chấm bằng credible edge so với xác suất nền của đúng tập số, cỡ mẫu theo ngày và độ ổn định qua năm.
- Giữ đúng Hold70: đánh 30 số, 1.000K/số, ăn 84; hòa vốn 35,71%.

## Cấu hình được chọn trước test

Cấu hình: `p100-z0.67-t0.01-r0.75-e13`. Chọn trên 2021-2023, không dùng 2024-2026 để chọn.

| Giai đoạn | Ngày | Trúng | Tỷ lệ | Profit | ROI | Thua dài nhất |
|---|---:|---:|---:|---:|---:|---:|
| 2024-2025 walk-forward | 723 | 217 | 30.01% | -3.462.000K | -15.96% | 13 |
| 2026 frozen holdout | 187 | 59 | 31.55% | -654.000K | -11.66% | 10 |

## So với baseline tốt nhất cùng giai đoạn

| Giai đoạn | Candidate | Baseline | Δ trúng | Δ profit |
|---|---:|---:|---:|---:|
| 2024-2025 | 217/723 | chainBlockFirst: 234/723 | -17 | -1.428.000K |
| 2026 | 59/187 | chainSmallFirst: 68/187 | -9 | -756.000K |

## Điểm phương pháp dùng cho 2026

| Phương pháp | Posterior | Cận bảo thủ | Edge | Năm dương | Trùng lặp | Trọng số |
|---|---:|---:|---:|---:|---:|---:|
| activeOnlyAvgRisk | 31.29% | 30.78% | 0.78% | 5/10 | 0.00% | 27.38% |
| chainBlockFirst | 31.05% | 30.54% | 0.54% | 7/10 | 31.26% | 19.72% |
| chainFreqFirst | 30.43% | 29.92% | -0.08% | 6/10 | 33.74% | 9.83% |
| chainRiskFirst | 30.43% | 29.92% | -0.08% | 6/10 | 55.83% | 8.68% |
| numberLikelihoodRatio | 30.10% | 29.59% | -0.41% | 4/10 | 26.92% | 6.49% |
| numberConsensusRisk | 29.67% | 29.16% | -0.84% | 5/10 | 30.51% | 4.42% |
| dedupEdge50Hold | 29.59% | 29.08% | -0.92% | 5/10 | 24.10% | 4.24% |
| chainCredibleFirst | 29.64% | 29.14% | -0.86% | 4/10 | 35.24% | 3.90% |
| numberWeightedRisk | 29.37% | 28.87% | -1.13% | 5/10 | 23.81% | 3.42% |
| numberPosteriorDiversity | 29.45% | 28.95% | -1.05% | 4/10 | 32.07% | 3.29% |
| numberAvgRisk | 29.48% | 28.97% | -1.03% | 4/10 | 37.28% | 3.28% |
| dedupEdge50CombinedB40S05 | 29.26% | 28.76% | -1.24% | 4/10 | 28.34% | 2.79% |
| chainSmallFirst | 29.34% | 28.84% | -1.16% | 2/10 | 31.06% | 2.55% |

## Chuỗi có điểm chất lượng cao nhất (học trước 2026)

| Điểm | Cohort | Ngày mẫu | Nền | Posterior | Cận bảo thủ | Edge bảo thủ | Ổn định |
|---:|---|---:|---:|---:|---:|---:|---:|
| 100 | pattern|sum|downUpAlternation|active|below-record|w99|d5|g1 | 3 | 10.00% | 41.62% | 35.96% | 25.96% | 2/2 |
| 100 | pattern|difference|downUpAlternation|active|below-record|w99|d5|g1 | 6 | 19.33% | 41.87% | 36.27% | 16.93% | 2/2 |
| 100 | pattern|sum|down|active|below-record|w99|d3|g1 | 1 | 30.00% | 49.93% | 44.14% | 14.14% | 1/1 |
| 100 | pattern|sum|upDownAlternation|active|below-record|w99|d6p|g1 | 6 | 19.17% | 37.85% | 32.34% | 13.17% | 2/2 |
| 99 | pattern|difference|upDownAlternation|active|below-record|w99|d5|g1 | 3 | 27.33% | 43.70% | 38.00% | 10.67% | 2/2 |
| 99 | pattern|difference|downUpAlternation|active|below-record|w99|d6p|g1 | 6 | 30.00% | 46.02% | 40.36% | 10.36% | 2/2 |
| 93 | pattern|difference|upDownAlternation|active|below-record|w99|d4|g1 | 7 | 23.43% | 38.44% | 32.94% | 9.51% | 2/2 |
| 79 | pattern|sum|downUpAlternation|active|below-record|w99|d4|g1 | 11 | 27.09% | 39.72% | 34.27% | 7.18% | 2/2 |
| 78 | pattern|difference|upDownAlternation|active|below-record|w99|d6p|g1 | 8 | 33.25% | 46.08% | 40.46% | 7.21% | 2/2 |
| 72 | pattern|sum|up|active|below-record|w99|d2|g1 | 14 | 37.64% | 49.16% | 43.65% | 6.01% | 2/2 |
| 69 | pattern|difference|consecutive|active|super-record|w40|d6p|g1 | 1 | 60.00% | 71.90% | 66.69% | 6.69% | 1/1 |
| 67 | pattern|sum|upDownAlternation|active|below-record|w99|d4|g1 | 8 | 27.63% | 38.70% | 33.21% | 5.58% | 2/2 |
| 65 | pattern|difference|consecutive|active|near-record|w40|d6p|g1 | 1 | 62.00% | 73.15% | 68.01% | 6.01% | 1/1 |
| 65 | pattern|difference|other|active|near-record|w40|d3|g1 | 2 | 65.12% | 75.94% | 71.01% | 5.89% | 1/1 |
| 62 | family|difference|active|super-record|w40|d6p|g1 | 1 | 60.00% | 71.67% | 65.65% | 5.65% | 1/1 |
| 61 | pattern|sum|upDownAlternation|active|below-record|w99|d5|g1 | 5 | 31.50% | 42.16% | 36.53% | 5.03% | 2/2 |
| 59 | family|sum|active|below-record|w99|d6p|g1 | 12 | 28.57% | 38.91% | 32.76% | 4.19% | 2/2 |
| 58 | family|difference|active|near-record|w40|d6p|g1 | 1 | 62.00% | 72.92% | 66.99% | 4.99% | 1/1 |
| 55 | pattern|sum|downUpAlternation|active|below-record|w99|d6p|g1 | 6 | 28.33% | 37.85% | 32.34% | 4.01% | 2/2 |
| 54 | family|difference|active|near-record|w40|d3|g1 | 2 | 65.67% | 75.65% | 69.95% | 4.28% | 1/1 |
| 50 | pattern|block|blockAlternation|active|below-record|w99|d5|g1 | 49 | 34.05% | 40.79% | 35.97% | 1.92% | 2/2 |
| 49 | pattern|head-tail|alternation|potential|at-record|w05|d3|g2 | 44 | 96.00% | 98.91% | 97.87% | 1.87% | 2/2 |
| 47 | pattern|sum|upDownAlternation|active|below-record|w20|d4|g1 | 3 | 80.00% | 86.97% | 83.09% | 3.09% | 2/2 |
| 47 | pattern|sum|down|active|below-record|w99|d2|g1 | 18 | 40.89% | 48.46% | 43.03% | 2.14% | 2/2 |
| 46 | pattern|tail|pairAlternation|potential|below-record|w40|d4|g1 | 19 | 60.00% | 67.10% | 62.01% | 2.01% | 2/2 |

## Quyết định

**do-not-promote**

Scorecard chưa vượt baseline tốt nhất ổn định ở cả hai chế độ. Giữ research-only; dùng bảng điểm chuỗi để giải thích và thu thập thêm bằng chứng, không ghi đè dự đoán đã phát hành.

> Score cao là bằng chứng lịch sử đã hiệu chỉnh, không phải xác suất chắc chắn hay bảo đảm lợi nhuận tương lai.
