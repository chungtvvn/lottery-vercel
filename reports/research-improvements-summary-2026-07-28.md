# Tong hop nghien cuu va cai tien phuong phap XSMB

Ngay tong hop: 2026-07-28

## 1. Nguyen tac duoc chot

1. Du doan ngay D chi duoc dung du lieu ket thuc o D-1.
2. Backtest hop le phai thuoc mot trong hai che do:
   - strict daily point-in-time: tai sinh statistics tu raw prefix D-1;
   - annual locked baseline: khoa moc tai 31/12 nam truoc va dung baseline do cho ca nam sau.
3. Du doan da phat hanh phai la snapshot bat bien. Khi co ket qua chi settlement,
   khong tinh lai dan danh.
4. Tat ca so sanh phai cung ngay, cung so don vi cuoc va cung economics.
5. Bao cao fast-history, full-history replay hoac aggregate khong co daily rows/hash
   khong du dieu kien dung de chon production.

## 2. Cac sua loi du lieu va logic co gia tri lau dai

### 2.1 Chuan hoa pattern

- So le theo cap dung quy luat A-B-A-B.
- Ordered pattern tra dung phan tu tiep theo cua permutation, khong tra ca tap.
- So le theo thu tu tach TIEN/LUI va dung phase thuc te.
- Nhip block AABAA, AABBAA, AAABBAAA, AABBBAA... co minimum length theo
  chinh do dai nhip.
- Tap so tien/lui/deu dung logic vong tron va khong duoc tra 100 so.
- Cac bo, dau, dit, tong, hieu va combo co tap so rieng; khong dong nhat
  "ve lien tiep" voi "tien/lui/theo thu tu".

### 2.2 Chuan hoa active va potential

- Active: pattern da du minimum length va dang dien ra.
- Potential: chi pattern chua tung hinh thanh trong baseline, current prefix dung
  bang minimum length tru mot va ngay tiep theo co the hoan tat.
- Pattern da tung ton tai trong baseline khong con duoc gan nhan potential chi vi
  current prefix ngan.
- Minimum thong thuong 2 ngay, so le 3, so le theo cap 4; block dung minimum cua nhip.

### 2.3 Chuan hoa ky luc va tan suat

- Ky luc la do dai episode dai nhat thuc te, khong phai target hoac current length.
- Rui ro tai do dai L dung cohort:
  - S(L): so episode dat it nhat L;
  - break(L) = S(L) - S(L + step);
  - risk(L) = break(L) / S(L).
- Khong dem moi trang thai trung gian cua mot episode dai thanh mot lan xuat hien moi.
- Tan suat, gap va recency phai noi ve target du doan, khong thay bang current prefix.
- Tan suat toan lich su va Moc 20 nam duoc tinh rieng, khong tron baseline.

## 3. Cac lop scoring da nghien cuu

### 3.1 Evidence cap chuoi

- Raw dropoff.
- Wilson lower bound de ha ty le ao do mau nho.
- Beta/Bayesian shrinkage ve xac suat nen theo do rong tap so.
- Sample reliability.
- Tan suat dat moc, tan suat tiep tuc, duration, gap, recurrence va recency.
- Tien do toi ky luc, dat ky luc, sieu ky luc.
- Formation probability cho pattern chua tung hinh thanh.
- Survival tail theo cohort >= L.

Ket luan: cac bien nay huu ich de mo ta do tin cay, nhung khong bien mot ty le
dropoff thanh xac suat da calibration tuyet doi.

### 3.2 Evidence cap so

- `numberAvgRisk`: trung binh risk cac chain chua so.
- `numberConsensusRisk`: so duoc nhieu chain dong thuan.
- `numberWeightedRisk`: cong trong so membership.
- `numberPosteriorDiversity`: posterior + da dang family.
- `numberLikelihoodRatio`: continuation upper bound so voi nen do rong tap.
- `activeOnlyAvgRisk`: chi dung active.
- Edge/dropoff dedup: moi tap/family chi dong gop bang chung dai dien.

Ket luan: phai dedup tap so va family. Cong thang so luong chain lam phong dai
confidence vi mot so co the thuoc hang tram evidence tuong quan.

### 3.3 Nhom va coverage

- Chan/le, lon/nho, dau/dit, tong/hieu, nguyen to/hop so, bo va cac nhom con.
- Tan suat nhom theo ngay/nam.
- Coverage 00-99, gap va hazard cua so rieng le.
- Conservative group veto: nhom chi duoc phep veto/swap 1:1, khong cong truc tiep
  vao ranking 100 so.

