# Báo cáo tổ hợp phương pháp và stress test tương lai

## Phạm vi và nguyên tắc

- Nguồn: 3.778 ngày Đề strict point-in-time, từ 2016 đến 10/07/2026.
- Vốn: 1.000K mỗi đơn vị, tỷ lệ ăn 84.
- 2016-2020 chỉ dùng để xếp hạng pool và train mô hình.
- 2021-2023 là fit-evaluation; 2024-2025 là validation/chọn cấu hình.
- 2026 là holdout khóa, không dùng để chọn cấu hình.
- Mọi so sánh giữ cố định số đơn vị cược; không cho x2/x3/x4 tăng vốn tổng.

Đã thử 696 cấu hình Top K theo ba nhóm: đồng thuận, chỉ thuộc một phương pháp và softmax có L2. Ngoài ra thử 336 cấu hình phân bổ vốn x2/x3/x4 cho phần giao hoặc không giao.

## Cấu hình được chọn trước khi mở holdout

| Dàn | Cấu hình | 2021-2023 | 2024-2025 | 2026 holdout |
|---|---|---:|---:|---:|
| Top 10 | Softmax 4 phương pháp, L2=1 | 11,27%; -582.000K | 11,48%; -258.000K | 11,76%; -22.000K |
| Top 20 | Không giao Likelihood + Edge | 23,08%; -660.000K | 21,72%; -1.272.000K | 24,06%; +40.000K |
| Top 30 | Không giao Likelihood + Tần suất + Edge | 32,78%; -2.670.000K | 32,09%; -2.202.000K | 30,48%; -822.000K |
| Top 40 | Cùng cấu hình Top 30 | 43,40%; -3.840.000K | 42,74%; -2.964.000K | 40,11%; -1.180.000K |

Điểm hòa vốn lần lượt là 11,90%, 23,81%, 35,71% và 47,62%. Chỉ Top 20 nhỉnh hơn hòa vốn riêng holdout 2026, nhưng âm ở cả hai giai đoạn trước đó.

## Đối chứng Top 30

`chainSmallFirst Hold70` trên đúng 187 ngày holdout đạt 68/187 ngày, 36,36%, profit +102.000K, ROI +1,82%, chuỗi thua dài nhất 9 ngày.

Cấu hình Top 30 được chọn trước holdout chỉ đạt 57/187 ngày, 30,48%, profit -822.000K, ROI -14,65%, chuỗi thua dài nhất 15 ngày. Audit cùng ngày và cùng vốn cho thấy candidate giảm 5,88 điểm phần trăm và giảm 924.000K profit so với baseline.

## Tổ hợp tốt nếu nhìn ngược từ 2026

Sau khi đã biết kết quả 2026, cấu hình đồng thuận `numberLikelihoodRatio + dedupEdge50Hold + chainSmallFirst` đạt 73/187 ngày, 39,04%, profit +522.000K. Tuy nhiên cấu hình này lỗ ở tất cả các giai đoạn trước: -9.198.000K (2016-2020), -5.274.000K (2021-2023), -3.798.000K (2024-2025).

Kiểm định best-of-many trên 174 cấu hình Top 30 cho kết quả:

- Best quan sát: 73 hit.
- Trong null simulation 5.000 lần, xác suất vẫn có một cấu hình đạt ít nhất 73 hit là 24,52%.
- Median của best-null là 70 hit; P95 là 77 hit; P99 là 80 hit.

Do đó 73 hit không đủ bằng chứng sau khi hiệu chỉnh việc thử nhiều cấu hình.

## Đánh mạnh phần giao hoặc không giao

Cấu hình được chọn trước holdout là không giao x4 giữa Block, Edge và Small. Nó dùng cố định 30 đơn vị nhưng chỉ còn trung bình 8 số duy nhất:

- 2021-2023: +102.000K, ROI +0,31%.
- 2024-2025: +318.000K, ROI +1,47%.
- 2026 holdout: -1.074.000K, ROI -19,14%, chuỗi thua dài nhất 36 ngày.
- Block bootstrap holdout: xác suất có lãi cho 365 ngày chỉ 8,66%.

