# Giao Thức Đăng Ký Trước Phương Pháp (Method Pre-Registration Protocol) & Đóng Băng Kho Thuật Toán

---

## 1. Mục Đích & Nguyên Tắc Khoa Học Bất Biến

Nhằm ngăn chặn triệt để hiện tượng **p-hacking** (data snooping / backtest overfitting), đào xới dữ liệu quá mức (cherry-picking) và ảo giác lợi nhuận (survivorship bias) trong hệ thống nghiên cứu dự đoán XSMB:

1. **Tuyệt đối cấm thêm phương pháp chỉ vì thấy backtest có lãi**:
   - Mọi phương pháp mới **BẮT BUỘC** phải được viết giả thuyết khoa học, mô hình hóa toán học, xác định không gian siêu tham số và đăng ký trước (pre-register) vào tài liệu này **TRƯỚC KHI** chạy bất kỳ thử nghiệm hay backtest nào trên dữ liệu lịch sử.
2. **Nguyên tắc Đóng Băng (Frozen Registry)**:
   - Toàn bộ danh mục phương pháp thực chiến hiện tại được **ĐÓNG BĂNG (STATUS: FROZEN)** với cấu trúc tham số cố định.
   - Không được phép thay đổi tham số hồi tố (retroactive parameter tweaking) sau khi đã quan sát kết quả mở thưởng.
3. **Phân Định 3 Vùng Dữ Liệu Rõ Ràng**:
   - **Tập Huấn Luyện (Training Set)**: Dữ liệu $\le$ 2023-12-31.
   - **Vùng Đệm Cách Ly (Embargo)**: 7 ngày giữa các giai đoạn để khử tự tương quan chuỗi.
   - **Tập Thẩm Định (Validation Set)**: 2024-01-08 đến 2025-12-31 (Dùng để hiệu chuẩn nhiệt độ Temperature Scaling, lựa chọn siêu tham số).
   - **Tập Khóa Cứng (Strict Holdout Set)**: 2026-01-01 đến Hiện tại (Khóa cứng 100%, TUYỆT ĐỐI KHÔNG chạm vào để chọn trọng số hay tối ưu hóa).

---

## 2. Quy Trình 4 Bước Đăng Ký Phương Pháp Mới

Mỗi phương pháp mới trước khi đưa vào mã nguồn phải hoàn thành mẫu đăng ký (Pre-Registration Form) gồm 5 tiêu chí:
1. **Giả thuyết khoa học (Inductive Bias / Scientific Hypothesis)**:
   - Cơ chế toán học nào tạo ra lợi thế (Edge) so với phân phối ngẫu nhiên đều? (Ví dụ: chuỗi chuyển tiếp Markov, nhịp trễ Gap decay, cộng hưởng đồ thị cầu vị trí).
2. **Kích thước dàn số & Cấu trúc cược cố định**:
   - Số lượng số được chọn (ví dụ 30 số Đề, hoặc Top 6 Lô).
   - Phân tầng vốn (VIP x2, bọc lót x1).
3. **Ngưỡng hòa vốn lý thuyết (Break-even Threshold)**:
   - Với Đề (1 ăn 84): Dàn $k$ số $\implies$ Tỷ lệ trúng tối thiểu để hòa vốn là $k / 84$.
   - Với Lô (1 điểm 22K ăn 80K): Tỷ lệ nổ tối thiểu là $22 / 80 = 27.5\%$.
4. **Không gian tham số khóa trước (Pre-locked Parameter Bounds)**:
   - Danh sách siêu tham số và giới hạn cho phép (ví dụ: Decay rate $\alpha \in [0.95, 0.99]$, không tune theo bước nhảy tùy tiện).
5. **Tiêu chuẩn Bác Bỏ (Falsification Criteria)**:
   - Điều kiện nào sẽ khiến phương pháp bị loại bỏ ngay lập tức (ví dụ: Log-loss trên tập Validation tệ hơn baseline $1/100$, hoặc sụt giảm Max Drawdown vượt quá 10 kỳ liên tiếp).

---

## 3. Danh Mục Các Phương Pháp Đã Đóng Băng (Frozen Registry)

| Mã Phương Pháp (`methodId`) | Phân Loại | Kích Thước Dàn | Tỷ Lệ Trả Thưởng | Ngưỡng Hòa Vốn | Cơ Chế Toán Học Đăng Ký | Trạng Thái |
| :--- | :--- | :---: | :---: | :---: | :--- | :---: |
| `metaLearner` | Đề Tinh Hoa | 30 số (VIP 10, Ưu tú 20) | 1 ăn 84 | 35.71% | Dung hợp cắt tỉa động, Bayesian Model Averaging, Shannon entropy | **FROZEN** |
| `adaptiveDualMerge` | Đề Gộp Alpha | 37–43 số | 1 ăn 84 | 44.05% | Đảo pha Tấn công/Phòng thủ dựa trên chuỗi thắng thua thực nghiệm | **FROZEN** |
| `dualMerge` | Đề Gộp Chuẩn | 37–43 số | 1 ăn 84 | 44.05% | Vùng giao thoa Sweet-spot (22-26 số) + Form Resonance D-1 | **FROZEN** |
| `tripleMerge` | Đề Tam Trụ | 45–50 số | 1 ăn 84 | 53.57% | Phân tầng 3 mức cược X3/X2/X1 trên 3 phương pháp độc lập | **FROZEN** |
| `deMarkovGapHazard` | Đề Đơn Lẻ | 30 số | 1 ăn 84 | 35.71% | Ma trận Markov bậc 2 + Hàm rủi ro bước nhảy Gap Decay | **FROZEN** |
| `dePositionalGraphFlow` | Đề Đơn Lẻ | 30 số | 1 ăn 84 | 35.71% | Đồ thị luồng vị trí giải ĐB / G1 / G7 | **FROZEN** |
| `bayesFormResonance` | Đề Đơn Lẻ | 30 số | 1 ăn 84 | 35.71% | Tần suất Chạm-Tổng-Bộ 30 ngày + Lô rơi sang Đề | **FROZEN** |
| `loQuantumBayesFusion` | Lô Động Cơ | Top 6 / Top 10 / Top 20 | 22K ăn 80K | 27.50% | Quantum Bayes 7 chiều + Phân rã tensor bước sóng | **FROZEN** |
| `loQuadHybrid` | Lô Động Cơ | Top 6 / Top 7 / Top 20 | 22K ăn 80K | 27.50% | Kết hợp 4 mô hình: Tần suất, Cầu vị trí, Nhịp lặp, Kháng bão hòa | **FROZEN** |
| `loTop4Xien` | Lô Xiên | 6 cặp Xiên 2 | 1 ăn 16.5 | 6.06% | Ma trận đồng xuất hiện Co-occurrence + Bộ lọc độc lập | **FROZEN** |

---

## 4. Kiểm Soát Thay Đổi (Audit Trail & Hash)
- Mọi thay đổi đối với danh mục này phải đi kèm bản kiểm toán Strict PIT và Pull Request có chữ ký số hoặc commit hash niêm phong.
- File JSON máy đọc tương ứng: [FROZEN_METHOD_REGISTRY.json](./FROZEN_METHOD_REGISTRY.json).
