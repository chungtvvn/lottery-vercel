const fs = require('fs').promises;
const path = require('path');
const https = require('https');

const DATA_URL = 'https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/refs/heads/main/data/xsmb-2-digits.json';
const DATA_DIR = path.join(process.cwd(), 'lib', 'data');
const JSON_FILE = path.join(DATA_DIR, 'xsmb-2-digits.json');

async function downloadData() {
    return new Promise((resolve, reject) => {
        https.get(DATA_URL, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error('Failed to fetch data: ' + res.statusCode));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
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

async function main() {
    console.log('[1] Tải dữ liệu từ Nguồn Github...');
    const rawDataStr = await downloadData();
    console.log('[2] Chuyển đổi format dữ liệu...');
    const formattedData = convertFormat(rawDataStr);
    
    const { data: finalArray } = formattedData;
    
    await fs.mkdir(path.join(DATA_DIR, 'statistics'), { recursive: true });
    await fs.writeFile(JSON_FILE, JSON.stringify(finalArray, null, 2), 'utf-8');
    console.log('[3] Ghi file xsmb-2-digits.json (RAW_DATA) thành công! (' + finalArray.length + ' bản ghi)');

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
        await fs.writeFile(path.join(DATA_DIR, 'statistics', 'quick_stats.json'), JSON.stringify(quickStats, null, 2));
        console.log('✅ Đã lưu kết quả quick_stats.json');
        
        const historyStats = await ss.getQuickStatsHistory();
        await fs.writeFile(path.join(DATA_DIR, 'statistics', 'quick_stats_history.json'), JSON.stringify(historyStats, null, 2));
        console.log('✅ Đã lưu kết quả quick_stats_history.json');
        
        // BƯỚC ĐẶC BIỆT: Minify để xóa fullSequence (cứu github khỏi bị lố 100MB giới hạn)
        console.log('[+] Đang minify siêu gọn các file stats...');
        function minifyStats(stats) {
            const result = {};
            function minifyStreak(streak) {
                if (!streak) return streak;
                const { fullSequence, ...mini } = streak;
                return mini;
            }
            for (const key of Object.keys(stats)) {
                const val = stats[key];
                if (val && Array.isArray(val.streaks)) {
                    result[key] = { description: val.description, streaks: val.streaks.map(minifyStreak) };
                } else if (val && typeof val === 'object' && !Array.isArray(val)) {
                    result[key] = {};
                    for (const subKey of Object.keys(val)) {
                        const sub = val[subKey];
                        if (sub && Array.isArray(sub.streaks)) {
                            result[key][subKey] = { description: sub.description, streaks: sub.streaks.map(minifyStreak) };
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
                const raw = JSON.parse(await fs.readFile(p, 'utf8'));
                await fs.writeFile(p, JSON.stringify(minifyStats(raw), null, 0)); // dùng null, 0 cho bé nhất có thể
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
