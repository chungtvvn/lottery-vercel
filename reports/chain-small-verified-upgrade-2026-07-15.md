# Nâng cấp Chuỗi nhỏ trước - kiểm chứng cùng cỡ

## Thay đổi thuật toán

Chiến lược thử nghiệm `chainSmallVerifiedExact` giữ nguyên hai ưu tiên cốt lõi:

1. Tier thấp hơn đứng trước.
2. Tập số nhỏ hơn đứng trước.

Chỉ khi hai chuỗi có cùng Tier và cùng số lượng số, phương pháp mới dùng thêm:

- Trạng thái đang diễn ra đứng trên tiềm năng chưa có chuyển tiếp hợp lệ.
- Xác suất gãy posterior được co về xác suất nền theo độ rộng tập số.
- Wilson lower bound và độ tin cậy theo cỡ mẫu.
- Giảm điểm nhịp block chưa có chuyển tiếp ngày hợp lệ.
- Giảm điểm thống kê bị kiểm duyệt tại biên kỷ lục.
- Tần suất dưới 1 lần/năm chỉ nhận bonus nhỏ, không còn quyết định tuyệt đối.

Phương pháp có ID riêng, chưa thay `chainSmallFirst` và chưa nằm trong preset mặc định.

## Backtest strict point-in-time

Điều kiện chung: Hold 70, đánh 30 số, 1.000K/số, trúng nhận 84 lần.
Baseline mỗi năm được khóa tại 31/12 năm trước; thống kê ngày được tái sinh từ raw prefix trước ngày dự đoán.

| Giai đoạn | Phương pháp | Ngày | Trúng | Tỷ lệ | Profit | ROI | Chuỗi thua dài nhất |
|---|---|---:|---:|---:|---:|---:|---:|
| 2025 | Chuỗi nhỏ gốc | 361 | 99 | 27,42% | -2.514.000K | -23,21% | 14 |
| 2025 | Kiểm chứng cùng cỡ | 361 | 97 | 26,87% | -2.682.000K | -24,76% | 14 |
| 2026 đến 14/07 | Chuỗi nhỏ gốc | 191 | 68 | 35,60% | -18.000K | -0,31% | 9 |
| 2026 đến 14/07 | Kiểm chứng cùng cỡ | 191 | 70 | 36,65% | +150.000K | +2,62% | 9 |

Ngưỡng hòa vốn là 35,71%.

## Mức độ thay đổi dàn

- 2025: 307/361 ngày giữ nguyên dàn, 54 ngày thay đổi; trung bình 0,39 số/ngày.
  Bản mới không thêm ngày trúng và làm mất 2 ngày trúng.
- 2026: 160/191 ngày giữ nguyên dàn, 31 ngày thay đổi; trung bình 0,47 số/ngày.
  Bản mới thêm 3 ngày trúng, làm mất 1 ngày trúng, tăng ròng 2 ngày.

## Kết luận

Biến thể mới cải thiện 2026 nhưng suy giảm 2025. Vì dấu hiệu đảo chiều giữa hai chế độ năm,
nó chưa đạt điều kiện thay phương pháp mặc định. Giữ ở trạng thái thử nghiệm để theo dõi bằng
snapshot bất biến; không dùng kết quả 2026 để điều chỉnh tiếp tham số rồi báo cáo lại trên cùng kỳ.

Nguồn đối chiếu:

- `research_true_pit_strategies_2026-07-15T10-36-27-359Z.json`
- `research_true_pit_strategies_2026-07-15T09-41-35-326Z.json`
