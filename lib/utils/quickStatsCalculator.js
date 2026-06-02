const { getTongTT, getTongMoi, getHieu, identifyCategories } = require('./numberAnalysis');

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function parseDate(dateString) {
    if (!dateString) return null;
    const parts = dateString.split('/');
    if (parts.length === 3) {
        return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    return new Date(dateString);
}

function formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

function formatToDDMMYYYY(d) {
    if (!d) return '';
    if (d.includes('/')) return d;
    const parts = d.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return d;
}

function clamp(value, min = 0, max = 1) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
}

function roundOne(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.round(number * 10) / 10;
}

function wilsonLowerBound(successes, total, z = 1.64) {
    if (!total || total <= 0) return 0;
    const phat = successes / total;
    const z2 = z * z;
    const denominator = 1 + z2 / total;
    const centre = phat + z2 / (2 * total);
    const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total);
    return Math.max(0, (centre - margin) / denominator);
}

function daysBetween(from, to) {
    const fromDate = parseDate(from);
    const toDate = parseDate(to);
    if (!fromDate || !toDate) return null;
    return Math.round((toDate - fromDate) / MS_PER_DAY);
}

function parseStatsKey(key) {
    if (key.includes(':')) {
        const parts = key.split(':');
        return { category: parts[0], subcategory: parts[1] };
    }
    if (key.startsWith('pattern_seq_')) return { category: key, subcategory: '' };
    return { category: key, subcategory: 'veLienTiep' };
}

function getPotentialStep(key, subcategory = '') {
    const lowerKey = String(key).toLowerCase();
    const lowerSub = String(subcategory).toLowerCase();
    const isAlternatingGapPattern = (lowerSub === 'vesole' || lowerSub === 'vesolemoi' || lowerKey.includes('vesole') || lowerKey.includes('solemoi')) &&
        !lowerKey.includes('tienluisole') &&
        !lowerKey.includes('luitiensole') &&
        !lowerKey.includes('soletheocap');
    return isAlternatingGapPattern ? 2 : 1;
}

function isAllowedTienLuiSoLeAxis(key, category) {
    return !!key && !!category;
}

function isGenericTienLuiAxis(key, category) {
    const lowerKey = String(key).toLowerCase();
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
    const n = parseInt(numberStr, 10);
    if (Number.isNaN(n)) return null;

    const lowerKey = String(key).toLowerCase();
    if (lowerKey === 'tienluisole' || lowerKey === 'luitiensole' || category === 'cacSo') return n;
    if (category === 'cacDau') return Math.floor(n / 10);
    if (category === 'cacDit') return n % 10;

    if (category === 'tong_tt_cac_tong') return getTongTT(numberStr);
    if (category === 'tong_moi_cac_tong') return getTongMoi(numberStr);
    if (category === 'hieu_cac_hieu') return getHieu(numberStr);

    return n;
}

function getParityType(value) {
    const d0 = parseInt(value[0]) % 2;
    const d1 = parseInt(value[1]) % 2;
    if (d0 === 0 && d1 === 0) return 'CC';
    if (d0 === 0 && d1 === 1) return 'CL';
    if (d0 === 1 && d1 === 0) return 'LC';
    return 'LL';
}

function shouldAttachPotential(stat, key, formLen, step) {
    if (!stat || stat.current) return false;
    const recordLen = stat.computedMaxStreak || (stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0);
    if (recordLen === 0) {
        const prefixLen = formLen - step;
        return prefixLen === 1 || prefixLen === 3;
    }
    if (!recordLen || recordLen < 2) return false;
    const prefixLen = formLen - step;
    if (prefixLen === 1) {
        return recordLen === formLen;
    }
    return formLen >= recordLen - step;
}

function attachPatternNumbers(current, key) {
    try {
        const { predictNextInSequence, getNumbersFromCategory } = require('../controllers/suggestionsController');
        const { category, subcategory } = parseStatsKey(key);
        const nums = predictNextInSequence({ current }, category, subcategory || '');
        if (nums && nums.length > 0 && nums.length < 100) return nums;
        const fallback = getNumbersFromCategory(category);
        return fallback && fallback.length < 100 ? fallback : [];
    } catch (e) {
        return [];
    }
}

