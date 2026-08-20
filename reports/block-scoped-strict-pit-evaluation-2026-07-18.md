# Danh gia Block chon loc bang strict point-in-time

## Muc tieu

- Giu co dinh Hold 70, danh 30 so, 1.000K/so, trung nhan 84.
- So sanh truc tiep voi `chainSmallFirst` tren cung ngay, cung du lieu va cung moc lich su.
- Chi xem Block dang dien ra; loai Block tiem nang va Block co tap so lon hon 70.
- Cohort Block duoc thu nghiem:
  - Nhip `3-3` dung ngay vua hinh thanh du do dai toi thieu.
  - Nhip `2-1` dung ngay cham ky luc lich su.
- Block vuot ky luc khong duoc gop chung voi Block dung ky luc.

## Ket qua

| Giai doan | So ngay | Moc baseline | Chuoi nho hit | Block chon loc hit | Chenh lech | Profit Block | ROI Block | Thua dai nhat |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| 2024, lay mau moi 10 ngay | 37 | 31/12/2023 | 14 | 15 | +1 | +150.000K | 13,51% | 4 |
| 2025, lay mau moi 10 ngay | 37 | 31/12/2024 | 9 | 11 | +2 | -186.000K | -16,76% | 6 |
| 01/01-14/07/2026, du tung ngay | 191 | 31/12/2025 | 70 | 70 | 0 | +150.000K | 2,62% | 9 |

Hai moc 2024-2025 chi la mau dung de san loc. Nam 2026 la phep kiem tra day du tung ngay.

## Doi chieu 2026

- 32/191 ngay thay doi dan so so voi `chainSmallFirst`.
- Chi 4 ngay thay doi trang thai trung/truot.
- Block chon loc cuu dung 2 ngay: 07/04 va 26/05.
- Block chon loc lam mat 2 ngay: 03/06 va 02/07.
- Ket qua rong: 0 hit, 0K profit, 0 diem phan tram ROI.

| Thang | Chuoi nho hit | Block chon loc hit | Chenh lech |
|---|---:|---:|---:|
| 01/2026 | 11 | 11 | 0 |
| 02/2026 | 10 | 10 | 0 |
| 03/2026 | 11 | 11 | 0 |
| 04/2026 | 9 | 10 | +1 |
| 05/2026 | 10 | 11 | +1 |
| 06/2026 | 16 | 15 | -1 |
| 07/2026 den ngay 14 | 3 | 2 | -1 |

## Phat hien ve Block

- Ty le `pha ky luc` tho khong du de loai. Phai so voi xac suat nen theo kich thuoc tap so.
- Scope tap so `<=60` khong tao du cohort pha ky luc on dinh. Scope `<=70` la nguong nho nhat co du mau de nghien cuu guard hai chieu.
- Cohort `3-3` co edge loai duong o 7/10 nam tien su, tong edge khoang +5,32%.
- Cohort `2-1` dung ky luc co edge duong o 7/10 nam tien su, tong edge khoang +3,96%.
- Cohort `3-2` tan suat thap chi duong 3/10 nam, bi loai khoi phuong phap.
- Khi dua hai cohort tot nhat vao thu tu Hold 70, phan lon tin hieu trung voi `chainSmallFirst`; phan khac biet chua tao loi ich rong tren 191 ngay 2026.

## Quyet dinh

- Khong thay production default.
- Khong them strategy Block moi vao cache/action hang ngay de tranh tang thoi gian tinh ma chua co loi ich.
- Giu bo calibrator va script nghien cuu de danh gia tiep tren holdout moi.
- Huong nang cap tiep theo la guard hai chieu o cap tung so: chi doi so khi so dang bi loai co bang chung Block gay on dinh, dong thoi so dang duoc danh co bang chung Block tiep dien/pha ky luc on dinh. Khong uu tien ca chuoi Block mot cach tuyet doi.

## Nguon doi chieu

- `reports/research_true_pit_strategies_2026-07-18T11-39-33-006Z.json`
- `reports/research_true_pit_strategies_2026-07-18T11-46-16-422Z.json`
- `reports/research_true_pit_strategies_2026-07-18T12-17-55-640Z.json`
- `reports/block-scope-guard-2026-07-18.md`

