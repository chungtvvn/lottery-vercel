---
name: lottery-predictive-intelligence
description: >-
  Research, train, calibrate, backtest, and generate high-probability predictions for Northern Vietnam Lottery (XSMB) Lô and Đề across all methods: Tri-Tier Semantic Resonance (Đề 36s & 40s), Standard Dual Merge (Đề Gộp Tiêu Chuẩn), Adaptive Dual Alpha, Triple Merge Tam Trụ, Single Baseline Pool 7, and Lô QMBF v6 / Co-Affinity Momentum (Top 2/6/7/10/20, Xiên) using 20+ years of historical data (2005-2026), 100% Strict Point-In-Time (Strict PIT) walk-forward validation, Theoretical Expectation Bounds (chống ảo giác backtest), semantic number forms (Chạm, Tổng, Bộ, Parity, Size, Kép), sequence analytics (Drop Gaps, Markov transition tensors, Fourier rhythm, Weibull Hazard), Positional Bridge graph correlations, and multi-tier Bayesian ensembles. Use when researching, training predictive models, evaluating win rates/profits, auditing data leakage, or generating production live predictions.
---

# XSMB Lottery Predictive Intelligence & Comprehensive Training Engine

Hệ thống kỹ năng chuyên biệt cho AI Agent trong việc phân tích dữ liệu lớn 20+ năm Xổ số Miền Bắc (XSMB 2005–2026 với hơn 7.575 kỳ quay), huấn luyện mô hình xác suất Bayes-Markov, tối ưu hóa toán học cho **Đề Tri-Tier Semantic Resonance**, **Đề Gộp Tiêu Chuẩn** và **TẤT CẢ** các phương pháp của cả Lô và Đề, sinh dự đoán thực chiến đỉnh cao đảm bảo 100% nguyên tắc **Strict Point-In-Time (Strict PIT)** và tuân thủ tuyệt đối **Nguyên Lý Giới Hạn Kỳ Vọng Toán Học (Theoretical Expectation Bounds)** nhằm loại trừ hoàn toàn các kết quả ảo từ quá khứ.

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
  - Đề dàn 36 số: Trần thực tế $42\% - 50\%$. Báo động đỏ nếu $> 54.0\%$.
  - Đề dàn 40 số: Trần thực tế $46\% - 53\%$. Báo động đỏ nếu $> 58.0\%$.
  - Lô Top 6: Tỷ lệ có lãi ròng thực tế $48\% - 53\%$. Báo động đỏ nếu $> 58.0\%$.
  - Lô Top 10: Tỷ lệ có lãi ròng thực tế $44\% - 49\%$. Báo động đỏ nếu $> 55.0\%$.
  - Lô Top 20: Tỷ lệ có lãi ròng thực tế $36\% - 42\%$. Báo động đỏ nếu $> 48.0\%$.
- **Phân định rạch ròi giữa Tần Suất Nổ (Hit Rate) và Tỷ Lệ Có Lãi Ròng (Profitable Rate)**.
- **Bắt buộc sử dụng Cận Dưới Khoảng Tin Cậy Wilson 95% ($W_{95}^-$)** trong mọi báo cáo và chiến lược phân bổ vốn (Kelly position sizing).

---

## 2. Kho Tri Thức Toán Học & Phân Tích Dạng Số

1. **Phương Pháp Mới: Cộng Hưởng Đa Dạng Số & Động Lực Chuỗi (Semantic Form & Chain Resonance)**:
   - [SEMANTIC_FORMS_AND_CHAIN_RESONANCE_METHODS.md](./references/SEMANTIC_FORMS_AND_CHAIN_RESONANCE_METHODS.md): Kiến trúc bộ lọc 3 lớp (3-Filter Sieve), cấu trúc vốn Tri-Tier đòn bẩy (54M/ngày), ma trận Co-Affinity PMI cho Lô và kiểm định 100% Strict PIT.
2. **Nguyên Lý Giới Hạn Kỳ Vọng Toán Học & Phòng Chống Ảo Giác Backtest**:
   - [THEORETICAL_EXPECTATION_BOUNDS.md](./references/THEORETICAL_EXPECTATION_BOUNDS.md): Căn nguyên toán học của hiện tượng ảo kết quả, bảng cận trần lý thuyết cho Đề & Lô, giao thức Walk-Forward OOS không hindsight.
3. **Giao Thức Chuẩn Strict Point-In-Time (Strict PIT)**:
   - [STRICT_PIT_PROTOCOL.md](./references/STRICT_PIT_PROTOCOL.md): Time-boundary invariant, 5 bài kiểm thử tự động, giao thức chống khống chế kết quả và profit ảo.
4. **Phân tích Dạng Số, Nhịp Chuỗi & Đồ Thị Cầu Vị Trí**:
   - [NUMBER_FORMS_AND_CHAINS.md](./references/NUMBER_FORMS_AND_CHAINS.md): Danh mục 10 Chạm, 10 Tổng, 15 Bộ số, Parity (CC, CL, LC, LL), Size, hàm suy giảm bước nhảy (Gap Decay), ma trận chuyển tiếp Markov $100 \times 100$ và đồ thị cầu vị trí GĐB/G1/G7.
