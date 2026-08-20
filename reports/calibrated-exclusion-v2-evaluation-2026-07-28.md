# Danh gia he thong diem loai tru V2

Ngay danh gia: 2026-07-28

## Muc tieu

Tao mot lop diem loai tru co the dung chung cho cac dang so ma khong cong
thang ty le gay thô cua nhieu chuoi trung lap. Phuong phap phai giu dung
point-in-time va chi dung du lieu co truoc ngay du doan.

## Cong thuc va rang buoc

`numberCalibratedExclusionV2` chi nhan:

- Chuoi dang dien ra co `transitionEvidenceSource=annual-streak-transition`.
- Chuoi tiem nang chua tung hinh thanh, duoc replay theo ngay va co
  `formationEvidenceSource=daily-replay`.
- Tap so tu 1 den 99 so, tier 1-3 va co toi thieu 5 mau chuyen tiep.

Diem tung chuoi duoc tinh tu:

- Xac suat gay nen: `1 - so_luong_so / 100`.
- Posterior co ve xac suat nen voi prior weight 30.
- Can duoi Wilson mot phia, muc xap xi 90%.
- Edge bao thu: ket hop posterior va Wilson, chi nhan phan lon hon xac suat
  nen.
- Do tin cay co mau, kich thuoc tap so, tier va trang thai dang dien
  ra/tiem nang.
- Tan suat, gap va ky luc chi hieu chinh nhe sau khi chuoi da co edge duong.

Truoc khi cong diem cho tung so, he thong:

- Khử trung theo `family + tap so`.
- Chi giu bang chung manh nhat cua moi family.
- Cong giam dan giua cac family doc lap theo trong so
  `1, 0.55, 0.30, 0.16, 0.08`.

## Ket qua phuong phap V2 dung truc tiep

V2 dung truc tiep khong dat yeu cau. Nhieu so khong co bang chung hop le deu
nhan diem 0, tao tie-break theo gia tri so thay vi theo bang chung. Ket qua
screening strict PIT:

| Giai doan | So ngay mau | Trung | Ty le | Profit |
|---|---:|---:|---:|---:|
| 2025, moi 7 ngay | 52 | 12 | 23.08% | -552,000K |
| 2026, moi 7 ngay | 29 | 10 | 34.48% | -30,000K |

Backtest strict PIT day du 2026, baseline chot tai 2025-12-31:

| Phuong phap | Ngay | Trung | Ty le | Profit | ROI | Thua dai nhat |
|---|---:|---:|---:|---:|---:|---:|
| Chuoi nho | 204 | 64 | 31.37% | -744,000K | -12.16% | 17 |
| V2 truc tiep | 204 | 65 | 31.86% | -660,000K | -10.78% | 9 |

V2 truc tiep tang 1 ngay trung va rut ngan chuoi thua, nhung thay trung binh
20.71 so trong dan 30 so moi ngay so voi Chuoi nho. Ket qua theo thang dao
dong manh: thang 1 chi 25.81%, thang 7 dat 44.44%. Cong them ket qua 2025
bat loi, V2 truc tiep khong duoc phep thay the ranking nen.

## Bien the bao ve Chuoi nho

`numberSmallCalibratedV2` giu nguyen ranking `chainSmallFirst`. Tai Hold 70,
no chi duoc doi toi da mot so qua ranh gio khi:

- So dang nam trong dan danh co bang chung V2 manh.
- So nam sat bien trong dan loai co bang chung V2 thap hon.
- Chenh lech diem it nhat 0.0025.

Ket qua screening strict PIT:

| Giai doan | So ngay mau | Chuoi nho | V2 bao ve | Chenh lech |
|---|---:|---:|---:|---:|
| 2025, moi 14 ngay | 26 | 7/26, 26.92%, -192,000K | 8/26, 30.77%, -108,000K | +1 ngay trung |
| 2026, moi 14 ngay | 15 | 5/15, 33.33%, -30,000K | 5/15, 33.33%, -30,000K | Khong doi |

Ket qua strict PIT day du 2026:

| Phuong phap | Ngay | Trung | Ty le | Profit | ROI | Thua dai nhat |
|---|---:|---:|---:|---:|---:|---:|
| Chuoi nho | 204 | 64 | 31.37% | -744,000K | -12.16% | 17 |
| Chuoi nho + V2 | 204 | 66 | 32.35% | -576,000K | -9.41% | 17 |

Phan tich ghep cap:

