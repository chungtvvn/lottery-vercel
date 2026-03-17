const lotteryService = require('../services/lotteryService');

// Định nghĩa các dạng số và hệ số nhân (CẬP NHẬT THEO YÊU CẦU)
const scoringForms = [
    {
        n: 'even-even',
        description: 'Dạng chẵn chẵn (đầu chẵn đít chẵn)',
        multiplier: 1.0,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 0 && tail % 2 === 0;
        }
    },
    {
        n: '0101',
        description: 'Đầu chẵn lớn hơn 4 Đít chẵn lớn hơn 4',
        multiplier: 6.25,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 0 && head > 4 && tail % 2 === 0 && tail > 4;
        }
    },
    {
        n: '0000',
        description: 'Đầu chẵn bé hơn 4 Đít chẵn bé hơn 4',
        multiplier: 6.25,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 0 && head < 4 && tail % 2 === 0 && tail < 4;
        }
    },
    {
        n: '0001',
        description: 'Đầu chẵn bé hơn 4 Đít chẵn lớn hơn 4',
        multiplier: 6.25,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 0 && head < 4 && tail % 2 === 0 && tail > 4;
        }
    },
    {
        n: '0100',
        description: 'Đầu chẵn lớn hơn 4 Đít chẵn bé hơn 4',
        multiplier: 6.25,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 0 && head > 4 && tail % 2 === 0 && tail < 4;
        }
    },
    {
        n: '400',
        description: 'Đầu chẵn = 4 Đít chẵn bé hơn 4',
        multiplier: 12.5,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head === 4 && tail % 2 === 0 && tail < 4;
        }
    },
    {
        n: '401',
        description: 'Đầu chẵn = 4 Đít chẵn lớn hơn 4',
        multiplier: 12.5,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head === 4 && tail % 2 === 0 && tail > 4;
        }
    },
    {
        n: '004',
        description: 'Đít chẵn = 4 Đầu chẵn bé hơn 4',
        multiplier: 12.5,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return tail === 4 && head % 2 === 0 && head < 4;
        }
    },
    {
        n: '014',
        description: 'Đít chẵn = 4 Đầu chẵn lớn hơn 4',
        multiplier: 12.5,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return tail === 4 && head % 2 === 0 && head > 4;
        }
    },
    {
        n: '44',
        description: 'Đầu chẵn = 4, Đít chẵn = 4',
        multiplier: 30.0,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head === 4 && tail === 4;
        }
    },
    {
        n: 'even-odd',
        description: 'Dạng chẵn lẻ (đầu chẵn đít lẻ)',
        multiplier: 1.0,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 0 && tail % 2 === 1;
        }
    },
    {
        n: '0111',
        description: 'Đầu chẵn lớn hơn 4 Đít lẻ lớn hơn 5',
        multiplier: 6.25,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 0 && head > 4 && tail % 2 === 1 && tail > 5;
        }
    },
    {
        n: '0010',
        description: 'Đầu chẵn bé hơn 4 Đít lẻ bé hơn 5',
        multiplier: 6.25,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 0 && head < 4 && tail % 2 === 1 && tail < 5;
        }
    },
    {
        n: '0011',
        description: 'Đầu chẵn bé hơn 4 Đít lẻ lớn hơn 5',
        multiplier: 6.25,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 0 && head < 4 && tail % 2 === 1 && tail > 5;
        }
    },
    {
        n: '0110',
        description: 'Đầu chẵn lớn hơn 4 Đít lẻ bé hơn 5',
        multiplier: 6.25,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 0 && head > 4 && tail % 2 === 1 && tail < 5;
        }
    },
    {
        n: '410',
        description: 'Đầu chẵn = 4 Đít lẻ bé hơn 5',
        multiplier: 12.5,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head === 4 && tail % 2 === 1 && tail < 5;
        }
    },
    {
        n: '411',
        description: 'Đầu chẵn = 4 Đít lẻ lớn hơn 5',
        multiplier: 12.5,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head === 4 && tail % 2 === 1 && tail > 5;
        }
    },
    {
        n: '015',
        description: 'Đầu chẵn > 4 Đít lẻ = 5',
        multiplier: 12.5,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 0 && head > 4 && tail === 5;
        }
    },
    {
        n: '005',
        description: 'Đầu chẵn < 4 Đít lẻ = 5',
        multiplier: 12.5,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 0 && head < 4 && tail === 5;
        }
    },
    {
        n: '45',
        description: 'Đầu chẵn = 4, Đít lẻ = 5',
        multiplier: 30.0,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head === 4 && tail === 5;
        }
    },
    {
        n: 'odd-odd',
        description: 'Dạng lẻ lẻ (đầu lẻ đít lẻ)',
        multiplier: 1.0,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 1 && tail % 2 === 1;
        }
    },
    {
        n: '1111',
        description: 'Đầu lẻ lớn hơn 5 Đít lẻ lớn hơn 5',
        multiplier: 6.25,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 1 && head > 5 && tail % 2 === 1 && tail > 5;
        }
    },
    {
        n: '1010',
        description: 'Đầu lẻ bé hơn 5 Đít lẻ bé hơn 5',
        multiplier: 6.25,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 1 && head < 5 && tail % 2 === 1 && tail < 5;
        }
    },
    {
        n: '1011',
        description: 'Đầu lẻ bé hơn 5 Đít lẻ lớn hơn 5',
        multiplier: 6.25,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 1 && head < 5 && tail % 2 === 1 && tail > 5;
        }
    },
    {
        n: '1110',
        description: 'Đầu lẻ lớn hơn 5 Đít lẻ bé hơn 5',
        multiplier: 6.25,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 1 && head > 5 && tail % 2 === 1 && tail < 5;
        }
    },
    {
        n: '510',
        description: 'Đầu lẻ = 5 Đít lẻ bé hơn 5',
        multiplier: 12.5,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head === 5 && tail % 2 === 1 && tail < 5;
        }
    },
    {
        n: '511',
        description: 'Đầu lẻ = 5 Đít lẻ lớn hơn 5',
        multiplier: 12.5,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head === 5 && tail % 2 === 1 && tail > 5;
        }
    },
    {
        n: '105',
        description: 'Đít lẻ = 5 Đầu lẻ bé hơn 5',
        multiplier: 12.5,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return tail === 5 && head % 2 === 1 && head < 5;
        }
    },
    {
        n: '115',
        description: 'Đít lẻ = 5 Đầu lẻ lớn hơn 5',
        multiplier: 12.5,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return tail === 5 && head % 2 === 1 && head > 5;
        }
    },
    {
        n: '55',
        description: 'Đầu lẻ = 5, Đít lẻ = 5',
        multiplier: 30.0,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head === 5 && tail === 5;
        }
    },
    {
        n: 'odd-even',
        description: 'Dạng lẻ chẵn (đầu lẻ đít chẵn)',
        multiplier: 1.0,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 1 && tail % 2 === 0;
        }
    },
    {
        n: '1101',
        description: 'Đầu lẻ lớn hơn 5 Đít chẵn lớn hơn 4',
        multiplier: 6.25,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 1 && head > 5 && tail % 2 === 0 && tail > 4;
        }
    },
    {
        n: '1000',
        description: 'Đầu lẻ bé hơn 5 Đít chẵn bé hơn 4',
        multiplier: 6.25,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 1 && head < 5 && tail % 2 === 0 && tail < 4;
        }
    },
    {
        n: '1001',
        description: 'Đầu lẻ bé hơn 5 Đít chẵn lớn hơn 4',
        multiplier: 6.25,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 1 && head < 5 && tail % 2 === 0 && tail > 4;
        }
    },
    {
        n: '1100',
        description: 'Đầu lẻ lớn hơn 5 Đít chẵn bé hơn 4',
        multiplier: 6.25,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 1 && head > 5 && tail % 2 === 0 && tail < 4;
        }
    },
    {
        n: '500',
        description: 'Đầu lẻ = 5 Đít chẵn bé hơn 4',
        multiplier: 12.5,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head === 5 && tail % 2 === 0 && tail < 4;
        }
    },
    {
        n: '501',
        description: 'Đầu lẻ = 5 Đít chẵn lớn hơn 4',
        multiplier: 12.5,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head === 5 && tail % 2 === 0 && tail > 4;
        }
    },
    {
        n: '114',
        description: 'Đầu lẻ lớn hơn 5 Đít chẵn = 4',
        multiplier: 12.5,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 1 && head > 5 && tail === 4;
        }
    },
    {
        n: '104',
        description: 'Đầu lẻ bé hơn 5 Đít chẵn = 4',
        multiplier: 12.5,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head % 2 === 1 && head < 5 && tail === 4;
        }
    },
    {
        n: '54',
        description: 'Đầu lẻ = 5, Đít chẵn = 4',
        multiplier: 30.0,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            const tail = num % 10;
            return head === 5 && tail === 4;
        }
    },
    // Individual head/tail categories - CẬP NHẬT HỆ SỐ NHÂN
    {
        n: 'head-even-gt4',
        description: 'Đầu chẵn lớn hơn 4',
        multiplier: 1.25,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            return head % 2 === 0 && head > 4;
        }
    },
    {
        n: 'tail-even-gt4',
        description: 'Đít chẵn lớn hơn 4',
        multiplier: 1.25,
        checkFunction: (num) => {
            const tail = num % 10;
            return tail % 2 === 0 && tail > 4;
        }
    },
    {
        n: 'head-even-lt4',
        description: 'Đầu chẵn bé hơn 4',
        multiplier: 1.25,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            return head % 2 === 0 && head < 4;
        }
    },
    {
        n: 'tail-even-lt4',
        description: 'Đít chẵn bé hơn 4',
        multiplier: 1.25,
        checkFunction: (num) => {
            const tail = num % 10;
            return tail % 2 === 0 && tail < 4;
        }
    },
    {
        n: 'head-4',
        description: 'Đầu chẵn = 4',
        multiplier: 2.5,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            return head === 4;
        }
    },
    {
        n: 'head-5',
        description: 'Đầu lẻ = 5',
        multiplier: 2.5,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            return head === 5;
        }
    },
    {
        n: 'head-odd-lt5',
        description: 'Đầu lẻ bé hơn 5',
        multiplier: 1.25,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            return head % 2 === 1 && head < 5;
        }
    },
    {
        n: 'tail-odd-lt5',
        description: 'Đít lẻ bé hơn 5',
        multiplier: 1.25,
        checkFunction: (num) => {
            const tail = num % 10;
            return tail % 2 === 1 && tail < 5;
        }
    },
    {
        n: 'head-odd-gt5',
        description: 'Đầu lẻ lớn hơn 5',
        multiplier: 1.25,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            return head % 2 === 1 && head > 5;
        }
    },
    {
        n: 'tail-odd-gt5',
        description: 'Đít lẻ lớn hơn 5',
        multiplier: 1.25,
        checkFunction: (num) => {
            const tail = num % 10;
            return tail % 2 === 1 && tail > 5;
        }
    },
    {
        n: 'tail-4',
        description: 'Đít chẵn = 4',
        multiplier: 1.25,
        checkFunction: (num) => {
            const tail = num % 10;
            return tail === 4;
        }
    },
    {
        n: 'tail-5',
        description: 'Đít lẻ = 5',
        multiplier: 1.25,
        checkFunction: (num) => {
            const tail = num % 10;
            return tail === 5;
        }
    }
];

