const assert = require('assert');
const {
    BLOCK_ALTERNATION_PATTERNS,
    findBlockAlternatingTypeStreaks
} = require('../lib/utils/blockAlternationPatterns');

function detect(values, subcategory) {
    const pattern = BLOCK_ALTERNATION_PATTERNS.find(item => item.subcategory === subcategory);
    assert(pattern, `Missing pattern ${subcategory}`);
    const data = values.map((value, index) => ({ value, index }));
    return findBlockAlternatingTypeStreaks(data, new Map(), {
        condition: item => item.value === 'A',
        createStreakObject: (_data, _dateMap, streak, extra) => ({
            length: streak.length,
            values: streak.map(item => item.value).join(''),
            ...extra
        }),
        isConsecutive: () => true,
        descriptionPrefix: 'Test',
        pattern
    }).streaks;
}

assert.deepStrictEqual(
    detect('AABAA'.split(''), 'block2x1SoLe').map(row => row.length),
    [5],
    'The first completed A-B-A block must be retained'
);

assert.deepStrictEqual(
    detect('AABAAB'.split(''), 'block2x1SoLe').map(row => row.length),
    [6],
    'A chain ending inside the next cycle must retain its full valid length'
);

assert.deepStrictEqual(
    detect('AABAABA'.split(''), 'block2x1SoLe').map(row => row.length),
    [7],
    'A longer partial cycle must not be discarded'
);

assert.deepStrictEqual(
    detect('AABBBAA'.split(''), 'block2x3SoLe').map(row => row.length),
    [7],
    'The new 2-3 complex block must be detected'
);

assert.deepStrictEqual(
    detect('AAAAABBBAAAAA'.split(''), 'block5x3SoLe').map(row => row.length),
    [13],
    'The new long 5-3 block must be detected'
);

assert.strictEqual(
    detect('AABAB'.split(''), 'block2x1SoLe').length,
    0,
    'An incomplete or invalid return block must not be recorded'
);

console.log('Block alternation pattern tests passed.');
