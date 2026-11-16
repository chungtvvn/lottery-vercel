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
    let ledgerLimit = 30;

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

    let activeHorizon = '299'; // '299' (mẫu chuẩn nghiên cứu) hoặc '315' (toàn bộ thực tế)

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
     * Hiển thị sổ cái đối soát
     */
    function renderLedgerTable() {
        const tbody = document.getElementById('ledgerTableBody');
        const countBadge = document.getElementById('ledgerCountBadge');
        const allList = currentReport.settledLedger || [];

        const searchVal = (document.getElementById('ledgerSearchInput')?.value || '').trim().toLowerCase();
        let filtered = allList;
        if (searchVal) {
            filtered = allList.filter(r => r.date.includes(searchVal));
        }

        countBadge.textContent = `${filtered.length} ngày`;
        const slice = filtered.slice(0, ledgerLimit);

        if (slice.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400">Không tìm thấy ngày nào khớp với tìm kiếm.</td></tr>`;
            return;
        }

        tbody.innerHTML = slice.map(row => {
            const act = row.actualSpecial;
            const predForm = row.predForm;
            const triB = row.triCore?.paB;
            const triD = row.triCore?.paD;
            const ss17 = row.sweetSpot?.s17_base;
            const ss15 = row.sweetSpot?.s15_base;

            const formatHitBadge = (res) => {
                if (!res) return '<span class="text-slate-300">-</span>';
                if (res.isX2) return '<span class="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">ĂN X2 (+168M)</span>';
                if (res.isX1) return '<span class="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-100 text-indigo-900 border border-indigo-300">ĂN X1 (+84M)</span>';
                return '<span class="px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-400">Trượt</span>';
            };

            const accumM = row.accumProfitM?.tri_paB ?? 0;
            const accumClass = accumM >= 0 ? 'text-emerald-700 font-black' : 'text-rose-600 font-bold';

            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-3 font-mono font-bold text-slate-900">${row.date}</td>
                    <td class="p-3 text-center">
                        <span class="inline-flex items-center justify-center h-7 w-7 rounded-lg font-mono font-black text-xs bg-slate-900 text-white">
                            ${act}
                        </span>
                    </td>
                    <td class="p-3 text-center">
                        <span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700">${predForm}</span>
                    </td>
                    <td class="p-3 text-center">${formatHitBadge(triB)}</td>
                    <td class="p-3 text-center">${formatHitBadge(triD)}</td>
                    <td class="p-3 text-center">${formatHitBadge(ss17)}</td>
                    <td class="p-3 text-center">${formatHitBadge(ss15)}</td>
                    <td class="p-3 text-right font-mono ${accumClass}">
                        ${accumM >= 0 ? '+' : ''}${accumM}M
                    </td>
                </tr>
            `;
        }).join('');

        const loadMoreBtn = document.getElementById('btnLoadMoreLedger');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = slice.length >= filtered.length ? 'none' : 'block';
        }
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

        // Tìm kiếm sổ cái
        document.getElementById('ledgerSearchInput')?.addEventListener('input', () => {
            ledgerLimit = 30;
            renderLedgerTable();
        });

        // Nút tải thêm sổ cái
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
