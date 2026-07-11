const fs = require('fs');
const path = require('path');

const CACHE_VERSION = 'prediction-history-performance-2026-v1';
const CACHE_FILE = path.join(
    process.cwd(),
    'lib',
    'data',
    'statistics',
    'cached_prediction_history_performance_2026.json'
);
const BET_PER_NUMBER_K = 10;
const HOLD_LOSS_MULTIPLIER = 70;
const DEFAULT_BET_WIN_MULTIPLIER = 84;
const DEFAULT_BET_WIN_FACTOR = 1;
const DEFAULT_HOLD_WIN_MULTIPLIER = 0.705;

const METHOD_META = {
    chainSmallFirstHold70: {
        label: 'Đề Chuỗi nhỏ trước - Hold 70',
        explanation: 'Giữ thứ tự Tier, sau đó ưu tiên chuỗi có tập số nhỏ để giảm nhiễu; loại 70 số và đánh 30 số còn lại theo snapshot point-in-time.'
    },
    deParallelBlock85Small65Hold70: {
        label: 'Đề Song Song (Block 85 · Small 65)',
        explanation: 'Đánh song song hai phương pháp Nhịp Block trước (Hold 85) và Chuỗi nhỏ trước (Hold 65). Số trùng được đánh gấp đôi tiền (2000K), còn lại 1000K.'
    },
    dedupEdge50CombinedB40S05Hold70: {
        label: 'Đề Boost B40S05 - Hold 70',
        explanation: 'Edge kết hợp cộng hưởng Nhịp Block (40%) và Chuỗi Nhỏ (5%), loại 70 số, giữ 30 số đánh.'
    },
    dedupEdge50CombinedB40S05Hold80: {
        label: 'Đề Boost B40S05 - Hold 80',
        explanation: 'Edge kết hợp cộng hưởng Nhịp Block (40%) và Chuỗi Nhỏ (5%), loại 80 số, giữ 20 số đánh.'
    },
    dedupEdge50Hold70: {
        label: 'Dự đoán Edge - Hold 70',
        explanation: 'Phương pháp loại 70 số bằng hiệu số rủi ro gãy thực tế so với 50% nền (Deduplicated Edge), giữ 30 số đánh.'
    },
    dedupEdge50Hold80: {
        label: 'Dự đoán Edge - Hold 80',
        explanation: 'Phương pháp loại 80 số bằng hiệu số rủi ro gãy thực tế so với 50% nền (Deduplicated Edge), giữ 20 số đánh.'
    },
    avgEdge50Hold70: {
        label: 'Dropoff TB hiệu chỉnh 50% nền - Hold 70',
        explanation: 'Chấm điểm từng số bằng dropoff đã trừ xác suất nền 50%, rồi loại 70 số có điểm cao nhất.'
    },
    dedupEdge75Hold70: {
        label: 'Edge khử trùng 75% nền - Hold 70',
        explanation: 'Khử trùng các pattern có cùng tập số, dùng edge so với nền 75% và giữ 30 số đánh.'
    },
    dedupDropoffHold70: {
        label: 'Dropoff TB khử trùng tập số - Hold 70',
        explanation: 'Gộp bằng chứng trùng tập số trước khi tính dropoff trung bình và loại 70 số.'
    }
};

function normalizeNumberArray(values = []) {
    return Array.from(new Set((values || [])
        .map(Number)
        .filter(value => Number.isInteger(value) && value >= 0 && value <= 99)))
        .sort((a, b) => a - b);
}

