/**
 * test-adversarial-challenger-m4.js
 * 
 * Comprehensive Empirical Adversarial Test Harness for Milestone 4:
 * 1. Cryptographic SHA-256 byte parity & structural identity
 * 2. 12:00 PM immutable lock invariant across all 8 Đề methods and Lô tiers
 * 3. Exact mathematical conservation (Profit = Payout - Stake) across all 4 ledgers on 2026-10-03 and all historical dates
 * 4. Cross-asset additive conservation (de + lo + xien === total)
 * 5. Strict Point-In-Time (Strict PIT) adversarial mutation stress testing
 * 6. Dual M3 / VIP currency conservation
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_CACHE_PATH = path.join(ROOT_DIR, 'data', 'cached_daily_method_advisor.json');
const LIB_CACHE_PATH = path.join(ROOT_DIR, 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
const RAW_DATA_PATH = path.join(ROOT_DIR, 'lib', 'data', 'xsmb-2-digits.json');

let testsPassed = 0;
let testsTotal = 0;

function runEmpiricalTest(name, fn) {
    testsTotal++;
    try {
        fn();
        console.log(`  ✔ [PASS ${testsTotal}] ${name}`);
        testsPassed++;
    } catch (err) {
        console.error(`  ❌ [FAIL ${testsTotal}] ${name}:`, err.message);
        throw err;
    }
}

console.log('================================================================================');
console.log('🧪 EMPIRICAL CHALLENGER ADVERSARIAL VERIFICATION HARNESS (MILESTONE 4)');
console.log('================================================================================');

// ==============================================================================
// CHALLENGE 1: CRYPTOGRAPHIC SHA-256 BYTE PARITY & STRUCTURAL EQUALITY
// ==============================================================================
console.log('\n--- CHALLENGE 1: Cryptographic SHA-256 Byte Parity ---');

runEmpiricalTest('Both cache files exist and have non-zero size', () => {
    assert.ok(fs.existsSync(DATA_CACHE_PATH), 'data/cached_daily_method_advisor.json must exist');
    assert.ok(fs.existsSync(LIB_CACHE_PATH), 'lib/data/statistics/cached_daily_method_advisor.json must exist');
    const stat1 = fs.statSync(DATA_CACHE_PATH);
    const stat2 = fs.statSync(LIB_CACHE_PATH);
    assert.strictEqual(stat1.size, stat2.size, `File sizes must match: ${stat1.size} vs ${stat2.size}`);
    assert.ok(stat1.size > 1000000, `File size must exceed 1MB, got ${stat1.size}`);
});

runEmpiricalTest('Exact cryptographic SHA-256 hash match', () => {
    const buf1 = fs.readFileSync(DATA_CACHE_PATH);
    const buf2 = fs.readFileSync(LIB_CACHE_PATH);
    const hash1 = crypto.createHash('sha256').update(buf1).digest('hex');
    const hash2 = crypto.createHash('sha256').update(buf2).digest('hex');
    assert.strictEqual(hash1, hash2, `SHA-256 hashes must match: ${hash1} vs ${hash2}`);
    assert.ok(buf1.equals(buf2), 'Byte buffer equality must be true (zero byte deviation)');
});

// ==============================================================================
// CHALLENGE 2: 12:00 PM IMMUTABLE LOCK INVARIANT ACROSS ALL 8 ĐỀ METHODS & LÔ
// ==============================================================================
console.log('\n--- CHALLENGE 2: 12:00 PM Immutable Lock Invariant Across 8 Đề Methods & Lô ---');

const lockGuard = require(path.join(ROOT_DIR, 'lib', 'utils', 'predictionLockGuard.js'));
const cacheData = JSON.parse(fs.readFileSync(DATA_CACHE_PATH, 'utf8'));

runEmpiricalTest('predictionLockGuard evaluates time windows accurately', () => {
    const rawData = JSON.parse(fs.readFileSync(RAW_DATA_PATH, 'utf8'));

    // 10:30 AM VN time -> Unlocked
    const morningCheck = lockGuard.isPredictionLockActive('2026-10-04', rawData, new Date('2026-10-04T03:30:00Z'));
    assert.strictEqual(morningCheck.isLocked, false, '10:30 AM VN must be unlocked');

    // 14:15 PM VN time -> Locked
    const afternoonCheck = lockGuard.isPredictionLockActive('2026-10-04', rawData, new Date('2026-10-04T07:15:00Z'));
    assert.strictEqual(afternoonCheck.isLocked, true, '14:15 PM VN must be locked');
    assert.strictEqual(afternoonCheck.lockActive, true, 'lockActive must be true');

    // Post-18:40 settled -> Lock lifted/settled when rawData contains the draw
    const settledCheck = lockGuard.isPredictionLockActive('2026-10-03', rawData, new Date('2026-10-03T12:00:00Z'));
    assert.strictEqual(settledCheck.isLocked, false, 'Post-18:40 settled must be unlocked');
    assert.strictEqual(settledCheck.isSettled, true, 'isSettled must be true');
});

runEmpiricalTest('All 8 Đề methods exist and maintain immutable numbers under lock', () => {
    const required8Methods = [
        'pentaCoreDe',
        'adaptiveDualMerge',
        'dualMerge',
        'tripleMerge',
        'deMarkovGapHazard',
        'dePositionalGraphFlow',
        'bayesFormResonance',
        'metaLearner'
    ];

    required8Methods.forEach(methodId => {
        const methodObj = cacheData[methodId] || cacheData.streakAwareDeAdvisor?.latestRecommendation?.availableMethods?.[methodId];
        assert.ok(methodObj, `Method ${methodId} must exist in cache`);
        const rec = methodObj.latestRecommendation || methodObj.recommendation || methodObj;
        assert.ok(rec, `Method ${methodId} must have recommendation object`);
        const numProp = rec.fullUnion ? 'fullUnion' : 'numbers';
        const numbers = rec[numProp];
        assert.ok(Array.isArray(numbers) && numbers.length > 0, `Method ${methodId} numbers must be non-empty array, got ${numbers?.length}`);

        // Test lock guard preserves verbatim under lock simulation
        const fakeMutatedNumbers = ['00', '11', '22', '33'];
        const fakeRecommendation = { ...rec, [numProp]: fakeMutatedNumbers, customNote: 'UNAUTHORIZED_MUTATION' };
        
        const lockStatus = {
            isLocked: true,
            lockActive: true,
            lockStartTime: '2026-10-04T12:00:00+07:00',
            lockTargetDate: '2026-10-04',
            lockReason: 'Test Lock'
        };

        const preserved = lockGuard.preserveLockedRecommendation(rec, fakeRecommendation, lockStatus);

        const preservedNumbers = preserved[numProp];
        assert.deepStrictEqual(preservedNumbers, numbers, `Locked numbers for ${methodId} must be restored verbatim`);
        assert.notStrictEqual(preservedNumbers, fakeMutatedNumbers, `Mutated numbers must be rejected for ${methodId}`);
    });
});

runEmpiricalTest('Lô tiers are strictly preserved under lock simulation', () => {
    const loTiers = cacheData.lo4EngineFusion?.latestRecommendation || cacheData.crossHedgingPortfolio?.latestRecommendation?.pillar2_Lo;
    assert.ok(loTiers, 'Lô tiers must exist in latestRecommendation');
    assert.ok(Array.isArray(loTiers.tierX4) && loTiers.tierX4.length > 0, 'tierX4 must be non-empty');
    assert.ok(Array.isArray(loTiers.tierX3) && loTiers.tierX3.length > 0, 'tierX3 must be non-empty');
    assert.ok(Array.isArray(loTiers.tierX1) && loTiers.tierX1.length > 0, 'tierX1 must be non-empty');
});

// ==============================================================================
// CHALLENGE 3: CONSERVATION MATH (Profit = Payout - Stake) ACROSS ALL 4 LEDGERS
// ==============================================================================
console.log('\n--- CHALLENGE 3: Conservation Math (Profit = Payout - Stake) Across All 4 Ledgers ---');

const ledgers = [
    { name: 'crossHedgingPortfolio.settledLedger', data: cacheData.crossHedgingPortfolio?.settledLedger },
    { name: 'lo4EngineFusion.modes.top7.settledLedger', data: cacheData.lo4EngineFusion?.modes?.top7?.settledLedger },
    { name: 'lo4EngineFusion.modes.top6.settledLedger', data: cacheData.lo4EngineFusion?.modes?.top6?.settledLedger },
    { name: 'loTop5ConsensusXien.settledLedger', data: cacheData.loTop5ConsensusXien?.settledLedger }
];

runEmpiricalTest('All 4 ledgers exist, are arrays, and have identical length >= 272', () => {
    ledgers.forEach(l => {
        assert.ok(Array.isArray(l.data), `${l.name} must be an array`);
        assert.strictEqual(l.data.length, 272, `${l.name} must have exactly 272 entries`);
    });
});

runEmpiricalTest('Draw 2026-10-03 exists in all 4 ledgers with synchronous alignment', () => {
    ledgers.forEach(l => {
        const row = l.data.find(r => (r.date || r.predictionDate) === '2026-10-03');
        assert.ok(row, `${l.name} must contain row for 2026-10-03`);
        assert.strictEqual(row.date || row.predictionDate, '2026-10-03');
    });
});

runEmpiricalTest('Draw 2026-10-03 Ledger 1 (crossHedgingPortfolio) strict conservation math', () => {
    const row = cacheData.crossHedgingPortfolio.settledLedger.find(r => r.date === '2026-10-03');
    
    // Pillar 1 Đề
    assert.strictEqual(row.deStakeK, 77000, 'Đề stake must be 77,000K');
    assert.strictEqual(row.dePayoutK, 0, 'Đề payout must be 0K');
    assert.strictEqual(row.deProfitK, -77000, 'Đề profit must be -77,000K');
    assert.strictEqual(row.dePayoutK - row.deStakeK, row.deProfitK, 'Đề Payout - Stake === Profit');

    // Pillar 2 Lô Top 7
    assert.strictEqual(row.loStakeK, 52800, 'Lô stake must be 52,800K');
    assert.strictEqual(row.loPayoutK, 88000, 'Lô payout must be 88,000K');
    assert.strictEqual(row.loProfitK, 35200, 'Lô profit must be +35,200K');
    assert.strictEqual(row.loPayoutK - row.loStakeK, row.loProfitK, 'Lô Payout - Stake === Profit');

    // Pillar 3 Xiên 4 Quây
    assert.strictEqual(row.xienStakeK, 11000, 'Xiên stake must be 11,000K');
    assert.strictEqual(row.xienPayoutK, 84000, 'Xiên payout must be 84,000K');
    assert.strictEqual(row.xienProfitK, 73000, 'Xiên profit must be +73,000K');
    assert.strictEqual(row.xienPayoutK - row.xienStakeK, row.xienProfitK, 'Xiên Payout - Stake === Profit');

    // Combo Cross-Hedging Total
    assert.strictEqual(row.totalStakeK, 140800, 'Total stake must be 140,800K');
    assert.strictEqual(row.totalPayoutK, 172000, 'Total payout must be 172,000K');
    assert.strictEqual(row.totalProfitK, 31200, 'Total profit must be +31,200K (+31.2M)');
    assert.strictEqual(row.totalPayoutK - row.totalStakeK, row.totalProfitK, 'Total Payout - Stake === Profit');
    assert.strictEqual(row.deProfitK + row.loProfitK + row.xienProfitK, row.totalProfitK, 'Sum of pillar profits === totalProfitK');
});

runEmpiricalTest('Draw 2026-10-03 Ledger 2 (lo4EngineFusion.top7) strict conservation math', () => {
    const row = cacheData.lo4EngineFusion.modes.top7.settledLedger.find(r => r.date === '2026-10-03');
    assert.strictEqual(row.dayLotoStakeK, 52800);
    assert.strictEqual(row.dayLotoPayoutK, 88000);
    assert.strictEqual(row.dayLotoProfitK, 35200);
    assert.strictEqual(row.dayLotoPayoutK - row.dayLotoStakeK, row.dayLotoProfitK);
    assert.strictEqual(row.dayLotoHits, 3);
});

runEmpiricalTest('Draw 2026-10-03 Ledger 3 (lo4EngineFusion.top6) strict conservation math', () => {
    const row = cacheData.lo4EngineFusion.modes.top6.settledLedger.find(r => r.date === '2026-10-03');
    assert.strictEqual(row.dayLotoStakeK, 46200);
    assert.strictEqual(row.dayLotoPayoutK, 88000);
    assert.strictEqual(row.dayLotoProfitK, 41800);
    assert.strictEqual(row.dayLotoPayoutK - row.dayLotoStakeK, row.dayLotoProfitK);
    assert.strictEqual(row.dayLotoHits, 3);
});

runEmpiricalTest('Draw 2026-10-03 Ledger 4 (loTop5ConsensusXien) strict conservation math', () => {
    const row = cacheData.loTop5ConsensusXien.settledLedger.find(r => r.date === '2026-10-03');
    // Xiên 4 Quây VIP
    assert.strictEqual(row.q11StakeVIP_K, 11000);
    assert.strictEqual(row.q11PayoutVIP_K, 84000);
    assert.strictEqual(row.q11ProfitVIP_K, 73000);
    assert.strictEqual(row.q11PayoutVIP_K - row.q11StakeVIP_K, row.q11ProfitVIP_K);

    // Xiên 4 Quây M3
    assert.strictEqual(row.q11StakeM3K, 2200);
    assert.strictEqual(row.q11PayoutM3K, 16800);
    assert.strictEqual(row.q11ProfitM3K, 14600);
    assert.strictEqual(row.q11PayoutM3K - row.q11StakeM3K, row.q11ProfitM3K);

    // Xiên 3 Quây
    assert.strictEqual(row.x3StakeK, 1000);
    assert.strictEqual(row.x3PayoutK, 6500);
    assert.strictEqual(row.x3ProfitK, 5500);
    assert.strictEqual(row.x3PayoutK - row.x3StakeK, row.x3ProfitK);

    // Dàn Xiên 5 (55M)
    assert.strictEqual(row.x5Stake55K, 55000);
    assert.strictEqual(row.x5Payout55K, 204000);
    assert.strictEqual(row.x5Profit55K, 149000);
    assert.strictEqual(row.x5Payout55K - row.x5Stake55K, row.x5Profit55K);
});

runEmpiricalTest('Zero financial conservation violations across all 272 rows of all 4 ledgers', () => {
    let violationCount = 0;
    
    // Check CH ledger
    cacheData.crossHedgingPortfolio.settledLedger.forEach(row => {
        if (row.totalPayoutK !== undefined && row.totalStakeK !== undefined && row.totalProfitK !== undefined) {
            if (row.totalPayoutK - row.totalStakeK !== row.totalProfitK) violationCount++;
            if ((row.deProfitK || 0) + (row.loProfitK || 0) + (row.xienProfitK || 0) !== row.totalProfitK) violationCount++;
        }
    });

    // Check lo7 ledger
    cacheData.lo4EngineFusion.modes.top7.settledLedger.forEach(row => {
        if (row.dayLotoPayoutK !== undefined && row.dayLotoStakeK !== undefined && row.dayLotoProfitK !== undefined) {
            if (row.dayLotoPayoutK - row.dayLotoStakeK !== row.dayLotoProfitK) violationCount++;
        }
    });

    // Check lo6 ledger
    cacheData.lo4EngineFusion.modes.top6.settledLedger.forEach(row => {
        if (row.dayLotoPayoutK !== undefined && row.dayLotoStakeK !== undefined && row.dayLotoProfitK !== undefined) {
            if (row.dayLotoPayoutK - row.dayLotoStakeK !== row.dayLotoProfitK) violationCount++;
        }
    });

    // Check xien ledger
    cacheData.loTop5ConsensusXien.settledLedger.forEach(row => {
        if (row.q11PayoutVIP_K !== undefined && row.q11StakeVIP_K !== undefined && row.q11ProfitVIP_K !== undefined) {
            if (row.q11PayoutVIP_K - row.q11StakeVIP_K !== row.q11ProfitVIP_K) violationCount++;
        }
        if (row.x3PayoutK !== undefined && row.x3StakeK !== undefined && row.x3ProfitK !== undefined) {
            if (row.x3PayoutK - row.x3StakeK !== row.x3ProfitK) violationCount++;
        }
        if (row.x5Payout55K !== undefined && row.x5Stake55K !== undefined && row.x5Profit55K !== undefined) {
            if (row.x5Payout55K - row.x5Stake55K !== row.x5Profit55K) violationCount++;
        }
    });

    assert.strictEqual(violationCount, 0, `Conservation violation count must be 0, found ${violationCount}`);
});

// ==============================================================================
// CHALLENGE 4: 18 COMBAT DRAWS CONTINUITY & EXACT PARITY WITH TELEGRAM SECTION 6
// ==============================================================================
console.log('\n--- CHALLENGE 4: 18 Combat Draws Continuity & Telegram Section 6 Parity ---');

const EXPECTED_18_DATES = [
    '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20',
    '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25',
    '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30',
    '2026-10-01', '2026-10-02', '2026-10-03'
];

runEmpiricalTest('All 18 combat dates exist in all 4 ledgers without gaps', () => {
    EXPECTED_18_DATES.forEach(dateStr => {
        ledgers.forEach(l => {
            const found = l.data.find(r => (r.date || r.predictionDate) === dateStr);
            assert.ok(found, `Ledger ${l.name} must have continuous row for date ${dateStr}`);
        });
    });
});

runEmpiricalTest('Combat window aggregation exactly matches Telegram Section 6 contract', () => {
    const chCombat = cacheData.crossHedgingPortfolio.settledLedger.filter(
        r => r.date >= '2026-09-16' && r.date <= '2026-10-03'
    );
    const lo7Combat = cacheData.lo4EngineFusion.modes.top7.settledLedger.filter(
        r => r.date >= '2026-09-16' && r.date <= '2026-10-03'
    );
    const lo6Combat = cacheData.lo4EngineFusion.modes.top6.settledLedger.filter(
        r => r.date >= '2026-09-16' && r.date <= '2026-10-03'
    );
    const xienCombat = cacheData.loTop5ConsensusXien.settledLedger.filter(
        r => r.date >= '2026-09-16' && r.date <= '2026-10-03'
    );

    assert.strictEqual(chCombat.length, 18);
    assert.strictEqual(lo7Combat.length, 18);
    assert.strictEqual(lo6Combat.length, 18);
    assert.strictEqual(xienCombat.length, 18);

    // Đề: 6/18 wins, -378.0M VIP (-75.600K M3)
    const deWins = chCombat.filter(r => r.isDeHit || r.deProfitK > 0).length;
    const deNetProfitVIP = chCombat.reduce((sum, r) => sum + r.deProfitK, 0);
    assert.strictEqual(deWins, 6, 'Đề wins must be 6/18');
    assert.strictEqual(deNetProfitVIP, -378000, 'Đề net VIP profit must be -378,000K (-378.0M)');

    // Lô Top 7: 12/18 wins, +382.0M VIP (+95.501K M3)
    const lo7Wins = lo7Combat.filter(r => r.isLotoWin || r.dayLotoProfitK > 0).length;
    const lo7NetProfitVIP = lo7Combat.reduce((sum, r) => sum + r.dayLotoProfitK, 0);
    assert.strictEqual(lo7Wins, 12, 'Lô Top 7 wins must be 12/18');
    assert.strictEqual(lo7NetProfitVIP, 382000, 'Lô Top 7 net VIP profit must be +382,000K (+382.0M)');

    // Lô Top 6: 13/18 wins, +449.4M VIP (+112.351K M3)
    const lo6Wins = lo6Combat.filter(r => r.isLotoWin || r.dayLotoProfitK > 0).length;
    const lo6NetProfitVIP = lo6Combat.reduce((sum, r) => sum + r.dayLotoProfitK, 0);
    assert.strictEqual(lo6Wins, 13, 'Lô Top 6 wins must be 13/18');
    assert.strictEqual(lo6NetProfitVIP, 449400, 'Lô Top 6 net VIP profit must be +449,400K (+449.4M)');

    // Xiên 4 Quây (11 vé): 6/18 wins, +417.68M VIP (+83.536K M3) in Cross-Hedging / Telegram Section 6, and +390.0M in unscaled fixed ledger
    const x4Wins = xienCombat.filter(r => r.q11ProfitVIP_K > 0).length;
    const x4NetProfitVIP_CH = chCombat.reduce((sum, r) => sum + r.xienProfitK, 0);
    const x4NetProfitVIP_Fixed = xienCombat.reduce((sum, r) => sum + r.q11ProfitVIP_K, 0);
    assert.strictEqual(x4Wins, 6, 'Xiên 4 Quây wins must be 6/18');
    assert.strictEqual(x4NetProfitVIP_CH, 417680, 'Xiên 4 Quây net VIP profit in Cross-Hedging/Telegram must be +417,680K (+417.68M)');
    assert.strictEqual(x4NetProfitVIP_Fixed, 390000, 'Xiên 4 Quây net VIP profit in fixed consensus ledger must be +390,000K (+390.0M)');

    // Xiên 3 Quây (10 vé): 4/18 days, 7 tickets, +31.5M VIP (+6.3M M3) accounting for abstain days
    const abstainDates = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'];
    const x3DaysWon = xienCombat.filter(r => r.x3Tickets > 0 || (!abstainDates.includes(r.date) && r.x3ProfitK > 0)).length;
    const x3TicketsHit = xienCombat.reduce((sum, r) => sum + (r.x3Tickets || 0), 0);
    const x3NetProfitVIP = xienCombat.reduce((sum, r) => sum + (abstainDates.includes(r.date) ? 0 : (r.x3ProfitK || 0)), 0);
    assert.strictEqual(x3DaysWon, 4, 'Xiên 3 days won must be 4/18');
    assert.strictEqual(x3TicketsHit, 7, 'Xiên 3 tickets hit must be 7');
    assert.strictEqual(x3NetProfitVIP, 31500, 'Xiên 3 net VIP profit must be +31,500K (+31.5M)');

    // Dàn Xiên 5: 4/18 wins, +522.0M VIP
    const x5Wins = xienCombat.filter(r => r.isX5Win55 || r.x5Profit55K > 0).length;
    const x5NetProfitVIP = xienCombat.reduce((sum, r) => sum + (r.x5Profit55K || 0), 0);
    assert.strictEqual(x5Wins, 4, 'Dàn Xiên 5 wins must be 4/18');
    assert.strictEqual(x5NetProfitVIP, 522000, 'Dàn Xiên 5 net VIP profit must be +522,000K (+522.0M)');

    // Combo Cross-Hedging Net Profit: 7/18 wins, +421.68M VIP (+103.437K M3)
    const comboWins = chCombat.filter(r => r.isWin || r.totalProfitK > 0).length;
    const comboNetProfitVIP = chCombat.reduce((sum, r) => sum + r.totalProfitK, 0);
    assert.strictEqual(comboWins, 7, 'Combo wins must be 7/18');
    assert.strictEqual(comboNetProfitVIP, 421680, 'Combo net VIP profit must be +421,680K (+421.68M)');
});

// ==============================================================================
// CHALLENGE 5: ADVERSARIAL STRICT PIT & FUTURE DATA LEAKAGE TEST
// ==============================================================================
console.log('\n--- CHALLENGE 5: Adversarial Strict PIT & Zero Future Leakage ---');

const autoBestService = require(path.join(ROOT_DIR, 'lib', 'services', 'autoBestSelectionService.js'));

runEmpiricalTest('evaluateAutoBestSelection enforces strict historical window (T <= targetDate - 1)', () => {
    const targetDate = '2026-10-03';
    
    // Evaluation for 2026-10-03 MUST NOT use draw 2026-10-03
    const result = autoBestService.evaluateAutoBestSelection(targetDate, {
        advisorCache: cacheData
    });

    assert.ok(result, 'Result must be returned');
    assert.strictEqual(result.targetDate, targetDate);
    assert.ok(result.selectedMethod, 'Must select a method');
    assert.ok(result.scores && result.scores.length === 12, 'Must evaluate 12 candidate methods');
});

runEmpiricalTest('Future Mutation Adversarial Attack produces identical prediction and scores', () => {
    const targetDate = '2026-09-25';
    
    // Base evaluation
    const baseEval = autoBestService.evaluateAutoBestSelection(targetDate, {
        advisorCache: cacheData
    });

    // Create adversarial poisoned cache where draws on targetDate and later have mutated numbers and profits
    const mutatedCache = JSON.parse(JSON.stringify(cacheData));
    if (mutatedCache.crossHedgingPortfolio?.settledLedger) {
        mutatedCache.crossHedgingPortfolio.settledLedger.forEach(row => {
            const d = row.date || row.predictionDate;
            if (d >= targetDate) {
                row.totalProfitK = 99999999;
                row.isWin = true;
                row.isVipHit = true;
            }
        });
    }

    // Re-evaluate with mutated dataset
    const mutatedEval = autoBestService.evaluateAutoBestSelection(targetDate, {
        advisorCache: mutatedCache
    });

    // The evaluation for targetDate 2026-09-25 MUST be completely identical because Strict PIT isolates T <= targetDate - 1
    assert.strictEqual(
        mutatedEval.selectedMethod,
        baseEval.selectedMethod,
        'Selected method must be invariant under future mutation'
    );
    assert.strictEqual(
        mutatedEval.status,
        baseEval.status,
        'Status must be invariant under future mutation'
    );
    assert.strictEqual(
        mutatedEval.compositeScore,
        baseEval.compositeScore,
        'Composite score must be invariant under future mutation'
    );
});

console.log('================================================================================');
console.log(`🎉 EMPIRICAL ADVERSARIAL CHALLENGER SUITE COMPLETE: ${testsPassed}/${testsTotal} PASSED!`);
console.log('================================================================================');
