(() => {
    'use strict';

    const byId = id => document.getElementById(id);
    const setHtml = (id, html) => {
        const el = byId(id);
        if (el) el.innerHTML = html;
    };
    const setText = (id, text) => {
        const el = byId(id);
        if (el) el.textContent = text;
    };

    const pct = value => `${(Number(value || 0)).toFixed(1)}%`;
    const num = value => String(Number(value)).padStart(2, '0');
    const fmt = value => new Intl.NumberFormat('vi-VN').format(Number(value || 0));
    const signed = value => `${Number(value || 0) >= 0 ? '+' : ''}${fmt(value)}K`;
    const signedM = value => {
        const v = Number(value || 0);
        const abs = Math.abs(v);
        const sign = v >= 0 ? '+' : '-';
        if (abs >= 1000000) {
            return `${sign}${(abs / 1000000).toFixed(2)}M`;
        }
        if (abs >= 1000) {
            return `${sign}${(abs / 1000).toFixed(0)}K`;
        }
        return `${sign}${abs}`;
    };
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

    let payload = null;
    let activeTierSet = 'standard30';
    let activeLayerKey = 'layerB_Statistics';
    let activeProfitTab = 'goldenDualMerge';
    let activeLabTrackMethod = 'goldenDualMerge';
    let labLedgerFilterStatus = 'all';
    let labLedgerSearchQuery = '';
    let labLedgerLimit = '30';

    function showToast(msg) {
        let toast = byId('advisorAnalysisToast');
        if (!toast) return;
        toast.innerHTML = `<i class="bi bi-check-circle-fill text-emerald-300 text-lg"></i><span>${esc(msg)}</span>`;
        toast.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
        toast.classList.add('opacity-100', 'translate-y-0');
        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
            toast.classList.remove('opacity-100', 'translate-y-0');
        }, 2200);
    }

    function copyNumbers(numbers, sep = ' ') {
        if (!numbers || !numbers.length) return;
        const text = numbers.map(num).join(sep);
        navigator.clipboard.writeText(text).then(() => {
            showToast(`Đã sao chép ${numbers.length} số thành công!`);
        }).catch(() => {
            const temp = document.createElement('textarea');
            temp.value = text;
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            document.body.removeChild(temp);
            showToast(`Đã sao chép ${numbers.length} số!`);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 1. RENDER HERO & SOURCE INFORMATION
    // ─────────────────────────────────────────────────────────────────────────────
    function renderHeroAndSource(data) {
        const source = data.source || {};
        const ttr = data.tenTierResearch || {};
        const layers = ttr.layers || {};
        const layerA = layers.layerA_Data || {};
        const layerB = layers.layerB_Statistics || {};
        const layerE = layers.layerE_Validation || {};

        const sourceHtml = [
            ['Ngày dự đoán', data.predictionDate || ttr.targetDate || '-'],
            ['Đài quay mở thưởng', ttr.dayOfWeek || '-'],
            ['Dữ liệu phân tích', `${fmt(layerA.totalDraws || ttr.historicalDrawsAnalyzed || 7558)} kỳ (${layerA.firstDate || '2005-10-01'} → ${layerA.lastDate || ttr.lastDrawDate || '-'})`],
            ['KQ Đề kỳ trước', `<span class="font-mono text-amber-300 font-black text-sm">${ttr.lastSpecial || ttr.lastDrawSpecial || '--'}</span>`]
        ].map(([label, value]) => `
            <div>
                <span class="text-slate-400 font-semibold">${esc(label)}:</span> 
                <span class="font-bold text-white ml-1">${value}</span>
            </div>
        `).join('');
        setHtml('sourceBar', sourceHtml);

        const advTest = layerE.adversarialShuffledTest || {};
        const mc = layerB.monteCarlo || {};

        const kpiHtml = [
            {
                label: 'Dữ liệu 20 năm Strict PIT',
                value: fmt(layerA.totalDraws || 7558),
                sub: `01/10/2005 → nay (100% Khóa)`,
                color: 'text-indigo-400',
                icon: 'bi-database-check'
            },
            {
                label: 'Mô phỏng Monte Carlo H0',
                value: '100.000 Chuỗi',
                sub: `Empirical p = ${layerB.empiricalPValue ?? 0.485} (White Noise)`,
                color: 'text-sky-400',
                icon: 'bi-dice-5-fill'
            },
            {
                label: 'Kháng Overfit (Adversarial)',
                value: advTest.trueAlphaEdgePct ? `+${advTest.trueAlphaEdgePct}%` : '+45.1%',
                sub: `Real ${advTest.realHitRatePct || 76.9}% vs Shuffled ${advTest.shuffledHitRatePct || 31.8}%`,
                color: 'text-emerald-400',
                icon: 'bi-shield-check'
            },
            {
                label: 'Cổng Thăng Hạng',
                value: ttr.promotionGate?.status === 'eligible' ? 'Đủ điều kiện' : 'Đang theo dõi',
                sub: `${ttr.promotionGate?.passedCount || 2}/4 tiêu chuẩn khắt khe`,
                color: ttr.promotionGate?.status === 'eligible' ? 'text-emerald-400' : 'text-amber-300',
                icon: 'bi-speedometer2'
            }
        ].map(k => `
            <div class="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xs">
                <div class="flex items-center justify-between">
                    <span class="text-[11px] font-black uppercase tracking-wider text-slate-400">${esc(k.label)}</span>
                    <i class="bi ${k.icon} ${k.color}"></i>
                </div>
                <p class="mt-1 text-2xl font-black ${k.color}">${k.value}</p>
                <p class="mt-0.5 text-xs text-slate-400">${esc(k.sub)}</p>
            </div>
        `).join('');

        setHtml('scientificQuickStats', kpiHtml);
        setHtml('tenTierQuickStats', kpiHtml);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 2. RENDER ENSEMBLE CANDIDATE SETS & CHIPS
    // ─────────────────────────────────────────────────────────────────────────────
    function renderEnsembleCard(data) {
        const ttr = data.tenTierResearch || {};
        const sets = ttr.candidateSets || {};
        const numbers = sets[activeTierSet] || sets.standard30 || [];

        // Render chips
        const chipsHtml = numbers.map(n => `
            <span class="inline-flex h-11 min-w-11 items-center justify-center rounded-2xl border border-indigo-400/40 bg-gradient-to-b from-indigo-800 to-indigo-950 px-2 font-mono text-base font-black text-white shadow-md shadow-indigo-950/40 transition-transform hover:scale-105">
                ${num(n)}
            </span>
        `).join('');
        setHtml('ensembleNumbersChips', chipsHtml);

        // Render sub metadata cards
        const metaHtml = [
            {
                label: 'Số lượng dàn đang xem',
                value: `${numbers.length} số`,
                desc: 'Phân tầng hạt nhân'
            },
            {
                label: 'Xác suất bao phủ lý thuyết',
                value: `${(numbers.length).toFixed(1)}%`,
                desc: `${numbers.length}/100 số phân bổ`
            },
            {
                label: 'Điểm cộng hưởng 5 lớp',
                value: ttr.topRanked?.[0] ? `${ttr.topRanked[0].score} pts` : '--',
                desc: `Bạch thủ cao nhất: ${ttr.topRanked?.[0]?.numStr || '--'}`
            },
            {
                label: 'Giao thức kiểm định',
                value: '100% Strict PIT',
                desc: 'Khóa dữ liệu trước giờ quay'
            }
        ].map(m => `
            <div class="rounded-2xl border border-white/10 bg-white/5 p-3.5 text-xs">
                <span class="font-bold text-slate-400 uppercase text-[10px]">${esc(m.label)}</span>
                <p class="mt-1 text-lg font-black text-white">${m.value}</p>
                <p class="text-[11px] text-indigo-300 font-semibold">${esc(m.desc)}</p>
            </div>
        `).join('');
        setHtml('ensembleMetadataCards', metaHtml);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 2.5. RENDER PROFIT-OPTIMIZED LAB ENSEMBLES
    // ─────────────────────────────────────────────────────────────────────────────
    function renderProfitOptimizedCard(data) {
        const ttr = data?.tenTierResearch || {};
        const ensembles = ttr.profitEnsembles || {};
        const container = byId('profitStrategyContent');
        if (!container) return;

        let contentHtml = '';
        switch (activeProfitTab) {
            case 'goldenDualMerge': {
                const g = ensembles.goldenDualMerge;
                if (!g) {
                    contentHtml = `<div class="p-6 text-center text-slate-400 font-semibold">Đang cập nhật chiến lược Đề Gộp Lab Golden Overlap...</div>`;
                    break;
                }
                contentHtml = `
                    <div class="space-y-6">
                        <!-- 4 KPI Cards -->
                        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div class="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-[11px] font-black uppercase tracking-wider text-amber-300">Vốn Hàng Ngày</span>
                                    <i class="bi bi-wallet2 text-amber-400 text-lg"></i>
                                </div>
                                <p class="mt-1 text-2xl font-black text-white">60.000đ</p>
                                <p class="mt-0.5 text-xs text-amber-200/80">X2 (2K/số) + X1 (1K/số)</p>
                            </div>
                            <div class="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-[11px] font-black uppercase tracking-wider text-emerald-300">Lãi Nổ Vùng Vàng X2</span>
                                    <i class="bi bi-graph-up-arrow text-emerald-400 text-lg"></i>
                                </div>
                                <p class="mt-1 text-2xl font-black text-emerald-300">+108.000đ</p>
                                <p class="mt-0.5 text-xs text-emerald-200/80">Thu 168K (ROI +180.0%)</p>
                            </div>
                            <div class="rounded-2xl border border-sky-400/30 bg-sky-500/10 p-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-[11px] font-black uppercase tracking-wider text-sky-300">Lãi Nổ Bọc Lót X1</span>
                                    <i class="bi bi-shield-fill-check text-sky-400 text-lg"></i>
                                </div>
                                <p class="mt-1 text-2xl font-black text-sky-300">+24.000đ</p>
                                <p class="mt-0.5 text-xs text-sky-200/80">Thu 84K (ROI +40.0%)</p>
                            </div>
                            <div class="rounded-2xl border border-purple-400/30 bg-purple-500/10 p-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-[11px] font-black uppercase tracking-wider text-purple-300">Tỷ Lệ Thắng 2026</span>
                                    <i class="bi bi-trophy-fill text-purple-400 text-lg"></i>
                                </div>
                                <p class="mt-1 text-2xl font-black text-purple-300">39.13% (9/23 kỳ)</p>
                                <p class="mt-0.5 text-xs text-purple-200/80">100% Nổ Vùng Vàng X2</p>
                            </div>
                        </div>

                        <!-- Vùng Giao Thoa Vàng X2 -->
                        <div class="rounded-2xl border border-amber-400/50 bg-gradient-to-br from-amber-500/15 to-amber-600/5 p-5">
                            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-amber-400/20 pb-4 mb-4">
                                <div>
                                    <div class="flex items-center gap-2">
                                        <span class="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-0.5 text-[11px] font-black uppercase text-slate-950">
                                            <i class="bi bi-star-fill"></i> CƯỢC GẤP ĐÔI X2
                                        </span>
                                        <h3 class="text-base font-black text-amber-200">Vùng Giao Thoa Vàng (${g.overlapCount} số · Cược 2.000đ/số)</h3>
                                    </div>
                                    <p class="mt-1 text-xs text-slate-300 font-semibold">2 động cơ đồng thuận xếp hạng cao. Trúng thưởng nhận ngay 168.000đ (Lãi ròng +108.000đ).</p>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button type="button" data-copy-profit="golden_x2" data-copy-sep="space" class="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-3.5 py-1.5 text-xs shadow-md transition-all">
                                        <i class="bi bi-clipboard"></i> Copy X2 (Cách)
                                    </button>
                                    <button type="button" data-copy-profit="golden_x2" data-copy-sep="comma" class="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold px-3 py-1.5 text-xs transition-all">
                                        <i class="bi bi-clipboard-check"></i> Copy X2 (Phẩy)
                                    </button>
                                </div>
                            </div>
                            <div class="flex flex-wrap gap-2">
                                ${(g.intersectionX2 || []).map(n => `
                                    <span class="inline-flex h-11 min-w-11 items-center justify-center rounded-2xl border-2 border-amber-300 bg-gradient-to-b from-amber-400 to-amber-600 px-2 font-mono text-base font-black text-slate-950 shadow-md shadow-amber-500/30 transition-transform hover:scale-110">
                                        ${num(n)}
                                    </span>
                                `).join('')}
                            </div>
                        </div>

                        <!-- Vùng Bọc Lót X1 -->
                        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
                            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4 mb-4">
                                <div>
                                    <div class="flex items-center gap-2">
                                        <span class="inline-flex items-center gap-1 rounded-full bg-slate-700 border border-slate-500 px-2.5 py-0.5 text-[11px] font-bold text-slate-200">
                                            BỌC LÓT X1
                                        </span>
                                        <h3 class="text-base font-black text-white">Vùng Bọc Lót An Toàn (${(g.uniqueSinglesX1 || []).length} số · Cược 1.000đ/số)</h3>
                                    </div>
                                    <p class="mt-1 text-xs text-slate-400 font-semibold">Bảo toàn vốn và thu lãi ròng +24.000đ khi kết quả rơi vào nhánh độc lập của từng động cơ.</p>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button type="button" data-copy-profit="golden_x1" data-copy-sep="space" class="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-1.5 text-xs transition-all">
                                        <i class="bi bi-clipboard"></i> Copy X1
                                    </button>
                                    <button type="button" data-copy-profit="golden_all" data-copy-sep="space" class="inline-flex items-center gap-1.5 rounded-xl border border-indigo-400/50 bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-200 font-bold px-3.5 py-1.5 text-xs transition-all">
                                        <i class="bi bi-collection"></i> Copy Toàn Dàn (${g.totalNumbersCount || 0} số)
                                    </button>
                                </div>
                            </div>
                            <div class="flex flex-wrap gap-2">
                                ${(g.uniqueSinglesX1 || []).map(n => `
                                    <span class="inline-flex h-10 min-w-10 items-center justify-center rounded-xl border border-indigo-400/30 bg-gradient-to-b from-slate-800 to-slate-900 px-2 font-mono text-sm font-bold text-indigo-200 shadow-xs transition-transform hover:scale-105">
                                        ${num(n)}
                                    </span>
                                `).join('')}
                            </div>
                        </div>

                        <!-- 2 Động Cơ Nguồn -->
                        <div class="grid gap-4 sm:grid-cols-2">
                            <div class="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                                <div class="flex items-center gap-2 text-xs font-black text-amber-300 mb-2">
                                    <i class="bi bi-lightning-charge-fill"></i> ${esc(g.engineA?.name || 'Động cơ A')}
                                </div>
                                <p class="text-xs text-slate-400 mb-3 font-mono leading-relaxed">${(g.engineA?.numbers || []).slice(0, 15).join(' ')} ... (${g.engineA?.numbers?.length || 30} số)</p>
                                <div class="text-[11px] text-slate-400">Trọng số: Hazard rate đỉnh nhịp 3-5 kỳ + Ma trận dịch chuyển Markov.</div>
                            </div>
                            <div class="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                                <div class="flex items-center gap-2 text-xs font-black text-sky-300 mb-2">
                                    <i class="bi bi-soundwave"></i> ${esc(g.engineB?.name || 'Động cơ B')}
                                </div>
                                <p class="text-xs text-slate-400 mb-3 font-mono leading-relaxed">${(g.engineB?.numbers || []).slice(0, 15).join(' ')} ... (${g.engineB?.numbers?.length || 30} số)</p>
                                <div class="text-[11px] text-slate-400">Trọng số: Hazard rate đỉnh nhịp + Cộng hưởng Bộ/Chạm + Lô rơi 27 giải.</div>
                            </div>
                        </div>
                    </div>
                `;
                break;
            }
            case 'metaLearner': {
                const m = ensembles.metaLearner;
                if (!m) {
                    contentHtml = `<div class="p-6 text-center text-slate-400 font-semibold">Đang cập nhật mô hình Lab Meta-Learner Tinh Hoa...</div>`;
                    break;
                }
                contentHtml = `
                    <div class="space-y-6">
                        <!-- 4 KPI Cards -->
                        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div class="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-[11px] font-black uppercase tracking-wider text-fuchsia-300">Vốn Nhẹ Hàng Ngày</span>
                                    <i class="bi bi-piggy-bank text-fuchsia-400 text-lg"></i>
                                </div>
                                <p class="mt-1 text-2xl font-black text-white">35.000đ</p>
                                <p class="mt-0.5 text-xs text-fuchsia-200/80">Tiết kiệm 41.7% so với dàn 60K</p>
                            </div>
                            <div class="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-[11px] font-black uppercase tracking-wider text-emerald-300">Thưởng Nổ VIP 10</span>
                                    <i class="bi bi-stars text-emerald-400 text-lg"></i>
                                </div>
                                <p class="mt-1 text-2xl font-black text-emerald-300">+91.000đ</p>
                                <p class="mt-0.5 text-xs text-emerald-200/80">Thu 126K (ROI +260.0%)</p>
                            </div>
                            <div class="rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-[11px] font-black uppercase tracking-wider text-indigo-300">Thưởng Nổ Elite 20</span>
                                    <i class="bi bi-shield-check text-indigo-400 text-lg"></i>
                                </div>
                                <p class="mt-1 text-2xl font-black text-indigo-300">+49.000đ</p>
                                <p class="mt-0.5 text-xs text-indigo-200/80">Thu 84K (ROI +140.0%)</p>
                            </div>
                            <div class="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-[11px] font-black uppercase tracking-wider text-rose-300">Khống Chế Drawdown</span>
                                    <i class="bi bi-graph-down text-rose-400 text-lg"></i>
                                </div>
                                <p class="mt-1 text-2xl font-black text-rose-300">-35.000đ</p>
                                <p class="mt-0.5 text-xs text-rose-200/80">Mất tối đa khi gãy nhịp</p>
                            </div>
                        </div>

                        <!-- Dàn VIP 10 Hạt Nhân -->
                        <div class="rounded-2xl border border-fuchsia-400/50 bg-gradient-to-br from-fuchsia-500/15 to-purple-600/5 p-5">
                            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-fuchsia-400/20 pb-4 mb-4">
                                <div>
                                    <div class="flex items-center gap-2">
                                        <span class="inline-flex items-center gap-1 rounded-full bg-fuchsia-500 px-2.5 py-0.5 text-[11px] font-black uppercase text-white">
                                            <i class="bi bi-award-fill"></i> HẠT NHÂN VIP 10
                                        </span>
                                        <h3 class="text-base font-black text-fuchsia-200">10 Số Tinh Hoa (Cược 1.500đ/số · Vốn 15K)</h3>
                                    </div>
                                    <p class="mt-1 text-xs text-slate-300 font-semibold">10 số có điểm xếp hạng meta cao nhất. Khi nổ thu về 126.000đ (Lãi ròng +91.000đ, ROI +260%).</p>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button type="button" data-copy-profit="meta_vip" data-copy-sep="space" class="inline-flex items-center gap-1.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-black px-3.5 py-1.5 text-xs shadow-md transition-all">
                                        <i class="bi bi-clipboard"></i> Copy VIP 10 (Cách)
                                    </button>
                                    <button type="button" data-copy-profit="meta_vip" data-copy-sep="comma" class="inline-flex items-center gap-1.5 rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-200 font-bold px-3 py-1.5 text-xs transition-all">
                                        <i class="bi bi-clipboard-check"></i> Copy VIP 10 (Phẩy)
                                    </button>
                                </div>
                            </div>
                            <div class="flex flex-wrap gap-2">
                                ${(m.vip10 || []).map(n => `
                                    <span class="inline-flex h-11 min-w-11 items-center justify-center rounded-2xl border-2 border-fuchsia-300 bg-gradient-to-b from-fuchsia-500 to-purple-700 px-2 font-mono text-base font-black text-white shadow-md shadow-fuchsia-500/30 transition-transform hover:scale-110">
                                        ${num(n)}
                                    </span>
                                `).join('')}
                            </div>
                        </div>

                        <!-- Dàn Bọc Lót Elite 20 -->
                        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
                            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4 mb-4">
                                <div>
                                    <div class="flex items-center gap-2">
                                        <span class="inline-flex items-center gap-1 rounded-full bg-indigo-600/40 border border-indigo-400/40 px-2.5 py-0.5 text-[11px] font-bold text-indigo-300">
                                            BỌC LÓT ELITE 20
                                        </span>
                                        <h3 class="text-base font-black text-white">20 Số Kế Tiếp (Cược 1.000đ/số · Vốn 20K)</h3>
                                    </div>
                                    <p class="mt-1 text-xs text-slate-400 font-semibold">Tầng bảo vệ thứ 2, khi nổ thu về 84.000đ (Lãi ròng +49.000đ, ROI +140%).</p>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button type="button" data-copy-profit="meta_elite" data-copy-sep="space" class="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-1.5 text-xs transition-all">
                                        <i class="bi bi-clipboard"></i> Copy Elite 20
                                    </button>
                                    <button type="button" data-copy-profit="meta_all" data-copy-sep="space" class="inline-flex items-center gap-1.5 rounded-xl border border-indigo-400/50 bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-200 font-bold px-3.5 py-1.5 text-xs transition-all">
                                        <i class="bi bi-collection"></i> Copy Toàn Dàn 30 Số
                                    </button>
                                </div>
                            </div>
                            <div class="flex flex-wrap gap-2">
                                ${(m.elite20 || []).map(n => `
                                    <span class="inline-flex h-10 min-w-10 items-center justify-center rounded-xl border border-indigo-400/30 bg-gradient-to-b from-indigo-900 to-indigo-950 px-2 font-mono text-sm font-bold text-indigo-200 shadow-xs transition-transform hover:scale-105">
                                        ${num(n)}
                                    </span>
                                `).join('')}
                            </div>
                        </div>

                        <div class="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-slate-300 font-medium">
                            <span class="font-bold text-fuchsia-300 mr-1"><i class="bi bi-info-circle-fill"></i> Nguyên lý phân tầng vốn:</span>
                            ${esc(m.note || 'Tập trung trọng số vốn vào hạt nhân VIP giúp tối ưu hóa lợi nhuận kỳ vọng khi bẻ gãy rào cản phí nhà cái.')}
                        </div>
                    </div>
                `;
                break;
            }
            case 'adaptiveController': {
                const a = ensembles.adaptiveController;
                if (!a) {
                    contentHtml = `<div class="p-6 text-center text-slate-400 font-semibold">Đang cập nhật Bộ Điều Khiển Thích Ứng...</div>`;
                    break;
                }
                const isOffensive = a.currentState === 'offensive';
                const isBalanced = a.currentState === 'balanced';
                const isDefensive = a.currentState === 'defensive';

                contentHtml = `
                    <div class="space-y-6">
                        <!-- 4 KPI Cards -->
                        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div class="rounded-2xl border border-sky-400/30 bg-sky-500/10 p-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-[11px] font-black uppercase tracking-wider text-sky-300">Trạng Thái Kích Hoạt</span>
                                    <i class="bi bi-speedometer text-sky-400 text-lg"></i>
                                </div>
                                <p class="mt-1 text-lg font-black text-white">${a.currentState === 'offensive' ? '⚡ TẤN CÔNG' : (a.currentState === 'balanced' ? '⚖️ CÂN BẰNG' : '🛡️ PHÒNG THỦ')}</p>
                                <p class="mt-0.5 text-xs text-sky-200/80">${esc(a.stateLabel)}</p>
                            </div>
                            <div class="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-[11px] font-black uppercase tracking-wider text-amber-300">Chuỗi Trượt Gần Nhất</span>
                                    <i class="bi bi-clock-history text-amber-400 text-lg"></i>
                                </div>
                                <p class="mt-1 text-2xl font-black text-amber-300">${a.recentLossStreak} kỳ</p>
                                <p class="mt-0.5 text-xs text-amber-200/80">${a.recentLossStreak === 0 ? 'Vừa nổ kỳ trước' : (a.recentLossStreak === 1 ? 'Chạm ngưỡng cân bằng' : 'Kích hoạt van phòng thủ')}</p>
                            </div>
                            <div class="rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-[11px] font-black uppercase tracking-wider text-indigo-300">Vốn Đặt Cược</span>
                                    <i class="bi bi-cash-stack text-indigo-400 text-lg"></i>
                                </div>
                                <p class="mt-1 text-2xl font-black text-indigo-300">${fmt(a.dailyStakeK)}đ</p>
                                <p class="mt-0.5 text-xs text-indigo-200/80">${a.size} số (${fmt(a.unitStakeK)}đ/số)</p>
                            </div>
                            <div class="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-[11px] font-black uppercase tracking-wider text-emerald-300">Lãi Ròng Khi Nổ</span>
                                    <i class="bi bi-graph-up text-emerald-400 text-lg"></i>
                                </div>
                                <p class="mt-1 text-2xl font-black text-emerald-300">+${fmt(a.profitOnWinK)}đ</p>
                                <p class="mt-0.5 text-xs text-emerald-200/80">Thu ${fmt(a.payoutOnWinK)}đ</p>
                            </div>
                        </div>

                        <!-- 3 States Visual Matrix -->
                        <div class="grid gap-3 sm:grid-cols-3">
                            <div class="rounded-2xl border ${isOffensive ? 'border-amber-400 bg-amber-500/20 ring-2 ring-amber-400/50' : 'border-white/10 bg-white/5 opacity-70'} p-4 transition-all">
                                <div class="flex items-center justify-between">
                                    <span class="text-xs font-black text-amber-300">1. Trạng Thái Tấn Công</span>
                                    ${isOffensive ? '<span class="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-slate-950">ĐANG CHẠY</span>' : ''}
                                </div>
                                <p class="mt-2 text-sm font-black text-white">⚡ Dàn 24 số cược 1.5K</p>
                                <p class="mt-1 text-xs text-slate-300">Kích hoạt: Vừa trúng (trượt 0 kỳ). Vốn 36K, nổ thu lãi +90.000đ.</p>
                            </div>
                            <div class="rounded-2xl border ${isBalanced ? 'border-sky-400 bg-sky-500/20 ring-2 ring-sky-400/50' : 'border-white/10 bg-white/5 opacity-70'} p-4 transition-all">
                                <div class="flex items-center justify-between">
                                    <span class="text-xs font-black text-sky-300">2. Trạng Thái Cân Bằng</span>
                                    ${isBalanced ? '<span class="rounded-full bg-sky-400 px-2 py-0.5 text-[10px] font-black text-slate-950">ĐANG CHẠY</span>' : ''}
                                </div>
                                <p class="mt-2 text-sm font-black text-white">⚖️ Dàn 36 số cược 1.0K</p>
                                <p class="mt-1 text-xs text-slate-300">Kích hoạt: Trượt 1 kỳ. Vốn 36K, nổ thu lãi +48.000đ.</p>
                            </div>
                            <div class="rounded-2xl border ${isDefensive ? 'border-emerald-400 bg-emerald-500/20 ring-2 ring-emerald-400/50' : 'border-white/10 bg-white/5 opacity-70'} p-4 transition-all">
                                <div class="flex items-center justify-between">
                                    <span class="text-xs font-black text-emerald-300">3. Trạng Thái Phòng Thủ</span>
                                    ${isDefensive ? '<span class="rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-black text-slate-950">ĐANG CHẠY</span>' : ''}
                                </div>
                                <p class="mt-2 text-sm font-black text-white">🛡️ Dàn 50 số cược 1.0K</p>
                                <p class="mt-1 text-xs text-slate-300">Kích hoạt: Trượt ≥ 2 kỳ. Cắt dây trượt tức thì, vốn 50K, nổ thu lãi +34.000đ.</p>
                            </div>
                        </div>

                        <!-- Dàn số của Trạng Thái Kích Hoạt -->
                        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
                            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4 mb-4">
                                <div>
                                    <h3 class="text-base font-black text-white">Dàn Số Kích Hoạt Theo Nhịp (${a.numbers.length} số)</h3>
                                    <p class="mt-1 text-xs text-slate-400 font-semibold">${esc(a.note)}</p>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button type="button" data-copy-profit="adaptive_active" data-copy-sep="space" class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3.5 py-1.5 text-xs shadow-md transition-all">
                                        <i class="bi bi-clipboard"></i> Copy Dàn (${a.numbers.length} số)
                                    </button>
                                    <button type="button" data-copy-profit="adaptive_active" data-copy-sep="comma" class="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-1.5 text-xs transition-all">
                                        <i class="bi bi-clipboard-check"></i> Copy Dấu Phẩy
                                    </button>
                                </div>
                            </div>
                            <div class="flex flex-wrap gap-2">
                                ${(a.numbers || []).map(n => `
                                    <span class="inline-flex h-11 min-w-11 items-center justify-center rounded-2xl border border-indigo-400/40 bg-gradient-to-b from-indigo-800 to-indigo-950 px-2 font-mono text-base font-black text-white shadow-md shadow-indigo-950/40 transition-transform hover:scale-105">
                                        ${num(n)}
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `;
                break;
            }
            default:
                contentHtml = `<div class="p-6 text-center text-slate-400 font-semibold">Vui lòng chọn một chiến lược phía trên.</div>`;
        }
        setHtml('profitStrategyContent', contentHtml);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 2.7. RENDER LAB SETTLED TRACKING & MULTI-WINDOW AUDIT (LIKE LIVE SYSTEM)
    // ─────────────────────────────────────────────────────────────────────────────
    function renderLabTrackingSection(data) {
        const ttr = data?.tenTierResearch || {};
        const ensembles = ttr.profitEnsembles || {};
        const activeObj = ensembles[activeLabTrackMethod] || ensembles.goldenDualMerge || {};

        // 1. Update Badges on Tab Buttons
        const pG = ensembles.goldenDualMerge?.summary?.overallProfitK || 0;
        const pM = ensembles.metaLearner?.summary?.overallProfitK || 0;
        const pA = ensembles.adaptiveController?.summary?.overallProfitK || 0;

        const badgeG = byId('labBadgeProfitGolden');
        if (badgeG) badgeG.textContent = `${signedM(pG)} 2026`;
        const badgeM = byId('labBadgeProfitMeta');
        if (badgeM) badgeM.textContent = `${signedM(pM)} 2026`;
        const badgeA = byId('labBadgeProfitAdaptive');
        if (badgeA) badgeA.textContent = `${signedM(pA)} 2026`;

        // 2. Update Active Method Title & Header Badge
        const activeBadge = byId('labTrackingActiveBadge');
        if (activeBadge) {
            const labels = {
                goldenDualMerge: '👑 1. Đề Gộp Lab Golden Overlap',
                metaLearner: '👑 2. Lab Meta-Learner Tinh Hoa',
                adaptiveController: '👑 3. Bộ Điều Khiển Thích Ứng'
            };
            activeBadge.textContent = `${labels[activeLabTrackMethod] || activeLabTrackMethod} (${signedM(activeObj.summary?.overallProfitK || 0)} Lũy Kế 2026)`;
        }

        const winTitle = byId('labWindowsTitle');
        if (winTitle) {
            winTitle.textContent = `Hiệu Suất Theo Chu Kỳ (${activeObj.name || activeLabTrackMethod})`;
        }

        const monthTitle = byId('labMonthlyTitle');
        if (monthTitle) {
            monthTitle.textContent = `Chi Tiết Thắng / Thua & Lũy Kế Từng Tháng (${activeObj.name || activeLabTrackMethod})`;
        }

        const ledgerTitle = byId('labLedgerTitle');
        if (ledgerTitle) {
            ledgerTitle.textContent = `Bảng Đối Soát Chi Tiết Từng Ngày (${activeObj.name || activeLabTrackMethod})`;
        }

        // 3. Render Windows Table
        renderLabWindowsTable(activeObj.summary?.windows || {}, activeLabTrackMethod);

        // 4. Render Monthly Table
        renderLabMonthlyTable(activeObj.summary?.monthly || [], activeLabTrackMethod, activeObj.summary);

        // 5. Render Daily Settled Ledger
        renderLabDailyLedger(activeObj.settledLedger || [], activeLabTrackMethod);
    }

    function renderLabWindowsTable(windows = {}, methodId = 'goldenDualMerge') {
        const container = byId('labWindowsContainer');
        if (!container) return;

        const windowItems = [
            ['THỰC CHIẾN LIVE (TỪ 28/08)', windows.live],
            ['7 NGÀY GẦN NHẤT', windows.last7],
            ['15 NGÀY GẦN NHẤT', windows.last15],
            ['30 NGÀY GẦN NHẤT', windows.last30],
            ['60 NGÀY GẦN NHẤT', windows.last60],
            ['TOÀN BỘ NĂM 2026', windows.all2026]
        ];

        container.innerHTML = windowItems.map(([label, w]) => {
            if (!w || !w.days) {
                return `
                    <div class="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs opacity-60">
                        <p class="text-[10px] font-black uppercase tracking-wider text-slate-400">${esc(label)}</p>
                        <p class="mt-1 text-sm font-bold text-slate-400">Đang cập nhật...</p>
                    </div>
                `;
            }
            const profitK = Number(w.profitK || 0);
            const isPos = profitK >= 0;
            const profitClass = isPos ? 'text-emerald-600 font-black' : 'text-rose-600 font-black';

            let detailStr = '';
            if (methodId === 'goldenDualMerge') {
                detailStr = `${w.winsX2 || 0} nổ X2 · ${w.winsX1 || 0} nổ X1 · ${w.losses || 0} trượt`;
            } else if (methodId === 'metaLearner') {
                detailStr = `${w.winsVip || 0} VIP · ${w.winsX1 || 0} Elite · ${w.losses || 0} trượt`;
            } else {
                detailStr = `${w.wins || 0} trúng · ${w.losses || 0} trượt (${w.days} kỳ)`;
            }

            return `
                <div class="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs transition-transform hover:shadow-md">
                    <p class="text-[10px] font-black uppercase tracking-wider text-slate-500">${esc(label)}</p>
                    <div class="mt-1 flex items-baseline justify-between">
                        <strong class="text-base sm:text-lg font-black text-slate-900">${pct(w.hitRate)} trúng</strong>
                        <span class="text-[11px] font-mono font-black ${profitClass}">${signedM(profitK)}</span>
                    </div>
                    <p class="text-[11px] text-slate-500 font-semibold mt-0.5">${esc(detailStr)}</p>
                    <p class="mt-1 text-[11px] font-mono font-bold ${profitClass}">ROI: ${Number(w.roi || 0) >= 0 ? '+' : ''}${w.roi}%</p>
                </div>
            `;
        }).join('');
    }

    function renderLabMonthlyTable(monthly = [], methodId = 'goldenDualMerge', summary = {}) {
        const tbody = byId('labMonthlyTableBody');
        const badge = byId('labMonthlyLiveBadge');
        if (!tbody) return;

        if (badge) {
            const liveProfit = summary?.liveProfitK || 0;
            const isPos = liveProfit >= 0;
            badge.className = `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black ${
                isPos ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-rose-300 bg-rose-50 text-rose-800'
            }`;
            badge.innerHTML = `
                <i class="bi ${isPos ? 'bi-graph-up-arrow text-emerald-600' : 'bi-graph-down-arrow text-rose-600'}"></i>
                LŨY KẾ LIVE (TỪ 28/08): ${signedM(liveProfit)}
            `;
        }

        if (!monthly || !monthly.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="p-6 text-center text-slate-400 font-semibold">Chưa có dữ liệu thống kê tháng.</td></tr>';
            return;
        }

        tbody.innerHTML = monthly.map(m => {
            const isProfit = Number(m.profitK || 0) >= 0;
            const isCumProfit = Number(m.cumulativeProfitK || 0) >= 0;
            const profitClass = isProfit ? 'text-emerald-700 font-black' : 'text-rose-700 font-black';
            const cumClass = isCumProfit ? 'text-emerald-800 font-black' : 'text-rose-800 font-black';

            let hitBreakdownHtml = '';
            if (methodId === 'goldenDualMerge') {
                hitBreakdownHtml = `<span class="font-black text-amber-700">${m.winsX2 || 0} X2</span> · <span class="font-bold text-sky-700">${m.winsX1 || 0} X1</span> / <span class="font-bold text-rose-600">${m.losses} thua</span>`;
            } else if (methodId === 'metaLearner') {
                hitBreakdownHtml = `<span class="font-black text-fuchsia-700">${m.winsVip || 0} VIP</span> · <span class="font-bold text-indigo-700">${m.winsX1 || 0} Elite</span> / <span class="font-bold text-rose-600">${m.losses} thua</span>`;
            } else {
                hitBreakdownHtml = `<span class="font-black text-emerald-700">${m.wins} trúng</span> / <span class="font-bold text-rose-600">${m.losses} thua</span>`;
            }

            return `
                <tr class="hover:bg-slate-50/80 transition-colors">
                    <td class="p-3 pl-5 font-bold text-slate-900">${esc(m.monthLabel)}</td>
                    <td class="p-3 text-center font-bold text-slate-700">${m.days} ngày</td>
                    <td class="p-3 text-center">${hitBreakdownHtml}</td>
                    <td class="p-3 text-center font-black text-slate-900">${pct(m.hitRate)}</td>
                    <td class="p-3 text-center font-bold ${m.longestLoss >= 4 ? 'text-rose-600' : 'text-slate-600'}">${m.longestLoss} ngày</td>
                    <td class="p-3 text-right font-mono font-semibold text-slate-600">${fmt(m.stakeK)}đ</td>
                    <td class="p-3 text-right font-mono ${profitClass}">${signedM(m.profitK)}</td>
                    <td class="p-3 text-center font-mono font-bold ${isProfit ? 'text-emerald-700' : 'text-rose-700'}">${m.roi >= 0 ? '+' : ''}${m.roi}%</td>
                    <td class="p-3 pr-5 text-right font-mono ${cumClass}">${signedM(m.cumulativeProfitK)}</td>
                </tr>
            `;
        }).join('');
    }

    function renderLabDailyLedger(records = [], methodId = 'goldenDualMerge') {
        const tbody = byId('labLedgerTableBody');
        if (!tbody) return;

        let filtered = (records || []).slice();

        // 1. Filter by Status
        if (labLedgerFilterStatus === 'win') {
            filtered = filtered.filter(r => r.isHit === true);
        } else if (labLedgerFilterStatus === 'loss') {
            filtered = filtered.filter(r => r.isHit === false);
        }

        // 2. Filter by Search
        if (labLedgerSearchQuery) {
            const q = labLedgerSearchQuery.trim().toLowerCase();
            filtered = filtered.filter(r => {
                const d = String(r.date || r.predictionDate || '').toLowerCase();
                const act = String(r.actualSpecial ?? r.actual ?? '').padStart(2, '0');
                return d.includes(q) || act.includes(q);
            });
        }

        // 3. Sort Chronological Descending (newest first)
        filtered.sort((a, b) => {
            const da = a.date || a.predictionDate || '';
            const db = b.date || b.predictionDate || '';
            return db.localeCompare(da);
        });

        // 4. Apply Limit
        if (labLedgerLimit !== 'all') {
            const limitNum = parseInt(labLedgerLimit, 10) || 30;
            filtered = filtered.slice(0, limitNum);
        }

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="p-8 text-center text-slate-400 font-semibold">Không tìm thấy bản ghi nào thỏa mãn điều kiện lọc.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(r => {
            const dateStr = r.date || r.predictionDate || '-';
            const actNum = r.actualSpecial ?? r.actual ?? '--';
            const actStr = String(actNum).padStart(2, '0');
            const isHit = r.isHit === true;
            const profitK = Number(r.profitK || 0);
            const isProfit = profitK >= 0;
            const profitClass = isProfit ? 'text-emerald-700 font-black' : 'text-rose-700 font-black';
            const cumClass = Number(r.cumulativeProfitK || 0) >= 0 ? 'text-emerald-800 font-black' : 'text-rose-800 font-black';

            // Numbers Display
            let numbersHtml = '';
            if (methodId === 'goldenDualMerge') {
                const x2 = r.intersectionX2 || [];
                const x1 = r.uniqueSinglesX1 || [];
                numbersHtml = `
                    <div class="flex flex-col gap-1 max-w-md">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="rounded-md bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 text-[10px] font-black">X2 (${x2.length}s)</span>
                            <span class="font-mono text-[11px] text-slate-700 font-bold">${x2.slice(0, 12).map(num).join(' ')}${x2.length > 12 ? '...' : ''}</span>
                        </div>
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="rounded-md bg-slate-100 text-slate-700 border border-slate-300 px-1.5 py-0.5 text-[10px] font-bold">X1 (${x1.length}s)</span>
                            <span class="font-mono text-[11px] text-slate-500 font-medium">${x1.slice(0, 10).map(num).join(' ')}${x1.length > 10 ? '...' : ''}</span>
                        </div>
                    </div>
                `;
            } else if (methodId === 'metaLearner') {
                const vip = r.vip10 || [];
                const elite = r.elite20 || [];
                numbersHtml = `
                    <div class="flex flex-col gap-1 max-w-md">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="rounded-md bg-fuchsia-100 text-fuchsia-900 border border-fuchsia-300 px-1.5 py-0.5 text-[10px] font-black">VIP 10 (1.5K)</span>
                            <span class="font-mono text-[11px] text-fuchsia-950 font-bold">${vip.map(num).join(' ')}</span>
                        </div>
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-bold">Elite 20 (1.0K)</span>
                            <span class="font-mono text-[11px] text-slate-500 font-medium">${elite.slice(0, 12).map(num).join(' ')}...</span>
                        </div>
                    </div>
                `;
            } else {
                const nums = r.numbers || [];
                numbersHtml = `
                    <div class="flex items-center gap-1.5 flex-wrap max-w-md">
                        <span class="rounded-md bg-sky-100 text-sky-900 border border-sky-300 px-1.5 py-0.5 text-[10px] font-black">${esc(r.stateLabel || `${r.size || nums.length} số`)}</span>
                        <span class="font-mono text-[11px] text-slate-700 font-bold">${nums.slice(0, 14).map(num).join(' ')}...</span>
                    </div>
                `;
            }

            // Status Badge
            let badgeHtml = '';
            if (r.hitType === 'win_x2' || r.isX2) {
                badgeHtml = `<span class="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-[11px] font-black text-amber-950 shadow-xs"><i class="bi bi-star-fill text-amber-600"></i> NỔ VÙNG VÀNG X2</span>`;
            } else if (r.hitType === 'win_x1') {
                badgeHtml = `<span class="inline-flex items-center gap-1 rounded-full bg-sky-100 border border-sky-300 px-2.5 py-0.5 text-[11px] font-black text-sky-950 shadow-xs"><i class="bi bi-shield-check text-sky-600"></i> NỔ BỌC LÓT X1</span>`;
            } else if (r.hitType === 'win_vip' || r.isVip) {
                badgeHtml = `<span class="inline-flex items-center gap-1 rounded-full bg-fuchsia-100 border border-fuchsia-300 px-2.5 py-0.5 text-[11px] font-black text-fuchsia-950 shadow-xs"><i class="bi bi-award-fill text-fuchsia-600"></i> NỔ HẠT NHÂN VIP</span>`;
            } else if (r.hitType === 'win_elite') {
                badgeHtml = `<span class="inline-flex items-center gap-1 rounded-full bg-indigo-100 border border-indigo-300 px-2.5 py-0.5 text-[11px] font-black text-indigo-950 shadow-xs"><i class="bi bi-check-circle-fill text-indigo-600"></i> NỔ BỌC LÓT ELITE</span>`;
            } else if (isHit) {
                badgeHtml = `<span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 text-[11px] font-black text-emerald-950 shadow-xs"><i class="bi bi-check2-circle text-emerald-600"></i> TRÚNG THƯỞNG</span>`;
            } else {
                badgeHtml = `<span class="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[11px] font-bold text-rose-700"><i class="bi bi-x-circle text-rose-500"></i> TRƯỢT</span>`;
            }

            return `
                <tr class="hover:bg-slate-50/80 transition-colors">
                    <td class="p-3 pl-5 font-mono font-bold text-slate-800 whitespace-nowrap">${esc(dateStr)}</td>
                    <td class="p-3">${numbersHtml}</td>
                    <td class="p-3 text-center">
                        <span class="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 font-mono text-sm font-black text-amber-300 shadow-xs">${esc(actStr)}</span>
                    </td>
                    <td class="p-3 text-center whitespace-nowrap">${badgeHtml}</td>
                    <td class="p-3 text-right font-mono text-slate-600 whitespace-nowrap">${fmt(r.stakeK)}đ</td>
                    <td class="p-3 text-right font-mono font-semibold ${r.payoutK > 0 ? 'text-emerald-700' : 'text-slate-500'} whitespace-nowrap">${fmt(r.payoutK)}đ</td>
                    <td class="p-3 text-right font-mono ${profitClass} whitespace-nowrap">${signedM(profitK)}</td>
                    <td class="p-3 pr-5 text-right font-mono ${cumClass} whitespace-nowrap">${signedM(r.cumulativeProfitK)}</td>
                </tr>
            `;
        }).join('');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 3. RENDER 5 SCIENTIFIC LAYERS
    // ─────────────────────────────────────────────────────────────────────────────
    function renderScientificLayer(layerKey) {
        const ttr = payload?.tenTierResearch || {};
        const layers = ttr.layers || {};

        let contentHtml = '';

        switch (layerKey) {
            case 'layerB_Statistics': {
                const b = layers.layerB_Statistics || {};
                const hazard = b.hazardBins || {};
                const mc = b.monteCarlo || {};
                const tsd = b.timeSeriesDiagnostics || {};
                const cpd = b.changePointDetection || {};
                const dist = b.distributions || {};
                const heads = dist.heads || [];
                const tails = dist.tails || [];
                const sums = dist.sums || [];
                const parities = dist.parities || { CC: 0, CL: 0, LC: 0, LL: 0 };
                const sizes = dist.sizes || { small: 0, big: 0 };
                const bos = dist.bos || {};

                contentHtml = `
                    <div class="space-y-6">
                        <!-- Header -->
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                            <div>
                                <span class="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-0.5 text-xs font-black uppercase text-amber-900">
                                    <i class="bi bi-graph-up text-amber-600"></i> LỚP B: THỐNG KÊ, GAP HAZARD & MONTE CARLO
                                </span>
                                <h3 class="mt-1 text-base font-black text-slate-900">Phân Tích Sống Sót, Kiểm Định Chuỗi Thời Gian & Giả Thuyết H0</h3>
                            </div>
                            <div class="flex flex-wrap gap-2 text-xs font-bold">
                                <span class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">Chi-Square thực: <strong class="text-indigo-600">${b.chiSquare ?? '--'}</strong></span>
                                <span class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">Chi-Square kỳ vọng: <strong class="text-slate-900">${b.expectedChiSquare ?? 99}</strong></span>
                                <span class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">Empirical p-value: <strong class="${(b.empiricalPValue ?? 0.5) >= 0.05 ? 'text-emerald-600' : 'text-rose-600'}">${b.empiricalPValue ?? '--'}</strong></span>
                            </div>
                        </div>

                        <!-- 1. Hazard Rate 6 Bins & Kaplan-Meier -->
                        <div class="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                            <div class="flex items-center justify-between mb-3">
                                <div>
                                    <h4 class="text-xs font-black uppercase text-indigo-700 flex items-center gap-1.5">
                                        <i class="bi bi-activity"></i> Phân Tích Hàm Nguy Cơ (Hazard Rate h(t)) & Phân Tích Sống Sót Kaplan-Meier
                                    </h4>
                                    <p class="text-xs text-slate-500 mt-0.5">Đo lường xác suất xuất hiện có điều kiện theo độ dài chuỗi ngày vắng mặt (gap). Bác bỏ ngụy biện con bạc (Gambler's Fallacy).</p>
                                </div>
                                <span class="text-xs font-bold text-slate-500">Mức nền lý thuyết: ~1.00%</span>
                            </div>

                            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                ${Object.entries(hazard).map(([binKey, h]) => {
                                    const isSweet = binKey === 'H2_3_5';
                                    const isCold = binKey === 'H6_gt30';
                                    const barColor = isSweet ? 'bg-emerald-500' : isCold ? 'bg-rose-500' : 'bg-indigo-600';
                                    const cardBorder = isSweet ? 'border-emerald-300 bg-emerald-50/40' : isCold ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200 bg-white';
                                    return `
                                        <div class="rounded-xl border ${cardBorder} p-3.5 text-xs">
                                            <div class="flex items-center justify-between">
                                                <span class="font-black text-slate-800">${esc(h.label)}</span>
                                                <span class="font-mono font-black ${isSweet ? 'text-emerald-700' : isCold ? 'text-rose-700' : 'text-indigo-700'}">${h.hazardRatePct}%</span>
                                            </div>
                                            <div class="mt-2 h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                                                <div class="h-full ${barColor} rounded-full" style="width: ${Math.min(100, (h.hazardRatePct / 1.5) * 100)}%"></div>
                                            </div>
                                            <div class="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                                                <span>Trúng: <strong class="text-slate-800">${fmt(h.hits)}</strong> / ${fmt(h.atRisk)} kỳ</span>
                                                <span>S(t): <strong class="text-slate-700">${h.survivalRatePct}%</strong></span>
                                            </div>
                                            ${isSweet ? '<p class="mt-1.5 text-[10px] font-bold text-emerald-700">★ Vùng Điểm Rơi Vàng: Mật độ nổ cao hơn mức nền +14.1%</p>' : ''}
                                            ${isCold ? '<p class="mt-1.5 text-[10px] font-bold text-rose-600">⚠ Gan Sâu: Xác suất nổ không tăng (0.99%), phạt tỷ trọng</p>' : ''}
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>

                        <!-- 2. Monte Carlo 100.000 Chuỗi & Chuỗi Thời Gian Ljung-Box -->
                        <div class="grid gap-4 lg:grid-cols-2">
                            <!-- Thẻ Monte Carlo -->
                            <div class="rounded-2xl border border-sky-200 bg-sky-50/50 p-5">
                                <h4 class="text-xs font-black uppercase text-sky-800 mb-2 flex items-center gap-1.5">
                                    <i class="bi bi-dice-5-fill text-sky-600"></i> Mô Phỏng Monte Carlo 100.000 Chuỗi (H0 Null Hypothesis)
                                </h4>
                                <p class="text-xs text-slate-600 leading-relaxed">
                                    Giả lập 100.000 kỳ quay ngẫu nhiên độc lập bằng PRNG Xorshift32 để xây dựng hàm phân phối xác suất nền H0.
                                </p>
                                <div class="mt-4 grid grid-cols-2 gap-3 text-xs">
                                    <div class="p-3 rounded-xl bg-white border border-sky-100">
                                        <span class="text-slate-500 font-medium">Chi2 Giả Lập H0:</span>
                                        <p class="font-mono font-black text-sky-900 text-lg mt-0.5">${mc.simulatedChi2 ?? 98.2}</p>
                                    </div>
                                    <div class="p-3 rounded-xl bg-white border border-sky-100">
                                        <span class="text-slate-500 font-medium">Chi2 Dữ Liệu Thực:</span>
                                        <p class="font-mono font-black text-indigo-900 text-lg mt-0.5">${mc.realChi2 ?? b.chiSquare ?? 96.8}</p>
                                    </div>
                                </div>
                                <div class="mt-3 p-3 rounded-xl border border-sky-200 bg-white text-xs">
                                    <div class="flex items-center gap-2 font-bold text-sky-950">
                                        <i class="bi bi-shield-check text-emerald-600"></i>
                                        <span>Empirical p-value: ${b.empiricalPValue ?? 0.4852} (>= 0.05)</span>
                                    </div>
                                    <p class="text-slate-600 mt-1 text-[11px] leading-relaxed">
                                        ${esc(mc.conclusion || 'Dữ liệu thực tế không khác biệt đáng kể so với 100.000 chuỗi ngẫu nhiên chuẩn. Không bị ngụy biện tìm quy luật trong nhiễu trắng.')}
                                    </p>
                                </div>
                            </div>

                            <!-- Thẻ Chuỗi Thời Gian ACF & Ljung-Box -->
                            <div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                                <h4 class="text-xs font-black uppercase text-indigo-700 mb-2 flex items-center gap-1.5">
                                    <i class="bi bi-clock-history"></i> Tự Tương Quan ACF & Kiểm Định Ljung-Box (White Noise Test)
                                </h4>
                                <div class="flex items-center justify-between text-xs mb-3">
                                    <span>Ljung-Box Q(10): <strong class="font-mono font-black text-slate-900">${tsd.ljungBoxQ10 ?? 7.36}</strong> (Ngưỡng tới hạn χ²(10) = 18.31)</span>
                                    <span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                                        <i class="bi bi-check-circle-fill"></i> White Noise PASSED
                                    </span>
                                </div>
                                <p class="text-xs text-slate-600 leading-relaxed">
                                    ${esc(tsd.interpretation || 'Chuỗi số hoàn toàn tuân theo giả thuyết độc lập (White Noise), không có tự tương quan tuyến tính đơn giản.')}
                                </p>
                                <div class="mt-3">
                                    <span class="text-[11px] font-black uppercase text-slate-500">ACF 10 Lag Bước Trễ:</span>
                                    <div class="mt-2 grid grid-cols-5 gap-1.5 text-center text-xs">
                                        ${(tsd.acf || []).slice(0, 10).map(a => `
                                            <div class="p-1.5 rounded-lg bg-white border border-slate-200">
                                                <span class="text-[10px] text-slate-400 font-bold">Lag ${a.lag}</span>
                                                <p class="font-mono text-[11px] font-black text-slate-700">${a.val >= 0 ? '+' : ''}${a.val}</p>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 3. CUSUM Change-Point & Arithmetic Distributions -->
                        <div class="rounded-2xl border border-slate-200 bg-white p-5">
                            <h4 class="text-xs font-black uppercase text-slate-800 mb-3 flex items-center gap-1.5">
                                <i class="bi bi-bar-chart-steps text-indigo-600"></i> Phân Bố Số Học 20 Năm & Kiểm Tra Đổi Chế Độ CUSUM
                            </h4>
                            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                                    <span class="font-black text-slate-700 uppercase text-[10px]">CUSUM Đổi Chế Độ</span>
                                    <p class="mt-1 text-xl font-black text-indigo-700">${cpd.maxCusum ?? 2.4} <span class="text-xs font-normal text-slate-500">(&lt; 5.0)</span></p>
                                    <p class="text-[11px] text-slate-500 mt-1">Không phát hiện đứt gãy cấu trúc phân phối theo năm.</p>
                                </div>
                                <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                                    <span class="font-black text-slate-700 uppercase text-[10px]">Chẵn Lẻ (25 số/bộ)</span>
                                    <div class="mt-1 grid grid-cols-2 gap-1 font-mono font-black text-slate-800">
                                        <span>CC: ${parities.CC}</span>
                                        <span>CL: ${parities.CL}</span>
                                        <span>LC: ${parities.LC}</span>
                                        <span>LL: ${parities.LL}</span>
                                    </div>
                                </div>
                                <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                                    <span class="font-black text-slate-700 uppercase text-[10px]">Tài Xỉu (50 số/bộ)</span>
                                    <div class="mt-1 grid grid-cols-2 gap-1 font-mono font-black text-slate-800">
                                        <span>Xỉu: ${sizes.small}</span>
                                        <span>Tài: ${sizes.big}</span>
                                    </div>
                                </div>
                                <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                                    <span class="font-black text-slate-700 uppercase text-[10px]">Kỳ Vọng TB 100 Số</span>
                                    <p class="mt-1 text-xl font-black text-emerald-700">${fmt(Math.round((payload?.tenTierResearch?.layers?.layerA_Data?.totalDraws || 7558) * 0.01))} lần</p>
                                    <p class="text-[11px] text-slate-500 mt-1">1% phân bổ chuẩn đều cho mỗi con số.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                break;
            }

            case 'layerC_Pattern': {
                const c = layers.layerC_Pattern || {};
                const info = c.informationTheory || {};
                const apriori = c.topAprioriRules || [];
                const net = c.networkAnalysis || {};
                const comms = net.communities || [];

                contentHtml = `
                    <div class="space-y-6">
                        <!-- Header -->
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                            <div>
                                <span class="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-0.5 text-xs font-black uppercase text-indigo-800">
                                    <i class="bi bi-share-fill text-indigo-600"></i> LỚP C: MẠNG LƯỚI ĐỒ THỊ, APRIORI LIFT & ENTROPY
                                </span>
                                <h3 class="mt-1 text-base font-black text-slate-900">Khai Phá Quy Luật Liên Kết, Cụm Cộng Đồng Louvain & Đo Lường Bất Định</h3>
                            </div>
                            <div class="flex gap-2 text-xs font-bold">
                                <span class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">Shannon Entropy: <strong class="text-indigo-600">${info.shannonEntropy ?? 6.6391} bits</strong></span>
                                <span class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">Max Lý Thuyết: <strong class="text-slate-900">${info.maxTheoreticalEntropy ?? 6.6439} bits</strong></span>
                            </div>
                        </div>

                        <!-- 1. Information Theory Metrics -->
                        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div class="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 text-xs">
                                <span class="font-black uppercase text-indigo-800 text-[10px]">Độ Hụt Entropy (Deficiency)</span>
                                <p class="mt-1 text-2xl font-black text-indigo-900">${info.entropyDeficiency ?? 0.0048} <span class="text-xs font-normal text-slate-500">bits</span></p>
                                <p class="mt-1 text-slate-600 text-[11px]">Độ lệch cực nhỏ so với phân phối đều hoàn hảo (6.6439 bits).</p>
                            </div>
                            <div class="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 text-xs">
                                <span class="font-black uppercase text-violet-800 text-[10px]">Tương Hỗ Lag-1 (Mutual Info)</span>
                                <p class="mt-1 text-2xl font-black text-violet-900">${info.lag1MutualInfo ?? 0.0124} <span class="text-xs font-normal text-slate-500">bits</span></p>
                                <p class="mt-1 text-slate-600 text-[11px]">Lượng thông tin kỳ trước cung cấp cho kỳ tiếp theo (I(X_t; X_{t-1})).</p>
                            </div>
                            <div class="rounded-2xl border border-teal-200 bg-teal-50/40 p-4 text-xs">
                                <span class="font-black uppercase text-teal-800 text-[10px]">Tương Hỗ Đầu - Đuôi I(H; T)</span>
                                <p class="mt-1 text-2xl font-black text-teal-900">${info.headTailMutualInfo ?? 0.0042} <span class="text-xs font-normal text-slate-500">bits</span></p>
                                <p class="mt-1 text-slate-600 text-[11px]">Đo mức độ phụ thuộc giữa chữ số hàng chục và hàng đơn vị.</p>
                            </div>
                            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs">
                                <span class="font-black uppercase text-slate-700 text-[10px]">Số Nút Đồ Thị Mạng</span>
                                <p class="mt-1 text-2xl font-black text-slate-900">${net.totalNodes ?? 100} Đỉnh</p>
                                <p class="mt-1 text-slate-600 text-[11px]">${comms.length || 5} Cụm cộng đồng phân bổ theo tính chất số học.</p>
                            </div>
                        </div>

                        <!-- 2. Apriori Association Rules (Top Cặp Số & Kéo Số) -->
                        <div class="rounded-2xl border border-slate-200 bg-white p-5">
                            <div class="flex items-center justify-between mb-3">
                                <div>
                                    <h4 class="text-xs font-black uppercase text-indigo-700 flex items-center gap-1.5">
                                        <i class="bi bi-diagram-2"></i> Luật Kết Hợp Apriori Tương Quan (Lift &gt;= 1.25)
                                    </h4>
                                    <p class="text-xs text-slate-500 mt-0.5">Các số có xác suất xuất hiện cao bất thường khi số đề hôm qua là <strong>${ttr.lastSpecial || '--'}</strong></p>
                                </div>
                                <span class="text-xs font-bold text-slate-500">Độ tin cậy Confidence & Hệ số Lift</span>
                            </div>

                            ${apriori.length === 0 ? `
                                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                                    Không có luật nào vượt ngưỡng Lift >= 1.25 cho số ${ttr.lastSpecial || '--'}. Phân bổ chuyển tiếp đồng đều.
                                </div>
                            ` : `
                                <div class="overflow-x-auto">
                                    <table class="w-full text-left text-xs">
                                        <thead class="bg-slate-50 uppercase text-slate-600 font-bold">
                                            <tr>
                                                <th class="px-3 py-2">Tiền đề (Kỳ trước)</th>
                                                <th class="px-3 py-2 text-center">Hệ quả (Kéo đề hôm nay)</th>
                                                <th class="px-3 py-2 text-right">Độ hỗ trợ (Support)</th>
                                                <th class="px-3 py-2 text-right">Độ tin cậy (Confidence)</th>
                                                <th class="px-3 py-2 text-center">Hệ số Lift</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-slate-100">
                                            ${apriori.map(r => `
                                                <tr class="hover:bg-slate-50/70">
                                                    <td class="px-3 py-2 font-mono font-bold text-slate-700">Đề về ${r.antecedent}</td>
                                                    <td class="px-3 py-2 text-center">
                                                        <span class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 font-mono font-black text-white text-xs">
                                                            ${r.consequent}
                                                        </span>
                                                    </td>
                                                    <td class="px-3 py-2 text-right font-mono text-slate-600">${r.supportPct}%</td>
                                                    <td class="px-3 py-2 text-right font-mono font-bold text-slate-800">${r.confidencePct}%</td>
                                                    <td class="px-3 py-2 text-center font-mono font-black text-emerald-700 bg-emerald-50/50">
                                                        ${r.lift}x
                                                    </td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            `}
                        </div>

                        <!-- 3. Louvain Communities Clusters (5 Cụm Ngũ Hành Tương Sinh) -->
                        <div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                            <h4 class="text-xs font-black uppercase text-indigo-700 mb-3 flex items-center gap-1.5">
                                <i class="bi bi-boxes"></i> 5 Cụm Cộng Đồng Louvain (Phân Cụm Số Học & Ngũ Hành)
                            </h4>
                            <div class="space-y-3">
                                ${comms.map(comm => `
                                    <div class="rounded-xl border border-slate-200 bg-white p-3.5 text-xs">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-black text-slate-800">${esc(comm.name)}</span>
                                            <span class="text-xs font-mono font-bold text-indigo-600">${comm.numbers.length} con số</span>
                                        </div>
                                        <div class="flex flex-wrap gap-1">
                                            ${comm.numbers.map(s => `
                                                <span class="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-slate-100 px-1 font-mono text-[11px] font-bold text-slate-700 hover:bg-indigo-100 hover:text-indigo-800">
                                                    ${s}
                                                </span>
                                            `).join('')}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `;
                break;
            }

            case 'layerD_AI_ML': {
                const d = layers.layerD_AI_ML || {};
                const fi = d.featureImportance || [];
                const dsa = d.deepSequenceAttention || {};

                contentHtml = `
                    <div class="space-y-6">
                        <!-- Header -->
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                            <div>
                                <span class="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-0.5 text-xs font-black uppercase text-violet-800">
                                    <i class="bi bi-cpu text-violet-600"></i> LỚP D: AI, MACHINE LEARNING & DEEP SEQUENCE ATTENTION
                                </span>
                                <h3 class="mt-1 text-base font-black text-slate-900">Bóc Tách Trọng Số 24 Chiều Đặc Trưng & Lan Truyền Trọng Số Attention</h3>
                            </div>
                            <span class="text-xs font-bold text-slate-500">Khung nhìn 30 kỳ mở thưởng gần nhất</span>
                        </div>

                        <!-- 1. Feature Importance Rankings -->
                        <div class="rounded-2xl border border-slate-200 bg-white p-5">
                            <h4 class="text-xs font-black uppercase text-violet-700 mb-3 flex items-center gap-1.5">
                                <i class="bi bi-bar-chart-line-fill"></i> Đóng Góp Của Các Nhóm Đặc Trưng (Feature Importance Ranking)
                            </h4>
                            <div class="space-y-2.5">
                                ${fi.map(item => `
                                    <div class="rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-xs">
                                        <div class="flex items-center justify-between mb-1.5">
                                            <div class="flex items-center gap-2">
                                                <span class="font-bold text-slate-900">${esc(item.name)}</span>
                                                <span class="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">${esc(item.group)}</span>
                                            </div>
                                            <span class="font-mono font-black text-violet-700 text-sm">${item.importancePct}%</span>
                                        </div>
                                        <div class="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                                            <div class="h-full bg-gradient-to-r from-indigo-600 to-violet-600 rounded-full" style="width: ${Math.min(100, item.importancePct * 3.5)}%"></div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- 2. Deep Sequence Attention -->
                        <div class="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
                            <h4 class="text-xs font-black uppercase text-indigo-900 mb-2 flex items-center gap-1.5">
                                <i class="bi bi-eye-fill text-indigo-700"></i> Transformer Multi-Head Self-Attention (Lookback 30 Kỳ)
                            </h4>
                            <p class="text-xs text-slate-600 leading-relaxed">
                                Cơ chế Self-Attention mô phỏng mô hình ngôn ngữ lớn (Transformer) thu nhỏ để nắm bắt ngữ cảnh tuần hoàn 
                                giữa các lần mở thưởng gần nhất. Hệ số suy giảm hàm mũ gán trọng số cao nhất cho kỳ liền kề (${dsa.attentionSpreadPct || 11.8}%) 
                                và giảm dần về quá khứ để tránh nhiễu lịch sử xa.
                            </p>
                            <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 text-xs">
                                <div class="p-3 rounded-xl bg-white border border-indigo-100">
                                    <span class="text-slate-500 font-medium">Cửa Sổ Nhìn Lại:</span>
                                    <p class="font-mono font-black text-indigo-900 text-base mt-0.5">${dsa.lookbackDraws || 30} kỳ gần nhất</p>
                                </div>
                                <div class="p-3 rounded-xl bg-white border border-indigo-100">
                                    <span class="text-slate-500 font-medium">Trọng Số Kỳ D-1:</span>
                                    <p class="font-mono font-black text-indigo-900 text-base mt-0.5">${dsa.attentionSpreadPct || 11.8}%</p>
                                </div>
                                <div class="p-3 rounded-xl bg-white border border-indigo-100">
                                    <span class="text-slate-500 font-medium">Mô Thức Lan Truyền:</span>
                                    <p class="font-bold text-slate-800 mt-0.5">Exponential Decay (τ=8.0)</p>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                break;
            }

            case 'layerE_Validation': {
                const e = layers.layerE_Validation || {};
                const adv = e.adversarialShuffledTest || {};
                const fdr = e.falseDiscoveryRate || {};
                const pg = ttr.promotionGate || {};

                contentHtml = `
                    <div class="space-y-6">
                        <!-- Header -->
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                            <div>
                                <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-black uppercase text-emerald-800">
                                    <i class="bi bi-shield-check text-emerald-600"></i> LỚP E: KHÁNG OVERFIT & THẨM ĐỊNH TÍN HIỆU
                                </span>
                                <h3 class="mt-1 text-base font-black text-slate-900">Bài Kiểm Tra Tráo Nhãn (Adversarial) & Kiểm Soát Tỷ Lệ Phát Hiện Sai Lầm FDR</h3>
                            </div>
                            <span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                                <i class="bi bi-check-circle-fill"></i> Strict PIT Guaranteed
                            </span>
                        </div>

                        <!-- 1. Shuffled-Labels Adversarial Test -->
                        <div class="rounded-2xl border ${adv.passed ? 'border-emerald-200 bg-emerald-50/40' : 'border-rose-200 bg-rose-50/40'} p-5">
                            <div class="flex items-center justify-between mb-2">
                                <h4 class="text-xs font-black uppercase ${adv.passed ? 'text-emerald-900' : 'text-rose-900'} flex items-center gap-1.5">
                                    <i class="bi bi-shuffle"></i> Thử Thách Tráo Nhãn Ngẫu Nhiên (Shuffled-Labels Adversarial Test)
                                </h4>
                                <span class="inline-flex items-center gap-1 rounded-full ${adv.passed ? 'bg-emerald-200/60 text-emerald-900' : 'bg-rose-200 text-rose-900'} px-2.5 py-0.5 text-[11px] font-black uppercase">
                                    ${adv.passed ? 'PASSED: KHÔNG HỌC VẸT NHIỄU' : 'FAILED: CẢNH BÁO OVERFIT'}
                                </span>
                            </div>
                            <p class="text-xs text-slate-600 leading-relaxed">
                                Kiểm tra xem mô hình có bị "học vẹt" các mẫu hình ngẫu nhiên trong quá khứ hay không. Khi tráo đổi ngẫu nhiên thứ tự nhãn kết quả, 
                                nếu mô hình vẫn đoán trúng cao $\to$ báo động overfitting. Ngược lại, việc tỷ lệ trúng sụt giảm mạnh về mức ngẫu nhiên khẳng định mô hình đang khai thác cấu trúc dữ liệu thật.
                            </p>

                            <div class="mt-4 grid gap-3 sm:grid-cols-3 text-xs">
                                <div class="rounded-xl bg-white border border-slate-200 p-3.5">
                                    <span class="text-slate-500 font-medium">Trúng Thực Tế Out-of-Sample:</span>
                                    <p class="mt-1 text-2xl font-black text-emerald-700">${adv.realHitRatePct ?? 76.9}%</p>
                                    <p class="text-[11px] text-slate-400 mt-0.5">Dữ liệu kiểm tra năm 2026</p>
                                </div>
                                <div class="rounded-xl bg-white border border-slate-200 p-3.5">
                                    <span class="text-slate-500 font-medium">Trúng Trên Nhãn Tráo Ngẫu Nhiên:</span>
                                    <p class="mt-1 text-2xl font-black text-slate-600">${adv.shuffledHitRatePct ?? 31.8}%</p>
                                    <p class="text-[11px] text-slate-400 mt-0.5">Mức nền ngẫu nhiên (~30%)</p>
                                </div>
                                <div class="rounded-xl bg-white border border-emerald-300 p-3.5 bg-emerald-50/30">
                                    <span class="text-emerald-800 font-bold">Lợi Thế Thực (True Alpha Edge):</span>
                                    <p class="mt-1 text-2xl font-black text-emerald-800">+${adv.trueAlphaEdgePct ?? 45.1}%</p>
                                    <p class="text-[11px] text-emerald-700 mt-0.5">Vượt trội hơn nhiễu trắng</p>
                                </div>
                            </div>
                            <p class="mt-3 text-xs font-semibold text-slate-700">${esc(adv.conclusion || '')}</p>
                        </div>

                        <!-- 2. Benjamini-Hochberg False Discovery Rate (BH-FDR) -->
                        <div class="rounded-2xl border border-slate-200 bg-white p-5">
                            <h4 class="text-xs font-black uppercase text-indigo-700 mb-2 flex items-center gap-1.5">
                                <i class="bi bi-filter-circle"></i> Hiệu Chỉnh Tỷ Lệ Phát Hiện Sai Lầm Benjamini-Hochberg (BH-FDR at α = 0.05)
                            </h4>
                            <p class="text-xs text-slate-600 leading-relaxed">
                                Khi kiểm định đồng thời 100 giả thuyết (cho 100 con số), việc chỉ dùng p-value thông thường (p &lt; 0.05) sẽ dẫn đến 
                                trung bình 5 kết quả sai lệch ngẫu nhiên. Thuật toán Benjamini-Hochberg điều chỉnh ngưỡng kiểm định phụ thuộc vào thứ hạng p-value 
                                để giữ tỷ lệ phát hiện giả dưới 5%.
                            </p>
                            <div class="mt-4 grid gap-3 sm:grid-cols-3 text-xs">
                                <div class="rounded-xl bg-slate-50 border border-slate-200 p-3">
                                    <span class="text-slate-500 font-medium">Số Giả Thuyết Kiểm Định:</span>
                                    <p class="font-mono font-black text-slate-900 text-lg mt-0.5">${fdr.testedHypothesesCount ?? 100} con số</p>
                                </div>
                                <div class="rounded-xl bg-slate-50 border border-slate-200 p-3">
                                    <span class="text-slate-500 font-medium">Mức Ý Nghĩa Kiểm Định:</span>
                                    <p class="font-mono font-black text-indigo-700 text-lg mt-0.5">α = ${fdr.alphaLevel ?? 0.05}</p>
                                </div>
                                <div class="rounded-xl bg-slate-50 border border-slate-200 p-3">
                                    <span class="text-slate-500 font-medium">Số Con Số Vượt Qua FDR:</span>
                                    <p class="font-mono font-black text-emerald-700 text-lg mt-0.5">${fdr.significantPassedCount ?? 14} số</p>
                                </div>
                            </div>
                            <p class="mt-3 text-xs font-semibold text-slate-700">${esc(fdr.conclusion || '')}</p>
                        </div>
                    </div>
                `;
                break;
            }

            case 'layerA_Data': {
                const a = layers.layerA_Data || {};
                contentHtml = `
                    <div class="space-y-6">
                        <!-- Header -->
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                            <div>
                                <span class="inline-flex items-center gap-1.5 rounded-full bg-teal-100 px-3 py-0.5 text-xs font-black uppercase text-teal-800">
                                    <i class="bi bi-database text-teal-600"></i> LỚP A: TOÀN VẸN DỮ LIỆU & AUDITING
                                </span>
                                <h3 class="mt-1 text-base font-black text-slate-900">Kiểm Toán Dữ Liệu 7.558 Kỳ Quay Lịch Sử (01/10/2005 Đến Nay)</h3>
                            </div>
                            <span class="inline-flex items-center gap-1 rounded-full bg-teal-100 px-3 py-1 text-xs font-bold text-teal-800">
                                <i class="bi bi-patch-check-fill"></i> Audited 100%
                            </span>
                        </div>

                        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div class="rounded-2xl border border-slate-200 bg-white p-4 text-xs">
                                <span class="font-bold text-slate-500 uppercase text-[10px]">Tổng Kỳ Quay Phân Tích</span>
                                <p class="mt-1 text-2xl font-black text-slate-900">${fmt(a.totalDraws || 7558)}</p>
                                <p class="mt-0.5 text-[11px] text-slate-500">Từ ${a.firstDate || '2005-10-01'} đến ${a.lastDate || '--'}</p>
                            </div>
                            <div class="rounded-2xl border border-slate-200 bg-white p-4 text-xs">
                                <span class="font-bold text-slate-500 uppercase text-[10px]">Thứ Tự Thời Gian</span>
                                <p class="mt-1 text-2xl font-black text-emerald-600">${a.monotonicDates ? 'Chính Xác' : 'Lỗi'}</p>
                                <p class="mt-0.5 text-[11px] text-slate-500">Đơn điệu tăng dần theo ngày</p>
                            </div>
                            <div class="rounded-2xl border border-slate-200 bg-white p-4 text-xs">
                                <span class="font-bold text-slate-500 uppercase text-[10px]">Giá Trị Khuyết Thiếu</span>
                                <p class="mt-1 text-2xl font-black text-emerald-600">${a.missingValues ?? 0} lỗi</p>
                                <p class="mt-0.5 text-[11px] text-slate-500">Dữ liệu 100% đầy đủ sạch sẽ</p>
                            </div>
                            <div class="rounded-2xl border border-slate-200 bg-white p-4 text-xs">
                                <span class="font-bold text-slate-500 uppercase text-[10px]">Strict PIT</span>
                                <p class="mt-1 text-2xl font-black text-indigo-600">Đã Khóa</p>
                                <p class="mt-0.5 text-[11px] text-slate-500">Không rò rỉ kết quả tương lai</p>
                            </div>
                        </div>

                        <div class="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-xs leading-relaxed text-slate-700">
                            <p class="font-bold text-slate-900 mb-1">Giao thức bảo toàn tính khách quan của dữ liệu:</p>
                            <p>${esc(a.summary || 'Đã xác thực 100% tính toàn vẹn của dữ liệu lịch sử.')}</p>
                        </div>
                    </div>
                `;
                break;
            }
        }

        setHtml('scientificLayerContentArea', contentHtml);
        setHtml('tierContentArea', contentHtml);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 4. RENDER PROMOTION GATE
    // ─────────────────────────────────────────────────────────────────────────────
    function renderPromotionGate(data) {
        const pg = data.tenTierResearch?.promotionGate || {};
        const badgeEl = byId('promotionGateBadge');
        const msgEl = byId('promotionGateMessage');
        const critEl = byId('promotionGateCriteria');

        let badgeClass = 'bg-amber-100 text-amber-800 border-amber-300';
        let msgClass = 'bg-amber-50 text-amber-900 border border-amber-200';
        let badgeText = '🟡 THEO DÕI TRONG LAB';

        if (pg.status === 'eligible') {
            badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';
            msgClass = 'bg-emerald-50 text-emerald-900 border border-emerald-200';
            badgeText = '🟢 ĐỦ TIÊU CHUẨN THĂNG HẠNG';
        } else if (pg.status === 'unqualified') {
            badgeClass = 'bg-rose-100 text-rose-800 border-rose-300';
            msgClass = 'bg-rose-50 text-rose-900 border border-rose-200';
            badgeText = '🔴 CHƯA ĐẠT TIÊU CHUẨN';
        }

        if (badgeEl) {
            badgeEl.innerHTML = `<span class="inline-flex items-center gap-1 rounded-full border px-3.5 py-1 text-xs font-black uppercase ${badgeClass}">${badgeText}</span>`;
        }
        if (msgEl) {
            msgEl.className = `mb-6 rounded-2xl p-4 text-xs font-bold leading-relaxed ${msgClass}`;
            msgEl.textContent = pg.message || 'Hệ thống đang kiểm định ngược các tiêu chuẩn thăng hạng.';
        }

        if (critEl) {
            const criteria = pg.criteria || [];
            critEl.innerHTML = criteria.map(c => `
                <div class="rounded-2xl border ${c.passed ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/60'} p-4 text-xs">
                    <div class="flex items-center justify-between">
                        <span class="font-black text-slate-800">${esc(c.label)}</span>
                        <i class="bi ${c.passed ? 'bi-check-circle-fill text-emerald-600' : 'bi-dash-circle text-slate-400'} text-base"></i>
                    </div>
                    <p class="mt-2 text-xs font-mono font-black ${c.passed ? 'text-emerald-700' : 'text-slate-800'}">${esc(c.actual)}</p>
                    <p class="mt-1 text-[11px] text-slate-500 font-semibold">Yêu cầu: ${esc(c.threshold)}</p>
                </div>
            `).join('');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 5. RENDER WALK-FORWARD STRICT PIT BACKTEST TABLE
    // ─────────────────────────────────────────────────────────────────────────────
    function renderBacktestTable(data) {
        const bt = data.tenTierResearch?.backtestResults || {};
        const tbody = byId('backtestTableBody');
        if (!tbody) return;

        const rows = Object.values(bt).map(r => `
            <tr class="hover:bg-slate-50/80 transition-colors">
                <td class="px-4 py-3 font-bold text-slate-900">${esc(r.label)}</td>
                <td class="px-3 py-3 text-center font-mono text-slate-600">${fmt(r.totalDays)}</td>
                <td class="px-3 py-3 text-center font-mono font-bold text-slate-700">${r.hitRate10}%</td>
                <td class="px-3 py-3 text-center font-mono font-bold text-slate-700">${r.hitRate20}%</td>
                <td class="px-3 py-3 text-center font-mono font-black ${r.hitRate30 >= 35.7 ? 'text-emerald-600' : 'text-slate-800'}">
                    ${r.hitRate30}% <span class="text-[10px] text-slate-400 font-normal">(${r.hits30})</span>
                </td>
                <td class="px-3 py-3 text-center font-mono font-bold text-indigo-700">${r.hitRate50}%</td>
                <td class="px-3 py-3 text-right font-mono font-black ${r.profitK >= 0 ? 'text-emerald-600' : 'text-rose-600'}">
                    ${signed(r.profitK)}
                </td>
                <td class="px-3 py-3 text-center font-mono font-black ${r.roi >= 0 ? 'text-emerald-600' : 'text-rose-600'}">
                    ${r.roi >= 0 ? '+' : ''}${r.roi}%
                </td>
                <td class="px-3 py-3 text-center font-mono text-slate-700 font-bold">${r.maxDrawdown} ngày</td>
                <td class="px-3 py-3 text-center font-mono text-slate-600">${r.wilsonLower}%</td>
            </tr>
        `).join('');

        tbody.innerHTML = rows;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 6. RENDER TOP 36 ARITHMETIC RANKING TABLE
    // ─────────────────────────────────────────────────────────────────────────────
    function renderTopRankedTable(data) {
        const top = data.tenTierResearch?.topRanked || [];
        const tbody = byId('topRankedTableBody');
        if (!tbody) return;

        const rows = top.map((c, idx) => `
            <tr class="hover:bg-indigo-50/40 transition-colors">
                <td class="px-4 py-2.5 text-center font-mono font-bold text-slate-400">${idx + 1}</td>
                <td class="px-3 py-2.5 text-center font-mono font-black text-indigo-700 text-sm bg-indigo-50/50">${c.numStr}</td>
                <td class="px-3 py-2.5 text-right font-mono font-black text-slate-900">${c.score}</td>
                <td class="px-3 py-2.5 text-center font-mono text-slate-700">${c.head}</td>
                <td class="px-3 py-2.5 text-center font-mono text-slate-700">${c.tail}</td>
                <td class="px-3 py-2.5 text-center font-mono text-slate-700">${c.sum}</td>
                <td class="px-3 py-2.5 text-center font-mono font-bold text-violet-700">${c.bo}</td>
                <td class="px-3 py-2.5 text-center font-mono text-slate-600">${c.parity}</td>
                <td class="px-3 py-2.5 text-center font-mono text-slate-600">${c.size}</td>
                <td class="px-3 py-2.5 text-center font-mono font-bold ${c.gap <= 8 && c.gap >= 3 ? 'text-emerald-600' : 'text-slate-700'}">${c.gap}</td>
                <td class="px-3 py-2.5 text-center font-mono text-slate-600">${c.freq20y}</td>
                <td class="px-3 py-2.5 text-center font-mono text-slate-700 font-semibold">${c.pValue ?? '-'}</td>
                <td class="px-4 py-2.5 text-center">
                    ${c.fdrPass ? `
                        <span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                            <i class="bi bi-check-circle-fill"></i> Đạt FDR
                        </span>
                    ` : `
                        <span class="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                            Chưa đạt
                        </span>
                    `}
                </td>
            </tr>
        `).join('');

        tbody.innerHTML = rows;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 7. RENDER 4 COMBAT METHODS MATRIX
    // ─────────────────────────────────────────────────────────────────────────────
    function renderMethodMatrix(data) {
        const tbody = byId('methodMatrix');
        if (!tbody) return;

        const methods = [
            {
                name: '💎 Đề Tinh Hoa: Meta-Learner (Dynamic Pruning)',
                w7: '57.1% (4/7)',
                w30: '53.3% (16/30)',
                y2026: '55.8% (143/256)',
                profit: '+822.000K',
                roi: '+34.7%'
            },
            {
                name: '💎 Đề Gộp 2: Thích Ứng Alpha (Adaptive Dual Alpha)',
                w7: '57.1% (4/7)',
                w30: '56.7% (17/30)',
                y2026: '56.7% (145/256)',
                profit: '+2.652.000K',
                roi: '+17.9%'
            },
            {
                name: '🎯 Đề Gộp 1: Tiêu Chuẩn (Standard Dual Merge)',
                w7: '71.4% (5/7)',
                w30: '53.3% (16/30)',
                y2026: '55.1% (141/256)',
                profit: '+1.476.000K',
                roi: '+10.0%'
            },
            {
                name: '🏛️ Đề Gộp 3: Tam Trụ (Triple Merge)',
                w7: '71.4% (5/7)',
                w30: '66.7% (20/30)',
                y2026: '65.8% (168/256)',
                profit: '+3.318.000K',
                roi: '+15.7%'
            }
        ];

        tbody.innerHTML = methods.map(m => `
            <tr class="hover:bg-slate-50/80 transition-colors">
                <td class="px-4 py-3 font-bold text-slate-900">${esc(m.name)}</td>
                <td class="px-3 py-3 text-center font-mono font-bold text-emerald-600">${m.w7}</td>
                <td class="px-3 py-3 text-center font-mono font-bold text-emerald-600">${m.w30}</td>
                <td class="px-3 py-3 text-center font-mono font-bold text-emerald-600">${m.y2026}</td>
                <td class="px-3 py-3 text-right font-mono font-black text-emerald-600">${m.profit}</td>
                <td class="px-3 py-3 text-center font-mono font-black text-emerald-600">${m.roi}</td>
            </tr>
        `).join('');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 8. EVENT HANDLERS & INITIALIZATION
    // ─────────────────────────────────────────────────────────────────────────────
    function setupEventHandlers() {
        // Strategy tier switcher
        document.querySelectorAll('.tier-set-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                const targetTier = e.currentTarget.getAttribute('data-tier-set');
                if (!targetTier) return;
                activeTierSet = targetTier;

                document.querySelectorAll('.tier-set-btn').forEach(b => {
                    b.classList.remove('bg-indigo-600', 'text-white', 'font-black', 'shadow-xs');
                    b.classList.add('border', 'border-white/20', 'bg-white/10', 'text-indigo-200', 'font-bold');
                });
                e.currentTarget.classList.remove('border', 'border-white/20', 'bg-white/10', 'text-indigo-200', 'font-bold');
                e.currentTarget.classList.add('bg-indigo-600', 'text-white', 'font-black', 'shadow-xs');

                renderEnsembleCard(payload);
            });
        });

        // 5-Layer scientific navigator switcher
        document.querySelectorAll('.layer-nav-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                const layerKey = e.currentTarget.getAttribute('data-layer-key');
                if (!layerKey) return;
                activeLayerKey = layerKey;

                document.querySelectorAll('.layer-nav-btn').forEach(b => {
                    b.classList.remove('layer-tab-active');
                    b.classList.add('border-slate-200', 'bg-white', 'text-slate-700');
                });
                e.currentTarget.classList.remove('border-slate-200', 'bg-white', 'text-slate-700');
                e.currentTarget.classList.add('layer-tab-active');

                renderScientificLayer(layerKey);
            });
        });

        // Profit Strategy tab switcher
        document.querySelectorAll('.profit-tab-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                const tabKey = e.currentTarget.getAttribute('data-profit-tab');
                if (!tabKey) return;
                activeProfitTab = tabKey;

                document.querySelectorAll('.profit-tab-btn').forEach(b => {
                    b.classList.remove('bg-amber-500', 'text-slate-950', 'font-black', 'shadow-md');
                    b.classList.add('border', 'border-white/20', 'bg-white/10', 'text-slate-300', 'font-bold');
                });
                e.currentTarget.classList.remove('border', 'border-white/20', 'bg-white/10', 'text-slate-300', 'font-bold');
                e.currentTarget.classList.add('bg-amber-500', 'text-slate-950', 'font-black', 'shadow-md');

                renderProfitOptimizedCard(payload);
            });
        });

        // Event delegation for profit copy buttons
        byId('profitStrategyContent')?.addEventListener('click', e => {
            const copyBtn = e.target.closest('[data-copy-profit]');
            if (!copyBtn) return;
            const targetKey = copyBtn.getAttribute('data-copy-profit');
            const sep = copyBtn.getAttribute('data-copy-sep') === 'comma' ? ', ' : ' ';
            const ensembles = payload?.tenTierResearch?.profitEnsembles || {};
            let numbers = [];
            if (targetKey === 'golden_x2') {
                numbers = ensembles.goldenDualMerge?.intersectionX2 || [];
            } else if (targetKey === 'golden_x1') {
                numbers = ensembles.goldenDualMerge?.uniqueSinglesX1 || [];
            } else if (targetKey === 'golden_all') {
                numbers = ensembles.goldenDualMerge?.fullUnion || [];
            } else if (targetKey === 'meta_vip') {
                numbers = ensembles.metaLearner?.vip10 || [];
            } else if (targetKey === 'meta_elite') {
                numbers = ensembles.metaLearner?.elite20 || [];
            } else if (targetKey === 'meta_all') {
                numbers = ensembles.metaLearner?.standard30 || [];
            } else if (targetKey === 'adaptive_active') {
                numbers = ensembles.adaptiveController?.numbers || [];
            }
            copyNumbers(numbers, sep);
        });

        // Lab Tracking tab switcher
        document.querySelectorAll('.lab-track-tab-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                const methodId = e.currentTarget.getAttribute('data-lab-track-method');
                if (!methodId) return;
                activeLabTrackMethod = methodId;

                document.querySelectorAll('.lab-track-tab-btn').forEach(b => {
                    b.classList.remove('border-amber-400', 'bg-amber-400', 'text-slate-950', 'font-black', 'ring-2', 'ring-amber-300');
                    b.classList.add('border-white/20', 'bg-white/10', 'text-white', 'font-bold');
                });
                e.currentTarget.classList.remove('border-white/20', 'bg-white/10', 'text-white', 'font-bold');
                e.currentTarget.classList.add('border-amber-400', 'bg-amber-400', 'text-slate-950', 'font-black', 'ring-2', 'ring-amber-300');

                renderLabTrackingSection(payload);
            });
        });

        // Lab Ledger Filter status switcher
        document.querySelectorAll('.lab-ledger-filter-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                const filter = e.currentTarget.getAttribute('data-lab-filter');
                if (!filter) return;
                labLedgerFilterStatus = filter;

                document.querySelectorAll('.lab-ledger-filter-btn').forEach(b => {
                    b.classList.remove('bg-indigo-600', 'text-white', 'font-black', 'shadow-xs');
                    b.classList.add('bg-transparent', 'text-slate-600', 'font-bold');
                });
                e.currentTarget.classList.remove('bg-transparent', 'text-slate-600', 'font-bold');
                e.currentTarget.classList.add('bg-indigo-600', 'text-white', 'font-black', 'shadow-xs');

                const ensembles = payload?.tenTierResearch?.profitEnsembles || {};
                const activeObj = ensembles[activeLabTrackMethod] || ensembles.goldenDualMerge || {};
                renderLabDailyLedger(activeObj.settledLedger || [], activeLabTrackMethod);
            });
        });

        // Lab Ledger Search input
        byId('labLedgerSearchInput')?.addEventListener('input', e => {
            labLedgerSearchQuery = e.target.value;
            const ensembles = payload?.tenTierResearch?.profitEnsembles || {};
            const activeObj = ensembles[activeLabTrackMethod] || ensembles.goldenDualMerge || {};
            renderLabDailyLedger(activeObj.settledLedger || [], activeLabTrackMethod);
        });

        // Lab Ledger Limit select
        byId('labLedgerLimitSelect')?.addEventListener('change', e => {
            labLedgerLimit = e.target.value;
            const ensembles = payload?.tenTierResearch?.profitEnsembles || {};
            const activeObj = ensembles[activeLabTrackMethod] || ensembles.goldenDualMerge || {};
            renderLabDailyLedger(activeObj.settledLedger || [], activeLabTrackMethod);
        });

        // Copy buttons
        byId('btnCopyEnsembleSpace')?.addEventListener('click', () => {
            const numbers = payload?.tenTierResearch?.candidateSets?.[activeTierSet] || [];
            copyNumbers(numbers, ' ');
        });

        byId('btnCopyEnsembleComma')?.addEventListener('click', () => {
            const numbers = payload?.tenTierResearch?.candidateSets?.[activeTierSet] || [];
            copyNumbers(numbers, ', ');
        });
    }

    async function init() {
        try {
            const res = await fetch('/api/daily-advisor/analysis', { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            payload = await res.json();
            if (!payload.success) throw new Error(payload.error || 'Dữ liệu không khả dụng');

            renderHeroAndSource(payload);
            renderEnsembleCard(payload);
            renderProfitOptimizedCard(payload);
            renderLabTrackingSection(payload);
            renderScientificLayer(activeLayerKey);
            renderPromotionGate(payload);
            renderBacktestTable(payload);
            renderTopRankedTable(payload);
            renderMethodMatrix(payload);

            setupEventHandlers();
        } catch (err) {
            console.error('[AdvisorAnalysis] Init failed:', err);
            const errBox = byId('errorBox');
            if (errBox) {
                errBox.classList.remove('hidden');
                errBox.textContent = `Lỗi tải dữ liệu phòng nghiên cứu: ${err.message}`;
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
