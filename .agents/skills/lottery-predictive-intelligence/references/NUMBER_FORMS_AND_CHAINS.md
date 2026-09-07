# Cẩm Nang Phân Tích Dạng Số & Chuỗi Nhịp Xác Suất (Number Forms & Sequence Engineering)

Tài liệu này hệ thống hóa toàn bộ các cấu trúc phân tích dạng số, chuỗi nhịp thời gian và đồ thị tương quan vị trí đang được hệ thống sử dụng để dự đoán Lô và Đề trên toàn bộ dữ liệu 20 năm XSMB.

---

## 1. Hệ Thống Dạng Số (Semantic Number Partitions)

Mỗi số tự nhiên hai chữ số $n \in \{00, 01, \dots, 99\}$ với $n = 10 \cdot d_1 + d_2$ ($d_1, d_2 \in \{0, \dots, 9\}$) được ánh xạ đồng thời vào các không gian phân vùng trực giao:

### A. Hệ Chạm (Touch / Digit Presence - 10 Chạm)
- **Chạm $k \in \{0, \dots, 9\}$**: Tập hợp các số có ít nhất một chữ số là $k$:
  $$\text{Cham}(k) = \{ 10 \cdot d_1 + d_2 \mid d_1 = k \lor d_2 = k \}$$
  Mỗi Chạm gồm đúng 19 số (10 số đầu $k$ và 10 số đuôi $k$, trừ số kép $kk$).
- **Bóng Dương (Solar Shadow)**: $k \leftrightarrow (k + 5) \pmod{10}$ (0-5, 1-6, 2-7, 3-8, 4-9).
- **Bóng Âm (Lunar Shadow)**: 0-7, 1-4, 2-9, 3-6, 5-8.

### B. Hệ Tổng (Digit Sum Modulo 10 & Raw Sum)
- **Tổng Cơ Bản (0-9)**:
  $$\text{Tong}(s) = \{ 10 \cdot d_1 + d_2 \mid (d_1 + d_2) \pmod{10} = s \}$$
  Mỗi tổng gồm đúng 10 số.
- **Tổng Đầy Đủ (0-18)**: Tổng thực tế $d_1 + d_2$, phân bố đối xứng hình tam giác quanh giá trị kỳ vọng $\mu = 9$.

### C. 15 Bộ Số Truyền Thống (The 15 Canonical Bo Groups)
Các số liên kết chặt chẽ qua phép quay bóng âm dương và số đảo:
- **Bộ 01**: 01, 10, 06, 60, 51, 15, 56, 65 (8 số)
- **Bộ 02**: 02, 20, 07, 70, 25, 52, 57, 75 (8 số)
- **Bộ 03**: 03, 30, 08, 80, 35, 53, 58, 85 (8 số)
- **Bộ 04**: 04, 40, 09, 90, 45, 54, 59, 95 (8 số)
- **Bộ 12**: 12, 21, 17, 71, 26, 62, 67, 76 (8 số)
- **Bộ 13**: 13, 31, 18, 81, 36, 63, 68, 86 (8 số)
- **Bộ 14**: 14, 41, 19, 91, 46, 64, 69, 96 (8 số)
- **Bộ 23**: 23, 32, 28, 82, 37, 73, 78, 87 (8 số)
- **Bộ 24**: 24, 42, 29, 92, 47, 74, 79, 97 (8 số)
- **Bộ 34**: 34, 43, 39, 93, 48, 84, 89, 98 (8 số)
- **Bộ 00 (Kép)**: 00, 55, 05, 50 (4 số)
- **Bộ 11 (Kép)**: 11, 66, 16, 61 (4 số)
- **Bộ 22 (Kép)**: 22, 77, 27, 72 (4 số)
- **Bộ 33 (Kép)**: 33, 88, 38, 83 (4 số)
- **Bộ 44 (Kép)**: 44, 99, 49, 94 (4 số)
Tổng cộng: $10 \times 8 + 5 \times 4 = 100$ số (phủ trọn $00 \dots 99$).

