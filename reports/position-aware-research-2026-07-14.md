# Nghiên cứu xếp hạng theo 27 vị trí - 14/07/2026

## Phạm vi và dữ liệu

- Nguồn: snapshot R2 gồm 7.490 ngày, từ `2005-10-01` đến `2026-07-13`.
- SHA-256 snapshot: `c9e165feb53b79bcb68c1da5cc7699bcb9f804ed177e91eba0a4d55458aaafc4`.
- Đề: chọn đúng 30 số, mỗi số 1.000K, trúng nhận 84.000K. Tỷ lệ hòa vốn là `35,714%` ngày trúng.
- Lô: mỗi số 2.200K, mỗi lần xuất hiện nhận 8.000K. Profit được tính theo tổng số lần xuất hiện trong 27 vị trí, không dùng riêng tỷ lệ ngày có ít nhất một hit.
- Mỗi ngày D chỉ dùng raw data đến D-1. Baseline năm Y chỉ dùng dữ liệu đến `31/12/(Y-1)`.

## Sửa lỗi PIT trong lần nghiên cứu này

`buildPositionDailyPredictions` trước đây có thể khởi tạo tập pattern baseline từ prefix của ngày đầu cửa sổ backtest. Nếu cửa sổ bắt đầu giữa năm, tập key có thể chứa pattern mới xuất hiện trong chính năm đang kiểm tra, dù metric sau đó được lọc về 31/12 năm trước.

Bản sửa mới:

1. Sinh riêng thống kê baseline bằng raw data kết thúc ở 31/12 năm trước.
2. Sinh lại trạng thái chuỗi của từng vị trí bằng prefix chính xác đến D-1.
3. Từ chối `fixedBaselineYear` nằm sau năm mục tiêu.
4. Cache vị trí mang version `position-pit-annual-baseline-v2` và kiểm tra cả fingerprint dữ liệu/cấu hình.

Đối chiếu tập số trên mẫu strict trước/sau sửa đạt 120/120 trường hợp giống nhau; thay đổi này khóa lại provenance và tập pattern, không sửa kết quả ngày bằng dữ liệu tương lai.

## Các cách tiếp cận đã kiểm tra

### Chuỗi truyền thống

- Chuỗi nhỏ trước, nhịp block trước, chuỗi có độ tin cậy cao.
- Posterior diversity, likelihood ratio, Edge khử trùng và Dropoff khử trùng.
- Nhiều ngưỡng Hold 65/70/75/85; số sống qua ngưỡng cao hơn nhận điểm an toàn cao hơn.

### Kết hợp hiện đại

- Beta/Bayes shrinkage cho độ tin cậy từng vị trí.
- Posterior riêng cho từng cặp `vị trí x chiến lược`; chỉ cập nhật sau khi ngày đã kết toán.
- Kết hợp điểm giải ĐB với tín hiệu chéo 26 vị trí còn lại.
- Tần suất dài hạn và EMA 90 ngày, cập nhật online sau kết quả.
- Softmax đa lớp với regularization, chọn hyperparameter ở 2024-2025 và khóa kiểm tra 2026.
- Moving-block bootstrap theo block 7 ngày để tránh coi các ngày gần nhau là độc lập hoàn toàn.

## Kết quả Đề strict dài hạn

Phương pháp được chọn hoàn toàn trên training 2016-2023 là `activeOnlyAvgRisk`:

| Giai đoạn | Ngày | Trúng | Tỷ lệ | Profit | ROI | Chuỗi thua dài nhất |
|---|---:|---:|---:|---:|---:|---:|
| 2016-2023 training | 2.868 | 897 | 31,276% | -10.692.000K | -12,43% | 17 |
| 2024-2025 validation | 723 | 228 | 31,535% | -2.538.000K | -11,70% | 19 |
| 2026 holdout | 187 | 61 | 32,620% | -486.000K | -8,66% | 7 |

