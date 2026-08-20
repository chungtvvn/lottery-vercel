# Độ tin cậy chuyển trạng thái chuỗi

- Ngày strict PIT: 265
- Quan sát candidate sau khử trùng: 159445
- Edge thực tế = tỷ lệ loại đúng thực tế trừ xác suất loại nền theo độ rộng tập số.
- Mỗi nhóm lấy trung bình theo ngày trước khi gộp, tránh ngày có nhiều candidate chi phối.
- Rủi ro lịch sử của chuỗi tiềm năng để trống nếu chưa có bảng cơ hội hình thành từ daily replay.
- `never-pattern` nghĩa là toàn bộ pattern chưa có kỷ lục; `unseen-target` nghĩa là target cụ thể chưa đạt nhưng pattern đã từng tồn tại.
- Chỉ gắn ưu tiên cao khi cận dưới CI 95% của Edge > 0 và Edge dương ở mọi năm kiểm tra.

## Theo trạng thái

| Nhóm | Ngày | Quan sát | Mẫu vị giữa | Rủi ro LS | Loại đúng TT | Nền | Edge TT | CI 95% Edge | Ổn định năm | Đánh giá |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| active | 262 | 52861 | 171.3 | 81.0% | 81.7% | 81.3% | 0.5% | -0.2% → 1.1% | 2/3 | ưu tiên có điều kiện |
| potential | 265 | 106584 | - | - | 79.9% | 79.9% | 0.0% | -1.4% → 1.5% | 1/3 | không ưu tiên |

## Theo mốc kỷ lục

| Nhóm | Ngày | Quan sát | Mẫu vị giữa | Rủi ro LS | Loại đúng TT | Nền | Edge TT | CI 95% Edge | Ổn định năm | Đánh giá |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| active|never-pattern | 73 | 183 | - | - | 32.3% | 26.7% | 5.5% | -4.2% → 15.3% | 3/3 | ưu tiên có điều kiện |
| active|super-record | 120 | 203 | - | - | 84.8% | 80.4% | 4.4% | -0.1% → 8.9% | 3/3 | ưu tiên có điều kiện |
| active|at-record | 262 | 4384 | - | - | 82.3% | 81.8% | 0.5% | -0.7% → 1.6% | 2/3 | ưu tiên có điều kiện |
| active|below-record | 262 | 40559 | 182.5 | 78.6% | 80.2% | 79.7% | 0.5% | -0.4% → 1.4% | 2/3 | ưu tiên có điều kiện |
| active|near-record | 262 | 7532 | 105.5 | 93.3% | 90.9% | 90.8% | 0.1% | -0.7% → 0.8% | 1/3 | không ưu tiên |
| potential|at-record | 265 | 15914 | - | - | 96.7% | 96.7% | 0.0% | -0.4% → 0.5% | 2/3 | ưu tiên có điều kiện |
| potential|never-pattern | 265 | 63144 | - | - | 79.6% | 79.9% | -0.2% | -2.3% → 1.8% | 1/3 | không ưu tiên |
| potential|near-record | 265 | 4682 | - | - | 91.3% | 91.8% | -0.5% | -2.2% → 1.1% | 1/3 | không ưu tiên |
| potential|below-record | 265 | 22844 | - | - | 66.2% | 67.0% | -0.8% | -2.5% → 0.8% | 1/3 | không ưu tiên |

## Theo Tier

