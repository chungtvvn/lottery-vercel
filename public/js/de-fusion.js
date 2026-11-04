/**
 * public/js/de-fusion.js
 * 
 * Logic giao diện Chuyên Trang Đề Tinh Hoa & Khắc Tinh Chẵn Lẻ Đối Lập (Anti-Parity Engine)
 * Quy chuẩn: 
 * - Đơn vị đánh: 1M / số (Đa tầng: VIP X2 cược 2M ăn 168M · Lót X1 cược 1M ăn 84M, hoặc Đánh phẳng 1M ăn 84M)
 * - Sổ cái đối soát hiển thị chi tiết dàn đánh và số loại trừ của từng phương pháp
 * - Lũy kế chỉ tích lũy trong quãng thời gian Live thực chiến niêm phong khóa số.
 */

(function () {
    'use strict';

    let currentReport = null;
    let activeTodayStrat = 'shadow'; // 'shadow' | 'daily' | 'triCore' | 'fusion'
    let currentBenchmarkScope = 'live'; // 'live' | 'all'
    let ledgerLimit = 40;

    // Quản lý trạng thái mở rộng chi tiết dàn số từng ngày
    const expandedLedgerDates = new Set();
    const activeStratInRow = {}; // { [date]: 'shadow' | 'daily' | 'triCore' | 'fusion' }

    const STRAT_CONFIG = {
        shadow: {
            id: 'shadow',
            name: 'Shadow Đề Đa Động Cơ 40s',
            shortName: 'Shadow 40s',
            desc: '20 số Top X2 (2M) + 20 số Bot X1 (1M) · Đơn vị đánh 1M/số'
        },
        triCore: {
            id: 'triCore',
            name: 'Đề Tam Trụ Tri-Core 24s',
            shortName: 'Tri-Core 24s',
            desc: '12 số Top X2 (2M) + 12 số Bot X1 (1M) · Vốn nhẹ nhất, ROI số 1 (+13.8%)'
        },
        fusion: {
            id: 'fusion',
            name: 'Đề Tinh Hoa Hợp Nhất Fusion 36s',
            shortName: 'Fusion 36s',
            desc: '18 số Top X2 (2M) + 18 số Bot X1 (1M) · Tỷ lệ nổ cao nhất Live (+210M)'
        },
        mirofish: {
            id: 'mirofish',
            name: 'Trí Tuệ Bầy Đàn MiroFish 38s',
            shortName: 'MiroFish 38s',
            desc: '7 Tác tử AI Debate: Top 22 X2 + Bot 16 X1 · Quán quân lợi nhuận Live (+439M)'
        },
        daily: {
            id: 'daily',
            name: 'Daily Đề Gộp Chuẩn Hóa',
            shortName: 'Daily Chuẩn',
            desc: 'Dàn VIP cược X2 (2M) + Dàn Lót cược X1 (1M) · Đơn vị đánh 1M/số'
        }
    };

    function byId(id) {
        return document.getElementById(id);
    }

    function numStr(val) {
        return String(val || '').padStart(2, '0');
    }

    function fmtM(valK) {
        if (valK === null || valK === undefined) return '0.0M';
        const m = valK / 1000;
        return (m >= 0 ? '+' : '') + m.toFixed(1) + 'M';
    }

    function fmtDate(isoStr) {
        if (!isoStr) return '--/--/----';
        const parts = String(isoStr).slice(0, 10).split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return isoStr;
    }

    async function init() {
        setupEventListeners();
        await loadData();
    }

    async function loadData(forceRefresh = false) {
        try {
            const betMode = byId('selectBetMode')?.value || 'tiered';
            const params = new URLSearchParams();
            if (forceRefresh) params.set('refresh', '1');
            params.set('betMode', betMode);

            const url = '/api/de-fusion?' + params.toString();
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            const data = await res.json();
            if (!data || !data.success) throw new Error(data?.error || 'Lỗi tải dữ liệu');

            currentReport = data;
            renderHeaderBadges(data);
            renderTodayRecommendation(data);
            renderBenchmarkTable(data.summary);
            renderSettledLedger();
        } catch (err) {
            console.error('[de-fusion] Error loading data:', err);
            alert('Không thể tải dữ liệu Đề Fusion: ' + err.message);
        }
    }

    function setupEventListeners() {
        const btnRefresh = byId('btnRefreshData');
        if (btnRefresh) {
            btnRefresh.onclick = () => {
                btnRefresh.innerHTML = '<i class="bi bi-arrow-clockwise animate-spin"></i> Đang tải...';
                loadData(true).finally(() => {
                    btnRefresh.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Làm Mới Dữ Liệu';
                });
            };
        }

        // Chọn đơn vị đánh (Đa Tầng vs Đánh Phẳng)
        const selectBetMode = byId('selectBetMode');
        if (selectBetMode) {
            selectBetMode.onchange = () => {
                loadData();
            };
        }

        // Scope Switchers: Live vs Toàn Năm (Tham khảo)
        const btnScopeLive = byId('btnScopeLive');
        const btnScopeAll = byId('btnScopeAll');
        if (btnScopeLive && btnScopeAll) {
            btnScopeLive.onclick = () => {
                currentBenchmarkScope = 'live';
                btnScopeLive.className = 'px-3.5 py-2 rounded-xl text-xs font-black transition-all bg-emerald-600 text-white shadow-sm flex items-center gap-1.5';
                btnScopeAll.className = 'px-3.5 py-2 rounded-xl text-xs font-bold transition-all text-slate-600 hover:text-slate-900 hover:bg-white flex items-center gap-1.5';
                if (currentReport) renderBenchmarkTable(currentReport.summary);
            };

            btnScopeAll.onclick = () => {
                currentBenchmarkScope = 'all';
                btnScopeAll.className = 'px-3.5 py-2 rounded-xl text-xs font-black transition-all bg-indigo-600 text-white shadow-sm flex items-center gap-1.5';
                btnScopeLive.className = 'px-3.5 py-2 rounded-xl text-xs font-bold transition-all text-slate-600 hover:text-slate-900 hover:bg-white flex items-center gap-1.5';
                if (currentReport) renderBenchmarkTable(currentReport.summary);
            };
        }

        // Tabs chiến lược hôm nay
        const tabBtns = document.querySelectorAll('.strat-tab-btn');
        tabBtns.forEach(btn => {
            btn.onclick = () => {
                tabBtns.forEach(b => {
                    b.classList.remove('active', 'bg-indigo-600', 'text-white', 'border-indigo-600', 'shadow-sm');
                    b.classList.add('bg-slate-50', 'text-slate-700', 'border-slate-200');
                });
                btn.classList.remove('bg-slate-50', 'text-slate-700', 'border-slate-200');
                btn.classList.add('active', 'bg-indigo-600', 'text-white', 'border-indigo-600', 'shadow-sm');

                activeTodayStrat = btn.getAttribute('data-strat') || 'shadow';
                if (currentReport) renderTodayRecommendation(currentReport);
            };
        });

        // Copy buttons
        const btnCopyFiltered = byId('btnCopyFiltered');
        if (btnCopyFiltered) {
            btnCopyFiltered.onclick = () => copySlip(true);
        }
        const btnCopyOriginal = byId('btnCopyOriginal');
        if (btnCopyOriginal) {
            btnCopyOriginal.onclick = () => copySlip(false);
        }

        // Ledger controls
        const selStrat = byId('selectLedgerStrat');
        if (selStrat) selStrat.onchange = () => renderSettledLedger();

        const selFilter = byId('selectLedgerFilter');
        if (selFilter) selFilter.onchange = () => renderSettledLedger();

        const inpSearch = byId('inputLedgerSearch');
        if (inpSearch) inpSearch.oninput = () => renderSettledLedger();

        const btnLoadMore = byId('btnLoadMoreLedger');
        if (btnLoadMore) {
            btnLoadMore.onclick = () => {
                ledgerLimit += 30;
                renderSettledLedger();
            };
        }

        // Nút mở rộng tất cả chi tiết dàn số
        const btnToggleAll = byId('btnToggleAllLedgerDetail');
        if (btnToggleAll) {
            btnToggleAll.onclick = () => {
                if (!currentReport || !currentReport.settledLedger) return;
                const visibleDates = getFilteredLedgerRows().slice(0, ledgerLimit).map(r => r.date);
                const isAllExpanded = visibleDates.length > 0 && visibleDates.every(d => expandedLedgerDates.has(d));

                if (isAllExpanded) {
                    expandedLedgerDates.clear();
                } else {
                    visibleDates.forEach(d => expandedLedgerDates.add(d));
                }
                updateToggleAllButtonUI();
                renderSettledLedger();
            };
        }

        // Event delegation trên Sổ Cái Đối Soát (Xem chi tiết dàn, đổi tab phương pháp con, copy vé ngày)
        const tbody = byId('settledLedgerTbody');
        if (tbody) {
            tbody.addEventListener('click', (e) => {
                // 1. Nút mở/đóng chi tiết 1 hàng
                const btnToggle = e.target.closest('.btn-toggle-row-detail');
                if (btnToggle) {
                    const date = btnToggle.dataset.date;
                    if (date) {
                        if (expandedLedgerDates.has(date)) expandedLedgerDates.delete(date);
                        else expandedLedgerDates.add(date);
                        updateToggleAllButtonUI();
                        renderSettledLedger();
                    }
                    return;
                }

                // 2. Nút chuyển đổi tab phương pháp bên trong hàng chi tiết
                const btnSubStrat = e.target.closest('.btn-sub-strat-tab');
                if (btnSubStrat) {
                    const date = btnSubStrat.dataset.date;
                    const strat = btnSubStrat.dataset.strat;
                    if (date && strat) {
                        activeStratInRow[date] = strat;
                        renderSettledLedger();
                    }
                    return;
                }

                // 3. Nút copy dàn đánh thực chiến của ngày đó
                const btnCopyDay = e.target.closest('.btn-copy-day-slip');
                if (btnCopyDay) {
                    const date = btnCopyDay.dataset.date;
                    const strat = btnCopyDay.dataset.strat;
                    copyDaySlip(date, strat, btnCopyDay);
                    return;
                }
            });
        }
    }

    function updateToggleAllButtonUI() {
        const textSpan = byId('textToggleAllLedger');
        const icon = byId('iconToggleAllLedger');
        if (!textSpan || !currentReport || !currentReport.settledLedger) return;

        const visibleDates = getFilteredLedgerRows().slice(0, ledgerLimit).map(r => r.date);
        const isAllExpanded = visibleDates.length > 0 && visibleDates.every(d => expandedLedgerDates.has(d));

        textSpan.textContent = isAllExpanded ? 'Thu gọn chi tiết' : 'Mở rộng chi tiết dàn số';
        if (icon) {
            icon.className = isAllExpanded ? 'bi bi-arrows-collapse' : 'bi bi-arrows-expand';
        }
    }

    function renderHeaderBadges(data) {
        if (byId('badgeTargetDate')) byId('badgeTargetDate').textContent = fmtDate(data.pendingPredictionDate);
        if (byId('badgeDataThrough')) byId('badgeDataThrough').textContent = fmtDate(data.latestDataDate);
        if (byId('todayTargetDateText')) byId('todayTargetDateText').textContent = fmtDate(data.pendingPredictionDate);

        if (byId('btnScopeLiveDays')) byId('btnScopeLiveDays').textContent = data.totalLiveDays || 49;
        if (byId('btnScopeAllDays')) byId('btnScopeAllDays').textContent = data.totalEvaluatedDays || 303;

        if (data.todayParity) {
            if (byId('todayPredFormVi')) byId('todayPredFormVi').textContent = `${data.todayParity.predFormVi} (${data.todayParity.predForm})`;
            if (byId('todayOppFormVi')) byId('todayOppFormVi').textContent = `${data.todayParity.oppFormVi} (${data.todayParity.oppForm})`;
        }
    }

    function renderTodayRecommendation(data) {
        const todayRec = data.todayRecommendation;
        if (!todayRec) return;

        const stratData = todayRec[activeTodayStrat];
        if (!stratData) return;

        const econ = data.economicUnits || {};
        const isFlat = econ.betMode === 'flat';
        const unitX2Text = isFlat ? 'Cược 1M/số · Ăn 84M' : 'Cược 2M/số · Ăn 168M';
        const unitX1Text = 'Cược 1M/số · Ăn 84M';

        // Economics
        if (byId('activeOrigCount')) byId('activeOrigCount').textContent = `${stratData.origCount} số`;
        if (byId('activeOrigStake')) byId('activeOrigStake').textContent = `(${fmtM(stratData.origStakeK).replace('+', '')})`;

        if (byId('activeFilteredCount')) byId('activeFilteredCount').textContent = `${stratData.filteredCount} số`;
        if (byId('activeFilteredStake')) byId('activeFilteredStake').textContent = `(${fmtM(stratData.filteredStakeK).replace('+', '')})`;

        if (byId('activeSavedStake')) byId('activeSavedStake').textContent = `+${(stratData.savedStakeK / 1000).toFixed(1)}M`;
        if (byId('activeSavedPct')) byId('activeSavedPct').textContent = `(-${stratData.savedPct}%)`;

        if (byId('badgeCountX2')) byId('badgeCountX2').textContent = `${stratData.filteredTop.length} số`;
        if (byId('badgeCountX1')) byId('badgeCountX1').textContent = `${stratData.filteredBot.length} số`;
        if (byId('badgeCountRemoved')) byId('badgeCountRemoved').textContent = `${stratData.removedNumbers.length} số`;

        // Render Chips Top X2
        const cX2 = byId('containerActiveTopX2');
        if (cX2) {
            if (stratData.filteredTop.length === 0) {
                cX2.innerHTML = '<span class="text-xs text-slate-400 italic">Không có số nào</span>';
            } else {
                cX2.innerHTML = stratData.filteredTop.map((n, i) => `
                    <span class="badge-num inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 font-mono text-xs font-black text-amber-950 shadow-2xs cursor-pointer hover:bg-amber-200" title="#${i + 1}: ${n} (X2 · ${unitX2Text})">
                        ${n}
                    </span>
                `).join('');
            }
        }

        // Render Chips Bot X1
        const cX1 = byId('containerActiveBotX1');
        if (cX1) {
            if (stratData.filteredBot.length === 0) {
                cX1.innerHTML = '<span class="text-xs text-slate-400 italic">Không có số nào</span>';
            } else {
                cX1.innerHTML = stratData.filteredBot.map((n, i) => `
                    <span class="badge-num inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 font-mono text-xs font-bold text-indigo-900 shadow-2xs cursor-pointer hover:bg-indigo-100" title="#${i + 1}: ${n} (X1 · ${unitX1Text})">
                        ${n}
                    </span>
                `).join('');
            }
        }

        // Render Chips Removed
        const cRem = byId('containerActiveRemoved');
        if (cRem) {
            if (stratData.removedNumbers.length === 0) {
                cRem.innerHTML = '<span class="text-xs text-slate-400 italic">Không có số nào bị loại</span>';
            } else {
                cRem.innerHTML = stratData.removedNumbers.map(n => `
                    <span class="badge-num inline-flex items-center justify-center w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 font-mono text-xs font-bold text-rose-600 line-through opacity-80 cursor-not-allowed" title="Số ${n} bị loại trừ do rơi vào cực đối lập chẵn lẻ">
                        ${n}
                    </span>
                `).join('');
            }
        }
    }

    function copySlip(isFiltered = true) {
        if (!currentReport || !currentReport.todayRecommendation) return;
        const targetDate = currentReport.pendingPredictionDate;
        const strat = currentReport.todayRecommendation[activeTodayStrat];
        const parity = currentReport.todayParity;
        const stratCfg = STRAT_CONFIG[activeTodayStrat] || {};
        const isFlat = currentReport?.economicUnits?.betMode === 'flat';
        const unitX2Label = isFlat ? 'Cược 1M/số · Ăn 84M' : 'Cược 2M/số · Ăn 168M';

        let text = '';
        if (isFiltered) {
            text = `🎯 VÉ CƯỢC ĐỀ SAU LỌC ANTI-PARITY (Kỳ ${fmtDate(targetDate)})\n`;
            text += `⭐ Chiến lược: ${stratCfg.name}\n`;
            if (parity) {
                text += `🔮 Dự đoán: ${parity.predFormVi} (${parity.predForm}) · Loại trừ cực đối lập: ${parity.oppFormVi} (${parity.oppForm})\n`;
            }
            text += `\n👑 1. TẦNG VIP X2 (${unitX2Label}) - ${strat.filteredTop.length} số:\n`;
            text += strat.filteredTop.join(', ') + '\n';
            text += `\n🛡️ 2. TẦNG LÓT X1 (Cược 1M/số · Ăn 84M) - ${strat.filteredBot.length} số:\n`;
            text += strat.filteredBot.join(', ') + '\n';
            text += `\n💰 Tổng vốn sau lọc: ${(strat.filteredStakeK / 1000).toFixed(1)}M (Đã tiết kiệm +${(strat.savedStakeK / 1000).toFixed(1)}M, -${strat.savedPct}%)\n`;
            text += `❌ Đã loại trừ ${strat.removedNumbers.length} số: ${strat.removedNumbers.join(', ')}`;
        } else {
            text = `🎯 VÉ CƯỢC ĐỀ GỐC CHƯA LỌC (Kỳ ${fmtDate(targetDate)})\n`;
            text += `⭐ Chiến lược: ${stratCfg.name}\n`;
            text += `\n👑 1. TẦNG VIP X2 (${unitX2Label}) - ${strat.origTop.length} số:\n`;
            text += strat.origTop.join(', ') + '\n';
            text += `\n🛡️ 2. TẦNG LÓT X1 (Cược 1M/số · Ăn 84M) - ${strat.origBot.length} số:\n`;
            text += strat.origBot.join(', ') + '\n';
            text += `\n💰 Tổng vốn gốc: ${(strat.origStakeK / 1000).toFixed(1)}M (${strat.origCount} số)`;
        }

        navigator.clipboard.writeText(text).then(() => {
            const toast = byId('copyToast');
            if (toast) {
                toast.classList.remove('hidden');
                toast.classList.add('inline-flex');
                setTimeout(() => {
                    toast.classList.add('hidden');
                    toast.classList.remove('inline-flex');
                }, 3000);
            }
        });
    }

    function copyDaySlip(date, stratId, btnElement) {
        if (!currentReport || !currentReport.settledLedger) return;
        const row = currentReport.settledLedger.find(r => r.date === date);
        if (!row || !row.strategies?.[stratId]) return;

        const strat = row.strategies[stratId];
        const p = row.parityPrediction || {};
        const stratCfg = STRAT_CONFIG[stratId] || { name: stratId };
        const isFlat = currentReport?.economicUnits?.betMode === 'flat';
        const unitX2Label = isFlat ? 'Cược 1M/số · Ăn 84M' : 'Cược 2M/số · Ăn 168M';

        let text = `🎯 DÀN ĐỀ THỰC CHIẾN SAU LỌC ANTI-PARITY (Kỳ ${fmtDate(date)})\n`;
        text += `⭐ Phương pháp: ${stratCfg.name}\n`;
        text += `🔮 Dự đoán: ${p.predFormVi || '--'} (${p.predForm || '--'}) ➔ Loại trừ: ${p.oppFormVi || '--'} (${p.oppForm || '--'})\n`;
        text += `\n👑 1. TẦNG VIP X2 (${unitX2Label}) - ${strat.filteredTop.length} số:\n`;
        text += strat.filteredTop.join(', ') + '\n';
        text += `\n🛡️ 2. TẦNG LÓT X1 (Cược 1M/số · Ăn 84M) - ${strat.filteredBot.length} số:\n`;
        text += strat.filteredBot.join(', ') + '\n';
        text += `\n💰 Vốn cược: ${(strat.filteredStakeK / 1000).toFixed(1)}M · Tiết kiệm: +${(strat.savedStakeK / 1000).toFixed(1)}M\n`;
        text += `❌ Số bị loại (${strat.removedNumbers.length} số): ${strat.removedNumbers.join(', ')}\n`;
        if (row.actualSpecial) {
            text += `🏁 Kết quả: ĐB về ${row.actualSpecial} ➔ ${strat.isFilteredHit ? (strat.fHitX2 ? 'NỔ X2 👑' : 'NỔ X1 ⭐') : (strat.isEliminatedLoss ? 'BỊ LOẠI NHẦM ❌' : 'Trượt')}`;
        }

        navigator.clipboard.writeText(text).then(() => {
            if (btnElement) {
                const origHtml = btnElement.innerHTML;
                btnElement.innerHTML = '<i class="bi bi-check2"></i> Đã Copy!';
                btnElement.classList.add('bg-emerald-600', 'text-white');
                setTimeout(() => {
                    btnElement.innerHTML = origHtml;
                    btnElement.classList.remove('bg-emerald-600', 'text-white');
                }, 2000);
            }
        });
    }

    function renderBenchmarkTable(summary) {
        const tbody = byId('benchmarkTableTbody');
        if (!tbody || !summary) return;

        const isLiveScope = currentBenchmarkScope === 'live';
        const subTitle = byId('benchmarkSubtitle');
        if (subTitle) {
            if (isLiveScope) {
                subTitle.innerHTML = 'Phần đối soát lịch sử <strong class="text-emerald-700 font-bold">chỉ tính quãng thời gian Live thực chiến để tính lũy kế</strong>, dữ liệu còn lại dùng để tham khảo.';
            } else {
                subTitle.innerHTML = 'Dữ liệu đối soát <strong class="text-indigo-700 font-bold">toàn năm 2026 (Backtest đầy đủ)</strong> dùng để nghiên cứu tham khảo bước sóng dài hạn.';
            }
        }

        const order = ['mirofish', 'fusion', 'triCore', 'shadow', 'daily'];
        const formatStrategyName = (sId) => {
            const cfg = STRAT_CONFIG[sId] || {};
            if (sId === 'mirofish') {
                return `
                    <div class="flex items-center gap-1.5">
                        <strong class="text-slate-900 font-bold">${cfg.name}</strong>
                        <span class="px-1.5 py-0.2 rounded bg-cyan-100 text-cyan-800 font-black text-[9px] border border-cyan-300">TOP 1 LÃI LIVE 🏆</span>
                    </div>
                    <div class="text-[10px] text-slate-500">${cfg.desc}</div>
                `;
            }
            if (sId === 'triCore') {
                return `
                    <div class="flex items-center gap-1.5">
                        <strong class="text-slate-900 font-bold">${cfg.name}</strong>
                        <span class="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-black text-[9px] border border-emerald-300">TOP 1 ROI ⭐</span>
                    </div>
                    <div class="text-[10px] text-slate-500">${cfg.desc}</div>
                `;
            }
            if (sId === 'fusion') {
                return `
                    <div class="flex items-center gap-1.5">
                        <strong class="text-slate-900 font-bold">${cfg.name}</strong>
                        <span class="px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 font-black text-[9px] border border-purple-300">TOP NỔ CAO NHẤT 👑</span>
                    </div>
                    <div class="text-[10px] text-slate-500">${cfg.desc}</div>
                `;
            }
            if (sId === 'shadow') {
                return `
                    <div class="flex items-center gap-1.5">
                        <strong class="text-slate-900 font-bold">${cfg.name}</strong>
                        <span class="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-black text-[9px] border border-amber-300">CHUẨN ĐỒNG THUẬN 🛡️</span>
                    </div>
                    <div class="text-[10px] text-slate-500">${cfg.desc}</div>
                `;
            }
            return `
                <div class="font-bold text-slate-900">${cfg.name}</div>
                <div class="text-[10px] text-slate-500">${cfg.desc}</div>
            `;
        };

        const formatFormat = (sId) => {
            if (sId === 'mirofish') return '<span class="font-mono">22s X2 + 16s X1 (38s)</span>';
            if (sId === 'shadow') return '<span class="font-mono">20s X2 + 20s X1 (40s)</span>';
            if (sId === 'triCore') return '<span class="font-mono">12s X2 + 12s X1 (24s)</span>';
            if (sId === 'fusion') return '<span class="font-mono">18s X2 + 18s X1 (36s)</span>';
            if (sId === 'daily') return '<span class="font-mono">VIP X2 + Lót X1 (~34-43s)</span>';
            return '--';
        };

        tbody.innerHTML = order.map(sId => {
            const item = summary[sId];
            if (!item) return '';

            // Chọn data theo scope: Live vs Full2026
            const scopeData = isLiveScope ? (item.live || item) : (item.full2026 || item);
            const b = scopeData.base || {};
            const f = scopeData.filtered || {};
            const totalDays = scopeData.totalDays || item.totalDays;

            const bProfitClass = b.netProfitM >= 0 ? 'text-emerald-700 font-bold' : 'text-slate-600';
            const fProfitClass = f.netProfitM >= 0 ? 'text-emerald-700 font-black text-sm' : (f.netProfitM > b.netProfitM ? 'text-indigo-700 font-bold' : 'text-rose-600 font-bold');

            return `
                <tr class="hover:bg-slate-50/80 transition-colors">
                    <td class="py-3 px-3">${formatStrategyName(sId)}</td>
                    <td class="py-3 px-3 text-center text-slate-600">${formatFormat(sId)}</td>
                    <td class="py-3 px-3 text-center bg-slate-50/50 border-x border-slate-200">
                        <span class="font-bold text-slate-800">${b.wins}/${totalDays}</span>
                        <span class="text-slate-500 text-[10px]">(${b.winRate}%)</span>
                    </td>
                    <td class="py-3 px-3 text-center bg-slate-50/50 border-r border-slate-200">
                        <div class="${bProfitClass}">${b.netProfitM >= 0 ? '+' : ''}${b.netProfitM}M</div>
                        <div class="text-[10px] text-slate-400">ROI: ${b.roi}%</div>
                    </td>
                    <td class="py-3 px-3 text-center bg-emerald-50/30 border-r border-emerald-100">
                        <span class="font-black text-emerald-950">${f.wins}/${totalDays}</span>
                        <span class="text-emerald-700 text-[10px] font-bold">(${f.winRate}%)</span>
                    </td>
                    <td class="py-3 px-3 text-center bg-emerald-50/30 border-r border-emerald-100">
                        <div class="font-bold text-emerald-800">+${f.savedStakeM}M</div>
                        <div class="text-[10px] text-emerald-600 font-bold">(-${f.savedPct}% vốn)</div>
                    </td>
                    <td class="py-3 px-3 text-center bg-emerald-50/30">
                        <div class="${fProfitClass}">${f.netProfitM >= 0 ? '+' : ''}${f.netProfitM}M</div>
                        <div class="text-[10px] ${f.roi >= 0 ? 'text-emerald-700 font-bold' : 'text-slate-500'}">ROI: ${f.roi >= 0 ? '+' : ''}${f.roi}%</div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function getFilteredLedgerRows() {
        if (!currentReport || !currentReport.settledLedger) return [];
        const selStrat = byId('selectLedgerStrat')?.value || 'shadow';
        const selFilter = byId('selectLedgerFilter')?.value || 'liveOnly';
        const search = (byId('inputLedgerSearch')?.value || '').trim().toLowerCase();

        return currentReport.settledLedger.filter(r => {
            const stratRes = r.strategies?.[selStrat];
            if (!stratRes) return false;

            // Search filter
            if (search) {
                const matchDate = r.date.includes(search);
                const matchSpecial = r.actualSpecial.includes(search);
                if (!matchDate && !matchSpecial) return false;
            }

            // Outcome / Scope filter
            if (selFilter === 'liveOnly') return r.isLive;
            if (selFilter === 'hitFiltered') return stratRes.isFilteredHit;
            if (selFilter === 'eliminated') return stratRes.isEliminatedLoss;
            if (selFilter === 'missBoth') return !stratRes.isBaseHit && !stratRes.isFilteredHit;

            return true;
        });
    }

    function renderSettledLedger() {
        const tbody = byId('settledLedgerTbody');
        if (!tbody || !currentReport || !currentReport.settledLedger) return;

        const selStrat = byId('selectLedgerStrat')?.value || 'shadow';
        const selFilter = byId('selectLedgerFilter')?.value || 'liveOnly';

        const allRows = currentReport.settledLedger;
        const filteredRows = getFilteredLedgerRows();
        const displayRows = filteredRows.slice(0, ledgerLimit);

        if (byId('ledgerCountInfo')) {
            const liveTotal = allRows.filter(r => r.isLive).length;
            if (selFilter === 'liveOnly') {
                byId('ledgerCountInfo').innerHTML = `Hiển thị <strong>${displayRows.length}</strong> / <strong>${filteredRows.length}</strong> kỳ Live thực chiến (Tính lũy kế)`;
            } else {
                byId('ledgerCountInfo').innerHTML = `Hiển thị <strong>${displayRows.length}</strong> / <strong>${filteredRows.length}</strong> kỳ (Gồm ${liveTotal} kỳ Live thực chiến + ${allRows.length - liveTotal} kỳ tham khảo)`;
            }
        }

        if (displayRows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="py-6 text-center text-slate-400 italic font-sans">Không tìm thấy bản ghi đối soát phù hợp</td></tr>';
            return;
        }

        const betMode = currentReport?.economicUnits?.betMode || 'tiered';
        const isFlat = betMode === 'flat';

        let html = '';
        displayRows.forEach(r => {
            const s = r.strategies[selStrat];
            const p = r.parityPrediction || {};
            const actStr = r.actualSpecial;
            const isRowExp = expandedLedgerDates.has(r.date);

            // Badge Chế Độ
            const modeBadge = r.isLive
                ? '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap"><span class="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span> LIVE</span>'
                : '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-500 whitespace-nowrap">Tham khảo</span>';

            // Form hit status
            const formHitBadge = p.isFormHit
                ? '<span class="text-emerald-600 font-bold text-[10px] ml-1"><i class="bi bi-check-circle-fill"></i> Trúng Dạng</span>'
                : '<span class="text-slate-400 text-[10px] ml-1">Lệch Dạng</span>';

            // Anti Avoided status
            const antiBadge = p.isAntiAvoided
                ? '<span class="text-emerald-700 font-bold text-[10px] block"><i class="bi bi-shield-check"></i> Né cực thành công</span>'
                : '<span class="text-rose-600 font-black text-[10px] block"><i class="bi bi-exclamation-triangle-fill"></i> Về đúng cực đối lập!</span>';

            // Base Hit Badge
            let baseBadge = '<span class="text-slate-400">Trượt</span>';
            if (s.baseHitX2) baseBadge = '<span class="text-amber-700 font-black px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300">TRÚNG X2</span>';
            else if (s.baseHitX1) baseBadge = '<span class="text-indigo-700 font-black px-1.5 py-0.5 rounded bg-indigo-100 border border-indigo-200">TRÚNG X1</span>';

            // Filtered Hit Badge
            let fBadge = '<span class="text-slate-400">Trượt</span>';
            if (s.fHitX2) fBadge = '<span class="text-amber-800 font-black px-2 py-0.5 rounded bg-amber-200 border border-amber-400 shadow-2xs">NỔ X2 👑</span>';
            else if (s.fHitX1) fBadge = '<span class="text-emerald-800 font-black px-2 py-0.5 rounded bg-emerald-200 border border-emerald-400 shadow-2xs">NỔ X1 ⭐</span>';
            else if (s.isEliminatedLoss) fBadge = '<span class="text-rose-700 font-black px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300" title="Gốc trúng nhưng bị loại do rơi vào cực đối lập">BỊ LOẠI NHẦM ❌</span>';

            // Daily Profit
            const pnlK = s.filteredProfitK;
            const pnlClass = pnlK > 0 ? 'text-emerald-700 font-black' : (pnlK === 0 ? 'text-slate-600' : 'text-slate-500');

            // Cumulative Live Profit Column
            let accumCell = '<td class="py-2.5 px-3 text-right font-sans text-slate-400 text-[10px] italic whitespace-nowrap bg-slate-50/50">-- (Tham khảo)</td>';
            if (s.liveAccumProfitK !== null) {
                const accumK = s.liveAccumProfitK;
                const accumClass = accumK > 0 ? 'text-emerald-800 font-black' : (accumK === 0 ? 'text-slate-700 font-bold' : 'text-rose-600 font-black');
                accumCell = `<td class="py-2.5 px-3 text-right font-mono text-xs ${accumClass} whitespace-nowrap bg-emerald-50/40">${fmtM(accumK)}</td>`;
            }

            // DÒNG TỔNG QUAN CHÍNH
            html += `
                <tr class="hover:bg-slate-50 transition-colors ${r.isLive ? 'bg-white' : 'bg-slate-50/40'} ${isRowExp ? 'bg-indigo-50/30' : ''}">
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-800 whitespace-nowrap">${fmtDate(r.date)}</td>
                    <td class="py-2.5 px-3 text-center">${modeBadge}</td>
                    <td class="py-2.5 px-3 text-center">
                        <span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-900 text-white font-mono font-black text-xs shadow-xs">
                            ${actStr}
                        </span>
                        <div class="text-[10px] text-slate-500 mt-0.5">${r.actualFormVi}</div>
                    </td>
                    <td class="py-2.5 px-3 font-sans">
                        <span class="font-bold text-slate-800">${p.predFormVi || '--'}</span>
                        ${formHitBadge}
                    </td>
                    <td class="py-2.5 px-3 font-sans">
                        <span class="text-rose-600 font-bold">${p.oppFormVi || '--'}</span>
                        ${antiBadge}
                    </td>
                    <td class="py-2.5 px-3 text-center font-sans">
                        <div>${baseBadge}</div>
                        <div class="text-[10px] text-slate-400 font-mono mt-0.5">${s.origCount}s · ${fmtM(s.origStakeK).replace('+', '')}</div>
                    </td>
                    <td class="py-2.5 px-3 text-center font-sans bg-emerald-50/20">
                        <div>${fBadge}</div>
                        <div class="text-[10px] text-indigo-700 font-mono font-bold mt-0.5">${s.filteredCount}s · ${fmtM(s.filteredStakeK).replace('+', '')}</div>
                    </td>
                    <td class="py-2.5 px-3 text-center font-mono text-emerald-800 font-bold">
                        +${(s.savedStakeK / 1000).toFixed(1)}M
                        <div class="text-[10px] text-emerald-600 font-sans">(-${s.savedPct}%)</div>
                    </td>
                    <td class="py-2.5 px-3 text-right font-mono ${pnlClass} whitespace-nowrap">
                        ${fmtM(pnlK)}
                    </td>
                    ${accumCell}
                    <td class="py-2.5 px-3 text-center whitespace-nowrap">
                        <button type="button" class="btn-toggle-row-detail inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs ${isRowExp ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200'}" data-date="${r.date}">
                            <span>${isRowExp ? 'Thu gọn' : 'Chi tiết'}</span>
                            <i class="bi bi-chevron-${isRowExp ? 'up' : 'down'} text-[10px]"></i>
                        </button>
                    </td>
                </tr>
            `;

            // DÒNG CHI TIẾT MỞ RỘNG (DÀN ĐÁNH & SỐ LOẠI TRỪ CỦA TỪNG PHƯƠNG PHÁP)
            if (isRowExp) {
                const activeStratId = activeStratInRow[r.date] || selStrat;
                const sAct = r.strategies[activeStratId] || s;
                const unitX2Label = isFlat ? 'Cược 1M/số · Ăn 84M' : 'Cược 2M/số · Ăn 168M';

                html += `
                    <tr id="detailRow-${r.date}" class="bg-slate-50/95 border-b-2 border-indigo-200 transition-all font-sans">
                        <td colspan="11" class="p-4 sm:p-6">
                            <!-- THANH CHUYỂN TAB 5 PHƯƠNG PHÁP -->
                            <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                                <div class="flex items-center gap-1.5 flex-wrap">
                                    <span class="text-xs font-bold text-slate-500 uppercase tracking-wide mr-1">
                                        <i class="bi bi-layers-fill text-indigo-600"></i> Xem Chi Tiết Phương Pháp:
                                    </span>
                                    ${['mirofish', 'fusion', 'triCore', 'shadow', 'daily'].map(stId => {
                                        const stRes = r.strategies[stId];
                                        if (!stRes) return '';
                                        const isCur = stId === activeStratId;
                                        let hitBadge = '<span class="text-[9px] text-slate-400">Trượt</span>';
                                        if (stRes.fHitX2) hitBadge = '<span class="text-[9px] text-amber-700 font-black">Nổ X2 👑</span>';
                                        else if (stRes.fHitX1) hitBadge = '<span class="text-[9px] text-emerald-700 font-black">Nổ X1 ⭐</span>';
                                        else if (stRes.isEliminatedLoss) hitBadge = '<span class="text-[9px] text-rose-600 font-bold">Bị Loại ❌</span>';

                                        return `
                                            <button type="button" class="btn-sub-strat-tab px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs ${isCur ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'}" data-date="${r.date}" data-strat="${stId}">
                                                <span>${STRAT_CONFIG[stId].shortName}</span>
                                                <span class="font-mono text-[10px] opacity-80">(${stRes.filteredCount}s)</span>
                                                <span class="ml-0.5">${hitBadge}</span>
                                            </button>
                                        `;
                                    }).join('')}
                                </div>
                                <div class="text-xs font-mono text-slate-600 flex items-center gap-3">
                                    <span>Vốn sau lọc: <strong class="text-slate-900">${fmtM(sAct.filteredStakeK).replace('+', '')}</strong></span>
                                    <span>·</span>
                                    <span>Lợi nhuận ngày: <strong class="${sAct.filteredProfitK >= 0 ? 'text-emerald-700 font-black' : 'text-slate-600 font-bold'}">${fmtM(sAct.filteredProfitK)}</strong></span>
                                </div>
                            </div>

                            <!-- 2 CỘT CHI TIẾT: DÀN ĐÁNH THỰC CHIẾN VS SỐ LOẠI TRỪ -->
                            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 items-start">
                                <!-- CỘT 1: DÀN ĐÁNH THỰC CHIẾN SAU LỌC -->
                                <div class="rounded-2xl border border-emerald-200 bg-white p-4 space-y-3.5 shadow-2xs">
                                    <div class="flex items-center justify-between border-b border-emerald-100 pb-2.5">
                                        <div class="flex items-center gap-2">
                                            <span class="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs">🎯</span>
                                            <span class="text-xs font-black text-emerald-950 uppercase tracking-wide">
                                                Dàn Đánh Thực Chiến Sau Lọc (${sAct.filteredCount} số)
                                            </span>
                                        </div>
                                        <button type="button" class="btn-copy-day-slip px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[11px] transition cursor-pointer flex items-center gap-1 shadow-2xs" data-date="${r.date}" data-strat="${activeStratId}">
                                            <i class="bi bi-clipboard"></i> Copy Dàn Đánh
                                        </button>
                                    </div>

                                    <!-- Chi tiết số Tầng VIP X2 -->
                                    <div class="space-y-1.5">
                                        <div class="flex items-center justify-between text-[11px] font-bold text-amber-900">
                                            <span>👑 Tầng VIP X2 (${sAct.filteredTop.length} số · ${unitX2Label}):</span>
                                            <span class="text-[10px] text-amber-700 font-mono">${isFlat ? 'Ăn 84M' : 'Ăn 168M'}</span>
                                        </div>
                                        <div class="flex flex-wrap gap-1 p-2 rounded-xl bg-amber-50/60 border border-amber-200/80 min-h-[38px] items-center">
                                            ${sAct.filteredTop.length === 0 ? '<span class="text-slate-400 italic text-[11px]">Không có số</span>' : sAct.filteredTop.map(n => {
                                                const isWinner = n === actStr;
                                                return `
                                                    <span class="inline-flex items-center justify-center px-1.5 py-0.5 rounded font-mono text-xs font-black shadow-2xs transition-transform ${isWinner ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-600 animate-bounce' : 'bg-white text-slate-900 border border-amber-300'}" title="${isWinner ? '👑 SỐ TRÚNG ĐẶC BIỆT X2: ' + n : 'VIP X2: ' + n}">
                                                        ${n}${isWinner ? ' 👑' : ''}
                                                    </span>
                                                `;
                                            }).join('')}
                                        </div>
                                    </div>

                                    <!-- Chi tiết số Tầng Lót X1 -->
                                    <div class="space-y-1.5">
                                        <div class="flex items-center justify-between text-[11px] font-bold text-indigo-900">
                                            <span>🛡️ Tầng Lót X1 (${sAct.filteredBot.length} số · Cược 1M/số):</span>
                                            <span class="text-[10px] text-indigo-700 font-mono">Ăn 84M</span>
                                        </div>
                                        <div class="flex flex-wrap gap-1 p-2 rounded-xl bg-indigo-50/50 border border-indigo-200/80 min-h-[38px] items-center">
                                            ${sAct.filteredBot.length === 0 ? '<span class="text-slate-400 italic text-[11px]">Không có số</span>' : sAct.filteredBot.map(n => {
                                                const isWinner = n === actStr;
                                                return `
                                                    <span class="inline-flex items-center justify-center px-1.5 py-0.5 rounded font-mono text-xs font-semibold shadow-2xs ${isWinner ? 'bg-emerald-400 text-slate-950 ring-2 ring-emerald-600 font-black animate-bounce' : 'bg-white text-indigo-950 border border-indigo-200'}" title="${isWinner ? '⭐ SỐ TRÚNG ĐẶC BIỆT X1: ' + n : 'Lót X1: ' + n}">
                                                        ${n}${isWinner ? ' ⭐' : ''}
                                                    </span>
                                                `;
                                            }).join('')}
                                        </div>
                                    </div>
                                </div>

                                <!-- CỘT 2: CÁC SỐ BỊ LOẠI TRỪ THEO CỰC NGHỊCH -->
                                <div class="rounded-2xl border border-rose-200 bg-white p-4 space-y-3.5 shadow-2xs flex flex-col justify-between">
                                    <div>
                                        <div class="flex items-center justify-between border-b border-rose-100 pb-2.5">
                                            <div class="flex items-center gap-2">
                                                <span class="w-6 h-6 rounded-lg bg-rose-600 text-white flex items-center justify-center text-xs">🚫</span>
                                                <span class="text-xs font-black text-rose-950 uppercase tracking-wide">
                                                    Số Bị Loại Trừ Cực Nghịch (${sAct.removedCount} số)
                                                </span>
                                            </div>
                                            <span class="text-emerald-700 font-mono font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                                Tiết kiệm +${(sAct.savedStakeK / 1000).toFixed(1)}M (-${sAct.savedPct}%)
                                            </span>
                                        </div>

                                        <!-- Lý do loại trừ & Cảnh báo -->
                                        <div class="mt-2.5 p-2 rounded-xl text-xs ${sAct.isEliminatedLoss ? 'bg-rose-100 text-rose-900 border border-rose-300' : 'bg-slate-100 text-slate-700 border border-slate-200'}">
                                            <div class="flex items-center justify-between">
                                                <span>Đoán: <strong>${p.predFormVi || '--'} (${p.predForm || '--'})</strong></span>
                                                <span>➔ Loại toàn bộ: <strong class="text-rose-700">${p.oppFormVi || '--'} (${p.oppForm || '--'})</strong></span>
                                            </div>
                                            <div class="mt-1 font-bold ${sAct.isEliminatedLoss ? 'text-rose-800' : 'text-emerald-700'}">
                                                ${sAct.isEliminatedLoss 
                                                    ? `<i class="bi bi-exclamation-triangle-fill"></i> BỊ LOẠI NHẦM! Số ĐB về <strong>${actStr}</strong> thuộc dạng ${p.oppForm} nên đã bị cắt bỏ khỏi dàn gốc.` 
                                                    : `<i class="bi bi-shield-check"></i> Né cực thành công! Không bị loại nhầm số trúng.`}
                                            </div>
                                        </div>

                                        <!-- Danh sách các số bị loại trừ -->
                                        <div class="mt-2.5 space-y-1.5">
                                            <span class="text-[11px] font-bold text-slate-500">Danh sách ${sAct.removedCount} số bị loại bỏ:</span>
                                            <div class="flex flex-wrap gap-1 p-2 rounded-xl bg-rose-50/40 border border-rose-100 min-h-[38px] items-center">
                                                ${sAct.removedNumbers.length === 0 ? '<span class="text-slate-400 italic text-[11px]">Không có số nào bị loại</span>' : sAct.removedNumbers.map(n => {
                                                    const isAccidental = n === actStr;
                                                    return `
                                                        <span class="inline-flex items-center justify-center px-1.5 py-0.5 rounded font-mono text-xs line-through ${isAccidental ? 'bg-rose-600 text-white font-black not-line-through ring-2 ring-rose-700' : 'bg-white text-rose-600 border border-rose-200 opacity-80'}" title="${isAccidental ? '❌ BỊ LOẠI NHẦM: ' + n : 'Loại dạng ' + p.oppForm + ': ' + n}">
                                                            ${n}${isAccidental ? ' ❌' : ''}
                                                        </span>
                                                    `;
                                                }).join('')}
                                            </div>
                                        </div>
                                    </div>

                                    <div class="pt-2 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between">
                                        <span>Dàn gốc ban đầu: <strong>${sAct.origCount} số</strong></span>
                                        <span>Sau loại trừ: <strong class="text-indigo-700">${sAct.filteredCount} số</strong></span>
                                    </div>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            }
        });

        tbody.innerHTML = html;
    }

    // Auto-init on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
