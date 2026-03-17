/**
 * Prediction Cache Service
 * Cache kết quả tính toán - Vercel version (in-memory only)
 */

class PredictionCacheService {
    constructor() {
        this.cache = {
            unified: null,
            advanced: null,
            hybrid: null,
            exclusion: null,
            lastUpdated: null,
            dataDate: null
        };
        this.initialized = false;
    }

    async loadCache() {
        // In-memory only on Vercel
        this.initialized = true;
        return false;
    }

    async saveCache() {
        this.cache.lastUpdated = new Date().toISOString();
    }


    /**
     * Kiểm tra cache có hợp lệ không
     * @param {string} currentDataDate - Ngày của data hiện tại
     */
    isValid(currentDataDate) {
        if (!this.cache.dataDate || !this.cache.lastUpdated) return false;
        return this.cache.dataDate === currentDataDate;
    }

    /**
     * Cập nhật cache cho một phương pháp
     */
    async updateMethod(method, data, dataDate) {
        this.cache[method] = data;
        this.cache.dataDate = dataDate;
        await this.saveCache();
    }

    /**
     * Cập nhật tất cả cache cùng lúc
     */
    async updateAll(predictions, dataDate) {
        this.cache = {
            ...predictions,
            dataDate: dataDate,
            lastUpdated: new Date().toISOString()
        };
        await this.saveCache();
    }

    /**
     * Lấy cache cho một phương pháp
     */
    getMethod(method) {
        return this.cache[method];
    }

    /**
     * Lấy tất cả cache
     */
    getAll() {
        return {
            unified: this.cache.unified,
            advanced: this.cache.advanced,
            hybrid: this.cache.hybrid,
            exclusion: this.cache.exclusion,
            lastUpdated: this.cache.lastUpdated,
            dataDate: this.cache.dataDate
        };
    }

    /**
     * Xóa cache
     */
    async clearCache() {
        this.cache = {
            unified: null,
            advanced: null,
            hybrid: null,
            exclusion: null,
            lastUpdated: null,
            dataDate: null
        };
        console.log('[Cache] Cleared prediction cache (in-memory)');
    }
}

// Singleton
const predictionCache = new PredictionCacheService();

module.exports = predictionCache;
