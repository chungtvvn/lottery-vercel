# Kiem tra rui ro gay theo cohort >= do dai hien tai

Ngay chay: 2026-07-27

## Sua dinh nghia

Voi chuoi dang o do dai `L` va buoc chuyen `step`:

- `S(L)`: so episode lich su dat it nhat `L`.
- `S(L + step)`: so episode tiep tuc dat it nhat moc ke tiep.
- `break(L) = S(L) - S(L + step)`.
- `risk(L) = break(L) / S(L)`.
- Tan suat dat moc hien tai: `S(L) / so nam`.
- Tan suat dung dung tai `L`: `exact(L) / so nam`.
- Tong phoi nhiem cac trang thai duoi dai hon duoc luu rieng, khong dung lam
  so lan xuat hien vi mot episode dai se dong gop nhieu trang thai.

## Ranker nghien cuu

`numberSurvivalCredibleRisk` ket hop:

- cohort survival `>= L`;
- posterior co ve xac suat nen theo do rong tap so;
- can duoi Wilson;
- do tin cay theo co mau;
- tien do toi ky luc;
- tan suat dat moc hien tai;
- gap/recurrence voi trong so nho va yeu cau du mau;
- khu tap so trung va chi giu bang chung manh nhat moi ho chuoi.

Chuoi tiem nang khong co daily replay khong duoc dua vao diem.

## Screening strict PIT Hold 70

Moi ngay mau duoc tai sinh tu raw prefix ket thuc tai D-1. Baseline nam ket
thuc tai 31/12 nam truoc. Screening lay mot ngay moi 7 ngay de kiem tra che
do truoc khi quyet dinh co chay full daily hay khong.

| Giai doan | Phuong phap | Trung | Ty le | Profit | Chuoi thua dai nhat |
|---|---|---:|---:|---:|---:|
| 2025 | Survival >= L | 12/52 | 23,08% | -552.000K | 8 |
| 2025 | Chuoi nho truoc | 15/52 | 28,85% | -300.000K | 6 |
| 2026 den 26/07 | Survival >= L | 9/29 | 31,03% | -114.000K | 4 |
| 2026 den 26/07 | Chuoi nho truoc | 9/29 | 31,03% | -114.000K | 12 |

Hoa von Hold 70, danh 30 so, an 84 la `30 / 84 = 35,714286%`.

## Ket luan

- Sua tan suat cohort la can thiet de tranh dem lap chuoi dai.
- Ranker survival moi chua vuot hoa von o ca hai giai doan.
- Khong thay production default.
- Khong can chay full daily cho ranker nay truoc khi co them mot tin hieu
  holdout doc lap; screening hien tai da cho ket qua am ro rang.

