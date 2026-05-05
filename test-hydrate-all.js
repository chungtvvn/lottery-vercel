const stat = require('./lib/services/statisticsService');
const lot = require('./lib/services/lotteryService');

async function test() {
    await lot.loadAll();
    const res = await stat.getFilteredStreaks('dau_2', 'veSole', { minLength: 'all' });
    const match = res.streaks.find(s => s.startDate === '14/11/2025');
    console.log(JSON.stringify(match, null, 2));
}
test();
