# Audit nguyên nhân loại trừ sai - ChainSmallFirst Hold70

- Nguồn: candidate diagnostics strict PIT, chỉ dùng dữ liệu có trước ngày dự đoán.
- Bằng chứng được khử trùng theo trạng thái + family + pattern + record state + độ rộng + độ dài + tập số.
- Báo cáo không mặc định quy kết mọi candidate chứa số thực tế là nguyên nhân duy nhất; `fill-or-tie-break` đánh dấu số bị loại nhưng không có candidate liên quan.

## Tổng quan

- Số ngày: **632**; sai: **424**; trúng: **32.91%**.
- Sai có bằng chứng phá/vượt kỷ lục: **363/424 (85.61%)**.
- Sai có bằng chứng hình thành lần đầu: **424/424 (100.00%)**.
- Sai không có candidate gắn với số thực tế (fill/tie-break): **0/424 (0.00%)**.
- Mỗi ngày sai có trung bình **132.3** bằng chứng sau khử trùng, thuộc **6.3** family.

## Nguyên nhân trội trên ngày sai

| Nguyên nhân | Ngày | Tỷ lệ trên ngày sai |
|---|---:|---:|
| active-record-broken | 286 | 67.45% |
| active-super-record-continued | 77 | 18.16% |
| potential-first-formation | 61 | 14.39% |

## Lift điều kiện của từng loại bằng chứng

> Lift > 1 nghĩa là ngày có loại bằng chứng này sai nhiều hơn mức chung; chỉ số này hữu ích hơn đếm thô.

| Loại bằng chứng gắn với số thực tế | Số ngày | Ngày sai | Tỷ lệ sai | Lift |
|---|---:|---:|---:|---:|
| potential-record-formation | 488 | 379 | 77.66% | 1.158 |
| active-record-broken | 511 | 358 | 70.06% | 1.044 |
| active-super-record-continued | 112 | 77 | 68.75% | 1.025 |
| active-near-record-continued | 606 | 409 | 67.49% | 1.006 |
| active-other-continued | 626 | 422 | 67.41% | 1.005 |
| potential-first-formation | 632 | 424 | 67.09% | 1.000 |
| potential-other-formation | 630 | 422 | 66.98% | 0.998 |

## Family xuất hiện trong bằng chứng sai

> Đây là số lượt bằng chứng đã khử trùng, không phải số ngày; dùng để phát hiện family tương quan/phủ quá rộng.

| Family | Lượt | Lượt / ngày sai |
|---|---:|---:|
| block | 35953 | 84.79 |
| sum | 10107 | 23.84 |
| difference | 3567 | 8.41 |
| tail | 2917 | 6.88 |
| head | 2766 | 6.52 |
| head-tail | 301 | 0.71 |
| number | 256 | 0.60 |
| class | 153 | 0.36 |
| fixed-set | 86 | 0.20 |

## Theo giai đoạn

| Giai đoạn | Ngày | Sai | Tỷ lệ trúng | Phá/vượt KL | Hình thành đầu | Không evidence |
|---|---:|---:|---:|---:|---:|---:|
| Train 2014-2020 | 256 | 178 | 30.47% | 92.70% | 100.00% | 0.00% |
| Validation 2021-2023 | 111 | 72 | 35.14% | 86.11% | 100.00% | 0.00% |
| Test 2024-2025 | 74 | 51 | 31.08% | 66.67% | 100.00% | 0.00% |
| Holdout 2026 | 191 | 123 | 35.60% | 82.93% | 100.00% | 0.00% |

## Dataset train

- File JSONL: `reports/exclusion-failure-risk-dataset-2026-07-20T07-56-47-855Z.jsonl`.
- Mỗi dòng là một số 00-99 trong một ngày: `wasExcluded`, nhãn `actual`/`failed`, nhóm nguyên nhân, số family hỗ trợ, active/potential, Tier 1, độ rộng nhỏ nhất và tần suất trung bình.
- Khi train phải chia theo thời gian; không shuffle xuyên tương lai và không chọn cấu hình bằng 2026.

