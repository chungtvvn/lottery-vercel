#!/usr/bin/env node
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const service = require('../lib/services/dailyMethodAdvisorService');

function nextIsoDate(value) {
    const date = new Date(`${String(value || '').slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
}

async function main() {
    const { getRawData, loadJsonWithSupabaseFallback } = require('../lib/data-access');
    const useLocalHistory = process.env.DAILY_ADVISOR_USE_LOCAL_HISTORY === '1';
    let history = null;
    let existing = null;
    try {
        if (!useLocalHistory) {
            history = await loadJsonWithSupabaseFallback('cached_prediction_history.json');
            if (!Array.isArray(history)) history = history?.history || history?.records || null;
        } else {
            const fs = require('fs');
            const path = require('path');
            const localHistFile = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'cached_prediction_history.json');
            if (fs.existsSync(localHistFile)) {
                const loaded = JSON.parse(fs.readFileSync(localHistFile, 'utf8'));
                history = loaded.history || loaded.records || loaded;
            }
        }
    } catch (error) {
        console.log(`[DailyAdvisor] Chưa tải được history: ${error.message}`);
    }

    let existingCache = null;
    try {
        existingCache = await loadJsonWithSupabaseFallback('cached_daily_method_advisor.json');
    } catch (error) {
        console.log(`[DailyAdvisor] Chưa có cache R2 cũ: ${error.message}`);
    }

    if (!existingCache || !existingCache.dualMerge || !existingCache.streakAwareDeAdvisor) {
        try {
            const fs = require('fs');
            const path = require('path');
            const localAdvFile = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
            if (fs.existsSync(localAdvFile)) {
                existingCache = JSON.parse(fs.readFileSync(localAdvFile, 'utf8'));
            }
        } catch (_) {}
    }

    const registryService = require('../lib/services/dailyLockedBetsRegistryService');
    const currentReg = registryService.loadRegistry();

    const raw = await getRawData();
    const cache = await service.generateAndWriteCache({
        history: history || undefined,
        raw,
        existing: existingCache?.records || (Array.isArray(existingCache) ? existingCache : []),
        existingDualMerge: existingCache?.dualMerge || null,
        existingTripleMerge: existingCache?.tripleMerge || null,
        existingAdaptiveDualMerge: existingCache?.adaptiveDualMerge || null,
        existingMetaLearner: existingCache?.metaLearner || null,
        existingDynamicMetaAdvisor: existingCache?.dynamicMetaAdvisor || null,
        existingMetaCrossMethod: existingCache?.metaCrossMethod || null,
        limit: 90,
        forceSynthesize: process.env.FORCE_SYNTHESIZE === '1',
        existingCache: existingCache,
        dailyLockedBetsRegistry: currentReg
    });
    const expectedPredictionDate = nextIsoDate(cache.latestDataDate);
    const pendingSnapshot = cache.records.find(record => record?.predictionDate === expectedPredictionDate);
    if (!pendingSnapshot || pendingSnapshot.settled || pendingSnapshot.main?.numbers?.length !== service.BET_COUNT) {
        throw new Error(`Thiếu snapshot ngày kế tiếp ${expectedPredictionDate || 'unknown'} sau khi sinh Daily Advisor.`);
    }

    try {
        const { buildTriCoreDeAdvisor } = require('../lib/services/triCoreDeAdvisorService');
        cache.triCoreDe = buildTriCoreDeAdvisor(raw, cache, { existingTriCoreDe: existingCache?.triCoreDe, dailyLockedBetsRegistry: currentReg });
    } catch (err) {
        console.error('[generateDailyAdvisorCache] Error building triCoreDe:', err);
    }

    try {
        const { buildDeDropoffMergeAdvisor } = require('../lib/services/deDropoffMergeAdvisorService');
        cache.deDropoffMerge = buildDeDropoffMergeAdvisor(raw, cache, { existingDeDropoffMerge: existingCache?.deDropoffMerge, dailyLockedBetsRegistry: currentReg });
    } catch (err) {
        console.error('[generateDailyAdvisorCache] Error building deDropoffMerge:', err);
    }

    try {
        const { buildLoDropoff27Advisor } = require('../lib/services/loDropoff27AdvisorService');
        cache.loDropoff27 = buildLoDropoff27Advisor(raw, cache, { existingLoDropoff27: existingCache?.loDropoff27, dailyLockedBetsRegistry: currentReg });
    } catch (err) {
        console.error('[generateDailyAdvisorCache] Error building loDropoff27:', err);
    }

    try {
        const { buildSemanticResonanceSuiteAdvisor } = require('../lib/services/semanticResonanceSuiteAdvisorService');
        cache.semanticResonanceSuite = buildSemanticResonanceSuiteAdvisor(raw, cache, { existingSemanticResonanceSuite: existingCache?.semanticResonanceSuite, dailyLockedBetsRegistry: currentReg });
    } catch (err) {
        console.error('[generateDailyAdvisorCache] Error building semanticResonanceSuite:', err);
    }

    try {
        const { buildDeResearchEnsembleAdvisor } = require('../lib/services/deResearchEnsembleAdvisorService');
        cache.deResearchEnsemble = buildDeResearchEnsembleAdvisor(raw, cache);
    } catch (err) {
        console.error('[generateDailyAdvisorCache] Error building deResearchEnsemble:', err);
    }

    try {
        const { buildMiroFishSwarmAdvisor } = require('../lib/services/mirofishSwarmService');
        cache.mirofishSwarm = buildMiroFishSwarmAdvisor(raw, cache, { existingMiroFishSwarm: existingCache?.mirofishSwarm });
    } catch (err) {
        console.error('[generateDailyAdvisorCache] Error building mirofishSwarm:', err);
    }

    // Tích hợp Single Source of Truth (SSOT) Registry
    try {
        const registryService = require('../lib/services/dailyLockedBetsRegistryService');
        const rawMap = new Map();
        (raw || []).forEach(r => {
            const d = String(r.date || r.ngay || '').slice(0, 10);
            if (d && (r.special != null || r.prize1 != null)) rawMap.set(d, r);
        });
        const currentReg = registryService.loadRegistry();
        Object.entries(currentReg.dates || {}).forEach(([d, entry]) => {
            if (!entry.isSettled && rawMap.has(d)) {
                try {
                    registryService.settleDateDirectly(d, rawMap.get(d));
                } catch (err) {
                    console.error(`[generateDailyAdvisorCache] Error settling ${d}:`, err);
                }
            }
        });

        // Đăng ký dàn đánh chính thức của ngày mục tiêu tiếp theo vào Registry
        if (cache.streakAwareDeAdvisor?.latestRecommendation) {
            const lr = cache.streakAwareDeAdvisor.latestRecommendation;
            const vipNums = (lr.tierX3 || []).concat(lr.tierX2 || []).concat(lr.numbers?.slice(0, 17) || []).slice(0, 17);
            const allNums = lr.numbers || [];
            const singleNums = allNums.filter(n => !vipNums.includes(n));
            registryService.registerDailyBet(expectedPredictionDate, 'de', {
                methodName: lr.methodName || '🔮 Đề Markov Bậc 2 & Gap Hazard (Sweet-Spot)',
                vipNumbers: vipNums.map(n => String(n).padStart(2, '0')),
                singleNumbers: singleNums.map(n => String(n).padStart(2, '0')),
                numbers: allNums.map(n => String(n).padStart(2, '0')),
                stakeK: 70000
            });
        }
        const top5Candidate = (cache.lo4EngineFusion?.latestRecommendation?.xien4?.top5?.length >= 5)
            ? cache.lo4EngineFusion.latestRecommendation.xien4.top5
            : (cache.loTop5ConsensusXien?.top5Xien?.length >= 5
                ? cache.loTop5ConsensusXien.top5Xien
                : (cache.lo4EngineFusion?.latestRecommendation?.numbersOver2?.slice(0, 5) || []));
        if (top5Candidate.length >= 5) {
            const finalTop5 = top5Candidate.slice(0, 5).map(n => String(n).padStart(2, '0') === '23' ? '36' : String(n).padStart(2, '0'));
            registryService.registerDailyBet(expectedPredictionDate, 'loXien5', {
                top5: finalTop5,
                stakeK: 55000
            });
        }

        // Tính toán PentaConsensus (Shadow Monitor) trước để làm cơ sở khóa bất biến Cross X2
        let pentaNext = null;
        try {
            const { computePentaConsensusForDate } = require('../lib/services/pentaConsensusService');
            pentaNext = computePentaConsensusForDate(expectedPredictionDate, cache);
            if (pentaNext) {
                cache.pentaConsensus = {
                    latestRecommendation: pentaNext
                };
                registryService.registerDailyBet(expectedPredictionDate, 'pentaConsensus', {
                    targetDate: expectedPredictionDate,
                    de: {
                        numbers: pentaNext.de?.numbers || [],
                        x2Nums: pentaNext.de?.x2Nums || [],
                        x1Nums: pentaNext.de?.x1Nums || [],
                        stakeK: pentaNext.de?.stakeK || 0
                    },
                    lo: {
                        numbers: pentaNext.lo?.numbers || [],
                        x5Nums: pentaNext.lo?.x5Nums || [],
                        x4Nums: pentaNext.lo?.x4Nums || [],
                        x3Nums: pentaNext.lo?.x3Nums || [],
                        x1Nums: pentaNext.lo?.x1Nums || [],
                        multiplierMap: pentaNext.lo?.multiplierMap || {},
                        stakeK: pentaNext.lo?.stakeK || 0
                    },
                    xien5: {
                        top5: pentaNext.xien5?.top5 || [],
                        tickets: pentaNext.xien5?.tickets || [],
                        stakeK: pentaNext.xien5?.stakeK || 5500
                    }
                });
            }
        } catch (err) {
            console.error('[generateDailyAdvisorCache] Error computing pentaConsensus:', err);
        }

        // Khóa bất biến Lô Đột Phá X2 (Cross X2) vào latestRecommendation trước khi đăng ký bet
        if (cache.lo4EngineFusion?.latestRecommendation) {
            const lRec = cache.lo4EngineFusion.latestRecommendation;
            const pentaHighSet = new Set(pentaNext?.lo ? [
                ...(pentaNext.lo.x5Nums || []),
                ...(pentaNext.lo.x4Nums || []),
                ...(pentaNext.lo.x3Nums || [])
            ].map(n => String(n).padStart(2, '0')) : []);

            const t5 = (lRec.tierX5 || []).map(n => String(n).padStart(2, '0'));
            const t4 = (lRec.tierX4 || []).map(n => String(n).padStart(2, '0'));
            const t3 = (lRec.tierX3 || []).map(n => String(n).padStart(2, '0'));
            const t1 = (lRec.tierX1 || []).map(n => String(n).padStart(2, '0'));

            const promotedToX2 = t1.filter(n => pentaHighSet.has(n));
            const remainingX1 = t1.filter(n => !pentaHighSet.has(n));
            const stakeKX2 = (t5.length * 5 + t4.length * 4 + t3.length * 3 + promotedToX2.length * 2 + remainingX1.length * 1) * 2200;

            lRec.crossX2 = {
                tierX5: t5,
                tierX4: t4,
                tierX3: t3,
                tierX2: promotedToX2,
                tierX1: remainingX1,
                stakeKX2,
                promotedRationale: promotedToX2.length > 0
                    ? `Số [${promotedToX2.join(', ')}] xuất hiện ở nhóm đồng thuận cao (>= X3) bên Shadow Monitor -> Nâng lên Tier X2 (cược 4.4M/số, ăn 16M/nháy).`
                    : 'Không có số nào cần nâng hạng hôm nay.'
            };

            registryService.registerDailyBet(expectedPredictionDate, 'lo4EngineFusion', lRec);
        }
        if (cache.crossHedgingPortfolio?.latestRecommendation || cache.crossHedgingPortfolio) {
            const chRec = cache.crossHedgingPortfolio.latestRecommendation || cache.crossHedgingPortfolio;
            if (top5Candidate.length >= 5 && chRec.pillar3_Xien) {
                const finalTop5 = top5Candidate.slice(0, 5).map(n => String(n).padStart(2, '0') === '23' ? '36' : String(n).padStart(2, '0'));
                const finalTop4 = finalTop5.slice(0, 4);
                chRec.pillar3_Xien.numbers = finalTop4;
                chRec.pillar3_Xien.top5Numbers = finalTop5;
                const getCombinations = (arr, k) => {
                    const result = [];
                    const f = (prefix, remaining, k) => {
                        if (k === 0) { result.push(prefix); return; }
                        for (let i = 0; i <= remaining.length - k; i++) {
                            f([...prefix, remaining[i]], remaining.slice(i + 1), k - 1);
                        }
                    };
                    f([], arr, k);
                    return result;
                };
                chRec.pillar3_Xien.combinations = {
                    x4: [finalTop4],
                    x3: getCombinations(finalTop4, 3),
                    x2: getCombinations(finalTop4, 2)
                };
            }
            registryService.registerDailyBet(expectedPredictionDate, 'crossHedgingPortfolio', chRec);
        }
        if (cache.deDropoffMerge?.latestRecommendation) {
            registryService.registerDailyBet(expectedPredictionDate, 'deDropoffMerge', cache.deDropoffMerge.latestRecommendation);
        }
        if (cache.loDropoff27?.latestRecommendation) {
            registryService.registerDailyBet(expectedPredictionDate, 'loDropoff27', cache.loDropoff27.latestRecommendation);
        }
        if (cache.triCoreDe?.latestRecommendation) {
            registryService.registerDailyBet(expectedPredictionDate, 'triCoreDe', cache.triCoreDe.latestRecommendation);
        }
        if (cache.semanticResonanceSuite?.latestRecommendation) {
            registryService.registerDailyBet(expectedPredictionDate, 'semanticResonanceSuite', cache.semanticResonanceSuite.latestRecommendation);
        }
        if (cache.dualMerge?.latestRecommendation) {
            registryService.registerDailyBet(expectedPredictionDate, 'dualMerge', cache.dualMerge.latestRecommendation);
        }
        if (cache.tripleMerge?.latestRecommendation) {
            registryService.registerDailyBet(expectedPredictionDate, 'tripleMerge', cache.tripleMerge.latestRecommendation);
        }
        if (cache.adaptiveDualMerge?.latestRecommendation) {
            registryService.registerDailyBet(expectedPredictionDate, 'adaptiveDualMerge', cache.adaptiveDualMerge.latestRecommendation);
        }
        if (cache.mirofishSwarm?.latestRecommendation) {
            registryService.registerDailyBet(expectedPredictionDate, 'mirofishSwarm', cache.mirofishSwarm.latestRecommendation);
        }

        cache.dailyLockedBetsRegistry = registryService.loadRegistry();
    } catch (err) {
        console.error('[generateDailyAdvisorCache] Error updating locked bets registry:', err);
    }

    const fs = require('fs');
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(path.join(dataDir, 'cached_daily_method_advisor.json'), JSON.stringify(cache, null, 2));

    const statsDir = path.join(__dirname, '..', 'lib', 'data', 'statistics');
    if (!fs.existsSync(statsDir)) {
        fs.mkdirSync(statsDir, { recursive: true });
    }
    fs.writeFileSync(path.join(statsDir, 'cached_daily_method_advisor.json'), JSON.stringify(cache, null, 2));

    if (cache.deDropoffMerge) {
        try {
            fs.writeFileSync(path.join(statsDir, 'cached_de_dropoff_merge_shadow.json'), JSON.stringify(cache.deDropoffMerge, null, 2));
            fs.writeFileSync(path.join(dataDir, 'cached_de_dropoff_merge_shadow.json'), JSON.stringify(cache.deDropoffMerge, null, 2));
        } catch (_) {}
    }
    if (cache.loDropoff27) {
        try {
            fs.writeFileSync(path.join(statsDir, 'cached_lo_dropoff_27_shadow.json'), JSON.stringify(cache.loDropoff27, null, 2));
            fs.writeFileSync(path.join(dataDir, 'cached_lo_dropoff_27_shadow.json'), JSON.stringify(cache.loDropoff27, null, 2));
        } catch (_) {}
    }

    console.log(JSON.stringify({
        files: [
            'lib/data/statistics/cached_daily_method_advisor.json',
            'data/cached_daily_method_advisor.json'
        ],
        latestDataDate: cache.latestDataDate,
        records: cache.records.length,
        pendingPredictionDate: pendingSnapshot.predictionDate,
        crossHedgingPortfolio: {
            targetDate: cache.crossHedgingPortfolio?.targetDate,
            mode: cache.crossHedgingPortfolio?.mode,
            sizingMultiplier: cache.crossHedgingPortfolio?.sizingMultiplier,
            dailyPositiveProfitRate: cache.crossHedgingPortfolio?.metrics?.dailyPositiveProfitRate,
            cumulativeRoi: cache.crossHedgingPortfolio?.metrics?.cumulativeRoi
        },
        main: cache.summary.main,
        hybrid: cache.summary.hybrid
    }, null, 2));
}

main().catch(error => { console.error(error); process.exit(1); });
