const { getQuickStatsHistoryFromCache } = require('./lib/data-access');
(async () => {
    try {
        const res = await getQuickStatsHistoryFromCache();
        console.log("Length:", res ? res.length : "null");
    } catch(e) { console.error(e) }
})();
