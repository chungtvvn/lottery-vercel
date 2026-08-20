# Backtest strict PIT: kết hợp Mốc 20 năm và Lịch sử D-1

- Khoảng ngày: 2026-01-01 đến 2026-07-19 (196 ngày).
- Mốc 20 năm: baseline chốt 31/12/2025; Lịch sử: metric lăn đến D-1.
- Mỗi đơn vị: 1.000K; trúng nhận 84 lần đơn vị.
- Đây là nghiên cứu holdout, chưa thay đổi production.

| Biến thể | Trúng | Tỷ lệ | Số duy nhất TB | Đơn vị TB | Profit K | ROI | Chuỗi thua dài nhất |
|---|---:|---:|---:|---:|---:|---:|---:|
| annualNative | 86/196 | 43.88% | 38.98 | 50.00 | -560,000 | -5.71% | 9 |
| rollingNative | 73/196 | 37.24% | 35.66 | 50.00 | -1,400,000 | -14.29% | 11 |
| crossUnionFlat | 127/196 | 64.80% | 58.98 | 58.98 | -893,000 | -7.72% | 4 |
| crossUnionX2 | 127/196 | 64.80% | 58.98 | 74.64 | -1,274,000 | -8.71% | 4 |
| crossIntersectionFlat | 32/196 | 16.33% | 15.66 | 15.66 | -381,000 | -12.41% | 21 |
| crossIntersectionX2 | 32/196 | 16.33% | 15.66 | 31.32 | -762,000 | -12.41% | 21 |
| crossExclusiveFlat | 95/196 | 48.47% | 43.33 | 43.33 | -512,000 | -6.03% | 7 |
| crossFourBranchAdditive | 127/196 | 64.80% | 58.98 | 100.00 | -1,960,000 | -10.00% | 10 |
