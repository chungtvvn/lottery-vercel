# Nghiên cứu phân bổ phân cấp nhóm số

Sinh lúc: 2026-07-27T18:08:11.642Z

## Phương pháp

- 15 phân hoạch chuẩn, gom vào 7 trục độc lập: đầu, đít, hai chữ số, tổng truyền thống, tổng mới, hiệu và bộ.
- Mỗi nhóm được chuẩn hóa theo xác suất nền `số lượng nhóm / 100` và co Bayes để nhóm nhỏ không tạo tín hiệu ảo.
- Đặc trưng chỉ dùng dữ liệu trước ngày dự đoán: 20 năm, từ đầu năm, 365/90/30 ngày và gap.
- Huấn luyện 2008-2024; chọn tham số và trọng số kết hợp trên nửa đầu 2025; kiểm tra nửa cuối 2025 và giữ 2026 làm holdout.

## Trọng số mô hình đã học

| Đặc trưng | Trọng số trước 2025 | Trọng số refit trước 2026 |
|---|---:|---:|
| history20y | -0.000017 | -0.000015 |
| yearToDate | 0.000274 | 0.000235 |
| days365 | 0.000099 | 0.000097 |
| days90 | 0.000090 | 0.000069 |
| days30 | 0.000036 | 0.000038 |
| normalizedGap | 0.000043 | -0.000185 |

Dấu dương nghĩa là nhóm xuất hiện nhiều/gap lớn làm tăng xếp hạng; dấu âm nghĩa là mô hình học hồi quy về trung bình.

## Kết quả strict PIT

| Giai đoạn | Số đánh | Cấu hình | Trúng | Nền ngẫu nhiên | Lift | Hòa vốn | Profit | ROI | Chuỗi thua | Wilson 95% |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| selection2025H1 | 30 | blockSmall5050 + nhóm 0% | 35.0282% | 30.0000% | 5.0282% | 35.7143% | -102.000K | -1.9209% | 7 | 28.3859%–42.3067% |
| selection2025H1 | 40 | blockSmall5050 + nhóm 25% | 46.8927% | 40.0000% | 6.8927% | 47.6190% | -108.000K | -1.5254% | 6 | 39.6850%–54.2323% |
| selection2025H1 | 45 | blockSmall5050 + nhóm 25% | 52.5424% | 45.0000% | 7.5424% | 53.5714% | -153.000K | -1.9209% | 5 | 45.2101%–59.7666% |
| selection2025H1 | 50 | blockSmall5050 + nhóm 10% | 58.1921% | 50.0000% | 8.1921% | 59.5238% | -198.000K | -2.2373% | 4 | 50.8270%–65.2092% |
| validation2025H2 | 30 | blockSmall5050 + nhóm 0% | 27.7174% | 30.0000% | -2.2826% | 35.7143% | -1.236.000K | -22.3913% | 14 | 21.7558%–34.5904% |
| validation2025H2 | 40 | blockSmall5050 + nhóm 25% | 35.8696% | 40.0000% | -4.1304% | 47.6190% | -1.816.000K | -24.6739% | 11 | 29.2936%–43.0235% |
| validation2025H2 | 45 | blockSmall5050 + nhóm 25% | 41.8478% | 45.0000% | -3.1522% | 53.5714% | -1.812.000K | -21.8841% | 11 | 34.9579%–49.0712% |
| validation2025H2 | 50 | blockSmall5050 + nhóm 10% | 46.1957% | 50.0000% | -3.8043% | 59.5238% | -2.060.000K | -22.3913% | 8 | 39.1434%–53.4036% |
| holdout2026 | 30 | blockSmall5050 + nhóm 0% | 31.0345% | 30.0000% | 1.0345% | 35.7143% | -798.000K | -13.1034% | 12 | 25.0720%–37.7014% |
| holdout2026 | 40 | blockSmall5050 + nhóm 25% | 41.3793% | 40.0000% | 1.3793% | 47.6190% | -1.064.000K | -13.1034% | 8 | 34.8255%–48.2534% |
| holdout2026 | 45 | blockSmall5050 + nhóm 25% | 45.3202% | 45.0000% | 0.3202% | 53.5714% | -1.407.000K | -15.4023% | 8 | 38.6224%–52.1918% |
| holdout2026 | 50 | blockSmall5050 + nhóm 10% | 49.7537% | 50.0000% | -0.2463% | 59.5238% | -1.666.000K | -16.4138% | 6 | 42.9443%–56.5723% |

## So sánh riêng ở Hold 70 / đánh 30

| Giai đoạn | Chuỗi gốc | Nhóm độc lập | Kết hợp đã khóa |
|---|---:|---:|---:|
| selection2025H1 | 35.0282% (-102.000K) | 27.1186% (-1.278.000K) | 35.0282% (-102.000K) |
| validation2025H2 | 27.7174% (-1.236.000K) | 29.8913% (-900.000K) | 27.7174% (-1.236.000K) |
| holdout2026 | 31.0345% (-798.000K) | 24.1379% (-1.974.000K) | 31.0345% (-798.000K) |

## Độ lệch phân bổ theo năm

| Phân hoạch | Số nhóm | TV trung bình | TV xấu nhất | Chi-square trung bình |
|---|---:|---:|---:|---:|
| headParity | 2 | 2.5626% | 5.6474% | 1.401 |
| headSize | 2 | 1.7657% | 5.9557% | 0.690 |
| headExact | 10 | 6.4262% | 9.8615% | 9.463 |
| tailParity | 2 | 2.1213% | 5.1247% | 1.008 |
| tailSize | 2 | 2.1600% | 5.6474% | 0.987 |
| tailExact | 10 | 5.9678% | 9.6133% | 8.221 |
| digitParity | 4 | 3.9962% | 7.1330% | 3.699 |
| digitSize | 4 | 3.3781% | 5.9557% | 2.708 |
| traditionalSumParity | 2 | 2.3508% | 6.5097% | 1.290 |
| traditionalSumExact | 10 | 6.5622% | 9.0305% | 9.739 |
| newSumParity | 2 | 2.3508% | 6.5097% | 1.290 |
| newSumExact | 19 | 8.4872% | 11.9724% | 19.012 |
| differenceParity | 2 | 2.3508% | 6.5097% | 1.290 |
| differenceExact | 10 | 6.3097% | 11.4365% | 9.802 |
| boGroup | 15 | 8.0730% | 10.1717% | 15.112 |
