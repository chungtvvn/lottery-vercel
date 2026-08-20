# Độ tin cậy chuyển trạng thái chuỗi

- Ngày strict PIT: 94
- Quan sát candidate sau khử trùng: 56356
- Edge thực tế = tỷ lệ loại đúng thực tế trừ xác suất loại nền theo độ rộng tập số.
- Mỗi nhóm lấy trung bình theo ngày trước khi gộp, tránh ngày có nhiều candidate chi phối.
- Rủi ro lịch sử của chuỗi tiềm năng để trống nếu chưa có bảng cơ hội hình thành từ daily replay.
- `never-pattern` nghĩa là toàn bộ pattern chưa có kỷ lục; `unseen-target` nghĩa là target cụ thể chưa đạt nhưng pattern đã từng tồn tại.
- Chỉ gắn ưu tiên cao khi cận dưới CI 95% của Edge > 0 và Edge dương ở mọi năm kiểm tra.

## Theo trạng thái

| Nhóm | Ngày | Quan sát | Mẫu vị giữa | Rủi ro LS | Loại đúng TT | Nền | Edge TT | CI 95% Edge | Ổn định năm | Đánh giá |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| active | 93 | 18097 | 131 | 82.9% | 80.6% | 81.3% | -0.7% | -2.0% → 0.6% | 1/3 | không ưu tiên |
| potential | 94 | 38259 | - | - | 78.8% | 79.9% | -1.1% | -4.0% → 1.8% | 1/3 | không ưu tiên |

## Theo mốc kỷ lục

| Nhóm | Ngày | Quan sát | Mẫu vị giữa | Rủi ro LS | Loại đúng TT | Nền | Edge TT | CI 95% Edge | Ổn định năm | Đánh giá |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| active|never-pattern | 27 | 65 | 0 | - | 34.4% | 22.5% | 11.8% | -5.8% → 29.5% | 3/3 | không ưu tiên |
| active|super-record | 39 | 79 | 0 | - | 83.1% | 80.9% | 2.2% | -7.6% → 12.0% | 2/3 | ưu tiên có điều kiện |
| active|at-record | 93 | 1563 | 14 | 100.0% | 82.4% | 81.2% | 1.3% | -0.8% → 3.3% | 2/3 | ưu tiên có điều kiện |
| active|near-record | 93 | 2675 | 106 | 93.3% | 91.4% | 90.9% | 0.5% | -0.7% → 1.7% | 2/3 | ưu tiên có điều kiện |
| potential|at-record | 94 | 5314 | - | - | 96.7% | 96.6% | 0.1% | -0.6% → 0.8% | 2/3 | ưu tiên có điều kiện |
| potential|near-record | 94 | 2293 | - | - | 92.7% | 93.0% | -0.3% | -2.2% → 1.6% | 2/3 | không ưu tiên |
| potential|below-record | 94 | 24565 | - | - | 72.8% | 73.6% | -0.8% | -4.0% → 2.4% | 1/3 | không ưu tiên |
| active|below-record | 93 | 13715 | 174 | 78.9% | 78.7% | 79.9% | -1.2% | -3.0% → 0.6% | 1/3 | không ưu tiên |
| potential|never-pattern | 94 | 6087 | - | - | 84.1% | 87.2% | -3.1% | -8.1% → 1.9% | 1/3 | không ưu tiên |

## Theo Tier

