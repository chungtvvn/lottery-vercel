# Bách Khoa Toàn Thư Phương Pháp Xổ Số: Danh Mục Toàn Phổ Lô & Đề (Comprehensive Methods Catalog)

Bách khoa toàn thư phân loại, đối chiếu công thức, ma trận rủi ro và hiệu năng thực chiến của **TẤT CẢ** các phương pháp Lô và Đề trong hệ thống **Lottery Predictive Intelligence**, tuân thủ 100% nguyên tắc **Strict Point-In-Time (Strict PIT)** và **Cận Kỳ Vọng Toán Học (Theoretical Expectation Bounds)** dựa trên dữ liệu 20+ năm Xổ số Miền Bắc (2005–2026, 7.575 kỳ quay).

---

## 1. Phổ Phương Pháp Đề (Đặc Biệt 2 Số Cuối)

### 1.1. Bảy (07) Phương Pháp Đơn Lẻ Nền Tảng (Single Baseline Methods - Pool 7)

Tất cả các phương pháp đơn lẻ đều tạo ra dàn **30 số** cố định, được huấn luyện và đóng băng theo mô hình hàng năm (Annual Frozen Baseline). Tỷ lệ trúng thực tế dài hạn của dàn 30 số nằm trong biên xác suất $34.0\% - 42.0\%$ (bác bỏ mọi kết quả ảo $>48\%$):

1. **`dedupEdge50Hold70` - Dự đoán Edge 50% Khử Trùng (Hold 70)**:
   - *Cơ chế*: Lọc biên tần suất xuất hiện với ngưỡng tin cậy 50%, loại bỏ các số trùng lặp trong cụm và duy trì thời gian giữ nhịp 70 kỳ.
   - *Đặc điểm*: Độ ổn định cao, phản ứng vừa phải với biến động ngắn hạn.

2. **`dedupEdge75Hold70` - Edge 75% PIT Có Kiểm Chứng (Hold 70)**:
   - *Cơ chế*: Đặt ngưỡng biên khắt khe 75% kèm xác thực Strict Point-In-Time, chỉ giữ lại các số có xác suất hậu nghiệm vượt trội.
   - *Đặc điểm*: Tỷ lệ trúng độc lập thuộc nhóm cao nhất trong các phương pháp đơn lẻ.

3. **`dedupDropoffHold70` - Dropoff Khử Trùng Tập Số (Hold 70)**:
   - *Cơ chế*: Khai thác hiện tượng suy giảm đột ngột (dropoff) của chuỗi tần suất, nhận diện thời điểm một cụm số chuẩn bị tái xuất hiện sau chu kỳ vắng bóng.
   - *Đặc điểm*: Bắt nhịp hồi phục sau chu kỳ gan ngắn cực tốt.

4. **`avgEdge50Hold70` - Dropoff Trung Bình Từng Số (Hold 70)**:
   - *Cơ chế*: Tính giá trị kỳ vọng trung bình trượt của từng con số kết hợp ngưỡng biên 50%.
   - *Đặc điểm*: Độ mượt cao, giảm thiểu nhiễu đột biến trong ngày.

5. **`chainSmallFirstHold70` - Đề Chuỗi Nhỏ Trước (Hold 70)**:
   - *Cơ chế*: Ưu tiên các chuỗi có bước nhảy nhỏ (nhịp rơi dày 1–3 kỳ) xuất hiện trước trong lịch sử.
   - *Đặc điểm*: Rất mạnh trong giai đoạn thị trường đi theo dạng bệt chạm hoặc bệt tổng.

6. **`edgeHold70` - Nhịp Block Trước (Hold 70)**:
   - *Cơ chế*: Phân tích khối 10 số (Block) có mật độ xuất hiện cao ở các kỳ quay gần nhất.
   - *Đặc điểm*: Bắt các cụm đầu/đuôi tập trung rất hiệu quả.

7. **`dedupEdge50CombinedB40S05Hold70` - Đề Boost B40S05 Kết Hợp (Hold 70)**:
   - *Cơ chế*: Kết hợp thuật toán Edge 50% với hệ số khuếch đại Boost Block 40 và Smooth 0.05.
   - *Đặc điểm*: Tối ưu hóa xác suất biên, độ nhạy cao với các dạng số đảo.

---

### 1.2. Ba (03) Phương Pháp Đề Gộp Thực Chiến (Multi-Method Ensembles)

*Số liệu đối soát thực tế 100% Strict PIT trên 275 kỳ mở thưởng năm 2026 (01/01/2026 – 06/10/2026):*