// Add individual head forms (0-9) - CẬP NHẬT HỆ SỐ NHÂN
for (let i = 0; i < 10; i++) {
    scoringForms.push({
        n: `head-${i}`,
        description: `Đầu ${i}`,
        multiplier: 2.5,
        checkFunction: (num) => {
            const head = Math.floor(num / 10);
            return head === i;
        }
    });
}

// Add individual tail forms (0-9) - CẬP NHẬT HỆ SỐ NHÂN
for (let i = 0; i < 10; i++) {
    scoringForms.push({
        n: `tail-${i}`,
        description: `Đít ${i}`,
        multiplier: 2.5,
        checkFunction: (num) => {
            const tail = num % 10;
            return tail === i;
        }
    });
}

// Add individual number forms (00-99) - CẬP NHẬT HỆ SỐ NHÂN
for (let i = 0; i < 100; i++) {
    const numStr = String(i).padStart(2, '0');
    scoringForms.push({
        n: numStr,
        description: `Số ${numStr}`,
        multiplier: 15.0,
        checkFunction: (num) => {
            return (num % 100) === i;
        }
    });
}

// --- Helper Functions ---
// Hàm tính "Hệ số nhân" theo công thức
const getMultiplier = (numberOfItems) => {
    if (numberOfItems <= 0) return 0;
    // Làm tròn đến 4 chữ số thập phân để có độ chính xác cao hơn
    return Math.round((90 / (numberOfItems * 3.6)) * 10000) / 10000;
};

