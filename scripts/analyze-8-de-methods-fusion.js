'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const cachePath = path.join(ROOT_DIR, 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
const rawPath = path.join(ROOT_DIR, 'lib', 'data', 'xsmb-2-digits.json');

const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));

const deKeys = [
  'pentaCoreDe',
  'adaptiveDualMerge',
  'dualMerge',
  'tripleMerge',
  'deMarkovGapHazard',
  'dePositionalGraphFlow',
  'bayesFormResonance',
  'metaLearner'
];

const methodLabels = {
  pentaCoreDe: 'Ngũ Trụ AI Consensus (17s VIP X2 + 26s X1)',
  adaptiveDualMerge: 'Thích Ứng Alpha (26s VIP X2 + 8s X1)',
  dualMerge: 'Gộp Tiêu Chuẩn (18s VIP X2 + 24s X1)',
  tripleMerge: 'Tam Trụ Đồng Thuận (15s X3 + 17s X2 + 11s X1)',
  deMarkovGapHazard: 'Markov Bậc 2 & Gap Hazard (17s VIP X2 + 26s X1)',
  dePositionalGraphFlow: 'Cầu Đồ Thị Vị Trí (17s VIP X2 + 26s X1)',
  bayesFormResonance: 'Ngũ Hành Bayes Bù Trừ (17s VIP X2 + 26s X1)',
  metaLearner: 'Meta-Learner Tinh Hoa (Dàn 30s)'
};

function getRow(k, date) {
  let ledger = cache[k]?.settledLedger;
  if (!ledger && k === 'bayesFormResonance') ledger = cache.streakAwareDeAdvisor?.bayesAdvisor?.settledLedger;
  return ledger?.find(r => (r.date || r.predictionDate) === date);
}

// Common dates where all 8 methods exist
const dates = [];
cache.adaptiveDualMerge.settledLedger.forEach(r => {
  const dt = r.date || r.predictionDate;
  if (dt && deKeys.every(k => getRow(k, dt))) {
    dates.push(dt);
  }
});
dates.sort();

console.log(`========================================================================================`);
console.log(`🔬 KHẢO SÁT TOÀN DIỆN 8 PHƯƠNG PHÁP ĐỀ & PHƯƠNG PHÁP GỘP BÙ TRỪ X2 / X1`);
console.log(`📊 Số kỳ quay khảo sát: ${dates.length} kỳ (${dates[0]} → ${dates[dates.length - 1]})`);
console.log(`========================================================================================\n`);

// Individual performance of each method
console.log(`--- PHẦN 1: HIỆU SUẤT ĐỘC LẬP TỪNG PHƯƠNG PHÁP TRONG 8 PHƯƠNG PHÁP ---`);
deKeys.forEach(k => {
  let hitCount = 0;
  let x2HitCount = 0;
  let x1HitCount = 0;
  let x2Lens = [];
  let x1Lens = [];
  let totalLens = [];

  dates.forEach(dt => {
    const rawRow = raw.find(r => r.date === dt);
    const special = Number(rawRow.special);
    const row = getRow(k, dt);

    let x2 = [], x1 = [];
    if (k === 'adaptiveDualMerge' || k === 'dualMerge') {
      x2 = row.intersectionX2 || row.intersection || [];
      x1 = row.uniqueSinglesX1 || row.uniqueSingles || [];
    } else if (k === 'tripleMerge') {
      x2 = row.tierX3 || [];
      x1 = [...(row.tierX2 || []), ...(row.tierX1 || [])];
    } else if (k === 'deMarkovGapHazard' || k === 'dePositionalGraphFlow') {
      x2 = row.vipNumbers || [];
      x1 = row.backupNumbers || [];
    } else if (k === 'bayesFormResonance') {
      x2 = row.vip17 || row.vipNumbers || [];
      x1 = row.backup26 || row.backupNumbers || [];
    } else if (k === 'pentaCoreDe') {
      x2 = row.vipNumbers || [];
      x1 = row.backupNumbers || (row.numbers || []).filter(n => !x2.includes(n));
    } else if (k === 'metaLearner') {
      x2 = row.core10 || row.vipNumbers || [];
      x1 = row.backupNumbers || (row.numbers || []).filter(n => !x2.includes(n));
    }

    x2 = x2.map(Number);
    x1 = x1.map(Number);
    const all = [...new Set([...x2, ...x1])];

    x2Lens.push(x2.length);
    x1Lens.push(x1.length);
    totalLens.push(all.length);

    if (all.includes(special)) hitCount++;
    if (x2.includes(special)) x2HitCount++;
    else if (x1.includes(special)) x1HitCount++;
  });

  const avgX2 = (x2Lens.reduce((a, b) => a + b, 0) / dates.length).toFixed(1);
  const avgX1 = (x1Lens.reduce((a, b) => a + b, 0) / dates.length).toFixed(1);
  const avgTot = (totalLens.reduce((a, b) => a + b, 0) / dates.length).toFixed(1);

  console.log(`• ${methodLabels[k]}:`);
  console.log(`   - Tổng trúng: ${hitCount}/${dates.length} (${((hitCount / dates.length) * 100).toFixed(1)}%) | Bình quân: ${avgTot} số/kỳ`);
  console.log(`   - Con x2 trúng: ${x2HitCount}/${dates.length} (${((x2HitCount / dates.length) * 100).toFixed(1)}%) | Bình quân x2: ${avgX2} số/kỳ`);
  console.log(`   - Con x1 trúng: ${x1HitCount}/${dates.length} (${((x1HitCount / dates.length) * 100).toFixed(1)}%) | Bình quân x1: ${avgX1} số/kỳ`);
});

