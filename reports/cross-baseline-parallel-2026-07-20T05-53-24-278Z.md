# Backtest strict PIT: kết hợp Mốc 20 năm và Lịch sử D-1

- Khoảng ngày: 2026-01-01 đến 2026-07-14 (191 ngày).
- Mốc 20 năm: baseline chốt 31/12/2025; Lịch sử: metric lăn đến D-1.
- Mỗi đơn vị: 1.000K; trúng nhận 84 lần đơn vị.
- Đây là nghiên cứu holdout, chưa thay đổi production.

| Biến thể | Trúng | Tỷ lệ | Số duy nhất TB | Đơn vị TB | Profit K | ROI | Chuỗi thua dài nhất |
|---|---:|---:|---:|---:|---:|---:|---:|
| annualNative | 84/191 | 43.98% | 39.01 | 50.00 | -478,000 | -5.01% | 9 |
| rollingNative | 72/191 | 37.70% | 35.65 | 50.00 | -1,318,000 | -13.80% | 11 |
| crossUnionFlat | 124/191 | 64.92% | 58.95 | 58.95 | -843,000 | -7.49% | 4 |
| crossUnionX2 | 124/191 | 64.92% | 58.95 | 74.65 | -1,155,000 | -8.10% | 4 |
| crossIntersectionFlat | 32/191 | 16.75% | 15.71 | 15.71 | -312,000 | -10.40% | 21 |
| crossIntersectionX2 | 32/191 | 16.75% | 15.71 | 31.41 | -624,000 | -10.40% | 21 |
| crossExclusiveFlat | 92/191 | 48.17% | 43.24 | 43.24 | -531,000 | -6.43% | 7 |
| crossFourBranchAdditive | 124/191 | 64.92% | 58.95 | 100.00 | -1,796,000 | -9.40% | 10 |
