/**
 * public/js/xien-fusion.js
 * 
 * Client Script: Đối soát & Dự đoán Dàn Xiên Ghép Tổng Hợp (Fusion Engine)
 * So sánh trực diện 3 phương án:
 *   1. Daily Advisor cũ (2 dàn - 22M/ngày)
 *   2. Shadow Monitor cũ (2 dàn - 22M/ngày)
 *   3. 4 Dàn Ghép Mới (4 dàn - 44M/ngày)
 * Kèm danh sách các Cặp Xiên 2 Tổng Hợp.
 */

(function () {
    'use strict';

    const state = {
        payload: null,
        filter: 'all',
        fromDate: null,
        toDate: null,
        expandedDays: new Set(),
        showPairsForDate: null
    };

    // -------------------------------------------------------------------------
    // HELPERS: Format tiền tệ & Toast
    // -------------------------------------------------------------------------
    function formatMoney(amountK, { signed = true } = {}) {
        if (amountK === undefined || amountK === null || isNaN(amountK)) return '--';
        const num = Number(amountK);
        const absVal = Math.abs(num);
        const sign = num > 0 ? (signed ? '+' : '') : (num < 0 ? '-' : '');

        if (absVal >= 1000) {
            const valM = (absVal / 1000).toFixed(1);
            return `${sign}${valM}M`;
        }
        return `${sign}${absVal}K`;
    }

    function showToast(message) {
        const toast = document.getElementById('toast');
        const msgEl = document.getElementById('toastMsg');
        if (!toast || !msgEl) return;
        msgEl.textContent = message;
        toast.classList.remove('translate-y-16', 'opacity-0');
        setTimeout(() => {
            toast.classList.add('translate-y-16', 'opacity-0');
        }, 2200);
    }

    function copyToClipboard(text, successMsg = 'Đã sao chép vào bộ nhớ tạm!') {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                showToast(successMsg);
            }).catch(() => fallbackCopy(text, successMsg));
        } else {
            fallbackCopy(text, successMsg);
        }
    }

    function fallbackCopy(text, successMsg) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showToast(successMsg);
        } catch (e) {
            alert('Vui lòng sao chép thủ công:\n' + text);
        }
        document.body.removeChild(textarea);
    }

    // -------------------------------------------------------------------------
    // 1. RENDER: 3 CARD TỔNG HỢP HEAD-TO-HEAD
    // -------------------------------------------------------------------------
    function renderSummaryCards(summary) {
        const container = document.getElementById('summaryCardsContainer');
        if (!container || !summary) return;

        const { daily, shadow, fusion, totalDays } = summary;

        const cards = [
            {
                key: 'daily',
                title: '👑 Daily Advisor (2 Dàn Cũ)',
                subTitle: 'Top 8 Parity chẵn lẻ',
                data: daily,
                borderClass: 'border-slate-300 bg-white hover:border-slate-400',
                badgeBg: 'bg-slate-100 text-slate-800',
                isHighlight: false,
                dailyStake: '22M/ngày (2 dàn × 11M)'
            },
            {
                key: 'shadow',
                title: '🔬 Shadow Monitor (2 Dàn Cũ)',
                subTitle: 'Penta Consensus Top 8',
                data: shadow,
                borderClass: 'border-indigo-200 bg-indigo-50/30 hover:border-indigo-300',
                badgeBg: 'bg-indigo-100 text-indigo-900',
                isHighlight: false,
                dailyStake: '22M/ngày (2 dàn × 11M)'
            },
            {
                key: 'fusion',
                title: '⚡ Bộ Đôi Ghép Tinh Hoa (1A + 2A)',
                subTitle: 'Daily D1 đầu + Shadow S1 đầu & D2 + S2',
                data: fusion,
                borderClass: 'border-2 border-amber-400 bg-gradient-to-br from-amber-500/10 via-orange-50/40 to-white ring-2 ring-amber-300/50 shadow-md',
                badgeBg: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black',
                isHighlight: true,
                dailyStake: '22M/ngày (2 dàn × 11M)'
            }
        ];

        container.innerHTML = cards.map(c => {
            const d = c.data || {};
            const isProfit = (d.profitK || 0) >= 0;
            const profitColor = isProfit ? 'text-emerald-700' : 'text-rose-600';
            const roiColor = (d.roi || 0) >= 0 ? 'text-emerald-700' : 'text-rose-600';

            return `
                <div class="rounded-3xl p-5 sm:p-6 transition-all flex flex-col justify-between ${c.borderClass}">
                    <div>
                        <div class="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-3 mb-4">
                            <div>
                                <h3 class="text-base font-black text-slate-900 flex items-center gap-1.5">
                                    <span>${c.title}</span>
                                </h3>
                                <p class="text-xs text-slate-500">${c.subTitle}</p>
                            </div>
                            <span class="rounded-full px-2.5 py-0.5 text-[10px] font-bold ${c.badgeBg}">
                                ${c.isHighlight ? 'FUSION VIP' : 'DÀN CŨ'}
                            </span>
                        </div>

                        <!-- Vốn / Thưởng / Lãi Net -->
                        <div class="space-y-3 mb-5">
                            <div class="flex items-center justify-between text-xs">
                                <span class="text-slate-500">Mức cược ngày:</span>
                                <span class="font-mono font-bold text-slate-800">${c.dailyStake}</span>
                            </div>
                            <div class="flex items-center justify-between text-xs">
                                <span class="text-slate-500">Tổng Vốn (${totalDays} kỳ):</span>
                                <span class="font-mono font-bold text-slate-800">${formatMoney(d.stakeK, { signed: false })}</span>
                            </div>
                            <div class="flex items-center justify-between text-xs">
                                <span class="text-slate-500">Tổng Tiền Thưởng:</span>
                                <span class="font-mono font-bold text-emerald-700">${formatMoney(d.payoutK, { signed: false })}</span>
                            </div>
                            <div class="p-3 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between">
                                <span class="text-xs font-bold text-slate-700">LÃI RÒNG NET:</span>
                                <span class="text-base font-black font-mono ${profitColor}">${formatMoney(d.profitK)}</span>
                            </div>
                        </div>

                        <!-- Tỉ Lệ ROI & Ngày Dương -->
                        <div class="grid grid-cols-2 gap-2 text-center text-xs mb-4">
                            <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                                <span class="text-[10px] text-slate-400 block uppercase font-bold">ROI Lũy Kế</span>
                                <span class="font-mono font-black ${roiColor} text-sm">${d.roi > 0 ? '+' : ''}${d.roi}%</span>
                            </div>
                            <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                                <span class="text-[10px] text-slate-400 block uppercase font-bold">Ngày Dương (Win)</span>
                                <span class="font-mono font-black text-slate-800 text-sm">${d.wins}/${totalDays} (${d.winRate}%)</span>
                            </div>
                        </div>
                    </div>

                    <!-- Hit Counts: X4, X3, X2 -->
                    <div class="pt-3 border-t border-slate-200/80 flex items-center justify-around text-center text-xs">
                        <div>
                            <span class="text-[10px] text-slate-400 block uppercase font-bold">Nổ X4 (384M)</span>
                            <span class="font-mono font-black ${d.h4 > 0 ? 'text-amber-600' : 'text-slate-400'} text-sm">${d.h4} lần</span>
                        </div>
                        <div class="border-x border-slate-200 px-3">
                            <span class="text-[10px] text-slate-400 block uppercase font-bold">Nổ X3 (84M)</span>
                            <span class="font-mono font-black ${d.h3 > 0 ? 'text-emerald-700' : 'text-slate-400'} text-sm">${d.h3} lần</span>
                        </div>
                        <div>
                            <span class="text-[10px] text-slate-400 block uppercase font-bold">Nổ X2 (12M)</span>
                            <span class="font-mono font-black ${d.h2 > 0 ? 'text-indigo-700' : 'text-slate-400'} text-sm">${d.h2} lần</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // -------------------------------------------------------------------------
    // 2. RENDER: BẢNG SO SÁNH TRỰC DIỆN CHI TIẾT
    // -------------------------------------------------------------------------
    function renderComparisonTable(summary) {
        const tbody = document.getElementById('comparisonTableBody');
        if (!tbody || !summary) return;

        const { daily, shadow, fusion, totalDays } = summary;

        const rows = [
            {
                name: '👑 Daily Advisor (2 Dàn Cũ)',
                dansCount: 2,
                dailyStake: '22M',
                totalStake: daily.stakeK,
                totalPayout: daily.payoutK,
                profit: daily.profitK,
                roi: daily.roi,
                winRateStr: `${daily.wins}/${totalDays} (${daily.winRate}%)`,
                h4: daily.h4,
                h3: daily.h3,
                h2: daily.h2,
                rowClass: 'hover:bg-slate-50'
            },
            {
                name: '🔬 Shadow Monitor (2 Dàn Cũ)',
                dansCount: 2,
                dailyStake: '22M',
                totalStake: shadow.stakeK,
                totalPayout: shadow.payoutK,
                profit: shadow.profitK,
                roi: shadow.roi,
                winRateStr: `${shadow.wins}/${totalDays} (${shadow.winRate}%)`,
                h4: shadow.h4,
                h3: shadow.h3,
                h2: shadow.h2,
                rowClass: 'hover:bg-indigo-50/30'
            },
            {
                name: '⚡ Bộ Đôi Ghép Tinh Hoa (Dàn 1A + 2A)',
                dansCount: 2,
                dailyStake: '22M',
                totalStake: fusion.stakeK,
                totalPayout: fusion.payoutK,
                profit: fusion.profitK,
                roi: fusion.roi,
                winRateStr: `${fusion.wins}/${totalDays} (${fusion.winRate}%)`,
                h4: fusion.h4,
                h3: fusion.h3,
                h2: fusion.h2,
                rowClass: 'bg-amber-50/60 font-black hover:bg-amber-50'
            }
        ];

        tbody.innerHTML = rows.map(r => {
            const isProfit = r.profit >= 0;
            const profitColor = isProfit ? 'text-emerald-700' : 'text-rose-600';
            const roiColor = r.roi >= 0 ? 'text-emerald-700' : 'text-rose-600';

            return `
                <tr class="${r.rowClass} transition-colors">
                    <td class="p-3.5 font-bold text-slate-900">${r.name}</td>
                    <td class="p-3.5 text-center">${r.dansCount} dàn</td>
                    <td class="p-3.5 text-center font-bold">${r.dailyStake}</td>
                    <td class="p-3.5 text-center text-slate-700">${formatMoney(r.totalStake, { signed: false })}</td>
                    <td class="p-3.5 text-center text-emerald-700 font-bold">${formatMoney(r.totalPayout, { signed: false })}</td>
                    <td class="p-3.5 text-center font-black ${profitColor}">${formatMoney(r.profit)}</td>
                    <td class="p-3.5 text-center font-bold ${roiColor}">${r.roi > 0 ? '+' : ''}${r.roi}%</td>
                    <td class="p-3.5 text-center">${r.winRateStr}</td>
                    <td class="p-3.5 text-center ${r.h4 > 0 ? 'text-amber-600 font-black' : 'text-slate-400'}">${r.h4}</td>
                    <td class="p-3.5 text-center ${r.h3 > 0 ? 'text-emerald-700 font-black' : 'text-slate-400'}">${r.h3}</td>
                    <td class="p-3.5 text-center ${r.h2 > 0 ? 'text-indigo-700 font-black' : 'text-slate-400'}">${r.h2}</td>
                </tr>
            `;
        }).join('');
    }

    // -------------------------------------------------------------------------
    // 3. RENDER: DỰ ĐOÁN 4 DÀN GHÉP HÔM NAY (PENDING)
    // -------------------------------------------------------------------------
    function renderPendingPrediction(todayPending) {
        const container = document.getElementById('pendingCardContent');
        const badge = document.getElementById('pendingDateBadge');
        if (!container) return;

        if (!todayPending) {
            if (badge) badge.textContent = 'Chưa có dự đoán mới';
            container.innerHTML = `
                <div class="rounded-3xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
                    Hiện chưa có dữ liệu dự đoán chờ quay mới. Hệ thống sẽ tự động cập nhật khi có dàn chốt.
                </div>
            `;
            return;
        }

        const { targetDate, daily, shadow, fusion } = todayPending;
        if (badge) badge.textContent = targetDate;

        const dans = fusion?.dans || [];
        const xien2Pairs = fusion?.xien2Pairs || [];

        container.innerHTML = `
            <div class="rounded-3xl border-2 border-amber-400 bg-gradient-to-br from-amber-50/40 via-white to-orange-50/30 p-5 sm:p-6 shadow-sm space-y-6">
                <!-- Thông báo quy tắc cược -->
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-amber-100/70 border border-amber-300 p-3.5 rounded-2xl text-xs text-amber-950">
                    <div class="flex items-center gap-2">
                        <i class="bi bi-info-circle-fill text-amber-700 text-base"></i>
                        <span><strong>Quy chuẩn thể thức:</strong> Đánh Bộ Đôi Ghép Tinh Hoa (Dàn 1A & 2A), mỗi dàn 4 số theo hình thức Quây 11 vé (11M/dàn). Tổng vốn 22M/ngày (cân bằng 1:1 với Daily và Shadow).</span>
                    </div>
                    <span class="font-mono font-black text-amber-900 bg-amber-200/90 px-3 py-1 rounded-xl shrink-0 text-center">
                        Ăn 4: 384M · Ăn 3: 84M · Ăn 2: 12M
                    </span>
                </div>

                <!-- 2 DÀN GHÉP FUSION MỚI (GRID 2 CỘT) -->
                <div>
                    <h3 class="text-xs font-black uppercase text-amber-950 tracking-wide mb-3 flex items-center gap-2">
                        <span class="h-2 w-2 rounded-full bg-amber-500"></span>
                        <span>2 DÀN XIÊN 4 GHÉP TINH HOA THỰC CHIẾN NGÀY ${targetDate}:</span>
                    </h3>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${dans.map((d, idx) => `
                            <div class="rounded-2xl border-2 border-amber-300 bg-white p-5 space-y-3 shadow-2xs hover:border-amber-400 transition-all flex flex-col justify-between">
                                <div class="space-y-1.5">
                                    <div class="flex items-center justify-between">
                                        <span class="rounded bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 px-2.5 py-0.5 text-xs font-black shadow-2xs">
                                            DÀN ${d.id}
                                        </span>
                                        <span class="font-mono text-amber-900 text-xs font-bold">11M / Quây 11 vé</span>
                                    </div>
                                    <p class="text-xs text-slate-600 font-bold">${d.name}</p>
                                </div>

                                <div class="flex flex-wrap gap-2.5 pt-2">
                                    ${d.numbers.map(n => `
                                        <span class="badge-number flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-200 via-amber-300 to-yellow-400 border border-amber-400 font-mono font-black text-base text-slate-950 shadow-2xs" title="Số: ${n}">
                                            ${n}
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- DANH SÁCH TOÀN BỘ CẶP XIÊN 2 TỔNG HỢP -->
                <div class="pt-4 border-t border-slate-200/80 space-y-3">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="h-2 w-2 rounded-full bg-indigo-500"></span>
                            <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wide">
                                DÀN XIÊN 2 TỔNG HỢP (${xien2Pairs.length} CẶP TỪ DÀN 1A & 2A):
                            </h4>
                        </div>
                        <span class="text-[11px] text-slate-500 font-mono">Tổ hợp chập 2 từ 1A & 2A</span>
                    </div>

                    <div class="flex flex-wrap gap-2">
                        ${xien2Pairs.map(p => `
                            <span class="badge-number inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-800 font-mono text-xs font-bold shadow-2xs hover:border-amber-400" title="Xuất hiện trong: ${p.sources.join(', ')}">
                                <span>${p.pair[0]} - ${p.pair[1]}</span>
                                <span class="text-[9px] font-sans text-slate-400 bg-slate-100 px-1 rounded">${p.sources.length}d</span>
                            </span>
                        `).join('')}
                    </div>
                </div>

                <!-- ACCORDION ĐỐI CHIẾU DÀN GỐC (DAILY & SHADOW) -->
                <details class="pt-2 border-t border-slate-200/80 group">
                    <summary class="cursor-pointer text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center justify-between py-1">
                        <span>🔍 Xem Đối Chiếu 2 Dàn Daily Cũ & 2 Dàn Shadow Cũ</span>
                        <i class="bi bi-chevron-down group-open:rotate-180 transition-transform"></i>
                    </summary>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 pt-2">
                        <!-- Daily Cũ -->
                        <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                            <div class="flex items-center justify-between text-xs font-bold text-slate-800">
                                <span>👑 Daily Advisor (2 Dàn Cũ):</span>
                                <span class="font-mono text-[10px] text-slate-500">Vốn 22M</span>
                            </div>
                            <div class="space-y-1 font-mono text-xs">
                                <div>Dàn 1: <strong class="text-slate-900">${(daily?.dan1 || []).join(' - ')}</strong></div>
                                <div>Dàn 2: <strong class="text-slate-900">${(daily?.dan2 || []).join(' - ')}</strong></div>
                            </div>
                        </div>

                        <!-- Shadow Cũ -->
                        <div class="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-200 space-y-2">
                            <div class="flex items-center justify-between text-xs font-bold text-indigo-900">
                                <span>🔬 Shadow Monitor (2 Dàn Cũ):</span>
                                <span class="font-mono text-[10px] text-indigo-600">Vốn 22M</span>
                            </div>
                            <div class="space-y-1 font-mono text-xs">
                                <div>Dàn 1: <strong class="text-indigo-950">${(shadow?.dan1 || []).join(' - ')}</strong></div>
                                <div>Dàn 2: <strong class="text-indigo-950">${(shadow?.dan2 || []).join(' - ')}</strong></div>
                            </div>
                        </div>
                    </div>
                </details>
            </div>
        `;

        // Gắn sự kiện nút Copy
        const copyFusionBtn = document.getElementById('copyFusionBtn');
        if (copyFusionBtn && (fusion?.copyTextFusion || fusion?.copyText)) {
            const textToCopy = fusion.copyTextFusion || fusion.copyText;
            copyFusionBtn.onclick = () => copyToClipboard(textToCopy, 'Đã copy Bộ Đôi Xiên Ghép 1A + 2A!');
        }

        const copyPairsBtn = document.getElementById('copyPairsBtn');
        if (copyPairsBtn && fusion?.copyTextPairs) {
            copyPairsBtn.onclick = () => copyToClipboard(fusion.copyTextPairs, 'Đã copy tất cả các cặp Xiên 2 từ 1A & 2A!');
        }
    }

    // -------------------------------------------------------------------------
    // 4. RENDER: NHẬT KÝ ĐỐI SOÁT LỊCH SỬ TỪNG NGÀY
    // -------------------------------------------------------------------------
    function renderHistoryJournal(history, filter = 'all') {
        const container = document.getElementById('historyListContainer');
        if (!container) return;

        if (!history || !history.length) {
            container.innerHTML = '<div class="p-8 text-center text-xs text-slate-400">Chưa có dữ liệu lịch sử đối soát.</div>';
            return;
        }

        const allDates = (history || []).map(d => d.date).sort();
        const minAvailableDate = allDates[0] || '2026-01-01';
        const maxAvailableDate = allDates[allDates.length - 1] || '2026-12-31';

        // Mặc định toDate luôn là ngày mới nhất
        if (!state.toDate) state.toDate = maxAvailableDate;
        if (!state.fromDate) state.fromDate = minAvailableDate;

        const xFromInp = document.getElementById('xienFusionFromDate');
        const xToInp = document.getElementById('xienFusionToDate');
        const xInfoEl = document.getElementById('xienFusionDateRangeInfo');
        if (xFromInp) {
            xFromInp.min = minAvailableDate;
            xFromInp.max = maxAvailableDate;
            xFromInp.value = state.fromDate;
        }
        if (xToInp) {
            xToInp.min = minAvailableDate;
            xToInp.max = maxAvailableDate;
            xToInp.value = state.toDate;
        }
        if (xInfoEl) {
            xInfoEl.textContent = `(Xem từ ${state.fromDate} đến ${state.toDate} · Mặc định đến hôm nay)`;
        }

        // Lọc theo khoảng ngày
        const rangeFiltered = history.filter(day => {
            if (state.fromDate && day.date < state.fromDate) return false;
            if (state.toDate && day.date > state.toDate) return false;
            return true;
        });

        // Tính toán lũy kế động theo thứ tự tăng dần thời gian (ASC: cũ đến mới)
        const sortedAsc = [...rangeFiltered].sort((a, b) => a.date.localeCompare(b.date));
        let cumFusionK = 0, cumDailyK = 0, cumShadowK = 0;
        const cumMapByDate = {};
        sortedAsc.forEach(day => {
            cumFusionK += (day.fusion?.profitK || 0);
            cumDailyK += (day.daily?.profitK || 0);
            cumShadowK += (day.shadow?.profitK || 0);
            cumMapByDate[day.date] = { cumFusionK, cumDailyK, cumShadowK };
        });

        // Lọc danh sách theo filter
        const filtered = rangeFiltered.filter(day => {
            if (filter === 'fusion_win') return (day.fusion?.profitK || 0) > 0;
            if (filter === 'daily_win') return (day.daily?.profitK || 0) > 0;
            if (filter === 'shadow_win') return (day.shadow?.profitK || 0) > 0;
            if (filter === 'h3_h4') {
                return (day.fusion?.dans || []).some(d => d.hits >= 3);
            }
            return true;
        });

        if (!filtered.length) {
            container.innerHTML = '<div class="p-8 text-center text-xs text-slate-400">Không có ngày nào khớp với bộ lọc và khoảng ngày đã chọn.</div>';
            return;
        }

        container.innerHTML = filtered.map(day => {
            const { date, special, prizes27, daily, shadow, fusion } = day;
            const actSet = new Set(prizes27 || []);

            const isFusionWin = (fusion?.profitK || 0) > 0;
            const isDailyWin = (daily?.profitK || 0) > 0;
            const isShadowWin = (shadow?.profitK || 0) > 0;

            const fusionProfitColor = isFusionWin ? 'text-emerald-700' : 'text-rose-600';
            const dailyProfitColor = isDailyWin ? 'text-emerald-700' : 'text-rose-600';
            const shadowProfitColor = isShadowWin ? 'text-emerald-700' : 'text-rose-600';

            const fusionCardBorder = isFusionWin
                ? 'border-2 border-emerald-400/80 bg-gradient-to-b from-emerald-50/40 via-white to-white'
                : 'border border-slate-200 bg-white';

            const dayCum = cumMapByDate[date] || {
                cumFusionK: fusion?.cumProfitK || 0,
                cumDailyK: daily?.cumProfitK || 0,
                cumShadowK: shadow?.cumProfitK || 0
            };

            return `
                <article class="rounded-3xl p-5 sm:p-6 shadow-sm space-y-4 ${fusionCardBorder}">
                    <!-- Header Ngày Đối Soát & Kết quả ĐB / 27 Giải -->
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-3">
                        <div class="flex flex-wrap items-center gap-2.5">
                            <span class="rounded-xl bg-slate-900 text-white font-mono font-black text-xs px-3 py-1.5 shadow-2xs">
                                📅 ${date}
                            </span>
                            <span class="rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-mono font-bold px-2.5 py-1">
                                ĐB: <strong class="text-rose-700 font-black">${special || '--'}</strong>
                            </span>
                            <span class="text-xs text-slate-400 font-mono">
                                27 giải Lô (${(prizes27 || []).length} nháy)
                            </span>
                        </div>

                        <!-- Badge Kết Quả Fusion -->
                        <div class="flex items-center gap-2">
                            <span class="rounded-xl px-3 py-1 text-xs font-mono font-black ${isFusionWin ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-600'}">
                                ${isFusionWin ? `🔥 FUSION THẮNG (${formatMoney(fusion?.profitK)})` : `❌ FUSION (-22M)`}
                            </span>
                        </div>
                    </div>

                    <!-- 3 CỘT SO SÁNH THỰC CHIẾN CỦA NGÀY NÀY -->
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
                        
                        <!-- CỘT 1: DAILY CŨ (2 DÀN · 22M) -->
                        <div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3 flex flex-col justify-between">
                            <div class="space-y-2">
                                <div class="flex items-center justify-between text-xs font-bold text-slate-800 border-b border-slate-200 pb-2">
                                    <span class="flex items-center gap-1">
                                        <span>👑 Daily Cũ (2 Dàn)</span>
                                    </span>
                                    <span class="font-mono font-black ${dailyProfitColor}">
                                        ${formatMoney(daily?.profitK)}
                                    </span>
                                </div>

                                <!-- Dàn 1 Daily -->
                                <div class="space-y-1 text-xs">
                                    <div class="flex items-center justify-between text-[11px] text-slate-500">
                                        <span>Dàn 1 (${daily?.dan1?.hits || 0}/4 con):</span>
                                        <span class="font-mono ${daily?.dan1?.hits >= 2 ? 'text-emerald-700 font-bold' : 'text-slate-400'}">
                                            Ăn ${formatMoney(daily?.dan1?.payoutK, { signed: false })}
                                        </span>
                                    </div>
                                    <div class="flex flex-wrap gap-1">
                                        ${(daily?.dan1?.dan || []).map(n => {
                                            const isHit = actSet.has(String(n).padStart(2, '0'));
                                            return `
                                                <span class="px-2 py-0.5 rounded font-mono text-xs font-bold ${isHit ? 'bg-emerald-500 text-white ring-1 ring-emerald-300' : 'bg-white border border-slate-200 text-slate-600'}">
                                                    ${n}
                                                </span>
                                            `;
                                        }).join('')}
                                    </div>
                                </div>

                                <!-- Dàn 2 Daily -->
                                <div class="space-y-1 text-xs pt-1 border-t border-slate-200/60">
                                    <div class="flex items-center justify-between text-[11px] text-slate-500">
                                        <span>Dàn 2 (${daily?.dan2?.hits || 0}/4 con):</span>
                                        <span class="font-mono ${daily?.dan2?.hits >= 2 ? 'text-emerald-700 font-bold' : 'text-slate-400'}">
                                            Ăn ${formatMoney(daily?.dan2?.payoutK, { signed: false })}
                                        </span>
                                    </div>
                                    <div class="flex flex-wrap gap-1">
                                        ${(daily?.dan2?.dan || []).map(n => {
                                            const isHit = actSet.has(String(n).padStart(2, '0'));
                                            return `
                                                <span class="px-2 py-0.5 rounded font-mono text-xs font-bold ${isHit ? 'bg-emerald-500 text-white ring-1 ring-emerald-300' : 'bg-white border border-slate-200 text-slate-600'}">
                                                    ${n}
                                                </span>
                                            `;
                                        }).join('')}
                                    </div>
                                </div>
                            </div>

                            <div class="pt-2 border-t border-slate-200 text-[11px] font-mono flex items-center justify-between text-slate-500">
                                <span>Vốn: 22M · Ăn: ${formatMoney(daily?.payoutK, { signed: false })}</span>
                                <span>Lũy kế: <strong class="${dayCum.cumDailyK >= 0 ? 'text-emerald-700' : 'text-rose-600'}">${formatMoney(dayCum.cumDailyK)}</strong></span>
                            </div>
                        </div>

                        <!-- CỘT 2: SHADOW CŨ (2 DÀN · 22M) -->
                        <div class="rounded-2xl border border-indigo-200 bg-indigo-50/30 p-4 space-y-3 flex flex-col justify-between">
                            <div class="space-y-2">
                                <div class="flex items-center justify-between text-xs font-bold text-indigo-900 border-b border-indigo-200/60 pb-2">
                                    <span class="flex items-center gap-1">
                                        <span>🔬 Shadow Cũ (2 Dàn)</span>
                                    </span>
                                    <span class="font-mono font-black ${shadowProfitColor}">
                                        ${formatMoney(shadow?.profitK)}
                                    </span>
                                </div>

                                <!-- Dàn 1 Shadow -->
                                <div class="space-y-1 text-xs">
                                    <div class="flex items-center justify-between text-[11px] text-slate-500">
                                        <span>Dàn 1 (${shadow?.dan1?.hits || 0}/4 con):</span>
                                        <span class="font-mono ${shadow?.dan1?.hits >= 2 ? 'text-emerald-700 font-bold' : 'text-slate-400'}">
                                            Ăn ${formatMoney(shadow?.dan1?.payoutK, { signed: false })}
                                        </span>
                                    </div>
                                    <div class="flex flex-wrap gap-1">
                                        ${(shadow?.dan1?.dan || []).map(n => {
                                            const isHit = actSet.has(String(n).padStart(2, '0'));
                                            return `
                                                <span class="px-2 py-0.5 rounded font-mono text-xs font-bold ${isHit ? 'bg-emerald-500 text-white ring-1 ring-emerald-300' : 'bg-white border border-slate-200 text-slate-600'}">
                                                    ${n}
                                                </span>
                                            `;
                                        }).join('')}
                                    </div>
                                </div>

                                <!-- Dàn 2 Shadow -->
                                <div class="space-y-1 text-xs pt-1 border-t border-indigo-100">
                                    <div class="flex items-center justify-between text-[11px] text-slate-500">
                                        <span>Dàn 2 (${shadow?.dan2?.hits || 0}/4 con):</span>
                                        <span class="font-mono ${shadow?.dan2?.hits >= 2 ? 'text-emerald-700 font-bold' : 'text-slate-400'}">
                                            Ăn ${formatMoney(shadow?.dan2?.payoutK, { signed: false })}
                                        </span>
                                    </div>
                                    <div class="flex flex-wrap gap-1">
                                        ${(shadow?.dan2?.dan || []).map(n => {
                                            const isHit = actSet.has(String(n).padStart(2, '0'));
                                            return `
                                                <span class="px-2 py-0.5 rounded font-mono text-xs font-bold ${isHit ? 'bg-emerald-500 text-white ring-1 ring-emerald-300' : 'bg-white border border-slate-200 text-slate-600'}">
                                                    ${n}
                                                </span>
                                            `;
                                        }).join('')}
                                    </div>
                                </div>
                            </div>

                            <div class="pt-2 border-t border-indigo-200/60 text-[11px] font-mono flex items-center justify-between text-slate-500">
                                <span>Vốn: 22M · Ăn: ${formatMoney(shadow?.payoutK, { signed: false })}</span>
                                <span>Lũy kế: <strong class="${dayCum.cumShadowK >= 0 ? 'text-emerald-700' : 'text-rose-600'}">${formatMoney(dayCum.cumShadowK)}</strong></span>
                            </div>
                        </div>

                        <!-- CỘT 3: BỘ ĐÔI DÀN GHÉP TINH HOA (FUSION 1A + 2A · 22M) -->
                        <div class="rounded-2xl border-2 border-amber-400 bg-amber-50/40 p-4 space-y-3 flex flex-col justify-between shadow-2xs">
                            <div class="space-y-2">
                                <div class="flex items-center justify-between text-xs font-bold text-amber-950 border-b border-amber-200 pb-2">
                                    <span class="flex items-center gap-1.5">
                                        <span class="rounded bg-gradient-to-r from-amber-500 to-orange-500 text-white px-2 py-0.2 text-[10px] font-black">FUSION 1A + 2A</span>
                                    </span>
                                    <span class="font-mono font-black ${fusionProfitColor} text-sm">
                                        ${formatMoney(fusion?.profitK)}
                                    </span>
                                </div>

                                <!-- Chi tiết 2 dàn ghép 1A & 2A -->
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                    ${(fusion?.dans || []).map(d => {
                                        const isWinDan = d.hits >= 2;
                                        return `
                                            <div class="p-2.5 rounded-xl bg-white border ${isWinDan ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200'} space-y-1.5">
                                                <div class="flex items-center justify-between text-[11px]">
                                                    <strong class="text-slate-900">${d.name}</strong>
                                                    <span class="font-mono font-black ${d.hits >= 2 ? 'text-emerald-700' : 'text-slate-400'}">
                                                        ${d.hits}/4 ${d.hits >= 2 ? `(+${formatMoney(d.payoutK, { signed: false })})` : ''}
                                                    </span>
                                                </div>
                                                <div class="flex flex-wrap gap-1">
                                                    ${(d.dan || []).map(n => {
                                                        const isHit = actSet.has(String(n).padStart(2, '0'));
                                                        return `
                                                            <span class="px-2 py-0.5 rounded font-mono text-xs font-bold ${isHit ? 'bg-amber-400 text-slate-950 ring-1 ring-amber-300' : 'bg-slate-50 text-slate-500'}">
                                                                ${n}
                                                            </span>
                                                        `;
                                                    }).join('')}
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>

                            <div class="pt-2 border-t border-amber-200 text-[11px] font-mono flex items-center justify-between text-amber-950">
                                <span>Vốn: 22M · Ăn: <strong>${formatMoney(fusion?.payoutK, { signed: false })}</strong></span>
                                <span>Lũy kế: <strong class="${dayCum.cumFusionK >= 0 ? 'text-emerald-700' : 'text-rose-600'}">${formatMoney(dayCum.cumFusionK)}</strong></span>
                            </div>
                        </div>

                    </div>
                </article>
            `;
        }).join('');
    }

    // -------------------------------------------------------------------------
    // 5. INIT & EVENT LISTENERS
    // -------------------------------------------------------------------------
    async function loadData() {
        try {
            const res = await fetch('/api/xien-fusion', { cache: 'no-store' });
            const data = await res.json();
            if (!data || !data.success) {
                throw new Error(data.error || 'Lỗi tải API Xiên Fusion');
            }

            state.payload = data;
            renderSummaryCards(data.summary);
            renderComparisonTable(data.summary);
            renderPendingPrediction(data.todayPending);
            renderHistoryJournal(data.history, state.filter);
        } catch (error) {
            console.error('[XienFusion-UI] Error:', error);
            const container = document.getElementById('summaryCardsContainer');
            if (container) {
                container.innerHTML = `<div class="col-span-full p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-bold">${error.message}</div>`;
            }
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadData();

        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                refreshBtn.innerHTML = '<i class="bi bi-arrow-clockwise animate-spin text-base text-amber-600"></i> Đang tải...';
                try {
                    const res = await fetch('/api/xien-fusion?refresh=true', { cache: 'no-store' });
                    const data = await res.json();
                    if (data && data.success) {
                        state.payload = data;
                        renderSummaryCards(data.summary);
                        renderComparisonTable(data.summary);
                        renderPendingPrediction(data.todayPending);
                        renderHistoryJournal(data.history, state.filter);
                        showToast('Đã làm mới dữ liệu đối soát thành công!');
                    }
                } catch (e) {
                    showToast('Lỗi khi làm mới: ' + e.message);
                } finally {
                    refreshBtn.disabled = false;
                    refreshBtn.innerHTML = '<i class="bi bi-arrow-clockwise text-base text-amber-600"></i> Làm mới dữ liệu';
                }
            });
        }

        // History filter change
        const filterSelect = document.getElementById('historyFilter');
        if (filterSelect) {
            filterSelect.addEventListener('change', (e) => {
                state.filter = e.target.value;
                if (state.payload?.history) {
                    renderHistoryJournal(state.payload.history, state.filter);
                }
            });
        }

        // Date Range Controls
        const xFromInp = document.getElementById('xienFusionFromDate');
        const xToInp = document.getElementById('xienFusionToDate');
        const xResetBtn = document.getElementById('btnResetXienFusionDate');
        if (xFromInp) {
            xFromInp.addEventListener('change', (e) => {
                state.fromDate = e.target.value;
                if (state.payload?.history) {
                    renderHistoryJournal(state.payload.history, state.filter);
                }
            });
        }
        if (xToInp) {
            xToInp.addEventListener('change', (e) => {
                state.toDate = e.target.value;
                if (state.payload?.history) {
                    renderHistoryJournal(state.payload.history, state.filter);
                }
            });
        }
        document.querySelectorAll('.btn-xienfusion-quick-date').forEach(btn => {
            btn.addEventListener('click', () => {
                const range = btn.dataset.range;
                const allDates = (state.payload?.history || []).map(d => d.date).sort();
                const latestDate = allDates[allDates.length - 1] || new Date().toISOString().slice(0, 10);
                state.toDate = latestDate;

                if (range === '7d') {
                    const d = new Date(latestDate);
                    d.setDate(d.getDate() - 6);
                    state.fromDate = d.toISOString().slice(0, 10);
                } else if (range === '30d') {
                    const d = new Date(latestDate);
                    d.setDate(d.getDate() - 29);
                    state.fromDate = d.toISOString().slice(0, 10);
                } else if (range === 'all') {
                    state.fromDate = allDates[0] || '2026-01-01';
                }
                if (state.payload?.history) {
                    renderHistoryJournal(state.payload.history, state.filter);
                }
            });
        });
        if (xResetBtn) {
            xResetBtn.addEventListener('click', () => {
                const allDates = (state.payload?.history || []).map(d => d.date).sort();
                state.toDate = allDates[allDates.length - 1] || new Date().toISOString().slice(0, 10);
                state.fromDate = allDates[0] || '2026-01-01';
                if (state.payload?.history) {
                    renderHistoryJournal(state.payload.history, state.filter);
                }
            });
        }
    });

})();
