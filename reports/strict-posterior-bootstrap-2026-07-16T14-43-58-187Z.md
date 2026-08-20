# Nghiên cứu mẫu giả hậu nghiệm theo nhóm chuỗi

Sinh lúc: 2026-07-16T14:43:58.185Z

## Phương pháp

- Mỗi nhóm/trạng thái chuỗi dùng Beta-Binomial với prior nền 1.00%.
- Sinh 2.000 mẫu hậu nghiệm cho mỗi token; mẫu giả chỉ lượng hóa bất định, không được coi là quan sát thật.
- Train đầu 2024 → kiểm định cuối 2024; train 2024 → kiểm định 2025; khóa cấu hình rồi test 2026.
- Giữ cố định 30 số đánh / loại 70 số mỗi ngày.

## Cấu hình được chọn trước holdout

- ID: `posteriorBootstrap_coarse_p100_q90_top1_standalone`
- Mẫu token: coarse; prior: 100; metric: q90; tổng hợp: top1; selector: standalone; swap: 0.

| Giai đoạn chọn | Baseline trúng | Mẫu giả trúng | Δ trúng | Baseline profit | Mẫu giả profit | Δ profit |
|---|---:|---:|---:|---:|---:|---:|
| late-2024 | 37/121 (30.58%) | 45/121 (37.19%) | 8 | -522.000K | 150.000K | 672.000K |
| 2025 | 99/361 (27.42%) | 109/361 (30.19%) | 10 | -2.514.000K | -1.674.000K | 840.000K |

## Holdout 2026 chưa dùng để chọn cấu hình

| Phương pháp | Trúng | Tỷ lệ | Profit | ROI | Thua dài nhất |
|---|---:|---:|---:|---:|---:|
| chainSmallFirst | 68/182 | 37.36% | 252.000K | 4.62% | 9 |
| Mẫu giả hậu nghiệm | 47/182 | 25.82% | -1.512.000K | -27.69% | 14 |
| Chênh lệch | -21 | -11.54% | -1.764.000K | -32.31% | 5 |

## Kết luận triển khai

Không đưa vào production: cấu hình chưa cải thiện đồng thời các fold trước holdout và holdout 2026.

> Mẫu giả không tạo thêm thông tin xổ số. Nó chỉ làm cho quyết định bảo thủ hơn khi nhóm chuỗi có ít mẫu; hiệu quả phải được xác nhận trên holdout độc lập.
