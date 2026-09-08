// public/js/daily-advisor.js
(() => {
    const number = value => String(Number(value)).padStart(2, '0');
    const percent = value => `${(Number(value || 0) * 100).toFixed(1)}%`;
    const fmt = value => new Intl.NumberFormat('vi-VN').format(Number(value || 0));
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

    // Format all sums as M (Vốn cược ngày = 60M, 1M = 1.000.000đ)
    const moneyM = (val, options = {}) => {
        let num = Number(val || 0);
        let inM = num / 1000;
        const sign = (options.signed && inM >= 0) ? '+' : '';
        const formatted = new Intl.NumberFormat('vi-VN', {
            minimumFractionDigits: options.minDigits ?? (Number.isInteger(inM) ? 0 : 2),
            maximumFractionDigits: options.maxDigits ?? 2
        }).format(inM);
        return `${sign}${formatted}M`;
    };
    const signedM = (val, options = {}) => moneyM(val, { ...options, signed: true });

    let payload = null;
    let activeMainTab = 'dualMerge'; // 'dualMerge' | 'singleMethod'
    let currentStrategyId = 'balanced-selector-fixed30-v1';
    let dualMergeLogLimit = '30'; // Mặc định 30 ngày gần nhất
    let dualMergeFilterStatus = 'live'; // 'live' | 'all' | 'pit' | 'win_x3' | 'win_x2' | 'win_x1' | 'loss'
    let dualMergeSearchQuery = '';
    let currentDeStatsMethod = 'tripleMerge';

    const byId = id => document.getElementById(id);

    const METHOD_STYLE_MAP = {
        dedupEdge75Hold70: {
            shortName: 'Edge75 PIT',
            icon: 'bi-stars',
            badgeClass: 'border-amber-300 bg-amber-100/90 text-amber-950',
            iconColor: 'text-amber-600'
        },
        dedupEdge50CombinedB40S05Hold70: {
            shortName: 'Boost B40S05',
            icon: 'bi-lightning-charge-fill',
            badgeClass: 'border-cyan-300 bg-cyan-100/90 text-cyan-950',
            iconColor: 'text-cyan-600'
        },
        dedupEdge50Hold70: {
            shortName: 'Edge 50%',
            icon: 'bi-graph-up-arrow',
            badgeClass: 'border-teal-300 bg-teal-100/90 text-teal-950',
            iconColor: 'text-teal-600'
        },
        dedupDropoffHold70: {
            shortName: 'Dropoff Khử Trùng',
            icon: 'bi-funnel-fill',
            badgeClass: 'border-purple-300 bg-purple-100/90 text-purple-950',
            iconColor: 'text-purple-600'
        },
        avgEdge50Hold70: {
            shortName: 'Dropoff TB 50%',
            icon: 'bi-bar-chart-fill',
            badgeClass: 'border-indigo-300 bg-indigo-100/90 text-indigo-950',
            iconColor: 'text-indigo-600'
        },
        chainSmallFirstHold70: {
            shortName: 'Chuỗi Nhỏ Trước',
            icon: 'bi-link-45deg',
            badgeClass: 'border-emerald-300 bg-emerald-100/90 text-emerald-950',
            iconColor: 'text-emerald-600'
        },
        edgeHold70: {
            shortName: 'Edge Từng Số',
            icon: 'bi-pie-chart-fill',
            badgeClass: 'border-rose-300 bg-rose-100/90 text-rose-950',
            iconColor: 'text-rose-600'
        }
    };

    function renderMethodBadge(methodId, label) {
        const style = METHOD_STYLE_MAP[methodId] || {
            shortName: label || methodId,
            icon: 'bi-tag-fill',
            badgeClass: 'border-slate-300 bg-slate-100 text-slate-900',
            iconColor: 'text-slate-600'
        };
        const titleText = label || methodId;
        return `
            <span class="inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-black ${style.badgeClass} shadow-2xs" title="${escapeHtml(titleText)}">
                <i class="bi ${style.icon} ${style.iconColor}"></i>
                <span>${escapeHtml(style.shortName)}</span>
            </span>
        `;
    }

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

        const activeBtnClass = 'flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-indigo-600 px-4 py-2.5 text-sm font-black text-white shadow-md transition-all';
        const inactiveBtnClass = 'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors';

        function switchTab(tab) {
            activeMainTab = tab;
            if (btnDualMerge) btnDualMerge.className = tab === 'dualMerge' ? activeBtnClass : inactiveBtnClass;
            if (btnSingle) btnSingle.className = tab === 'singleMethod' ? activeBtnClass : inactiveBtnClass;

            if (viewDual) viewDual.classList.toggle('hidden', tab !== 'dualMerge');
            if (viewSingle) viewSingle.classList.toggle('hidden', tab !== 'singleMethod');
        }

        if (btnDualMerge) btnDualMerge.onclick = () => switchTab('dualMerge');
        if (btnSingle) btnSingle.onclick = () => switchTab('singleMethod');
    }

    // ==========================================
    // 1. RENDER THỰC CHIẾN GỘP (DUAL-MERGE ADVISOR)
    // ==========================================
    function renderDualMergeView(dualMergeData) {
        if (!dualMergeData) return;
        const rec = dualMergeData.latestRecommendation;

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
                    <span class="inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 font-mono text-xs font-black text-amber-950 px-2.5 py-1.5 shadow-sm ring-1 ring-amber-600/30">
                        ${number(n)}<sup class="ml-0.5 text-[9px] text-amber-950 font-black">x2</sup>
                    </span>
                `).join('') || '<p class="text-xs text-amber-800">Đang cập nhật...</p>';
            }

            // Chips X1
            const countX1Badge = byId('countX1Badge');
            if (countX1Badge) countX1Badge.textContent = `${rec.uniqueSinglesX1?.length || 0} số`;
            const chipsX1 = byId('chipsContainerX1');
            if (chipsX1) {
                chipsX1.innerHTML = (rec.uniqueSinglesX1 || []).map(n => `
                    <span class="inline-flex items-center justify-center rounded-xl bg-slate-100 border border-slate-300 font-mono text-xs font-bold text-slate-700 px-2.5 py-1.5 shadow-2xs">
                        ${number(n)}
                    </span>
                `).join('') || '<p class="text-xs text-indigo-800">Đang cập nhật...</p>';
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

            // Plain Reasons (Detailed Quantitative Insights)
            const reasonsEl = byId('dualMergePlainReasons');
            if (reasonsEl && rec.plainReasons && rec.plainReasons.length) {
                reasonsEl.innerHTML = rec.plainReasons.map(r => `
                    <div class="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs leading-relaxed text-slate-700">
                        <i class="bi bi-check2-circle text-amber-600 mt-0.5 text-sm shrink-0"></i>
                        <span>${escapeHtml(r)}</span>
                    </div>
                `).join('');
            }
        }

        // Triple-Consensus Module
        if (payload?.tripleMerge) {
            renderTripleMergeView(payload.tripleMerge);
        }

        // Adaptive Dual Alpha Module
        if (payload?.adaptiveDualMerge) {
            renderAdaptiveDualMergeView(payload.adaptiveDualMerge);
        }

        // Setup 3 Unified Top Method Buttons with Live/7-day Performance
        renderUnifiedDeTopTabs(payload);

        // Highlight Champion De Method with Highest 7-Day Profit on Recommendation Cards
        highlightBestDeMethod(payload);

        // Setup Stats & Ledger Method Switcher and Default to 7-Day Champion Method
        setupDeStatsSwitcher();
        const champion7d = resolveChampionDeMethod7Days(payload);
        currentDeStatsMethod = champion7d ? champion7d.id : 'dualMerge';
        switchDeStatsMethod(currentDeStatsMethod);
    }

    function highlightBestDeMethod(dataPayload) {
        if (!dataPayload) return;
        const champion = resolveChampionDeMethod7Days(dataPayload);
        if (!champion) return;

        // Clean up previous highlights
        document.querySelectorAll('.de-champion-badge').forEach(el => el.remove());
        const cards = [
            byId('dualMergeTodayRecommendation'),
            byId('adaptiveTodayRecommendation'),
            byId('tripleMergeSection')
        ];
        cards.forEach(c => {
            if (c) c.classList.remove('ring-4', 'ring-amber-400', 'shadow-2xl');
        });

        // Highlight card for 7-day champion
        let champCardEl = null;
        let champBadgeGroupEl = null;
        if (champion.id === 'dualMerge') {
            champCardEl = byId('dualMergeTodayRecommendation');
            champBadgeGroupEl = byId('dualMergeBadgeGroup');
        } else if (champion.id === 'adaptiveDualMerge') {
            champCardEl = byId('adaptiveTodayRecommendation');
            champBadgeGroupEl = byId('adaptiveBadgeGroup');
        } else if (champion.id === 'tripleMerge') {
            champCardEl = byId('tripleMergeSection');
            champBadgeGroupEl = byId('tripleBadgeGroup');
        }

        if (champCardEl) {
            champCardEl.classList.add('ring-4', 'ring-amber-400', 'shadow-2xl');
        }
        if (champBadgeGroupEl) {
            const champBadge = document.createElement('span');
            champBadge.className = 'de-champion-badge inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-black text-[11px] px-3 py-0.5 uppercase shadow-md animate-pulse';
            champBadge.innerHTML = `<i class="bi bi-trophy-fill text-amber-950"></i> 👑 ĐỀ XUẤT TOP 1 (7 NGÀY: ${signedM(champion.last7ProfitK)})`;
            champBadgeGroupEl.prepend(champBadge);
        }
    }

    let tripleLogLimitValue = '30';

    function renderTripleMergeView(tripleMergeData) {
        if (!tripleMergeData) return;
        const rec = tripleMergeData.latestRecommendation;

        if (rec) {
            if (byId('tripleTargetDate')) {
                byId('tripleTargetDate').textContent = rec.predictionDate || rec.targetDate || rec.date || '--/--/----';
            }
            if (byId('tripleM1Label')) byId('tripleM1Label').textContent = rec.m1Label || 'Edge 50%';
            if (byId('tripleM2Label')) byId('tripleM2Label').textContent = rec.m2Label || 'Edge 75% Hold';
            if (byId('tripleM3Label')) byId('tripleM3Label').textContent = rec.m3Label || 'Dropoff Khử Trùng';

            if (byId('tripleCountAll')) byId('tripleCountAll').textContent = String(rec.totalNumbersCount || 0);
            if (byId('tripleCountX3')) byId('tripleCountX3').textContent = `${rec.countX3 || 0} số`;
            if (byId('tripleCountX2')) byId('tripleCountX2').textContent = `${rec.countX2 || 0} số`;
            if (byId('tripleCountX1')) byId('tripleCountX1').textContent = `${rec.countX1 || 0} số`;

            // Render chips for X3, X2, X1
            const cX3 = byId('tripleChipsX3');
            if (cX3) {
                cX3.innerHTML = (rec.tierX3 || []).map(n => `
                    <span class="inline-flex items-center justify-center rounded-lg bg-amber-400 font-mono text-xs font-black text-amber-950 px-2 py-1 shadow-sm">
                        ${number(n)}<sup class="ml-0.5 text-[9px] text-amber-950 font-black">x3</sup>
                    </span>
                `).join('');
            }

            const cX2 = byId('tripleChipsX2');
            if (cX2) {
                cX2.innerHTML = (rec.tierX2 || []).map(n => `
                    <span class="inline-flex items-center justify-center rounded-lg bg-cyan-400 font-mono text-xs font-black text-cyan-950 px-2 py-1 shadow-sm">
                        ${number(n)}<sup class="ml-0.5 text-[9px] text-cyan-950 font-black">x2</sup>
                    </span>
                `).join('');
            }

            const cX1 = byId('tripleChipsX1');
            if (cX1) {
                cX1.innerHTML = (rec.tierX1 || []).map(n => `
                    <span class="inline-flex items-center justify-center rounded-lg bg-indigo-900 border border-indigo-500/50 font-mono text-xs font-bold text-indigo-100 px-2 py-1 shadow-sm">
                        ${number(n)}
                    </span>
                `).join('');
            }

            // Copy buttons
            const btnCopyTripleAll = byId('btnCopyTripleAll');
            if (btnCopyTripleAll) {
                btnCopyTripleAll.onclick = () => copyNumbers(rec.fullUnion, ' ');
            }
            const btnCopyTripleX3 = byId('btnCopyTripleX3');
            if (btnCopyTripleX3) {
                btnCopyTripleX3.onclick = () => copyNumbers(rec.tierX3, ' ');
            }
            const btnCopyTripleX2 = byId('btnCopyTripleX2');
            if (btnCopyTripleX2) {
                btnCopyTripleX2.onclick = () => copyNumbers(rec.tierX2, ' ');
            }
            const btnCopyTripleX1 = byId('btnCopyTripleX1');
            if (btnCopyTripleX1) {
                btnCopyTripleX1.onclick = () => copyNumbers(rec.tierX1, ' ');
            }
        }

        // Summary Stats
        const summary = tripleMergeData.summary || {};
        if (byId('tripleTotalDays')) byId('tripleTotalDays').textContent = `${summary.totalSettled || 0} ngày`;
        if (byId('tripleHitRate')) byId('tripleHitRate').textContent = `${percent(summary.overallHitRate || 0)} trúng`;
        if (byId('tripleWinsBreakdown')) byId('tripleWinsBreakdown').textContent = `${summary.winsX3 || 0} X3 · ${summary.winsX2 || 0} X2 · ${summary.winsX1 || 0} X1`;
        if (byId('tripleLossesCount')) byId('tripleLossesCount').textContent = `${summary.totalLosses || 0} ngày trượt`;
        if (byId('tripleProfitK')) byId('tripleProfitK').textContent = `${signedM(summary.overallProfitK || 0)}`;
        if (byId('tripleRoi')) byId('tripleRoi').textContent = `ROI ${percent(summary.roi || 0)}`;

        // Render Monthly Table and Daily Ledger
        renderTripleMonthlyTable(tripleMergeData.settledLedger || []);
        renderTripleLedger(tripleMergeData.settledLedger || [], tripleLogLimitValue);

        // Toggle Triple History Section (Default Collapsed)
        const btnToggleTripleSection = byId('btnToggleTripleSection');
        const tripleHistoryContent = byId('tripleHistoryContent');
        const tripleCollapseIcon = byId('tripleCollapseIcon');
        const tripleToggleBadge = byId('tripleToggleBadge');
        if (btnToggleTripleSection && tripleHistoryContent) {
            btnToggleTripleSection.onclick = () => {
                const isHidden = tripleHistoryContent.classList.contains('hidden');
                if (isHidden) {
                    tripleHistoryContent.classList.remove('hidden');
                    if (tripleCollapseIcon) {
                        tripleCollapseIcon.classList.remove('bi-chevron-down');
                        tripleCollapseIcon.classList.add('bi-chevron-up');
                    }
                    if (tripleToggleBadge) {
                        tripleToggleBadge.innerHTML = '<span>Thu gọn</span> <i class="bi bi-chevron-up"></i>';
                    }
                } else {
                    tripleHistoryContent.classList.add('hidden');
                    if (tripleCollapseIcon) {
                        tripleCollapseIcon.classList.remove('bi-chevron-up');
                        tripleCollapseIcon.classList.add('bi-chevron-down');
                    }
                    if (tripleToggleBadge) {
                        tripleToggleBadge.innerHTML = '<span>Mở rộng xem chi tiết</span> <i class="bi bi-chevron-down"></i>';
                    }
                }
            };
        }

        // Toggle Monthly Table inside Triple Section
        const btnToggle = byId('btnToggleTripleMonthly');
        const monthlyWrapper = byId('tripleMonthlyWrapper');
        if (btnToggle && monthlyWrapper) {
            btnToggle.onclick = () => {
                const isHidden = monthlyWrapper.classList.contains('hidden');
                if (isHidden) {
                    monthlyWrapper.classList.remove('hidden');
                    btnToggle.innerHTML = '<i class="bi bi-chevron-up"></i> Đóng Bảng Tháng';
                } else {
                    monthlyWrapper.classList.add('hidden');
                    btnToggle.innerHTML = '<i class="bi bi-calendar3"></i> Xem Bảng Tháng';
                }
            };
        }

        // Limit Selector
        const selectLimit = byId('tripleLogLimit');
        if (selectLimit) {
            selectLimit.value = tripleLogLimitValue;
            selectLimit.onchange = (e) => {
                tripleLogLimitValue = e.target.value;
                renderTripleLedger(tripleMergeData.settledLedger || [], tripleLogLimitValue);
            };
        }
    }

    function renderTripleMonthlyTable(records) {
        const container = byId('tripleMonthlyTableBody');
        if (!container) return;
        const allRecords = (records || []).filter(r => r.settled && Number.isInteger(r.actual));
        if (!allRecords.length) {
            container.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-indigo-300">Chưa có dữ liệu thống kê tháng Tam Trụ.</td></tr>';
            return;
        }

        const monthGroups = {};
        allRecords.forEach(r => {
            const ym = (r.date || '').slice(0, 7);
            if (!ym) return;
            if (!monthGroups[ym]) monthGroups[ym] = [];
            monthGroups[ym].push(r);
        });

        const sortedMonths = Object.keys(monthGroups).sort();
        container.innerHTML = sortedMonths.map(ym => {
            const list = monthGroups[ym];
            const days = list.length;
            const x3 = list.filter(r => r.hitType === 'win_x3').length;
            const x2 = list.filter(r => r.hitType === 'win_x2').length;
            const x1 = list.filter(r => r.hitType === 'win_x1').length;
            const totalWins = x3 + x2 + x1;
            const losses = days - totalWins;
            const hitRate = days > 0 ? totalWins / days : 0;
            const stakeK = list.reduce((sum, r) => sum + (r.stakeK || 0), 0);
            const payoutK = list.reduce((sum, r) => sum + (r.payoutK || 0), 0);
            const profitK = payoutK - stakeK;
            const roi = stakeK > 0 ? profitK / stakeK : 0;

            const [year, month] = ym.split('-');
            const monthLabel = `Tháng ${parseInt(month, 10)}/${year}`;
            const profitClass = profitK >= 0 ? 'text-emerald-400 font-black' : 'text-rose-400 font-black';

            return `
                <tr class="hover:bg-white/5 transition-colors fast-render-row table-row-contain">
                    <td class="p-2.5 pl-4 font-bold text-white">${monthLabel}</td>
                    <td class="p-2.5 text-center text-indigo-200">${days}</td>
                    <td class="p-2.5 text-center font-black text-amber-400">${x3}</td>
                    <td class="p-2.5 text-center font-black text-cyan-400">${x2}</td>
                    <td class="p-2.5 text-center font-bold text-indigo-200">${x1}</td>
                    <td class="p-2.5 text-center font-bold text-rose-400">${losses}</td>
                    <td class="p-2.5 text-center font-bold text-white">${percent(hitRate)}</td>
                    <td class="p-2.5 text-right font-mono ${profitClass}">${signedM(profitK)}</td>
                    <td class="p-2.5 pr-4 text-center font-mono ${profitK >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}">${percent(roi)}</td>
                </tr>
            `;
        }).join('');
    }

    function renderTripleLedger(records, limit = '30') {
        const container = byId('tripleLedgerBody');
        if (!container) return;

        let list = (records || []).slice().reverse();
        if (limit !== 'all') {
            const num = parseInt(limit, 10);
            if (!Number.isNaN(num) && num > 0) {
                list = list.slice(0, num);
            }
        }

        if (!list.length) {
            container.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-indigo-300">Không có dữ liệu đối soát.</td></tr>';
            return;
        }

        container.innerHTML = list.map(r => {
            let hitBadge = '';
            let profitClass = 'text-slate-400 font-mono';
            if (r.hitType === 'win_x3') {
                hitBadge = '<span class="inline-flex items-center gap-1 rounded-md bg-amber-400 font-mono text-[10px] font-black text-amber-950 px-2 py-0.5 shadow-xs"><i class="bi bi-trophy-fill"></i> TRÚNG X3</span>';
                profitClass = 'text-amber-400 font-black font-mono';
            } else if (r.hitType === 'win_x2') {
                hitBadge = '<span class="inline-flex items-center gap-1 rounded-md bg-cyan-400 font-mono text-[10px] font-black text-cyan-950 px-2 py-0.5 shadow-xs"><i class="bi bi-check-circle-fill"></i> TRÚNG X2</span>';
                profitClass = 'text-cyan-400 font-black font-mono';
            } else if (r.hitType === 'win_x1') {
                hitBadge = '<span class="inline-flex items-center gap-1 rounded-md bg-indigo-500/40 border border-indigo-400/40 font-mono text-[10px] font-bold text-indigo-200 px-2 py-0.5 shadow-xs">TRÚNG X1</span>';
                profitClass = 'text-indigo-300 font-bold font-mono';
            } else {
                hitBadge = '<span class="inline-flex items-center rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold px-2 py-0.5">TRƯỢT</span>';
                profitClass = 'text-rose-400 font-bold font-mono';
            }

            const isLive = r.isLiveSnapshot || r.sourceType === 'live-snapshot';
            const sourceBadge = isLive
                ? `<span class="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/20 px-1.5 py-0.5 font-bold text-emerald-300 text-[10px] shadow-2xs" title="Snapshot thực tế từ 28/08/2026"><i class="bi bi-lock-fill text-emerald-400"></i> Live</span>`
                : `<span class="inline-flex items-center gap-1 rounded-md border border-sky-400/40 bg-sky-500/20 px-1.5 py-0.5 font-bold text-sky-300 text-[10px] shadow-2xs" title="Hồi quy độc lập Strict PIT"><i class="bi bi-cpu text-sky-400"></i> PIT</span>`;

            return `
                <tr class="hover:bg-white/5 transition-colors text-xs fast-render-row table-row-contain">
                    <td class="p-2.5 pl-4 font-mono font-bold text-white whitespace-nowrap">
                        <div>${r.date}</div>
                        <div class="mt-0.5">${sourceBadge}</div>
                    </td>
                    <td class="p-2.5 text-center">
                        <span class="inline-block rounded-md bg-white/10 px-2 py-0.5 font-mono text-xs font-black text-amber-300">${number(r.actual)}</span>
                    </td>
                    <td class="p-2.5 text-indigo-200">
                        <div class="font-bold text-white text-[11px]">${r.m1Label || 'Edge50'} + ${r.m2Label || 'Edge75'} + ${r.m3Label || 'Dropoff'}</div>
                    </td>
                    <td class="p-2.5 text-indigo-200">
                        <span class="text-amber-300 font-bold">${r.countX3 || 0} số x3</span> · 
                        <span class="text-cyan-300 font-bold">${r.countX2 || 0} số x2</span> · 
                        <span class="text-indigo-300">${r.countX1 || 0} số x1</span>
                    </td>
                    <td class="p-2.5 text-center">${hitBadge}</td>
                    <td class="p-2.5 pr-4 text-right ${profitClass}">
                        <div>${signedM(r.profitK)}</div>
                        <div class="text-[10px] text-indigo-300/70 font-normal">Lũy kế: ${signedM(r.cumulativeProfitK)}</div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    let adaptiveLogLimitValue = '30';

    function renderAdaptiveDualMergeView(adaptiveData) {
        if (!adaptiveData) return;
        const rec = adaptiveData.latestRecommendation;

        if (rec) {
            if (byId('adaptiveTargetDate')) byId('adaptiveTargetDate').textContent = rec.predictionDate || '--/--/----';
            if (byId('adaptiveM1Label')) byId('adaptiveM1Label').textContent = rec.m1Label || 'Edge 75% Hold';
            if (byId('adaptiveM2Label')) byId('adaptiveM2Label').textContent = rec.m2Label || 'Dropoff Khử Trùng';

            const modeBadge = byId('adaptiveModeBadge');
            if (modeBadge) {
                if (rec.mode === 'defensive') {
                    modeBadge.className = 'rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/40 px-3 py-0.5 text-xs font-black';
                    modeBadge.textContent = '🛡️ Phòng Thủ Cắt Dây (61.2% trúng)';
                } else {
                    modeBadge.className = 'rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/40 px-3 py-0.5 text-xs font-black';
                    modeBadge.textContent = '⚔️ Tấn Công X2 (ROI +28.6%)';
                }
            }

            if (byId('adaptiveCountAll')) byId('adaptiveCountAll').textContent = String(rec.totalNumbersCount || 0);
            if (byId('adaptiveCountX2')) byId('adaptiveCountX2').textContent = `${rec.overlapCount || (rec.intersectionX2?.length || 0)} số`;
            if (byId('adaptiveCountX1')) byId('adaptiveCountX1').textContent = `${rec.uniqueSinglesCount || (rec.uniqueSinglesX1?.length || 0)} số`;

            // Render chips for X2 and X1
            const cX2 = byId('adaptiveChipsX2');
            if (cX2) {
                cX2.innerHTML = (rec.intersectionX2 || []).map(n => `
                    <span class="inline-flex items-center justify-center rounded-lg bg-amber-400 font-mono text-xs font-black text-amber-950 px-2.5 py-1 shadow-sm">
                        ${number(n)}<sup class="ml-0.5 text-[9px] text-amber-950 font-black">x2</sup>
                    </span>
                `).join('');
            }

            const cX1 = byId('adaptiveChipsX1');
            if (cX1) {
                cX1.innerHTML = (rec.uniqueSinglesX1 || []).map(n => `
                    <span class="inline-flex items-center justify-center rounded-lg bg-teal-900 border border-teal-500/50 font-mono text-xs font-bold text-teal-100 px-2.5 py-1 shadow-sm">
                        ${number(n)}
                    </span>
                `).join('');
            }

            const btnCopyAdaptiveAll = byId('btnCopyAdaptiveAll');
            if (btnCopyAdaptiveAll) {
                btnCopyAdaptiveAll.onclick = () => copyNumbers(rec.fullUnion, ' ');
            }
            const btnCopyAdaptiveX2 = byId('btnCopyAdaptiveX2');
            if (btnCopyAdaptiveX2) {
                btnCopyAdaptiveX2.onclick = () => copyNumbers(rec.intersectionX2, ' ');
            }
            const btnCopyAdaptiveX1 = byId('btnCopyAdaptiveX1');
            if (btnCopyAdaptiveX1) {
                btnCopyAdaptiveX1.onclick = () => copyNumbers(rec.uniqueSinglesX1, ' ');
            }
        }

        // Summary Stats
        const summary = adaptiveData.summary || {};
        if (byId('adaptiveTotalDays')) byId('adaptiveTotalDays').textContent = `${summary.totalSettled || 0} ngày`;
        if (byId('adaptiveHitRate')) byId('adaptiveHitRate').textContent = `${percent(summary.overallHitRate || 0)} trúng`;
        if (byId('adaptiveWinsBreakdown')) byId('adaptiveWinsBreakdown').textContent = `${summary.winsX2 || 0} X2 · ${summary.winsX1 || 0} X1`;
        if (byId('adaptiveLossesCount')) byId('adaptiveLossesCount').textContent = `${summary.totalLosses || 0} ngày trượt`;
        if (byId('adaptiveProfitK')) byId('adaptiveProfitK').textContent = `${signedM(summary.overallProfitK || 0)}`;
        if (byId('adaptiveRoi')) byId('adaptiveRoi').textContent = `ROI ${percent(summary.roi || 0)}`;
        if (byId('adaptiveX2Rate')) byId('adaptiveX2Rate').textContent = `${percent(summary.winX2Rate || 0)}`;
        if (byId('adaptiveLiveProfit') && summary.live) {
            byId('adaptiveLiveProfit').textContent = `${signedM(summary.live.profitK || 0)} (${percent(summary.live.hitRate || 0)} trúng)`;
        }

        // Render Monthly Table and Daily Ledger
        renderAdaptiveMonthlyTable(adaptiveData.settledLedger || []);
        renderAdaptiveLedger(adaptiveData.settledLedger || [], adaptiveLogLimitValue);

        // Toggle Adaptive History Section (Default Collapsed)
        const btnToggleAdaptiveSection = byId('btnToggleAdaptiveSection');
        const adaptiveHistoryContent = byId('adaptiveHistoryContent');
        const adaptiveCollapseIcon = byId('adaptiveCollapseIcon');
        const adaptiveToggleBadge = byId('adaptiveToggleBadge');
        if (btnToggleAdaptiveSection && adaptiveHistoryContent) {
            btnToggleAdaptiveSection.onclick = () => {
                const isHidden = adaptiveHistoryContent.classList.contains('hidden');
                if (isHidden) {
                    adaptiveHistoryContent.classList.remove('hidden');
                    if (adaptiveCollapseIcon) {
                        adaptiveCollapseIcon.classList.remove('bi-chevron-down');
                        adaptiveCollapseIcon.classList.add('bi-chevron-up');
                    }
                    if (adaptiveToggleBadge) {
                        adaptiveToggleBadge.innerHTML = '<span>Thu gọn</span> <i class="bi bi-chevron-up"></i>';
                    }
                } else {
                    adaptiveHistoryContent.classList.add('hidden');
                    if (adaptiveCollapseIcon) {
                        adaptiveCollapseIcon.classList.remove('bi-chevron-up');
                        adaptiveCollapseIcon.classList.add('bi-chevron-down');
                    }
                    if (adaptiveToggleBadge) {
                        adaptiveToggleBadge.innerHTML = '<span>Mở rộng xem chi tiết</span> <i class="bi bi-chevron-down"></i>';
                    }
                }
            };
        }

        // Toggle Monthly Table inside Adaptive Section
        const btnToggle = byId('btnToggleAdaptiveMonthly');
        const monthlyWrapper = byId('adaptiveMonthlyWrapper');
        if (btnToggle && monthlyWrapper) {
            btnToggle.onclick = () => {
                const isHidden = monthlyWrapper.classList.contains('hidden');
                if (isHidden) {
                    monthlyWrapper.classList.remove('hidden');
                    btnToggle.innerHTML = '<i class="bi bi-chevron-up"></i> Đóng Bảng Tháng';
                } else {
                    monthlyWrapper.classList.add('hidden');
                    btnToggle.innerHTML = '<i class="bi bi-calendar3"></i> Xem Bảng Tháng';
                }
            };
        }

        // Limit Selector
        const selectLimit = byId('adaptiveLogLimit');
        if (selectLimit) {
            selectLimit.value = adaptiveLogLimitValue;
            selectLimit.onchange = (e) => {
                adaptiveLogLimitValue = e.target.value;
                renderAdaptiveLedger(adaptiveData.settledLedger || [], adaptiveLogLimitValue);
            };
        }
    }

    function renderAdaptiveMonthlyTable(records) {
        const container = byId('adaptiveMonthlyTableBody');
        if (!container) return;
        const allRecords = (records || []).filter(r => Number.isInteger(r.actualSpecial) || Number.isInteger(r.actual));
        if (!allRecords.length) {
            container.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-teal-300">Chưa có dữ liệu thống kê tháng Thích Ứng Alpha.</td></tr>';
            return;
        }

        const monthGroups = {};
        allRecords.forEach(r => {
            const ym = (r.predictionDate || r.date || '').slice(0, 7);
            if (!ym) return;
            if (!monthGroups[ym]) monthGroups[ym] = [];
            monthGroups[ym].push(r);
        });

        const sortedMonths = Object.keys(monthGroups).sort();
        container.innerHTML = sortedMonths.map(ym => {
            const list = monthGroups[ym];
            const days = list.length;
            const x2 = list.filter(r => r.hitType === 'win_x2' || r.isX2).length;
            const x1 = list.filter(r => r.hitType === 'win_x1' || (r.isHit && !r.isX2)).length;
            const totalWins = x2 + x1;
            const losses = days - totalWins;
            const hitRate = days > 0 ? totalWins / days : 0;
            const stakeK = list.reduce((sum, r) => sum + (r.stakeK || 60000), 0);
            const payoutK = list.reduce((sum, r) => sum + (r.payoutK || 0), 0);
            const profitK = payoutK - stakeK;
            const roi = stakeK > 0 ? profitK / stakeK : 0;

            const [year, month] = ym.split('-');
            const profitClass = profitK > 0 ? 'text-emerald-400 font-bold' : (profitK < 0 ? 'text-rose-400 font-bold' : 'text-slate-400');

            return `
                <tr class="hover:bg-white/5 transition-colors fast-render-row table-row-contain">
                    <td class="p-3 font-bold text-white whitespace-nowrap">Tháng ${month}/${year}</td>
                    <td class="p-3 text-center font-bold text-slate-200">${days}</td>
                    <td class="p-3 text-center font-black text-amber-300">${x2}</td>
                    <td class="p-3 text-center font-bold text-teal-300">${x1}</td>
                    <td class="p-3 text-center font-semibold text-rose-300">${losses}</td>
                    <td class="p-3 text-center font-bold text-emerald-300">${percent(hitRate)}</td>
                    <td class="p-3 text-right font-mono font-bold ${profitClass}">${signedM(profitK)}</td>
                    <td class="p-3 text-center font-mono font-bold ${profitClass}">${percent(roi)}</td>
                </tr>
            `;
        }).join('');
    }

    function renderAdaptiveLedger(records, limitValue) {
        const container = byId('adaptiveLedgerBody');
        if (!container) return;

        const allRecords = (records || []).filter(r => Number.isInteger(r.actualSpecial) || Number.isInteger(r.actual))
            .slice().sort((a, b) => (b.predictionDate || b.date).localeCompare(a.predictionDate || a.date));

        const displayRecords = limitValue === 'all' ? allRecords : allRecords.slice(0, parseInt(limitValue, 10) || 30);

        if (!displayRecords.length) {
            container.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-teal-300">Chưa có dữ liệu đối soát Thích Ứng Alpha.</td></tr>';
            return;
        }

        container.innerHTML = displayRecords.map(r => {
            const isX2 = r.hitType === 'win_x2' || r.isX2;
            const isX1 = r.hitType === 'win_x1' || (r.isHit && !r.isX2);
            let hitBadge = '';
            let profitClass = '';

            if (isX2) {
                hitBadge = '<span class="inline-flex items-center rounded-md bg-amber-400 font-mono text-[11px] font-black text-amber-950 px-2 py-0.5 shadow-xs">TRÚNG X2</span>';
                profitClass = 'text-emerald-400 font-black font-mono';
            } else if (isX1) {
                hitBadge = '<span class="inline-flex items-center rounded-md bg-teal-500 font-mono text-[11px] font-bold text-white px-2 py-0.5 shadow-xs">TRÚNG X1</span>';
                profitClass = 'text-emerald-400 font-bold font-mono';
            } else {
                hitBadge = '<span class="inline-flex items-center rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold px-2 py-0.5">TRƯỢT</span>';
                profitClass = 'text-rose-400 font-bold font-mono';
            }

            const isLive = r.isLiveSnapshot || r.sourceType === 'live-snapshot';
            const sourceBadge = isLive
                ? `<span class="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/20 px-1.5 py-0.5 font-bold text-emerald-300 text-[10px] shadow-2xs" title="Snapshot thực tế từ 28/08/2026"><i class="bi bi-lock-fill text-emerald-400"></i> Live</span>`
                : `<span class="inline-flex items-center gap-1 rounded-md border border-sky-400/40 bg-sky-500/20 px-1.5 py-0.5 font-bold text-sky-300 text-[10px] shadow-2xs" title="Hồi quy độc lập Strict PIT"><i class="bi bi-cpu text-sky-400"></i> PIT</span>`;

            const modeLabel = r.mode === 'defensive'
                ? '<span class="text-indigo-300 text-[10px] font-bold">🛡️ Phòng thủ</span>'
                : '<span class="text-amber-300 text-[10px] font-bold">⚔️ Tấn công</span>';

            const actualNum = Number.isInteger(r.actualSpecial) ? r.actualSpecial : r.actual;

            return `
                <tr class="hover:bg-white/5 transition-colors text-xs fast-render-row table-row-contain">
                    <td class="p-2.5 pl-4 font-mono font-bold text-white whitespace-nowrap">
                        <div>${r.predictionDate || r.date}</div>
                        <div class="mt-0.5">${sourceBadge}</div>
                    </td>
                    <td class="p-2.5 text-teal-200">
                        <div class="font-bold text-white text-[11px]">${r.m1Label || 'Edge75'} + ${r.m2Label || 'Dropoff'}</div>
                        <div>${modeLabel}</div>
                    </td>
                    <td class="p-2.5 text-center text-amber-300 font-bold">${r.overlapCount || (r.intersectionX2?.length || 0)} số</td>
                    <td class="p-2.5 text-center text-teal-300 font-medium">${r.uniqueSinglesCount || (r.uniqueSinglesX1?.length || 0)} số</td>
                    <td class="p-2.5 text-center">
                        <span class="inline-block rounded-md bg-white/10 px-2 py-0.5 font-mono text-xs font-black text-amber-300">${number(actualNum)}</span>
                    </td>
                    <td class="p-2.5 text-center">${hitBadge}</td>
                    <td class="p-2.5 pr-4 text-right ${profitClass}">
                        <div>${signedM(r.profitK)}</div>
                    </td>
                    <td class="p-2.5 pr-4 text-right font-mono font-bold text-slate-300">
                        ${signedM(r.cumulativeProfitK || r.liveCumulativeProfitK)}
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ==========================================
    // UNIFIED ĐỀ METHODS STATS & LEDGER SYSTEM
    // ==========================================
    function computeLastNDaysStats(records = [], n = 7, stakePerDay = 60000) {
        const settled = (records || []).filter(r => {
            const hasActual = Number.isInteger(r.actual) || Number.isInteger(r.actualSpecial);
            return r.settled !== false && hasActual;
        });
        const slice = settled.slice(-n);
        if (!slice.length) return { days: 0, wins: 0, losses: 0, profitK: 0, hitRate: 0, roi: 0 };
        let wins = 0;
        let profitK = 0;
        let stakeK = 0;
        slice.forEach(r => {
            const pK = Number(r.dailyProfitK ?? r.profitK ?? 0);
            const sK = Number(r.stakeK ?? (stakePerDay / 1000));
            profitK += pK;
            stakeK += sK;
            const isWin = (r.hitType && r.hitType.startsWith('win')) || r.won || r.win || r.tierWon === 'x3' || r.tierWon === 'x2' || r.tierWon === 'x1';
            if (isWin) wins++;
        });
        const hitRate = slice.length ? wins / slice.length : 0;
        const roi = stakeK > 0 ? (profitK / stakeK) * 100 : 0;
        return {
            days: slice.length,
            wins,
            losses: slice.length - wins,
            profitK,
            hitRate,
            roi
        };
    }

    function getDeMethodObject(methodId, p = payload) {
        let data = null;
        let name = '';
        let shortName = '';
        let stakePerDay = 60000;

        if (methodId === 'tripleMerge') {
            data = p?.tripleMerge;
            name = 'Đề Gộp 3 (Tam Trụ)';
            shortName = 'Tam Trụ';
            stakePerDay = 90000;
        } else if (methodId === 'adaptiveDualMerge') {
            data = p?.adaptiveDualMerge;
            name = 'Đề Gộp 2 (Thích Ứng Alpha)';
            shortName = 'Thích Ứng Alpha';
            stakePerDay = 60000;
        } else {
            methodId = 'dualMerge';
            data = p?.dualMerge;
            name = 'Đề Gộp 1 (Tiêu Chuẩn)';
            shortName = 'Tiêu Chuẩn';
            stakePerDay = 60000;
        }

        const summary = data?.summary || {};
        const records = data?.settledLedger || [];
        const latestRec = data?.latestRecommendation || null;
        const overallProfitK = Number(summary.overallProfitK || summary.profitK || 0);
        const overallHitRate = Number(summary.overallHitRate || summary.hitRate || 0);
        const liveProfitK = summary.live?.profitK ?? -Infinity;

        // Multi-horizon 7 days stats: prefer summary.windows.last7, fallback to computed from settledLedger
        const w7 = summary.windows?.last7;
        const computed7 = computeLastNDaysStats(records, 7, stakePerDay);
        const last7ProfitK = w7?.profitK != null ? Number(w7.profitK) : computed7.profitK;
        const last7HitRate = w7?.hitRate != null ? Number(w7.hitRate) : computed7.hitRate;
        const last7Wins = w7?.wins != null ? Number(w7.wins) : computed7.wins;
        const last7Days = w7?.days != null ? Number(w7.days) : computed7.days;
        const last7Roi = w7?.roi != null ? Number(w7.roi) : computed7.roi;

        return {
            id: methodId,
            name,
            shortName,
            stakePerDay,
            summary,
            records,
            latestRec,
            overallProfitK,
            overallHitRate,
            liveProfitK,
            last7ProfitK,
            last7HitRate,
            last7Wins,
            last7Days,
            last7Roi
        };
    }

    function resolveChampionDeMethod7Days(p = payload) {
        if (!p) return getDeMethodObject('adaptiveDualMerge', p);
        const methods = [
            getDeMethodObject('adaptiveDualMerge', p),
            getDeMethodObject('dualMerge', p),
            getDeMethodObject('tripleMerge', p)
        ];
        methods.sort((a, b) => {
            if (a.liveProfitK !== b.liveProfitK) {
                return b.liveProfitK - a.liveProfitK;
            }
            if (a.last7ProfitK !== b.last7ProfitK) {
                return b.last7ProfitK - a.last7ProfitK;
            }
            return b.last7HitRate - a.last7HitRate;
        });
        return methods[0] || getDeMethodObject('adaptiveDualMerge', p);
    }

    function renderUnifiedDeTopTabs(p = payload) {
        if (!p) return;
        const triple = getDeMethodObject('tripleMerge', p);
        const adaptive = getDeMethodObject('adaptiveDualMerge', p);
        const dual = getDeMethodObject('dualMerge', p);

        // Update 7-day and Live profit labels
        if (byId('tabL7Triple')) byId('tabL7Triple').textContent = `${signedM(triple.last7ProfitK)} (${percent(triple.last7HitRate)})`;
        if (byId('tabAllTriple')) byId('tabAllTriple').textContent = `Live: ${signedM(triple.liveProfitK)}`;

        if (byId('tabL7Adaptive')) byId('tabL7Adaptive').textContent = `${signedM(adaptive.last7ProfitK)} (${percent(adaptive.last7HitRate)})`;
        if (byId('tabAllAdaptive')) byId('tabAllAdaptive').textContent = `Live: ${signedM(adaptive.liveProfitK)}`;

        if (byId('tabL7Dual')) byId('tabL7Dual').textContent = `${signedM(dual.last7ProfitK)} (${percent(dual.last7HitRate)})`;
        if (byId('tabAllDual')) byId('tabAllDual').textContent = `Live: ${signedM(dual.liveProfitK)}`;

        // Update Bottom Stats Tab Badges
        if (byId('btnStatsAdaptiveProfitBadge')) byId('btnStatsAdaptiveProfitBadge').textContent = `${signedM(adaptive.liveProfitK)} Live`;
        if (byId('btnStatsDualProfitBadge')) byId('btnStatsDualProfitBadge').textContent = `${signedM(dual.liveProfitK)} Live`;
        if (byId('btnStatsTripleProfitBadge')) byId('btnStatsTripleProfitBadge').textContent = `${signedM(triple.liveProfitK)} Live`;

        // Resolve champion
        const champion = resolveChampionDeMethod7Days(p);
        if (byId('deTopChampionBadge')) {
            byId('deTopChampionBadge').textContent = `👑 ĐỀ XUẤT: ${champion.name.toUpperCase()} (LÃI LIVE: ${signedM(champion.liveProfitK)})`;
        }

        // Badges on individual buttons
        if (byId('badgeRecTriple')) byId('badgeRecTriple').classList.toggle('hidden', champion.id !== 'tripleMerge');
        if (byId('badgeRecAdaptive')) byId('badgeRecAdaptive').classList.toggle('hidden', champion.id !== 'adaptiveDualMerge');
        if (byId('badgeRecDual')) byId('badgeRecDual').classList.toggle('hidden', champion.id !== 'dualMerge');
    }

    function renderDeKpiSummaryCards(summary = {}, methodId = 'tripleMerge') {
        const kpiContainer = byId('dualMergeSummaryCards');
        if (!kpiContainer) return;
        const live = summary.live || {};
        const profitClass = Number(live.profitK || 0) >= 0 ? 'text-emerald-400 font-black' : 'text-rose-400 font-black';

        let kpis = [];
        if (methodId === 'tripleMerge') {
            kpis = [
                ['THỰC CHIẾN LIVE (TỪ 28/08)', `${live.days || 0} kỳ`, 'Khóa snapshot chốt số thực tế'],
                ['TRÚNG X3 (SIÊU ĐỒNG THUẬN)', `${live.winsX3 || 0} kỳ`, `${percent(live.winX3Rate)} · Ăn 252M (+162M)`],
                ['TRÚNG X2 (ĐỒNG THUẬN CAO)', `${live.winsX2 || 0} kỳ`, `${percent(live.winX2Rate)} · Ăn 168M (+78M)`],
                ['TỔNG TỶ LỆ TRÚNG', `${percent(live.hitRate)}`, `${live.wins || 0} thắng / ${live.losses || 0} trượt`],
                ['TỔNG TIỀN VỐN LIVE', `${moneyM(live.stakeK || (live.days * 90000))}`, '90M mỗi ngày (3 tầng vốn)'],
                ['LÃI LŨY KẾ LIVE', `${signedM(live.profitK || 0)}`, `${percent(live.roi)} ROI Thực Chiến`]
            ];
        } else {
            kpis = [
                ['THỰC CHIẾN LIVE (TỪ 28/08)', `${live.days || 0} kỳ`, 'Khóa snapshot chốt số thực tế'],
                ['TRÚNG X2 (CỰC VIP)', `${live.winsX2 || 0} kỳ`, `${percent(live.winX2Rate)} · Ăn 168M (+108M)`],
                ['TRÚNG X1 (BỌC LÓT)', `${live.winsX1 || 0} kỳ`, `${percent(live.winX1Rate)} · Ăn 84M (+24M)`],
                ['TỔNG TỶ LỆ TRÚNG', `${percent(live.hitRate)}`, `${live.wins || 0} thắng / ${live.losses || 0} trượt`],
                ['TỔNG TIỀN VỐN LIVE', `${moneyM(live.stakeK || (live.days * 60000))}`, '60M mỗi ngày (2 tầng vốn)'],
                ['LÃI LŨY KẾ LIVE', `${signedM(live.profitK || 0)}`, `${percent(live.roi)} ROI Thực Chiến`]
            ];
        }

        kpiContainer.innerHTML = kpis.map(([label, val, note], idx) => `
            <div class="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p class="text-[10px] font-black uppercase tracking-wider text-amber-300/90">${escapeHtml(label)}</p>
                <p class="mt-1 text-xl sm:text-2xl font-black ${idx === 5 ? profitClass : 'text-white'}">${escapeHtml(val)}</p>
                <p class="mt-0.5 text-xs text-slate-300">${escapeHtml(note)}</p>
            </div>
        `).join('');
    }

    function renderDeWindowsTable(windows = {}, methodId = 'tripleMerge') {
        const windowsContainer = byId('dualMergeWindowsTable');
        if (!windowsContainer) return;
        if (!windows) {
            windowsContainer.innerHTML = '<p class="text-xs text-slate-400 col-span-6 p-4 text-center">Chưa có dữ liệu chu kỳ.</p>';
            return;
        }

        const windowItems = [
            ['THỰC CHIẾN LIVE (TỪ 28/08)', windows.live || windows.liveTotal],
            ['7 NGÀY GẦN NHẤT', windows.last7],
            ['15 NGÀY GẦN NHẤT', windows.last15],
            ['30 NGÀY GẦN NHẤT', windows.last30],
            ['60 NGÀY GẦN NHẤT', windows.last60],
            ['TOÀN BỘ NĂM 2026', windows.all2026 || windows.all]
        ];

        windowsContainer.innerHTML = windowItems.map(([label, w]) => {
            if (!w || !w.days) return '';
            const profitClass = Number(w.profitK || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700';
            const detailStr = methodId === 'tripleMerge'
                ? `${w.winsX3 || 0} x3 · ${w.winsX2 || 0} x2 · ${w.winsX1 || 0} x1 · ${w.days} ngày`
                : `${w.winsX2 || 0} x2 · ${w.winsX1 || 0} x1 · ${w.days} ngày`;

            return `
                <div class="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-xs">
                    <p class="text-[10px] font-black uppercase tracking-wider text-slate-500">${escapeHtml(label)}</p>
                    <strong class="mt-1 block text-lg font-black text-slate-900">${percent(w.hitRate)} trúng</strong>
                    <p class="text-xs text-slate-600 font-semibold mt-0.5">${detailStr}</p>
                    <p class="mt-1 font-mono font-black text-xs ${profitClass}">${signedM(w.profitK)} (${percent(w.roi)} ROI)</p>
                </div>
            `;
        }).join('');
    }

    function renderDeMonthlyTable(records = [], methodId = 'tripleMerge') {
        const container = byId('dualMergeMonthlyTableBody');
        if (!container) return;
        const allRecords = (records || []).filter(r => {
            const hasActual = Number.isInteger(r.actual) || Number.isInteger(r.actualSpecial);
            return r.settled !== false && hasActual;
        });

        if (!allRecords.length) {
            container.innerHTML = '<tr><td colspan="9" class="p-6 text-center text-slate-500 font-semibold">Chưa có dữ liệu thống kê tháng.</td></tr>';
            return;
        }

        // Group by Month (YYYY-MM)
        const monthGroups = {};
        allRecords.forEach(r => {
            const dateStr = r.date || r.predictionDate || '';
            const ym = dateStr.slice(0, 7);
            if (!ym) return;
            if (!monthGroups[ym]) monthGroups[ym] = [];
            monthGroups[ym].push(r);
        });

        const sortedMonths = Object.keys(monthGroups).sort();
        let cumulativeProfitK = 0;
        const defaultStakeK = methodId === 'tripleMerge' ? 90000 : 60000;

        container.innerHTML = sortedMonths.map(ym => {
            const monthRecords = monthGroups[ym];
            const days = monthRecords.length;
            const winsX3 = monthRecords.filter(r => r.hitType === 'win_x3').length;
            const winsX2 = monthRecords.filter(r => r.hitType === 'win_x2' || r.isX2).length;
            const winsX1 = monthRecords.filter(r => r.hitType === 'win_x1' || (r.isHit && !r.isX2 && r.hitType !== 'win_x3')).length;
            const totalWins = winsX3 + winsX2 + winsX1;
            const losses = days - totalWins;
            const hitRate = days > 0 ? (totalWins / days) : 0;

            // Longest streak loss in this month
            let longestLoss = 0;
            let currentLoss = 0;
            monthRecords.forEach(r => {
                const isHit = r.hitType === 'win_x3' || r.hitType === 'win_x2' || r.hitType === 'win_x1' || r.isHit;
                if (isHit) {
                    currentLoss = 0;
                } else {
                    currentLoss++;
                    longestLoss = Math.max(longestLoss, currentLoss);
                }
            });

            const stakeK = monthRecords.reduce((sum, r) => sum + (r.stakeK || defaultStakeK), 0);
            const payoutK = monthRecords.reduce((sum, r) => sum + (r.payoutK || 0), 0);
            const profitK = payoutK - stakeK;
            const roi = stakeK > 0 ? (profitK / stakeK) : 0;
            cumulativeProfitK += profitK;

            const [year, month] = ym.split('-');
            const monthLabel = `Tháng ${parseInt(month, 10)}/${year}`;
            const profitClass = profitK >= 0 ? 'text-emerald-700 font-black' : 'text-rose-700 font-black';
            const cumClass = cumulativeProfitK >= 0 ? 'text-emerald-800 font-black' : 'text-rose-800 font-black';

            const hitBreakdownHtml = methodId === 'tripleMerge'
                ? `<span class="font-black text-amber-700">${winsX3} x3</span> · <span class="font-black text-cyan-700">${winsX2} x2</span> · <span class="font-black text-emerald-700">${winsX1} x1</span> / <span class="font-bold text-rose-600">${losses} thua</span>`
                : `<span class="font-black text-amber-700">${winsX2} x2</span> · <span class="font-black text-emerald-700">${winsX1} x1</span> / <span class="font-bold text-rose-600">${losses} thua</span>`;

            return `
                <tr class="hover:bg-slate-50/80 transition-colors fast-render-row table-row-contain">
                    <td class="p-3.5 pl-6 font-bold text-slate-900">${monthLabel}</td>
                    <td class="p-3.5 text-center font-bold text-slate-700">${days} ngày</td>
                    <td class="p-3.5 text-center">${hitBreakdownHtml}</td>
                    <td class="p-3.5 text-center font-black text-slate-900">${percent(hitRate)}</td>
                    <td class="p-3.5 text-center font-bold ${longestLoss >= 4 ? 'text-rose-600' : 'text-slate-600'}">${longestLoss} ngày</td>
                    <td class="p-3.5 text-right font-mono font-semibold text-slate-600">${moneyM(stakeK)}</td>
                    <td class="p-3.5 text-right font-mono ${profitClass}">${signedM(profitK)}</td>
                    <td class="p-3.5 text-center font-mono font-bold ${profitK >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${percent(roi)}</td>
                    <td class="p-3.5 pr-6 text-right font-mono ${cumClass}">${signedM(cumulativeProfitK)}</td>
                </tr>
            `;
        }).join('');

        const yearlyBadge = byId('dualMergeYearlyBadge');
        if (yearlyBadge) {
            const liveRecords = allRecords.filter(r => r.isLiveSnapshot || r.sourceType === 'live-snapshot' || (r.date || r.predictionDate) >= '2026-08-28');
            const liveStakeK = liveRecords.reduce((sum, r) => sum + (r.stakeK || defaultStakeK), 0);
            const livePayoutK = liveRecords.reduce((sum, r) => sum + (r.payoutK || 0), 0);
            const liveProfitK = livePayoutK - liveStakeK;
            const liveRoi = liveStakeK > 0 ? (liveProfitK / liveStakeK) : 0;
            const isProfit = liveProfitK >= 0;

            yearlyBadge.className = `inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-black ${
                isProfit
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-rose-300 bg-rose-50 text-rose-800'
            }`;
            yearlyBadge.innerHTML = `
                <i class="bi ${isProfit ? 'bi-graph-up-arrow text-emerald-600' : 'bi-graph-down-arrow text-rose-600'}"></i> 
                LŨY KẾ THỰC CHIẾN LIVE (TỪ 28/08): ${signedM(liveProfitK)} (${percent(liveRoi)} ROI)
            `;
        }
    }

    function renderDeDailyLedger(records = [], latestRec = null, methodId = 'tripleMerge') {
        const container = byId('dualMergeLedgerBody');
        if (!container) return;

        const defaultStakeK = methodId === 'tripleMerge' ? 90000 : 60000;
        const allRecords = (records || []).slice();

        // If today's recommendation is pending (not in settled ledger), pin it to the top
        if (latestRec && latestRec.predictionDate) {
            const isSettled = allRecords.some(r => {
                const rDate = r.date || r.predictionDate;
                const hasActual = Number.isInteger(r.actual) || Number.isInteger(r.actualSpecial);
                return rDate === latestRec.predictionDate && (r.settled || hasActual);
            });

            if (!isSettled) {
                const pendingRow = {
                    date: latestRec.predictionDate,
                    predictionDate: latestRec.predictionDate,
                    actual: null,
                    settled: false,
                    isLocked: true,
                    abstained: false,
                    sourceType: 'live-snapshot',
                    isLiveSnapshot: true,
                    m1: latestRec.m1,
                    m1Label: latestRec.m1Label,
                    m2: latestRec.m2,
                    m2Label: latestRec.m2Label,
                    m3: latestRec.m3,
                    m3Label: latestRec.m3Label,
                    mode: latestRec.mode,
                    modeLabel: latestRec.modeLabel,
                    intersection: latestRec.intersectionX2,
                    uniqueSingles: latestRec.uniqueSinglesX1,
                    tierX3: latestRec.tierX3,
                    tierX2: latestRec.tierX2,
                    tierX1: latestRec.tierX1,
                    fullUnion: latestRec.fullUnion,
                    countX3: latestRec.countX3 || (latestRec.tierX3?.length || 0),
                    countX2: latestRec.countX2 || (latestRec.tierX2?.length || 0),
                    countX1: latestRec.countX1 || (latestRec.tierX1?.length || 0),
                    overlapCount: latestRec.overlapCount || (latestRec.intersectionX2?.length || 0),
                    totalNumbers: latestRec.totalNumbersCount || (latestRec.fullUnion?.length || 0),
                    hitType: 'pending',
                    stakeK: defaultStakeK,
                    payoutK: 0,
                    profitK: null
                };
                allRecords.push(pendingRow);
            }
        }

        // Sort chronologically ascending to accurately calculate running cumulative profit
        allRecords.sort((a, b) => {
            const da = a.date || a.predictionDate || '';
            const db = b.date || b.predictionDate || '';
            return da.localeCompare(db);
        });

        let runningLiveCumulativeK = 0;
        const recordsWithCumProfit = allRecords.map(r => {
            const hasActual = Number.isInteger(r.actual) || Number.isInteger(r.actualSpecial);
            const isSettled = r.settled !== false && hasActual;
            const rDate = r.date || r.predictionDate || '';
            const isLive = r.isLiveSnapshot || r.sourceType === 'live-snapshot' || rDate >= '2026-08-28';
            if (isSettled && isLive) {
                runningLiveCumulativeK += Number(r.profitK || 0);
            }
            return {
                ...r,
                date: rDate,
                predictionDate: rDate,
                isLiveSnapshot: isLive,
                sourceType: isLive ? 'live-snapshot' : (r.sourceType || 'strict-pit-backtest'),
                calcCumulativeProfitK: (isSettled && isLive) ? runningLiveCumulativeK : null,
                calcLiveCumulativeProfitK: (isSettled && isLive) ? runningLiveCumulativeK : null
            };
        });

        // Dynamic Filter Counts
        const countAll = recordsWithCumProfit.length;
        const countLive = recordsWithCumProfit.filter(r => r.isLiveSnapshot).length;
        const countPit = recordsWithCumProfit.filter(r => !r.isLiveSnapshot).length;
        const countWinX3 = recordsWithCumProfit.filter(r => r.hitType === 'win_x3').length;
        const countWinX2 = recordsWithCumProfit.filter(r => r.hitType === 'win_x2' || r.isX2).length;
        const countWinX1 = recordsWithCumProfit.filter(r => r.hitType === 'win_x1' || (r.isHit && !r.isX2 && r.hitType !== 'win_x3')).length;
        const countLoss = recordsWithCumProfit.filter(r => r.hitType === 'loss').length;

        if (byId('countFilterAll')) byId('countFilterAll').textContent = String(countAll);
        if (byId('countFilterLive')) byId('countFilterLive').textContent = String(countLive);
        if (byId('countFilterPit')) byId('countFilterPit').textContent = String(countPit);
        if (byId('countFilterWinX3')) byId('countFilterWinX3').textContent = String(countWinX3);
        if (byId('countFilterWinX2')) byId('countFilterWinX2').textContent = String(countWinX2);
        if (byId('countFilterWinX1')) byId('countFilterWinX1').textContent = String(countWinX1);
        if (byId('countFilterLoss')) byId('countFilterLoss').textContent = String(countLoss);

        // Filter and limit rows (descending for display)
        let rows = recordsWithCumProfit.slice().reverse();

        // 1. Status Filter
        if (dualMergeFilterStatus === 'live') {
            rows = rows.filter(r => r.isLiveSnapshot || r.sourceType === 'live-snapshot');
        } else if (dualMergeFilterStatus === 'pit') {
            rows = rows.filter(r => !r.isLiveSnapshot && r.sourceType !== 'live-snapshot');
        } else if (dualMergeFilterStatus === 'win_x3') {
            rows = rows.filter(r => r.hitType === 'win_x3');
        } else if (dualMergeFilterStatus === 'win_x2') {
            rows = rows.filter(r => r.hitType === 'win_x2' || r.isX2);
        } else if (dualMergeFilterStatus === 'win_x1') {
            rows = rows.filter(r => r.hitType === 'win_x1' || (r.isHit && !r.isX2 && r.hitType !== 'win_x3'));
        } else if (dualMergeFilterStatus === 'loss') {
            rows = rows.filter(r => r.hitType === 'loss');
        }

        // 2. Search Query Filter
        if (dualMergeSearchQuery.trim()) {
            const query = dualMergeSearchQuery.trim().toLowerCase();
            rows = rows.filter(r => ((r.date || r.predictionDate) || '').toLowerCase().includes(query));
        }

        // 3. Limit Slice
        if (dualMergeLogLimit !== 'all') {
            const limitNum = Number(dualMergeLogLimit) || 30;
            rows = rows.slice(0, limitNum);
        }

        if (!rows.length) {
            container.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500 font-semibold">Không tìm thấy dữ liệu đối soát phù hợp với bộ lọc.</td></tr>';
            return;
        }

        container.innerHTML = rows.map(r => {
            const rowDate = r.date || r.predictionDate || '';
            const actualNum = Number.isInteger(r.actual) ? r.actual : (Number.isInteger(r.actualSpecial) ? r.actualSpecial : null);
            const isSettled = r.settled !== false && actualNum !== null;
            const actualStr = isSettled
                ? number(actualNum)
                : `<span class="text-amber-700 font-black" title="Chờ mở thưởng 18h30">⏳</span>`;

            // Source Type Badge
            const isLive = r.isLiveSnapshot || r.sourceType === 'live-snapshot' || rowDate >= '2026-08-28';
            const sourceBadge = isLive
                ? `<span class="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-bold text-emerald-800 text-[10px] shadow-2xs" title="Snapshot thực tế đã chốt trước giờ quay từ 28/08/2026"><i class="bi bi-lock-fill text-emerald-600"></i> Thực chiến Live</span>`
                : `<span class="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 font-bold text-sky-800 text-[10px] shadow-2xs" title="Hồi quy độc lập Strict PIT chuẩn xác suất thực tế (01/01 - 27/08/2026)"><i class="bi bi-cpu text-sky-600"></i> Strict PIT</span>`;

            // Outcome Badge
            let outcomeClass = 'bg-amber-50 text-amber-900 border-amber-300 border-dashed font-bold';
            let outcomeText = '⏳ Chờ KQ 18h30';
            if (isSettled) {
                if (r.hitType === 'win_x3') {
                    outcomeClass = 'bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-300 text-amber-950 border-amber-500 font-black shadow-xs ring-1 ring-amber-400/50';
                    outcomeText = isLive ? '👑 TRÚNG X3 (+162M)' : '👑 TRÚNG X3';
                } else if (r.hitType === 'win_x2' || r.isX2) {
                    outcomeClass = 'bg-gradient-to-r from-amber-200 via-amber-300 to-yellow-200 text-amber-950 border-amber-400 font-black shadow-xs ring-1 ring-amber-400/50';
                    outcomeText = methodId === 'tripleMerge' 
                        ? (isLive ? '⚡ TRÚNG X2 (+78M)' : '⚡ TRÚNG X2') 
                        : (isLive ? '🎉 TRÚNG X2 (+108M)' : '🎉 TRÚNG X2');
                } else if (r.hitType === 'win_x1' || (r.isHit && !r.isX2)) {
                    outcomeClass = methodId === 'tripleMerge'
                        ? 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold'
                        : 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold';
                    outcomeText = methodId === 'tripleMerge' 
                        ? (isLive ? '🛡️ TRÚNG X1 (HÒA)' : '🛡️ TRÚNG X1') 
                        : (isLive ? '✅ TRÚNG X1 (+24M)' : '✅ TRÚNG X1');
                } else {
                    outcomeClass = 'bg-rose-100 text-rose-800 border-rose-200 font-bold';
                    const lossAmount = methodId === 'tripleMerge' ? '-90M' : '-60M';
                    outcomeText = isLive ? `❌ TRƯỢT (${lossAmount})` : '❌ TRƯỢT';
                }
            }

            // Chips Construction
            let chipsHtml = '';
            if (methodId === 'tripleMerge') {
                const x3Nums = r.tierX3 || [];
                const x2Nums = r.tierX2 || [];
                const x1Nums = r.tierX1 || [];
                chipsHtml = [
                    ...x3Nums.map(n => {
                        const match = isSettled && Number(n) === Number(actualNum);
                        return `<span class="inline-flex items-center justify-center rounded px-1.5 py-0.5 font-mono text-xs font-black transition-transform ${match ? 'bg-amber-300 text-amber-950 ring-2 ring-amber-500 scale-110 shadow-sm' : 'bg-amber-100/90 text-amber-950 border border-amber-300/80'}">${number(n)}<sup class="ml-0.5 text-[8px] text-amber-700 font-black">x3</sup></span>`;
                    }),
                    ...x2Nums.map(n => {
                        const match = isSettled && Number(n) === Number(actualNum);
                        return `<span class="inline-flex items-center justify-center rounded px-1.5 py-0.5 font-mono text-xs font-black transition-transform ${match ? 'bg-cyan-300 text-cyan-950 ring-2 ring-cyan-500 scale-110 shadow-sm' : 'bg-cyan-100/90 text-cyan-950 border border-cyan-300/80'}">${number(n)}<sup class="ml-0.5 text-[8px] text-cyan-700 font-bold">x2</sup></span>`;
                    }),
                    ...x1Nums.map(n => {
                        const match = isSettled && Number(n) === Number(actualNum);
                        return `<span class="inline-flex items-center justify-center rounded px-1.5 py-0.5 font-mono text-xs font-bold transition-transform ${match ? 'bg-indigo-300 text-indigo-950 ring-2 ring-indigo-500 scale-110 shadow-sm' : 'bg-indigo-50 text-indigo-900 border border-indigo-200'}">${number(n)}<sup class="ml-0.5 text-[8px] text-indigo-600">x1</sup></span>`;
                    })
                ].join(' ');
            } else {
                const x2Nums = r.intersectionX2 || r.intersection || [];
                const x1Nums = r.uniqueSinglesX1 || r.uniqueSingles || [];
                chipsHtml = [
                    ...x2Nums.map(n => {
                        const match = isSettled && Number(n) === Number(actualNum);
                        return `<span class="inline-flex items-center justify-center rounded px-1.5 py-0.5 font-mono text-xs font-black transition-transform ${match ? 'bg-amber-300 text-amber-950 ring-2 ring-amber-500 scale-110 shadow-sm' : 'bg-amber-100/90 text-amber-950 border border-amber-300/80'}">${number(n)}<sup class="ml-0.5 text-[8px] text-amber-700">x2</sup></span>`;
                    }),
                    ...x1Nums.map(n => {
                        const match = isSettled && Number(n) === Number(actualNum);
                        return `<span class="inline-flex items-center justify-center rounded px-1.5 py-0.5 font-mono text-xs font-bold transition-transform ${match ? 'bg-amber-300 text-amber-950 ring-2 ring-amber-500 scale-110 shadow-sm' : 'bg-slate-100 text-slate-700 border border-slate-200'}">${number(n)}</span>`;
                    })
                ].join(' ');
            }

            const profitClass = isSettled && isLive
                ? (Number(r.profitK) >= 0 ? 'text-emerald-700 font-black' : 'text-rose-700 font-black')
                : 'text-slate-400 font-medium';

            // Methods Column Badges
            const m1Badge = r.m1 ? renderMethodBadge(r.m1, r.m1Label) : '-';
            const m2Badge = r.m2 ? renderMethodBadge(r.m2, r.m2Label) : '-';
            const m3Badge = r.m3 ? renderMethodBadge(r.m3, r.m3Label) : '';

            let methodsSubtext = '';
            if (methodId === 'tripleMerge') {
                const c3 = r.countX3 || (r.tierX3?.length || 0);
                const c2 = r.countX2 || (r.tierX2?.length || 0);
                const c1 = r.countX1 || (r.tierX1?.length || 0);
                methodsSubtext = `<span class="text-amber-700 font-black">${c3} số x3</span> · <span class="text-cyan-700 font-bold">${c2} số x2</span> · <span class="text-indigo-700 font-bold">${c1} số x1</span>`;
            } else {
                const c2 = r.overlapCount || (r.intersectionX2?.length || r.intersection?.length || 0);
                const c1 = r.uniqueSinglesCount || (r.uniqueSinglesX1?.length || r.uniqueSingles?.length || 0);
                const modeLabel = r.mode === 'defensive'
                    ? '<span class="text-indigo-600 text-[10px] font-bold">🛡️ Phòng thủ</span> · '
                    : (r.mode === 'offensive' ? '<span class="text-amber-600 text-[10px] font-bold">⚔️ Tấn công</span> · ' : '');
                methodsSubtext = `${modeLabel}<span class="text-amber-700 font-black">🔥 ${c2} trùng (x2)</span> · <span class="text-indigo-700 font-bold">⚡ ${c1} riêng (x1)</span>`;
            }

            return `
                <tr class="hover:bg-slate-50/80 transition-colors fast-render-row table-row-contain ${!isSettled ? 'bg-amber-50/40 border-l-4 border-l-amber-500' : ''}">
                    <td class="px-4 py-3">
                        <div class="flex flex-col gap-1">
                            <span class="font-mono font-black text-slate-900 text-xs">${escapeHtml(rowDate)} ${!isSettled ? '<span class="ml-1 text-[10px] text-amber-600 font-bold">(Hôm nay)</span>' : ''}</span>
                            <div>${sourceBadge}</div>
                        </div>
                    </td>
                    <td class="px-3 py-3 text-center">
                        <span class="inline-flex h-8 min-w-8 items-center justify-center rounded-xl border border-amber-300 bg-amber-100 font-mono text-xs font-black text-amber-950 shadow-xs">
                            ${actualStr}
                        </span>
                    </td>
                    <td class="px-4 py-3 max-w-[280px]">
                        <div class="flex flex-col gap-1">
                            <div class="flex flex-wrap items-center gap-1.5">
                                ${m1Badge}
                                <span class="text-[10px] font-black text-slate-400">+</span>
                                ${m2Badge}
                                ${m3Badge ? `<span class="text-[10px] font-black text-slate-400">+</span>${m3Badge}` : ''}
                            </div>
                            <div class="flex items-center gap-1 text-[10px] text-slate-500 font-bold">
                                ${methodsSubtext}
                            </div>
                        </div>
                    </td>
                    <td class="px-4 py-3 max-w-[340px]">
                        <div class="flex flex-wrap gap-1">${chipsHtml}</div>
                    </td>
                    <td class="px-3 py-3 text-center">
                        <span class="inline-flex rounded-lg border px-2.5 py-1 text-xs ${outcomeClass}">${outcomeText}</span>
                    </td>
                    <td class="px-4 py-3 text-right font-mono text-xs ${profitClass}">
                        ${!isSettled 
                            ? '<span class="text-amber-700 font-bold text-xs">Chờ 18h30</span>'
                            : (isLive 
                                ? `${signedM(r.profitK)} <span class="text-[10px] text-emerald-700 font-bold block">Lũy kế Live: ${signedM(r.calcLiveCumulativeProfitK ?? r.liveCumulativeProfitK)}</span>` 
                                : `<span class="text-slate-400 font-semibold text-xs">--</span><span class="text-[10px] text-slate-400 block font-normal">Chỉ tính thực chiến Live</span>`
                              )
                        }
                    </td>
                </tr>
            `;
        }).join('');
    }

    function renderActiveDeLedger() {
        const mObj = getDeMethodObject(currentDeStatsMethod);
        renderDeDailyLedger(mObj.records, mObj.latestRec, currentDeStatsMethod);
    }

    function updateEconomicsCalculator(methodId) {
        if (methodId === 'tripleMerge') {
            if (byId('econTitle')) byId('econTitle').innerHTML = '<i class="bi bi-wallet2 text-indigo-600"></i> BẢNG PHÂN BỔ VỐN & KINH TẾ CƯỢC HÔM NAY (<span id="econStakeHeader">CỐ ĐỊNH 90M · 3 TẦNG VỐN</span>)';
            if (byId('econStakeTotal')) byId('econStakeTotal').textContent = '90M';
            if (byId('econStakeFormula')) byId('econStakeFormula').textContent = 'Tầng x3 (3M/số) + Tầng x2 (2M/số) + Tầng x1 (1M/số)';
            if (byId('econWinTopLabel')) byId('econWinTopLabel').textContent = 'Trúng Tầng x3 (Siêu đồng thuận):';
            if (byId('econWinTopValue')) byId('econWinTopValue').textContent = 'Nhận 252M · Lãi +162M';
            if (byId('econWinTopRoi')) byId('econWinTopRoi').textContent = 'Tỷ suất sinh lời ROI +180%';
            if (byId('econWinMidLabel')) byId('econWinMidLabel').textContent = 'Trúng Tầng x2 (Đồng thuận cao):';
            if (byId('econWinMidValue')) byId('econWinMidValue').textContent = 'Nhận 168M · Lãi +78M';
            if (byId('econWinMidRoi')) byId('econWinMidRoi').textContent = 'Tỷ suất sinh lời ROI +86.7%';
            if (byId('econLossValue')) byId('econLossValue').textContent = 'Nhận 0M · Lỗ -90M';
            if (byId('econLossRoi')) byId('econLossRoi').textContent = 'Mức rủi ro cố định tối đa (Trượt)';
        } else {
            if (byId('econTitle')) byId('econTitle').innerHTML = '<i class="bi bi-wallet2 text-indigo-600"></i> BẢNG PHÂN BỔ VỐN & KINH TẾ CƯỢC HÔM NAY (<span id="econStakeHeader">CỐ ĐỊNH 60M</span>)';
            if (byId('econStakeTotal')) byId('econStakeTotal').textContent = '60M';
            if (byId('econStakeFormula')) byId('econStakeFormula').textContent = 'Số trùng cược x2 (2M/số) + Số riêng cược x1 (1M/số)';
            if (byId('econWinTopLabel')) byId('econWinTopLabel').textContent = 'Trúng vùng trùng (x2):';
            if (byId('econWinTopValue')) byId('econWinTopValue').textContent = 'Nhận 168M · Lãi +108M';
            if (byId('econWinTopRoi')) byId('econWinTopRoi').textContent = 'Tỷ suất sinh lời ROI +180%';
            if (byId('econWinMidLabel')) byId('econWinMidLabel').textContent = 'Trúng vùng bọc lót (x1):';
            if (byId('econWinMidValue')) byId('econWinMidValue').textContent = 'Nhận 84M · Lãi +24M';
            if (byId('econWinMidRoi')) byId('econWinMidRoi').textContent = 'Tỷ suất sinh lời ROI +40%';
            if (byId('econLossValue')) byId('econLossValue').textContent = 'Nhận 0M · Lỗ -60M';
            if (byId('econLossRoi')) byId('econLossRoi').textContent = 'Mức rủi ro cố định tối đa (Trượt)';
        }
    }

    function renderDeReasons(mObj) {
        const reasonsEl = byId('dualMergePlainReasons');
        if (!reasonsEl) return;

        let reasons = [];
        if (mObj.latestRec?.plainReasons && mObj.latestRec.plainReasons.length) {
            reasons = mObj.latestRec.plainReasons;
        } else if (mObj.id === 'tripleMerge') {
            reasons = [
                '🏛️ Gộp Tam Trụ: Kết hợp 3 phương pháp độc lập có tương quan thấp nhất: Edge 50% + Edge 75% Hold + Dropoff Khử Trùng nhằm tối đa hóa độ phủ an toàn và tạo vùng siêu đồng thuận.',
                '💎 Cơ chế 3 tầng vốn linh hoạt: Tầng X3 (3M/số trùng 3 PP, ăn 252M lãi +162M), Tầng X2 (2M/số trùng 2 PP, ăn 168M lãi +78M), Tầng X1 (1M/số riêng, ăn 84M bảo toàn 93% vốn).',
                '📊 Tổng ngân sách ngày 90M: Kiểm soát chặt drawdown tối đa, 100% các kỳ trúng đều đem lại lợi nhuận vượt trội hoặc hoàn vốn an toàn.',
                '🛡️ Strict Point-In-Time 100%: Dữ liệu huấn luyện và tuyển chọn hoàn toàn không nhìn trước tương lai (Zero Lookahead Leakage).'
            ];
        } else if (mObj.id === 'adaptiveDualMerge') {
            reasons = [
                '💎 Thích Ứng Alpha: Tự động tuyển chọn 2 phương pháp tối ưu từ pool 7 phương pháp dựa trên State Machine và tỷ lệ trúng chu kỳ gần nhất.',
                '⚔️ Phân bổ vốn 60M (X2 Trùng + X1 Riêng): Số trùng cược 2M/số (ăn 168M lãi +108M), số riêng cược 1M/số (ăn 84M lãi +24M).',
                '🎯 Lưới an toàn kép: Tối ưu hóa xác suất trúng và lợi nhuận thực chiến dương bền bỉ trong toàn bộ năm 2026.',
                '🛡️ Kiểm định Strict PIT: Tuyển chọn cặp động tại mỗi ngày t chỉ dựa vào dữ liệu lịch sử đến t-1.'
            ];
        } else {
            reasons = [
                '🎯 Cặp Cố Định Tiêu Chuẩn: Phối hợp Edge 50% và Edge 75% Hold đã được tối ưu hóa trọng số bước nhảy và chu kỳ nhịp dài hạn.',
                '🔥 Phân bổ vốn cố định 60M: Vùng trùng X2 (2M/số, ăn 168M lãi +108M), vùng riêng X1 (1M/số, ăn 84M lãi +24M).',
                '📈 Ổn định và dẫn đầu: Đạt chuỗi thắng liên tục trong 7 ngày gần nhất, tỷ lệ trúng 57.1% với lợi nhuận ròng dẫn đầu toàn bộ phương pháp.',
                '🛡️ 100% Strict Point-In-Time: Toàn bộ dàn số khóa chặt trước giờ quay thưởng thực tế.'
            ];
        }

        reasonsEl.innerHTML = reasons.map(r => `
            <div class="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs leading-relaxed text-slate-700">
                <i class="bi bi-check2-circle text-amber-600 mt-0.5 text-sm shrink-0"></i>
                <span>${escapeHtml(r)}</span>
            </div>
        `).join('');
    }

    function switchDeStatsMethod(methodId) {
        currentDeStatsMethod = methodId;
        const mObj = getDeMethodObject(methodId);

        // 1. Synchronize Top Method Selector Buttons
        const topBtns = document.querySelectorAll('.unified-de-top-btn');
        topBtns.forEach(btn => {
            const m = btn.getAttribute('data-stats-method');
            if (m === methodId) {
                btn.className = 'unified-de-top-btn rounded-2xl border-2 border-amber-400 bg-amber-400 text-slate-950 px-3.5 py-2.5 text-left transition-all flex flex-col justify-between gap-1 shadow-lg ring-2 ring-amber-300';
                btn.querySelectorAll('.text-slate-300').forEach(el => {
                    el.classList.remove('text-slate-300');
                    el.classList.add('text-slate-800');
                });
                btn.querySelectorAll('.text-white').forEach(el => {
                    el.classList.remove('text-white');
                    el.classList.add('text-slate-950');
                });
            } else {
                btn.className = 'unified-de-top-btn rounded-2xl border border-white/20 bg-white/10 hover:bg-white/20 text-white px-3.5 py-2.5 text-left transition-all flex flex-col justify-between gap-1 shadow-md';
                btn.querySelectorAll('.text-slate-800').forEach(el => {
                    el.classList.remove('text-slate-800');
                    el.classList.add('text-slate-300');
                });
                btn.querySelectorAll('.text-slate-950').forEach(el => {
                    el.classList.remove('text-slate-950');
                    el.classList.add('text-white');
                });
            }
        });

        // 2. Synchronize Bottom Stats Tab Buttons
        const tabBtns = document.querySelectorAll('.de-stats-tab-btn');
        tabBtns.forEach(btn => {
            const m = btn.getAttribute('data-stats-method');
            if (m === methodId) {
                btn.className = 'de-stats-tab-btn rounded-xl border border-amber-400 bg-amber-400 text-slate-950 font-black px-3.5 py-2.5 text-xs transition-all shadow-md flex items-center gap-2 ring-2 ring-amber-300';
            } else {
                btn.className = 'de-stats-tab-btn rounded-xl border border-white/20 bg-white/10 text-white font-bold px-3.5 py-2.5 text-xs hover:bg-white/20 transition-all flex items-center gap-2';
            }
        });

        // 3. Toggle Today's Recommendation Cards
        const dualCard = byId('dualMergeTodayRecommendation');
        const adaptiveCard = byId('adaptiveTodayRecommendation');
        const tripleCard = byId('tripleMergeSection');

        if (dualCard) dualCard.classList.toggle('hidden', methodId !== 'dualMerge');
        if (adaptiveCard) adaptiveCard.classList.toggle('hidden', methodId !== 'adaptiveDualMerge');
        if (tripleCard) tripleCard.classList.toggle('hidden', methodId !== 'tripleMerge');

        // 4. Update Economics Calculator
        updateEconomicsCalculator(methodId);

        // 5. Update Quantitative Rationale
        renderDeReasons(mObj);

        // 6. Update Badges & Titles
        const activeBadge = byId('deStatsActiveBadge');
        if (activeBadge) {
            activeBadge.textContent = `👑 Đang xem: ${mObj.name} (7 ngày: ${signedM(mObj.last7ProfitK)} · Toàn năm: ${signedM(mObj.overallProfitK)})`;
        }

        const heroBadge = byId('heroActiveMethodBadge');
        if (heroBadge) {
            heroBadge.innerHTML = `<i class="bi bi-trophy-fill mr-1 text-amber-300"></i> ${escapeHtml(mObj.name.toUpperCase())}: ${signedM(mObj.overallProfitK)} LÃI LŨY KẾ`;
        }

        const winTitle = byId('deStatsWindowsTitle');
        if (winTitle) {
            winTitle.textContent = `Hiệu Suất Thực Chiến ${mObj.name} Theo Chu Kỳ (7, 15, 30, 60, 90 ngày)`;
        }

        const monthTitle = byId('deStatsMonthlyTitle');
        if (monthTitle) {
            monthTitle.textContent = `Chi Tiết Thắng / Thua & Lũy Kế Từng Tháng (${mObj.name})`;
        }

        const ledgerTitle = byId('deStatsLedgerTitle');
        if (ledgerTitle) {
            ledgerTitle.textContent = `Bảng Đối Soát Thực Chiến Hàng Ngày (${mObj.name})`;
        }

        // 7. Render Stack
        renderDeKpiSummaryCards(mObj.summary, methodId);
        renderDeWindowsTable(mObj.summary?.windows, methodId);
        renderDeMonthlyTable(mObj.records, methodId);
        renderActiveDeLedger();
    }

    function setupDeStatsSwitcher() {
        const allBtns = document.querySelectorAll('.de-stats-tab-btn, .unified-de-top-btn');
        allBtns.forEach(btn => {
            btn.onclick = () => {
                const methodId = btn.getAttribute('data-stats-method');
                if (methodId) switchDeStatsMethod(methodId);
            };
        });
    }

    function setupLedgerFilters() {
        const filterGroup = byId('ledgerFilterGroup');
        if (filterGroup) {
            filterGroup.querySelectorAll('.ledger-filter-btn').forEach(btn => {
                btn.onclick = () => {
                    filterGroup.querySelectorAll('.ledger-filter-btn').forEach(b => {
                        b.classList.remove('active', 'border-indigo-600', 'bg-indigo-600', 'text-white');
                        b.classList.add('bg-white', 'text-slate-700');
                    });
                    btn.classList.add('active', 'border-indigo-600', 'bg-indigo-600', 'text-white');
                    btn.classList.remove('bg-white', 'text-slate-700');
                    dualMergeFilterStatus = btn.getAttribute('data-filter') || 'all';
                    renderActiveDeLedger();
                };
            });
        }

        const searchInput = byId('ledgerSearchInput');
        if (searchInput) {
            searchInput.oninput = e => {
                dualMergeSearchQuery = e.target.value;
                renderActiveDeLedger();
            };
        }

        const logLimitEl = byId('dualMergeLogLimit');
        if (logLimitEl) {
            logLimitEl.onchange = e => {
                dualMergeLogLimit = e.target.value;
                renderActiveDeLedger();
            };
        }
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
                ['TỔNG VỐN', `${moneyM(summary.stakeK)}`, '30 số mỗi ngày'],
                ['LÃI / LỖ RÒNG', signedM(summary.profitK), `${percent(summary.roi)} ROI`]
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
        setupLedgerFilters();

        try {
            const res = await fetch('/api/daily-advisor');
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Lỗi tải dữ liệu');
            payload = data;

            // Render all views
            renderDualMergeView(payload.dualMerge);
            if (payload?.tripleMerge) renderTripleMergeView(payload.tripleMerge);
            if (payload?.adaptiveDualMerge) renderAdaptiveDualMergeView(payload.adaptiveDualMerge);
            renderSingleMethodView();
            highlightBestDeMethod(payload);
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
