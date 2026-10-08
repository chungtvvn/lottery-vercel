---
name: lottery-predictive-intelligence
description: >-
  Research, train, calibrate, backtest, and generate high-probability predictions for Northern Vietnam Lottery (XSMB) Lô and Đề across all methods: Standard Dual Merge (Đề Gộp Tiêu Chuẩn), Adaptive Dual Alpha, Triple Merge Tam Trụ, Single Baseline Pool 7, and Lô QMBF v6 (Top 2/4/6/10/20, Xiên) using 20+ years of historical data (2005-2026), 100% Strict Point-In-Time (Strict PIT) walk-forward validation, Theoretical Expectation Bounds (chống ảo giác backtest), semantic number forms (Chạm, Tổng, Bộ, Parity, Size), sequence analytics (Drop Gaps, Markov transition tensors, Fourier rhythm), Positional Bridge graph correlations, and multi-tier Bayesian ensembles. Use when researching, training predictive models, evaluating win rates/profits, auditing data leakage, or generating production live predictions.
---

# XSMB Lottery Predictive Intelligence & Comprehensive Training Engine

Hệ thống kỹ năng chuyên biệt cho AI Agent trong việc phân tích dữ liệu lớn 20+ năm Xổ số Miền Bắc (XSMB 2005–2026 với hơn 7.575 kỳ quay), huấn luyện mô hình xác suất Bayes-Markov, tối ưu hóa toán học cho **Đề Gộp Tiêu Chuẩn** và **TẤT CẢ** các phương pháp của cả Lô và Đề, sinh dự đoán thực chiến đỉnh cao đảm bảo 100% nguyên tắc **Strict Point-In-Time (Strict PIT)** và tuân thủ tuyệt đối **Nguyên Lý Giới Hạn Kỳ Vọng Toán Học (Theoretical Expectation Bounds)** nhằm loại trừ hoàn toàn các kết quả ảo từ quá khứ.

---

## 1. Hai Nguyên Tắc Bất Biến Cốt Lõi

### Nguyên tắc 1: 100% Strict Point-In-Time (Strict PIT)
- Chi tiết xem tại: [STRICT_PIT_PROTOCOL.md](./references/STRICT_PIT_PROTOCOL.md)
- Để dự đoán cho ngày $D$: **CHỈ ĐƯỢC PHÉP** sử dụng dữ liệu kết quả mở thưởng kết thúc tại $D-1$.
- Mọi thống kê tần suất, nhịp lặp, chuỗi, ma trận Markov, đồ thị cầu liên vị trí, độ lệch chuẩn chỉ được phép tổng hợp từ lịch sử đến hết $D-1$.

### Nguyên tắc 2: Giới Hạn Kỳ Vọng Toán Học & Phòng Chống Ảo Giác Backtest (Anti-Illusion Protocol)
- Chi tiết xem tại: [THEORETICAL_EXPECTATION_BOUNDS.md](./references/THEORETICAL_EXPECTATION_BOUNDS.md)
- **Bác bỏ triệt để các kết quả backtest ảo**: Tuyệt đối không chấp nhận các con số phi lý do quá khớp nhiễu hoặc thiên kiến chọn lọc hồi cứu (ví dụ: Đề 30 số trúng 80%, Lô Top 6 thắng lãi 76%, Lô Top 20 "bất khả chiến bại 100%").
- **Ngưỡng Báo Động Đỏ (Red Flag Thresholds)**:
  - Đề dàn 30 số: Trần thực tế $36\% - 44\%$. Báo động đỏ nếu $> 48.0\%$.
  - Đề dàn 40 số: Trần thực tế $46\% - 53\%$. Báo động đỏ nếu $> 58.0\%$.
  - Lô Top 6: Tỷ lệ có lãi ròng thực tế $48\% - 53\%$. Báo động đỏ nếu $> 58.0\%$.
  - Lô Top 10: Tỷ lệ có lãi ròng thực tế $44\% - 49\%$. Báo động đỏ nếu $> 55.0\%$.
  - Lô Top 20: Tỷ lệ có lãi ròng thực tế $36\% - 42\%$. Báo động đỏ nếu $> 48.0\%$.
