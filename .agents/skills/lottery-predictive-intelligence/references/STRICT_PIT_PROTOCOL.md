# Giao Thức Chuẩn Strict Point-In-Time (Strict PIT Protocol)

## 1. Nguyên Tắc Cốt Lõi (Core Invariants)
Trong mô hình hóa và dự đoán xác suất xổ số (XSMB), **Strict Point-In-Time (Strict PIT)** là nguyên tắc tối thượng để ngăn chặn 100% hiện tượng rò rỉ dữ liệu tương lai (future data leakage), đảm bảo mọi kết quả backtest và chỉ số lợi nhuận phản ánh chính xác 100% thực tế.

### Quy tắc biên thời gian bất biến (Time-Boundary Invariant)
Khi sinh dự đoán hoặc tính toán đặc trưng (features) cho ngày quay thưởng $D$:
$$\mathcal{F}_D \subseteq \sigma(\{ \text{Draw}_t \mid t \le D-1 \})$$
- Tuyệt đối **KHÔNG ĐƯỢC** sử dụng kết quả giải đặc biệt hoặc bất kỳ giải nào của ngày $D$ hoặc các ngày sau $D$.
- Mọi thống kê tần suất, nhịp lặp, chuỗi, ma trận chuyển tiếp Markov, đồ thị cầu liên vị trí, độ lệch chuẩn hay xếp hạng phương pháp chỉ được phép tổng hợp từ lịch sử đến hết $D-1$.

---

## 2. Các Dạng Rò Rỉ Dữ Liệu Nguy Hiểm & Cách Phòng Ngừa

### A. Rò rỉ qua chỉ mục chuỗi toàn phần (Full-Index Filtering Leakage)
- **Sai lầm phổ biến**: Đọc một tệp thống kê chuỗi đã được tính sẵn trên toàn bộ lịch sử 20 năm rồi lọc `date <= D-1`.
- **Nguyên nhân rò rỉ**: Một chuỗi (streak/chain) được định danh là "chuỗi tiềm năng" hay "kỷ lục" trong tệp sẵn đó có thể do các kỳ quay trong tương lai (sau $D$) tạo nên!
- **Quy chuẩn phòng ngừa**:
  1. Tái tạo trạng thái chuỗi chỉ từ tập dữ liệu thô (raw draws) cắt cụt tại $D-1$ (`raw.filter(r => r.date < D)`).
  2. Hoặc đọc từ **Snapshot bất biến** (immutable snapshot) đã được đóng băng và mã hóa băm (hash fingerprint) tại thời điểm $D-1$.

### B. Rò rỉ qua việc đóng băng Baseline năm (Annual Milestone Frozen)
- Để dự đoán các ngày trong năm $Y$ (ví dụ năm 2026):
  - Baseline mốc 20 năm chỉ được lấy dữ liệu kết thúc vào **ngày 31 tháng 12 của năm $Y-1$** (tức 31/12/2025).
  - Không được cập nhật lại định nghĩa mốc của năm $Y$ bằng dữ liệu đã mở thưởng trong năm $Y$.

### C. Rò rỉ qua việc chọn cặp phương pháp (Method Pair Selection Leakage)
- Khi tuyển chọn cặp phương pháp (M1, M2) cho ngày $D$:
  - Chỉ số độ bù trừ (complementarity), tỷ lệ bao phủ (union coverage), độ trùng khớp (overlap), và tỷ lệ thắng lịch sử của từng phương pháp chỉ được tính từ các ngày đối soát $t \le D-1$.
  - Không được "nhìn trộm" xem ngày $D$ phương pháp nào trúng rồi mới chọn phương pháp đó làm đại diện!

---

## 3. Quy Trình Kiểm Thử Tự Động (Automated PIT Audit Checklist)

Mọi thuật toán hoặc script nghiên cứu trước khi đưa vào thực chiến phải vượt qua 5 bài kiểm tra tự động:

1. **Shifted Result Invariance Test**: Thay đổi kết quả ngày $D+k$ ($k \ge 0$) thành một số ngẫu nhiên hoặc giá trị giả lập; kiểm tra xem dàn số dự đoán cho ngày $D$ có thay đổi không. Nếu có bất kỳ sự thay đổi nào $\rightarrow$ **FAIL (Có rò rỉ)**.
2. **Deterministic Seed & Chronological Replay**: Khả năng tái lập 100% dự đoán của ngày $D$ khi chỉ cung cấp lịch sử đến $D-1$.
3. **Unsettled Snapshot Integrity**: Trước 18h30 ngày $D$, trường `actual` phải luôn là `null` hoặc không xác định; không được chuyển thành `00` hay giá trị mặc định.
4. **Holdout Discipline**: Dữ liệu năm 2026 được coi là tập kiểm định ngoài mẫu (Out-Of-Sample / Holdout). Tối ưu hóa trọng số mô hình chỉ thực hiện trên dữ liệu 2005–2025.
5. **No Lookahead in Capital Allocation**: Cơ chế cược (X3, X2, X1) phải được gán cố định trước giờ quay theo quy tắc giao thoa tập hợp, không thay đổi sau khi có kết quả.
