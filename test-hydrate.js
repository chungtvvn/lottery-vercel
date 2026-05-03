const stat = require('./lib/services/statisticsService');
const lot = require('./lib/services/lotteryService');

async function test() {
    await lot.loadRawData();
    console.log("Raw data loaded:", lot.getRawData().length);
    const res = await stat.getFilteredStreaks('dau_2', 'veSole', { minLength: 3 });
    console.log(JSON.stringify(res.streaks[0], null, 2));
}
test();
