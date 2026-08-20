# Nghiên cứu phân bổ phân cấp nhóm số

Sinh lúc: 2026-07-27T18:12:02.058Z

## Phương pháp

- 15 phân hoạch chuẩn, gom vào 7 trục độc lập: đầu, đít, hai chữ số, tổng truyền thống, tổng mới, hiệu và bộ.
- Mỗi nhóm được chuẩn hóa theo xác suất nền `số lượng nhóm / 100` và co Bayes để nhóm nhỏ không tạo tín hiệu ảo.
- Đặc trưng chỉ dùng dữ liệu trước ngày dự đoán: 20 năm, từ đầu năm, 365/90/30 ngày, gap và chuyển tiếp trạng thái.
- Huấn luyện 2008-2024; chọn tham số và trọng số kết hợp trên nửa đầu 2025; kiểm tra nửa cuối 2025 và giữ 2026 làm holdout.

## Trọng số mô hình đã học

| Đặc trưng | Trọng số trước 2025 | Trọng số refit trước 2026 |
|---|---:|---:|
| history20y | -0.000129 | -0.000113 |
| yearToDate | 0.002097 | 0.001791 |
| days365 | 0.000757 | 0.000741 |
| days90 | 0.000686 | 0.000518 |
| days30 | 0.000274 | 0.000278 |
| normalizedGap | 0.000297 | -0.001219 |
| transition20y | -0.001910 | -0.001530 |
| transition365 | -0.002522 | -0.002202 |

Dấu dương nghĩa là nhóm xuất hiện nhiều/gap lớn làm tăng xếp hạng; dấu âm nghĩa là mô hình học hồi quy về trung bình.

## Kết quả strict PIT

| Giai đoạn | Số đánh | Cấu hình | Trúng | Nền ngẫu nhiên | Lift | Hòa vốn | Profit | ROI | Chuỗi thua | Wilson 95% |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| selection2025H1 | 30 | blockSmall5050 + nhóm 0% | 35.0282% | 30.0000% | 5.0282% | 35.7143% | -102.000K | -1.9209% | 7 | 28.3859%–42.3067% |
| selection2025H1 | 40 | blockOnly + nhóm 0% | 45.1977% | 40.0000% | 5.1977% | 47.6190% | -360.000K | -5.0847% | 7 | 38.0453%–52.5543% |
| selection2025H1 | 45 | blockOnly + nhóm 0% | 51.4124% | 45.0000% | 6.4124% | 53.5714% | -321.000K | -4.0301% | 6 | 44.0978%–58.6671% |
| selection2025H1 | 50 | blockOnly + nhóm 25% | 57.6271% | 50.0000% | 7.6271% | 59.5238% | -282.000K | -3.1864% | 6 | 50.2611%–64.6691% |
| validation2025H2 | 30 | blockSmall5050 + nhóm 0% | 27.7174% | 30.0000% | -2.2826% | 35.7143% | -1.236.000K | -22.3913% | 14 | 21.7558%–34.5904% |
| validation2025H2 | 40 | blockOnly + nhóm 0% | 38.0435% | 40.0000% | -1.9565% | 47.6190% | -1.480.000K | -20.1087% | 10 | 31.3408%–45.2353% |
| validation2025H2 | 45 | blockOnly + nhóm 0% | 42.3913% | 45.0000% | -2.6087% | 53.5714% | -1.728.000K | -20.8696% | 8 | 35.4781%–49.6157% |
| validation2025H2 | 50 | blockOnly + nhóm 25% | 46.7391% | 50.0000% | -3.2609% | 59.5238% | -1.976.000K | -21.4783% | 6 | 39.6703%–53.9413% |
| holdout2026 | 30 | blockSmall5050 + nhóm 0% | 31.0345% | 30.0000% | 1.0345% | 35.7143% | -798.000K | -13.1034% | 12 | 25.0720%–37.7014% |
| holdout2026 | 40 | blockOnly + nhóm 0% | 43.3498% | 40.0000% | 3.3498% | 47.6190% | -728.000K | -8.9655% | 6 | 36.7186%–50.2279% |
| holdout2026 | 45 | blockOnly + nhóm 0% | 47.7833% | 45.0000% | 2.7833% | 53.5714% | -987.000K | -10.8046% | 6 | 41.0169%–54.6319% |
| holdout2026 | 50 | blockOnly + nhóm 25% | 51.7241% | 50.0000% | 1.7241% | 59.5238% | -1.330.000K | -13.1034% | 7 | 44.8820%–58.5022% |

## So sánh riêng ở Hold 70 / đánh 30

| Giai đoạn | Chuỗi gốc | Nhóm độc lập | Kết hợp đã khóa |
|---|---:|---:|---:|
| selection2025H1 | 35.0282% (-102.000K) | 24.2938% (-1.698.000K) | 35.0282% (-102.000K) |
| validation2025H2 | 27.7174% (-1.236.000K) | 27.1739% (-1.320.000K) | 27.7174% (-1.236.000K) |
| holdout2026 | 31.0345% (-798.000K) | 23.1527% (-2.142.000K) | 31.0345% (-798.000K) |

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
