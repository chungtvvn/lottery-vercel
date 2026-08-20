(() => {
  const fmt = value => String(Number(value)).padStart(2, '0');
  const percent = value => `${(Number(value || 0) * 100).toFixed(1)}%`;
  const money = value => `${new Intl.NumberFormat('vi-VN').format(Math.abs(Number(value || 0)))}K`;
  const signedMoney = value => `${Number(value || 0) >= 0 ? '+' : '-'}${money(value)}`;
  const el = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

  let activeDistributionAxisId = null;
  let activeDistributionRecord = null;
  let currentMatrixFilter = 'all';
  let latestPayload = null;

  // Toast Helper
  function showToast(message) {
    const toast = el('toast');
    const toastMsg = el('toastMessage');
    if (!toast || !toastMsg) return;
    toastMsg.textContent = message;
    toast.classList.remove('translate-y-10', 'opacity-0', 'pointer-events-none');
    toast.classList.add('translate-y-0', 'opacity-100');
    setTimeout(() => {
      toast.classList.remove('translate-y-0', 'opacity-100');
      toast.classList.add('translate-y-10', 'opacity-0', 'pointer-events-none');
    }, 2200);
  }

  // Copy to clipboard helper
  function copyNumbers(numbers, separator = ' ') {
    if (!Array.isArray(numbers) || numbers.length === 0) return;
    const text = numbers.map(fmt).join(separator);
    navigator.clipboard.writeText(text).then(() => {
      showToast(`Đã sao chép ${numbers.length} số thành công!`);
    }).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast(`Đã sao chép ${numbers.length} số!`);
    });
  }

  const legacyLabels = {
    groupDeficit: 'Thiếu tương đối ở nhóm dạng số',
    frequencyDeficit: 'Thiếu tần suất trong cửa sổ ngắn',
    gap: 'Khoảng vắng mặt so với nhịp riêng',
    chainConsensus: 'Đồng thuận từ dàn chuỗi đã khử trùng'
  };
  const v2Labels = {
    onlineModel: 'Ranker online regularized',
    groupResidual: 'Residual nhóm số khử tương quan',
    frequencyPosterior: 'Tần suất empirical-Bayes',
    gapHazard: 'Hazard gap làm mượt',
    chainConsensus: 'Đồng thuận chuỗi đã kiểm chứng'
  };

  function isV2(record) {
    return record?.modelVersion === 'probability-score-v2'
      || record?.scoreDefinition?.kind === 'online-calibrated-relative-ranking-v2';
  }

  function calibrationFor(record) {
    return record?.model?.calibration || record?.scoreDefinition?.calibration || null;
  }

  function text(value, fallback = '-') {
    return value === null || value === undefined || value === '' ? fallback : String(value);
  }

  function modelStatus(record) {
    const calibration = calibrationFor(record);
    if (!isV2(record)) {
      return {
        className: 'border-slate-200 bg-slate-50 text-slate-700',
        title: 'Snapshot legacy v1',
        detail: 'Dữ liệu này được phát hành trước score v2; chỉ giữ để đối chiếu snapshot cũ, không dùng để xác nhận mô hình mới.'
      };
    }
    if (calibration?.eligible) {
      return {
        className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        title: 'Đủ cổng calibration nội bộ',
        detail: 'Vẫn cần dương và vượt Wilson lower ở hai holdout độc lập trước khi được đưa vào phương án vận hành.'
      };
    }
    return {
      className: 'border-amber-200 bg-amber-50 text-amber-900',
      title: 'Lane nghiên cứu, chưa đủ điều kiện áp dụng',
      detail: 'Điểm v2 chỉ được dùng để quan sát cho tới khi dữ liệu quá khứ độc lập đạt ngưỡng xác suất và lợi nhuận đã công bố trước.'
    };
  }

  function showDetail(row, record) {
    if (!row) return;
    const detail = el('number-detail');
    if (!detail) return;
    detail.classList.remove('hidden');
    if (!isV2(record)) {
      const groups = row.evidence?.groupSignals
        ?.map(group => `${group.label} (z thiếu ${group.deficitZ})`)
        .join('; ') || 'Chưa có tín hiệu nhóm nổi bật';
      detail.innerHTML = `<strong>Số ${fmt(row.number)} · hạng #${row.rank} · ${row.score}/100</strong><div class="mt-2 grid gap-1">Nhóm: ${text(row.components?.groupDeficit)} · Tần suất ngắn: ${text(row.components?.frequencyDeficit)} · Gap: ${text(row.components?.gap)} · Đồng thuận chuỗi: ${text(row.components?.chainConsensus)}</div><p class="mt-2 text-slate-600">${groups}</p>`;
      return;
    }

    const frequency = row.evidence?.frequency || {};
    const hazard = row.evidence?.gapHazard || {};
    const groups = row.evidence?.groupSignals
      ?.map(group => `${group.label} (residual z ${text(group.z, '0')})`)
      .join('; ') || 'Không có residual nhóm đủ mạnh sau khử tương quan.';
    const chainMethods = row.evidence?.chainMethods?.length
      ? row.evidence.chainMethods.join(', ')
      : 'Không có chuỗi nào đủ cỡ mẫu và edge để được tính vào số này.';
    
    const evVal = Number(row.expectedValueEV || ((row.probability || 0.01) * 84 - 1) * 100);
    const evClass = evVal >= 0 ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-100 text-slate-700 border-slate-200';
    const evText = `${evVal >= 0 ? '+' : ''}${evVal.toFixed(1)}% EV`;
    const weibullVal = hazard.weibullHazard !== undefined ? `${(hazard.weibullHazard * 100).toFixed(2)}%` : `${percent(hazard.posterior)}`;

    detail.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-200/60 pb-3">
        <div>
          <strong class="text-lg font-black text-indigo-950">Số ${fmt(row.number)} · Hạng #${row.rank}</strong>
          <span class="ml-2 text-xs font-bold text-slate-500">Điểm tổng hợp: <strong class="text-indigo-700 font-black">${row.score}/100</strong></span>
        </div>
        <div class="flex items-center gap-2">
          <span class="rounded-xl border px-3 py-1 text-xs font-black ${evClass}">${evText}</span>
          <span class="rounded-xl bg-indigo-200/60 px-2.5 py-1 text-xs font-black text-indigo-900">Score v3 Pro</span>
        </div>
      </div>
      <div class="mt-4 grid gap-3 text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <p class="text-[10px] font-black uppercase text-slate-500">Xác Suất Dự Báo</p>
          <strong class="mt-1 block text-base font-black text-indigo-900">${(Number(row.probability || 0) * 100).toFixed(3)}%</strong>
          <p class="text-[10px] text-slate-500 mt-0.5">Chuẩn hóa 100 số</p>
        </div>
        <div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <p class="text-[10px] font-black uppercase text-slate-500">Weibull Hazard</p>
          <strong class="mt-1 block text-base font-black text-cyan-900">${weibullVal}</strong>
          <p class="text-[10px] text-slate-500 mt-0.5">Xác suất nổ theo gap</p>
        </div>
        <div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <p class="text-[10px] font-black uppercase text-slate-500">Tần Suất 180 / 45 Kỳ</p>
          <strong class="mt-1 block text-base font-black text-slate-900">${text(frequency.longCount, '0')} / ${text(frequency.shortCount, '0')}</strong>
          <p class="text-[10px] text-slate-500 mt-0.5">Posterior: ${percent(frequency.shortPosterior)}</p>
        </div>
        <div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <p class="text-[10px] font-black uppercase text-slate-500">Khoảng Vắng (Gap)</p>
          <strong class="mt-1 block text-base font-black text-amber-900">${text(hazard.currentGap, '0')} ngày</strong>
          <p class="text-[10px] text-slate-500 mt-0.5">Độ tin cậy: ${percent(hazard.reliability)}</p>
        </div>
      </div>
      <div class="mt-4 grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
        <div class="rounded-xl border border-slate-100 bg-white p-3">
          <p class="font-bold text-slate-900">Residual nhóm số:</p>
          <p class="mt-1 text-slate-600">${groups}</p>
        </div>
        <div class="rounded-xl border border-slate-100 bg-white p-3">
          <p class="font-bold text-slate-900">Đồng thuận chuỗi độc lập:</p>
          <p class="mt-1 text-slate-600">${chainMethods}</p>
        </div>
      </div>`;
  }

  function renderCalibration(record) {
    const calibration = calibrationFor(record);
    const node = el('calibration-gate');
    const stage = el('model-stage');
    const status = modelStatus(record);
    stage.textContent = status.title;
    stage.className = `mt-2 inline-flex rounded-2xl border px-3.5 py-1 text-xs font-black backdrop-blur-sm ${status.className}`;

    if (!calibration) {
      node.innerHTML = `<div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-semibold text-slate-700"><strong>${status.title}</strong><p class="mt-1">${status.detail}</p></div>`;
      return false;
    }

    const eligible = Boolean(calibration.eligible);
    node.innerHTML = `
      <div class="rounded-2xl border ${eligible ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'} p-4 text-xs ${eligible ? 'text-emerald-950' : 'text-amber-950'}">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <strong class="text-sm">${status.title}</strong>
          <span class="rounded-xl bg-white px-3 py-1 font-black shadow-xs">${calibration.days || 0} ngày calibration</span>
        </div>
        <p class="mt-1.5 leading-relaxed">${status.detail}</p>
        <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 font-semibold">
          <span>Hit rate: <strong>${percent(calibration.hitRate)}</strong></span>
          <span>Wilson lower: <strong>${percent(calibration.wilsonLower)}</strong></span>
          <span>Hòa vốn 30 số: <strong>${percent(calibration.breakEvenHitRate)}</strong></span>
          <span>Log loss: <strong>${Number(calibration.logLoss || 0).toFixed(3)}</strong> / uniform ${Number(calibration.uniformLogLoss || 0).toFixed(3)}</span>
        </div>
      </div>`;
    return eligible;
  }

  function renderGroups(record) {
    const groups = record.groupSignals || [];
    el('groups').innerHTML = groups.map(group => {
      const z = Number(group.residualZ ?? group.deficitZ ?? 0);
      const direction = group.direction || (z >= 0 ? 'cao hơn kỳ vọng' : 'thấp hơn kỳ vọng');
      return `<div class="flex items-center justify-between gap-4 p-4"><div><strong class="text-sm font-bold text-slate-900">${group.label}</strong><p class="text-xs text-slate-500 mt-0.5">${group.size} số · ${direction}</p></div><strong class="font-mono text-sm ${z >= 0 ? 'text-indigo-700 font-black' : 'text-slate-600'}">z ${z.toFixed(3)}</strong></div>`;
    }).join('') || '<p class="p-5 text-xs text-slate-500">Chưa có tín hiệu nhóm độc lập đủ mạnh.</p>';
  }

  function renderHistoricalAnalysis(analysis) {
    const statusNode = el('historical-analysis-status');
    const cardsNode = el('historical-analysis-cards');
    const yearlyNode = el('historical-yearly');
    const recentNode = el('historical-recent');
    if (!statusNode || !cardsNode || !yearlyNode || !recentNode) return;

    if (!analysis?.strictPointInTime || !analysis?.summary) {
      statusNode.innerHTML = '<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900"><strong>Cache hiện tại chưa có báo cáo toàn bộ lịch sử.</strong><p class="mt-1">Action kế tiếp sẽ chạy walk-forward từ raw R2 và lưu báo cáo compact.</p></div>';
      cardsNode.innerHTML = '';
      yearlyNode.innerHTML = '<p class="p-4 text-xs text-slate-500">Chưa có dữ liệu theo năm.</p>';
      recentNode.innerHTML = '<p class="p-4 text-xs text-slate-500">Chưa có dữ liệu kỳ gần nhất.</p>';
      return;
    }

    const source = analysis.source || {};
    statusNode.innerHTML = `<div class="flex flex-wrap items-start justify-between gap-4"><div><strong class="text-blue-900 font-bold text-sm">Strict point-in-time · toàn bộ raw ${escapeHtml(source.dataStart || '-')} → ${escapeHtml(source.dataEnd || '-')}</strong><p class="mt-1 leading-relaxed text-xs text-slate-600">${escapeHtml(source.trainingRule || 'Ngày D chỉ sử dụng dữ liệu trước D.')}</p><p class="mt-1 text-xs text-slate-500">${Number(source.rawRows || 0).toLocaleString('vi-VN')} kỳ raw · ${Number(source.evaluatedDays || 0).toLocaleString('vi-VN')} kỳ được đánh giá sau warm-up</p></div><span class="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-800">NGHIÊN CỨU · KHÔNG VIẾT LẠI SNAPSHOT</span></div>`;

    const summaryCard = (label, summary, note) => {
      const profit = Number(summary?.profitK || 0);
      const hitRate = Number(summary?.hitRate || 0);
      const lower = Number(summary?.wilsonLower || 0);
      const breakEven = Number(summary?.breakEvenHitRate || analysis.economics?.breakEvenHitRate || 0);
      return `<article class="rounded-2xl border ${profit >= 0 ? 'border-emerald-200 bg-emerald-50/60' : 'border-rose-200 bg-rose-50/60'} p-4"><p class="text-[11px] font-black uppercase tracking-wide text-slate-500">${escapeHtml(label)}</p><div class="mt-2 flex items-end justify-between gap-2"><strong class="text-2xl font-black text-slate-900">${percent(hitRate)}</strong><span class="text-xs font-bold ${profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${signedMoney(profit)}</span></div><p class="mt-2 text-xs font-semibold text-slate-600">${summary?.wins || 0}/${summary?.days || 0} ngày trúng · Wilson ${percent(lower)}</p><p class="mt-1 text-xs text-slate-500">Hòa vốn ${percent(breakEven)} · ROI ${percent(summary?.roi)}</p><p class="mt-1.5 text-[11px] font-medium text-slate-400">${escapeHtml(note)}</p></article>`;
    };
    cardsNode.innerHTML = [
      summaryCard('Toàn bộ lịch sử', analysis.summary, `${analysis.summary?.startDate || '-'} → ${analysis.summary?.endDate || '-'}`),
      summaryCard('365 kỳ gần nhất', analysis.windows?.last365, 'Cửa sổ ngắn hạn tuần tự PIT'),
      summaryCard('90 kỳ gần nhất', analysis.windows?.last90, 'Không thay thế toàn lịch sử'),
      summaryCard('30 kỳ gần nhất', analysis.windows?.last30, 'Quan sát drift gần đây')
    ].join('');

    const yearlyRows = (analysis.yearly || []).slice().reverse();
    yearlyNode.innerHTML = yearlyRows.length
      ? `<div class="max-h-[520px] overflow-auto"><table class="w-full text-left text-xs"><thead class="sticky top-0 bg-slate-100 uppercase text-slate-500 font-bold"><tr><th class="px-3 py-2">Năm</th><th class="px-3 py-2 text-right">Trúng</th><th class="px-3 py-2 text-right">Tỷ lệ</th><th class="px-3 py-2 text-right">Wilson</th><th class="px-3 py-2 text-right">Lãi/lỗ</th></tr></thead><tbody class="divide-y divide-slate-100">${yearlyRows.map(row => `<tr><td class="px-3 py-2 font-black text-slate-900">${escapeHtml(row.period)}</td><td class="px-3 py-2 text-right">${row.wins || 0}/${row.days || 0}</td><td class="px-3 py-2 text-right font-bold">${percent(row.hitRate)}</td><td class="px-3 py-2 text-right text-slate-500">${percent(row.wilsonLower)}</td><td class="px-3 py-2 text-right font-black ${Number(row.profitK || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${signedMoney(row.profitK)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="p-4 text-xs text-slate-500">Chưa có dữ liệu theo năm.</p>';

    const recentRows = (analysis.recentRows || []).slice(-14).reverse();
    recentNode.innerHTML = recentRows.length
      ? `<div class="divide-y divide-slate-100">${recentRows.map(row => `<div class="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2 text-xs"><div><strong class="text-slate-900">${escapeHtml(row.date)}</strong><p class="mt-0.5 text-slate-500">KQ ${fmt(row.actual)} · confidence ${Number(row.meanRelativeConfidence || 0).toFixed(2)}</p></div><span class="rounded-lg px-2.5 py-1 text-xs font-black ${row.hit ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${row.hit ? 'TRÚNG' : 'TRƯỢT'}</span></div>`).join('')}</div>`
      : '<p class="p-4 text-xs text-slate-500">Chưa có dữ liệu kỳ gần nhất.</p>';
  }

  function signed(value, digits = 3) {
    const number = Number(value || 0);
    return `${number >= 0 ? '+' : ''}${number.toFixed(digits)}`;
  }

  function precisePercent(value, digits = 3) {
    return `${(Number(value || 0) * 100).toFixed(digits)}%`;
  }

  function matrixMatchesFilter(num, filter, top10Nums, top20Nums, top30Nums) {
    if (filter === 'all') return true;
    if (filter === 'top10') return top10Nums.includes(num);
    if (filter === 'top20') return top20Nums.includes(num);
    if (filter === 'top30') return top30Nums.includes(num);
    const tens = Math.floor(num / 10);
    const units = num % 10;
    if (filter === 'even_even') return tens % 2 === 0 && units % 2 === 0;
    if (filter === 'odd_odd') return tens % 2 !== 0 && units % 2 !== 0;
    if (filter === 'sum_even') return (tens + units) % 2 === 0;
    if (filter === 'sum_odd') return (tens + units) % 2 !== 0;
    return true;
  }

  function renderDistributionExplorer(current) {
    activeDistributionRecord = current || null;
    const select = el('distribution-axis-select');
    const detail = el('distribution-axis-detail');
    const matrix = el('distribution-number-matrix');
    const axes = (current?.partitionSignals || []).filter(axis => Array.isArray(axis.categories) && axis.categories.length);

    if (!current) {
      if (select) {
        select.innerHTML = '<option>Chưa có snapshot</option>';
        select.disabled = true;
      }
      if (detail) detail.innerHTML = '<p class="text-xs text-slate-500">Chưa có dữ liệu phân bổ để dựng biểu đồ.</p>';
      if (matrix) matrix.innerHTML = '';
      return;
    }

    if (select) {
      select.disabled = axes.length === 0;
      if (!activeDistributionAxisId || !axes.some(axis => axis.id === activeDistributionAxisId)) {
        activeDistributionAxisId = axes[0]?.id || null;
      }
      select.innerHTML = axes.length
        ? axes.map(axis => `<option value="${escapeHtml(axis.id)}" ${axis.id === activeDistributionAxisId ? 'selected' : ''}>${escapeHtml(axis.label)}</option>`).join('')
        : '<option>Đang chờ cache</option>';
    }

    const activeAxis = axes.find(axis => axis.id === activeDistributionAxisId) || null;
    if (detail) {
      if (!activeAxis) {
        detail.innerHTML = '<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900"><strong>Snapshot hiện tại chưa có ma trận category.</strong></div>';
      } else {
        const rows = activeAxis.categories.map(category => {
          const historical = Number(category.historicalProbability || 0);
          const recent = Number(category.recentProbability || 0);
          const forecast = Number(category.forecastProbability || category.contextProbability || 0);
          const delta = forecast - historical;
          const maxProbability = Math.max(historical, recent, forecast, 0.000001);
          const width = value => Math.max(1, Math.min(100, Number(value || 0) / maxProbability * 100));
          return `
            <div class="grid gap-2 border-t border-slate-100 py-2.5 first:border-t-0 lg:grid-cols-[minmax(120px,1fr)_1.2fr_1.2fr_1.2fr_auto] lg:items-center text-xs">
              <div>
                <strong class="text-xs text-slate-900">${escapeHtml(category.label)}</strong>
                <p class="mt-0.5 text-[10px] text-slate-500">${category.size || 0} số · mẫu ${category.historicalCount || 0}</p>
              </div>
              <div>
                <div class="flex justify-between gap-2 text-[10px] text-slate-500"><span>Lịch sử</span><strong>${precisePercent(historical)}</strong></div>
                <div class="distribution-bar mt-1"><span class="bg-slate-400" style="width:${width(historical)}%"></span></div>
              </div>
              <div>
                <div class="flex justify-between gap-2 text-[10px] text-slate-500"><span>${activeAxis.recentWindowSize || 0} ngày</span><strong>${precisePercent(recent)}</strong></div>
                <div class="distribution-bar mt-1"><span class="bg-cyan-500" style="width:${width(recent)}%"></span></div>
              </div>
              <div>
                <div class="flex justify-between gap-2 text-[10px] text-slate-500"><span>Dự báo</span><strong>${precisePercent(forecast)}</strong></div>
                <div class="distribution-bar mt-1"><span class="bg-indigo-600" style="width:${width(forecast)}%"></span></div>
              </div>
              <span class="justify-self-start rounded-lg px-2 py-0.5 text-[11px] font-black ${delta >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                ${delta >= 0 ? '+' : ''}${precisePercent(delta)}
              </span>
            </div>
          `;
        }).join('');
        detail.innerHTML = `
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 class="font-black text-sm text-slate-900">${escapeHtml(activeAxis.label)}</h4>
              <p class="mt-0.5 text-xs text-slate-500">${escapeHtml(activeAxis.description)}</p>
            </div>
            <span class="rounded-xl border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-black text-cyan-800">${escapeHtml(activeAxis.lastCategory || 'Chưa có trạng thái')}</span>
          </div>
          <div class="mt-3">${rows}</div>
        `;
      }
    }

    // 10x10 Heatmap Matrix
    if (matrix) {
      const topNumbers = latestPayload?.records?.at(-1)?.topNumbers || [];
      const topSorted = topNumbers.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
      const top10Nums = topSorted.slice(0, 10).map(r => Number(r.number));
      const top20Nums = topSorted.slice(0, 20).map(r => Number(r.number));
      const top30Nums = topSorted.slice(0, 30).map(r => Number(r.number));

      const ranked = (current.rankedNumbers || []).slice().sort((left, right) => Number(left.number) - Number(right.number));
      matrix.innerHTML = ranked.map(row => {
        const num = Number(row.number);
        const inFilter = matrixMatchesFilter(num, currentMatrixFilter, top10Nums, top20Nums, top30Nums);
        const percentile = Number(row.rankPercentile ?? row.score / 100 ?? 0);
        const strength = Math.max(0, Math.min(1, percentile));
        const background = inFilter
          ? `rgba(79, 70, 229, ${(0.08 + strength * 0.85).toFixed(3)})`
          : '#f1f5f9';
        const color = inFilter ? (strength >= 0.5 ? '#ffffff' : '#1e1b4b') : '#94a3b8';
        const opacity = inFilter ? 'opacity-100 scale-100' : 'opacity-30 scale-95';
        const isTop10 = top10Nums.includes(num);

        return `
          <button type="button" data-mat-num="${row.number}" class="probability-cell flex items-center justify-center rounded-xl border border-white/80 font-mono text-xs font-black shadow-xs transition-all hover:scale-110 hover:ring-2 hover:ring-indigo-400 ${opacity} ${isTop10 ? 'ring-2 ring-amber-400' : ''}" style="background:${background};color:${color}">
            ${fmt(row.number)}
          </button>
        `;
      }).join('') || '<p class="col-span-10 text-xs text-slate-500">Chưa lưu ma trận 100 số.</p>';

      matrix.querySelectorAll('button[data-mat-num]').forEach(btn => {
        btn.addEventListener('click', () => {
          const numVal = Number(btn.getAttribute('data-mat-num'));
          const latest = latestPayload?.records?.at(-1);
          if (latest) {
            const found = (latest.rankedNumbers || []).find(r => r.number === numVal);
            showDetail(found, latest);
          }
        });
      });
    }
  }

  function renderDistribution(recordPayload) {
    const distribution = recordPayload.distribution;
    const statusNode = el('distribution-status');
    const signalsNode = el('distribution-signals');
    if (!distribution) {
      if (statusNode) statusNode.innerHTML = '<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900">Chưa có snapshot phân bổ nhóm.</div>';
      if (signalsNode) signalsNode.innerHTML = '';
      renderDistributionExplorer(null);
      return;
    }

    const current = distribution.record || null;
    const summary = distribution.summary || {};
    if (statusNode) {
      statusNode.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <span>Snapshot <strong>${current?.predictionDate || '-'}</strong> · ${current?.topNumbers?.length || 0} số nghiên cứu</span>
          <span>${summary.settledDays || 0} kỳ đã kết toán · ${percent(summary.hitRate)} trúng · ${signedMoney(summary.profitK)}</span>
        </div>
      `;
    }

    const axes = current?.partitionSignals || [];
    if (signalsNode) {
      signalsNode.innerHTML = axes.map(axis => {
        return `
          <article class="rounded-2xl border border-cyan-100 bg-slate-50/60 p-4">
            <div class="flex items-start justify-between gap-2">
              <div>
                <h3 class="text-xs font-black text-slate-900">${text(axis.label)}</h3>
                <p class="mt-0.5 text-[11px] text-slate-500">${text(axis.description)}</p>
              </div>
              <span class="rounded-lg bg-cyan-100 px-2 py-0.5 text-[10px] font-black text-cyan-900">${text(axis.lastCategory, 'Chưa có')}</span>
            </div>
            <div class="mt-2.5 grid grid-cols-3 gap-1.5 text-center text-xs">
              <div class="rounded-lg bg-white p-1.5 border border-slate-100">
                <p class="text-[10px] text-slate-400">1 bước</p>
                <strong class="block text-slate-800">${percent(axis.transitionReliability)}</strong>
              </div>
              <div class="rounded-lg bg-white p-1.5 border border-slate-100">
                <p class="text-[10px] text-slate-400">2 bước</p>
                <strong class="block text-slate-800">${percent(axis.contextReliability)}</strong>
              </div>
              <div class="rounded-lg bg-white p-1.5 border border-slate-100">
                <p class="text-[10px] text-slate-400">Residual</p>
                <strong class="block text-slate-800">${percent(axis.residualReliability)}</strong>
              </div>
            </div>
          </article>
        `;
      }).join('') || '<p class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">Chưa lưu chi tiết các trục phân bổ.</p>';
    }

    renderDistributionExplorer(current);
  }

  function render(recordPayload) {
    latestPayload = recordPayload;
    const latest = recordPayload.records?.at(-1);
    if (!latest) throw new Error('Cache chưa có snapshot.');
    const definition = latest.scoreDefinition || {};
    const eligible = renderCalibration(latest);
    const labels = isV2(latest) ? v2Labels : legacyLabels;

    el('prediction-date').textContent = latest.predictionDate || '-';
    el('source-date').textContent = `Dữ liệu đến ${latest.sourceDataThrough || '-'}`;
    el('bet-count').textContent = `${latest.topNumbers?.length || 0} số`;
    el('group-window').textContent = `${definition.windows?.groupDeficit || '-'} ngày`;
    el('chain-count').textContent = isV2(latest) ? 'Score v2 · online' : 'Score v1 · legacy';
    el('model-version').textContent = `${definition.chainMethodCount || 0} dàn kiểm chứng`;

    const topNumsList = latest.topNumbers || [];
    el('top-title').textContent = eligible ? 'Dàn Số Ứng Viên Điểm Cao' : 'Dàn Số Nghiên Cứu Điểm Cao';
    el('top-numbers').innerHTML = topNumsList.map(row => `
      <button data-number="${row.number}" class="inline-flex h-11 min-w-11 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50/70 font-mono text-sm font-black text-indigo-900 shadow-xs transition-transform hover:scale-105">
        <span>${fmt(row.number)}</span>
      </button>
    `).join('');

    el('top-numbers').querySelectorAll('button').forEach(button => {
      button.addEventListener('click', () => showDetail((latest.rankedNumbers || []).find(row => row.number === Number(button.dataset.number)), latest));
    });

    el('weights').innerHTML = Object.entries(definition.weights || {}).filter(([, value]) => value > 0).map(([key, value]) => `
      <div class="flex items-center justify-between gap-3 border-b border-slate-100 pb-1.5 last:border-b-0">
        <span class="text-slate-600">${labels[key] || key}</span>
        <strong class="font-black text-indigo-700">${Math.round(value * 100)}%</strong>
      </div>
    `).join('') || '<p class="text-slate-500">Chưa có metadata trọng số.</p>';

    renderGroups(latest);
    renderHistoricalAnalysis(recordPayload.historicalAnalysis);
    renderDistribution(recordPayload);

    // Copy Buttons Handlers
    const sorted = topNumsList.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    const btnTop10 = el('btnCopyTop10');
    if (btnTop10) btnTop10.onclick = () => copyNumbers(sorted.slice(0, 10).map(r => r.number), ' ');
    const btnTop20 = el('btnCopyTop20');
    if (btnTop20) btnTop20.onclick = () => copyNumbers(sorted.slice(0, 20).map(r => r.number), ' ');
    const btnTop30 = el('btnCopyTop30');
    if (btnTop30) btnTop30.onclick = () => copyNumbers(sorted.slice(0, 30).map(r => r.number), ' ');

    // Matrix Filter buttons
    document.querySelectorAll('.mat-filter-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.mat-filter-btn').forEach(b => {
          b.classList.remove('bg-indigo-600', 'text-white', 'font-bold');
          b.classList.add('bg-white', 'text-slate-700', 'font-semibold');
        });
        btn.classList.remove('bg-white', 'text-slate-700', 'font-semibold');
        btn.classList.add('bg-indigo-600', 'text-white', 'font-bold');

        currentMatrixFilter = btn.getAttribute('data-mat-filter');
        renderDistributionExplorer(activeDistributionRecord);
      };
    });

    const summary = recordPayload.summary || {};
    const profitClass = Number(summary.profitK || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700';
    const cards = [
      ['NGÀY THEO DÕI', `${summary.trackedDays || 0}`, `${summary.settledDays || 0} đã kết toán`],
      ['THẮNG / THUA', `${summary.wins || 0} / ${summary.losses || 0}`, 'Theo dàn 30 số đã khóa'],
      ['TỶ LỆ TRÚNG', percent(summary.hitRate), `Hòa vốn ${percent(summary.breakEvenHitRate)}`],
      ['TỔNG VỐN', money(summary.stakeK), '1.000K mỗi số'],
      ['TỔNG NHẬN', money(summary.payoutK), '84 lần khi trúng'],
      ['LÃI / LỖ', `${Number(summary.profitK || 0) >= 0 ? '+' : '-'}${money(summary.profitK)}`, `${percent(summary.roi)} ROI`]
    ];
    el('performance-summary').innerHTML = cards.map(([label, value, note], index) => `
      <div class="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
        <p class="text-[10px] font-black uppercase tracking-wider text-slate-500">${label}</p>
        <strong class="mt-1 block text-lg font-black ${index === 5 ? profitClass : 'text-slate-900'}">${value}</strong>
        <p class="mt-0.5 text-xs text-slate-500">${note}</p>
      </div>
    `).join('');

    el('history').innerHTML = (recordPayload.records || []).slice().reverse().map(record => {
      const numbers = (record.topNumbers || []).slice().sort((left, right) => Number(left.number) - Number(right.number));
      const abstained = Boolean(record.abstained) || numbers.length !== 30;
      const result = record.settled ? fmt(record.actual) : '--';
      const resultStatus = abstained ? 'Không phát dàn' : record.settled ? (record.hit ? 'Trúng' : 'Trượt') : 'Chờ KQ';
      const resultClass = abstained ? 'bg-slate-100 text-slate-700 border-slate-200' : record.hit ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : record.settled ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-amber-100 text-amber-800 border-amber-200';
      const numberChips = numbers.map(item => {
        const isActual = record.settled && Number(item.number) === Number(record.actual);
        return `<span class="rounded-lg border px-2 py-1 text-xs font-mono font-bold ${isActual ? 'border-amber-400 bg-amber-300 text-amber-950 ring-2 ring-amber-400' : 'border-indigo-100 bg-indigo-50/60 text-indigo-900'}">${fmt(item.number)}</span>`;
      }).join('');
      return `
        <article class="p-4 transition-colors hover:bg-slate-50/80">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <strong class="text-sm font-black text-slate-900">${record.predictionDate}</strong>
              <p class="text-xs text-slate-500 mt-0.5">Dữ liệu đến ${record.sourceDataThrough || '-'} · ${numbers.length} số</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="rounded-xl border px-3 py-1 text-xs font-black ${resultClass}">${resultStatus}</span>
              ${record.settled ? `<span class="text-xs font-bold text-slate-700">KQ: <strong>${result}</strong></span>` : ''}
            </div>
          </div>
          <div class="mt-2.5 flex flex-wrap gap-1.5">${numberChips}</div>
        </article>
      `;
    }).join('') || '<p class="p-5 text-xs text-slate-500">Chưa có nhật ký.</p>';
  }

  el('distribution-axis-select')?.addEventListener('change', event => {
    activeDistributionAxisId = event.target.value;
    renderDistributionExplorer(activeDistributionRecord);
  });

  fetch('/api/probability-score', { cache: 'no-store' })
    .then(response => response.json())
    .then(payload => { if (!payload.success) throw new Error(payload.error); render(payload); })
    .catch(error => {
      const status = el('status');
      if (status) {
        status.classList.remove('hidden');
        status.innerHTML = `<strong class="text-rose-700">Không tải được Điểm xác suất:</strong> ${error.message}`;
      }
    });
})();