// Hàm tính tổng truyền thống
const getTraditionalSum = (num) => {
    if (num === 0) return 10;
    const head = Math.floor(num / 10);
    const tail = num % 10;
    const sum = head + tail;
    if (sum === 0) return 10;
    return sum > 9 ? sum % 10 === 0 ? 10 : sum % 10 : sum;
};

// Hàm tính tổng mới
const getNewSum = (num) => {
    const head = Math.floor(num / 10);
    const tail = num % 10;
    return head + tail;
};

// Hàm tính hiệu
const getDifference = (num) => {
    const head = Math.floor(num / 10);
    const tail = num % 10;
    return Math.abs(head - tail);
};


// 1. Dạng Đầu & Đít
scoringForms.push(
    { n: 'head-even', description: 'Đầu Chẵn', multiplier: getMultiplier(50), checkFunction: (num) => Math.floor(num / 10) % 2 === 0 },
    { n: 'head-odd', description: 'Đầu Lẻ', multiplier: getMultiplier(50), checkFunction: (num) => Math.floor(num / 10) % 2 !== 0 },
    { n: 'tail-even', description: 'Đít Chẵn', multiplier: getMultiplier(50), checkFunction: (num) => (num % 10) % 2 === 0 },
    { n: 'tail-odd', description: 'Đít Lẻ', multiplier: getMultiplier(50), checkFunction: (num) => (num % 10) % 2 !== 0 }
);

