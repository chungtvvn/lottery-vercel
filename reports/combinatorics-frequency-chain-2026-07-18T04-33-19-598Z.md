# Tổ hợp + tần suất Bayesian + chuỗi strict PIT

- Raw R2: 2005-10-01 -> 2026-07-17, 7.494 ngày.
- Chuỗi strict PIT: 2016-01-01 -> 2026-07-10, 3.778 ngày.
- Train 2016-01-01 -> 2020-12-31, validation 2021-01-01 -> 2023-12-31, test 2024-01-01 -> 2025-12-31, holdout 2026-01-01 -> 2026-07-10.
- Tần suất của mỗi ngày chỉ dùng các kết quả trước ngày dự đoán; 2024-2025 và 2026 không dùng để chọn hyperparameter.

## Xác suất tổ hợp nền

| Dàn Đề | Công thức | P(trúng) | Hòa vốn ăn 84 |
|---:|---|---:|---:|
| 10 | C(99,9) / C(100,10) | 10.00% | 11.90% |
| 20 | C(99,19) / C(100,20) | 20.00% | 23.81% |
| 30 | C(99,29) / C(100,30) | 30.00% | 35.71% |
| 40 | C(99,39) / C(100,40) | 40.00% | 47.62% |

Với Lô, giả sử 27 vị trí độc lập và mỗi vị trí đều trên 00-99:

| Số đánh | P(>=1 hit) | P(>=2 hit) |
|---:|---:|---:|
| 3 | 56.06% | 19.37% |
| 6 | 81.19% | 48.77% |
| 10 | 94.19% | 76.74% |
| 14 | 98.30% | 90.81% |
| 20 | 99.76% | 98.13% |

## Kết quả mô hình hybrid đã khóa

### Test 2024-2025

| Dàn | Hit | Profit | ROI | P-value so với nền | MC P(profit>0) nền | Thua dài nhất |
|---:|---:|---:|---:|---:|---:|---:|
| 10 | 76/723 (10.51%) | -846.000K | -11.70% | 34.07% | 4.04% | 47 |
| 20 | 155/723 (21.44%) | -1.440.000K | -9.96% | 17.83% | 0.62% | 21 |
| 30 | 229/723 (31.67%) | -2.454.000K | -11.31% | 17.31% | 0.03% | 18 |
| 40 | 291/723 (40.25%) | -4.476.000K | -15.48% | 45.97% | 0.00% | 12 |

### Holdout 2026

| Dàn | Hit | Profit | ROI | P-value so với nền | MC P(profit>0) nền | Thua dài nhất |
|---:|---:|---:|---:|---:|---:|---:|
| 10 | 14/187 (7.49%) | -694.000K | -37.11% | 90.19% | 17.42% | 60 |
| 20 | 29/187 (15.51%) | -1.304.000K | -34.87% | 95.17% | 9.86% | 21 |
| 30 | 52/187 (27.81%) | -1.242.000K | -22.14% | 76.70% | 5.18% | 11 |
| 40 | 74/187 (39.57%) | -1.264.000K | -16.90% | 57.50% | 1.52% | 8 |

## Đối chứng Top 30

| Giai đoạn | Hybrid | Đồng thuận chuỗi | Tần suất Bayesian | Baseline strict tốt nhất |
|---|---:|---:|---:|---:|
| test | 31.67%; -2.454.000K | 30.29%; -3.294.000K | 30.29%; -3.294.000K | chainBlockFirst: 32.37%; -2.034.000K |
| holdout | 27.81%; -1.242.000K | 35.29%; -66.000K | 28.88%; -1.074.000K | chainSmallFirst: 36.36%; 102.000K |

## Kết luận

- Promotion: **KHÔNG**. Hybrid chưa đồng thời vượt hòa vốn và có profit dương ở cả hai chế độ độc lập; giữ ở research.
- Monte Carlo chỉ mô tả phân phối dưới giả thuyết nền; nó không tạo thêm bằng chứng dự báo.
- Tần suất lịch sử được co về 1/100 bằng Dirichlet prior để tránh coi số nóng/lạnh ngắn hạn là quy luật chắc chắn.
- Kết quả lịch sử có lãi không bảo đảm tương lai; chỉ phương pháp vượt cả test 2024-2025 và holdout 2026 mới đủ điều kiện xem xét.
