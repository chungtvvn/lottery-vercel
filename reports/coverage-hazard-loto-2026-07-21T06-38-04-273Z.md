# Coverage/hazard độc lập cho Lô

Mô hình dùng feature strict PIT của 100 số, không dùng chain. Train theo daily presence; profit được kết toán theo mọi lần xuất hiện trong 27 vị trí.

| Dàn | Cấu hình chọn trên validation | Hit validation | Profit validation | Hit test | Profit test | Hit 2026 | Profit 2026 |
|---|---|---:|---:|---:|---:|---:|---:|
| Top 6 | coverage-logistic-l2-0.2 | 82.09% | 208.400K | 82.16% | 400K | 80.10% | 78.800K |
| Top 7 | coverage-logistic-l2-0.2 | 86.24% | 97.800K | 87.00% | 105.800K | 85.86% | 162.600K |

Đây là kiểm tra feature độc lập. Chỉ được ghép với RRF production sau khi có nguồn dàn Lô strict PIT đủ dài trên đúng cùng ngày.
