/**
 * public/js/ai-5.js
 * 
 * Logic giao diện cho trang Đối Soát & Đồng Thuận 5 AI (ChatGPT, Claude, Gemini, Grok, Muse)
 * Hỗ trợ phân tầng Đề (Tier X2 & X1) và Lô (Tier X5 đến X1) tương tự Daily,
 * cùng chế độ đối soát hiển thị đầy đủ dàn số cho ngày đang chờ kết quả.
 */

(function () {
    'use strict';

    const state = {
        payload: null,
        selectedModel: 'consensus',
        leaderboardCategory: 'combo', // 'combo', 'de', 'lo', 'xien4'
        ledgerFilter: 'all',
        ledgerCategory: 'all', // 'all', 'de', 'lo', 'xien4'
        expandedDays: new Set(),
        aiDetailsOpen: false,
        expandedDayAis: new Set()
    };

    const nf = new Intl.NumberFormat('vi-VN');

    function formatMoney(k, options = {}) {
        if (k === null || k === undefined || Number.isNaN(k)) return '0M';
        const inM = Number(k) / 1000;
        const sign = (options.signed !== false && inM > 0) ? '+' : '';
        const formatted = new Intl.NumberFormat('vi-VN', {
            minimumFractionDigits: options.minDigits ?? (Number.isInteger(inM) ? 0 : 1),
            maximumFractionDigits: options.maxDigits ?? 1
        }).format(inM);
        return `${sign}${formatted}M`;
    }

    function showToast(message) {
        const toast = document.getElementById('toast');
        const toastMsg = document.getElementById('toastMessage');
        if (!toast || !toastMsg) return;

        toastMsg.textContent = message;
        toast.classList.remove('translate-y-10', 'opacity-0', 'pointer-events-none');
        toast.classList.add('translate-y-0', 'opacity-100');

        setTimeout(() => {
            toast.classList.add('translate-y-10', 'opacity-0', 'pointer-events-none');
            toast.classList.remove('translate-y-0', 'opacity-100');
        }, 2200);
    }

    function copyToClipboard(text, label = 'dàn số') {
        if (!navigator.clipboard) {
            const el = document.createElement('textarea');
            el.value = text;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
        } else {
            navigator.clipboard.writeText(text);
        }
        showToast(`Đã sao chép ${label}: ${text}`);
    }

    function getModelBadge(modelKey, models = {}) {
        if (modelKey === 'consensus') {
            return {
                name: '👑 Gộp 5 AI',
                bg: 'bg-purple-100 text-purple-900 border-purple-300',
                avatar: '👑'
            };
        }
        const m = models[modelKey] || {};
        return {
            name: m.name || modelKey,
            bg: m.badgeClass || 'bg-slate-100 text-slate-800 border-slate-300',
            avatar: m.avatar || '🤖'
        };
    }

    /**
     * Helper an toàn trích xuất số phiếu bầu từ deVotesMap / loVotesMap
     * Xử lý triệt để lỗi in [object Object] khi map[n] là đối tượng { count, models }
     * Luôn luôn trả về giá trị kiểu số nguyên nguyên thủy (primitive number)
     */
    function getVoteCount(map, n, defaultVal = 1) {
        const fallback = typeof defaultVal === 'number' ? defaultVal : (Number(defaultVal) || 1);
        if (!map) return fallback;
        const keyStr = String(n).padStart(2, '0');
        const entry = map[keyStr] !== undefined ? map[keyStr] : (map[n] !== undefined ? map[n] : map[Number(n)]);
        if (entry === undefined || entry === null) return fallback;
        if (typeof entry === 'number') return isNaN(entry) ? fallback : entry;
        if (typeof entry === 'string' && !isNaN(Number(entry))) return Number(entry);
        if (typeof entry === 'object') {
            if (typeof entry.count === 'number' && !isNaN(entry.count)) return entry.count;
            if (Array.isArray(entry.models)) return entry.models.length;
            if (entry.count !== undefined && !isNaN(Number(entry.count))) return Number(entry.count);
            if (typeof entry.votes === 'number' && !isNaN(entry.votes)) return entry.votes;
        }
        return fallback;
    }

    /**
     * Helper hiển thị huy hiệu số ngày dương (có lãi) / tổng số ngày dự đoán
     * Highlight nổi bật với viền và nền emerald khi có ngày thắng
     */
    function renderWinDaysBadge(wins, days, label = 'ngày dương') {
        const total = days || 0;
        const hit = wins || 0;
        if (total === 0) {
            return `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-400 border border-slate-200">0/0 ${label}</span>`;
        }
        const isPositive = hit > 0;
        const badgeClass = isPositive
            ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-black shadow-2xs'
            : 'bg-rose-50 text-rose-700 border-rose-200 font-bold';
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] border ${badgeClass}">
            <i class="bi ${isPositive ? 'bi-check-circle-fill text-emerald-600' : 'bi-dash-circle text-rose-500'} text-[9px]"></i>
            <span>${hit}/${total} ${label}</span>
        </span>`;
    }

    // -------------------------------------------------------------------------
    // RENDER: 4 Thẻ KPI Pills Thống Kê Lỗ Lãi Lũy Kế Toàn Diện Từng Loại
    // -------------------------------------------------------------------------
    function renderCumulativePills(summary = {}, models = {}) {
        const container = document.getElementById('ai5CumulativePills');
        if (!container) return;

        const cons = summary.consensus || {};
        const de = cons.deTiered || cons.de || {};
        const lo = cons.loTiered || cons.lo || {};
        const x4 = cons.xien4 || {};
        const combo = cons.combo || {};

        const deProfit = de.profitK || 0;
        const loProfit = lo.profitK || 0;
        const x4Profit = x4.profitK || 0;
        const comboProfit = combo.profitK || 0;

        const deDays = de.days || cons.days || 0;
        const deWins = de.wins || 0;
        const deWinRate = deDays > 0 ? ((deWins / deDays) * 100).toFixed(1) : '0.0';
        const deRoi = ((de.roi || 0) * 100).toFixed(1);

        const loDays = lo.days || cons.days || 0;
        const loWins = lo.wins || 0;
        const loHits = lo.totalHits || 0;
        const loAvgHits = loDays > 0 ? (loHits / loDays).toFixed(2) : '0.0';
        const loRoi = ((lo.roi || 0) * 100).toFixed(1);

        const x4Days = x4.days || 0;
        const x4Wins = x4.wins || 0;
        const x4Roi = ((x4.roi || 0) * 100).toFixed(1);

        const comboDays = combo.days || cons.days || 0;
        const comboWins = combo.wins || 0;
        const comboRoi = ((combo.roi || 0) * 100).toFixed(1);

        const activeCat = state.leaderboardCategory;

        container.innerHTML = `
            <!-- Pill 1: Lũy Kế Combo 5 AI (Bù Trừ Chéo) -->
            <div class="cursor-pointer rounded-2xl p-3.5 flex items-center justify-between shadow-2xs transition-all border ${activeCat === 'combo' ? 'border-2 border-indigo-500 bg-indigo-50/80 ring-2 ring-indigo-300' : 'border-slate-200 bg-white hover:border-slate-300'}" data-pill-cat="combo" title="Bấm để lọc xem toàn diện Tất Cả Combo">
                <div class="flex items-center gap-2.5">
                    <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white font-black text-sm shadow-xs">💰</span>
                    <div>
                        <div class="font-bold text-slate-900 text-xs flex items-center gap-1">
                            <span>Lũy Kế Combo 5 AI:</span>
                            <span class="rounded bg-indigo-100 text-indigo-900 text-[9px] font-black px-1.5 py-0.2">Bù Trừ Chéo</span>
                        </div>
                        <div class="text-[10px] text-slate-500 mt-0.5">Vốn ${formatMoney(combo.stakeK, { signed: false })} · Ăn ${formatMoney(combo.payoutK, { signed: false })}</div>
                    </div>
                </div>
                <div class="text-right font-mono">
                    <div class="font-black text-sm ${comboProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}">${formatMoney(comboProfit)}</div>
                    <div class="text-[9px] font-bold ${comboProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'} font-sans">ROI: ${comboRoi}%</div>
                </div>
            </div>

            <!-- Pill 2: Lũy Kế Đề Gộp 5 AI -->
            <div class="cursor-pointer rounded-2xl p-3.5 flex items-center justify-between shadow-2xs transition-all border ${activeCat === 'de' ? 'border-2 border-purple-500 bg-purple-50/80 ring-2 ring-purple-300' : 'border-slate-200 bg-white hover:border-slate-300'}" data-pill-cat="de" title="Bấm để lọc xem riêng Đề Gộp">
                <div class="flex items-center gap-2.5">
                    <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-600 text-white font-black text-sm shadow-xs">🎯</span>
                    <div>
                        <div class="font-bold text-slate-900 text-xs flex items-center gap-1">
                            <span>Lũy Kế Đề Gộp:</span>
                            <span class="rounded bg-purple-100 text-purple-900 text-[9px] font-black px-1.5 py-0.2">X2 & X1</span>
                        </div>
                        <div class="text-[10px] text-slate-500 mt-0.5">Ăn ${deWins}/${deDays} ngày (${deWinRate}%)</div>
                    </div>
                </div>
                <div class="text-right font-mono">
                    <div class="font-black text-sm ${deProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}">${formatMoney(deProfit)}</div>
                    <div class="text-[9px] font-bold ${deProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'} font-sans">ROI: ${deRoi}%</div>
                </div>
            </div>

            <!-- Pill 3: Lũy Kế Lô Gộp 5 AI -->
            <div class="cursor-pointer rounded-2xl p-3.5 flex items-center justify-between shadow-2xs transition-all border ${activeCat === 'lo' ? 'border-2 border-teal-500 bg-teal-50/80 ring-2 ring-teal-300' : 'border-slate-200 bg-white hover:border-slate-300'}" data-pill-cat="lo" title="Bấm để lọc xem riêng Lô Gộp">
                <div class="flex items-center gap-2.5">
                    <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-600 text-white font-black text-sm shadow-xs">🎲</span>
                    <div>
                        <div class="font-bold text-slate-900 text-xs flex items-center gap-1">
                            <span>Lũy Kế Lô Gộp:</span>
                            <span class="rounded bg-teal-100 text-teal-900 text-[9px] font-black px-1.5 py-0.2">Tầng X5..X1</span>
                        </div>
                        <div class="text-[10px] text-slate-500 mt-0.5">Nổ ${loHits} nháy (${loAvgHits}n/kỳ)</div>
                    </div>
                </div>
                <div class="text-right font-mono">
                    <div class="font-black text-sm ${loProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}">${formatMoney(loProfit)}</div>
                    <div class="text-[9px] font-bold ${loProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'} font-sans">ROI: ${loRoi}%</div>
                </div>
            </div>

            <!-- Pill 4: Lũy Kế 2 Dàn Xiên 4 -->
            <div class="cursor-pointer rounded-2xl p-3.5 flex items-center justify-between shadow-2xs transition-all border ${activeCat === 'xien4' ? 'border-2 border-amber-500 bg-amber-50/80 ring-2 ring-amber-300' : 'border-slate-200 bg-white hover:border-slate-300'}" data-pill-cat="xien4" title="Bấm để lọc xem riêng 2 Dàn Xiên 4">
                <div class="flex items-center gap-2.5">
                    <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500 text-slate-950 font-black text-sm shadow-xs">💎</span>
                    <div>
                        <div class="font-bold text-slate-900 text-xs flex items-center gap-1">
                            <span>Lũy Kế Xiên 4:</span>
                            <span class="rounded bg-amber-100 text-amber-900 text-[9px] font-black px-1.5 py-0.2">2 Dàn Vốn 22M</span>
                        </div>
                        <div class="text-[10px] text-slate-500 mt-0.5">${x4Days > 0 ? `X4:${x4.h4Count || 0} · X3:${x4.h3Count || 0} · X2:${x4.h2Count || 0}` : 'Chưa có'}</div>
                    </div>
                </div>
                <div class="text-right font-mono">
                    <div class="font-black text-sm ${x4Profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}">${formatMoney(x4Profit)}</div>
                    <div class="text-[9px] font-bold ${x4Profit >= 0 ? 'text-emerald-600' : 'text-rose-500'} font-sans">ROI: ${x4Roi}%</div>
                </div>
            </div>
        `;

        container.querySelectorAll('[data-pill-cat]').forEach(pill => {
            pill.addEventListener('click', () => {
                const cat = pill.dataset.pillCat;
                if (cat) switchLeaderboardCategory(cat);
            });
        });
    }

    function switchLeaderboardCategory(cat) {
        state.leaderboardCategory = cat || 'combo';
        const lbFilterBtns = document.querySelectorAll('.lb-filter-btn');
        const lbModeLabel = document.getElementById('lbCurrentModeLabel');

        lbFilterBtns.forEach(b => {
            if (b.dataset.cat === state.leaderboardCategory) {
                b.classList.add('active', 'border-indigo-600', 'bg-indigo-600', 'text-white');
                b.classList.remove('border-slate-200', 'bg-white', 'text-slate-600');
            } else {
                b.classList.remove('active', 'border-indigo-600', 'bg-indigo-600', 'text-white');
                b.classList.add('border-slate-200', 'bg-white', 'text-slate-600');
            }
        });

        if (lbModeLabel) {
            if (state.leaderboardCategory === 'combo') {
                lbModeLabel.textContent = 'Chế độ: Đang xem Tất Cả (Combo: Đề + Lô + Xiên 4)';
            } else if (state.leaderboardCategory === 'de') {
                lbModeLabel.textContent = 'Chế độ: Đang xem Đề Riêng (Vốn 20M · Ăn 84M / Đa Tầng X2 & X1)';
            } else if (state.leaderboardCategory === 'lo') {
                lbModeLabel.textContent = 'Chế độ: Đang xem Lô Riêng (Vốn 13.2M · Ăn 8M/nháy / Đa Tầng X5..X1)';
            } else if (state.leaderboardCategory === 'xien4') {
                lbModeLabel.textContent = 'Chế độ: Đang xem 2 Dàn Xiên 4 Tinh Hoa (Vốn 22M · Ăn X4 384M · X3 84M · X2 12M)';
            }
        }

        // Đồng bộ lọc danh mục xuống bảng đối soát nhật ký
        state.ledgerCategory = state.leaderboardCategory === 'combo' ? 'all' : state.leaderboardCategory;
        const ledgerCatSelect = document.getElementById('ledgerCategoryFilter');
        if (ledgerCatSelect) ledgerCatSelect.value = state.ledgerCategory;

        if (state.payload) {
            renderCumulativePills(state.payload.summary, state.payload.models);
            renderLeaderboard(state.payload.leaderboard, state.payload.models);
            renderLedger(state.payload.history, state.ledgerFilter, state.payload.models);
        }
    }

    // -------------------------------------------------------------------------
    // RENDER: Executive Leaderboard Cards & Bảng Thống Kê Lũy Kế Chi Tiết
    // -------------------------------------------------------------------------
    function renderLeaderboard(leaderboard = [], models = {}) {
        const grid = document.getElementById('leaderboardGrid');
        const table = document.getElementById('cumulativeStatsTable');
        if (!grid && !table) return;

        if (!leaderboard.length) {
            if (grid) grid.innerHTML = '<div class="col-span-full p-4 text-center text-xs text-slate-400">Chưa có dữ liệu thống kê.</div>';
            if (table) table.innerHTML = '<tr><td class="p-4 text-center text-xs text-slate-400">Chưa có dữ liệu thống kê.</td></tr>';
            return;
        }

        let sortedList = [...leaderboard];
        if (state.leaderboardCategory === 'de') {
            sortedList.sort((a, b) => {
                const pA = a.deTiered?.profitK ?? a.de?.profitK ?? 0;
                const pB = b.deTiered?.profitK ?? b.de?.profitK ?? 0;
                return pB - pA;
            });
        } else if (state.leaderboardCategory === 'lo') {
            sortedList.sort((a, b) => {
                const pA = a.loTiered?.profitK ?? a.lo?.profitK ?? 0;
                const pB = b.loTiered?.profitK ?? b.lo?.profitK ?? 0;
                return pB - pA;
            });
        } else if (state.leaderboardCategory === 'xien4') {
            sortedList.sort((a, b) => {
                const pA = a.xien4?.profitK ?? 0;
                const pB = b.xien4?.profitK ?? 0;
                return pB - pA;
            });
        } else {
            // 'combo'
            sortedList.sort((a, b) => (b.combo?.profitK ?? 0) - (a.combo?.profitK ?? 0));
        }

        const isDeActive = state.leaderboardCategory === 'de';
        const isLoActive = state.leaderboardCategory === 'lo';
        const isXien4Active = state.leaderboardCategory === 'xien4';

        // 1. RENDER LEADERBOARD CARDS
        if (grid) {
            const cardsHtml = sortedList.map(item => {
                const isConsensus = item.id === 'consensus';
                const info = isConsensus ? { name: '👑 Gộp Consensus', avatar: '👑' } : (models[item.id] || { name: item.id, avatar: '🤖' });
                
                const deDays = isConsensus ? (item.deTiered?.days ?? item.de?.days ?? item.days ?? 0) : (item.days ?? 0);
                const deWins = isConsensus ? (item.deTiered?.wins ?? item.de?.wins ?? 0) : (item.de?.wins ?? 0);
                const deWinRate = deDays > 0 ? ((deWins / deDays) * 100).toFixed(1) : '0.0';
                const deProfitK = item.deTiered?.profitK ?? item.de?.profitK ?? 0;
                const deStakeK = item.deTiered?.stakeK ?? item.de?.stakeK ?? 0;
                const dePayoutK = item.deTiered?.payoutK ?? item.de?.payoutK ?? 0;
                const deRoi = ((item.deTiered?.roi ?? item.de?.roi ?? 0) * 100).toFixed(1);

                const loDays = isConsensus ? (item.loTiered?.days ?? item.lo?.days ?? item.days ?? 0) : (item.days ?? 0);
                const loWins = isConsensus ? (item.loTiered?.wins ?? item.lo?.wins ?? 0) : (item.lo?.wins ?? 0);
                const loHits = item.loTiered?.hits ?? item.lo?.totalHits ?? 0;
                const loAvg = item.lo?.avgHitsPerDay || 0;
                const loProfitK = item.loTiered?.profitK ?? item.lo?.profitK ?? 0;
                const loStakeK = item.loTiered?.stakeK ?? item.lo?.stakeK ?? 0;
                const loPayoutK = item.loTiered?.payoutK ?? item.lo?.payoutK ?? 0;
                const loRoi = ((item.loTiered?.roi ?? item.lo?.roi ?? 0) * 100).toFixed(1);

                const x4 = item.xien4 || {};
                const x4Days = x4.days || 0;
                const x4Wins = x4.wins || 0;
                const x4ProfitK = x4.profitK || 0;
                const x4StakeK = x4.stakeK || 0;
                const x4PayoutK = x4.payoutK || 0;
                const x4Roi = ((x4.roi || 0) * 100).toFixed(1);
                const x4HasData = x4Days > 0;

                const comboDays = item.combo?.days || item.days || 0;
                const comboWins = item.combo?.wins || 0;
                const comboProfitK = item.combo?.profitK || 0;
                const comboStakeK = item.combo?.stakeK || 0;
                const comboPayoutK = item.combo?.payoutK || 0;
                const comboRoi = ((item.combo?.roi || 0) * 100).toFixed(1);

                // Active category footer metrics
                let footerLabel = 'LÃI LŨY KẾ NET:';
                let footerProfitK = comboProfitK;
                let footerRoi = comboRoi;
                let footerWins = comboWins;
                let footerDays = comboDays;

                if (isDeActive) {
                    footerLabel = 'LÃI LŨY KẾ ĐỀ:';
                    footerProfitK = deProfitK;
                    footerRoi = deRoi;
                    footerWins = deWins;
                    footerDays = deDays;
                } else if (isLoActive) {
                    footerLabel = 'LÃI LŨY KẾ LÔ:';
                    footerProfitK = loProfitK;
                    footerRoi = loRoi;
                    footerWins = loWins;
                    footerDays = loDays;
                } else if (isXien4Active) {
                    footerLabel = 'LÃI LŨY KẾ XIÊN 4:';
                    footerProfitK = x4ProfitK;
                    footerRoi = x4Roi;
                    footerWins = x4Wins;
                    footerDays = x4Days;
                }

                const isPositive = footerProfitK >= 0;

                const borderClass = isConsensus
                    ? 'border-2 border-purple-400 bg-gradient-to-br from-purple-50/80 via-white to-indigo-50/50 shadow-md ring-2 ring-purple-300/40'
                    : 'border border-slate-200/90 bg-white shadow-2xs hover:border-slate-300 transition-all';

                return `
                    <div class="rounded-3xl p-4 flex flex-col justify-between ${borderClass}">
                        <div>
                            <!-- Header Model -->
                            <div class="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
                                <div class="flex items-center gap-2">
                                    <span class="text-xl">${info.avatar || '🤖'}</span>
                                    <div>
                                        <h4 class="font-black text-sm text-slate-900">${info.name}</h4>
                                        <span class="text-[10px] text-slate-400 font-bold uppercase">${item.days || 0} kỳ đối soát</span>
                                    </div>
                                </div>
                                ${isConsensus ? '<span class="rounded-full bg-purple-600 text-white px-2 py-0.5 text-[9px] font-black uppercase shadow-2xs">TOP META</span>' : ''}
                            </div>

                            <!-- Performance Stats: 3 Hạng Mục Riêng Biệt -->
                            <div class="space-y-2 text-xs">
                                <!-- Đề Stats -->
                                <div class="rounded-xl p-2.5 border transition-all ${isDeActive ? 'bg-purple-50/80 border-purple-300 ring-1 ring-purple-200' : 'bg-slate-50/90 border-slate-100'}">
                                    <div class="flex items-center justify-between font-bold text-slate-700">
                                        <span class="flex items-center gap-1"><i class="bi bi-bullseye text-purple-600"></i> Đề Lũy Kế:</span>
                                        <div class="flex items-center gap-1.5">
                                            ${renderWinDaysBadge(deWins, deDays, 'dương')}
                                            <span class="font-mono text-slate-900 font-bold">${deWinRate}%</span>
                                        </div>
                                    </div>
                                    <div class="flex items-center justify-between text-[11px] mt-1 text-slate-500">
                                        <span class="text-[10px] text-slate-400 font-mono">Vốn ${formatMoney(deStakeK, { signed: false })}</span>
                                        <span class="font-mono font-bold ${deProfitK >= 0 ? 'text-emerald-700' : 'text-rose-600'}">${formatMoney(deProfitK)}</span>
                                    </div>
                                </div>

                                <!-- Lô Stats -->
                                <div class="rounded-xl p-2.5 border transition-all ${isLoActive ? 'bg-indigo-50/80 border-indigo-300 ring-1 ring-indigo-200' : 'bg-slate-50/90 border-slate-100'}">
                                    <div class="flex items-center justify-between font-bold text-slate-700">
                                        <span class="flex items-center gap-1"><i class="bi bi-dice-6-fill text-indigo-600"></i> Lô Lũy Kế:</span>
                                        <div class="flex items-center gap-1.5">
                                            ${renderWinDaysBadge(loWins, loDays, 'dương')}
                                            <span class="font-mono text-slate-900 font-bold">${loHits}N</span>
                                        </div>
                                    </div>
                                    <div class="flex items-center justify-between text-[11px] mt-1 text-slate-500">
                                        <span class="text-[10px] text-slate-400 font-mono">Vốn ${formatMoney(loStakeK, { signed: false })}</span>
                                        <span class="font-mono font-bold ${loProfitK >= 0 ? 'text-emerald-700' : 'text-rose-600'}">${formatMoney(loProfitK)}</span>
                                    </div>
                                </div>

                                <!-- 2 Dàn Xiên 4 Stats -->
                                <div class="rounded-xl p-2.5 border transition-all ${isXien4Active ? 'bg-amber-50/80 border-amber-300 ring-1 ring-amber-200' : 'bg-slate-50/90 border-slate-100'}">
                                    <div class="flex items-center justify-between font-bold text-slate-700">
                                        <span class="flex items-center gap-1"><i class="bi bi-dice-4-fill text-amber-600"></i> Xiên 4 Lũy Kế:</span>
                                        <div class="flex items-center gap-1.5">
                                            ${x4HasData ? renderWinDaysBadge(x4Wins, x4Days, 'dương') : '<span class="text-[10px] text-slate-400 font-normal">Chưa có</span>'}
                                        </div>
                                    </div>
                                    <div class="flex items-center justify-between text-[11px] mt-1 text-slate-500">
                                        <span class="text-[10px] text-slate-400 font-mono">${x4HasData ? `X4:${x4.h4Count || 0}·X3:${x4.h3Count || 0}·X2:${x4.h2Count || 0}` : 'Chưa tham gia'}</span>
                                        <span class="font-mono font-bold ${x4HasData ? (x4ProfitK >= 0 ? 'text-emerald-700' : 'text-rose-600') : 'text-slate-400'}">
                                            ${x4HasData ? formatMoney(x4ProfitK) : '0M'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Footer: Dynamic Net Profit & ROI based on active category -->
                        <div class="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <div>
                                <div class="text-[9px] font-bold uppercase text-slate-400 flex items-center gap-1.5 mb-0.5">
                                    <span>${footerLabel}</span>
                                    ${renderWinDaysBadge(footerWins, footerDays, 'dương')}
                                </div>
                                <div class="font-mono text-sm font-black ${isPositive ? 'text-emerald-700' : 'text-rose-600'}">
                                    ${formatMoney(footerProfitK)}
                                </div>
                            </div>
                            <div class="text-right">
                                <div class="text-[9px] font-bold uppercase text-slate-400">ROI:</div>
                                <div class="font-mono text-xs font-black ${isPositive ? 'text-emerald-700' : 'text-rose-600'}">
                                    ${footerRoi}%
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            grid.innerHTML = cardsHtml;
        }

        // 2. RENDER BẢNG ĐỐI SOÁT LỖ / LÃI LŨY KẾ CHI TIẾT
        if (table) {
            table.innerHTML = `
                <thead>
                    <tr class="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black text-slate-700 uppercase tracking-wider">
                        <th class="py-3 px-3">Mô Hình</th>
                        <th class="py-3 px-3 text-right ${isDeActive ? 'bg-purple-100/60 text-purple-900 font-black' : ''}">🎯 Đề Lũy Kế</th>
                        <th class="py-3 px-3 text-right ${isLoActive ? 'bg-indigo-100/60 text-indigo-900 font-black' : ''}">🎲 Lô Lũy Kế</th>
                        <th class="py-3 px-3 text-right ${isXien4Active ? 'bg-amber-100/60 text-amber-900 font-black' : ''}">💎 2 Dàn Xiên 4</th>
                        <th class="py-3 px-3 text-right ${(!isDeActive && !isLoActive && !isXien4Active) ? 'bg-indigo-100/70 text-indigo-950 font-black' : 'bg-slate-100/80'}">👑 TỔNG LÃI NET</th>
                        <th class="py-3 px-3 text-center">ROI</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-xs">
                    ${sortedList.map(item => {
                        const isCons = item.id === 'consensus';
                        const info = isCons ? { name: '👑 Gộp Consensus 5 AI', avatar: '👑' } : (models[item.id] || { name: item.id, avatar: '🤖' });
                        
                        const deDays = isCons ? (item.deTiered?.days ?? item.de?.days ?? item.days ?? 0) : (item.days ?? 0);
                        const deWins = isCons ? (item.deTiered?.wins ?? item.de?.wins ?? 0) : (item.de?.wins ?? 0);
                        const deProfitK = item.deTiered?.profitK ?? item.de?.profitK ?? 0;
                        const deStakeK = item.deTiered?.stakeK ?? item.de?.stakeK ?? 0;
                        const dePayoutK = item.deTiered?.payoutK ?? item.de?.payoutK ?? 0;

                        const loDays = isCons ? (item.loTiered?.days ?? item.lo?.days ?? item.days ?? 0) : (item.days ?? 0);
                        const loWins = isCons ? (item.loTiered?.wins ?? item.lo?.wins ?? 0) : (item.lo?.wins ?? 0);
                        const loProfitK = item.loTiered?.profitK ?? item.lo?.profitK ?? 0;
                        const loStakeK = item.loTiered?.stakeK ?? item.lo?.stakeK ?? 0;
                        const loPayoutK = item.loTiered?.payoutK ?? item.lo?.payoutK ?? 0;
                        const loHits = item.loTiered?.hits ?? item.lo?.totalHits ?? 0;

                        const x4 = item.xien4 || {};
                        const x4Days = x4.days || 0;
                        const x4Wins = x4.wins || 0;
                        const x4ProfitK = x4.profitK || 0;
                        const x4StakeK = x4.stakeK || 0;
                        const x4PayoutK = x4.payoutK || 0;
                        const x4HasData = x4Days > 0;

                        const comboDays = item.combo?.days || item.days || 0;
                        const comboWins = item.combo?.wins || 0;
                        const comboProfitK = item.combo?.profitK || 0;
                        const comboStakeK = item.combo?.stakeK || 0;
                        const comboPayoutK = item.combo?.payoutK || 0;
                        const comboRoi = ((item.combo?.roi || 0) * 100).toFixed(1);

                        const rowBg = isCons ? 'bg-purple-50/40 font-semibold' : 'hover:bg-slate-50/60 transition';

                        return `
                            <tr class="${rowBg}">
                                <td class="py-3 px-3">
                                    <div class="flex items-center gap-2">
                                        <span class="text-lg">${info.avatar || '🤖'}</span>
                                        <div>
                                            <div class="font-black text-slate-900">${info.name}</div>
                                            <div class="text-[10px] text-slate-400 font-mono">${item.days || 0} kỳ đối soát</div>
                                        </div>
                                    </div>
                                </td>

                                <!-- Đề -->
                                <td class="py-3 px-3 text-right font-mono ${isDeActive ? 'bg-purple-50/50' : ''}">
                                    <div class="flex items-center justify-end gap-1.5 mb-1">
                                        ${renderWinDaysBadge(deWins, deDays, 'dương')}
                                        <span class="font-black text-sm ${deProfitK >= 0 ? 'text-emerald-700' : 'text-rose-600'}">
                                            ${formatMoney(deProfitK)}
                                        </span>
                                    </div>
                                    <div class="text-[10px] text-slate-400">
                                        Vốn ${formatMoney(deStakeK, { signed: false })} · Ăn ${formatMoney(dePayoutK, { signed: false })}
                                    </div>
                                </td>

                                <!-- Lô -->
                                <td class="py-3 px-3 text-right font-mono ${isLoActive ? 'bg-indigo-50/50' : ''}">
                                    <div class="flex items-center justify-end gap-1.5 mb-1">
                                        ${renderWinDaysBadge(loWins, loDays, 'dương')}
                                        <span class="font-black text-sm ${loProfitK >= 0 ? 'text-emerald-700' : 'text-rose-600'}">
                                            ${formatMoney(loProfitK)}
                                        </span>
                                    </div>
                                    <div class="text-[10px] text-slate-400">
                                        Vốn ${formatMoney(loStakeK, { signed: false })} · Ăn ${formatMoney(loPayoutK, { signed: false })} (${loHits}n)
                                    </div>
                                </td>

                                <!-- Xiên 4 -->
                                <td class="py-3 px-3 text-right font-mono ${isXien4Active ? 'bg-amber-50/50' : ''}">
                                    <div class="flex items-center justify-end gap-1.5 mb-1">
                                        ${x4HasData ? renderWinDaysBadge(x4Wins, x4Days, 'dương') : '<span class="text-[10px] text-slate-400 font-sans">Chưa có dàn</span>'}
                                        <span class="font-black text-sm ${x4HasData ? (x4ProfitK >= 0 ? 'text-emerald-700' : 'text-rose-600') : 'text-slate-400'}">
                                            ${x4HasData ? formatMoney(x4ProfitK) : '0M'}
                                        </span>
                                    </div>
                                    <div class="text-[10px] text-slate-400">
                                        ${x4HasData ? `Vốn ${formatMoney(x4StakeK, { signed: false })} · Ăn ${formatMoney(x4PayoutK, { signed: false })} (X4:${x4.h4Count || 0}·X3:${x4.h3Count || 0}·X2:${x4.h2Count || 0})` : 'Chưa tham gia'}
                                    </div>
                                </td>

                                <!-- Tổng Combo -->
                                <td class="py-3 px-3 text-right font-mono ${(!isDeActive && !isLoActive && !isXien4Active) ? 'bg-indigo-50/50' : 'bg-slate-50/50'}">
                                    <div class="flex items-center justify-end gap-1.5 mb-1">
                                        ${renderWinDaysBadge(comboWins, comboDays, 'dương')}
                                        <span class="font-black text-base ${comboProfitK >= 0 ? 'text-emerald-700' : 'text-rose-600'}">
                                            ${formatMoney(comboProfitK)}
                                        </span>
                                    </div>
                                    <div class="text-[10px] text-slate-400">
                                        Vốn ${formatMoney(comboStakeK, { signed: false })} · Ăn ${formatMoney(comboPayoutK, { signed: false })}
                                    </div>
                                </td>

                                <!-- ROI -->
                                <td class="py-3 px-3 text-center font-mono font-bold">
                                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black ${comboProfitK >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                                        ${comboRoi}%
                                    </span>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            `;
        }
    }

    // -------------------------------------------------------------------------
    // RENDER: Dàn Dự Đoán Hôm Nay (Active Prediction View)
    // -------------------------------------------------------------------------
    function renderTodayPrediction(latestDay, consensus, selectedModel, models = {}) {
        const container = document.getElementById('todayPredictionContent');
        const targetDateEl = document.getElementById('predictionTargetDate');
        const statusBadgeEl = document.getElementById('predictionStatusBadge');
        if (!container) return;

        if (!latestDay) {
            container.innerHTML = '<div class="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Chưa có dữ liệu dự đoán.</div>';
            return;
        }

        if (targetDateEl) targetDateEl.textContent = latestDay.date;
        const isSettled = Boolean(latestDay.special && latestDay.prizes27?.length === 27 && latestDay.results);

        if (statusBadgeEl) {
            if (isSettled) {
                statusBadgeEl.className = 'rounded-full px-2.5 py-0.5 text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs';
                statusBadgeEl.innerHTML = '<i class="bi bi-check-circle-fill text-emerald-600"></i> Đã kết toán';
            } else {
                statusBadgeEl.className = 'rounded-full px-2.5 py-0.5 text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs animate-pulse';
                statusBadgeEl.innerHTML = '<i class="bi bi-clock-fill text-amber-600"></i> Chờ KQ 18h30';
            }
        }

        // DỮ LIỆU DÀN GỘP 5 AI (CONSENSUS)
        const deNums = consensus?.deTop20 || [];
        const deTiers = consensus?.deTiers || {};
        const deX2Nums = deTiers.x2Nums || consensus?.deVip || [];
        const deX1Nums = deTiers.x1Nums || [];
        
        const loTiers = consensus?.loTiers || {};
        const loNums = consensus?.loTop6 || [];
        const loVotesMap = consensus?.loVotesMap || {};
        const deVotesMap = consensus?.deVotesMap || {};

        const x5List = loTiers.x5Nums || [];
        const x4List = loTiers.x4Nums || [];
        const x3List = loTiers.x3Nums || [];
        const x2List = loTiers.x2Nums || [];
        const x1List = loTiers.x1Nums || [];

        const x4Data = consensus?.xien4 || latestDay?.consensus?.xien4 || latestDay?.xien4 || {};
        const dan1 = x4Data?.dan1 || [];
        const dan2 = x4Data?.dan2 || [];

        const sources = latestDay?.sources || {};

        // Helper lấy nguồn dữ liệu chuẩn xác cho từng AI model (hỗ trợ fallback Perplexity cho Grok, DeepSeek cho Claude khi xem lịch sử)
        const getModelSrc = (mKey) => {
            let s = sources[mKey] || {};
            if (mKey === 'grok' && (!s.de?.length) && sources.perplexity?.de?.length) {
                s = sources.perplexity;
            }
            if (mKey === 'claude' && (!s.de?.length) && sources.deepseek?.de?.length) {
                s = sources.deepseek;
            }
            return s;
        };

        const readyCount = ['chatgpt', 'claude', 'gemini', 'grok', 'muse'].filter(m => {
            const s = getModelSrc(m);
            return s && (s.de?.length > 0 || s.lo?.length > 0);
        }).length;

        // Chuẩn bị dữ liệu chi tiết cho 5 AI độc lập ở accordion phía cuối
        const aiModelsList = ['chatgpt', 'claude', 'gemini', 'grok', 'muse'].map(mKey => {
            const src = getModelSrc(mKey);
            const info = models[mKey] || (mKey === 'claude' ? { name: 'Claude', avatar: '🟣', provider: 'Anthropic' } : { name: mKey, avatar: '🤖', provider: '' });
            const mDeNums = (src.de || []).map(x => String(x).padStart(2, '0'));
            const mLoNums = (src.lo || []).map(x => String(x).padStart(2, '0'));
            const isFallback = mKey === 'grok' && (src.method?.includes('Perplexity') || src.notes?.includes('Perplexity') || src.isFallback);

            let mDan1 = [];
            let mDan2 = [];
            const aiX4 = src.xien4;
            if (aiX4) {
                if (Array.isArray(aiX4.dan1) && Array.isArray(aiX4.dan2)) {
                    mDan1 = aiX4.dan1.map(x => String(x).padStart(2, '0'));
                    mDan2 = aiX4.dan2.map(x => String(x).padStart(2, '0'));
                } else if (Array.isArray(aiX4) && aiX4.length === 2 && Array.isArray(aiX4[0]) && Array.isArray(aiX4[1])) {
                    mDan1 = aiX4[0].map(x => String(x).padStart(2, '0'));
                    mDan2 = aiX4[1].map(x => String(x).padStart(2, '0'));
                } else if (Array.isArray(aiX4) && aiX4.length === 8) {
                    mDan1 = aiX4.slice(0, 4).map(x => String(x).padStart(2, '0'));
                    mDan2 = aiX4.slice(4, 8).map(x => String(x).padStart(2, '0'));
                }
            }
            const hasX4 = mDan1.length === 4 && mDan2.length === 4;
            const hasData = mDeNums.length > 0 || mLoNums.length > 0;

            return {
                key: mKey,
                info,
                src,
                deNums: mDeNums,
                loNums: mLoNums,
                dan1: mDan1,
                dan2: mDan2,
                hasX4,
                hasData,
                isFallback
            };
        });

        // RENDER: MẶC ĐỊNH 3 CỘT (ĐỀ GỘP · LÔ GỘP · 2 DÀN XIÊN 4) + ACCORDION 5 AI Ở CUỐI
        container.innerHTML = `
            <div class="space-y-6">
                ${readyCount < 5 ? `
                    <div class="rounded-2xl border border-amber-300 bg-amber-50/90 p-3.5 flex items-center justify-between gap-3 text-xs text-amber-900 shadow-2xs">
                        <div class="flex items-center gap-2.5">
                            <i class="bi bi-hourglass-split text-lg text-amber-600 animate-spin"></i>
                            <div>
                                <span class="font-black">Đang chuẩn bị số liệu ngày ${latestDay.date}:</span>
                                <span>Hiện có <strong>${readyCount}/5 AI</strong> đã nạp số. Hệ thống tự động đồng thuận khi đủ các mô hình trước 18:15.</span>
                            </div>
                        </div>
                        <span class="text-[10px] font-mono font-black bg-amber-200/90 text-amber-900 px-2.5 py-1 rounded-full shrink-0 border border-amber-300">
                            ${readyCount}/5 Sẵn Sàng
                        </span>
                    </div>
                ` : `
                    <div class="rounded-2xl border border-emerald-300 bg-emerald-50/90 p-3.5 flex items-center justify-between gap-3 text-xs text-emerald-950 shadow-2xs">
                        <div class="flex items-center gap-2.5">
                            <i class="bi bi-shield-check text-lg text-emerald-600"></i>
                            <div>
                                <span class="font-black">Dữ liệu thực chiến ngày ${latestDay.date}:</span>
                                <span>Đã hội tụ đủ <strong>5/5 Mô Hình AI</strong>. Toàn bộ dàn số đã niêm phong bất biến và sẵn sàng đối soát lúc 19:00!</span>
                            </div>
                        </div>
                        <span class="text-[10px] font-mono font-black bg-emerald-200/90 text-emerald-900 px-2.5 py-1 rounded-full shrink-0 border border-emerald-300 flex items-center gap-1">
                            <i class="bi bi-check-circle-fill text-emerald-700"></i> 5/5 AI Sẵn Sàng
                        </span>
                    </div>
                `}

                <!-- GRID 3 CỘT MẶC ĐỊNH: CỘT ĐỀ · CỘT LÔ · CỘT XIÊN 4 -->
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
                    
                    <!-- CỘT 1: ĐỀ GỘP ĐA TẦNG -->
                    <div class="rounded-3xl border-2 border-purple-300 bg-gradient-to-b from-purple-50/50 via-white to-purple-50/20 p-5 shadow-xs flex flex-col justify-between space-y-4">
                        <div>
                            <!-- Header Cột 1 -->
                            <div class="flex items-center justify-between border-b border-purple-100 pb-3 mb-3">
                                <div class="flex items-center gap-2.5">
                                    <span class="flex h-9 w-9 items-center justify-center rounded-2xl bg-purple-600 text-white shadow-xs text-base">
                                        🎯
                                    </span>
                                    <div>
                                        <h4 class="text-sm font-black text-slate-900 uppercase tracking-wide">Đề Gộp Đa Tầng</h4>
                                        <p class="text-[11px] text-purple-800 font-semibold">Dàn X2 VIP & Dàn X1 Lót</p>
                                    </div>
                                </div>
                                <span class="rounded-full bg-purple-100 text-purple-900 border border-purple-200 px-2.5 py-0.5 text-[10px] font-black">
                                    ${deX2Nums.length + deX1Nums.length} số
                                </span>
                            </div>

                            <!-- Kinh tế học -->
                            <div class="text-[11px] font-mono text-slate-600 bg-purple-50/80 p-2.5 rounded-xl border border-purple-100 mb-3 flex items-center justify-between">
                                <span>X2: cược 2M (ăn 168M)</span>
                                <span>X1: cược 1M (ăn 84M)</span>
                            </div>

                            <!-- Dàn X2 (VIP Đồng thuận cao) -->
                            <div class="space-y-2 mb-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-xs font-black text-amber-950 flex items-center gap-1.5">
                                        <span class="rounded bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 px-2 py-0.5 text-[10px] font-black shadow-2xs">DÀN X2 (VIP)</span>
                                        <span>Đồng thuận cao (${deX2Nums.length} số):</span>
                                    </span>
                                    <span class="font-mono text-amber-900 text-[10px] font-black">Cược 2M/số</span>
                                </div>
                                <div class="flex flex-wrap gap-1.5">
                                    ${deX2Nums.map(n => {
                                        const vote = Number(getVoteCount(deVotesMap, n, 2)) || 2;
                                        const safeVote = typeof vote === 'number' && !isNaN(vote) ? vote : 2;
                                        const isDia = safeVote === 5;
                                        const badgeClass = isDia
                                            ? 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white ring-2 ring-purple-300'
                                            : 'bg-gradient-to-br from-amber-300 to-yellow-400 text-slate-950 border border-amber-400';
                                        return `
                                            <div class="badge-number flex flex-col items-center justify-center w-10 h-10 rounded-xl font-mono font-black text-xs shadow-2xs ${badgeClass}" title="Đề VIP X2: ${n} (${safeVote}/5 AI đồng thuận)">
                                                <span>${n}</span>
                                                <span class="text-[7.5px] font-sans font-bold -mt-0.5 opacity-90">${safeVote}/5</span>
                                            </div>
                                        `;
                                    }).join('') || '<span class="text-xs text-slate-400">Không có số</span>'}
                                </div>
                            </div>

                            <!-- Dàn X1 (Lót Bảo Hiểm) -->
                            ${deX1Nums.length ? `
                                <div class="space-y-2 pt-3 border-t border-purple-100">
                                    <div class="flex items-center justify-between">
                                        <span class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                            <span class="rounded bg-indigo-100 text-indigo-900 border border-indigo-200 px-2 py-0.5 text-[10px] font-bold">DÀN X1 (LÓT)</span>
                                            <span>Bảo hiểm (${deX1Nums.length} số):</span>
                                        </span>
                                        <span class="font-mono text-indigo-800 text-[10px] font-black">Cược 1M/số</span>
                                    </div>
                                    <div class="flex flex-wrap gap-1.5">
                                        ${deX1Nums.map(n => {
                                            const vote = Number(getVoteCount(deVotesMap, n, 1)) || 1;
                                            const safeVote = typeof vote === 'number' && !isNaN(vote) ? vote : 1;
                                            return `
                                                <div class="badge-number flex flex-col items-center justify-center w-9 h-9 rounded-xl bg-indigo-50/90 text-indigo-900 border border-indigo-200 font-mono font-bold text-xs shadow-2xs" title="Đề Lót X1: ${n} (${safeVote}/5 AI)">
                                                    <span>${n}</span>
                                                    <span class="text-[7.5px] font-sans -mt-0.5 opacity-70">${safeVote}/5</span>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                </div>
                            ` : ''}
                        </div>

                        <!-- Footer Cột 1: Gợi ý Top 20 & Action Buttons -->
                        <div class="pt-3 border-t border-purple-100 space-y-2.5">
                            <div class="text-[11px] text-slate-500 flex items-center justify-between font-mono">
                                <span>Hoặc Top 20: Vốn 20M</span>
                                <span class="text-purple-700 font-bold">Ăn 84M</span>
                            </div>
                            <div class="flex flex-wrap gap-1.5">
                                <button type="button" id="btnCopyDeX2" class="flex-1 py-1.5 px-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-[11px] transition shadow-2xs text-center cursor-pointer">
                                    <i class="bi bi-clipboard-check"></i> Copy X2 (${deX2Nums.length}s)
                                </button>
                                ${deX1Nums.length ? `
                                    <button type="button" id="btnCopyDeX1" class="flex-1 py-1.5 px-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 font-bold text-[11px] transition shadow-2xs text-center cursor-pointer">
                                        <i class="bi bi-clipboard-check"></i> Copy X1 (${deX1Nums.length}s)
                                    </button>
                                ` : ''}
                                <button type="button" id="btnCopyDeTop20" class="py-1.5 px-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] transition shadow-2xs text-center cursor-pointer">
                                    <i class="bi bi-bullseye"></i> Top 20
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- CỘT 2: LÔ GỘP ĐA TẦNG -->
                    <div class="rounded-3xl border-2 border-indigo-300 bg-gradient-to-b from-indigo-50/50 via-white to-indigo-50/20 p-5 shadow-xs flex flex-col justify-between space-y-4">
                        <div>
                            <!-- Header Cột 2 -->
                            <div class="flex items-center justify-between border-b border-indigo-100 pb-3 mb-3">
                                <div class="flex items-center gap-2.5">
                                    <span class="flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-xs text-base">
                                        🎲
                                    </span>
                                    <div>
                                        <h4 class="text-sm font-black text-slate-900 uppercase tracking-wide">Lô Gộp Đa Tầng</h4>
                                        <p class="text-[11px] text-indigo-800 font-semibold">Tầng X5 đến X1 (Theo Phiếu Bầu)</p>
                                    </div>
                                </div>
                                <span class="rounded-full bg-indigo-100 text-indigo-900 border border-indigo-200 px-2.5 py-0.5 text-[10px] font-black">
                                    ${x5List.length + x4List.length + x3List.length + x2List.length + x1List.length} số
                                </span>
                            </div>

                            <!-- Kinh tế học -->
                            <div class="text-[11px] font-mono text-slate-600 bg-indigo-50/80 p-2.5 rounded-xl border border-indigo-100 mb-3 flex items-center justify-between">
                                <span>Cược: Hệ số x 2.2M</span>
                                <span>Ăn: Hệ số x 8M/nháy</span>
                            </div>

                            <!-- Tầng X5 đến X1 -->
                            <div class="space-y-2.5">
                                ${x5List.length ? `
                                    <div class="flex items-center justify-between gap-1.5">
                                        <span class="rounded bg-gradient-to-r from-rose-600 to-pink-600 text-white px-2 py-0.5 text-[10px] font-black shrink-0">TẦNG X5 (5 AI)</span>
                                        <div class="flex flex-wrap gap-1 justify-end">
                                            ${x5List.map(n => `<span class="badge-number font-mono font-black text-xs px-2.5 py-1 rounded-xl bg-rose-600 text-white shadow-2xs">${n} (5/5)</span>`).join('')}
                                        </div>
                                    </div>
                                ` : ''}

                                ${x4List.length ? `
                                    <div class="flex items-center justify-between gap-1.5">
                                        <span class="rounded bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 px-2 py-0.5 text-[10px] font-black shrink-0">TẦNG X4 (4 AI)</span>
                                        <div class="flex flex-wrap gap-1 justify-end">
                                            ${x4List.map(n => `<span class="badge-number font-mono font-black text-xs px-2.5 py-1 rounded-xl bg-amber-400 text-slate-950 shadow-2xs">${n} (4/5)</span>`).join('')}
                                        </div>
                                    </div>
                                ` : ''}

                                ${x3List.length ? `
                                    <div class="flex items-center justify-between gap-1.5">
                                        <span class="rounded bg-emerald-600 text-white px-2 py-0.5 text-[10px] font-black shrink-0">TẦNG X3 (3 AI)</span>
                                        <div class="flex flex-wrap gap-1 justify-end">
                                            ${x3List.map(n => `<span class="badge-number font-mono font-black text-xs px-2.5 py-1 rounded-xl bg-emerald-600 text-white shadow-2xs">${n} (3/5)</span>`).join('')}
                                        </div>
                                    </div>
                                ` : ''}

                                ${x2List.length ? `
                                    <div class="flex items-center justify-between gap-1.5">
                                        <span class="rounded bg-teal-600 text-white px-2 py-0.5 text-[10px] font-black shrink-0">TẦNG X2 (2 AI)</span>
                                        <div class="flex flex-wrap gap-1 justify-end">
                                            ${x2List.map(n => `<span class="badge-number font-mono font-bold text-xs px-2 py-0.5 rounded-xl bg-teal-50 border border-teal-300 text-teal-900">${n} (2/5)</span>`).join('')}
                                        </div>
                                    </div>
                                ` : ''}

                                ${x1List.length ? `
                                    <div class="flex items-center justify-between gap-1.5 pt-2 border-t border-indigo-100">
                                        <span class="rounded bg-slate-600 text-white px-2 py-0.5 text-[10px] font-bold shrink-0">TẦNG X1 (1 AI)</span>
                                        <div class="flex flex-wrap gap-1 justify-end">
                                            ${x1List.map(n => `<span class="badge-number font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">${n}</span>`).join('')}
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        </div>

                        <!-- Footer Cột 2: Gợi ý Top 6 & Action Buttons -->
                        <div class="pt-3 border-t border-indigo-100 space-y-2.5">
                            <div class="text-[11px] text-slate-500 flex items-center justify-between font-mono">
                                <span>Hoặc Top 6: Vốn 13.2M</span>
                                <span class="text-indigo-700 font-bold">Ăn 8M/nháy</span>
                            </div>
                            <div class="flex flex-wrap gap-1.5">
                                <button type="button" id="btnCopyLoTiered" class="flex-1 py-1.5 px-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white font-black text-[11px] transition shadow-2xs text-center cursor-pointer">
                                    <i class="bi bi-clipboard-check"></i> Copy Lô Đa Tầng
                                </button>
                                <button type="button" id="btnCopyLoTop6" class="py-1.5 px-2.5 rounded-xl bg-white hover:bg-slate-50 text-indigo-900 border border-indigo-300 font-bold text-[11px] transition shadow-2xs text-center cursor-pointer">
                                    <i class="bi bi-dice-6-fill"></i> Top 6 Phẳng
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- CỘT 3: 2 DÀN XIÊN 4 TINH HOA -->
                    <div class="rounded-3xl border-2 border-amber-300 bg-gradient-to-b from-amber-50/50 via-white to-amber-50/20 p-5 shadow-xs flex flex-col justify-between space-y-4">
                        <div>
                            <!-- Header Cột 3 -->
                            <div class="flex items-center justify-between border-b border-amber-100 pb-3 mb-3">
                                <div class="flex items-center gap-2.5">
                                    <span class="flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-xs text-base">
                                        💎
                                    </span>
                                    <div>
                                        <h4 class="text-sm font-black text-slate-900 uppercase tracking-wide">2 Dàn Xiên 4 Tinh Hoa</h4>
                                        <p class="text-[11px] text-amber-800 font-semibold">Cân Bằng Parity Đầu Chẵn/Lẻ</p>
                                    </div>
                                </div>
                                <span class="rounded-full bg-amber-100 text-amber-900 border border-amber-200 px-2.5 py-0.5 text-[10px] font-black">
                                    ${dan1.length + dan2.length} số
                                </span>
                            </div>

                            <!-- Kinh tế học -->
                            <div class="text-[11px] font-mono text-slate-600 bg-amber-50/80 p-2.5 rounded-xl border border-amber-100 mb-3 flex items-center justify-between">
                                <span>Vốn: 11M/dàn (Quây 11 vé)</span>
                                <span class="text-amber-700 font-bold">Ăn X4: 384M</span>
                            </div>

                            <!-- Dàn 1 -->
                            <div class="rounded-2xl p-3 bg-gradient-to-br from-amber-50 to-orange-50/40 border border-amber-200 space-y-2 mb-3">
                                <div class="flex items-center justify-between">
                                    <span class="text-xs font-black text-amber-900 flex items-center gap-1.5">
                                        <span class="rounded bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 px-2 py-0.5 text-[10px] font-black">DÀN 1</span>
                                        <span>4 Số Tuyển Chọn:</span>
                                    </span>
                                    <button type="button" id="btnCopyXien4Dan1" class="text-[10px] font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1 cursor-pointer">
                                        <i class="bi bi-clipboard"></i> Copy
                                    </button>
                                </div>
                                <div class="flex flex-wrap gap-1.5">
                                    ${dan1.map(n => `
                                        <span class="badge-number inline-flex items-center justify-center px-3 py-1.5 rounded-xl font-mono font-black text-sm bg-gradient-to-br from-amber-400 to-yellow-500 text-slate-950 shadow-2xs border border-amber-400">
                                            ${n}
                                        </span>
                                    `).join('')}
                                </div>
                                <div class="text-[10px] text-amber-800 flex items-center justify-between pt-1 border-t border-amber-200/50">
                                    <span>Đầu: ${dan1.map(n => n[0]).join(', ')}</span>
                                    <span class="font-mono">Quây 11 vé · 11M</span>
                                </div>
                            </div>

                            <!-- Dàn 2 -->
                            <div class="rounded-2xl p-3 bg-gradient-to-br from-indigo-50 to-purple-50/40 border border-indigo-200 space-y-2">
                                <div class="flex items-center justify-between">
                                    <span class="text-xs font-black text-indigo-900 flex items-center gap-1.5">
                                        <span class="rounded bg-indigo-600 text-white px-2 py-0.5 text-[10px] font-black">DÀN 2</span>
                                        <span>4 Số Đối Trọng:</span>
                                    </span>
                                    <button type="button" id="btnCopyXien4Dan2" class="text-[10px] font-bold text-indigo-800 hover:text-indigo-950 flex items-center gap-1 cursor-pointer">
                                        <i class="bi bi-clipboard"></i> Copy
                                    </button>
                                </div>
                                <div class="flex flex-wrap gap-1.5">
                                    ${dan2.map(n => `
                                        <span class="badge-number inline-flex items-center justify-center px-3 py-1.5 rounded-xl font-mono font-black text-sm bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-2xs">
                                            ${n}
                                        </span>
                                    `).join('')}
                                </div>
                                <div class="text-[10px] text-indigo-800 flex items-center justify-between pt-1 border-t border-indigo-200/50">
                                    <span>Đầu: ${dan2.map(n => n[0]).join(', ')}</span>
                                    <span class="font-mono">Quây 11 vé · 11M</span>
                                </div>
                            </div>
                        </div>

                        <!-- Footer Cột 3: Nguồn & Action Button -->
                        <div class="pt-3 border-t border-amber-100 space-y-2.5">
                            <div class="text-[10px] text-slate-500 flex items-center justify-between">
                                <span>Ăn X3: 84M · Ăn X2: 12M</span>
                                <span class="text-amber-800 font-semibold">${x4Data?.fromConfig ? 'JSON Niêm Phong' : 'Top 8 Parity'}</span>
                            </div>
                            <button type="button" id="btnCopyBothXien4Top" class="w-full py-1.5 px-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-95 text-slate-950 font-black text-[11px] transition shadow-2xs text-center cursor-pointer">
                                <i class="bi bi-dice-4-fill"></i> Copy Cả 2 Dàn Xiên 4 (22M)
                            </button>
                        </div>
                    </div>
                </div>

                <!-- ACCORDION Ở CUỐI: CHI TIẾT 5 AI ĐỘC LẬP -->
                <div class="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs" id="aiDetailsAccordionCard">
                    <button type="button" id="btnToggleAiModelsAccordion" class="w-full flex items-center justify-between gap-3 p-2 rounded-2xl hover:bg-slate-50 transition cursor-pointer text-left">
                        <div class="flex items-center gap-3">
                            <span class="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-100 text-slate-800 text-base shadow-2xs">
                                🤖
                            </span>
                            <div>
                                <h4 class="text-sm font-black text-slate-900 flex items-center gap-2">
                                    <span>Chi Tiết Dự Đoán Của 5 AI Độc Lập Ngày ${latestDay.date}</span>
                                    <span class="rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 border border-slate-200">
                                        5 Mô Hình
                                    </span>
                                </h4>
                                <p class="text-xs text-slate-500">Xem dàn Đề 20s, Lô 6s và Xiên 4 riêng biệt của ChatGPT, Claude, Gemini, Grok, Muse</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            <span class="text-xs font-bold text-indigo-600 hidden sm:inline" id="accordionToggleText">${state.aiDetailsOpen ? 'Thu gọn' : 'Bấm xem chi tiết'}</span>
                            <i class="bi bi-chevron-down text-sm text-slate-400 transition-transform ${state.aiDetailsOpen ? 'rotate-180' : ''}" id="accordionChevron"></i>
                        </div>
                    </button>

                    <!-- Container chi tiết 5 AI (Ẩn/Hiện) -->
                    <div id="aiModelsDetailsContainer" class="${state.aiDetailsOpen ? '' : 'hidden'} pt-4 mt-3 border-t border-slate-100">
                        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                            ${aiModelsList.map(ai => {
                                const info = ai.info;
                                if (!ai.hasData) {
                                    return `
                                        <div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3 text-center">
                                            <div class="text-2xl">${info.avatar || '🤖'}</div>
                                            <div class="font-black text-sm text-slate-900">${info.name}</div>
                                            <div class="text-xs text-amber-700 bg-amber-50 p-2 rounded-xl border border-amber-200">
                                                Đang đợi số liệu
                                            </div>
                                        </div>
                                    `;
                                }

                                return `
                                    <div class="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-2xs hover:border-slate-300 transition">
                                        <!-- Header Model -->
                                        <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                                            <div class="flex items-center gap-1.5">
                                                <span class="text-lg">${info.avatar || '🤖'}</span>
                                                <div>
                                                    <h5 class="font-black text-xs text-slate-900">${info.name}</h5>
                                                    <span class="text-[9px] text-slate-400 block">${info.provider || 'AI'}</span>
                                                </div>
                                            </div>
                                            ${ai.isFallback ? '<span class="text-[8px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">via Perplexity</span>' : ''}
                                        </div>

                                        <!-- Dàn Đề 20 số -->
                                        <div class="space-y-1.5">
                                            <div class="flex items-center justify-between text-[11px] font-bold text-slate-700">
                                                <span>Đề (20s):</span>
                                                <button type="button" class="btn-copy-ai-de text-[10px] text-purple-700 hover:text-purple-900 font-bold flex items-center gap-0.5 cursor-pointer" data-model="${ai.key}">
                                                    <i class="bi bi-clipboard"></i> Copy
                                                </button>
                                            </div>
                                            <div class="flex flex-wrap gap-1">
                                                ${ai.deNums.map(n => `<span class="badge-number flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-800 text-[11px] font-mono font-bold">${n}</span>`).join('')}
                                            </div>
                                        </div>

                                        <!-- Dàn Lô 6 số -->
                                        <div class="pt-2 border-t border-slate-100 space-y-1.5">
                                            <div class="flex items-center justify-between text-[11px] font-bold text-slate-700">
                                                <span>Lô (6s):</span>
                                                <button type="button" class="btn-copy-ai-lo text-[10px] text-indigo-700 hover:text-indigo-900 font-bold flex items-center gap-0.5 cursor-pointer" data-model="${ai.key}">
                                                    <i class="bi bi-clipboard"></i> Copy
                                                </button>
                                            </div>
                                            <div class="flex flex-wrap gap-1">
                                                ${ai.loNums.map(n => `<span class="badge-number flex items-center justify-center px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-mono font-black">${n}</span>`).join('')}
                                            </div>
                                        </div>

                                        <!-- 2 Dàn Xiên 4 của AI nếu có -->
                                        <div class="pt-2 border-t border-slate-100 space-y-1.5">
                                            <div class="flex items-center justify-between text-[11px] font-bold text-slate-700">
                                                <span>2 Dàn Xiên 4:</span>
                                                ${ai.hasX4 ? `
                                                    <button type="button" class="btn-copy-ai-x4 text-[10px] text-amber-800 hover:text-amber-950 font-bold flex items-center gap-0.5 cursor-pointer" data-model="${ai.key}">
                                                        <i class="bi bi-clipboard"></i> Copy
                                                    </button>
                                                ` : ''}
                                            </div>
                                            ${ai.hasX4 ? `
                                                <div class="space-y-1 font-mono text-[10px]">
                                                    <div class="p-1.5 rounded-lg bg-amber-50/70 border border-amber-200">
                                                        <span class="font-bold text-amber-900">D1:</span> ${ai.dan1.join(' ')}
                                                    </div>
                                                    <div class="p-1.5 rounded-lg bg-indigo-50/70 border border-indigo-200">
                                                        <span class="font-bold text-indigo-900">D2:</span> ${ai.dan2.join(' ')}
                                                    </div>
                                                </div>
                                            ` : `
                                                <div class="text-[10px] text-slate-400 italic">
                                                    Đóng góp 6 Lô vào bầu chọn Dàn Gộp
                                                </div>
                                            `}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        // ---------------------------------------------------------------------
        // EVENT HANDLERS CHO TOÀN BỘ CÁC NÚT CỦA BẢNG DỰ ĐOÁN HÔM NAY
        // ---------------------------------------------------------------------
        function toggleAiDetailsView(forceState) {
            state.aiDetailsOpen = typeof forceState === 'boolean' ? forceState : !state.aiDetailsOpen;
            const detailsContainer = document.getElementById('aiModelsDetailsContainer');
            const chevron = document.getElementById('accordionChevron');
            const toggleText = document.getElementById('accordionToggleText');
            const topLabel = document.getElementById('topAiToggleLabel');
            const topIcon = document.getElementById('topAiToggleIcon');

            if (detailsContainer) {
                detailsContainer.classList.toggle('hidden', !state.aiDetailsOpen);
            }
            if (chevron) {
                chevron.classList.toggle('rotate-180', state.aiDetailsOpen);
            }
            if (toggleText) {
                toggleText.textContent = state.aiDetailsOpen ? 'Thu gọn' : 'Bấm xem chi tiết';
            }
            if (topLabel) {
                topLabel.textContent = state.aiDetailsOpen ? 'Thu Gọn 5 AI' : 'Xem Chi Tiết 5 AI';
            }
            if (topIcon) {
                topIcon.classList.toggle('rotate-180', state.aiDetailsOpen);
            }

            if (state.aiDetailsOpen) {
                const card = document.getElementById('aiDetailsAccordionCard');
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        }

        // 1. Nút mở rộng/thu gọn 5 AI ở top bar & ở chân trang
        const btnToggleTop = document.getElementById('btnToggleAiPredictionsTop');
        if (btnToggleTop) {
            btnToggleTop.onclick = () => toggleAiDetailsView();
        }
        const btnToggleAccordion = document.getElementById('btnToggleAiModelsAccordion');
        if (btnToggleAccordion) {
            btnToggleAccordion.onclick = () => toggleAiDetailsView();
        }

        // 2. Nút Copy Toàn Bộ Dàn Gộp Hôm Nay ở top bar
        const btnCopyAll = document.getElementById('btnCopyAllConsensusTop');
        if (btnCopyAll) {
            btnCopyAll.onclick = () => {
                const text = [
                    `👑 BỘ DỰ ĐOÁN ĐỒNG THUẬN 5 AI NGÀY ${latestDay.date}:`,
                    '',
                    `🎯 1. ĐỀ GỘP ĐA TẦNG (${deX2Nums.length + deX1Nums.length} số):`,
                    `- Dàn X2 VIP (Cược 2M): ${deX2Nums.join(' ')}`,
                    deX1Nums.length ? `- Dàn X1 Lót (Cược 1M): ${deX1Nums.join(' ')}` : '',
                    `- Hoặc Top 20 phẳng (Cược 1M): ${deNums.join(' ')}`,
                    '',
                    '🎲 2. LÔ GỘP ĐA TẦNG (Hệ số x 2.2M):',
                    x5List.length ? `- Tầng X5 (Cược 11M): ${x5List.join(' ')}` : '',
                    x4List.length ? `- Tầng X4 (Cược 8.8M): ${x4List.join(' ')}` : '',
                    x3List.length ? `- Tầng X3 (Cược 6.6M): ${x3List.join(' ')}` : '',
                    x2List.length ? `- Tầng X2 (Cược 4.4M): ${x2List.join(' ')}` : '',
                    x1List.length ? `- Tầng X1 (Cược 2.2M): ${x1List.join(' ')}` : '',
                    `- Hoặc Top 6 phẳng (Cược 2.2M): ${loNums.join(' ')}`,
                    '',
                    '💎 3. 2 DÀN XIÊN 4 TINH HOA (Vốn 22M):',
                    `- Dàn 1 (11M): ${dan1.join(' ')}`,
                    `- Dàn 2 (11M): ${dan2.join(' ')}`
                ].filter(Boolean).join('\n');

                copyToClipboard(text, 'Toàn bộ dàn hôm nay');
            };
        }

        // 3. Nút Copy Cột 1: Đề Gộp
        document.getElementById('btnCopyDeX2')?.addEventListener('click', () => {
            copyToClipboard(deX2Nums.join(' '), `Dàn Đề X2 VIP (${deX2Nums.length} số)`);
        });
        document.getElementById('btnCopyDeX1')?.addEventListener('click', () => {
            copyToClipboard(deX1Nums.join(' '), `Dàn Đề X1 Lót (${deX1Nums.length} số)`);
        });
        document.getElementById('btnCopyDeTop20')?.addEventListener('click', () => {
            copyToClipboard(deNums.join(' '), 'Dàn Đề Top 20 phẳng');
        });

        // 4. Nút Copy Cột 2: Lô Gộp
        document.getElementById('btnCopyLoTiered')?.addEventListener('click', () => {
            const lines = [`🎲 LÔ GỘP ĐA TẦNG 5 AI NGÀY ${latestDay.date}:`];
            if (x5List.length) lines.push(`- Tầng X5 (Cược 11M): ${x5List.join(' ')}`);
            if (x4List.length) lines.push(`- Tầng X4 (Cược 8.8M): ${x4List.join(' ')}`);
            if (x3List.length) lines.push(`- Tầng X3 (Cược 6.6M): ${x3List.join(' ')}`);
            if (x2List.length) lines.push(`- Tầng X2 (Cược 4.4M): ${x2List.join(' ')}`);
            if (x1List.length) lines.push(`- Tầng X1 (Cược 2.2M): ${x1List.join(' ')}`);
            copyToClipboard(lines.join('\n'), 'Lô Đa Tầng 5 AI (X5 -> X1)');
        });
        document.getElementById('btnCopyLoTop6')?.addEventListener('click', () => {
            copyToClipboard(loNums.join(' '), 'Top 6 Lô phẳng');
        });

        // 5. Nút Copy Cột 3: Xiên 4
        document.getElementById('btnCopyXien4Dan1')?.addEventListener('click', () => {
            copyToClipboard(dan1.join(' '), 'Xiên 4 Dàn 1');
        });
        document.getElementById('btnCopyXien4Dan2')?.addEventListener('click', () => {
            copyToClipboard(dan2.join(' '), 'Xiên 4 Dàn 2');
        });
        document.getElementById('btnCopyBothXien4Top')?.addEventListener('click', () => {
            const txt = `💎 2 DÀN XIÊN 4 TINH HOA (${latestDay.date}):\n- Dàn 1: ${dan1.join(' ')}\n- Dàn 2: ${dan2.join(' ')}\nVốn: 22M (Ăn X4: 384M · X3: 84M · X2: 12M)`;
            copyToClipboard(txt, 'Cả 2 Dàn Xiên 4 Tinh Hoa');
        });

        // 6. Nút Copy của từng AI trong accordion
        container.querySelectorAll('.btn-copy-ai-de').forEach(btn => {
            btn.onclick = () => {
                const mKey = btn.dataset.model;
                const ai = aiModelsList.find(x => x.key === mKey);
                if (ai && ai.deNums.length) {
                    copyToClipboard(ai.deNums.join(' '), `Dàn Đề ${ai.info.name}`);
                }
            };
        });
        container.querySelectorAll('.btn-copy-ai-lo').forEach(btn => {
            btn.onclick = () => {
                const mKey = btn.dataset.model;
                const ai = aiModelsList.find(x => x.key === mKey);
                if (ai && ai.loNums.length) {
                    copyToClipboard(ai.loNums.join(' '), `Dàn Lô ${ai.info.name}`);
                }
            };
        });
        container.querySelectorAll('.btn-copy-ai-x4').forEach(btn => {
            btn.onclick = () => {
                const mKey = btn.dataset.model;
                const ai = aiModelsList.find(x => x.key === mKey);
                if (ai && ai.hasX4) {
                    const txt = `Dàn 1: ${ai.dan1.join(' ')}\nDàn 2: ${ai.dan2.join(' ')}`;
                    copyToClipboard(txt, `2 Dàn Xiên 4 ${ai.info.name}`);
                }
            };
        });
    }

    // -------------------------------------------------------------------------
    // COLLAPSE / EXPAND HELPERS FOR HISTORICAL LEDGER
    // -------------------------------------------------------------------------
    function toggleDayDetail(date, forceState) {
        const container = document.getElementById(`ledgerDetail-${date}`);
        if (!container) return;

        let willExpand;
        if (typeof forceState === 'boolean') {
            willExpand = forceState;
        } else {
            willExpand = container.classList.contains('hidden');
        }

        if (willExpand) {
            container.classList.remove('hidden');
            state.expandedDays.add(date);
        } else {
            container.classList.add('hidden');
            state.expandedDays.delete(date);
        }

        // Cập nhật text & icon của tất cả nút toggle của ngày này
        document.querySelectorAll(`.btn-toggle-day-detail[data-date="${date}"]`).forEach(btn => {
            const textSpan = btn.querySelector('.toggle-text');
            const icon = btn.querySelector('.detail-chevron');
            if (textSpan) textSpan.textContent = willExpand ? 'Thu gọn' : 'Xem chi tiết';
            if (icon) {
                icon.className = `bi bi-chevron-${willExpand ? 'up' : 'down'} text-[10px] detail-chevron`;
            }
            if (willExpand) {
                btn.classList.add('bg-indigo-50', 'border-indigo-300', 'text-indigo-700');
                btn.classList.remove('bg-white', 'border-slate-300', 'text-slate-700');
            } else {
                btn.classList.remove('bg-indigo-50', 'border-indigo-300', 'text-indigo-700');
                btn.classList.add('bg-white', 'border-slate-300', 'text-slate-700');
            }
        });

        // Cập nhật indicators trên các KPI cards nếu có
        document.querySelectorAll(`.kpi-card-interactive[data-date="${date}"]`).forEach(card => {
            const ind = card.querySelector('.kpi-expand-indicator');
            if (ind) {
                ind.innerHTML = willExpand 
                    ? '<span>Thu gọn dàn số</span><i class="bi bi-chevron-up text-[7px]"></i>' 
                    : '<span>Chi tiết dàn số</span><i class="bi bi-chevron-down text-[7px]"></i>';
            }
        });

        updateToggleAllButtonState();
    }

    function updateToggleAllButtonState() {
        const textSpan = document.getElementById('textToggleAll');
        const icon = document.getElementById('iconToggleAll');
        if (!textSpan || !state.payload?.history?.length) return;

        const allDates = state.payload.history.map(d => d.date);
        const allExpanded = allDates.length > 0 && allDates.every(d => state.expandedDays.has(d));

        textSpan.textContent = allExpanded ? 'Thu gọn tất cả' : 'Mở rộng tất cả';
        if (icon) {
            icon.className = allExpanded ? 'bi bi-arrows-collapse text-indigo-600' : 'bi bi-arrows-expand text-indigo-600';
        }
    }

    function setupToggleAllLedger() {
        const btn = document.getElementById('btnToggleAllLedger');
        if (!btn || btn.__bound) return;
        btn.__bound = true;

        btn.addEventListener('click', () => {
            if (!state.payload?.history?.length) return;
            const allDates = state.payload.history.map(d => d.date);
            const allExpanded = allDates.length > 0 && allDates.every(d => state.expandedDays.has(d));

            allDates.forEach(date => {
                toggleDayDetail(date, !allExpanded);
            });
            updateToggleAllButtonState();
        });
    }

    // -------------------------------------------------------------------------
    // RENDER: Helper cập nhật Sub-Tab của 1 ngày trong nhật ký đối soát
    // -------------------------------------------------------------------------
    function updateDaySubTabUI(date, selectedModel) {
        const container = document.getElementById("ledgerDetail-" + date);
        if (!container) return;

        // 1. Cập nhật class active trên các nút sub-tab
        container.querySelectorAll(".btn-day-subtab").forEach(btn => {
            const m = btn.dataset.model;
            if (m === selectedModel) {
                btn.className = "btn-day-subtab px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-xs bg-indigo-600 text-white ring-2 ring-indigo-300";
            } else {
                btn.className = "btn-day-subtab px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-2xs";
            }
        });

        // 2. Cập nhật khung nội dung chi tiết của ngày đó
        const body = document.getElementById("dayDetailBody-" + date);
        if (!body || !state.payload) return;

        const day = (state.payload.history || []).find(d => d.date === date);
        if (!day) return;

        const isSettled = Boolean(day.special && day.prizes27?.length === 27 && day.results);
        const specialStr = day.special ? String(day.special).padStart(2, "0") : null;
        const p27 = day.prizes27 || [];
        const p27Counts = {};
        p27.forEach(p => {
            const num = String(p).padStart(2, "0").slice(-2);
            p27Counts[num] = (p27Counts[num] || 0) + 1;
        });

        body.innerHTML = renderDayDetailModelBody(day, selectedModel, state.payload.models, p27Counts, specialStr, isSettled);
    }

    // -------------------------------------------------------------------------
    // RENDER: Khung nội dung chi tiết theo Mô hình (Dàn Gộp Consensus hoặc 1 trong 5 AI)
    // -------------------------------------------------------------------------
    function renderDayDetailModelBody(day, modelKey, models = {}, p27Counts = {}, specialStr = null, isSettled = false) {
        const dateStr = day.date;
        const results = day.results || {};
        const sources = day.sources || {};
        const cons = day.consensus || {};
        const rates = day.rates || {};

        // TRƯỜNG HỢP 1: PHƯƠNG PHÁP GỘP 5 AI (CONSENSUS ĐA TẦNG)
        if (modelKey === "consensus") {
            const consRes = results.consensus || {};
            const deRes = consRes.deTiered || consRes.de || {};
            const loRes = consRes.loTiered || consRes.lo || {};
            const x4Res = consRes.xien4;
            const deX2Nums = cons.deTiers?.x2Nums || [];
            const deX1Nums = cons.deTiers?.x1Nums || [];
            const deVotesMap = cons.deVotesMap || {};
            const isConsWin = (consRes.totalProfitK || 0) >= 0;

            const consRates = rates.consensus || {};
            const cumDe = consRates.deTiered?.profitK ?? consRates.de?.profitK ?? null;
            const cumLo = consRates.loTiered?.profitK ?? consRates.lo?.profitK ?? null;
            const cumXien = consRates.xien4?.profitK ?? null;
            const cumCombo = consRates.combo?.profitK ?? null;

            return `
                <div class="space-y-4">
                    <!-- Thanh KPI Tổng Thể của Dàn Gộp -->
                    <div class="rounded-2xl bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 p-4 text-white shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div class="flex items-center gap-3">
                            <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white text-xl shadow-inner border border-white/20">
                                👑
                            </span>
                            <div>
                                <div class="flex items-center gap-2">
                                    <h4 class="text-sm font-black text-white uppercase tracking-wide">
                                        PHƯƠNG PHÁP GỘP 5 AI (CONSENSUS ĐA TẦNG)
                                    </h4>
                                    <span class="rounded-full bg-purple-500 text-white px-2 py-0.5 text-[9px] font-black uppercase shadow-2xs">
                                        Chiến Lược Chủ Đạo
                                    </span>
                                </div>
                                <p class="text-xs text-purple-200">
                                    Bầu chọn đa số từ 5 AI: Đề phân tầng X2/X1 · Lô phân tầng X5..X1 · 2 Dàn Xiên 4 Tinh Hoa
                                </p>
                            </div>
                        </div>

                        ${isSettled ? `
                            <div class="flex flex-wrap items-center gap-2 self-start sm:self-auto font-mono text-xs">
                                <div class="rounded-xl bg-white/10 border border-white/20 px-3 py-1.5 shadow-2xs">
                                    <span class="text-[9px] block uppercase font-bold text-slate-300">Vốn Tổng:</span>
                                    <span class="font-black text-white">${formatMoney(consRes.totalStakeK, { signed: false })}</span>
                                </div>
                                <div class="rounded-xl bg-white/10 border border-white/20 px-3 py-1.5 shadow-2xs">
                                    <span class="text-[9px] block uppercase font-bold text-slate-300">Ăn Tổng:</span>
                                    <span class="font-black text-emerald-300">${formatMoney(consRes.totalPayoutK, { signed: false })}</span>
                                </div>
                                <div class="rounded-xl ${isConsWin ? "bg-emerald-500/90 text-white border border-emerald-400" : "bg-rose-500/90 text-white border border-rose-400"} px-3.5 py-1.5 shadow-2xs font-bold">
                                    <span class="text-[9px] block uppercase opacity-85">Lãi Ngày:</span>
                                    <span class="text-sm font-black">${formatMoney(consRes.totalProfitK)}</span>
                                </div>
                                ${cumCombo !== null ? `
                                    <div class="rounded-xl ${cumCombo >= 0 ? "bg-emerald-400 text-slate-950 border border-emerald-300 font-black" : "bg-rose-900/80 text-rose-200 border border-rose-500/50"} px-3.5 py-1.5 shadow-2xs">
                                        <span class="text-[9px] block uppercase font-black tracking-wider ${cumCombo >= 0 ? "text-slate-800" : "text-rose-300"}">LŨY KẾ COMBO:</span>
                                        <span class="text-sm font-black">${formatMoney(cumCombo)}</span>
                                    </div>
                                ` : ""}
                            </div>
                        ` : `
                            <div class="text-xs font-bold text-amber-300 flex items-center gap-2">
                                <i class="bi bi-shield-lock-fill text-amber-400 text-base"></i> Dàn số đã niêm phong - Chờ kết toán lúc 19:00
                            </div>
                        `}
                    </div>

                    <!-- 3 CỘT ĐỐI SOÁT CHI TIẾT (ĐỀ · LÔ · XIÊN 4) -->
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
                        <!-- CỘT 1: ĐỀ GỘP ĐA TẦNG -->
                        ${(state.ledgerCategory === "all" || state.ledgerCategory === "de") ? `
                            <div class="rounded-2xl bg-white border border-purple-200 p-4 space-y-3.5 flex flex-col justify-between shadow-xs">
                                <div class="space-y-3">
                                    <div class="flex items-center justify-between border-b border-purple-100 pb-2">
                                        <div class="flex items-center gap-2">
                                            <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-900 text-sm font-black">🎯</span>
                                            <div>
                                                <h5 class="text-xs font-black text-slate-900 uppercase">Đề Gộp (${deX2Nums.length + deX1Nums.length} số)</h5>
                                                <span class="text-[10px] text-slate-500">VIP X2 (2M/số) & Lót X1 (1M/số)</span>
                                            </div>
                                        </div>
                                        ${isSettled ? `
                                            <span class="rounded-xl px-2.5 py-1 text-xs font-black ${deRes.isHit ? (deRes.hitTier === "X2" ? "bg-amber-400 text-slate-950 border border-amber-500 shadow-xs animate-bounce" : "bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs") : "bg-slate-100 text-slate-500 border border-slate-200"}">
                                                ${deRes.isHit ? `⭐ TRÚNG ĐB [${specialStr}] (${deRes.hitTier || "X1"})` : "❌ Trượt Đề"}
                                            </span>
                                        ` : `
                                            <span class="rounded-lg px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">Đã khóa</span>
                                        `}
                                    </div>

                                    ${isSettled ? `
                                        <div class="text-[11px] font-mono text-slate-600 flex flex-wrap items-center justify-between gap-1.5 bg-purple-50/60 p-2.5 rounded-xl border border-purple-100">
                                            <div>Vốn ${formatMoney(deRes.stakeK, { signed: false })} · Ăn <strong class="text-emerald-700">${formatMoney(deRes.payoutK, { signed: false })}</strong></div>
                                            <div class="flex items-center gap-1.5">
                                                <span>Lãi: <strong class="${deRes.profitK >= 0 ? "text-emerald-700" : "text-rose-600"}">${formatMoney(deRes.profitK)}</strong></span>
                                                ${cumDe !== null ? `<span class="text-slate-400 font-sans">(LK: <strong class="${cumDe >= 0 ? "text-emerald-700" : "text-rose-600"} font-mono">${formatMoney(cumDe)}</strong>)</span>` : ""}
                                            </div>
                                        </div>
                                    ` : ""}

                                    <!-- Dàn X2 (VIP) -->
                                    <div class="space-y-1.5">
                                        <div class="flex items-center justify-between text-xs font-bold text-amber-950">
                                            <span class="flex items-center gap-1.5">
                                                <span class="rounded bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 px-2 py-0.5 text-[10px] font-black shadow-2xs">TẦNG VIP X2</span>
                                                <span>Đồng thuận cao (${deX2Nums.length} số):</span>
                                            </span>
                                            <div class="flex items-center gap-1.5">
                                                <span class="font-mono text-amber-900 text-[10px] font-bold">2M/số · Ăn 168M</span>
                                                <button type="button" class="btn-copy-day-dan p-1 rounded hover:bg-amber-100 text-amber-800 transition cursor-pointer" data-copy-text="${deX2Nums.join(" ")}" data-copy-label="Dàn Đề VIP X2 ngày ${dateStr}" title="Copy Dàn VIP X2">
                                                    <i class="bi bi-clipboard text-xs"></i>
                                                </button>
                                            </div>
                                        </div>
                                        <div class="flex flex-wrap gap-1.5 p-2 rounded-xl bg-amber-50/50 border border-amber-200/70 min-h-[40px] items-center">
                                            ${deX2Nums.length === 0 ? `<span class="text-slate-400 italic text-xs">Không có số</span>` : deX2Nums.map(n => {
                                                const isHit = specialStr && n === specialStr;
                                                const votes = Number(getVoteCount(deVotesMap, n, 2)) || 2;
                                                if (isHit) {
                                                    return `
                                                        <span class="badge-number inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 font-mono font-black text-xs ring-4 ring-amber-300 shadow-md animate-bounce" title="👑 NỔ ĐẶC BIỆT X2: ${n}">
                                                            <span>⭐ ${n}</span>
                                                            <span class="rounded bg-black/80 text-amber-300 px-1 py-0.2 text-[8px] font-sans">ĂN 168M</span>
                                                        </span>
                                                    `;
                                                }
                                                return `
                                                    <span class="badge-number inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-amber-300 text-amber-950 font-mono text-xs font-bold shadow-2xs" title="Đề VIP ${n} (${votes}/5 votes)">
                                                        <span>${n}</span>
                                                        <span class="text-[8px] font-sans text-amber-700 bg-amber-100 px-1 rounded">${votes}/5</span>
                                                    </span>
                                                `;
                                            }).join("")}
                                        </div>
                                    </div>

                                    <!-- Dàn X1 (Lót) -->
                                    <div class="space-y-1.5 pt-2 border-t border-purple-100">
                                        <div class="flex items-center justify-between text-xs font-bold text-indigo-950">
                                            <span class="flex items-center gap-1.5">
                                                <span class="rounded bg-indigo-100 text-indigo-900 border border-indigo-200 px-2 py-0.5 text-[10px] font-bold">TẦNG LÓT X1</span>
                                                <span>Đồng thuận lót (${deX1Nums.length} số):</span>
                                            </span>
                                            <div class="flex items-center gap-1.5">
                                                <span class="font-mono text-indigo-700 text-[10px] font-bold">1M/số · Ăn 84M</span>
                                                <button type="button" class="btn-copy-day-dan p-1 rounded hover:bg-indigo-100 text-indigo-800 transition cursor-pointer" data-copy-text="${deX1Nums.join(" ")}" data-copy-label="Dàn Đề Lót X1 ngày ${dateStr}" title="Copy Dàn Lót X1">
                                                    <i class="bi bi-clipboard text-xs"></i>
                                                </button>
                                            </div>
                                        </div>
                                        <div class="flex flex-wrap gap-1.5 p-2 rounded-xl bg-indigo-50/40 border border-indigo-100 min-h-[40px] items-center">
                                            ${deX1Nums.length === 0 ? `<span class="text-slate-400 italic text-xs">Không có số</span>` : deX1Nums.map(n => {
                                                const isHit = specialStr && n === specialStr;
                                                const votes = Number(getVoteCount(deVotesMap, n, 1)) || 1;
                                                if (isHit) {
                                                    return `
                                                        <span class="badge-number inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500 text-slate-950 font-mono font-black text-xs ring-4 ring-emerald-300 shadow-md animate-bounce" title="⭐ NỔ ĐẶC BIỆT X1: ${n}">
                                                            <span>⭐ ${n}</span>
                                                            <span class="rounded bg-black/80 text-emerald-200 px-1 py-0.2 text-[8px] font-sans">ĂN 84M</span>
                                                        </span>
                                                    `;
                                                }
                                                return `
                                                    <span class="badge-number inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-indigo-200 text-indigo-950 font-mono text-xs font-semibold shadow-2xs" title="Đề Lót ${n} (${votes}/5 votes)">
                                                        <span>${n}</span>
                                                        <span class="text-[8px] font-sans text-indigo-600 bg-indigo-50 px-1 rounded">${votes}/5</span>
                                                    </span>
                                                `;
                                            }).join("")}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ` : ""}

                        <!-- CỘT 2: LÔ GỘP ĐA TẦNG (PHÂN TẦNG THEO HỆ SỐ VOTE X5..X1) -->
                        ${(state.ledgerCategory === "all" || state.ledgerCategory === "lo") ? (() => {
                            const consDetails = consRes.consensusDetails || {};
                            const loTiers = cons.loTiers || consDetails.loTiers || {};
                            const x5Nums = loTiers.x5Nums || [];
                            const x4Nums = loTiers.x4Nums || [];
                            const x3Nums = loTiers.x3Nums || [];
                            const x2Nums = loTiers.x2Nums || [];
                            const x1Nums = loTiers.x1Nums || [];
                            const loTop6 = cons.loTop6 || [];
                            const allLoNums = [
                                ...x5Nums,
                                ...x4Nums,
                                ...x3Nums,
                                ...x2Nums,
                                ...x1Nums
                            ];
                            const displayLo = allLoNums.length > 0 ? allLoNums : loTop6;
                            const breakdown = loRes.breakdown || {};

                            const tierConfigs = [
                                {
                                    key: 'x5',
                                    mult: 5,
                                    name: 'TẦNG X5',
                                    sub: '5/5 AI Đồng Thuận',
                                    nums: x5Nums,
                                    stakePerNumM: 11.0,
                                    payoutPerHitM: 40.0,
                                    badgeBg: 'bg-gradient-to-r from-rose-600 to-pink-600 text-white',
                                    ringClass: 'ring-rose-300',
                                    containerBg: 'bg-rose-50/50 border-rose-200/80',
                                    headerColor: 'text-rose-950',
                                    icon: '💎'
                                },
                                {
                                    key: 'x4',
                                    mult: 4,
                                    name: 'TẦNG X4',
                                    sub: '4/5 AI Đồng Thuận',
                                    nums: x4Nums,
                                    stakePerNumM: 8.8,
                                    payoutPerHitM: 32.0,
                                    badgeBg: 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-black',
                                    ringClass: 'ring-amber-300',
                                    containerBg: 'bg-amber-50/50 border-amber-200/80',
                                    headerColor: 'text-amber-950',
                                    icon: '👑'
                                },
                                {
                                    key: 'x3',
                                    mult: 3,
                                    name: 'TẦNG X3',
                                    sub: '3/5 AI Đa Số',
                                    nums: x3Nums,
                                    stakePerNumM: 6.6,
                                    payoutPerHitM: 24.0,
                                    badgeBg: 'bg-emerald-600 text-white font-black',
                                    ringClass: 'ring-emerald-300',
                                    containerBg: 'bg-emerald-50/50 border-emerald-200/80',
                                    headerColor: 'text-emerald-950',
                                    icon: '⭐'
                                },
                                {
                                    key: 'x2',
                                    mult: 2,
                                    name: 'TẦNG X2',
                                    sub: '2/5 AI Đồng Thuận',
                                    nums: x2Nums,
                                    stakePerNumM: 4.4,
                                    payoutPerHitM: 16.0,
                                    badgeBg: 'bg-teal-600 text-white font-bold',
                                    ringClass: 'ring-teal-300',
                                    containerBg: 'bg-teal-50/40 border-teal-200/80',
                                    headerColor: 'text-teal-950',
                                    icon: '🎲'
                                },
                                {
                                    key: 'x1',
                                    mult: 1,
                                    name: 'TẦNG X1',
                                    sub: '1/5 AI Lót Dự Phòng',
                                    nums: x1Nums,
                                    stakePerNumM: 2.2,
                                    payoutPerHitM: 8.0,
                                    badgeBg: 'bg-slate-600 text-white font-bold',
                                    ringClass: 'ring-slate-300',
                                    containerBg: 'bg-slate-50 border-slate-200',
                                    headerColor: 'text-slate-800',
                                    icon: '🛡️'
                                }
                            ];

                            const activeTiers = tierConfigs.filter(t => t.nums && t.nums.length > 0);

                            return `
                                <div class="rounded-2xl bg-white border border-indigo-200 p-4 space-y-3.5 flex flex-col justify-between shadow-xs">
                                    <div class="space-y-3">
                                        <div class="flex items-center justify-between border-b border-indigo-100 pb-2">
                                            <div class="flex items-center gap-2">
                                                <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-900 text-sm font-black">🎲</span>
                                                <div>
                                                    <h5 class="text-xs font-black text-slate-900 uppercase">Lô Gộp Đa Tầng (${displayLo.length} số)</h5>
                                                    <span class="text-[10px] text-slate-500">Phân tầng X5..X1 (Theo Phiếu Bầu 5 AI)</span>
                                                </div>
                                            </div>
                                            ${isSettled ? `
                                                <span class="rounded-xl px-2.5 py-1 text-xs font-black ${loRes.hits > 0 ? "bg-emerald-600 text-white shadow-xs" : "bg-slate-100 text-slate-500 border border-slate-200"}">
                                                    ${loRes.hits > 0 ? `🎯 NỔ ${loRes.hits} NHÁY` : "❌ Trượt Lô"}
                                                </span>
                                            ` : `
                                                <span class="rounded-lg px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">Đã khóa</span>
                                            `}
                                        </div>

                                        ${isSettled ? `
                                            <div class="text-[11px] font-mono text-slate-600 flex flex-wrap items-center justify-between gap-1.5 bg-indigo-50/60 p-2.5 rounded-xl border border-indigo-100">
                                                <div>Vốn ${formatMoney(loRes.stakeK, { signed: false })} · Ăn <strong class="text-emerald-700">${formatMoney(loRes.payoutK, { signed: false })}</strong></div>
                                                <div class="flex items-center gap-1.5">
                                                    <span>Lãi: <strong class="${loRes.profitK >= 0 ? "text-emerald-700" : "text-rose-600"}">${formatMoney(loRes.profitK)}</strong></span>
                                                    ${cumLo !== null ? `<span class="text-slate-400 font-sans">(LK: <strong class="${cumLo >= 0 ? "text-emerald-700" : "text-rose-600"} font-mono">${formatMoney(cumLo)}</strong>)</span>` : ""}
                                                </div>
                                            </div>
                                        ` : ""}

                                        <!-- DANH SÁCH LÔ PHÂN TẦNG X5 ĐẾN X1 -->
                                        <div class="space-y-2.5">
                                            ${activeTiers.length > 0 ? activeTiers.map(tier => {
                                                return `
                                                    <div class="space-y-1.5 pt-2 first:pt-0 border-t first:border-t-0 border-indigo-100/80">
                                                        <div class="flex items-center justify-between text-xs font-bold ${tier.headerColor}">
                                                            <span class="flex items-center gap-1.5">
                                                                <span class="rounded ${tier.badgeBg} px-2 py-0.5 text-[10px] font-black shadow-2xs">${tier.name}</span>
                                                                <span>${tier.sub} (${tier.nums.length}s):</span>
                                                            </span>
                                                            <div class="flex items-center gap-1.5">
                                                                <span class="font-mono text-[10px] text-slate-500 font-bold">${tier.stakePerNumM}M/số · Ăn ${tier.payoutPerHitM}M/n</span>
                                                                <button type="button" class="btn-copy-day-dan p-1 rounded hover:bg-slate-100 text-slate-700 transition cursor-pointer" data-copy-text="${tier.nums.join(" ")}" data-copy-label="Dàn Lô ${tier.name} ngày ${dateStr}" title="Copy ${tier.name}">
                                                                    <i class="bi bi-clipboard text-xs"></i>
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div class="flex flex-wrap gap-1.5 p-2 rounded-xl ${tier.containerBg} border min-h-[40px] items-center">
                                                            ${tier.nums.map(n => {
                                                                const hits = p27Counts[n] || 0;
                                                                const winM = (hits * tier.payoutPerHitM).toFixed(0);
                                                                if (hits > 0) {
                                                                    return `
                                                                        <span class="badge-number inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-600 text-white font-mono font-black text-xs ring-2 ${tier.ringClass} shadow-xs animate-pulse" title="🎯 NỔ ${hits} NHÁY LÔ ${n} [${tier.name}]: Ăn ${winM}M">
                                                                            <span>🎯 ${n}</span>
                                                                            <span class="rounded bg-white text-emerald-900 font-bold px-1 text-[8px] font-sans">${hits}n (+${winM}M)</span>
                                                                        </span>
                                                                    `;
                                                                }
                                                                return `
                                                                    <span class="badge-number inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-mono text-xs font-semibold shadow-2xs" title="Lô ${n} (${tier.mult}/5 AI bầu chọn)">
                                                                        <span>${n}</span>
                                                                        <span class="text-[8px] font-sans text-slate-400 font-bold">${tier.mult}/5</span>
                                                                    </span>
                                                                `;
                                                            }).join("")}
                                                        </div>
                                                    </div>
                                                `;
                                            }).join("") : `
                                                <div class="space-y-1.5">
                                                    <div class="flex items-center justify-between text-xs font-bold text-slate-700">
                                                        <span>Dàn Lô Đồng Thuận (${displayLo.length} số):</span>
                                                        <button type="button" class="btn-copy-day-dan px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-[10px] font-bold border border-indigo-200 transition cursor-pointer flex items-center gap-1" data-copy-text="${displayLo.join(" ")}" data-copy-label="Dàn Lô Gộp ngày ${dateStr}">
                                                            <i class="bi bi-clipboard"></i> Copy Dàn Lô
                                                        </button>
                                                    </div>
                                                    <div class="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-50 border border-slate-200 min-h-[40px] items-center">
                                                        ${displayLo.map(n => {
                                                            const hits = p27Counts[n] || 0;
                                                            if (hits > 0) {
                                                                return `
                                                                    <span class="badge-number inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-600 text-white font-mono font-black text-xs ring-2 ring-emerald-300 shadow-xs animate-pulse">
                                                                        <span>🎯 ${n}</span>
                                                                        <span class="rounded bg-white text-emerald-900 font-bold px-1 text-[8px] font-sans">${hits}n</span>
                                                                    </span>
                                                                `;
                                                            }
                                                            return `
                                                                <span class="badge-number inline-flex items-center px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-600 font-mono text-xs shadow-2xs">
                                                                    ${n}
                                                                </span>
                                                            `;
                                                        }).join("")}
                                                    </div>
                                                </div>
                                            `}
                                        </div>
                                    </div>

                                    <!-- FOOTER CỘT 2: ACTION BUTTONS SAO CHÉP -->
                                    <div class="pt-3 border-t border-indigo-100 space-y-2">
                                        <div class="text-[11px] text-slate-500 flex items-center justify-between font-mono">
                                            <span>Hoặc Top 6 Phẳng: Vốn 13.2M</span>
                                            <span class="text-indigo-700 font-bold">Ăn 8M/nháy</span>
                                        </div>
                                        <div class="flex flex-wrap gap-1.5">
                                            <button type="button" class="btn-copy-day-dan flex-1 py-1.5 px-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white font-black text-[11px] transition shadow-2xs text-center cursor-pointer" data-copy-text="${allLoNums.join(" ")}" data-copy-label="Toàn bộ Dàn Lô Đa Tầng ngày ${dateStr}">
                                                <i class="bi bi-clipboard-check"></i> Copy Lô Đa Tầng (${allLoNums.length}s)
                                            </button>
                                            ${loTop6.length > 0 ? `
                                                <button type="button" class="btn-copy-day-dan py-1.5 px-2.5 rounded-xl bg-white hover:bg-slate-50 text-indigo-900 border border-indigo-300 font-bold text-[11px] transition shadow-2xs text-center cursor-pointer" data-copy-text="${loTop6.join(" ")}" data-copy-label="Dàn Lô Top 6 Phẳng ngày ${dateStr}">
                                                    <i class="bi bi-dice-6-fill"></i> Top 6 (${loTop6.length}s)
                                                </button>
                                            ` : ""}
                                        </div>
                                    </div>
                                </div>
                            `;
                        })() : ""}

                        <!-- CỘT 3: 2 DÀN XIÊN 4 TINH HOA -->
                        ${(state.ledgerCategory === "all" || state.ledgerCategory === "xien4") && cons.xien4 ? (() => {
                            const x4 = cons.xien4 || {};
                            const dan1 = x4.dan1 || [];
                            const dan2 = x4.dan2 || [];
                            return `
                                <div class="rounded-2xl bg-white border border-amber-200 p-4 space-y-3.5 flex flex-col justify-between shadow-xs">
                                    <div class="space-y-3">
                                        <div class="flex items-center justify-between border-b border-amber-100 pb-2">
                                            <div class="flex items-center gap-2">
                                                <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-900 text-sm font-black">💎</span>
                                                <div>
                                                    <h5 class="text-xs font-black text-slate-900 uppercase">2 Dàn Xiên 4 Tinh Hoa</h5>
                                                    <span class="text-[10px] text-slate-500">Vốn 22M (11M/dàn) · Ăn tới 384M</span>
                                                </div>
                                            </div>
                                            ${isSettled && x4Res ? `
                                                <span class="rounded-xl px-2.5 py-1 text-xs font-black ${(x4Res.h2Count > 0 || x4Res.h3Count > 0 || x4Res.h4Count > 0) ? "bg-amber-400 text-slate-950 border border-amber-500 shadow-xs" : "bg-slate-100 text-slate-500 border border-slate-200"}">
                                                    ${x4Res.h4Count > 0 ? "🏆 ĂN X4 (+384M)" : (x4Res.h3Count > 0 ? "🎯 ĂN X3 (+84M)" : (x4Res.h2Count > 0 ? "🎯 ĂN X2 (+12M)" : "❌ Trượt Xiên"))}
                                                </span>
                                            ` : `
                                                <span class="rounded-lg px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">Đã khóa</span>
                                            `}
                                        </div>

                                        ${isSettled && x4Res ? `
                                            <div class="text-[11px] font-mono text-slate-600 flex flex-wrap items-center justify-between gap-1.5 bg-amber-50/60 p-2.5 rounded-xl border border-amber-100">
                                                <div>Vốn ${formatMoney(x4Res.stakeK, { signed: false })} · Ăn <strong class="text-emerald-700">${formatMoney(x4Res.payoutK, { signed: false })}</strong></div>
                                                <div class="flex items-center gap-1.5">
                                                    <span>Lãi: <strong class="${x4Res.profitK >= 0 ? "text-emerald-700" : "text-slate-500"}">${formatMoney(x4Res.profitK)}</strong></span>
                                                    ${cumXien !== null ? `<span class="text-slate-400 font-sans">(LK: <strong class="${cumXien >= 0 ? "text-emerald-700" : "text-rose-600"} font-mono">${formatMoney(cumXien)}</strong>)</span>` : ""}
                                                </div>
                                            </div>
                                        ` : ""}

                                        <!-- Dàn 1 -->
                                        <div class="p-2.5 rounded-xl bg-amber-50/50 border border-amber-200 space-y-1.5">
                                            <div class="flex items-center justify-between text-xs font-bold text-amber-950">
                                                <span class="flex items-center gap-1">
                                                    <span class="rounded bg-amber-600 text-white px-1.5 py-0.2 text-[9px] font-black">DÀN 1</span>
                                                    ${isSettled && x4Res ? `<span>Nổ ${x4Res.hits1}/4 con:</span>` : `<span>Vé Xiên 4 (11M):</span>`}
                                                </span>
                                                <span class="font-mono text-[11px] ${x4Res && x4Res.profit1 >= 0 ? "text-emerald-700 font-black" : "text-slate-500"}">
                                                    ${isSettled && x4Res ? formatMoney(x4Res.profit1) : "Ăn 384M"}
                                                </span>
                                            </div>
                                            <div class="flex flex-wrap gap-1.5">
                                                ${dan1.map(n => {
                                                    const hits = p27Counts[n] || 0;
                                                    if (hits > 0) {
                                                        return `
                                                            <span class="badge-number inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-600 text-white font-mono font-black text-xs ring-1 ring-emerald-300 shadow-2xs">
                                                                <span>🎯 ${n}</span>
                                                                <span class="text-[8px] font-sans font-bold bg-white text-emerald-900 px-1 rounded">${hits}n</span>
                                                            </span>
                                                        `;
                                                    }
                                                    return `
                                                        <span class="badge-number inline-flex items-center px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-500 font-mono text-xs">
                                                            ${n}
                                                        </span>
                                                    `;
                                                }).join("")}
                                            </div>
                                        </div>

                                        <!-- Dàn 2 -->
                                        <div class="p-2.5 rounded-xl bg-indigo-50/50 border border-indigo-200 space-y-1.5">
                                            <div class="flex items-center justify-between text-xs font-bold text-indigo-950">
                                                <span class="flex items-center gap-1">
                                                    <span class="rounded bg-indigo-600 text-white px-1.5 py-0.2 text-[9px] font-black">DÀN 2</span>
                                                    ${isSettled && x4Res ? `<span>Nổ ${x4Res.hits2}/4 con:</span>` : `<span>Vé Xiên 4 (11M):</span>`}
                                                </span>
                                                <span class="font-mono text-[11px] ${x4Res && x4Res.profit2 >= 0 ? "text-emerald-700 font-black" : "text-slate-500"}">
                                                    ${isSettled && x4Res ? formatMoney(x4Res.profit2) : "Ăn 384M"}
                                                </span>
                                            </div>
                                            <div class="flex flex-wrap gap-1.5">
                                                ${dan2.map(n => {
                                                    const hits = p27Counts[n] || 0;
                                                    if (hits > 0) {
                                                        return `
                                                            <span class="badge-number inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-600 text-white font-mono font-black text-xs ring-1 ring-indigo-300 shadow-2xs">
                                                                <span>🎯 ${n}</span>
                                                                <span class="text-[8px] font-sans font-bold bg-white text-indigo-900 px-1 rounded">${hits}n</span>
                                                            </span>
                                                        `;
                                                    }
                                                    return `
                                                        <span class="badge-number inline-flex items-center px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-500 font-mono text-xs">
                                                            ${n}
                                                        </span>
                                                    `;
                                                }).join("")}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        })() : ""}
                    </div>
                </div>
            `;
        }

        // TRƯỜNG HỢP 2: MÔ HÌNH AI ĐỘC LẬP (ChatGPT, Claude, Gemini, Grok, Muse)
        let src = sources[modelKey] || {};
        if (modelKey === "grok" && (!src.de?.length) && sources.perplexity?.de?.length) {
            src = sources.perplexity;
        }
        if (modelKey === "claude" && (!src.de?.length) && sources.deepseek?.de?.length) {
            src = sources.deepseek;
        }

        const r = results[modelKey] || (modelKey === "claude" ? results.deepseek : {}) || {};
        const mRates = rates[modelKey] || (modelKey === "claude" ? rates.deepseek : {}) || {};
        const info = models[modelKey] || (modelKey === "claude" ? { name: "Claude", avatar: "🟣", provider: "Anthropic" } : { name: modelKey, avatar: "🤖", provider: "" });
        const deNums = (src.de || []).map(x => String(x).padStart(2, "0"));
        const loNums = (src.lo || []).map(x => String(x).padStart(2, "0"));
        const isModelWin = (r.totalProfitK || 0) >= 0;
        const isDeHit = r.de?.isHit;
        const loHits = r.lo?.hits || 0;
        const mCumCombo = mRates.combo?.profitK ?? null;
        const mCumDe = mRates.de?.profitK ?? null;
        const mCumLo = mRates.lo?.profitK ?? null;
        const mCumXien = mRates.xien4?.profitK ?? null;

        return `
            <div class="space-y-4">
                <!-- Header Card riêng biệt của AI -->
                <div class="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div class="flex items-center gap-3">
                        <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-white border border-slate-200 text-2xl shadow-2xs">
                            ${info.avatar || "🤖"}
                        </span>
                        <div>
                            <div class="flex items-center gap-2">
                                <h4 class="text-sm font-black text-slate-900 uppercase tracking-wide">
                                    ${info.name}
                                </h4>
                                <span class="rounded-md bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-bold border border-slate-200">
                                    ${info.provider || "Trí Tuệ Nhân Tạo"}
                                </span>
                            </div>
                            <p class="text-xs text-slate-500">
                                Độc lập chọn 20 số Đề, 6 số Lô và đóng góp trọng số vào Dàn Gộp Consensus
                            </p>
                        </div>
                    </div>

                    ${isSettled ? `
                        <div class="flex flex-wrap items-center gap-2 self-start sm:self-auto font-mono text-xs">
                            <div class="rounded-xl bg-white border border-slate-200 px-3 py-1.5 shadow-2xs">
                                <span class="text-[9px] block uppercase font-bold text-slate-400">Vốn:</span>
                                <span class="font-black text-slate-800">${formatMoney(r.totalStakeK, { signed: false })}</span>
                            </div>
                            <div class="rounded-xl bg-white border border-slate-200 px-3 py-1.5 shadow-2xs">
                                <span class="text-[9px] block uppercase font-bold text-slate-400">Ăn:</span>
                                <span class="font-black text-emerald-700">${formatMoney(r.totalPayoutK, { signed: false })}</span>
                            </div>
                            <div class="rounded-xl ${isModelWin ? "bg-emerald-50 text-emerald-900 border border-emerald-300" : "bg-rose-50 text-rose-900 border border-rose-300"} px-3.5 py-1.5 shadow-2xs font-bold">
                                <span class="text-[9px] block uppercase opacity-75">Net Ngày:</span>
                                <span class="text-sm font-black">${formatMoney(r.totalProfitK)}</span>
                            </div>
                            ${mCumCombo !== null ? `
                                <div class="rounded-xl ${mCumCombo >= 0 ? "bg-emerald-100 text-emerald-950 border border-emerald-400 font-black" : "bg-rose-100 text-rose-950 border border-rose-300"} px-3.5 py-1.5 shadow-2xs">
                                    <span class="text-[9px] block uppercase font-black text-slate-600">LŨY KẾ:</span>
                                    <span class="text-sm font-black ${mCumCombo >= 0 ? "text-emerald-700" : "text-rose-700"}">${formatMoney(mCumCombo)}</span>
                                </div>
                            ` : ""}
                        </div>
                    ` : `
                        <div class="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                            <i class="bi bi-shield-check text-amber-600"></i> Đã nạp đủ 20 Đề & 6 Lô
                        </div>
                    `}
                </div>

                <!-- 2 hoặc 3 Cột Chi Tiết Riêng Biệt của AI -->
                <div class="grid grid-cols-1 ${r.xien4 ? "lg:grid-cols-3" : "lg:grid-cols-2"} gap-4 items-stretch">
                    <!-- Khối Đề 20s của AI -->
                    <div class="rounded-2xl bg-white border border-slate-200 p-4 space-y-3.5 flex flex-col justify-between shadow-xs">
                        <div class="space-y-3">
                            <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                                <div class="flex items-center gap-2">
                                    <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-800 text-sm font-black">🎯</span>
                                    <div>
                                        <h5 class="text-xs font-black text-slate-900 uppercase">Dàn Đề 20 Số (${info.name})</h5>
                                        <span class="text-[10px] text-slate-500">Cược 1M/số · Trúng ăn 84M</span>
                                    </div>
                                </div>
                                ${isSettled ? `
                                    <span class="rounded-xl px-2.5 py-1 text-xs font-black ${isDeHit ? "bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 border border-amber-500 shadow-xs animate-bounce" : "bg-slate-100 text-slate-500 border border-slate-200"}">
                                        ${isDeHit ? `⭐ TRÚNG ĐB [${specialStr}]` : "❌ Trượt Đề"}
                                    </span>
                                ` : `
                                    <span class="rounded-lg px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">Đã khóa</span>
                                `}
                            </div>

                            ${isSettled ? `
                                <div class="text-[11px] font-mono text-slate-600 flex flex-wrap items-center justify-between gap-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                    <div>Vốn ${formatMoney(r.de?.stakeK || 20000, { signed: false })} · Ăn <strong class="text-emerald-700">${formatMoney(r.de?.payoutK || 0, { signed: false })}</strong></div>
                                    <div class="flex items-center gap-1.5">
                                        <span>Lãi: <strong class="${(r.de?.profitK || 0) >= 0 ? "text-emerald-700" : "text-rose-600"}">${formatMoney(r.de?.profitK || 0)}</strong></span>
                                        ${mCumDe !== null ? `<span class="text-slate-400 font-sans">(LK: <strong class="${mCumDe >= 0 ? "text-emerald-700" : "text-rose-600"} font-mono">${formatMoney(mCumDe)}</strong>)</span>` : ""}
                                    </div>
                                </div>
                            ` : ""}

                            <div class="space-y-1.5">
                                <div class="flex items-center justify-between text-xs font-bold text-slate-700">
                                    <span>20 Con Số Đề Tuyển Chọn:</span>
                                    <button type="button" class="btn-copy-day-dan px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[10px] font-bold border border-slate-200 transition cursor-pointer flex items-center gap-1" data-copy-text="${deNums.join(" ")}" data-copy-label="Dàn Đề của ${info.name}">
                                        <i class="bi bi-clipboard"></i> Copy 20s
                                    </button>
                                </div>
                                <div class="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-50 border border-slate-200 min-h-[40px] items-center">
                                    ${deNums.map(n => {
                                        const isHit = specialStr && n === specialStr;
                                        if (isHit) {
                                            return `
                                                <span class="badge-number inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 font-mono font-black text-xs ring-4 ring-amber-300 shadow-md animate-bounce" title="⭐ TRÚNG ĐẶC BIỆT: ${n}">
                                                    <span>⭐ ${n}</span>
                                                    <span class="rounded bg-black/80 text-amber-300 px-1 py-0.2 text-[8px] font-sans">NỔ ĐB</span>
                                                </span>
                                            `;
                                        }
                                        return `
                                            <span class="badge-number inline-flex items-center px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-mono text-xs font-semibold shadow-2xs">
                                                ${n}
                                            </span>
                                        `;
                                    }).join("")}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Khối Lô 6s của AI -->
                    <div class="rounded-2xl bg-white border border-slate-200 p-4 space-y-3.5 flex flex-col justify-between shadow-xs">
                        <div class="space-y-3">
                            <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                                <div class="flex items-center gap-2">
                                    <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-800 text-sm font-black">🎲</span>
                                    <div>
                                        <h5 class="text-xs font-black text-slate-900 uppercase">Dàn Lô 6 Số (${info.name})</h5>
                                        <span class="text-[10px] text-slate-500">Cược 2.2M/số · Ăn 8M/nháy</span>
                                    </div>
                                </div>
                                ${isSettled ? `
                                    <span class="rounded-xl px-2.5 py-1 text-xs font-black ${loHits > 0 ? "bg-emerald-600 text-white shadow-xs" : "bg-slate-100 text-slate-500 border border-slate-200"}">
                                        ${loHits > 0 ? `🎯 NỔ ${loHits} NHÁY` : "❌ Trượt Lô"}
                                    </span>
                                ` : `
                                    <span class="rounded-lg px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">Đã khóa</span>
                                `}
                            </div>

                            ${isSettled ? `
                                <div class="text-[11px] font-mono text-slate-600 flex flex-wrap items-center justify-between gap-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                    <div>Vốn ${formatMoney(r.lo?.stakeK || 13200, { signed: false })} · Ăn <strong class="text-emerald-700">${formatMoney(r.lo?.payoutK || 0, { signed: false })}</strong></div>
                                    <div class="flex items-center gap-1.5">
                                        <span>Lãi: <strong class="${(r.lo?.profitK || 0) >= 0 ? "text-emerald-700" : "text-rose-600"}">${formatMoney(r.lo?.profitK || 0)}</strong></span>
                                        ${mCumLo !== null ? `<span class="text-slate-400 font-sans">(LK: <strong class="${mCumLo >= 0 ? "text-emerald-700" : "text-rose-600"} font-mono">${formatMoney(mCumLo)}</strong>)</span>` : ""}
                                    </div>
                                </div>
                            ` : ""}

                            <div class="space-y-1.5">
                                <div class="flex items-center justify-between text-xs font-bold text-slate-700">
                                    <span>6 Con Số Lô Chủ Lực:</span>
                                    <button type="button" class="btn-copy-day-dan px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[10px] font-bold border border-slate-200 transition cursor-pointer flex items-center gap-1" data-copy-text="${loNums.join(" ")}" data-copy-label="Dàn Lô của ${info.name}">
                                        <i class="bi bi-clipboard"></i> Copy 6s
                                    </button>
                                </div>
                                <div class="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-50 border border-slate-200 min-h-[40px] items-center">
                                    ${loNums.map(n => {
                                        const hits = p27Counts[n] || 0;
                                        if (hits > 0) {
                                            return `
                                                <span class="badge-number inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-600 text-white font-mono font-black text-xs ring-2 ring-emerald-300 shadow-xs" title="🎯 Lô ${n}: Nổ ${hits} nháy">
                                                    <span>${n}</span>
                                                    <span class="rounded bg-white text-emerald-900 font-bold px-1 text-[8px] font-sans">${hits}n</span>
                                                </span>
                                            `;
                                        }
                                        return `
                                            <span class="badge-number inline-flex items-center px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-600 font-mono text-xs shadow-2xs">
                                                ${n}
                                            </span>
                                        `;
                                    }).join("")}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Khối Xiên 4 của AI nếu có -->
                    ${r.xien4 ? (() => {
                        const x4 = r.xien4;
                        return `
                            <div class="rounded-2xl bg-white border border-slate-200 p-4 space-y-3.5 flex flex-col justify-between shadow-xs">
                                <div class="space-y-3">
                                    <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                                        <div class="flex items-center gap-2">
                                            <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-800 text-sm font-black">💎</span>
                                            <div>
                                                <h5 class="text-xs font-black text-slate-900 uppercase">Xiên 4 (${info.name})</h5>
                                                <span class="text-[10px] text-slate-500">2 Dàn độc lập (22M)</span>
                                            </div>
                                        </div>
                                        ${isSettled ? `
                                            <span class="rounded-xl px-2.5 py-1 text-xs font-black ${(x4.h2Count > 0 || x4.h3Count > 0 || x4.h4Count > 0) ? "bg-amber-400 text-slate-950 border border-amber-500 shadow-xs" : "bg-slate-100 text-slate-500 border border-slate-200"}">
                                                ${x4.h4Count > 0 ? "🏆 NỔ X4 (+384M)" : (x4.h3Count > 0 ? "🎯 NỔ X3 (+84M)" : (x4.h2Count > 0 ? "🎯 NỔ X2 (+12M)" : "❌ Trượt"))}
                                            </span>
                                        ` : `
                                            <span class="rounded-lg px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">Đã khóa</span>
                                        `}
                                    </div>

                                    ${isSettled ? `
                                        <div class="text-[11px] font-mono text-slate-600 flex flex-wrap items-center justify-between gap-1 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                            <div>Vốn ${formatMoney(x4.stakeK, { signed: false })} · Ăn <strong class="text-emerald-700">${formatMoney(x4.payoutK, { signed: false })}</strong></div>
                                            <div>Lãi: <strong class="${x4.profitK >= 0 ? "text-emerald-700" : "text-slate-500"}">${formatMoney(x4.profitK)}</strong></div>
                                        </div>
                                    ` : ""}

                                    <div class="space-y-1.5 text-xs font-mono">
                                        <div class="p-2 rounded-lg bg-amber-50/50 border border-amber-200 space-y-1">
                                            <div class="flex items-center justify-between text-[11px]">
                                                <span class="font-bold text-amber-900 font-sans">Dàn 1 (${x4.hits1}/4 con):</span>
                                                <span class="${x4.profit1 >= 0 ? "text-emerald-700 font-bold" : "text-slate-400"}">${formatMoney(x4.profit1)}</span>
                                            </div>
                                            <div class="flex flex-wrap gap-1">
                                                ${(x4.dan1 || []).map(n => `<span class="px-1.5 py-0.5 rounded text-[11px] ${(p27Counts[n] || 0) > 0 ? "bg-emerald-600 text-white font-bold" : "bg-white text-slate-600 border border-slate-200"}">${n}</span>`).join("")}
                                            </div>
                                        </div>
                                        <div class="p-2 rounded-lg bg-indigo-50/50 border border-indigo-200 space-y-1">
                                            <div class="flex items-center justify-between text-[11px]">
                                                <span class="font-bold text-indigo-900 font-sans">Dàn 2 (${x4.hits2}/4 con):</span>
                                                <span class="${x4.profit2 >= 0 ? "text-emerald-700 font-bold" : "text-slate-400"}">${formatMoney(x4.profit2)}</span>
                                            </div>
                                            <div class="flex flex-wrap gap-1">
                                                ${(x4.dan2 || []).map(n => `<span class="px-1.5 py-0.5 rounded text-[11px] ${(p27Counts[n] || 0) > 0 ? "bg-indigo-600 text-white font-bold" : "bg-white text-slate-600 border border-slate-200"}">${n}</span>`).join("")}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    })() : ""}
                </div>
            </div>
        `;
    }

    // -------------------------------------------------------------------------
    // RENDER: Historical Settlement Ledger (Nhật ký đối soát từng ngày)
    // Tái cấu trúc mới: Thẻ trực quan, highlight trúng/trượt & thắng/thua, sub-tabs mượt mà
    // -------------------------------------------------------------------------
    function renderLedger(days = [], filter = "all", models = {}) {
        const list = document.getElementById("historicalLedgerList");
        if (!list) return;

        // Bảo vệ hiển thị: Nếu ngày hôm nay chưa có kết quả, tuyệt đối không hiển thị ngày hôm sau trong nhật ký đối soát
        const activeDate = state.payload?.latestDate || state.payload?.latestDay?.date;
        const visibleDays = (days || []).filter(d => {
            if (!activeDate) return true;
            const isDaySettled = Boolean(d.special && d.prizes27?.length === 27 && d.results);
            if (isDaySettled) return true;
            return String(d.date) <= String(activeDate);
        });

        if (!visibleDays.length) {
            list.innerHTML = `<div class="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Chưa có nhật ký đối soát nào.</div>`;
            return;
        }

        // Mặc định mở rộng ngày đầu tiên (mới nhất) nếu chưa có trạng thái
        if (state.expandedDays.size === 0 && visibleDays.length > 0) {
            state.expandedDays.add(visibleDays[0].date);
        }

        const cardsHtml = visibleDays.map(day => {
            const dateStr = day.date;
            const isSettled = Boolean(day.special && day.prizes27?.length === 27 && day.results);
            const specialStr = day.special ? String(day.special).padStart(2, "0") : null;
            const p27 = day.prizes27 || [];
            const results = day.results || {};
            const sources = day.sources || {};
            const cons = day.consensus || {};
            const isExpanded = state.expandedDays.has(dateStr);

            const consRes = results.consensus || {};
            const deRes = consRes.deTiered || consRes.de || {};
            const loRes = consRes.loTiered || consRes.lo || {};
            const x4Res = consRes.xien4;
            const totalProfitK = consRes.totalProfitK || 0;
            const isConsWin = totalProfitK >= 0;

            const rates = day.rates || {};
            const consRates = rates.consensus || {};
            const cumCombo = consRates.combo?.profitK ?? null;

            const p27Counts = {};
            p27.forEach(p => {
                const num = String(p).padStart(2, "0").slice(-2);
                p27Counts[num] = (p27Counts[num] || 0) + 1;
            });

            // Sub-Tab đang được chọn cho ngày này
            const activeModelKey = state.activeSubTabByDate?.[dateStr] || (filter !== "all" ? (filter === "deepseek" ? "claude" : filter) : "consensus");

            // Viền trái màu sắc phân biệt Thắng / Thua / Đang chờ
            const borderAccentClass = !isSettled 
                ? "border-l-4 border-l-amber-500" 
                : (totalProfitK > 0 ? "border-l-4 border-l-emerald-500" : (totalProfitK === 0 ? "border-l-4 border-l-slate-400" : "border-l-4 border-l-rose-500"));

            return `
                <article class="rounded-3xl border border-slate-200 bg-white shadow-xs hover:shadow-md transition-all overflow-hidden ${borderAccentClass}" id="ledgerCard-${dateStr}">
                    <!-- HEADER CỦA NGÀY (HIGHLIGHT ĐIỂM NHẤN TRÚNG/TRƯỢT & THẮNG/THUA) -->
                    <div class="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5 bg-white">
                        <!-- Cụm bên trái: Ngày, Trạng thái, Đặc Biệt & Nút 27 giải Lô -->
                        <div class="flex flex-wrap items-center gap-2.5">
                            <span class="font-mono text-base sm:text-lg font-black text-slate-900 tracking-tight">${dateStr}</span>
                            
                            ${isSettled ? `
                                <span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-900 px-2.5 py-0.5 text-[10px] font-black border border-emerald-300">
                                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span> ĐÃ ĐỐI SOÁT
                                </span>
                                <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 text-white font-mono font-black text-xs sm:text-sm shadow-xs">
                                    <span class="text-[9px] uppercase font-sans tracking-wider opacity-90">⭐ ĐẶC BIỆT:</span>
                                    <span class="text-sm sm:text-base font-black tracking-widest">${specialStr}</span>
                                </div>
                                <button type="button" class="btn-toggle-p27 text-[11px] font-bold px-2.5 py-1 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition flex items-center gap-1.5 cursor-pointer shadow-2xs" data-date="${dateStr}" title="Xem kết quả 27 giải Lô mở thưởng">
                                    <i class="bi bi-grid-3x3-gap text-indigo-600"></i>
                                    <span>27 Giải Lô</span>
                                    <i class="bi bi-chevron-down text-[9px] p27-chevron transition-transform" id="p27Chevron-${dateStr}"></i>
                                </button>
                            ` : `
                                <span class="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 px-2.5 py-0.5 text-[10px] font-black border border-amber-300">
                                    <span class="w-1.5 h-1.5 rounded-full bg-amber-600 animate-ping"></span> CHỜ KQ 18h30
                                </span>
                                <div class="text-xs text-amber-800 font-bold flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200">
                                    <i class="bi bi-shield-lock-fill text-amber-600"></i> Đã niêm phong dàn số
                                </div>
                            `}
                        </div>

                        <!-- Cụm bên phải: Highlight Kết Quả, Tài Chính & Nút Mở Rộng -->
                        <div class="flex flex-wrap items-center gap-2">
                            ${isSettled ? `
                                <!-- Huy hiệu Kết Quả Đề -->
                                ${deRes.isHit ? (
                                    deRes.hitTier === "X2" 
                                        ? `<span class="px-2.5 py-1 rounded-xl text-xs font-black bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 border border-amber-500 shadow-xs flex items-center gap-1 animate-pulse"><span>👑 NỔ ĐB X2</span></span>`
                                        : `<span class="px-2.5 py-1 rounded-xl text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs flex items-center gap-1"><span>⭐ NỔ ĐB X1</span></span>`
                                ) : `<span class="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">Trượt Đề</span>`}

                                <!-- Huy hiệu Kết Quả Lô -->
                                ${loRes.hits > 0 ? `
                                    <span class="px-2.5 py-1 rounded-xl text-xs font-black bg-emerald-600 text-white shadow-xs flex items-center gap-1">
                                        <span>🎯 NỔ ${loRes.hits} NHÁY</span>
                                    </span>
                                ` : `
                                    <span class="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">Trượt Lô</span>
                                `}

                                <!-- Huy hiệu Xiên 4 -->
                                ${x4Res && (x4Res.h2Count > 0 || x4Res.h3Count > 0 || x4Res.h4Count > 0) ? `
                                    <span class="px-2.5 py-1 rounded-xl text-xs font-black ${x4Res.h4Count > 0 ? "bg-purple-600 text-white" : (x4Res.h3Count > 0 ? "bg-amber-400 text-slate-950" : "bg-indigo-600 text-white")} shadow-xs">
                                        ${x4Res.h4Count > 0 ? "🏆 ĂN X4" : (x4Res.h3Count > 0 ? "🎯 ĂN X3" : "🎯 ĂN X2")}
                                    </span>
                                ` : ""}

                                <!-- Huy hiệu LÃI / LỖ NGÀY To Đậm Rực Rỡ -->
                                <div class="px-3.5 py-1 rounded-xl ${totalProfitK > 0 ? "bg-emerald-600 text-white" : (totalProfitK === 0 ? "bg-slate-600 text-white" : "bg-rose-600 text-white")} text-xs font-mono font-black shadow-sm flex items-center gap-1.5">
                                    <span class="text-[9px] uppercase font-bold opacity-80">${totalProfitK >= 0 ? "LÃI:" : "LỖ:"}</span>
                                    <span class="text-sm font-black">${formatMoney(totalProfitK)}</span>
                                </div>

                                <!-- Huy hiệu LŨY KẾ COMBO -->
                                ${cumCombo !== null ? `
                                    <div class="px-3 py-1 rounded-xl ${cumCombo >= 0 ? "bg-emerald-50 text-emerald-950 border border-emerald-300" : "bg-rose-50 text-rose-950 border border-rose-300"} text-xs font-mono font-black shadow-2xs hidden sm:flex items-center gap-1.5">
                                        <span class="text-[9px] uppercase font-bold text-slate-500">LŨY KẾ:</span>
                                        <span class="text-xs font-black ${cumCombo >= 0 ? "text-emerald-700" : "text-rose-700"}">${formatMoney(cumCombo)}</span>
                                    </div>
                                ` : ""}
                            ` : ""}

                            <!-- Nút Mở Rộng / Thu Gọn Đồng Nhất Tab Khác -->
                            <button type="button" class="btn-toggle-day-detail inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all border shadow-2xs cursor-pointer ${isExpanded ? "bg-indigo-600 text-white border-indigo-600 shadow-xs" : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400"}" data-date="${dateStr}">
                                <span class="toggle-text">${isExpanded ? "Thu gọn" : "Chi tiết"}</span>
                                <i class="bi bi-chevron-${isExpanded ? "up" : "down"} text-[10px] ml-0.5"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Bảng 27 giải Lô mở thưởng (ẩn/hiện độc lập) -->
                    ${isSettled ? `
                        <div id="p27Container-${dateStr}" class="hidden p-3.5 mx-4 mb-3 rounded-2xl bg-slate-50/90 border border-slate-200 text-xs space-y-2">
                            <div class="flex items-center justify-between text-[11px] font-bold text-slate-600 border-b border-slate-200/60 pb-1.5">
                                <span class="flex items-center gap-1.5">
                                    <i class="bi bi-card-checklist text-indigo-600"></i>
                                    <span>Bảng 27 Giải Lô Mở Thưởng Ngày ${dateStr}:</span>
                                </span>
                                <span class="font-mono text-slate-400 text-[10px]">${p27.length} giải</span>
                            </div>
                            <div class="flex flex-wrap gap-1.5">
                                ${p27.map(num => `
                                    <span class="inline-flex items-center justify-center font-mono font-bold text-xs px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 shadow-2xs">
                                        ${String(num).padStart(2, "0").slice(-2)}
                                    </span>
                                `).join("")}
                            </div>
                        </div>
                    ` : ""}

                    <!-- THANH TÓM TẮT NHANH (QUICK GLANCE BAR) KHI CHƯA MỞ RỘNG -->
                    <div class="bg-slate-50/90 border-t border-slate-100 px-4 py-2.5 flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 text-xs">
                        <!-- Tóm tắt 3 cấu phần chiến lược -->
                        <div class="flex flex-wrap items-center gap-3 text-slate-600">
                            <span class="flex items-center gap-1 font-semibold">
                                <span>🎯 Đề Gộp:</span>
                                ${isSettled ? `
                                    <strong class="${deRes.profitK >= 0 ? "text-emerald-700" : "text-rose-600"} font-mono">${formatMoney(deRes.profitK)}</strong>
                                    ${deRes.isHit ? `<span class="text-[10px] text-amber-700 font-bold bg-amber-100 px-1 rounded">⭐ Ăn ĐB</span>` : ""}
                                ` : `<span class="text-slate-400 font-mono">${(cons.deTiers?.x2Nums?.length || 0) + (cons.deTiers?.x1Nums?.length || 0)}s</span>`}
                            </span>
                            <span>·</span>
                            <span class="flex items-center gap-1 font-semibold">
                                <span>🎲 Lô Gộp:</span>
                                ${isSettled ? `
                                    <strong class="${loRes.profitK >= 0 ? "text-emerald-700" : "text-rose-600"} font-mono">${formatMoney(loRes.profitK)}</strong>
                                    <span class="text-[10px] text-indigo-700 font-bold bg-indigo-50 px-1 rounded">(${loRes.hits || 0} nháy)</span>
                                ` : `<span class="text-slate-400 font-mono">Top 6</span>`}
                            </span>
                            <span>·</span>
                            <span class="flex items-center gap-1 font-semibold">
                                <span>💎 2 Xiên 4:</span>
                                ${isSettled ? `
                                    <strong class="${(x4Res?.profitK || 0) >= 0 ? "text-emerald-700" : "text-slate-500"} font-mono">${formatMoney(x4Res?.profitK || 0)}</strong>
                                ` : `<span class="text-slate-400 font-mono">22M</span>`}
                            </span>
                        </div>

                        <!-- 5 Pill mini tóm tắt ý kiến 5 AI -->
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">5 AI:</span>
                            ${["chatgpt", "claude", "gemini", "grok", "muse"].map(mKey => {
                                const r = results[mKey] || (mKey === "claude" ? results.deepseek : null);
                                const info = models[mKey] || (mKey === "claude" ? { name: "Claude", avatar: "🟣" } : { name: mKey, avatar: "🤖" });
                                if (!r && !sources[mKey]) return "";
                                const profit = r ? (r.totalProfitK || 0) : null;
                                const isWin = profit !== null && profit >= 0;
                                return `
                                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-[10px] shadow-2xs font-semibold cursor-pointer hover:border-indigo-300 transition" title="${info.name}: ${profit !== null ? `Net ${formatMoney(profit)}` : "Đã nạp số"}">
                                        <span>${info.avatar || "🤖"}</span>
                                        <span>${info.name}</span>
                                        ${profit !== null ? `
                                            <span class="font-mono font-bold ${isWin ? "text-emerald-700" : "text-rose-600"}">
                                                (${formatMoney(profit)})
                                            </span>
                                        ` : ""}
                                    </span>
                                `;
                            }).join("")}
                        </div>
                    </div>

                    <!-- VÙNG CHI TIẾT MỞ RỘNG (EXPANDED CONTAINER - SUB-TABS 6 MÔ HÌNH ĐỒNG NHẤT VỚI TAB KHÁC) -->
                    <div id="ledgerDetail-${dateStr}" class="${isExpanded ? "" : "hidden"} border-t-2 border-indigo-100 bg-slate-50/70 p-4 sm:p-6 space-y-4">
                        <!-- THANH SUB-TABS 6 MÔ HÌNH / PHƯƠNG PHÁP -->
                        <div class="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-200">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="text-xs font-bold text-slate-500 uppercase tracking-wide mr-1 flex items-center gap-1">
                                    <i class="bi bi-layers-fill text-indigo-600"></i> Xem Chi Tiết Mô Hình:
                                </span>
                                
                                <!-- Tab 1: Dàn Gộp Consensus -->
                                <button type="button" class="btn-day-subtab px-3 py-1.5 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer ${activeModelKey === "consensus" ? "font-black bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-300" : "font-bold bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-2xs"}" data-date="${dateStr}" data-model="consensus">
                                    <span>👑 Dàn Gộp 5 AI</span>
                                    ${isSettled ? `<span class="font-mono text-[10px] opacity-90">(${formatMoney(totalProfitK)})</span>` : ""}
                                    ${deRes.isHit ? `<span class="text-[9px] bg-amber-400 text-slate-950 font-black px-1 rounded shadow-2xs">⭐ ĐB</span>` : ""}
                                </button>

                                <!-- Tabs 5 AI độc lập -->
                                ${["chatgpt", "claude", "gemini", "grok", "muse"].map(mKey => {
                                    const info = models[mKey] || (mKey === "claude" ? { name: "Claude", avatar: "🟣" } : { name: mKey, avatar: "🤖" });
                                    const r = results[mKey] || (mKey === "claude" ? results.deepseek : null);
                                    const isCur = mKey === activeModelKey;
                                    const profit = r ? (r.totalProfitK || 0) : null;
                                    const isDeWin = r?.de?.isHit;

                                    return `
                                        <button type="button" class="btn-day-subtab px-3 py-1.5 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer ${isCur ? "font-black bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-300" : "font-bold bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-2xs"}" data-date="${dateStr}" data-model="${mKey}">
                                            <span>${info.avatar || "🤖"}</span>
                                            <span>${info.name}</span>
                                            ${profit !== null ? `<span class="font-mono text-[10px] opacity-80">(${formatMoney(profit)})</span>` : ""}
                                            ${isDeWin ? `<span class="text-[9px] bg-amber-400 text-slate-950 font-black px-1 rounded shadow-2xs">⭐ ĐB</span>` : ""}
                                        </button>
                                    `;
                                }).join("")}
                            </div>

                            <!-- Nút copy nhanh dàn số hiện tại của ngày -->
                            <div class="text-xs font-mono text-slate-500 hidden sm:flex items-center gap-2">
                                <i class="bi bi-info-circle text-indigo-600"></i> Bấm từng tab để kiểm tra đối soát từng AI
                            </div>
                        </div>

                        <!-- KHUNG BODY NỘI DUNG CHI TIẾT THEO MÔ HÌNH ĐANG CHỌN -->
                        <div id="dayDetailBody-${dateStr}">
                            ${renderDayDetailModelBody(day, activeModelKey, models, p27Counts, specialStr, isSettled)}
                        </div>

                        <!-- Nút Thu Gọn Ở Cuối Vùng Mở Rộng -->
                        <div class="pt-3 border-t border-slate-200/80 flex items-center justify-end">
                            <button type="button" class="btn-toggle-day-detail text-xs font-bold px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs" data-date="${dateStr}">
                                <i class="bi bi-chevron-up"></i>
                                <span>Thu gọn chi tiết ngày ${dateStr}</span>
                            </button>
                        </div>
                    </div>
                </article>
            `;
        }).join("");

        list.innerHTML = cardsHtml;
        attachLedgerEvents();
        updateToggleAllButtonState();
    }

    // -------------------------------------------------------------------------
    // ATTACH EVENTS CHO SỔ CÁI ĐỐI SOÁT
    // -------------------------------------------------------------------------
    function attachLedgerEvents() {
        const list = document.getElementById("historicalLedgerList");
        if (!list || list.__ledgerEventsBound) return;
        list.__ledgerEventsBound = true;

        list.addEventListener("click", (e) => {
            // 1. Toggle bảng 27 giải Lô
            const btnP27 = e.target.closest(".btn-toggle-p27");
            if (btnP27) {
                const date = btnP27.dataset.date;
                const container = document.getElementById("p27Container-" + date);
                const chevron = document.getElementById("p27Chevron-" + date);
                if (container) {
                    const isHidden = container.classList.toggle("hidden");
                    if (chevron) {
                        chevron.classList.toggle("rotate-180", !isHidden);
                    }
                }
                return;
            }

            // 2. Toggle collapse / expand xem chi tiết dàn số
            const btnDetail = e.target.closest(".btn-toggle-day-detail");
            if (btnDetail) {
                const date = btnDetail.dataset.date;
                if (date) toggleDayDetail(date);
                return;
            }

            // 3. Chuyển đổi Sub-Tabs mô hình trong 1 ngày (Dàn Gộp hoặc ChatGPT, Claude, Gemini, Grok, Muse)
            const btnSubTab = e.target.closest(".btn-day-subtab");
            if (btnSubTab) {
                const date = btnSubTab.dataset.date;
                const model = btnSubTab.dataset.model;
                if (date && model) {
                    state.activeSubTabByDate = state.activeSubTabByDate || {};
                    state.activeSubTabByDate[date] = model;
                    updateDaySubTabUI(date, model);
                }
                return;
            }

            // 4. Nút sao chép dàn số nhanh
            const btnCopy = e.target.closest(".btn-copy-day-dan");
            if (btnCopy) {
                const text = btnCopy.dataset.copyText;
                const label = btnCopy.dataset.copyLabel || "dàn số";
                if (text) copyToClipboard(text, label);
                return;
            }

            // 5. Click vào KPI Card tổng quan -> Mở rộng chi tiết & filter
            const kpiCard = e.target.closest(".kpi-card-interactive");
            if (kpiCard) {
                const date = kpiCard.dataset.date;
                const model = kpiCard.dataset.model;
                if (date) {
                    toggleDayDetail(date, true);
                }
                if (model && state.ledgerFilter !== "all" && state.ledgerFilter !== model) {
                    state.ledgerFilter = model;
                    const sel = document.getElementById("ledgerModelFilter");
                    if (sel) sel.value = model;
                    renderLedger(state.payload.history, state.ledgerFilter, state.payload.models);
                }
                return;
            }
        });
    }

    // -------------------------------------------------------------------------
    // INIT & EVENT HANDLERS
    // -------------------------------------------------------------------------
    async function loadData() {
        try {
            const res = await fetch('/api/ai-5', { cache: 'no-store' });
            const data = await res.json();
            if (!data || !data.success) throw new Error(data.error || 'Lỗi tải API AI 5');

            state.payload = data;
            renderCumulativePills(data.summary, data.models);
            renderLeaderboard(data.leaderboard, data.models);
            renderTodayPrediction(data.latestDay, data.todayConsensus, state.selectedModel, data.models);
            renderLedger(data.history, state.ledgerFilter, data.models);
        } catch (error) {
            console.error('[AI5-UI] Error:', error);
            const grid = document.getElementById('leaderboardGrid');
            if (grid) grid.innerHTML = `<div class="col-span-full p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-bold">${error.message}</div>`;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadData();
        setupToggleAllLedger();

        // Model selector buttons for today's prediction
        const tabBtns = document.querySelectorAll('.tab-ai-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => {
                    b.classList.remove('active');
                    b.classList.add('border-slate-200', 'bg-white', 'text-slate-600');
                });
                btn.classList.add('active');
                btn.classList.remove('border-slate-200', 'bg-white', 'text-slate-600');

                state.selectedModel = btn.dataset.model || 'consensus';
                if (state.payload) {
                    renderTodayPrediction(state.payload.latestDay, state.payload.todayConsensus, state.selectedModel, state.payload.models);
                }
            });
        });

        // Ledger filter dropdown
        const ledgerSelect = document.getElementById('ledgerModelFilter');
        if (ledgerSelect) {
            ledgerSelect.addEventListener('change', (e) => {
                state.ledgerFilter = e.target.value;
                if (state.payload) {
                    renderLedger(state.payload.history, state.ledgerFilter, state.payload.models);
                }
            });
        }

        // Ledger category filter dropdown (Tất cả / Đề / Lô / Xiên 4)
        const ledgerCatSelect = document.getElementById('ledgerCategoryFilter');
        if (ledgerCatSelect) {
            ledgerCatSelect.addEventListener('change', (e) => {
                state.ledgerCategory = e.target.value;
                if (state.payload) {
                    renderLedger(state.payload.history, state.ledgerFilter, state.payload.models);
                }
            });
        }

        // Leaderboard category filter buttons (Tất cả / Đề / Lô / Xiên 4)
        const lbFilterBtns = document.querySelectorAll('.lb-filter-btn');
        lbFilterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                switchLeaderboardCategory(btn.dataset.cat || 'combo');
            });
        });
    });
})();
