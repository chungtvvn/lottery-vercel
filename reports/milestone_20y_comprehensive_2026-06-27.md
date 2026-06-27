# Bao cao tong hop Moc 20 nam - 27/06/2026

## 1. Pham vi du lieu

- Nguon chuan: Cloudflare R2.
- Du lieu xo so: 7.473 ky, tu 01/10/2005 den 26/06/2026.
- Nhom thong ke tren R2:
  - So: 1.348 pattern.
  - Dau/dit: 8.746 pattern.
  - Tong/hieu: 41.860 pattern.
  - Tong cong: 51.954 pattern.
- Pattern mo rong dang co:
  - 300 pattern theo bo so.
  - 35.780 pattern ve theo thu tu/so le theo thu tu.
  - 155 pattern so le theo cap.
  - 2.184 pattern chua co streak lich su; cac pattern nay khong tu dong duoc coi la tin hieu chac chan, ma chi duoc uu tien khi trang thai hien tai thoa dieu kien tiem nang.

Cong thuc De trong bao cao:

- Moi so danh 1.000K.
- Trung nhan 84 lan.
- Profit = payout - tong tien danh.

Cong thuc Lo:

- Moi so danh 2.300K.
- Moi lan xuat hien nhan 8.000K.
- Mot so co the trung nhieu lan trong 27 vi tri.

## 2. Ba lop bang chung can tach rieng

### A. Ap Moc 2026 nguoc ve 2005-2025

Bao cao lich su dung `fixedBaselineYear=2026`: record va tan suat cua moc 20 nam hien tai duoc ap nguoc cho moi ngay trong qua khu.

Day la phep danh gia "neu dung bo moc hien tai cho lich su thi sao", nhung co look-ahead. Ket qua nay khong phai backtest point-in-time va khong duoc dung de cam ket tuong lai.

Trong lop nay, `chainSmallFirst` co profit duong o ca 22 nam quan sat cho cac Hold 35-90. Cac phuong an noi bat:

| Phuong an | Profit xap xi 2005-26 | Profit 2026 | Hit 2026 | ROI 2026 | Thua dai nhat 2026 |
|---|---:|---:|---:|---:|---:|
| chainSmallFirst Hold 80 | +230.970.000K | +965.000K | 28,90% | 29,83% | 8 |
| chainSmallFirst Hold 75 | +228.707.000K | +1.384.000K | 37,57% | 33,95% | 5 |
| chainSmallFirst Hold 70 | +224.834.000K | +1.585.000K | 44,51% | 32,46% | 5 |
| chainSmallFirst Hold 65 | +215.919.000K | +1.429.000K | 49,13% | 25,02% | 5 |
| chainSmallFirst Hold 60 | +203.980.000K | +1.601.000K | 56,65% | 24,14% | 5 |
| chainSmallFirst Hold 55 | +183.206.000K | +1.871.000K | 64,16% | 25,10% | 5 |
| chainSmallFirst Hold 35 | +72.046.000K | +1.178.000K | 84,39% | 10,63% | 2 |

Luu y: tong lich su la xap xi, ghep ket qua 2005-2025 cua lan chay 25/06 voi ket qua 2026 chay lai tren R2 den 26/06.

### B. Point-in-time dung nghia

Voi du lieu bat dau tu 01/10/2005, phuong phap can du 20 nam chi co the duoc kiem dinh point-in-time tu cuoi 2025. Khong the tao mot backtest 20 nam point-in-time hop le cho cac nam 2006-2024 neu khong co du lieu truoc 2005.

Nam 2026 duoc chay voi baseline chot truoc nam va chuoi ngay duoc tinh theo tung ngay. Ket qua 173 ngay den 26/06:

| Muc tieu | Phuong an | So danh TB/ngay | Hit | 95% CI hit | Profit | ROI | Thua dai nhat |
|---|---|---:|---:|---:|---:|---:|---:|
| Profit lon nhat | chainSmallFirst Hold 55 | 43,08 | 64,16% | 56,78-70,93% | +1.871.000K | 25,10% | 5 |
| Can bang | chainSmallFirst Hold 70 | 28,23 | 44,51% | 37,30-51,95% | +1.585.000K | 32,46% | 5 |
| Hit cao | chainSmallFirst Hold 35 | 64,08 | 84,39% | 78,24-89,05% | +1.178.000K | 10,63% | 2 |
| ROI cao nhung bien dong | numberWeightedRisk Hold 90 | 10,00 | 16,76% | - | +706.000K | 40,81% | 15 |

`chainSmallFirst Hold 55` dung dau profit hien tai. `Hold 70` tot hon neu can giam von moi ngay. `Hold 35` tang hit rate nhung can von rat lon va ROI thap hon.

### C. Forward/live

Du doan Lo production moi `milestone20yChainSmallFirstHold65TwoHitGreedy` bat dau voi dan pending ngay 27/06/2026. Chua co ngay settled nao cua chinh version nay, vi vay chua co bang chung live de ket luan.