// 2. Dạng Đầu To/Nhỏ và Đít To/Nhỏ
scoringForms.push(
    { n: 'headL-tailL', description: 'Đầu To Đít To (>=5)', multiplier: getMultiplier(25), checkFunction: (num) => Math.floor(num / 10) >= 5 && (num % 10) >= 5 },
    { n: 'headL-tailS', description: 'Đầu To Đít Nhỏ (>=5, <5)', multiplier: getMultiplier(25), checkFunction: (num) => Math.floor(num / 10) >= 5 && (num % 10) < 5 },
    { n: 'headS-tailL', description: 'Đầu Nhỏ Đít To (<5, >=5)', multiplier: getMultiplier(25), checkFunction: (num) => Math.floor(num / 10) < 5 && (num % 10) >= 5 },
    { n: 'headS-tailS', description: 'Đầu Nhỏ Đít Nhỏ (<5)', multiplier: getMultiplier(25), checkFunction: (num) => Math.floor(num / 10) < 5 && (num % 10) < 5 }
);

// 3. Dạng Tổng (Truyền Thống)
for (let i = 1; i <= 10; i++) {
    const count = Array.from({ length: 100 }, (_, j) => j).filter(num => getTraditionalSum(num) === i).length;
    scoringForms.push({
        n: `tsum-${i}`,
        description: `Tổng ${i} (Truyền thống)`,
        multiplier: getMultiplier(count),
        checkFunction: (num) => getTraditionalSum(num) === i
    });
}

