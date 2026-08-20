# Bộ lọc phủ quyết nhóm bảo thủ - strict PIT nhiều năm

Sinh lúc: 2026-07-27T18:38:51.731Z

## Thiết kế kiểm định

- Tín hiệu nhóm không được cộng trực tiếp vào điểm của 100 số.
- Chỉ các quantile có cận trên Wilson của tỷ trọng hit thấp hơn tỷ trọng nền mới được phủ quyết.
- Phủ quyết chỉ hoán đổi 1:1 trong thứ hạng Block/Small; số con đánh và vốn mỗi ngày không đổi.
- Cấu hình chọn trên 2016-2019, khóa trước kiểm định 2020-2022 và holdout 2023-2026.
- Không dùng kết quả ngày D để tạo tín hiệu hay chọn số ngày D.

## Cấu hình được khóa

- Base: consensus; đánh 30; tối đa 3 hoán đổi/ngày.
- Quantile: 20; bin phủ quyết: 0, 3, 7, 9, 19.
- Wilson z=0.674; lợi thế loại trừ tối thiểu=0.000%.
- Số cấu hình đã thử ở development: 60 (4 profile phủ quyết khác nhau).

## Development 2016-2019

- Dàn cố định: 30 số; hòa vốn: 35.714%.
- Baseline: 30.381%, -6.474.000K, chuỗi thua dài nhất 19.
- Có phủ quyết: 30.588%, -6.222.000K, chuỗi thua dài nhất 19.
- Chênh lệch: 0.208%, 252.000K; đổi 3869 lượt số trên 1305 ngày.

| Năm | Ngày | Baseline trúng | Phủ quyết trúng | Δ trúng | Baseline profit | Phủ quyết profit | Δ profit |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2016 | 362 | 32.597% | 31.492% | -1.105% | -948.000K | -1.284.000K | -336.000K |
| 2017 | 361 | 31.579% | 32.410% | 0.831% | -1.254.000K | -1.002.000K | 252.000K |
| 2018 | 361 | 29.086% | 28.255% | -0.831% | -2.010.000K | -2.262.000K | -252.000K |
| 2019 | 361 | 28.255% | 30.194% | 1.939% | -2.262.000K | -1.674.000K | 588.000K |

## Validation 2020-2022

- Dàn cố định: 30 số; hòa vốn: 35.714%.
- Baseline: 29.096%, -5.904.000K, chuỗi thua dài nhất 25.
- Có phủ quyết: 30.038%, -5.064.000K, chuỗi thua dài nhất 25.
- Chênh lệch: 0.942%, 840.000K; đổi 2727 lượt số trên 917 ngày.

| Năm | Ngày | Baseline trúng | Phủ quyết trúng | Δ trúng | Baseline profit | Phủ quyết profit | Δ profit |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2020 | 340 | 31.765% | 29.118% | -2.647% | -1.128.000K | -1.884.000K | -756.000K |
| 2021 | 361 | 27.147% | 29.640% | 2.493% | -2.598.000K | -1.842.000K | 756.000K |
| 2022 | 361 | 28.532% | 31.302% | 2.770% | -2.178.000K | -1.338.000K | 840.000K |

## Cổng validation

- Kết quả: **KHÔNG ĐẠT**.
- Chi tiết: `{"totalProfitPositive":false,"atLeastTwoProfitableYears":false,"improvesAtLeastTwoYears":true,"longestLossIncreaseWithin20Percent":true}`.

## Holdout 2023-2026

- Dàn cố định: 30 số; hòa vốn: 35.714%.
- Baseline: 29.740%, -6.378.000K, chuỗi thua dài nhất 18.
- Có phủ quyết: 29.976%, -6.126.000K, chuỗi thua dài nhất 18.
- Chênh lệch: 0.236%, 252.000K; đổi 3228 lượt số trên 1093 ngày.

| Năm | Ngày | Baseline trúng | Phủ quyết trúng | Δ trúng | Baseline profit | Phủ quyết profit | Δ profit |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2023 | 361 | 27.978% | 28.809% | 0.831% | -2.346.000K | -2.094.000K | 252.000K |
| 2024 | 362 | 31.215% | 32.320% | 1.105% | -1.368.000K | -1.032.000K | 336.000K |
| 2025 | 361 | 29.086% | 27.701% | -1.385% | -2.010.000K | -2.430.000K | -420.000K |
| 2026 | 187 | 31.551% | 32.086% | 0.535% | -654.000K | -570.000K | 84.000K |

## Kết luận

- Không đưa vào production: chưa đạt đủ điều kiện lợi nhuận và ổn định trên giai đoạn độc lập.
- Không có kết quả lịch sử nào đảm bảo lợi nhuận tương lai.