| Nhóm | Ngày | Quan sát | Mẫu vị giữa | Rủi ro LS | Loại đúng TT | Nền | Edge TT | CI 95% Edge | Ổn định năm | Đánh giá |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| active|Tier 3 | 93 | 686 | 13 | 84.7% | 82.0% | 77.0% | 5.0% | 1.6% → 8.4% | 3/3 | ưu tiên cao |
| active|Tier 1 | 93 | 1707 | 12.5 | 100.0% | 81.5% | 79.9% | 1.6% | -0.6% → 3.7% | 3/3 | ưu tiên có điều kiện |
| potential|Tier 4 | 94 | 16837 | - | - | 71.6% | 71.2% | 0.4% | -1.9% → 2.7% | 2/3 | ưu tiên có điều kiện |
| potential|Tier 1 | 94 | 5314 | - | - | 96.7% | 96.6% | 0.1% | -0.6% → 0.8% | 2/3 | ưu tiên có điều kiện |
| active|Tier 2 | 83 | 200 | 5 | 72.3% | 82.7% | 83.2% | -0.5% | -6.2% → 5.1% | 1/3 | không ưu tiên |
| active|Tier 4 | 93 | 15504 | 175 | 81.3% | 80.6% | 81.8% | -1.2% | -2.9% → 0.4% | 0/3 | không ưu tiên |
| potential|Tier 3 | 94 | 16108 | - | - | 80.9% | 83.9% | -3.0% | -7.8% → 1.8% | 1/3 | không ưu tiên |

## Theo độ dài

| Nhóm | Ngày | Quan sát | Mẫu vị giữa | Rủi ro LS | Loại đúng TT | Nền | Edge TT | CI 95% Edge | Ổn định năm | Đánh giá |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| active|dài 4 | 91 | 670 | 87.5 | 62.1% | 64.2% | 62.2% | 1.9% | -3.4% → 7.2% | 2/3 | ưu tiên có điều kiện |
| active|dài 8+ | 74 | 247 | 11.3 | 68.6% | 68.9% | 67.3% | 1.6% | -5.2% → 8.5% | 2/3 | ưu tiên có điều kiện |
| active|dài 3 | 93 | 5987 | 66 | 86.0% | 87.8% | 87.6% | 0.2% | -0.8% → 1.2% | 2/3 | ưu tiên có điều kiện |
| active|dài 5 | 91 | 1256 | 39.5 | 78.8% | 71.5% | 72.1% | -0.5% | -3.0% → 1.9% | 1/3 | không ưu tiên |
| potential|dài 3 | 94 | 1298 | - | - | 97.0% | 97.7% | -0.7% | -1.8% → 0.5% | 1/3 | không ưu tiên |
| active|dài 6-7 | 90 | 583 | 29 | 75.2% | 59.0% | 59.9% | -0.9% | -5.5% → 3.8% | 1/3 | không ưu tiên |
| potential|dài 2 | 94 | 35760 | - | - | 78.3% | 79.5% | -1.1% | -4.3% → 2.0% | 1/3 | không ưu tiên |
| potential|dài 4 | 92 | 1201 | - | - | 68.9% | 70.1% | -1.2% | -6.0% → 3.5% | 1/3 | không ưu tiên |
| active|dài 2 | 93 | 9354 | 202.5 | 83.7% | 80.5% | 82.4% | -1.9% | -4.0% → 0.2% | 0/3 | không ưu tiên |

## Theo cỡ mẫu chuyển trạng thái

