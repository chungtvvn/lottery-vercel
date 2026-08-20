# Bộ lọc phủ quyết nhóm bảo thủ - strict PIT nhiều năm

Sinh lúc: 2026-07-27T18:35:16.835Z

## Thiết kế kiểm định

- Tín hiệu nhóm không được cộng trực tiếp vào điểm của 100 số.
- Chỉ các quantile có cận trên Wilson của tỷ trọng hit thấp hơn tỷ trọng nền mới được phủ quyết.
- Phủ quyết chỉ hoán đổi 1:1 trong thứ hạng Block/Small; số con đánh và vốn mỗi ngày không đổi.
- Cấu hình chọn trên 2016-2019, khóa trước kiểm định 2020-2022 và holdout 2023-2026.
- Không dùng kết quả ngày D để tạo tín hiệu hay chọn số ngày D.

## Cấu hình được khóa

- Base: block; đánh 15; tối đa 3 hoán đổi/ngày.
- Quantile: 20; bin phủ quyết: 0, 3, 7, 9, 19.
- Wilson z=0.674; lợi thế loại trừ tối thiểu=0.000%.
- Số cấu hình đã thử ở development: 540 (4 profile phủ quyết khác nhau).

## Development 2016-2019

- Dàn cố định: 15 số; hòa vốn: 17.857%.
- Baseline: 16.125%, -2.103.000K, chuỗi thua dài nhất 27.
- Có phủ quyết: 17.163%, -843.000K, chuỗi thua dài nhất 27.
- Chênh lệch: 1.038%, 1.260.000K; đổi 4001 lượt số trên 1429 ngày.

| Năm | Ngày | Baseline trúng | Phủ quyết trúng | Δ trúng | Baseline profit | Phủ quyết profit | Δ profit |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2016 | 362 | 17.403% | 17.956% | 0.552% | -138.000K | 30.000K | 168.000K |
| 2017 | 361 | 17.452% | 17.452% | 0.000% | -123.000K | -123.000K | 0K |
| 2018 | 361 | 15.235% | 18.837% | 3.601% | -795.000K | 297.000K | 1.092.000K |
| 2019 | 361 | 14.404% | 14.404% | 0.000% | -1.047.000K | -1.047.000K | 0K |

## Validation 2020-2022

- Dàn cố định: 15 số; hòa vốn: 17.857%.
- Baseline: 14.689%, -2.826.000K, chuỗi thua dài nhất 35.
- Có phủ quyết: 14.595%, -2.910.000K, chuỗi thua dài nhất 43.
- Chênh lệch: -0.094%, -84.000K; đổi 2985 lượt số trên 1057 ngày.

| Năm | Ngày | Baseline trúng | Phủ quyết trúng | Δ trúng | Baseline profit | Phủ quyết profit | Δ profit |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2020 | 340 | 18.529% | 17.941% | -0.588% | 192.000K | 24.000K | -168.000K |
| 2021 | 361 | 13.296% | 14.681% | 1.385% | -1.383.000K | -963.000K | 420.000K |
| 2022 | 361 | 12.465% | 11.357% | -1.108% | -1.635.000K | -1.971.000K | -336.000K |

## Cổng validation

- Kết quả: **KHÔNG ĐẠT**.
- Chi tiết: `{"totalProfitPositive":false,"atLeastTwoProfitableYears":false,"improvesAtLeastTwoYears":false,"longestLossIncreaseWithin20Percent":false}`.

## Holdout 2023-2026

- Dàn cố định: 15 số; hòa vốn: 17.857%.
- Baseline: 15.736%, -2.265.000K, chuỗi thua dài nhất 31.
- Có phủ quyết: 15.264%, -2.769.000K, chuỗi thua dài nhất 31.
- Chênh lệch: -0.472%, -504.000K; đổi 3512 lượt số trên 1260 ngày.

| Năm | Ngày | Baseline trúng | Phủ quyết trúng | Δ trúng | Baseline profit | Phủ quyết profit | Δ profit |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2023 | 361 | 15.789% | 16.620% | 0.831% | -627.000K | -375.000K | 252.000K |
| 2024 | 362 | 18.232% | 16.851% | -1.381% | 114.000K | -306.000K | -420.000K |
| 2025 | 361 | 13.573% | 12.188% | -1.385% | -1.299.000K | -1.719.000K | -420.000K |
| 2026 | 187 | 14.973% | 15.508% | 0.535% | -453.000K | -369.000K | 84.000K |

## Kết luận

- Không đưa vào production: chưa đạt đủ điều kiện lợi nhuận và ổn định trên giai đoạn độc lập.
- Không có kết quả lịch sử nào đảm bảo lợi nhuận tương lai.

