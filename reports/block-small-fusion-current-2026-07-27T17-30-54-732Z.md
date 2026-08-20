# Kết hợp Nhịp Block và Chuỗi nhỏ - strict PIT

- Cùng phiên bản logic: `37281abbe548f2d5da574247e9035023fff01da943aebbb9f8f291dec8b0a9a1`
- Train: 2025-01-01 -> 2025-12-31 (361 ngày)
- Holdout khóa: 2026-01-01 -> 2026-07-26 (203 ngày)
- Kinh tế: đúng 30 số/ngày, 1000K/số, trúng x84; hòa vốn 35.7143%
- Đã thử 18 cấu hình, chỉ dùng 2025 để chọn.

## Cấu hình được chọn

- fusion-b25-a0-d0: Block 25%, Small 75%, thưởng đồng thuận 0, phạt bất đồng 0.
- Nửa đầu 2025: 55/177, hit 31.0734%, profit -690000K, LL 10.
- Nửa cuối 2025: 52/184, hit 28.2609%, profit -1152000K, LL 12.
- 2026 holdout: 63/203, hit 31.0345%, profit -798000K, ROI -13.1034%, LL 17.

## So với phương pháp đơn trên cùng holdout

- Block: 63/203, hit 31.0345%, profit -798000K, LL 10.
- Chuỗi nhỏ: 63/203, hit 31.0345%, profit -798000K, LL 17.

## Đánh song song với vốn biến đổi

- Hợp Block Hold85 + Small Hold65, x1: 2026 80/203, TB 38.48 số, profit -1091000K, ROI -13.9675%.
- Cùng dàn nhưng giao x2: 2026 80/203, 20 lần trúng giao, TB 50.00 đơn vị, profit -1750000K, ROI -17.2414%.
- Qua cổng production: KHÔNG.

Không thay mặc định nếu cấu hình không có lãi ở cả hai nửa train và holdout độc lập.
