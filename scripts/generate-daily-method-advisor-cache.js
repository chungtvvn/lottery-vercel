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

    if (!existingCache || (typeof existingCache === 'object' && !existingCache.dualMerge && (!existingCache.records || existingCache.records.length === 0))) {
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
        limit: 90,
        forceSynthesize: process.env.FORCE_SYNTHESIZE === '1'
    });
    const expectedPredictionDate = nextIsoDate(cache.latestDataDate);
    const pendingSnapshot = cache.records.find(record => record?.predictionDate === expectedPredictionDate);
    if (!pendingSnapshot || pendingSnapshot.settled || pendingSnapshot.main?.numbers?.length !== service.BET_COUNT) {
        throw new Error(`Thiếu snapshot ngày kế tiếp ${expectedPredictionDate || 'unknown'} sau khi sinh Daily Advisor.`);
    }
    console.log(JSON.stringify({
        file: 'lib/data/statistics/cached_daily_method_advisor.json',
        latestDataDate: cache.latestDataDate,
        records: cache.records.length,
        pendingPredictionDate: pendingSnapshot.predictionDate,
        main: cache.summary.main,
        hybrid: cache.summary.hybrid
    }, null, 2));
}

main().catch(error => { console.error(error); process.exit(1); });
