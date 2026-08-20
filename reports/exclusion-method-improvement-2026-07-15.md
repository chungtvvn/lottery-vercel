# Bao cao nghien cuu cai thien phuong phap loai tru - 2026-07-15

## Dieu kien kiem dinh

- Don vi du doan: De, Hold 70, danh 30 so/ngay.
- Von: 1.000K/so; trung nhan 84 lan.
- Hoa von: 30/84 = 35,71% ngay trung.
- Du lieu duoc sinh strict point-in-time theo tung ngay.
- Baseline nam du doan duoc khoa tai 31/12 nam truoc.
- Hoc tren 2024, chon cau hinh tren 2025, dong bang truoc khi kiem tra 2026.

## Ket qua chinh

| Phuong phap | Giai doan chon/kiem tra | So ngay | Ngay trung | Ty le | Profit | ROI | Chuoi thua dai nhat |
|---|---:|---:|---:|---:|---:|---:|---:|
| Chuoi nho truoc | 2026 frozen holdout | 182 | 68 | 37,36% | +252.000K | +4,62% | 9 |
| Active Edge co kiem chung | 2026 strict PIT | 191 | 62 | 32,46% | -522.000K | -9,11% | 10 |
| Cohort tan suat cheo nam | 2026 frozen holdout | 182 | 60 | 32,97% | -420.000K | -7,69% | 12 |
| Softmax theo nhom chuoi | 2026 frozen holdout | 182 | 54 | 29,67% | -924.000K | -16,92% | 12 |
| Lift on dinh theo ho chuoi | 2026 frozen holdout | 182 | 57 | 31,32% | -672.000K | -12,31% | 9 |

## Kiem tra hoan doi Chuoi nho + lift

- So luong hoan doi duoc chon tren 2025 la 25 so.
- Ket qua validation 2025: 118/361 ngay, 32,69%, profit -918.000K.
- Khi dong bang va ap dung 2026: 51/182 ngay, 28,02%, profit -1.176.000K.
- Bien the hoan doi 5 so dat 71/182 ngay (39,01%) trong 2026, nhung chi dat
  106/361 ngay (29,36%) trong 2025. Do do khong duoc phep chon bien the nay dua tren 2026.

## Tin hieu co lift loai tru cung chieu

Mot so nhom co ty le xuat hien cua ket qua thuc te thap hon do phu tap so trong 2024 va 2025:

- Tong tien-lui so le Tier 1.
- Tong lui dang dien ra.
- Tong ve lien tiep dang dien ra.
- Dau lui-tien so le.
- Mot so nhom dit/thu tu dang dien ra.

Tuy nhien, khi dung cac tin hieu nay de xep hang toan bo 100 so, do manh tong hop
khong du vuot nguong hoa von. Tin hieu co y nghia mo ta nhung chua co gia tri du bao
on dinh de thay the Chuoi nho truoc.

## Ket luan ky thuat

1. Khong co phuong phap moi nao vuot qua baseline tren holdout ma van on dinh o nam truoc.
2. Ket qua duong cua Chuoi nho trong 2026 chua lap lai o 2024 va 2025; can xem day la
   bien dong theo che do, khong phai bang chung ve loi the dam bao.
3. Khong thay doi phuong phap mac dinh va khong ghi de snapshot du doan da phat hanh.
4. Buoc nghien cuu tiep theo nen la walk-forward nhieu nam voi mot nam untouched moi,
   thay vi tiep tuc chon tham so tren 2026.

## Tep du lieu doi chieu

- `research_true_pit_strategies_2026-07-07T02-46-07-493Z.json` (2024)
- `research_true_pit_strategies_2026-07-07T03-27-03-079Z.json` (2025)
- `research_true_pit_strategies_2026-07-07T03-48-13-320Z.json` (2026)
- `research_cross_year_cohort_ranker_2026-07-15T07-55-16-985Z.json`
- `research_cross_year_softmax_2026-07-15T08-04-07-791Z.json`
- `research_cross_year_stable_lift_2026-07-15T08-10-55-482Z.json`
