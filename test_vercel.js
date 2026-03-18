require('dotenv').config({ path: '.env.local' });
const { getRawData } = require('./lib/data-access');
const generateNumberStats = require('./lib/generators/statisticsGenerator');
const generateHeadTailStats = require('./lib/generators/headTailStatsGenerator');
const generateSumDifferenceStats = require('./lib/generators/sumDifferenceStatsGenerator');
const { saveStatsToDb, loadStatsFromDb } = require('./lib/data-access');

async function run() {
    console.log("Loading raw data...");
    const rawData = await getRawData();
    console.log(`Loaded ${rawData.length} rows.`);

    console.log("Generating Number stats...");
    const stats = await generateNumberStats(null, null, rawData);
    console.log("Stats motSoVeLienTiep length:", stats.motSoVeLienTiep.streaks.length);

    console.log("Saving to DB...");
    await saveStatsToDb('number', stats);

    console.log("Loading from DB...");
    const loaded = await loadStatsFromDb('number');
    console.log("Loaded motSoVeLienTiep length:", loaded.motSoVeLienTiep.streaks.length);
    console.log("First element:", loaded.motSoVeLienTiep.streaks[0]);
}

run().catch(console.error);
