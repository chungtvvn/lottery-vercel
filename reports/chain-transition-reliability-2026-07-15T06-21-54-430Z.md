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
