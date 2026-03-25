require('dotenv').config({path:'.env.local'});
const ls = require('./lib/services/lotteryService');
const ss = require('./lib/services/statisticsService');

async function test() {
    ls.clearCache(); ss.clearCache();
    const hes = require('./lib/services/historicalExclusionService');
    if (hes.clearCache) hes.clearCache();
    
    await ls.loadRawData();
    await ls.loadStats();
    
    const history = await ss.getQuickStatsHistory();
    
    if (!history || history.length === 0) {
        console.log('NO HISTORY DATA');
        process.exit(1);
    }
    
    console.log('History dates:', history.map(h => h.date));
    
    // Check first date (newest)
    const latest = history[0];
    console.log('\n=== Date:', latest.date, '===');
    console.log('Total streaks:', latest.streaks.length);
    
    // Find streaks with length >= 5
    const longStreaks = latest.streaks.filter(s => s.length >= 5);
    console.log('Streaks >= 5 days:', longStreaks.length);
    
    for (const s of longStreaks.slice(0, 3)) {
        console.log('\n  KEY:', s.key);
        console.log('  desc:', s.description);
        console.log('  length:', s.length);
        console.log('  dates count:', s.dates ? s.dates.length : 'NO DATES');
        console.log('  fullSeq count:', s.fullSequence ? s.fullSequence.length : 'NO FS');
        if (s.fullSequence && s.fullSequence.length > 0) {
            console.log('  fs[0]:', JSON.stringify(s.fullSequence[0]));
            console.log('  fs[last]:', JSON.stringify(s.fullSequence[s.fullSequence.length-1]));
        }
        if (s.dates && s.dates.length > 0) {
            console.log('  dates[0]:', s.dates[0]);
            console.log('  dates[last]:', s.dates[s.dates.length-1]);
        }
    }
    
    // Also check a streak with 0 fullSequence
    const emptyFS = latest.streaks.filter(s => !s.fullSequence || s.fullSequence.length === 0);
    console.log('\n=== Streaks with EMPTY fullSequence:', emptyFS.length, '===');
    for (const s of emptyFS.slice(0, 3)) {
        console.log('  KEY:', s.key, 'len:', s.length, 'dates:', s.dates ? s.dates.length : 'none');
    }
    
    process.exit(0);
}
test().catch(e => { console.error(e); process.exit(1); });
