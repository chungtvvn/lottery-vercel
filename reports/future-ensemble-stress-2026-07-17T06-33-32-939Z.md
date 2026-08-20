# Ensemble giao/không giao và stress test tương lai

## Quy trình chống leak

- 2016–2020: xếp hạng pool và train softmax.
- 2021–2023: fit-evaluation.
- 2024–2025: validation và chọn cấu hình.
- 2026: holdout khóa, không dùng để chọn.
- Mọi cấu hình cùng Top K được so với cùng Top K; 1.000K/số, ăn 84.

Pool: activeOnlyAvgRisk, chainBlockFirst, numberLikelihoodRatio, chainFreqFirst, dedupEdge50Hold, chainSmallFirst.

## Phương án được chọn trước holdout

### Top 10: `softmax-top10__activeOnlyAvgRisk+chainBlockFirst+numberLikelihoodRatio+chainFreqFirst__l2-1`

| Giai đoạn | Trúng | Tỷ lệ | Profit | ROI | Thua dài nhất |
|---|---:|---:|---:|---:|---:|
| Fit 2021–2023 | 122/1083 | 11.27% | -582.000K | -5.37% | 47 |
| Validation 2024–2025 | 83/723 | 11.48% | -258.000K | -3.57% | 41 |
| Holdout 2026 | 22/187 | 11.76% | -22.000K | -1.18% | 29 |

### Top 20: `exclusive-top20__numberLikelihoodRatio+dedupEdge50Hold`

| Giai đoạn | Trúng | Tỷ lệ | Profit | ROI | Thua dài nhất |
|---|---:|---:|---:|---:|---:|
| Fit 2021–2023 | 250/1083 | 23.08% | -660.000K | -3.05% | 23 |
| Validation 2024–2025 | 157/723 | 21.72% | -1.272.000K | -8.80% | 33 |
| Holdout 2026 | 45/187 | 24.06% | 40.000K | 1.07% | 18 |

### Top 30: `exclusive-top30__numberLikelihoodRatio+chainFreqFirst+dedupEdge50Hold`

| Giai đoạn | Trúng | Tỷ lệ | Profit | ROI | Thua dài nhất |
|---|---:|---:|---:|---:|---:|
| Fit 2021–2023 | 355/1083 | 32.78% | -2.670.000K | -8.22% | 15 |
| Validation 2024–2025 | 232/723 | 32.09% | -2.202.000K | -10.15% | 15 |
| Holdout 2026 | 57/187 | 30.48% | -822.000K | -14.65% | 15 |

### Top 40: `exclusive-top40__numberLikelihoodRatio+chainFreqFirst+dedupEdge50Hold`

| Giai đoạn | Trúng | Tỷ lệ | Profit | ROI | Thua dài nhất |
|---|---:|---:|---:|---:|---:|
| Fit 2021–2023 | 470/1083 | 43.40% | -3.840.000K | -8.86% | 14 |
| Validation 2024–2025 | 309/723 | 42.74% | -2.964.000K | -10.25% | 10 |
| Holdout 2026 | 75/187 | 40.11% | -1.180.000K | -15.78% | 15 |

## Giao và không giao của Top 30

Trong holdout, ít nhất một phương pháp trong pool giữ đúng kết quả ở 119/187 ngày (63.64%).
Kết quả chỉ được đúng đúng một phương pháp giữ ở 70 ngày (37.43%); tất cả phương pháp cùng giữ ở 13 ngày (6.95%).

Oracle chỉ là trần thông tin sau khi biết kết quả; không phải phương pháp có thể sử dụng thực tế.

## Stress test Top 30 đã khóa

| Kiểm tra | P có lãi | P05 | Median | P95 | Drawdown P95 |
|---|---:|---:|---:|---:|---:|
| Block bootstrap 365 ngày từ validation | 4.12% | -2.214.000K | -1.122.000K | -30.000K | 2.400.000K |
| Block bootstrap 365 ngày từ holdout | 0.76% | -2.802.000K | -1.626.000K | -450.000K | 2.958.000K |

### Dịch chuyển xác suất bất lợi

| Giảm hit giả định | Hit dùng mô phỏng | P có lãi | P05 | Median |
|---:|---:|---:|---:|---:|
| 0.00% | 30.48% | 1.44% | -2.802.000K | -1.626.000K |
| 1.00% | 29.48% | 0.45% | -3.138.000K | -1.962.000K |
| 2.00% | 28.48% | 0.14% | -3.390.000K | -2.214.000K |
| 3.00% | 27.48% | 0.02% | -3.726.000K | -2.550.000K |

## Kết luận

Kiểm định best-of-many Top 30: xác suất null vẫn tạo cấu hình đạt ít nhất 73 hit là 24.52%; P95 của best null là 77 hit.

Không có bằng chứng đủ bền để thay production: phương án tốt nhất trước holdout không duy trì đồng thời profit dương và xác suất stress cao qua các chế độ.

> Stress test đo độ nhạy vốn dưới các giả định; nó không tạo thêm bằng chứng dự báo và không bảo đảm lợi nhuận tương lai.
