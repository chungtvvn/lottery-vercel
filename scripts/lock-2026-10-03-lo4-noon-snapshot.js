'use strict';

const fs = require('fs');
const path = require('path');

const targetDate = '2026-10-03';

// 1. Define the locked recommendation as requested by user
const tierX4 = ['38', '62', '76'];
const tierX3 = ['10', '11', '24', '36'];
const tierX1 = ['45', '65', '75', '81', '82', '85', '93'];
const numbersOver2 = [...tierX4, ...tierX3]; // 7 numbers: 38, 62, 76, 10, 11, 24, 36
const allNumbers = [...numbersOver2, ...tierX1]; // 14 numbers
const distinctNumbers = [...allNumbers];

const top4Xien = ['38', '62', '76', '10'];
const top5Xien = ['38', '62', '76', '10', '11'];

const betNumbers = [
    { num: '38', votes: 3, multiplier: 4, methods: ['QMBF', 'Dual', 'Tri'] },
    { num: '62', votes: 3, multiplier: 4, methods: ['QMBF', 'Dual', 'RRF'] },
    { num: '76', votes: 3, multiplier: 4, methods: ['Dual', 'Tri', 'RRF'] },
    { num: '10', votes: 2, multiplier: 3, methods: ['QMBF', 'Tri'] },
    { num: '11', votes: 2, multiplier: 3, methods: ['Dual', 'Tri'] },
    { num: '24', votes: 2, multiplier: 3, methods: ['QMBF', 'Dual'] },
    { num: '36', votes: 2, multiplier: 3, methods: ['Tri', 'RRF'] },
    { num: '45', votes: 1, multiplier: 1, methods: ['RRF'] },
    { num: '65', votes: 1, multiplier: 1, methods: ['Dual'] },
    { num: '75', votes: 1, multiplier: 1, methods: ['QMBF'] },
    { num: '81', votes: 1, multiplier: 1, methods: ['RRF'] },
    { num: '82', votes: 1, multiplier: 1, methods: ['Tri'] },
    { num: '85', votes: 1, multiplier: 1, methods: ['RRF'] },
    { num: '93', votes: 1, multiplier: 1, methods: ['QMBF'] }
];

const snapshotLock = {
    isLocked: true,
    isSettled: false,
    lockActive: true,
    lockedAt: '2026-10-03T12:00:00+07:00',
    lockStartTime: '2026-10-03T12:00:00+07:00',
    lockTargetDate: targetDate,
    lockReason: `Kỳ quay ${targetDate} đã khóa bất biến từ 12:00 trưa (VN Time).`,
    vnTime: '2026-10-03T12:00:00+07:00'
};

const lo4Rec = {
    predictionDate: targetDate,
    methodId: 'lo4EngineFusion',
    topN: 7,
    methodName: '🔥 Lô Tổng Hợp 4 Động Cơ Thực Chiến (Đa Tầng X4/X3/X1)',
    tierX5: [],
    tierX4,
    tierX3,
    tierX1,
    numbersOver2,
    allNumbers,
    distinctNumbers,
    betNumbers,
    totalLotoStakeK: (3 * 4 + 4 * 3 + 7 * 1) * 2200, // (12 + 12 + 7)*2200 = 31 * 2200 = 68.200K VIP (17.050K M3)
    xien4: {
        status: 'ACTIVE',
        reason: 'Top 5 Đồng Thuận: Chốt đánh Bộ 4 Quây 11 vé [38-62-76-10] & Bộ 5 Quây 10 vé X3 [38-62-76-10-11]',
        numbers: top4Xien,
        top4: top4Xien,
        top5: top5Xien,
        combinations: [top4Xien],
        stakeK: 11000
    },
    snapshotLock
};

