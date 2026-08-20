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
    const ledgerLabel = record => record?.lifecycle?.mode === 'reconstructed-after-draw'
        ? 'Tái tạo từ snapshot đã phát hành'
        : 'Snapshot thực tế đã chốt';
    const signed = value => `${Number(value || 0) >= 0 ? '+' : ''}${fmt(value)}K`;
    const methodPerformance = method => {
        const recent = method?.performance?.recent30 || {};
        return `${recent.wins || 0}/${recent.observations || 0} kỳ · ${percent(recent.hitRate)} · hòa vốn ${percent(recent.breakEvenHitRate)} · ${signed(recent.profitK)}`;
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
        const candidateMethods = record.recommendation?.candidateMethods || [];
        const currentStrongMethods = record.recommendation?.currentStrongMethods || [];
        const isCurrentFusion = record.hybrid?.id === payload?.methodology?.fusionId;
        const fusionReport = payload?.decisionReport?.fusion || {};
        const fusionReplay = fusionReport.summary || {};
        const fusionReplayText = fusionReplay.days
            ? `${fusionReplay.wins}/${fusionReplay.days} kỳ · ${percent(fusionReplay.hitRate)} · ${signed(fusionReplay.profitK)}`
            : 'Chưa đủ snapshot cùng phiên bản để kiểm chứng';
        const strongPanel = currentStrongMethods.length
            ? `<div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3"><div class="flex flex-wrap items-start justify-between gap-2"><div><p class="text-xs font-black uppercase tracking-wide text-amber-800">Phương pháp đang có tín hiệu tốt</p><p class="mt-1 text-xs leading-5 text-amber-900">Đánh giá bằng dữ liệu đã kết toán trước ngày dự đoán và hòa vốn riêng theo số con. Phương pháp thử nghiệm chỉ được theo dõi, chưa tự động trở thành production.</p></div><span class="rounded-md bg-white px-2 py-1 text-xs font-black text-amber-800">${currentStrongMethods.length} phương pháp</span></div><div class="mt-3 grid gap-2 lg:grid-cols-2">${currentStrongMethods.map(method => `<div class="rounded-lg border border-amber-100 bg-white p-3"><div class="flex flex-wrap items-center gap-2"><strong class="text-sm text-slate-900">${escapeHtml(method.label)}</strong>${method.experimental ? '<span class="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-black text-violet-700">THỬ NGHIỆM</span>' : '<span class="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black text-emerald-700">ĐANG THEO DÕI</span>'}<span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-600">${method.betCount} số</span></div><p class="mt-1 text-xs text-slate-600">30 kỳ: ${methodPerformance(method)}</p><p class="mt-1 text-[11px] font-semibold ${method.eligibleForMain ? 'text-emerald-700' : 'text-sky-700'}">${method.eligibleForMain ? 'Có thể so sánh trực tiếp trong nhóm dàn 30 số' : 'Chỉ theo dõi riêng vì khác quy mô dàn 30 số'}</p></div>`).join('')}</div></div>`
            : '<p class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">Chưa có phương pháp nào đồng thời đạt mẫu tối thiểu và profit dương ở cửa sổ 7/30 kỳ trước ngày dự đoán.</p>';
        const candidatePanel = candidateMethods.length
            ? `<details class="mt-4 overflow-hidden rounded-xl border border-sky-200 bg-sky-50"><summary class="cursor-pointer px-3 py-2.5 text-sm font-black text-sky-800">Toàn bộ dàn có trong snapshot (${candidateMethods.length})</summary><div class="grid gap-3 border-t border-sky-100 p-3 lg:grid-cols-2">${candidateMethods.map(method => `<div class="rounded-lg border ${method.methodId === record.main?.methodId ? 'border-emerald-300 bg-emerald-50' : method.currentStrong ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-white'} p-3"><div class="flex flex-wrap items-center gap-1.5"><p class="text-xs font-black uppercase tracking-wide ${method.methodId === record.main?.methodId ? 'text-emerald-700' : 'text-slate-500'}">${method.methodId === record.main?.methodId ? 'Dàn chính' : method.currentStrong ? 'Đang có tín hiệu tốt' : 'Dàn theo dõi'}</p>${method.experimental ? '<span class="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-black text-violet-700">THỬ NGHIỆM</span>' : ''}<span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-600">${method.betCount || method.numbers?.length || 0} số</span></div><p class="mt-1 text-sm font-bold text-slate-900">${escapeHtml(method.label)}</p>${method.performance ? `<p class="mt-1 text-xs text-slate-500">30 kỳ: ${methodPerformance(method)}</p>` : ''}<div class="mt-2 flex flex-wrap gap-1">${chips(method.numbers, record.actual)}</div></div>`).join('')}</div></details>`
            : '<p class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">Snapshot này được phát hành trước khi hệ thống lưu đồng thời các dàn ứng viên; chỉ dàn chính được giữ để bảo toàn tính toàn vẹn.</p>';
        section.innerHTML = `
            <article class="overflow-hidden rounded-2xl border ${action ? 'border-emerald-300' : 'border-amber-300'} bg-white shadow-sm">
                <div class="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                    <div><p class="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">${escapeHtml(ledgerLabel(record))}</p><h2 class="mt-1 text-xl font-black text-slate-900">${escapeHtml(record.predictionDate)}</h2><p class="mt-1 text-sm text-slate-600">Nguồn dữ liệu đến ${escapeHtml(record.sourceDrawDate || '-')}</p>${record.lifecycle?.mode === 'reconstructed-after-draw' ? '<p class="mt-1 text-xs font-semibold text-amber-700">Dàn số lấy nguyên từ snapshot Lịch sử đã phát hành trước kỳ quay.</p>' : ''}</div>
                    <span class="rounded-full px-3 py-1.5 text-sm font-black ${action ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}">${action ? 'Đủ điều kiện theo dõi cược' : 'Chỉ quan sát'}</span>
                </div>
                <div class="p-5">
                    <div class="flex flex-wrap items-center gap-2"><h3 class="text-base font-black text-slate-900">${escapeHtml(record.main?.label || 'Chưa xác định phương pháp')}</h3>${selected.experimental ? '<span class="rounded bg-violet-100 px-2 py-1 text-[10px] font-black text-violet-700">THỬ NGHIỆM</span>' : ''}</div>
                    <p class="mt-1 text-sm leading-6 text-slate-600">${escapeHtml(record.recommendation?.rationale || '')}</p>
                    <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                        ${stat('7 ngày', `${selected.wins7 || 0}/${selected.observations7 || 0}`, `${percent(selected.rate7)} · xu hướng ${selected.trend >= 0 ? '+' : ''}${percent(selected.trend)}`)}
                        ${stat('30 ngày', `${selected.wins30 || 0}/${selected.observations30 || 0}`, percent(selected.rate30))}
                        ${stat('90 ngày', `${selected.wins90 || 0}/${selected.observations || 0}`, percent(selected.rate90))}
                        ${stat('Wilson 90%', percent(selected.wilsonLower90), 'Hòa vốn lý thuyết: 35,7%')}
                        ${stat('Z-score', record.zScore ? `${record.zScore.lookback} kỳ` : '-', 'Chỉ dùng dữ liệu trước ngày dự đoán')}
                    </div>
                    <div class="mt-4 overflow-hidden rounded-xl border border-slate-200">
                        <div class="bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-600">Xếp hạng ${(record.recommendation?.ranking || []).length} phương pháp dàn 30 số trước ngày ${escapeHtml(record.predictionDate)}</div>
                        <div class="divide-y divide-slate-100">${(record.recommendation?.ranking || []).map((item, index) => `<div class="grid grid-cols-[28px_1fr_auto] items-center gap-2 px-3 py-2 text-sm ${item.methodId === record.main?.methodId ? 'bg-indigo-50/70' : 'bg-white'}"><span class="font-black text-slate-400">${index + 1}</span><span class="font-semibold text-slate-800">${escapeHtml(item.label)}</span><span class="text-right text-slate-600">7d ${percent(item.rate7)} · 30d ${percent(item.rate30)} · W90 ${percent(item.wilsonLower90)}</span></div>`).join('')}</div>
                    </div>
                    <div class="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3">
                        <p class="text-xs font-black uppercase tracking-wide text-sky-700">Năm bộ chọn dùng chung toàn bộ phương pháp</p>
                        <div class="mt-2 grid gap-2 sm:grid-cols-3">${(record.recommendation?.models || []).map(model => `<div class="rounded-lg bg-white p-2.5"><p class="text-xs font-bold text-slate-500">${escapeHtml(model.label)}</p><p class="mt-1 text-sm font-black text-slate-900">${escapeHtml(model.selected?.label || '-')}</p><p class="mt-1 text-xs text-slate-500">Điểm ${Number(model.selected?.selectionScore || 0).toFixed(3)} · Wilson ${percent(model.selected?.wilsonLower90)}</p></div>`).join('') || '<p class="text-sm text-slate-500">Snapshot cũ chưa có ba mô hình; giữ nguyên dàn đã phát hành.</p>'}</div>
                    </div>
                    <div class="mt-5 flex flex-wrap gap-2">${chips(record.main?.numbers, record.actual)}</div>
                    ${strongPanel}
                    ${candidatePanel}
                    ${record.settled ? `<p class="mt-4 text-sm font-bold ${record.main?.hit ? 'text-emerald-700' : 'text-rose-700'}">Kết quả ${number(record.actual)}: ${record.main?.hit ? 'trúng dàn chính' : 'trượt dàn chính'}.</p>` : '<p class="mt-4 text-sm font-bold text-indigo-700">Snapshot đã chốt, đang chờ kết quả để đối soát.</p>'}
                </div>
            </article>
            ${record.hybrid ? `<aside class="overflow-hidden rounded-2xl border border-violet-200 bg-violet-50 shadow-sm">
                <div class="border-b border-violet-200 bg-violet-100/70 px-5 py-4"><p class="text-xs font-black uppercase tracking-[0.16em] text-violet-700">${isCurrentFusion ? 'Đối chứng tổng hợp cố định 30 số' : 'Dàn tổng hợp phiên bản đã phát hành'}</p><h2 class="mt-1 text-lg font-black text-slate-900">${escapeHtml(record.hybrid?.label || 'Dàn tổng hợp')}</h2><p class="mt-1 text-sm leading-6 text-slate-600">${isCurrentFusion ? 'Dùng mọi dàn 30 số có trong snapshot. Dàn giống hệt chỉ tính một lần, các biến thể cùng họ chia sẻ ngân sách trọng số, dàn gần giống bị giảm ảnh hưởng; Z-score chỉ phá hòa.' : 'Giữ nguyên thuật toán và dàn số tại thời điểm snapshot được phát hành; không diễn giải lại bằng phiên bản tổng hợp hiện tại.'}</p></div>
                <div class="p-5">${isCurrentFusion ? `<div class="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p class="font-black">Nhánh nghiên cứu, chưa thay dàn chính</p><p class="mt-1">Replay strict PIT cùng tập ngày: ${fusionReplayText}. ${escapeHtml(fusionReport.promotionReason || '')}</p></div>` : ''}<div class="mb-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4"><div class="rounded-lg bg-white p-2"><p class="text-xs text-slate-500">Phương pháp</p><p class="font-black text-slate-900">${record.hybrid?.methodCount || 0}</p></div><div class="rounded-lg bg-white p-2"><p class="text-xs text-slate-500">Dàn độc lập</p><p class="font-black text-slate-900">${record.hybrid?.uniqueSetCount || 0}</p></div><div class="rounded-lg bg-white p-2"><p class="text-xs text-slate-500">Họ tín hiệu</p><p class="font-black text-slate-900">${record.hybrid?.familyCount || 0}</p></div><div class="rounded-lg bg-white p-2"><p class="text-xs text-slate-500">Dàn trùng bỏ</p><p class="font-black text-slate-900">${record.hybrid?.duplicatesRemoved || 0}</p></div></div><div class="flex flex-wrap gap-2">${chips(record.hybrid?.numbers, record.actual)}</div>${record.settled ? `<p class="mt-4 text-sm font-bold ${record.hybrid?.hit ? 'text-emerald-700' : 'text-rose-700'}">Kết quả ${number(record.actual)}: ${record.hybrid?.hit ? 'trúng dàn tổng hợp' : 'trượt dàn tổng hợp'}.</p>` : '<p class="mt-4 text-sm font-bold text-violet-700">Dàn tổng hợp đã khóa, chờ kết quả để đối soát.</p>'}<div class="mt-5 grid gap-3 sm:grid-cols-2"><div class="rounded-xl bg-white p-3"><p class="text-xs font-black uppercase tracking-wide text-emerald-700">Nguồn đã khử trùng</p><p class="mt-2 text-sm font-bold text-slate-800">${(record.hybrid?.leaders || []).map(item => `${escapeHtml(item.label)} (${percent(item.weight)})`).join(' · ') || '-'}</p></div><div class="rounded-xl bg-white p-3"><p class="text-xs font-black uppercase tracking-wide text-violet-700">Số thêm so với dàn chính</p><p class="mt-2 font-mono font-black text-slate-800">${(record.hybrid?.replacedIn || []).map(item => number(item.number)).join(' · ') || '-'}</p></div></div></div>
            </aside>` : `<aside class="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm"><p class="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Gợi ý tổng hợp</p><h2 class="mt-1 text-lg font-black text-slate-900">Toàn bộ phương pháp dàn 30 số</h2><p class="mt-3 text-sm leading-6 text-slate-600">Snapshot này đã phát hành trước khi lane tổng hợp được triển khai nên giữ nguyên để bảo toàn tính toàn vẹn.</p></aside>`}`;
    }

    function renderHistory() {
        const limit = Number(byId('logLimit').value || 30);
        const rows = (payload?.records || []).slice(0, limit);
        byId('historyLog').innerHTML = rows.map(record => {
            const selected = record.recommendation?.selected || {};
            const currentFusion = record.hybrid?.id === payload?.methodology?.fusionId;
            return `<article class="grid gap-3 px-5 py-4 md:grid-cols-[130px_1fr_auto] md:items-center">
                <div><p class="font-black text-slate-900">${escapeHtml(record.predictionDate)}</p><p class="mt-1 text-xs font-semibold ${record.lifecycle?.mode === 'reconstructed-after-draw' ? 'text-amber-700' : 'text-slate-500'}">${escapeHtml(ledgerLabel(record))}</p></div>
                <div><p class="font-bold text-slate-800">${escapeHtml(record.main?.label || selected.label || '-')}</p><p class="mt-1 text-sm text-slate-600">7d ${selected.wins7 || 0}/${selected.observations7 || 0} · 30d ${selected.wins30 || 0}/${selected.observations30 || 0} · 90d ${selected.wins90 || 0}/${selected.observations || 0} · Wilson ${percent(selected.wilsonLower90)}</p><div class="mt-2"><p class="mb-1 text-xs font-black uppercase tracking-wide text-indigo-700">Dàn chính</p><div class="flex flex-wrap gap-1.5">${chips(record.main?.numbers, record.actual)}</div></div>${record.hybrid ? `<div class="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3"><p class="mb-2 text-xs font-black uppercase tracking-wide text-violet-700">${currentFusion ? 'Đối chứng toàn bộ phương pháp' : 'Dàn tổng hợp phiên bản cũ'}</p><div class="flex flex-wrap gap-1.5">${chips(record.hybrid?.numbers, record.actual)}</div><p class="mt-2 text-xs font-semibold text-violet-700">${record.hybrid?.methodCount || 0} phương pháp · ${record.hybrid?.uniqueSetCount || 0} dàn độc lập · thêm: ${(record.hybrid?.replacedIn || []).map(item => number(item.number)).join(' · ') || '-'}</p></div>` : ''}</div>
                <div class="text-left md:text-right"><p class="text-sm font-black">Chính: ${laneOutcome(record, 'main')}</p>${record.hybrid ? `<p class="mt-1 text-sm font-black">Tổng hợp: ${laneOutcome(record, 'hybrid')}</p>` : '<p class="mt-1 text-sm text-slate-400">Tổng hợp: chưa áp dụng</p>'}${record.settled ? `<p class="mt-1 text-sm text-slate-600">KQ ${number(record.actual)}</p>` : ''}</div>
            </article>`;
        }).join('') || '<p class="p-6 text-sm text-slate-500">Chưa có nhật ký.</p>';
    }

    function renderDecisionGuide(data) {
        const container = byId('decisionGuide');
        const latest = (data.records || [])[0];
        const selected = latest?.recommendation?.selected || {};
        const models = latest?.recommendation?.models || [];
        const strongMethods = latest?.recommendation?.currentStrongMethods || [];
        const fusion = data?.decisionReport?.fusion || {};
        const fusionSummary = fusion.summary || {};
        const state = latest?.recommendation?.action === 'consider' ? 'Đủ điều kiện theo dõi cược' : 'Chỉ quan sát';
        container.innerHTML = [
            `<article class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4"><p class="text-xs font-black uppercase tracking-wide text-indigo-700">Dàn dùng để theo dõi</p><h3 class="mt-1 text-lg font-black text-slate-900">${escapeHtml(latest?.main?.label || '-')}</h3><p class="mt-2 text-sm leading-6 text-slate-600">${escapeHtml(latest?.recommendation?.rationale || 'Chưa có trạng thái quyết định.')}</p><span class="mt-3 inline-flex rounded-full ${latest?.recommendation?.action === 'consider' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'} px-2.5 py-1 text-xs font-black">${state}</span></article>`,
            `<article class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-xs font-black uppercase tracking-wide text-slate-500">Bằng chứng trước ngày dự đoán</p><div class="mt-3 grid grid-cols-3 gap-2 text-center"><div class="rounded-lg bg-slate-50 p-2"><p class="text-xs text-slate-500">7 kỳ</p><p class="font-black">${selected.wins7 || 0}/${selected.observations7 || 0}</p></div><div class="rounded-lg bg-slate-50 p-2"><p class="text-xs text-slate-500">30 kỳ</p><p class="font-black">${selected.wins30 || 0}/${selected.observations30 || 0}</p></div><div class="rounded-lg bg-slate-50 p-2"><p class="text-xs text-slate-500">Wilson</p><p class="font-black">${percent(selected.wilsonLower90)}</p></div></div><p class="mt-3 text-xs text-slate-500">Mốc hòa vốn lý thuyết: 35,7%; không dùng kết quả tương lai.</p></article>`,
            `<article class="rounded-xl border border-sky-200 bg-sky-50 p-4"><p class="text-xs font-black uppercase tracking-wide text-sky-700">Toàn bộ phương pháp và đối chứng</p><p class="mt-2 text-sm leading-6 text-slate-600">${models.length ? `${models.length} bộ chọn cùng xếp hạng toàn bộ dàn 30 số; ${strongMethods.length} phương pháp đang có tín hiệu tốt được lưu cùng quyết định. Dàn tổng hợp trực tiếp chỉ là đối chứng vì ${fusionSummary.days ? `replay đạt ${fusionSummary.wins}/${fusionSummary.days} kỳ (${percent(fusionSummary.hitRate)})` : 'chưa đủ snapshot cùng phiên bản'}.` : 'Snapshot cũ chưa có nhánh đối chiếu; lịch sử giữ nguyên dàn đã phát hành.'}</p><p class="mt-2 text-xs font-semibold text-amber-800">${escapeHtml(fusion.promotionReason || '')}</p><a href="/advisor-analysis" class="mt-3 inline-flex text-sm font-black text-sky-700 hover:text-sky-900">So sánh strict PIT trong phòng thí nghiệm <i class="bi bi-arrow-right ml-1"></i></a></article>`
        ].join('');
    }

    function render(data) {
        payload = data;
        const summary = data.summary?.main || {};
        const hybrid = data.summary?.hybrid || {};
        const mainPassed = Boolean(summary.isAboveBreakEven);
        const hybridPassed = Boolean(hybrid.isAboveBreakEven);
        byId('summaryCards').innerHTML = [
            stat('Dữ liệu R2', data.latestDataDate || '-', `Tạo cache: ${data.generatedAt ? new Date(data.generatedAt).toLocaleString('vi-VN') : '-'}`),
            stat('Dàn chính đã kết toán', `${summary.wins || 0}/${summary.days || 0}`, `${lanePerformance(summary)} · ${mainPassed ? 'lãi lý thuyết' : 'chưa đạt hòa vốn'}`),
            stat('Đối chứng all-method đã kết toán', `${hybrid.wins || 0}/${hybrid.days || 0}`, `${lanePerformance(hybrid)} · ${hybridPassed ? 'lãi lý thuyết' : 'chưa đạt hòa vốn'}`),
            stat('Lãi/lỗ dàn chính', `${fmt(summary.profitK || 0)}K`, `ROI ${percent(summary.roi)} · chuỗi trượt dài nhất ${summary.longestLoss || 0}`),
            stat('Lãi/lỗ đối chứng all-method', `${fmt(hybrid.profitK || 0)}K`, `ROI ${percent(hybrid.roi)} · chuỗi trượt dài nhất ${hybrid.longestLoss || 0}`)
        ].join('');
        renderLatest((data.records || [])[0]);
        renderDecisionGuide(data);
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
