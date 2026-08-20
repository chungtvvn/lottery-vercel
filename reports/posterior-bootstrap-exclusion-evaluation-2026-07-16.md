# Đánh giá mẫu giả hậu nghiệm để loại trừ theo nhóm/chuỗi

Ngày đánh giá: 16/07/2026

## Mục tiêu

Thử dùng số lượng lớn mẫu giả để làm ổn định xác suất loại trừ của nhóm/chuỗi, đặc biệt tránh trường hợp ít quan sát nhưng hiển thị rủi ro 100%.

Mẫu giả trong nghiên cứu này là mẫu hậu nghiệm Beta-Binomial. Nó không được tính như dữ liệu xổ số mới. Mỗi nhóm được đặt prior về xác suất nền, sau đó sinh 10.000 giá trị xác suất để lấy trung bình, cận trên và mức tin cậy.

## Thiết kế chống leak

- Dữ liệu trạng thái của từng ngày được sinh strict point-in-time từ raw prefix đến ngày liền trước.
- Baseline 20 năm được chốt ở ngày 31/12 của năm trước năm dự đoán.
- Train đầu 2024, kiểm định cuối 2024.
- Train toàn bộ 2024, kiểm định 2025.
- Khóa cấu hình trước khi đánh giá holdout 2026.
- Mọi phương pháp đều loại đúng 70 số, đánh đúng 30 số, 1.000K/số và trúng nhận 84 lần.

## Thử nghiệm 1: posterior theo nhóm/pattern/state

Cấu hình được chọn trước khi mở holdout: `posteriorBootstrap_coarse_p100_q90_top1_standalone`.

| Giai đoạn | chainSmallFirst | Mẫu giả hậu nghiệm | Chênh lệch |
|---|---:|---:|---:|
| Cuối 2024 | 37/121, 30,58%, -522.000K | 46/121, 38,02%, +234.000K | +9 trúng, +756.000K |
| Năm 2025 | 99/361, 27,42%, -2.514.000K | 108/361, 29,92%, -1.758.000K | +9 trúng, +756.000K |
| Holdout 2026 đến 05/07 | 68/182, 37,36%, +252.000K | 46/182, 25,27%, -1.596.000K | -22 trúng, -1.848.000K |

Ngay cả cấu hình ít phá baseline hơn trong top 10 được chọn trước holdout cũng chỉ đạt 63/182 ngày, 34,62%, profit -168.000K; vẫn kém baseline 5 ngày trúng.

## Thử nghiệm 2: posterior trực tiếp trên xác suất gãy của chuỗi active

Mỗi chuỗi active có chuyển tiếp lịch sử hợp lệ được mô phỏng từ `currentCount`, `nextCount` và xác suất nền của đúng tập số. Chuỗi tiềm năng bị bỏ qua vì chưa có `formationTrials` từ daily opportunity replay.

| Giai đoạn | Baseline | Posterior chuỗi active | Kết quả |
|---|---:|---:|---|
| Mẫu validation 2024-2025 | 23/74, 31,08%, -288.000K | 23/74, 31,08%, -288.000K | Không có swap đủ tin cậy |
| Holdout 2026 đến 14/07 | 68/191, 35,60%, -18.000K | 68/191, 35,60%, -18.000K | Giữ nguyên baseline |

Không có chuỗi active nào tạo edge dương đủ vượt xác suất nền khi dùng cận hậu nghiệm bảo thủ. Đây là kết quả hợp lệ: tăng số mẫu mô phỏng không thể bù cho bằng chứng gốc yếu.

## Kiểm tra độ ổn định nhóm

- Có 12 token nhóm đạt cận trên 90% thấp hơn xác suất nền 1% khi học từ 2024-2025.
- Cả 12 token đều còn xuất hiện trong holdout 2026.
- 4/12 token đảo chiều lên tỷ lệ thực tế trên 1% trong 2026.
- Ba alias `number|orderedAlternation`, `orderedAlternationUp`, `orderedAlternationDown` cùng đảo chiều, cho thấy cần tiếp tục khử alias theo cùng tập số/chuỗi gốc thay vì coi là ba bằng chứng độc lập.

## Kết luận

Không áp dụng hai phương pháp mẫu giả này vào production. Mẫu giả giúp mô tả độ bất định và chặn xác suất ảo do ít mẫu, nhưng không làm tăng thông tin dự báo. Phương pháp nhóm học tốt ở 2024-2025 nhưng thất bại rõ trên holdout 2026; phương pháp chuỗi active bảo thủ không tìm thấy edge đủ mạnh để thay đổi dàn.

Hướng tiếp theo có cơ sở hơn:

1. Sinh `formationTrials` và `formationCount` bằng daily opportunity replay cho từng chuỗi tiềm năng. Hiện tại hai trường này chưa có nên không thể ước lượng xác suất không hình thành đúng nghĩa.
2. Lưu định danh chuỗi/tập số gốc trong evidence để posterior theo từng chuỗi, thay vì chỉ theo nhóm rộng như `sum|down`.
3. Khử trùng alias và các chuỗi cùng tập số trước khi cộng bằng chứng.
4. Chỉ dùng posterior làm confidence gate quanh phương pháp đã ổn định, không thay toàn bộ thứ hạng 100 số.
5. Xác nhận lại bằng walk-forward nhiều năm; không chọn cấu hình trên 2026 rồi báo lại 2026 như holdout.

## File tái lập

- `scripts/research-strict-posterior-bootstrap.js`
- `scripts/test-strict-posterior-bootstrap.js`
- `scripts/research-strict-candidate-bootstrap.js`
- `reports/strict-posterior-bootstrap-2026-07-16T15-02-00-248Z.json`
- `reports/strict-candidate-bootstrap-2026-07-16T14-57-02-463Z.json`