Ket luan: khong co bin nhom nao dat Wilson lower mot phia 90% du manh de veto trong
kiem dinh da nam. Bien the noi long cai thien tuong doi nho nhung tat ca giai doan
van profit am, nen khong dua vao production.

## 4. Danh gia cac phuong phap hien co

### 4.1 Chuoi nho truoc

Uu diem:

- Tier truoc, tap so nho truoc nen bang chung cu the hon.
- La baseline de hieu, de lap lai va it nhay hon cac score phuc tap.

Cai tien da thu:

- active tren potential;
- posterior co ve nen;
- Wilson/sample reliability;
- giam block khong co valid daily transition;
- giam censored record;
- frequency chi la bonus nho.

Ket qua:

- 2026 cai thien tu 68 len 70 hit, profit +150.000K;
- 2025 giam tu 99 xuong 97 hit, profit -2.682.000K.

Quyet dinh: cai tien dao chieu theo regime, chua thay baseline.

### 4.2 Nhip block truoc

Uu diem:

- Co tin hieu cau truc va co lift so voi chon ngau nhien cung kich thuoc dan.
- Phu hop lam nhanh doc lap de bo sung cho Chuoi nho.

Rui ro:

- Block phu rat rong va sinh nhieu evidence tuong quan.
- Dem so chain block hoac uu tien record cung se lam confidence ao.

Audit holdout 2026:

- danh 40 so: hit 44,34%, nen 40%, nhung hoa von 47,62%;
- danh 45 so: hit 50,25%, nen 45%, nhung hoa von 53,57%;
- danh 50 so: hit 52,71%, nen 50%, nhung hoa von 59,52%.

Quyet dinh: co lift du bao, chua co edge kinh te.

### 4.3 Ket hop Block + Chuoi nho

Da thu:

- hop, giao, phan khong giao;
- danh song song va x2 so giao;
- reciprocal-rank fusion;
- swap co kiem soat quanh dan Chuoi nho;
- block guard va credible long block.

Ket qua lap lai duoc:

- hybrid swap khong them hit tren holdout;
- fusion 25 so giam von nhung mat nhieu ngay trung;
- danh song song hai danh muc tuong quan lam hit-rate tang, nhung ROI khong tang
  tuong ung;
- report Song Song cu 63,88% khong co daily rows/hash nen khong duoc dung;
- strict replay sau do cho thay full-history replay 67,86% bi giam con 43,98% va
  profit -394.000K.

Quyet dinh: chi giu nhu portfolio/snapshot dang theo doi; khong dung aggregate cu
de ket luan loi the.

### 4.4 Edge75 va dropoff dedup

Cai tien dung:

- khong dem trung tap so;
- moi family chi dong gop bang chung manh nhat;
- bao ve snapshot rolling D-1;
- tach ro Edge, dropoff va avg-risk.

Ket qua nghien cuu rolling 2026:

- Edge dedup Hold70: 66/189, 34,92%, profit -126.000K;
- Dropoff dedup Hold70: cung 66/189, profit -126.000K;
- song song Edge + Dropoff tang hit len 43,39% nhung ROI van -2,22%.

Quyet dinh: co gia tri van hanh va giai thich, chua chung minh profit dai han.

### 4.5 Survival >= L, ky luc va potential

Cai tien dung:

- dung S(L) va S(L+step), khong dung exact length;
- tach record, super-record va first formation;
- co sample shrinkage va background probability.

Ket qua:

- survival ranker khong vuot Chuoi nho va khong vuot hoa von;
- 67,45% ngay baseline sai co evidence "active tai ky luc tiep tuc";
- 18,16% co evidence "sieu ky luc tiep tuc";
- 14,39% co evidence "potential hinh thanh".

Day khong phai quan he nhan qua vi so thuc te thuoc trung binh 132,3 evidence va
6,3 family. Quy tac cung "dat ky luc thi loai dau" khong duoc du lieu ho tro.

### 4.6 Coverage, gap va hazard

De:

- 100 so duoc bao phu trung binh 549,77 ngay quay;
- feature hazard dao chieu giua cac regime;
- ghep vao Chuoi nho tang 2026 hai hit nhung giam test 2024-2025 mot hit va tang
  chuoi thua.

Lo:

- 100 so duoc bao phu trung binh 19,87 ngay;
- Top7 coverage/hazard co tin hieu doc lap, nhung loi the so voi baseline dao
  chieu trong 2026.

Quyet dinh: chi dung lam feature phu, khong dung quy tac "lau chua ve thi sap ve".

### 4.7 Bayes, bootstrap va membership learning

Da thu:

