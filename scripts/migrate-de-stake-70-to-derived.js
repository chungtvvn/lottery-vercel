#!/usr/bin/env node
'use strict';
/**
 * migrate-de-stake-70-to-derived.js
 * =============================================================================
 * SCOPED migration for the 2026-10-27 fix-forward upgrade — NOT a blanket
 * restatement. See the classification below before running --apply.
 *
 * Problem: old Đề registrations stored a literal stakeK of 70000K, which
 * matches neither the 30-set derived capital (64000K) nor the 43-set
 * derived capital (77000K). New registrations/settlements now derive
 * stakeK = (vipCount * 3 + singleCount * 1) * 1000. Already-settled rows
 * were deliberately NOT rewritten by the code fix.
 *
 * IN-SCOPE (the only rows --apply may ever touch):
 *   A settled Đề row is in scope iff ALL of these hold:
 *     1. methodName is in the Markov / Gap Hazard family
 *        (contains both "Markov" and "Gap Hazard");
 *     2. the bets.de leg is the CURRENT Markov combo structure:
 *        exactly 17 VIP (X3) numbers and exactly 26 single (X1) numbers,
 *        so derived stake = (17*3 + 26*1) * 1000 = 77000K;
 *     3. the stored day total actually contains this Đề leg: the
 *        settlement crossHedgingPortfolio deProfitK equals the
 *        settlement.de profitK, and its totalProfitK equals
 *        deProfitK + loProfitK + xienProfitK (definition B legs).
 *   Rows failing (3) settle their day total on a DIFFERENT Đề leg and
 *   must not be rewritten on the Markov basis (see HELD below).
 *
 * APPLIED 2026-10-27 (local clone only, never pushed): the 7 in-scope
 * rows with stored stake 70000K were restated to 77000K in BOTH registry
 * copies (bets.de, bets pillar1_De, settlement.de, settlement CHP
 * de/total fields; Lô and Xiên legs untouched; Xiên 5 and Lô X2 never
 * added to day-total B):
 *   2026-10-12, 2026-10-15, 2026-10-16, 2026-10-17, 2026-10-18,
 *   2026-10-19, 2026-10-20 — each Đề delta -7000K, total delta -49000K.
 *   Stored day-total B (CHP totalProfitK) sum over settled rows:
 *   1035730K -> 986730K.
 *
 * HELD — Markov-family rows deliberately NOT restated (owner decision
 * needed; dry-run lists them as held, --apply skips them):
 *   2026-10-21: bets.de is Markov 17/26 @70000K, but the stored CHP day
 *     total is settled on the dualMerge pillar (deStakeK 71000K,
 *     deProfitK -71000K), not on the Markov leg. Restating would rewrite
 *     another method's settlement. Markov-basis figures if ever approved:
 *     Đề -70000K -> -77000K; legs-B -56800K -> -63800K (stored CHP -57800K
 *     is dualMerge-based and would need a separate decision).
 *   2026-10-23: Markov method but a 30-set (17 VIP + 13 single), derived
 *     64000K — NOT the current 43-set combo; its CHP day total is already
 *     settled on the Edge75Hold70 pillar @64000K. Markov-basis figures if
 *     ever approved: Đề -70000K -> -64000K; legs-B -85800K -> -79800K
 *     (which already equals the stored CHP total).
 *   2026-10-24: Markov 17/26 @70000K, but the stored CHP is SMART_ABSTAIN
 *     (all zeros by design). Markov-basis figures if ever approved:
 *     Đề -70000K -> -77000K; legs-B -20800K -> -27800K; stored CHP 0K
 *     would need a separate abstain decision.
 *   2026-10-13 and 2026-10-25 are Markov 17/26 already stored @77000K:
 *   no change needed (dry-run reports them as already applied).
 *
 * OUT OF SCOPE — all other settled Đề rows (27 rows: Edge75 Hold,
 * Dự đoán Edge 50%, Dropoff TB variants, Đề Boost B40S05, Đề Gộp Tiêu
 * Chuẩn Sweet-Spot, Đề Tinh Tuyển VIP) keep their historical stakes
 * untouched, even where stake != derived for their own tier structure.
 * The pre-scope dry-run listed 33 rows / -298530K; that blanket figure
 * is SUPERSEDED and must not be applied.
 *
 * Usage (DRY-RUN BY DEFAULT — nothing is written):
 *   node scripts/migrate-de-stake-70-to-derived.js
 * To apply remaining in-scope rows only (owner decision only, after the
 * script prints them), run:
 *   node scripts/migrate-de-stake-70-to-derived.js --apply
 * With --apply, a timestamped .bak copy of each registry file is written
 * first. Xiên 5 and Lô Đột Phá X2 are never added to day-total B.
 */
const fs = require('fs');
const path = require('path');

const REGISTRY_PATHS = [
    path.join(__dirname, '..', 'lib', 'data', 'statistics', 'daily_locked_bets_registry.json'),
    path.join(__dirname, '..', 'data', 'daily_locked_bets_registry.json'),
];

function derivedStakeK(bet) {
    if (!bet) return 0;
    const vip = (bet.vipNumbers || []).length;
    const single = (bet.singleNumbers || []).length
        || Math.max(0, (bet.numbers || []).length - vip);
    return (vip * 3 + single) * 1000;
}

