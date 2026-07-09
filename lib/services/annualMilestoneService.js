const fs = require('fs');
const path = require('path');
const lotteryService = require('./lotteryService');
const historicalExclusionService = require('./historicalExclusionService');
const exclusionLogic = require('./exclusionLogicService');
const { isInvalidStatsKey } = require('../utils/statsOptionsManifest');
const { getCategoryName } = require('../utils/patternNaming');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BET_PER_NUMBER_K = 10;
const DEFAULT_WIN_MULTIPLIER = 84;
const DEFAULT_HISTORY_YEARS = 20;
const DEFAULT_BET_STRATEGY = 'deParallelBlock85Small65';
const DEFAULT_BET_TARGET = 70;
const BASELINE_CACHE_VERSION = 'annual20y-baseline-2026-06-28-block-ab';
const MILESTONE20Y_METHOD_VERSION = 'annual20y-2026-07-02-chain-block-hold70-immutable-details';
const LIVE_CACHE_VERSION = 'annual20y-live-compact-v3';
// Strategies added after initial live cache generation that need to be backfilled into old rows
const BACKFILL_STRATEGIES = ['deParallelBlock85Small65'];
const LOCAL_PREDICTION_FILE = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_milestone20y_prediction.json');
const LOCAL_LIVE_FILE = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_milestone20y_live_predictions.json');
const LOCAL_STATS_DIR = path.join(process.cwd(), 'lib', 'data', 'statistics');
const _baselineMemoryCache = new Map();

const STRATEGIES = {
    chainSmallFirst: {
        id: 'chainSmallFirst',
        name: 'Chuỗi nhỏ trước',
        defaultTarget: 80,
        description: 'Vẫn giữ Tier 1/2/3, nhưng khi cùng Tier sẽ ưu tiên chuỗi có tập số nhỏ trước để giảm nhiễu từ các chuỗi quá rộng.',
        type: 'chain'
    },
    chainBlockFirst: {
        id: 'chainBlockFirst',
        name: 'Nhịp block trước',
        defaultTarget: 80,
        description: 'Vẫn giữ Tier 1/2/3, nhưng khi cùng Tier sẽ ưu tiên các chuỗi nhịp block A/B trước. Backtest Mốc 20 năm cho thấy biến thể này giảm tỷ lệ loại nhầm ở mức Hold 70.',
        type: 'chain'
    },
    chainCredibleFirst: {
        id: 'chainCredibleFirst',
        name: 'Chuỗi đủ tin cậy trước',
        defaultTarget: 70,
        description: 'Giữ thứ tự Tier nhưng ưu tiên chuỗi có cận trên xác suất tiếp diễn thấp hơn xác suất nền của tập số, sau khi xét cỡ mẫu.',
        type: 'chain'
    },
    chainFreqFirst: {
        id: 'chainFreqFirst',
        name: 'Tần suất thấp trước',
        defaultTarget: 90,
        description: 'Vẫn giữ Tier, sau đó ưu tiên chuỗi có tần suất HT/Target thấp nhất theo mốc 20 năm.',
        type: 'chain'
    },
    chainRiskFirst: {
        id: 'chainRiskFirst',
        name: 'Rủi ro cao trước',
        defaultTarget: 90,
        description: 'Vẫn giữ Tier, sau đó ưu tiên chuỗi có xác suất gãy/không hình thành cao nhất.',
        type: 'chain'
    },
    numberAvgRisk: {
        id: 'numberAvgRisk',
        name: 'Rủi ro TB từng số',
        defaultTarget: 80,
        description: 'Mỗi số nhận điểm từ toàn bộ chuỗi chứa nó, lấy trung bình rủi ro có hiệu chỉnh theo tần suất, mẫu và độ rộng tập số.',
        type: 'number'
    },
    numberConsensusRisk: {
        id: 'numberConsensusRisk',
        name: 'Đồng thuận từng số',
        defaultTarget: 80,
        description: 'Ưu tiên số bị nhiều chuỗi rủi ro cao cùng đề xuất loại, tránh phụ thuộc vào một chuỗi đơn lẻ.',
        type: 'number'
    },
    numberPosteriorDiversity: {
        id: 'numberPosteriorDiversity',
        name: 'Posterior đa dạng chuỗi',
        defaultTarget: 70,
        description: 'Làm trơn Beta-Binomial cho rủi ro gãy, khử tập số trùng và chỉ cộng bằng chứng mạnh nhất từ các họ chuỗi khác nhau.',
        type: 'number'
    },
    numberLikelihoodRatio: {
        id: 'numberLikelihoodRatio',
        name: 'Likelihood ratio bảo thủ',
        defaultTarget: 70,
        description: 'So sánh cận trên xác suất chuỗi tiếp tục với xác suất nền theo độ rộng tập số; chỉ cộng bằng chứng loại từ các họ chuỗi độc lập.',
        type: 'number'
    },
    numberWeightedRisk: {
        id: 'numberWeightedRisk',
        name: 'Trọng số membership',
        defaultTarget: 80,
        description: 'Cộng trọng số rủi ro của các chuỗi chứa số đó, số xuất hiện trong nhiều chuỗi loại mạnh sẽ được đẩy lên trước.',
        type: 'number'
    },
    activeOnlyAvgRisk: {
        id: 'activeOnlyAvgRisk',
        name: 'Chỉ chuỗi đang diễn ra',
        defaultTarget: 55,
        description: 'Chỉ tính các chuỗi đã hình thành và đang diễn ra, bỏ các chuỗi tiềm năng chưa hình thành.',
        type: 'number'
    },
    dedupEdge50Hold: {
        id: 'dedupEdge50Hold',
        name: 'Dự đoán Edge (Không Boost)',
        defaultTarget: 70,
        description: 'Dự đoán số dựa trên hiệu số rủi ro gãy thực tế so với nền (Deduplicated Edge), không sử dụng cộng hưởng chuỗi.',
        type: 'number'
    },
    dedupEdge50CombinedB40S05: {
        id: 'dedupEdge50CombinedB40S05',
        name: 'Dự đoán Edge + Boost (B40S05)',
        defaultTarget: 70,
        description: 'Dự đoán Edge kết hợp cộng hưởng Nhịp Block (40%) và Chuỗi Nhỏ (5%). Cho hiệu suất cao nhất và ổn định tuyệt đối trong 20 năm.',
        type: 'number'
    },
    deParallelBlock85Small65: {
        id: 'deParallelBlock85Small65',
        name: 'Đề Song Song (Block 85 · Small 65)',
        defaultTarget: 70,
        description: 'Đánh song song hai phương pháp Nhịp Block trước (Hold 85) và Chuỗi nhỏ trước (Hold 65). Số trùng được đánh gấp đôi tiền.',
        type: 'number'
    }
};

const STRATEGY_IDS = Object.keys(STRATEGIES);
const NUMBER_SCORE_STRATEGIES = new Set(STRATEGY_IDS.filter(id => STRATEGIES[id].type === 'number'));
const DEFAULT_TARGETS = [20, 23, 24, 25, 26, 27, 28, 30, 32, 33, 34, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];
const DEFAULT_PRESETS = [
    { id: 'profit', label: 'Đề Song Song (Block 85 · Small 65)', strategy: DEFAULT_BET_STRATEGY, target: DEFAULT_BET_TARGET },
    { id: 'deBoostHold70', label: 'Đề Boost B40S05 · Hold 70', strategy: 'dedupEdge50CombinedB40S05', target: 70 },
    { id: 'deBoostHold80', label: 'Đề Boost B40S05 · Hold 80', strategy: 'dedupEdge50CombinedB40S05', target: 80 },
    { id: 'deEdgeHold70', label: 'Đề Edge (Không Boost) · Hold 70', strategy: 'dedupEdge50Hold', target: 70 },
    { id: 'deEdgeHold80', label: 'Đề Edge (Không Boost) · Hold 80', strategy: 'dedupEdge50Hold', target: 80 },
    { id: 'balanced', label: 'Cân bằng', strategy: 'numberConsensusRisk', target: 34 },
    { id: 'highHit', label: 'Xác suất cao', strategy: 'numberAvgRisk', target: 28 },
    { id: 'maxHit', label: 'Trúng tối đa còn lãi mỏng', strategy: 'numberAvgRisk', target: 23 }
];

