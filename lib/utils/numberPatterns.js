// utils/numberPatterns.js - Định nghĩa các dạng số cơ bản

/**
 * Phân tích một số thuộc các dạng nào
 * @param {number} number - Số cần phân tích (0-99)
 * @returns {Array} - Mảng các dạng mà số này thuộc về
 */
const analyzeNumber = (number) => {
    const num = parseInt(number);
    if (num < 0 || num > 99) return [];

    const head = Math.floor(num / 10);
    const tail = num % 10;
    const patterns = [];

    // 1. Dạng đầu (0-9)
    patterns.push({
        type: 'head',
        name: `Đầu ${head}`,
        description: `Các số có đầu ${head}`,
        numbers: generateRange(head * 10, head * 10 + 9)
    });

    // 2. Dạng đít (0-9)
    patterns.push({
        type: 'tail',
        name: `Đít ${tail}`,
        description: `Các số có đít ${tail}`,
        numbers: generateTailNumbers(tail)
    });

    // 3. Tổng truyền thống (1-10)
    const traditionalSum = calculateTraditionalSum(head, tail);
    patterns.push({
        type: 'traditional_sum',
        name: `Tổng ${traditionalSum} (Truyền thống)`,
        description: `Các số có tổng ${traditionalSum} theo kiểu truyền thống`,
        numbers: getTraditionalSumNumbers(traditionalSum)
    });

    // 4. Tổng mới (0-18)
    const newSum = head + tail;
    patterns.push({
        type: 'new_sum',
        name: `Tổng ${newSum} (Kiểu mới)`,
        description: `Các số có tổng ${newSum} theo kiểu mới`,
        numbers: getNewSumNumbers(newSum)
    });

    // 5. Dạng chẵn/lẻ
    const parityType = getParityType(head, tail);
    patterns.push({
        type: 'parity',
        name: `Số ${parityType.name}`,
        description: `Các số có dạng ${parityType.description}`,
        numbers: parityType.numbers
    });

    // 6. Dạng số kép
    if (head === tail) {
        patterns.push({
            type: 'double',
            name: 'Số kép',
            description: 'Các số có đầu và đít giống nhau',
            numbers: [0, 11, 22, 33, 44, 55, 66, 77, 88, 99]
        });
    }

    // 7. Dạng số kép lệch (chênh lệch 5)
    if (Math.abs(head - tail) === 5) {
        patterns.push({
            type: 'offset_double',
            name: 'Số kép lệch',
            description: 'Các số có hiệu đầu và đít bằng 5',
            numbers: [5, 16, 27, 38, 49, 50, 61, 72, 83, 94]
        });
    }

    // 8. Dạng đầu chẵn/lẻ với điều kiện
    if (head % 2 === 0) {
        if (head > 4) {
            patterns.push({
                type: 'even_head_gt4',
                name: 'Đầu chẵn > 4',
                description: 'Các số có đầu chẵn lớn hơn 4',
                numbers: generateRange(60, 99).filter(n => Math.floor(n/10) % 2 === 0)
            });
        } else {
            patterns.push({
                type: 'even_head_lt4',
                name: 'Đầu chẵn ≤ 4',
                description: 'Các số có đầu chẵn nhỏ hơn hoặc bằng 4',
                numbers: generateRange(0, 49).filter(n => Math.floor(n/10) % 2 === 0)
            });
        }
    } else {
        if (head > 5) {
            patterns.push({
                type: 'odd_head_gt5',
                name: 'Đầu lẻ > 5',
                description: 'Các số có đầu lẻ lớn hơn 5',
                numbers: generateRange(70, 79).concat(generateRange(90, 99))
            });
        } else if (head < 5) {
            patterns.push({
                type: 'odd_head_lt5',
                name: 'Đầu lẻ < 5',
                description: 'Các số có đầu lẻ nhỏ hơn 5',
                numbers: generateRange(10, 19).concat(generateRange(30, 39))
            });
        }
    }

    // 9. Dạng đít chẵn/lẻ với điều kiện
    if (tail % 2 === 0) {
        if (tail > 4) {
            patterns.push({
                type: 'even_tail_gt4',
                name: 'Đít chẵn > 4',
                description: 'Các số có đít chẵn lớn hơn 4',
                numbers: generateTailNumbers(6).concat(generateTailNumbers(8))
            });
        } else {
            patterns.push({
                type: 'even_tail_lt4',
                name: 'Đít chẵn ≤ 4',
                description: 'Các số có đít chẵn nhỏ hơn hoặc bằng 4',
                numbers: generateTailNumbers(0).concat(generateTailNumbers(2), generateTailNumbers(4))
            });
        }
    } else {
        if (tail > 5) {
            patterns.push({
                type: 'odd_tail_gt5',
                name: 'Đít lẻ > 5',
                description: 'Các số có đít lẻ lớn hơn 5',
                numbers: generateTailNumbers(7).concat(generateTailNumbers(9))
            });
        } else if (tail < 5) {
            patterns.push({
                type: 'odd_tail_lt5',
                name: 'Đít lẻ < 5',
                description: 'Các số có đít lẻ nhỏ hơn 5',
                numbers: generateTailNumbers(1).concat(generateTailNumbers(3))
            });
        }
        // Số 5 không thuộc cả hai nhóm trên
    }

    // 10. Dạng đặc biệt cho đầu 4 và 5
    if (head === 4) {
        patterns.push({
            type: 'head_4',
            name: 'Đầu 4',
            description: 'Các số có đầu 4',
            numbers: generateRange(40, 49)
        });
    }
    if (head === 5) {
        patterns.push({
            type: 'head_5',
            name: 'Đầu 5',
            description: 'Các số có đầu 5',
            numbers: generateRange(50, 59)
        });
    }

    // 11. Dạng đặc biệt cho đít 4 và 5 - LOẠI BỎ VÌ ĐÃ CÓ TRONG DẠNG ĐÍT Ở TRÊN
    // Không cần thêm riêng cho đít 4 và 5 nữa

    // Loại bỏ duplicate patterns
    const uniquePatterns = [];
    const seenKeys = new Set();
    
    patterns.forEach(pattern => {
        const key = `${pattern.type}_${pattern.name}`;
        if (!seenKeys.has(key)) {
            seenKeys.add(key);
            uniquePatterns.push(pattern);
        }
    });

    return uniquePatterns;
};

