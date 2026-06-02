const { getNoDataPatternManifest, parseStatsKey } = require('./statsOptionsManifest');
const { identifyCategories, getTongTT, getTongMoi, getHieu } = require('./numberAnalysis');
const {
    getSoLeTheoCapLabel,
    formatSoLeTheoCapPairValue,
    isSoLeTheoCapCategory
} = require('./soLeTheoCapPairs');
const { getCategoryName } = require('./patternNaming');

function getPotentialStep(key, subcategory = '') {
    const lowerKey = String(key || '').toLowerCase();
    const lowerSub = String(subcategory || '').toLowerCase();
    const isAlternatingGapPattern = (lowerSub === 'vesole' || lowerSub === 'vesolemoi' || lowerKey.includes('vesole') || lowerKey.includes('solemoi')) &&
        !lowerKey.includes('tienluisole') &&
        !lowerKey.includes('luitiensole') &&
        !lowerKey.includes('soletheocap');
    return isAlternatingGapPattern ? 2 : 1;
}

function emptyMetrics() {
    return {
        occurrences: 0,
        avgLength: null,
        avgGapDays: null,
        latestEndDate: '',
        daysSinceLatestEnd: null
    };
}

function buildNeverFormedStat(key, option, current, totalYears = 20) {
    const { category, subcategory } = parseStatsKey(key);
    const step = getPotentialStep(key, subcategory);
    const formLen = (current.length || 1) + step;
    const breakTarget = formLen + step;
    const sampleDays = Math.max(1, Math.round((Number(totalYears) || 20) * 365.25));
    const gapStats = {
        [current.length || 1]: { count: sampleDays, pastCount: sampleDays },
        [formLen]: { count: 0, pastCount: 0 },
        [breakTarget]: { count: 0, pastCount: 0 }
    };
    const exactGapStats = {
        [formLen]: { count: 0, pastCount: 0 },
        [breakTarget]: { count: 0, pastCount: 0 }
    };
    const lengthHistoryMetrics = {
        [current.length || 1]: emptyMetrics(),
        [formLen]: { ...emptyMetrics(), targetLength: formLen },
        [breakTarget]: { ...emptyMetrics(), targetLength: breakTarget }
    };

    return {
        description: option.text || getCategoryName(category, subcategory, key),
        longest: [],
        secondLongest: [],
        current: {
            ...current,
            isPotential: true,
            isNeverFormedNoData: true,
            noDataStatus: 'never-formed'
        },
        computedMaxStreak: 0,
        isSuperMaxThreshold: true,
        isPotentialRecord: true,
        isNeverFormedNoData: true,
        noDataReason: option.reason,
        gapStats,
        exactGapStats,
        extensionGapStats: {},
        lengthHistoryMetrics,
        historyMetrics: emptyMetrics()
    };
}

function normalizeNumberString(value) {
    if (value === null || value === undefined || value === '') return '';
    return String(value).padStart(2, '0').slice(-2);
}

function isGenericTienLuiAxis(key, category) {
    const lowerKey = String(key || '').toLowerCase();
    return lowerKey === 'tienluisole' ||
        lowerKey === 'luitiensole' ||
        category === 'cacSo' ||
        category === 'cacDau' ||
        category === 'cacDit' ||
        category === 'tong_tt_cac_tong' ||
        category === 'tong_moi_cac_tong' ||
        category === 'hieu_cac_hieu';
}

function matchesTienLuiFixedCategory(key, category, matchedDayBefore, matchedYesterday, matchedToday) {
    if (isGenericTienLuiAxis(key, category)) return true;
    return (matchedDayBefore || []).includes(category) &&
        (matchedYesterday || []).includes(category) &&
        (matchedToday || []).includes(category);
}

