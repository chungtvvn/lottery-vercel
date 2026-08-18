(() => {
    const byId = id => document.getElementById(id);
    const pct = value => `${(Number(value || 0) * 100).toFixed(1)}%`;
    const num = value => String(Number(value)).padStart(2, '0');
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
    const heat = value => {
        const score = Math.max(0, Math.min(1, Number(value || 0)));
        return `background-color: rgba(14, 116, 144, ${0.06 + score * 0.55}); color: ${score > 0.52 ? '#fff' : '#0f172a'}`;
    };
    const chip = (number, selected, vote, rank) => `<div class="relative flex h-12 items-center justify-center rounded-lg border font-mono text-lg font-black ${vote >= 2 ? 'border-violet-500 bg-violet-100 text-violet-900' : selected ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-700'}" title="${num(number)} · ${vote.toFixed(1)} phiếu · hạng điểm ${rank}">${num(number)}${vote >= 2 ? `<span class="absolute -right-1 -top-2 rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] text-white">${vote.toFixed(1)}</span>` : ''}</div>`;

    function render(data) {
        byId('sourceBar').innerHTML = [
            ['Ngày dự đoán', data.predictionDate || '-'],
            ['Snapshot dàn', data.source?.advisorSnapshotDate || '-'],
            ['Snapshot điểm', data.source?.scoreSnapshotDate || '-']
        ].map(([label, value]) => `<div><span class="font-bold text-slate-500">${label}:</span> <span class="font-black text-slate-900">${esc(value)}</span></div>`).join('');
        if (data.warnings?.scoreDateMismatch) byId('errorBox').innerHTML = 'Snapshot Điểm xác suất chưa cùng ngày với snapshot Gợi ý. Dashboard vẫn hiển thị để đối chiếu, nhưng dàn nghiên cứu không được dùng làm quyết định production.';
        if (data.warnings?.scoreDateMismatch) byId('errorBox').classList.remove('hidden');
        const selected = data.selectedModels || [];
        const methods = data.methods || [];
        const maxScoreOverlap = Math.max(...methods.map(row => row.overlapRate || 0), 0);
        byId('overviewCards').innerHTML = [
            ['Dàn có dữ liệu', methods.filter(row => row.betCount > 0).length, 'phương pháp có snapshot số'],
            ['Mô hình lựa chọn', selected.length, 'cân bằng · xu hướng · ổn định'],
            ['Số đồng thuận >= 2', (data.fusion?.ranked || []).filter(row => row.methodVotes >= 2).length, 'trong dàn nghiên cứu'],
            ['Độ phủ điểm cao', pct(maxScoreOverlap), 'mức giao lớn nhất với Top 30 điểm']
        ].map(([label, value, note], index) => index === 3
            ? `<div class="border border-slate-200 bg-white p-4"><p class="text-xs font-bold uppercase tracking-wide text-slate-500">${label}</p><p class="mt-1 text-2xl font-black text-slate-900">${value}</p><p class="mt-1 text-xs text-slate-500">${note}</p></div>`
            : `<div class="border border-slate-200 bg-white p-4"><p class="text-xs font-bold uppercase tracking-wide text-slate-500">${label}</p><p class="mt-1 text-2xl font-black text-slate-900">${value}</p><p class="mt-1 text-xs text-slate-500">${note}</p></div>`).join('');
        byId('methodMatrix').innerHTML = methods.map(row => `<tr><td class="max-w-[310px] px-4 py-3"><p class="font-bold text-slate-900">#${row.rank} ${esc(row.label)}</p><p class="mt-1 text-xs text-slate-500">${row.betCount || 0} số · ${row.overlapCount || 0} số đồng thời có điểm cao</p></td><td class="px-3 py-3 text-center font-black" style="${heat(row.rate7)}">${pct(row.rate7)}</td><td class="px-3 py-3 text-center font-black" style="${heat(row.rate30)}">${pct(row.rate30)}</td><td class="px-3 py-3 text-center font-black" style="${heat(row.rate90)}">${pct(row.rate90)}</td><td class="px-3 py-3 text-center font-black" style="${heat(row.wilsonLower90)}">${pct(row.wilsonLower90)}</td><td class="px-3 py-3 text-center font-black ${row.trend >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${row.trend >= 0 ? '+' : ''}${pct(row.trend)}</td><td class="px-3 py-3 text-center font-black text-violet-700">${row.overlapCount}/${row.betCount || '-'}</td><td class="px-3 py-3 text-center font-black text-slate-700">${row.averageScore}</td></tr>`).join('') || '<tr><td colspan="8" class="p-5 text-center text-slate-500">Không tìm thấy snapshot dàn tương ứng.</td></tr>';
        const e = data.explanation || {};
        byId('explanation').innerHTML = [['Dàn chính', e.current], ['Ngắn hạn', e.shortTerm], ['Dài hạn', e.longTerm], ['Điểm xác suất', e.scoring], ['Giới hạn', e.caution]].map(([title, body]) => `<div><p class="font-black text-slate-900">${title}</p><p class="mt-1 text-slate-600">${esc(body || '-')}</p></div>`).join('');
        byId('modelChoices').innerHTML = selected.map((model, index) => `<article class="border ${index === 0 ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'} p-4"><p class="text-xs font-black uppercase tracking-wide ${index === 0 ? 'text-indigo-700' : 'text-slate-500'}">Mô hình ${index + 1}</p><h3 class="mt-1 text-lg font-black text-slate-900">${esc(model.label)}</h3><p class="mt-2 min-h-16 text-sm leading-5 text-slate-600">${esc(model.description)}</p><div class="mt-4 border-t border-slate-200 pt-3"><p class="text-xs font-bold text-slate-500">PHƯƠNG PHÁP CHỌN</p><p class="mt-1 font-black text-slate-900">${esc(model.selectedLabel)}</p><p class="mt-1 text-sm text-slate-600">Điểm chọn ${model.selectionScore.toFixed(3)} · giao Top 30 điểm: ${pct(model.scoreOverlapRate)}</p></div><div class="mt-3 flex flex-wrap gap-1.5">${(model.numbers || []).map(number => `<span class="rounded border border-indigo-200 bg-white px-2 py-1 font-mono text-xs font-bold text-indigo-800">${num(number)}</span>`).join('')}</div></article>`).join('');
        const fusion = data.fusion || {};
        byId('fusionPanel').innerHTML = `<p class="text-sm leading-6 text-slate-600">${esc(fusion.note || '')}</p><div class="mt-4 flex flex-wrap gap-2">${(fusion.numbers || []).map(number => `<span class="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 font-mono font-black text-violet-900">${num(number)}</span>`).join('')}</div><div class="mt-5 border-t border-violet-100 pt-4 text-sm text-slate-600"><p><strong>Diễn giải:</strong> số có ít nhất hai phiếu được xếp trước. Khi hòa, Điểm xác suất là tín hiệu phụ; dàn này chưa được ghi vào nhật ký thực tế hoặc dùng để kết toán.</p></div>`;
        const selectedSet = new Set(fusion.numbers || []);
        byId('numberMatrix').innerHTML = (fusion.ranked || []).map(row => chip(row.number, selectedSet.has(row.number), row.methodVotes, row.probabilityRank)).join('') || '<p class="col-span-full text-slate-500">Chưa có ma trận số.</p>';
    }

    fetch('/api/daily-advisor/analysis', { cache: 'no-store' })
        .then(response => response.json().then(data => ({ response, data })))
        .then(({ response, data }) => { if (!response.ok || !data.success) throw new Error(data.error || `HTTP ${response.status}`); render(data); })
        .catch(error => { byId('errorBox').textContent = `Không tải được dashboard phân tích: ${error.message}`; byId('errorBox').classList.remove('hidden'); });
})();
