(function () {
    const nf = new Intl.NumberFormat('vi-VN');
    const DEFAULT_LOTO_BET_COUNT = 6;
    const DEFAULT_LOTO_STAKE_K = 2200;
    const DEFAULT_LOTO_PAYOUT_K = 8000;
    const LOTO_COUNT_ORDER = [6, 7];
    const state = {
        performancePeriod: 'monthly',
        performancePayload: null,
        performanceLoading: false,
        performanceVisible: false,
        liveBetCount: DEFAULT_LOTO_BET_COUNT,
        defaultLotoBetCount: DEFAULT_LOTO_BET_COUNT,
        lotoPayload: null
    };

    function money(value) {
        const n = Number(value || 0);
        const sign = n > 0 ? '+' : '';
        return `${sign}${nf.format(n)}K`;
    }

    function asRatio(value) {
        const number = Number(value || 0);
        if (!Number.isFinite(number)) return 0;
        return Math.abs(number) > 1 ? number / 100 : number;
    }

    function percent(value) {
        return `${(asRatio(value) * 100).toLocaleString('vi-VN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}%`;
    }

    function numberBadge(number, tone = 'indigo', options = {}) {
        const tones = {
            indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
            green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
            amber: 'border-amber-200 bg-amber-50 text-amber-700',
            red: 'border-red-200 bg-red-50 text-red-700',
            slate: 'border-slate-200 bg-slate-50 text-slate-700',
            bet: 'number-chip-bet',
            exclude: 'number-chip-exclude',
            actual: 'number-chip-actual',
            hit: 'number-chip-hit',
            wrongExclude: 'number-chip-wrong-exclude'
        };
        const stateClass = options.hit
            ? 'number-chip-hit'
            : (options.wrongExclude ? 'number-chip-wrong-exclude' : '');
        const title = options.title || (options.hit ? 'Số thực tế trùng dàn Lô đã dự đoán' : '');
        return `<span title="${escapeHtml(title)}" class="inline-flex h-10 min-w-10 items-center justify-center rounded-xl border px-3 text-sm font-bold ${tones[tone] || tones.indigo} ${stateClass}">${number}</span>`;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function normalizeNumbers(values = []) {
        return (values || [])
            .map(value => String(value ?? '').trim())
            .filter(Boolean)
            .map(value => /^\d+$/.test(value) ? value.padStart(2, '0').slice(-2) : value);
    }

    function finiteNumber(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function getDoubleNumbers(item = {}) {
        const numbers = new Set(normalizeNumbers(item.numbers || item.betNumbers || []));
        return normalizeNumbers(item.doubleNumbers || item.x2Numbers || [])
            .filter(number => !numbers.size || numbers.has(number));
    }

    function getOverlapNumbers(item = {}) {
        const numbers = new Set(normalizeNumbers(item.numbers || item.betNumbers || []));
        return normalizeNumbers(item.overlapNumbers || item.intersection || [])
            .filter(number => !numbers.size || numbers.has(number));
    }

    function getUniqueCount(item = {}) {
        const explicit = finiteNumber(item.uniqueCount, 0);
        if (explicit > 0) return explicit;
        return normalizeNumbers(item.numbers || item.betNumbers || []).length;
    }

    function getUnitCount(item = {}, fallbackCount = DEFAULT_LOTO_BET_COUNT) {
        const explicit = finiteNumber(item.unitCount ?? item.betUnitCount ?? item.weightedBetCount, 0);
        if (explicit > 0) return explicit;
        const uniqueCount = getUniqueCount(item);
        const doubleCount = getDoubleNumbers(item).length;
        if (uniqueCount > 0) return uniqueCount + doubleCount;
        return finiteNumber(item.betCount ?? item.count, fallbackCount) || fallbackCount;
    }

    function getSupportCount(entry = {}) {
        const value = entry.supportCount ?? entry.sourceCount ?? entry.positions?.length;
        return finiteNumber(value, 0);
    }

    function getSupportLabel(entry = {}) {
        if (Array.isArray(entry.sourceStrategies) && entry.sourceStrategies.length > 0) {
            return 'phương pháp';
        }
        return 'vị trí';
    }

    function renderBetShape(item = {}, count = DEFAULT_LOTO_BET_COUNT) {
        const uniqueCount = getUniqueCount(item);
        const unitCount = getUnitCount(item, count);
        const overlapNumbers = getOverlapNumbers(item);
        const doubleNumbers = getDoubleNumbers(item);
        const overlapText = overlapNumbers.length
            ? ` · trùng 2 phương pháp: ${overlapNumbers.join(' ')}`
            : '';
        const doubleText = doubleNumbers.length
            ? ` · x2: ${doubleNumbers.join(' ')}`
            : '';
        return `${nf.format(uniqueCount)} số duy nhất · ${nf.format(unitCount)} đơn vị cược${overlapText}${doubleText}`;
    }

    function getBestLotoBetCount(data = {}) {
        const summary = data.livePredictions?.summary || {};
        const candidates = LOTO_COUNT_ORDER
            .map(count => ({ count, item: summary[`top${count}`] || {} }))
            .filter(entry => Number(entry.item.days || 0) > 0 && Number.isFinite(Number(entry.item.profitK)));
        if (!candidates.length) {
            const configured = Number(data.config?.defaultBetCount || data.livePredictions?.config?.defaultBetCount);
            return LOTO_COUNT_ORDER.includes(configured) ? configured : DEFAULT_LOTO_BET_COUNT;
        }
        candidates.sort((left, right) => {
            const profitDelta = Number(right.item.profitK || 0) - Number(left.item.profitK || 0);
            if (profitDelta !== 0) return profitDelta;
            const roiDelta = Number(right.item.roi || 0) - Number(left.item.roi || 0);
            if (roiDelta !== 0) return roiDelta;
            return left.count - right.count;
        });
        return candidates[0].count;
    }

    function renderMeta(data) {
        const metaBox = document.getElementById('metaBox');
        const cfg = data.config || {};
        const next = data.nextPrediction || {};
        const methodLabel = cfg.methodName || data.livePredictions?.config?.methodName || next.methodName || next.methodId || cfg.methodId || '-';
        const stakeK = finiteNumber(cfg.stakePerNumberK || data.livePredictions?.config?.stakePerNumberK || next.config?.stakePerNumberK, DEFAULT_LOTO_STAKE_K);
        const payoutK = finiteNumber(cfg.payoutPerHitK || data.livePredictions?.config?.payoutPerHitK || next.config?.payoutPerHitK, DEFAULT_LOTO_PAYOUT_K);
        metaBox.innerHTML = [
            ['Ngày dữ liệu', data.latestDataDate || next.dataIsoDate || '-'],
            ['Ngày dự đoán', next.predictionDate || '-'],
            ['Vị trí', `${cfg.positionCount || 27} giải`],
            ['Phương pháp', methodLabel],
            ['Bộ chọn', cfg.aggregationMode || next.aggregationMode || '-'],
            ['Công thức', `${nf.format(stakeK)}K ăn ${nf.format(payoutK)}K`]
        ].map(([label, value]) => `
            <div class="glass-card p-4">
                <div class="text-xs font-semibold uppercase text-slate-500">${label}</div>
                <div class="mt-2 text-2xl font-bold text-slate-900">${value}</div>
            </div>
        `).join('');
    }

    function renderPredictions(data) {
        const root = document.getElementById('predictionCards');
        const predictions = data.nextPrediction?.predictions || {};
        const recommendedCount = state.defaultLotoBetCount || DEFAULT_LOTO_BET_COUNT;
        root.innerHTML = LOTO_COUNT_ORDER.map(count => {
            const item = predictions[`top${count}`] || {};
            const overlapNumbers = getOverlapNumbers(item);
            const doubleNumbers = getDoubleNumbers(item);
            const betShape = renderBetShape(item, count);
            const supportRows = (item.support || []).map(entry => `
                <div class="flex items-center justify-between gap-3 rounded-lg bg-white/60 px-3 py-2 text-xs">
                    <span class="font-bold text-slate-900">${entry.number}</span>
                    <span class="text-slate-500">${nf.format(getSupportCount(entry))} ${getSupportLabel(entry)}</span>
                </div>
            `).join('');
            return `
                <article class="glass-card number-panel-bet overflow-hidden ${count === recommendedCount ? 'ring-2 ring-emerald-300' : ''}">
                    <div class="border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50 px-4 py-3">
                        <h2 class="flex items-center gap-2 text-lg font-bold text-slate-900">
                            Top ${count} mỗi phương pháp
                            ${count === recommendedCount ? '<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700">Profit cao nhất</span>' : ''}
                        </h2>
                        <div class="mt-1 text-xs font-semibold text-slate-500">${escapeHtml(betShape)}</div>
                    </div>
                    <div class="p-4">
                        ${overlapNumbers.length ? `
                            <div class="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700">
                                Trùng cả 2 phương pháp, nhưng Lô vẫn chỉ tính 1 đơn vị: ${escapeHtml(overlapNumbers.join(' '))}
                            </div>
                        ` : ''}
                        <div class="flex flex-wrap gap-2">
                            ${(item.numbers || []).map(number => {
                                const isOverlap = overlapNumbers.includes(String(number).padStart(2, '0'));
                                const badge = numberBadge(number, 'bet', isOverlap ? { title: 'Trùng cả 2 phương án, nhưng Lô chỉ cược 1 đơn vị' } : {});
                                return isOverlap
                                    ? `<div class="relative flex items-center">${badge}<span class="absolute -top-1.5 -right-1.5 flex h-5 px-1.5 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-black text-white shadow-md ring-1 ring-white">2P</span></div>`
                                    : badge;
                            }).join('')}
                        </div>
                        <div class="mt-4 grid gap-2">${supportRows || '<div class="text-sm text-slate-500">Chưa có dữ liệu.</div>'}</div>
                    </div>
                </article>
            `;
        }).join('');
    }

    function renderLive(data) {
        const live = data.livePredictions || {};
        const summaryRoot = document.getElementById('liveSummary');
        const listRoot = document.getElementById('liveList');
        const tabsRoot = document.getElementById('liveMethodTabs');
        const selectedCount = state.liveBetCount;
        const selectedKey = `top${selectedCount}`;
        const summary = summarizeLiveAdjusted(live);
        tabsRoot.innerHTML = LOTO_COUNT_ORDER.map(count => `
            <button type="button" data-live-count="${count}"
                class="live-method-btn rounded-xl border px-3 py-2 text-xs font-black transition ${count === selectedCount
                    ? 'border-violet-600 bg-violet-600 text-white shadow'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700'}">
                Top ${count}
            </button>
        `).join('');
        tabsRoot.querySelectorAll('.live-method-btn').forEach(button => {
            button.addEventListener('click', () => {
                state.liveBetCount = Number(button.dataset.liveCount) || DEFAULT_LOTO_BET_COUNT;
                renderLive(state.lotoPayload || data);
            });
        });

        summaryRoot.innerHTML = LOTO_COUNT_ORDER.map(count => {
            const item = summary[`top${count}`] || {};
            return `
                <button type="button" data-summary-count="${count}"
                    class="live-summary-btn min-h-32 rounded-xl border p-4 text-left transition ${count === selectedCount
                        ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-200'
                        : (count === DEFAULT_LOTO_BET_COUNT ? 'border-emerald-200 bg-emerald-50/80' : 'border-amber-100 bg-white/70')}">
                    <div class="text-xs font-semibold uppercase text-slate-500">Top ${count} thực tế</div>
                    <div class="mt-2 text-2xl font-black text-slate-900">${item.days || 0} ngày</div>
                    <div class="mt-1 text-sm text-slate-600">Lãi ${item.wins || 0}/${item.days || 0} · hit-day ${percent(item.hitRate)}</div>
                    <div class="mt-1 text-sm font-bold ${(item.profitK || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}">${money(item.profitK)}</div>
                </button>
            `;
        }).join('');
        summaryRoot.querySelectorAll('.live-summary-btn').forEach(button => {
            button.addEventListener('click', () => {
                state.liveBetCount = Number(button.dataset.summaryCount) || DEFAULT_LOTO_BET_COUNT;
                renderLive(state.lotoPayload || data);
            });
        });

        const rows = (live.predictions || []).slice().reverse();
        const methodName = live.config?.methodName || data.config?.methodName || '';
        listRoot.innerHTML = rows.map(row => {
            const statusLabel = row.status === 'settled' ? 'Đã kết toán' : 'Chờ kết quả';
            const statusClass = row.status === 'settled'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200';
            const actualNumbers = row.actual ? Object.keys(row.actual).sort((a, b) => Number(a) - Number(b)) : [];
            const selectedPrediction = row.predictions?.[selectedKey] || {
                count: selectedCount,
                numbers: []
            };
            const hasSelectedPrediction = (selectedPrediction.numbers || []).length > 0;
            const selectedOverlapNumbers = getOverlapNumbers(selectedPrediction);
            const selectedDoubleNumbers = getDoubleNumbers(selectedPrediction);
            const selectedBetShape = renderBetShape(selectedPrediction, selectedCount);
            const predictedSet = new Set((selectedPrediction.numbers || []).map(number => String(number).padStart(2, '0')));
            const actualSet = new Set(actualNumbers.map(number => String(number).padStart(2, '0')));
            const actualHtml = actualNumbers.length
                ? actualNumbers.map(number => {
                    const text = String(number).padStart(2, '0');
                    const isHit = predictedSet.has(text);
                    const isOverlap = isHit && selectedOverlapNumbers.includes(text);
                    const badge = numberBadge(text, isHit ? 'hit' : 'actual', {
                        hit: isHit,
                        title: isOverlap
                            ? 'Kết quả thực tế trúng số trùng cả 2 phương pháp Lô'
                            : (isHit ? 'Kết quả thực tế trùng dàn Lô đã dự đoán' : 'Kết quả thực tế nhưng không nằm trong dàn đánh')
                    });
                    return isOverlap
                        ? `<span class="relative inline-flex">${badge}<span class="absolute -right-1.5 -top-1.5 rounded-full bg-indigo-500 px-1.5 py-0.5 text-[9px] font-black text-white shadow ring-1 ring-white">2P</span></span>`
                        : badge;
                }).join('')
                : '<span class="text-xs text-slate-400">-</span>';
            const rawMethod = row.methods?.[selectedKey] || {};
            const method = adjustLiveMethod(rawMethod, selectedPrediction.count || selectedCount);
            const methodUnitCount = getUnitCount(method, selectedCount);
            return `
                <article class="p-4 ${row.status === 'pending' ? 'bg-amber-50/30' : 'bg-white/30'}">
                    <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="text-base font-black text-slate-900">${row.predictionIsoDate || row.predictionDate}</span>
                                <span class="rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass}">${statusLabel}</span>
                                <span class="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">THỰC TẾ</span>
                            </div>
                            <div class="mt-1 text-xs text-slate-500">Dựa trên dữ liệu đến ${row.dataIsoDate || row.dataDate || '-'}</div>
                            <div class="mt-1 text-xs font-semibold text-indigo-600">${methodName || row.methodId || '-'}</div>
                            <div class="number-panel-live mt-3 rounded-2xl border p-3">
                                <div class="mb-1 text-xs font-semibold uppercase text-slate-500">Kết quả thực tế</div>
                                <div class="flex flex-wrap gap-1.5">${actualHtml}</div>
                            </div>
                        </div>
                        <div class="text-left lg:text-right">
                            <div class="text-sm font-bold ${(method.profitK || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}">${row.status === 'settled' && hasSelectedPrediction ? money(method.profitK) : (hasSelectedPrediction ? 'Chưa kết toán' : `Chưa theo dõi Top ${selectedCount}`)}</div>
                            <div class="text-xs text-slate-500">${row.status === 'settled' && hasSelectedPrediction ? `${method.hits || 0} hit · ${nf.format(methodUnitCount)} đơn vị cược · vốn ${money(method.stakeK).replace('+', '')}` : (hasSelectedPrediction ? 'Sẽ tự đối soát khi có KQ' : `Snapshot chưa có dàn Top ${selectedCount}`)}</div>
                        </div>
                    </div>
                    <div class="number-panel-bet mt-3 rounded-2xl border p-3">
                        <div class="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div class="text-xs font-semibold uppercase text-slate-500">Dàn Top ${selectedCount} đã chốt</div>
                            <div class="text-xs font-semibold text-slate-500">${escapeHtml(selectedBetShape)}</div>
                        </div>
                        ${selectedOverlapNumbers.length ? `
                            <div class="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700">
                                Trùng cả 2 phương pháp, không nhân tiền Lô: ${escapeHtml(selectedOverlapNumbers.join(' '))}
                            </div>
                        ` : ''}
                        <div class="flex flex-wrap gap-2">
                        ${(selectedPrediction.numbers || []).map(number => {
                            const text = String(number).padStart(2, '0');
                            const isHit = row.status === 'settled' && actualSet.has(text);
                            const isOverlap = selectedOverlapNumbers.includes(text);
                            const badge = numberBadge(text, row.status === 'pending' ? (isHit ? 'hit' : 'amber') : 'bet', {
                                hit: isHit,
                                title: isHit ? (isOverlap ? 'Số trùng 2 phương pháp và trúng thực tế' : 'Số đánh đã trúng thực tế trong 27 giải') : ''
                            });
                            return isOverlap
                                ? `<div class="relative flex items-center">${badge}<span class="absolute -top-1.5 -right-1.5 flex h-5 px-1.5 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-black text-white shadow-md ring-1 ring-white">2P</span></div>`
                                : badge;
                        }).join('') || `<span class="text-xs text-slate-400">Không có dàn Top ${selectedCount} trong snapshot này.</span>`}
                        </div>
                    </div>
                </article>
            `;
        }).join('') || '<div class="p-4 text-sm text-slate-500">Chưa có dự đoán thực tế nào được lưu.</div>';
    }

    function getPeriodLabel(period) {
        return { daily: 'Ngày', weekly: 'Tuần', monthly: 'Tháng' }[period] || period;
    }

    function rowLabel(row, period = state.performancePeriod) {
        if (period === 'daily') return row.date || row.period || '-';
        if (period === 'weekly') return row.week || row.period || '-';
        return row.month || row.period || '-';
    }

    function getRowHits(row = {}) {
        return Number(row.totalHits ?? row.hits ?? row.hitCount ?? 0) || 0;
    }

    function getActivePerformanceBetCount() {
        const section = state.performancePayload?.sections?.loto;
        const fromSummary = Number(section?.summary?.betCount);
        if (Number.isFinite(fromSummary) && fromSummary > 0) return fromSummary;
        const match = String(section?.methodId || '').match(/top(\d+)/i);
        return match ? Number(match[1]) : DEFAULT_LOTO_BET_COUNT;
    }

    function adjustLotoFinancialRow(row = {}, betCount = getActivePerformanceBetCount()) {
        const existingStakeK = Number(row.stakeK);
        const existingPayoutK = Number(row.payoutK);
        if (Number.isFinite(existingStakeK) && Number.isFinite(existingPayoutK)) {
            const existingProfitK = Number.isFinite(Number(row.profitK)) ? Number(row.profitK) : existingPayoutK - existingStakeK;
            return {
                ...row,
                stakeK: existingStakeK,
                payoutK: existingPayoutK,
                profitK: existingProfitK,
                roi: existingStakeK ? existingProfitK / existingStakeK : 0
            };
        }
        const days = Number(row.days || (row.date || row.period || row.month || row.week ? 1 : 0)) || 0;
        const hits = getRowHits(row);
        const selectedCount = Number(row.betCount || betCount || DEFAULT_LOTO_BET_COUNT);
        const unitCount = Number(row.unitCount || selectedCount) || selectedCount;
        const stakeK = days * unitCount * DEFAULT_LOTO_STAKE_K;
        const payoutK = hits * DEFAULT_LOTO_PAYOUT_K;
        const profitK = payoutK - stakeK;
        return {
            ...row,
            betCount: selectedCount,
            stakeK,
            payoutK,
            profitK,
            roi: stakeK ? profitK / stakeK : 0
        };
    }

    function adjustLotoSummary(summary = {}) {
        return adjustLotoFinancialRow(summary, Number(summary.betCount || getActivePerformanceBetCount()));
    }

    function adjustLiveMethod(method = {}, count = DEFAULT_LOTO_BET_COUNT) {
        const hits = Number(method.hits || 0) || 0;
        const unitCount = getUnitCount(method, count);
        const stakeK = Number.isFinite(Number(method.stakeK)) ? Number(method.stakeK) : unitCount * DEFAULT_LOTO_STAKE_K;
        const payoutK = Number.isFinite(Number(method.payoutK)) ? Number(method.payoutK) : hits * DEFAULT_LOTO_PAYOUT_K;
        const profitK = Number.isFinite(Number(method.profitK)) ? Number(method.profitK) : payoutK - stakeK;
        return {
            ...method,
            unitCount,
            uniqueCount: getUniqueCount(method),
            doubleNumbers: getDoubleNumbers(method),
            hits,
            stakeK,
            payoutK,
            profitK,
            result: profitK > 0 ? 'win' : (profitK < 0 ? 'loss' : 'flat')
        };
    }

    function summarizeLiveAdjusted(live = {}) {
        const settledRows = (live.predictions || []).filter(row => row.status === 'settled');
        const summary = {};
        for (const count of LOTO_COUNT_ORDER) {
            const key = `top${count}`;
            const item = {
                days: 0,
                wins: 0,
                losses: 0,
                hitDays: 0,
                totalHits: 0,
                stakeK: 0,
                payoutK: 0,
                profitK: 0
            };
            for (const row of settledRows) {
                const method = row.methods?.[key];
                if (!method) continue;
                const adjusted = adjustLiveMethod(method, count);
                item.days += 1;
                item.totalHits += adjusted.hits;
                item.stakeK += adjusted.stakeK;
                item.payoutK += adjusted.payoutK;
                item.profitK += adjusted.profitK;
                if (adjusted.hits > 0) item.hitDays += 1;
                if (adjusted.profitK > 0) item.wins += 1;
                if (adjusted.profitK < 0) item.losses += 1;
            }
            item.hitRate = item.days ? item.hitDays / item.days : 0;
            item.winRate = item.days ? item.wins / item.days : 0;
            item.roi = item.stakeK ? item.profitK / item.stakeK : 0;
            summary[key] = item;
        }
        return summary;
    }

    function getRowProfit(row = {}) {
        return Number(adjustLotoFinancialRow(row).profitK ?? row.netProfitK ?? 0);
    }

    function renderPeriodTabs() {
        const root = document.getElementById('performancePeriodTabs');
        if (!root) return;
        if (!state.performanceVisible) {
            root.innerHTML = `
                <button type="button" id="showPerformanceReport"
                    class="rounded-xl bg-white px-5 py-2 text-sm font-black text-violet-700 shadow transition hover:bg-violet-50">
                    Xem thống kê
                </button>
            `;
            root.querySelector('#showPerformanceReport')?.addEventListener('click', () => {
                state.performanceVisible = true;
                loadPerformanceReport();
            });
            return;
        }
        root.innerHTML = ['daily', 'weekly', 'monthly'].map(period => `
            <button type="button" data-period="${period}"
                class="performance-period-btn rounded-xl px-4 py-2 transition ${state.performancePeriod === period
                    ? 'bg-white text-violet-700 shadow'
                    : 'text-violet-100 hover:bg-white/10'}">
                ${getPeriodLabel(period)}
            </button>
        `).join('') + `
            <button type="button" id="hidePerformanceReport"
                class="ml-1 rounded-xl px-4 py-2 text-violet-100 transition hover:bg-white/10">
                Ẩn
            </button>
        `;
        root.querySelectorAll('.performance-period-btn').forEach(button => {
            button.addEventListener('click', () => {
                state.performancePeriod = button.dataset.period || 'monthly';
                loadPerformanceReport();
            });
        });
        root.querySelector('#hidePerformanceReport')?.addEventListener('click', () => {
            state.performanceVisible = false;
            renderPerformanceReport();
        });
    }

    function renderProfitBars(rows = []) {
        const visible = rows.slice(-18);
        if (!visible.length) return '<div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Chưa có dữ liệu biểu đồ.</div>';
        const maxAbs = Math.max(1, ...visible.map(row => Math.abs(getRowProfit(row))));
        return `
            <div class="flex h-56 items-end gap-2 rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4">
                ${visible.map(row => {
                    const profit = getRowProfit(row);
                    const height = Math.max(8, Math.round(Math.abs(profit) / maxAbs * 160));
                    const positive = profit >= 0;
                    return `
                        <div class="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                            <div title="${escapeHtml(rowLabel(row))}: ${money(profit)}"
                                class="w-full rounded-t-lg ${positive ? 'bg-emerald-500' : 'bg-red-500'} shadow-sm transition group-hover:opacity-80"
                                style="height:${height}px"></div>
                            <div class="w-full truncate text-center text-[10px] font-semibold text-slate-400">${escapeHtml(rowLabel(row).replace(/^2026-/, ''))}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderCumulativeLine(rows = []) {
        if (!rows.length) return '<div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Chưa có dữ liệu tích lũy.</div>';
        let cumulative = 0;
        const values = rows.map(row => {
            cumulative += getRowProfit(row);
            return cumulative;
        });
        const width = 720;
        const height = 220;
        const pad = 24;
        const min = Math.min(0, ...values);
        const max = Math.max(0, ...values);
        const span = Math.max(1, max - min);
        const points = values.map((value, index) => {
            const x = pad + (index / Math.max(1, values.length - 1)) * (width - pad * 2);
            const y = pad + ((max - value) / span) * (height - pad * 2);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
        const zeroY = pad + ((max - 0) / span) * (height - pad * 2);
        const last = points.split(' ').pop() || `${width - pad},${pad}`;
        const [lastX, lastY] = last.split(',');
        return `
            <div class="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-3">
                <svg viewBox="0 0 ${width} ${height}" class="h-56 w-full" role="img" aria-label="Biểu đồ profit tích lũy">
                    <line x1="${pad}" x2="${width - pad}" y1="${zeroY}" y2="${zeroY}" stroke="rgba(255,255,255,0.18)" stroke-width="2" />
                    <polyline fill="none" stroke="#c084fc" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" points="${points}" />
                    <circle cx="${lastX}" cy="${lastY}" r="6" fill="#34d399" />
                </svg>
                <div class="flex justify-between px-2 text-xs font-semibold text-slate-300">
                    <span>${escapeHtml(rowLabel(rows[0]))}</span>
                    <span>Tích lũy: ${money(cumulative)}</span>
                    <span>${escapeHtml(rowLabel(rows[rows.length - 1]))}</span>
                </div>
            </div>
        `;
    }

    function renderPerformanceReport() {
        renderPeriodTabs();
        const root = document.getElementById('performanceReport');
        if (!root) return;
        if (!state.performanceVisible) {
            root.innerHTML = `
                <div class="rounded-2xl border border-dashed border-violet-200 bg-violet-50/60 p-5">
                    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <div class="text-sm font-black text-slate-950">Báo cáo hiệu quả Lô chỉ hiển thị khi người dùng yêu cầu</div>
                            <p class="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                                Đây là thống kê tham khảo/backtest theo cache đã sinh, tách biệt với nhật ký đánh thực tế. Bấm “Xem thống kê” để mở KPI, biểu đồ và bảng ngày/tuần/tháng.
                            </p>
                        </div>
                        <button type="button" id="showPerformanceReportInline"
                            class="inline-flex h-11 items-center justify-center rounded-xl bg-violet-600 px-5 text-sm font-black text-white shadow hover:bg-violet-700">
                            Xem thống kê
                        </button>
                    </div>
                </div>
            `;
            root.querySelector('#showPerformanceReportInline')?.addEventListener('click', () => {
                state.performanceVisible = true;
                loadPerformanceReport();
            });
            return;
        }
        if (state.performanceLoading) {
            root.innerHTML = '<div class="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">Đang tải báo cáo hiệu quả...</div>';
            return;
        }
        const section = state.performancePayload?.sections?.loto;
        if (!section) {
            root.innerHTML = '<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Chưa có cache hiệu quả Lô. Hãy chạy lại action cập nhật dữ liệu để sinh báo cáo mới.</div>';
            return;
        }
        const summary = adjustLotoSummary(section.summary || {});
        const rows = section.rows || [];
        const positive = Number(summary.profitK || 0) >= 0;
        const cards = [
            ['Số ngày', `${nf.format(summary.days || rows.length)} ngày`, 'Tổng ngày đã có kết quả để đối soát.'],
            ['Hit-day', percent(summary.hitRate), 'Ngày có ít nhất 1 số xuất hiện trong 27 giải.'],
            ['Win-day', percent(summary.winRate), 'Ngày đạt ngưỡng thắng theo công thức Lô hiện tại.'],
            ['Hit TB/ngày', Number(summary.avgHitsPerDay || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 }), 'Số hit trung bình mỗi ngày.'],
            ['Profit', money(summary.profitK), `Lãi/lỗ ròng theo ${nf.format(DEFAULT_LOTO_STAKE_K)}K ăn ${nf.format(DEFAULT_LOTO_PAYOUT_K)}K.`],
            ['ROI', percent(summary.roi), 'Profit chia cho tổng tiền đánh.']
        ];
        root.innerHTML = `
            <div class="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div>
                    <div class="mb-4 flex flex-col gap-3 rounded-2xl border border-violet-100 bg-violet-50/70 p-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <div class="text-xs font-bold uppercase tracking-wide text-violet-600">Phương pháp đang đánh giá</div>
                            <div class="mt-1 text-xl font-black text-slate-950">${escapeHtml(section.label || section.methodId)}</div>
                            <p class="mt-2 text-sm leading-6 text-slate-600">${escapeHtml(section.explanation || '')}</p>
                        </div>
                        <div class="rounded-2xl border px-4 py-3 text-center ${section.assessment?.tone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}">
                            <div class="text-xs font-bold uppercase">Đánh giá</div>
                            <div class="mt-1 text-2xl font-black">${escapeHtml(section.assessment?.level || 'Theo dõi')}</div>
                        </div>
                    </div>
                    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        ${cards.map(([label, value, hint]) => `
                            <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div class="text-xs font-bold uppercase text-slate-500">${escapeHtml(label)}</div>
                                <div class="mt-2 text-2xl font-black ${label === 'Profit' ? (positive ? 'text-emerald-600' : 'text-red-600') : 'text-slate-950'}">${escapeHtml(value)}</div>
                                <div class="mt-1 text-xs leading-5 text-slate-500">${escapeHtml(hint)}</div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div class="text-sm font-bold text-slate-900">Nhận định vận hành</div>
                        <ul class="mt-2 space-y-1 text-sm leading-6 text-slate-600">
                            ${(section.assessment?.notes || []).map(note => `<li>• ${escapeHtml(note)}</li>`).join('')}
                            ${section.evaluation ? `<li>• ${escapeHtml(section.evaluation)}</li>` : ''}
                            <li>• Với Lô, cần ưu tiên độ đều theo tuần hơn là chỉ nhìn một vài ngày profit lớn.</li>
                        </ul>
                    </div>
                </div>
                <div class="grid gap-4">
                    <div>
                        <div class="mb-2 text-sm font-bold text-slate-900">Lãi/lỗ theo ${getPeriodLabel(state.performancePeriod).toLowerCase()}</div>
                        ${renderProfitBars(rows)}
                    </div>
                    <div>
                        <div class="mb-2 text-sm font-bold text-slate-900">Đường profit tích lũy</div>
                        ${renderCumulativeLine(rows)}
                    </div>
                </div>
            </div>
            <div class="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                <table class="min-w-full text-sm">
                    <thead class="bg-slate-100 text-xs font-bold uppercase text-slate-500">
                        <tr>
                            <th class="px-4 py-3 text-left">Kỳ</th>
                            <th class="px-4 py-3 text-right">Ngày</th>
                            <th class="px-4 py-3 text-right">Hit-day</th>
                            <th class="px-4 py-3 text-right">Hit</th>
                            <th class="px-4 py-3 text-right">Win-day</th>
                            <th class="px-4 py-3 text-right">Profit</th>
                            <th class="px-4 py-3 text-right">ROI</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 bg-white">
                        ${rows.slice(-36).reverse().map(row => {
                            const adjusted = adjustLotoFinancialRow(row, summary.betCount || DEFAULT_LOTO_BET_COUNT);
                            const profit = adjusted.profitK;
                            return `
                                <tr>
                                    <td class="px-4 py-3 font-bold text-slate-900">${escapeHtml(rowLabel(row))}</td>
                                    <td class="px-4 py-3 text-right text-slate-600">${nf.format(row.days || 1)}</td>
                                    <td class="px-4 py-3 text-right text-slate-600">${nf.format(row.hitDays ?? 0)}</td>
                                    <td class="px-4 py-3 text-right text-slate-600">${nf.format(adjusted.totalHits ?? adjusted.hits ?? 0)}</td>
                                    <td class="px-4 py-3 text-right font-semibold text-slate-900">${nf.format(row.winDays ?? row.wins ?? 0)}</td>
                                    <td class="px-4 py-3 text-right font-black ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}">${money(profit)}</td>
                                    <td class="px-4 py-3 text-right font-semibold">${percent(adjusted.roi)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async function loadPerformanceReport() {
        if (!state.performanceVisible) {
            renderPerformanceReport();
            return;
        }
        state.performanceLoading = true;
        renderPerformanceReport();
        try {
            const period = encodeURIComponent(state.performancePeriod);
            const res = await fetch(`/api/performance-report?type=loto&period=${period}`, { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Không tải được báo cáo hiệu quả Lô.');
            state.performancePayload = data;
        } catch (error) {
            state.performancePayload = { sections: {} };
            console.error('[LotoPerformanceReport] Error:', error);
        } finally {
            state.performanceLoading = false;
            renderPerformanceReport();
        }
    }

    async function load() {
        const errorBox = document.getElementById('errorBox');
        try {
            const selectEl = document.getElementById('lotoStrategySelect');
            const strat = selectEl ? selectEl.value : 'rrfSmall65Block75';
            const res = await fetch(`/api/loto/prediction?strategy=${strat}`, { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Không tải được dữ liệu Lô.');
            errorBox.classList.add('hidden');
            state.lotoPayload = data;
            state.defaultLotoBetCount = getBestLotoBetCount(data);
            state.liveBetCount = state.defaultLotoBetCount;
            renderMeta(data);
            renderPredictions(data);
            renderLive(data);
            renderPerformanceReport();
        } catch (error) {
            errorBox.textContent = error.message;
            errorBox.classList.remove('hidden');
            renderPerformanceReport();
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        load();
        const selectEl = document.getElementById('lotoStrategySelect');
        if (selectEl) {
            selectEl.addEventListener('change', () => {
                load();
            });
        }
    });
})();
