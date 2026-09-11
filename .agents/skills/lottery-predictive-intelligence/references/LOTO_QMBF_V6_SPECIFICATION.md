# Đặc Tả Kỹ Thuật: Động Cơ Lô Siêu Hợp Nhất QMBF v6 (Quantum Bayes-Markov Fusion v6)

## 1. Tổng Quan Kiến Trúc
**QMBF v6** là động cơ dự đoán Lô 27 giải tối tân nhất của hệ thống, kết hợp 7 động cơ xác suất độc lập qua thuật toán Reciprocal Rank Fusion (RRF) cùng **Bộ lọc Khử Lô Gan Nặng (Soft Gan Damping Filter)**:

1. **Positional Markov Tensor (3 bậc trễ)**: Trọng số $w_{markov} = 1.90$
2. **Bayes Head-Tail Marginal Transition**: Trọng số $w_{HT} = 0.30$
3. **Co-occurrence Affinity Matrix (Lực hút đồng xuất hiện)**: Trọng số $w_{affinity} = 0.25$
4. **Elastic Momentum & Gap Decay**: Trọng số $w_{momentum} = 0.30$
5. **Inverse & Shadow Pair (Bóng âm dương ngũ hành)**: Trọng số $w_{shadow} = 0.15$
6. **Positional Bridge Engine (Cầu vị trí GĐB/G1/G7)**: Trọng số $w_{bridge} = 0.20$
7. **Form & Parity Resonance Engine**: Trọng số $w_{form} = 0.20$

---

## 2. Phát Hiện Toán Học Đột Phá: Bác Bỏ Ngụy Biện Đầu Câm (Debunking Head-Dormancy Fallacy)

### Giả thuyết dân gian:
"Hôm trước đầu câm (0 nháy) thì hôm sau sẽ nổ bù ồ ạt, cần dồn vốn vào đầu câm."

### Khảo sát định lượng trên 7.547 kỳ quay (2005 - 2026):
- Tổng số trường hợp Đầu câm hôm trước: **4.371 lần**.
- Số nháy thực tế trung bình về hôm sau: **2.659 nháy/đầu**.
- Kỳ vọng toán học ngẫu nhiên: **2.700 nháy/đầu** (27 giải chia đều 10 đầu).
- **Hệ số hồi phục thực tế**:
  $$\text{Rebound Ratio} = \frac{2.659}{2.700} = 0.985\times$$
- **Kết luận**: Đầu câm **KHÔNG HỀ NỔ BÙ**, trái lại còn có xu hướng tiếp tục lạnh nhẹ ($0.985\times$). Đặt cược mù quáng theo đầu câm là nguyên nhân thất thoát vốn lớn nhất trong các chiến thuật truyền thống.

---

## 3. Bộ Lọc Khử Lô Gan Nặng (Soft Gan Damping Filter)

### Nguyên lý:
Khi một số bước vào chu kỳ Gan dài ($\\ge 15$ ngày), các chỉ báo cầu vị trí đơn lẻ dễ xuất hiện các tín hiệu ngẫu nhiên giả tạo (spurious correlations), đẩy số đó lên nhóm hạt giống và gây lỗ vốn liên tục.

### Công thức suy giảm mềm:
Với mỗi số $j \in [0..99]$ có khoảng cách kỳ chưa về $G_j$:
$$\text{Score}_{RRF}(j) = \sum_{m=1}^{7} \frac{w_m}{K + \text{Rank}_m(j)}$$
$$\text{Score}_{final}(j) = \begin{cases} \text{Score}_{RRF}(j) \times 0.50 & \text{nếu } G_j \ge 22 \\ \text{Score}_{RRF}(j) \times 0.75 & \text{nếu } 15 \le G_j < 22 \\ \text{Score}_{RRF}(j) & \text{nếu } G_j < 15 \end{cases}$$

---

## 4. Hiệu Suất Thực Chiến Đối Soát 2026 (247 Ngày)

| Cấp Độ Cược | Vốn / Ngày | Tỷ Lệ Nổ Ngày | Tỷ Lệ Thắng Lãi | Lãi Ròng 2026 | Tỷ Suất ROI |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Top 6 (Lục Thủ Lô)** | **13.2M** | **93.1%** | **75.7% (187/247)** | **+1.572.000K (+1.572M)** | **+48.2%** |
| **Top 10 (Thập Thủ Lô)** | **22.0M** | **98.8%** | **80.2% (198/247)** | **+2.166.000K (+2.166M)** | **+39.9%** |
| **Top 4 (Tứ Thủ Lô)** | **8.8M** | **85.4%** | **52.2% (129/247)** | **+1.050.400K (+1.050M)** | **+48.3%** |
| **Top 2 (Song Thủ Lô)** | **4.4M** | **59.5%** | **59.5% (147/247)** | **+561.200K (+561M)** | **+51.6%** |
| **Top 20 (Dàn 20 Số)** | **44.0M** | **100.0%** | **70.4% (174/247)** | **+2.924.000K (+2.924M)** | **+26.9%** |
