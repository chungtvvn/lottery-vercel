# Đặc Tả Kỹ Thuật: Trí Tuệ Loại Trừ V2 (Exclusion Intelligence V2)

## 1. Vấn Đề Khoa Học & Điểm Mù Của Logic Cũ

### A. Điểm mù ngây thơ 100% Gãy (100% Drop-Off Fallacy)
- **Thuật toán cũ**: Khi một chuỗi đạt hoặc vượt kỷ lục lịch sử 20 năm ($L \ge L_{max}$), vì trong quá khứ chưa từng ghi nhận độ dài $> L_{max}$ nên $\text{nextCount} = 0$. Thuật toán cũ tính:
  $$\text{dropOffRate} = 1.0 - \frac{0}{\text{curCount}} = 100\%$$
  và tự động gán nhãn Tier 1 tuyệt đối, loại trừ mù toàn bộ tập số của chuỗi này.
- **Thực tế kiểm định 2026 (246 kỳ quay)**:
  - Có 11.267 cơ hội chuỗi kỷ lục xuất hiện.
  - Trong **1.513 lần (13,43%)**, chuỗi kỷ lục **VẪN TIẾP TỤC ĐI TIẾP**, không hề gãy ngay!
  - Trong **87,8% số ngày (216/246 ngày)**, số trúng giải Đặc biệt thực tế nằm trong một chuỗi kỷ lục đang chạy tiếp.

### B. Kích thước tập số bất đối xứng (Set-Size Asymmetry)
- Chuỗi kỷ lục bị gãy có kích thước trung bình **8,61 số**.
- Chuỗi kỷ lục tiếp tục có kích thước trung bình lên tới **49,55 số**.
- Khi loại trừ mù một tập 50 số với độ tin cậy 100%, hệ thống đã loại bỏ oan 1 nửa bảng số và triệt hạ chính số trúng.

### C. Bẫy điểm ưu tiên 102 của dạng tiềm năng (Never-Formed Pattern)
- Các dạng chưa từng hình thành trong năm bị gán cứng điểm 102.0 (cao hơn cả kỷ lục 100.0) và ép lên đầu danh sách loại trừ dù chưa đủ bằng chứng thực nghiệm.

---

## 2. Giải Pháp Toán Học: Làm Mịn Bayes-Laplace & Set-Size Guarding

### A. Làm mịn Bayes-Laplace tại biên kỷ lục
Tại điểm biên kỷ lục ($L \ge L_{max}$), thay vì giả định $100\%$ gãy, tích hợp làm mịn Bayes với prior baseline:
$$\text{dropOffRate} = \frac{\text{breakCount} + \nu \cdot \text{baselineBreak}}{\text{curCount} + \nu}$$
Với $\nu = 2.0$, $\text{baselineBreak} = 0.86$. Tỷ lệ gãy tối đa chỉ đạt $\approx 93\% - 95\%$, ngăn chặn việc loại trừ mù tuyệt đối.

### B. Cơ chế bảo vệ tập số rộng (Set-Size Guard)
- Tập số $> 25$ số không được phép loại trừ nếu điểm ưu tiên $< 92.0$.

### C. Hạn ngạch họ dạng số (Family Quota)
- Giới hạn tối đa 3 ứng viên loại trừ từ cùng một họ dạng số để phân tán rủi ro và đa dạng hóa nguồn tín hiệu.

### D. Tái cân bằng điểm ưu tiên
- Dạng chưa hình thành (`never-formed`): Hạ từ Tier 1 xuống Tier 2/3 với điểm dao động `76.0 - 86.0`.
- Chuỗi kỷ lục: Điểm điều chỉnh về `94.0 - 96.0`.

---

## 3. Hiệu Năng Thực Chiến Đạt Được
- Phương pháp nền tảng `dedupEdge50CombinedB40S05Hold70` tăng tỷ lệ trúng từ **79,67% (196/246) lên 80,08% (197/246 kỳ)**.
- Giữ vững 100% nguyên tắc Strict Point-In-Time (Strict PIT).