| Nhóm | Ngày | Quan sát | Mẫu vị giữa | Rủi ro LS | Loại đúng TT | Nền | Edge TT | CI 95% Edge | Ổn định năm | Đánh giá |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| active|mẫu 0 | 51 | 144 | 0 | - | 64.0% | 58.7% | 5.4% | -3.8% → 14.5% | 2/3 | ưu tiên có điều kiện |
| active|mẫu 6-10 | 92 | 532 | 8 | 89.2% | 74.2% | 71.6% | 2.6% | -1.6% → 6.8% | 2/3 | ưu tiên có điều kiện |
| active|mẫu 11-30 | 93 | 1561 | 18.5 | 89.7% | 84.3% | 82.5% | 1.8% | -0.4% → 4.0% | 3/3 | ưu tiên có điều kiện |
| active|mẫu 1-2 | 79 | 225 | 1.5 | 93.9% | 68.6% | 67.4% | 1.2% | -5.1% → 7.5% | 2/3 | ưu tiên có điều kiện |
| active|mẫu 3-5 | 83 | 312 | 4 | 91.4% | 74.0% | 73.1% | 0.9% | -4.8% → 6.5% | 2/3 | ưu tiên có điều kiện |
| potential|mẫu 11-30 | 94 | 13003 | - | - | 79.0% | 78.4% | 0.6% | -1.3% → 2.4% | 2/3 | ưu tiên có điều kiện |
| potential|mẫu 6-10 | 94 | 5980 | - | - | 75.8% | 76.0% | -0.2% | -3.0% → 2.6% | 1/3 | không ưu tiên |
| potential|mẫu 31+ | 94 | 2277 | - | - | 64.6% | 64.9% | -0.4% | -3.2% → 2.4% | 1/3 | không ưu tiên |
| active|mẫu 31+ | 93 | 15323 | 177.5 | 81.6% | 80.8% | 82.0% | -1.3% | -2.9% → 0.4% | 0/3 | không ưu tiên |
| potential|mẫu 3-5 | 94 | 4255 | - | - | 81.0% | 82.5% | -1.5% | -5.6% → 2.7% | 1/3 | không ưu tiên |
| potential|mẫu 0 | 94 | 6087 | - | - | 84.1% | 87.2% | -3.1% | -8.1% → 1.9% | 1/3 | không ưu tiên |
| potential|mẫu 1-2 | 94 | 6657 | - | - | 80.0% | 83.3% | -3.3% | -8.1% → 1.6% | 1/3 | không ưu tiên |

## Theo tần suất năm

| Nhóm | Ngày | Quan sát | Mẫu vị giữa | Rủi ro LS | Loại đúng TT | Nền | Edge TT | CI 95% Edge | Ổn định năm | Đánh giá |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| active|0/năm | 51 | 144 | 0 | - | 64.0% | 58.7% | 5.4% | -3.8% → 14.5% | 2/3 | ưu tiên có điều kiện |
| active|<0,1/năm | 57 | 110 | 1 | 100.0% | 69.2% | 64.3% | 5.0% | -3.8% → 13.8% | 2/3 | ưu tiên có điều kiện |
| active|0,5-<1/năm | 91 | 887 | 12 | 89.1% | 76.8% | 73.6% | 3.3% | -0.1% → 6.7% | 3/3 | ưu tiên có điều kiện |
| potential|<0,1/năm | 79 | 158 | - | - | 96.9% | 95.7% | 1.2% | -1.7% → 4.0% | 2/3 | ưu tiên có điều kiện |
| active|0,1-<0,5/năm | 93 | 726 | 5 | 91.6% | 73.7% | 72.9% | 0.8% | -2.4% → 4.0% | 2/3 | ưu tiên có điều kiện |
| potential|>=1/năm | 94 | 19375 | - | - | 73.7% | 73.6% | 0.1% | -2.1% → 2.4% | 1/3 | không ưu tiên |
| active|>=1/năm | 93 | 16230 | 166 | 82.0% | 81.3% | 82.3% | -1.1% | -2.6% → 0.4% | 0/3 | không ưu tiên |
| potential|0,5-<1/năm | 94 | 5074 | - | - | 84.2% | 85.9% | -1.7% | -5.5% → 2.1% | 1/3 | không ưu tiên |
| potential|0,1-<0,5/năm | 94 | 7565 | - | - | 83.7% | 86.5% | -2.7% | -6.5% → 1.0% | 1/3 | không ưu tiên |
| potential|0/năm | 94 | 6087 | - | - | 84.1% | 87.2% | -3.1% | -8.1% → 1.9% | 1/3 | không ưu tiên |

## Theo dạng chuỗi

