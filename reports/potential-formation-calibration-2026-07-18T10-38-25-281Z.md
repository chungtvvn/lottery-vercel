# Hiệu chỉnh khả năng hình thành chuỗi tiềm năng bằng daily replay

## Thiết kế

- Mỗi candidate tiềm năng xuất hiện trong một ngày strict PIT là đúng một cơ hội tiền đề.
- Kết quả thuộc tập số candidate = hình thành; ngoài tập = không hình thành.
- Candidate tương quan trong cùng cohort/ngày được gộp thành một đơn vị ngày trước khi fit.
- Partial pooling theo độ rộng tập số → họ → trạng thái kỷ lục/độ dài → pattern → tần suất/độ dài trung bình.
- Chọn cấu hình trên validation; holdout không tham gia chọn tham số.

Baseline dàn số: `numberAnnualCalibratedRisk`.
Cấu hình chọn trước holdout: `potential-z0.67-s1-m16`.

## Kết quả validation

| Phương pháp | Trúng | Profit | ROI | TB hoán đổi |
|---|---:|---:|---:|---:|
| Baseline | 13/37 (35.14%) | -18.000K | -1.62% | 0 |
| Potential calibrated | 14/37 (37.84%) | 66.000K | 5.95% | 1.00 |

## Holdout

| Phương pháp | Trúng | Profit | ROI | Thua dài nhất |
|---|---:|---:|---:|---:|
| Baseline | 15/39 (38.46%) | 90.000K | 7.69% | 5 |
| Potential calibrated | 14/39 (35.90%) | 6.000K | 0.51% | 5 |
| Chênh lệch | -1 | -84.000K | - | +0 |

Đối chiếu cặp ngày: candidate-only 0, baseline-only 1, cùng trúng 14, cùng trượt 24.

## Chất lượng xác suất chuỗi tiềm năng

| Giai đoạn | Brier nền | Brier hiệu chỉnh | Δ Brier | Log loss nền | Log loss hiệu chỉnh | Δ log loss |
|---|---:|---:|---:|---:|---:|---:|
| Validation | 0.155990 | 0.156295 | 0.000305 | 0.474829 | 0.475746 | 0.000917 |
| Holdout | 0.162142 | 0.162125 | -0.000017 | 0.488024 | 0.488041 | 0.000016 |

Giá trị Δ âm là cải thiện. Việc giảm Brier/log loss quan trọng hơn một vài ngày trúng tăng do mẫu holdout còn nhỏ.

## Quyết định

**do-not-promote**: chưa có cải thiện ngoài mẫu đủ nhất quán; không thay production.

> Backtest lịch sử không bảo đảm lợi nhuận tương lai.
