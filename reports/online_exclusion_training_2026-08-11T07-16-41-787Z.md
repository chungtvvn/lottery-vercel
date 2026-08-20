# Huấn luyện online theo kết quả thực tế và tín hiệu loại trừ

Trạng thái: **research-only-do-not-promote-without-independent-positive-holdouts**. Tham số được khóa bằng 2022-01-01 đến 2023-12-31.

| Giai đoạn | Mô hình: hit | Mô hình: profit | Mô hình: ROI | Chuỗi W/L | Chuỗi nhỏ: hit | Chuỗi nhỏ: profit | Net hit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Chọn tham số | 220/722 (30.47%) | -3.180.000K | -14.68% | 4/13 | 216/722 (29.92%) | -3.516.000K | — |
| Test độc lập | 203/723 (28.08%) | -4.638.000K | -21.38% | 5/17 | 206/723 (28.49%) | -4.386.000K | -3 |
| Holdout 2026 | 47/187 (25.13%) | -1.662.000K | -29.63% | 4/12 | 68/187 (36.36%) | 102.000K | -21 |

Diễn giải: `exclusionErrorRate = 1 - hitRate` là tỷ lệ ngày số thực tế vẫn rơi vào 70 số bị loại. Mô hình chỉ đủ điều kiện production nếu cả test độc lập và holdout có profit dương, đồng thời không thua baseline.
