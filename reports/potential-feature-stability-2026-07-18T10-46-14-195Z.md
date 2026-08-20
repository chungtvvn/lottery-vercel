# Độ bền của tần suất, độ dài và nhịp chuỗi tiềm năng

- Train: 2024, 2025.
- Holdout: 2026.
- Edge dương nghĩa là tỷ lệ không hình thành cao hơn xác suất nền của đúng tập số.
- Mỗi feature/cohort chỉ đóng góp tối đa một đơn vị mỗi ngày.

## Tín hiệu bền qua train và cùng dấu trên holdout

| Biến | Nhóm | Năm dương/train | Edge train | Cận bảo thủ | Holdout |
|---|---|---:|---:|---:|---|
| family×targetFrequency | tail | ≥3/năm | 2/2 | 13.85% | 10.85% | 2026: 12.22% |
| family×duration | tail | dư 0,75-1,5 ngày | 2/2 | 12.31% | 9.12% | 2026: 7.78% |
| width×frequency | 11-20 số | 0,25-0,75/năm | 2/2 | 9.25% | 6.89% | 2026: 16.17% |
| record×frequency | never-pattern | <0,25/năm | 2/2 | 6.33% | 5.40% | 2026: 1.97% |
| family×targetFrequency | sum | 0,25-0,75/năm | 2/2 | 7.73% | 4.25% | 2026: 12.04% |
| family×duration | number | dư 0,25-0,75 ngày | 2/2 | 7.53% | 4.20% | 2026: 8.33% |
| width×frequency | >40 số | 0/năm | 2/2 | 4.66% | 3.31% | 2026: 0.17% |
| family×duration | difference | dư 0,75-1,5 ngày | 2/2 | 7.53% | 2.82% | 2026: 7.75% |
| duration | dư 0,75-1,5 ngày | 2/2 | 2.08% | 1.76% | 2026: 5.49% |
| baseFrequency | ≥3/năm | 2/2 | 2.94% | 1.52% | 2026: 1.44% |
| family | number | 2/2 | 1.71% | 1.52% | 2026: 0.23% |
| width×frequency | >40 số | ≥3/năm | 2/2 | 2.05% | 1.41% | 2026: 3.55% |
| frequency×duration | ≥3/năm | dư 0,75-1,5 ngày | 2/2 | 2.40% | 1.16% | 2026: 6.17% |
| baseFrequency | 1,5-3/năm | 2/2 | 1.59% | 1.16% | 2026: 0.84% |
| family×targetGap | number | <0,5 nhịp | 2/2 | 1.17% | 0.92% | 2026: 0.00% |
| family×duration | number | dư <0,25 ngày | 2/2 | 0.97% | 0.74% | 2026: 0.65% |
| family×targetFrequency | number | 0/năm | 2/2 | 0.95% | 0.70% | 2026: 0.65% |
| family×duration | head-tail | dư <0,25 ngày | 2/2 | 0.20% | 0.16% | 2026: 0.01% |
| family×duration | difference | dư <0,25 ngày | 2/2 | 0.14% | 0.12% | 2026: 0.01% |
| width | ≤2 số | 2/2 | 0.15% | 0.05% | 2026: 0.27% |
| record | at-record | 2/2 | 0.05% | 0.02% | 2026: 0.54% |

## Kết luận sử dụng

Có 21 cohort đạt điều kiện mô tả, nhưng chỉ nên dùng làm tín hiệu phụ sau shrinkage; không được coi từng candidate là mẫu độc lập.

Nhịp `Gần nhất/TB cách` không được dùng theo quy tắc “đến hạn” nếu edge đổi dấu giữa các năm.

> Backtest lịch sử không bảo đảm lợi nhuận tương lai.
