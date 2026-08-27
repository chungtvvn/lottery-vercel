require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const { fetchLatestXsmbResult, XOSO_HOME_URL, XOSO_SOURCE_URLS } = require('./sources/xoso-com-vn');
const { isInvalidStatsKey } = require('../lib/utils/statsOptionsManifest');
const {
    CACHE_VERSION: DAILY_METHOD_ADVISOR_CACHE_VERSION,
    STRATEGY_CATALOG: DAILY_METHOD_ADVISOR_STRATEGY_CATALOG
} = require('../lib/services/dailyMethodAdvisorService');

const LEGACY_DATA_URL = 'https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/refs/heads/main/data/xsmb-2-digits.json';
const DATA_DIR = path.join(__dirname, '..', 'lib', 'data');
const JSON_FILE = path.join(DATA_DIR, 'xsmb-2-digits.json');
const RUN_STATUS_FILE = path.join(__dirname, '..', '.update-static-data-result.json');
const WAIT_FOR_NEW_XOSO = process.env.WAIT_FOR_NEW_XOSO === '1';
const XOSO_MAX_WAIT_MINUTES = readNumberEnv('XOSO_MAX_WAIT_MINUTES', WAIT_FOR_NEW_XOSO ? 90 : 0, 0);
const XOSO_RETRY_INTERVAL_SECONDS = readNumberEnv('XOSO_RETRY_INTERVAL_SECONDS', 60, 5);
const LOTO_STAKE_PER_NUMBER_K = 2200;
const LOTO_PAYOUT_PER_HIT_K = 8000;
const LOTO_METHOD_ID = process.env.LOTO_METHOD_ID || 'rrfParallelBlock85Small65';
const LOTO_AGGREGATION_MODE = process.env.LOTO_AGGREGATION_MODE || 'rrf';
const LOTO_BET_COUNTS = [6, 7, 20, 25, 30];
const LOTO_DEFAULT_BET_COUNT = 6;
const PREDICTION_HISTORY_METHOD_IDS = [
    'chainSmallFirstHold70',
    'deParallelBlock85Small65Hold70',
    'dedupEdge50CombinedB40S05Hold70',
    'dedupEdge50CombinedB40S05Hold80',
    'dedupEdge50Hold70',
    'dedupEdge50Hold80',
    'avgEdge50Hold70',
    'dedupEdge75Hold70',
    'dedupDropoffHold70'
];
const MILESTONE20Y_METHOD_VERSION = 'annual20y-2026-07-23-history-edge75-parallel-union-v1';
const MILESTONE20Y_BASELINE_VERSION = 'annual20y-baseline-2026-06-28-block-ab';
const MILESTONE20Y_LIVE_CACHE_VERSION = 'annual20y-live-compact-v5';
const MILESTONE20Y_CACHE_FILES = [
    'cached_milestone20y_prediction.json',
    'cached_milestone20y_live_predictions.json'
];
const PERFORMANCE_REPORT_CACHE_FILE = 'cached_profit_report_2026.json';
const HISTORY_PERFORMANCE_REPORT_CACHE_FILE = 'cached_prediction_history_performance_2026.json';
const DAILY_METHOD_ADVISOR_CACHE_FILE = 'cached_daily_method_advisor.json';
const PROBABILITY_SCORE_CACHE_FILE = 'cached_probability_score.json';
const PROBABILITY_DISTRIBUTION_CACHE_FILE = 'cached_probability_distribution.json';
const PROBABILITY_SCORE_HISTORY_VERSION = 'probability-score-history-v1';
const PERFORMANCE_REPORT_VERSION = 'profit-report-2026-de-parallel-rrf-loto-v2';
const ANALYSIS_CACHE_VERSION = 'hold70-edge-bo-v1';
const PREDICTION_HISTORY_METHOD_VERSION = '2026-07-15-parallel-shared-ranking-v3';
const ANALYSIS_CACHE_VERSION_FILE = 'analysis_cache_version.json';
const runStatus = {
    startedAt: new Date().toISOString(),
    skipped: false,
    didWork: false,
    rawDataChanged: false,
    statsRegenerated: false,
    predictionCacheRefreshed: false,
    r2Uploaded: false,
    uploadLabels: [],
    latestRawDate: null,
    reason: ''
};

function markRunStatus(fields = {}) {
    Object.assign(runStatus, fields);
    runStatus.didWork = Boolean(
        runStatus.didWork ||
        runStatus.rawDataChanged ||
        runStatus.statsRegenerated ||
        runStatus.predictionCacheRefreshed ||
        runStatus.r2Uploaded
    );
}

async function writeRunStatus(fields = {}) {
    markRunStatus(fields);
    const payload = {
        ...runStatus,
        finishedAt: new Date().toISOString()
    };
    await fs.writeFile(RUN_STATUS_FILE, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`[Status] ${JSON.stringify({
        skipped: payload.skipped,
        didWork: payload.didWork,
        rawDataChanged: payload.rawDataChanged,
        statsRegenerated: payload.statsRegenerated,
        predictionCacheRefreshed: payload.predictionCacheRefreshed,
        r2Uploaded: payload.r2Uploaded,
        latestRawDate: payload.latestRawDate,
        reason: payload.reason
    })}`);
}

function readNumberEnv(name, fallback, minValue) {
    const parsed = Number(process.env[name]);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(minValue, parsed);
}

