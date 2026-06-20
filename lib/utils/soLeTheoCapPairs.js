const { getTongTT, getTongMoi, getHieu } = require('./numberAnalysis');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));
const SO_LE_THEO_CAP_MIN_LENGTH = 4;

const digitAt = (numberStr, index) => parseInt(String(numberStr).padStart(2, '0')[index], 10);

const PRIME_DIGITS = new Set([2, 3, 5, 7]);
const PRIME_NUMBERS_UNDER_100 = new Set([
    2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97
]);

function buildQuadrantPairConfigs({ keyPrefix, descriptionPrefix, positiveName, negativeName, classifyDigit }) {
    const states = [
        { key: 'aa', shortName: `${positiveName}-${positiveName}`, first: true, second: true },
        { key: 'ab', shortName: `${positiveName}-${negativeName}`, first: true, second: false },
        { key: 'ba', shortName: `${negativeName}-${positiveName}`, first: false, second: true },
        { key: 'bb', shortName: `${negativeName}-${negativeName}`, first: false, second: false }
    ];
    const configs = [];

    for (let i = 0; i < states.length; i++) {
        for (let j = i + 1; j < states.length; j++) {
            const left = states[i];
            const right = states[j];
            const makeLabel = state => ({
                key: state.key,
                name: `${descriptionPrefix} ${state.shortName}`,
                shortName: state.shortName,
                matches: number => (
                    classifyDigit(digitAt(number, 0)) === state.first &&
                    classifyDigit(digitAt(number, 1)) === state.second
                )
            });
            configs.push({
                key: `${keyPrefix}_${left.key}_${right.key}`,
                group: 'number',
                description: `${descriptionPrefix} ${left.shortName} - ${right.shortName}`,
                labels: [makeLabel(left), makeLabel(right)]
            });
        }
    }
    return configs;
}

const QUADRANT_PAIR_CONFIGS = [
    ...buildQuadrantPairConfigs({
        keyPrefix: 'cap_chan_le',
        descriptionPrefix: 'Đầu-đít chẵn/lẻ',
        positiveName: 'chẵn',
        negativeName: 'lẻ',
        classifyDigit: digit => digit % 2 === 0
    }),
    ...buildQuadrantPairConfigs({
        keyPrefix: 'cap_nho_to',
        descriptionPrefix: 'Đầu-đít nhỏ/to',
        positiveName: 'nhỏ',
        negativeName: 'to',
        classifyDigit: digit => digit < 5
    }),
    ...buildQuadrantPairConfigs({
        keyPrefix: 'cap_nguyento_khac',
        descriptionPrefix: 'Đầu-đít nguyên tố/khác',
        positiveName: 'nguyên tố',
        negativeName: 'khác',
        classifyDigit: digit => PRIME_DIGITS.has(digit)
    }),
    ...buildQuadrantPairConfigs({
        keyPrefix: 'cap_chia3_khac',
        descriptionPrefix: 'Đầu-đít chia hết 3/khác',
        positiveName: 'chia hết 3',
        negativeName: 'khác',
        classifyDigit: digit => digit % 3 === 0
    })
];

