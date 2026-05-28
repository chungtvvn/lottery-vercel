// public/js/prediction-history.js
(function () {
    const state = {
        history: [],
        selectedIndex: -1
    };

    function el(id) { return document.getElementById(id); }

    function formatMoney(amountK) {
        const amount = amountK * 1000;
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
            .format(amount)
            .replace('₫', 'K VND'); // Keep 'K' notation consistent
    }

    function formatProfit(profit) {
        if (profit === null || profit === undefined) return '<span class="text-slate-400">—</span>';
        const formatted = profit >= 0 ? `+${profit}K` : `${profit}K`;
        const colorClass = profit > 0 ? 'text-emerald-600 font-semibold' : (profit < 0 ? 'text-rose-600 font-semibold' : 'text-slate-600');
        return `<span class="${colorClass}">${formatted}</span>`;
    }

    function formatResultBadge(win, label) {
        if (win === null || win === undefined) {
            return `<span class="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-650">Chờ kết quả</span>`;
        }
        if (win) {
            return `<span class="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-250">${label} Thắng</span>`;
        } else {
            return `<span class="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-750 border border-rose-250">${label} Thua</span>`;
        }
    }

    function formatDateToDMY(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.substring(0, 10).split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateStr;
    }

    function setLoading(isLoading) {
        const spinner = el('runSpinner');
        const label = el('runLabel');
        if (isLoading) {
            spinner.classList.remove('hidden');
            label.textContent = 'Đang tải dữ liệu...';
        } else {
            spinner.classList.add('hidden');
            label.textContent = 'Lịch sử dự đoán';
        }
    }

    const cleanupExpiredCache = () => {
        const CACHE_PREFIX = 'ls_cache_';
        const CACHE_EXPIRY = 2 * 60 * 60 * 1000; // 2 hours
        const now = Date.now();
        try {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith(CACHE_PREFIX)) {
                    try {
                        const item = JSON.parse(localStorage.getItem(key));
                        if (item && item.timestamp && (now - item.timestamp > CACHE_EXPIRY)) {
                            localStorage.removeItem(key);
                            console.log(`[Cache Cleanup] Expired key removed: ${key}`);
                        }
                    } catch (e) {
                        localStorage.removeItem(key);
                    }
                }
            });
        } catch (e) {
            console.warn('LocalStorage access is blocked or full:', e);
        }
    };

    const fetchJSON = async (url) => {
        const CACHE_PREFIX = 'ls_cache_';
        const CACHE_EXPIRY = 2 * 60 * 60 * 1000; // 2 hours
        const cacheKey = `${CACHE_PREFIX}${url}`;
        
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const item = JSON.parse(cached);
                if (item && item.timestamp && (Date.now() - item.timestamp < CACHE_EXPIRY)) {
                    console.log(`[Cache Hit] ${url}`);
                    return item.data;
                } else {
                    localStorage.removeItem(cacheKey);
                }
            }
        } catch (e) {
            // Ignore cache error, fetch from network
        }

        console.log(`[Cache Miss] Fetching from network: ${url}`);
        const res = await fetch(url);
        if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.json();
        
        try {
            localStorage.setItem(cacheKey, JSON.stringify({
                timestamp: Date.now(),
                data: data
            }));
        } catch (e) {
            console.warn('Failed to save to localStorage:', e);
        }
        
        return data;
    };

    async function loadHistory() {
        setLoading(true);
        cleanupExpiredCache();
        try {
            const data = await fetchJSON('/api/prediction/history?limit=90&v=1');
            if (data && data.success && Array.isArray(data.history)) {
                state.history = data.history;
                renderDashboard();
            } else {
                showError((data && data.error) || 'Không thể tải lịch sử dự đoán.');
            }
        } catch (error) {
            showError('Lỗi kết nối máy chủ.');
        } finally {
            setLoading(false);
        }
    }

    function showError(msg) {
        const errorBox = el('errorBox');
        if (msg) {
            errorBox.textContent = msg;
            errorBox.classList.remove('hidden');
        } else {
            errorBox.classList.add('hidden');
        }
    }

    function renderDashboard() {
        showError('');
        const history = state.history;
        if (history.length === 0) {
            el('summarySection').classList.add('hidden');
            el('detailsSection').classList.add('hidden');
            el('errorBox').innerHTML = `
                <div class="text-center py-12 bg-white/50 rounded-2xl border border-slate-200 backdrop-blur">
                    <i class="bi bi-calendar-x text-slate-400 text-4xl mb-3 block"></i>
                    <p class="text-slate-650 font-medium">Chưa có lịch sử dự đoán được lưu trữ.</p>
                    <p class="text-xs text-slate-500 mt-1">Hệ thống tự động lưu khi có kết quả xổ số mới hàng ngày lúc 18:40.</p>
                </div>
            `;
            el('errorBox').classList.remove('hidden');
            return;
        }

        // Calculate aggregates for resolved runs
        const resolvedRuns = history.filter(r => r.summary?.resolved);
        const totalDays = resolvedRuns.length;

        let betWins = 0;
        let holdWins = 0;
        let totalBetProfit = 0;
        let totalHoldProfit = 0;
        let totalProfit = 0;

        resolvedRuns.forEach(r => {
            const sum = r.summary;
            if (sum.betWin) betWins++;
            if (sum.holdWin) holdWins++;
            totalBetProfit += sum.betProfit || 0;
            totalHoldProfit += sum.holdProfit || 0;
            totalProfit += sum.profit || 0;
        });

        // 1. Render Summary Cards
        const summarySection = el('summarySection');
        summarySection.classList.remove('hidden');
        
        const betWinRate = totalDays > 0 ? ((betWins / totalDays) * 100).toFixed(1) : '0.0';
        const holdWinRate = totalDays > 0 ? ((holdWins / totalDays) * 100).toFixed(1) : '0.0';

        summarySection.innerHTML = `
            <div class="glass-card p-5 border-l-4 border-indigo-500 bg-white/60">
                <div class="text-xs font-bold uppercase text-slate-500 tracking-wider">Tổng số ngày chơi</div>
                <div class="mt-2 text-3xl font-extrabold text-slate-900">${totalDays} <span class="text-xs font-normal text-slate-500">ngày đã kết toán</span></div>
                <div class="text-xs text-slate-450 mt-1.5">Số ngày chờ kết toán: ${history.length - totalDays} ngày</div>
            </div>
            <div class="glass-card p-5 border-l-4 border-emerald-500 bg-white/60">
                <div class="text-xs font-bold uppercase text-slate-500 tracking-wider">Chiến lược Đánh</div>
                <div class="mt-2 text-3xl font-extrabold text-slate-900">${betWinRate}% <span class="text-xs font-normal text-slate-500">(${betWins}/${totalDays} ngày thắng)</span></div>
                <div class="text-xs text-slate-550 mt-1.5">Lợi nhuận Đánh: ${formatProfit(totalBetProfit)}</div>
            </div>
            <div class="glass-card p-5 border-l-4 border-purple-500 bg-white/60">
                <div class="text-xs font-bold uppercase text-slate-500 tracking-wider">Chiến lược Ôm / Loại</div>
                <div class="mt-2 text-3xl font-extrabold text-slate-900">${holdWinRate}% <span class="text-xs font-normal text-slate-500">(${holdWins}/${totalDays} ngày thắng)</span></div>
                <div class="text-xs text-slate-550 mt-1.5">Lợi nhuận Ôm: ${formatProfit(totalHoldProfit)}</div>
            </div>
            <div class="glass-card p-5 border-l-4 border-amber-500 bg-white/60">
                <div class="text-xs font-bold uppercase text-slate-500 tracking-wider">Tổng lợi nhuận ròng</div>
                <div class="mt-2 text-3xl font-extrabold text-slate-900">${formatProfit(totalProfit)}</div>
                <div class="text-xs text-slate-500 mt-1.5">Đã trừ chiết khấu hoa hồng & phế</div>
            </div>
        `;

        // 2. Render Table and Details Side-by-side
        el('detailsSection').classList.remove('hidden');
        
        const detailsTable = el('detailsTable');
        detailsTable.innerHTML = '';

        history.forEach((run, idx) => {
            const sum = run.summary || {};
            const isToday = !sum.resolved;

            const dateStr = formatDateToDMY(run.predictionDate);
            const deStr = sum.resolved && sum.actualSpecial !== null ? String(sum.actualSpecial).padStart(2, '0') : '<span class="text-slate-450 font-bold animate-pulse">Chờ...</span>';
            const profitHtml = sum.resolved ? formatProfit(sum.profit) : '<span class="text-slate-450 font-medium">Chờ...</span>';

            const row = document.createElement('tr');
            row.className = `cursor-pointer hover:bg-indigo-50/40 transition border-b border-slate-100 ${state.selectedIndex === idx ? 'bg-indigo-50/60 font-semibold' : (isToday ? 'bg-amber-50/20' : 'bg-white/40')}`;
            row.innerHTML = `
                <td class="px-4 py-3.5 whitespace-nowrap font-medium text-slate-800">${dateStr} ${isToday ? '<span class="ml-1 text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold">Mới</span>' : ''}</td>
                <td class="px-4 py-3.5 text-center whitespace-nowrap"><span class="inline-block text-sm font-bold bg-slate-100 px-2.5 py-1 rounded-lg text-slate-900 border border-slate-200">${deStr}</span></td>
                <td class="px-4 py-3.5 whitespace-nowrap">
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-slate-500">${sum.betCount || 0} số</span>
                        ${sum.resolved ? formatResultBadge(sum.betWin, 'Đánh') : '<span class="text-xs text-slate-400">—</span>'}
                    </div>
                </td>
                <td class="px-4 py-3.5 whitespace-nowrap">
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-slate-500">${sum.excludedCount || 0} số</span>
                        ${sum.resolved ? formatResultBadge(sum.holdWin, 'Ôm') : '<span class="text-xs text-slate-400">—</span>'}
                    </div>
                </td>
                <td class="px-4 py-3.5 whitespace-nowrap text-right font-medium">${profitHtml}</td>
            `;
            row.addEventListener('click', () => {
                selectRow(idx);
            });
            detailsTable.appendChild(row);
        });

        // Select first row by default if not set
        if (state.selectedIndex === -1 && history.length > 0) {
            selectRow(0);
        } else {
            selectRow(state.selectedIndex);
        }
    }

    function selectRow(index) {
        if (index < 0 || index >= state.history.length) return;
        state.selectedIndex = index;
        
        // Update table row styling
        const rows = el('detailsTable').children;
        for (let i = 0; i < rows.length; i++) {
            const isToday = !state.history[i].summary?.resolved;
            rows[i].className = `cursor-pointer hover:bg-indigo-50/40 transition border-b border-slate-100 ${i === index ? 'bg-indigo-50/80 font-bold shadow-sm' : (isToday ? 'bg-amber-50/20' : 'bg-white/40')}`;
        }

        const run = state.history[index];
        const sum = run.summary || {};
        const dateStr = formatDateToDMY(run.predictionDate);

        // Render Details Sidebar
        const sidebar = el('methodDetail');
        
        let headerStatusHtml = '';
        if (!sum.resolved) {
            headerStatusHtml = `
                <div class="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-4 text-xs text-amber-800">
                    <i class="bi bi-clock-history mr-1.5 font-bold"></i> Dự báo đang hoạt động. Đang đợi kết quả quay thưởng lúc 18:30 ngày ${dateStr}.
                </div>
            `;
        } else {
            const profitText = sum.profit >= 0 ? `Lãi +${sum.profit}K` : `Lỗ ${sum.profit}K`;
            const profitBg = sum.profit > 0 ? 'bg-emerald-50 text-emerald-800 border-emerald-250' : (sum.profit < 0 ? 'bg-rose-50 text-rose-800 border-rose-250' : 'bg-slate-50 text-slate-800 border-slate-200');
            headerStatusHtml = `
                <div class="rounded-xl border p-4 mb-4 flex items-center justify-between shadow-sm ${profitBg}">
                    <div class="flex items-center gap-2.5">
                        <span class="text-3xl">🎯</span>
                        <div>
                            <div class="text-xs opacity-75 font-semibold">KẾT QUẢ ĐỀ: <span class="font-extrabold text-sm opacity-100">${String(sum.actualSpecial).padStart(2, '0')}</span></div>
                            <div class="text-[10px] opacity-75">Dựa trên kết quả draw ngày ${dateStr}</div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="font-extrabold text-base">${profitText}</div>
                        <div class="text-[9px] opacity-75">Đánh: ${sum.betWin?'Thắng':'Thua'} • Ôm: ${sum.holdWin?'Thắng':'Thua'}</div>
                    </div>
                </div>
            `;
        }

        // Render Number grids
        const renderNumberGrid = (numbers, colorClass) => {
            if (!numbers || numbers.length === 0) return '<div class="text-xs text-slate-400 italic">Không có số nào</div>';
            return `
                <div class="number-grid">
                    ${numbers.sort((a,b)=>a-b).map(n => {
                        const isHit = sum.resolved && Number(sum.actualSpecial) === Number(n);
                        const hitClass = isHit ? 'ring-4 ring-offset-1 ring-indigo-500 scale-105 font-black z-10' : '';
                        return `<span class="w-8.5 h-8.5 rounded-lg border text-center leading-8 text-[11px] font-bold shadow-sm transition ${colorClass} ${hitClass}">${String(n).padStart(2, '0')}</span>`;
                    }).join('')}
                </div>
            `;
        };

        // Render Explanations
        let explanationsHtml = '';
        if (sum.explanations && sum.explanations.length > 0) {
            explanationsHtml = sum.explanations.map(exp => {
                const badgeColor = exp.tier === 'red' ? 'bg-red-500' : 'bg-purple-600';
                return `
                    <div class="p-3 bg-white border border-slate-200 rounded-xl shadow-sm text-xs space-y-1.5">
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-slate-800 text-[12px]">${exp.title}</span>
                            <span class="text-[10px] text-white px-2 py-0.5 rounded-full font-bold ${badgeColor}">${exp.tier === 'red' ? 'Record' : 'Potential'}</span>
                        </div>
                        <p class="text-slate-650 leading-relaxed text-[11px]">${exp.reason}</p>
                        <div class="flex flex-wrap gap-1 mt-1">
                            ${(exp.numbers || []).map(n => `<span class="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold">${String(n).padStart(2, '0')}</span>`).join('')}
                        </div>
                    </div>
                `;
            }).join('<div class="h-2"></div>');
        } else {
            explanationsHtml = '<div class="text-xs text-slate-500 italic">Không có chuỗi loại trừ kích hoạt trong ngày này.</div>';
        }

        sidebar.innerHTML = `
            <div class="space-y-5">
                <div>
                    <h3 class="text-base font-bold text-slate-900">Chi tiết ngày ${dateStr}</h3>
                    <p class="text-xs text-slate-500 mt-0.5">Dựa trên kết quả thống kê của ngày trước đó</p>
                </div>

                ${headerStatusHtml}

                <div class="border-t border-slate-100 pt-3">
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider">Số Đánh (${sum.betCount || 0} số)</h4>
                        <span class="text-[10px] text-slate-500">Mua tỷ lệ 80% (ăn 70)</span>
                    </div>
                    ${renderNumberGrid(sum.numbersToBet, 'border-emerald-200 bg-emerald-50/50 text-emerald-700')}
                </div>

                <div class="border-t border-slate-100 pt-3">
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider">Số Ôm / Loại trừ (${sum.excludedCount || 0} số)</h4>
                        <span class="text-[10px] text-slate-500">Giữ tỷ lệ 70.5% (đền 70)</span>
                    </div>
                    ${renderNumberGrid(sum.excludedNumbers, 'border-red-200 bg-red-50/50 text-red-700')}
                </div>

                <div class="border-t border-slate-100 pt-3">
                    <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Các chuỗi kích hoạt</h4>
                    <div class="space-y-2 overflow-y-auto max-h-[300px] pr-1 custom-scrollbar">
                        ${explanationsHtml}
                    </div>
                </div>
            </div>
        `;
    }

    // Initialize Page
    document.addEventListener('DOMContentLoaded', () => {
        loadHistory();
    });
})();
