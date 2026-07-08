(function () {
    const state = {
        payload: null,
        strategy: '',
        target: null,
        winMultiplier: 84,
        performancePeriod: 'monthly',
        performancePayload: null,
        performanceLoading: false,
        performanceVisible: false
    };
    const DE_BET_PER_NUMBER_K = 1000;
    const MIN_DE_WIN_MULTIPLIER = 70;
    const MAX_DE_WIN_MULTIPLIER = 90;

    const el = id => document.getElementById(id);
    const numText = value => String(value).padStart(2, '0');
    const fmt = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('vi-VN') : '-';
    const fmtK = value => `${Number(value || 0).toLocaleString('vi-VN')}K`;
    const fmtMoney = value => {
        const number = Number(value || 0);
        const sign = number > 0 ? '+' : '';
        return `${sign}${number.toLocaleString('vi-VN')}K`;
    };
    const normalizeWinMultiplier = value => {
        const number = Number(value);
        if (!Number.isFinite(number)) return 84;
        return Math.max(MIN_DE_WIN_MULTIPLIER, Math.min(MAX_DE_WIN_MULTIPLIER, Math.round(number)));
    };
    const asRatio = value => {
        const number = Number(value || 0);
        if (!Number.isFinite(number)) return 0;
        return Math.abs(number) > 1 ? number / 100 : number;
    };
    const fmtRatioPercent = value => `${(asRatio(value) * 100).toLocaleString('vi-VN', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    })}%`;
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

    function describeParitySize(prefix, parity, size, threshold) {
        const parityText = parity === 'le' ? 'lẻ' : parity === 'chan' ? 'chẵn' : parity;
        const sizeText = size === 'nho' ? '<' : size === 'lon' ? '>' : size;
        return `${prefix} ${parityText}${sizeText}${threshold}`;
    }

    function describeFixedDigit(prefix, value) {
        return `${prefix} ${String(value).padStart(1, '0')}`;
    }

    function fallbackCategoryTitle(category = '') {
        const rawCategory = String(category || '');
        const boMatch = rawCategory.match(/^bo_(\d+)$/);
        if (boMatch) return `Bộ ${boMatch[1]}`;

        const dongMatch = rawCategory.match(/^dong_step_(\d+)_(\d+)$/);
        if (dongMatch) return `Đồng cách ${dongMatch[1]} từ ${String(dongMatch[2]).padStart(2, '0')}`;

        const fixedHeadTailMatch = rawCategory.match(/^dau_(\d+)_dit_(le|chan)_(nho|lon)_(\d+)$/);
        if (fixedHeadTailMatch) {
            return `${describeFixedDigit('Đầu', fixedHeadTailMatch[1])} và ${describeParitySize('Đít', fixedHeadTailMatch[2], fixedHeadTailMatch[3], fixedHeadTailMatch[4])}`;
        }

        const fixedTailHeadMatch = rawCategory.match(/^dit_(\d+)_dau_(le|chan)_(nho|lon)_(\d+)$/);
        if (fixedTailHeadMatch) {
            return `${describeFixedDigit('Đít', fixedTailHeadMatch[1])} và ${describeParitySize('Đầu', fixedTailHeadMatch[2], fixedTailHeadMatch[3], fixedTailHeadMatch[4])}`;
        }

        const paritySizeHeadTailMatch = rawCategory.match(/^dau_(le|chan)_(nho|lon)_(\d+)_dit_(le|chan)_(nho|lon)_(\d+)$/);
        if (paritySizeHeadTailMatch) {
            return `${describeParitySize('Đầu', paritySizeHeadTailMatch[1], paritySizeHeadTailMatch[2], paritySizeHeadTailMatch[3])} & ${describeParitySize('Đít', paritySizeHeadTailMatch[4], paritySizeHeadTailMatch[5], paritySizeHeadTailMatch[6])}`;
        }

        const paritySizeTailHeadMatch = rawCategory.match(/^dit_(le|chan)_(nho|lon)_(\d+)_dau_(le|chan)_(nho|lon)_(\d+)$/);
        if (paritySizeTailHeadMatch) {
            return `${describeParitySize('Đít', paritySizeTailHeadMatch[1], paritySizeTailHeadMatch[2], paritySizeTailHeadMatch[3])} & ${describeParitySize('Đầu', paritySizeTailHeadMatch[4], paritySizeTailHeadMatch[5], paritySizeTailHeadMatch[6])}`;
        }

        if (rawCategory.startsWith('tong_moi_')) {
            const suffix = rawCategory.replace('tong_moi_', '').replace(/_/g, ',');
            return suffix.includes(',')
                ? `Tổng Mới - Dạng tổng (${suffix})`
                : `Cùng Tổng ${suffix}`;
        }
        if (rawCategory.startsWith('tong_tt_')) {
            const suffix = rawCategory.replace('tong_tt_', '').replace(/_/g, ',');
            return suffix.includes(',')
                ? `Tổng TT - Dạng tổng (${suffix})`
                : `Tổng TT ${suffix}`;
        }
        if (rawCategory.startsWith('hieu_')) {
            const suffix = rawCategory.replace('hieu_', '').replace(/_/g, ',');
            return suffix.includes(',')
                ? `Hiệu - Dạng hiệu (${suffix})`
                : `Cùng Hiệu ${suffix}`;
        }
        if (rawCategory.startsWith('dau_') || rawCategory.startsWith('dit_')) {
            return toVietnameseToken(rawCategory);
        }
        return toVietnameseToken(rawCategory) || rawCategory;
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
            block2x1SoLe: 'Nhịp 2-1 (AABAA)',
            block2x2SoLe: 'Nhịp 2-2 (AABBAA)',
            block3x2SoLe: 'Nhịp 3-2 (AAABBAAA)',
            block3x3SoLe: 'Nhịp 3-3 (AAABBBAAA)',
            block4x2SoLe: 'Nhịp 4-2 (AAAABBAAAA)',
            block4x3SoLe: 'Nhịp 4-3 (AAAABBBAAAA)'
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

    function normalizeNumber(value) {
        return String(value).padStart(2, '0');
    }

    function buildDerivedExclusionRanking(prediction = {}) {
        const excludedSet = new Set((prediction.excludedNumbers || []).map(normalizeNumber));
        const targetCount = Number(prediction.targetExcluded || prediction.excludedNumbers?.length || state.target || 0);
        const rows = [];
        const seen = new Set();
        const selectedChains = prediction.selectedChains || [];

        selectedChains.forEach((chain, chainIndex) => {
            const numbers = (chain.numbers || [])
                .map(normalizeNumber)
                .filter(number => excludedSet.has(number))
                .sort((a, b) => Number(a) - Number(b));
            numbers.forEach(number => {
                if (seen.has(number) || rows.length >= targetCount) return;
                seen.add(number);
                rows.push({
                    number,
                    rank: rows.length + 1,
                    chainRank: chainIndex + 1,
                    sourceType: 'chain',
                    scorePercent: chain.numberRiskScore || chain.riskPercent || chain.score || 0,
                    supportCount: 1,
                    tier: chain.tier,
                    tierLabel: chain.tierLabel || `Tier ${chain.tier || '-'}`,
                    riskPercent: chain.riskPercent,
                    exposureFrequencyPerYear: chain.exposureFrequencyPerYear,
                    currentCount: chain.currentCount,
                    nextCount: chain.nextCount,
                    contributors: [chain]
                });
            });
        });

        (prediction.excludedNumbers || []).map(normalizeNumber).forEach(number => {
            if (seen.has(number)) return;
            seen.add(number);
            rows.push({
                number,
                rank: rows.length + 1,
                sourceType: 'fallback',
                scorePercent: 0,
                supportCount: 0,
                contributors: []
            });
        });

        return rows.slice(0, Math.max(targetCount, rows.length));
    }

    function getDisplayedRanking(prediction = getPrediction()) {
        if (!prediction) return [];
        if (prediction.ranking && prediction.ranking.length) {
            const excludedSet = new Set((prediction.excludedNumbers || []).map(normalizeNumber));
            return prediction.ranking.map(row => ({
                ...row,
                number: normalizeNumber(row.number),
                isExcluded: excludedSet.has(normalizeNumber(row.number)),
                sourceType: 'number-score'
            }));
        }
        return buildDerivedExclusionRanking(prediction).map(row => ({ ...row, isExcluded: true }));
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
        const rankingByNumber = new Map((ranking || []).map(row => [normalizeNumber(row.number), row]));
        const classes = mode === 'bet'
            ? 'number-chip-bet'
            : 'number-chip-exclude';
        return `
            <div class="number-grid">
                ${(numbers || []).map(value => {
                    const text = numText(value);
                    const rank = rankingByNumber.get(text);
                    const title = rank
                        ? rank.sourceType === 'chain'
                            ? `#${rank.rank} · ${rank.tierLabel || 'Tier'} · ${formatChainTitle(rank.contributors?.[0] || {})}`
                            : `#${rank.rank} · điểm ${rank.scorePercent || 0}% · ${rank.supportCount || 0} chuỗi`
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

        const multiplierSelect = el('winMultiplierSelect');
        if (multiplierSelect) {
            multiplierSelect.innerHTML = Array.from({ length: MAX_DE_WIN_MULTIPLIER - MIN_DE_WIN_MULTIPLIER + 1 }, (_, index) => MIN_DE_WIN_MULTIPLIER + index)
                .map(value => `<option value="${value}" ${value === state.winMultiplier ? 'selected' : ''}>1 ăn ${value}</option>`)
                .join('');
        }

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
        const displayedRanking = getDisplayedRanking(prediction);
        el('excludedGrid').innerHTML = renderNumberGrid(prediction?.excludedNumbers || [], 'exclude', displayedRanking);
        el('betGrid').innerHTML = renderNumberGrid(prediction?.betNumbers || [], 'bet', displayedRanking);
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
        const ranking = getDisplayedRanking(prediction);
        if (!ranking.length) {
            el('rankingList').innerHTML = '<div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Chưa có dữ liệu giải thích từng số cho phương pháp này.</div>';
            return;
        }
        el('rankingList').innerHTML = ranking.slice(0, 100).map(row => `
            <div class="mb-2 rounded-xl border ${row.isExcluded ? 'border-red-100 bg-red-50/40' : 'border-emerald-100 bg-emerald-50/35'} p-3">
                <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2">
                        <span class="w-9 rounded-lg bg-slate-900 py-1 text-center font-mono font-bold text-white">${numText(row.number)}</span>
                        <span class="text-xs font-semibold text-slate-500">#${row.rank}</span>
                        <span class="rounded-full border px-2 py-0.5 text-[10px] font-bold ${row.isExcluded ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}">
                            ${row.isExcluded ? 'Loại' : 'Giữ đánh'}
                        </span>
                    </div>
                    <div class="text-right">
                        <div class="text-sm font-bold text-slate-900">${row.tierLabel ? escapeHtml(row.tierLabel) : `${fmt(row.scorePercent)}%`}</div>
                        <div class="text-[11px] text-slate-500">
                            ${row.sourceType === 'chain'
                                ? `chuỗi #${fmt(row.chainRank || 0)}`
                                : `${fmt(row.supportCount)} chuỗi`}
                        </div>
                    </div>
                </div>
                <div class="mt-2 text-xs leading-5 text-slate-500">
                    ${row.sourceType === 'fallback'
                        ? 'Số này được thêm vào cuối để đủ mức loại, nhưng cache hiện tại chưa còn đủ chuỗi nguồn chi tiết. Hãy chạy lại action để sinh cache giải thích đầy đủ hơn.'
                        : (row.contributors || []).slice(0, 3).map(chain => `
                            <div>
                                <span class="font-semibold text-slate-700">${escapeHtml(formatChainTitle(chain))}</span>
                                <span class="text-slate-400"> · rủi ro ${fmt(chain.riskPercent)}% · tần suất ${fmt(chain.exposureFrequencyPerYear)}/năm · mẫu ${fmt(chain.currentCount)} → ${fmt(chain.nextCount)}</span>
                            </div>
                        `).join('')}
                </div>
            </div>
        `).join('');
    }

    function renderLiveSummary() {
        const rows = summarizeLiveByPreset();
        el('liveSummary').innerHTML = rows.map(item => `
            <div class="rounded-xl border ${Number(item.profitK || 0) >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'} p-4">
                <div class="text-xs font-semibold uppercase text-slate-500">${escapeHtml(item.label || item.id)}</div>
                <div class="mt-1 text-2xl font-bold ${Number(item.profitK || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}">${fmtK(item.profitK)}</div>
                <div class="mt-1 text-xs text-slate-600">${fmt(item.wins || 0)}/${fmt(item.days || 0)} ngày thắng · ROI ${fmtPercent(item.roi || 0)} · 1 ăn ${state.winMultiplier}</div>
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
            const rawResult = row.results?.[key];
            const result = rawResult ? adjustDeResult(rawResult, state.target) : null;
            const pending = row.status !== 'settled' || !result?.resolved;
            const prediction = row.strategies?.[state.strategy]?.holds?.[String(state.target)];
            const profit = result?.profitK || 0;
            const actualNumber = !pending && (result?.actual || row.actualSpecial) !== undefined && (result?.actual || row.actualSpecial) !== null
                ? numText(result?.actual || row.actualSpecial)
                : null;
            const betSet = new Set((prediction?.betNumbers || []).map(num => numText(num)));
            return `
                <div class="grid gap-3 px-4 py-4 md:grid-cols-[150px_1fr_130px] md:items-start ${pending ? 'bg-amber-50/30' : 'bg-white'}">
                    <div>
                        <div class="font-bold text-slate-900">${escapeHtml(row.predictionIsoDate || row.predictionDate || '-')}</div>
                        <div class="mt-1 text-xs text-slate-500">${pending ? 'Đang chờ kết quả' : 'KQ thực tế'}</div>
                        ${actualNumber ? `
                            <span title="${betSet.has(actualNumber) ? 'Kết quả thực tế trùng dàn đánh đã dự đoán' : 'Kết quả thực tế không nằm trong dàn đánh'}"
                                class="mt-2 inline-flex min-w-10 justify-center rounded-lg border px-2.5 py-1 font-mono text-sm font-black ${betSet.has(actualNumber) ? 'number-chip-hit' : 'number-chip-actual'}">
                                ${actualNumber}
                            </span>
                        ` : ''}
                    </div>
                    <div>
                        <div class="text-xs font-semibold uppercase text-slate-500">Số đánh (${prediction?.betNumbers?.length || 0})</div>
                        <div class="mt-2 flex flex-wrap gap-1.5">
                            ${(prediction?.betNumbers || []).slice(0, 45).map(num => {
                                const text = numText(num);
                                const isHit = actualNumber && text === actualNumber;
                                return `<span title="${isHit ? 'Số đánh đã trúng thực tế' : ''}" class="rounded-md border px-2 py-1 font-mono text-xs font-bold ${isHit ? 'number-chip-hit' : 'number-chip-bet'}">${text}</span>`;
                            }).join('')}
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

    function getPeriodLabel(period) {
        return { daily: 'Ngày', weekly: 'Tuần', monthly: 'Tháng' }[period] || period;
    }

    function rowLabel(row, period = state.performancePeriod) {
        if (period === 'daily') return row.date || row.period || '-';
        if (period === 'weekly') return row.week || row.period || '-';
        return row.month || row.period || '-';
    }

    function getDeBetCount(target = state.target) {
        const count = 100 - Number(target || 0);
        return Number.isFinite(count) && count > 0 ? count : 30;
    }

    function getRowWins(row = {}) {
        if (Number.isFinite(Number(row.wins))) return Number(row.wins);
        if (Number.isFinite(Number(row.winDays))) return Number(row.winDays);
        if (Number.isFinite(Number(row.hitDays))) return Number(row.hitDays);
        if (row.hit === true || row.result === 'win') return 1;
        return 0;
    }

    function adjustDeResult(result = {}, target = state.target) {
        const betCount = Number(result.betCount || getDeBetCount(target));
        const hit = Boolean(result.hit || result.result === 'win');
        let stakeK, payoutK, profitK;
        if (Number.isFinite(result.stakeK) && Number.isFinite(result.payoutK)) {
            const scaleFactor = DE_BET_PER_NUMBER_K / 10;
            stakeK = result.stakeK * scaleFactor;
            payoutK = result.payoutK * scaleFactor * (normalizeWinMultiplier(state.winMultiplier) / 84);
            profitK = payoutK - stakeK;
        } else {
            stakeK = betCount * DE_BET_PER_NUMBER_K;
            payoutK = hit ? normalizeWinMultiplier(state.winMultiplier) * DE_BET_PER_NUMBER_K : 0;
            profitK = payoutK - stakeK;
        }
        return {
            ...result,
            hit,
            betCount,
            stakeK,
            payoutK,
            profitK,
            roi: stakeK ? profitK / stakeK : 0
        };
    }

    function adjustDeRow(row = {}, target = state.target) {
        const days = Number(row.days || (row.date || row.period || row.month || row.week ? 1 : 0)) || 0;
        const wins = getRowWins(row);
        const betCount = Number(row.betCount || getDeBetCount(target));
        let stakeK, payoutK, profitK;
        if (Number.isFinite(row.stakeK) && Number.isFinite(row.payoutK)) {
            const scaleFactor = DE_BET_PER_NUMBER_K / 10;
            stakeK = row.stakeK * scaleFactor;
            payoutK = row.payoutK * scaleFactor * (normalizeWinMultiplier(state.winMultiplier) / 84);
            profitK = payoutK - stakeK;
        } else if (Number.isFinite(row.betProfitK) || Number.isFinite(row.profitK)) {
            // Read from compiled performance report
            const scaleFactor = DE_BET_PER_NUMBER_K / 10;
            const rawProfit = Number(row.profitK ?? (row.betProfitK + row.holdProfitK) ?? 0);
            
            // Recompute stake from average betCount or history
            // Wait, for parallel strategy deParallelBlock85Small65, the bet numbers have custom stakes.
            // In the performance report generator, totals.betNumberDays represents the sum of betCounts.
            // But wait, totals.excludedNumberDays is also there.
            // If the row already has stakeK (compiled in performance cache), we use it.
            // Otherwise, estimate it.
            const estimatedBetCount = Number(row.betCount || (row.betNumberDays / days) || getDeBetCount(target));
            stakeK = days * estimatedBetCount * DE_BET_PER_NUMBER_K;
            profitK = rawProfit * scaleFactor;
            payoutK = stakeK + profitK;
        } else {
            stakeK = Number.isFinite(Number(row.stakeK)) && Number(row.stakeK) > 0
                ? days > 1
                    ? days * betCount * DE_BET_PER_NUMBER_K
                    : betCount * DE_BET_PER_NUMBER_K
                : days * betCount * DE_BET_PER_NUMBER_K;
            payoutK = wins * normalizeWinMultiplier(state.winMultiplier) * DE_BET_PER_NUMBER_K;
            profitK = payoutK - stakeK;
        }
        return {
            ...row,
            days,
            wins,
            winDays: wins,
            betCount,
            stakeK,
            payoutK,
            profitK,
            winRate: days ? wins / days : 0,
            roi: stakeK ? profitK / stakeK : 0
        };
    }

    function summarizeLiveByPreset() {
        const presets = state.payload?.config?.presets || [];
        const liveRows = state.payload?.livePredictions?.predictions || [];
        return presets.map(preset => {
            const key = `${preset.strategy}:hold${preset.target}`;
            const item = {
                id: preset.id,
                label: preset.label,
                strategy: preset.strategy,
                target: Number(preset.target),
                days: 0,
                wins: 0,
                losses: 0,
                stakeK: 0,
                payoutK: 0,
                profitK: 0
            };
            liveRows.forEach(row => {
                const result = row.results?.[key];
                if (row.status !== 'settled' || !result?.resolved) return;
                const adjusted = adjustDeResult(result, preset.target);
                item.days += 1;
                item.wins += adjusted.hit ? 1 : 0;
                item.losses += adjusted.hit ? 0 : 1;
                item.stakeK += adjusted.stakeK;
                item.payoutK += adjusted.payoutK;
                item.profitK += adjusted.profitK;
            });
            item.hitRate = item.days ? item.wins / item.days : 0;
            item.winRate = item.hitRate;
            item.roi = item.stakeK ? item.profitK / item.stakeK : 0;
            return item;
        }).filter(item => item.days > 0);
    }

    function getRowProfit(row = {}) {
        return Number(adjustDeRow(row).profitK ?? row.netProfitK ?? 0);
    }

    function renderPeriodTabs() {
        const root = el('performancePeriodTabs');
        if (!root) return;
        if (!state.performanceVisible) {
            root.innerHTML = `
                <button type="button" id="showPerformanceReport"
                    class="rounded-xl bg-white px-5 py-2 text-sm font-black text-indigo-700 shadow transition hover:bg-indigo-50">
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
                    ? 'bg-white text-indigo-700 shadow'
                    : 'text-indigo-100 hover:bg-white/10'}">
                ${getPeriodLabel(period)}
            </button>
        `).join('') + `
            <button type="button" id="hidePerformanceReport"
                class="ml-1 rounded-xl px-4 py-2 text-indigo-100 transition hover:bg-white/10">
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
                            <div title="${escapeHtml(rowLabel(row))}: ${fmtMoney(profit)}"
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
                    <polyline fill="none" stroke="#a78bfa" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" points="${points}" />
                    <circle cx="${lastX}" cy="${lastY}" r="6" fill="#34d399" />
                </svg>
                <div class="flex justify-between px-2 text-xs font-semibold text-slate-300">
                    <span>${escapeHtml(rowLabel(rows[0]))}</span>
                    <span>Tích lũy: ${fmtMoney(cumulative)}</span>
                    <span>${escapeHtml(rowLabel(rows[rows.length - 1]))}</span>
                </div>
            </div>
        `;
    }

    function renderPerformanceReport() {
        renderPeriodTabs();
        const root = el('performanceReport');
        if (!root) return;
        if (!state.performanceVisible) {
            root.innerHTML = `
                <div class="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/60 p-5">
                    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <div class="text-sm font-black text-slate-950">Báo cáo hiệu quả chỉ hiển thị khi người dùng yêu cầu</div>
                            <p class="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                                Đây là thống kê tham khảo/backtest từ đầu năm theo cache đã sinh, không phải nhật ký đánh thực tế. Bấm “Xem thống kê” để mở KPI, biểu đồ và bảng ngày/tuần/tháng.
                            </p>
                        </div>
                        <button type="button" id="showPerformanceReportInline"
                            class="inline-flex h-11 items-center justify-center rounded-xl bg-indigo-600 px-5 text-sm font-black text-white shadow hover:bg-indigo-700">
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
            root.innerHTML = '<div class="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600"><span class="spinner"></span> Đang tải báo cáo hiệu quả...</div>';
            return;
        }
        const section = state.performancePayload?.sections?.de;
        if (!section) {
            const requestedMethod = getResultKey();
            const available = state.performancePayload?.availableMethods?.de || [];
            root.innerHTML = `
                <div class="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
                    <div class="font-black text-slate-950">Chưa có báo cáo hiệu quả cho phương pháp đang chọn</div>
                    <p class="mt-2 leading-6">
                        Bạn đang chọn <span class="font-mono font-bold">${escapeHtml(requestedMethod)}</span>, nhưng cache report hiện chưa có phương pháp này.
                        Hệ thống sẽ không tự đổi sang phương pháp khác để tránh nhầm với kết quả thực tế.
                    </p>
                    <p class="mt-2 leading-6">
                        Phương pháp hiện có trong cache: ${available.length ? available.map(item => `<span class="font-mono font-bold">${escapeHtml(item)}</span>`).join(', ') : 'chưa có'}.
                    </p>
                    <p class="mt-2 leading-6 text-amber-800">
                        Cần chạy backtest/report đa phương pháp để bổ sung cache cho tổ hợp này trước khi hiển thị biểu đồ ngày/tuần/tháng.
                    </p>
                </div>
            `;
            return;
        }
        const summary = adjustDeRow(section.summary || {}, state.target);
        const rows = section.rows || [];
        const positive = Number(summary.profitK || 0) >= 0;
        const cards = [
            ['Số ngày', `${fmt(summary.days || rows.length)} ngày`, 'Tổng số ngày đã kết toán trong năm.'],
            ['Tỷ lệ trúng', fmtRatioPercent(summary.winRate), 'Tỷ lệ ngày kết quả nằm trong dàn đánh.'],
            ['Tỷ lệ ăn', `1 ăn ${state.winMultiplier}`, 'Có thể đổi từ 70 đến 90, hệ thống tự tính lại lãi/lỗ.'],
            ['Profit', fmtMoney(summary.profitK), `Lãi/lỗ ròng theo mỗi số ${fmt(DE_BET_PER_NUMBER_K)}K, trúng ăn ${state.winMultiplier}.`],
            ['ROI', fmtRatioPercent(summary.roi), 'Profit chia cho tổng tiền đánh.'],
            ['Chuỗi thua dài nhất', `${fmt(summary.longestLoss || 0)} ngày`, 'Mốc rủi ro cần chuẩn bị khi áp dụng thực tế.']
        ];
        root.innerHTML = `
            <div class="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div>
                    <div class="mb-4 flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <div class="text-xs font-bold uppercase tracking-wide text-indigo-600">Phương pháp đang đánh giá</div>
                            <div class="mt-1 text-xl font-black text-slate-950">${escapeHtml(section.label || section.methodId)}</div>
                            <p class="mt-2 text-sm leading-6 text-slate-600">${escapeHtml(section.explanation || '')}</p>
                        </div>
                        <div class="rounded-2xl border px-4 py-3 text-center ${section.assessment?.tone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}">
                            <div class="text-xs font-bold uppercase">Đánh giá</div>
                            <div class="mt-1 text-2xl font-black">${escapeHtml(section.assessment?.level || 'Theo dõi')}</div>
                        </div>
                    </div>
                    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
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
                            <th class="px-4 py-3 text-right">Thắng</th>
                            <th class="px-4 py-3 text-right">Tỷ lệ</th>
                            <th class="px-4 py-3 text-right">Tiền đánh</th>
                            <th class="px-4 py-3 text-right">Profit</th>
                            <th class="px-4 py-3 text-right">ROI</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 bg-white">
                        ${rows.slice(-36).reverse().map(row => {
                            const adjusted = adjustDeRow(row, state.target);
                            const winRate = asRatio(adjusted.winRatePercent ?? adjusted.winRate ?? 0);
                            const profit = adjusted.profitK;
                            return `
                                <tr>
                                    <td class="px-4 py-3 font-bold text-slate-900">${escapeHtml(rowLabel(row))}</td>
                                    <td class="px-4 py-3 text-right text-slate-600">${fmt(adjusted.days || 1)}</td>
                                    <td class="px-4 py-3 text-right text-slate-600">${fmt(adjusted.wins ?? adjusted.winDays ?? adjusted.hitDays ?? 0)}</td>
                                    <td class="px-4 py-3 text-right font-semibold text-slate-900">${fmtRatioPercent(winRate)}</td>
                                    <td class="px-4 py-3 text-right text-slate-600">${fmtMoney(-(Math.abs(Number(adjusted.stakeK || 0))))}</td>
                                    <td class="px-4 py-3 text-right font-black ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}">${fmtMoney(profit)}</td>
                                    <td class="px-4 py-3 text-right font-semibold">${fmtRatioPercent(adjusted.roi)}</td>
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
            const method = encodeURIComponent(getResultKey());
            const period = encodeURIComponent(state.performancePeriod);
            const response = await fetch(`/api/performance-report?type=de&period=${period}&method=${method}`, { cache: 'no-store' });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'Không tải được báo cáo hiệu quả.');
            state.performancePayload = data;
        } catch (error) {
            state.performancePayload = { sections: {} };
            console.error('[PerformanceReport] Error:', error);
        } finally {
            state.performanceLoading = false;
            renderPerformanceReport();
        }
    }

    function render() {
        if (!state.payload) return;
        renderControls();
        renderSummary();
        renderChains();
        renderRanking();
        renderPerformanceReport();
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
            state.winMultiplier = normalizeWinMultiplier(state.winMultiplier || data.config?.winMultiplier || 84);
            const profitPreset = data.config?.presets?.[0];
            const defaultStrategy = data.config?.defaultBetStrategy || profitPreset?.strategy || 'chainBlockFirst';
            const defaultTarget = Number(data.config?.defaultBetTarget || profitPreset?.target || 70);
            state.strategy = state.strategy || defaultStrategy;
            if (!data.nextPrediction?.strategies?.[state.strategy]) {
                state.strategy = defaultStrategy || Object.keys(data.nextPrediction?.strategies || {})[0] || 'chainBlockFirst';
            }
            const strategy = getStrategy();
            state.target = Number(state.target || defaultTarget || strategy?.defaultTarget || 70);
            if (!getPrediction(state.strategy, state.target)) {
                state.target = Number(defaultTarget || strategy?.defaultTarget || getTargets()[0] || 70);
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
            if (state.performanceVisible) loadPerformanceReport();
        });
        el('targetSelect')?.addEventListener('change', event => {
            state.target = Number(event.target.value || state.target);
            render();
            if (state.performanceVisible) loadPerformanceReport();
        });
        el('winMultiplierSelect')?.addEventListener('change', event => {
            state.winMultiplier = normalizeWinMultiplier(event.target.value);
            render();
        });
        loadData();
    });
})();
