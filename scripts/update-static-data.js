require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const { fetchLatestXsmbResult, XOSO_HOME_URL, XOSO_SOURCE_URLS } = require('./sources/xoso-com-vn');
const { isInvalidStatsKey } = require('../lib/utils/statsOptionsManifest');

const LEGACY_DATA_URL = 'https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/refs/heads/main/data/xsmb-2-digits.json';
const DATA_DIR = path.join(__dirname, '..', 'lib', 'data');
const JSON_FILE = path.join(DATA_DIR, 'xsmb-2-digits.json');
const WAIT_FOR_NEW_XOSO = process.env.WAIT_FOR_NEW_XOSO === '1';
const XOSO_MAX_WAIT_MINUTES = readNumberEnv('XOSO_MAX_WAIT_MINUTES', WAIT_FOR_NEW_XOSO ? 90 : 0, 0);
const XOSO_RETRY_INTERVAL_SECONDS = readNumberEnv('XOSO_RETRY_INTERVAL_SECONDS', 60, 5);
const LOTO_STAKE_PER_NUMBER_K = 2300;
const LOTO_PAYOUT_PER_HIT_K = 8000;
const LOTO_METHOD_ID = process.env.LOTO_METHOD_ID || 'dedupDropoffHold60';
const LOTO_BET_COUNTS = [3, 4, 5, 6, 7];

function readNumberEnv(name, fallback, minValue) {
    const parsed = Number(process.env[name]);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(minValue, parsed);
}

function getSimulationCacheDays() {
    const values = String(process.env.SIMULATION_CACHE_DAYS || '90')
        .split(',')
        .map(value => Number(value.trim()))
        .filter(value => Number.isFinite(value) && value >= 7 && value <= 365);
    return values.length > 0 ? [...new Set(values)] : [90];
}

function getSimulationCachePlayModes() {
    const values = String(process.env.SIMULATION_CACHE_PLAY_MODES || 'both')
        .split(',')
        .map(value => value.trim().toLowerCase())
        .filter(value => ['both', 'bet', 'hold'].includes(value));
    return values.length > 0 ? [...new Set(values)] : ['both'];
}

async function readJsonIfExists(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch (e) {
        return null;
    }
}

function getLatestDateValue(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const latest = rows[rows.length - 1];
    return latest && latest.date ? String(latest.date).substring(0, 10) : null;
}

function normalizeDateValue(value) {
    if (!value) return null;
    const text = String(value).trim();
    const ddmmyyyy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyy) {
        return `${ddmmyyyy[3]}-${String(ddmmyyyy[2]).padStart(2, '0')}-${String(ddmmyyyy[1]).padStart(2, '0')}`;
    }
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
}

function isLotoPredictionFormulaCurrent(cache) {
    const config = cache?.config || cache?.livePredictions?.config || {};
    const stake = Number(config.stakePerNumberK);
    const payout = Number(config.payoutPerHitK);
    const methodId = String(config.methodId || cache?.nextPrediction?.methodId || '');
    const betCounts = Array.isArray(config.betCounts) ? config.betCounts.map(Number) : [];
    const betCountsOk = betCounts.length === LOTO_BET_COUNTS.length
        && LOTO_BET_COUNTS.every((count, index) => count === betCounts[index]);
    return stake === LOTO_STAKE_PER_NUMBER_K
        && payout === LOTO_PAYOUT_PER_HIT_K
        && methodId === LOTO_METHOD_ID
        && betCountsOk;
}

function hasRawDataChanged(currentRows, nextRows) {
    if (!Array.isArray(currentRows) || !Array.isArray(nextRows)) return true;
    if (currentRows.length !== nextRows.length) return true;

    const currentLatest = getLatestDateValue(currentRows);
    const nextLatest = getLatestDateValue(nextRows);
    if (currentLatest !== nextLatest) return true;

    const currentLast = currentRows[currentRows.length - 1] || {};
    const nextLast = nextRows[nextRows.length - 1] || {};
    return JSON.stringify(normalizeDataRow(currentLast)) !== JSON.stringify(normalizeDataRow(nextLast));
}

