# Kiểm chứng Đề Song Song Mốc 20 năm: gộp hai dàn

- Kỳ: 2026-01-01 đến 2026-07-14, 191 ngày.
- Mốc 20 năm được khóa ở 31/12 của năm trước; trạng thái chuỗi được lấy đến trước ngày dự đoán.
- Kinh tế: 1.000K/số, trúng x84. Không nhân x2 trong hai biến thể được yêu cầu.

| Biến thể | Trúng | Tỷ lệ | TB số đánh | Profit | ROI | Thua dài nhất |
|---|---:|---:|---:|---:|---:|---:|
| block85 | 72/191 | 37.70% | 15 | 3.183.000K | 111.10% | 13 |
| small65 | 111/191 | 58.12% | 35 | 2.639.000K | 39.48% | 4 |
| unionDedup | 130/191 | 68.06% | 39.9 | 3.300.000K | 43.31% | 4 |
| exclusiveOnly | 77/191 | 40.31% | 29.79 | 778.000K | 13.67% | 11 |

## Cách đọc

- `unionDedup` là cách hiểu “hợp hai phương pháp, số trùng chỉ đánh một lần”.
- `exclusiveOnly` là cách hiểu chặt hơn: chỉ đánh các số không trùng, bỏ toàn bộ số giao; dàn sẽ nhỏ hơn nhưng rủi ro bỏ sót cao hơn.
- Báo cáo chỉ phục vụ kiểm chứng; không thay chiến lược mặc định hoặc các snapshot đã phát hành.
