#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const { scoringForms } = require('../lib/utils/lotteryScoring');
const probabilityScore = require('../lib/services/probabilityScoreService');
const {
    buildGroupCatalog,
    normalizeRows,
    runStrictWalkForward
} = require('../lib/services/probabilityScoreModel');

function main() {
    assert.deepStrictEqual(
        probabilityScore.readRawRows([{ date: '2026-08-19', special: null }]),
        [],
        'Giá trị kết quả rỗng không được hiểu nhầm thành số 00.'
    );
    assert.deepStrictEqual(
        normalizeRows([{ date: '2026-08-19', special: null }]),
        [],
        'Lớp mô hình thuần cũng không được hiểu nhầm kết quả rỗng thành số 00.'
    );
    const raw = JSON.parse(fs.readFileSync('lib/data/xsmb-2-digits.json', 'utf8'));
    const rows = probabilityScore.readRawRows(raw);
    const targetIndex = Math.max(600, Math.floor(rows.length * 0.55));
    const targetDate = rows[targetIndex].date;
    const prefix = rows.slice(0, targetIndex);

    const issued = probabilityScore.buildScoreSnapshot({
        rawRows: prefix,
        predictionDate: targetDate,
        history: []
    });
    const withFuture = probabilityScore.buildScoreSnapshot({
        rawRows: rows,
        predictionDate: targetDate,
        history: []
    });

    assert.deepStrictEqual(
        issued.topNumbers.map(row => row.number),
        withFuture.topNumbers.map(row => row.number),
        'Snapshot thay đổi khi chỉ thêm kết quả tương lai.'
    );
    assert.strictEqual(issued.sourceDataThrough, prefix.at(-1).date);
    assert.strictEqual(issued.topNumbers.length, 30);
    assert.strictEqual(new Set(issued.topNumbers.map(row => row.number)).size, 30);
    assert.strictEqual(issued.modelVersion, 'probability-score-v2');
    assert.ok(Number.isFinite(issued.model.calibration.logLoss));

    const catalog = buildGroupCatalog(scoringForms);
    const pointRun = runStrictWalkForward(rows, {
        catalog,
        startDate: targetDate,
        endDate: targetDate,
        betCount: 30
    });
    assert.deepStrictEqual(
        issued.topNumbers.map(row => row.number),
        pointRun.rows[0].numbers,
        'Snapshot và backtest strict PIT dùng hai đường tính khác nhau.'
    );

    const endDate = rows[Math.min(rows.length - 1, targetIndex + 90)].date;
    const fullRun = runStrictWalkForward(rows, {
        catalog,
        startDate: targetDate,
        endDate,
        betCount: 30
    });
    const truncatedRun = runStrictWalkForward(
        rows.filter(row => row.date <= endDate),
        { catalog, startDate: targetDate, endDate, betCount: 30 }
    );
    assert.deepStrictEqual(
        fullRun.rows,
        truncatedRun.rows,
        'Walk-forward thay đổi khi chỉ thêm dữ liệu sau cửa sổ đánh giá.'
    );

    const historicalSource = rows.slice(0, Math.min(rows.length, 700));
    const historical = probabilityScore.buildHistoricalAnalysis(historicalSource, { recentLimit: 30 });
    assert.strictEqual(historical.version, probabilityScore.HISTORICAL_ANALYSIS_VERSION);
    assert.strictEqual(historical.strictPointInTime, true);
    assert.strictEqual(historical.source.rawRows, historicalSource.length);
    assert.strictEqual(historical.source.dataEnd, historicalSource.at(-1).date);
    assert.ok(historical.summary.days > 0, 'Báo cáo toàn lịch sử phải có kỳ được đánh giá sau warm-up.');
    assert.ok(historical.yearly.length > 0, 'Báo cáo toàn lịch sử phải có tổng hợp theo năm.');
    assert.ok(historical.recentRows.length <= 30, 'Payload trình duyệt phải giới hạn số dòng gần nhất.');
    assert.strictEqual(
        historical.summary.days,
        historical.yearly.reduce((sum, row) => sum + row.days, 0),
        'Tổng số ngày toàn lịch sử phải khớp tổng theo năm.'
    );

    console.log(JSON.stringify({
        ok: true,
        targetDate,
        sourceDataThrough: issued.sourceDataThrough,
        groupCount: catalog.groups.length,
        checkedWalkForwardDays: fullRun.days,
        historicalDays: historical.summary.days
    }, null, 2));
}

main();
