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
        ledgerFilter: 'all'
    };

    const nf = new Intl.NumberFormat('vi-VN');

    function formatMoney(k) {
        if (k === null || k === undefined || Number.isNaN(k)) return '0K';
        const sign = k > 0 ? '+' : '';
        return `${sign}${nf.format(k)}K`;
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
                                <i class="bi bi-clipboard-check"></i> Copy Lô Đa Tầng
                            </button>
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
                                X2: cược 2K (ăn 168K) · X1: cược 1K (ăn 84K)
                            </div>
                        </div>

                        <!-- Dàn X2 (VIP Đồng thuận cao) -->
                        <div>
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-xs font-black text-amber-900 flex items-center gap-1.5">
                                    <span class="rounded bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 px-2 py-0.5 text-[10px] font-black shadow-2xs">DÀN X2 (VIP)</span>
                                    <span>Đồng thuận cao (${deX2Nums.length} số):</span>
                                </span>
                                <span class="text-[11px] text-amber-800 font-bold font-mono">Cược 2K/số · Ăn 168K</span>
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
                                    <span class="text-[11px] text-slate-500 font-mono">Cược 1K/số · Ăn 84K</span>
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
                            <span class="font-mono text-purple-700 font-bold">Vốn 20K · Ăn 84K</span>
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
                                Hệ số cược = Số phiếu bầu (22K x Hệ số) · Ăn 80K x Hệ số/nháy
                            </div>
                        </div>

                        <!-- Tầng X5 -->
                        ${x5List.length ? `
                            <div class="flex flex-col sm:flex-row sm:items-center gap-2">
                                <span class="min-w-[170px] inline-flex items-center gap-1.5 text-xs font-black text-rose-800">
                                    <span class="rounded bg-gradient-to-r from-rose-600 to-pink-600 text-white px-2 py-0.5 text-[10px] font-black shadow-2xs">TẦNG X5 (5 AI)</span>
                                    <span>Cược 110K/số:</span>
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
                                    <span>Cược 88K/số:</span>
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
                                    <span>Cược 66K/số:</span>
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
                                    <span>Cược 44K/số:</span>
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

                        <!-- Tầng X1 (Lót 1 AI nếu có) -->
                        ${x1List.length ? `
                            <div class="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-slate-100">
                                <span class="min-w-[170px] inline-flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                                    <span class="rounded bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 text-[10px]">TẦNG X1 (LÓT)</span>
                                    <span>Cược 22K/số:</span>
                                </span>
                                <div class="flex flex-wrap gap-1.5">
                                    ${x1List.map(n => `
                                        <span class="inline-flex items-center justify-center px-2 py-1 rounded-lg font-mono text-xs bg-slate-50 border border-slate-200 text-slate-600">
                                            ${n}
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        <!-- Gợi ý Top 6 phẳng -->
                        <div class="pt-2 border-t border-dashed border-slate-200 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
                            <span>Hoặc đánh <strong>Top 6 Lô phẳng</strong>: ${loNums.join(' ')}</span>
                            <span class="font-mono text-indigo-700 font-bold">Vốn 132K · Ăn 80K/nháy</span>
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
                const lines = ['🎲 LÔ GỘP ĐA TẦNG 5 AI:'];
                if (x5List.length) lines.push(`- Tầng X5 (Cược 110K): ${x5List.join(', ')}`);
                if (x4List.length) lines.push(`- Tầng X4 (Cược 88K): ${x4List.join(', ')}`);
                if (x3List.length) lines.push(`- Tầng X3 (Cược 66K): ${x3List.join(', ')}`);
                if (x2List.length) lines.push(`- Tầng X2 (Cược 44K): ${x2List.join(', ')}`);
                copyToClipboard(lines.join('\n'), 'Lô Đa Tầng 5 AI');
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
                        <span class="text-xs text-slate-500 font-mono">Vốn 20K · 1 ăn 84K</span>
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
                        <span class="text-xs text-slate-500 font-mono">Vốn 132K (6 số x 22K) · 80K/nháy</span>
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
    // RENDER: Historical Settlement Ledger (Nhật ký đối soát từng ngày)
    // Hỗ trợ hiển thị đầy đủ dàn số để đối chiếu cho cả ngày chưa có kết quả
    // -------------------------------------------------------------------------
    function renderLedger(days = [], filter = 'all', models = {}) {
        const list = document.getElementById('historicalLedgerList');
        if (!list) return;

        if (!days.length) {
            list.innerHTML = '<div class="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Chưa có nhật ký đối soát nào.</div>';
            return;
        }

        const cardsHtml = days.map(day => {
            const dateStr = day.date;
            const isSettled = Boolean(day.special && day.prizes27?.length === 27 && day.results);
            const specialStr = day.special ? String(day.special).padStart(2, '0') : null;
            const p27 = day.prizes27 || [];
            const results = day.results || {};
            const sources = day.sources || {};
            const cons = day.consensus || {};

            const statusBadge = isSettled
                ? '<span class="rounded-md bg-emerald-50 border border-emerald-300 text-emerald-800 px-2 py-0.5 text-[10px] font-bold shadow-2xs"><i class="bi bi-check-circle-fill text-emerald-600"></i> Đã đối soát</span>'
                : '<span class="rounded-md bg-amber-50 border border-amber-300 text-amber-900 px-2 py-0.5 text-[10px] font-bold border-dashed shadow-2xs animate-pulse"><i class="bi bi-clock-fill text-amber-600"></i> Chờ KQ 18h30</span>';

            // Top row with draw result
            return `
                <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="font-mono text-base font-black text-slate-900">${dateStr}</span>
                            ${statusBadge}
                        </div>

                        ${isSettled ? `
                            <div class="flex flex-wrap items-center gap-2 text-xs">
                                <span class="text-slate-500">Đặc Biệt (Đề):</span>
                                <span class="font-mono font-black text-white bg-rose-600 rounded-lg px-2.5 py-0.5 shadow-2xs">${specialStr}</span>
                                <span class="text-slate-300">|</span>
                                <span class="text-slate-500">27 Giải Lô:</span>
                                <span class="text-[11px] font-mono text-slate-700 bg-slate-100 rounded-lg px-2 py-0.5">${p27.length} giải</span>
                            </div>
                        ` : `
                            <div class="text-xs text-amber-800 font-bold flex items-center gap-1.5">
                                <i class="bi bi-shield-lock-fill text-amber-600"></i> Dàn số đã niêm phong · Chờ đối chiếu kết quả lúc 18h30
                            </div>
                        `}
                    </div>

                    <!-- NỘI DUNG ĐỐI CHIẾU DÀN SỐ -->
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
                                            <span class="font-mono text-purple-700 text-[10px]">X2 (2K) & X1 (1K)</span>
                                        </div>
                                        <div class="flex flex-wrap gap-1">
                                            ${(cons.deTiers?.x2Nums || []).map(n => `
                                                <span class="inline-flex items-center justify-center px-1.5 py-0.5 rounded font-mono font-black text-[11px] bg-amber-400 text-slate-950 shadow-2xs" title="Đề VIP X2: ${n}">
                                                    ${n}
                                                </span>
                                            `).join('')}
                                            ${(cons.deTiers?.x1Nums || []).map(n => `
                                                <span class="inline-flex items-center justify-center px-1.5 py-0.5 rounded font-mono text-[11px] bg-indigo-100 text-indigo-900 border border-indigo-200" title="Đề Lót X1: ${n}">
                                                    ${n}
                                                </span>
                                            `).join('')}
                                        </div>
                                    </div>

                                    <!-- Lô Đa Tầng -->
                                    <div class="space-y-1.5">
                                        <div class="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                                            <span>🎲 Lô Đa Tầng (X5 -> X2):</span>
                                            <span class="font-mono text-indigo-700 text-[10px]">Cược theo hệ số</span>
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
                        <!-- CHẾ ĐỘ ĐÃ KẾT TOÁN: HIỂN THỊ KẾT QUẢ ĐỐI SOÁT & THẮNG/THUA -->
                        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 pt-1">
                            ${['consensus', 'chatgpt', 'deepseek', 'gemini', 'grok', 'muse'].map(mKey => {
                                const r = results[mKey];
                                if (!r) return '';
                                const isConsensus = mKey === 'consensus';
                                const info = isConsensus ? { name: '👑 Gộp 5 AI', avatar: '👑' } : (models[mKey] || { name: mKey, avatar: '🤖' });
                                const deHit = r.de?.isHit;
                                const loHits = r.lo?.hits || 0;
                                const totalProfitK = r.totalProfitK || 0;
                                const isWin = totalProfitK >= 0;

                                const cardBorder = isConsensus
                                    ? 'border-2 border-purple-300 bg-purple-50/40'
                                    : 'border border-slate-200 bg-slate-50/50';

                                return `
                                    <div class="rounded-2xl p-3 text-xs space-y-2 ${cardBorder}">
                                        <div class="flex items-center justify-between font-bold text-slate-900 border-b border-slate-200/60 pb-1.5">
                                            <span class="flex items-center gap-1.5">
                                                <span>${info.avatar || '🤖'}</span>
                                                <span class="font-black">${info.name}</span>
                                            </span>
                                        </div>

                                        <!-- De Hit -->
                                        <div class="flex items-center justify-between">
                                            <span class="text-slate-500">Đề:</span>
                                            ${deHit ? `
                                                <span class="font-black text-emerald-700 bg-emerald-100 border border-emerald-300 px-1.5 py-0.2 rounded">
                                                    🎯 Trúng ${specialStr}
                                                </span>
                                            ` : '<span class="text-slate-400 font-bold">Trượt</span>'}
                                        </div>

                                        <!-- Lo Hit -->
                                        <div class="flex items-center justify-between">
                                            <span class="text-slate-500">Lô:</span>
                                            <span class="font-bold ${loHits >= 2 ? 'text-indigo-700 font-black' : (loHits === 1 ? 'text-slate-700' : 'text-slate-400')}">
                                                ${loHits > 0 ? `Nổ ${loHits} nháy` : 'Trượt'}
                                            </span>
                                        </div>

                                        <!-- Day Profit -->
                                        <div class="flex items-center justify-between pt-1 border-t border-slate-200/60">
                                            <span class="text-[10px] text-slate-400 uppercase font-bold">Lãi ngày:</span>
                                            <span class="font-mono font-black ${isWin ? 'text-emerald-700' : 'text-rose-600'}">
                                                ${formatMoney(totalProfitK)}
                                            </span>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `}
                </article>
            `;
        }).join('');

        list.innerHTML = cardsHtml;
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
