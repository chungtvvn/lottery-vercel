const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
    getSoLeTheoCapConfigs,
    isSoLeTheoCapCategory
} = require('./soLeTheoCapPairs');

let cachedOptions = null;
let cachedBySignature = new Map();
let cachedOptionIndex = null;

function parseStatsKey(key = '') {
    const normalized = String(key || '');
    if (normalized.includes(':')) {
        const [category, subcategory] = normalized.split(':');
        return { category, subcategory };
    }
    return { category: normalized, subcategory: '' };
}

function loadStatsOptions() {
    if (cachedOptions) return cachedOptions;

    const configPath = path.join(process.cwd(), 'public', 'js', 'stats-config.js');
    const source = fs.readFileSync(configPath, 'utf8');
    const context = { console };
    vm.createContext(context);
    vm.runInContext(`${source}\n;globalThis.__STATS_OPTIONS = STATS_OPTIONS; globalThis.__ORDERED_STATS_KEYS = ORDERED_STATS_KEYS;`, context);

    const labelsByKey = new Map();
    for (const groupName of Object.keys(context.__STATS_OPTIONS || {})) {
        for (const option of context.__STATS_OPTIONS[groupName] || []) {
            const key = `${option.category}${option.subcategory ? `:${option.subcategory}` : ''}`;
            labelsByKey.set(key, {
                key,
                category: option.category,
                subcategory: option.subcategory || '',
                text: option.text || key,
                groupName
            });
        }
    }

    const orderedKeys = Array.isArray(context.__ORDERED_STATS_KEYS)
        ? context.__ORDERED_STATS_KEYS.slice()
        : [...labelsByKey.keys()];

    for (const config of getSoLeTheoCapConfigs()) {
        const key = `${config.key}:soLeTheoCap`;
        if (!labelsByKey.has(key)) {
            labelsByKey.set(key, {
                key,
                category: config.key,
                subcategory: 'soLeTheoCap',
                text: `${config.description} so le theo cặp`,
                groupName: 'Thống kê so le theo cặp'
            });
        }
        if (!orderedKeys.includes(key)) orderedKeys.push(key);
    }

    cachedOptions = {
        keys: orderedKeys,
        labelsByKey
    };
    return cachedOptions;
}

function classifyStatsKey(key) {
    const { category, subcategory } = parseStatsKey(key);
    const lowerSub = String(subcategory || '').toLowerCase();
    const lowerKey = String(key || '').toLowerCase();

    if ((lowerSub === 'soletheocap' || lowerKey.includes('soletheocap')) &&
        !isSoLeTheoCapCategory(category)) {
        return {
            status: 'invalid',
            reason: 'So le theo cặp cần đúng category có 2 nhãn khác dạng.'
        };
    }

    return {
        status: 'never-formed',
        reason: 'Pattern hợp lệ trong cấu hình nhưng chưa từng hình thành trong lịch sử hiện có.'
    };
}

function classifyNoDataKey(key) {
    return classifyStatsKey(key);
}

function isInvalidStatsKey(key) {
    return classifyStatsKey(key).status === 'invalid';
}

function signatureFromKeys(keys = []) {
    return `${keys.length}:${keys.slice(0, 20).join('|')}:${keys.slice(-20).join('|')}`;
}

function getNoDataPatternManifest(existingKeys = []) {
    const { keys, labelsByKey } = loadStatsOptions();
    const existingSet = existingKeys instanceof Set ? existingKeys : new Set(existingKeys || []);
    const signature = signatureFromKeys([...existingSet].sort());
    if (cachedBySignature.has(signature)) return cachedBySignature.get(signature);

    const missing = [];
    const invalid = [];
    const neverFormed = [];

    for (const key of keys) {
        if (existingSet.has(key)) continue;
        const parsed = parseStatsKey(key);
        const meta = labelsByKey.get(key) || { key, ...parsed, text: key, groupName: '' };
        const classification = classifyNoDataKey(key);
        const row = { ...meta, ...parsed, ...classification };
        missing.push(row);
        if (classification.status === 'invalid') invalid.push(row);
        else neverFormed.push(row);
    }

    const manifest = {
        totalOptions: keys.length,
        existingCount: existingSet.size,
        missingCount: missing.length,
        invalidCount: invalid.length,
        neverFormedCount: neverFormed.length,
        missing,
        invalid,
        neverFormed
    };
    if (cachedBySignature.size >= 5) {
        cachedBySignature.clear();
    }
    cachedBySignature.set(signature, manifest);
    return manifest;
}

function getStatsOptionCandidates(categories = []) {
    if (!cachedOptionIndex) {
        const { keys, labelsByKey } = loadStatsOptions();
        const byCategory = new Map();
        const special = [];
        for (const key of keys) {
            const parsed = parseStatsKey(key);
            const meta = labelsByKey.get(key) || { key, ...parsed, text: key, groupName: '' };
            const row = { ...meta, ...parsed, ...classifyNoDataKey(key) };
            if (!byCategory.has(parsed.category)) byCategory.set(parsed.category, []);
            byCategory.get(parsed.category).push(row);

            const lowerKey = key.toLowerCase();
            const lowerSub = String(parsed.subcategory || '').toLowerCase();
            const genericTopLevel = !key.includes(':') && (
                key.startsWith('motSo') || key.startsWith('motDau') || key.startsWith('motDit') ||
                key.startsWith('cacSo') || key.startsWith('cacDau') || key.startsWith('cacDit')
            );
            const genericAxis = parsed.category === 'cacSo' || parsed.category === 'cacDau' ||
                parsed.category === 'cacDit' || parsed.category === 'tong_tt_cac_tong' ||
                parsed.category === 'tong_moi_cac_tong' || parsed.category === 'hieu_cac_hieu';
            if (key.startsWith('pattern_seq_') || genericTopLevel || genericAxis ||
                lowerSub === 'soletheocap' || lowerKey.includes('soletheocap')) {
                special.push(row);
            }
        }
        cachedOptionIndex = { byCategory, special };
    }

    const result = new Map();
    for (const category of new Set(categories || [])) {
        for (const row of cachedOptionIndex.byCategory.get(category) || []) {
            result.set(row.key, row);
        }
    }
    for (const row of cachedOptionIndex.special) result.set(row.key, row);
    return [...result.values()];
}

module.exports = {
    parseStatsKey,
    loadStatsOptions,
    classifyStatsKey,
    classifyNoDataKey,
    isInvalidStatsKey,
    getNoDataPatternManifest,
    getStatsOptionCandidates
};
