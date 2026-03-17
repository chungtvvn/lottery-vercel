require('dotenv').config({ path: '.env.local' });
const { getAdminClient } = require('./lib/supabase');
const fs = require('fs');

async function testJsonb() {
    const stats = JSON.parse(fs.readFileSync('/tmp/lottery_stats/sum_difference_stats.json', 'utf8'));
    
    console.log('Original size test:', JSON.stringify(stats).length);
    let count = 0;
    function traverse(obj) {
      for (const k in obj) {
        if (obj[k] && typeof obj[k] === 'object') {
          if (Array.isArray(obj[k])) {
            if (k === 'streaks') {
              obj[k].forEach(s => {
                delete s.fullSequence; delete s.values; delete s.dates;
              });
            }
          } else {
            traverse(obj[k]);
          }
        }
      }
    }
    traverse(stats);
    
    const strShrunk = JSON.stringify(stats);
    console.log('Shrunk size:', strShrunk.length);
    
    console.log('Uploading Shrunk as test_jsonb_shrunk...');
    const t0 = Date.now();
    const { error } = await getAdminClient().from('cache_store').upsert({ key: 'test_jsonb_shrunk', data: stats });
    console.log('Done Shrunk:', Date.now() - t0, 'ms', error);
}
testJsonb();
