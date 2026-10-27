/**
 * test-r2-only.js — guard test for the R2-only cutover (owner decision 27/10/2026).
 *
 * Plain node, no new dependency. Exits 0 only when ALL assertions pass.
 *
 * (a) lib/data-access.js must contain NO local-statistics fallback read path:
 *     no loadJsonFile() call sourced from STATS_DIR/DATA_DIR, no disk read of
 *     a STATS_DIR path, and no allowLocalJsonFallback() call gating a load.
 *     (The helper may be deleted outright; what matters is that no load path
 *     can reach local disk. This test deliberately FAILS while the old
 *     fallback code is still present — do not weaken it to pass.)
 * (b) No runtime file under app/ or lib/ may read lib/data/statistics/*.json
 *     from disk as a data source (grep-based). Documented allowlist:
 *       - lib/utils/backtestFingerprint.js: fingerprint/hash utility. It reads
 *         caller-supplied paths to hash them; it does not serve data.
 *       - lib/utils/statsOptionsManifest.js: reads public/js/stats-config.js
 *         (a config file, not a statistics data file); it does not match the
 *         statistics-disk-read pattern and is listed here for completeness.
 *       - HTML view routes under app (one route.js per view): read views
 *         HTML files, not statistics JSON; they do not match the pattern.
 *     Everything else that matches is a failure, including services whose
 *     conversion is owned by another agent — the failure list IS the report.
 * (c) R2 key naming for registry/advisor must match the upload helper
 *     (scripts/upload-to-r2.js): statistics/daily_locked_bets_registry.json[.gz]
 *     and statistics/cached_daily_method_advisor.json[.gz] (gzip for all files,
 *     plain .json additionally for exactly these two).
 *
 * Usage: node scripts/test-r2-only.js
 */
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_ACCESS = path.join(ROOT_DIR, 'lib', 'data-access.js');
const UPLOAD_HELPER = path.join(ROOT_DIR, 'scripts', 'upload-to-r2.js');

const ALLOWLIST_B = new Set([
    'backtestFingerprint.js', // fingerprint/hash utility, does not serve data
    'statsOptionsManifest.js' // reads public/js/stats-config.js (config), not data
]);

const failures = [];
const passes = [];

function check(name, ok, detail) {
    if (ok) {
        passes.push(name);
        console.log(`  PASS  ${name}`);
    } else {
        failures.push(name);
        console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    }
}

function readFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (_) {
        return null;
    }
}

function listJsFiles(dir, out = []) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
        return out;
    }
    for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) listJsFiles(full, out);
        else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
    }
    return out;
}