| Nhóm | Ngày | Quan sát | Mẫu vị giữa | Rủi ro LS | Loại đúng TT | Nền | Edge TT | CI 95% Edge | Ổn định năm | Đánh giá |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| active|Tier 2 | 222 | 545 | 5 | 71.2% | 85.0% | 83.3% | 1.8% | -1.6% → 5.1% | 2/3 | ưu tiên có điều kiện |
| active|Tier 3 | 260 | 1903 | 13.5 | 83.7% | 77.9% | 76.6% | 1.3% | -0.7% → 3.4% | 2/3 | ưu tiên có điều kiện |
| active|Tier 1 | 262 | 4770 | - | - | 81.2% | 80.4% | 0.8% | -0.4% → 2.0% | 3/3 | ưu tiên có điều kiện |
| active|Tier 4 | 262 | 45643 | 181 | 81.1% | 82.0% | 81.6% | 0.4% | -0.4% → 1.2% | 1/3 | không ưu tiên |
| potential|Tier 1 | 265 | 15914 | - | - | 96.7% | 96.7% | 0.0% | -0.4% → 0.5% | 2/3 | ưu tiên có điều kiện |
| potential|Tier 3 | 265 | 74316 | - | - | 78.6% | 78.8% | -0.2% | -2.2% → 1.7% | 2/3 | không ưu tiên |
| potential|Tier 4 | 265 | 16354 | - | - | 74.4% | 75.1% | -0.6% | -2.4% → 1.1% | 2/3 | không ưu tiên |

## Theo độ dài

| Nhóm | Ngày | Quan sát | Mẫu vị giữa | Rủi ro LS | Loại đúng TT | Nền | Edge TT | CI 95% Edge | Ổn định năm | Đánh giá |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| active|dài 5 | 258 | 3514 | 118.5 | 68.3% | 73.8% | 72.7% | 1.1% | -0.4% → 2.5% | 2/3 | ưu tiên có điều kiện |
| active|dài 3 | 261 | 17356 | 72 | 84.3% | 88.1% | 87.6% | 0.5% | -0.1% → 1.2% | 3/3 | ưu tiên có điều kiện |
| active|dài 2 | 262 | 27760 | 214 | 82.8% | 82.5% | 82.0% | 0.4% | -0.7% → 1.5% | 1/3 | không ưu tiên |
| active|dài 8+ | 217 | 687 | 21.5 | 54.4% | 64.2% | 64.0% | 0.2% | -4.0% → 4.3% | 2/3 | ưu tiên có điều kiện |
| potential|dài 2 | 265 | 99718 | - | - | 79.4% | 79.4% | 0.0% | -1.6% → 1.6% | 1/3 | không ưu tiên |
| potential|dài 3 | 265 | 3528 | - | - | 97.8% | 97.8% | -0.0% | -0.6% → 0.5% | 2/3 | không ưu tiên |
| potential|dài 4 | 257 | 3338 | - | - | 69.7% | 70.4% | -0.8% | -3.7% → 2.1% | 1/3 | không ưu tiên |
| active|dài 4 | 255 | 1878 | 113 | 60.2% | 61.1% | 62.4% | -1.3% | -4.5% → 1.9% | 1/3 | không ưu tiên |
| active|dài 6-7 | 253 | 1666 | 55.5 | 58.8% | 57.5% | 59.6% | -2.2% | -4.8% → 0.5% | 1/3 | không ưu tiên |

## Theo cỡ mẫu chuyển trạng thái

