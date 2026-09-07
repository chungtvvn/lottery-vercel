# Hướng Dẫn Tối Ưu Hóa Ensembling & Quản Trị Vốn Thực Chiến (Ensemble Optimization & Capital Allocation)

Tài liệu này chi tiết hóa cách thức kết hợp đa phương pháp (Ensembling) và phân bổ tỷ trọng cược để tối đa hóa kỳ vọng lợi nhuận (Expected Value $\mathbb{E}[V]$) và tỷ suất sinh lời (ROI), đồng thời khống chế chuỗi thua cực đại (Max Drawdown).

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

### C. Hiệu Suất Kiểm Chứng 2026
- Tổng ngày đối soát: **245 ngày**.
- Trúng: **170 ngày** (**69.4%** Win Rate).
- Phân bổ thắng: **32 kỳ X3** · **68 kỳ X2** · **70 kỳ X1**.
- Lợi nhuận lũy kế: **+3.318.000đ** (+3.318M), ROI **+15.0%**.

---

## 2. Mô Hình Đề Thích Ứng Alpha (Adaptive Dual Alpha)

### A. Nguyên Lý Tuyển Chọn Động 21 Cặp
Không cố định 2 phương pháp mà quét ma trận $\binom{7}{2} = 21$ cặp phương pháp mỗi ngày:
- Tính chỉ số Jaccard Similarity $J(M_a, M_b) = \frac{|\mathcal{S}_a \cap \mathcal{S}_b|}{|\mathcal{S}_a \cup \mathcal{S}_b|}$.
- Điểm hợp lực đa mục tiêu:
  $$\text{Score}_{\text{Pair}} = \alpha \cdot \text{Win}_{\text{Hist}} + \beta \cdot J(M_a, M_b) + \gamma \cdot \text{Momentum}_{\text{Recent}}$$
- Chế độ tự thích ứng:
  - **Tấn Công X2 (Offensive)**: Khi hệ thống đang có chuỗi thắng, ưu tiên cặp có độ trùng tối ưu (24–27 số trùng) để ăn đậm +108M.
  - **Phòng Thủ Cắt Dây (Defensive)**: Khi xuất hiện 2 kỳ thua liên tiếp, tự động chuyển sang cặp có độ bù khuyết cao (20–24 số trùng, tổng dàn 36–40 số) để bảo toàn tỷ lệ trúng 61.2%.

---

## 3. Mô Hình Lô QMBF v5 (Quantum Bayes-Markov & Positional Form Fusion)

### A. 7 Động Cơ Thành Phần & Tích Hợp RRF
Xếp hạng Reciprocal Rank Fusion (RRF) kết hợp 7 động cơ độc lập:
$$\text{Score}_{\text{RRF}}(n) = \sum_{e=1}^7 \frac{w_e}{K + \text{Rank}_e(n)}$$
với $K = 20.0$ và bộ trọng số tối ưu:
1. $w_{\text{Markov}} = 1.90$: Ma trận chuyển tiếp trạng thái 2 chiều.
2. $w_{\text{Bridge}} = 0.20$: Cầu vị trí tương quan GĐB/G1/G7.
3. $w_{\text{Form}} = 0.25$: Cộng hưởng dạng số, Chạm & Tổng kỳ vọng.
4. $w_{\text{HT}} = 0.30$: Động lượng nhịp Đầu/Đuôi.
5. $w_{\text{Momentum}} = 0.30$: Xung lực tần số trúng 3-7-15 kỳ.
6. $w_{\text{Affinity}} = 0.25$: Ma trận cặp số hay đi cùng nhau (Co-occurrence).
7. $w_{\text{Shadow}} = 0.15$: Tương quan bóng âm dương và số đảo.

### B. Bộ Lọc Đa Dạng Hóa Đuôi Số (Tail Diversity Filter)
- Không cho phép chọn quá 2 số có cùng chữ số đuôi (`maxPerTail: 2`).
- Ngăn ngừa rủi ro gãy cầu hàng loạt khi toàn bộ một đầu hoặc đuôi bị "câm" trong kỳ quay.

### C. Hiệu Suất Kiểm Chứng 2026 (245 Kỳ)
- **Top 6 Lô**: 226/245 ngày trúng (**92.2%**), Lãi **+1.390M** (ROI +43.0%).
- **Top 10 Lô**: 243/245 ngày trúng (**99.2%**), Lãi **+2.002M** (ROI +37.1%).
- **Top 20 Lô**: 245/245 ngày trúng (**100%**), Lãi **+2.828M** (ROI +26.2%).
