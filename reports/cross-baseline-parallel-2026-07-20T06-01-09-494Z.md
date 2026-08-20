# Backtest strict PIT: kết hợp Mốc 20 năm và Lịch sử D-1

- Khoảng ngày: 2026-01-01 đến 2026-07-14 (191 ngày).
- Mốc 20 năm: baseline chốt 31/12/2025; Lịch sử: metric lăn đến D-1.
- Mỗi đơn vị: 1.000K; trúng nhận 84 lần đơn vị.
- Đây là nghiên cứu holdout, chưa thay đổi production.

| Biến thể | Trúng | Tỷ lệ | Số duy nhất TB | Đơn vị TB | Profit K | ROI | Chuỗi thua dài nhất |
|---|---:|---:|---:|---:|---:|---:|---:|
| annualNative | 84/191 | 43.98% | 39.01 | 50.00 | -478,000 | -5.01% | 9 |
| rollingNative | 72/191 | 37.70% | 35.63 | 50.00 | -1,318,000 | -13.80% | 11 |
| crossUnionFlat | 124/191 | 64.92% | 58.95 | 58.95 | -844,000 | -7.50% | 4 |
| crossUnionX2 | 124/191 | 64.92% | 58.95 | 74.64 | -1,152,000 | -8.08% | 4 |
| crossIntersectionFlat | 32/191 | 16.75% | 15.69 | 15.69 | -308,000 | -10.28% | 21 |
| crossIntersectionX2 | 32/191 | 16.75% | 15.69 | 31.37 | -616,000 | -10.28% | 21 |
| crossExclusiveFlat | 92/191 | 48.17% | 43.27 | 43.27 | -536,000 | -6.49% | 7 |
| crossFourBranchAdditive | 124/191 | 64.92% | 58.95 | 100.00 | -1,796,000 | -9.40% | 10 |
