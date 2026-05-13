const { getTongTT, getTongMoi, getHieu } = require('./numberAnalysis');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));

const digitAt = (numberStr, index) => parseInt(String(numberStr).padStart(2, '0')[index], 10);

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
    }
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
    const labels = Array.isArray(current && current.patternLabels) && current.patternLabels.length >= values.length
        ? current.patternLabels
        : values.map(value => getSoLeTheoCapLabel(value, category));

    if (labels.length < 2 || labels.some(label => !label)) return null;
    const first = labels[0];
    const second = labels[1];
    if (first === second) return null;

    for (let i = 0; i < labels.length; i++) {
        const expected = i % 2 === 0 ? first : second;
        if (labels[i] !== expected) return null;
    }

    return labels.length % 2 === 0 ? first : second;
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