// Run fusion simulations with variations
function runFusionSimulation(name, config) {
  let allMiss = 0;
  let x2Wins = 0;
  let x1Wins = 0;
  let comboWins = 0;
  let x2Counts = [];
  let x1Counts = [];
  let totalCounts = [];
  let missDates = [];

  // Frequency of numbers in x2 and x1
  let x2FreqDist = {}; // how many times each number is chosen in x2
  let votesPerDay = []; // distribution of votes

  dates.forEach(dt => {
    const rawRow = raw.find(r => r.date === dt);
    const special = Number(rawRow.special);

    let allX2 = new Set();
    let allX1 = new Set();

    deKeys.forEach(k => {
      const row = getRow(k, dt);
      let mX2 = [], mX1 = [];

      if (k === 'adaptiveDualMerge' || k === 'dualMerge') {
        mX2 = row.intersectionX2 || row.intersection || [];
        mX1 = row.uniqueSinglesX1 || row.uniqueSingles || [];
      } else if (k === 'tripleMerge') {
        if (config.tripleMergeX2IncludeTierX2) {
          mX2 = [...(row.tierX3 || []), ...(row.tierX2 || [])];
          mX1 = row.tierX1 || [];
        } else {
          mX2 = row.tierX3 || [];
          mX1 = [...(row.tierX2 || []), ...(row.tierX1 || [])];
        }
      } else if (k === 'deMarkovGapHazard' || k === 'dePositionalGraphFlow') {
        mX2 = row.vipNumbers || [];
        mX1 = row.backupNumbers || [];
      } else if (k === 'bayesFormResonance') {
        mX2 = row.vip17 || row.vipNumbers || [];
        mX1 = row.backup26 || row.backupNumbers || [];
      } else if (k === 'pentaCoreDe') {
        mX2 = row.vipNumbers || [];
        mX1 = row.backupNumbers || (row.numbers || []).filter(n => !mX2.includes(n));
      } else if (k === 'metaLearner') {
        if (config.metaLearnerTop10X2) {
          mX2 = (row.numbers || []).slice(0, 10);
          mX1 = (row.numbers || []).slice(10);
        } else {
          mX2 = [];
          mX1 = row.numbers || [];
        }
      }

      mX2.forEach(n => allX2.add(Number(n)));
      mX1.forEach(n => allX1.add(Number(n)));
    });

    // RULE SPECIFIED BY USER:
    // 1. Dạng con x2 gộp với x2 => allX2
    // 2. Dạng con x1 gộp với x1 => allX1
    // 3. Nếu con nào dạng x2 và x1 đều có thì cho thành x2 => finalX2 = allX2
    // 4. Con nào ở dạng x1 trùng x1 thì vẫn đánh x1 => finalX1 = allX1 \ allX2
    // 5. Con nào ở dạng x2 trùng x2 thì đánh x2 => finalX2 = allX2
    const finalX2 = [...allX2].sort((a, b) => a - b);
    const finalX1 = [...allX1].filter(n => !allX2.has(n)).sort((a, b) => a - b);
    const finalAll = [...new Set([...finalX2, ...finalX1])].sort((a, b) => a - b);

    x2Counts.push(finalX2.length);
    x1Counts.push(finalX1.length);
    totalCounts.push(finalAll.length);

    const isX2Hit = finalX2.includes(special);
    const isX1Hit = finalX1.includes(special);
    const isComboHit = finalAll.includes(special);

    if (isX2Hit) {
      x2Wins++;
      comboWins++;
    } else if (isX1Hit) {
      x1Wins++;
      comboWins++;
    } else {
      allMiss++;
      missDates.push({ date: dt, special, finalCount: finalAll.length, x2Count: finalX2.length, x1Count: finalX1.length });
    }
  });

  const avgX2 = (x2Counts.reduce((a, b) => a + b, 0) / dates.length).toFixed(1);
  const avgX1 = (x1Counts.reduce((a, b) => a + b, 0) / dates.length).toFixed(1);
  const avgTot = (totalCounts.reduce((a, b) => a + b, 0) / dates.length).toFixed(1);
  const minTot = Math.min(...totalCounts);
  const maxTot = Math.max(...totalCounts);
  const minX2 = Math.min(...x2Counts);
  const maxX2 = Math.max(...x2Counts);
  const minX1 = Math.min(...x1Counts);
  const maxX1 = Math.max(...x1Counts);

  console.log(`\n========================================================================================`);
  console.log(`🏆 KẾT QUẢ GỘP 8 PHƯƠNG PHÁP: ${name}`);
  console.log(`========================================================================================`);
  console.log(`1. CẢ 8 PHƯƠNG PHÁP CÙNG TRƯỢT:`);
  console.log(`   - Số ngày cả 8 phương pháp đều trượt: ${allMiss} ngày / ${dates.length} ngày (${((allMiss / dates.length) * 100).toFixed(1)}%)`);
  console.log(`   - Số ngày có ít nhất 1 phương pháp trúng: ${comboWins} ngày / ${dates.length} ngày (${((comboWins / dates.length) * 100).toFixed(1)}%)`);
  console.log(`\n2. KẾT QUẢ CỦA CÁC CON X2 (GỘP):`);
  console.log(`   - Số ngày nổ trúng con x2: ${x2Wins} ngày / ${dates.length} ngày (${((x2Wins / dates.length) * 100).toFixed(1)}%)`);
  console.log(`   - Quy mô dàn x2: Bình quân ${avgX2} số/ngày (Biên độ: ${minX2} → ${maxX2} số)`);
  console.log(`\n3. KẾT QUẢ CỦA CÁC CON X1 (GỘP - SAU KHI LỌC TRÙNG X2):`);
  console.log(`   - Số ngày nổ trúng con x1: ${x1Wins} ngày / ${dates.length} ngày (${((x1Wins / dates.length) * 100).toFixed(1)}%)`);
  console.log(`   - Quy mô dàn x1: Bình quân ${avgX1} số/ngày (Biên độ: ${minX1} → ${maxX1} số)`);
  console.log(`\n4. TỔNG QUAN DÀN GỘP (X2 + X1):`);
  console.log(`   - Tổng số con bình quân: ${avgTot} số/ngày (Biên độ: ${minTot} → ${maxTot} số)`);
  console.log(`   - Tỷ lệ bao phủ bảng số (00-99): ${(avgTot / 100 * 100).toFixed(1)}%`);

  return { allMiss, comboWins, x2Wins, x1Wins, avgX2, avgX1, avgTot, missDates, datesCount: dates.length };
}