// Helper function to calculate stats for a set of streaks
const calculateGapStatsForStreaks = (streaks, isSoLe, currentStreakInfo, today) => {
    const filteredStreaks = currentStreakInfo
        ? streaks.filter(s => !(s.startDate === currentStreakInfo.startDate && s.endDate === currentStreakInfo.endDate))
        : streaks;

    let cutoffDate = null;
    if (currentStreakInfo && currentStreakInfo.startDate) {
        cutoffDate = new Date(parseDate(currentStreakInfo.startDate));
        cutoffDate.setDate(cutoffDate.getDate() - 1);
    }

    const validStreaks = cutoffDate
        ? filteredStreaks.filter(s => parseDate(s.endDate) <= cutoffDate)
        : filteredStreaks;

    if (validStreaks.length < 1) {
        return { avgGap: 0, lastGap: 0, minGap: null, count: 0, pastCount: 0 };
    }

    if (validStreaks.length < 2) {
        let lastGap = 0;
        const lastEnd = parseDate(validStreaks[0].endDate);

        if (currentStreakInfo && currentStreakInfo.startDate) {
            lastGap = Math.ceil((parseDate(currentStreakInfo.startDate) - lastEnd) / 86400000);
        } else {
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            lastGap = Math.ceil((tomorrow - lastEnd) / 86400000);
        }

        return { avgGap: 0, lastGap, minGap: null, count: validStreaks.length, pastCount: validStreaks.length };
    }

    const gaps = [];
    for (let i = 0; i < validStreaks.length - 1; i++) {
        const prevEnd = parseDate(validStreaks[i].endDate);
        const nextStart = parseDate(validStreaks[i + 1].startDate);
        const gap = Math.ceil((nextStart - prevEnd) / 86400000);
        gaps.push(gap);
    }

    let filteredGaps;
    if (isSoLe) {
        filteredGaps = gaps.filter(g => g > 2);
    } else {
        filteredGaps = gaps.filter(g => g > 1);
    }

    const avgGap = filteredGaps.length > 0
        ? Math.round(filteredGaps.reduce((sum, g) => sum + g, 0) / filteredGaps.length)
        : 0;

    const minGap = filteredGaps.length > 0 ? Math.min(...filteredGaps) : null;
    const maxGap = filteredGaps.length > 0 ? Math.max(...filteredGaps) : null;

    const minCount = filteredGaps.filter(g => g === minGap).length;
    const maxCount = filteredGaps.filter(g => g === maxGap).length;

    let lastGap = 0;
    const lastValidStreak = validStreaks[validStreaks.length - 1];
    const lastValidEnd = parseDate(lastValidStreak.endDate);

    if (currentStreakInfo && currentStreakInfo.startDate) {
        lastGap = Math.ceil((parseDate(currentStreakInfo.startDate) - lastValidEnd) / 86400000);
    } else {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        lastGap = Math.ceil((tomorrow - lastValidEnd) / 86400000);
    }

    return { avgGap, lastGap, minGap, maxGap, minCount, maxCount, count: validStreaks.length, pastCount: validStreaks.length };
};

