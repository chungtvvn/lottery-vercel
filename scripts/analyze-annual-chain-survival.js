#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        baselineFile: args.get('baseline') || '/tmp/milestone-baseline-2026-r2.json'
    };
}

function patternStep(key = '') {
    const normalized = String(key).toLowerCase();
    const alternatingGap = (normalized.includes('vesole') || normalized.includes('solemoi'))
        && !normalized.includes('tienluisole')
        && !normalized.includes('luitiensole')
        && !normalized.includes('soletheocap')
        && !/block\d+x\d+sole/.test(normalized);
    return alternatingGap ? 2 : 1;
}

function patternGroup(key = '') {
    const normalized = String(key).toLowerCase();
    if (/block\d+x\d+sole/.test(normalized)) return 'nhịp block A/B';
    if (normalized.includes('vesoletheothutu')) return 'so le theo thứ tự';
    if (normalized.includes('soletheocap')) return 'so le theo cặp';
    if (normalized.includes('tienluisole') || normalized.includes('luitiensole')) return 'tiến/lùi so le';
    if (normalized.includes('tiendeulientiep') || normalized.includes('luideulientiep')) return 'tiến/lùi đều';
    if (normalized.includes('tien') || normalized.includes('lui')) return 'tiến/lùi';
    if (normalized.includes('sole')) return 'so le';
    if (normalized.includes('lientiep')) return 'liên tiếp';
    return 'khác';
}

function numberMap(value) {
    return new Map(Object.entries(value || {}).map(([key, count]) => [Number(key), Number(count || 0)]));
}

function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round(value, digits = 4) {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function summarize(rows, keyFn) {
    const groups = new Map();
    for (const row of rows) {
        const key = keyFn(row);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return [...groups.entries()].map(([group, items]) => {
        const trials = items.reduce((sum, row) => sum + row.trials, 0);
        const continues = items.reduce((sum, row) => sum + row.continues, 0);
        const macroBreaks = items.map(row => row.breakRate);
        return {
            group,
            patterns: items.length,
            trials,
            continues,
            pooledBreakRate: round(trials > 0 ? 1 - continues / trials : null),
            medianPatternBreakRate: round(median(macroBreaks))
        };
    }).sort((a, b) => Number(a.group) - Number(b.group) || b.trials - a.trials);
}

function render(title, rows) {
    const pct = value => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '-';
    return [
        `## ${title}`,
        '',
        '| Nhóm | Pattern | Mẫu đạt độ dài | Tiếp tục | Gãy gộp | Trung vị gãy/pattern |',
        '|---|---:|---:|---:|---:|---:|',
        ...rows.map(row => `| ${row.group} | ${row.patterns} | ${row.trials} | ${row.continues} | ${pct(row.pooledBreakRate)} | ${pct(row.medianPatternBreakRate)} |`),
        ''
    ].join('\n');
}

function main() {
    const { baselineFile } = parseArgs();
    const payload = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
    const transitions = [];
    let neverPatterns = 0;
    let blockPatternsExcluded = 0;
    for (const entry of payload.entries || []) {
        const recordLen = Number(entry.recordLen || 0);
        if (recordLen <= 0) neverPatterns++;
        const group = patternGroup(entry.key);
        if (group === 'nhịp block A/B') {
            blockPatternsExcluded++;
            continue;
        }
        const cumulative = numberMap(entry.cumulative);
        const exact = numberMap(entry.exactCounts);
        const observedLengths = [...exact.keys()].filter(length => exact.get(length) > 0);
        const minObservedLen = observedLengths.length ? Math.min(...observedLengths) : Infinity;
        const step = patternStep(entry.key);
        for (let length = minObservedLen; length < recordLen; length += step) {
            const trials = cumulative.get(length) || 0;
            if (trials <= 0) continue;
            const continues = Math.min(trials, cumulative.get(length + step) || 0);
            transitions.push({
                key: entry.key,
                group,
                length,
                step,
                trials,
                continues,
                breakRate: 1 - continues / trials
            });
        }
    }

    const summaries = {
        byLength: summarize(transitions, row => `dài ${row.length} → ${row.length + row.step}`),
        byPatternAndLength: summarize(transitions, row => `${row.group}|dài ${row.length} → ${row.length + row.step}`)
    };
    const outputDir = path.join(process.cwd(), 'reports');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(outputDir, `annual-chain-survival-${stamp}.json`);
    const mdPath = path.join(outputDir, `annual-chain-survival-${stamp}.md`);
    const output = {
        generatedAt: new Date().toISOString(),
        source: baselineFile,
        cutoffIso: payload.cutoffIso,
        historyYears: payload.historyYears,
        patterns: payload.entries?.length || 0,
        neverPatterns,
        neverPatternRate: round(neverPatterns / Math.max(1, payload.entries?.length || 0)),
        transitions: transitions.length,
        blockPatternsExcluded,
        summaries
    };
    fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
    fs.writeFileSync(mdPath, [
        '# Đường sống và xác suất gãy theo độ dài chuỗi',
        '',
        `- Baseline: ${payload.cutoffIso}, cửa sổ ${payload.historyYears} năm`,
        `- Pattern: ${output.patterns}; chưa từng hình thành: ${neverPatterns} (${(output.neverPatternRate * 100).toFixed(2)}%)`,
        '- Chỉ tính chuyển tiếp nằm dưới kỷ lục. Điểm tại đúng kỷ lục bị loại khỏi bảng vì “không vượt kỷ lục” trong chính tập dùng để định nghĩa kỷ lục là thiên lệch tất định.',
        `- Loại ${blockPatternsExcluded} pattern Nhịp block khỏi đường sống: file streak chỉ lưu block hoàn tất, không lưu đầy đủ mọi chuyển tiếp từng ngày.`,
        '- Mỗi pattern chỉ bắt đầu ở độ dài hình thành tối thiểu đã quan sát; không dùng các mức cumulative nội suy trước khi pattern thực sự hình thành.',
        '- Gãy gộp dùng tổng số lần đạt độ dài làm trọng số; trung vị cho biết pattern điển hình và tránh pattern phổ biến lấn át.',
        '',
        render('Theo độ dài', summaries.byLength),
        render('Theo dạng và độ dài', summaries.byPatternAndLength)
    ].join('\n'));
    console.log(JSON.stringify({ jsonPath, mdPath, ...output }, null, 2));
}

main();
