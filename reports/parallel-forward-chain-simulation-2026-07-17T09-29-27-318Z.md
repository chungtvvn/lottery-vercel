# Forward simulation tái sinh chuỗi Đề Song song

- Raw thật R2: 2005-10-01 -> 2026-07-16 (7.493 ngày).
- Baseline khóa: 2006-01-01 -> 2025-12-31.
- 1 path/model × 4 model × 1825 ngày = 7.300 ngày giả lập.
- Tái sinh pattern với lookback 200 ngày sau từng kết quả; 4 worker.
- Số đường mô phỏng không phải mẫu lịch sử mới và không chứng minh khả năng dự đoán.

## Audit xấp xỉ so với full-prefix

- Block Jaccard: 100.00%.
- Small Jaccard: 100.00%.
- Union Jaccard: 100.00%.
- Trạng thái: đạt ngưỡng nghiên cứu.

## Kết quả theo mô hình sinh tương lai

| Mô hình | Hit hợp | Hit giao | Số hợp | Số giao | x | P(profit>0) | Profit P05 | Profit giữa | Profit P95 | ROI TB | DD P95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| uniform | 43.67% | 6.30% | 43.75 | 6.25 | x1 | 0.00% | -12.889.000K | -12.889.000K | -12.889.000K | -16.14% | 13.062.000K |
| uniform | 43.67% | 6.30% | 43.75 | 6.25 | x2 | 0.00% | -14.642.000K | -14.642.000K | -14.642.000K | -16.05% | 15.056.000K |
| uniform | 43.67% | 6.30% | 43.75 | 6.25 | x3 | 0.00% | -16.395.000K | -16.395.000K | -16.395.000K | -15.97% | 17.362.000K |
| uniform | 43.67% | 6.30% | 43.75 | 6.25 | x4 | 0.00% | -18.148.000K | -18.148.000K | -18.148.000K | -15.91% | 19.668.000K |
| frequency-posterior | 43.51% | 5.92% | 43.57 | 6.43 | x1 | 0.00% | -12.822.000K | -12.822.000K | -12.822.000K | -16.12% | 13.050.000K |
| frequency-posterior | 43.51% | 5.92% | 43.57 | 6.43 | x2 | 0.00% | -15.482.000K | -15.482.000K | -15.482.000K | -16.97% | 15.856.000K |
| frequency-posterior | 43.51% | 5.92% | 43.57 | 6.43 | x3 | 0.00% | -18.142.000K | -18.142.000K | -18.142.000K | -17.62% | 18.680.000K |
| frequency-posterior | 43.51% | 5.92% | 43.57 | 6.43 | x4 | 0.00% | -20.802.000K | -20.802.000K | -20.802.000K | -18.13% | 21.522.000K |
| markov-posterior | 42.58% | 6.30% | 43.37 | 6.63 | x1 | 0.00% | -13.879.000K | -13.879.000K | -13.879.000K | -17.54% | 13.922.000K |
| markov-posterior | 42.58% | 6.30% | 43.37 | 6.63 | x2 | 0.00% | -16.322.000K | -16.322.000K | -16.322.000K | -17.89% | 16.440.000K |
| markov-posterior | 42.58% | 6.30% | 43.37 | 6.63 | x3 | 0.00% | -18.765.000K | -18.765.000K | -18.765.000K | -18.16% | 18.967.000K |
| markov-posterior | 42.58% | 6.30% | 43.37 | 6.63 | x4 | 0.00% | -21.208.000K | -21.208.000K | -21.208.000K | -18.37% | 21.508.000K |
| block-bootstrap | 43.84% | 6.96% | 43.68 | 6.32 | x1 | 0.00% | -12.518.000K | -12.518.000K | -12.518.000K | -15.70% | 12.758.000K |
| block-bootstrap | 43.84% | 6.96% | 43.68 | 6.32 | x2 | 0.00% | -13.382.000K | -13.382.000K | -13.382.000K | -14.67% | 13.670.000K |
| block-bootstrap | 43.84% | 6.96% | 43.68 | 6.32 | x3 | 0.00% | -14.246.000K | -14.246.000K | -14.246.000K | -13.86% | 14.582.000K |
| block-bootstrap | 43.84% | 6.96% | 43.68 | 6.32 | x4 | 0.00% | -15.110.000K | -15.110.000K | -15.110.000K | -13.22% | 15.494.000K |

