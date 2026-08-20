# Danh gia ket hop Nhịp block va Chuoi nho

Ngay nghien cuu: 2026-07-18

## Phuong phap

- Thu tu loai cua `chainSmallFirst` duoc dung lam nen.
- Block chi dong gop khi active, co it nhat 5 mau chuyen tiep va cận gay bao thu cao hon xac suat nen cua tap so it nhat 1,5 diem phan tram.
- Cac block co cung tap so duoc khử trung; moi so chi nhan toi da ba bang chung block manh nhat.
- Bang chung block bi phat theo do rong tap so.
- Thu ba trong so co dinh 5%, 10%, 20%; chon trong so bang 2024, validation 2025, holdout 2026.
- Strict PIT: stats moi ngay chi duoc sinh tu raw prefix truoc ngay du doan; baseline nam chot 31/12 nam truoc.
- Hold 70, danh 30 so, 1000K/so, an 84; nguong hoa von 35,71%.

## Chon trong so 2024

| Phuong phap | Trung | Ty le | Profit | Chuoi thua dai nhat |
|---|---:|---:|---:|---:|
| Chuoi nho | 14/37 | 37,84% | +66.000K | 4 |
| Blend Block 5% | 14/37 | 37,84% | +66.000K | 4 |
| Blend Block 10% | 14/37 | 37,84% | +66.000K | 4 |
| Blend Block 20% | 14/37 | 37,84% | +66.000K | 4 |

Vi khong co lift, chon 5% theo nguyen tac tac dong toi thieu; 10% va 20% khong duoc dua sang validation/holdout.

## Validation va holdout

| Giai doan | Phuong phap | Trung | Ty le | Profit | Chuoi thua dai nhat |
|---|---|---:|---:|---:|---:|
| 2025 validation | Chuoi nho | 9/37 | 24,32% | -354.000K | 15 |
| 2025 validation | Blend Block 5% | 9/37 | 24,32% | -354.000K | 15 |
| 2026 holdout | Chuoi nho | 15/39 | 38,46% | +90.000K | 6 |
| 2026 holdout | Blend Block 5% | 15/39 | 38,46% | +90.000K | 6 |
| Tong 113 ngay | Chuoi nho | 38/113 | 33,63% | -198.000K | 15 |
| Tong 113 ngay | Blend Block 5% | 38/113 | 33,63% | -198.000K | 15 |

Blend 5% doi dan o 20/113 ngay, trung binh khoang 0,21 so/ngay. Khong co ngay nao so thuc te nam trong tap so duoc hoan doi, nen delta trung/truot bang 0.

## Do on dinh cua tin hieu Block

Lift = ty le loai dung quan sat tru ty le loai dung nen cua kich thuoc tap so.

| Cohort | So mau | Lift tong | 2024 | 2025 | 2026 |
|---|---:|---:|---:|---:|---:|
| Block 2-1 | 150 | -2,4pp | -4,7pp | +1,8pp | -6,4pp |
| Block 2-2 | 98 | +0,7pp | +3,8pp | +9,0pp | -4,4pp |
| Block 2-3 | 72 | +5,7pp | +20,3pp | -4,1pp | ~0pp |
| 10-19 mau chuyen tiep | 94 | +2,1pp | +7,0pp | +4,7pp | -7,0pp |
| 20+ mau chuyen tiep | 192 | +0,1pp | +6,1pp | +4,2pp | -5,9pp |
| Tap 21-40 so | 74 | +0,5pp | +12,9pp | +11,4pp | -15,3pp |

Block 3-x tro len hien co qua it mau de ket luan (phan lon 1-4 mau).

## Ket luan

- Bo do block moi sua duoc selection bias va tao stats do dai dung hon.
- Tin hieu block co mot so cohort duong trong tung nam, nhưng khong on dinh qua che do nam.
- Ket hop cap tung so tot hon sap xep nguyen block ve mat kien truc, nhưng chua tao lift hit/profit.
- Khong promote `numberBlockSmallBlend05/10/20` va khong doi production default.
- Buoc nghien cuu tiep theo chi nen tiep tuc khi co them co che calibration theo nam/che do duoc hoc truoc holdout; khong chon cohort truc tiep tu ket qua 2026.
