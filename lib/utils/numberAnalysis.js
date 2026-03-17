/**
 * file này định nghĩa tất cả các bộ số cần thiết cho việc phân tích thống kê.
 * Nó là "bộ não" cung cấp dữ liệu nền cho các file generator.
 * * ĐÃ CẤU TRÚC LẠI:
 * 1. Định nghĩa các hàm helper (getTongMoi, getTongTT, getHieu).
 * 2. Định nghĩa TẤT CẢ các mảng (bộ số) riêng lẻ.
 * 3. Tập hợp TẤT CẢ các bộ số vào một đối tượng `SETS` duy nhất.
 * 4. Tạo `MAPS` và `INDEX_MAPS` từ `SETS` (chỉ một lần).
 * 5. Định nghĩa các hàm tiện ích (findNextInSet, findPreviousInSet).
 * 6. Exports.
 */

// --- CÁC HÀM HELPER ---

const ALL_NUMBERS = Array.from({ length: 100 }, (_, i) => i.toString().padStart(2, '0'));

// Tính Tổng Mới (tổng 2 chữ số, kết quả từ 0-18)
const getTongMoi = (n) => {
    const num = parseInt(n, 10);
    return Math.floor(num / 10) + (num % 10);
};

// Tính Tổng Truyền Thống (lấy hàng đơn vị của tổng, 00=10, kết quả từ 1-10)
const getTongTT = (n) => {
    if (n === '00') return 10;
    const tongMoi = getTongMoi(n);
    const tongTT = tongMoi % 10;
    return tongTT === 0 ? 10 : tongTT;
};

// Tính Hiệu (giá trị dương)
const getHieu = (n) => {
    const num = parseInt(n, 10);
    return Math.abs(Math.floor(num / 10) - (num % 10));
};


// --- BƯỚC 1: ĐỊNH NGHĨA TẤT CẢ CÁC BỘ SỐ (ARRAYS) ---

// --- BỘ SỐ CHO ĐẦU VÀ ĐÍT (0-9) ---
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const CHAN_DIGITS = ['0', '2', '4', '6', '8'];
const LE_DIGITS = ['1', '3', '5', '7', '9'];
const NHO_DIGITS = ['0', '1', '2', '3', '4'];
const TO_DIGITS = ['5', '6', '7', '8', '9'];
const CHAN_LON_HON_4_DIGITS = ['6', '8'];
const CHAN_NHO_HON_4_DIGITS = ['0', '2'];
const LE_LON_HON_5_DIGITS = ['7', '9'];
const LE_NHO_HON_5_DIGITS = ['1', '3'];

// --- PHÂN LOẠI CƠ BẢN (ĐẦU/ĐÍT) ---
const DAU_CHAN = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 === 0);
const DAU_LE = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 !== 0);
const DIT_CHAN = ALL_NUMBERS.filter(n => parseInt(n[1]) % 2 === 0);
const DIT_LE = ALL_NUMBERS.filter(n => parseInt(n[1]) % 2 !== 0);

const DAU_TO = ALL_NUMBERS.filter(n => parseInt(n[0]) >= 5);
const DAU_NHO = ALL_NUMBERS.filter(n => parseInt(n[0]) < 5);
const DIT_TO = ALL_NUMBERS.filter(n => parseInt(n[1]) >= 5);
const DIT_NHO = ALL_NUMBERS.filter(n => parseInt(n[1]) < 5);

// --- Phân loại Đầu/Đít 0-9 (Dùng vòng lặp) ---
const ALL_DAU = {};
const ALL_DIT = {};
const ALL_DIGITS = {}; // For individual digit sets

for (let i = 0; i < 10; i++) {
    const digit = String(i);
    ALL_DAU[`DAU_${digit}`] = ALL_NUMBERS.filter(n => n.startsWith(digit));
    ALL_DIT[`DIT_${digit}`] = ALL_NUMBERS.filter(n => n.endsWith(digit));
    ALL_DIGITS[`DIGIT_${digit}`] = [digit];
}

// --- Phân loại Đầu Đít Đồng Tiến (10 bộ, 10 số, cách nhau 11) ---
const ALL_DAU_DIT_TIEN = {};
for (let i = 0; i < 10; i++) {
    const setKey = `DAU_DIT_TIEN_${i}`;
    ALL_DAU_DIT_TIEN[setKey] = [];
    let current = i; // Start with integer i

    // Generate sequence: start, start+11, start+22... until > 99
    for (let j = 0; j < 10; j++) {
        let numVal = current + (j * 11);
        if (numVal > 99) break; // Stop if > 99

        ALL_DAU_DIT_TIEN[setKey].push(numVal.toString().padStart(2, '0'));
    }
    // No need to sort as we generate in increasing order
}