function parseDate(value) {
    return historicalExclusionService.parseDate(value);
}

function formatDisplayDate(date) {
    return historicalExclusionService.formatDate(date);
}

function formatIsoDate(date) {
    const parsed = date instanceof Date ? date : parseDate(date);
    if (!parsed) return '';
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function addDays(date, days) {
    const parsed = date instanceof Date ? new Date(date) : parseDate(date);
    if (!parsed) return null;
    parsed.setDate(parsed.getDate() + days);
    return parsed;
}

function diffYears(start, end) {
    return Math.max(0.01, (end - start) / MS_PER_DAY / 365.25);
}

function toSpecialNumber(row) {
    const parsed = parseInt(row && row.special, 10);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 99 ? parsed : null;
}

function normalizeNumberList(values = []) {
    return Array.from(new Set((values || [])
        .map(value => Number(value))
        .filter(value => Number.isInteger(value) && value >= 0 && value <= 99)))
        .sort((a, b) => a - b);
}

function parseStatsKey(key = '') {
    if (String(key).includes(':')) {
        const [category, subcategory] = String(key).split(':');
        return { category, subcategory };
    }
    return { category: String(key), subcategory: '' };
}

function looksLikeRawStatsTitle(value, key = '') {
    const text = String(value || '').trim();
    if (!text) return true;
    if (key && text === String(key)) return true;
    return /^[A-Za-z0-9_]+(?::[A-Za-z0-9_]+)?$/.test(text);
}

function isReadableStatsTitle(value, key = '') {
    const text = String(value || '').trim();
    if (looksLikeRawStatsTitle(text, key)) return false;
    return !/[A-Za-z0-9]+_[A-Za-z0-9_]+/.test(text);
}

function getDisplayTitleForKey(key, stat = {}) {
    try {
        const { category, subcategory } = parseStatsKey(key);
        const namedTitle = getCategoryName(category, subcategory, key);
        if (isReadableStatsTitle(namedTitle, key)) {
            return namedTitle;
        }
    } catch (error) {
        // Keep the raw key fallback below; display naming must not break cache generation.
    }

    const explicitTitle = stat.description || stat.title || stat.label || '';
    if (isReadableStatsTitle(explicitTitle, key)) {
        return String(explicitTitle);
    }

    return explicitTitle || key;
}

function getPatternStep(key = '') {
    const lowerKey = String(key).toLowerCase();
    const isAlternatingGapPattern = (lowerKey.includes('vesole') || lowerKey.includes('solemoi')) &&
        !lowerKey.includes('tienluisole') &&
        !lowerKey.includes('luitiensole') &&
        !lowerKey.includes('soletheocap') &&
        !/block\d+x\d+sole/.test(lowerKey);
    return isAlternatingGapPattern ? 2 : 1;
}

function isBlockPattern(candidateOrKey) {
    const key = typeof candidateOrKey === 'string'
        ? candidateOrKey
        : candidateOrKey?.key;
    return /block\d+x\d+sole/i.test(String(key || ''));
}

function round(value, digits = 2) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    const factor = 10 ** digits;
    return Math.round(number * factor) / factor;
}

function flattenStats(allStats) {
    const rows = [];
    const add = (key, data) => {
        if (isInvalidStatsKey(key)) return;
        if (!data || !Array.isArray(data.streaks)) return;
        rows.push({ key, categoryData: data });
    };

    for (const [key, value] of Object.entries(allStats || {})) {
        if (value && Array.isArray(value.streaks)) {
            add(key, value);
        } else if (value && typeof value === 'object') {
            for (const [subKey, subValue] of Object.entries(value)) {
                add(`${key}:${subKey}`, subValue);
            }
        }
    }
    return rows;
}

function buildStatsIndex() {
    const allStats = historicalExclusionService.loadAllStats();
    const entries = new Map();
    for (const row of flattenStats(allStats)) {
        entries.set(row.key, row.categoryData);
    }
    return entries;
}

function buildAnnualBaseline(entries, year, options = {}) {
    if (!(entries instanceof Map) || entries.size === 0) {
        throw new Error(
            `Không thể tạo baseline Mốc 20 năm ${year}: thống kê đầu vào rỗng.`
        );
    }
    const historyYears = Number(options.historyYears || DEFAULT_HISTORY_YEARS);
    const cutoff = new Date(year - 1, 11, 31);
    const start = new Date(cutoff);
    start.setFullYear(start.getFullYear() - historyYears);
    start.setDate(start.getDate() + 1);
    const actualYears = diffYears(start, addDays(cutoff, 1));
    const baseline = new Map();

    for (const [key, categoryData] of entries.entries()) {
        const exactCounts = new Map();
        let recordLen = 0;
        let sample = 0;
        for (const streak of categoryData.streaks || []) {
            const end = parseDate(streak.endDate);
            if (!end || end < start || end > cutoff) continue;
            const len = Number(streak.length) || 0;
            if (len <= 0) continue;
            sample++;
            recordLen = Math.max(recordLen, len);
            exactCounts.set(len, (exactCounts.get(len) || 0) + 1);
        }
        const cumulative = new Map();
        for (let len = recordLen; len >= 1; len--) {
            cumulative.set(len, (cumulative.get(len + 1) || 0) + (exactCounts.get(len) || 0));
        }
        baseline.set(key, {
            key,
            year,
            cutoffIso: formatIsoDate(cutoff),
            startIso: formatIsoDate(start),
            actualYears,
            sample,
            recordLen,
            exactCounts,
            cumulative
        });
    }
    return baseline;
}

function assertAnnualBaselineUsable(baseline, year) {
    if (!(baseline instanceof Map) || baseline.size === 0) {
        throw new Error(
            `Baseline Mốc 20 năm ${year} không có dữ liệu; dừng sinh dự đoán để tránh xếp sai toàn bộ Tier.`
        );
    }
    const first = baseline.values().next().value;
    if (!first?.startIso || !first?.cutoffIso) {
        throw new Error(
            `Baseline Mốc 20 năm ${year} thiếu khoảng thời gian lịch sử; dừng sinh dự đoán.`
        );
    }
    return baseline;
}

function getBaselineCacheFile(year) {
    return path.join(LOCAL_STATS_DIR, `cached_milestone20y_baseline_${year}.json`);
}

function serializeCountMap(map) {
    return Object.fromEntries(Array.from((map || new Map()).entries()).map(([key, value]) => [String(key), value]));
}

function deserializeCountMap(value) {
    const map = new Map();
    for (const [key, count] of Object.entries(value || {})) {
        const numericKey = Number(key);
        if (Number.isFinite(numericKey)) map.set(numericKey, Number(count) || 0);
    }
    return map;
}

function serializeBaselineMap(baseline, metadata = {}) {
    assertAnnualBaselineUsable(baseline, metadata.year || 'không xác định');
    return {
        version: BASELINE_CACHE_VERSION,
        generatedAt: new Date().toISOString(),
        ...metadata,
        entries: Array.from((baseline || new Map()).entries()).map(([key, row]) => ({
            key,
            year: row.year,
            cutoffIso: row.cutoffIso,
            startIso: row.startIso,
            actualYears: row.actualYears,
            sample: row.sample,
            recordLen: row.recordLen,
            exactCounts: serializeCountMap(row.exactCounts),
            cumulative: serializeCountMap(row.cumulative)
        }))
    };
}

function deserializeBaselinePayload(payload) {
    const baseline = new Map();
    for (const row of payload?.entries || []) {
        if (!row || !row.key) continue;
        baseline.set(row.key, {
            key: row.key,
            year: row.year,
            cutoffIso: row.cutoffIso,
            startIso: row.startIso,
            actualYears: row.actualYears,
            sample: row.sample,
            recordLen: row.recordLen,
            exactCounts: deserializeCountMap(row.exactCounts),
            cumulative: deserializeCountMap(row.cumulative)
        });
    }
    return baseline;
}

function isBaselinePayloadCurrent(payload, year, historyYears) {
    const expectedCutoffIso = `${Number(year) - 1}-12-31`;
    return payload
        && payload.version === BASELINE_CACHE_VERSION
        && Number(payload.year) === Number(year)
        && Number(payload.historyYears || DEFAULT_HISTORY_YEARS) === Number(historyYears || DEFAULT_HISTORY_YEARS)
        && payload.cutoffIso === expectedCutoffIso
        && Array.isArray(payload.entries)
        && payload.entries.length > 0
        && payload.entries.every(row =>
            row
            && Number(row.year) === Number(year)
            && row.cutoffIso === expectedCutoffIso
        );
}

