(function () {
    const nf = new Intl.NumberFormat('vi-VN');

    function money(value) {
        const n = Number(value || 0);
        const sign = n > 0 ? '+' : '';
        return `${sign}${nf.format(n)}K`;
    }

    function percent(value) {
        return `${((Number(value || 0)) * 100).toFixed(2)}%`;
    }

    function numberBadge(number, tone = 'indigo') {
        const tones = {
            indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
            green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
            amber: 'border-amber-200 bg-amber-50 text-amber-700',
            red: 'border-red-200 bg-red-50 text-red-700',
            slate: 'border-slate-200 bg-slate-50 text-slate-700'
        };
        return `<span class="inline-flex h-10 min-w-10 items-center justify-center rounded-xl border px-3 text-sm font-bold ${tones[tone] || tones.indigo}">${number}</span>`;
    }

    function renderMeta(data) {
        const metaBox = document.getElementById('metaBox');
        const cfg = data.config || {};
        const next = data.nextPrediction || {};
        metaBox.innerHTML = [
            ['Ngày dữ liệu', data.latestDataDate || next.dataIsoDate || '-'],
            ['Ngày dự đoán', next.predictionDate || '-'],
            ['Vị trí', `${cfg.positionCount || 27} giải`],
            ['Công thức', `${nf.format(cfg.stakePerNumberK || 2300)}K ăn ${nf.format(cfg.payoutPerHitK || 80000)}K`]
        ].map(([label, value]) => `
            <div class="glass-card p-4">
                <div class="text-xs font-semibold uppercase text-slate-500">${label}</div>
                <div class="mt-2 text-2xl font-bold text-slate-900">${value}</div>
            </div>
        `).join('');
    }

    function renderPredictions(data) {
        const root = document.getElementById('predictionCards');
        const predictions = data.nextPrediction?.predictions || {};
        root.innerHTML = [5, 6, 7].map(count => {
            const item = predictions[`top${count}`] || {};
            const supportRows = (item.support || []).map(entry => `
                <div class="flex items-center justify-between gap-3 rounded-lg bg-white/60 px-3 py-2 text-xs">
                    <span class="font-bold text-slate-900">${entry.number}</span>
                    <span class="text-slate-500">${entry.supportCount} vị trí</span>
                </div>
            `).join('');
            return `
                <article class="glass-card overflow-hidden">
                    <div class="border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50 px-4 py-3">
                        <h2 class="text-lg font-bold text-slate-900">Top ${count} số đánh</h2>
                    </div>
                    <div class="p-4">
                        <div class="flex flex-wrap gap-2">
                            ${(item.numbers || []).map(number => numberBadge(number, 'green')).join('')}
                        </div>
                        <div class="mt-4 grid gap-2">${supportRows || '<div class="text-sm text-slate-500">Chưa có dữ liệu.</div>'}</div>
                    </div>
                </article>
            `;
        }).join('');
    }

    function renderSummary(data) {
        const tbody = document.getElementById('summaryTable');
        const windows = data.summariesByWindow || {};
        const rows = [];
        for (const [window, methods] of Object.entries(windows)) {
            for (const item of Object.values(methods || {})) {
                rows.push(`
                    <tr>
                        <td class="px-4 py-3 font-semibold text-slate-700">${window}</td>
                        <td class="px-4 py-3 font-semibold text-slate-900">${item.label}</td>
                        <td class="px-4 py-3 text-right">${item.wins}/${item.days}</td>
                        <td class="px-4 py-3 text-right">${percent(item.hitRate)}</td>
                        <td class="px-4 py-3 text-right">${nf.format(item.totalHits)}</td>
                        <td class="px-4 py-3 text-right font-bold ${item.profitK >= 0 ? 'text-emerald-600' : 'text-red-600'}">${money(item.profitK)}</td>
                        <td class="px-4 py-3 text-right">${percent(item.roi)}</td>
                    </tr>
                `);
            }
        }
        tbody.innerHTML = rows.join('') || '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-500">Chưa có backtest.</td></tr>';
    }

    function renderDaily(data) {
        const root = document.getElementById('dailyList');
        const rows = (data.recentDaily || []).slice().reverse().slice(0, 30);
        root.innerHTML = rows.map(row => {
            const method = row.methods?.top7 || row.methods?.top6 || row.methods?.top5 || {};
            const actual = Object.keys(row.actual || {}).sort().join(', ');
            return `
                <div class="p-4">
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <div class="font-bold text-slate-900">${row.date}</div>
                            <div class="text-xs text-slate-500">KQ: ${actual || '-'}</div>
                        </div>
                        <div class="text-right">
                            <div class="text-sm font-bold ${method.profitK >= 0 ? 'text-emerald-600' : 'text-red-600'}">${money(method.profitK)}</div>
                            <div class="text-xs text-slate-500">${method.hits || 0} hit</div>
                        </div>
                    </div>
                    <div class="mt-3 flex flex-wrap gap-1.5">
                        ${(method.betNumbers || []).map(number => numberBadge(number, 'slate')).join('')}
                    </div>
                </div>
            `;
        }).join('') || '<div class="p-4 text-sm text-slate-500">Chưa có nhật ký.</div>';
    }

    function renderLive(data) {
        const live = data.livePredictions || {};
        const summaryRoot = document.getElementById('liveSummary');
        const listRoot = document.getElementById('liveList');
        const summary = live.summary || {};
        summaryRoot.innerHTML = [5, 6, 7].map(count => {
            const item = summary[`top${count}`] || {};
            return `
                <div class="rounded-xl border border-amber-100 bg-white/70 p-4">
                    <div class="text-xs font-semibold uppercase text-slate-500">Top ${count} thực tế</div>
                    <div class="mt-2 text-2xl font-black text-slate-900">${item.days || 0} ngày</div>
                    <div class="mt-1 text-sm text-slate-600">Thắng ${item.wins || 0}/${item.days || 0} · ${percent(item.hitRate)}</div>
                    <div class="mt-1 text-sm font-bold ${(item.profitK || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}">${money(item.profitK)}</div>
                </div>
            `;
        }).join('');

        const rows = (live.predictions || []).slice().reverse();
        listRoot.innerHTML = rows.map(row => {
            const statusLabel = row.status === 'settled' ? 'Đã kết toán' : 'Chờ kết quả';
            const statusClass = row.status === 'settled'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200';
            const actual = row.actual ? Object.keys(row.actual).sort().join(', ') : '-';
            const top7 = row.predictions?.top7 || {};
            const method = row.methods?.top7 || {};
            return `
                <article class="p-4 ${row.status === 'pending' ? 'bg-amber-50/30' : 'bg-white/30'}">
                    <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="text-base font-black text-slate-900">${row.predictionIsoDate || row.predictionDate}</span>
                                <span class="rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass}">${statusLabel}</span>
                                <span class="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">THỰC TẾ</span>
                            </div>
                            <div class="mt-1 text-xs text-slate-500">Dựa trên dữ liệu đến ${row.dataIsoDate || row.dataDate || '-'}</div>
                            <div class="mt-1 text-xs text-slate-500">KQ: ${actual}</div>
                        </div>
                        <div class="text-left lg:text-right">
                            <div class="text-sm font-bold ${(method.profitK || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}">${row.status === 'settled' ? money(method.profitK) : 'Chưa kết toán'}</div>
                            <div class="text-xs text-slate-500">${row.status === 'settled' ? `${method.hits || 0} hit top7` : 'Sẽ tự đối soát khi có KQ'}</div>
                        </div>
                    </div>
                    <div class="mt-3 flex flex-wrap gap-2">
                        ${(top7.numbers || []).map(number => numberBadge(number, row.status === 'pending' ? 'amber' : 'slate')).join('')}
                    </div>
                </article>
            `;
        }).join('') || '<div class="p-4 text-sm text-slate-500">Chưa có dự đoán thực tế nào được lưu.</div>';
    }

    async function load() {
        const errorBox = document.getElementById('errorBox');
        try {
            const res = await fetch('/api/loto/prediction', { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Không tải được dữ liệu Lô.');
            errorBox.classList.add('hidden');
            renderMeta(data);
            renderPredictions(data);
            renderLive(data);
            renderSummary(data);
            renderDaily(data);
        } catch (error) {
            errorBox.textContent = error.message;
            errorBox.classList.remove('hidden');
        }
    }

    document.addEventListener('DOMContentLoaded', load);
})();