// --- PHÂN LOẠI THEO DẠNG SỐ (CHẴN/LẺ KẾT HỢP) ---
const CHAN_CHAN = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 === 0 && parseInt(n[1]) % 2 === 0);
const CHAN_LE = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 === 0 && parseInt(n[1]) % 2 !== 0);
const LE_CHAN = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 !== 0 && parseInt(n[1]) % 2 === 0);
const LE_LE = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 !== 0 && parseInt(n[1]) % 2 !== 0);

// --- PHÂN LOẠI KẾT HỢP ĐẦU - ĐÍT (TO/NHỎ) ---
const DAU_TO_DIT_TO = ALL_NUMBERS.filter(n => parseInt(n[0]) >= 5 && parseInt(n[1]) >= 5);
const DAU_TO_DIT_NHO = ALL_NUMBERS.filter(n => parseInt(n[0]) >= 5 && parseInt(n[1]) < 5);
const DAU_NHO_DIT_TO = ALL_NUMBERS.filter(n => parseInt(n[0]) < 5 && parseInt(n[1]) >= 5);
const DAU_NHO_DIT_NHO = ALL_NUMBERS.filter(n => parseInt(n[0]) < 5 && parseInt(n[1]) < 5);

// --- PHÂN LOẠI ĐẦU/ĐÍT CHẴN/LẺ KÈM ĐIỀU KIỆN LỚN/NHỎ ---
const DAU_CHAN_LON_HON_4 = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 === 0 && parseInt(n[0]) > 4);
const DAU_CHAN_NHO_HON_4 = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 === 0 && parseInt(n[0]) < 4);
const DIT_CHAN_LON_HON_4 = ALL_NUMBERS.filter(n => parseInt(n[1]) % 2 === 0 && parseInt(n[1]) > 4);
const DIT_CHAN_NHO_HON_4 = ALL_NUMBERS.filter(n => parseInt(n[1]) % 2 === 0 && parseInt(n[1]) < 4);

const DAU_LE_LON_HON_5 = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 !== 0 && parseInt(n[0]) > 5);
const DAU_LE_NHO_HON_5 = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 !== 0 && parseInt(n[0]) < 5);
const DIT_LE_LON_HON_5 = ALL_NUMBERS.filter(n => parseInt(n[1]) % 2 !== 0 && parseInt(n[1]) > 5);
const DIT_LE_NHO_HON_5 = ALL_NUMBERS.filter(n => parseInt(n[1]) % 2 !== 0 && parseInt(n[1]) < 5);

// --- PHÂN LOẠI KẾT HỢP PHỨC TẠP ---
const DAU_CHAN_LON_4_DIT_CHAN_LON_4 = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 === 0 && parseInt(n[0]) > 4 && parseInt(n[1]) % 2 === 0 && parseInt(n[1]) > 4);
const DAU_CHAN_LON_4_DIT_CHAN_NHO_4 = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 === 0 && parseInt(n[0]) > 4 && parseInt(n[1]) % 2 === 0 && parseInt(n[1]) < 4);
const DAU_CHAN_NHO_4_DIT_CHAN_LON_4 = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 === 0 && parseInt(n[0]) < 4 && parseInt(n[1]) % 2 === 0 && parseInt(n[1]) > 4);
const DAU_CHAN_NHO_4_DIT_CHAN_NHO_4 = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 === 0 && parseInt(n[0]) < 4 && parseInt(n[1]) % 2 === 0 && parseInt(n[1]) < 4);
const DAU_CHAN_LON_4_DIT_LE_LON_5 = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 === 0 && parseInt(n[0]) > 4 && parseInt(n[1]) % 2 !== 0 && parseInt(n[1]) > 5);
const DAU_CHAN_LON_4_DIT_LE_NHO_5 = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 === 0 && parseInt(n[0]) > 4 && parseInt(n[1]) % 2 !== 0 && parseInt(n[1]) < 5);
const DAU_CHAN_NHO_4_DIT_LE_LON_5 = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 === 0 && parseInt(n[0]) < 4 && parseInt(n[1]) % 2 !== 0 && parseInt(n[1]) > 5);
const DAU_CHAN_NHO_4_DIT_LE_NHO_5 = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 === 0 && parseInt(n[0]) < 4 && parseInt(n[1]) % 2 !== 0 && parseInt(n[1]) < 5);
const DAU_LE_LON_5_DIT_CHAN_LON_4 = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 !== 0 && parseInt(n[0]) > 5 && parseInt(n[1]) % 2 === 0 && parseInt(n[1]) > 4);
const DAU_LE_LON_5_DIT_CHAN_NHO_4 = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 !== 0 && parseInt(n[0]) > 5 && parseInt(n[1]) % 2 === 0 && parseInt(n[1]) < 4);
const DAU_LE_NHO_5_DIT_CHAN_LON_4 = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 !== 0 && parseInt(n[0]) < 5 && parseInt(n[1]) % 2 === 0 && parseInt(n[1]) > 4);
const DAU_LE_NHO_5_DIT_CHAN_NHO_4 = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 !== 0 && parseInt(n[0]) < 5 && parseInt(n[1]) % 2 === 0 && parseInt(n[1]) < 4);
const DAU_LE_LON_5_DIT_LE_LON_5 = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 !== 0 && parseInt(n[0]) > 5 && parseInt(n[1]) % 2 !== 0 && parseInt(n[1]) > 5);
const DAU_LE_LON_5_DIT_LE_NHO_5 = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 !== 0 && parseInt(n[0]) > 5 && parseInt(n[1]) % 2 !== 0 && parseInt(n[1]) < 5);
const DAU_LE_NHO_5_DIT_LE_LON_5 = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 !== 0 && parseInt(n[0]) < 5 && parseInt(n[1]) % 2 !== 0 && parseInt(n[1]) > 5);
const DAU_LE_NHO_5_DIT_LE_NHO_5 = ALL_NUMBERS.filter(n => parseInt(n[0]) % 2 !== 0 && parseInt(n[0]) < 5 && parseInt(n[1]) % 2 !== 0 && parseInt(n[1]) < 5);