- 2025 screening: doi dan 18/26 ngay, cuu 1 ngay, lam hong 0 ngay.
- 2026 day du: doi dan 147/204 ngay, cuu 3 ngay, lam hong 1 ngay.
- Moi ngay co thay doi chi hoan doi mot cap so.

Chi tiet bon ngay thay doi ket qua:

- 2026-02-27: lam hong, bo 83 va them 81.
- 2026-04-15: cuu, bo 36 va them 14.
- 2026-06-02: cuu, bo 90 va them 23.
- 2026-06-04: cuu, bo 12 va them 83.

Theo thang, V2 bao ve co lai trong thang 1, 2, 4 va 6; lo trong thang 3, 5
va 7. Can duoi Wilson 95% cua ty le trung chi 26.31%, thap hon diem hoa von.

## Ket luan

Bien the bao ve co tinh an toan hon V2 truc tiep va tang 0.98 diem phan tram
so voi Chuoi nho trong backtest day du. Tuy nhien ca hai giai doan van duoi
diem hoa von `30 / 84 = 35.714%`, profit van am. Kiem dinh ghep cap chi co
3 lan cuu va 1 lan lam hong, chua du bang chung de ket luan cai thien on
dinh.

Quyet dinh hien tai:

- Giu `numberCalibratedExclusionV2` va `numberSmallCalibratedV2` o trang
  thai `experimental`.
- Khong doi phuong phap mac dinh va khong sinh snapshot production tu V2.
- Chi mo rong sang backtest hang ngay sau khi co calibration bang nam doc
  lap.
- Chi promote neu profit duong va can duoi Wilson vuot diem hoa von tren it
  nhat hai holdout doc lap.

## Thu nghiem ket hop va chon ngay

Sau khi V2 van am, nghien cuu tiep ba lop khong dung ket qua cua ngay dang
du doan:

1. Chon online giua Chuoi nho, V2 bao ve va V2 truc tiep bang ket qua da
   ket toan trong cua so truoc do.
2. Chi choi khi cac dac trung tien ket qua nhu so chuoi ung vien va do
   dong thuan giua cac dan vuot nguong.
3. Hoc xac suat tu mask membership cua 14 phuong phap strict PIT:
   2016-2023 de fit, 2024 chi de chon muc co Bayes/logistic va so luong
   danh, 2025 va 2026 la hai holdout khong dung de chon tham so.

Ket qua:

- Bo chon online tot nhat tren thang 1-4/2026 choi 83 ngay, trung 33 ngay,
  lai `+282,000K`; khi khoa tham so va chay thang 5-7 chi trung 22/73,
  lo `-342,000K`.
- Nguong dong thuan chon tu 2016-2025 khong tao duoc cau hinh dat 60%
  ben vung. Cau hinh co profit nam toi thieu tot nhat van lo
  `-36,000K` tren holdout 2026.
- Logistic membership chon bang log-loss 2024, danh 30 so:
  2025 trung 108/361 (29.92%), lo `-1,758,000K`; 2026 trung 53/187
  (28.34%), lo `-1,158,000K`.
- Neu cho 2024 chon quy mo dan, no chon 8 so va lai `+464,000K` trong
  2024. Khi khoa muc 8 so: 2025 lo `-368,000K`, 2026 lo `-320,000K`.

Ket luan bo sung: khong co bo chon ngay, ensemble membership hay quy mo dan
nao dat profit duong tren ca hai holdout. Viec tiep tuc thay nguong den khi
2026 duong se bien 2026 thanh tap train va lam mat gia tri kiem dinh.

## Tep lien quan

- `lib/research/calibratedExclusionScoreV2.js`
- `lib/services/annualMilestoneService.js`
- `scripts/test-calibrated-exclusion-score-v2.js`
- `reports/research_true_pit_strategies_2026-07-28T07-39-21-059Z.json`
- `reports/research_true_pit_strategies_2026-07-28T07-46-55-609Z.json`
- `reports/research_true_pit_strategies_2026-07-28T09-27-19-369Z.json`
- `reports/calibrated-v2-strict-pit-2026-analysis.json`
- `reports/calibrated-v2-strict-pit-2026-audit.json`
- `scripts/research-pit-selective-confidence.js`
- `scripts/research-pit-membership-calibration.js`
- `reports/research_pit_selective_confidence_2026-07-28T09-40-16-284Z.json`
- `reports/research_pit_membership_calibration_2026-07-28T09-43-38-217Z.json`
