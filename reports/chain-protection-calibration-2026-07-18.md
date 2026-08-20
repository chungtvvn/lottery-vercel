# Hiệu chỉnh xác suất cảnh báo bảo vệ chuỗi

- Cấu hình được chọn chỉ trên validation: minEffectiveTrials=25, minAbsoluteLift=1.500%.
- Train dùng 2014-2020; test 2024-2025 và holdout 2026 không tham gia chọn tham số.
- Mỗi family trong một ngày có tổng trọng số 1 để giảm ảo giác cỡ mẫu do hàng trăm chuỗi tương quan.
- Xác suất mô hình là log-odds lift phân cấp so với xác suất nền `setSize/100`.

| Giai đoạn | Candidate | Brier model | Brier nền | Log loss model | Log loss nền | Tín hiệu protect | Event protect | Nền protect |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Train 2014-2020 | 84.744 | 0.168253 | 0.168317 | 0.513050 | 0.513355 | 336 | 11.310% | 8.568% |
| Validation 2021-2023 | 35.993 | 0.157563 | 0.157337 | 0.487352 | 0.486447 | 103 | 16.505% | 8.311% |
| Test 2024-2025 | 23.041 | 0.164756 | 0.164789 | 0.505307 | 0.505322 | 42 | 7.143% | 7.024% |
| Holdout 2026 | 61.101 | 0.166677 | 0.166641 | 0.509461 | 0.509329 | 179 | 6.704% | 7.821% |

## Diễn giải

- `Event protect` lớn hơn `Nền protect` mới cho thấy cohort cảnh báo chứa kết quả thực tế nhiều hơn độ rộng tập số vốn có.
- Nếu Brier/log loss không tốt hơn nền trên test và holdout, cảnh báo chưa đủ để thay đổi dàn Hold70 production.
- Đây mới là calibration cấp chuỗi; bước kế tiếp mới tổng hợp sang cấp số và giới hạn số lượt swap.

