# Forward simulation tái sinh chuỗi Đề Song song

- Raw thật R2: 2005-10-01 -> 2026-07-16 (7.493 ngày).
- Baseline khóa: 2006-01-01 -> 2025-12-31.
- 2 path/model × 4 model × 730 ngày = 5.840 ngày giả lập.
- Tái sinh pattern với lookback 400 ngày sau từng kết quả; 4 worker.
- Số đường mô phỏng không phải mẫu lịch sử mới và không chứng minh khả năng dự đoán.

## Audit xấp xỉ so với full-prefix

- Block Jaccard: 87.50%.
- Small Jaccard: 100.00%.
- Union Jaccard: 95.45%.
- Trạng thái: đạt ngưỡng nghiên cứu.

## Kết quả theo mô hình sinh tương lai

| Mô hình | Hit hợp | Hit giao | Số hợp | Số giao | x | P(profit>0) | Profit P05 | Profit giữa | Profit P95 | ROI TB | DD P95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| uniform | 40.89% | 5.55% | 43.78 | 6.22 | x1 | 0.00% | -7.169.150K | -6.882.500K | -6.595.850K | -21.54% | 7.419.000K |
| uniform | 40.89% | 5.55% | 43.78 | 6.22 | x2 | 0.00% | -8.099.600K | -8.024.000K | -7.948.400K | -21.98% | 8.388.400K |
| uniform | 40.89% | 5.55% | 43.78 | 6.22 | x3 | 0.00% | -9.300.950K | -9.165.500K | -9.030.050K | -22.33% | 9.357.800K |
| uniform | 40.89% | 5.55% | 43.78 | 6.22 | x4 | 0.00% | -10.653.500K | -10.307.000K | -9.960.500K | -22.61% | 10.672.800K |
| frequency-posterior | 44.86% | 6.03% | 43.61 | 6.39 | x1 | 0.00% | -4.766.350K | -4.328.500K | -3.890.650K | -13.60% | 4.835.600K |
| frequency-posterior | 44.86% | 6.03% | 43.61 | 6.39 | x2 | 0.00% | -5.936.600K | -5.294.000K | -4.651.400K | -14.50% | 6.101.300K |
| frequency-posterior | 44.86% | 6.03% | 43.61 | 6.39 | x3 | 0.00% | -7.106.850K | -6.259.500K | -5.412.150K | -15.20% | 7.370.000K |
| frequency-posterior | 44.86% | 6.03% | 43.61 | 6.39 | x4 | 0.00% | -8.277.100K | -7.225.000K | -6.172.900K | -15.76% | 8.652.700K |
| markov-posterior | 44.45% | 6.92% | 43.72 | 6.28 | x1 | 0.00% | -5.315.100K | -4.659.000K | -4.002.900K | -14.60% | 5.613.100K |
| markov-posterior | 44.45% | 6.92% | 43.72 | 6.28 | x2 | 0.00% | -5.907.200K | -5.000.000K | -4.092.800K | -13.70% | 6.362.800K |
| markov-posterior | 44.45% | 6.92% | 43.72 | 6.28 | x3 | 0.00% | -6.499.300K | -5.341.000K | -4.182.700K | -13.00% | 7.131.150K |
| markov-posterior | 44.45% | 6.92% | 43.72 | 6.28 | x4 | 0.00% | -7.091.400K | -5.682.000K | -4.272.600K | -12.44% | 7.952.200K |
| block-bootstrap | 46.03% | 6.51% | 43.68 | 6.32 | x1 | 0.00% | -4.561.500K | -3.666.000K | -2.770.500K | -11.48% | 4.918.650K |
| block-bootstrap | 46.03% | 6.51% | 43.68 | 6.32 | x2 | 0.00% | -5.306.600K | -4.286.000K | -3.265.400K | -11.74% | 5.875.000K |
| block-bootstrap | 46.03% | 6.51% | 43.68 | 6.32 | x3 | 0.00% | -6.051.700K | -4.906.000K | -3.760.300K | -11.95% | 6.834.150K |
| block-bootstrap | 46.03% | 6.51% | 43.68 | 6.32 | x4 | 0.00% | -6.796.800K | -5.526.000K | -4.255.200K | -12.11% | 7.806.600K |

## Top 30 cố định theo phương pháp/tổ hợp

