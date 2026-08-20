#!/usr/bin/env node
'use strict';

/*
 * Offline research artefact.
 *
 * Every row represents one number in one prediction day.  `isActual` is the
 * only label and is populated after the draw.  The remaining fields describe
 * which strict-PIT methods would have kept or excluded that number before the
 * draw.  It deliberately contains no re-computed current statistics.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const INDEX_FILE = path.join(ROOT, 'reports', 'strict_pit_all_methods_2016_2026.json');
const OUTPUT_FILE = path.join(ROOT, 'reports', 'strict_pit_exclusion_training_ledger.jsonl');
const META_FILE = path.join(ROOT, 'reports', 'strict_pit_exclusion_training_ledger.meta.json');
const BET_COUNT = 30;

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
    const indexBytes = fs.readFileSync(INDEX_FILE);
    const index = JSON.parse(indexBytes);
    const methodIds = index.fixed?.methodIds || [];
    if (!methodIds.length) throw new Error('Thiếu fixed.methodIds trong index strict PIT.');

    const output = fs.createWriteStream(OUTPUT_FILE, { encoding: 'utf8' });
    let days = 0;
    let records = 0;
    let firstDate = null;
    let lastDate = null;
    for (const source of index.sourceReports || []) {
        const file = path.join(ROOT, 'reports', source.file);
        const report = readJson(file);
        if (report.methodologyVersion !== 'strict-prefix-point-in-time-v1'
            || report.options?.dateStep !== 1) {
            throw new Error(`${source.file} không phải nguồn strict PIT từng ngày.`);
        }
        for (const row of report.rows || []) {
            const sets = Object.fromEntries(methodIds.map(id => {
                const numbers = row.strategies?.[id];
                if (!Array.isArray(numbers) || numbers.length !== BET_COUNT) {
                    throw new Error(`${row.date}/${id} không có đúng ${BET_COUNT} số.`);
                }
                return [id, new Set(numbers.map(Number))];
            }));
            const actual = Number(row.actual);
            if (!Number.isInteger(actual) || actual < 0 || actual > 99) {
                throw new Error(`${row.date} có kết quả thực tế không hợp lệ.`);
            }
            for (let number = 0; number < 100; number++) {
                const keptBy = methodIds.filter(id => sets[id].has(number));
                const excludedBy = methodIds.filter(id => !sets[id].has(number));
                output.write(`${JSON.stringify({
                    date: row.date,
                    year: Number(row.date.slice(0, 4)),
                    number,
                    isActual: number === actual ? 1 : 0,
                    keptBy,
                    excludedBy,
                    keptCount: keptBy.length,
                    excludedCount: excludedBy.length
                })}\n`);
                records++;
            }
            days++;
            firstDate ||= row.date;
            lastDate = row.date;
        }
    }
    output.end();
    const metadata = {
        generatedAt: new Date().toISOString(),
        methodology: 'strict-prefix-point-in-time-v1',
        meaning: 'Dàn của ngày D đã được sinh trước kết quả D. isActual chỉ dùng làm nhãn sau khi D đã settle.',
        sourceIndex: path.relative(ROOT, INDEX_FILE),
        sourceSha256: crypto.createHash('sha256').update(indexBytes).digest('hex'),
        methodIds,
        betCount: BET_COUNT,
        days,
        records,
        dateRange: [firstDate, lastDate]
    };
    fs.writeFileSync(META_FILE, `${JSON.stringify(metadata, null, 2)}\n`);
    console.log(JSON.stringify({ output: OUTPUT_FILE, metadata: META_FILE, ...metadata }, null, 2));
}

main();
