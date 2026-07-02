#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const annualMilestoneService = require('../lib/services/annualMilestoneService');

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        dates: String(args.get('dates') || '').split(',').map(value => value.trim()).filter(Boolean),
        trustedPath: path.resolve(
            args.get('trusted') ||
            path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_milestone20y_live_predictions.json')
        ),
        outputPath: path.resolve(
            args.get('output') ||
            path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_milestone20y_live_predictions.json')
        )
    };
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function repairSnapshots(remotePayload, trustedPayload, dates, restoredAt = new Date().toISOString()) {
    const trustedByDate = new Map(
        (trustedPayload.predictions || []).map(row => [row.predictionIsoDate, row])
    );
    const repaired = clone(remotePayload);
    const repairedDates = [];

    repaired.predictions = (repaired.predictions || []).map(remoteRow => {
        if (!dates.includes(remoteRow.predictionIsoDate)) return remoteRow;
        const trustedRow = trustedByDate.get(remoteRow.predictionIsoDate);
        if (!trustedRow) {
            throw new Error(`Không tìm thấy snapshot tin cậy cho ${remoteRow.predictionIsoDate}.`);
        }
        const actual = remoteRow.actualSpecial;
        const restored = {
            ...clone(trustedRow),
            status: 'pending',
            actualSpecial: null,
            results: {},
            restoredAt,
            restoredFrom: 'trusted-issued-snapshot',
            snapshotIntegrity: 'original-restored'
        };
        delete restored.backfilledAt;
        if (actual !== null && actual !== undefined) {
            annualMilestoneService.settleLiveRowOnce(
                restored,
                Number(actual),
                repaired.config || {}
            );
        }
        repairedDates.push(remoteRow.predictionIsoDate);
        return restored;
    });
    repaired.summary = annualMilestoneService.summarizeLive(repaired.predictions);
    repaired.snapshotRepair = {
        restoredAt,
        dates: repairedDates,
        source: 'trusted-issued-snapshot'
    };
    return repaired;
}

async function fetchRemotePayload() {
    const baseUrl = String(
        process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL ||
        process.env.CLOUDFLARE_R2_PUBLIC_URL ||
        ''
    ).replace(/\/$/, '');
    if (!baseUrl) throw new Error('Thiếu CLOUDFLARE_R2_PUBLIC_URL.');
    const response = await fetch(
        `${baseUrl}/statistics/cached_milestone20y_live_predictions.json.gz?ts=${Date.now()}`
    );
    if (!response.ok) throw new Error(`Không tải được cache R2: HTTP ${response.status}.`);
    return JSON.parse(zlib.gunzipSync(Buffer.from(await response.arrayBuffer())));
}

async function main() {
    const options = parseArgs();
    if (!options.dates.length) throw new Error('Phải truyền --dates=YYYY-MM-DD,...');
    if (!fs.existsSync(options.trustedPath)) {
        throw new Error(`Không tìm thấy cache tin cậy: ${options.trustedPath}`);
    }
    const trusted = JSON.parse(fs.readFileSync(options.trustedPath, 'utf8'));
    const remote = await fetchRemotePayload();
    const repaired = repairSnapshots(remote, trusted, options.dates);
    const backupDir = path.join(process.cwd(), 'outputs', 'snapshot-repair');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(
        path.join(backupDir, `r2-before-repair-${stamp}.json`),
        JSON.stringify(remote, null, 2)
    );
    fs.writeFileSync(options.outputPath, JSON.stringify(repaired));
    console.log('[SnapshotRepair] Đã khôi phục:', repaired.snapshotRepair);
    for (const date of options.dates) {
        const row = repaired.predictions.find(item => item.predictionIsoDate === date);
        console.log(date, {
            actual: row?.actualSpecial,
            chainBlockHit: row?.results?.['chainBlockFirst:hold70']?.hit,
            chainBlockBetNumbers: row?.strategies?.chainBlockFirst?.holds?.['70']?.betNumbers
        });
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    repairSnapshots
};
