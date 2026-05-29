# Báo Cáo So Sánh Hiệu Suất Backtest 20 Năm (XSMB)

Báo cáo phân tích so sánh hiệu suất loại trừ (ôm) và đánh của 2 phương pháp sắp xếp (Rủi ro và HT/Target) ở các quy mô số lượng loại trừ mục tiêu: **70**, **80**, và **90** số.

*   **Khoảng thời gian:** 20 năm gần nhất (~7305 ngày)
*   **Nguồn dữ liệu:** Local static JSON 
*   **Đánh giá:**
    - **Tỷ lệ Loại trừ thành công (Hold Win Rate):** Tần suất con đề đặc biệt rơi ra ngoài dàn ôm (tức là ta giữ lại phế thành công).
    - **Lợi nhuận Ôm:** Lợi nhuận ròng của việc ôm số (giữ phế 70.5%, đền x70).
    - **Lợi nhuận Đánh:** Lợi nhuận ròng của việc đánh dàn còn lại (mua giá 80% phế phết, ăn x70).

## 1. Bảng Tổng Hợp Kết Quả So Sánh (20 Năm)

| Cấu hình phương pháp | Ngày chơi | Thắng (Không Trúng Đề) | Thua (Bị Trúng Đề) | Tỷ lệ Thắng Ôm | TB Số Ôm | TB Số Đánh | Lợi Nhuận Đánh (K) | Lợi Nhuận Ôm (K) | Lợi Nhuận Gộp (K) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Risk Sort - Hold 70** | 7299 | 3533 | 3766 | **48.40%** | 69.8 | 30.2 | +712.396 | **+960.951** | +1.673.347 |
| **Risk Sort - Hold 80** | 7299 | 2468 | 4831 | **33.81%** | 79.9 | 20.1 | +553.424 | **+729.357** | +1.282.781 |
| **Frequency Sort - Hold 70** | 7299 | 2988 | 4311 | **40.94%** | 69.9 | 30.1 | +333.824 | **+582.380** | +916.204 |
| **Risk Sort - Hold 90** | 7299 | 1330 | 5969 | **18.22%** | 89.9 | 10.1 | +339.928 | **+450.234** | +790.162 |
| **Frequency Sort - Hold 80** | 7299 | 2019 | 5280 | **27.66%** | 79.9 | 20.1 | +239.420 | **+415.316** | +654.736 |
| **Frequency Sort - Hold 90** | 7299 | 1020 | 6279 | **13.97%** | 89.9 | 10.1 | +122.960 | **+233.266** | +356.226 |

## 2. Nhận Xét & Phân Tích Phương Pháp Loại Trừ Tốt Nhất

### Cấu hình tối ưu nhất về lợi nhuận ôm: **Risk Sort - Hold 70**
- **Lợi nhuận Ôm lớn nhất:** `+960.951 K VND` sau 20 năm.
- **Tỷ lệ loại trừ thành công:** `48.40%` (Trúng đề `3766` ngày trên tổng số `7299` ngày chơi).
- Số lượng ôm trung bình thực tế: `69.8` số, đánh trung bình `30.2` số.

### Phân tích xu hướng quy mô loại trừ:
1. **Mức loại trừ 70 số (TB ~70 số ôm, ~30 số đánh):**
   - Có tính an toàn cao, biên rủi ro thắng ôm ở mức trung bình (~70% thắng).
2. **Mức loại trừ 80 số (TB ~80 số ôm, ~20 số đánh):**
   - Tỷ lệ thắng ôm cao hơn (~80% thắng) giúp tích lũy dòng tiền phế tốt.
3. **Mức loại trừ 90 số (TB ~90 số ôm, ~10 số đánh):**
   - Đạt tỷ lệ loại trừ thành công cực kỳ cao (~90% thắng). Biên lợi nhuận phế ôm tuy lớn nhưng mỗi khi bị trúng đề (đền x70 lần) sẽ mất khoản lớn. Dù vậy, theo kết quả backtest thực tế 20 năm, đây vẫn có thể là mức mang lại lợi nhuận ôm lớn nhất nếu tỷ lệ gãy thực tế thấp hơn lý thuyết.

## 3. Danh sách các file CSV báo cáo tuần
- [Báo cáo tuần - Risk Sort - Hold 70](file:///Users/chungtv/Desktop/lottery-stats-vercel/reports/backtest_weekly_risk_sort_-_hold_70_20y.csv)
- [Báo cáo tuần - Risk Sort - Hold 80](file:///Users/chungtv/Desktop/lottery-stats-vercel/reports/backtest_weekly_risk_sort_-_hold_80_20y.csv)
- [Báo cáo tuần - Frequency Sort - Hold 70](file:///Users/chungtv/Desktop/lottery-stats-vercel/reports/backtest_weekly_frequency_sort_-_hold_70_20y.csv)
- [Báo cáo tuần - Risk Sort - Hold 90](file:///Users/chungtv/Desktop/lottery-stats-vercel/reports/backtest_weekly_risk_sort_-_hold_90_20y.csv)
- [Báo cáo tuần - Frequency Sort - Hold 80](file:///Users/chungtv/Desktop/lottery-stats-vercel/reports/backtest_weekly_frequency_sort_-_hold_80_20y.csv)
- [Báo cáo tuần - Frequency Sort - Hold 90](file:///Users/chungtv/Desktop/lottery-stats-vercel/reports/backtest_weekly_frequency_sort_-_hold_90_20y.csv)
