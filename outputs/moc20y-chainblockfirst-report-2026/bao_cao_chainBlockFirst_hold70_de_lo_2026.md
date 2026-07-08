# Báo cáo chainBlockFirst Hold70 - Đề và Lô

- Nguồn dữ liệu: R2
- Khoảng kiểm tra: 2026-01-01 đến 2026-06-27 (174 ngày)
- Đề: Hold70, đánh 30 số, đơn vị 1000K/con.
- Lô: 27 vị trí, stake 2300K, trúng nhận 8000K/hit.

## Đề - chainBlockFirst Hold70

| Tỷ lệ ăn | Ngày trúng | Tỷ lệ trúng | Profit | ROI | Chuỗi thắng dài nhất | Chuỗi thua dài nhất |
|---:|---:|---:|---:|---:|---:|---:|
| 84 | 97/174 | 55,75% | +2.928.000K | 56,09% | 10 | 12 |
| 70 | 97/174 | 55,75% | +1.570.000K | 30,08% | 10 | 12 |

## Lô - so sánh chainBlockFirst với phương án hiện tại

Kết quả tốt nhất toàn bộ vẫn là **chainSmallFirstHold65:twoHitGreedy:top6**: profit **+406.800K**, ROI **16,94%**, hit-rate **90,80%**.

Kết quả chainBlockFirst tốt nhất là **chainBlockFirstHold65:twoHitGreedy:top5**: profit **+159.000K**, ROI **7,95%**, hit-rate **81,03%**.

=> Không apply chainBlockFirst cho Lô vì chưa tốt hơn phương án Lô hiện tại.

## Top Lô theo profit

| Rank | Method | Bet | Win day | Hit rate | Hit >=2 | Hit >=3 | Hit | Profit | ROI | Longest loss |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | chainSmallFirstHold65:twoHitGreedy:top6 | 6 | 109/174 | 90.80% | 62.64% | 33.33% | 351 | 406.800K | 16.94% | 4 |
| 2 | chainSmallFirstHold65:twoHitGreedy:top7 | 7 | 72/174 | 93.68% | 70.11% | 41.38% | 399 | 390.600K | 13.94% | 8 |
| 3 | chainSmallFirstHold65:twoHitGreedy:top5 | 5 | 93/174 | 85.06% | 53.45% | 22.99% | 293 | 343.000K | 17.14% | 4 |
| 4 | chainSmallFirstHold65:twoHitGreedy:top4 | 4 | 72/174 | 78.16% | 41.38% | 13.22% | 236 | 287.200K | 17.94% | 6 |
| 5 | chainSmallFirstHold65:twoHitGreedy:top3 | 3 | 117/174 | 67.24% | 25.86% | 7.47% | 177 | 215.400K | 17.94% | 4 |
| 6 | chainSmallFirstHold70:twoHitGreedy:top7 | 7 | 63/174 | 92.53% | 68.39% | 36.21% | 371 | 166.600K | 5.95% | 8 |
| 7 | chainBlockFirstHold65:twoHitGreedy:top5 | 5 | 82/174 | 81.03% | 47.13% | 19.54% | 270 | 159.000K | 7.95% | 8 |
| 8 | chainSmallFirstHold70:twoHitGreedy:top6 | 6 | 101/174 | 88.51% | 58.05% | 24.71% | 314 | 110.800K | 4.61% | 4 |
| 9 | chainBlockFirstHold65:twoHitGreedy:top7 | 7 | 61/174 | 86.78% | 62.64% | 35.06% | 364 | 110.600K | 3.95% | 10 |
| 10 | chainSmallFirstHold70:twoHitGreedy:top3 | 3 | 114/174 | 65.52% | 22.99% | 4.60% | 163 | 103.400K | 8.61% | 6 |
| 11 | chainSmallFirstHold70:twoHitGreedy:top5 | 5 | 79/174 | 85.06% | 45.40% | 16.67% | 263 | 103.000K | 5.15% | 6 |
| 12 | chainBlockFirstHold65:twoHitGreedy:top6 | 6 | 95/174 | 83.91% | 54.60% | 25.86% | 311 | 86.800K | 3.61% | 4 |