| Mô hình sinh | Phương pháp | Hit TB | P(profit>0) | Profit P05 | Median | P95 | ROI TB | DD P95 | Thua dài P95 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| uniform | chainSmallFirst-h70 | 28.56% | 0.00% | -4.801.800K | -4.386.000K | -3.970.200K | -20.03% | 4.910.100K | 15.9 |
| uniform | chainBlockFirst-h70 | 28.42% | 0.00% | -4.583.400K | -4.470.000K | -4.356.600K | -20.41% | 4.894.200K | 16.9 |
| uniform | numberLikelihoodRatio-h70 | 30.41% | 0.00% | -4.310.400K | -3.252.000K | -2.193.600K | -14.85% | 4.318.800K | 15.8 |
| uniform | dedupEdge50Hold-h70 | 31.23% | 0.00% | -3.957.600K | -2.748.000K | -1.538.400K | -12.55% | 4.051.200K | 18.9 |
| uniform | consensus-likelihood-edge-small-top30 | 29.73% | 0.00% | -4.276.800K | -3.672.000K | -3.067.200K | -16.77% | 4.283.700K | 19.9 |
| uniform | consensus-active-block-small-top30 | 28.56% | 0.00% | -4.650.600K | -4.386.000K | -4.121.400K | -20.03% | 4.989.900K | 19.7 |
| uniform | exclusive-likelihood-frequency-edge-top30 | 28.36% | 0.00% | -4.663.200K | -4.512.000K | -4.360.800K | -20.60% | 4.739.100K | 21.7 |
| uniform | consensus-all-six-top30 | 28.84% | 0.00% | -4.936.200K | -4.218.000K | -3.499.800K | -19.26% | 5.006.700K | 16.9 |
| frequency-posterior | chainSmallFirst-h70 | 30.41% | 0.00% | -3.478.800K | -3.252.000K | -3.025.200K | -14.85% | 3.765.600K | 19.7 |
| frequency-posterior | chainBlockFirst-h70 | 28.01% | 0.00% | -4.759.800K | -4.722.000K | -4.684.200K | -21.56% | 4.780.500K | 23.8 |
| frequency-posterior | numberLikelihoodRatio-h70 | 28.56% | 0.00% | -5.784.600K | -4.386.000K | -2.987.400K | -20.03% | 5.903.400K | 20.6 |
| frequency-posterior | dedupEdge50Hold-h70 | 29.18% | 0.00% | -5.520.000K | -4.008.000K | -2.496.000K | -18.30% | 5.610.000K | 20.8 |
| frequency-posterior | consensus-likelihood-edge-small-top30 | 29.93% | 0.00% | -4.415.400K | -3.546.000K | -2.676.600K | -16.19% | 4.579.800K | 19.0 |
| frequency-posterior | consensus-active-block-small-top30 | 29.18% | 0.00% | -4.083.600K | -4.008.000K | -3.932.400K | -18.30% | 4.277.400K | 20.7 |
| frequency-posterior | exclusive-likelihood-frequency-edge-top30 | 28.97% | 0.00% | -4.398.600K | -4.134.000K | -3.869.400K | -18.88% | 4.475.400K | 18.9 |
| frequency-posterior | consensus-all-six-top30 | 29.18% | 0.00% | -4.083.600K | -4.008.000K | -3.932.400K | -18.30% | 4.241.700K | 17.8 |
| markov-posterior | chainSmallFirst-h70 | 31.44% | 0.00% | -2.811.000K | -2.622.000K | -2.433.000K | -11.97% | 2.964.900K | 13.9 |
| markov-posterior | chainBlockFirst-h70 | 30.41% | 0.00% | -3.705.600K | -3.252.000K | -2.798.400K | -14.85% | 4.089.900K | 15.0 |
| markov-posterior | numberLikelihoodRatio-h70 | 29.04% | 0.00% | -4.696.800K | -4.092.000K | -3.487.200K | -18.68% | 4.878.600K | 12.9 |
| markov-posterior | dedupEdge50Hold-h70 | 30.27% | 0.00% | -3.789.600K | -3.336.000K | -2.882.400K | -15.23% | 3.930.600K | 22.7 |
| markov-posterior | consensus-likelihood-edge-small-top30 | 29.25% | 0.00% | -4.003.800K | -3.966.000K | -3.928.200K | -18.11% | 4.342.200K | 17.8 |
| markov-posterior | consensus-active-block-small-top30 | 30.34% | 0.00% | -4.087.800K | -3.294.000K | -2.500.200K | -15.04% | 4.510.800K | 21.6 |
| markov-posterior | exclusive-likelihood-frequency-edge-top30 | 30.34% | 0.00% | -4.390.200K | -3.294.000K | -2.197.800K | -15.04% | 4.624.800K | 23.4 |
| markov-posterior | consensus-all-six-top30 | 29.52% | 0.00% | -3.911.400K | -3.798.000K | -3.684.600K | -17.34% | 4.147.500K | 19.8 |
| block-bootstrap | chainSmallFirst-h70 | 33.36% | 0.00% | -2.391.000K | -1.446.000K | -501.000K | -6.60% | 3.139.500K | 17.8 |
| block-bootstrap | chainBlockFirst-h70 | 29.66% | 0.00% | -4.129.800K | -3.714.000K | -3.298.200K | -16.96% | 4.575.600K | 17.9 |
| block-bootstrap | numberLikelihoodRatio-h70 | 28.56% | 0.00% | -4.877.400K | -4.386.000K | -3.894.600K | -20.03% | 5.050.500K | 15.9 |
| block-bootstrap | dedupEdge50Hold-h70 | 29.79% | 0.00% | -4.953.000K | -3.630.000K | -2.307.000K | -16.58% | 5.125.800K | 13.9 |
| block-bootstrap | consensus-likelihood-edge-small-top30 | 32.33% | 0.00% | -3.285.600K | -2.076.000K | -866.400K | -9.48% | 3.682.800K | 16.8 |
| block-bootstrap | consensus-active-block-small-top30 | 34.73% | 0.00% | -1.097.400K | -606.000K | -114.600K | -2.77% | 1.883.100K | 12.9 |
| block-bootstrap | exclusive-likelihood-frequency-edge-top30 | 32.60% | 0.00% | -2.664.000K | -1.908.000K | -1.152.000K | -8.71% | 3.127.200K | 14.9 |
| block-bootstrap | consensus-all-six-top30 | 33.01% | 0.00% | -2.638.800K | -1.656.000K | -673.200K | -7.56% | 3.412.200K | 13.9 |

## Diễn giải

- Uniform là giả thuyết xổ số độc lập đều; frequency-posterior và markov-posterior đều co mạnh về phân phối đều để tránh học nhiễu.
- Block-bootstrap giữ cụm kết quả lịch sử ngắn hạn nhưng vẫn tái tính chuỗi trên prefix giả lập mới.
- Chỉ dữ liệu thật walk-forward/holdout mới đo được predictive edge. Forward simulation chủ yếu đo độ nhạy vốn và tính nhất quán dưới các thế giới giả định.
- Production thay đổi: Không. Profit không dương đồng thời trong mọi cơ chế sinh tương lai.