function ensureAnnualBaseline(entries, year, options = {}) {
    const historyYears = Number(options.historyYears || DEFAULT_HISTORY_YEARS);
    const cacheKey = `${year}:${historyYears}:${BASELINE_CACHE_VERSION}`;
    if (!options.forceBaseline && _baselineMemoryCache.has(cacheKey)) {
        return _baselineMemoryCache.get(cacheKey);
    }

    const filePath = getBaselineCacheFile(year);
    if (!options.forceBaseline && process.env.MILESTONE20Y_FORCE_BASELINE !== '1') {
        const cached = loadLocalJson(filePath, null);
        if (isBaselinePayloadCurrent(cached, year, historyYears)) {
            const baseline = deserializeBaselinePayload(cached);
            _baselineMemoryCache.set(cacheKey, baseline);
            return baseline;
        }
    }

    const baseline = buildAnnualBaseline(entries, year, options);
    assertAnnualBaselineUsable(baseline, year);
    if (options.writeBaseline !== false) {
        const payload = serializeBaselineMap(baseline, {
            year,
            historyYears,
            cutoffIso: baseline.values().next().value?.cutoffIso || `${year - 1}-12-31`,
            startIso: baseline.values().next().value?.startIso || '',
            source: 'generated-once-per-prediction-year'
        });
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 0), 'utf8');
    }
    _baselineMemoryCache.set(cacheKey, baseline);
    return baseline;
}

function getAnnualMetric(baseline, key, baseLen, step, isPotential) {
    const row = baseline.get(key);
    const actualYears = row ? row.actualYears : DEFAULT_HISTORY_YEARS;
    const recordLen = row ? Number(row.recordLen || 0) : 0;
    const cumulative = row ? row.cumulative : new Map();
    const currentCount = cumulative.get(baseLen) || 0;
    const nextCount = cumulative.get(baseLen + step) || 0;
    const upperLen = Math.max(recordLen, baseLen);
    let exposureCount = 0;
    for (let len = baseLen; len <= upperLen; len += step) {
        exposureCount += cumulative.get(len) || 0;
    }
    const exposureFrequencyPerYear = exposureCount / actualYears;
    const reachedFrequencyPerYear = currentCount / actualYears;
    const continuationFrequencyPerYear = nextCount / actualYears;
    const riskRate = currentCount > 0 ? 1 - (nextCount / currentCount) : 1;

    return {
        recordLen,
        currentCount,
        nextCount,
        exposureCount,
        exposureFrequencyPerYear,
        reachedFrequencyPerYear,
        continuationFrequencyPerYear,
        riskRate,
        actualYears,
        neverFormed: recordLen === 0 || currentCount === 0,
        isPotential
    };
}

function resolveNumbers(stat, key) {
    const { category, subcategory } = parseStatsKey(key);
    return normalizeNumberList(
        exclusionLogic.resolveNumbersForPattern(stat, key, category, subcategory, require('../controllers/suggestionsController'))
    );
}

function buildCandidatesForDate(targetDateDisplay, baseline, options = {}) {
    const historyYears = Number(options.historyYears || DEFAULT_HISTORY_YEARS);
    const activeFrequencyLimit = Number(options.activeFrequencyLimit ?? 0.5);
    const recordFrequencyLimit = Number(options.recordFrequencyLimit ?? 1.1);
    const minPotentialCurrentLenForNeverFormed = Number(options.minPotentialCurrentLenForNeverFormed ?? 4);
    const quickStats = historicalExclusionService.computeQuickStatsForDateFast(targetDateDisplay, historyYears, {
        useFullHistoryStats: false
    });
    const candidates = [];

    for (const [key, stat] of Object.entries(quickStats || {})) {
        if (key === '_meta' || !stat || !stat.current || isInvalidStatsKey(key)) continue;
        const step = getPatternStep(key);
        const currentLen = Number(stat.current.length || 0);
        if (!Number.isFinite(currentLen) || currentLen <= 0) continue;

        const isPotential = !!stat.current.isPotential;
        const baseLen = isPotential ? currentLen + step : currentLen;
        if (baseLen < 2) continue;

        const numbers = resolveNumbers(stat, key);
        if (!numbers || numbers.length === 0 || numbers.length >= 100) continue;

        const metric = getAnnualMetric(baseline, key, baseLen, step, isPotential);
        const targetLen = baseLen + step;
        const neverFormedPriority = metric.neverFormed && (!isPotential || currentLen >= minPotentialCurrentLenForNeverFormed);
        const isRecordOrSuper = metric.recordLen > 0 && (baseLen >= metric.recordLen || targetLen > metric.recordLen);
        const tier = (neverFormedPriority || isRecordOrSuper)
            ? 1
            : (!isPotential && metric.exposureFrequencyPerYear < activeFrequencyLimit)
                ? 2
                : (metric.exposureFrequencyPerYear <= recordFrequencyLimit ? 3 : 4);
        const scarcityScore = 1 / (1 + Math.max(0, metric.exposureFrequencyPerYear));
        const score = (tier === 1 ? 1000 : tier === 2 ? 700 : tier === 3 ? 400 : 0) +
            metric.riskRate * 100 +
            scarcityScore * 50 +
            Math.min(40, numbers.length ? 30 / numbers.length : 0);

        candidates.push({
            key,
            title: getDisplayTitleForKey(key, stat),
            currentLen,
            baseLen,
            targetLen,
            tier,
            score,
            numbers,
            isPotential,
            isRecordOrSuper,
            maxStreak: metric.recordLen,
            targetAvgGapDays: stat.targetAvgGapDays ?? null,
            targetDaysSinceLatestEnd: stat.targetDaysSinceLatestEnd ?? null,
            ...metric
        });
    }

    return candidates.sort(compareCandidatesForStrategy('chainSmallFirst'));
}

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
}

function wilsonLower(successes, trials, z = 1.64) {
    const n = Math.max(0, Number(trials || 0));
    if (n <= 0) return 0;
    const p = clamp(Number(successes || 0) / n);
    const z2 = z * z;
    const center = p + z2 / (2 * n);
    const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
    return clamp((center - margin) / (1 + z2 / n));
}

function wilsonUpper(successes, trials, z = 1.28) {
    const n = Math.max(0, Number(trials || 0));
    if (n <= 0) return 1;
    const p = clamp(Number(successes || 0) / n);
    const z2 = z * z;
    const center = p + z2 / (2 * n);
    const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
    return clamp((center + margin) / (1 + z2 / n));
}

function getPosteriorBreakRisk(candidate) {
    const trials = Math.max(0, Number(candidate.currentCount || 0));
    const continues = Math.min(trials, Math.max(0, Number(candidate.nextCount || 0)));
    const breaks = Math.max(0, trials - continues);
    let alpha = 1.5;
    let beta = 1.5;
    if (candidate.neverFormed) {
        alpha = 8;
        beta = 2;
    } else if (candidate.isRecordOrSuper) {
        alpha = 6;
        beta = 2;
    } else if (candidate.tier === 2) {
        alpha = 4;
        beta = 2.5;
    } else if (candidate.tier === 3) {
        alpha = 3;
        beta = 3;
    }
    const posteriorMean = (breaks + alpha) / Math.max(1, trials + alpha + beta);
    const lower = trials > 0
        ? wilsonLower(breaks, trials)
        : posteriorMean * 0.72;
    const rawRisk = clamp(candidate.riskRate || 0);
    return clamp(posteriorMean * 0.62 + lower * 0.28 + rawRisk * 0.1);
}

function getPatternEvidenceFamily(key = '') {
    const normalized = String(key).toLowerCase();
    if (/block\d+x\d+sole/.test(normalized)) return 'block';
    if (/^(bo_|bo:)/.test(normalized)) return 'fixed-set';
    if (/^(dau_dit|dau-dit|dau.*dit)/.test(normalized)) return 'head-tail';
    if (/^(dau_|dau:)/.test(normalized)) return 'head';
    if (/^(dit_|dit:)/.test(normalized)) return 'tail';
    if (/^(tong_moi|tong_tt|tong_|tong:)/.test(normalized)) return 'sum';
    if (/^(hieu_|hieu:)/.test(normalized)) return 'difference';
    if (/^(so_|so:|dong_)/.test(normalized)) return 'number';
    if (/(chan|le|to|nho|nguyen_to|hop_so)/.test(normalized)) return 'class';
    return normalized.split(/[:_]/)[0] || 'other';
}

