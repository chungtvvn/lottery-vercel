/**
 * public/js/de-fusion.js
 * 
 * Logic giao diện Chuyên Trang Đề Tinh Hoa & Khắc Tinh Chẵn Lẻ Đối Lập (Anti-Parity Engine)
 */

(function () {
    'use strict';

    let currentReport = null;
    let activeTodayStrat = 'shadow'; // 'shadow' | 'daily' | 'triCore' | 'fusion'
    let ledgerLimit = 30;

    const STRAT_CONFIG = {
        shadow: {
            id: 'shadow',
            name: 'Shadow Đề Đa Động Cơ 40s',
            shortName: 'Shadow 40s',
            desc: '20 số Top X2 (400K) + 20 số Bot X1 (200K) · Vốn gốc 12.0M/ngày'
        },
        daily: {
            id: 'daily',
            name: 'Daily Đề Gộp Chuẩn Hóa',
            shortName: 'Daily Chuẩn',
            desc: 'Dàn VIP cược X2 (400K) + Dàn Lót cược X1 (200K)'
        },
        triCore: {
            id: 'triCore',
            name: 'Đề Tam Trụ Tri-Core 24s',
            shortName: 'Tri-Core 24s',
            desc: '12 số Top X2 (400K) + 12 số Bot X1 (200K) · Vốn gốc 7.2M/ngày'
        },
        fusion: {
            id: 'fusion',
            name: 'Đề Tinh Hoa Hợp Nhất Fusion 36s',
            shortName: 'Fusion 36s',
            desc: '18 số Top X2 (400K) + 18 số Bot X1 (200K) · Vốn gốc 10.8M/ngày'
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
            const url = '/api/de-fusion' + (forceRefresh ? '?refresh=1' : '');
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
    }

    function renderHeaderBadges(data) {
        if (byId('badgeTargetDate')) byId('badgeTargetDate').textContent = fmtDate(data.pendingPredictionDate);
        if (byId('badgeDataThrough')) byId('badgeDataThrough').textContent = fmtDate(data.latestDataDate);
        if (byId('todayTargetDateText')) byId('todayTargetDateText').textContent = fmtDate(data.pendingPredictionDate);

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
                    <span class="badge-num inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 font-mono text-xs font-black text-amber-950 shadow-2xs cursor-pointer hover:bg-amber-200" title="#${i + 1}: ${n} (X2 · Cược 400K · Ăn 33.6M)">
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
                    <span class="badge-num inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 font-mono text-xs font-bold text-indigo-900 shadow-2xs cursor-pointer hover:bg-indigo-100" title="#${i + 1}: ${n} (X1 · Cược 200K · Ăn 16.8M)">
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

        let text = '';
        if (isFiltered) {
            text = `🎯 VÉ CƯỢC ĐỀ SAU LỌC ANTI-PARITY (Kỳ ${fmtDate(targetDate)})\n`;
            text += `⭐ Chiến lược: ${stratCfg.name}\n`;
            if (parity) {
                text += `🔮 Dự đoán: ${parity.predFormVi} (${parity.predForm}) · Loại trừ cực đối lập: ${parity.oppFormVi} (${parity.oppForm})\n`;
            }
            text += `\n👑 1. TẦNG VIP X2 (Cược 400K/số · Ăn 33.6M) - ${strat.filteredTop.length} số:\n`;
            text += strat.filteredTop.join(', ') + '\n';
            text += `\n🛡️ 2. TẦNG LÓT X1 (Cược 200K/số · Ăn 16.8M) - ${strat.filteredBot.length} số:\n`;
            text += strat.filteredBot.join(', ') + '\n';
            text += `\n💰 Tổng vốn sau lọc: ${(strat.filteredStakeK / 1000).toFixed(1)}M (Đã tiết kiệm +${(strat.savedStakeK / 1000).toFixed(1)}M, -${strat.savedPct}%)\n`;
            text += `❌ Đã loại trừ ${strat.removedNumbers.length} số: ${strat.removedNumbers.join(', ')}`;
        } else {
            text = `🎯 VÉ CƯỢC ĐỀ GỐC CHƯA LỌC (Kỳ ${fmtDate(targetDate)})\n`;
            text += `⭐ Chiến lược: ${stratCfg.name}\n`;
            text += `\n👑 1. TẦNG VIP X2 (Cược 400K/số · Ăn 33.6M) - ${strat.origTop.length} số:\n`;
            text += strat.origTop.join(', ') + '\n';
            text += `\n🛡️ 2. TẦNG LÓT X1 (Cược 200K/số · Ăn 16.8M) - ${strat.origBot.length} số:\n`;
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

    function renderBenchmarkTable(summary) {
        const tbody = byId('benchmarkTableTbody');
        if (!tbody || !summary) return;

        const order = ['shadow', 'triCore', 'daily', 'fusion'];
        const formatStrategyName = (sId) => {
            const cfg = STRAT_CONFIG[sId] || {};
            if (sId === 'triCore') {
                return `
                    <div class="flex items-center gap-1.5">
                        <strong class="text-slate-900 font-bold">${cfg.name}</strong>
                        <span class="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-black text-[9px] border border-emerald-300">TOP ROI ⭐</span>
                    </div>
                    <div class="text-[10px] text-slate-500">${cfg.desc}</div>
                `;
            }
            if (sId === 'shadow') {
                return `
                    <div class="flex items-center gap-1.5">
                        <strong class="text-slate-900 font-bold">${cfg.name}</strong>
                        <span class="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-black text-[9px] border border-amber-300">CHUẨN ĐỒNG THUẬN 👑</span>
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
            if (sId === 'shadow') return '<span class="font-mono">20s X2 + 20s X1 (40s)</span>';
            if (sId === 'triCore') return '<span class="font-mono">12s X2 + 12s X1 (24s)</span>';
            if (sId === 'daily') return '<span class="font-mono">VIP X2 + Lót X1 (~34-43s)</span>';
            if (sId === 'fusion') return '<span class="font-mono">18s X2 + 18s X1 (36s)</span>';
            return '--';
        };

        tbody.innerHTML = order.map(sId => {
            const item = summary[sId];
            if (!item) return '';
            const b = item.base || {};
            const f = item.filtered || {};

            const bProfitClass = b.netProfitM >= 0 ? 'text-emerald-700 font-bold' : 'text-slate-600';
            const fProfitClass = f.netProfitM >= 0 ? 'text-emerald-700 font-black text-sm' : (f.netProfitM > b.netProfitM ? 'text-indigo-700 font-bold' : 'text-rose-600 font-bold');

            return `
                <tr class="hover:bg-slate-50/80 transition-colors">
                    <td class="py-3 px-3">${formatStrategyName(sId)}</td>
                    <td class="py-3 px-3 text-center text-slate-600">${formatFormat(sId)}</td>
                    <td class="py-3 px-3 text-center bg-slate-50/50 border-x border-slate-200">
                        <span class="font-bold text-slate-800">${b.wins}/${item.totalDays}</span>
                        <span class="text-slate-500 text-[10px]">(${b.winRate}%)</span>
                    </td>
                    <td class="py-3 px-3 text-center bg-slate-50/50 border-r border-slate-200">
                        <div class="${bProfitClass}">${b.netProfitM >= 0 ? '+' : ''}${b.netProfitM}M</div>
                        <div class="text-[10px] text-slate-400">ROI: ${b.roi}%</div>
                    </td>
                    <td class="py-3 px-3 text-center bg-emerald-50/30 border-r border-emerald-100">
                        <span class="font-black text-emerald-950">${f.wins}/${item.totalDays}</span>
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

    function renderSettledLedger() {
        const tbody = byId('settledLedgerTbody');
        if (!tbody || !currentReport || !currentReport.settledLedger) return;

        const selStrat = byId('selectLedgerStrat')?.value || 'shadow';
        const selFilter = byId('selectLedgerFilter')?.value || 'all';
        const search = (byId('inputLedgerSearch')?.value || '').trim().toLowerCase();

        const allRows = currentReport.settledLedger;
        let filteredRows = allRows.filter(r => {
            const stratRes = r.strategies?.[selStrat];
            if (!stratRes) return false;

            // Search filter
            if (search) {
                const matchDate = r.date.includes(search);
                const matchSpecial = r.actualSpecial.includes(search);
                if (!matchDate && !matchSpecial) return false;
            }

            // Outcome filter
            if (selFilter === 'hitFiltered') return stratRes.isFilteredHit;
            if (selFilter === 'eliminated') return stratRes.isEliminatedLoss;
            if (selFilter === 'missBoth') return !stratRes.isBaseHit && !stratRes.isFilteredHit;

            return true;
        });

        const displayRows = filteredRows.slice(0, ledgerLimit);

        if (byId('ledgerCountInfo')) {
            byId('ledgerCountInfo').textContent = `Hiển thị ${displayRows.length} / ${filteredRows.length} kỳ (Tổng ${allRows.length} kỳ)`;
        }

        if (displayRows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="py-6 text-center text-slate-400 italic font-sans">Không tìm thấy bản ghi đối soát phù hợp</td></tr>';
            return;
        }

        tbody.innerHTML = displayRows.map(r => {
            const s = r.strategies[selStrat];
            const p = r.parityPrediction || {};
            const actStr = r.actualSpecial;

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

            // Profit color
            const pnlK = s.filteredProfitK;
            const pnlClass = pnlK > 0 ? 'text-emerald-700 font-black' : (pnlK === 0 ? 'text-slate-600' : 'text-slate-500');

            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-800 whitespace-nowrap">${fmtDate(r.date)}</td>
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
                </tr>
            `;
        }).join('');
    }

    // Auto-init on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
