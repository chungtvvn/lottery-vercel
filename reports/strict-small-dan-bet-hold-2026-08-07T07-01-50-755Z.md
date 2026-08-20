# Strict PIT - dàn nhỏ Đánh + Ôm

Nghiên cứu riêng, không thay đổi phương pháp production.

- Dàn strict PIT: 3591 ngày, 2016–2025.
- Cấu hình được chọn từ train: **weightedBeta:top3**.
- Quyết định: **do-not-promote**.

| Giai đoạn | Ngày | Trúng | Hit | Hòa vốn | Profit | ROI | Chuỗi W/L |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Train 2016–2020 | 1785 | 66/1785 | 3.70% | 3.00% | 1.926.225K | 35.97% | 3/113 |
| Validation 2021–2023 | 1083 | 28/1083 | 2.59% | 3.00% | -686.045K | -21.12% | 2/163 |
| Holdout 2024–2025 | 723 | 29/723 | 4.01% | 3.00% | 1.129.355K | 52.07% | 2/99 |
| Toàn bộ 2016–2025 | 3591 | 123/3591 | 3.43% | 3.00% | 2.369.535K | 22.00% | 3/163 |

## Bảng cấu hình

| Cấu hình | Train profit | Validation profit | Holdout profit | Holdout hit |
| --- | ---: | ---: | ---: | ---: |
| equalVote:top3 | 1.310.225K | -224.045K | 667.355K | 3.60% |
| equalVote:top5 | 1.691.375K | -1.299.075K | 357.925K | 5.53% |
| equalVote:top6 | 803.950K | -2.067.590K | -104.790K | 6.22% |
| equalVote:top7 | 378.525K | -1.758.105K | -259.505K | 7.19% |
| equalVote:top10 | -1.359.750K | -2.061.650K | -1.339.650K | 9.54% |
| weightedBeta:top3 | 1.926.225K | -686.045K | 1.129.355K | 4.01% |
| weightedBeta:top5 | 613.375K | -2.377.075K | 511.925K | 5.67% |
| weightedBeta:top6 | 1.265.950K | -2.221.590K | 665.210K | 6.92% |
| weightedBeta:top7 | -83.475K | -2.066.105K | 202.495K | 7.61% |
| weightedBeta:top10 | -1.667.750K | -2.831.650K | -1.185.650K | 9.68% |

Một phương án dương khi nhìn toàn bộ 10 năm vẫn bị từ chối nếu validation hoặc holdout âm, vì đó là dấu hiệu chọn theo nhiễu lịch sử.
