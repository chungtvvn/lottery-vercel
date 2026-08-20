# Độ bền của tần suất, độ dài và nhịp chuỗi tiềm năng

- Train: 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023.
- Holdout: 2024, 2025, 2026.
- Edge dương nghĩa là tỷ lệ không hình thành cao hơn xác suất nền của đúng tập số.
- Mỗi feature/cohort chỉ đóng góp tối đa một đơn vị mỗi ngày.

## Tín hiệu bền qua train và cùng dấu trên holdout

| Biến | Nhóm | Năm dương/train | Edge train | Cận bảo thủ | Holdout |
|---|---|---:|---:|---:|---|

## Kết luận sử dụng

Không có cohort nào đủ ổn định để dùng làm tín hiệu loại độc lập.

Nhịp `Gần nhất/TB cách` không được dùng theo quy tắc “đến hạn” nếu edge đổi dấu giữa các năm.

> Backtest lịch sử không bảo đảm lợi nhuận tương lai.
