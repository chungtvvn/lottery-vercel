---
name: lottery-predictive-intelligence
description: >-
  Research, train, calibrate, backtest, and generate high-probability predictions for Northern Vietnam Lottery (XSMB) Lô and Đề using 20+ years of historical data (2005-2026), 100% Strict Point-In-Time (Strict PIT) walk-forward validation, semantic number forms (Chạm, Tổng, Bộ, Parity, Size), sequence analytics (Drop Gaps, Markov transition tensors, Fourier rhythm), Positional Bridge graph correlations, and multi-tier Bayesian ensembles (Tam Trụ X3/X2/X1, Adaptive Dual Alpha, Quantum Bayes-Markov Fusion QMBF). Use when researching, training predictive models, evaluating win rates/profits, auditing data leakage, or generating production live predictions.
---

# XSMB Lottery Predictive Intelligence & Training Engine

Hệ thống kỹ năng chuyên biệt cho AI Agent trong việc phân tích dữ liệu lớn 20+ năm Xổ số Miền Bắc (XSMB 2005–2026 với hơn 7.545 kỳ quay), huấn luyện mô hình học máy xác suất Bayes-Markov và sinh dự đoán thực chiến tối ưu cho cả Lô và Đề.

---

## 1. Nguyên Tắc Bất Biến: Strict Point-In-Time (Strict PIT)

Trước khi thực hiện bất kỳ nghiên cứu hoặc sinh dự đoán nào, hãy đảm bảo tuân thủ 100% giao thức Strict PIT:
- Chi tiết xem tại: [STRICT_PIT_PROTOCOL.md](./references/STRICT_PIT_PROTOCOL.md)
- Để dự đoán cho ngày $D$: chỉ được phép sử dụng dữ liệu kết quả mở thưởng kết thúc tại $D-1$.
- Để kiểm tra rò rỉ dữ liệu tự động, chạy script:
  ```bash
  node .agents/skills/lottery-predictive-intelligence/scripts/verify_strict_pit.js
  ```

---

## 2. Các Trụ Cột Phân Tích Dạng Số & Chuỗi Nhịp

Chi tiết lý thuyết toán học và ánh xạ không gian số xem tại: [NUMBER_FORMS_AND_CHAINS.md](./references/NUMBER_FORMS_AND_CHAINS.md)

1. **Phân tích Dạng Số (Number Forms)**:
   - **Chạm (0-9)**: Tần suất xuất hiện, nhịp rơi, bóng âm và bóng dương.
   - **Tổng (0-9 modulo 10 & 0-18)**: Ma trận chuyển tiếp Markov của Tổng giữa các ngày liên tiếp.
   - **15 Bộ Số Truyền Thống**: Nhóm số bù trừ qua phép quay bóng âm dương.
   - **Parity & Size State Matrix**: 4 trạng thái Chẵn/Lẻ (CC, CL, LC, LL) và 4 trạng thái Lớn/Nhỏ.
2. **Phân tích Chuỗi & Nhịp Rơi (Sequence Analytics)**:
   - **Chuỗi nhỏ trước (`chainSmallFirst`)**: Nhịp tích lũy và mốc kỷ lục 20 năm.
   - **Khoảng cách nhịp rơi (Gap Decay)**: Mô hình hóa điểm rơi vàng (2–5 ngày) và triệt tiêu số gan quá chu kỳ.
   - **Ma trận chuyển trạng thái Markov bậc 1 và bậc 2**: $P(S_t \mid S_{t-1})$.
3. **Đồ Thị Cầu Vị Trí Giải Thưởng (Positional Bridge Graph)**:
   - Tương quan bước chuyển giữa 27 giải: GĐB $\leftrightarrow$ G7 (G7.1 - G7.4), G1 $\leftrightarrow$ G3.

Để quét toàn bộ dữ liệu 20 năm phân tích các dạng số và chuỗi nhịp hiện tại, chạy:
```bash
node .agents/skills/lottery-predictive-intelligence/scripts/analyze_number_forms.js
```

---

## 3. Chiến Lược Hợp Nhất Đa Mô Hình & Quản Trị Vốn

Chi tiết chiến thuật tối ưu hóa và phân bổ vốn xem tại: [ENSEMBLE_OPTIMIZATION_GUIDE.md](./references/ENSEMBLE_OPTIMIZATION_GUIDE.md)

### A. Đề Tam Trụ (Triple-Consensus Ensembling)
- **Vốn**: Cố định 90M/ngày (3 tầng vốn).
- **Tầng X3 (Siêu Đồng Thuận)**: Trùng 3 phương pháp · Cược 3M/số · Trúng ăn 252M (Lãi cực đại +162M).
- **Tầng X2 (Đồng Thuận Cao)**: Trùng 2/3 phương pháp · Cược 2M/số · Trúng ăn 168M (Lãi lớn +78M).
- **Tầng X1 (Lưới Bọc Lót)**: Số riêng 1 phương pháp · Cược 1M/số · Trúng ăn 84M (Bảo toàn vốn).
- **Hiệu suất 2026**: 170/245 ngày trúng (**69.4%**), Lãi **+3.318M** (ROI +15.0%).

### B. Đề Thích Ứng Alpha (Adaptive Dual Alpha)
- Tuyển chọn tối ưu 2 trong 21 cặp phương pháp theo cơ chế tự thích ứng:
  - **Tấn công X2 (Offensive)**: 24–27 số trùng, ăn lớn +108M.
  - **Phòng thủ cắt dây (Defensive)**: 20–24 số trùng, tỷ lệ nổ 61.2%.
- **Hiệu suất 2026**: 138/245 ngày trúng (**56.3%**), Lãi **+2.436M** (ROI +16.6%).

### C. Lô QMBF v5 (Quantum Bayes-Markov & Positional Form Fusion)
- Hợp nhất 7 động cơ độc lập bằng Reciprocal Rank Fusion (RRF $K=20$):
  Markov (1.90) + Bridge (0.20) + Number Form (0.25) + Head/Tail (0.30) + Momentum (0.30) + Affinity (0.25) + Shadow (0.15).
- Tích hợp Bộ lọc Đa dạng hóa Đuôi số (`maxPerTail: 2`).
- **Hiệu suất 2026**:
  - Top 6: **92.2%** nổ, Lãi **+1.390M** (ROI +43.0%).
  - Top 10: **99.2%** nổ, Lãi **+2.002M** (ROI +37.1%).
  - Top 20: **100%** nổ, Lãi **+2.828M** (ROI +26.2%).

---

## 4. Danh Mục Công Cụ & Scripts Thực Thi

1. **Kiểm tra rò rỉ dữ liệu Strict PIT**:
   ```bash
   node .agents/skills/lottery-predictive-intelligence/scripts/verify_strict_pit.js
   ```
2. **Quét và phân tích dạng số & chuỗi Markov 20 năm**:
   ```bash
   node .agents/skills/lottery-predictive-intelligence/scripts/analyze_number_forms.js
   ```
3. **Chạy huấn luyện và kiểm định mô hình (Backtest 2005–2026)**:
   ```bash
   node .agents/skills/lottery-predictive-intelligence/scripts/train_predictive_ensemble.js
   ```
4. **Sinh dự đoán thực chiến mới nhất cho ngày tiếp theo**:
   ```bash
   node .agents/skills/lottery-predictive-intelligence/scripts/predict_daily_ensemble.js
   ```