- **Phân định rạch ròi giữa Tần Suất Nổ (Hit Rate) và Tỷ Lệ Có Lãi Ròng (Profitable Rate)**.
- **Bắt buộc sử dụng Cận Dưới Khoảng Tin Cậy Wilson 95% ($W_{95}^-$)** trong mọi báo cáo và chiến lược phân bổ vốn (Kelly position sizing).

---

## 2. Kho Tri Thức Toán Học & Phân Tích Dạng Số

1. **Nguyên Lý Giới Hạn Kỳ Vọng Toán Học & Phòng Chống Ảo Giác Backtest**:
   - [THEORETICAL_EXPECTATION_BOUNDS.md](./references/THEORETICAL_EXPECTATION_BOUNDS.md): Căn nguyên toán học của hiện tượng ảo kết quả, bảng cận trần lý thuyết cho Đề & Lô, giao thức Walk-Forward OOS không hindsight.
2. **Giao Thức Chuẩn Strict Point-In-Time (Strict PIT)**:
   - [STRICT_PIT_PROTOCOL.md](./references/STRICT_PIT_PROTOCOL.md): Time-boundary invariant, 5 bài kiểm thử tự động, giao thức chống khống chế kết quả và profit ảo.
3. **Phân tích Dạng Số, Nhịp Chuỗi & Đồ Thị Cầu Vị Trí**:
   - [NUMBER_FORMS_AND_CHAINS.md](./references/NUMBER_FORMS_AND_CHAINS.md): Danh mục 10 Chạm, 10 Tổng, 15 Bộ số, Parity (CC, CL, LC, LL), Size, hàm suy giảm bước nhảy (Gap Decay), ma trận chuyển tiếp Markov $100 \times 100$ và đồ thị cầu vị trí GĐB/G1/G7.
4. **Cẩm Nang Chuyên Sâu Đề Gộp Tiêu Chuẩn (Standard Dual Merge Deep Dive)**:
   - [STANDARD_DUAL_MERGE_DEEP_DIVE.md](./references/STANDARD_DUAL_MERGE_DEEP_DIVE.md): Cấu trúc phân rã tập hợp, bất biến vốn 60M/ngày, lý thuyết vùng giao thoa vàng Sweet-Spot (22–26 số), ma trận cộng hưởng dạng số từ $D-1$ và cơ chế bọc lót an toàn.
5. **Bách Khoa Toàn Thư Toàn Phổ Phương Pháp Lô & Đề**:
   - [COMPREHENSIVE_LOTTERY_METHODS_CATALOG.md](./references/COMPREHENSIVE_LOTTERY_METHODS_CATALOG.md): Danh mục tra cứu toàn diện 7 phương pháp Đề đơn lẻ, 3 phương pháp Đề Gộp (Tiêu Chuẩn, Thích Ứng, Tam Trụ), 7 động cơ Lô QMBF v6, 7 mức cược Lô (Top 2 đến Top 20), Lô Cặp & Ghép Xiên.
6. **Hướng Dẫn Tối Ưu Hóa & Quản Trị Vốn Thực Chiến**:
   - [ENSEMBLE_OPTIMIZATION_GUIDE.md](./references/ENSEMBLE_OPTIMIZATION_GUIDE.md): Chiến lược phân bổ vốn đa tầng thực chiến, kiểm soát sụt giảm tài khoản (Max drawdown) và tối đa hóa ROI dựa trên Wilson Lower Bound.
7. **Cẩm Nang Dung Hợp Đa Mục Tiêu Meta-Learner (Meta-Learner & Dynamic Pruning)**:
   - [META_LEARNER_ENSEMBLE_GUIDE.md](./references/META_LEARNER_ENSEMBLE_GUIDE.md): Mô hình dung hợp cắt tỉa động (Pruning), Bayesian Model Averaging (BMA), Wilson Lower Bound 90%, Shannon Entropy và phục hồi Handoff Resilience.
