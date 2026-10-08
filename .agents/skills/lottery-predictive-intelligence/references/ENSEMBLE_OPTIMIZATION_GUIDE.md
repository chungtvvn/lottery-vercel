# Hướng Dẫn Tối Ưu Hóa Ensembling & Quản Trị Vốn Thực Chiến (Ensemble Optimization & Capital Allocation)

Tài liệu này chi tiết hóa cách thức kết hợp đa phương pháp (Ensembling) và phân bổ tỷ trọng cược để tối đa hóa kỳ vọng lợi nhuận (Expected Value $\mathbb{E}[V]$) và tỷ suất sinh lời (ROI), đồng thời khống chế chuỗi thua cực đại (Max Drawdown) dựa trên **Nguyên Lý Giới Hạn Kỳ Vọng Toán Học (Theoretical Expectation Bounds)** và **Cận Dưới Khoảng Tin Cậy Wilson 95%**.

---

## 1. Mô Hình Đề Tam Trụ (Triple-Consensus Ensembling)

### A. Cấu Trúc 3 Phương Pháp Trọng Điểm
Kết hợp 3 phương pháp độc lập có xung lực cao và độ tương quan thấp:
1. **$M_1$ - Edge 50% PIT**: Động cơ xung lực theo dõi mốc lịch sử 20 năm.
2. **$M_2$ - Edge 75% Hold**: Bộ lọc xác suất cao giữ chân các số bền vững.
3. **$M_3$ - Dropoff Khử Trùng / Chuỗi Nhỏ Trước**: Bộ lọc bù khuyết triệt tiêu độ nhiễu.

### B. Cơ Chế Phân Tầng Vốn 3 Tầng (3-Tier Capital Structure)
Cho 3 tập số $\mathcal{S}_1, \mathcal{S}_2, \mathcal{S}_3$ (mỗi tập gồm 30 số):
1. **Tầng X3 (Siêu Đồng Thuận)**:
   $$\mathcal{T}_{\text{X3}} = \mathcal{S}_1 \cap \mathcal{S}_2 \cap \mathcal{S}_3$$
   - Cược 3M/số. Trúng ăn 252M (Lãi cực đại **+162M**).
2. **Tầng X2 (Đồng Thuận Cao)**:
   $$\mathcal{T}_{\text{X2}} = (\mathcal{S}_1 \cap \mathcal{S}_2 \setminus \mathcal{T}_{\text{X3}}) \cup (\mathcal{S}_2 \cap \mathcal{S}_3 \setminus \mathcal{T}_{\text{X3}}) \cup (\mathcal{S}_3 \cap \mathcal{S}_1 \setminus \mathcal{T}_{\text{X3}})$$
   - Cược 2M/số. Trúng ăn 168M (Lãi lớn **+78M**).
3. **Tầng X1 (Lưới Bọc Lót An Toàn)**:
   $$\mathcal{T}_{\text{X1}} = (\mathcal{S}_1 \cup \mathcal{S}_2 \cup \mathcal{S}_3) \setminus (\mathcal{T}_{\text{X3}} \cup \mathcal{T}_{\text{X2}})$$
   - Cược 1M/số. Trúng ăn 84M (Bảo toàn vốn và hòa cược).

### C. Hiệu Suất Kiểm Chứng Thực Tế 2026 (275 Kỳ 100% Strict PIT)
- Tổng ngày đối soát: **275 ngày**.
- Trúng thực tế: **108 ngày** (**39.3%** Win Rate thực tế).
- Cận dưới Wilson 95%: **33.7%**.
- Nằm hoàn hảo trong **Cận kỳ vọng lý thuyết** cho dàn ~39 số ($36\% - 44\%$).
- Lợi nhuận lũy kế: **+3.318M**, ROI **+15.7%** nhờ phân tầng vốn đòn bẩy khi nổ X3 và X2.

---

## 2. Mô Hình Đề Thích Ứng Alpha (Adaptive Dual Alpha)

### A. Nguyên Lý Tuyển Chọn Động 21 Cặp
Không cố định 2 phương pháp mà quét ma trận $\binom{7}{2} = 21$ cặp phương pháp mỗi ngày:
- Tính chỉ số Jaccard Similarity $J(M_a, M_b) = \frac{|\mathcal{S}_a \cap \mathcal{S}_b|}{|\mathcal{S}_a \cup \mathcal{S}_b|}$.
- Điểm hợp lực đa mục tiêu:
  $$\text{Score}_{\text{Pair}} = \alpha \cdot \text{Win}_{\text{Hist}} + \beta \cdot J(M_a, M_b) + \gamma \cdot \text{Momentum}_{\text{Recent}}$$
