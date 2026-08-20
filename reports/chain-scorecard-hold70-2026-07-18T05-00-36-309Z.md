# Phương pháp Đề loại trừ theo thang điểm chuỗi

- Hold70, đánh 30 số, 1.000K/số, ăn 84; hòa vốn 35,71%.
- Điểm chuỗi = credible edge × độ tin cậy mẫu × độ ổn định năm.
- Chuỗi cùng tập/họ được khử trùng; mỗi họ chỉ giữ bằng chứng mạnh nhất.
- Cấu hình chọn trên 2025 từ model học 2024; khóa trước holdout 2026.

Cấu hình được chọn: `q10-n10-f1-s1-m0`.

| Giai đoạn | Baseline | Scorecard | Δ hit | Δ profit |
|---|---:|---:|---:|---:|
| Validation 2025 (mẫu 10 ngày) | 9/37 (24.32%) | 9/37 (24.32%) | +0 | 0K |
| Holdout 2026 | 68/191 (35.60%) | 67/191 (35.08%) | -1 | -84.000K |

## Theo tháng holdout

| Tháng | Ngày | Trúng | Tỷ lệ | Profit |
|---|---:|---:|---:|---:|
| 2026-01 | 31 | 11 | 35.48% | -6.000K |
| 2026-02 | 24 | 10 | 41.67% | 120.000K |
| 2026-03 | 31 | 12 | 38.71% | 78.000K |
| 2026-04 | 30 | 9 | 30.00% | -144.000K |
| 2026-05 | 31 | 10 | 32.26% | -90.000K |
| 2026-06 | 30 | 12 | 40.00% | 108.000K |
| 2026-07 | 14 | 3 | 21.43% | -168.000K |

## Quyết định

**do-not-promote**

Phương pháp chưa vượt baseline ổn định. Giữ research-only và không sửa snapshot production.

> Dữ liệu validation 2024–2025 chỉ lấy mẫu 10 ngày một lần; kết quả chưa đủ để bảo đảm lợi nhuận tương lai.