const calculateExtensionGap = (allStreaks, fromLen, step, isSoLe, currentStreakInfo, today) => {
    const toLen = fromLen + step;

    const sortedStreaks = allStreaks
        .filter(s => s.length >= fromLen)
        .sort((a, b) => parseDate(a.endDate) - parseDate(b.endDate));

    if (sortedStreaks.length < 1) {
        return { minGap: null, avgGap: 0, lastGap: 0, count: 0, lastStoppedDate: null };
    }

    const extensionGaps = [];

    for (let i = 0; i < sortedStreaks.length - 1; i++) {
        const currentStreak = sortedStreaks[i];

        if (currentStreak.length === fromLen) {
            for (let j = i + 1; j < sortedStreaks.length; j++) {
                const nextStreak = sortedStreaks[j];
                if (nextStreak.length >= toLen) {
                    const gap = Math.ceil(
                        (parseDate(nextStreak.startDate) - parseDate(currentStreak.endDate)) / 86400000
                    );
                    const minValidGap = isSoLe ? 2 : 1;
                    if (gap > minValidGap) {
                        extensionGaps.push(gap);
                    }
                    break;
                }
            }
        }
    }

    let lastGap = 0;
    let lastStoppedDate = null;

    let cutoffDate = null;
    if (currentStreakInfo && currentStreakInfo.length >= fromLen && currentStreakInfo.startDate) {
        cutoffDate = new Date(parseDate(currentStreakInfo.startDate));
        cutoffDate.setDate(cutoffDate.getDate() - 1);
    }

    const stoppedStreaks = sortedStreaks
        .filter(s => {
            if (s.length !== fromLen) return false;
            if (currentStreakInfo &&
                s.startDate === currentStreakInfo.startDate &&
                s.endDate === currentStreakInfo.endDate) {
                return false;
            }
            if (cutoffDate && parseDate(s.endDate) > cutoffDate) return false;
            return true;
        })
        .sort((a, b) => parseDate(b.endDate) - parseDate(a.endDate));

    if (stoppedStreaks.length > 0) {
        const lastStopped = stoppedStreaks[0];
        lastStoppedDate = lastStopped.endDate;
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        lastGap = Math.ceil((tomorrow - parseDate(lastStopped.endDate)) / 86400000);
    }

    if (extensionGaps.length === 0) {
        return { minGap: null, maxGap: null, avgGap: 0, lastGap, count: 0, minCount: 0, maxCount: 0, lastStoppedDate };
    }

    const minGap = Math.min(...extensionGaps);
    const maxGap = Math.max(...extensionGaps);
    const avgGap = Math.round(extensionGaps.reduce((sum, g) => sum + g, 0) / extensionGaps.length);

    const minCount = extensionGaps.filter(g => g === minGap).length;
    const maxCount = extensionGaps.filter(g => g === maxGap).length;

    return { minGap, maxGap, avgGap, lastGap, count: extensionGaps.length, minCount, maxCount, lastStoppedDate };
};

function computeHistoryMetricsForStreaks(streaks, basisDateStr, latestDateRaw) {
    const valid = streaks.filter(item => item && Number.isFinite(Number(item.length)) && Number(item.length) > 0);
    if (valid.length === 0) {
        return {
            occurrences: 0,
            avgLength: null,
            avgGapDays: null,
            latestEndDate: '',
            daysSinceLatestEnd: null
        };
    }

    const lengths = valid.map(item => Number(item.length));
    const avgLength = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
    const sortedByStart = valid
        .filter(item => item.startDate)
        .slice()
        .sort((a, b) => parseDate(a.startDate) - parseDate(b.startDate));
    const sortedByEnd = valid
        .filter(item => item.endDate)
        .slice()
        .sort((a, b) => parseDate(a.endDate) - parseDate(b.endDate));

    const gaps = [];
    for (let i = 1; i < sortedByStart.length; i++) {
        const gap = daysBetween(sortedByStart[i - 1].startDate, sortedByStart[i].startDate);
        if (gap !== null && gap >= 0) gaps.push(gap);
    }

    const latestEndDate = sortedByEnd.length > 0 ? sortedByEnd[sortedByEnd.length - 1].endDate : '';
    const basisDate = basisDateStr || latestDateRaw;
    return {
        occurrences: valid.length,
        avgLength: roundOne(avgLength),
        avgGapDays: gaps.length > 0 ? roundOne(gaps.reduce((sum, value) => sum + value, 0) / gaps.length) : null,
        latestEndDate,
        daysSinceLatestEnd: latestEndDate && basisDate ? daysBetween(latestEndDate, basisDate) : null
    };
}

