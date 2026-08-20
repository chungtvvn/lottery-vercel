#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const annualMilestoneService = require('../lib/services/annualMilestoneService');

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, 'reports');
const OUTPUT_DIR = path.join(ROOT, 'outputs', 'de-all-methods-inventory-2016-2025');
const STRICT_10Y_FILE = path.join(
    ROOT,
    'outputs',
    'de-strict-pit-all-methods-2016-2025',
    'bao_cao_de_strict_pit_10_nam.json'
);
const HISTORY_UI_FILE = path.join(ROOT, 'public', 'js', 'prediction-history.js');

function parseHistoryMethodMeta() {
    const source = fs.readFileSync(HISTORY_UI_FILE, 'utf8');
    const body = source.match(/const METHOD_META = \{([\s\S]*?)\n    \};/)?.[1] || '';
    const methods = [];
    const blockPattern = /^\s{8}([A-Za-z0-9_]+): \{([\s\S]*?)^\s{8}\},?/gm;
    let match;
    while ((match = blockPattern.exec(body))) {
        const [, methodId, block] = match;
        const label = block.match(/label:\s*'([^']*)'/)?.[1] || methodId;
        const description = block.match(/description:\s*'([^']*)'/)?.[1] || '';
        const hold = Number(methodId.match(/Hold(\d{1,3})$/)?.[1] || 0) || null;
        methods.push({ methodId, label, description, hold });
    }
    return methods;
}

function extractStrategyIds(report) {
    const ids = new Set(report.options?.strategyIds || report.options?.strategies || []);
    const firstRow = report.rows?.[0] || {};
    Object.keys(firstRow.strategies || {}).forEach(id => ids.add(id));
    Object.values(firstRow.strategiesByTarget || {}).forEach(strategies => {
        Object.keys(strategies || {}).forEach(id => ids.add(id));
    });
    if (report.options?.includeRollingParallel) ids.add('rolling:deParallelBlock85Small65Hold70');
    if (report.options?.includeRollingEdge75) ids.add('rolling:dedupEdge75Hold70');
    return [...ids].filter(Boolean);
}

function classifyCoverage(report, stat) {
    const options = report.options || {};
    const rows = report.rows || [];
    const startDate = options.startDate || rows[0]?.date || '';
    const endDate = options.endDate || rows.at(-1)?.date || '';
    const dateStep = Number(options.dateStep || 1);
    const startYear = Number(String(startDate).slice(0, 4));
    const endYear = Number(String(endDate).slice(0, 4));
    const fullCalendarYear = dateStep === 1
        && startYear === endYear
        && String(startDate).endsWith('-01-01')
        && String(endDate).endsWith('-12-31')
        && rows.length >= 330;
    stat.reportCount += 1;
    stat.totalRows += rows.length;
    stat.maxRows = Math.max(stat.maxRows, rows.length);
    stat.firstDate = !stat.firstDate || startDate < stat.firstDate ? startDate : stat.firstDate;
    stat.lastDate = !stat.lastDate || endDate > stat.lastDate ? endDate : stat.lastDate;
    stat.minDateStep = Math.min(stat.minDateStep, dateStep);
    if (fullCalendarYear) stat.fullDailyYears.add(startYear);
    else if (dateStep === 1) stat.dailyPartialReports += 1;
    else stat.sampledReports += 1;
}

function scanStrictResearchReports() {
    const files = fs.readdirSync(REPORTS_DIR)
        .filter(file => file.startsWith('research_true_pit_strategies_') && file.endsWith('.json'))
        .sort();
    const methodMap = new Map();
    const inventory = [];

    for (const file of files) {
        const fullPath = path.join(REPORTS_DIR, file);
        let report;
        try {
            report = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        } catch (error) {
            inventory.push({ file, parseError: error.message });
            continue;
        }
        const ids = extractStrategyIds(report);
        const rows = report.rows || [];
        const entry = {
            file,
            generatedAt: report.generatedAt || '',
            methodology: report.methodologyVersion || report.methodology || '',
            startDate: report.options?.startDate || rows[0]?.date || '',
            endDate: report.options?.endDate || rows.at(-1)?.date || '',
            dateStep: Number(report.options?.dateStep || 1),
            rows: rows.length,
            strategies: ids.join(', '),
            errors: (report.errors || []).length,
            baselineCutoffDate: report.baselineCutoffDate || report.options?.baselineCutoffDate || '',
            source: path.relative(ROOT, fullPath)
        };
        inventory.push(entry);

        for (const methodId of ids) {
            const stat = methodMap.get(methodId) || {
                methodId,
                reportCount: 0,
                totalRows: 0,
                maxRows: 0,
                firstDate: '',
                lastDate: '',
                minDateStep: Infinity,
                fullDailyYears: new Set(),
                dailyPartialReports: 0,
                sampledReports: 0
            };
            classifyCoverage(report, stat);
            methodMap.set(methodId, stat);
        }
    }

    const methodCoverage = [...methodMap.values()].map(stat => ({
        ...stat,
        minDateStep: Number.isFinite(stat.minDateStep) ? stat.minDateStep : null,
        fullDailyYears: [...stat.fullDailyYears].sort((a, b) => a - b),
        fullDailyYearCount: stat.fullDailyYears.size
    }));
    return { inventory, methodCoverage };
}

