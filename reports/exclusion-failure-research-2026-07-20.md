# Nghiên cứu nguyên nhân loại trừ sai và hiệu chỉnh rủi ro

## Phạm vi kiểm chứng

- Baseline: `chainSmallFirst`, Hold 70, đánh 30 số, 1000K/số, ăn 84.
- Dữ liệu strict point-in-time có candidate diagnostics: 632 ngày.
- 2014-2025 lấy mẫu mỗi 10 ngày; 2026 dùng đủ 191 ngày đã có trong snapshot nghiên cứu.
- Train: 2014-2020; chọn cấu hình: 2021-2023; test: 2024-2025; holdout: 2026.
- Mỗi candidate được khử trùng theo trạng thái, family, pattern, record state, độ rộng, độ dài và tập số.

## Những ngày sai chủ yếu rơi vào đâu

Baseline sai 424/632 ngày, tỷ lệ trúng 32,91%.

| Phân loại trội của số thực tế trong ngày sai | Ngày | Tỷ trọng |
|---|---:|---:|
| Chuỗi active ở kỷ lục vẫn tiếp tục, phá kỷ lục | 286 | 67,45% |
| Chuỗi đã siêu kỷ lục vẫn tiếp tục | 77 | 18,16% |
| Chuỗi tiềm năng hình thành lần đầu là tín hiệu trội | 61 | 14,39% |

Không được đọc bảng trên như quan hệ nhân quả. Số thực tế trong một ngày sai đồng thời thuộc trung bình 132,3 bằng chứng sau khử trùng và 6,3 family. Do đó một ngày có thể vừa mang tín hiệu phá kỷ lục, vừa mang hàng chục tín hiệu hình thành lần đầu.

## Tín hiệu có và không có khả năng phân biệt

| Tín hiệu gắn với số thực tế | Số ngày có tín hiệu | Tỷ lệ sai | Lift so với mức sai chung |
|---|---:|---:|---:|
| Tiềm năng hình thành ở biên kỷ lục | 488 | 77,66% | 1,158 |
| Active ở kỷ lục tiếp tục | 511 | 70,06% | 1,044 |
| Active đã siêu kỷ lục tiếp tục | 112 | 68,75% | 1,025 |
| Active gần kỷ lục tiếp tục | 606 | 67,49% | 1,006 |
| Hình thành lần đầu | 632 | 67,09% | 1,000 |

Kết luận:

1. `potential-first-formation` phủ 632/632 ngày, vì vậy điều kiện “chưa từng hình thành” đứng riêng không phân biệt ngày/số nguy hiểm.
2. `block` cũng xuất hiện với số thực tế ở 632/632 ngày và đóng góp trung bình 84,8 bằng chứng trên mỗi ngày sai. Cộng thẳng số chuỗi block làm phóng đại độ tin cậy do tương quan.
3. `potential-record-formation` là tín hiệu theo ngày ổn định nhất: lift 1,085 ở train, 1,156 ở validation, 1,122 ở test và 1,305 ở holdout. Tuy nhiên lift theo ngày chưa đủ để xác định đúng số cần bảo vệ.
4. Dữ liệu không hỗ trợ quy tắc cứng “đạt kỷ lục luôn loại trước”. Có những giai đoạn chuỗi siêu kỷ lục tiếp tục ít hơn mức sai chung, và có giai đoạn lại cao hơn.

## Dataset kiểm chứng rủi ro

File `exclusion-failure-risk-dataset-2026-07-20T07-56-47-855Z.jsonl` có 63.200 dòng, tương ứng 100 số x 632 ngày. Mỗi dòng chứa:

- ngày dự đoán và kết quả thực tế;
- số có bị baseline loại hay không;
- nhãn số thực tế và nhãn loại trừ sai;
- nhóm nguyên nhân;
- số family, active/potential, Tier 1;
- độ rộng tập số nhỏ nhất;
- tần suất trung bình;
- danh sách family và pattern sau khử trùng.

Dataset này là nguồn train/kiểm chứng, không được shuffle xuyên thời gian. Không dùng kết quả 2026 để chọn trọng số.

## Kết quả áp dụng bộ hiệu chỉnh

Mô hình phân tầng dùng Beta shrinkage, chọn cấu hình trên từng năm 2021-2023, giữ nguyên 30 số và chỉ swap tối đa ba số có nguy cơ bị loại sai.

| Giai đoạn | Baseline | Hiệu chỉnh | Chênh lệch | Profit hiệu chỉnh | Thua dài nhất |
|---|---:|---:|---:|---:|---:|
| Test 2024-2025 | 23/74 | 23/74 | 0 hit | -288.000K | 15 |
| Holdout 2026 | 68/191 | 68/191 | 0 hit | -18.000K | 10, baseline 9 |

