require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const {
    hasSupabaseAdminConfig,
    getSupabaseAdminClient
} = require('../lib/supabase/client');

const PRIZE_FIELDS = [
    'special',
    'prize1',
    'prize2_1', 'prize2_2',
    'prize3_1', 'prize3_2', 'prize3_3', 'prize3_4', 'prize3_5', 'prize3_6',
    'prize4_1', 'prize4_2', 'prize4_3', 'prize4_4',
    'prize5_1', 'prize5_2', 'prize5_3', 'prize5_4', 'prize5_5', 'prize5_6',
    'prize6_1', 'prize6_2', 'prize6_3',
    'prize7_1', 'prize7_2', 'prize7_3', 'prize7_4'
];

function toDateOnly(value) {
    if (!value) return null;
    if (typeof value === 'string' && value.includes('/')) {
        const [day, month, year] = value.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    return String(value).slice(0, 10);
}

function toRow(item) {
    const row = { draw_date: toDateOnly(item.date) };
    for (const field of PRIZE_FIELDS) {
        const value = item[field];
        row[field] = value === null || value === undefined || value === '' ? null : Number(value);
    }
    return row;
}

function logError(error) {
    console.error('[Supabase] Seed failed:', error.message);
    if (error.cause && error.cause.message) {
        console.error('[Supabase] Cause:', error.cause.message);
    }
    console.error('[Supabase] Verify schema was applied and service role env is correct.');
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
    const limit = limitArg ? Number(limitArg.split('=')[1]) : null;

    const inputPath = path.join(process.cwd(), 'lib', 'data', 'xsmb-2-digits.json');
    const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const rows = raw.slice(0, limit || raw.length).map(toRow).filter(row => row.draw_date);

    console.log(`[Supabase] Prepared ${rows.length} lottery_results rows from ${inputPath}`);

    if (dryRun) {
        console.log('[Supabase] Dry run only. First row:', rows[0]);
        console.log('[Supabase] Last row:', rows[rows.length - 1]);
        return;
    }

    if (!hasSupabaseAdminConfig()) {
        throw new Error('Missing Supabase admin env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.');
    }

    const supabase = getSupabaseAdminClient();
    const batchSize = 500;

    for (let index = 0; index < rows.length; index += batchSize) {
        const batch = rows.slice(index, index + batchSize);
        const { error } = await supabase
            .from('lottery_results')
            .upsert(batch, { onConflict: 'draw_date' });

        if (error) throw error;
        console.log(`[Supabase] Upserted ${Math.min(index + batch.length, rows.length)}/${rows.length}`);
    }

    const { count, error } = await supabase
        .from('lottery_results')
        .select('draw_date', { count: 'exact', head: true });

    if (error) throw error;
    console.log(`[Supabase] Seed completed. lottery_results rows: ${count ?? 0}`);
}

main().catch(error => {
    logError(error);
    process.exit(1);
});
