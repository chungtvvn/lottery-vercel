# Xếp hạng độ tin cậy gãy/không hình thành bằng replay phân cấp

## Thiết kế

- Candidate từng ngày được sinh strict point-in-time; baseline năm khóa tại 31/12 năm trước.
- Chuỗi active và potential được tách trạng thái. Potential chỉ học từ những ngày precursor thực sự xuất hiện trong replay.
- Partial pooling theo trạng thái → kỷ lục → độ rộng → độ dài → họ → pattern.
- Xác suất loại được co về xác suất nền của đúng tập số và trừ độ bất định trước khi dùng.
- Tập số tương đương được khử trùng; mỗi họ chỉ đóng góp bằng chứng mạnh nhất.
- Phương pháp chỉ hoán đổi vài số quanh `chainSmallFirst`, vẫn đánh đúng 30/100 số.

## Chọn cấu hình trước holdout

Cấu hình: `replay-m10-z0.67-s4`.

| Giai đoạn | Nền | Reliability ranker | Δ trúng | Δ profit |
|---|---:|---:|---:|---:|
| late-2024 | 3/18 (16.67%) | 3/18 (16.67%) | +0 | 0K |
| 2025 | 15/52 (28.85%) | 16/52 (30.77%) | +1 | 84.000K |

## Holdout 2026 chưa dùng để chọn cấu hình

| Phương pháp | Trúng | Profit | ROI | Thua dài nhất |
|---|---:|---:|---:|---:|
| chainSmallFirst | 63/203 (31.03%) | -798.000K | -13.10% | 17 |
| hierarchicalReplayCredibleHold70 | 61/203 (30.05%) | -966.000K | -15.86% | 18 |
| Chênh lệch | -2 | -168.000K | - | +1 |

McNemar exact: p = 0.814529.

## Theo tháng holdout

| Tháng | Ngày | Trúng | Tỷ lệ | Profit |
|---|---:|---:|---:|---:|
| 2026-01 | 31 | 11 | 35.48% | -6.000K |
| 2026-02 | 24 | 13 | 54.17% | 372.000K |
| 2026-03 | 31 | 6 | 19.35% | -426.000K |
| 2026-04 | 30 | 13 | 43.33% | 192.000K |
| 2026-05 | 31 | 3 | 9.68% | -678.000K |
| 2026-06 | 30 | 10 | 33.33% | -60.000K |
| 2026-07 | 26 | 5 | 19.23% | -360.000K |

## Nguồn bằng chứng được học

Trong holdout, 804 lần hoán đổi có 804 lần nhận hỗ trợ active và 11 lần nhận hỗ trợ potential (một swap có thể có cả hai).

| Cohort | Ngày bằng chứng | Nền loại | Posterior loại | Edge |
|---|---:|---:|---:|---:|
| pattern|difference|upDownAlternation|active|below-record|w99|d4|g1 | 11 | 28.55% | 48.49% | 19.94% |
| pattern|difference|downUpAlternation|active|below-record|w99|d4|g1 | 10 | 33.60% | 46.97% | 13.37% |
| pattern|sum|upDownAlternation|active|below-record|w99|d4|g1 | 14 | 26.68% | 39.90% | 13.22% |
| pattern|sum|up|active|below-record|w99|d2|g1 | 11 | 36.05% | 47.51% | 11.46% |
| pattern|block|blockAlternation|active|near-record|w40|d6p|g1 | 52 | 71.61% | 81.00% | 9.39% |
| family|block|active|near-record|w40|d6p|g1 | 52 | 71.61% | 80.15% | 8.54% |
| pattern|sum|down|active|below-record|w99|d2|g1 | 30 | 39.38% | 46.65% | 7.27% |
| pattern|difference|consecutive|active|below-record|w40|d4|g1 | 30 | 65.42% | 72.53% | 7.11% |
| state|active|near-record|w40|d6p|g1 | 57 | 71.03% | 78.14% | 7.11% |
| pattern|difference|pairAlternation|active|below-record|w99|d4|g1 | 16 | 40.12% | 47.15% | 7.02% |

Cỡ mẫu trên là số **ngày**, không phải số candidate; các candidate tương quan trong cùng ngày đã được gộp để tránh phóng đại độ tin cậy.

## Độ nhạy cấu hình trên holdout (chỉ chẩn đoán sau chấm)

Bảng này không được dùng để chọn lại cấu hình. Nó cho biết việc chọn tham số theo 2026 sẽ gây overfit ra sao.

| Cấu hình | Δ trúng | Profit | Thua dài nhất |
|---|---:|---:|---:|
| replay-m10-z1.28-s4 | +1 | -714.000K | 18 |
| replay-m20-z0.67-s1 | +1 | -714.000K | 18 |
| replay-m20-z0.67-s4 | +0 | -798.000K | 18 |
| replay-m20-z1.28-s1 | +0 | -798.000K | 19 |
| replay-m10-z1.28-s2 | -1 | -882.000K | 23 |
| replay-m20-z1.28-s2 | -1 | -882.000K | 31 |
| replay-m10-z0.67-s1 | -2 | -966.000K | 23 |
| replay-m10-z0.67-s4 | -2 | -966.000K | 18 |
| replay-m10-z1.28-s1 | -2 | -966.000K | 31 |
| replay-m20-z0.67-s2 | -2 | -966.000K | 18 |
| replay-m20-z1.28-s4 | -2 | -966.000K | 27 |
| replay-m10-z0.67-s2 | -3 | -1.050.000K | 23 |

## Quyết định

**do-not-promote**

Chưa đủ bằng chứng để thay production. Giữ research-only; không sửa dự đoán đã phát hành.

Giới hạn hiện tại: tập train strict có 37 ngày lấy mẫu cho 2024 và 37 ngày cho 2025. Vì vậy tín hiệu cohort đủ để thử nghiệm nhưng chưa đủ để coi là xác suất ổn định dài hạn.

> Kết quả lịch sử là bằng chứng thực nghiệm, không bảo đảm lợi nhuận tương lai.