function getPosteriorEvidenceScore(candidate) {
    const trials = Math.max(0, Number(candidate.currentCount || 0));
    const posteriorRisk = getPosteriorBreakRisk(candidate);
    const sampleReliability = trials > 0
        ? Math.sqrt(trials / (trials + 12))
        : (candidate.neverFormed ? 0.48 : 0.12);
    const scarcity = 1 / (1 + Math.max(0, Number(candidate.exposureFrequencyPerYear || 0)));
    const specificity = 1 / Math.sqrt(Math.max(1, candidate.numbers?.length || 100));
    const tierSignal = candidate.tier === 1 ? 1
        : candidate.tier === 2 ? 0.76
            : candidate.tier === 3 ? 0.52
                : 0.16;
    const activeSignal = candidate.isPotential ? 0 : 1;
    const recordSignal = candidate.isRecordOrSuper ? 1 : 0;
    return clamp(
        posteriorRisk * (0.52 + sampleReliability * 0.28) +
        scarcity * 0.07 +
        specificity * 0.05 +
        tierSignal * 0.045 +
        activeSignal * 0.02 +
        recordSignal * 0.025
    );
}

function getCandidateRiskScore(candidate) {
    const tierWeight = candidate.tier === 1 ? 1
        : candidate.tier === 2 ? 0.82
            : candidate.tier === 3 ? 0.65
                : 0.2;
    const frequencyScarcity = 1 / (1 + Math.max(0, candidate.exposureFrequencyPerYear || 0));
    const sampleReliability = candidate.currentCount > 0
        ? Math.min(1, Math.log1p(candidate.currentCount) / Math.log(50))
        : (candidate.neverFormed ? 0.62 : 0.18);
    const groupFocus = 1 / Math.sqrt(Math.max(1, candidate.numbers ? candidate.numbers.length : 100));
    const recordBoost = candidate.isRecordOrSuper ? 0.14 : 0;
    const base = clamp(candidate.riskRate || 0) * 0.52
        + frequencyScarcity * 0.22
        + sampleReliability * 0.18
        + groupFocus * 0.08
        + recordBoost;
    return base * tierWeight;
}

function compareCandidatesForStrategy(strategy) {
    return (a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        if (strategy === 'chainBlockFirst') {
            const blockDiff = Number(isBlockPattern(b)) - Number(isBlockPattern(a));
            if (blockDiff) return blockDiff;
            if (a.numbers.length !== b.numbers.length) return a.numbers.length - b.numbers.length;
            if (a.exposureFrequencyPerYear !== b.exposureFrequencyPerYear) {
                return a.exposureFrequencyPerYear - b.exposureFrequencyPerYear;
            }
            if (b.riskRate !== a.riskRate) return b.riskRate - a.riskRate;
        } else if (strategy === 'chainCredibleFirst') {
            const evidenceDiff = getLikelihoodExclusionEvidence(b) -
                getLikelihoodExclusionEvidence(a);
            if (evidenceDiff) return evidenceDiff;
            if (a.numbers.length !== b.numbers.length) return a.numbers.length - b.numbers.length;
            if (a.exposureFrequencyPerYear !== b.exposureFrequencyPerYear) {
                return a.exposureFrequencyPerYear - b.exposureFrequencyPerYear;
            }
            if (b.riskRate !== a.riskRate) return b.riskRate - a.riskRate;
        } else if (strategy === 'chainSmallFirst') {
            if (a.numbers.length !== b.numbers.length) return a.numbers.length - b.numbers.length;
            if (b.riskRate !== a.riskRate) return b.riskRate - a.riskRate;
            if (a.exposureFrequencyPerYear !== b.exposureFrequencyPerYear) {
                return a.exposureFrequencyPerYear - b.exposureFrequencyPerYear;
            }
        } else if (strategy === 'chainFreqFirst') {
            if (a.exposureFrequencyPerYear !== b.exposureFrequencyPerYear) {
                return a.exposureFrequencyPerYear - b.exposureFrequencyPerYear;
            }
            if (b.riskRate !== a.riskRate) return b.riskRate - a.riskRate;
            if (a.numbers.length !== b.numbers.length) return a.numbers.length - b.numbers.length;
        } else if (strategy === 'chainRiskFirst') {
            if (b.riskRate !== a.riskRate) return b.riskRate - a.riskRate;
            if (a.exposureFrequencyPerYear !== b.exposureFrequencyPerYear) {
                return a.exposureFrequencyPerYear - b.exposureFrequencyPerYear;
            }
            if (a.numbers.length !== b.numbers.length) return a.numbers.length - b.numbers.length;
        }
        if (b.score !== a.score) return b.score - a.score;
        if (b.riskRate !== a.riskRate) return b.riskRate - a.riskRate;
        return a.key.localeCompare(b.key);
    };
}

function getNumberMemberships(num, candidates, strategy) {
    return candidates
        .filter(item => item.tier <= 3 && item.numbers.includes(num))
        .filter(item => strategy !== 'activeOnlyAvgRisk' || !item.isPotential);
}

function rankNumbersByPosteriorDiversity(candidates) {
    const diversityWeights = [1, 0.72, 0.52, 0.38, 0.28, 0.2];
    return ALL_NUMBERS.map(num => {
        const memberships = getNumberMemberships(num, candidates, 'numberPosteriorDiversity');
        if (memberships.length === 0) {
            return { num, score: 0, memberships: 0, topChains: [] };
        }

        const deduplicated = new Map();
        for (const item of memberships) {
            const family = getPatternEvidenceFamily(item.key);
            const numberSignature = item.numbers.slice().sort((a, b) => a - b).join(',');
            const signature = `${family}|${numberSignature}`;
            const score = getPosteriorEvidenceScore(item);
            const existing = deduplicated.get(signature);
            if (!existing || score > existing.score) {
                deduplicated.set(signature, { item, family, score });
            }
        }

        const strongestByFamily = new Map();
        for (const row of deduplicated.values()) {
            const existing = strongestByFamily.get(row.family);
            if (!existing || row.score > existing.score) {
                strongestByFamily.set(row.family, row);
            }
        }
        const diverse = [...strongestByFamily.values()]
            .sort((a, b) => b.score - a.score);
        const weightedRows = diverse.slice(0, diversityWeights.length);
        const weightTotal = weightedRows.reduce((sum, row, index) => sum + diversityWeights[index], 0);
        const posteriorConsensus = weightTotal > 0
            ? weightedRows.reduce((sum, row, index) => sum + row.score * diversityWeights[index], 0) / weightTotal
            : 0;
        const tier1Families = new Set(
            diverse.filter(row => row.item.tier === 1).map(row => row.family)
        ).size;
        const activeFamilies = new Set(
            diverse.filter(row => !row.item.isPotential).map(row => row.family)
        ).size;
        const diversityBonus = Math.min(0.11, Math.log1p(diverse.length) * 0.038);
        const tier1Bonus = Math.min(0.1, tier1Families * 0.035);
        const activeBonus = Math.min(0.04, activeFamilies * 0.008);
        return {
            num,
            rank: 0,
            score: posteriorConsensus + diversityBonus + tier1Bonus + activeBonus,
            memberships: deduplicated.size,
            topChains: diverse.slice(0, 3).map(row => row.item)
        };
    }).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.memberships !== a.memberships) return b.memberships - a.memberships;
        return a.num - b.num;
    }).map((row, index) => ({ ...row, rank: index + 1 }));
}

