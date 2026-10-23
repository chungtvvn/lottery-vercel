'use strict';

/**
 * Top 8 Parity-Balanced Xiên 4 Service
 *
 * Thuật toán phân tách Top 8 của Đề Xuất Tinh Hoa Đa Phương Pháp thành 2 Dàn Xiên 4:
 * - Dàn 1: 4 số đầu đảm bảo có cả đầu chẵn và đầu lẻ.
 *   + Nếu 3 số đầu là chẵn mà số thứ 4 vẫn chẵn: lấy lần lượt số thứ 5,6,7,8 là lẻ ghép vào dàn 1.
 *   + Ngược lại nếu 3 số đầu là lẻ mà số thứ 4 vẫn lẻ: tìm số chẵn tiếp theo trong 5,6,7,8 ghép vào dàn 1.
 * - Dàn 2: 4 số còn lại.
 * - Cơ chế thanh toán: Quây 11 vé mỗi dàn (Vốn 11M/dàn, tổng 22M/ngày).
 *   + Nổ 4/4 con: ăn 384.000K (lãi +373.000K)
 *   + Nổ 3/4 con: ăn 84.000K (lãi +73.000K)
 *   + Nổ 2/4 con: ăn 12.000K (lãi +1.000K)
 *   + Nổ 0 hoặc 1 con: 0K (lỗ -11.000K)
 */

const STAKE_PER_DAN_K = 11000;
const TOTAL_DAILY_STAKE_K = 22000;

const PAYOUT_MAP = {
    4: 384000,
    3: 84000,
    2: 12000,
    1: 0,
    0: 0
};

function isHeadEven(numStr) {
    const s = String(numStr ?? '').padStart(2, '0');
    const head = parseInt(s[0], 10);
    return !Number.isNaN(head) && head % 2 === 0;
}

function isHeadOdd(numStr) {
    return !isHeadEven(numStr);
}

function pairTop8WithParity(top8 = []) {
    const n = (top8 || []).slice(0, 8).map(x => String(x).padStart(2, '0'));
    if (n.length < 8) {
        return {
            dan1: n.slice(0, 4),
            dan2: n.slice(4, 8),
            swapped: false,
            swapDetails: null
        };
    }

    const p = n.map(isHeadEven);
    const first3AllEven = p[0] && p[1] && p[2];
    const first3AllOdd = !p[0] && !p[1] && !p[2];

    let dan1 = [];
    let dan2 = [];
    let swapped = false;
    let swapDetails = null;

    if (first3AllEven && p[3]) {
        // Cả 4 số đầu đều Chẵn -> Tìm số Lẻ đầu tiên trong các số thứ 5, 6, 7, 8
        let swapIdx = -1;
        for (let i = 4; i < 8; i++) {
            if (!p[i]) {
                swapIdx = i;
                break;
            }
        }

        if (swapIdx !== -1) {
            swapped = true;
            swapDetails = {
                type: 'ALL_EVEN_SWAP',
                originalN4: n[3],
                promotedNum: n[swapIdx],
                fromRank: swapIdx + 1
            };
            dan1 = [n[0], n[1], n[2], n[swapIdx]];
            const rem = [n[3]];
            for (let i = 4; i < 8; i++) {
                if (i !== swapIdx) rem.push(n[i]);
            }
            dan2 = rem;
        } else {
            dan1 = n.slice(0, 4);
            dan2 = n.slice(4, 8);
        }
    } else if (first3AllOdd && !p[3]) {
        // Cả 4 số đầu đều Lẻ -> Tìm số Chẵn đầu tiên trong các số thứ 5, 6, 7, 8
        let swapIdx = -1;
        for (let i = 4; i < 8; i++) {
            if (p[i]) {
                swapIdx = i;
                break;
            }
        }

        if (swapIdx !== -1) {
            swapped = true;
            swapDetails = {
                type: 'ALL_ODD_SWAP',
                originalN4: n[3],
                promotedNum: n[swapIdx],
                fromRank: swapIdx + 1
            };
            dan1 = [n[0], n[1], n[2], n[swapIdx]];
            const rem = [n[3]];
            for (let i = 4; i < 8; i++) {
                if (i !== swapIdx) rem.push(n[i]);
            }
            dan2 = rem;
        } else {
            dan1 = n.slice(0, 4);
            dan2 = n.slice(4, 8);
        }
    } else {
        dan1 = n.slice(0, 4);
        dan2 = n.slice(4, 8);
    }

    return { dan1, dan2, swapped, swapDetails };
}

function evaluateTop8ParityXien4(dan1 = [], dan2 = [], actual27 = []) {
    const actSet = new Set((actual27 || []).map(v => String(v).padStart(2, '0')));

    const hitNums1 = (dan1 || []).filter(n => actSet.has(String(n).padStart(2, '0')));
    const hitNums2 = (dan2 || []).filter(n => actSet.has(String(n).padStart(2, '0')));

    const hits1 = hitNums1.length;
    const hits2 = hitNums2.length;

    const payout1 = PAYOUT_MAP[hits1] || 0;
    const payout2 = PAYOUT_MAP[hits2] || 0;

    const profit1 = payout1 - STAKE_PER_DAN_K;
    const profit2 = payout2 - STAKE_PER_DAN_K;

    const totalPayoutK = payout1 + payout2;
    const totalStakeK = TOTAL_DAILY_STAKE_K;
    const totalProfitK = totalPayoutK - totalStakeK;
    const isWin = totalProfitK > 0;

    return {
        dan1,
        dan2,
        hits1,
        hits2,
        hitNums1,
        hitNums2,
        payout1,
        payout2,
        profit1,
        profit2,
        stakeK: totalStakeK,
        dan1StakeK: STAKE_PER_DAN_K,
        dan2StakeK: STAKE_PER_DAN_K,
        payoutK: totalPayoutK,
        profitK: totalProfitK,
        isWin,
        h4Count: (hits1 === 4 ? 1 : 0) + (hits2 === 4 ? 1 : 0),
        h3Count: (hits1 === 3 ? 1 : 0) + (hits2 === 3 ? 1 : 0),
        h2Count: (hits1 === 2 ? 1 : 0) + (hits2 === 2 ? 1 : 0)
    };
}

module.exports = {
    STAKE_PER_DAN_K,
    TOTAL_DAILY_STAKE_K,
    STAKE_TOTAL_K: TOTAL_DAILY_STAKE_K,
    PAYOUT_MAP,
    isHeadEven,
    isHeadOdd,
    pairTop8WithParity,
    evaluateTop8ParityXien4
};