function extractTienLuiOrderedValue(numberStr, key, category) {
    const normalized = normalizeNumberString(numberStr);
    const number = parseInt(normalized, 10);
    if (!normalized || Number.isNaN(number)) return null;

    const lowerKey = String(key || '').toLowerCase();
    if (lowerKey === 'tienluisole' || lowerKey === 'luitiensole' || category === 'cacSo') return number;
    if (category === 'cacDau') return Math.floor(number / 10);
    if (category === 'cacDit') return number % 10;
    if (category === 'tong_tt_cac_tong') return getTongTT(normalized);
    if (category === 'tong_moi_cac_tong') return getTongMoi(normalized);
    if (category === 'hieu_cac_hieu') return getHieu(normalized);
    return number;
}

function buildPotentialCurrent(option, context) {
    const { key, category, subcategory } = option;
    const todayNum = normalizeNumberString(context.todayNum);
    const yesterdayNum = normalizeNumberString(context.yesterdayNum);
    const dayBeforeNum = normalizeNumberString(context.dayBeforeNum);
    const matchedToday = context.matchedToday || (todayNum ? identifyCategories(todayNum) : []);
    const matchedYesterday = context.matchedYesterday || (yesterdayNum ? identifyCategories(yesterdayNum) : []);
    const matchedDayBefore = context.matchedDayBefore || (dayBeforeNum ? identifyCategories(dayBeforeNum) : []);
    const lowerSub = String(subcategory || '').toLowerCase();
    const lowerKey = String(key || '').toLowerCase();
    const step = getPotentialStep(key, subcategory);

    if (!todayNum) return null;

    if (key.startsWith('pattern_seq_')) {
        if (!yesterdayNum || !dayBeforeNum) return null;
        const pattern = key.replace('pattern_seq_', '').split('_').map(p => p.toUpperCase());
        if (pattern.length < 4) return null;
        const getParityType = (value) => {
            const d0 = parseInt(value[0], 10) % 2;
            const d1 = parseInt(value[1], 10) % 2;
            if (d0 === 0 && d1 === 0) return 'CC';
            if (d0 === 0 && d1 === 1) return 'CL';
            if (d0 === 1 && d1 === 0) return 'LC';
            return 'LL';
        };
        const prefixMatches =
            getParityType(dayBeforeNum) === pattern[0] &&
            getParityType(yesterdayNum) === pattern[1] &&
            getParityType(todayNum) === pattern[2];
        if (!prefixMatches) return null;
        return {
            length: 3,
            startDate: context.dayBeforeDate,
            endDate: context.todayDate,
            values: [dayBeforeNum, yesterdayNum, todayNum],
            dates: [context.dayBeforeDate, context.yesterdayDate, context.todayDate].filter(Boolean),
            fullSequence: [
                { date: context.dayBeforeDate, value: dayBeforeNum },
                { date: context.yesterdayDate, value: yesterdayNum },
                { date: context.todayDate, value: todayNum, isLatest: true }
            ].filter(item => item.date)
        };
    }

    const isTienLuiSoLe = lowerSub === 'tienluisole' || lowerSub === 'luitiensole' ||
        lowerKey.includes('tienluisole') || lowerKey.includes('luitiensole');
    if (isTienLuiSoLe) {
        if (!yesterdayNum || !dayBeforeNum) return null;
        if (!matchesTienLuiFixedCategory(key, category, matchedDayBefore, matchedYesterday, matchedToday)) return null;
        const v0 = extractTienLuiOrderedValue(dayBeforeNum, key, category);
        const v1 = extractTienLuiOrderedValue(yesterdayNum, key, category);
        const v2 = extractTienLuiOrderedValue(todayNum, key, category);
        if (v0 === null || v1 === null || v2 === null) return null;
        const d1 = Number(v1) - Number(v0);
        const d2 = Number(v2) - Number(v1);
        const wantsTienFirst = lowerSub === 'tienluisole' || lowerKey.includes('tienluisole');
        const directionsOk = wantsTienFirst ? (d1 > 0 && d2 < 0) : (d1 < 0 && d2 > 0);
        if (!directionsOk) return null;
        return {
            length: 3,
            startDate: context.dayBeforeDate,
            endDate: context.todayDate,
            values: [dayBeforeNum, yesterdayNum, todayNum],
            dates: [context.dayBeforeDate, context.yesterdayDate, context.todayDate].filter(Boolean),
            fullSequence: [
                { date: context.dayBeforeDate, value: dayBeforeNum },
                { date: context.yesterdayDate, value: yesterdayNum },
                { date: context.todayDate, value: todayNum, isLatest: true }
            ].filter(item => item.date)
        };
    }

    const isSoLeTheoCap = lowerSub === 'soletheocap' || lowerKey.includes('soletheocap');
    if (isSoLeTheoCap) {
        if (!isSoLeTheoCapCategory(category) || !yesterdayNum || !dayBeforeNum) return null;
        const v0 = getSoLeTheoCapLabel(dayBeforeNum, category);
        const v1 = getSoLeTheoCapLabel(yesterdayNum, category);
        const v2 = getSoLeTheoCapLabel(todayNum, category);
        if (!v0 || !v1 || !v2 || v0 === v1 || v0 !== v2) return null;
        const patternLabels = [v0, v1, v2];
        return {
            length: 3,
            startDate: context.dayBeforeDate,
            endDate: context.todayDate,
            values: [dayBeforeNum, yesterdayNum, todayNum],
            patternLabels,
            pairCategory: category,
            value: formatSoLeTheoCapPairValue(category, patternLabels),
            dates: [context.dayBeforeDate, context.yesterdayDate, context.todayDate].filter(Boolean),
            fullSequence: [
                { date: context.dayBeforeDate, value: dayBeforeNum },
                { date: context.yesterdayDate, value: yesterdayNum },
                { date: context.todayDate, value: todayNum, isLatest: true }
            ].filter(item => item.date)
        };
    }

    if (step === 2) {
        if (!yesterdayNum || !matchedYesterday.includes(category) || matchedToday.includes(category)) return null;
        return {
            length: 1,
            startDate: context.yesterdayDate,
            endDate: context.yesterdayDate,
            values: [yesterdayNum],
            dates: [context.yesterdayDate].filter(Boolean),
            fullSequence: [
                { date: context.yesterdayDate, value: yesterdayNum },
                { date: context.todayDate, value: todayNum, isLatest: true }
            ].filter(item => item.date)
        };
    }

    const isGenericTopLevel = !key.includes(':') && (
        key.startsWith('motSo') || key.startsWith('motDau') || key.startsWith('motDit') ||
        key.startsWith('cacSo') || key.startsWith('cacDau') || key.startsWith('cacDit')
    );
    if (!matchedToday.includes(category) && !isGenericTopLevel) return null;

    return {
        length: 1,
        startDate: context.todayDate,
        endDate: context.todayDate,
        value: todayNum,
        values: [todayNum],
        dates: [context.todayDate].filter(Boolean),
        fullSequence: [{ date: context.todayDate, value: todayNum, isLatest: true }].filter(item => item.date),
        potentialKind: lowerSub || 'veLienTiep'
    };
}

