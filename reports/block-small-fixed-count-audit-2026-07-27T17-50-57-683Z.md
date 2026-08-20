# Audit dàn cố định Block + Chuỗi nhỏ

- Train: 2025-01-01 -> 2025-12-31 (361 ngày)
- Holdout: 2026-01-01 -> 2026-07-26 (203 ngày)
- Source: `37281abbe548f2d5da574247e9035023fff01da943aebbb9f8f291dec8b0a9a1`
- Kinh tế: 1000K/số, trúng x84.

| Số đánh | Hit holdout | Baseline ngẫu nhiên | Lift | Hòa vốn | Profit | ROI | LL | Wilson 95% |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 40 | 90/203 (44.3350%) | 40.0000% | 4.3350% | 47.6190% | -560000K | -6.8966% | 7 | 37.6692% - 51.2112% |
| 45 | 102/203 (50.2463%) | 45.0000% | 5.2463% | 53.5714% | -567000K | -6.2069% | 6 | 43.4277% - 57.0557% |
| 50 | 107/203 (52.7094%) | 50.0000% | 2.7094% | 59.5238% | -1162000K | -11.4483% | 6 | 45.8548% - 59.4633% |

## Kết luận

Xếp hạng có lift dương so với chọn ngẫu nhiên cùng kích thước dàn, nhưng chưa vượt ngưỡng hòa vốn. Không đổi phương pháp Đề production.
