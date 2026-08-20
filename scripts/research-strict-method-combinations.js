#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const METHODOLOGY = 'strict-prefix-point-in-time-v1';
const STAKE_PER_UNIT_K = 1000;
const PAYOUT_MULTIPLIER = 84;
const MAX_AVERAGE_BETS = 65;
const REPRESENTATIVE_METHODS = [
    'chainSmallFirst',
    'chainBlockFirst',
    'chainCredibleFirst',
    'chainFreqFirst',
    'numberAvgRisk',
    'numberConsensusRisk',
    'numberPosteriorDiversity',
    'numberLikelihoodRatio',
    'numberWeightedRisk',
    'activeOnlyAvgRisk',
    'dedupEdge50Hold',
    'dedupEdge50CombinedB40S05'
];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadRows(root) {
    const index = readJson(path.join(root, 'reports', 'strict_pit_all_methods_2016_2026.json'));
    const rows = [];
    const sources = [];
    for (const source of index.sourceReports || []) {
        const reportPath = path.join(root, 'reports', source.file);
        const report = readJson(reportPath);
        if (report.methodologyVersion !== METHODOLOGY || report.options?.dateStep !== 1) {
            throw new Error(`${source.file} không đạt chuẩn ${METHODOLOGY}/dateStep=1.`);
        }
        if (!Array.isArray(report.rows) || report.rows.length === 0) {
            throw new Error(`${source.file} không có daily rows.`);
        }
        for (const method of REPRESENTATIVE_METHODS) {
            if (!Array.isArray(report.rows[0].strategies?.[method])) {
                throw new Error(`${source.file} thiếu phương pháp ${method}.`);
            }
        }
        rows.push(...report.rows.map(row => ({ ...row, sourceYear: Number(source.year) })));
        sources.push({
            year: Number(source.year),
            file: source.file,
            rows: report.rows.length,
            baselineCutoffDate: report.baselineCutoffDate,
            fingerprint: report.fingerprint?.runSha256 || report.fingerprint?.sha256 || null
        });
    }
    rows.sort((left, right) => left.date.localeCompare(right.date));
    const seen = new Set();
    for (const row of rows) {
        if (seen.has(row.date)) throw new Error(`Trùng ngày strict PIT: ${row.date}`);
        seen.add(row.date);
    }
    return { rows, sources };
}

