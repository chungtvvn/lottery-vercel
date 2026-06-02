// public/js/simulation-client.js

(function () {
    const state = {
        result: null,
        selected: null
    };

    const METHOD_LABELS = {
        riskHold60: 'Ôm 60 theo rủi ro',
        riskHold70: 'Ôm 70 theo rủi ro',
        riskHold80: 'Ôm 80 theo rủi ro',
        riskHold90: 'Ôm 90 theo rủi ro',
        frequencyHold60: 'Ôm 60 theo HT/Target'
    };

    function methodDescription(methodId) {
        if (methodId === 'riskHold60') return 'Sắp xếp chuỗi dự đoán theo rủi ro cao xuống thấp, lấy từ trên xuống tới khoảng 60 số ôm và đánh 40 số còn lại.';
        if (methodId === 'riskHold70') return 'Sắp xếp chuỗi dự đoán theo rủi ro cao xuống thấp, lấy từ trên xuống tới khoảng 70 số ôm và đánh 30 số còn lại.';
        if (methodId === 'riskHold80') return 'Sắp xếp chuỗi dự đoán theo rủi ro cao xuống thấp, lấy từ trên xuống tới khoảng 80 số ôm và đánh 20 số còn lại.';
        if (methodId === 'riskHold90') return 'Sắp xếp chuỗi dự đoán theo rủi ro cao xuống thấp, lấy từ trên xuống tới khoảng 90 số ôm và đánh 10 số còn lại.';
        if (methodId === 'frequencyHold60') return 'Sắp xếp chuỗi dự đoán theo HT/Target thấp lên cao, lấy từ trên xuống tới khoảng 60 số ôm và đánh 40 số còn lại.';
        return 'Tính theo danh sách loại trừ và danh sách đánh hiện tại.';
    }

    function el(id) {
        return document.getElementById(id);
    }

    function getMethodOrder(result) {
        return (result && Array.isArray(result.methods) ? result.methods : [])
            .map(method => method.id)
            .filter(Boolean);
    }

    const CATEGORY_LABELS = {
        tong_tt_chan: 'Tổng TT - Tổng Chẵn',
        tong_tt_le: 'Tổng TT - Tổng Lẻ',
        tong_moi_chan: 'Tổng Mới - Tổng Chẵn',
        tong_moi_le: 'Tổng Mới - Tổng Lẻ',
        hieu_chan: 'Hiệu Chẵn',
        hieu_le: 'Hiệu Lẻ',
        tong_tt_chan_chan: 'Tổng TT - Dạng Chẵn-Chẵn',
        tong_tt_chan_le: 'Tổng TT - Dạng Chẵn-Lẻ',
        tong_tt_le_chan: 'Tổng TT - Dạng Lẻ-Chẵn',
        tong_tt_le_le: 'Tổng TT - Dạng Lẻ-Lẻ',
        tong_moi_chan_chan: 'Tổng Mới - Dạng Chẵn-Chẵn',
        tong_moi_chan_le: 'Tổng Mới - Dạng Chẵn-Lẻ',
        tong_moi_le_chan: 'Tổng Mới - Dạng Lẻ-Chẵn',
        tong_moi_le_le: 'Tổng Mới - Dạng Lẻ-Lẻ',
        dau_chan_lon_hon_4: 'Đầu chẵn > 4',
        dau_chan_nho_hon_4: 'Đầu chẵn < 4',
        dit_chan_lon_hon_4: 'Đít chẵn > 4',
        dit_chan_nho_hon_4: 'Đít chẵn < 4',
        dau_le_lon_hon_5: 'Đầu lẻ > 5',
        dau_le_nho_hon_5: 'Đầu lẻ < 5',
        dit_le_lon_hon_5: 'Đít lẻ > 5',
        dit_le_nho_hon_5: 'Đít lẻ < 5'
    };

    function displayTitle(title, key) {
        const raw = String(title || key || '');
        const category = String(key || '').split(':')[0];
        if (CATEGORY_LABELS[category]) {
            return raw.includes(' - ')
                ? `${CATEGORY_LABELS[category]} - ${raw.split(' - ').slice(1).join(' - ')}`
                : CATEGORY_LABELS[category];
        }
        return raw.replace(/^dong_step_(\d+)_(\d+)\b/i, (_, step, start) => {
            const paddedStart = String(start).padStart(2, '0');
            return `Đồng cách ${step} từ ${paddedStart}`;
        });
    }

    function playModeLabel(mode) {
        if (mode === 'bet') return 'Chỉ đánh';
        if (mode === 'hold') return 'Chỉ ôm';
        return 'Đánh + Ôm';
    }

    function getCustomQueryParams() {
        const params = {
            playMode: el('playMode')?.value || 'both',
            customMinPriority: el('customMinPriority')?.value,
            customMinDropOffPercent: el('customMinDropOff')?.value,
            customMaxFrequencyPerYear: el('customMaxFrequency')?.value,
            customMaxPotentialFrequencyPerYear: el('customMaxPotentialFrequency')?.value,
            customMinLowerBoundPercent: el('customMinLower')?.value,
            customMinSampleSize: el('customMinSample')?.value,
            customTargetExcluded: el('customTargetExcluded')?.value,
            customRequirePositiveEdge: el('customRequireEdge')?.checked ? '1' : '0',
            customIncludeFormed: '1',
            customIncludePotential: el('customIncludePotential')?.checked ? '1' : '0',
            customIncludeHighFrequency: el('customIncludeHighFrequency')?.checked ? '1' : '0',
            customExcludeFixedThreeValueGroups: el('customExcludeFixedThreeValueGroups')?.checked ? '1' : '0'
        };
        return Object.entries(params).filter(([, value]) => value !== undefined && value !== null);
    }

    function formatPercent(value) {
        if (!Number.isFinite(value)) return '0%';
        return `${(value * 100).toFixed(1)}%`;
    }

    function formatMoney(value) {
        const number = Number(value || 0);
        const sign = number > 0 ? '+' : '';
        return `${sign}${number.toLocaleString('vi-VN')}K`;
    }

    function formatMoneyPlain(value) {
        return `${Number(value || 0).toLocaleString('vi-VN')}K`;
    }

    function formatNumberValue(value, suffix = '') {
        if (value === null || value === undefined || !Number.isFinite(Number(value))) return '-';
        return `${Number(value).toLocaleString('vi-VN')}${suffix}`;
    }

    function formatNumbers(numbers, limit) {
        const values = (numbers || []).map(num => String(num).padStart(2, '0'));
        if (!limit || values.length <= limit) return values.join(' ');
        return `${values.slice(0, limit).join(' ')} +${values.length - limit}`;
    }

    function setLoading(isLoading) {
        const button = el('runSimulation');
        const spinner = el('runSpinner');
        const label = el('runLabel');
        if (!button || !spinner || !label) return;
        button.disabled = isLoading;
        button.classList.toggle('opacity-70', isLoading);
        spinner.classList.toggle('hidden', !isLoading);
        label.textContent = isLoading ? 'Đang chạy...' : 'Chạy simulation';
    }

    function showError(message) {
        const box = el('errorBox');
        if (!box) return;
        if (!message) {
            box.classList.add('hidden');
            box.textContent = '';
            return;
        }
        box.textContent = message;
        box.classList.remove('hidden');
    }

    function methodStatusClass(method) {
        if (method.skipped) return 'bg-slate-100 text-slate-600 border-slate-200';
        if ((method.profit || 0) > 0) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        return 'bg-red-50 text-red-700 border-red-200';
    }

    function methodStatusText(method) {
        if (method.skipped) return 'Bỏ qua';
        return (method.profit || 0) > 0 ? 'Lãi' : 'Lỗ';
    }

    function renderSummaryCard(methodMeta, summary) {
        const profitClass = summary.totalProfit >= 0 ? 'text-emerald-700' : 'text-red-700';
        return `
            <article class="rounded-md border border-slate-200 bg-white p-5">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <h3 class="text-base font-bold text-slate-900">${methodMeta.name}</h3>
                        <p class="mt-1 text-xs leading-5 text-slate-500">
                            ${methodDescription(methodMeta.id)}
                        </p>
                    </div>
                    <div class="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                        ${summary.playedDays}/${summary.totalDays} ngày đánh
                    </div>
                </div>
                <div class="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div>
                        <div class="text-xs uppercase text-slate-500">Tỉ lệ lãi</div>
                        <div class="mt-1 text-xl font-bold">${formatPercent(summary.hitRate)}</div>
                    </div>
                    <div>
                        <div class="text-xs uppercase text-slate-500">Lãi / Lỗ</div>
                        <div class="mt-1 text-xl font-bold">${summary.wins}/${summary.losses}</div>
                    </div>
                    <div>
                        <div class="text-xs uppercase text-slate-500">Loại trừ TB</div>
                        <div class="mt-1 text-xl font-bold">${summary.averageExcluded}</div>
                    </div>
                    <div>
                        <div class="text-xs uppercase text-slate-500">Lãi/lỗ</div>
                        <div class="mt-1 text-xl font-bold ${profitClass}">${formatMoney(summary.totalProfit)}</div>
                    </div>
                </div>
                <div class="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-600">
                    <div class="rounded-md bg-slate-50 px-3 py-2">Bỏ qua: <b>${summary.skippedDays}</b></div>
                    <div class="rounded-md bg-slate-50 px-3 py-2">Lãi đánh: <b>${formatMoney(summary.totalBetProfit ?? 0)}</b></div>
                    <div class="rounded-md bg-slate-50 px-3 py-2">Lãi ôm: <b>${formatMoney(summary.totalHoldProfit ?? 0)}</b></div>
                </div>
            </article>
        `;
    }

    function renderSummary(result) {
        const section = el('summarySection');
        const cards = el('summaryCards');
        const generated = el('generatedInfo');
        if (!section || !cards) return;

        cards.innerHTML = result.methods
            .map(method => renderSummaryCard(method, result.summary[method.id]))
            .join('');
        if (generated) {
            generated.textContent = `${result.config.effectiveDays} ngày, ${playModeLabel(result.config.playMode)}, đơn vị ${result.config.moneyUnit}`;
        }
        section.classList.remove('hidden');
    }

    function renderNextMethodCard(methodMeta, method) {
        const mode = method.playMode || 'both';
        const primaryNumbers = mode === 'hold' ? method.excluded : method.betNumbers;
        const primaryLabel = mode === 'hold' ? 'Số sẽ ôm' : 'Số sẽ đánh';
        const numberClass = mode === 'hold'
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700';
        const numbersHtml = primaryNumbers && primaryNumbers.length > 0
            ? primaryNumbers.map(num => `
                <span class="rounded border px-2 py-1 text-center font-mono text-xs font-semibold ${numberClass}">
                    ${String(num).padStart(2, '0')}
                </span>
            `).join('')
            : '<span class="text-sm text-slate-500">Không có số.</span>';

        return `
            <article class="rounded-md border border-slate-200 bg-white p-4">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <h3 class="font-bold text-slate-900">${methodMeta.name || METHOD_LABELS[method.id] || method.name}</h3>
                        <p class="mt-1 text-xs leading-5 text-slate-500">${method.description || methodDescription(method.id)}</p>
                    </div>
                    <div class="whitespace-nowrap rounded-md ${method.skipped ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'} px-2 py-1 text-xs font-bold">
                        ${method.skipped ? 'Bỏ qua' : playModeLabel(mode)}
                    </div>
                </div>
                <div class="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
                    <div class="rounded-md bg-slate-50 px-3 py-2">Loại: <b>${method.excludedCount}</b></div>
                    <div class="rounded-md bg-slate-50 px-3 py-2">Chuỗi: <b>${method.selectedStreakCount}</b></div>
                    <div class="rounded-md bg-slate-50 px-3 py-2">Ôm: <b>${method.holdCount ?? method.excludedCount}</b></div>
                </div>
                ${method.skipReason ? `<div class="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">${method.skipReason}</div>` : ''}
                <div class="mt-4">
                    <div class="mb-2 text-xs font-bold uppercase text-slate-500">${primaryLabel}</div>
                    <div class="number-grid">${numbersHtml}</div>
                </div>
            </article>
        `;
    }

    function renderNextPrediction(result) {
        const section = el('nextPredictionSection');
        const content = el('nextPredictionContent');
        const info = el('nextPredictionInfo');
        const data = result.nextPrediction;
        if (!section || !content || !data) return;

        const methodsById = new Map((result.methods || []).map(method => [method.id, method]));
        const orderedMethods = getMethodOrder(result)
            .map(id => data.methods[id] ? renderNextMethodCard(methodsById.get(id) || {}, data.methods[id]) : '')
            .join('');

        if (info) {
            info.textContent = `Dự đoán ngày ${data.predictionDate}, dùng dữ liệu tới ${data.basisDate}; ${data.candidatesCount} chuỗi ứng viên.`;
        }
        content.innerHTML = orderedMethods || '<div class="text-sm text-slate-500">Chưa có dữ liệu dự đoán ngày kế tiếp.</div>';
        section.classList.remove('hidden');
    }

    function reliabilityBadge(score) {
        if (score >= 70) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        if (score >= 55) return 'bg-amber-50 text-amber-700 border-amber-200';
        return 'bg-red-50 text-red-700 border-red-200';
    }

    function renderReliability(result) {
        const section = el('reliabilitySection');
        const content = el('reliabilityContent');
        const data = result.reliability;
        if (!section || !content || !data) return;

        const currentRows = (data.currentCandidates || []).slice(0, 24).map(item => `
            <tr class="border-t border-slate-100">
                <td class="px-3 py-2">
                    <div class="font-semibold text-slate-900">${displayTitle(item.title, item.key)}</div>
                    <div class="text-xs text-slate-500">${item.isPotential ? 'Sắp hình thành' : 'Đang diễn ra'} · ${item.numbersCount} số</div>
                </td>
                <td class="px-3 py-2 text-right font-semibold">
                    <div>${formatNumberValue(item.exclusionPriority)}</div>
                    <div class="text-[10px] font-normal text-slate-400">${formatPercent(item.dropOffRate)}</div>
                </td>
                <td class="px-3 py-2 text-right">${formatNumberValue(item.edgePercent, '%')}</td>
                <td class="px-3 py-2 text-right">
                    <span class="inline-flex rounded border px-2 py-1 text-xs font-bold ${reliabilityBadge(item.reliabilityScore)}">
                        ${item.reliabilityScore}
                    </span>
                </td>
                <td class="px-3 py-2 text-right">${item.sampleSize}</td>
                <td class="px-3 py-2 text-right">${formatNumberValue(item.lowerBoundPercent, '%')}</td>
                <td class="px-3 py-2 text-right">${formatNumberValue(item.avgLength, 'd')}</td>
                <td class="px-3 py-2 text-right">${formatNumberValue(item.avgGapDays, 'd')}</td>
                <td class="px-3 py-2 text-right">${formatNumberValue(item.daysSinceLatestEnd, 'd')}</td>
            </tr>
        `).join('');

        const weakRows = (data.highDropLowTrust || []).slice(0, 8).map(item => `
            <div class="rounded-md border border-red-100 bg-red-50 p-3">
                <div class="font-semibold text-red-900">${displayTitle(item.title, item.key)}</div>
                <div class="mt-1 text-xs text-red-700">
                    Dropoff ${formatPercent(item.bestPoint.dropOffRate)} · tin cậy ${item.bestPoint.reliabilityScore}
                    · mẫu ${item.bestPoint.reached} · cách hiện tại ${formatNumberValue(item.daysSinceLatestEnd, 'd')}
                </div>
            </div>
        `).join('');

        content.innerHTML = `
            <div class="grid gap-3 md:grid-cols-4">
                <div class="rounded-md bg-slate-50 p-3">
                    <div class="text-xs font-semibold uppercase text-slate-500">Số chuỗi</div>
                    <div class="mt-1 text-2xl font-bold">${data.totalPatterns}</div>
                </div>
                <div class="rounded-md bg-slate-50 p-3">
                    <div class="text-xs font-semibold uppercase text-slate-500">Tin cậy TB</div>
                    <div class="mt-1 text-2xl font-bold">${data.avgReliabilityScore}</div>
                </div>
                <div class="rounded-md bg-slate-50 p-3">
                    <div class="text-xs font-semibold uppercase text-slate-500">Chuỗi mạnh</div>
                    <div class="mt-1 text-2xl font-bold">${data.highReliabilityCount}</div>
                </div>
                <div class="rounded-md bg-slate-50 p-3">
                    <div class="text-xs font-semibold uppercase text-slate-500">Lịch sử</div>
                    <div class="mt-1 text-2xl font-bold">${formatNumberValue(data.totalYears, ' năm')}</div>
                </div>
            </div>

            <div class="mt-5 overflow-auto">
                <div class="mb-2 text-sm font-bold text-slate-900">Ứng viên gần nhất theo độ tin cậy</div>
                <table class="min-w-full text-sm">
                    <thead class="bg-slate-100 text-xs font-semibold uppercase text-slate-600">
                        <tr>
                            <th class="px-3 py-2 text-left">Chuỗi</th>
                            <th class="px-3 py-2 text-right">Ưu tiên</th>
                            <th class="px-3 py-2 text-right">Edge</th>
                            <th class="px-3 py-2 text-right">Tin cậy</th>
                            <th class="px-3 py-2 text-right">Mẫu</th>
                            <th class="px-3 py-2 text-right">Lower</th>
                            <th class="px-3 py-2 text-right">TB dài</th>
                            <th class="px-3 py-2 text-right">TB cách</th>
                            <th class="px-3 py-2 text-right">Gần nhất</th>
                        </tr>
                    </thead>
                    <tbody>${currentRows}</tbody>
                </table>
            </div>

            <div class="mt-5">
                <div class="mb-2 text-sm font-bold text-slate-900">Rủi ro cao nhưng độ tin cậy thấp</div>
                <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    ${weakRows || '<div class="text-sm text-slate-500">Không có nhóm rủi ro nổi bật.</div>'}
                </div>
            </div>
        `;
        section.classList.remove('hidden');
    }

    function renderMethodCell(day, methodId) {
        const method = day.methods[methodId];
        if (!method) return '';
        const profitClass = method.profit >= 0 ? 'text-emerald-700' : 'text-red-700';
        return `
            <button class="w-full rounded-md border p-3 text-left transition hover:shadow-sm ${methodStatusClass(method)}"
                data-date="${day.predictionDate}" data-method="${methodId}">
                <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-bold uppercase">${methodStatusText(method)}</span>
                    <span class="text-xs font-semibold ${profitClass}">${formatMoney(method.profit)}</span>
                </div>
                <div class="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <span>Ôm: <b>${method.holdCount ?? method.excludedCount}</b></span>
                    <span>Đánh: <b>${method.betCount}</b></span>
                    <span>Chuỗi: <b>${method.selectedStreakCount}</b></span>
                </div>
            </button>
        `;
    }

    function renderDetails(result) {
        const section = el('detailsSection');
        const table = el('detailsTable');
        if (!section || !table) return;
        const methodIds = getMethodOrder(result);

        table.innerHTML = result.details.map(day => `
            <tr>
                <td class="whitespace-nowrap px-4 py-3 align-top">
                    <div class="font-semibold">${day.predictionDate}</div>
                    <div class="text-xs text-slate-500">Dữ liệu tới ${day.basisDate}</div>
                    <div class="mt-1 text-xs text-slate-500">${day.candidatesCount} chuỗi dự đoán</div>
                </td>
                <td class="px-4 py-3 text-center align-top">
                    <span class="inline-flex min-w-10 justify-center rounded-md bg-slate-900 px-2 py-1 font-mono text-sm font-bold text-white">
                        ${day.actualNumberText}
                    </span>
                </td>
                ${methodIds.map(methodId => `
                    <td class="min-w-64 px-4 py-3 align-top">${renderMethodCell(day, methodId)}</td>
                `).join('')}
            </tr>
        `).join('');

        table.querySelectorAll('button[data-method]').forEach(button => {
            button.addEventListener('click', () => {
                const date = button.getAttribute('data-date');
                const methodId = button.getAttribute('data-method');
                selectMethod(date, methodId);
            });
        });

        section.classList.remove('hidden');
    }

    function renderNumberGrid(numbers, colorClass) {
        if (!numbers || numbers.length === 0) {
            return '<div class="text-sm text-slate-500">Không có số.</div>';
        }
        return `
            <div class="number-grid">
                ${numbers.map(num => `
                    <span class="rounded border px-2 py-1 text-center font-mono text-xs font-semibold ${colorClass}">
                        ${String(num).padStart(2, '0')}
                    </span>
                `).join('')}
            </div>
        `;
    }

    function selectMethod(date, methodId) {
        if (!state.result) return;
        const day = state.result.details.find(item => item.predictionDate === date);
        if (!day) return;
        const method = day.methods[methodId];
        if (!method) return;
        state.selected = { date, methodId };
        renderMethodDetail(day, methodId, method);
    }

    function renderMethodDetail(day, methodId, method) {
        const panel = el('methodDetail');
        if (!panel) return;

        const streakRows = method.selectedStreaks.map(item => `
            <div class="rounded-md border border-slate-200 p-3">
                <div class="flex items-start justify-between gap-2">
                    <div class="font-semibold text-slate-900">${displayTitle(item.title, item.key)}</div>
                    <div class="whitespace-nowrap text-sm font-bold text-red-700">
                        ${formatPercent(item.dropOffRate)}
                    </div>
                </div>
                <div class="mt-1 text-xs text-slate-500">
                    ${item.isPotential ? 'Sắp hình thành' : 'Đang diễn ra'} · ${item.streak}d · ${item.numbersCount} số
                    · dropoff ${formatPercent(item.dropOffRate)}
                    ${Number.isFinite(item.edge) ? ` · edge ${formatPercent(item.edge)}` : ''}
                    ${Number.isFinite(Number(item.reliabilityScore)) ? ` · tin cậy ${item.reliabilityScore}` : ''}
                    ${Number.isFinite(Number(item.combinedScore)) ? ` · tổng ${item.combinedScore}` : ''}
                    ${Number.isFinite(Number(item.numberRiskScore)) ? ` · risk số ${item.numberRiskScore}` : ''}
                    ${Number.isFinite(Number(item.chainSignalScore)) ? ` · tín hiệu ${item.chainSignalScore}` : ''}
                    ${Number.isFinite(Number(item.chainDueScore)) ? ` · gap chuỗi ${item.chainDueScore}` : ''}
                    ${Number.isFinite(Number(item.chainFrequencyPerYear)) ? ` · chuỗi ${item.chainFrequencyPerYear}/năm` : ''}
                    ${Number.isFinite(Number(item.chainAppearanceRate)) ? ` · HT/tiếp ${formatPercent(Number(item.chainAppearanceRate))}` : ''}
                    ${Number.isFinite(Number(item.frequencyPerYear)) ? ` · tần suất ${item.frequencyPerYear}/năm` : ''}
                    ${item.isPotential && Number.isFinite(Number(item.formFrequencyPerYear)) ? ` · HT ${formatNumberValue(item.formFrequencyPerYear, '/năm')}` : ''}
                    ${Number.isFinite(Number(item.protectedNumbersCount)) && Number(item.protectedNumbersCount) > 0 ? ` · bảo vệ ${item.protectedNumbersCount}` : ''}
                    ${item.addedNumbersCount !== undefined ? ` · thêm ${item.addedNumbersCount}` : ''}
                </div>
                <div class="mt-1 text-xs text-slate-500">
                    Mẫu ${formatNumberValue(item.sampleSize)} · lower ${formatNumberValue(item.lowerBoundPercent, '%')}
                    · TB dài ${formatNumberValue(item.avgLength, 'd')} · TB cách ${formatNumberValue(item.avgGapDays, 'd')}
                    · gần nhất ${formatNumberValue(item.daysSinceLatestEnd, 'd')}
                    ${Number.isFinite(Number(item.chainRiskDiscountScore)) ? ` · giữ điểm ${formatNumberValue(item.chainRiskDiscountScore, '%')}` : ''}
                </div>
                <div class="mt-2 font-mono text-xs leading-5 text-slate-700">${formatNumbers(item.numbers, 36)}</div>
            </div>
        `).join('');

        panel.innerHTML = `
            <div class="mb-4">
                <div class="text-xs font-semibold uppercase text-slate-500">${day.predictionDate}</div>
                <div class="mt-1 text-lg font-bold text-slate-900">${METHOD_LABELS[methodId] || method.name || methodId}</div>
                <div class="mt-2 inline-flex rounded-md border px-2 py-1 text-xs font-bold ${methodStatusClass(method)}">
                    ${methodStatusText(method)}
                </div>
                ${method.skipReason ? `<div class="mt-2 text-sm text-slate-600">${method.skipReason}</div>` : ''}
            </div>

            <div class="mb-4 grid grid-cols-2 gap-2 text-center text-xs md:grid-cols-5">
                <div class="rounded-md bg-slate-50 p-2">
                    <div class="text-slate-500">Số ôm</div>
                    <div class="text-lg font-bold">${method.holdCount ?? method.excludedCount}</div>
                </div>
                <div class="rounded-md bg-slate-50 p-2">
                    <div class="text-slate-500">Unique chuỗi</div>
                    <div class="text-lg font-bold">${method.selectedNumbersUnionCount ?? method.excludedCount}</div>
                </div>
                <div class="rounded-md bg-slate-50 p-2">
                    <div class="text-slate-500">Trùng lặp</div>
                    <div class="text-lg font-bold">${method.duplicateNumbersCount ?? 0}</div>
                </div>
                <div class="rounded-md bg-slate-50 p-2">
                    <div class="text-slate-500">Số đánh</div>
                    <div class="text-lg font-bold">${method.betCount}</div>
                </div>
                <div class="rounded-md bg-slate-50 p-2">
                    <div class="text-slate-500">Lãi/lỗ tổng</div>
                    <div class="text-lg font-bold ${method.profit >= 0 ? 'text-emerald-700' : 'text-red-700'}">${formatMoney(method.profit)}</div>
                </div>
            </div>

            <div class="mb-5">
                <div class="mb-2 text-sm font-bold text-slate-900">Số ôm / loại trừ</div>
                ${renderNumberGrid(method.excluded, 'border-red-200 bg-red-50 text-red-700')}
            </div>

            <div class="mb-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                <div class="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800">Lãi đánh: <b>${formatMoney(method.betProfit ?? 0)}</b></div>
                <div class="rounded-md bg-blue-50 px-3 py-2 text-blue-800">Lãi ôm: <b>${formatMoney(method.holdProfit ?? 0)}</b></div>
                <div class="rounded-md bg-slate-50 px-3 py-2">Thu ôm: <b>${formatMoney(method.holdIncome ?? 0)}</b></div>
                <div class="rounded-md bg-slate-50 px-3 py-2">Lỗ ôm: <b>${formatMoney(method.holdLoss ?? 0)}</b></div>
            </div>

            <div class="mb-5">
                <div class="mb-2 text-sm font-bold text-slate-900">Số đánh</div>
                ${renderNumberGrid(method.betNumbers, 'border-emerald-200 bg-emerald-50 text-emerald-700')}
            </div>

            <div>
                <div class="mb-2 flex items-center justify-between">
                    <div class="text-sm font-bold text-slate-900">Chuỗi dùng để loại trừ</div>
                    <div class="text-xs text-slate-500">${method.selectedStreakCount} chuỗi</div>
                </div>
                <div class="space-y-2">${streakRows || '<div class="text-sm text-slate-500">Không có chuỗi đủ điều kiện.</div>'}</div>
            </div>
        `;
    }

    async function runSimulation() {
        const days = el('simulationDays') ? el('simulationDays').value : 7;
        const params = new URLSearchParams({ days });
        getCustomQueryParams().forEach(([key, value]) => params.set(key, value));
        setLoading(true);
        showError('');

        try {
            const response = await fetch(`/api/simulation/backtest?${params.toString()}`);
            const result = await response.json();
            if (!response.ok || result.error) {
                throw new Error(result.error || 'Không thể chạy simulation.');
            }

            state.result = result;
            renderSummary(result);
            renderNextPrediction(result);
            renderReliability(result);
            renderDetails(result);

            if (result.details && result.details.length > 0) {
                const defaultMethod = getMethodOrder(result).includes('customExclusion') ? 'customExclusion' : getMethodOrder(result)[0];
                if (defaultMethod) selectMethod(result.details[0].predictionDate, defaultMethod);
            }
        } catch (error) {
            showError(error.message || 'Không thể chạy simulation.');
        } finally {
            setLoading(false);
        }
    }

    window.runSimulation = runSimulation;

    document.addEventListener('DOMContentLoaded', () => {
        const button = el('runSimulation');
        if (button) button.addEventListener('click', runSimulation);
        runSimulation();
    });
})();
