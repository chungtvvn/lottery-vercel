(() => {
  const fmt = value => String(Number(value)).padStart(2, '0');
  const percent = value => `${(Number(value || 0) * 100).toFixed(1)}%`;
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
    el('history').innerHTML = (payload.records || []).slice().reverse().map(record => `<div class="flex items-center justify-between gap-3 p-4"><div><strong>${record.predictionDate}</strong><p class="text-sm text-slate-500">${record.settled ? `KQ ${fmt(record.actual)} · ${record.hit ? 'trúng' : 'trượt'}` : 'Chờ kết quả'}</p></div><span class="rounded-full px-3 py-1 text-sm font-bold ${record.hit ? 'bg-emerald-100 text-emerald-700' : record.settled ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}">${record.settled ? (record.hit ? 'Trúng' : 'Trượt') : 'Chờ'}</span></div>`).join('') || '<p class="p-5 text-slate-500">Chưa có nhật ký.</p>';
  }
  fetch('/api/probability-score', { cache: 'no-store' }).then(response => response.json()).then(payload => { if (!payload.success) throw new Error(payload.error); render(payload); }).catch(error => { el('status').innerHTML = `<strong class="text-rose-700">Không tải được Điểm xác suất.</strong> ${error.message}`; });
})();