| Nhóm | Ngày | Quan sát | Mẫu vị giữa | Rủi ro LS | Loại đúng TT | Nền | Edge TT | CI 95% Edge | Ổn định năm | Đánh giá |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| active|mẫu 0 | 152 | 386 | - | - | 66.4% | 61.3% | 5.1% | 0.4% → 9.8% | 3/3 | ưu tiên cao |
| active|mẫu 11-30 | 261 | 4384 | 19 | 84.9% | 82.7% | 81.6% | 1.1% | -0.3% → 2.4% | 3/3 | ưu tiên có điều kiện |
| active|mẫu 1-2 | 213 | 644 | 2 | 29.3% | 69.7% | 68.7% | 1.0% | -2.3% → 4.3% | 2/3 | ưu tiên có điều kiện |
| potential|mẫu 3-5 | 74 | 3403 | - | - | 83.5% | 82.5% | 1.0% | -2.9% → 5.0% | 1/2 | không ưu tiên |
| active|mẫu 3-5 | 242 | 819 | 4 | 66.2% | 76.9% | 75.9% | 1.0% | -2.0% → 3.9% | 3/3 | ưu tiên có điều kiện |
| potential|mẫu 11-30 | 74 | 10025 | - | - | 79.4% | 78.5% | 0.9% | -1.2% → 3.0% | 2/2 | ưu tiên có điều kiện |
| active|mẫu 6-10 | 259 | 1519 | 8 | 78.4% | 72.1% | 71.3% | 0.8% | -1.4% → 2.9% | 2/3 | ưu tiên có điều kiện |
| potential|mẫu 6-10 | 74 | 4877 | - | - | 76.4% | 75.7% | 0.7% | -2.3% → 3.6% | 1/2 | không ưu tiên |
| active|mẫu 31+ | 262 | 45109 | 186 | 80.9% | 82.3% | 81.9% | 0.4% | -0.4% → 1.2% | 1/3 | không ưu tiên |
| potential|mẫu 31+ | 74 | 1787 | - | - | 65.2% | 64.9% | 0.3% | -2.7% → 3.3% | 1/2 | không ưu tiên |
| potential|mẫu 0 | 265 | 81225 | - | - | 81.6% | 81.9% | -0.3% | -2.1% → 1.6% | 1/3 | không ưu tiên |
| potential|mẫu 1-2 | 74 | 5267 | - | - | 81.9% | 83.3% | -1.3% | -6.3% → 3.7% | 1/2 | không ưu tiên |

## Theo tần suất năm

| Nhóm | Ngày | Quan sát | Mẫu vị giữa | Rủi ro LS | Loại đúng TT | Nền | Edge TT | CI 95% Edge | Ổn định năm | Đánh giá |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| active|0/năm | 152 | 386 | - | - | 66.4% | 61.3% | 5.1% | 0.4% → 9.8% | 3/3 | ưu tiên cao |
| active|<0,1/năm | 152 | 338 | - | - | 65.8% | 63.8% | 2.1% | -2.5% → 6.6% | 2/3 | ưu tiên có điều kiện |
| active|0,5-<1/năm | 257 | 2395 | 12 | 82.8% | 75.1% | 73.8% | 1.3% | -0.7% → 3.2% | 3/3 | ưu tiên có điều kiện |
| potential|0,5-<1/năm | 265 | 8372 | - | - | 90.3% | 89.8% | 0.5% | -0.8% → 1.8% | 2/3 | ưu tiên có điều kiện |
| active|>=1/năm | 262 | 47716 | 180 | 81.1% | 82.5% | 82.1% | 0.4% | -0.4% → 1.2% | 1/3 | không ưu tiên |
| active|0,1-<0,5/năm | 260 | 2026 | 5 | 71.2% | 74.2% | 73.9% | 0.4% | -1.4% → 2.2% | 2/3 | ưu tiên có điều kiện |
| potential|<0,1/năm | 245 | 836 | - | - | 96.9% | 96.9% | 0.1% | -1.3% → 1.4% | 1/3 | không ưu tiên |
| potential|>=1/năm | 265 | 21531 | - | - | 81.0% | 81.0% | -0.0% | -1.2% → 1.1% | 1/3 | không ưu tiên |
| potential|0/năm | 265 | 63144 | - | - | 79.6% | 79.9% | -0.2% | -2.3% → 1.8% | 1/3 | không ưu tiên |
| potential|0,1-<0,5/năm | 265 | 12701 | - | - | 89.8% | 90.5% | -0.7% | -1.9% → 0.5% | 1/3 | không ưu tiên |

## Theo dạng chuỗi