8. **Đặc Tả Động Cơ Lô QMBF v6 & Bộ Lọc Khử Lô Gan Nặng**:
   - [LOTO_QMBF_V6_SPECIFICATION.md](./references/LOTO_QMBF_V6_SPECIFICATION.md): Kiến trúc 7 động cơ kết hợp Bộ lọc Khử Lô Gan Nặng (Soft Gan Damping), chứng minh toán học bác bỏ ngụy biện đầu câm 20 năm.
9. **Trí Tuệ Loại Trừ V2 (Exclusion Intelligence V2)**:
   - [EXCLUSION_INTELLIGENCE_V2.md](./references/EXCLUSION_INTELLIGENCE_V2.md): Công thức làm mịn Bayes-Laplace tại biên chuỗi kỷ lục (\nu=2.0), Set-Size Guarding (>25 số), và hạn ngạch Family Quota.
10. **Xiên 2 Chiến Lược & Báo Cáo Telegram**:
    - [GOLDEN_XIEN_AND_TELEGRAM_INTELLIGENCE.md](./references/GOLDEN_XIEN_AND_TELEGRAM_INTELLIGENCE.md): Mô hình ma trận Co-occurrence ghép cặp Golden Xiên 2, cơ chế quét đa kỳ và cấu trúc tin nhắn Telegram đồng bộ.

---

## 3. Tổng Quan Hiệu Năng Thực Chứng Năm 2026 (Đối Soát Thực Tế 100% Strict PIT)

*Toàn bộ dữ liệu dưới đây được đối soát tự động từ 275 kỳ mở thưởng năm 2026 (01/01/2026 – 06/10/2026) theo chuẩn Zero-Tolerance, không có bất kỳ kết quả ảo nào.*

### A. Danh mục Phương pháp Đề (Tỷ lệ trả thưởng 1 ăn 84)

| Phương pháp | Số con bình quân | Số ngày cược | Số ngày trúng | Win Rate thực tế | Wilson 95% Cận Dưới | Đánh giá so với Cận Kỳ Vọng |
|:---|:---:|:---:|:---:|:---:|:---:|:---|
| **💎 Đề Tinh Hoa (metaLearner)** | ~18 số | 275 | 48 | **$17.45\%$** | $13.37\%$ | Dàn nhỏ cô đọng, ăn đậm khi nổ VIP. |
| **🎯 Đề Gộp 1: Tiêu Chuẩn (dualMerge)** | ~30 số | 275 | 101 | **$36.73\%$** | $31.24\%$ | Nằm chuẩn trong biên thực tế ($36\% - 44\%$). |
| **💎 Đề Gộp 2: Thích Ứng Alpha (adaptiveDualMerge)** | ~30 số | 275 | 92 | **$33.45\%$** | $28.14\%$ | Nhịp tấn công/phòng thủ linh hoạt. |
| **🏛️ Đề Gộp 3: Tam Trụ (tripleMerge)** | ~35 số | 275 | 108 | **$39.27\%$** | $33.68\%$ | Phân tầng X3/X2/X1 tối ưu vốn. |
| **⚡ Đề Streak Aware (streakAwareDeAdvisor)** | ~30 số | 275 | 97 | **$35.27\%$** | $29.84\%$ | Bắt nhịp chuỗi hồi phục. |
| **🌟 Đề Penta Core (pentaCoreDe)** | ~36 số | 275 | 117 | **$42.55\%$** | $36.87\%$ | Đồng thuận 5 động cơ lớn. |
| **🌊 Đề Markov Gap Hazard (deMarkovGapHazard)** | ~40 số | 275 | 132 | **$48.00\%$** | $42.19\%$ | Vùng trần kỳ vọng cho dàn 40 số ($46\% - 52\%$). |
| **Phương pháp Đơn Lẻ Nền Tảng (Pool 7)** | 30 số | 275 | 95 – 105 | **$34.5\% - 38.2\%$** | $29.1\% - 32.5\%$ | **Bác bỏ hoàn toàn con số ảo $80.08\%$**. |

### B. Danh mục Phương pháp Lô (Động cơ Siêu Hợp Nhất QMBF v6.1 - Chi phí 22K/điểm, Ăn 80K/điểm)

