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
        existingCache: existingCache
    });
    const expectedPredictionDate = nextIsoDate(cache.latestDataDate);
    const pendingSnapshot = cache.records.find(record => record?.predictionDate === expectedPredictionDate);
    if (!pendingSnapshot || pendingSnapshot.settled || pendingSnapshot.main?.numbers?.length !== service.BET_COUNT) {
        throw new Error(`Thiếu snapshot ngày kế tiếp ${expectedPredictionDate || 'unknown'} sau khi sinh Daily Advisor.`);
    }

    try {
        const { buildTriCoreDeAdvisor } = require('../lib/services/triCoreDeAdvisorService');
        cache.triCoreDe = buildTriCoreDeAdvisor(raw, cache, { existingTriCoreDe: existingCache?.triCoreDe });
    } catch (err) {
        console.error('[generateDailyAdvisorCache] Error building triCoreDe:', err);
    }

    try {
        const { buildDeDropoffMergeAdvisor } = require('../lib/services/deDropoffMergeAdvisorService');
        cache.deDropoffMerge = buildDeDropoffMergeAdvisor(raw, cache, { existingDeDropoffMerge: existingCache?.deDropoffMerge });
    } catch (err) {
        console.error('[generateDailyAdvisorCache] Error building deDropoffMerge:', err);
    }

    try {
        const { buildLoDropoff27Advisor } = require('../lib/services/loDropoff27AdvisorService');
        cache.loDropoff27 = buildLoDropoff27Advisor(raw, cache, { existingLoDropoff27: existingCache?.loDropoff27 });
    } catch (err) {
        console.error('[generateDailyAdvisorCache] Error building loDropoff27:', err);
    }

    try {
        const { buildSemanticResonanceSuiteAdvisor } = require('../lib/services/semanticResonanceSuiteAdvisorService');
        cache.semanticResonanceSuite = buildSemanticResonanceSuiteAdvisor(raw, cache, { existingSemanticResonanceSuite: existingCache?.semanticResonanceSuite });
    } catch (err) {
        console.error('[generateDailyAdvisorCache] Error building semanticResonanceSuite:', err);
    }

    // Tích hợp Single Source of Truth (SSOT) Registry
    try {
        const registryService = require('../lib/services/dailyLockedBetsRegistryService');
        const latestRawRow = (raw || []).find(r => (r.date || r.ngay) === cache.latestDataDate);
        if (latestRawRow) {
            registryService.settleDateDirectly(cache.latestDataDate, latestRawRow);
        }

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
        if (cache.lo4EngineFusion?.latestRecommendation?.xien4?.top5) {
            registryService.registerDailyBet(expectedPredictionDate, 'loXien5', {
                top5: cache.lo4EngineFusion.latestRecommendation.xien4.top5.map(n => String(n).padStart(2, '0')),
                stakeK: 55000
            });
        }
        if (cache.lo4EngineFusion?.latestRecommendation) {
            registryService.registerDailyBet(expectedPredictionDate, 'lo4EngineFusion', cache.lo4EngineFusion.latestRecommendation);
        }
        if (cache.crossHedgingPortfolio?.latestRecommendation || cache.crossHedgingPortfolio) {
            registryService.registerDailyBet(expectedPredictionDate, 'crossHedgingPortfolio', cache.crossHedgingPortfolio.latestRecommendation || cache.crossHedgingPortfolio);
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