// 4. Dạng Tổng (Mới)
for (let i = 0; i <= 18; i++) {
    const count = Array.from({ length: 100 }, (_, j) => j).filter(num => getNewSum(num) === i).length;
    scoringForms.push({
        n: `nsum-${i}`,
        description: `Tổng ${i} (Mới)`,
        multiplier: getMultiplier(count),
        checkFunction: (num) => getNewSum(num) === i
    });
}

// 5. Dạng Tổng Chẵn/Lẻ và các loại con
scoringForms.push(
    { n: 'sum-even', description: 'Tổng Chẵn', multiplier: getMultiplier(50), checkFunction: (num) => getNewSum(num) % 2 === 0 },
    { n: 'sum-odd', description: 'Tổng Lẻ', multiplier: getMultiplier(50), checkFunction: (num) => getNewSum(num) % 2 !== 0 },
    { n: 'nsum-even-even', description: 'Tổng Mới Chẵn Chẵn (0-8)', multiplier: getMultiplier(25), checkFunction: (num) => { const s = getNewSum(num); return s <= 8 && s % 2 === 0; } },
    { n: 'nsum-even-odd', description: 'Tổng Mới Chẵn Lẻ (1-9)', multiplier: getMultiplier(25), checkFunction: (num) => { const s = getNewSum(num); return s <= 9 && s % 2 !== 0; } },
    { n: 'nsum-odd-even', description: 'Tổng Mới Lẻ Chẵn (10-18)', multiplier: getMultiplier(25), checkFunction: (num) => { const s = getNewSum(num); return s >= 10 && s % 2 === 0; } },
    { n: 'nsum-odd-odd', description: 'Tổng Mới Lẻ Lẻ (11-17)', multiplier: getMultiplier(25), checkFunction: (num) => { const s = getNewSum(num); return s >= 11 && s % 2 !== 0; } }
);

// 6. Dạng Hiệu
for (let i = 0; i <= 9; i++) {
    const count = Array.from({ length: 100 }, (_, j) => j).filter(num => getDifference(num) === i).length;
    scoringForms.push({
        n: `diff-${i}`,
        description: `Hiệu ${i}`,
        multiplier: getMultiplier(count),
        checkFunction: (num) => getDifference(num) === i
    });
}
scoringForms.push(
    { n: 'diff-even', description: 'Hiệu Chẵn', multiplier: getMultiplier(50), checkFunction: (num) => getDifference(num) % 2 === 0 },
    { n: 'diff-odd', description: 'Hiệu Lẻ', multiplier: getMultiplier(50), checkFunction: (num) => getDifference(num) % 2 !== 0 }
);

// Helper function to format date
const formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
};

// Helper functions for enhanced functionality
const findFormsByOccurrence = (data, startDate, endDate, mode, targetOccurrence) => {
    const allResults = calculateAllLotteryScores(data, startDate, endDate, mode);
    return allResults.results.filter(result => result.occurrences === targetOccurrence);
};

const findFormsByTypes = (data, startDate, endDate, mode, formTypes) => {
    let results = [];
    
    for (const formType of formTypes) {
        const formResults = calculateLotteryScores(data, startDate, endDate, mode, formType);
        results = results.concat(formResults.results);
    }
    
    return results;
};

