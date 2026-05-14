const XOSO_HOME_URL = 'https://xoso.com.vn/';
const XOSO_XSMB_URL = 'https://xoso.com.vn/xo-so-mien-bac/xsmb-p1.html';
const XOSO_SOURCE_URLS = [XOSO_HOME_URL, XOSO_XSMB_URL];

const REQUIRED_PRIZE_COUNTS = {
    DB: 1,
    'G.1': 1,
    'G.2': 2,
    'G.3': 6,
    'G.4': 4,
    'G.5': 6,
    'G.6': 3,
    'G.7': 4
};

const DATA_KEYS = [
    'special',
    'prize1',
    'prize2_1', 'prize2_2',
    'prize3_1', 'prize3_2', 'prize3_3', 'prize3_4', 'prize3_5', 'prize3_6',
    'prize4_1', 'prize4_2', 'prize4_3', 'prize4_4',
    'prize5_1', 'prize5_2', 'prize5_3', 'prize5_4', 'prize5_5', 'prize5_6',
    'prize6_1', 'prize6_2', 'prize6_3',
    'prize7_1', 'prize7_2', 'prize7_3', 'prize7_4'
];

async function fetchText(url, options = {}) {
    const timeoutMs = Number(options.timeoutMs || 20000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'accept-language': 'vi-VN,vi;q=0.9,en;q=0.8',
                'cache-control': 'no-cache',
                'pragma': 'no-cache',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 lottery-stats-updater/1.0'
            }
        });

        if (!response.ok) {
            throw new Error(`xoso.com.vn trả về HTTP ${response.status}`);
        }

        return response.text();
    } catch (error) {
        if (error && error.name === 'AbortError') {
            throw new Error(`Timeout sau ${timeoutMs}ms khi tải ${url}`);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function extractEmbeddedLotteryJson(html) {
    const marker = "lottery_jsonC=JSON.parse('";
    const start = html.indexOf(marker);
    if (start === -1) {
        throw new Error('Không tìm thấy lottery_jsonC trong HTML xoso.com.vn');
    }

    const contentStart = start + marker.length;
    let escaped = false;

    for (let i = contentStart; i < html.length; i++) {
        const ch = html[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === '\\') {
            escaped = true;
            continue;
        }
        if (ch === "'" && html.slice(i, i + 3) === "');") {
            return html.slice(contentStart, i);
        }
    }

    throw new Error('Không tìm thấy điểm kết thúc lottery_jsonC');
}

function decodeJsSingleQuotedString(value) {
    return value
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
        .replace(/\\x([0-9a-fA-F]{2})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\');
}

function parseLatestXsmbResult(html) {
    const embedded = extractEmbeddedLotteryJson(html);
    const jsonText = decodeJsSingleQuotedString(embedded);
    const payload = JSON.parse(jsonText);

    if (!Array.isArray(payload) || payload.length === 0) {
        throw new Error('lottery_jsonC không có dữ liệu kết quả');
    }

    const completedResult = payload.find(item =>
        item
        && String(item.Status || '') === '1'
        && item.SpecialResult
        && Array.isArray(item.LotteryPrizeRanges)
    );

    if (!completedResult) {
        throw new Error('Kết quả XSMB chưa hoàn tất hoặc chưa được công bố');
    }

    return completedResult;
}

function normalizeDate(value) {
    const text = String(value || '').trim();
    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

    const vnMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (vnMatch) {
        const [, day, month, year] = vnMatch;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    throw new Error(`Ngày kết quả không hợp lệ: ${text}`);
}

function toLastTwoDigits(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length < 2) {
        throw new Error(`Giá trị giải không hợp lệ: ${value}`);
    }
    return Number(digits.slice(-2));
}

function getPrizeRanges(result, prizeName) {
    const item = result.LotteryPrizeRanges.find(range => String(range.Prize || '').trim() === prizeName);
    if (!item || !Array.isArray(item.Ranges)) {
        throw new Error(`Thiếu dữ liệu giải ${prizeName}`);
    }

    const expectedCount = REQUIRED_PRIZE_COUNTS[prizeName];
    if (item.Ranges.length !== expectedCount) {
        throw new Error(`Giải ${prizeName} có ${item.Ranges.length} số, kỳ vọng ${expectedCount}`);
    }

    return item.Ranges.map(toLastTwoDigits);
}

function convertXosoResultToDataRow(result) {
    const db = getPrizeRanges(result, 'DB');
    const g1 = getPrizeRanges(result, 'G.1');
    const g2 = getPrizeRanges(result, 'G.2');
    const g3 = getPrizeRanges(result, 'G.3');
    const g4 = getPrizeRanges(result, 'G.4');
    const g5 = getPrizeRanges(result, 'G.5');
    const g6 = getPrizeRanges(result, 'G.6');
    const g7 = getPrizeRanges(result, 'G.7');

    const row = {
        date: normalizeDate(result.CrDateTime || result.OpenPrizeTime),
        special: db[0],
        prize1: g1[0],
        prize2_1: g2[0],
        prize2_2: g2[1],
        prize3_1: g3[0],
        prize3_2: g3[1],
        prize3_3: g3[2],
        prize3_4: g3[3],
        prize3_5: g3[4],
        prize3_6: g3[5],
        prize4_1: g4[0],
        prize4_2: g4[1],
        prize4_3: g4[2],
        prize4_4: g4[3],
        prize5_1: g5[0],
        prize5_2: g5[1],
        prize5_3: g5[2],
        prize5_4: g5[3],
        prize5_5: g5[4],
        prize5_6: g5[5],
        prize6_1: g6[0],
        prize6_2: g6[1],
        prize6_3: g6[2],
        prize7_1: g7[0],
        prize7_2: g7[1],
        prize7_3: g7[2],
        prize7_4: g7[3]
    };

    const invalidKey = DATA_KEYS.find(key => !Number.isInteger(row[key]) || row[key] < 0 || row[key] > 99);
    if (invalidKey) {
        throw new Error(`Dữ liệu ${invalidKey} không hợp lệ sau khi parse xoso.com.vn`);
    }

    return row;
}

async function fetchLatestXsmbResult(options = {}) {
    const urls = options.urls || (options.url ? [options.url] : XOSO_SOURCE_URLS);
    const uniqueUrls = [...new Set(urls.filter(Boolean))];
    const errors = [];

    for (const url of uniqueUrls) {
        try {
            const html = await fetchText(url, { timeoutMs: options.timeoutMs });
            const row = convertXosoResultToDataRow(parseLatestXsmbResult(html));
            Object.defineProperty(row, '_sourceUrl', {
                value: url,
                enumerable: false
            });
            return row;
        } catch (error) {
            errors.push(`${url}: ${error.message}`);
            if (options.throwOnFirstError) {
                throw error;
            }
        }
    }

    throw new Error(`Không lấy được kết quả XSMB từ xoso.com.vn. ${errors.join(' | ')}`);
}

module.exports = {
    XOSO_HOME_URL,
    XOSO_XSMB_URL,
    XOSO_SOURCE_URLS,
    parseLatestXsmbResult,
    convertXosoResultToDataRow,
    fetchLatestXsmbResult
};