function attachNumbers(current, key) {
    try {
        const { predictNextInSequence, getNumbersFromCategory } = require('../controllers/suggestionsController');
        const { category, subcategory } = parseStatsKey(key);
        const nums = predictNextInSequence({ current }, category, subcategory || '');
        if (nums && nums.length > 0 && nums.length < 100) return nums;
        const fallback = getNumbersFromCategory(category);
        return fallback && fallback.length > 0 && fallback.length < 100 ? fallback : [];
    } catch (error) {
        return [];
    }
}

function isGenericTopLevelKey(key) {
    return !String(key || '').includes(':') && (
        String(key || '').startsWith('motSo') ||
        String(key || '').startsWith('motDau') ||
        String(key || '').startsWith('motDit') ||
        String(key || '').startsWith('cacSo') ||
        String(key || '').startsWith('cacDau') ||
        String(key || '').startsWith('cacDit')
    );
}

function prefilterPotentialOption(option, contextSets) {
    const key = String(option.key || '');
    const category = option.category;
    const subcategory = option.subcategory || '';
    const lowerSub = String(subcategory).toLowerCase();
    const lowerKey = key.toLowerCase();

    if (key.startsWith('pattern_seq_')) {
        return !!(contextSets.yesterdayNum && contextSets.dayBeforeNum);
    }

    const isTienLuiSoLe = lowerSub === 'tienluisole' || lowerSub === 'luitiensole' ||
        lowerKey.includes('tienluisole') || lowerKey.includes('luitiensole');
    if (isTienLuiSoLe) {
        if (!contextSets.yesterdayNum || !contextSets.dayBeforeNum) return false;
        if (isGenericTienLuiAxis(key, category)) return true;
        return contextSets.dayBefore.has(category) &&
            contextSets.yesterday.has(category) &&
            contextSets.today.has(category);
    }

    const isSoLeTheoCap = lowerSub === 'soletheocap' || lowerKey.includes('soletheocap');
    if (isSoLeTheoCap) {
        return !!(contextSets.yesterdayNum && contextSets.dayBeforeNum && isSoLeTheoCapCategory(category));
    }

    const step = getPotentialStep(key, subcategory);
    if (step === 2) {
        return !!(contextSets.yesterdayNum && contextSets.yesterday.has(category) && !contextSets.today.has(category));
    }

    return contextSets.today.has(category) || isGenericTopLevelKey(key);
}