/**
 * Lấy tất cả số thuộc một dạng cụ thể
 * @param {string} patternType - Loại dạng
 * @param {*} value - Giá trị của dạng (nếu có)
 * @returns {Array} - Mảng các số thuộc dạng này
 */
const getPatternNumbers = (patternType, value = null) => {
    switch (patternType) {
        case 'head':
            return value !== null ? generateRange(value * 10, value * 10 + 9) : [];
        
        case 'tail':
            return value !== null ? generateTailNumbers(value) : [];
        
        case 'traditional_sum':
            return value !== null ? getTraditionalSumNumbers(value) : [];
        
        case 'new_sum':
            return value !== null ? getNewSumNumbers(value) : [];
        
        case 'even_odd':
            return getParityNumbers('even_odd');
        
        case 'odd_even':
            return getParityNumbers('odd_even');
        
        case 'even_even':
            return getParityNumbers('even_even');
        
        case 'odd_odd':
            return getParityNumbers('odd_odd');
        
        case 'double':
            return [0, 11, 22, 33, 44, 55, 66, 77, 88, 99];
        
        case 'offset_double':
            return [5, 16, 27, 38, 49, 50, 61, 72, 83, 94];
        
        default:
            return [];
    }
};

/**
 * Phân tích tất cả số trong một mảng
 * @param {Array} numbers - Mảng các số cần phân tích
 * @returns {Object} - Kết quả phân tích với các dạng và số thuộc mỗi dạng
 */
