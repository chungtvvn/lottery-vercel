require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {
    VALID_3_DIGIT_GROUPS,
    VALID_TONG_TT_3_VALUE_GROUPS,
    VALID_TONG_MOI_3_VALUE_GROUPS,
    VALID_HIEU_3_VALUE_GROUPS
} = require('../lib/utils/numberAnalysis');
const { hasSupabaseAdminConfig, getSupabaseAdminClient } = require('../lib/supabase/client');

const STATS_DIR = path.join(__dirname, '..', 'lib', 'data', 'statistics');
const STAT_FILES = ['number_stats.json', 'head_tail_stats.json', 'sum_difference_stats.json'];

function flattenStatsKeys(stats) {
    const keys = new Set();
    for (const [category, value] of Object.entries(stats || {})) {
        if (value && Array.isArray(value.streaks)) {
            keys.add(category);
        } else if (value && typeof value === 'object') {
            for (const [subcategory, subvalue] of Object.entries(value)) {
                if (subvalue && Array.isArray(subvalue.streaks)) {
                    keys.add(`${category}:${subcategory}`);
                }
            }
        }
    }
    return keys;
}

function readLocalStatsKeys() {
    if (process.env.AUDIT_LOCAL === '0') return null;
    const keys = new Set();
    for (const file of STAT_FILES) {
        const filePath = path.join(STATS_DIR, file);
        if (!fs.existsSync(filePath)) continue;
        const stats = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        flattenStatsKeys(stats).forEach(key => keys.add(key));
    }
    return keys;
}

async function readR2StatsKeys() {
    const baseUrl = String(process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL || process.env.CLOUDFLARE_R2_PUBLIC_URL || '').trim().replace(/\/$/, '');
    if (!baseUrl) return null;

    const keys = new Set();
    for (const file of STAT_FILES) {
        const response = await fetch(`${baseUrl}/statistics/${file}.gz`, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`R2 ${file} HTTP ${response.status}`);
        }
        const compressed = Buffer.from(await response.arrayBuffer());
        const stats = JSON.parse(zlib.gunzipSync(compressed).toString('utf8'));
        flattenStatsKeys(stats).forEach(key => keys.add(key));
    }
    return keys;
}

async function readSupabaseStatsKeys() {
    if (process.env.AUDIT_SUPABASE !== '1') return null;
    if (!hasSupabaseAdminConfig()) return null;
    const supabase = getSupabaseAdminClient();
    const keys = new Set();
    const pageSize = 1000;

    for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
            .from('streak_statistics')
            .select('pattern_key')
            .order('pattern_key', { ascending: true })
            .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        data.forEach(row => row.pattern_key && keys.add(row.pattern_key));
        if (data.length < pageSize) break;
    }

    return keys;
}

function requiredCoverageKeys() {
    const keys = [];
    const add = (category, subcategories) => subcategories.forEach(sub => keys.push(`${category}:${sub}`));
    const digitSubs = ['veLienTiep', 'veSole', 'veSoleMoi', 'tienLuiSoLe', 'luiTienSoLe', 'veTheoThuTu', 'veSoLeTheoThuTu', 'tienLienTiep', 'tienDeuLienTiep', 'luiLienTiep', 'luiDeuLienTiep'];
    const metricSubs = ['veLienTiep', 'veSole', 'veSoleMoi', 'veTheoThuTu', 'veSoLeTheoThuTu', 'tienLienTiep', 'tienDeuLienTiep', 'luiLienTiep', 'luiDeuLienTiep', 'tienLuiSoLe', 'luiTienSoLe'];

    for (const group of VALID_3_DIGIT_GROUPS) {
        const suffix = group.join('_');
        add(`dau_3d_${suffix}`, digitSubs);
        add(`dit_3d_${suffix}`, digitSubs);
    }
    for (const group of VALID_TONG_TT_3_VALUE_GROUPS) add(`tong_tt_${group.join('_')}`, metricSubs);
    for (const group of VALID_TONG_MOI_3_VALUE_GROUPS) add(`tong_moi_${group.join('_')}`, metricSubs);
    for (const group of VALID_HIEU_3_VALUE_GROUPS) add(`hieu_${group.join('_')}`, metricSubs);

    return keys;
}

function reportMissing(label, actualKeys, requiredKeys) {
    if (!actualKeys) {
        console.log(`[Audit] ${label}: bỏ qua vì chưa cấu hình.`);
        return 0;
    }
    const missing = requiredKeys.filter(key => !actualKeys.has(key));
    console.log(`[Audit] ${label}: ${actualKeys.size} pattern, thiếu ${missing.length}/${requiredKeys.length} pattern nhóm 3 giá trị cố định.`);
    if (missing.length > 0) {
        console.log(`[Audit] ${label} missing sample: ${missing.slice(0, 20).join(', ')}`);
    }
    return missing.length;
}

async function main() {
    const requiredKeys = requiredCoverageKeys();
    console.log('[Audit] Expected group counts:', {
        headTail3DigitGroups: VALID_3_DIGIT_GROUPS.length,
        tongTt3ValueGroups: VALID_TONG_TT_3_VALUE_GROUPS.length,
        tongMoi3ValueGroups: VALID_TONG_MOI_3_VALUE_GROUPS.length,
        hieu3ValueGroups: VALID_HIEU_3_VALUE_GROUPS.length,
        requiredPatternKeys: requiredKeys.length
    });

    const localKeys = readLocalStatsKeys();
    const r2Keys = await readR2StatsKeys();
    const dbKeys = await readSupabaseStatsKeys();

    const missingCounts = [
        reportMissing('Local JSON', localKeys, requiredKeys),
        reportMissing('Cloudflare R2', r2Keys, requiredKeys),
        reportMissing('Supabase DB', dbKeys, requiredKeys)
    ];

    if (missingCounts.some(count => count > 0)) {
        process.exitCode = 1;
    }
}

main().catch(error => {
    console.error('[Audit] Failed:', error.message);
    process.exit(1);
});
