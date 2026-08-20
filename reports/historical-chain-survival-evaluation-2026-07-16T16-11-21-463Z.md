# Survival Bayes phân cấp + mô phỏng tương lai

## Kỷ luật dữ liệu

- Episode thật dùng cho survival prior: 01/01/2006 → 31/12/2023.
- Replay 2024–2025 chỉ dùng chọn trọng số; 2026 là holdout khóa.
- Monte Carlo: 20.000 posterior draws, mỗi draw mô phỏng 100 cơ hội tiếp diễn.
- Mẫu mô phỏng chỉ đo bất định; không được cộng vào cỡ mẫu lịch sử.
- Loại 9.702 pattern Nhịp block khỏi survival prior vì file streak không chứa đủ transition từng ngày.

## Chọn cấu hình trước holdout

| Giai đoạn | Nền | Survival | Chênh thắng | Chênh profit |
|---|---:|---:|---:|---:|
| late-2024 | 37/121 | 40/121 | +3 | 252.000K |
| 2025 | 99/361 | 100/361 | +1 | 84.000K |

Trọng số được khóa: **survival-w0**.

## Holdout 2026

- Nền Chuỗi nhỏ: 68/191 (35.60%), -18.000K.
- Survival Bayes: 74/191 (38.74%), 486.000K.
- Chênh: +6 ngày trúng, 504.000K.
- McNemar exact hai phía: 0.070313.
- Kết luận triển khai: **do-not-promote**.

| Tháng | Trúng | Tỷ lệ | Profit |
|---|---:|---:|---:|
| 2026-01 | 12/31 | 38.71% | 78.000K |
| 2026-02 | 11/24 | 45.83% | 204.000K |
| 2026-03 | 11/31 | 35.48% | -6.000K |
| 2026-04 | 11/30 | 36.67% | 24.000K |
| 2026-05 | 12/31 | 38.71% | 78.000K |
| 2026-06 | 13/30 | 43.33% | 192.000K |
| 2026-07 | 4/14 | 28.57% | -84.000K |

## Kết luận

Chưa có bằng chứng đủ mạnh để thay production. Giữ phương pháp ở research-only và tiếp tục thu thập snapshot live bất biến.
