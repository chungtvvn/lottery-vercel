const crypto = require('crypto');

const QUICK_STATS_SHARD_COUNT = Number(process.env.QUICK_STATS_SHARD_COUNT || 64);

function getQuickStatsShardId(key, shardCount = QUICK_STATS_SHARD_COUNT) {
    const normalizedKey = String(key || '');
    const hash = crypto.createHash('sha1').update(normalizedKey).digest();
    const id = hash.readUInt16BE(0) % shardCount;
    return String(id).padStart(2, '0');
}

function getQuickStatsShardFileName(shardId) {
    return `quick_stats_shard_${String(shardId).padStart(2, '0')}.json`;
}

module.exports = {
    QUICK_STATS_SHARD_COUNT,
    getQuickStatsShardId,
    getQuickStatsShardFileName
};
