/**
 * Cấu hình hệ thống loại trừ đa cấp
 * 
 * Các cấp độ ưu tiên (theo thứ tự):
 * 1. RED (Đỏ): Cả GE và Exact đều lastGap < minGap
 * 2. PURPLE (Tím): Chuỗi tiềm năng (record = 2)
 * 3. ORANGE (Cam): GE HOẶC Exact có lastGap < minGap
 * 4. LIGHT_RED (Đỏ nhạt): Threshold động ĐỒNG BỘ cho TẤT CẢ chuỗi
 *    - Công thức: lastGap < minGap * (1 + threshold) < avgGap
 *    - Điều kiện: GE HOẶC Exact thỏa mãn (nới lỏng)
 *    - GIỚI HẠN: minGap * (1 + threshold) PHẢI < avgGap
 *    - Threshold tăng từ 5% đến tối đa 500%
 *    - Áp dụng CÙNG MỘT threshold cho TẤT CẢ các pattern
 *    - Dừng khi tổng RED + PURPLE + ORANGE + LIGHT_RED >= 40 số
 */

module.exports = {
    // Ngưỡng loại trừ: Số đánh phải nằm trong khoảng 20-40
    // MIN_EXCLUSION = 60: Số đánh tối đa 40
    // MAX_EXCLUSION = 80: Số đánh tối thiểu 20
    MIN_EXCLUSION_COUNT: 60,  // Loại trừ ít nhất 60 số → Đánh tối đa 40 số
    MAX_EXCLUSION_COUNT: 80,  // Loại trừ tối đa 80 số → Đánh tối thiểu 20 số

    // Cấu hình threshold cho LIGHT_RED (áp dụng đồng bộ cho tất cả chuỗi)
    LIGHT_RED_THRESHOLD: {
        STEP: 0.05,  // Bước nhảy 5%
        MAX: 5.0     // Tối đa 500% (nhưng phải < avgGap)
    },

    // Các cấp độ ưu tiên
    PRIORITY_LEVELS: {
        RED: 'red',
        PURPLE: 'purple',
        ORANGE: 'orange',
        LIGHT_RED: 'light_red'
    },

    // Thứ tự áp dụng (từ cao đến thấp): Đỏ -> Tím -> Cam -> Đỏ nhạt
    PRIORITY_ORDER: ['red', 'purple', 'orange', 'light_red'],

    // Màu sắc cho UI
    COLORS: {
        red: {
            bg: 'bg-red-100',
            border: 'border-red-500',
            text: 'text-red-800',
            badge: 'bg-red-500 text-white'
        },
        purple: {
            bg: 'bg-purple-100',
            border: 'border-purple-500',
            text: 'text-purple-800',
            badge: 'bg-purple-500 text-white'
        },
        orange: {
            bg: 'bg-orange-100',
            border: 'border-orange-500',
            text: 'text-orange-800',
            badge: 'bg-orange-500 text-white'
        },
        light_red: {
            bg: 'bg-red-50',
            border: 'border-red-300',
            text: 'text-red-700',
            badge: 'bg-red-300 text-red-900'
        }
    },

    // Labels cho UI
    LABELS: {
        red: 'Đỏ (GE+Exact < Min)',
        purple: 'Tím (Tiềm năng)',
        orange: 'Cam (GE hoặc Exact < Min)',
        light_red: 'Đỏ nhạt (Min×threshold < Avg)'
    }
};
