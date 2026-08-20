# Phương pháp Đề loại trừ theo thang điểm chuỗi

- Hold70, đánh 30 số, 1.000K/số, ăn 84; hòa vốn 35,71%.
- Điểm chuỗi = credible edge × độ tin cậy mẫu × độ ổn định năm.
- Chuỗi cùng tập/họ được khử trùng; mỗi họ chỉ giữ bằng chứng mạnh nhất.
- Cấu hình chọn trên 2025 từ model học 2024; khóa trước holdout 2026.

Cấu hình được chọn: `q10-n10-f1-s8-m0`.

| Giai đoạn | Baseline | Scorecard | Δ hit | Δ profit |
|---|---:|---:|---:|---:|
| Validation 2025 (mẫu 10 ngày) | 9/37 (24.32%) | 10/37 (27.03%) | +1 | 84.000K |
| Holdout 2026 | 68/191 (35.60%) | 72/191 (37.70%) | +4 | 336.000K |

## Theo tháng holdout

| Tháng | Ngày | Trúng | Tỷ lệ | Profit |
|---|---:|---:|---:|---:|
| 2026-01 | 31 | 9 | 29.03% | -174.000K |
| 2026-02 | 24 | 10 | 41.67% | 120.000K |
| 2026-03 | 31 | 12 | 38.71% | 78.000K |
| 2026-04 | 30 | 11 | 36.67% | 24.000K |
| 2026-05 | 31 | 11 | 35.48% | -6.000K |
| 2026-06 | 30 | 14 | 46.67% | 276.000K |
| 2026-07 | 14 | 5 | 35.71% | 0K |

## Quyết định

**do-not-promote**

Phương pháp chưa vượt baseline ổn định. Giữ research-only và không sửa snapshot production.

> Dữ liệu validation 2024–2025 chỉ lấy mẫu 10 ngày một lần; kết quả chưa đủ để bảo đảm lợi nhuận tương lai.
