# Nghiên cứu mẫu giả hậu nghiệm theo nhóm chuỗi

Sinh lúc: 2026-07-16T15:01:57.452Z

## Phương pháp

- Mỗi nhóm/trạng thái chuỗi dùng Beta-Binomial với prior nền 1.00%.
- Sinh 10.000 mẫu hậu nghiệm cho mỗi token; mẫu giả chỉ lượng hóa bất định, không được coi là quan sát thật.
- Train đầu 2024 → kiểm định cuối 2024; train 2024 → kiểm định 2025; khóa cấu hình rồi test 2026.
- Giữ cố định 30 số đánh / loại 70 số mỗi ngày.

## Cấu hình được chọn trước holdout

- ID: `posteriorBootstrap_coarse_p100_q90_top1_standalone`
- Mẫu token: coarse; prior: 100; metric: q90; tổng hợp: top1; selector: standalone; swap: 0.

| Giai đoạn chọn | Baseline trúng | Mẫu giả trúng | Δ trúng | Baseline profit | Mẫu giả profit | Δ profit |
|---|---:|---:|---:|---:|---:|---:|
| late-2024 | 37/121 (30.58%) | 46/121 (38.02%) | 9 | -522.000K | 234.000K | 756.000K |
| 2025 | 99/361 (27.42%) | 108/361 (29.92%) | 9 | -2.514.000K | -1.758.000K | 756.000K |

## Holdout 2026 chưa dùng để chọn cấu hình

| Phương pháp | Trúng | Tỷ lệ | Profit | ROI | Thua dài nhất |
|---|---:|---:|---:|---:|---:|
| chainSmallFirst | 68/182 | 37.36% | 252.000K | 4.62% | 9 |
| Mẫu giả hậu nghiệm | 46/182 | 25.27% | -1.596.000K | -29.23% | 16 |
| Chênh lệch | -22 | -12.09% | -1.848.000K | -33.85% | 7 |

## Kết luận triển khai

Không đưa vào production: cấu hình chưa cải thiện đồng thời các fold trước holdout và holdout 2026.

> Mẫu giả không tạo thêm thông tin xổ số. Nó chỉ làm cho quyết định bảo thủ hơn khi nhóm chuỗi có ít mẫu; hiệu quả phải được xác nhận trên holdout độc lập.
