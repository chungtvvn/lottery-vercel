# Báo cáo Tổng hợp Thống kê & Kiểm tra Logic Hệ thống

Báo cáo này tổng hợp tất cả các dạng thống kê hiện có trong hệ thống xổ số, chi tiết cơ chế hoạt động, kiểm tra tính độc lập của cơ sở dữ liệu Supabase, và báo cáo việc thu dọn các tệp tin dư thừa.

---

## 1. Đánh giá tính độc lập của Supabase (Supabase Independence)

### Câu hỏi: "Hiện tại không cần supabase nữa đúng không?"
**Câu trả lời ngắn gọn**: 
Hiện tại phần **Thống kê tĩnh (Statistics)** đã chạy độc lập hoàn toàn khỏi Supabase (tất cả 28 tệp tin cache lớn đã được đẩy lên Cloudflare R2 CDN và tải trực tiếp về Client trong ~550ms). Tuy nhiên, Supabase vẫn đang đóng vai trò làm nơi lưu trữ **Lịch sử Dự đoán (Prediction History)** và bảng **Kết quả Xổ số Thô (Raw results)** dự phòng.

Nếu bạn muốn **loại bỏ Supabase hoàn toàn 100% khỏi hệ thống**, chúng ta có thể làm được bằng cách:
1. **Lưu trữ dữ liệu xổ số thô trên R2**: Đẩy tệp `xsmb-2-digits.json` lên Cloudflare R2 hàng ngày cùng với statistics. Khi Vercel cần lấy dữ liệu thô, nó sẽ fetch trực tiếp bản gzip từ R2 (bỏ qua Supabase `lottery_results` table).
2. **Lưu trữ lịch sử dự đoán trên R2**: Chuyển đổi API lịch sử dự đoán (`/api/prediction-history`) từ đọc/ghi Supabase table sang đọc/ghi một file JSON tĩnh trên R2 (`prediction_history.json`).

*Nếu bạn có nhu cầu loại bỏ hoàn toàn Supabase, hãy yêu cầu tôi thực hiện bước di chuyển này ở lượt tiếp theo.*

---

## 2. Danh mục các Dạng Thống kê Hiện có (Statistics Catalog)

Hệ thống xổ số của chúng ta phân tích kết quả giải Đặc Biệt (2 chữ số cuối) thành 3 nhóm lớn tương ứng với 3 tệp tin lưu trữ trên R2:

### A. Thống kê theo Số (`number_stats.json`)
Phân tích trực tiếp các giá trị số đề từ `00` đến `99` và các dạng tiến lùi tuần hoàn:
1. **Một số về liên tiếp (`motSoVeLienTiep`)**: Phát hiện 1 số cụ thể xuất hiện liên tiếp ở các ngày quay thưởng liền kề.
2. **Một số về so le (`motSoVeSole`)**: Xuất hiện xen kẽ (ngày 1 về số A, ngày 2 về số khác, ngày 3 lại về số A).
3. **Một số về so le mới (`motSoVeSoleMoi`)**: Số về xen kẽ và ngày ở giữa bắt buộc phải là một số cố định khác số đó.
4. **Chuỗi Tiến/Lùi cá nhân (`motSoTien...`, `motSoLui...`)**: Chuỗi các ngày liên tiếp mà số đề tăng dần hoặc giảm dần (cách đều hoặc không cách đều).
5. **Chuỗi Tiến/Lùi tập hợp (`cacSoTien...`, `cacSoLui...`)**: Phân tích sự di chuyển tăng/giảm của toàn bộ tập hợp số.
6. **Dạng đồng tiến / đồng lùi**: Phân tích tiến/lùi trên các bộ số cách nhau một khoảng nhất định (ví dụ: bộ đồng step `DONG_STEP_22` gồm các số cách nhau 22 đơn vị).
7. **Dạng chuỗi tuần hoàn (`pattern_seq_...`)**: Phát hiện các chuỗi lặp lại tuần hoàn của các tính chất Chẵn Lẻ (ví dụ: Chẵn-Chẵn ➔ Chẵn-Lẻ ➔ Lẻ-Chẵn ➔ Lẻ-Lẻ).

