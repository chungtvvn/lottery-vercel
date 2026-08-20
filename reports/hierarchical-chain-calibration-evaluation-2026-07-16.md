# Đánh giá hiệu chỉnh xác suất chuỗi phân cấp

## Mục tiêu

Kết hợp chuỗi đang diễn ra và chuỗi tiềm năng bằng xác suất được hiệu chỉnh, thay vì cộng trực tiếp dropoff của nhiều chuỗi có tương quan.

Phương pháp thử nghiệm `hierarchicalChainCalibrationHold70`:

- replay membership của active/potential theo từng ngày để đo cơ hội thực;
- prior theo độ phủ của tập số, sau đó partial pooling theo trạng thái/độ rộng -> họ -> pattern;
- Beta-Binomial empirical Bayes để kéo mẫu nhỏ về prior;
- mỗi scope chỉ có một quan sát mỗi ngày và mỗi họ chỉ đóng góp tín hiệu mạnh nhất;
- chỉ hoán đổi tối đa hai số quanh dàn `chainSmallFirst`, không thay toàn bộ ranking;
- chọn cấu hình bằng cuối 2024 và 2025, khóa trước khi chấm 2026.

## Kết quả

| Giai đoạn | Nền | Hiệu chỉnh | Chênh lệch |
|---|---:|---:|---:|
| Cuối 2024, 121 ngày | 37 trúng, 30,58% | 40 trúng, 33,06% | +3 ngày, +252.000K |
| Năm 2025, 361 ngày | 99 trúng, 27,42% | 100 trúng, 27,70% | +1 ngày, +84.000K |
| Holdout 2026 đến 14/07, 191 ngày | 68 trúng, 35,60% | 74 trúng, 38,74% | +6 ngày, +504.000K |

Kinh tế holdout: nền `-18.000K`, phương pháp mới `+486.000K`; ROI mới `8,48%`.

Kiểm định ghép cặp: cùng trúng 67 ngày, cùng trượt 116 ngày, phương pháp mới thắng riêng 7 ngày và nền thắng riêng 1 ngày. McNemar exact hai phía `p = 0,0703125`, chưa đạt ngưỡng bằng chứng mạnh `p < 0,05`.

Khoảng Wilson 95% của tỷ lệ trúng phương pháp mới là `32,12%–45,81%`; khoảng này vẫn giao với nền `29,16%–42,62%`.

## Kết luận

Phương pháp mới có tín hiệu tốt và ổn định theo hướng tương đối ở cả hai cửa sổ chọn cấu hình và holdout, nhưng chưa đủ bằng chứng để thay production:

- 2024 và 2025 vẫn dưới điểm hòa vốn 35,71% của dàn 30 số, ăn 84;
- chênh lệch holdout chưa đạt ý nghĩa thống kê 5%;
- đoạn mới 06/07–14/07 chỉ đạt 1/9, dù tốt hơn nền 0/9 nhưng vẫn lỗ tuyệt đối.

Giữ trạng thái `research-only`. Bước tiếp theo hợp lý là tiếp tục chấm bất biến trên các ngày mới, không điều chỉnh cấu hình, cho đến khi có thêm ít nhất 150–250 ngày độc lập hoặc đạt kiểm định ghép cặp rõ ràng.

Nguồn máy đọc chi tiết: `reports/research_hierarchical_chain_calibration_2026-07-16T15-51-27-706Z.json`.
