const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { fetchLatestXsmbResult, XOSO_XSMB_URL } = require('./sources/xoso-com-vn');

const LEGACY_DATA_URL = 'https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/refs/heads/main/data/xsmb-2-digits.json';
const DATA_DIR = path.join(__dirname, '..', 'lib', 'data');
const JSON_FILE = path.join(DATA_DIR, 'xsmb-2-digits.json');

async function readJsonIfExists(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch (e) {
        return null;
    }
}

function getLatestDateValue(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const latest = rows[rows.length - 1];
    return latest && latest.date ? String(latest.date).substring(0, 10) : null;
}

function hasRawDataChanged(currentRows, nextRows) {
    if (!Array.isArray(currentRows) || !Array.isArray(nextRows)) return true;
    if (currentRows.length !== nextRows.length) return true;

    const currentLatest = getLatestDateValue(currentRows);
    const nextLatest = getLatestDateValue(nextRows);
    if (currentLatest !== nextLatest) return true;

    const currentLast = currentRows[currentRows.length - 1] || {};
    const nextLast = nextRows[nextRows.length - 1] || {};
    return JSON.stringify(normalizeDataRow(currentLast)) !== JSON.stringify(normalizeDataRow(nextLast));
}

async function downloadData() {
    return new Promise((resolve, reject) => {
        https.get(LEGACY_DATA_URL, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error('Failed to fetch data: ' + res.statusCode));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function normalizeDataRow(row) {
    return {
        date: String(row.date || '').substring(0, 10),
        special: Number(row.special),
        prize1: Number(row.prize1),
        prize2_1: Number(row.prize2_1),
        prize2_2: Number(row.prize2_2),
        prize3_1: Number(row.prize3_1),
        prize3_2: Number(row.prize3_2),
        prize3_3: Number(row.prize3_3),
        prize3_4: Number(row.prize3_4),
        prize3_5: Number(row.prize3_5),
        prize3_6: Number(row.prize3_6),
        prize4_1: Number(row.prize4_1),
        prize4_2: Number(row.prize4_2),
        prize4_3: Number(row.prize4_3),
        prize4_4: Number(row.prize4_4),
        prize5_1: Number(row.prize5_1),
        prize5_2: Number(row.prize5_2),
        prize5_3: Number(row.prize5_3),
        prize5_4: Number(row.prize5_4),
        prize5_5: Number(row.prize5_5),
        prize5_6: Number(row.prize5_6),
        prize6_1: Number(row.prize6_1),
        prize6_2: Number(row.prize6_2),
        prize6_3: Number(row.prize6_3),
        prize7_1: Number(row.prize7_1),
        prize7_2: Number(row.prize7_2),
        prize7_3: Number(row.prize7_3),
        prize7_4: Number(row.prize7_4)
    };
}

function sortRowsByDate(rows) {
    return [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function daysBetweenDates(fromDate, toDate) {
    if (!fromDate || !toDate) return 0;
    const from = new Date(`${fromDate}T00:00:00Z`);
    const to = new Date(`${toDate}T00:00:00Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
    return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function mergeRowsByDate(currentRows, incomingRows) {
    const byDate = new Map();
    for (const row of currentRows || []) {
        const normalized = normalizeDataRow(row);
        if (normalized.date) byDate.set(normalized.date, normalized);
    }
    for (const row of incomingRows || []) {
        const normalized = normalizeDataRow(row);
        if (normalized.date) byDate.set(normalized.date, normalized);
    }
    return sortRowsByDate(Array.from(byDate.values()));
}

function convertFormat(rawDataStr) {
    const raw = JSON.parse(rawDataStr);
    // xsmb-2-digits.json format: { date: '2026-03-24T00:00:00.000', special: 29, prize1: 31, ... }
    // The generators expect standard format dates that statisticsGenerator parses with its parseDate / formatDate logic
    return { data: raw.map(item => {
        // Mặc dù data nguồn date có chữ T, generators tự split theo ngày/tháng/năm
        // Wait, statisticsGenerator.js có:
        //    const [day, month, year] = dateString.split('/');
        // Which means it expects input strings to be "DD/MM/YYYY" !!
        
        let dateSplitStr = '';
        if (item.date.includes('T')) {
            dateSplitStr = item.date.split('T')[0]; // Format là YYYY-MM-DD
        } else {
            // Re-convert fallback to YYYY-MM-DD if needed, assuming old ones are DD/MM/YYYY? 
            if (item.date.includes('/')) {
                const [d, m, y] = item.date.split('/');
                dateSplitStr = `${y}-${m}-${d}`;
            } else {
                dateSplitStr = item.date;
            }
        }

        return {
            date: dateSplitStr,
            special: Number(item.special),
            prize1: Number(item.prize1),
            prize2_1: Number(item.prize2_1),
            prize2_2: Number(item.prize2_2),
            prize3_1: Number(item.prize3_1),
            prize3_2: Number(item.prize3_2),
            prize3_3: Number(item.prize3_3),
            prize3_4: Number(item.prize3_4),
            prize3_5: Number(item.prize3_5),
            prize3_6: Number(item.prize3_6),
            prize4_1: Number(item.prize4_1),
            prize4_2: Number(item.prize4_2),
            prize4_3: Number(item.prize4_3),
            prize4_4: Number(item.prize4_4),
            prize5_1: Number(item.prize5_1),
            prize5_2: Number(item.prize5_2),
            prize5_3: Number(item.prize5_3),
            prize5_4: Number(item.prize5_4),
            prize5_5: Number(item.prize5_5),
            prize5_6: Number(item.prize5_6),
            prize6_1: Number(item.prize6_1),
            prize6_2: Number(item.prize6_2),
            prize6_3: Number(item.prize6_3),
            prize7_1: Number(item.prize7_1),
            prize7_2: Number(item.prize7_2),
            prize7_3: Number(item.prize7_3),
            prize7_4: Number(item.prize7_4)
        };
    })};
}

async function getLegacyFormattedRows() {
    const rawDataStr = await downloadData();
    return convertFormat(rawDataStr).data;
}

async function buildRawDataFromSources(currentArray) {
    let finalArray = Array.isArray(currentArray) ? sortRowsByDate(currentArray.map(normalizeDataRow)) : [];
    const sourceLog = [];

    if (finalArray.length === 0 || process.env.REFRESH_FULL_DATA === '1') {
        console.log('[1a] Local raw data trống hoặc REFRESH_FULL_DATA=1, tải full data fallback từ Github...');
        finalArray = await getLegacyFormattedRows();
        sourceLog.push(`legacy-full:${getLatestDateValue(finalArray)}`);
    }

    try {
        console.log(`[1b] Lấy kết quả XSMB mới nhất từ ${XOSO_XSMB_URL}...`);
        const latestXosoRow = await fetchLatestXsmbResult();
        const latestLocalDate = getLatestDateValue(finalArray);
        const gapDays = daysBetweenDates(latestLocalDate, latestXosoRow.date);

        if (gapDays > 1) {
            console.warn(`[1c] Phát hiện thiếu ${gapDays - 1} ngày giữa local=${latestLocalDate} và xoso=${latestXosoRow.date}. Thử fallback full data để lấp khoảng trống...`);
            try {
                finalArray = mergeRowsByDate(finalArray, await getLegacyFormattedRows());
                sourceLog.push(`legacy-gap-fill:${getLatestDateValue(finalArray)}`);
            } catch (fallbackError) {
                console.warn(`[1c] Fallback full data lỗi, vẫn upsert ngày mới nhất từ xoso.com.vn: ${fallbackError.message}`);
            }
        }

        finalArray = mergeRowsByDate(finalArray, [latestXosoRow]);
        sourceLog.push(`xoso:${latestXosoRow.date}`);
        console.log(`[1d] Đã parse kết quả xoso.com.vn ngày ${latestXosoRow.date}, ĐB=${String(latestXosoRow.special).padStart(2, '0')}`);
    } catch (xosoError) {
        console.warn(`[1b] Không lấy được kết quả xoso.com.vn: ${xosoError.message}`);
        if (finalArray.length === 0) {
            throw xosoError;
        }
    }

    return {
        data: finalArray,
        source: sourceLog.join(' + ') || 'local'
    };
}

async function main() {
    await fs.mkdir(path.join(DATA_DIR, 'statistics'), { recursive: true });
    const currentArray = await readJsonIfExists(JSON_FILE);
    console.log(`[1] Đọc dữ liệu local: ${Array.isArray(currentArray) ? currentArray.length : 0} bản ghi, latest=${getLatestDateValue(currentArray) || 'none'}`);
    console.log('[2] Cập nhật dữ liệu từ nguồn độc lập xoso.com.vn...');
    const { data: finalArray, source } = await buildRawDataFromSources(currentArray);

    if (!hasRawDataChanged(currentArray, finalArray)) {
        console.log(`[3] RAW_DATA không đổi (latest=${getLatestDateValue(finalArray)}, rows=${finalArray.length}, source=${source}). Bỏ qua generate stats để tiết kiệm Action time.`);
        return;
    }

    await fs.writeFile(JSON_FILE, JSON.stringify(finalArray, null, 0), 'utf-8');
    console.log(`[3] Ghi file xsmb-2-digits.json (RAW_DATA) thành công! (${finalArray.length} bản ghi, latest=${getLatestDateValue(finalArray)}, source=${source})`);

    console.log('[4] Chạy luồng sinh Thống kê Statically (Không cần DB)...');
    
    try {
        const generateNumberStats = require('../lib/generators/statisticsGenerator.js');
        const generateHeadTailStats = require('../lib/generators/headTailStatsGenerator.js');
        const generateSumDiffStats = require('../lib/generators/sumDifferenceStatsGenerator.js');
        
        console.log(' -> Tạo Data Number Stats...');
        await generateNumberStats();
        
        console.log(' -> Tạo Data Head/Tail Stats...');
        await generateHeadTailStats();
        
        console.log(' -> Tạo Data Sum/Diff Stats...');
        await generateSumDiffStats();
        
        console.log(' -> Load dữ liệu nội bộ và Sinh Quick Stats...');
        const ls = require('../lib/services/lotteryService.js');
        const ss = require('../lib/services/statisticsService.js');
        const he = require('../lib/services/historicalExclusionService.js');
        
        ls.clearCache();
        ss.clearCache();
        he.clearCache();
        
        // Load nội bộ từ các file vừa tạo
        await ls.loadRawData();
        await ls.loadStats();
        
        const quickStats = await ss.getQuickStats();
        // Minify: Xoá fullSequence khỏi longest/secondLongest/current để giảm kích thước
        function stripFullSequence(obj, isPreserved = false) {
            if (!obj || typeof obj !== 'object') return obj;
            
            if (Array.isArray(obj)) {
                return obj.map(item => stripFullSequence(item, isPreserved));
            }

            const result = {};
            for (const [key, val] of Object.entries(obj)) {
                if (key === 'fullSequence' && !isPreserved) {
                    continue; // Skip fullSequence for non-preserved streaks
                }

                if (key === 'current' || key === 'longest' || key === 'secondLongest') {
                    // Preserve fullSequence for these key streaks (Dashboard & Accordion)
                    result[key] = stripFullSequence(val, true);
                } else if (key === 'streaks') {
                    // Strip fullSequence for the bulk 'streaks' list (History results)
                    // These are hydrated at runtime by the API if needed.
                    result[key] = stripFullSequence(val, false);
                } else if (typeof val === 'object') {
                    result[key] = stripFullSequence(val, isPreserved);
                } else {
                    result[key] = val;
                }
            }
            return result;
        }
        const minifiedQS = stripFullSequence(quickStats);
        await fs.writeFile(path.join(DATA_DIR, 'statistics', 'quick_stats.json'), JSON.stringify(minifiedQS, null, 0));
        console.log('✅ Đã lưu kết quả quick_stats.json (minified)');
        
        // --- NEW: Immediately clear memory for quickStats ---
        // (Helpful if memory is tight)
        
        const historyStats = await ss.getQuickStatsHistory();
        // Strip fullSequence from history streaks too
        const minifiedHistory = historyStats.map(entry => ({
            ...entry,
            streaks: entry.streaks ? entry.streaks.map(({ fullSequence, ...rest }) => rest) : []
        }));
        await fs.writeFile(path.join(DATA_DIR, 'statistics', 'quick_stats_history.json'), JSON.stringify(minifiedHistory, null, 0));
        console.log('✅ Đã lưu kết quả quick_stats_history.json (minified)');
        
        console.log(' -> Tạo Data Caching Predictions...');
        const unifiedPrediction = require('../lib/services/unifiedPredictionService');
        const hybridAIPrediction = require('../lib/services/hybridAIPredictionService');
        const advancedAnalysis = require('../lib/services/advancedAnalysisService');
        
        console.log(' -> Tạo Unified Prediction...');
        const unifiedResult = await unifiedPrediction.getDailyPrediction({ topCount: 40 });
        
        console.log(' -> Tạo Advanced Analysis...');
        const advancedResult = await advancedAnalysis.getDailyAdvancedPrediction({ topCount: 40, excludeCount: 60 });
        
        console.log(' -> Tạo Hybrid Prediction...');
        const hybridResult = await hybridAIPrediction.getHybridPrediction({ topCount: 40, excludeCount: 60 });
        
        const cachedPredictions = {
            unified: unifiedResult,
            advanced: {
                predictions: advancedResult.predictions,
                exclusions: advancedResult.exclusions,
                allNumbers: advancedResult.allNumbers
            },
            hybrid: hybridResult,
            dataDate: ls.getRawData() && ls.getRawData().length > 0 ? ls.getRawData()[ls.getRawData().length - 1].date.substring(0, 10) : new Date().toISOString()
        };
        await fs.writeFile(path.join(DATA_DIR, 'statistics', 'cached_predictions.json'), JSON.stringify(cachedPredictions, null, 0));
        console.log('✅ Đã lưu kết quả cached_predictions.json');

        // PRE-COMPUTE: Suggestions (to avoid Vercel serverless timeout)
        console.log(' -> Tạo Cached Suggestions...');
        try {
            const suggestionsController = require('../lib/controllers/suggestionsController');
            let suggestionsResult;
            const mockReq = { query: { gapStrategy: 'COMBINED', gapBuffer: '0', strategy: 'BALANCED' } };
            const mockRes = { json(d) { suggestionsResult = d; return mockRes; }, status(c) { mockRes._status = c; return mockRes; }, _status: 200 };
            await suggestionsController.getSuggestions(mockReq, mockRes);
            if (suggestionsResult) {
                await fs.writeFile(path.join(DATA_DIR, 'statistics', 'cached_suggestions.json'), JSON.stringify(suggestionsResult, null, 0));
                console.log('✅ Đã lưu kết quả cached_suggestions.json');
            }
        } catch (sugErr) {
            console.error('⚠️ Lỗi khi tạo cached suggestions (không ảnh hưởng các bước khác):', sugErr.message);
        }

        
        // BƯỚC ĐẶC BIỆT: Minify để xóa fullSequence (cứu github khỏi bị lố 100MB giới hạn)
        console.log('[+] Đang minify siêu gọn các file stats...');
        
        function minifyStreak(streak) {
            if (!streak) return streak;
            const { fullSequence, ...mini } = streak;
            return mini;
        }

        function minifyStatsObject(stats) {
            if (!stats || typeof stats !== 'object') return stats;
            const result = {};
            
            for (const key of Object.keys(stats)) {
                const val = stats[key];
                if (!val) {
                    result[key] = val;
                    continue;
                }

                if (Array.isArray(val.streaks)) {
                    result[key] = { 
                        ...val, 
                        streaks: val.streaks.map(minifyStreak) 
                    };
                } else if (typeof val === 'object' && !Array.isArray(val)) {
                    // Handle nested structures like head_tail_stats
                    result[key] = {};
                    for (const subKey of Object.keys(val)) {
                        const sub = val[subKey];
                        if (sub && Array.isArray(sub.streaks)) {
                            result[key][subKey] = { 
                                ...sub, 
                                streaks: sub.streaks.map(minifyStreak) 
                            };
                        } else {
                            result[key][subKey] = sub;
                        }
                    }
                } else {
                    result[key] = val;
                }
            }
            return result;
        }

        const statFiles = ['number_stats.json', 'head_tail_stats.json', 'sum_difference_stats.json'];
        for (const f of statFiles) {
            const p = path.join(DATA_DIR, 'statistics', f);
            if (require('fs').existsSync(p)) {
                try {
                    console.log(` -> Đang xử lý ${f}...`);
                    const content = await fs.readFile(p, 'utf8');
                    // Check if content is valid before parsing
                    if (!content || content.length < 2) continue;
                    
                    const raw = JSON.parse(content);
                    const minified = minifyStatsObject(raw);
                    
                    await fs.writeFile(p, JSON.stringify(minified, null, 0)); 
                    console.log(`    ✅ Đã nén ${f}`);
                    
                    // GC hint (if possible)
                    // global.gc && global.gc(); 
                } catch (miniErr) {
                    console.error(`    ⚠️ Lỗi khi nén ${f}:`, miniErr.message);
                    // If it failed due to "Bad control character", try to fix it or skip
                }
            }
        }
        console.log('✅ Minify thành công!');
        
    } catch (err) {
        console.error('Lỗi khi chạy Generators:', err.message);
        process.exit(1);
    }
    
    console.log('[5] Hoàn tất Update Workflow Tĩnh (Static). Các file json đã sẵn sàng trong lib/data/statistics/');
}

main().catch(console.error);