const SO_LE_THEO_CAP_CONFIGS = [
    {
        key: 'dau_chan_le',
        group: 'head_tail',
        description: 'Đầu chẵn - lẻ',
        labels: [
            { key: 'chan', name: 'Đầu chẵn', shortName: 'chẵn', matches: n => digitAt(n, 0) % 2 === 0 },
            { key: 'le', name: 'Đầu lẻ', shortName: 'lẻ', matches: n => digitAt(n, 0) % 2 !== 0 }
        ]
    },
    {
        key: 'dit_chan_le',
        group: 'head_tail',
        description: 'Đít chẵn - lẻ',
        labels: [
            { key: 'chan', name: 'Đít chẵn', shortName: 'chẵn', matches: n => digitAt(n, 1) % 2 === 0 },
            { key: 'le', name: 'Đít lẻ', shortName: 'lẻ', matches: n => digitAt(n, 1) % 2 !== 0 }
        ]
    },
    {
        key: 'dau_nho_to',
        group: 'head_tail',
        description: 'Đầu nhỏ - to',
        labels: [
            { key: 'nho', name: 'Đầu nhỏ', shortName: 'nhỏ', matches: n => digitAt(n, 0) < 5 },
            { key: 'to', name: 'Đầu to', shortName: 'to', matches: n => digitAt(n, 0) >= 5 }
        ]
    },
    {
        key: 'dit_nho_to',
        group: 'head_tail',
        description: 'Đít nhỏ - to',
        labels: [
            { key: 'nho', name: 'Đít nhỏ', shortName: 'nhỏ', matches: n => digitAt(n, 1) < 5 },
            { key: 'to', name: 'Đít to', shortName: 'to', matches: n => digitAt(n, 1) >= 5 }
        ]
    },
    {
        key: 'dau_nguyento_hopso',
        group: 'head_tail',
        description: 'Đầu nguyên tố - hợp số',
        labels: [
            { key: 'nguyento', name: 'Đầu nguyên tố', shortName: 'nguyên tố', matches: n => PRIME_DIGITS.has(digitAt(n, 0)) },
            { key: 'hopso', name: 'Đầu hợp số', shortName: 'hợp số', matches: n => !PRIME_DIGITS.has(digitAt(n, 0)) }
        ]
    },
    {
        key: 'dit_nguyento_hopso',
        group: 'head_tail',
        description: 'Đít nguyên tố - hợp số',
        labels: [
            { key: 'nguyento', name: 'Đít nguyên tố', shortName: 'nguyên tố', matches: n => PRIME_DIGITS.has(digitAt(n, 1)) },
            { key: 'hopso', name: 'Đít hợp số', shortName: 'hợp số', matches: n => !PRIME_DIGITS.has(digitAt(n, 1)) }
        ]
    },
    {
        key: 'dau_chia3',
        group: 'head_tail',
        description: 'Đầu chia hết cho 3',
        labels: [
            { key: 'chia_het', name: 'Đầu chia hết cho 3', shortName: 'chia hết 3', matches: n => digitAt(n, 0) % 3 === 0 },
            { key: 'khong_chia_het', name: 'Đầu không chia hết cho 3', shortName: 'k.chia hết 3', matches: n => digitAt(n, 0) % 3 !== 0 }
        ]
    },
    {
        key: 'dit_chia3',
        group: 'head_tail',
        description: 'Đít chia hết cho 3',
        labels: [
            { key: 'chia_het', name: 'Đít chia hết cho 3', shortName: 'chia hết 3', matches: n => digitAt(n, 1) % 3 === 0 },
            { key: 'khong_chia_het', name: 'Đít không chia hết cho 3', shortName: 'k.chia hết 3', matches: n => digitAt(n, 1) % 3 !== 0 }
        ]
    },
    {
        key: 'tong_tt_pair_chan_le',
        group: 'sum_diff',
        description: 'Tổng TT chẵn - lẻ',
        labels: [
            { key: 'chan', name: 'Tổng TT chẵn', shortName: 'chẵn', matches: n => getTongTT(String(n).padStart(2, '0')) % 2 === 0 },
            { key: 'le', name: 'Tổng TT lẻ', shortName: 'lẻ', matches: n => getTongTT(String(n).padStart(2, '0')) % 2 !== 0 }
        ]
    },
    {
        key: 'tong_moi_pair_chan_le',
        group: 'sum_diff',
        description: 'Tổng mới chẵn - lẻ',
        labels: [
            { key: 'chan', name: 'Tổng mới chẵn', shortName: 'chẵn', matches: n => getTongMoi(String(n).padStart(2, '0')) % 2 === 0 },
            { key: 'le', name: 'Tổng mới lẻ', shortName: 'lẻ', matches: n => getTongMoi(String(n).padStart(2, '0')) % 2 !== 0 }
        ]
    },
    {
        key: 'hieu_pair_chan_le',
        group: 'sum_diff',
        description: 'Hiệu chẵn - lẻ',
        labels: [
            { key: 'chan', name: 'Hiệu chẵn', shortName: 'chẵn', matches: n => getHieu(String(n).padStart(2, '0')) % 2 === 0 },
            { key: 'le', name: 'Hiệu lẻ', shortName: 'lẻ', matches: n => getHieu(String(n).padStart(2, '0')) % 2 !== 0 }
        ]
    },
    {
        key: 'tong_tt_nho_to',
        group: 'sum_diff',
        description: 'Tổng TT nhỏ - to',
        labels: [
            { key: 'nho', name: 'Tổng TT nhỏ', shortName: 'nhỏ', matches: n => getTongTT(String(n).padStart(2, '0')) < 5 },
            { key: 'to', name: 'Tổng TT to', shortName: 'to', matches: n => getTongTT(String(n).padStart(2, '0')) >= 5 }
        ]
    },
    {
        key: 'tong_moi_nho_to',
        group: 'sum_diff',
        description: 'Tổng mới nhỏ - to',
        labels: [
            { key: 'nho', name: 'Tổng mới nhỏ', shortName: 'nhỏ', matches: n => getTongMoi(String(n).padStart(2, '0')) < 9 },
            { key: 'to', name: 'Tổng mới to', shortName: 'to', matches: n => getTongMoi(String(n).padStart(2, '0')) >= 9 }
        ]
    },
    {
        key: 'hieu_nho_to',
        group: 'sum_diff',
        description: 'Hiệu nhỏ - to',
        labels: [
            { key: 'nho', name: 'Hiệu nhỏ', shortName: 'nhỏ', matches: n => getHieu(String(n).padStart(2, '0')) < 5 },
            { key: 'to', name: 'Hiệu to', shortName: 'to', matches: n => getHieu(String(n).padStart(2, '0')) >= 5 }
        ]
    },
    {
        key: 'tong_tt_nguyento_hopso',
        group: 'sum_diff',
        description: 'Tổng TT nguyên tố - hợp số',
        labels: [
            { key: 'nguyento', name: 'Tổng TT nguyên tố', shortName: 'nguyên tố', matches: n => PRIME_DIGITS.has(getTongTT(String(n).padStart(2, '0'))) },
            { key: 'hopso', name: 'Tổng TT hợp số', shortName: 'hợp số', matches: n => !PRIME_DIGITS.has(getTongTT(String(n).padStart(2, '0'))) }
        ]
    },
    {
        key: 'tong_tt_chia3',
        group: 'sum_diff',
        description: 'Tổng TT chia hết cho 3',
        labels: [
            { key: 'chia_het', name: 'Tổng TT chia hết cho 3', shortName: 'chia hết 3', matches: n => getTongTT(String(n).padStart(2, '0')) % 3 === 0 },
            { key: 'khong_chia_het', name: 'Tổng TT không chia hết cho 3', shortName: 'k.chia hết 3', matches: n => getTongTT(String(n).padStart(2, '0')) % 3 !== 0 }
        ]
    },
    {
        key: 'tong_moi_nguyento_hopso',
        group: 'sum_diff',
        description: 'Tổng mới nguyên tố - hợp số',
        labels: [
            { key: 'nguyento', name: 'Tổng mới nguyên tố', shortName: 'nguyên tố', matches: n => PRIME_NUMBERS_UNDER_100.has(getTongMoi(String(n).padStart(2, '0'))) },
            { key: 'hopso', name: 'Tổng mới hợp số', shortName: 'hợp số', matches: n => !PRIME_NUMBERS_UNDER_100.has(getTongMoi(String(n).padStart(2, '0'))) }
        ]
    },
    {
        key: 'tong_moi_chia3',
        group: 'sum_diff',
        description: 'Tổng mới chia hết cho 3',
        labels: [
            { key: 'chia_het', name: 'Tổng mới chia hết cho 3', shortName: 'chia hết 3', matches: n => getTongMoi(String(n).padStart(2, '0')) % 3 === 0 },
            { key: 'khong_chia_het', name: 'Tổng mới không chia hết cho 3', shortName: 'k.chia hết 3', matches: n => getTongMoi(String(n).padStart(2, '0')) % 3 !== 0 }
        ]
    },
    {
        key: 'hieu_nguyento_hopso',
        group: 'sum_diff',
        description: 'Hiệu nguyên tố - hợp số',
        labels: [
            { key: 'nguyento', name: 'Hiệu nguyên tố', shortName: 'nguyên tố', matches: n => PRIME_DIGITS.has(getHieu(String(n).padStart(2, '0'))) },
            { key: 'hopso', name: 'Hiệu hợp số', shortName: 'hợp số', matches: n => !PRIME_DIGITS.has(getHieu(String(n).padStart(2, '0'))) }
        ]
    },
    {
        key: 'hieu_chia3',
        group: 'sum_diff',
        description: 'Hiệu chia hết cho 3',
        labels: [
            { key: 'chia_het', name: 'Hiệu chia hết cho 3', shortName: 'chia hết 3', matches: n => getHieu(String(n).padStart(2, '0')) % 3 === 0 },
            { key: 'khong_chia_het', name: 'Hiệu không chia hết cho 3', shortName: 'k.chia hết 3', matches: n => getHieu(String(n).padStart(2, '0')) % 3 !== 0 }
        ]
    },
    {
        key: 'so_chan_le',
        group: 'number',
        description: 'Số chẵn - lẻ',
        labels: [
            { key: 'chan', name: 'Số chẵn', shortName: 'chẵn', matches: n => parseInt(n, 10) % 2 === 0 },
            { key: 'le', name: 'Số lẻ', shortName: 'lẻ', matches: n => parseInt(n, 10) % 2 !== 0 }
        ]
    },
    {
        key: 'so_nho_to',
        group: 'number',
        description: 'Số nhỏ - to',
        labels: [
            { key: 'nho', name: 'Số nhỏ', shortName: 'nhỏ', matches: n => parseInt(n, 10) < 50 },
            { key: 'to', name: 'Số to', shortName: 'to', matches: n => parseInt(n, 10) >= 50 }
        ]
    },
    {
        key: 'so_nguyento_hopso',
        group: 'number',
        description: 'Số nguyên tố - hợp số',
        labels: [
            { key: 'nguyento', name: 'Số nguyên tố', shortName: 'nguyên tố', matches: n => PRIME_NUMBERS_UNDER_100.has(parseInt(n, 10)) },
            { key: 'hopso', name: 'Số hợp số', shortName: 'hợp số', matches: n => !PRIME_NUMBERS_UNDER_100.has(parseInt(n, 10)) }
        ]
    },
    {
        key: 'so_chia3',
        group: 'number',
        description: 'Số chia hết cho 3',
        labels: [
            { key: 'chia_het', name: 'Số chia hết cho 3', shortName: 'chia hết 3', matches: n => parseInt(n, 10) % 3 === 0 },
            { key: 'khong_chia_het', name: 'Số không chia hết cho 3', shortName: 'k.chia hết 3', matches: n => parseInt(n, 10) % 3 !== 0 }
        ]
    },
    {
        key: 'dau_dit_cung_khac_chan_le',
        group: 'number',
        description: 'Đầu đít cùng/khác tính chẵn lẻ',
        labels: [
            { key: 'cung', name: 'Đầu đít cùng chẵn lẻ', shortName: 'cùng chẵn lẻ', matches: n => digitAt(n, 0) % 2 === digitAt(n, 1) % 2 },
            { key: 'khac', name: 'Đầu đít khác chẵn lẻ', shortName: 'khác chẵn lẻ', matches: n => digitAt(n, 0) % 2 !== digitAt(n, 1) % 2 }
        ]
    },
    {
        key: 'dau_dit_cung_khac_nho_to',
        group: 'number',
        description: 'Đầu đít cùng/khác tính nhỏ to',
        labels: [
            { key: 'cung', name: 'Đầu đít cùng nhỏ to', shortName: 'cùng nhỏ to', matches: n => (digitAt(n, 0) < 5) === (digitAt(n, 1) < 5) },
            { key: 'khac', name: 'Đầu đít khác nhỏ to', shortName: 'khác nhỏ to', matches: n => (digitAt(n, 0) < 5) !== (digitAt(n, 1) < 5) }
        ]
    },
    ...QUADRANT_PAIR_CONFIGS
];

