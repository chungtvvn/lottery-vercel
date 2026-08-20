# Danh gia Nhịp block complex co kiem chung

Ngay nghien cuu: 2026-07-18

## Thay doi duoc thu nghiem

- Sua bo do block de giu moi do dai hop le sau khi mau A-B-A toi thieu da hinh thanh.
- Truoc day chi giu chuoi neu dung tai bien hoan tat block A; cach nay loai mat cac chuoi tiep tuc sang chu ky sau roi gay giua block va lam thien lech dropoff.
- Bo sung 5 mau complex: 2-3, 3-1, 4-4, 5-2, 5-3.
- Them strategy nghien cuu `chainBlockCredibleLongFirst` tai Hold 70.
- Block chi duoc boost khi active, co it nhat 5 mau chuyen tiep, cận gay bao thu cao hon nen cua tap so toi thieu 1,5 diem phan tram, va co tin hieu do dai/gần ky luc.
- Block thieu mau hoac khong co edge bao thu bi ha sau chuoi thuong.

## Cach kiem thu

- Strict point-in-time: moi ngay tai sinh stats tu raw prefix truoc ngay du doan.
- Baseline 20 nam chot tai 31/12 cua nam truoc.
- Cung Hold 70, 30 so danh, 1000K/so, an 84.
- So sanh cung ngay giua `chainBlockFirst`, `chainBlockCredibleLongFirst`, `chainSmallFirst`.
- Lay mau walk-forward: 2024 buoc 10 ngay, 2025 buoc 10 ngay, 2026 buoc 5 ngay.

## Ket qua

| Giai doan | Phuong phap | Trung/ngay | Ty le | Profit | Chuoi thua dai nhat |
|---|---|---:|---:|---:|---:|
| 2024 | Block dai co kiem chung | 14/37 | 37,84% | +66.000K | 4 |
| 2024 | Chuoi nho truoc | 14/37 | 37,84% | +66.000K | 4 |
| 2024 | Block truoc (mu) | 13/37 | 35,14% | -18.000K | 5 |
| 2025 | Block dai co kiem chung | 9/37 | 24,32% | -354.000K | 15 |
| 2025 | Chuoi nho truoc | 9/37 | 24,32% | -354.000K | 15 |
| 2025 | Block truoc (mu) | 11/37 | 29,73% | -186.000K | 6 |
| 2026 | Block dai co kiem chung | 15/39 | 38,46% | +90.000K | 6 |
| 2026 | Chuoi nho truoc | 15/39 | 38,46% | +90.000K | 6 |
| 2026 | Block truoc (mu) | 13/39 | 33,33% | -78.000K | 6 |
| Tong 113 ngay | Block dai co kiem chung | 38/113 | 33,63% | -198.000K | 15 |
| Tong 113 ngay | Chuoi nho truoc | 38/113 | 33,63% | -198.000K | 15 |
| Tong 113 ngay | Block truoc (mu) | 37/113 | 32,74% | -282.000K | 6 |

Nguong hoa von cua dan 30 so, an 84 la 35,71%.

## Doi chieu dan so

- Strategy block co kiem chung chi thay doi dan so so voi Chuoi nho truoc o 4/113 ngay.
- Ca 4 ngay thay doi deu khong lam thay doi ket qua trung/truot.
- Nhieu block co edge nhưng tap so rong 50-76 so; do do viec dua chain len cao khong nhat thiet thay doi 30 so danh sau cung.
- So luong candidate tang len khoang 3.000-3.400/ngay, lam strict PIT cham hon dang ke.

## Ket luan

- Sua bo do la hop ly va loai bo selection bias cua thong ke block cu.
- Them block complex tao du lieu day du hon, nhưng chua chung minh duoc lift du bao o Hold 70.
- Khong nen dat `chainBlockCredibleLongFirst` lam production default.
- Khong nen uu tien tat ca block chi vi dat ky luc/100% dropoff; strategy block mu kem hon tren tong mau.
- Huong nghien cuu tiep theo nen la xep hang tung so theo dong thuan cua cac block da khử tap so trung, co phat do rong tap so, thay vi sap xep nguyen chain rong.
