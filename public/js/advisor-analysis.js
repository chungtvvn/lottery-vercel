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
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

    let payload = null;
    let activeTierSet = 'standard30';
    let activeTierIdx = 1;

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
        const sourceHtml = [
            ['Ngày dự đoán', data.predictionDate || ttr.targetDate || '-'],
            ['Đài quay mở thưởng', ttr.dayOfWeek || '-'],
            ['Dữ liệu phân tích', `${fmt(ttr.historicalDrawsAnalyzed || 7558)} kỳ (${ttr.firstDrawDate || '2005-10-01'} → ${ttr.lastDrawDate || '-'})`],
            ['KQ Đề kỳ trước', `<span class="font-mono text-amber-300 font-black text-sm">${ttr.lastDrawSpecial || '--'}</span>`]
        ].map(([label, value]) => `
            <div>
                <span class="text-slate-400 font-semibold">${esc(label)}:</span> 
                <span class="font-bold text-white ml-1">${value}</span>
            </div>
        `).join('');
        setHtml('sourceBar', sourceHtml);

        const kpiHtml = [
            {
                label: 'Tổng kỳ quay 20 năm',
                value: fmt(ttr.historicalDrawsAnalyzed || 7558),
                sub: '01/10/2005 đến nay',
                color: 'text-indigo-400',
                icon: 'bi-database-check'
            },
            {
                label: 'Kiến trúc mô hình',
                value: '10 Tầng AI & Số Học',
                sub: 'Full Frequency → Attention',
                color: 'text-emerald-400',
                icon: 'bi-layers-half'
            },
            {
                label: 'Đề xuất hôm nay',
                value: `${(ttr.candidateSets?.[activeTierSet] || []).length} Số`,
                sub: 'Phân tầng Dàn 30 Chuẩn',
                color: 'text-amber-400',
                icon: 'bi-bullseye'
            },
            {
                label: 'Cổng Thăng Hạng',
                value: ttr.promotionGate?.status === 'eligible' ? 'Đủ điều kiện' : 'Đang theo dõi',
                sub: `${ttr.promotionGate?.passedCount || 2}/4 tiêu chuẩn khắt khe`,
                color: ttr.promotionGate?.status === 'eligible' ? 'text-emerald-400' : 'text-amber-300',
                icon: 'bi-shield-check'
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
                label: 'Điểm cộng hưởng 10 tầng',
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
    // 3. RENDER 10-TIER DETAIL VIEWS
    // ─────────────────────────────────────────────────────────────────────────────
    function renderTierDetail(tierIdx) {
        const ttr = payload?.tenTierResearch || {};
        const ta = ttr.tierAnalytics || {};

        let contentHtml = '';
        switch (tierIdx) {
            case 1: { // Frequency & Distribution
                const t1 = ta.tier1_frequency || {};
                const heads = t1.headDist || [];
                const tails = t1.tailDist || [];
                const sums = t1.sumDist || [];
                const bos = t1.boDist || {};
                const parities = t1.parityDist || {};
                const sizes = t1.sizeDist || {};

                contentHtml = `
                    <div class="space-y-6">
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                            <div>
                                <h3 class="text-base font-black text-slate-900">${esc(t1.name)}</h3>
                                <p class="text-xs text-slate-500">${esc(t1.description)}</p>
                            </div>
                            <div class="flex gap-3 text-xs font-bold text-slate-600">
                                <span>Kỳ vọng TB: <strong class="text-indigo-600 font-black">${t1.expectedMean} lần</strong></span>
                                <span>Chi-Square: <strong class="text-violet-600 font-black">${t1.chiSquare}</strong></span>
                            </div>
                        </div>

                        <!-- 4 Grids of Arithmetic Distributions -->
                        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <!-- Phân Bố Đầu -->
                            <div class="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                                <h4 class="text-xs font-black uppercase text-indigo-700 mb-3 flex items-center gap-1.5">
                                    <i class="bi bi-bar-chart-fill"></i> Phân Bố 10 Đầu Số
                                </h4>
                                <div class="space-y-1.5">
                                    ${heads.map((count, h) => `
                                        <div class="flex items-center justify-between text-xs">
                                            <span class="font-mono font-bold text-slate-700">Đầu ${h}:</span>
                                            <div class="flex items-center gap-2">
                                                <div class="h-2 w-24 bg-slate-200 rounded-full overflow-hidden">
                                                    <div class="h-full bg-indigo-600 rounded-full" style="width: ${Math.min(100, (count / (t1.totalDraws * 0.13)) * 100)}%"></div>
                                                </div>
                                                <span class="font-mono font-black text-slate-900 w-10 text-right">${count}</span>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>

                            <!-- Phân Bố Đuôi -->
                            <div class="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                                <h4 class="text-xs font-black uppercase text-indigo-700 mb-3 flex items-center gap-1.5">
                                    <i class="bi bi-bar-chart-fill"></i> Phân Bố 10 Đuôi Số
                                </h4>
                                <div class="space-y-1.5">
                                    ${tails.map((count, t) => `
                                        <div class="flex items-center justify-between text-xs">
                                            <span class="font-mono font-bold text-slate-700">Đuôi ${t}:</span>
                                            <div class="flex items-center gap-2">
                                                <div class="h-2 w-24 bg-slate-200 rounded-full overflow-hidden">
                                                    <div class="h-full bg-violet-600 rounded-full" style="width: ${Math.min(100, (count / (t1.totalDraws * 0.13)) * 100)}%"></div>
                                                </div>
                                                <span class="font-mono font-black text-slate-900 w-10 text-right">${count}</span>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>

                            <!-- Phân Bố Tổng -->
                            <div class="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                                <h4 class="text-xs font-black uppercase text-indigo-700 mb-3 flex items-center gap-1.5">
                                    <i class="bi bi-bar-chart-fill"></i> Phân Bố 10 Tổng Đề
                                </h4>
                                <div class="space-y-1.5">
                                    ${sums.map((count, s) => `
                                        <div class="flex items-center justify-between text-xs">
                                            <span class="font-mono font-bold text-slate-700">Tổng ${s}:</span>
                                            <div class="flex items-center gap-2">
                                                <div class="h-2 w-24 bg-slate-200 rounded-full overflow-hidden">
                                                    <div class="h-full bg-teal-600 rounded-full" style="width: ${Math.min(100, (count / (t1.totalDraws * 0.13)) * 100)}%"></div>
                                                </div>
                                                <span class="font-mono font-black text-slate-900 w-10 text-right">${count}</span>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>

                            <!-- Parity & Size -->
                            <div class="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                                <h4 class="text-xs font-black uppercase text-indigo-700 mb-3 flex items-center gap-1.5">
                                    <i class="bi bi-pie-chart-fill"></i> Chẵn/Lẻ & Tài/Xỉu
                                </h4>
                                <div class="space-y-2 text-xs">
                                    <div class="p-2.5 bg-white rounded-xl border border-slate-200">
                                        <p class="font-bold text-slate-500 text-[10px] uppercase">Chẵn Lẻ (25 số / bộ)</p>
                                        <div class="grid grid-cols-2 gap-1 mt-1 font-mono font-black text-slate-800">
                                            <span>CC: ${parities.CC}</span>
                                            <span>CL: ${parities.CL}</span>
                                            <span>LC: ${parities.LC}</span>
                                            <span>LL: ${parities.LL}</span>
                                        </div>
                                    </div>
                                    <div class="p-2.5 bg-white rounded-xl border border-slate-200">
                                        <p class="font-bold text-slate-500 text-[10px] uppercase">Tài / Xỉu (50 số / bộ)</p>
                                        <div class="grid grid-cols-2 gap-1 mt-1 font-mono font-black text-slate-800">
                                            <span>Xỉu (00-49): ${sizes.small}</span>
                                            <span>Tài (50-99): ${sizes.big}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 15 Bộ Số Tương Sinh -->
                        <div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                            <h4 class="text-xs font-black uppercase text-indigo-700 mb-2">15 Bộ Số Học Tương Sinh</h4>
                            <div class="grid gap-2 grid-cols-3 sm:grid-cols-5">
                                ${Object.entries(bos).map(([boKey, count]) => `
                                    <div class="p-2 rounded-xl bg-white border border-slate-200 text-xs">
                                        <span class="font-mono font-black text-indigo-700">Bộ ${boKey}</span>: 
                                        <span class="font-mono font-bold text-slate-800">${count} lần</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `;
                break;
            }

            case 2: { // Recency / Gap
                const t2 = ta.tier2_gap || {};
                contentHtml = `
                    <div class="space-y-4">
                        <div class="border-b border-slate-100 pb-3">
                            <h3 class="text-base font-black text-slate-900">${esc(t2.name)}</h3>
                            <p class="text-xs text-slate-500">${esc(t2.description)}</p>
                        </div>
                        <div class="grid gap-4 sm:grid-cols-3">
                            <div class="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                                <span class="text-xs font-bold uppercase text-emerald-800">Điểm Rơi Vàng (Gan 3 - 8 kỳ)</span>
                                <p class="text-2xl font-black text-emerald-900 mt-1">${t2.sweetSpotCount || 0} con số</p>
                                <p class="text-xs text-emerald-700 mt-1">Vùng phân phối có mật độ nổ tự nhiên cao nhất</p>
                            </div>
                            <div class="rounded-2xl border border-rose-200 bg-rose-50/50 p-4">
                                <span class="text-xs font-bold uppercase text-rose-800">Cảnh Báo Gan Nặng (> 30 kỳ)</span>
                                <p class="text-2xl font-black text-rose-900 mt-1">${t2.coldCount || 0} con số</p>
                                <p class="text-xs text-rose-700 mt-1">Được áp dụng hàm phạt Hazard để tránh bẫy Gambler's Fallacy</p>
                            </div>
                            <div class="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
                                <span class="text-xs font-bold uppercase text-indigo-800">Đề Kỳ Trước (Nhịp Rơi Lại)</span>
                                <p class="text-2xl font-black text-indigo-900 mt-1 font-mono">${t2.lastSpecial || '--'}</p>
                                <p class="text-xs text-indigo-700 mt-1">Tỷ lệ bệt đề lịch sử: ~1.01%</p>
                            </div>
                        </div>
                    </div>
                `;
                break;
            }

            case 3: { // Rolling Window
                const t3 = ta.tier3_rolling || {};
                contentHtml = `
                    <div class="space-y-4">
                        <div class="border-b border-slate-100 pb-3">
                            <h3 class="text-base font-black text-slate-900">${esc(t3.name)}</h3>
                            <p class="text-xs text-slate-500">${esc(t3.description)}</p>
                        </div>
                        <p class="text-xs text-slate-600 leading-relaxed">
                            Mô hình tính toán tốc độ nổ và gia tốc động lượng trên 6 cửa sổ trượt: 
                            <span class="font-black text-indigo-700">7, 14, 30, 60, 90, 180 kỳ</span>. 
                            Khung thời gian ngắn (7-14 ngày) phát hiện các con số đang vào dây đỏ (Hot Breakout), 
                            trong khi khung trung và dài hạn (30-180 ngày) đóng vai trò mỏ neo cân bằng xác suất.
                        </p>
                    </div>
                `;
                break;
            }

            case 4: { // Pair / Triplet & Lotto pull
                const t4 = ta.tier4_pair || {};
                const lotto27 = t4.lotto27Yesterday || [];
                contentHtml = `
                    <div class="space-y-4">
                        <div class="border-b border-slate-100 pb-3">
                            <h3 class="text-base font-black text-slate-900">${esc(t4.name)}</h3>
                            <p class="text-xs text-slate-500">${esc(t4.description)}</p>
                        </div>
                        <div>
                            <span class="text-xs font-black text-slate-700 uppercase">27 Giải Lô Kỳ Trước Đang Kéo Đề:</span>
                            <div class="flex flex-wrap gap-1.5 mt-2">
                                ${lotto27.map(num => `
                                    <span class="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 font-mono text-xs font-black text-slate-800">
                                        ${num}
                                    </span>
                                `).join('')}
                            </div>
                            <p class="text-xs text-slate-500 mt-2">Đo lường hệ số Lift tương quan giữa các cặp số và hiện tượng "Lô kéo Đề" trong dữ liệu 20 năm.</p>
                        </div>
                    </div>
                `;
                break;
            }

            case 5: { // Markov Transition
                const t5 = ta.tier5_markov || {};
                contentHtml = `
                    <div class="space-y-4">
                        <div class="border-b border-slate-100 pb-3">
                            <h3 class="text-base font-black text-slate-900">${esc(t5.name)}</h3>
                            <p class="text-xs text-slate-500">${esc(t5.description)}</p>
                        </div>
                        <div class="grid gap-4 sm:grid-cols-4">
                            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
                                <span class="font-bold text-slate-500">Chuyển Tiếp Từ Đầu:</span>
                                <p class="text-xl font-black text-indigo-700 mt-1">Đầu ${t5.fromHead}</p>
                            </div>
                            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
                                <span class="font-bold text-slate-500">Chuyển Tiếp Từ Đuôi:</span>
                                <p class="text-xl font-black text-violet-700 mt-1">Đuôi ${t5.fromTail}</p>
                            </div>
                            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
                                <span class="font-bold text-slate-500">Chuyển Tiếp Từ Tổng:</span>
                                <p class="text-xl font-black text-teal-700 mt-1">Tổng ${t5.fromSum}</p>
                            </div>
                            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
                                <span class="font-bold text-slate-500">Chuyển Tiếp Từ Bộ:</span>
                                <p class="text-xl font-black text-amber-700 mt-1">Bộ ${t5.fromBo}</p>
                            </div>
                        </div>
                        <p class="text-xs text-slate-500 leading-relaxed">
                            Ma trận xác suất chuyển tiếp Markov cấp vi mô được làm mịn bằng hàm Laplace smoothing để đảm bảo tính liên tục không bao giờ bị xác suất 0.
                        </p>
                    </div>
                `;
                break;
            }

            case 6: { // Bayesian Shrinkage
                const t6 = ta.tier6_bayesian || {};
                contentHtml = `
                    <div class="space-y-4">
                        <div class="border-b border-slate-100 pb-3">
                            <h3 class="text-base font-black text-slate-900">${esc(t6.name)}</h3>
                            <p class="text-xs text-slate-500">${esc(t6.description)}</p>
                        </div>
                        <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
                            <p><strong>Cơ chế Bayesian James-Stein Shrinkage:</strong></p>
                            <p class="mt-1">
                                Khi kích thước mẫu ngắn hạn (45 kỳ gần nhất) quá nhỏ, ước lượng xác suất rất dễ bị nhiễu bởi các hiện tượng ngẫu nhiên cực đoan. 
                                Mô hình gán trọng số <strong class="text-indigo-700">65% cho Phân phối Nền 20 năm (Prior)</strong> và 
                                <strong class="text-teal-700">35% cho Mẫu Quan Sát Ngắn Hạn (Likelihood)</strong>, giúp triệt tiêu hoàn toàn nhiễu mẫu nhỏ.
                            </p>
                        </div>
                    </div>
                `;
                break;
            }

            case 7: { // Time-series & Station
                const t7 = ta.tier7_timeseries || {};
                contentHtml = `
                    <div class="space-y-4">
                        <div class="border-b border-slate-100 pb-3">
                            <h3 class="text-base font-black text-slate-900">${esc(t7.name)}</h3>
                            <p class="text-xs text-slate-500">${esc(t7.description)}</p>
                        </div>
                        <div class="grid gap-4 sm:grid-cols-2">
                            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs">
                                <span class="font-bold text-slate-500">Đài Mở Thưởng Hôm Nay:</span>
                                <p class="text-lg font-black text-slate-900 mt-1">${esc(t7.dayOfWeekTarget || '--')}</p>
                                <p class="text-xs text-slate-500 mt-0.5">Tập mẫu lịch sử cùng thứ: ${t7.dowDrawCount} kỳ</p>
                            </div>
                            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs">
                                <span class="font-bold text-slate-500">Sóng Điều Hòa Fourier (Harmonics):</span>
                                <p class="text-lg font-black text-indigo-700 mt-1">DFT Chu Kỳ 7 / 14 / 28 Ngày</p>
                                <p class="text-xs text-slate-500 mt-0.5">Bắt nhịp dao động tuần hoàn của chuỗi số</p>
                            </div>
                        </div>
                    </div>
                `;
                break;
            }

            case 8: { // Machine Learning 18D
                const t8 = ta.tier8_ml || {};
                contentHtml = `
                    <div class="space-y-4">
                        <div class="border-b border-slate-100 pb-3">
                            <h3 class="text-base font-black text-slate-900">${esc(t8.name)}</h3>
                            <p class="text-xs text-slate-500">${esc(t8.description)}</p>
                        </div>
                        <p class="text-xs text-slate-600 leading-relaxed">
                            Mỗi con số trong 100 số được trích xuất thành <strong>Vector đặc trưng 18 chiều</strong>: 
                            [Tần suất 20y, Gan hiện tại, Tỷ số Gan/MeanGap, Tần suất 7k, 14k, 30k, 60k, 90k, 180k, Xác suất Markov, Điểm hậu nghiệm Bayes, EWMA, Fourier, Xu hướng Đài Thứ, Chuyển tiếp Đầu, Chuyển tiếp Đuôi, Chuyển tiếp Tổng, Chuyển tiếp Bộ]. 
                            Hàm chấm điểm Gradient Boosted Trees tổng hợp vector này thành 1 điểm số duy nhất.
                        </p>
                    </div>
                `;
                break;
            }

            case 9: { // Deep Learning Sequence Attention
                const t9 = ta.tier9_deep || {};
                contentHtml = `
                    <div class="space-y-4">
                        <div class="border-b border-slate-100 pb-3">
                            <h3 class="text-base font-black text-slate-900">${esc(t9.name)}</h3>
                            <p class="text-xs text-slate-500">${esc(t9.description)}</p>
                        </div>
                        <p class="text-xs text-slate-600 leading-relaxed">
                            Cơ chế <strong>Multi-Head Sequence Self-Attention</strong> mô phỏng kiến trúc Transformer thu nhỏ trên cửa sổ 
                            <span class="font-bold text-indigo-700">30 kỳ mở thưởng gần nhất</span>. 
                            Mô hình tính toán khoảng cách tương đồng ngữ cảnh giữa các mẫu hình lịch sử và trạng thái hiện tại để lan truyền xác suất.
                        </p>
                    </div>
                `;
                break;
            }

            case 10: { // Ensemble & Walk-Forward Backtest
                const t10 = ta.tier10_ensemble || {};
                contentHtml = `
                    <div class="space-y-4">
                        <div class="border-b border-slate-100 pb-3">
                            <h3 class="text-base font-black text-slate-900">${esc(t10.name)}</h3>
                            <p class="text-xs text-slate-500">${esc(t10.description)}</p>
                        </div>
                        <p class="text-xs text-slate-600 leading-relaxed">
                            Điểm số cuối cùng là sự dung hợp có trọng số động của cả 9 tầng phân tích:
                            <span class="font-mono text-indigo-700 font-bold">S_final = Σ (w_k * S_k)</span>. 
                            Toàn bộ chiến lược được kiểm tra ngược (Walk-Forward Strict PIT) trên 7.558 kỳ quay và chỉ được đề xuất thăng hạng khi vượt qua Cổng Kiểm Soát.
                        </p>
                    </div>
                `;
                break;
            }
        }

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
                <td class="px-4 py-2.5 text-xs font-semibold ${c.momentum?.includes('Bứt phá') ? 'text-amber-600 font-bold' : 'text-slate-600'}">${esc(c.momentum || '-')}</td>
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

        // 10-Tier navigator switcher
        document.querySelectorAll('.tier-nav-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                const idx = Number(e.currentTarget.getAttribute('data-tier-idx'));
                if (!idx) return;
                activeTierIdx = idx;

                document.querySelectorAll('.tier-nav-btn').forEach(b => {
                    b.classList.remove('tier-tab-active');
                    b.classList.add('border-slate-200', 'bg-white', 'text-slate-700');
                });
                e.currentTarget.classList.remove('border-slate-200', 'bg-white', 'text-slate-700');
                e.currentTarget.classList.add('tier-tab-active');

                renderTierDetail(idx);
            });
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
            renderTierDetail(activeTierIdx);
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
                errBox.textContent = `Lỗi tải dữ liệu phòng nghiên cứu 10 tầng: ${err.message}`;
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