// ---- (a) data-access.js: no local-statistics fallback read path ----
function testDataAccess() {
    console.log('(a) lib/data-access.js — no local-statistics fallback read path');
    const src = readFile(DATA_ACCESS);
    if (src === null) {
        check('data-access.js exists and is readable', false, 'file missing');
        return;
    }
    const lines = src.split('\n');
    // A1: loadJsonFile() called with a STATS_DIR/DATA_DIR-derived path.
    const loadJsonDiskCalls = lines
        .map((line, i) => ({ line, no: i + 1 }))
        .filter(({ line }) => /loadJsonFile\s*\(/.test(line) && /(STATS_DIR|DATA_DIR|dataPath)/.test(line))
        .map(({ no, line }) => `line ${no}: ${line.trim()}`);
    check('no loadJsonFile() call sourced from STATS_DIR/DATA_DIR', loadJsonDiskCalls.length === 0,
        loadJsonDiskCalls.length ? loadJsonDiskCalls.join(' | ') : null);
    // A2: any direct disk read of a STATS_DIR path (readFileSync/readFile on it).
    const statsDiskReads = lines
        .map((line, i) => ({ line, no: i + 1 }))
        .filter(({ line }) => /(readFileSync|readFile\s*\()/ .test(line) && /STATS_DIR/.test(line))
        .map(({ no, line }) => `line ${no}: ${line.trim()}`);
    check('no disk read of a STATS_DIR path', statsDiskReads.length === 0,
        statsDiskReads.length ? statsDiskReads.join(' | ') : null);
    // A3: allowLocalJsonFallback() still called on a load path (beyond its own definition).
    const fallbackCalls = lines
        .map((line, i) => ({ line, no: i + 1 }))
        .filter(({ line }) => /allowLocalJsonFallback\s*\(/.test(line) && !/function\s+allowLocalJsonFallback/.test(line))
        .map(({ no, line }) => `line ${no}: ${line.trim()}`);
    check('no allowLocalJsonFallback() call gating a load', fallbackCalls.length === 0,
        fallbackCalls.length ? fallbackCalls.join(' | ') : null);
    // A4: the shared disk reader must not be reachable as a statistics source:
    // fail if loadJsonFile is DEFINED and still referenced by any stats/raw loader.
    const loadJsonRefs = lines.filter(l => /loadJsonFile\s*\(/.test(l) && !/function\s+loadJsonFile/.test(l));
    check('loadJsonFile() not referenced by any loader', loadJsonRefs.length === 0,
        loadJsonRefs.length ? `${loadJsonRefs.length} reference(s), e.g. ${loadJsonRefs[0].trim()}` : null);
}

// ---- (b) app/ + lib/: no disk read of lib/data/statistics/*.json as a source ----
function testNoDiskStatisticsReads() {
    console.log('(b) app/ + lib/ — no disk read of lib/data/statistics/*.json as a source');
    const files = [...listJsFiles(path.join(ROOT_DIR, 'app')), ...listJsFiles(path.join(ROOT_DIR, 'lib'))];
    const diskRead = /(readFileSync|readFile\s*\(|existsSync|require\s*\(\s*['"]\.\.\/data\/statistics)/;
    // Statistics path construction, in EITHER form: a literal 'lib/data/statistics'
    // or 'data/statistics' path, OR segmented path.join/path.resolve arguments
    // ('lib', 'data', 'statistics', '<file>.json'), OR a statistics path variable
    // (STATS_DIR, statisticsDir, LOCAL_*, CACHE_FILE, REGISTRY_PATH_*), OR a
    // statistics *.json filename literal. Segmented joins are the common form
    // in this repo — matching only literal 'lib/data/statistics' strings would
    // miss most real readers (found 27/10/2026 while validating this test).
    const statsPath = /(path\.(join|resolve)\([^)]*['"]statistics['"]|data\/statistics\/|lib\/data\/statistics|statisticsDir|STATS_DIR|LOCAL_HISTORY_FILE|LOCAL_SIMULATION_FILE|LOCAL_CACHE_FILE|CACHE_FILE|REGISTRY_PATH_STATS|REGISTRY_PATH_DATA|(?:cached_[A-Za-z0-9_.-]+\.json|number_stats\.json|head_tail_stats\.json|sum_difference_stats\.json|quick_stats[A-Za-z0-9_.-]*\.json|daily_locked_bets_registry\.json|cached_milestone20y[A-Za-z0-9_.-]*\.json))/;
    const violating = [];
    for (const file of files) {
        if (ALLOWLIST_B.has(path.basename(file))) continue;
        const src = readFile(file);
        if (src === null) continue;
        // A file violates when it both performs a disk read/require AND references
        // a statistics path or statistics JSON filename. Files that only mention
        // statistics in comments without a read call do not match; HTML view
        // routes read views/*.html and do not match either.
        if (diskRead.test(src) && statsPath.test(src)) violating.push(path.relative(ROOT_DIR, file));
    }
    check('no runtime file reads lib/data/statistics/*.json from disk as a source',
        violating.length === 0,
        violating.length ? `${violating.length} file(s): ${violating.join(', ')}` : null);
    if (violating.length) {
        console.log('  (allowlist, not counted as violations: lib/utils/backtestFingerprint.js — fingerprint/hash utility, does not serve data; lib/utils/statsOptionsManifest.js — reads public/js/stats-config.js config, not data; app HTML view routes — read views/*.html, not statistics JSON.)');
    }
}

// ---- (c) R2 key naming for registry/advisor matches the upload helper ----
function testR2KeyNaming() {
    console.log('(c) R2 key naming for registry/advisor matches scripts/upload-to-r2.js');
    const src = readFile(UPLOAD_HELPER);
    if (src === null) {
        check('upload helper exists and is readable', false, 'file missing');
        return;
    }
    // Gzip upload for every stats file: `${STATS_PREFIX}/${file}.gz` pattern.
    check('upload helper gzips stats files to ${STATS_PREFIX}/${file}.gz',
        /\$\{STATS_PREFIX\}\/\$\{file\}\.gz/.test(src));
    // Plain .json additionally for exactly the registry and the advisor cache.
    const plainBlock = /daily_locked_bets_registry\.json['"]\s*\|\|\s*file\s*===?\s*['"]cached_daily_method_advisor\.json['"]/.test(src)
        || /file\s*===?\s*['"]daily_locked_bets_registry\.json['"]/.test(src)
        && /file\s*===?\s*['"]cached_daily_method_advisor\.json['"]/.test(src);
    check('upload helper also puts plain statistics/daily_locked_bets_registry.json and statistics/cached_daily_method_advisor.json',
        plainBlock && /ContentType:\s*['"]application\/json['"]/.test(src));
    // The key prefix for those two files is the statistics prefix, not data/.
    check('registry/advisor keys live under the statistics prefix (not data/)',
        !/DATA_PREFIX.*daily_locked_bets_registry/.test(src) && !/DATA_PREFIX.*cached_daily_method_advisor/.test(src));
}

function main() {
    console.log('[test-r2-only] Guard test for the R2-only cutover.');
    testDataAccess();
    testNoDiskStatisticsReads();
    testR2KeyNaming();
    console.log(`[test-r2-only] ${passes.length} passed, ${failures.length} failed.`);
    if (failures.length) {
        console.log('[test-r2-only] RESULT: FAIL — local-disk data paths remain. See the FAIL lines above; do not weaken this test to pass.');
        process.exit(1);
    }
    console.log('[test-r2-only] RESULT: PASS');
}

if (require.main === module) main();
module.exports = { main };