function getLikelihoodExclusionEvidence(candidate) {
    const setSize = Math.max(1, Math.min(99, candidate.numbers?.length || 100));
    const baseProbability = setSize / 100;
    const trials = Math.max(0, Number(candidate.currentCount || 0));
    const continues = Math.min(trials, Math.max(0, Number(candidate.nextCount || 0)));
    if (trials <= 0) return 0;

    // Shrink về xác suất nền của chính tập số, sau đó dùng cận trên 90%.
    // Chỉ loại khi ngay cả ước lượng bảo thủ vẫn thấp hơn xác suất nền.
    const priorWeight = 12;
    const posteriorContinue = (
        continues + priorWeight * baseProbability
    ) / (trials + priorWeight);
    const conservativeContinue = Math.max(
        posteriorContinue,
        wilsonUpper(continues, trials)
    );
    if (conservativeContinue >= baseProbability) return 0;

    const reliability = Math.sqrt(trials / (trials + 20));
    const tierWeight = candidate.tier === 1 ? 1
        : candidate.tier === 2 ? 0.82
            : candidate.tier === 3 ? 0.62
                : 0;
    const activeWeight = candidate.isPotential ? 0.82 : 1;
    const logEvidence = Math.log(baseProbability / Math.max(1e-6, conservativeContinue));
    return Math.max(0, logEvidence * reliability * tierWeight * activeWeight);
}

function rankNumbersByLikelihoodRatio(candidates) {
    const diversityWeights = [1, 0.7, 0.5, 0.35, 0.25, 0.18];
    return ALL_NUMBERS.map(num => {
        const strongestByFamily = new Map();
        for (const candidate of getNumberMemberships(num, candidates, 'numberLikelihoodRatio')) {
            const evidence = getLikelihoodExclusionEvidence(candidate);
            if (evidence <= 0) continue;
            const family = getPatternEvidenceFamily(candidate.key);
            const numberSignature = candidate.numbers.slice().sort((a, b) => a - b).join(',');
            const signature = `${family}|${numberSignature}`;
            const existing = strongestByFamily.get(family);
            if (!existing || evidence > existing.evidence) {
                strongestByFamily.set(family, {
                    candidate,
                    evidence,
                    signature
                });
            }
        }
        const diverse = [...strongestByFamily.values()]
            .sort((a, b) => b.evidence - a.evidence)
            .slice(0, diversityWeights.length);
        const score = diverse.reduce(
            (sum, row, index) => sum + row.evidence * diversityWeights[index],
            0
        );
        return {
            num,
            rank: 0,
            score,
            memberships: diverse.length,
            topChains: diverse.slice(0, 3).map(row => row.candidate)
        };
    }).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.memberships !== a.memberships) return b.memberships - a.memberships;
        return a.num - b.num;
    }).map((row, index) => ({ ...row, rank: index + 1 }));
}
function rankNumbersByDeduplicatedEdge(candidates, blockBoostVal, smallBoostVal) {
    const baselineWeight = 0.5;
    const groupedSets = new Map();
    for (const item of candidates || []) {
        const nums = item.numbers || [];
        if (nums.length === 0) continue;
        const observedDropoff = item.riskRate ?? 1;
        const setKey = nums.slice().sort((a,b)=>a-b).join(',');
        const group = groupedSets.get(setKey) || { nums, rateSum: 0, count: 0, contributors: [] };
        group.rateSum += observedDropoff;
        group.count += 1;
        group.contributors.push({
            item,
            key: item.key || '',
            title: item.title || '',
            dropOffRate: observedDropoff,
            isPotential: !!item.isPotential
        });
        groupedSets.set(setKey, group);
    }

    const scores = Array.from({ length: 100 }, (_, number) => ({
        number,
        edgeSum: 0,
        edgeCount: 0,
        maxEdge: -1,
        contributors: []
    }));
    for (const group of groupedSets.values()) {
        const observedDropoff = group.rateSum / Math.max(1, group.count);
        const baselineDropoff = 1 - (group.nums.length / 100);
        
        let boost = 1;
        const hasBlock = group.contributors.some(c => isBlockPattern(c.key));
        if (hasBlock) boost += blockBoostVal;
        const hasSmall = group.nums.length <= 20;
        if (hasSmall) boost += smallBoostVal;

        const edge = (observedDropoff - (baselineWeight * baselineDropoff)) * boost;
        for (const number of group.nums) {
            const row = scores[number];
            row.edgeSum += edge;
            row.edgeCount += 1;
            row.maxEdge = Math.max(row.maxEdge, edge);
            row.contributors.push(...group.contributors.map(item => ({
                ...item,
                setSize: group.nums.length,
                baselineDropoff,
                edge
            })));
        }
    }

    return scores.map(row => {
        const score = row.edgeCount > 0 ? row.edgeSum / row.edgeCount : -1;
        return {
            num: row.number,
            rank: 0,
            score,
            scorePercent: round(score * 100, 1),
            memberships: row.edgeCount,
            topChains: row.contributors.slice(0, 3).map(c => c.item)
        };
    }).sort((a, b) => {
        const aMaxEdge = scores[a.num].maxEdge;
        const bMaxEdge = scores[b.num].maxEdge;
        const aEdgeCount = scores[a.num].edgeCount;
        const bEdgeCount = scores[b.num].edgeCount;
        if (b.score !== a.score) return b.score - a.score;
        if (bMaxEdge !== aMaxEdge) return bMaxEdge - aMaxEdge;
        if (bEdgeCount !== aEdgeCount) return bEdgeCount - aEdgeCount;
        return a.num - b.num;
    }).map((row, index) => ({ ...row, rank: index + 1 }));
}

function rankNumbersByMembership(candidates, strategy) {
    if (strategy === 'numberPosteriorDiversity') {
        return rankNumbersByPosteriorDiversity(candidates);
    }
    if (strategy === 'numberLikelihoodRatio') {
        return rankNumbersByLikelihoodRatio(candidates);
    }
    if (strategy === 'dedupEdge50Hold' || strategy === 'dedupEdge50CombinedB40S05') {
        const blockBoost = strategy === 'dedupEdge50CombinedB40S05' ? 0.4 : 0;
        const smallBoost = strategy === 'dedupEdge50CombinedB40S05' ? 0.05 : 0;
        return rankNumbersByDeduplicatedEdge(candidates, blockBoost, smallBoost);
    }
    return ALL_NUMBERS.map(num => {
        const memberships = getNumberMemberships(num, candidates, strategy);
        if (memberships.length === 0) {
            return { num, score: 0, memberships: 0, topChains: [] };
        }
        const scores = memberships
            .map(item => ({ item, score: getCandidateRiskScore(item) }))
            .sort((a, b) => b.score - a.score);
        const sumScore = scores.reduce((sum, row) => sum + row.score, 0);
        const avgScore = sumScore / scores.length;
        const top3Avg = scores.slice(0, 3).reduce((sum, row) => sum + row.score, 0) / Math.min(3, scores.length);
        const tier1Count = scores.filter(row => row.item.tier === 1).length;
        const consensus = Math.log1p(scores.length) * 0.08 + tier1Count * 0.06;
        let score;
        if (strategy === 'numberWeightedRisk') {
            score = sumScore + avgScore * 0.5 + consensus;
        } else if (strategy === 'numberConsensusRisk') {
            score = top3Avg + consensus + Math.min(0.3, scores.length * 0.018);
        } else {
            score = avgScore + top3Avg * 0.35 + consensus;
        }
        return {
            num,
            rank: 0,
            score,
            scorePercent: round(score * 100, 1),
            memberships: scores.length,
            topChains: scores.slice(0, 3).map(row => row.item)
        };
    }).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.memberships !== a.memberships) return b.memberships - a.memberships;
        return a.num - b.num;
    }).map((row, index) => ({ ...row, rank: index + 1 }));
}

function serializeChain(candidate) {
    return {
        key: candidate.key,
        title: getDisplayTitleForKey(candidate.key, candidate),
        tier: candidate.tier,
        tierLabel: candidate.tier === 1 ? 'Tier 1' : candidate.tier === 2 ? 'Tier 2' : candidate.tier === 3 ? 'Tier 3' : 'Tier 4',
        score: round(candidate.score, 1),
        numberRiskScore: round(getCandidateRiskScore(candidate) * 100, 1),
        currentLen: candidate.currentLen,
        baseLen: candidate.baseLen,
        targetLen: candidate.targetLen,
        recordLen: candidate.recordLen,
        riskRate: round(candidate.riskRate, 4),
        riskPercent: round(candidate.riskRate * 100, 1),
        exposureFrequencyPerYear: round(candidate.exposureFrequencyPerYear, 3),
        currentCount: candidate.currentCount,
        nextCount: candidate.nextCount,
        numbers: candidate.numbers.map(num => String(num).padStart(2, '0'))
    };
}

