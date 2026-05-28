document.addEventListener('DOMContentLoaded', function () {
    const suggestionsSection = document.getElementById('suggestions-section');
    const suggestionsContainer = document.getElementById('suggestions-container');

    // NEW: Prediction summary section (above "Chuỗi Đang Diễn Ra")
    const predictionSummarySection = document.getElementById('prediction-summary-section');
    const predictionSummaryContainer = document.getElementById('prediction-summary-container');
    const predictionSummaryTitle = document.getElementById('prediction-summary-title');
    const predictionSummaryCount = document.getElementById('prediction-summary-count');

    // Tự động tải gợi ý khi trang load
    if (predictionSummarySection && predictionSummaryContainer) {
        loadSuggestions();
    }

    // --- CLIENT-SIDE CACHING (2 Hours Expiry) ---
    const cleanupExpiredCache = () => {
        const CACHE_PREFIX = 'ls_cache_';
        const CACHE_EXPIRY = 2 * 60 * 60 * 1000; // 2 hours
        const now = Date.now();
        try {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith(CACHE_PREFIX)) {
                    try {
                        const item = JSON.parse(localStorage.getItem(key));
                        if (item && item.timestamp && (now - item.timestamp > CACHE_EXPIRY)) {
                            localStorage.removeItem(key);
                            console.log(`[Cache Cleanup] Expired key removed: ${key}`);
                        }
                    } catch (e) {
                        localStorage.removeItem(key);
                    }
                }
            });
        } catch (e) {
            console.warn('LocalStorage access is blocked or full:', e);
        }
    };

    const fetchJSON = async (url) => {
        const CACHE_PREFIX = 'ls_cache_';
        const CACHE_EXPIRY = 2 * 60 * 60 * 1000; // 2 hours
        const cacheKey = `${CACHE_PREFIX}${url}`;
        
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const item = JSON.parse(cached);
                if (item && item.timestamp && (Date.now() - item.timestamp < CACHE_EXPIRY)) {
                    console.log(`[Cache Hit] ${url}`);
                    return item.data;
                } else {
                    localStorage.removeItem(cacheKey);
                }
            }
        } catch (e) {
            // Ignore cache error, fetch from network
        }

        console.log(`[Cache Miss] Fetching from network: ${url}`);
        const res = await fetch(url);
        if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.json();
        
        try {
            localStorage.setItem(cacheKey, JSON.stringify({
                timestamp: Date.now(),
                data: data
            }));
        } catch (e) {
            console.warn('Failed to save to localStorage:', e);
        }
        
        return data;
    };

    async function loadSuggestions() {
        if (window.AppConfig && typeof window.AppConfig.checkAndClearCacheOnNewData === 'function') {
            await window.AppConfig.checkAndClearCacheOnNewData();
        }
        cleanupExpiredCache();
        try {
            // 1. Fetch config from server to ensure sync with settings
            let config = {};
            try {
                config = await fetchJSON('/api/config');
            } catch (e) {
                console.error('Error fetching config:', e);
            }

            // 2. Determine which API to use based on config
            const strategy = config.EXCLUSION_STRATEGY || 'BALANCED';
            const gapStrategy = config.GAP_STRATEGY || 'COMBINED';
            const gapBuffer = config.GAP_BUFFER_PERCENT !== undefined ? config.GAP_BUFFER_PERCENT : 0;

            // All requests now go to /api/suggestions
            const url = `/api/suggestions?gapStrategy=${gapStrategy}&gapBuffer=${gapBuffer}&strategy=${strategy}`;

            const data = await fetchJSON(url);

            // NEW: Render compact prediction summary
            if (predictionSummarySection && predictionSummaryContainer) {
                renderPredictionSummary(data);
            }
        } catch (error) {
            console.error('Lỗi khi tải gợi ý:', error);
        }
    }

    /**
     * NEW: Render compact prediction summary into the section above "Chuỗi Đang Diễn Ra"
     */
    function renderPredictionSummary(data) {
        if (!data || !data.exclusionsBySubTier) {
            predictionSummarySection.style.display = 'none';
            return;
        }

        // Calculate next prediction date
        let nextDateStr = 'Ngày tiếp theo';
        if (data.last30Days && data.last30Days.length > 0) {
            try {
                const latest = new Date(data.last30Days[0].date);
                latest.setDate(latest.getDate() + 1);
                nextDateStr = latest.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
            } catch (e) {}
        }

        // 1. Build explanationsBySubTier FIRST to ensure we have all data
        const explanationsBySubTier = {};
        if (data.explanations) {
            data.explanations.forEach(exp => {
                if (exp.subTier) {
                    if (!explanationsBySubTier[exp.subTier]) explanationsBySubTier[exp.subTier] = [];
                    explanationsBySubTier[exp.subTier].push(exp);
                }
            });
        }

        // Helper to get all unique numbers for a subTier directly from its explanations
        const getNumbersFromExplanations = (subTierKey) => {
            const exps = explanationsBySubTier[subTierKey] || [];
            const nums = new Set();
            exps.forEach(exp => {
                if (exp.numbers) {
                    exp.numbers.forEach(n => nums.add(parseInt(n, 10)));
                }
            });
            return Array.from(nums);
        };

        // 2. Sub-tier groups with Vietnamese labels and colors
        const subTierGroups = [
            {
                key: 'achieved',
                emoji: '🔴',
                label: 'ĐẠT KỶ LỤC',
                description: 'Chuỗi đã vượt hoặc bằng mốc kỷ lục. Xác suất tiếp tục gần bằng 0.',
                numbers: getNumbersFromExplanations('achieved'),
                bgClass: 'bg-red-50',
                borderClass: 'border-red-400',
                badgeClass: 'bg-red-600',
                textClass: 'text-red-800',
                headerBg: 'bg-red-100'
            },
            {
                key: 'threshold',
                emoji: '🟠',
                label: 'TỚI HẠN KỶ LỤC',
                description: 'Chuỗi chỉ cần thêm 1 ngày là đạt kỷ lục. Lên tiếp cực khó.',
                numbers: getNumbersFromExplanations('threshold'),
                bgClass: 'bg-orange-50',
                borderClass: 'border-orange-400',
                badgeClass: 'bg-orange-500',
                textClass: 'text-orange-800',
                headerBg: 'bg-orange-100'
            },
            {
                key: 'achievedSuper',
                emoji: '🟡',
                label: 'ĐẠT SIÊU KỶ LỤC',
                description: 'Chuỗi đã đạt Siêu Kỷ Lục (cực kỳ hiếm). Gần như không thể tiếp tục.',
                numbers: getNumbersFromExplanations('achievedSuper'),
                bgClass: 'bg-yellow-50',
                borderClass: 'border-yellow-500',
                badgeClass: 'bg-yellow-600',
                textClass: 'text-yellow-900',
                headerBg: 'bg-yellow-100'
            },
            {
                key: 'superThreshold',
                emoji: '🟣',
                label: 'TỚI HẠN SIÊU KỶ LỤC',
                description: 'Chuỗi tới hạn Siêu Kỷ Lục. Lên tiếp cực kỳ khó.',
                numbers: getNumbersFromExplanations('superThreshold'),
                bgClass: 'bg-purple-50',
                borderClass: 'border-purple-400',
                badgeClass: 'bg-purple-600',
                textClass: 'text-purple-800',
                headerBg: 'bg-purple-100'
            }
        ];

        const totalExcluded = data.excludedNumbers ? data.excludedNumbers.length : 0;
        const totalBet = data.numbersToBet ? data.numbersToBet.length : 0;

        // Update title with date
        predictionSummaryTitle.innerHTML = `Tổng Hợp Dự Đoán — <span class="text-red-600 font-bold">${nextDateStr}</span>`;
        predictionSummaryCount.textContent = `(Loại ${totalExcluded} số • Đánh ${totalBet} số)`;

        // Build sub-tier sections
        let subTierHtml = '';
        let hasAnyNumbers = false;

        subTierGroups.forEach(group => {
            if (group.numbers.length === 0) return;
            hasAnyNumbers = true;

            const sortedNumbers = group.numbers.sort((a, b) => a - b);
            const groupExplanations = explanationsBySubTier[group.key] || [];

            // Build compact explanation list
            let explanationList = '';
            if (groupExplanations.length > 0) {
                explanationList = `
                    <div class="mt-3 space-y-2">
                        ${groupExplanations.map(exp => {
                            const nums = exp.numbers || [];
                            const numsHtml = nums.map(n => 
                                '<span class="' + group.badgeClass + ' opacity-90 text-white font-bold px-1.5 py-0.5 rounded text-[10px]">' + String(n).padStart(2, '0') + '</span>'
                            ).join(' ');
                            return `
                            <div class="flex flex-col gap-1.5 text-xs ${group.textClass} bg-white/80 p-2.5 rounded-lg border border-white shadow-sm">
                                <div class="flex sm:items-center sm:flex-row flex-col gap-1 sm:gap-2">
                                    <span class="font-bold whitespace-nowrap min-w-[120px] pb-1 sm:pb-0 border-b sm:border-0 border-gray-100">${exp.title || ''}</span>
                                    <span class="text-gray-600 flex-1 leading-relaxed">${(exp.explanation || exp.reason || '').replace(/\[.*?\]\s*/, '')}</span>
                                </div>
                                ${nums.length > 0 ? `<div class="flex flex-wrap gap-1 mt-0.5 sm:pl-[128px]">${numsHtml}</div>` : ''}
                            </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }

            subTierHtml += `
                <div class="${group.bgClass} rounded-xl border ${group.borderClass} overflow-hidden mb-4 shadow-sm">
                    <div class="${group.headerBg} px-4 py-2.5 flex items-center justify-between">
                        <h5 class="font-bold ${group.textClass} flex items-center gap-2 text-sm">
                            <span class="text-lg">${group.emoji}</span>
                            ${group.label}
                            <span class="${group.badgeClass} text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">${sortedNumbers.length} số</span>
                        </h5>
                        <p class="text-[10px] ${group.textClass} opacity-70 italic hidden sm:block">${group.description}</p>
                    </div>
                    <div class="p-4">
                        <div class="flex flex-wrap gap-1.5">
                            ${sortedNumbers.map(num => `
                                <span class="${group.badgeClass} text-white text-sm font-black px-2.5 py-1.5 rounded-lg shadow-sm min-w-[36px] text-center transition hover:scale-110 hover:shadow-md cursor-default">
                                    ${String(num).padStart(2, '0')}
                                </span>
                            `).join('')}
                        </div>
                        ${explanationList}
                    </div>
                </div>
            `;
        });

        if (!hasAnyNumbers) {
            subTierHtml = '<div class="text-center py-8 text-gray-400"><i class="bi bi-check-circle text-4xl text-green-400"></i><p class="mt-2 text-sm">Không có số nào bị loại trừ hôm nay.</p></div>';
        }

        // Build betting numbers section (sorted by rarity)
        let bettingHtml = '';
        if (data.numbersToBetWithGap && data.numbersToBetWithGap.length > 0) {
            bettingHtml = `
                <div class="mt-6 bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl border border-emerald-200 overflow-hidden shadow-sm">
                    <div class="bg-emerald-100 px-4 py-2.5 flex items-center justify-between">
                        <h5 class="font-bold text-emerald-900 flex items-center gap-2 text-sm">
                            <span class="text-lg">🎯</span>
                            CÁC SỐ ĐÁNH
                            <span class="bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">${data.numbersToBetWithGap.length} số</span>
                        </h5>
                        <span class="text-[10px] text-emerald-600 font-semibold bg-white px-2 py-1 rounded-full border border-emerald-200 uppercase tracking-tight">Sắp xếp theo độ hiếm ↓</span>
                    </div>
                    <div class="p-4">
                        <div class="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-3 space-y-1">
                            ${data.numbersToBetWithGap.map((item, index) => {
                                const num = String(item.num).padStart(2, '0');
                                const gap = item.gap;
                                let gapColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
                                let numWeight = 'text-emerald-900';
                                if (gap >= 15) { gapColor = 'text-red-700 bg-red-50 border-red-200'; numWeight = 'text-red-900'; }
                                else if (gap >= 8) { gapColor = 'text-orange-700 bg-orange-50 border-orange-200'; numWeight = 'text-orange-900'; }

                                return `
                                    <div class="break-inside-avoid flex items-center justify-between py-1.5 px-2 hover:bg-white/80 transition rounded-lg">
                                        <div class="flex items-center gap-1.5">
                                            <span class="text-[10px] text-gray-400 w-5 font-mono text-right">${index + 1}.</span>
                                            <span class="text-lg font-black ${numWeight} leading-none">${num}</span>
                                        </div>
                                        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${gapColor} whitespace-nowrap">Gan ${gap}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;
        }

        predictionSummaryContainer.innerHTML = subTierHtml + bettingHtml;
        predictionSummarySection.style.display = 'block';
    }
});
