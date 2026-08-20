# Nghiên cứu survival Bayes và mô phỏng tương lai cho chuỗi XSMB

## Mục tiêu

Kết hợp episode chuỗi thật từ 2006 với daily replay strict point-in-time để kiểm tra liệu một mô hình xác suất hiện đại có cải thiện dàn Đề Hold 70 hay không.

Phương pháp được dùng là **survival analysis phân cấp Beta-Binomial** kết hợp **posterior predictive Monte Carlo**. Đây là một cách tiếp cận chuẩn để làm trơn xác suất của nhóm ít mẫu, đo khoảng bất định và tránh coi tỷ lệ 100% từ vài mẫu là chắc chắn.

## Kỷ luật dữ liệu

- Survival prior chỉ đọc episode kết thúc từ `01/01/2006` đến `31/12/2023`.
- Daily replay 2024 được dùng để học calibration theo ngày.
- Cuối 2024 và toàn bộ 2025 được dùng chọn trọng số trước khi mở holdout.
- 2026 (`01/01/2026` đến `14/07/2026`) là holdout khóa, không tham gia chọn cấu hình.
- Chuỗi tiềm năng không được suy diễn từ episode đã hình thành; formation cần bảng cơ hội theo từng ngày.
- Nhịp block bị loại khỏi survival prior vì file streak chỉ lưu block hoàn tất, không lưu đầy đủ mọi transition từng ngày.
- Monte Carlo chỉ đo bất định của posterior; mẫu giả không được cộng vào cỡ mẫu lịch sử.

## Dữ liệu đã học

| Chỉ số | Giá trị |
|---|---:|
| Pattern đã quét | 61.656 |
| Pattern có transition hợp lệ | 33.224 |
| Episode thật | 2.958.799 |
| Transition độ dài | 52.823 |
| Family | 25 |
| Nhóm family/pattern | 106 |
| Nhịp block loại khỏi survival prior | 9.702 |
| Posterior draws mỗi nhóm | 20.000 |
| Cơ hội tương lai mô phỏng mỗi draw | 100 |

Tổng phép thử predictive tương đương khoảng **212 triệu kết quả chuyển tiếp mô phỏng** (`106 × 20.000 × 100`). Con số này chỉ làm khoảng xác suất ổn định hơn, không tạo thêm bằng chứng thật.

## Ví dụ posterior

| Nhóm | Mean gãy | Q10 | Khoảng predictive 90%/100 cơ hội |
|---|---:|---:|---:|
| Hiệu - Lùi | 96,53% | 96,18% | 93%–99% |
| Tổng - Lùi | 96,85% | 96,70% | 94%–99% |
| Đầu - Tiến | 96,35% | 96,00% | 93%–99% |
| Tổng - So le theo cặp | 56,92% | 53,63% | 48%–66% |
| Đít - So le theo cặp | 58,94% | 54,52% | 49%–69% |

Các con số trên là xác suất **chuỗi không tiếp tục ở cấp nhóm**, không phải xác suất loại đúng của từng số. Vì một số có thể đồng thời thuộc nhiều chuỗi và các tập số có độ rộng khác nhau, không được dùng trực tiếp `96%` làm xác suất loại số đó.

## Lựa chọn trước holdout

Các trọng số survival đã thử: `0`, `0,35`, `0,70`, `1,05`, `1,40`, `1,80`. Tất cả tạo cùng dàn số trên hai fold lựa chọn.

| Giai đoạn | Chuỗi nhỏ Hold 70 | Calibration + survival | Chênh ngày trúng | Chênh profit |
|---|---:|---:|---:|---:|
| Cuối 2024 | 37/121 | 40/121 | +3 | +252.000K |
| 2025 | 99/361 | 100/361 | +1 | +84.000K |

Trọng số survival được chọn là `0`. Điều này có nghĩa phần cải thiện trên đến từ daily calibration đã có, không phải từ survival prior 2006–2023.

## Holdout 2026

| Phương pháp | Trúng | Tỷ lệ | Profit | ROI | Chuỗi thua dài nhất |
|---|---:|---:|---:|---:|---:|
| Chuỗi nhỏ Hold 70 | 68/191 | 35,60% | -18.000K | -0,31% | 9 |
| Hierarchical daily calibration | 74/191 | 38,74% | +486.000K | 8,48% | 9 |

- Chênh lệch: `+6` ngày trúng và `+504.000K`.
- Candidate-only: `7` ngày; baseline-only: `1` ngày.
- McNemar exact hai phía: `p = 0,0703125`.
- Wilson 95% candidate: `32,12%–45,81%`.
- Wilson 95% baseline: `29,16%–42,62%`.

## Kết luận

Kết quả 2026 tốt hơn về hit và profit nhưng **chưa đạt ngưỡng bằng chứng mạnh `p < 0,05`**, hai khoảng Wilson còn chồng lấn, và 2024–2025 vẫn dưới điểm hòa vốn. Vì vậy:

1. Không thay production bằng phương pháp này.
2. Không tuyên bố mô phỏng tương lai làm xác suất chính xác hơn nhiều.
3. Giữ daily hierarchical calibration ở trạng thái research-only để thu thêm snapshot live bất biến.
4. Bước nghiên cứu có giá trị nhất tiếp theo là sinh bảng **daily opportunity 2006–2023** cho chuỗi tiềm năng và thêm **bucket độ dài hiện tại** vào `numberEvidence`. Hai trường này mới cho phép phân biệt khả năng hình thành/tiếp tục của từng trạng thái, thay vì chỉ dùng tỷ lệ gãy gộp cấp family/pattern.

## File tái lập

- Mô hình: `lib/research/historicalChainSurvivalPrior.js`
- Bộ hiệu chỉnh: `lib/research/hierarchicalChainCalibrator.js`
- Runner: `scripts/research-historical-chain-survival.js`
- Test: `scripts/test-historical-chain-survival-prior.js`
- Kết quả JSON: `reports/research_historical_chain_survival_2026-07-16T16-11-21-463Z.json`
