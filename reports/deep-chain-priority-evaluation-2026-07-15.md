# Đánh giá sâu độ tin cậy và ưu tiên loại trừ chuỗi

## Phạm vi kiểm chứng

- Baseline Mốc 20 năm chốt `31/12/2025`: 61.656 pattern.
- 9.395 pattern chưa từng hình thành, tương đương 15,24%.
- Kiểm chứng strict point-in-time: 265 ngày gồm 37 ngày mẫu năm 2024, 37 ngày mẫu năm 2025 và toàn bộ 191 ngày có kết quả năm 2026 đến 14/07.
- Candidate sau khử trùng theo trạng thái/họ/tập số/độ dài: 159.445.
- Edge thực tế = tỷ lệ kết quả bị loại đúng trừ xác suất loại nền `1 - số lượng số trong tập / 100`.
- Mọi feature của ngày dự đoán chỉ dùng raw prefix kết thúc ở D-1; baseline năm 2026 chỉ dùng dữ liệu đến 31/12/2025.

## Các lỗi suy diễn đã loại bỏ

1. Không dùng `số chuỗi ngắn hơn` làm mẫu số hình thành chuỗi tiềm năng. Cumulative streak chỉ đếm chuỗi đã hoàn tất, không đếm mọi ngày có tiền đề.
2. Không coi `gãy 100% tại kỷ lục` là xác suất thật. Kỷ lục được định nghĩa là mức lớn nhất trong chính tập lịch sử nên không có lần vượt trong cùng tập là kết quả tất định.
3. Không dùng chuyển tiếp streak của Nhịp Block làm chuyển tiếp ngày kế tiếp. File streak chỉ lưu block hoàn tất (`AABAA`, `AABAABAA`...), bỏ sót block đi thêm một vài ngày rồi hỏng.
4. Không ưu tiên tuyệt đối pattern chưa từng hình thành. Mở rộng tổ hợp tạo nhiều pattern hiếm hoặc gần như bất khả thi về mặt tổ hợp, nên `0 mẫu` không đồng nghĩa `100% loại đúng`.

## Độ dài và xác suất không tiếp tục

Sau khi bỏ 9.702 pattern Nhịp Block khỏi phép tính chuyển tiếp sai loại và chỉ bắt đầu từ độ dài hình thành tối thiểu thực sự của từng pattern:

| Chuyển tiếp | Mẫu đạt độ dài | Tỷ lệ gãy gộp |
|---|---:|---:|
| 2 → 3 | 1.451.686 | 87,1% |
| 3 → 5 (dạng cách ngày) | 1.584.921 | 84,7% |
| 3 → 4 | 153.703 | 75,9% |
| 4 → 5 | 59.122 | 60,4% |
| 5 → 6 | 21.247 | 55,2% |
| 6 → 7 | 8.713 | 48,3% |
| 7 → 8 | 4.165 | 45,7% |

Độ dài không tạo quan hệ “càng dài càng dễ gãy”. Những chuỗi đã sống lâu là nhóm đã vượt qua nhiều lần sàng lọc nên xác suất tiếp tục có thể cao hơn. Vì vậy phải so sánh trong cùng dạng, cùng độ dài và cùng độ rộng tập số.

Một số nhóm có mẫu lớn ở giai đoạn đầu:

- Tiến/lùi `2→3`: gãy 93,8%.
- Tiến/lùi đều `2→3`: gãy 91,5%.
- So le theo thứ tự `3→5`: gãy 90,7%.
- So le thường `3→5`: gãy 77,5%.
- Liên tiếp `2→3`: gãy 74,3%; `3→4`: 71,5%; `4→5`: 66,8%.
- So le theo cặp chỉ bắt đầu đánh giá từ độ dài hình thành 4; `4→5`: gãy 51,8%.

Các tỷ lệ trên là đường sống mô tả lịch sử dưới kỷ lục, chưa phải điểm loại cuối cùng. Điểm cuối phải trừ xác suất nền của tập số và dùng cận tin cậy.

## Kết quả strict point-in-time theo trạng thái

| Trạng thái | Ngày | Loại đúng | Nền | Edge | CI 95% Edge | Kết luận |
|---|---:|---:|---:|---:|---:|---|
| Đang diễn ra | 262 | 81,7% | 81,3% | +0,5% | -0,2% → +1,1% | Có tín hiệu yếu, phải chọn cohort |
| Tiềm năng | 265 | 79,9% | 79,9% | 0,0% | -1,4% → +1,5% | Không được ưu tiên chung |

## Kỷ lục và siêu kỷ lục

