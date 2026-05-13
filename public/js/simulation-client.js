// public/js/simulation-client.js

(function () {
    const state = {
        result: null,
        selected: null
    };

    const METHOD_LABELS = {
        dropoff85: 'Ưu tiên 85+',
        dropoff85Edge: 'Ưu tiên 85 + Edge',
        ranked40to50: 'Ưu tiên loại 40-50',
        ranked60to70: 'Ưu tiên loại 60-70',
        combined20to30: 'Tổng hợp rủi ro 30'
    };

    function methodDescription(methodId) {
        if (methodId === 'dropoff85') return 'Điểm ưu tiên loại >= 85, gồm dropoff/không hình thành, lower, mẫu và tin cậy';
        if (methodId === 'dropoff85Edge') return 'Chỉ lấy chuỗi ưu tiên >= 85 khi rủi ro vượt xác suất nền theo số lượng số loại';
        if (methodId === 'ranked40to50') return 'Lấy ưu tiên loại cao nhất nhưng chỉ loại khoảng 40-50 số để tăng xác suất trúng';
        if (methodId === 'ranked60to70') return 'Lấy chuỗi ưu tiên loại cao nhất đến vùng loại trừ 60-70 số';
        return 'Chấm điểm rủi ro từng số bằng ưu tiên loại, dropoff/không hình thành, tin cậy, mẫu, lower, TB dài, TB cách, gần nhất và edge để còn 30 số đánh';
    }

    function el(id) {
        return document.getElementById(id);
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
        if (method.hit) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        return 'bg-red-50 text-red-700 border-red-200';
    }

    function methodStatusText(method) {
        if (method.skipped) return 'Bỏ qua';
        return method.hit ? 'Trúng' : 'Trượt';
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
                        <div class="text-xs uppercase text-slate-500">Tỉ lệ trúng</div>
                        <div class="mt-1 text-xl font-bold">${formatPercent(summary.hitRate)}</div>
                    </div>
                    <div>
                        <div class="text-xs uppercase text-slate-500">Trúng / Trượt</div>
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
                    <div class="rounded-md bg-slate-50 px-3 py-2">Tiền đánh: <b>${formatMoney(summary.totalStake)}</b></div>
                    <div class="rounded-md bg-slate-50 px-3 py-2">Tiền ăn: <b>${formatMoney(summary.totalPayout)}</b></div>
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
            generated.textContent = `${result.config.effectiveDays} ngày, đơn vị ${result.config.moneyUnit}`;
        }
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
                    <div class="font-semibold text-slate-900">${item.title || item.key}</div>
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
                <div class="font-semibold text-red-900">${item.title || item.key}</div>
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
                    <span>Loại: <b>${method.excludedCount}</b></span>
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
                <td class="min-w-64 px-4 py-3 align-top">${renderMethodCell(day, 'dropoff85')}</td>
                <td class="min-w-64 px-4 py-3 align-top">${renderMethodCell(day, 'dropoff85Edge')}</td>
                <td class="min-w-64 px-4 py-3 align-top">${renderMethodCell(day, 'ranked40to50')}</td>
                <td class="min-w-64 px-4 py-3 align-top">${renderMethodCell(day, 'ranked60to70')}</td>
                <td class="min-w-64 px-4 py-3 align-top">${renderMethodCell(day, 'combined20to30')}</td>
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
                    <div class="font-semibold text-slate-900">${item.title || item.key}</div>
                    <div class="whitespace-nowrap text-sm font-bold ${(item.exclusionPriority || 0) >= 85 ? 'text-red-700' : 'text-purple-700'}">
                        ${formatNumberValue(item.exclusionPriority)}
                    </div>
                </div>
                <div class="mt-1 text-xs text-slate-500">
                    ${item.isPotential ? 'Sắp hình thành' : 'Đang diễn ra'} · ${item.streak}d · ${item.numbersCount} số
                    · dropoff ${formatPercent(item.dropOffRate)}
                    ${Number.isFinite(item.edge) ? ` · edge ${formatPercent(item.edge)}` : ''}
                    ${Number.isFinite(Number(item.reliabilityScore)) ? ` · tin cậy ${item.reliabilityScore}` : ''}
                    ${Number.isFinite(Number(item.combinedScore)) ? ` · tổng ${item.combinedScore}` : ''}
                    ${Number.isFinite(Number(item.numberRiskScore)) ? ` · risk số ${item.numberRiskScore}` : ''}
                    ${item.addedNumbersCount !== undefined ? ` · thêm ${item.addedNumbersCount}` : ''}
                </div>
                <div class="mt-1 text-xs text-slate-500">
                    Mẫu ${formatNumberValue(item.sampleSize)} · lower ${formatNumberValue(item.lowerBoundPercent, '%')}
                    · TB dài ${formatNumberValue(item.avgLength, 'd')} · TB cách ${formatNumberValue(item.avgGapDays, 'd')}
                    · gần nhất ${formatNumberValue(item.daysSinceLatestEnd, 'd')}
                </div>
                <div class="mt-2 font-mono text-xs leading-5 text-slate-700">${formatNumbers(item.numbers, 36)}</div>
            </div>
        `).join('');

        panel.innerHTML = `
            <div class="mb-4">
                <div class="text-xs font-semibold uppercase text-slate-500">${day.predictionDate}</div>
                <div class="mt-1 text-lg font-bold text-slate-900">${METHOD_LABELS[methodId]}</div>
                <div class="mt-2 inline-flex rounded-md border px-2 py-1 text-xs font-bold ${methodStatusClass(method)}">
                    ${methodStatusText(method)}
                </div>
                ${method.skipReason ? `<div class="mt-2 text-sm text-slate-600">${method.skipReason}</div>` : ''}
            </div>

            <div class="mb-4 grid grid-cols-2 gap-2 text-center text-xs md:grid-cols-5">
                <div class="rounded-md bg-slate-50 p-2">
                    <div class="text-slate-500">Loại trừ</div>
                    <div class="text-lg font-bold">${method.excludedCount}</div>
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
                    <div class="text-slate-500">Lãi/lỗ</div>
                    <div class="text-lg font-bold ${method.profit >= 0 ? 'text-emerald-700' : 'text-red-700'}">${formatMoney(method.profit)}</div>
                </div>
            </div>

            <div class="mb-5">
                <div class="mb-2 text-sm font-bold text-slate-900">Số loại trừ</div>
                ${renderNumberGrid(method.excluded, 'border-red-200 bg-red-50 text-red-700')}
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
        const days = el('simulationDays') ? el('simulationDays').value : 30;
        setLoading(true);
        showError('');

        try {
            const response = await fetch(`/api/simulation/backtest?days=${encodeURIComponent(days)}`);
            const result = await response.json();
            if (!response.ok || result.error) {
                throw new Error(result.error || 'Không thể chạy simulation.');
            }

            state.result = result;
            renderSummary(result);
            renderReliability(result);
            renderDetails(result);

            if (result.details && result.details.length > 0) {
                selectMethod(result.details[0].predictionDate, 'combined20to30');
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
