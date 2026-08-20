# Nghiên cứu ổn định lợi nhuận Lô RRF theo tháng

- Nguồn: /Users/chungtv/Desktop/lottery-stats-vercel/reports/backtest_loto_milestone20y_2026-08-03T13-09-42.json
- Strict PIT: quyết định chơi/bỏ ngày chỉ dùng trạng thái và kết quả đã kết toán trước ngày dự đoán.
- Kinh tế: 2.200K/số, nhận 8.000K/hit.
- Chính sách khóa tháng: chơi cho tới khi lợi nhuận lũy kế tháng > 0, sau đó dừng đến đầu tháng kế tiếp.

| Top | Chính sách | Ngày chơi/ngày có sẵn | Tỷ lệ ngày có hit | Profit | ROI | Tháng dương |
|---:|---|---:|---:|---:|---:|---:|
| 6 | fixedDaily | 211/211 | 80.57% | 38,800K | 1.39% | 6/8 |
| 6 | monthlyLockPositive | 33/211 | 81.82% | 68,400K | 15.70% | 8/8 |
| 7 | fixedDaily | 211/211 | 83.89% | 22,600K | 0.70% | 6/8 |
| 7 | monthlyLockPositive | 33/211 | 87.88% | 59,800K | 11.77% | 8/8 |

## Chi tiết khóa lợi nhuận theo tháng

### Top 6

| Tháng | Ngày chơi | Hit days | Profit | ROI |
|---|---:|---:|---:|---:|
| 2026-01 | 1 | 1 | 2,800K | 21.21% |
| 2026-02 | 5 | 5 | 6,000K | 9.09% |
| 2026-03 | 1 | 1 | 2,800K | 21.21% |
| 2026-04 | 1 | 1 | 2,800K | 21.21% |
| 2026-05 | 1 | 1 | 42,800K | 324.24% |
| 2026-06 | 1 | 1 | 2,800K | 21.21% |
| 2026-07 | 22 | 16 | 5,600K | 1.93% |
| 2026-08 | 1 | 1 | 2,800K | 21.21% |

### Top 7

| Tháng | Ngày chơi | Hit days | Profit | ROI |
|---|---:|---:|---:|---:|
| 2026-01 | 1 | 1 | 600K | 3.90% |
| 2026-02 | 5 | 5 | 11,000K | 14.29% |
| 2026-03 | 1 | 1 | 600K | 3.90% |
| 2026-04 | 1 | 1 | 600K | 3.90% |
| 2026-05 | 1 | 1 | 40,600K | 263.64% |
| 2026-06 | 1 | 1 | 600K | 3.90% |
| 2026-07 | 22 | 18 | 5,200K | 1.53% |
| 2026-08 | 1 | 1 | 600K | 3.90% |

## Kết luận kiểm soát

- Việc tất cả tháng dương trên cùng giai đoạn dùng để phát hiện chính sách chỉ là bằng chứng mô tả, chưa phải bảo đảm tương lai.
- Chính sách giảm số ngày chơi mạnh; nó quản trị vốn chứ không làm mô hình dự đoán chính xác hơn.
- Không đưa production trước khi kiểm tra trên ít nhất một năm độc lập chưa dùng để chọn chính sách.
