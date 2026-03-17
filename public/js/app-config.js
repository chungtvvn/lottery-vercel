/**
 * Shared Configuration Module
 * Quản lý cấu hình cho toàn bộ ứng dụng thống kê
 */

const AppConfig = {
    // Default values
    defaults: {
        // NEW: Exclusion Strategy Settings
        USE_CONFIDENCE_SCORE: true,
        EXCLUSION_STRATEGY: 'BALANCED',
        // Gap Settings
        GAP_STRATEGY: 'COMBINED',
        GAP_BUFFER_PERCENT: 0,
        GAP_THRESHOLD_PERCENT: 0.3,
        USE_MIN_GAP: true,
        MIN_GAP_PERCENT: 0.3,
        INITIAL_BET_AMOUNT: 10,
        BET_STEP_AMOUNT: 5,
        SHOW_PROBABILITY_BACKGROUNDS: true,
        HIGHLIGHT_LAST_GAP: true
    },

    // Current values (loaded from localStorage or defaults)
    current: {},

    /**
     * Initialize config from localStorage
     */
    init() {
        const saved = localStorage.getItem('lottery-stats-config');
        if (saved) {
            try {
                this.current = { ...this.defaults, ...JSON.parse(saved) };
            } catch (e) {
                console.error('Failed to load config:', e);
                this.current = { ...this.defaults };
            }
        } else {
            this.current = { ...this.defaults };
        }
        return this.current;
    },

    /**
     * Save config to localStorage
     */
    save(config) {
        this.current = { ...this.current, ...config };
        localStorage.setItem('lottery-stats-config', JSON.stringify(this.current));
        return this.current;
    },

    /**
     * Reset to defaults
     */
    reset() {
        this.current = { ...this.defaults };
        localStorage.removeItem('lottery-stats-config');
        return this.current;
    },

    /**
     * Get a specific config value
     */
    get(key) {
        return this.current[key] !== undefined ? this.current[key] : this.defaults[key];
    },

    /**
     * Set a specific config value
     */
    set(key, value) {
        this.current[key] = value;
        this.save(this.current);
        return value;
    }
};

// Initialize on load
if (typeof window !== 'undefined') {
    AppConfig.init();
}