function combinations(values, size, start = 0, prefix = [], output = []) {
    if (prefix.length === size) {
        output.push(prefix.slice());
        return output;
    }
    for (let index = start; index <= values.length - (size - prefix.length); index += 1) {
        prefix.push(values[index]);
        combinations(values, size, index + 1, prefix, output);
        prefix.pop();
    }
    return output;
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

function buildVotePrediction(row, config) {
    const votes = new Uint8Array(100);
    for (const method of config.methods) {
        for (const number of row.strategies[method]) votes[Number(number)] += 1;
    }
    const betNumbers = [];
    const doubledNumbers = [];
    for (let number = 0; number < 100; number += 1) {
        if (votes[number] >= config.minVotes) betNumbers.push(number);
        if (config.doubleAtVotes && votes[number] >= config.doubleAtVotes) doubledNumbers.push(number);
    }
    return { betNumbers, doubledNumbers };
}

function settle(rows, config, includeDaily = false) {
    const daily = [];
    let wins = 0;
    let stakeK = 0;
    let payoutK = 0;
    let totalBets = 0;
    let totalUnits = 0;
    let emptyDays = 0;
    let maxBets = 0;
    for (const row of rows) {
        const prediction = buildVotePrediction(row, config);
        const betSet = new Set(prediction.betNumbers);
        const doubledSet = new Set(prediction.doubledNumbers);
        const actual = Number(row.actual);
        const hit = betSet.has(actual);
        const units = prediction.betNumbers.length + prediction.doubledNumbers.length;
        const actualUnits = doubledSet.has(actual) ? 2 : 1;
        const dayStakeK = units * STAKE_PER_UNIT_K;
        const dayPayoutK = hit ? actualUnits * STAKE_PER_UNIT_K * PAYOUT_MULTIPLIER : 0;
        totalBets += prediction.betNumbers.length;
        totalUnits += units;
        maxBets = Math.max(maxBets, prediction.betNumbers.length);
        if (prediction.betNumbers.length === 0) emptyDays += 1;
        wins += Number(hit);
        stakeK += dayStakeK;
        payoutK += dayPayoutK;
        daily.push({
            date: row.date,
            actual,
            hit,
            betCount: prediction.betNumbers.length,
            unitCount: units,
            profitK: dayPayoutK - dayStakeK,
            ...(includeDaily ? { betNumbers: prediction.betNumbers, doubledNumbers: prediction.doubledNumbers } : {})
        });
    }
    const profitK = payoutK - stakeK;
    return {
        days: rows.length,
        wins,
        losses: rows.length - wins,
        hitRate: rows.length ? wins / rows.length : 0,
        averageBets: rows.length ? totalBets / rows.length : 0,
        averageUnits: rows.length ? totalUnits / rows.length : 0,
        maxBets,
        emptyDays,
        stakeK,
        payoutK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestWin: longestStreak(daily, row => row.hit),
        longestLoss: longestStreak(daily, row => !row.hit),
        daily
    };
}

function withoutDaily(summary) {
    const { daily, ...result } = summary;
    return result;
}

function groupSummary(rows, config, keySelector) {
    const grouped = new Map();
    for (const row of rows) {
        const key = keySelector(row);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
    }
    return Object.fromEntries([...grouped.entries()].map(([key, values]) => [
        key,
        withoutDaily(settle(values, config))
    ]));
}

function candidateId(methods, minVotes, doubleAtVotes = 0) {
    const suffix = doubleAtVotes ? `-double${doubleAtVotes}` : '';
    return `vote${minVotes}of${methods.length}${suffix}__${methods.join('+')}`;
}

function buildCandidates(methods) {
    const candidates = [];
    for (const method of methods) {
        candidates.push({ id: `single__${method}`, methods: [method], minVotes: 1, doubleAtVotes: 0 });
    }
    for (let size = 2; size <= Math.min(6, methods.length); size += 1) {
        for (const subset of combinations(methods, size)) {
            for (let minVotes = 1; minVotes <= size; minVotes += 1) {
                candidates.push({
                    id: candidateId(subset, minVotes),
                    methods: subset,
                    minVotes,
                    doubleAtVotes: 0
                });
                if (minVotes < size) {
                    candidates.push({
                        id: candidateId(subset, minVotes, minVotes + 1),
                        methods: subset,
                        minVotes,
                        doubleAtVotes: minVotes + 1
                    });
                }
            }
        }
    }
    return candidates;
}

function scoreTraining(summary, annual) {
    const years = Object.values(annual);
    const profitableYears = years.filter(year => year.profitK > 0).length;
    const worstYearProfitK = years.length ? Math.min(...years.map(year => year.profitK)) : 0;
    return summary.profitK
        + profitableYears * 100000
        + worstYearProfitK * 0.25
        - summary.longestLoss * 1000;
}

function pct(value) {
    return `${(value * 100).toFixed(2)}%`;
}

function compactResult(config, summary, annual = null) {
    const result = {
        id: config.id,
        methods: config.methods,
        minVotes: config.minVotes,
        doubleAtVotes: config.doubleAtVotes || null,
        ...withoutDaily(summary),
        hitRateText: pct(summary.hitRate),
        roiText: pct(summary.roi)
    };
    if (annual) {
        const years = Object.values(annual);
        result.profitableYears = years.filter(year => year.profitK > 0).length;
        result.losingYears = years.filter(year => year.profitK < 0).length;
        result.worstYearProfitK = years.length ? Math.min(...years.map(year => year.profitK)) : 0;
    }
    return result;
}

function main() {
    const root = path.resolve(__dirname, '..');
    const { rows, sources } = loadRows(root);
    const periods = {
        fit2016To2023: rows.filter(row => row.date < '2024-01-01'),
        validation2024To2025: rows.filter(row => row.date >= '2024-01-01' && row.date < '2026-01-01'),
        historical2016To2025: rows.filter(row => row.date < '2026-01-01'),
        holdout2026: rows.filter(row => row.date >= '2026-01-01')
    };

    const standalone = REPRESENTATIVE_METHODS.map(method => {
        const config = { id: `single__${method}`, methods: [method], minVotes: 1, doubleAtVotes: 0 };
        const summary = settle(periods.fit2016To2023, config);
        return { method, summary };
    }).sort((left, right) => right.summary.profitK - left.summary.profitK);
    const pool = standalone.slice(0, 8).map(row => row.method);
    const candidates = buildCandidates(pool);

    const fitResults = candidates.map(config => {
        const summary = settle(periods.fit2016To2023, config);
        const annual = groupSummary(periods.fit2016To2023, config, row => row.date.slice(0, 4));
        return { config, summary, annual, score: scoreTraining(summary, annual) };
    }).filter(row => row.summary.emptyDays === 0
        && row.summary.averageBets > 0
        && row.summary.averageBets <= MAX_AVERAGE_BETS)
        .sort((left, right) => right.score - left.score || right.summary.profitK - left.summary.profitK);

    const shortlistSize = Math.min(100, Math.max(20, Math.ceil(fitResults.length * 0.1)));
    const shortlist = fitResults.slice(0, shortlistSize).map(row => {
        const validation = settle(periods.validation2024To2025, row.config);
        return { ...row, validation };
    });
    const selected = shortlist.slice().sort((left, right) => {
        const leftBothPositive = left.summary.profitK > 0 && left.validation.profitK > 0;
        const rightBothPositive = right.summary.profitK > 0 && right.validation.profitK > 0;
        if (leftBothPositive !== rightBothPositive) return Number(rightBothPositive) - Number(leftBothPositive);
        const leftWorst = Math.min(left.summary.profitK, left.validation.profitK);
        const rightWorst = Math.min(right.summary.profitK, right.validation.profitK);
        return rightWorst - leftWorst
            || (right.summary.profitK + right.validation.profitK) - (left.summary.profitK + left.validation.profitK)
            || left.validation.longestLoss - right.validation.longestLoss;
    })[0];

    const historicalRanking = candidates.map(config => ({
        config,
        summary: settle(periods.historical2016To2025, config)
    })).filter(row => row.summary.emptyDays === 0
        && row.summary.averageBets > 0
        && row.summary.averageBets <= MAX_AVERAGE_BETS)
        .sort((left, right) => right.summary.profitK - left.summary.profitK
            || right.summary.roi - left.summary.roi
            || left.summary.longestLoss - right.summary.longestLoss);
    const milestoneSelected = historicalRanking[0];
    const milestoneHoldout = settle(periods.holdout2026, milestoneSelected.config, true);

    const holdout = settle(periods.holdout2026, selected.config, true);
    const selectedAll = settle(rows, selected.config);
    const holdoutRankingDiagnosticOnly = candidates.map(config => ({
        config,
        summary: settle(periods.holdout2026, config)
    })).filter(row => row.summary.emptyDays === 0 && row.summary.averageBets <= MAX_AVERAGE_BETS)
        .sort((left, right) => right.summary.profitK - left.summary.profitK);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(root, 'reports', `strict-method-combinations-${timestamp}.json`);
    const mdPath = path.join(root, 'reports', `strict-method-combinations-${timestamp}.md`);
    const output = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: METHODOLOGY,
        selectionProtocol: '2016-2023 fit/sàng; 2024-2025 validation/chọn; 2026 holdout khóa, không dùng để chọn.',
        economics: { stakePerUnitK: STAKE_PER_UNIT_K, payoutMultiplier: PAYOUT_MULTIPLIER },
        sources,
        duplicateAliasExcluded: { chainRiskFirst: 'chainFreqFirst' },
        standaloneRankingOnFit: standalone.map(row => compactResult(
            { id: `single__${row.method}`, methods: [row.method], minVotes: 1 },
            row.summary
        )),
        candidatePool: pool,
        candidateCount: candidates.length,
        eligibleCandidateCount: fitResults.length,
        shortlistSize,
        selected: {
            config: selected.config,
            fit2016To2023: compactResult(selected.config, selected.summary, selected.annual),
            validation2024To2025: compactResult(selected.config, selected.validation),
            holdout2026: compactResult(selected.config, holdout),
            all2016To2026: compactResult(selected.config, selectedAll),
            fitByYear: selected.annual,
            validationByYear: groupSummary(periods.validation2024To2025, selected.config, row => row.date.slice(0, 4)),
            holdoutByMonth: groupSummary(periods.holdout2026, selected.config, row => row.date.slice(0, 7)),
            holdoutDaily: holdout.daily
        },
        milestoneSelectionAt2025End: {
            selectionRule: 'Chọn profit cao nhất trên toàn bộ 2016-2025, không dùng bất kỳ kết quả 2026 nào.',
            config: milestoneSelected.config,
            historical2016To2025: compactResult(milestoneSelected.config, milestoneSelected.summary),
            holdout2026: compactResult(milestoneSelected.config, milestoneHoldout),
            historicalByYear: groupSummary(periods.historical2016To2025, milestoneSelected.config, row => row.date.slice(0, 4)),
            holdoutByMonth: groupSummary(periods.holdout2026, milestoneSelected.config, row => row.date.slice(0, 7)),
            holdoutDaily: milestoneHoldout.daily
        },
        topHistorical2016To2025: historicalRanking.slice(0, 20).map(row => ({
            historical: compactResult(row.config, row.summary),
            frozenHoldout2026: compactResult(row.config, settle(periods.holdout2026, row.config))
        })),
        topFit: fitResults.slice(0, 20).map(row => compactResult(row.config, row.summary, row.annual)),
        topValidationWithinFrozenShortlist: shortlist.slice().sort((a, b) => b.validation.profitK - a.validation.profitK)
            .slice(0, 20).map(row => ({
                config: row.config,
                fit: compactResult(row.config, row.summary, row.annual),
                validation: compactResult(row.config, row.validation)
            })),
        topHoldoutDiagnosticOnly: holdoutRankingDiagnosticOnly.slice(0, 20)
            .map(row => compactResult(row.config, row.summary))
    };
    fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));

    const selectedRows = [
        ['Fit 2016-2023', output.selected.fit2016To2023],
        ['Validation 2024-2025', output.selected.validation2024To2025],
        ['Holdout 2026', output.selected.holdout2026]
    ];
    const markdown = [
        '# Nghiên cứu gộp phương pháp strict PIT',
        '',
        `- Sinh lúc: ${output.generatedAt}`,
        `- Quy trình: ${output.selectionProtocol}`,
        `- Kinh tế: mỗi đơn vị ${STAKE_PER_UNIT_K}K, trúng nhận x${PAYOUT_MULTIPLIER}.`,
        `- Đã thử ${candidates.length.toLocaleString('en-US')} cấu hình; ${fitResults.length.toLocaleString('en-US')} cấu hình qua điều kiện dàn trung bình <= ${MAX_AVERAGE_BETS} số và đánh đủ mỗi ngày.`,
        '',
        '## Cấu hình được chọn trước khi mở holdout 2026',
        '',
        `- ID: \`${selected.config.id}\``,
        `- Nguồn: ${selected.config.methods.join(', ')}`,
        `- Chọn số có ít nhất ${selected.config.minVotes}/${selected.config.methods.length} phiếu${selected.config.doubleAtVotes ? `; đánh x2 khi có >= ${selected.config.doubleAtVotes} phiếu` : ''}.`,
        '',
        '| Giai đoạn | Ngày | Trúng | Tỷ lệ | TB số | TB đơn vị | Profit | ROI | Thua dài nhất |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
        ...selectedRows.map(([label, row]) => `| ${label} | ${row.days} | ${row.wins} | ${row.hitRateText} | ${row.averageBets.toFixed(2)} | ${row.averageUnits.toFixed(2)} | ${row.profitK.toLocaleString('en-US')}K | ${row.roiText} | ${row.longestLoss} |`),
        '',
        '## Kết luận kiểm định',
        '',
        output.selected.fit2016To2023.profitK > 0 && output.selected.validation2024To2025.profitK > 0 && output.selected.holdout2026.profitK > 0
            ? '- Tổ hợp dương ở cả fit, validation và holdout. Đây là ứng viên cần audit thêm trước khi đưa vào production.'
            : '- Không đạt điều kiện dương đồng thời ở fit, validation và holdout; chưa đủ cơ sở thay phương pháp production.',
        '- Bảng “top holdout” trong JSON chỉ dùng chẩn đoán, tuyệt đối không dùng để chọn phương pháp vì sẽ gây overfit 2026.',
        '- `chainRiskFirst` bị loại khỏi pool vì tạo dàn giống hệt `chainFreqFirst` trong tập strict PIT.',
        '',
        '## Chốt theo toàn bộ dữ liệu đến 31/12/2025',
        '',
        `- ID: \`${milestoneSelected.config.id}\``,
        `- 2016-2025: ${output.milestoneSelectionAt2025End.historical2016To2025.wins}/${output.milestoneSelectionAt2025End.historical2016To2025.days} ngày trúng, profit ${output.milestoneSelectionAt2025End.historical2016To2025.profitK.toLocaleString('en-US')}K, ROI ${output.milestoneSelectionAt2025End.historical2016To2025.roiText}.`,
        `- Holdout 2026: ${output.milestoneSelectionAt2025End.holdout2026.wins}/${output.milestoneSelectionAt2025End.holdout2026.days} ngày trúng, profit ${output.milestoneSelectionAt2025End.holdout2026.profitK.toLocaleString('en-US')}K, ROI ${output.milestoneSelectionAt2025End.holdout2026.roiText}.`,
        '',
        '## Top 10 trên fit (chưa phải kết luận)',
        '',
        '| ID | Profit | ROI | Tỷ lệ | TB số | Năm lãi |',
        '|---|---:|---:|---:|---:|---:|',
        ...output.topFit.slice(0, 10).map(row => `| \`${row.id}\` | ${row.profitK.toLocaleString('en-US')}K | ${row.roiText} | ${row.hitRateText} | ${row.averageBets.toFixed(2)} | ${row.profitableYears}/${row.profitableYears + row.losingYears} |`),
        ''
    ].join('\n');
    fs.writeFileSync(mdPath, markdown);
    console.log(JSON.stringify({
        jsonPath,
        mdPath,
        candidateCount: candidates.length,
        eligibleCandidateCount: fitResults.length,
        candidatePool: pool,
        selected: output.selected,
        milestoneSelectionAt2025End: output.milestoneSelectionAt2025End,
        topHoldoutDiagnosticOnly: output.topHoldoutDiagnosticOnly.slice(0, 5)
    }, null, 2));
}

main();
