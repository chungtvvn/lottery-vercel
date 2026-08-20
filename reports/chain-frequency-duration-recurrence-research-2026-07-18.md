# Nghiên cứu tần suất, độ dài và nhịp tái xuất hiện của chuỗi

Ngày nghiên cứu: 18/07/2026

## Mục tiêu

Không dùng riêng tỷ lệ gãy/tiếp tục. Mỗi trạng thái chuỗi được bổ sung bốn nhóm thông tin:

1. `Tần suất target/năm = số lần chuỗi đạt target / số năm dữ liệu`.
2. `Độ dài trung bình`: độ dài cuối cùng trung bình của các chuỗi đã đạt mốc đang xét.
3. `TB cách`: khoảng cách trung bình giữa hai lần chuỗi đạt đúng mốc target.
4. `Nhịp hiện tại = số ngày từ lần target gần nhất / TB cách`.

Điểm lõi vẫn là posterior gãy đã co về xác suất nền của tập số, Wilson lower bound và cỡ mẫu. Các trường tần suất/độ dài/nhịp chỉ được phép hiệu chỉnh điểm lõi.

## Phương pháp kiểm chứng

- Strict point-in-time: mỗi ngày kiểm tra tái sinh thống kê chỉ từ dữ liệu trước ngày dự đoán.
- Baseline Mốc 20 năm khóa tại 31/12 năm trước.
- 2024: 37 ngày mẫu, cách 10 ngày.
- 2025: 37 ngày mẫu, cách 10 ngày.
- 2026: 39 ngày mẫu, cách 5 ngày.
- Tổng: 113 ngày độc lập theo thời gian.
- Mỗi ngày có khoảng 3.000 ứng viên chuỗi. Bằng chứng được khử trùng theo `họ chuỗi + tập số` trước khi cộng.

## Lỗi dữ liệu đã phát hiện

`annualMilestoneService` trước đây đọc `stat.targetAvgGapDays` và `stat.targetDaysSinceLatestEnd` ở cấp gốc. Dữ liệu đúng nằm tại `stat.lengthHistoryMetrics[targetLen]`.

Hậu quả: các phương pháp Mốc 20 năm trước đây gần như chưa dùng được `TB cách` và `Gần nhất` của đúng độ dài đang dự báo.

Đã sửa ứng viên để mang đầy đủ:

- `baseOccurrenceCount`, `baseFrequencyPerYear`, `baseAvgLength`, `baseAvgGapDays`, `baseDaysSinceLatestEnd`, `baseGapRatio`.
- `targetOccurrenceCount`, `targetFrequencyPerYear`, `targetAvgLength`, `targetAvgGapDays`, `targetDaysSinceLatestEnd`, `targetGapRatio`.

## Mặt bằng trạng thái chuỗi năm 2026

Các số dưới đây là median theo quan sát ứng viên active trong 39 ngày mẫu; không phải xác suất trúng của số đề.

| Họ chuỗi | Lần target/năm | Độ dài TB | TB cách |
|---|---:|---:|---:|
| Tổng | 0,70 | 3,3 ngày | 348,6 ngày |
| Đít | 1,05 | 4,0 ngày | 322,0 ngày |
| Đầu | 1,15 | 3,5 ngày | 289,9 ngày |
| Hiệu | 1,45 | 3,9 ngày | 216,0 ngày |
| Nhịp block | 0,50 | 8,5 ngày | 563,2 ngày |
| Đầu-đít kết hợp | 4,05 | 3,4 ngày | 87,4 ngày |
| Phân loại số | 1,00 | 5,4 ngày | 358,3 ngày |
| Số cụ thể | 7,20 | 5,8 ngày | 46,0 ngày |

Toàn bộ ứng viên active có median khoảng `0,85 lần/năm`, độ dài `3,9 ngày`, TB cách `351 ngày`.

## Tín hiệu nào ổn định

### 1. Tần suất target quá cao

Nhóm target xuất hiện `>= 2 lần/năm` có edge loại so với xác suất nền âm ở cả ba lát cắt:

| Năm | Edge loại |
|---|---:|
| 2024 | -1,35 điểm % |
| 2025 | -3,64 điểm % |
| 2026 | -1,48 điểm % |

Kết luận: target quá phổ biến không nên được nâng ưu tiên chỉ vì raw dropoff cao. Đây là tín hiệu phù hợp để làm **cổng giảm điểm**.

### 2. Độ dài dư so với mốc hiện tại

