require('dotenv').config({ path: '.env.local' });
const lotteryService = require('./lib/services/lotteryService');
const statService = require('./lib/services/statisticsService');

async function test() {
    await lotteryService.loadRawData();
    const history = await statService.getQuickStatsHistory();
    console.log(JSON.stringify(history.map(h => ({ date: h.date, count: h.streaks.length })), null, 2));
}

test().catch(console.error);
