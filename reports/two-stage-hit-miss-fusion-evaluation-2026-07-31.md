# Danh gia hai tang: du doan truot + tong hop dan trung

## Muc tieu

Thu nghiem dung de xuat:

1. Xac dinh cac phuong phap Hold 70 co ty le trung thap hon nen 30%, tong hop cac so cua chung thanh danh sach `du doan truot` 10-20 so.
2. Tong hop cac phuong phap co ty le trung cao hon nen 30% thanh bang xep hang so co kha nang ve.
3. Loai tiep cac so nam trong danh sach du doan truot, sau do lay Top 10/15/20/30 so de danh.

## Giao thuc kiem dinh

- Dau vao: 13 phuong phap strict PIT, moi phuong phap tra dung 30 so moi ngay.
- Loai khoi phep so sanh phuong phap co kich thuoc dan khac 30 de tranh loi do cardinality.
- Hoc do tin cay/phuong cua tung phuong phap tren 2016-2023.
- Chon prior, cach bo phieu va kich thuoc danh sach truot tren 2024.
- Xac nhan doc lap tren 2025.
- Dong bang cong thuc, test tren 203 ngay nam 2026 (01/01-26/07; R2 chua co day du ket qua da ket toan sau 26/07 tai luc chay).
- Von: 1.000K/so/ngay, trung nhan 84 lan.
- Da thu 128 cau hinh: prior 30/100/300/1000, bo phieu deu/co trong so, danh sach truot 0/10/15/20, dan danh 10/15/20/30.

## Ket qua chinh

| Dan danh | Dan truot duoc chon | Trung 2026 | Ty le trung | Muc hoa von | Profit | ROI | Chuoi thua dai nhat |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 10 | 15/203 | 7,39% | 11,90% | -770.000K | -37,93% | 70 |
| 15 | 10 | 29/203 | 14,29% | 17,86% | -609.000K | -20,00% | 25 |
| 20 | 0 | 34/203 | 16,75% | 23,81% | -1.204.000K | -29,66% | 23 |
| 30 | 0 | 59/203 | 29,06% | 35,71% | -1.134.000K | -18,62% | 14 |

Khong co cau hinh nao profit duong dong thoi tren 2024, 2025 va 2026. So cau hinh profit duong:

- 2024: 84/128.
- 2025: 0/128.
- 2026: 0/128.
- Ca ba giai doan: 0/128.

## Do chinh xac cua danh sach du doan truot

Voi danh sach 10 so, muc ngau nhien ky vong la 90% ngay ket qua khong nam trong danh sach.

| Giai doan | Ty le ket qua khong nam trong 10 so du doan truot | So voi ngau nhien |
|---|---:|---:|
| 2024 chon tham so | 90,33% | +0,33 diem % |
| 2025 xac nhan | 90,03% | +0,03 diem % |
| 2026 strict PIT | 86,21% | -3,79 diem % |
| 2026 refit den het 2025 | 87,19% | -2,81 diem % |

Tin hieu truot khong tong quat hoa. Tren 2026, no loai nham ket qua thuc te nhieu hon danh sach 10 so ngau nhien.

## Chi tiet Top 15 theo thang 2026

Top 15 la cau hinh it lo nhat trong bon muc dan cua phep chon dong bang tu 2024, nhung van khong dat hoa von.

| Thang | Trung | Ty le | Profit | ROI |
|---|---:|---:|---:|---:|
| 01 | 6/31 | 19,35% | +39.000K | +8,39% |
| 02 | 4/24 | 16,67% | -24.000K | -6,67% |
| 03 | 5/31 | 16,13% | -45.000K | -9,68% |
| 04 | 6/30 | 20,00% | +54.000K | +12,00% |
| 05 | 2/31 | 6,45% | -297.000K | -63,87% |
| 06 | 3/30 | 10,00% | -198.000K | -44,00% |
| 07 | 3/26 | 11,54% | -138.000K | -35,38% |

## Ket luan ky thuat

1. Cac phuong phap “tot” va “xau” khong on dinh theo nam. Chenh lech so voi nen 30% nho va doi dau giua cac nam.
2. Cach phu quyet bang danh sach truot cai thien nhe tren tap chon 2024, khong cai thien tren 2025 va lam xau 2026.
3. Refit them 2025 khong sua duoc van de; do do day khong chi la loi chon prior.
4. Khong nen dua phuong phap nay vao production, bot Telegram hay thay doi mac dinh hien tai.
5. Khong duoc chon cau hinh tot nhat truc tiep tren 2026, vi nhu vay se bien tap test thanh tap toi uu va gay leakage lua chon.

## Huong nghien cuu tiep theo

- Chi cho phep phu quyet khi cang duoi Wilson cua `miss accuracy` cao hon muc ngau nhien tuong ung voi kich thuoc danh sach.
- Hoc theo rolling/walk-forward va cho phep bo ngay khi khong co tin hieu du manh, thay vi bat buoc ngay nao cung danh.
- Danh gia tung so bang out-of-fold calibration thay vi gan nhan ca phuong phap la “tot” hoac “xau”.
- Yeu cau profit duong tren it nhat hai holdout lien tiep truoc khi duoc phep chay production.

## Tep nguon

- Ket qua day du: `reports/research_two_stage_hit_miss_fusion_2026-07-31T15-39-10-994Z.json`
- Phan mo rong strict PIT 2026: `reports/research_true_pit_strategies_2026-07-31T15-38-31-047Z.json`
- Trien khai nghien cuu: `lib/research/twoStageHitMissFusion.js`
- Script lap lai: `scripts/research-two-stage-hit-miss-fusion.js`
- Test: `scripts/test-two-stage-hit-miss-fusion.js`
