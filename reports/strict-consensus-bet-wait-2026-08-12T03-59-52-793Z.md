# Đồng thuận phương pháp strict PIT: Đánh và Chờ

- Phạm vi: 2016-01-01 -> 2026-07-10; 3778 ngày dự đoán; 13 phương pháp.
- Đánh = nhóm phiếu cao nhất; Chờ = nhóm phiếu dương cao nhì. Không ép số lượng cố định.
- Khoảng chờ là hậu kiểm. “0 ngày” nghĩa là có một số trong dàn về ngay ngày dự đoán.

| Dàn | Số TB | Trúng cùng ngày | Chờ đến lần xuất hiện (bao gồm ngày dự đoán) min / median / max ngày lịch | Chờ sau ngày dự đoán min / median / max ngày lịch |
|---|---:|---:|---:|
| Đánh (đồng thuận cao nhất) | 1.904 | 82/3778 | 0 / 42 / 700 | 1 / 44 / 700 |
| Chờ (đồng thuận cao nhì) | 2.799 | 106/3778 | 0 / 28 / 706 | 1 / 29 / 706 |

## Giới hạn

- Báo cáo này mô tả đồng thuận và khoảng chờ, chưa chứng minh lợi nhuận hay là chiến lược production.
- Không chọn lại ngưỡng sau khi xem các kết quả trong cùng tập dữ liệu.
