# Backtest strict PIT từ đầu năm 2026 đến hiện tại

## Phạm vi và nguyên tắc

- Khoảng kiểm tra: `2026-01-01` đến `2026-07-26`.
- Số ngày có kết quả: **203 ngày**.
- Mỗi ngày chỉ dùng dữ liệu có trước ngày dự đoán; chuỗi và bằng chứng từng số được dựng lại tại đúng thời điểm đó.
- Mỗi phương pháp loại 70 số, đánh 30 số.
- Tiền đánh: `1.000K` mỗi số; trúng nhận `84.000K`.
- Tỷ lệ hòa vốn: `30 / 84 = 35,714286%`.
- Tập 2026 là holdout đầy đủ theo ngày. Cấu hình cải tiến được chọn bằng mẫu tuần 2024/2025, không chọn lại bằng kết quả 2026.

## Kết quả tổng hợp

| Phương pháp | Trúng/ngày | Tỷ lệ trúng | Wilson 95% | Profit | ROI | Chuỗi thua dài nhất |
|---|---:|---:|---:|---:|---:|---:|
| Nhịp Block trước (`chainBlockFirst`) | 66/203 | **32,5123%** | 26,45%-39,23% | **-546.000K** | -8,97% | 10 |
| Chuỗi nhỏ trước (`chainSmallFirst`) | 63/203 | 31,0345% | 25,07%-37,70% | -798.000K | -13,10% | 17 |
| Survival credible từng số | 63/203 | 31,0345% | 25,07%-37,70% | -798.000K | -13,10% | **9** |
| Chấm điểm chuỗi + số | 62/203 | 30,5419% | 24,62%-37,19% | -882.000K | -14,48% | 11 |
| Stable Lift đa năm | 61/203 | 30,0493% | 24,16%-36,68% | -966.000K | -15,86% | 17 |
| Posterior Bootstrap | 56/203 | 27,5862% | 21,90%-34,11% | -1.386.000K | -22,76% | 13 |

Không phương pháp nào vượt tỷ lệ hòa vốn hoặc có profit dương trên holdout đầy đủ. Vì vậy không phương pháp thử nghiệm nào đủ điều kiện thay thế production.

## Ensemble online

Các dàn ngày D được tạo trước khi kết quả D được dùng để cập nhật trọng số. Prior, decay và cách gộp được cố định, không chọn lại bằng kết quả holdout.

| Biến thể | Trúng/ngày | Tỷ lệ trúng | Profit | ROI | Chuỗi thua dài nhất |
|---|---:|---:|---:|---:|---:|
| Chọn expert tốt nhất theo Beta online | 65/203 | 32,0197% | -630.000K | -10,34% | 17 |
| Chọn expert tốt nhất theo EMA online | 65/203 | 32,0197% | -630.000K | -10,34% | 17 |
| Bỏ phiếu theo EMA | 64/203 | 31,5271% | -714.000K | -11,72% | 15 |
| Bỏ phiếu theo Beta | 61/203 | 30,0493% | -966.000K | -15,86% | 17 |
| Đồng thuận đa phương pháp | 61/203 | 30,0493% | -966.000K | -15,86% | 17 |

Biến thể online tốt nhất vẫn kém Block 1 ngày trúng và `84.000K`, nên không được promote.

## Nhịp Block theo tháng

Đây là phương pháp tốt nhất trong lần kiểm tra này.

| Tháng | Trúng/ngày | Tỷ lệ trúng | Profit | ROI |
|---|---:|---:|---:|---:|
| 2026-01 | 12/31 | 38,7097% | +78.000K | +8,39% |
| 2026-02 | 8/24 | 33,3333% | -48.000K | -6,67% |
| 2026-03 | 7/31 | 22,5806% | -342.000K | -36,77% |
| 2026-04 | 12/30 | 40,0000% | +108.000K | +12,00% |
| 2026-05 | 10/31 | 32,2581% | -90.000K | -9,68% |
| 2026-06 | 12/30 | 40,0000% | +108.000K | +12,00% |
| 2026-07 | 5/26 | 19,2308% | -360.000K | -46,15% |

Chỉ 3/7 tháng có profit dương. Tháng 3 và tháng 7 làm mất phần lớn lợi nhuận của các tháng tốt.

## Chuỗi nhỏ trước theo tháng

