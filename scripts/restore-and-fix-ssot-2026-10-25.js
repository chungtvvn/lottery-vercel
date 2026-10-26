'use strict';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const STATS_DIR = path.join(process.cwd(), 'lib', 'data', 'statistics');
const DATA_DIR = path.join(process.cwd(), 'data');

const REG_STATS_FILE = path.join(STATS_DIR, 'daily_locked_bets_registry.json');
const REG_DATA_FILE = path.join(DATA_DIR, 'daily_locked_bets_registry.json');
const ADV_STATS_FILE = path.join(STATS_DIR, 'cached_daily_method_advisor.json');
const ADV_DATA_FILE = path.join(DATA_DIR, 'cached_daily_method_advisor.json');

const base = String(process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL || '').replace(/\/$/, '');

async function fetchR2Json(filePath) {
    if (!base) return null;
    try {
        const res = await fetch(`${base}/${filePath}.gz?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            return JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
        }
    } catch (e) {
        console.warn(`[R2] fetch failed for ${filePath}: ${e.message}`);
    }
    return null;
}

function getR2Client() {
    const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
    if (!endpoint || !accessKeyId || !secretAccessKey) return null;
    return new S3Client({
        region: 'auto',
        endpoint,
        credentials: { accessKeyId, secretAccessKey }
    });
}

async function uploadToR2(s3, key, jsonContent) {
    const bucket = process.env.CLOUDFLARE_R2_BUCKET;
    if (!s3 || !bucket) return false;
    const jsonStr = typeof jsonContent === 'string' ? jsonContent : JSON.stringify(jsonContent, null, 2);
    const jsonBuf = Buffer.from(jsonStr, 'utf8');
    const gzBuf = zlib.gzipSync(jsonBuf);

    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: jsonBuf,
        ContentType: 'application/json'
    }));
    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: `${key}.gz`,
        Body: gzBuf,
        ContentType: 'application/json',
        ContentEncoding: 'gzip'
    }));
    console.log(`✅ Uploaded to R2: ${key} and ${key}.gz`);
    return true;
}

async function main() {
    console.log('=== KHÔI PHỤC VÀ KHÓA CHẶT SSOT CHO NGÀY 25/10/2026 ===');

    // 1. Tải registry từ R2 và local
    const r2Reg = await fetchR2Json('statistics/daily_locked_bets_registry.json');
    let localReg = null;
    if (fs.existsSync(REG_STATS_FILE)) {
        try {
            localReg = JSON.parse(fs.readFileSync(REG_STATS_FILE, 'utf8'));
        } catch (_) {}
    }

    const reg = {
        version: '1.0.0',
        description: 'Single Source of Truth (SSOT) Immutable Daily Bets and Settlement Registry',
        updatedAt: new Date().toISOString(),
        dates: {
            ...(localReg?.dates || {}),
            ...(r2Reg?.dates || {})
        }
    };

    console.log(`Loaded registry with ${Object.keys(reg.dates).length} dates.`);

    // 2. Định nghĩa chính xác bộ cược niêm phong của ngày 25/10/2026 (KHỚP 100% VỚI ẢNH THỰC TẾ)
    const prizes25 = [
        '28', '43', '45', '82', '81', '59', '81', '65', '63', '39',
        '22', '25', '01', '29', '53', '76', '98', '24', '16', '64',
        '21', '02', '86', '52', '94', '82', '67'
    ];
    const prizeCounts = {};
    prizes25.forEach(p => { prizeCounts[p] = (prizeCounts[p] || 0) + 1; });

    // Dàn Lô Ghép 4 gốc (16 số) và Lô Đột Phá X2
    const t5 = [];
    const t4 = ['64', '70'];
    const t3 = ['19', '68', '72', '94'];
    const t2Promoted = ['22', '62', '75', '79', '93'];
    const t1Remaining = ['46', '56', '84', '88', '95'];
    const t1Base = [...t2Promoted, ...t1Remaining];
    const all16Numbers = [...t4, ...t3, ...t2Promoted, ...t1Remaining];

    const betNumbers = [
        { num: '64', votes: 3, multiplier: 4, methods: ['QMBF', 'Dual', 'Tri'], hits: prizeCounts['64'] || 0 },
        { num: '70', votes: 3, multiplier: 4, methods: ['QMBF', 'Dual', 'RRF'], hits: prizeCounts['70'] || 0 },
        { num: '19', votes: 2, multiplier: 3, methods: ['Dual', 'Tri'], hits: prizeCounts['19'] || 0 },
        { num: '68', votes: 2, multiplier: 3, methods: ['Dual', 'Tri'], hits: prizeCounts['68'] || 0 },
        { num: '72', votes: 2, multiplier: 3, methods: ['Dual', 'Tri'], hits: prizeCounts['72'] || 0 },
        { num: '94', votes: 2, multiplier: 3, methods: ['Dual', 'Tri'], hits: prizeCounts['94'] || 0 },
        { num: '22', votes: 1, multiplier: 1, methods: ['QMBF'], hits: prizeCounts['22'] || 0 },
        { num: '62', votes: 1, multiplier: 1, methods: ['QMBF'], hits: prizeCounts['62'] || 0 },
        { num: '75', votes: 1, multiplier: 1, methods: ['Tri'], hits: prizeCounts['75'] || 0 },
        { num: '79', votes: 1, multiplier: 1, methods: ['QMBF'], hits: prizeCounts['79'] || 0 },
        { num: '93', votes: 1, multiplier: 1, methods: ['QMBF'], hits: prizeCounts['93'] || 0 },
        { num: '46', votes: 1, multiplier: 1, methods: ['RRF'], hits: prizeCounts['46'] || 0 },
        { num: '56', votes: 1, multiplier: 1, methods: ['RRF'], hits: prizeCounts['56'] || 0 },
        { num: '84', votes: 1, multiplier: 1, methods: ['RRF'], hits: prizeCounts['84'] || 0 },
        { num: '88', votes: 1, multiplier: 1, methods: ['RRF'], hits: prizeCounts['88'] || 0 },
        { num: '95', votes: 1, multiplier: 1, methods: ['RRF'], hits: prizeCounts['95'] || 0 }
    ];

    // Kết toán Lô Ghép 4 gốc
    let baseStakeK = 0;
    let basePayoutK = 0;
    betNumbers.forEach(b => {
        baseStakeK += b.multiplier * 2200;
        basePayoutK += b.hits * b.multiplier * 8000;
    });
    const baseProfitK = basePayoutK - baseStakeK;

    // Kết toán Lô Đột Phá X2
    let crossStakeK = 0;
    let crossPayoutK = 0;
    betNumbers.forEach(b => {
        const mult = t2Promoted.includes(b.num) ? 2 : b.multiplier;
        crossStakeK += mult * 2200;
        crossPayoutK += b.hits * mult * 8000;
    });
    const crossProfitK = crossPayoutK - crossStakeK;

    // Đề Markov & Gap Hazard
    const deNumbers = [
        '55', '70', '50', '97', '41', '40', '05', '93', '19', '94',
        '92', '20', '75', '71', '03', '79', '57', '84', '82', '89',
        '34', '47', '69', '01', '74', '68', '25', '85', '00', '95',
        '13', '16', '64', '26', '91', '78', '21', '33', '17', '28',
        '80', '48', '10'
    ];
    const deVip = ['55', '70', '50', '97', '41', '40', '05', '93', '19', '94', '92', '20', '75', '71', '03', '79', '57'];
    const deSingle = deNumbers.filter(n => !deVip.includes(n));
    const deSpecial = 28;
    const isDeHit = deNumbers.includes(String(deSpecial).padStart(2, '0'));
    const isDeVipHit = deVip.includes(String(deSpecial).padStart(2, '0'));
    const deStakeK = deVip.length * 3000 + deSingle.length * 1000; // 17*3 + 26*1 = 77M
    const dePayoutK = isDeVipHit ? 252000 : (isDeHit ? 84000 : 0);
    const deProfitK = dePayoutK - deStakeK;

    // 2 Dàn Xiên 4 Tinh Hoa
    const top8 = ['64', '22', '93', '62', '70', '79', '36', '54'];
    const dan1 = ['64', '22', '93', '62'];
    const dan2 = ['70', '79', '36', '54'];
    const h1 = dan1.filter(n => prizeCounts[n] > 0).length; // 64 (1n), 22 (1n) = 2 hits
    const h2 = dan2.filter(n => prizeCounts[n] > 0).length; // 0 hits
    const payout1 = h1 >= 4 ? 384000 : (h1 === 3 ? 84000 : (h1 === 2 ? 12000 : 0));
    const payout2 = h2 >= 4 ? 384000 : (h2 === 3 ? 84000 : (h2 === 2 ? 12000 : 0));
    const xien8PayoutK = payout1 + payout2;
    const xien8ProfitK = xien8PayoutK - 22000;

    // Xiên 4 Bộ 4 Quây (11M)
    const xien4Top4 = ['64', '70', '19', '68'];
    const xien4Hits = xien4Top4.filter(n => prizeCounts[n] > 0).length; // 64 = 1 hit
    const xien4PayoutK = xien4Hits >= 4 ? 384000 : (xien4Hits === 3 ? 84000 : (xien4Hits === 2 ? 12000 : 0));
    const xien4ProfitK = xien4PayoutK - 11000;

    const entry25 = {
        targetDate: '2026-10-25',
        isSettled: true,
        registeredAt: '2026-10-24T12:20:00.000Z',
        settledAt: '2026-10-25T18:40:00.000Z',
        actualResult: {
            special: 28,
            prizes: prizes25
        },
        bets: {
            de: {
                methodName: '🔮 Đề Markov Bậc 2 & Gap Hazard (Sweet-Spot)',
                vipNumbers: deVip,
                singleNumbers: deSingle,
                numbers: deNumbers,
                stakeK: deStakeK
            },
            lo4EngineFusion: {
                predictionDate: '2026-10-25',
                targetDate: '2026-10-25',
                methodId: 'lo4EngineFusion',
                methodName: '🔥 Lô Tổng Hợp 4 Động Cơ Thực Chiến (Top 6 Live: QMBF + Bạc Nhớ + 3 Động Cơ + RRF)',
                topN: 6,
                tierX5: t5,
                tierX4: t4,
                tierX3: t3,
                tierX1: t1Base,
                numbersOver2: [...t4, ...t3],
                allNumbers: all16Numbers,
                distinctNumbers: all16Numbers,
                betNumbers: betNumbers.map(b => ({ num: b.num, votes: b.votes, multiplier: b.multiplier, methods: b.methods })),
                totalLotoStakeK: baseStakeK,
                xien4: {
                    status: 'ACTIVE',
                    reason: 'Top 5 Đồng Thuận: Chốt đánh Bộ 4 Quây 11 vé [64-70-19-68] & Bộ 5 Quây 10 vé X3 [64-70-19-68-72]',
                    numbers: xien4Top4,
                    top4: xien4Top4,
                    top5: ['64', '70', '19', '68', '72'],
                    combinations: [xien4Top4],
                    stakeK: 11000
                },
                crossX2: {
                    tierX5: t5,
                    tierX4: t4,
                    tierX3: t3,
                    tierX2: t2Promoted,
                    tierX1: t1Remaining,
                    stakeKX2: crossStakeK,
                    promotedRationale: 'Số [22, 62, 75, 79, 93] xuất hiện ở nhóm đồng thuận cao (>= X3) bên Shadow Monitor -> Nâng lên Tier X2 (cược 4.4M/số, ăn 16M/nháy).'
                }
            },
            top8ParityXien4: {
                targetDate: '2026-10-25',
                top8,
                dan1,
                dan2,
                swapped: false,
                stakeK: 22000,
                stakePerDanK: 11000
            },
            loXien5: {
                top5: ['64', '70', '94', '19', '68'],
                stakeK: 55000
            },
            pentaConsensus: {
                xien5: {
                    top5: ['64', '70', '94', '19', '68'],
                    tickets: [
                        ['64', '70', '94', '19'],
                        ['64', '70', '94', '68'],
                        ['64', '70', '19', '68'],
                        ['64', '94', '19', '68'],
                        ['70', '94', '19', '68']
                    ],
                    stakeK: 5500
                }
            }
        },
        settlement: {
            de: {
                actualSpecial: 28,
                isHit: isDeHit,
                isVipHit: isDeVipHit,
                vipNumbers: deVip,
                singleNumbers: deSingle,
                numbers: deNumbers,
                stakeK: deStakeK,
                payoutK: dePayoutK,
                profitK: deProfitK,
                methodName: '🔮 Đề Markov Bậc 2 & Gap Hazard (Sweet-Spot)'
            },
            lo4EngineFusion: {
                actualSpecial: 28,
                totalHits: 3,
                hitNumbers: ['64', '94', '22'],
                lotoStakeK: baseStakeK,
                lotoPayoutK: basePayoutK,
                lotoProfitK: baseProfitK,
                dayLotoStakeK: baseStakeK,
                dayLotoPayoutK: basePayoutK,
                dayLotoProfitK: baseProfitK,
                tierX5: t5,
                tierX4: t4,
                tierX3: t3,
                tierX1: t1Base,
                numbersOver2: [...t4, ...t3],
                allNumbers: all16Numbers,
                betNumbers: betNumbers,
                x4Hits: xien4Hits,
                xienTop4: xien4Top4,
                xienHitsCount: xien4Hits,
                xienStakeK: 11000,
                xienPayoutK: xien4PayoutK,
                xienProfitK: xien4ProfitK,
                totalProfitK: baseProfitK + xien4ProfitK,
                crossX2: {
                    tierX5: t5,
                    tierX4: t4,
                    tierX3: t3,
                    tierX2: t2Promoted,
                    tierX1: t1Remaining,
                    dayLotoStakeKX2: crossStakeK,
                    dayLotoPayoutKX2: crossPayoutK,
                    dayLotoProfitKX2: crossProfitK,
                    dayLotoHitsKX2: 3,
                    isLotoWinX2: crossProfitK > 0,
                    promotedRationale: 'Số [22, 62, 75, 79, 93] xuất hiện ở nhóm đồng thuận cao (>= X3) bên Shadow Monitor -> Nâng lên Tier X2 (cược 4.4M/số, ăn 16M/nháy).'
                }
            },
            top8ParityXien4: {
                dan1,
                dan2,
                hits1: h1,
                hits2: h2,
                hitNums1: ['64', '22'],
                hitNums2: [],
                payout1,
                payout2,
                profit1: payout1 - 11000,
                profit2: payout2 - 11000,
                stakeK: 22000,
                dan1StakeK: 11000,
                dan2StakeK: 11000,
                payoutK: xien8PayoutK,
                profitK: xien8ProfitK,
                isWin: xien8ProfitK > 0,
                h4Count: 0,
                h3Count: 0,
                h2Count: 1
            },
            pentaConsensus: {
                xien5: {
                    top5: ['64', '70', '94', '19', '68'],
                    h5: 2,
                    stakeK: 5500,
                    payoutK: 0,
                    profitK: -5500,
                    isWin: false
                }
            }
        }
    };

    reg.dates['2026-10-25'] = entry25;

    // Lưu local
    fs.mkdirSync(STATS_DIR, { recursive: true });
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(REG_STATS_FILE, JSON.stringify(reg, null, 2), 'utf8');
    fs.writeFileSync(REG_DATA_FILE, JSON.stringify(reg, null, 2), 'utf8');
    console.log('✅ Đã ghi 2026-10-25 vào local daily_locked_bets_registry.json');

    // 3. Cập nhật cached_daily_method_advisor.json
    let advCache = await fetchR2Json('statistics/cached_daily_method_advisor.json');
    if (!advCache && fs.existsSync(ADV_STATS_FILE)) {
        try {
            advCache = JSON.parse(fs.readFileSync(ADV_STATS_FILE, 'utf8'));
        } catch (_) {}
    }

    if (advCache) {
        advCache.dailyLockedBetsRegistry = reg;
        if (!advCache.drawPrizesByDate) advCache.drawPrizesByDate = {};
        advCache.drawPrizesByDate['2026-10-25'] = {
            special: 28,
            prizes: prizes25
        };

        const lo7Ledger = advCache.lo4EngineFusion?.modes?.top7?.settledLedger || advCache.lo4EngineFusion?.settledLedger || [];
        const existingIdx = lo7Ledger.findIndex(r => r.date === '2026-10-25');
        const ledgerRow25 = {
            date: '2026-10-25',
            isLive: true,
            topN: 7,
            h4: xien4Hits,
            countTotal: all16Numbers.length,
            countOver2: t4.length + t3.length,
            countX1: t1Base.length,
            numbersOver2: [...t4, ...t3],
            allNumbers: all16Numbers,
            tierX5: t5,
            tierX4: t4,
            tierX3: t3,
            tierX1: t1Base,
            betNumbers: betNumbers,
            dayLotoStakeK: baseStakeK,
            dayLotoPayoutK: basePayoutK,
            dayLotoProfitK: baseProfitK,
            dayLotoHits: 3,
            isLotoWin: baseProfitK > 0,
            xien4Status: 'ACTIVE',
            xien4Reason: 'Top 5 Đồng Thuận: Chốt đánh Bộ 4 Quây 11 vé',
            xien4Combinations: [xien4Top4],
            xien4StakeK: 11000,
            xien4PayoutK: xien4PayoutK,
            dayXien4ProfitK: xien4ProfitK,
            isXien4Win: xien4ProfitK > 0,
            crossX2: entry25.settlement.lo4EngineFusion.crossX2,
            totalDayProfitK: baseProfitK + xien4ProfitK,
            cumLotoProfitK: 0
        };

        if (existingIdx >= 0) {
            lo7Ledger[existingIdx] = ledgerRow25;
        } else {
            lo7Ledger.push(ledgerRow25);
        }
        lo7Ledger.sort((a, b) => a.date.localeCompare(b.date));

        if (advCache.lo4EngineFusion) {
            advCache.lo4EngineFusion.settledLedger = lo7Ledger;
            if (advCache.lo4EngineFusion.modes?.top7) advCache.lo4EngineFusion.modes.top7.settledLedger = lo7Ledger;
            if (advCache.lo4EngineFusion.modes?.top6) advCache.lo4EngineFusion.modes.top6.settledLedger = lo7Ledger;
        }

        fs.writeFileSync(ADV_STATS_FILE, JSON.stringify(advCache, null, 2), 'utf8');
        try { fs.writeFileSync(ADV_DATA_FILE, JSON.stringify(advCache, null, 2), 'utf8'); } catch (_) {}
        console.log('✅ Đã đồng bộ 2026-10-25 vào cached_daily_method_advisor.json');
    }

    // 4. Upload lên R2
    const s3 = getR2Client();
    if (s3) {
        await uploadToR2(s3, 'statistics/daily_locked_bets_registry.json', reg);
        if (advCache) {
            await uploadToR2(s3, 'statistics/cached_daily_method_advisor.json', advCache);
        }
        console.log('🚀 Đã đồng bộ hoàn tất lên Cloudflare R2!');
    } else {
        console.warn('⚠️ Không có S3 client để upload R2.');
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