| Nhóm | Ngày | Quan sát | Mẫu vị giữa | Rủi ro LS | Loại đúng TT | Nền | Edge TT | CI 95% Edge | Ổn định năm | Đánh giá |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| active|orderedAlternationUp | 4 | 6 | 391.3 | 91.2% | 100.0% | 92.3% | 7.8% | 6.1% → 9.4% | 2/2 | không ưu tiên |
| active|up | 90 | 885 | 201 | 92.6% | 92.9% | 89.2% | 3.7% | 1.7% → 5.7% | 3/3 | ưu tiên cao |
| active|blockAlternation | 87 | 684 | 8 | 94.5% | 34.5% | 31.5% | 3.0% | -3.8% → 9.8% | 2/3 | ưu tiên có điều kiện |
| potential|consecutive | 93 | 315 | - | - | 97.8% | 95.6% | 2.2% | -0.2% → 4.6% | 3/3 | ưu tiên có điều kiện |
| active|upDownAlternation | 56 | 112 | 339 | 49.1% | 54.0% | 52.2% | 1.8% | -7.8% → 11.3% | 1/3 | không ưu tiên |
| active|uniformUp | 93 | 1524 | 149 | 91.8% | 92.9% | 91.5% | 1.4% | 0.1% → 2.7% | 3/3 | ưu tiên cao |
| potential|pairAlternation | 85 | 419 | - | - | 59.0% | 58.0% | 1.0% | -5.5% → 7.5% | 2/3 | ưu tiên có điều kiện |
| potential|uniformUp | 94 | 489 | - | - | 97.8% | 97.2% | 0.7% | -0.5% → 1.8% | 2/3 | ưu tiên có điều kiện |
| active|other | 92 | 629 | 88 | 90.2% | 89.0% | 88.4% | 0.6% | -2.5% → 3.7% | 2/3 | ưu tiên có điều kiện |
| potential|uniformDown | 94 | 1230 | - | - | 98.6% | 98.0% | 0.6% | 0.0% → 1.2% | 2/3 | ưu tiên có điều kiện |
| potential|other | 94 | 1805 | - | - | 96.3% | 96.0% | 0.3% | -1.8% → 2.3% | 3/3 | ưu tiên có điều kiện |
| active|orderedAlternation | 91 | 4329 | 59 | 91.8% | 91.9% | 91.7% | 0.2% | -0.4% → 0.8% | 1/3 | không ưu tiên |
| potential|up | 94 | 1302 | - | - | 95.9% | 96.2% | -0.3% | -2.0% → 1.5% | 2/3 | không ưu tiên |
| potential|orderedAlternation | 94 | 924 | - | - | 98.6% | 99.0% | -0.4% | -1.3% → 0.4% | 1/3 | không ưu tiên |
| potential|down | 94 | 1120 | - | - | 95.5% | 96.0% | -0.5% | -2.4% → 1.3% | 1/3 | không ưu tiên |
| potential|downUpAlternation | 31 | 414 | - | - | 81.8% | 82.3% | -0.6% | -6.6% → 5.5% | 1/3 | không ưu tiên |
| potential|alternation | 93 | 196 | - | - | 96.1% | 96.6% | -0.6% | -3.9% → 2.8% | 1/3 | không ưu tiên |
| active|uniformDown | 92 | 1361 | 151.5 | 91.8% | 91.2% | 91.8% | -0.7% | -2.0% → 0.6% | 1/3 | không ưu tiên |
| potential|blockAlternation | 94 | 29499 | - | - | 75.1% | 76.3% | -1.2% | -4.8% → 2.4% | 1/3 | không ưu tiên |
| active|down | 83 | 827 | 197.5 | 91.5% | 86.4% | 87.7% | -1.3% | -5.4% → 2.9% | 1/3 | không ưu tiên |
| active|pairAlternation | 76 | 290 | 246 | 53.6% | 49.9% | 51.3% | -1.3% | -10.2% → 7.5% | 1/3 | không ưu tiên |
| potential|orderedAlternationDown | 89 | 151 | - | - | 89.1% | 90.5% | -1.4% | -6.6% → 3.9% | 1/3 | không ưu tiên |
| potential|orderedAlternationUp | 27 | 27 | - | - | 96.3% | 99.0% | -2.7% | -10.0% → 4.6% | 2/3 | không ưu tiên |
| active|alternation | 92 | 1134 | 212 | 66.2% | 87.4% | 90.2% | -2.8% | -6.3% → 0.6% | 0/3 | không ưu tiên |
| active|consecutive | 93 | 6173 | 341 | 72.6% | 69.2% | 72.2% | -3.0% | -7.4% → 1.5% | 1/3 | không ưu tiên |
| active|orderedAlternationDown | 7 | 8 | 291 | 88.9% | 85.7% | 89.2% | -3.5% | -29.1% → 22.1% | 2/3 | không ưu tiên |
| active|downUpAlternation | 60 | 135 | 364.3 | 52.9% | 50.4% | 55.0% | -4.6% | -13.3% → 4.1% | 0/3 | không ưu tiên |
| potential|upDownAlternation | 32 | 368 | - | - | 75.3% | 82.3% | -7.0% | -14.6% → 0.6% | 1/3 | không ưu tiên |