`Độ dài dư = độ dài lịch sử trung bình - baseLen`.

| Vùng độ dài dư | 2024 | 2025 | 2026 | Kết luận |
|---|---:|---:|---:|---|
| `< 0,25 ngày` | +0,09 | +0,80 | +0,77 | Edge gãy dương nhẹ, ổn định |
| `0,25-0,75 ngày` | -0,72 | -1,61 | -1,82 | Edge âm ổn định, cần giảm điểm |
| `>= 0,75 ngày` | Đảo dấu | Đảo dấu | Đảo dấu | Không dùng trực tiếp |

Độ dài chỉ nên là cổng chất lượng, không thay thế xác suất chuyển tiếp.

### 3. Gần nhất / TB cách

Các bin `<0,25`, `0,75-1`, `1-1,5`, `>=1,5` đảo dấu giữa 2024, 2025 và 2026. Không có quan hệ đơn điệu “càng đến hạn càng dễ về” hoặc “vừa về thì càng dễ gãy”.

Kết luận: giữ metric này để quan sát và nghiên cứu hazard, nhưng không dùng làm quy tắc loại mạnh. Trọng số thử nghiệm bị giới hạn ở mức rất nhỏ.

### 4. Chuỗi tiềm năng

Trong 15.638 quan sát tiềm năng của lát cắt 2026:

- 88,30% target chưa từng xuất hiện trong lịch sử của chính pattern.
- Không có `formationTrials` theo ngày, nên không được diễn giải thành 88,30% không hình thành.
- Cần daily replay để biết số lần precursor thực sự xuất hiện và bao nhiêu lần hình thành.

Khi dùng outcome từng ngày và gom theo họ, chỉ họ `number` có edge không hình thành dương ổn định qua ba năm. Trung bình theo ngày: `+1,20 điểm %`, CI 95% khoảng `[+0,43; +1,98]`. Các họ khác có CI cắt qua 0 hoặc đảo dấu.

## Các biến thể đã thử

1. `numberRecurrenceCalibratedRisk`: posterior/Wilson + hiệu chỉnh mềm theo tần suất, độ dài, gap.
2. `numberRecurrenceGuardedRisk`: posterior/Wilson + cổng giảm điểm target phổ biến và vùng độ dài dư có edge âm.
3. Biến thể timing mạnh/yếu và bỏ timing.

Kết quả exact strict PIT của hiệu chỉnh mềm không đổi thắng/thua so với `numberAnnualCalibratedRisk` trên các mẫu:

| Giai đoạn | Rủi ro năm | Rủi ro + nhịp |
|---|---:|---:|
| 2024, 37 ngày | 14/37 | 14/37 |
| 2025, 37 ngày | 13/37 | 13/37 |
| 2026, 39 ngày | 15/39 | 15/39 |

Ở lát cắt kiểm tra lại mỗi 20 ngày, cổng mạnh cũng chưa đổi hit so với Rủi ro năm. Tín hiệu mới thay điểm nhưng phần lớn chưa vượt ranh giới số thứ 70.

## Công thức thực tế đề xuất

```text
credibleBreakEdge
  = conservativePosteriorBreak - baseBreakProbability(setSize)

score
  = credibleBreakEdge
  x sampleReliability
  x familyDedupWeight
  x frequencyGuard
  x durationGuard
  x timingMonitor
```

Trong đó:

- `frequencyGuard < 1` nếu target >= 2 lần/năm.
- `durationGuard > 1` nhẹ nếu độ dài dư < 0,25 ngày.
- `durationGuard < 1` nếu độ dài dư 0,25-0,75 ngày.
- `timingMonitor` gần 1 và không được dùng khi có dưới 4 lần xuất hiện.
- Potential chỉ được dùng mạnh sau khi có bảng `formationTrials/formationCount` từ daily replay.

## Quyết định

- Chưa đổi phương pháp mặc định production.
- Giữ hai chiến lược mới ở trạng thái `experimental`.
- Có thể hiển thị tần suất/năm, độ dài TB, TB cách và nhịp hiện tại ngay vì các trường đã được nối đúng.
- Chỉ cân nhắc production sau khi chạy đủ mọi ngày của ít nhất ba năm và kiểm tra paired bootstrap theo ngày.
- Ưu tiên nghiên cứu tiếp: tạo bảng daily opportunity cho chuỗi tiềm năng và mô hình hazard theo họ/độ dài; không dùng raw “chưa từng hình thành = 100% loại”.
