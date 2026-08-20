# Kết hợp Block với SmallChain đã hiệu chỉnh

- Cấu hình được chọn trước holdout: `balanced60-admit-s1`.
- Block model học trên mẫu 2014-2023; chọn bằng mức delta tệ nhất của 2024 và 2025; 2026 không tham gia chọn.
- Block chỉ hoán đổi có kiểm soát quanh 30 số của `chainSmallVerifiedExact`.
- Hold 70, đánh 30, 1.000K/số, ăn 84; hòa vốn 35,71%.

| Giai đoạn | Small hiệu chỉnh | Hybrid | Delta hit | Profit Hybrid | ROI Hybrid | Đổi số/ngày | Cứu/Hại | Chuỗi thua |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2024 chọn cấu hình | 14/37 (37.84%) | 14/37 (37.84%) | +0 | +66,000K | 5.95% | 0.14 | 0/0 | 4 |
| 2025 validation | 9/37 (24.32%) | 9/37 (24.32%) | +0 | -354,000K | -31.89% | 0.00 | 0/0 | 15 |
| 2026 holdout đầy đủ | 70/191 (36.65%) | 70/191 (36.65%) | +0 | +150,000K | 2.62% | 0.01 | 0/0 | 9 |

## Kết luận kiểm định

- Hybrid không tạo thêm ngày trúng trên holdout 2026; chưa có lý do thay baseline.
- Không thay production default trong nghiên cứu này.