| Đặc tính | Đề Gộp 1: Tiêu Chuẩn (`dualMerge`) | Đề Gộp 2: Thích Ứng Alpha (`adaptiveDualMerge`) | Đề Gộp 3: Tam Trụ (`tripleMerge`) |
| :--- | :--- | :--- | :--- |
| **Số thuật toán gộp** | 2 phương pháp | 2 phương pháp (chọn động từ 21 cặp) | 3 phương pháp (chọn động từ 35 bộ ba) |
| **Phân tầng cược** | 2 tầng: X2 (trùng) & X1 (riêng) | 2 tầng: X2 (trùng) & X1 (riêng) | 3 tầng: X3 (trùng 3), X2 (trùng 2), X1 (riêng) |
| **Tổng vốn / ngày** | Cố định **60M (60.000K)** | Cố định **60M (60.000K)** | Cố định **90M (90.000K)** |
| **Mức thưởng trúng lớn nhất** | Ăn X2: **168M** (Lãi **+108M**, ROI +180%) | Ăn X2: **168M** (Lãi **+108M**, ROI +180%) | Ăn X3: **252M** (Lãi **+162M**, ROI +180%) |
| **Mức thưởng bọc lót** | Ăn X1: **84M** (Lãi **+24M**, ROI +40%) | Ăn X1: **84M** (Lãi **+24M**, ROI +40%) | Ăn X2: **168M** (Lãi **+78M**) / Ăn X1: **84M** (Lỗ nhẹ -6M) |
| **Cơ chế thích ứng** | Xung lực lùi 30/15/7 ngày + Sweet-spot Overlap + Form Resonance | Chế độ Tấn Công (Offensive) vs Phòng Thủ (Defensive) | Sweet-Spot Triad Overlap + Xung lực bộ ba + Form Resonance |
| **Tỷ lệ trúng thực tế 2026** | **36.7%** (101/275 ngày) | **33.5%** (92/275 ngày) | **39.3%** (108/275 ngày) |
| **Wilson 95% Cận dưới** | **31.2%** | **28.1%** | **33.7%** |
| **Đánh giá Cận kỳ vọng** | Chuẩn thực tế ($36\% - 44\%$) | Nhịp chuyển trạng thái cân bằng | Tối ưu phân tầng vốn đa cấp |

---

### 1.3. Phương Pháp Tuyển Chọn Độc Lập & Đồng Thuận (Selectors & Consensus)
- **`balanced-selector-fixed30-v1` (Bộ chọn cân bằng)**: Tự động chọn 1 dàn 30 số tốt nhất từ các phương pháp nền tảng bằng posterior Bayes 7/30/90 kỳ kết hợp cận dưới khoảng tin cậy Wilson.
- **`all-method-fixed30-consensus-v1` (Đồng thuận toàn bộ dàn 30)**: Bỏ phiếu có trọng số qua toàn bộ các dàn ứng viên để chọn ra dàn 30 số có độ đồng thuận liên thuật toán cao nhất.

---

## 2. Phổ Phương Pháp Lô (27 Giải Xổ Số Miền Bắc)

Lô miền Bắc có 27 giải thưởng, xác suất một con số xuất hiện ít nhất 1 lần trong bảng kết quả ngẫu nhiên là xấp xỉ $1 - (0.99)^{27} \approx 23.78\%$.

### 2.1. Động Cơ Siêu Hợp Nhất QMBF v6.1 (Quantum Bayes-Markov Fusion)
QMBF v6.1 tích hợp **7 động cơ độc lập** thông qua thuật toán dung hợp thứ hạng tương hỗ (Reciprocal Rank Fusion - RRF, $K = 16.0$):

1. **Engine 1: Positional Markov Tensor ($w = 1.90$)**:
   - Ma trận chuyển trạng thái 3 bậc trễ (Lag 1, Lag 2, Lag 3) trên 20+ năm.
   - Gán trọng số đặc biệt cho vị trí giải: Giải Đặc Biệt (3.6x), Giải Nhất (2.6x), Giải 7 (2.0x).
2. **Engine 2: Head-Tail Bayes Dynamic Momentum ($w = 0.30$)**:
   - Xác suất Bayes phân tích độc lập đầu số ($0-9$) và đuôi số ($0-9$).
3. **Engine 3: Co-occurrence PMI Affinity Matrix ($w = 0.25$)**:
   - Lực hút cặp số cùng về (Pointwise Mutual Information) trên không gian ma trận đối xứng $100 \times 100$.
4. **Engine 4: Elastic Momentum & Lô Rơi Đa Nháy ($w = 0.35$)**:
   - Nhân hệ số $1.15\times$ khi số về $\ge 2$ nháy ở kỳ $D-1$.
5. **Engine 5: Shadow & Inverse Pair Synergy ($w = 0.15$)**:
   - Tương quan cặp số đảo vị trí (như $35 \leftrightarrow 53$) và bóng âm dương ngũ hành.
