# Ledger cơ hội bảo vệ chuỗi theo strict point-in-time

- Dữ liệu: 2014-01-01 -> 2026-07-14; 632 ngày quan sát.
- 2014-2025 là mẫu mỗi 10 ngày; 2026 là replay đầy đủ từng ngày. Không được diễn giải mẫu 2014-2025 như tổng số ngày lịch.
- Cơ hội được tạo hoàn toàn từ candidate trước kết quả. Kết quả thực tế chỉ dùng sau đó để kết toán event.
- Khử trùng chính: cùng loại event + cùng family + cùng tập số chỉ giữ đại diện mạnh nhất.

## Phân phối mỗi ngày quan sát

| Chỉ số | Tổng | TB/ngày | Trung vị | P95 | Cao nhất |
|---|---:|---:|---:|---:|---:|
| Cơ hội thô | 206.645 | 326,97 | 325,0 | 348,0 | 421 |
| Cơ hội đã khử trùng | 204.879 | 324,18 | 323,0 | 343,0 | 403 |
| Event thực tế | 46.457 | 73,51 | 55,0 | 217,0 | 311 |
| Số được phủ bởi mọi cảnh báo | 63.200 | 100,00 | 100,0 | 100,0 | 100 |

## Theo loại cơ hội

| Loại | Cơ hội | Event | Tỷ lệ event | Xác suất nền theo độ rộng | Lift tuyệt đối | Lift tương đối | TB số/tập |
|---|---:|---:|---:|---:|---:|---:|---:|
| first-formation | 194.098 | 44.362 | 22,86% | 22,94% | -0,09% | 1,00x | 22,94 |
| record-break | 10.781 | 2.095 | 19,43% | 19,88% | -0,44% | 0,98x | 19,88 |

## Theo family và loại

| Cohort | Cơ hội | Event | Tỷ lệ event | Xác suất nền theo độ rộng | Lift tuyệt đối | Lift tương đối | TB số/tập |
|---|---:|---:|---:|---:|---:|---:|---:|
| first-formation|block | 191.431 | 44.168 | 23,07% | 23,16% | -0,09% | 1,00x | 23,16 |
| record-break|sum | 6.320 | 354 | 5,60% | 5,86% | -0,26% | 0,96x | 5,86 |
| record-break|block | 2.274 | 1.543 | 67,85% | 68,17% | -0,31% | 1,00x | 68,17 |
| first-formation|sum | 972 | 91 | 9,36% | 9,32% | 0,05% | 1,00x | 9,32 |
| record-break|difference | 718 | 69 | 9,61% | 10,15% | -0,54% | 0,95x | 10,15 |
| record-break|head | 605 | 64 | 10,58% | 11,72% | -1,14% | 0,90x | 11,72 |
| record-break|tail | 568 | 61 | 10,74% | 11,51% | -0,77% | 0,93x | 11,51 |
| first-formation|tail | 451 | 42 | 9,31% | 10,25% | -0,94% | 0,91x | 10,25 |
| first-formation|head | 415 | 37 | 8,92% | 10,34% | -1,42% | 0,86x | 10,34 |
| first-formation|number | 367 | 6 | 1,63% | 1,30% | 0,34% | 1,26x | 1,30 |
| first-formation|head-tail | 289 | 3 | 1,04% | 1,38% | -0,35% | 0,75x | 1,38 |
| record-break|head-tail | 133 | 2 | 1,50% | 3,38% | -1,88% | 0,44x | 3,38 |
| first-formation|difference | 87 | 11 | 12,64% | 9,09% | 3,55% | 1,39x | 9,09 |
| first-formation|fixed-set | 83 | 2 | 2,41% | 2,98% | -0,57% | 0,81x | 2,98 |
| record-break|fixed-set | 63 | 1 | 1,59% | 2,30% | -0,71% | 0,69x | 2,30 |
| record-break|number | 56 | 0 | 0,00% | 3,43% | -3,43% | 0,00x | 3,43 |
| record-break|class | 44 | 1 | 2,27% | 12,14% | -9,86% | 0,19x | 12,14 |
| first-formation|class | 3 | 2 | 66,67% | 63,00% | 3,67% | 1,06x | 63,00 |

## Kết luận dữ liệu nền

- Không thể hard-veto toàn bộ cảnh báo: hợp các cảnh báo thường phủ gần đủ 100 số.
- Tỷ lệ event phải so với xác suất nền `setSize/100`; tỷ lệ cao của tập rộng không tự động là tín hiệu tốt.
- Bước kế tiếp là hiệu chỉnh Beta-Binomial phân cấp theo loại/family/độ rộng/độ dài và chỉ bảo vệ tín hiệu có cận tin cậy vượt nền.