// --- Dạng Đầu/Đít cụ thể ---
const DAU_4_DIT_CHAN_LON_4 = ALL_NUMBERS.filter(n => n.startsWith('4') && parseInt(n[1]) % 2 === 0 && parseInt(n[1]) > 4);
const DAU_4_DIT_CHAN_NHO_4 = ALL_NUMBERS.filter(n => n.startsWith('4') && parseInt(n[1]) % 2 === 0 && parseInt(n[1]) < 4);
const DAU_4_DIT_LE_LON_5 = ALL_NUMBERS.filter(n => n.startsWith('4') && parseInt(n[1]) % 2 !== 0 && parseInt(n[1]) > 5);
const DAU_4_DIT_LE_NHO_5 = ALL_NUMBERS.filter(n => n.startsWith('4') && parseInt(n[1]) % 2 !== 0 && parseInt(n[1]) < 5);
const DAU_5_DIT_CHAN_LON_4 = ALL_NUMBERS.filter(n => n.startsWith('5') && parseInt(n[1]) % 2 === 0 && parseInt(n[1]) > 4);
const DAU_5_DIT_CHAN_NHO_4 = ALL_NUMBERS.filter(n => n.startsWith('5') && parseInt(n[1]) % 2 === 0 && parseInt(n[1]) < 4);
const DAU_5_DIT_LE_LON_5 = ALL_NUMBERS.filter(n => n.startsWith('5') && parseInt(n[1]) % 2 !== 0 && parseInt(n[1]) > 5);
const DAU_5_DIT_LE_NHO_5 = ALL_NUMBERS.filter(n => n.startsWith('5') && parseInt(n[1]) % 2 !== 0 && parseInt(n[1]) < 5);
const DIT_4_DAU_CHAN_LON_4 = ALL_NUMBERS.filter(n => n.endsWith('4') && parseInt(n[0]) % 2 === 0 && parseInt(n[0]) > 4);
const DIT_4_DAU_CHAN_NHO_4 = ALL_NUMBERS.filter(n => n.endsWith('4') && parseInt(n[0]) % 2 === 0 && parseInt(n[0]) < 4);
const DIT_4_DAU_LE_LON_5 = ALL_NUMBERS.filter(n => n.endsWith('4') && parseInt(n[0]) % 2 !== 0 && parseInt(n[0]) > 5);
const DIT_4_DAU_LE_NHO_5 = ALL_NUMBERS.filter(n => n.endsWith('4') && parseInt(n[0]) % 2 !== 0 && parseInt(n[0]) < 5);
const DIT_5_DAU_CHAN_LON_4 = ALL_NUMBERS.filter(n => n.endsWith('5') && parseInt(n[0]) % 2 === 0 && parseInt(n[0]) > 4);
const DIT_5_DAU_CHAN_NHO_4 = ALL_NUMBERS.filter(n => n.endsWith('5') && parseInt(n[0]) % 2 === 0 && parseInt(n[0]) < 4);
const DIT_5_DAU_LE_LON_5 = ALL_NUMBERS.filter(n => n.endsWith('5') && parseInt(n[0]) % 2 !== 0 && parseInt(n[0]) > 5);
const DIT_5_DAU_LE_NHO_5 = ALL_NUMBERS.filter(n => n.endsWith('5') && parseInt(n[0]) % 2 !== 0 && parseInt(n[0]) < 5);

