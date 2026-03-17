/**
 * initial-upload.js
 * Upload toàn bộ dữ liệu hiện có lên Supabase lần đầu tiên
 * 
 * Chạy: SUPABASE_URL=xxx SUPABASE_SERVICE_KEY=xxx node scripts/initial-upload.js
 */
require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const path = require('path');
const { getAdminClient } = require('../lib/supabase');

const OLD_PROJECT = path.join(__dirname, '..', '..', 'lottery-stats');

async function main() {
    const admin = getAdminClient();
    console.log('=== INITIAL DATA UPLOAD TO SUPABASE ===\n');

    // =========== Step 1: Upload raw lottery data ===========
    console.log('[Step 1] Uploading raw lottery data...');
    const rawData = JSON.parse(fs.readFileSync(path.join(OLD_PROJECT, 'data', 'xsmb-2-digits.json'), 'utf8'));
    
    const rows = rawData.filter(r => r.special !== null && r.special !== undefined).map(r => {
        const d = new Date(r.date);
        return {
            draw_date: d.toISOString().split('T')[0],
            special: r.special,
            prize1: r.prize1,
            prize2_1: r.prize2_1, prize2_2: r.prize2_2,
            prize3_1: r.prize3_1, prize3_2: r.prize3_2, prize3_3: r.prize3_3,
            prize3_4: r.prize3_4, prize3_5: r.prize3_5, prize3_6: r.prize3_6,
            prize4_1: r.prize4_1, prize4_2: r.prize4_2, prize4_3: r.prize4_3, prize4_4: r.prize4_4,
            prize5_1: r.prize5_1, prize5_2: r.prize5_2, prize5_3: r.prize5_3,
            prize5_4: r.prize5_4, prize5_5: r.prize5_5, prize5_6: r.prize5_6,
            prize6_1: r.prize6_1, prize6_2: r.prize6_2, prize6_3: r.prize6_3,
            prize7_1: r.prize7_1, prize7_2: r.prize7_2, prize7_3: r.prize7_3, prize7_4: r.prize7_4
        };
    });

    // Upsert in batches of 500
    for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error } = await admin
            .from('lottery_results')
            .upsert(batch, { onConflict: 'draw_date' });

        if (error) {
            console.error(`Error at batch ${i}:`, error.message);
            return;
        }
        process.stdout.write(`\r  Uploaded ${Math.min(i + 500, rows.length)}/${rows.length} rows`);
    }
    console.log('\n  ✅ Raw data uploaded');

    // =========== Step 2: Create storage bucket ===========
    console.log('\n[Step 2] Setting up storage bucket...');
    try {
        await admin.storage.createBucket('stats', { public: true });
        console.log('  ✅ Created bucket "stats"');
    } catch (e) {
        console.log('  ℹ️ Bucket "stats" already exists');
    }

    // =========== Step 3: Upload split stats files ===========
    const statsFiles = [
        { file: 'head_tail_stats.json', prefix: 'head_tail' },
        { file: 'sum_difference_stats.json', prefix: 'sum_diff' },
        { file: 'number_stats.json', prefix: 'number' }
    ];

    for (const { file, prefix } of statsFiles) {
        console.log(`\n[Step 3] Uploading ${file} by category...`);
        const statsPath = path.join(OLD_PROJECT, 'data', 'statistics', file);
        
        if (!fs.existsSync(statsPath)) {
            console.log(`  ⚠️ File not found: ${statsPath}`);
            continue;
        }

        const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
        const categories = Object.keys(stats);
        let uploaded = 0;

        for (const category of categories) {
            const content = JSON.stringify(stats[category]);
            const filePath = `${prefix}/${category}.json`;

            const { error } = await admin.storage
                .from('stats')
                .upload(filePath, content, {
                    contentType: 'application/json',
                    upsert: true
                });

            if (error) {
                console.error(`  ❌ Error uploading ${filePath}:`, error.message);
            }
            uploaded++;
            process.stdout.write(`\r  Uploaded ${uploaded}/${categories.length} categories`);
        }
        console.log(`\n  ✅ ${file}: ${categories.length} categories uploaded`);
    }

    // =========== Step 4: Upload predictions (if any) ===========
    console.log('\n[Step 4] Uploading predictions...');
    const predictionsPath = path.join(OLD_PROJECT, 'data', 'predictions.json');
    if (fs.existsSync(predictionsPath)) {
        const predictions = JSON.parse(fs.readFileSync(predictionsPath, 'utf8'));
        if (predictions.length > 0) {
            // Lưu tối đa 50 predictions gần nhất
            const recent = predictions.slice(-50);
            for (const pred of recent) {
                const d = pred.date || pred.targetDate || new Date().toISOString().split('T')[0];
                const { error } = await admin
                    .from('predictions')
                    .upsert({
                        prediction_date: d,
                        data: pred
                    }, { onConflict: 'prediction_date' });

                if (error) console.error(`  Error saving prediction:`, error.message);
            }
            console.log(`  ✅ Uploaded ${recent.length} predictions`);
        }
    } else {
        console.log('  ℹ️ No predictions file found');
    }

    console.log('\n=== INITIAL UPLOAD COMPLETE ===');
    console.log('Next step: Run the daily-update.js to pre-compute quick stats cache');
}

main().catch(console.error);
