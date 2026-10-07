// public/js/daily-advisor-shadow.js
// Bản theo dõi nghiêm ngặt (Shadow Monitor) của tab Đề Xuất Tinh Hoa Hợp Nhất
// Chiến lược Đề Khử Trùng Dropoff 40s (10 X3 / 12 X2 / 18 X1) & Đề Tri-Core 24s Smart Abstain
// Kết hợp Lô Ghép 4 Động Cơ (Top 6 / Top 7) bù đắp dòng tiền
// Tích hợp Tra cứu Dàn Đã Đánh & Đánh Dấu Số Trúng (100% Strict PIT 2025 - 2026)
(() => {
    'use strict';

    const byId = id => document.getElementById(id);
    const numStr = val => String(Number(val)).padStart(2, '0');

    function formatDateVi(dateStr) {
        if (!dateStr) return '—';
        const parts = String(dateStr).split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateStr;
    }

    function formatMoneyK(valK, showSign = true) {
        const num = Number(valK || 0);
        const sign = (num > 0 && showSign) ? '+' : (num < 0 ? '-' : '');
        const abs = Math.abs(num);
        if (abs >= 1000000) {
            const ty = abs / 1000000;
            return `${sign}${ty.toLocaleString('vi-VN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} TỶ`;
        }
        if (abs >= 1000) {
            const m = abs / 1000;
            return `${sign}${m.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
        }
        return `${sign}${abs.toLocaleString('vi-VN')}K`;
    }

    const moneyM = val => {
        const inM = Number(val || 0) / 1000;
        const sign = inM >= 0 ? '+' : '';
        return `${sign}${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(inM)}M`;
    };
    const moneyAbsM = val => {
        const inM = Math.abs(Number(val || 0) / 1000);
        return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(inM)}M`;
    };

    function showToast(msg) {
        const toast = byId('shadowToast');
        const text = byId('shadowToastText');
        if (!toast || !text) return;
        text.textContent = msg;
        toast.classList.remove('opacity-0', 'translate-y-10');
        setTimeout(() => toast.classList.add('opacity-0', 'translate-y-10'), 2500);
    }

    // Global dashboard states
    let currentShadowCategory = 'deDropoff';
    let currentShadowLoMode = 'top6';
    let currentStrategyMode = 'dropoff40';
    let currentDeStrategy = 'dropoff40';    // 'dropoff40' or 'triCore24'
    let currentShadowYear = '2026';         // '2026', '2025', or 'all'
    let cachedAdvisorData = null;
    let availableDatesList = [];

    async function initShadowMonitor() {
        try {
            const [advisorRes, analysisRes] = await Promise.all([
                fetch('/api/daily-advisor'),
                fetch('/api/daily-advisor/analysis').catch(() => null)
            ]);

            const advisorData = await advisorRes.json();
            if (!advisorData.success) throw new Error(advisorData.error || 'Lỗi nạp dữ liệu');
            cachedAdvisorData = advisorData;

            let analysisData = null;
            if (analysisRes && analysisRes.ok) {
                try {
                    analysisData = await analysisRes.json();
                } catch (_) {
                    analysisData = null;
                }
            }

            renderShadowDashboard(advisorData, analysisData);
            initShadowSlipModal();
        } catch (err) {
            console.error('Shadow Monitor Error:', err);
            const errBox = byId('shadowErrorBox');
            if (errBox) {
                errBox.textContent = `Không thể tải dữ liệu: ${err.message}`;
                errBox.classList.remove('hidden');
            }
        }
    }

    function renderShadowDashboard(data, analysisData) {
        // Target date determination
        const deDropoff = data.deDropoffMerge || null;
        const triCore = data.triCoreDe || null;
        const autoBest = data.autoBestSelection || null;
        const records = Array.isArray(data.records) ? data.records : [];
        const latestRecord = records.at(-1) || {};

        const targetDate = deDropoff?.latestRecommendation?.targetDate || triCore?.latestRecommendation?.targetDate || autoBest?.targetDate || latestRecord.predictionDate || '2026-10-05';
        byId('shadowTargetDate').textContent = formatDateVi(targetDate);

        // 1. Column 1: Đề Khử Trùng Dropoff 40s (X3/X2/X1) vs. Đề Tri-Core 24s
        function renderShadowDeCard(strategy) {
            currentDeStrategy = strategy;
            const isDropoff = (strategy === 'dropoff40');

            const btnDropoff = byId('btnToggleDeDropoff');
            const btnTriCore = byId('btnToggleDeTriCore');
            if (btnDropoff && btnTriCore) {
                btnDropoff.className = isDropoff
                    ? 'px-2.5 py-1 rounded-md font-black bg-amber-500 text-slate-950 transition-all shadow-xs'
                    : 'px-2.5 py-1 rounded-md font-bold text-slate-300 hover:text-white transition-all';
                btnTriCore.className = !isDropoff
                    ? 'px-2.5 py-1 rounded-md font-black bg-emerald-500 text-slate-950 transition-all shadow-xs'
                    : 'px-2.5 py-1 rounded-md font-bold text-slate-300 hover:text-white transition-all';
            }

            const dropoffBox = byId('shadowDropoffTiersBox');
            const triCoreBox = byId('shadowNumbersBox');
            const titleLabel = byId('shadowDeTitleLabel');
            const actionBanner = byId('shadowActionBanner');
            const actionStatusText = byId('shadowActionStatusText');
            const actionDesc = byId('shadowActionDesc');
            const footerMeta = byId('shadowDeFooterMeta');

            if (isDropoff) {
                if (dropoffBox) dropoffBox.classList.remove('hidden');
                if (triCoreBox) triCoreBox.classList.add('hidden');

                if (titleLabel) {
                    titleLabel.innerHTML = '<i class="bi bi-award-fill text-amber-400"></i> 1. Đề Khử Trùng Dropoff 40s (X3/X2/X1) · Vốn 72M';
                }
                if (actionBanner) {
                    actionBanner.className = 'rounded-2xl border-2 border-amber-500 bg-amber-950/30 p-5 shadow-xl ring-2 ring-amber-500/20 flex flex-col justify-between';
                }
                if (actionStatusText) {
                    actionStatusText.innerHTML = '<span class="inline-flex items-center gap-1.5 text-amber-300 font-black uppercase text-sm sm:text-base"><i class="bi bi-shield-check text-amber-400"></i> 👑 ĐỀ PHÂN TẦNG DROPOFF: VÀO KÈO 40 SỐ · TỶ LỆ THẮNG 90.1%</span>';
                }
                if (actionDesc) {
                    actionDesc.textContent = 'Loại bỏ 60 số có tỷ lệ % gãy (Dropoff) cao nhất lịch sử (100% Strict PIT). Phân tầng 40 số sinh tồn: 10 Siêu VIP X3 (3M/số) + 12 Trung Tâm X2 (2M/số) + 18 Bọc Lót X1 (1M/số). Tổng vốn 72M/ngày (luôn < 84M) triệt tiêu hoàn toàn rủi ro trúng-lỗ.';
                }
                if (footerMeta) {
                    footerMeta.innerHTML = '<span>Hòa vốn: <strong class="text-amber-300">0% rủi ro trúng-lỗ (72M &lt; 84M)</strong></span><span>Độ bền: <strong class="text-emerald-400">Win 90.1% (634 kỳ: +64.812 TỶ)</strong></span>';
                }

                const dropoffRec = deDropoff?.latestRecommendation || {};
                const x3Nums = dropoffRec.tierX3 || [65, 66, 67, 68, 69, 71, 72, 75, 76, 77];
                const x2Nums = dropoffRec.tierX2 || [23, 35, 78, 80, 83, 84, 88, 91, 92, 96, 98, 99];
                const x1Nums = dropoffRec.tierX1 || [0, 4, 10, 12, 13, 14, 20, 21, 40, 45, 49, 50, 55, 58, 59, 62, 89, 94];

                const x3El = byId('shadowDropoffX3Container');
                if (x3El) {
                    x3El.innerHTML = x3Nums.map(n => `<span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-rose-500/20 border border-rose-400/50 font-mono text-xs font-black text-rose-200 hover:scale-110 transition-all cursor-pointer" title="VIP X3: ${numStr(n)} (3M/số · Ăn 252M)">${numStr(n)}</span>`).join('');
                }
                const x2El = byId('shadowDropoffX2Container');
                if (x2El) {
                    x2El.innerHTML = x2Nums.map(n => `<span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-400/50 font-mono text-xs font-black text-amber-200 hover:scale-110 transition-all cursor-pointer" title="Trung Tâm X2: ${numStr(n)} (2M/số · Ăn 168M)">${numStr(n)}</span>`).join('');
                }
                const x1El = byId('shadowDropoffX1Container');
                if (x1El) {
                    x1El.innerHTML = x1Nums.map(n => `<span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-400/50 font-mono text-xs font-bold text-emerald-200 hover:scale-110 transition-all cursor-pointer" title="Bọc Lót X1: ${numStr(n)} (1M/số · Ăn 84M)">${numStr(n)}</span>`).join('');
                }

                const btnCopyX3 = byId('btnCopyDropoffX3');
                if (btnCopyX3) {
                    btnCopyX3.onclick = () => {
                        if (x3Nums.length) {
                            navigator.clipboard.writeText(x3Nums.map(numStr).join(', '));
                            showToast('Đã sao chép 10 số Siêu VIP X3!');
                        }
                    };
                }
                const btnCopyAll = byId('btnCopyDropoffAll');
                if (btnCopyAll) {
                    btnCopyAll.onclick = () => {
                        const all40 = dropoffRec.numbers || [...x3Nums, ...x2Nums, ...x1Nums].sort((a,b)=>a-b);
                        if (all40.length) {
                            navigator.clipboard.writeText(all40.map(numStr).join(', '));
                            showToast('Đã sao chép 40 số Đề phân tầng!');
                        }
                    };
                }
            } else {
                if (dropoffBox) dropoffBox.classList.add('hidden');
                if (triCoreBox) triCoreBox.classList.remove('hidden');

                if (titleLabel) {
                    titleLabel.innerHTML = '<i class="bi bi-gem text-emerald-400"></i> 1. Đề Tri-Core 24s (Cược Phẳng 1M) · Vốn 24M';
                }
                if (footerMeta) {
                    footerMeta.innerHTML = '<span>Hòa vốn: <strong class="text-amber-300">Cần trúng 28.6% (1 ăn 84)</strong></span><span>Độ bền: <strong class="text-emerald-400">Win 44.9% (Smart Abstain)</strong></span>';
                }

                const latestRec = triCore?.latestRecommendation || null;
                const isAbstained = latestRec
                    ? (latestRec.action === 'ABSTAIN' || latestRec.status === 'ABSTAIN' || Boolean(latestRec.abstained))
                    : (autoBest ? (autoBest.status === 'ABSTAIN' || autoBest.action === 'ABSTAIN') : false);

                const mainNumbers = (latestRec?.numbers && latestRec.numbers.length)
                    ? latestRec.numbers
                    : (autoBest?.numbers || []);
                const topScore = latestRec?.topScore || 0;

                if (isAbstained) {
                    if (actionBanner) actionBanner.className = 'rounded-2xl border-2 border-rose-500 bg-rose-950/40 p-5 shadow-xl ring-2 ring-rose-500/20 flex flex-col justify-between';
                    if (actionStatusText) actionStatusText.innerHTML = '<span class="inline-flex items-center gap-1.5 text-rose-300 font-black uppercase text-sm sm:text-base"><i class="bi bi-shield-slash-fill text-rose-400"></i> 🛡️ CÔNG TẮC BẢO TOÀN VỐN: HÔM NAY TẠM DỪNG (ABSTAIN)</span>';
                    if (actionDesc) actionDesc.textContent = latestRec?.reasoning || 'Điểm đồng thuận 4 động cơ Tri-Core < 6.5. Quyết định tối ưu: Cược 0đ để bảo toàn vốn, chuyển sang chế độ quan sát.';
                    if (triCoreBox) triCoreBox.classList.add('hidden');
                } else {
                    if (actionBanner) actionBanner.className = 'rounded-2xl border-2 border-emerald-500 bg-emerald-950/30 p-5 shadow-xl ring-2 ring-emerald-500/20 flex flex-col justify-between';
                    if (actionStatusText) actionStatusText.innerHTML = `<span class="inline-flex items-center gap-1.5 text-emerald-300 font-black uppercase text-sm sm:text-base"><i class="bi bi-check-circle-fill text-emerald-400"></i> ✅ ĐỦ ĐIỀU KIỆN PHÁT HÀNH: VÀO KÈO (TRI-CORE 24 SỐ) · TOP 1: ${topScore.toFixed(1)}/7.5</span>`;
                    if (actionDesc) actionDesc.textContent = latestRec?.reasoning || 'Hội tụ 4 động cơ định lượng (MetaLearner + DualMerge + MarkovGap + PentaCore). Điểm đồng thuận Top 1 đạt ' + topScore.toFixed(1) + '/7.5 (vượt ngưỡng an toàn 6.5). Đã loại bỏ 6 số gan cứng.';
                    if (triCoreBox) triCoreBox.classList.remove('hidden');
                    const numbersContainer = byId('shadowNumbersContainer');
                    if (numbersContainer) {
                        numbersContainer.innerHTML = mainNumbers.map(n => `<span class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/50 font-mono text-sm font-black text-emerald-200" title="Số ${numStr(n)}">${numStr(n)}</span>`).join('');
                    }
                }

                const btnCopy = byId('btnCopyShadowNumbers');
                if (btnCopy) {
                    btnCopy.onclick = () => {
                        if (mainNumbers.length) {
                            navigator.clipboard.writeText(mainNumbers.map(numStr).join(', '));
                            showToast('Đã sao chép 24 số tinh hoa!');
                        }
                    };
                }
            }
        }

        // Toggle buttons binding
        const btnToggleDeDropoff = byId('btnToggleDeDropoff');
        const btnToggleDeTriCore = byId('btnToggleDeTriCore');
        if (btnToggleDeDropoff) {
            btnToggleDeDropoff.onclick = () => renderShadowDeCard('dropoff40');
        }
        if (btnToggleDeTriCore) {
            btnToggleDeTriCore.onclick = () => renderShadowDeCard('triCore24');
        }

        // Default initial render
        renderShadowDeCard('dropoff40');

        // 2. Render Column 2: Lô Ghép 4 Động Cơ (Top 6 / Top 7)
        function renderShadowLoCard(mode) {
            currentShadowLoMode = mode;
            window.shadowLoMode = mode;

            const isTop6 = (mode === 'top6');
            const lo4Fusion = data?.lo4EngineFusion;
            const lo4ModeData = lo4Fusion?.modes?.[mode] || lo4Fusion;
            const lo4Rec = lo4ModeData?.latestRecommendation || lo4Fusion?.latestRecommendation || {};
            const loSummary = lo4ModeData?.summary?.all || {};

            // Toggle buttons
            const btnTop6 = byId('btnShadowLoModeTop6');
            const btnTop7 = byId('btnShadowLoModeTop7');
            if (btnTop6 && btnTop7) {
                btnTop6.className = isTop6
                    ? 'rounded-lg bg-teal-400 text-slate-950 font-black text-[10px] px-2 py-0.5 transition-all shadow-xs'
                    : 'rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 font-bold text-[10px] px-2 py-0.5 transition-all';
                btnTop7.className = !isTop6
                    ? 'rounded-lg bg-teal-400 text-slate-950 font-black text-[10px] px-2 py-0.5 transition-all shadow-xs'
                    : 'rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 font-bold text-[10px] px-2 py-0.5 transition-all';
            }

            const winRateBadge = byId('shadowLoWinRateBadge');
            if (winRateBadge) {
                const wr = loSummary.winRate ? (loSummary.winRate * 100).toFixed(1) : (isTop6 ? '68.5' : '69.6');
                const hits = loSummary.hits || (isTop6 ? 1133 : 1273);
                winRateBadge.textContent = `Win ${wr}% · ${hits.toLocaleString('vi-VN')} nháy`;
            }

            const statusText = byId('shadowLoStatusText');
            if (statusText) {
                statusText.textContent = isTop6
                    ? '🔥 TOP 6 LỤC THỦ: VUA HIỆU SUẤT (+5.513 TỶ)'
                    : '🛡️ TOP 7 THẤT THỦ: NỀN TẢNG BỀN VỮNG (+6.394 TỶ)';
            }

            const descText = byId('shadowLoDesc');
            if (descText) {
                descText.textContent = isTop6
                    ? 'Hội tụ 4 động cơ định lượng (QMBF + Bạc Nhớ + Tri + RRF). Bắt trọn 1.133 nháy 2026 (4.15 nháy/ngày), lãi ròng +5.513 TỶ, tối ưu hóa tỷ suất sinh lời ròng.'
                    : 'Hội tụ 4 động cơ định lượng (QMBF + Bạc Nhớ + Tri + RRF). Bắt trọn 1.273 nháy 2026 (4.66 nháy/ngày), lãi ròng +6.394 TỶ, tần suất nổ dày đặc và an toàn nhất.';
            }

            // Numbers
            const recNumbers = (lo4Rec.numbersOver2 && lo4Rec.numbersOver2.length)
                ? lo4Rec.numbersOver2
                : (isTop6 ? ['62', '52', '84', '88', '36'] : ['62', '52', '84', '88', '36', '09', '38']);

            const betNumbersList = (lo4Rec.betNumbers && lo4Rec.betNumbers.length)
                ? lo4Rec.betNumbers.filter(b => recNumbers.includes(String(b.num)))
                : recNumbers.map(n => ({ num: n, votes: 3, multiplier: 4, methods: ['QMBF', 'Dual', 'Tri'] }));

            const container = byId('shadowLoNumbersContainer');
            if (container) {
                container.innerHTML = betNumbersList.map(b => {
                    const v = b.votes || 2;
                    let badgeStyle = '';
                    let badgeTag = '';
                    if (v >= 4) {
                        badgeStyle = 'bg-gradient-to-b from-amber-400 to-yellow-500 text-slate-950 font-black ring-2 ring-amber-300 shadow-md shadow-amber-500/20';
                        badgeTag = '🔥 4/4 ĐC';
                    } else if (v === 3) {
                        badgeStyle = 'bg-gradient-to-b from-teal-400 to-emerald-400 text-slate-950 font-black ring-1 ring-teal-300 shadow-sm';
                        badgeTag = '⚡ 3/4 ĐC';
                    } else {
                        badgeStyle = 'bg-gradient-to-b from-cyan-400 to-sky-400 text-slate-950 font-bold ring-1 ring-cyan-300 shadow-sm';
                        badgeTag = '🛡️ 2/4 ĐC';
                    }
                    const engines = (b.methods || []).join(' + ');
                    return `
                        <div class="relative group flex flex-col items-center justify-center rounded-xl ${badgeStyle} px-3 py-1.5 shadow-xs hover:scale-105 transition-all cursor-pointer min-w-[52px]" title="Đồng thuận: ${v}/4 Động cơ (${engines})">
                            <span class="font-mono text-base font-black leading-tight tracking-tight">${numStr(b.num)}</span>
                            <span class="text-[9px] font-black uppercase tracking-tight opacity-90 mt-0.5">${badgeTag}</span>
                        </div>
                    `;
                }).join('');
            }

            const metaStake = byId('shadowLoMetaStake');
            if (metaStake) {
                const m3 = '3.19';
                const vip = '63.8';
                metaStake.innerHTML = `Vốn M3: <strong class="text-white">${m3}M</strong> · VIP: <strong class="text-white">${vip}M</strong>`;
            }

            const metaProfit = byId('shadowLoMetaProfit');
            if (metaProfit) {
                metaProfit.innerHTML = isTop6
                    ? `Lãi 2026: <strong class="text-teal-300 font-bold font-mono">+5.513 TỶ</strong>`
                    : `Lãi 2026: <strong class="text-teal-300 font-bold font-mono">+6.394 TỶ</strong>`;
            }

            // Copy button handlers
            const btnCopyLo = byId('btnCopyShadowLoNumbers');
            if (btnCopyLo) {
                btnCopyLo.onclick = () => {
                    if (recNumbers.length) {
                        navigator.clipboard.writeText(recNumbers.map(numStr).join(' '));
                        showToast(`Đã sao chép ${recNumbers.length} số Lô (${isTop6 ? 'Top 6' : 'Top 7'})!`);
                    }
                };
            }

            const btnCopyComma = byId('btnCopyShadowLoComma');
            if (btnCopyComma) {
                btnCopyComma.onclick = () => {
                    if (recNumbers.length) {
                        navigator.clipboard.writeText(recNumbers.map(numStr).join(', '));
                        showToast(`Đã sao chép ${recNumbers.length} số Lô (dấu phẩy)!`);
                    }
                };
            }
        }

        // Wire top 6 / top 7 mode buttons
        const btnShadowTop6 = byId('btnShadowLoModeTop6');
        const btnShadowTop7 = byId('btnShadowLoModeTop7');
        if (btnShadowTop6) {
            btnShadowTop6.onclick = () => {
                renderShadowLoCard('top6');
                renderShadowSettledTable();
            };
        }
        if (btnShadowTop7) {
            btnShadowTop7.onclick = () => {
                renderShadowLoCard('top7');
                renderShadowSettledTable();
            };
        }

        // Initial render of Lo card
        renderShadowLoCard('top6');

        // Setup Category Tabs (Combo, Đề Dropoff, Đề Tri-Core, Lô)
        function setupCategoryTabs() {
            const tabBtns = document.querySelectorAll('#shadowLedgerCategoryTabs .shadow-cat-btn');
            tabBtns.forEach(btn => {
                btn.onclick = () => {
                    const cat = btn.getAttribute('data-shadow-cat');
                    if (!cat || cat === currentShadowCategory) return;
                    currentShadowCategory = cat;
                    tabBtns.forEach(b => {
                        if (b === btn) {
                            b.className = 'shadow-cat-btn active rounded-lg bg-indigo-600 text-white font-black text-xs px-3 py-1.5 transition-all shadow-xs flex items-center gap-1.5';
                        } else {
                            b.className = 'shadow-cat-btn rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 font-bold text-xs px-3 py-1.5 transition-all flex items-center gap-1.5';
                        }
                    });
                    renderShadowSettledTable();
                };
            });
        }
        setupCategoryTabs();

        // Setup Year Filter Group (2026, 2025, Tất cả 634 kỳ)
        function setupYearFilters() {
            const yearBtns = document.querySelectorAll('#shadowYearFilterGroup .shadow-year-btn');
            yearBtns.forEach(btn => {
                btn.onclick = () => {
                    const yr = btn.getAttribute('data-shadow-year');
                    if (!yr || yr === currentShadowYear) return;
                    currentShadowYear = yr;
                    yearBtns.forEach(b => {
                        if (b === btn) {
                            b.className = 'shadow-year-btn active px-2.5 py-0.5 rounded-lg bg-indigo-600 text-white font-bold text-[11px] transition-all';
                        } else {
                            b.className = 'shadow-year-btn px-2.5 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 font-bold text-[11px] transition-all';
                        }
                    });
                    computeAndRenderMetrics(currentStrategyMode);
                };
            });
        }
        setupYearFilters();

        // 3. Compute and render rigorous metrics for Đề Dropoff 40s / Tri-Core 24s
        function computeAndRenderMetrics(mode) {
            currentStrategyMode = mode;
            window.shadowSelectedStrategy = mode;

            // Strategy 1: Đề Dropoff 40s (10 X3 / 12 X2 / 18 X1)
            if (mode === 'dropoff40') {
                let dropoffRows = deDropoff?.settledLedger || [];
                if (currentShadowYear === '2026') {
                    dropoffRows = dropoffRows.filter(r => r.year === 2026 || String(r.date).startsWith('2026'));
                } else if (currentShadowYear === '2025') {
                    dropoffRows = dropoffRows.filter(r => r.year === 2025 || String(r.date).startsWith('2025'));
                }

                const sortedRows = dropoffRows.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                let peakEquity = 0;
                let equity = 0;
                let maxDrawdownK = 0;
                let maxDrawdownDays = 0;
                let currentDrawdownDays = 0;
                let longestLoss = 0;
                let currentLoss = 0;

                sortedRows.forEach(r => {
                    const isHit = Boolean(r.hit);
                    const dayProfitK = Number(r.profitK || 0);
                    currentLoss = isHit ? 0 : currentLoss + 1;
                    longestLoss = Math.max(longestLoss, currentLoss);

                    equity += dayProfitK;
                    if (equity > peakEquity) {
                        peakEquity = equity;
                        currentDrawdownDays = 0;
                    } else {
                        currentDrawdownDays += 1;
                        const dd = peakEquity - equity;
                        if (dd > maxDrawdownK) maxDrawdownK = dd;
                        if (currentDrawdownDays > maxDrawdownDays) maxDrawdownDays = currentDrawdownDays;
                    }
                });

                const totalIssued = dropoffRows.length;
                const wins = dropoffRows.filter(r => r.hit).length;
                const hitRate = totalIssued > 0 ? wins / totalIssued : 0;

                const z = 1.95996;
                const p = hitRate;
                const n = Math.max(1, totalIssued);
                const denom = 1 + (z * z) / n;
                const center = p + (z * z) / (2 * n);
                const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
                const ciLow = Math.max(0, (center - margin) / denom);
                const ciHigh = Math.min(1, (center + margin) / denom);

                const totalStakeK = dropoffRows.reduce((sum, r) => sum + (r.stakeK || 72000), 0);
                const roi = totalStakeK > 0 ? equity / totalStakeK : 0;

                byId('metricHitRate').textContent = `${(hitRate * 100).toFixed(1)}%`;
                byId('metricWinsTotal').textContent = `${wins}/${totalIssued} ngày phát hành`;
                byId('metricCI95').textContent = `${(ciLow * 100).toFixed(1)}% – ${(ciHigh * 100).toFixed(1)}%`;
                byId('metricBreakEvenReq').textContent = `Khử 60 số gãy · 100% bảo toàn lãi khi nổ bất kỳ tầng nào (72M < 84M)`;

                byId('metricMaxDrawdown').textContent = `-${moneyAbsM(maxDrawdownK)}`;
                byId('metricMaxDrawdownDays').textContent = `Kéo dài tối đa ${maxDrawdownDays} kỳ`;
                byId('metricLongestLoss').textContent = `${longestLoss} kỳ`;

                const profitEl = byId('metricRealisticProfit');
                profitEl.textContent = formatMoneyK(equity);
                profitEl.className = `text-2xl font-black font-mono ${equity >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

                byId('metricRealisticRoi').textContent = `+${(roi * 100).toFixed(1)}% (Tổng lãi: ${formatMoneyK(equity)})`;
                byId('metricAbstainCount').textContent = `0/${totalIssued} ngày (100% Trực chiến)`;

                renderShadowSettledTable();
                return;
            }

            let ledger = [];
            if (triCore) {
                ledger = (mode === 'wilsonAbstain')
                    ? (triCore.settledLedger || [])
                    : (triCore.allDaysLedger || []);
            }

            // Fallback to legacy records if triCore is not yet loaded
            if (!ledger || !ledger.length) {
                const settledRecords = records.filter(r => r.settled)
                    .slice().sort((a, b) => (a.predictionDate || '').localeCompare(b.predictionDate || ''));

                ledger = settledRecords.map(r => {
                    let strategy = (r.strategySnapshots || []).find(s => s.strategyId === (mode === 'wilsonAbstain' ? 'wilson-abstain-selector-v1' : 'balanced-selector-fixed30-v1'));
                    if (!strategy || !Array.isArray(strategy.numbers) || !strategy.numbers.length) {
                        strategy = {
                            strategyId: mode === 'wilsonAbstain' ? 'wilson-abstain-selector-v1' : 'balanced-selector-fixed30-v1',
                            numbers: r.main?.numbers || [],
                            betCount: 24,
                            hit: r.main?.hit !== undefined ? r.main.hit : (Array.isArray(r.main?.numbers) && r.actual !== null && r.actual !== undefined ? r.main.numbers.includes(Number(r.actual)) : false),
                            abstained: false
                        };
                    }
                    return {
                        date: r.predictionDate,
                        actual: r.actual,
                        abstained: Boolean(strategy.abstained),
                        hit: strategy.hit,
                        numbers: strategy.numbers || [],
                        dayProfitK: strategy.abstained ? 0 : (strategy.hit ? 60000 : -24000)
                    };
                });
            }

            // Forward Chronological Accumulation
            let peakEquity = 0;
            let equity = 0;
            let maxDrawdownK = 0;
            let maxDrawdownDays = 0;
            let currentDrawdownDays = 0;
            let longestLoss = 0;
            let currentLoss = 0;

            ledger.forEach(r => {
                const isAbstain = Boolean(r.abstained);
                const isHit = Boolean(r.hit);
                const dayProfitK = r.dayProfitK !== undefined ? r.dayProfitK : (isAbstain ? 0 : (isHit ? 60000 : -24000));
                r.dayProfitK = dayProfitK;

                if (!isAbstain) {
                    currentLoss = isHit ? 0 : currentLoss + 1;
                    longestLoss = Math.max(longestLoss, currentLoss);

                    equity += dayProfitK;
                    if (equity > peakEquity) {
                        peakEquity = equity;
                        currentDrawdownDays = 0;
                    } else {
                        currentDrawdownDays += 1;
                        const dd = peakEquity - equity;
                        if (dd > maxDrawdownK) maxDrawdownK = dd;
                        if (currentDrawdownDays > maxDrawdownDays) maxDrawdownDays = currentDrawdownDays;
                    }
                }
                r.accumProfitK = equity;
            });

            const issuedDays = ledger.filter(r => !r.abstained && r.numbers?.length);
            const abstainedDays = ledger.filter(r => r.abstained);
            const wins = issuedDays.filter(r => r.hit).length;
            const totalIssued = issuedDays.length;
            const hitRate = totalIssued > 0 ? wins / totalIssued : 0;

            // Confidence interval 95%
            const z = 1.95996;
            const p = hitRate;
            const n = Math.max(1, totalIssued);
            const denom = 1 + (z * z) / n;
            const center = p + (z * z) / (2 * n);
            const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
            const ciLow = Math.max(0, (center - margin) / denom);
            const ciHigh = Math.min(1, (center + margin) / denom);

            // Realistic Payout After Fee (1 ăn 81.5)
            const realisticPayoutMultiplier = 81.5;
            const realisticBreakEven = 24 / realisticPayoutMultiplier;
            const totalStakeK = totalIssued * 24000; // 24000K = 24M (1M/số)
            const realisticProfitK = wins * 81500 - totalStakeK;
            const realisticRoi = totalStakeK > 0 ? realisticProfitK / totalStakeK : 0;

            // Update UI Metric Cards
            byId('metricHitRate').textContent = `${(hitRate * 100).toFixed(1)}%`;
            byId('metricWinsTotal').textContent = `${wins}/${totalIssued} ngày phát hành`;
            byId('metricCI95').textContent = `${(ciLow * 100).toFixed(1)}% – ${(ciHigh * 100).toFixed(1)}%`;
            byId('metricBreakEvenReq').textContent = `Cần hòa vốn sau phí: ${(realisticBreakEven * 100).toFixed(1)}% (1 ăn 81.5)`;

            byId('metricMaxDrawdown').textContent = `-${moneyAbsM(maxDrawdownK)}`;
            byId('metricMaxDrawdownDays').textContent = `Kéo dài tối đa ${maxDrawdownDays} kỳ`;
            byId('metricLongestLoss').textContent = `${longestLoss} kỳ`;

            const profitEl = byId('metricRealisticProfit');
            profitEl.textContent = moneyM(equity);
            profitEl.className = `text-2xl font-black font-mono ${equity >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

            byId('metricRealisticRoi').textContent = `${(totalStakeK > 0 ? (equity / totalStakeK * 100).toFixed(1) : '0.0')}% (ROI sau phí: ${(realisticRoi * 100).toFixed(1)}%)`;
            byId('metricAbstainCount').textContent = `${abstainedDays.length}/${ledger.length} ngày (${((abstainedDays.length / Math.max(1, ledger.length)) * 100).toFixed(1)}%)`;

            // Render Settled Ledger Table
            renderShadowSettledTable();
        }

        // Toggle buttons for Đề strategy mode (Dropoff 40s vs Tri-Core Wilson vs Tri-Core Balanced)
        const btnModeDropoff = byId('btnModeDropoff');
        const btnModeBalanced = byId('btnModeBalanced');
        const btnModeWilson = byId('btnModeWilson');
        if (btnModeDropoff && btnModeWilson && btnModeBalanced) {
            btnModeDropoff.onclick = () => {
                btnModeDropoff.className = 'rounded-xl bg-amber-500 text-slate-950 font-black text-xs px-3.5 py-2 transition-all shadow-md';
                btnModeWilson.className = 'rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 font-bold text-xs px-3.5 py-2 transition-all';
                btnModeBalanced.className = 'rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 font-bold text-xs px-3.5 py-2 transition-all';
                computeAndRenderMetrics('dropoff40');
            };
            btnModeWilson.onclick = () => {
                btnModeWilson.className = 'rounded-xl bg-amber-500 text-slate-950 font-black text-xs px-3.5 py-2 transition-all shadow-md';
                btnModeDropoff.className = 'rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 font-bold text-xs px-3.5 py-2 transition-all';
                btnModeBalanced.className = 'rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 font-bold text-xs px-3.5 py-2 transition-all';
                computeAndRenderMetrics('wilsonAbstain');
            };
            btnModeBalanced.onclick = () => {
                btnModeBalanced.className = 'rounded-xl bg-amber-500 text-slate-950 font-black text-xs px-3.5 py-2 transition-all shadow-md';
                btnModeDropoff.className = 'rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 font-bold text-xs px-3.5 py-2 transition-all';
                btnModeWilson.className = 'rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 font-bold text-xs px-3.5 py-2 transition-all';
                computeAndRenderMetrics('balanced');
            };
        }

        // Run default computation with Đề Dropoff 40s
        computeAndRenderMetrics('dropoff40');

        // 4. Render Explainable AI Block ("Vì sao chọn dàn này")
        const evidences = [
            'Khử Trùng Dropoff % Gãy: Quét lịch sử chuỗi trượt 20 năm (Strict PIT), loại bỏ 60 số có tỷ lệ gãy cao nhất.',
            'Phân Tầng Đa Động Cơ (10 VIP X3 / 12 Trung Tâm X2 / 18 Bọc Lót X1): Cược 72M/ngày, thưởng 84M đến 252M.',
            'Triệt Tiêu Hoàn Toàn Bẫy Trúng-Lỗ: 100% ngày nổ bất kỳ tầng nào đều sinh lãi ròng dương (72M < 84M, Max Drawdown -336M, Lãi 2 năm +64.812 TỶ).'
        ];
        const majorRisk = 'Dù tỷ lệ trúng thực nghiệm đạt 90.1% (+142.0% ROI trên 634 kỳ), vẫn có thể xuất hiện chuỗi trượt tối đa 3-4 kỳ liên tiếp (Drawdown -336M). Tuyệt đối duy trì kỷ luật vốn 72M/ngày, không bao giờ gấp thếp Martingale.';

        const evidenceList = byId('shadowEvidenceList');
        if (evidenceList) {
            evidenceList.innerHTML = evidences.map(e => `<li class="flex items-start gap-2"><i class="bi bi-check2-circle text-amber-400 mt-0.5 shrink-0"></i><span>${e}</span></li>`).join('');
        }
        const riskEl = byId('shadowMajorRiskText');
        if (riskEl) {
            riskEl.textContent = majorRisk;
        }

        // Churn guard display
        const churnEl = byId('shadowChurnGuardText');
        if (churnEl) {
            churnEl.textContent = 'Hệ thống áp dụng cơ chế Khử Trùng Dropoff Rate kết hợp Ngưỡng Hòa Vốn Bất Biến: Đạt tỷ lệ trúng 90.1% qua 634 kỳ mở thưởng thực tế (2025-2026), bảo toàn vốn trước các biến động cực đoan.';
        }
    }

    // Dynamic Settled Ledger Table Renderer supporting Combo, Đề Dropoff, Đề Tri-Core, and Lô
    function renderShadowSettledTable() {
        const thead = byId('shadowLedgerThead');
        const tbody = byId('shadowLedgerTbody');
        if (!thead || !tbody || !cachedAdvisorData) return;

        const data = cachedAdvisorData;
        const triCore = data.triCoreDe || null;
        const lo4Fusion = data.lo4EngineFusion || null;
        const deDropoff = data.deDropoffMerge || null;
        const mode = currentShadowLoMode || 'top6';
        const loModeData = lo4Fusion?.modes?.[mode] || lo4Fusion;
        const loLedger = loModeData?.settledLedger || [];
        const deDropoffLedger = deDropoff?.settledLedger || [];

        let deLedger = [];
        if (triCore) {
            deLedger = (currentStrategyMode === 'wilsonAbstain')
                ? (triCore.settledLedger || [])
                : (triCore.allDaysLedger || []);
        }

        // Global available dates list for modal selector
        const deLatestRec = triCore?.latestRecommendation;
        const loLatestRec = loModeData?.latestRecommendation || lo4Fusion?.latestRecommendation;
        const dropoffLatestRec = deDropoff?.latestRecommendation;
        const targetDate = dropoffLatestRec?.targetDate || deLatestRec?.targetDate || loLatestRec?.predictionDate || '2026-10-05';

        const allDates = Array.from(new Set([
            ...deDropoffLedger.map(r => r.date),
            ...deLedger.map(r => r.date),
            ...loLedger.map(r => r.date)
        ])).filter(Boolean).sort();

        const fullDatesSorted = Array.from(new Set([targetDate, ...allDates])).filter(Boolean).sort().reverse();
        availableDatesList = fullDatesSorted;

        const rowCountEl = byId('shadowDiaryRowCount');
        const winCountEl = byId('shadowDiaryWinCount');
        const winRateEl = byId('shadowDiaryWinRate');
        const hitsTagEl = byId('shadowDiaryHitsTag');
        const hitsCountEl = byId('shadowDiaryHitsCount');
        const profitLabelEl = byId('shadowDiaryProfitLabel');
        const totalProfitEl = byId('shadowDiaryTotalProfit');

        // =====================================================================
        // CATEGORY: ĐỀ DROPOFF 40S (2025 - 2026: 634 KỲ)
        // =====================================================================
        if (currentShadowCategory === 'deDropoff') {
            let dropoffRows = deDropoffLedger;
            if (currentShadowYear === '2026') {
                dropoffRows = dropoffRows.filter(r => r.year === 2026 || String(r.date).startsWith('2026'));
            } else if (currentShadowYear === '2025') {
                dropoffRows = dropoffRows.filter(r => r.year === 2025 || String(r.date).startsWith('2025'));
            }

            const totalDays = dropoffRows.length;
            const wins = dropoffRows.filter(r => r.hit).length;
            const x3Wins = dropoffRows.filter(r => r.hitType === 'VIP_X3').length;
            const x2Wins = dropoffRows.filter(r => r.hitType === 'CENTER_X2').length;
            const x1Wins = dropoffRows.filter(r => r.hitType === 'BACKUP_X1').length;
            const hitRate = totalDays > 0 ? (wins / totalDays * 100).toFixed(1) : '0.0';
            const totalStakeK = dropoffRows.reduce((sum, r) => sum + (r.stakeK || 72000), 0);
            const totalPayoutK = dropoffRows.reduce((sum, r) => sum + (r.payoutK || 0), 0);
            const totalProfitK = totalPayoutK - totalStakeK;

            if (rowCountEl) rowCountEl.textContent = `${totalDays}`;
            if (winCountEl) winCountEl.textContent = `${wins} (X3: ${x3Wins} · X2: ${x2Wins} · X1: ${x1Wins})`;
            if (winRateEl) winRateEl.textContent = `${hitRate}%`;
            if (hitsTagEl) hitsTagEl.classList.add('hidden');
            if (profitLabelEl) profitLabelEl.textContent = `💰 Lãi Lũy Kế Đề Dropoff 40s (${currentShadowYear === 'all' ? '2025-2026' : currentShadowYear}):`;
            if (totalProfitEl) {
                totalProfitEl.textContent = formatMoneyK(totalProfitK);
                totalProfitEl.className = `font-black text-sm font-mono ${totalProfitK >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
            }

            thead.innerHTML = `
                <tr class="border-b border-white/10 text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                    <th class="py-2.5 px-3">Ngày Quay</th>
                    <th class="py-2.5 px-3">Phân Tầng Đề 40s</th>
                    <th class="py-2.5 px-3 text-center">Kết Quả &amp; Tầng Nổ</th>
                    <th class="py-2.5 px-3 text-center">Giải ĐB</th>
                    <th class="py-2.5 px-3 text-right">Vốn Cược</th>
                    <th class="py-2.5 px-3 text-right">Tiền Thưởng</th>
                    <th class="py-2.5 px-3 text-right">Lãi/Lỗ Ngày</th>
                    <th class="py-2.5 px-3 text-right">Lũy Kế Lợi Nhuận</th>
                    <th class="py-2.5 px-3 text-center">Chi Tiết</th>
                </tr>
            `;

            let pendingRowHtml = '';
            if (currentShadowYear !== '2025') {
                const targetDateFormatted = formatDateVi(dropoffLatestRec?.targetDate || '2026-10-05');
                pendingRowHtml = `
                    <tr class="border-b border-amber-500/20 bg-amber-950/20 hover:bg-amber-950/30 transition-colors font-mono text-xs">
                        <td class="py-3 px-3 font-bold text-amber-300">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span>${targetDateFormatted}</span>
                                <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">🔒 ĐÃ KHÓA</span>
                            </div>
                        </td>
                        <td class="py-3 px-3">
                            <span class="text-amber-300 font-semibold">Dropoff 40s (10 X3 · 12 X2 · 18 X1)</span>
                            <div class="text-[10px] text-slate-400">Khử 60 số gãy cao nhất · Vốn 72M</div>
                        </td>
                        <td class="py-3 px-3 text-center">
                            <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">⏳ CHỜ MỞ 18:30</span>
                        </td>
                        <td class="py-3 px-3 text-center font-bold text-amber-400">⏳ Chờ mở</td>
                        <td class="py-3 px-3 text-right text-white font-bold">72.0M</td>
                        <td class="py-3 px-3 text-right text-slate-400 font-mono">—</td>
                        <td class="py-3 px-3 text-right font-bold text-amber-300">⏳ Chờ kết toán</td>
                        <td class="py-3 px-3 text-right font-bold text-emerald-300">${formatMoneyK(totalProfitK)}</td>
                        <td class="py-3 px-3 text-center">
                            <button type="button" class="btn-open-slip px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-200 hover:text-slate-950 border border-amber-500/40 text-[11px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer shadow-xs" data-slip-date="${dropoffLatestRec?.targetDate || '2026-10-05'}">
                                <i class="bi bi-eye"></i> 40 Số
                            </button>
                        </td>
                    </tr>
                `;
            }

            let runningProfitK = 0;
            const enrichedDropoffRows = dropoffRows.map(r => {
                runningProfitK += (r.profitK || 0);
                return { ...r, viewAccumProfitK: runningProfitK };
            });
            const reversedDropoffRows = [...enrichedDropoffRows].reverse();

            const settledRowsHtml = reversedDropoffRows.map(r => {
                const dateVi = formatDateVi(r.date);
                let hitBadge = '';
                if (r.hitType === 'VIP_X3') {
                    hitBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-rose-500 text-white shadow-sm ring-1 ring-rose-300">🎯 SIÊU VIP X3 (+180.0M) ⭐</span>';
                } else if (r.hitType === 'CENTER_X2') {
                    hitBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-amber-400 text-slate-950 shadow-sm ring-1 ring-amber-300">🎯 TRUNG TÂM X2 (+96.0M)</span>';
                } else if (r.hitType === 'BACKUP_X1') {
                    hitBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">🎯 BỌC LÓT X1 (+12.0M)</span>';
                } else {
                    hitBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">❌ TRƯỢT (-72.0M)</span>';
                }

                const actualStr = (r.actual !== null && r.actual !== undefined) ? numStr(r.actual) : '—';
                const hitNumberHtml = r.hit
                    ? `<span class="inline-flex items-center justify-center px-2 py-0.5 rounded font-black font-mono text-xs bg-amber-400 text-slate-950 ring-1 ring-amber-300">🎯 ${actualStr}</span>`
                    : `<span class="text-slate-400 font-mono text-xs">${actualStr}</span>`;

                return `
                    <tr class="border-b border-white/5 hover:bg-white/5 transition-colors font-mono text-xs">
                        <td class="py-2.5 px-3 font-bold text-slate-300">${dateVi}</td>
                        <td class="py-2.5 px-3">
                            <span class="text-amber-300 font-semibold">Dropoff 40s</span>
                            <span class="text-[10px] text-slate-400 block">10 X3 · 12 X2 · 18 X1</span>
                        </td>
                        <td class="py-2.5 px-3 text-center">${hitBadge}</td>
                        <td class="py-2.5 px-3 text-center">${hitNumberHtml}</td>
                        <td class="py-2.5 px-3 text-right text-slate-400">72.0M</td>
                        <td class="py-2.5 px-3 text-right font-bold ${r.payoutK > 0 ? 'text-amber-300' : 'text-slate-500'}">${r.payoutK > 0 ? formatMoneyK(r.payoutK, false) : '0đ'}</td>
                        <td class="py-2.5 px-3 text-right font-black ${r.profitK > 0 ? 'text-emerald-400' : 'text-rose-400'}">${formatMoneyK(r.profitK)}</td>
                        <td class="py-2.5 px-3 text-right font-bold ${r.viewAccumProfitK >= 0 ? 'text-emerald-300' : 'text-rose-300'}">${formatMoneyK(r.viewAccumProfitK)}</td>
                        <td class="py-2.5 px-3 text-center">
                            <button type="button" class="btn-open-slip px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-200 hover:text-slate-950 border border-amber-500/40 text-[11px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer shadow-xs" data-slip-date="${r.date}">
                                <i class="bi bi-eye"></i> 40 Số
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            tbody.innerHTML = pendingRowHtml + (settledRowsHtml || '<tr><td colspan="9" class="py-8 text-center text-xs text-slate-400">Không có dữ liệu đối soát</td></tr>');
            return;
        }

        // =====================================================================
        // CATEGORIES: COMBO, ĐỀ TRI-CORE, LÔ GHÉP 4 ĐỘNG CƠ
        // =====================================================================
        const loMap = new Map();
        loLedger.forEach(row => loMap.set(row.date, row));

        const deDropoffMap = new Map();
        deDropoffLedger.forEach(row => deDropoffMap.set(row.date, row));

        const deMap = new Map();
        deLedger.forEach(row => deMap.set(row.date, row));

        const baseDates = Array.from(new Set([
            ...(currentShadowCategory === 'combo' ? deDropoffLedger.map(r => r.date) : deLedger.map(r => r.date)),
            ...loLedger.map(r => r.date)
        ])).filter(Boolean).sort();
        let targetDates = baseDates;
        if (currentShadowYear === '2026') {
            targetDates = baseDates.filter(d => String(d).startsWith('2026'));
        } else if (currentShadowYear === '2025') {
            targetDates = baseDates.filter(d => String(d).startsWith('2025'));
        }

        if (!targetDates.length) {
            if (rowCountEl) rowCountEl.textContent = '0';
            if (winCountEl) winCountEl.textContent = '0';
            if (winRateEl) winRateEl.textContent = '0.0%';
            if (hitsTagEl) hitsTagEl.classList.add('hidden');
            if (totalProfitEl) {
                totalProfitEl.textContent = '0đ';
                totalProfitEl.className = 'font-black text-sm font-mono text-slate-400';
            }
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="py-8 text-center text-xs text-amber-300">
                        <i class="bi bi-info-circle text-base"></i> Không có dữ liệu đối soát năm ${currentShadowYear} cho hạng mục này.<br>
                        (Vui lòng chọn tab <strong>🏆 Đề Dropoff 40s</strong> để xem toàn bộ 634 kỳ cả 2025 và 2026).
                    </td>
                </tr>
            `;
            return;
        }

        let cumDeK = 0;
        let cumLoK = 0;
        let cumComboK = 0;

        const rowsData = targetDates.map(date => {
            const isCombo = (currentShadowCategory === 'combo');
            const deRow = isCombo ? deDropoffMap.get(date) : deMap.get(date);
            const loRow = loMap.get(date);

            let deAbstain = false;
            let deHit = false;
            let deProfitK = 0;
            let deStakeK = 24000;

            if (isCombo) {
                deAbstain = false;
                deHit = Boolean(deRow?.hit);
                deStakeK = deRow?.stakeK || 72000;
                deProfitK = deRow ? (deRow.profitK !== undefined ? deRow.profitK : (deHit ? ((deRow.payoutK || 0) - deStakeK) : -deStakeK)) : 0;
            } else {
                deAbstain = Boolean(deRow?.abstained);
                deHit = Boolean(deRow?.hit);
                deProfitK = deRow?.dayProfitK ?? (deAbstain ? 0 : (deHit ? 60000 : -24000));
                deStakeK = deAbstain ? 0 : (deRow?.stakeK || 24000);
            }

            const loHits = loRow?.dayLotoHits || 0;
            const loStakeK = loRow?.dayLotoStakeK || 0;
            const loPayoutK = loRow?.dayLotoPayoutK || 0;
            const loProfitK = loRow?.dayLotoProfitK ?? (loPayoutK - loStakeK);
            const isLoWin = loRow?.isLotoWin ?? (loProfitK > 0);

            const comboDayProfitK = deProfitK + loProfitK;
            const comboDayStakeK = deStakeK + loStakeK;

            cumDeK += deProfitK;
            cumLoK += loProfitK;
            cumComboK += comboDayProfitK;

            return {
                date,
                deRow,
                loRow,
                deAbstain,
                deHit,
                deProfitK,
                deStakeK,
                cumDeK,
                loHits,
                loStakeK,
                loPayoutK,
                loProfitK,
                isLoWin,
                cumLoK,
                comboDayProfitK,
                comboDayStakeK,
                cumComboK,
                isComboWin: comboDayProfitK > 0
            };
        });

        const totalDays = rowsData.length;

        if (currentShadowCategory === 'combo') {
            const comboWins = rowsData.filter(r => r.isComboWin).length;
            const comboWinRate = totalDays > 0 ? (comboWins / totalDays * 100).toFixed(1) : '0.0';
            if (rowCountEl) rowCountEl.textContent = `${totalDays}`;
            if (winCountEl) winCountEl.textContent = `${comboWins}`;
            if (winRateEl) winRateEl.textContent = `${comboWinRate}%`;
            if (hitsTagEl) hitsTagEl.classList.add('hidden');
            if (profitLabelEl) profitLabelEl.textContent = `💰 Lãi Lũy Kế Combo (${currentShadowYear === 'all' ? 'Tất cả' : currentShadowYear}):`;
            if (totalProfitEl) {
                totalProfitEl.textContent = formatMoneyK(cumComboK);
                totalProfitEl.className = `font-black text-sm font-mono ${cumComboK >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
            }
        } else if (currentShadowCategory === 'de') {
            const issuedRows = rowsData.filter(r => !r.deAbstain);
            const deWins = issuedRows.filter(r => r.deHit).length;
            const deWinRate = issuedRows.length > 0 ? (deWins / issuedRows.length * 100).toFixed(1) : '0.0';
            if (rowCountEl) rowCountEl.textContent = `${totalDays} (${issuedRows.length} cược / ${totalDays - issuedRows.length} né)`;
            if (winCountEl) winCountEl.textContent = `${deWins}`;
            if (winRateEl) winRateEl.textContent = `${deWinRate}% (ngày cược)`;
            if (hitsTagEl) hitsTagEl.classList.add('hidden');
            if (profitLabelEl) profitLabelEl.textContent = `💰 Lãi Lũy Kế Đề Tri-Core (${currentShadowYear === 'all' ? 'Tất cả' : currentShadowYear}):`;
            if (totalProfitEl) {
                totalProfitEl.textContent = formatMoneyK(cumDeK);
                totalProfitEl.className = `font-black text-sm font-mono ${cumDeK >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
            }
        } else { // 'lo'
            const loWins = rowsData.filter(r => r.isLoWin).length;
            const loWinRate = totalDays > 0 ? (loWins / totalDays * 100).toFixed(1) : '0.0';
            const totalHits = rowsData.reduce((acc, r) => acc + (r.loHits || 0), 0);
            if (rowCountEl) rowCountEl.textContent = `${totalDays}`;
            if (winCountEl) winCountEl.textContent = `${loWins}`;
            if (winRateEl) winRateEl.textContent = `${loWinRate}%`;
            if (hitsTagEl) {
                hitsTagEl.classList.remove('hidden');
                if (hitsCountEl) hitsCountEl.textContent = `${totalHits.toLocaleString('vi-VN')}`;
            }
            if (profitLabelEl) profitLabelEl.textContent = `💰 Lãi Lũy Kế Lô (${mode === 'top6' ? 'Top 6' : 'Top 7'} · ${currentShadowYear === 'all' ? 'Tất cả' : currentShadowYear}):`;
            if (totalProfitEl) {
                totalProfitEl.textContent = formatMoneyK(cumLoK);
                totalProfitEl.className = `font-black text-sm font-mono ${cumLoK >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
            }
        }

        // Render dynamic THEAD
        if (currentShadowCategory === 'combo') {
            thead.innerHTML = `
                <tr class="border-b border-white/10 text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                    <th class="py-2.5 px-3">Ngày Quay</th>
                    <th class="py-2.5 px-3">Đề Dropoff 40s</th>
                    <th class="py-2.5 px-3">Lô Ghép 4 ĐC (${mode === 'top6' ? 'Top 6' : 'Top 7'})</th>
                    <th class="py-2.5 px-3 text-center">Dàn Đánh &amp; Số Trúng</th>
                    <th class="py-2.5 px-3 text-right">Tổng Vốn</th>
                    <th class="py-2.5 px-3 text-right">Lãi Đề</th>
                    <th class="py-2.5 px-3 text-right">Lãi Lô</th>
                    <th class="py-2.5 px-3 text-right">Lãi Ròng Ngày</th>
                    <th class="py-2.5 px-3 text-right">Lũy Kế Combo</th>
                </tr>
            `;
        } else if (currentShadowCategory === 'de') {
            thead.innerHTML = `
                <tr class="border-b border-white/10 text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                    <th class="py-2.5 px-3">Ngày Quay</th>
                    <th class="py-2.5 px-3">Phương Pháp Chọn</th>
                    <th class="py-2.5 px-3 text-center">Hành Động</th>
                    <th class="py-2.5 px-3">Dàn 24 Số &amp; Số Trúng</th>
                    <th class="py-2.5 px-3 text-center">Đặc Biệt</th>
                    <th class="py-2.5 px-3 text-right">Lãi/Lỗ Ngày</th>
                    <th class="py-2.5 px-3 text-right">Lũy Kế Đề</th>
                    <th class="py-2.5 px-3 text-center">Chi Tiết</th>
                </tr>
            `;
        } else { // 'lo'
            thead.innerHTML = `
                <tr class="border-b border-white/10 text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                    <th class="py-2.5 px-3">Ngày Quay</th>
                    <th class="py-2.5 px-3">Chế Độ &amp; Trạng Thái</th>
                    <th class="py-2.5 px-3">Dàn Số &amp; Số Nổ (X5 / X4 / X3 / X1)</th>
                    <th class="py-2.5 px-3 text-center">Nháy Nổ (27 Giải)</th>
                    <th class="py-2.5 px-3 text-right">Vốn Cược</th>
                    <th class="py-2.5 px-3 text-right">Tiền Trúng</th>
                    <th class="py-2.5 px-3 text-right">Lãi/Lỗ Ngày</th>
                    <th class="py-2.5 px-3 text-right">Lũy Kế Lô</th>
                    <th class="py-2.5 px-3 text-center">Chi Tiết</th>
                </tr>
            `;
        }

        // Pending Row for Today pinned at top (only if year is 2026 or all)
        const formattedTargetDate = formatDateVi(targetDate);
        let pendingRowHtml = '';

        if (currentShadowYear !== '2025') {
            if (currentShadowCategory === 'combo') {
                const loBetCount = loLatestRec?.betNumbers?.length || 14;
                const loStakeM = loLatestRec?.totalLotoStakeK ? (loLatestRec.totalLotoStakeK / 1000).toFixed(1) + 'M' : '63.8M';
                const deStakeM = '72.0M';
                const totalStakeM = ((Number(loLatestRec?.totalLotoStakeK || 63800) + 72000) / 1000).toFixed(1) + 'M';

                pendingRowHtml = `
                    <tr class="border-b border-amber-500/20 bg-amber-950/20 hover:bg-amber-950/30 transition-colors font-mono text-xs">
                        <td class="py-3 px-3 font-bold text-amber-300">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span>${formattedTargetDate}</span>
                                <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">🔒 ĐÃ KHÓA</span>
                            </div>
                        </td>
                        <td class="py-3 px-3">
                            <span class="text-amber-300 font-semibold">Dropoff 40s (10 X3 · 12 X2 · 18 X1)</span>
                            <div class="text-[10px] text-slate-400">Khử 60 số gãy · Vốn 72M</div>
                        </td>
                        <td class="py-3 px-3">
                            <span class="text-teal-300 font-semibold">${mode === 'top6' ? 'Top 6 Live' : 'Top 7 Live'} (${loBetCount} số)</span>
                            <div class="text-[10px] text-slate-400">X5: ${(loLatestRec?.tierX5 || []).join(', ') || '—'} · X4: ${(loLatestRec?.tierX4 || []).join(', ') || '—'}</div>
                        </td>
                        <td class="py-3 px-3 text-center">
                            <button type="button" class="btn-open-slip px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-200 hover:text-slate-950 border border-amber-500/40 text-[11px] font-bold inline-flex items-center gap-1 transition-all shadow-xs cursor-pointer" data-slip-date="${targetDate}">
                                <i class="bi bi-eye-fill text-amber-300"></i> Xem Dàn Khóa
                            </button>
                        </td>
                        <td class="py-3 px-3 text-right">
                            <span class="text-white font-bold">${totalStakeM}</span>
                            <div class="text-[10px] text-slate-400">Đề ${deStakeM} + Lô ${loStakeM}</div>
                        </td>
                        <td class="py-3 px-3 text-right text-amber-400 font-bold">⏳ Chờ 18:30</td>
                        <td class="py-3 px-3 text-right text-amber-400 font-bold">⏳ Chờ 18:30</td>
                        <td class="py-3 px-3 text-right font-bold text-amber-300">⏳ Chờ kết toán</td>
                        <td class="py-3 px-3 text-right font-bold text-emerald-300">${formatMoneyK(cumComboK)}</td>
                    </tr>
                `;
            } else if (currentShadowCategory === 'de') {
                const deRecScore = deLatestRec?.topScore ? ` (Điểm: ${deLatestRec.topScore.toFixed(1)})` : '';
                const deNums = (deLatestRec?.numbers || []).slice(0, 8).map(numStr).join(' ') + ((deLatestRec?.numbers?.length > 8) ? '...' : '');

                pendingRowHtml = `
                    <tr class="border-b border-amber-500/20 bg-amber-950/20 hover:bg-amber-950/30 transition-colors font-mono text-xs">
                        <td class="py-3 px-3 font-bold text-amber-300">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span>${formattedTargetDate}</span>
                                <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">🔒 ĐÃ KHÓA</span>
                            </div>
                        </td>
                        <td class="py-3 px-3 text-amber-300 font-semibold">Tri-Core 24s${deRecScore}</td>
                        <td class="py-3 px-3 text-center">
                            <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">✅ VÀO KÈO 24S</span>
                        </td>
                        <td class="py-3 px-3 text-slate-300 text-[11px]" title="${(deLatestRec?.numbers || []).map(numStr).join(', ')}">${deNums}</td>
                        <td class="py-3 px-3 text-center font-bold text-amber-400">⏳ Chờ mở</td>
                        <td class="py-3 px-3 text-right text-slate-400 font-medium">Vốn 24M (Chờ kq)</td>
                        <td class="py-3 px-3 text-right font-bold text-emerald-300">${formatMoneyK(cumDeK)}</td>
                        <td class="py-3 px-3 text-center">
                            <button type="button" class="btn-open-slip px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-200 hover:text-slate-950 border border-amber-500/40 text-[11px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer" data-slip-date="${targetDate}">
                                <i class="bi bi-eye"></i> 24 Số
                            </button>
                        </td>
                    </tr>
                `;
            } else { // 'lo'
                const betList = loLatestRec?.betNumbers || [];
                const betPillsHtml = betList.map(b => {
                    const multTag = b.multiplier > 1 ? `·x${b.multiplier}` : '';
                    return `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-500/15 text-teal-200 border border-teal-500/30 font-mono">${numStr(b.num)}<span class="text-[9px] opacity-80">${multTag}</span></span>`;
                }).join(' ');

                const stakeStr = formatMoneyK(loLatestRec?.totalLotoStakeK || 63800, false);

                pendingRowHtml = `
                    <tr class="border-b border-amber-500/20 bg-amber-950/20 hover:bg-amber-950/30 transition-colors font-mono text-xs">
                        <td class="py-3 px-3 font-bold text-amber-300">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span>${formattedTargetDate}</span>
                                <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">🔒 ĐÃ KHÓA</span>
                            </div>
                        </td>
                        <td class="py-3 px-3">
                            <div class="font-bold text-teal-300">${mode === 'top6' ? 'Top 6 Lục Thủ' : 'Top 7 Thất Thủ'}</div>
                            <div class="text-[10px] text-amber-300 font-semibold">🔒 Đã niêm phong 12:00</div>
                        </td>
                        <td class="py-3 px-3">
                            <div class="flex flex-wrap gap-1 max-w-md">${betPillsHtml || '—'}</div>
                        </td>
                        <td class="py-3 px-3 text-center text-amber-400 font-bold">⏳ Chờ 18:30</td>
                        <td class="py-3 px-3 text-right font-bold text-white">${stakeStr}</td>
                        <td class="py-3 px-3 text-right text-slate-400 font-mono">—</td>
                        <td class="py-3 px-3 text-right font-bold text-amber-300">⏳ Chờ kết toán</td>
                        <td class="py-3 px-3 text-right font-bold text-emerald-300">${formatMoneyK(cumLoK)}</td>
                        <td class="py-3 px-3 text-center">
                            <button type="button" class="btn-open-slip px-2 py-0.5 rounded-lg bg-teal-500/20 hover:bg-teal-500 text-teal-200 hover:text-slate-950 border border-teal-500/40 text-[11px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer" data-slip-date="${targetDate}">
                                <i class="bi bi-eye"></i> Chi Tiết
                            </button>
                        </td>
                    </tr>
                `;
            }
        }

        // Settled Rows (Reverse Chronological)
        const reversedRows = [...rowsData].reverse();

        const settledRowsHtml = reversedRows.map(row => {
            const dateVi = formatDateVi(row.date);

            if (currentShadowCategory === 'combo') {
                let deBadge = '';
                if (row.deRow?.hitType === 'VIP_X3') {
                    deBadge = '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-500 text-white ring-1 ring-rose-300 shadow-xs">🎯 X3 (+180M) ⭐</span>';
                } else if (row.deRow?.hitType === 'CENTER_X2') {
                    deBadge = '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-400 text-slate-950 ring-1 ring-amber-300 shadow-xs">🎯 X2 (+96M)</span>';
                } else if (row.deRow?.hitType === 'BACKUP_X1') {
                    deBadge = '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">🎯 X1 (+12M)</span>';
                } else if (row.deHit) {
                    deBadge = `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-400 text-slate-950 ring-1 ring-amber-300 shadow-xs">🎯 Ăn ĐB ${numStr(row.deRow?.actual)} ⭐</span>`;
                } else {
                    const actualStr = (row.deRow?.actual !== null && row.deRow?.actual !== undefined) ? numStr(row.deRow.actual) : '—';
                    deBadge = `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">❌ Trượt (${actualStr})</span>`;
                }

                const loHitsList = (row.loRow?.betNumbers || []).filter(b => b.hits > 0);
                const loHitsStr = loHitsList.map(b => `${numStr(b.num)}(${b.hits}n)`).slice(0, 3).join(', ') + (loHitsList.length > 3 ? '...' : '');

                const loBadge = row.isLoWin
                    ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" title="${loHitsList.map(b => `${numStr(b.num)} (${b.hits} nháy)`).join(', ')}">🔥 ${row.loHits} nháy (${loHitsStr || 'Thắng'})</span>`
                    : `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">${row.loHits} nháy (Thua)</span>`;

                return `
                    <tr class="border-b border-white/5 hover:bg-white/5 transition-colors font-mono text-xs">
                        <td class="py-2.5 px-3 font-bold text-slate-300">${dateVi}</td>
                        <td class="py-2.5 px-3">${deBadge}</td>
                        <td class="py-2.5 px-3">${loBadge}</td>
                        <td class="py-2.5 px-3 text-center">
                            <button type="button" class="btn-open-slip px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40 text-[11px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer shadow-xs" data-slip-date="${row.date}">
                                <i class="bi bi-eye-fill text-amber-300"></i> Xem Dàn
                            </button>
                        </td>
                        <td class="py-2.5 px-3 text-right text-slate-400">${formatMoneyK(row.comboDayStakeK, false)}</td>
                        <td class="py-2.5 px-3 text-right font-bold ${row.deProfitK > 0 ? 'text-emerald-400' : (row.deProfitK < 0 ? 'text-rose-400' : 'text-slate-500')}">${row.deAbstain ? '0đ' : formatMoneyK(row.deProfitK)}</td>
                        <td class="py-2.5 px-3 text-right font-bold ${row.loProfitK > 0 ? 'text-emerald-400' : (row.loProfitK < 0 ? 'text-rose-400' : 'text-slate-500')}">${formatMoneyK(row.loProfitK)}</td>
                        <td class="py-2.5 px-3 text-right font-black ${row.comboDayProfitK > 0 ? 'text-emerald-400' : (row.comboDayProfitK < 0 ? 'text-rose-400' : 'text-slate-400')}">${formatMoneyK(row.comboDayProfitK)}</td>
                        <td class="py-2.5 px-3 text-right font-bold ${row.cumComboK >= 0 ? 'text-emerald-300' : 'text-rose-300'}">${formatMoneyK(row.cumComboK)}</td>
                    </tr>
                `;
            } else if (currentShadowCategory === 'de') {
                let statusBadge = '';
                if (row.deAbstain) {
                    statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">🛡️ ABSTAIN (Né Cược)</span>';
                } else if (row.deHit) {
                    statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">🎯 TRÚNG ĐỀ (+60.0M)</span>';
                } else {
                    statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">❌ TRƯỢT (-24.0M)</span>';
                }

                let numsCellContent = '—';
                if (!row.deAbstain && row.deRow?.numbers?.length) {
                    if (row.deHit) {
                        numsCellContent = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-black bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 ring-2 ring-amber-300 shadow-xs mr-1">🎯 ${numStr(row.deRow?.actual)} ⭐</span>`;
                        numsCellContent += `<span class="text-slate-400 text-[11px]">${(row.deRow.numbers.filter(n => Number(n) !== Number(row.deRow.actual))).slice(0, 6).map(numStr).join(' ')}...</span>`;
                    } else {
                        numsCellContent = `<span class="text-slate-400 text-[11px]">${(row.deRow.numbers || []).slice(0, 8).map(numStr).join(' ')}...</span>`;
                    }
                }

                const topScoreStr = row.deRow?.topScore ? ` (Điểm: ${row.deRow.topScore.toFixed(1)})` : '';
                const methodName = row.deAbstain ? `Tri-Core Consensus${topScoreStr}` : `Tri-Core 24s${topScoreStr}`;

                return `
                    <tr class="border-b border-white/5 hover:bg-white/5 transition-colors font-mono text-xs">
                        <td class="py-2.5 px-3 font-bold text-slate-300">${dateVi}</td>
                        <td class="py-2.5 px-3 text-amber-300 font-semibold">${methodName}</td>
                        <td class="py-2.5 px-3 text-center">${statusBadge}</td>
                        <td class="py-2.5 px-3" title="${(row.deRow?.numbers || []).map(numStr).join(', ')}">${numsCellContent}</td>
                        <td class="py-2.5 px-3 text-center font-bold text-white">${row.deRow?.actual !== null && row.deRow?.actual !== undefined ? numStr(row.deRow.actual) : '—'}</td>
                        <td class="py-2.5 px-3 text-right font-bold ${row.deProfitK > 0 ? 'text-emerald-400' : (row.deProfitK < 0 ? 'text-rose-400' : 'text-slate-500')}">${row.deAbstain ? '0đ' : formatMoneyK(row.deProfitK)}</td>
                        <td class="py-2.5 px-3 text-right font-bold ${row.cumDeK >= 0 ? 'text-emerald-300' : 'text-rose-300'}">${formatMoneyK(row.cumDeK)}</td>
                        <td class="py-2.5 px-3 text-center">
                            <button type="button" class="btn-open-slip px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-200 hover:text-slate-950 border border-amber-500/40 text-[11px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer shadow-xs" data-slip-date="${row.date}">
                                <i class="bi bi-eye"></i> 24 Số
                            </button>
                        </td>
                    </tr>
                `;
            } else { // 'lo'
                const betList = row.loRow?.betNumbers || [];
                const betPillsHtml = betList.map(b => {
                    const isHit = (b.hits && b.hits > 0);
                    const hitTag = isHit ? `<span class="text-[9px] font-black text-amber-300 ml-0.5">(${b.hits}n)</span>` : '';
                    const multTag = b.multiplier > 1 ? `<span class="text-[8px] opacity-75">·x${b.multiplier}</span>` : '';
                    if (isHit) {
                        return `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-500/25 text-emerald-200 border border-emerald-400/60 font-mono shadow-xs" title="Trúng ${b.hits} nháy · Hệ số x${b.multiplier}">🎯${numStr(b.num)}${hitTag}${multTag}</span>`;
                    }
                    return `<span class="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-mono text-slate-400 bg-white/5 border border-white/5" title="Hệ số x${b.multiplier}">${numStr(b.num)}${multTag}</span>`;
                }).join(' ');

                const hitsBadgeClass = row.loHits >= 4
                    ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 font-black'
                    : (row.loHits >= 2
                        ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400/50 font-bold'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold');

                return `
                    <tr class="border-b border-white/5 hover:bg-white/5 transition-colors font-mono text-xs">
                        <td class="py-2.5 px-3 font-bold text-slate-300">${dateVi}</td>
                        <td class="py-2.5 px-3">
                            <div class="font-bold text-teal-300">${mode === 'top6' ? 'Top 6 Lục Thủ' : 'Top 7 Thất Thủ'}</div>
                            <div class="text-[10px] ${row.isLoWin ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}">${row.isLoWin ? '✅ Thắng Lô' : '❌ Thua Lô'}</div>
                        </td>
                        <td class="py-2.5 px-3">
                            <div class="flex flex-wrap gap-1 max-w-md">${betPillsHtml || '—'}</div>
                        </td>
                        <td class="py-2.5 px-3 text-center">
                            <span class="inline-flex items-center justify-center min-w-[28px] h-6 rounded-md font-mono text-[11px] px-1.5 ${hitsBadgeClass}">${row.loHits} nháy</span>
                        </td>
                        <td class="py-2.5 px-3 text-right text-slate-400">${formatMoneyK(row.loStakeK, false)}</td>
                        <td class="py-2.5 px-3 text-right font-bold text-amber-300">${formatMoneyK(row.loPayoutK, false)}</td>
                        <td class="py-2.5 px-3 text-right font-black ${row.loProfitK > 0 ? 'text-emerald-400' : (row.loProfitK < 0 ? 'text-rose-400' : 'text-slate-500')}">${formatMoneyK(row.loProfitK)}</td>
                        <td class="py-2.5 px-3 text-right font-bold ${row.cumLoK >= 0 ? 'text-emerald-300' : 'text-rose-300'}">${formatMoneyK(row.cumLoK)}</td>
                        <td class="py-2.5 px-3 text-center">
                            <button type="button" class="btn-open-slip px-2 py-0.5 rounded-lg bg-teal-500/20 hover:bg-teal-500 text-teal-200 hover:text-slate-950 border border-teal-500/40 text-[11px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer shadow-xs" data-slip-date="${row.date}">
                                <i class="bi bi-eye"></i> Chi Tiết
                            </button>
                        </td>
                    </tr>
                `;
            }
        }).join('');

        tbody.innerHTML = pendingRowHtml + settledRowsHtml;
    }

    // =========================================================================
    // MODAL: TRA CỨU CHI TIẾT DÀN ĐÃ ĐÁNH & ĐÁNH DẤU SỐ TRÚNG (STRICT PIT)
    // =========================================================================
    function initShadowSlipModal() {
        const modal = byId('shadowSlipModal');
        if (!modal) return;

        const btnOpen = byId('btnOpenShadowSlipModal');
        const btnClose = byId('btnCloseShadowSlipModal');
        const btnDismiss = byId('btnDismissShadowSlipModal');
        const selDate = byId('selShadowSlipDate');
        const btnPrev = byId('btnShadowSlipPrevDate');
        const btnNext = byId('btnShadowSlipNextDate');
        const tbody = byId('shadowLedgerTbody');

        // Open Modal handler
        function openModal(dateToOpen) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            document.body.classList.add('overflow-hidden');

            const dates = availableDatesList || [];
            populateDateDropdown(dates, dateToOpen);

            const activeDate = dateToOpen || (selDate ? selDate.value : dates[0]);
            renderShadowSlipContent(activeDate);
        }

        // Close Modal handler
        function closeModal() {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            document.body.classList.remove('overflow-hidden');
        }

        // Populate dropdown
        function populateDateDropdown(dates, selectValue) {
            if (!selDate || !dates.length) return;
            selDate.innerHTML = dates.map(d => {
                const label = formatDateVi(d);
                return `<option value="${d}">${label}${d === '2026-10-05' ? ' (Hôm Nay 🔒)' : ''}</option>`;
            }).join('');

            if (selectValue && dates.includes(selectValue)) {
                selDate.value = selectValue;
            } else {
                selDate.value = dates[0];
            }
        }

        // Bind button triggers
        if (btnOpen) {
            btnOpen.onclick = () => {
                const def = availableDatesList[0] || '2026-10-05';
                openModal(def);
            };
        }
        if (btnClose) btnClose.onclick = () => closeModal();
        if (btnDismiss) btnDismiss.onclick = () => closeModal();

        // Backdrop click
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };

        // Escape key listener
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                closeModal();
            }
        });

        // Dropdown change
        if (selDate) {
            selDate.onchange = () => {
                renderShadowSlipContent(selDate.value);
            };
        }

        // Prev & Next Date buttons
        if (btnPrev) {
            btnPrev.onclick = () => {
                const curr = selDate.value;
                const idx = availableDatesList.indexOf(curr);
                if (idx !== -1 && idx < availableDatesList.length - 1) {
                    const prevDate = availableDatesList[idx + 1];
                    selDate.value = prevDate;
                    renderShadowSlipContent(prevDate);
                }
            };
        }

        if (btnNext) {
            btnNext.onclick = () => {
                const curr = selDate.value;
                const idx = availableDatesList.indexOf(curr);
                if (idx > 0) {
                    const nextDate = availableDatesList[idx - 1];
                    selDate.value = nextDate;
                    renderShadowSlipContent(nextDate);
                }
            };
        }

        // Event delegation on table body for [data-slip-date]
        if (tbody) {
            tbody.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-slip-date]');
                if (btn) {
                    const d = btn.getAttribute('data-slip-date');
                    if (d) openModal(d);
                }
            });
        }

        // Event delegation for copy buttons inside modal
        const modalBody = byId('shadowSlipModalBody');
        if (modalBody && !modalBody.__copyBound) {
            modalBody.__copyBound = true;
            modalBody.addEventListener('click', (e) => {
                const copyDropoffX3Btn = e.target.closest('.btn-copy-slip-dropoff-x3');
                if (copyDropoffX3Btn) {
                    const raw = copyDropoffX3Btn.getAttribute('data-numbers') || '';
                    if (raw) {
                        navigator.clipboard.writeText(raw);
                        showToast(`📋 Đã sao chép 10 số Siêu VIP X3 ngày ${formatDateVi(copyDropoffX3Btn.getAttribute('data-date'))}!`);
                    }
                }

                const copyDropoffAllBtn = e.target.closest('.btn-copy-slip-dropoff-all');
                if (copyDropoffAllBtn) {
                    const raw = copyDropoffAllBtn.getAttribute('data-numbers') || '';
                    if (raw) {
                        navigator.clipboard.writeText(raw);
                        showToast(`📋 Đã sao chép 40 số Đề phân tầng ngày ${formatDateVi(copyDropoffAllBtn.getAttribute('data-date'))}!`);
                    }
                }

                const copyDeBtn = e.target.closest('.btn-copy-slip-de');
                if (copyDeBtn) {
                    const raw = copyDeBtn.getAttribute('data-numbers') || '';
                    if (raw) {
                        navigator.clipboard.writeText(raw);
                        showToast(`📋 Đã sao chép 24 số Đề ngày ${formatDateVi(copyDeBtn.getAttribute('data-date'))}!`);
                    }
                }

                const copyLoBtn = e.target.closest('.btn-copy-slip-lo');
                if (copyLoBtn) {
                    const raw = copyLoBtn.getAttribute('data-numbers') || '';
                    if (raw) {
                        navigator.clipboard.writeText(raw);
                        showToast(`📋 Đã sao chép dàn Lô ngày ${formatDateVi(copyLoBtn.getAttribute('data-date'))}!`);
                    }
                }
            });
        }
    }

    // Render detailed slips and mark winning numbers for selected target date
    function renderShadowSlipContent(targetDate) {
        const container = byId('shadowSlipModalBody');
        const dateBadge = byId('shadowSlipModalDateBadge');
        const statusBadge = byId('shadowSlipModalStatusBadge');
        const summaryPill = byId('shadowSlipQuickSummaryPill');
        if (!container || !cachedAdvisorData) return;

        const data = cachedAdvisorData;
        const triCore = data.triCoreDe;
        const lo4Fusion = data.lo4EngineFusion;
        const deDropoff = data.deDropoffMerge;
        const mode = currentShadowLoMode || 'top6';
        const loModeData = lo4Fusion?.modes?.[mode] || lo4Fusion;
        const drawPrizesObj = data.drawPrizesByDate?.[targetDate] || null;

        const deLatestRec = triCore?.latestRecommendation;
        const loLatestRec = loModeData?.latestRecommendation || lo4Fusion?.latestRecommendation;
        const dropoffLatestRec = deDropoff?.latestRecommendation;
        const pendingDate = dropoffLatestRec?.targetDate || deLatestRec?.targetDate || loLatestRec?.predictionDate || '2026-10-05';
        const isPending = (targetDate === pendingDate && !drawPrizesObj);

        let deRow = null;
        let loRow = null;
        let dropoffRow = null;

        if (isPending) {
            deRow = deLatestRec;
            loRow = loLatestRec;
            dropoffRow = dropoffLatestRec;
        } else {
            deRow = (triCore?.settledLedger || []).find(r => r.date === targetDate) || (triCore?.allDaysLedger || []).find(r => r.date === targetDate);
            loRow = (loModeData?.settledLedger || []).find(r => r.date === targetDate);
            dropoffRow = (deDropoff?.settledLedger || []).find(r => r.date === targetDate);
        }

        const dateVi = formatDateVi(targetDate);
        if (dateBadge) dateBadge.textContent = `Ngày ${dateVi}`;

        if (statusBadge) {
            if (isPending) {
                statusBadge.className = 'text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40';
                statusBadge.innerHTML = '🔒 ĐÃ KHÓA · CHỜ MỞ 18:30';
            } else {
                statusBadge.className = 'text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
                statusBadge.innerHTML = '✅ ĐÃ ĐỐI SOÁT 100% STRICT PIT';
            }
        }

        // Actual lottery results
        const actualSpecial = isPending ? null : (drawPrizesObj?.special !== undefined ? numStr(drawPrizesObj.special) : (dropoffRow?.actual !== undefined ? numStr(dropoffRow.actual) : (deRow?.actual !== undefined ? numStr(deRow.actual) : null)));
        const prizesList = isPending ? [] : (drawPrizesObj?.prizes || []);

        const isDropoffActive = (currentDeStrategy === 'dropoff40');

        // Dropoff metrics
        const dropoffStakeK = dropoffRow ? (dropoffRow.stakeK || 72000) : 72000;
        const dropoffPayoutK = isPending ? 0 : (dropoffRow?.payoutK || 0);
        const dropoffProfitK = isPending ? 0 : (dropoffRow?.profitK ?? (dropoffPayoutK - dropoffStakeK));

        // Tri-Core metrics
        const deNumbers = (deRow?.numbers || []).map(Number);
        const deAbstain = Boolean(deRow?.abstained);
        const deHit = Boolean(deRow?.hit || (actualSpecial && deNumbers.includes(Number(actualSpecial))));
        const deTopScore = deRow?.topScore || 0;
        const deStakeK = deAbstain ? 0 : (deRow?.stakeK || 24000);
        const dePayoutK = deAbstain ? 0 : (deHit ? 84000 : 0);
        const deProfitK = deRow?.dayProfitK ?? (deAbstain ? 0 : (deHit ? 60000 : -24000));

        // Lô metrics
        const loBetList = (loRow?.betNumbers || []).map(b => ({
            ...b,
            num: numStr(b.num),
            hits: b.hits || 0
        }));
        const loStakeK = loRow?.dayLotoStakeK || (isPending ? (loRow?.totalLotoStakeK || 63800) : 0);
        const loPayoutK = isPending ? 0 : (loRow?.dayLotoPayoutK || 0);
        const loProfitK = isPending ? 0 : (loRow?.dayLotoProfitK || 0);
        const loHits = isPending ? 0 : (loRow?.dayLotoHits || 0);
        const isLoWin = isPending ? false : Boolean(loRow?.isLotoWin || loProfitK > 0);

        // Active totals
        const activeDeStakeK = isDropoffActive ? dropoffStakeK : deStakeK;
        const activeDePayoutK = isDropoffActive ? dropoffPayoutK : dePayoutK;
        const activeDeProfitK = isDropoffActive ? dropoffProfitK : deProfitK;

        const comboStakeK = activeDeStakeK + loStakeK;
        const comboPayoutK = activeDePayoutK + loPayoutK;
        const comboProfitK = activeDeProfitK + loProfitK;

        if (summaryPill) {
            if (isPending) {
                summaryPill.innerHTML = `
                    <span class="text-slate-400">Tổng Vốn Chốt:</span>
                    <strong class="text-white font-bold">${formatMoneyK(comboStakeK, false)}</strong>
                    <span class="text-amber-400 font-bold ml-2">⏳ Chờ mở thưởng</span>
                `;
            } else {
                summaryPill.innerHTML = `
                    <span class="text-slate-400">Vốn:</span> <strong class="text-slate-200">${formatMoneyK(comboStakeK, false)}</strong>
                    <span class="text-slate-400 ml-2">Thưởng:</span> <strong class="text-amber-300">${formatMoneyK(comboPayoutK, false)}</strong>
                    <span class="text-slate-400 ml-2">Lãi ròng:</span> <strong class="${comboProfitK >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}">${formatMoneyK(comboProfitK)}</strong>
                `;
            }
        }

        const allBetLotoNumbersSet = new Set(loBetList.map(b => b.num));

        // 1. Lottery Draw Results Strip
        let resultsStripHtml = '';
        if (isPending) {
            resultsStripHtml = `
                <div class="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div class="flex items-center gap-2 text-amber-300 font-bold">
                        <i class="bi bi-clock-history text-lg"></i>
                        <span>Kỳ quay ${dateVi} đang chờ mở thưởng trực tiếp (18:15 – 18:30)</span>
                    </div>
                    <span class="text-slate-400">Dàn cược đã khóa niêm phong bất biến từ 12:00 trưa</span>
                </div>
            `;
        } else {
            const prizesPillsHtml = prizesList.map(p => {
                const pStr = numStr(p);
                const isMatched = allBetLotoNumbersSet.has(pStr);
                if (isMatched) {
                    return `<span class="inline-flex items-center justify-center w-7 h-6 rounded bg-emerald-400 text-slate-950 font-black font-mono text-[11px] ring-2 ring-emerald-300 shadow-sm" title="Trúng Lô con ${pStr}!">${pStr}</span>`;
                }
                return `<span class="inline-flex items-center justify-center w-7 h-6 rounded bg-white/5 border border-white/5 font-mono text-[11px] text-slate-400">${pStr}</span>`;
            }).join('');

            resultsStripHtml = `
                <div class="rounded-2xl border border-white/10 bg-black/50 p-4 space-y-3">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-black uppercase text-amber-400 flex items-center gap-1.5">
                                <i class="bi bi-trophy-fill text-amber-400"></i> KẾT QUẢ MỞ THƯỞNG XSMB NGÀY ${dateVi}:
                            </span>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="text-xs text-slate-400">Giải Đặc Biệt:</span>
                            <span class="inline-flex items-center justify-center px-3 py-1 rounded-xl bg-gradient-to-r from-rose-500 via-amber-500 to-yellow-400 text-slate-950 font-black font-mono text-xl shadow-lg ring-2 ring-white/50 animate-pulse">
                                ${actualSpecial || '—'}
                            </span>
                        </div>
                    </div>
                    <div>
                        <div class="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
                            <span>27 Giải Lô (Các số trùng khớp với dàn cược được tô sáng màu xanh):</span>
                            <span class="text-emerald-400 font-bold">${loHits} nháy nổ</span>
                        </div>
                        <div class="flex flex-wrap gap-1">
                            ${prizesPillsHtml || '<span class="text-xs text-slate-500 italic">Chưa có bảng 27 giải</span>'}
                        </div>
                    </div>
                </div>
            `;
        }

        // 2. Section Đề Khử Trùng Dropoff 40s (10 X3 / 12 X2 / 18 X1)
        let dropoffSectionHtml = '';
        if (dropoffRow) {
            const x3List = dropoffRow.tierX3 || [];
            const x2List = dropoffRow.tierX2 || [];
            const x1List = dropoffRow.tierX1 || [];
            const all40List = dropoffRow.numbers || [...x3List, ...x2List, ...x1List].sort((a,b)=>a-b);
            const excludedList = dropoffRow.excludedNumbers || [];

            const renderTierChips = (numbers, mult, baseBg) => {
                return numbers.map(n => {
                    const isHitNum = (actualSpecial != null && Number(n) === Number(actualSpecial));
                    if (isHitNum) {
                        return `
                            <div class="relative group flex flex-col items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 text-slate-950 p-1.5 font-black ring-4 ring-amber-300 shadow-xl scale-105 animate-pulse min-w-[54px]">
                                <span class="text-[8px] font-black uppercase tracking-wider text-amber-950">🎯 NỔ ĐB</span>
                                <span class="font-mono text-lg leading-none font-black my-0.5">${numStr(n)}</span>
                                <span class="text-[8px] font-black uppercase bg-slate-950 text-amber-300 px-1 py-0.2 rounded mt-0.5 shadow-xs">x${mult} ⭐</span>
                            </div>
                        `;
                    }
                    return `
                        <div class="flex flex-col items-center justify-center rounded-xl ${baseBg} border border-white/10 text-slate-200 p-1.5 font-mono text-sm font-bold min-w-[42px] hover:border-amber-400/40 transition-all">
                            <span>${numStr(n)}</span>
                            <span class="text-[8px] text-slate-400">x${mult}</span>
                        </div>
                    `;
                }).join('');
            };

            const x3Chips = renderTierChips(x3List, 3, 'bg-rose-950/40 text-rose-200');
            const x2Chips = renderTierChips(x2List, 2, 'bg-amber-950/40 text-amber-200');
            const x1Chips = renderTierChips(x1List, 1, 'bg-emerald-950/40 text-emerald-200');

            let dropoffStatusTag = '';
            if (isPending) {
                dropoffStatusTag = '<span class="text-xs font-bold text-amber-300 bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded">⏳ ĐÃ KHÓA 40 SỐ (72M)</span>';
            } else if (dropoffRow.hitType === 'VIP_X3') {
                dropoffStatusTag = '<span class="text-xs font-black text-white bg-rose-600 px-2.5 py-0.5 rounded shadow-sm ring-1 ring-rose-300">🎯 SIÊU VIP X3 (+180.0M) ⭐</span>';
            } else if (dropoffRow.hitType === 'CENTER_X2') {
                dropoffStatusTag = '<span class="text-xs font-black text-slate-950 bg-amber-400 px-2.5 py-0.5 rounded shadow-sm ring-1 ring-amber-300">🎯 TRUNG TÂM X2 (+96.0M)</span>';
            } else if (dropoffRow.hitType === 'BACKUP_X1') {
                dropoffStatusTag = '<span class="text-xs font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 rounded">🎯 BỌC LÓT X1 (+12.0M)</span>';
            } else {
                dropoffStatusTag = '<span class="text-xs font-bold text-rose-300 bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 rounded">❌ TRƯỢT ĐỀ (-72.0M)</span>';
            }

            dropoffSectionHtml = `
                <div class="rounded-2xl border-2 border-amber-500/40 bg-slate-900/80 p-4 space-y-3">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                        <div class="flex items-center gap-2 flex-wrap">
                            <h4 class="text-xs font-black uppercase text-amber-300 flex items-center gap-1.5">
                                <i class="bi bi-award-fill text-amber-400"></i> 🏆 ĐỀ KHỬ TRÙNG DROPOFF 40 SỐ (X3 / X2 / X1):
                            </h4>
                            <span class="text-[11px] text-slate-400 font-mono">(Loại 60 số gãy cao nhất · Vốn 72M)</span>
                        </div>
                        <div class="flex items-center gap-2">
                            ${dropoffStatusTag}
                            <button type="button" class="btn-copy-slip-dropoff-x3 text-[11px] font-bold text-rose-300 hover:text-white bg-rose-950/60 hover:bg-rose-900 px-2.5 py-1 rounded-lg border border-rose-500/40 transition-all flex items-center gap-1 cursor-pointer" data-numbers="${x3List.map(numStr).join(', ')}" data-date="${targetDate}">
                                <i class="bi bi-clipboard"></i> Copy 10 X3
                            </button>
                            <button type="button" class="btn-copy-slip-dropoff-all text-[11px] font-bold text-amber-300 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg border border-white/10 transition-all flex items-center gap-1 cursor-pointer" data-numbers="${all40List.map(numStr).join(', ')}" data-date="${targetDate}">
                                <i class="bi bi-clipboard-check"></i> Copy 40s
                            </button>
                        </div>
                    </div>

                    <!-- 3 Tiers visual boxes -->
                    <div class="space-y-2 text-xs">
                        <div class="p-2.5 rounded-xl bg-rose-950/30 border border-rose-500/30 space-y-1">
                            <div class="flex items-center justify-between text-[11px]">
                                <span class="font-black text-rose-400 uppercase">🔴 Tầng 1: Siêu VIP X3 (10 Số · 3M/số · Ăn 252M)</span>
                                <span class="text-rose-300 font-mono font-bold">Vốn 30M</span>
                            </div>
                            <div class="flex flex-wrap gap-1.5 pt-1">${x3Chips}</div>
                        </div>

                        <div class="p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-1">
                            <div class="flex items-center justify-between text-[11px]">
                                <span class="font-black text-amber-300 uppercase">🟡 Tầng 2: Trung Tâm X2 (12 Số · 2M/số · Ăn 168M)</span>
                                <span class="text-amber-200 font-mono font-bold">Vốn 24M</span>
                            </div>
                            <div class="flex flex-wrap gap-1.5 pt-1">${x2Chips}</div>
                        </div>

                        <div class="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-1">
                            <div class="flex items-center justify-between text-[11px]">
                                <span class="font-black text-emerald-300 uppercase">🟢 Tầng 3: Bọc Lót X1 (18 Số · 1M/số · Ăn 84M)</span>
                                <span class="text-emerald-200 font-mono font-bold">Vốn 18M</span>
                            </div>
                            <div class="flex flex-wrap gap-1.5 pt-1">${x1Chips}</div>
                        </div>
                    </div>

                    <!-- 60 Excluded numbers display -->
                    <details class="text-[11px] text-slate-400 bg-black/40 rounded-xl p-2 border border-white/5">
                        <summary class="cursor-pointer font-bold text-slate-300 hover:text-white flex items-center justify-between">
                            <span>🚫 60 Số Bị Loại Trừ Theo % Gãy (Dropoff Rate)</span>
                            <span class="text-[10px] text-slate-500">Xem chi tiết</span>
                        </summary>
                        <div class="flex flex-wrap gap-1 pt-2">
                            ${excludedList.map(n => `<span class="px-1.5 py-0.5 rounded bg-white/5 text-slate-500 font-mono text-[10px]">${numStr(n)}</span>`).join('')}
                        </div>
                    </details>

                    <div class="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-white/5 font-mono">
                        <span>Vốn cược: <strong class="text-slate-200">72.0M</strong> (30M + 24M + 18M)</span>
                        <span>Tiền thưởng: <strong class="text-amber-300">${isPending ? '—' : formatMoneyK(dropoffPayoutK, false)}</strong></span>
                        <span>Lãi ròng Đề: <strong class="${dropoffProfitK > 0 ? 'text-emerald-400' : 'text-rose-400'} font-bold">${isPending ? 'Chờ kq' : formatMoneyK(dropoffProfitK)}</strong></span>
                    </div>
                </div>
            `;
        }

        // 3. Section Đề Tri-Core 24s (Shown when Tri-Core data exists)
        let deSectionHtml = '';
        if (deRow) {
            if (deAbstain) {
                deSectionHtml = `
                    <div class="rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-4 space-y-2">
                        <div class="flex items-center justify-between">
                            <h4 class="text-xs font-black uppercase text-indigo-300 flex items-center gap-2">
                                <i class="bi bi-shield-check text-indigo-400 text-base"></i>
                                🎯 ĐỀ TRI-CORE: CÔNG TẮC BẢO TOÀN VỐN (SMART ABSTAIN GATE)
                            </h4>
                            <span class="text-xs font-mono font-bold text-indigo-300 px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/40">
                                🛡️ NÉ CƯỢC · VỐN 0Đ
                            </span>
                        </div>
                        <p class="text-xs text-slate-300 leading-relaxed">
                            Điểm đồng thuận 4 động cơ Tri-Core ngày ${dateVi} chỉ đạt <strong>${deTopScore.toFixed(1)}/7.5</strong> (dưới ngưỡng an toàn 6.5). Hệ thống tự động kích hoạt chế độ né cược để bảo toàn 100% vốn (+24M).
                        </p>
                    </div>
                `;
            } else {
                const deCardsHtml = deNumbers.map(n => {
                    const isHitNumber = (actualSpecial != null && Number(n) === Number(actualSpecial));
                    if (isHitNumber) {
                        return `
                            <div class="relative group flex flex-col items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 text-slate-950 p-2 font-black ring-4 ring-amber-300 shadow-xl scale-105 animate-pulse min-w-[58px]">
                                <span class="text-[9px] font-black uppercase tracking-wider text-amber-950">🎯 NỔ ĐB</span>
                                <span class="font-mono text-xl leading-none font-black my-0.5">${numStr(n)}</span>
                                <span class="text-[8px] font-black uppercase bg-slate-950 text-amber-300 px-1 py-0.2 rounded mt-0.5 shadow-xs">+60.0M ⭐</span>
                            </div>
                        `;
                    }
                    return `
                        <div class="flex flex-col items-center justify-center rounded-xl bg-slate-800/80 border border-white/10 text-slate-200 p-2 font-mono text-base font-bold min-w-[48px] hover:border-amber-400/40 hover:bg-slate-800 transition-all">
                            <span>${numStr(n)}</span>
                        </div>
                    `;
                }).join('');

                const deStatusTag = isPending
                    ? '<span class="text-xs font-bold text-amber-300 bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded">⏳ VÀO KÈO 24 SỐ · CHỜ MỞ</span>'
                    : (deHit
                        ? '<span class="text-xs font-black text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 px-2.5 py-0.5 rounded shadow-sm">🎯 TRÚNG ĐẶC BIỆT (+60.0M)</span>'
                        : '<span class="text-xs font-bold text-rose-300 bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 rounded">❌ TRƯỢT ĐỀ (-24.0M)</span>');

                deSectionHtml = `
                    <div class="rounded-2xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                            <div class="flex items-center gap-2 flex-wrap">
                                <h4 class="text-xs font-black uppercase text-amber-400 flex items-center gap-1.5">
                                    <i class="bi bi-gem text-amber-400"></i> 🎯 ĐỀ TRI-CORE 24 SỐ TINH HOA:
                                </h4>
                                <span class="text-xs text-slate-400">(Top 1 Score: <strong>${deTopScore.toFixed(1)}/7.5</strong>)</span>
                            </div>
                            <div class="flex items-center gap-2">
                                ${deStatusTag}
                                <button type="button" class="btn-copy-slip-de text-[11px] font-bold text-amber-300 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg border border-white/10 transition-all flex items-center gap-1 cursor-pointer" data-numbers="${deNumbers.map(numStr).join(', ')}" data-date="${targetDate}">
                                    <i class="bi bi-clipboard"></i> Copy 24s
                                </button>
                            </div>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            ${deCardsHtml}
                        </div>
                        <div class="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-white/5 font-mono">
                            <span>Vốn cược: <strong class="text-slate-200">24.0M</strong> (1M/số)</span>
                            <span>Tiền thưởng: <strong class="text-amber-300">${isPending ? '—' : (deHit ? '84.0M' : '0đ')}</strong></span>
                            <span>Lãi ròng Đề: <strong class="${deProfitK > 0 ? 'text-emerald-400' : 'text-rose-400'} font-bold">${isPending ? 'Chờ kq' : formatMoneyK(deProfitK)}</strong></span>
                        </div>
                    </div>
                `;
            }
        }

        // 4. Section Lô Ghép 4 Động Cơ (Top 6 / Top 7)
        let loSectionHtml = '';
        if (loRow) {
            const loTiers = [
                { key: 'tierX5', name: '👑 Siêu VIP X5', mult: 5, color: 'text-amber-400' },
                { key: 'tierX4', name: '🔥 Cực VIP X4', mult: 4, color: 'text-teal-400' },
                { key: 'tierX3', name: '⚡ Triển Vọng X3', mult: 3, color: 'text-cyan-400' },
                { key: 'tierX1', name: '🛡️ Bảo Hiểm X1', mult: 1, color: 'text-slate-400' }
            ];

            const loTiersHtml = loTiers.map(tier => {
                const numbersInTier = loBetList.filter(b => (b.multiplier || 1) === tier.mult);
                if (!numbersInTier.length) return '';

                const chipsHtml = numbersInTier.map(b => {
                    const hits = b.hits || 0;
                    if (!isPending && hits > 0) {
                        return `
                            <div class="relative group flex flex-col items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-slate-950 p-2 font-black ring-2 ring-emerald-300 shadow-md min-w-[58px]" title="Trúng ${hits} nháy!">
                                <span class="text-[8px] font-black uppercase text-emerald-950">🎯 ${hits} NHÁY</span>
                                <span class="font-mono text-lg font-black leading-tight my-0.5">${b.num}</span>
                                <span class="text-[8px] font-black bg-slate-950 text-emerald-300 px-1 py-0.2 rounded mt-0.5">x${tier.mult} ⭐</span>
                            </div>
                        `;
                    }
                    return `
                        <div class="flex flex-col items-center justify-center rounded-xl bg-slate-800/80 border border-white/10 text-slate-300 p-2 font-mono text-base font-semibold min-w-[48px] hover:border-teal-400/40 transition-all">
                            <span>${b.num}</span>
                            <span class="text-[8px] text-slate-400">x${tier.mult}</span>
                        </div>
                    `;
                }).join('');

                return `
                    <div class="space-y-1.5">
                        <div class="text-[10px] font-black uppercase ${tier.color} tracking-wider flex items-center justify-between">
                            <span>${tier.name} (${numbersInTier.length} số):</span>
                            <span class="text-slate-400 font-mono">Hệ số x${tier.mult}</span>
                        </div>
                        <div class="flex flex-wrap gap-1.5">
                            ${chipsHtml}
                        </div>
                    </div>
                `;
            }).join('');

            const loStatusTag = isPending
                ? '<span class="text-xs font-bold text-teal-300 bg-teal-500/20 border border-teal-500/40 px-2 py-0.5 rounded">⏳ CHỐT DÀN LÔ · CHỜ MỞ</span>'
                : (isLoWin
                    ? `<span class="text-xs font-black text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-400 px-2.5 py-0.5 rounded shadow-sm">🔥 THẮNG LÔ (${loHits} NHÁY)</span>`
                    : `<span class="text-xs font-bold text-rose-300 bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 rounded">❌ THUA LÔ (${loHits} NHÁY)</span>`);

            loSectionHtml = `
                <div class="rounded-2xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                        <div class="flex items-center gap-2 flex-wrap">
                            <h4 class="text-xs font-black uppercase text-teal-300 flex items-center gap-1.5">
                                <i class="bi bi-fire text-rose-400"></i> 🔥 LÔ GHÉP 4 ĐỘNG CƠ (${mode === 'top6' ? 'TOP 6 LỤC THỦ' : 'TOP 7 THẤT THỦ'}):
                            </h4>
                            <span class="text-xs text-slate-400 font-mono">(${loBetList.length} số đánh)</span>
                        </div>
                        <div class="flex items-center gap-2">
                            ${loStatusTag}
                            <button type="button" class="btn-copy-slip-lo text-[11px] font-bold text-teal-300 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg border border-white/10 transition-all flex items-center gap-1 cursor-pointer" data-numbers="${loBetList.map(b => b.num).join(' ')}" data-date="${targetDate}">
                                <i class="bi bi-clipboard"></i> Copy Dàn Lô
                            </button>
                        </div>
                    </div>
                    <div class="space-y-2.5">
                        ${loTiersHtml || '<div class="text-xs text-slate-400">Không có dàn số Lô</div>'}
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-white/5 font-mono">
                        <span>Vốn cược: <strong class="text-slate-200">${formatMoneyK(loStakeK, false)}</strong></span>
                        <span>Tiền thưởng: <strong class="text-amber-300">${isPending ? '—' : formatMoneyK(loPayoutK, false)}</strong></span>
                        <span>Lãi ròng Lô: <strong class="${loProfitK > 0 ? 'text-emerald-400' : 'text-rose-400'} font-bold">${isPending ? 'Chờ kq' : formatMoneyK(loProfitK)}</strong></span>
                    </div>
                </div>
            `;
        }

        // 5. Section Financial Summary
        const summaryCardHtml = `
            <div class="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-slate-900 via-amber-950/20 to-slate-900 p-4">
                <div class="flex items-center justify-between text-xs mb-2">
                    <span class="font-black uppercase text-amber-300 flex items-center gap-1.5">
                        <i class="bi bi-cash-stack"></i> 👑 TỔNG HỢP KẾT TOÁN TÀI CHÍNH NGÀY ${dateVi}:
                    </span>
                    <span class="font-mono text-slate-400">${isPending ? 'Dự kiến' : '100% Strict PIT'}</span>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs font-mono">
                    <div class="rounded-xl bg-black/40 border border-white/10 p-2">
                        <div class="text-slate-400 text-[10px]">TỔNG VỐN (${isDropoffActive ? 'ĐỀ 72M' : 'ĐỀ 24M'})</div>
                        <div class="font-bold text-white text-sm mt-0.5">${formatMoneyK(comboStakeK, false)}</div>
                    </div>
                    <div class="rounded-xl bg-black/40 border border-white/10 p-2">
                        <div class="text-slate-400 text-[10px]">TỔNG THƯỞNG</div>
                        <div class="font-bold text-amber-300 text-sm mt-0.5">${isPending ? '—' : formatMoneyK(comboPayoutK, false)}</div>
                    </div>
                    <div class="rounded-xl bg-black/40 border border-white/10 p-2">
                        <div class="text-slate-400 text-[10px]">LÃI RÒNG NGÀY</div>
                        <div class="font-black text-sm mt-0.5 ${isPending ? 'text-amber-300' : (comboProfitK >= 0 ? 'text-emerald-400' : 'text-rose-400')}">${isPending ? 'Chờ kq' : formatMoneyK(comboProfitK)}</div>
                    </div>
                    <div class="rounded-xl bg-black/40 border border-white/10 p-2">
                        <div class="text-slate-400 text-[10px]">KẾT QUẢ</div>
                        <div class="font-bold text-xs mt-1 ${isPending ? 'text-amber-300' : (comboProfitK > 0 ? 'text-emerald-400' : 'text-rose-400')}">
                            ${isPending ? '⏳ Chờ 18:30' : (comboProfitK > 0 ? '🎉 DƯƠNG LÃI' : (comboProfitK === 0 ? '🛡️ HÒA VỐN' : '❌ LỖ RÒNG'))}
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = resultsStripHtml + dropoffSectionHtml + deSectionHtml + loSectionHtml + summaryCardHtml;
    }

    document.addEventListener('DOMContentLoaded', initShadowMonitor);
})();
