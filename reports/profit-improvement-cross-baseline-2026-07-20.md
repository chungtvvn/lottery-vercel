# Nghien cuu cai tien profit: ket hop Moc 20 nam va D-1

Ngay nghien cuu: 2026-07-20  
Ty le an dung trong kiem dinh: 1 an 84  
Don vi cuoc: 1.000K moi don vi

## Nguyen tac kiem dinh

- Moi ngay duoc tai tao tu raw data ket thuc tai D-1.
- Moc nam dung baseline ket thuc ngay 31/12 cua nam truoc.
- Moc D-1 dung toan bo du lieu co san den ngay truoc ngay du doan.
- Khong dung ket qua ngay du doan de tao chuoi, xep hang hoac chon nguong.
- Cac ket qua 2024 va 2025 la mau cach ngay de kiem dinh nhanh; 2026 la 196 ngay day du den 19/07/2026.

## Ket qua phuong phap co dinh

| Phuong an | 2024 sample | 2025 sample | 2026 day du |
|---|---:|---:|---:|
| Moc 20 nam native | +82.000K | -794.000K | -560.000K |
| D-1 native | -506.000K | -1.130.000K | -1.400.000K |
| Hop hai moc, cuoc deu | -397.000K | -675.000K | -893.000K |
| Hop hai moc, giao x2 | -243.000K | -742.000K | -1.274.000K |
| Giao hai moc, cuoc deu | +154.000K | -67.000K | -381.000K |
| Chi danh phan khong giao | -551.000K | -608.000K | -512.000K |

Ket luan: viec gop dan lam tang ty le ngay trung, nhung von tang nhanh hon payout. Khong phuong an co dinh nao co profit on dinh qua ba regime.

## Cac tin hieu da bi bac bo

### Giao hai moc >= 19 so

- 2026: 38 ngay choi, 11 ngay trung, +145.000K, ROI +18,61%.
- 2025 holdout: 11 ngay choi, 2 ngay trung, -76.000K, ROI -31,15%.

Tin hieu 2026 la overfit, khong duoc dua vao production.

### Hop x2 >= 61 so

- 2025 sample: -5.000K, gan hoa von.
- 2026 day du: +101.000K, ROI +1,91%.
- 2024 holdout khoa truoc nguong: -82.000K, ROI -9,79%.

Tin hieu khong qua duoc holdout thu hai, khong duoc dua vao production.

## Profit gate theo xac suat hieu chinh

Thu nghiem chi choi khi can duoi Wilson cua ty le trung trong nhom kich thuoc dan vuot diem hoa von `so don vi / 84`:

- Train: mau PIT 2024 + 2025.
- Test: 196 ngay PIT nam 2026.
- Nhom kich thuoc: moi 10 so.
- Wilson mot phia: z = 1,28.
- Ket qua: 19 ngay choi, 3 ngay trung, +46.000K, ROI +22,33%.
- Nua dau ky: -2.000K; nua sau ky: +48.000K.

Day chi la ung vien nghien cuu. Ba lan trung tren 19 ngay chua du de ket luan co edge on dinh; khong nen dung lam mac dinh production.

## Huong cai tien de co kha nang co lai

1. Khong ep danh moi ngay. Moi dan phai vuot diem hoa von cua chinh no, khong chi dua vao hit-rate.
2. Hieu chinh xac suat theo `phuong phap + bucket kich thuoc dan`, chi dung cac ngay qua khu PIT.
3. Dung can duoi tin cay thay vi trung binh mau de tranh mau it tao score ao.
4. Khoa quy tac truoc khi test nam tiep theo; khong doi nguong sau khi xem ket qua holdout.
5. Chi cho phep production dat cuoc khi co it nhat hai regime holdout duong va so lan trung du lon.
6. Khi khong co tin hieu vuot hoa von, tra ve `bo ngay` thay vi chen them so cho du 30/40 so.

## Trang thai

Chua co phuong phap moi nao du tieu chuan de thay production. Phuong an an toan ve mat thong ke hien tai la giu he thong production khong doi va tiep tuc thu thap snapshot bat bien, sau do kiem dinh profit gate tren cac nam day du.

## Ket qua trien khai Wilson profit gate

Cau hinh duoc khoa truoc khi chay walk-forward:

- Bien the duoc phep: hop hai moc cuoc deu, giao hai moc cuoc deu, phan khong giao cuoc deu.
- Bucket kich thuoc dan: 10 so.
- Toi thieu: 8 mau PIT trong bucket.
- Wilson mot phia: z = 1,28.
- Diem hoa von moi ngay: `so don vi / 84`.
- Chon bien the co margin lon nhat neu Wilson lower vuot diem hoa von; nguoc lai bo ngay.

| Holdout | Du lieu train | Ngay co san | Ngay choi | Trung | So/ngay | Profit | ROI | Thua dai nhat |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 2023 sample | 2022 sample | 37 | 3 | 1 | 17,00 | +33.000K | +64,71% | 2 |
| 2024 sample | 2022-2023 sample | 37 | 0 | 0 | 0 | 0K | 0% | 0 |
| 2025 sample | 2022-2024 sample | 73 | 15 | 4 | 11,00 | +171.000K | +103,64% | 7 |
| 2026 day du | 2022-2025 sample | 196 | 24 | 4 | 14,96 | -23.000K | -6,41% | 15 |

Gate co hai holdout duong, nhung chua duoc phep promotion vi:

1. Holdout moi nhat va day du nhat (2026) van am.
2. 2022-2025 chi la mau cach ngay, khong phai moi ngay trong nam.
3. Tong so lan trung con it, nen Wilson va profit nhay manh theo vai ket qua.
4. Viec bo nhanh `phan khong giao` sau khi xem 2026 se la tuning tren holdout va khong hop le.

Ket luan trien khai thu: co che bo ngay hoat dong dung va giam manh von, nhung phuong phap chua chung minh duoc profit on dinh. Can chay cac nam train/holdout day du hoac them mot nam hoan toan chua dung truoc khi dua vao production.