const CONFIG_BY_KEY = new Map(SO_LE_THEO_CAP_CONFIGS.map(config => [config.key, config]));

function getSoLeTheoCapConfigs(group) {
    return group
        ? SO_LE_THEO_CAP_CONFIGS.filter(config => config.group === group)
        : [...SO_LE_THEO_CAP_CONFIGS];
}

function getSoLeTheoCapConfig(category) {
    return CONFIG_BY_KEY.get(category) || null;
}

function isSoLeTheoCapCategory(category) {
    return CONFIG_BY_KEY.has(category);
}

function getSoLeTheoCapLabel(numberStr, category) {
    const config = getSoLeTheoCapConfig(category);
    if (!config) return null;
    const normalized = String(numberStr).padStart(2, '0');
    const label = config.labels.find(item => item.matches(normalized));
    return label ? label.key : null;
}

function getSoLeTheoCapLabelInfo(category, labelKey) {
    const config = getSoLeTheoCapConfig(category);
    if (!config) return null;
    return config.labels.find(label => label.key === labelKey) || null;
}

function getSoLeTheoCapNumbers(category, labelKey) {
    const label = getSoLeTheoCapLabelInfo(category, labelKey);
    if (!label) return [];
    return ALL_NUMBERS
        .filter(numberStr => label.matches(numberStr))
        .map(numberStr => parseInt(numberStr, 10));
}

