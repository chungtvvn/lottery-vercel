/**
 * public/js/ai-5.js
 * 
 * Logic giao diện cho trang Đối Soát & Đồng Thuận 5 AI (ChatGPT, DeepSeek, Gemini, Grok, Muse)
 * Hỗ trợ phân tầng Đề (Tier X2 & X1) và Lô (Tier X5 đến X1) tương tự Daily,
 * cùng chế độ đối soát hiển thị đầy đủ dàn số cho ngày đang chờ kết quả.
 */

(function () {
    'use strict';

    const state = {
        payload: null,
        selectedModel: 'consensus',
        ledgerFilter: 'all',
        expandedDays: new Set()
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

    // -------------------------------------------------------------------------
    // RENDER: Executive Leaderboard Cards
    // -------------------------------------------------------------------------
    function renderLeaderboard(leaderboard = [], models = {}) {
        const grid = document.getElementById('leaderboardGrid');
        if (!grid) return;

        if (!leaderboard.length) {
            grid.innerHTML = '<div class="col-span-full p-4 text-center text-xs text-slate-400">Chưa có dữ liệu thống kê.</div>';
            return;
        }

        const cardsHtml = leaderboard.map(item => {
            const isConsensus = item.id === 'consensus';
            const info = isConsensus ? { name: '👑 Gộp Consensus', avatar: '👑' } : (models[item.id] || { name: item.id, avatar: '🤖' });
            
            const deWins = item.de?.wins || 0;
            const deDays = item.days || 0;
            const deWinRate = deDays > 0 ? (item.de?.winRate * 100).toFixed(1) : '0.0';
            const deProfitK = item.de?.profitK || 0;

            const loHits = item.lo?.totalHits || 0;
            const loAvg = item.lo?.avgHitsPerDay || 0;
            const loProfitK = item.lo?.profitK || 0;

            const comboProfitK = item.combo?.profitK || 0;
            const comboRoi = (item.combo?.roi * 100).toFixed(1);
            const isPositive = comboProfitK >= 0;

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

                        <!-- Performance Stats -->
                        <div class="space-y-2 text-xs">
                            <!-- Đề Stats -->
                            <div class="rounded-xl bg-slate-50/90 p-2.5 border border-slate-100">
                                <div class="flex items-center justify-between font-bold text-slate-700">
                                    <span class="flex items-center gap-1"><i class="bi bi-bullseye text-purple-600"></i> Đề (20s):</span>
                                    <span class="font-mono text-slate-900">${deWins}/${deDays} (${deWinRate}%)</span>
                                </div>
                                <div class="flex items-center justify-between text-[11px] mt-1 text-slate-500">
                                    <span>Lãi Đề:</span>
                                    <span class="font-mono font-bold ${deProfitK >= 0 ? 'text-emerald-700' : 'text-rose-600'}">${formatMoney(deProfitK)}</span>
                                </div>
                            </div>

                            <!-- Lô Stats -->
                            <div class="rounded-xl bg-slate-50/90 p-2.5 border border-slate-100">
                                <div class="flex items-center justify-between font-bold text-slate-700">
                                    <span class="flex items-center gap-1"><i class="bi bi-dice-6-fill text-indigo-600"></i> Lô (6s):</span>
                                    <span class="font-mono text-slate-900">${loHits} nháy (${loAvg}N)</span>
                                </div>
                                <div class="flex items-center justify-between text-[11px] mt-1 text-slate-500">
                                    <span>Lãi Lô:</span>
                                    <span class="font-mono font-bold ${loProfitK >= 0 ? 'text-emerald-700' : 'text-rose-600'}">${formatMoney(loProfitK)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Footer: Net Profit & ROI -->
                    <div class="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                        <div>
                            <div class="text-[9px] font-bold uppercase text-slate-400">Lãi Ròng Net:</div>
                            <div class="font-mono text-sm font-black ${isPositive ? 'text-emerald-700' : 'text-rose-600'}">
                                ${formatMoney(comboProfitK)}
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="text-[9px] font-bold uppercase text-slate-400">ROI:</div>
                            <div class="font-mono text-xs font-black ${isPositive ? 'text-emerald-700' : 'text-rose-600'}">
                                ${comboRoi}%
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        grid.innerHTML = cardsHtml;
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

        // VIEW 1: DÀN GỘP 5 AI (CONSENSUS) - ĐỀ X2/X1 & LÔ X5..X1
        if (selectedModel === 'consensus') {
            const deNums = consensus?.deTop20 || [];
            const deTiers = consensus?.deTiers || {};
            const deX2Nums = deTiers.x2Nums || consensus?.deVip || [];
            const deX1Nums = deTiers.x1Nums || [];
            const allDeNums = consensus?.deAllConsensus || [...deX2Nums, ...deX1Nums];
            
            const loTiers = consensus?.loTiers || {};
            const loNums = consensus?.loTop6 || [];
            const loVotesMap = consensus?.loVotesMap || {};
            const deVotesMap = consensus?.deVotesMap || {};

            const x5List = loTiers.x5Nums || [];
            const x4List = loTiers.x4Nums || [];
            const x3List = loTiers.x3Nums || [];
            const x2List = loTiers.x2Nums || [];
            const x1List = loTiers.x1Nums || [];

            container.innerHTML = `
                <div class="rounded-3xl border-2 border-purple-400/90 bg-gradient-to-br from-purple-50/70 via-white to-indigo-50/50 p-6 shadow-sm space-y-6">
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-purple-200/80 pb-4">
                        <div class="flex items-center gap-2.5">
                            <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-md text-lg">
                                👑
                            </span>
                            <div>
                                <h4 class="text-base font-black text-slate-900">Phương Pháp Gộp Consensus 5 Siêu Trí Tuệ</h4>
                                <p class="text-xs text-slate-500">Đề chia Tier X2 & X1 · Lô chia Tier X5 đến X1 tương tự Daily Advisor</p>
                            </div>
                        </div>

                        <!-- Buttons Copy -->
                        <div class="flex flex-wrap items-center gap-2">
                            <button type="button" id="btnCopyDeX2" class="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 px-3 py-1.5 text-xs font-black text-slate-950 hover:opacity-95 transition shadow-xs cursor-pointer">
                                <i class="bi bi-clipboard-check"></i> Copy Đề X2 (${deX2Nums.length}s)
                            </button>
                            <button type="button" id="btnCopyDeX1" class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 border border-indigo-300 text-indigo-900 px-3 py-1.5 text-xs font-black hover:bg-indigo-100 transition shadow-xs cursor-pointer">
                                <i class="bi bi-clipboard-check"></i> Copy Đề X1 (${deX1Nums.length}s)
                            </button>
                            <button type="button" id="btnCopyDeTop20" class="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-black text-white hover:bg-purple-700 transition shadow-xs cursor-pointer">
                                <i class="bi bi-clipboard-check"></i> Đề Top 20
                            </button>
                            <button type="button" id="btnCopyLoTiered" class="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 px-3 py-1.5 text-xs font-black text-white hover:opacity-95 transition shadow-xs cursor-pointer">
                                <i class="bi bi-clipboard-check"></i> Copy Lô Đa Tầng (X5->X1)
                            </button>
                            ${x1List.length ? `
                                <button type="button" id="btnCopyLoX1" class="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 px-3 py-1.5 text-xs font-black hover:bg-slate-200 transition shadow-xs cursor-pointer">
                                    <i class="bi bi-clipboard-check"></i> Copy Lô X1 (${x1List.length}s)
                                </button>
                            ` : ''}
                        </div>
                    </div>

                    <!-- 1. PHẦN ĐỀ GỘP ĐA TẦNG (TIER X2 & X1) -->
                    <div class="rounded-2xl bg-white/90 border border-purple-200 p-4 space-y-4">
                        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-slate-100 pb-2">
                            <div class="flex items-center gap-2">
                                <span class="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-100 text-purple-700 text-xs">
                                    <i class="bi bi-bullseye"></i>
                                </span>
                                <h5 class="text-xs font-black uppercase tracking-wider text-slate-800">
                                    Đề Gộp Đa Tầng (Dàn X2 VIP & Dàn X1 Lót):
                                </h5>
                            </div>
                            <div class="text-[11px] font-mono text-slate-500">
                                X2: cược 2M (ăn 168M) · X1: cược 1M (ăn 84M)
                            </div>
                        </div>

                        <!-- Dàn X2 (VIP Đồng thuận cao) -->
                        <div>
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-xs font-black text-amber-900 flex items-center gap-1.5">
                                    <span class="rounded bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 px-2 py-0.5 text-[10px] font-black shadow-2xs">DÀN X2 (VIP)</span>
                                    <span>Đồng thuận cao (${deX2Nums.length} số):</span>
                                </span>
                                <span class="text-[11px] text-amber-800 font-bold font-mono">Cược 2M/số · Ăn 168M</span>
                            </div>
                            <div class="flex flex-wrap gap-2">
                                ${deX2Nums.map(n => {
                                    const vote = deVotesMap[n]?.count || 1;
                                    const isDia = vote === 5;
                                    const badgeClass = isDia
                                        ? 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white ring-2 ring-purple-300'
                                        : 'bg-gradient-to-br from-amber-300 to-yellow-400 text-slate-950 border border-amber-400';
                                    return `
                                        <div class="badge-number flex flex-col items-center justify-center w-11 h-11 rounded-2xl font-mono font-black text-xs shadow-xs ${badgeClass}" title="Đề VIP X2: ${n} (${vote}/5 AI đồng thuận)">
                                            <span>${n}</span>
                                            <span class="text-[8px] font-sans font-bold -mt-0.5 opacity-90">${vote}/5</span>
                                        </div>
                                    `;
                                }).join('') || '<span class="text-xs text-slate-400">Không có số</span>'}
                            </div>
                        </div>

                        <!-- Dàn X1 (Lót Bảo Hiểm) -->
                        ${deX1Nums.length ? `
                            <div class="pt-2 border-t border-slate-100">
                                <div class="flex items-center justify-between mb-2">
                                    <span class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                        <span class="rounded bg-indigo-100 text-indigo-900 border border-indigo-200 px-2 py-0.5 text-[10px] font-bold">DÀN X1 (LÓT)</span>
                                        <span>Bảo hiểm rủi ro (${deX1Nums.length} số):</span>
                                    </span>
                                    <span class="text-[11px] text-slate-500 font-mono">Cược 1M/số · Ăn 84M</span>
                                </div>
                                <div class="flex flex-wrap gap-2">
                                    ${deX1Nums.map(n => {
                                        const vote = deVotesMap[n]?.count || 1;
                                        return `
                                            <div class="badge-number flex flex-col items-center justify-center w-10 h-10 rounded-xl bg-indigo-50/80 text-indigo-900 border border-indigo-200 font-mono font-bold text-xs shadow-2xs" title="Đề Lót X1: ${n} (${vote}/5 AI)">
                                                <span>${n}</span>
                                                <span class="text-[8px] font-sans -mt-0.5 opacity-70">${vote}/5</span>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        ` : ''}

                        <!-- Gợi ý Top 20 phẳng -->
                        <div class="pt-2 border-t border-dashed border-slate-200 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
                            <span>Hoặc đánh <strong>Top 20 Đề phẳng</strong>: ${deNums.join(' ')}</span>
                            <span class="font-mono text-purple-700 font-bold">Vốn 20M · Ăn 84M</span>
                        </div>
                    </div>

                    <!-- 2. PHẦN LÔ GỘP ĐA TẦNG (HỆ SỐ X5 ĐẾN X1) -->
                    <div class="rounded-2xl bg-white/90 border border-indigo-200 p-4 space-y-4">
                        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-slate-100 pb-2">
                            <div class="flex items-center gap-2">
                                <span class="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-xs">
                                    <i class="bi bi-dice-6-fill"></i>
                                </span>
                                <h5 class="text-xs font-black uppercase tracking-wider text-slate-800">
                                    Lô Gộp Đa Tầng (Hệ Số X5 Đến X1 Tương Tự Daily):
                                </h5>
                            </div>
                            <div class="text-[11px] font-mono text-slate-500">
                                Hệ số cược = Số phiếu bầu (2.2M x Hệ số) · Ăn 8M x Hệ số/nháy
                            </div>
                        </div>

                        <!-- Tầng X5 -->
                        ${x5List.length ? `
                            <div class="flex flex-col sm:flex-row sm:items-center gap-2">
                                <span class="min-w-[170px] inline-flex items-center gap-1.5 text-xs font-black text-rose-800">
                                    <span class="rounded bg-gradient-to-r from-rose-600 to-pink-600 text-white px-2 py-0.5 text-[10px] font-black shadow-2xs">TẦNG X5 (5 AI)</span>
                                    <span>Cược 11M/số:</span>
                                </span>
                                <div class="flex flex-wrap gap-2">
                                    ${x5List.map(n => `
                                        <span class="badge-number inline-flex items-center justify-center px-3 py-1.5 rounded-xl font-mono font-black text-sm bg-gradient-to-br from-rose-600 to-pink-600 text-white shadow-xs">
                                            ${n} <span class="text-[9px] font-sans ml-1 opacity-90">(5/5)</span>
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        <!-- Tầng X4 -->
                        ${x4List.length ? `
                            <div class="flex flex-col sm:flex-row sm:items-center gap-2">
                                <span class="min-w-[170px] inline-flex items-center gap-1.5 text-xs font-black text-amber-900">
                                    <span class="rounded bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 px-2 py-0.5 text-[10px] font-black shadow-2xs">TẦNG X4 (4 AI)</span>
                                    <span>Cược 8.8M/số:</span>
                                </span>
                                <div class="flex flex-wrap gap-2">
                                    ${x4List.map(n => `
                                        <span class="badge-number inline-flex items-center justify-center px-3 py-1.5 rounded-xl font-mono font-black text-sm bg-gradient-to-br from-amber-400 to-yellow-500 text-slate-950 shadow-xs border border-amber-400">
                                            ${n} <span class="text-[9px] font-sans ml-1 opacity-90">(4/5)</span>
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        <!-- Tầng X3 -->
                        ${x3List.length ? `
                            <div class="flex flex-col sm:flex-row sm:items-center gap-2">
                                <span class="min-w-[170px] inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                                    <span class="rounded bg-emerald-600 text-white px-2 py-0.5 text-[10px] font-black shadow-2xs">TẦNG X3 (3 AI)</span>
                                    <span>Cược 6.6M/số:</span>
                                </span>
                                <div class="flex flex-wrap gap-2">
                                    ${x3List.map(n => `
                                        <span class="badge-number inline-flex items-center justify-center px-3 py-1.5 rounded-xl font-mono font-black text-sm bg-emerald-600 text-white shadow-xs">
                                            ${n} <span class="text-[9px] font-sans ml-1 opacity-90">(3/5)</span>
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        <!-- Tầng X2 -->
                        ${x2List.length ? `
                            <div class="flex flex-col sm:flex-row sm:items-center gap-2">
                                <span class="min-w-[170px] inline-flex items-center gap-1.5 text-xs font-bold text-teal-800">
                                    <span class="rounded bg-teal-600 text-white px-2 py-0.5 text-[10px] font-black shadow-2xs">TẦNG X2 (2 AI)</span>
                                    <span>Cược 4.4M/số:</span>
                                </span>
                                <div class="flex flex-wrap gap-2">
                                    ${x2List.map(n => `
                                        <span class="badge-number inline-flex items-center justify-center px-2.5 py-1.5 rounded-xl font-mono font-black text-xs bg-teal-50 border border-teal-300 text-teal-900 shadow-2xs">
                                            ${n} <span class="text-[8px] font-sans ml-1 opacity-70">(2/5)</span>
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        <!-- Tầng X1 (1 AI) -->
                        ${x1List.length ? `
                            <div class="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-slate-100">
                                <span class="min-w-[170px] inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                    <span class="rounded bg-slate-600 text-white px-2 py-0.5 text-[10px] font-black shadow-2xs">TẦNG X1 (1 AI)</span>
                                    <span>Cược 2.2M/số:</span>
                                </span>
                                <div class="flex flex-wrap gap-2">
                                    ${x1List.map(n => `
                                        <span class="badge-number inline-flex items-center justify-center px-2.5 py-1.5 rounded-xl font-mono font-bold text-xs bg-slate-100 border border-slate-300 text-slate-800 shadow-2xs" title="Lô X1: ${n} (1 AI)">
                                            ${n} <span class="text-[8px] font-sans ml-1 text-slate-500">(1/5)</span>
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        <!-- Gợi ý Top 6 phẳng -->
                        <div class="pt-2 border-t border-dashed border-slate-200 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
                            <span>Hoặc đánh <strong>Top 6 Lô phẳng</strong>: ${loNums.join(' ')}</span>
                            <span class="font-mono text-indigo-700 font-bold">Vốn 13.2M · Ăn 8M/nháy</span>
                        </div>
                    </div>
                </div>
            `;

            // Wire copy buttons
            document.getElementById('btnCopyDeX2')?.addEventListener('click', () => {
                copyToClipboard(deX2Nums.join(' '), `Dàn Đề X2 VIP (${deX2Nums.length} số)`);
            });
            document.getElementById('btnCopyDeX1')?.addEventListener('click', () => {
                copyToClipboard(deX1Nums.join(' '), `Dàn Đề X1 Lót (${deX1Nums.length} số)`);
            });
            document.getElementById('btnCopyDeTop20')?.addEventListener('click', () => {
                copyToClipboard(deNums.join(' '), 'Dàn Đề Gộp Top 20');
            });
            document.getElementById('btnCopyLoTiered')?.addEventListener('click', () => {
                const lines = ['🎲 LÔ GỘP ĐA TẦNG 5 AI (X5 -> X1):'];
                if (x5List.length) lines.push(`- Tầng X5 (Cược 11M): ${x5List.join(', ')}`);
                if (x4List.length) lines.push(`- Tầng X4 (Cược 8.8M): ${x4List.join(', ')}`);
                if (x3List.length) lines.push(`- Tầng X3 (Cược 6.6M): ${x3List.join(', ')}`);
                if (x2List.length) lines.push(`- Tầng X2 (Cược 4.4M): ${x2List.join(', ')}`);
                if (x1List.length) lines.push(`- Tầng X1 (Cược 2.2M): ${x1List.join(', ')}`);
                copyToClipboard(lines.join('\n'), 'Lô Đa Tầng 5 AI (X5 -> X1)');
            });
            document.getElementById('btnCopyLoX1')?.addEventListener('click', () => {
                copyToClipboard(x1List.join(' '), `Dàn Lô X1 (${x1List.length} số)`);
            });
            return;
        }

        // VIEW 2: TỪNG AI RIÊNG BIỆT (ChatGPT, DeepSeek, Gemini, Grok, Muse)
        const src = latestDay.sources?.[selectedModel] || {};
        const info = models[selectedModel] || { name: selectedModel, avatar: '🤖', provider: '' };
        const deNums = (src.de || []).map(x => String(x).padStart(2, '0'));
        const loNums = (src.lo || []).map(x => String(x).padStart(2, '0'));

        container.innerHTML = `
            <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">${info.avatar || '🤖'}</span>
                        <div>
                            <h4 class="text-base font-black text-slate-900">${info.name} (${info.provider || 'AI Model'})</h4>
                            <p class="text-xs text-slate-500">${src.method || 'Mô hình AI phân tích tự động'}</p>
                        </div>
                    </div>

                    <!-- Buttons Copy -->
                    <div class="flex flex-wrap items-center gap-2">
                        <button type="button" id="btnCopyDeAI" class="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-black text-white hover:bg-slate-800 transition shadow-xs cursor-pointer">
                            <i class="bi bi-clipboard-check"></i> Copy Đề (20 số)
                        </button>
                        <button type="button" id="btnCopyLoAI" class="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-black text-slate-800 hover:bg-slate-100 transition shadow-xs cursor-pointer">
                            <i class="bi bi-clipboard-check"></i> Copy Lô (6 số)
                        </button>
                    </div>
                </div>

                ${src.notes ? `
                    <div class="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                        <i class="bi bi-info-circle-fill text-amber-600 mt-0.5"></i>
                        <span><strong>Ghi chú từ AI:</strong> ${src.notes}</span>
                    </div>
                ` : ''}

                <!-- Dàn Đề 20 số -->
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-xs font-black uppercase text-slate-700 tracking-wider">
                            Dàn Đề 20 Số của ${info.name}:
                        </span>
                        <span class="text-xs text-slate-500 font-mono">Vốn 20M · 1 ăn 84M</span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        ${deNums.map(n => `
                            <span class="badge-number flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 text-slate-800 border border-slate-200 text-sm font-black font-mono">
                                ${n}
                            </span>
                        `).join('') || '<span class="text-xs text-slate-400">Không có số</span>'}
                    </div>
                </div>

                <!-- Dàn Lô 6 số -->
                <div class="border-t border-slate-100 pt-4">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-xs font-black uppercase text-slate-700 tracking-wider">
                            Dàn Lô 6 Số của ${info.name}:
                        </span>
                        <span class="text-xs text-slate-500 font-mono">Vốn 13.2M (6 số x 2.2M) · 8M/nháy</span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        ${loNums.map(n => `
                            <span class="badge-number flex items-center justify-center px-4 py-2 rounded-xl bg-indigo-50 text-indigo-900 border border-indigo-200 text-sm font-black font-mono">
                                ${n}
                            </span>
                        `).join('') || '<span class="text-xs text-slate-400">Không có số</span>'}
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btnCopyDeAI')?.addEventListener('click', () => {
            copyToClipboard(deNums.join(' '), `Dàn Đề ${info.name}`);
        });
        document.getElementById('btnCopyLoAI')?.addEventListener('click', () => {
            copyToClipboard(loNums.join(' '), `Dàn Lô ${info.name}`);
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

    function attachLedgerEvents() {
        const list = document.getElementById('historicalLedgerList');
        if (!list || list.__ledgerEventsBound) return;
        list.__ledgerEventsBound = true;

        list.addEventListener('click', (e) => {
            // 1. Toggle bảng 27 giải Lô
            const btnP27 = e.target.closest('.btn-toggle-p27');
            if (btnP27) {
                const date = btnP27.dataset.date;
                const container = document.getElementById(`p27Container-${date}`);
                const chevron = document.getElementById(`p27Chevron-${date}`);
                if (container) {
                    const isHidden = container.classList.toggle('hidden');
                    if (chevron) {
                        chevron.classList.toggle('rotate-180', !isHidden);
                    }
                }
                return;
            }

            // 2. Toggle collapse / expand xem chi tiết dàn số
            const btnDetail = e.target.closest('.btn-toggle-day-detail');
            if (btnDetail) {
                const date = btnDetail.dataset.date;
                if (date) toggleDayDetail(date);
                return;
            }

            // 3. Click vào KPI Card tổng quan -> Mở rộng chi tiết & filter
            const kpiCard = e.target.closest('.kpi-card-interactive');
            if (kpiCard) {
                const date = kpiCard.dataset.date;
                const model = kpiCard.dataset.model;
                if (date) {
                    toggleDayDetail(date, true); // Đảm bảo ngày được mở rộng
                }
                if (model && state.ledgerFilter !== 'all' && state.ledgerFilter !== model) {
                    state.ledgerFilter = model;
                    const sel = document.getElementById('ledgerModelFilter');
                    if (sel) sel.value = model;
                    renderLedger(state.payload.history, state.ledgerFilter, state.payload.models);
                }
                return;
            }
        });
    }

    // -------------------------------------------------------------------------
    // RENDER: Historical Settlement Ledger (Nhật ký đối soát từng ngày)
    // Hỗ trợ collapse/expand từng ngày và hiển thị đối soát chi tiết đa tầng
    // -------------------------------------------------------------------------
    function renderLedger(days = [], filter = 'all', models = {}) {
        const list = document.getElementById('historicalLedgerList');
        if (!list) return;

        if (!days.length) {
            list.innerHTML = '<div class="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Chưa có nhật ký đối soát nào.</div>';
            return;
        }

        // Mặc định mở rộng ngày đầu tiên (mới nhất) nếu chưa có trạng thái
        if (state.expandedDays.size === 0 && days.length > 0) {
            state.expandedDays.add(days[0].date);
        }

        const cardsHtml = days.map(day => {
            const dateStr = day.date;
            const isSettled = Boolean(day.special && day.prizes27?.length === 27 && day.results);
            const specialStr = day.special ? String(day.special).padStart(2, '0') : null;
            const p27 = day.prizes27 || [];
            const results = day.results || {};
            const sources = day.sources || {};
            const cons = day.consensus || {};
            const isExpanded = state.expandedDays.has(dateStr);

            const statusBadge = isSettled
                ? '<span class="rounded-md bg-emerald-50 border border-emerald-300 text-emerald-800 px-2 py-0.5 text-[10px] font-bold shadow-2xs inline-flex items-center gap-1"><i class="bi bi-check-circle-fill text-emerald-600"></i> Đã đối soát</span>'
                : '<span class="rounded-md bg-amber-50 border border-amber-300 text-amber-900 px-2 py-0.5 text-[10px] font-bold border-dashed shadow-2xs animate-pulse inline-flex items-center gap-1"><i class="bi bi-clock-fill text-amber-600"></i> Chờ KQ 18h30</span>';

            return `
                <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4" id="ledgerCard-${dateStr}">
                    <!-- HEADER CỦA NGÀY -->
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="font-mono text-base font-black text-slate-900">${dateStr}</span>
                            ${statusBadge}
                        </div>

                        <div class="flex flex-wrap items-center gap-2">
                            ${isSettled ? `
                                <div class="flex items-center gap-1.5 text-xs mr-1">
                                    <span class="text-slate-500 font-bold">Đặc Biệt:</span>
                                    <span class="font-mono font-black text-white bg-rose-600 rounded-lg px-2.5 py-0.5 shadow-2xs">⭐ ${specialStr}</span>
                                </div>
                                <button type="button" class="btn-toggle-p27 text-[11px] font-bold px-2.5 py-1 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-all flex items-center gap-1 cursor-pointer" data-date="${dateStr}" title="Xem kết quả 27 giải Lô mở thưởng">
                                    <i class="bi bi-grid-3x3-gap text-indigo-600"></i>
                                    <span>27 giải Lô</span>
                                    <i class="bi bi-chevron-down text-[9px] p27-chevron transition-transform" id="p27Chevron-${dateStr}"></i>
                                </button>
                            ` : `
                                <div class="text-xs text-amber-800 font-bold flex items-center gap-1.5 mr-1">
                                    <i class="bi bi-shield-lock-fill text-amber-600"></i> Dàn số đã niêm phong
                                </div>
                            `}

                            <!-- Nút Collapse / Expand xem chi tiết đối soát -->
                            <button type="button" class="btn-toggle-day-detail inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black transition-all border shadow-2xs cursor-pointer ${isExpanded ? 'bg-indigo-50 border-indigo-300 text-indigo-700 hover:bg-indigo-100' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400'}" data-date="${dateStr}">
                                <span class="toggle-text">${isExpanded ? 'Thu gọn' : 'Xem chi tiết'}</span>
                                <i class="bi bi-chevron-${isExpanded ? 'up' : 'down'} text-[10px] detail-chevron"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Bảng 27 giải Lô mở thưởng (ẩn/hiện độc lập) -->
                    ${isSettled ? `
                        <div id="p27Container-${dateStr}" class="hidden p-3.5 rounded-2xl bg-slate-50/90 border border-slate-200 text-xs space-y-2">
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
                                        ${String(num).padStart(2, '0').slice(-2)}
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <!-- THANH TỔNG HỢP NHANH CỦA NGÀY (QUICK KPI CARDS) -->
                    ${isSettled ? `
                        <div class="grid gap-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                            ${['consensus', 'chatgpt', 'deepseek', 'gemini', 'grok', 'muse'].map(mKey => {
                                const r = results[mKey];
                                if (!r) return '';
                                const isCons = mKey === 'consensus';
                                const info = isCons ? { name: '👑 Gộp Consensus', avatar: '👑' } : (models[mKey] || { name: mKey, avatar: '🤖' });
                                const isWin = (r.totalProfitK || 0) >= 0;
                                const isSelected = filter === mKey;
                                const borderClass = isCons
                                    ? 'border-2 border-purple-400 bg-purple-50/70 ring-1 ring-purple-200'
                                    : (isSelected ? 'border-2 border-indigo-500 bg-indigo-50/50' : 'border border-slate-200 bg-slate-50/60');
                                return `
                                    <div class="kpi-card-interactive rounded-2xl p-2.5 text-xs space-y-1.5 ${borderClass} shadow-2xs cursor-pointer hover:border-indigo-400 hover:shadow-xs transition-all" data-date="${dateStr}" data-model="${mKey}" title="Bấm để xem chi tiết dàn số ${info.name}">
                                        <div class="flex items-center justify-between font-bold text-slate-900 border-b border-slate-200/60 pb-1">
                                            <span class="flex items-center gap-1 truncate">
                                                <span>${info.avatar || '🤖'}</span>
                                                <span class="font-black text-[11px] truncate">${info.name}</span>
                                            </span>
                                        </div>
                                        <div class="flex items-center justify-between text-[11px]">
                                            <span class="text-slate-500">Đề:</span>
                                            <span class="font-bold ${r.de?.isHit ? 'text-emerald-700 bg-emerald-100 px-1 rounded' : 'text-slate-400'}">
                                                ${r.de?.isHit ? `🎯 Trúng ${specialStr}` : 'Trượt'}
                                            </span>
                                        </div>
                                        <div class="flex items-center justify-between text-[11px]">
                                            <span class="text-slate-500">Lô:</span>
                                            <span class="font-bold ${r.lo?.hits > 0 ? 'text-indigo-700 font-black' : 'text-slate-400'}">
                                                ${r.lo?.hits > 0 ? `Nổ ${r.lo?.hits}n` : 'Trượt'}
                                            </span>
                                        </div>
                                        <div class="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px]">
                                            <span class="text-[9px] uppercase font-bold text-slate-400">Net:</span>
                                            <span class="font-mono font-black ${isWin ? 'text-emerald-700' : 'text-rose-600'}">
                                                ${formatMoney(r.totalProfitK)}
                                            </span>
                                        </div>
                                        <div class="kpi-expand-indicator text-[9px] text-center font-bold text-indigo-600 pt-0.5 flex items-center justify-center gap-0.5 opacity-80 hover:opacity-100">
                                            <span>${isExpanded ? 'Thu gọn dàn số' : 'Chi tiết dàn số'}</span>
                                            <i class="bi bi-chevron-${isExpanded ? 'up' : 'down'} text-[7px]"></i>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    ` : ''}

                    <!-- NỘI DUNG CHI TIẾT ĐỐI SOÁT DÀN SỐ (COLLAPSIBLE CONTAINER) -->
                    <div id="ledgerDetail-${dateStr}" class="ledger-detail-content ${isExpanded ? '' : 'hidden'} space-y-5 pt-1">
                        ${!isSettled ? `
                            <!-- CHẾ ĐỘ CHỜ KẾT QUẢ: HIỂN THỊ ĐẦY ĐỦ DÀN SỐ ĐỂ ĐỐI CHIẾU TƯƠNG TỰ DAILY -->
                            <div class="space-y-4 pt-1">
                                <!-- Khối 1: Dàn Gộp Consensus (Tier X2 & X1 + Lô X5..X2) -->
                                <div class="rounded-2xl border-2 border-purple-300/80 bg-purple-50/40 p-4 space-y-3">
                                    <div class="flex items-center justify-between border-b border-purple-200/60 pb-2">
                                        <span class="text-xs font-black text-purple-900 flex items-center gap-1.5">
                                            <span>👑</span>
                                            <span>PHƯƠNG PHÁP GỘP 5 AI (CONSENSUS ĐA TẦNG):</span>
                                        </span>
                                        <span class="text-[10px] font-bold uppercase text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full border border-purple-300">
                                            Đồng thuận tối cao
                                        </span>
                                    </div>

                                    <div class="grid gap-3 sm:grid-cols-2">
                                        <!-- Đề Đa Tầng -->
                                        <div class="space-y-1.5">
                                            <div class="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                                                <span>🎯 Đề Gộp (${(cons.deTiers?.x2Nums?.length || 0) + (cons.deTiers?.x1Nums?.length || 0)} số):</span>
                                                <span class="font-mono text-purple-700 text-[10px]">X2 (2M) & X1 (1M)</span>
                                            </div>
                                            <div class="flex flex-wrap gap-1">
                                                ${(cons.deTiers?.x2Nums || []).map(n => `
                                                    <span class="inline-flex items-center justify-center px-1.5 py-0.5 rounded font-mono font-black text-[11px] bg-amber-400 text-slate-950 shadow-2xs" title="Đề VIP X2: ${n}">
                                                        ${n} <span class="text-[8px] ml-0.5">X2</span>
                                                    </span>
                                                `).join('')}
                                                ${(cons.deTiers?.x1Nums || []).map(n => `
                                                    <span class="inline-flex items-center justify-center px-1.5 py-0.5 rounded font-mono text-[11px] bg-indigo-100 text-indigo-900 border border-indigo-200" title="Đề Lót X1: ${n}">
                                                        ${n} <span class="text-[8px] ml-0.5 font-bold text-indigo-700">X1</span>
                                                    </span>
                                                `).join('')}
                                            </div>
                                        </div>

                                        <!-- Lô Đa Tầng -->
                                        <div class="space-y-1.5">
                                            <div class="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                                                <span>🎲 Lô Đa Tầng (X5 -> X1 · ${(cons.loTiers?.x5Nums?.length || 0) + (cons.loTiers?.x4Nums?.length || 0) + (cons.loTiers?.x3Nums?.length || 0) + (cons.loTiers?.x2Nums?.length || 0) + (cons.loTiers?.x1Nums?.length || 0)} số):</span>
                                                <span class="font-mono text-indigo-700 text-[10px]">Cược theo hệ số 5..1</span>
                                            </div>
                                            <div class="flex flex-wrap gap-1">
                                                ${(cons.loTiers?.x5Nums || []).map(n => `
                                                    <span class="inline-flex items-center justify-center px-2 py-0.5 rounded font-mono font-black text-[11px] bg-rose-600 text-white shadow-2xs" title="Lô X5: ${n}">
                                                        ${n} <span class="text-[8px] ml-0.5">X5</span>
                                                    </span>
                                                `).join('')}
                                                ${(cons.loTiers?.x4Nums || []).map(n => `
                                                    <span class="inline-flex items-center justify-center px-2 py-0.5 rounded font-mono font-black text-[11px] bg-amber-400 text-slate-950 border border-amber-500 shadow-2xs" title="Lô X4: ${n}">
                                                        ${n} <span class="text-[8px] ml-0.5">X4</span>
                                                    </span>
                                                `).join('')}
                                                ${(cons.loTiers?.x3Nums || []).map(n => `
                                                    <span class="inline-flex items-center justify-center px-2 py-0.5 rounded font-mono font-bold text-[11px] bg-emerald-600 text-white shadow-2xs" title="Lô X3: ${n}">
                                                        ${n} <span class="text-[8px] ml-0.5">X3</span>
                                                    </span>
                                                `).join('')}
                                                ${(cons.loTiers?.x2Nums || []).map(n => `
                                                    <span class="inline-flex items-center justify-center px-1.5 py-0.5 rounded font-mono font-bold text-[11px] bg-teal-50 border border-teal-300 text-teal-900" title="Lô X2: ${n}">
                                                        ${n} <span class="text-[8px] ml-0.5">X2</span>
                                                    </span>
                                                `).join('')}
                                                ${(cons.loTiers?.x1Nums || []).map(n => `
                                                    <span class="inline-flex items-center justify-center px-1.5 py-0.5 rounded font-mono font-bold text-[11px] bg-slate-100 border border-slate-300 text-slate-800" title="Lô X1: ${n}">
                                                        ${n} <span class="text-[8px] ml-0.5 text-slate-500">X1</span>
                                                    </span>
                                                `).join('')}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Khối 2: Chi tiết 5 AI Độc Lập -->
                                <div class="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                                    ${['chatgpt', 'deepseek', 'gemini', 'grok', 'muse'].map(mKey => {
                                        const src = sources[mKey] || {};
                                        const info = models[mKey] || { name: mKey, avatar: '🤖' };
                                        const de = src.de || [];
                                        const lo = src.lo || [];
                                        return `
                                            <div class="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2 text-xs">
                                                <div class="flex items-center justify-between font-bold text-slate-900 border-b border-slate-200/60 pb-1">
                                                    <span class="flex items-center gap-1">
                                                        <span>${info.avatar || '🤖'}</span>
                                                        <span class="font-black">${info.name}</span>
                                                    </span>
                                                </div>
                                                <div>
                                                    <div class="text-[10px] text-slate-500 font-bold mb-0.5">Đề (${de.length}s):</div>
                                                    <div class="font-mono text-[11px] text-slate-700 leading-relaxed font-semibold">
                                                        ${de.map(x => String(x).padStart(2, '0')).join(' ')}
                                                    </div>
                                                </div>
                                                <div class="pt-1 border-t border-slate-100">
                                                    <div class="text-[10px] text-slate-500 font-bold mb-0.5">Lô (${lo.length}s):</div>
                                                    <div class="font-mono text-[11px] text-indigo-700 font-black">
                                                        ${lo.map(x => String(x).padStart(2, '0')).join(' ')}
                                                    </div>
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>

                                <!-- Thông báo trạng thái quay -->
                                <div class="rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-3.5 text-center text-xs font-bold text-amber-900 flex items-center justify-center gap-2">
                                    <i class="bi bi-broadcast text-base text-amber-600 animate-spin"></i>
                                    <span>Bảng kết quả 27 giải mở thưởng và giải Đặc Biệt đang chờ quay (18h15 - 18h30). Hệ thống sẽ tự động kết toán lúc 19:00!</span>
                                </div>
                            </div>
                        ` : `
                            <!-- CHẾ ĐỘ ĐÃ KẾT TOÁN: HIỂN THỊ ĐỐI SOÁT CHI TIẾT ĐA TẦNG TƯƠNG TỰ DAILY -->
                            <div class="space-y-5 pt-1">
                                <!-- KHỐI 1: PHƯƠNG PHÁP GỘP 5 AI (CONSENSUS ĐA TẦNG - TƯƠNG TỰ DAILY) -->
                                ${(filter === 'all' || filter === 'consensus') ? (() => {
                                    const consRes = results.consensus || {};
                                    const deRes = consRes.de || consRes.deTiered || {};
                                    const loRes = consRes.lo || consRes.loTiered || {};
                                    const deX2Nums = cons.deTiers?.x2Nums || [];
                                    const deX1Nums = cons.deTiers?.x1Nums || [];
                                    const deVotesMap = cons.deVotesMap || {};

                                    const p27Counts = {};
                                    p27.forEach(p => {
                                        const num = String(p).padStart(2, '0').slice(-2);
                                        p27Counts[num] = (p27Counts[num] || 0) + 1;
                                    });

                                    const isConsWin = (consRes.totalProfitK || 0) >= 0;

                                    return `
                                        <div class="rounded-3xl border-2 border-purple-300 bg-gradient-to-b from-purple-50/50 via-white to-purple-50/30 p-5 space-y-4 shadow-sm">
                                            <!-- Header Consensus -->
                                            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-purple-200 pb-3">
                                                <div class="flex items-center gap-2.5">
                                                    <span class="flex h-8 w-8 items-center justify-center rounded-2xl bg-purple-600 text-white shadow-xs text-sm">
                                                        👑
                                                    </span>
                                                    <div>
                                                        <h4 class="text-sm font-black text-purple-950 uppercase tracking-wide flex items-center gap-2">
                                                            <span>PHƯƠNG PHÁP GỘP 5 AI (CONSENSUS ĐA TẦNG)</span>
                                                            <span class="rounded bg-purple-200 text-purple-900 border border-purple-300 px-2 py-0.2 text-[10px] font-bold">
                                                                Đồng Thuận Tối Cao
                                                            </span>
                                                        </h4>
                                                        <p class="text-xs text-purple-800">
                                                            Đề phân tầng X2/X1 · Lô phân tầng X5..X1 theo số vote từ 5 mô hình AI
                                                        </p>
                                                    </div>
                                                </div>

                                                <!-- KPI Tổng Hợp của Consensus -->
                                                <div class="flex flex-wrap items-center gap-2 text-xs font-mono">
                                                    <div class="rounded-xl bg-white border border-purple-200 px-3 py-1.5 shadow-2xs">
                                                        <span class="text-slate-400 text-[10px] block uppercase font-bold">Vốn Tổng:</span>
                                                        <span class="font-black text-slate-800">${formatMoney(consRes.totalStakeK, { signed: false })}</span>
                                                    </div>
                                                    <div class="rounded-xl bg-white border border-purple-200 px-3 py-1.5 shadow-2xs">
                                                        <span class="text-slate-400 text-[10px] block uppercase font-bold">Thưởng Tổng:</span>
                                                        <span class="font-black text-emerald-700">${formatMoney(consRes.totalPayoutK, { signed: false })}</span>
                                                    </div>
                                                    <div class="rounded-xl ${isConsWin ? 'bg-emerald-50 border border-emerald-300 text-emerald-800' : 'bg-rose-50 border border-rose-300 text-rose-800'} px-3 py-1.5 shadow-2xs font-bold">
                                                        <span class="text-[10px] block uppercase opacity-75">Net Lãi/Lỗ:</span>
                                                        <span class="text-sm font-black">${formatMoney(consRes.totalProfitK)}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <!-- CHI TIẾT 1: ĐỀ GỘP ĐA TẦNG (X2 VIP & X1 LÓT) -->
                                            <div class="rounded-2xl bg-white border border-purple-200 p-4 space-y-3">
                                                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-2">
                                                    <div class="flex items-center gap-2">
                                                        <span class="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-800 text-xs font-black">
                                                            🎯
                                                        </span>
                                                        <span class="text-xs font-black uppercase text-slate-900 tracking-wide">
                                                            Đề Gộp Đa Tầng (${deX2Nums.length + deX1Nums.length} số):
                                                        </span>
                                                        <span class="rounded px-2 py-0.5 text-[10px] font-black ${deRes.isHit ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-600'}">
                                                            ${deRes.isHit ? `🎯 TRÚNG ĐB (${specialStr})` : '❌ Trượt'}
                                                        </span>
                                                    </div>
                                                    <div class="text-[11px] font-mono text-slate-500 flex items-center gap-3">
                                                        <span>Vốn: <strong>${formatMoney(deRes.stakeK, { signed: false })}</strong></span>
                                                        <span>Ăn: <strong class="text-emerald-700">${formatMoney(deRes.payoutK, { signed: false })}</strong></span>
                                                        <span>Lãi: <strong class="${deRes.profitK >= 0 ? 'text-emerald-700' : 'text-rose-600'} font-black">${formatMoney(deRes.profitK)}</strong></span>
                                                    </div>
                                                </div>

                                                <!-- Dàn X2 (VIP Đồng thuận cao) -->
                                                <div class="space-y-1.5">
                                                    <div class="flex items-center justify-between text-xs font-bold text-amber-950">
                                                        <span class="flex items-center gap-1.5">
                                                            <span class="rounded bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 px-2 py-0.5 text-[10px] font-black shadow-2xs">DÀN X2 (VIP)</span>
                                                            <span>Đồng thuận cao (${deX2Nums.length} số):</span>
                                                        </span>
                                                        <span class="font-mono text-[11px] text-amber-800">Cược 2M/số · Ăn 168M</span>
                                                    </div>
                                                    <div class="flex flex-wrap gap-1.5">
                                                        ${deX2Nums.map(n => {
                                                            const isHit = specialStr && n === specialStr;
                                                            const votes = deVotesMap[n] || 2;
                                                            if (isHit) {
                                                                return `
                                                                    <span class="badge-number inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 font-mono font-black text-xs ring-2 ring-amber-300 shadow-md animate-pulse" title="Trúng ĐB: ${n}">
                                                                        <span>⭐ ${n}</span>
                                                                        <span class="rounded bg-black/80 text-amber-300 px-1 py-0.2 text-[8px] font-sans">NỔ ĐB (Ăn 168M)</span>
                                                                    </span>
                                                                `;
                                                            }
                                                            return `
                                                                <span class="badge-number inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 font-mono text-xs font-bold" title="Đề VIP ${n} (${votes}/5 vote)">
                                                                    <span>${n}</span>
                                                                    <span class="text-[8px] font-sans text-amber-700 bg-amber-200/70 px-1 rounded">${votes}/5</span>
                                                                </span>
                                                            `;
                                                        }).join('')}
                                                    </div>
                                                </div>

                                                <!-- Dàn X1 (Lót Đồng thuận) -->
                                                <div class="space-y-1.5 pt-2 border-t border-purple-100">
                                                    <div class="flex items-center justify-between text-xs font-bold text-slate-700">
                                                        <span class="flex items-center gap-1.5">
                                                            <span class="rounded bg-indigo-100 text-indigo-900 border border-indigo-200 px-2 py-0.5 text-[10px] font-bold">DÀN X1 (LÓT)</span>
                                                            <span>Đồng thuận lót (${deX1Nums.length} số):</span>
                                                        </span>
                                                        <span class="font-mono text-[11px] text-slate-500">Cược 1M/số · Ăn 84M</span>
                                                    </div>
                                                    <div class="flex flex-wrap gap-1.5">
                                                        ${deX1Nums.map(n => {
                                                            const isHit = specialStr && n === specialStr;
                                                            if (isHit) {
                                                                return `
                                                                    <span class="badge-number inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500 text-white font-mono font-black text-xs ring-2 ring-emerald-300 shadow-md" title="Trúng ĐB: ${n}">
                                                                        <span>⭐ ${n}</span>
                                                                        <span class="rounded bg-emerald-950 text-emerald-200 px-1 py-0.2 text-[8px] font-sans">NỔ ĐB (Ăn 84M)</span>
                                                                    </span>
                                                                `;
                                                            }
                                                            return `
                                                                <span class="badge-number inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-mono text-xs" title="Đề Lót ${n} (1/5 vote)">
                                                                    <span>${n}</span>
                                                                    <span class="text-[8px] font-sans text-slate-400">1/5</span>
                                                                </span>
                                                            `;
                                                        }).join('')}
                                                    </div>
                                                </div>
                                            </div>

                                            <!-- CHI TIẾT 2: LÔ GỘP ĐA TẦNG (TẦNG X5 ĐẾN X1) -->
                                            <div class="rounded-2xl bg-white border border-purple-200 p-4 space-y-3">
                                                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-2">
                                                    <div class="flex items-center gap-2">
                                                        <span class="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-indigo-800 text-xs font-black">
                                                            🎲
                                                        </span>
                                                        <span class="text-xs font-black uppercase text-slate-900 tracking-wide">
                                                            Lô Gộp Đa Tầng (Tầng X5 -> X1 · ${loRes.numbers?.length || 0} số):
                                                        </span>
                                                        <span class="rounded px-2 py-0.5 text-[10px] font-black ${loRes.hits > 0 ? 'bg-indigo-100 text-indigo-800 border border-indigo-300' : 'bg-slate-100 text-slate-600'}">
                                                            ${loRes.hits > 0 ? `🎯 NỔ ${loRes.hits} NHÁY` : '❌ Trượt'}
                                                        </span>
                                                    </div>
                                                    <div class="text-[11px] font-mono text-slate-500 flex items-center gap-3">
                                                        <span>Vốn: <strong>${formatMoney(loRes.stakeK, { signed: false })}</strong></span>
                                                        <span>Ăn: <strong class="text-emerald-700">${formatMoney(loRes.payoutK, { signed: false })}</strong></span>
                                                        <span>Lãi: <strong class="${loRes.profitK >= 0 ? 'text-emerald-700' : 'text-rose-600'} font-black">${formatMoney(loRes.profitK)}</strong></span>
                                                    </div>
                                                </div>

                                                <!-- Các Tầng X5..X1 -->
                                                <div class="space-y-2.5">
                                                    ${[5, 4, 3, 2, 1].map(mult => {
                                                        const tierNums = cons.loTiers?.[`x${mult}Nums`] || [];
                                                        if (!tierNums.length) return '';
                                                        const stakePerNumK = mult * 2200;
                                                        const payoutPerHitK = mult * 8000;
                                                        let tHits = 0;
                                                        tierNums.forEach(n => { tHits += (p27Counts[n] || 0); });
                                                        const tPayoutK = tHits * payoutPerHitK;
                                                        const tStakeK = tierNums.length * stakePerNumK;
                                                        const tProfitK = tPayoutK - tStakeK;

                                                        const tierBadgeClass = mult === 5 ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white' :
                                                            mult === 4 ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 border border-amber-400' :
                                                            mult === 3 ? 'bg-emerald-600 text-white' :
                                                            mult === 2 ? 'bg-teal-600 text-white' : 'bg-slate-600 text-white';

                                                        return `
                                                            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50/70 border border-slate-200">
                                                                <div class="flex flex-col sm:flex-row sm:items-center gap-2">
                                                                    <span class="min-w-[175px] inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                                                        <span class="rounded px-2 py-0.5 text-[10px] font-black shadow-2xs ${tierBadgeClass}">TẦNG X${mult} (${mult}/5 AI)</span>
                                                                        <span class="text-[11px] font-mono text-slate-500">Cược ${formatMoney(stakePerNumK, { signed: false })}/số</span>
                                                                    </span>
                                                                    <div class="flex flex-wrap gap-1.5">
                                                                        ${tierNums.map(n => {
                                                                            const h = p27Counts[n] || 0;
                                                                            if (h > 0) {
                                                                                const numProfitK = (h * payoutPerHitK) - stakePerNumK;
                                                                                return `
                                                                                    <span class="badge-number inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 text-white font-mono font-black text-xs ring-2 ring-emerald-300 shadow-md scale-105" title="Lô ${n}: Nổ ${h} nháy · Ăn ${formatMoney(h * payoutPerHitK, { signed: false })}">
                                                                                        <span>🎯 ${n}</span>
                                                                                        <span class="bg-emerald-950/80 text-emerald-200 px-1.5 py-0.2 rounded text-[9px] font-black font-sans">
                                                                                            ${h}n · ${formatMoney(numProfitK)}
                                                                                        </span>
                                                                                    </span>
                                                                                `;
                                                                            }
                                                                            return `
                                                                                <span class="badge-number inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 font-mono text-xs font-semibold" title="Lô ${n}: 0 nháy">
                                                                                    <span>${n}</span>
                                                                                    <span class="text-[8px] text-slate-400 font-sans">(0n)</span>
                                                                                </span>
                                                                            `;
                                                                        }).join('')}
                                                                    </div>
                                                                </div>
                                                                <div class="text-[11px] font-mono text-right shrink-0">
                                                                    ${tHits > 0 ? `
                                                                        <span class="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                                                            Nổ ${tHits}n · ${formatMoney(tProfitK)}
                                                                        </span>
                                                                    ` : `
                                                                        <span class="text-slate-400">0n · -${formatMoney(tStakeK, { signed: false })}</span>
                                                                    `}
                                                                </div>
                                                            </div>
                                                        `;
                                                    }).join('')}
                                                </div>
                                            </div>
                                        </div>
                                    `;
                                })() : ''}

                                <!-- KHỐI 2: ĐỐI SOÁT CHI TIẾT 5 MÔ HÌNH AI ĐỘC LẬP -->
                                ${(filter === 'all' || filter !== 'consensus') ? (() => {
                                    const activeModels = filter === 'all'
                                        ? ['chatgpt', 'deepseek', 'gemini', 'grok', 'muse']
                                        : [filter];

                                    const p27Counts = {};
                                    p27.forEach(p => {
                                        const num = String(p).padStart(2, '0').slice(-2);
                                        p27Counts[num] = (p27Counts[num] || 0) + 1;
                                    });

                                    return `
                                        <div class="space-y-3">
                                            <div class="flex items-center justify-between border-b border-slate-200 pb-2">
                                                <h5 class="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                                    <span>🤖</span>
                                                    <span>Chi Tiết Đối Soát Từng AI Độc Lập (Đề 20s · Lô 6s Phẳng):</span>
                                                </h5>
                                                <span class="text-xs text-slate-400 font-mono">Vốn Đề 20M · Vốn Lô 13.2M</span>
                                            </div>

                                            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                                                ${activeModels.map(mKey => {
                                                    const src = sources[mKey] || {};
                                                    const r = results[mKey] || {};
                                                    const info = models[mKey] || { name: mKey, avatar: '🤖' };
                                                    const de = src.de || [];
                                                    const lo = src.lo || [];
                                                    const isWin = (r.totalProfitK || 0) >= 0;
                                                    const isDeHit = r.de?.isHit;
                                                    const loHits = r.lo?.hits || 0;

                                                    return `
                                                        <div class="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2.5 text-xs shadow-2xs">
                                                            <div class="flex items-center justify-between font-bold text-slate-900 border-b border-slate-100 pb-2">
                                                                <span class="flex items-center gap-1.5">
                                                                    <span>${info.avatar || '🤖'}</span>
                                                                    <span class="font-black">${info.name}</span>
                                                                </span>
                                                                <span class="font-mono font-black ${isWin ? 'text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200' : 'text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200'} text-[11px]">
                                                                    ${formatMoney(r.totalProfitK)}
                                                                </span>
                                                            </div>

                                                            <!-- Dàn Đề 20 số -->
                                                            <div class="space-y-1">
                                                                <div class="flex items-center justify-between text-[10px] text-slate-500 font-bold">
                                                                    <span>Đề (20s · ${isDeHit ? '<strong class="text-emerald-700">Trúng ĐB</strong>' : 'Trượt'}):</span>
                                                                    <span class="font-mono ${r.de?.profitK >= 0 ? 'text-emerald-700 font-bold' : 'text-slate-400'}">${formatMoney(r.de?.profitK)}</span>
                                                                </div>
                                                                <div class="flex flex-wrap gap-1">
                                                                    ${de.map(n => {
                                                                        const hit = specialStr && n === specialStr;
                                                                        if (hit) {
                                                                            return `<span class="inline-flex items-center px-2 py-0.5 rounded font-mono font-black text-xs bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 ring-2 ring-amber-300 shadow-xs animate-pulse" title="Trúng ĐB: ${n}">⭐ ${n}</span>`;
                                                                        }
                                                                        return `<span class="inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[11px] bg-slate-100 text-slate-700">${n}</span>`;
                                                                    }).join('') || '<span class="text-slate-400 text-[10px]">Không có</span>'}
                                                                </div>
                                                            </div>

                                                            <!-- Dàn Lô 6 số -->
                                                            <div class="pt-2 border-t border-slate-100 space-y-1">
                                                                <div class="flex items-center justify-between text-[10px] text-slate-500 font-bold">
                                                                    <span>Lô (6s · ${loHits > 0 ? `<strong class="text-indigo-700">Nổ ${loHits}n</strong>` : 'Trượt'}):</span>
                                                                    <span class="font-mono ${r.lo?.profitK >= 0 ? 'text-emerald-700 font-bold' : 'text-slate-400'}">${formatMoney(r.lo?.profitK)}</span>
                                                                </div>
                                                                <div class="flex flex-wrap gap-1">
                                                                    ${lo.map(n => {
                                                                        const h = p27Counts[n] || 0;
                                                                        if (h > 0) {
                                                                            return `<span class="inline-flex items-center px-2 py-0.5 rounded font-mono font-black text-xs bg-emerald-600 text-white shadow-xs" title="Lô ${n}: Nổ ${h} nháy (+ ${formatMoney(h * 8000 - 2200)})">🎯 ${n} <span class="text-[9px] font-sans font-bold text-emerald-200 ml-0.5">(${h}n)</span></span>`;
                                                                        }
                                                                        return `<span class="inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[11px] bg-slate-100 text-slate-600">${n}</span>`;
                                                                    }).join('') || '<span class="text-slate-400 text-[10px]">Không có</span>'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    `;
                                                }).join('')}
                                            </div>
                                        </div>
                                    `;
                                })() : ''}
                            </div>
                        `}

                        <!-- Nút Thu Gọn ở chân card mở rộng -->
                        <div class="flex justify-center pt-2">
                            <button type="button" class="btn-toggle-day-detail text-xs font-bold px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs" data-date="${dateStr}">
                                <i class="bi bi-chevron-up"></i>
                                <span>Thu gọn chi tiết ngày ${dateStr}</span>
                            </button>
                        </div>
                    </div>
                </article>
            `;
        }).join('');

        list.innerHTML = cardsHtml;
        attachLedgerEvents();
        updateToggleAllButtonState();
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
    });
})();