// --- TỔNG TRUYỀN THỐNG (TT) ---
const TONG_TT_0 = ALL_NUMBERS.filter(n => getTongTT(n) === 0); // Only 00
const TONG_TT_1 = ALL_NUMBERS.filter(n => getTongTT(n) === 1);
const TONG_TT_2 = ALL_NUMBERS.filter(n => getTongTT(n) === 2);
const TONG_TT_3 = ALL_NUMBERS.filter(n => getTongTT(n) === 3);
const TONG_TT_4 = ALL_NUMBERS.filter(n => getTongTT(n) === 4);
const TONG_TT_5 = ALL_NUMBERS.filter(n => getTongTT(n) === 5);
const TONG_TT_6 = ALL_NUMBERS.filter(n => getTongTT(n) === 6);
const TONG_TT_7 = ALL_NUMBERS.filter(n => getTongTT(n) === 7);
const TONG_TT_8 = ALL_NUMBERS.filter(n => getTongTT(n) === 8);
const TONG_TT_9 = ALL_NUMBERS.filter(n => getTongTT(n) === 9);
const TONG_TT_10 = ALL_NUMBERS.filter(n => getTongTT(n) === 10);

const TONG_TT_1_3 = [...TONG_TT_1, ...TONG_TT_2, ...TONG_TT_3].sort();
const TONG_TT_2_4 = [...TONG_TT_2, ...TONG_TT_3, ...TONG_TT_4].sort();
const TONG_TT_3_5 = [...TONG_TT_3, ...TONG_TT_4, ...TONG_TT_5].sort();
const TONG_TT_4_6 = [...TONG_TT_4, ...TONG_TT_5, ...TONG_TT_6].sort();
const TONG_TT_5_7 = [...TONG_TT_5, ...TONG_TT_6, ...TONG_TT_7].sort();
const TONG_TT_6_8 = [...TONG_TT_6, ...TONG_TT_7, ...TONG_TT_8].sort();
const TONG_TT_7_9 = [...TONG_TT_7, ...TONG_TT_8, ...TONG_TT_9].sort();
const TONG_TT_8_10 = [...TONG_TT_8, ...TONG_TT_9, ...TONG_TT_10].sort();
const TONG_TT_9_1 = [...TONG_TT_9, ...TONG_TT_10, ...TONG_TT_1].sort();
const TONG_TT_10_2 = [...TONG_TT_10, ...TONG_TT_1, ...TONG_TT_2].sort();

const TONG_TT_CHAN = ALL_NUMBERS.filter(n => getTongTT(n) % 2 === 0 || getTongTT(n) === 10);
const TONG_TT_LE = ALL_NUMBERS.filter(n => getTongTT(n) % 2 !== 0);

// --- TỔNG MỚI (0-18) ---
const TONG_MOI_0 = ALL_NUMBERS.filter(n => getTongMoi(n) === 0);
const TONG_MOI_1 = ALL_NUMBERS.filter(n => getTongMoi(n) === 1);
const TONG_MOI_2 = ALL_NUMBERS.filter(n => getTongMoi(n) === 2);
const TONG_MOI_3 = ALL_NUMBERS.filter(n => getTongMoi(n) === 3);
const TONG_MOI_4 = ALL_NUMBERS.filter(n => getTongMoi(n) === 4);
const TONG_MOI_5 = ALL_NUMBERS.filter(n => getTongMoi(n) === 5);
const TONG_MOI_6 = ALL_NUMBERS.filter(n => getTongMoi(n) === 6);
const TONG_MOI_7 = ALL_NUMBERS.filter(n => getTongMoi(n) === 7);
const TONG_MOI_8 = ALL_NUMBERS.filter(n => getTongMoi(n) === 8);
const TONG_MOI_9 = ALL_NUMBERS.filter(n => getTongMoi(n) === 9);
const TONG_MOI_10 = ALL_NUMBERS.filter(n => getTongMoi(n) === 10);
const TONG_MOI_11 = ALL_NUMBERS.filter(n => getTongMoi(n) === 11);
const TONG_MOI_12 = ALL_NUMBERS.filter(n => getTongMoi(n) === 12);
const TONG_MOI_13 = ALL_NUMBERS.filter(n => getTongMoi(n) === 13);
const TONG_MOI_14 = ALL_NUMBERS.filter(n => getTongMoi(n) === 14);
const TONG_MOI_15 = ALL_NUMBERS.filter(n => getTongMoi(n) === 15);
const TONG_MOI_16 = ALL_NUMBERS.filter(n => getTongMoi(n) === 16);
const TONG_MOI_17 = ALL_NUMBERS.filter(n => getTongMoi(n) === 17);
const TONG_MOI_18 = ALL_NUMBERS.filter(n => getTongMoi(n) === 18);

