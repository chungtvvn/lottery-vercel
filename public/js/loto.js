(function () {
    const nf = new Intl.NumberFormat('vi-VN');
    const state = {
        performancePeriod: 'monthly',
        performancePayload: null,
        performanceLoading: false,
        performanceVisible: false
    };

    function money(value) {
        const n = Number(value || 0);
        const sign = n > 0 ? '+' : '';
        return `${sign}${nf.format(n)}K`;
    }

    function asRatio(value) {
        const number = Number(value || 0);
        if (!Number.isFinite(number)) return 0;
        return Math.abs(number) > 1 ? number / 100 : number;
    }

    function percent(value) {
        return `${(asRatio(value) * 100).toLocaleString('vi-VN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}%`;
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

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function renderMeta(data) {
        const metaBox = document.getElementById('metaBox');
        const cfg = data.config || {};
        const next = data.nextPrediction || {};
        const methodLabel = cfg.methodName || data.livePredictions?.config?.methodName || next.methodName || next.methodId || cfg.methodId || '-';
        metaBox.innerHTML = [
            ['Ngày dữ liệu', data.latestDataDate || next.dataIsoDate || '-'],
            ['Ngày dự đoán', next.predictionDate || '-'],
            ['Vị trí', `${cfg.positionCount || 27} giải`],
            ['Phương pháp', methodLabel],
            ['Bộ chọn', cfg.aggregationMode || next.aggregationMode || '-'],
            ['Công thức', `${nf.format(cfg.stakePerNumberK || 2300)}K ăn ${nf.format(cfg.payoutPerHitK || 8000)}K`]
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
        root.innerHTML = [3, 4, 5, 6, 7].map(count => {
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

    function renderLive(data) {
        const live = data.livePredictions || {};
        const summaryRoot = document.getElementById('liveSummary');
        const listRoot = document.getElementById('liveList');
        const summary = live.summary || {};
        summaryRoot.innerHTML = [3, 4, 5, 6, 7].map(count => {
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
        const methodName = live.config?.methodName || data.config?.methodName || '';
        listRoot.innerHTML = rows.map(row => {
            const statusLabel = row.status === 'settled' ? 'Đã kết toán' : 'Chờ kết quả';
            const statusClass = row.status === 'settled'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200';
            const actual = row.actual ? Object.keys(row.actual).sort().join(', ') : '-';
            const top7 = row.predictions?.top7 || row.predictions?.top6 || row.predictions?.top5 || row.predictions?.top4 || row.predictions?.top3 || {};
            const method = row.methods?.top7 || row.methods?.top6 || row.methods?.top5 || row.methods?.top4 || row.methods?.top3 || {};
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
                            <div class="mt-1 text-xs font-semibold text-indigo-600">${methodName || row.methodId || '-'}</div>
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

    function getPeriodLabel(period) {
        return { daily: 'Ngày', weekly: 'Tuần', monthly: 'Tháng' }[period] || period;
    }

    function rowLabel(row, period = state.performancePeriod) {
        if (period === 'daily') return row.date || row.period || '-';
        if (period === 'weekly') return row.week || row.period || '-';
        return row.month || row.period || '-';
    }

    function getRowProfit(row = {}) {
        return Number(row.profitK ?? row.netProfitK ?? 0);
    }

    function renderPeriodTabs() {
        const root = document.getElementById('performancePeriodTabs');
        if (!root) return;
        if (!state.performanceVisible) {
            root.innerHTML = `
                <button type="button" id="showPerformanceReport"
                    class="rounded-xl bg-white px-5 py-2 text-sm font-black text-violet-700 shadow transition hover:bg-violet-50">
                    Xem thống kê
                </button>
            `;
            root.querySelector('#showPerformanceReport')?.addEventListener('click', () => {
                state.performanceVisible = true;
                loadPerformanceReport();
            });
            return;
        }
        root.innerHTML = ['daily', 'weekly', 'monthly'].map(period => `
            <button type="button" data-period="${period}"
                class="performance-period-btn rounded-xl px-4 py-2 transition ${state.performancePeriod === period
                    ? 'bg-white text-violet-700 shadow'
                    : 'text-violet-100 hover:bg-white/10'}">
                ${getPeriodLabel(period)}
            </button>
        `).join('') + `
            <button type="button" id="hidePerformanceReport"
                class="ml-1 rounded-xl px-4 py-2 text-violet-100 transition hover:bg-white/10">
                Ẩn
            </button>
        `;
        root.querySelectorAll('.performance-period-btn').forEach(button => {
            button.addEventListener('click', () => {
                state.performancePeriod = button.dataset.period || 'monthly';
                loadPerformanceReport();
            });
        });
        root.querySelector('#hidePerformanceReport')?.addEventListener('click', () => {
            state.performanceVisible = false;
            renderPerformanceReport();
        });
    }

    function renderProfitBars(rows = []) {
        const visible = rows.slice(-18);
        if (!visible.length) return '<div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Chưa có dữ liệu biểu đồ.</div>';
        const maxAbs = Math.max(1, ...visible.map(row => Math.abs(getRowProfit(row))));
        return `
            <div class="flex h-56 items-end gap-2 rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4">
                ${visible.map(row => {
                    const profit = getRowProfit(row);
                    const height = Math.max(8, Math.round(Math.abs(profit) / maxAbs * 160));
                    const positive = profit >= 0;
                    return `
                        <div class="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                            <div title="${escapeHtml(rowLabel(row))}: ${money(profit)}"
                                class="w-full rounded-t-lg ${positive ? 'bg-emerald-500' : 'bg-red-500'} shadow-sm transition group-hover:opacity-80"
                                style="height:${height}px"></div>
                            <div class="w-full truncate text-center text-[10px] font-semibold text-slate-400">${escapeHtml(rowLabel(row).replace(/^2026-/, ''))}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderCumulativeLine(rows = []) {
        if (!rows.length) return '<div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Chưa có dữ liệu tích lũy.</div>';
        let cumulative = 0;
        const values = rows.map(row => {
            cumulative += getRowProfit(row);
            return cumulative;
        });
        const width = 720;
        const height = 220;
        const pad = 24;
        const min = Math.min(0, ...values);
        const max = Math.max(0, ...values);
        const span = Math.max(1, max - min);
        const points = values.map((value, index) => {
            const x = pad + (index / Math.max(1, values.length - 1)) * (width - pad * 2);
            const y = pad + ((max - value) / span) * (height - pad * 2);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
        const zeroY = pad + ((max - 0) / span) * (height - pad * 2);
        const last = points.split(' ').pop() || `${width - pad},${pad}`;
        const [lastX, lastY] = last.split(',');
        return `
            <div class="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-3">
                <svg viewBox="0 0 ${width} ${height}" class="h-56 w-full" role="img" aria-label="Biểu đồ profit tích lũy">
                    <line x1="${pad}" x2="${width - pad}" y1="${zeroY}" y2="${zeroY}" stroke="rgba(255,255,255,0.18)" stroke-width="2" />
                    <polyline fill="none" stroke="#c084fc" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" points="${points}" />
                    <circle cx="${lastX}" cy="${lastY}" r="6" fill="#34d399" />
                </svg>
                <div class="flex justify-between px-2 text-xs font-semibold text-slate-300">
                    <span>${escapeHtml(rowLabel(rows[0]))}</span>
                    <span>Tích lũy: ${money(cumulative)}</span>
                    <span>${escapeHtml(rowLabel(rows[rows.length - 1]))}</span>
                </div>
            </div>
        `;
    }

    function renderPerformanceReport() {
        renderPeriodTabs();
        const root = document.getElementById('performanceReport');
        if (!root) return;
        if (!state.performanceVisible) {
            root.innerHTML = `
                <div class="rounded-2xl border border-dashed border-violet-200 bg-violet-50/60 p-5">
                    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <div class="text-sm font-black text-slate-950">Báo cáo hiệu quả Lô chỉ hiển thị khi người dùng yêu cầu</div>
                            <p class="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                                Đây là thống kê tham khảo/backtest theo cache đã sinh, tách biệt với nhật ký đánh thực tế. Bấm “Xem thống kê” để mở KPI, biểu đồ và bảng ngày/tuần/tháng.
                            </p>
                        </div>
                        <button type="button" id="showPerformanceReportInline"
                            class="inline-flex h-11 items-center justify-center rounded-xl bg-violet-600 px-5 text-sm font-black text-white shadow hover:bg-violet-700">
                            Xem thống kê
                        </button>
                    </div>
                </div>
            `;
            root.querySelector('#showPerformanceReportInline')?.addEventListener('click', () => {
                state.performanceVisible = true;
                loadPerformanceReport();
            });
            return;
        }
        if (state.performanceLoading) {
            root.innerHTML = '<div class="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">Đang tải báo cáo hiệu quả...</div>';
            return;
        }
        const section = state.performancePayload?.sections?.loto;
        if (!section) {
            root.innerHTML = '<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Chưa có cache hiệu quả Lô. Hãy chạy lại action cập nhật dữ liệu để sinh báo cáo mới.</div>';
            return;
        }
        const summary = section.summary || {};
        const rows = section.rows || [];
        const positive = Number(summary.profitK || 0) >= 0;
        const cards = [
            ['Số ngày', `${nf.format(summary.days || rows.length)} ngày`, 'Tổng ngày đã có kết quả để đối soát.'],
            ['Hit-day', percent(summary.hitRate), 'Ngày có ít nhất 1 số xuất hiện trong 27 giải.'],
            ['Win-day', percent(summary.winRate), 'Ngày đạt ngưỡng thắng theo công thức Lô hiện tại.'],
            ['Hit TB/ngày', Number(summary.avgHitsPerDay || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 }), 'Số hit trung bình mỗi ngày.'],
            ['Profit', money(summary.profitK), 'Lãi/lỗ ròng theo 2300K ăn 8000K.'],
            ['ROI', percent(summary.roi), 'Profit chia cho tổng tiền đánh.']
        ];
        root.innerHTML = `
            <div class="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div>
                    <div class="mb-4 flex flex-col gap-3 rounded-2xl border border-violet-100 bg-violet-50/70 p-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <div class="text-xs font-bold uppercase tracking-wide text-violet-600">Phương pháp đang đánh giá</div>
                            <div class="mt-1 text-xl font-black text-slate-950">${escapeHtml(section.label || section.methodId)}</div>
                            <p class="mt-2 text-sm leading-6 text-slate-600">${escapeHtml(section.explanation || '')}</p>
                        </div>
                        <div class="rounded-2xl border px-4 py-3 text-center ${section.assessment?.tone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}">
                            <div class="text-xs font-bold uppercase">Đánh giá</div>
                            <div class="mt-1 text-2xl font-black">${escapeHtml(section.assessment?.level || 'Theo dõi')}</div>
                        </div>
                    </div>
                    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        ${cards.map(([label, value, hint]) => `
                            <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div class="text-xs font-bold uppercase text-slate-500">${escapeHtml(label)}</div>
                                <div class="mt-2 text-2xl font-black ${label === 'Profit' ? (positive ? 'text-emerald-600' : 'text-red-600') : 'text-slate-950'}">${escapeHtml(value)}</div>
                                <div class="mt-1 text-xs leading-5 text-slate-500">${escapeHtml(hint)}</div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div class="text-sm font-bold text-slate-900">Nhận định vận hành</div>
                        <ul class="mt-2 space-y-1 text-sm leading-6 text-slate-600">
                            ${(section.assessment?.notes || []).map(note => `<li>• ${escapeHtml(note)}</li>`).join('')}
                            ${section.evaluation ? `<li>• ${escapeHtml(section.evaluation)}</li>` : ''}
                            <li>• Với Lô, cần ưu tiên độ đều theo tuần hơn là chỉ nhìn một vài ngày profit lớn.</li>
                        </ul>
                    </div>
                </div>
                <div class="grid gap-4">
                    <div>
                        <div class="mb-2 text-sm font-bold text-slate-900">Lãi/lỗ theo ${getPeriodLabel(state.performancePeriod).toLowerCase()}</div>
                        ${renderProfitBars(rows)}
                    </div>
                    <div>
                        <div class="mb-2 text-sm font-bold text-slate-900">Đường profit tích lũy</div>
                        ${renderCumulativeLine(rows)}
                    </div>
                </div>
            </div>
            <div class="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                <table class="min-w-full text-sm">
                    <thead class="bg-slate-100 text-xs font-bold uppercase text-slate-500">
                        <tr>
                            <th class="px-4 py-3 text-left">Kỳ</th>
                            <th class="px-4 py-3 text-right">Ngày</th>
                            <th class="px-4 py-3 text-right">Hit-day</th>
                            <th class="px-4 py-3 text-right">Hit</th>
                            <th class="px-4 py-3 text-right">Win-day</th>
                            <th class="px-4 py-3 text-right">Profit</th>
                            <th class="px-4 py-3 text-right">ROI</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 bg-white">
                        ${rows.slice(-36).reverse().map(row => {
                            const profit = getRowProfit(row);
                            return `
                                <tr>
                                    <td class="px-4 py-3 font-bold text-slate-900">${escapeHtml(rowLabel(row))}</td>
                                    <td class="px-4 py-3 text-right text-slate-600">${nf.format(row.days || 1)}</td>
                                    <td class="px-4 py-3 text-right text-slate-600">${nf.format(row.hitDays ?? 0)}</td>
                                    <td class="px-4 py-3 text-right text-slate-600">${nf.format(row.totalHits ?? row.hits ?? 0)}</td>
                                    <td class="px-4 py-3 text-right font-semibold text-slate-900">${nf.format(row.winDays ?? row.wins ?? 0)}</td>
                                    <td class="px-4 py-3 text-right font-black ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}">${money(profit)}</td>
                                    <td class="px-4 py-3 text-right font-semibold">${percent(row.roiPercent ?? row.roi ?? 0)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async function loadPerformanceReport() {
        if (!state.performanceVisible) {
            renderPerformanceReport();
            return;
        }
        state.performanceLoading = true;
        renderPerformanceReport();
        try {
            const period = encodeURIComponent(state.performancePeriod);
            const res = await fetch(`/api/performance-report?type=loto&period=${period}`, { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Không tải được báo cáo hiệu quả Lô.');
            state.performancePayload = data;
        } catch (error) {
            state.performancePayload = { sections: {} };
            console.error('[LotoPerformanceReport] Error:', error);
        } finally {
            state.performanceLoading = false;
            renderPerformanceReport();
        }
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
            renderPerformanceReport();
        } catch (error) {
            errorBox.textContent = error.message;
            errorBox.classList.remove('hidden');
            renderPerformanceReport();
        }
    }

    document.addEventListener('DOMContentLoaded', load);
})();
