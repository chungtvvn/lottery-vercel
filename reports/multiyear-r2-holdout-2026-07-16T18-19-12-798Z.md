# Holdout R2 strict point-in-time

- Khoảng kiểm tra: 2026-07-10 -> 2026-07-16 (7 ngày).
- Mỗi ngày chỉ dùng dữ liệu đến D-1; đây là kiểm tra sau báo cáo đa năm, không được gộp thành dữ liệu train.
- Mẫu ngắn chỉ dùng phát hiện drift; không đủ để kết luận thay production.

| Phương án | Ăn | Hit | Số/ngày | Profit | ROI | Wilson lower |
|---|---:|---:|---:|---:|---:|---:|
| overlapOnly | 70 | 0/7 (0.00%) | 14.71 | -103.000K | -100.00% | 0.00% |
| uniqueOnly | 70 | 3/7 (42.86%) | 20.57 | 66.000K | 45.83% | 15.82% |
| parallelX2 | 70 | 3/7 (42.86%) | 50.00 | -140.000K | -40.00% | 15.82% |
| overlapOnly | 84 | 0/7 (0.00%) | 14.71 | -103.000K | -100.00% | 0.00% |
| uniqueOnly | 84 | 3/7 (42.86%) | 20.57 | 108.000K | 75.00% | 15.82% |
| parallelX2 | 84 | 3/7 (42.86%) | 50.00 | -98.000K | -28.00% | 15.82% |

## Theo ngày

| Ngày | KQ | Hợp | Giao | Trúng hợp | Trúng giao |
|---|---:|---:|---:|---:|---:|
| 2026-07-10 | 67 | 35 | 15 | Không | Không |
| 2026-07-11 | 01 | 35 | 15 | Không | Không |
| 2026-07-12 | 94 | 35 | 15 | Có | Không |
| 2026-07-13 | 99 | 35 | 15 | Có | Không |
| 2026-07-14 | 47 | 37 | 13 | Không | Không |
| 2026-07-15 | 19 | 35 | 15 | Có | Không |
| 2026-07-16 | 63 | 35 | 15 | Không | Không |