const TONG_MOI_0_2 = [...TONG_MOI_0, ...TONG_MOI_1, ...TONG_MOI_2].sort();
const TONG_MOI_1_3 = [...TONG_MOI_1, ...TONG_MOI_2, ...TONG_MOI_3].sort();
const TONG_MOI_2_4 = [...TONG_MOI_2, ...TONG_MOI_3, ...TONG_MOI_4].sort();
const TONG_MOI_3_5 = [...TONG_MOI_3, ...TONG_MOI_4, ...TONG_MOI_5].sort();
const TONG_MOI_4_6 = [...TONG_MOI_4, ...TONG_MOI_5, ...TONG_MOI_6].sort();
const TONG_MOI_5_7 = [...TONG_MOI_5, ...TONG_MOI_6, ...TONG_MOI_7].sort();
const TONG_MOI_6_8 = [...TONG_MOI_6, ...TONG_MOI_7, ...TONG_MOI_8].sort();
const TONG_MOI_7_9 = [...TONG_MOI_7, ...TONG_MOI_8, ...TONG_MOI_9].sort();
const TONG_MOI_8_10 = [...TONG_MOI_8, ...TONG_MOI_9, ...TONG_MOI_10].sort();
const TONG_MOI_9_11 = [...TONG_MOI_9, ...TONG_MOI_10, ...TONG_MOI_11].sort();
const TONG_MOI_10_12 = [...TONG_MOI_10, ...TONG_MOI_11, ...TONG_MOI_12].sort();
const TONG_MOI_11_13 = [...TONG_MOI_11, ...TONG_MOI_12, ...TONG_MOI_13].sort();
const TONG_MOI_12_14 = [...TONG_MOI_12, ...TONG_MOI_13, ...TONG_MOI_14].sort();
const TONG_MOI_13_15 = [...TONG_MOI_13, ...TONG_MOI_14, ...TONG_MOI_15].sort();
const TONG_MOI_14_16 = [...TONG_MOI_14, ...TONG_MOI_15, ...TONG_MOI_16].sort();
const TONG_MOI_15_17 = [...TONG_MOI_15, ...TONG_MOI_16, ...TONG_MOI_17].sort();
const TONG_MOI_16_18 = [...TONG_MOI_16, ...TONG_MOI_17, ...TONG_MOI_18].sort();
const TONG_MOI_17_0 = [...TONG_MOI_17, ...TONG_MOI_18, ...TONG_MOI_0].sort();
const TONG_MOI_18_1 = [...TONG_MOI_18, ...TONG_MOI_0, ...TONG_MOI_1].sort();

const TONG_MOI_CHAN = ALL_NUMBERS.filter(n => getTongMoi(n) % 2 === 0);
const TONG_MOI_LE = ALL_NUMBERS.filter(n => getTongMoi(n) % 2 !== 0);

// --- HIỆU (0-9) ---
const HIEU_0 = ALL_NUMBERS.filter(n => getHieu(n) === 0);
const HIEU_1 = ALL_NUMBERS.filter(n => getHieu(n) === 1);
const HIEU_2 = ALL_NUMBERS.filter(n => getHieu(n) === 2);
const HIEU_3 = ALL_NUMBERS.filter(n => getHieu(n) === 3);
const HIEU_4 = ALL_NUMBERS.filter(n => getHieu(n) === 4);
const HIEU_5 = ALL_NUMBERS.filter(n => getHieu(n) === 5);
const HIEU_6 = ALL_NUMBERS.filter(n => getHieu(n) === 6);
const HIEU_7 = ALL_NUMBERS.filter(n => getHieu(n) === 7);
const HIEU_8 = ALL_NUMBERS.filter(n => getHieu(n) === 8);
const HIEU_9 = ALL_NUMBERS.filter(n => getHieu(n) === 9);

const HIEU_0_2 = [...HIEU_0, ...HIEU_1, ...HIEU_2].sort();
const HIEU_1_3 = [...HIEU_1, ...HIEU_2, ...HIEU_3].sort();
const HIEU_2_4 = [...HIEU_2, ...HIEU_3, ...HIEU_4].sort();
const HIEU_3_5 = [...HIEU_3, ...HIEU_4, ...HIEU_5].sort();
const HIEU_4_6 = [...HIEU_4, ...HIEU_5, ...HIEU_6].sort();
const HIEU_5_7 = [...HIEU_5, ...HIEU_6, ...HIEU_7].sort();
const HIEU_6_8 = [...HIEU_6, ...HIEU_7, ...HIEU_8].sort();
const HIEU_7_9 = [...HIEU_7, ...HIEU_8, ...HIEU_9].sort();
const HIEU_8_0 = [...HIEU_8, ...HIEU_9, ...HIEU_0].sort();
const HIEU_9_1 = [...HIEU_9, ...HIEU_0, ...HIEU_1].sort();

