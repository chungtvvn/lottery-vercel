#!/usr/bin/env node
'use strict';

/*
 * Research-only consensus study over immutable strict-PIT daily dàn.  For a
 * prediction date, the Bet tier contains every number with the greatest number
 * of supporting methods; the Wait tier contains the next distinct positive
 * vote level.  Settlement/wait statistics are calculated afterwards from raw
 * draws and never feed back into the daily tier selection.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const INDEX_FILE = path.join(ROOT, 'reports', 'strict_pit_all_methods_2016_2026.json');
const RAW_FILE = path.join(ROOT, 'lib', 'data', 'xsmb-2-digits.json');
const ALL_NUMBERS = Array.from({ length: 100 }, (_, number) => number);

function parseArgs() {
    return new Map(process.argv.slice(2).map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
}

function isoWeek(value) {
    const date = new Date(`${value}T12:00:00Z`);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1, 12));
    const week = Math.ceil((((date - start) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function calendarDelay(from, to) {
    return Math.round((new Date(`${to}T12:00:00Z`) - new Date(`${from}T12:00:00Z`)) / 86400000);
}

function summarize(values) {
    const sorted = values.filter(Number.isFinite).slice().sort((left, right) => left - right);
    if (!sorted.length) return { count: 0, min: null, max: null, mean: null, median: null, p90: null };
    const percentile = percentileValue => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)];
    return {
        count: sorted.length,
        min: sorted[0],
        max: sorted.at(-1),
        mean: Number((sorted.reduce((sum, value) => sum + value, 0) / sorted.length).toFixed(3)),
        median: percentile(0.5),
        p90: percentile(0.9)
    };
}

function wilsonLowerBound(successes, trials, z = 1.96) {
    if (!trials) return null;
    const rate = successes / trials;
    const z2 = z * z;
    return ((rate + z2 / (2 * trials)) - z * Math.sqrt((rate * (1 - rate) + z2 / (4 * trials)) / trials)) / (1 + z2 / trials);
}

function summarizeTier(rows, tier) {
    const nonEmpty = rows.filter(row => row[tier].numbers.length > 0);
    const hit = nonEmpty.filter(row => row[tier].sameDayHit).length;
    const future = nonEmpty.filter(row => row[tier].firstHit);
    const next = nonEmpty.filter(row => row[tier].nextHit);
    const perNumber = nonEmpty.flatMap(row => row[tier].perNumber.filter(item => item.firstHit));
    const completedDàn = nonEmpty.filter(row => row[tier].allNumbersHit);
    const completedDànAfterPrediction = nonEmpty.filter(row => row[tier].allNumbersHitAfterPredictionDay);
    return {
        predictionDays: rows.length,
        nonEmptyDays: nonEmpty.length,
        emptyDays: rows.length - nonEmpty.length,
        averageNumbers: nonEmpty.length
            ? Number((nonEmpty.reduce((sum, row) => sum + row[tier].numbers.length, 0) / nonEmpty.length).toFixed(3))
            : 0,
        sameDay: {
            hits: hit,
            hitRate: nonEmpty.length ? Number((hit / nonEmpty.length).toFixed(6)) : null,
            expectedRateFromAverageSetSize: nonEmpty.length
                ? Number((nonEmpty.reduce((sum, row) => sum + row[tier].numbers.length, 0) / nonEmpty.length / 100).toFixed(6))
                : null,
            liftVsRandom: nonEmpty.length
                ? Number(((hit / nonEmpty.length) / (nonEmpty.reduce((sum, row) => sum + row[tier].numbers.length, 0) / nonEmpty.length / 100)).toFixed(6))
                : null,
            wilsonLower95: nonEmpty.length ? Number(wilsonLowerBound(hit, nonEmpty.length).toFixed(6)) : null
        },
        firstOccurrenceIncludingPredictionDay: {
            settled: future.length,
            unresolvedAtRawEnd: nonEmpty.length - future.length,
            calendarDays: summarize(future.map(row => row[tier].firstHit.calendarDays)),
            drawDays: summarize(future.map(row => row[tier].firstHit.drawDays))
        },
        firstOccurrenceAfterPredictionDay: {
            settled: next.length,
            unresolvedAtRawEnd: nonEmpty.length - next.length,
            calendarDays: summarize(next.map(row => row[tier].nextHit.calendarDays)),
            drawDays: summarize(next.map(row => row[tier].nextHit.drawDays))
        },
        allNumbersOccurrenceIncludingPredictionDay: {
            settled: completedDàn.length,
            unresolvedAtRawEnd: nonEmpty.length - completedDàn.length,
            calendarDays: summarize(completedDàn.map(row => row[tier].allNumbersHit.calendarDays)),
            drawDays: summarize(completedDàn.map(row => row[tier].allNumbersHit.drawDays))
        },
        allNumbersOccurrenceAfterPredictionDay: {
            settled: completedDànAfterPrediction.length,
            unresolvedAtRawEnd: nonEmpty.length - completedDànAfterPrediction.length,
            calendarDays: summarize(completedDànAfterPrediction.map(row => row[tier].allNumbersHitAfterPredictionDay.calendarDays)),
            drawDays: summarize(completedDànAfterPrediction.map(row => row[tier].allNumbersHitAfterPredictionDay.drawDays))
        },
        individualNumberOccurrenceIncludingPredictionDay: {
            settled: perNumber.length,
            calendarDays: summarize(perNumber.map(item => item.firstHit.calendarDays)),
            drawDays: summarize(perNumber.map(item => item.firstHit.drawDays))
        }
    };
}

function selectTiers(strategies, methodIds) {
    const votes = Array.from({ length: 100 }, () => 0);
    for (const methodId of methodIds) {
        const numbers = [...new Set((strategies[methodId] || []).map(Number))];
        for (const number of numbers) if (Number.isInteger(number) && number >= 0 && number <= 99) votes[number]++;
    }
    const positiveLevels = [...new Set(votes.filter(value => value > 0))].sort((left, right) => right - left);
    const [betVote = 0, waitVote = 0] = positiveLevels;
    const valuesFor = level => ALL_NUMBERS.filter(number => votes[number] === level);
    return {
        votes,
        betVote,
        waitVote,
        betNumbers: valuesFor(betVote),
        waitNumbers: waitVote > 0 ? valuesFor(waitVote) : []
    };
}

function readRows(index) {
    const methodIds = index.fixed?.methodIds || [];
    if (!methodIds.length) throw new Error('Strict PIT index không có methodIds.');
    const rows = [];
    for (const source of index.sourceReports || []) {
        const reportPath = path.join(ROOT, 'reports', source.file);
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        if (report.methodologyVersion !== 'strict-prefix-point-in-time-v1' || Number(report.options?.dateStep) !== 1) {
            throw new Error(`${source.file} không phải strict PIT từng ngày.`);
        }
        for (const row of report.rows || []) {
            if (methodIds.every(id => Array.isArray(row.strategies?.[id]) && row.strategies[id].length === 30)) rows.push(row);
        }
    }
    rows.sort((left, right) => left.date.localeCompare(right.date));
    const dates = new Set(rows.map(row => row.date));
    if (dates.size !== rows.length) throw new Error('Strict source chứa ngày dự đoán trùng.');
    return { rows, methodIds };
}

function findOccurrence(raw, startIndex, numbers, includeCurrent) {
    const set = new Set(numbers);
    const start = includeCurrent ? startIndex : startIndex + 1;
    for (let index = start; index < raw.length; index++) {
        if (set.has(raw[index].actual)) {
            return {
                date: raw[index].date,
                number: raw[index].actual,
                calendarDays: calendarDelay(raw[startIndex].date, raw[index].date),
                drawDays: index - startIndex
            };
        }
    }
    return null;
}

function findAllOccurrences(raw, startIndex, numbers, includeCurrent) {
    const pending = new Set(numbers);
    const start = includeCurrent ? startIndex : startIndex + 1;
    const individualHits = {};
    for (let index = start; index < raw.length && pending.size; index++) {
        const number = raw[index].actual;
        if (!pending.has(number)) continue;
        individualHits[number] = {
            date: raw[index].date,
            calendarDays: calendarDelay(raw[startIndex].date, raw[index].date),
            drawDays: index - startIndex
        };
        pending.delete(number);
        if (!pending.size) {
            return {
                date: raw[index].date,
                calendarDays: calendarDelay(raw[startIndex].date, raw[index].date),
                drawDays: index - startIndex,
                individualHits
            };
        }
    }
    return null;
}

function enrichTier(raw, startIndex, numbers) {
    const perNumber = numbers.map(number => ({
        number,
        firstHit: findOccurrence(raw, startIndex, [number], true),
        nextHit: findOccurrence(raw, startIndex, [number], false)
    }));
    const firstHit = findOccurrence(raw, startIndex, numbers, true);
    return {
        numbers,
        sameDayHit: numbers.includes(raw[startIndex].actual),
        firstHit,
        nextHit: findOccurrence(raw, startIndex, numbers, false),
        allNumbersHit: findAllOccurrences(raw, startIndex, numbers, true),
        allNumbersHitAfterPredictionDay: findAllOccurrences(raw, startIndex, numbers, false),
        perNumber
    };
}

function byPeriod(rows, key, tier) {
    const periods = new Map();
    for (const row of rows) {
        const period = key(row.date);
        if (!periods.has(period)) periods.set(period, []);
        periods.get(period).push(row);
    }
    return [...periods.entries()].map(([period, values]) => ({ period, ...summarizeTier(values, tier) }));
}

function main() {
    const args = parseArgs();
    const startDate = args.get('startDate') || '2016-01-01';
    const endDate = args.get('endDate') || '2026-07-10';
    const indexBytes = fs.readFileSync(INDEX_FILE);
    const index = JSON.parse(indexBytes);
    const { rows, methodIds } = readRows(index);
    const raw = JSON.parse(fs.readFileSync(RAW_FILE, 'utf8'))
        .map(row => ({ date: String(row.date || '').slice(0, 10), actual: Number(row.special) }))
        .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isInteger(row.actual))
        .sort((left, right) => left.date.localeCompare(right.date));
    const rawIndex = new Map(raw.map((row, position) => [row.date, position]));
    const selected = rows.filter(row => row.date >= startDate && row.date <= endDate);
    const daily = selected.map(row => {
        const position = rawIndex.get(row.date);
        if (position === undefined || raw[position].actual !== Number(row.actual)) {
            throw new Error(`${row.date}: actual strict source không khớp raw.`);
        }
        const tiers = selectTiers(row.strategies, methodIds);
        return {
            date: row.date,
            actual: Number(row.actual),
            betVote: tiers.betVote,
            waitVote: tiers.waitVote,
            voteHistogram: Object.fromEntries([...new Set(tiers.votes.filter(Boolean))].sort((a, b) => b - a).map(level => [level, tiers.votes.filter(vote => vote === level).length])),
            bet: enrichTier(raw, position, tiers.betNumbers),
            wait: enrichTier(raw, position, tiers.waitNumbers)
        };
    });
    const report = {
        generatedAt: new Date().toISOString(),
        status: 'research-only',
        methodology: {
            predictionInput: '13 dàn, mỗi dàn 30 số, từ strict prefix point-in-time source.',
            bet: 'Các số có số phiếu chọn cao nhất trong ngày.',
            wait: 'Các số có số phiếu dương cao thứ hai trong ngày.',
            settlement: 'Thời gian xuất hiện chỉ là hậu kiểm từ raw thực tế; không dùng làm feature chọn tier.',
            caution: 'Đồng thuận không đồng nghĩa với xác suất cao: các phương pháp có thể tương quan mạnh.'
        },
        source: {
            strictIndex: path.relative(ROOT, INDEX_FILE),
            strictIndexSha256: crypto.createHash('sha256').update(indexBytes).digest('hex'),
            raw: path.relative(ROOT, RAW_FILE),
            rawCoverage: [raw[0]?.date, raw.at(-1)?.date],
            methodIds
        },
        scope: { startDate, endDate, predictionDays: daily.length },
        summary: { bet: summarizeTier(daily, 'bet'), wait: summarizeTier(daily, 'wait') },
        periods: {
            week: { bet: byPeriod(daily, isoWeek, 'bet'), wait: byPeriod(daily, isoWeek, 'wait') },
            month: { bet: byPeriod(daily, date => date.slice(0, 7), 'bet'), wait: byPeriod(daily, date => date.slice(0, 7), 'wait') },
            year: { bet: byPeriod(daily, date => date.slice(0, 4), 'bet'), wait: byPeriod(daily, date => date.slice(0, 4), 'wait') }
        },
        daily
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const output = path.join(ROOT, 'reports', `strict-consensus-bet-wait-${stamp}.json`);
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    const format = value => value === null || value === undefined ? 'N/A' : String(value);
    const lines = [
        '# Đồng thuận phương pháp strict PIT: Đánh và Chờ',
        '',
        `- Phạm vi: ${startDate} -> ${endDate}; ${daily.length} ngày dự đoán; ${methodIds.length} phương pháp.`,
        '- Đánh = nhóm phiếu cao nhất; Chờ = nhóm phiếu dương cao nhì. Không ép số lượng cố định.',
        '- Khoảng chờ là hậu kiểm. “0 ngày” nghĩa là có một số trong dàn về ngay ngày dự đoán.',
        '',
        '| Dàn | Số TB | Trúng cùng ngày / nền ngẫu nhiên | Lift | Cận dưới Wilson 95% | Chờ đến lần xuất hiện (bao gồm ngày dự đoán) min / median / max ngày lịch | Chờ sau ngày dự đoán min / median / max ngày lịch |',
        '|---|---:|---:|---:|---:|---:|',
        ...['bet', 'wait'].map(tier => {
            const data = report.summary[tier];
            return `| ${tier === 'bet' ? 'Đánh (đồng thuận cao nhất)' : 'Chờ (đồng thuận cao nhì)'} | ${data.averageNumbers} | ${data.sameDay.hits}/${data.nonEmptyDays} (${(data.sameDay.hitRate * 100).toFixed(3)}%) / ${(data.sameDay.expectedRateFromAverageSetSize * 100).toFixed(3)}% | ${data.sameDay.liftVsRandom.toFixed(3)}x | ${(data.sameDay.wilsonLower95 * 100).toFixed(3)}% | ${format(data.firstOccurrenceIncludingPredictionDay.calendarDays.min)} / ${format(data.firstOccurrenceIncludingPredictionDay.calendarDays.median)} / ${format(data.firstOccurrenceIncludingPredictionDay.calendarDays.max)} | ${format(data.firstOccurrenceAfterPredictionDay.calendarDays.min)} / ${format(data.firstOccurrenceAfterPredictionDay.calendarDays.median)} / ${format(data.firstOccurrenceAfterPredictionDay.calendarDays.max)} |`;
        }),
        '',
        '## Giữ nguyên dàn đến khi đủ tất cả số đã về',
        '',
        '| Dàn | Đã đủ dàn / chưa đủ đến cuối raw | Bao gồm ngày dự đoán: min / median / max ngày lịch | Chỉ sau ngày dự đoán: min / median / max ngày lịch |',
        '|---|---:|---:|---:|',
        ...['bet', 'wait'].map(tier => {
            const data = report.summary[tier];
            const including = data.allNumbersOccurrenceIncludingPredictionDay.calendarDays;
            const after = data.allNumbersOccurrenceAfterPredictionDay.calendarDays;
            return `| ${tier === 'bet' ? 'Đánh (đồng thuận cao nhất)' : 'Chờ (đồng thuận cao nhì)'} | ${data.allNumbersOccurrenceIncludingPredictionDay.settled} / ${data.allNumbersOccurrenceIncludingPredictionDay.unresolvedAtRawEnd} | ${format(including.min)} / ${format(including.median)} / ${format(including.max)} | ${format(after.min)} / ${format(after.median)} / ${format(after.max)} |`;
        }),
        '',
        '## Giới hạn',
        '',
        '- Báo cáo này mô tả đồng thuận và khoảng chờ, chưa chứng minh lợi nhuận hay là chiến lược production.',
        '- Không chọn lại ngưỡng sau khi xem các kết quả trong cùng tập dữ liệu.'
    ];
    fs.writeFileSync(output.replace(/\.json$/, '.md'), `${lines.join('\n')}\n`);
    console.log(JSON.stringify({ output, markdown: output.replace(/\.json$/, '.md'), summary: report.summary }, null, 2));
}

if (require.main === module) main();

module.exports = { selectTiers, summarizeTier, wilsonLowerBound };
