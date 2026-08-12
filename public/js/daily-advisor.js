(() => {
    const number = value => String(Number(value)).padStart(2, '0');
    const percent = value => `${(Number(value || 0) * 100).toFixed(1)}%`;
    const fmt = value => new Intl.NumberFormat('vi-VN').format(Number(value || 0));
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
    const chips = (numbers, hit) => (numbers || []).map(value => {
        const matched = Number(value) === Number(hit);
        return `<span class="inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-2 font-mono text-base font-black ${matched ? 'border-amber-400 bg-amber-200 text-amber-950 shadow-sm' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}">${number(value)}</span>`;
    }).join('');
    const stat = (label, value, note = '') => `<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p class="text-xs font-bold uppercase tracking-wide text-slate-500">${label}</p><p class="mt-1 text-2xl font-black text-slate-900">${value}</p>${note ? `<p class="mt-1 text-xs text-slate-500">${note}</p>` : ''}</div>`;
    const breakEven = summary => Number(summary?.breakEvenHitRate || (30 / 84));
    const laneOutcome = (record, lane) => {
        if (!record?.settled) return '<span class="text-amber-700">Chờ kết quả</span>';
        return record?.[lane]?.hit
            ? '<span class="text-emerald-700">Trúng</span>'
            : '<span class="text-rose-700">Trượt</span>';
    };
    const lanePerformance = summary => {
        const passed = Boolean(summary?.isAboveBreakEven);
        return `${summary?.wins || 0} trúng · ${summary?.losses || 0} trượt · ${percent(summary?.hitRate)} · ${passed ? 'vượt' : 'chưa vượt'} hòa vốn ${percent(breakEven(summary))}`;
    };

    let payload = null;
    const byId = id => document.getElementById(id);

    function renderLatest(record) {
        const section = byId('latestSection');
        if (!record) {
            section.innerHTML = '<div class="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">Chưa có snapshot gợi ý. Action hằng ngày sẽ sinh cache sau khi có cache Lịch sử.</div>';
            return;
        }
        const selected = record.recommendation?.selected || {};
        const action = record.recommendation?.action === 'consider';
        const isPending = !record.settled;
        section.innerHTML = `
            <article class="overflow-hidden rounded-2xl border ${action ? 'border-emerald-300' : 'border-amber-300'} bg-white shadow-sm">
                <div class="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                    <div><p class="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">Gợi ý ${isPending ? 'ngày tới' : 'đã chốt'}</p><h2 class="mt-1 text-xl font-black text-slate-900">${escapeHtml(record.predictionDate)}</h2><p class="mt-1 text-sm text-slate-600">Nguồn dữ liệu đến ${escapeHtml(record.sourceDrawDate || '-')}</p></div>
                    <span class="rounded-full px-3 py-1.5 text-sm font-black ${action ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}">${action ? 'Đủ điều kiện theo dõi cược' : 'Chỉ quan sát'}</span>
                </div>
                <div class="p-5">
                    <h3 class="text-base font-black text-slate-900">${escapeHtml(record.main?.label || 'Chưa xác định phương pháp')}</h3>
                    <p class="mt-1 text-sm leading-6 text-slate-600">${escapeHtml(record.recommendation?.rationale || '')}</p>
                    <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        ${stat('30 ngày', `${selected.wins30 || 0}/${selected.observations30 || 0}`, percent(selected.rate30))}
                        ${stat('90 ngày', `${selected.wins90 || 0}/${selected.observations || 0}`, percent(selected.rate90))}
                        ${stat('Wilson 90%', percent(selected.wilsonLower90), 'Hòa vốn lý thuyết: 35,7%')}
                        ${stat('Z-score', record.zScore ? `${record.zScore.lookback} kỳ` : '-', 'Chỉ dùng dữ liệu trước ngày dự đoán')}
                    </div>
                    <div class="mt-4 overflow-hidden rounded-xl border border-slate-200">
                        <div class="bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-600">Xếp hạng 5 phương pháp trước ngày ${escapeHtml(record.predictionDate)}</div>
                        <div class="divide-y divide-slate-100">${(record.recommendation?.ranking || []).map((item, index) => `<div class="grid grid-cols-[28px_1fr_auto] items-center gap-2 px-3 py-2 text-sm ${item.methodId === record.main?.methodId ? 'bg-indigo-50/70' : 'bg-white'}"><span class="font-black text-slate-400">${index + 1}</span><span class="font-semibold text-slate-800">${escapeHtml(item.label)}</span><span class="text-right text-slate-600">30d ${percent(item.rate30)} · W90 ${percent(item.wilsonLower90)}</span></div>`).join('')}</div>
                    </div>
                    <div class="mt-5 flex flex-wrap gap-2">${chips(record.main?.numbers, record.actual)}</div>
                    ${record.settled ? `<p class="mt-4 text-sm font-bold ${record.main?.hit ? 'text-emerald-700' : 'text-rose-700'}">Kết quả ${number(record.actual)}: ${record.main?.hit ? 'trúng dàn chính' : 'trượt dàn chính'}.</p>` : '<p class="mt-4 text-sm font-bold text-indigo-700">Snapshot đã chốt, đang chờ kết quả để đối soát.</p>'}
                </div>
            </article>
            <aside class="overflow-hidden rounded-2xl border border-violet-200 bg-violet-50 shadow-sm">
                <div class="border-b border-violet-200 bg-violet-100/70 px-5 py-4"><p class="text-xs font-black uppercase tracking-[0.16em] text-violet-700">Làn thử nghiệm</p><h2 class="mt-1 text-lg font-black text-slate-900">Dàn chính + Z-score hỗ trợ</h2><p class="mt-1 text-sm leading-6 text-slate-600">Giữ 24 số có z-score cao hơn trong dàn phương pháp được chọn, thay 6 số thấp nhất bằng 6 số z-score cao ngoài dàn.</p></div>
                <div class="p-5"><div class="flex flex-wrap gap-2">${chips(record.experimental?.numbers, record.actual)}</div>${record.settled ? `<p class="mt-4 text-sm font-bold ${record.experimental?.hit ? 'text-emerald-700' : 'text-rose-700'}">Kết quả ${number(record.actual)}: ${record.experimental?.hit ? 'trúng dàn Z-score' : 'trượt dàn Z-score'}.</p>` : '<p class="mt-4 text-sm font-bold text-violet-700">Dàn Z-score đã lưu, chờ đối soát cùng kết quả dàn chính.</p>'}<div class="mt-5 grid gap-3 sm:grid-cols-2"><div class="rounded-xl bg-white p-3"><p class="text-xs font-black uppercase tracking-wide text-emerald-700">Thêm từ Z-score</p><p class="mt-2 font-mono font-black text-slate-800">${(record.experimental?.replacedIn || []).map(item => number(item.number)).join(' · ') || '-'}</p></div><div class="rounded-xl bg-white p-3"><p class="text-xs font-black uppercase tracking-wide text-rose-700">Thay ra từ dàn chính</p><p class="mt-2 font-mono font-black text-slate-800">${(record.experimental?.replacedOut || []).map(item => number(item.number)).join(' · ') || '-'}</p></div></div></div>
            </aside>`;
    }

    function renderHistory() {
        const limit = Number(byId('logLimit').value || 30);
        const rows = (payload?.records || []).slice(0, limit);
        byId('historyLog').innerHTML = rows.map(record => {
            const selected = record.recommendation?.selected || {};
            return `<article class="grid gap-3 px-5 py-4 md:grid-cols-[130px_1fr_auto] md:items-center">
                <div><p class="font-black text-slate-900">${escapeHtml(record.predictionDate)}</p><p class="mt-1 text-xs font-semibold text-slate-500">Snapshot thực tế đã chốt</p></div>
                <div><p class="font-bold text-slate-800">${escapeHtml(record.main?.label || selected.label || '-')}</p><p class="mt-1 text-sm text-slate-600">30d ${selected.wins30 || 0}/${selected.observations30 || 0} · 90d ${selected.wins90 || 0}/${selected.observations || 0} · Wilson ${percent(selected.wilsonLower90)}</p><div class="mt-2 flex flex-wrap gap-1.5">${chips(record.main?.numbers, record.actual)}</div></div>
                <div class="text-left md:text-right"><p class="text-sm font-black">Chính: ${laneOutcome(record, 'main')}</p><p class="mt-1 text-sm font-black">Z-score: ${laneOutcome(record, 'experimental')}</p>${record.settled ? `<p class="mt-1 text-sm text-slate-600">KQ ${number(record.actual)}</p>` : ''}</div>
            </article>`;
        }).join('') || '<p class="p-6 text-sm text-slate-500">Chưa có nhật ký.</p>';
    }

    function render(data) {
        payload = data;
        const summary = data.summary?.main || {};
        const experimental = data.summary?.experimental || {};
        const mainPassed = Boolean(summary.isAboveBreakEven);
        const experimentalPassed = Boolean(experimental.isAboveBreakEven);
        byId('summaryCards').innerHTML = [
            stat('Dữ liệu R2', data.latestDataDate || '-', `Tạo cache: ${data.generatedAt ? new Date(data.generatedAt).toLocaleString('vi-VN') : '-'}`),
            stat('Dàn chính đã kết toán', `${summary.wins || 0}/${summary.days || 0}`, `${lanePerformance(summary)} · ${mainPassed ? 'lãi lý thuyết' : 'chưa đạt hòa vốn'}`),
            stat('Dàn Z-score thử nghiệm', `${experimental.wins || 0}/${experimental.days || 0}`, `${lanePerformance(experimental)} · ${experimentalPassed ? 'lãi lý thuyết' : 'chưa đạt hòa vốn'}`),
            stat('Lãi/lỗ dàn chính', `${fmt(summary.profitK || 0)}K`, `ROI ${percent(summary.roi)} · chuỗi trượt dài nhất ${summary.longestLoss || 0}`),
            stat('Lãi/lỗ Z-score', `${fmt(experimental.profitK || 0)}K`, `ROI ${percent(experimental.roi)} · chuỗi trượt dài nhất ${experimental.longestLoss || 0}`)
        ].join('');
        renderLatest((data.records || [])[0]);
        renderHistory();
    }

    async function load() {
        try {
            const response = await fetch('/api/daily-advisor', { cache: 'no-store' });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || `HTTP ${response.status}`);
            render(data);
        } catch (error) {
            byId('errorBox').textContent = `Không tải được Gợi ý hàng ngày từ R2: ${error.message}`;
            byId('errorBox').classList.remove('hidden');
        }
    }
    byId('logLimit').addEventListener('change', renderHistory);
    load();
})();
