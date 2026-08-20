'use strict';

function displayDateToIso(value) {
    const match = String(value || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return '';
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeNode(historical, suffix, suffixStartIso) {
    if (isObject(historical) && Array.isArray(historical.streaks)) {
        const suffixObject = isObject(suffix) ? suffix : {};
        const historicalStreaks = historical.streaks.filter(streak => {
            const endIso = displayDateToIso(streak?.endDate);
            return endIso && endIso < suffixStartIso;
        });
        return {
            ...historical,
            ...suffixObject,
            streaks: [...historicalStreaks, ...(suffixObject.streaks || [])]
        };
    }
    if (!isObject(historical) && !isObject(suffix)) return suffix ?? historical;
    const result = {};
    const keys = new Set([
        ...Object.keys(isObject(historical) ? historical : {}),
        ...Object.keys(isObject(suffix) ? suffix : {})
    ]);
    for (const key of keys) {
        result[key] = mergeNode(historical?.[key], suffix?.[key], suffixStartIso);
    }
    return result;
}

function mergeHistoricalAndSuffixStats(historicalStats, suffixStats, suffixStartIso) {
    if (!suffixStartIso) throw new Error('Thiếu suffixStartIso khi merge rolling stats.');
    return {
        numberStats: mergeNode(
            historicalStats?.numberStats || {},
            suffixStats?.numberStats || {},
            suffixStartIso
        ),
        headTailStats: mergeNode(
            historicalStats?.headTailStats || {},
            suffixStats?.headTailStats || {},
            suffixStartIso
        ),
        sumDiffStats: mergeNode(
            historicalStats?.sumDiffStats || {},
            suffixStats?.sumDiffStats || {},
            suffixStartIso
        ),
        elapsedMs: Number(suffixStats?.elapsedMs || 0)
    };
}

module.exports = {
    displayDateToIso,
    mergeHistoricalAndSuffixStats,
    mergeNode
};
