#!/usr/bin/env node
// Research helper: joins non-overlapping, independently generated strict-PIT
// daily snapshots. It never recalculates candidates or outcomes.
const fs = require('fs');
const path = require('path');

const [leftPath, rightPath, outputPath] = process.argv.slice(2);
if (!leftPath || !rightPath || !outputPath) {
    throw new Error('Dùng: node scripts/merge-strict-pit-reports.js <left.json> <right.json> <output.json>');
}

const left = JSON.parse(fs.readFileSync(leftPath, 'utf8'));
const right = JSON.parse(fs.readFileSync(rightPath, 'utf8'));
const byDate = new Map();
for (const row of [...(left.rows || []), ...(right.rows || [])]) {
    if (!row?.date) continue;
    if (byDate.has(row.date)) throw new Error(`Trùng snapshot strict PIT ngày ${row.date}`);
    byDate.set(row.date, row);
}
const rows = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
const output = {
    ...left,
    generatedAt: new Date().toISOString(),
    mergedFrom: [path.resolve(leftPath), path.resolve(rightPath)],
    range: {
        start: rows[0]?.date || null,
        end: rows.at(-1)?.date || null,
        days: rows.length
    },
    rows
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output)}\n`);
console.log(JSON.stringify({ outputPath: path.resolve(outputPath), range: output.range }));
