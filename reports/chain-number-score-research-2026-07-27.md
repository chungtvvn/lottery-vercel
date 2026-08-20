# Nghiên cứu chấm điểm dạng chuỗi và từng số

Ngày chạy: 27/07/2026.

## Thiết kế kiểm chứng

- Hold 70, đánh cố định 30 số/ngày.
- Mỗi số 1000K, trúng nhận 84 lần; hòa vốn cần `30/84 = 35,714286%`.
- Mỗi ngày tái sinh thống kê từ raw prefix kết thúc ở D-1.
- Baseline năm chỉ dùng dữ liệu đến 31/12 năm trước.
- 2024 dùng huấn luyện; 2025 chọn cấu hình; 2026 là holdout khóa kín.
- Mẫu screening cách 7 ngày: 52 ngày năm 2024, 52 ngày năm 2025 và 29 ngày năm 2026 đến 26/07.

## Phương pháp đã thử

### 1. Điểm độ tin cậy dạng chuỗi + hoán đổi từng số

- Beta shrinkage theo `state → family → pattern`.
- So sánh tỷ lệ loại thực tế với xác suất nền theo độ rộng tập số.
- Khử trùng tập số tương đương.
- Mỗi số chỉ nhận tín hiệu mạnh nhất của mỗi họ chuỗi.
- Bắt đầu từ dàn nền, chỉ hoán đổi khi điểm rủi ro có biên dương.

Kết quả cấu hình chọn trên 2025:

| Giai đoạn | Phương pháp | Trúng | Tỷ lệ | Profit | Thua dài nhất |
|---|---|---:|---:|---:|---:|
| 2025 | Block nền | 15/52 | 28,85% | -300.000K | 12 |
| 2025 | Chấm chuỗi + số | 17/52 | 32,69% | -132.000K | 5 |
| 2026 holdout | Block nền | 8/29 | 27,59% | -198.000K | 6 |
| 2026 holdout | Chấm chuỗi + số | 6/29 | 20,69% | -366.000K | 12 |

Kết luận: cải thiện ở validation nhưng đảo chiều trên holdout; không dùng production.

### 2. Stable Lift theo họ chuỗi

Bản đầu cho profit dương nhưng bị phát hiện phá hòa theo thứ tự số 00→99. Sau khi sửa để dàn PIT nền thắng tie-break:

| Giai đoạn | Trúng | Tỷ lệ | Profit | Thua dài nhất |
|---|---:|---:|---:|---:|
| 2025 | 15/52 | 28,85% | -300.000K | 6 |
| 2026 holdout | 10/29 | 34,48% | -30.000K | 12 |

Kết luận: kết quả dương trước sửa là giả do tie-break; bản an toàn vẫn dưới hòa vốn.

### 3. Posterior bootstrap theo nhóm/pattern/state

- Beta-Binomial với prior mạnh để giảm ảo giác từ mẫu nhỏ.
- Mẫu giả chỉ lượng hóa bất định, không tạo thêm dữ liệu xổ số.
- Chọn cấu hình trên late-2024 và 2025, khóa trước 2026.

| Giai đoạn | Dàn nền | Posterior | Chênh lệch |
|---|---:|---:|---:|
| Late 2024 | 3/18, -288.000K | 8/18, +132.000K | +5 trúng |
| 2025 | 15/52, -300.000K | 19/52, +36.000K | +4 trúng |
| 2026 holdout | 9/29, -114.000K | 10/29, -30.000K | +1 trúng |

Posterior giảm chuỗi thua holdout từ 12 xuống 7 ngày nhưng chỉ đạt 34,48%, vẫn dưới hòa vốn 35,71%.

## Kết luận

- Chấm điểm dạng chuỗi và từng số có thể giảm sai số so với dàn nền.
- Chưa có ứng viên nào profit dương trên holdout 2026 sau khi khóa cấu hình.
- Không thay đổi phương pháp mặc định.
- Cổng promotion đã được sửa: ứng viên phải cải thiện dàn nền, profit holdout dương và vượt tỷ lệ hòa vốn.
- Bước tiếp theo hợp lệ là shadow-test snapshot bất biến hoặc chạy full-daily độc lập; không tiếp tục chỉnh tham số bằng 2026.
