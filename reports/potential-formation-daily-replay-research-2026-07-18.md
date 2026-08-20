# Nghiên cứu khả năng hình thành chuỗi tiềm năng bằng daily replay

## Mục tiêu

Đánh giá đúng xác suất **không hình thành** của chuỗi tiềm năng, kết hợp:

- số lần xuất hiện trung bình mỗi năm;
- độ dài trung bình khi chuỗi hình thành;
- khoảng cách trung bình giữa các lần xuất hiện;
- số ngày từ lần xuất hiện gần nhất;
- trạng thái kỷ lục và độ rộng tập số;
- kết quả gãy/không hình thành quan sát thực tế.

## Sai lệch đã xác định

Một số luồng cũ dùng toàn bộ số ngày lịch sử làm mẫu khi `prefixCount` không lớn hơn
`formationCount`. Ví dụ khoảng 7.500 ngày có thể bị coi là 7.500 cơ hội của một tiền đề
cụ thể. Cách này đẩy tỷ lệ không hình thành lên gần 100% dù tiền đề thực tế chỉ xuất hiện
rất ít lần.

Kết luận: `gapStats` tích lũy không đủ để suy ra `formationTrials`. Mỗi trial phải được
ghi nhận bằng replay ngày mà tiền đề thực sự đang tồn tại.

## Cách tính mới trong nghiên cứu

1. Sinh candidate strict point-in-time cho từng ngày; baseline năm khóa tại 31/12 năm trước.
2. Mỗi candidate `potential` xuất hiện trong ngày là một cơ hội tiền đề.
3. Kết quả thực tế nằm trong tập số candidate là **hình thành**; nằm ngoài là
   **không hình thành**.
4. Candidate tương quan trong cùng cohort/ngày được gộp thành tối đa một đơn vị ngày.
5. Partial pooling theo:
   - độ rộng tập số;
   - họ chuỗi;
   - trạng thái kỷ lục và độ dài;
   - pattern;
   - tần suất đích và độ dài dư trung bình.
6. Chỉ dùng edge dương sau shrinkage để hoán đổi tối đa một vài số quanh dàn đánh 30 số.

## Kiểm chứng train/validation/holdout

### Mô hình pooling thông thường

- Train: 2014-2023, 370 ngày strict PIT lấy mẫu.
- Chọn cấu hình: 2024, 37 ngày.
- Test 2025: 37 ngày.
- Holdout cuối 2026: 39 ngày.

| Giai đoạn | Baseline | Hiệu chỉnh potential | Chênh lệch |
|---|---:|---:|---:|
| 2024 validation | 14/37 | 15/37 | +1 |
| 2025 test | 9/37 | 9/37 | 0 |
| 2026 holdout | 15/39 | 16/39 | +1 |

Mặc dù số ngày trúng tăng nhẹ ở 2024 và 2026, calibration ngoài mẫu không tốt hơn:

- 2025: Brier tăng `+0,000187`, log-loss tăng `+0,000887`.
- 2026: Brier tăng `+0,000166`, log-loss tăng `+0,000625`.

Vì cả hai chỉ số xác suất đều xấu hơn, thay đổi số trúng có thể là nhiễu do mẫu thưa.

### Bộ lọc độ bền theo năm

Biến thể thứ hai chỉ giữ cohort có edge không hình thành dương trong ít nhất 70% số năm
train và dùng cận bảo thủ qua năm.

| Giai đoạn | Baseline `chainSmallFirst` | Stable potential | Chênh lệch |
|---|---:|---:|---:|
| 2024 validation | 14/37 | 14/37 | 0 |
| 2025 test | 9/37 | 11/37 | +2 |
| 2026 holdout | 15/39 | 16/39 | +1 |

Đây là tín hiệu đáng tiếp tục kiểm tra, nhưng chưa đủ để promote vì:

- chỉ 37-39 ngày/năm, lấy mẫu cách quãng;
- calibration không cải thiện nhất quán;
- cấu hình vẫn hoán đổi khoảng 1,7-1,8 số/ngày;
- chưa có replay đủ mọi ngày cho các năm train.

## Tần suất, độ dài và nhịp

Trên 2024-2025 và holdout 2026, một số cohort cùng dấu:

| Cohort | Edge train bảo thủ | Edge 2026 |
|---|---:|---:|
| Đít tiềm năng, tần suất đích ≥3/năm | +10,85 điểm % | +12,22 điểm % |
| Tổng tiềm năng, tần suất 0,25-0,75/năm | +4,25 điểm % | +12,04 điểm % |
| Số tiềm năng, độ dài dư 0,25-0,75 ngày | +4,20 điểm % | +8,33 điểm % |
| Hiệu tiềm năng, độ dài dư 0,75-1,5 ngày | +2,82 điểm % | +7,75 điểm % |
| Số tiềm năng chưa từng đạt đích | +0,70 điểm % | +0,65 điểm % |

Các số trên là mô tả cohort, không phải xác suất độc lập của từng candidate. Nhiều
candidate có tập số chồng lấn mạnh.

`Gần nhất / TB cách` không có quan hệ đơn điệu ổn định giữa các năm. Không dùng quy tắc
“đã đến hạn thì dễ xuất hiện” hoặc “chưa đến hạn thì chắc chắn gãy”.

## Quyết định

**Research-only, không đổi production.**

Việc nên làm tiếp theo:

1. Replay đủ mọi ngày 2014-2026 với candidate diagnostics chứa đầy đủ trường recurrence.
2. Fit theo rolling-origin: train đến năm N-1, dự đoán toàn bộ năm N.
3. Bootstrap theo ngày/tháng, không bootstrap theo candidate.
4. Chỉ promote nếu đồng thời:
   - Brier và log-loss giảm ngoài mẫu;
   - hit/profit tăng ở nhiều năm;
   - không làm xấu năm tệ nhất và chuỗi thua dài nhất.

> Backtest lịch sử không bảo đảm lợi nhuận tương lai.
