# Coverage/hazard kết hợp phương pháp Đề

Feature được tính trước kết quả mỗi ngày. Cấu hình chọn trên 2021-2023; test 2024-2025; 2026 chỉ đánh giá sau khi khóa cấu hình.

| Baseline | Cấu hình | Δ validation | Δ test | Δ 2026 | Hit 2026 | Profit 2026 | Quyết định |
|---|---|---:|---:|---:|---:|---:|---|
| chainSmallFirst | chainSmallFirst-coverage-l2-5-s1-m0 | +9 | -1 | +2 | 37.43% | 270.000K | do-not-promote |
| chainBlockFirst | chainBlockFirst-no-change | +0 | +0 | +0 | 29.95% | -906.000K | do-not-promote |
| activeOnlyAvgRisk | activeOnlyAvgRisk-no-change | +0 | +0 | +0 | 32.62% | -486.000K | do-not-promote |

Chỉ promote khi candidate không giảm ở bất kỳ năm validation/test nào và không giảm trong 2026.
