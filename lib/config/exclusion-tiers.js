/**
 * Cấu hình hệ thống loại trừ hiệu chuẩn (Calibrated Exclusion System)
 * 
 * NGUYÊN TẮC THỐNG KÊ (STRICT EMPIRICAL & PIT):
 * 1. Bỏ ngưỡng cứng `lastGap < minGap`: Thay hoàn toàn bằng `credibleEdge > 0` và Wilson Lower Bound.
 * 2. Yêu cầu mẫu tối thiểu cao: MIN_TRIALS >= 20 (thay vì 5 mẫu gây nhiễu ngẫu nhiên).
 * 3. Không ép đủ số lượng: Tắt cơ chế nới lỏng LIGHT_RED ép đủ 40-70 số. Evidence tới đâu loại tới đó, thiếu thì Abstain.
 * 4. Phạt trùng lặp (Diversity Weights): Áp dụng [1, 0.55, 0.3, 0.16, 0.08] giữa các họ độc lập.
 * 5. Kiểm soát False Discovery: Áp dụng Benjamini-Hochberg (BH FDR) alpha = 0.10 và Split-Half Stability.
 */

module.exports = {
    // Ngưỡng số lượng tự nhiên (không cưỡng bức)
    MIN_EXCLUSION_COUNT: 20,
    MAX_EXCLUSION_COUNT: 80,

    // CẤU HÌNH HIỆU CHUẨN THỐNG KÊ (CALIBRATED V2)
    CALIBRATED_CONFIG: {
        MIN_TRIALS: 20,                          // Cỡ mẫu tối thiểu chuyển tiếp (nâng từ 5 lên 20)
        PRIOR_WEIGHT: 30,                        // Trọng số prior Bayesian co về baseline
        USE_HARD_MIN_GAP: false,                 // Bỏ ngưỡng cứng lastGap < minGap
        CREDIBLE_EDGE_ONLY: true,                // Chỉ loại khi credibleEdge > 0
        ENABLE_FORCED_THRESHOLD_EXPANSION: false,// TẮT cơ chế LIGHT_RED tăng threshold đến 500%
        DIVERSITY_WEIGHTS: [1, 0.55, 0.3, 0.16, 0.08], // Giảm trừ tương quan giữa các họ
        BENJAMINI_HOCHBERG_FDR: {
            ENABLED: true,
            ALPHA: 0.10                          // Ngưỡng kiểm soát tỷ lệ phát hiện sai FDR
        },
        SPLIT_STABILITY_REQUIRED: true,          // Yêu cầu edge dương trên cả 2 giai đoạn lịch sử
        STRICT_ABSTAIN: true                     // Thiếu evidence thì cược 0đ / abstain thay vì ép cược
    },

    // Cấu hình legacy LIGHT_RED (Đã vô hiệu hóa cưỡng bức threshold)
    LIGHT_RED_THRESHOLD: {
        ENABLED: false,                          // ĐÃ VÔ HIỆU HÓA: Không ép đủ số lượng
        STEP: 0.05,
        MAX: 1.0
    },

    // Các cấp độ ưu tiên hiệu chuẩn
    PRIORITY_LEVELS: {
        RED: 'red',                              // Tier 1: Credible Edge cao, Wilson Lower > baseline + 3%
        PURPLE: 'purple',                        // Tier 2: Credible Edge trung bình, Wilson Lower > baseline
        ORANGE: 'orange',                        // Tier 3: Credible Edge > 0, trials >= 20
        LIGHT_RED: 'light_red'                   // Deprecated / Disabled
    },

    // Thứ tự áp dụng (từ cao đến thấp)
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
        red: 'Đỏ (Tier 1: Credible Edge Vượt Trội)',
        purple: 'Tím (Tier 2: Wilson Lower > Baseline)',
        orange: 'Cam (Tier 3: Credible Edge > 0)',
        light_red: 'Đỏ nhạt (Không áp dụng ép ngưỡng)'
    }
};
