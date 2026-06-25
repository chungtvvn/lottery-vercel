const BO_GROUP_DEFINITIONS = [
    { id: '01', tokens: ['010', '060', '565', '515'] },
    { id: '02', tokens: ['020', '070', '252', '575'] },
    { id: '03', tokens: ['030', '080', '353', '585'] },
    { id: '04', tokens: ['040', '090', '545', '595'] },
    { id: '05', tokens: ['00', '55', '050'] },
    { id: '11', tokens: ['11', '66', '161'] },
    { id: '12', tokens: ['121', '171', '262', '676'] },
    { id: '13', tokens: ['131', '181', '363', '686'] },
    { id: '22', tokens: ['22', '77', '272'] },
    { id: '23', tokens: ['232', '282', '373', '787'] },
    { id: '24', tokens: ['242', '292', '474', '797'] },
    { id: '33', tokens: ['33', '88', '383'] },
    { id: '34', tokens: ['343', '393', '848', '898'] },
    { id: '41', tokens: ['141', '191', '464', '696'] },
    { id: '44', tokens: ['44', '99', '494'] }
];

function expandBoToken(token) {
    const normalized = String(token).trim();
    if (/^\d{2}$/.test(normalized)) return [normalized];
    if (/^\d{3}$/.test(normalized)) {
        return [
            normalized.slice(0, 2),
            normalized.slice(1, 3)
        ];
    }
    return [];
}

function uniqueNumbers(values) {
    return [...new Set(values)].sort((a, b) => Number(a) - Number(b));
}

const BO_GROUPS = BO_GROUP_DEFINITIONS.map(group => ({
    ...group,
    key: `bo_${group.id}`,
    setKey: `BO_${group.id}`,
    label: `Bộ ${group.id}`,
    tokenLabel: group.tokens.join(' - '),
    displayLabel: `Bộ ${group.id}: ${group.tokens.join(' - ')}`,
    numbers: uniqueNumbers(group.tokens.flatMap(expandBoToken))
}));

const BO_GROUPS_BY_KEY = new Map(BO_GROUPS.map(group => [group.key, group]));
const BO_GROUPS_BY_SET_KEY = new Map(BO_GROUPS.map(group => [group.setKey, group]));

function getBoGroupByKey(key) {
    const normalized = String(key || '').toLowerCase();
    return BO_GROUPS_BY_KEY.get(normalized) ||
        BO_GROUPS_BY_SET_KEY.get(String(key || '').toUpperCase()) ||
        null;
}

module.exports = {
    BO_GROUP_DEFINITIONS,
    BO_GROUPS,
    getBoGroupByKey,
    expandBoToken
};
