# Backtest strict PIT: kết hợp Mốc 20 năm và Lịch sử D-1

- Khoảng ngày: 2025-01-01 đến 2025-12-31 (73 ngày).
- Mốc 20 năm: baseline chốt 31/12/2025; Lịch sử: metric lăn đến D-1.
- Mỗi đơn vị: 1.000K; trúng nhận 84 lần đơn vị.
- Đây là nghiên cứu holdout, chưa thay đổi production.

| Biến thể | Trúng | Tỷ lệ | Số duy nhất TB | Đơn vị TB | Profit K | ROI | Chuỗi thua dài nhất |
|---|---:|---:|---:|---:|---:|---:|---:|
| annualNative | 28/73 | 38.36% | 38.15 | 50.00 | -794,000 | -21.75% | 7 |
| rollingNative | 27/73 | 36.99% | 35.30 | 50.00 | -1,130,000 | -30.96% | 6 |
| crossUnionFlat | 43/73 | 58.90% | 58.73 | 58.73 | -675,000 | -15.75% | 4 |
| crossUnionX2 | 43/73 | 58.90% | 58.73 | 73.45 | -742,000 | -13.84% | 4 |
| crossIntersectionFlat | 12/73 | 16.44% | 14.73 | 14.73 | -67,000 | -6.23% | 12 |
| crossIntersectionX2 | 12/73 | 16.44% | 14.73 | 29.45 | -134,000 | -6.23% | 12 |
| crossExclusiveFlat | 31/73 | 42.47% | 44.00 | 44.00 | -608,000 | -18.93% | 10 |
| crossFourBranchAdditive | 43/73 | 58.90% | 58.73 | 100.00 | -1,924,000 | -26.36% | 12 |
