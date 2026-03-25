require('dotenv').config({path:'.env.local'});
const ls = require('./lib/services/lotteryService');
const ss = require('./lib/services/statisticsService');
async function test() {
  ls.clearCache(); ss.clearCache();
  await ls.loadRawData();
  await ls.loadStats();
  const qs = await ss.getQuickStats();
  let found = 0;
  let empty = 0;
  for(const k of Object.keys(qs)) {
    if(k==='_meta') continue;
    const c = qs[k];
    if(c && c.current && c.current.fullSequence && c.current.fullSequence.length > 0) {
      found++;
      if(found <= 3) {
        console.log('KEY:', k);
        console.log('  desc:', c.description);
        console.log('  len:', c.current.length);
        console.log('  fs count:', c.current.fullSequence.length);
        console.log('  fs[0]:', JSON.stringify(c.current.fullSequence[0]));
        console.log('  fs last:', JSON.stringify(c.current.fullSequence[c.current.fullSequence.length-1]));
      }
    }
    if(c && c.current && (!c.current.fullSequence || c.current.fullSequence.length === 0)) {
      empty++;
      if(empty <= 3) {
        console.log('EMPTY KEY:', k, 'currentKeys:', Object.keys(c.current));
      }
    }
  }
  console.log('Total with FS:', found, 'Empty FS:', empty);
  process.exit(0);
}
test().catch(e => { console.error(e); process.exit(1); });
