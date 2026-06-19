(function () {
    const state = { data: null, selectedKeys: new Set(), aggregationMode: 'average', averageHoldCount: 70 };

    const el = id => document.getElementById(id);
    const fmt = (value, suffix = '') => {
        if (value === null || value === undefined || !Number.isFinite(Number(value))) return '-';
        return `${Number(value).toLocaleString('vi-VN')}${suffix}`;
    };
    const numText = n => String(n).padStart(2, '0');
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
    const fmtDecimal = (value, fractionDigits = 1) => {
        const number = Number(value);
        if (!Number.isFinite(number)) return '-';
        return number.toLocaleString('vi-VN', {
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits
        });
    };

    function fmtFrequency(row) {
        const value = Number(row.frequencyPerYear);
        if (!Number.isFinite(value)) return '<span class="text-slate-400">-</span>';

        const fractionDigits = value > 0 && value < 0.1 ? 3 : (value > 0 && value < 1 ? 2 : 1);
        const count = Number(row.frequencyCount);
        const years = Number(row.frequencyYears || state.data?.totalYears);
        const kindLabel = row.frequencyKind === 'formation' ? 'HT' : 'Target';
        const detail = Number.isFinite(count) && Number.isFinite(years)
            ? `${count.toLocaleString('vi-VN')} lần / ${fmtDecimal(years, 1)} năm`
            : '';

        return `
            <div class="font-semibold text-slate-900">${fmtDecimal(value, fractionDigits)}/năm</div>
            <div class="mt-0.5 text-[11px] text-slate-500">${kindLabel}${detail ? ` · ${detail}` : ''}</div>
        `;
    }

    function setLoading(isLoading) {
        el('refreshButton').disabled = isLoading;
        el('refreshButton').classList.toggle('opacity-70', isLoading);
        el('spinner').classList.toggle('hidden', !isLoading);
        el('refreshLabel').textContent = isLoading ? 'Đang tải...' : 'Tính lại';
    }

    function showError(message) {
        const box = el('errorBox');
        box.textContent = message || '';
        box.classList.toggle('hidden', !message);
    }

    function tierClass(row) {
        if (row.tierRank === 1) return 'border-red-200 bg-red-50 text-red-700';
        if (row.tierRank === 2) return 'border-amber-200 bg-amber-50 text-amber-700';
        return 'border-slate-200 bg-slate-50 text-slate-600';
    }

    function collectNumbers(rows) {
        if (state.aggregationMode === 'average') {
            const hold = state.data?.averageDropoff?.holds?.[String(state.averageHoldCount)];
            if (hold) {
                return {
                    excludedNumbers: hold.excludedNumbers || [],
                    betNumbers: hold.betNumbers || []
                };
            }
        }
        const excluded = new Set();
        rows.forEach(row => {
            if (!state.selectedKeys.has(row.key)) return;
            (row.numbers || []).forEach(num => excluded.add(Number(num)));
        });
        const excludedNumbers = [...excluded].sort((a, b) => a - b);
        const excludedSet = new Set(excludedNumbers);
        const betNumbers = Array.from({ length: 100 }, (_, i) => i).filter(num => !excludedSet.has(num));
        return { excludedNumbers, betNumbers };
    }

    function renderNumberGrid(numbers, selectedClass) {
        const rankingByNumber = new Map(
            (state.data?.averageDropoff?.ranking || []).map(item => [Number(item.number), item])
        );
        return `
            <div class="number-grid">
                ${numbers.map(num => {
                    const score = state.aggregationMode === 'average' ? rankingByNumber.get(Number(num)) : null;
                    const title = score
                        ? `Hạng ${score.rank} · Dropoff TB ${fmtDecimal(score.averageDropOffPercent, 1)}% · ${score.supportCount} chuỗi`
                        : '';
                    return `
                    <span title="${title}" class="rounded-md border px-2 py-2 text-center font-mono text-sm font-bold ${selectedClass}">
                        <span class="block">${numText(num)}</span>
                        ${score ? `<span class="mt-0.5 block text-[9px] font-sans font-semibold opacity-70">${fmtDecimal(score.averageDropOffPercent, 1)}%</span>` : ''}
                    </span>
                `; }).join('')}
            </div>
        `;
    }

    function renderSummary() {
        const rows = state.data?.chainRows || [];
        const selectedRows = rows.filter(row => state.selectedKeys.has(row.key));
        const { excludedNumbers, betNumbers } = collectNumbers(rows);
        el('summaryCards').innerHTML = [
            ['Ngày dự đoán', state.data.predictionDate],
            ['Cách tổng hợp', state.aggregationMode === 'average' ? `Dropoff TB · Hold ${state.averageHoldCount}` : 'Chuỗi tự chọn'],
            ['Chuỗi chọn', selectedRows.length],
            ['Số ôm/loại', excludedNumbers.length],
            ['Số đánh', betNumbers.length],
            ['Tier 1/2/3', `${state.data.summary.tier1Count}/${state.data.summary.tier2Count}/${state.data.summary.tier3Count}`]
        ].map(([label, value]) => `
            <div class="rounded-md border border-slate-200 bg-white p-4">
                <div class="text-xs font-semibold uppercase text-slate-500">${label}</div>
                <div class="mt-1 text-2xl font-bold">${value}</div>
            </div>
        `).join('');

        el('excludedGrid').innerHTML = renderNumberGrid(excludedNumbers, 'border-red-200 bg-red-50 text-red-700');
        el('betGrid').innerHTML = renderNumberGrid(betNumbers, 'border-emerald-200 bg-emerald-50 text-emerald-700');
    }

    function renderRows() {
        const rows = state.data?.chainRows || [];
        el('chainsTable').innerHTML = rows.map(row => `
            <tr class="border-t border-slate-100 ${state.selectedKeys.has(row.key) ? 'bg-blue-50/40' : 'bg-white'}">
                <td class="px-3 py-3 align-top">
                    <input type="checkbox" class="chain-check h-4 w-4 rounded border-slate-300 text-blue-700"
                        data-key="${row.key}" ${state.selectedKeys.has(row.key) ? 'checked' : ''}>
                </td>
                <td class="px-3 py-3 align-top">
                    <div class="font-semibold text-slate-900">${displayTitle(row.title, row.key)}</div>
                    <div class="mt-1 text-xs text-slate-500">
                        ${row.isPotential ? 'Chưa hình thành' : 'Đang diễn ra'} · ${fmt(row.streak, 'd')} → ${fmt(row.targetLength, 'd')}
                        · KL ${fmt(row.maxStreak, 'd')} · ${row.numbersCount} số
                    </div>
                    <div class="mt-2 flex flex-wrap gap-1 font-mono text-xs text-slate-600">
                        ${(row.numbers || []).slice(0, 36).map(num => `<span class="rounded bg-slate-900 px-1.5 py-0.5 text-white">${numText(num)}</span>`).join('')}
                        ${(row.numbers || []).length > 36 ? `<span class="text-slate-400">+${row.numbers.length - 36}</span>` : ''}
                    </div>
                </td>
                <td class="px-3 py-3 align-top text-center">
                    <span class="inline-flex max-w-full justify-center rounded-md border px-2 py-1 text-center text-xs font-bold leading-5 ${tierClass(row)}">${row.tierLabel}</span>
                </td>
                <td class="px-3 py-3 align-top text-right whitespace-nowrap">${fmt(row.riskPercent, '%')}</td>
                <td class="px-3 py-3 align-top text-right">${fmtFrequency(row)}</td>
                <td class="px-3 py-3 align-top text-right whitespace-nowrap">${fmt(row.targetAvgGapDays, 'd')}</td>
                <td class="px-3 py-3 align-top text-right whitespace-nowrap">${fmt(row.targetDaysSinceLatestEnd, 'd')}</td>
            </tr>
        `).join('') || '<tr><td colspan="7" class="px-3 py-6 text-center text-slate-500">Không có chuỗi ứng viên.</td></tr>';

        document.querySelectorAll('.chain-check').forEach(input => {
            input.addEventListener('change', () => {
                setAggregationMode('manual');
                if (input.checked) state.selectedKeys.add(input.dataset.key);
                else state.selectedKeys.delete(input.dataset.key);
                renderSummary();
                renderRows();
            });
        });
    }

    function setTier(tierRank, checked) {
        setAggregationMode('manual');
        (state.data?.chainRows || []).forEach(row => {
            if (row.tierRank === tierRank) {
                if (checked) state.selectedKeys.add(row.key);
                else state.selectedKeys.delete(row.key);
            }
        });
        renderSummary();
        renderRows();
    }

    function setAggregationMode(mode) {
        state.aggregationMode = mode === 'manual' ? 'manual' : 'average';
        if (el('aggregationMode')) el('aggregationMode').value = state.aggregationMode;
        el('averageHoldWrap')?.classList.toggle('hidden', state.aggregationMode !== 'average');
    }

    async function loadData() {
        const params = new URLSearchParams({
            includePotential: el('includePotential').checked ? '1' : '0',
            excludeFixedThreeValueGroups: el('excludeFixedThreeValueGroups').checked ? '1' : '0',
            sortBy: el('sortBy')?.value || 'risk'
        });
        setLoading(true);
        showError('');
        try {
            const response = await fetch(`/api/chain-frequency?${params.toString()}`);
            const data = await response.json();
            if (!response.ok || data.error) throw new Error(data.error || 'Không thể tải dữ liệu loại trừ.');
            state.data = data;
            state.selectedKeys = new Set();
            setAggregationMode(el('aggregationMode')?.value || 'average');
            state.averageHoldCount = Number(el('averageHoldCount')?.value || 70);
            el('predictionInfo').textContent = `Dữ liệu tới ${data.basisDate}; Dropoff TB dùng ${data.averageDropoff?.candidatesCount || 0} chuỗi chứa số. Chuyển sang Chuỗi tự chọn để tick Tier hoặc từng dòng trong ${data.candidatesCount} ứng viên ưu tiên.`;
            renderSummary();
            renderRows();
        } catch (error) {
            showError(error.message || 'Không thể tải dữ liệu loại trừ.');
        } finally {
            setLoading(false);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        el('refreshButton')?.addEventListener('click', loadData);
        el('sortBy')?.addEventListener('change', loadData);
        el('aggregationMode')?.addEventListener('change', event => {
            setAggregationMode(event.target.value);
            renderSummary();
        });
        el('averageHoldCount')?.addEventListener('change', event => {
            state.averageHoldCount = Number(event.target.value || 70);
            renderSummary();
        });
        el('includePotential')?.addEventListener('change', loadData);
        el('excludeFixedThreeValueGroups')?.addEventListener('change', loadData);
        el('selectTier1').addEventListener('click', () => setTier(1, true));
        el('selectTier2').addEventListener('click', () => setTier(2, true));
        el('selectTier3').addEventListener('click', () => setTier(3, true));
        el('clearSelection').addEventListener('click', () => {
            setAggregationMode('manual');
            state.selectedKeys.clear();
            renderSummary();
            renderRows();
        });
        loadData();
    });
})();
