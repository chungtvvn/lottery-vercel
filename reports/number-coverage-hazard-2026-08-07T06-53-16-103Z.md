# Độ phủ 100 số, gap và hazard

- Dữ liệu: 2005-10-01 → 2026-07-26 (7.503 ngày quay).
- 12 tháng gần nhất: 2025-07-27 → 2026-07-26.
- Tất cả feature theo ngày được tính trước khi đọc kết quả của chính ngày đó.

## Bao nhiêu ngày đủ 100 số?

| Phạm vi | Chu kỳ | Trung bình | Trung vị | P90 | Min | Max |
|---|---:|---:|---:|---:|---:|---:|
| Lô 27 vị trí | 377 | 19.87 | 19 | 26 | 11 | 37 |
| Đề | 13 | 549.77 | 545 | 697 | 381 | 817 |

- Lô 12 tháng gần nhất: cửa sổ tối thiểu trung bình **19.11 ngày**, khoảng 11–37 ngày.
- Đề 12 tháng gần nhất: cửa sổ tối thiểu trung bình **489.59 ngày**, khoảng 365–648 ngày.
- Chu kỳ Đề hiện tại còn thiếu: **15, 18, 56, 58, 98**.

## Kiểm tra khả năng phân biệt

Lift >1 nghĩa là nhóm hazard cao hoặc nhóm còn thiếu xuất hiện nhiều hơn nhóm đối chứng; cần ổn định qua các giai đoạn mới được dùng.

| Phạm vi | Giai đoạn | Số kết quả | Hazard Top/Bottom | Thiếu/Đã thấy |
|---|---|---:|---:|---:|
| Lô | train-2016-2020 | 42595 | 0.988 | 0.995 |
| Lô | validation-2021-2023 | 25750 | 1.013 | 0.998 |
| Lô | test-2024-2025 | 17229 | 0.906 | 1.015 |
| Lô | diagnostic-2026 | 4825 | 0.980 | 1.005 |
| Đề | train-2016-2020 | 1785 | 1.017 | 0.953 |
| Đề | validation-2021-2023 | 1083 | 0.982 | 1.044 |
| Đề | test-2024-2025 | 723 | 1.014 | 1.070 |
| Đề | diagnostic-2026 | 203 | 1.769 | 0.657 |

Không diễn giải số còn thiếu là chắc chắn sắp về. Báo cáo tiếp theo sẽ đánh giá feature này khi ghép với baseline trên validation/test/holdout cố định.
