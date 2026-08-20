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
const {
    buildBacktestFingerprint,
    hashCanonical,
    readJsonSnapshot
} = require('../lib/utils/backtestFingerprint');

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

async function loadRawData(rawFile = null) {
    if (rawFile) return readJsonSnapshot(path.resolve(rawFile));
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
    const rawFile = args.get('rawFile') || null;
    const rawData = await loadRawData(rawFile);
    const latestDate = normalizeDate(rawData.at(-1)?.date);
    const year = Number(args.get('year') || latestDate?.slice(0, 4) || new Date().getFullYear());
    const startDate = args.get('start') || `${year}-01-01`;
    const endDate = args.get('end') || latestDate;
    const rowsInRange = rawData.filter(row => {
        const date = normalizeDate(row.date);
        return date && date >= startDate && date <= endDate;
    });
    if (!rowsInRange.length) throw new Error(`Không có raw data trong ${startDate}..${endDate}`);
    const startIndex = rawData.findIndex(row => normalizeDate(row.date) >= startDate);
    const lastIndex = rawData.reduce((result, row, index) => (
        normalizeDate(row.date) <= endDate ? index : result
    ), -1);
    if (startIndex < 1 || lastIndex < startIndex) {
        throw new Error(`Không xác định được chỉ số backtest cho ${startDate}..${endDate}`);
    }

    const requestedMethodIds = String(args.get('methodIds') || 'dedupEdge75Hold70')
        .split(',')
        .map(value => value.trim())
        .filter(value => METHOD_META[value]);
    if (requestedMethodIds.length === 0) {
        throw new Error('methodIds không hợp lệ hoặc không có phương pháp được hỗ trợ.');
    }

    const result = await simulationService.runBacktest(rowsInRange.length, rawData, {
        startIndex,
        endIndexExclusive: lastIndex + 1,
        rollingHistory: true,
        strictPointInTime: true,
        playMode: 'both',
        methodIds: requestedMethodIds.join(','),
        selectedStreakDetailLimit: 0,
        compactDetails: true,
        clearHistoryCacheInterval: Number(process.env.BACKTEST_CLEAR_HISTORY_CACHE_INTERVAL || 20),
        progress: true
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
        generatedAt: new Date().toISOString(),
        methodIds: requestedMethodIds,
        source: {
            mode: 'strict-prefix-regenerated-before-each-prediction',
            immutableLiveOverrides: true,
            strictPointInTime: true,
            eligibleForPromotion: true,
            warning: 'Mỗi ngày tái sinh thống kê từ raw prefix kết thúc ở ngày trước dự đoán. Snapshot thực tế đã phát hành ghi đè backtest cùng ngày.'
        }
    });
    const fingerprintConfig = {
        startDate,
        endDate,
        methodIds: requestedMethodIds,
        rollingHistory: true,
        strictPointInTime: true,
        playMode: 'both',
        selectedStreakDetailLimit: 0,
        compactDetails: true
    };
    cache.fingerprint = buildBacktestFingerprint({
        rawData: rawData.filter(row => normalizeDate(row.date) <= endDate),
        config: fingerprintConfig,
        baselineCutoffDate: null,
        methodologyVersion: 'strict-prefix-edge75-history-v1',
        sourceFiles: [
            __filename,
            path.join(process.cwd(), 'lib', 'services', 'simulationService.js'),
            path.join(process.cwd(), 'lib', 'services', 'historicalExclusionService.js'),
            path.join(process.cwd(), 'lib', 'services', 'predictionHistoryPerformanceService.js')
        ],
        sourceLabel: rawFile ? path.relative(process.cwd(), path.resolve(rawFile)) : 'R2-or-local-live'
    });
    cache.resultSha256 = hashCanonical({
        period: cache.period,
        selectedMethodId: cache.selectedMethodId,
        methods: cache.methods
    });
    const outputPath = writePerformanceCache(cache);
    console.log(JSON.stringify({
        outputPath,
        startDate,
        endDate,
        strictPointInTime: true,
        methodIds: requestedMethodIds,
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
