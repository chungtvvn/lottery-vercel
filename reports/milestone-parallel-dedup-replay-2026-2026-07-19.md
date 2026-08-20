# Kiểm chứng Đề Song Song Mốc 20 năm - 2026

## Phạm vi

- Dữ liệu: 196 ngày có kết quả từ `2026-01-01` đến `2026-07-15`.
- Baseline Mốc 20 năm: khóa tại `2025-12-31`.
- Nhánh 1: `chainBlockFirst`, Hold 85, dàn 15 số.
- Nhánh 2: `chainSmallFirst`, Hold 65, dàn 35 số.
- Đơn vị: 1.000K/số, trúng nhận 84.000K.

Đây là replay theo engine Mốc 20 năm hiện hành, dùng baseline năm cố định và trạng thái chuỗi theo ngày của engine. Báo cáo này **không** được gắn nhãn strict full regeneration: việc tái sinh toàn bộ 60k+ chuỗi từ raw prefix cho từng ngày hiện vượt giới hạn RAM của máy, nên chưa được dùng để quyết định thay production.

## Kết quả

| Cách đánh | Dàn TB | Trúng/ngày | Tỷ lệ trúng | Lợi nhuận | ROI | Chuỗi thắng dài nhất | Chuỗi thua dài nhất |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Block 85 | 15,00 | 72/196 | 36,73% | +3.108.000K | 105,71% | 6 | 13 |
| Small 65 | 35,00 | 114/196 | 58,16% | +2.716.000K | 39,59% | 9 | 4 |
| Hợp dàn, mỗi số duy nhất đánh 1 lần | 39,87 | 133/196 | 67,86% | +3.358.000K | 42,97% | 14 | 4 |
| Chỉ số thuộc đúng một nhánh | 29,73 | 80/196 | 40,82% | +892.000K | 15,31% | 5 | 11 |
| Song song gốc, số giao đánh x2 | 50,00 đơn vị | 133/196 | 67,86% | +5.824.000K | 59,43% | 14 | 4 |

## Diễn giải

- “Hợp dàn” là gộp hai danh sách và loại trùng: một số chỉ đánh một đơn vị. Đây là cách phù hợp nếu ý nghĩa “lấy số không trùng” là không đánh lặp số.
- “Chỉ số thuộc đúng một nhánh” loại luôn phần giao của hai phương pháp. Kết quả kém rõ rệt, do đó không nên dùng.
- Số giao bình quân: 10,13 số/ngày. Có 53 ngày kết quả thuộc phần giao; vì vậy cơ chế đánh x2 hiện tại tạo thêm lợi nhuận trong replay này.

## Kết luận nghiên cứu

Không thay đổi mặc định production. Nếu mục tiêu là giảm vốn mà vẫn giữ xác suất trúng cao, phương án hợp dàn không nhân đôi là ứng viên hợp lý nhưng cần strict PIT đầy đủ trước khi đưa vào vận hành. Nếu mục tiêu là lợi nhuận trong replay Mốc 20 năm hiện tại, Song song gốc với x2 số giao vẫn tốt hơn.
