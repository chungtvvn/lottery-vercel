document.addEventListener('DOMContentLoaded', function () {
    const suggestionsSection = document.getElementById('suggestions-section');
    const suggestionsContainer = document.getElementById('suggestions-container');

    // Tự động tải gợi ý khi trang load
    if (suggestionsSection && suggestionsContainer) {
        loadSuggestions();
    }

    async function loadSuggestions() {
        try {
            // 1. Fetch config from server to ensure sync with settings
            let config = {};
            try {
                const configRes = await fetch('/api/config');
                if (configRes.ok) {
                    config = await configRes.json();
                }
            } catch (e) {
                console.error('Error fetching config:', e);
            }

            // 2. Determine which API to use based on config
            const useConfidence = config.USE_CONFIDENCE_SCORE !== false;
            const strategy = config.EXCLUSION_STRATEGY || 'BALANCED';
            const gapStrategy = config.GAP_STRATEGY || 'COMBINED';
            const gapBuffer = config.GAP_BUFFER_PERCENT !== undefined ? config.GAP_BUFFER_PERCENT : 0;

            let url;
            if (useConfidence) {
                // Use new confidence-based API
                url = `/api/suggestions/confidence?strategy=${strategy}`;
            } else {
                // Use legacy API
                url = `/api/suggestions?gapStrategy=${gapStrategy}&gapBuffer=${gapBuffer}`;
            }

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Lỗi mạng khi tải gợi ý.');
            }
            const data = await response.json();
            renderSuggestions(data);
            suggestionsSection.style.display = 'block'; // Show the section
        } catch (error) {
            console.error('Lỗi khi tải gợi ý:', error);
            suggestionsContainer.innerHTML = `<div class="p-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">Không thể tải gợi ý. Vui lòng thử lại.</div>`;
            suggestionsSection.style.display = 'block';
        }
    }

    function renderSuggestions(data) {
        if (!data || (!data.explanations && !data.excludedNumbers)) {
            suggestionsContainer.innerHTML = `<div class="p-4 text-sm text-blue-700 bg-blue-100 rounded-lg" role="alert">Hiện tại không có gợi ý nào nổi bật.</div>`;
            suggestionsContainer.style.display = 'block';
            return;
        }

        // Phần tổng hợp các số NÊN ÔM
        let numbersToBetHtml = '';
        if (data.numbersToBet && data.numbersToBet.length > 0) {
            data.numbersToBet.forEach(num => {
                numbersToBetHtml += `<span class="inline-block bg-green-600 text-white text-sm font-semibold mr-2 px-2.5 py-1 rounded-full">${String(num).padStart(2, '0')}</span>`;
            });
        } else {
            numbersToBetHtml = '<span class="text-gray-500">Không có số nào được đề xuất để ôm.</span>';
        }

        // Phần tổng hợp các số LOẠI TRỪ (với màu theo tier)
        let excludedNumbersHtml = '';
        if (data.excludedNumbers && data.excludedNumbers.length > 0) {
            // Tạo map từ số -> tier để hiển thị màu đúng
            const numberToTier = {};
            if (data.exclusionsByTier) {
                const tierOrder = ['red', 'purple', 'orange', 'light_red'];
                tierOrder.forEach(tier => {
                    if (data.exclusionsByTier[tier]) {
                        data.exclusionsByTier[tier].forEach(num => {
                            if (!numberToTier[num]) {
                                numberToTier[num] = tier;
                            }
                        });
                    }
                });
            }

            // Định nghĩa màu theo tier (không còn light_orange)
            const tierColors = {
                red: 'bg-red-600',
                purple: 'bg-purple-600',
                orange: 'bg-orange-500',
                light_red: 'bg-red-400'
            };

            excludedNumbersHtml = '<div class="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">';
            data.excludedNumbers.forEach(num => {
                const tier = numberToTier[num] || 'red';
                const colorClass = tierColors[tier] || 'bg-red-600';
                excludedNumbersHtml += `<div class="flex justify-center"><span class="inline-block ${colorClass} text-white text-base font-bold px-3 py-2 rounded shadow-sm w-12 text-center">${String(num).padStart(2, '0')}</span></div>`;
            });
            excludedNumbersHtml += '</div>';

            // Thêm legend cho tier (không còn light_orange)
            if (data.tierInfo) {
                excludedNumbersHtml += `
                    <div class="mt-4 flex flex-wrap gap-3 text-sm">
                        <span class="flex items-center"><span class="w-3 h-3 rounded bg-red-600 mr-1"></span>Đỏ (${data.tierInfo.countByTier?.red || 0})</span>
                        <span class="flex items-center"><span class="w-3 h-3 rounded bg-purple-600 mr-1"></span>Tím (${data.tierInfo.countByTier?.purple || 0})</span>
                    </div>
                    <div class="mt-2 text-sm text-gray-600">
                        Tổng: ${data.excludedCount || 0} số
                    </div>
                `;
            }
        } else {
            excludedNumbersHtml = '<span class="text-gray-500 italic">Không có số nào bị loại trừ hôm nay.</span>';
        }

        // Phần giải thích chi tiết
        let explanationsHtml = '';
        if (data.explanations) {
            data.explanations.forEach(item => {
                const isBetOn = item.type === 'bet-on';
                const isExclude = item.type === 'exclude';

                let cardBorderClass, headerBgClass, titleClass, numberBadgeClass;

                if (isBetOn) {
                    cardBorderClass = 'border-green-500';
                    headerBgClass = 'bg-green-100';
                    titleClass = 'text-green-800';
                    numberBadgeClass = 'bg-green-600';
                } else if (isExclude) {
                    // Xác định tier từ data (nếu có) hoặc từ explanation text
                    const tier = item.tier;
                    const isPotential = item.explanation && item.explanation.includes('Chuỗi tiềm năng');

                    if (tier === 'purple' || isPotential) {
                        // PURPLE - Tiềm năng
                        cardBorderClass = 'border-purple-500';
                        headerBgClass = 'bg-purple-100';
                        titleClass = 'text-purple-800';
                        numberBadgeClass = 'bg-purple-600';
                    } else if (tier === 'light_red') {
                        // LIGHT RED - Đỏ nhạt
                        cardBorderClass = 'border-red-300';
                        headerBgClass = 'bg-red-50';
                        titleClass = 'text-red-700';
                        numberBadgeClass = 'bg-red-400';
                    } else if (tier === 'orange') {
                        // ORANGE - Cam
                        cardBorderClass = 'border-orange-500';
                        headerBgClass = 'bg-orange-100';
                        titleClass = 'text-orange-800';
                        numberBadgeClass = 'bg-orange-500';
                    } else if (tier === 'light_orange') {
                        // LIGHT ORANGE - Cam nhạt
                        cardBorderClass = 'border-orange-300';
                        headerBgClass = 'bg-orange-50';
                        titleClass = 'text-orange-700';
                        numberBadgeClass = 'bg-orange-400';
                    } else {
                        // RED (default) - Đỏ đậm
                        cardBorderClass = 'border-red-500';
                        headerBgClass = 'bg-red-100';
                        titleClass = 'text-red-800';
                        numberBadgeClass = 'bg-red-600';
                    }
                } else {
                    cardBorderClass = 'border-yellow-500';
                    headerBgClass = 'bg-yellow-100';
                    titleClass = 'text-yellow-800';
                    numberBadgeClass = 'bg-gray-400';
                }

                let numbersHtml = '';
                if (item.numbers && item.numbers.length > 0) {
                    numbersHtml = '<div class="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">';
                    item.numbers.forEach(num => {
                        numbersHtml += `<div class="flex justify-center"><span class="inline-block ${numberBadgeClass} text-white text-sm font-semibold px-2 py-1 rounded w-10 text-center">${String(num).padStart(2, '0')}</span></div>`;
                    });
                    numbersHtml += '</div>';
                }

                explanationsHtml += `
                            <div class="bg-white rounded-lg shadow-sm border-l-4 ${cardBorderClass} mb-4">
                                <div class="p-4 rounded-t-lg ${headerBgClass}">
                                    <strong class="font-semibold ${titleClass}">${item.title}</strong>
                                </div>
                                <div class="p-4">
                                    <p class="text-gray-700 text-sm mb-3">${item.explanation}</p>
                                    <p class="text-xs font-semibold text-gray-600 mb-2">CÁC SỐ BỊ LOẠI TRỪ:</p>
                                    ${numbersHtml}
                                </div>
                            </div>`;
            });
        }

        // Gộp tất cả lại - KHÔNG có collapsible nested (parent đã có)
        const strategyInfo = data.strategyInfo || {};
        const methodLabel = strategyInfo.method === 'VOTING' ? 'Bình chọn' : 'Confidence';

        // Update header count
        const countSpan = document.getElementById('exclusion-count');
        if (countSpan) {
            countSpan.textContent = `(${data.excludedNumbers?.length || 0} số - ${strategyInfo.strategy || 'BALANCED'})`;
        }

        const finalHtml = `
            <div class="mb-6">
                <h6 class="font-bold text-gray-800 mb-3">CÁC SỐ LOẠI TRỪ (KHÓ VỀ):</h6>
                ${excludedNumbersHtml}
            </div>
            
            <hr class="my-4">
            <h5 class="text-lg font-bold text-gray-900 mb-3">GIẢI THÍCH CHI TIẾT:</h5>
            ${explanationsHtml}
        `;

        suggestionsContainer.innerHTML = finalHtml;
        suggestionsContainer.style.display = 'block';
    }
});
