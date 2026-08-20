# Forward simulation tái sinh chuỗi Đề Song song

- Raw thật R2: 2005-10-01 -> 2026-07-16 (7.493 ngày).
- Baseline khóa: 2006-01-01 -> 2025-12-31.
- 2 path/model × 4 model × 3 ngày = 24 ngày giả lập.
- Tái sinh pattern với toàn bộ raw prefix sau từng kết quả; 8 worker.
- Số đường mô phỏng không phải mẫu lịch sử mới và không chứng minh khả năng dự đoán.

## Audit xấp xỉ so với full-prefix

- Block Jaccard: 100.00%.
- Small Jaccard: 100.00%.
- Union Jaccard: 100.00%.
- Trạng thái: đạt ngưỡng nghiên cứu.

## Kết quả theo mô hình sinh tương lai

| Mô hình | Hit hợp | Hit giao | Số hợp | Số giao | x | P(profit>0) | Profit P05 | Profit giữa | Profit P95 | ROI TB | DD P95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| uniform | 50.00% | 16.67% | 40.67 | 9.33 | x1 | 50.00% | -35.600K | 4.000K | 43.600K | 3.87% | 76.200K |
| uniform | 50.00% | 16.67% | 40.67 | 9.33 | x2 | 50.00% | -57.600K | 18.000K | 93.600K | 12.00% | 97.500K |
| uniform | 50.00% | 16.67% | 40.67 | 9.33 | x3 | 50.00% | -79.600K | 32.000K | 143.600K | 17.20% | 118.800K |
| uniform | 50.00% | 16.67% | 40.67 | 9.33 | x4 | 50.00% | -101.600K | 46.000K | 193.600K | 20.79% | 140.100K |
| frequency-posterior | 33.33% | 16.67% | 44.17 | 5.83 | x1 | 0.00% | -55.250K | -48.500K | -41.750K | -36.40% | 88.600K |
| frequency-posterior | 33.33% | 16.67% | 44.17 | 5.83 | x2 | 50.00% | -61.800K | -24.000K | 13.800K | -16.00% | 97.500K |
| frequency-posterior | 33.33% | 16.67% | 44.17 | 5.83 | x3 | 50.00% | -68.350K | 500K | 69.350K | -1.75% | 106.800K |
| frequency-posterior | 33.33% | 16.67% | 44.17 | 5.83 | x4 | 50.00% | -74.900K | 25.000K | 124.900K | 8.71% | 116.100K |
| markov-posterior | 50.00% | 0.00% | 42.67 | 7.33 | x1 | 50.00% | -113.600K | -2.000K | 109.600K | -3.08% | 119.700K |
| markov-posterior | 50.00% | 0.00% | 42.67 | 7.33 | x2 | 50.00% | -137.400K | -24.000K | 89.400K | -16.00% | 142.500K |
| markov-posterior | 50.00% | 0.00% | 42.67 | 7.33 | x3 | 50.00% | -161.200K | -46.000K | 69.200K | -25.88% | 165.300K |
| markov-posterior | 50.00% | 0.00% | 42.67 | 7.33 | x4 | 50.00% | -185.000K | -68.000K | 49.000K | -33.68% | 188.100K |
| block-bootstrap | 16.67% | 0.00% | 43.33 | 6.67 | x1 | 0.00% | -127.600K | -88.000K | -48.400K | -67.19% | 127.900K |
| block-bootstrap | 16.67% | 0.00% | 43.33 | 6.67 | x2 | 0.00% | -145.800K | -108.000K | -70.200K | -72.00% | 145.800K |
| block-bootstrap | 16.67% | 0.00% | 43.33 | 6.67 | x3 | 0.00% | -164.000K | -128.000K | -92.000K | -75.58% | 164.000K |
| block-bootstrap | 16.67% | 0.00% | 43.33 | 6.67 | x4 | 0.00% | -182.200K | -148.000K | -113.800K | -78.35% | 182.200K |

## Diễn giải

- Uniform là giả thuyết xổ số độc lập đều; frequency-posterior và markov-posterior đều co mạnh về phân phối đều để tránh học nhiễu.
- Block-bootstrap giữ cụm kết quả lịch sử ngắn hạn nhưng vẫn tái tính chuỗi trên prefix giả lập mới.
- Chỉ dữ liệu thật walk-forward/holdout mới đo được predictive edge. Forward simulation chủ yếu đo độ nhạy vốn và tính nhất quán dưới các thế giới giả định.
- Production thay đổi: Không. Profit không dương đồng thời trong mọi cơ chế sinh tương lai.