const HIEU_CHAN = ALL_NUMBERS.filter(n => getHieu(n) % 2 === 0);
const HIEU_LE = ALL_NUMBERS.filter(n => getHieu(n) % 2 !== 0);

// --- BỘ SỐ CHUỖI (SEQUENCE) ---
const TONG_TT_SEQUENCE = Array.from({ length: 10 }, (_, i) => String(i + 1));
const TONG_TT_CHAN_SEQUENCE = ['2', '4', '6', '8', '10'];
const TONG_TT_LE_SEQUENCE = ['1', '3', '5', '7', '9'];
const TONG_MOI_SEQUENCE = Array.from({ length: 19 }, (_, i) => String(i));
const TONG_MOI_CHAN_SEQUENCE = Array.from({ length: 10 }, (_, i) => String(i * 2));
const TONG_MOI_LE_SEQUENCE = Array.from({ length: 9 }, (_, i) => String(i * 2 + 1));
const HIEU_SEQUENCE = Array.from({ length: 10 }, (_, i) => String(i));
const HIEU_CHAN_SEQUENCE = ['0', '2', '4', '6', '8'];
const HIEU_LE_SEQUENCE = ['1', '3', '5', '7', '9'];

// --- BỘ SỐ DẠNG CHẴN/LẺ CỦA TỔNG ---
const TONG_MOI_CHAN_CHAN = [];
const TONG_MOI_CHAN_LE = [];
const TONG_MOI_LE_CHAN = [];
const TONG_MOI_LE_LE = [];
const TONG_TT_CHAN_CHAN = [];
const TONG_TT_CHAN_LE = [];
const TONG_TT_LE_CHAN = [];
const TONG_TT_LE_LE = [];

ALL_NUMBERS.forEach(n => {
    // Tổng Mới
    const tongMoi = getTongMoi(n);
    const tongMoiStr = String(tongMoi).padStart(2, '0');
    if (parseInt(tongMoiStr[0]) % 2 === 0 && parseInt(tongMoiStr[1]) % 2 === 0) TONG_MOI_CHAN_CHAN.push(n);
    else if (parseInt(tongMoiStr[0]) % 2 === 0 && parseInt(tongMoiStr[1]) % 2 !== 0) TONG_MOI_CHAN_LE.push(n);
    else if (parseInt(tongMoiStr[0]) % 2 !== 0 && parseInt(tongMoiStr[1]) % 2 === 0) TONG_MOI_LE_CHAN.push(n);
    else TONG_MOI_LE_LE.push(n);

    // Tổng TT
    const tongTT = getTongTT(n);
    const tongTTStr = String(tongTT).padStart(2, '0');
    if (parseInt(tongTTStr[0]) % 2 === 0 && parseInt(tongTTStr[1]) % 2 === 0) TONG_TT_CHAN_CHAN.push(n);
    else if (parseInt(tongTTStr[0]) % 2 === 0 && parseInt(tongTTStr[1]) % 2 !== 0) TONG_TT_CHAN_LE.push(n);
    else if (parseInt(tongTTStr[0]) % 2 !== 0 && parseInt(tongTTStr[1]) % 2 === 0) TONG_TT_LE_CHAN.push(n);
    else TONG_TT_LE_LE.push(n);
});


// --- BƯỚC 2: TẬP HỢP TẤT CẢ VÀO `SETS` ---

