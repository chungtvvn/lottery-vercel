require('dotenv').config({ path: '.env.local' });
const { getAdminClient } = require('./lib/supabase');
const fs = require('fs');

async function uploadChunks() {
    console.log('Splitting sum_diff stats...');
    const stats = JSON.parse(fs.readFileSync('/tmp/lottery_stats/sum_difference_stats.json', 'utf8'));
    
    const admin = getAdminClient();
    
    // Minify first
    let count = 0;
    for (const k in stats) {
        if (stats[k] && stats[k].streaks) {
            stats[k].streaks.forEach(s => { delete s.fullSequence; delete s.values; delete s.dates; });
            count++;
        } else if (typeof stats[k] === 'object') {
            for (const subKey in stats[k]) {
                if (stats[k][subKey] && stats[k][subKey].streaks) {
                    stats[k][subKey].streaks.forEach(s => { delete s.fullSequence; delete s.values; delete s.dates; });
                    count++;
                }
            }
        }
    }
    
    const entries = Object.entries(stats);
    // Vercel / Supabase has 1MB payload limits (jsonb row limit is theoretically 1GB but transit limits apply)
    // We will chunk it into 10 smaller objects
    const CHUNK_SIZE = 10;
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
    
    console.log(`Uploading ${items.length} chunks...`);
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