### B. Thống kê theo Đầu/Đít (`head_tail_stats.json`)
Phân tích chữ số hàng chục (Đầu) và chữ số hàng đơn vị (Đít) của giải Đặc Biệt:
1. **Đầu/Đít đơn lẻ (`motDauVe...`, `motDitVe...`)**: Phân tích chuỗi liên tiếp hoặc so le của cùng một Đầu hoặc Đít.
2. **Nhóm Đầu/Đít tiến lùi (`cacDauTien...`, `cacDitLui...`)**: Các chuỗi ngày liên tiếp mà giá trị Đầu/Đít tăng hoặc giảm dần (đều hoặc không đều).
3. **Thống kê theo Nhóm thuộc tính**: Phân tích chuỗi liên tiếp, so le của các nhóm:
   * **Chẵn/Lẻ**: Đầu Chẵn (`DAU_CHAN`), Đầu Lẻ (`DAU_LE`), Đít Chẵn (`DIT_CHAN`), Đít Lẻ (`DIT_LE`).
   * **To/Nhỏ**: Đầu To ($\ge 5$), Đầu Nhỏ ($< 5$), Đít To, Đít Nhỏ.
   * **Kết hợp hai chữ số**: Đầu to đít to (`DAU_TO_DIT_TO`), Đầu chẵn nhỏ hơn 4 và Đít lẻ lớn hơn 5...
   * **Đầu/Đít cố định**: Đầu hoặc Đít cụ thể kết hợp với các bộ số khác (như Đầu 4 đít chẵn lớn hơn 4...).
4. **Bộ số Lẻ Theo Cặp (`soLeTheoCap`)**: Tính toán thống kê so le theo cặp cho các cặp Đầu/Đít xen kẽ (dạng ABAB).

### C. Thống kê theo Tổng/Hiệu (`sum_difference_stats.json`)
Phân tích Tổng của 2 chữ số (lấy hàng đơn vị của tổng) và Hiệu của 2 chữ số (Chữ số lớn trừ chữ số nhỏ):
1. **Tổng/Hiệu đơn lẻ (`tongVe...`, `hieuVe...`)**: Chuỗi liên tiếp, so le của một giá trị tổng hoặc hiệu cụ thể.
2. **Tổng/Hiệu tiến lùi (`cacTongTien...`, `cacHieuLui...`)**: Chuỗi tăng/giảm dần liên tiếp của giá trị tổng/hiệu.
3. **Nhóm Tổng/Hiệu thuộc tính**:
   * **Tổng truyền thống (Tổng TT)**: Tổng hai chữ số lấy số đuôi (ví dụ: $3+5=8$ chẵn, $4+7=11 \rightarrow 1$ lẻ).
   * **Tổng mới**: Tổng hai chữ số không chia dư (ví dụ: $47 \rightarrow 11$, $99 \rightarrow 18$).
   * **Hiệu Chẵn/Lẻ**: Hiệu của 2 chữ số là chẵn hoặc lẻ.
4. **Tổng/Hiệu so le theo cặp (`soLeTheoCap`)**: Phân tích cặp tổng/hiệu về xen kẽ theo mẫu ABAB.

---

## 3. Kiểm tra & Xác minh Logic Thống kê (Logic Verification)

Chúng ta đã kiểm tra lại toàn bộ logic thuật toán tìm chuỗi để đảm bảo tính chính xác và loại bỏ các lỗi lệch pha dữ liệu:

### 1. Phân biệt Chuỗi So le Thường vs So le Mới (Alternating Logic)
* **So le Thường (`veSole`)**: 
  * Định nghĩa: Một điều kiện $C$ được thỏa mãn vào các ngày lẻ và *không* thỏa mãn vào các ngày chẵn ở giữa.
  * Logic code: Trạng thái xen kẽ $A - B - A$ chỉ yêu cầu ngày ở giữa $B$ không thỏa mãn điều kiện chính ($!condition(B)$). Giá trị của các ngày $B$ không bắt buộc phải giống nhau.
  * Xác minh: Script `scratch/verify_so_le.js` xác nhận các chuỗi so le thường được nhận diện đúng khi ngày xen kẽ có giá trị khác nhau.