// Run baseline
const res1 = runFusionSimulation('Quy ước Chuẩn (tripleMerge X2=tierX3 15s, metaLearner 30s ở X1)', {
  tripleMergeX2IncludeTierX2: false,
  metaLearnerTop10X2: false
});

const res2 = runFusionSimulation('Quy ước Mở Rộng 1 (tripleMerge X2=tierX3+tierX2 32s, metaLearner 30s ở X1)', {
  tripleMergeX2IncludeTierX2: true,
  metaLearnerTop10X2: false
});

const res3 = runFusionSimulation('Quy ước Mở Rộng 2 (tripleMerge X2=tierX3+tierX2, metaLearner Top10 ở X2)', {
  tripleMergeX2IncludeTierX2: true,
  metaLearnerTop10X2: true
});

console.log(`\n========================================================================================`);
console.log(`📋 DANH SÁCH CHI TIẾT CÁC NGÀY CẢ 8 PHƯƠNG PHÁP ĐỀU TRƯỢT (${res1.allMiss} NGÀY):`);
console.log(`========================================================================================`);
res1.missDates.forEach((m, idx) => {
  console.log(`  ${String(idx + 1).padStart(2, ' ')}. Ngày ${m.date}: ĐB về ${String(m.special).padStart(2, '0')} (Tổng dàn gộp hôm đó có ${m.finalCount} số: ${m.x2Count}s x2 + ${m.x1Count}s x1)`);
});
