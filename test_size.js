require('dotenv').config({ path: '.env.local' });
const generateNumberStats = require('./lib/generators/statisticsGenerator');
const lotteryService = require('./lib/services/lotteryService');

async function run() {
    await lotteryService.loadRawData();
    const rawData = await lotteryService.getRawData();
    const sortedData = [...rawData].sort((a,b) => new Date(a.date) - new Date(b.date));
    
    console.time('Generate');
    const stats = await generateNumberStats(null, null, sortedData);
    console.timeEnd('Generate');

    let fullSize = JSON.stringify(stats).length;
    console.log("Full Size:", fullSize / 1024 / 1024, "MB");

    for (const k in stats) {
        if (stats[k].streaks) {
            stats[k].streaks.forEach(s => delete s.fullSequence);
        } else {
            for (const sub in stats[k]) {
                if(stats[k][sub].streaks) stats[k][sub].streaks.forEach(s => delete s.fullSequence);
            }
        }
    }
    let noSeqSize = JSON.stringify(stats).length;
    console.log("No fullSequence:", noSeqSize / 1024 / 1024, "MB");
}
run();
