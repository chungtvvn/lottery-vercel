(function () {
    const state = {
        payload: null,
        strategy: 'chainSmallFirst',
        target: 65
    };

    const el = id => document.getElementById(id);
    const numText = value => String(value).padStart(2, '0');
    const fmt = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('vi-VN') : '-';
    const fmtK = value => `${Number(value || 0).toLocaleString('vi-VN')}K`;
    const fmtPercent = value => {
        const number = Number(value);
        if (!Number.isFinite(number)) return '-';
        return `${(number * (Math.abs(number) <= 1 ? 100 : 1)).toLocaleString('vi-VN', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
        })}%`;
    };
    const escapeHtml = value => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    let statsOptionTitleLookup = null;

    function getStatsOptionTitleLookup() {
        if (statsOptionTitleLookup) return statsOptionTitleLookup;
        statsOptionTitleLookup = new Map();
        try {
            if (typeof STATS_OPTIONS !== 'undefined') {
                Object.values(STATS_OPTIONS || {}).forEach(group => {
                    (group || []).forEach(option => {
                        if (!option || !option.category) return;
                        const key = `${option.category}${option.subcategory ? `:${option.subcategory}` : ''}`;
                        if (!statsOptionTitleLookup.has(key)) statsOptionTitleLookup.set(key, option.text || key);
                    });
                });
            }
        } catch (error) {
            // Stats config is a best-effort display helper; keep fallback formatting below.
        }
        return statsOptionTitleLookup;
    }

    function looksLikeRawStatsTitle(value, key = '') {
        const text = String(value || '').trim();
        if (!text) return true;
        if (key && text === String(key)) return true;
        return /^[A-Za-z0-9_]+(?::[A-Za-z0-9_]+)?$/.test(text);
    }

    function splitStatsKey(key = '') {
        const [category, subcategory = ''] = String(key || '').split(':');
        return { category, subcategory };
    }

    function toVietnameseToken(value = '') {
        const tokenMap = {
            dau: 'Đầu',
            dit: 'Đít',
            tong: 'Tổng',
            moi: 'Mới',
            tt: 'TT',
            hieu: 'Hiệu',
            chan: 'chẵn',
            le: 'lẻ',
            nho: 'nhỏ',
            lon: 'lớn',
            to: 'to',
            hon: 'hơn',
            cach: 'cách'
        };
        return String(value)
            .split('_')
            .filter(Boolean)
            .map(part => tokenMap[part] || part)
            .join(' ');
    }

    function fallbackCategoryTitle(category = '') {
        const boMatch = String(category).match(/^bo_(\d+)$/);
        if (boMatch) return `Bộ ${boMatch[1]}`;

        const dongMatch = String(category).match(/^dong_step_(\d+)_(\d+)$/);
        if (dongMatch) return `Đồng cách ${dongMatch[1]} từ ${String(dongMatch[2]).padStart(2, '0')}`;

        if (String(category).startsWith('tong_moi_')) {
            return `Tổng Mới - ${toVietnameseToken(String(category).replace('tong_moi_', ''))}`;
        }
        if (String(category).startsWith('tong_tt_')) {
            return `Tổng TT - ${toVietnameseToken(String(category).replace('tong_tt_', ''))}`;
        }
        if (String(category).startsWith('hieu_')) {
            return `Hiệu - ${toVietnameseToken(String(category).replace('hieu_', ''))}`;
        }
        if (String(category).startsWith('dau_') || String(category).startsWith('dit_')) {
            return toVietnameseToken(category);
        }
        return toVietnameseToken(category) || category;
    }

    function fallbackSubcategoryTitle(subcategory = '') {
        const labels = {
            veLienTiep: 'Về liên tiếp',
            veSole: 'Về so le',
            veSoleMoi: 'Về so le mới',
            veTheoThuTu: 'Về theo thứ tự',
            veSoLeTheoThuTu: 'Về so le theo thứ tự',
            veSoLeTheoThuTuTien: 'Về so le theo thứ tự TIẾN',
            veSoLeTheoThuTuLui: 'Về so le theo thứ tự LÙI',
            soLeTheoCap: 'So le theo cặp',
            tienLienTiep: 'Tiến liên tiếp',
            tienDeuLienTiep: 'Tiến Đều',
            luiLienTiep: 'Lùi liên tiếp',
            luiDeuLienTiep: 'Lùi Đều',
            tienLuiSoLe: 'Tiến-Lùi So Le',
            luiTienSoLe: 'Lùi-Tiến So Le',
            block2x1SoLe: 'Nhịp 2-1 so le block',
            block2x2SoLe: 'Nhịp 2-2 so le block',
            block3x2SoLe: 'Nhịp 3-2 so le block',
            block3x3SoLe: 'Nhịp 3-3 so le block',
            block4x2SoLe: 'Nhịp 4-2 so le block',
            block4x3SoLe: 'Nhịp 4-3 so le block'
        };
        return labels[subcategory] || subcategory;
    }

    function formatChainTitle(chain = {}) {
        const key = chain.key || chain.title || '';
        const currentTitle = chain.title || key;
        if (!looksLikeRawStatsTitle(currentTitle, key)) return currentTitle;

        const lookupTitle = getStatsOptionTitleLookup().get(key);
        if (lookupTitle && !looksLikeRawStatsTitle(lookupTitle, key)) return lookupTitle;

        const { category, subcategory } = splitStatsKey(key);
        const categoryTitle = fallbackCategoryTitle(category);
        const subcategoryTitle = fallbackSubcategoryTitle(subcategory);
        return subcategoryTitle ? `${categoryTitle} - ${subcategoryTitle}` : categoryTitle;
    }

    function setLoading(isLoading) {
        el('refreshButton').disabled = isLoading;
        el('refreshButton').classList.toggle('opacity-70', isLoading);
        el('spinner').classList.toggle('hidden', !isLoading);
        el('refreshLabel').textContent = isLoading ? 'Đang tải...' : 'Tải lại';
    }

    function showError(message) {
        const box = el('errorBox');
        box.textContent = message || '';
        box.classList.toggle('hidden', !message);
    }

    function getStrategies() {
        const configStrategies = state.payload?.config?.strategies;
        if (Array.isArray(configStrategies) && configStrategies.length) return configStrategies;
        return Object.entries(state.payload?.nextPrediction?.strategies || {}).map(([id, value]) => ({ id, ...value }));
    }

    function getStrategy(strategyId = state.strategy) {
        return getStrategies().find(item => item.id === strategyId)
            || state.payload?.nextPrediction?.strategies?.[strategyId]
            || getStrategies()[0]
            || null;
    }

    function getTargets() {
        const values = state.payload?.config?.targets || [];
        return values.length ? values : [20, 23, 28, 34, 40, 50, 60, 65, 70, 75, 80, 85, 90];
    }

    function getPrediction(strategyId = state.strategy, target = state.target) {
        const strategy = state.payload?.nextPrediction?.strategies?.[strategyId];
        const prediction = strategy?.holds?.[String(target)] || null;
        if (!prediction) return null;
        if (!prediction.ranking && strategy?.ranking) {
            return { ...prediction, ranking: strategy.ranking };
        }
        return prediction;
    }

    function getResultKey(strategy = state.strategy, target = state.target) {
        return `${strategy}:hold${target}`;
    }

    function tierClass(tier) {
        if (tier === 1) return 'border-red-200 bg-red-50 text-red-700';
        if (tier === 2) return 'border-amber-200 bg-amber-50 text-amber-700';
        if (tier === 3) return 'border-indigo-200 bg-indigo-50 text-indigo-700';
        return 'border-slate-200 bg-slate-50 text-slate-600';
    }

    function renderNumberGrid(numbers, mode, ranking = []) {
        const rankingByNumber = new Map((ranking || []).map(row => [String(row.number).padStart(2, '0'), row]));
        const classes = mode === 'bet'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-700';
        return `
            <div class="number-grid">
                ${(numbers || []).map(value => {
                    const text = numText(value);
                    const rank = rankingByNumber.get(text);
                    const title = rank
                        ? `#${rank.rank} · điểm ${rank.scorePercent || 0}% · ${rank.supportCount || 0} chuỗi`
                        : '';
                    return `
                        <span title="${escapeHtml(title)}" class="rounded-lg border px-2 py-2 text-center font-mono text-sm font-bold ${classes}">
                            <span class="block">${text}</span>
                            ${rank ? `<span class="mt-0.5 block text-[9px] font-sans font-semibold opacity-70">#${rank.rank}</span>` : ''}
                        </span>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderControls() {
        const strategies = getStrategies();
        const strategySelect = el('strategySelect');
        strategySelect.innerHTML = strategies.map(strategy => `
            <option value="${escapeHtml(strategy.id)}" ${strategy.id === state.strategy ? 'selected' : ''}>${escapeHtml(strategy.name || strategy.id)}</option>
        `).join('');

        const targetSelect = el('targetSelect');
        targetSelect.innerHTML = getTargets().map(target => `
            <option value="${target}" ${Number(target) === Number(state.target) ? 'selected' : ''}>Loại ${target} · đánh ${100 - Number(target)}</option>
        `).join('');

        const presets = state.payload?.config?.presets || state.payload?.nextPrediction?.presets || [];
        el('presetButtons').innerHTML = presets.map(preset => `
            <button type="button" data-strategy="${escapeHtml(preset.strategy)}" data-target="${Number(preset.target)}"
                class="preset-btn h-10 rounded-xl border px-3 text-xs font-semibold transition ${preset.strategy === state.strategy && Number(preset.target) === Number(state.target)
                    ? 'border-indigo-500 bg-indigo-600 text-white shadow'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-indigo-50'}">
                ${escapeHtml(preset.label)}
            </button>
        `).join('');

        document.querySelectorAll('.preset-btn').forEach(button => {
            button.addEventListener('click', () => {
                state.strategy = button.dataset.strategy;
                state.target = Number(button.dataset.target);
                render();
            });
        });

        const strategy = getStrategy();
        el('strategyDescription').innerHTML = strategy
            ? `<strong>${escapeHtml(strategy.name || strategy.id)}:</strong> ${escapeHtml(strategy.description || '')}`
            : 'Chưa có phương pháp.';
    }

    function renderSummary() {
        const payload = state.payload;
        const next = payload?.nextPrediction || {};
        const prediction = getPrediction();
        const strategy = getStrategy();
        const liveSummary = payload?.livePredictions?.summary?.[presetIdForSelection()];
        const cards = [
            ['Dữ liệu tới', payload?.latestDataDate || '-'],
            ['Ngày dự đoán', next.predictionIsoDate || '-'],
            ['Mốc dữ liệu', `${next.baseline?.startIso || '-'} → ${next.baseline?.cutoffIso || '-'}`],
            ['Ứng viên', fmt(next.summary?.candidatesCount || 0)],
            ['Số loại', fmt(prediction?.excludedNumbers?.length || 0)],
            ['Số đánh', fmt(prediction?.betNumbers?.length || 0)]
        ];
        el('summaryCards').innerHTML = cards.map(([label, value]) => `
            <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div class="text-xs font-semibold uppercase text-slate-500">${escapeHtml(label)}</div>
                <div class="mt-1 text-xl font-bold text-slate-900">${escapeHtml(value)}</div>
            </div>
        `).join('');

        el('predictionInfo').textContent = `${strategy?.name || state.strategy} · loại ${state.target} số, đánh ${100 - state.target} số.`;
        el('excludedGrid').innerHTML = renderNumberGrid(prediction?.excludedNumbers || [], 'exclude', prediction?.ranking || []);
        el('betGrid').innerHTML = renderNumberGrid(prediction?.betNumbers || [], 'bet', prediction?.ranking || []);
    }

    function presetIdForSelection() {
        const presets = state.payload?.config?.presets || [];
        const preset = presets.find(item => item.strategy === state.strategy && Number(item.target) === Number(state.target));
        return preset?.id || getResultKey();
    }

    function renderChains() {
        const prediction = getPrediction();
        const chains = prediction?.selectedChains || [];
        el('chainsTable').innerHTML = chains.map(chain => `
            <tr class="border-t border-slate-100 bg-white">
                <td class="px-4 py-3 align-top">
                    <div class="font-semibold text-slate-900">${escapeHtml(formatChainTitle(chain))}</div>
                    <div class="mt-1 text-xs text-slate-500">
                        ${chain.currentLen || '-'}d → ${chain.targetLen || '-'}d · KL ${chain.recordLen || '-'}d · mẫu ${fmt(chain.currentCount || 0)}
                    </div>
                </td>
                <td class="px-4 py-3 align-top text-center">
                    <span class="inline-flex rounded-md border px-2 py-1 text-xs font-bold ${tierClass(chain.tier)}">${escapeHtml(chain.tierLabel || `Tier ${chain.tier || '-'}`)}</span>
                </td>
                <td class="px-4 py-3 align-top text-right whitespace-nowrap font-semibold">${fmt(chain.riskPercent, '')}%</td>
                <td class="px-4 py-3 align-top text-right whitespace-nowrap">
                    <div class="font-semibold text-slate-900">${fmt(chain.exposureFrequencyPerYear)}/năm</div>
                    <div class="text-[11px] text-slate-500">${fmt(chain.currentCount)} → ${fmt(chain.nextCount)}</div>
                </td>
                <td class="px-4 py-3 align-top text-right whitespace-nowrap">${(chain.numbers || []).length}</td>
                <td class="px-4 py-3 align-top">
                    <div class="compact-number-grid">
                        ${(chain.numbers || []).slice(0, 32).map(num => `<span class="rounded bg-slate-900 px-1.5 py-1 text-center font-mono text-xs text-white">${numText(num)}</span>`).join('')}
                    </div>
                    ${(chain.numbers || []).length > 32 ? `<div class="mt-1 text-xs text-slate-400">+${chain.numbers.length - 32} số</div>` : ''}
                </td>
            </tr>
        `).join('') || '<tr><td colspan="6" class="px-4 py-8 text-center text-slate-500">Không có chuỗi kích hoạt cho phương pháp này.</td></tr>';
    }

    function renderRanking() {
        const prediction = getPrediction();
        const ranking = prediction?.ranking || [];
        if (!ranking.length) {
            el('rankingList').innerHTML = '<div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Phương pháp chuỗi trực tiếp không có bảng điểm từng số.</div>';
            return;
        }
        el('rankingList').innerHTML = ranking.slice(0, 100).map(row => `
            <div class="mb-2 rounded-xl border border-slate-200 bg-white p-3">
                <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2">
                        <span class="w-9 rounded-lg bg-slate-900 py-1 text-center font-mono font-bold text-white">${numText(row.number)}</span>
                        <span class="text-xs font-semibold text-slate-500">#${row.rank}</span>
                    </div>
                    <div class="text-right">
                        <div class="text-sm font-bold text-slate-900">${fmt(row.scorePercent)}%</div>
                        <div class="text-[11px] text-slate-500">${fmt(row.supportCount)} chuỗi</div>
                    </div>
                </div>
                <div class="mt-2 text-xs leading-5 text-slate-500">
                    ${(row.contributors || []).slice(0, 2).map(chain => escapeHtml(formatChainTitle(chain))).join('<br>')}
                </div>
            </div>
        `).join('');
    }

    function renderLiveSummary() {
        const summary = state.payload?.livePredictions?.summary || {};
        const presets = state.payload?.config?.presets || [];
        const rows = presets.map(preset => summary[preset.id]).filter(Boolean);
        el('liveSummary').innerHTML = rows.map(item => `
            <div class="rounded-xl border ${Number(item.profitK || 0) >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'} p-4">
                <div class="text-xs font-semibold uppercase text-slate-500">${escapeHtml(item.label || item.id)}</div>
                <div class="mt-1 text-2xl font-bold ${Number(item.profitK || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}">${fmtK(item.profitK)}</div>
                <div class="mt-1 text-xs text-slate-600">${fmt(item.wins || 0)}/${fmt(item.days || 0)} ngày thắng · ROI ${fmtPercent(item.roi || 0)}</div>
            </div>
        `).join('') || '<div class="col-span-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Chưa có dòng thực tế nào được kết toán.</div>';
    }

    function renderLiveRows() {
        const rows = (state.payload?.livePredictions?.predictions || [])
            .slice()
            .sort((a, b) => String(b.predictionIsoDate).localeCompare(String(a.predictionIsoDate)))
            .slice(0, 30);
        const key = getResultKey();
        el('liveRows').innerHTML = rows.map(row => {
            const result = row.results?.[key];
            const pending = row.status !== 'settled' || !result?.resolved;
            const prediction = row.strategies?.[state.strategy]?.holds?.[String(state.target)];
            const profit = result?.profitK || 0;
            return `
                <div class="grid gap-3 px-4 py-4 md:grid-cols-[150px_1fr_130px] md:items-start ${pending ? 'bg-amber-50/30' : 'bg-white'}">
                    <div>
                        <div class="font-bold text-slate-900">${escapeHtml(row.predictionIsoDate || row.predictionDate || '-')}</div>
                        <div class="mt-1 text-xs text-slate-500">${pending ? 'Đang chờ kết quả' : `KQ ${escapeHtml(result.actual || row.actualSpecial || '-')}`}</div>
                    </div>
                    <div>
                        <div class="text-xs font-semibold uppercase text-slate-500">Số đánh (${prediction?.betNumbers?.length || 0})</div>
                        <div class="mt-2 flex flex-wrap gap-1.5">
                            ${(prediction?.betNumbers || []).slice(0, 45).map(num => `<span class="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 font-mono text-xs font-bold text-emerald-700">${numText(num)}</span>`).join('')}
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-lg font-bold ${pending ? 'text-slate-500' : (profit >= 0 ? 'text-emerald-700' : 'text-red-700')}">
                            ${pending ? 'Chờ...' : fmtK(profit)}
                        </div>
                        <div class="mt-1 text-xs text-slate-500">${pending ? '-' : (result.hit ? 'Đánh thắng' : 'Đánh thua')}</div>
                    </div>
                </div>
            `;
        }).join('') || '<div class="px-4 py-8 text-center text-slate-500">Chưa có nhật ký thực tế.</div>';
    }

    function render() {
        if (!state.payload) return;
        renderControls();
        renderSummary();
        renderChains();
        renderRanking();
        renderLiveSummary();
        renderLiveRows();
    }

    async function loadData() {
        setLoading(true);
        showError('');
        try {
            const response = await fetch('/api/milestone-20y/prediction');
            const data = await response.json();
            if (!response.ok || data.error) throw new Error(data.error || 'Không thể tải dữ liệu Mốc 20 năm.');
            state.payload = data;
            const profitPreset = data.config?.presets?.[0];
            state.strategy = state.strategy || profitPreset?.strategy || 'chainSmallFirst';
            if (!data.nextPrediction?.strategies?.[state.strategy]) {
                state.strategy = profitPreset?.strategy || Object.keys(data.nextPrediction?.strategies || {})[0] || 'chainSmallFirst';
            }
            const strategy = getStrategy();
            state.target = Number(state.target || strategy?.defaultTarget || profitPreset?.target || 65);
            if (!getPrediction(state.strategy, state.target)) {
                state.target = Number(strategy?.defaultTarget || profitPreset?.target || getTargets()[0] || 65);
            }
            render();
        } catch (error) {
            showError(error.message || 'Không thể tải dữ liệu Mốc 20 năm.');
        } finally {
            setLoading(false);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        el('refreshButton')?.addEventListener('click', loadData);
        el('strategySelect')?.addEventListener('change', event => {
            state.strategy = event.target.value;
            const strategy = getStrategy();
            state.target = Number(strategy?.defaultTarget || state.target || 65);
            render();
        });
        el('targetSelect')?.addEventListener('change', event => {
            state.target = Number(event.target.value || state.target);
            render();
        });
        loadData();
    });
})();
