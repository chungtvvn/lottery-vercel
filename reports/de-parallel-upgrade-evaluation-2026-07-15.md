# Đánh giá nâng cấp Đề song song

## Phạm vi và nguyên tắc

- Mốc 20 năm: baseline khóa tại 31/12 của năm trước, trạng thái chuỗi mỗi ngày chỉ dùng dữ liệu đến D-1.
- Train: 361 ngày năm 2025, baseline 31/12/2024.
- Holdout: 191 ngày từ 01/01/2026 đến 14/07/2026, baseline 31/12/2025.
- Kinh tế: 1.000K mỗi đơn vị, trúng nhân 84.
- Đã thử 97 cấu hình Block/Small: nhiều mức Hold, hợp dàn, giao dàn, rank fusion 25-35 số và giới hạn số đánh x2.
- Cấu hình chỉ được chọn bằng 2025; 2026 không tham gia chọn tham số.

## Mốc 20 năm

| Phương án | 2025 | 2026 holdout | TB số/đơn vị | Chuỗi thua |
|---|---:|---:|---:|---:|
| Song song hiện tại B85 + S65, giao x2 | 149/361; -3.350.000K | 90/191; -478.000K | 43,65 số / 50 đơn vị | 13 / 9 |
| Fusion được chọn trên 2025: 25 số, 50/50, x2 tối đa 3 | 89/361; -1.257.000K | 49/191; -579.000K | 25 số / 27,66 đơn vị | 16 / 15 |
| Chuỗi nhỏ Hold 70 đơn | 99/361; -2.514.000K | 68/191; -18.000K | 30 số / 30 đơn vị | 14 / 9 |

Kết luận: fusion giảm vốn nhưng làm mất quá nhiều ngày trúng. Song song hiện tại tăng hit-rate nhưng 50 đơn vị/ngày làm profit âm. Chuỗi nhỏ Hold 70 đơn hiện gần hòa vốn nhất trên holdout nhưng chưa ổn định ở 2025.

## Lịch sử rolling strict PIT

Kết quả 189 ngày từ 01/01/2026 đến 12/07/2026, metric mỗi ngày chỉ lấy đến D-1:

| Phương án | Ngày trúng | Hit-rate | Profit | ROI | Chuỗi thua |
|---|---:|---:|---:|---:|---:|
| Edge khử trùng Hold 70 | 66/189 | 34,92% | -126.000K | -2,22% | 15 |
| Dropoff khử trùng Hold 70 | 66/189 | 34,92% | -126.000K | -2,22% | 14 |
| Song song Edge + Dropoff, giao x2 | 82/189 | 43,39% | -252.000K | -2,22% | 14 |
| Song song Block 85 + Small 65, giao x2 | 62/189 | 32,80% | -2.226.000K | -23,56% | 15 |

Việc đánh song song hai phương pháp với giao x2 về mặt tiền là cộng hai danh mục cược. Nếu hai danh mục tương quan cao, hit-rate tăng nhưng ROI không tăng; dòng Edge + Dropoff thể hiện đúng điều này khi ROI giữ nguyên -2,22%.

## Quyết định triển khai

- Không thay mặc định và không ghi lại snapshot dự đoán đã phát hành.
- Không đưa fusion 25 số vào production vì holdout âm và chuỗi thua tăng từ 9 lên 15 ngày.
- Giữ các biến thể trong script nghiên cứu để tái kiểm tra trên năm độc lập tiếp theo.
- Bước nghiên cứu tiếp theo nên tập trung vào xác suất hiệu chỉnh theo từng số và cổng không đánh/x2 có điều kiện, thay vì tiếp tục cộng thêm các dàn tương quan.

Chi tiết máy đọc:

- `reports/parallel-capital-efficient-2026-07-15T11-22-34-291Z.json`
- `reports/research_true_pit_strategies_2026-07-12T18-30-38-293Z.json`
- `reports/research_true_pit_strategies_2026-07-15T11-18-07-595Z.json`
- `reports/research_dedup_parallel_2026-01-01_2026-07-12.json`