function computeLengthHistoryMetricsForStreaks(streaks, targetLen, basisDateStr, latestDateRaw) {
    const length = Number(targetLen);
    if (!Number.isFinite(length) || length <= 0) {
        return {
            targetLength: null,
            occurrences: 0,
            avgLength: null,
            avgGapDays: null,
            latestEndDate: '',
            daysSinceLatestEnd: null
        };
    }

    const basisDate = basisDateStr || latestDateRaw;
    const basis = basisDate ? parseDate(basisDate) : null;
    const valid = streaks
        .filter(item => item && Number(item.length) >= length && item.startDate && item.endDate)
        .filter(item => {
            if (!basis) return true;
            const end = parseDate(item.endDate);
            return end && end <= basis;
        });

    if (valid.length === 0) {
        return {
            targetLength: length,
            occurrences: 0,
            avgLength: null,
            avgGapDays: null,
            latestEndDate: '',
            daysSinceLatestEnd: null
        };
    }

    const lengths = valid.map(item => Number(item.length));
    const avgLength = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
    const sortedByStart = valid
        .slice()
        .sort((a, b) => parseDate(a.startDate) - parseDate(b.startDate));
    const sortedByEnd = valid
        .slice()
        .sort((a, b) => parseDate(a.endDate) - parseDate(b.endDate));

    const gaps = [];
    for (let i = 1; i < sortedByStart.length; i++) {
        const gap = daysBetween(sortedByStart[i - 1].endDate, sortedByStart[i].startDate);
        if (gap !== null && gap >= 0) gaps.push(gap);
    }

    const latestEndDate = sortedByEnd.length > 0 ? sortedByEnd[sortedByEnd.length - 1].endDate : '';
    return {
        targetLength: length,
        occurrences: valid.length,
        avgLength: roundOne(avgLength),
        avgGapDays: gaps.length > 0 ? roundOne(gaps.reduce((sum, value) => sum + value, 0) / gaps.length) : null,
        latestEndDate,
        daysSinceLatestEnd: latestEndDate && basisDate ? daysBetween(latestEndDate, basisDate) : null
    };
}

