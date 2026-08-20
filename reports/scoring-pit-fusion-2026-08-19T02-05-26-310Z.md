# Scoring PIT fusion - Đề

- 100 số: cửa sổ đầy đủ từ raw thực tế có trung vị 513 ngày lịch / 505 ngày quay; p90 724 ngày lịch.
- 227 form UI được khử trùng còn 214 tập số duy nhất; feature chỉ dùng 180 ngày trước D.
- “Thiếu” của nhóm không được coi là bắt buộc sẽ về; chỉ là feature phải được kiểm định ngoài mẫu.

## Cấu hình chọn từ train: activeOnlyAvgRisk:score-1

| Giai đoạn | Trúng | Tỷ lệ | Profit | ROI | Chuỗi thua dài nhất |
|---|---:|---:|---:|---:|---:|
| Train 2016-2023 | 898/2868 | 31.31% | -10.608.000K | -12.33% | 17 |
| Validation 2024-2025 | 226/723 | 31.26% | -2.706.000K | -12.48% | 19 |
| Holdout 2026 | 63/187 | 33.69% | -318.000K | -5.67% | 7 |

Kết luận: **do-not-promote-scoring-fusion**.

## So sánh baseline

| Phương pháp / giai đoạn | Trúng | Tỷ lệ | Profit | ROI | Chuỗi thua dài nhất |
|---|---:|---:|---:|---:|---:|
| activeOnlyAvgRisk - train | 897/2868 | 31.28% | -10.692.000K | -12.43% | 17 |
| activeOnlyAvgRisk - validation | 228/723 | 31.54% | -2.538.000K | -11.70% | 19 |
| activeOnlyAvgRisk - holdout | 61/187 | 32.62% | -486.000K | -8.66% | 7 |
| chainSmallFirst - train | 847/2868 | 29.53% | -14.892.000K | -17.31% | 19 |
| chainSmallFirst - validation | 206/723 | 28.49% | -4.386.000K | -20.22% | 14 |
| chainSmallFirst - holdout | 68/187 | 36.36% | 102.000K | 1.82% | 9 |
| dedupEdge50Hold - train | 848/2868 | 29.57% | -14.808.000K | -17.21% | 26 |
| dedupEdge50Hold - validation | 214/723 | 29.60% | -3.714.000K | -17.12% | 15 |
| dedupEdge50Hold - holdout | 62/187 | 33.16% | -402.000K | -7.17% | 11 |