async function downloadData() {
    return new Promise((resolve, reject) => {
        https.get(LEGACY_DATA_URL, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error('Failed to fetch data: ' + res.statusCode));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function normalizeDataRow(row) {
    return {
        date: String(row.date || '').substring(0, 10),
        special: Number(row.special),
        prize1: Number(row.prize1),
        prize2_1: Number(row.prize2_1),
        prize2_2: Number(row.prize2_2),
        prize3_1: Number(row.prize3_1),
        prize3_2: Number(row.prize3_2),
        prize3_3: Number(row.prize3_3),
        prize3_4: Number(row.prize3_4),
        prize3_5: Number(row.prize3_5),
        prize3_6: Number(row.prize3_6),
        prize4_1: Number(row.prize4_1),
        prize4_2: Number(row.prize4_2),
        prize4_3: Number(row.prize4_3),
        prize4_4: Number(row.prize4_4),
        prize5_1: Number(row.prize5_1),
        prize5_2: Number(row.prize5_2),
        prize5_3: Number(row.prize5_3),
        prize5_4: Number(row.prize5_4),
        prize5_5: Number(row.prize5_5),
        prize5_6: Number(row.prize5_6),
        prize6_1: Number(row.prize6_1),
        prize6_2: Number(row.prize6_2),
        prize6_3: Number(row.prize6_3),
        prize7_1: Number(row.prize7_1),
        prize7_2: Number(row.prize7_2),
        prize7_3: Number(row.prize7_3),
        prize7_4: Number(row.prize7_4)
    };
}

function sortRowsByDate(rows) {
    return [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function daysBetweenDates(fromDate, toDate) {
    if (!fromDate || !toDate) return 0;
    const from = new Date(`${fromDate}T00:00:00Z`);
    const to = new Date(`${toDate}T00:00:00Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
    return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function compareDateValues(a, b) {
    if (!a || !b) return 0;
    return String(a).substring(0, 10).localeCompare(String(b).substring(0, 10));
}

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

function hasRequiredLocalStatsCoverage() {
    if (process.env.SKIP_STATS_COVERAGE_CHECK === '1') return true;
    try {
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
        const fsSync = require('fs');
        const required = [];
        const add = (category, subcategories) => subcategories.forEach(sub => required.push(`${category}:${sub}`));
        const addOrderedPermutations = (category, values) => {
            for (const permutation of buildPermutations(values)) {
                const orderedCategory = withOrderedPermutationCategory(category, permutation);
                add(orderedCategory, ['veTheoThuTu', 'veSoLeTheoThuTu', 'veSoLeTheoThuTuTien', 'veSoLeTheoThuTuLui']);
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
            const values = cyclicWindowValues(category, 'tong_tt_', 1, 10);
            add(category, metricSubs);
            addOrderedPermutations(category, values);
        }
        for (const group of VALID_TONG_TT_3_VALUE_GROUPS) {
            const category = `tong_tt_${group.join('_')}`;
            add(category, metricSubs);
            addOrderedPermutations(category, group);
        }
        for (const category of CONSECUTIVE_TONG_MOI_3_VALUE_CATEGORIES) {
            const values = cyclicWindowValues(category, 'tong_moi_', 0, 18);
            add(category, metricSubs);
            addOrderedPermutations(category, values);
        }
        for (const group of VALID_TONG_MOI_3_VALUE_GROUPS) {
            const category = `tong_moi_${group.join('_')}`;
            add(category, metricSubs);
            addOrderedPermutations(category, group);
        }
        for (const category of CONSECUTIVE_HIEU_3_VALUE_CATEGORIES) {
            const values = cyclicWindowValues(category, 'hieu_', 0, 9);
            add(category, metricSubs);
            addOrderedPermutations(category, values);
        }
        for (const group of VALID_HIEU_3_VALUE_GROUPS) {
            const category = `hieu_${group.join('_')}`;
            add(category, metricSubs);
            addOrderedPermutations(category, group);
        }

        const actual = new Set();
        for (const file of ['number_stats.json', 'head_tail_stats.json', 'sum_difference_stats.json']) {
            const filePath = path.join(DATA_DIR, 'statistics', file);
            if (!fsSync.existsSync(filePath)) return false;
            const stats = JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
            flattenStatsKeys(stats).forEach(key => actual.add(key));
        }

        const missingCount = required.reduce((count, key) => count + (actual.has(key) ? 0 : 1), 0);
        if (missingCount > 0) {
            console.log(`[Cache Check] Stats coverage missing ${missingCount}/${required.length} required fixed 3-value patterns. Forcing stats generation.`);
            return false;
        }
        return true;
    } catch (error) {
        console.warn(`[Cache Check] Không kiểm tra được stats coverage, sẽ sinh lại để an toàn: ${error.message}`);
        return false;
    }
}

function getVietnamTodayDate(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function hasSupabaseEnv() {
    return Boolean(
        (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)
        && process.env.SUPABASE_SERVICE_ROLE_KEY
    );
}

function getR2PublicUrl() {
    return String(process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL || process.env.CLOUDFLARE_R2_PUBLIC_URL || '').trim().replace(/\/$/, '');
}

async function readJsonFromR2(fileName, prefix = process.env.CLOUDFLARE_R2_DATA_PREFIX || 'data') {
    const baseUrl = getR2PublicUrl();
    if (!baseUrl) return null;
    const normalizedPrefix = String(prefix || '').replace(/^\/|\/$/g, '');
    const response = await fetch(`${baseUrl}/${normalizedPrefix}/${fileName}.gz`, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`R2 HTTP ${response.status} for ${normalizedPrefix}/${fileName}.gz`);
    }
    const compressed = Buffer.from(await response.arrayBuffer());
    return JSON.parse(zlib.gunzipSync(compressed).toString('utf8'));
}

async function readStatsJsonFromR2(fileName) {
    return readJsonFromR2(fileName, process.env.CLOUDFLARE_R2_STATS_PREFIX || 'statistics');
}

function shouldReadCurrentRawFromSupabase() {
    if (process.env.UPDATE_READ_SUPABASE_RAW !== '1') return false;
    if (!hasSupabaseEnv()) return false;
    const statsMode = String(process.env.LOTTERY_STATS_SOURCE || '').trim().toLowerCase();
    return statsMode === ''
        || ['supabase', 'supabase-db', 'db'].includes(statsMode);
}

function mapSupabaseRawRow(row) {
    return normalizeDataRow({
        date: row.draw_date,
        special: row.special,
        prize1: row.prize1,
        prize2_1: row.prize2_1,
        prize2_2: row.prize2_2,
        prize3_1: row.prize3_1,
        prize3_2: row.prize3_2,
        prize3_3: row.prize3_3,
        prize3_4: row.prize3_4,
        prize3_5: row.prize3_5,
        prize3_6: row.prize3_6,
        prize4_1: row.prize4_1,
        prize4_2: row.prize4_2,
        prize4_3: row.prize4_3,
        prize4_4: row.prize4_4,
        prize5_1: row.prize5_1,
        prize5_2: row.prize5_2,
        prize5_3: row.prize5_3,
        prize5_4: row.prize5_4,
        prize5_5: row.prize5_5,
        prize5_6: row.prize5_6,
        prize6_1: row.prize6_1,
        prize6_2: row.prize6_2,
        prize6_3: row.prize6_3,
        prize7_1: row.prize7_1,
        prize7_2: row.prize7_2,
        prize7_3: row.prize7_3,
        prize7_4: row.prize7_4
    });
}

async function readCurrentRawData() {
    if (process.env.UPDATE_READ_R2_RAW !== '0') {
        try {
            const r2Rows = await readJsonFromR2('xsmb-2-digits.json');
            if (Array.isArray(r2Rows) && r2Rows.length > 0) {
                console.log(`[1] Đọc dữ liệu hiện tại từ Cloudflare R2: ${r2Rows.length} bản ghi, latest=${getLatestDateValue(r2Rows) || 'none'}`);
                return r2Rows.map(normalizeDataRow);
            }
        } catch (error) {
            console.warn(`[1] Không đọc được raw data từ R2, fallback nguồn tiếp theo: ${error.message}`);
        }
    }

    if (shouldReadCurrentRawFromSupabase()) {
        try {
            const { getSupabaseAdminClient } = require('../lib/supabase/client');
            const supabase = getSupabaseAdminClient();
            const rows = [];
            const pageSize = 1000;

            for (let from = 0; ; from += pageSize) {
                const to = from + pageSize - 1;
                const { data, error } = await supabase
                    .from('lottery_results')
                    .select('*')
                    .order('draw_date', { ascending: true })
                    .range(from, to);
                if (error) throw error;
                if (!data || data.length === 0) break;
                rows.push(...data.map(mapSupabaseRawRow));
                if (data.length < pageSize) break;
            }

            if (rows.length > 0) {
                console.log(`[1] Đọc dữ liệu hiện tại từ Supabase DB: ${rows.length} bản ghi, latest=${getLatestDateValue(rows) || 'none'}`);
                return rows;
            }
        } catch (error) {
            console.warn(`[1] Không đọc được raw data từ Supabase, fallback local JSON: ${error.message}`);
        }
    }

    const localRows = await readJsonIfExists(JSON_FILE);
    console.log(`[1] Đọc dữ liệu local: ${Array.isArray(localRows) ? localRows.length : 0} bản ghi, latest=${getLatestDateValue(localRows) || 'none'}`);
    return localRows;
}

let didEarlyR2Upload = false;

function runNodeScript(script, label, extraEnv = {}, options = {}) {
    console.log(`[6] ${label}`);
    const args = Array.isArray(script) ? script : [script];
    const result = spawnSync(process.execPath, args, {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        env: {
            ...process.env,
            ...extraEnv
        },
        timeout: options.timeoutMs || undefined
    });
    if (result.error) {
        if (result.error.code === 'ETIMEDOUT') {
            throw new Error(`${label} quá thời gian cho phép (${options.timeoutMs}ms)`);
        }
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`${label} thất bại với exit code ${result.status}`);
    }
}

function hasLotoPredictionCache(expectedLatestDate = null) {
    const fsSync = require('fs');
    const statsDir = path.join(DATA_DIR, 'statistics');
    const cachePath = path.join(statsDir, 'cached_loto_prediction.json');
    const livePath = path.join(statsDir, 'cached_loto_live_predictions.json');
    if (!fsSync.existsSync(cachePath) || !fsSync.existsSync(livePath)) return false;
    if (!expectedLatestDate) return true;

    try {
        const cache = JSON.parse(fsSync.readFileSync(cachePath, 'utf8'));
        const latest = normalizeDateValue(cache?.latestDataDate || cache?.nextPrediction?.dataIsoDate);
        if (latest === expectedLatestDate && isLotoPredictionFormulaCurrent(cache)) return true;
        if (!isLotoPredictionFormulaCurrent(cache)) {
            const config = cache?.config || {};
            console.log(`[Cache Check] Local Lô cache stale config: method=${config.methodId || cache?.nextPrediction?.methodId || 'unknown'}, betCounts=${(config.betCounts || []).join(',') || 'unknown'}, stake=${config.stakePerNumberK || 'unknown'}, payout=${config.payoutPerHitK || 'unknown'}, expected=${LOTO_METHOD_ID}/${LOTO_BET_COUNTS.join(',')}/${LOTO_STAKE_PER_NUMBER_K}/${LOTO_PAYOUT_PER_HIT_K}.`);
            return false;
        }
        console.log(`[Cache Check] Local Lô cache stale: latest=${latest || 'unknown'}, expected=${expectedLatestDate}.`);
        return false;
    } catch (error) {
        console.log(`[Cache Check] Local Lô cache unreadable: ${error.message}`);
        return false;
    }
}

async function hasLotoPredictionCacheOnR2(expectedLatestDate = null) {
    if (!getR2PublicUrl() || process.env.UPDATE_CHECK_R2_LOTO === '0') return true;
    try {
        const cache = await readStatsJsonFromR2('cached_loto_prediction.json');
        const live = await readStatsJsonFromR2('cached_loto_live_predictions.json');
        const cacheLatest = normalizeDateValue(cache && (cache.latestDataDate || cache.nextPrediction?.dataIsoDate));
        const liveLatest = normalizeDateValue(live && live.latestDataDate);
        if (!cache || !live) return false;
        if (!isLotoPredictionFormulaCurrent(cache)) {
            const config = cache?.config || {};
            console.log(`[Cache Check] R2 Lô cache stale config: method=${config.methodId || cache?.nextPrediction?.methodId || 'unknown'}, betCounts=${(config.betCounts || []).join(',') || 'unknown'}, stake=${config.stakePerNumberK || 'unknown'}, payout=${config.payoutPerHitK || 'unknown'}, expected=${LOTO_METHOD_ID}/${LOTO_BET_COUNTS.join(',')}/${LOTO_STAKE_PER_NUMBER_K}/${LOTO_PAYOUT_PER_HIT_K}.`);
            return false;
        }
        console.log(`[Cache Check] R2 Lô cache OK: cached_loto latest=${cacheLatest || 'unknown'}, live latest=${liveLatest || 'unknown'}.`);
        if (expectedLatestDate && cacheLatest !== expectedLatestDate) {
            console.log(`[Cache Check] R2 Lô cache stale: latest=${cacheLatest || 'unknown'}, expected=${expectedLatestDate}.`);
            return false;
        }
        return true;
    } catch (error) {
        console.log(`[Cache Check] R2 Lô cache missing/stale: ${error.message}`);
        return false;
    }
}

function generateLotoPredictionCache() {
    const skipBacktest = process.env.LOTO_SKIP_BACKTEST !== '0';
    const timeoutMs = Math.max(60_000, Number(process.env.LOTO_PREDICTION_TIMEOUT_MS || (skipBacktest ? 1_800_000 : 0)) || 0);
    runNodeScript([
        'scripts/backtest-loto-position-risk.js',
        `--months=${process.env.LOTO_CACHE_MONTHS || '1,3,6'}`,
        `--method=${LOTO_METHOD_ID}`,
        `--betCounts=${LOTO_BET_COUNTS.join(',')}`,
        `--stakeK=${LOTO_STAKE_PER_NUMBER_K}`,
        `--payoutK=${LOTO_PAYOUT_PER_HIT_K}`,
        '--writeCache=1',
        skipBacktest ? '--skipBacktest=1' : '--skipBacktest=0'
    ], skipBacktest
        ? 'Sinh/đối soát cache dự đoán Lô 27 vị trí cho API/tab Lô (không chạy backtest trong action).'
        : 'Sinh/đối soát cache dự đoán Lô 27 vị trí cho API/tab Lô + backtest tham khảo.', {
        NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=12288',
        BACKTEST_PROGRESS: process.env.BACKTEST_PROGRESS || '0'
    }, timeoutMs > 0 ? { timeoutMs } : {});
}

async function hydrateLotoLiveCacheFromR2() {
    if (!getR2PublicUrl()) return false;

    try {
        const remoteLive = await readStatsJsonFromR2('cached_loto_live_predictions.json');
        if (!remoteLive || !Array.isArray(remoteLive.predictions)) return false;

        const livePath = path.join(DATA_DIR, 'statistics', 'cached_loto_live_predictions.json');
        await fs.mkdir(path.dirname(livePath), { recursive: true });
        await fs.writeFile(livePath, JSON.stringify(remoteLive, null, 0), 'utf8');
        console.log(`[Lô] Hydrate ${remoteLive.predictions.length} bản ghi thực tế từ R2 trước khi kết toán.`);
        return true;
    } catch (error) {
        console.warn(`[Lô] Không hydrate được nhật ký R2, giữ dữ liệu local hiện có: ${error.message}`);
        return false;
    }
}

function uploadR2StaticData(label = 'Upload raw data + statistics gzip lên Cloudflare R2.', extraEnv = {}) {
    if (process.env.SYNC_R2_AFTER_UPDATE !== '0') {
        runNodeScript('scripts/upload-to-r2.js', label, extraEnv);
        console.log('[6] Upload R2 thành công.');
        return true;
    } else {
        console.log('[6] SYNC_R2_AFTER_UPDATE=0, bỏ qua upload R2.');
        return false;
    }
}

function syncRemoteAfterStaticGeneration() {
    if (didEarlyR2Upload) {
        console.log('[6] Đã upload R2 trước bước Lô; upload lại để đồng bộ cache Lô nếu vừa sinh thành công.');
    }
    uploadR2StaticData(didEarlyR2Upload
        ? 'Upload lại raw data + statistics gzip lên Cloudflare R2 sau bước Lô.'
        : 'Upload raw data + statistics gzip lên Cloudflare R2.');

    if (process.env.SYNC_SUPABASE_AFTER_UPDATE !== '1') {
        console.log('[6] Không sync Supabase (mặc định tắt). Set SYNC_SUPABASE_AFTER_UPDATE=1 nếu cần.');
        return;
    }
    if (!hasSupabaseEnv()) {
        console.log('[6] Không có Supabase env, bỏ qua sync Supabase.');
        return;
    }
    const statsMode = String(process.env.LOTTERY_STATS_SOURCE || '').trim().toLowerCase();
    const dbStatsMode = ['supabase', 'supabase-db', 'db'].includes(statsMode);
    const script = dbStatsMode ? 'scripts/seed-supabase-raw-data.js' : 'scripts/sync-supabase.js';
    const label = dbStatsMode
        ? 'Sync raw data lên Supabase; stats/cache đã được ghi trực tiếp vào DB.'
        : 'Sync raw data + statistics gzip lên Supabase.';

    runNodeScript(script, label, { LOTTERY_DATA_SOURCE: 'local' });
    console.log('[6] Sync Supabase thành công.');
}

function uploadOnlyLotoCaches() {
    uploadR2StaticData('Upload riêng cache Lô lên Cloudflare R2.', {
        R2_UPLOAD_ONLY_STATS_FILES: 'cached_loto_prediction.json,cached_loto_live_predictions.json'
    });
}

async function fetchLatestXsmbResultWithRetry(latestLocalDate) {
    const targetDate = process.env.XOSO_TARGET_DATE || getVietnamTodayDate();
    const shouldRequireTargetDate = WAIT_FOR_NEW_XOSO
        && latestLocalDate
        && compareDateValues(targetDate, latestLocalDate) > 0;
    const deadline = Date.now() + (XOSO_MAX_WAIT_MINUTES * 60 * 1000);
    let attempt = 0;
    let lastSeenDate = null;
    let lastError = null;

    while (true) {
        attempt += 1;

        try {
            const row = await fetchLatestXsmbResult();
            lastSeenDate = row.date;
            const meetsTargetDate = !shouldRequireTargetDate || compareDateValues(row.date, targetDate) >= 0;
            const isNewerThanLocal = !latestLocalDate || compareDateValues(row.date, latestLocalDate) > 0;

            if (isNewerThanLocal) {
                if (!meetsTargetDate) {
                    console.log(`[1b] Nguồn có dữ liệu mới hơn local (${latestLocalDate || 'none'} -> ${row.date}) dù chưa tới target=${targetDate}; dùng ngày mới nhất đang có.`);
                }
                console.log(`[1b] xoso.com.vn trả kết quả ngày ${row.date} từ ${row._sourceUrl || XOSO_HOME_URL} sau ${attempt} lần thử.`);
                return row;
            }

            if (meetsTargetDate && !shouldRequireTargetDate) {
                console.log(`[1b] xoso.com.vn trả kết quả ngày ${row.date} từ ${row._sourceUrl || XOSO_HOME_URL} sau ${attempt} lần thử.`);
                return row;
            }

            lastError = new Error(`Nguồn mới nhất là ${row.date}, local=${latestLocalDate}, cần >= ${targetDate}`);
            console.log(`[1b] Lần ${attempt}: ${lastError.message}. Sẽ thử lại.`);
        } catch (error) {
            lastError = error;
            console.warn(`[1b] Lần ${attempt}: chưa lấy được dữ liệu từ xoso.com.vn (${error.message}).`);
        }

        const remainingMs = deadline - Date.now();
        if (!WAIT_FOR_NEW_XOSO || !shouldRequireTargetDate || remainingMs <= 0) {
            if (shouldRequireTargetDate) {
                throw new Error(`Chưa lấy được kết quả XSMB mới ngày ${targetDate} sau ${XOSO_MAX_WAIT_MINUTES} phút. Latest source=${lastSeenDate || 'unknown'}. Lỗi cuối: ${lastError ? lastError.message : 'unknown'}`);
            }
            throw lastError;
        }

        const waitMs = Math.min(XOSO_RETRY_INTERVAL_SECONDS * 1000, remainingMs);
        await sleep(waitMs);
    }
}

function mergeRowsByDate(currentRows, incomingRows) {
    const byDate = new Map();
    for (const row of currentRows || []) {
        const normalized = normalizeDataRow(row);
        if (normalized.date) byDate.set(normalized.date, normalized);
    }
    for (const row of incomingRows || []) {
        const normalized = normalizeDataRow(row);
        if (normalized.date) byDate.set(normalized.date, normalized);
    }
    return sortRowsByDate(Array.from(byDate.values()));
}

function convertFormat(rawDataStr) {
    const raw = JSON.parse(rawDataStr);
    // xsmb-2-digits.json format: { date: '2026-03-24T00:00:00.000', special: 29, prize1: 31, ... }
    // The generators expect standard format dates that statisticsGenerator parses with its parseDate / formatDate logic
    return { data: raw.map(item => {
        // Mặc dù data nguồn date có chữ T, generators tự split theo ngày/tháng/năm
        // Wait, statisticsGenerator.js có:
        //    const [day, month, year] = dateString.split('/');
        // Which means it expects input strings to be "DD/MM/YYYY" !!
        
        let dateSplitStr = '';
        if (item.date.includes('T')) {
            dateSplitStr = item.date.split('T')[0]; // Format là YYYY-MM-DD
        } else {
            // Re-convert fallback to YYYY-MM-DD if needed, assuming old ones are DD/MM/YYYY? 
            if (item.date.includes('/')) {
                const [d, m, y] = item.date.split('/');
                dateSplitStr = `${y}-${m}-${d}`;
            } else {
                dateSplitStr = item.date;
            }
        }

        return {
            date: dateSplitStr,
            special: Number(item.special),
            prize1: Number(item.prize1),
            prize2_1: Number(item.prize2_1),
            prize2_2: Number(item.prize2_2),
            prize3_1: Number(item.prize3_1),
            prize3_2: Number(item.prize3_2),
            prize3_3: Number(item.prize3_3),
            prize3_4: Number(item.prize3_4),
            prize3_5: Number(item.prize3_5),
            prize3_6: Number(item.prize3_6),
            prize4_1: Number(item.prize4_1),
            prize4_2: Number(item.prize4_2),
            prize4_3: Number(item.prize4_3),
            prize4_4: Number(item.prize4_4),
            prize5_1: Number(item.prize5_1),
            prize5_2: Number(item.prize5_2),
            prize5_3: Number(item.prize5_3),
            prize5_4: Number(item.prize5_4),
            prize5_5: Number(item.prize5_5),
            prize5_6: Number(item.prize5_6),
            prize6_1: Number(item.prize6_1),
            prize6_2: Number(item.prize6_2),
            prize6_3: Number(item.prize6_3),
            prize7_1: Number(item.prize7_1),
            prize7_2: Number(item.prize7_2),
            prize7_3: Number(item.prize7_3),
            prize7_4: Number(item.prize7_4)
        };
    })};
}

async function getLegacyFormattedRows() {
    const rawDataStr = await downloadData();
    return convertFormat(rawDataStr).data;
}

async function buildRawDataFromSources(currentArray) {
    let finalArray = Array.isArray(currentArray) ? sortRowsByDate(currentArray.map(normalizeDataRow)) : [];
    const sourceLog = [];
    const latestExistingDate = getLatestDateValue(finalArray);
    const targetDate = process.env.XOSO_TARGET_DATE || getVietnamTodayDate();

    if (WAIT_FOR_NEW_XOSO && latestExistingDate && compareDateValues(latestExistingDate, targetDate) >= 0) {
        console.log(`[1b] Raw data đã có ngày target (${latestExistingDate} >= ${targetDate}). Bỏ qua lấy xoso.com.vn để tránh chạy trùng.`);
        return {
            data: finalArray,
            source: `existing:${latestExistingDate}`
        };
    }

    if (finalArray.length === 0 || process.env.REFRESH_FULL_DATA === '1') {
        console.log('[1a] Local raw data trống hoặc REFRESH_FULL_DATA=1, tải full data fallback từ Github...');
        finalArray = await getLegacyFormattedRows();
        sourceLog.push(`legacy-full:${getLatestDateValue(finalArray)}`);
    }

    try {
        const latestLocalDate = getLatestDateValue(finalArray);
        console.log(`[1b] Lấy kết quả XSMB mới nhất từ ${XOSO_SOURCE_URLS.join(', ')}...`);
        if (WAIT_FOR_NEW_XOSO) {
            console.log(`[1b] Bật chế độ chờ dữ liệu mới: target=${process.env.XOSO_TARGET_DATE || getVietnamTodayDate()}, local=${latestLocalDate || 'none'}, retry=${XOSO_RETRY_INTERVAL_SECONDS}s, max=${XOSO_MAX_WAIT_MINUTES} phút.`);
        }
        const latestXosoRow = await fetchLatestXsmbResultWithRetry(latestLocalDate);
        const gapDays = daysBetweenDates(latestLocalDate, latestXosoRow.date);

        if (gapDays > 1) {
            console.warn(`[1c] Phát hiện thiếu ${gapDays - 1} ngày giữa local=${latestLocalDate} và xoso=${latestXosoRow.date}. Thử fallback full data để lấp khoảng trống...`);
            try {
                finalArray = mergeRowsByDate(finalArray, await getLegacyFormattedRows());
                sourceLog.push(`legacy-gap-fill:${getLatestDateValue(finalArray)}`);
            } catch (fallbackError) {
                console.warn(`[1c] Fallback full data lỗi, vẫn upsert ngày mới nhất từ xoso.com.vn: ${fallbackError.message}`);
            }
        }

        finalArray = mergeRowsByDate(finalArray, [latestXosoRow]);
        sourceLog.push(`xoso:${latestXosoRow.date}@${latestXosoRow._sourceUrl || XOSO_HOME_URL}`);
        console.log(`[1d] Đã parse kết quả xoso.com.vn ngày ${latestXosoRow.date}, ĐB=${String(latestXosoRow.special).padStart(2, '0')}`);
    } catch (xosoError) {
        console.warn(`[1b] Không lấy được kết quả xoso.com.vn: ${xosoError.message}`);
        if (finalArray.length === 0) {
            throw xosoError;
        }
        console.warn(`[1b] Tiếp tục sinh thống kê với dữ liệu mới nhất hiện có (${getLatestDateValue(finalArray) || 'none'}) thay vì dừng workflow.`);
    }

    return {
        data: finalArray,
        source: sourceLog.join(' + ') || 'local'
    };
}

async function main() {
    // The generator must read the freshly written local JSON files.
    process.env.LOTTERY_DATA_SOURCE = 'local';
    if (!process.env.LOTTERY_STATS_SOURCE) {
        process.env.LOTTERY_STATS_SOURCE = 'local';
    }

    await fs.mkdir(path.join(DATA_DIR, 'statistics'), { recursive: true });
    const currentArray = await readCurrentRawData();
    console.log('[2] Cập nhật dữ liệu từ nguồn độc lập xoso.com.vn...');
    const { data: finalArray, source } = await buildRawDataFromSources(currentArray);
    const forceRegenerateStats = process.env.FORCE_REGENERATE_STATS === '1';

    const latestRawDate = getLatestDateValue(finalArray);
    const localArray = await readJsonIfExists(JSON_FILE);
    const latestLocalFileDate = getLatestDateValue(localArray);
    const localRawOutOfSync = latestRawDate && latestLocalFileDate !== latestRawDate;
    if (localRawOutOfSync) {
        console.log(`[Cache Check] Local raw tạm đang lệch R2/source (local=${latestLocalFileDate || 'none'}, source=${latestRawDate}); sẽ ghi lại trước khi tính toán.`);
    }
    let isStale = false;
    if (latestRawDate) {
        try {
            const { readCacheStore, shouldUseSupabaseDbStats } = require('../lib/data-access.js');
            if (shouldUseSupabaseDbStats()) {
                const qsHistory = await readCacheStore('quick_stats_history');
                if (!qsHistory || !Array.isArray(qsHistory) || qsHistory.length === 0) {
                    console.log('[Cache Check] quick_stats_history cache is empty/missing in DB. Stats need to be regenerated.');
                    isStale = true;
                } else {
                    const expectedDateParts = latestRawDate.split('-');
                    const expectedDateStr = expectedDateParts.length === 3 ? `${expectedDateParts[2]}/${expectedDateParts[1]}/${expectedDateParts[0]}` : latestRawDate;
                    const latestStatsDate = qsHistory[0].date;
                    if (latestStatsDate !== expectedDateStr) {
                        console.log(`[Cache Check] Stats are behind! Raw latest draw date is ${expectedDateStr}, but stats latest date is ${latestStatsDate}. Forcing stats generation.`);
                        isStale = true;
                    } else {
                        console.log(`[Cache Check] Stats are up to date in DB (both at ${expectedDateStr}).`);
                    }
                }
            } else {
                const fsSync = require('fs');
                const expectedDateParts = latestRawDate.split('-');
                const expectedDateStr = expectedDateParts.length === 3 ? `${expectedDateParts[2]}/${expectedDateParts[1]}/${expectedDateParts[0]}` : latestRawDate;
                let checkedRemoteStats = false;

                if (getR2PublicUrl() && process.env.UPDATE_CHECK_R2_STATS !== '0') {
                    try {
                        const r2History = await readStatsJsonFromR2('quick_stats_history.json');
                        const latestStatsDate = Array.isArray(r2History) && r2History[0] ? r2History[0].date : null;
                        if (latestStatsDate === expectedDateStr) {
                            console.log(`[Cache Check] R2 stats are up to date (both at ${expectedDateStr}).`);
                            isStale = false;
                            checkedRemoteStats = true;
                        } else {
                            console.log(`[Cache Check] R2 stats are behind! Raw latest draw date is ${expectedDateStr}, but R2 stats latest date is ${latestStatsDate || 'none'}. Forcing stats generation.`);
                            isStale = true;
                            checkedRemoteStats = true;
                        }
                    } catch (r2CheckError) {
                        console.warn(`[Cache Check] Không kiểm tra được R2 stats, fallback local check: ${r2CheckError.message}`);
                    }
                }

                if (checkedRemoteStats) {
                    // R2 is the source of truth in R2 mode; do not let stale local
                    // files force unnecessary regeneration unless explicitly requested.
                } else {
                const localHistoryPath = path.join(DATA_DIR, 'statistics', 'quick_stats_history.json');
                if (!fsSync.existsSync(localHistoryPath)) {
                    console.log('[Cache Check] Local quick_stats_history.json does not exist. Stats need to be regenerated.');
                    isStale = true;
                } else {
                    const localData = JSON.parse(fsSync.readFileSync(localHistoryPath, 'utf8'));
                    if (!localData || !Array.isArray(localData) || localData.length === 0) {
                        isStale = true;
                    } else {
                        const latestStatsDate = localData[0].date;
                        if (latestStatsDate !== expectedDateStr) {
                            console.log(`[Cache Check] Local stats are behind! Raw latest draw date is ${expectedDateStr}, but local stats latest date is ${latestStatsDate}. Forcing stats generation.`);
                            isStale = true;
                        } else {
                            console.log(`[Cache Check] Local stats are up to date (both at ${expectedDateStr}).`);
                            if (!hasRequiredLocalStatsCoverage()) {
                                isStale = true;
                            }
                        }
                    }
                }
                }
            }
        } catch (checkErr) {
            console.warn('[Cache Check] Failed to check if stats are stale, assuming stale:', checkErr.message);
            isStale = true;
        }
    }

    const rawDataChanged = hasRawDataChanged(currentArray, finalArray);
    const trustR2LotoCache = Boolean(getR2PublicUrl() && process.env.UPDATE_CHECK_R2_LOTO !== '0');
    const lotoCacheMissing = trustR2LotoCache ? false : !hasLotoPredictionCache(latestRawDate);
    const r2LotoCacheMissing = !(await hasLotoPredictionCacheOnR2(latestRawDate));
    const onlyLotoCacheNeedsRefresh = !rawDataChanged && !forceRegenerateStats && !isStale && (lotoCacheMissing || r2LotoCacheMissing);

    if (onlyLotoCacheNeedsRefresh) {
        if (localRawOutOfSync) {
            await fs.writeFile(JSON_FILE, JSON.stringify(finalArray, null, 0), 'utf-8');
            console.log(`[3] Đồng bộ raw local tạm cho Lô (${latestLocalFileDate || 'none'} -> ${latestRawDate}).`);
        }
        console.log('[3] Stats R2 đã mới, chỉ sinh/đối soát cache Lô và upload 2 file Lô.');
        try {
            await hydrateLotoLiveCacheFromR2();
            generateLotoPredictionCache();
            uploadOnlyLotoCaches();
        } catch (lotoErr) {
            console.error('⚠️ Lỗi khi sinh/upload cache Lô:', lotoErr.message);
            process.exit(1);
        }
        return;
    }

    if (!rawDataChanged && !forceRegenerateStats && !isStale && !lotoCacheMissing && !r2LotoCacheMissing) {
        if (localRawOutOfSync) {
            await fs.writeFile(JSON_FILE, JSON.stringify(finalArray, null, 0), 'utf-8');
            console.log(`[3] RAW_DATA R2 đã mới nhất; chỉ đồng bộ file local tạm (${latestLocalFileDate || 'none'} -> ${latestRawDate}) rồi bỏ qua generate stats.`);
        }
        console.log(`[3] RAW_DATA không đổi (latest=${latestRawDate}, rows=${finalArray.length}, source=${source}). Bỏ qua generate stats để tiết kiệm Action time.`);
        return;
    }
    if (lotoCacheMissing) {
        console.log('[3] Cache Lô local đang thiếu, vẫn chạy workflow để sinh cached_loto_prediction.json và cached_loto_live_predictions.json.');
    }
    if (r2LotoCacheMissing) {
        console.log('[3] Cache Lô trên R2 đang thiếu, vẫn chạy workflow để sinh/upload lại cached_loto_prediction.json và cached_loto_live_predictions.json.');
    }

    if (rawDataChanged || forceRegenerateStats || isStale || localRawOutOfSync || r2LotoCacheMissing || lotoCacheMissing) {
        await fs.writeFile(JSON_FILE, JSON.stringify(finalArray, null, 0), 'utf-8');
        console.log(`[3] Ghi file xsmb-2-digits.json (RAW_DATA) thành công! (${finalArray.length} bản ghi, latest=${latestRawDate}, source=${source})`);
    } else {
        console.log(`[3] RAW_DATA không đổi nhưng stats đang bị chậm hoặc FORCE_REGENERATE_STATS=1, sinh lại thống kê/cache từ code mới.`);
    }

    const { shouldUseSupabaseDbStats, writeCacheStoreDirect, clearCache: daClearCache } = require('../lib/data-access.js');
    const dbStatsActive = shouldUseSupabaseDbStats();

    if (dbStatsActive) {
        console.log('[4] Chạy luồng sinh Thống kê trực tiếp vào Supabase DB (Streaming mode)...');
    } else {
        console.log('[4] Chạy luồng sinh Thống kê Statically (Ghi file cục bộ)...');
    }
    
    try {
        const generateNumberStats = require('../lib/generators/statisticsGenerator.js');
        const generateHeadTailStats = require('../lib/generators/headTailStatsGenerator.js');
        const generateSumDiffStats = require('../lib/generators/sumDifferenceStatsGenerator.js');
        
        // Define helper function to compact runtime-only/hydratable fields before persisting caches.
        function stripFullSequence(obj, mode = 'default') {
            if (!obj || typeof obj !== 'object') return obj;
            
            if (Array.isArray(obj)) {
                return obj.map(item => stripFullSequence(item, mode));
            }

            const result = {};
            for (const [key, val] of Object.entries(obj)) {
                if (key === 'fullSequence' || key === '_startD' || key === '_endD') {
                    continue;
                }
                if (mode === 'summary' && (key === 'values' || key === 'dates' || key === 'orderedValues')) {
                    continue;
                }

                if (key === 'current') {
                    result[key] = stripFullSequence(val, 'current');
                } else if (key === 'longest' || key === 'secondLongest') {
                    const limited = Array.isArray(val) ? val.slice(0, 5) : val;
                    result[key] = stripFullSequence(limited, 'summary');
                } else if (key === 'streaks') {
                    result[key] = stripFullSequence(val, 'summary');
                } else if (typeof val === 'object') {
                    result[key] = stripFullSequence(val, mode);
                } else {
                    result[key] = val;
                }
            }
            return result;
        }

        const ls = require('../lib/services/lotteryService.js');
        const ss = require('../lib/services/statisticsService.js');
        const he = require('../lib/services/historicalExclusionService.js');

        const latestResult = finalArray[finalArray.length - 1];
        const yesterdayResult = finalArray.length >= 2 ? finalArray[finalArray.length - 2] : null;
        const dayBeforeYesterdayResult = finalArray.length >= 3 ? finalArray[finalArray.length - 3] : null;

        if (dbStatsActive) {
            const { identifyCategories } = require('../lib/utils/numberAnalysis');
            const { calculateQuickStatsForPattern } = require('../lib/utils/quickStatsCalculator');
            const { savePatternStatsBatchToDb } = require('../lib/data-access');

            const formatToDDMMYYYY = (dateStr) => {
                if (!dateStr) return '';
                if (dateStr.includes('/')) return dateStr;
                const parts = dateStr.split('-');
                if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
                return dateStr;
            };

            const latestDate = latestResult ? formatToDDMMYYYY(latestResult.date) : '';
            const yestDate = yesterdayResult ? formatToDDMMYYYY(yesterdayResult.date) : '';
            const dayBeforeYestDate = dayBeforeYesterdayResult ? formatToDDMMYYYY(dayBeforeYesterdayResult.date) : '';

            const hasLatest = !!latestResult;
            const hasYesterday = !!yesterdayResult;
            const hasDayBeforeYesterday = !!dayBeforeYesterdayResult;

            const numTodayStr = latestResult && latestResult.special !== null ? String(latestResult.special).padStart(2, '0') : '';
            const numYesterdayStr = yesterdayResult && yesterdayResult.special !== null ? String(yesterdayResult.special).padStart(2, '0') : '';
            const numDayBeforeYesterdayStr = dayBeforeYesterdayResult && dayBeforeYesterdayResult.special !== null ? String(dayBeforeYesterdayResult.special).padStart(2, '0') : '';

            const matchedToday = numTodayStr ? identifyCategories(numTodayStr) : [];
            const matchedYesterday = numYesterdayStr ? identifyCategories(numYesterdayStr) : [];
            const matchedDayBeforeYesterday = numDayBeforeYesterdayStr ? identifyCategories(numDayBeforeYesterdayStr) : [];

            const calculatorOptions = {
                latestDate,
                today: latestDate ? new Date(latestResult.date) : new Date(),
                totalYears: 20,
                matchedToday,
                matchedYesterday,
                matchedDayBeforeYesterday,
                numTodayStr,
                numYesterdayStr,
                numDayBeforeYesterdayStr,
                yestDate,
                dayBeforeYestDate,
                hasLatest,
                hasYesterday,
                hasDayBeforeYesterday
            };

            let quickStatsPatternCount = 0;
            const quickStatsHistoryEntries = [];

            const collectPattern = (entries) => async (patternKey, categoryType, category, subcategory, description, streaks) => {
                if (isInvalidStatsKey(patternKey)) return;
                const qs = calculateQuickStatsForPattern(patternKey, { description, streaks }, calculatorOptions);
                if (qs) {
                    entries.push({ patternKey, categoryType, category, subcategory, description, streaks, qs });
                    quickStatsPatternCount += 1;

                    if (qs.current) {
                        const recordLength = qs.computedMaxStreak || (qs.longest && qs.longest.length > 0 ? qs.longest[0].length : 0);
                        quickStatsHistoryEntries.push({
                            key: patternKey,
                            current: {
                                ...qs.current,
                                patternNumbers: qs.current.patternNumbers || []
                            },
                            recordLength
                        });
                    }
                }
            };

            async function generateAndSaveBatch(label, categoryType, generator) {
                const entries = [];
                console.log(` -> Sinh dữ liệu ${label}...`);
                await generator(null, null, null, collectPattern(entries));
                console.log(` -> Ghi batch ${entries.length} pattern ${label} vào Supabase DB...`);
                await savePatternStatsBatchToDb(categoryType, entries);
            }

            await generateAndSaveBatch('Number Stats', 'number', generateNumberStats);
            await generateAndSaveBatch('Head/Tail Stats', 'head_tail', generateHeadTailStats);
            await generateAndSaveBatch('Sum/Diff Stats', 'sum_diff', generateSumDiffStats);

            console.log(' -> Lưu quick_stats_history vào Cache Store...');
            console.log(`    quick_stats có ${quickStatsPatternCount} pattern; nguồn chính là bảng streak_statistics, không ghi một JSONB lớn vào cache_store.`);

            let historyStats = [];
            try {
                const { readCacheStore } = require('../lib/data-access');
                const existingHistory = await readCacheStore('quick_stats_history');
                if (Array.isArray(existingHistory)) {
                    historyStats = existingHistory;
                }
            } catch (err) {
                console.warn('Lỗi khi đọc quick_stats_history từ cache_store:', err.message);
            }

            const todayMiniStreaks = quickStatsHistoryEntries.map(({ key, current, recordLength }) => {
                const { fullSequence, ...rest } = current;
                return { key, current: rest, recordLength };
            });

            const todayHistoryEntry = {
                date: latestDate,
                streaks: todayMiniStreaks
            };

            historyStats = historyStats.filter(entry => entry.date !== latestDate);
            historyStats.unshift(todayHistoryEntry);
            historyStats = historyStats.slice(0, 7);

            await writeCacheStoreDirect('quick_stats_history', 'statistics', historyStats);
            console.log('✅ Đã lưu kết quả quick_stats_history vào Cache Store');

            // Clear internal caches so that services read the newly generated/uploaded DB statistics
            ls.clearCache();
            ss.clearCache();
            he.clearCache();
            daClearCache();

            // Load raw data so services can run predictions
            await ls.loadRawData();

        } else {
            console.log(' -> Tạo Data Number Stats...');
            await generateNumberStats();
            
            console.log(' -> Tạo Data Head/Tail Stats...');
            await generateHeadTailStats();
            
            console.log(' -> Tạo Data Sum/Diff Stats...');
            await generateSumDiffStats();
            
            console.log(' -> Load dữ liệu nội bộ và Sinh Quick Stats...');
            ls.clearCache();
            ss.clearCache();
            he.clearCache();
            
            await ls.loadRawData();
            await ls.loadStats();
            
            const quickStats = await ss.getQuickStats();
            const minifiedQS = stripFullSequence(quickStats);
            await fs.writeFile(path.join(DATA_DIR, 'statistics', 'quick_stats.json'), JSON.stringify(minifiedQS, null, 0));
            console.log('✅ Đã lưu kết quả quick_stats.json (minified)');

            const quickStatsKeys = Object.keys(minifiedQS || {}).sort();
            await fs.writeFile(path.join(DATA_DIR, 'statistics', 'quick_stats_keys.json'), JSON.stringify(quickStatsKeys, null, 0));
            console.log(`✅ Đã lưu kết quả quick_stats_keys.json (${quickStatsKeys.length} keys)`);

            runNodeScript('scripts/generate-quick-stats-shards.js', 'Sinh quick_stats shards cho API Kỷ lục.');
            
            const historyStats = await ss.getQuickStatsHistory();
            const minifiedHistory = historyStats.map(entry => ({
                ...entry,
                streaks: entry.streaks ? entry.streaks.map(({ fullSequence, ...rest }) => rest) : []
            }));
            await fs.writeFile(path.join(DATA_DIR, 'statistics', 'quick_stats_history.json'), JSON.stringify(minifiedHistory, null, 0));
            console.log('✅ Đã lưu kết quả quick_stats_history.json (minified)');
        }

        if (dbStatsActive) {
            console.log(' -> Tạo cache Chain Frequency cho Supabase DB...');
            const simulationService = require('../lib/services/simulationService');
            const chainCacheVariants = [
                { sortBy: 'frequency', includePotential: '1', excludeFixedThreeValueGroups: '0' },
                { sortBy: 'risk', includePotential: '1', excludeFixedThreeValueGroups: '0' },
                { sortBy: 'frequency', includePotential: '0', excludeFixedThreeValueGroups: '0' },
                { sortBy: 'risk', includePotential: '0', excludeFixedThreeValueGroups: '0' }
            ];
            for (const variant of chainCacheVariants) {
                const result = await simulationService.runChainFrequencyAnalysis({
                    includePotential: variant.includePotential,
                    sortBy: variant.sortBy,
                    excludeFixedThreeValueGroups: variant.excludeFixedThreeValueGroups
                });
                if (result && !result.error) {
                    const cacheKey = `chain_frequency:${variant.sortBy}:potential:${variant.includePotential}:exclude3:${variant.excludeFixedThreeValueGroups}`;
                    await writeCacheStoreDirect(cacheKey, 'statistics', {
                        ...result,
                        cachedAt: new Date().toISOString()
                    });
                    console.log(`✅ Đã lưu cache ${cacheKey}`);
                } else {
                    throw new Error(`Không tạo được chain frequency cache (${variant.sortBy}/${variant.includePotential}): ${result ? result.error : 'empty result'}`);
                }
            }

            const simulationCacheDays = getSimulationCacheDays();
            const simulationCacheModes = getSimulationCachePlayModes();

            if (simulationCacheDays.length > 0 && simulationCacheModes.length > 0) {
                console.log(' -> Tạo cache Simulation Backtest cho Supabase DB...');
                for (const cacheDays of simulationCacheDays) {
                    for (const playMode of simulationCacheModes) {
                        const simulationResult = await simulationService.runBacktest(cacheDays, null, {
                            compactDetails: cacheDays > 90,
                            selectedStreakDetailLimit: cacheDays <= 90 ? 1000 : undefined,
                            playMode,
                            clearHistoryCacheInterval: Number(process.env.BACKTEST_CLEAR_HISTORY_CACHE_INTERVAL || 30)
                        });
                        if (simulationResult && !simulationResult.error) {
                            const cacheKey = `cached_simulation_${cacheDays}_${playMode}`;
                            await writeCacheStoreDirect(cacheKey, 'simulation', {
                                ...simulationResult,
                                cachedAt: new Date().toISOString()
                            });
                            console.log(`✅ Đã lưu cache ${cacheKey}`);
                        } else {
                            throw new Error(`Không tạo được simulation cache (${cacheDays}/${playMode}): ${simulationResult ? simulationResult.error : 'empty result'}`);
                        }
                    }
                }
            }

            // PRE-COMPUTE: Suggestions and write to DB Cache Store
            console.log(' -> Tạo Cached Suggestions cho Supabase DB Cache Store...');
            try {
                const suggestionsController = require('../lib/controllers/suggestionsController');
                let suggestionsResult;
                const mockReq = { query: { gapStrategy: 'COMBINED', gapBuffer: '0', strategy: 'BALANCED' } };
                const mockRes = { json(d) { suggestionsResult = d; return mockRes; }, status(c) { mockRes._status = c; return mockRes; }, _status: 200 };
                await suggestionsController.getSuggestions(mockReq, mockRes);
                if (suggestionsResult) {
                    await writeCacheStoreDirect('cached_suggestions', 'statistics', {
                        ...suggestionsResult,
                        cachedAt: new Date().toISOString()
                    });
                    console.log('✅ Đã lưu kết quả cached_suggestions vào Cache Store');
                }
            } catch (sugErr) {
                console.error('⚠️ Lỗi khi tạo cached suggestions cho DB:', sugErr.message);
            }

            // Sync daily prediction runs history and generate tomorrow's prediction
            console.log(' -> Đồng bộ lịch sử dự đoán (Prediction History)...');
            try {
                const predictionHistoryService = require('../lib/services/predictionHistoryService');
                await predictionHistoryService.backfillHistoryIfEmpty();
                if (latestResult) {
                    const drawDateStr = latestResult.date; // YYYY-MM-DD
                    const specialNumber = latestResult.special;
                    await predictionHistoryService.syncPredictionHistory(drawDateStr, specialNumber);
                }
            } catch (histErr) {
                console.error('⚠️ Lỗi khi đồng bộ lịch sử dự đoán:', histErr.message);
            }

            try {
                await hydrateLotoLiveCacheFromR2();
                generateLotoPredictionCache();
            } catch (lotoErr) {
                console.error('⚠️ Lỗi khi sinh cache Lô cho DB mode:', lotoErr.message);
            }
        }

        if (!dbStatsActive) {
            // PRE-COMPUTE: Suggestions (to avoid Vercel serverless timeout)
            console.log(' -> Tạo Cached Suggestions...');
            try {
                const suggestionsController = require('../lib/controllers/suggestionsController');
                let suggestionsResult;
                const mockReq = { query: { gapStrategy: 'COMBINED', gapBuffer: '0', strategy: 'BALANCED' } };
                const mockRes = { json(d) { suggestionsResult = d; return mockRes; }, status(c) { mockRes._status = c; return mockRes; }, _status: 200 };
                await suggestionsController.getSuggestions(mockReq, mockRes);
                if (suggestionsResult) {
                    await fs.writeFile(path.join(DATA_DIR, 'statistics', 'cached_suggestions.json'), JSON.stringify(suggestionsResult, null, 0));
                    console.log('✅ Đã lưu kết quả cached_suggestions.json');
                }
            } catch (sugErr) {
                console.error('⚠️ Lỗi khi tạo cached suggestions (không ảnh hưởng các bước khác):', sugErr.message);
            }

            // PRE-COMPUTE: simulation backtests for all default periods and play modes
            // so Vercel does not have to run heavy loops inside serverless requests.
            console.log(' -> Tạo Cached Simulation Backtest cho tất cả khoảng thời gian...');
            try {
                const simulationService = require('../lib/services/simulationService');
                const staticCacheDays = getSimulationCacheDays();
                const staticCacheModes = getSimulationCachePlayModes();
                console.log(`    Cache simulation: days=${staticCacheDays.join(',')}, modes=${staticCacheModes.join(',')}`);
                for (const days of staticCacheDays) {
                    for (const playMode of staticCacheModes) {
                        const simulationResult = await simulationService.runBacktest(days, null, {
                            compactDetails: days > 90,
                            selectedStreakDetailLimit: days <= 90 ? 1000 : undefined,
                            playMode,
                            clearHistoryCacheInterval: Number(process.env.BACKTEST_CLEAR_HISTORY_CACHE_INTERVAL || 30)
                        });
                        const fileName = playMode === 'both' ? `cached_simulation_${days}.json` : `cached_simulation_${days}_${playMode}.json`;
                        await fs.writeFile(path.join(DATA_DIR, 'statistics', fileName), JSON.stringify(simulationResult, null, 0));
                        console.log(`✅ Đã lưu kết quả ${fileName}`);
                        if (he.clearStaticHistoryCaches) he.clearStaticHistoryCaches();
                    }
                }

                const predictionHistoryService = require('../lib/services/predictionHistoryService');
                await predictionHistoryService.generateLocalPredictionHistoryFromSimulation(90);

            } catch (simErr) {
                console.error('⚠️ Lỗi khi tạo cached simulation (không ảnh hưởng các bước khác):', simErr.message);
            }

            console.log(' -> Tạo Cached Chain Frequency cho R2/static JSON...');
            try {
                const simulationService = require('../lib/services/simulationService');
                const chainCacheVariants = [
                    { sortBy: 'frequency', includePotential: '1', excludeFixedThreeValueGroups: '0' },
                    { sortBy: 'risk', includePotential: '1', excludeFixedThreeValueGroups: '0' },
                    { sortBy: 'frequency', includePotential: '0', excludeFixedThreeValueGroups: '0' },
                    { sortBy: 'risk', includePotential: '0', excludeFixedThreeValueGroups: '0' }
                ];
                for (const variant of chainCacheVariants) {
                    const result = await simulationService.runChainFrequencyAnalysis({
                        includePotential: variant.includePotential,
                        sortBy: variant.sortBy,
                        excludeFixedThreeValueGroups: variant.excludeFixedThreeValueGroups
                    });
                    if (result && !result.error) {
                        const fileName = `chain_frequency_${variant.sortBy}_potential_${variant.includePotential}_exclude3_${variant.excludeFixedThreeValueGroups}.json`;
                        await fs.writeFile(path.join(DATA_DIR, 'statistics', fileName), JSON.stringify({
                            ...result,
                            cachedAt: new Date().toISOString()
                        }, null, 0));
                        console.log(`✅ Đã lưu kết quả ${fileName}`);
                    } else {
                        throw new Error(`Không tạo được chain frequency cache (${variant.sortBy}/${variant.includePotential}): ${result ? result.error : 'empty result'}`);
                    }
                }
            } catch (chainErr) {
                console.error('⚠️ Lỗi khi tạo cached chain frequency (không ảnh hưởng các bước khác):', chainErr.message);
            }
        } else {
            console.log(' -> DB stats active, bỏ qua legacy cached predictions/suggestions/simulation để tránh timeout và dữ liệu fallback stale.');
        }
        
        if (!dbStatsActive) {
            // BƯỚC ĐẶC BIỆT: Minify để xóa fullSequence (cứu github khỏi bị lố 100MB giới hạn)
            console.log('[+] Đang minify siêu gọn các file stats...');
            
            function minifyStreak(streak) {
                if (!streak) return streak;
                const { fullSequence, ...mini } = streak;
                return mini;
            }

            function minifyStatsObject(stats) {
                if (!stats || typeof stats !== 'object') return stats;
                const result = {};
                
                for (const key of Object.keys(stats)) {
                    const val = stats[key];
                    if (!val) {
                        result[key] = val;
                        continue;
                    }

                    if (Array.isArray(val.streaks)) {
                        result[key] = { 
                            ...val, 
                            streaks: val.streaks.map(minifyStreak) 
                        };
                    } else if (typeof val === 'object' && !Array.isArray(val)) {
                        result[key] = {};
                        for (const subKey of Object.keys(val)) {
                            const sub = val[subKey];
                            if (sub && Array.isArray(sub.streaks)) {
                                result[key][subKey] = { 
                                    ...sub, 
                                    streaks: sub.streaks.map(minifyStreak) 
                                };
                            } else {
                                result[key][subKey] = sub;
                            }
                        }
                    } else {
                        result[key] = val;
                    }
                }
                return result;
            }

            const statFiles = ['number_stats.json', 'head_tail_stats.json', 'sum_difference_stats.json'];
            const largeFileLimitBytes = Number(process.env.MINIFY_STATS_MAX_BYTES || 64 * 1024 * 1024);
            for (const f of statFiles) {
                const p = path.join(DATA_DIR, 'statistics', f);
                if (require('fs').existsSync(p)) {
                    try {
                        const fileStat = await fs.stat(p);
                        if (fileStat.size > largeFileLimitBytes && process.env.FORCE_MINIFY_LARGE_STATS !== '1') {
                            console.log(` -> Bỏ qua ${f}: ${(fileStat.size / 1024 / 1024).toFixed(1)}MB, generator đã ghi dạng compact.`);
                            continue;
                        }
                        console.log(` -> Đang xử lý ${f}...`);
                        const content = await fs.readFile(p, 'utf8');
                        if (!content || content.length < 2) continue;
                        
                        const raw = JSON.parse(content);
                        const minified = minifyStatsObject(raw);
                        
                        await fs.writeFile(p, JSON.stringify(minified, null, 0)); 
                        console.log(`    ✅ Đã nén ${f}`);
                    } catch (miniErr) {
                        console.error(`    ⚠️ Lỗi khi nén ${f}:`, miniErr.message);
                    }
                }
            }
            console.log('✅ Minify thành công!');

            if (process.env.SYNC_R2_BEFORE_LOTO !== '0') {
                console.log('[5b] Upload R2 trước bước Lô để dữ liệu chính không bị chặn nếu Lô quá nặng.');
                didEarlyR2Upload = uploadR2StaticData(
                    'Upload raw data + non-Lô statistics gzip lên Cloudflare R2 trước bước Lô.',
                    {
                        R2_UPLOAD_EXCLUDE_STATS_FILES: 'cached_loto_prediction.json,cached_loto_live_predictions.json'
                    }
                );
            }

            if (process.env.LOTO_GENERATE_CACHE !== '0') {
                try {
                    await hydrateLotoLiveCacheFromR2();
                    generateLotoPredictionCache();
                } catch (lotoErr) {
                    console.error('⚠️ Lỗi khi sinh cache Lô (không ảnh hưởng các cache khác):', lotoErr.message);
                }
            } else {
                console.log('[6] LOTO_GENERATE_CACHE=0, bỏ qua sinh cache Lô.');
            }
        }
        
    } catch (err) {
        console.error('Lỗi khi chạy Generators:', err.message);
        process.exit(1);
    }
    
    console.log(`[5] Hoàn tất Update Workflow (${dbStatsActive ? 'Supabase DB' : 'Static JSON'}).`);
    syncRemoteAfterStaticGeneration();
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
