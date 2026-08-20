# Backtest strict PIT - Active Edge có kiểm chứng

## Thiết lập

- Khoảng kiểm tra: `01/01/2026` đến `14/07/2026`, 191 ngày có kết quả.
- Baseline năm: chốt `31/12/2025`, dùng cửa sổ 20 năm.
- Trạng thái ngày D: tái sinh từ raw prefix kết thúc ở D-1.
- Hold 70, đánh 30 số/ngày, 1.000K/số, trúng nhận 84 lần.
- Report nguồn: `research_true_pit_strategies_2026-07-15T07-36-02-752Z.json`.
- Fingerprint run: `26b4cd797121ecae9cd53cde3538d14f088322dd135c785e2023fc88a3eeda34`.

## Phương pháp thử nghiệm

`numberReliableActiveEdge` chỉ dùng chuỗi đang diễn ra:

1. Bỏ potential chưa có bảng daily replay.
2. Bỏ Nhịp Block vì count hiện tại chỉ đại diện block hoàn tất, không phải mọi lần chuyển ngày.
3. Bỏ họ `number` và `class` do edge strict PIT cấp họ âm/không ổn định.
4. Với chuyển tiếp hợp lệ dưới kỷ lục, co xác suất gãy về xác suất nền của tập số, kết hợp posterior với cận Wilson và độ tin cậy cỡ mẫu.
5. Siêu kỷ lục và pattern active chưa từng tồn tại chỉ nhận bonus nhỏ có trần, không dùng raw 100%.
6. Khử trùng theo `họ + tập số`, giữ bằng chứng mạnh nhất mỗi họ và cộng giảm dần tối đa 5 họ.

## Kết quả

| Phương pháp | Trúng | Tỷ lệ | Profit | ROI | Thua dài nhất | Tháng dương |
|---|---:|---:|---:|---:|---:|---:|
| Chuỗi nhỏ trước | 68/191 | 35,60% | -18.000K | -0,31% | 9 | 2/7 |
| Likelihood ratio | 67/191 | 35,08% | -102.000K | -1,78% | 13 | 3/7 |
| Posterior đa dạng | 65/191 | 34,03% | -270.000K | -4,71% | 9 | 3/7 |
| **Active Edge có kiểm chứng** | **62/191** | **32,46%** | **-522.000K** | **-9,11%** | **10** | **2/7** |
| Nhịp Block trước | 56/191 | 29,32% | -1.026.000K | -17,91% | 14 | 2/7 |
| Rủi ro năm đã hiệu chỉnh | 52/191 | 27,23% | -1.362.000K | -23,77% | 12 | 2/7 |

So với Chuỗi nhỏ trước, phương pháp mới giảm 6 ngày trúng, giảm 3,14 điểm phần trăm hit rate, giảm 504.000K profit và tăng chuỗi thua dài nhất thêm 1 ngày.

## Theo tháng của phương pháp mới

| Tháng | Trúng/ngày | Tỷ lệ | Profit | ROI |
|---|---:|---:|---:|---:|
| 2026-01 | 8/31 | 25,81% | -258.000K | -27,74% |
| 2026-02 | 11/24 | 45,83% | +204.000K | +28,33% |
| 2026-03 | 11/31 | 35,48% | -6.000K | -0,65% |
| 2026-04 | 11/30 | 36,67% | +24.000K | +2,67% |
| 2026-05 | 8/31 | 25,81% | -258.000K | -27,74% |
| 2026-06 | 9/30 | 30,00% | -144.000K | -16,00% |
| 2026-07 | 4/14 | 28,57% | -84.000K | -20,00% |

## Kết luận

Phương pháp bị bác bỏ, không thay mặc định và không cần chạy mở rộng toàn bộ 2024-2025. Việc chỉ giữ bằng chứng active có edge lịch sử hợp lệ làm mất độ phủ và không tạo được thứ hạng từng số tốt hơn Chuỗi nhỏ. Edge tốt ở cấp cohort không tự động chuyển thành edge tốt khi cộng membership lên 100 số.

Bước tiếp theo hợp lệ không phải tăng bonus, mà là sinh bảng daily replay cho potential và Nhịp Block, sau đó huấn luyện trọng số cohort trên các năm trước và giữ một năm hoàn toàn chưa dùng để chọn tham số làm holdout.
