#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { buildDailyRecordEvents, summarizeRows } = require('./analyze-daily-super-records');

const raw = Array.from({ length: 8 }, (_, index) => ({
    _iso: `2026-01-${String(index + 1).padStart(2, '0')}`
}));
const stats = {
    numberStats: {
        sample: {
            streaks: [
                { startDate: '02/01/2026', endDate: '03/01/2026', length: 2 },
                { startDate: '04/01/2026', endDate: '06/01/2026', length: 3 }
            ]
        }
    },
    headTailStats: {},
    sumDiffStats: {}
};

const { daily, diagnostics } = buildDailyRecordEvents(raw, stats);
assert.strictEqual(diagnostics.keysWithStreaks, 1);
assert.strictEqual(daily[2].initializedRecord, 1, 'Lần hình thành đầu tiên chỉ khởi tạo kỷ lục');
assert.strictEqual(daily[4].touchedExistingRecord, 1, 'Run sau chạm lại độ dài 2 ở đúng ngày');
assert.strictEqual(daily[4].brokeRecord, 0);
assert.strictEqual(daily[5].brokeRecord, 1, 'Ngày kế tiếp vượt 2 lên 3 và phá kỷ lục');
assert.strictEqual(daily[5].reachedRecord, 1, 'Ngày phá cũng là ngày đạt mức tối đa mới');
assert.strictEqual(daily[4].recordBreakExposure, 1);
assert.strictEqual(daily[4].recordBrokenNextDay, 1, 'Chạm mốc ngày 5 và phá ở kỳ kế tiếp');
assert.strictEqual(daily[5].recordBreakExposure, 1);
assert.strictEqual(daily[5].recordBrokenNextDay, 0);
assert.strictEqual(daily[0].notYetFormedAtStart, 1);
assert.strictEqual(daily[2].notYetFormedAtStart, 1);
assert.strictEqual(daily[3].notYetFormedAtStart, 0);

const summary = summarizeRows(daily);
assert.strictEqual(summary.reachedRecord.total, 2);
assert.strictEqual(summary.touchedExistingRecord.total, 1);
assert.strictEqual(summary.brokeRecord.total, 1);
assert.strictEqual(summary.initializedRecord.total, 1);

console.log('Daily super-record tests passed.');
