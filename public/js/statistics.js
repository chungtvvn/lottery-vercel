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

        let globalActiveStreaksHistory = [];
        let currentSelectedHistoryDate = null;
        let recentLotteryData = [];

        const today = new Date();
        endDateInput.valueAsDate = today;
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - 360);
        startDateInput.valueAsDate = pastDate;

        // Remove `fetchQuickStats();` from here because we will call `fetchQuickStats` inside `fetchRecentResults` if needed? No, `fetchQuickStats` is standalone. 
        fetchQuickStats();
        fetchLastUpdateDate();
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
                const dateObj = new Date(item.date);
                const dateStr = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;
                specialLookup[dateStr] = item.special;
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
            let finalHtml = '';
            sortedLengths.forEach(length => {
                finalHtml += `
                            <div class="mt-4">
                                <h4 class="text-sm font-semibold text-gray-600 uppercase tracking-wider flex justify-between items-center border-b pb-2 mb-4">
                                    <span><i class="bi bi-fire"></i> ${length == 1 ? 'Chuỗi tiềm năng kỷ lục (2 ngày)' : 'Chuỗi'}</span>
                                    ${length != 1 ? `<span class="font-bold text-lg text-red-500">${length} Ngày</span>` : ''}
                                </h4>
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">`;

                streaksByLength[length].forEach(streak => {
                    const streakLen = parseInt(length);
                    // Check for so le pattern 
                    const isTienLuiSoLePattern = (streak.key && (streak.key.includes('tienLuiSoLe') || streak.key.includes('luiTienSoLe'))) || (streak.description && (streak.description.includes('Tiến-Lùi') || streak.description.includes('Lùi-Tiến')));
                    const isSoLePatternOuter = (streak.key && (streak.key.toLowerCase().includes('sole') || streak.key.toLowerCase().includes('solemoi')) && !isTienLuiSoLePattern) || (streak.description && streak.description.toLowerCase().includes('so le') && !isTienLuiSoLePattern);

                    const targetLenOuter = isSoLePatternOuter ? streakLen + 2 : streakLen + 1;
                    const gapInfoOuter = streak.exactGapStats ? streak.exactGapStats[targetLenOuter] : null;
                    const targetCountOuter = gapInfoOuter ? gapInfoOuter.count : 0;
                    const targetFreqYearOuter = targetCountOuter / totalYears;

                    const isNextSuperRecordOuter = targetFreqYearOuter <= 0.5;
                    const isNextRecordOuter = targetFreqYearOuter <= 1.5;

                    const hasReachedRecordOuter = streakLen >= streak.recordLength && streak.recordLength > 0;
                    const isRecord = hasReachedRecordOuter || isNextRecordOuter;
                    const isSuperRecord = (hasReachedRecordOuter ? streak.isSuperRecord : isNextSuperRecordOuter);

                    const borderColor = isRecord ? (isSuperRecord ? 'border-l-purple-700' : 'border-l-red-700') : 'border-l-blue-300';
                    const bgColor = isRecord ? (isSuperRecord ? 'bg-purple-50' : 'bg-red-50') : 'bg-white';
                    const titleWeight = isRecord ? 'font-bold' : 'font-semibold';


                    const superBadge = isSuperRecord ? '<span class="ml-2 inline-block bg-purple-600 text-white text-[9px] px-1 py-0.5 rounded uppercase">Siêu KL</span>' : '';

                    finalHtml += `
                                <div class="${bgColor} rounded-lg shadow-sm border border-l-4 ${borderColor} transition hover:shadow-lg hover:-translate-y-1">
                                    <div class="p-4 flex flex-col h-full">
                                        
                                        <div class="relative group cursor-pointer" onclick="this.querySelector('.group-hover\\:block').classList.toggle('hidden')">
                                            <h6 class="${titleWeight} text-gray-800 hover:text-indigo-600 transition flex items-center gap-1">
                                                ${streak.description}${superBadge} <i class="bi bi-info-circle text-xs text-gray-400"></i>
                                            </h6>
                                            ${streak.patternNumbers && streak.patternNumbers.length > 0 ? `
                                            <div class="absolute left-0 top-full mt-2 w-64 p-3 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 hidden group-hover:block transition shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                                                <p class="text-xs text-gray-400 mb-2 border-b border-gray-700 pb-1">Các số có thể xuất hiện tiếp theo (${streak.patternNumbers.length} số):</p>
                                                <div class="flex flex-wrap gap-1">
                                                    ${streak.patternNumbers.map(n => `<span class="px-1 py-0.5 bg-gray-800 text-gray-200 text-[10px] rounded border border-gray-700">${String(n).padStart(2, '0')}</span>`).join('')}
                                                </div>
                                            </div>
                                            ` : ''}
                                        </div>

                                        <p class="text-xs text-gray-500 mb-1">Từ ngày: ${streak.startDate}</p>
                                        <p class="text-xs ${isRecord ? 'text-red-500 font-bold' : 'text-gray-500'}">Mốc kỷ lục mới: ${streak.recordLength} ngày</p>
                                        <div class="mt-auto pt-2">
                                           <div class="flex flex-wrap gap-1">${renderFullSequence(streak, streak.description)}</div>
                                        </div>
                        ${(() => {
                            // Check for Tiến Lùi So Le pattern (special handling)
                            const isTienLuiSoLeByKey = streak.key && (streak.key.includes('tienLuiSoLe') || streak.key.includes('luiTienSoLe'));
                            const isTienLuiSoLeByDesc = streak.description && (streak.description.includes('Tiến-Lùi') || streak.description.includes('Lùi-Tiến'));
                            const isTienLuiSoLePattern = isTienLuiSoLeByKey || isTienLuiSoLeByDesc;

                            // Check for so le pattern - check both key and description (excluding Tiến Lùi So Le)
                            const isSoLeByKey = streak.key && (streak.key.toLowerCase().includes('sole') || streak.key.toLowerCase().includes('solemoi')) && !isTienLuiSoLePattern;
                            const isSoLeByDesc = streak.description && streak.description.toLowerCase().includes('so le') && !isTienLuiSoLePattern;
                            const isSoLePattern = isSoLeByKey || isSoLeByDesc;

                            // Tiến Lùi So Le: step = 1, So Le thường: step = 2
                            const nextLen = isSoLePattern ? parseInt(length) + 2 : parseInt(length) + 1;
                            const currentLen = parseInt(length);
                            const hasReachedRecord = currentLen >= streak.recordLength && streak.recordLength > 0;

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

                            // --- NEW LOGIC: Prediction for NEXT day Record ---
                            const targetCount = gapInfoExact ? gapInfoExact.count : 0;
                            const targetFreqYear = targetCount / totalYears;

                            const isNextSuperRecord = targetFreqYear <= 0.5;
                            const isNextRecord = targetFreqYear <= 1.5;

                            // Badge - show different messages based on condition
                            // LOGIC MỚI: Chỉ hiện "Khó" khi là Kỷ lục/Siêu kỷ lục (freq <= 1.5)
                            // Gap analysis cũ bị bỏ qua nếu tần suất > 1.5 lần/năm
                            let probBadge;
                            if (hasReachedRecord) {
                                probBadge = `<span class="inline-block ${streak.isSuperRecord ? 'bg-purple-600' : 'bg-red-600'} text-white text-[10px] px-1.5 py-0.5 rounded font-bold mt-1">🏆 Đạt ${streak.isSuperRecord ? 'Siêu KL' : 'Kỷ Lục'}</span>`;
                            } else if (isNextRecord) {
                                // Tới hạn kỷ lục/siêu kỷ lục (freq <= 1.5)
                                probBadge = `<span class="inline-block ${isNextSuperRecord ? 'bg-purple-600' : 'bg-red-600'} text-white text-[10px] px-1.5 py-0.5 rounded font-bold mt-1">🚧 Tới hạn ${isNextSuperRecord ? 'Siêu KL' : 'Kỷ Lục'}</span>`;
                            } else {
                                // targetFreqYear > 1.5 → Dễ tiếp tục (bất kể gap analysis nói gì)
                                // Gap "Khó lên/Khó kéo dài" không còn áp dụng vì logic chỉ dựa trên kỷ lục
                                probBadge = `<span class="inline-block bg-green-100 text-green-800 text-[10px] px-1.5 py-0.5 rounded font-bold mt-1">✅ Dễ Tiếp Tục</span>`;
                            }


                            // isWarning chỉ dựa trên kỷ lục/siêu kỷ lục (không còn dùng gap analysis)
                            const isWarning = hasReachedRecord || isNextRecord;
                            const isSuperLevel = hasReachedRecord ? streak.isSuperRecord : isNextSuperRecord;
                            const cardBg = (hasReachedRecord || isNextRecord) ? (isSuperLevel ? 'bg-purple-50' : 'bg-red-50') : 'bg-white';


                            let freqHtml = '';
                            if (targetCount > 0) {
                                freqHtml = `<div class="text-[11px] mt-1 border-t border-gray-100 pt-2 text-center text-gray-700">
                                    <div class="mb-1"><strong>Dự đoán Kéo dài (${nextLen} ngày)</strong></div>
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
                            } else if (hasReachedRecord || isNextRecord) {
                                let badgeText = hasReachedRecord ? `🏆 Đạt ${isSuperLevel ? 'Siêu KL' : 'Kỷ Lục'}` : `🚧 Tới hạn ${isSuperLevel ? 'Siêu KL' : 'Kỷ Lục'}`;
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
            currentStreaksSection.classList.add('d-none');
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
                        <strong class="text-sm">${streak.startDate} → ${streak.endDate}</strong>
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
            resultContainer.innerHTML = '<p class="text-gray-500">Không có chuỗi nào phù hợp với điều kiện lọc.</p>';
            return;
        }
        const sortedStreaks = streaks.sort((a, b) => parseDate(b.endDate) - parseDate(a.endDate));
        let content = sortedStreaks.map(streak => `
                    <div class="py-3 border-b border-gray-200 last:border-b-0">
                        <div class="relative group cursor-pointer inline-block" onclick="this.querySelector('.group-hover\\\\:block').classList.toggle('hidden')">
                            <p class="font-semibold hover:text-indigo-600 transition flex items-center gap-1">
                                ${formatStreakValue(streak, description)} <i class="bi bi-info-circle text-xs text-gray-400"></i>
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
                    </div>`).join('');
        resultContainer.innerHTML = content;
    };

    // SỬA LỖI: Hàm này nhận 'description' để xác định cách hiển thị
    const renderFullSequence = (streak, description) => {
        if (!streak.fullSequence) return '<span></span>';
        const streakDates = new Set(streak.dates);

        const desc = (typeof description === 'string') ? description.toLowerCase() : '';
        const isTongTT = desc.includes('tổng tt');
        const isTongMoi = desc.includes('tổng mới');
        const isHieu = desc.includes('hiệu');
        const isTienLuiSoLe = desc.includes('tiến lùi') || desc.includes('lùi tiến');

        return streak.fullSequence.map((day, index) => {
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
                while (prevIndex >= 0 && !streakDates.has(streak.fullSequence[prevIndex].date)) {
                    prevIndex--;
                }

                if (prevIndex >= 0) {
                    const prevValue = parseInt(streak.fullSequence[prevIndex].value, 10);
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
