'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const dualMergeAdvisorService = require('../lib/services/dualMergeAdvisorService');

function runTests() {
    console.log('Running Dual-Method Merge Advisor tests...');

    // Test 1: Economics Constants
    assert.strictEqual(dualMergeAdvisorService.TOTAL_STAKE_K, 60000, 'Total daily stake must be 60.000K (60 units)');
    assert.strictEqual(dualMergeAdvisorService.UNIT_STAKE_K, 1000, 'Unit stake must be 1.000K');
    assert.strictEqual(dualMergeAdvisorService.WIN_MULTIPLIER, 84, 'Win payout multiplier must be 84');

    // Test 2: Pool of methods
    assert.ok(dualMergeAdvisorService.POOL_7_METHODS.length >= 7, 'Pool must contain at least 7 historical methods');
    assert.ok(dualMergeAdvisorService.POOL_7_METHODS.includes('dedupEdge75Hold70'), 'Must include dedupEdge75Hold70');
    assert.ok(dualMergeAdvisorService.POOL_7_METHODS.includes('dedupEdge50CombinedB40S05Hold70'), 'Must include dedupEdge50CombinedB40S05Hold70');

    // Test 3: Synthetic data test for Strict PIT and scoring
    const mockRuns = [];
    const baseDate = new Date('2026-05-01T00:00:00Z');

    // Generate 40 synthetic days
    for (let i = 0; i < 40; i++) {
        const d = new Date(baseDate);
        d.setUTCDate(d.getUTCDate() + i);
        const dateStr = d.toISOString().slice(0, 10);

        // M1 wins on even days, M2 wins on every 3rd day
        const actual = i % 2 === 0 ? 10 : 99;

        const numsM1 = Array.from({ length: 30 }, (_, k) => k); // 00..29 (includes 10)
        const numsM2 = Array.from({ length: 30 }, (_, k) => k + 10); // 10..39 (includes 10, overlap 10..29 = 20 nums)
        const numsM3 = Array.from({ length: 30 }, (_, k) => k + 50); // 50..79 (no overlap, never hits)

        mockRuns.push({
            predictionDate: dateStr,
            summary: {
                actualSpecial: actual,
                methods: {
                    dedupEdge75Hold70: { numbersToBet: numsM1 },
                    dedupEdge50CombinedB40S05Hold70: { numbersToBet: numsM2 },
                    dedupEdge50Hold70: { numbersToBet: numsM3 }
                }
            }
        });
    }

    const advisor = dualMergeAdvisorService.buildDualMergeAdvisor(mockRuns, [], { synthesizeMissing: false });

    assert.ok(advisor, 'Advisor payload must be generated');
    assert.strictEqual(advisor.version, 'dual-merge-advisor-v1', 'Version must match');
    assert.ok(advisor.latestRecommendation, 'Must produce latest recommendation');
    assert.ok(advisor.settledLedger.length > 0, 'Settled ledger must contain records');

    const rec = advisor.latestRecommendation;
    assert.strictEqual(rec.m1, 'dedupEdge75Hold70', 'M1 should be dedupEdge75Hold70');
    assert.strictEqual(rec.m2, 'dedupEdge50CombinedB40S05Hold70', 'M2 should be dedupEdge50CombinedB40S05Hold70');
    assert.strictEqual(rec.overlapCount, 20, 'Overlap count should be exactly 20 numbers (10..29)');
    assert.strictEqual(rec.intersectionX2.length, 20, 'Intersection X2 must contain 20 numbers');
    assert.strictEqual(rec.uniqueSinglesX1.length, 20, 'Unique singles X1 must contain 20 numbers (00..09 and 30..39)');
    assert.strictEqual(rec.fullUnion.length, 40, 'Total union must contain 40 unique numbers');

    // Test Economics on Win x2
    assert.strictEqual(rec.economics.x2PayoutK, 168000, 'x2 payout must be 168.000K');
    assert.strictEqual(rec.economics.x2ProfitK, 108000, 'x2 net profit must be +108.000K');
    assert.strictEqual(rec.economics.x1PayoutK, 84000, 'x1 payout must be 84.000K');
    assert.strictEqual(rec.economics.x1ProfitK, 24000, 'x1 net profit must be +24.000K');
    assert.strictEqual(rec.economics.lossProfitK, -60000, 'Loss profit must be -60.000K');

    // Test Settled Ledger Records
    const settledEvenDay = advisor.settledLedger.find(r => r.actual === 10);
    assert.ok(settledEvenDay, 'Must find settled day with actual 10');
    assert.strictEqual(settledEvenDay.hitType, 'win_x2', 'Day with actual 10 should be win_x2 because 10 is in intersection');
    assert.strictEqual(settledEvenDay.profitK, 108000, 'Profit on win_x2 must be +108.000K');

    const settledOddDay = advisor.settledLedger.find(r => r.actual === 99);
    assert.ok(settledOddDay, 'Must find settled day with actual 99');
    assert.strictEqual(settledOddDay.hitType, 'loss', 'Day with actual 99 should be loss');
    assert.strictEqual(settledOddDay.profitK, -60000, 'Profit on loss must be -60.000K');

    // Test real cache file if present
    const historyPath = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'cached_prediction_history.json');
    if (fs.existsSync(historyPath)) {
        const realHistory = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        const realAdvisor = dualMergeAdvisorService.buildDualMergeAdvisor(realHistory.records || realHistory, []);
        assert.ok(realAdvisor.summary.totalSettled > 0, 'Real history must produce settled summary');
        console.log(`Real history verified: ${realAdvisor.summary.totalSettled} settled days, ${realAdvisor.summary.winsX2} double wins (x2), ${realAdvisor.summary.winsX1} single wins (x1), Net profit: ${(realAdvisor.summary.overallProfitK / 1000).toLocaleString()}K (${(realAdvisor.summary.roi * 100).toFixed(1)}% ROI).`);
    }

    console.log('PASS: All Dual-Method Merge Advisor tests completed successfully.');
}

runTests();
