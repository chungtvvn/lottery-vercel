# Đánh giá kết hợp phương pháp Hold 70

## Thiết kế

- Dữ liệu: 3.778 ngày strict point-in-time từ 2016 đến 10/07/2026.
- Dàn cố định: loại 70, đánh đúng 30 số/ngày.
- Kinh tế: 1.000K/số, ăn 84; hòa vốn cần 35,71% ngày trúng.
- Fit: 2016-2023 (mô hình cố định) hoặc 2018-2023 (walk-forward cần hai năm khởi tạo).
- Validation: 2024-2025.
- Holdout chưa dùng để chọn: 2026.
- Không đổi production default vì không phương án mới nào qua cổng kiểm định.

## Các kiểu ghép đã thử

1. Bỏ phiếu đều của Top 3/5/7 và toàn bộ 13 phương pháp.
2. Bỏ phiếu theo độ tin cậy có làm trơn, tính từ giai đoạn fit.
3. Chọn nhóm phương pháp đa dạng, phạt Jaccard khi dàn số trùng nhau nhiều.
4. Naive Bayes trên trạng thái một số được/không được từng phương pháp giữ lại.
5. Bayes theo chữ ký đồng thuận, làm trơn các chữ ký hiếm với prior 100/300/1.000.
6. Walk-forward khóa cuối năm: chỉ học các năm trước, giữ nguyên model cho năm dự đoán.
7. Chọn phương pháp thắng năm trước để dùng năm sau (kiểm tra khả năng đổi chế độ).

## Kết quả chính

### Mô hình cố định tốt nhất trước khi mở 2026

`all13:naiveBayes`

| Giai đoạn | Trúng | Tỷ lệ | Profit |
|---|---:|---:|---:|
| Fit 2016-2023 | 923/2.868 | 32,18% | -8.508.000K |
| Validation 2024-2025 | 239/723 | 33,06% | -1.614.000K |
| Holdout 2026 | 44/187 | 23,53% | -1.914.000K |

### Walk-forward khóa cuối năm tốt nhất trước khi mở 2026

`annual_3y_top5_signature_p1000`

| Giai đoạn | Trúng | Tỷ lệ | Profit |
|---|---:|---:|---:|
| Fit 2018-2023 | 660/2.145 | 30,77% | -8.910.000K |
| Validation 2024-2025 | 225/723 | 31,12% | -2.790.000K |
| Holdout 2026 | 64/187 | 34,22% | -234.000K |

Khoảng tin cậy Wilson 95% của holdout là 27,80%-41,28%, vẫn chứa mức ngẫu nhiên 30% và chưa chứng minh lợi thế ổn định.

### Baseline đáng chú ý trên holdout

`chainSmallFirst` đạt 68/187 = 36,36%, profit +102.000K. Khoảng tin cậy Wilson 95% là 29,81%-43,47%, vì vậy kết quả dương hiện tại chưa đủ để kết luận xác suất thật vượt hòa vốn.

## Chẩn đoán

- Top 30 theo đồng thuận của 13 phương pháp đạt 29,81% ở fit, 30,29% ở validation và 35,29% ở 2026. Tín hiệu đổi chế độ rõ rệt.
- Trong fit, xác suất thực tế theo số phiếu dao động quanh 1% cho mỗi số; số được nhiều phiếu không tăng xác suất một cách đơn điệu.
- Chọn phương pháp tốt nhất của năm trước để dùng năm sau chỉ đạt 1.006/3.416 = 29,45%, profit -17.976.000K.
- Các phương pháp đang dùng nhiều chuỗi tương quan và cùng tập số. Cộng phiếu làm tăng độ tự tin biểu kiến nhưng không tạo thêm thông tin độc lập.
- Mô hình chữ ký có thể đạt rất cao trên fit nhưng giảm mạnh ở validation, biểu hiện overfit rõ ràng.

## Kết luận triển khai

Không thay default production. Trong các thử nghiệm đã kiểm tra, chưa có tổ hợp Hold 70 nào đồng thời vượt 35,71% ở fit, validation và holdout. Hướng tiếp theo phải cải thiện tín hiệu cơ sở và calibration chuỗi, không tiếp tục quét thêm trọng số trên cùng 13 dàn vì sẽ chỉ tăng multiple-testing bias.

Các block complex mới thêm ngày 18/07/2026 chưa nằm trong bộ strict report cũ này. Chúng chỉ nên được đưa vào lần sinh strict PIT mới sau khi detector và naming đã được test, rồi đánh giá lại bằng cùng quy trình khóa fit/validation/holdout.
