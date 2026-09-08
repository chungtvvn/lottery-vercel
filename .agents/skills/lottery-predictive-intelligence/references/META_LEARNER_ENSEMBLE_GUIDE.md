# Meta-Learner Multi-Objective Fusion & Dynamic Ensemble Pruning

Tài liệu hướng dẫn chuyên sâu về kiến trúc **Meta-Learner Multi-Objective Fusion** và kỹ thuật **Dynamic Ensemble Pruning** (Dung hợp cắt tỉa động) ứng dụng trong dự đoán Xổ số Miền Bắc (XSMB), đã được kiểm định thực nghiệm và đạt **Quán quân Thực chiến Live (+36M lãi ròng, ROI +12.0%)**.

---

## 1. Cơ Sở Lý Thuyết & Động Lực Nghiên Cứu

Trong môi trường xác suất rời rạc có nhiễu cao ($N = 100$ trạng thái từ 00 đến 99), việc dựa trên một mô hình đơn lẻ thường dễ gặp hiện tượng **overfitting** vào chuỗi may mắn cục bộ (hot streaks) hoặc sụp đổ sâu khi thị trường bước vào pha chuyển tiếp (phase transition).

Mô hình Meta-Learner giải quyết bài toán này bằng cách:
1. **Dung hợp đa không gian trạng thái (Multi-Objective Fusion)**: Không chỉ đo đạc tần suất trúng (Hit Rate), mà còn tối ưu hóa đồng thời 4 hàm mục tiêu:
   - **Wilson Lower Bound 90% (Xác suất cận dưới an toàn)**: Phạt nặng các phương pháp chỉ trúng ngẫu nhiên ở mẫu nhỏ.
   - **Handoff Resilience (Khả năng phục hồi sau trượt)**: Ưu tiên các phương pháp có xác suất bật lại cao ngay sau 1-2 nhịp gãy.
   - **Kháng Max Drawdown 20 năm (Historical Resilience)**: Kiểm soát rủi ro sụt giảm vốn dài hạn.
   - **Độ phân kỳ thông tin (Shannon Entropy & Diversity)**: Tránh việc các mô hình con trùng lặp tín hiệu mù quáng.
2. **Cắt tỉa động (Dynamic Ensemble Pruning)**:
   - Thu thập phân phối xác suất tiên nghiệm từ các phương pháp nền tảng ($P_m(i)$ với $m \in \mathcal{M}, i \in [0, 99]$).
   - Áp dụng Bayesian Model Averaging (BMA) để gán trọng số thích ứng $W_m$.
   - Cắt tỉa các con số có phương sai dao động quá lớn hoặc nằm dưới ngưỡng entropy kỳ vọng, chỉ giữ lại tập hợp tối ưu đa phân tầng (10, 20, 30, 36 số).

---

## 2. Công Thức Toán Học Chính

### A. Wilson Score Lower Bound 90% ($z = 1.6449$)
Với mỗi phương pháp $m$ có $w$ lần trúng trên $n$ ngày quan sát gần nhất:
$$\hat{p} = \frac{w}{n}$$
$$p_{\text{wilson}} = \frac{\hat{p} + \frac{z^2}{2n} - z \sqrt{\frac{\hat{p}(1-\hat{p})}{n} + \frac{z^2}{4n^2}}}{1 + \frac{z^2}{n}}$$

### B. Hàm Trọng Số Hợp Nhất (Composite Score)
Điểm đánh giá ứng viên được tổng hợp từ 3 chiều không gian:
$$S_m = 0.45 \cdot p_{\text{wilson}} + 0.35 \cdot R_{\text{handoff}} + 0.20 \cdot (1 - \text{MDD}_{20y})$$
Trong đó:
- $p_{\text{wilson}}$: Điểm an toàn thống kê gần nhất (cửa sổ 15-30 ngày).
- $R_{\text{handoff}}$: Tỷ lệ trúng tại các kỳ $t+1$ ngay sau kỳ $t$ trượt.
- $\text{MDD}_{20y}$: Tỷ lệ sụt giảm vốn sâu nhất chuẩn hóa trên 20 năm lịch sử.

### C. Trọng Số Bayesian Model Averaging (BMA)
$$\pi_m = \frac{\exp(\beta \cdot S_m)}{\sum_{k \in \mathcal{M}} \exp(\beta \cdot S_k)}$$
Xác suất gộp cho mỗi con số $i \in \{00, \dots, 99\}$:
$$P(i) = \sum_{m \in \mathcal{M}} \pi_m \cdot \mathbb{I}(i \in \text{Dàn}_m)$$

### D. Cắt Tỉa Động & Phân Tầng Số (Dynamic Pruning)
Sắp xếp $i \in \{00, \dots, 99\}$ giảm dần theo $P(i)$:
- **Tầng VIP (Core 10)**: Top 10 số có $P(i)$ cao nhất và độ lệch chuẩn $\sigma(P_i) < \theta$.
- **Tầng Ưu Tú (Core 20)**: Top 20 số, điểm cân bằng ROI tối ưu cho người chơi vốn trung bình.
- **Tầng Chuẩn (Standard 30) [MẶC ĐỊNH SẢN XUẤT]**: Top 30 số, vốn 30M/ngày (1M/số), ăn 84M, lãi ròng +54M khi nổ.
- **Tầng Mở Rộng (Expanded 36)**: Dàn 36 số bảo toàn vốn tối đa.

---

## 3. Kết Quả Thực Nghiệm Thực Chiến Live (28/08/2026 – 07/09/2026)

Đối soát trên 10 kỳ quay số thực tế được khóa snapshot bất biến trước 18h00 mỗi ngày:

| Phương Pháp / Chiến Lược | Vốn / Ngày | Số Trúng / Tổng | Tỷ Lệ Trúng | Lãi Ròng Live | ROI Thực Chiến |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **💎 Đề Tinh Hoa (Dynamic Pruning)** | **30M** | **4 / 10** | **40.0%** | **+36.000K (+36M)** | **+12.0%** |
| **💎 Đề Gộp 2 (Thích Ứng Alpha)** | 60M | 4 / 10 (4 X2) | 40.0% | +12.000K (+12M) | +1.8% |
| **🎯 Đề Gộp 1 (Tiêu Chuẩn)** | 60M | 5 / 10 (2 X2, 3 X1) | 50.0% | -72.000K (-72M) | -10.9% |
| **🏛️ Đề Gộp 3 (Tam Trụ)** | 90M | 5 / 10 (2 X3, 1 X2, 2 X1) | 50.0% | -150.000K (-150M) | -15.2% |

### Ưu Điểm Tuyệt Đối của Meta-Learner:
1. **Áp lực vốn thấp nhất**: Chỉ 30M/ngày (bằng 1/2 Gộp 2 và 1/3 Tam Trụ).
2. **Lợi nhuận ròng dẫn đầu**: Với chỉ 4 lần nổ (ăn 4 x 84M = 336M, trừ 300M vốn) thu lãi ròng +36M, vượt xa tất cả các mô hình gộp phức tạp.
3. **Tính ổn định cao**: Tự động loại bỏ các số nhiễu không có sự hội tụ xác suất từ nhiều góc nhìn.

---

## 4. Hướng Dẫn Tích Hợp & Vận Hành

- Dịch vụ backend: `lib/services/metaLearnerAdvisorService.js`
- Dịch vụ phân tích tối ưu: `lib/services/advisorAnalysisService.js`
- Endpoint API: `/api/daily-advisor`
- Giao diện trực quan: `/daily-advisor` (tab 🌟 Gợi Ý Đề Thực Chiến)
