const getTongMoi = (n) => {
    const num = parseInt(n, 10);
    return Math.floor(num / 10) + (num % 10);
};
const getTongTT = (n) => {
    if (n === '00') return 10;
    const tongMoi = getTongMoi(n);
    const tongTT = tongMoi % 10;
    return tongTT === 0 ? 10 : tongTT;
};
const getHieu = (n) => {
    const num = parseInt(n, 10);
    return Math.abs(Math.floor(num / 10) - (num % 10));
};


document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('statsForm');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const minLengthSelect = document.getElementById('minLength');
    const statsTypeSelect = document.getElementById('statsType');
    const resultTitle = document.getElementById('result-title');
    const resultContainer = document.getElementById('result-table-container');
    const quickStatsContainer = document.getElementById('quick-stats-container');
    const currentStreaksSection = document.getElementById('current-streaks-section');
    const currentStreaksContainer = document.getElementById('current-streaks-container');
    const currentStreaksTitle = document.getElementById('current-streaks-title');
    const updateDataButton = document.getElementById('updateDataButton');
    const lastUpdateDateSpan = document.getElementById('lastUpdateDate');

    const parseDate = (dateString) => {
        if (!dateString) return null;
        const [day, month, year] = dateString.split('/');
        return new Date(year, month - 1, day);
    };

    const populateMinLength = (mode = 'default') => {
        // mode có thể là:
        // - 'default' (cho "mặc định", 2-20)
        // - 'sole' (cho "so le" cũ, 3,5,7...)
        // - 'tienLuiSoLe' (cho yêu cầu mới, 4-30)

        const currentValue = minLengthSelect.value;
        minLengthSelect.innerHTML = '';
        minLengthSelect.add(new Option('Tất cả', 'all'));

        if (mode === 'tienLuiSoLe') {
            // Yêu cầu mới: 4 đến 30
            for (let i = 4; i <= 30; i++) {
                minLengthSelect.add(new Option(i, i));
            }
        } else if (mode === 'sole') {
            // Logic "so le" cũ: 3, 5, 7... 19
            for (let i = 3; i <= 19; i += 2) {
                minLengthSelect.add(new Option(i, i));
            }
        } else {
            // Logic "mặc định" cũ: 2-20
            for (let i = 2; i <= 20; i++) {
                minLengthSelect.add(new Option(i, i));
            }
        }

        // Cố gắng giữ lại giá trị cũ nếu nó vẫn tồn tại trong danh sách mới
        if ([...minLengthSelect.options].some(opt => opt.value === currentValue)) {
            minLengthSelect.value = currentValue;
        }
    };

    let currentConfig = {
        GAP_STRATEGY: 'COMBINED',
        GAP_BUFFER_PERCENT: 0
    };
    let globalActiveStreaksHistory = [];
    let currentSelectedHistoryDate = null;
    let recentLotteryData = [];

    const fetchConfig = async () => {
        try {
            const response = await fetch(`${BASE_URL}/api/config`);
            if (response.ok) {
                const data = await response.json();
                currentConfig = { ...currentConfig, ...data };
                console.log('Config loaded:', currentConfig);
            }
        } catch (error) {
            console.error('Error fetching config:', error);
        }
    };

    const initializePage = async () => {
        await fetchConfig(); // Load config first

        for (const groupName in STATS_OPTIONS) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = groupName;
            STATS_OPTIONS[groupName].forEach(option => {
                const opt = document.createElement('option');
                opt.textContent = option.text;
                opt.value = `${option.category}${option.subcategory ? ':' + option.subcategory : ''}`;
                optgroup.appendChild(opt);
            });
            statsTypeSelect.appendChild(optgroup);
        }

        // Khởi tạo Tom Select cho Loại thống kê
        const tomSelectInstance = new TomSelect("#statsType", {
            create: false,
            sortField: false, // Giữ nguyên thứ tự ban đầu của optgroup
            searchField: ['text'], // Cho phép search theo text của option
            placeholder: "Gõ để tìm kiếm loại thống kê... (VD: Đầu lẻ, Dạng)",
            maxOptions: 100, // Tối ưu performance: Giới hạn render 100 lựa chọn phù hợp nhất
            onFocus: function () {
                // Lưu lại item hiện tại và clear đi để ô search hoàn toàn trống 100% khi bắt đầu gõ
                this._backupValue = this.getValue();
                this.clear(true); // Tham số true để clear silently (không kích hoạt event change)
            },
            onBlur: function () {
                // Nếu click bên ngoài mà chưa chọn thêm option nào (value rỗng) -> khôi phục lại giá trị cũ
                if (this.getValue() === '' && this._backupValue) {
                    this.setValue(this._backupValue, true);
                }
            }
        });

        // [SỬA LOGIC TẠI ĐÂY]
        // Lắng nghe sự kiện change từ Tom Select (nó bind trực tiếp vào thẻ select gốc nhưng nên gọi qua tomSelect nếu cần thiết. Tuy sự kiện native event of 'change' ở element vẫn hoạt động.)
        statsTypeSelect.addEventListener('change', (event) => {
            const selectedValue = event.target.value;

            // 1. Ưu tiên kiểm tra 'tienLuiSoLe' / 'luiTienSoLe' TRƯỚC
            if (selectedValue === 'tienLuiSoLe' || selectedValue === 'luiTienSoLe' || selectedValue.includes('tienLuiSoLe') || selectedValue.includes('luiTienSoLe')) {
                populateMinLength('tienLuiSoLe'); // Chế độ mới (4-30)
            }
            // 2. Nếu không phải, thì mới kiểm tra "so le" chung
            else if (selectedValue.toLowerCase().includes('sole')) {
                populateMinLength('sole'); // Chế độ "so le" cũ (3, 5, 7...)
            }
            // 3. Còn lại là mặc định
            else {
                populateMinLength('default'); // Chế độ mặc định (2-20)
            }
        });

        // [MỚI] Tự động tải kết quả xổ số 7 ngày gần nhất
        fetchRecentResults();

        // Khởi tạo lần đầu với chế độ 'default'
        populateMinLength('default');

        const today = new Date();
        endDateInput.valueAsDate = today;
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - 360);
        startDateInput.valueAsDate = pastDate;

        // Remove `fetchQuickStats();` from here because we will call `fetchQuickStats` inside `fetchRecentResults` if needed? No, `fetchQuickStats` is standalone. 
        fetchQuickStats();
        fetchLastUpdateDate();
        fetchStreakExclusion();
    };

    // --- NO CLIENT-SIDE CACHING ---
    // Tất cả API calls đều fetch trực tiếp, không cache localStorage
    const fetchJSON = async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
    };
    // ---------------------------------

    const fetchRecentResults = async () => {
        try {
            const [recentResData, historyResData] = await Promise.all([
                fetchJSON(`${BASE_URL}/api/recent-results?limit=30`),
                fetchJSON(`${BASE_URL}/api/statistics/quick-stats-history`)
            ]);

            recentLotteryData = recentResData;
            globalActiveStreaksHistory = historyResData;

            if (globalActiveStreaksHistory && globalActiveStreaksHistory.length > 0) {
                currentSelectedHistoryDate = globalActiveStreaksHistory[0].date;
            }

            renderRecentResults();
            renderSelectedHistoryDate();
        } catch (error) {
            console.error('Lỗi khi tải kết quả hoặc lịch sử gần đây:', error);
            const skeleton = document.getElementById('recent-results-skeleton');
            if (skeleton) skeleton.classList.add('hidden');
            
            let container = document.getElementById('recent-results-selector');
            if (!container) {
                container = document.createElement('div');
                container.id = 'recent-results-selector';
                container.className = 'mb-6 text-red-500 bg-red-50 p-4 rounded-lg shadow';
                const currentStreaksSec = document.getElementById('current-streaks-section');
                if (currentStreaksSec) currentStreaksSec.parentNode.insertBefore(container, currentStreaksSec);
            }
            container.innerHTML = '<p><i class="bi bi-exclamation-triangle mr-2"></i>Không thể tải dữ liệu mới. Lỗi mạng hoặc máy chủ đang quá tải. Hãy thử tải lại trang hoặc Cập nhật dữ liệu thủ công.</p>';
        }
    };

    // Helper: subtract 1 day from DD/MM/YYYY and return DD/MM/YYYY
    const getPrevDay = (ddmmyyyy) => {
        const [d, m, y] = ddmmyyyy.split('/').map(Number);
        const dt = new Date(y, m - 1, d);
        dt.setDate(dt.getDate() - 1);
        return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
    };

    const getNextDay = (ddmmyyyy) => {
        if (!ddmmyyyy || !ddmmyyyy.includes('/')) return '';
        const [d, m, y] = ddmmyyyy.split('/').map(Number);
        const dt = new Date(y, m - 1, d);
        dt.setDate(dt.getDate() + 1);
        return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
    };

    const normalizeDisplayDate = (value) => {
        const str = String(value || '').trim();
        if (!str) return '';
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
        const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
        const parsed = new Date(str);
        if (Number.isNaN(parsed.getTime())) return str;
        return `${String(parsed.getDate()).padStart(2, '0')}/${String(parsed.getMonth() + 1).padStart(2, '0')}/${parsed.getFullYear()}`;
    };

    const formatMetric = (value, suffix = '') => {
        if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '-';
        return `${Number(value).toLocaleString('vi-VN')}${suffix}`;
    };

    const getStreakRecordLength = (streak) => {
        const longestLength = streak && Array.isArray(streak.longest) && streak.longest[0]
            ? streak.longest[0].length
            : null;
        const candidates = [
            streak && streak.originalRecord,
            longestLength,
            streak && streak.reliability && streak.reliability.maxLength,
            streak && streak.recordLength,
            streak && streak.computedMaxStreak
        ];
        const value = candidates.find(candidate => Number.isFinite(Number(candidate)) && Number(candidate) > 0);
        return value ? Number(value) : 0;
    };

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    let activePredictionTooltipTarget = null;

    const getPredictionTooltipElement = () => {
        let tooltip = document.getElementById('prediction-column-tooltip');
        if (tooltip) return tooltip;

        tooltip = document.createElement('div');
        tooltip.id = 'prediction-column-tooltip';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.style.cssText = [
            'position:fixed',
            'z-index:99999',
            'display:none',
            'max-width:320px',
            'padding:10px 12px',
            'border-radius:8px',
            'background:#111827',
            'color:#fff',
            'font-size:12px',
            'line-height:1.45',
            'box-shadow:0 12px 28px rgba(15,23,42,0.28)',
            'pointer-events:none',
            'opacity:0',
            'transform:translateY(4px)',
            'transition:opacity 120ms ease, transform 120ms ease'
        ].join(';');
        document.body.appendChild(tooltip);
        return tooltip;
    };

    const positionPredictionTooltip = (target, tooltip) => {
        const rect = target.getBoundingClientRect();
        tooltip.style.display = 'block';
        tooltip.style.left = '0px';
        tooltip.style.top = '0px';

        const tooltipRect = tooltip.getBoundingClientRect();
        const margin = 10;
        let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - tooltipRect.width - 8));

        let top = rect.bottom + margin;
        if (top + tooltipRect.height > window.innerHeight - 8) {
            top = Math.max(8, rect.top - tooltipRect.height - margin);
        }

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    };

    const showPredictionTooltip = (target) => {
        const text = target && target.getAttribute('data-tooltip');
        if (!text) return;

        activePredictionTooltipTarget = target;
        const tooltip = getPredictionTooltipElement();
        tooltip.textContent = text;
        positionPredictionTooltip(target, tooltip);
        requestAnimationFrame(() => {
            tooltip.style.opacity = '1';
            tooltip.style.transform = 'translateY(0)';
        });
    };

    const hidePredictionTooltip = () => {
        activePredictionTooltipTarget = null;
        const tooltip = document.getElementById('prediction-column-tooltip');
        if (!tooltip) return;
        tooltip.style.opacity = '0';
        tooltip.style.transform = 'translateY(4px)';
        window.setTimeout(() => {
            if (!activePredictionTooltipTarget) tooltip.style.display = 'none';
        }, 130);
    };

    const setupPredictionTooltips = () => {
        if (window.__predictionTooltipsReady) return;
        window.__predictionTooltipsReady = true;

        document.addEventListener('pointerover', (event) => {
            const target = event.target.closest('[data-tooltip]');
            if (!target || !target.classList.contains('prediction-header-tooltip')) return;
            showPredictionTooltip(target);
        });

        document.addEventListener('pointerout', (event) => {
            const target = event.target.closest('[data-tooltip]');
            if (!target || !target.classList.contains('prediction-header-tooltip')) return;
            const related = event.relatedTarget;
            if (related && target.contains(related)) return;
            hidePredictionTooltip();
        });

        document.addEventListener('focusin', (event) => {
            const target = event.target.closest('[data-tooltip]');
            if (!target || !target.classList.contains('prediction-header-tooltip')) return;
            showPredictionTooltip(target);
        });

        document.addEventListener('focusout', (event) => {
            const target = event.target.closest('[data-tooltip]');
            if (!target || !target.classList.contains('prediction-header-tooltip')) return;
            hidePredictionTooltip();
        });

        window.addEventListener('scroll', hidePredictionTooltip, true);
        window.addEventListener('resize', hidePredictionTooltip);
    };

    const renderHeaderTooltip = (label, tooltip, alignClass = '') => `
        <th class="px-3 py-2 ${alignClass}">
            <span class="prediction-header-tooltip inline-flex items-center gap-1 rounded px-1 py-0.5 normal-case cursor-help hover:bg-amber-100 focus:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300 ${alignClass.includes('text-center') ? 'justify-center' : ''}"
                data-tooltip="${escapeHtml(tooltip)}"
                tabindex="0"
                aria-label="${escapeHtml(`${label}: ${tooltip}`)}">
                <span>${label}</span>
                <i class="bi bi-question-circle text-[10px] text-gray-400"></i>
            </span>
        </th>
    `;

    setupPredictionTooltips();

    const reliabilityBadgeClass = (score) => {
        const value = Number(score || 0);
        if (value >= 75) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
        if (value >= 60) return 'bg-blue-100 text-blue-800 border-blue-200';
        if (value >= 45) return 'bg-amber-100 text-amber-800 border-amber-200';
        return 'bg-red-100 text-red-800 border-red-200';
    };

    const reliabilityLabel = (score) => {
        const value = Number(score || 0);
        if (value >= 75) return 'cao';
        if (value >= 60) return 'khá';
        if (value >= 45) return 'vừa';
        return 'mỏng';
    };

    const wilsonLowerBound = (successes, total, z = 1.64) => {
        if (!total || total <= 0) return 0;
        const phat = successes / total;
        const z2 = z * z;
        const denominator = 1 + z2 / total;
        const centre = phat + z2 / (2 * total);
        const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total);
        return Math.max(0, (centre - margin) / denominator);
    };

    const sampleScore = (sampleSize) => {
        const sample = Math.max(0, Number(sampleSize) || 0);
        return Math.max(0, Math.min(1, Math.log10(sample + 1) / Math.log10(100)));
    };

    const exclusionPriorityScore = (item) => {
        const reliability = (item.streak && item.streak.reliability) || {};
        const rate = Number(item.exclusionRate ?? item.dropOffRate ?? 0);
        const lower = Number(item.exclusionLowerBound ?? reliability.lowerBound ?? 0);
        const sample = sampleScore(item.exclusionSampleSize || item.currentCount || reliability.sampleSize || 0);
        const rawTrust = Number(reliability.score);
        const trust = Number.isFinite(rawTrust)
            ? Math.max(0, Math.min(1, rawTrust / 100))
            : Math.max(0, Math.min(1, lower * 0.72 + sample * 0.28));
        return Math.round((rate * 0.55 + lower * 0.25 + trust * 0.15 + sample * 0.05) * 1000) / 10;
    };

    const renderRecentResults = () => {
        let container = document.getElementById('recent-results-selector');

        if (!container) {
            container = document.createElement('div');
            container.id = 'recent-results-selector';
            container.className = 'mb-6';
            const currentStreaksSec = document.getElementById('current-streaks-section');
            if (currentStreaksSec) {
                currentStreaksSec.parentNode.insertBefore(container, currentStreaksSec);
            } else {
                return;
            }
        }

        if (!globalActiveStreaksHistory || globalActiveStreaksHistory.length === 0) {
            container.innerHTML = '<p class="text-gray-500">Không có dữ liệu lịch sử chuỗi.</p>';
            return;
        }

        // Build lookup: DD/MM/YYYY -> special value from recent-results
        const specialLookup = {};
        if (recentLotteryData && recentLotteryData.length > 0) {
            recentLotteryData.forEach(item => {
                specialLookup[normalizeDisplayDate(item.date)] = item.special;
            });
        }

        let html = `
            <div class="bg-white rounded-lg shadow-md p-5 flex flex-col border-t-4 border-indigo-500 animate-fade-in-up">
                <h4 class="text-lg font-bold text-gray-800 mb-4 flex items-center"><i class="bi bi-calendar-range text-indigo-500 me-2"></i> Lịch sử Chuỗi Đang Diễn Ra (${globalActiveStreaksHistory.length} Ngày)</h4>
                <p class="text-xs text-gray-500 mb-3">Chọn ngày để xem chuỗi đang diễn ra tính đến ngày đó (dùng để dự đoán cho ngày hôm sau)</p>
                <div class="flex gap-3 overflow-x-auto py-2 px-1 justify-start items-center">
        `;

        // History is sorted newest-first, reverse to show oldest-left newest-right
        const displayData = [...globalActiveStreaksHistory].reverse();

        displayData.forEach(item => {
            const historyDate = item.date; // The actual result date from the API
            const specialValue = specialLookup[historyDate] !== undefined ? specialLookup[historyDate] : '??';
            const streakCount = item.streaks ? item.streaks.length : 0;

            const isActive = currentSelectedHistoryDate === historyDate;
            const activeClasses = isActive ? 'border-2 border-red-500 bg-red-50 shadow-md' : 'border border-gray-200 bg-white hover:bg-gray-50 hover:shadow-sm opacity-80 cursor-pointer';

            html += `
                <div onclick="window.selectHistoryDate('${historyDate}')" class="transition-all duration-200 rounded-xl p-3 flex flex-col items-center min-w-[80px] ${activeClasses}">
                    <span class="text-2xl font-bold ${isActive ? 'text-red-600' : 'text-gray-600'} mb-1">${specialValue}</span>
                    <span class="text-xs ${isActive ? 'text-red-500 font-semibold' : 'text-gray-500'} whitespace-nowrap">${historyDate}</span>
                    <span class="text-[10px] ${isActive ? 'text-red-400' : 'text-gray-400'} mt-0.5">${streakCount} chuỗi</span>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;

        const skeleton = document.getElementById('recent-results-skeleton');
        if (skeleton) skeleton.classList.add('hidden');

        container.innerHTML = html;
        if (!document.getElementById('result-table-container').hasAttribute('data-loaded')) {
            resultContainer.innerHTML = '<p class="text-gray-500">Vui lòng chọn loại thống kê và nhấn nút "Thống Kê" để xem kết quả.</p>';
            document.getElementById('result-table-container').setAttribute('data-loaded', 'true');
        }
    };

    window.selectHistoryDate = (dateStr) => {
        currentSelectedHistoryDate = dateStr;
        renderRecentResults();
        renderSelectedHistoryDate();
    };

    const renderSelectedHistoryDate = () => {
        if (!currentSelectedHistoryDate || globalActiveStreaksHistory.length === 0) return;

        const historyForDate = globalActiveStreaksHistory.find(h => h.date === currentSelectedHistoryDate);
        const displayDate = currentSelectedHistoryDate;

        if (historyForDate) {
            const streaksByLength = historyForDate.streaks.reduce((acc, streak) => {
                if (!acc[streak.length]) { acc[streak.length] = []; }
                acc[streak.length].push(streak);
                return acc;
            }, {});

            renderCurrentStreaks(streaksByLength, historyForDate.streaks.length, window.GLOBAL_TOTAL_YEARS || 20.41, displayDate);
        } else {
            const container = document.getElementById('current-streaks-container');
            if (container) {
                container.innerHTML = '<p class="text-gray-500 p-4">Không có chuỗi nào cho ngày này.</p>';
                currentStreaksTitle.innerHTML = `Chuỗi Đang Diễn Ra (${displayDate}) <span class="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 bg-red-600 rounded-full">0</span>`;
                currentStreaksSection.classList.remove('d-none');
            }
        }
    };

    const fetchLastUpdateDate = async () => {
        try {
            const response = await fetch(`${BASE_URL}/api/latest-date`);
            const data = await response.json();
            if (data.latestDate) {
                lastUpdateDateSpan.textContent = data.latestDate;
            }
        } catch (error) {
            console.error('Lỗi khi lấy ngày cập nhật cuối:', error);
            lastUpdateDateSpan.textContent = 'Không xác định';
        }
    };

    const handleDataUpdate = async () => {
        const btn = updateDataButton;
        btn.disabled = true;
        const steps = [
            { step: 'data', label: 'Đang tải dữ liệu...' },
            { step: 'stats_number', label: 'Tính toán thống kê số...' },
            { step: 'stats_head_tail', label: 'Tính toán thống kê đầu-đít...' },
            { step: 'stats_sum_diff', label: 'Tính toán thống kê tổng-hiệu...' },
            { step: 'stats_quick', label: 'Nạp bộ nhớ đệm nhanh...' }
        ];
        try {
            for (const { step, label } of steps) {
                btn.innerHTML = `<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> ${label}`;
                const response = await fetch(`${BASE_URL}/api/update-data?step=${step}`, { method: 'POST' });
                
                const text = await response.text();
                let result;
                try {
                    result = JSON.parse(text);
                } catch(e) {
                    if (text.includes('An error occurred with this application') || response.status === 504) {
                        throw new Error(`Máy chủ Vercel quá tải khi xử lý bước [${label}]. Dữ liệu có quá nhiều hoặc bị timeout 10s. Vui lòng thử lại sau!`);
                    }
                    throw new Error(`Dữ liệu không hợp lệ từ server ở bước [${label}]: ${text.substring(0, 50)}`);
                }

                if (!response.ok || !result.success) {
                    throw new Error(result.message || 'Lỗi không xác định');
                }
                console.log(`[Update] ${step}: ${result.message}`);
            }
            alert('Cập nhật hoàn tất! Trang sẽ tải lại.');
            // Xóa toàn bộ cache localStorage để Client nhận diện data mới
            Object.keys(localStorage).forEach(k => { if(k.startsWith('ls_cache_')) localStorage.removeItem(k); });
            window.location.reload();
        } catch (error) {
            alert('Cập nhật thất bại: ' + error.message);
            console.error('Lỗi khi cập nhật dữ liệu:', error);
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i class="bi bi-arrow-clockwise mr-2"></i>Cập nhật dữ liệu`;
        }
    };

    updateDataButton.addEventListener('click', handleDataUpdate);

    // === UNIFIED PRIORITY EXCLUSION RENDERING ===
    const EXCLUSION_PRIORITY_STORAGE_KEY = 'streak-exclusion-priority-threshold';
    const LOW_FREQUENCY_EXCLUSION_STORAGE_KEY = 'streak-include-low-frequency-potential';
    const LOW_FREQUENCY_EXCLUSION_LIMIT_PER_YEAR = 1;
    const legacyDropOffThreshold = parseFloat(localStorage.getItem('streak-dropoff-threshold') || '');
    let selectedExclusionPriorityThreshold = parseFloat(
        localStorage.getItem(EXCLUSION_PRIORITY_STORAGE_KEY) ||
        (Number.isFinite(legacyDropOffThreshold) ? String(Math.round(legacyDropOffThreshold * 100)) : '85')
    );
    if (!Number.isFinite(selectedExclusionPriorityThreshold)) selectedExclusionPriorityThreshold = 85;
    let includeLowFrequencyPotentialExclusions = localStorage.getItem(LOW_FREQUENCY_EXCLUSION_STORAGE_KEY) === '1';
    let latestPredictionItemsForExclusion = [];
    let latestLowFrequencyItemsForExclusion = [];
    let latestPredictionDateForExclusion = '';
    let latestActualPredictionNumber = '';
    let latestActualPredictionDate = '';

    const normalizePredictionNumber = (value) => {
        const num = parseInt(value, 10);
        if (!Number.isFinite(num) || num < 0 || num > 99) return null;
        return String(num).padStart(2, '0');
    };

    const getPredictionNumbers = (item) => {
        const rawNumbers = item && item.streak && Array.isArray(item.streak.patternNumbers)
            ? item.streak.patternNumbers
            : [];
        return Array.from(new Set(rawNumbers
            .map(normalizePredictionNumber)
            .filter(Boolean)))
            .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    };

    const getPredictionRiskRate = (item) => {
        if (!item) return 0;
        if (item.streak && item.streak.isPotential) return Number(item.nonFormationRate || 0);
        return Number(item.dropOffRate || item.exclusionRate || 0);
    };

    const getPredictionRiskLabel = (item) => {
        const riskRate = getPredictionRiskRate(item);
        return item && item.streak && item.streak.isPotential
            ? `Không HT ${(riskRate * 100).toFixed(0)}%`
            : `Gãy ${(riskRate * 100).toFixed(0)}%`;
    };

    const getPredictionPriority = (item) => {
        const priority = Number(item && item.exclusionPriority);
        return Number.isFinite(priority) ? priority : 0;
    };

    const getPredictionSample = (item) => Number((item && (item.formationBaseCount || item.currentCount)) || 0);

    const isPrimaryExclusionItem = (item) => {
        return getPredictionSample(item) > 0
            && getPredictionPriority(item) >= selectedExclusionPriorityThreshold
            && getPredictionNumbers(item).length > 0;
    };

    const getPredictionFrequencyPerYear = (item) => {
        if (!item) return Infinity;
        const directFrequency = Number(item.frequencyPerYear);
        if (Number.isFinite(directFrequency)) return directFrequency;

        const potentialFrequency = Number(item.formFrequencyPerYear);
        if (item.streak && item.streak.isPotential && Number.isFinite(potentialFrequency)) {
            return potentialFrequency;
        }

        const totalYears = Number(item.totalYearsForFrequency || window.GLOBAL_TOTAL_YEARS || 20.41);
        const count = Number(item.currentCount || item.formationCount || 0);
        return totalYears > 0 ? count / totalYears : Infinity;
    };

    const isLowFrequencyExclusionItem = (item) => {
        const frequency = getPredictionFrequencyPerYear(item);
        return Number.isFinite(frequency)
            && frequency < LOW_FREQUENCY_EXCLUSION_LIMIT_PER_YEAR
            && getPredictionNumbers(item).length > 0;
    };

    const isActivePredictionExclusionItem = (item) => {
        return isPrimaryExclusionItem(item)
            || (includeLowFrequencyPotentialExclusions && isLowFrequencyExclusionItem(item));
    };

    const getActualPredictionNumber = (displayDate) => {
        const targetDate = normalizeDisplayDate(displayDate);
        if (!targetDate || !Array.isArray(recentLotteryData)) return '';
        const match = recentLotteryData.find(item => normalizeDisplayDate(item.date) === targetDate);
        return match ? (normalizePredictionNumber(match.special) || '') : '';
    };

    const fetchStreakExclusion = () => {
        const section = document.getElementById('streak-exclusion-section');
        const container = document.getElementById('streak-exclusion-container');
        const countSpan = document.getElementById('streak-exclusion-count');
        const titleSpan = document.getElementById('streak-exclusion-title');
        if (!section || !container) return;

        try {
            const sourceItems = Array.isArray(latestPredictionItemsForExclusion)
                ? latestPredictionItemsForExclusion
                : [];
            const lowFrequencySourceItems = Array.isArray(latestLowFrequencyItemsForExclusion) && latestLowFrequencyItemsForExclusion.length > 0
                ? latestLowFrequencyItemsForExclusion
                : sourceItems;
            if (sourceItems.length === 0 && lowFrequencySourceItems.length === 0) {
                section.style.display = 'none';
                return;
            }

            const activePredictionItems = sourceItems.filter(isPrimaryExclusionItem);
            const lowFrequencyCandidateItems = lowFrequencySourceItems.filter(isLowFrequencyExclusionItem);
            const lowFrequencyAdditionalItems = includeLowFrequencyPotentialExclusions
                ? lowFrequencyCandidateItems
                : [];

            const excludedSourceByNumber = new Map();
            const addExclusionSource = (item, itemIndex, sourceType) => {
                getPredictionNumbers(item).forEach(numStr => {
                    if (!excludedSourceByNumber.has(numStr)) {
                        excludedSourceByNumber.set(numStr, {
                            numStr,
                            sourceRank: item.summaryRank || itemIndex + 1,
                            title: item.streak.description,
                            riskLabel: getPredictionRiskLabel(item),
                            priority: item.exclusionPriority || 0,
                            sourceType,
                            frequencyPerYear: getPredictionFrequencyPerYear(item)
                        });
                    }
                });
            };
            activePredictionItems.forEach((item, itemIndex) => addExclusionSource(item, itemIndex, 'priority'));
            lowFrequencyAdditionalItems.forEach((item, itemIndex) => addExclusionSource(item, itemIndex, 'lowFrequency'));

            const excludedEntries = Array.from(excludedSourceByNumber.values())
                .sort((a, b) => a.sourceRank - b.sourceRank || parseInt(a.numStr, 10) - parseInt(b.numStr, 10));
            const excludedNumbers = excludedEntries.map(entry => entry.numStr);
            const displayBetNumbers = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'))
                .filter(n => !excludedNumbers.includes(n));

            if (displayBetNumbers.length === 0 && excludedNumbers.length === 0) {
                section.style.display = 'none';
                return;
            }

            section.style.display = '';
            if (titleSpan) {
                titleSpan.textContent = 'Số Đánh & Loại Trừ (theo Tổng Hợp Dự Đoán)';
            }
            if (countSpan) {
                countSpan.textContent = `(${displayBetNumbers.length} đánh | ${excludedNumbers.length} loại trừ)`;
            }

            const betSet = new Set(displayBetNumbers);
            const excludedSet = new Set(excludedNumbers);
            const actualNumber = latestActualPredictionNumber;
            const actualExcludedEntry = actualNumber ? excludedSourceByNumber.get(actualNumber) : null;
            const lowFrequencyAddedCount = excludedEntries.filter(entry => entry.sourceType === 'lowFrequency').length;

            let gridHtml = `
                <div class="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div class="text-sm text-gray-600">
                        <i class="bi bi-info-circle me-1"></i>Số <span class="text-teal-700 font-bold">XANH</span> = đánh, <span class="text-red-600 font-bold">ĐỎ</span> = loại theo ưu tiên, <span class="text-amber-700 font-bold">VÀNG</span> = loại thêm từ chuỗi tần suất &lt; 1/năm
                        <div class="text-xs text-gray-500 mt-1">${activePredictionItems.length} chuỗi đạt điểm ưu tiên loại ≥ ${selectedExclusionPriorityThreshold.toFixed(0)}${includeLowFrequencyPotentialExclusions ? `, thêm ${lowFrequencyAddedCount} số từ ${lowFrequencyAdditionalItems.length} chuỗi tần suất &lt; 1/năm` : `, có ${lowFrequencyCandidateItems.length} chuỗi tần suất &lt; 1/năm có thể bật thêm`}</div>
                        ${actualNumber ? `<div class="mt-1 inline-flex items-center gap-1 rounded border border-yellow-300 bg-yellow-50 px-2 py-1 text-xs text-yellow-800">KQ thực tế ${latestActualPredictionDate}: <span class="font-mono font-bold">${actualNumber}</span>${actualExcludedEntry ? ` • đang bị loại bởi #${actualExcludedEntry.sourceRank}` : ' • đang nằm trong danh sách đánh'}</div>` : ''}
                    </div>
                    <div class="flex flex-col sm:items-end gap-2">
                        <label class="inline-flex items-center gap-2 text-sm text-gray-700">
                            <span>Ưu tiên min</span>
                            <select id="priority-threshold-select" class="rounded-md border-gray-300 text-sm px-2 py-1 focus:border-teal-500 focus:ring-teal-500">
                                ${[50, 60, 70, 75, 80, 85, 90, 95, 99].map(v => `<option value="${v}" ${Math.round(selectedExclusionPriorityThreshold) === v ? 'selected' : ''}>≥ ${v}</option>`).join('')}
                            </select>
                        </label>
                        <label class="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                            <input id="low-frequency-potential-checkbox" type="checkbox" class="rounded border-amber-300 text-amber-600 focus:ring-amber-500" ${includeLowFrequencyPotentialExclusions ? 'checked' : ''}>
                            <span>Loại thêm tần suất &lt; 1/năm</span>
                        </label>
                    </div>
                </div>`;
            gridHtml += '<div style="display:grid; grid-template-columns:repeat(10,1fr); gap:4px; max-width:500px;">';

            for (let i = 0; i < 100; i++) {
                const numStr = String(i).padStart(2, '0');
                let cellStyle = '';
                let titleText = numStr;
                const isActualNumber = actualNumber && numStr === actualNumber;

                if (excludedSet.has(numStr)) {
                    const source = excludedSourceByNumber.get(numStr);
                    const isLowFrequencySource = source && source.sourceType === 'lowFrequency';
                    cellStyle = isLowFrequencySource
                        ? 'background:rgba(245,158,11,0.18); color:#92400e; border:1.5px solid #f59e0b; font-weight:700;'
                        : 'background:rgba(239,68,68,0.15); color:#dc2626; border:1.5px solid #f87171; font-weight:700;';
                    if (source) {
                        const sourceText = isLowFrequencySource ? `tần suất ${Number.isFinite(source.frequencyPerYear) ? source.frequencyPerYear.toFixed(2) : '?'} lần/năm` : `Ưu tiên ${source.priority}`;
                        titleText = `${numStr} • #${source.sourceRank} ${source.title} • ${source.riskLabel} • ${sourceText}`;
                    }
                } else if (betSet.has(numStr)) {
                    cellStyle = 'background:rgba(20,184,166,0.15); color:#0d9488; border:1.5px solid #2dd4bf; font-weight:700;';
                    titleText = `${numStr} • số đánh`;
                } else {
                    cellStyle = 'background:#f9fafb; color:#9ca3af; border:1px solid #e5e7eb;';
                }
                if (isActualNumber) {
                    cellStyle += ' box-shadow:0 0 0 3px rgba(250,204,21,0.75); outline:2px solid #eab308;';
                    titleText += ` • KQ thực tế ngày ${latestActualPredictionDate}`;
                }

                gridHtml += `<div title="${escapeHtml(titleText)}" style="${cellStyle} text-align:center; padding:6px 2px; border-radius:6px; font-size:12px; font-family:monospace; cursor:default; transition:transform 0.1s;"
                    onmouseover="this.style.transform='scale(1.15)'" 
                    onmouseout="this.style.transform='scale(1)'">${numStr}${isActualNumber ? '<div style="font-size:9px;line-height:10px;">KQ</div>' : ''}</div>`;
            }
            gridHtml += '</div>';

            const exclusionOrderHtml = excludedEntries.length > 0
                ? `<div class="mt-4 rounded-lg border border-red-100 bg-red-50/40 p-3">
                    <div class="mb-2 flex items-center justify-between gap-2">
                        <div class="text-sm font-bold text-red-700"><i class="bi bi-sort-down mr-1"></i>Thứ tự loại trừ theo Tổng Hợp Dự Đoán</div>
                        <div class="text-[11px] text-red-500">Số bị loại bởi chuỗi ưu tiên cao nhất trước</div>
                    </div>
                    <div class="max-h-48 overflow-y-auto pr-1">
                        <div class="flex flex-wrap gap-1.5">
                            ${excludedEntries.map((entry, index) => `
                                <span title="${escapeHtml(`#${entry.sourceRank} ${entry.title} • ${entry.riskLabel} • ${entry.sourceType === 'lowFrequency' ? `tần suất ${Number.isFinite(entry.frequencyPerYear) ? entry.frequencyPerYear.toFixed(2) : '?'} lần/năm` : `Ưu tiên ${entry.priority}`}`)}" class="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${entry.sourceType === 'lowFrequency' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-white text-red-700'} ${actualNumber && entry.numStr === actualNumber ? 'ring-2 ring-yellow-300 bg-yellow-50' : ''}">
                                    <span class="font-mono text-[10px] text-gray-400">${index + 1}</span>
                                    <span class="font-mono font-bold">${entry.numStr}</span>
                                    <span class="text-[10px] text-gray-500">${entry.sourceType === 'lowFrequency' ? '&lt;1/năm' : `#${entry.sourceRank}`}</span>
                                    ${actualNumber && entry.numStr === actualNumber ? '<span class="rounded bg-yellow-200 px-1 text-[9px] text-yellow-900">KQ</span>' : ''}
                                </span>
                            `).join('')}
                        </div>
                    </div>
                </div>`
                : `<div class="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700">
                    Không có số nào đạt ngưỡng loại theo Tổng Hợp Dự Đoán hiện tại.
                </div>`;

            gridHtml += exclusionOrderHtml;

            // Summary stats
            gridHtml += `
                <div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="bg-teal-50 rounded-lg p-3 text-center border border-teal-200">
                        <div class="text-2xl font-bold text-teal-700">${displayBetNumbers.length}</div>
                        <div class="text-xs text-teal-600">Số đánh</div>
                    </div>
                    <div class="bg-red-50 rounded-lg p-3 text-center border border-red-200">
                        <div class="text-2xl font-bold text-red-600">${excludedNumbers.length}</div>
                        <div class="text-xs text-red-500">Số loại trừ</div>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                        <div class="text-2xl font-bold text-gray-700">${(displayBetNumbers.length / 100 * 100).toFixed(0)}%</div>
                        <div class="text-xs text-gray-500">Coverage</div>
                    </div>
                    <div class="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
                        <div class="text-2xl font-bold text-blue-700">${latestPredictionDateForExclusion || '-'}</div>
                        <div class="text-xs text-blue-500">Ngày dự đoán</div>
                    </div>
                </div>
            `;

            container.innerHTML = gridHtml;
            const thresholdSelect = document.getElementById('priority-threshold-select');
            if (thresholdSelect) {
                thresholdSelect.addEventListener('change', (event) => {
                    selectedExclusionPriorityThreshold = parseFloat(event.target.value);
                    localStorage.setItem(EXCLUSION_PRIORITY_STORAGE_KEY, String(selectedExclusionPriorityThreshold));
                    renderSelectedHistoryDate();
                });
            }
            const lowFrequencyCheckbox = document.getElementById('low-frequency-potential-checkbox');
            if (lowFrequencyCheckbox) {
                lowFrequencyCheckbox.addEventListener('change', (event) => {
                    includeLowFrequencyPotentialExclusions = Boolean(event.target.checked);
                    localStorage.setItem(LOW_FREQUENCY_EXCLUSION_STORAGE_KEY, includeLowFrequencyPotentialExclusions ? '1' : '0');
                    renderSelectedHistoryDate();
                });
            }
        } catch (error) {
            console.error('Lỗi khi tải Streak Exclusion:', error);
            section.style.display = 'none';
        }
    };

    const fetchQuickStats = async () => {
        try {
            const data = await fetchJSON(`${BASE_URL}/api/statistics/quick-stats`);
            quickStatsContainer.innerHTML = '';
            const allCurrentStreaks = [];

            let totalYears = 20.41; // fallback
            if (data._meta && data._meta.totalYears) {
                totalYears = data._meta.totalYears;
                window.GLOBAL_TOTAL_YEARS = totalYears;
            }

            ORDERED_STATS_KEYS.forEach(key => {
                const stat = data[key];
                if (stat && !stat.error) {
                    if (stat.current) {
                        const recordLength = stat.computedMaxStreak || (stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0);
                        allCurrentStreaks.push({
                            ...stat.current,
                            key: key,
                            description: stat.description,
                            recordLength: recordLength,
                            isSuperRecord: stat.isSuperMaxThreshold || false,
                            originalRecord: stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0,
                            gapStats: stat.gapStats,
                            exactGapStats: stat.exactGapStats,
                            extensionGapStats: stat.extensionGapStats
                        });
                    }
                    renderRecordAccordionItem(key, stat);
                }
            });
            const streaksByLength = allCurrentStreaks.reduce((acc, streak) => {
                if (!acc[streak.length]) { acc[streak.length] = []; }
                acc[streak.length].push(streak);
                return acc;
            }, {});

            // We no longer call renderCurrentStreaks here as it's handled by selectHistoryDate
        } catch (error) {
            console.error("Lỗi khi tải thống kê nhanh:", error);
        }
    };

    const renderCurrentStreaks = (streaksByLength, totalCount, totalYears = 20.41, forDate = '') => {
        console.log('[DEBUG] streaksByLength:', streaksByLength);
        const sortedLengths = Object.keys(streaksByLength).sort((a, b) => b - a);
        if (totalCount > 0) {
            currentStreaksSection.classList.remove('d-none');
            const dateSuffix = forDate ? ` (${forDate})` : '';
            currentStreaksTitle.innerHTML = `Chuỗi Đang Diễn Ra${dateSuffix} <span class="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 bg-red-600 rounded-full">${totalCount}</span>`;
            
            // === XÁC SUẤT CÓ ĐIỀU KIỆN (Conditional Probability) ===
            // P(gãy ngày mai) = 1 - count(≥L+step) / count(≥L)
            // Khớp chính xác với exclusionLogicService.calculateDropOff()
            const MAX_POTENTIAL_FORM_FREQ_PER_YEAR = 1;
            const calcDropOffRate = (streak, streakLen) => {
                const lowerStreakKey = (streak.key || '').toLowerCase();
                const lowerDescription = (streak.description || '').toLowerCase();
                const isTienLuiSoLe = lowerStreakKey.includes('tienluisole') || lowerStreakKey.includes('luitiensole') || lowerDescription.includes('tiến-lùi') || lowerDescription.includes('lùi-tiến');
                const isSoLeTheoCap = lowerStreakKey.includes('soletheocap');
                const isSoLe = ((lowerStreakKey.includes('vesole') || lowerStreakKey.includes('solemoi')) || lowerDescription.includes('về so le')) && !isTienLuiSoLe && !isSoLeTheoCap;
                const step = isSoLe ? 2 : 1;
                const nextLen = streakLen + step;

                // TÍNH TOÁN LẠI DROPOFF CHO CHUỖI TIỀM NĂNG SAO CHO ĐÚNG:
                if (streak.isPotential) {
                    const formLen = streakLen + step;
                    const gPrefix = streak.gapStats ? streak.gapStats[streakLen] : null;
                    const gForm = streak.gapStats ? streak.gapStats[formLen] : null;
                    const gBreak = streak.gapStats ? streak.gapStats[formLen + step] : null;
                    const countPrefix = gPrefix ? gPrefix.count : 0;
                    const countForm = gForm ? gForm.count : 0;
                    const countBreak = gBreak ? gBreak.count : 0;
                    const totalHistoricalDays = Math.max(1, Math.round(totalYears * 365.25));
                    const formFrequencyPerYear = totalYears > 0 ? countForm / totalYears : 0;
                    const hasConditionalPrefixSample = countPrefix > countForm;
                    const formationBaseCount = hasConditionalPrefixSample ? countPrefix : totalHistoricalDays;
                    const formationRate = formationBaseCount > 0 ? countForm / formationBaseCount : 0;
                    const nonFormationRate = formationBaseCount > 0 ? 1 - formationRate : 1;
                    const rate = countForm > 0 ? 1 - (countBreak / countForm) : 1;
                    const nonFormationCount = Math.max(0, formationBaseCount - countForm);
                    const nonFormationLowerBound = wilsonLowerBound(nonFormationCount, formationBaseCount);
                    const isHighFrequencyPotential = formFrequencyPerYear > MAX_POTENTIAL_FORM_FREQ_PER_YEAR;
                    return {
                        rate,
                        step,
                        nextLen,
                        currentCount: countForm,
                        nextCount: countBreak,
                        isSoLe,
                        formFrequencyPerYear,
                        isHighFrequencyPotential,
                        formationBaseCount,
                        rawFormationBaseCount: countPrefix,
                        usesFrequencyFallback: !hasConditionalPrefixSample,
                        formationCount: countForm,
                        nonFormationCount,
                        formationRate,
                        nonFormationRate,
                        nonFormationLowerBound,
                        exclusionRate: nonFormationRate,
                        exclusionLowerBound: nonFormationLowerBound,
                        exclusionSampleSize: formationBaseCount
                    };
                }

                const currentGE = streak.gapStats ? streak.gapStats[streakLen] : null;
                const nextGE = streak.gapStats ? streak.gapStats[nextLen] : null;
                const currentCount = currentGE ? currentGE.count : 0;
                const nextCount = nextGE ? nextGE.count : 0;

                if (currentCount > 0) {
                    const rate = 1 - (nextCount / currentCount);
                    return {
                        rate,
                        step,
                        nextLen,
                        currentCount,
                        nextCount,
                        isSoLe,
                        exclusionRate: rate,
                        exclusionLowerBound: streak.reliability ? streak.reliability.lowerBound : wilsonLowerBound(currentCount - nextCount, currentCount),
                        exclusionSampleSize: currentCount
                    };
                }
                return {
                    rate: 1,
                    step,
                    nextLen,
                    currentCount,
                    nextCount,
                    isSoLe,
                    exclusionRate: 1,
                    exclusionLowerBound: 0,
                    exclusionSampleSize: currentCount
                };
            };

            // Thu thập TẤT CẢ chuỗi với tỷ lệ gãy để dùng cho Dự báo + Tổng hợp dự đoán
            const allStreakDropOffs = [];
            sortedLengths.forEach(length => {
                streaksByLength[length].forEach(streak => {
                    const streakLen = parseInt(length);
                    const dropOffInfo = calcDropOffRate(streak, streakLen);
                    const item = {
                        ...dropOffInfo,
                        streak,
                        streakLen,
                        dropOffRate: dropOffInfo.rate,
                        exclusionRate: dropOffInfo.exclusionRate ?? dropOffInfo.rate,
                        frequencyPerYear: streak.isPotential
                            ? Number(dropOffInfo.formFrequencyPerYear || 0)
                            : (totalYears > 0 ? Number(dropOffInfo.currentCount || 0) / totalYears : Infinity),
                        totalYearsForFrequency: totalYears
                    };
                    item.exclusionPriority = exclusionPriorityScore(item);
                    allStreakDropOffs.push(item);
                });
            });

            // Sắp xếp theo khả năng loại trừ thực tế: chuỗi đã hình thành dùng tỷ lệ gãy,
            // chuỗi tiềm năng dùng tỷ lệ không hình thành, sau đó xét lower/tin cậy/mẫu.
            allStreakDropOffs.sort((a, b) => {
                if ((b.exclusionPriority || 0) !== (a.exclusionPriority || 0)) return (b.exclusionPriority || 0) - (a.exclusionPriority || 0);
                if ((b.exclusionRate || 0) !== (a.exclusionRate || 0)) return (b.exclusionRate || 0) - (a.exclusionRate || 0);
                return (b.dropOffRate || 0) - (a.dropOffRate || 0);
            });
            const actionableStreakDropOffs = allStreakDropOffs.filter(({ streak, isHighFrequencyPotential }) => !(streak.isPotential && isHighFrequencyPotential));

            // === DỰ BÁO CHUỖI CÓ THỂ XẢY RA ===
            // Chuỗi đã hình thành: tỷ lệ gãy. Chuỗi tiềm năng: tỷ lệ không hình thành.
            let forecastHtml = '';
            let forecastCount = 0;
            actionableStreakDropOffs.forEach(({ streak, streakLen, dropOffRate, exclusionRate, nextLen, currentCount, nextCount, formFrequencyPerYear, formationBaseCount, formationRate, nonFormationRate, usesFrequencyFallback }) => {
                const riskRate = streak.isPotential ? nonFormationRate : dropOffRate;
                const riskSample = streak.isPotential ? formationBaseCount : currentCount;
                if (riskRate >= 0.50 && riskSample > 0) {
                    const lenDisplay = streak.isPotential ? `${streakLen} ngày (tiềm năng)` : `${streakLen} ngày`;
                    const riskColor = riskRate >= 0.90 ? 'text-purple-700' : riskRate >= 0.70 ? 'text-red-600' : 'text-orange-600';
                    const riskBg = riskRate >= 0.90 ? 'bg-purple-100' : riskRate >= 0.70 ? 'bg-red-100' : 'bg-orange-100';
                    const riskText = streak.isPotential
                        ? `→ Không hình thành ${(nonFormationRate*100).toFixed(0)}%`
                        : `→ Gãy ${(dropOffRate*100).toFixed(0)}%`;
                    const potentialSampleLabel = usesFrequencyFallback ? 'ngày mẫu' : 'tiền đề';
                    const countText = streak.isPotential
                        ? `(${formatMetric(formationBaseCount)} ${potentialSampleLabel}, ${currentCount} lần hình thành ${nextLen}d, HT ${(formationRate*100).toFixed(1)}%, sau HT gãy ${(dropOffRate*100).toFixed(0)}%)`
                        : `(${currentCount} chuỗi đạt ${streakLen}d, chỉ ${nextCount} tiếp tục)`;
                    forecastHtml += `<li class="flex items-center gap-2 ${riskBg} rounded px-2 py-1">
                        <i class="bi bi-exclamation-triangle-fill ${riskColor}"></i>
                        <span class="font-bold text-gray-800">${streak.description}</span>
                        <span class="text-xs bg-gray-200 px-1.5 py-0.5 rounded">${lenDisplay}</span>
                        <span class="${riskColor} text-xs font-bold">${riskText}</span>
                        <span class="text-gray-400 text-[10px]">${countText}</span>
                    </li>`;
                    forecastCount++;
                }
            });

            // === TỔNG HỢP DỰ ĐOÁN ===
            const predictionDate = forDate ? getNextDay(forDate) : '';
            latestPredictionDateForExclusion = predictionDate;
            latestActualPredictionDate = predictionDate;
            latestActualPredictionNumber = getActualPredictionNumber(predictionDate);
            const predSummarySection = document.getElementById('prediction-summary-section');
            const predSummaryContainer = document.getElementById('prediction-summary-container');
            const predSummaryTitle = document.getElementById('prediction-summary-title');
            const predSummaryCount = document.getElementById('prediction-summary-count');
            if (predSummarySection && predSummaryContainer) {
                const predItems = actionableStreakDropOffs.filter(({ dropOffRate, exclusionRate, currentCount, formationBaseCount }) => {
                    const sample = formationBaseCount || currentCount || 0;
                    return sample > 0 && ((exclusionRate || 0) > 0 || (dropOffRate || 0) > 0);
                });
                latestPredictionItemsForExclusion = predItems.map((item, index) => ({ ...item, summaryRank: index + 1 }));
                latestLowFrequencyItemsForExclusion = allStreakDropOffs.map((item, index) => ({ ...item, summaryRank: index + 1 }));
                fetchStreakExclusion();
                if (predItems.length > 0) {
                    predSummarySection.style.display = '';
                    if (predSummaryTitle) {
                        predSummaryTitle.innerHTML = predictionDate
                            ? `Tổng Hợp Dự Đoán — <span class="text-red-600 font-bold">${predictionDate}</span>`
                            : 'Tổng Hợp Dự Đoán';
                    }
                    predSummaryCount.textContent = `(${predItems.length} chuỗi)`;
                    const reliabilityItems = predItems.map(item => ({
                        ...item,
                        reliability: item.streak.reliability || null
                    }));
                    const reliabilityScores = reliabilityItems
                        .map(item => item.reliability && Number(item.reliability.score))
                        .filter(score => Number.isFinite(score));
                    const avgReliability = reliabilityScores.length > 0
                        ? Math.round(reliabilityScores.reduce((sum, score) => sum + score, 0) / reliabilityScores.length)
                        : 0;
                    const strongReliabilityCount = reliabilityScores.filter(score => score >= 70).length;
                    const thinReliabilityCount = reliabilityScores.filter(score => score < 45).length;
                    const yearsText = Number.isFinite(Number(totalYears)) ? totalYears.toFixed(1) : '20+';
                    const actualPredictionHitCount = latestActualPredictionNumber
                        ? reliabilityItems.filter(item => isActivePredictionExclusionItem(item) && getPredictionNumbers(item).includes(latestActualPredictionNumber)).length
                        : 0;
                    const actualPredictionHtml = latestActualPredictionNumber
                        ? `<div class="mt-3 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-900">
                            Kết quả thực tế ngày ${latestActualPredictionDate}: <span class="font-mono font-bold">${latestActualPredictionNumber}</span>. Số này xuất hiện trong ${actualPredictionHitCount} chuỗi đang được dùng để loại trừ và được highlight màu vàng.
                        </div>`
                        : '';

                    let predHtml = `
                        <div class="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                            <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <div class="font-bold"><i class="bi bi-shield-check mr-1"></i>Độ tin cậy lịch sử của toàn bộ chuỗi dự đoán</div>
                                    <div class="mt-1 text-xs leading-5 text-blue-700">
                                        Tính trên ${yearsText} năm dữ liệu: chuỗi đã hình thành dùng tỷ lệ gãy; chuỗi tiềm năng dùng tỷ lệ không hình thành. Điểm ưu tiên loại còn xét Wilson lower bound, cỡ mẫu, độ tin cậy và nhịp xuất hiện.
                                    </div>
                                </div>
                                <div class="grid grid-cols-3 gap-2 text-center text-xs">
                                    <div class="rounded-md bg-white/80 px-3 py-2 border border-blue-100">
                                        <div class="text-lg font-bold text-blue-800">${avgReliability}</div>
                                        <div class="text-blue-600">Tin cậy TB</div>
                                    </div>
                                    <div class="rounded-md bg-white/80 px-3 py-2 border border-blue-100">
                                        <div class="text-lg font-bold text-emerald-700">${strongReliabilityCount}</div>
                                        <div class="text-blue-600">Chuỗi mạnh</div>
                                    </div>
                                    <div class="rounded-md bg-white/80 px-3 py-2 border border-blue-100">
                                        <div class="text-lg font-bold text-red-700">${thinReliabilityCount}</div>
                                        <div class="text-blue-600">Mẫu mỏng</div>
                                    </div>
                                </div>
                            </div>
                            ${actualPredictionHtml}
                        </div>
                        <div class="overflow-x-auto"><table class="min-w-full text-xs text-left text-gray-500">
                        <thead class="text-xs text-gray-700 uppercase bg-amber-50">
                            <tr>
                                ${renderHeaderTooltip('Dạng chuỗi', 'Tên pattern đang được dùng để dự đoán. Nhãn tiềm năng nghĩa là chuỗi còn 1 ngày nữa mới hình thành.')}
                                ${renderHeaderTooltip('Độ dài', 'Độ dài chuỗi hiện tại. Với chuỗi tiềm năng, mũi tên cho biết nếu ngày mai tiếp tục thì sẽ hình thành chuỗi ở độ dài này.', 'text-center')}
                                ${renderHeaderTooltip('Kỷ lục', 'Số ngày dài nhất chuỗi dạng này từng kéo dài trong toàn bộ lịch sử dữ liệu.', 'text-center')}
                                ${renderHeaderTooltip('Ưu tiên loại', 'Điểm 0-100 dùng để sắp xếp khả năng loại trừ. Công thức hiện tại: 55% rủi ro gãy/không hình thành, 25% Wilson lower bound, 15% độ tin cậy, 5% cỡ mẫu.', 'text-center')}
                                ${renderHeaderTooltip('Gãy / Không HT', 'Chuỗi đã hình thành hiển thị tỷ lệ gãy lịch sử. Chuỗi tiềm năng hiển thị tỷ lệ không hình thành; dòng phụ cho biết nếu đã hình thành thì tỷ lệ gãy sau đó là bao nhiêu.', 'text-center')}
                                ${renderHeaderTooltip('HT', 'Tỷ lệ hình thành của chuỗi tiềm năng. Dòng phụ là số tiền đề hoặc số ngày mẫu dùng để tính tỷ lệ này.', 'text-center')}
                                ${renderHeaderTooltip('Tin cậy', 'Score tổng hợp từ Wilson lower bound, tỷ lệ gãy/không hình thành, cỡ mẫu, độ gần hiện tại, nhịp xuất hiện và độ dài so với trung bình.', 'text-center')}
                                ${renderHeaderTooltip('Lower', 'Wilson lower bound: cận dưới tin cậy của tỷ lệ gãy hoặc không hình thành, giúp tránh ưu tiên ảo khi mẫu quá ít.', 'text-center')}
                                ${renderHeaderTooltip('SL đạt', 'Số lần lịch sử đạt mốc đang xét. Với chuỗi tiềm năng, dòng phụ hiển thị tần suất hình thành mỗi năm.', 'text-center')}
                                ${renderHeaderTooltip('SL tiếp tục', 'Số lần lịch sử tiếp tục sang mốc kế tiếp sau độ dài đang xét. Số này càng thấp thì rủi ro gãy càng cao.', 'text-center')}
                                ${renderHeaderTooltip('TB dài', 'Độ dài trung bình của các lần chuỗi này từng xuất hiện trong lịch sử.', 'text-center')}
                                ${renderHeaderTooltip('TB cách', 'Khoảng cách trung bình giữa các lần xuất hiện của chuỗi trong lịch sử.', 'text-center')}
                                ${renderHeaderTooltip('Gần nhất', 'Số ngày từ lần xuất hiện gần nhất của chuỗi tới ngày đang dùng làm dữ liệu hiện tại.', 'text-center')}
                                ${renderHeaderTooltip('Số dự đoán', 'Danh sách số bị tác động bởi chuỗi này. Các số này được đưa vào tập loại trừ theo thứ tự ưu tiên.')}
                            </tr>
                        </thead><tbody>`;
                    reliabilityItems.forEach(({ streak, streakLen, dropOffRate, exclusionRate, exclusionPriority, nextLen, currentCount, nextCount, formFrequencyPerYear, reliability, formationBaseCount, formationRate, nonFormationRate, nonFormationLowerBound, usesFrequencyFallback }) => {
                        const itemForExclusion = { streak, formationBaseCount, currentCount, exclusionPriority, formFrequencyPerYear, totalYearsForFrequency: totalYears };
                        const predictionNumbers = getPredictionNumbers({ streak });
                        const isActualHit = latestActualPredictionNumber && isActivePredictionExclusionItem(itemForExclusion) && predictionNumbers.includes(latestActualPredictionNumber);
                        const recordLength = getStreakRecordLength(streak);
                        const recordClass = recordLength > 0 && streakLen >= recordLength
                            ? 'bg-red-100 text-red-700 border-red-200'
                            : 'bg-gray-100 text-gray-700 border-gray-200';
                        const riskRate = streak.isPotential ? nonFormationRate : dropOffRate;
                        const riskColor = riskRate >= 0.90 ? 'text-purple-700 font-bold' : riskRate >= 0.70 ? 'text-red-600 font-bold' : riskRate >= 0.50 ? 'text-orange-600 font-semibold' : 'text-gray-600';
                        const rowBg = isActualHit ? 'bg-yellow-50' : (riskRate >= 0.90 ? 'bg-purple-50' : riskRate >= 0.70 ? 'bg-red-50' : riskRate >= 0.50 ? 'bg-orange-50' : 'bg-white');
                        const nums = predictionNumbers.length > 0
                            ? predictionNumbers.map(numStr => {
                                const chipClass = isActualHit && numStr === latestActualPredictionNumber
                                    ? 'bg-yellow-200 text-yellow-900 border border-yellow-500 ring-2 ring-yellow-300'
                                    : 'bg-gray-800 text-gray-200';
                                return `<span class="px-1 py-0.5 ${chipClass} text-[10px] rounded">${numStr}</span>`;
                            }).join(' ')
                            : '<span class="text-gray-400">-</span>';
                        const potentialLabel = streak.isPotential ? ' <span class="text-[9px] bg-orange-500 text-white px-1 py-0.5 rounded">tiềm năng</span>' : '';
                        const actualHitLabel = isActualHit ? ' <span class="text-[9px] bg-yellow-300 text-yellow-900 px-1 py-0.5 rounded border border-yellow-500">KQ thực tế</span>' : '';
                        const dropOffLabel = streak.isPotential
                            ? `<div class="${riskColor}">Không HT ${(nonFormationRate*100).toFixed(0)}%</div><div class="text-[9px] text-gray-500 font-normal">sau HT gãy ${(dropOffRate*100).toFixed(0)}%</div>`
                            : `<span class="${riskColor}">${(dropOffRate*100).toFixed(0)}%</span>`;
                        const potentialSampleLabel = usesFrequencyFallback ? 'ngày mẫu' : 'tiền đề';
                        const formationHtml = streak.isPotential
                            ? `<div class="font-semibold text-gray-700">${(formationRate*100).toFixed(1)}%</div><div class="text-[9px] text-gray-500">${formatMetric(formationBaseCount)} ${potentialSampleLabel}</div>`
                            : '<span class="text-gray-400">-</span>';
                        const currentCountLabel = streak.isPotential
                            ? `<div>${currentCount}</div><div class="text-[9px] text-gray-500">${formFrequencyPerYear.toFixed(1)}/năm</div>`
                            : currentCount;
                        const reliabilityScore = reliability ? reliability.score : null;
                        const reliabilityHtml = reliability
                            ? `<div class="inline-flex min-w-12 justify-center rounded border px-2 py-1 text-[11px] font-bold ${reliabilityBadgeClass(reliabilityScore)}">${reliabilityScore}</div><div class="text-[9px] text-gray-500 mt-0.5">${reliabilityLabel(reliabilityScore)}</div>`
                            : '<span class="text-gray-400">-</span>';
                        const lowerHtml = reliability
                            ? `<div class="font-semibold">${formatMetric(streak.isPotential ? nonFormationLowerBound * 100 : reliability.lowerBoundPercent, '%')}</div><div class="text-[9px] text-gray-500">mẫu ${formatMetric(streak.isPotential ? formationBaseCount : reliability.sampleSize)}</div>`
                            : '<span class="text-gray-400">-</span>';
                        predHtml += `<tr class="${rowBg} border-b ${isActualHit ? 'outline outline-2 outline-yellow-300' : 'hover:bg-gray-50'}">
                            <td class="px-3 py-2 font-medium text-gray-900">${streak.description}${potentialLabel}${actualHitLabel}</td>
                            <td class="px-3 py-2 text-center">${streakLen}d${streak.isPotential ? '<span class="text-[9px] text-orange-500"> ↗</span>' : ''}</td>
                            <td class="px-3 py-2 text-center"><span class="inline-flex min-w-10 justify-center rounded border px-2 py-1 text-[11px] font-semibold ${recordClass}">${recordLength ? `${recordLength}d` : '-'}</span></td>
                            <td class="px-3 py-2 text-center"><span class="inline-flex min-w-12 justify-center rounded bg-gray-900 px-2 py-1 text-[11px] font-bold text-white">${formatMetric(exclusionPriority, '')}</span></td>
                            <td class="px-3 py-2 text-center">${dropOffLabel}</td>
                            <td class="px-3 py-2 text-center">${formationHtml}</td>
                            <td class="px-3 py-2 text-center">${reliabilityHtml}</td>
                            <td class="px-3 py-2 text-center">${lowerHtml}</td>
                            <td class="px-3 py-2 text-center">${currentCountLabel}</td>
                            <td class="px-3 py-2 text-center">${nextCount}</td>
                            <td class="px-3 py-2 text-center">${reliability ? formatMetric(reliability.avgLength, 'd') : '-'}</td>
                            <td class="px-3 py-2 text-center">${reliability ? formatMetric(reliability.avgGapDays, 'd') : '-'}</td>
                            <td class="px-3 py-2 text-center">${reliability ? formatMetric(reliability.daysSinceLatestEnd, 'd') : '-'}</td>
                            <td class="px-3 py-2"><div class="flex flex-wrap gap-0.5">${nums}</div></td>
                        </tr>`;
                    });
                    predHtml += '</tbody></table></div>';
                    predSummaryContainer.innerHTML = predHtml;
                } else {
                    predSummarySection.style.display = 'none';
                }
            }

            let finalHtml = '';
            if (forecastCount > 0) {
                finalHtml += `
                <div class="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 shadow-sm">
                    <h4 class="text-blue-800 font-bold mb-3 flex items-center"><i class="bi bi-stars mr-2"></i>Dự báo chuỗi có khả năng GÃY / KHÔNG HÌNH THÀNH ngày mai (sắp theo ưu tiên loại ↓)</h4>
                    <ul class="text-sm space-y-2">
                        ${forecastHtml}
                    </ul>
                </div>
                `;
            }
            sortedLengths.forEach(length => {
                const hasPotentialInGroup = streaksByLength[length].some(s => s.isPotential);
                finalHtml += `
                            <div class="mt-4">
                                <h4 class="text-sm font-semibold text-gray-600 uppercase tracking-wider flex justify-between items-center border-b pb-2 mb-4">
                                    <span><i class="bi bi-fire"></i> ${hasPotentialInGroup ? '🔮 Chuỗi tiềm năng (đang hình thành)' : 'Chuỗi'}</span>
                                    ${hasPotentialInGroup ? `<span class="font-bold text-lg text-orange-500">${length} Ngày</span>` : `<span class="font-bold text-lg text-red-500">${length} Ngày</span>`}
                                </h4>
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">`;

                streaksByLength[length].forEach(streak => {
                    const streakLen = parseInt(length);
                    // Check for so le pattern 
                    const lowerStreakKeyOuter = (streak.key || '').toLowerCase();
                    const lowerDescriptionOuter = (streak.description || '').toLowerCase();
                    const isTienLuiSoLePattern = lowerStreakKeyOuter.includes('tienluisole') || lowerStreakKeyOuter.includes('luitiensole') || lowerDescriptionOuter.includes('tiến-lùi') || lowerDescriptionOuter.includes('lùi-tiến');
                    const isSoLeTheoCapOuter = lowerStreakKeyOuter.includes('soletheocap');
                    const isSoLePatternOuter = ((lowerStreakKeyOuter.includes('vesole') || lowerStreakKeyOuter.includes('solemoi')) || lowerDescriptionOuter.includes('về so le')) && !isTienLuiSoLePattern && !isSoLeTheoCapOuter;

                    const stepOuter = isSoLePatternOuter ? 2 : 1;
                    const targetLenOuter = streakLen + stepOuter;

                    // === Dùng gapStats (>=) thay vì exactGapStats (==) cho drop-off ===
                    const currentGEOuter = streak.gapStats ? streak.gapStats[streakLen] : null;
                    const nextGEOuter = streak.gapStats ? streak.gapStats[targetLenOuter] : null;
                    const currentCountOuter = currentGEOuter ? currentGEOuter.count : 0;
                    const targetCountOuter = nextGEOuter ? nextGEOuter.count : 0;
                    const targetFreqYearOuter = targetCountOuter / totalYears;
                    const isNextSuperRecordOuter = targetFreqYearOuter <= 0.5;

                    let dropOffRateOuter = 0;
                    let riskLabelOuter = 'Rủi ro gãy';
                    if (streak.isPotential) {
                        const formLen = streakLen + stepOuter;
                        const gPrefix = streak.gapStats ? streak.gapStats[streakLen] : null;
                        const gForm = streak.gapStats ? streak.gapStats[formLen] : null;
                        const countPrefix = gPrefix ? gPrefix.count : 0;
                        const countForm = gForm ? gForm.count : 0;
                        const totalHistoricalDays = Math.max(1, Math.round(totalYears * 365.25));
                        const formationBaseCount = countPrefix > countForm ? countPrefix : totalHistoricalDays;
                        dropOffRateOuter = formationBaseCount > 0 ? 1 - (countForm / formationBaseCount) : 1;
                        riskLabelOuter = 'Không HT';
                    } else if (currentCountOuter > 0) {
                        dropOffRateOuter = 1 - (targetCountOuter / currentCountOuter);
                    } else {
                        dropOffRateOuter = 1;
                    }

                    const isRecord = dropOffRateOuter >= 0.70;
                    const isSuperRecord = dropOffRateOuter >= 0.90;
                    const isForecastRecord = targetFreqYearOuter > 0 && targetFreqYearOuter <= 1.5;

                    const borderColor = isRecord ? (isSuperRecord ? 'border-l-purple-700' : 'border-l-red-700') : (streak.isPotential ? 'border-l-orange-400' : 'border-l-blue-300');
                    const bgColor = isRecord ? (isSuperRecord ? 'bg-purple-50' : 'bg-red-50') : (streak.isPotential ? 'bg-orange-50' : 'bg-white');
                    const titleWeight = isRecord ? 'font-bold' : 'font-semibold';
                    const recordLength = getStreakRecordLength(streak);
                    const recordBadgeClass = recordLength > 0 && streakLen >= recordLength
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : 'border-gray-200 bg-gray-50 text-gray-600';
                    const cardPredictionNumbers = getPredictionNumbers({ streak });
                    const cardDropOffItem = allStreakDropOffs.find(item => item.streak === streak);
                    const isCardActualHit = latestActualPredictionNumber
                        && cardDropOffItem
                        && isActivePredictionExclusionItem(cardDropOffItem)
                        && cardPredictionNumbers.includes(latestActualPredictionNumber);
                    const cardBgColor = isCardActualHit ? 'bg-yellow-50' : bgColor;
                    const cardBorderColor = isCardActualHit ? 'border-l-yellow-500 ring-2 ring-yellow-200' : borderColor;

                    let badgeHtml = '';
                    if (isSuperRecord) {
                        badgeHtml = `<span class="ml-2 inline-block bg-purple-600 text-white text-[9px] px-1 py-0.5 rounded uppercase">${riskLabelOuter} ${(dropOffRateOuter*100).toFixed(0)}%</span>`;
                    } else if (isRecord) {
                        badgeHtml = `<span class="ml-2 inline-block bg-red-600 text-white text-[9px] px-1 py-0.5 rounded uppercase">${riskLabelOuter} ${(dropOffRateOuter*100).toFixed(0)}%</span>`;
                    } else if (streak.isPotential && dropOffRateOuter >= 0.50) {
                        const potRiskColor = dropOffRateOuter >= 0.70 ? 'bg-red-500' : 'bg-orange-500';
                        badgeHtml = `<span class="ml-2 inline-block ${potRiskColor} text-white text-[9px] px-1 py-0.5 rounded uppercase">⚡ Không HT ${(dropOffRateOuter*100).toFixed(0)}%</span>`;
                    } else if (streak.isPotential) {
                        badgeHtml = `<span class="ml-2 inline-block bg-orange-500 text-white text-[9px] px-1 py-0.5 rounded uppercase">Tiềm Năng</span>`;
                    }
                    if (isCardActualHit) {
                        badgeHtml += `<span class="ml-2 inline-block bg-yellow-300 text-yellow-900 text-[9px] px-1 py-0.5 rounded border border-yellow-500 uppercase">KQ thực tế</span>`;
                    }

                    finalHtml += `
                                <div class="${cardBgColor} rounded-lg shadow-sm border border-l-4 ${cardBorderColor} transition hover:shadow-lg hover:-translate-y-1">
                                    <div class="p-4 flex flex-col h-full">
                                        
                                        <div class="relative group cursor-pointer" onclick="this.querySelector('.group-hover\\:block').classList.toggle('hidden')">
                                            <h6 class="${titleWeight} text-gray-800 hover:text-indigo-600 transition flex items-center gap-1">
                                                ${streak.description}${badgeHtml} <i class="bi bi-info-circle text-xs text-gray-400"></i>
                                            </h6>
                                            ${cardPredictionNumbers.length > 0 ? `
                                            <div class="absolute left-0 top-full mt-2 w-64 p-3 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 hidden group-hover:block transition shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                                                <p class="text-xs text-gray-400 mb-2 border-b border-gray-700 pb-1">Các số có thể xuất hiện tiếp theo (${cardPredictionNumbers.length} số):</p>
                                                <div class="flex flex-wrap gap-1">
                                                    ${cardPredictionNumbers.map(numStr => {
                                                        const chipClass = isCardActualHit && numStr === latestActualPredictionNumber
                                                            ? 'bg-yellow-200 text-yellow-900 border-yellow-500 ring-2 ring-yellow-300'
                                                            : 'bg-gray-800 text-gray-200 border-gray-700';
                                                        return `<span class="px-1 py-0.5 ${chipClass} text-[10px] rounded border">${numStr}</span>`;
                                                    }).join('')}
                                                </div>
                                            </div>
                                            ` : ''}
	                                        </div>

	                                        <div class="mt-2 mb-1 flex flex-wrap items-center gap-1.5 text-[11px]">
	                                            <span class="inline-flex items-center rounded border px-2 py-0.5 font-semibold ${recordBadgeClass}">Kỷ lục: ${recordLength ? `${recordLength}d` : '-'}</span>
	                                            <span class="text-gray-500">Hiện tại: ${streakLen}d</span>
	                                        </div>
	                                        <p class="text-xs text-gray-500 mb-1">Từ ngày: ${streak.startDate}</p>
                                        <div class="mt-auto pt-2">
                                           <div class="flex flex-wrap gap-1">${renderFullSequence(streak, streak.description)}</div>
                                        </div>
                        ${(() => {
                            // Check for Tiến Lùi So Le pattern (special handling)
                            const lowerStreakKeyInner = (streak.key || '').toLowerCase();
                            const lowerDescriptionInner = (streak.description || '').toLowerCase();
                            const isTienLuiSoLeByKey = lowerStreakKeyInner.includes('tienluisole') || lowerStreakKeyInner.includes('luitiensole');
                            const isTienLuiSoLeByDesc = lowerDescriptionInner.includes('tiến-lùi') || lowerDescriptionInner.includes('lùi-tiến');
                            const isTienLuiSoLePattern = isTienLuiSoLeByKey || isTienLuiSoLeByDesc;
                            const isSoLeTheoCapPattern = lowerStreakKeyInner.includes('soletheocap');

                            // Check for so le pattern - check both key and description (excluding Tiến Lùi So Le)
                            const isSoLeByKey = (lowerStreakKeyInner.includes('vesole') || lowerStreakKeyInner.includes('solemoi')) && !isTienLuiSoLePattern && !isSoLeTheoCapPattern;
                            const isSoLeByDesc = lowerDescriptionInner.includes('về so le') && !isTienLuiSoLePattern && !isSoLeTheoCapPattern;
                            const isSoLePattern = isSoLeByKey || isSoLeByDesc;

                            // Tiến Lùi So Le: step = 1, So Le thường: step = 2
                            const nextLen = isSoLePattern ? parseInt(length) + 2 : parseInt(length) + 1;
                            const currentLen = parseInt(length);
                            const actualRecordLengthInner = getStreakRecordLength(streak);
                            const hasReachedRecord = actualRecordLengthInner > 0 && currentLen >= actualRecordLengthInner;

                            // Debug log for so le detection
                            if (isSoLeByDesc) {
                                console.log('[DEBUG SO LE]', {
                                    key: streak.key,
                                    description: streak.description,
                                    length: length,
                                    isSoLeByKey: isSoLeByKey,
                                    isSoLeByDesc: isSoLeByDesc,
                                    isSoLePattern: isSoLePattern,
                                    nextLen: nextLen
                                });
                            }

                            const gapInfoGE = (streak.gapStats && streak.gapStats[nextLen]) ? streak.gapStats[nextLen] : null;
                            const gapInfoExact = (streak.exactGapStats && streak.exactGapStats[nextLen]) ? streak.exactGapStats[nextLen] : null;

                            // Extension gap: gap from current length to next level
                            const streakLen = streak.length;
                            const extGapInfo = (streak.extensionGapStats && streak.extensionGapStats[streakLen]) ? streak.extensionGapStats[streakLen] : null;

                            // Use config values
                            const GAP_BUFFER = currentConfig.GAP_BUFFER_PERCENT !== undefined ? currentConfig.GAP_BUFFER_PERCENT : 0;
                            const STRATEGY = currentConfig.GAP_STRATEGY || 'COMBINED';

                            let geHtml = '';
                            let exactHtml = '';
                            let extGapHtml = '';
                            let isLowProbGE = false;
                            let isLowProbExact = false;
                            let isLowProbExt = false;

                            if (gapInfoGE && gapInfoGE.minGap !== undefined) {
                                const threshold = gapInfoGE.minGap !== null ? gapInfoGE.minGap * (1 + GAP_BUFFER) : 0;
                                const isLow = gapInfoGE.minGap !== null && gapInfoGE.lastGap < threshold;
                                if (isLow) isLowProbGE = true;

                                geHtml = `<div class="text-[10px] mt-1 border-t border-gray-100 pt-1">
                                    <div class="flex justify-between">
                                        <span>Chuỗi lớn hơn (>=${nextLen}):</span>
                                        <span class="${isLow ? 'text-red-600 font-bold' : 'text-green-600'}">
                                            Lần cuối ${gapInfoGE.lastGap} ${isLow ? '<' : '>='} ${Math.round(threshold)}
                                        </span>
                                    </div>
                                    <div class="flex gap-2 text-[9px] mt-0.5">
                                        <span class="text-green-600">MIN: ${gapInfoGE.minGap !== null && gapInfoGE.minGap !== undefined ? gapInfoGE.minGap + '(' + (gapInfoGE.minCount || 1) + ')' : '-(0)'}</span>
                                        <span class="text-yellow-600">AVG: ${gapInfoGE.avgGap || '-'}</span>
                                        <span class="text-red-600">MAX: ${gapInfoGE.maxGap !== null && gapInfoGE.maxGap !== undefined ? gapInfoGE.maxGap + '(' + (gapInfoGE.maxCount || 1) + ')' : '-(0)'}</span>
                                    </div>
                                </div>`;
                            }

                            if (gapInfoExact && gapInfoExact.minGap !== undefined) {
                                const threshold = gapInfoExact.minGap !== null ? gapInfoExact.minGap * (1 + GAP_BUFFER) : 0;
                                const isLow = gapInfoExact.minGap !== null && gapInfoExact.lastGap < threshold;
                                if (isLow) isLowProbExact = true;

                                exactHtml = `<div class="text-[10px] mt-1 border-t border-gray-100 pt-1">
                                    <div class="flex justify-between">
                                        <span>Chuỗi chính xác (=${nextLen}):</span>
                                        <span class="${isLow ? 'text-red-600 font-bold' : 'text-green-600'}">
                                            Lần cuối ${gapInfoExact.lastGap} ${isLow ? '<' : '>='} ${Math.round(threshold)}
                                        </span>
                                    </div>
                                    <div class="flex gap-2 text-[9px] mt-0.5">
                                        <span class="text-green-600">MIN: ${gapInfoExact.minGap !== null && gapInfoExact.minGap !== undefined ? gapInfoExact.minGap + '(' + (gapInfoExact.minCount || 1) + ')' : '-(0)'}</span>
                                        <span class="text-yellow-600">AVG: ${gapInfoExact.avgGap || '-'}</span>
                                        <span class="text-red-600">MAX: ${gapInfoExact.maxGap !== null && gapInfoExact.maxGap !== undefined ? gapInfoExact.maxGap + '(' + (gapInfoExact.maxCount || 1) + ')' : '-(0)'}</span>
                                    </div>
                                </div>`;
                            }

                            // Extension Gap: gap from current length to next level
                            if (extGapInfo && extGapInfo.minGap !== null) {
                                const step = isSoLePattern ? 2 : 1;
                                const isLow = extGapInfo.lastGap < extGapInfo.minGap;
                                if (isLow) isLowProbExt = true;

                                extGapHtml = `<div class="text-[10px] mt-1 border-t border-blue-200 pt-1 bg-blue-50 -mx-1 px-1">
                                    <div class="flex justify-between">
                                        <span class="text-blue-700">Kéo dài (${streakLen}→${streakLen + step}):</span>
                                        <span class="${isLow ? 'text-red-600 font-bold' : 'text-blue-600'}">
                                            Lần cuối ${extGapInfo.lastGap} ${isLow ? '<' : '>='} ${extGapInfo.minGap}
                                        </span>
                                    </div>
                                    <div class="flex gap-2 text-[9px] mt-0.5">
                                        <span class="text-green-600">MIN: ${extGapInfo.minGap !== null && extGapInfo.minGap !== undefined ? extGapInfo.minGap + '(' + (extGapInfo.minCount || 1) + ')' : '-(0)'}</span>
                                        <span class="text-yellow-600">AVG: ${extGapInfo.avgGap || '-'}</span>
                                        <span class="text-red-600">MAX: ${extGapInfo.maxGap !== null && extGapInfo.maxGap !== undefined ? extGapInfo.maxGap + '(' + (extGapInfo.maxCount || 1) + ')' : '-(0)'}</span>
                                        <span class="text-gray-500">(${extGapInfo.count} lần)</span>
                                    </div>
                                </div>`;
                            }

                            let isLowProb = false;
                            if (STRATEGY === 'GE') isLowProb = isLowProbGE;
                            else if (STRATEGY === 'EXACT') isLowProb = isLowProbExact;
                            else isLowProb = isLowProbGE && isLowProbExact; // COMBINED

                            // Include Extension Gap in low prob calculation
                            const isLowProbFinal = isLowProb || isLowProbExt;

                            // === Dùng gapStats (>=) cho drop-off rate thay vì exactGapStats (==) ===
                            const currentGEInner = streak.gapStats ? streak.gapStats[currentLen] : null;
                            const nextGEInner = streak.gapStats ? streak.gapStats[nextLen] : null;
                            const currentCountInner = currentGEInner ? currentGEInner.count : 0;
                            const targetCount = nextGEInner ? nextGEInner.count : 0;
                            const targetFreqYear = targetCount / totalYears;

                            const isNextSuperRecord = targetFreqYear <= 0.5;
                            const isNextRecord = targetFreqYear <= 1.5;
                            const currentFreqYear = currentCountInner / totalYears;
                            const isCurrentSuper = currentFreqYear <= 0.5;

                            // Drop-off rate: dùng gapStats (>=)
                            let dropOffRateInner = 0;
                            let riskLabelInner = 'Rủi Ro Gãy';
                            if (streak.isPotential) {
                                const stepInner = isSoLePattern ? 2 : 1;
                                const formLen = currentLen + stepInner;
                                const gPrefix = streak.gapStats ? streak.gapStats[currentLen] : null;
                                const gForm = streak.gapStats ? streak.gapStats[formLen] : null;
                                const countPrefix = gPrefix ? gPrefix.count : 0;
                                const countForm = gForm ? gForm.count : 0;
                                const totalHistoricalDays = Math.max(1, Math.round(totalYears * 365.25));
                                const formationBaseCount = countPrefix > countForm ? countPrefix : totalHistoricalDays;
                                dropOffRateInner = formationBaseCount > 0 ? 1 - (countForm / formationBaseCount) : 1;
                                riskLabelInner = 'Không HT';
                            } else if (currentCountInner > 0) {
                                dropOffRateInner = 1 - (targetCount / currentCountInner);
                            } else {
                                dropOffRateInner = 1;
                            }

                            const isInnerRecord = dropOffRateInner >= 0.70;
                            const isInnerSuperRecord = dropOffRateInner >= 0.90;
                            const isInnerForecastRecord = targetFreqYear > 0 && targetFreqYear <= 1.5;

                            let probBadge = '';
                            if (isInnerSuperRecord) {
                                probBadge = `<span class="inline-block bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold mt-1">${riskLabelInner} ${(dropOffRateInner*100).toFixed(0)}%</span>`;
                            } else if (isInnerRecord) {
                                probBadge = `<span class="inline-block bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold mt-1">${riskLabelInner} ${(dropOffRateInner*100).toFixed(0)}%</span>`;
                            } else if (streak.isPotential && dropOffRateInner >= 0.50) {
                                const potBg = dropOffRateInner >= 0.70 ? 'bg-red-500 text-white' : 'bg-orange-100 text-orange-800';
                                probBadge = `<span class="inline-block ${potBg} text-[10px] px-1.5 py-0.5 rounded font-bold mt-1">⚡ Không HT ${(dropOffRateInner*100).toFixed(0)}%</span>`;
                            } else if (streak.isPotential) {
                                probBadge = `<span class="inline-block bg-orange-100 text-orange-800 text-[10px] px-1.5 py-0.5 rounded font-bold mt-1">🔮 Đang Hình Thành</span>`;
                            } else {
                                probBadge = `<span class="inline-block bg-green-100 text-green-800 text-[10px] px-1.5 py-0.5 rounded font-bold mt-1">✅ An Toàn Hơn (${(dropOffRateInner*100).toFixed(0)}% gãy)</span>`;
                            }

                            const cardBg = isInnerRecord ? (isInnerSuperRecord ? 'bg-purple-50' : 'bg-red-50') : (streak.isPotential ? 'bg-orange-50' : 'bg-white');


                            let freqHtml = '';
                            if (targetCount > 0) {
                                const actionText = streak.isPotential ? 'Hình thành' : 'Kéo dài';
                                freqHtml = `<div class="text-[11px] mt-1 border-t border-gray-100 pt-2 text-center text-gray-700">
                                    <div class="mb-1"><strong>Dự đoán ${actionText} (${nextLen} ngày)</strong></div>
                                    <div class="flex justify-between px-2 bg-gray-100 rounded py-1">
                                        <span>Số lần: <strong class="text-blue-600">${targetCount}</strong></span>
                                        <span>Tần suất: <strong class="${isNextRecord ? (isNextSuperRecord ? 'text-purple-600' : 'text-red-600') : 'text-green-600'}">${targetFreqYear.toFixed(2)} lần/năm</strong></span>
                                    </div>
                                    <div class="text-[10px] text-gray-500 mt-1 italic leading-tight">
                                        (Thống kê trong vòng ${totalYears.toFixed(1)} năm qua)
                                    </div>
                                </div>`;
                            }

                            if (freqHtml || gapInfoGE || gapInfoExact || extGapInfo) {
                                return `
                                    <div class="mt-2 pt-2 border-t border-gray-100 text-xs ${cardBg} -mx-4 -mb-4 p-4 rounded-b-lg">
                                        ${freqHtml}
                                        <div class="text-center mt-2">${probBadge}</div>
                                    </div>`;
                            } else if (typeof isRecordState !== 'undefined' && isRecordState) {
                                let badgeText = hasReachedOriginalRecord ? `🏆 Đạt ${isSuperLevel ? 'Siêu KL' : 'Kỷ Lục'}` : `🚧 Tới hạn ${isSuperLevel ? 'Siêu KL' : 'Kỷ Lục'}`;
                                return `
                                    <div class="mt-2 pt-2 border-t border-gray-100 text-xs ${isSuperLevel ? 'bg-purple-50' : 'bg-red-50'} -mx-4 -mb-4 p-4 rounded-b-lg">
                                        <div class="text-center">
                                            <span class="inline-block ${isSuperLevel ? 'bg-purple-500' : 'bg-red-500'} text-white text-[10px] px-1.5 py-0.5 rounded font-bold mt-1">${badgeText}</span>
                                        </div>
                                    </div>`;
                            }
                            return '';
                        })()}
                                    </div>
                                </div>`;
                });
                finalHtml += `</div></div>`;
            });
            currentStreaksContainer.innerHTML = finalHtml;
        } else {
            const dateSuffix = forDate ? ` (${forDate})` : '';
            currentStreaksTitle.innerHTML = `Chuỗi Đang Diễn Ra${dateSuffix} <span class="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 bg-red-600 rounded-full">0</span>`;
            currentStreaksContainer.innerHTML = `
                <div class="bg-white rounded-lg shadow-sm p-8 text-center border border-gray-100">
                    <div class="mb-3 text-gray-300">
                        <i class="bi bi-wind text-5xl"></i>
                    </div>
                    <p class="text-gray-500 font-medium">Hiện tại không có chuỗi nào đang diễn ra.</p>
                    <p class="text-xs text-gray-400 mt-1 italic">Hãy thử cập nhật dữ liệu mới nhất hoặc kiểm tra lại sau.</p>
                </div>
            `;
            currentStreaksSection.classList.remove('d-none');
        }
    };

    // Helper to detect pattern type
    const detectPatternType = (key) => {
        if (key.includes('tienLuiSoLe') || key.includes('luiTienSoLe')) {
            return 'tienLuiSoLe'; // Min 4
        } else if ((key.includes('veSole') || key.includes('veSoleMoi')) &&
            !key.includes('tienLuiSoLe') && !key.includes('luiTienSoLe')) {
            return 'soLe'; // Odd only (3, 5, 7...) min 3
        }
        return 'default'; // Min 2
    };

    // Filter gap entries based on pattern type
    const filterGapEntries = (entries, patternType) => {
        return entries.filter(([len, data]) => {
            if (data.count === 0) return false;
            const length = parseInt(len);

            if (patternType === 'tienLuiSoLe') {
                // Tiến-Lùi So Le: chỉ hiển thị >= 4
                return length >= 4;
            } else if (patternType === 'soLe') {
                // So Le: chỉ hiển thị số lẻ và >= 3
                return length >= 3 && length % 2 === 1;
            }
            // Default: >= 2
            return length >= 2;
        });
    };

    const renderGapTable = (stats, operator, key = '') => {
        const patternType = detectPatternType(key);
        const filteredEntries = filterGapEntries(Object.entries(stats), patternType);

        if (filteredEntries.length === 0) {
            return '<p class="text-xs text-gray-500">Không có dữ liệu phù hợp</p>';
        }

        return `
            <div class="overflow-x-auto">
                <table class="min-w-full text-xs text-left text-gray-500">
                    <thead class="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <th scope="col" class="px-2 py-1">Độ dài</th>
                            <th scope="col" class="px-2 py-1 text-green-700">MIN</th>
                            <th scope="col" class="px-2 py-1 text-yellow-700">AVG</th>
                            <th scope="col" class="px-2 py-1 text-red-700">MAX</th>
                            <th scope="col" class="px-2 py-1">Lần cuối</th>
                            <th scope="col" class="px-2 py-1">SL</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredEntries
                .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                .map(([len, data]) => {
                    const minDisplay = data.minGap !== null && data.minGap !== undefined ? `${data.minGap}(${data.minCount || 1})` : '-(0)';
                    const maxDisplay = data.maxGap !== null && data.maxGap !== undefined ? `${data.maxGap}(${data.maxCount || 1})` : '-(0)';
                    return `
                                <tr class="bg-white border-b hover:bg-gray-50">
                                    <td class="px-2 py-1 font-medium text-gray-900">${operator} ${len}</td>
                                    <td class="px-2 py-1 font-semibold text-green-600">${minDisplay}</td>
                                    <td class="px-2 py-1 font-semibold text-yellow-600">${data.avgGap || '-'}</td>
                                    <td class="px-2 py-1 font-semibold text-red-600">${maxDisplay}</td>
                                    <td class="px-2 py-1">${data.lastGap}</td>
                                    <td class="px-2 py-1">${data.count}</td>
                                </tr>
                            `;
                }).join('')}
                    </tbody>
                </table>
            </div>`;
    };

    // Render Extension Gap Table (gap from N to N+step)
    const renderExtensionGapTable = (stats, key) => {
        const patternType = detectPatternType(key);
        const isSoLe = patternType === 'soLe';
        const isTienLuiSoLe = patternType === 'tienLuiSoLe';
        const step = isSoLe ? 2 : 1;

        // Filter based on pattern type
        const filteredEntries = Object.entries(stats).filter(([len, data]) => {
            if (data.count === 0 && data.lastGap === 0) return false;
            const length = parseInt(len);

            if (isTienLuiSoLe) {
                return length >= 4;
            } else if (isSoLe) {
                return length >= 3 && length % 2 === 1;
            }
            return length >= 2;
        });

        if (filteredEntries.length === 0) {
            return '<p class="text-xs text-gray-500">Không có dữ liệu phù hợp</p>';
        }

        return `
            <div class="overflow-x-auto">
                <table class="min-w-full text-xs text-left text-gray-500">
                    <thead class="text-xs text-gray-700 uppercase bg-blue-50">
                        <tr>
                            <th scope="col" class="px-2 py-1">Từ→Đến</th>
                            <th scope="col" class="px-2 py-1 text-green-700">MIN</th>
                            <th scope="col" class="px-2 py-1 text-yellow-700">AVG</th>
                            <th scope="col" class="px-2 py-1 text-red-700">MAX</th>
                            <th scope="col" class="px-2 py-1">Lần cuối</th>
                            <th scope="col" class="px-2 py-1">SL</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredEntries
                .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                .map(([len, data]) => {
                    const fromLen = parseInt(len);
                    const toLen = fromLen + step;
                    const isLow = data.minGap !== null && data.lastGap < data.minGap;
                    const minDisplay = data.minGap !== null && data.minGap !== undefined ? `${data.minGap}(${data.minCount || 1})` : '-(0)';
                    const maxDisplay = data.maxGap !== null && data.maxGap !== undefined ? `${data.maxGap}(${data.maxCount || 1})` : '-(0)';
                    return `
                                <tr class="bg-white border-b hover:bg-gray-50">
                                    <td class="px-2 py-1 font-medium text-gray-900">${fromLen}→${toLen}</td>
                                    <td class="px-2 py-1 font-semibold text-green-600">${minDisplay}</td>
                                    <td class="px-2 py-1 font-semibold text-yellow-600">${data.avgGap || '-'}</td>
                                    <td class="px-2 py-1 font-semibold text-red-600">${maxDisplay}</td>
                                    <td class="px-2 py-1 ${isLow ? 'text-red-600 font-bold' : ''}">${data.lastGap || '-'}</td>
                                    <td class="px-2 py-1">${data.count}</td>
                                </tr>
                            `;
                }).join('')}
                    </tbody>
                </table>
            </div>`;
    };
    const renderRecordAccordionItem = (key, stat) => {
        const safeKey = key.replace(/:/g, '-');
        const longestInfo = stat.longest && stat.longest.length > 0 ? `${stat.longest[0].length} ngày (${stat.longest.length})` : 'N/A';
        const secondLongestInfo = stat.secondLongest && stat.secondLongest.length > 0 ? `${stat.secondLongest[0].length} (${stat.secondLongest.length})` : 'N/A';
        const avgIntervalInfo = stat.averageInterval !== null ? `${stat.averageInterval} ngày` : 'N/A';
        const sinceLastInfo = stat.daysSinceLast !== null ? `${stat.daysSinceLast} ngày` : 'N/A';

        const gapStatsSection = (stat.gapStats) ? `
            <div class="mt-3 col-span-1 md:col-span-2">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <h6 class="text-xs font-bold text-gray-700 mb-1">GAP STATS (GE >= Len):</h6>
                        ${renderGapTable(stat.gapStats, '>=', key)}
                    </div>
                    <div>
                        <h6 class="text-xs font-bold text-gray-700 mb-1">EXACT GAP STATS (== Len):</h6>
                        ${stat.exactGapStats ? renderGapTable(stat.exactGapStats, '==', key) : '<p class="text-xs text-gray-500">Không có dữ liệu</p>'}
                    </div>
                    <div>
                        <h6 class="text-xs font-bold text-blue-700 mb-1">EXTENSION GAP (N→N+step):</h6>
                        ${stat.extensionGapStats ? renderExtensionGapTable(stat.extensionGapStats, key) : '<p class="text-xs text-gray-500">Không có dữ liệu</p>'}
                    </div>
                </div>
            </div>
        ` : '';

        const itemHtml = `
                    <div x-data="{ open: false }">
                        <div @click="open = !open" class="record-accordion-button p-4 flex flex-wrap justify-between items-center cursor-pointer hover:bg-gray-50 border-b border-gray-100">
                             <span class="w-full lg:w-2/5 font-semibold text-gray-700 text-left">${stat.description}</span>
                             <div class="flex-grow grid grid-cols-4 gap-x-4 text-sm text-gray-500 text-left">
                                 <span><i class="bi bi-trophy"></i> KL: ${longestInfo}</span>
                                 <span><i class="bi bi-award"></i> Nhì: ${secondLongestInfo}</span>
                                 <span><i class="bi bi-arrow-repeat"></i> TB: ${avgIntervalInfo}</span>
                                 <span><i class="bi bi-hourglass-split"></i> Cuối: ${sinceLastInfo}</span>
                             </div>
                        </div>
                        <div x-show="open" x-transition class="bg-gray-50 p-4 accordion-content-highlight border-b border-gray-200" :class="{ 'expanded': open }">
                           <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                ${gapStatsSection}
                                <div class="mt-4">${renderStreakDetails('Kỷ lục', stat.longest, stat.description)}</div>
                                <div class="mt-4">${renderStreakDetails('Dài nhì', stat.secondLongest, stat.description)}</div>
                            </div>
                        </div>
                    </div>
                `;
        quickStatsContainer.insertAdjacentHTML('beforeend', itemHtml);
    };

    // SỬA LỖI: Hàm này nhận thêm 'description' để truyền xuống hàm con
    const renderStreakDetails = (title, streaks, description) => {
        if (!streaks || streaks.length === 0) return `<h6 class="font-semibold text-gray-600">${title}: Không có dữ liệu</h6>`;
        const sortedStreaks = streaks.sort((a, b) => parseDate(b.endDate) - parseDate(a.endDate));
        const streakLength = sortedStreaks[0].length;
        let detailsHtml = sortedStreaks.map(streak => `
                    <li class="mb-2">
                        <strong class="text-sm">${normDate(streak.startDate)} → ${normDate(streak.endDate)}</strong>
                        <div class="flex flex-wrap gap-1 mt-1">${renderFullSequence(streak, description)}</div>
                    </li>`).join('');
        return `<h6 class="font-semibold text-gray-600">${title} (Dài ${streakLength} ngày)</h6><ul class="list-none p-0 mt-2">${detailsHtml}</ul>`;
    };

    const handleStatsSubmit = async (event) => {
        event.preventDefault();
        resultTitle.textContent = `Kết Quả Truy Vấn (Đang tải...)`;
        resultContainer.innerHTML = '<div class="flex justify-center p-8"><div role="status" class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] text-indigo-600 motion-reduce:animate-[spin_1.5s_linear_infinite]"></div></div>';
        const selectedValue = statsTypeSelect.value;
        const [category, subcategory] = selectedValue.split(':');
        let url = `${BASE_URL}/api/statistics/stats?category=${category}&exactLength=${minLengthSelect.value}`;
        if (subcategory) { url += `&subcategory=${subcategory}`; }
        if (startDateInput.value) url += `&startDate=${toApiDateFormat(startDateInput.value)}`;
        if (endDateInput.value) url += `&endDate=${toApiDateFormat(endDateInput.value)}`;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Lỗi mạng: ${response.statusText}`);
            const data = await response.json();
            resultTitle.innerHTML = `${data.description || 'Kết Quả Truy Vấn'} <span class="inline-flex items-center justify-center px-2 py-1 text-sm font-bold leading-none text-blue-100 bg-blue-600 rounded-full">${data.streaks.length} kết quả</span>`;
            renderResults(data.streaks, data.description);
        } catch (error) {
            console.error('Lỗi khi fetch dữ liệu:', error);
            resultTitle.textContent = 'Có lỗi xảy ra khi tải dữ liệu.';
            resultContainer.innerHTML = '';
        }
    };

    // SỬA LỖI: Hàm này nhận thêm 'description' để truyền xuống hàm con
    const renderResults = (streaks, description) => {
        if (!streaks || streaks.length === 0) {
            resultContainer.innerHTML = `
                <div class="text-center py-8">
                    <p class="text-gray-500 mb-2">Không có chuỗi nào phù hợp với điều kiện lọc.</p>
                    <p class="text-xs text-gray-400 italic">Mẹo: Thử giảm độ dài tối thiểu hoặc chọn khoảng ngày rộng hơn.</p>
                </div>`;
            return;
        }
        const sortedStreaks = streaks.sort((a, b) => parseDate(b.endDate) - parseDate(a.endDate));
        let content = sortedStreaks.map(streak => {
            const isCurrentBadge = streak.isCurrent ? 
                `<span class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 animate-pulse">
                    <i class="bi bi-broadcast mr-1"></i> Đang Diễn Ra
                </span>` : '';

            return `
                    <div class="py-3 border-b border-gray-200 last:border-b-0">
                        <div class="relative group cursor-pointer inline-block" onclick="this.querySelector('.group-hover\\\\:block').classList.toggle('hidden')">
                            <p class="font-semibold hover:text-indigo-600 transition flex items-center gap-1">
                                ${formatStreakValue(streak, description)}${isCurrentBadge} <i class="bi bi-info-circle text-xs text-gray-400"></i>
                            </p>
                            ${streak.patternNumbers && streak.patternNumbers.length > 0 ? `
                            <div class="absolute left-0 top-full mt-2 w-64 p-3 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 hidden group-hover:block transition shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                                <p class="text-xs text-gray-400 mb-2 border-b border-gray-700 pb-1">Các số thuộc dạng chuỗi này (${streak.patternNumbers.length} số):</p>
                                <div class="flex flex-wrap gap-1">
                                    ${streak.patternNumbers.map(n => `<span class="px-1 py-0.5 bg-gray-800 text-gray-200 text-[10px] rounded border border-gray-700">${String(n).padStart(2, '0')}</span>`).join('')}
                                </div>
                            </div>
                            ` : ''}
                        </div>
                        <p class="text-sm text-gray-600">${streak.startDate} đến ${streak.endDate} (${streak.length} ngày)</p>
                        <div class="flex flex-wrap gap-1 mt-1">${renderFullSequence(streak, description)}</div>
                    </div>`;
        }).join('');
        resultContainer.innerHTML = content;
    };

    // Normalize date: nếu API trả YYYY-MM-DD thì convert sang DD/MM/YYYY
    const normDate = (d) => {
        if (!d) return '';
        if (d.includes('-')) {
            const parts = d.split('-');
            return `${parts[2].substring(0,2)}/${parts[1]}/${parts[0]}`;
        }
        return d;
    };

    const renderFullSequence = (streak, description) => {
        let sequenceToRender = streak.fullSequence;
        
        // Fallback: Nếu không có fullSequence (do lỗi hydrate), dùng dates và values có sẵn
        if (!sequenceToRender || sequenceToRender.length === 0) {
            if (streak.dates && streak.values && streak.dates.length === streak.values.length) {
                sequenceToRender = streak.dates.map((date, i) => ({
                    date: date,
                    value: streak.values[i]
                }));
            } else {
                return '<span></span>';
            }
        }

        // Normalize dates trong fullSequence
        const normalizedSeq = sequenceToRender.map(day => ({...day, date: normDate(day.date)}));
        // Normalize dates trong streak.dates
        const normalizedDates = streak.dates ? streak.dates.map(d => normDate(d)) : [];
        const streakDates = new Set(normalizedDates);

        const desc = (typeof description === 'string') ? description.toLowerCase() : '';
        const isTongTT = desc.includes('tổng tt');
        const isTongMoi = desc.includes('tổng mới');
        const isHieu = desc.includes('hiệu');
        const isTienLuiSoLe = desc.includes('tiến lùi') || desc.includes('lùi tiến');

        return normalizedSeq.map((day, index) => {
            // Check if this is the latest day (not part of actual streak)
            const isLatest = day.isLatest === true;
            const isInStreak = streakDates.has(day.date);

            let subText = '';
            if (isTongTT) {
                subText = `<span class="block text-blue-600 font-semibold">T${getTongTT(day.value)}</span>`;
            } else if (isTongMoi) {
                subText = `<span class="block text-blue-600 font-semibold">T${getTongMoi(day.value)}</span>`;
            } else if (isHieu) {
                subText = `<span class="block text-green-600 font-semibold">H${getHieu(day.value)}</span>`;
            } else if (isTienLuiSoLe && index > 0 && isInStreak) {
                // For tienLuiSoLe, show arrow indicating direction (only for streak items)
                // Find previous streak item index
                let prevIndex = index - 1;
                while (prevIndex >= 0 && !streakDates.has(normalizedSeq[prevIndex].date)) {
                    prevIndex--;
                }

                if (prevIndex >= 0) {
                    const prevValue = parseInt(normalizedSeq[prevIndex].value, 10);
                    const currValue = parseInt(day.value, 10);
                    const arrow = currValue > prevValue ? '↑' : (currValue < prevValue ? '↓' : '→');
                    subText = `<span class="block text-purple-600 font-bold">${arrow}</span>`;
                }
            }

            // Determine background color
            let bgClass = 'bg-gray-200';
            if (isInStreak && !isLatest) {
                bgClass = 'highlight';
            } else if (isLatest) {
                bgClass = 'bg-gray-300 border-2 border-dashed border-gray-400';
            } else if (!isInStreak) {
                // Intermediate day (skipped day in so le pattern)
                // Show with dashed border to indicate it doesn't affect the pattern
                bgClass = 'bg-gray-100 border-2 border-dashed border-gray-300 opacity-75';
            }

            return `
                        <div class="text-center p-1 rounded-md text-xs ${bgClass}">
                            <span class="font-mono text-base">${day.value}</span>
                            ${subText}
                            <span class="block text-gray-500">${day.date.substring(0, 5)}</span>
                        </div>`;
        }).join('');
    };

    // SỬA LỖI: Hàm này nhận 'description' để xác định cách hiển thị
    const formatStreakValue = (streak, description) => {
        // Luôn kiểm tra description trước
        const desc = (typeof description === 'string') ? description.toLowerCase() : '';
        const isTongTT = desc.includes('tổng tt');
        const isTongMoi = desc.includes('tổng mới');
        const isHieu = desc.includes('hiệu');

        // Trường hợp "Các tổng" hoặc "Các hiệu"
        if ((isTongTT || isTongMoi || isHieu) && (desc.includes('tổng') || desc.includes('hiệu'))) {
            if (isTongTT) return streak.values.map(v => `<b>T${getTongTT(v)}</b>`).join(' → ');
            if (isTongMoi) return streak.values.map(v => `<b>T${getTongMoi(v)}</b>`).join(' → ');
            if (isHieu) return streak.values.map(v => `<b>H${getHieu(v)}</b>`).join(' → ');
        }

        // Các trường hợp còn lại
        if (streak.value) { return `<b>${streak.value}</b>`; }
        if (streak.pair) return `Cặp [<b>${streak.pair.join(', ')}</b>]`;
        return streak.values.map(v => `<b>${v}</b>`).join(' → ');
    };

    const toApiDateFormat = (dateString) => {
        if (!dateString) return '';
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}/${year}`;
    };

    endDateInput.addEventListener('change', () => {
        const endDate = new Date(endDateInput.value);
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 360);
        startDateInput.valueAsDate = startDate;
    });

    form.addEventListener('submit', handleStatsSubmit);

    // Modal popup logic
    const versionModal = document.getElementById('versionModal');
    const closeVersionModalBtn = document.getElementById('closeVersionModalBtn');
    const understandVersionBtn = document.getElementById('understandVersionBtn');

    if (versionModal && closeVersionModalBtn && understandVersionBtn) {
        const v2PopupShown = localStorage.getItem('v2_2_popup_shown_2026_03_08');

        if (!v2PopupShown) {
            versionModal.classList.remove('hidden');
        }

        const closeModal = () => {
            versionModal.classList.add('hidden');
            localStorage.setItem('v2_2_popup_shown_2026_03_08', 'true');
        };

        closeVersionModalBtn.addEventListener('click', closeModal);
        understandVersionBtn.addEventListener('click', closeModal);

        // Close on clicking outside
        versionModal.addEventListener('click', (e) => {
            if (e.target === versionModal) {
                closeModal();
            }
        });
    }

    initializePage();
});
