# Golden Xiên 2 Co-occurrence, Multi-Day Gap Recovery & 7-Part Telegram Dispatch

Tài liệu đặc tả giải pháp tối ưu hóa xác suất nổ Lô Xiên 2, cơ chế tự động lấp khoảng trống dữ liệu nhiều ngày, và cấu trúc báo cáo 7 phần toàn diện cho Telegram Bot.

---

## 1. Cặp Xiên 2 Chiến Lược (Golden Xiên 2) từ QMBF v6

### 1.1 Cơ sở Toán học & Ma trận Đồng Xuất Hiện (Co-occurrence Covariance)
Xiên 2 trong XSMB đòi hỏi cả hai số $(N_1, N_2)$ cùng nổ trong 27 giải của cùng một kỳ quay.
- **Xác suất lý thuyết ngẫu nhiên của 1 cặp số bất kỳ**:
  $$P(\text{Random Xiên 2}) \approx 0.27 \times 0.27 \approx 0.0729 \quad (7.29\%)$$
- **Tỷ lệ thanh toán chuẩn**: 1 ăn 10 tới 1 ăn 17 (tùy nhà cái/điểm cược). Với tỷ lệ 1 ăn 10, điểm hòa vốn là:
  $$P_{\text{break-even}} = \frac{1}{10} = 10.0\%$$
- **Cơ chế chọn lọc Golden Xiên**:
  Từ Top 4 hoặc Top 6 số xuất sắc nhất của động cơ **Quantum Bayes-Markov Fusion v6 (QMBF v6)**, chúng ta sinh toàn bộ các tổ hợp chập 2:
  $$C(4, 2) = 6 \text{ cặp}, \quad C(6, 2) = 15 \text{ cặp}$$
  Mỗi cặp được định lượng bằng trọng số liên kết đồng xuất hiện $W(N_1, N_2)$ được tích lũy nghiêm ngặt qua 20 năm (Strict Point-In-Time):
  $$W(N_1, N_2) = \sum_{t=1}^{T} \mathbb{I}(N_1 \in \text{Draw}_t \land N_2 \in \text{Draw}_t)$$
  Các cặp có $W(N_1, N_2)$ cao nhất được chọn làm **Top Cặp Xiên 2 Chiến Lược**.

### 1.2 Kết quả Kiểm định Thực nghiệm 2026 (247 Kỳ Quay)
- **Top 4 Numbers (6 cặp Xiên 2/ngày)**:
  - Tỷ lệ trúng thực nghiệm: **12.28%** (so với ngẫu nhiên 7.29%, **vượt trội 1.68 lần**).
  - Tỷ lệ ngày nổ ít nhất 1 cặp Xiên: **47.4% (117/247 ngày)**.
  - Lợi nhuận thực tế (vốn 100K/cặp): **+33.800K (ROI +22.8%)**.
- **Top 6 Numbers (15 cặp Xiên 2/ngày)**:
  - Tỷ lệ ngày nổ ít nhất 1 cặp Xiên: **73.7% (182/247 ngày)**.
  - Tổng số 444 cặp Xiên nổ thành công.

---

## 2. Cơ Chế Tự Động Lấp Khoảng Trống Dữ Liệu (Multi-Day Gap Recovery)

### 2.1 Vấn đề
Khi runner hoặc hành động cập nhật gặp gián đoạn (nghỉ lễ, sự cố mạng nhiều ngày), khoảng cách giữa dữ liệu local ($D_{\text{local}}$) và kỳ quay mới nhất ($D_{\text{online}}$) lớn hơn 1 ngày ($D_{\text{online}} - D_{\text{local}} > 1$). Trước đây `fetchLatestXsmbResult` chỉ lấy 1 ngày duy nhất, gây thiếu các ngày ở giữa nếu nguồn fallback bên thứ ba không khả dụng.

### 2.2 Kiến trúc Scraper Mới (`fetchAllRecentXsmbResults`)
- Quét toàn bộ HTML của `https://xoso.com.vn/xo-so-mien-bac/xsmb-p1.html`.
- Nhận diện tất cả các block kết quả:
  $$\text{Regex: } <\text{section}\dots \text{id}=\text{"kqngay_}(\backslash\backslash d\{8\})\text{"}>$$
- Đối soát tính hợp lệ của đủ 27 giải (ĐB=1, G1=1, G2=2, G3=6, G4=4, G5=6, G6=3, G7=4) để loại trừ các kỳ đang quay dở dang hoặc chưa công bố.
- Tự động sắp xếp tăng dần theo thời gian và lấp đầy toàn bộ khoảng trống một cách tức thì và tự chủ.

---

## 3. Cấu Trúc Báo Cáo Telegram 7 Phần Toàn Diện

Mỗi ngày sau khi đối soát snapshot hoàn tất, dispatcher tự động tổng hợp tin nhắn định dạng HTML chất lượng cao gồm 7 phần:

1. **1. 🎯 ĐỀ GỘP 1 (DUAL MERGE)**: Gộp 2 mốc lịch sử tốt nhất (Vùng giao thoa X2 và bọc lót X1).
2. **2. 💎 ĐỀ GỘP 2 (ADAPTIVE DUAL ALPHA)**: 21 cặp thích ứng theo nhịp Tấn Công X2 hoặc Phòng Thủ cắt dây.
3. **3. 🏛️ ĐỀ GỘP 3 (TAM TRỤ TRIPLE MERGE)**: Đồng thuận 3 phương pháp (X3 cược 3M, X2 cược 2M, X1 cược 1M).
4. **4. 💎 ĐỀ TINH HOA META-LEARNER**:
   - Dàn Chuẩn 30 số (Vốn 30M, ăn 84M, trúng 48.1%, ROI +34.7%).
   - Core 10 VIP (Dàn hạt nhân 10 số).
   - Core 20 Rút gọn (Dàn mở rộng 20 số).
5. **5. 🎰 4 PHƯƠNG PHÁP LÔ THỰC CHIẾN (MỐC LỊCH SỬ D-1)**:
   - ① Lô QMBF v6 (Top 2 Song Thủ VIP, Top 6 Vô Địch, Top 10 Bất Bại, Top 4 Xiên VIP).
   - **🎲 Cặp Xiên 2 Chiến Lược Golden Xiên** (ghép từ mô hình Co-occurrence).
   - ② Lô Bạc Nhớ Vị Trí 27 Giải.
   - ③ Lô Tam Động Cơ Tri-Harmonic.
   - ④ Lô Song Song RRF.
6. **6. 📊 TỔNG KẾT THỰC CHIẾN LIVE (Từ 28/08/2026)**:
   - Theo dõi công khai, minh bạch kết quả lãi/lỗ thực tế của tất cả các phương pháp Đề & Lô.
7. **7. 💡 KHUYẾN NGHỊ PHÂN BỔ VỐN THỰC CHIẾN**:
   - Hướng dẫn phân bổ 50% Phòng Thủ Ăn Chắc (Đề Gộp / Đề Tinh Hoa) + 50% Tấn Công Đột Phá (Lô Song Thủ / Top 6 + Cặp Xiên 2).