| Nhóm | Ngày | Quan sát | Mẫu vị giữa | Rủi ro LS | Loại đúng TT | Nền | Edge TT | CI 95% Edge | Ổn định năm | Đánh giá |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| active|orderedAlternationUp | 20 | 26 | 479.5 | 90.5% | 100.0% | 90.2% | 9.8% | 8.8% → 10.8% | 3/3 | không ưu tiên |
| potential|downUpAlternation | 84 | 1223 | - | - | 84.2% | 82.3% | 1.9% | -1.4% → 5.1% | 1/3 | không ưu tiên |
| active|up | 240 | 2403 | 211 | 91.6% | 90.7% | 89.1% | 1.6% | 0.0% → 3.2% | 3/3 | ưu tiên cao |
| active|orderedAlternationDown | 16 | 18 | 303 | 90.0% | 90.6% | 89.3% | 1.3% | -11.4% → 14.0% | 2/3 | không ưu tiên |
| potential|consecutive | 258 | 575 | - | - | 97.0% | 96.0% | 1.0% | -0.6% → 2.7% | 3/3 | ưu tiên có điều kiện |
| active|other | 260 | 2023 | 117 | 89.6% | 88.8% | 87.8% | 1.0% | -1.1% → 3.1% | 2/3 | ưu tiên có điều kiện |
| active|consecutive | 262 | 19189 | 345 | 72.5% | 73.3% | 72.3% | 1.0% | -1.2% → 3.2% | 2/3 | ưu tiên có điều kiện |
| potential|alternation | 254 | 519 | - | - | 97.4% | 96.6% | 0.8% | -0.8% → 2.4% | 2/3 | ưu tiên có điều kiện |
| active|alternation | 259 | 3136 | 245 | 65.6% | 90.7% | 90.1% | 0.7% | -1.0% → 2.3% | 1/3 | không ưu tiên |
| potential|orderedAlternation | 216 | 916 | - | - | 99.5% | 99.0% | 0.5% | 0.2% → 0.8% | 2/3 | ưu tiên có điều kiện |
| potential|uniformDown | 265 | 3571 | - | - | 98.5% | 98.0% | 0.4% | 0.1% → 0.8% | 2/3 | ưu tiên có điều kiện |
| active|uniformUp | 259 | 3907 | 173.5 | 90.9% | 91.8% | 91.4% | 0.4% | -0.5% → 1.3% | 3/3 | ưu tiên có điều kiện |
| potential|up | 265 | 3233 | - | - | 96.4% | 96.1% | 0.2% | -0.8% → 1.2% | 2/3 | ưu tiên có điều kiện |
| active|orderedAlternation | 257 | 12451 | 67 | 90.2% | 91.8% | 91.8% | 0.1% | -0.2% → 0.4% | 2/3 | ưu tiên có điều kiện |
| potential|orderedAlternationDown | 261 | 1304 | - | - | 95.5% | 95.4% | 0.1% | -1.6% → 1.8% | 2/3 | ưu tiên có điều kiện |
| potential|blockAlternation | 265 | 83169 | - | - | 76.3% | 76.3% | 0.1% | -1.7% → 1.8% | 1/3 | không ưu tiên |
| potential|down | 265 | 2762 | - | - | 96.0% | 96.0% | -0.0% | -1.2% → 1.2% | 1/3 | không ưu tiên |
| potential|uniformUp | 265 | 2599 | - | - | 97.8% | 97.9% | -0.1% | -0.7% → 0.4% | 1/3 | không ưu tiên |
| active|uniformDown | 259 | 4073 | 173.5 | 91.0% | 91.5% | 91.8% | -0.3% | -1.1% → 0.5% | 1/3 | không ưu tiên |
| potential|other | 265 | 3809 | - | - | 95.8% | 96.1% | -0.3% | -1.8% → 1.2% | 2/3 | không ưu tiên |
| potential|orderedAlternationUp | 209 | 789 | - | - | 98.4% | 99.0% | -0.6% | -1.8% → 0.6% | 1/3 | không ưu tiên |
| active|blockAlternation | 246 | 1877 | - | - | 31.1% | 32.1% | -1.0% | -4.8% → 2.9% | 1/3 | không ưu tiên |
| potential|pairAlternation | 239 | 1049 | - | - | 57.1% | 58.1% | -1.0% | -5.2% → 3.2% | 2/3 | không ưu tiên |
| active|upDownAlternation | 165 | 325 | 386.5 | 46.8% | 51.2% | 52.4% | -1.1% | -6.6% → 4.3% | 1/3 | không ưu tiên |
| active|downUpAlternation | 172 | 369 | 375.5 | 47.1% | 51.8% | 53.2% | -1.4% | -6.5% → 3.7% | 0/3 | không ưu tiên |
| active|down | 231 | 2254 | 208 | 91.2% | 85.6% | 87.3% | -1.7% | -4.2% → 0.9% | 1/3 | không ưu tiên |
| active|pairAlternation | 226 | 810 | 231 | 53.0% | 48.8% | 51.4% | -2.6% | -7.6% → 2.4% | 0/3 | không ưu tiên |
| potential|upDownAlternation | 90 | 1066 | - | - | 79.3% | 82.2% | -2.9% | -7.1% → 1.2% | 1/3 | không ưu tiên |

