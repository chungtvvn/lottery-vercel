# Forward simulation tái sinh chuỗi Đề Song song

- Raw thật R2: 2005-10-01 -> 2026-07-16 (7.493 ngày).
- Baseline khóa: 2006-01-01 -> 2025-12-31.
- 24 path/model × 4 model × 14 ngày = 1.344 ngày giả lập.
- Tái sinh pattern với lookback 730 ngày sau từng kết quả; 8 worker.
- Số đường mô phỏng không phải mẫu lịch sử mới và không chứng minh khả năng dự đoán.

## Audit xấp xỉ so với full-prefix

- Block Jaccard: 87.50%.
- Small Jaccard: 100.00%.
- Union Jaccard: 95.45%.
- Trạng thái: đạt ngưỡng nghiên cứu.

## Kết quả theo mô hình sinh tương lai

| Mô hình | Hit hợp | Hit giao | Số hợp | Số giao | x | P(profit>0) | Profit P05 | Profit giữa | Profit P95 | ROI TB | DD P95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| uniform | 46.73% | 6.25% | 43.19 | 6.81 | x1 | 33.33% | -358.250K | -26.000K | 142.400K | -8.84% | 388.500K |
| uniform | 46.73% | 6.25% | 43.19 | 6.81 | x2 | 29.17% | -435.400K | -28.000K | 211.400K | -11.00% | 463.600K |
| uniform | 46.73% | 6.25% | 43.19 | 6.81 | x3 | 29.17% | -512.950K | -87.000K | 336.600K | -12.59% | 543.700K |
| uniform | 46.73% | 6.25% | 43.19 | 6.81 | x4 | 33.33% | -590.500K | -159.000K | 461.800K | -13.81% | 610.500K |
| frequency-posterior | 45.54% | 7.74% | 43.01 | 6.99 | x1 | 33.33% | -334.600K | -96.500K | 165.200K | -10.92% | 348.500K |
| frequency-posterior | 45.54% | 7.74% | 43.01 | 6.99 | x2 | 33.33% | -435.400K | -112.000K | 295.400K | -10.50% | 443.200K |
| frequency-posterior | 45.54% | 7.74% | 43.01 | 6.99 | x3 | 37.50% | -469.050K | -125.000K | 352.250K | -10.08% | 499.850K |
| frequency-posterior | 45.54% | 7.74% | 43.01 | 6.99 | x4 | 37.50% | -502.700K | -120.000K | 409.100K | -9.69% | 548.000K |
| markov-posterior | 42.26% | 6.85% | 43.16 | 6.84 | x1 | 20.83% | -349.750K | -112.000K | 139.950K | -17.73% | 361.800K |
| markov-posterior | 42.26% | 6.85% | 43.16 | 6.84 | x2 | 29.17% | -448.000K | -112.000K | 140.000K | -17.50% | 476.900K |
| markov-posterior | 42.26% | 6.85% | 43.16 | 6.84 | x3 | 25.00% | -570.750K | -134.000K | 319.400K | -17.32% | 593.700K |
| markov-posterior | 42.26% | 6.85% | 43.16 | 6.84 | x4 | 25.00% | -690.100K | -168.000K | 498.800K | -17.17% | 690.100K |
| block-bootstrap | 46.13% | 9.82% | 43.30 | 6.70 | x1 | 20.83% | -270.850K | -83.500K | 157.150K | -10.13% | 331.900K |
| block-bootstrap | 46.13% | 9.82% | 43.30 | 6.70 | x2 | 25.00% | -280.000K | -70.000K | 282.800K | -6.00% | 376.900K |
| block-bootstrap | 46.13% | 9.82% | 43.30 | 6.70 | x3 | 33.33% | -271.750K | -56.000K | 419.250K | -2.78% | 422.950K |
| block-bootstrap | 46.13% | 9.82% | 43.30 | 6.70 | x4 | 37.50% | -276.500K | -79.000K | 555.700K | -0.18% | 483.000K |

## Diễn giải

- Uniform là giả thuyết xổ số độc lập đều; frequency-posterior và markov-posterior đều co mạnh về phân phối đều để tránh học nhiễu.
- Block-bootstrap giữ cụm kết quả lịch sử ngắn hạn nhưng vẫn tái tính chuỗi trên prefix giả lập mới.
- Chỉ dữ liệu thật walk-forward/holdout mới đo được predictive edge. Forward simulation chủ yếu đo độ nhạy vốn và tính nhất quán dưới các thế giới giả định.
- Production thay đổi: Không. Profit không dương đồng thời trong mọi cơ chế sinh tương lai.
