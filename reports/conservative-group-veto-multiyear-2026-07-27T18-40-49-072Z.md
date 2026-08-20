# Bộ lọc phủ quyết nhóm bảo thủ - strict PIT nhiều năm

Sinh lúc: 2026-07-27T18:40:49.070Z

## Thiết kế kiểm định

- Tín hiệu nhóm không được cộng trực tiếp vào điểm của 100 số.
- Chỉ các quantile có cận trên Wilson của tỷ trọng hit thấp hơn tỷ trọng nền mới được phủ quyết.
- Phủ quyết chỉ hoán đổi 1:1 trong thứ hạng Block/Small; số con đánh và vốn mỗi ngày không đổi.
- Cấu hình chọn trên 2016-2019, khóa trước kiểm định 2020-2022 và holdout 2023-2026.
- Không dùng kết quả ngày D để tạo tín hiệu hay chọn số ngày D.

## Cấu hình được khóa

- Base: blockSmallFiveWay; đánh 30; tối đa 2 hoán đổi/ngày.
- Quantile: 20; bin phủ quyết: 7, 9.
- Wilson z=0.674; lợi thế loại trừ tối thiểu=0.500%.
- Số cấu hình đã thử ở development: 160 (4 profile phủ quyết khác nhau).

## Development 2016-2019

- Dàn cố định: 30 số; hòa vốn: 35.714%.
- Baseline: 30.173%, -6.726.000K, chuỗi thua dài nhất 27.
- Có phủ quyết: 30.450%, -6.390.000K, chuỗi thua dài nhất 23.
- Chênh lệch: 0.277%, 336.000K; đổi 1034 lượt số trên 769 ngày.

| Năm | Ngày | Baseline trúng | Phủ quyết trúng | Δ trúng | Baseline profit | Phủ quyết profit | Δ profit |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2016 | 362 | 32.320% | 32.320% | 0.000% | -1.032.000K | -1.032.000K | 0K |
| 2017 | 361 | 34.072% | 36.288% | 2.216% | -498.000K | 174.000K | 672.000K |
| 2018 | 361 | 26.870% | 25.762% | -1.108% | -2.682.000K | -3.018.000K | -336.000K |
| 2019 | 361 | 27.424% | 27.424% | 0.000% | -2.514.000K | -2.514.000K | 0K |

## Validation 2020-2022

- Dàn cố định: 30 số; hòa vốn: 35.714%.
- Baseline: 29.473%, -5.568.000K, chuỗi thua dài nhất 14.
- Có phủ quyết: 29.284%, -5.736.000K, chuỗi thua dài nhất 18.
- Chênh lệch: -0.188%, -168.000K; đổi 700 lượt số trên 544 ngày.

| Năm | Ngày | Baseline trúng | Phủ quyết trúng | Δ trúng | Baseline profit | Phủ quyết profit | Δ profit |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2020 | 340 | 31.471% | 31.176% | -0.294% | -1.212.000K | -1.296.000K | -84.000K |
| 2021 | 361 | 29.917% | 30.194% | 0.277% | -1.758.000K | -1.674.000K | 84.000K |
| 2022 | 361 | 27.147% | 26.593% | -0.554% | -2.598.000K | -2.766.000K | -168.000K |

## Cổng validation

- Kết quả: **KHÔNG ĐẠT**.
- Chi tiết: `{"totalProfitPositive":false,"atLeastTwoProfitableYears":false,"improvesAtLeastTwoYears":false,"longestLossIncreaseWithin20Percent":false}`.

## Holdout 2023-2026

- Dàn cố định: 30 số; hòa vốn: 35.714%.
- Baseline: 30.448%, -5.622.000K, chuỗi thua dài nhất 17.
- Có phủ quyết: 30.527%, -5.538.000K, chuỗi thua dài nhất 17.
- Chênh lệch: 0.079%, 84.000K; đổi 853 lượt số trên 643 ngày.

| Năm | Ngày | Baseline trúng | Phủ quyết trúng | Δ trúng | Baseline profit | Phủ quyết profit | Δ profit |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2023 | 361 | 30.471% | 31.025% | 0.554% | -1.590.000K | -1.422.000K | 168.000K |
| 2024 | 362 | 29.282% | 30.387% | 1.105% | -1.956.000K | -1.620.000K | 336.000K |
| 2025 | 361 | 29.086% | 27.701% | -1.385% | -2.010.000K | -2.430.000K | -420.000K |
| 2026 | 187 | 35.294% | 35.294% | 0.000% | -66.000K | -66.000K | 0K |

## Kết luận

- Không đưa vào production: chưa đạt đủ điều kiện lợi nhuận và ổn định trên giai đoạn độc lập.
- Không có kết quả lịch sử nào đảm bảo lợi nhuận tương lai.