Phương án giao x2 tốt nhất cũng lỗ ở cả ba giai đoạn; holdout -234.000K, ROI -4,17%. Tăng multiplier làm độ phủ giảm nhanh hơn mức tăng chất lượng tín hiệu.

## Stress test Top 30 đã khóa

- Bootstrap block 14 ngày từ validation: xác suất có lãi 4,12%; median -1.122.000K.
- Bootstrap block 14 ngày từ holdout: xác suất có lãi 0,76%; median -1.626.000K.
- Khi hit-rate giảm 1 điểm phần trăm, xác suất có lãi còn 0,45%; giảm 2 điểm còn 0,14%.

## Forward simulation tiến hóa 2-5 năm (chỉ là null/sensitivity stress)

Forward simulation bắt đầu từ raw R2 đến 16/07/2026. Ở mỗi ngày giả lập, hệ thống thực hiện đúng thứ tự:

1. Chỉ dùng prefix đã biết để sinh lại chuỗi đang diễn ra và chuỗi tiềm năng.
2. Tạo dàn Top 30 cho từng phương pháp/tổ hợp đã khóa trước khi chạy.
3. Sinh một kết quả mới theo mô hình tương lai tương ứng và kết toán dàn vừa dự đoán.
4. Nối kết quả đó vào lịch sử riêng của path, rồi tính lại chuỗi cho ngày kế tiếp.
5. Khi sang năm mới, chốt lại annual baseline từ chính prefix của path đến 31/12 năm trước.

Kết quả dưới đây **không phải ước lượng xác suất dự báo thực tế**. Bốn bộ sinh `uniform`, `frequency-posterior`, `markov-posterior` và `block-bootstrap` sinh số ở cấp số/tần suất/chuyển tiếp, nhưng không được điều kiện hóa đầy đủ theo trạng thái các chuỗi mà phương pháp đang dùng. Vì vậy dàn Top 30 tự nhiên hội tụ về mức nền xấp xỉ 30%.

Kiểm tra lại trên raw R2 đến 17/07/2026 cũng phát hiện tối ưu lookback trước đây không tương đương full-prefix:

- Dàn hợp lookback 200 so với full-prefix chỉ có Jaccard **0,6279**; lookback 400 là **0,5909**.
- Full-prefix tạo 2.558 candidate, còn suffix 200 tạo 4.418 candidate.
- Dàn Block và Small đều thay đổi 8/30 số ở hai phía trong lần audit gần nhất.

Nguyên nhân là suffix ngắn làm mất các key và lịch sử occurrence cũ cần cho phân loại active/potential và metric chuỗi. Do đó các lượt 2-5 năm cũ chỉ được giữ lại như kiểm tra độ nhạy/null stress và kiểm tra rò rỉ; **không được dùng để kết luận phương pháp chắc chắn thua hay dự báo xác suất tương lai**.

### Tổng hợp trung bình qua bốn cơ chế sinh

| Phương pháp Top 30 | Hit TB 2 năm | Profit TB 2 năm | Hit TB 5 năm | Profit TB 5 năm |
|---|---:|---:|---:|---:|
| Chuỗi nhỏ | 30,94% | -2.926.500K | 30,21% | -8.445.000K |
| Nhịp block | 29,13% | -4.039.500K | 29,89% | -8.928.000K |
| Likelihood ratio | 29,14% | -4.029.000K | 29,68% | -9.243.000K |
| Edge khử trùng | 30,12% | -3.430.500K | 29,78% | -9.096.000K |
| Đồng thuận Likelihood + Edge + Small | 30,31% | -3.315.000K | 30,21% | -8.445.000K |
| Đồng thuận Active + Block + Small | 30,70% | -3.073.500K | 31,64% | -6.240.000K |
| Không giao Likelihood + Frequency + Edge | 30,07% | -3.462.000K | 31,05% | -7.143.000K |
| Đồng thuận cả sáu tín hiệu | 30,14% | -3.420.000K | 31,45% | -6.534.000K |

Với 30 số và tỷ lệ ăn 84, điểm hòa vốn là 35,714%. Không tổ hợp nào đạt hòa vốn trung bình qua các thế giới giả lập ở cả mốc 2 năm và 5 năm.