function buildReliabilityForCurrent(key, stat, current, totalYears, basisDateStr = null) {
    if (!stat || !current) return null;
    const { subcategory } = parseStatsKey(key);
    const step = getPotentialStep(key, subcategory);
    const currentLen = Number(current.length || 0);
    const isPotential = !!current.isPotential;
    const evalLen = isPotential ? currentLen + step : currentLen;
    if (!evalLen || evalLen <= 0) return null;

    const gapStats = stat.gapStats || current.gapStats || {};
    const currentInfo = gapStats[isPotential ? currentLen : evalLen];
    const formInfo = isPotential ? gapStats[evalLen] : null;
    const nextInfo = gapStats[evalLen + step];
    const sampleSize = currentInfo ? Number(currentInfo.count || 0) : 0;
    const formedCount = formInfo ? Number(formInfo.count || 0) : 0;
    const continuedCount = nextInfo ? Number(nextInfo.count || 0) : 0;
    const totalHistoricalDays = Math.max(1, Math.round(totalYears * 365.25));
    const hasConditionalPrefixSample = isPotential && sampleSize > formedCount;
    const effectiveSampleSize = isPotential && !hasConditionalPrefixSample ? totalHistoricalDays : sampleSize;
    const breakCount = isPotential
        ? Math.max(0, effectiveSampleSize - formedCount)
        : Math.max(0, effectiveSampleSize - continuedCount);
    const dropOffRate = effectiveSampleSize > 0 ? breakCount / effectiveSampleSize : 0;
    const formationRate = isPotential && effectiveSampleSize > 0 ? formedCount / effectiveSampleSize : null;
    const afterFormationDropOffRate = isPotential && formedCount > 0
        ? Math.max(0, formedCount - continuedCount) / formedCount
        : null;
    const lowerBound = wilsonLowerBound(breakCount, effectiveSampleSize);
    const history = stat.historyMetrics || current.historyMetrics;

    const sampleScore = clamp(Math.log10(effectiveSampleSize + 1) / Math.log10(100));
    const recencyScore = history.daysSinceLatestEnd === null || history.daysSinceLatestEnd === undefined
        ? 0.45
        : clamp(1 / (1 + Math.max(0, Number(history.daysSinceLatestEnd) || 0) / 365));
    const cadenceRatio = history.avgGapDays && history.daysSinceLatestEnd !== null && history.daysSinceLatestEnd !== undefined
        ? Math.max(0, Number(history.daysSinceLatestEnd) || 0) / Number(history.avgGapDays)
        : null;
    const cadenceScore = cadenceRatio === null
        ? 0.5
        : (cadenceRatio <= 1 ? clamp(0.45 + cadenceRatio * 0.55) : clamp(1 - Math.min(0.35, (cadenceRatio - 1) * 0.12)));
    const lengthScore = history.avgLength
        ? clamp(evalLen / Math.max(Number(history.avgLength), 1) / 1.5)
        : 0.5;
    const reliabilityScore = Math.round((
        lowerBound * 0.48 +
        dropOffRate * 0.18 +
        sampleScore * 0.18 +
        recencyScore * 0.08 +
        cadenceScore * 0.04 +
        lengthScore * 0.04
    ) * 100);

    return {
        score: reliabilityScore,
        sampleSize: effectiveSampleSize,
        rawSampleSize: isPotential ? sampleSize : null,
        usesFrequencyFallback: isPotential && !hasConditionalPrefixSample,
        continuedCount,
        breakCount,
        dropOffRate,
        exclusionRate: dropOffRate,
        dropOffPercent: roundOne(dropOffRate * 100),
        formationRate,
        formationPercent: formationRate === null ? null : roundOne(formationRate * 100),
        formationCount: isPotential ? formedCount : null,
        afterFormationDropOffRate,
        afterFormationDropOffPercent: afterFormationDropOffRate === null ? null : roundOne(afterFormationDropOffRate * 100),
        lowerBound,
        lowerBoundPercent: roundOne(lowerBound * 100)
    };
}

/**
 * Calculates all quick stats and summaries for a single pattern
 */
