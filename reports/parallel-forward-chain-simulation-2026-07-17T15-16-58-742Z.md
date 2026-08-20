# Forward simulation tái sinh chuỗi Đề Song song

- Raw thật R2: 2005-10-01 -> 2026-07-17 (7.494 ngày).
- Baseline khóa: 2006-01-01 -> 2025-12-31.
- 1 path/model × 1 model × 1 ngày = 1 ngày giả lập.
- Tái sinh pattern với lookback 200 ngày sau từng kết quả; 1 worker.
- Số đường mô phỏng không phải mẫu lịch sử mới và không chứng minh khả năng dự đoán.

## Audit xấp xỉ so với full-prefix

- Block Jaccard: 100.00%.
- Small Jaccard: 100.00%.
- Union Jaccard: 100.00%.
- Trạng thái: đạt ngưỡng nghiên cứu.

## Kết quả theo mô hình sinh tương lai

| Mô hình | Hit hợp | Hit giao | Số hợp | Số giao | x | P(profit>0) | Profit P05 | Profit giữa | Profit P95 | ROI TB | DD P95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| chain-conditional-softmax | 100.00% | 0.00% | 35.00 | 15.00 | x1 | 100.00% | 49.000K | 49.000K | 49.000K | 140.00% | 0K |
| chain-conditional-softmax | 100.00% | 0.00% | 35.00 | 15.00 | x2 | 100.00% | 34.000K | 34.000K | 34.000K | 68.00% | 0K |
| chain-conditional-softmax | 100.00% | 0.00% | 35.00 | 15.00 | x3 | 100.00% | 19.000K | 19.000K | 19.000K | 29.23% | 0K |
| chain-conditional-softmax | 100.00% | 0.00% | 35.00 | 15.00 | x4 | 100.00% | 4.000K | 4.000K | 4.000K | 5.00% | 0K |

## Top 30 cố định theo phương pháp/tổ hợp

| Mô hình sinh | Phương pháp | Hit TB | P(profit>0) | Profit P05 | Median | P95 | ROI TB | DD P95 | Thua dài P95 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| chain-conditional-softmax | chainSmallFirst-h70 | 0.00% | 0.00% | -30.000K | -30.000K | -30.000K | -100.00% | 30.000K | 1.0 |
| chain-conditional-softmax | chainBlockFirst-h70 | 0.00% | 0.00% | -30.000K | -30.000K | -30.000K | -100.00% | 30.000K | 1.0 |
| chain-conditional-softmax | numberLikelihoodRatio-h70 | 0.00% | 0.00% | -30.000K | -30.000K | -30.000K | -100.00% | 30.000K | 1.0 |
| chain-conditional-softmax | dedupEdge50Hold-h70 | 100.00% | 100.00% | 54.000K | 54.000K | 54.000K | 180.00% | 0K | 0.0 |
| chain-conditional-softmax | consensus-likelihood-edge-small-top30 | 0.00% | 0.00% | -30.000K | -30.000K | -30.000K | -100.00% | 30.000K | 1.0 |
| chain-conditional-softmax | consensus-active-block-small-top30 | 0.00% | 0.00% | -30.000K | -30.000K | -30.000K | -100.00% | 30.000K | 1.0 |
| chain-conditional-softmax | exclusive-likelihood-frequency-edge-top30 | 0.00% | 0.00% | -30.000K | -30.000K | -30.000K | -100.00% | 30.000K | 1.0 |
| chain-conditional-softmax | consensus-all-six-top30 | 0.00% | 0.00% | -30.000K | -30.000K | -30.000K | -100.00% | 30.000K | 1.0 |

## Diễn giải

- Uniform là giả thuyết xổ số độc lập đều; frequency-posterior và markov-posterior đều co mạnh về phân phối đều để tránh học nhiễu.
- Block-bootstrap giữ cụm kết quả lịch sử ngắn hạn nhưng vẫn tái tính chuỗi trên prefix giả lập mới.
- Chain-conditional-softmax học quan hệ giữa membership của sáu phương pháp và kết quả thật strict PIT, rồi tính lại xác suất 00-99 sau mỗi trạng thái chuỗi giả lập. Đây là sensitivity scenario tự tham chiếu, không phải holdout độc lập.
- Chỉ dữ liệu thật walk-forward/holdout mới đo được predictive edge. Forward simulation chủ yếu đo độ nhạy vốn và tính nhất quán dưới các thế giới giả định.
- Production thay đổi: Không. Mô phỏng ổn định nhưng vẫn cần holdout thật; không tự động đổi production.
