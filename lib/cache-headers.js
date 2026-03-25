/**
 * Cache Headers Utility
 * 
 * Dữ liệu xổ số chỉ cập nhật 1 lần/ngày (~18:30).
 * Tận dụng Vercel CDN (Edge) + stale-while-revalidate để giảm DB hits tới ~0.
 * 
 * Chiến lược:
 * - s-maxage: CDN cache thời gian này (fresh)
 * - stale-while-revalidate: CDN trả stale trong lúc revalidate ở background
 * - Sau khi update-data chạy xong, gọi revalidate để CDN purge
 */

// Cache profiles - TẤT CẢ đều không cache ở browser (no-store)
// Vercel CDN layer vẫn cache qua s-maxage nếu cần
const CACHE_PROFILES = {
    DAILY: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
    MEDIUM: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
    NO_CACHE: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
};

/**
 * Tạo NextResponse.json() với cache headers.
 * @param {any} data - Response data
 * @param {string} profile - 'DAILY' | 'MEDIUM' | 'NO_CACHE'
 * @param {number} status - HTTP status code
 */
function cachedResponse(data, profile = 'DAILY', status = 200) {
    const { NextResponse } = require('next/server');
    const headers = CACHE_PROFILES[profile] || CACHE_PROFILES.DAILY;
    
    return NextResponse.json(data, {
        status,
        headers,
    });
}

/**
 * Tạo error response (không cache)
 */
function errorResponse(message, status = 500) {
    const { NextResponse } = require('next/server');
    return NextResponse.json(
        { error: message },
        { status, headers: CACHE_PROFILES.NO_CACHE }
    );
}

module.exports = { CACHE_PROFILES, cachedResponse, errorResponse };