| Tháng | Trúng/ngày | Tỷ lệ trúng | Profit | ROI |
|---|---:|---:|---:|---:|
| 2026-01 | 12/31 | 38,7097% | +78.000K | +8,39% |
| 2026-02 | 12/24 | 50,0000% | +288.000K | +40,00% |
| 2026-03 | 7/31 | 22,5806% | -342.000K | -36,77% |
| 2026-04 | 13/30 | 43,3333% | +192.000K | +21,33% |
| 2026-05 | 3/31 | 9,6774% | -678.000K | -72,90% |
| 2026-06 | 11/30 | 36,6667% | +24.000K | +2,67% |
| 2026-07 | 5/26 | 19,2308% | -360.000K | -46,15% |

Chuỗi nhỏ trước có 4/7 tháng dương nhưng độ bất ổn cao; tháng 5 có chuỗi thua 16 ngày và xóa lợi nhuận của các tháng tốt.

## Survival credible từng số theo tháng

| Tháng | Trúng/ngày | Tỷ lệ trúng | Profit | ROI |
|---|---:|---:|---:|---:|
| 2026-01 | 8/31 | 25,8065% | -258.000K | -27,74% |
| 2026-02 | 7/24 | 29,1667% | -132.000K | -18,33% |
| 2026-03 | 10/31 | 32,2581% | -90.000K | -9,68% |
| 2026-04 | 10/30 | 33,3333% | -60.000K | -6,67% |
| 2026-05 | 10/31 | 32,2581% | -90.000K | -9,68% |
| 2026-06 | 7/30 | 23,3333% | -312.000K | -34,67% |
| 2026-07 | 11/26 | 42,3077% | +144.000K | +18,46% |

Phương pháp mới chỉ dương trong tháng 7. Chuỗi thua tối đa giảm còn 9 ngày nhưng xác suất tổng không tăng.

## Kiểm tra khả năng khái quát

### Chấm điểm chuỗi + số

- Được chọn trên validation 2025 vì tăng từ 15 lên 17 ngày trúng.
- Sang holdout đầy đủ 2026 giảm từ 66 xuống 62 ngày trúng so với Block.
- Profit giảm thêm `336.000K`.
- Kết luận: tín hiệu đã overfit validation, không đưa vào production.

### Stable Lift đa năm

- Sau khi sửa tie-break để số bằng điểm giữ nguyên thứ tự nền, kết quả còn 61/203 ngày.
- Kém Block 5 ngày trúng và `420.000K`.
- Kết luận: không đưa vào production.

### Posterior Bootstrap

- Từng cải thiện trên mẫu tuần cuối 2024 và năm 2025.
- Holdout đầy đủ chỉ đạt 56/203 ngày, Wilson upper 95% là 34,11%, vẫn dưới hòa vốn.
- Kết luận: không đưa vào production.

### Full-daily 2024-2025 khác fingerprint

- Bộ PIT đầy đủ cũ có 362 ngày năm 2024 và 361 ngày năm 2025.
- Fingerprint các generator/service khác phiên bản đang tạo dữ liệu 2026.
- Khi thử như một phép kiểm tra phụ, Posterior chỉ đạt 44/203 ngày (21,6749%), profit `-2.394.000K`.
- Không được trộn bộ dữ liệu này vào huấn luyện production. Cần tái sinh 2024-2025 bằng cùng revision hiện tại trước khi tiếp tục hiệu chỉnh.

## Kết luận

1. **Nhịp Block trước là phương pháp ít lỗ nhất**, không phải phương pháp có lợi nhuận.
2. Việc chuyển từ mẫu tuần sang toàn bộ ngày làm lộ rõ overfit của các bộ chấm điểm mới.
3. Chưa có bằng chứng thống kê để khẳng định xác suất thực vượt hòa vốn 35,714%.
4. Không thay đổi production bằng kết quả lần thử này.
5. Hướng nghiên cứu tiếp theo nên tập trung vào cơ chế bỏ ngày có cận dưới tin cậy vượt hòa vốn, thay vì bắt buộc đánh đủ 30 số mỗi ngày.

## Tệp kiểm toán

- Dữ liệu PIT đầy đủ: `reports/research_true_pit_strategies_2026-07-27T17-07-38-004Z.json`
- Chấm điểm chuỗi + số: `reports/research_chain_number_score_2026-07-27T17-08-03-724Z.json`
- Stable Lift: `reports/research_cross_year_stable_lift_2026-07-27T17-08-27-096Z.json`
- Posterior Bootstrap: `reports/strict-posterior-bootstrap-2026-07-27T17-09-13-523Z.json`
- Ensemble online: `reports/research_online_consensus_2026-07-27T17-19-08-569Z.json`
- Posterior dùng full-daily khác fingerprint (chỉ chẩn đoán): `reports/strict-posterior-bootstrap-2026-07-27T17-17-10-900Z.json`
