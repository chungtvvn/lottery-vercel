(() => {
  const fmt = value => String(Number(value)).padStart(2, '0');
  const percent = value => `${(Number(value || 0) * 100).toFixed(1)}%`;
  const money = value => `${new Intl.NumberFormat('vi-VN').format(Math.abs(Number(value || 0)))}K`;
  const el = id => document.getElementById(id);
  function showDetail(row) {
    const detail = el('number-detail');
    detail.classList.remove('hidden');
    const groups = row.evidence?.groupSignals?.map(group => `${group.label} (z thiếu ${group.deficitZ})`).join('; ') || 'Chưa có tín hiệu nhóm nổi bật';
    detail.innerHTML = `<strong>Số ${fmt(row.number)} · hạng #${row.rank} · ${row.score}/100</strong><div class="mt-2 grid gap-1">Nhóm: ${row.components.groupDeficit} · Tần suất ngắn: ${row.components.frequencyDeficit} · Gap: ${row.components.gap} · Đồng thuận chuỗi: ${row.components.chainConsensus}</div><p class="mt-2 text-slate-600">${groups}</p>`;
  }
  function render(payload) {
    const latest = payload.records?.at(-1);
    if (!latest) throw new Error('Cache chưa có snapshot.');
    const definition = latest.scoreDefinition || {};
    el('prediction-date').textContent = latest.predictionDate || '-';
    el('source-date').textContent = `Dữ liệu đến ${latest.sourceDataThrough || '-'}`;
    el('bet-count').textContent = `${latest.topNumbers?.length || 0} số`;
    el('group-window').textContent = `${definition.windows?.groupDeficit || '-'} ngày`;
    el('chain-count').textContent = `${definition.chainMethodCount || 0} dàn`;
    el('status').innerHTML = `<strong class="text-emerald-700">Snapshot ${latest.settled ? 'đã kết toán' : 'đang chờ kết quả'}</strong><span class="ml-2">${definition.warning || ''}</span>`;
    el('top-numbers').innerHTML = (latest.topNumbers || []).map(row => `<button data-number="${row.number}" class="num grade-${String(row.band || 'c').toLowerCase()} rounded-lg border px-3 py-2 text-center font-extrabold transition hover:-translate-y-0.5"><span class="block text-xl">${fmt(row.number)}</span><span class="text-xs">${row.score}</span></button>`).join('');
    el('top-numbers').querySelectorAll('button').forEach(button => button.addEventListener('click', () => showDetail((latest.rankedNumbers || []).find(row => row.number === Number(button.dataset.number)))));
    const labels = { groupDeficit: 'Thiếu tương đối ở nhóm dạng số', frequencyDeficit: 'Thiếu tần suất trong cửa sổ ngắn', gap: 'Khoảng vắng mặt so với nhịp riêng', chainConsensus: 'Đồng thuận từ dàn chuỗi đã khử trùng' };
    el('weights').innerHTML = Object.entries(definition.weights || {}).filter(([, value]) => value > 0).map(([key, value]) => `<div class="flex items-center justify-between gap-3"><span>${labels[key] || key}</span><strong>${Math.round(value * 100)}%</strong></div>`).join('');
    el('groups').innerHTML = (latest.groupSignals || []).map(group => `<div class="flex items-center justify-between gap-4 p-4"><div><strong>${group.label}</strong><p class="text-sm text-slate-500">${group.size} số trong nhóm</p></div><strong class="text-blue-700">z ${group.deficitZ}</strong></div>`).join('') || '<p class="p-5 text-slate-500">Chưa có tín hiệu nhóm.</p>';
    const summary = payload.summary || {};
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
    el('history').innerHTML = (payload.records || []).slice().reverse().map(record => {
      const numbers = (record.topNumbers || []).slice().sort((left, right) => Number(left.number) - Number(right.number));
      const result = record.settled ? fmt(record.actual) : '--';
      const resultStatus = record.settled ? (record.hit ? 'Trúng' : 'Trượt') : 'Chờ';
      const resultClass = record.hit ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : record.settled ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-amber-100 text-amber-800 border-amber-200';
      const numberChips = numbers.map(item => {
        const isActual = record.settled && Number(item.number) === Number(record.actual);
        return `<span class="rounded-lg border px-2.5 py-1.5 font-bold ${isActual ? 'border-amber-400 bg-amber-300 text-amber-950 ring-2 ring-amber-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}">${fmt(item.number)}${isActual ? '<small class="ml-1 text-[10px]">KQ</small>' : ''}</span>`;
      }).join('');
      return `<article class="p-5"><div class="flex flex-wrap items-start justify-between gap-3"><div><strong class="text-lg">${record.predictionDate}</strong><p class="mt-1 text-sm text-slate-500">Dữ liệu đến ${record.sourceDataThrough || '-'} · ${numbers.length} số đã chốt</p></div><div class="text-right"><span class="inline-block rounded-full border px-3 py-1 text-sm font-bold ${resultClass}">${resultStatus}</span><p class="mt-2 text-sm font-bold ${record.settled && record.hit ? 'text-emerald-700' : record.settled ? 'text-rose-700' : 'text-slate-500'}">Kết quả: ${result}</p></div></div><div class="mt-4 flex flex-wrap gap-2">${numberChips}</div>${record.settled && !record.hit ? `<p class="mt-3 text-sm text-rose-700">Số ${result} không nằm trong dàn snapshot này.</p>` : ''}</article>`;
    }).join('') || '<p class="p-5 text-slate-500">Chưa có nhật ký.</p>';
  }
  fetch('/api/probability-score', { cache: 'no-store' }).then(response => response.json()).then(payload => { if (!payload.success) throw new Error(payload.error); render(payload); }).catch(error => { el('status').innerHTML = `<strong class="text-rose-700">Không tải được Điểm xác suất.</strong> ${error.message}`; });
})();
