require('dotenv').config({ path: '.env.local' });
const { getAdminClient } = require('./lib/supabase');
const fs = require('fs');
async function uploadChunks() {
    console.log('Tuple splitting sum_diff stats...');
    const stats = JSON.parse(fs.readFileSync('/tmp/lottery_stats/sum_difference_stats.json', 'utf8'));
    const admin = getAdminClient();
    
    // Convert streaks to tiny tuples `[startDate, endDate, length]`
    for (const k in stats) {
        if (stats[k] && stats[k].streaks) {
            stats[k].streaks = stats[k].streaks.map(s => [s.startDate, s.endDate, s.length]);
        } else if (typeof stats[k] === 'object') {
            for (const subKey in stats[k]) {
                if (stats[k][subKey] && stats[k][subKey].streaks) {
                    stats[k][subKey].streaks = stats[k][subKey].streaks.map(s => [s.startDate, s.endDate, s.length]);
                }
            }
        }
    }
    
    // Now it's ~4MB total for sum_diff. We chunk it into 5 parts.
    const entries = Object.entries(stats);
    const CHUNK_SIZE = Math.ceil(entries.length / 5);
    const items = [];
    
    for(let i=0; i<entries.length; i+=CHUNK_SIZE) {
        const c = entries.slice(i, i+CHUNK_SIZE);
        const chunkObj = {};
        c.forEach(([k,v]) => chunkObj[k] = v);
        
        items.push({
            key: `stats_chunk_sum_diff_${Math.floor(i/CHUNK_SIZE)}`,
            data: chunkObj,
            updated_at: new Date().toISOString()
        });
    }
    
    console.log(`Uploading ${items.length} chunks of ~800KB each...`);
    for (let i = 0; i < items.length; i++) {
        const {error} = await admin.from('cache_store').upsert(items[i], { onConflict: 'key' });
        console.log(`Chunk ${i}:`, error ? error.message : 'OK');
    }
    
    // Write an index row
    await admin.from('cache_store').upsert({
        key: `stats_index_sum_diff`,
        data: { chunks: items.length },
        updated_at: new Date().toISOString()
    }, { onConflict: 'key' });
    
    console.log('Done!');
}
uploadChunks();
