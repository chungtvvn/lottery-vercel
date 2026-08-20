# Nghiên cứu giới hạn phạm vi Block và guard phá kỷ lục

- Sinh lúc: 2026-07-18T12:22:12.122Z
- Train: 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023
- Evaluation: 2024, 2025, 2026
- Baseline: Chuỗi nhỏ trước, Hold 70 / đánh 30.
- Chỉ dùng Block đang diễn ra; loại bỏ toàn bộ Block tiềm năng; khử trùng theo shape + tập số.
- Guard hai chiều chỉ đổi tối đa 1 số/ngày khi có đồng thời bằng chứng gãy và bằng chứng phá kỷ lục ổn định.
- Cảnh báo: train 2014-2023 và evaluation 2024-2025 là mẫu; 2026 là full daily đến 14/07/2026.

## Phạm vi Block

| Năm | Scope <=60 | Scope <=70 | Edge loại <=70 | Phá KL | Nền phá KL | Vượt nền |
|---:|---:|---:|---:|---:|---:|---:|
| 2024 | 275 | 562 | -1.18% | 38.71% | 27.61% | 11.10% |
| 2025 | 291 | 573 | 3.07% | 23.08% | 35.05% | -11.97% |
| 2026 | 212 | 1026 | -3.67% | 71.16% | 68.26% | 2.90% |

## Kết quả Hold 70

| Năm | Baseline hit | Admission hit | Guard hai chiều | Guard chỉ biên KL | Đổi ngày | Cứu/Hại |
|---:|---:|---:|---:|---:|---:|---:|
| 2024 | 14/37 | 14/37 | 14/37 | 14/37 | 6 | 0/0 |
| 2025 | 9/37 | 9/37 | 9/37 | 9/37 | 10 | 0/0 |
| 2026 | 68/191 | 68/191 | 68/191 | 67/191 | 125 | 1/1 |

## Kết luận

- Scope <=60 không đủ cohort phá kỷ lục ổn định để tạo guard.
- Scope <=70 là phạm vi nhỏ nhất tạo được guard hai chiều trong bộ train.
- Không dùng “đạt kỷ lục” như tín hiệu loại tuyệt đối; tỷ lệ phá kỷ lục phải được ước lượng riêng.
- Chưa thay production default cho đến khi chạy full-day strict PIT và xác nhận trên một holdout mới.