const analyzeNumbers = (numbers) => {
    const patternMap = new Map();
    const allPatternNumbers = new Set();

    numbers.forEach(num => {
        const patterns = analyzeNumber(num);
        patterns.forEach(pattern => {
            const key = `${pattern.type}_${pattern.name}`;
            if (!patternMap.has(key)) {
                patternMap.set(key, {
                    type: pattern.type,
                    name: pattern.name,
                    description: pattern.description,
                    numbers: new Set(pattern.numbers),
                    inputNumbers: new Set()
                });
            }
            patternMap.get(key).inputNumbers.add(num);
        });
    });

    // Chuyển đổi kết quả
    const result = Array.from(patternMap.values()).map(pattern => ({
        type: pattern.type,
        name: pattern.name,
        description: pattern.description,
        allNumbers: Array.from(pattern.numbers).sort((a, b) => a - b),
        inputNumbers: Array.from(pattern.inputNumbers).sort((a, b) => a - b),
        allCount: pattern.numbers.size,
        inputCount: pattern.inputNumbers.size
    }));

    // Tổng hợp tất cả số từ các dạng
    result.forEach(pattern => {
        pattern.allNumbers.forEach(num => allPatternNumbers.add(num));
    });

    return {
        patterns: result.sort((a, b) => b.inputCount - a.inputCount),
        allPatternNumbers: Array.from(allPatternNumbers).sort((a, b) => a - b),
        totalPatterns: result.length,
        totalNumbers: allPatternNumbers.size
    };
};

// === HELPER FUNCTIONS ===

function generateRange(start, end) {
    const result = [];
    for (let i = start; i <= end; i++) {
        result.push(i);
    }
    return result;
}

function generateTailNumbers(tail) {
    const result = [];
    for (let i = 0; i <= 9; i++) {
        result.push(i * 10 + tail);
    }
    return result;
}

function calculateTraditionalSum(head, tail) {
    const sum = head + tail;
    if (sum === 0) return 10;
    return sum > 10 ? sum - 10 : sum;
}

function getTraditionalSumNumbers(sum) {
    const numbers = [];
    for (let h = 0; h <= 9; h++) {
        for (let t = 0; t <= 9; t++) {
            if (calculateTraditionalSum(h, t) === sum) {
                numbers.push(h * 10 + t);
            }
        }
    }
    return numbers;
}

function getNewSumNumbers(sum) {
    const numbers = [];
    for (let h = 0; h <= 9; h++) {
        for (let t = 0; t <= 9; t++) {
            if (h + t === sum) {
                numbers.push(h * 10 + t);
            }
        }
    }
    return numbers;
}

function getParityType(head, tail) {
    const headParity = head % 2 === 0 ? 'chẵn' : 'lẻ';
    const tailParity = tail % 2 === 0 ? 'chẵn' : 'lẻ';
    
    const type = `${headParity}_${tailParity}`;
    const numbers = getParityNumbers(type === 'chẵn_lẻ' ? 'even_odd' : 
                                   type === 'lẻ_chẵn' ? 'odd_even' :
                                   type === 'chẵn_chẵn' ? 'even_even' : 'odd_odd');
    
    return {
        name: `${headParity} ${tailParity}`,
        description: `đầu ${headParity}, đít ${tailParity}`,
        numbers
    };
}

function getParityNumbers(type) {
    const numbers = [];
    for (let h = 0; h <= 9; h++) {
        for (let t = 0; t <= 9; t++) {
            const headEven = h % 2 === 0;
            const tailEven = t % 2 === 0;
            
            let match = false;
            switch (type) {
                case 'even_odd':
                    match = headEven && !tailEven;
                    break;
                case 'odd_even':
                    match = !headEven && tailEven;
                    break;
                case 'even_even':
                    match = headEven && tailEven;
                    break;
                case 'odd_odd':
                    match = !headEven && !tailEven;
                    break;
            }
            
            if (match) {
                numbers.push(h * 10 + t);
            }
        }
    }
    return numbers;
}

module.exports = {
    analyzeNumber,
    analyzeNumbers,
    getPatternNumbers
};