6. **Engine 6: Positional Bridge Correlation ($w = 0.20$)**:
   - Đồ thị cầu ghép các vị trí trọng điểm: GĐB, G1 và 4 con số của G7.
7. **Engine 7: Form & Parity Transition Resonance ($w = 0.20$)**:
   - Cộng hưởng dạng số: Chạm rơi, chuyển dịch tổng lân cận và số đảo từ giải đặc biệt $D-1$.
8. **Bộ lọc Khử Lô Gan Nặng (Soft Gan Damping Filter)**:
   - Giảm $50\%$ trọng số nếu gan $\ge 22$ kỳ, giảm $25\%$ nếu gan $15 - 21$ kỳ.

---

### 2.2. Bảy (07) Mức Cược Phân Tầng Lô Theo Số Lượng (Loto Top Counts)

Chi phí: **2.200K / điểm (số)**. Tiền thưởng: **8.000K / nháy**.
*Bắt buộc phân biệt giữa Tần suất Nổ (Hit Rate) và Tỷ lệ Có Lãi Ròng (Profitable Rate)*:

| Cấu hình | Vốn / ngày | ĐK Có Lãi | Tần suất Nổ (Hit Rate) | Tỷ lệ Có Lãi (Profitable) | Lãi lũy kế 2026 | ROI 2026 | Đánh giá Chiến Thuật |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Bạch Thủ (Top 1)** | 2.2M | $\ge 1$ nháy | 32.8% (81/247) | **32.8%** | +168.6M | +31.0% | Vốn siêu nhỏ, đòn bẩy hạt nhân. |
| **Song Thủ (Top 2)** | 4.4M | $\ge 1$ nháy | 50.2% (124/247) | **50.2%** | +481.2M | +44.3% | Cân bằng hoàn hảo rủi ro và lợi nhuận. |
| **Tứ Thủ (Top 4)** | 8.8M | $\ge 2$ nháy | 72.5% (179/247) | **41.5%** | +1.170M | +53.8% | Cần $\ge 2$ nháy để sinh lãi ròng. |
| **Lục Thủ (Top 6)** | 13.2M | $\ge 2$ nháy | 85.4% (211/247) | **51.2%** | +1.571M | +48.2% | **MỎ NEO DÒNG TIỀN**: Ổn định và bền bỉ. |
| **Thất Thủ (Top 7)** | 15.4M | $\ge 2$ nháy | 89.1% (220/247) | **49.8%** | +1.584M | +42.0% | Tần suất nổ nháy cao. |
| **Thập Thủ (Top 10)** | 22.0M | $\ge 3$ nháy | 95.1% (235/247) | **46.5%** | +2.022M | +37.2% | Cần $\ge 3$ nháy để có lãi. |
| **Lô Dàn 20 (Top 20)**| 44.0M | $\ge 6$ nháy | 99.6% (246/247) | **38.9%** | +2.924M | +26.9% | Dàn bao phủ rộng, lãi ròng khi nổ dày. |

---

### 2.3. Lô Cặp & Ghép Xiên (Xiên 2, Xiên 3, Xiên 4)
- **Golden Xiên 2 Tự Động**: Chọn các cặp có xác suất đồng xuất hiện vượt trội qua ma trận tương hỗ, tỷ lệ nổ $48.2\%$ ngày, ROI $+26.2\%$.
- **Xiên Quây 4 (11 vé)** và **Xiên 5 (5 dàn Xiên 4)**: Đòn bẩy lợi nhuận với tỷ lệ nổ từ 2 con có lãi, gia tăng xác suất có ít nhất 1 dòng tiền dương trong ngày.

---

## 3. Khuyến Nghị Phối Hợp Danh Mục Thực Chiến (Live Combat Allocation)

Một danh mục thực chiến thông minh luôn phân bổ vốn cân bằng giữa Lô và Đề để triệt tiêu biến động (Cross-Hedging Portfolio):

```mermaid
graph TD
    V["Tổng Vốn Thực Chiến Mỗi Ngày"] --> L["Trụ Cột Lô: 40% - 60% Vốn (Neo Dòng Tiền)"]
    V --> D["Trụ Cột Đề: 40% - 60% Vốn (Đòn Bẩy Lợi Nhuận)"]
    
    L --> L2["Song Thủ Top 2 (Vốn 4.4M - ROI +44.3%)"]
    L --> L6["Lục Thủ Top 6 (Vốn 13.2M - Lãi +1.571M)"]
    
    D --> D1["Đề Gộp Tiêu Chuẩn (Vốn 60M - Win 36.7%)"]
    D --> D3["Đề Tam Trụ Phân Tầng (Vốn 90M - Win 39.3%)"]
```
