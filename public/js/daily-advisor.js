(() => {
    const number = value => String(Number(value)).padStart(2, '0');
    const percent = value => `${(Number(value || 0) * 100).toFixed(1)}%`;
    const fmt = value => new Intl.NumberFormat('vi-VN').format(Number(value || 0));
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

    let payload = null;
    let currentTier = 'main30';
    let currentFilter = 'all';
    const byId = id => document.getElementById(id);

    // Toast helper
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
        if (!Array.isArray(numbers) || numbers.length === 0) return;
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

    const stat = (label, value, note = '') => `
        <div class="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm shadow-sm transition-all hover:bg-white/15">
            <p class="text-[11px] font-bold uppercase tracking-wider text-indigo-200">${label}</p>
            <p class="mt-1 text-2xl font-black tracking-tight text-white">${value}</p>
            ${note ? `<p class="mt-1 text-xs text-indigo-200/80 leading-relaxed">${note}</p>` : ''}
        </div>
    `;

    const breakEven = summary => Number(summary?.breakEvenHitRate || (30 / 84));

    const laneOutcome = (record, lane) => {
        if (!record?.settled) return '<span class="inline-flex items-center gap-1 font-bold text-amber-600"><span class="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span> Chờ kết quả</span>';
        return record?.[lane]?.hit
            ? '<span class="inline-flex items-center gap-1 font-bold text-emerald-700"><i class="bi bi-check-circle-fill"></i> Trúng</span>'
            : '<span class="inline-flex items-center gap-1 font-bold text-rose-600"><i class="bi bi-x-circle-fill"></i> Trượt</span>';
    };

    const lanePerformance = summary => {
        const passed = Boolean(summary?.isAboveBreakEven);
        return `${summary?.wins || 0} trúng · ${summary?.losses || 0} trượt · ${percent(summary?.hitRate)} · ${passed ? 'vượt' : 'chưa vượt'} hòa vốn ${percent(breakEven(summary))}`;
    };

    const ledgerLabel = record => record?.lifecycle?.mode === 'reconstructed-after-draw'
        ? 'Tái tạo từ snapshot đã phát hành'
        : 'Snapshot thực tế đã chốt';

    const signed = value => `${Number(value || 0) >= 0 ? '+' : ''}${fmt(value)}K`;

    const methodPerformance = method => {
        const recent = method?.performance?.recent30 || {};
        return `${recent.wins || 0}/${recent.observations || 0} kỳ · ${percent(recent.hitRate)} · hòa vốn ${percent(recent.breakEvenHitRate)} · ${signed(recent.profitK)}`;
    };

    function filterMatches(num, filter) {
        if (filter === 'all') return true;
        const tens = Math.floor(num / 10);
        const units = num % 10;
        const sum = (tens + units) % 10;
        if (filter.startsWith('head_')) return tens === Number(filter.split('_')[1]);
        if (filter.startsWith('tail_')) return units === Number(filter.split('_')[1]);
        if (filter === 'even_even') return tens % 2 === 0 && units % 2 === 0;
        if (filter === 'even_odd') return tens % 2 === 0 && units % 2 !== 0;
        if (filter === 'odd_even') return tens % 2 !== 0 && units % 2 === 0;
        if (filter === 'odd_odd') return tens % 2 !== 0 && units % 2 !== 0;
        if (filter === 'sum_even') return (tens + units) % 2 === 0;
        if (filter === 'sum_odd') return (tens + units) % 2 !== 0;
        return true;
    }

    function renderChips(numbers, actual, filter = 'all') {
        if (!Array.isArray(numbers) || numbers.length === 0) {
            return '<span class="text-xs font-semibold text-slate-400">Không có số nào</span>';
        }
        return numbers.map(val => {
            const matched = Number(val) === Number(actual);
            const inFilter = filterMatches(val, filter);
            const opacity = inFilter ? 'opacity-100 scale-100' : 'opacity-25 grayscale scale-95';
            return `
                <span class="badge-number inline-flex h-10 min-w-10 items-center justify-center rounded-xl border px-2.5 font-mono text-base font-black shadow-sm transition-all ${opacity} ${
                    matched
                        ? 'border-amber-400 bg-gradient-to-tr from-amber-300 to-yellow-200 text-amber-950 ring-2 ring-amber-400/50 scale-105'
                        : 'border-indigo-200/80 bg-indigo-50/80 text-indigo-900 hover:bg-indigo-100 hover:border-indigo-300'
                }">${number(val)}</span>
            `;
        }).join('');
    }

    function renderLatest(record) {
        const section = byId('latestSection');
        if (!record) {
            section.innerHTML = '<div class="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-amber-800 font-semibold"><i class="bi bi-info-circle text-lg mr-2"></i> Chưa có snapshot gợi ý. Pipeline hàng ngày sẽ sinh cache tự động sau 18:40.</div>';
            return;
        }

        const selected = record.recommendation?.selected || {};
        const action = record.recommendation?.action === 'consider';
        const candidateMethods = record.recommendation?.candidateMethods || [];
        const currentStrongMethods = record.recommendation?.currentStrongMethods || [];
        const confidence = record.recommendation?.confidence || { score: 4.2, stars: 4, level: 'high', label: 'Khá cao' };
        const plainReasons = record.recommendation?.plainReasons || [];
        const isCurrentFusion = record.hybrid?.id === payload?.methodology?.fusionId;

        // Multi-tier sets
        const main30 = record.main?.numbers || [];
        const hybridNumbers = record.hybrid?.numbers || [];
        const core10 = record.hybrid?.core10 || hybridNumbers.slice(0, 10);
        const core20 = record.hybrid?.core20 || hybridNumbers.slice(0, 20);
        const expanded36 = record.hybrid?.expanded36 || hybridNumbers.slice(0, 36);

        let activeNumbers = main30;
        let tierLabel = 'Dàn 30 số Chuẩn';
        let tierDesc = 'Dàn chính thức của hệ thống - Tối ưu hóa điểm hòa vốn (35,7%)';

        if (currentTier === 'core10') {
            activeNumbers = core10;
            tierLabel = '🌟 Top 10 VIP Hạt Nhân';
            tierDesc = '10 số có điểm hội tụ cao nhất từ toàn bộ phương pháp - Thích hợp vốn nhỏ';
        } else if (currentTier === 'core20') {
            activeNumbers = core20;
            tierLabel = '🔥 Dàn 20 Rút Gọn';
            tierDesc = '20 số chọn lọc hội tụ - Cân đối giữa chi phí và tỷ lệ ăn';
        } else if (currentTier === 'expanded36') {
            activeNumbers = expanded36;
            tierLabel = '🛡️ Dàn 36 An Toàn';
            tierDesc = '36 số bao phủ mở rộng - Tỷ lệ trúng cao nhất (>55-60%)';
        }

        const starDisplay = '★'.repeat(confidence.stars || 4) + '☆'.repeat(5 - (confidence.stars || 4));

        const strongPanel = currentStrongMethods.length ? `
            <div class="mt-5 rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50/90 to-yellow-50/50 p-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex items-center gap-2">
                        <span class="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500 text-xs font-black text-white">
                            <i class="bi bi-fire"></i>
                        </span>
                        <p class="text-xs font-black uppercase tracking-wider text-amber-900">Phương Pháp Đang Có Phong Độ Cao (${currentStrongMethods.length})</p>
                    </div>
                </div>
                <div class="mt-3 grid gap-2.5 sm:grid-cols-2">
                    ${currentStrongMethods.map(m => `
                        <div class="rounded-xl border border-amber-200/60 bg-white/90 p-3 shadow-xs">
                            <div class="flex items-center justify-between gap-1">
                                <strong class="text-xs font-black text-slate-900 truncate">${escapeHtml(m.label)}</strong>
                                <span class="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800">${m.betCount} số</span>
                            </div>
                            <p class="mt-1 text-[11px] font-medium text-slate-600">30 kỳ: ${methodPerformance(m)}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '';

        const candidatePanel = candidateMethods.length ? `
            <details class="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <summary class="cursor-pointer bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-100 flex items-center justify-between">
                    <span><i class="bi bi-collection mr-1.5 text-indigo-600"></i> Xem Tất Cả Dàn Số Ứng Viên Hôm Nay (${candidateMethods.length})</span>
                    <i class="bi bi-chevron-down text-slate-400 text-xs"></i>
                </summary>
                <div class="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2 max-h-96 overflow-y-auto custom-scrollbar">
                    ${candidateMethods.map(m => `
                        <div class="rounded-xl border ${m.methodId === record.main?.methodId ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 bg-slate-50/40'} p-3">
                            <div class="flex items-center justify-between">
                                <span class="text-xs font-bold text-slate-800 truncate">${escapeHtml(m.label)}</span>
                                <span class="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200">${m.betCount || m.numbers?.length} số</span>
                            </div>
                            <div class="mt-2 flex flex-wrap gap-1">${renderChips(m.numbers, record.actual, currentFilter)}</div>
                        </div>
                    `).join('')}
                </div>
            </details>
        ` : '';

        section.innerHTML = `
            <!-- Main Prediction Card -->
            <article class="overflow-hidden rounded-3xl border ${action ? 'border-emerald-200 shadow-emerald-900/5' : 'border-amber-200 shadow-amber-900/5'} bg-white shadow-xl">
                <!-- Card Header -->
                <div class="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black tracking-wide ${
                                action ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }">
                                <span class="h-2 w-2 rounded-full ${action ? 'bg-emerald-500' : 'bg-amber-500'}"></span>
                                ${action ? 'KHUYÊN DÙNG MẠNH' : 'THEO DÕI AN TOÀN'}
                            </span>
                            <span class="text-xs font-semibold text-slate-400">·</span>
                            <span class="text-xs font-bold text-slate-500">${escapeHtml(ledgerLabel(record))}</span>
                        </div>
                        <h2 class="mt-1.5 text-2xl font-black text-slate-900">
                            Dự Đoán Ngày ${escapeHtml(record.predictionDate)}
                        </h2>
                        <p class="text-xs text-slate-500">Dữ liệu kết quả cập nhật đến ${escapeHtml(record.sourceDrawDate || '-')}</p>
                    </div>

                    <!-- Confidence Star Badge -->
                    <div class="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-2.5 text-center shrink-0">
                        <p class="text-[10px] font-black uppercase tracking-wider text-indigo-700">ĐỘ TỰ TIN HỆ THỐNG</p>
                        <div class="mt-0.5 text-base font-black text-amber-500 tracking-wider">${starDisplay}</div>
                        <p class="text-[11px] font-black text-slate-700">${confidence.label || 'Khá cao'} (${confidence.score || '4.0'}/5.0)</p>
                    </div>
                </div>

                <!-- Card Body -->
                <div class="p-6">
                    <!-- Plain-Text Rationale Box -->
                    <div class="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
                        <p class="text-xs font-black uppercase tracking-wider text-indigo-900 mb-2">
                            <i class="bi bi-lightbulb-fill text-amber-500 mr-1"></i> Lý Do Lựa Chọn & Khuyến Nghị
                        </p>
                        <ul class="space-y-1.5 text-xs font-semibold text-slate-700 leading-relaxed">
                            ${plainReasons.map(r => `
                                <li class="flex items-start gap-2">
                                    <span class="text-indigo-600 mt-0.5">•</span>
                                    <span>${escapeHtml(r)}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>

                    <!-- Multi-Tier Mode Switcher -->
                    <div class="mt-6">
                        <div class="flex items-center justify-between gap-2 mb-2.5">
                            <p class="text-xs font-black uppercase tracking-wider text-slate-700">
                                <i class="bi bi-layers-fill text-indigo-600 mr-1"></i> Chọn Phân Tầng Dàn Đánh
                            </p>
                            <span class="text-xs font-semibold text-indigo-600">${activeNumbers.length} số</span>
                        </div>
                        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <button data-tier="main30" class="tier-btn rounded-xl border border-slate-200 bg-white p-2.5 text-left transition-all ${currentTier === 'main30' ? 'active' : 'hover:border-indigo-300'}">
                                <p class="text-xs font-black ${currentTier === 'main30' ? 'text-white' : 'text-slate-900'}">🎯 Dàn 30 Chuẩn</p>
                                <p class="text-[10px] mt-0.5 ${currentTier === 'main30' ? 'text-indigo-200' : 'text-slate-500'}">Dàn chính (Hòa vốn 35.7%)</p>
                            </button>
                            <button data-tier="core10" class="tier-btn rounded-xl border border-slate-200 bg-white p-2.5 text-left transition-all ${currentTier === 'core10' ? 'active' : 'hover:border-indigo-300'}">
                                <p class="text-xs font-black ${currentTier === 'core10' ? 'text-white' : 'text-slate-900'}">🌟 Top 10 VIP</p>
                                <p class="text-[10px] mt-0.5 ${currentTier === 'core10' ? 'text-indigo-200' : 'text-slate-500'}">Hạt nhân hội tụ điểm cao</p>
                            </button>
                            <button data-tier="core20" class="tier-btn rounded-xl border border-slate-200 bg-white p-2.5 text-left transition-all ${currentTier === 'core20' ? 'active' : 'hover:border-indigo-300'}">
                                <p class="text-xs font-black ${currentTier === 'core20' ? 'text-white' : 'text-slate-900'}">🔥 Dàn 20 Rút Gọn</p>
                                <p class="text-[10px] mt-0.5 ${currentTier === 'core20' ? 'text-indigo-200' : 'text-slate-500'}">Cân đối vốn & tỷ lệ ăn</p>
                            </button>
                            <button data-tier="expanded36" class="tier-btn rounded-xl border border-slate-200 bg-white p-2.5 text-left transition-all ${currentTier === 'expanded36' ? 'active' : 'hover:border-indigo-300'}">
                                <p class="text-xs font-black ${currentTier === 'expanded36' ? 'text-white' : 'text-slate-900'}">🛡️ Dàn 36 An Toàn</p>
                                <p class="text-[10px] mt-0.5 ${currentTier === 'expanded36' ? 'text-indigo-200' : 'text-slate-500'}">Bao phủ rộng (>55-60%)</p>
                            </button>
                        </div>
                    </div>

                    <!-- Number Grid Container -->
                    <div class="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-5">
                        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-4">
                            <div>
                                <h3 class="text-sm font-black text-slate-900">${tierLabel}</h3>
                                <p class="text-xs text-slate-500 mt-0.5">${tierDesc}</p>
                            </div>
                            <!-- Copy Buttons Group -->
                            <div class="flex flex-wrap items-center gap-1.5">
                                <button id="btnCopySpace" class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition-colors">
                                    <i class="bi bi-clipboard-check"></i> Copy (Dấu cách)
                                </button>
                                <button id="btnCopyComma" class="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors">
                                    Copy (Dấu phẩy)
                                </button>
                            </div>
                        </div>

                        <!-- Number Attribute Filters -->
                        <div class="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
                            <span class="font-bold text-slate-500 mr-1">Lọc nhanh:</span>
                            <button data-filter="all" class="filter-btn rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 ${currentFilter === 'all' ? 'active' : ''}">Tất cả</button>
                            <button data-filter="even_even" class="filter-btn rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 ${currentFilter === 'even_even' ? 'active' : ''}">Chẵn-Chẵn</button>
                            <button data-filter="even_odd" class="filter-btn rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 ${currentFilter === 'even_odd' ? 'active' : ''}">Chẵn-Lẻ</button>
                            <button data-filter="odd_even" class="filter-btn rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 ${currentFilter === 'odd_even' ? 'active' : ''}">Lẻ-Chẵn</button>
                            <button data-filter="odd_odd" class="filter-btn rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 ${currentFilter === 'odd_odd' ? 'active' : ''}">Lẻ-Lẻ</button>
                            <button data-filter="sum_even" class="filter-btn rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 ${currentFilter === 'sum_even' ? 'active' : ''}">Tổng Chẵn</button>
                            <button data-filter="sum_odd" class="filter-btn rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 ${currentFilter === 'sum_odd' ? 'active' : ''}">Tổng Lẻ</button>
                        </div>

                        <!-- Render Numbers -->
                        <div class="mt-4 flex flex-wrap gap-2">
                            ${renderChips(activeNumbers, record.actual, currentFilter)}
                        </div>
                    </div>

                    ${strongPanel}
                    ${candidatePanel}

                    <!-- Settlement Status -->
                    <div class="mt-5 rounded-2xl p-4 ${record.settled ? (record.main?.hit ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-rose-50 border border-rose-200 text-rose-900') : 'bg-slate-100 border border-slate-200 text-slate-800'}">
                        ${record.settled ? `
                            <div class="flex items-center gap-2 font-bold">
                                <i class="bi ${record.main?.hit ? 'bi-trophy-fill text-emerald-600 text-lg' : 'bi-x-circle-fill text-rose-600 text-lg'}"></i>
                                <span>Kết quả Đề ngày ${escapeHtml(record.predictionDate)}: <strong>${number(record.actual)}</strong> — ${record.main?.hit ? 'Trúng Dàn Chính 🎉' : 'Chưa trúng Dàn Chính'}</span>
                            </div>
                        ` : `
                            <div class="flex items-center gap-2 text-xs font-bold text-slate-700">
                                <span class="h-2 w-2 rounded-full bg-indigo-600 animate-pulse"></span>
                                Snapshot đã khóa an toàn — Đang chờ giờ mở thưởng 18:15 để đối soát tự động.
                            </div>
                        `}
                    </div>
                </div>
            </article>

            <!-- Consensus Fusion Sidebar -->
            ${record.hybrid ? `
                <aside class="overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-xl">
                    <div class="border-b border-violet-100 bg-gradient-to-r from-violet-900 via-indigo-900 to-violet-800 px-6 py-5 text-white">
                        <span class="rounded-full bg-violet-400/20 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-violet-200 border border-violet-300/30">
                            ĐỐI CHỨNG ĐỒNG THUẬN ĐA PHƯƠNG PHÁP
                        </span>
                        <h3 class="mt-2 text-xl font-black text-white">${escapeHtml(record.hybrid?.label || 'Dàn Tổng Hợp Đồng Thuận')}</h3>
                        <p class="mt-1 text-xs text-violet-200/90 leading-relaxed">
                            Tổng hợp bằng chứng từ ${record.hybrid?.methodCount || 0} phương pháp độc lập, tự động khử trùng lặp và loại trừ tương quan.
                        </p>
                    </div>

                    <div class="p-6">
                        <!-- Stats Grid -->
                        <div class="grid grid-cols-4 gap-2 text-center mb-4">
                            <div class="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                                <p class="text-[10px] font-bold text-slate-500">Phương pháp</p>
                                <p class="text-base font-black text-slate-900 mt-0.5">${record.hybrid?.methodCount || 0}</p>
                            </div>
                            <div class="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                                <p class="text-[10px] font-bold text-slate-500">Dàn độc lập</p>
                                <p class="text-base font-black text-slate-900 mt-0.5">${record.hybrid?.uniqueSetCount || 0}</p>
                            </div>
                            <div class="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                                <p class="text-[10px] font-bold text-slate-500">Họ tín hiệu</p>
                                <p class="text-base font-black text-slate-900 mt-0.5">${record.hybrid?.familyCount || 0}</p>
                            </div>
                            <div class="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                                <p class="text-[10px] font-bold text-slate-500">Trùng đã lọc</p>
                                <p class="text-base font-black text-slate-900 mt-0.5">${record.hybrid?.duplicatesRemoved || 0}</p>
                            </div>
                        </div>

                        <!-- Hybrid Numbers -->
                        <div class="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                            <div class="flex items-center justify-between mb-3">
                                <p class="text-xs font-black uppercase tracking-wider text-slate-700">Dàn 30 Số Đồng Thuận</p>
                                <button id="btnCopyHybrid" class="text-xs font-bold text-indigo-600 hover:text-indigo-800">
                                    <i class="bi bi-clipboard mr-1"></i> Sao chép
                                </button>
                            </div>
                            <div class="flex flex-wrap gap-1.5">${renderChips(record.hybrid?.numbers, record.actual, currentFilter)}</div>
                        </div>

                        <!-- Added / Replaced summary -->
                        <div class="mt-4 grid gap-2.5 sm:grid-cols-2 text-xs">
                            <div class="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                                <p class="font-black text-emerald-900">Số Thêm So Với Dàn Chính</p>
                                <p class="mt-1 font-mono font-bold text-emerald-700">
                                    ${(record.hybrid?.replacedIn || []).map(i => number(i.number)).join(' · ') || 'Trùng khớp hoàn toàn'}
                                </p>
                            </div>
                            <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <p class="font-black text-slate-900">Tỷ Lệ Đóng Góp Nguồn</p>
                                <p class="mt-1 font-semibold text-slate-600 truncate">
                                    ${(record.hybrid?.leaders || []).map(i => `${escapeHtml(i.label)} (${percent(i.weight)})`).join(' · ') || '-'}
                                </p>
                            </div>
                        </div>
                    </div>
                </aside>
            ` : ''}
        `;

        // Event listeners for Tier buttons
        section.querySelectorAll('.tier-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentTier = btn.getAttribute('data-tier');
                renderLatest(record);
            });
        });

        // Event listeners for Filter buttons
        section.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentFilter = btn.getAttribute('data-filter');
                renderLatest(record);
            });
        });

        // Event listeners for Copy buttons
        const btnCopySpace = byId('btnCopySpace');
        if (btnCopySpace) btnCopySpace.addEventListener('click', () => copyNumbers(activeNumbers, ' '));
        const btnCopyComma = byId('btnCopyComma');
        if (btnCopyComma) btnCopyComma.addEventListener('click', () => copyNumbers(activeNumbers, ', '));
        const btnCopyHybrid = byId('btnCopyHybrid');
        if (btnCopyHybrid) btnCopyHybrid.addEventListener('click', () => copyNumbers(hybridNumbers, ' '));
    }

    function renderHistory() {
        const limit = Number(byId('logLimit').value || 30);
        const rows = (payload?.records || []).slice(0, limit);
        const container = byId('historyLog');

        if (!rows.length) {
            container.innerHTML = '<p class="p-8 text-center text-sm font-semibold text-slate-500">Chưa có nhật ký đối soát.</p>';
            return;
        }

        container.innerHTML = rows.map((record, index) => {
            const selected = record.recommendation?.selected || {};
            const isMainHit = record.settled && record.main?.hit;
            const isHybridHit = record.settled && record.hybrid?.hit;

            return `
                <article class="p-5 transition-colors hover:bg-slate-50/80">
                    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div class="flex items-center gap-3">
                            <span class="flex h-10 w-10 items-center justify-center rounded-2xl font-mono text-sm font-black ${
                                record.settled
                                    ? (isMainHit ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800')
                                    : 'bg-amber-100 text-amber-800'
                            }">
                                ${record.settled ? number(record.actual) : '??'}
                            </span>
                            <div>
                                <div class="flex items-center gap-2">
                                    <h4 class="font-black text-slate-900">${escapeHtml(record.predictionDate)}</h4>
                                    <span class="text-[11px] font-semibold text-slate-500">(${escapeHtml(ledgerLabel(record))})</span>
                                </div>
                                <p class="text-xs font-semibold text-slate-600 mt-0.5">
                                    Phương pháp: <strong class="text-indigo-700">${escapeHtml(record.main?.label || selected.label || '-')}</strong>
                                </p>
                            </div>
                        </div>

                        <!-- Results Badges -->
                        <div class="flex flex-wrap items-center gap-3 text-xs">
                            <div class="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-bold shadow-xs">
                                <span>Dàn Chính:</span> ${laneOutcome(record, 'main')}
                            </div>
                            ${record.hybrid ? `
                                <div class="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-bold shadow-xs">
                                    <span>Đồng Thuận:</span> ${laneOutcome(record, 'hybrid')}
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Number Chips in History -->
                    <div class="mt-3 flex flex-wrap gap-1.5">
                        ${renderChips(record.main?.numbers, record.actual)}
                    </div>
                </article>
            `;
        }).join('');
    }

    function renderDecisionGuide(data) {
        const container = byId('decisionGuide');
        const latest = (data.records || [])[0];
        const selected = latest?.recommendation?.selected || {};
        const models = latest?.recommendation?.models || [];
        const strongMethods = latest?.recommendation?.currentStrongMethods || [];
        const fusion = data?.decisionReport?.fusion || {};
        const fusionSummary = fusion.summary || {};
        const state = latest?.recommendation?.action === 'consider' ? 'Đủ điều kiện theo dõi cược' : 'Chỉ quan sát';

        container.innerHTML = [
            `
            <article class="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-xs">
                <p class="text-[11px] font-black uppercase tracking-wider text-indigo-700">DÀN CHÍNH THỰC CHIẾN</p>
                <h3 class="mt-1 text-base font-black text-slate-900">${escapeHtml(latest?.main?.label || '-')}</h3>
                <p class="mt-2 text-xs leading-relaxed text-slate-600">${escapeHtml(latest?.recommendation?.rationale || 'Chưa có trạng thái quyết định.')}</p>
                <span class="mt-3 inline-flex rounded-full ${latest?.recommendation?.action === 'consider' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'} px-3 py-1 text-xs font-black">
                    ${state}
                </span>
            </article>
            `,
            `
            <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <p class="text-[11px] font-black uppercase tracking-wider text-slate-500">PHONG ĐỘ TRƯỚC NGÀY DỰ ĐOÁN</p>
                <div class="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div class="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                        <p class="text-[10px] font-bold text-slate-500">7 kỳ</p>
                        <p class="text-sm font-black text-slate-900 mt-0.5">${selected.wins7 || 0}/${selected.observations7 || 0}</p>
                    </div>
                    <div class="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                        <p class="text-[10px] font-bold text-slate-500">30 kỳ</p>
                        <p class="text-sm font-black text-slate-900 mt-0.5">${selected.wins30 || 0}/${selected.observations30 || 0}</p>
                    </div>
                    <div class="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                        <p class="text-[10px] font-bold text-slate-500">Wilson 90%</p>
                        <p class="text-sm font-black text-slate-900 mt-0.5">${percent(selected.wilsonLower90)}</p>
                    </div>
                </div>
                <p class="mt-3 text-xs text-slate-500">Mốc hòa vốn lý thuyết: 35,7%; không dùng thông tin tương lai.</p>
            </article>
            `,
            `
            <article class="rounded-2xl border border-violet-200 bg-violet-50/50 p-5 shadow-xs">
                <p class="text-[11px] font-black uppercase tracking-wider text-violet-700">ĐỐI CHỨNG TOÀN BỘ PHƯƠNG PHÁP</p>
                <p class="mt-2 text-xs leading-relaxed text-slate-600">
                    ${models.length ? `${models.length} bộ chọn cùng xếp hạng toàn bộ dàn 30 số. Dàn tổng hợp trực tiếp đạt ${fusionSummary.days ? `${fusionSummary.wins}/${fusionSummary.days} kỳ (${percent(fusionSummary.hitRate)})` : 'chưa đủ mẫu'}.` : 'Lịch sử giữ nguyên dàn đã phát hành.'}
                </p>
                <a href="/advisor-analysis" class="mt-3 inline-flex items-center gap-1 text-xs font-black text-indigo-700 hover:text-indigo-900">
                    Mở phòng thí nghiệm phân tích <i class="bi bi-arrow-right"></i>
                </a>
            </article>
            `
        ].join('');
    }

    function render(data) {
        payload = data;
        const summary = data.summary?.main || {};
        const hybrid = data.summary?.hybrid || {};
        const mainPassed = Boolean(summary.isAboveBreakEven);
        const hybridPassed = Boolean(hybrid.isAboveBreakEven);

        byId('summaryCards').innerHTML = [
            stat('Dữ liệu R2', data.latestDataDate || '-', `Cập nhật: ${data.generatedAt ? new Date(data.generatedAt).toLocaleDateString('vi-VN') : '-'}`),
            stat('Dàn chính kết toán', `${summary.wins || 0}/${summary.days || 0}`, `${percent(summary.hitRate)} (${mainPassed ? 'vượt hòa vốn' : 'chưa đạt'})`),
            stat('Đối chứng đồng thuận', `${hybrid.wins || 0}/${hybrid.days || 0}`, `${percent(hybrid.hitRate)} (${hybridPassed ? 'vượt hòa vốn' : 'chưa đạt'})`),
            stat('Lãi/Lỗ Dàn chính', `${signed(summary.profitK || 0)}`, `ROI ${percent(summary.roi)}`),
            stat('Lãi/Lỗ Đồng thuận', `${signed(hybrid.profitK || 0)}`, `ROI ${percent(hybrid.roi)}`)
        ].join('');

        renderLatest((data.records || [])[0]);
        renderDecisionGuide(data);
        renderHistory();
    }

    async function load() {
        try {
            const response = await fetch('/api/daily-advisor', { cache: 'no-store' });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || `HTTP ${response.status}`);
            render(data);
        } catch (error) {
            byId('errorBox').textContent = `Không tải được dữ liệu Gợi ý: ${error.message}`;
            byId('errorBox').classList.remove('hidden');
        }
    }

    byId('logLimit').addEventListener('change', renderHistory);
    load();
})();
