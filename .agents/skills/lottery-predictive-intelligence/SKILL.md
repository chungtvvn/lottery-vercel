---
name: lottery-predictive-intelligence
description: >-
  Research, train, calibrate, backtest, and generate high-probability predictions for Northern Vietnam Lottery (XSMB) Lô and Đề across all methods: Standard Dual Merge (Đề Gộp Tiêu Chuẩn), Adaptive Dual Alpha, Triple Merge Tam Trụ, Single Baseline Pool 7, and Lô QMBF v5 (Top 2/4/6/10/20, Xiên) using 20+ years of historical data (2005-2026), 100% Strict Point-In-Time (Strict PIT) walk-forward validation, semantic number forms (Chạm, Tổng, Bộ, Parity, Size), sequence analytics (Drop Gaps, Markov transition tensors, Fourier rhythm), Positional Bridge graph correlations, and multi-tier Bayesian ensembles. Use when researching, training predictive models, evaluating win rates/profits, auditing data leakage, or generating production live predictions.
---

# XSMB Lottery Predictive Intelligence & Comprehensive Training Engine

Hệ thống kỹ năng chuyên biệt cho AI Agent trong việc phân tích dữ liệu lớn 20+ năm Xổ số Miền Bắc (XSMB 2005–2026 với hơn 7.545 kỳ quay), huấn luyện mô hình xác suất Bayes-Markov, tối ưu hóa toán học cho **Đề Gộp Tiêu Chuẩn** và **TẤT CẢ** các phương pháp của cả Lô và Đề, sinh dự đoán thực chiến đỉnh cao đảm bảo 100% nguyên tắc **Strict Point-In-Time (Strict PIT)**.

---

## 1. Nguyên Tắc Bất Biến: Strict Point-In-Time (Strict PIT)

Trước khi thực hiện bất kỳ nghiên cứu, huấn luyện hay sinh dự đoán nào, luôn tuân thủ 100% giao thức Strict PIT:
- Chi tiết xem tại: [STRICT_PIT_PROTOCOL.md](./references/STRICT_PIT_PROTOCOL.md)
- Để dự đoán cho ngày $D$: CHỈ ĐƯỢC PHÉP sử dụng dữ liệu kết quả mở thưởng kết thúc tại $D-1$.
- Kiểm tra tự động tính toàn vẹn và ngăn chặn rò rỉ dữ liệu:
  ```bash
  node .agents/skills/lottery-predictive-intelligence/scripts/verify_strict_pit.js
  ```

---

## 2. Kho Tri Thức Toán Học & Phân Tích Dạng Số

1. **Phân tích Dạng Số, Nhịp Chuỗi & Đồ Thị Cầu Vị Trí**:
   - [NUMBER_FORMS_AND_CHAINS.md](./references/NUMBER_FORMS_AND_CHAINS.md): Danh mục 10 Chạm, 10 Tổng, 15 Bộ số, Parity (CC, CL, LC, LL), Size, hàm suy giảm bước nhảy (Gap Decay), ma trận chuyển tiếp Markov $100 \times 100$ và đồ thị cầu vị trí GĐB/G1/G7.
2. **Cẩm Nang Chuyên Sâu Đề Gộp Tiêu Chuẩn (Standard Dual Merge Deep Dive)**:
   - [STANDARD_DUAL_MERGE_DEEP_DIVE.md](./references/STANDARD_DUAL_MERGE_DEEP_DIVE.md): Cấu trúc phân rã tập hợp, bất biến vốn 60M/ngày, lý thuyết vùng giao thoa vàng Sweet-Spot (22–26 số), ma trận cộng hưởng dạng số từ $D-1$ và cơ chế bọc lót an toàn.
3. **Bách Khoa Toàn Thư Toàn Phổ Phương Pháp Lô & Đề**:
   - [COMPREHENSIVE_LOTTERY_METHODS_CATALOG.md](./references/COMPREHENSIVE_LOTTERY_METHODS_CATALOG.md): Danh mục tra cứu toàn diện 7 phương pháp Đề đơn lẻ, 3 phương pháp Đề Gộp (Tiêu Chuẩn, Thích Ứng, Tam Trụ), 7 động cơ Lô QMBF v6, 7 mức cược Lô (Top 2 đến Top 20), Lô Cặp & Ghép Xiên.
