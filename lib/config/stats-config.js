/**
 * Statistics Configuration
 * Điều chỉnh các tham số này để thay đổi logic phân tích thống kê
 */

const STATS_CONFIG = {
    /**
     * Chiến lược so sánh khoảng cách (Gap Strategy)
     * - 'GE': Greater or Equal (Lớn hơn hoặc bằng) - So sánh với các chuỗi có độ dài >= hiện tại
     * - 'EXACT': Exact Length (Chính xác) - So sánh với các chuỗi có độ dài == hiện tại
     * - 'COMBINED': Combined (Kết hợp) - Phải thỏa mãn cả hai điều kiện trên (Mặc định)
     */
    GAP_STRATEGY: 'COMBINED',

    /**
     * Phần trăm đệm cho minGap (Gap Buffer)
     * Công thức loại trừ: lastGap < minGap * (1 + GAP_BUFFER_PERCENT)
     * Giá trị mặc định: 0 (0%) - Loại trừ khi lastGap < minGap
     */
    GAP_BUFFER_PERCENT: 0,

    /**
     * Ngưỡng gap để xác định xác suất thấp (Legacy - có thể vẫn dùng cho logic cũ nếu cần)
     * Nếu lastGap < (GAP_THRESHOLD_PERCENT * avgGap), coi là xác suất thấp
     * Giá trị mặc định: 0.3 (30%)
     */
    GAP_THRESHOLD_PERCENT: 0.3,

    /**
     * Số tiền đặt cược ban đầu (đơn vị: 1000 VND)
     * Giá trị mặc định: 10 (tương đương 10,000 VND)
     */
    INITIAL_BET_AMOUNT: 10,

    /**
     * Bước nhảy khi tăng số tiền đặt cược (đơn vị: 1000 VND)
     * Giá trị mặc định: 5 (tương đương 5,000 VND)
     */
    BET_STEP_AMOUNT: 5,

    /**
     * UI Display Settings
     */
    UI: {
        // Hiển thị background màu cho thẻ dựa trên probability
        SHOW_PROBABILITY_BACKGROUNDS: true,

        // Highlight số "Cách lần cuối"
        HIGHLIGHT_LAST_GAP: true,

        // Số ngày tối thiểu để hiển thị cảnh báo
        MIN_STREAK_LENGTH_FOR_WARNING: 2
    },

    /**
     * Chiến lược loại trừ (Exclusion Strategy)
     * - 'CONSERVATIVE': Ít số, độ tin cậy cao (max 35 số, confidence >= 0.6)
     * - 'BALANCED': Cân bằng (max 50 số, confidence >= 0.4) [Mặc định]
     * - 'AGGRESSIVE': Nhiều số (max 100 số, confidence >= 0.2)
     */
    EXCLUSION_STRATEGY: 'BALANCED',

    /**
     * Phương pháp loại trừ
     * - 'VOTING': Weighted Voting (Khuyến nghị)
     * - 'CONFIDENCE': Confidence Score thuần túy
     */
    EXCLUSION_METHOD: 'VOTING',

    /**
     * Bật/tắt hệ thống Confidence Score
     * Nếu false, dùng logic cũ (tier-based)
     */
    USE_CONFIDENCE_SCORE: true,

    /**
     * Weighted Voting Settings
     */
    VOTING_MIN_VOTES: 1,      // Số vote tối thiểu để loại trừ
    VOTING_MIN_WEIGHT: 0.3,   // Weight tối thiểu
    VOTING_MAX_NUMBERS: 50,   // Số lượng tối đa số loại trừ

    /**
     * Historical Win Rate Settings
     */
    MIN_WIN_RATE: 0.1,        // Tỷ lệ thắng tối thiểu (10%)

    /**
     * Weights cho tính confidence score
     */
    CONFIDENCE_WEIGHTS: {
        gapRatio: 0.4,        // Tỷ lệ gap so với min
        dataReliability: 0.3, // Số lượng data points
        streakIntensity: 0.2, // Gần kỷ lục
        winRate: 0.1          // Tỷ lệ thắng lịch sử
    }
};

// Export cho cả Node.js và browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = STATS_CONFIG;
}
