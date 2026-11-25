(function () {
    'use strict';

    let _report = null;
    let _activePortfolioId = 'balanced';
    let _activeCat = 'ALL';
    let _activeTimeframe = 'full2026';
    let _activeChartRange = 'ALL';
    let _activeLedgerRange = '14';
    let _activeLedgerOutcome = 'ALL';
    let _ledgerSearch = '';
    let _chartEnabledSeries = {
        balanced: true,
        de_dynamic_governor: true,
        lo_semantic_tiered7: true,
        lo_qmbf_top7_flat: true
    };

    const $ = (id) => document.getElementById(id);

    function showHubToast(msg) {
        const toast = $('toast');
        const msgEl = $('toastMessage');
        if (toast && msgEl) {
            msgEl.textContent = msg;
            toast.classList.remove('translate-y-10', 'opacity-0', 'pointer-events-none');
            clearTimeout(window.__bmToastTimer);
            window.__bmToastTimer = setTimeout(() => {
                toast.classList.add('translate-y-10', 'opacity-0', 'pointer-events-none');
            }, 2400);
        }
    }

    async function copyToClipboard(text, label = 'Đã sao chép dàn số!') {
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
            showHubToast(label);
        } catch (_) {
            showHubToast('Không thể truy cập bộ nhớ tạm.');
        }
    }

    function fmtProfit(m) {
        const n = Number(m) || 0;
        const abs = Math.abs(n);
        const sign = n > 0 ? '+' : (n < 0 ? '-' : '');
        if (abs >= 1000) {
            return `${sign}${(abs / 1000).toFixed(2)} TỶ`;
        }
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

    function profitColorClass(m) {
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

    function renderChips(nums, chipClass) {
        if (!nums || nums.length === 0) {
            return '<span class="text-xs italic text-slate-400">Không có</span>';
        }
        return nums.map(n => `<span class="bm-chip ${chipClass}">${n}</span>`).join('');
    }

    // 1. RENDER HERO & KPI STRIP
    function renderHero(rep) {
        const byId = Object.fromEntries(rep.methods.map(m => [m.id, m]));
        const deChamp = byId.de_dynamic_governor;
        const loChamp = byId.lo_semantic_tiered7;
        const loSafe = byId.lo_qmbf_top7_flat;
        const xienChamp = byId.xien4_daily_balanced;
        const ai5Champ = byId.ai5_signal_rebound_360;

        if ($('bmTargetDateBadge')) $('bmTargetDateBadge').textContent = fmtDateVi(rep.targetDate);
        if ($('bmSourceCutoffBadge')) {
            $('bmSourceCutoffBadge').textContent = `Mốc Strict PIT: hết ${fmtDateVi(rep.latestDataDate)} (${rep.totalSettled2026} kỳ 2026)`;
        }

        const lockBadge = $('bmLockStatusBadge');
        if (lockBadge) {
            if (rep.snapshotLock?.isLocked) {
                lockBadge.innerHTML = `<i class="bi bi-lock-fill text-emerald-400"></i> Đã niêm phong bất biến trước giờ quay`;
                lockBadge.className = 'inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 px-3 py-1 text-xs font-bold text-emerald-300';
            } else {
                lockBadge.innerHTML = `<i class="bi bi-broadcast text-amber-300"></i> Dữ liệu Live tự động cập nhật R2`;
                lockBadge.className = 'inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 border border-amber-400/40 px-3 py-1 text-xs font-bold text-amber-200';
            }
        }

        const kpiWrap = $('bmHeroKpiStrip');
        if (!kpiWrap) return;

        const cards = [
            {
                eyebrow: '👑 QUÁN QUÂN ĐỀ 2026',
                title: 'Đề Dynamic Governor',
                value: deChamp ? fmtProfit(deChamp.full2026.profitM) : '--',
                sub: deChamp ? `ROI ${fmtRoi(deChamp.full2026.roi)} · ${deChamp.full2026.wins}/${deChamp.full2026.days} kỳ · 7d: ${fmtProfitShort(deChamp.last7d.profitM)}` : '',
                accent: 'text-amber-300'
            },
            {
                eyebrow: '🔥 QUÁN QUÂN LÔ 2026',
                title: 'Lô Semantic & QMBF Top 7',
                value: loChamp ? fmtProfit(loChamp.full2026.profitM) : '--',
                sub: loSafe ? `Phẳng Top 7: ${fmtProfit(loSafe.full2026.profitM)} · ${loSafe.full2026.profitableRate}% ngày lãi · DD ${loSafe.full2026.maxDrawdownM}M` : '',
                accent: 'text-emerald-300'
            },
            {
                eyebrow: '⚡ XIÊN 4 LIVE THỰC CHIẾN',
                title: 'Xiên 4 Daily (2 Dàn)',
                value: xienChamp ? fmtProfit(xienChamp.full2026.profitM) : '--',
                sub: xienChamp ? `ROI ${fmtRoi(xienChamp.full2026.roi)} · ${xienChamp.full2026.days} kỳ Live đối soát` : '',
                accent: 'text-sky-300'
            },
            {
                eyebrow: '🤖 5 AI TÍN HIỆU 360 LIVE',
                title: 'Lọc Bỏ Ngày Xấu (SKIP)',
                value: ai5Champ ? fmtProfit(ai5Champ.full2026.profitM) : '--',
                sub: ai5Champ ? `ROI ${fmtRoi(ai5Champ.full2026.roi)} · Đánh ${ai5Champ.full2026.days}/${ai5Champ.full2026.totalTracked} kỳ · 7d: ${fmtProfitShort(ai5Champ.last7d.profitM)}` : '',
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

    // 2. RENDER USER PORTFOLIO ADVISOR
    function renderPortfolios(rep) {
        const grid = $('bmPortfolioGrid');
        if (!grid) return;

        grid.innerHTML = rep.portfolios.map(p => {
            const selected = p.id === _activePortfolioId;
            return `
                <div data-portfolio-id="${p.id}" class="bm-card bm-card-interactive p-5 flex flex-col justify-between ${selected ? 'is-selected' : ''}">
                    <div>
                        <div class="flex items-center justify-between gap-2">
                            <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}">
                                ${p.badge}
                            </span>
                            <span class="text-xs font-extrabold text-slate-600 bm-tabular">
                                Hôm nay: <strong class="text-slate-900">${p.todayStakeM}M</strong>
                            </span>
                        </div>
                        <h3 class="mt-2.5 text-base font-black text-slate-900">${p.name}</h3>
                        <p class="mt-1 text-xs text-slate-500 leading-relaxed">${p.subtitle}</p>
                        <div class="mt-3 flex flex-wrap gap-1.5">
                            ${p.methodNames.map(mn => `<span class="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700">${mn}</span>`).join('')}
                        </div>
                    </div>

                    <div class="mt-4 pt-3.5 border-t border-slate-100">
                        <div class="grid grid-cols-3 gap-2 text-center">
                            <div class="rounded-xl bg-slate-50 p-2">
                                <div class="text-[10px] font-bold text-slate-500">Lãi 2026</div>
                                <div class="text-sm font-black bm-tabular ${profitColorClass(p.full2026.profitM)}">${fmtProfit(p.full2026.profitM)}</div>
                                <div class="text-[10px] font-bold text-slate-500">ROI ${fmtRoi(p.full2026.roi)}</div>
                            </div>
                            <div class="rounded-xl bg-slate-50 p-2">
                                <div class="text-[10px] font-bold text-slate-500">7 Ngày Gần</div>
                                <div class="text-sm font-black bm-tabular ${profitColorClass(p.last7d.profitM)}">${fmtProfitShort(p.last7d.profitM)}</div>
                                <div class="text-[10px] font-bold text-slate-500">${p.last7d.wins}/${p.last7d.days} thắng</div>
                            </div>
                            <div class="rounded-xl bg-slate-50 p-2">
                                <div class="text-[10px] font-bold text-slate-500">Max DD</div>
                                <div class="text-sm font-black text-slate-800 bm-tabular">${p.full2026.maxDrawdownM}M</div>
                                <div class="text-[10px] font-bold text-slate-500">Win ${p.full2026.profitableRate}%</div>
                            </div>
                        </div>
                        <div class="mt-3 flex items-center justify-between gap-2">
                            <span class="text-[11px] font-bold ${selected ? 'text-blue-600' : 'text-slate-400'}">
                                ${selected ? '<i class="bi bi-check-circle-fill"></i> Đang theo dõi trên Nhật ký' : 'Nhấn để chọn theo dõi'}
                            </span>
                            <button type="button" data-copy-portfolio="${p.id}" class="bm-copy-btn">
                                <i class="bi bi-clipboard-check"></i> Copy Bộ Hôm Nay
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        grid.querySelectorAll('[data-portfolio-id]').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('[data-copy-portfolio]')) return;
                _activePortfolioId = el.getAttribute('data-portfolio-id');
                renderPortfolios(rep);
                renderDailyLedger(rep);
            });
        });

        grid.querySelectorAll('[data-copy-portfolio]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const pid = btn.getAttribute('data-copy-portfolio');
                const p = rep.portfolios.find(x => x.id === pid);
                if (p) copyToClipboard(p.todayCopySyntax, `Đã copy trọn bộ ${p.name} ngày ${fmtDateVi(rep.targetDate)}!`);
            });
        });
    }

    // 3. RENDER TODAY'S ACTIONABLE PLAYBOOK (3 CARDS: ĐỀ, LÔ, XIÊN + 5AI 360)
    function renderTodayPlaybook(rep) {
        const container = $('bmTodayPlaybookGrid');
        if (!container) return;

        const byId = Object.fromEntries(rep.methods.map(m => [m.id, m]));
        const deGov = byId.de_dynamic_governor;
        const deCore = byId.de_core_intersect;
        const dePaD2 = byId.de_tricore_pad2;

        const loSem = byId.lo_semantic_tiered7;
        const loTop7 = byId.lo_qmbf_top7_flat;
        const loTop6 = byId.lo_qmbf_top6;
        const loGov = byId.lo_dynamic_governor;
        const loTop2 = byId.lo_qmbf_top2;

        const xien = byId.xien4_daily_balanced;
        const ai5 = byId.ai5_signal_rebound_360;
        const parity = rep.parityToday || {};

        container.innerHTML = `
            <!-- CARD 1: ĐỀ TINH HOA HÔM NAY -->
            <div class="bm-card p-5 flex flex-col justify-between">
                <div class="space-y-4">
                    <div class="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                        <div>
                            <div class="flex flex-wrap items-center gap-1.5">
                                <span class="rounded-md bg-amber-100 text-amber-900 px-2 py-0.5 text-[10px] font-black uppercase">🎯 ĐỀ ĐẶC BIỆT</span>
                                <span class="rounded-md px-2 py-0.5 text-[10px] font-black ${deGov?.today?.isSkill ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}">
                                    ${deGov?.today?.tacticalBadge || '--'}
                                </span>
                            </div>
                            <h3 class="mt-1.5 text-base font-black text-slate-900">Đề Dynamic Governor &amp; Hạt Nhân</h3>
                        </div>
                        <div class="text-right shrink-0">
                            <span class="block text-[10px] font-bold text-slate-400">Vốn dự kiến</span>
                            <span class="text-sm font-black text-slate-900 bm-tabular">${deGov?.today?.estimatedStakeM ?? '--'}M</span>
                        </div>
                    </div>

                    <div class="rounded-xl bg-slate-50 border border-slate-200/80 p-3 text-xs text-slate-600 leading-relaxed">
                        <div class="font-bold text-slate-800 mb-0.5">
                            Radar Chẵn/Lẻ: <span class="text-blue-700">${parity.predFormVi || '--'}</span>
                            <span class="text-slate-400 mx-1">·</span>
                            Loại 25 số: <span class="text-rose-600">${parity.oppFormVi || '--'}</span>
                        </div>
                        <div>${deGov?.today?.reason || ''}</div>
                    </div>

                    ${deGov?.today?.x3?.length ? `
                        <div>
                            <div class="flex items-center justify-between mb-1.5">
                                <span class="text-xs font-extrabold text-rose-700">🔥 Tầng Siêu VIP X3 (3M/số · ${deGov.today.x3.length}s):</span>
                                <button type="button" class="bm-copy-btn-soft" data-copy-text="${deGov.today.x3.join(', ')}" data-copy-label="Đã copy Đề VIP X3!"><i class="bi bi-clipboard"></i> Copy</button>
                            </div>
                            <div class="flex flex-wrap gap-1.5">${renderChips(deGov.today.x3, 'bm-chip-x3')}</div>
                        </div>
                    ` : ''}

                    ${deGov?.today?.x2?.length ? `
                        <div>
                            <div class="flex items-center justify-between mb-1.5">
                                <span class="text-xs font-extrabold text-amber-800">💎 Tầng VIP X2 (2M/số · ${deGov.today.x2.length}s):</span>
                                <button type="button" class="bm-copy-btn-soft" data-copy-text="${deGov.today.x2.join(', ')}" data-copy-label="Đã copy Đề VIP X2!"><i class="bi bi-clipboard"></i> Copy</button>
                            </div>
                            <div class="flex flex-wrap gap-1.5">${renderChips(deGov.today.x2, 'bm-chip-x2')}</div>
                        </div>
                    ` : ''}

                    <div>
                        <div class="flex items-center justify-between mb-1.5">
                            <span class="text-xs font-extrabold text-slate-700">🛡️ Tầng Lót / Phẳng X1 (1M/số · ${deGov?.today?.x1?.length || 0}s):</span>
                            <button type="button" class="bm-copy-btn-soft" data-copy-text="${(deGov?.today?.x1 || []).join(', ')}" data-copy-label="Đã copy Đề Lót X1!"><i class="bi bi-clipboard"></i> Copy</button>
                        </div>
                        <div class="flex flex-wrap gap-1.5">${renderChips(deGov?.today?.x1 || [], 'bm-chip-x1')}</div>
                    </div>

                    <div class="pt-3 border-t border-slate-100">
                        <div class="flex items-center justify-between mb-1.5">
                            <span class="text-xs font-extrabold text-indigo-700">⭐ Siêu Hạt Nhân Core Intersect (${deCore?.today?.count || 0}s · ROI ${fmtRoi(deCore?.full2026?.roi)}):</span>
                            <button type="button" class="bm-copy-btn-soft" data-copy-text="${(deCore?.today?.all || []).join(', ')}" data-copy-label="Đã copy Đề Hạt Nhân!"><i class="bi bi-clipboard"></i> Copy</button>
                        </div>
                        <div class="flex flex-wrap gap-1.5">${renderChips(deCore?.today?.all || [], 'bm-chip-x2')}</div>
                    </div>
                </div>

                <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <a href="/de-tinh-gon" class="text-xs font-bold text-blue-600 hover:underline">Xem chi tiết Đề Tinh Gọn →</a>
                    <button type="button" class="bm-copy-btn" data-copy-text="${(deGov?.today?.copySyntax || '').replace(/"/g, '&quot;')}" data-copy-label="Đã copy cú pháp Đề Dynamic!">
                        <i class="bi bi-clipboard-check"></i> Copy Cú Pháp Đề
                    </button>
                </div>
            </div>

            <!-- CARD 2: LÔ CHỦ LỰC HÔM NAY -->
            <div class="bm-card p-5 flex flex-col justify-between">
                <div class="space-y-4">
                    <div class="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                        <div>
                            <div class="flex flex-wrap items-center gap-1.5">
                                <span class="rounded-md bg-emerald-100 text-emerald-900 px-2 py-0.5 text-[10px] font-black uppercase">🚀 LÔ 27 GIẢI</span>
                                <span class="rounded-md px-2 py-0.5 text-[10px] font-black ${loGov?.today?.isSkill ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'}">
                                    ${loGov?.today?.tacticalBadge || 'LÔ CHỦ LỰC'}
                                </span>
                            </div>
                            <h3 class="mt-1.5 text-base font-black text-slate-900">Lô Cộng Hưởng Top 7 &amp; Bạch Thủ</h3>
                        </div>
                        <div class="text-right shrink-0">
                            <span class="block text-[10px] font-bold text-slate-400">Top 7 Phẳng</span>
                            <span class="text-sm font-black text-slate-900 bm-tabular">15.4M</span>
                        </div>
                    </div>

                    <div>
                        <div class="flex items-center justify-between mb-1.5">
                            <span class="text-xs font-extrabold text-emerald-800">🔥 Top 3 VIP X2 (Semantic · 4.4M/con):</span>
                            <button type="button" class="bm-copy-btn-soft" data-copy-text="${(loSem?.today?.x2 || []).join(', ')}" data-copy-label="Đã copy Lô Top 3 VIP!"><i class="bi bi-clipboard"></i> Copy</button>
                        </div>
                        <div class="flex flex-wrap gap-1.5">${renderChips(loSem?.today?.x2 || [], 'bm-chip-lo-vip')}</div>
                    </div>

                    <div>
                        <div class="flex items-center justify-between mb-1.5">
                            <span class="text-xs font-extrabold text-blue-800">🛡️ Top 4 Lót X1 (Hoàn thiện Top 7 · 2.2M/con):</span>
                            <button type="button" class="bm-copy-btn-soft" data-copy-text="${(loTop7?.today?.all || []).join(', ')}" data-copy-label="Đã copy đủ Lô Top 7!"><i class="bi bi-clipboard"></i> Copy Top 7</button>
                        </div>
                        <div class="flex flex-wrap gap-1.5">${renderChips(loSem?.today?.x1 || [], 'bm-chip-lo')}</div>
                    </div>

                    <div class="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100">
                        <div class="rounded-xl bg-slate-50 border border-slate-200/80 p-3">
                            <div class="flex items-center justify-between mb-1.5">
                                <span class="text-[11px] font-extrabold text-slate-700">⚡ Song Thủ Top 2</span>
                                <button type="button" class="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer" data-copy-text="${(loTop2?.today?.all || []).join(', ')}" data-copy-label="Đã copy Song Thủ Top 2!">Copy</button>
                            </div>
                            <div class="flex flex-wrap gap-1.5">${renderChips(loTop2?.today?.all || [], 'bm-chip-lo-vip')}</div>
                            <div class="mt-1.5 text-[10px] text-slate-500">4.4M · Nổ 1 nháy là lãi</div>
                        </div>

                        <div class="rounded-xl bg-slate-50 border border-slate-200/80 p-3">
                            <div class="flex items-center justify-between mb-1.5">
                                <span class="text-[11px] font-extrabold text-slate-700">👑 Bạch Thủ Dynamic</span>
                                <button type="button" class="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer" data-copy-text="${(loGov?.today?.all || []).join(', ')}" data-copy-label="Đã copy Bạch Thủ Lô!">Copy</button>
                            </div>
                            <div class="flex flex-wrap gap-1.5">${renderChips(loGov?.today?.all || [], loGov?.today?.isSkill ? 'bm-chip-x3' : 'bm-chip-x2')}</div>
                            <div class="mt-1.5 text-[10px] text-slate-500">${loGov?.today?.estimatedStakeM || 2.2}M · ROI ${fmtRoi(loGov?.full2026?.roi)}</div>
                        </div>
                    </div>

                    <div class="rounded-xl bg-emerald-50/70 border border-emerald-200/80 p-2.5 text-[11px] text-emerald-900">
                        <strong>Lô Top 6 QMBF (13.2M):</strong> <span class="font-mono font-black">${(loTop6?.today?.all || []).join(' · ')}</span>
                    </div>
                </div>

                <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <a href="/loto" class="text-xs font-bold text-blue-600 hover:underline">Xem chi tiết Lô 27 Giải →</a>
                    <button type="button" class="bm-copy-btn" data-copy-text="${(loSem?.today?.copySyntax || '').replace(/"/g, '&quot;')}" data-copy-label="Đã copy cú pháp Lô Top 7!">
                        <i class="bi bi-clipboard-check"></i> Copy Cú Pháp Lô
                    </button>
                </div>
            </div>

            <!-- CARD 3: XIÊN 4 LIVE & 5 AI TÍN HIỆU 360 -->
            <div class="bm-card p-5 flex flex-col justify-between">
                <div class="space-y-4">
                    <div class="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                        <div>
                            <div class="flex flex-wrap items-center gap-1.5">
                                <span class="rounded-md bg-purple-100 text-purple-900 px-2 py-0.5 text-[10px] font-black uppercase">⚡ XIÊN &amp; 5 AI 360</span>
                                <span class="rounded-md px-2 py-0.5 text-[10px] font-black ${ai5?.today?.decision === 'SKIP' ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-800'}">
                                    ${ai5?.today?.tacticalBadge || 'BET'}
                                </span>
                            </div>
                            <h3 class="mt-1.5 text-base font-black text-slate-900">Xiên 4 Daily &amp; Cổng Tín Hiệu 5AI</h3>
                        </div>
                        <div class="text-right shrink-0">
                            <span class="block text-[10px] font-bold text-slate-400">Điểm 5AI 360</span>
                            <span class="text-sm font-black text-purple-700 bm-tabular">${ai5?.today?.scoreComposite ?? '--'}/100</span>
                        </div>
                    </div>

                    <!-- Xiên 4 Daily -->
                    <div class="space-y-2">
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-extrabold text-amber-800">⚡ Xiên 4 Quây — 2 Dàn Daily (22M · ROI ${fmtRoi(xien?.full2026?.roi)}):</span>
                            <button type="button" class="bm-copy-btn-soft" data-copy-text="${(xien?.today?.copySyntax || '').replace(/"/g, '&quot;')}" data-copy-label="Đã copy 2 Dàn Xiên 4!"><i class="bi bi-clipboard"></i> Copy</button>
                        </div>
                        <div class="grid grid-cols-1 gap-2">
                            <div class="flex items-center justify-between rounded-xl bg-amber-50/70 border border-amber-200/80 px-3 py-2">
                                <span class="text-[11px] font-black text-amber-900">Dàn 1 (11M)</span>
                                <div class="flex gap-1.5">${renderChips(xien?.today?.dan1 || [], 'bm-chip-xien')}</div>
                            </div>
                            <div class="flex items-center justify-between rounded-xl bg-amber-50/70 border border-amber-200/80 px-3 py-2">
                                <span class="text-[11px] font-black text-amber-900">Dàn 2 (11M)</span>
                                <div class="flex gap-1.5">${renderChips(xien?.today?.dan2 || [], 'bm-chip-xien')}</div>
                            </div>
                        </div>
                    </div>

                    <!-- 5 AI Signal Rebound 360 -->
                    <div class="pt-3 border-t border-slate-100 space-y-2">
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-extrabold text-purple-800">🤖 5 AI Tín Hiệu Hồi Phục 360:</span>
                            <span class="text-[11px] font-black text-emerald-700 bm-tabular">Live: ${fmtProfit(ai5?.full2026?.profitM)} (${fmtRoi(ai5?.full2026?.roi)})</span>
                        </div>
                        <p class="text-[11px] text-slate-600 leading-relaxed bg-slate-50 rounded-xl p-2.5 border border-slate-200/80">
                            ${ai5?.today?.reason || ''}
                        </p>
                        ${ai5?.today?.decision !== 'SKIP' ? `
                            <div>
                                <div class="text-[11px] font-bold text-slate-500 mb-1">Lô 5AI Cửa Sổ 360 (Top 6):</div>
                                <div class="flex flex-wrap gap-1.5">${renderChips(ai5?.today?.loTop6 || [], 'bm-chip-lo')}</div>
                            </div>
                        ` : `
                            <div class="rounded-xl bg-slate-100 border border-slate-200 p-2.5 text-xs font-bold text-slate-700 text-center">
                                🛡️ Hôm nay hệ thống 5AI 360 khóa cược (SKIP) để bảo toàn vốn
                            </div>
                        `}
                    </div>
                </div>

                <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div class="flex items-center gap-3">
                        <a href="/xien-fusion" class="text-xs font-bold text-amber-700 hover:underline">Xiên Ghép →</a>
                        <a href="/ai-5" class="text-xs font-bold text-purple-700 hover:underline">5 AI 360 →</a>
                    </div>
                    <button type="button" class="bm-copy-btn" data-copy-text="${(ai5?.today?.copySyntax || '').replace(/"/g, '&quot;')}" data-copy-label="Đã copy dàn 5 AI Tín Hiệu 360!">
                        <i class="bi bi-clipboard-check"></i> Copy 5AI 360
                    </button>
                </div>
            </div>
        `;

        container.querySelectorAll('[data-copy-text]').forEach(btn => {
            btn.addEventListener('click', () => {
                copyToClipboard(btn.getAttribute('data-copy-text'), btn.getAttribute('data-copy-label') || 'Đã sao chép!');
            });
        });
    }

    // 4. RENDER LEADERBOARD TABLE
    function renderLeaderboard(rep) {
        const tbody = $('bmLeaderboardBody');
        if (!tbody) return;

        let list = rep.methods || [];
        if (_activeCat === 'DE') list = list.filter(m => m.category === 'DE');
        else if (_activeCat === 'LO') list = list.filter(m => m.category === 'LO');
        else if (_activeCat === 'OTHER') list = list.filter(m => m.category === 'XIEN' || m.category === 'AI5');

        const tfKey = _activeTimeframe; // 'full2026' | 'last30d' | 'last7d'
        list = [...list].sort((a, b) => (b[tfKey]?.profitM || 0) - (a[tfKey]?.profitM || 0));

        const catBadge = (cat) => {
            if (cat === 'DE') return 'bg-amber-100 text-amber-900 border-amber-200';
            if (cat === 'LO') return 'bg-emerald-100 text-emerald-900 border-emerald-200';
            if (cat === 'XIEN') return 'bg-sky-100 text-sky-900 border-sky-200';
            return 'bg-purple-100 text-purple-900 border-purple-200';
        };

        tbody.innerHTML = list.map((m, idx) => {
            const st = m[tfKey] || m.full2026;
            const dotsHtml = (m.formDots || []).map(dot => {
                const cls = dot.status === 'WIN' ? 'win' : (dot.status === 'LOSS' ? 'loss' : 'skip');
                const title = `${fmtDateShort(dot.date)}: ${dot.status} (${fmtProfitShort(dot.profitM)})`;
                return `<span class="bm-form-dot ${cls}" title="${title}"></span>`;
            }).join('');

            return `
                <tr class="border-b border-slate-100 hover:bg-blue-50/40 transition-colors">
                    <td class="py-3.5 pl-4 pr-3">
                        <div class="flex items-start gap-2.5">
                            <span class="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-black text-slate-700 bm-tabular">${idx + 1}</span>
                            <div>
                                <div class="flex flex-wrap items-center gap-1.5">
                                    <span class="rounded px-1.5 py-0.5 text-[10px] font-black border ${catBadge(m.category)}">${m.category}</span>
                                    <a href="${m.route}" class="font-extrabold text-slate-900 hover:text-blue-600 transition-colors">${m.name}</a>
                                </div>
                                <div class="mt-0.5 text-[11px] font-semibold text-slate-500">${m.roleBadge}</div>
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
                        <div class="text-sm ${profitColorClass(st.profitM)}">${fmtProfit(st.profitM)}</div>
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
                        <div class="mt-0.5 text-[10px] bm-tabular ${profitColorClass(m.last7d.profitM)}">7d: ${fmtProfitShort(m.last7d.profitM)}</div>
                    </td>
                    <td class="py-3.5 pl-3 pr-4 text-center">
                        <button type="button" class="bm-copy-btn-soft" data-lb-copy="${m.id}">
                            <i class="bi bi-clipboard"></i> Copy (${m.today?.count || 0}s)
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('[data-lb-copy]').forEach(btn => {
            btn.addEventListener('click', () => {
                const m = rep.methods.find(x => x.id === btn.getAttribute('data-lb-copy'));
                if (m) copyToClipboard(m.today?.copySyntax || '', `Đã copy dàn ${m.shortName}!`);
            });
        });
    }

    // 5. RENDER INTERACTIVE SVG EQUITY CURVE
    function renderEquityChart(rep) {
        const container = $('bmEquityChartWrap');
        const legendWrap = $('bmChartLegend');
        if (!container) return;

        const byId = Object.fromEntries(rep.methods.map(m => [m.id, m]));
        const ledgerAsc = [...(rep.dailyLedger || [])].reverse();
        const sliceCount = _activeChartRange === '30' ? 30 : (_activeChartRange === '60' ? 60 : ledgerAsc.length);
        const rows = ledgerAsc.slice(-sliceCount);
        if (rows.length < 2) {
            container.innerHTML = '<div class="p-8 text-center text-sm text-slate-400">Chưa đủ dữ liệu vẽ biểu đồ.</div>';
            return;
        }

        const seriesDefs = [
            { id: 'balanced', label: '👑 Bộ Cân Bằng (Đề + Lô)', color: '#2563eb' },
            { id: 'de_dynamic_governor', label: '🎯 Đề Dynamic Governor', color: '#d97706' },
            { id: 'lo_semantic_tiered7', label: '🔥 Lô Semantic Top 7 X2/X1', color: '#059669' },
            { id: 'lo_qmbf_top7_flat', label: '🚀 Lô Top 7 Phẳng', color: '#7c3aed' }
        ];

        // Compute relative-to-start cumulative curves for the chosen range
        const seriesData = seriesDefs.map(def => {
            let cum = 0;
            const pts = rows.map(r => {
                let dayP = 0;
                if (def.id === 'balanced') dayP = r.portfolios?.balanced?.dayProfitM || 0;
                else dayP = r.methods?.[def.id]?.profitM || 0;
                cum = Number((cum + dayP).toFixed(1));
                return { date: r.date, val: cum, dayP };
            });
            return { ...def, pts, endVal: pts[pts.length - 1]?.val || 0 };
        });

        if (legendWrap) {
            legendWrap.innerHTML = seriesData.map(s => {
                const enabled = _chartEnabledSeries[s.id];
                return `
                    <button type="button" data-chart-series="${s.id}" class="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold transition cursor-pointer ${enabled ? 'bg-white border-slate-300 text-slate-900 shadow-2xs' : 'bg-slate-100 border-transparent text-slate-400 opacity-60'}">
                        <span class="h-2.5 w-2.5 rounded-full" style="background:${s.color}"></span>
                        <span>${s.label}</span>
                        <span class="font-mono font-black ${s.endVal >= 0 ? 'text-emerald-700' : 'text-rose-600'}">${fmtProfit(s.endVal)}</span>
                    </button>
                `;
            }).join('');

            legendWrap.querySelectorAll('[data-chart-series]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const sid = btn.getAttribute('data-chart-series');
                    _chartEnabledSeries[sid] = !_chartEnabledSeries[sid];
                    if (!Object.values(_chartEnabledSeries).some(Boolean)) {
                        _chartEnabledSeries[sid] = true;
                    }
                    renderEquityChart(rep);
                });
            });
        }

        const activeSeries = seriesData.filter(s => _chartEnabledSeries[s.id]);
        const allVals = [0, ...activeSeries.flatMap(s => s.pts.map(p => p.val))];
        let minV = Math.min(...allVals);
        let maxV = Math.max(...allVals);
        const pad = Math.max(50, (maxV - minV) * 0.12);
        minV = Math.floor((minV - pad) / 50) * 50;
        maxV = Math.ceil((maxV + pad) / 50) * 50;
        if (maxV === minV) maxV = minV + 100;

        const W = 920, H = 290, ML = 64, MR = 22, MT = 18, MB = 34;
        const plotW = W - ML - MR;
        const plotH = H - MT - MB;
        const xOf = (i) => ML + (i / (rows.length - 1)) * plotW;
        const yOf = (v) => MT + plotH - ((v - minV) / (maxV - minV)) * plotH;

        // Gridlines (5 horizontal levels)
        const ticks = 5;
        let gridSvg = '';
        for (let t = 0; t <= ticks; t++) {
            const val = minV + ((maxV - minV) * t) / ticks;
            const y = yOf(val);
            gridSvg += `<line x1="${ML}" y1="${y.toFixed(1)}" x2="${W - MR}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-dasharray="3 3" stroke-width="1"/>`;
            gridSvg += `<text x="${ML - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#64748b" font-size="11" font-family="JetBrains Mono, monospace" font-weight="600">${Math.round(val)}M</text>`;
        }

        // Zero baseline
        const y0 = yOf(0);
        gridSvg += `<line x1="${ML}" y1="${y0.toFixed(1)}" x2="${W - MR}" y2="${y0.toFixed(1)}" stroke="#94a3b8" stroke-width="1.4"/>`;

        // X-axis labels (6 evenly spaced dates)
        const xLabelsCount = Math.min(6, rows.length);
        for (let k = 0; k < xLabelsCount; k++) {
            const idx = Math.round((k * (rows.length - 1)) / (xLabelsCount - 1));
            const x = xOf(idx);
            gridSvg += `<text x="${x.toFixed(1)}" y="${H - 10}" text-anchor="middle" fill="#64748b" font-size="11" font-family="JetBrains Mono, monospace">${fmtDateShort(rows[idx].date)}</text>`;
        }

        // Lines + subtle area for first active series
        let linesSvg = '';
        activeSeries.forEach((s, sIdx) => {
            const pathD = s.pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.val).toFixed(1)}`).join(' ');
            if (sIdx === 0) {
                const areaD = `${pathD} L${xOf(s.pts.length - 1).toFixed(1)},${y0.toFixed(1)} L${xOf(0).toFixed(1)},${y0.toFixed(1)} Z`;
                linesSvg += `<path d="${areaD}" fill="${s.color}" fill-opacity="0.07"/>`;
            }
            linesSvg += `<path d="${pathD}" fill="none" stroke="${s.color}" stroke-width="${sIdx === 0 ? 2.8 : 2.1}" stroke-linejoin="round" stroke-linecap="round"/>`;
            const last = s.pts[s.pts.length - 1];
            linesSvg += `<circle cx="${xOf(s.pts.length - 1).toFixed(1)}" cy="${yOf(last.val).toFixed(1)}" r="4" fill="${s.color}" stroke="#ffffff" stroke-width="2"/>`;
        });

        container.innerHTML = `
            <div class="relative w-full">
                <svg id="bmEquitySvg" viewBox="0 0 ${W} ${H}" class="w-full h-auto select-none">
                    ${gridSvg}
                    ${linesSvg}
                    <line id="bmChartCrosshair" x1="0" y1="${MT}" x2="0" y2="${H - MB}" stroke="#0f172a" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>
                    <rect id="bmChartHoverOverlay" x="${ML}" y="${MT}" width="${plotW}" height="${plotH}" fill="transparent" style="cursor:crosshair"/>
                </svg>
                <div id="bmChartTooltip" class="hidden pointer-events-none absolute top-3 right-4 rounded-xl bg-slate-900/95 text-white px-3.5 py-2.5 text-xs shadow-xl border border-slate-700 z-10 min-w-[200px]"></div>
            </div>
        `;

        const overlay = $('bmChartHoverOverlay');
        const crosshair = $('bmChartCrosshair');
        const tooltip = $('bmChartTooltip');
        if (overlay && crosshair && tooltip) {
            overlay.addEventListener('mousemove', (ev) => {
                const rect = overlay.getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                const idx = Math.round(ratio * (rows.length - 1));
                const xSvg = xOf(idx);
                crosshair.setAttribute('x1', xSvg.toFixed(1));
                crosshair.setAttribute('x2', xSvg.toFixed(1));
                crosshair.setAttribute('opacity', '0.45');

                const d = rows[idx].date;
                const lines = activeSeries.map(s => {
                    const pt = s.pts[idx];
                    return `<div class="flex items-center justify-between gap-3 py-0.5">
                        <span class="flex items-center gap-1.5 text-slate-300"><span class="h-2 w-2 rounded-full" style="background:${s.color}"></span>${s.label.replace(/^[^\s]+\s/, '')}</span>
                        <span class="font-mono font-black ${pt.val >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${fmtProfitShort(pt.val)}</span>
                    </div>`;
                }).join('');
                tooltip.innerHTML = `<div class="font-mono font-black text-amber-300 border-b border-slate-700 pb-1 mb-1">${fmtDateVi(d)} · GĐB: ${rows[idx].actualSpecial}</div>${lines}`;
                tooltip.classList.remove('hidden');
            });
            overlay.addEventListener('mouseleave', () => {
                crosshair.setAttribute('opacity', '0');
                tooltip.classList.add('hidden');
            });
        }
    }

    // 6. RENDER DAILY LIVE EFFECTIVENESS LEDGER
    function renderDailyLedger(rep) {
        const tbody = $('bmDailyLedgerBody');
        const summaryStrip = $('bmLedgerSummaryStrip');
        if (!tbody) return;

        let rows = rep.dailyLedger || [];
        if (_activeLedgerRange !== 'ALL') {
            rows = rows.slice(0, Number(_activeLedgerRange));
        }

        const pKey = _activePortfolioId || 'balanced';
        if (_activeLedgerOutcome === 'WIN') {
            rows = rows.filter(r => (r.portfolios?.[pKey]?.dayProfitM || 0) > 0);
        } else if (_activeLedgerOutcome === 'LOSS') {
            rows = rows.filter(r => (r.portfolios?.[pKey]?.dayProfitM || 0) <= 0);
        }

        if (_ledgerSearch.trim()) {
            const q = _ledgerSearch.trim().toLowerCase();
            rows = rows.filter(r => r.date.toLowerCase().includes(q) || fmtDateVi(r.date).includes(q) || String(r.actualSpecial).includes(q));
        }

        // Compute quick strip stats over visible rows
        if (summaryStrip) {
            const totalDayP = rows.reduce((s, r) => s + (r.portfolios?.[pKey]?.dayProfitM || 0), 0);
            const winDays = rows.filter(r => (r.portfolios?.[pKey]?.dayProfitM || 0) > 0).length;
            const deHits = rows.filter(r => r.methods?.de_dynamic_governor?.isHit).length;
            const loWins = rows.filter(r => r.methods?.lo_qmbf_top7_flat?.isWin).length;
            const activePort = rep.portfolios.find(p => p.id === pKey);

            summaryStrip.innerHTML = `
                <span class="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">Hiển thị: <strong>${rows.length}</strong> kỳ</span>
                <span class="rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-bold text-blue-800">Bộ vốn: ${activePort?.name?.replace(/^[^\s]+\s/, '') || pKey}</span>
                <span class="rounded-lg ${totalDayP >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'} border px-2.5 py-1 text-xs font-black bm-tabular">Tổng lãi đoạn này: ${fmtProfitShort(totalDayP)}</span>
                <span class="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">Đề nổ: <strong>${deHits}</strong> · Lô Top 7 lãi: <strong>${loWins}/${rows.length}</strong> · Ngày dương: <strong>${winDays}/${rows.length}</strong></span>
            `;
        }

        const renderCell = (c, showHits = false) => {
            if (!c) return '<span class="text-slate-300">—</span>';
            if (!c.played) {
                return '<span class="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">SKIP</span>';
            }
            const cls = c.profitM > 0
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : (c.profitM < 0 ? 'bg-rose-50/70 text-rose-600 border-rose-200/70' : 'bg-slate-50 text-slate-600 border-slate-200');
            const extra = showHits ? `<span class="text-[10px] opacity-75 mr-1">${c.hits}nh</span>` : (c.mode === 'SKILL' ? '<span class="text-[9px] mr-0.5">🔥</span>' : '');
            return `<span class="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-mono font-bold bm-tabular ${cls}">${extra}${fmtProfitShort(c.profitM)}</span>`;
        };

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="py-8 text-center text-sm text-slate-400">Không tìm thấy kỳ mở thưởng phù hợp với bộ lọc.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const pObj = r.portfolios?.[pKey] || { dayProfitM: 0, cumProfitM: 0 };
            const isDayWin = pObj.dayProfitM > 0;
            return `
                <tr class="table-row-contain border-b border-slate-100 ${isDayWin ? 'bg-emerald-50/20' : ''} hover:bg-blue-50/40 transition-colors">
                    <td class="py-2.5 pl-4 pr-2 font-mono text-xs font-bold text-slate-800 whitespace-nowrap">${fmtDateVi(r.date)}</td>
                    <td class="py-2.5 px-2 text-center">
                        <span class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-amber-300 font-mono text-xs font-black">${r.actualSpecial}</span>
                    </td>
                    <td class="py-2.5 px-2 text-center">${renderCell(r.methods?.de_dynamic_governor, false)}</td>
                    <td class="py-2.5 px-2 text-center">${renderCell(r.methods?.de_core_intersect, false)}</td>
                    <td class="py-2.5 px-2 text-center">${renderCell(r.methods?.lo_qmbf_top7_flat, true)}</td>
                    <td class="py-2.5 px-2 text-center">${renderCell(r.methods?.lo_semantic_tiered7, true)}</td>
                    <td class="py-2.5 px-2 text-center">${renderCell(r.methods?.lo_dynamic_governor, true)}</td>
                    <td class="py-2.5 px-2 text-center">${renderCell(r.methods?.ai5_signal_rebound_360, false)}</td>
                    <td class="py-2.5 px-2 text-right font-mono text-xs bm-tabular ${profitColorClass(pObj.dayProfitM)}">${fmtProfitShort(pObj.dayProfitM)}</td>
                    <td class="py-2.5 pl-2 pr-4 text-right font-mono text-xs font-black bm-tabular ${pObj.cumProfitM >= 0 ? 'text-blue-700' : 'text-rose-600'}">${fmtProfit(pObj.cumProfitM)}</td>
                </tr>
            `;
        }).join('');
    }

    // 7. RENDER DEMOTED TRANSPARENCY TABLE
    function renderDemotedAudit(rep) {
        const el = $('bmDemotedList');
        if (!el) return;
        const list = rep.demotedMethods || [];
        el.innerHTML = list.map(d => `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-slate-50 border border-slate-200/80 px-3.5 py-2.5 text-xs">
                <div>
                    <span class="font-extrabold text-slate-800">${d.name}</span>
                    <span class="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">${d.category} · ${d.days} kỳ</span>
                    <div class="text-[11px] text-slate-500 mt-0.5">${d.reason}</div>
                </div>
                <div class="shrink-0 text-right font-mono">
                    <span class="font-black text-rose-600">${fmtProfit(d.profitM)}</span>
                    <span class="ml-1 text-[11px] font-bold text-rose-500">(${fmtRoi(d.roi)})</span>
                </div>
            </div>
        `).join('');
    }

    function bindControls() {
        document.querySelectorAll('[data-bm-cat]').forEach(btn => {
            btn.addEventListener('click', () => {
                _activeCat = btn.getAttribute('data-bm-cat');
                document.querySelectorAll('[data-bm-cat]').forEach(b => b.classList.toggle('is-active', b === btn));
                if (_report) renderLeaderboard(_report);
            });
        });

        document.querySelectorAll('[data-bm-tf]').forEach(btn => {
            btn.addEventListener('click', () => {
                _activeTimeframe = btn.getAttribute('data-bm-tf');
                document.querySelectorAll('[data-bm-tf]').forEach(b => b.classList.toggle('is-active', b === btn));
                if (_report) renderLeaderboard(_report);
            });
        });

        document.querySelectorAll('[data-bm-chart-range]').forEach(btn => {
            btn.addEventListener('click', () => {
                _activeChartRange = btn.getAttribute('data-bm-chart-range');
                document.querySelectorAll('[data-bm-chart-range]').forEach(b => b.classList.toggle('is-active', b === btn));
                if (_report) renderEquityChart(_report);
            });
        });

        document.querySelectorAll('[data-bm-ledger-range]').forEach(btn => {
            btn.addEventListener('click', () => {
                _activeLedgerRange = btn.getAttribute('data-bm-ledger-range');
                document.querySelectorAll('[data-bm-ledger-range]').forEach(b => b.classList.toggle('is-active', b === btn));
                if (_report) renderDailyLedger(_report);
            });
        });

        document.querySelectorAll('[data-bm-ledger-outcome]').forEach(btn => {
            btn.addEventListener('click', () => {
                _activeLedgerOutcome = btn.getAttribute('data-bm-ledger-outcome');
                document.querySelectorAll('[data-bm-ledger-outcome]').forEach(b => b.classList.toggle('is-active', b === btn));
                if (_report) renderDailyLedger(_report);
            });
        });

        const searchEl = $('bmLedgerSearch');
        if (searchEl) {
            searchEl.addEventListener('input', () => {
                _ledgerSearch = searchEl.value || '';
                if (_report) renderDailyLedger(_report);
            });
        }

        const refreshBtn = $('btnBmRefresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => loadBestMethods(true));
        }
    }

    async function loadBestMethods(force = false) {
        const loadingEl = $('bmLoadingState');
        const contentEl = $('bmHubContent');
        const errEl = $('bmErrorState');
        if (loadingEl && !_report) loadingEl.classList.remove('hidden');
        if (errEl) errEl.classList.add('hidden');

        try {
            const url = force ? '/api/best-methods?refresh=1' : '/api/best-methods';
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!data || !data.success) throw new Error(data?.error || 'Dữ liệu không hợp lệ');

            _report = data;
            if (loadingEl) loadingEl.classList.add('hidden');
            if (contentEl) contentEl.classList.remove('hidden');

            renderHero(data);
            renderPortfolios(data);
            renderTodayPlaybook(data);
            renderLeaderboard(data);
            renderEquityChart(data);
            renderDailyLedger(data);
            renderDemotedAudit(data);

            if (force) showHubToast('Đã cập nhật dữ liệu mới nhất từ R2!');
        } catch (err) {
            if (loadingEl) loadingEl.classList.add('hidden');
            if (errEl) {
                errEl.textContent = `Không thể tải Trung Tâm Tinh Hoa: ${err.message}`;
                errEl.classList.remove('hidden');
            }
        }
    }

    function initBestMethodsHub() {
        if (!$('bestMethodsHubView')) return;
        bindControls();
        loadBestMethods(false);
    }

    window.initBestMethodsHub = initBestMethodsHub;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBestMethodsHub);
    } else {
        initBestMethodsHub();
    }
})();
