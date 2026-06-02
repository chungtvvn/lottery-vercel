#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
    QUICK_STATS_SHARD_COUNT,
    getQuickStatsShardId,
    getQuickStatsShardFileName
} = require('../lib/utils/quickStatsShards');

const STATS_DIR = path.join(__dirname, '..', 'lib', 'data', 'statistics');
const QUICK_STATS_PATH = path.join(STATS_DIR, 'quick_stats.json');

function main() {
    if (!fs.existsSync(QUICK_STATS_PATH)) {
        throw new Error(`Không tìm thấy ${QUICK_STATS_PATH}`);
    }

    const quickStats = JSON.parse(fs.readFileSync(QUICK_STATS_PATH, 'utf8'));
    const shards = new Map();

    for (let index = 0; index < QUICK_STATS_SHARD_COUNT; index++) {
        shards.set(String(index).padStart(2, '0'), {});
    }

    for (const [key, value] of Object.entries(quickStats || {})) {
        if (key === '_meta') continue;
        const shardId = getQuickStatsShardId(key);
        shards.get(shardId)[key] = value;
    }

    let totalKeys = 0;
    for (const [shardId, payload] of shards.entries()) {
        const keys = Object.keys(payload);
        totalKeys += keys.length;
        const filePath = path.join(STATS_DIR, getQuickStatsShardFileName(shardId));
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 0));
    }

    console.log(`[QuickStatsShards] Đã sinh ${shards.size} shard từ ${totalKeys} quick_stats keys.`);
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error('[QuickStatsShards] Lỗi:', error.message);
        process.exit(1);
    }
}

module.exports = main;
