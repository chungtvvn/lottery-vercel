# Kiểm tra Lô RRF Top 20/25/30 - 01/08/2026

## Phạm vi và phương pháp

- Phương pháp: `rrfParallelBlock85Small65` (Chuỗi nhỏ Hold 65 + Nhịp block Hold 85, RRF 50/50).
- Kinh tế: 2.200K mỗi số, nhận 8.000K cho mỗi hit.
- Dữ liệu nguồn cố định từ R2: 01/10/2005 đến 31/07/2026.
- Baseline năm 2026 chốt tại 31/12/2025.
- Mỗi dự đoán tái sinh thống kê từ prefix kết thúc tại D-1 cho từng vị trí trong 27 vị trí.
- Do chi phí tính toán lớn, kiểm định từ đầu năm là mẫu cố định 8/208 ngày quay (`dateStep=30`), phủ 01/01/2026 đến 31/07/2026. Đây không phải backtest đủ từng ngày.

## Backtest PIT lấy mẫu từ đầu năm

| Dàn | Ngày | Ngày lãi | Tổng hit | TB hit/ngày | Hòa vốn hit/ngày | Vốn | Profit | ROI |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Top 20 | 8 | 3 | 40 | 5,000 | 5,500 | 352.000K | -32.000K | -9,09% |
| Top 25 | 8 | 4 | 51 | 6,375 | 6,875 | 440.000K | -32.000K | -7,27% |
| Top 30 | 8 | 4 | 63 | 7,875 | 8,250 | 528.000K | -24.000K | -4,55% |

Kỳ vọng ngẫu nhiên lần lượt là 5,4; 6,75; 8,1 hit/ngày. Trên mẫu PIT này, cả ba dàn đều thấp hơn kỳ vọng ngẫu nhiên và thấp hơn điểm hòa vốn.

## Snapshot thực tế bất biến trên R2

Cache sinh lúc 31/07/2026, các dàn Top 20/25/30 mới được theo dõi đủ trong 10 ngày:

| Dàn | Ngày | Ngày lãi | Tổng hit | TB hit/ngày | Vốn | Profit | ROI |
|---|---:|---:|---:|---:|---:|---:|---:|
| Top 20 | 10 | 7 | 66 | 6,60 | 440.000K | +88.000K | +20,00% |
| Top 25 | 10 | 9 | 80 | 8,00 | 550.000K | +90.000K | +16,36% |
| Top 30 | 10 | 5 | 87 | 8,70 | 660.000K | +36.000K | +5,45% |

## Kết luận

- Hệ thống production đã sinh, lưu và hiển thị đủ Top 20/25/30; không cần bổ sung cấu hình theo dõi.
- Top 25 đang có profit thực tế cao nhất, nhưng chỉ mới 10 ngày và không được PIT mẫu từ đầu năm xác nhận.
- Top 30 ít âm nhất trong mẫu PIT nhưng ROI thực tế thấp nhất trong ba dàn.
- Chưa đủ bằng chứng để đổi mặc định từ Top 6/7 sang Top 20/25/30. Cần tiếp tục giữ snapshot hằng ngày và đánh giá lại khi đạt ít nhất 60-90 ngày thực tế.

## File đối chiếu

- Backtest PIT: `reports/backtest_loto_milestone20y_2026-07-31T18-18-46.json`
- Cache R2: `statistics/cached_loto_live_predictions.json.gz`, sinh 31/07/2026.