function getSoLeTheoCapNextLabel(current, category) {
    const values = current && Array.isArray(current.values) ? current.values : [];
    // Values are the source of truth. Cached patternLabels may come from an older
    // generator and must never override the labels derived from actual results.
    const labels = values.length > 0
        ? values.map(value => getSoLeTheoCapLabel(value, category))
        : (Array.isArray(current && current.patternLabels) ? current.patternLabels : []);

    if (labels.length < 2 || labels.some(label => !label)) return null;
    const first = labels[0];
    const second = labels[1];
    if (first === second) return null;

    for (let i = 0; i < labels.length; i++) {
        const expected = i % 2 === 0 ? first : second;
        if (labels[i] !== expected) return null;
    }

    // ABAB invariant: the next day always repeats the label from two days ago.
    return labels[labels.length - 2];
}

function predictSoLeTheoCapNumbers(current, category) {
    const nextLabel = getSoLeTheoCapNextLabel(current, category);
    return nextLabel ? getSoLeTheoCapNumbers(category, nextLabel) : [];
}

function formatSoLeTheoCapPairValue(category, labels) {
    if (!Array.isArray(labels) || labels.length < 2) return '';
    const first = getSoLeTheoCapLabelInfo(category, labels[0]);
    const second = getSoLeTheoCapLabelInfo(category, labels[1]);
    if (!first || !second || first.key === second.key) return '';
    return `${first.name} - ${second.shortName}`;
}

module.exports = {
    SO_LE_THEO_CAP_MIN_LENGTH,
    getSoLeTheoCapConfigs,
    getSoLeTheoCapConfig,
    isSoLeTheoCapCategory,
    getSoLeTheoCapLabel,
    getSoLeTheoCapLabelInfo,
    getSoLeTheoCapNumbers,
    getSoLeTheoCapNextLabel,
    predictSoLeTheoCapNumbers,
    formatSoLeTheoCapPairValue
};