function normalizeIsoDate(value) {
    if (!value) return null;
    const text = String(value).trim();
    const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

function isoWeekKey(dateText) {
    const date = new Date(`${dateText}T00:00:00Z`);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function resultToDailyRow(date, method, source = 'backtest') {
    if (!date || !method || method.skipped) return null;
    const betNumbers = normalizeNumberArray(method.betNumbers || method.numbersToBet || []);
    const excludedNumbers = normalizeNumberArray(method.excluded || method.excludedNumbers || []);
    const actualSpecial = Number(method.actualSpecial ?? method.actualNumber);
    const betWin = typeof method.betWin === 'boolean'
        ? method.betWin
        : (typeof method.hit === 'boolean'
            ? method.hit
            : betNumbers.includes(actualSpecial));
    const holdWin = typeof method.holdWin === 'boolean'
        ? method.holdWin
        : !excludedNumbers.includes(actualSpecial);
    const betProfitK = Number(method.betProfit ?? 0);
    const holdProfitK = Number(method.holdProfit ?? 0);
    const profitK = Number(method.profit ?? method.combinedProfit ?? (betProfitK + holdProfitK));

    return {
        date,
        period: date,
        days: 1,
        wins: profitK > 0 ? 1 : 0,
        losses: profitK > 0 ? 0 : 1,
        hitDays: betWin ? 1 : 0,
        holdLossDays: holdWin ? 0 : 1,
        betNumberDays: betNumbers.length,
        excludedNumberDays: excludedNumbers.length,
        betCount: betNumbers.length,
        excludedCount: excludedNumbers.length,
        betProfitK,
        holdProfitK,
        profitK,
        source
    };
}

function dailyRowsFromBacktest(details = [], methodIds = Object.keys(METHOD_META)) {
    const rowsByMethod = Object.fromEntries(methodIds.map(methodId => [methodId, []]));
    for (const detail of details || []) {
        const date = normalizeIsoDate(detail.predictionIsoDate || detail.predictionDate);
        if (!date) continue;
        for (const methodId of methodIds) {
            const row = resultToDailyRow(date, detail.methods?.[methodId], 'point-in-time-backtest');
            if (row) rowsByMethod[methodId].push(row);
        }
    }
    for (const rows of Object.values(rowsByMethod)) {
        rows.sort((a, b) => a.date.localeCompare(b.date));
    }
    return rowsByMethod;
}

function dailyRowsFromSnapshots(history = [], methodIds = Object.keys(METHOD_META)) {
    const rowsByMethod = Object.fromEntries(methodIds.map(methodId => [methodId, []]));
    for (const run of history || []) {
        if (!run?.summary?.resolved) continue;
        const date = normalizeIsoDate(run.predictionDate);
        if (!date) continue;
        for (const methodId of methodIds) {
            const method = run.summary.methods?.[methodId];
            if (!method?.resolved) continue;
            const row = resultToDailyRow(date, method, 'immutable-live-snapshot');
            if (row) rowsByMethod[methodId].push(row);
        }
    }
    return rowsByMethod;
}

function mergeDailyRows(baseRows = [], snapshotRows = []) {
    const byDate = new Map();
    for (const row of baseRows || []) {
        if (row?.date) byDate.set(row.date, row);
    }
    for (const row of snapshotRows || []) {
        if (row?.date) byDate.set(row.date, row);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateRows(rows = [], period = 'monthly') {
    const groups = new Map();
    for (const row of rows || []) {
        const key = period === 'daily'
            ? row.date
            : period === 'weekly'
                ? isoWeekKey(row.date)
                : row.date.slice(0, 7);
        if (!groups.has(key)) {
            groups.set(key, {
                period: key,
                ...(period === 'daily' ? { date: key } : {}),
                ...(period === 'weekly' ? { week: key } : {}),
                ...(period === 'monthly' ? { month: key } : {}),
                days: 0,
                wins: 0,
                losses: 0,
                hitDays: 0,
                holdLossDays: 0,
                betNumberDays: 0,
                excludedNumberDays: 0,
                betProfitK: 0,
                holdProfitK: 0,
                profitK: 0
            });
        }
        const target = groups.get(key);
        for (const field of [
            'days',
            'wins',
            'losses',
            'hitDays',
            'holdLossDays',
            'betNumberDays',
            'excludedNumberDays',
            'betProfitK',
            'holdProfitK',
            'profitK'
        ]) {
            target[field] += Number(row[field] || 0);
        }
    }
    return [...groups.values()];
}

function longestStreak(rows, predicate) {
    let current = 0;
    let longest = 0;
    for (const row of rows || []) {
        if (predicate(row)) {
            current += 1;
            longest = Math.max(longest, current);
        } else {
            current = 0;
        }
    }
    return longest;
}

function summarizeRows(rows = []) {
    const totals = aggregateRows(rows, 'monthly').reduce((summary, row) => {
        for (const field of [
            'days',
            'wins',
            'losses',
            'hitDays',
            'holdLossDays',
            'betNumberDays',
            'excludedNumberDays',
            'betProfitK',
            'holdProfitK',
            'profitK'
        ]) {
            summary[field] += Number(row[field] || 0);
        }
        return summary;
    }, {
        days: 0,
        wins: 0,
        losses: 0,
        hitDays: 0,
        holdLossDays: 0,
        betNumberDays: 0,
        excludedNumberDays: 0,
        betProfitK: 0,
        holdProfitK: 0,
        profitK: 0
    });
    const capitalK = (totals.betNumberDays + totals.excludedNumberDays) * BET_PER_NUMBER_K;
    return {
        ...totals,
        hitRate: totals.days ? totals.hitDays / totals.days : 0,
        winRate: totals.days ? totals.wins / totals.days : 0,
        roi: capitalK ? totals.profitK / capitalK : 0,
        longestWin: longestStreak(rows, row => Number(row.profitK || 0) > 0),
        longestLoss: longestStreak(rows, row => Number(row.profitK || 0) <= 0),
        capitalK
    };
}

function buildMethodReport(methodId, rows = []) {
    const meta = METHOD_META[methodId] || { label: methodId, explanation: '' };
    return {
        label: meta.label,
        explanation: meta.explanation,
        evaluation: 'Backtest point-in-time; các ngày có nhật ký thật được thay bằng snapshot bất biến đã phát hành.',
        summary: summarizeRows(rows),
        daily: aggregateRows(rows, 'daily'),
        weekly: aggregateRows(rows, 'weekly'),
        monthly: aggregateRows(rows, 'monthly')
    };
}

function buildPerformanceCache({
    backtestDetails = [],
    existingCache = null,
    predictionHistory = [],
    startDate,
    endDate,
    generatedAt = new Date().toISOString()
}) {
    const methodIds = Object.keys(METHOD_META);
    const backtestRows = dailyRowsFromBacktest(backtestDetails, methodIds);
    const snapshotRows = dailyRowsFromSnapshots(predictionHistory, methodIds);
    const methods = {};
    for (const methodId of methodIds) {
        const existingRows = existingCache?.methods?.[methodId]?.daily || [];
        const baseRows = backtestRows[methodId]?.length
            ? backtestRows[methodId]
            : existingRows;
        const merged = mergeDailyRows(baseRows, snapshotRows[methodId]);
        methods[methodId] = buildMethodReport(methodId, merged);
    }
    const selectedMethodId = Object.entries(methods)
        .sort((a, b) => Number(b[1].summary?.profitK || 0) - Number(a[1].summary?.profitK || 0))[0]?.[0]
        || 'avgEdge50Hold70';

    return {
        version: CACHE_VERSION,
        generatedAt,
        period: { startDate, endDate },
        source: {
            mode: 'rolling-fast-index-with-immutable-live-overrides',
            immutableLiveOverrides: true,
            strictPointInTime: false,
            eligibleForPromotion: false,
            warning: 'Phần backtest dùng fast full-history index có lọc ngày, chưa tương đương tái sinh prefix strict PIT. Chỉ snapshot thực tế đã phát hành là point-in-time bất biến.'
        },
        selectedMethodId,
        methods
    };
}

function readLocalPerformanceCache() {
    if (!fs.existsSync(CACHE_FILE)) return null;
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
}

function writePerformanceCache(cache) {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
    return CACHE_FILE;
}

function refreshPerformanceCacheFromSnapshots(predictionHistory = []) {
    const existingCache = readLocalPerformanceCache();
    if (!existingCache) return null;
    const dates = predictionHistory
        .filter(row => row?.summary?.resolved)
        .map(row => normalizeIsoDate(row?.predictionDate))
        .filter(Boolean)
        .sort();
    const cache = buildPerformanceCache({
        existingCache,
        predictionHistory,
        startDate: existingCache.period?.startDate || dates[0],
        endDate: dates[dates.length - 1] || existingCache.period?.endDate,
        generatedAt: new Date().toISOString()
    });
    writePerformanceCache(cache);
    return cache;
}

module.exports = {
    CACHE_FILE,
    CACHE_VERSION,
    DEFAULT_BET_WIN_FACTOR,
    DEFAULT_BET_WIN_MULTIPLIER,
    DEFAULT_HOLD_WIN_MULTIPLIER,
    HOLD_LOSS_MULTIPLIER,
    METHOD_META,
    buildPerformanceCache,
    refreshPerformanceCacheFromSnapshots,
    writePerformanceCache
};