const SETS = {
    // Cơ bản
    ALL: ALL_NUMBERS,
    CHAN_CHAN, CHAN_LE, LE_CHAN, LE_LE,
    DAU_CHAN, DAU_LE, DIT_CHAN, DIT_LE,
    DAU_TO, DAU_NHO, DIT_TO, DIT_NHO,
    ...ALL_DAU, // DAU_0 ... DAU_9
    ...ALL_DIT, // DIT_0 ... DIT_9
    ...ALL_DAU_DIT_TIEN, // [MỚI] DAU_DIT_TIEN_0 ... DAU_DIT_TIEN_9
    DAU_TO_DIT_TO, DAU_TO_DIT_NHO, DAU_NHO_DIT_TO, DAU_NHO_DIT_NHO,

    // Phức tạp
    DAU_CHAN_LON_HON_4, DAU_CHAN_NHO_HON_4, DIT_CHAN_LON_HON_4, DIT_CHAN_NHO_HON_4,
    DAU_LE_LON_HON_5, DAU_LE_NHO_HON_5, DIT_LE_LON_HON_5, DIT_LE_NHO_HON_5,
    DAU_CHAN_LON_4_DIT_CHAN_LON_4, DAU_CHAN_LON_4_DIT_CHAN_NHO_4, DAU_CHAN_NHO_4_DIT_CHAN_LON_4, DAU_CHAN_NHO_4_DIT_CHAN_NHO_4,
    DAU_CHAN_LON_4_DIT_LE_LON_5, DAU_CHAN_LON_4_DIT_LE_NHO_5, DAU_CHAN_NHO_4_DIT_LE_LON_5, DAU_CHAN_NHO_4_DIT_LE_NHO_5,
    DAU_LE_LON_5_DIT_CHAN_LON_4, DAU_LE_LON_5_DIT_CHAN_NHO_4, DAU_LE_NHO_5_DIT_CHAN_LON_4, DAU_LE_NHO_5_DIT_CHAN_NHO_4,
    DAU_LE_LON_5_DIT_LE_LON_5, DAU_LE_LON_5_DIT_LE_NHO_5, DAU_LE_NHO_5_DIT_LE_LON_5, DAU_LE_NHO_5_DIT_LE_NHO_5,
    DAU_4_DIT_CHAN_LON_4, DAU_4_DIT_CHAN_NHO_4, DAU_4_DIT_LE_LON_5, DAU_4_DIT_LE_NHO_5,
    DAU_5_DIT_CHAN_LON_4, DAU_5_DIT_CHAN_NHO_4, DAU_5_DIT_LE_LON_5, DAU_5_DIT_LE_NHO_5,
    DIT_4_DAU_CHAN_LON_4, DIT_4_DAU_CHAN_NHO_4, DIT_4_DAU_LE_LON_5, DIT_4_DAU_LE_NHO_5,
    DIT_5_DAU_CHAN_LON_4, DIT_5_DAU_CHAN_NHO_4, DIT_5_DAU_LE_LON_5, DIT_5_DAU_LE_NHO_5,

    // Bộ số Chữ số (Digits)
    DIGITS, CHAN_DIGITS, LE_DIGITS, NHO_DIGITS, TO_DIGITS,
    ...ALL_DIGITS, // DIGIT_0 ... DIGIT_9
    CHAN_LON_HON_4_DIGITS, CHAN_NHO_HON_4_DIGITS, LE_LON_HON_5_DIGITS, LE_NHO_HON_5_DIGITS,

    // Bộ số Tổng TT
    TONG_TT_0, TONG_TT_1, TONG_TT_2, TONG_TT_3, TONG_TT_4, TONG_TT_5, TONG_TT_6, TONG_TT_7, TONG_TT_8, TONG_TT_9, TONG_TT_10,
    TONG_TT_1_3, TONG_TT_2_4, TONG_TT_3_5, TONG_TT_4_6, TONG_TT_5_7, TONG_TT_6_8, TONG_TT_7_9, TONG_TT_8_10, TONG_TT_9_1, TONG_TT_10_2,
    TONG_TT_CHAN, TONG_TT_LE,
    TONG_TT_CHAN_CHAN, TONG_TT_CHAN_LE, TONG_TT_LE_CHAN, TONG_TT_LE_LE,

    // Bộ số Tổng Mới
    TONG_MOI_0, TONG_MOI_1, TONG_MOI_2, TONG_MOI_3, TONG_MOI_4, TONG_MOI_5, TONG_MOI_6, TONG_MOI_7, TONG_MOI_8, TONG_MOI_9,
    TONG_MOI_10, TONG_MOI_11, TONG_MOI_12, TONG_MOI_13, TONG_MOI_14, TONG_MOI_15, TONG_MOI_16, TONG_MOI_17, TONG_MOI_18,
    TONG_MOI_0_2, TONG_MOI_1_3, TONG_MOI_2_4, TONG_MOI_3_5, TONG_MOI_4_6, TONG_MOI_5_7, TONG_MOI_6_8, TONG_MOI_7_9, TONG_MOI_8_10, TONG_MOI_9_11, TONG_MOI_10_12, TONG_MOI_11_13, TONG_MOI_12_14, TONG_MOI_13_15, TONG_MOI_14_16, TONG_MOI_15_17, TONG_MOI_16_18, TONG_MOI_17_0, TONG_MOI_18_1,
    TONG_MOI_CHAN, TONG_MOI_LE,
    TONG_MOI_CHAN_CHAN, TONG_MOI_CHAN_LE, TONG_MOI_LE_CHAN, TONG_MOI_LE_LE,

    // Bộ số Hiệu
    HIEU_0, HIEU_1, HIEU_2, HIEU_3, HIEU_4, HIEU_5, HIEU_6, HIEU_7, HIEU_8, HIEU_9,
    HIEU_0_2, HIEU_1_3, HIEU_2_4, HIEU_3_5, HIEU_4_6, HIEU_5_7, HIEU_6_8, HIEU_7_9, HIEU_8_0, HIEU_9_1,
    HIEU_CHAN, HIEU_LE,

    // Bộ số Chuỗi (Sequence)
    TONG_TT_SEQUENCE, TONG_TT_CHAN_SEQUENCE, TONG_TT_LE_SEQUENCE,
    TONG_MOI_SEQUENCE, TONG_MOI_CHAN_SEQUENCE, TONG_MOI_LE_SEQUENCE,
    HIEU_SEQUENCE, HIEU_CHAN_SEQUENCE, HIEU_LE_SEQUENCE
};


