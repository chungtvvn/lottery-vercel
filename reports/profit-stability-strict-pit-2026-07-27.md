# Kiem dinh phuong phap loai tru co profit on dinh

Ngay chay: 2026-07-27

## Pham vi va kinh te

- De, payout 1 an 84.
- Moi don vi cuoc: 1.000K.
- Baseline nam duoc khoa tai 31/12 nam truoc.
- Moi ngay duoc tai sinh tu raw prefix ket thuc tai D-1.
- Cac tap so duoc tao tu `chainBlockFirst` va `chainSmallFirst`.
- Hold duoc thu: 65, 70, 85.
- Bien the ket hop: block, small, giao, hop, phan khong giao va danh song song x2.
- Nam 2025: 361 ngay, tai sinh bang logic hien tai.
- Nam 2026: 203 ngay, tu 01/01 den 26/07.

Nguon strict PIT:

- `research_true_pit_strategies_2026-07-27T14-43-16-097Z.json`
- `research_true_pit_strategies_2026-07-27T11-20-47-263Z.json`

## Dieu kien hoa von

Neu danh co dinh 30 so moi ngay, ty le trung toi thieu la:

```text
30 / 84 = 35,714286%
```

Neu danh `k` don vi thay doi theo ngay, ty le trung hoa von cua ngay do la
`k / 84`. Vi vay khong duoc so sanh cac dan thay doi kich thuoc chi bang ty le
trung ngay; phai tinh stake va payout tren tung dong.

## Ket qua cac dan co dinh

### Hold 70, danh 30 so

| Phuong phap | Nam 2025 | Nam 2026 den 26/07 |
|---|---:|---:|
| Chuoi nho truoc | 107/361, -1.842.000K | 63/203, -798.000K |
| Nhip block truoc | 104/361, -2.094.000K | 63/203, -798.000K |

Khong phuong phap Hold 70 co dinh nao vuot hoa von o ca hai giai doan.

### Bien the co profit tot nhat khi fit nam 2025

`Block Hold 85`, danh 15 so/ngay:

- 2025: 66/361, profit +129.000K.
- 2026 holdout: 23/203, profit -1.113.000K.

Ket qua nay la vi du ro ve regime shift: cau hinh duong tren nam fit khong lap
lai tren nam sau.

## Kiem tra bo ngay theo can tin cay

Moi ngay, he thong:

1. Chi dung ket qua da co truoc ngay dang du doan.
2. Tinh hieu suat cua 54 bien the trong cua so qua khu.
3. Tinh can duoi Wilson cua ty le trung.
4. So sanh can duoi voi diem hoa von theo so don vi trung binh.
5. Bo ngay neu khong co bien the nao vuot nguong.

Da quet 625 cau hinh cua so, co mau, Wilson va margin. Quy tac chon cau hinh
chi duoc nhin nam 2025:

```text
profit 2025 > 0
so ngay choi >= 30
uu tien so thang duong, thang te nhat, sau do profit
```

Cau hinh duoc chon truoc khi xem holdout:

```text
window=60, minSamples=45, Wilson z=0, margin=3%
```

| Giai doan | Ngay choi | Trung | Stake | Profit |
|---|---:|---:|---:|---:|
| Fit 2025 | 160/361 | 37 | 2.869.000K | +239.000K |
| Holdout 2026 | 78/203 | 19 | 1.791.000K | -195.000K |

Cau hinh duoc chon tren 2025 khong vuot holdout, nen bi loai.

## Cau hinh duong ca hai nam nhung khong duoc chon

Sau khi quet toan bo luoi, co cau hinh:

```text
window=60, minSamples=60, z=0, margin=5%
```

- 2025: 101 ngay choi, profit +91.000K.
- 2026: 56 ngay choi, profit +32.000K.

Khong duoc phep coi day la ket qua production vi:

- No khong thang theo quy tac chon da khoa tren nam 2025.
- No duoc nhan ra sau khi da xem ket qua holdout 2026.
- Trong 2026, chi 1/3 thang co cuoc la duong; thang te nhat -168.000K.
- 625 phep thu tao ra rui ro multiple-testing rat lon.
- Profit +32.000K qua nho so voi bien dong cua mot lan trung 84.000K.

Day la ung vien can mot nam holdout moi, khong phai bang chung profit on dinh.

## Ket luan

1. Chua co phuong phap loai tru nao duoc kiem dinh la profit luon duong.
2. Dan co dinh 30 so moi ngay khong vuot hoa von tren lich su strict hien tai.
3. Bo ngay co the giam lo, nhung cau hinh chon tren 2025 van am khi sang 2026.
4. Khong thay production default trong lan nghien cuu nay.
5. Huong tiep theo hop le la khoa truoc mot gate bao thu, ghi snapshot bat bien
   tu ngay phat hanh va danh gia tren du lieu tuong lai chua tung duoc dung de
   chon tham so.

Loi nhuan lich su chi la bang chung mau; khong co phuong phap nao co the dam
bao loi nhuan duong trong xo so ngau nhien.
