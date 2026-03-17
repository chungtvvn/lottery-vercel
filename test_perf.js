require('dotenv').config({ path: '.env.local' });
const s1 = Date.now();
const statService = require('./lib/services/statisticsService');
const lotteryService = require('./lib/services/lotteryService');

async function test() {
    await lotteryService.loadRawData();
    console.log(`[Perf] loadRawData took ${Date.now() - s1}ms`);
    
    const s2 = Date.now();
    await statService.getQuickStats();
    console.log(`[Perf] getQuickStats took ${Date.now() - s2}ms`);
    
    const s3 = Date.now();
    await statService.getQuickStatsHistory();
    console.log(`[Perf] getQuickStatsHistory took ${Date.now() - s3}ms`);
}

test().catch(console.error);