function serializeNumberScore(row) {
    return {
        rank: row.rank,
        number: String(row.num).padStart(2, '0'),
        score: round(row.score, 5),
        scorePercent: round(row.score * 100, 1),
        supportCount: row.memberships,
        contributors: (row.topChains || []).map(serializeChain)
    };
}

function buildPredictionFromNumberScores(candidates, targetExcluded, strategy) {
    const ranked = rankNumbersByMembership(candidates, strategy);
    const excluded = ranked.slice(0, targetExcluded).map(row => row.num).sort((a, b) => a - b);
    const excludedSet = new Set(excluded);
    const topChains = [];
    const seen = new Set();
    for (const row of ranked.slice(0, targetExcluded)) {
        for (const chain of row.topChains) {
            if (seen.has(chain.key)) continue;
            seen.add(chain.key);
            topChains.push(chain);
            if (topChains.length >= 30) break;
        }
        if (topChains.length >= 30) break;
    }
    return {
        strategy,
        targetExcluded,
        excludedNumbers: excluded.map(num => String(num).padStart(2, '0')),
        betNumbers: ALL_NUMBERS.filter(num => !excludedSet.has(num)).map(num => String(num).padStart(2, '0')),
        ranking: ranked.map(serializeNumberScore),
        selectedChains: topChains.map(serializeChain)
    };
}

function buildPrediction(candidates, targetExcluded, strategy = 'chainSmallFirst') {
    if (strategy === 'deParallelBlock85Small65') {
        const p1 = buildPrediction(candidates, 85, 'chainBlockFirst');
        const p2 = buildPrediction(candidates, 65, 'chainSmallFirst');
        
        const b1 = new Set(p1.betNumbers.map(Number));
        const b2 = new Set(p2.betNumbers.map(Number));
        const union = new Set([...b1, ...b2]);
        const intersection = new Set([...b1].filter(n => b2.has(n)));
        
        const betNumbers = Array.from(union).sort((a,b)=>a-b).map(n => String(n).padStart(2, '0'));
        const intersectionNumbers = Array.from(intersection).sort((a,b)=>a-b).map(n => String(n).padStart(2, '0'));
        const excludedNumbers = ALL_NUMBERS.filter(n => !union.has(n)).map(n => String(n).padStart(2, '0'));
        
        return {
            strategy,
            targetExcluded,
            excludedNumbers,
            betNumbers,
            intersectionNumbers,
            selectedChains: [...(p1.selectedChains || []), ...(p2.selectedChains || [])].slice(0, 120)
        };
    }

    if (NUMBER_SCORE_STRATEGIES.has(strategy)) {
        return buildPredictionFromNumberScores(candidates, targetExcluded, strategy);
    }

    const orderedCandidates = candidates.slice().sort(compareCandidatesForStrategy(strategy));
    const excluded = new Set();
    const selectedChains = [];

    for (const candidate of orderedCandidates.filter(item => item.tier <= 3)) {
        const additions = candidate.numbers
            .filter(num => !excluded.has(num))
            .sort((a, b) => a - b);
        if (additions.length > 0) selectedChains.push(candidate);
        for (const num of additions) {
            excluded.add(num);
            if (excluded.size >= targetExcluded) break;
        }
        if (excluded.size >= targetExcluded) break;
    }

    if (excluded.size < targetExcluded) {
        const numberScores = ALL_NUMBERS
            .filter(num => !excluded.has(num))
            .map(num => {
                const memberships = candidates.filter(item => item.numbers.includes(num));
                const totalScore = memberships.reduce((sum, item) => sum + item.score, 0);
                const avgScore = memberships.length > 0 ? totalScore / memberships.length : 0;
                return { num, score: totalScore + avgScore, memberships: memberships.length };
            })
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (b.memberships !== a.memberships) return b.memberships - a.memberships;
                return a.num - b.num;
            });
        for (const row of numberScores) {
            excluded.add(row.num);
            if (excluded.size >= targetExcluded) break;
        }
    }

    const excludedNumbers = [...excluded].sort((a, b) => a - b);
    const excludedSet = new Set(excludedNumbers);
    return {
        strategy,
        targetExcluded,
        excludedNumbers: excludedNumbers.map(num => String(num).padStart(2, '0')),
        betNumbers: ALL_NUMBERS.filter(num => !excludedSet.has(num)).map(num => String(num).padStart(2, '0')),
        selectedChains: selectedChains.slice(0, 120).map(serializeChain)
    };
}

function settlePrediction(prediction, actualNumber, options = {}) {
    const actual = Number(actualNumber);
    const betNumbers = normalizeNumberList(prediction.betNumbers);
    const excludedNumbers = normalizeNumberList(prediction.excludedNumbers);
    const intersectionNumbers = normalizeNumberList(prediction.intersectionNumbers || []);
    const intersectSet = new Set(intersectionNumbers);

    const hit = betNumbers.includes(actual);
    const baseStake = Number(options.betPerNumberK || BET_PER_NUMBER_K);

    let stakeK = 0;
    for (const num of betNumbers) {
        const weight = intersectSet.has(num) ? 2 : 1;
        stakeK += weight * baseStake;
    }

    let payoutK = 0;
    if (hit) {
        const weight = intersectSet.has(actual) ? 2 : 1;
        payoutK = weight * baseStake * Number(options.winMultiplier || DEFAULT_WIN_MULTIPLIER);
    }

    return {
        resolved: Number.isInteger(actual),
        actual: Number.isInteger(actual) ? String(actual).padStart(2, '0') : null,
        hit,
        betCount: betNumbers.length,
        excludedCount: excludedNumbers.length,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK
    };
}

function compactLivePrediction(prediction = {}, preserveExplanation = false) {
    const compact = {
        strategy: prediction.strategy,
        targetExcluded: prediction.targetExcluded,
        excludedNumbers: prediction.excludedNumbers || [],
        betNumbers: prediction.betNumbers || []
    };
    if (preserveExplanation && Array.isArray(prediction.selectedChains)) {
        compact.selectedChains = prediction.selectedChains;
        compact.explanationIntegrity = prediction.explanationIntegrity
            || 'published-with-prediction';
    }
    return compact;
}

function compactLiveStrategies(strategies = {}) {
    const compact = {};
    for (const [strategyId, strategy] of Object.entries(strategies || {})) {
        compact[strategyId] = {
            id: strategy.id || strategyId,
            name: strategy.name,
            defaultTarget: strategy.defaultTarget,
            type: strategy.type,
            holds: {}
        };
        for (const [target, prediction] of Object.entries(strategy.holds || {})) {
            compact[strategyId].holds[target] = compactLivePrediction(
                prediction,
                strategyId === DEFAULT_BET_STRATEGY && Number(target) === DEFAULT_BET_TARGET
            );
        }
    }
    return compact;
}

function settleLiveRow(row = {}, actual, config = {}) {
    row.status = 'settled';
    row.actualSpecial = String(actual).padStart(2, '0');
    row.results = {};
    for (const [strategyId, strategy] of Object.entries(row.strategies || {})) {
        for (const [target, prediction] of Object.entries(strategy.holds || {})) {
            row.results[`${strategyId}:hold${target}`] = settlePrediction(prediction, actual, config);
        }
    }
    return row;
}

function settleLiveRowOnce(row = {}, actual, config = {}) {
    if (row.status === 'settled') return row;
    return settleLiveRow(row, actual, config);
}

function predictionNumbersMatch(left = {}, right = {}) {
    const canonical = values => normalizeNumberList(values).sort((a, b) => a - b).join(',');
    return canonical(left.excludedNumbers) === canonical(right.excludedNumbers)
        && canonical(left.betNumbers) === canonical(right.betNumbers);
}

