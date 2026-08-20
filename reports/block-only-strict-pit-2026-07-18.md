# Backtest Block thuần strict point-in-time

Ngày chạy: 18/07/2026. Hold 70, đánh 30 số, mỗi số 1000K, trúng nhận 84 lần. Điểm hòa vốn là 35.71%; chọn ngẫu nhiên 30/100 số có kỳ vọng trúng 30%.

## Phạm vi

Chỉ dùng chuỗi Block đang diễn ra. Không dùng Chuỗi nhỏ, Tier từ nhóm khác, kết quả ngày cần dự đoán hay trường `observedExcluded`. Các tham số được cố định trước khi xem kết quả phép thử.

| Giai đoạn | Phương pháp | Ngày | Trúng | Tỷ lệ | Profit | ROI | Chuỗi thắng | Chuỗi thua | z so với ngẫu nhiên |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Khám phá 2014-2023 (mẫu 10 ngày/lần) | blockSequential | 367 | 117 | 31.88% | -1,182,000K | -10.74% | 4 | 9 | 0.79 |
| Khám phá 2014-2023 (mẫu 10 ngày/lần) | blockAverageDropoff | 367 | 116 | 31.61% | -1,266,000K | -11.50% | 5 | 12 | 0.67 |
| Khám phá 2014-2023 (mẫu 10 ngày/lần) | blockConsensusEdge | 367 | 109 | 29.70% | -1,854,000K | -16.84% | 5 | 10 | -0.13 |
| Khám phá 2014-2023 (mẫu 10 ngày/lần) | chainSmallFirst | 367 | 117 | 31.88% | -1,182,000K | -10.74% | 5 | 13 | 0.79 |
| Kiểm định 2024 (mẫu 10 ngày/lần) | blockSequential | 37 | 12 | 32.43% | -102,000K | -9.19% | 2 | 8 | 0.32 |
| Kiểm định 2024 (mẫu 10 ngày/lần) | blockAverageDropoff | 37 | 13 | 35.14% | -18,000K | -1.62% | 3 | 4 | 0.68 |
| Kiểm định 2024 (mẫu 10 ngày/lần) | blockConsensusEdge | 37 | 11 | 29.73% | -186,000K | -16.76% | 3 | 6 | -0.04 |
| Kiểm định 2024 (mẫu 10 ngày/lần) | chainSmallFirst | 37 | 14 | 37.84% | +66,000K | 5.95% | 3 | 4 | 1.04 |
| Kiểm định 2025 (mẫu 10 ngày/lần) | blockSequential | 37 | 15 | 40.54% | +150,000K | 13.51% | 3 | 10 | 1.40 |
| Kiểm định 2025 (mẫu 10 ngày/lần) | blockAverageDropoff | 37 | 12 | 32.43% | -102,000K | -9.19% | 3 | 5 | 0.32 |
| Kiểm định 2025 (mẫu 10 ngày/lần) | blockConsensusEdge | 37 | 11 | 29.73% | -186,000K | -16.76% | 2 | 5 | -0.04 |
| Kiểm định 2025 (mẫu 10 ngày/lần) | chainSmallFirst | 37 | 9 | 24.32% | -354,000K | -31.89% | 2 | 15 | -0.75 |
| 2026 đầy đủ hằng ngày | blockSequential | 191 | 59 | 30.89% | -774,000K | -13.51% | 5 | 10 | 0.27 |
| 2026 đầy đủ hằng ngày | blockAverageDropoff | 191 | 53 | 27.75% | -1,278,000K | -22.30% | 5 | 18 | -0.68 |
| 2026 đầy đủ hằng ngày | blockConsensusEdge | 191 | 55 | 28.80% | -1,110,000K | -19.37% | 6 | 12 | -0.36 |
| 2026 đầy đủ hằng ngày | chainSmallFirst | 191 | 68 | 35.60% | -18,000K | -0.31% | 5 | 9 | 1.69 |

## Độ phủ Block năm 2026

- `blockSequential`: 7.1 Block hoạt động/ngày, 84.6 số có tín hiệu; 21/191 ngày phải điền số không có tín hiệu.
- `blockAverageDropoff`: 7.1 Block hoạt động/ngày, 84.6 số có tín hiệu; 21/191 ngày phải điền số không có tín hiệu.
- `blockConsensusEdge`: 7.1 Block hoạt động/ngày, 82.8 số có tín hiệu; 26/191 ngày phải điền số không có tín hiệu.

## Cách đọc

- `blockSequential`: lấy lần lượt Block theo Tier, trạng thái kỷ lục, dropoff co mẫu và tập số nhỏ.
- `blockAverageDropoff`: xếp từng số theo dropoff trung bình của các Block chứa số đó.
- `blockConsensusEdge`: cộng đồng thuận từ các hình Block khác nhau sau khi khử trùng và co mẫu.
- `chainSmallFirst`: đối chứng production trên đúng cùng ngày và cùng kinh tế cược.

2014-2025 là mẫu cố định 10 ngày/lần nên chỉ dùng để kiểm tra hướng và độ ổn định, không được diễn giải như backtest đủ ngày. 2026 là toàn bộ ngày có trong snapshot strict PIT.
