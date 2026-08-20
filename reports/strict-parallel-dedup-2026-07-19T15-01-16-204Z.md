# Strict PIT: gộp Đề Song Song Block 85 + Small 65

- Nguồn: research_true_pit_strategies_2026-07-19T15-00-20-971Z.json.
- Kỳ: 2026-01-01 đến 2026-07-14; 191 ngày.
- Mỗi ngày tái sinh thống kê từ raw prefix trước ngày dự đoán; baseline 20 năm khóa ở 31/12 năm trước.
- Kinh tế: 1.000K/số, trúng x84. Hai biến thể gộp không nhân x2.

| Biến thể | Trúng | Tỷ lệ | TB số | Profit | ROI | Thua dài nhất |
|---|---:|---:|---:|---:|---:|---:|
| block85 | 30/191 | 15.71% | 15 | -345.000K | -12.04% | 18 |
| small65 | 78/191 | 40.84% | 35 | -133.000K | -1.99% | 9 |
| unionDedup | 84/191 | 43.98% | 39.01 | -394.000K | -5.29% | 9 |
| exclusiveOnly | 60/191 | 31.41% | 28.01 | -310.000K | -5.79% | 13 |

## Song song x2 và đối chiếu replay

- Song song gốc, số giao đánh x2: 84/191 ngày trúng (43,98%), 24 ngày trúng số giao, profit **-478.000K**, ROI **-5,01%**, chuỗi thua dài nhất 9 ngày.
- Hai nhánh giao trung bình 10,99 số/ngày.
- Replay không strict trước đó báo hợp dàn 133/196 ngày (67,86%) và profit +3.358.000K. Strict PIT chỉ còn 84/191 ngày (43,98%) và profit -394.000K.
- Chênh lệch này xác nhận replay trên full-history index đã đánh giá quá lạc quan; không được dùng để quyết định production.

## Kết luận

- `unionDedup` không đạt hòa vốn: dàn trung bình 39,01 số cần tỷ lệ hòa vốn khoảng 46,44% khi ăn 84, nhưng chỉ đạt 43,98%.
- `exclusiveOnly` kém hơn rõ rệt và không nên triển khai.
- Song song x2 cũng âm; chưa có cơ sở thay đổi hoặc quảng bá phương pháp dựa trên kết quả replay.

Kết quả này là kiểm chứng research-only. Không đổi Mốc 20 năm, snapshot đã phát hành hay phương pháp mặc định.