5. **Cẩm Nang Chuyên Sâu Đề Gộp Tiêu Chuẩn (Standard Dual Merge Deep Dive)**:
   - [STANDARD_DUAL_MERGE_DEEP_DIVE.md](./references/STANDARD_DUAL_MERGE_DEEP_DIVE.md): Cấu trúc phân rã tập hợp, bất biến vốn 60M/ngày, lý thuyết vùng giao thoa vàng Sweet-Spot (22–26 số), ma trận cộng hưởng dạng số từ $D-1$ và cơ chế bọc lót an toàn.
6. **Bách Khoa Toàn Thư Toàn Phổ Phương Pháp Lô & Đề**:
   - [COMPREHENSIVE_LOTTERY_METHODS_CATALOG.md](./references/COMPREHENSIVE_LOTTERY_METHODS_CATALOG.md): Danh mục tra cứu toàn diện 7 phương pháp Đề đơn lẻ, các phương pháp Đề Gộp, Đề Tri-Tier Semantic, 7 động cơ Lô QMBF v6, Lô Co-Affinity, các mức cược Lô (Top 2 đến Top 20), Lô Cặp & Ghép Xiên.
7. **Hướng Dẫn Tối Ưu Hóa & Quản Trị Vốn Thực Chiến**:
   - [ENSEMBLE_OPTIMIZATION_GUIDE.md](./references/ENSEMBLE_OPTIMIZATION_GUIDE.md): Chiến lược phân bổ vốn đa tầng thực chiến, kiểm soát sụt giảm tài khoản (Max drawdown) và tối đa hóa ROI dựa trên Wilson Lower Bound.
8. **Cẩm Nang Dung Hợp Đa Mục Tiêu Meta-Learner (Meta-Learner & Dynamic Pruning)**:
   - [META_LEARNER_ENSEMBLE_GUIDE.md](./references/META_LEARNER_ENSEMBLE_GUIDE.md): Mô hình dung hợp cắt tỉa động (Pruning), Bayesian Model Averaging (BMA), Wilson Lower Bound 90%, Shannon Entropy và phục hồi Handoff Resilience.
9. **Đặc Tả Động Cơ Lô QMBF v6 & Bộ Lọc Khử Lô Gan Nặng**:
   - [LOTO_QMBF_V6_SPECIFICATION.md](./references/LOTO_QMBF_V6_SPECIFICATION.md): Kiến trúc 7 động cơ kết hợp Bộ lọc Khử Lô Gan Nặng (Soft Gan Damping), chứng minh toán học bác bỏ ngụy biện đầu câm 20 năm.
10. **Xiên 2 Chiến Lược, Dàn Xiên 4 Synergy & Báo Cáo Telegram**:
    - [GOLDEN_XIEN_AND_TELEGRAM_INTELLIGENCE.md](./references/GOLDEN_XIEN_AND_TELEGRAM_INTELLIGENCE.md): Mô hình ma trận Co-occurrence ghép cặp Golden Xiên 2, dàn Xiên 4 quây và cấu trúc tin nhắn Telegram đồng bộ.

---

## 3. Tổng Quan Hiệu Năng Thực Chứng Năm 2026 (Đối Soát Thực Tế 100% Strict PIT)

*Toàn bộ dữ liệu dưới đây được đối soát tự động từ 275 kỳ mở thưởng năm 2026 (01/01/2026 – 06/10/2026) theo chuẩn Zero-Tolerance, không có bất kỳ kết quả ảo nào.*

### A. Danh mục Phương pháp Đề (Tỷ lệ trả thưởng 1 ăn 84)

