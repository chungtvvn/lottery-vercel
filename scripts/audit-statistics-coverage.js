require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {
    ALL_3_DIGIT_GROUPS,
    CONSECUTIVE_TONG_TT_3_VALUE_CATEGORIES,
    VALID_TONG_TT_3_VALUE_GROUPS,
    CONSECUTIVE_TONG_MOI_3_VALUE_CATEGORIES,
    VALID_TONG_MOI_3_VALUE_GROUPS,
    CONSECUTIVE_HIEU_3_VALUE_CATEGORIES,
    VALID_HIEU_3_VALUE_GROUPS,
    buildPermutations,
    withOrderedPermutationCategory
} = require('../lib/utils/numberAnalysis');
const { isInvalidStatsKey, loadStatsOptions } = require('../lib/utils/statsOptionsManifest');
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
    const addOrderedPermutations = (category, values) => {
        for (const permutation of buildPermutations(values)) {
            add(withOrderedPermutationCategory(category, permutation), ['veTheoThuTu', 'veSoLeTheoThuTu', 'veSoLeTheoThuTuTien', 'veSoLeTheoThuTuLui']);
        }
    };
    const cyclicWindowValues = (category, prefix, min, max) => {
        const [start] = category.replace(prefix, '').split('_').map(Number);
        const values = [start];
        let current = start;
        while (values.length < 3) {
            current += 1;
            if (current > max) current = min;
            values.push(current);
        }
        return values;
    };
    const digitSubs = ['veLienTiep', 'veSole', 'veSoleMoi', 'tienLuiSoLe', 'luiTienSoLe', 'tienLienTiep', 'tienDeuLienTiep', 'luiLienTiep', 'luiDeuLienTiep'];
    const metricSubs = ['veLienTiep', 'veSole', 'veSoleMoi', 'tienLienTiep', 'tienDeuLienTiep', 'luiLienTiep', 'luiDeuLienTiep', 'tienLuiSoLe', 'luiTienSoLe'];

    for (const group of ALL_3_DIGIT_GROUPS) {
        const suffix = group.join('_');
        add(`dau_3d_${suffix}`, digitSubs);
        add(`dit_3d_${suffix}`, digitSubs);
        addOrderedPermutations(`dau_3d_${suffix}`, group);
        addOrderedPermutations(`dit_3d_${suffix}`, group);
    }
    for (const category of CONSECUTIVE_TONG_TT_3_VALUE_CATEGORIES) {
        add(category, metricSubs);
        addOrderedPermutations(category, cyclicWindowValues(category, 'tong_tt_', 1, 10));
    }
    for (const group of VALID_TONG_TT_3_VALUE_GROUPS) {
        const category = `tong_tt_${group.join('_')}`;
        add(category, metricSubs);
        addOrderedPermutations(category, group);
    }
    for (const category of CONSECUTIVE_TONG_MOI_3_VALUE_CATEGORIES) {
        add(category, metricSubs);
        addOrderedPermutations(category, cyclicWindowValues(category, 'tong_moi_', 0, 18));
    }
    for (const group of VALID_TONG_MOI_3_VALUE_GROUPS) {
        const category = `tong_moi_${group.join('_')}`;
        add(category, metricSubs);
        addOrderedPermutations(category, group);
    }
    for (const category of CONSECUTIVE_HIEU_3_VALUE_CATEGORIES) {
        add(category, metricSubs);
        addOrderedPermutations(category, cyclicWindowValues(category, 'hieu_', 0, 9));
    }
    for (const group of VALID_HIEU_3_VALUE_GROUPS) {
        const category = `hieu_${group.join('_')}`;
        add(category, metricSubs);
        addOrderedPermutations(category, group);
    }

    return keys.filter(key => !isInvalidStatsKey(key));
}

function requiredOrderedOptionKeys() {
    const { keys } = loadStatsOptions();
    return keys.filter(key =>
        key.endsWith(':veTheoThuTu') ||
        key.endsWith(':veSoLeTheoThuTu') ||
        key.endsWith(':veSoLeTheoThuTuTien') ||
        key.endsWith(':veSoLeTheoThuTuLui')
    );
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

function reportMissingOrdered(label, actualKeys, requiredKeys) {
    if (!actualKeys) return 0;
    const missing = requiredKeys.filter(key => !actualKeys.has(key));
    console.log(`[Audit] ${label}: thiếu ${missing.length}/${requiredKeys.length} pattern về theo thứ tự / so le theo thứ tự.`);
    if (missing.length > 0) {
        console.log(`[Audit] ${label} ordered missing sample: ${missing.slice(0, 20).join(', ')}`);
    }
    return missing.length;
}

async function main() {
    const requiredKeys = requiredCoverageKeys();
    const orderedKeys = requiredOrderedOptionKeys();
    console.log('[Audit] Expected group counts:', {
        headTail3DigitGroups: ALL_3_DIGIT_GROUPS.length,
        tongTt3ValueGroups: VALID_TONG_TT_3_VALUE_GROUPS.length,
        tongMoi3ValueGroups: VALID_TONG_MOI_3_VALUE_GROUPS.length,
        hieu3ValueGroups: VALID_HIEU_3_VALUE_GROUPS.length,
        requiredPatternKeys: requiredKeys.length,
        requiredOrderedPatternKeys: orderedKeys.length
    });

    const localKeys = readLocalStatsKeys();
    const r2Keys = await readR2StatsKeys();
    const dbKeys = await readSupabaseStatsKeys();

    const missingCounts = [
        reportMissing('Local JSON', localKeys, requiredKeys),
        reportMissing('Cloudflare R2', r2Keys, requiredKeys),
        reportMissing('Supabase DB', dbKeys, requiredKeys),
        reportMissingOrdered('Local JSON', localKeys, orderedKeys),
        reportMissingOrdered('Cloudflare R2', r2Keys, orderedKeys),
        reportMissingOrdered('Supabase DB', dbKeys, orderedKeys)
    ];

    if (missingCounts.some(count => count > 0)) {
        process.exitCode = 1;
    }
}

main().catch(error => {
    console.error('[Audit] Failed:', error.message);
    process.exit(1);
});
