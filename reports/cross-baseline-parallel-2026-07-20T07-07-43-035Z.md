# Backtest strict PIT: kết hợp Mốc 20 năm và Lịch sử D-1

- Khoảng ngày: 2023-01-01 đến 2023-12-31 (37 ngày).
- Mốc 20 năm: baseline chốt 31/12/2025; Lịch sử: metric lăn đến D-1.
- Mỗi đơn vị: 1.000K; trúng nhận 84 lần đơn vị.
- Đây là nghiên cứu holdout, chưa thay đổi production.

| Biến thể | Trúng | Tỷ lệ | Số duy nhất TB | Đơn vị TB | Profit K | ROI | Chuỗi thua dài nhất |
|---|---:|---:|---:|---:|---:|---:|---:|
| annualNative | 14/37 | 37.84% | 38.57 | 50.00 | -254,000 | -13.73% | 6 |
| rollingNative | 19/37 | 51.35% | 35.00 | 50.00 | 82,000 | 4.43% | 4 |
| crossUnionFlat | 27/37 | 72.97% | 58.62 | 58.62 | 99,000 | 4.56% | 3 |
| crossUnionX2 | 27/37 | 72.97% | 58.62 | 73.57 | 50,000 | 1.84% | 3 |
| crossIntersectionFlat | 6/37 | 16.22% | 14.95 | 14.95 | -49,000 | -8.86% | 8 |
| crossIntersectionX2 | 6/37 | 16.22% | 14.95 | 29.89 | -98,000 | -8.86% | 8 |
| crossExclusiveFlat | 21/37 | 56.76% | 43.68 | 43.68 | 148,000 | 9.16% | 4 |
| crossFourBranchAdditive | 27/37 | 72.97% | 58.62 | 100.00 | -172,000 | -4.65% | 6 |
