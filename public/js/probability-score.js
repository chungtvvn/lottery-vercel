(() => {
  const fmt = value => String(Number(value)).padStart(2, '0');
  const percent = value => `${(Number(value || 0) * 100).toFixed(1)}%`;
  const money = value => `${new Intl.NumberFormat('vi-VN').format(Math.abs(Number(value || 0)))}K`;
  const el = id => document.getElementById(id);

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
    detail.innerHTML = `
      <strong>Số ${fmt(row.number)} · hạng #${row.rank} · điểm tương đối ${row.score}/100</strong>
      <div class="mt-3 grid gap-2 text-slate-700 sm:grid-cols-2">
        <div>Online: <strong>${text(row.components?.onlineModel)}%</strong> · Nhóm: <strong>${text(row.components?.groupResidual)}%</strong></div>
        <div>Empirical-Bayes: <strong>${text(row.components?.frequencyPosterior)}%</strong> · Hazard: <strong>${text(row.components?.gapHazard)}%</strong></div>
        <div>Tần suất dài/ngắn: <strong>${text(frequency.longCount, '0')}/${text(frequency.shortCount, '0')}</strong></div>
        <div>Gap hiện tại: <strong>${text(hazard.currentGap, '0')} ngày</strong> · độ tin cậy hazard: <strong>${percent(hazard.reliability)}</strong></div>
      </div>
      <p class="mt-3 text-slate-600"><strong>Nhóm:</strong> ${groups}</p>
      <p class="mt-2 text-slate-600"><strong>Đồng thuận chuỗi:</strong> ${chainMethods}</p>`;
  }

  function renderCalibration(record) {
    const calibration = calibrationFor(record);
    const node = el('calibration-gate');
    const stage = el('model-stage');
    const status = modelStatus(record);
    stage.textContent = status.title;
    stage.className = `mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-extrabold ${status.className}`;

    if (!calibration) {
      node.innerHTML = `<div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><strong>${status.title}</strong><p class="mt-1">${status.detail}</p></div>`;
      return false;
    }

    const eligible = Boolean(calibration.eligible);
    node.innerHTML = `
      <div class="rounded-xl border ${eligible ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'} p-4 text-sm ${eligible ? 'text-emerald-900' : 'text-amber-950'}">
        <div class="flex flex-wrap items-center justify-between gap-2"><strong>${status.title}</strong><span class="rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold">${calibration.days || 0} ngày calibration</span></div>
        <p class="mt-2">${status.detail}</p>
        <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
      return `<div class="flex items-center justify-between gap-4 p-4"><div><strong>${group.label}</strong><p class="text-sm text-slate-500">${group.size} số · ${direction}</p></div><strong class="${z >= 0 ? 'text-blue-700' : 'text-slate-600'}">z ${z.toFixed(3)}</strong></div>`;
    }).join('') || '<p class="p-5 text-slate-500">Chưa có tín hiệu nhóm độc lập đủ mạnh.</p>';
  }

  function render(recordPayload) {
    const latest = recordPayload.records?.at(-1);
    if (!latest) throw new Error('Cache chưa có snapshot.');
    const definition = latest.scoreDefinition || {};
    const eligible = renderCalibration(latest);
    const status = modelStatus(latest);
    const labels = isV2(latest) ? v2Labels : legacyLabels;
    el('prediction-date').textContent = latest.predictionDate || '-';
    el('source-date').textContent = `Dữ liệu đến ${latest.sourceDataThrough || '-'}`;
    el('bet-count').textContent = `${latest.topNumbers?.length || 0} số`;
    el('group-window').textContent = `${definition.windows?.groupDeficit || '-'} ngày`;
    el('chain-count').textContent = `${definition.chainMethodCount || 0} dàn`;
    el('model-version').textContent = isV2(latest) ? 'Score v2 · online' : 'Score v1 · legacy';
    const legacyExcluded = Number(recordPayload.summary?.legacyRecordsExcluded || 0);
    const legacyNote = legacyExcluded > 0
      ? `<p class="mt-1 text-xs text-slate-500">${legacyExcluded} snapshot v1 legacy vẫn giữ để đối chiếu nhưng được loại khỏi tổng hợp hiệu quả của v2.</p>`
      : '';
    el('status').innerHTML = `<strong class="${latest.settled ? 'text-emerald-700' : 'text-blue-700'}">Snapshot ${latest.settled ? 'đã kết toán' : 'đang chờ kết quả'}</strong><span class="ml-2">${definition.warning || ''}</span><p class="mt-2 text-sm ${status.className.split(' ').at(-1)}">${status.title}: ${status.detail}</p>${legacyNote}`;
    el('top-title').textContent = eligible ? 'Dàn số ứng viên' : 'Dàn số nghiên cứu';
    el('top-description').textContent = eligible
      ? 'Các số xếp hạng cao nhất; vẫn phải được xác nhận trên các holdout độc lập trước khi áp dụng vận hành.'
      : 'Dàn này dùng để theo dõi calibration. Chưa được cộng vào gợi ý hoặc thay thế phương pháp Đề đang vận hành.';
    el('top-numbers').innerHTML = (latest.topNumbers || []).map(row => `<button data-number="${row.number}" class="num grade-${String(row.band || 'c').toLowerCase()} rounded-lg border px-3 py-2 text-center font-extrabold transition hover:-translate-y-0.5"><span class="block text-xl">${fmt(row.number)}</span><span class="text-xs">${row.score}</span></button>`).join('');
    el('top-numbers').querySelectorAll('button').forEach(button => button.addEventListener('click', () => showDetail((latest.rankedNumbers || []).find(row => row.number === Number(button.dataset.number)), latest)));
    el('weights').innerHTML = Object.entries(definition.weights || {}).filter(([, value]) => value > 0).map(([key, value]) => `<div class="flex items-center justify-between gap-3"><span>${labels[key] || key}</span><strong>${Math.round(value * 100)}%</strong></div>`).join('') || '<p class="text-slate-500">Snapshot này chưa có metadata trọng số.</p>';
    renderGroups(latest);

    const summary = recordPayload.summary || {};
    const profitClass = Number(summary.profitK || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700';
    const cards = [
      ['NGÀY THEO DÕI', `${summary.trackedDays || 0}`, `${summary.settledDays || 0} đã kết toán · ${summary.pendingDays || 0} chờ`],
      ['THẮNG / THUA', `${summary.wins || 0} / ${summary.losses || 0}`, 'Theo dàn 30 số đã khóa'],
      ['TỶ LỆ TRÚNG', percent(summary.hitRate), `Hòa vốn ${percent(summary.breakEvenHitRate)}`],
      ['TỔNG VỐN', money(summary.stakeK), '1.000K mỗi số / ngày'],
      ['TỔNG NHẬN', money(summary.payoutK), '84 lần khi Đề vào dàn'],
      ['LÃI / LỖ', `${Number(summary.profitK || 0) >= 0 ? '+' : '-'}${money(summary.profitK)}`, `${percent(summary.roi)} ROI`]
    ];
    el('performance-summary').innerHTML = cards.map(([label, value, note], index) => `<div class="rounded-xl border border-slate-100 bg-slate-50 p-4"><p class="text-xs font-bold text-slate-500">${label}</p><strong class="mt-1 block text-xl ${index === 5 ? profitClass : 'text-slate-900'}">${value}</strong><p class="mt-1 text-xs text-slate-500">${note}</p></div>`).join('');
    el('history').innerHTML = (recordPayload.records || []).slice().reverse().map(record => {
      const numbers = (record.topNumbers || []).slice().sort((left, right) => Number(left.number) - Number(right.number));
      const result = record.settled ? fmt(record.actual) : '--';
      const resultStatus = record.settled ? (record.hit ? 'Trúng' : 'Trượt') : 'Chờ';
      const resultClass = record.hit ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : record.settled ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-amber-100 text-amber-800 border-amber-200';
      const numberChips = numbers.map(item => {
        const isActual = record.settled && Number(item.number) === Number(record.actual);
        return `<span class="rounded-lg border px-2.5 py-1.5 font-bold ${isActual ? 'border-amber-400 bg-amber-300 text-amber-950 ring-2 ring-amber-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}">${fmt(item.number)}${isActual ? '<small class="ml-1 text-[10px]">KQ</small>' : ''}</span>`;
      }).join('');
      const version = isV2(record) ? 'v2' : 'v1 legacy';
      return `<article class="p-5"><div class="flex flex-wrap items-start justify-between gap-3"><div><strong class="text-lg">${record.predictionDate}</strong><p class="mt-1 text-sm text-slate-500">Dữ liệu đến ${record.sourceDataThrough || '-'} · ${numbers.length} số đã chốt · ${version}</p></div><div class="text-right"><span class="inline-block rounded-full border px-3 py-1 text-sm font-bold ${resultClass}">${resultStatus}</span><p class="mt-2 text-sm font-bold ${record.settled && record.hit ? 'text-emerald-700' : record.settled ? 'text-rose-700' : 'text-slate-500'}">Kết quả: ${result}</p></div></div><div class="mt-4 flex flex-wrap gap-2">${numberChips}</div>${record.settled && !record.hit ? `<p class="mt-3 text-sm text-rose-700">Số ${result} không nằm trong dàn snapshot này.</p>` : ''}</article>`;
    }).join('') || '<p class="p-5 text-slate-500">Chưa có nhật ký.</p>';
  }

  fetch('/api/probability-score', { cache: 'no-store' })
    .then(response => response.json())
    .then(payload => { if (!payload.success) throw new Error(payload.error); render(payload); })
    .catch(error => { el('status').innerHTML = `<strong class="text-rose-700">Không tải được Điểm xác suất.</strong> ${error.message}`; });
})();
