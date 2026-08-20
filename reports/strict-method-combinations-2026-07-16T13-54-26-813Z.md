# Nghiên cứu gộp phương pháp strict PIT

- Sinh lúc: 2026-07-16T13:54:26.815Z
- Quy trình: 2016-2023 fit/sàng; 2024-2025 validation/chọn; 2026 holdout khóa, không dùng để chọn.
- Kinh tế: mỗi đơn vị 1000K, trúng nhận x84.
- Đã thử 1,674 cấu hình; 975 cấu hình qua điều kiện dàn trung bình <= 65 số và đánh đủ mỗi ngày.

## Cấu hình được chọn trước khi mở holdout 2026

- ID: `vote2of2__dedupEdge50Hold+chainSmallFirst`
- Nguồn: dedupEdge50Hold, chainSmallFirst
- Chọn số có ít nhất 2/2 phiếu.

| Giai đoạn | Ngày | Trúng | Tỷ lệ | TB số | TB đơn vị | Profit | ROI | Thua dài nhất |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Fit 2016-2023 | 2868 | 301 | 10.50% | 10.08 | 10.08 | -3,626,000K | -12.54% | 53 |
| Validation 2024-2025 | 723 | 59 | 8.16% | 9.47 | 9.47 | -1,893,000K | -27.64% | 43 |
| Holdout 2026 | 187 | 25 | 13.37% | 9.24 | 9.24 | 372,000K | 21.53% | 15 |

## Kết luận kiểm định

- Không đạt điều kiện dương đồng thời ở fit, validation và holdout; chưa đủ cơ sở thay phương pháp production.
- Bảng “top holdout” trong JSON chỉ dùng chẩn đoán, tuyệt đối không dùng để chọn phương pháp vì sẽ gây overfit 2026.
- `chainRiskFirst` bị loại khỏi pool vì tạo dàn giống hệt `chainFreqFirst` trong tập strict PIT.

## Chốt theo toàn bộ dữ liệu đến 31/12/2025

- ID: `vote3of4__activeOnlyAvgRisk+chainBlockFirst+numberLikelihoodRatio+chainSmallFirst`
- 2016-2025: 530/3591 ngày trúng, profit -5,793,000K, ROI -11.51%.
- Holdout 2026: 39/187 ngày trúng, profit 292,000K, ROI 9.79%.

## Top 10 trên fit (chưa phải kết luận)

| ID | Profit | ROI | Tỷ lệ | TB số | Năm lãi |
|---|---:|---:|---:|---:|---:|
| `vote2of2__dedupEdge50Hold+chainSmallFirst` | -3,626,000K | -12.54% | 10.50% | 10.08 | 1/8 |
| `vote3of4__activeOnlyAvgRisk+chainBlockFirst+numberLikelihoodRatio+chainSmallFirst` | -4,074,000K | -10.31% | 14.71% | 13.78 | 1/8 |
| `vote3of4-double4__activeOnlyAvgRisk+chainBlockFirst+numberLikelihoodRatio+chainSmallFirst` | -4,370,000K | -9.26% | 14.71% | 13.78 | 1/8 |
| `vote3of4__activeOnlyAvgRisk+numberLikelihoodRatio+dedupEdge50Hold+chainSmallFirst` | -4,837,000K | -13.53% | 12.83% | 12.46 | 1/8 |
| `vote3of4__activeOnlyAvgRisk+chainCredibleFirst+dedupEdge50Hold+chainSmallFirst` | -4,975,000K | -13.83% | 12.87% | 12.54 | 2/8 |
| `vote3of4__activeOnlyAvgRisk+chainBlockFirst+numberPosteriorDiversity+chainCredibleFirst` | -5,079,000K | -11.06% | 16.95% | 16.01 | 1/8 |
| `vote3of4__activeOnlyAvgRisk+chainFreqFirst+chainCredibleFirst+chainSmallFirst` | -5,063,000K | -13.91% | 13.01% | 12.69 | 1/8 |
| `vote4of6__activeOnlyAvgRisk+chainBlockFirst+numberLikelihoodRatio+chainCredibleFirst+dedupEdge50Hold+chainSmallFirst` | -5,085,000K | -11.26% | 16.63% | 15.74 | 1/8 |
| `vote4of6__activeOnlyAvgRisk+numberLikelihoodRatio+chainFreqFirst+chainCredibleFirst+dedupEdge50Hold+chainSmallFirst` | -5,302,000K | -13.04% | 14.68% | 14.18 | 1/8 |
| `vote3of4-double4__activeOnlyAvgRisk+numberLikelihoodRatio+dedupEdge50Hold+chainSmallFirst` | -5,313,000K | -12.52% | 12.83% | 12.46 | 2/8 |