- hierarchical Bayes;
- posterior bootstrap;
- softmax membership co L2;
- rolling/expanding windows;
- scorecard theo chain state;
- calibration theo do dai va frequency.

Ket qua:

- mo hinh co the tang validation/test mot so nam;
- quan he dao chieu trong 2025-2026;
- expanding membership tang 13 hit validation va 4 hit test, nhung mat 7 hit
  holdout 2026;
- rolling variant van mat 2 hit holdout.

Quyet dinh: regime shift lon hon loi ich cua mo hinh; research-only.

### 4.8 Lo 27 vi tri

Cai tien nen giu:

- moi vi tri co timeline, stats va candidate rieng;
- khong ap chain Giai DB cho 26 vi tri con lai;
- RRF dung overlap nhu ranking evidence, khong danh x2;
- hitCount la tong lan xuat hien trong 27 vi tri;
- latest prediction va live log la snapshot bat bien.

Feature coverage/hazard va cac bien the Top6/7 co tin hieu, nhung chua co so sanh
strict dai han tren cung daily rows du manh de thay RRF production.

## 5. Nhung cai tien da duoc chung minh la nen giu

1. Strict PIT va annual locked baseline.
2. Snapshot bat bien truoc/sau khi co ket qua.
3. Candidate numbers dung phase cua pattern.
4. Potential chi cho never-formed tai minimum length tru mot.
5. Cohort survival >= L va khong dem lap episode dai.
6. Dedup exact set/family truoc khi tong hop evidence.
7. Wilson/Beta shrinkage cho mau nho.
8. So sanh voi xac suat nen theo do rong tap so.
9. Giữ dung so luong so va don vi cuoc khi so sanh.
10. Train/validation/test theo thoi gian; khong shuffle.
11. Bao cao theo nam va worst-year, khong chi tong profit.
12. R2 la nguon production; local chi debug/fallback.

## 6. Nhung huong khong nen dung lam quy tac cung

- Dropoff 100% voi mau rat nho.
- Dat ky luc/sieu ky luc thi luon loai.
- Chua tung hinh thanh thi luon loai.
- Cong so luong chain hoac membership khong dedup.
- Dung tần suất/gap cua so rieng le nhu loi the doc lap.
- Gop nhieu dan tuong quan de tang hit-rate ma khong tinh lai von.
- Toi uu tham so va bao cao tren cung mot giai doan.
- Monte Carlo tu ket qua ngau nhien de khang dinh edge thuc.
- Fast-history/full-history replay de gan nhan strict PIT.
- Ep mot phuong phap phai duong moi nam; neu du lieu khong ho tro thi ket luan
  dung la khong co edge du manh.

## 7. Huong cai tien hop ly cho cac bien phap san co

Pipeline de xuat:

1. Tao candidate hop le theo pattern phase.
2. Loai tap rong, tap 100 so va candidate potential sai minimum.
3. Gom candidate theo exact set + family + state de khử trung.
4. Tinh posterior transition theo cohort >= L, background set probability,
   Wilson lower va sample reliability.
5. Chain Small/Block chi quyet dinh thu tu trong cung Tier; khong thay posterior.
6. Moi so nhan toi da mot evidence manh nhat moi family, sau do cong giam dan
   giua cac family doc lap.
7. Group/coverage chi la veto hoac swap 1:1 neu Wilson lower tren train cu
   vuot nguong da chot; neu khong co bin du tieu chuan thi khong can thiep.
8. Khong chen so yeu de du target neu strategy cho phep abstain; neu bat buoc
   danh fixed-count thi phai ghi ro day la filler.
9. Chay walk-forward, bao cao tung nam, worst-year va paired delta voi baseline.
10. Chi promote khi dương/cai thien tren it nhat hai holdout doc lap va khong
    tang longest loss streak qua nguong cho phep.

## 8. Ket luan hien tai

- He thong da duoc cai thien ro ve tinh dung logic, kha nang tai lap, chong leak
  va giai thich evidence.
- Nhieu ranker co lift so voi ngau nhien cung kich thuoc dan, nhung lift chua du
  vuot chi phi cuoc.
- Khong co bien the fixed 30 so/ngay nao da duoc kiem chung la profit duong ben
  vung qua nhieu nam strict PIT.
- Conservative group veto, survival ranker, block/small hybrid, coverage/hazard
  va membership learning deu chua dat gate production.
- Viec dung nhat la giu cac snapshot production hien tai, khong sua nguoc du doan
  cu, va shadow-test candidate moi tren du lieu tuong lai chua tung dung de chon
  tham so.

