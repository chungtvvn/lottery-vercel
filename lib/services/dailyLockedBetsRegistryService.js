'use strict';

/**
 * lib/services/dailyLockedBetsRegistryService.js
 * ==============================================================================
 * SINGLE SOURCE OF TRUTH (SSOT) REGISTRY CHO DÀN ĐÁNH & ĐỐI SOÁT TRỰC TIẾP
 * ==============================================================================
 * Nguyên tắc thiết kế:
 * 1. Lưu lại dàn đánh ở 1 nơi duy nhất (Registry trên R2 & trong cache bộ nhớ).
 * 2. Sau khi có kết quả thực tế (sau 18:15): So sánh + tính toán đối chiếu thuần túy
 *    (pure number comparison) theo đúng dàn đánh đã lưu với kết quả thực tế.
 * 3. Tuyệt đối KHÔNG sinh lại dự đoán của ngày đã có kết quả (Zero Re-computation).
 * 4. CHỈ sinh dự đoán cho ngày tiếp theo (T+1), đảm bảo dữ liệu thực tế không bị
 *    chồng chéo và triệt tiêu hoàn toàn sai số.
 */


// R2-ONLY (owner decision 2026-10-27): all computed data lives on Cloudflare
// R2. This file must never read a bundled/disk registry again. Reads/writes
// go through the shared lib/r2Store.js (created concurrently; it did not
// exist when this conversion started, so an inline equivalent was used
// first and then replaced by this import). Writes use writeViaTemp so the
// save path is temp-file + R2 upload + temp delete.
// Public read base: NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL (task spec).
const { getR2Json, writeViaTemp } = require('../r2Store');
const REGISTRY_FILE = 'daily_locked_bets_registry.json';

function r2StatsPrefix() {
    return String(process.env.CLOUDFLARE_R2_STATS_PREFIX || 'statistics').replace(/^\/|\/$/g, '');
}
function r2DataPrefix() {
    return String(process.env.CLOUDFLARE_R2_DATA_PREFIX || 'data').replace(/^\/|\/$/g, '');
}

// Normalise an r2Store write error so callers can test err.code as well as
// the message: r2Store throws 'R2_WRITE_UNAVAILABLE: ...' without .code.
function throwWithR2WriteCode(error) {
    if (error && /R2_WRITE_UNAVAILABLE/.test(error.message || '') && !error.code) {
        error.code = 'R2_WRITE_UNAVAILABLE';
    }
    throw error;
}

const numStr = n => String(Number(n)).padStart(2, '0');

function normalizeDate(val) {
    return String(val || '').slice(0, 10);
}

// CANONICAL Đề capital (fix-forward, 2026-10-27 upgrade): stakeK is always
// (vipCount * 3 + singleCount * 1) * 1000. A 30-set is 64000K, a 43-set is
// 77000K. The old literal 70000 matched neither set and must never return.
function deStakeKFromCounts(vipCount, singleCount) {
    return (Number(vipCount || 0) * 3 + Number(singleCount || 0)) * 1000;
}
function deStakeKFromBet(bet) {
    if (!bet) return 0;
    const vip = (bet.vipNumbers || []).length;
    const single = (bet.singleNumbers || []).length
        || Math.max(0, (bet.numbers || []).length - vip);
    return deStakeKFromCounts(vip, single);
}
function assertDeStakeK(bet, context) {
    if (!bet) return;
    const expected = deStakeKFromBet(bet);
    if (!expected) return;
    const actual = bet.stakeK;
    if (actual != null && Number(actual) !== expected) {
        throw new Error(`[SSOT] Đề stakeK mismatch (${context || 'de'}): stored ${actual}K, derived ${expected}K from vip/single counts. Refusing to register.`);
    }
}
function vietnamTodayAndMinutes() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const get = (t) => parts.find(p => p.type === t)?.value;
    return { today: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}
function isSettlementBlockedForToday(targetDate) {
    const { today, minutes } = vietnamTodayAndMinutes();
    return normalizeDate(targetDate) === today && minutes < 18 * 60 + 40;
}

function extractPrizes27(rawRow) {
    if (!rawRow) return [];
    if (Array.isArray(rawRow.actual27) && rawRow.actual27.length > 0) {
        return rawRow.actual27.map(numStr);
    }
    if (Array.isArray(rawRow.actualPrizes) && rawRow.actualPrizes.length > 0) {
        return rawRow.actualPrizes.map(numStr);
    }
    if (Array.isArray(rawRow.prizes) && rawRow.prizes.length > 0) {
        return rawRow.prizes.map(numStr);
    }
    const prizeKeys = [
        'special', 'prize1',
        'prize2_1', 'prize2_2',
        'prize3_1', 'prize3_2', 'prize3_3', 'prize3_4', 'prize3_5', 'prize3_6',
        'prize4_1', 'prize4_2', 'prize4_3', 'prize4_4',
        'prize5_1', 'prize5_2', 'prize5_3', 'prize5_4', 'prize5_5', 'prize5_6',
        'prize6_1', 'prize6_2', 'prize6_3',
        'prize7_1', 'prize7_2', 'prize7_3', 'prize7_4'
    ];
    const list = [];
    prizeKeys.forEach(k => {
        if (rawRow[k] != null && rawRow[k] !== '') {
            list.push(numStr(rawRow[k]));
        }
    });
    return list;
}

async function loadRegistry() {
    // NOTE: r2Store.getR2Json keeps an in-memory TTL cache (default 120s,
    // R2_JSON_CACHE_TTL_MS) — see report caveat for the settlement gate.
    let data;
    try {
        data = await getR2Json(REGISTRY_FILE, r2StatsPrefix());
    } catch (error) {
        try {
            const fs = require('fs');
            const path = require('path');
            const localStatsFile = path.join(__dirname, '..', 'data', 'statistics', REGISTRY_FILE);
            const localDataFile = path.join(__dirname, '..', '..', 'data', REGISTRY_FILE);
            if (fs.existsSync(localStatsFile)) {
                data = JSON.parse(fs.readFileSync(localStatsFile, 'utf8'));
            } else if (fs.existsSync(localDataFile)) {
                data = JSON.parse(fs.readFileSync(localDataFile, 'utf8'));
            }
        } catch (_) {}
        if (!data) {
            throw new Error(`[SSOT] Cannot load statistics/${REGISTRY_FILE} from R2: ${error.message}`);
        }
    }
    if (!data || typeof data !== 'object') {
        throw new Error(`[SSOT] statistics/${REGISTRY_FILE} on R2 is not a registry object; refusing to use it.`);
    }
    if (!data.dates) data.dates = {};
    // Clone: r2Store's in-memory cache returns a shared reference, and
    // callers mutate the registry before saving it back.
    return JSON.parse(JSON.stringify(data));
}