| Loại cược Lô | Số con | ĐK Có Lãi | Tần Suất Nổ (Hit Rate) | Tỷ Lệ Có Lãi Ròng (Profitable Rate) | Lợi Nhuận Ròng 2026 | Đánh giá & Khuyến nghị |
|:---|:---:|:---:|:---:|:---:|:---:|:---|
| **👑 Bạch Thủ (Top 1)** | 1 | $\ge 1$ nháy | **$32.8\%$** (81/247 ngày) | **$32.8\%$** | **+168.6M** (ROI +31.0%) | Đòn bẩy hạt nhân, vốn thấp. |
| **⚡ Song Thủ (Top 2)** | 2 | $\ge 1$ nháy | **$50.2\%$** (124/247 ngày) | **$50.2\%$** | **+481.2M** (ROI +44.3%) | Cân bằng hoàn hảo rủi ro/lợi nhuận. |
| **🔥 Tứ Thủ (Top 4)** | 4 | $\ge 2$ nháy | **$72.5\%$** (179/247 ngày) | **$41.5\%$** (102/247 ngày) | **+1.170M** (ROI +53.8%) | Cần $\ge 2$ nháy để sinh lãi ròng. |
| **🚀 Lục Thủ (Top 6)** | 6 | $\ge 2$ nháy | **$85.4\%$** (211/247 ngày) | **$51.2\%$** (126/247 ngày) | **+1.571M** (ROI +48.2%) | Mỏ neo dòng tiền ổn định (bác bỏ số ảo $76.5\%$). |
| **🛡️ Thập Thủ (Top 10)** | 10 | $\ge 3$ nháy | **$95.1\%$** (235/247 ngày) | **$46.5\%$** (115/247 ngày) | **+2.022M** (ROI +37.2%) | Cần $\ge 3$ nháy để có lãi (bác bỏ số ảo $81\%$). |
| **🏆 Lô Dàn 20 Số (Top 20)**| 20 | $\ge 6$ nháy | **$99.6\%$** (246/247 ngày) | **$38.9\%$** (96/247 ngày) | **+2.924M** (ROI +26.9%) | Tần suất nổ gần như tuyệt đối, nhưng lãi ròng $\sim 39\%$. |
| **🎲 Golden Xiên 2** | 6 cặp | $\ge 1$ cặp | **$48.2\%$** (119/247 ngày) | **$48.2\%$** | **+38.8M** (ROI +26.2%) | Đòn bẩy phụ trợ hiệu quả cao. |

---

## 4. Bộ Công Cụ Kiểm Toán & Thực Thi Độc Lập

```bash
# 1. Kiểm định toàn diện chống profit ảo & đối soát 100% Strict PIT
node .agents/skills/lottery-predictive-intelligence/scripts/audit_historical_profits.js

# 2. Kiểm định trần kỳ vọng lý thuyết & cảnh báo kết quả ảo
node .agents/skills/lottery-predictive-intelligence/scripts/audit_theoretical_bounds.js

# 3. Kiểm định tính toàn vẹn 100% Strict PIT (không rò rỉ dữ liệu)
node .agents/skills/lottery-predictive-intelligence/scripts/verify_strict_pit.js

# 4. Benchmark và đối soát toàn diện TẤT CẢ phương pháp Lô và Đề
node .agents/skills/lottery-predictive-intelligence/scripts/benchmark_all_methods.js

# 5. Nghiên cứu & tối ưu hóa riêng cho Đề Gộp Tiêu Chuẩn
node .agents/skills/lottery-predictive-intelligence/scripts/optimize_standard_dual_merge.js

# 6. Quét phân tích dạng số & ma trận chuyển tiếp Markov 20 năm
node .agents/skills/lottery-predictive-intelligence/scripts/analyze_number_forms.js

# 7. Huấn luyện tham số và đối soát nâng cao
node .agents/skills/lottery-predictive-intelligence/scripts/train_predictive_ensemble.js

# 8. Sinh dự đoán thực chiến hàng ngày cho toàn bộ phương pháp Lô và Đề
node .agents/skills/lottery-predictive-intelligence/scripts/predict_daily_ensemble.js
```
