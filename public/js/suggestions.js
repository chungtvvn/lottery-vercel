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

        // Phần tổng hợp các số NÊN ÔM (CÁC SỐ ĐÁNH)
        let numbersToBetHtml = '';
        if (data.numbersToBetWithGap && data.numbersToBetWithGap.length > 0) {
            data.numbersToBetWithGap.forEach(item => {
                const num = String(item.num).padStart(2, '0');
                const gap = item.gap;
                let gapBadge = '';
                if (gap >= 15) {
                    gapBadge = `<span class="bg-red-500 text-white text-[10px] px-1 py-0.5 rounded-full ml-1" title="Gan cực lâu">Gan ${gap}</span>`;
                } else if (gap >= 8) {
                    gapBadge = `<span class="bg-orange-500 text-white text-[10px] px-1 py-0.5 rounded-full ml-1" title="Gan khá lâu">Gan ${gap}</span>`;
                } else {
                    gapBadge = `<span class="bg-green-700 text-white text-[10px] px-1 py-0.5 rounded-full ml-1" title="Về gần đây">Cách ${gap}</span>`;
                }
                numbersToBetHtml += `<span class="inline-flex items-center bg-green-600 text-white text-sm font-semibold mr-2 mb-2 px-2.5 py-1.5 rounded-lg border border-green-700 shadow-sm">${num} ${gapBadge}</span>`;
            });
        } else if (data.numbersToBet && data.numbersToBet.length > 0) {
            // Fallback nếu api chưa update numbersToBetWithGap
            data.numbersToBet.forEach(num => {
                numbersToBetHtml += `<span class="inline-block bg-green-600 text-white text-sm font-semibold mr-2 mb-2 px-2.5 py-1.5 rounded-lg border border-green-700 shadow-sm">${String(num).padStart(2, '0')}</span>`;
            });
        } else {
            numbersToBetHtml = '<span class="text-gray-500 italic p-2">Không có số nào được đề xuất để ôm.</span>';
        }

        // Gộp các giải thích theo nhóm
        const groups = {
            superRecord: { id: 'superRecord', title: '🔴 ĐẠT KỶ LỤC', items: [], numbers: new Set(), headerClass: 'bg-red-200 text-red-900 border-red-600', badgeClass: 'bg-red-600' },
            recordPotential: { id: 'recordPotential', title: '🟠 TỚI HẠN KỶ LỤC', items: [], numbers: new Set(), headerClass: 'bg-orange-100 text-orange-800 border-orange-400', badgeClass: 'bg-orange-500' },
            superRecordAchieved: { id: 'superRecordAchieved', title: '🟡 ĐẠT SIÊU KỶ LỤC', items: [], numbers: new Set(), headerClass: 'bg-yellow-100 text-yellow-900 border-yellow-500', badgeClass: 'bg-yellow-600' },
            superRecordPotential: { id: 'superRecordPotential', title: '🟣 TỚI HẠN SIÊU KỶ LỤC', items: [], numbers: new Set(), headerClass: 'bg-purple-100 text-purple-800 border-purple-400', badgeClass: 'bg-purple-500' },
            other: { id: 'other', title: '📌 LOẠI TRỪ KHÁC (Băng/Lạnh/Thống kê)', items: [], numbers: new Set(), headerClass: 'bg-gray-100 text-gray-800 border-gray-400', badgeClass: 'bg-gray-500' }
        };

        if (data.explanations) {
            data.explanations.forEach(item => {
                const exp = item.explanation || item.reason || '';
                let targetGroup = groups.other;
                
                // Matching logic based on the 4 tiers requested
                if (exp.includes('Đạt Siêu KL') || exp.includes('Đạt siêu KL')) {
                    targetGroup = groups.superRecordAchieved;
                } else if (exp.includes('Tới hạn Siêu KL') || exp.includes('Tới hạn siêu KL')) {
                    targetGroup = groups.superRecordPotential;
                } else if (exp.includes('Đạt Kỷ lục') || exp.includes('Đạt kỷ lục') || exp.includes('Đạt mốc kỷ lục')) {
                    targetGroup = groups.superRecord; // Request said 🔴 ĐẠT KỶ LỤC is first
                } else if (exp.includes('Tới hạn Kỷ lục') || exp.includes('Tới hạn kỷ lục')) {
                    targetGroup = groups.recordPotential;
                }

                targetGroup.items.push(item);
                if (item.numbers) {
                    item.numbers.forEach(n => targetGroup.numbers.add(n));
                }
            });
        }
        
        // Also capture numbers from data.excludedNumbers that didn't have an explanation
        if (data.excludedNumbers) {
            data.excludedNumbers.forEach(n => {
                let found = false;
                for (const key in groups) {
                    if (groups[key].numbers.has(n)) { found = true; break; }
                }
                if (!found) {
                    groups.other.numbers.add(n);
                }
            });
        }

        // Tạo giao diện Danh sách các số theo từng nhóm
        let excludedNumbersHtml = '';
        const groupKeys = ['superRecord', 'recordPotential', 'superRecordAchieved', 'superRecordPotential', 'other'];
        
        let hasAnyNumber = false;
        groupKeys.forEach(key => {
            const group = groups[key];
            if (group.numbers.size > 0) {
                hasAnyNumber = true;
                const sortedNumbers = Array.from(group.numbers).sort((a,b) => a-b);
                excludedNumbersHtml += `
                    <div class="mb-3">
                        <h6 class="text-xs font-bold mb-1 ${group.headerClass.split(' ')[1]} uppercase">${group.title} (${sortedNumbers.length} số)</h6>
                        <div class="flex flex-wrap gap-1.5">
                            ${sortedNumbers.map(num => `<span class="inline-block ${group.badgeClass} text-white text-sm font-bold px-2 py-1 rounded shadow-sm min-w-[32px] text-center">${String(num).padStart(2, '0')}</span>`).join('')}
                        </div>
                    </div>
                `;
            }
        });

        if (!hasAnyNumber) {
            excludedNumbersHtml = '<span class="text-gray-500 italic p-2 block text-sm">Không có số nào bị loại trừ hôm nay.</span>';
        }

        // Tạo giao diện Giải thích chi tiết theo từng nhóm
        let explanationsHtml = '';
        groupKeys.forEach(key => {
            const group = groups[key];
            if (group.items.length > 0) {
                let groupHtml = `<h6 class="text-md font-bold mt-6 mb-3 border-b pb-1 ${group.headerClass.split(' ')[1]} border-opacity-30 border-current uppercase">${group.title}</h6>`;
                
                group.items.forEach(item => {
                    let numbersHtml = '';
                    if (item.numbers && item.numbers.length > 0) {
                        numbersHtml = '<div class="flex flex-wrap gap-1">';
                        item.numbers.forEach(num => {
                            numbersHtml += `<span class="inline-block ${group.badgeClass} text-white text-xs font-semibold px-2 py-1 rounded min-w-[28px] text-center">${String(num).padStart(2, '0')}</span>`;
                        });
                        numbersHtml += '</div>';
                    }

                    groupHtml += `
                        <div class="bg-white rounded-lg shadow-sm border-l-4 mb-3 ${group.headerClass.split(' ')[2]}">
                            <div class="p-2.5 rounded-t-lg ${group.headerClass.split(' ')[0]} bg-opacity-40">
                                <strong class="font-semibold text-sm ${group.headerClass.split(' ')[1]}">${item.title}</strong>
                            </div>
                            <div class="p-3">
                                <p class="text-gray-700 text-sm mb-2 leading-relaxed">${item.explanation || item.reason}</p>
                                ${numbersHtml ? `
                                <p class="text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Số bị ảnh hưởng:</p>
                                ${numbersHtml}
                                ` : ''}
                            </div>
                        </div>`;
                });
                explanationsHtml += groupHtml;
            }
        });

        const strategyInfo = data.strategyInfo || {};
        const countSpan = document.getElementById('exclusion-count');
        if (countSpan) {
            countSpan.textContent = `(${data.excludedNumbers?.length || 0} số - ${strategyInfo.strategy || 'BALANCED'})`;
        }

        // Tính toán ngày dự đoán tiếp theo
        let nextDateStr = 'Hôm nay';
        if (data.last30Days && data.last30Days.length > 0) {
            try {
                const latest = new Date(data.last30Days[0].date);
                latest.setDate(latest.getDate() + 1);
                nextDateStr = latest.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
            } catch (e) {}
        }

        const finalHtml = `
            <div class="mb-6 bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-xl border border-green-200 shadow-sm">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                    <div>
                        <h5 class="text-lg font-bold text-green-900 uppercase flex items-center">
                            <i class="bi bi-bullseye text-green-600 me-2"></i> CÁC SỐ ĐÁNH (${data.numbersToBet ? data.numbersToBet.length : 0} số)
                        </h5>
                        <p class="text-xs text-green-700 font-medium italic mt-1">Dự đoán cho ngày: <span class="font-bold text-red-600 underline">${nextDateStr}</span></p>
                    </div>
                    <span class="text-[10px] text-green-600 font-semibold bg-white px-2 py-1 rounded-full border border-green-200 shadow-sm uppercase tracking-tighter">Sắp xếp theo độ hiếm (Gan) giảm dần</span>
                </div>
                
                <div class="bg-white/80 backdrop-blur-sm p-4 rounded-xl border border-green-100 shadow-inner">
                    <!-- Sử dụng CSS columns để đảm bảo danh sách chảy từ trên xuống dưới trong từng cột -->
                    <div class="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-4 space-y-2">
                        ${data.numbersToBetWithGap ? data.numbersToBetWithGap.map((item, index) => {
                            const num = String(item.num).padStart(2, '0');
                            const gap = item.gap;
                            let gapColor = 'text-emerald-700 bg-emerald-50';
                            let border = 'border-emerald-100';
                            if (gap >= 15) { gapColor = 'text-red-700 bg-red-50'; border = 'border-red-200'; }
                            else if (gap >= 8) { gapColor = 'text-orange-700 bg-orange-50'; border = 'border-orange-200'; }
                            
                            return `
                                <div class="break-inside-avoid flex items-center justify-between p-2 hover:bg-green-50 transition rounded-lg border-b border-gray-50">
                                    <div class="flex items-center">
                                        <span class="text-[10px] text-gray-400 w-5 font-mono">${index + 1}.</span>
                                        <span class="text-xl font-black text-green-900 ml-1 leading-none">${num}</span>
                                    </div>
                                    <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${gapColor} ${border} whitespace-nowrap">Gan ${gap}</span>
                                </div>
                            `;
                        }).join('') : numbersToBetHtml}
                    </div>
                </div>
            </div>

            <div class="mb-8">
                <h5 class="text-lg font-bold text-gray-900 mb-4 uppercase flex items-center">
                    <i class="bi bi-shield-slash text-red-500 me-2"></i> TỔNG QUAN LOẠI TRỪ
                </h5>
                <div class="bg-gray-50 p-5 rounded-xl border border-gray-200">
                    ${excludedNumbersHtml}
                </div>
            </div>
            
            <div class="bg-indigo-50 rounded-xl p-5 border border-indigo-100 shadow-sm">
                <h5 class="text-lg font-bold text-gray-900 mb-4 uppercase flex items-center">
                    <i class="bi bi-chat-left-text text-indigo-600 me-2"></i> GIẢI THÍCH CHI TIẾT DỰ ĐOÁN
                </h5>
                <div class="space-y-1">
                    ${explanationsHtml || '<p class="text-gray-500 italic text-sm">Không có giải thích chi tiết nào cho cấu hình hiện tại.</p>'}
                </div>
            </div>
        `;

        suggestionsContainer.innerHTML = finalHtml;
        suggestionsContainer.style.display = 'block';
    }
});
