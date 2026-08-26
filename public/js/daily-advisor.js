// public/js/daily-advisor.js
(() => {
    const number = value => String(Number(value)).padStart(2, '0');
    const percent = value => `${(Number(value || 0) * 100).toFixed(1)}%`;
    const fmt = value => new Intl.NumberFormat('vi-VN').format(Number(value || 0));
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
    const signed = value => `${Number(value || 0) >= 0 ? '+' : ''}${fmt(value)}K`;

    let payload = null;
    let activeMainTab = 'dualMerge'; // 'dualMerge' | 'singleMethod'
    let currentTier = 'main30';
    let currentFilter = 'all';
    let currentStrategyId = 'balanced-selector-fixed30-v1';
    let dualMergeLogLimit = '30';

    const byId = id => document.getElementById(id);

    // Toast Notification Helper
    function showToast(message) {
        const toast = byId('toast');
        const toastMsg = byId('toastMessage');
        if (!toast || !toastMsg) return;
        toastMsg.textContent = message;
        toast.classList.remove('translate-y-10', 'opacity-0', 'pointer-events-none');
        toast.classList.add('translate-y-0', 'opacity-100');
        setTimeout(() => {
            toast.classList.remove('translate-y-0', 'opacity-100');
            toast.classList.add('translate-y-10', 'opacity-0', 'pointer-events-none');
        }, 2200);
    }

    // Copy to clipboard helper
    function copyNumbers(numbers, separator = ' ') {
        if (!Array.isArray(numbers) || numbers.length === 0) {
            showToast('Không có số nào để sao chép!');
            return;
        }
        const text = numbers.map(number).join(separator);
        navigator.clipboard.writeText(text).then(() => {
            showToast(`Đã sao chép ${numbers.length} số thành công!`);
        }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast(`Đã sao chép ${numbers.length} số!`);
        });
    }

    // ==========================================
    // TAB SWITCHING LOGIC
    // ==========================================
    function setupTabSwitching() {
        const btnDualMerge = byId('tabBtnDualMerge');
        const btnSingle = byId('tabBtnSingleMethod');
        const viewDual = byId('dualMergeView');
        const viewSingle = byId('singleMethodView');

        if (!btnDualMerge || !btnSingle || !viewDual || !viewSingle) return;

        btnDualMerge.onclick = () => {
            activeMainTab = 'dualMerge';
            btnDualMerge.className = 'flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-indigo-600 px-4 py-2.5 text-sm font-black text-white shadow-md transition-all';
            btnSingle.className = 'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors';
            viewDual.classList.remove('hidden');
            viewSingle.classList.add('hidden');
        };

        btnSingle.onclick = () => {
            activeMainTab = 'singleMethod';
            btnSingle.className = 'flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white shadow-md transition-all';
            btnDualMerge.className = 'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors';
            viewSingle.classList.remove('hidden');
            viewDual.classList.add('hidden');
        };
    }

    // ==========================================
    // 1. RENDER THỰC CHIẾN GỘP (DUAL-MERGE ADVISOR)
    // ==========================================
    function renderDualMergeView(dualMergeData) {
        if (!dualMergeData) return;
        const summary = dualMergeData.summary || {};
        const rec = dualMergeData.latestRecommendation;

        // KPI Summary Cards
        const kpiContainer = byId('dualMergeSummaryCards');
        if (kpiContainer) {
            const profitClass = Number(summary.overallProfitK || 0) >= 0 ? 'text-emerald-400 font-black' : 'text-rose-400 font-black';
            const kpis = [
                ['NGÀY ĐÃ ĐỐI SOÁT', `${summary.totalSettled || 0} kỳ`, 'Khóa snapshot Strict PIT'],
                ['TRÚNG X2 (CỰC VIP)', `${summary.winsX2 || 0} kỳ`, `${percent(summary.winX2Rate)} · Ăn 168K (+108K)`],
                ['TRÚNG X1 (BỌC LÓT)', `${summary.winsX1 || 0} kỳ`, `${percent(summary.winX1Rate)} · Ăn 84K (+24K)`],
                ['TỔNG TỶ LỆ TRÚNG', `${percent(summary.overallHitRate)}`, `${summary.totalWins || 0} thắng / ${summary.totalLosses || 0} trượt`],
                ['TỔNG TIỀN VỐN', `${fmt(summary.totalStakeK)}K`, '60.000K mỗi ngày'],
                ['LÃI / LỖ RÒNG', `${signed(summary.overallProfitK)}`, `${percent(summary.roi)} ROI`]
            ];

            kpiContainer.innerHTML = kpis.map(([label, val, note], idx) => `
                <div class="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                    <p class="text-[10px] font-black uppercase tracking-wider text-amber-300/90">${escapeHtml(label)}</p>
                    <p class="mt-1 text-xl sm:text-2xl font-black ${idx === 5 ? profitClass : 'text-white'}">${escapeHtml(val)}</p>
                    <p class="mt-0.5 text-xs text-slate-300">${escapeHtml(note)}</p>
                </div>
            `).join('');
        }

        // Today's Recommendation Card
        if (rec) {
            const targetDateEl = byId('dualMergeTargetDate');
            if (targetDateEl) targetDateEl.textContent = rec.predictionDate || '--/--/----';
            const sourceDateEl = byId('dualMergeSourceDate');
            if (sourceDateEl) sourceDateEl.textContent = `Dữ liệu nguồn đến ${rec.sourceDataThrough || '-'} · Khóa bất biến 100% trước giờ mở thưởng`;
            const confEl = byId('dualMergeConfidence');
            if (confEl) confEl.textContent = `⭐⭐⭐⭐⭐ ${Number(rec.confidence || 4.9).toFixed(1)} / 5.0`;

            // Methods Badges
            const methodsContainer = byId('dualMergeSelectedMethods');
            if (methodsContainer) {
                methodsContainer.innerHTML = `
                    <div class="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-100/90 px-3.5 py-1.5 text-xs font-bold text-amber-950 shadow-xs">
                        <i class="bi bi-award-fill text-amber-600"></i>
                        <span>Phương pháp 1: <strong>${escapeHtml(rec.m1Label || rec.m1)}</strong></span>
                    </div>
                    <div class="inline-flex items-center gap-2 rounded-xl border border-indigo-300 bg-indigo-100/90 px-3.5 py-1.5 text-xs font-bold text-indigo-950 shadow-xs">
                        <i class="bi bi-award-fill text-indigo-600"></i>
                        <span>Phương pháp 2: <strong>${escapeHtml(rec.m2Label || rec.m2)}</strong></span>
                    </div>
                    <div class="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-xs">
                        <span>Trùng khớp: <strong class="text-amber-600 font-mono">${rec.overlapCount}</strong> số</span>
                        <span class="text-slate-300">|</span>
                        <span>Tổng dàn gộp: <strong class="text-indigo-600 font-mono">${rec.totalNumbersCount}</strong> số</span>
                    </div>
                `;
            }

            // Chips X2
            const countX2Badge = byId('countX2Badge');
            if (countX2Badge) countX2Badge.textContent = `${rec.intersectionX2?.length || 0} số`;
            const chipsX2 = byId('chipsContainerX2');
            if (chipsX2) {
                chipsX2.innerHTML = (rec.intersectionX2 || []).map(n => `
                    <span class="inline-flex h-11 min-w-11 items-center justify-center rounded-2xl border-2 border-amber-400 bg-gradient-to-tr from-amber-200 via-amber-300 to-yellow-200 font-mono text-base font-black text-amber-950 shadow-md shadow-amber-500/20 transition-transform hover:scale-110">
                        ${number(n)}
                    </span>
                `).join('') || '<p class="text-xs text-amber-800">Đang cập nhật...</p>';
            }

            // Chips X1
            const countX1Badge = byId('countX1Badge');
            if (countX1Badge) countX1Badge.textContent = `${rec.uniqueSinglesX1?.length || 0} số`;
            const chipsX1 = byId('chipsContainerX1');
            if (chipsX1) {
                chipsX1.innerHTML = (rec.uniqueSinglesX1 || []).map(n => `
                    <span class="inline-flex h-10 min-w-10 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 font-mono text-sm font-black text-indigo-900 shadow-xs transition-transform hover:scale-105">
                        ${number(n)}
                    </span>
                `).join('') || '<p class="text-xs text-indigo-800">Đang cập nhật...</p>';
            }

            // Plain Reasons
            const reasonsContainer = byId('dualMergePlainReasons');
            if (reasonsContainer) {
                reasonsContainer.innerHTML = (rec.plainReasons || []).map(r => `
                    <p class="flex items-start gap-2">
                        <i class="bi bi-check-circle-fill text-amber-500 mt-0.5 shrink-0 text-xs"></i>
                        <span>${escapeHtml(r)}</span>
                    </p>
                `).join('');
            }

            // Copy Action Handlers
            const btnCopyAll = byId('btnCopyAllMergeSpace');
            if (btnCopyAll) btnCopyAll.onclick = () => copyNumbers(rec.fullUnion, ' ');

            const btnCopyX2Space = byId('btnCopyX2Space');
            if (btnCopyX2Space) btnCopyX2Space.onclick = () => copyNumbers(rec.intersectionX2, ' ');
            const btnCopyX2Comma = byId('btnCopyX2Comma');
            if (btnCopyX2Comma) btnCopyX2Comma.onclick = () => copyNumbers(rec.intersectionX2, ', ');

            const btnCopyX1Space = byId('btnCopyX1Space');
            if (btnCopyX1Space) btnCopyX1Space.onclick = () => copyNumbers(rec.uniqueSinglesX1, ' ');
            const btnCopyX1Comma = byId('btnCopyX1Comma');
            if (btnCopyX1Comma) btnCopyX1Comma.onclick = () => copyNumbers(rec.uniqueSinglesX1, ', ');
        }

        // Multi-Horizon Windows
        const windowsContainer = byId('dualMergeWindowsTable');
        if (windowsContainer && summary.windows) {
            const wins = summary.windows;
            const windowItems = [
                ['7 NGÀY GẦN NHẤT', wins.last7],
                ['15 NGÀY GẦN NHẤT', wins.last15],
                ['30 NGÀY GẦN NHẤT', wins.last30],
                ['60 NGÀY GẦN NHẤT', wins.last60],
                ['90 NGÀY GẦN NHẤT', wins.last90]
            ];

            windowsContainer.innerHTML = windowItems.map(([label, w]) => {
                if (!w || !w.days) return '';
                const profitClass = Number(w.profitK || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700';
                return `
                    <div class="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-xs">
                        <p class="text-[10px] font-black uppercase tracking-wider text-slate-500">${escapeHtml(label)}</p>
                        <strong class="mt-1 block text-lg font-black text-slate-900">${percent(w.hitRate)} trúng</strong>
                        <p class="text-xs text-slate-600 font-semibold mt-0.5">${w.winsX2} kỳ x2 · ${w.winsX1} kỳ x1 · ${w.days} ngày</p>
                        <p class="mt-1 font-mono font-black text-xs ${profitClass}">${signed(w.profitK)} (${percent(w.roi)} ROI)</p>
                    </div>
                `;
            }).join('');
        }

        // Settled Dual-Merge Ledger
        renderDualMergeLedger(dualMergeData.settledLedger);
    }

    function renderDualMergeLedger(records) {
        const container = byId('dualMergeLedgerBody');
        if (!container) return;

        const limitVal = dualMergeLogLimit;
        let rows = (records || []).slice().reverse();
        if (limitVal !== 'all') {
            const limitNum = Number(limitVal) || 30;
            rows = rows.slice(0, limitNum);
        }

        if (!rows.length) {
            container.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-500">Chưa có nhật ký đối soát.</td></tr>';
            return;
        }

        container.innerHTML = rows.map(r => {
            const isSettled = r.settled && Number.isInteger(r.actual);
            const actualStr = isSettled ? number(r.actual) : '??';

            let outcomeClass = 'bg-amber-100 text-amber-800 border-amber-200';
            let outcomeText = 'Chờ kết quả';
            if (isSettled) {
                if (r.hitType === 'win_x2') {
                    outcomeClass = 'bg-gradient-to-r from-amber-200 to-yellow-300 text-amber-950 border-amber-400 font-black shadow-xs';
                    outcomeText = '🎉 TRÚNG X2 (+108K)';
                } else if (r.hitType === 'win_x1') {
                    outcomeClass = 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold';
                    outcomeText = '✅ TRÚNG X1 (+24K)';
                } else {
                    outcomeClass = 'bg-rose-100 text-rose-800 border-rose-200 font-bold';
                    outcomeText = '❌ TRƯỢT (-60K)';
                }
            }

            const x2Nums = r.intersection || [];
            const x1Nums = r.uniqueSingles || [];

            const chipsHtml = [
                ...x2Nums.map(n => {
                    const match = isSettled && Number(n) === Number(r.actual);
                    return `<span class="rounded px-1.5 py-0.5 font-mono text-xs font-black ${match ? 'bg-amber-300 text-amber-950 ring-2 ring-amber-400' : 'bg-amber-100/90 text-amber-950 border border-amber-300'}">${number(n)}<sup class="text-[9px] text-amber-700">x2</sup></span>`;
                }),
                ...x1Nums.map(n => {
                    const match = isSettled && Number(n) === Number(r.actual);
                    return `<span class="rounded px-1.5 py-0.5 font-mono text-xs font-bold ${match ? 'bg-amber-300 text-amber-950 ring-2 ring-amber-400' : 'bg-slate-100 text-slate-700 border border-slate-200'}">${number(n)}</span>`;
                })
            ].join(' ');

            const profitClass = isSettled
                ? (Number(r.profitK) >= 0 ? 'text-emerald-700' : 'text-rose-700')
                : 'text-slate-400';

            return `
                <tr class="hover:bg-slate-50/80 transition-colors">
                    <td class="px-4 py-3 font-mono font-bold text-slate-900">${escapeHtml(r.date)}</td>
                    <td class="px-3 py-3 text-center">
                        <span class="inline-flex h-7 min-w-7 items-center justify-center rounded-lg border border-amber-300 bg-amber-100 font-mono text-xs font-black text-amber-950">
                            ${actualStr}
                        </span>
                    </td>
                    <td class="px-4 py-3 max-w-[200px]">
                        <p class="font-bold text-slate-900 truncate">${escapeHtml(r.m1Label || r.m1 || '-')}</p>
                        <p class="text-[11px] text-slate-500 truncate">${escapeHtml(r.m2Label || r.m2 || '-')}</p>
                    </td>
                    <td class="px-4 py-3 max-w-[340px]">
                        <div class="flex flex-wrap gap-1">${chipsHtml}</div>
                    </td>
                    <td class="px-3 py-3 text-center">
                        <span class="inline-flex rounded-lg border px-2.5 py-1 text-xs ${outcomeClass}">${outcomeText}</span>
                    </td>
                    <td class="px-4 py-3 text-right font-mono font-black ${profitClass}">
                        ${isSettled ? `${signed(r.profitK)} (${signed(r.cumulativeProfitK)})` : '--'}
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ==========================================
    // 2. RENDER GỢI Ý PHƯƠNG PHÁP ĐƠN (LEGACY VIEW)
    // ==========================================
    function recordStrategies(record) {
        const strategies = Array.isArray(record?.strategySnapshots)
            ? record.strategySnapshots.slice()
            : [];
        if (!strategies.some(strategy => strategy.strategyId === 'balanced-selector-fixed30-v1') && record?.main) {
            strategies.push({
                strategyId: 'balanced-selector-fixed30-v1',
                label: 'Bộ chọn cân bằng (dàn chính)',
                description: 'Dàn chính đã phát hành trong snapshot cũ.',
                status: 'production-tracked',
                numbers: record.main.numbers || [],
                betCount: record.main.numbers?.length || 0,
                abstained: false,
                hit: record.main.hit,
                sourceMethodIds: record.main.methodId ? [record.main.methodId] : []
            });
        }
        const hybridId = record?.hybrid?.id;
        if (hybridId && !strategies.some(strategy => strategy.strategyId === hybridId)) {
            strategies.push({
                strategyId: hybridId,
                label: record.hybrid.label || 'Đồng thuận toàn bộ dàn 30',
                description: 'Lane đồng thuận đã phát hành trong snapshot cũ.',
                status: 'research-only',
                numbers: record.hybrid.numbers || [],
                betCount: record.hybrid.numbers?.length || 0,
                abstained: false,
                hit: record.hybrid.hit,
                sourceMethodIds: (record.hybrid.leaders || []).flatMap(row => row.methodIds || [row.methodId]).filter(Boolean)
            });
        }
        return strategies;
    }

    const strategyForRecord = (record, strategyId = currentStrategyId) => recordStrategies(record)
        .find(strategy => strategy.strategyId === strategyId) || null;

    function strategyCatalog() {
        const catalog = new Map((payload?.strategyCatalog || []).map(strategy => [strategy.id, strategy]));
        (payload?.records || []).forEach(record => recordStrategies(record).forEach(strategy => {
            if (!catalog.has(strategy.strategyId)) {
                catalog.set(strategy.strategyId, {
                    id: strategy.strategyId,
                    label: strategy.label || strategy.strategyId,
                    status: strategy.status || 'research-only',
                    description: strategy.description || ''
                });
            }
        }));
        return [...catalog.values()];
    }

    function summarizeStrategyRows(strategyId = currentStrategyId) {
        const candidateRows = (payload?.records || []).map(record => ({
            record,
            strategy: strategyForRecord(record, strategyId)
        })).filter(row => row.record?.settled && row.strategy);
        const issuedRows = candidateRows.filter(row => !row.strategy.abstained && row.strategy.numbers?.length);
        const wins = issuedRows.filter(row => row.strategy.hit).length;
        const losses = issuedRows.length - wins;
        let currentLoss = 0;
        let longestLoss = 0;
        issuedRows.forEach(row => {
            currentLoss = row.strategy.hit ? 0 : currentLoss + 1;
            longestLoss = Math.max(longestLoss, currentLoss);
        });
        const stakeK = issuedRows.reduce((sum, row) => sum + Number(row.strategy.betCount || row.strategy.numbers.length) * 1000, 0);
        const profitK = wins * 84 * 1000 - stakeK;
        const averageBetCount = issuedRows.length
            ? issuedRows.reduce((sum, row) => sum + Number(row.strategy.betCount || row.strategy.numbers.length), 0) / issuedRows.length
            : 0;
        const hitRate = issuedRows.length ? wins / issuedRows.length : 0;
        const breakEvenHitRate = averageBetCount / 84;
        return {
            candidateDays: candidateRows.length,
            days: issuedRows.length,
            abstainedDays: candidateRows.length - issuedRows.length,
            wins,
            losses,
            hitRate,
            averageBetCount,
            stakeK,
            profitK,
            roi: stakeK ? profitK / stakeK : 0,
            longestLoss,
            breakEvenHitRate,
            breakEvenWins: Math.ceil(issuedRows.length * breakEvenHitRate),
            isAboveBreakEven: issuedRows.length > 0 && hitRate >= breakEvenHitRate,
            marginToBreakEven: hitRate - breakEvenHitRate
        };
    }

    function renderSingleMethodView() {
        const latest = payload?.records?.[0];
        if (!latest) return;

        const summary = summarizeStrategyRows(currentStrategyId);
        const cardsContainer = byId('summaryCards');
        if (cardsContainer) {
            const cards = [
                ['NGÀY THEO DÕI', `${summary.days} kỳ`, `${summary.abstainedDays} kỳ bỏ`],
                ['KẾT QUẢ ĐỐI SOÁT', `${summary.wins} trúng / ${summary.losses} trượt`, `Dàn bình quân ${Math.round(summary.averageBetCount || 30)} số`],
                ['TỶ LỆ TRÚNG', percent(summary.hitRate), `Hòa vốn ${percent(summary.breakEvenHitRate)}`],
                ['TỔNG VỐN', `${fmt(summary.stakeK)}K`, '1.000K mỗi số'],
                ['LÃI / LỖ RÒNG', signed(summary.profitK), `${percent(summary.roi)} ROI`]
            ];
            cardsContainer.innerHTML = cards.map(([label, val, note]) => `
                <div class="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                    <p class="text-[10px] font-black uppercase tracking-wider text-indigo-300">${escapeHtml(label)}</p>
                    <p class="mt-1 text-2xl font-black text-white">${escapeHtml(val)}</p>
                    <p class="mt-0.5 text-xs text-indigo-200">${escapeHtml(note)}</p>
                </div>
            `).join('');
        }

        // Render Strategy Selector
        const selectEl = byId('strategySelect');
        if (selectEl) {
            const strategies = strategyCatalog();
            selectEl.innerHTML = strategies.map(s => `
                <option value="${escapeHtml(s.id)}" ${s.id === currentStrategyId ? 'selected' : ''}>
                    ${escapeHtml(s.label)} (${s.status === 'production-tracked' ? 'Chính' : 'Thử nghiệm'})
                </option>
            `).join('');
            selectEl.onchange = e => {
                currentStrategyId = e.target.value;
                renderSingleMethodView();
            };
        }

        // Render Strategy Overview
        const overviewEl = byId('strategyOverview');
        if (overviewEl) {
            const currentStrat = strategyForRecord(latest, currentStrategyId);
            const numbers = currentStrat?.numbers || [];
            overviewEl.innerHTML = `
                <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
                    <div>
                        <h3 class="font-black text-slate-900 text-lg">${escapeHtml(currentStrat?.label || 'Dàn Số')}</h3>
                        <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(currentStrat?.description || '')}</p>
                    </div>
                    <button id="btnCopySingleMethod" class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-500 transition-all">
                        <i class="bi bi-clipboard"></i> Copy dàn ${numbers.length} số
                    </button>
                </div>
                <div class="mt-4 flex flex-wrap gap-2">
                    ${numbers.map(n => `<span class="inline-flex h-10 min-w-10 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 font-mono text-sm font-black text-indigo-900">${number(n)}</span>`).join('')}
                </div>
            `;
            const btnCopy = byId('btnCopySingleMethod');
            if (btnCopy) btnCopy.onclick = () => copyNumbers(numbers, ' ');
        }

        // Render History Log for single method
        const historyContainer = byId('historyLog');
        if (historyContainer) {
            const rows = (payload.records || []).slice(0, 30);
            historyContainer.innerHTML = rows.map(r => {
                const strat = strategyForRecord(r, currentStrategyId);
                const isSettled = r.settled && Number.isInteger(r.actual);
                const isHit = isSettled && strat?.hit;
                const statusClass = !isSettled ? 'bg-amber-100 text-amber-800' : isHit ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800';
                const statusText = !isSettled ? 'Chờ KQ' : isHit ? 'Trúng' : 'Trượt';
                const nums = strat?.numbers || [];

                return `
                    <article class="p-4 transition-colors hover:bg-slate-50/80">
                        <div class="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <strong class="text-sm font-black text-slate-900">${escapeHtml(r.predictionDate)}</strong>
                                <p class="text-xs text-slate-500 mt-0.5">${nums.length} số đã khóa</p>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="rounded-xl border px-3 py-1 text-xs font-black ${statusClass}">${statusText}</span>
                                ${isSettled ? `<span class="text-xs font-bold text-slate-700">KQ: <strong>${number(r.actual)}</strong></span>` : ''}
                            </div>
                        </div>
                        <div class="mt-2 flex flex-wrap gap-1">
                            ${nums.map(n => `<span class="rounded px-1.5 py-0.5 font-mono text-xs font-bold ${isSettled && Number(n) === Number(r.actual) ? 'bg-amber-300 text-amber-950 ring-2 ring-amber-400' : 'bg-slate-100 text-slate-700'}">${number(n)}</span>`).join(' ')}
                        </div>
                    </article>
                `;
            }).join('');
        }
    }

    // ==========================================
    // INITIALIZATION & DATA FETCHING
    // ==========================================
    async function init() {
        setupTabSwitching();

        // Limit Selectors
        const logLimitEl = byId('dualMergeLogLimit');
        if (logLimitEl) {
            logLimitEl.onchange = e => {
                dualMergeLogLimit = e.target.value;
                if (payload?.dualMerge) renderDualMergeLedger(payload.dualMerge.settledLedger);
            };
        }

        try {
            const res = await fetch('/api/daily-advisor');
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Lỗi tải dữ liệu');
            payload = data;

            // Render both views
            renderDualMergeView(payload.dualMerge);
            renderSingleMethodView();
        } catch (error) {
            console.error('Lỗi khi tải dữ liệu daily advisor:', error);
            const errBox = byId('errorBox');
            if (errBox) {
                errBox.textContent = `Không thể tải dữ liệu: ${error.message}`;
                errBox.classList.remove('hidden');
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
