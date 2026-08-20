# Kết luận nghiên cứu bộ lọc phủ quyết nhóm

## Điều kiện cố định

- Đề, 30 số/ngày, 1.000K/số, trúng nhận 84 lần.
- Điểm hòa vốn: `30 / 84 = 35,714286%`.
- Snapshot chuỗi Block/Small là strict prefix PIT, cùng ngày và cùng vốn.
- Tín hiệu nhóm chỉ được phủ quyết và hoán đổi 1:1; không cộng trực tiếp vào thứ hạng 100 số.
- Development: 2016-2019; validation: 2020-2022; holdout: 2023-2026.

## Bộ lọc đúng chuẩn bảo thủ

- Chỉ xét 20% cuối của thứ hạng nhóm.
- Cận trên Wilson một phía phải thấp hơn tỷ trọng nền với độ tin cậy tối thiểu 90%.
- Kết quả: không có bin nào đủ điều kiện phủ quyết.
- Vì không có tín hiệu vượt cổng hiệu chuẩn nên không được tối ưu tiếp trên validation/holdout.

## Thử nghiệm nới lỏng để chẩn đoán

Biến thể chỉ bảo vệ đồng thuận Block/Small, dùng Wilson khoảng 75%:

| Giai đoạn | Baseline hit | Phủ quyết hit | Delta profit | Profit phủ quyết |
|---|---:|---:|---:|---:|
| 2016-2019 | 30,381% | 30,588% | +252.000K | -6.222.000K |
| 2020-2022 | 29,096% | 30,038% | +840.000K | -5.064.000K |
| 2023-2026 | 29,740% | 29,976% | +252.000K | -6.126.000K |

Biến thể đồng thuận 5 phương pháp (Block, Small, Edge, posterior diversity, active-only):

| Giai đoạn | Baseline hit | Phủ quyết hit | Delta profit | Profit phủ quyết |
|---|---:|---:|---:|---:|
| 2016-2019 | 30,173% | 30,450% | +336.000K | -6.390.000K |
| 2020-2022 | 29,473% | 29,284% | -168.000K | -5.736.000K |
| 2023-2026 | 30,448% | 30,527% | +84.000K | -5.538.000K |

## Gate bỏ ngày

- Đã phân tầng ngày theo mức đồng thuận Block/Small và xác suất nhóm sau phủ quyết.
- Yêu cầu cận dưới Wilson 90% của tỷ lệ trúng phải vượt 35,714286%.
- Không có tầng nào đạt yêu cầu với cỡ mẫu tối thiểu 100 ngày.

## Kết luận

- Tín hiệu nhóm có thể cải thiện tương đối vài phần nghìn đến gần một điểm phần trăm ở một số giai đoạn.
- Mức cải thiện không đủ bù biên payout; không có phương án profit dương ổn định.
- Không đưa bộ lọc này vào production và không hạ ngưỡng thống kê để tìm một kết quả dương do overfit.
- Hướng hợp lý tiếp theo là giữ nhóm làm công cụ chẩn đoán/calibration, không dùng làm tín hiệu quyết định loại số.