## Theo họ thống kê

| Nhóm | Ngày | Quan sát | Mẫu vị giữa | Rủi ro LS | Loại đúng TT | Nền | Edge TT | CI 95% Edge | Ổn định năm | Đánh giá |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| active|head-tail | 155 | 312 | 282 | 71.6% | 79.8% | 74.5% | 5.3% | 0.1% → 10.6% | 2/3 | ưu tiên có điều kiện |
| active|fixed-set | 33 | 64 | 34 | 91.9% | 98.5% | 96.7% | 1.8% | -1.4% → 5.0% | 2/3 | ưu tiên có điều kiện |
| active|difference | 262 | 8554 | 223.3 | 78.0% | 80.7% | 79.5% | 1.1% | -0.3% → 2.5% | 3/3 | ưu tiên có điều kiện |
| active|head | 262 | 8390 | 191 | 79.5% | 82.1% | 81.4% | 0.8% | -0.6% → 2.1% | 3/3 | ưu tiên có điều kiện |
| potential|head | 262 | 1257 | - | - | 89.5% | 89.0% | 0.6% | -1.0% → 2.2% | 2/3 | ưu tiên có điều kiện |
| active|sum | 262 | 25110 | 124.8 | 84.0% | 86.7% | 86.1% | 0.5% | -0.6% → 1.6% | 1/3 | không ưu tiên |
| potential|sum | 265 | 11618 | - | - | 93.5% | 93.3% | 0.2% | -0.7% → 1.1% | 1/3 | không ưu tiên |
| potential|number | 265 | 2353 | - | - | 96.4% | 96.3% | 0.2% | -0.5% → 0.9% | 2/3 | ưu tiên có điều kiện |
| potential|block | 265 | 83169 | - | - | 76.3% | 76.3% | 0.1% | -1.7% → 1.8% | 1/3 | không ưu tiên |
| potential|difference | 265 | 1591 | - | - | 90.3% | 90.4% | -0.1% | -1.6% → 1.4% | 1/3 | không ưu tiên |
| potential|head-tail | 265 | 3075 | - | - | 97.1% | 97.2% | -0.1% | -0.7% → 0.5% | 2/3 | không ưu tiên |
| potential|fixed-set | 265 | 1313 | - | - | 97.6% | 97.8% | -0.2% | -1.2% → 0.8% | 1/3 | không ưu tiên |
| active|tail | 262 | 8118 | 192 | 79.7% | 81.1% | 81.6% | -0.4% | -1.9% → 1.0% | 0/3 | không ưu tiên |
| potential|class | 265 | 905 | - | - | 94.2% | 95.0% | -0.8% | -2.0% → 0.3% | 1/3 | không ưu tiên |
| active|block | 246 | 1877 | - | - | 31.1% | 32.1% | -1.0% | -4.8% → 2.9% | 1/3 | không ưu tiên |
| potential|tail | 260 | 1303 | - | - | 86.9% | 88.0% | -1.1% | -3.2% → 1.0% | 1/3 | không ưu tiên |
| active|class | 142 | 264 | 184 | 78.6% | 82.8% | 85.7% | -2.9% | -8.1% → 2.2% | 0/3 | không ưu tiên |
| active|number | 117 | 172 | 230.5 | 51.9% | 49.4% | 57.5% | -8.2% | -15.2% → -1.1% | 0/3 | không ưu tiên |

