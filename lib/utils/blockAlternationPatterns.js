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
        subcategory: 'block2x3SoLe',
        label: 'Nhịp 2-3 (AABBBAA)',
        description: '2 ngày thuộc dạng A, 3 ngày khác dạng B, rồi quay lại A: A-A-B-B-B-A-A',
        aLength: 2,
        bLength: 3
    },
    {
        subcategory: 'block3x1SoLe',
        label: 'Nhịp 3-1 (AAABAAA)',
        description: '3 ngày thuộc dạng A, 1 ngày khác dạng B, rồi quay lại A: A-A-A-B-A-A-A',
        aLength: 3,
        bLength: 1
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
    },
    {
        subcategory: 'block4x4SoLe',
        label: 'Nhịp 4-4 (AAAABBBBAAAA)',
        description: '4 ngày thuộc dạng A, 4 ngày khác dạng B, rồi quay lại A: A-A-A-A-B-B-B-B-A-A-A-A',
        aLength: 4,
        bLength: 4
    },
    {
        subcategory: 'block5x2SoLe',
        label: 'Nhịp 5-2 (AAAAABBAAAAA)',
        description: '5 ngày thuộc dạng A, 2 ngày khác dạng B, rồi quay lại A: A-A-A-A-A-B-B-A-A-A-A-A',
        aLength: 5,
        bLength: 2
    },
    {
        subcategory: 'block5x3SoLe',
        label: 'Nhịp 5-3 (AAAAABBBAAAAA)',
        description: '5 ngày thuộc dạng A, 3 ngày khác dạng B, rồi quay lại A: A-A-A-A-A-B-B-B-A-A-A-A-A',
        aLength: 5,
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
        while (end < data.length) {
            const offset = end - start;
            const inA = (offset % cycleLength) < pattern.aLength;
            if (!matchesBlockCondition(data[end], condition, inA)) {
                break;
            }
            if (end + 1 >= data.length || !isConsecutive(data[end], data[end + 1])) {
                end++;
                break;
            }
            end++;
        }

        const length = end - start;
        // Once A-B-A has formed, every later matching day is a valid state of
        // the same chain. Keeping only exact cycle boundaries selects away
        // chains that continue into the next B/A block and biases dropoff.
        if (length >= minLength) {
            const streak = data.slice(start, end);
            const finalStreak = createStreakObject(data, dateMap, streak, {
                blockPattern: `${pattern.aLength}-${pattern.bLength}`,
                blockALength: pattern.aLength,
                blockBLength: pattern.bLength,
                value: 'Theo dạng/khác dạng'
            });
            if (finalStreak) allStreaks.push(finalStreak);
            start = Math.max(start, end - 2);
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
