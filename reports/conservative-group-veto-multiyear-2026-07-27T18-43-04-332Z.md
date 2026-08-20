# Bộ lọc phủ quyết nhóm bảo thủ - không đủ bằng chứng

Sinh lúc: 2026-07-27T18:43:04.330Z

## Kết quả

- Không có bin nào trong 20% cuối của thứ hạng nhóm đạt cận Wilson một phía 90%.
- Vì không có tín hiệu đạt chuẩn, hệ thống không hoán đổi số và không chạy tối ưu profit trên validation/holdout.
- Đây là hành vi chủ đích để tránh hạ ngưỡng thống kê hoặc dò holdout cho đến khi xuất hiện profit dương giả.

## Phạm vi

- Huấn luyện mô hình nhóm: 2008-01-01 đến 2012-12-31.
- Chọn cấu hình mô hình: 2013-01-01 đến 2013-12-31.
- Hiệu chuẩn phủ quyết: 2014-01-01 đến 2015-12-31.
- Tập strict PIT 2016-2026 chỉ được giữ lại để so sánh khi có tín hiệu vượt cổng hiệu chuẩn.

## Kết luận

- Không đưa phương pháp vào production.
- Tín hiệu nhóm có thể dùng để giải thích/phân tầng, nhưng chưa đủ độ tin cậy để phủ quyết Block/Small.