function evidenceGrade({ exact10y, fullDailyYearCount = 0, dailyPartialReports = 0, sampledReports = 0 }) {
    if (exact10y) return 'A - Strict PIT đủ 10 năm hằng ngày';
    if (fullDailyYearCount >= 2) return 'B - Strict PIT đủ ngày ở >=2 năm';
    if (fullDailyYearCount === 1 || dailyPartialReports > 0) return 'C - Strict PIT hằng ngày nhưng chưa đủ 10 năm';
    if (sampledReports > 0) return 'D - Chỉ chạy mẫu/thưa';
    return 'E - Có trong mã/production nhưng chưa có báo cáo strict lưu trữ';
}

function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const strict10y = JSON.parse(fs.readFileSync(STRICT_10Y_FILE, 'utf8'));
    const exact10yIds = new Set(strict10y.scope.methodIds);
    const rankingById = new Map(strict10y.ranking.map(row => [row.methodId, row]));
    const historyMethods = parseHistoryMethodMeta();
    const { inventory, methodCoverage } = scanStrictResearchReports();
    const coverageById = new Map(methodCoverage.map(row => [row.methodId, row]));

    const annualRegistry = Object.values(annualMilestoneService.STRATEGIES).map(strategy => {
        const coverage = coverageById.get(strategy.id) || {};
        const metric = rankingById.get(strategy.id) || null;
        return {
            baseline: 'Mốc 20 năm',
            methodId: strategy.id,
            name: strategy.name,
            type: strategy.type,
            experimental: Boolean(strategy.experimental),
            defaultTarget: strategy.defaultTarget,
            description: strategy.description,
            evidenceGrade: evidenceGrade({ exact10y: exact10yIds.has(strategy.id), ...coverage }),
            fullDailyYears: coverage.fullDailyYears || [],
            strictReportCount: coverage.reportCount || 0,
            sampledReports: coverage.sampledReports || 0,
            result10y: metric
        };
    });

    const historyRegistry = historyMethods.map(method => {
        const rollingId = method.methodId === 'dedupEdge75Hold70'
            ? 'rolling:dedupEdge75Hold70'
            : method.methodId === 'deParallelBlock85Small65Hold70'
                ? 'rolling:deParallelBlock85Small65Hold70'
                : method.methodId;
        const coverage = coverageById.get(rollingId) || coverageById.get(method.methodId) || {};
        return {
            baseline: 'Lịch sử D-1',
            ...method,
            evidenceGrade: evidenceGrade({ exact10y: false, ...coverage }),
            fullDailyYears: coverage.fullDailyYears || [],
            strictReportCount: coverage.reportCount || 0,
            sampledReports: coverage.sampledReports || 0,
            result10y: null
        };
    });

    const knownIds = new Set([
        ...annualRegistry.map(row => row.methodId),
        ...historyRegistry.map(row => row.methodId),
        ...historyRegistry.map(row => `rolling:${row.methodId}`)
    ]);
    const researchOnly = methodCoverage
        .filter(row => !knownIds.has(row.methodId))
        .map(row => ({
            ...row,
            evidenceGrade: evidenceGrade({ exact10y: false, ...row })
        }))
        .sort((a, b) => b.fullDailyYearCount - a.fullDailyYearCount || b.totalRows - a.totalRows);

    const output = {
        generatedAt: new Date().toISOString(),
        title: 'Tổng hợp toàn bộ phương pháp Đề - Mốc Lịch sử và Mốc 20 năm',
        scope: strict10y.scope,
        rules: {
            strictComparableWindow: '2016-01-01 đến 2025-12-31',
            economics: '1.000K/số, trả thưởng x84',
            annualBaseline: 'Chốt tại 31/12 năm trước, daily state chỉ dùng dữ liệu đến D-1',
            rollingBaseline: 'Mốc Lịch sử cập nhật đến D-1',
            comparability: 'Chỉ cấp A được xếp hạng trực tiếp trong bảng kết quả 10 năm. Cấp B-E chỉ là kiểm kê bằng chứng.'
        },
        summary: {
            exactStrict10yMethods: strict10y.scope.methodCount,
            annualRegisteredMethods: annualRegistry.length,
            historyRegisteredMethods: historyRegistry.length,
            strictResearchFiles: inventory.length,
            distinctStrictResearchMethodIds: methodCoverage.length,
            researchOnlyMethodIds: researchOnly.length
        },
        ranking10y: strict10y.ranking,
        annualResults10y: strict10y.periods.year,
        annualRegistry,
        historyRegistry,
        researchOnly,
        strictResearchInventory: inventory,
        sourceAudit: strict10y.audit,
        sourceFiles: [
            path.relative(ROOT, STRICT_10Y_FILE),
            'reports/research_true_pit_strategies_*.json',
            path.relative(ROOT, HISTORY_UI_FILE),
            'lib/services/annualMilestoneService.js'
        ]
    };

    const outputFile = path.join(OUTPUT_DIR, 'bao_cao_tong_hop_tat_ca_phuong_phap.json');
    fs.writeFileSync(outputFile, `${JSON.stringify(output, null, 2)}\n`);
    console.log(JSON.stringify({ outputFile, summary: output.summary }, null, 2));
}

main();