## Theo họ thống kê

| Nhóm | Ngày | Quan sát | Mẫu vị giữa | Rủi ro LS | Loại đúng TT | Nền | Edge TT | CI 95% Edge | Ổn định năm | Đánh giá |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| active|head-tail | 56 | 109 | 243.3 | 74.7% | 77.7% | 73.5% | 4.2% | -4.9% → 13.3% | 2/3 | ưu tiên có điều kiện |
| active|block | 87 | 684 | 8 | 94.5% | 34.5% | 31.5% | 3.0% | -3.8% → 9.8% | 2/3 | ưu tiên có điều kiện |
| active|head | 93 | 2944 | 186 | 80.1% | 83.5% | 81.6% | 2.0% | -0.1% → 4.0% | 3/3 | ưu tiên có điều kiện |
| potential|number | 94 | 829 | - | - | 97.4% | 96.1% | 1.3% | 0.5% → 2.2% | 2/3 | ưu tiên có điều kiện |
| potential|head-tail | 94 | 1109 | - | - | 97.2% | 97.2% | 0.0% | -1.0% → 1.1% | 2/3 | ưu tiên có điều kiện |
| active|difference | 93 | 2964 | 188 | 79.0% | 79.6% | 79.8% | -0.2% | -2.6% → 2.3% | 2/3 | không ưu tiên |
| potential|tail | 93 | 463 | - | - | 87.5% | 88.0% | -0.5% | -3.8% → 2.9% | 1/3 | không ưu tiên |
| potential|sum | 94 | 4491 | - | - | 92.7% | 93.2% | -0.5% | -1.9% → 0.9% | 1/3 | không ưu tiên |
| potential|difference | 94 | 591 | - | - | 89.4% | 90.0% | -0.5% | -3.3% → 2.2% | 1/3 | không ưu tiên |
| potential|fixed-set | 94 | 471 | - | - | 97.2% | 97.8% | -0.5% | -2.1% → 1.0% | 1/3 | không ưu tiên |
| potential|class | 94 | 329 | - | - | 93.5% | 94.5% | -1.0% | -3.2% → 1.1% | 1/3 | không ưu tiên |
| potential|head | 93 | 477 | - | - | 86.9% | 88.0% | -1.1% | -4.1% → 1.8% | 1/3 | không ưu tiên |
| potential|block | 94 | 29499 | - | - | 75.1% | 76.3% | -1.2% | -4.8% → 2.4% | 1/3 | không ưu tiên |
| active|tail | 93 | 2846 | 181.5 | 80.3% | 80.4% | 81.8% | -1.4% | -4.1% → 1.2% | 0/3 | không ưu tiên |
| active|fixed-set | 12 | 23 | 27.8 | 95.7% | 95.8% | 97.4% | -1.6% | -10.1% → 6.9% | 2/3 | không ưu tiên |
| active|sum | 93 | 8371 | 94 | 85.9% | 84.5% | 86.2% | -1.7% | -4.0% → 0.5% | 0/3 | không ưu tiên |
| active|number | 33 | 60 | 205 | 64.0% | 55.8% | 62.0% | -6.2% | -17.6% → 5.1% | 1/3 | không ưu tiên |
| active|class | 47 | 96 | 176 | 79.3% | 79.1% | 86.4% | -7.3% | -16.5% → 1.9% | 0/3 | không ưu tiên |

