#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'outputs/de-strict-pit-all-methods-2016-2025/bao_cao_de_strict_pit_10_nam.json');
const OUTPUT_DIR = path.join(ROOT, 'outputs/de-union-all-methods-2016-2025');
const STAKE_PER_NUMBER_K = 1000;
const PAYOUT_K = 84000;

const source = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));

function longestStreak(rows, predicate) {
  let current = 0;
  let longest = 0;
  for (const row of rows) {
    current = predicate(row) ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function summarize(rows, period) {
  const days = rows.length;
  const hitDays = rows.filter((row) => row.hit).length;
  const profitableDays = rows.filter((row) => row.profitK > 0).length;
  const breakEvenDays = rows.filter((row) => row.profitK === 0).length;
  const totalNumbers = rows.reduce((sum, row) => sum + row.numberCount, 0);
  const stakeK = rows.reduce((sum, row) => sum + row.stakeK, 0);
  const payoutK = rows.reduce((sum, row) => sum + row.payoutK, 0);
  const profitK = payoutK - stakeK;
  return {
    period,
    days,
    hitDays,
    missDays: days - hitDays,
    profitableDays,
    breakEvenDays,
    lossDays: days - profitableDays - breakEvenDays,
    totalNumbers,
    avgNumbers: days ? totalNumbers / days : 0,
    minNumbers: days ? Math.min(...rows.map((row) => row.numberCount)) : 0,
    maxNumbers: days ? Math.max(...rows.map((row) => row.numberCount)) : 0,
    hitRate: days ? hitDays / days : 0,
    profitableDayRate: days ? profitableDays / days : 0,
    stakeK,
    payoutK,
    profitK,
    roi: stakeK ? profitK / stakeK : 0,
    longestHit: longestStreak(rows, (row) => row.hit),
    longestMiss: longestStreak(rows, (row) => !row.hit),
    longestProfit: longestStreak(rows, (row) => row.profitK > 0),
    longestLoss: longestStreak(rows, (row) => row.profitK < 0)
  };
}

function aggregate(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const key = row[field];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, values]) => summarize(values, key));
}

const daily = source.dailyConsensus.map((row) => {
  const numberCount = row.unionCount;
  const hit = row.unionHit;
  const stakeK = numberCount * STAKE_PER_NUMBER_K;
  const payoutK = hit ? PAYOUT_K : 0;
  return {
    date: row.date,
    year: row.year,
    month: row.month,
    week: row.week,
    actual: row.actual,
    numbers: row.unionNumbers,
    numberCount,
    hit,
    methodsHit: row.methodsHit,
    actualVoteCount: row.actualVoteCount,
    totalMethodSelections: row.totalMethodSelections,
    duplicateSelections: row.totalMethodSelections - numberCount,
    stakeK,
    payoutK,
    profitK: payoutK - stakeK
  };
});

const overall = summarize(daily, `${source.scope.startDate} -> ${source.scope.endDate}`);
const separatePortfolio = source.portfolio;
const report = {
  generatedAt: new Date().toISOString(),
  title: 'Backtest De - Hop tat ca phuong phap, khu trung tung so',
  scope: source.scope,
  methodology: {
    sourceMethodology: source.methodology,
    sourceAudit: source.audit,
    methodCount: source.scope.methodCount,
    combination: 'Union dàn số của 14 phương pháp theo từng ngày; mỗi số chỉ cược một đơn vị dù xuất hiện ở nhiều phương pháp.',
    stakePerNumberK: STAKE_PER_NUMBER_K,
    payoutMultiplier: 84,
    profitFormula: 'profitK = (trúng ? 84.000K : 0) - số duy nhất * 1.000K',
    caveat: 'Nguồn strict PIT hiện có chưa bao gồm Edge75 PIT production mới; không suy diễn hoặc chèn kết quả của phương pháp thiếu nguồn.'
  },
  overall,
  comparison: {
    unionDeduplicated: overall,
    playEveryMethodSeparately: separatePortfolio
  },
  periods: {
    year: aggregate(daily, 'year'),
    month: aggregate(daily, 'month'),
    week: aggregate(daily, 'week')
  },
  daily
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUTPUT_DIR, 'bao_cao_de_hop_tat_ca_phuong_phap_10_nam.json'), JSON.stringify(report, null, 2));

const fmt = (value, digits = 2) => Number(value).toLocaleString('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = (value) => `${fmt(value * 100, 2)}%`;
const md = `# Báo cáo Đề: Hợp tất cả phương pháp, khử trùng từng số\n\n` +
  `- Phạm vi: ${source.scope.startDate} đến ${source.scope.endDate} (${source.scope.days.toLocaleString('vi-VN')} ngày).\n` +
  `- Phương pháp nguồn: ${source.scope.methodCount}.\n` +
  `- Số duy nhất trung bình/ngày: ${fmt(overall.avgNumbers)} (min ${overall.minNumbers}, max ${overall.maxNumbers}).\n` +
  `- Trúng kết quả: ${overall.hitDays}/${overall.days} ngày (${pct(overall.hitRate)}).\n` +
  `- Ngày thực sự có lãi: ${overall.profitableDays}/${overall.days} (${pct(overall.profitableDayRate)}).\n` +
  `- Vốn: ${overall.stakeK.toLocaleString('vi-VN')}K.\n` +
  `- Trả thưởng: ${overall.payoutK.toLocaleString('vi-VN')}K.\n` +
  `- Profit: ${overall.profitK.toLocaleString('vi-VN')}K; ROI ${pct(overall.roi)}.\n` +
  `- Chuỗi trúng/trượt dài nhất: ${overall.longestHit}/${overall.longestMiss} ngày.\n` +
  `- Chuỗi lãi/lỗ dài nhất: ${overall.longestProfit}/${overall.longestLoss} ngày.\n\n` +
  `## Kết luận\n\n` +
  `Độ phủ cao không đồng nghĩa có lãi. Khi dàn vượt 84 số, ngay cả ngày trúng vẫn lỗ theo tỷ lệ ăn 84. ` +
  `Hợp toàn bộ phương pháp phù hợp làm phép kiểm tra độ phủ, không phù hợp làm chiến lược cược production.\n`;
fs.writeFileSync(path.join(OUTPUT_DIR, 'bao_cao_de_hop_tat_ca_phuong_phap_10_nam.md'), md);

console.log(JSON.stringify({ outputDir: OUTPUT_DIR, overall, separatePortfolio }, null, 2));
