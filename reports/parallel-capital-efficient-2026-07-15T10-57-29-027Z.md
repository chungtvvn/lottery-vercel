# Nghiên cứu Đề song song giảm vốn

- Sinh lúc: 2026-07-15T10:57:29.014Z
- Cấu hình thử: 97
- Train: 2025-01-01 -> 2025-12-31, baseline 2024-12-31
- Holdout: 2025-01-01 -> 2025-12-31, baseline 2024-12-31
- Kinh tế: 1000K/đơn vị, trúng x84

## Cấu hình được chọn chỉ từ 2025

- ID: fusion-n20-s50-a0-x3
- 2025: 72/361 (19.94%), profit -880000K, ROI -10.75%, TB 20.00 số / 22.68 đơn vị, LL 28
- 2026 holdout: 72/361 (19.94%), profit -880000K, ROI -10.75%, TB 20.00 số / 22.68 đơn vị, LL 28

## Production song song hiện tại

- 2025: 149/361 (41.27%), profit -3350000K, ROI -18.56%, TB 43.28 số / 50 đơn vị, LL 13
- 2026: 149/361 (41.27%), profit -3350000K, ROI -18.56%, TB 43.28 số / 50 đơn vị, LL 13

Không thay mặc định nếu cấu hình mới không cải thiện holdout mà vẫn giữ hoặc giảm chuỗi thua.
