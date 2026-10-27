/**
 * migrate-local-to-r2.js — one-way local → R2 migration for the R2-only cutover.
 *
 * Reads dispositions from scripts/r2-only-migration-manifest.md (§5 table) and:
 *   - DRY-RUN (default, no flags): prints exactly what WOULD happen and uploads
 *     NOTHING. For MERGE-PER-DATE files it prints per-date winners, never a
 *     whole-file overwrite.
 *   - --apply: performs the migration. Requires R2 credentials (see below).
 *     NEVER run --apply from a VM without credentials, and never run it until
 *     the live R2 object for each MERGE-PER-DATE file has been re-read and
 *     diffed — the manifest snapshot is from 27/10/2026 and R2 moves daily.
 *
 * Plain node, no new dependency. The --apply path lazily requires
 * @aws-sdk/client-s3 (already a repo dependency, same gzip+PutObject
 * pattern as scripts/upload-to-r2.js) so dry-run works anywhere.
 *
 * Usage:
 *   node scripts/migrate-local-to-r2.js            # dry-run (default)
 *   node scripts/migrate-local-to-r2.js --dry-run  # explicit dry-run
 *   node scripts/migrate-local-to-r2.js --apply    # REAL migration (gated)
 *   node scripts/migrate-local-to-r2.js --help     # usage
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT_DIR = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(__dirname, 'r2-only-migration-manifest.md');

const PLAIN_JSON_KEYS = new Set([
    'statistics/daily_locked_bets_registry.json',
    'statistics/cached_daily_method_advisor.json',
    'statistics/cached_de_dropoff_merge_shadow.json',
    'statistics/cached_lo_dropoff_27_shadow.json',
    'data/xsmb-2-digits.json'
]);

function printHelp() {
    console.log([
        'Usage: node scripts/migrate-local-to-r2.js [--dry-run | --apply | --help]',
        '',
        '  (no flag)  Dry-run: print what would be uploaded/merged, upload nothing.',
        '  --dry-run  Same as default.',
        '  --apply    Perform the migration. Requires ALL of:',
        '               CLOUDFLARE_R2_ENDPOINT, CLOUDFLARE_R2_BUCKET,',
        '               CLOUDFLARE_R2_ACCESS_KEY_ID (or ACCESS_KEY_ID),',
        '               CLOUDFLARE_R2_SECRET_ACCESS_KEY (or SECRET_ACCESS_KEY).',
        '             Refuses with a clear error if any is missing.',
        '             MERGE-PER-DATE files are merged per date against the LIVE R2',
        '             object — never whole-file overwritten.',
        '  --help     Show this help.',
        '',
        'Dispositions are read from scripts/r2-only-migration-manifest.md (§5).'
    ].join('\n'));
}

// Parse only the §5 machine-readable table of the manifest.
function readDispositions() {
    const text = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const lines = text.split('\n');
    const start = lines.findIndex(l => l.startsWith('## 5. Machine-readable'));
    if (start === -1) throw new Error(`Manifest §5 table not found in ${MANIFEST_PATH}`);
    const rows = [];
    for (const line of lines.slice(start + 1)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('|')) {
            if (rows.length > 0) break; // end of table
            continue;
        }
        const cells = trimmed.split('|').map(c => c.trim()).filter(Boolean);
        if (cells.length < 5) continue;
        if (/^local file$/i.test(cells[0]) || /^[-:]+$/.test(cells[0])) continue;
        rows.push({
            localFile: cells[0],
            disposition: cells[1],
            r2Key: cells[2],
            manifestBytes: Number(cells[3]) || null,
            scope: cells.slice(4).join(' | ')
        });
    }
    if (rows.length === 0) throw new Error('Manifest §5 table parsed to zero rows; refusing to proceed.');
    return rows;
}

function localBytes(row) {
    const full = path.join(ROOT_DIR, row.localFile);
    try {
        return fs.statSync(full).size;
    } catch (_) {
        return row.manifestBytes;
    }
}

function readLocalJson(row) {
    const full = path.join(ROOT_DIR, row.localFile);
    try {
        return JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (error) {
        console.warn(`  [warn] Could not parse local JSON for ${row.localFile}: ${error.message}`);
        return null;
    }
}

function dateOf(run) {
    return String(run?.predictionDate || run?.date || '').slice(0, 10);
}

// Dry-run detail for MERGE-PER-DATE files, computed from LOCAL data + manifest scope.
function printMergeDetail(row) {
    const base = path.basename(row.localFile);
    if (base === 'daily_locked_bets_registry.json') {
        const reg = readLocalJson(row);
        const dates = reg?.dates || {};
        const localWins = ['2026-10-12', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20'];
        console.log('  MERGE-PER-DATE (registry): per-date winners — never a whole-file overwrite.');
        for (const d of localWins) {
            const entry = dates[d];
            const chp = entry?.settlement?.crossHedgingPortfolio?.totalProfitK;
            console.log(`    LOCAL WINS  ${d}  settled=${entry?.isSettled}  CHP totalProfitK=${chp} (local restated capital 77000K)`);
        }
        console.log('    R2 WINS     2026-10-26  settled on R2, unsettled locally — keep R2 row as-is');
        console.log('    R2 WINS     2026-10-27  pending, R2-only — keep R2 row as-is');
        // Local has 41 dates: 7 local-win + 2026-10-26 (R2-wins, listed above) + 33 identical.
        console.log(`    NO-OP       other ${Object.keys(dates).length - localWins.length - 1} local dates (identical to R2 per 27/10 comparison)`);
        console.log('  APPLY RULE: fetch live R2 registry, replace ONLY the 7 local-win dates, keep every other R2 date, then PutObject merged registry (gzip + plain .json).');
    } else if (base === 'cached_prediction_history.json') {
        const data = readLocalJson(row);
        const runs = Array.isArray(data) ? data : (data?.history || data?.records || []);
        const sorted = runs.map(dateOf).filter(Boolean).sort();
        const localOnly = sorted.filter(d => d < '2026-07-28');
        const latest = sorted[sorted.length - 1];
        console.log('  MERGE-PER-DATE (prediction history): per-date winners — never a whole-file overwrite.');
        console.log(`    LOCAL RUNS  ${runs.length} total locally, range ${sorted[0] || '?'} → ${latest || '?'}`);
        console.log(`    LOCAL WINS  ${localOnly.length} runs with predictionDate < 2026-07-28 (${localOnly[0] || '?'} → ${localOnly[localOnly.length - 1] || '?'}) — these are absent from R2`);
        console.log('    R2 WINS     all runs after 2026-10-21 through 2026-10-27 (R2-only tail) + any R2-only run inside the overlap');
        console.log('  APPLY RULE: union by predictionDate against the LIVE R2 object; local entry wins ONLY where R2 has no entry for that date; then PutObject merged history (.json.gz).');
    } else if (base === 'cached_de_dropoff_merge_shadow.json') {
        const data = readLocalJson(row);
        console.log('  MERGE-PER-DATE (de-dropoff shadow): NEEDS-REVIEW — do NOT whole-file upload.');
        console.log(`    LOCAL: generatedAt=${data?.generatedAt || '?'} latestDataDate=${data?.latestDataDate || '?'} settledLedger=${Array.isArray(data?.settledLedger) ? data.settledLedger.length : '?'} entries`);
        console.log('    R2:    generatedAt=2026-10-09 latestDataDate=2026-10-08 settledLedger=24, PLUS all2026Ledger=278 entries (scope local lacks)');
        console.log('  APPLY RULE: merge settledLedger entries by date (local wins for its dates), preserve ALL R2-only entries incl. all2026Ledger, owner-verifies merged file before PutObject.');
    } else {
        console.log(`  MERGE-PER-DATE: scope from manifest — ${row.scope}`);
    }
}

function dryRun(rows) {
    const counts = {};
    let uploadBytes = 0;
    let uploadCount = 0;
    console.log('[migrate-local-to-r2] DRY-RUN — uploading NOTHING. Dispositions from r2-only-migration-manifest.md §5.');
    console.log(`[migrate-local-to-r2] ${rows.length} manifest rows.`);
    for (const row of rows) {
        counts[row.disposition] = (counts[row.disposition] || 0) + 1;
        const bytes = localBytes(row);
        if (row.disposition === 'UPLOAD-TO-R2') {
            uploadCount++;
            if (typeof bytes === 'number') uploadBytes += bytes;
            console.log(`  UPLOAD  ${row.localFile} (${bytes} bytes) -> ${row.r2Key}`);
        } else if (row.disposition === 'MERGE-PER-DATE') {
            console.log(`  MERGE   ${row.localFile} (${bytes} bytes) -> ${row.r2Key}`);
            printMergeDetail(row);
        } else {
            console.log(`  ${row.disposition}  ${row.localFile} -> ${row.r2Key}  [${row.scope}]`);
        }
    }
    console.log('[migrate-local-to-r2] Summary (dry-run, nothing uploaded):');
    for (const [disposition, count] of Object.entries(counts)) {
        console.log(`    ${disposition}: ${count}`);
    }
    console.log(`    UPLOAD-TO-R2 bytes total (local sizes): ${uploadBytes} across ${uploadCount} files`);
    console.log('[migrate-local-to-r2] To perform the real migration, run with --apply on a machine with R2 credentials. It was NOT run here.');
}

function requireR2Config() {
    const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
    const bucket = process.env.CLOUDFLARE_R2_BUCKET;
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.ACCESS_KEY_ID;
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || process.env.SECRET_ACCESS_KEY;
    const missing = [];
    if (!endpoint) missing.push('CLOUDFLARE_R2_ENDPOINT');
    if (!bucket) missing.push('CLOUDFLARE_R2_BUCKET');
    if (!accessKeyId) missing.push('CLOUDFLARE_R2_ACCESS_KEY_ID (or ACCESS_KEY_ID)');
    if (!secretAccessKey) missing.push('CLOUDFLARE_R2_SECRET_ACCESS_KEY (or SECRET_ACCESS_KEY)');
    if (missing.length) {
        throw new Error(`Refusing --apply: missing R2 credentials: ${missing.join(', ')}. Set them in the environment and retry; dry-run needs no credentials.`);
    }
    return { endpoint, bucket, accessKeyId, secretAccessKey };
}

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
}

// --apply only. Mirrors the gzip+PutObject pattern of scripts/upload-to-r2.js.
async function applyMigration(rows) {
    const config = requireR2Config();
    const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
    const s3 = new S3Client({ endpoint: config.endpoint, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, region: 'auto' });

    async function fetchR2Json(key) {
        const tried = [key, `${key}.gz`];
        // Registry/advisor are plain .json on R2; everything else is .json.gz.
        const order = key.endsWith('.json') && !key.endsWith('.json.gz') ? tried : [`${key}.gz`, key];
        for (const k of order) {
            try {
                const result = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: k }));
                const buf = await streamToBuffer(result.Body);
                const text = k.endsWith('.gz') ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
                return JSON.parse(text);
            } catch (error) {
                if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) continue;
                throw error;
            }
        }
        return null;
    }

    async function putJson(key, jsonText) {
        const gzipBody = zlib.gzipSync(Buffer.from(jsonText, 'utf8'));
        await s3.send(new PutObjectCommand({ Bucket: config.bucket, Key: `${key}.gz`, Body: gzipBody, ContentType: 'application/gzip', CacheControl: 'public, max-age=60, s-maxage=300' }));
        console.log(`[apply] Put ${key}.gz`);
        if (PLAIN_JSON_KEYS.has(key)) {
            await s3.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: jsonText, ContentType: 'application/json', CacheControl: 'public, max-age=60, s-maxage=300' }));
            console.log(`[apply] Put ${key} (plain)`);
        }
    }

    function mergeRegistry(local, remote) {
        const merged = JSON.parse(JSON.stringify(remote || { version: '1.0.0', dates: {} }));
        merged.dates = merged.dates || {};
        const localWins = ['2026-10-12', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20'];
        for (const d of localWins) {
            if (local?.dates?.[d]) merged.dates[d] = local.dates[d];
        }
        merged.updatedAt = new Date().toISOString();
        return merged;
    }

    function mergePredictionHistory(local, remote) {
        const toRuns = data => (Array.isArray(data) ? data : (data?.history || data?.records || []));
        const byDate = new Map();
        for (const run of toRuns(remote)) byDate.set(dateOf(run), run);
        for (const run of toRuns(local)) {
            if (!byDate.has(dateOf(run))) byDate.set(dateOf(run), run); // local wins ONLY where R2 lacks the date
        }
        return [...byDate.values()].sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
    }

    function mergeDropoffShadow(local, remote) {
        const merged = JSON.parse(JSON.stringify(remote || {}));
        const byDate = new Map();
        for (const row of (merged.settledLedger || [])) byDate.set(String(row?.date || row?.predictionDate || ''), row);
        for (const row of (local?.settledLedger || [])) byDate.set(String(row?.date || row?.predictionDate || ''), row);
        merged.settledLedger = [...byDate.values()];
        // R2-only scopes (e.g. all2026Ledger) are preserved because merged starts from remote.
        return merged;
    }

    for (const row of rows) {
        if (row.disposition === 'DISCARD') {
            console.log(`[apply] SKIP (DISCARD) ${row.localFile}`);
            continue;
        }
        const localPath = path.join(ROOT_DIR, row.localFile);
        if (row.disposition === 'UPLOAD-TO-R2') {
            const content = fs.readFileSync(localPath, 'utf8');
            JSON.parse(content); // validate before upload
            await putJson(row.r2Key.replace(/\.gz$/, ''), content);
            continue;
        }
        if (row.disposition === 'MERGE-PER-DATE') {
            const local = readLocalJson(row);
            const baseKey = row.r2Key.replace(/\.gz$/, '');
            const remote = await fetchR2Json(baseKey);
            if (!remote) throw new Error(`MERGE-PER-DATE ${row.localFile}: live R2 object ${baseKey} not found; refusing to create it from local alone.`);
            const base = path.basename(row.localFile);
            let merged;
            if (base === 'daily_locked_bets_registry.json') merged = mergeRegistry(local, remote);
            else if (base === 'cached_prediction_history.json') merged = mergePredictionHistory(local, remote);
            else if (base === 'cached_de_dropoff_merge_shadow.json') merged = mergeDropoffShadow(local, remote);
            else throw new Error(`No merge rule for ${row.localFile}; refusing whole-file overwrite.`);
            await putJson(baseKey, JSON.stringify(merged, null, 2));
            continue;
        }
        throw new Error(`Unknown disposition "${row.disposition}" for ${row.localFile}; refusing to proceed.`);
    }
    console.log('[apply] Migration complete.');
}

async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) {
        printHelp();
        return;
    }
    const apply = args.includes('--apply');
    if (args.some(a => !['--dry-run', '--apply'].includes(a))) {
        console.error('Unknown argument. See --help.');
        process.exit(2);
    }
    const rows = readDispositions();
    if (!apply) {
        dryRun(rows);
        return;
    }
    await applyMigration(rows);
}

if (require.main === module) {
    main().catch(error => {
        console.error(`[migrate-local-to-r2] ERROR: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { readDispositions, dryRun };