function getSimulationCacheDays() {
    const configured = String(process.env.SIMULATION_CACHE_DAYS || '90').trim().toLowerCase();
    if (['0', 'off', 'none', 'disabled'].includes(configured)) return [];
    const values = configured
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

async function hasCurrentAnalysisCacheVersionOnR2() {
    if (!getR2PublicUrl() || process.env.UPDATE_CHECK_R2_ANALYSIS_CACHE === '0') return true;
    try {
        const marker = await readStatsJsonFromR2(ANALYSIS_CACHE_VERSION_FILE);
        const current = marker && marker.version === ANALYSIS_CACHE_VERSION;
        console.log(`[Cache Check] R2 analysis cache version=${marker?.version || 'missing'}, expected=${ANALYSIS_CACHE_VERSION}.`);
        return current;
    } catch (error) {
        console.log(`[Cache Check] R2 analysis cache marker missing/stale: ${error.message}`);
        return false;
    }
}

async function writeVerifiedAnalysisCacheVersion() {
    const statsDir = path.join(DATA_DIR, 'statistics');
    const history = await readJsonIfExists(path.join(statsDir, 'cached_prediction_history.json'));
    const chain = await readJsonIfExists(path.join(statsDir, 'chain_frequency_risk_potential_1_exclude3_0.json'));
    const historyHasMethod = Array.isArray(history) && history.some(run =>
        !!run?.summary?.methods?.avgEdge50Hold70
    );
    const chainIsCurrent = chain?.recommendedExclusion?.methodId === 'avgEdge50Hold70'
        && chain?.recommendedExclusion?.ranking?.length === 100;
    if (!historyHasMethod || !chainIsCurrent) {
        throw new Error(`Cache phân tích chưa đạt schema ${ANALYSIS_CACHE_VERSION}: history=${historyHasMethod}, chain=${chainIsCurrent}`);
    }
    await fs.writeFile(path.join(statsDir, ANALYSIS_CACHE_VERSION_FILE), JSON.stringify({
        version: ANALYSIS_CACHE_VERSION,
        generatedAt: new Date().toISOString(),
        predictionMethodId: 'avgEdge50Hold70'
    }, null, 0));
    console.log(`✅ Đã xác minh và ghi ${ANALYSIS_CACHE_VERSION_FILE}: ${ANALYSIS_CACHE_VERSION}`);
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
    const aggregationMode = String(config.aggregationMode || cache?.nextPrediction?.aggregationMode || '');
    const defaultBetCount = Number(config.defaultBetCount || cache?.nextPrediction?.defaultBetCount || 0);
    const betCounts = Array.isArray(config.betCounts) ? config.betCounts.map(Number) : [];
    const strategy = String(config.strategy || cache?.nextPrediction?.strategy || LOTO_METHOD_ID);
    const predictions = cache?.nextPrediction?.predictions
        || cache?.nextPrediction?.strategies?.[strategy]?.predictions
        || cache?.nextPrediction?.strategies?.[LOTO_METHOD_ID]?.predictions
        || cache?.nextPrediction?.strategies?.parallelCombined?.predictions
        || {};
    const defaultNumbers = predictions?.[`top${LOTO_DEFAULT_BET_COUNT}`]?.numbers || [];
    const edge75PitPredictions = cache?.nextPrediction?.strategies?.dedupEdge75Pit?.predictions || {};
    const milestoneEdge75PitFusionPredictions = cache?.nextPrediction?.strategies?.milestoneEdge75PitFusion?.predictions || {};
    const hasPredictionSet = (predictionSets, count) => Array.isArray(predictionSets?.[`top${count}`]?.numbers)
        && predictionSets[`top${count}`].numbers.length === count;
    const betCountsOk = betCounts.length === LOTO_BET_COUNTS.length
        && LOTO_BET_COUNTS.every((count, index) => count === betCounts[index]);
    return stake === LOTO_STAKE_PER_NUMBER_K
        && payout === LOTO_PAYOUT_PER_HIT_K
        && methodId === LOTO_METHOD_ID
        && aggregationMode === LOTO_AGGREGATION_MODE
        && defaultBetCount === LOTO_DEFAULT_BET_COUNT
        && defaultNumbers.length === LOTO_DEFAULT_BET_COUNT
        && LOTO_BET_COUNTS.every(count => hasPredictionSet(predictions, count))
        && LOTO_BET_COUNTS.every(count => hasPredictionSet(edge75PitPredictions, count))
        && LOTO_BET_COUNTS.every(count => hasPredictionSet(milestoneEdge75PitFusionPredictions, count))
        && betCountsOk;
}

function isMilestone20yFormulaCurrent(cache) {
    const config = cache?.config || cache?.livePredictions?.config || {};
    const version = String(config.methodVersion || '');
    const strategies = Array.isArray(config.strategies) ? config.strategies.map(item => item && item.id).filter(Boolean) : [];
    const required = [
        'chainSmallFirst',
        'chainBlockFirst',
        'chainFreqFirst',
        'chainRiskFirst',
        'numberAvgRisk',
        'numberConsensusRisk',
        'numberPosteriorDiversity',
        'numberWeightedRisk',
        'activeOnlyAvgRisk',
        'dedupEdge75Pit',
        'deParallelBlock85Small65',
        'deMilestoneHistoryEdge75Union',
        'deMilestoneHistoryEdge75UnionX2'
    ];
    const edge75Pit = cache?.nextPrediction?.strategies?.dedupEdge75Pit?.holds?.['70'];
    const defaultPrediction = cache?.nextPrediction?.strategies?.deMilestoneHistoryEdge75UnionX2?.holds?.['70'];
    return version === MILESTONE20Y_METHOD_VERSION
        && required.every(id => strategies.includes(id))
        && Array.isArray(edge75Pit?.betNumbers)
        && edge75Pit.betNumbers.length === 30
        && Array.isArray(edge75Pit?.excludedNumbers)
        && edge75Pit.excludedNumbers.length === 70
        && Array.isArray(defaultPrediction?.betNumbers)
        && Array.isArray(defaultPrediction?.intersectionNumbers)
        && defaultPrediction?.components?.historyEdge75?.source === 'history-snapshot';
}

function getMilestone20yPredictionYear(cache, expectedLatestDate = null) {
    const predictionDate = normalizeDateValue(cache?.nextPrediction?.predictionIsoDate || cache?.nextPrediction?.predictionDate);
    if (predictionDate) return Number(predictionDate.slice(0, 4));
    const latest = normalizeDateValue(expectedLatestDate || cache?.latestDataDate);
    if (!latest) return null;
    const next = new Date(`${latest}T00:00:00Z`);
    if (Number.isNaN(next.getTime())) return null;
    next.setUTCDate(next.getUTCDate() + 1);
    return next.getUTCFullYear();
}

function isMilestone20yBaselineCurrent(payload, year) {
    return payload
        && payload.version === MILESTONE20Y_BASELINE_VERSION
        && Number(payload.year) === Number(year)
        && Array.isArray(payload.entries)
        && payload.entries.length > 0;
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
        const blockSubs = [
            'block2x1SoLe',
            'block2x2SoLe',
            'block3x2SoLe',
            'block3x3SoLe',
            'block4x2SoLe',
            'block4x3SoLe'
        ];
        const digitSubs = ['veLienTiep', 'veSole', 'veSoleMoi', ...blockSubs, 'tienLuiSoLe', 'luiTienSoLe', 'tienLienTiep', 'tienDeuLienTiep', 'luiLienTiep', 'luiDeuLienTiep'];
        const metricSubs = ['veLienTiep', 'veSole', 'veSoleMoi', ...blockSubs, 'tienLienTiep', 'tienDeuLienTiep', 'luiLienTiep', 'luiDeuLienTiep', 'tienLuiSoLe', 'luiTienSoLe'];

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

function hasRequiredQuickStatsKeyCoverage(keys = []) {
    const keySet = keys instanceof Set ? keys : new Set(keys || []);
    if (keySet.size < 1000) {
        console.log(`[Cache Check] quick_stats_keys chỉ có ${keySet.size} keys, quá ít so với dữ liệu kỷ lục kỳ vọng. Forcing stats generation.`);
        return false;
    }

    const hasCoreRecords = Array.from(keySet).some(key =>
        key.includes(':veLienTiep') ||
        key.includes(':tienLienTiep') ||
        key.includes(':luiLienTiep') ||
        key.includes(':veTheoThuTu') ||
        key.includes(':veSoLeTheoThuTu')
    );
    if (!hasCoreRecords) {
        console.log('[Cache Check] quick_stats_keys không có key kỷ lục lõi. Forcing stats generation.');
        return false;
    }

    const staleNoRecordBlockKeys = [
        'dau_5:block2x1SoLe',
        'dau_5:block2x2SoLe',
        'dau_5:block3x2SoLe',
        'dau_5:block3x3SoLe',
        'dau_5:block4x2SoLe',
        'dau_5:block4x3SoLe'
    ];
    const staleBlockKey = staleNoRecordBlockKeys.find(key => keySet.has(key));
    if (staleBlockKey) {
        console.log(`[Cache Check] quick_stats_keys còn key Nhịp block không có kỷ lục thật (${staleBlockKey}). Forcing stats generation.`);
        return false;
    }

    const blockRecordKeyCount = Array.from(keySet).filter(key => /:block\d+x\d+SoLe$/.test(String(key))).length;
    if (blockRecordKeyCount < 100) {
        console.log(`[Cache Check] quick_stats_keys thiếu nhóm Nhịp block A/B mới (${blockRecordKeyCount} keys). Forcing stats generation.`);
        return false;
    }

    return true;
}

function hasRecordQuickStatsData(stat) {
    if (!stat || typeof stat !== 'object') return false;
    if (Array.isArray(stat.longest) && stat.longest.length > 0) return true;
    return Array.isArray(stat.secondLongest) && stat.secondLongest.length > 0;
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

async function hydrateCoreStatsFromR2ForPredictionCache() {
    if (!getR2PublicUrl()) return false;
    const fileNames = ['number_stats.json', 'head_tail_stats.json', 'sum_difference_stats.json'];
    try {
        await fs.mkdir(path.join(DATA_DIR, 'statistics'), { recursive: true });
        for (const fileName of fileNames) {
            const data = await readStatsJsonFromR2(fileName);
            await fs.writeFile(path.join(DATA_DIR, 'statistics', fileName), JSON.stringify(data, null, 0), 'utf8');
            console.log(`[Mốc 20 năm] Hydrate ${fileName} từ R2 để sinh cache point-in-time.`);
        }
        return true;
    } catch (error) {
        console.warn(`[Mốc 20 năm] Không hydrate được stats lõi từ R2, dùng file local hiện có: ${error.message}`);
        return false;
    }
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
let didGenerateLotoCacheThisRun = false;

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
            console.log(`[Cache Check] Local Lô cache stale config: method=${config.methodId || cache?.nextPrediction?.methodId || 'unknown'}, aggregation=${config.aggregationMode || cache?.nextPrediction?.aggregationMode || 'unknown'}, betCounts=${(config.betCounts || []).join(',') || 'unknown'}, stake=${config.stakePerNumberK || 'unknown'}, payout=${config.payoutPerHitK || 'unknown'}, expected=${LOTO_METHOD_ID}/${LOTO_AGGREGATION_MODE}/${LOTO_BET_COUNTS.join(',')}/${LOTO_STAKE_PER_NUMBER_K}/${LOTO_PAYOUT_PER_HIT_K}.`);
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
            console.log(`[Cache Check] R2 Lô cache stale config: method=${config.methodId || cache?.nextPrediction?.methodId || 'unknown'}, aggregation=${config.aggregationMode || cache?.nextPrediction?.aggregationMode || 'unknown'}, betCounts=${(config.betCounts || []).join(',') || 'unknown'}, stake=${config.stakePerNumberK || 'unknown'}, payout=${config.payoutPerHitK || 'unknown'}, expected=${LOTO_METHOD_ID}/${LOTO_AGGREGATION_MODE}/${LOTO_BET_COUNTS.join(',')}/${LOTO_STAKE_PER_NUMBER_K}/${LOTO_PAYOUT_PER_HIT_K}.`);
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

function hasMilestone20yPredictionCache(expectedLatestDate = null) {
    const fsSync = require('fs');
    const statsDir = path.join(DATA_DIR, 'statistics');
    const cachePath = path.join(statsDir, 'cached_milestone20y_prediction.json');
    const livePath = path.join(statsDir, 'cached_milestone20y_live_predictions.json');
    if (!fsSync.existsSync(cachePath) || !fsSync.existsSync(livePath)) return false;
    if (!expectedLatestDate) return true;

    try {
        const cache = JSON.parse(fsSync.readFileSync(cachePath, 'utf8'));
        const latest = normalizeDateValue(cache?.latestDataDate || cache?.nextPrediction?.dataIsoDate);
        const predictionYear = getMilestone20yPredictionYear(cache, expectedLatestDate);
        const baselinePath = predictionYear
            ? path.join(statsDir, `cached_milestone20y_baseline_${predictionYear}.json`)
            : null;
        const baseline = baselinePath && fsSync.existsSync(baselinePath)
            ? JSON.parse(fsSync.readFileSync(baselinePath, 'utf8'))
            : null;
        if (!isMilestone20yBaselineCurrent(baseline, predictionYear)) {
            console.log(`[Cache Check] Local Mốc 20 năm baseline missing/stale for year=${predictionYear || 'unknown'}.`);
            return false;
        }
        if (latest === expectedLatestDate && isMilestone20yFormulaCurrent(cache)) return true;
        if (!isMilestone20yFormulaCurrent(cache)) {
            const version = cache?.config?.methodVersion || 'unknown';
            console.log(`[Cache Check] Local Mốc 20 năm cache stale schema: version=${version}, expected=${MILESTONE20Y_METHOD_VERSION}.`);
            return false;
        }
        console.log(`[Cache Check] Local Mốc 20 năm cache stale: latest=${latest || 'unknown'}, expected=${expectedLatestDate}.`);
        return false;
    } catch (error) {
        console.log(`[Cache Check] Local Mốc 20 năm cache unreadable: ${error.message}`);
        return false;
    }
}

async function hasMilestone20yPredictionCacheOnR2(expectedLatestDate = null) {
    if (!getR2PublicUrl() || process.env.UPDATE_CHECK_R2_MILESTONE20Y === '0') return true;
    try {
        const cache = await readStatsJsonFromR2('cached_milestone20y_prediction.json');
        const live = await readStatsJsonFromR2('cached_milestone20y_live_predictions.json');
        const cacheLatest = normalizeDateValue(cache && (cache.latestDataDate || cache.nextPrediction?.dataIsoDate));
        const liveLatest = normalizeDateValue(live && live.latestDataDate);
        if (!cache || !live) return false;
        const predictionYear = getMilestone20yPredictionYear(cache, expectedLatestDate);
        const baseline = predictionYear
            ? await readStatsJsonFromR2(`cached_milestone20y_baseline_${predictionYear}.json`).catch(() => null)
            : null;
        if (!isMilestone20yBaselineCurrent(baseline, predictionYear)) {
            console.log(`[Cache Check] R2 Mốc 20 năm baseline missing/stale for year=${predictionYear || 'unknown'}.`);
            return false;
        }
        if (!isMilestone20yFormulaCurrent(cache)) {
            const version = cache?.config?.methodVersion || 'unknown';
            console.log(`[Cache Check] R2 Mốc 20 năm cache stale schema: version=${version}, expected=${MILESTONE20Y_METHOD_VERSION}.`);
            return false;
        }
        const liveCacheVersion = live?.config?.liveCacheVersion || live?.predictions?.[0]?.liveCacheVersion || '';
        if (liveCacheVersion !== MILESTONE20Y_LIVE_CACHE_VERSION) {
            console.log(`[Cache Check] R2 Mốc 20 năm live cache version stale: ${liveCacheVersion || 'missing'}, expected=${MILESTONE20Y_LIVE_CACHE_VERSION}.`);
            return false;
        }
        console.log(`[Cache Check] R2 Mốc 20 năm cache OK: cached latest=${cacheLatest || 'unknown'}, live latest=${liveLatest || 'unknown'}.`);
        if (expectedLatestDate && cacheLatest !== expectedLatestDate) {
            console.log(`[Cache Check] R2 Mốc 20 năm cache stale: latest=${cacheLatest || 'unknown'}, expected=${expectedLatestDate}.`);
            return false;
        }
        return true;
    } catch (error) {
        console.log(`[Cache Check] R2 Mốc 20 năm cache missing/stale: ${error.message}`);
        return false;
    }
}

async function hasPerformanceReportCacheOnR2() {
    if (!getR2PublicUrl() || process.env.UPDATE_CHECK_R2_PERFORMANCE_REPORT === '0') return true;
    try {
        const [cache, historyCache] = await Promise.all([
            readStatsJsonFromR2(PERFORMANCE_REPORT_CACHE_FILE),
            readStatsJsonFromR2(HISTORY_PERFORMANCE_REPORT_CACHE_FILE)
        ]);
        const hasSections = Boolean(cache?.de?.methods && cache?.loto?.methods);
        // Báo cáo hiệu quả đầy đủ được sinh theo yêu cầu vì backtest rất nặng.
        // Daily job chỉ cần giữ cache báo cáo hiện có hợp lệ; strategy mặc định
        // của Mốc 20 năm được xác định từ prediction snapshot, không từ report.
        const hasCurrentMainMethod = cache?.reportVersion === PERFORMANCE_REPORT_VERSION
            && Object.keys(cache?.de?.methods || {}).length > 0
            && Object.keys(cache?.loto?.methods || {}).length > 0;
        const hasHistory = Boolean(historyCache?.methods && historyCache?.period?.startDate);
        // The main Mốc 20 năm report controls the daily report refresh. The
        // separate Lịch sử performance artifact may be regenerated on demand;
        // do not make an old history artifact force the expensive main report
        // backtest on every daily run.
        if (!hasSections || !hasCurrentMainMethod) {
            console.log(`[Cache Check] R2 performance report cache stale/malformed (version=${cache?.reportVersion || 'missing'}, de=${cache?.de?.selectedMethodId || 'missing'}, loto=${cache?.loto?.selectedMethodId || 'missing'}).`);
            return false;
        }
        if (!hasHistory) {
            console.log('[Cache Check] R2 Lịch sử performance artifact missing; giữ trạng thái main report hợp lệ.');
        }
        console.log(`[Cache Check] R2 performance caches OK: main=${cache.generatedAt || 'unknown'}, history=${historyCache.generatedAt || 'unknown'}.`);
        return true;
    } catch (error) {
        console.log(`[Cache Check] R2 performance report cache missing/stale: ${error.message}`);
        return false;
    }
}

function nextIsoDate(value) {
    const normalized = normalizeDateValue(value);
    if (!normalized) return null;
    const date = new Date(`${normalized}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
}

async function hasPredictionHistoryCacheOnR2(expectedLatestDate = null) {
    if (!getR2PublicUrl() || process.env.UPDATE_CHECK_R2_PREDICTION_HISTORY === '0') return true;
    try {
        const history = await readStatsJsonFromR2('cached_prediction_history.json');
        const expectedPredictionDate = nextIsoDate(expectedLatestDate);
        const run = Array.isArray(history)
            ? history.find(item => normalizeDateValue(item?.predictionDate) === expectedPredictionDate)
            : null;
        const method = run?.summary?.methods?.deParallelBlock85Small65Hold70;
        const betNumbers = Array.isArray(method?.numbersToBet) ? method.numbersToBet.map(Number) : [];
        const intersections = Array.isArray(method?.intersectionNumbers)
            ? method.intersectionNumbers.map(Number)
            : [];
        const expectedUnits = betNumbers.length + intersections.length;
        const current = !!run
            && run.summary?.resolved !== true
            && normalizeDateValue(run.sourceDrawDate) === normalizeDateValue(expectedLatestDate)
            && method?.methodVersion === PREDICTION_HISTORY_METHOD_VERSION
            && betNumbers.length >= 35
            && betNumbers.length <= 50
            && Number(method.unitCount) === expectedUnits
            && expectedUnits === 50;
        console.log(
            `[Cache Check] R2 Lịch sử pending=${run?.predictionDate || 'missing'}, ` +
            `version=${method?.methodVersion || 'missing'}, bets=${betNumbers.length}, ` +
            `units=${method?.unitCount || 0}, expected=${expectedPredictionDate || 'unknown'}.`
        );
        return current;
    } catch (error) {
        console.log(`[Cache Check] R2 Lịch sử cache missing/stale: ${error.message}`);
        return false;
    }
}

async function hasDailyMethodAdvisorCacheOnR2(expectedLatestDate = null) {
    if (!getR2PublicUrl() || process.env.UPDATE_CHECK_R2_DAILY_ADVISOR === '0') return true;
    try {
        const cache = await readStatsJsonFromR2(DAILY_METHOD_ADVISOR_CACHE_FILE);
        const expectedPredictionDate = nextIsoDate(expectedLatestDate);
        const record = Array.isArray(cache?.records)
            ? cache.records.find(item => normalizeDateValue(item?.predictionDate) === expectedPredictionDate)
            : null;
        const issuedStrategyIds = new Set((record?.strategySnapshots || []).map(strategy => strategy.strategyId));
        const hasRequiredStrategies = DAILY_METHOD_ADVISOR_STRATEGY_CATALOG
            .every(strategy => issuedStrategyIds.has(strategy.id));
        const valid = cache?.version === DAILY_METHOD_ADVISOR_CACHE_VERSION
            && record?.main?.numbers?.length === 30
            && record?.hybrid?.numbers?.length === 30
            && record?.hybrid?.id === 'all-method-fixed30-consensus-v1'
            && Number(record?.hybrid?.methodCount || 0) >= 1
            && hasRequiredStrategies
            && record?.source?.strict;
        console.log(
            `[Cache Check] R2 Gợi ý=${record?.predictionDate || 'missing'}, ` +
            `version=${cache?.version || 'missing'}, strategies=${issuedStrategyIds.size}, valid=${valid}.`
        );
        return valid;
    } catch (error) {
        console.log(`[Cache Check] R2 Gợi ý cache missing/stale: ${error.message}`);
        return false;
    }
}

async function hasProbabilityScoreCacheOnR2(expectedLatestDate = null) {
    if (!getR2PublicUrl() || process.env.UPDATE_CHECK_R2_PROBABILITY_SCORE === '0') return true;
    try {
        const cache = await readStatsJsonFromR2(PROBABILITY_SCORE_CACHE_FILE);
        const expectedPredictionDate = nextIsoDate(expectedLatestDate);
        const record = Array.isArray(cache?.records)
            ? cache.records.find(item => normalizeDateValue(item?.predictionDate) === expectedPredictionDate)
            : null;
        const valid = cache?.version === 'probability-score-v2'
            && normalizeDateValue(cache?.latestDataDate) === normalizeDateValue(expectedLatestDate)
            && record?.pointInTimeLocked === true
            && record?.settled === false
            && record?.topNumbers?.length === 30
            && cache?.historicalAnalysis?.version === PROBABILITY_SCORE_HISTORY_VERSION
            && cache?.historicalAnalysis?.strictPointInTime === true
            && normalizeDateValue(cache?.historicalAnalysis?.source?.dataEnd) === normalizeDateValue(expectedLatestDate);
        console.log(`[Cache Check] R2 Điểm xác suất data=${cache?.latestDataDate || 'missing'}, dự báo=${record?.predictionDate || 'missing'}, valid=${valid}.`);
        return valid;
    } catch (error) {
        console.log(`[Cache Check] R2 Điểm xác suất cache missing/stale: ${error.message}`);
        return false;
    }
}

async function hasProbabilityDistributionCacheOnR2(expectedLatestDate = null) {
    if (!getR2PublicUrl() || process.env.UPDATE_CHECK_R2_PROBABILITY_DISTRIBUTION === '0') return true;
    try {
        const cache = await readStatsJsonFromR2(PROBABILITY_DISTRIBUTION_CACHE_FILE);
        const expectedPredictionDate = nextIsoDate(expectedLatestDate);
        const record = Array.isArray(cache?.records)
            ? cache.records.find(item => normalizeDateValue(item?.predictionDate) === expectedPredictionDate)
            : null;
        const valid = cache?.version === 'probability-distribution-v4'
            && normalizeDateValue(cache?.latestDataDate) === normalizeDateValue(expectedLatestDate)
            && record?.pointInTimeLocked === true
            && record?.settled === false
            && (record?.abstained === true || record?.topNumbers?.length === 30)
            && Array.isArray(record?.partitionSignals)
            && record.partitionSignals.length >= 8;
        console.log(`[Cache Check] R2 Phân bổ nhóm data=${cache?.latestDataDate || 'missing'}, dự báo=${record?.predictionDate || 'missing'}, valid=${valid}.`);
        return valid;
    } catch (error) {
        console.log(`[Cache Check] R2 cache Phân bổ nhóm missing/stale: ${error.message}`);
        return false;
    }
}

function generateLotoPredictionCache() {
    const skipBacktest = process.env.LOTO_SKIP_BACKTEST !== '0';
    const timeoutMs = Math.max(60_000, Number(process.env.LOTO_PREDICTION_TIMEOUT_MS || (skipBacktest ? 1_800_000 : 0)) || 0);
    runNodeScript([
        'scripts/backtest-loto-milestone20y.js',
        `--months=${process.env.LOTO_CACHE_MONTHS || '1,3,6'}`,
        `--method=${LOTO_METHOD_ID}`,
        `--strategies=${process.env.LOTO_MILESTONE_STRATEGY || 'chainSmallFirst,chainBlockFirst'}`,
        `--holds=${process.env.LOTO_MILESTONE_HOLD || '65,85'}`,
        `--aggregationMode=${LOTO_AGGREGATION_MODE}`,
        `--betCounts=${LOTO_BET_COUNTS.join(',')}`,
        `--stakeK=${LOTO_STAKE_PER_NUMBER_K}`,
        `--payoutK=${LOTO_PAYOUT_PER_HIT_K}`,
        '--writeCache=1',
        skipBacktest ? '--predictionOnly=1' : '--predictionOnly=0'
    ], skipBacktest
        ? 'Sinh/đối soát cache dự đoán Lô 27 vị trí theo Mốc 20 năm (không chạy backtest trong action).'
        : 'Sinh/đối soát cache dự đoán Lô 27 vị trí theo Mốc 20 năm + backtest tham khảo.', {
        NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=12288',
        BACKTEST_PROGRESS: process.env.BACKTEST_PROGRESS || '0'
    }, timeoutMs > 0 ? { timeoutMs } : {});
    didGenerateLotoCacheThisRun = true;
}

function generateProfitReportCache() {
    // This is an explicit/on-demand backtest, not part of the daily prediction
    // path. Keep a generous ceiling because strict PIT can take longer than
    // the normal cache refresh while the workflow itself has a longer limit.
    const timeoutMs = Math.max(
        3_600_000,
        Number(process.env.PROFIT_REPORT_TIMEOUT_MS || 0) || 0
    );
    runNodeScript('scripts/generate-profit-report-cache.js',
        'Sinh cache báo cáo hiệu quả từ đầu năm cho Đề và Lô từ raw data R2.', {
        NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=12288',
        LOTTERY_DATA_SOURCE: 'r2',
        LOTTERY_STATS_SOURCE: 'r2'
    }, timeoutMs > 0 ? { timeoutMs } : {});
    console.log('[ProfitReport] Đã sinh cached_profit_report_2026.json từ R2.');
}

async function generateLotoPredictionCacheIfNeeded(expectedLatestDate = null, context = '') {
    if (process.env.LOTO_GENERATE_CACHE === '0') {
        console.log('[6] LOTO_GENERATE_CACHE=0, bỏ qua sinh cache Lô.');
        return false;
    }

    await hydrateLotoLiveCacheFromR2();

    if (process.env.LOTO_FORCE_GENERATE_CACHE !== '1') {
        const trustR2 = Boolean(getR2PublicUrl() && process.env.UPDATE_CHECK_R2_LOTO !== '0');
        const cacheReady = trustR2
            ? await hasLotoPredictionCacheOnR2(expectedLatestDate)
            : hasLotoPredictionCache(expectedLatestDate);
        if (cacheReady) {
            const suffix = context ? ` (${context})` : '';
            console.log(`[Lô] Cache dự đoán đã mới nhất${expectedLatestDate ? ` cho ${expectedLatestDate}` : ''}${suffix}; bỏ qua tác vụ Lô 27 vị trí.`);
            return false;
        }
    } else {
        console.log('[Lô] LOTO_FORCE_GENERATE_CACHE=1, vẫn sinh lại cache Lô dù cache hiện tại có thể đã đủ.');
    }

    generateLotoPredictionCache();
    return true;
}

async function hydratePredictionHistoryFromR2() {
    if (!getR2PublicUrl()) return false;

    try {
        const history = await readStatsJsonFromR2('cached_prediction_history.json');
        if (!Array.isArray(history) || history.length === 0) {
            throw new Error('cached_prediction_history.json rỗng hoặc sai định dạng');
        }
        const historyPath = path.join(DATA_DIR, 'statistics', 'cached_prediction_history.json');
        await fs.mkdir(path.dirname(historyPath), { recursive: true });
        await fs.writeFile(historyPath, JSON.stringify(history, null, 0), 'utf8');
        console.log(`[Mốc 20 năm] Hydrate ${history.length} snapshot Lịch sử từ R2 trước khi gộp Edge75.`);
        return true;
    } catch (error) {
        console.warn(`[Mốc 20 năm] Không hydrate được snapshot Edge75 Lịch sử từ R2: ${error.message}`);
        return false;
    }
}

async function generateMilestone20yPredictionCache() {
    // The default strategy consumes the immutable D-1 Edge75 snapshot. Read it
    // from R2 at generation time so an old local cache cannot silently fall back.
    await hydratePredictionHistoryFromR2();
    const timeoutMs = Math.max(60_000, Number(process.env.MILESTONE20Y_PREDICTION_TIMEOUT_MS || 900_000) || 0);
    runNodeScript('scripts/generate-milestone-20y-cache.js',
        'Sinh/đối soát cache dự đoán Mốc 20 năm cho API/tab Mốc 20 năm.', {
        NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=12288',
        LOTTERY_DATA_SOURCE: process.env.MILESTONE20Y_DATA_SOURCE || process.env.LOTTERY_DATA_SOURCE || 'local',
        LOTTERY_STATS_SOURCE: process.env.MILESTONE20Y_STATS_SOURCE || process.env.LOTTERY_STATS_SOURCE || 'local'
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

async function hydrateMilestone20yLiveCacheFromR2() {
    if (!getR2PublicUrl()) return false;

    try {
        const remoteLive = await readStatsJsonFromR2('cached_milestone20y_live_predictions.json');
        if (!remoteLive || !Array.isArray(remoteLive.predictions)) return false;

        const livePath = path.join(DATA_DIR, 'statistics', 'cached_milestone20y_live_predictions.json');
        await fs.mkdir(path.dirname(livePath), { recursive: true });
        await fs.writeFile(livePath, JSON.stringify(remoteLive, null, 0), 'utf8');
        console.log(`[Mốc 20 năm] Hydrate ${remoteLive.predictions.length} bản ghi thực tế từ R2 trước khi kết toán.`);
        return true;
    } catch (error) {
        console.warn(`[Mốc 20 năm] Không hydrate được nhật ký R2, giữ dữ liệu local hiện có: ${error.message}`);
        return false;
    }
}

async function hydrateMilestone20yBaselineFromR2(expectedLatestDate) {
    if (!getR2PublicUrl()) return false;

    const predictionYear = getMilestone20yPredictionYear(null, expectedLatestDate);
    if (!predictionYear) {
        throw new Error(`Không xác định được năm baseline Mốc 20 năm từ latest=${expectedLatestDate || 'unknown'}.`);
    }

    const fileName = `cached_milestone20y_baseline_${predictionYear}.json`;
    try {
        const baseline = await readStatsJsonFromR2(fileName);
        if (!isMilestone20yBaselineCurrent(baseline, predictionYear)) {
            throw new Error(`baseline ${predictionYear} thiếu, rỗng hoặc sai version`);
        }
        const filePath = path.join(DATA_DIR, 'statistics', fileName);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(baseline, null, 0), 'utf8');
        console.log(`[Mốc 20 năm] Hydrate baseline ${predictionYear} từ R2; không tính lại mốc năm trong daily job.`);
        return true;
    } catch (error) {
        console.warn(`[Mốc 20 năm] Không hydrate được baseline ${predictionYear} từ R2: ${error.message}`);
        return false;
    }
}

function uploadR2StaticData(label = 'Upload raw data + statistics gzip lên Cloudflare R2.', extraEnv = {}) {
    if (process.env.SYNC_R2_AFTER_UPDATE !== '0') {
        runNodeScript('scripts/upload-to-r2.js', label, extraEnv);
        console.log('[6] Upload R2 thành công.');
        markRunStatus({
            didWork: true,
            r2Uploaded: true,
            uploadLabels: [...runStatus.uploadLabels, label]
        });
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
    const extraEnv = didEarlyR2Upload && !didGenerateLotoCacheThisRun
        ? { R2_UPLOAD_EXCLUDE_STATS_FILES: 'cached_loto_prediction.json,cached_loto_live_predictions.json' }
        : {};
    if (didEarlyR2Upload && !didGenerateLotoCacheThisRun) {
        console.log('[6] Cache Lô không sinh mới trong run này; giữ nguyên cached_loto_* hiện có trên R2 để tránh ghi đè stale local.');
    }
    uploadR2StaticData(didEarlyR2Upload
        ? 'Upload lại raw data + statistics gzip lên Cloudflare R2 sau bước Lô.'
        : 'Upload raw data + statistics gzip lên Cloudflare R2.', extraEnv);

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

function uploadOnlyMilestone20yCaches() {
    const fsSync = require('fs');
    const statsDir = path.join(DATA_DIR, 'statistics');
    const baselineFiles = fsSync.existsSync(statsDir)
        ? fsSync.readdirSync(statsDir)
            .filter(file => /^cached_milestone20y_baseline_\d{4}\.json$/.test(file))
            .filter(file => {
                try {
                    const year = Number(file.match(/(\d{4})/)?.[1]);
                    const payload = JSON.parse(fsSync.readFileSync(path.join(statsDir, file), 'utf8'));
                    return isMilestone20yBaselineCurrent(payload, year);
                } catch (error) {
                    console.warn(`[6] Bỏ qua baseline Mốc lỗi ${file}: ${error.message}`);
                    return false;
                }
            })
        : [];

    uploadR2StaticData('Upload riêng cache Mốc 20 năm lên Cloudflare R2.', {
        R2_UPLOAD_ONLY_STATS_FILES: [
            ...MILESTONE20Y_CACHE_FILES,
            ...baselineFiles
        ].join(',')
    });
}

function uploadOnlyPredictionCaches(options = {}) {
    const includeLoto = options.includeLoto !== false;
    const includeMilestone = options.includeMilestone !== false;
    const fsSync = require('fs');
    const statsDir = path.join(DATA_DIR, 'statistics');
    const baselineFiles = includeMilestone && fsSync.existsSync(statsDir)
        ? fsSync.readdirSync(statsDir)
            .filter(file => /^cached_milestone20y_baseline_\d{4}\.json$/.test(file))
            .filter(file => {
                try {
                    const year = Number(file.match(/(\d{4})/)?.[1]);
                    const payload = JSON.parse(fsSync.readFileSync(path.join(statsDir, file), 'utf8'));
                    const valid = isMilestone20yBaselineCurrent(payload, year);
                    if (!valid) {
                        console.warn(`[6] Không upload baseline Mốc 20 năm lỗi/rỗng: ${file}.`);
                    }
                    return valid;
                } catch (error) {
                    console.warn(`[6] Không đọc được baseline ${file}: ${error.message}`);
                    return false;
                }
            })
        : [];
    const lotoFiles = includeLoto
        ? ['cached_loto_prediction.json', 'cached_loto_live_predictions.json']
        : [];
    const performanceReportFiles = [
        PERFORMANCE_REPORT_CACHE_FILE,
        HISTORY_PERFORMANCE_REPORT_CACHE_FILE
    ].filter(file => fsSync.existsSync(path.join(statsDir, file)));
    const predictionHistoryFiles = ['cached_prediction_history.json', DAILY_METHOD_ADVISOR_CACHE_FILE, PROBABILITY_SCORE_CACHE_FILE, PROBABILITY_DISTRIBUTION_CACHE_FILE]
        .filter(file => fsSync.existsSync(path.join(statsDir, file)));
    if (!includeLoto) {
        console.log('[6] Upload riêng cache dự đoán nhưng giữ nguyên cached_loto_* trên R2 vì Lô không sinh mới trong run này.');
    }
    const uploadLabel = includeLoto && includeMilestone
        ? 'Upload riêng cache dự đoán Lô + Mốc 20 năm lên Cloudflare R2.'
        : includeLoto
            ? 'Upload riêng cache dự đoán Lô lên Cloudflare R2.'
            : 'Upload riêng cache dự đoán Mốc 20 năm lên Cloudflare R2.';
    uploadR2StaticData(uploadLabel, {
        R2_UPLOAD_ONLY_STATS_FILES: [
            ...lotoFiles,
            ...(includeMilestone ? MILESTONE20Y_CACHE_FILES : []),
            ...baselineFiles,
            ...predictionHistoryFiles,
            ...performanceReportFiles
        ].join(',')
    });
}

function generateDailyMethodAdvisorCache(options = {}) {
    runNodeScript(
        'scripts/generate-daily-method-advisor-cache.js',
        'Sinh cache Gợi ý phương pháp hàng ngày + dàn Kết hợp Z-score từ snapshot/R2.',
        {
            LOTTERY_DATA_SOURCE: 'r2',
            LOTTERY_STATS_SOURCE: 'r2',
            // The prediction history was just refreshed locally in this action.
            // Do not read its previous R2 copy before the upload stage completes.
            DAILY_ADVISOR_USE_LOCAL_HISTORY: options.useLocalHistory ? '1' : '0'
        },
        { timeoutMs: 300_000 }
    );
}

function generateProbabilityScoreCache(options = {}) {
    runNodeScript(
        'scripts/generate-probability-score-cache.js',
        'Sinh snapshot Điểm xác suất tương đối cho ngày kế tiếp từ R2.',
        {
            LOTTERY_DATA_SOURCE: 'r2',
            LOTTERY_STATS_SOURCE: 'r2',
            PROBABILITY_SCORE_USE_LOCAL_HISTORY: options.useLocalHistory ? '1' : '0'
        },
        { timeoutMs: 90_000 }
    );
}

function generateProbabilityDistributionCache() {
    runNodeScript(
        'scripts/generate-probability-distribution-cache.js',
        'Sinh snapshot phân bổ nhóm số cho ngày kế tiếp từ R2.',
        {
            LOTTERY_DATA_SOURCE: 'r2',
            LOTTERY_STATS_SOURCE: 'r2'
        },
        { timeoutMs: 90_000 }
    );
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

async function runDailyLotoOnlyMode() {
    // The daily Loto job must not enter the raw/statistics/simulation pipeline.
    // It consumes the already-published R2 raw snapshot, updates the immutable
    // live journal and uploads only the two Loto cache files.
    process.env.LOTTERY_DATA_SOURCE = 'r2';
    const rawData = await readCurrentRawData();
    const latestRawDate = getLatestDateValue(rawData);
    if (!latestRawDate) {
        throw new Error('Daily Loto-only không đọc được raw data mới nhất từ R2.');
    }

    await fs.writeFile(JSON_FILE, JSON.stringify(rawData, null, 0), 'utf8');
    process.env.LOTTERY_DATA_SOURCE = 'local';
    process.env.LOTTERY_STATS_SOURCE = 'local';
    process.env.LOTO_SKIP_BACKTEST = '1';
    process.env.SIMULATION_CACHE_DAYS = '0';

    const generated = await generateLotoPredictionCacheIfNeeded(
        latestRawDate,
        'daily-loto-only'
    );
    if (generated) {
        uploadOnlyLotoCaches();
    }

    await writeRunStatus({
        skipped: !generated,
        didWork: generated,
        predictionCacheRefreshed: generated,
        latestRawDate,
        reason: generated ? 'daily_loto_only_refreshed' : 'daily_loto_only_up_to_date'
    });
}

async function runDailyMilestone20yOnlyMode() {
    // Mốc 20 năm có chi phí lớn hơn các cache ngày. Tách luồng này khỏi raw,
    // statistics, Lịch sử và Lô để timeout của nó không hủy dữ liệu đã sinh.
    process.env.LOTTERY_DATA_SOURCE = 'r2';
    const rawData = await readCurrentRawData();
    const latestRawDate = getLatestDateValue(rawData);
    if (!latestRawDate) {
        throw new Error('Daily Mốc-only không đọc được raw data mới nhất từ R2.');
    }

    const cacheReady = process.env.MILESTONE20Y_FORCE_GENERATE_CACHE !== '1'
        && await hasMilestone20yPredictionCacheOnR2(latestRawDate);
    if (cacheReady) {
        console.log(`[Mốc 20 năm] Cache R2 đã đủ cho ${latestRawDate}; bỏ qua job nặng.`);
        await writeRunStatus({
            skipped: true,
            didWork: false,
            latestRawDate,
            reason: 'daily_milestone20y_up_to_date'
        });
        return;
    }

    await fs.writeFile(JSON_FILE, JSON.stringify(rawData, null, 0), 'utf8');
    process.env.LOTTERY_DATA_SOURCE = 'local';
    process.env.LOTTERY_STATS_SOURCE = 'local';

    await Promise.all([
        hydrateCoreStatsFromR2ForPredictionCache(),
        hydrateMilestone20yLiveCacheFromR2(),
        hydrateMilestone20yBaselineFromR2(latestRawDate)
    ]);
    await generateMilestone20yPredictionCache();
    uploadOnlyMilestone20yCaches();

    await writeRunStatus({
        skipped: false,
        didWork: true,
        predictionCacheRefreshed: true,
        r2Uploaded: true,
        latestRawDate,
        reason: 'daily_milestone20y_refreshed'
    });
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
    if (process.env.DAILY_MILESTONE20Y_ONLY === '1') {
        await runDailyMilestone20yOnlyMode();
        return;
    }
    if (process.env.DAILY_LOTO_ONLY === '1') {
        await runDailyLotoOnlyMode();
        return;
    }

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
    markRunStatus({ latestRawDate });
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
                            let r2KeysCovered = true;
                            try {
                                const r2Keys = await readStatsJsonFromR2('quick_stats_keys.json');
                                r2KeysCovered = hasRequiredQuickStatsKeyCoverage(Array.isArray(r2Keys) ? r2Keys : []);
                            } catch (r2KeysError) {
                                console.warn(`[Cache Check] Không kiểm tra được R2 quick_stats_keys coverage, sẽ sinh lại để an toàn: ${r2KeysError.message}`);
                                r2KeysCovered = false;
                            }
                            if (r2KeysCovered) {
                                console.log(`[Cache Check] R2 stats are up to date and coverage is complete (both at ${expectedDateStr}).`);
                                isStale = false;
                            } else {
                                isStale = true;
                            }
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

    if (!(await hasCurrentAnalysisCacheVersionOnR2())) {
        console.log('[Cache Check] Thuật toán/cache phân tích đã đổi. Buộc sinh lại Lịch sử và Chọn chuỗi dù raw data không đổi.');
        isStale = true;
    }

    const rawDataChanged = hasRawDataChanged(currentArray, finalArray);
    markRunStatus({ rawDataChanged });
    const trustR2LotoCache = Boolean(getR2PublicUrl() && process.env.UPDATE_CHECK_R2_LOTO !== '0');
    const lotoCacheMissing = trustR2LotoCache ? false : !hasLotoPredictionCache(latestRawDate);
    const r2LotoCacheMissing = !(await hasLotoPredictionCacheOnR2(latestRawDate));
    const trustR2MilestoneCache = Boolean(getR2PublicUrl() && process.env.UPDATE_CHECK_R2_MILESTONE20Y !== '0');
    const milestoneCacheMissing = trustR2MilestoneCache ? false : !hasMilestone20yPredictionCache(latestRawDate);
    const r2MilestoneCacheMissing = !(await hasMilestone20yPredictionCacheOnR2(latestRawDate));
    const r2PerformanceReportCacheMissing = !(await hasPerformanceReportCacheOnR2());
    const r2PredictionHistoryCacheMissing = !(await hasPredictionHistoryCacheOnR2(latestRawDate));
    const r2DailyAdvisorCacheMissing = !(await hasDailyMethodAdvisorCacheOnR2(latestRawDate));
    const r2ProbabilityScoreCacheMissing = !(await hasProbabilityScoreCacheOnR2(latestRawDate));
    const r2ProbabilityDistributionCacheMissing = !(await hasProbabilityDistributionCacheOnR2(latestRawDate));
    const onlyPredictionCacheNeedsRefresh = !rawDataChanged
        && !forceRegenerateStats
        && !isStale
        && (lotoCacheMissing || r2LotoCacheMissing || milestoneCacheMissing || r2MilestoneCacheMissing
            || r2PerformanceReportCacheMissing || r2PredictionHistoryCacheMissing || r2DailyAdvisorCacheMissing || r2ProbabilityScoreCacheMissing || r2ProbabilityDistributionCacheMissing);

    if (onlyPredictionCacheNeedsRefresh) {
        if (localRawOutOfSync) {
            await fs.writeFile(JSON_FILE, JSON.stringify(finalArray, null, 0), 'utf-8');
            console.log(`[3] Đồng bộ raw local tạm cho cache dự đoán (${latestLocalFileDate || 'none'} -> ${latestRawDate}).`);
        }
        console.log('[3] Stats R2 đã mới, chỉ sinh/đối soát cache dự đoán và upload riêng các file cache.');
        try {
            if (process.env.GENERATE_PROFIT_REPORT_CACHE === '1') {
                generateProfitReportCache();
            } else {
                console.log(r2PerformanceReportCacheMissing
                    ? '[6] Performance report cache thiếu/sai phương pháp; giữ lại để chạy bằng workflow thủ công, không chặn daily refresh.'
                    : '[6] Performance report cache đã đúng phương pháp; bỏ qua backtest report.');
            }
            await hydrateMilestone20yLiveCacheFromR2();
            await hydrateCoreStatsFromR2ForPredictionCache();
            const predictionHistoryService = require('../lib/services/predictionHistoryService');
            await predictionHistoryService.refreshLatestPendingPredictionHistory(90);
            generateDailyMethodAdvisorCache({ useLocalHistory: true });
            generateProbabilityScoreCache({ useLocalHistory: true });
            generateProbabilityDistributionCache();
            const didGenerateLoto = await generateLotoPredictionCacheIfNeeded(latestRawDate, 'prediction-cache-only');
            const didGenerateMilestone = process.env.MILESTONE20Y_GENERATE_CACHE !== '0';
            if (didGenerateMilestone) {
                await generateMilestone20yPredictionCache();
            } else {
                console.log('[6] MILESTONE20Y_GENERATE_CACHE=0, giữ nguyên cache Mốc 20 năm trên R2.');
            }
            markRunStatus({ predictionCacheRefreshed: true, didWork: true, reason: 'prediction_cache_refresh_only' });
            uploadOnlyPredictionCaches({
                includeLoto: didGenerateLoto,
                includeMilestone: didGenerateMilestone
            });
        } catch (predictionCacheErr) {
            console.error('⚠️ Lỗi khi sinh/upload cache dự đoán:', predictionCacheErr.message);
            process.exit(1);
        }
        await writeRunStatus();
        return;
    }

    if (!rawDataChanged
        && !forceRegenerateStats
        && !isStale
        && !lotoCacheMissing
        && !r2LotoCacheMissing
        && !milestoneCacheMissing
        && !r2MilestoneCacheMissing) {
        if (localRawOutOfSync) {
            await fs.writeFile(JSON_FILE, JSON.stringify(finalArray, null, 0), 'utf-8');
            console.log(`[3] RAW_DATA R2 đã mới nhất; chỉ đồng bộ file local tạm (${latestLocalFileDate || 'none'} -> ${latestRawDate}) rồi bỏ qua generate stats.`);
        }
        console.log(`[3] RAW_DATA không đổi (latest=${latestRawDate}, rows=${finalArray.length}, source=${source}). Bỏ qua generate stats để tiết kiệm Action time.`);
        await writeRunStatus({ skipped: true, reason: 'up_to_date' });
        return;
    }
    if (lotoCacheMissing) {
        console.log('[3] Cache Lô local đang thiếu, vẫn chạy workflow để sinh cached_loto_prediction.json và cached_loto_live_predictions.json.');
    }
    if (r2LotoCacheMissing) {
        console.log('[3] Cache Lô trên R2 đang thiếu, vẫn chạy workflow để sinh/upload lại cached_loto_prediction.json và cached_loto_live_predictions.json.');
    }
    if (milestoneCacheMissing) {
        console.log('[3] Cache Mốc 20 năm local đang thiếu, vẫn chạy workflow để sinh cached_milestone20y_prediction.json và cached_milestone20y_live_predictions.json.');
    }
    if (r2MilestoneCacheMissing) {
        console.log('[3] Cache Mốc 20 năm trên R2 đang thiếu, vẫn chạy workflow để sinh/upload lại cached_milestone20y_prediction.json và cached_milestone20y_live_predictions.json.');
    }

    if (rawDataChanged || forceRegenerateStats || isStale || localRawOutOfSync || r2LotoCacheMissing || lotoCacheMissing || r2MilestoneCacheMissing || milestoneCacheMissing) {
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
    markRunStatus({ statsRegenerated: true, didWork: true, reason: rawDataChanged ? 'raw_data_changed' : 'stats_or_cache_stale' });
    
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

            const quickStatsKeys = Object.keys(minifiedQS || {})
                .filter(key => key !== '_meta' && hasRecordQuickStatsData(minifiedQS[key]))
                .sort();
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
                generateDailyMethodAdvisorCache({ useLocalHistory: true });
                generateProbabilityScoreCache({ useLocalHistory: true });
                generateProbabilityDistributionCache();
            } catch (histErr) {
                console.error('⚠️ Lỗi khi đồng bộ lịch sử/Gợi ý hằng ngày:', histErr.message);
            }

            try {
                const didGenerateLoto = await generateLotoPredictionCacheIfNeeded(latestRawDate, 'db mode');
                if (didGenerateLoto) {
                    markRunStatus({ predictionCacheRefreshed: true, didWork: true });
                }
            } catch (lotoErr) {
                console.error('⚠️ Lỗi khi sinh cache Lô cho DB mode:', lotoErr.message);
            }

            try {
                await hydrateMilestone20yLiveCacheFromR2();
                await generateMilestone20yPredictionCache();
                markRunStatus({ predictionCacheRefreshed: true, didWork: true });
            } catch (milestoneErr) {
                console.error('⚠️ Lỗi khi sinh cache Mốc 20 năm cho DB mode:', milestoneErr.message);
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
                let predictionHistorySimulation = null;
                const staticCacheDays = getSimulationCacheDays();
                const staticCacheModes = getSimulationCachePlayModes();
                console.log(`    Cache simulation: days=${staticCacheDays.join(',')}, modes=${staticCacheModes.join(',')}`);
                for (const days of staticCacheDays) {
                    for (const playMode of staticCacheModes) {
                        const simulationOptions = {
                            compactDetails: days > 90,
                            selectedStreakDetailLimit: days <= 90 ? 1000 : undefined,
                            playMode,
                            clearHistoryCacheInterval: Number(process.env.BACKTEST_CLEAR_HISTORY_CACHE_INTERVAL || 30)
                        };
                        if (days === 90 && playMode === 'both') {
                            simulationOptions.methodIds = PREDICTION_HISTORY_METHOD_IDS.join(',');
                        }
                        const simulationResult = await simulationService.runBacktest(days, null, simulationOptions);
                        const fileName = playMode === 'both' ? `cached_simulation_${days}.json` : `cached_simulation_${days}_${playMode}.json`;
                        await fs.writeFile(path.join(DATA_DIR, 'statistics', fileName), JSON.stringify(simulationResult, null, 0));
                        console.log(`✅ Đã lưu kết quả ${fileName}`);
                        if (days === 90 && playMode === 'both') {
                            predictionHistorySimulation = simulationResult;
                        }
                        if (he.clearStaticHistoryCaches) he.clearStaticHistoryCaches();
                    }
                }

                const predictionHistoryService = require('../lib/services/predictionHistoryService');
                if (process.env.PREDICTION_HISTORY_INCREMENTAL === '1') {
                    console.log('    Lịch sử: chỉ kết toán snapshot mới nhất và sinh dự đoán ngày kế tiếp.');
                    await predictionHistoryService.refreshLatestPendingPredictionHistory(90);
                } else {
                    await predictionHistoryService.generateLocalPredictionHistoryFromSimulation(90, predictionHistorySimulation);
                }
                generateDailyMethodAdvisorCache({ useLocalHistory: true });
                generateProbabilityScoreCache({ useLocalHistory: true });
                generateProbabilityDistributionCache();

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

            if (process.env.MILESTONE20Y_GENERATE_CACHE !== '0') {
                try {
                    await hydrateMilestone20yLiveCacheFromR2();
                    await generateMilestone20yPredictionCache();
                    markRunStatus({ predictionCacheRefreshed: true, didWork: true });
                } catch (milestoneErr) {
                    console.error('⚠️ Lỗi khi sinh cache Mốc 20 năm (không ảnh hưởng các cache khác):', milestoneErr.message);
                }
            } else {
                console.log('[6] MILESTONE20Y_GENERATE_CACHE=0, bỏ qua sinh cache Mốc 20 năm.');
            }

            await writeVerifiedAnalysisCacheVersion();
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
                    const didGenerateLoto = await generateLotoPredictionCacheIfNeeded(latestRawDate, 'static mode');
                    if (didGenerateLoto) {
                        markRunStatus({ predictionCacheRefreshed: true, didWork: true });
                    }
                } catch (lotoErr) {
                    console.error('⚠️ Lỗi khi sinh cache Lô (không ảnh hưởng các cache khác):', lotoErr.message);
                }
            } else {
                console.log('[6] LOTO_GENERATE_CACHE=0, bỏ qua sinh cache Lô.');
            }

            if (process.env.GENERATE_PROFIT_REPORT_CACHE === '1') {
                generateProfitReportCache();
            } else {
                console.log(r2PerformanceReportCacheMissing
                    ? '[6] Performance report cache thiếu/sai phương pháp; giữ lại để chạy bằng workflow thủ công, không chặn daily refresh.'
                    : '[6] Performance report cache đã đúng phương pháp; bỏ qua backtest report.');
            }
        }
        
    } catch (err) {
        console.error('Lỗi khi chạy Generators:', err.message);
        process.exit(1);
    }
    
    console.log(`[5] Hoàn tất Update Workflow (${dbStatsActive ? 'Supabase DB' : 'Static JSON'}).`);
    syncRemoteAfterStaticGeneration();
    await writeRunStatus();
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
