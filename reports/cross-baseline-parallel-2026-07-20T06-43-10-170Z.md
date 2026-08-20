# Backtest strict PIT: kết hợp Mốc 20 năm và Lịch sử D-1

- Khoảng ngày: 2024-01-01 đến 2024-12-30 (37 ngày).
- Mốc 20 năm: baseline chốt 31/12/2025; Lịch sử: metric lăn đến D-1.
- Mỗi đơn vị: 1.000K; trúng nhận 84 lần đơn vị.
- Đây là nghiên cứu holdout, chưa thay đổi production.

| Biến thể | Trúng | Tỷ lệ | Số duy nhất TB | Đơn vị TB | Profit K | ROI | Chuỗi thua dài nhất |
|---|---:|---:|---:|---:|---:|---:|---:|
| annualNative | 15/37 | 40.54% | 37.41 | 50.00 | 82,000 | 4.43% | 4 |
| rollingNative | 14/37 | 37.84% | 35.00 | 50.00 | -506,000 | -27.35% | 5 |
| crossUnionFlat | 21/37 | 56.76% | 58.41 | 58.41 | -397,000 | -18.37% | 4 |
| crossUnionX2 | 21/37 | 56.76% | 58.41 | 72.41 | -243,000 | -9.07% | 4 |
| crossIntersectionFlat | 8/37 | 21.62% | 14.00 | 14.00 | 154,000 | 29.73% | 13 |
| crossIntersectionX2 | 8/37 | 21.62% | 14.00 | 28.00 | 308,000 | 29.73% | 13 |
| crossExclusiveFlat | 13/37 | 35.14% | 44.41 | 44.41 | -551,000 | -33.54% | 11 |
| crossFourBranchAdditive | 21/37 | 56.76% | 58.41 | 100.00 | -424,000 | -11.46% | 7 |