### D. Hệ Chẵn Lẻ & Lớn Nhỏ (Parity & Size State Matrix)
- **Parity 4 trạng thái**: Chẵn-Chẵn (CC, 25 số), Chẵn-Lẻ (CL, 25 số), Lẻ-Chẵn (LC, 25 số), Lẻ-Lẻ (LL, 25 số).
- **Size 4 trạng thái**: Bé-Bé ($00..44$), Bé-Lớn ($05..49$), Lớn-Bé ($50..94$), Lớn-Lớn ($55..99$).

---

## 2. Phân Tích Chuỗi & Nhịp Rơi (Sequence & Chain Analytics)

### A. Chuỗi Nhỏ Trước (Chain Small First)
- Phát hiện các chuỗi rơi liên tiếp của các tập số có bước nhảy nhỏ (nhịp dồn tích).
- Khi một chuỗi đạt độ dài tới hạn (đạt hoặc vượt mốc kỷ lục 20 năm `recordLen`), xác suất đảo chiều hoặc tiếp diễn đạt mức phân kỳ cực đại $\rightarrow$ Cung cấp tín hiệu chọn dàn 30 số có độ chính xác cao.

### B. Ma Trận Chuyển Trạng Thái Markov (Markov Transition Tensor)
Mô hình hóa xác suất có điều kiện bậc 1 và bậc 2:
$$P(S_t = j \mid S_{t-1} = i) = \frac{C(i \to j) + \alpha}{\sum_k [C(i \to k) + \alpha]}$$
- Ứng dụng chuyển trạng thái từ kết quả kỳ $D-1$:
  - Chuyển tiếp Đầu số: $P(d_1^{(t)} \mid d_1^{(t-1)})$
  - Chuyển tiếp Đuôi số: $P(d_2^{(t)} \mid d_2^{(t-1)})$
  - Chuyển tiếp Tổng: $P(\text{Tong}^{(t)} \mid \text{Tong}^{(t-1)})$
  - Chuyển tiếp Parity: $P(\text{Parity}^{(t)} \mid \text{Parity}^{(t-1)})$

### C. Khoảng Cách Nhịp Rơi & Phân Rã Bán Rã (Half-Life Gap Decay)
- Với mỗi số $n \in 00..99$, nhịp rơi $g_n$ là số ngày liên tiếp chưa về.
- Xác suất Poisson/Negative-Binomial kết hợp phân rã hàm mũ:
  $$\text{Score}_{\text{Decay}}(n) = \exp(-\lambda \cdot |g_n - \mu_n|) \cdot \left(1 + \gamma \cdot \frac{g_n}{\sigma_n}\right)$$
  - Ngăn ngừa cược vào số "gan lì" (quá chu kỳ phân tán).
  - Tối ưu hóa các số đang ở điểm rơi vàng (vùng trung vị nhịp rơi 2–5 ngày).

---

## 3. Đồ Thị Cầu Vị Trí Giải Thưởng (Positional Bridge Graph)

Mỗi kỳ quay XSMB có 27 giải với hàng chục vị trí con số độc lập. Đồ thị Cầu Vị Trí kết nối các nút giải thưởng:
- **Cầu GĐB $\leftrightarrow$ G7 (Tâm điểm động năng)**:
  Ghép con số hàng vạn/hàng chục của GĐB với các con số của 4 giải Bảy (G7.1, G7.2, G7.3, G7.4).
- **Cầu G1 $\leftrightarrow$ G3 (Cầu dẫn nhịp)**:
  Ghép số đầu Giải Nhất với số đuôi Giải 3.
- Khi một cặp vị trí chạy thông $\ge 3$ ngày liên tiếp trong lịch sử và giữ vững tính ổn định thống kê trong 60 kỳ gần nhất, trọng số cầu $w_{\text{Bridge}}$ được kích hoạt tối đa.