| Trạng thái active | Ngày | Edge thực tế | CI 95% | Ổn định năm |
|---|---:|---:|---:|---:|
| Pattern chưa từng tồn tại | 73 | +5,5% | -4,2% → +15,3% | 3/3 |
| Siêu kỷ lục | 120 | +4,4% | -0,1% → +8,9% | 3/3 |
| Đạt kỷ lục | 262 | +0,5% | -0,7% → +1,6% | 2/3 |
| Gần kỷ lục | 262 | +0,1% | -0,7% → +0,8% | 1/3 |

Siêu kỷ lục và pattern active chưa từng tồn tại có edge lớn hơn, nhưng khoảng tin cậy còn rộng. Chúng nên nhận bonus cohort có giới hạn, không được gán rủi ro 100%. Đạt đúng kỷ lục chỉ có edge nhỏ và chưa có ý nghĩa thống kê.

## Chuỗi tiềm năng và chưa bao giờ hình thành

- Toàn bộ potential: edge 0,0%, không tốt hơn nền.
- Potential chưa từng hình thành: edge -0,2%, CI -2,3% → +1,8%; không nên Tier 1 chỉ vì `0 mẫu`.
- Potential đạt kỷ lục: edge 0,0%; không có lợi thế chung.
- Một số cohort nhỏ có edge dương, nhưng phải học từ replay theo ngày và kiểm chứng ở năm sau, không thể suy ra từ cumulative streak.

Mẫu đúng cho potential phải là:

```text
O = số ngày tiền đề giống nhau thực sự xuất hiện trước ngày dự đoán
F = số lần ngày kế tiếp hình thành target
B = O - F
P(không hình thành) = (B + kappa * q) / (O + kappa)
q = 1 - |tập số dự đoán| / 100
```

Nếu `O = 0`, hệ thống phải lùi về prior của cohort `họ + dạng + độ dài + độ rộng tập số`, với độ tin cậy thấp; không được trả 100%.

## Mức ưu tiên đề xuất

### Ưu tiên A - bằng chứng có thể dùng trực tiếp

- Chuỗi active dưới kỷ lục, có chuyển tiếp lịch sử hợp lệ.
- Cận dưới xác suất gãy sau làm trơn cao hơn xác suất nền của tập số.
- Có ít nhất 10-20 lần đạt độ dài; edge dương ở nhiều năm.
- Khử tập số trùng và chỉ lấy bằng chứng mạnh nhất trong mỗi họ.

### Ưu tiên B - dùng bonus có giới hạn

- Active siêu kỷ lục hoặc pattern active chưa từng tồn tại ở baseline năm.
- Active có tần suất dưới 1 lần/năm, đặc biệt nhóm `0,5-<1/năm` có edge +1,3% và dương 3/3 năm.
- Bonus kỷ lục lấy từ kết quả out-of-sample theo cohort, không lấy `100%` trong baseline.

### Ưu tiên C - tiềm năng đã có daily replay

- Chỉ dùng khi có đủ `O` cơ hội tiền đề và posterior không hình thành vượt nền.
- Exact key ít mẫu phải co về cohort.
- Potential liên tiếp hoặc một số dạng theo thứ tự có thể theo dõi, nhưng hiện chưa đủ ổn định để hard Tier.

### Không ưu tiên

- Potential `0 mẫu` nhưng chưa có daily replay.
- Nhịp Block dùng count streak hoàn tất để suy ra ngày kế tiếp.
- Active tần suất cao chỉ có raw dropoff cao nhưng edge không vượt nền.
- Nhiều key đồng nghĩa/cùng tập số được cộng lặp.

## Công thức điểm nên dùng

Với active có chuyển tiếp hợp lệ:

```text
n = số lần đạt độ dài L
c = số lần tiếp tục tới L + step
b = n - c
q = xác suất loại nền theo độ rộng tập số
posteriorBreak = (b + kappa*q) / (n + kappa)
credibleEdge = max(0, lowerBound(posteriorBreak) - q)
reliability = sqrt(n / (n + 24))
score = credibleEdge * reliability * yearStability * familyWeight
```

Kỷ lục/siêu kỷ lục chỉ thêm một `recordBonus` nhỏ học từ năm trước và bị cap; không thay posterior. Điểm từng số lấy bằng chứng mạnh nhất của mỗi họ, sau đó cộng giảm dần giữa các họ độc lập.

## Kiểm chứng phương pháp thử nghiệm

`numberAnnualCalibratedRisk` đã chạy toàn bộ 191 ngày năm 2026 strict PIT:

- Trúng 67/191 ngày, 35,08%.
- Profit `-102.000K` với 30 số/ngày, 1.000K/số, ăn 84.
- ROI `-1,78%`.
- Chuỗi thua dài nhất: 10 ngày.

Kết quả âm nên phương pháp không được nâng làm mặc định. Nó cho thấy làm trơn dropoff đơn thuần chưa đủ; bước tiếp theo bắt buộc là tạo bảng daily replay cho potential và block, rồi huấn luyện cohort trên năm trước và giữ 2026/2027 làm holdout.