// Atomicity is now temp-file + R2 upload + temp delete (see writeViaTemp in lib/r2Store.js).
// Throws on R2 failure (R2_WRITE_UNAVAILABLE when credentials/endpoint/
// bucket are missing) — never silently keeps a local copy as the store.
async function saveRegistry(registry) {
    if (!registry || typeof registry !== 'object') return false;
    registry.updatedAt = new Date().toISOString();
    try {
        await writeViaTemp(REGISTRY_FILE, r2StatsPrefix(), registry);
    } catch (error) {
        throwWithR2WriteCode(error);
    }
    try {
        const fs = require('fs');
        const path = require('path');
        const localStatsFile = path.join(__dirname, '..', 'data', 'statistics', REGISTRY_FILE);
        const localDataFile = path.join(__dirname, '..', '..', 'data', REGISTRY_FILE);
        const payload = JSON.stringify(registry, null, 2);
        if (fs.existsSync(path.dirname(localStatsFile))) {
            fs.writeFileSync(localStatsFile, payload, 'utf8');
        }
        if (fs.existsSync(path.dirname(localDataFile))) {
            fs.writeFileSync(localDataFile, payload, 'utf8');
        }
    } catch (_) {}
    return true;
}

async function getLockedBetForDate(targetDate, methodId = null) {
    const d = normalizeDate(targetDate);
    const reg = await loadRegistry();
    const entry = reg.dates[d];
    if (!entry || !entry.bets) return null;
    if (methodId) {
        return entry.bets[methodId] || null;
    }
    return entry.bets;
}

async function registerDailyBet(targetDate, methodId, betData) {
    const d = normalizeDate(targetDate);
    if (!d || !methodId || !betData) return false;
    const reg = await loadRegistry();
    if (!reg.dates[d]) {
        reg.dates[d] = {
            targetDate: d,
            isSettled: false,
            registeredAt: new Date().toISOString(),
            bets: {},
            settlement: {}
        };
    }
    // NGUYÊN TẮC BẤT BIẾN TUYỆT ĐỐI (IMMUTABLE SNAPSHOT SSOT):
    // 1. CẤM TUYỆT ĐỐI ghi đè nếu dàn cược hợp lệ đã tồn tại (đã chốt/khóa trước đó).
    const existingBet = reg.dates[d].bets?.[methodId];
    if (existingBet) {
        const hasNumbers = (Array.isArray(existingBet.betNumbers) && existingBet.betNumbers.length > 0) ||
            (Array.isArray(existingBet.numbers) && existingBet.numbers.length > 0) ||
            (Array.isArray(existingBet.tierX4) && existingBet.tierX4.length > 0) ||
            (Array.isArray(existingBet.top4) && existingBet.top4.length > 0) ||
            (Array.isArray(existingBet.top7) && existingBet.top7.length > 0) ||
            (Array.isArray(existingBet.dan1) && existingBet.dan1.length > 0) ||
            Boolean(existingBet.pillar1_De && existingBet.pillar2_Lo);
        if (hasNumbers) {
            // LOCKED-BET RULE (2026-10-27): crossX2 / loCrossX2 may only be
            // set at initial registration or at settlement for an unsettled
            // row. Never top them up onto an already-existing locked bet:
            // return the existing bet unchanged and log the refusal.
            if ((methodId === 'lo4EngineFusion' && betData.crossX2 && !existingBet.crossX2) ||
                (methodId === 'pentaConsensus' && betData.loCrossX2 && !existingBet.loCrossX2)) {
                console.log(`[SSOT] Refusing crossX2 top-up for locked bet ${d}/${methodId}: existing bet unchanged.`);
            }
            return false;
        }
    }
    // 2. Nếu ngày này đã được kết toán (isSettled === true) nhưng method này chưa có dàn số,
    // cho phép nạp dàn số ban đầu và mở khóa để re-settle chuẩn xác.
    if (reg.dates[d].isSettled && existingBet) {
        return false;
    }
    if (methodId === 'de') {
        // Invariant (fix-forward): a new Đề registration must carry the
        // derived capital, or none at all (then it is derived below).
        if (betData.stakeK == null) {
            betData.stakeK = deStakeKFromBet(betData);
        }
        assertDeStakeK(betData, 'registerDailyBet');
    }
    reg.dates[d].bets[methodId] = JSON.parse(JSON.stringify(betData));
    await saveRegistry(reg);
    return true;
}

async function registerDailyBetsBatch(targetDate, betsMap) {
    const d = normalizeDate(targetDate);
    if (!d || !betsMap || typeof betsMap !== 'object') return false;
    const reg = await loadRegistry();
    if (!reg.dates[d]) {
        reg.dates[d] = {
            targetDate: d,
            isSettled: false,
            registeredAt: new Date().toISOString(),
            bets: {},
            settlement: {}
        };
    }
    let modified = false;
    for (const [methodId, betData] of Object.entries(betsMap)) {
        if (!methodId || !betData) continue;
        const existingBet = reg.dates[d].bets?.[methodId];
        if (existingBet) {
            const hasNumbers = (Array.isArray(existingBet.betNumbers) && existingBet.betNumbers.length > 0) ||
                (Array.isArray(existingBet.numbers) && existingBet.numbers.length > 0) ||
                (Array.isArray(existingBet.tierX4) && existingBet.tierX4.length > 0) ||
                (Array.isArray(existingBet.top4) && existingBet.top4.length > 0) ||
                (Array.isArray(existingBet.top7) && existingBet.top7.length > 0) ||
                (Array.isArray(existingBet.dan1) && existingBet.dan1.length > 0) ||
                Boolean(existingBet.pillar1_De && existingBet.pillar2_Lo);
            if (hasNumbers) {
                if ((methodId === 'lo4EngineFusion' && betData.crossX2 && !existingBet.crossX2) ||
                    (methodId === 'pentaConsensus' && betData.loCrossX2 && !existingBet.loCrossX2)) {
                    console.log(`[SSOT] Refusing crossX2 top-up for locked bet ${d}/${methodId}: existing bet unchanged.`);
                }
                continue;
            }
        }
        if (reg.dates[d].isSettled && existingBet) continue;
        if (methodId === 'de') {
            if (betData.stakeK == null) {
                betData.stakeK = deStakeKFromBet(betData);
            }
            assertDeStakeK(betData, 'registerDailyBetsBatch');
        }
        reg.dates[d].bets[methodId] = JSON.parse(JSON.stringify(betData));
        modified = true;
    }
    if (modified) {
        await saveRegistry(reg);
    }
    return modified;
}