function lockPredictionToPublished(freshPrediction = {}, publishedPrediction = {}) {
    const numbersMatch = predictionNumbersMatch(freshPrediction, publishedPrediction);
    const locked = {
        ...freshPrediction,
        ...publishedPrediction,
        excludedNumbers: publishedPrediction.excludedNumbers || [],
        betNumbers: publishedPrediction.betNumbers || []
    };

    if (Array.isArray(publishedPrediction.selectedChains)) {
        locked.selectedChains = publishedPrediction.selectedChains;
        locked.explanationIntegrity = publishedPrediction.explanationIntegrity
            || 'published-with-prediction';
    } else if (numbersMatch && Array.isArray(freshPrediction.selectedChains)) {
        locked.selectedChains = freshPrediction.selectedChains;
        locked.explanationIntegrity = 'rehydrated-after-number-match';
    } else {
        delete locked.selectedChains;
        locked.explanationIntegrity = 'unavailable-number-mismatch';
    }
    return locked;
}

function lockStrategiesToPublished(freshStrategies = {}, publishedStrategies = {}) {
    const locked = {};
    for (const [strategyId, publishedStrategy] of Object.entries(publishedStrategies || {})) {
        const freshStrategy = freshStrategies?.[strategyId] || {};
        const holds = {};
        let allHoldsMatch = true;
        for (const [target, publishedPrediction] of Object.entries(publishedStrategy.holds || {})) {
            const freshPrediction = freshStrategy.holds?.[target] || {};
            const matches = predictionNumbersMatch(freshPrediction, publishedPrediction);
            allHoldsMatch = allHoldsMatch && matches;
            holds[target] = lockPredictionToPublished(freshPrediction, publishedPrediction);
        }
        locked[strategyId] = {
            ...freshStrategy,
            ...publishedStrategy,
            holds
        };
        if (Array.isArray(publishedStrategy.ranking)) {
            locked[strategyId].ranking = publishedStrategy.ranking;
        } else if (!allHoldsMatch) {
            delete locked[strategyId].ranking;
        }
    }
    return locked;
}

function lockNextPredictionToPublished(nextPrediction = {}, publishedRow = null) {
    if (!publishedRow || publishedRow.status === 'settled') return nextPrediction;
    return {
        ...nextPrediction,
        predictionDate: publishedRow.predictionDate || nextPrediction.predictionDate,
        predictionIsoDate: publishedRow.predictionIsoDate || nextPrediction.predictionIsoDate,
        baseline: publishedRow.baseline || nextPrediction.baseline,
        summary: publishedRow.summary || nextPrediction.summary,
        strategies: lockStrategiesToPublished(
            nextPrediction.strategies,
            publishedRow.strategies
        ),
        presets: publishedRow.presets || nextPrediction.presets,
        pointInTimeLocked: true,
        publishedAt: publishedRow.generatedAt || null,
        publishedLiveCacheVersion: publishedRow.liveCacheVersion || null
    };
}

function getSortedRawData() {
    return (lotteryService.getRawData() || [])
        .filter(row => row && row.date && row.special !== null && row.special !== undefined)
        .slice()
        .sort((a, b) => parseDate(a.date) - parseDate(b.date));
}

function buildPredictionBundleForDate(targetDate, options = {}) {
    const target = targetDate instanceof Date ? targetDate : parseDate(targetDate);
    if (!target) throw new Error('Ngày dự đoán không hợp lệ.');
    const year = target.getFullYear();
    const entries = options.entries || buildStatsIndex();
    const baseline = assertAnnualBaselineUsable(
        options.baseline || ensureAnnualBaseline(entries, year, options),
        year
    );
    const targetDisplay = formatDisplayDate(target);
    const candidates = buildCandidatesForDate(targetDisplay, baseline, options);
    const targetOptions = Array.from(new Set((options.targets || DEFAULT_TARGETS)
        .map(value => Number(value))
        .filter(value => Number.isInteger(value) && value > 0 && value < 100)))
        .sort((a, b) => a - b);
    const strategyIds = (options.strategies || STRATEGY_IDS).filter(id => STRATEGIES[id]);
    const strategies = {};
    for (const strategyId of strategyIds) {
        const holds = {};
        let ranking = null;
        for (const targetExcluded of targetOptions) {
            const prediction = buildPrediction(candidates, targetExcluded, strategyId);
            if (prediction.ranking && !ranking) ranking = prediction.ranking;
            if (prediction.ranking) delete prediction.ranking;
            holds[String(targetExcluded)] = prediction;
        }
        strategies[strategyId] = {
            ...STRATEGIES[strategyId],
            ...(ranking ? { ranking } : {}),
            holds
        };
    }

    return {
        predictionDate: targetDisplay,
        predictionIsoDate: formatIsoDate(target),
        baseline: {
            year,
            historyYears: Number(options.historyYears || DEFAULT_HISTORY_YEARS),
            cutoffIso: baseline.values().next().value?.cutoffIso || `${year - 1}-12-31`,
            startIso: baseline.values().next().value?.startIso || ''
        },
        summary: {
            candidatesCount: candidates.length,
            tier1Count: candidates.filter(item => item.tier === 1).length,
            tier2Count: candidates.filter(item => item.tier === 2).length,
            tier3Count: candidates.filter(item => item.tier === 3).length,
            tier4Count: candidates.filter(item => item.tier === 4).length
        },
        chainRows: candidates.slice(0, 250).map(serializeChain),
        strategies,
        presets: DEFAULT_PRESETS
    };
}

async function ensureLoaded() {
    if (!lotteryService.getRawData() || lotteryService.getRawData().length === 0) {
        await lotteryService.loadRawData();
    }
    await lotteryService.loadStats();
}

async function buildNextPredictionCache(options = {}) {
    await ensureLoaded();
    const entries = options.entries || buildStatsIndex();
    if (!(entries instanceof Map) || entries.size === 0) {
        throw new Error(
            'Không thể sinh cache Mốc 20 năm: stats index rỗng sau khi đã tải dữ liệu.'
        );
    }
    const raw = getSortedRawData();
    if (raw.length < 2) throw new Error('Không đủ dữ liệu xổ số để tạo dự đoán Mốc 20 năm.');
    const latest = raw[raw.length - 1];
    const latestDate = parseDate(latest.date);
    const predictionDate = addDays(latestDate, 1);
    const nextPrediction = buildPredictionBundleForDate(predictionDate, {
        ...options,
        entries
    });
    const generatedAt = new Date().toISOString();
    return {
        generatedAt,
        latestDataDate: formatIsoDate(latestDate),
        latestSpecial: String(latest.special).padStart(2, '0'),
        config: {
            historyYears: Number(options.historyYears || DEFAULT_HISTORY_YEARS),
            defaultBetStrategy: DEFAULT_BET_STRATEGY,
            defaultBetTarget: DEFAULT_BET_TARGET,
            targets: DEFAULT_TARGETS,
            strategies: STRATEGY_IDS.map(id => STRATEGIES[id]),
            presets: DEFAULT_PRESETS,
            betPerNumberK: BET_PER_NUMBER_K,
            winMultiplier: DEFAULT_WIN_MULTIPLIER,
            baselineCacheVersion: BASELINE_CACHE_VERSION,
            methodVersion: MILESTONE20Y_METHOD_VERSION,
            liveCacheVersion: LIVE_CACHE_VERSION
        },
        nextPrediction
    };
}

function summarizeLive(predictions = []) {
    const settled = predictions.filter(row =>
        row.status === 'settled' && hasUsablePublishedBaseline(row)
    );
    const summary = {};
    for (const preset of DEFAULT_PRESETS) {
        const key = preset.id;
        let days = 0;
        let wins = 0;
        let stakeK = 0;
        let payoutK = 0;
        let profitK = 0;
        for (const row of settled) {
            const result = row.results?.[`${preset.strategy}:hold${preset.target}`];
            if (!result || !result.resolved) continue;
            days++;
            if (result.hit) wins++;
            stakeK += Number(result.stakeK || 0);
            payoutK += Number(result.payoutK || 0);
            profitK += Number(result.profitK || 0);
        }
        summary[key] = {
            ...preset,
            days,
            wins,
            losses: days - wins,
            hitRate: days ? round(wins / days, 4) : 0,
            stakeK,
            payoutK,
            profitK,
            roi: stakeK ? round(profitK / stakeK, 4) : 0
        };
    }
    return summary;
}

function hasUsablePublishedBaseline(row = {}) {
    if (!row.baseline) return true;
    return Boolean(row.baseline.startIso && row.baseline.cutoffIso);
}

