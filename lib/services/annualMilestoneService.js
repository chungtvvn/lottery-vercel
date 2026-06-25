const fs = require('fs');
const path = require('path');
const lotteryService = require('./lotteryService');
const historicalExclusionService = require('./historicalExclusionService');
const exclusionLogic = require('./exclusionLogicService');
const { isInvalidStatsKey } = require('../utils/statsOptionsManifest');
const { getCategoryName } = require('../utils/patternNaming');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BET_PER_NUMBER_K = 1000;
const DEFAULT_WIN_MULTIPLIER = 84;
const DEFAULT_HISTORY_YEARS = 20;
const BASELINE_CACHE_VERSION = 'annual20y-baseline-2026-06-25';
const LIVE_CACHE_VERSION = 'annual20y-live-compact-v1';
const LOCAL_PREDICTION_FILE = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_milestone20y_prediction.json');
const LOCAL_LIVE_FILE = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_milestone20y_live_predictions.json');
const LOCAL_STATS_DIR = path.join(process.cwd(), 'lib', 'data', 'statistics');
const _baselineMemoryCache = new Map();

const STRATEGIES = {
    chainSmallFirst: {
        id: 'chainSmallFirst',
        name: 'Chuỗi nhỏ trước',
        defaultTarget: 65,
        description: 'Vẫn giữ Tier 1/2/3, nhưng khi cùng Tier sẽ ưu tiên chuỗi có tập số nhỏ trước để giảm nhiễu từ các chuỗi quá rộng.',
        type: 'chain'
    },
    chainFreqFirst: {
        id: 'chainFreqFirst',
        name: 'Tần suất thấp trước',
        defaultTarget: 75,
        description: 'Vẫn giữ Tier, sau đó ưu tiên chuỗi có tần suất HT/Target thấp nhất theo mốc 20 năm.',
        type: 'chain'
    },
    chainRiskFirst: {
        id: 'chainRiskFirst',
        name: 'Rủi ro cao trước',
        defaultTarget: 75,
        description: 'Vẫn giữ Tier, sau đó ưu tiên chuỗi có xác suất gãy/không hình thành cao nhất.',
        type: 'chain'
    },
    numberAvgRisk: {
        id: 'numberAvgRisk',
        name: 'Rủi ro TB từng số',
        defaultTarget: 28,
        description: 'Mỗi số nhận điểm từ toàn bộ chuỗi chứa nó, lấy trung bình rủi ro có hiệu chỉnh theo tần suất, mẫu và độ rộng tập số.',
        type: 'number'
    },
    numberConsensusRisk: {
        id: 'numberConsensusRisk',
        name: 'Đồng thuận từng số',
        defaultTarget: 34,
        description: 'Ưu tiên số bị nhiều chuỗi rủi ro cao cùng đề xuất loại, tránh phụ thuộc vào một chuỗi đơn lẻ.',
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
        defaultTarget: 85,
        description: 'Chỉ tính các chuỗi đã hình thành và đang diễn ra, bỏ các chuỗi tiềm năng chưa hình thành.',
        type: 'number'
    }
};

