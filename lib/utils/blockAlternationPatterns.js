const BLOCK_ALTERNATION_PATTERNS = [
    {
        subcategory: 'block2x1SoLe',
        label: 'Nhịp 2-1 (AABAA)',
        description: '2 ngày thuộc dạng A, 1 ngày khác dạng B, rồi quay lại A: A-A-B-A-A',
        aLength: 2,
        bLength: 1
    },
    {
        subcategory: 'block2x2SoLe',
        label: 'Nhịp 2-2 (AABBAA)',
        description: '2 ngày thuộc dạng A, 2 ngày khác dạng B, rồi quay lại A: A-A-B-B-A-A',
        aLength: 2,
        bLength: 2
    },
    {
        subcategory: 'block3x2SoLe',
        label: 'Nhịp 3-2 (AAABBAAA)',
        description: '3 ngày thuộc dạng A, 2 ngày khác dạng B, rồi quay lại A: A-A-A-B-B-A-A-A',
        aLength: 3,
        bLength: 2
    },
    {
        subcategory: 'block3x3SoLe',
        label: 'Nhịp 3-3 (AAABBBAAA)',
        description: '3 ngày thuộc dạng A, 3 ngày khác dạng B, rồi quay lại A: A-A-A-B-B-B-A-A-A',
        aLength: 3,
        bLength: 3
    },
    {
        subcategory: 'block4x2SoLe',
        label: 'Nhịp 4-2 (AAAABBAAAA)',
        description: '4 ngày thuộc dạng A, 2 ngày khác dạng B, rồi quay lại A: A-A-A-A-B-B-A-A-A-A',
        aLength: 4,
        bLength: 2
    },
    {
        subcategory: 'block4x3SoLe',
        label: 'Nhịp 4-3 (AAAABBBAAAA)',
        description: '4 ngày thuộc dạng A, 3 ngày khác dạng B, rồi quay lại A: A-A-A-A-B-B-B-A-A-A-A',
        aLength: 4,
        bLength: 3
    }
];

function matchesBlockCondition(item, condition, shouldMatch) {
    const matched = !!condition(item);
    return shouldMatch ? matched : !matched;
}

function findBlockAlternatingTypeStreaks(data, dateMap, {
    condition,
    createStreakObject,
    isConsecutive,
    descriptionPrefix,
    pattern
}) {
    if (!pattern || !condition || !createStreakObject || !isConsecutive) {
        return { description: descriptionPrefix || '', streaks: [] };
    }

    const allStreaks = [];
    const minLength = pattern.aLength + pattern.bLength + pattern.aLength;
    const cycleLength = pattern.aLength + pattern.bLength;
    const description = `${descriptionPrefix} - ${pattern.label}`;

    for (let start = 0; start <= data.length - minLength; start++) {
        if (!matchesBlockCondition(data[start], condition, true)) continue;

        let end = start;
        let failed = false;
        while (end + 1 < data.length) {
            const offset = end - start;
            const inA = (offset % cycleLength) < pattern.aLength;
            if (!matchesBlockCondition(data[end], condition, inA)) {
                failed = true;
                break;
            }
            if (!isConsecutive(data[end], data[end + 1])) break;
            end++;
        }

        const lastOffset = end - start;
        const lastInA = (lastOffset % cycleLength) < pattern.aLength;
        if (!failed && matchesBlockCondition(data[end], condition, lastInA)) {
            const length = end - start + 1;
            const completedReturnToA = length >= minLength &&
                ((length - pattern.aLength) % cycleLength) === 0;
            if (completedReturnToA) {
                const streak = data.slice(start, end + 1);
                const finalStreak = createStreakObject(data, dateMap, streak, {
                    blockPattern: `${pattern.aLength}-${pattern.bLength}`,
                    blockALength: pattern.aLength,
                    blockBLength: pattern.bLength,
                    value: 'Theo dạng/khác dạng'
                });
                if (finalStreak) allStreaks.push(finalStreak);
                start = Math.max(start, end - 1);
            }
        }
    }

    return { description, streaks: allStreaks.filter(Boolean) };
}

function buildBlockAlternationStats(data, dateMap, {
    condition,
    createStreakObject,
    isConsecutive,
    descriptionPrefix
}) {
    const results = {};
    for (const pattern of BLOCK_ALTERNATION_PATTERNS) {
        results[pattern.subcategory] = findBlockAlternatingTypeStreaks(data, dateMap, {
            condition,
            createStreakObject,
            isConsecutive,
            descriptionPrefix,
            pattern
        });
    }
    return results;
}

module.exports = {
    BLOCK_ALTERNATION_PATTERNS,
    buildBlockAlternationStats,
    findBlockAlternatingTypeStreaks
};