Paired comparison:

- Test: cứu đúng một ngày nhưng làm sai một ngày khác.
- Holdout: cứu đúng năm ngày nhưng làm sai năm ngày khác.
- Tỷ lệ hòa vốn Hold 70 là 30/84 = 35,714%; cả baseline và hiệu chỉnh 2026 đạt 35,602%, còn thấp hơn hòa vốn.

Một guard riêng cho `potential-record-formation` cũng không qua kiểm chứng: cấu hình được chọn trên validation mất bốn hit ở test và ba hit ở holdout. Vì vậy chưa có thay đổi production nào được áp dụng.

## Hướng sử dụng đúng

1. Dùng dataset để theo dõi calibration theo năm, không dùng đếm số chuỗi làm score.
2. Mỗi family chỉ đóng góp tối đa một bằng chứng đại diện; riêng block phải giới hạn chặt hơn vì phủ toàn bộ 100 số.
3. `potential-record-formation` chỉ nên là feature xác suất đã co mẫu, không phải veto cứng.
4. Dataset candidate diagnostics 2014-2025 hiện mới lấy mẫu mỗi 10 ngày. Tuy nhiên, bộ dàn của 13 phương pháp chuẩn đã có full-daily strict PIT cho 2016-2026 và đã được dùng trong thử nghiệm membership bên dưới.
5. Chỉ thay production nếu một phiên bản tiếp theo tăng hit/profit ở cả test và holdout, không làm chuỗi thua dài tăng quá 20%, và dự đoán đã phát hành vẫn bất biến.

## Huấn luyện membership full-daily 2016-2026

Để tăng cỡ mẫu mà không phải sinh lại candidate diagnostics nặng, thử nghiệm tiếp theo học từ việc từng số có/không nằm trong dàn của 11 phương pháp đã khử bớt phương pháp trùng. Mô hình softmax được co L2 mạnh và chỉ được hoán đổi tối đa 1-5 số quanh dàn `chainSmallFirst`, luôn giữ đúng 30 số/ngày.

Quy trình cố định:

- train ban đầu: 2016-2020;
- chọn L2/số swap: 2021-2023, tối ưu chênh lệch năm tệ nhất;
- test: 2024-2025;
- untouched holdout: 2026;
- baseline không thay đổi cũng là một candidate, tránh bắt buộc chọn mô hình phức tạp.

Kết quả mô hình expanding, swap 5:

| Giai đoạn | Baseline | Candidate | Chênh lệch | Profit candidate | Thua dài nhất |
|---|---:|---:|---:|---:|---:|
| Validation 2021-2023 | 318/1.083 | 331/1.083 | +13 hit | - | - |
| Test 2024-2025 | 206/723 | 210/723 | +4 hit | -4.050.000K | 19, baseline 14 |
| Holdout 2026 | 68/187 | 61/187 | -7 hit | -486.000K | 11, baseline 9 |

Biến thể huấn luyện lại trước từng năm, chọn cửa sổ 3 năm/5 năm/expanding chỉ trên 2021-2023, đã giảm mức suy giảm holdout nhưng vẫn không qua kiểm chứng:

| Giai đoạn | Baseline | Rolling expanding swap 5 | Chênh lệch | Profit candidate |
|---|---:|---:|---:|---:|
| Validation 2021-2023 | 318/1.083 | 329/1.083 | +11 hit | - |
| Test 2024-2025 | 206/723 | 213/723 | +7 hit | -3.798.000K |
| Holdout 2026 | 68/187 | 66/187 | -2 hit | -66.000K |

Chi tiết theo năm cho rolling candidate: 2024 tăng 11 hit, nhưng 2025 giảm 4 hit và 2026 giảm 2 hit. Audit xác nhận cùng 723/187 ngày, cùng 30 số, cùng stake và payout. Vì vậy kết quả tốt ở 2021-2024 là phụ thuộc chế độ, không phải cải thiện bền vững.

### Kết luận huấn luyện

1. Train nhiều năm hơn và regularization mạnh không tự giải quyết được regime shift.
2. `activeOnlyAvgRisk` và `numberLikelihoodRatio` giúp bảo vệ số ở một số năm, nhưng quan hệ đảo chiều trong 2025-2026.
3. Candidate hiện tại không được đưa vào production; baseline đang chạy được giữ nguyên.
4. Bước tiếp theo cần chuyển từ trọng số membership toàn cục sang calibration theo trạng thái chuỗi có độ ổn định qua năm, hoặc mô hình abstain có holdout tương lai mới. Không tiếp tục dùng 2026 để chỉnh tham số vì holdout này đã được mở.