// --- BƯỚC 3: TẠO MAPS TỪ SETS ---

const MAPS = {};
const INDEX_MAPS = {};

// Tạo MAPS và INDEX_MAPS cho tất cả các bộ số
for (const key in SETS) {
    if (Array.isArray(SETS[key])) {
        MAPS[key] = new Map(SETS[key].map(item => [item, true]));
        INDEX_MAPS[key] = new Map(SETS[key].map((item, index) => [item, index]));
    }
}

// Tạo DIGIT_SETS và DIGIT_MAPS (để tương thích với code cũ)
const DIGIT_SETS = {
    DIGITS, CHAN_DIGITS, LE_DIGITS, NHO_DIGITS, TO_DIGITS,
    ...ALL_DIGITS, // [MỚI] Thêm DIGIT_0 ... DIGIT_9
    CHAN_LON_HON_4_DIGITS, CHAN_NHO_HON_4_DIGITS, LE_LON_HON_5_DIGITS, LE_NHO_HON_5_DIGITS
};

const DIGIT_MAPS = {};
for (const key in DIGIT_SETS) {
    DIGIT_MAPS[key] = new Map(DIGIT_SETS[key].map((num, index) => [num, index]));
}


// --- BƯỚC 4: CÁC HÀM TIỆN ÍCH (SỬ DỤNG MAPS) ---

/**
 * Tìm số tiếp theo trong một bộ số (set) theo dạng vòng tròn khép kín.
 */
function findNextInSet(currentNumber, numberSet, numberMap) {
    const currentIndex = numberMap.get(currentNumber);
    if (currentIndex === undefined) {
        return null; // Không tìm thấy số hiện tại trong set
    }
    const nextIndex = (currentIndex + 1) % numberSet.length;
    return numberSet[nextIndex];
}

/**
 * Tìm số trước đó trong một bộ số (set) theo dạng vòng tròn khép kín.
 */
function findPreviousInSet(currentNumber, numberSet, numberMap) {
    const currentIndex = numberMap.get(currentNumber);
    if (currentIndex === undefined) {
        return null; // Không tìm thấy số hiện tại trong set
    }
    const prevIndex = (currentIndex - 1 + numberSet.length) % numberSet.length;
    return numberSet[prevIndex];
}


// --- BƯỚC 5: EXPORTS ---

// Helper to identify categories for a number
function identifyCategories(numberStr) {
    const categories = [];

    for (const [setKey, numbers] of Object.entries(SETS)) {
        if (!numbers.includes(numberStr)) continue;

        let statsKey = null;
        const lowerKey = setKey.toLowerCase();

        if (setKey.startsWith('DAU_') && setKey.length === 5) statsKey = lowerKey;
        else if (setKey.startsWith('DIT_') && setKey.length === 5) statsKey = lowerKey;
        else if (setKey.startsWith('TONG_TT_')) statsKey = lowerKey;
        else if (setKey.startsWith('TONG_MOI_')) statsKey = lowerKey;
        else if (setKey.startsWith('HIEU_')) statsKey = lowerKey;
        else if (['CHAN_CHAN', 'CHAN_LE', 'LE_CHAN', 'LE_LE'].includes(setKey)) {
            // CHAN_CHAN -> chanChan
            const parts = lowerKey.split('_');
            statsKey = parts[0] + parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
        } else if (!setKey.includes('DIGIT') && !setKey.includes('ALL')) {
            // Composite patterns (excluding DIGITS and ALL collections)
            statsKey = lowerKey;
        }

        if (statsKey) categories.push(statsKey);
    }

    return categories;
}

// Helper to extract value for comparison (for Progressive patterns)
function extractValueForComparison(numberStr, category) {
    const n = parseInt(numberStr, 10);
    if (category.startsWith('dau')) return Math.floor(n / 10);
    if (category.startsWith('dit')) return n % 10;
    if (category.startsWith('tong_tt')) return getTongTT(numberStr);
    if (category.startsWith('tong_moi')) return getTongMoi(numberStr);
    if (category.startsWith('hieu')) return getHieu(numberStr);
    return null;
}

module.exports = {
    SETS,
    MAPS,
    INDEX_MAPS,
    DIGIT_SETS,
    DIGIT_MAPS,
    findNextInSet,
    findPreviousInSet,
    getTongMoi,
    getTongTT,
    getHieu,
    identifyCategories,
    extractValueForComparison
};