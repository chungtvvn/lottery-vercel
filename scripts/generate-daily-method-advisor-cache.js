#!/usr/bin/env node
'use strict';

const service = require('../lib/services/dailyMethodAdvisorService');

async function main() {
    const { getRawData, loadJsonWithSupabaseFallback } = require('../lib/data-access');
    const useLocalHistory = process.env.DAILY_ADVISOR_USE_LOCAL_HISTORY === '1';
    let history = null;
    let existing = null;
    try {
        if (!useLocalHistory) {
            history = await loadJsonWithSupabaseFallback('cached_prediction_history.json');
            if (!Array.isArray(history)) throw new Error('cached_prediction_history.json không hợp lệ');
        }
        const remote = await loadJsonWithSupabaseFallback('cached_daily_method_advisor.json');
        existing = remote?.records || remote;
    } catch (error) {
        console.log(`[DailyAdvisor] Chưa có cache R2 cũ hoặc lịch sử chưa tải được: ${error.message}`);
    }
    if (useLocalHistory) {
        console.log('[DailyAdvisor] Dùng cached_prediction_history.json vừa sinh cục bộ trong action.');
    }
    const raw = await getRawData();
    const cache = await service.generateAndWriteCache({ history: history || undefined, raw, existing, limit: 90 });
    console.log(JSON.stringify({
        file: 'lib/data/statistics/cached_daily_method_advisor.json',
        latestDataDate: cache.latestDataDate,
        records: cache.records.length,
        main: cache.summary.main,
        experimental: cache.summary.experimental
    }, null, 2));
}

main().catch(error => { console.error(error); process.exit(1); });