const analyzeDuplicates = (results) => {
    const numberToForms = {};
    const duplicateAnalysis = {
        duplicateNumbers: {},
        totalDuplicates: 0,
        formsWithDuplicates: new Set()
    };
    
    // Build map of numbers to forms
    results.forEach(result => {
        if (result.dateToNumbers) {
            Object.values(result.dateToNumbers).forEach(numbers => {
                numbers.forEach(number => {
                    if (!numberToForms[number]) {
                        numberToForms[number] = new Set();
                    }
                    numberToForms[number].add(result.form);
                });
            });
        }
    });
    
    // Find duplicates
    Object.keys(numberToForms).forEach(number => {
        const forms = Array.from(numberToForms[number]);
        if (forms.length > 1) {
            duplicateAnalysis.duplicateNumbers[number] = forms;
            duplicateAnalysis.totalDuplicates++;
            forms.forEach(form => duplicateAnalysis.formsWithDuplicates.add(form));
        }
    });
    
    return duplicateAnalysis;
};

const getOccurrenceStatistics = (data, startDate, endDate, mode) => {
    const allResults = calculateAllLotteryScores(data, startDate, endDate, mode);
    const occurrenceMap = {};
    
    allResults.results.forEach(result => {
        const occurrence = result.occurrences;
        if (!occurrenceMap[occurrence]) {
            occurrenceMap[occurrence] = [];
        }
        occurrenceMap[occurrence].push(result);
    });
    
    return {
        byOccurrence: occurrenceMap,
        totalForms: allResults.results.length,
        occurrenceRange: {
            min: Math.min(...Object.keys(occurrenceMap).map(Number)),
            max: Math.max(...Object.keys(occurrenceMap).map(Number))
        }
    };
};


/**
 * [ĐÃ CẬP NHẬT] - Hàm tính điểm không còn phụ thuộc vào service bên ngoài.
 * @param {Array<Object>} processedData - Mảng dữ liệu đã được xử lý trước. Mỗi object có dạng { date: 'DD/MM/YYYY', numbers: [...] }
 * @param {string | null} formFilter - Lọc theo mã dạng cụ thể (ví dụ: 'even-even').
 * @returns {Object} - Kết quả tính điểm cho các dạng được xử lý.
 */
/**
 * [ĐÃ SỬA LỖI] - Hàm tính điểm, đảm bảo luôn trả về kết quả khi có bộ lọc.
 */
const calculateLotteryScores = (processedData, formFilter = null) => {
    try {
        if (!Array.isArray(processedData)) {
            return { results: [], total: 0, message: 'Dữ liệu không hợp lệ.' };
        }
        if (processedData.length === 0) {
            return { results: [], total: 0, message: 'Không có dữ liệu trong khoảng thời gian đã chọn.' };
        }

        const results = [];
        const formsToProcess = formFilter 
            ? scoringForms.filter(form => form.n === formFilter) 
            : scoringForms;

        for (const form of formsToProcess) {
            const formResult = {
                form: form.description,
                formN: form.n,
                dates: [],
                dateToNumbers: {},
                occurrences: 0,
                multiplier: form.multiplier,
                score: 0
            };

            processedData.forEach(entry => {
                const matchingNumbers = entry.numbers.filter(num => {
                    const normalizedNum = Number(num) % 100;
                    return form.checkFunction(normalizedNum);
                });

                if (matchingNumbers.length > 0) {
                    const formattedDate = entry.date;
                    formResult.dates.push(formattedDate);
                    formResult.dateToNumbers[formattedDate] = matchingNumbers.map(num => 
                        String(Number(num) % 100).padStart(2, '0')
                    );
                    formResult.occurrences++;
                }
            });

            formResult.score = 90 - (formResult.occurrences * form.multiplier);
            
            // ====> SỬA LỖI TẠI ĐÂY <====
            // Logic cũ đã loại bỏ kết quả có 0 lần về khi có bộ lọc.
            // Logic mới: Luôn thêm kết quả vào mảng. Việc lọc sẽ do hàm gọi xử lý.
            results.push(formResult);
            // ====> KẾT THÚC SỬA LỖI <====
        }

        results.sort((a, b) => b.score - a.score);
        const total = results.length;
        const message = total === 0 ? 'Không tìm thấy kết quả phù hợp.' : '';

        return { results, total, message };
    } catch (error) {
        console.error('Lỗi trong calculateLotteryScores:', error);
        return { results: [], total: 0, message: 'Lỗi khi tính điểm: ' + error.message };
    }
};

