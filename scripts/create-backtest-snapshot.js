#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
    hashCanonical,
    normalizeRawData,
    readJsonSnapshot,
    writeJsonSnapshot
} = require('../lib/utils/backtestFingerprint');

function parseArgs() {
    return new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
}

function main() {
    const args = parseArgs();
    const inputPath = path.resolve(
        args.get('input') || path.join('lib', 'data', 'xsmb-2-digits.json')
    );
    const through = args.get('through');
    if (!through || !/^\d{4}-\d{2}-\d{2}$/.test(through)) {
        throw new Error('Cần truyền --through=YYYY-MM-DD.');
    }
    const outputPath = path.resolve(
        args.get('output')
        || path.join('reports', 'snapshots', `xsmb-through-${through}.json.gz`)
    );
    const raw = normalizeRawData(readJsonSnapshot(inputPath))
        .filter(row => String(row.date || '').slice(0, 10) <= through);
    if (raw.length === 0) throw new Error('Snapshot không có dữ liệu.');
    const lastDate = String(raw[raw.length - 1].date || '').slice(0, 10);
    if (lastDate !== through) {
        throw new Error(`Ngày cuối snapshot là ${lastDate}, không phải ${through}.`);
    }

    writeJsonSnapshot(outputPath, raw);
    const manifest = {
        schemaVersion: 1,
        source: path.relative(process.cwd(), inputPath),
        snapshot: path.relative(process.cwd(), outputPath),
        rows: raw.length,
        firstDate: String(raw[0].date || '').slice(0, 10),
        lastDate,
        dataSha256: hashCanonical(raw)
    };
    const manifestPath = outputPath.replace(/\.json(?:\.gz)?$/, '.manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify({ outputPath, manifestPath, ...manifest }, null, 2));
}

main();
