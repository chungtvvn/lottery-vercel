# Nghiên cứu chuỗi và tần suất năm - 15/07/2026

## Phạm vi dữ liệu

- Nguồn raw R2: 7.491 ngày, từ 01/10/2005 đến 14/07/2026.
- Baseline Mốc 20 năm cho 2026: 61.656 pattern, chốt tại 31/12/2025.
- Backtest kiểm chứng: 44 ngày từ 01/06/2026 đến 14/07/2026.
- Mỗi ngày chỉ dùng kết quả đến D-1; baseline năm không dùng dữ liệu sau 31/12/2025.
- Cùng mức Hold 70, cùng tiền 1.000K/số và tỷ lệ ăn 84.

## Bao phủ pattern hiện tại

| Nhóm pattern | Số pattern | Chưa từng hình thành | Tỷ lệ |
|---|---:|---:|---:|
| So le theo thứ tự | 26.835 | 310 | 1,2% |
| Nhịp block A/B | 9.702 | 7.197 | 74,2% |
| Về theo thứ tự | 8.945 | 92 | 1,0% |
| Tiến/lùi đều | 3.328 | 57 | 1,7% |
| Tiến/lùi liên tiếp | 3.324 | 50 | 1,5% |
| So le thường | 3.247 | 30 | 0,9% |
| Tiến/lùi so le | 3.246 | 1.559 | 48,0% |
| Liên tiếp | 1.623 | 16 | 1,0% |
| So le theo cặp | 155 | 83 | 53,5% |

Theo đối tượng thống kê, nhóm Tổng có 44.385 pattern và 7.202 pattern chưa từng hình thành. Nhóm Bộ có 390 pattern nhưng 206 pattern chưa từng hình thành (52,8%). Vì vậy việc tiếp tục nhân thêm mọi hoán vị sẽ làm tăng mạnh sai số do kiểm định nhiều lần và tạo nhiều cảnh báo 100% giả do mẫu bằng 0.

## Sửa logic xác suất hình thành

Đã tách hai bài toán có mẫu số khác nhau:

1. Chuỗi đang diễn ra: `P(gãy | đã đạt độ dài hiện tại) = 1 - nextCount/currentCount`.
2. Chuỗi tiềm năng: `P(không hình thành target | đã có trạng thái tiền đề) = 1 - currentCount/previousCount`.

Trước đây chuỗi tiềm năng dùng tỷ lệ tiếp tục sau khi target đã hình thành. Điều đó không trả lời đúng câu hỏi "ngày mai target có hình thành không". Trường hợp `currentCount=0` và `previousCount=0` nay không được xem là bằng chứng 100% không hình thành.

## Phương pháp thử nghiệm

`numberAnnualCalibratedRisk` thực hiện:

- Co xác suất gãy về xác suất nền theo độ rộng tập số.
- Dùng cận Wilson và độ tin cậy theo cỡ mẫu.
- Dùng tần suất năm để đánh giá độ ổn định, không dùng tần suất thấp như bằng chứng độc lập.
- Khử trùng cùng tập số trong cùng họ chuỗi.
- Chỉ cộng các bằng chứng mạnh nhất từ tối đa sáu họ chuỗi khác nhau.

## Kết quả strict point-in-time

| Phương pháp | Trúng/ngày | Tỷ lệ trúng | Profit | ROI | Thua dài nhất |
|---|---:|---:|---:|---:|---:|
| Đề Song Song Block 85 + Small 65 | 25/44 | 56,82% | +174.000K | +9,03% | 4 |
| Chuỗi nhỏ trước Hold 70 | 17/44 | 38,64% | +108.000K | +8,18% | 9 |
| Rủi ro năm đã hiệu chỉnh | 15/44 | 34,09% | -60.000K | -4,55% | 8 |

Theo tháng, Đề Song Song đạt 19/30 ngày trong tháng 6 nhưng chỉ 6/14 ngày đầu tháng 7. Đây là dấu hiệu biến động chế độ; 44 ngày chưa đủ để khẳng định lợi thế dài hạn.

### Kiểm chứng walk-forward nhiều chế độ lịch

Để sàng lọc khả năng áp dụng thực tế, hệ thống tái sinh thống kê theo prefix D-1 trên mẫu cách 5 ngày. Bước 5 luân phiên qua các thứ trong tuần, tránh lấy cố định một ngày trong tuần. Mỗi năm dùng baseline chốt ngày 31/12 của năm trước.

| Giai đoạn | Phương pháp | Ngày mẫu | Tỷ lệ trúng | Profit | ROI | Thua dài nhất |
|---|---|---:|---:|---:|---:|---:|
| 2024 | Rủi ro năm đã hiệu chỉnh | 73 | 38,36% | +162.000K | +7,40% | 8 |
| 2024 | Đề Song Song | 73 | 42,47% | -562.000K | -17,75% | 6 |
| 2025 | Rủi ro năm đã hiệu chỉnh | 73 | 26,03% | -594.000K | -27,12% | 10 |
| 2025 | Đề Song Song | 73 | 39,73% | -753.000K | -23,61% | 5 |
| 2026 đến 14/07 | Rủi ro năm đã hiệu chỉnh | 39 | 35,90% | +6.000K | +0,51% | 6 |
| 2026 đến 14/07 | Đề Song Song | 39 | 58,97% | +217.000K | +12,65% | 6 |

Với dàn 30 số và tỷ lệ ăn 84, điểm hòa vốn là `30/84 = 35,71%`. Phương pháp tần suất vượt hòa vốn ở mẫu 2024, thấp hơn nhiều trong 2025 và chỉ sát hòa vốn ở 2026. Kết quả không đạt điều kiện ổn định theo chế độ lịch.

## Kết luận triển khai

- Hai tab Lịch sử và Mốc 20 năm đã dùng cùng phép hợp hai dàn và cùng phép lấy giao để đánh x2. Chúng chỉ khác mốc dữ liệu: rolling D-1 so với 31/12 năm trước.
- Không thay phương pháp mặc định bằng `numberAnnualCalibratedRisk` vì chưa vượt phương pháp hiện tại và đang lỗ trong kiểm chứng.
- `numberAnnualCalibratedRisk` chỉ được đăng ký dưới trạng thái `experimental`; không được đưa vào action dự đoán mặc định hoặc Telegram.
- Không bổ sung hàng loạt pattern tổ hợp mới trước khi có mẫu tiền đề và quy tắc khử trùng. Ưu tiên bổ sung metadata `previousCount`, họ chuỗi và tập số tương đương cho pattern hiện có.
- Với Lô, phương pháp mới chỉ được xem xét sau khi chạy riêng từng vị trí với baseline và prefix đúng vị trí. Không được lấy kết quả Đề rồi sao chép cho 27 vị trí.
- Bước nghiên cứu tiếp theo nên là walk-forward theo năm: 2016-2023 để thiết kế, 2024-2025 để chọn, 2026 làm holdout; đánh giá cả calibration, hit rate, profit và chuỗi thua.

## Tệp kiểm chứng

- `reports/research_true_pit_strategies_2026-07-15T04-05-07-109Z.json`
- `reports/research_true_pit_strategies_2026-07-15T04-49-01-246Z.json` (2024)
- `reports/research_true_pit_strategies_2026-07-15T04-49-52-258Z.json` (2025)
- `reports/research_true_pit_strategies_2026-07-15T04-41-30-001Z.json` (2026)
- `scripts/test-strict-point-in-time.js`