function augmentNeverFormedPotentialStreaks(quickStats, context = {}) {
    if (!quickStats || typeof quickStats !== 'object') return quickStats;
    const debugTimings = process.env.DEBUG_FAST_STATS === '1';
    const timingStart = debugTimings ? Date.now() : 0;
    let timingLoopStart = 0;
    const manifest = getNoDataPatternManifest(Object.keys(quickStats).filter(key => key !== '_meta'));
    const totalYears = quickStats._meta?.totalYears || context.totalYears || 20;
    const contextSets = {
        todayNum: normalizeNumberString(context.todayNum),
        yesterdayNum: normalizeNumberString(context.yesterdayNum),
        dayBeforeNum: normalizeNumberString(context.dayBeforeNum),
        today: new Set(context.matchedToday || []),
        yesterday: new Set(context.matchedYesterday || []),
        dayBefore: new Set(context.matchedDayBefore || [])
    };

    timingLoopStart = debugTimings ? Date.now() : 0;
    for (const option of manifest.neverFormed) {
        if (quickStats[option.key]) continue;
        if (!prefilterPotentialOption(option, contextSets)) continue;
        const current = buildPotentialCurrent(option, context);
        if (!current) continue;
        const patternNumbers = attachNumbers(current, option.key);
        if (!patternNumbers || patternNumbers.length === 0 || patternNumbers.length >= 100) continue;
        quickStats[option.key] = buildNeverFormedStat(option.key, option, {
            ...current,
            patternNumbers
        }, totalYears);
    }

    if (quickStats._meta) {
        quickStats._meta.noDataPatterns = {
            missingCount: manifest.missingCount,
            invalidCount: manifest.invalidCount,
            neverFormedCount: manifest.neverFormedCount
        };
    }

    if (debugTimings) {
        console.error('[NeverFormedTiming]', {
            missing: manifest.missingCount,
            neverFormed: manifest.neverFormedCount,
            manifestMs: timingLoopStart - timingStart,
            loopMs: Date.now() - timingLoopStart,
            totalMs: Date.now() - timingStart
        });
    }
    return quickStats;
}

module.exports = {
    augmentNeverFormedPotentialStreaks,
    getPotentialStep
};
