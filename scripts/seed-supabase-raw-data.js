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

function rowsEqual(a, b) {
    if (!a || !b) return false;
    if (String(a.draw_date || '').substring(0, 10) !== String(b.draw_date || '').substring(0, 10)) return false;
    return PRIZE_FIELDS.every(field => Number(a[field]) === Number(b[field]));
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
    const forceFull = process.argv.includes('--full') || process.env.SUPABASE_RAW_SEED_FULL === '1';
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
    let rowsToUpsert = rows;

    if (!forceFull) {
        const { data: latestRows, error: latestError } = await supabase
            .from('lottery_results')
            .select('*')
            .order('draw_date', { ascending: false })
            .limit(1);
        if (latestError) throw latestError;

        const { count, error: countError } = await supabase
            .from('lottery_results')
            .select('draw_date', { count: 'exact', head: true });
        if (countError) throw countError;

        const latestDbRow = latestRows && latestRows[0] ? latestRows[0] : null;
        const latestDbDate = latestDbRow ? String(latestDbRow.draw_date).substring(0, 10) : null;
        const shouldBackfill = latestDbDate && Number(count || 0) < rows.length - 7;

        if (!latestDbDate || shouldBackfill) {
            rowsToUpsert = rows;
            if (shouldBackfill) {
                console.log(`[Supabase] DB thiếu nhiều dòng (${count}/${rows.length}), chạy full seed để backfill.`);
            }
        } else {
            const latestIndex = rows.findIndex(row => row.draw_date === latestDbDate);
            if (latestIndex === -1) {
                rowsToUpsert = rows.slice(-7);
                console.log(`[Supabase] Không tìm thấy latest DB date ${latestDbDate} trong local, chỉ upsert 7 dòng cuối để tránh ghi lại toàn bộ.`);
            } else {
                rowsToUpsert = rows.slice(latestIndex);
                if (rowsToUpsert.length === 1 && rowsEqual(rowsToUpsert[0], latestDbRow)) {
                    rowsToUpsert = [];
                }
            }
            console.log(`[Supabase] Delta raw seed: DB latest=${latestDbDate}, local latest=${rows[rows.length - 1].draw_date}, upsert=${rowsToUpsert.length}/${rows.length}`);
        }
    } else {
        console.log('[Supabase] SUPABASE_RAW_SEED_FULL=1/--full, upsert toàn bộ raw data.');
    }

    if (rowsToUpsert.length === 0) {
        console.log('[Supabase] Raw data không đổi, bỏ qua upsert lottery_results.');
        return;
    }

    const batchSize = 500;

    for (let index = 0; index < rowsToUpsert.length; index += batchSize) {
        const batch = rowsToUpsert.slice(index, index + batchSize);
        const { error } = await supabase
            .from('lottery_results')
            .upsert(batch, { onConflict: 'draw_date' });

        if (error) throw error;
        console.log(`[Supabase] Upserted ${Math.min(index + batch.length, rowsToUpsert.length)}/${rowsToUpsert.length}`);
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
