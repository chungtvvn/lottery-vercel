# Danh gia do phu 100 so, tan suat, gap va hazard

## Pham vi va quy tac

- Du lieu nguon: 2005-10-01 den 2026-07-14, 7.491 ngay quay.
- Moi feature cua ngay D chi dung ket qua truoc D.
- De duoc tinh truoc, Lo chi duoc tinh sau khi khoa ket luan De.
- De: 30 so/ngay, 1.000K/so, trung nhan 84 lan.
- Lo: 2.200K/so, moi hit nhan 8.000K; Top 6 va Top 7 duoc so sanh rieng.
- Chon tham so tren 2021-2023, test doc lap tren 2024-2025; 2026 chi la giai doan chan doan sau khi khoa tham so.

## 1. Ket qua De

### Bao nhieu ngay thi du 100 so De?

- 13 chu ky day du trong toan bo lich su.
- Trung binh 549,77 ngay quay; trung vi 545; P90 697; ngan nhat 381; dai nhat 817.
- Chu ky hien tai bat dau 2025-08-01, den 2026-07-14 da co 95/100 so.
- Nam so chua xuat hien trong chu ky hien tai: 15, 18, 56, 58, 98.
- Cua so toi thieu de bao phu du 100 so tai ngay 2026-07-14 la 509 ngay quay.

### Phan bo cua so toi thieu trong 12 thang gan nhat

| Thang | Trung binh ngay quay | Min | Max |
|---|---:|---:|---:|
| 2025-07 | 639,35 | 621 | 648 |
| 2025-08 | 589,58 | 540 | 637 |
| 2025-09 | 531,10 | 513 | 560 |
| 2025-10 | 513,87 | 365 | 561 |
| 2025-11 | 385,50 | 371 | 400 |
| 2025-12 | 416,00 | 401 | 431 |
| 2026-01 | 447,00 | 432 | 462 |
| 2026-02 | 474,50 | 463 | 486 |
| 2026-03 | 502,00 | 487 | 517 |
| 2026-04 | 532,50 | 518 | 547 |
| 2026-05 | 468,23 | 440 | 552 |
| 2026-06 | 480,50 | 466 | 495 |
| 2026-07 | 502,50 | 496 | 509 |

### Ghep coverage/hazard vao ChainSmallFirst Hold70

Phuong an tot nhat tren validation chi doi toi da mot so/ngay, L2=5.

| Giai doan | Baseline hit | Candidate hit | Chenh lech | Candidate profit | Chuoi thua candidate |
|---|---:|---:|---:|---:|---:|
| Validation 2021-2023 | - | - | +9 ngay | - | - |
| Test 2024-2025 | 206/723 | 205/723 | -1 ngay | -4.470.000K | 17 ngay |
| Chan doan 2026 | 68/187 | 70/187 | +2 ngay | +270.000K | 9 ngay |

Quyet dinh: **khong promote**. Candidate giam 84.000K va tang chuoi thua tu 14 len 17 ngay tren test doc lap. Ket qua 2026 khong du de dao nguoc ket luan test.

### Ket luan xac suat De

- Nhom hazard cao/nhom thap co lift 1,017 tren train, 0,982 tren validation, 1,014 tren test va 1,917 trong 2026: dau hieu khong on dinh theo regime.
- Trang thai "chua xuat hien trong chu ky" cung dao chieu: lift 0,953; 1,044; 1,070; 0,681.
- Khong duoc dung quy tac "so lau chua ve thi sap ve". Day la gambler's fallacy neu khong co lift holdout on dinh.

## 2. Ket qua Lo (thuc hien sau De)

### Bao nhieu ngay thi du 100 so Lo?

- 377 chu ky day du.
- Trung binh 19,87 ngay quay; trung vi 19; P90 26; ngan nhat 11; dai nhat 37.
- Trong 12 thang gan nhat, cua so toi thieu trung binh 19,22 ngay, dao dong 12-37 ngay.

### Mo hinh coverage/hazard doc lap

Mo hinh train theo kha nang mot so co mat trong ngay; ket toan profit theo tat ca lan xuat hien trong 27 vi tri.

| Dan | Validation profit | Test 2024-2025 profit | Profit 2026 | Hit-day 2026 | >=2 hit 2026 |
|---|---:|---:|---:|---:|---:|
| Top 6 | +208.400K | +400K | +78.800K | 80,10% | 55,50% |
| Top 7 | +97.800K | +105.800K | +162.600K | 85,86% | 62,83% |

Top 7 co loi nhuan duong tren 2024, 2025 va 2026, nhung bien loi nhuan nho. So voi baseline tan suat 365 ngay:

- Test 2024-2025: coverage/hazard hon 376.000K.
- 2026: coverage/hazard kem 128.000K va kem 1,05 diem phan tram o ty le >=2 hit.

Quyet dinh: **research-only, chua thay production**. Can nguon dan Lo chain strict PIT dai han tren dung cung ngay de thu ghep voi RRF; hien tai ket qua chi chung minh feature doc lap co tin hieu, khong chung minh tot hon phuong phap Lo production.

## Ket luan chung

1. Do phu, gap va hazard la feature phu, khong phai quy tac loai/giu doc lap.
2. De khong vuot promotion gate tren test doc lap.
3. Lo Top 7 dang chu y hon nhung loi the dao chieu khi so voi baseline 365 ngay trong 2026.
4. Khong thay doi default, cache hay du doan da phat hanh tu nghien cuu nay.