* **So le Mới (`veSoleMoi`)**:
  * Định nghĩa: Số hoặc thuộc tính về xen kẽ, đồng thời ngày xen kẽ ở giữa bắt buộc phải là một giá trị *cố định* (gapValue cố định).
  * Logic code: Yêu cầu $A - B - A$ trong đó $A$ thỏa mãn điều kiện chính và tất cả các ngày ở giữa $B$ phải có cùng một giá trị cố định $B = \text{gapValue}$.
  * Xác minh: Script `scratch/verify_so_le.js` xác nhận thuật toán phân tách chính xác dạng so le mới và chỉ lưu các chuỗi có gapValue đồng nhất.

### 2. Chuỗi Tiến/Lùi (Progressive/Regressive Logic)
* **Tiến/Lùi thường (`tienLienTiep` / `luiLienTiep`)**:
  * Giá trị ngày sau phải lớn hơn (hoặc nhỏ hơn) ngày trước theo vòng tuần hoàn 10 (ví dụ Đầu: $1 \rightarrow 2 \rightarrow 5$ hoặc $9 \rightarrow 0 \rightarrow 1$).
* **Tiến/Lùi Đều (`tienDeuLienTiep` / `luiDeuLienTiep`)**:
  * Giá trị ngày sau phải lớn hơn (hoặc nhỏ hơn) ngày trước một khoảng khoảng cách (step) không đổi (ví dụ: $2 \rightarrow 4 \rightarrow 6 \rightarrow 8$ hoặc $9 \rightarrow 6 \rightarrow 3 \rightarrow 0$).

### 3. Chuỗi Tiến-Lùi So Le (`tienLuiSoLe` / `luiTienSoLe`)
* Tìm các chuỗi ngày liên tiếp thay đổi hướng đi xen kẽ: tăng ở ngày lẻ, giảm ở ngày chẵn (ví dụ Đầu: $3 \rightarrow 5 \rightarrow 4 \rightarrow 7 \rightarrow 6$).

---

## 4. Báo cáo Thu dọn các Tệp tin Dư thừa (Cleanup Report)

Để giữ cho thư mục dự án sạch sẽ và tránh nhầm lẫn trong quá trình phát triển, chúng ta đã xóa bỏ **26 tệp tin tạm và script dư thừa** không còn sử dụng.

### Các tệp tin đã xóa:
1. `test_get_history.js` (nằm ở thư mục gốc).
2. Các script debug và test cũ trong thư mục `scratch/`:
   * `check_candidates.js`
   * `check_db_history.js`
   * `check_latest.js`
   * `check_lengths.js`
   * `check_max_date_stats.js`
   * `check_never_formed.js`
   * `check_stats_json_files.js`
   * `compare_hold_sizes_20y.js`
   * `count_active_streaks.js`
   * `find_never_formed_patterns.js`
   * `inspect_chain_cache.js`
   * `inspect_db.js`
   * `inspect_prediction_summary.js`
   * `inspect_quick_stats_history.js`
   * `inspect_quick_stats_latest.js`
   * `inspect_xsmb.js`
   * `regenerate_chain_cache.js`
   * `regenerate_latest_prediction.js`
   * `run_loto_backtest.js`
   * `sync_today.js`
   * `test_api_stats.js`
   * `test_backtest_fields.js`
   * `test_chain_frequency_api.js`
   * `test_hydration.js`
   * `verify_gap_filters.js`

### Các tệp tin kiểm thử cốt lõi được giữ lại (thư mục `scratch/`):
* `verify_never_formed_priority.js`: Xác minh độ ưu tiên 102 của dạng chưa bao giờ hình thành.
* `verify_so_le.js`: Xác minh tính đúng đắn của logic so le thường vs so le mới.
* `verify_r2.js`: Kiểm tra kết nối tải lên R2.
* `verify_r2_data_access.js`: Kiểm tra tốc độ đọc và cơ chế fallback từ R2 CDN.
