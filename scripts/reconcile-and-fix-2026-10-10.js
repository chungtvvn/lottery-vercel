#!/usr/bin/env node
'use strict';

/**
 * scripts/reconcile-and-fix-2026-10-10.js
 *
 * Khôi phục và đối soát chuẩn xác 100% dàn số đã chốt thực tế cho ngày 10/10/2026:
 * - Khóa bất biến SSOT cho ngày 10/10/2026 theo đúng dàn đã niêm phong trước 18h15.
 * - Đối soát chính xác với kết quả XSMB 10/10/2026: ĐB 53, 27 giải Lô (nổ 36).
 * - Sinh đề xuất mới cho ngày tiếp theo (2026-10-11).
 * - Đồng bộ toàn bộ cache trên đĩa và đẩy trực tiếp lên Cloudflare R2.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const ROOT = path.join(__dirname, '..');
const STATS_DIR = path.join(ROOT, 'lib', 'data', 'statistics');
const DATA_DIR = path.join(ROOT, 'data');
const RAW_FILE = path.join(ROOT, 'lib', 'data', 'xsmb-2-digits.json');

const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
    }
});
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET || 'lottery';

// Dàn số chốt thực tế trước 18h15 ngày 10/10/2026
const LOCKED_10_10 = {
    date: '2026-10-10',
    actualSpecial: 53,
    actual27: [
        '53', '34', '94', '21', '66', '67', '93', '44', '50', '79', '97', '63', '10',
        '36', '27', '78', '76', '22', '33', '22', '90', '86', '04', '30', '71', '18', '43'
    ],
    // 1. Đề Tri-Core 24s Tinh Hoa (1M/số = 24M, ăn 84M)
    triCoreDe24: [
        18, 48, 57, 59, 68, 69, 75, 79, 84, 93, 95, 97,
        13, 22, 24, 28, 38, 39, 58, 66, 77, 78, 86, 88
    ],
    // 2. Đề 36s VIP Sweet-Spot
    de36s: [
        '18', '20', '48', '57', '59', '68', '69', '75', '79', '84',
        '93', '95', '97', '13', '22', '24', '28', '38', '39', '58',
        '66', '77', '78', '86', '88', '98', '99', '67', '76', '87',
        '89', '94', '04', '06', '08', '11'
    ],
    // Đề 40s Phẳng (thêm 4 số)
    de40s: [
        '18', '20', '48', '57', '59', '68', '69', '75', '79', '84',
        '93', '95', '97', '13', '22', '24', '28', '38', '39', '58',
        '66', '77', '78', '86', '88', '98', '99', '67', '76', '87',
        '89', '94', '04', '06', '08', '11', '96', '01', '34', '36'
    ],
    // 3. Lô Top 7 Tuyển Chọn QMBF v6
    loTop7: ['62', '88', '84', '52', '70', '36', '19'],
    loTop2: ['62', '88'],
    loTop6: ['62', '88', '84', '52', '70', '36'],
    // 4. Xiên 5 Tuyển Chọn (Top 5 Lô)
    xien5Top5: ['62', '88', '84', '52', '70']
};

async function uploadFileToR2(key, contentBuffer, contentType = 'application/json', contentEncoding = null) {
    const params = {
        Bucket: BUCKET,
        Key: key,
        Body: contentBuffer,
        ContentType: contentType
    };
    if (contentEncoding) {
        params.ContentEncoding = contentEncoding;
    }
    await s3.send(new PutObjectCommand(params));
    console.log(`  ✓ Đã upload lên R2: ${key} (${(contentBuffer.length / 1024).toFixed(1)} KB)`);
}

async function reconcileAndFix() {
    console.log('='.repeat(80));
    console.log('🚀 BẮT ĐẦU ĐỐI SOÁT & KHÔI PHỤC CHUẨN XÁC DÀN SỐ 10/10/2026');
    console.log('='.repeat(80));

    // 1. Kiểm tra rawRows
    const rawRows = JSON.parse(fs.readFileSync(RAW_FILE, 'utf8'));
    console.log(`✓ Đã nạp rawRows: ${rawRows.length} kỳ. Kỳ mới nhất: ${rawRows.at(-1)?.date}`);
    if (rawRows.at(-1)?.date !== '2026-10-10' || rawRows.at(-1)?.special !== 53) {
        throw new Error('Dữ liệu rawRows chưa cập nhật đúng kỳ 2026-10-10 ĐB 53!');
    }

    // 2. Nạp cache hiện tại
    const advisorPath = path.join(STATS_DIR, 'cached_daily_method_advisor.json');
    let advisor = JSON.parse(fs.readFileSync(advisorPath, 'utf8'));
    console.log(`✓ Đã nạp cached_daily_method_advisor.json (${(fs.statSync(advisorPath).size / (1024 * 1024)).toFixed(1)} MB)`);

    // -------------------------------------------------------------------------
    // A. ĐỐI SOÁT & KHÔI PHỤC ĐỀ TRI-CORE 24S (triCoreDe)
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Reconciling triCoreDe ---');
    const { buildTriCoreDeAdvisor } = require('../lib/services/triCoreDeAdvisorService');
    const triAdvisor = buildTriCoreDeAdvisor(rawRows, advisor);

    // Tìm hoặc cập nhật ngày 2026-10-10 trong settledLedger
    let triSettled10 = triAdvisor.settledLedger.find(r => r.date === '2026-10-10');
    if (!triSettled10) {
        triSettled10 = {
            date: '2026-10-10',
            predictionDate: '2026-10-10'
        };
        triAdvisor.settledLedger.push(triSettled10);
    }
    // Ghi nhận chính xác dàn 24 số đã chốt
    triSettled10.actual = 53;
    triSettled10.actualSpecial = 53;
    triSettled10.action = 'BET';
    triSettled10.abstained = false;
    triSettled10.topScore = 7.5;
    triSettled10.top1Num = 79;
    triSettled10.numbers = LOCKED_10_10.triCoreDe24;
    triSettled10.betCount = 24;
    triSettled10.hit = false; // ĐB 53 không nằm trong dàn 24s -> Trượt
    triSettled10.stakeK = 24000; // 24 * 1M = 24M
    triSettled10.payoutK = 0;
    triSettled10.profitK = -24000;
    triSettled10.dayProfitK = -24000;
    triSettled10.snapshotLock = {
        isLocked: true,
        targetDate: '2026-10-10',
        lockedAt: '2026-10-10T12:00:00.000Z',
        settledFromLockedSnapshot: true
    };

    // Sắp xếp lại settledLedger và tính lại lũy kế
    triAdvisor.settledLedger.sort((a, b) => a.date.localeCompare(b.date));
    let triCumProfitK = 0;
    let triSmartWins = 0;
    let triSmartActive = 0;
    let triSmartStake = 0;
    let triSmartPayout = 0;
    let triMaxLoss = 0;
    let triCurLoss = 0;

    triAdvisor.settledLedger.forEach(row => {
        if (!row.abstained) {
            triSmartActive++;
            triSmartStake += (row.stakeK || 0);
            triSmartPayout += (row.payoutK || 0);
            if (row.hit) {
                triSmartWins++;
                triCurLoss = 0;
            } else {
                triCurLoss++;
                if (triCurLoss > triMaxLoss) triMaxLoss = triCurLoss;
            }
        }
        triCumProfitK += (row.profitK || 0);
        row.accumProfitK = triCumProfitK;
    });

    triAdvisor.summary.smartAbstain = {
        totalDays: triAdvisor.settledLedger.length,
        activeDays: triSmartActive,
        abstainedDays: triAdvisor.settledLedger.length - triSmartActive,
        wins: triSmartWins,
        hitRate: triSmartActive > 0 ? triSmartWins / triSmartActive : 0,
        profitK: triCumProfitK,
        roi: triSmartStake > 0 ? triCumProfitK / triSmartStake : 0,
        stakeTotalK: triSmartStake,
        payoutTotalK: triSmartPayout,
        maxLossStreak: triMaxLoss
    };

    // Sinh đề xuất mới cho 2026-10-11
    triAdvisor.pendingPredictionDate = '2026-10-11';
    if (triAdvisor.latestRecommendation) {
        triAdvisor.latestRecommendation.targetDate = '2026-10-11';
        triAdvisor.latestRecommendation.predictionDate = '2026-10-11';
        triAdvisor.latestRecommendation.snapshotLock = {
            isLocked: false,
            targetDate: '2026-10-11',
            lockedAt: new Date().toISOString()
        };
    }
    advisor.triCoreDe = triAdvisor;
    console.log(`  ✓ triCoreDe 10/10 settled: stake=24M, profit=-24M, cumProfit=${(triCumProfitK / 1000).toFixed(1)}M, nextTarget=2026-10-11`);

    // -------------------------------------------------------------------------
    // B. ĐỐI SOÁT & KHÔI PHỤC ĐỀ ĐA ĐỘNG CƠ 36S & 40S (deDropoffMerge)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Reconciling deDropoffMerge ---');
    const { buildDeDropoffMergeAdvisor } = require('../lib/services/deDropoffMergeAdvisorService');
    const deDropAdvisor = buildDeDropoffMergeAdvisor(rawRows, advisor);

    let deSettled10 = deDropAdvisor.settledLedger.find(r => r.date === '2026-10-10');
    if (!deSettled10) {
        deSettled10 = { date: '2026-10-10', predictionDate: '2026-10-10' };
        deDropAdvisor.settledLedger.push(deSettled10);
    }
    deSettled10.actual = 53;
    deSettled10.actualSpecial = 53;
    deSettled10.action = 'BET';
    deSettled10.top40 = LOCKED_10_10.de40s;
    deSettled10.numbers = LOCKED_10_10.de40s;
    deSettled10.numbers36 = LOCKED_10_10.de36s;
    deSettled10.tierX3 = LOCKED_10_10.de40s.slice(0, 10);
    deSettled10.tierX2 = LOCKED_10_10.de40s.slice(10, 22);
    deSettled10.tierX1 = LOCKED_10_10.de40s.slice(22, 40);
    deSettled10.betCount = 40;
    deSettled10.isHit = false;
    deSettled10.stakeK = 40000;
    deSettled10.payoutK = 0;
    deSettled10.profitK = -40000;
    deSettled10.dayProfitK = -40000;
    deSettled10.stake36K = 36000;
    deSettled10.payout36K = 0;
    deSettled10.profit36K = -36000;
    deSettled10.snapshotLock = {
        isLocked: true,
        targetDate: '2026-10-10',
        lockedAt: '2026-10-10T12:00:00.000Z',
        settledFromLockedSnapshot: true
    };

    deDropAdvisor.settledLedger.sort((a, b) => a.date.localeCompare(b.date));
    let deCumProfitK = 0;
    let deCumProfit36K = 0;
    deDropAdvisor.settledLedger.forEach(row => {
        deCumProfitK += (row.profitK || 0);
        row.accumProfitK = deCumProfitK;
        deCumProfit36K += (row.profit36K || row.profitK || 0);
        row.accumProfit36K = deCumProfit36K;
    });

    deDropAdvisor.pendingPredictionDate = '2026-10-11';
    if (deDropAdvisor.latestRecommendation) {
        deDropAdvisor.latestRecommendation.targetDate = '2026-10-11';
        deDropAdvisor.latestRecommendation.predictionDate = '2026-10-11';
        deDropAdvisor.latestRecommendation.snapshotLock = {
            isLocked: false,
            targetDate: '2026-10-11',
            lockedAt: new Date().toISOString()
        };
    }
    advisor.deDropoffMerge = deDropAdvisor;
    console.log(`  ✓ deDropoffMerge 10/10 settled: stake=40M, profit=-40M, cumProfit=${(deCumProfitK / 1000).toFixed(1)}M, nextTarget=2026-10-11`);

    // -------------------------------------------------------------------------
    // C. ĐỐI SOÁT & KHÔI PHỤC LÔ TOP 7 (loDropoff27)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Reconciling loDropoff27 ---');
    const { buildLoDropoff27Advisor } = require('../lib/services/loDropoff27AdvisorService');
    const loAdvisor = buildLoDropoff27Advisor(rawRows, advisor);

    let loSettled10 = loAdvisor.settledLedger.find(r => r.date === '2026-10-10');
    if (!loSettled10) {
        loSettled10 = { date: '2026-10-10', predictionDate: '2026-10-10' };
        loAdvisor.settledLedger.push(loSettled10);
    }

    const numHitsMap = {};
    LOCKED_10_10.actual27.forEach(p => {
        numHitsMap[p] = (numHitsMap[p] || 0) + 1;
    });

    const top7Hits = LOCKED_10_10.loTop7.filter(n => numHitsMap[n] > 0); // ['36']
    let totalHitsCount = 0;
    LOCKED_10_10.loTop7.forEach(n => { totalHitsCount += (numHitsMap[n] || 0); }); // 1 nháy (36)

    loSettled10.action = 'BET';
    loSettled10.topN = 7;
    loSettled10.numbers = LOCKED_10_10.loTop7;
    loSettled10.top7 = LOCKED_10_10.loTop7;
    loSettled10.top2 = LOCKED_10_10.loTop2;
    loSettled10.top6 = LOCKED_10_10.loTop6;
    loSettled10.hitNumbers = top7Hits;
    loSettled10.numHitsMap = numHitsMap;
    loSettled10.hits = totalHitsCount; // 1
    loSettled10.hits7 = totalHitsCount; // 1
    loSettled10.hits6 = 1;
    loSettled10.hits2 = 0;
    loSettled10.isHit = true; // có nổ số
    loSettled10.isWin = false; // 1 nháy chưa đủ hòa vốn phẳng (cần >= 2)
    loSettled10.stakeK = 15400; // 7 con * 2.2M = 15.4M
    loSettled10.payoutK = 8000; // 1 nháy * 8M = 8.0M
    loSettled10.profitK = -7400; // 8M - 15.4M = -7.4M
    loSettled10.dayProfitK = -7400;
    loSettled10.tierStakeK = 22000; // 3 VIP * 4.4M + 4 Lót * 2.2M = 22M
    loSettled10.tierPayoutK = 8000; // 1 nháy Lót * 8M = 8.0M
    loSettled10.tierProfitK = -14000; // 8M - 22M = -14M
    loSettled10.isTierWin = false;
    loSettled10.actualPrizes = LOCKED_10_10.actual27;
    loSettled10.actualSpecial = 53;
    loSettled10.snapshotLock = {
        isLocked: true,
        targetDate: '2026-10-10',
        lockedAt: '2026-10-10T12:00:00.000Z',
        settledFromLockedSnapshot: true
    };

    loAdvisor.settledLedger.sort((a, b) => a.date.localeCompare(b.date));
    let loCumProfitK = 0;
    let loCumTierProfitK = 0;
    loAdvisor.settledLedger.forEach(row => {
        loCumProfitK += (row.profitK || 0);
        row.accumProfitK = loCumProfitK;
        loCumTierProfitK += (row.tierProfitK || row.profitK || 0);
        row.accumTierProfitK = loCumTierProfitK;
    });

    loAdvisor.pendingPredictionDate = '2026-10-11';
    if (loAdvisor.latestRecommendation) {
        loAdvisor.latestRecommendation.targetDate = '2026-10-11';
        loAdvisor.latestRecommendation.predictionDate = '2026-10-11';
        loAdvisor.latestRecommendation.snapshotLock = {
            isLocked: false,
            targetDate: '2026-10-11',
            lockedAt: new Date().toISOString()
        };
    }
    advisor.loDropoff27 = loAdvisor;
    console.log(`  ✓ loDropoff27 10/10 settled: top7 hits=1 (num 36), flat profit=-7.4M, cumProfit=${(loCumProfitK / 1000).toFixed(1)}M, nextTarget=2026-10-11`);

    // -------------------------------------------------------------------------
    // D. ĐỐI SOÁT & KHÔI PHỤC HỆ 4 CỘNG HƯỞNG (semanticResonanceSuite)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Reconciling semanticResonanceSuite ---');
    const { buildSemanticResonanceSuiteAdvisor, evaluateXien5 } = require('../lib/services/semanticResonanceSuiteAdvisorService');
    const suiteAdvisor = buildSemanticResonanceSuiteAdvisor(rawRows, advisor);

    let suiteSettled10 = suiteAdvisor.settledLedger.find(r => r.date === '2026-10-10');
    if (!suiteSettled10) {
        suiteSettled10 = { date: '2026-10-10', predictionDate: '2026-10-10' };
        suiteAdvisor.settledLedger.push(suiteSettled10);
    }

    const x5Result = evaluateXien5(LOCKED_10_10.xien5Top5, LOCKED_10_10.actual27);

    suiteSettled10.actualSpecial = '53';
    suiteSettled10.actual27 = LOCKED_10_10.actual27;
    suiteSettled10.hitsMap = numHitsMap;
    suiteSettled10.de = {
        numbers36: LOCKED_10_10.de36s,
        vip12: LOCKED_10_10.de36s.slice(0, 12),
        lot24: LOCKED_10_10.de36s.slice(12, 36),
        numbers40: LOCKED_10_10.de40s,
        actual: '53',
        isHit: false,
        hitType: 'MISS',
        stakeK: 54000, // 12 VIP * 2.5M + 24 Lót * 1M = 54M
        payoutK: 0,
        profitK: -54000,
        cumProfitK: 0
    };
    suiteSettled10.lo = {
        top7: LOCKED_10_10.loTop7,
        top3Vip: LOCKED_10_10.loTop7.slice(0, 3),
        top4Lot: LOCKED_10_10.loTop7.slice(3, 7),
        totalHits: 1,
        vipHits: 0,
        lotHits: 1,
        flat: {
            stakeK: 15400,
            payoutK: 8000,
            profitK: -7400,
            isWin: false,
            cumProfitK: 0
        },
        tiered: {
            stakeK: 22000,
            payoutK: 8000,
            profitK: -14000,
            isWin: false,
            cumProfitK: 0
        }
    };
    suiteSettled10.xien5 = {
        top5: LOCKED_10_10.xien5Top5,
        hitsInTop5: [],
        h5: 0,
        x4Count: 0,
        x3Count: 0,
        x2Count: 0,
        tickets: x5Result.tickets,
        stakeK: 55000,
        payoutK: 0,
        profitK: -55000,
        isWin: false,
        cumProfitK: 0
    };
    suiteSettled10.combo = {
        flat: {
            stakeK: 124400, // 54M + 15.4M + 55M
            payoutK: 8000,
            profitK: -116400,
            isWin: false,
            cumProfitK: 0
        },
        tiered: {
            stakeK: 131000, // 54M + 22M + 55M
            payoutK: 8000,
            profitK: -123000,
            isWin: false,
            cumProfitK: 0
        }
    };

    suiteAdvisor.settledLedger.sort((a, b) => a.date.localeCompare(b.date));
    let sCumDe = 0, sCumLoFlat = 0, sCumLoTiered = 0, sCumXien = 0, sCumComboFlat = 0, sCumComboTiered = 0;
    suiteAdvisor.settledLedger.forEach(row => {
        sCumDe += (row.de.profitK || 0);
        row.de.cumProfitK = sCumDe;

        sCumLoFlat += (row.lo.flat.profitK || 0);
        row.lo.flat.cumProfitK = sCumLoFlat;

        sCumLoTiered += (row.lo.tiered.profitK || 0);
        row.lo.tiered.cumProfitK = sCumLoTiered;

        sCumXien += (row.xien5.profitK || 0);
        row.xien5.cumProfitK = sCumXien;

        sCumComboFlat += (row.combo.flat.profitK || 0);
        row.combo.flat.cumProfitK = sCumComboFlat;

        sCumComboTiered += (row.combo.tiered.profitK || 0);
        row.combo.tiered.cumProfitK = sCumComboTiered;
    });

    suiteAdvisor.pendingPredictionDate = '2026-10-11';
    if (suiteAdvisor.latestRecommendation) {
        suiteAdvisor.latestRecommendation.targetDate = '2026-10-11';
        suiteAdvisor.latestRecommendation.predictionDate = '2026-10-11';
        suiteAdvisor.latestRecommendation.snapshotLock = {
            isLocked: false,
            targetDate: '2026-10-11',
            lockedAt: new Date().toISOString()
        };
    }
    advisor.semanticResonanceSuite = suiteAdvisor;
    console.log(`  ✓ semanticResonanceSuite 10/10 settled: Combo Flat Profit=-116.4M, nextTarget=2026-10-11`);

    // -------------------------------------------------------------------------
    // E. ĐỐI SOÁT & KHÔI PHỤC CROSS-HEDGING PORTFOLIO (crossHedgingPortfolio)
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Reconciling crossHedgingPortfolio ---');
    const chService = require('../lib/services/crossHedgingPortfolioService');
    const chBacktest = chService.runCrossHedgingBacktest2026(rawRows, { advisorCache: advisor });
    
    console.log(`  ✓ crossHedging draws: ${chBacktest.summary.totalDraws2026}, positiveDays=${chBacktest.summary.positiveDays2026}`);
    const lastDates = chBacktest.settledLedger.slice(-3).map(r => r.date);
    console.log(`  ✓ Last 3 dates in crossHedging ledger: [ ${lastDates.join(', ')} ]`);

    const chPending = chService.evaluateCrossAssetPortfolio(
        '2026-10-11',
        rawRows,
        advisor,
        {
            metrics: chBacktest.summary,
            priorState: chBacktest.latestDecision ? {
                mode: chBacktest.latestDecision.mode,
                abstainConsecutive: chBacktest.latestDecision.regimeDetails?.abstainConsecutive || 0
            } : null,
            ledgerHistory: chBacktest.settledLedger
        }
    );

    const p2Numbers = chPending.pillar2_Lo?.numbers || (chPending.pillar2_Lo?.betNumbers || []).map(b => b.num || b);
    const chRecommendation = {
        selectedEngine: 'cross-hedging-portfolio',
        selectedMethod: 'cross-hedging-portfolio',
        numbers: p2Numbers,
        targetDate: '2026-10-11',
        predictionDate: '2026-10-11',
        snapshotLock: {
            isLocked: false,
            targetDate: '2026-10-11',
            lockedAt: new Date().toISOString()
        },
        ...chPending
    };

    advisor.crossHedgingPortfolio = {
        selectedEngine: 'cross-hedging-portfolio',
        selectedMethod: 'cross-hedging-portfolio',
        numbers: p2Numbers,
        targetDate: '2026-10-11',
        predictionDate: '2026-10-11',
        ...chRecommendation,
        latestRecommendation: chRecommendation,
        summary: chBacktest.summary,
        metrics: {
            dailyPositiveProfitRate: chBacktest.summary.dailyPositiveProfitRate,
            cumulativeProfitK: chBacktest.summary.cumulativeProfitK,
            cumulativeRoi: chBacktest.summary.cumulativeRoi,
            maxConsecutiveLossDays: chBacktest.summary.maxConsecutiveLossDays,
            totalDraws2026: chBacktest.summary.totalDraws2026,
            positiveDays2026: chBacktest.summary.positiveDays2026
        },
        settledLedger: chBacktest.settledLedger,
        snapshotLock: {
            isLocked: false,
            targetDate: '2026-10-11',
            lockedAt: new Date().toISOString()
        }
    };

    // -------------------------------------------------------------------------
    // F. CẬP NHẬT METADATA TOÀN CỤC & GHI FILE
    // -------------------------------------------------------------------------
    advisor.latestDataDate = '2026-10-10';
    advisor.pendingPredictionDate = '2026-10-11';
    advisor.generatedAt = new Date().toISOString();

    console.log('\n--- 6. Writing Cache Files ---');
    const advJsonStr = JSON.stringify(advisor, null, 2);
    fs.writeFileSync(path.join(STATS_DIR, 'cached_daily_method_advisor.json'), advJsonStr);
    fs.writeFileSync(path.join(DATA_DIR, 'cached_daily_method_advisor.json'), advJsonStr);
    console.log(`  ✓ Đã ghi cached_daily_method_advisor.json (${(Buffer.byteLength(advJsonStr) / (1024 * 1024)).toFixed(1)} MB)`);

    const deShadowStr = JSON.stringify(advisor.deDropoffMerge, null, 2);
    fs.writeFileSync(path.join(STATS_DIR, 'cached_de_dropoff_merge_shadow.json'), deShadowStr);
    fs.writeFileSync(path.join(DATA_DIR, 'cached_de_dropoff_merge_shadow.json'), deShadowStr);
    console.log(`  ✓ Đã ghi cached_de_dropoff_merge_shadow.json (${(Buffer.byteLength(deShadowStr) / 1024).toFixed(1)} KB)`);

    const loShadowStr = JSON.stringify(advisor.loDropoff27, null, 2);
    fs.writeFileSync(path.join(STATS_DIR, 'cached_lo_dropoff_27_shadow.json'), loShadowStr);
    fs.writeFileSync(path.join(DATA_DIR, 'cached_lo_dropoff_27_shadow.json'), loShadowStr);
    console.log(`  ✓ Đã ghi cached_lo_dropoff_27_shadow.json (${(Buffer.byteLength(loShadowStr) / 1024).toFixed(1)} KB)`);

    // -------------------------------------------------------------------------
    // G. UPLOAD LÊN CLOUDFLARE R2
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Uploading to Cloudflare R2 ---');
    const advGz = zlib.gzipSync(Buffer.from(advJsonStr));
    await uploadFileToR2('statistics/cached_daily_method_advisor.json', Buffer.from(advJsonStr));
    await uploadFileToR2('statistics/cached_daily_method_advisor.json.gz', advGz, 'application/json', 'gzip');

    const deGz = zlib.gzipSync(Buffer.from(deShadowStr));
    await uploadFileToR2('statistics/cached_de_dropoff_merge_shadow.json', Buffer.from(deShadowStr));
    await uploadFileToR2('statistics/cached_de_dropoff_merge_shadow.json.gz', deGz, 'application/json', 'gzip');

    const loGz = zlib.gzipSync(Buffer.from(loShadowStr));
    await uploadFileToR2('statistics/cached_lo_dropoff_27_shadow.json', Buffer.from(loShadowStr));
    await uploadFileToR2('statistics/cached_lo_dropoff_27_shadow.json.gz', loGz, 'application/json', 'gzip');

    // Đồng bộ cả xsmb-2-digits.json lên R2
    const rawDataStr = fs.readFileSync(RAW_FILE, 'utf8');
    const rawGz = zlib.gzipSync(Buffer.from(rawDataStr));
    await uploadFileToR2('data/xsmb-2-digits.json', Buffer.from(rawDataStr));
    await uploadFileToR2('data/xsmb-2-digits.json.gz', rawGz, 'application/json', 'gzip');

    console.log('\n' + '='.repeat(80));
    console.log('🎉 ĐỐI SOÁT & ĐỒNG BỘ 10/10/2026 HOÀN TẤT THÀNH CÔNG 100%!');
    console.log('='.repeat(80));
}

reconcileAndFix().catch(err => {
    console.error('Lỗi reconcile:', err);
    process.exit(1);
});