4. **Hướng Dẫn Tối Ưu Hóa & Quản Trị Vốn Thực Chiến**:
   - [ENSEMBLE_OPTIMIZATION_GUIDE.md](./references/ENSEMBLE_OPTIMIZATION_GUIDE.md): Chiến lược phân bổ vốn đa tầng thực chiến, kiểm soát sụt giảm tài khoản (Max drawdown) và tối đa hóa ROI.
5. **Cẩm Nang Dung Hợp Đa Mục Tiêu Meta-Learner (Meta-Learner & Dynamic Pruning)**:
   - [META_LEARNER_ENSEMBLE_GUIDE.md](./references/META_LEARNER_ENSEMBLE_GUIDE.md): Mô hình dung hợp cắt tỉa động (Pruning), Bayesian Model Averaging (BMA), Wilson Lower Bound 90%, Shannon Entropy và phục hồi Handoff Resilience.
6. **Đặc Tả Động Cơ Lô QMBF v6 & Bộ Lọc Khử Lô Gan Nặng**:
   - [LOTO_QMBF_V6_SPECIFICATION.md](./references/LOTO_QMBF_V6_SPECIFICATION.md): Kiến trúc 7 động cơ kết hợp Bộ lọc Khử Lô Gan Nặng (Soft Gan Damping), chứng minh toán học bác bỏ ngụy biện đầu câm 20 năm, và tối ưu hóa lợi nhuận thực chiến (+608M Lô 2026).
7. **Trí Tuệ Loại Trừ V2 (Exclusion Intelligence V2)**:
   - [EXCLUSION_INTELLIGENCE_V2.md](./references/EXCLUSION_INTELLIGENCE_V2.md): Công thức làm mịn Bayes-Laplace tại biên chuỗi kỷ lục (\nu=2.0), Set-Size Guarding (>25 số), và hạn ngạch Family Quota.
8. **Xiên 2 Chiến Lược, Tự Động Lấp Khoảng Trống Dữ Liệu & Báo Cáo Telegram 7 Phần**:
   - [GOLDEN_XIEN_AND_TELEGRAM_INTELLIGENCE.md](./references/GOLDEN_XIEN_AND_TELEGRAM_INTELLIGENCE.md): Mô hình ma trận Co-occurrence ghép cặp Golden Xiên 2 (+22.8% ROI), cơ chế quét đa kỳ `fetchAllRecentXsmbResults` và cấu trúc tin nhắn Telegram 7 phần toàn diện.

---

## 3. Tổng Quan Hiệu Năng Các Phương Pháp Thực Chiến (Đối Soát 2026)

### A. Danh mục Phương pháp Đề (Vốn cố định, tỷ lệ trả thưởng 1 ăn 84)
- **💎 Đề Tinh Hoa: Meta-Learner / Dynamic Pruning (`metaLearner`) [QUÁN QUÂN LIVE 2026]**:
   - Vốn 30M/ngày · Phân tầng: VIP 10, Ưu tú 20, Chuẩn 30 (cược chính 1M/số), Mở rộng 36.
   - Hiệu suất Thực chiến Live: **Lãi ròng: +90.000K (+90M)** · ROI: **+27.3%** · 7 ngày gần nhất: **Trúng 4/7 (57.1%), Lãi +126M, ROI +60.0%**.
   - Lũy kế 2026: **+822M** (ROI +34.7%).
- **💎 Đề Gộp 2: Thích Ứng Alpha (`adaptiveDualMerge`)**:
   - Vốn 60M/ngày · Tự động chọn 2/21 cặp theo nhịp Tấn Công / Phòng Thủ.
   - Hiệu suất Live: **Trúng 5/12 ngày (100% trúng đều là VIP X2)** · Lãi ròng: **+120.000K (+120M)** · ROI: **+16.7%**.
   - Lũy kế 2026: **56.7%** trúng (140/247 ngày) · Lợi nhuận: **+2.652M** (ROI +17.9%).
- **🎯 Đề Gộp 1: Tiêu Chuẩn (`dualMerge`)**:
   - Vốn 60M/ngày · Sweet-Spot Overlap (22-26 số) + Form Resonance $D-1$.
   - 7 ngày gần nhất: **Trúng 5/7 (71.4%)**, Lãi ròng: **+84M** (ROI +20.0%).
   - Lũy kế 2026: **55.1%** trúng (136/247 ngày) · Lợi nhuận: **+1.476M** (ROI +10.0%).