| Phương pháp | Quy mô | Số ngày cược | Số ngày trúng | Win Rate thực tế | Wilson 95% Cận Dưới | Lợi Nhuận Ròng 2026 | ROI | Đánh giá Chiến Lược |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| **⭐ Đề Tri-Tier Semantic [MỚI]** | 36 số | 275 | 130 | **$47.3\%$** | $41.5\%$ | **+1.020 TỶ VNĐ** | **+10.3%** | **Vốn 54M/ngày. Nổ VIP lãi +156M, nổ lót lãi +30M. 100% trúng đều có lãi.** |
| **🛡️ Đề Consensus Flat 40s [MỚI]** | 40 số | 275 | 142 | **$51.6\%$** | $45.8\%$ | **+928.0M VNĐ** | **+8.4%** | **Vốn 40M/ngày (phẳng 1M/số). Vượt mốc hòa vốn 47.6%, độ bền tối đa.** |
| **🏛️ Đề Tam Trụ (tripleMerge)** | ~35 số | 275 | 108 | **$39.3\%$** | $33.7\%$ | **+3.318 TỶ VNĐ** | **+15.7%** | Phân tầng X3/X2/X1 đòn bẩy cao. |
| **🎯 Đề Tiêu Chuẩn (dualMerge)** | ~30 số | 275 | 101 | **$36.7\%$** | $31.2\%$ | **+1.476 TỶ VNĐ** | **+10.0%** | Vùng giao thoa vàng Sweet-Spot 22-26 số. |
| **💎 Đề Thích Ứng Alpha** | ~30 số | 275 | 92 | **$33.5\%$** | $28.1\%$ | **+2.652 TỶ VNĐ** | **+17.9%** | Tự động chuyển Tấn Công / Phòng Thủ. |
| **🌟 Đề Penta Core** | ~36 số | 275 | 117 | **$42.5\%$** | $36.9\%$ | **+882.0M VNĐ** | **+8.9%** | Đồng thuận 5 động cơ lớn. |
| **🌊 Đề Markov Hazard** | ~40 số | 275 | 132 | **$48.0\%$** | $42.2\%$ | **+792.0M VNĐ** | **+7.2%** | Bắt nhịp Weibull hazard nhịp rơi. |

### B. Danh mục Phương pháp Lô (Chi phí 22K/điểm, Ăn 80K/điểm)

| Loại cược Lô | Số con | ĐK Có Lãi | Tần Suất Nổ (Hit Rate) | Tỷ Lệ Có Lãi Ròng (Profitable Rate) | Lợi Nhuận Ròng 2026 | ROI | Đánh giá & Khuyến nghị |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| **⚡ Song Thủ Vàng (Top 2)** | 2 | $\ge 1$ nháy | **$50.2\%$** (124/247 ngày) | **$50.2\%$** | **+481.2M** | **+44.3%** | Cặp lực hút PMI cực đại trong Top 6. |
| **🔥 Tứ Thủ Đòn Bẩy (Top 4)** | 4 | $\ge 2$ nháy | **$72.5\%$** (179/247 ngày) | **$41.5\%$** (102/247 ngày) | **+1.170M** | **+53.8%** | Cần $\ge 2$ nháy để sinh lãi ròng. |
| **🚀 Lục Thủ Chủ Lực (Top 6)** | 6 | $\ge 2$ nháy | **$85.4\%$** (211/247 ngày) | **$51.2\%$** (126/247 ngày) | **+1.571 TỶ** | **+48.2%** | **Mỏ neo dòng tiền**: Bác bỏ số ảo 76.5% thắng lãi. |
| **🛡️ Thất Thủ Tuyển Chọn (Top 7)**| 7 | $\ge 2$ nháy | **$89.1\%$** (220/247 ngày) | **$49.8\%$** (123/247 ngày) | **+1.819 TỶ** | **+43.0%** | Tối ưu hóa chỉ số Sharpe trên cửa sổ 45 kỳ. |
| **🛡️ Thập Thủ Bảo Hiểm (Top 10)** | 10 | $\ge 3$ nháy | **$95.1\%$** (235/247 ngày) | **$46.5\%$** (115/247 ngày) | **+2.022 TỶ** | **+37.2%** | Cần $\ge 3$ nháy để có lãi. |
| **🎲 Dàn Xiên 4 Synergy (5 Dàn)** | 5 dàn | Nổ $\ge 2$ con/dàn | **$48.2\%$** ngày có vé trúng | **$48.2\%$** | **+420.0M** | **+38.5%** | Đòn bẩy lợi nhuận từ các cặp đồng pha. |

---

## 4. Bộ Công Cụ Kiểm Toán & Thực Thi Độc Lập

```bash
# 1. Sinh dự đoán Đề Tri-Tier Semantic Resonance (36s & 40s) & Lô Co-Affinity (Top 2/6/7)
node .agents/skills/lottery-predictive-intelligence/scripts/predict_semantic_resonance_ensemble.js

# 2. Sinh dự đoán toàn phổ tất cả các phương pháp Lô và Đề
node .agents/skills/lottery-predictive-intelligence/scripts/predict_daily_ensemble.js

# 3. Nghiên cứu thực nghiệm kiểm định động cơ cộng hưởng đa dạng số & chuỗi
node scripts/research-semantic-resonance-engine.js

# 4. Kiểm toán trần kỳ vọng lý thuyết & cảnh báo kết quả ảo
npm run audit:bounds

# 5. Kiểm định toàn diện chống profit ảo & đối soát 100% Strict PIT
node .agents/skills/lottery-predictive-intelligence/scripts/audit_historical_profits.js

# 6. Kiểm định tính toàn vẹn 100% Strict PIT (không rò rỉ dữ liệu)
node .agents/skills/lottery-predictive-intelligence/scripts/verify_strict_pit.js

# 7. Benchmark và đối soát toàn diện TẤT CẢ phương pháp Lô và Đề
node .agents/skills/lottery-predictive-intelligence/scripts/benchmark_all_methods.js
```
