# Nghiên cứu mẫu giả hậu nghiệm theo nhóm chuỗi

Sinh lúc: 2026-07-27T17:09:10.437Z

## Phương pháp

- Mỗi nhóm/trạng thái chuỗi dùng Beta-Binomial với prior nền 1.00%.
- Sinh 10.000 mẫu hậu nghiệm cho mỗi token; mẫu giả chỉ lượng hóa bất định, không được coi là quan sát thật.
- Train đầu 2024 → kiểm định cuối 2024; train 2024 → kiểm định 2025; khóa cấu hình rồi test 2026.
- Giữ cố định 30 số đánh / loại 70 số mỗi ngày.

## Cấu hình được chọn trước holdout

- ID: `posteriorBootstrap_coarse_p600_mean_top1_standalone`
- Mẫu token: coarse; prior: 600; metric: mean; tổng hợp: top1; selector: standalone; swap: 0.

| Giai đoạn chọn | Baseline trúng | Mẫu giả trúng | Δ trúng | Baseline profit | Mẫu giả profit | Δ profit |
|---|---:|---:|---:|---:|---:|---:|
| late-2024 | 3/18 (16.67%) | 8/18 (44.44%) | 5 | -288.000K | 132.000K | 420.000K |
| 2025 | 15/52 (28.85%) | 19/52 (36.54%) | 4 | -300.000K | 36.000K | 336.000K |

## Holdout 2026 chưa dùng để chọn cấu hình

| Phương pháp | Trúng | Tỷ lệ | Profit | ROI | Thua dài nhất |
|---|---:|---:|---:|---:|---:|
| chainSmallFirst | 63/203 | 31.03% | -798.000K | -13.10% | 17 |
| Mẫu giả hậu nghiệm | 56/203 | 27.59% | -1.386.000K | -22.76% | 13 |
| Chênh lệch | -7 | -3.45% | -588.000K | -9.66% | -4 |

## Kết luận triển khai

Không đưa vào production: holdout phải vừa cải thiện dàn nền, vừa có profit dương và vượt tỷ lệ hòa vốn.

> Mẫu giả không tạo thêm thông tin xổ số. Nó chỉ làm cho quyết định bảo thủ hơn khi nhóm chuỗi có ít mẫu; hiệu quả phải được xác nhận trên holdout độc lập.