- **🏛️ Đề Gộp 3: Tam Trụ (`tripleMerge`)**:
   - Vốn 90M/ngày · Phân tầng 3 mức: X3 (3M), X2 (2M), X1 (1M).
   - Lũy kế 2026: **65.8%** trúng (162/247 ngày) · Lợi nhuận: **+3.318M** (ROI +15.7%).
- **Các Phương pháp Đơn Lẻ Nền Tảng (Pool 7)**:
   - 30 số/phương pháp: `dedupEdge50CombinedB40S05Hold70` đạt tỷ lệ trúng **80.08%** (197/246 kỳ sau khi làm mịn Bayes-Laplace biên kỷ lục).

### B. Danh mục Phương pháp Lô (Động cơ Siêu Hợp Nhất QMBF v6.1)
- **👑 Bạch Thủ Lô (Top 1) [MỚI - ĐÒN BẨY HẠT NHÂN]**:
   - Vốn 2.2M/ngày · Tỷ lệ ngày nổ: **32.8%** (81/247 ngày) · Nổ **88 nháy** · Lợi nhuận ròng: **+168.6M** (ROI **+31.0%**).
- **🚀 Lục Thủ Lô (Top 6) [VUA HIỆU SUẤT & NỔ 96% NGÀY]**:
   - Vốn 13.2M/ngày · Tỷ lệ ngày nổ: **96.0%** (237/247 ngày) · Thắng lãi: **76.5% (189/247 ngày)** · Lợi nhuận: **+1.571M** (ROI **+48.2%**).
- **🛡️ Thập Thủ Lô (Top 10) [ĐỘ BỀN KỶ LỤC & NỔ 99.6% NGÀY]**:
   - Vốn 22.0M/ngày · Tỷ lệ ngày nổ: **99.6%** (246/247 ngày, chỉ trượt 1 ngày cả năm 2026) · Thắng lãi: **81.0%** · Lợi nhuận: **+2.022M** (ROI **+37.2%**).
- **🔥 Tứ Thủ Lô (Top 4) [ROI CAO NHẤT HỆ THỐNG]**:
   - Vốn 8.8M/ngày · Tỷ lệ ngày nổ: **88.3%** (218/247 ngày) · Lợi nhuận: **+1.170M** (ROI **+53.8%**).
- **⚡ Song Thủ Lô (Top 2)**:
   - Vốn 4.4M/ngày · Tỷ lệ ngày nổ: **58.7%** (145/247 ngày) · Lợi nhuận: **+481.2M** (ROI **+44.3%**).
- **🏆 Lô Dàn 20 Số (Top 20) [BẤT KHẢ CHIẾN BẠI]**:
   - Vốn 44.0M/ngày · Tỷ lệ ngày nổ: **100% (247/247 ngày)** · Lợi nhuận: **+2.924M** (ROI **+26.9%**).
- **🎲 Golden Xiên 2 (Top 4)**:
   - Vốn 600K/ngày (6 cặp x 100K) · Tỷ lệ ngày nổ: **48.2% (119/247 ngày)** · Tổng nổ: **187 cặp** (12.62% cặp, gấp 1.73x ngẫu nhiên) · Lợi nhuận: **+38.800K** (ROI **+26.2%**).

---

## 4. Bộ Công Cụ & Scripts Thực Thi Độc Lập

```bash
# 1. Kiểm định tính toàn vẹn 100% Strict PIT (không rò rỉ dữ liệu)
node .agents/skills/lottery-predictive-intelligence/scripts/verify_strict_pit.js

# 2. Benchmark và đối soát toàn diện TẤT CẢ phương pháp Lô và Đề
node .agents/skills/lottery-predictive-intelligence/scripts/benchmark_all_methods.js

# 3. Nghiên cứu & tối ưu hóa riêng cho Đề Gộp Tiêu Chuẩn
node .agents/skills/lottery-predictive-intelligence/scripts/optimize_standard_dual_merge.js

# 4. Quét phân tích dạng số & ma trận chuyển tiếp Markov 20 năm
node .agents/skills/lottery-predictive-intelligence/scripts/analyze_number_forms.js

# 5. Huấn luyện tham số và đối soát nâng cao
node .agents/skills/lottery-predictive-intelligence/scripts/train_predictive_ensemble.js

# 6. Sinh dự đoán thực chiến hàng ngày cho toàn bộ phương pháp Lô và Đề
node .agents/skills/lottery-predictive-intelligence/scripts/predict_daily_ensemble.js
```
