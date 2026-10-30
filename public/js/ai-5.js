/**
 * public/js/ai-5.js
 * 
 * Logic giao diện cho trang Đối Soát & Đồng Thuận 5 AI (ChatGPT, DeepSeek, Gemini, Grok, Muse)
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
                <div class="rounded-2xl p-4 flex flex-col justify-between ${borderClass}">
                    <div>
                        <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-3">
                            <div class="flex items-center gap-2">
                                <span class="text-xl">${info.avatar || '🤖'}</span>
                                <span class="font-black text-sm text-slate-900">${info.name}</span>
                            </div>
                            ${isConsensus ? '<span class="rounded bg-purple-600 text-white text-[9px] font-black px-1.5 py-0.2 uppercase">Top Ensembled</span>' : ''}
                        </div>

                        <!-- Đề & Lô Stats -->
                        <div class="space-y-2 text-xs">
                            <div class="flex items-center justify-between">
                                <span class="text-slate-500 font-semibold">Đề (20s):</span>
                                <span class="font-mono font-bold text-slate-800">
                                    ${deWinRate}% <span class="text-[10px] text-slate-400">(${deWins}/${deDays})</span>
                                </span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span class="text-slate-500 font-semibold">Lãi ròng Đề:</span>
                                <span class="font-mono font-bold ${deProfitK >= 0 ? 'text-emerald-700' : 'text-rose-600'}">
                                    ${formatMoney(deProfitK)}
                                </span>
                            </div>
                            <div class="flex items-center justify-between border-t border-dashed border-slate-100 pt-1.5">
                                <span class="text-slate-500 font-semibold">Lô (6s):</span>
                                <span class="font-mono font-bold text-slate-800">
                                    ${loHits} nháy <span class="text-[10px] text-slate-400">(${loAvg}/ngày)</span>
                                </span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span class="text-slate-500 font-semibold">Lãi ròng Lô:</span>
                                <span class="font-mono font-bold ${loProfitK >= 0 ? 'text-emerald-700' : 'text-rose-600'}">
                                    ${formatMoney(loProfitK)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Total Combo PnL Badge -->
                    <div class="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span class="text-[11px] font-bold text-slate-400 uppercase">Tổng Lãi (Net):</span>
                        <div class="text-right">
                            <div class="font-mono font-black ${isPositive ? 'text-emerald-700' : 'text-rose-600'} text-sm">
                                ${formatMoney(comboProfitK)}
                            </div>
                            <div class="text-[10px] font-mono text-slate-400">ROI: ${comboRoi}%</div>
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

        // VIEW 1: DÀN GỘP 5 AI (CONSENSUS)
        if (selectedModel === 'consensus') {
            const deNums = consensus?.deTop20 || [];
            const deVip = consensus?.deVip || [];
            const loNums = consensus?.loTop6 || [];
            const deTiers = consensus?.deTiers || {};
            const deVotesMap = consensus?.deVotesMap || {};
            const loVotesMap = consensus?.loVotesMap || {};

            container.innerHTML = `
                <div class="rounded-3xl border-2 border-purple-400/90 bg-gradient-to-br from-purple-50/70 via-white to-indigo-50/50 p-6 shadow-sm space-y-6">
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-purple-200/80 pb-4">
                        <div class="flex items-center gap-2.5">
                            <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-md text-lg">
                                👑
                            </span>
                            <div>
                                <h4 class="text-base font-black text-slate-900">Phương Pháp Gộp Consensus 5 Siêu Trí Tuệ</h4>
                                <p class="text-xs text-slate-500">Tự động tổng hợp và xếp hạng theo tỷ lệ đồng thuận cao nhất từ 5 AI</p>
                            </div>
                        </div>

                        <!-- Buttons Copy -->
                        <div class="flex flex-wrap items-center gap-2">
                            <button type="button" id="btnCopyDeTop20" class="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-black text-white hover:bg-purple-700 transition shadow-xs cursor-pointer">
                                <i class="bi bi-clipboard-check"></i> Copy Đề Top 20
                            </button>
                            <button type="button" id="btnCopyLoTop6" class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-black text-white hover:bg-indigo-700 transition shadow-xs cursor-pointer">
                                <i class="bi bi-clipboard-check"></i> Copy Lô Top 6
                            </button>
                        </div>
                    </div>

                    <!-- Tiers Legend -->
                    <div class="flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-white/80 border border-purple-200 text-xs">
                        <span class="font-bold text-slate-500 uppercase text-[10px] tracking-wider">Cấp độ đồng thuận:</span>
                        <span class="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-2 py-0.5 text-[10px] font-black shadow-2xs">
                            💎 Kim Cương (5/5 AI: ${deTiers.tier5?.length || 0} số)
                        </span>
                        <span class="inline-flex items-center gap-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-[10px] font-bold">
                            ⭐ Vàng (4/5 AI: ${deTiers.tier4?.length || 0} số)
                        </span>
                        <span class="inline-flex items-center gap-1 rounded-lg bg-sky-100 text-sky-900 border border-sky-300 px-2 py-0.5 text-[10px] font-bold">
                            🥈 Bạc (3/5 AI: ${deTiers.tier3?.length || 0} số)
                        </span>
                        <span class="inline-flex items-center gap-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 text-[10px] font-medium">
                            🥉 Đồng (2/5 AI: ${deTiers.tier2?.length || 0} số)
                        </span>
                    </div>

                    <!-- Dàn Đề Top 20 -->
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                                <i class="bi bi-bullseye text-purple-600"></i> Dàn Đề Gộp Tinh Tuyển Top 20 (Đồng Thuận Cao Nhất):
                            </span>
                            <span class="text-xs text-slate-500 font-mono">Vốn 20K · 1 ăn 84K</span>
                        </div>
                        <div class="flex flex-wrap gap-2.5">
                            ${deNums.map(n => {
                                const vote = deVotesMap[n]?.count || 1;
                                let badgeClass = 'bg-slate-100 text-slate-800 border-slate-200';
                                let tagPill = `${vote}/5`;
                                if (vote === 5) {
                                    badgeClass = 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-black shadow-sm ring-2 ring-purple-300';
                                } else if (vote === 4) {
                                    badgeClass = 'bg-amber-100 text-amber-900 border-2 border-amber-300 font-black shadow-2xs';
                                } else if (vote === 3) {
                                    badgeClass = 'bg-sky-100 text-sky-900 border border-sky-300 font-bold';
                                }
                                return `
                                    <div class="badge-number relative flex flex-col items-center justify-center w-12 h-12 rounded-2xl border text-sm font-black font-mono ${badgeClass}" title="Được ${vote}/5 AI đồng thuận bầu chọn">
                                        <span>${n}</span>
                                        <span class="text-[9px] font-sans font-bold opacity-80 -mt-1">${tagPill}</span>
                                    </div>
                                `;
                            }).join('') || '<span class="text-xs text-slate-400">Chưa có số</span>'}
                        </div>
                    </div>

                    <!-- Dàn Lô Top 6 -->
                    <div class="border-t border-purple-200/80 pt-4">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                                <i class="bi bi-dice-6-fill text-indigo-600"></i> Dàn Lô Gộp Tinh Tuyển Top 6:
                            </span>
                            <span class="text-xs text-slate-500 font-mono">Vốn 132K (6 số x 22K) · 80K/nháy</span>
                        </div>
                        <div class="flex flex-wrap gap-2.5">
                            ${loNums.map(n => {
                                const vote = loVotesMap[n]?.count || 1;
                                const modelsList = (loVotesMap[n]?.models || []).map(m => models[m]?.name || m).join(', ');
                                return `
                                    <div class="badge-number flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-300/80 px-4 py-2 text-indigo-950 shadow-2xs" title="Đồng thuận: ${modelsList}">
                                        <span class="font-mono text-base font-black">${n}</span>
                                        <span class="rounded-full bg-indigo-600 text-white px-2 py-0.5 text-[10px] font-black">${vote}/5 AI</span>
                                    </div>
                                `;
                            }).join('') || '<span class="text-xs text-slate-400">Chưa có số</span>'}
                        </div>
                    </div>
                </div>
            `;

            // Wire copy buttons
            document.getElementById('btnCopyDeTop20')?.addEventListener('click', () => {
                copyToClipboard(deNums.join(' '), 'Dàn Đề Gộp Top 20');
            });
            document.getElementById('btnCopyLoTop6')?.addEventListener('click', () => {
                copyToClipboard(loNums.join(' '), 'Dàn Lô Gộp Top 6');
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

            const statusBadge = isSettled
                ? '<span class="rounded-md bg-emerald-50 border border-emerald-300 text-emerald-800 px-2 py-0.5 text-[10px] font-bold shadow-2xs">🟢 Đã đối soát</span>'
                : '<span class="rounded-md bg-amber-50 border border-amber-300 text-amber-900 px-2 py-0.5 text-[10px] font-bold border-dashed shadow-2xs">⏳ Chờ mở thưởng 18h30</span>';

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
                        ` : '<span class="text-xs text-slate-400">Đang chờ quay 18h30</span>'}
                    </div>

                    ${!isSettled ? `
                        <div class="py-4 text-center text-xs text-slate-500">
                            Các dàn cược của 5 AI và Phương pháp Gộp Consensus đã niêm phong an toàn. Kết quả đối soát sẽ tự động cập nhật lúc 19:00.
                        </div>
                    ` : `
                        <!-- Result Matrix / Comparison -->
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
        const filterSelect = document.getElementById('ledgerModelFilter');
        if (filterSelect) {
            filterSelect.addEventListener('change', (e) => {
                state.ledgerFilter = e.target.value;
                if (state.payload) {
                    renderLedger(state.payload.history, state.ledgerFilter, state.payload.models);
                }
            });
        }
    });
})();