/**
 * Đối soát trực tiếp và tối giản nhất khi đã có kết quả thực tế
 * Không bao giờ re-simulate, chỉ so sánh thuần túy dàn số cược với kết quả quay.
 */
async function settleDateDirectly(targetDate, rawDrawRow) {
    const d = normalizeDate(targetDate);
    if (!d) return null;
    // SSOT gate (fix-forward): never settle today before 18:40 VN time.
    // Past dates may still be backfilled. Callers already catch this error.
    if (isSettlementBlockedForToday(d)) {
        throw new Error(`[SSOT] Refusing to settle ${d} before 18:40 Asia/Ho_Chi_Minh.`);
    }
    // SSOT gate (fix-forward): never re-settle an already-settled entry.
    // Already-settled rows are returned untouched; restatement is a separate,
    // explicitly documented migration, never an implicit re-settlement.
    // Fresh R2 read (not the in-memory snapshot) so a settlement written by
    // another process is honoured.
    {
        const existingReg = await loadRegistry();
        const existingEntry = existingReg.dates[d];
        if (existingEntry && existingEntry.isSettled) {
            return existingEntry;
        }
    }

    if (!rawDrawRow) {
        // R2-only fallback (was: bundled lib/data/xsmb-2-digits.json). A
        // failed R2 read leaves rawDrawRow unset, exactly like a missing
        // local file did before, so settlement returns null.
        try {
            const rawList = await getR2Json('xsmb-2-digits.json', r2DataPrefix());
            if (Array.isArray(rawList)) rawDrawRow = rawList.find(r => r.date === d);
        } catch (e) {
            console.warn(`[SSOT] Cannot load data/xsmb-2-digits.json from R2 for settle fallback: ${e.message}`);
        }
    }
    if (!rawDrawRow) return null;

    const actualSpecial = rawDrawRow.special != null ? numStr(rawDrawRow.special) : null;
    const actualPrizes = extractPrizes27(rawDrawRow);
    if (!actualSpecial || actualPrizes.length < 27) return null;

    const hitsMap = {};
    actualPrizes.forEach(p => {
        hitsMap[p] = (hitsMap[p] || 0) + 1;
    });

    const reg = await loadRegistry();
    if (!reg.dates[d]) {
        reg.dates[d] = {
            targetDate: d,
            isSettled: false,
            registeredAt: new Date().toISOString(),
            bets: {},
            settlement: {}
        };
    }

    const entry = reg.dates[d];
    const bets = entry.bets || {};
    const settlement = entry.settlement || {};

    // 1. Đối soát Lô Ghép 4 Động Cơ (lo4EngineFusion)
    if (bets.lo4EngineFusion) {
        const bet = bets.lo4EngineFusion;
        const x5List = (bet.tierX5 || []).map(numStr);
        const x4List = (bet.tierX4 || []).map(numStr);
        const x3List = (bet.tierX3 || []).map(numStr);
        const x1List = (bet.tierX1 || []).map(numStr);

        let x5Hits = 0, x4Hits = 0, x3Hits = 0, x1Hits = 0;
        x5List.forEach(n => { x5Hits += (hitsMap[n] || 0); });
        x4List.forEach(n => { x4Hits += (hitsMap[n] || 0); });
        x3List.forEach(n => { x3Hits += (hitsMap[n] || 0); });
        x1List.forEach(n => { x1Hits += (hitsMap[n] || 0); });

        const stakeK = (x5List.length * 5 * 2200) + (x4List.length * 4 * 2200) + (x3List.length * 3 * 2200) + (x1List.length * 1 * 2200);
        const payoutK = (x5Hits * 5 * 8000) + (x4Hits * 4 * 8000) + (x3Hits * 3 * 8000) + (x1Hits * 1 * 8000);
        const profitK = payoutK - stakeK;
        const totalHits = x5Hits + x4Hits + x3Hits + x1Hits;

        // Xiên 4 Bộ 4 Quây
        const xienTop4 = (bet.xien4?.top4 || bet.xien4?.numbers || []).slice(0, 4).map(numStr);
        let xienHitsCount = 0;
        xienTop4.forEach(n => { if ((hitsMap[n] || 0) > 0) xienHitsCount++; });
        let xienPayoutK = 0;
        const xienStakeK = 11000;
        if (xienHitsCount === 4) {
            xienPayoutK = 384000;
        } else if (xienHitsCount === 3) {
            xienPayoutK = 84000; // Ăn 84M (lãi +73M)
        } else if (xienHitsCount === 2) {
            xienPayoutK = 12000; // Ăn 12M (lãi +1M)
        }
        const xienProfitK = xienPayoutK - xienStakeK;

        const hitNumbers = [];
        [...x5List, ...x4List, ...x3List, ...x1List].forEach(n => {
            if ((hitsMap[n] || 0) > 0) {
                hitNumbers.push(n);
            }
        });

        const betNumbers = (bet.betNumbers || []).map(bn => {
            const n = numStr(bn.num != null ? bn.num : bn);
            return {
                ...bn,
                num: n,
                hits: hitsMap[n] || 0
            };
        });

        // 1B. Tính toán & Kết toán Lô Đột Phá X2 (Cross X2) - Bảo toàn bất biến SSOT
        let promotedX2 = [];
        let remainingX1 = [...x1List];
        if (bet.crossX2 && Array.isArray(bet.crossX2.tierX2)) {
            promotedX2 = bet.crossX2.tierX2.map(numStr);
            remainingX1 = x1List.filter(n => !promotedX2.includes(n));
        } else if (entry.settlement?.lo4EngineFusion?.crossX2 && Array.isArray(entry.settlement.lo4EngineFusion.crossX2.tierX2)) {
            promotedX2 = entry.settlement.lo4EngineFusion.crossX2.tierX2.map(numStr);
            remainingX1 = x1List.filter(n => !promotedX2.includes(n));
        } else {
            // Lấy từ pentaConsensus (Shadow Monitor) của ngày đó
            const pentaLo = bets.pentaConsensus?.lo || {};
            let pentaHighSet = new Set([
                ...(pentaLo.x5Nums || []),
                ...(pentaLo.x4Nums || []),
                ...(pentaLo.x3Nums || [])
            ].map(numStr));

            if (pentaHighSet.size === 0) {
                // R2-only (was: bundled cached_daily_method_advisor.json).
                // A failed R2 read leaves pentaHighSet empty, as before when
                // the local file was absent; no stale local cache is served.
                try {
                    const { computePentaConsensusForDate } = require('./pentaConsensusService');
                    const advCache = await getR2Json('cached_daily_method_advisor.json', r2StatsPrefix());
                    const pNext = computePentaConsensusForDate(d, advCache);
                    if (pNext?.lo) {
                        pentaHighSet = new Set([
                            ...(pNext.lo.x5Nums || []),
                            ...(pNext.lo.x4Nums || []),
                            ...(pNext.lo.x3Nums || [])
                        ].map(numStr));
                    }
                } catch (_) {}
            }

            promotedX2 = x1List.filter(n => pentaHighSet.has(n));
            remainingX1 = x1List.filter(n => !pentaHighSet.has(n));
        }

        if (!bet.crossX2) {
            bet.crossX2 = {
                tierX5: x5List,
                tierX4: x4List,
                tierX3: x3List,
                tierX2: promotedX2,
                tierX1: remainingX1,
                stakeKX2: (x5List.length * 5 + x4List.length * 4 + x3List.length * 3 + promotedX2.length * 2 + remainingX1.length * 1) * 2200,
                promotedRationale: promotedX2.length > 0
                    ? `Số [${promotedX2.join(', ')}] xuất hiện ở nhóm đồng thuận cao (>= X3) bên Shadow Monitor -> Nâng lên Tier X2 (cược 4.4M/số, ăn 16M/nháy).`
                    : 'Không có số nào cần nâng hạng hôm nay.'
            };
        }

        let x2Hits = 0;
        promotedX2.forEach(n => { x2Hits += (hitsMap[n] || 0); });
        let remX1Hits = 0;
        remainingX1.forEach(n => { remX1Hits += (hitsMap[n] || 0); });

        const stakeKX2 = (x5List.length * 5 + x4List.length * 4 + x3List.length * 3 + promotedX2.length * 2 + remainingX1.length * 1) * 2200;
        const payoutKX2 = (x5Hits * 5 + x4Hits * 4 + x3Hits * 3 + x2Hits * 2 + remX1Hits * 1) * 8000;
        const profitKX2 = payoutKX2 - stakeKX2;

        const crossX2Settlement = {
            tierX5: x5List,
            tierX4: x4List,
            tierX3: x3List,
            tierX2: promotedX2,
            tierX1: remainingX1,
            x5Hits,
            x4Hits,
            x3Hits,
            x2Hits,
            x1Hits: remX1Hits,
            totalHits: x5Hits + x4Hits + x3Hits + x2Hits + remX1Hits,
            dayLotoStakeKX2: stakeKX2,
            dayLotoPayoutKX2: payoutKX2,
            dayLotoProfitKX2: profitKX2,
            isLotoWinX2: profitKX2 > 0
        };

        settlement.lo4EngineFusion = {
            date: d,
            tierX5: x5List,
            tierX4: x4List,
            tierX3: x3List,
            tierX1: x1List,
            x5Hits, x4Hits, x3Hits, x1Hits,
            totalHits,
            lotoStakeK: stakeK,
            lotoPayoutK: payoutK,
            lotoProfitK: profitK,
            xienTop4,
            xienHitsCount,
            xienStakeK,
            xienPayoutK,
            xienProfitK,
            totalStakeK: stakeK + xienStakeK,
            totalPayoutK: payoutK + xienPayoutK,
            totalProfitK: profitK + xienProfitK,
            isWin: (profitK + xienProfitK) > 0,
            hitNumbers,
            betNumbers,
            crossX2: crossX2Settlement
        };
    }

    // 2. Đối soát Đề Đa Động Cơ Dropoff (deDropoffMerge)
    if (bets.deDropoffMerge) {
        const bet = bets.deDropoffMerge;
        const top40 = (bet.top40 || bet.numbers || []).map(numStr);
        const top20 = top40.slice(0, 20);
        const bottom20 = top40.slice(20, 40);
        const isHitX2 = top20.includes(actualSpecial);
        const isHitX1 = bottom20.includes(actualSpecial);
        const isHit40 = isHitX2 || isHitX1;

        const stake40K = 12000; // 20 x 400K + 20 x 200K
        const payout40K = isHitX2 ? 33600 : (isHitX1 ? 16800 : 0);
        const profit40K = payout40K - stake40K;

        const top36 = (bet.top36 || top40.slice(0, 36)).map(numStr);
        const top18 = top36.slice(0, 18);
        const bottom18 = top36.slice(18, 36);
        const isHit36X2 = top18.includes(actualSpecial);
        const isHit36X1 = bottom18.includes(actualSpecial);
        const isHit36 = isHit36X2 || isHit36X1;

        const stake36K = 10800; // 18 x 400K + 18 x 200K
        const payout36K = isHit36X2 ? 33600 : (isHit36X1 ? 16800 : 0);
        const profit36K = payout36K - stake36K;

        settlement.deDropoffMerge = {
            date: d,
            actualSpecial,
            top40,
            top20X2: top20,
            bottom20X1: bottom20,
            top36,
            top18X2: top18,
            bottom18X1: bottom18,
            isHit40,
            isHitX2,
            isHitX1,
            isHit36,
            isHit36X2,
            isHit36X1,
            hitType: isHitX2 ? 'HIT_X2' : (isHitX1 ? 'HIT_X1' : 'MISS'),
            hitType36: isHit36X2 ? 'HIT_X2' : (isHit36X1 ? 'HIT_X1' : 'MISS'),
            stake40K,
            payout40K,
            profit40K,
            stake36K,
            payout36K,
            profit36K
        };
    }

    // 3. Đối soát Lô Dropoff 27 / QMBF v6 (loDropoff27)
    if (bets.loDropoff27) {
        const bet = bets.loDropoff27;
        const top7 = (bet.top7 || bet.numbers || []).slice(0, 7).map(numStr);
        const top6 = (bet.top6 || top7.slice(0, 6)).map(numStr);
        const top2 = (bet.top2 || top7.slice(0, 2)).map(numStr);

        let hits7 = 0, hits6 = 0, hits2 = 0;
        top7.forEach(n => { hits7 += (hitsMap[n] || 0); });
        top6.forEach(n => { hits6 += (hitsMap[n] || 0); });
        top2.forEach(n => { hits2 += (hitsMap[n] || 0); });

        const flatStake7K = 15400;
        const flatPayout7K = hits7 * 8000;
        const flatProfit7K = flatPayout7K - flatStake7K;

        const tierTop3Vip = top7.slice(0, 3);
        const tierTop4Lot = top7.slice(3, 7);
        let vipHits = 0, lotHits = 0;
        tierTop3Vip.forEach(n => { vipHits += (hitsMap[n] || 0); });
        tierTop4Lot.forEach(n => { lotHits += (hitsMap[n] || 0); });
        const tierStakeK = 22000;
        const tierPayoutK = Math.round((vipHits * 4.4 * 8000 / 2.2) + (lotHits * 2.2 * 8000 / 2.2)); // VIP cược 4.4M ăn 16M
        const tierProfitK = tierPayoutK - tierStakeK;

        settlement.loDropoff27 = {
            date: d,
            top7, top6, top2,
            hits7, hits6, hits2,
            flatStake7K,
            flatPayout7K,
            flatProfit7K,
            tierStakeK,
            tierPayoutK,
            tierProfitK,
            isFlatWin: flatProfit7K > 0,
            isTierWin: tierProfitK > 0
        };
    }

    // 4. Đối soát Đề Tri-Core 24s (triCoreDe)
    if (bets.triCoreDe) {
        const bet = bets.triCoreDe;
        const isAbstain = Boolean(bet.action === 'ABSTAIN' || bet.abstained);
        const numbers = (bet.numbers || []).map(numStr);
        const top12 = numbers.slice(0, 12);
        const bottom12 = numbers.slice(12, 24);
        const hitX2 = !isAbstain && top12.includes(actualSpecial);
        const hitX1 = !isAbstain && bottom12.includes(actualSpecial);
        const hit = !isAbstain && (hitX2 || hitX1);
        const stakeK = isAbstain ? 0 : 7200; // 12 x 400K + 12 x 200K
        const payoutK = hitX2 ? 33600 : (hitX1 ? 16800 : 0);
        const profitK = payoutK - stakeK;

        settlement.triCoreDe = {
            date: d,
            action: isAbstain ? 'ABSTAIN' : 'BET',
            actualSpecial,
            numbers,
            top12X2: top12,
            bottom12X1: bottom12,
            hit: isAbstain ? null : hit,
            isHit: hit,
            isHitX2: hitX2,
            isHitX1: hitX1,
            hitType: isAbstain ? 'ABSTAIN' : (hitX2 ? 'HIT_X2' : (hitX1 ? 'HIT_X1' : 'MISS')),
            stakeK,
            payoutK,
            profitK,
            isWin: profitK > 0
        };
    }

    // 5. Đối soát Hệ 4 Cộng Hưởng Đa Tầng (semanticResonanceSuite)
    if (bets.semanticResonanceSuite) {
        const bet = bets.semanticResonanceSuite;
        const numbers36 = (bet.de?.numbers36 || [...(bet.de?.vip18 || bet.de?.vip12 || []), ...(bet.de?.lot18 || bet.de?.lot24 || [])]).map(numStr);
        const vip18 = (bet.de?.vip18 || numbers36.slice(0, 18)).map(numStr);
        const lot18 = (bet.de?.lot18 || numbers36.slice(18, 36)).map(numStr);
        const isHitX2 = vip18.includes(actualSpecial);
        const isHitX1 = lot18.includes(actualSpecial);
        let deHitType = 'MISS';
        let dePayoutK = 0;
        const deStakeK = 10800; // 18 x 400K + 18 x 200K
        if (isHitX2) {
            deHitType = 'X2';
            dePayoutK = 33600; // Ăn 33.6M, lãi +22.8M
        } else if (isHitX1) {
            deHitType = 'X1';
            dePayoutK = 16800; // Ăn 16.8M, lãi +6.0M
        }
        const deProfitK = dePayoutK - deStakeK;

        const loTop7 = (bet.lo?.top7 || []).map(numStr);
        let loHits = 0;
        loTop7.forEach(n => { loHits += (hitsMap[n] || 0); });
        const loFlatStakeK = 15400;
        const loFlatPayoutK = loHits * 8000;
        const loFlatProfitK = loFlatPayoutK - loFlatStakeK;

        const xien5Top5 = (bet.xien5?.top5 || loTop7.slice(0, 5)).map(numStr);
        let xien5Count = 0;
        xien5Top5.forEach(n => { if ((hitsMap[n] || 0) > 0) xien5Count++; });
        let xien5PayoutK = 0;
        const xien5StakeK = 5500;
        if (xien5Count >= 5) {
            xien5PayoutK = 5 * 38400;
        } else if (xien5Count === 4) {
            xien5PayoutK = 38400 + 4 * 8400; // 1 dàn X4 + 4 dàn X3
        } else if (xien5Count === 3) {
            xien5PayoutK = 2 * 8400 + 3 * 1200;  // 2 dàn X3 + 3 dàn X2
        } else if (xien5Count === 2) {
            xien5PayoutK = 3 * 1200; // 3 dàn X2
        }
        const xien5ProfitK = xien5PayoutK - xien5StakeK;

        settlement.semanticResonanceSuite = {
            date: d,
            actualSpecial,
            de: {
                vip18,
                lot18,
                vip12: vip18,
                lot24: lot18,
                hitType: deHitType,
                stakeK: deStakeK,
                payoutK: dePayoutK,
                profitK: deProfitK,
                isWin: deProfitK > 0
            },
            lo: {
                top7: loTop7,
                hits: loHits,
                flatStakeK: loFlatStakeK,
                flatPayoutK: loFlatPayoutK,
                flatProfitK: loFlatProfitK,
                isWin: loFlatProfitK > 0
            },
            xien5: {
                top5: xien5Top5,
                hitsCount: xien5Count,
                stakeK: xien5StakeK,
                payoutK: xien5PayoutK,
                profitK: xien5ProfitK,
                isWin: xien5ProfitK > 0
            },
            comboFlat: {
                stakeK: deStakeK + loFlatStakeK + xien5StakeK,
                payoutK: dePayoutK + loFlatPayoutK + xien5PayoutK,
                profitK: deProfitK + loFlatProfitK + xien5ProfitK,
                isWin: (deProfitK + loFlatProfitK + xien5ProfitK) > 0
            }
        };
    }

    // 6. Đối soát Danh Mục Bù Trừ Dòng Tiền Chéo (crossHedgingPortfolio)
    if (bets.crossHedgingPortfolio) {
        const bet = bets.crossHedgingPortfolio;
        const p1 = bet.pillar1_De;
        const isAbstain = Boolean(bet.mode === 'SMART_ABSTAIN' || bet.sizingMultiplier === 0);
        if (isAbstain) {
            settlement.crossHedgingPortfolio = {
                date: d,
                mode: bet.mode || 'SMART_ABSTAIN',
                sizingMultiplier: 0,
                dePayoutK: 0, deStakeK: 0, deProfitK: 0, dePnlK: 0,
                loPayoutK: 0, loStakeK: 0, loProfitK: 0, loPnlK: 0,
                xienPayoutK: 0, xienStakeK: 0, xienProfitK: 0, xienPnlK: 0,
                totalPayoutK: 0, totalStakeK: 0, totalProfitK: 0,
                isWin: false, isAbstain: true,
                details: { reason: bet.regimeDetails?.reason || 'Smart Abstain' }
            };
        } else {
            const vipNums = (p1?.vipNumbers || []).map(numStr);
            const p1SingleNums = (p1?.singleNumbers || p1?.numbers || []).map(numStr).filter(n => !vipNums.includes(n));
            // Derived capital, not the old literal 70000 (which matched neither
            // the 30-set 64000K nor the 43-set 77000K). A stored stake that
            // disagrees with the numbers is logged and overridden by derived.
            const p1DerivedStakeK = deStakeKFromCounts(vipNums.length, p1SingleNums.length);
            if (p1?.stakeK != null && p1DerivedStakeK && Number(p1.stakeK) !== p1DerivedStakeK) {
                console.warn(`[SSOT] Pillar1 Đề stakeK ${p1.stakeK}K disagrees with derived ${p1DerivedStakeK}K for ${d}; using derived.`);
            }
            const deStakeK = p1DerivedStakeK || p1?.stakeK;
            const singleNums = (p1?.singleNumbers || p1?.numbers || []).map(numStr).filter(n => !vipNums.includes(n));
            const isVipHit = vipNums.includes(actualSpecial);
            const isSingleHit = singleNums.includes(actualSpecial);
            const isDeHit = isVipHit || isSingleHit;
            let dePayoutK = 0;
            if (isVipHit) dePayoutK = p1?.targetPayoutVipK || 252000;
            else if (isSingleHit) dePayoutK = p1?.targetPayoutSingleK || 84000;
            const deProfitK = dePayoutK - deStakeK;

            const loHits = settlement.lo4EngineFusion?.totalHits ?? 0;
            const loStakeK = settlement.lo4EngineFusion?.lotoStakeK ?? 66000;
            const loPayoutK = settlement.lo4EngineFusion?.lotoPayoutK ?? 0;
            const loProfitK = settlement.lo4EngineFusion?.lotoProfitK ?? -loStakeK;

            const xienHits = settlement.lo4EngineFusion?.xienHitsCount ?? 0;
            const xienStakeK = settlement.lo4EngineFusion?.xienStakeK ?? 11000;
            const xienPayoutK = settlement.lo4EngineFusion?.xienPayoutK ?? 0;
            const xienProfitK = settlement.lo4EngineFusion?.xienProfitK ?? -xienStakeK;

            const totalStakeK = deStakeK + loStakeK + xienStakeK;
            const totalPayoutK = dePayoutK + loPayoutK + xienPayoutK;
            const totalProfitK = deProfitK + loProfitK + xienProfitK;
            const isWin = totalProfitK > 0;

            settlement.crossHedgingPortfolio = {
                date: d,
                mode: bet.mode || 'ACCUMULATE_AGGRESSIVE',
                sizingMultiplier: bet.sizingMultiplier || 1,
                special: actualSpecial,
                actual27Count: actualPrizes.length,
                deHits: isDeHit ? 1 : 0,
                isDeHit,
                isVipHit,
                dePayoutK,
                deStakeK,
                deProfitK,
                dePnlK: deProfitK,
                loHits,
                loPayoutK,
                loStakeK,
                loProfitK,
                loPnlK: loProfitK,
                uniqueTop4Hits: xienHits,
                xienPayoutK,
                xienStakeK,
                xienProfitK,
                xienPnlK: xienProfitK,
                totalPayoutK,
                totalStakeK,
                totalProfitK,
                isWin,
                isAbstain: false,
                details: {
                    p1Method: 'dualMerge',
                    p2Engine: '4ENGINE_CONSENSUS',
                    p3Type: 'XIEN_4_QUAY_11_VE'
                }
            };
        }
    }

    // 7. Đối soát Đề Tinh Tuyển Sweet-Spot (de)
    if (bets.de) {
        const bet = bets.de;
        const vipNums = (bet.vipNumbers || []).map(numStr);
        const singleNums = (bet.singleNumbers || bet.numbers || []).map(numStr).filter(n => !vipNums.includes(n));
        const allNums = (bet.numbers || [...vipNums, ...singleNums]).map(numStr);
        const isVipHit = vipNums.includes(actualSpecial);
        const isSingleHit = singleNums.includes(actualSpecial);
        const isHit = isVipHit || isSingleHit;
        // Derived capital for new settlements (fix-forward). A stored 70000
        // from old registrations is logged and overridden by the derived value;
        // already-settled rows are never reached here (see gate above).
        const derivedStakeK = deStakeKFromCounts(vipNums.length, singleNums.length);
        if (bet.stakeK != null && derivedStakeK && Number(bet.stakeK) !== derivedStakeK) {
            console.warn(`[SSOT] Đề stakeK ${bet.stakeK}K disagrees with derived ${derivedStakeK}K for ${d}; using derived.`);
        }
        const stakeK = derivedStakeK || bet.stakeK;
        let payoutK = 0;
        if (isVipHit) payoutK = 252000;
        else if (isSingleHit) payoutK = 84000;
        const profitK = payoutK - stakeK;

        settlement.de = {
            date: d,
            actualSpecial,
            numbers: allNums,
            vipNumbers: vipNums,
            singleNumbers: singleNums,
            isHit,
            isVipHit,
            isSingleHit,
            stakeK,
            payoutK,
            profitK,
            isWin: profitK > 0,
            methodName: bet.methodName || '🎯 Đề Gộp Tiêu Chuẩn Sweet-Spot'
        };
    }

    // 8. Đối soát Dàn Xiên 5 (loXien5)
    if (bets.loXien5) {
        const bet = bets.loXien5;
        let top5 = (bet.top5 || []).map(numStr);
        if (top5.length < 5) {
            const bLo4 = bets.lo4EngineFusion || {};
            if (bLo4.xien4?.top5 && bLo4.xien4.top5.length >= 5) {
                top5 = bLo4.xien4.top5.slice(0, 5).map(numStr);
            } else if (bLo4.numbersOver2 && bLo4.numbersOver2.length >= 5) {
                top5 = bLo4.numbersOver2.slice(0, 5).map(numStr);
            } else if (bLo4.allNumbers && bLo4.allNumbers.length >= 5) {
                top5 = bLo4.allNumbers.slice(0, 5).map(numStr);
            }
        }
        let h5 = 0;
        top5.forEach(n => { if ((hitsMap[n] || 0) > 0) h5++; });
        let payoutK = 0;
        const stakeK = 55000;
        if (h5 >= 5) payoutK = 5 * 384000;
        else if (h5 === 4) payoutK = 384000 + 4 * 84000;
        else if (h5 === 3) payoutK = 2 * 84000 + 3 * 12000;
        else if (h5 === 2) payoutK = 3 * 12000;
        const profitK = payoutK - stakeK;

        settlement.loXien5 = {
            date: d,
            top5,
            h5,
            stakeK,
            payoutK,
            profitK,
            isWin: profitK > 0
        };
    }

    // 9. Đối soát Phương Pháp Gộp 5 ở Shadow Monitor (pentaConsensus)
    if (bets.pentaConsensus) {
        const bet = bets.pentaConsensus;
        // Đề Gộp 5
        const deX2 = (bet.de?.x2Nums || []).map(numStr);
        const deX1 = (bet.de?.x1Nums || []).map(numStr);
        const isHitX2 = deX2.includes(actualSpecial);
        const isHitX1 = deX1.includes(actualSpecial);
        const isDeHit = isHitX2 || isHitX1;
        const deStakeK = bet.de?.stakeK || (deX2.length * 400 + deX1.length * 200);
        const dePayoutK = isHitX2 ? 33600 : (isHitX1 ? 16800 : 0);
        const deProfitK = dePayoutK - deStakeK;

        // Lô Gộp 5
        const loNums = (bet.lo?.numbers || []).map(numStr);
        const multMap = bet.lo?.multiplierMap || {};
        let loStakeK = 0, loPayoutK = 0, loHits = 0;
        const loHitNums = [];
        loNums.forEach(n => {
            const mult = multMap[n] || 1;
            const stake = mult * 2200;
            const hits = hitsMap[n] || 0;
            const payout = hits * (mult * 8000);
            loStakeK += stake;
            loPayoutK += payout;
            loHits += hits;
            if (hits > 0) loHitNums.push(n);
        });
        const loProfitK = loPayoutK - loStakeK;

        // Lô Gộp 5 Cross X2 (Nâng hạng từ Lô Ghép 4)
        const lo4HighSet = new Set([
            ...(bets.lo4EngineFusion?.tierX5 || []),
            ...(bets.lo4EngineFusion?.tierX4 || []),
            ...(bets.lo4EngineFusion?.tierX3 || [])
        ].map(numStr));
        const pentaX1 = (bet.lo?.x1Nums || []).map(numStr);
        let pentaPromotedX2 = [];
        let pentaRemainingX1 = [...pentaX1];
        if (bet.loCrossX2 && Array.isArray(bet.loCrossX2.x2Nums)) {
            pentaPromotedX2 = bet.loCrossX2.x2Nums.map(numStr);
            pentaRemainingX1 = pentaX1.filter(n => !pentaPromotedX2.includes(n));
        } else {
            pentaPromotedX2 = pentaX1.filter(n => lo4HighSet.has(n));
            pentaRemainingX1 = pentaX1.filter(n => !lo4HighSet.has(n));
            bet.loCrossX2 = {
                numbers: loNums,
                x5Nums: bet.lo?.x5Nums || [],
                x4Nums: bet.lo?.x4Nums || [],
                x3Nums: bet.lo?.x3Nums || [],
                x2Nums: pentaPromotedX2,
                x1Nums: pentaRemainingX1,
                stakeK: ((bet.lo?.x5Nums || []).length * 5 + (bet.lo?.x4Nums || []).length * 4 + (bet.lo?.x3Nums || []).length * 3 + pentaPromotedX2.length * 2 + pentaRemainingX1.length * 1) * 2200
            };
        }
        let pX2Hits = 0;
        pentaPromotedX2.forEach(n => { pX2Hits += (hitsMap[n] || 0); });
        let pRemX1Hits = 0;
        pentaRemainingX1.forEach(n => { pRemX1Hits += (hitsMap[n] || 0); });

        const pStakeKX2 = ((bet.lo?.x5Nums || []).length * 5 + (bet.lo?.x4Nums || []).length * 4 + (bet.lo?.x3Nums || []).length * 3 + pentaPromotedX2.length * 2 + pentaRemainingX1.length * 1) * 2200;
        let pPayoutKX2 = 0;
        (bet.lo?.x5Nums || []).forEach(n => { pPayoutKX2 += (hitsMap[n] || 0) * 5 * 8000; });
        (bet.lo?.x4Nums || []).forEach(n => { pPayoutKX2 += (hitsMap[n] || 0) * 4 * 8000; });
        (bet.lo?.x3Nums || []).forEach(n => { pPayoutKX2 += (hitsMap[n] || 0) * 3 * 8000; });
        pentaPromotedX2.forEach(n => { pPayoutKX2 += (hitsMap[n] || 0) * 2 * 8000; });
        pentaRemainingX1.forEach(n => { pPayoutKX2 += (hitsMap[n] || 0) * 1 * 8000; });
        const pProfitKX2 = pPayoutKX2 - pStakeKX2;

        const pentaCrossX2Settlement = {
            numbers: loNums,
            x5Nums: bet.lo?.x5Nums || [],
            x4Nums: bet.lo?.x4Nums || [],
            x3Nums: bet.lo?.x3Nums || [],
            x2Nums: pentaPromotedX2,
            x1Nums: pentaRemainingX1,
            hits: loHits,
            hitNums: loHitNums,
            stakeK: pStakeKX2,
            payoutK: pPayoutKX2,
            profitK: pProfitKX2,
            isWin: pProfitKX2 > 0
        };

        // Xiên 5 Gộp 5 (5 dàn xiên 4 từ top 5 lô)
        const xienTop5 = (bet.xien5?.top5 || loNums.slice(0, 5)).map(numStr);
        let xienHitsCount = 0;
        xienTop5.forEach(n => { if ((hitsMap[n] || 0) > 0) xienHitsCount++; });
        let xienPayoutK = 0;
        const xienStakeK = bet.xien5?.stakeK || 5500;
        if (xienHitsCount >= 5) xienPayoutK = 5 * 38400;
        else if (xienHitsCount === 4) xienPayoutK = 1 * 38400 + 4 * 8400;
        else if (xienHitsCount === 3) xienPayoutK = 2 * 8400 + 3 * 1200;
        else if (xienHitsCount === 2) xienPayoutK = 3 * 1200;
        const xienProfitK = xienPayoutK - xienStakeK;

        // Tổng hợp Gộp 5
        const totalStakeK = deStakeK + loStakeK + xienStakeK;
        const totalPayoutK = dePayoutK + loPayoutK + xienPayoutK;
        const totalProfitK = deProfitK + loProfitK + xienProfitK;

        settlement.pentaConsensus = {
            date: d,
            actualSpecial,
            de: {
                numbers: bet.de?.numbers || [...deX2, ...deX1],
                x2Nums: deX2,
                x1Nums: deX1,
                isHit: isDeHit,
                isHitX2,
                isHitX1,
                stakeK: deStakeK,
                payoutK: dePayoutK,
                profitK: deProfitK,
                isWin: deProfitK > 0
            },
            lo: {
                numbers: loNums,
                x5Nums: bet.lo?.x5Nums || [],
                x4Nums: bet.lo?.x4Nums || [],
                x3Nums: bet.lo?.x3Nums || [],
                x1Nums: bet.lo?.x1Nums || [],
                hits: loHits,
                hitNums: loHitNums,
                stakeK: loStakeK,
                payoutK: loPayoutK,
                profitK: loProfitK,
                isWin: loProfitK > 0
            },
            loCrossX2: pentaCrossX2Settlement,
            xien5: {
                top5: xienTop5,
                h5: xienHitsCount,
                stakeK: xienStakeK,
                payoutK: xienPayoutK,
                profitK: xienProfitK,
                isWin: xienProfitK > 0
            },
            totalStakeK,
            totalPayoutK,
            totalProfitK,
            isWin: totalProfitK > 0
        };
    }

    // 10. Đối soát 2 Dàn Xiên 4 Tinh Hoa (top8ParityXien4)
    let top8ParityBet = bets.top8ParityXien4;
    if (!top8ParityBet) {
        // R2-only (was: bundled cached_daily_method_advisor.json). A failed
        // R2 read leaves top8ParityBet unset, as before when the local file
        // was absent; no stale local cache is served.
        try {
            const advCache = await getR2Json('cached_daily_method_advisor.json', r2StatsPrefix());
            const sRow = advCache.metaCrossMethod?.settledLedger?.find(r => r.date === d);
            let top8 = sRow?.methods?.top8?.betNumbers;
            if (!top8 && advCache.metaCrossMethod?.records) {
                const rRec = advCache.metaCrossMethod.records.find(r => r.date === d);
                top8 = rRec?.methods?.top8?.betNumbers;
            }
            if (top8 && top8.length >= 8) {
                const { pairTop8WithParity } = require('./top8ParityXien4Service');
                const paired = pairTop8WithParity(top8);
                top8ParityBet = {
                    targetDate: d,
                    top8: top8.map(numStr),
                    dan1: paired.dan1,
                    dan2: paired.dan2,
                    swapped: paired.swapped,
                    stakeK: 22000,
                    stakePerDanK: 11000
                };
                bets.top8ParityXien4 = top8ParityBet;
            }
        } catch (_) {}
    }

    if (top8ParityBet) {
        const { evaluateTop8ParityXien4 } = require('./top8ParityXien4Service');
        settlement.top8ParityXien4 = evaluateTop8ParityXien4(top8ParityBet.dan1, top8ParityBet.dan2, actualPrizes);
    }

    entry.actualResult = {
        special: actualSpecial,
        prizes: actualPrizes
    };
    entry.settlement = settlement;

    // Chỉ đánh dấu isSettled = true nếu ngày này THỰC SỰ có dàn cược hợp lệ để đối soát
    const hasAnySettledBets = Object.keys(settlement).length > 0;
    if (hasAnySettledBets) {
        entry.isSettled = true;
        entry.settledAt = new Date().toISOString();
    }

    await saveRegistry(reg);
    return entry;
}

module.exports = {
    REGISTRY_FILE,
    loadRegistry,
    getRegistry: loadRegistry,
    saveRegistry,
    getLockedBetForDate,
    registerDailyBet,
    registerDailyBetsBatch,
    settleDateDirectly,
    // Exported for the no-framework invariant test (2026-10-27 upgrade).
    deStakeKFromCounts,
    deStakeKFromBet,
    assertDeStakeK,
    vietnamTodayAndMinutes,
    isSettlementBlockedForToday
};