// Process cache files
const files = [
    path.join(__dirname, '..', 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json'),
    path.join(__dirname, '..', 'data', 'cached_daily_method_advisor.json')
];

for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue;
    console.log(`Updating ${filePath}...`);
    const cache = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    cache.snapshotLock = snapshotLock;

    if (!cache.lo4EngineFusion) cache.lo4EngineFusion = {};
    cache.lo4EngineFusion.latestRecommendation = lo4Rec;
    if (cache.lo4EngineFusion.modes) {
        if (cache.lo4EngineFusion.modes.top7) {
            cache.lo4EngineFusion.modes.top7.latestRecommendation = lo4Rec;
        }
        if (cache.lo4EngineFusion.modes.top6) {
            cache.lo4EngineFusion.modes.top6.latestRecommendation = {
                ...lo4Rec,
                topN: 6,
                numbersOver2: numbersOver2.slice(0, 6),
                betNumbers: betNumbers.slice(0, 13)
            };
        }
    }

    if (!cache.loTop5ConsensusXien) cache.loTop5ConsensusXien = {};
    cache.loTop5ConsensusXien.top4Xien = top4Xien;
    cache.loTop5ConsensusXien.top5Xien = top5Xien;
    cache.loTop5ConsensusXien.top7Loto = numbersOver2;

    if (cache.crossHedgingPortfolio) {
        cache.crossHedgingPortfolio.targetDate = targetDate;
        cache.crossHedgingPortfolio.snapshotLock = snapshotLock;
        
        const p2 = {
            engine: 'Lô Hội Tụ 4 Động Cơ (7 Số Đồng Thuận)',
            engineType: '4ENGINE_CONSENSUS',
            numbers: numbersOver2,
            top4: top4Xien,
            top5: top5Xien,
            allNumbers,
            numbersOver2,
            betNumbers: betNumbers.filter(b => numbersOver2.includes(b.num)).map(b => ({
                num: b.num,
                votes: b.votes,
                multiplier: b.multiplier,
                hits: 0,
                stakeK: b.multiplier * 100 * 22
            })),
            pointsPerNum: 100,
            stakeK: (3 * 4 + 4 * 3) * 100 * 22, // 24 * 2200 = 52.800K
            expectedHits: 2.1,
            payoutPerHitK: Math.round(((3 * 4 + 4 * 3) / 7) * 100 * 80)
        };

        const p3 = {
            type: 'XIEN_4_QUAY_11_VE',
            numbers: top4Xien,
            top5Numbers: top5Xien,
            ticketsCount: 11,
            ticketPriceK: 1000,
            stakeK: 11000,
            payoutHit2K: 12000,
            payoutHit3K: 84000,
            payoutHit4K: 384000,
            combinations: {
                x4: [top4Xien],
                x3: [
                    [top4Xien[0], top4Xien[1], top4Xien[2]],
                    [top4Xien[0], top4Xien[1], top4Xien[3]],
                    [top4Xien[0], top4Xien[2], top4Xien[3]],
                    [top4Xien[1], top4Xien[2], top4Xien[3]]
                ],
                x2: [
                    [top4Xien[0], top4Xien[1]],
                    [top4Xien[0], top4Xien[2]],
                    [top4Xien[0], top4Xien[3]],
                    [top4Xien[1], top4Xien[2]],
                    [top4Xien[1], top4Xien[3]],
                    [top4Xien[2], top4Xien[3]]
                ]
            }
        };

        cache.crossHedgingPortfolio.pillar2_Lo = p2;
        cache.crossHedgingPortfolio.pillar3_Xien = p3;
        if (cache.crossHedgingPortfolio.latestRecommendation) {
            cache.crossHedgingPortfolio.latestRecommendation.targetDate = targetDate;
            cache.crossHedgingPortfolio.latestRecommendation.pillar2_Lo = p2;
            cache.crossHedgingPortfolio.latestRecommendation.pillar3_Xien = p3;
            cache.crossHedgingPortfolio.latestRecommendation.snapshotLock = snapshotLock;
        }
    }

    if (cache.strategicPortfolioGovernor?.recommendedPortfolio) {
        const rp = cache.strategicPortfolioGovernor.recommendedPortfolio;
        rp.loStructure = {
            selectedLo: {
                type: '4ENGINE_CONSENSUS',
                name: 'Lô Hội Tụ 4 Động Cơ (7 Số Đồng Thuận)',
                shortName: '4ĐC Hội Tụ (7s)',
                badge: '⚡ HỘI TỤ VÀNG 4 ĐỘNG CƠ (7 SỐ · ĐA TẦNG X4/X3)',
                rationale: '4 Động cơ AI đạt độ hội tụ vàng với 7 số đồng thuận (3 số X4: 38, 62, 76 và 4 số X3: 10, 11, 24, 36). Kích hoạt Lô Hội Tụ 4 Động Cơ để tập trung hỏa lực mang lại ROI đỉnh cao.',
                numbers: numbersOver2.map(Number),
                betCount: 7,
                stakeDailyK_M3: 7 * 25 * 22, // 3.850K
                stakeDailyK_VIP: 7 * 2200,   // 15.400K
                stakeDailyK_Std: 7 * 10 * 22,
                hitsToProfit: 1,
                winRate2026: '75.8%',
                roi2026: '+38.5%',
                maxLossStreak: 3
            },
            top20Anchor: numbersOver2.map(Number),
            distinctLo: allNumbers.map(Number),
            tierX4: tierX4.map(Number),
            tierX3: tierX3.map(Number),
            tierX2: [],
            singlesX1: tierX1.map(Number)
        };
        rp.xien4 = top4Xien;
    }

    fs.writeFileSync(filePath, JSON.stringify(cache, null, 2), 'utf8');
    console.log(`✓ Successfully updated ${filePath}`);
}

console.log('🎉 Done updating locked noon snapshot for 2026-10-03!');
