# Conservative scorecard grid - strict PIT

- Baseline: Chuỗi nhỏ Hold 70, đánh 30 số, 1.000K/số, ăn 84.
- Chọn tham số trên các fold 2023–2025; mỗi fold chỉ học các năm trước nó.
- Holdout 2026 không tham gia chọn tham số.
- Scorecard chỉ hoán đổi 0–4 số quanh dàn Chuỗi nhỏ và chỉ nhận bằng chứng một họ chuỗi.

Cấu hình khóa: `q60-n40-z1.64-r120-s1-m0.1`.

| Fold chọn | Baseline | Candidate | Delta hit | Delta profit | Swap TB |
|---|---:|---:|---:|---:|---:|
| 2023 | 10/37 (27.03%) | 10/37 (27.03%) | +0 | 0K | 0.00 |
| 2024 | 17/52 (32.69%) | 17/52 (32.69%) | +0 | 0K | 0.00 |
| 2025 | 15/52 (28.85%) | 15/52 (28.85%) | +0 | 0K | 0.00 |

## Holdout 2026

| Phương pháp | Hit | Profit | ROI | Thua dài nhất |
|---|---:|---:|---:|---:|
| Chuỗi nhỏ | 63/203 (31.03%) | -798.000K | -13.10% | 17 |
| Scorecard bảo thủ | 63/203 (31.03%) | -798.000K | -13.10% | 17 |

Kết luận: **do-not-promote**

Không vượt baseline ổn định. Không thay đổi chiến lược production.

> Đây là kiểm chứng nghiên cứu. Các fold 2023–2025 hiện là replay cách ngày 7, không đủ để thay thế snapshot production.
