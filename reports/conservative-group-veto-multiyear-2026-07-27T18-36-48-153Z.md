# Bộ lọc phủ quyết nhóm bảo thủ - strict PIT nhiều năm

Sinh lúc: 2026-07-27T18:36:48.149Z

## Thiết kế kiểm định

- Tín hiệu nhóm không được cộng trực tiếp vào điểm của 100 số.
- Chỉ các quantile có cận trên Wilson của tỷ trọng hit thấp hơn tỷ trọng nền mới được phủ quyết.
- Phủ quyết chỉ hoán đổi 1:1 trong thứ hạng Block/Small; số con đánh và vốn mỗi ngày không đổi.
- Cấu hình chọn trên 2016-2019, khóa trước kiểm định 2020-2022 và holdout 2023-2026.
- Không dùng kết quả ngày D để tạo tín hiệu hay chọn số ngày D.

## Cấu hình được khóa

- Base: block; đánh 15; tối đa 1 hoán đổi/ngày.
- Quantile: 10; bin phủ quyết: 3.
- Wilson z=0.674; lợi thế loại trừ tối thiểu=0.000%.
- Số cấu hình đã thử ở development: 540 (4 profile phủ quyết khác nhau).

## Development 2016-2019

- Dàn cố định: 15 số; hòa vốn: 17.857%.
- Baseline: 16.125%, -2.103.000K, chuỗi thua dài nhất 27.
- Có phủ quyết: 16.609%, -1.515.000K, chuỗi thua dài nhất 28.
- Chênh lệch: 0.484%, 588.000K; đổi 742 lượt số trên 742 ngày.

| Năm | Ngày | Baseline trúng | Phủ quyết trúng | Δ trúng | Baseline profit | Phủ quyết profit | Δ profit |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2016 | 362 | 17.403% | 17.403% | 0.000% | -138.000K | -138.000K | 0K |
| 2017 | 361 | 17.452% | 18.006% | 0.554% | -123.000K | 45.000K | 168.000K |
| 2018 | 361 | 15.235% | 16.066% | 0.831% | -795.000K | -543.000K | 252.000K |
| 2019 | 361 | 14.404% | 14.958% | 0.554% | -1.047.000K | -879.000K | 168.000K |

## Validation 2020-2022

- Dàn cố định: 15 số; hòa vốn: 17.857%.
- Baseline: 14.689%, -2.826.000K, chuỗi thua dài nhất 35.
- Có phủ quyết: 14.783%, -2.742.000K, chuỗi thua dài nhất 35.
- Chênh lệch: 0.094%, 84.000K; đổi 558 lượt số trên 558 ngày.

| Năm | Ngày | Baseline trúng | Phủ quyết trúng | Δ trúng | Baseline profit | Phủ quyết profit | Δ profit |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2020 | 340 | 18.529% | 19.118% | 0.588% | 192.000K | 360.000K | 168.000K |
| 2021 | 361 | 13.296% | 13.019% | -0.277% | -1.383.000K | -1.467.000K | -84.000K |
| 2022 | 361 | 12.465% | 12.465% | 0.000% | -1.635.000K | -1.635.000K | 0K |

## Cổng validation

- Kết quả: **KHÔNG ĐẠT**.
- Chi tiết: `{"totalProfitPositive":false,"atLeastTwoProfitableYears":false,"improvesAtLeastTwoYears":false,"longestLossIncreaseWithin20Percent":true}`.

## Holdout 2023-2026

- Dàn cố định: 15 số; hòa vốn: 17.857%.
- Baseline: 15.736%, -2.265.000K, chuỗi thua dài nhất 31.
- Có phủ quyết: 15.500%, -2.517.000K, chuỗi thua dài nhất 31.
- Chênh lệch: -0.236%, -252.000K; đổi 610 lượt số trên 610 ngày.

| Năm | Ngày | Baseline trúng | Phủ quyết trúng | Δ trúng | Baseline profit | Phủ quyết profit | Δ profit |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2023 | 361 | 15.789% | 16.066% | 0.277% | -627.000K | -543.000K | 84.000K |
| 2024 | 362 | 18.232% | 17.680% | -0.552% | 114.000K | -54.000K | -168.000K |
| 2025 | 361 | 13.573% | 13.019% | -0.554% | -1.299.000K | -1.467.000K | -168.000K |
| 2026 | 187 | 14.973% | 14.973% | 0.000% | -453.000K | -453.000K | 0K |

## Kết luận

- Không đưa vào production: chưa đạt đủ điều kiện lợi nhuận và ổn định trên giai đoạn độc lập.
- Không có kết quả lịch sử nào đảm bảo lợi nhuận tương lai.

