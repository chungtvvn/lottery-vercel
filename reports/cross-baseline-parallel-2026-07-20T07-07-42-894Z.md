# Backtest strict PIT: kết hợp Mốc 20 năm và Lịch sử D-1

- Khoảng ngày: 2022-01-01 đến 2022-12-31 (37 ngày).
- Mốc 20 năm: baseline chốt 31/12/2025; Lịch sử: metric lăn đến D-1.
- Mỗi đơn vị: 1.000K; trúng nhận 84 lần đơn vị.
- Đây là nghiên cứu holdout, chưa thay đổi production.

| Biến thể | Trúng | Tỷ lệ | Số duy nhất TB | Đơn vị TB | Profit K | ROI | Chuỗi thua dài nhất |
|---|---:|---:|---:|---:|---:|---:|---:|
| annualNative | 18/37 | 48.65% | 40.49 | 50.00 | -254,000 | -13.73% | 3 |
| rollingNative | 14/37 | 37.84% | 35.00 | 50.00 | -170,000 | -9.19% | 6 |
| crossUnionFlat | 25/37 | 67.57% | 60.27 | 60.27 | -130,000 | -5.83% | 3 |
| crossUnionX2 | 25/37 | 67.57% | 60.27 | 75.49 | -105,000 | -3.76% | 3 |
| crossIntersectionFlat | 7/37 | 18.92% | 15.22 | 15.22 | 25,000 | 4.44% | 14 |
| crossIntersectionX2 | 7/37 | 18.92% | 15.22 | 30.43 | 50,000 | 4.44% | 14 |
| crossExclusiveFlat | 18/37 | 48.65% | 45.05 | 45.05 | -155,000 | -9.30% | 5 |
| crossFourBranchAdditive | 25/37 | 67.57% | 60.27 | 100.00 | -424,000 | -11.46% | 7 |
