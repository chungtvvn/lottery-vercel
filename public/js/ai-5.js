/**
 * public/js/ai-5.js
 *
 * Giao diện Kiến Trúc 5 AI Mới Duy Nhất (5 Trường Phái Động v2 · Strict PIT)
 * Gọn gàng, tách bạch tín hiệu, đồng bộ thiết kế Light Prism với Trung Tâm Tinh Hoa.
 */
(function () {
    'use strict';

    let _data = null;
    let _activeTf = 'full2026';      // 'full2026' | 'last30d' | 'last7d'
    let _activeChartRange = 'ALL';   // 'ALL' | '60' | '30'
    let _activeLedgerRange = '14';   // '7' | '14' | '30' | 'ALL'
    let _activeLedgerOutcome = 'ALL'; // 'ALL' | 'WIN' | 'LOSS'
    let _ledgerSearch = '';
    const _expandedDates = new Set();

    const _chartSeriesEnabled = {
        pure: true,
        top2: true,
        top6: true,
        deCore: true
    };

    const $ = (id) => document.getElementById(id);

    function showToast(msg) {
        const toast = $('toast');
        const msgEl = $('toastMessage');
        if (!toast || !msgEl) return;
        msgEl.textContent = msg;
        toast.classList.remove('translate-y-10', 'opacity-0', 'pointer-events-none');
        clearTimeout(window.__ai5ToastTimer);
        window.__ai5ToastTimer = setTimeout(() => {
            toast.classList.add('translate-y-10', 'opacity-0', 'pointer-events-none');
        }, 2300);
    }

    async function copyText(text, label = 'Đã sao chép dàn số!') {
        if (!text) return;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            showToast(label);
        } catch (_) {
            showToast('Không thể truy cập bộ nhớ tạm.');
        }
    }

    function fmtProfit(m) {
        const n = Number(m) || 0;
        const abs = Math.abs(n);
        const sign = n > 0 ? '+' : (n < 0 ? '-' : '');
        if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(2)} TỶ`;
        return `${sign}${abs.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}M`;
    }

    function fmtProfitShort(m) {
        const n = Number(m) || 0;
        const sign = n > 0 ? '+' : '';
        return `${sign}${n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}M`;
    }

    function fmtRoi(r) {
        const n = Number(r) || 0;
        return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
    }

    function profitColor(m) {
        const n = Number(m) || 0;
        if (n > 0) return 'text-emerald-700 font-black';
        if (n < 0) return 'text-rose-600 font-bold';
        return 'text-slate-500 font-semibold';
    }

    function fmtDateVi(iso) {
        if (!iso || iso.length < 10) return iso || '--';
        return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
    }

    function fmtDateShort(iso) {
        if (!iso || iso.length < 10) return iso || '--';
        return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
    }

    function escAttr(str) {
        return String(str || '').replace(/"/g, '&quot;');
    }

    // 1. RENDER HERO & 4 KPI CARDS
    function renderHero(data) {
        const byId = Object.fromEntries((data.engines || []).map(e => [e.id, e]));
        const pure = byId.lo_pure;
        const top2 = byId.lo_top2;
        const top6 = byId.lo_top6;
        const deCore = byId.de_core;

        if ($('ai5TargetDateBadge')) $('ai5TargetDateBadge').textContent = fmtDateVi(data.targetDate);
        if ($('ai5PlaybookDate')) $('ai5PlaybookDate').textContent = fmtDateVi(data.targetDate);
        if ($('ai5SourceCutoffBadge')) {
            $('ai5SourceCutoffBadge').textContent = `Mốc Strict PIT: hết ${fmtDateVi(data.latestDataDate)} (${data.totalSettled2026} kỳ 2026)`;
        }
        if ($('ai5RotationBadge') && data.rotationMetrics) {
            const rm = data.rotationMetrics;
            $('ai5RotationBadge').innerHTML = `<i class="bi bi-arrow-repeat"></i> Đổi mới ${rm.avgFreshPct30d}%/ngày · ${rm.uniqueNumbers30d} số/30 kỳ`;
        }

        const kpiWrap = $('ai5HeroKpiStrip');
        if (!kpiWrap) return;

        const cards = [
            {
                eyebrow: '🔥 CHỦ LỰC #1 · ĐA TẦNG THUẦN',
                title: 'Lô Hội Tụ ≥2 Trường Phái',
                value: pure ? fmtProfit(pure.full2026.profitM) : '--',
                sub: pure ? `ROI ${fmtRoi(pure.full2026.roi)} · 30d: ${fmtProfitShort(pure.last30d.profitM)} · Hôm nay: ${pure.today.count}s (${pure.today.stakeM}M)` : '',
                accent: 'text-emerald-300'
            },
            {
                eyebrow: '⚡ VUA ROI VỐN NHỎ · 4.4M/KỲ',
                title: 'Lô Song Thủ Top 2 Borda',
                value: top2 ? fmtProfit(top2.full2026.profitM) : '--',
                sub: top2 ? `ROI ${fmtRoi(top2.full2026.roi)} · Lãi ${top2.full2026.profitableRate}% kỳ · 30d: ${fmtProfitShort(top2.last30d.profitM)}` : '',
                accent: 'text-amber-300'
            },
            {
                eyebrow: '🎲 ĐỀU TAY ỔN ĐỊNH · 13.2M/KỲ',
                title: 'Lô Lục Thủ Top 6 Borda',
                value: top6 ? fmtProfit(top6.full2026.profitM) : '--',
                sub: top6 ? `ROI ${fmtRoi(top6.full2026.roi)} · ${top6.full2026.profitableRate}% ngày lãi · DD ${top6.full2026.maxDrawdownM}M` : '',
                accent: 'text-sky-300'
            },
            {
                eyebrow: '🎯 BỔ TRỢ ĐỀ · VỐN ~3.5M/KỲ',
                title: 'Đề 5AI Hạt Nhân (5AI ∩ TriCore)',
                value: deCore ? fmtProfit(deCore.full2026.profitM) : '--',
                sub: deCore ? `ROI ${fmtRoi(deCore.full2026.roi)} · Nổ ${deCore.full2026.hitDays} ĐB · Hôm nay: ${deCore.today.count} số` : '',
                accent: 'text-purple-300'
            }
        ];

        kpiWrap.innerHTML = cards.map(c => `
            <div class="bm-kpi-dark p-4">
                <div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">${c.eyebrow}</div>
                <div class="mt-1 text-xs font-bold text-slate-200">${c.title}</div>
                <div class="mt-1.5 text-2xl font-black tracking-tight bm-tabular ${c.accent}">${c.value}</div>
                <div class="mt-1 text-[11px] font-medium text-slate-300 leading-snug">${c.sub}</div>
            </div>
        `).join('');
    }

    // 2. RENDER SIGNAL RADAR & TODAY ACTION PLAYBOOK
    function renderTodaySection(data) {
        const radarWrap = $('ai5SignalRadarBanner');
        const gridWrap = $('ai5TodayActionGrid');
        if (!radarWrap || !gridWrap) return;

        const today = data.today || {};
        const sig = today.signal || {};
        const pure = today.pure || {};
        const top2 = today.top2 || {};
        const top6 = today.top6 || {};
        const deCore = today.deCore || {};
        const parity = today.parity || {};
        const byId = Object.fromEntries((data.engines || []).map(e => [e.id, e]));

        const tierStyles = {
            STRONG: {
                box: 'border-emerald-300 bg-gradient-to-r from-emerald-50 via-white to-teal-50/70',
                badge: 'bg-emerald-600 text-white',
                bar: 'bg-emerald-500',
                scoreColor: 'text-emerald-700'
            },
            STANDARD: {
                box: 'border-blue-300 bg-gradient-to-r from-blue-50 via-white to-indigo-50/70',
                badge: 'bg-blue-600 text-white',
                bar: 'bg-blue-500',
                scoreColor: 'text-blue-700'
            },
            CAUTIOUS: {
                box: 'border-amber-300 bg-gradient-to-r from-amber-50 via-white to-slate-50',
                badge: 'bg-slate-700 text-white',
                bar: 'bg-amber-500',
                scoreColor: 'text-amber-700'
            }
        };
        const st = tierStyles[sig.tier] || tierStyles.STANDARD;

        radarWrap.innerHTML = `
            <div class="bm-card border-2 ${st.box} p-4 sm:p-5">
                <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div class="flex items-start gap-3.5">
                        <div class="flex flex-col items-center justify-center rounded-2xl bg-white border border-slate-200 px-3.5 py-2 shadow-2xs shrink-0 min-w-[82px]">
                            <span class="text-[9px] font-black uppercase tracking-wider text-slate-400">Điểm Tín Hiệu</span>
                            <span class="font-mono text-2xl font-black bm-tabular ${st.scoreColor}">${sig.score ?? 0}<span class="text-xs text-slate-400 font-bold">/100</span></span>
                            <div class="w-full h-1.5 rounded-full bg-slate-200 mt-1 overflow-hidden">
                                <div class="h-1.5 rounded-full ${st.bar}" style="width:${sig.score ?? 0}%"></div>
                            </div>
                        </div>
                        <div>
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${st.badge}">
                                    ${sig.badge || 'TÍN HIỆU 5 AI'}
                                </span>
                                <span class="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                                    <i class="bi bi-stars text-blue-600"></i> Đổi mới hôm nay: <strong>${sig.freshCount ?? 0}/6 số (${sig.freshPct ?? 0}%)</strong>
                                </span>
                                <span class="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                                    Hội tụ cao nhất: <strong>${sig.maxVote ?? 0}/5 trường phái</strong>
                                </span>
                            </div>
                            <p class="mt-2 text-xs sm:text-sm font-medium text-slate-700 leading-relaxed">${sig.reason || ''}</p>
                        </div>
                    </div>
                    <div class="flex flex-wrap items-center gap-2 shrink-0">
                        <div class="rounded-xl bg-white border border-slate-200 px-3.5 py-2 text-right">
                            <span class="block text-[10px] font-bold text-slate-400 uppercase">Vốn Lô Thuần Hôm Nay</span>
                            <span class="font-mono text-base font-black text-slate-900 bm-tabular">${pure.stakeM ?? 0}M</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Nhóm chi tiết các số hội tụ theo tầng X5..X2 để hiện cả tên trường phái bầu chọn
        const detailsByTier = { 5: [], 4: [], 3: [], 2: [] };
        (pure.details || []).forEach(d => {
            const v = Math.min(5, Math.max(2, d.votes || 2));
            detailsByTier[v].push(d);
        });

        const tierDefs = [
            { v: 5, label: 'TẦNG X5 (5/5 AI)', stake: '11M/số', win: 'Ăn 40M/n', pill: 'bg-rose-600 text-white', tile: 'bg-rose-50 border-rose-300 text-rose-950', numBg: 'bg-rose-600 text-white' },
            { v: 4, label: 'TẦNG X4 (4/5 AI)', stake: '8.8M/số', win: 'Ăn 32M/n', pill: 'bg-amber-400 text-slate-950', tile: 'bg-amber-50 border-amber-300 text-amber-950', numBg: 'bg-amber-400 text-slate-950' },
            { v: 3, label: 'TẦNG X3 (3/5 AI)', stake: '6.6M/số', win: 'Ăn 24M/n', pill: 'bg-emerald-600 text-white', tile: 'bg-emerald-50 border-emerald-300 text-emerald-950', numBg: 'bg-emerald-600 text-white' },
            { v: 2, label: 'TẦNG X2 (2/5 AI)', stake: '4.4M/số', win: 'Ăn 16M/n', pill: 'bg-teal-600 text-white', tile: 'bg-teal-50/70 border-teal-200 text-teal-950', numBg: 'bg-teal-600 text-white' }
        ];

        const activeTiersHtml = tierDefs
            .filter(t => detailsByTier[t.v].length > 0)
            .map(t => `
                <div class="space-y-2">
                    <div class="flex items-center justify-between gap-2 text-xs">
                        <span class="inline-flex items-center gap-1.5 font-extrabold text-slate-800">
                            <span class="rounded-md px-2 py-0.5 text-[10px] font-black ${t.pill}">${t.label}</span>
                            <span>${detailsByTier[t.v].length} số hội tụ</span>
                        </span>
                        <span class="font-mono text-[11px] font-bold text-slate-500">${t.stake} · ${t.win}</span>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        ${detailsByTier[t.v].map(item => `
                            <div class="rounded-xl border ${t.tile} p-2.5 flex items-center gap-2.5 shadow-2xs">
                                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-mono text-base font-black ${t.numBg} shadow-2xs">
                                    ${item.number}
                                </span>
                                <div class="min-w-0">
                                    <div class="text-[10px] font-black uppercase tracking-wide opacity-80">${item.votes}/5 AI · ${item.stakeM}M</div>
                                    <div class="text-[11px] font-bold truncate" title="${item.modelNames.join(' + ')}">${item.modelNames.join(' + ')}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('');

        gridWrap.innerHTML = `
            <!-- CỘT TRÁI (8/12): 🔥 LÔ 5AI ĐA TẦNG THUẦN + SONG THỦ TOP 2 + TOP 6 BORDA -->
            <div class="lg:col-span-8 bm-card p-5 flex flex-col justify-between space-y-5">
                <div class="space-y-4">
                    <div class="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                        <div>
                            <div class="flex flex-wrap items-center gap-1.5">
                                <span class="rounded-md bg-rose-100 text-rose-900 px-2 py-0.5 text-[10px] font-black uppercase">🔥 CHỦ LỰC LÔ 5 AI</span>
                                <span class="rounded-md bg-emerald-100 text-emerald-900 px-2 py-0.5 text-[10px] font-black">
                                    2026: ${fmtProfit(byId.lo_pure?.full2026?.profitM)} (${fmtRoi(byId.lo_pure?.full2026?.roi)})
                                </span>
                            </div>
                            <h3 class="mt-1.5 text-base sm:text-lg font-black text-slate-900">Lô Gộp Đa Tầng Thuần (Chỉ Cược ≥2 Trường Phái)</h3>
                            <p class="text-xs text-slate-500">Cắt sạch 100% số nhiễu 1-vote · Mỗi số hiển thị rõ các trường phái AI cùng đồng thuận</p>
                        </div>
                        <button type="button" class="bm-copy-btn" data-copy="${escAttr(pure.copySyntax)}" data-label="Đã copy Lô Đa Tầng Thuần ≥2 AI!">
                            <i class="bi bi-fire"></i> Copy Lô Thuần (${pure.count || 0}s)
                        </button>
                    </div>

                    ${(pure.count || 0) === 0 ? `
                        <div class="rounded-2xl bg-slate-100 border border-slate-200 p-5 text-center space-y-1">
                            <div class="text-sm font-black text-slate-800">🛡️ Hôm nay không có số hội tụ ≥2 trường phái → Nghỉ Lô Thuần (0đ)</div>
                            <div class="text-xs text-slate-500">Hệ thống tự động đứng ngoài ngày tín hiệu phân tán để bảo toàn vốn. Bạn có thể tham khảo Song Thủ Top 2 Borda bên dưới.</div>
                        </div>
                    ` : `
                        <div class="space-y-3.5">${activeTiersHtml}</div>
                    `}

                    <!-- 2 PHƯƠNG ÁN PHẲNG BỔ TRỢ: SONG THỦ TOP 2 & LỤC THỦ TOP 6 BORDA -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                        <div class="rounded-2xl bg-amber-50/70 border border-amber-200/90 p-3.5 space-y-2">
                            <div class="flex items-center justify-between gap-2">
                                <div>
                                    <span class="text-xs font-black text-amber-950">⚡ Song Thủ Top 2 Borda</span>
                                    <span class="block text-[10px] font-bold text-amber-800">4.4M/kỳ · Nổ 1 nháy là lãi · ROI 2026 ${fmtRoi(byId.lo_top2?.full2026?.roi)}</span>
                                </div>
                                <button type="button" class="bm-copy-btn-soft" data-copy="${escAttr((top2.numbers || []).join(', '))}" data-label="Đã copy Song Thủ Top 2 Borda!">
                                    <i class="bi bi-clipboard"></i> Copy
                                </button>
                            </div>
                            <div class="flex flex-wrap gap-2">
                                ${(top2.numbers || []).map(n => `<span class="bm-chip bm-chip-x2">${n}</span>`).join('')}
                            </div>
                        </div>

                        <div class="rounded-2xl bg-blue-50/60 border border-blue-200/90 p-3.5 space-y-2">
                            <div class="flex items-center justify-between gap-2">
                                <div>
                                    <span class="text-xs font-black text-blue-950">🎲 Lục Thủ Top 6 Borda Phẳng</span>
                                    <span class="block text-[10px] font-bold text-blue-800">13.2M/kỳ · ${byId.lo_top6?.full2026?.profitableRate || 0}% ngày lãi · ≥2 nháy lãi</span>
                                </div>
                                <button type="button" class="bm-copy-btn-soft" data-copy="${escAttr((top6.numbers || []).join(', '))}" data-label="Đã copy Top 6 Borda Phẳng!">
                                    <i class="bi bi-clipboard"></i> Copy
                                </button>
                            </div>
                            <div class="flex flex-wrap gap-1.5">
                                ${(top6.numbers || []).map(n => `<span class="bm-chip bm-chip-lo">${n}</span>`).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- CỘT PHẢI (4/12): 🎯 ĐỀ 5 AI HẠT NHÂN GIAO THOA (5 AI ∩ TRICORE) -->
            <div class="lg:col-span-4 bm-card p-5 flex flex-col justify-between space-y-4">
                <div class="space-y-4">
                    <div class="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                        <div>
                            <div class="flex flex-wrap items-center gap-1.5">
                                <span class="rounded-md bg-purple-100 text-purple-900 px-2 py-0.5 text-[10px] font-black uppercase">🎯 ĐỀ 5 AI TINH TUYỂN</span>
                                <span class="rounded-md bg-emerald-100 text-emerald-900 px-2 py-0.5 text-[10px] font-black">
                                    ROI ${fmtRoi(byId.de_core?.full2026?.roi)}
                                </span>
                            </div>
                            <h3 class="mt-1.5 text-base font-black text-slate-900">Đề 5 AI Hạt Nhân (5AI ∩ TriCore)</h3>
                            <p class="text-xs text-slate-500">Chỉ giữ các số trùng khớp tinh hoa giữa 5 AI &amp; TriCore sau lọc Anti-Parity</p>
                        </div>
                    </div>

                    <div class="rounded-xl bg-slate-50 border border-slate-200/80 p-3 text-xs text-slate-600 space-y-1">
                        <div class="font-bold text-slate-800">
                            Radar Chẵn/Lẻ: <span class="text-blue-700">${parity.predFormVi || '--'}</span>
                            <span class="text-slate-300 mx-1">·</span>
                            Loại 25 số: <span class="text-rose-600">${parity.oppFormVi || '--'}</span>
                        </div>
                        <div class="text-[11px] text-slate-500">${parity.tacticalAdvice || 'Lọc bỏ 25 số cực nghịch trước khi giao thoa 5 AI.'}</div>
                    </div>

                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs font-extrabold text-purple-900">⭐ Dàn Hạt Nhân Hôm Nay (${deCore.count || 0} số · ${deCore.stakeM || 0}M):</span>
                            <button type="button" class="bm-copy-btn-soft" data-copy="${escAttr((deCore.numbers || []).join(', '))}" data-label="Đã copy Đề 5AI Hạt Nhân!">
                                <i class="bi bi-clipboard"></i> Copy
                            </button>
                        </div>
                        ${(deCore.numbers || []).length > 0 ? `
                            <div class="flex flex-wrap gap-2">
                                ${deCore.numbers.map(n => `<span class="bm-chip bm-chip-x2">${n}</span>`).join('')}
                            </div>
                        ` : `
                            <div class="rounded-xl bg-slate-100 border border-slate-200 p-3 text-xs font-bold text-slate-600 text-center">
                                🛡️ Kỳ này không có giao thoa Hạt Nhân (Nghỉ Đề 0đ)
                            </div>
                        `}
                    </div>

                    <div class="rounded-xl bg-purple-50/70 border border-purple-200/80 p-3 text-[11px] text-purple-950 space-y-1">
                        <div class="flex justify-between"><span>Cược phẳng 1M/số:</span><strong class="font-mono">Ăn 84M / kỳ nổ</strong></div>
                        <div class="flex justify-between"><span>Hiệu suất 2026:</span><strong class="font-mono text-emerald-700">${fmtProfit(byId.de_core?.full2026?.profitM)} (${byId.de_core?.full2026?.hitDays || 0} kỳ nổ)</strong></div>
                    </div>
                </div>

                <div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <a href="/de-tinh-gon" class="text-xs font-bold text-blue-600 hover:underline">Mở Đề Dynamic Governor →</a>
                    <button type="button" class="bm-copy-btn-soft" data-copy="${escAttr(deCore.copySyntax)}" data-label="Đã copy cú pháp Đề 5AI Hạt Nhân!">
                        <i class="bi bi-clipboard-check"></i> Cú pháp
                    </button>
                </div>
            </div>
        `;

        gridWrap.querySelectorAll('[data-copy]').forEach(btn => {
            btn.addEventListener('click', () => {
                copyText(btn.getAttribute('data-copy'), btn.getAttribute('data-label') || 'Đã sao chép!');
            });
        });
    }

    // 3. RENDER 5 INDEPENDENT SCHOOLS & 4-ENGINE PERFORMANCE TABLE
    function renderSchoolsAndEngines(data) {
        const schoolsWrap = $('ai5SchoolsGrid');
        const tbody = $('ai5EnginesTableBody');
        const tfLabel = $('ai5TfLabel');
        const tf = _activeTf;

        if (tfLabel) {
            tfLabel.textContent = tf === 'full2026'
                ? `Khung: Toàn bộ 2026 (${data.totalSettled2026} kỳ)`
                : (tf === 'last30d' ? 'Khung: 30 kỳ gần nhất' : 'Khung: 7 kỳ gần nhất');
        }

        const pureSet = new Set(data.today?.pure?.numbers || []);

        if (schoolsWrap) {
            schoolsWrap.innerHTML = (data.schools || []).map(sc => {
                const st = sc[tf] || sc.full2026;
                const convCount = (sc.convergedNumbers || []).length;
                return `
                    <div class="bm-card p-4 flex flex-col justify-between space-y-3">
                        <div class="space-y-2.5">
                            <div class="flex items-start justify-between gap-2">
                                <div class="flex items-center gap-2 min-w-0">
                                    <span class="text-lg shrink-0">${sc.avatar}</span>
                                    <div class="min-w-0">
                                        <div class="text-sm font-black text-slate-900 truncate">${sc.name}</div>
                                        <div class="text-[10px] font-bold text-blue-700 truncate">${sc.school}</div>
                                    </div>
                                </div>
                                ${convCount > 0 ? `<span class="rounded-full bg-rose-100 text-rose-800 border border-rose-200 px-1.5 py-0.5 text-[9px] font-black shrink-0">${convCount} hội tụ</span>` : ''}
                            </div>
                            <p class="text-[11px] text-slate-500 leading-snug">${sc.desc}</p>
                            <div class="flex flex-wrap gap-1.5 pt-1">
                                ${(sc.todayNumbers || []).map(n => {
                                    const isConv = pureSet.has(n);
                                    return isConv
                                        ? `<span class="inline-flex items-center gap-0.5 rounded-lg bg-rose-600 text-white font-mono text-xs font-black px-2 py-1 shadow-2xs" title="Số hội tụ ≥2 trường phái hôm nay">${n}<span class="text-[8px] text-amber-200">★</span></span>`
                                        : `<span class="inline-flex items-center rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-mono text-xs font-bold px-2 py-1">${n}</span>`;
                                }).join('')}
                            </div>
                        </div>

                        <div class="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] bm-tabular">
                            <div>
                                <div class="text-[10px] text-slate-400 font-semibold">${st.totalHits} nháy · ${st.wins}/${st.days} lãi</div>
                                <div class="font-mono text-xs ${profitColor(st.profitM)}">${fmtProfit(st.profitM)}</div>
                            </div>
                            <span class="rounded-full px-2 py-0.5 text-[10px] font-black ${st.roi >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
                                ${fmtRoi(st.roi)}
                            </span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        if (tbody) {
            tbody.innerHTML = (data.engines || []).map((eng, idx) => {
                const st = eng[tf] || eng.full2026;
                const dotsHtml = (eng.formDots || []).map(dot => {
                    const cls = dot.status === 'WIN' ? 'win' : (dot.status === 'LOSS' ? 'loss' : 'skip');
                    return `<span class="bm-form-dot ${cls}" title="${fmtDateShort(dot.date)}: ${dot.status} (${fmtProfitShort(dot.profitM)})"></span>`;
                }).join('');
                const catCls = eng.category === 'DE'
                    ? 'bg-purple-100 text-purple-900 border-purple-200'
                    : 'bg-emerald-100 text-emerald-900 border-emerald-200';
                return `
                    <tr class="border-b border-slate-100 hover:bg-blue-50/40 transition-colors">
                        <td class="py-3.5 pl-4 pr-3">
                            <div class="flex items-start gap-2.5">
                                <span class="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-black text-slate-700 bm-tabular">${idx + 1}</span>
                                <div>
                                    <div class="flex flex-wrap items-center gap-1.5">
                                        <span class="rounded px-1.5 py-0.5 text-[10px] font-black border ${catCls}">${eng.category}</span>
                                        <span class="font-extrabold text-slate-900">${eng.name}</span>
                                    </div>
                                    <div class="mt-0.5 text-[11px] font-semibold text-slate-500">${eng.roleBadge} · <span class="font-normal">${eng.stakeRule}</span></div>
                                </div>
                            </div>
                        </td>
                        <td class="py-3.5 px-3 text-center bm-tabular">
                            <div class="font-bold text-slate-800">${st.avgDailyStakeM}M</div>
                            <div class="text-[10px] text-slate-400">${st.days} kỳ${st.skippedDays ? ` · nghỉ ${st.skippedDays}` : ''}</div>
                        </td>
                        <td class="py-3.5 px-3 text-center bm-tabular">
                            <div class="font-extrabold text-slate-800">${st.hitRate}%</div>
                            <div class="text-[10px] text-slate-400">${st.hitDays}/${st.days} kỳ nổ</div>
                        </td>
                        <td class="py-3.5 px-3 text-center bm-tabular">
                            <div class="font-black text-blue-700">${st.profitableRate}%</div>
                            <div class="text-[10px] text-slate-500" title="Cận dưới khoảng tin cậy Wilson 95%">W95⁻: ${st.wilsonLow95}%</div>
                        </td>
                        <td class="py-3.5 px-3 text-right bm-tabular">
                            <div class="text-sm ${profitColor(st.profitM)}">${fmtProfit(st.profitM)}</div>
                            <div class="text-[10px] text-slate-400">Vốn ${st.stakeM.toLocaleString('vi-VN')}M</div>
                        </td>
                        <td class="py-3.5 px-3 text-center bm-tabular">
                            <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-black ${st.roi >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
                                ${fmtRoi(st.roi)}
                            </span>
                        </td>
                        <td class="py-3.5 px-3 text-center bm-tabular">
                            <div class="font-bold text-slate-700">${st.maxDrawdownM}M</div>
                            <div class="text-[10px] text-slate-400">Thua max ${st.maxLossStreak} kỳ</div>
                        </td>
                        <td class="py-3.5 px-3 text-center">
                            <div class="inline-flex items-center gap-1" title="Phong độ 7 kỳ gần nhất (Trái → Phải)">${dotsHtml}</div>
                            <div class="mt-0.5 text-[10px] bm-tabular ${profitColor(eng.last7d.profitM)}">7d: ${fmtProfitShort(eng.last7d.profitM)}</div>
                        </td>
                        <td class="py-3.5 pl-3 pr-4 text-center">
                            <button type="button" class="bm-copy-btn-soft" data-eng-copy="${eng.id}">
                                <i class="bi bi-clipboard"></i> Copy (${eng.today?.count || 0}s)
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            tbody.querySelectorAll('[data-eng-copy]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const eng = (data.engines || []).find(x => x.id === btn.getAttribute('data-eng-copy'));
                    if (eng) copyText(eng.today?.copySyntax || '', `Đã copy ${eng.shortName}!`);
                });
            });
        }
    }

    // 4. RENDER INTERACTIVE SVG EQUITY CURVE
    function renderEquityChart(data) {
        const container = $('ai5EquityChartWrap');
        const legendWrap = $('ai5ChartLegend');
        if (!container) return;

        const ledgerAsc = [...(data.ledger || [])].reverse();
        const sliceCount = _activeChartRange === '30' ? 30 : (_activeChartRange === '60' ? 60 : ledgerAsc.length);
        const rows = ledgerAsc.slice(-sliceCount);
        if (rows.length < 2) {
            container.innerHTML = '<div class="p-8 text-center text-sm text-slate-400">Chưa đủ dữ liệu vẽ biểu đồ.</div>';
            return;
        }

        const seriesDefs = [
            { id: 'pure', label: '🔥 Lô Đa Tầng Thuần ≥2', color: '#e11d48' },
            { id: 'top2', label: '⚡ Song Thủ Top 2 Borda', color: '#d97706' },
            { id: 'top6', label: '🎲 Lục Thủ Top 6 Borda', color: '#2563eb' },
            { id: 'deCore', label: '🎯 Đề 5AI Hạt Nhân', color: '#7c3aed' }
        ];

        const seriesData = seriesDefs.map(def => {
            let cum = 0;
            const pts = rows.map(r => {
                const dayP = r[def.id]?.profitM || 0;
                cum = Number((cum + dayP).toFixed(1));
                return { date: r.date, val: cum, dayP };
            });
            return { ...def, pts, endVal: pts[pts.length - 1]?.val || 0 };
        });

        if (legendWrap) {
            legendWrap.innerHTML = seriesData.map(s => {
                const enabled = _chartSeriesEnabled[s.id];
                return `
                    <button type="button" data-ai5-series="${s.id}" class="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold transition cursor-pointer ${enabled ? 'bg-white border-slate-300 text-slate-900 shadow-2xs' : 'bg-slate-100 border-transparent text-slate-400 opacity-60'}">
                        <span class="h-2.5 w-2.5 rounded-full" style="background:${s.color}"></span>
                        <span>${s.label}</span>
                        <span class="font-mono font-black ${s.endVal >= 0 ? 'text-emerald-700' : 'text-rose-600'}">${fmtProfit(s.endVal)}</span>
                    </button>
                `;
            }).join('');

            legendWrap.querySelectorAll('[data-ai5-series]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const sid = btn.getAttribute('data-ai5-series');
                    _chartSeriesEnabled[sid] = !_chartSeriesEnabled[sid];
                    if (!Object.values(_chartSeriesEnabled).some(Boolean)) _chartSeriesEnabled[sid] = true;
                    renderEquityChart(data);
                });
            });
        }

        const activeSeries = seriesData.filter(s => _chartSeriesEnabled[s.id]);
        const allVals = [0, ...activeSeries.flatMap(s => s.pts.map(p => p.val))];
        let minV = Math.min(...allVals);
        let maxV = Math.max(...allVals);
        const pad = Math.max(40, (maxV - minV) * 0.12);
        minV = Math.floor((minV - pad) / 50) * 50;
        maxV = Math.ceil((maxV + pad) / 50) * 50;
        if (maxV === minV) maxV = minV + 100;

        const W = 920, H = 285, ML = 64, MR = 22, MT = 18, MB = 34;
        const plotW = W - ML - MR;
        const plotH = H - MT - MB;
        const xOf = (i) => ML + (i / (rows.length - 1)) * plotW;
        const yOf = (v) => MT + plotH - ((v - minV) / (maxV - minV)) * plotH;

        let gridSvg = '';
        for (let t = 0; t <= 5; t++) {
            const val = minV + ((maxV - minV) * t) / 5;
            const y = yOf(val);
            gridSvg += `<line x1="${ML}" y1="${y.toFixed(1)}" x2="${W - MR}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-dasharray="3 3" stroke-width="1"/>`;
            gridSvg += `<text x="${ML - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#64748b" font-size="11" font-family="JetBrains Mono, monospace" font-weight="600">${Math.round(val)}M</text>`;
        }
        const y0 = yOf(0);
        gridSvg += `<line x1="${ML}" y1="${y0.toFixed(1)}" x2="${W - MR}" y2="${y0.toFixed(1)}" stroke="#94a3b8" stroke-width="1.4"/>`;

        const xLabelsCount = Math.min(6, rows.length);
        for (let k = 0; k < xLabelsCount; k++) {
            const idx = Math.round((k * (rows.length - 1)) / (xLabelsCount - 1));
            gridSvg += `<text x="${xOf(idx).toFixed(1)}" y="${H - 10}" text-anchor="middle" fill="#64748b" font-size="11" font-family="JetBrains Mono, monospace">${fmtDateShort(rows[idx].date)}</text>`;
        }

        let linesSvg = '';
        activeSeries.forEach((s, sIdx) => {
            const pathD = s.pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.val).toFixed(1)}`).join(' ');
            if (sIdx === 0) {
                const areaD = `${pathD} L${xOf(s.pts.length - 1).toFixed(1)},${y0.toFixed(1)} L${xOf(0).toFixed(1)},${y0.toFixed(1)} Z`;
                linesSvg += `<path d="${areaD}" fill="${s.color}" fill-opacity="0.08"/>`;
            }
            linesSvg += `<path d="${pathD}" fill="none" stroke="${s.color}" stroke-width="${sIdx === 0 ? 2.8 : 2.1}" stroke-linejoin="round" stroke-linecap="round"/>`;
            const last = s.pts[s.pts.length - 1];
            linesSvg += `<circle cx="${xOf(s.pts.length - 1).toFixed(1)}" cy="${yOf(last.val).toFixed(1)}" r="4" fill="${s.color}" stroke="#ffffff" stroke-width="2"/>`;
        });

        container.innerHTML = `
            <div class="relative w-full">
                <svg viewBox="0 0 ${W} ${H}" class="w-full h-auto select-none">
                    ${gridSvg}
                    ${linesSvg}
                    <line id="ai5ChartCrosshair" x1="0" y1="${MT}" x2="0" y2="${H - MB}" stroke="#0f172a" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>
                    <rect id="ai5ChartHoverOverlay" x="${ML}" y="${MT}" width="${plotW}" height="${plotH}" fill="transparent" style="cursor:crosshair"/>
                </svg>
                <div id="ai5ChartTooltip" class="hidden pointer-events-none absolute top-3 right-4 rounded-xl bg-slate-900/95 text-white px-3.5 py-2.5 text-xs shadow-xl border border-slate-700 z-10 min-w-[210px]"></div>
            </div>
        `;

        const overlay = $('ai5ChartHoverOverlay');
        const crosshair = $('ai5ChartCrosshair');
        const tooltip = $('ai5ChartTooltip');
        if (overlay && crosshair && tooltip) {
            overlay.addEventListener('mousemove', (ev) => {
                const rect = overlay.getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                const idx = Math.round(ratio * (rows.length - 1));
                const xSvg = xOf(idx);
                crosshair.setAttribute('x1', xSvg.toFixed(1));
                crosshair.setAttribute('x2', xSvg.toFixed(1));
                crosshair.setAttribute('opacity', '0.45');

                const lines = activeSeries.map(s => {
                    const pt = s.pts[idx];
                    return `<div class="flex items-center justify-between gap-3 py-0.5">
                        <span class="flex items-center gap-1.5 text-slate-300"><span class="h-2 w-2 rounded-full" style="background:${s.color}"></span>${s.label.replace(/^[^\s]+\s/, '')}</span>
                        <span class="font-mono font-black ${pt.val >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${fmtProfitShort(pt.val)}</span>
                    </div>`;
                }).join('');
                tooltip.innerHTML = `<div class="font-mono font-black text-amber-300 border-b border-slate-700 pb-1 mb-1">${fmtDateVi(rows[idx].date)} · GĐB: ${rows[idx].special}</div>${lines}`;
                tooltip.classList.remove('hidden');
            });
            overlay.addEventListener('mouseleave', () => {
                crosshair.setAttribute('opacity', '0');
                tooltip.classList.add('hidden');
            });
        }
    }

    // 5. RENDER SINGLE UNIFIED DAILY LIVE LEDGER
    function renderDailyLedger(data) {
        const tbody = $('ai5DailyLedgerBody');
        const strip = $('ai5LedgerSummaryStrip');
        if (!tbody) return;

        let rows = data.ledger || [];
        if (_activeLedgerRange !== 'ALL') {
            rows = rows.slice(0, Number(_activeLedgerRange));
        }
        if (_activeLedgerOutcome === 'WIN') {
            rows = rows.filter(r => r.pure?.isWin);
        } else if (_activeLedgerOutcome === 'LOSS') {
            rows = rows.filter(r => r.pure?.played && !r.pure?.isWin);
        }
        if (_ledgerSearch.trim()) {
            const q = _ledgerSearch.trim().toLowerCase();
            rows = rows.filter(r =>
                r.date.includes(q) ||
                fmtDateVi(r.date).includes(q) ||
                String(r.special).includes(q) ||
                (r.pure?.numbers || []).some(n => n.includes(q)) ||
                (r.top6?.numbers || []).some(n => n.includes(q))
            );
        }

        if (strip) {
            const pureP = rows.reduce((s, r) => s + (r.pure?.profitM || 0), 0);
            const pureWins = rows.filter(r => r.pure?.isWin).length;
            const pureHits = rows.reduce((s, r) => s + (r.pure?.hits || 0), 0);
            const top2P = rows.reduce((s, r) => s + (r.top2?.profitM || 0), 0);
            const top6P = rows.reduce((s, r) => s + (r.top6?.profitM || 0), 0);
            const deP = rows.reduce((s, r) => s + (r.deCore?.profitM || 0), 0);

            strip.innerHTML = `
                <span class="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">Hiển thị: <strong>${rows.length}</strong> kỳ</span>
                <span class="rounded-lg ${pureP >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'} border px-2.5 py-1 text-xs font-black bm-tabular">🔥 Lô Gộp Đa Tầng 5 AI: ${fmtProfitShort(pureP)} (${pureWins}/${rows.length} lãi · ${pureHits} nháy)</span>
                <span class="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-bold text-amber-900 bm-tabular">⚡ Top 2: ${fmtProfitShort(top2P)}</span>
                <span class="rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-bold text-blue-900 bm-tabular">🎲 Top 6: ${fmtProfitShort(top6P)}</span>
                <span class="rounded-lg bg-purple-50 border border-purple-200 px-2.5 py-1 text-xs font-bold text-purple-900 bm-tabular">🎯 Đề Hạt Nhân: ${fmtProfitShort(deP)}</span>
            `;
        }

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="py-8 text-center text-sm text-slate-400">Không tìm thấy kỳ mở thưởng phù hợp bộ lọc.</td></tr>';
            return;
        }

        const renderPnlPill = (obj, showHits = true) => {
            if (!obj || obj.played === false) {
                return '<span class="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">SKIP</span>';
            }
            const cls = obj.profitM > 0
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : (obj.profitM < 0 ? 'bg-rose-50/80 text-rose-600 border-rose-200/80' : 'bg-slate-50 text-slate-600 border-slate-200');
            const hitTag = showHits ? `<span class="text-[10px] opacity-75 mr-1">${obj.hits || 0}nh</span>` : (obj.isHit ? '<span class="mr-1">⭐</span>' : '');
            return `<span class="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-mono font-bold bm-tabular ${cls}">${hitTag}${fmtProfitShort(obj.profitM)}</span>`;
        };

        const sigBadge = (s) => {
            if (!s) return '--';
            if (s.tier === 'STRONG') return `<span class="inline-flex rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-black font-mono">🔥 ${s.score}đ</span>`;
            if (s.tier === 'STANDARD') return `<span class="inline-flex rounded-md bg-blue-100 text-blue-800 border border-blue-200 px-1.5 py-0.5 text-[10px] font-black font-mono">⚡ ${s.score}đ</span>`;
            return `<span class="inline-flex rounded-md bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold font-mono">${s.score}đ</span>`;
        };

        const schoolMetaList = data.schools || [];

        const tierMeta = [
            { key: 'x5Nums', mult: 5, tag: 'X5', stakePerNumM: 11.0, winPerHitM: 40.0, chipMiss: 'bg-rose-50 border-rose-300 text-rose-900', tagCls: 'bg-rose-600 text-white', boxCls: 'bg-rose-50/60 border-rose-200' },
            { key: 'x4Nums', mult: 4, tag: 'X4', stakePerNumM: 8.8, winPerHitM: 32.0, chipMiss: 'bg-amber-50 border-amber-300 text-amber-950', tagCls: 'bg-amber-400 text-slate-950', boxCls: 'bg-amber-50/60 border-amber-200' },
            { key: 'x3Nums', mult: 3, tag: 'X3', stakePerNumM: 6.6, winPerHitM: 24.0, chipMiss: 'bg-indigo-50 border-indigo-300 text-indigo-950', tagCls: 'bg-indigo-600 text-white', boxCls: 'bg-indigo-50/60 border-indigo-200' },
            { key: 'x2Nums', mult: 2, tag: 'X2', stakePerNumM: 4.4, winPerHitM: 16.0, chipMiss: 'bg-teal-50/80 border-teal-200 text-teal-900', tagCls: 'bg-teal-600 text-white', boxCls: 'bg-teal-50/50 border-teal-200' }
        ];

        tbody.innerHTML = rows.map(r => {
            const isExp = _expandedDates.has(r.date);
            const p27Counts = {};
            (r.prizes27 || []).forEach(n => { p27Counts[n] = (p27Counts[n] || 0) + 1; });

            const tiers = r.pure?.tiers || {};
            const multByNum = {};
            tierMeta.forEach(tm => {
                (tiers[tm.key] || []).forEach(n => { multByNum[n] = tm; });
            });

            // Hiển thị chip kèm nhãn Tầng (X5/X4/X3/X2) ngay trên dòng chính của bảng
            const pureChips = (r.pure?.numbers || []).length === 0
                ? '<span class="text-[11px] italic text-slate-400">0 số (Nghỉ 0đ)</span>'
                : (r.pure.numbers || []).map(n => {
                    const tm = multByNum[n] || tierMeta[3];
                    const h = p27Counts[n] || 0;
                    if (h > 0) {
                        return `<span class="inline-flex items-center gap-0.5 rounded-md bg-emerald-600 text-white font-mono text-[11px] font-black px-1.5 py-0.5 shadow-2xs" title="🎯 Nổ ${h} nháy · Tầng ${tm.tag} (+${(h * tm.winPerHitM).toFixed(0)}M)"><span>${n}</span><span class="rounded bg-white/20 px-1 text-[9px] font-sans">${tm.tag}${h > 1 ? `·${h}n` : ''}</span></span>`;
                    }
                    return `<span class="inline-flex items-center gap-0.5 rounded-md border ${tm.chipMiss} font-mono text-[11px] font-bold px-1.5 py-0.5" title="Tầng ${tm.tag} (${tm.stakePerNumM}M/con)"><span>${n}</span><span class="rounded px-1 text-[8.5px] font-sans font-black ${tm.tagCls}">${tm.tag}</span></span>`;
                }).join(' ');

            const activeTierBlocks = tierMeta
                .filter(tm => (tiers[tm.key] || []).length > 0)
                .map(tm => {
                    const nums = tiers[tm.key] || [];
                    const tierStakeM = nums.length * tm.stakePerNumM;
                    let tierHits = 0;
                    let tierPayoutM = 0;
                    const chips = nums.map(n => {
                        const h = p27Counts[n] || 0;
                        tierHits += h;
                        tierPayoutM += h * tm.winPerHitM;
                        const voters = schoolMetaList
                            .filter(sc => (r.schools?.[sc.id]?.numbers || []).includes(n))
                            .map(sc => sc.name);
                        const voterTxt = voters.length ? voters.join('+') : `${tm.mult} AI`;
                        if (h > 0) {
                            return `<span class="inline-flex items-center gap-1 rounded-lg bg-emerald-600 text-white font-mono text-xs font-black px-2 py-1 shadow-2xs"><span>🎯 ${n}</span><span class="rounded bg-white text-emerald-900 px-1 text-[9px] font-sans">${h}n +${(h * tm.winPerHitM).toFixed(0)}M</span><span class="text-[9px] font-sans opacity-90">(${voterTxt})</span></span>`;
                        }
                        return `<span class="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-mono text-xs font-bold px-2 py-1"><span>${n}</span><span class="text-[9px] font-sans font-semibold text-slate-400">(${voterTxt})</span></span>`;
                    }).join('');
                    const tierProfM = tierPayoutM - tierStakeM;
                    return `
                        <div class="rounded-xl border ${tm.boxCls} p-2.5 space-y-1.5">
                            <div class="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                <span class="flex items-center gap-1.5 font-extrabold text-slate-800">
                                    <span class="rounded px-1.5 py-0.5 text-[10px] font-black ${tm.tagCls}">TẦNG ${tm.tag} (${tm.mult}/5 AI)</span>
                                    <span>${nums.length} số · Vốn ${tierStakeM.toFixed(1)}M (${tm.stakePerNumM}M/con · Ăn ${tm.winPerHitM}M/n)</span>
                                </span>
                                <span class="font-mono font-black ${profitColor(tierProfM)}">${tierHits} nháy · ${fmtProfitShort(tierProfM)}</span>
                            </div>
                            <div class="flex flex-wrap gap-1.5">${chips}</div>
                        </div>
                    `;
                }).join('');

            const detailRow = isExp ? `
                <tr class="bg-slate-50/90 border-b border-slate-200">
                    <td colspan="9" class="p-4 space-y-3">
                        <!-- KHỐI 1: CHI TIẾT 🔥 LÔ GỘP ĐA TẦNG 5 AI THEO TỪNG TẦNG X5..X2 -->
                        <div class="rounded-2xl bg-white border-2 border-rose-200 p-3.5 space-y-2.5 shadow-2xs">
                            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                                <div class="flex items-center gap-2">
                                    <span class="text-sm">🔥</span>
                                    <span class="text-xs font-black text-slate-900 uppercase">Chi Tiết Lô Gộp Đa Tầng 5 AI — Ngày ${fmtDateVi(r.date)}</span>
                                    <span class="rounded-md bg-rose-50 text-rose-800 border border-rose-200 px-2 py-0.5 text-[10px] font-black">${r.pure?.count || 0} số ≥2 trường phái</span>
                                </div>
                                <div class="flex flex-wrap items-center gap-2 font-mono text-xs">
                                    <span class="text-slate-500">Vốn: <strong class="text-slate-800">${r.pure?.stakeM ?? 0}M</strong></span>
                                    <span class="text-slate-300">·</span>
                                    <span class="text-slate-500">Ăn: <strong class="text-emerald-700">${r.pure?.payoutM ?? 0}M</strong> (${r.pure?.hits || 0} nháy)</span>
                                    <span class="text-slate-300">·</span>
                                    <span class="${profitColor(r.pure?.profitM)}">Lãi: ${fmtProfitShort(r.pure?.profitM)}</span>
                                    <span class="text-slate-300">·</span>
                                    <span class="text-blue-700 font-black">LK: ${fmtProfit(r.pure?.cumProfitM)}</span>
                                </div>
                            </div>
                            ${activeTierBlocks || '<div class="text-xs text-slate-500 italic">🛡️ Kỳ này không có số đạt ≥2 trường phái → Nghỉ Lô Đa Tầng (0đ bảo toàn vốn).</div>'}
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-[11px]">
                                <div class="rounded-lg bg-amber-50/70 border border-amber-200 px-2.5 py-1.5 flex items-center justify-between">
                                    <span class="font-bold text-amber-950">⚡ Top 2: <span class="font-mono">${(r.top2?.numbers || []).join(', ')}</span></span>
                                    <span class="font-mono font-black ${profitColor(r.top2?.profitM)}">${fmtProfitShort(r.top2?.profitM)}</span>
                                </div>
                                <div class="rounded-lg bg-blue-50/70 border border-blue-200 px-2.5 py-1.5 flex items-center justify-between">
                                    <span class="font-bold text-blue-950">🎲 Top 6: <span class="font-mono">${(r.top6?.numbers || []).join(', ')}</span></span>
                                    <span class="font-mono font-black ${profitColor(r.top6?.profitM)}">${fmtProfitShort(r.top6?.profitM)}</span>
                                </div>
                                <div class="rounded-lg bg-purple-50/70 border border-purple-200 px-2.5 py-1.5 flex items-center justify-between">
                                    <span class="font-bold text-purple-950">🎯 Đề 5AI: <span class="font-mono">${(r.deCore?.numbers || []).join(', ') || 'Nghỉ'}</span></span>
                                    <span class="font-mono font-black ${profitColor(r.deCore?.profitM)}">${r.deCore?.played ? fmtProfitShort(r.deCore?.profitM) : 'SKIP'}</span>
                                </div>
                            </div>
                        </div>

                        <!-- KHỐI 2: 5 TRƯỜNG PHÁI ĐỘC LẬP -->
                        <div class="grid grid-cols-1 md:grid-cols-5 gap-2.5">
                            ${schoolMetaList.map(sc => {
                                const ds = r.schools?.[sc.id] || { numbers: [], hits: 0, profitM: 0 };
                                return `
                                    <div class="rounded-xl bg-white border border-slate-200 p-2.5 space-y-1.5">
                                        <div class="flex items-center justify-between text-[11px]">
                                            <span class="font-extrabold text-slate-800">${sc.avatar} ${sc.name}</span>
                                            <span class="font-mono font-bold ${profitColor(ds.profitM)}">${ds.hits}nh · ${fmtProfitShort(ds.profitM)}</span>
                                        </div>
                                        <div class="flex flex-wrap gap-1">
                                            ${(ds.numbers || []).map(n => {
                                                const h = p27Counts[n] || 0;
                                                return h > 0
                                                    ? `<span class="rounded bg-emerald-600 text-white font-mono text-[10px] font-black px-1.5 py-0.5">${n}${h > 1 ? `×${h}` : ''}</span>`
                                                    : `<span class="rounded bg-slate-100 text-slate-600 font-mono text-[10px] font-semibold px-1.5 py-0.5">${n}</span>`;
                                            }).join('')}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>

                        <!-- KHỐI 3: BẢNG 27 GIẢI XSMB -->
                        <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 text-[11px]">
                            <div class="flex flex-wrap items-center gap-1">
                                <span class="font-bold text-slate-500 mr-1">27 Giải XSMB (${fmtDateVi(r.date)}):</span>
                                ${(r.prizes27 || []).map((n, i) => `<span class="font-mono px-1.5 py-0.5 rounded ${i === 0 ? 'bg-slate-900 text-amber-300 font-black' : 'bg-slate-100 text-slate-700 font-semibold'}">${n}</span>`).join('')}
                            </div>
                        </div>
                    </td>
                </tr>
            ` : '';

            return `
                <tr data-ai5-day="${r.date}" class="ai5-row-clickable border-b border-slate-100 ${r.pure?.isWin ? 'bg-emerald-50/20' : ''} transition-colors">
                    <td class="py-2.5 pl-4 pr-2 font-mono text-xs font-bold text-slate-800 whitespace-nowrap">
                        <i class="bi bi-chevron-${isExp ? 'down' : 'right'} text-[10px] text-slate-400 mr-1"></i>${fmtDateVi(r.date)}
                    </td>
                    <td class="py-2.5 px-2 text-center">
                        <span class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-amber-300 font-mono text-xs font-black">${r.special}</span>
                    </td>
                    <td class="py-2.5 px-2 text-center">${sigBadge(r.signal)}</td>
                    <td class="py-2.5 px-2">
                        <div class="flex flex-wrap items-center gap-1">${pureChips}</div>
                    </td>
                    <td class="py-2.5 px-2 text-center">
                        <div>${renderPnlPill(r.pure, true)}</div>
                        <div class="text-[9.5px] font-mono text-slate-400 mt-0.5">Vốn ${r.pure?.stakeM ?? 0}M</div>
                    </td>
                    <td class="py-2.5 px-2 text-center">${renderPnlPill(r.top2, true)}</td>
                    <td class="py-2.5 px-2 text-center">${renderPnlPill(r.top6, true)}</td>
                    <td class="py-2.5 px-2 text-center">${renderPnlPill(r.deCore, false)}</td>
                    <td class="py-2.5 pl-2 pr-4 text-right font-mono text-xs font-black bm-tabular ${r.pure.cumProfitM >= 0 ? 'text-blue-700' : 'text-rose-600'}">${fmtProfit(r.pure.cumProfitM)}</td>
                </tr>
                ${detailRow}
            `;
        }).join('');

        tbody.querySelectorAll('[data-ai5-day]').forEach(tr => {
            tr.addEventListener('click', () => {
                const d = tr.getAttribute('data-ai5-day');
                if (_expandedDates.has(d)) _expandedDates.delete(d);
                else _expandedDates.add(d);
                renderDailyLedger(data);
            });
        });
    }

    function bindControls() {
        document.querySelectorAll('[data-ai5-tf]').forEach(btn => {
            btn.addEventListener('click', () => {
                _activeTf = btn.getAttribute('data-ai5-tf');
                document.querySelectorAll('[data-ai5-tf]').forEach(b => b.classList.toggle('is-active', b === btn));
                if (_data) renderSchoolsAndEngines(_data);
            });
        });

        document.querySelectorAll('[data-ai5-chart-range]').forEach(btn => {
            btn.addEventListener('click', () => {
                _activeChartRange = btn.getAttribute('data-ai5-chart-range');
                document.querySelectorAll('[data-ai5-chart-range]').forEach(b => b.classList.toggle('is-active', b === btn));
                if (_data) renderEquityChart(_data);
            });
        });

        document.querySelectorAll('[data-ai5-ledger-range]').forEach(btn => {
            btn.addEventListener('click', () => {
                _activeLedgerRange = btn.getAttribute('data-ai5-ledger-range');
                document.querySelectorAll('[data-ai5-ledger-range]').forEach(b => b.classList.toggle('is-active', b === btn));
                if (_data) renderDailyLedger(_data);
            });
        });

        document.querySelectorAll('[data-ai5-ledger-outcome]').forEach(btn => {
            btn.addEventListener('click', () => {
                _activeLedgerOutcome = btn.getAttribute('data-ai5-ledger-outcome');
                document.querySelectorAll('[data-ai5-ledger-outcome]').forEach(b => b.classList.toggle('is-active', b === btn));
                if (_data) renderDailyLedger(_data);
            });
        });

        const searchEl = $('ai5LedgerSearch');
        if (searchEl) {
            searchEl.addEventListener('input', () => {
                _ledgerSearch = searchEl.value || '';
                if (_data) renderDailyLedger(_data);
            });
        }

        const btnCopyAll = $('btnCopyAll5AiToday');
        if (btnCopyAll) {
            btnCopyAll.addEventListener('click', () => {
                if (_data?.today?.allInOneCopySyntax) {
                    copyText(_data.today.allInOneCopySyntax, `Đã copy trọn bộ 5 AI kỳ ${fmtDateVi(_data.targetDate)}!`);
                }
            });
        }

        const btnRefresh = $('btnAi5Refresh');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => loadData(true));
        }
    }

    async function loadData(force = false) {
        const loading = $('ai5LoadingState');
        const content = $('ai5MainContent');
        const errBox = $('ai5ErrorState');
        if (loading && !_data) loading.classList.remove('hidden');
        if (errBox) errBox.classList.add('hidden');

        try {
            const url = force ? '/api/ai-5?refresh=1' : '/api/ai-5';
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!data || !data.success) throw new Error(data?.error || 'Dữ liệu 5 AI không hợp lệ');

            _data = data;
            // Tự động mở sẵn chi tiết ngày mới nhất khi tải lần đầu để thấy ngay bảng Lô Gộp Đa Tầng 5 AI
            if (_expandedDates.size === 0 && Array.isArray(data.ledger) && data.ledger.length > 0) {
                _expandedDates.add(data.ledger[0].date);
            }
            if (loading) loading.classList.add('hidden');
            if (content) content.classList.remove('hidden');

            renderHero(data);
            renderTodaySection(data);
            renderSchoolsAndEngines(data);
            renderEquityChart(data);
            renderDailyLedger(data);

            if (force) showToast('Đã đồng bộ dữ liệu 5 AI mới nhất từ Cloudflare R2!');
        } catch (err) {
            if (loading) loading.classList.add('hidden');
            if (errBox) {
                errBox.textContent = `Không thể tải trang 5 AI: ${err.message}`;
                errBox.classList.remove('hidden');
            }
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindControls();
        loadData(false);
    });
})();