Kết luận: chưa đạt mức hòa vốn 35,714%. Không có bằng chứng strict dài hạn để thay phương pháp production bằng một ranker mới.

Softmax đạt 32,089% ở validation nhưng giảm còn 25,134% ở holdout 2026, ROI -29,63%. Mô hình bị bác bỏ vì overfit.

## Kết quả feasibility 27 vị trí

Do sinh exact-prefix cho 27 vị trí rất tốn tài nguyên, lần chạy này dùng 7 ngày `2026-07-07` đến `2026-07-13`; 4 ngày đầu chỉ để chọn cấu hình và 3 ngày cuối là holdout. Đây không phải mẫu đủ lớn để triển khai.

### Xếp hạng vị trí mới

- Cấu hình Đề được chọn từ 4 ngày đầu: `chainBlockFirst`, dùng hoàn toàn tín hiệu chéo 27 vị trí.
- Calibration: 3/4 ngày trúng.
- Holdout: 0/3 ngày trúng, profit -90.000K.
- Kết luận: thất bại ngoài mẫu; không triển khai.

### Lô theo posterior vị trí mới

- Cấu hình được chọn từ 4 ngày đầu: Chuỗi nhỏ, trọng số vị trí online, Top 20.
- Calibration: trung bình 7,25 hit/ngày, profit +56.000K.
- Holdout: trung bình 4 hit/ngày, profit -36.000K, ROI -27,27%.
- Dù 3/3 ngày đều có ít nhất 2 hit, Top 20 cần trung bình 5,5 hit/ngày mới hòa vốn. Do đó tỷ lệ hit-day không phản ánh hiệu quả tiền.

### Đối chứng tổng hợp hiện tại

Khi chỉ chọn cấu hình bằng 4 ngày đầu:

- `chainSmallFirst Hold75 + twoHitGreedy + Top20`: holdout 17 hit/3 ngày, profit +4.000K.
- `chainSmallFirst Hold75 + twoHitGreedy + Top6`: holdout 6 hit/3 ngày, profit +8.400K.
- Đây chỉ là tín hiệu thăm dò 3 ngày, chưa đủ vượt random benchmark hoặc đủ điều kiện đổi mặc định.

## Các kết quả bị loại khỏi so sánh

- Báo cáo Lô cũ có `strictPointInTime:false` hoặc chỉ 1-3 ngày.
- Ranker cũ khoảng 74% dùng full-history index/feature không cùng giao thức strict-prefix.
- Chế độ tối ưu dùng một index toàn lịch sử chỉ khớp exact 15/120 trường hợp (12,5%), nên đã bị hủy.
- Phương pháp Đề song song có khoảng 40-50 đơn vị cược thực tế/ngày không được so như dàn cố định 30 số. Phải tính đủ số unique và tiền x2.

## Kết luận triển khai

1. Chưa đổi phương pháp production từ nghiên cứu này.
2. Giữ pipeline strict-prefix và cache version mới; đây là sửa lỗi tính toàn vẹn dữ liệu, không phải thay chiến lược.
3. Ứng viên Lô đáng chạy dài tiếp theo là `chainSmallFirst Hold75 + twoHitGreedy`, so sánh Top 6/7/10/14/20 bằng profit và số ngày dưới ngưỡng hòa vốn.
4. Muốn kết luận đáng tin cậy cần cache checkpoint theo từng năm/vị trí, chạy tối thiểu training 2016-2023, validation 2024-2025 và holdout 2026; không chọn cấu hình bằng chính holdout.

## Tệp bằng chứng

- `reports/strict_pit_all_methods_2016_2026.json`
- `reports/research_strict_pit_ensemble_2026-07-13T14-58-02-032Z.json`
- `reports/research_strict_softmax_2026-07-14T08-50-18-324Z.json`
- `reports/research_position_aware_2026-07-14.json`
- `reports/backtest_loto_milestone20y_2026-07-14T09-43-46.json`
