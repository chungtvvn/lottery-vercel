#!/usr/bin/env node

/**
 * Builds the start-of-year performance cache from R2 raw data.
 * This is intentionally separate from the daily prediction job: the report is
 * an on-demand, expensive artifact while daily prediction remains lightweight.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const DATA_DIR = path.join(process.cwd(), 'lib', 'data', 'statistics');
const OUTPUT_FILE = path.join(DATA_DIR, 'cached_profit_report_2026.json');
const YEAR = Number(process.env.PROFIT_REPORT_YEAR || new Date().getFullYear());
const DE_STAKE_K = Number(process.env.PROFIT_REPORT_DE_STAKE_K || 1000);
const DE_PAYOUT_K = Number(process.env.PROFIT_REPORT_DE_PAYOUT_K || 84000);
const LOTO_STAKE_K = Number(process.env.PROFIT_REPORT_LOTO_STAKE_K || 2200);
const LOTO_PAYOUT_K = Number(process.env.PROFIT_REPORT_LOTO_PAYOUT_K || 8000);

function r2Url() {
    return String(process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL || process.env.CLOUDFLARE_R2_PUBLIC_URL || '')
        .trim()
        .replace(/\/$/, '');
}

function isoDate(value) {
    const text = String(value || '').trim();
    const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

function displayDate(value) {
    const iso = isoDate(value);
    if (!iso) return '';
    const [year, month, day] = iso.split('-');
    return `${day}/${month}/${year}`;
}

function fmtNumber(value) {
    return String(Number(value)).padStart(2, '0');
}

async function loadRawFromR2() {
    const base = r2Url();
    if (!base) throw new Error('Thiếu NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL; báo cáo phải đọc raw data từ R2.');
    const response = await fetch(`${base}/data/xsmb-2-digits.json.gz?report=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`R2 raw HTTP ${response.status}`);
    const body = Buffer.from(await response.arrayBuffer());
    const raw = JSON.parse(zlib.gunzipSync(body).toString('utf8'));
    return raw
        .map(row => ({ ...row, _iso: isoDate(row.date) }))
        .filter(row => row._iso)
        .sort((a, b) => a._iso.localeCompare(b._iso));
}

function actualSpecial(row) {
    const value = Number(row?.special);
    return Number.isInteger(value) ? ((value % 100) + 100) % 100 : null;
}

function actualLotoCounts(row) {
    const keys = [
        'special', 'prize1', 'prize2_1', 'prize2_2',
        'prize3_1', 'prize3_2', 'prize3_3', 'prize3_4', 'prize3_5', 'prize3_6',
        'prize4_1', 'prize4_2', 'prize4_3', 'prize4_4',
        'prize5_1', 'prize5_2', 'prize5_3', 'prize5_4', 'prize5_5', 'prize5_6',
        'prize6_1', 'prize6_2', 'prize6_3',
        'prize7_1', 'prize7_2', 'prize7_3', 'prize7_4'
    ];
    const counts = new Map();
    for (const key of keys) {
        const value = Number(row?.[key]);
        if (!Number.isInteger(value)) continue;
        const number = ((value % 100) + 100) % 100;
        counts.set(number, (counts.get(number) || 0) + 1);
    }
    return counts;
}

function isoWeekKey(date) {
    const value = new Date(`${date}T00:00:00Z`);
    const day = value.getUTCDay() || 7;
    value.setUTCDate(value.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
    return `${value.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function summarizeRows(rows, type) {
    const summary = {
        days: rows.length,
        wins: rows.filter(row => row.profitK > 0).length,
        losses: rows.filter(row => row.profitK < 0).length,
        hitDays: rows.filter(row => row.hits > 0).length,
        totalHits: rows.reduce((sum, row) => sum + row.hits, 0),
        stakeK: rows.reduce((sum, row) => sum + row.stakeK, 0),
        payoutK: rows.reduce((sum, row) => sum + row.payoutK, 0),
        profitK: rows.reduce((sum, row) => sum + row.profitK, 0),
        betNumberDays: rows.reduce((sum, row) => sum + row.betCount, 0),
        excludedNumberDays: rows.reduce((sum, row) => sum + row.excludedCount, 0),
        longestWin: longestStreak(rows, row => row.profitK > 0),
        longestLoss: longestStreak(rows, row => row.profitK < 0)
    };
    summary.winRate = summary.days ? summary.wins / summary.days : 0;
    summary.hitRate = summary.days ? summary.hitDays / summary.days : 0;
    summary.roi = summary.stakeK ? summary.profitK / summary.stakeK : 0;
    summary.avgHitsPerDay = summary.days ? summary.totalHits / summary.days : 0;
    if (type === 'de') summary.betCount = rows[0]?.betCount || 0;
    return summary;
}

function longestStreak(rows, predicate) {
    let current = 0;
    let longest = 0;
    for (const row of rows) {
        current = predicate(row) ? current + 1 : 0;
        longest = Math.max(longest, current);
    }
    return longest;
}

function aggregateRows(rows, period) {
    const groups = new Map();
    for (const row of rows) {
        const key = period === 'daily' ? row.date : period === 'weekly' ? isoWeekKey(row.date) : row.date.slice(0, 7);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return [...groups.entries()].map(([key, group]) => ({
        period: key,
        ...(period === 'daily' ? { date: key } : {}),
        ...(period === 'weekly' ? { week: key } : {}),
        ...(period === 'monthly' ? { month: key } : {}),
        ...summarizeRows(group, 'report')
    }));
}

function makeMethodReport({ id, label, explanation, rows, type, config = {} }) {
    return {
        id,
        label,
        strategy: config.strategy || id,
        target: config.target,
        betCount: config.betCount,
        excludedCount: config.excludedCount,
        stakePerNumberK: config.stakePerNumberK,
        payoutMultiplier: config.payoutMultiplier,
        explanation,
        evaluation: 'Báo cáo từ raw data trên R2; dữ liệu từng ngày được chốt point-in-time trước ngày dự đoán.',
        summary: summarizeRows(rows, type),
        daily: aggregateRows(rows, 'daily'),
        weekly: aggregateRows(rows, 'weekly'),
        monthly: aggregateRows(rows, 'monthly')
    };
}

function normalizeDeRows(result, rawByDate, methodId) {
    return (result.details || []).map(detail => {
        const date = isoDate(detail.predictionIsoDate || detail.predictionDate);
        const method = detail.methods?.[methodId];
        if (!date || !method || method.skipped) return null;
        const betNumbers = [...new Set((method.betNumbers || []).map(Number))];
        const excluded = [...new Set((method.excluded || []).map(Number))];
        const actual = actualSpecial(rawByDate.get(date));
        const hits = actual === null ? 0 : Number(betNumbers.includes(actual));
        const stakeK = Number(method.betStake || (betNumbers.length * DE_STAKE_K));
        const payoutK = Number(method.betPayout || (hits * DE_PAYOUT_K));
        return {
            type: 'de', date, period: date, actual: actual === null ? '' : fmtNumber(actual),
            hit: hits, hits, betCount: betNumbers.length, excludedCount: excluded.length,
            stakeK, payoutK, profitK: payoutK - stakeK,
            betNumbers: betNumbers.map(fmtNumber).join(' '),
            excludedNumbers: excluded.map(fmtNumber).join(' ')
        };
    }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
}

function parseChildReport(output) {
    const matches = [...String(output || '').matchAll(/JSON:\s*(.+\.json)/g)];
    const file = matches.at(-1)?.[1]?.trim();
    if (!file || !fs.existsSync(file)) throw new Error(`Không tìm thấy report Lô từ child process. Output cuối: ${String(output).slice(-2000)}`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function runLotoBacktest(endDate) {
    const args = [
        'scripts/backtest-loto-milestone20y.js',
        `--startDate=${YEAR}-01-01`, `--endDate=${endDate}`,
        '--strategies=chainSmallFirst,chainBlockFirst', '--holds=65,75',
        '--betCounts=6,20', '--aggregationModes=twoHitGreedy,positionPosterior',
        '--includeDetails=1', '--stakeK=' + LOTO_STAKE_K, '--payoutK=' + LOTO_PAYOUT_K
    ];
    const result = spawnSync(process.execPath, args, {
        cwd: process.cwd(), encoding: 'utf8', maxBuffer: 1024 * 1024 * 256,
        env: { ...process.env, LOTTERY_DATA_SOURCE: 'r2', LOTTERY_STATS_SOURCE: 'r2', NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=12288' }
    });
    if (result.status !== 0) throw new Error(`Backtest Lô thất bại (${result.status}): ${String(result.stderr).slice(-4000)}`);
    return parseChildReport(`${result.stdout}\n${result.stderr}`);
}

function rrfRank(small, block, k = 20, agreementBonus = 0.01) {
    const scores = new Map();
    for (const [numbers, weight] of [[small, 0.5], [block, 0.5]]) {
        numbers.forEach((value, index) => {
            const number = Number(value);
            const row = scores.get(number) || { number, score: 0, votes: 0, bestRank: Infinity };
            row.score += weight / (k + index + 1);
            row.votes += 1;
            row.bestRank = Math.min(row.bestRank, index + 1);
            scores.set(number, row);
        });
    }
    return [...scores.values()].map(row => ({ ...row, score: row.score + agreementBonus * Math.max(0, row.votes - 1) }))
        .sort((a, b) => b.score - a.score || b.votes - a.votes || a.bestRank - b.bestRank || a.number - b.number);
}

function buildLotoRows(report, rawByDate, methodId) {
    const details = report.dailyDetailsByWindow?.dateRange || [];
    const byDate = new Map();
    for (const row of details) {
        if (!byDate.has(row.date)) byDate.set(row.date, new Map());
        byDate.get(row.date).set(row.methodId, row);
    }
    return [...byDate.entries()].map(([date, methods]) => {
        let numbers;
        if (methodId === 'rrfSmall65Block75:top6') {
            const small = methods.get('chainSmallFirstHold65:twoHitGreedy:top20')?.numbers || [];
            const block = methods.get('chainBlockFirstHold75:positionPosterior:top20')?.numbers || [];
            numbers = rrfRank(small, block).slice(0, 6).map(row => row.number);
        } else {
            numbers = methods.get(methodId)?.numbers || [];
        }
        if (!numbers.length) return null;
        const actual = actualLotoCounts(rawByDate.get(date));
        const hits = numbers.reduce((sum, number) => sum + (actual.get(Number(number)) || 0), 0);
        const stakeK = numbers.length * LOTO_STAKE_K;
        const payoutK = hits * LOTO_PAYOUT_K;
        return {
            type: 'loto', date, period: date, actual: [...actual.keys()].sort((a, b) => a - b).map(fmtNumber).join(' '),
            hit: hits > 0 ? 1 : 0, hits, betCount: numbers.length, excludedCount: 100 - numbers.length,
            stakeK, payoutK, profitK: payoutK - stakeK,
            betNumbers: numbers.map(fmtNumber).join(' '),
            excludedNumbers: Array.from({ length: 100 }, (_, index) => index).filter(index => !numbers.includes(index)).map(fmtNumber).join(' ')
        };
    }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
}

async function main() {
    const rawData = await loadRawFromR2();
    const rows = rawData.filter(row => row._iso >= `${YEAR}-01-01`);
    const endDate = rows.at(-1)?._iso;
    if (!endDate) throw new Error(`R2 không có dữ liệu năm ${YEAR}.`);
    const rawByDate = new Map(rows.map(row => [row._iso, row]));
    console.log(`[ProfitReport] R2 raw: ${rawData.length} ngày, báo cáo ${YEAR}-01-01 -> ${endDate}.`);

    const simulationService = require('../lib/services/simulationService');
    const deResult = await simulationService.runBacktest(rows.length, rawData, {
        rollingHistory: true, playMode: 'bet', methodIds: 'deParallelBlock85Small65Hold70',
        compactDetails: true, selectedStreakDetailLimit: 0,
        clearHistoryCacheInterval: Number(process.env.BACKTEST_CLEAR_HISTORY_CACHE_INTERVAL || 30)
    });
    const deRows = normalizeDeRows(deResult, rawByDate, 'deParallelBlock85Small65Hold70');
    const lotoReport = runLotoBacktest(endDate);
    const lotoRows = buildLotoRows(lotoReport, rawByDate, 'rrfSmall65Block75:top6');
    const lotoFallbackRows = buildLotoRows(lotoReport, rawByDate, 'parallelCombinedHold65:twoHitGreedy:top6');

    const payload = {
        generatedAt: new Date().toISOString(), latestDataDate: endDate,
        period: { startDate: `${YEAR}-01-01`, endDate },
        source: {
            dataSource: 'R2', rawLatestDate: endDate,
            strictPointInTime: false,
            eligibleForPromotion: false,
            note: 'Sinh từ raw data R2. Đề dùng prefix rolling; phần Lô dùng generator Mốc 20 năm hiện tại, trong đó chỉ baseline năm được cố định còn chỉ mục trạng thái chuỗi chưa phải strict PIT. Dùng để quan sát hiệu quả, không coi là bằng chứng không thiên lệch.'
        },
        de: {
            selectedMethodId: 'deParallelBlock85Small65:hold70',
            label: 'Đề Song Song (Block 85 · Small 65) - Hold 70',
            methods: {
                'deParallelBlock85Small65:hold70': makeMethodReport({
                    id: 'deParallelBlock85Small65:hold70',
                    label: 'Đề Song Song (Block 85 · Small 65) - Hold 70',
                    explanation: 'Loại theo Đề Song Song: Nhịp Block Hold 85 kết hợp Chuỗi nhỏ Hold 65; các số còn lại là dàn đánh 30 số.',
                    rows: deRows, type: 'de', config: { strategy: 'deParallelBlock85Small65', target: 70, betCount: 30, excludedCount: 70, stakePerNumberK: DE_STAKE_K, payoutMultiplier: 84 }
                })
            }
        },
        loto: {
            selectedMethodId: 'rrfSmall65Block75:top6',
            label: 'Lô RRF 50/50 - Top 6',
            methods: {
                'rrfSmall65Block75:top6': makeMethodReport({
                    id: 'rrfSmall65Block75:top6', label: 'Lô RRF 50/50 - Chuỗi nhỏ Hold65 + Nhịp block Hold75 - Top 6',
                    explanation: 'Xếp hạng RRF 50/50 từ hai dàn Top 20, sau đó chọn đúng 6 số duy nhất; không nhân tiền do trùng phương pháp.',
                    rows: lotoRows, type: 'loto', config: { strategy: 'rrfSmall65Block75', target: 94, betCount: 6, excludedCount: 94, stakePerNumberK: LOTO_STAKE_K, payoutMultiplier: LOTO_PAYOUT_K }
                }),
                'parallelCombinedHold65:twoHitGreedy:top6': makeMethodReport({
                    id: 'parallelCombinedHold65:twoHitGreedy:top6', label: 'Lô Song song Hold65 - Top 6',
                    explanation: 'Phương án đối chiếu hiện có, chọn Top 6 duy nhất từ tổng hợp hai phương pháp.',
                    rows: lotoFallbackRows, type: 'loto', config: { strategy: 'parallelCombined', target: 94, betCount: 6, excludedCount: 94, stakePerNumberK: LOTO_STAKE_K, payoutMultiplier: LOTO_PAYOUT_K }
                })
            }
        }
    };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload), 'utf8');
    console.log(JSON.stringify({ output: OUTPUT_FILE, latestDataDate: endDate, de: payload.de.methods['deParallelBlock85Small65:hold70'].summary, loto: payload.loto.methods['rrfSmall65Block75:top6'].summary }, null, 2));
}

main().catch(error => { console.error(`[ProfitReport] ${error.stack || error.message}`); process.exit(1); });
