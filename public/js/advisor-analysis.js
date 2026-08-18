(() => {
    const byId = id => document.getElementById(id);
    const pct = value => `${(Number(value || 0) * 100).toFixed(1)}%`;
    const num = value => String(Number(value)).padStart(2, '0');
    const fmt = value => new Intl.NumberFormat('vi-VN').format(Number(value || 0));
    const signed = value => `${Number(value || 0) >= 0 ? '+' : ''}${fmt(value)}K`;
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
    const heat = value => {
        const score = Math.max(0, Math.min(1, Number(value || 0)));
        return `background-color: rgba(14, 116, 144, ${0.06 + score * 0.55}); color: ${score > 0.52 ? '#fff' : '#0f172a'}`;
    };
    const stat = (label, value, note) => `<div class="rounded-md border border-slate-200 bg-white p-4"><p class="text-xs font-bold uppercase tracking-wide text-slate-500">${esc(label)}</p><p class="mt-1 text-2xl font-black text-slate-900">${value}</p>${note ? `<p class="mt-1 text-xs leading-5 text-slate-500">${esc(note)}</p>` : ''}</div>`;
    const numberChips = numbers => (numbers || []).map(number => `<span class="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 px-1.5 font-mono text-sm font-black text-emerald-800">${num(number)}</span>`).join('');

    let payload = null;
    let activeWindow = 'overall';
    let activeSort = 'profit';
    let activePolicyId = null;

    function reportFor(policy) {
        if (activeWindow === 'last14') return policy.windows?.last14 || {};
        if (activeWindow === 'last30') return policy.windows?.last30 || {};
        return policy.overall || {};
    }

    function rowsFor(policy) {
        const rows = policy.decisions || [];
        if (activeWindow === 'last14') return rows.slice(-14);
        if (activeWindow === 'last30') return rows.slice(-30);
        return rows;
    }

    function sortedPolicies() {
        const policies = [...(payload?.researchReport?.policies || [])];
        return policies.sort((left, right) => {
            const a = reportFor(left);
            const b = reportFor(right);
            if (activeSort === 'hitRate') return Number(b.hitRate || 0) - Number(a.hitRate || 0) || Number(b.profitK || 0) - Number(a.profitK || 0);
            if (activeSort === 'wilson') return Number(b.wilsonLower || 0) - Number(a.wilsonLower || 0) || Number(b.profitK || 0) - Number(a.profitK || 0);
            return Number(b.profitK || 0) - Number(a.profitK || 0) || Number(b.wilsonLower || 0) - Number(a.wilsonLower || 0);
        });
    }

    function renderSource(data) {
        const source = data.source || {};
        const reportSource = data.researchReport?.source || {};
        byId('sourceBar').innerHTML = [
            ['Ngày dự đoán', data.predictionDate || '-'],
            ['Snapshot Gợi ý', source.advisorSnapshotDate || '-'],
            ['Snapshot Điểm', source.scoreSnapshotDate || 'Chưa có'],
            ['Mẫu immutable', `${reportSource.immutableRuns || 0} snapshot`]
        ].map(([label, value]) => `<div><span class="font-bold text-slate-500">${esc(label)}:</span> <span class="font-black text-slate-900">${esc(value)}</span></div>`).join('');
    }

    function renderOverview() {
        const source = payload.researchReport?.source || {};
        const policies = payload.researchReport?.policies || [];
        const promoted = policies.filter(policy => policy.overall?.evidence === 'Có tín hiệu vượt hòa vốn').length;
        const current = payload.currentCandidates?.find(candidate => candidate.isProduction);
        byId('researchOverview').innerHTML = [
            stat('Ngày đủ điều kiện', source.eligibleDays || 0, `${source.startDate || '-'} đến ${source.endDate || '-'}`),
            stat('Chính sách thử nghiệm', policies.length, 'Không thay dàn production tự động'),
            stat('Cận hòa vốn', pct(source.breakEvenHitRate), `${source.fixedBetCount || 30} số · ăn 84`),
            stat('Tín hiệu qua cổng', promoted, current?.methodLabel || 'Chưa xác định')
        ].join('');
    }

    function renderConsensus() {
        const advice = payload.currentAdvice || {};
        const evidence = advice.evidence || {};
        const agreement = advice.agreement || {};
        const groups = agreement.groups || [];
        const evidenceTone = evidence.meetsEvidenceGate
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-amber-200 bg-amber-50 text-amber-900';
        const groupRows = groups.map(group => `<div class="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2.5"><div><p class="font-black text-slate-900">${esc(group.methodLabel)}</p><p class="mt-0.5 text-xs text-slate-500">${esc((group.policies || []).join(' · '))}</p></div><span class="rounded-md bg-indigo-100 px-2 py-1 text-sm font-black text-indigo-800">${group.count}/${agreement.availablePolicies || 0}</span></div>`).join('') || '<p class="text-sm text-slate-500">Chưa có dàn ứng viên đã khóa.</p>';
        byId('researchConsensus').innerHTML = `<div><div class="flex flex-wrap items-start justify-between gap-3"><div><p class="text-xl font-black text-slate-900">${esc(advice.status || 'Chưa đủ dữ liệu')}</p><p class="mt-1 text-sm text-slate-600">Dàn chính: <strong>${esc(advice.primaryLabel || '-')}</strong></p></div><span class="rounded-md border px-3 py-2 text-sm font-black ${evidenceTone}">${agreement.primaryPolicies || 0}/${agreement.availablePolicies || 0} đồng thuận</span></div><div class="mt-4 grid gap-3 sm:grid-cols-3">${stat('30 ngày', pct(evidence.rate30), `Hòa vốn ${pct(evidence.breakEvenHitRate)}`)}${stat('Wilson 90', pct(evidence.wilsonLower90), evidence.meetsEvidenceGate ? 'Qua cổng hiện tại' : 'Chưa qua cổng')} ${stat('Nhánh khác', Math.max(0, (agreement.uniqueMethods || 0) - 1), 'Không dùng để đổi dàn') }</div><ul class="mt-5 space-y-2 rounded-md border border-slate-100 bg-slate-50 p-4 text-sm leading-6 text-slate-700">${(advice.recommendations || []).map(item => `<li class="flex gap-2"><span class="font-black text-cyan-700">•</span><span>${esc(item)}</span></li>`).join('')}</ul></div><div><p class="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Phân nhóm theo phương pháp được chọn</p><div class="space-y-2">${groupRows}</div><p class="mt-3 text-xs leading-5 text-slate-500">Con số ở bên phải là số chính sách cùng chọn một phương pháp. Đây chỉ là đồng thuận giữa bộ chọn, không phải xác suất trúng của số.</p></div>`;
    }

    function renderExplanation() {
        const explanation = payload.explanation || {};
        const items = [
            ['Dàn production', explanation.primary],
            ['Strict PIT', explanation.strict],
            ['Mục tiêu phòng thí nghiệm', explanation.laboratory],
            ['Điểm xác suất', explanation.scoring],
            ['Giới hạn', explanation.caution]
        ];
        byId('explanation').innerHTML = items.map(([title, body]) => `<div class="border-l-2 border-sky-300 pl-3"><p class="font-black text-slate-900">${esc(title)}</p><p class="mt-1 text-slate-600">${esc(body || '-')}</p></div>`).join('');
        byId('promotionGate').innerHTML = [
            ['1', 'Cùng kỳ và cùng dàn', 'Mọi ứng viên phải giữ cố định 30 số, tỷ lệ ăn và vốn để so sánh công bằng.'],
            ['2', 'Không dùng tương lai', 'Chỉ lấy snapshot immutable và kết quả trước ngày D để chọn phương pháp cho D.'],
            ['3', 'Không chỉ nhìn profit', 'Cần mẫu đủ dài, cận Wilson vượt hòa vốn và không làm chuỗi trượt xấu đi rõ rệt.'],
            ['4', 'Kiểm chứng độc lập', 'Kết quả dương ở một đoạn ngắn chỉ là giả thuyết; chưa đủ để đổi dàn theo dõi thực tế.']
        ].map(([step, title, body]) => `<div class="flex gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-black text-amber-900">${step}</span><div><p class="font-black text-slate-900">${esc(title)}</p><p class="mt-0.5 text-slate-600">${esc(body)}</p></div></div>`).join('');
    }

    function renderLeaderboard() {
        const policies = sortedPolicies();
        if (!policies.length) {
            byId('researchLeaderboard').innerHTML = '<p class="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Chưa có đủ snapshot immutable để tạo backtest strict PIT.</p>';
            return;
        }
        if (!activePolicyId || !policies.some(policy => policy.id === activePolicyId)) activePolicyId = policies[0].id;
        byId('researchLeaderboard').innerHTML = policies.map((policy, index) => {
            const summary = reportFor(policy);
            const isActive = policy.id === activePolicyId;
            const above = Number(summary.hitRate || 0) >= Number(summary.breakEvenHitRate || 0);
            const evidenceClass = summary.evidence === 'Có tín hiệu vượt hòa vốn' ? 'bg-emerald-100 text-emerald-700' : summary.evidence === 'Lãi mẫu, chưa vượt cận Wilson' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600';
            return `<article class="border ${isActive ? 'border-indigo-500 ring-1 ring-indigo-300' : 'border-slate-200'} bg-white p-4 shadow-sm"><div class="flex items-start justify-between gap-3"><div><p class="text-xs font-black uppercase tracking-wide text-slate-500">#${index + 1} · ${esc(policy.family)}</p><h3 class="mt-1 text-base font-black text-slate-900">${esc(policy.label)}</h3></div><button data-policy="${esc(policy.id)}" class="rounded-md ${isActive ? 'bg-indigo-700 text-white' : 'border border-indigo-200 bg-white text-indigo-700'} px-2.5 py-1.5 text-xs font-black">${isActive ? 'Đang xem' : 'Xem nhịp'}</button></div><p class="mt-2 min-h-10 text-sm leading-5 text-slate-600">${esc(policy.description)}</p><div class="mt-4 grid grid-cols-4 gap-2 text-center text-xs"><div class="rounded-md bg-slate-50 p-2"><p class="text-slate-500">Trúng</p><p class="mt-1 text-sm font-black text-slate-900">${summary.wins || 0}/${summary.days || 0}</p></div><div class="rounded-md bg-slate-50 p-2"><p class="text-slate-500">Tỷ lệ</p><p class="mt-1 text-sm font-black text-slate-900">${pct(summary.hitRate)}</p></div><div class="rounded-md bg-slate-50 p-2"><p class="text-slate-500">Wilson</p><p class="mt-1 text-sm font-black text-slate-900">${pct(summary.wilsonLower)}</p></div><div class="rounded-md bg-slate-50 p-2"><p class="text-slate-500">Trượt dài</p><p class="mt-1 text-sm font-black text-slate-900">${summary.longestLoss || 0}</p></div></div><div class="mt-3 flex items-center justify-between gap-3"><span class="rounded-md px-2 py-1 text-xs font-black ${evidenceClass}">${esc(summary.evidence || 'Chưa đủ dữ liệu')}</span><span class="text-sm font-black ${Number(summary.profitK || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${signed(summary.profitK)}</span></div><p class="mt-2 text-xs text-slate-500">ROI ${pct(summary.roi)} · hòa vốn ${pct(summary.breakEvenHitRate)} · chuỗi thắng dài nhất ${summary.longestWin || 0}</p></article>`;
        }).join('');
    }

    function focusedPolicy() {
        return (payload?.researchReport?.policies || []).find(policy => policy.id === activePolicyId) || null;
    }

    function renderPerformanceTrace() {
        const policy = focusedPolicy();
        if (!policy) { byId('performanceTrace').innerHTML = '<p class="text-sm text-slate-500">Chưa có chính sách để hiển thị.</p>'; return; }
        const rows = rowsFor(policy);
        const summary = reportFor(policy);
        const bars = rows.map(row => `<div class="group relative h-12 min-w-7 rounded-sm ${row.hit ? 'bg-emerald-500' : 'bg-rose-400'}" title="${esc(row.date)} · ${row.hit ? 'Trúng' : 'Trượt'} · ${esc(row.methodLabel)}"><span class="pointer-events-none absolute inset-x-0 -bottom-5 hidden text-center text-[10px] font-bold text-slate-500 group-hover:block">${esc(row.date.slice(5))}</span></div>`).join('');
        byId('performanceTrace').innerHTML = `<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p class="text-lg font-black text-slate-900">${esc(policy.label)}</p><p class="mt-1 text-sm text-slate-600">${summary.wins || 0} trúng / ${summary.days || 0} kỳ · cận Wilson ${pct(summary.wilsonLower)} · lãi/lỗ <strong class="${Number(summary.profitK || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${signed(summary.profitK)}</strong></p></div><span class="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">Xanh: trúng · Đỏ: trượt</span></div><div class="mt-5 overflow-x-auto pb-6"><div class="flex min-w-max items-end gap-1.5">${bars || '<span class="text-sm text-slate-500">Chưa có quyết định đã kết toán.</span>'}</div></div><div class="mt-2 grid gap-2 text-xs text-slate-500 sm:grid-cols-3"><p>Dàn cố định: ${payload.researchReport?.source?.fixedBetCount || 30} số/ngày</p><p>Chuỗi trượt dài nhất: ${summary.longestLoss || 0} ngày</p><p>Chuỗi trúng dài nhất: ${summary.longestWin || 0} ngày</p></div>`;
    }

    function renderPeriods() {
        const policy = focusedPolicy();
        if (!policy) { byId('periodBreakdown').innerHTML = ''; return; }
        const monthly = (policy.monthly || []).slice(-6).reverse();
        const weekly = (policy.weekly || []).slice(-6).reverse();
        const renderRows = (rows, label) => `<div><p class="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">${label}</p><div class="space-y-2">${rows.map(row => `<div class="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md border border-slate-100 px-3 py-2 text-sm"><span class="font-bold text-slate-700">${esc(row.period)}</span><span class="font-black text-slate-900">${row.wins}/${row.days}</span><span class="font-black ${Number(row.profitK || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${signed(row.profitK)}</span></div>`).join('') || '<p class="text-sm text-slate-500">Chưa có dữ liệu.</p>'}</div></div>`;
        byId('periodBreakdown').innerHTML = `<p class="mb-4 text-sm font-bold text-slate-900">${esc(policy.label)}</p>${renderRows(monthly, '6 tháng/khoảng gần nhất')}${renderRows(weekly, '6 tuần gần nhất')}`;
    }

    function renderCurrentCandidates() {
        const candidates = payload.currentCandidates || [];
        byId('currentCandidates').innerHTML = candidates.map(candidate => `<article class="border ${candidate.isProduction ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200 bg-white'} p-4 shadow-sm"><div class="flex items-start justify-between gap-3"><div><p class="text-xs font-black uppercase tracking-wide ${candidate.isProduction ? 'text-emerald-700' : 'text-slate-500'}">${candidate.isProduction ? 'Dàn production đã khóa' : esc(candidate.family)}</p><h3 class="mt-1 font-black text-slate-900">${esc(candidate.label)}</h3><p class="mt-1 text-sm text-slate-600">${esc(candidate.methodLabel)}</p></div><span class="rounded-md ${candidate.numbersAvailable ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-800'} px-2 py-1 text-xs font-black">${candidate.numbersAvailable ? 'Có dàn' : 'Chưa có dàn phụ'}</span></div><p class="mt-2 text-xs text-slate-500">Nguồn: ${esc(candidate.source)} · điểm chọn ${Number(candidate.selectionScore || 0).toFixed(3)}</p>${candidate.numbersAvailable ? `<div class="mt-4 flex flex-wrap gap-1.5">${numberChips(candidate.numbers)}</div>` : '<p class="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-800">Snapshot hiện tại chỉ lưu dàn chính. Action kế tiếp sẽ lưu đồng thời các dàn ứng viên, không tái tính số của ngày này để tránh thay đổi dự đoán đã phát hành.</p>'}</article>`).join('') || '<p class="text-sm text-slate-500">Chưa có ứng viên cho ngày dự đoán.</p>';
    }

    function renderMatrix() {
        const methods = payload.methods || [];
        byId('methodMatrix').innerHTML = methods.map(row => `<tr><td class="max-w-[310px] px-4 py-3"><p class="font-bold text-slate-900">#${row.rank} ${esc(row.label)}</p><p class="mt-1 text-xs text-slate-500">${row.betCount || 0} số · giao Top 30 điểm ${row.overlapCount || 0}</p></td><td class="px-3 py-3 text-center font-black" style="${heat(row.rate7)}">${pct(row.rate7)}</td><td class="px-3 py-3 text-center font-black" style="${heat(row.rate30)}">${pct(row.rate30)}</td><td class="px-3 py-3 text-center font-black" style="${heat(row.rate90)}">${pct(row.rate90)}</td><td class="px-3 py-3 text-center font-black" style="${heat(row.wilsonLower90)}">${pct(row.wilsonLower90)}</td><td class="px-3 py-3 text-center font-black ${row.trend >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${row.trend >= 0 ? '+' : ''}${pct(row.trend)}</td><td class="px-3 py-3 text-center font-black text-violet-700">${row.overlapCount}/${row.betCount || '-'}</td></tr>`).join('') || '<tr><td colspan="7" class="p-5 text-center text-slate-500">Snapshot hiện tại chưa lưu đủ dàn phương pháp.</td></tr>';
    }

    function renderScoreOverlay() {
        const overlay = payload.scoreOverlay || {};
        const mismatch = payload.warnings?.scoreDateMismatch;
        byId('scoreOverlay').innerHTML = `<p class="text-sm leading-6 text-slate-600">${esc(overlay.note || 'Chưa có dữ liệu Điểm xác suất.')}</p>${mismatch ? '<p class="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">Snapshot Điểm xác suất chưa cùng ngày với Gợi ý; chỉ hiển thị để học tín hiệu, không đưa vào quyết định hoặc đánh giá strict PIT.</p>' : ''}<div class="mt-4 flex flex-wrap gap-2">${(overlay.ranked || []).map(row => `<span title="${num(row.number)} · ${row.methodVotes.toFixed(1)} phiếu · hạng điểm ${row.probabilityRank}" class="rounded-md border ${row.methodVotes >= 2 ? 'border-violet-400 bg-violet-100 text-violet-900' : 'border-slate-200 bg-slate-50 text-slate-700'} px-2.5 py-2 font-mono text-sm font-black">${num(row.number)}${row.methodVotes >= 2 ? `<sup class="ml-1 text-[10px]">${row.methodVotes.toFixed(1)}</sup>` : ''}</span>`).join('')}</div><p class="mt-4 text-xs text-slate-500">Tím: nhận ít nhất hai phiếu mô hình. Số mũ là tổng phiếu có trọng số, không phải xác suất trúng.</p>`;
    }

    function render(data) {
        payload = data;
        renderSource(data);
        renderOverview();
        renderConsensus();
        renderExplanation();
        renderLeaderboard();
        renderPerformanceTrace();
        renderPeriods();
        renderCurrentCandidates();
        renderMatrix();
        renderScoreOverlay();
        if (data.warnings?.scoreDateMismatch) {
            byId('errorBox').textContent = 'Điểm xác suất đang lệch ngày snapshot Gợi ý. Phòng thí nghiệm vẫn chạy strict PIT từ các dàn immutable; lớp Điểm chỉ là đối chiếu hiện tại.';
            byId('errorBox').classList.remove('hidden');
        }
    }

    document.addEventListener('click', event => {
        const button = event.target.closest('[data-window], [data-policy]');
        if (!button || !payload) return;
        if (button.dataset.window) {
            activeWindow = button.dataset.window;
            document.querySelectorAll('[data-window]').forEach(item => {
                const active = item.dataset.window === activeWindow;
                item.className = `analysis-window rounded-md px-3 py-2 text-sm font-bold ${active ? 'bg-indigo-700 text-white' : 'border border-indigo-200 bg-white text-indigo-700'}`;
            });
        }
        if (button.dataset.policy) activePolicyId = button.dataset.policy;
        renderLeaderboard();
        renderPerformanceTrace();
        renderPeriods();
    });
    byId('researchSort').addEventListener('change', event => {
        activeSort = event.target.value;
        activePolicyId = null;
        renderLeaderboard();
        renderPerformanceTrace();
        renderPeriods();
    });

    fetch('/api/daily-advisor/analysis', { cache: 'no-store' })
        .then(response => response.json().then(data => ({ response, data })))
        .then(({ response, data }) => { if (!response.ok || !data.success) throw new Error(data.error || `HTTP ${response.status}`); render(data); })
        .catch(error => { byId('errorBox').textContent = `Không tải được phòng thí nghiệm lựa chọn: ${error.message}`; byId('errorBox').classList.remove('hidden'); });
})();
