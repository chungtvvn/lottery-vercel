// public/js/simulation-client.js
document.addEventListener('DOMContentLoaded', () => {
    // --- KHAI BÁO BIẾN ---
    const analysisContent = document.getElementById('analysisContent');
    const historyContent = document.getElementById('historyContent');

    // --- HÀM KHỞI TẠO ---
    async function initializePage() {
        await loadLatestAnalysis();
        await loadPredictionHistory();
    }

    // --- LOGIC CHO TAB 1: PHÂN TÍCH & LỊCH SỬ ---
    async function loadLatestAnalysis() {
        try {
            const analysisRes = await fetch('/api/analysis/latest');

            if (!analysisRes.ok) {
                const err = await analysisRes.json();
                throw new Error(err.error || 'Lỗi không xác định');
            }

            const data = await analysisRes.json();
            if (data && data.danh) {
                renderAnalysis(data);
            } else {
                // No predictions available yet - show informational message
                analysisContent.innerHTML = `
                    <div class="bg-blue-50 border-l-4 border-blue-500 text-blue-700 p-4 rounded-r-lg">
                        <p class="font-bold">Chưa có dữ liệu phân tích</p>
                        <p>${data?.message || 'Dữ liệu dự đoán sẽ được cập nhật tự động. Vui lòng sử dụng tab Giả lập để chạy phân tích.'}</p>
                        ${data?.latestDate ? `<p class="text-sm mt-2">Dữ liệu mới nhất: <strong>${data.latestDate}</strong></p>` : ''}
                    </div>`;
            }
        } catch (error) {
            console.error('[DEBUG] Error loading analysis:', error);
            analysisContent.innerHTML = `<p class="text-red-500">Lỗi tải phân tích: ${error.message}</p>`;
        }
    }

    async function loadPredictionHistory() {
        try {
            const response = await fetch('/api/analysis/history');
            if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Lỗi không xác định'); }
            const data = await response.json();
            // API returns { predictions: [...] }, extract the array
            const historyArray = Array.isArray(data) ? data : (data.predictions || []);
            renderHistory(historyArray.reverse());
        } catch (error) {
            historyContent.innerHTML = `<p class="text-red-500">Lỗi tải lịch sử: ${error.message}</p>`;
        }
    }

    // Helper: Render 100 số với highlight
    function render100Numbers(betNumbers, excludeNumbers, colorClass, excludeClass = 'bg-red-200 text-red-800 border-red-400') {
        const betSet = new Set(betNumbers || []);
        const excludeSet = new Set((excludeNumbers || []).map(n => String(n).padStart(2, '0')));

        let html = '';
        for (let i = 0; i < 100; i++) {
            const num = String(i).padStart(2, '0');
            let className = 'number-item ';

            if (betSet.has(num)) {
                className += colorClass + ' font-bold';
            } else if (excludeSet.has(num)) {
                className += excludeClass + ' opacity-60';
            } else {
                className += 'bg-gray-100 text-gray-400 border-gray-200';
            }

            html += `<div class="${className}">${num}</div>`;
        }
        return html;
    }

    function renderAnalysis(data) {
        if (!data || !data.danh) {
            analysisContent.innerHTML = `<p class="text-red-500">Lỗi: Dữ liệu phân tích không hợp lệ.</p>`;
            return;
        }
        const { date, danh, betAmount, danhUnified, betAmountUnified, danhAdvanced, betAmountAdvanced, danhHybrid, betAmountHybrid, danhCombined, betAmountCombined, danhSmart, betAmountSmart } = data;
        const [year, month, day] = date.split('-');
        const formattedDate = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('vi-VN');

        // Chuẩn bị dữ liệu
        const exclusionBet = danh.numbers || [];
        const exclusionExclude = danh.excluded || [];
        const unifiedBet = danhUnified?.numbers || [];
        const unifiedExclude = danhUnified?.excluded || [];
        const advancedBet = danhAdvanced?.numbers || [];
        const advancedExclude = danhAdvanced?.excluded || [];
        const hybridBet = danhHybrid?.numbers || [];
        const hybridExclude = danhHybrid?.excluded || [];
        const combinedBet = danhCombined?.numbers || [];
        const combinedExclude = danhCombined?.excluded || [];
        const smartBet = danhSmart?.numbers || [];
        const smartExclude = danhSmart?.excluded || [];

        let html = `
            <div class="mb-6">
                <p class="text-sm text-gray-600 mb-1">Dự đoán cho ngày: <span class="font-bold text-2xl text-blue-600">${formattedDate}</span></p>
                <p class="text-xs text-gray-500 mt-1">🟢 Số đánh (highlight màu) | 🔴 Số loại trừ (đỏ) | ⚪ Số khác (xám)</p>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <!-- METHOD 1: EXCLUSION -->
                <div class="bg-blue-50 p-4 rounded-lg border-2 border-blue-200">
                    <a href="/distribution#exclusion" class="text-lg font-bold text-blue-800 mb-3 block hover:underline">
                        📊 1. Exclusion <i class="bi bi-box-arrow-up-right text-xs"></i>
                    </a>
                    <p class="text-xs text-gray-500 mb-2">Loại trừ theo Chuỗi + Gap (tier: đỏ, tím, cam)</p>
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-sm text-gray-600">Cược: <span class="font-bold text-blue-600">${(betAmount || 0).toLocaleString()}k/số</span></span>
                        <span class="text-xs"><span class="text-green-600 font-bold">${exclusionBet.length}</span> đánh | <span class="text-red-600">${exclusionExclude.length}</span> loại trừ</span>
                    </div>
                    <div class="number-grid-100 p-2 bg-white rounded-lg">
                        ${render100Numbers(exclusionBet, exclusionExclude, 'bg-blue-300 text-blue-900 border-blue-500')}
                    </div>
                </div>
                
                <!-- METHOD 2: UNIFIED -->
                <div class="bg-green-50 p-4 rounded-lg border-2 border-green-200">
                    <a href="/distribution#unified" class="text-lg font-bold text-green-800 mb-3 block hover:underline">
                        🌟 2. Unified (6 methods) <i class="bi bi-box-arrow-up-right text-xs"></i>
                    </a>
                    <p class="text-xs text-gray-500 mb-2">Gap, Streak, Exclusion, Yearly, Day, Recent</p>
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-sm text-gray-600">Cược: <span class="font-bold text-green-600">${(betAmountUnified || 10).toLocaleString()}k/số</span></span>
                        <span class="text-xs"><span class="text-green-600 font-bold">${unifiedBet.length}</span> đánh | <span class="text-red-600">${unifiedExclude.length}</span> loại trừ</span>
                    </div>
                    <div class="number-grid-100 p-2 bg-white rounded-lg">
                        ${render100Numbers(unifiedBet, unifiedExclude, 'bg-green-300 text-green-900 border-green-500')}
                    </div>
                </div>
                
                <!-- METHOD 3: ADVANCED -->
                <div class="bg-purple-50 p-4 rounded-lg border-2 border-purple-200">
                    <a href="/distribution#advanced" class="text-lg font-bold text-purple-800 mb-3 block hover:underline">
                        🔬 3. Advanced (13 methods) <i class="bi bi-box-arrow-up-right text-xs"></i>
                    </a>
                    <p class="text-xs text-gray-500 mb-2">Chi-Square, Z-Score, Poisson, Bayesian...</p>
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-sm text-gray-600">Cược: <span class="font-bold text-purple-600">${(betAmountAdvanced || 10).toLocaleString()}k/số</span></span>
                        <span class="text-xs"><span class="text-green-600 font-bold">${advancedBet.length}</span> đánh | <span class="text-red-600">${advancedExclude.length}</span> loại trừ</span>
                    </div>
                    <div class="number-grid-100 p-2 bg-white rounded-lg">
                        ${render100Numbers(advancedBet, advancedExclude, 'bg-purple-300 text-purple-900 border-purple-500')}
                    </div>
                </div>
                
                <!-- METHOD 4: HYBRID AI -->
                <div class="bg-orange-50 p-4 rounded-lg border-2 border-orange-200">
                    <a href="/distribution#hybrid" class="text-lg font-bold text-orange-800 mb-3 block hover:underline">
                        🤖 4. Hybrid AI <i class="bi bi-box-arrow-up-right text-xs"></i>
                    </a>
                    <p class="text-xs text-gray-500 mb-2">Markov, Monte Carlo, ARIMA, Pattern</p>
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-sm text-gray-600">Cược: <span class="font-bold text-orange-600">${(betAmountHybrid || 10).toLocaleString()}k/số</span></span>
                        <span class="text-xs"><span class="text-green-600 font-bold">${hybridBet.length}</span> đánh | <span class="text-red-600">${hybridExclude.length}</span> loại trừ</span>
                    </div>
                    <div class="number-grid-100 p-2 bg-white rounded-lg">
                        ${render100Numbers(hybridBet, hybridExclude, 'bg-orange-300 text-orange-900 border-orange-500')}
                    </div>
                </div>
                
                <!-- METHOD 5: COMBINED -->
                <div class="bg-pink-50 p-4 rounded-lg border-2 border-pink-200">
                    <a href="/distribution#combined" class="text-lg font-bold text-pink-800 mb-3 block hover:underline">
                        🔗 5. Combined (Tổng hợp) <i class="bi bi-box-arrow-up-right text-xs"></i>
                    </a>
                    <p class="text-xs text-gray-500 mb-2">Tổng hợp cả 4 phương pháp trên (loại trùng)</p>
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-sm text-gray-600">Cược: <span class="font-bold text-pink-600">${(betAmountCombined || 10).toLocaleString()}k/số</span></span>
                        <span class="text-xs"><span class="text-green-600 font-bold">${combinedBet.length}</span> đánh | <span class="text-red-600">${combinedExclude.length}</span> loại trừ</span>
                    </div>
                    <div class="number-grid-100 p-2 bg-white rounded-lg">
                        ${render100Numbers(combinedBet, combinedExclude, 'bg-pink-300 text-pink-900 border-pink-500')}
                    </div>
                </div>

                <!-- METHOD 6: EXCLUSION + -->
                <div class="bg-yellow-50 p-4 rounded-lg border-2 border-yellow-200">
                    <div class="text-lg font-bold text-yellow-800 mb-3 block">
                        ⚡ 6. Exclusion + (Kỷ lục)
                    </div>
                    <p class="text-xs text-gray-500 mb-2">Chỉ đánh số sau khi loại trừ “Đạt kỷ lục” và “Tới hạn siêu kỷ lục” (chỉ RED+PURPLE)</p>
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-sm text-gray-600">Cược: <span class="font-bold text-yellow-600">${(betAmountSmart || 10).toLocaleString()}k/số</span></span>
                        <span class="text-xs"><span class="text-green-600 font-bold">${smartBet.length}</span> đánh | <span class="text-red-600">${smartExclude.length}</span> loại trừ</span>
                    </div>
                    <div class="number-grid-100 p-2 bg-white rounded-lg">
                        ${render100Numbers(smartBet, smartExclude, 'bg-yellow-300 text-yellow-900 border-yellow-500')}
                    </div>
                </div>
            </div>
            
            <!-- Comparison note -->
            <div class="mt-4 p-3 bg-gray-100 rounded-lg text-sm text-gray-600">
                <strong>💡 Ghi chú:</strong> So sánh 5 phương pháp song song. Combined tổng hợp cả 4 phương pháp khác (tối đa 60 số). <strong>Exclusion +</strong> chỉ dùng loại trừ kỷ lục RED+PURPLE từ Distribution, đánh toàn bộ số còn lại. Kết quả thực tế sẽ được cập nhật trong Lịch Sử Đối Chiếu bên dưới.
            </div>
        `;

        analysisContent.innerHTML = html;
    }

    function renderHistory(historyData) {
        if (historyData.length === 0) {
            historyContent.innerHTML = `<p class="text-gray-500">Chưa có lịch sử đối chiếu.</p>`;
            return;
        }

        // Totals for 6 methods
        let stats = {
            exclusion: { totalBet: 0, totalWin: 0, winDays: 0, loseDays: 0, skipDays: 0 },
            unified: { totalBet: 0, totalWin: 0, winDays: 0, loseDays: 0, skipDays: 0 },
            advanced: { totalBet: 0, totalWin: 0, winDays: 0, loseDays: 0, skipDays: 0 },
            hybrid: { totalBet: 0, totalWin: 0, winDays: 0, loseDays: 0, skipDays: 0 },
            combined: { totalBet: 0, totalWin: 0, winDays: 0, loseDays: 0, skipDays: 0 },
            exclusionPlus: { totalBet: 0, totalWin: 0, winDays: 0, loseDays: 0, skipDays: 0 }
        };

        let tableHtml = `<table class="w-full text-xs text-left">
            <thead class="bg-gray-100 sticky top-0">
                <tr>
                    <th class="p-2" rowspan="2">Ngày</th>
                    <th class="p-2 text-center" rowspan="2">Số Về</th>
                    <th class="p-2 text-center bg-blue-50 border-l-2 border-blue-300" colspan="3">📊 Exclusion</th>
                    <th class="p-2 text-center bg-green-50 border-l-2 border-green-300" colspan="3">🌟 Unified</th>
                    <th class="p-2 text-center bg-purple-50 border-l-2 border-purple-300" colspan="3">🔬 Advanced</th>
                    <th class="p-2 text-center bg-orange-50 border-l-2 border-orange-300" colspan="3">🤖 Hybrid AI</th>
                    <th class="p-2 text-center bg-pink-50 border-l-2 border-pink-300" colspan="3">🔗 Combined</th>
                    <th class="p-2 text-center bg-yellow-50 border-l-2 border-yellow-300" colspan="3">⚡ Exclusion +</th>
                </tr>
                <tr class="text-[10px]">
                    <th class="p-1 text-center bg-blue-50 border-l-2 border-blue-300">Đánh</th>
                    <th class="p-1 text-right bg-blue-50">Lãi/Lỗ</th>
                    <th class="p-1 text-center bg-blue-50">W/L</th>
                    <th class="p-1 text-center bg-green-50 border-l-2 border-green-300">Đánh</th>
                    <th class="p-1 text-right bg-green-50">Lãi/Lỗ</th>
                    <th class="p-1 text-center bg-green-50">W/L</th>
                    <th class="p-1 text-center bg-purple-50 border-l-2 border-purple-300">Đánh</th>
                    <th class="p-1 text-right bg-purple-50">Lãi/Lỗ</th>
                    <th class="p-1 text-center bg-purple-50">W/L</th>
                    <th class="p-1 text-center bg-orange-50 border-l-2 border-orange-300">Đánh</th>
                    <th class="p-1 text-right bg-orange-50">Lãi/Lỗ</th>
                    <th class="p-1 text-center bg-orange-50">W/L</th>
                    <th class="p-1 text-center bg-pink-50 border-l-2 border-pink-300">Đánh</th>
                    <th class="p-1 text-right bg-pink-50">Lãi/Lỗ</th>
                    <th class="p-1 text-center bg-pink-50">W/L</th>
                    <th class="p-1 text-center bg-yellow-50 border-l-2 border-yellow-300">Đánh</th>
                    <th class="p-1 text-right bg-yellow-50">Lãi/Lỗ</th>
                    <th class="p-1 text-center bg-yellow-50">W/L</th>
                </tr>
            </thead>
            <tbody>`;

        for (const item of historyData) {
            const [year, month, day] = item.date.split('-');
            const date = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('vi-VN');
            const winNumDisplay = item.result?.winningNumber
                ? `<span class="font-mono bg-yellow-100 text-yellow-800 rounded px-1">${item.result.winningNumber}</span>`
                : `<span class="text-yellow-600 font-semibold">⏳</span>`;

            let exclusionHtml = renderMethodCell(item, 'exclusion', 'blue', stats.exclusion);
            let unifiedHtml = renderMethodCell(item, 'unified', 'green', stats.unified);
            let advancedHtml = renderMethodCell(item, 'advanced', 'purple', stats.advanced);
            let hybridHtml = renderMethodCell(item, 'hybrid', 'orange', stats.hybrid);
            let combinedHtml = renderMethodCell(item, 'combined', 'pink', stats.combined);
            let exclusionPlusHtml = renderMethodCell(item, 'exclusionPlus', 'yellow', stats.exclusionPlus);

            tableHtml += `<tr class="border-b hover:bg-gray-50">
                <td class="p-1 font-medium">${date}</td>
                <td class="p-1 text-center">${winNumDisplay}</td>
                ${exclusionHtml}
                ${unifiedHtml}
                ${advancedHtml}
                ${hybridHtml}
                ${combinedHtml}
                ${exclusionPlusHtml}
            </tr>`;
        }
        tableHtml += `</tbody></table>`;

        // Summary for all methods
        let summaryHtml = renderSummary(stats);
        historyContent.innerHTML = tableHtml + summaryHtml;
    }

    function renderMethodCell(item, method, color, totals) {
        // Map method key sang field name trong data
        // 'smart' hoặc 'exclusionPlus' đều map sang danhSmart/resultSmart
        const fieldMethod = (method === 'exclusionPlus') ? 'smart' : method;
        const danhKey = fieldMethod === 'exclusion' ? 'danh'
            : `danh${fieldMethod.charAt(0).toUpperCase() + fieldMethod.slice(1)}`;
        const resultKey = fieldMethod === 'exclusion' ? 'result'
            : `result${fieldMethod.charAt(0).toUpperCase() + fieldMethod.slice(1)}`;

        const result = item[resultKey];
        const danh = item[danhKey];
        const numCount = danh?.numbers?.length || 0;

        // Kiểm tra skip: từ danh.isSkipped (chưa có kết quả) hoặc result.skipped (đã có kết quả)
        const isSkipped = danh?.isSkipped || (result && result.skipped);
        if (isSkipped) {
            if (totals && result?.winningNumber) totals.skipDays++;
            return `
                <td class="p-1 text-center bg-${color}-50 border-l-2 border-${color}-300">
                    <span class="text-gray-400 text-[10px]">—</span>
                </td>
                <td class="p-1 text-center bg-${color}-50 text-gray-400 text-[10px]" colspan="2">Bỏ qua (&gt;65)</td>
            `;
        }

        if (result && result.winningNumber) {
            const winNum = result.winningNumber;
            const isWin = result.isWin || danh?.numbers?.includes(winNum);
            const profit = result.profit || 0;

            totals.totalBet += result.totalBet || 0;
            totals.totalWin += result.winAmount || 0;
            if (isWin) totals.winDays++; else totals.loseDays++;

            return `
                <td class="p-1 text-center bg-${color}-50 border-l-2 border-${color}-300">
                    <details class="cursor-pointer"><summary class="text-${color}-600">${numCount}</summary>
                        <div class="number-grid p-1 mt-1 bg-white rounded max-w-xs text-[9px]">
                            ${danh?.numbers?.map(n => `<span class="${n === winNum ? 'bg-green-500 text-white font-bold px-1 rounded' : ''}">${n}</span>`).join(' ') || '-'}
                        </div>
                    </details>
                </td>
                <td class="p-1 text-right bg-${color}-50 font-semibold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}">${Math.round(profit).toLocaleString()}k</td>
                <td class="p-1 text-center bg-${color}-50">${isWin ? '\u2705' : '\u274c'}</td>
            `;
        } else if (danh && danh.numbers && danh.numbers.length > 0) {
            return `
                <td class="p-1 text-center bg-${color}-50 border-l-2 border-${color}-300">${numCount}</td>
                <td class="p-1 text-center bg-${color}-50 text-gray-400" colspan="2">⏳</td>
            `;
        } else {
            return `<td class="p-1 text-center bg-${color}-50 border-l-2 border-${color}-300" colspan="3"><span class="text-gray-400">-</span></td>`;
        }
    }

    function renderSummary(stats) {
        const methods = [
            { key: 'exclusion', name: '📊 Exclusion', color: 'blue' },
            { key: 'unified', name: '🌟 Unified', color: 'green' },
            { key: 'advanced', name: '🔬 Advanced', color: 'purple' },
            { key: 'hybrid', name: '🤖 Hybrid AI', color: 'orange' },
            { key: 'combined', name: '🔗 Combined', color: 'pink' },
            { key: 'exclusionPlus', name: '⚡ Exclusion +', color: 'yellow' }
        ];

        let summaryHtml = `<div class="mt-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">`;

        for (const m of methods) {
            const s = stats[m.key];
            const profit = s.totalWin - s.totalBet;
            const winRate = s.winDays + s.loseDays > 0 ? ((s.winDays / (s.winDays + s.loseDays)) * 100).toFixed(1) : '-';
            const skipNote = s.skipDays > 0 ? `<div><span class="text-gray-500">Bỏ qua:</span> <span class="font-bold text-gray-600">${s.skipDays} ngày</span></div>` : '';

            summaryHtml += `
                <div class="p-3 bg-${m.color}-50 rounded-lg border-2 border-${m.color}-200">
                    <h4 class="font-bold text-${m.color}-800 mb-2 text-sm">${m.name}</h4>
                    <div class="text-xs space-y-1">
                        <div><span class="text-gray-600">Vốn:</span> <span class="font-bold text-red-600">${s.totalBet.toLocaleString()}k</span></div>
                        <div><span class="text-gray-600">Thắng:</span> <span class="font-bold text-green-600">${s.totalWin.toLocaleString()}k</span></div>
                        <div><span class="text-gray-600">Lãi/Lỗ:</span> <span class="font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}">${profit.toLocaleString()}k</span></div>
                        <div><span class="text-gray-600">Tỷ lệ:</span> <span class="font-bold">${winRate}% (${s.winDays}W/${s.loseDays}L)</span></div>
                        ${skipNote}
                    </div>
                </div>
            `;
        }

        summaryHtml += `</div>`;

        // Best method comparison (chỉ tính phương pháp có bet > 0)
        const profits = methods
            .filter(m => stats[m.key].totalBet > 0)
            .map(m => ({ key: m.key, name: m.name, profit: stats[m.key].totalWin - stats[m.key].totalBet }));
        if (profits.length > 0) {
            profits.sort((a, b) => b.profit - a.profit);
            const best = profits[0];
            summaryHtml += `
                <div class="mt-3 p-3 bg-gray-100 rounded-lg text-center text-sm">
                    <strong>🏆 Phương pháp tốt nhất:</strong> 
                    <span class="font-bold ${best.profit >= 0 ? 'text-green-600' : 'text-red-600'}">${best.name} (${best.profit >= 0 ? '+' : ''}${best.profit.toLocaleString()}k)</span>
                </div>
            `;
        }

        return summaryHtml;
    }

    // === FUTURE SIMULATION FUNCTIONS ===
    window.switchTab = function (tab) {
        // Hide all content
        document.getElementById('content-analysis').classList.add('hidden');
        document.getElementById('content-future').classList.add('hidden');
        const backtestContent = document.getElementById('content-backtest');
        if (backtestContent) backtestContent.classList.add('hidden');

        // Remove active from all tabs
        document.getElementById('tabAnalysis').classList.remove('active');
        document.getElementById('tabFuture').classList.remove('active');
        const tabBacktest = document.getElementById('tabBacktest');
        if (tabBacktest) tabBacktest.classList.remove('active');

        // Show selected content and activate tab
        if (tab === 'analysis') {
            document.getElementById('content-analysis').classList.remove('hidden');
            document.getElementById('tabAnalysis').classList.add('active');
        } else if (tab === 'future') {
            document.getElementById('content-future').classList.remove('hidden');
            document.getElementById('tabFuture').classList.add('active');
        } else if (tab === 'backtest') {
            if (backtestContent) backtestContent.classList.remove('hidden');
            if (tabBacktest) tabBacktest.classList.add('active');
        }
    };

    window.runProgressiveSimulation = async function () {
        const days = parseInt(document.getElementById('futureDuration').value) || 30;
        const btn = document.getElementById('btnRunFuture');
        const progress = document.getElementById('futureProgress');
        const summary = document.getElementById('futureSummary');
        const results = document.getElementById('futureResults');

        btn.disabled = true;
        progress.classList.remove('hidden');
        summary.classList.add('hidden');
        results.classList.add('hidden');

        try {
            const response = await fetch('/api/simulation/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ simulationDays: days })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Lỗi không xác định');
            }

            const data = await response.json();
            renderProgressiveSummary(data);
            renderProgressiveResults(data);

            summary.classList.remove('hidden');
            results.classList.remove('hidden');
        } catch (error) {
            alert('Lỗi: ' + error.message);
        } finally {
            btn.disabled = false;
            progress.classList.add('hidden');
        }
    };

    function renderProgressiveSummary(data) {
        const summaryCards = document.getElementById('futureSummaryCards');
        const s = data.summary;
        const profitClass = s.totalProfit >= 0 ? 'text-green-600' : 'text-red-600';
        const sign = s.totalProfit >= 0 ? '+' : '';

        summaryCards.innerHTML = `
            <div class="bg-gray-100 p-4 rounded-lg shadow text-center">
                <div class="text-xs text-gray-500">Số Ngày Đánh (Trên Tổng)</div>
                <div class="font-bold text-2xl text-blue-600">${s.playedDays} / ${s.days}</div>
            </div>
            <div class="bg-gray-100 p-4 rounded-lg shadow text-center">
                <div class="text-xs text-gray-500">Tỷ Lệ Thắng (Win Rate)</div>
                <div class="font-bold text-2xl text-green-600">${s.winRate}%</div>
                <div class="text-xs mt-1 text-gray-500">(${s.winCount} ngày trúng)</div>
            </div>
            <div class="bg-gray-100 p-4 rounded-lg shadow text-center border-2 border-green-200">
                <div class="text-xs text-gray-500">Tổng Lợi Nhuận</div>
                <div class="font-bold text-2xl ${profitClass}">${sign}${s.totalProfit.toLocaleString('vi-VN')}k</div>
                <div class="text-xs mt-1 text-gray-500">ROI: ${s.roi}%</div>
            </div>
            <div class="bg-gray-100 p-4 rounded-lg shadow text-center">
                <div class="text-xs text-gray-500">Tổng Vốn Bỏ Ra</div>
                <div class="font-bold text-2xl text-red-600">${s.totalCost.toLocaleString('vi-VN')}k</div>
                <div class="text-xs mt-1 text-gray-500">Thu về: ${s.totalRevenue.toLocaleString('vi-VN')}k</div>
            </div>
        `;
    }

    function renderProgressiveResults(data) {
        const tableBody = document.getElementById('futureResultsTable');
        tableBody.innerHTML = '';

        if (!data.details || data.details.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center p-4">Không có dữ liệu chi tiết</td></tr>';
            return;
        }

        data.details.forEach(row => {
            const tr = document.createElement('tr');
            
            // Format date
            const dateStr = new Date(row.date).toLocaleDateString('vi-VN');
            
            // Status formatting
            let statusHtml = '';
            let rowClass = 'hover:bg-gray-50';
            
            if (row.isSkipped) {
                statusHtml = '<span class="bg-gray-200 text-gray-700 px-2 py-1 rounded text-xs font-bold">⏭️ BỎ QUA</span>';
                rowClass = 'bg-gray-100 opacity-60';
            } else if (row.isWin) {
                statusHtml = '<span class="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold">✅ TRÚNG</span>';
                rowClass = 'bg-green-50 hover:bg-green-100';
            } else {
                statusHtml = '<span class="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-bold">❌ TRƯỢT</span>';
                rowClass = 'bg-red-50 hover:bg-red-100';
            }
            
            // Profit formatting
            const profitClass = row.profit > 0 ? 'text-green-600 font-bold' : (row.profit < 0 ? 'text-red-600' : 'text-gray-500');
            const totalProfitClass = row.totalProfit > 0 ? 'text-green-600 font-bold' : (row.totalProfit < 0 ? 'text-red-600' : 'text-gray-500');
            const profitSign = row.profit > 0 ? '+' : '';
            const totalProfitSign = row.totalProfit > 0 ? '+' : '';

            // Numbers bet breakdown
            let numbersHtml = '-';
            if (!row.isSkipped && row.numbersBet && row.numbersBet.length > 0) {
                // Determine if winning number is in the set
                const winNum = parseInt(row.special);
                
                numbersHtml = `
                    <div class="text-[10px] sm:text-xs">
                        <details class="cursor-pointer">
                            <summary class="font-medium text-blue-600 outline-none">Xem ${row.numbersBet.length} số (Loại ${row.excludedCount})</summary>
                            <div class="mt-1 p-2 bg-white border border-gray-200 rounded text-left max-w-xs md:max-w-md flex flex-wrap gap-1">
                                ${row.numbersBet.map(n => {
                                    const formatted = String(n).padStart(2, '0');
                                    return (n === winNum) 
                                        ? `<span class="bg-green-500 text-white font-bold px-1 rounded inline-block">${formatted}</span>` 
                                        : `<span class="text-gray-600 inline-block px-0.5">${formatted}</span>`;
                                }).join('')}
                            </div>
                        </details>
                    </div>
                `;
            }

            tr.className = `border-b border-gray-200 ${rowClass}`;
            tr.innerHTML = `
                <td class="px-3 py-3 whitespace-nowrap text-xs font-medium text-gray-900">${dateStr}</td>
                <td class="px-3 py-3 whitespace-nowrap text-center">
                    <span class="font-bold bg-yellow-100 text-yellow-800 px-2 py-1 rounded border border-yellow-300 text-sm">
                        ${String(row.special).padStart(2, '0')}
                    </span>
                </td>
                <td class="px-3 py-3 whitespace-nowrap text-center text-xs">
                    ${row.isSkipped ? '<span class="text-gray-400">-</span>' : `<strong>${row.stake.toLocaleString('vi-VN')}k</strong>`}
                </td>
                <td class="px-3 py-3 whitespace-nowrap text-center text-xs">
                    ${numbersHtml}
                </td>
                <td class="px-3 py-3 whitespace-nowrap text-center text-xs ${profitClass}">
                    ${row.isSkipped ? '<span class="text-gray-400">-</span>' : `${profitSign}${row.profit.toLocaleString('vi-VN')}k`}
                </td>
                <td class="px-3 py-3 whitespace-nowrap text-center text-xs ${totalProfitClass}">
                    ${totalProfitSign}${row.totalProfit.toLocaleString('vi-VN')}k
                </td>
                <td class="px-3 py-3 whitespace-nowrap text-left">
                    ${statusHtml}
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }

    // === BACKTEST FUNCTIONS ===
    window.runBacktest = async function () {
        const days = parseInt(document.getElementById('backtestDays').value) || 30;
        const btn = document.getElementById('btnRunBacktest');
        const progress = document.getElementById('backtestProgress');
        const summary = document.getElementById('backtestSummary');
        const results = document.getElementById('backtestResults');

        btn.disabled = true;
        progress.classList.remove('hidden');
        summary.classList.add('hidden');
        results.classList.add('hidden');

        try {
            const response = await fetch(`/api/simulation/backtest?days=${days}`);

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Lỗi không xác định');
            }

            const data = await response.json();
            renderBacktestSummary(data);
            renderBacktestResults(data);

            summary.classList.remove('hidden');
            results.classList.remove('hidden');
        } catch (error) {
            alert('Lỗi: ' + error.message);
        } finally {
            btn.disabled = false;
            progress.classList.add('hidden');
        }
    };

    function renderBacktestSummary(data) {
        const container = document.getElementById('backtestSummaryCards');
        const methods = [
            { key: 'exclusion', name: '🚫 Exclusion', color: 'red' },
            { key: 'unified', name: '🎯 Unified', color: 'blue' },
            { key: 'advanced', name: '🔬 Advanced', color: 'purple' },
            { key: 'hybridAI', name: '🤖 Hybrid AI', color: 'orange' },
            { key: 'combined', name: '🔄 Combined', color: 'green' },
            { key: 'smart20', name: '⚡ Exclusion +', color: 'yellow' }
        ];

        let html = '';
        methods.forEach(m => {
            const s = data.summary[m.key];
            const winRate = parseFloat(s.winRate);
            const rateClass = winRate >= 50 ? 'text-green-600' : (winRate >= 30 ? 'text-yellow-600' : 'text-red-600');

            html += `
                <div class="bg-${m.color}-50 border border-${m.color}-200 rounded-lg p-4">
                    <h4 class="font-bold text-${m.color}-800 mb-2">${m.name}</h4>
                    <div class="space-y-2">
                        <div class="flex justify-between">
                            <span class="text-gray-600">Tỷ lệ thắng:</span>
                            <span class="font-bold ${rateClass}">${s.winRate}%</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">Thắng/Thua:</span>
                            <span><span class="text-green-600 font-bold">${s.wins}</span> / <span class="text-red-600">${s.losses}</span></span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">TB số đánh:</span>
                            <span class="font-semibold">${s.avgBets} số</span>
                        </div>
                    </div>
                    <div class="mt-3 pt-3 border-t border-${m.color}-200">
                        <div class="w-full bg-gray-200 rounded-full h-2">
                            <div class="bg-${m.color}-600 h-2 rounded-full" style="width: ${Math.min(winRate, 100)}%"></div>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    function renderBacktestResults(data) {
        const container = document.getElementById('backtestResultsTable');

        let html = `
            <table class="w-full text-sm border-collapse">
                <thead class="bg-gray-100 sticky top-0">
                    <tr>
                        <th class="p-2 text-left border-b">Ngày</th>
                        <th class="p-2 text-center border-b">Số về</th>
                        <th class="p-2 text-center border-b bg-red-50">🚫 Exclusion</th>
                        <th class="p-2 text-center border-b bg-blue-50">🎯 Unified</th>
                        <th class="p-2 text-center border-b bg-purple-50">🔬 Advanced</th>
                        <th class="p-2 text-center border-b bg-orange-50">🤖 Hybrid</th>
                        <th class="p-2 text-center border-b bg-green-50">🔄 Combined</th>
                        <th class="p-2 text-center border-b bg-yellow-50">⚡ Exclusion +</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const details = data.details || [];
        details.forEach(d => {
            html += `<tr class="border-b hover:bg-gray-50">
                <td class="p-2 font-medium">${d.date}</td>
                <td class="p-2 text-center">
                    <span class="bg-yellow-500 text-white px-2 py-1 rounded font-bold">${d.actualNumber}</span>
                </td>`;

            const methods = [
                { key: 'exclusion', bg: 'red' },
                { key: 'unified', bg: 'blue' },
                { key: 'advanced', bg: 'purple' },
                { key: 'hybridAI', bg: 'orange' },
                { key: 'combined', bg: 'green' },
                { key: 'smart20', bg: 'yellow' }
            ];

            methods.forEach(m => {
                const method = d[m.key];
                const isWin = method.win;
                const nums = method.numbers.join(', ');
                const count = method.count;

                html += `<td class="p-2 text-center bg-${m.bg}-50">
                    <details class="cursor-pointer">
                        <summary class="flex flex-col items-center gap-1">
                            <span class="${isWin ? 'bg-green-500 text-white px-2 rounded' : 'bg-red-100 text-red-600 px-2 rounded'}">${isWin ? '✅ TRÚNG' : '❌ THUA'}</span>
                            <span class="text-xs text-gray-500">${count} số</span>
                        </summary>
                        <div class="mt-2 p-2 bg-white rounded text-[10px] text-left max-w-xs">
                            <div class="font-bold mb-1">Top 10 số:</div>
                            <div class="break-words">${nums}...</div>
                        </div>
                    </details>
                </td>`;
            });

            html += `</tr>`;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;
    }

    initializePage();
});