function repairPendingPredictionFromFresh(row, nextPrediction, generatedAt) {
    return {
        ...row,
        predictionDate: nextPrediction.predictionDate,
        predictionIsoDate: nextPrediction.predictionIsoDate,
        dataIsoDate: row.dataIsoDate,
        generatedAt,
        liveCacheVersion: LIVE_CACHE_VERSION,
        baseline: nextPrediction.baseline,
        summary: nextPrediction.summary,
        strategies: compactLiveStrategies(nextPrediction.strategies),
        presets: nextPrediction.presets,
        actualSpecial: null,
        results: {},
        dataIntegrity: 'valid-after-baseline-repair',
        repairedAt: generatedAt,
        repairReason: 'empty-annual-baseline'
    };
}

function loadLocalJson(filePath, fallback) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        console.warn(`[Annual20Y] Không đọc được ${path.basename(filePath)}: ${error.message}`);
        return fallback;
    }
}

async function writeJson(filePath, payload) {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 0), 'utf8');
}

async function generateAndSaveCaches(options = {}) {
    await ensureLoaded();
    const entries = options.entries || buildStatsIndex();
    if (!(entries instanceof Map) || entries.size === 0) {
        throw new Error(
            'Không thể sinh cache Mốc 20 năm: stats index rỗng sau ensureLoaded().'
        );
    }
    const cacheOptions = { ...options, entries };
    const nextCache = await buildNextPredictionCache(cacheOptions);
    const raw = getSortedRawData();
    const actualByDate = new Map(raw.map(row => [formatIsoDate(row.date), toSpecialNumber(row)]));
    const live = loadLocalJson(LOCAL_LIVE_FILE, {
        generatedAt: null,
        startedAt: nextCache.generatedAt,
        latestDataDate: null,
        config: nextCache.config,
        summary: {},
        predictions: []
    });
    const rows = Array.isArray(live.predictions) ? live.predictions.slice() : [];
    const byDate = new Map(rows.map(row => [row.predictionIsoDate, row]));

    for (const row of rows) {
        if (row.strategies) row.strategies = compactLiveStrategies(row.strategies);

        // Backfill strategies that were added after this row was first generated
        const missingStrategies = BACKFILL_STRATEGIES.filter(id => !row.strategies?.[id]);
        if (missingStrategies.length > 0 && row.predictionIsoDate) {
            try {
                const bundle = buildPredictionBundleForDate(row.predictionIsoDate, cacheOptions);
                const backfilledStratIds = [];
                for (const stratId of missingStrategies) {
                    if (!bundle.strategies[stratId]) continue;
                    const freshStrategy = bundle.strategies[stratId];
                    if (!row.strategies) row.strategies = {};
                    row.strategies[stratId] = {
                        id: freshStrategy.id || stratId,
                        name: freshStrategy.name,
                        defaultTarget: freshStrategy.defaultTarget,
                        type: freshStrategy.type,
                        holds: {}
                    };
                    for (const [target, prediction] of Object.entries(freshStrategy.holds || {})) {
                        row.strategies[stratId].holds[target] = compactLivePrediction(
                            prediction,
                            stratId === DEFAULT_BET_STRATEGY && Number(target) === DEFAULT_BET_TARGET
                        );
                    }
                    backfilledStratIds.push(stratId);
                }
                // For already-settled rows, also compute results for newly backfilled strategies
                if (row.status === 'settled' && row.actualSpecial != null && backfilledStratIds.length > 0) {
                    if (!row.results) row.results = {};
                    for (const stratId of backfilledStratIds) {
                        const strategy = row.strategies[stratId];
                        if (!strategy) continue;
                        for (const [target, prediction] of Object.entries(strategy.holds || {})) {
                            const resultKey = `${stratId}:hold${target}`;
                            if (!row.results[resultKey]) {
                                row.results[resultKey] = settlePrediction(
                                    prediction, Number(row.actualSpecial), nextCache.config
                                );
                            }
                        }
                    }
                }
                console.log(`[Annual20Y] Backfilled ${backfilledStratIds.join(',')} for ${row.predictionIsoDate}.`);
            } catch (backfillErr) {
                console.warn(`[Annual20Y] Backfill ${row.predictionIsoDate} failed: ${backfillErr.message}`);
            }
        }

        const actual = actualByDate.get(row.predictionIsoDate);
        if (actual === undefined || actual === null) {
            if (row.status !== 'settled') {
                row.status = 'pending';
                row.actualSpecial = null;
            }
            continue;
        }
        settleLiveRowOnce(row, actual, nextCache.config);
    }

    let existingNextRow = byDate.get(nextCache.nextPrediction.predictionIsoDate);
    if (
        existingNextRow
        && existingNextRow.status !== 'settled'
        && !hasUsablePublishedBaseline(existingNextRow)
    ) {
        const repaired = repairPendingPredictionFromFresh(
            existingNextRow,
            nextCache.nextPrediction,
            nextCache.generatedAt
        );
        const rowIndex = rows.indexOf(existingNextRow);
        if (rowIndex >= 0) rows[rowIndex] = repaired;
        byDate.set(repaired.predictionIsoDate, repaired);
        existingNextRow = repaired;
        console.warn(
            `[Annual20Y] Đã thay snapshot pending ${repaired.predictionIsoDate} do baseline cũ rỗng.`
        );
    }
    if (existingNextRow && existingNextRow.status !== 'settled') {
        nextCache.nextPrediction = lockNextPredictionToPublished(
            nextCache.nextPrediction,
            existingNextRow
        );
        const lockedDefault = nextCache.nextPrediction.strategies?.[DEFAULT_BET_STRATEGY]
            ?.holds?.[String(DEFAULT_BET_TARGET)];
        const publishedDefault = existingNextRow.strategies?.[DEFAULT_BET_STRATEGY]
            ?.holds?.[String(DEFAULT_BET_TARGET)];
        if (
            publishedDefault
            && lockedDefault?.explanationIntegrity === 'rehydrated-after-number-match'
        ) {
            publishedDefault.selectedChains = lockedDefault.selectedChains;
            publishedDefault.explanationIntegrity = lockedDefault.explanationIntegrity;
        }
    } else if (!byDate.has(nextCache.nextPrediction.predictionIsoDate)) {
        rows.push({
            id: `annual20y-${nextCache.nextPrediction.predictionIsoDate}`,
            status: 'pending',
            predictionDate: nextCache.nextPrediction.predictionDate,
            predictionIsoDate: nextCache.nextPrediction.predictionIsoDate,
            dataIsoDate: nextCache.latestDataDate,
            generatedAt: nextCache.generatedAt,
            liveCacheVersion: LIVE_CACHE_VERSION,
            baseline: nextCache.nextPrediction.baseline,
            summary: nextCache.nextPrediction.summary,
            strategies: compactLiveStrategies(nextCache.nextPrediction.strategies),
            presets: nextCache.nextPrediction.presets,
            actualSpecial: null,
            results: {},
            dataIntegrity: 'valid'
        });
    }

    const trimmed = rows
        .sort((a, b) => String(a.predictionIsoDate).localeCompare(String(b.predictionIsoDate)))
        .slice(-120);
    const livePayload = {
        generatedAt: nextCache.generatedAt,
        startedAt: live.startedAt || nextCache.generatedAt,
        latestDataDate: nextCache.latestDataDate,
        config: nextCache.config,
        summary: summarizeLive(trimmed),
        predictions: trimmed
    };

    if (options.write !== false) {
        await writeJson(LOCAL_PREDICTION_FILE, nextCache);
        await writeJson(LOCAL_LIVE_FILE, livePayload);
    }
    return { prediction: nextCache, live: livePayload };
}

module.exports = {
    STRATEGIES,
    STRATEGY_IDS,
    DEFAULT_TARGETS,
    DEFAULT_PRESETS,
    DEFAULT_BET_STRATEGY,
    DEFAULT_BET_TARGET,
    BET_PER_NUMBER_K,
    DEFAULT_WIN_MULTIPLIER,
    buildAnnualBaseline,
    ensureAnnualBaseline,
    buildCandidatesForDate,
    buildPrediction,
    rankNumbersByPosteriorDiversity,
    rankNumbersByLikelihoodRatio,
    buildPredictionBundleForDate,
    buildNextPredictionCache,
    generateAndSaveCaches,
    lockNextPredictionToPublished,
    settlePrediction,
    settleLiveRowOnce,
    summarizeLive
};
