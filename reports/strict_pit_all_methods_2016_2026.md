# Audit Strict PIT toàn bộ phương pháp 2016–2026

- Fast history bị loại khỏi ranking và không được dùng để chọn phương pháp.
- Đề cố định: Hold 70, đánh 30 số, 1.000K/số, ăn 84; hòa vốn lý thuyết 35,71%.
- Mỗi report được kiểm tra actual theo raw snapshot, trùng ngày, duplicate số và số lượng dàn.
- Raw snapshot: /tmp/xsmb-r2-current.json; 7487 ngày, 2005-10-01 -> 2026-07-10.

## 2016-2025

| Phương pháp | Hit | Profit | ROI | Năm dương/ tổng | Thua dài nhất | Tháng dương/ tổng |
|---|---:|---:|---:|---:|---:|---:|
| activeOnlyAvgRisk | 1125/3591 (31.33%) | -13.230.000K | -12.28% | 1/10 | 19 | 38/120 |
| chainBlockFirst | 1116/3591 (31.08%) | -13.986.000K | -12.98% | 0/10 | 19 | 27/119 |
| chainFreqFirst | 1093/3591 (30.44%) | -15.918.000K | -14.78% | 0/10 | 17 | 29/119 |
| chainRiskFirst | 1093/3591 (30.44%) | -15.918.000K | -14.78% | 0/10 | 17 | 29/119 |
| numberLikelihoodRatio | 1081/3591 (30.10%) | -16.926.000K | -15.71% | 0/10 | 22 | 24/119 |
| numberConsensusRisk | 1065/3591 (29.66%) | -18.270.000K | -16.96% | 0/10 | 24 | 25/119 |
| chainCredibleFirst | 1064/3591 (29.63%) | -18.354.000K | -17.04% | 1/10 | 18 | 26/120 |
| dedupEdge50Hold | 1062/3591 (29.57%) | -18.522.000K | -17.19% | 0/10 | 26 | 26/119 |
| numberAvgRisk | 1058/3591 (29.46%) | -18.858.000K | -17.50% | 0/10 | 17 | 25/120 |
| numberPosteriorDiversity | 1057/3591 (29.43%) | -18.942.000K | -17.58% | 0/10 | 18 | 23/119 |
| numberWeightedRisk | 1054/3591 (29.35%) | -19.194.000K | -17.82% | 0/10 | 21 | 21/120 |
| chainSmallFirst | 1053/3591 (29.32%) | -19.278.000K | -17.89% | 0/10 | 19 | 23/119 |
| dedupEdge50CombinedB40S05 | 1050/3591 (29.24%) | -19.530.000K | -18.13% | 0/10 | 26 | 22/120 |

## 2026-to-date

| Phương pháp | Hit | Profit | ROI | Năm dương/ tổng | Thua dài nhất | Tháng dương/ tổng |
|---|---:|---:|---:|---:|---:|---:|
| chainSmallFirst | 68/187 (36.36%) | +102.000K | 1.82% | 1/1 | 9 | 2/7 |
| chainCredibleFirst | 67/187 (35.83%) | +18.000K | 0.32% | 1/1 | 8 | 3/7 |
| numberAvgRisk | 67/187 (35.83%) | +18.000K | 0.32% | 1/1 | 9 | 4/7 |
| numberConsensusRisk | 66/187 (35.29%) | -66.000K | -1.18% | 0/1 | 9 | 4/7 |
| numberLikelihoodRatio | 66/187 (35.29%) | -66.000K | -1.18% | 0/1 | 13 | 3/7 |
| numberPosteriorDiversity | 65/187 (34.76%) | -150.000K | -2.67% | 0/1 | 9 | 3/7 |
| numberWeightedRisk | 65/187 (34.76%) | -150.000K | -2.67% | 0/1 | 10 | 3/7 |
| dedupEdge50Hold | 62/187 (33.16%) | -402.000K | -7.17% | 0/1 | 11 | 2/7 |
| activeOnlyAvgRisk | 61/187 (32.62%) | -486.000K | -8.66% | 0/1 | 7 | 2/7 |
| dedupEdge50CombinedB40S05 | 59/187 (31.55%) | -654.000K | -11.66% | 0/1 | 12 | 2/7 |
| chainBlockFirst | 56/187 (29.95%) | -906.000K | -16.15% | 0/1 | 14 | 2/7 |
| chainFreqFirst | 53/187 (28.34%) | -1.158.000K | -20.64% | 0/1 | 12 | 1/7 |
| chainRiskFirst | 52/187 (27.81%) | -1.242.000K | -22.14% | 0/1 | 12 | 1/7 |

## Đề Song Song

- Báo cáo này dùng simulationService với strict PIT mặc định và settle riêng số giao nhau x2; phạm vi 2026 của source kết thúc 2026-07-09.
- 2016–2025: 2294/3591 (63.88%), profit +79.422.000K, ROI 44.23%, thua dài nhất 8.
- 2026 source đến 09/07: 127/186 (68.28%), profit +5.820.000K, ROI 62.58%, thua dài nhất 4.

## Kết luận

- Phương pháp tốt nhất theo profit strict ở 2016–2025 trong nhóm cố định: **activeOnlyAvgRisk**, nhưng vẫn âm -13.230.000K; không đủ điều kiện coi là tốt để triển khai độc lập.
- Phương pháp tốt nhất theo profit strict ở 2026 đến 10/07 trong nhóm cố định: **chainSmallFirst**, nhưng chỉ là holdout ngắn và profit +102.000K; không đủ để thay mặc định.
- Phương án có lợi nhuận dương ở cả hai giai đoạn là **Đề Song Song Block 85 + Chuỗi nhỏ 65, Hold 70**, với số giao nhau được tính 2 đơn vị; đây là ứng viên tốt nhất hiện có sau khi bỏ fast history.
- Lô: các report fast bị loại; report Lô strict hiện có quá ngắn để xếp hạng. Không được dùng profit fast cũ để kết luận hoặc đổi mặc định.
- Đây là bằng chứng lịch sử, không phải bảo đảm lợi nhuận tương lai.