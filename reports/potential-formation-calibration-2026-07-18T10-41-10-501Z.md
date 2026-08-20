# Hiệu chỉnh khả năng hình thành chuỗi tiềm năng bằng daily replay

## Thiết kế

- Mỗi candidate tiềm năng xuất hiện trong một ngày strict PIT là đúng một cơ hội tiền đề.
- Kết quả thuộc tập số candidate = hình thành; ngoài tập = không hình thành.
- Candidate tương quan trong cùng cohort/ngày được gộp thành một đơn vị ngày trước khi fit.
- Partial pooling theo độ rộng tập số → họ → trạng thái kỷ lục/độ dài → pattern → tần suất/độ dài trung bình.
- Chọn cấu hình trên validation; holdout không tham gia chọn tham số.

Baseline dàn số: `chainSmallFirst`.
Cấu hình chọn trước holdout: `potential-z0-s1-m16`.

## Kết quả validation

| Phương pháp | Trúng | Profit | ROI | TB hoán đổi |
|---|---:|---:|---:|---:|
| Baseline | 14/37 (37.84%) | 66.000K | 5.95% | 0 |
| Potential calibrated | 15/37 (40.54%) | 150.000K | 13.51% | 1.00 |

## Holdout

| Phương pháp | Trúng | Profit | ROI | Thua dài nhất |
|---|---:|---:|---:|---:|
| Baseline | 15/39 (38.46%) | 90.000K | 7.69% | 6 |
| Potential calibrated | 16/39 (41.03%) | 174.000K | 14.87% | 6 |
| Chênh lệch | +1 | 84.000K | - | +0 |

Đối chiếu cặp ngày: candidate-only 1, baseline-only 0, cùng trúng 15, cùng trượt 23.

## Chất lượng xác suất chuỗi tiềm năng

| Giai đoạn | Brier nền | Brier hiệu chỉnh | Δ Brier | Log loss nền | Log loss hiệu chỉnh | Δ log loss |
|---|---:|---:|---:|---:|---:|---:|
| Validation | 0.139854 | 0.139854 | -0.000001 | 0.438338 | 0.438934 | 0.000596 |
| Holdout | 0.162142 | 0.162308 | 0.000166 | 0.488024 | 0.488650 | 0.000625 |

Giá trị Δ âm là cải thiện. Việc giảm Brier/log loss quan trọng hơn một vài ngày trúng tăng do mẫu holdout còn nhỏ.

## Quyết định

**do-not-promote**: chưa có cải thiện ngoài mẫu đủ nhất quán; không thay production.

> Backtest lịch sử không bảo đảm lợi nhuận tương lai.
