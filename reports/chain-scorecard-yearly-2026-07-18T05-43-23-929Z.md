# Kiểm chứng từng năm: thang điểm chuỗi Hold70

- Cấu hình được khóa từ nghiên cứu trước: `q10-n10-f1-s8-m0`.
- Mỗi năm chỉ học chất lượng chuỗi từ các năm trước, không dùng kết quả của năm đang đánh giá.
- Hold70, đánh 30 số; 1.000K/số; trúng nhận 84.000K.
- Các năm có `step=10` là mẫu cố định khoảng 37 ngày/năm, không phải kết quả đầy đủ 365 ngày.

| Năm | Mức kiểm tra | Baseline | Scorecard | Δ hit | Profit scorecard | Δ profit | Chuỗi thua dài nhất | Swap TB |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 2016 | mẫu step=10 | 16/37 (43.24%) | 14/37 (37.84%) | -2 | 66.000K | -168.000K | 4 | 7.97 |
| 2017 | mẫu step=10 | 10/37 (27.03%) | 11/37 (29.73%) | +1 | -186.000K | 84.000K | 9 | 7.76 |
| 2018 | mẫu step=10 | 9/37 (24.32%) | 10/37 (27.03%) | +1 | -270.000K | 84.000K | 6 | 8.00 |
| 2019 | mẫu step=10 | 12/37 (32.43%) | 7/37 (18.92%) | -5 | -522.000K | -420.000K | 10 | 7.89 |
| 2020 | mẫu step=10 | 13/34 (38.24%) | 15/34 (44.12%) | +2 | 240.000K | 168.000K | 4 | 7.85 |
| 2021 | mẫu step=10 | 16/37 (43.24%) | 12/37 (32.43%) | -4 | -102.000K | -336.000K | 8 | 8.00 |
| 2022 | mẫu step=10 | 13/37 (35.14%) | 16/37 (43.24%) | +3 | 234.000K | 252.000K | 8 | 7.78 |
| 2023 | mẫu step=10 | 10/37 (27.03%) | 7/37 (18.92%) | -3 | -522.000K | -252.000K | 8 | 8.00 |
| 2024 | mẫu step=10 | 14/37 (37.84%) | 12/37 (32.43%) | -2 | -102.000K | -168.000K | 6 | 7.78 |
| 2025 | mẫu step=10 | 9/37 (24.32%) | 9/37 (24.32%) | +0 | -354.000K | 0K | 17 | 8.00 |
| 2026 | đủ ngày | 68/191 (35.60%) | 65/191 (34.03%) | -3 | -270.000K | -252.000K | 13 | 7.93 |

## Kết luận

Scorecard chưa ổn định: cải thiện 4/11 năm, giảm 6, hòa 1; tổng chênh lệch -12 hit. Không nên đưa vào production.

> Kết quả lấy mẫu dùng để kiểm tra độ ổn định theo chế độ thời gian. Không được nội suy trực tiếp thành lợi nhuận cả năm.