## Theo cohort ưu tiên kết hợp (ít nhất 20 ngày)

| Nhóm | Ngày | Quan sát | Mẫu vị giữa | Rủi ro LS | Loại đúng TT | Nền | Edge TT | CI 95% Edge | Ổn định năm | Đánh giá |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| active|at-record|Tier 1|dài 6-7|<0,1/năm|orderedAlternation | 24 | 26 | - | - | 100.0% | 89.3% | 10.7% | 9.8% → 11.6% | 3/3 | không ưu tiên |
| active|near-record|Tier 4|dài 3|>=1/năm|uniformDown | 80 | 90 | 23.5 | 88.3% | 98.8% | 89.2% | 9.5% | 7.7% → 11.3% | 3/3 | ưu tiên cao |
| active|near-record|Tier 3|dài 5|0,5-<1/năm|consecutive | 29 | 31 | 11 | 76.7% | 86.2% | 70.0% | 16.2% | 3.4% → 29.0% | 3/3 | không ưu tiên |
| active|at-record|Tier 1|dài 2|>=1/năm|other | 26 | 29 | - | - | 100.0% | 96.3% | 3.7% | 2.6% → 4.8% | 3/3 | không ưu tiên |
| potential|near-record|Tier 3|dài 2|>=1/năm|up | 43 | 47 | - | - | 98.8% | 94.5% | 4.3% | 2.2% → 6.5% | 3/3 | ưu tiên cao |
| potential|at-record|Tier 1|dài 2|<0,1/năm|consecutive | 22 | 22 | - | - | 100.0% | 98.0% | 2.0% | 2.0% → 2.0% | 3/3 | không ưu tiên |
| potential|near-record|Tier 3|dài 2|0,1-<0,5/năm|down | 20 | 20 | - | - | 100.0% | 97.7% | 2.4% | 2.0% → 2.7% | 3/3 | không ưu tiên |
| potential|at-record|Tier 1|dài 2|<0,1/năm|down | 63 | 75 | - | - | 100.0% | 98.3% | 1.7% | 1.6% → 1.8% | 3/3 | ưu tiên cao |
| potential|at-record|Tier 1|dài 2|<0,1/năm|up | 36 | 37 | - | - | 100.0% | 98.3% | 1.7% | 1.5% → 1.9% | 3/3 | ưu tiên cao |
| active|at-record|Tier 1|dài 2|0,5-<1/năm|other | 25 | 26 | - | - | 100.0% | 97.7% | 2.3% | 1.4% → 3.2% | 3/3 | không ưu tiên |
| potential|at-record|Tier 1|dài 3|>=1/năm|alternation | 20 | 20 | - | - | 100.0% | 98.0% | 2.0% | 1.3% → 2.7% | 3/3 | không ưu tiên |
| potential|at-record|Tier 1|dài 4|<0,1/năm|downUpAlternation | 46 | 87 | - | - | 94.1% | 88.1% | 6.1% | 1.3% → 10.9% | 3/3 | ưu tiên cao |
| active|at-record|Tier 1|dài 2|0,1-<0,5/năm|other | 20 | 23 | - | - | 100.0% | 98.1% | 1.9% | 1.1% → 2.7% | 3/3 | không ưu tiên |
| potential|near-record|Tier 3|dài 2|0,1-<0,5/năm|uniformDown | 93 | 93 | - | - | 100.0% | 99.0% | 1.0% | 1.0% → 1.0% | 3/3 | ưu tiên cao |
| potential|at-record|Tier 1|dài 3|0,5-<1/năm|orderedAlternationDown | 93 | 124 | - | - | 100.0% | 99.0% | 1.0% | 1.0% → 1.0% | 2/2 | ưu tiên cao |
| potential|at-record|Tier 1|dài 3|<0,1/năm|orderedAlternation | 70 | 75 | - | - | 100.0% | 99.0% | 1.0% | 1.0% → 1.0% | 3/3 | ưu tiên cao |
| potential|at-record|Tier 1|dài 3|>=1/năm|orderedAlternationDown | 64 | 67 | - | - | 100.0% | 99.0% | 1.0% | 1.0% → 1.0% | 1/1 | ưu tiên cao |
| potential|never-pattern|Tier 3|dài 2|0/năm|other | 36 | 36 | - | - | 100.0% | 99.0% | 1.0% | 1.0% → 1.0% | 3/3 | ưu tiên cao |
| potential|at-record|Tier 1|dài 2|<0,1/năm|other | 30 | 30 | - | - | 100.0% | 99.0% | 1.0% | 1.0% → 1.0% | 3/3 | ưu tiên cao |
| potential|near-record|Tier 3|dài 2|0,1-<0,5/năm|other | 24 | 24 | - | - | 100.0% | 99.0% | 1.0% | 1.0% → 1.0% | 3/3 | không ưu tiên |
| potential|never-pattern|Tier 3|dài 3|0/năm|orderedAlternation | 20 | 20 | - | - | 100.0% | 99.0% | 1.0% | 1.0% → 1.0% | 3/3 | không ưu tiên |
| active|at-record|Tier 1|dài 2|>=1/năm|uniformUp | 76 | 123 | - | - | 99.3% | 97.4% | 1.9% | 0.7% → 3.1% | 2/3 | ưu tiên có điều kiện |
| active|at-record|Tier 1|dài 3|>=1/năm|orderedAlternation | 198 | 848 | - | - | 98.5% | 97.3% | 1.3% | 0.5% → 2.0% | 3/3 | ưu tiên cao |
| potential|at-record|Tier 1|dài 2|0,5-<1/năm|uniformDown | 265 | 809 | - | - | 99.4% | 98.4% | 0.9% | 0.5% → 1.3% | 3/3 | ưu tiên cao |
| active|at-record|Tier 1|dài 3|0,1-<0,5/năm|orderedAlternation | 28 | 156 | - | - | 98.8% | 97.2% | 1.6% | 0.5% → 2.7% | 3/3 | không ưu tiên |
| potential|at-record|Tier 1|dài 3|0,5-<1/năm|alternation | 87 | 91 | - | - | 98.9% | 96.3% | 2.6% | 0.3% → 4.8% | 3/3 | ưu tiên cao |
| potential|at-record|Tier 1|dài 2|0,1-<0,5/năm|uniformDown | 265 | 1491 | - | - | 99.3% | 99.0% | 0.4% | -0.1% → 0.8% | 3/3 | ưu tiên có điều kiện |
| potential|near-record|Tier 3|dài 2|0,5-<1/năm|consecutive | 61 | 67 | - | - | 98.4% | 95.3% | 3.1% | -0.1% → 6.3% | 2/3 | ưu tiên có điều kiện |
| active|near-record|Tier 4|dài 2|>=1/năm|up | 233 | 1572 | 199.5 | 96.6% | 93.0% | 91.8% | 1.2% | -0.2% → 2.5% | 3/3 | ưu tiên có điều kiện |
| active|below-record|Tier 4|dài 3|>=1/năm|orderedAlternation | 257 | 9468 | 69 | 90.8% | 90.9% | 91.0% | -0.1% | -0.4% → 0.2% | 2/3 | không ưu tiên |
| potential|near-record|Tier 4|dài 2|>=1/năm|uniformDown | 122 | 306 | - | - | 96.8% | 95.1% | 1.6% | -0.6% → 3.8% | 2/3 | ưu tiên có điều kiện |
| potential|at-record|Tier 1|dài 2|0,1-<0,5/năm|other | 186 | 470 | - | - | 99.2% | 98.7% | 0.5% | -0.6% → 1.6% | 2/3 | ưu tiên có điều kiện |
| potential|at-record|Tier 1|dài 3|0,5-<1/năm|orderedAlternation | 74 | 262 | - | - | 99.3% | 99.0% | 0.3% | -0.7% → 1.3% | 2/2 | ưu tiên có điều kiện |
| active|below-record|Tier 4|dài 5|>=1/năm|consecutive | 76 | 121 | 71.5 | 54.9% | 65.9% | 56.5% | 9.3% | -0.7% → 19.4% | 2/3 | ưu tiên có điều kiện |
| potential|at-record|Tier 1|dài 2|0,1-<0,5/năm|down | 217 | 481 | - | - | 98.4% | 97.7% | 0.7% | -0.7% → 2.1% | 3/3 | ưu tiên có điều kiện |
| active|at-record|Tier 1|dài 2|>=1/năm|up | 106 | 200 | - | - | 98.4% | 97.1% | 1.3% | -0.8% → 3.4% | 3/3 | ưu tiên có điều kiện |
| active|below-record|Tier 3|dài 3|0,5-<1/năm|orderedAlternation | 51 | 333 | 13 | 88.2% | 94.7% | 93.4% | 1.3% | -0.8% → 3.3% | 2/3 | ưu tiên có điều kiện |
| active|below-record|Tier 3|dài 5|0,5-<1/năm|consecutive | 41 | 52 | 12 | 70.1% | 80.9% | 70.0% | 10.9% | -0.9% → 22.6% | 3/3 | ưu tiên có điều kiện |
| potential|at-record|Tier 1|dài 3|0,1-<0,5/năm|orderedAlternation | 170 | 418 | - | - | 99.0% | 99.0% | 0.0% | -0.9% → 0.9% | 1/3 | không ưu tiên |
| potential|at-record|Tier 1|dài 2|0,5-<1/năm|uniformUp | 220 | 521 | - | - | 98.7% | 98.3% | 0.4% | -0.9% → 1.7% | 3/3 | ưu tiên có điều kiện |
| potential|at-record|Tier 1|dài 2|0,1-<0,5/năm|uniformUp | 211 | 1096 | - | - | 98.8% | 98.9% | -0.2% | -0.9% → 0.6% | 2/3 | không ưu tiên |
| active|below-record|Tier 3|dài 5|0,5-<1/năm|orderedAlternation | 143 | 196 | 10.5 | 84.1% | 92.2% | 89.3% | 2.9% | -1.0% → 6.7% | 3/3 | ưu tiên có điều kiện |
| potential|at-record|Tier 1|dài 2|0,5-<1/năm|up | 239 | 931 | - | - | 97.0% | 96.5% | 0.4% | -1.0% → 1.9% | 1/3 | không ưu tiên |
| active|below-record|Tier 4|dài 2|>=1/năm|uniformUp | 257 | 2169 | 192 | 90.0% | 90.3% | 90.0% | 0.3% | -1.0% → 1.5% | 2/3 | ưu tiên có điều kiện |
| potential|at-record|Tier 1|dài 2|>=1/năm|uniformDown | 252 | 556 | - | - | 97.2% | 96.8% | 0.4% | -1.1% → 1.8% | 2/3 | ưu tiên có điều kiện |
| potential|at-record|Tier 1|dài 2|>=1/năm|down | 236 | 1003 | - | - | 95.3% | 94.9% | 0.4% | -1.1% → 2.0% | 3/3 | ưu tiên có điều kiện |
| potential|at-record|Tier 1|dài 2|>=1/năm|up | 250 | 1139 | - | - | 95.6% | 95.3% | 0.4% | -1.2% → 1.9% | 2/3 | ưu tiên có điều kiện |
| active|below-record|Tier 4|dài 3|>=1/năm|alternation | 259 | 1298 | 482 | 66.4% | 90.6% | 90.0% | 0.6% | -1.2% → 2.4% | 1/3 | không ưu tiên |
| potential|at-record|Tier 1|dài 2|0,5-<1/năm|other | 238 | 1050 | - | - | 98.0% | 97.9% | 0.1% | -1.2% → 1.5% | 2/3 | ưu tiên có điều kiện |
| active|at-record|Tier 1|dài 3|0,5-<1/năm|uniformUp | 27 | 30 | - | - | 96.3% | 90.3% | 6.0% | -1.3% → 13.2% | 3/3 | không ưu tiên |
