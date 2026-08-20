# Forward simulation tái sinh chuỗi Đề Song song

- Raw thật R2: 2005-10-01 -> 2026-07-16 (7.493 ngày).
- Baseline khóa: 2006-01-01 -> 2025-12-31.
- 1 path/model × 1 model × 2 ngày = 2 ngày giả lập.
- Tái sinh pattern với lookback 400 ngày sau từng kết quả; 1 worker.
- Số đường mô phỏng không phải mẫu lịch sử mới và không chứng minh khả năng dự đoán.

## Audit xấp xỉ so với full-prefix

- Block Jaccard: 87.50%.
- Small Jaccard: 100.00%.
- Union Jaccard: 95.45%.
- Trạng thái: đạt ngưỡng nghiên cứu.

## Kết quả theo mô hình sinh tương lai

| Mô hình | Hit hợp | Hit giao | Số hợp | Số giao | x | P(profit>0) | Profit P05 | Profit giữa | Profit P95 | ROI TB | DD P95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| uniform | 50.00% | 50.00% | 42.50 | 7.50 | x1 | 0.00% | -1.000K | -1.000K | -1.000K | -1.18% | 42.000K |
| uniform | 50.00% | 50.00% | 42.50 | 7.50 | x2 | 100.00% | 68.000K | 68.000K | 68.000K | 68.00% | 50.000K |
| uniform | 50.00% | 50.00% | 42.50 | 7.50 | x3 | 100.00% | 137.000K | 137.000K | 137.000K | 119.13% | 58.000K |
| uniform | 50.00% | 50.00% | 42.50 | 7.50 | x4 | 100.00% | 206.000K | 206.000K | 206.000K | 158.46% | 66.000K |

## Top 30 cố định theo phương pháp/tổ hợp

| Mô hình sinh | Phương pháp | Hit TB | P(profit>0) | Profit P05 | Median | P95 | ROI TB | DD P95 | Thua dài P95 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| uniform | chainSmallFirst-h70 | 0.00% | 0.00% | -60.000K | -60.000K | -60.000K | -100.00% | 60.000K | 2.0 |
| uniform | chainBlockFirst-h70 | 50.00% | 100.00% | 24.000K | 24.000K | 24.000K | 40.00% | 30.000K | 1.0 |
| uniform | numberLikelihoodRatio-h70 | 50.00% | 100.00% | 24.000K | 24.000K | 24.000K | 40.00% | 30.000K | 1.0 |
| uniform | dedupEdge50Hold-h70 | 0.00% | 0.00% | -60.000K | -60.000K | -60.000K | -100.00% | 60.000K | 2.0 |
| uniform | consensus-likelihood-edge-small-top30 | 0.00% | 0.00% | -60.000K | -60.000K | -60.000K | -100.00% | 60.000K | 2.0 |
| uniform | consensus-active-block-small-top30 | 50.00% | 100.00% | 24.000K | 24.000K | 24.000K | 40.00% | 30.000K | 1.0 |
| uniform | exclusive-likelihood-frequency-edge-top30 | 100.00% | 100.00% | 108.000K | 108.000K | 108.000K | 180.00% | 0K | 0.0 |
| uniform | consensus-all-six-top30 | 50.00% | 100.00% | 24.000K | 24.000K | 24.000K | 40.00% | 30.000K | 1.0 |

## Diễn giải

- Uniform là giả thuyết xổ số độc lập đều; frequency-posterior và markov-posterior đều co mạnh về phân phối đều để tránh học nhiễu.
- Block-bootstrap giữ cụm kết quả lịch sử ngắn hạn nhưng vẫn tái tính chuỗi trên prefix giả lập mới.
- Chỉ dữ liệu thật walk-forward/holdout mới đo được predictive edge. Forward simulation chủ yếu đo độ nhạy vốn và tính nhất quán dưới các thế giới giả định.
- Production thay đổi: Không. Mô phỏng ổn định nhưng vẫn cần holdout thật; không tự động đổi production.