## Top 30 cố định theo phương pháp/tổ hợp

| Mô hình sinh | Phương pháp | Hit TB | P(profit>0) | Profit P05 | Median | P95 | ROI TB | DD P95 | Thua dài P95 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| uniform | chainSmallFirst-h70 | 30.03% | 0.00% | -8.718.000K | -8.718.000K | -8.718.000K | -15.92% | 9.306.000K | 24.0 |
| uniform | chainBlockFirst-h70 | 29.37% | 0.00% | -9.726.000K | -9.726.000K | -9.726.000K | -17.76% | 9.786.000K | 27.0 |
| uniform | numberLikelihoodRatio-h70 | 29.64% | 0.00% | -9.306.000K | -9.306.000K | -9.306.000K | -17.00% | 9.486.000K | 24.0 |
| uniform | dedupEdge50Hold-h70 | 30.30% | 0.00% | -8.298.000K | -8.298.000K | -8.298.000K | -15.16% | 8.898.000K | 15.0 |
| uniform | consensus-likelihood-edge-small-top30 | 30.90% | 0.00% | -7.374.000K | -7.374.000K | -7.374.000K | -13.47% | 7.728.000K | 25.0 |
| uniform | consensus-active-block-small-top30 | 30.47% | 0.00% | -8.046.000K | -8.046.000K | -8.046.000K | -14.70% | 8.388.000K | 22.0 |
| uniform | exclusive-likelihood-frequency-edge-top30 | 29.26% | 0.00% | -9.894.000K | -9.894.000K | -9.894.000K | -18.07% | 10.524.000K | 19.0 |
| uniform | consensus-all-six-top30 | 31.45% | 0.00% | -6.534.000K | -6.534.000K | -6.534.000K | -11.93% | 7.740.000K | 22.0 |
| frequency-posterior | chainSmallFirst-h70 | 29.92% | 0.00% | -8.886.000K | -8.886.000K | -8.886.000K | -16.23% | 9.324.000K | 16.0 |
| frequency-posterior | chainBlockFirst-h70 | 31.07% | 0.00% | -7.122.000K | -7.122.000K | -7.122.000K | -13.01% | 7.428.000K | 16.0 |
| frequency-posterior | numberLikelihoodRatio-h70 | 29.26% | 0.00% | -9.894.000K | -9.894.000K | -9.894.000K | -18.07% | 10.002.000K | 25.0 |
| frequency-posterior | dedupEdge50Hold-h70 | 27.95% | 0.00% | -11.910.000K | -11.910.000K | -11.910.000K | -21.75% | 11.916.000K | 21.0 |
| frequency-posterior | consensus-likelihood-edge-small-top30 | 28.22% | 0.00% | -11.490.000K | -11.490.000K | -11.490.000K | -20.99% | 11.838.000K | 18.0 |
| frequency-posterior | consensus-active-block-small-top30 | 30.30% | 0.00% | -8.298.000K | -8.298.000K | -8.298.000K | -15.16% | 8.718.000K | 18.0 |
| frequency-posterior | exclusive-likelihood-frequency-edge-top30 | 31.67% | 0.00% | -6.198.000K | -6.198.000K | -6.198.000K | -11.32% | 6.924.000K | 17.0 |
| frequency-posterior | consensus-all-six-top30 | 30.08% | 0.00% | -8.634.000K | -8.634.000K | -8.634.000K | -15.77% | 8.946.000K | 24.0 |
| markov-posterior | chainSmallFirst-h70 | 30.36% | 0.00% | -8.214.000K | -8.214.000K | -8.214.000K | -15.00% | 8.364.000K | 14.0 |
| markov-posterior | chainBlockFirst-h70 | 28.99% | 0.00% | -10.314.000K | -10.314.000K | -10.314.000K | -18.84% | 10.422.000K | 21.0 |
| markov-posterior | numberLikelihoodRatio-h70 | 29.32% | 0.00% | -9.810.000K | -9.810.000K | -9.810.000K | -17.92% | 10.350.000K | 22.0 |
| markov-posterior | dedupEdge50Hold-h70 | 30.79% | 0.00% | -7.542.000K | -7.542.000K | -7.542.000K | -13.78% | 7.854.000K | 21.0 |
| markov-posterior | consensus-likelihood-edge-small-top30 | 29.48% | 0.00% | -9.558.000K | -9.558.000K | -9.558.000K | -17.46% | 9.582.000K | 20.0 |
| markov-posterior | consensus-active-block-small-top30 | 29.70% | 0.00% | -9.222.000K | -9.222.000K | -9.222.000K | -16.84% | 9.342.000K | 18.0 |
| markov-posterior | exclusive-likelihood-frequency-edge-top30 | 29.15% | 0.00% | -10.062.000K | -10.062.000K | -10.062.000K | -18.38% | 10.170.000K | 33.0 |
| markov-posterior | consensus-all-six-top30 | 29.59% | 0.00% | -9.390.000K | -9.390.000K | -9.390.000K | -17.15% | 9.498.000K | 18.0 |
| block-bootstrap | chainSmallFirst-h70 | 30.52% | 0.00% | -7.962.000K | -7.962.000K | -7.962.000K | -14.54% | 8.148.000K | 16.0 |
| block-bootstrap | chainBlockFirst-h70 | 30.14% | 0.00% | -8.550.000K | -8.550.000K | -8.550.000K | -15.62% | 8.742.000K | 21.0 |
| block-bootstrap | numberLikelihoodRatio-h70 | 30.52% | 0.00% | -7.962.000K | -7.962.000K | -7.962.000K | -14.54% | 8.316.000K | 18.0 |
| block-bootstrap | dedupEdge50Hold-h70 | 30.08% | 0.00% | -8.634.000K | -8.634.000K | -8.634.000K | -15.77% | 8.712.000K | 16.0 |
| block-bootstrap | consensus-likelihood-edge-small-top30 | 32.22% | 0.00% | -5.358.000K | -5.358.000K | -5.358.000K | -9.79% | 5.382.000K | 14.0 |
| block-bootstrap | consensus-active-block-small-top30 | 36.11% | 100.00% | 606.000K | 606.000K | 606.000K | 1.11% | 1.872.000K | 13.0 |
| block-bootstrap | exclusive-likelihood-frequency-edge-top30 | 34.14% | 0.00% | -2.418.000K | -2.418.000K | -2.418.000K | -4.42% | 3.732.000K | 12.0 |
| block-bootstrap | consensus-all-six-top30 | 34.68% | 0.00% | -1.578.000K | -1.578.000K | -1.578.000K | -2.88% | 2.376.000K | 15.0 |

## Diễn giải

- Uniform là giả thuyết xổ số độc lập đều; frequency-posterior và markov-posterior đều co mạnh về phân phối đều để tránh học nhiễu.
- Block-bootstrap giữ cụm kết quả lịch sử ngắn hạn nhưng vẫn tái tính chuỗi trên prefix giả lập mới.
- Chỉ dữ liệu thật walk-forward/holdout mới đo được predictive edge. Forward simulation chủ yếu đo độ nhạy vốn và tính nhất quán dưới các thế giới giả định.
- Production thay đổi: Không. Profit không dương đồng thời trong mọi cơ chế sinh tương lai.
