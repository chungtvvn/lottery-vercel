/**
 * public/js/de-tinh-gon.js
 * 
 * Logic tương tác cho chuyên trang Cố Vấn Đề Tinh Gọn & TriCore 24s:
 * - Tự động tải dữ liệu từ /api/de-tinh-gon
 * - Chuyển đổi linh hoạt giữa các cấu hình chiến lược
 * - Nút 1-click sao chép dàn số cược X2, X1 và toàn bộ dàn
 * - Bảng so sánh 2026 và bảng đa niên 5 năm
 * - Sổ cái đối soát lịch sử chi tiết
 */

(function () {
    'use strict';

    let currentReport = null;
    let activeStrategy = 'tri_paB'; // Mặc định TriCore PA B (Quán quân lợi nhuận +623M)
    let activeHorizon = '299'; // '299' (mốc chuẩn) hoặc '315' (toàn bộ)
    let ledgerLimit = 30;
    const expandedLedgerDates = new Set();
    const activeStratInSlip = {}; // { [date]: 'tri_paB' | 'tri_paD' | 'tri_paD2' | 'tri_base' | 'ss17_base' | 'ss15_base' }
    let ledgerMonthFilter = 'ALL';
    let ledgerOutcomeFilter = 'ALL';
    let ledgerParityFilter = 'ALL';
    let ledgerSearchVal = '';

    // Các cấu hình chiến lược hiển thị
    const STRATEGY_DEFINITIONS = {
        tri_paB: {
            id: 'tri_paB',
            name: 'TriCore 24s — Phương Án B (Tối Ưu Cùng Đầu)',
            badge: 'QUÁN QUÂN LÃI RÒNG 2026',
            badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
            profit: '+623 Triệu VNĐ',
            roi: '+6.8%',
            desc: 'Dồn hỏa lực cược X2 (2M) vào tất cả các số CÙNG ĐẦU. Các số CÙNG ĐÍT cược X1 (1M) làm dàn bảo hiểm.',
            getData: (rep) => {
                const tri = rep.today?.triCore?.paB || {};
                return {
                    x2: tri.x2 || [],
                    x1: tri.x1 || [],
                    removed: tri.removed || [],
                    stakeDesc: 'Cược X2 (2M/số) + X1 (1M/số) · Ăn X2 = 168M, Ăn X1 = 84M'
                };
            }
        },
        tri_paD: {
            id: 'tri_paD',
            name: 'TriCore 24s — Phương Án D (Siêu Rút Gọn Cùng Đầu)',
            badge: 'ROI KỶ LỤC +8.5%',
            badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300',
            profit: '+482 Triệu VNĐ',
            roi: '+8.5%',
            desc: 'CẮT BỎ HOÀN TOÀN CÙNG ĐÍT! Dàn siêu gọn ~12 số. X2: Trùng cả 2 (LL), X1: Cùng Đầu (LC). Tiết kiệm 40% vốn.',
            getData: (rep) => {
                const tri = rep.today?.triCore?.paD || {};
                return {
                    x2: tri.x2 || [],
                    x1: tri.x1 || [],
                    removed: tri.removed || [],
                    stakeDesc: 'Dàn siêu gọn ~12 số · X2: Trùng cả 2 (2M) · X1: Cùng Đầu (1M)'
                };
            }
        },
        ss17_base: {
            id: 'ss17_base',
            name: 'Đề Tinh Gọn Sweet-Spot 17s (Gốc)',
            badge: 'LÃI DƯƠNG 2026 (+149M)',
            badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
            profit: '+149 Triệu VNĐ',
            roi: '+1.72%',
            desc: 'Chiến lược tinh hoa từ 5 AI Consensus sau lọc Anti-Parity. 12 số VIP đầu bảng cược X2 (2M), 5 số tiếp theo cược X1 (1M).',
            getData: (rep) => {
                const ss = rep.today?.sweetSpot?.s17_base || {};
                return {
                    x2: ss.x2 || [],
                    x1: ss.x1 || [],
                    removed: ss.removed || [],
                    stakeDesc: 'Đúng 17 số cố định: 12 số VIP cược 2M + 5 số Lót cược 1M'
                };
            }
        },
        ss15_base: {
            id: 'ss15_base',
            name: 'Đề Tinh Gọn Sweet-Spot 15s (Cắt 2 số cuối)',
            badge: 'TIẾT KIỆM +1.75 TỶ/5 NĂM',
            badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
            profit: '-9M (Hòa vốn 2026)',
            roi: '-0.1%',
            desc: 'Cắt bỏ 2 số cuối ở vị trí #16 và #17 của dàn 17s. Tiết kiệm 2M vốn/ngày, chứng minh tiết kiệm ròng +1.75 tỷ sau 1,760 kỳ quay.',
            getData: (rep) => {
                const ss = rep.today?.sweetSpot?.s15_base || {};
                return {
                    x2: ss.x2 || [],
                    x1: ss.x1 || [],
                    cut2: ss.cut2 || [],
                    removed: ss.removed || [],
                    stakeDesc: 'Đúng 15 số cố định: 12 số VIP cược 2M + 3 số Lót cược 1M'
                };
            }
        },
        tri_paD2: {
            id: 'tri_paD2',
            name: 'TriCore 24s — Phương Án D2 (Dồn Hỏa Lực X2)',
            badge: 'LÃI RÒNG +660M · ROI +8.9%',
            badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
            profit: '+660 Triệu VNĐ',
            roi: '+8.9%',
            desc: 'Cắt bỏ Cùng Đít, toàn bộ ~12 số Cùng Đầu đều cược X2 (2M/số). Tận dụng tối đa xác suất 56.5% trúng Đầu.',
            getData: (rep) => {
                const tri = rep.today?.triCore?.paD2 || {};
                return {
                    x2: tri.x2 || [],
                    x1: tri.x1 || [],
                    removed: tri.removed || [],
                    stakeDesc: 'Toàn bộ ~12 số Cùng Đầu cược 2M/số (Ăn 168M, không cược X1)'
                };
            }
        }
    };

    /**
     * Tải dữ liệu từ API
     */
    async function fetchReport(forceRefresh = false) {
        try {
            const url = '/api/de-tinh-gon' + (forceRefresh ? '?refresh=1' : '');
            const res = await fetch(url);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (!data || !data.success) throw new Error(data?.error || 'Lỗi nạp dữ liệu');
            currentReport = data;
            renderAll();
        } catch (err) {
            console.error('[de-tinh-gon] Lỗi tải báo cáo:', err);
            const el = document.getElementById('todayStrategyContainer');
            if (el) {
                el.innerHTML = `
                    <div class="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-700">
                        <i class="bi bi-exclamation-triangle-fill text-3xl mb-2 inline-block"></i>
                        <p class="font-bold">Không thể tải dữ liệu Cố Vấn Đề Tinh Gọn.</p>
                        <p class="text-xs mt-1 text-rose-600">${err.message}</p>
                        <button onclick="window.location.reload()" class="mt-4 px-4 py-2 bg-rose-600 text-white font-bold rounded-xl text-xs hover:bg-rose-700">
                            Thử lại
                        </button>
                    </div>
                `;
            }
        }
    }

    /**
     * Hiển thị toàn bộ giao diện
     */
    function renderAll() {
        if (!currentReport) return;

        // 1. Cập nhật banner thời gian và dự đoán chẵn lẻ
        const p = currentReport.today?.parity || {};
        const dt = currentReport.today?.targetDate || '';
        document.getElementById('badgeTargetDate').textContent = 'Kỳ quay: ' + dt;
        document.getElementById('todayPredHead').textContent = p.predHeadVi || (p.predHead === 'CHAN' ? 'Đầu Chẵn' : 'Đầu Lẻ');
        document.getElementById('todayPredTail').textContent = p.predTailVi || (p.predTail === 'CHAN' ? 'Đít Chẵn' : 'Đít Lẻ');
        document.getElementById('todayOppForm').textContent = (p.oppFormVi || p.oppForm || 'Chẵn - Chẵn') + ' (' + (p.oppForm || 'CC') + ')';
        document.getElementById('lastUpdatedTime').textContent = 'Cập nhật lúc: ' + new Date(currentReport.generatedAt).toLocaleTimeString('vi-VN');

        // 2. Hiển thị chiến lược hôm nay đang được chọn
        renderActiveStrategy();

        // 3. Hiển thị bảng tổng kết 2026
        renderSummaryTable();

        // 3.1. Hiển thị bảng phân kỳ 11 tháng năm 2026
        renderMonthlyTable();

        // 4. Hiển thị bảng đa niên 5 năm
        renderMultiYearTable();

        // 5. Hiển thị sổ cái đối soát lịch sử
        renderLedgerTable();
    }

    /**
     * Hiển thị dàn số chiến lược đang chọn
     */
    function renderActiveStrategy() {
        const stratDef = STRATEGY_DEFINITIONS[activeStrategy];
        if (!stratDef) return;

        const container = document.getElementById('todayStrategyContainer');
        const data = stratDef.getData(currentReport);

        const x2List = data.x2 || [];
        const x1List = data.x1 || [];
        const cut2List = data.cut2 || [];
        const removedList = data.removed || [];

        const allNumbers = [...x2List, ...x1List];
        const allText = allNumbers.join(', ');
        const x2Text = x2List.join(', ');
        const x1Text = x1List.join(', ');

        const x2StakeM = x2List.length * 2;
        const x1StakeM = x1List.length * 1;
        const totalStakeM = x2StakeM + x1StakeM;

        let cut2Section = '';
        if (cut2List.length > 0) {
            cut2Section = `
                <div class="mt-4 pt-3 border-t border-purple-100 flex flex-wrap items-center gap-2">
                    <span class="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                        <i class="bi bi-scissors text-purple-600"></i> 2 Số X1 Bị Cắt Bỏ (#16, #17):
                    </span>
                    <div class="flex flex-wrap gap-1.5">
                        ${cut2List.map(n => `<span class="inline-flex items-center justify-center h-7 w-7 rounded-lg text-xs font-black bg-purple-100 text-purple-700 line-through decoration-purple-500 font-mono" title="Cắt bỏ số này">${n}</span>`).join('')}
                    </div>
                    <span class="text-[11px] text-purple-600 font-medium ml-2">(Tiết kiệm 2M/ngày · Tần suất nổ 5 năm chỉ 1.19%)</span>
                </div>
            `;
        }

        let removedSection = '';
        if (removedList.length > 0) {
            removedSection = `
                <div class="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    <span class="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                        <i class="bi bi-slash-circle text-rose-500"></i> Số Loại Trừ Bởi Anti-Parity:
                    </span>
                    <div class="flex flex-wrap gap-1.5">
                        ${removedList.map(n => `<span class="inline-flex items-center justify-center h-7 w-7 rounded-lg text-xs font-bold bg-slate-100 text-slate-400 line-through decoration-rose-400 font-mono" title="Bị loại vì thuộc dạng nghịch">${n}</span>`).join('')}
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 space-y-6">
                <!-- Header Card -->
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200/80">
                    <div>
                        <div class="flex items-center gap-2">
                            <h3 class="text-base font-black text-slate-900">${stratDef.name}</h3>
                            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black border ${stratDef.badgeClass}">
                                ${stratDef.badge}
                            </span>
                        </div>
                        <p class="text-xs text-slate-600 mt-1">${stratDef.desc}</p>
                    </div>

                    <div class="flex items-center gap-2">
                        <button onclick="window.copyToClipboard('${allText}', this)" class="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 text-xs font-black shadow-xs transition-all">
                            <i class="bi bi-clipboard-check"></i> Copy Trọn Dàn (${allNumbers.length}s)
                        </button>
                    </div>
                </div>

                <!-- Thống kê nhanh vốn & chỉ số -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="bg-white rounded-xl p-3 border border-slate-200">
                        <span class="text-[10px] font-bold text-slate-400 uppercase">Quy mô hôm nay</span>
                        <div class="text-lg font-black text-slate-900 font-mono">${allNumbers.length} số</div>
                        <span class="text-[10px] text-slate-500">${x2List.length} X2 + ${x1List.length} X1</span>
                    </div>

                    <div class="bg-white rounded-xl p-3 border border-slate-200">
                        <span class="text-[10px] font-bold text-slate-400 uppercase">Vốn cược dự kiến</span>
                        <div class="text-lg font-black text-amber-700 font-mono">${totalStakeM}M</div>
                        <span class="text-[10px] text-slate-500">${x2StakeM}M X2 + ${x1StakeM}M X1</span>
                    </div>

                    <div class="bg-white rounded-xl p-3 border border-slate-200">
                        <span class="text-[10px] font-bold text-slate-400 uppercase">Lãi ròng năm 2026</span>
                        <div class="text-lg font-black text-emerald-700 font-mono">${stratDef.profit}</div>
                        <span class="text-[10px] text-slate-500">299 kỳ quay</span>
                    </div>

                    <div class="bg-white rounded-xl p-3 border border-slate-200">
                        <span class="text-[10px] font-bold text-slate-400 uppercase">Tỷ suất ROI</span>
                        <div class="text-lg font-black text-indigo-700 font-mono">${stratDef.roi}</div>
                        <span class="text-[10px] text-slate-500">Trên vốn cược</span>
                    </div>
                </div>

                <!-- Dàn VIP X2 -->
                <div class="space-y-2">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500 text-white font-black text-[11px]">X2</span>
                            <span class="text-xs font-black text-slate-900 uppercase tracking-wider">
                                DÀN VIP X2 (${x2List.length} số) — Cược 2M / số · Ăn 168M
                            </span>
                        </div>
                        <button onclick="window.copyToClipboard('${x2Text}', this)" class="text-xs font-bold text-amber-700 hover:text-amber-900 inline-flex items-center gap-1">
                            <i class="bi bi-copy"></i> Chép X2
                        </button>
                    </div>

                    <div class="flex flex-wrap gap-2 p-3 bg-amber-50/60 rounded-xl border border-amber-200/80">
                        ${x2List.length > 0 ? x2List.map(n => `
                            <span class="badge-num inline-flex items-center justify-center h-9 w-9 rounded-xl font-mono text-sm font-black bg-gradient-to-tr from-amber-400 to-amber-500 text-amber-950 shadow-2xs border border-amber-300">
                                ${n}
                            </span>
                        `).join('') : '<span class="text-xs text-slate-400 italic">Không có số X2</span>'}
                    </div>
                </div>

                <!-- Dàn Lót X1 -->
                ${x1List.length > 0 ? `
                <div class="space-y-2">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-500 text-white font-black text-[11px]">X1</span>
                            <span class="text-xs font-black text-slate-900 uppercase tracking-wider">
                                DÀN LÓT BẢO HIỂM X1 (${x1List.length} số) — Cược 1M / số · Ăn 84M
                            </span>
                        </div>
                        <button onclick="window.copyToClipboard('${x1Text}', this)" class="text-xs font-bold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1">
                            <i class="bi bi-copy"></i> Chép X1
                        </button>
                    </div>

                    <div class="flex flex-wrap gap-2 p-3 bg-indigo-50/60 rounded-xl border border-indigo-200/80">
                        ${x1List.map(n => `
                            <span class="badge-num inline-flex items-center justify-center h-9 w-9 rounded-xl font-mono text-sm font-black bg-gradient-to-tr from-indigo-100 to-indigo-200 text-indigo-950 shadow-2xs border border-indigo-300">
                                ${n}
                            </span>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- Số cắt & số loại trừ -->
                ${cut2Section}
                ${removedSection}
            </div>
        `;
    }

    /**
     * Hiển thị bảng tổng kết 2026
     */
    function renderSummaryTable() {
        const tbody = document.getElementById('summaryTableBody');
        const titleEl = document.getElementById('summaryTableTitle');
        const subtitleEl = document.getElementById('summaryTableSubtitle');

        const is315 = activeHorizon === '315';
        const list = (is315 && currentReport.summaries315) 
            ? currentReport.summaries315 
            : (currentReport.summaries299 || currentReport.summaries || []);

        if (titleEl && subtitleEl) {
            if (is315) {
                titleEl.textContent = 'BẢNG SO SÁNH HIỆU NĂNG CÁC PHƯƠNG ÁN NĂM 2026 (TOÀN BỘ 315 KỲ LIVE)';
                subtitleEl.textContent = 'Toàn bộ 315 kỳ quay thực tế từ 01/01/2026 đến 15/11/2026 · Tỷ lệ 1 ăn 84 · X2 cược 2M (ăn 168M) / X1 cược 1M (ăn 84M)';
            } else {
                titleEl.textContent = 'BẢNG SO SÁNH HIỆU NĂNG CÁC PHƯƠNG ÁN NĂM 2026 (299 KỲ QUAY CHUẨN)';
                subtitleEl.textContent = 'Tập mẫu nghiên cứu chuẩn mực từ 01/01/2026 đến 30/10/2026 · Tỷ lệ 1 ăn 84 · X2 cược 2M (ăn 168M) / X1 cược 1M (ăn 84M)';
            }
        }

        // Cập nhật giao diện nút toggle horizon
        const btn299 = document.getElementById('btnHorizon299');
        const btn315 = document.getElementById('btnHorizon315');
        if (btn299 && btn315) {
            if (is315) {
                btn315.className = 'px-3.5 py-2 rounded-xl text-xs font-black transition-all bg-white text-indigo-900 shadow-xs border border-indigo-200';
                btn299.className = 'px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 transition-all';
            } else {
                btn299.className = 'px-3.5 py-2 rounded-xl text-xs font-black transition-all bg-white text-indigo-900 shadow-xs border border-indigo-200';
                btn315.className = 'px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 transition-all';
            }
        }

        if (!list.length) return;

        tbody.innerHTML = list.map(item => {
            const isProfit = item.profitM >= 0;
            const profitClass = isProfit ? 'text-emerald-700 font-black' : 'text-rose-600 font-bold';
            const roiClass = item.roi >= 0 ? 'text-emerald-700 font-black' : 'text-rose-600 font-bold';

            let badge = '';
            if (item.key === 'tri_paB') badge = '<span class="ml-1.5 px-2 py-0.5 rounded-md text-[9px] font-black bg-emerald-100 text-emerald-800">🥇 QUÁN QUÂN LÃI</span>';
            else if (item.key === 'tri_paD') badge = '<span class="ml-1.5 px-2 py-0.5 rounded-md text-[9px] font-black bg-indigo-100 text-indigo-800">🏆 ROI CAO NHẤT</span>';
            else if (item.key === 'ss17_base') badge = '<span class="ml-1.5 px-2 py-0.5 rounded-md text-[9px] font-black bg-amber-100 text-amber-800">💎 SWEET-SPOT AI</span>';

            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-3">
                        <div class="font-bold text-slate-900 flex items-center">
                            ${item.name}
                            ${badge}
                        </div>
                        <div class="text-[11px] text-slate-500 font-normal">${item.desc}</div>
                    </td>
                    <td class="p-3 text-center font-mono">${item.days} kỳ</td>
                    <td class="p-3 text-center font-mono font-bold">${item.wins} (${item.winRate}%)</td>
                    <td class="p-3 text-center font-mono text-xs">
                        <span class="text-amber-700 font-bold">${item.x2Wins} X2</span> / <span class="text-indigo-700">${item.x1Wins} X1</span>
                    </td>
                    <td class="p-3 text-right font-mono text-slate-600">${item.stakeM.toLocaleString('vi-VN')}M</td>
                    <td class="p-3 text-right font-mono text-slate-600">${item.payoutM.toLocaleString('vi-VN')}M</td>
                    <td class="p-3 text-right font-mono text-sm ${profitClass}">${item.profitFormatted}</td>
                    <td class="p-3 text-right font-mono text-sm ${roiClass}">${item.roiFormatted}</td>
                    <td class="p-3 text-center font-mono text-slate-500">${item.maxLossStreak} kỳ</td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Hiển thị bảng phân tích 11 tháng năm 2026
     */
    function renderMonthlyTable() {
        const tbody = document.getElementById('monthlyTableBody');
        if (!tbody) return;
        const list = currentReport.monthlyBreakdown || [];
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="p-6 text-center text-slate-400">Không có dữ liệu phân kỳ theo tháng</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(row => {
            const isTriBProfit = row.tri_paB.profitM >= 0;
            const triBProfitClass = isTriBProfit ? 'text-emerald-700 font-black' : 'text-rose-600 font-bold';
            const triBRoiClass = row.tri_paB.roi >= 0 ? 'text-emerald-700 font-black' : 'text-rose-600 font-bold';

            const isTriDProfit = row.tri_paD.profitM >= 0;
            const triDProfitClass = isTriDProfit ? 'text-emerald-700 font-black' : 'text-rose-600 font-bold';

            const isSSProfit = row.ss17_base.profitM >= 0;
            const ssProfitClass = isSSProfit ? 'text-emerald-700 font-black' : 'text-rose-600 font-bold';

            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-3 font-bold text-slate-900">${row.monthLabel}</td>
                    <td class="p-3 text-center font-mono">${row.days}</td>
                    <td class="p-3 text-center font-mono">
                        ${row.tri_paB.wins}/${row.days} <span class="text-[10px] text-slate-400">(${row.tri_paB.x2Wins}X2, ${row.tri_paB.x1Wins}X1)</span>
                    </td>
                    <td class="p-3 text-right font-mono ${triBProfitClass}">${row.tri_paB.profitFormatted}</td>
                    <td class="p-3 text-right font-mono ${triBRoiClass}">${row.tri_paB.roiFormatted}</td>
                    <td class="p-3 text-center font-mono">
                        ${row.tri_paD.wins}/${row.days} <span class="text-[10px] text-slate-400">(${row.tri_paD.x2Wins}X2, ${row.tri_paD.x1Wins}X1)</span>
                    </td>
                    <td class="p-3 text-right font-mono ${triDProfitClass}">${row.tri_paD.profitFormatted}</td>
                    <td class="p-3 text-right font-mono ${ssProfitClass}">${row.ss17_base.profitFormatted}</td>
                    <td class="p-3 text-xs text-slate-600 leading-snug max-w-md">${row.note}</td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Hiển thị bảng đa niên 5 năm
     */
    function renderMultiYearTable() {
        const tbody = document.getElementById('multiYearTableBody');
        const list = currentReport.multiYearStats || [];
        if (!list.length) return;

        tbody.innerHTML = list.map(row => {
            const isAll = row.year.includes('ALL') || row.year.includes('5 NĂM');
            const rowClass = isAll ? 'bg-amber-50/80 font-black' : 'hover:bg-slate-50';

            return `
                <tr class="${rowClass} transition-colors">
                    <td class="p-3 font-bold text-slate-900">${row.year}</td>
                    <td class="p-3 text-center font-mono">${row.days} kỳ</td>
                    <td class="p-3 text-right font-mono ${row.s17Profit >= 0 ? 'text-emerald-700' : 'text-slate-600'}">${row.s17Profit.toLocaleString('vi-VN')}M</td>
                    <td class="p-3 text-right font-mono ${row.s15Profit >= 0 ? 'text-emerald-700' : 'text-slate-600'}">${row.s15Profit.toLocaleString('vi-VN')}M</td>
                    <td class="p-3 text-right font-mono text-emerald-700">+${row.savedStake.toLocaleString('vi-VN')}M</td>
                    <td class="p-3 text-right font-mono text-rose-600">-${row.missedPayout.toLocaleString('vi-VN')}M</td>
                    <td class="p-3 text-right font-mono text-sm text-emerald-800 font-extrabold">+${row.netDiff.toLocaleString('vi-VN')}M</td>
                    <td class="p-3 text-center font-mono text-xs">
                        <span class="px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 font-bold">${row.cutHits} lần (${row.cutPct})</span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Lọc danh sách sổ cái theo các tiêu chí người dùng chọn
     */
    function getFilteredLedgerRows() {
        const allList = currentReport?.settledLedger || [];
        return allList.filter(row => {
            // Lọc tháng
            if (ledgerMonthFilter !== 'ALL') {
                if (!row.date.startsWith(ledgerMonthFilter)) return false;
            }
            // Lọc kết quả TriCore PA B
            if (ledgerOutcomeFilter !== 'ALL') {
                const b = row.triCore?.paB;
                if (ledgerOutcomeFilter === 'WIN_ANY' && !b?.isHit) return false;
                if (ledgerOutcomeFilter === 'WIN_X2' && !b?.isX2) return false;
                if (ledgerOutcomeFilter === 'WIN_X1' && !b?.isX1) return false;
                if (ledgerOutcomeFilter === 'LOSS' && b?.isHit) return false;
            }
            // Lọc dạng Chẵn/Lẻ
            if (ledgerParityFilter !== 'ALL') {
                if (row.predForm !== ledgerParityFilter) return false;
            }
            // Lọc tìm kiếm
            if (ledgerSearchVal) {
                const s = ledgerSearchVal.toLowerCase();
                const matchDate = row.date.toLowerCase().includes(s);
                const matchAct = String(row.actualSpecial).toLowerCase().includes(s);
                if (!matchDate && !matchAct) return false;
            }
            return true;
        });
    }

    /**
     * Render phiếu cược đối soát chi tiết của một ngày (Interactive Accordion Slip)
     */
    function renderDetailSlipHtml(row) {
        const date = row.date;
        const act = row.actualSpecial;
        const pForm = row.predForm;
        const oppForm = row.oppForm;
        const pHead = row.predHead;

        const curStrat = activeStratInSlip[date] || 'tri_paB';

        const STRAT_TABS = [
            { id: 'tri_paB', name: 'TriCore PA B (Tối Ưu)', icon: '🏛️', badge: 'Lãi +623M' },
            { id: 'tri_paD', name: 'TriCore PA D (Rút Gọn)', icon: '⚡', badge: 'ROI +8.5%' },
            { id: 'tri_paD2', name: 'TriCore PA D2 (Dồn X2)', icon: '🔥', badge: 'Lãi +660M' },
            { id: 'ss17_base', name: 'Sweet-Spot 17s (Gốc)', icon: '💎', badge: 'Lãi +149M' },
            { id: 'ss15_base', name: 'Sweet-Spot 15s (Cắt 2s)', icon: '🎯', badge: '+1.75 Tỷ/5N' },
            { id: 'tri_base', name: 'TriCore Gốc (Sau Lọc)', icon: '📐', badge: '18s' }
        ];

        // Trích xuất cấu hình chiến lược hiện tại
        let stratData = null;
        let x2List = [];
        let x1List = [];
        let removedList = [];
        let cutList = [];
        let isHit = false;
        let isX2 = false;
        let isX1 = false;
        let stakeK = 0;
        let payoutK = 0;
        let profitK = 0;

        if (curStrat === 'tri_paB') {
            stratData = row.triCore?.paB;
            x2List = stratData?.x2 || [];
            x1List = stratData?.x1 || [];
            removedList = row.triCore?.removedNumbers || [];
        } else if (curStrat === 'tri_paD') {
            stratData = row.triCore?.paD;
            x2List = stratData?.x2 || [];
            x1List = stratData?.x1 || [];
            removedList = row.triCore?.removedNumbers || [];
        } else if (curStrat === 'tri_paD2') {
            stratData = row.triCore?.paD2;
            x2List = stratData?.x2 || [];
            x1List = [];
            removedList = row.triCore?.removedNumbers || [];
        } else if (curStrat === 'tri_base') {
            stratData = row.triCore?.base;
            x2List = stratData?.x2 || [];
            x1List = stratData?.x1 || [];
            removedList = row.triCore?.removedNumbers || [];
        } else if (curStrat === 'ss17_base') {
            stratData = row.sweetSpot?.s17_base;
            x2List = stratData?.x2 || [];
            x1List = stratData?.x1 || [];
            removedList = row.sweetSpot?.removedNumbers || [];
        } else if (curStrat === 'ss15_base') {
            stratData = row.sweetSpot?.s15_base;
            x2List = stratData?.x2 || [];
            x1List = stratData?.x1 || [];
            cutList = row.sweetSpot?.cut2 || [];
            removedList = row.sweetSpot?.removedNumbers || [];
        }

        if (stratData) {
            isHit = stratData.isHit;
            isX2 = stratData.isX2;
            isX1 = stratData.isX1;
            stakeK = stratData.stakeK || 0;
            payoutK = stratData.payoutK || 0;
            profitK = stratData.profitK || 0;
        }

        const allNumbersToCopy = [...x2List, ...x1List].join(' ');
        const profitClass = profitK > 0 ? 'text-emerald-700 font-black' : (profitK < 0 ? 'text-rose-600 font-bold' : 'text-slate-600');
        const profitSign = profitK > 0 ? '+' : '';

        // Kiểm tra xem số đặc biệt có rơi vào số bị loại trừ hoặc bị cắt không
        const isRemovedHit = removedList.includes(act);
        const isCutHit = cutList.includes(act);

        return `
            <div class="p-4 sm:p-5 bg-gradient-to-br from-slate-50 via-white to-amber-50/25 rounded-2xl border border-amber-200/70 shadow-sm my-2 text-left">
                <!-- THANH CHUYỂN TAB CẤU HÌNH TRONG NGÀY -->
                <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wide mr-1">
                            <i class="bi bi-gear-wide-connected text-amber-600"></i> Xem Phiếu Cược:
                        </span>
                        ${STRAT_TABS.map(tab => {
                            const isCur = tab.id === curStrat;
                            return `
                                <button type="button" class="btn-slip-strat px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs ${isCur ? 'bg-amber-600 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'}" data-date="${date}" data-strat="${tab.id}">
                                    <span>${tab.icon}</span>
                                    <span>${tab.name}</span>
                                    <span class="text-[10px] opacity-80 font-mono">(${tab.badge})</span>
                                </button>
                            `;
                        }).join('')}
                    </div>

                    <div class="flex items-center gap-2">
                        <button type="button" class="btn-copy-day-slip px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs transition cursor-pointer flex items-center gap-1 shadow-2xs" data-text="${allNumbersToCopy}">
                            <i class="bi bi-clipboard-check"></i> Copy Dàn Đánh (${x2List.length + x1List.length} số)
                        </button>
                    </div>
                </div>

                <!-- TÓM TẮT TÀI CHÍNH VÀ ĐỐI SOÁT NGÀY ĐÓ -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3.5 p-3 bg-white rounded-xl border border-slate-200 text-xs shadow-2xs">
                    <div>
                        <span class="text-slate-400 block text-[10px] font-bold uppercase">Giải Đặc Biệt Thực Tế</span>
                        <div class="flex items-center gap-1.5 mt-0.5">
                            <span class="inline-flex items-center justify-center h-6 w-6 rounded bg-slate-900 text-white font-mono font-black text-xs shadow-2xs">
                                ${act}
                            </span>
                            <span class="font-bold text-slate-700">${pForm} (${pHead === 'C' ? 'Đầu Chẵn' : 'Đầu Lẻ'})</span>
                        </div>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-[10px] font-bold uppercase">Dạng Đối Lập Loại Trừ</span>
                        <div class="mt-0.5 font-bold text-rose-700">
                            ${oppForm} (Đã cắt ${removedList.length} số)
                        </div>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-[10px] font-bold uppercase">Tổng Vốn Cược Ngày</span>
                        <div class="mt-0.5 font-mono font-bold text-slate-800">
                            ${Math.round(stakeK / 1000)} Triệu VNĐ
                        </div>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-[10px] font-bold uppercase">Kết Quả &amp; Lợi Nhuận</span>
                        <div class="mt-0.5 font-mono ${profitClass}">
                            ${isX2 ? '👑 ĂN X2 (+168M)' : (isX1 ? '⭐ ĂN X1 (+84M)' : '❌ TRƯỢT')}
                            · <strong>${profitSign}${Math.round(profitK / 1000)}M</strong>
                        </div>
                    </div>
                </div>

                <!-- CHI TIẾT CÁC TẦNG SỐ: VIP X2, LÓT X1, BỊ LOẠI TRỪ, BỊ CẮT -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <!-- KHỐI 1: CÁC SỐ CƯỢC THỰC CHIẾN -->
                    <div class="rounded-xl border border-emerald-200 bg-white p-3.5 space-y-3 shadow-2xs">
                        <!-- Tầng VIP X2 -->
                        <div>
                            <div class="flex items-center justify-between text-[11px] font-bold text-amber-900 mb-1.5">
                                <span class="flex items-center gap-1">
                                    <span class="w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-black text-[9px] flex items-center justify-center">2</span>
                                    <span>TẦNG VIP X2 (${x2List.length} số · Cược 2M · Ăn 168M):</span>
                                </span>
                                <span class="text-[10px] text-amber-700 font-mono">Vốn ${x2List.length * 2}M</span>
                            </div>
                            <div class="flex flex-wrap gap-1 p-2 rounded-lg bg-amber-50/60 border border-amber-200 min-h-[38px] items-center">
                                ${x2List.length === 0 ? '<span class="text-slate-400 text-xs italic">Không có số</span>' : x2List.map(n => {
                                    const isWin = n === act;
                                    return `
                                        <span class="inline-flex items-center justify-center px-2 py-0.5 rounded font-mono text-xs font-black transition-all ${isWin ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-600 shadow-md animate-pulse font-black' : 'bg-white text-slate-900 border border-amber-300'}" title="${isWin ? '👑 SỐ TRÚNG ĐẶC BIỆT ĂN X2 (+168M)' : 'VIP X2: ' + n}">
                                            ${n}${isWin ? ' 👑' : ''}
                                        </span>
                                    `;
                                }).join('')}
                            </div>
                        </div>

                        <!-- Tầng Lót X1 -->
                        ${x1List.length > 0 ? `
                            <div>
                                <div class="flex items-center justify-between text-[11px] font-bold text-indigo-900 mb-1.5">
                                    <span class="flex items-center gap-1">
                                        <span class="w-4 h-4 rounded-full bg-indigo-500 text-white font-black text-[9px] flex items-center justify-center">1</span>
                                        <span>TẦNG LÓT X1 (${x1List.length} số · Cược 1M · Ăn 84M):</span>
                                    </span>
                                    <span class="text-[10px] text-indigo-700 font-mono">Vốn ${x1List.length}M</span>
                                </div>
                                <div class="flex flex-wrap gap-1 p-2 rounded-lg bg-indigo-50/50 border border-indigo-200 min-h-[38px] items-center">
                                    ${x1List.map(n => {
                                        const isWin = n === act;
                                        return `
                                            <span class="inline-flex items-center justify-center px-2 py-0.5 rounded font-mono text-xs font-bold transition-all ${isWin ? 'bg-emerald-400 text-slate-950 ring-2 ring-emerald-600 shadow-md animate-pulse font-black' : 'bg-white text-indigo-950 border border-indigo-200'}" title="${isWin ? '⭐ SỐ TRÚNG ĐẶC BIỆT ĂN X1 (+84M)' : 'Lót X1: ' + n}">
                                                ${n}${isWin ? ' ⭐' : ''}
                                            </span>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>

                    <!-- KHỐI 2: CÁC SỐ BỊ LOẠI TRỪ / CẮT BỎ -->
                    <div class="rounded-xl border border-rose-200 bg-white p-3.5 space-y-3 shadow-2xs">
                        <!-- Số Bị Loại Trừ Anti-Parity -->
                        <div>
                            <div class="flex items-center justify-between text-[11px] font-bold text-rose-900 mb-1.5">
                                <span class="flex items-center gap-1">
                                    <span class="w-4 h-4 rounded-full bg-rose-600 text-white font-black text-[9px] flex items-center justify-center">✕</span>
                                    <span>LOẠI TRỪ CỰC NGHỊCH DẠNG ${oppForm} (${removedList.length} số):</span>
                                </span>
                                <span class="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                    Tiết kiệm +${removedList.length}M
                                </span>
                            </div>
                            <div class="flex flex-wrap gap-1 p-2 rounded-lg bg-rose-50/50 border border-rose-200 min-h-[38px] items-center">
                                ${removedList.length === 0 ? '<span class="text-slate-400 text-xs italic">Không loại trừ số nào</span>' : removedList.map(n => {
                                    const isWin = n === act;
                                    return `
                                        <span class="inline-flex items-center justify-center px-1.5 py-0.5 rounded font-mono text-xs ${isWin ? 'bg-rose-600 text-white font-black ring-2 ring-rose-700 shadow-md' : 'bg-white text-rose-500 line-through border border-rose-200'}" title="${isWin ? '⚠️ ĐẶC BIỆT VỀ CON BỊ LOẠI NÀY: ' + n : 'Loại trừ ' + oppForm + ': ' + n}">
                                            ${n}${isWin ? ' ⚠️' : ''}
                                        </span>
                                    `;
                                }).join('')}
                            </div>
                            ${isRemovedHit ? `
                                <div class="mt-1.5 p-2 rounded-lg bg-rose-100 text-rose-900 text-[11px] font-bold border border-rose-300 flex items-center gap-1.5">
                                    <i class="bi bi-exclamation-triangle-fill text-rose-600"></i>
                                    <span>Kỳ này ĐB về con <strong>${act}</strong> thuộc dạng đối lập <strong>${oppForm}</strong> nên bị loại trừ đúng nguyên tắc.</span>
                                </div>
                            ` : ''}
                        </div>

                        <!-- 2 Số Bị Cắt Của Dàn 15s (nếu xem tab dàn 15s) -->
                        ${cutList.length > 0 ? `
                            <div>
                                <div class="flex items-center justify-between text-[11px] font-bold text-purple-900 mb-1.5">
                                    <span class="flex items-center gap-1">
                                        <span class="w-4 h-4 rounded-full bg-purple-600 text-white font-black text-[9px] flex items-center justify-center">✂</span>
                                        <span>2 SỐ CUỐI X1 BỊ CẮT BỎ (#16, #17):</span>
                                    </span>
                                    <span class="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                        Tiết kiệm +2M/ngày
                                    </span>
                                </div>
                                <div class="flex flex-wrap gap-1 p-2 rounded-lg bg-purple-50/50 border border-purple-200 min-h-[38px] items-center">
                                    ${cutList.map(n => {
                                        const isWin = n === act;
                                        return `
                                            <span class="inline-flex items-center justify-center px-2 py-0.5 rounded font-mono text-xs font-bold ${isWin ? 'bg-purple-600 text-white font-black ring-2 ring-purple-700' : 'bg-white text-purple-600 line-through border border-purple-200'}" title="${isWin ? '⚠️ ĐẶC BIỆT VỀ CON BỊ CẮT NÀY: ' + n : 'Số bị cắt: ' + n}">
                                                ${n}${isWin ? ' ⚠️' : ''}
                                            </span>
                                        `;
                                    }).join('')}
                                </div>
                                ${isCutHit ? `
                                    <div class="mt-1.5 p-2 rounded-lg bg-purple-100 text-purple-900 text-[11px] font-bold border border-purple-300 flex items-center gap-1.5">
                                        <i class="bi bi-info-circle-fill text-purple-600"></i>
                                        <span>ĐB về con <strong>${act}</strong> nằm trong 2 số cắt giảm. Việc cắt 2 con này đã chứng minh tiết kiệm ròng +1.75 tỷ qua 5 năm.</span>
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}
                    </div>
                </div>

                <div class="mt-3 text-[11px] text-slate-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 pt-2 border-t border-slate-200">
                    <span class="italic">
                        <i class="bi bi-shield-lock-fill text-emerald-600"></i> Dàn số chốt tự động lúc 17:45 ngày ${date} theo chuẩn 100% Strict Point-In-Time.
                    </span>
                    <span class="font-mono text-slate-400">Tỷ lệ cược XSMB: 1 ăn 84 (X2 = 168M, X1 = 84M)</span>
                </div>
            </div>
        `;
    }

    /**
     * Gắn sự kiện tương tác cho các hàng trong bảng sổ cái đối soát
     */
    function attachLedgerEventListeners() {
        const tbody = document.getElementById('ledgerTableBody');
        if (!tbody) return;

        // Toggle expand hàng chính
        tbody.querySelectorAll('.ledger-main-row').forEach(rowEl => {
            rowEl.addEventListener('click', (e) => {
                // Nếu click vào nút copy thì không toggle
                if (e.target.closest('.btn-copy-day-slip')) return;
                const d = rowEl.getAttribute('data-date');
                if (!d) return;
                if (expandedLedgerDates.has(d)) {
                    expandedLedgerDates.delete(d);
                } else {
                    expandedLedgerDates.add(d);
                }
                renderLedgerTable();
            });
        });

        // Chuyển tab chiến lược bên trong phiếu cược chi tiết
        tbody.querySelectorAll('.btn-slip-strat').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const d = btn.getAttribute('data-date');
                const strat = btn.getAttribute('data-strat');
                if (d && strat) {
                    activeStratInSlip[d] = strat;
                    renderLedgerTable();
                }
            });
        });

        // Nút sao chép dàn đánh trong phiếu cược
        tbody.querySelectorAll('.btn-copy-day-slip').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = btn.getAttribute('data-text');
                if (text) {
                    window.copyToClipboard(text, btn);
                }
            });
        });
    }

    /**
     * Hiển thị sổ cái đối soát lịch sử chi tiết
     */
    function renderLedgerTable() {
        const tbody = document.getElementById('ledgerTableBody');
        const countBadge = document.getElementById('ledgerCountBadge');
        const pagingInfo = document.getElementById('ledgerPagingInfo');
        const allList = currentReport?.settledLedger || [];
        const filtered = getFilteredLedgerRows();

        if (countBadge) {
            countBadge.textContent = `${filtered.length} / ${allList.length} Kỳ Đánh`;
        }
        if (pagingInfo) {
            pagingInfo.textContent = `Hiển thị ${Math.min(ledgerLimit, filtered.length)} / ${filtered.length} ngày (Tổng ${allList.length} kỳ đối soát)`;
        }

        const slice = filtered.slice(0, ledgerLimit);

        if (slice.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-slate-400">Không tìm thấy ngày nào khớp với tiêu chí lọc.</td></tr>`;
            return;
        }

        const formatHitBadge = (res) => {
            if (!res) return '<span class="text-slate-300">-</span>';
            if (res.isX2) return '<span class="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">ĂN X2 (+168M)</span>';
            if (res.isX1) return '<span class="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-100 text-indigo-900 border border-indigo-300 shadow-2xs">ĂN X1 (+84M)</span>';
            return '<span class="px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-400">Trượt</span>';
        };

        let html = '';
        slice.forEach((row, idx) => {
            const act = row.actualSpecial;
            const predForm = row.predForm;
            const triB = row.triCore?.paB;
            const triD = row.triCore?.paD;
            const ss17 = row.sweetSpot?.s17_base;
            const ss15 = row.sweetSpot?.s15_base;
            const isExpanded = expandedLedgerDates.has(row.date);

            const accumM = row.accumProfitM?.tri_paB ?? 0;
            const accumClass = accumM >= 0 ? 'text-emerald-700 font-black' : 'text-rose-600 font-bold';

            html += `
                <tr class="ledger-main-row hover:bg-amber-50/40 transition-colors cursor-pointer ${isExpanded ? 'bg-amber-50/30' : ''}" data-date="${row.date}">
                    <td class="p-3 text-center text-slate-400 font-mono text-xs">${idx + 1}</td>
                    <td class="p-3 font-mono font-bold text-slate-900 whitespace-nowrap">${row.date}</td>
                    <td class="p-3 text-center">
                        <span class="inline-flex items-center justify-center h-7 w-7 rounded-lg font-mono font-black text-xs bg-slate-900 text-white shadow-2xs">
                            ${act}
                        </span>
                    </td>
                    <td class="p-3 text-center">
                        <span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700 font-mono">${predForm}</span>
                    </td>
                    <td class="p-3 text-center">${formatHitBadge(triB)}</td>
                    <td class="p-3 text-center">${formatHitBadge(triD)}</td>
                    <td class="p-3 text-center">${formatHitBadge(ss17)}</td>
                    <td class="p-3 text-center">${formatHitBadge(ss15)}</td>
                    <td class="p-3 text-right font-mono ${accumClass}">
                        ${accumM >= 0 ? '+' : ''}${accumM}M
                    </td>
                    <td class="p-3 text-center">
                        <button type="button" class="btn-toggle-slip px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 mx-auto shadow-2xs ${isExpanded ? 'bg-slate-800 text-white' : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'}" data-date="${row.date}">
                            <i class="bi ${isExpanded ? 'bi-chevron-up' : 'bi-eye'}"></i>
                            <span>${isExpanded ? 'Đóng' : 'Chi Tiết'}</span>
                        </button>
                    </td>
                </tr>
            `;

            if (isExpanded) {
                html += `
                    <tr class="ledger-detail-row bg-slate-50/50" data-detail-date="${row.date}">
                        <td colspan="10" class="p-2 sm:p-4">
                            ${renderDetailSlipHtml(row)}
                        </td>
                    </tr>
                `;
            }
        });

        tbody.innerHTML = html;

        // Cập nhật trạng thái nút xem thêm
        const loadMoreBtn = document.getElementById('btnLoadMoreLedger');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = slice.length >= filtered.length ? 'none' : 'block';
        }
        const loadAllBottomBtn = document.getElementById('btnLoadAllLedgerBottom');
        if (loadAllBottomBtn) {
            loadAllBottomBtn.style.display = slice.length >= filtered.length ? 'none' : 'block';
        }

        // Cập nhật text nút Toggle All
        const btnToggleAll = document.getElementById('btnToggleAllLedger');
        const textToggleAll = document.getElementById('textToggleAllLedger');
        const iconToggleAll = document.getElementById('iconToggleAllLedger');
        if (btnToggleAll && textToggleAll && iconToggleAll) {
            const visibleDates = slice.map(r => r.date);
            const isAllExp = visibleDates.length > 0 && visibleDates.every(d => expandedLedgerDates.has(d));
            textToggleAll.textContent = isAllExp ? 'Thu Gọn Tất Cả' : 'Mở Rộng Tất Cả Phiếu';
            iconToggleAll.className = isAllExp ? 'bi bi-arrows-collapse' : 'bi bi-arrows-expand';
        }

        attachLedgerEventListeners();
    }

    /**
     * Đăng ký sự kiện
     */
    function setupEvents() {
        // Chuyển tab chiến lược
        const tabBtns = document.querySelectorAll('.strat-tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => {
                    b.classList.remove('active', 'bg-white', 'text-slate-900', 'shadow-2xs');
                    b.classList.add('text-slate-600');
                });
                btn.classList.add('active', 'bg-white', 'text-slate-900', 'shadow-2xs');
                btn.classList.remove('text-slate-600');

                activeStrategy = btn.getAttribute('data-strat');
                renderActiveStrategy();
            });
        });

        // Chuyển mốc thời gian kiểm định (299 kỳ chuẩn vs 315 kỳ toàn bộ)
        document.getElementById('btnHorizon299')?.addEventListener('click', () => {
            activeHorizon = '299';
            renderSummaryTable();
        });

        document.getElementById('btnHorizon315')?.addEventListener('click', () => {
            activeHorizon = '315';
            renderSummaryTable();
        });

        // Nút Cập nhật dữ liệu
        document.getElementById('btnRefreshData')?.addEventListener('click', () => {
            const btn = document.getElementById('btnRefreshData');
            btn.innerHTML = '<i class="bi bi-arrow-clockwise animate-spin"></i> Đang tải...';
            btn.disabled = true;
            fetchReport(true).finally(() => {
                btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Cập Nhật Dữ Liệu';
                btn.disabled = false;
            });
        });

        // Bộ lọc tháng
        document.getElementById('ledgerMonthFilter')?.addEventListener('change', (e) => {
            ledgerMonthFilter = e.target.value;
            ledgerLimit = 30;
            renderLedgerTable();
        });

        // Bộ lọc kết quả
        document.getElementById('ledgerOutcomeFilter')?.addEventListener('change', (e) => {
            ledgerOutcomeFilter = e.target.value;
            ledgerLimit = 30;
            renderLedgerTable();
        });

        // Bộ lọc dạng Chẵn/Lẻ
        document.getElementById('ledgerParityFilter')?.addEventListener('change', (e) => {
            ledgerParityFilter = e.target.value;
            ledgerLimit = 30;
            renderLedgerTable();
        });

        // Tìm kiếm sổ cái
        document.getElementById('ledgerSearchInput')?.addEventListener('input', (e) => {
            ledgerSearchVal = e.target.value.trim();
            ledgerLimit = 30;
            renderLedgerTable();
        });

        // Nút mở rộng/thu gọn tất cả
        document.getElementById('btnToggleAllLedger')?.addEventListener('click', () => {
            const filtered = getFilteredLedgerRows();
            const visible = filtered.slice(0, ledgerLimit).map(r => r.date);
            const isAllExp = visible.length > 0 && visible.every(d => expandedLedgerDates.has(d));
            if (isAllExp) {
                visible.forEach(d => expandedLedgerDates.delete(d));
            } else {
                visible.forEach(d => expandedLedgerDates.add(d));
            }
            renderLedgerTable();
        });

        // Nút hiển thị toàn bộ 315 kỳ
        const handleShowAll = () => {
            ledgerLimit = 9999;
            renderLedgerTable();
        };
        document.getElementById('btnShowAllLedger')?.addEventListener('click', handleShowAll);
        document.getElementById('btnLoadAllLedgerBottom')?.addEventListener('click', handleShowAll);

        // Nút tải thêm 50 kỳ
        document.getElementById('btnLoadMoreLedger')?.addEventListener('click', () => {
            ledgerLimit += 50;
            renderLedgerTable();
        });
    }

    /**
     * Hàm sao chép toàn cục
     */
    window.copyToClipboard = function (text, btnElement) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            const orig = btnElement.innerHTML;
            btnElement.innerHTML = '<i class="bi bi-check2"></i> Đã Chép!';
            btnElement.classList.add('bg-emerald-600', 'text-white');
            setTimeout(() => {
                btnElement.innerHTML = orig;
                btnElement.classList.remove('bg-emerald-600', 'text-white');
            }, 1800);
        }).catch(err => {
            console.error('Không thể chép:', err);
            prompt('Sao chép dàn số:', text);
        });
    };

    // Khởi chạy
    document.addEventListener('DOMContentLoaded', () => {
        setupEvents();
        fetchReport();
    });

})();
