# Thống kê chuỗi đạt và phá siêu kỷ lục theo ngày

- Raw R2: 2005-10-01 -> 2026-07-16 (7.493 ngày).
- Khoảng đánh giá: 2006-10-03 -> 2026-07-16 (7.128 ngày).
- Warm-up: 365 kỳ quay; sự kiện warm-up vẫn dùng để dựng kỷ lục nhưng không vào mẫu trung bình.
- Đơn vị chuỗi: key thống kê hợp lệ của hệ thống (52.317/61.656 key có streak).

## Tổng hợp

| Chỉ số | Tổng sự kiện | TB/ngày | Trung vị | P95 | Cao nhất/ngày | Ngày có ≥1 | Tỷ lệ ngày |
|---|---:|---:|---:|---:|---:|---:|---:|
| Đạt/chạm mốc hiện hành (gồm cả ngày phá) | 668.952 | 93,848 | 79,0 | 208,0 | 400 | 7.105 | 99.68% |
| Chạm lại đúng kỷ lục cũ | 600.382 | 84,229 | 72,0 | 184,0 | 374 | 7.105 | 99.68% |
| Phá kỷ lục cũ, lập siêu kỷ lục mới | 68.570 | 9,620 | 7,0 | 28,0 | 296 | 6.553 | 91.93% |
| Khởi tạo kỷ lục lần đầu | 16.217 | 2,275 | 0,0 | 8,0 | 90 | 2.184 | 30.64% |

## Theo năm

| Năm | Ngày | Đạt mốc/ngày | Phá KL/ngày | Ngày có phá KL | Tỷ lệ ngày phá KL |
|---:|---:|---:|---:|---:|---:|
| 2006 | 90 | 242,089 | 33,389 | 90 | 100.00% |
| 2007 | 363 | 215,477 | 27,008 | 361 | 99.45% |
| 2008 | 364 | 176,308 | 20,896 | 362 | 99.45% |
| 2009 | 362 | 147,981 | 18,008 | 356 | 98.34% |
| 2010 | 361 | 128,607 | 12,476 | 356 | 98.61% |
| 2011 | 359 | 115,741 | 12,039 | 352 | 98.05% |
| 2012 | 362 | 105,704 | 12,014 | 352 | 97.24% |
| 2013 | 361 | 92,521 | 8,233 | 349 | 96.68% |
| 2014 | 361 | 85,399 | 8,019 | 342 | 94.74% |
| 2015 | 361 | 81,402 | 6,521 | 333 | 92.24% |
| 2016 | 362 | 76,572 | 7,174 | 340 | 93.92% |
| 2017 | 361 | 71,734 | 6,216 | 322 | 89.20% |
| 2018 | 361 | 67,909 | 6,158 | 331 | 91.69% |
| 2019 | 361 | 68,645 | 6,440 | 332 | 91.97% |
| 2020 | 340 | 61,262 | 5,679 | 306 | 90.00% |
| 2021 | 361 | 60,975 | 5,335 | 319 | 88.37% |
| 2022 | 361 | 54,884 | 4,814 | 322 | 89.20% |
| 2023 | 361 | 54,454 | 4,199 | 299 | 82.83% |
| 2024 | 362 | 52,588 | 4,492 | 302 | 83.43% |
| 2025 | 361 | 49,961 | 4,202 | 292 | 80.89% |
| 2026 | 193 | 46,876 | 3,093 | 135 | 69.95% |

## Theo nhóm thống kê

| Nhóm | Đạt mốc/ngày | Phá KL/ngày | Tổng phá KL |
|---|---:|---:|---:|
| head_tail | 16,698 | 2,567 | 18.296 |
| number | 1,071 | 0,078 | 555 |
| sum_difference | 76,080 | 6,975 | 49.719 |

## Xác suất có điều kiện

- Khởi tạo trên mỗi key chưa hình thành/ngày: 0.02% (Wilson 95%: 0.02%–0.02%; 16.217/86.827.381).
- Phá mốc ở kỳ kế tiếp khi key đang tại kỷ lục: 10.12% (Wilson 95%: 10.05%–10.20%; 67.718/668.952).

## Định nghĩa

- **Đạt mốc:** độ dài active trong ngày bằng kỷ lục đã có, hoặc vừa vượt kỷ lục để trở thành mức tối đa mới.
- **Chạm lại:** độ dài active đúng bằng kỷ lục cũ, không làm thay đổi kỷ lục.
- **Phá kỷ lục:** độ dài active lớn hơn kỷ lục đã biết đến hết ngày trước đó. Nếu cùng run tiếp tục tăng ở ngày sau, ngày đó là một lần phá mới nữa.
- **Khởi tạo:** lần đầu key hình thành trong lịch sử; chưa có mốc cũ nên không tính là phá kỷ lục.
- Đây là thống kê theo key pattern. Các key tương quan hoặc có cùng tập số vẫn được tính riêng như trong hệ thống hiện tại.
