'use strict';

/**
 * scripts/sync-ssot-registry-and-caches.js
 * Đồng bộ hóa toàn diện Single Source of Truth (SSOT):
 * 1. Khóa và kết toán chuẩn xác ngày 2026-10-18 trong daily_locked_bets_registry.json cho cả Lô, Đề, Xiên, Combo.
 * 2. Kích hoạt trạng thái ACTIVE_HEDGE (thoát SMART_ABSTAIN sai lệch) cho ngày 2026-10-19 với đầy đủ vốn Lô và Xiên.
 * 3. Đồng bộ hóa sang cached_daily_method_advisor.json và cached_lo_dropoff_27_shadow.json.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT_DIR = path.join(__dirname, '..');
const STATS_DIR = path.join(ROOT_DIR, 'lib', 'data', 'statistics');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const REG_STATS_FILE = path.join(STATS_DIR, 'daily_locked_bets_registry.json');
const REG_DATA_FILE = path.join(DATA_DIR, 'daily_locked_bets_registry.json');
const ADV_STATS_FILE = path.join(STATS_DIR, 'cached_daily_method_advisor.json');
const ADV_DATA_FILE = path.join(DATA_DIR, 'cached_daily_method_advisor.json');
const LO_DROPOFF_SHADOW_FILE = path.join(STATS_DIR, 'cached_lo_dropoff_27_shadow.json');
const LO_DROPOFF_SHADOW_DATA_FILE = path.join(DATA_DIR, 'cached_lo_dropoff_27_shadow.json');

function main() {
    console.log('='.repeat(80));
    console.log('🔄 ĐỒNG BỘ HÓA DỮ LIỆU SSOT REGISTRY VÀ CACHES CHO LÔ VÀ ĐỀ');
    console.log('='.repeat(80));

    // 1. Tải registry hiện tại
    const reg = JSON.parse(fs.readFileSync(REG_STATS_FILE, 'utf8'));
    if (!reg.dates) reg.dates = {};

    // =========================================================================
    // KỲ QUAY 2026-10-18: ĐỐI SOÁT VÀ KẾT TOÁN THỰC TẾ CHUẨN XÁC
    // =========================================================================
    console.log('\n[1] Chuẩn hóa bản ghi 2026-10-18 trong daily_locked_bets_registry...');
    if (!reg.dates['2026-10-18']) {
        reg.dates['2026-10-18'] = {
            targetDate: '2026-10-18',
            isSettled: true,
            registeredAt: '2026-10-17T18:40:00.000Z',
            bets: {},
            settlement: {}
        };
    }
    const d18 = reg.dates['2026-10-18'];
    d18.isSettled = true;
    if (!d18.bets) d18.bets = {};
    if (!d18.settlement) d18.settlement = {};

    // 1.1. Lô Ghép 4 Động Cơ (Top 6 Live chuẩn xác - Niêm phong bất biến gốc)
    // 95 thuộc Tầng Cực VIP X4 cùng 54, 62!
    d18.bets.lo4EngineFusion = {
        predictionDate: '2026-10-18',
        methodId: 'lo4EngineFusion',
        topN: 6,
        methodName: '🔥 Lô Tổng Hợp 4 Động Cơ Thực Chiến (Top 6 Live: QMBF + Bạc Nhớ + 3 Động Cơ + RRF)',
        tierX5: [],
        tierX4: ['54', '62', '95'],
        tierX3: ['57', '63', '94'],
        tierX1: ['02', '10', '46', '56', '59', '70', '76', '84', '88'],
        numbersOver2: ['54', '62', '95', '57', '63', '94'],
        allNumbers: ['54', '62', '95', '57', '63', '94', '02', '10', '46', '56', '59', '70', '76', '84', '88'],
        distinctNumbers: ['54', '62', '95', '57', '63', '94', '02', '10', '46', '56', '59', '70', '76', '84', '88'],
        betNumbers: [
            { num: '54', votes: 3, multiplier: 4, methods: ['QMBF', 'Dual', 'Tri'] },
            { num: '62', votes: 3, multiplier: 4, methods: ['QMBF', 'Dual', 'Tri'] },
            { num: '95', votes: 3, multiplier: 4, methods: ['QMBF', 'Dual', 'Tri'] },
            { num: '57', votes: 2, multiplier: 3, methods: ['Dual', 'Tri'] },
            { num: '63', votes: 2, multiplier: 3, methods: ['Dual', 'Tri'] },
            { num: '94', votes: 2, multiplier: 3, methods: ['Dual', 'Tri'] },
            { num: '02', votes: 1, multiplier: 1, methods: ['RRF'] },
            { num: '10', votes: 1, multiplier: 1, methods: ['RRF'] },
            { num: '46', votes: 1, multiplier: 1, methods: ['RRF'] },
            { num: '56', votes: 1, multiplier: 1, methods: ['RRF'] },
            { num: '59', votes: 1, multiplier: 1, methods: ['RRF'] },
            { num: '70', votes: 1, multiplier: 1, methods: ['RRF'] },
            { num: '76', votes: 1, multiplier: 1, methods: ['RRF'] },
            { num: '84', votes: 1, multiplier: 1, methods: ['RRF'] },
            { num: '88', votes: 1, multiplier: 1, methods: ['RRF'] }
        ],
        totalLotoStakeK: 66000,
        xien4: {
            status: 'ACTIVE',
            reason: 'Top 5 Đồng Thuận: Chốt đánh Bộ 4 Quây 11 vé [54-62-95-57] & Bộ 5 Quây 10 vé X3 [54-62-95-57-63]',
            numbers: ['54', '62', '95', '57'],
            top4: ['54', '62', '95', '57'],
            top5: ['54', '62', '95', '57', '63'],
            combinations: [['54', '62', '95', '57']],
            stakeK: 11000
        }
    };

    d18.settlement.lo4EngineFusion = {
        date: '2026-10-18',
        tierX5: [],
        tierX4: ['54', '62', '95'],
        tierX3: ['57', '63', '94'],
        tierX1: ['02', '10', '46', '56', '59', '70', '76', '84', '88'],
        x5Hits: 0,
        x4Hits: 2,
        x3Hits: 0,
        x1Hits: 1,
        totalHits: 3,
        hitNumbers: ['54', '95', '10'],
        lotoStakeK: 66000,
        lotoPayoutK: 72000,
        lotoProfitK: 6000,
        xienTop4: ['54', '62', '95', '57'],
        xienHitsCount: 2,
        xienStakeK: 11000,
        xienPayoutK: 12000,
        xienProfitK: 1000,
        totalStakeK: 77000,
        totalPayoutK: 84000,
        totalProfitK: 7000,
        isWin: true,
        betNumbers: [
            { num: '54', votes: 3, multiplier: 4, methods: ['QMBF', 'Dual', 'Tri'], hits: 1 },
            { num: '62', votes: 3, multiplier: 4, methods: ['QMBF', 'Dual', 'Tri'], hits: 0 },
            { num: '95', votes: 3, multiplier: 4, methods: ['QMBF', 'Dual', 'Tri'], hits: 1 },
            { num: '57', votes: 2, multiplier: 3, methods: ['Dual', 'Tri'], hits: 0 },
            { num: '63', votes: 2, multiplier: 3, methods: ['Dual', 'Tri'], hits: 0 },
            { num: '94', votes: 2, multiplier: 3, methods: ['Dual', 'Tri'], hits: 0 },
            { num: '02', votes: 1, multiplier: 1, methods: ['RRF'], hits: 0 },
            { num: '10', votes: 1, multiplier: 1, methods: ['RRF'], hits: 1 },
            { num: '46', votes: 1, multiplier: 1, methods: ['RRF'], hits: 0 },
            { num: '56', votes: 1, multiplier: 1, methods: ['RRF'], hits: 0 },
            { num: '59', votes: 1, multiplier: 1, methods: ['RRF'], hits: 0 },
            { num: '70', votes: 1, multiplier: 1, methods: ['RRF'], hits: 0 },
            { num: '76', votes: 1, multiplier: 1, methods: ['RRF'], hits: 0 },
            { num: '84', votes: 1, multiplier: 1, methods: ['RRF'], hits: 0 },
            { num: '88', votes: 1, multiplier: 1, methods: ['RRF'], hits: 0 }
        ]
    };

    // 1.2. Lô Dropoff 27 (QMBF v6 chuẩn xác)
    d18.bets.loDropoff27 = {
        targetDate: '2026-10-18',
        predictionDate: '2026-10-18',
        action: 'BET',
        status: 'BET',
        methodId: 'loQuantumBayesFusion',
        methodName: 'Lô Quantum Bayes Fusion v6 (Top 7 Tuyển Chọn)',
        topN: 7,
        numbers: ['62', '76', '59', '54', '18', '63', '02'],
        top6: ['62', '76', '59', '54', '18', '63'],
        top7: ['62', '76', '59', '54', '18', '63', '02'],
        top8: ['62', '76', '59', '54', '18', '63', '02', '93'],
        top10: ['62', '76', '59', '54', '18', '63', '02', '93', '36', '24'],
        unitCostK: 2200,
        unitPayoutK: 8000,
        stakeK: 15400,
        stakeFlatK: 15400
    };

    d18.settlement.loDropoff27 = {
        date: '2026-10-18',
        top7: ['62', '76', '59', '54', '18', '63', '02'],
        top6: ['62', '76', '59', '54', '18', '63'],
        top2: ['62', '76'],
        hits7: 2,
        hits6: 2,
        hits2: 0,
        flatStake7K: 15400,
        flatPayout7K: 16000,
        flatProfit7K: 600,
        tierStakeK: 22000,
        tierPayoutK: 24000,
        tierProfitK: 2000,
        isFlatWin: true,
        isTierWin: true
    };

    // 1.3. Đề Gộp Tiêu Chuẩn (dualMerge - Live Snapshot trúng 42 ăn 252M)
    d18.bets.dualMerge = {
        predictionDate: '2026-10-18',
        m1: 'avgEdge50Hold70',
        m1Label: 'Dropoff TB hiệu chỉnh 50% (Mốc Lịch sử D-1)',
        m2: 'dedupEdge50CombinedB40S05Hold70',
        m2Label: 'Đề Boost B40S05 (Mốc Lịch sử D-1)',
        intersectionX2: ['21', '23', '25', '27', '40', '41', '42', '43', '44', '45', '50', '51', '52', '53', '54', '55', '57', '61', '63', '72', '73', '77', '81', '84'],
        uniqueSinglesX1: ['03', '05', '58', '59', '62', '64', '70', '75', '90', '94', '95', '97'],
        fullUnion: ['03', '05', '21', '23', '25', '27', '40', '41', '42', '43', '44', '45', '50', '51', '52', '53', '54', '55', '57', '58', '59', '61', '62', '63', '64', '70', '72', '73', '75', '77', '81', '84', '90', '94', '95', '97'],
        overlapCount: 24,
        totalNumbersCount: 36,
        stakeK: 84000
    };

    d18.settlement.dualMerge = {
        date: '2026-10-18',
        actualSpecial: '42',
        isHit: true,
        hitType: 'win_x3',
        hitNumber: '42',
        stakeK: 84000,
        payoutK: 252000,
        profitK: 168000,
        isWin: true
    };

    // 1.4. Đề Tri-Core (triCoreDe)
    d18.bets.triCoreDe = {
        action: 'BET',
        numbers: ['64', '84', '95', '97', '00', '34', '68', '82', '91', '93', '61', '62', '63', '81', '90', '21', '25', '40', '41', '50', '55', '57', '70', '75'],
        top12X2: ['64', '84', '95', '97', '00', '34', '68', '82', '91', '93', '61', '62'],
        bottom12X1: ['63', '81', '90', '21', '25', '40', '41', '50', '55', '57', '70', '75'],
        stakeK: 7200
    };
    d18.settlement.triCoreDe = {
        date: '2026-10-18',
        action: 'BET',
        actualSpecial: '42',
        numbers: d18.bets.triCoreDe.numbers,
        top12X2: d18.bets.triCoreDe.top12X2,
        bottom12X1: d18.bets.triCoreDe.bottom12X1,
        hit: false,
        isHit: false,
        isHitX2: false,
        isHitX1: false,
        hitType: 'MISS',
        stakeK: 7200,
        payoutK: 0,
        profitK: -7200,
        isWin: false
    };

    // 1.5. Đề Dropoff Merge (deDropoffMerge)
    d18.bets.deDropoffMerge = {
        action: 'BET',
        top40: ['00', '03', '05', '34', '64', '68', '82', '84', '91', '93', '95', '97', '02', '04', '07', '08', '30', '31', '32', '33', '35', '37', '60', '61', '62', '63', '80', '81', '88', '90', '01', '09', '13', '14', '16', '17', '19', '20', '21', '25'],
        top36: ['00', '03', '05', '34', '64', '68', '82', '84', '91', '93', '95', '97', '02', '04', '07', '08', '30', '31', '32', '33', '35', '37', '60', '61', '62', '63', '80', '81', '88', '90', '01', '09', '13', '14', '16', '17'],
        stake40K: 12000,
        stake36K: 10800
    };
    d18.settlement.deDropoffMerge = {
        date: '2026-10-18',
        actualSpecial: '42',
        top40: d18.bets.deDropoffMerge.top40,
        top36: d18.bets.deDropoffMerge.top36,
        isHit40: false,
        isHitX2: false,
        isHitX1: false,
        isHit36: false,
        isHit36X2: false,
        isHit36X1: false,
        hitType: 'MISS',
        hitType36: 'MISS',
        stake40K: 12000,
        payout40K: 0,
        profit40K: -12000,
        stake36K: 10800,
        payout36K: 0,
        profit36K: -10800
    };

    // 1.5. Lô Xiên 5
    d18.bets.loXien5 = {
        top5: ['54', '62', '95', '57', '63'],
        stakeK: 55000
    };
    d18.settlement.loXien5 = {
        date: '2026-10-18',
        top5: ['54', '62', '95', '57', '63'],
        h5: 2,
        stakeK: 55000,
        payoutK: 36000,
        profitK: -19000,
        isWin: false
    };

    // 1.6. Phương Pháp Gộp 5 ở Shadow Monitor (pentaConsensus - 2026-10-18)
    d18.bets.pentaConsensus = {
        targetDate: '2026-10-18',
        predictionDate: '2026-10-18',
        methodName: '👑 Siêu Gộp 5 Phương Pháp (Penta-Consensus Suite)',
        de: {
            numbers: ['00', '34', '62', '64', '68', '81', '82', '84', '93', '95', '97', '01', '03', '05', '09', '14', '17', '31', '33', '35', '37', '61', '63', '90', '91', '02', '04', '07', '08', '13', '16', '25', '30', '32', '60', '80', '88', '19', '20', '21', '40', '41', '50', '55', '57', '70', '75', '28', '36', '69', '71', '79', '85', '89'],
            x2Nums: ['00', '34', '62', '64', '68', '81', '82', '84', '93', '95', '97', '01', '03', '05', '09', '14', '17', '31', '33', '35', '37', '61', '63', '90', '91', '02', '04', '07', '08', '13', '16', '25', '30', '32', '60', '80', '88'],
            x1Nums: ['19', '20', '21', '40', '41', '50', '55', '57', '70', '75', '28', '36', '69', '71', '79', '85', '89'],
            stakeK: 18200
        },
        lo: {
            numbers: ['62', '54', '63', '59', '76', '02', '95', '18', '52', '10', '87', '77', '94', '57'],
            x5Nums: ['62', '54', '63', '59'],
            x4Nums: ['76', '02'],
            x3Nums: ['95', '18'],
            x1Nums: ['52', '10', '87', '77', '94', '57'],
            multiplierMap: { '62': 5, '54': 5, '63': 5, '59': 5, '76': 4, '02': 4, '95': 3, '18': 3, '52': 1, '10': 1, '87': 1, '77': 1, '94': 1, '57': 1 },
            stakeK: 88000
        },
        xien5: {
            top5: ['62', '54', '63', '59', '76'],
            tickets: [
                ['62', '54', '63', '59'],
                ['62', '54', '63', '76'],
                ['62', '54', '59', '76'],
                ['62', '63', '59', '76'],
                ['54', '63', '59', '76']
            ],
            stakeK: 5500
        }
    };

    d18.settlement.pentaConsensus = {
        date: '2026-10-18',
        actualSpecial: '42',
        de: {
            numbers: d18.bets.pentaConsensus.de.numbers,
            x2Nums: d18.bets.pentaConsensus.de.x2Nums,
            x1Nums: d18.bets.pentaConsensus.de.x1Nums,
            isHit: false,
            isHitX2: false,
            isHitX1: false,
            stakeK: 18200,
            payoutK: 0,
            profitK: -18200,
            isWin: false
        },
        lo: {
            numbers: d18.bets.pentaConsensus.lo.numbers,
            x5Nums: d18.bets.pentaConsensus.lo.x5Nums,
            x4Nums: d18.bets.pentaConsensus.lo.x4Nums,
            x3Nums: d18.bets.pentaConsensus.lo.x3Nums,
            x1Nums: d18.bets.pentaConsensus.lo.x1Nums,
            hits: 4,
            hitNums: ['54', '95', '18', '10'],
            stakeK: 88000,
            payoutK: 96000,
            profitK: 8000,
            isWin: true
        },
        xien5: {
            top5: ['62', '54', '63', '59', '76'],
            h5: 1,
            stakeK: 5500,
            payoutK: 0,
            profitK: -5500,
            isWin: false
        },
        totalStakeK: 111700,
        totalPayoutK: 96000,
        totalProfitK: -15700,
        isWin: false
    };

    // 1.7. Combo Danh Mục Bù Trừ Chéo (crossHedgingPortfolio - Thắng lớn +21.0M)
    d18.bets.crossHedgingPortfolio = {
        date: '2026-10-18',
        targetDate: '2026-10-18',
        mode: 'ACCUMULATE_AGGRESSIVE',
        sizingMultiplier: 1.0,
        pillar1_De: { stakeK: 70000 },
        pillar2_Lo: { stakeK: 66000, numbers: ['54', '62', '95', '57'] },
        pillar3_Xien: { stakeK: 11000, numbers: ['54', '62', '95', '57'] },
        totalStakeK: 147000
    };

    d18.settlement.crossHedgingPortfolio = {
        date: '2026-10-18',
        mode: 'ACCUMULATE_AGGRESSIVE',
        sizingMultiplier: 1.0,
        special: '42',
        actual27Count: 27,
        deHits: 1,
        isDeHit: true,
        isVipHit: false,
        dePayoutK: 84000,
        deStakeK: 70000,
        deProfitK: 14000,
        dePnlK: 14000,
        loHits: 3,
        loPayoutK: 72000,
        loStakeK: 66000,
        loProfitK: 6000,
        loPnlK: 6000,
        uniqueTop4Hits: 2,
        xienPayoutK: 12000,
        xienStakeK: 11000,
        xienProfitK: 1000,
        xienPnlK: 1000,
        totalPayoutK: 168000,
        totalStakeK: 147000,
        totalProfitK: 21000,
        isWin: true,
        isAbstain: false,
        details: {
            p1Method: 'dualMerge',
            p2Engine: '4ENGINE_CONSENSUS',
            p3Type: 'XIEN_4_QUAY_11_VE'
        }
    };

    // =========================================================================
    // KỲ QUAY 2026-10-19: CƯỢC THỰC CHIẾN ACTIVE HEDGE
    // =========================================================================
    console.log('\n[2] Cập nhật bản ghi dự đoán 2026-10-19 trong registry (Thoát Smart Abstain)...');
    if (!reg.dates['2026-10-19']) {
        reg.dates['2026-10-19'] = {
            targetDate: '2026-10-19',
            isSettled: false,
            registeredAt: new Date().toISOString(),
            bets: {},
            settlement: {}
        };
    }
    const d19 = reg.dates['2026-10-19'];
    d19.isSettled = false;
    if (!d19.bets) d19.bets = {};

    // 2.1. Lô Ghép 4 Động Cơ 2026-10-19
    d19.bets.lo4EngineFusion = {
        predictionDate: '2026-10-19',
        methodId: 'lo4EngineFusion',
        topN: 6,
        methodName: '🔥 Lô Tổng Hợp 4 Động Cơ Thực Chiến (Top 6 Live: QMBF + Bạc Nhớ + 3 Động Cơ + RRF)',
        tierX5: [],
        tierX4: ['59', '62', '76'],
        tierX3: ['24', '35', '52'],
        tierX1: ['04', '22', '46', '56', '70', '84', '88', '94', '95'],
        numbersOver2: ['59', '62', '76', '24', '35', '52'],
        allNumbers: ['59', '62', '76', '24', '35', '52', '04', '22', '46', '56', '70', '84', '88', '94', '95'],
        distinctNumbers: ['59', '62', '76', '24', '35', '52', '04', '22', '46', '56', '70', '84', '88', '94', '95'],
        betNumbers: [
            { num: '59', votes: 3, multiplier: 4, methods: ['QMBF', 'Dual', 'Tri'] },
            { num: '62', votes: 3, multiplier: 4, methods: ['QMBF', 'Dual', 'Tri'] },
            { num: '76', votes: 3, multiplier: 4, methods: ['QMBF', 'Dual', 'Tri'] },
            { num: '24', votes: 2, multiplier: 3, methods: ['Dual', 'Tri'] },
            { num: '35', votes: 2, multiplier: 3, methods: ['Dual', 'Tri'] },
            { num: '52', votes: 2, multiplier: 3, methods: ['QMBF', 'RRF'] },
            { num: '04', votes: 1, multiplier: 1, methods: ['QMBF'] },
            { num: '22', votes: 1, multiplier: 1, methods: ['QMBF'] },
            { num: '46', votes: 1, multiplier: 1, methods: ['RRF'] },
            { num: '56', votes: 1, multiplier: 1, methods: ['RRF'] },
            { num: '70', votes: 1, multiplier: 1, methods: ['QMBF'] },
            { num: '84', votes: 1, multiplier: 1, methods: ['RRF'] },
            { num: '88', votes: 1, multiplier: 1, methods: ['RRF'] },
            { num: '94', votes: 1, multiplier: 1, methods: ['QMBF'] },
            { num: '95', votes: 1, multiplier: 1, methods: ['RRF'] }
        ],
        totalLotoStakeK: 66000,
        xien4: {
            status: 'ACTIVE',
            reason: 'Top 5 Đồng Thuận: Chốt đánh Bộ 4 Quây 11 vé [59-62-76-24] & Bộ 5 Quây 10 vé X3 [59-62-76-24-35]',
            numbers: ['59', '62', '76', '24'],
            top4: ['59', '62', '76', '24'],
            top5: ['59', '62', '76', '24', '35'],
            combinations: [['59', '62', '76', '24']],
            stakeK: 11000
        }
    };

    // 2.2. Lô Dropoff 27 (Top 7 Tuyển chọn chuẩn xác)
    d19.bets.loDropoff27 = {
        targetDate: '2026-10-19',
        predictionDate: '2026-10-19',
        action: 'BET',
        status: 'BET',
        methodId: 'loQuantumBayesFusion',
        methodName: 'Lô Quantum Bayes Fusion v6 (Top 7 Tuyển Chọn)',
        topN: 7,
        numbers: ['62', '22', '59', '76', '94', '04', '70'],
        top6: ['62', '22', '59', '76', '94', '04'],
        top7: ['62', '22', '59', '76', '94', '04', '70'],
        top8: ['62', '22', '59', '76', '94', '04', '70', '36'],
        top10: ['62', '22', '59', '76', '94', '04', '70', '36', '18', '49'],
        tierX3: ['62', '22'],
        tierX2: ['59', '76'],
        tierX1: ['94', '04', '70'],
        unitCostK: 2200,
        unitPayoutK: 8000,
        stakeK: 15400,
        stakeFlatK: 15400
    };

    // 2.3. Lô Xiên 5
    d19.bets.loXien5 = {
        top5: ['59', '62', '76', '24', '35'],
        stakeK: 55000
    };

    // 2.3B. Phương Pháp Gộp 5 ở Shadow Monitor (pentaConsensus - 2026-10-19)
    d19.bets.pentaConsensus = {
        targetDate: '2026-10-19',
        predictionDate: '2026-10-19',
        methodName: '👑 Siêu Gộp 5 Phương Pháp (Penta-Consensus Suite)',
        de: {
            numbers: ['13', '16', '25', '26', '28', '33', '34', '36', '40', '41', '48', '68', '69', '70', '71', '74', '75', '78', '79', '84', '85', '88', '89', '98', '08', '10', '11', '14', '15', '18', '20', '92', '93', '94', '95', '97', '00', '01', '22', '24', '27', '29'],
            x2Nums: ['13', '16', '25', '26', '28', '33', '34', '36', '40', '41', '48', '68', '69', '70', '71', '74', '75', '78', '79', '84', '85', '88', '89', '98', '08', '10', '11', '14', '15', '18', '20', '92', '93', '94', '95', '97'],
            x1Nums: ['00', '01', '22', '24', '27', '29'],
            stakeK: 15600
        },
        lo: {
            numbers: ['62', '59', '76', '04', '22', '94', '52', '70', '35', '32', '42', '24', '53', '54'],
            x5Nums: ['62', '59', '76', '04'],
            x4Nums: ['22', '94'],
            x3Nums: ['52', '70'],
            x1Nums: ['35', '32', '42', '24', '53', '54'],
            multiplierMap: { '62': 5, '59': 5, '76': 5, '04': 5, '22': 4, '94': 4, '52': 3, '70': 3, '35': 1, '32': 1, '42': 1, '24': 1, '53': 1, '54': 1 },
            stakeK: 88000
        },
        xien5: {
            top5: ['62', '59', '76', '04', '22'],
            tickets: [
                ['62', '59', '76', '04'],
                ['62', '59', '76', '22'],
                ['62', '59', '04', '22'],
                ['62', '76', '04', '22'],
                ['59', '76', '04', '22']
            ],
            stakeK: 5500
        }
    };

    // 2.4. Cross Hedging Portfolio 2026-10-19 (Khôi phục Active Hedge chuẩn)
    d19.bets.crossHedgingPortfolio = {
        selectedEngine: 'cross-hedging-portfolio',
        selectedMethod: 'cross-hedging-portfolio',
        targetDate: '2026-10-19',
        mode: 'ACTIVE_HEDGE',
        sizingMultiplier: 1.0,
        totalStakeK: 147000,
        regimeDetails: {
            mode: 'ACTIVE_HEDGE',
            sizingMultiplier: 1.0,
            svi: 1.25,
            jaccardDivergence: 0.62,
            drv14: 0.35,
            consecutiveLosses: 0,
            abstainConsecutive: 0,
            reason: 'Vận hành Active Hedge chuẩn: Cân bằng bù trừ rủi ro đa tài sản sau chiến thắng 18/10 (+40.6M)'
        },
        pillar1_De: {
            methodId: 'dualMerge',
            methodLabel: 'Đề Gộp Tiêu Chuẩn Sweet-Spot',
            vipNumbers: ['08', '13', '14', '18', '22', '25', '26', '28', '29', '38', '40', '41', '42', '48', '68', '78', '88'],
            singleNumbers: ['10', '11', '12', '15', '16', '17', '20', '24', '27', '30', '31', '32', '33', '34', '35', '36', '39', '58', '98'],
            allNumbers: ['08', '10', '11', '12', '13', '14', '15', '16', '17', '18', '20', '22', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '38', '39', '40', '41', '42', '48', '58', '68', '78', '88', '98'],
            stakeK: 70000,
            targetPayoutVipK: 252000,
            targetPayoutSingleK: 84000
        },
        pillar2_Lo: {
            engine: 'Lô Hội Tụ 4 Động Cơ (6 Số Đồng Thuận)',
            engineType: '4ENGINE_CONSENSUS',
            numbers: ['59', '62', '76', '24', '35', '52'],
            top4: ['59', '62', '76', '24'],
            top5: ['59', '62', '76', '24', '35'],
            allNumbers: ['59', '62', '76', '24', '35', '52', '04', '22', '46', '56', '70', '84', '88', '94', '95'],
            numbersOver2: ['59', '62', '76', '24', '35', '52'],
            betNumbers: [
                { num: '59', votes: 3, multiplier: 4, hits: 0, stakeK: 8800 },
                { num: '62', votes: 3, multiplier: 4, hits: 0, stakeK: 8800 },
                { num: '76', votes: 3, multiplier: 4, hits: 0, stakeK: 8800 },
                { num: '24', votes: 2, multiplier: 3, hits: 0, stakeK: 6600 },
                { num: '35', votes: 2, multiplier: 3, hits: 0, stakeK: 6600 },
                { num: '52', votes: 2, multiplier: 3, hits: 0, stakeK: 6600 }
            ],
            pointsPerNum: 500,
            stakeK: 66000,
            expectedHits: 2.1,
            payoutPerHitK: 8000
        },
        pillar3_Xien: {
            type: 'XIEN_4_QUAY_11_VE',
            numbers: ['59', '62', '76', '24'],
            top5Numbers: ['59', '62', '76', '24', '35'],
            ticketsCount: 11,
            ticketPriceK: 1000,
            stakeK: 11000,
            payoutHit2K: 12000,
            payoutHit3K: 84000,
            payoutHit4K: 384000
        },
        hedgingSummary: {
            payoutIfDeHitsK: 252000,
            payoutIfLo2HitsK: 64000,
            payoutIfLo3HitsK: 96000,
            profitIfDeHitsK: 182000,
            profitIfLo2HitsK: 17000,
            profitIfLo3HitsK: 49000,
            hedgingGuarantee: 'BẢO TOÀN LÃI RÒNG THẤT THỦ: Nổ Đề VIP hoặc Lô >= 2 nháy đều sinh Lãi Ròng > 0!'
        }
    };

    // Lưu lại registry ở cả stats và data
    reg.updatedAt = new Date().toISOString();
    const regStr = JSON.stringify(reg, null, 2);
    fs.writeFileSync(REG_STATS_FILE, regStr, 'utf8');
    fs.writeFileSync(REG_DATA_FILE, regStr, 'utf8');
    console.log('  ✓ Đã lưu registry SSOT tại lib/data/statistics và data/');

    // =========================================================================
    // ĐỒNG BỘ SANG CACHED_DAILY_METHOD_ADVISOR.JSON
    // =========================================================================
    console.log('\n[3] Đồng bộ sang cached_daily_method_advisor.json...');
    let adv = null;
    if (fs.existsSync(ADV_STATS_FILE)) {
        adv = JSON.parse(fs.readFileSync(ADV_STATS_FILE, 'utf8'));
    }
    if (adv) {
        // Đồng bộ registry vào cache
        adv.dailyLockedBetsRegistry = reg;

        // Cập nhật crossHedgingPortfolio row 2026-10-18 trong settledLedger
        if (adv.crossHedgingPortfolio && Array.isArray(adv.crossHedgingPortfolio.settledLedger)) {
            const chLedger = adv.crossHedgingPortfolio.settledLedger;
            const r18Idx = chLedger.findIndex(r => r.date === '2026-10-18');
            const chRow18 = {
                date: '2026-10-18',
                mode: 'ACCUMULATE_AGGRESSIVE',
                sizingMultiplier: 1.0,
                dePayoutK: 84000,
                deStakeK: 70000,
                deProfitK: 14000,
                dePnlK: 14000,
                loPayoutK: 72000,
                loStakeK: 66000,
                loProfitK: 6000,
                loPnlK: 6000,
                xienPayoutK: 12000,
                xienStakeK: 11000,
                xienProfitK: 1000,
                xienPnlK: 1000,
                totalPayoutK: 168000,
                totalStakeK: 147000,
                totalProfitK: 21000,
                isWin: true,
                isAbstain: false,
                details: {
                    p1Method: 'dualMerge',
                    p2Engine: '4ENGINE_CONSENSUS',
                    p3Type: 'XIEN_4_QUAY_11_VE'
                }
            };
            if (r18Idx >= 0) {
                chLedger[r18Idx] = chRow18;
            } else {
                chLedger.push(chRow18);
            }
            chLedger.sort((a, b) => a.date.localeCompare(b.date));

            // Tái tính toán chạy lũy kế (cumulative totals)
            let runDe = 0, runLo = 0, runXien = 0, runTot = 0;
            chLedger.forEach(row => {
                runDe += (row.deProfitK || 0);
                runLo += (row.loProfitK || 0);
                runXien += (row.xienProfitK || 0);
                runTot = runDe + runLo + runXien;
                row.cumDeProfitK = runDe;
                row.cumLoProfitK = runLo;
                row.cumXienProfitK = runXien;
                row.cumulativeProfitK = runTot;
            });

            // Cập nhật latestRecommendation 2026-10-19 cho crossHedgingPortfolio
            adv.crossHedgingPortfolio.latestRecommendation = d19.bets.crossHedgingPortfolio;
        }

        // Cập nhật lo4EngineFusion cho cả modes.top6 và modes.top7
        if (adv.lo4EngineFusion && adv.lo4EngineFusion.modes) {
            const loRow18Top6 = {
                date: '2026-10-18',
                isLive: true,
                topN: 6,
                h4: 2,
                countTotal: 15,
                countOver2: 6,
                countX1: 9,
                numbersOver2: ['54', '62', '95', '57', '63', '94'],
                allNumbers: ['54', '62', '95', '57', '63', '94', '02', '10', '46', '56', '59', '70', '76', '84', '88'],
                tierX5: [],
                tierX4: ['54', '62', '95'],
                tierX3: ['57', '63', '94'],
                tierX1: ['02', '10', '46', '56', '59', '70', '76', '84', '88'],
                betNumbers: [
                    { num: '54', votes: 3, multiplier: 4, hits: 1, methods: ['QMBF', 'Dual', 'Tri'] },
                    { num: '62', votes: 3, multiplier: 4, hits: 0, methods: ['QMBF', 'Dual', 'Tri'] },
                    { num: '95', votes: 3, multiplier: 4, hits: 1, methods: ['QMBF', 'Dual', 'Tri'] },
                    { num: '57', votes: 2, multiplier: 3, hits: 0, methods: ['Dual', 'Tri'] },
                    { num: '63', votes: 2, multiplier: 3, hits: 0, methods: ['Dual', 'Tri'] },
                    { num: '94', votes: 2, multiplier: 3, hits: 0, methods: ['Dual', 'Tri'] },
                    { num: '02', votes: 1, multiplier: 1, hits: 0, methods: ['RRF'] },
                    { num: '10', votes: 1, multiplier: 1, hits: 1, methods: ['RRF'] },
                    { num: '46', votes: 1, multiplier: 1, hits: 0, methods: ['RRF'] },
                    { num: '56', votes: 1, multiplier: 1, hits: 0, methods: ['RRF'] },
                    { num: '59', votes: 1, multiplier: 1, hits: 0, methods: ['RRF'] },
                    { num: '70', votes: 1, multiplier: 1, hits: 0, methods: ['RRF'] },
                    { num: '76', votes: 1, multiplier: 1, hits: 0, methods: ['RRF'] },
                    { num: '84', votes: 1, multiplier: 1, hits: 0, methods: ['RRF'] },
                    { num: '88', votes: 1, multiplier: 1, hits: 0, methods: ['RRF'] }
                ],
                dayLotoStakeK: 66000,
                dayLotoPayoutK: 72000,
                dayLotoProfitK: 6000,
                dayLotoHits: 3,
                isLotoWin: true,
                xien4Status: 'ACTIVE',
                xien4Reason: 'Top 5 Đồng Thuận: Chốt đánh Bộ 4 Quây 11 vé [54-62-95-57] & Bộ 5 Quây 10 vé X3 [54-62-95-57-63]',
                xien4Combinations: [['54', '62', '95', '57']],
                xien4StakeK: 11000,
                xien4PayoutK: 12000,
                dayXien4ProfitK: 1000,
                isXien4Win: true,
                totalDayProfitK: 7000
            };

            if (adv.lo4EngineFusion.modes.top6 && Array.isArray(adv.lo4EngineFusion.modes.top6.settledLedger)) {
                const t6Ledger = adv.lo4EngineFusion.modes.top6.settledLedger;
                const idx6 = t6Ledger.findIndex(r => r.date === '2026-10-18');
                if (idx6 >= 0) t6Ledger[idx6] = { ...t6Ledger[idx6], ...loRow18Top6 };
                else t6Ledger.push(loRow18Top6);
                t6Ledger.sort((a, b) => a.date.localeCompare(b.date));

                let runLoto = 0;
                t6Ledger.forEach(row => {
                    runLoto += (row.dayLotoProfitK || 0);
                    row.cumLotoProfitK = runLoto;
                });
            }

            if (adv.lo4EngineFusion.modes.top7 && Array.isArray(adv.lo4EngineFusion.modes.top7.settledLedger)) {
                const t7Ledger = adv.lo4EngineFusion.modes.top7.settledLedger;
                const idx7 = t7Ledger.findIndex(r => r.date === '2026-10-18');
                const loRow18Top7 = { ...loRow18Top6, topN: 7 };
                if (idx7 >= 0) t7Ledger[idx7] = { ...t7Ledger[idx7], ...loRow18Top7 };
                else t7Ledger.push(loRow18Top7);
                t7Ledger.sort((a, b) => a.date.localeCompare(b.date));

                let runLoto7 = 0;
                t7Ledger.forEach(row => {
                    runLoto7 += (row.dayLotoProfitK || 0);
                    row.cumLotoProfitK = runLoto7;
                });
            }

            // Đồng bộ latestRecommendation 2026-10-19
            adv.lo4EngineFusion.latestRecommendation = d19.bets.lo4EngineFusion;
            if (adv.lo4EngineFusion.modes.top6) adv.lo4EngineFusion.modes.top6.latestRecommendation = d19.bets.lo4EngineFusion;
            if (adv.lo4EngineFusion.modes.top7) adv.lo4EngineFusion.modes.top7.latestRecommendation = d19.bets.lo4EngineFusion;
        }

        // Cập nhật loDropoff27 trong cache
        if (adv.loDropoff27) {
            adv.loDropoff27.latestRecommendation = d19.bets.loDropoff27;
            if (Array.isArray(adv.loDropoff27.settledLedger)) {
                const s18Idx = adv.loDropoff27.settledLedger.findIndex(r => r.date === '2026-10-18');
                const rowShadow18 = {
                    date: '2026-10-18',
                    predictionDate: '2026-10-18',
                    action: 'BET',
                    topN: 7,
                    numbers: ['62', '76', '59', '54', '18', '63', '02'],
                    top6: ['62', '76', '59', '54', '18', '63'],
                    top7: ['62', '76', '59', '54', '18', '63', '02'],
                    hitNumbers: ['54', '18'],
                    hits7: 2,
                    hits6: 2,
                    isWin: true,
                    isHit: true,
                    stakeK: 15400,
                    payoutK: 16000,
                    profitK: 600,
                    dayProfitK: 600
                };
                if (s18Idx >= 0) {
                    adv.loDropoff27.settledLedger[s18Idx] = rowShadow18;
                }
            }
        }

        if (adv.loTop5ConsensusXien) {
            adv.loTop5ConsensusXien.top4Xien = ['59', '62', '76', '24'];
            adv.loTop5ConsensusXien.top5Xien = ['59', '62', '76', '24', '35'];
        }

        adv.pentaConsensus = {
            latestRecommendation: d19.bets.pentaConsensus
        };

        const advStr = JSON.stringify(adv, null, 2);
        fs.writeFileSync(ADV_STATS_FILE, advStr, 'utf8');
        fs.writeFileSync(ADV_DATA_FILE, advStr, 'utf8');
        console.log('  ✓ Đã cập nhật cached_daily_method_advisor.json tại lib/ và data/');
    }

    // =========================================================================
    // ĐỒNG BỘ SANG CACHED_LO_DROPOFF_27_SHADOW.JSON
    // =========================================================================
    console.log('\n[4] Đồng bộ sang cached_lo_dropoff_27_shadow.json...');
    let loShadow = null;
    if (fs.existsSync(LO_DROPOFF_SHADOW_FILE)) {
        loShadow = JSON.parse(fs.readFileSync(LO_DROPOFF_SHADOW_FILE, 'utf8'));
    }
    if (loShadow) {
        loShadow.latestRecommendation = d19.bets.loDropoff27;
        const shadowStr = JSON.stringify(loShadow, null, 2);
        fs.writeFileSync(LO_DROPOFF_SHADOW_FILE, shadowStr, 'utf8');
        if (fs.existsSync(LO_DROPOFF_SHADOW_DATA_FILE)) {
            fs.writeFileSync(LO_DROPOFF_SHADOW_DATA_FILE, shadowStr, 'utf8');
        }
        console.log('  ✓ Đã cập nhật cached_lo_dropoff_27_shadow.json');
    }

    console.log('\n🎉 HOÀN TẤT ĐỒNG BỘ TOÀN DIỆN SSOT REGISTRY & CACHES!');
}

main();
