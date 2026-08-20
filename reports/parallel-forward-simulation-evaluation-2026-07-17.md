# Đánh giá giả lập tương lai có tái sinh chuỗi

## Mục tiêu

Kiểm tra độ bền của phương pháp Đề Song Song `Block 85 + Small 65` khi kết quả tương lai được sinh theo nhiều cơ chế khác nhau. Mỗi ngày giả lập tuân theo đúng thứ tự:

1. Dùng prefix dữ liệu hiện có để lập dàn dự đoán.
2. Sinh kết quả ngày kế tiếp mà không nhìn vào dàn dự đoán.
3. Chốt hit và profit cho giao x1, x2, x3, x4.
4. Nối kết quả vừa sinh vào raw.
5. Tái sinh toàn bộ thống kê chuỗi rồi mới dự đoán ngày sau.

## Nguồn và baseline

- Raw thật lấy trực tiếp từ Cloudflare R2: `2005-10-01` đến `2026-07-16`, 7.493 ngày.
- Baseline năm 2026 khóa tại `2025-12-31`; không học từ kết quả giả lập.
- Candidate và dàn số dùng trực tiếp `annualMilestoneService.buildCandidatesForDate()` và `buildPrediction()` của hệ thống.
- Không dùng `futureSimulationService` cũ vì module đó không bao phủ đầy đủ hệ thống pattern hiện tại.

## Hai tầng kiểm chứng

### Full-prefix exact

- 8 path, 3 ngày/path, 4 mô hình.
- Sau mỗi ngày, thống kê được sinh lại từ toàn bộ prefix hơn 7.400 ngày.
- Jaccard Block, Small và hợp đều bằng `1,0` so với chính full-prefix.
- Lượt này chỉ xác minh pipeline kỹ thuật; số path quá nhỏ nên không dùng để ước lượng xác suất.

### Multi-path tăng tốc đã audit

- 24 path/model, 4 model, 14 ngày/path.
- Tổng cộng 96 path và 1.344 ngày tương lai động.
- Mỗi bước tái sinh chuỗi từ 730 ngày gần nhất để giảm thời gian khoảng 10 lần.
- Audit tại ngày `2026-07-17`: Block Jaccard `87,50%`, Small `100%`, hợp `95,45%` so với full-prefix.
- Đây là xấp xỉ phục vụ stress test, không thay thế strict PIT exact.

## Các mô hình sinh tương lai

- `uniform`: 100 số độc lập có xác suất bằng nhau.
- `frequency-posterior`: tần suất lịch sử được co mạnh về phân phối đều.
- `markov-posterior`: xác suất chuyển tiếp từ số trước, cũng co mạnh về đều.
- `block-bootstrap`: lấy lại các block 7 ngày lịch sử để giữ phụ thuộc ngắn hạn.

## Kết quả multi-path

| Mô hình | Hit hợp | Hit giao | Số hợp TB | Số giao TB | P lãi x1 | P lãi x2 | P lãi x3 | P lãi x4 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Uniform | 46,73% | 6,25% | 43,19 | 6,81 | 33,33% | 29,17% | 29,17% | 33,33% |
| Frequency posterior | 45,54% | 7,74% | 43,01 | 6,99 | 33,33% | 33,33% | 37,50% | 37,50% |
| Markov posterior | 42,26% | 6,85% | 43,16 | 6,84 | 20,83% | 29,17% | 25,00% | 25,00% |
| Block bootstrap | 46,13% | 9,82% | 43,30 | 6,70 | 20,83% | 25,00% | 33,33% | 37,50% |

Profit trung bình của x1-x4 âm ở tất cả trường hợp, ngoại trừ block-bootstrap x4 chỉ đạt `+1.500K`. Trường hợp này vẫn có median `-79.000K`, P05 `-276.500K`, xác suất path có lãi `37,50%` và drawdown P95 `483.000K`, nên không phải tín hiệu đủ ổn định để triển khai.

## Đối chiếu walk-forward thật

Trên 552 ngày strict walk-forward thật của 2025 và 2026 đến `2026-07-14`:

- Hit hợp: `239/552 = 43,30%`.
- Hit giao: `44/552 = 7,97%`; trung bình `6,59` số giao/ngày.
- Wilson 95% cho hit giao: `5,99%` đến `10,53%`.
- Điểm hòa vốn biên khi ăn 84 là khoảng `7,85%`.
- x2 toàn kỳ: `-3.828.000K`; x4 toàn kỳ: `-3.712.000K`.
- Riêng holdout 2026 x4 `+120.000K`, nhưng train 2025 x4 `-3.832.000K`: hiệu quả không ổn định qua chế độ thời gian.

## Kết luận

1. Pipeline forward mới đã thực sự nối kết quả giả lập và tái sinh chuỗi cho ngày kế tiếp; không quay nhiều kết quả trên một dàn cố định.
2. Các đường giả lập không tạo thêm bằng chứng dự báo. Chúng chỉ đo độ nhạy với giả định tương lai và rủi ro vốn.
3. Giao x2-x4 không làm tăng xác suất hit; chỉ thay đổi mức cược khi giao về. Dữ liệu hiện chưa chứng minh phần giao có edge bền vững trên nhiều giai đoạn.
4. Không thay đổi production. Chỉ nên nâng hệ số khi Wilson lower trên holdout bất biến vượt ngưỡng hòa vốn và kết quả vẫn dương ở nhiều năm/chế độ.

## Lệnh tái lập

```bash
# Kiểm chứng exact nhỏ
node scripts/research-parallel-forward-chain-simulation.js \
  --paths=2 --horizon=3 --workers=8 --lookback=full

# Stress test multi-path
node scripts/research-parallel-forward-chain-simulation.js \
  --paths=24 --horizon=14 --workers=8 --lookback=730 --minAuditJaccard=0.9
```