## Theo cohort ưu tiên kết hợp

| Nhóm | Ngày | Quan sát | Mẫu vị giữa | Rủi ro LS | Loại đúng TT | Nền | Edge TT | CI 95% Edge | Ổn định năm | Đánh giá |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| active|at-record|Tier 1|dài 5|>=1/năm|blockAlternation | 1 | 1 | 21 | 100.0% | 100.0% | 30.0% | 70.0% | - → - | 1/1 | không ưu tiên |
| active|below-record|Tier 2|dài 8+|0,1-<0,5/năm|blockAlternation | 2 | 2 | 3 | 66.7% | 100.0% | 50.0% | 50.0% | 50.0% → 50.0% | 1/1 | không ưu tiên |
| active|below-record|Tier 3|dài 8+|>=1/năm|blockAlternation | 1 | 1 | 14 | 85.7% | 100.0% | 50.0% | 50.0% | - → - | 1/1 | không ưu tiên |
| active|below-record|Tier 4|dài 8+|>=1/năm|consecutive | 1 | 1 | 14 | 35.7% | 100.0% | 50.0% | 50.0% | - → - | 1/1 | không ưu tiên |
| active|at-record|Tier 1|dài 8+|<0,1/năm|pairAlternation | 1 | 2 | 1 | 100.0% | 100.0% | 50.0% | 50.0% | - → - | 1/1 | không ưu tiên |
| active|near-record|Tier 3|dài 6-7|0,5-<1/năm|consecutive | 1 | 1 | 11 | 81.8% | 100.0% | 62.0% | 38.0% | - → - | 1/1 | không ưu tiên |
| active|super-record|Tier 1|dài 8+|0/năm|pairAlternation | 1 | 2 | 0 | - | 100.0% | 66.0% | 34.0% | - → - | 1/1 | không ưu tiên |
| active|super-record|Tier 1|dài 8+|0/năm|consecutive | 5 | 7 | 0 | - | 100.0% | 66.5% | 33.5% | 28.2% → 38.8% | 2/2 | không ưu tiên |
| active|near-record|Tier 4|dài 5|>=1/năm|consecutive | 2 | 2 | 23 | 77.6% | 100.0% | 67.0% | 33.0% | 27.1% → 38.9% | 1/1 | không ưu tiên |
| active|never-pattern|Tier 1|dài 6-7|0/năm|blockAlternation | 10 | 12 | 0 | - | 50.0% | 17.2% | 32.8% | 0.6% → 64.9% | 3/3 | không ưu tiên |
| active|at-record|Tier 1|dài 6-7|<0,1/năm|consecutive | 1 | 1 | 1 | 100.0% | 100.0% | 68.0% | 32.0% | - → - | 1/1 | không ưu tiên |
| active|near-record|Tier 2|dài 6-7|0,1-<0,5/năm|consecutive | 7 | 9 | 4 | 58.0% | 100.0% | 70.0% | 30.0% | 30.0% → 30.0% | 2/2 | không ưu tiên |
| active|below-record|Tier 3|dài 5|0,5-<1/năm|upDownAlternation | 1 | 1 | 9 | 44.4% | 100.0% | 70.0% | 30.0% | - → - | 1/1 | không ưu tiên |
| active|near-record|Tier 4|dài 4|>=1/năm|downUpAlternation | 1 | 1 | 25 | 88.0% | 100.0% | 70.0% | 30.0% | - → - | 1/1 | không ưu tiên |
| potential|near-record|Tier 4|dài 4|>=1/năm|upDownAlternation | 1 | 1 | - | - | 100.0% | 72.0% | 28.0% | - → - | 1/1 | không ưu tiên |
| active|near-record|Tier 3|dài 4|>=1/năm|downUpAlternation | 1 | 1 | 20 | 95.0% | 100.0% | 74.0% | 26.0% | - → - | 1/1 | không ưu tiên |
| active|near-record|Tier 3|dài 5|0,5-<1/năm|pairAlternation | 1 | 1 | 8 | 50.0% | 100.0% | 75.0% | 25.0% | - → - | 1/1 | không ưu tiên |
| active|at-record|Tier 1|dài 5|0,1-<0,5/năm|consecutive | 7 | 8 | 5 | 100.0% | 100.0% | 75.4% | 24.6% | 21.2% → 27.9% | 3/3 | không ưu tiên |
| active|below-record|Tier 3|dài 6-7|0,5-<1/năm|blockAlternation | 22 | 33 | 9 | 87.6% | 54.5% | 30.5% | 24.0% | 3.8% → 44.2% | 2/3 | không ưu tiên |
| active|near-record|Tier 3|dài 4|0,5-<1/năm|pairAlternation | 1 | 1 | 15 | 86.7% | 100.0% | 76.0% | 24.0% | - → - | 1/1 | không ưu tiên |
| active|below-record|Tier 2|dài 5|0,1-<0,5/năm|upDownAlternation | 1 | 1 | 6 | 66.7% | 100.0% | 76.0% | 24.0% | - → - | 1/1 | không ưu tiên |
| active|below-record|Tier 3|dài 4|0,5-<1/năm|downUpAlternation | 1 | 1 | 15 | 86.7% | 100.0% | 76.0% | 24.0% | - → - | 1/1 | không ưu tiên |
| active|near-record|Tier 4|dài 4|>=1/năm|down | 5 | 5 | 123 | 86.1% | 100.0% | 76.8% | 23.2% | 9.5% → 36.9% | 2/2 | không ưu tiên |
| active|below-record|Tier 3|dài 4|>=1/năm|consecutive | 1 | 1 | 16 | 81.3% | 100.0% | 77.0% | 23.0% | - → - | 1/1 | không ưu tiên |
| active|at-record|Tier 1|dài 4|0,5-<1/năm|consecutive | 2 | 2 | 11 | 100.0% | 100.0% | 78.5% | 21.5% | 18.6% → 24.4% | 2/2 | không ưu tiên |
| active|at-record|Tier 1|dài 5|0,1-<0,5/năm|upDownAlternation | 2 | 2 | 2 | 100.0% | 100.0% | 79.0% | 21.0% | 19.0% → 23.0% | 1/1 | không ưu tiên |
| active|below-record|Tier 2|dài 4|0,1-<0,5/năm|upDownAlternation | 2 | 2 | 4 | 63.3% | 100.0% | 80.0% | 20.0% | 20.0% → 20.0% | 1/1 | không ưu tiên |
| active|near-record|Tier 3|dài 5|0,5-<1/năm|upDownAlternation | 1 | 1 | 13 | 76.9% | 100.0% | 80.0% | 20.0% | - → - | 1/1 | không ưu tiên |
| active|near-record|Tier 2|dài 4|0,1-<0,5/năm|upDownAlternation | 4 | 4 | 4.5 | 71.9% | 100.0% | 81.0% | 19.0% | 12.5% → 25.5% | 2/2 | không ưu tiên |
| active|near-record|Tier 4|dài 4|>=1/năm|consecutive | 9 | 10 | 30 | 77.8% | 88.9% | 70.6% | 18.3% | -3.3% → 40.0% | 2/3 | không ưu tiên |
| active|below-record|Tier 2|dài 5|0,1-<0,5/năm|blockAlternation | 5 | 6 | 4 | 72.2% | 40.0% | 21.7% | 18.3% | -29.3% → 65.8% | 2/2 | không ưu tiên |
| active|at-record|Tier 1|dài 5|<0,1/năm|upDownAlternation | 2 | 2 | 1 | 100.0% | 100.0% | 82.0% | 18.0% | 14.1% → 21.9% | 2/2 | không ưu tiên |
| potential|at-record|Tier 1|dài 4|0,5-<1/năm|downUpAlternation | 2 | 3 | - | - | 100.0% | 82.0% | 18.0% | 10.2% → 25.8% | 1/1 | không ưu tiên |
| active|below-record|Tier 3|dài 4|0,5-<1/năm|uniformDown | 1 | 1 | 8 | 62.5% | 100.0% | 82.0% | 18.0% | - → - | 1/1 | không ưu tiên |
| active|at-record|Tier 1|dài 3|>=1/năm|down | 1 | 1 | 54 | 100.0% | 100.0% | 82.0% | 18.0% | - → - | 1/1 | không ưu tiên |
| active|near-record|Tier 2|dài 5|0,1-<0,5/năm|upDownAlternation | 1 | 3 | 2 | 60.0% | 100.0% | 82.0% | 18.0% | - → - | 1/1 | không ưu tiên |
| active|at-record|Tier 1|dài 4|0,1-<0,5/năm|consecutive | 3 | 10 | 3.5 | 100.0% | 100.0% | 82.7% | 17.3% | 16.7% → 18.0% | 2/2 | không ưu tiên |
| active|at-record|Tier 1|dài 3|>=1/năm|consecutive | 1 | 1 | 25 | 100.0% | 100.0% | 83.0% | 17.0% | - → - | 1/1 | không ưu tiên |
| active|below-record|Tier 4|dài 8+|>=1/năm|pairAlternation | 6 | 8 | 18 | 47.4% | 66.7% | 50.2% | 16.5% | -20.4% → 53.4% | 2/2 | không ưu tiên |
| active|below-record|Tier 2|dài 4|0,1-<0,5/năm|downUpAlternation | 4 | 4 | 5 | 75.6% | 100.0% | 83.5% | 16.5% | 11.9% → 21.1% | 2/2 | không ưu tiên |
| active|near-record|Tier 3|dài 3|0,5-<1/năm|other | 4 | 7 | 10 | 77.8% | 100.0% | 83.8% | 16.3% | 8.3% → 24.2% | 2/2 | không ưu tiên |
| active|below-record|Tier 4|dài 4|>=1/năm|up | 4 | 4 | 135.5 | 87.3% | 100.0% | 84.0% | 16.0% | -1.4% → 33.4% | 2/2 | không ưu tiên |
| active|near-record|Tier 3|dài 3|>=1/năm|consecutive | 3 | 5 | 17.5 | 79.5% | 100.0% | 84.0% | 16.0% | 14.9% → 17.1% | 2/2 | không ưu tiên |
| active|below-record|Tier 3|dài 3|>=1/năm|other | 2 | 2 | 17.5 | 84.9% | 100.0% | 84.0% | 16.0% | 12.1% → 19.9% | 1/1 | không ưu tiên |
| active|at-record|Tier 1|dài 6-7|<0,1/năm|downUpAlternation | 1 | 1 | 1 | 100.0% | 100.0% | 84.0% | 16.0% | - → - | 1/1 | không ưu tiên |
| active|at-record|Tier 1|dài 6-7|<0,1/năm|upDownAlternation | 1 | 1 | 1 | 100.0% | 100.0% | 84.0% | 16.0% | - → - | 1/1 | không ưu tiên |
| active|below-record|Tier 2|dài 3|0,1-<0,5/năm|uniformDown | 1 | 1 | 5 | 80.0% | 100.0% | 84.0% | 16.0% | - → - | 1/1 | không ưu tiên |
| active|at-record|Tier 1|dài 5|0,1-<0,5/năm|pairAlternation | 1 | 1 | 3 | 100.0% | 100.0% | 84.0% | 16.0% | - → - | 1/1 | không ưu tiên |
| active|at-record|Tier 1|dài 5|<0,1/năm|consecutive | 1 | 1 | 1 | 100.0% | 100.0% | 84.0% | 16.0% | - → - | 1/1 | không ưu tiên |
| active|below-record|Tier 3|dài 3|>=1/năm|consecutive | 2 | 2 | 17.5 | 82.8% | 100.0% | 84.5% | 15.5% | 14.5% → 16.5% | 1/1 | không ưu tiên |
