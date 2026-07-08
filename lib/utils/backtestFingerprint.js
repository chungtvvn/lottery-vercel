const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function canonicalize(value) {
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .filter(key => value[key] !== undefined)
                .map(key => [key, canonicalize(value[key])])
        );
    }
    if (Number.isNaN(value)) return null;
    return value;
}

function stableStringify(value) {
    return JSON.stringify(canonicalize(value));
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function hashCanonical(value) {
    return sha256(stableStringify(value));
}

function hashSourceFiles(filePaths = []) {
    const rows = filePaths
        .map(filePath => path.resolve(filePath))
        .sort()
        .map(filePath => ({
            file: path.relative(process.cwd(), filePath),
            sha256: sha256(fs.readFileSync(filePath))
        }));
    return {
        sha256: hashCanonical(rows),
        files: rows
    };
}

function normalizeRawData(rawData = []) {
    return rawData
        .map(row => Object.fromEntries(
            Object.entries(row || {})
                .filter(([key, value]) => !key.startsWith('_') && value !== undefined)
        ))
        .sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')));
}

function readJsonSnapshot(filePath) {
    const buffer = fs.readFileSync(filePath);
    const content = String(filePath).endsWith('.gz')
        ? zlib.gunzipSync(buffer)
        : buffer;
    return JSON.parse(content.toString('utf8'));
}

function writeJsonSnapshot(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const content = Buffer.from(JSON.stringify(value));
    fs.writeFileSync(
        filePath,
        String(filePath).endsWith('.gz') ? zlib.gzipSync(content, { level: 9 }) : content
    );
}

function buildBacktestFingerprint({
    rawData = [],
    config = {},
    baselineCutoffDate = null,
    methodologyVersion = null,
    sourceFiles = [],
    sourceLabel = null
} = {}) {
    const normalizedRaw = normalizeRawData(rawData);
    const dataSha256 = hashCanonical(normalizedRaw);
    const configSha256 = hashCanonical(config);
    const source = hashSourceFiles(sourceFiles);
    const firstDate = normalizedRaw[0]?.date || null;
    const lastDate = normalizedRaw[normalizedRaw.length - 1]?.date || null;
    const identity = {
        dataSha256,
        configSha256,
        sourceSha256: source.sha256,
        baselineCutoffDate,
        methodologyVersion
    };

    return {
        runSha256: hashCanonical(identity),
        dataSha256,
        configSha256,
        sourceSha256: source.sha256,
        sourceFiles: source.files,
        sourceLabel,
        codeRevision: process.env.GITHUB_SHA
            || process.env.VERCEL_GIT_COMMIT_SHA
            || 'working-tree',
        dataRows: normalizedRaw.length,
        firstDataDate: firstDate,
        lastDataDate: lastDate,
        baselineCutoffDate,
        methodologyVersion
    };
}

module.exports = {
    buildBacktestFingerprint,
    canonicalize,
    hashCanonical,
    hashSourceFiles,
    normalizeRawData,
    readJsonSnapshot,
    stableStringify,
    writeJsonSnapshot
};
