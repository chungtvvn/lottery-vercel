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
    let activeLongMethodId = null;
    let activeFamily = 'all';

    function showToast(msg) {
        let toast = byId('advisorAnalysisToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'advisorAnalysisToast';
            toast.className = 'fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl border border-emerald-300 bg-emerald-900 px-5 py-3.5 text-sm font-black text-white shadow-2xl transition-all duration-300 opacity-0 translate-y-4';
            document.body.appendChild(toast);
        }
        toast.innerHTML = `<i class="bi bi-check-circle-fill text-emerald-300 text-lg"></i><span>${esc(msg)}</span>`;
        toast.classList.remove('opacity-0', 'translate-y-4');
        toast.classList.add('opacity-100', 'translate-y-0');
        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-y-4');
            toast.classList.remove('opacity-100', 'translate-y-0');
        }, 2200);
    }

    function copyNumbers(numbers, sep = ' ') {
        if (!numbers || !numbers.length) return;
        const text = numbers.map(num).join(sep);
        navigator.clipboard.writeText(text).then(() => {
            showToast(`Đã sao chép ${numbers.length} số thành công!`);
        }).catch(() => {
            const temp = document.createElement('textarea');
            temp.value = text;
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            document.body.removeChild(temp);
            showToast(`Đã sao chép ${numbers.length} số!`);
        });
    }

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
        let policies = [...(payload?.researchReport?.policies || [])];
        if (activeFamily !== 'all') {
            policies = policies.filter(p => p.family === activeFamily);
        }
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

    function longHorizon() {
        return payload?.longHorizonResearch || null;
    }

    function focusedLongMethod() {
        const methods = longHorizon()?.methods || [];
        if (!methods.length) return null;
        if (!activeLongMethodId || !methods.some(method => method.id === activeLongMethodId)) {
            activeLongMethodId = longHorizon()?.recommendation?.methodId || methods[0].id;
        }
        return methods.find(method => method.id === activeLongMethodId) || methods[0];
    }

    function renderLongHorizon() {
        const report = longHorizon();
        const missing = byId('longHorizonMissing');
        if (!report?.methods?.length) {
            missing.textContent = 'Chưa có cache nghiên cứu 20 năm từ raw R2. Cache này là tác vụ nghiên cứu riêng để không làm chậm action hằng ngày; sau khi tạo sẽ hiển thị so sánh multi-regime tại đây.';
            missing.classList.remove('hidden');
            byId('longHorizonOverview').innerHTML = '';
            byId('longHorizonMethods').innerHTML = '';
            byId('longHorizonChart').innerHTML = '<p class="text-sm text-slate-500">Chưa có đường kiểm chứng dài hạn.</p>';
            byId('longHorizonPeriods').innerHTML = '<p class="text-sm text-slate-500">Chưa có báo cáo multi-regime.</p>';
            return;
        }
        missing.classList.add('hidden');
        const source = report.source || {};
        const promoted = report.methods.filter(method => method.promoted).length;
        byId('longHorizonOverview').innerHTML = [
            stat('Dữ liệu raw R2', fmt(source.rawRows || 0), `${source.dataStart || '-'} đến ${source.dataEnd || '-'}`),
            stat('Tập nhóm khử trùng', fmt(source.groupCatalog?.groups || 0), `${source.groupCatalog?.minSize || '-'}–${source.groupCatalog?.maxSize || '-'} số/nhóm`),
            stat('Mô hình đã kiểm chứng', report.methods.length, 'Mỗi dàn giữ 30 số cố định'),
            stat('Qua cổng promotion', promoted, report.recommendation?.status || 'Chưa có mô hình đủ điều kiện')
        ].join('');

        byId('longHorizonMethods').innerHTML = report.methods.map(method => {
            const holdout = method.splits?.holdout || {};
            const validation = method.splits?.validation || {};
            const tone = method.promoted ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white';
            return `<article class="border ${tone} p-4 shadow-sm"><div class="flex items-start justify-between gap-3"><div><p class="text-xs font-black uppercase tracking-wide text-violet-700">${esc(method.id)}</p><h3 class="mt-1 text-base font-black text-slate-900">${esc(method.label)}</h3></div><button data-long-method="${esc(method.id)}" class="rounded-md ${method.id === activeLongMethodId ? 'bg-violet-700 text-white' : 'border border-violet-200 bg-white text-violet-700'} px-2.5 py-1.5 text-xs font-black">${method.id === activeLongMethodId ? 'Đang xem' : 'Xem nhịp'}</button></div><p class="mt-2 min-h-10 text-sm leading-5 text-slate-600">${esc(method.description)}</p><div class="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div class="rounded-md bg-slate-50 p-2"><p class="text-slate-500">Holdout</p><p class="mt-1 font-black text-slate-900">${pct(holdout.hitRate)}</p></div><div class="rounded-md bg-slate-50 p-2"><p class="text-slate-500">Wilson</p><p class="mt-1 font-black text-slate-900">${pct(holdout.wilsonLower)}</p></div><div class="rounded-md bg-slate-50 p-2"><p class="text-slate-500">Profit</p><p class="mt-1 font-black ${Number(holdout.profitK || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${signed(holdout.profitK)}</p></div></div><p class="mt-3 text-xs text-slate-500">Validation ${pct(validation.hitRate)} · ${signed(validation.profitK)} · ${esc(method.status || '')}</p></article>`;
        }).join('');

        const method = focusedLongMethod();
        const holdout = method?.splits?.holdout || {};
        const rows = (method?.recentRows || []).slice(-90);
        const bars = rows.map(row => `<div class="group relative h-11 min-w-4 rounded-sm ${row.hit ? 'bg-emerald-500' : 'bg-rose-400'}" title="${esc(row.date)} · ${row.hit ? 'Trúng' : 'Trượt'}"><span class="pointer-events-none absolute inset-x-0 -bottom-5 hidden text-center text-[9px] font-bold text-slate-500 group-hover:block">${esc(row.date.slice(5))}</span></div>`).join('');
        byId('longHorizonChart').innerHTML = method
            ? `<div class="flex flex-wrap items-start justify-between gap-3"><div><p class="text-lg font-black text-slate-900">${esc(method.label)}</p><p class="mt-1 text-sm text-slate-600">Holdout: ${holdout.wins || 0}/${holdout.days || 0} · ${pct(holdout.hitRate)} · cận Wilson ${pct(holdout.wilsonLower)}</p></div><span class="rounded-md ${method.promoted ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'} px-3 py-2 text-xs font-black">${esc(method.status || '')}</span></div><div class="mt-5 overflow-x-auto pb-6"><div class="flex min-w-max items-end gap-1">${bars || '<span class="text-sm text-slate-500">Chưa có kỳ gần đây.</span>'}</div></div><p class="mt-2 text-xs text-slate-500">Xanh: trúng · Đỏ: trượt · hiển thị tối đa 90 kỳ gần nhất, còn tổng hợp đầy đủ theo các giai đoạn ở bên phải.</p>`
            : '<p class="text-sm text-slate-500">Không có mô hình để hiển thị.</p>';

        const splitRows = Object.entries(method?.splits || {}).map(([id, summary]) => `<div class="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md border border-slate-100 px-3 py-2 text-sm"><span><strong class="text-slate-900">${esc(id)}</strong><small class="block text-xs text-slate-500">${esc(summary.range?.start || '-')} đến ${esc(summary.range?.end || '-')}</small></span><span class="font-black text-slate-900">${summary.wins || 0}/${summary.days || 0}<small class="block text-xs font-normal text-slate-500">${pct(summary.hitRate)}</small></span><span class="font-black ${Number(summary.profitK || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${signed(summary.profitK)}</span></div>`).join('');
        byId('longHorizonPeriods').innerHTML = method
            ? `<p class="mb-3 text-sm font-black text-slate-900">${esc(method.label)}</p><div class="space-y-2">${splitRows}</div><p class="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">Cổng promotion: validation và holdout phải cùng dương, đủ mẫu và cận Wilson 90% vượt ${pct(report.economics?.breakEvenHitRate)}. Không dùng kết quả development để tự tuyên bố hiệu quả tương lai.</p>`
            : '<p class="text-sm text-slate-500">Không có phân rã giai đoạn.</p>';
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

    function renderComplementarity() {
        const pairs = payload?.methodComplementarity || [];
        const target = byId('methodComplementarity');
        if (!pairs.length) {
            target.innerHTML = '<p class="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Chưa có đủ snapshot immutable cùng ngày để đo độ bổ sung giữa các dàn.</p>';
            return;
        }
        target.innerHTML = pairs.slice(0, 10).map(pair => {
            const leftHandoff = pair.leftAfterRightMiss || {};
            const rightHandoff = pair.rightAfterLeftMiss || {};
            return `<article class="rounded-md border border-teal-100 bg-white p-4 shadow-sm"><div class="flex flex-wrap items-start justify-between gap-2"><div><p class="text-xs font-black uppercase tracking-wide text-teal-700">${pair.days || 0} kỳ immutable cùng dàn</p><h3 class="mt-1 text-sm font-black leading-5 text-slate-900">${esc(pair.leftLabel || pair.leftId)} <span class="text-slate-400">↔</span> ${esc(pair.rightLabel || pair.rightId)}</h3></div><span class="rounded-md border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-black text-teal-800">Phủ chung ${pct(pair.unionHitRate)}</span></div><div class="mt-3 grid grid-cols-4 gap-2 text-center text-xs"><div class="rounded-md bg-slate-50 p-2"><p class="text-slate-500">Cùng trúng</p><p class="mt-1 font-black text-slate-900">${pair.bothHit || 0}</p></div><div class="rounded-md bg-sky-50 p-2"><p class="text-slate-500">Chỉ trái</p><p class="mt-1 font-black text-sky-800">${pair.onlyLeft || 0}</p></div><div class="rounded-md bg-violet-50 p-2"><p class="text-slate-500">Chỉ phải</p><p class="mt-1 font-black text-violet-800">${pair.onlyRight || 0}</p></div><div class="rounded-md bg-rose-50 p-2"><p class="text-slate-500">Cùng trượt</p><p class="mt-1 font-black text-rose-800">${pair.neither || 0}</p></div></div><div class="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2"><p>Trùng dàn TB: <strong class="text-slate-900">${Number(pair.averageSetOverlap || 0).toFixed(1)}/30</strong> · cận Wilson phủ chung <strong class="text-slate-900">${pct(pair.unionWilsonLower)}</strong></p><p>Sau khi <strong>${esc(pair.rightLabel || pair.rightId)}</strong> trượt, <strong>${esc(pair.leftLabel || pair.leftId)}</strong> trúng kỳ kế: <strong class="text-slate-900">${leftHandoff.wins || 0}/${leftHandoff.days || 0} · ${pct(leftHandoff.hitRate)}</strong></p><p class="sm:col-span-2">Sau khi <strong>${esc(pair.leftLabel || pair.leftId)}</strong> trượt, <strong>${esc(pair.rightLabel || pair.rightId)}</strong> trúng kỳ kế: <strong class="text-slate-900">${rightHandoff.wins || 0}/${rightHandoff.days || 0} · ${pct(rightHandoff.hitRate)}</strong></p></div></article>`;
        }).join('');
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
            const coverage = policy.coverage || {};
            const evidenceClass = summary.evidence === 'Có tín hiệu vượt hòa vốn' ? 'bg-emerald-100 text-emerald-700' : summary.evidence === 'Lãi mẫu, chưa vượt cận Wilson' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600';
            return `<article class="border ${isActive ? 'border-indigo-500 ring-1 ring-indigo-300' : 'border-slate-200'} bg-white p-4 shadow-sm"><div class="flex items-start justify-between gap-3"><div><p class="text-xs font-black uppercase tracking-wide text-slate-500">#${index + 1} · ${esc(policy.family)}</p><h3 class="mt-1 text-base font-black text-slate-900">${esc(policy.label)}</h3></div><button data-policy="${esc(policy.id)}" class="rounded-md ${isActive ? 'bg-indigo-700 text-white' : 'border border-indigo-200 bg-white text-indigo-700'} px-2.5 py-1.5 text-xs font-black">${isActive ? 'Đang xem' : 'Xem nhịp'}</button></div><p class="mt-2 min-h-10 text-sm leading-5 text-slate-600">${esc(policy.description)}</p><div class="mt-4 grid grid-cols-4 gap-2 text-center text-xs"><div class="rounded-md bg-slate-50 p-2"><p class="text-slate-500">Trúng</p><p class="mt-1 text-sm font-black text-slate-900">${summary.wins || 0}/${summary.days || 0}</p></div><div class="rounded-md bg-slate-50 p-2"><p class="text-slate-500">Tỷ lệ</p><p class="mt-1 text-sm font-black text-slate-900">${pct(summary.hitRate)}</p></div><div class="rounded-md bg-slate-50 p-2"><p class="text-slate-500">Wilson</p><p class="mt-1 text-sm font-black text-slate-900">${pct(summary.wilsonLower)}</p></div><div class="rounded-md bg-slate-50 p-2"><p class="text-slate-500">Trượt dài</p><p class="mt-1 text-sm font-black text-slate-900">${summary.longestLoss || 0}</p></div></div><div class="mt-3 flex items-center justify-between gap-3"><span class="rounded-md px-2 py-1 text-xs font-black ${evidenceClass}">${esc(summary.evidence || 'Chưa đủ dữ liệu')}</span><span class="text-sm font-black ${Number(summary.profitK || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${signed(summary.profitK)}</span></div><p class="mt-2 text-xs text-slate-500">ROI ${pct(summary.roi)} · hòa vốn ${pct(summary.breakEvenHitRate)} · chuỗi thắng dài nhất ${summary.longestWin || 0}</p><p class="mt-1 text-xs font-semibold text-slate-500">Phát dàn ${coverage.issuedDays || 0}/${coverage.candidateDays || 0} ngày (${pct(coverage.coverageRate)}) · chủ động bỏ ${coverage.abstainedDays || 0} ngày</p></article>`;
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
        const coverage = policy.coverage || {};
        byId('performanceTrace').innerHTML = `<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p class="text-lg font-black text-slate-900">${esc(policy.label)}</p><p class="mt-1 text-sm text-slate-600">${summary.wins || 0} trúng / ${summary.days || 0} kỳ đã phát dàn · cận Wilson ${pct(summary.wilsonLower)} · lãi/lỗ <strong class="${Number(summary.profitK || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${signed(summary.profitK)}</strong></p></div><span class="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">Xanh: trúng · Đỏ: trượt</span></div><div class="mt-5 overflow-x-auto pb-6"><div class="flex min-w-max items-end gap-1.5">${bars || '<span class="text-sm text-slate-500">Chưa có quyết định đã kết toán.</span>'}</div></div><div class="mt-2 grid gap-2 text-xs text-slate-500 sm:grid-cols-4"><p>Dàn cố định: ${payload.researchReport?.source?.fixedBetCount || 30} số/lần phát</p><p>Độ phủ: ${coverage.issuedDays || 0}/${coverage.candidateDays || 0} ngày</p><p>Chuỗi trượt dài nhất: ${summary.longestLoss || 0} ngày đánh</p><p>Chuỗi trúng dài nhất: ${summary.longestWin || 0} ngày đánh</p></div>`;
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
        byId('currentCandidates').innerHTML = candidates.map(candidate => {
            const badge = candidate.numbersAvailable ? 'Có dàn' : candidate.abstained ? 'Chủ động bỏ ngày' : 'Chưa có dàn phụ';
            const missingMessage = candidate.abstained
                ? 'Các điều kiện posterior, EWMA hoặc cận Wilson chưa đồng thời vượt hòa vốn nên chính sách không phát dàn cho ngày này.'
                : 'Snapshot hiện tại chỉ lưu dàn chính. Action kế tiếp sẽ lưu đồng thời các dàn ứng viên, không tái tính số của ngày này để tránh thay đổi dự đoán đã phát hành.';
            const copyBtn = candidate.numbersAvailable && candidate.numbers?.length ? `
                <button type="button" data-copy-candidate="${esc(candidate.id)}" class="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100 shadow-xs">
                    <i class="bi bi-clipboard"></i> Sao chép ${candidate.numbers.length} số
                </button>
            ` : '';
            return `<article class="border ${candidate.isProduction ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200 bg-white'} p-4 shadow-sm"><div class="flex items-start justify-between gap-3"><div><p class="text-xs font-black uppercase tracking-wide ${candidate.isProduction ? 'text-emerald-700' : 'text-slate-500'}">${candidate.isProduction ? 'Dàn production đã khóa' : esc(candidate.family)}</p><h3 class="mt-1 font-black text-slate-900">${esc(candidate.label)}</h3><p class="mt-1 text-sm text-slate-600">${esc(candidate.methodLabel)}</p></div><div class="flex flex-col items-end gap-1.5"><span class="rounded-md ${candidate.numbersAvailable ? 'bg-slate-100 text-slate-700' : candidate.abstained ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'} px-2 py-1 text-xs font-black">${badge}</span>${copyBtn}</div></div><p class="mt-2 text-xs text-slate-500">Nguồn: ${esc(candidate.source)} · điểm chọn ${Number(candidate.selectionScore || 0).toFixed(3)}</p>${candidate.numbersAvailable ? `<div class="mt-4 flex flex-wrap gap-1.5">${numberChips(candidate.numbers)}</div>` : `<p class="mt-4 rounded-md border ${candidate.abstained ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-amber-200 bg-amber-50 text-amber-800'} p-3 text-sm leading-5">${esc(missingMessage)}</p>`}</article>`;
        }).join('') || '<p class="text-sm text-slate-500">Chưa có ứng viên cho ngày dự đoán.</p>';

        document.querySelectorAll('[data-copy-candidate]').forEach(btn => {
            btn.onclick = () => {
                const candId = btn.getAttribute('data-copy-candidate');
                const cand = (payload.currentCandidates || []).find(c => c.id === candId);
                if (cand && cand.numbers) copyNumbers(cand.numbers, ' ');
            };
        });
    }

    function renderMatrix() {
        const methods = payload.methods || [];
        byId('methodMatrix').innerHTML = methods.map(row => `<tr><td class="max-w-[310px] px-4 py-3"><p class="font-bold text-slate-900">#${row.rank} ${esc(row.label)}</p><p class="mt-1 text-xs text-slate-500">${row.betCount || 0} số · giao Top 30 điểm ${row.overlapCount || 0}</p></td><td class="px-3 py-3 text-center font-black" style="${heat(row.rate7)}">${pct(row.rate7)}</td><td class="px-3 py-3 text-center font-black" style="${heat(row.rate30)}">${pct(row.rate30)}</td><td class="px-3 py-3 text-center font-black" style="${heat(row.rate90)}">${pct(row.rate90)}</td><td class="px-3 py-3 text-center font-black" style="${heat(row.wilsonLower90)}">${pct(row.wilsonLower90)}</td><td class="px-3 py-3 text-center font-black ${row.trend >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${row.trend >= 0 ? '+' : ''}${pct(row.trend)}</td><td class="px-3 py-3 text-center font-black text-violet-700">${row.overlapCount}/${row.betCount || '-'}</td></tr>`).join('') || '<tr><td colspan="7" class="p-5 text-center text-slate-500">Snapshot hiện tại chưa lưu đủ dàn phương pháp.</td></tr>';
    }

    function renderScoreOverlay() {
        const overlay = payload.scoreOverlay || {};
        const mismatch = payload.warnings?.scoreDateMismatch;
        const calibration = overlay.calibration || {};
        const gate = overlay.eligible
            ? '<p class="mt-3 inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">Đủ cổng calibration để hiển thị như lớp hỗ trợ</p>'
            : `<p class="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">Chưa đạt cổng calibration (${Number(calibration.days || 0)} ngày · Wilson ${pct(calibration.wilsonLower || 0)} · hòa vốn ${pct(calibration.breakEvenHitRate || 0)}). Lớp này không được đưa vào dàn đánh.</p>`;
        const numbers = (overlay.ranked || []).map(row => `<span title="${num(row.number)} · ${row.methodVotes.toFixed(1)} phiếu · hạng điểm ${row.probabilityRank}" class="rounded-md border ${row.methodVotes >= 2 ? 'border-violet-400 bg-violet-100 text-violet-900' : 'border-slate-200 bg-slate-50 text-slate-700'} px-2.5 py-2 font-mono text-sm font-black">${num(row.number)}${row.methodVotes >= 2 ? `<sup class="ml-1 text-[10px]">${row.methodVotes.toFixed(1)}</sup>` : ''}</span>`).join('');
        byId('scoreOverlay').innerHTML = `<p class="text-sm leading-6 text-slate-600">${esc(overlay.note || 'Chưa có dữ liệu Điểm xác suất.')}</p>${gate}${mismatch ? '<p class="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">Snapshot Điểm xác suất chưa cùng ngày với Gợi ý; chỉ hiển thị để học tín hiệu, không đưa vào quyết định hoặc đánh giá strict PIT.</p>' : ''}${numbers ? `<div class="mt-4 flex flex-wrap gap-2">${numbers}</div><p class="mt-4 text-xs text-slate-500">Tím: nhận ít nhất hai phiếu mô hình. Số mũ là tổng phiếu có trọng số, không phải xác suất trúng.</p>` : ''}`;
    }

    function render(data) {
        payload = data;
        renderSource(data);
        renderOverview();
        renderLongHorizon();
        renderConsensus();
        renderComplementarity();
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
        const familyBtn = event.target.closest('.policy-family-btn');
        if (familyBtn) {
            document.querySelectorAll('.policy-family-btn').forEach(btn => {
                btn.className = 'policy-family-btn rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100';
            });
            familyBtn.className = 'policy-family-btn rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white shadow-xs';
            activeFamily = familyBtn.getAttribute('data-family') || 'all';
            activePolicyId = null;
            renderLeaderboard();
            renderPerformanceTrace();
            renderPeriods();
            return;
        }

        const button = event.target.closest('[data-window], [data-policy], [data-long-method]');
        if (!button || !payload) return;
        if (button.dataset.window) {
            activeWindow = button.dataset.window;
            document.querySelectorAll('[data-window]').forEach(item => {
                const active = item.dataset.window === activeWindow;
                item.className = `analysis-window rounded-md px-3 py-2 text-sm font-bold ${active ? 'bg-indigo-700 text-white' : 'border border-indigo-200 bg-white text-indigo-700'}`;
            });
        }
        if (button.dataset.policy) activePolicyId = button.dataset.policy;
        if (button.dataset.longMethod) activeLongMethodId = button.dataset.longMethod;
        renderLeaderboard();
        renderPerformanceTrace();
        renderPeriods();
        renderLongHorizon();
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