Khong duoc gop 9 ngay live cu vao version moi vi cac ngay do dung nhieu method khac nhau.

## 3. Lo - ket qua backtest gan nhat

Bao cao 6 thang den 24/06/2026, 183 ngay, 27 vi tri, moi vi tri dung Moc 20 nam `chainSmallFirst Hold 65`, tong hop `Two-hit Greedy`, danh top 7:

- Co it nhat 1 hit: 172/183 ngay = 93,99% (95% CI 89,56-96,61%).
- Co it nhat 2 hit: 128/183 ngay = 69,95% (95% CI 62,95-76,12%).
- Co it nhat 3 hit: 76/183 ngay = 41,53% (95% CI 34,64-48,77%).
- Trung binh: 2,257 hit/ngay.
- Stake: 2.946.300K.
- Payout: 3.304.000K.
- Profit: +357.700K.
- ROI: 12,14%.
- Chuoi ngay profit am dai nhat: 9 ngay.
- Chuoi ngay duoi 2 hit dai nhat: 3 ngay.

Voi top 7, chi phi ngay la `7 x 2.300K = 16.100K`. Hai hit chi thu `16.000K`, van lo 100K. Muon profit duong trong ngay can it nhat 3 hit. Vi vay chi so "it nhat 2 hit" khong dong nghia "ngay thang".

So sanh do on dinh:

- 1 thang: Two-hit Greedy Hold 65 top 7 profit +37.000K, ROI 7,66%.
- 3 thang: +158.900K, ROI 10,85%.
- 6 thang: +357.700K, ROI 12,14%; day la phuong an co profit cao nhat trong tap aggregation 6 thang da test.
- Support Hold 70 dung dau o cua so 1 va 3 thang, nhung kem hon Two-hit Greedy Hold 65 tren 6 thang. Do do production chon cua so dai hon thay vi chase ket qua ngan han.

## 4. Ket luan trien khai

### De

1. Production can bang: `chainSmallFirst Hold 70`.
   - Khoang 28 so/ngay theo ket qua 2026.
   - Profit va ROI deu duong, chuoi thua hien tai 5 ngay.
2. Production uu tien profit: `chainSmallFirst Hold 55`.
   - Profit tuyet doi 2026 cao nhat.
   - Dan danh trung binh 43 so/ngay, can von lon hon.
3. Theo doi hit cao: `chainSmallFirst Hold 35`.
   - Khong nen coi la phuong an profit toi uu; no phu hop lam benchmark an toan hon ve hit.
4. Khong khuyen nghi Hold 90 lam mac dinh.
   - ROI ly thuyet cao o mot so score, nhung hit thap va chuoi thua co the 15-45 ngay.

### Lo

1. Giu production `chainSmallFirst Hold 65 + Two-hit Greedy + top 7`.
2. Khong doi method theo ket qua 1 thang. Chi danh gia lai sau toi thieu 90 ngay live, uu tien 180 ngay.
3. Theo doi rieng ba KPI: avg hit/ngay, ti le >= 2 hit, ti le >= 3 hit. Profit ngay phu thuoc KPI >= 3 hit.
4. Dung snapshot bat bien truoc gio quay; sau khi co ket qua chi settle, khong tinh lai dan cu.

## 5. Quan tri rui ro va dieu kien dung

Khong co phuong an nao dam bao luon co lai. De tranh overfit:

- Khong tang tien sau chuoi thua.
- Von toi thieu phai chiu duoc it nhat 2 lan chuoi thua lich su:
  - De Hold 55/70: it nhat 10 ngay stake.
  - Lo top 7: it nhat 18 ngay stake.
- Canh bao neu rolling 30 ngay:
  - De Hold 70 hit duoi diem hoa von theo so danh thuc te.
  - Lo top 7 avg hit duoi 2,0125 hit/ngay.
- Tam dung/ha stake neu rolling 60 ngay profit am; khong tu dong doi sang method vua thang o cua so ngan.
- Chi nang cap method khi no vuot production tren tap holdout/forward, khong chi tren cung du lieu dung de toi uu.

## 6. Han che va du lieu can bo sung

- Backtest "truoc 2026" voi fixed baseline 2026 co look-ahead.
- Muon kiem dinh Moc 20 nam point-in-time cho nam 2006 can co du lieu tu 1986; hien tai khong co.
- Lich su Lo Two-hit Greedy moi co 183 ngay backtest va chua co settled live cua version production.
- 2.184 pattern chua tung co streak co sample bang 0; do hiem khong tu dong dong nghia co kha nang du bao cao.

## 7. Tep doi chieu

- De 2026 R2 den 26/06:
  - `reports/annual_20y_milestone_backtest_2026-06-27T05-17-07.json`
  - `reports/annual_20y_milestone_backtest_summary_2026-06-27T05-17-07.csv`
- De fixed baseline 2005-2026:
  - `reports/annual_20y_milestone_backtest_2026-06-25T11-56-18.json`
- Lo Two-hit Greedy:
  - `reports/backtest_loto_milestone20y_2026-06-26T16-39-10.json`
