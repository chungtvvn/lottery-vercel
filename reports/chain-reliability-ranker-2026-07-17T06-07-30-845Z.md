# Xếp hạng độ tin cậy gãy/không hình thành bằng replay phân cấp

## Thiết kế

- Candidate từng ngày được sinh strict point-in-time; baseline năm khóa tại 31/12 năm trước.
- Chuỗi active và potential được tách trạng thái. Potential chỉ học từ những ngày precursor thực sự xuất hiện trong replay.
- Partial pooling theo trạng thái → kỷ lục → độ rộng → độ dài → họ → pattern.
- Xác suất loại được co về xác suất nền của đúng tập số và trừ độ bất định trước khi dùng.
- Tập số tương đương được khử trùng; mỗi họ chỉ đóng góp bằng chứng mạnh nhất.
- Phương pháp chỉ hoán đổi vài số quanh `chainSmallFirst`, vẫn đánh đúng 30/100 số.

## Chọn cấu hình trước holdout

Cấu hình: `replay-m20-z1.28-s1`.

| Giai đoạn | Nền | Reliability ranker | Δ trúng | Δ profit |
|---|---:|---:|---:|---:|
| late-2024 | 4/13 (30.77%) | 4/13 (30.77%) | +0 | 0K |
| 2025 | 9/37 (24.32%) | 9/37 (24.32%) | +0 | 0K |

## Holdout 2026 chưa dùng để chọn cấu hình

| Phương pháp | Trúng | Profit | ROI | Thua dài nhất |
|---|---:|---:|---:|---:|
| chainSmallFirst | 68/191 (35.60%) | -18.000K | -0.31% | 9 |
| hierarchicalReplayCredibleHold70 | 68/191 (35.60%) | -18.000K | -0.31% | 9 |
| Chênh lệch | +0 | 0K | - | +0 |

McNemar exact: p = 1.000000.

## Theo tháng holdout

| Tháng | Ngày | Trúng | Tỷ lệ | Profit |
|---|---:|---:|---:|---:|
| 2026-01 | 31 | 10 | 32.26% | -90.000K |
| 2026-02 | 24 | 10 | 41.67% | 120.000K |
| 2026-03 | 31 | 11 | 35.48% | -6.000K |
| 2026-04 | 30 | 10 | 33.33% | -60.000K |
| 2026-05 | 31 | 10 | 32.26% | -90.000K |
| 2026-06 | 30 | 14 | 46.67% | 276.000K |
| 2026-07 | 14 | 3 | 21.43% | -168.000K |

## Nguồn bằng chứng được học

Trong holdout, 187 lần hoán đổi có 181 lần nhận hỗ trợ active và 91 lần nhận hỗ trợ potential (một swap có thể có cả hai).

| Cohort | Ngày bằng chứng | Nền loại | Posterior loại | Edge |
|---|---:|---:|---:|---:|
| pattern|tail|pairAlternation|potential|below-record|w99|d4|g1 | 23 | 47.83% | 55.21% | 7.38% |
| pattern|head|consecutive|active|below-record|w99|d2|g1 | 38 | 50.00% | 57.25% | 7.25% |
| family|block|active|below-record|w99|d5|g1 | 49 | 34.05% | 41.15% | 7.09% |
| pattern|block|blockAlternation|active|below-record|w99|d5|g1 | 49 | 34.05% | 41.11% | 7.06% |
| family|difference|active|below-record|w99|d5|g1 | 20 | 38.53% | 44.67% | 6.14% |
| pattern|block|blockAlternation|active|below-record|w99|d6p|g1 | 34 | 39.16% | 45.30% | 6.14% |
| family|sum|active|below-record|w99|d2|g1 | 43 | 42.63% | 48.74% | 6.11% |
| family|head|active|below-record|w99|d2|g1 | 38 | 50.00% | 55.31% | 5.31% |
| family|sum|potential|at-record|w20|d4|g1 | 26 | 82.15% | 87.42% | 5.27% |
| family|block|active|below-record|w99|d6p|g1 | 34 | 39.16% | 44.26% | 5.10% |

Cỡ mẫu trên là số **ngày**, không phải số candidate; các candidate tương quan trong cùng ngày đã được gộp để tránh phóng đại độ tin cậy.

## Độ nhạy cấu hình trên holdout (chỉ chẩn đoán sau chấm)

Bảng này không được dùng để chọn lại cấu hình. Nó cho biết việc chọn tham số theo 2026 sẽ gây overfit ra sao.

| Cấu hình | Δ trúng | Profit | Thua dài nhất |
|---|---:|---:|---:|
| replay-m10-z0.67-s4 | +4 | 318.000K | 10 |
| replay-m10-z1.28-s4 | +4 | 318.000K | 12 |
| replay-m20-z1.28-s4 | +3 | 234.000K | 12 |
| replay-m20-z1.28-s2 | +1 | 66.000K | 9 |
| replay-m10-z1.28-s1 | +0 | -18.000K | 9 |
| replay-m20-z0.67-s1 | +0 | -18.000K | 9 |
| replay-m20-z0.67-s2 | +0 | -18.000K | 12 |
| replay-m20-z0.67-s4 | +0 | -18.000K | 12 |
| replay-m20-z1.28-s1 | +0 | -18.000K | 9 |
| replay-m10-z0.67-s1 | -1 | -102.000K | 9 |
| replay-m10-z0.67-s2 | -2 | -186.000K | 9 |
| replay-m10-z1.28-s2 | -3 | -270.000K | 12 |

## Quyết định

**do-not-promote**

Chưa đủ bằng chứng để thay production. Giữ research-only; không sửa dự đoán đã phát hành.

Giới hạn hiện tại: tập train strict có 37 ngày lấy mẫu cho 2024 và 37 ngày cho 2025. Vì vậy tín hiệu cohort đủ để thử nghiệm nhưng chưa đủ để coi là xác suất ổn định dài hạn.

> Kết quả lịch sử là bằng chứng thực nghiệm, không bảo đảm lợi nhuận tương lai.
