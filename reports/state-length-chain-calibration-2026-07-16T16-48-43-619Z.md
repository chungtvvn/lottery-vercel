# State-length Bayes cho active/potential chains

## Thiết kế

- Candidate được sinh strict point-in-time từ raw prefix trước ngày dự đoán.
- Một scope family/pattern/state/độ dài/kỷ lục/độ rộng chỉ đóng góp một Bernoulli mỗi ngày.
- Potential được học từ cơ hội xuất hiện thực tế từng ngày, không suy diễn từ cumulative streak.
- 2024–2025 chọn cấu hình; 2026 chỉ dùng đánh giá sau khi khóa.
- Đã thử 162 cấu hình; p hiệu chỉnh Bonferroni tham khảo = 1.000000.

## Fold lựa chọn

| Giai đoạn | Nền | Candidate | Δ trúng | Δ profit |
|---|---:|---:|---:|---:|
| late-2024-sampled | 4/13 | 6/13 | +2 | 168.000K |
| 2025-sampled | 9/37 | 10/37 | +1 | 84.000K |

Cấu hình khóa: **state-len-p24-d12-c0.8-f2-s3**.

## Holdout 2026

| Phương pháp | Trúng | Tỷ lệ | Profit | ROI | Thua dài nhất |
|---|---:|---:|---:|---:|---:|
| Chuỗi nhỏ Hold 70 | 68/191 | 35.60% | -18.000K | -0.31% | 9 |
| State-length Bayes | 68/191 | 35.60% | -18.000K | -0.31% | 9 |

- McNemar p: 1.000000.
- Wilson candidate: 29.16%–42.62%.
- Kết luận: **do-not-promote**.

## Theo tháng 2026

| Tháng | Trúng | Tỷ lệ | Profit |
|---|---:|---:|---:|
| 2026-01 | 11/31 | 35.48% | -6.000K |
| 2026-02 | 10/24 | 41.67% | 120.000K |
| 2026-03 | 11/31 | 35.48% | -6.000K |
| 2026-04 | 9/30 | 30.00% | -144.000K |
| 2026-05 | 10/31 | 32.26% | -90.000K |
| 2026-06 | 14/30 | 46.67% | 276.000K |
| 2026-07 | 3/14 | 21.43% | -168.000K |

Không đạt đủ điều kiện ổn định và ý nghĩa thống kê để thay phương pháp production.
