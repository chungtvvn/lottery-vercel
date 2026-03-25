require('dotenv').config({path:'.env.local'});
const ls = require('./lib/services/lotteryService');

async function test() {
    ls.clearCache();
    await ls.loadRawData();
    await ls.loadStats();
    
    const headTail = ls.getHeadTailStats() || {};
    
    // Check structure of first key
    const key = Object.keys(headTail)[0];
    const cat = headTail[key];
    console.log('Key:', key);
    console.log('Type:', typeof cat);
    console.log('Keys:', Object.keys(cat).slice(0, 10));
    
    // Check if it has subcategories
    if (cat.streaks) {
        console.log('Has streaks directly:', cat.streaks.length);
        const s = cat.streaks[cat.streaks.length - 1];
        console.log('Last streak fs:', s.fullSequence ? s.fullSequence.length : 'NONE');
        if (s.fullSequence && s.fullSequence.length > 0) {
            console.log('fs[0]:', JSON.stringify(s.fullSequence[0]));
        }
    } else {
        // It's subcategories
        const subkeys = Object.keys(cat);
        console.log('Subcategories:', subkeys.slice(0, 5));
        const firstSub = cat[subkeys[0]];
        console.log('First sub keys:', Object.keys(firstSub));
        if (firstSub.streaks) {
            console.log('Sub streaks count:', firstSub.streaks.length);
            const s = firstSub.streaks[firstSub.streaks.length - 1];
            console.log('Last streak:', JSON.stringify(s).substring(0, 200));
            console.log('fs count:', s.fullSequence ? s.fullSequence.length : 'NONE');
        }
    }
    
    process.exit(0);
}
test().catch(e => { console.error(e); process.exit(1); });
