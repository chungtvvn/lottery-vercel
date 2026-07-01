require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const simulationService = require('../lib/services/simulationService');
const {
    METHOD_META,
    buildPerformanceCache,
    writePerformanceCache
} = require('../lib/services/predictionHistoryPerformanceService');

function parseArgs(argv = process.argv.slice(2)) {
    return new Map(argv.map(arg => {
        const [key, ...rest] = String(arg).replace(/^--/, '').split('=');
        return [key, rest.join('=') || '1'];
    }));
}

function normalizeDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

async function loadRawData() {
    const publicUrl = String(process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL || '').replace(/\/$/, '');
    if (publicUrl) {
        const response = await fetch(`${publicUrl}/data/xsmb-2-digits.json.gz?ts=${Date.now()}`, {
            cache: 'no-store'
        });
        if (!response.ok) throw new Error(`R2 raw HTTP ${response.status}`);
        return JSON.parse(zlib.gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8'));
    }
    return JSON.parse(fs.readFileSync(
        path.join(process.cwd(), 'lib', 'data', 'xsmb-2-digits.json'),
        'utf8'
    ));
}

async function main() {
    const args = parseArgs();
    const rawData = await loadRawData();
    const latestDate = normalizeDate(rawData.at(-1)?.date);
    const year = Number(args.get('year') || latestDate?.slice(0, 4) || new Date().getFullYear());
    const startDate = args.get('start') || `${year}-01-01`;
    const endDate = args.get('end') || latestDate;
    const rowsInRange = rawData.filter(row => {
        const date = normalizeDate(row.date);
        return date && date >= startDate && date <= endDate;
    });
    if (!rowsInRange.length) throw new Error(`Không có raw data trong ${startDate}..${endDate}`);

    const result = await simulationService.runBacktest(rowsInRange.length, rawData, {
        rollingHistory: true,
        playMode: 'both',
        methodIds: Object.keys(METHOD_META).join(','),
        selectedStreakDetailLimit: 0,
        compactDetails: true,
        clearHistoryCacheInterval: Number(process.env.BACKTEST_CLEAR_HISTORY_CACHE_INTERVAL || 20)
    });
    if (!result || result.error) throw new Error(result?.error || 'Backtest không trả dữ liệu');

    const historyPath = path.join(
        process.cwd(),
        'lib',
        'data',
        'statistics',
        'cached_prediction_history.json'
    );
    const predictionHistory = fs.existsSync(historyPath)
        ? JSON.parse(fs.readFileSync(historyPath, 'utf8'))
        : [];
    const cache = buildPerformanceCache({
        backtestDetails: result.details || [],
        predictionHistory,
        startDate,
        endDate,
        generatedAt: new Date().toISOString()
    });
    const outputPath = writePerformanceCache(cache);
    console.log(JSON.stringify({
        outputPath,
        startDate,
        endDate,
        methods: Object.fromEntries(Object.entries(cache.methods).map(([methodId, method]) => [
            methodId,
            {
                days: method.summary.days,
                hitRate: method.summary.hitRate,
                profitK: method.summary.profitK,
                roi: method.summary.roi
            }
        ]))
    }, null, 2));
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