- Chế độ tự thích ứng:
  - **Tấn Công X2 (Offensive)**: Khi hệ thống đang có chuỗi thắng, ưu tiên cặp có độ trùng tối ưu (24–27 số trùng) để ăn đậm +108M.
  - **Phòng Thủ Cắt Dây (Defensive)**: Khi xuất hiện 2 kỳ thua liên tiếp, tự động chuyển sang cặp có độ bù khuyết cao (20–24 số trùng, tổng dàn 36–40 số) để bảo vệ vốn.

### B. Hiệu Suất Kiểm Chứng Thực Tế 2026 (275 Kỳ)
- Trúng thực tế: **92 / 275 ngày** (**33.5%** Win Rate).
- Cận dưới Wilson 95%: **28.1%**.

---

## 3. Mô Hình Lô QMBF v6.1 (Quantum Bayes-Markov & Positional Form Fusion)

### A. 7 Động Cơ Thành Phần & Tích Hợp RRF
Xếp hạng Reciprocal Rank Fusion (RRF) kết hợp 7 động cơ độc lập:
$$\text{Score}_{\text{RRF}}(n) = \sum_{e=1}^7 \frac{w_e}{K + \text{Rank}_e(n)}$$
với $K = 16.0$ và bộ trọng số tối ưu:
1. $w_{\text{Markov}} = 1.90$: Ma trận chuyển tiếp trạng thái 3 bậc trễ.
2. $w_{\text{Bridge}} = 0.20$: Cầu vị trí tương quan GĐB/G1/G7.
3. $w_{\text{Form}} = 0.20$: Cộng hưởng dạng số, Chạm & Tổng kỳ vọng.
4. $w_{\text{HT}} = 0.30$: Động lượng nhịp Đầu/Đuôi.
5. $w_{\text{Momentum}} = 0.35$: Xung lực tần số và Lô rơi đa nháy ($1.15\times$).
6. $w_{\text{Affinity}} = 0.25$: Ma trận cặp số hay đi cùng nhau (Co-occurrence).
7. $w_{\text{Shadow}} = 0.15$: Tương quan bóng âm dương và số đảo.

### B. Bộ Lọc Đa Dạng Hóa Đuôi Số (Tail Diversity Filter)
- Không cho phép chọn quá 2 số có cùng chữ số đuôi (`maxPerTail: 2`).
- Ngăn ngừa rủi ro gãy cầu hàng loạt khi toàn bộ một đầu hoặc đuôi bị "câm" trong kỳ quay.

### C. Hiệu Suất Kiểm Chứng Thực Tế 2026 (Phân Định Rạch Ròi Hit Rate vs Profitable Rate)
- **Top 6 Lục Thủ Lô**: Tần suất nổ nháy **85.4%** (211/247 ngày), Tỷ lệ có lãi ròng **51.2%** (126/247 ngày), Lãi **+1.571M** (ROI +48.2%). *(Bác bỏ số ảo 76.5% thắng lãi)*.
- **Top 10 Thập Thủ Lô**: Tần suất nổ nháy **95.1%** (235/247 ngày), Tỷ lệ có lãi ròng **46.5%** (115/247 ngày), Lãi **+2.022M** (ROI +37.2%). *(Bác bỏ số ảo 81.0% thắng lãi)*.
- **Top 20 Lô Dàn**: Tần suất nổ nháy **99.6%** (246/247 ngày), Tỷ lệ có lãi ròng **38.9%** (96/247 ngày), Lãi **+2.924M** (ROI +26.9%). *(Bác bỏ ngụy biện 100% toàn thắng)*.

---

## 4. Quản Trị Vốn Bảo Thủ Dựa Trên Wilson Lower Bound (Conservative Sizing)

Theo công thức tiêu chuẩn Kelly mở rộng cho cá cược có tỷ lệ trả thưởng $b$:
$$f^* = \frac{b \cdot p - (1 - p)}{b}$$
- **Quy tắc An Toàn Cốt Tử**: **Tuyệt đối không dùng tỷ lệ thắng mẫu $\hat{p}$**.
- **Luôn thay thế $p$ bằng $W_{95}^-$ (Cận dưới Wilson 95%)**:
  $$f^*_{\text{safe}} = \frac{b \cdot W_{95}^- - (1 - W_{95}^-)}{b} \times \text{Fractional Kelly (0.25)}$$
- Sử dụng Fractional Kelly $0.25\times$ (Quarter Kelly) giúp bảo vệ tài khoản trước chuỗi sụt giảm cực đại và duy trì sự tăng trưởng tài sản bền vững trong dài hạn.