function isMarkovGapHazard(bet) {
    const m = bet?.methodName || '';
    return m.includes('Markov') && m.includes('Gap Hazard');
}

// In-scope structure: current Markov combo, 17 VIP X3 + 26 single X1.
function isCurrentMarkovCombo(bet) {
    return isMarkovGapHazard(bet)
        && (bet.vipNumbers || []).length === 17
        && (bet.singleNumbers || []).length === 26;
}

// The stored day total must genuinely contain this Đề leg; otherwise the
// row's day total belongs to another method and is HELD, not restated.
function chpLegMatchesDe(entry) {
    const settled = entry?.settlement?.de;
    const chp = entry?.settlement?.crossHedgingPortfolio;
    if (!settled || !chp) return false;
    return Number(chp.deProfitK) === Number(settled.profitK)
        && Number(chp.totalProfitK) === Number(settled.profitK)
            + Number(chp.loProfitK ?? 0) + Number(chp.xienProfitK ?? 0);
}

function classify(entry) {
    const bet = entry?.bets?.de;
    const settled = entry?.settlement?.de;
    if (!bet || !settled || !entry.isSettled) return 'not-settled-de';
    if (!isCurrentMarkovCombo(bet)) return 'out-of-scope';
    if (Number(bet.stakeK) === derivedStakeK(bet)) return 'already-applied';
    if (!chpLegMatchesDe(entry)) return 'held';
    return 'remaining';
}

function main() {
    const apply = process.argv.includes('--apply');
    const dryRun = !apply;
    console.log(dryRun
        ? '[migrate] DRY-RUN ONLY — nothing will be written. Pass --apply to write remaining in-scope rows only.'
        : '[migrate] --apply given — writing remaining in-scope rows only, with .bak backup first.');
    for (const filePath of REGISTRY_PATHS) {
        if (!fs.existsSync(filePath)) { console.log(`[migrate] skip (missing): ${filePath}`); continue; }
        const reg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const dates = Object.keys(reg.dates || {}).sort();
        let cumulativeDeltaK = 0;
        let changed = 0;
        let applied = 0;
        let held = 0;
        let outOfScope = 0;
        for (const d of dates) {
            const entry = reg.dates[d];
            const cls = classify(entry);
            if (cls === 'not-settled-de') continue;
            if (cls === 'out-of-scope') { outOfScope += 1; continue; }
            const bet = entry.bets.de;
            const settled = entry.settlement.de;
            const expected = derivedStakeK(bet);
            if (cls === 'already-applied') {
                applied += 1;
                console.log(`[migrate] ${d}: in-scope, already applied (stake ${expected}K, method ${bet.methodName}).`);
                continue;
            }
            if (cls === 'held') {
                held += 1;
                console.log(`[migrate] ${d}: HELD, not restated — stored day total is not settled on this Markov leg (method ${bet.methodName}, stake ${bet.stakeK}K, derived ${expected}K). Owner decision required.`);
                continue;
            }
            // cls === 'remaining': the only rows --apply may touch.
            const oldStakeK = Number(settled.stakeK ?? bet.stakeK);
            const oldProfitK = Number(settled.profitK ?? 0);
            const newStakeK = expected;
            const newProfitK = Number(settled.payoutK ?? 0) - newStakeK;
            const deltaK = newProfitK - oldProfitK;
            cumulativeDeltaK += deltaK;
            changed += 1;
            console.log(`[migrate] ${d}: Đề stake ${oldStakeK}K -> ${newStakeK}K, profit ${oldProfitK}K -> ${newProfitK}K, delta ${deltaK}K, cumulative delta ${cumulativeDeltaK}K`);
            if (apply) {
                const chp = entry.settlement.crossHedgingPortfolio;
                settled.stakeK = newStakeK;
                settled.profitK = newProfitK;
                bet.stakeK = newStakeK;
                if (entry.bets.crossHedgingPortfolio?.pillar1_De) {
                    entry.bets.crossHedgingPortfolio.pillar1_De.stakeK = newStakeK;
                }
                // Day-total B = Đề + Lô gốc + Xiên 4 (lo4 leg) only
                // (never Xiên 5 / Lô X2). Recompute from stored legs.
                if (chp) {
                    chp.deStakeK = newStakeK;
                    chp.deProfitK = newProfitK;
                    chp.dePnlK = newProfitK;
                    chp.totalProfitK = newProfitK
                        + Number(chp.loProfitK ?? 0) + Number(chp.xienProfitK ?? 0);
                    chp.totalStakeK = newStakeK
                        + Number(chp.loStakeK || 0)
                        + Number(chp.xienStakeK || 0);
                }
            }
        }
        console.log(`[migrate] ${filePath}: ${changed} in-scope row(s) remaining (cumulative delta ${cumulativeDeltaK}K), ${applied} already applied, ${held} held, ${outOfScope} out-of-scope settled Đề row(s) untouched.`);
        if (apply && changed > 0) {
            const bak = `${filePath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
            fs.copyFileSync(filePath, bak);
            console.log(`[migrate] backup written: ${bak}`);
            fs.writeFileSync(filePath, JSON.stringify(reg, null, 2), 'utf8');
            console.log(`[migrate] registry rewritten: ${filePath}`);
        }
    }
}

if (require.main === module) main();
module.exports = { derivedStakeK, isCurrentMarkovCombo, chpLegMatchesDe, classify };