function calculateQuickStatsForPattern(key, categoryData, options = {}) {
    const {
        latestDate,
        today = new Date(),
        totalYears = 20,
        matchedToday = [],
        matchedYesterday = [],
        matchedDayBeforeYesterday = [],
        numTodayStr = '',
        numYesterdayStr = '',
        numDayBeforeYesterdayStr = '',
        yestDate = '',
        dayBeforeYestDate = '',
        hasLatest = false,
        hasYesterday = false,
        hasDayBeforeYesterday = false
    } = options;

    if (!categoryData || !Array.isArray(categoryData.streaks) || categoryData.streaks.length === 0) {
        return null;
    }

    const streaks = [...categoryData.streaks].sort((a, b) => b.length - a.length);
    const longestLength = streaks[0].length;

    // hydrate function
    const hydrateStreak = (streak) => {
        if (!streak) return null;
        return {
            startDate: streak.startDate,
            endDate: streak.endDate,
            length: streak.length,
            values: streak.values,
            dates: streak.dates,
            gapValue: streak.gapValue
        };
    };

    const longest = streaks.filter(s => s.length === longestLength).map(hydrateStreak);

    let secondLongest = [];
    for (let i = 0; i < streaks.length; i++) {
        if (streaks[i].length < longestLength) {
            const secondLength = streaks[i].length;
            secondLongest = streaks.filter(s => s.length === secondLength).map(hydrateStreak);
            break;
        }
    }

    // Determine current streak
    let current = null;
    const { category, subcategory } = parseStatsKey(key);
    const lowerKey = key.toLowerCase();
    const lowerSub = String(subcategory || '').toLowerCase();

    const isSoLe = (lowerSub === 'vesole' || lowerSub === 'vesolemoi' || lowerKey.includes('vesole') || lowerKey.includes('solemoi')) &&
        !lowerKey.includes('tienluisole') &&
        !lowerKey.includes('luitiensole') &&
        !lowerKey.includes('soletheocap');
    const isTienLuiSoLe = lowerSub === 'tienluisole' || lowerSub === 'luitiensole' || lowerKey.includes('tienluisole') || lowerKey.includes('luitiensole');

    if (latestDate) {
        if (isSoLe) {
            const rawStreak = categoryData.streaks.find(s => s.endDate === yestDate);
            if (rawStreak) {
                const streak = hydrateStreak(rawStreak);
                const isSoLeMoi = lowerKey.includes('solemoi');
                let isValid = true;

                if (isSoLeMoi && numTodayStr) {
                    try {
                        const { predictNextInSequence } = require('../controllers/suggestionsController');
                        const [categoryName, subcategoryStr] = key.split(':');
                        const matchNumbers = predictNextInSequence({ current: streak }, categoryName, subcategoryStr || '');
                        if (matchNumbers && matchNumbers.length > 0) {
                            const stringNumbers = matchNumbers.map(n => String(n).padStart(2, '0'));
                            if (stringNumbers.includes(numTodayStr)) {
                                isValid = false;
                            }
                        }

                        // Validate gapValue for New Alternating
                        if (isValid && streak.gapValue !== undefined) {
                            let todayGapValue = null;
                            const cat = categoryName;
                            if (cat === 'motSo' || cat === 'motSoVeSoleMoi' || cat.startsWith('cacSo') || cat.startsWith('motSo')) {
                                todayGapValue = numTodayStr;
                            } else if (cat === 'motDau' || cat === 'motDauVeSoleMoi' || cat.startsWith('cacDau') || cat.startsWith('dau_')) {
                                todayGapValue = numTodayStr[0];
                            } else if (cat === 'motDit' || cat === 'motDitVeSoleMoi' || cat.startsWith('cacDit') || cat.startsWith('dit_')) {
                                todayGapValue = numTodayStr[1];
                            } else if (cat.startsWith('tong_tt_')) {
                                todayGapValue = String(getTongTT(numTodayStr));
                            } else if (cat.startsWith('tong_moi_')) {
                                todayGapValue = String(getTongMoi(numTodayStr));
                            } else if (cat.startsWith('hieu_')) {
                                todayGapValue = String(getHieu(numTodayStr));
                            } else if (['chanChan', 'chanLe', 'leChan', 'leLe'].includes(cat)) {
                                todayGapValue = getParityType(numTodayStr);
                            }

                            if (todayGapValue !== null && String(todayGapValue) !== String(streak.gapValue)) {
                                isValid = false;
                            }
                        }
                    } catch (e) {
                        console.error('Lỗi khi validate So le mới:', e);
                    }
                }

                if (isValid) {
                    current = streak;
                }
            }
        } else if (isTienLuiSoLe) {
            const s = categoryData.streaks.find(s => s.endDate === latestDate && s.length >= 4);
            if (s) current = hydrateStreak(s);
        } else {
            const s = categoryData.streaks.find(s => s.endDate === latestDate);
            if (s) current = hydrateStreak(s);
        }
    }

    // Average interval
    const streaksByDate = [...categoryData.streaks].sort((a, b) => parseDate(a.startDate) - parseDate(b.startDate));
    let totalInterval = 0;
    let daysSinceLast = 'N/A';

    if (streaksByDate.length > 1) {
        for (let i = 1; i < streaksByDate.length; i++) {
            const prevEndDate = parseDate(streaksByDate[i - 1].endDate);
            const currStartDate = parseDate(streaksByDate[i].startDate);
            const diffTime = Math.abs(currStartDate - prevEndDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            totalInterval += diffDays;
        }
    }

    const averageInterval = streaksByDate.length > 1 ? Math.round(totalInterval / (streaksByDate.length - 1)) : 0;

    if (latestDate && streaksByDate.length > 0) {
        const lastStreakEndDate = parseDate(streaksByDate[streaksByDate.length - 1].endDate);
        if (today && lastStreakEndDate) {
            const diffTime = Math.abs(today - lastStreakEndDate);
            daysSinceLast = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        }
    }

    // Gap Stats
    const gapStats = {};
    const exactGapStats = {};
    const maxLen = longestLength > 0 ? longestLength : 0;
    const calcLimit = maxLen + 1;

    for (let len = 1; len <= calcLimit; len++) {
        const geStreaks = categoryData.streaks
            .filter(s => s.length >= len)
            .sort((a, b) => parseDate(a.endDate) - parseDate(b.endDate));
        gapStats[len] = calculateGapStatsForStreaks(geStreaks, isSoLe, current, today);

        const exactStreaks = categoryData.streaks
            .filter(s => s.length === len)
            .sort((a, b) => parseDate(a.endDate) - parseDate(b.endDate));
        exactGapStats[len] = calculateGapStatsForStreaks(exactStreaks, isSoLe, current, today);
    }

    // Extension Gap Stats
    const extensionGapStats = {};
    const step = isSoLe ? 2 : 1;
    for (let len = 1; len <= calcLimit; len++) {
        extensionGapStats[len] = calculateExtensionGap(categoryData.streaks, len, step, isSoLe, current, today);
    }

    // Length History Metrics
    const lengthHistoryMetrics = {};
    for (let len = 1; len <= calcLimit; len++) {
        lengthHistoryMetrics[len] = computeLengthHistoryMetricsForStreaks(categoryData.streaks, len, latestDate, latestDate);
    }

    // History Metrics
    const historyMetrics = computeHistoryMetricsForStreaks(categoryData.streaks, latestDate, latestDate);

    // Initial result object
    const result = {
        description: categoryData.description,
        longest,
        secondLongest,
        current,
        averageInterval,
        daysSinceLast,
        gapStats,
        exactGapStats,
        extensionGapStats,
        lengthHistoryMetrics,
        historyMetrics,
        reliability: null
    };

    // Calculate computedMaxStreak & isSuperMaxThreshold
    let computedMaxStreak = longestLength;
    let isSuperMaxThreshold = false;
    let startLen = 2;
    let increment = 1;

    if (isSoLe) {
        startLen = 3;
        increment = 2;
    } else if (isTienLuiSoLe) {
        startLen = 4;
        increment = 1;
    }

    for (let len = startLen; len <= calcLimit; len += increment) {
        const count = exactGapStats[len] ? exactGapStats[len].count : 0;
        const freqYear = count / totalYears;

        if (freqYear <= 1.5) {
            computedMaxStreak = len;
            isSuperMaxThreshold = freqYear <= 0.5;
            break;
        }
    }

    result.computedMaxStreak = computedMaxStreak;
    result.isSuperMaxThreshold = isSuperMaxThreshold;

    // Attach potential streak if current is null
    if (!result.current && hasLatest) {
        const canAttachOneDayPotential = (formLen, step) => {
            const prefixLen = formLen - step;
            if (prefixLen !== 1) return true;
            return computedMaxStreak === formLen || computedMaxStreak === 0;
        };

        const isSoLeTheoCap = lowerSub === 'soletheocap' || lowerKey.includes('soletheocap');

        if (isTienLuiSoLe) {
            if (isAllowedTienLuiSoLeAxis(key, category) &&
                hasYesterday &&
                hasDayBeforeYesterday &&
                matchesTienLuiFixedCategory(key, category, matchedDayBeforeYesterday, matchedYesterday, matchedToday)) {
                const v0 = extractTienLuiOrderedValue(numDayBeforeYesterdayStr, key, category);
                const v1 = extractTienLuiOrderedValue(numYesterdayStr, key, category);
                const v2 = extractTienLuiOrderedValue(numTodayStr, key, category);
                if (v0 !== null && v1 !== null && v2 !== null) {
                    const d1 = Number(v1) - Number(v0);
                    const d2 = Number(v2) - Number(v1);
                    const wantsTienFirst = lowerSub === 'tienluisole' || lowerKey.includes('tienluisole');
                    const directionsOk = wantsTienFirst ? (d1 > 0 && d2 < 0) : (d1 < 0 && d2 > 0);
                    if (directionsOk && canAttachOneDayPotential(4, 1)) {
                        result.current = {
                            length: 3,
                            startDate: dayBeforeYestDate,
                            endDate: latestDate,
                            values: [numDayBeforeYesterdayStr, numYesterdayStr, numTodayStr],
                            dates: [dayBeforeYestDate, yestDate, latestDate],
                            fullSequence: [
                                { date: dayBeforeYestDate, value: numDayBeforeYesterdayStr, isLatest: false },
                                { date: yestDate, value: numYesterdayStr, isLatest: false },
                                { date: latestDate, value: numTodayStr, isLatest: true }
                            ],
                            isPotential: true
                        };
                    }
                }
            }
        } else if (isSoLeTheoCap) {
            const { isSoLeTheoCapCategory, getSoLeTheoCapLabel, formatSoLeTheoCapPairValue } = require('../utils/soLeTheoCapPairs');
            if (isSoLeTheoCapCategory(category) && hasYesterday && hasDayBeforeYesterday) {
                const labelToday = getSoLeTheoCapLabel(numTodayStr, category);
                const labelYesterday = getSoLeTheoCapLabel(numYesterdayStr, category);
                const labelDayBeforeYesterday = getSoLeTheoCapLabel(numDayBeforeYesterdayStr, category);

                if (labelToday && labelYesterday && labelDayBeforeYesterday &&
                    labelToday !== labelYesterday &&
                    labelToday === labelDayBeforeYesterday) {
                    const patternLabels = [labelDayBeforeYesterday, labelYesterday, labelToday];
                    result.current = {
                        length: 3,
                        startDate: dayBeforeYestDate,
                        endDate: latestDate,
                        values: [numDayBeforeYesterdayStr, numYesterdayStr, numTodayStr],
                        patternLabels,
                        pairCategory: category,
                        value: formatSoLeTheoCapPairValue(category, patternLabels),
                        dates: [dayBeforeYestDate, yestDate, latestDate],
                        fullSequence: [
                            { date: dayBeforeYestDate, value: numDayBeforeYesterdayStr, isLatest: false },
                            { date: yestDate, value: numYesterdayStr, isLatest: false },
                            { date: latestDate, value: numTodayStr, isLatest: true }
                        ],
                        isPotential: true
                    };
                }
            }
        } else if (isSoLe) {
            if (canAttachOneDayPotential(3, 2) && hasYesterday && matchedYesterday.includes(category) && !matchedToday.includes(category)) {
                result.current = {
                    length: 1,
                    startDate: yestDate,
                    endDate: yestDate,
                    values: [numYesterdayStr],
                    dates: [yestDate],
                    fullSequence: [
                        { date: yestDate, value: numYesterdayStr, isLatest: false },
                        { date: latestDate, value: numTodayStr, isLatest: true }
                    ],
                    isPotential: true
                };
            }
        } else {
            if (canAttachOneDayPotential(2, 1) && matchedToday.includes(category)) {
                result.current = {
                    length: 1,
                    startDate: latestDate,
                    endDate: latestDate,
                    values: [numTodayStr],
                    dates: [latestDate],
                    fullSequence: [{ date: latestDate, value: numTodayStr, isLatest: true }],
                    isPotential: true
                };
            }
        }
    }

    // Attach pattern numbers to current/potential streak
    if (result.current) {
        result.current.patternNumbers = attachPatternNumbers(result.current, key);
    }

    // Now calculate reliability for current/potential
    if (result.current) {
        result.reliability = buildReliabilityForCurrent(key, result, result.current, totalYears, latestDate);
    }

    return result;
}

module.exports = {
    calculateQuickStatsForPattern,
    buildReliabilityForCurrent
};
