# Nghiên cứu chuyên sâu cải thiện xác suất chuỗi XSMB

Ngày đánh giá: 16/07/2026.

## Thiết kế kiểm định

- Mọi ngày dự đoán được sinh từ raw prefix kết thúc trước ngày đó.
- 2024 và 2025 dùng để chọn cấu hình; cấu hình được khóa trước khi đánh giá 191 ngày 2026.
- Kinh tế giữ cố định: Hold 70, đánh 30 số, 1000K/số, trúng ăn 84.
- Mỗi scope chỉ có một quan sát/ngày; tập số trùng và họ chuỗi tương quan được khử trùng trước khi học.
- Dữ liệu mô phỏng chỉ dùng đo bất định, không được cộng vào cỡ mẫu lịch sử.

## Kết quả 2026

| Phương pháp | Trúng | Tỷ lệ | Profit | ROI | Thua dài nhất | So với nền |
|---|---:|---:|---:|---:|---:|---:|
| Chuỗi nhỏ Hold 70 | 68/191 | 35,60% | -18.000K | -0,31% | 9 | Nền |
| State-length Bayes | 68/191 | 35,60% | -18.000K | -0,31% | 9 | 0 ngày |
| Conditional softmax | 71/191 | 37,17% | +234.000K | +4,08% | 7 | +3 ngày |
| Hierarchical daily Bayes | **74/191** | **38,74%** | **+486.000K** | **+8,48%** | 9 | **+6 ngày** |
| Daily Bayes + state-length | 74/191 | 38,74% | +486.000K | +8,48% | 9 | state weight được chọn = 0 |
| Daily Bayes + softmax | 74/191 | 38,74% | +486.000K | +8,48% | 9 | softmax weight được chọn = 0 |

Điểm hòa vốn là 35,714%. Hierarchical daily Bayes vượt điểm hòa vốn trong holdout này, nhưng McNemar exact `p = 0,0703125`: 7 ngày chỉ candidate trúng và 1 ngày chỉ baseline trúng. Khoảng Wilson 95% của candidate là 32,12%-45,81%, vẫn chồng lấn với baseline 29,16%-42,62%.

## Điều học được

1. Tần suất/độ dài chuỗi tổng hợp không đủ để cải thiện dàn. State-length đổi trung bình 2,92 số/ngày nhưng đổi 5 ngày thắng lấy 5 ngày thắng khác.
2. Học trực tiếp xác suất theo từng số/ngày có tín hiệu tốt hơn: softmax tăng 3 ngày trúng và giảm chuỗi thua dài nhất từ 9 xuống 7.
3. Tín hiệu mạnh nhất vẫn là Bayesian daily đã khử tương quan theo họ chuỗi. Nó tăng 6 ngày trúng với chỉ 2 hoán đổi/ngày.
4. Trộn thêm score không mặc nhiên tốt hơn. Cả state-length và softmax đều bị quá trình chọn 2024-2025 đặt trọng số về 0 khi đứng cạnh Bayesian daily.
5. Hệ số softmax cho thấy `logActiveSets` và `evidenceMass` mang dấu âm lớn nhất; đây là tương quan có điều kiện, không phải quan hệ nhân quả và không được dùng làm quy tắc cứng.

## Quyết định

Không thay phương pháp production trong lần nghiên cứu này. Hierarchical daily Bayes là ứng viên shadow tốt nhất, nhưng cần một giai đoạn bất biến chưa từng dùng để nghiên cứu trước khi nâng cấp production.

Guardrail đề xuất cho lần kiểm định tiếp theo:

- lưu snapshot bất biến trước giờ quay;
- tối thiểu 90-180 ngày live shadow;
- candidate phải tăng cả hit rate và profit;
- McNemar `p < 0,05` và không làm chuỗi thua dài nhất tăng quá 20%;
- không đổi cấu hình trong thời gian shadow.

## Artifact

- `reports/research_hierarchical_chain_calibration_2026-07-16T15-51-27-706Z.json`
- `reports/research_state_length_chain_calibration_2026-07-16T17-38-56-641Z.json`
- `reports/research_conditional_number_model_2026-07-16T17-33-22-018Z.json`
- `reports/research_combined_chain_calibration_2026-07-16T17-27-38-282Z.json`
- `reports/research_conditional_hierarchical_ensemble_2026-07-16T17-35-34-105Z.json`