### Trường hợp tốt nhất nhưng chưa bền

`Active + Block + Small` là tổ hợp tốt nhất trong block-bootstrap 5 năm: 36,11%, +606.000K, ROI +1,11%. Tuy nhiên cùng cấu hình này lỗ ở uniform (-8.046.000K), frequency-posterior (-8.298.000K) và markov-posterior (-9.222.000K). Trong lượt 2 năm với hai path cho mỗi mô hình, ngay cả block-bootstrap cũng chỉ đạt 34,73% và -606.000K.

Do lượt 5 năm mới có một path cho mỗi cơ chế sinh, `P(profit>0)=100%` của riêng block-bootstrap chỉ có nghĩa path đó dương; nó không phải xác suất thật 100%. Không được dùng riêng kết quả thuận lợi này để promotion.

Các file chi tiết:

- `parallel-forward-chain-simulation-2026-07-17T08-32-59-962Z.*`: 8 path x 730 ngày.
- `parallel-forward-chain-simulation-2026-07-17T09-29-27-318Z.*`: 4 path x 1.825 ngày.

## Kết luận đã hiệu chỉnh

Không cấu hình mới nào vượt cổng promotion. Đồng thuận, không giao, softmax và tăng tiền phần giao/không giao đều không duy trì profit qua nhiều chế độ lịch. Không thay đổi production/default/cache từ nghiên cứu này.

Điểm quan trọng là phải tách hai kết luận:

1. **Strict PIT lịch sử là bằng chứng hợp lệ:** `chainSmallFirst Hold70` đạt 29,32% trong 2016-2025 và 36,36% trong 187 ngày đầu 2026. Mức 2026 có lãi ở tỷ lệ ăn 84 nhưng chưa ổn định qua nhiều chế độ năm.
2. **Forward simulation cũ không phải xác suất của phương pháp:** mức quanh 30% chủ yếu phản ánh bộ sinh tương lai gần-null và sai số lookback, không phản ánh đầy đủ quan hệ điều kiện giữa chuỗi và kết quả.

Muốn mô phỏng 2-5 năm đúng nghĩa cần một snapshot compact chứa đủ lịch sử occurrence cho mọi key và trạng thái active hiện tại, được cập nhật sau từng kết quả giả lập. Chỉ khi audit dàn từ snapshot compact khớp full-prefix định kỳ mới được công bố xác suất forward mới.

## Tái kiểm chứng kinh tế ngày 11-17/07/2026

Chạy lại `deParallelBlock85Small65Hold70` bằng full-prefix strict PIT hiện tại, đồng thời giữ đầy đủ dàn số và phần giao cho từng ngày:

- 7 ngày, mỗi ngày đúng 50 đơn vị cược.
- Trúng 3/7 ngày (42,86%); cả ba lần đều là số chỉ có một đơn vị, không thuộc phần giao x2.
- Tổng vốn 350.000K; tổng trả thưởng 252.000K; profit **-98.000K**, ROI **-28%**.
- Khoảng tin cậy Wilson 95% của tỷ lệ ngày trúng còn rất rộng: 15,82%-74,96%; bảy ngày không đủ để kết luận chất lượng dài hạn.

Báo cáo Song song cũ ghi 63,88% trong 2016-2025 nhưng chỉ lưu aggregate, không lưu dàn cược từng ngày để tái kiểm chứng số thực tế, phần giao và vốn. Cờ `pointInTime=true` một mình không phải bằng chứng tái lập. Trước khi dùng báo cáo này để chọn production, cần sinh lại report có daily rows, hash raw/prefix, method version và kiểm tra bất biến khi thay kết quả của ngày đang kết toán.

Đối với Lô, báo cáo dài gần nhất dùng chỉ mục full-history và không đạt strict point-in-time. Báo cáo strict đủ 27 vị trí hiện chỉ có 7 ngày, không đủ để đánh giá stress hoặc chọn Top 6-20. Cần sinh cache strict bất biến theo từng vị trí trong nhiều tháng/năm rồi mới chạy cùng quy trình train/validation/holdout.
