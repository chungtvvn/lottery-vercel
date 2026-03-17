/**
 * data-loader.js - Vercel-compatible data loader  
 * Thay thế tất cả fs.readFile/readFileSync cho data files
 * Load từ lotteryService (which loads from Supabase)
 */

const lotteryService = require('./services/lotteryService');

async function ensureDataLoaded() {
    if (!lotteryService.getRawData()) {
        await lotteryService.loadRawData();
    }
}

function getRawDataSync() {
    return lotteryService.getRawData() || [];
}

function getNumberStatsSync() {
    return lotteryService.getNumberStats() || {};
}

function getHeadTailStatsSync() {
    return lotteryService.getHeadTailStats() || {};
}

function getSumDiffStatsSync() {
    return lotteryService.getSumDiffStats() || {};
}

async function getRawData() {
    await ensureDataLoaded();
    return getRawDataSync();
}

async function getNumberStats() {
    await ensureDataLoaded();
    return getNumberStatsSync();
}

async function getHeadTailStats() {
    await ensureDataLoaded();
    return getHeadTailStatsSync();
}

async function getSumDiffStats() {
    await ensureDataLoaded();
    return getSumDiffStatsSync();
}

module.exports = {
    ensureDataLoaded,
    getRawData,
    getNumberStats,
    getHeadTailStats,
    getSumDiffStats,
    getRawDataSync,
    getNumberStatsSync,
    getHeadTailStatsSync,
    getSumDiffStatsSync,
    lotteryService
};