/**
 * [ĐÃ CẬP NHẬT] - Tính điểm cho TẤT CẢ các dạng.
 * @param {Array<Object>} processedData - Mảng dữ liệu đã xử lý.
 * @returns {Object}
 */
const calculateAllLotteryScores = (processedData) => {
    // Hàm này thực chất là một trường hợp đặc biệt của hàm trên khi không có bộ lọc
    return calculateLotteryScores(processedData, null);
};


/**
 * [ĐÃ CẬP NHẬT] - Hàm tính điểm tổng hợp cho từng số từ 00-99.
 * @param {Array<Object>} processedData - Mảng dữ liệu đã xử lý.
 * @returns {Object}
 */
const calculateAggregateScoreForAllNumbers = (processedData) => {
    try {
        if (!Array.isArray(processedData) || processedData.length === 0) {
            return { results: [], message: 'Không có dữ liệu để phân tích.' };
        }
        
        const allNumbersScores = [];

        // Cache số lần xuất hiện của mỗi dạng để tăng tốc độ
        const formOccurrenceCache = new Map();
        scoringForms.forEach(form => {
            let occurrences = 0;
            processedData.forEach(entry => {
                const hasMatch = entry.numbers.some(num => form.checkFunction(Number(num) % 100));
                if (hasMatch) {
                    occurrences++;
                }
            });
            formOccurrenceCache.set(form.n, occurrences);
        });

        for (let i = 0; i < 100; i++) {
            const currentNumber = i;
            let totalScore = 0;
            const contributingForms = [];

            scoringForms.forEach(form => {
                if (form.checkFunction(currentNumber)) {
                    const occurrences = formOccurrenceCache.get(form.n) || 0;
                    const individualScore = 90 - (occurrences * form.multiplier);
                    totalScore += individualScore;
                    contributingForms.push({
                        formName: form.description,
                        formN: form.n,
                        occurrences: occurrences,
                        multiplier: form.multiplier,
                        score: individualScore,
                    });
                }
            });

            const maxPossibleScore = contributingForms.length * 90;
            const scoreRatio = (maxPossibleScore > 0) ? (totalScore / maxPossibleScore) : 0;
            
            let status = '';
            let statusClass = '';
            if (scoreRatio >= 0.8) { status = 'Khá'; statusClass = 'bg-success'; }
            else if (scoreRatio >= 0.6) { status = 'Trung Bình'; statusClass = 'bg-info'; }
            else if (scoreRatio >= 0.4) { status = 'Cân Bằng'; statusClass = 'bg-secondary'; }
            else if (scoreRatio >= 0.2) { status = 'Kém'; statusClass = 'bg-warning text-dark'; }
            else { status = 'Rất Kém'; statusClass = 'bg-danger'; }

            allNumbersScores.push({
                number: String(currentNumber).padStart(2, '0'),
                totalScore: Math.round(totalScore * 10) / 10,
                status: status,
                statusClass: statusClass,
                scoreRatio: (scoreRatio * 100).toFixed(1) + '%', 
                contributingForms: contributingForms.sort((a, b) => b.score - a.score),
            });
        }
        
        allNumbersScores.sort((a, b) => b.totalScore - a.totalScore);

        return { results: allNumbersScores, message: 'Tính điểm tổng hợp thành công.' };

    } catch (error) {
        console.error('Lỗi trong calculateAggregateScoreForAllNumbers:', error);
        return { results: [], message: 'Lỗi server khi tính điểm tổng hợp: ' + error.message };
    }
};

module.exports = {
    scoringForms,
    calculateLotteryScores,
    calculateAllLotteryScores,
    calculateAggregateScoreForAllNumbers
};