const STRATEGY_IDS = Object.keys(STRATEGIES);
const NUMBER_SCORE_STRATEGIES = new Set(STRATEGY_IDS.filter(id => STRATEGIES[id].type === 'number'));
const DEFAULT_TARGETS = [20, 23, 24, 25, 26, 27, 28, 30, 32, 33, 34, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];
const DEFAULT_PRESETS = [
    { id: 'profit', label: 'Profit cao', strategy: 'chainSmallFirst', target: 65 },
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
    return payload
        && payload.version === BASELINE_CACHE_VERSION
        && Number(payload.year) === Number(year)
        && Number(payload.historyYears || DEFAULT_HISTORY_YEARS) === Number(historyYears || DEFAULT_HISTORY_YEARS)
        && Array.isArray(payload.entries)
        && payload.entries.length > 0;
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
        if (strategy === 'chainSmallFirst') {
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

function rankNumbersByMembership(candidates, strategy) {
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
        selectedChains: selectedChains.slice(0, 30).map(serializeChain)
    };
}

function settlePrediction(prediction, actualNumber, options = {}) {
    const actual = Number(actualNumber);
    const betNumbers = normalizeNumberList(prediction.betNumbers);
    const excludedNumbers = normalizeNumberList(prediction.excludedNumbers);
    const hit = betNumbers.includes(actual);
    const stakeK = betNumbers.length * Number(options.betPerNumberK || BET_PER_NUMBER_K);
    const payoutK = hit ? Number(options.betPerNumberK || BET_PER_NUMBER_K) * Number(options.winMultiplier || DEFAULT_WIN_MULTIPLIER) : 0;
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

function compactLivePrediction(prediction = {}) {
    return {
        strategy: prediction.strategy,
        targetExcluded: prediction.targetExcluded,
        excludedNumbers: prediction.excludedNumbers || [],
        betNumbers: prediction.betNumbers || []
    };
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
            compact[strategyId].holds[target] = compactLivePrediction(prediction);
        }
    }
    return compact;
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
    const baseline = options.baseline || ensureAnnualBaseline(entries, year, options);
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
    const raw = getSortedRawData();
    if (raw.length < 2) throw new Error('Không đủ dữ liệu xổ số để tạo dự đoán Mốc 20 năm.');
    const latest = raw[raw.length - 1];
    const latestDate = parseDate(latest.date);
    const predictionDate = addDays(latestDate, 1);
    const nextPrediction = buildPredictionBundleForDate(predictionDate, options);
    const generatedAt = new Date().toISOString();
    return {
        generatedAt,
        latestDataDate: formatIsoDate(latestDate),
        latestSpecial: String(latest.special).padStart(2, '0'),
        config: {
            historyYears: Number(options.historyYears || DEFAULT_HISTORY_YEARS),
            targets: DEFAULT_TARGETS,
            strategies: STRATEGY_IDS.map(id => STRATEGIES[id]),
            presets: DEFAULT_PRESETS,
            betPerNumberK: BET_PER_NUMBER_K,
            winMultiplier: DEFAULT_WIN_MULTIPLIER,
            baselineCacheVersion: BASELINE_CACHE_VERSION,
            methodVersion: 'annual20y-2026-06-25',
            liveCacheVersion: LIVE_CACHE_VERSION
        },
        nextPrediction
    };
}

function summarizeLive(predictions = []) {
    const settled = predictions.filter(row => row.status === 'settled');
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
    const nextCache = await buildNextPredictionCache(options);
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
        row.liveCacheVersion = LIVE_CACHE_VERSION;
        const actual = actualByDate.get(row.predictionIsoDate);
        if (actual === undefined || actual === null) {
            row.status = 'pending';
            row.actualSpecial = null;
            continue;
        }
        if (row.status !== 'settled' || !row.results) {
            row.status = 'settled';
            row.actualSpecial = String(actual).padStart(2, '0');
            row.results = {};
            for (const [strategyId, strategy] of Object.entries(row.strategies || {})) {
                for (const [target, prediction] of Object.entries(strategy.holds || {})) {
                    row.results[`${strategyId}:hold${target}`] = settlePrediction(prediction, actual, nextCache.config);
                }
            }
        }
    }

    const existingNextRow = byDate.get(nextCache.nextPrediction.predictionIsoDate);
    if (existingNextRow && existingNextRow.status !== 'settled') {
        existingNextRow.dataIsoDate = nextCache.latestDataDate;
        existingNextRow.generatedAt = nextCache.generatedAt;
        existingNextRow.liveCacheVersion = LIVE_CACHE_VERSION;
        existingNextRow.baseline = nextCache.nextPrediction.baseline;
        existingNextRow.summary = nextCache.nextPrediction.summary;
        existingNextRow.strategies = compactLiveStrategies(nextCache.nextPrediction.strategies);
        existingNextRow.presets = nextCache.nextPrediction.presets;
        existingNextRow.actualSpecial = null;
        existingNextRow.results = {};
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
            results: {}
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
    BET_PER_NUMBER_K,
    DEFAULT_WIN_MULTIPLIER,
    buildAnnualBaseline,
    ensureAnnualBaseline,
    buildCandidatesForDate,
    buildPrediction,
    buildPredictionBundleForDate,
    buildNextPredictionCache,
    generateAndSaveCaches,
    settlePrediction,
    summarizeLive
};
