// public/js/prediction-history.js
(function () {
    const state = {
        history: [],
        selectedIndex: -1,
        selectedMethod: 'avgEdge50Hold70',
        betWinMultiplier: 84,
        betWinFactor: 1,
        holdWinMultiplier: 0.705
    };
    const BET_PER_NUMBER_K = 1000;
    const HOLD_LOSS_MULTIPLIER = 70;
    const METHOD_META = {
        avgEdge50Hold70: {
            label: 'Dropoff TB hiệu chỉnh 50% nền - Hold 70 (Đánh 30)',
            description: 'Với mỗi chuỗi chứa một số, lấy dropoff trừ 50% xác suất gãy tự nhiên theo độ rộng tập số; sau đó lấy trung bình các bằng chứng. Loại 70 số có điểm cao nhất. Đây là phương án dẫn đầu backtest point-in-time 20 năm.'
        },
        dedupEdge75Hold70: {
            label: 'Edge khử trùng 75% nền - Hold 70 (Đánh 30)',
            description: 'Gộp các pattern tạo cùng tập số thành một bằng chứng, lấy dropoff trừ 75% xác suất gãy tự nhiên rồi loại 70 số có edge trung bình cao nhất.'
        },
        dedupDropoffHold70: {
            label: 'Dropoff TB khử trùng tập số - Hold 70 (Đánh 30)',
            description: 'Gộp các chuỗi đang diễn ra/tiềm năng tạo cùng một tập số thành một bằng chứng trước khi lấy dropoff trung bình. Cách này tránh pattern trùng lặp làm phình điểm của một số.'
        },
        avgDropoffHold60: {
            label: 'Dropoff TB từng số - Hold 60 (Đánh 40)',
            description: 'Tính trung bình dropoff của mọi chuỗi đang diễn ra/tiềm năng chứa từng số, loại 60 số có trung bình cao nhất và đánh 40 số còn lại.'
        },
        avgDropoffHold65: {
            label: 'Dropoff TB từng số - Hold 65 (Đánh 35)',
            description: 'Xếp 100 số theo dropoff trung bình giảm dần, loại 65 số đầu và đánh 35 số cuối.'
        },
        avgDropoffHold70: {
            label: 'Dropoff TB từng số - Hold 70 (Đánh 30)',
            description: 'Xếp 100 số theo dropoff trung bình giảm dần, loại 70 số đầu và đánh 30 số cuối.'
        },
        avgDropoffHold75: {
            label: 'Dropoff TB từng số - Hold 75 (Đánh 25)',
            description: 'Xếp 100 số theo dropoff trung bình giảm dần, loại 75 số đầu và đánh 25 số cuối.'
        },
        avgDropoffHold80: {
            label: 'Dropoff TB từng số - Hold 80 (Đánh 20)',
            description: 'Xếp 100 số theo dropoff trung bình giảm dần, loại 80 số đầu và đánh 20 số cuối.'
        },
        avgDropoffHold85: {
            label: 'Dropoff TB từng số - Hold 85 (Đánh 15)',
            description: 'Xếp 100 số theo dropoff trung bình giảm dần, loại 85 số đầu và đánh 15 số cuối.'
        },
        avgDropoffHold90: {
            label: 'Dropoff TB từng số - Hold 90 (Đánh 10)',
            description: 'Xếp 100 số theo dropoff trung bình giảm dần, loại 90 số đầu và đánh 10 số cuối.'
        },
        avgDropoffHold95: {
            label: 'Dropoff TB từng số - Hold 95 (Đánh 5)',
            description: 'Xếp 100 số theo dropoff trung bình giảm dần, loại 95 số đầu và đánh 5 số cuối.'
        },
        confidentEdgeHold90: {
            label: 'Edge đủ bằng chứng - Hold 90',
            description: 'Loại 90 số theo edge từng số nhưng chỉ chơi khi cả 90 số loại đều có edge dương. Ngày thiếu bằng chứng được bỏ qua thay vì ép score 0 vào danh sách loại.'
        },
        edgeHold90: {
            label: 'Edge từng số - Hold 90 (Đánh 10)',
            description: 'Chấm điểm rủi ro theo từng số bằng edge/lift từ các chuỗi kích hoạt, loại 90 số có rủi ro cao nhất và đánh 10 số còn lại.'
        },
        edgeHold85: {
            label: 'Edge từng số - Hold 85 (Đánh 15)',
            description: 'Biến thể edge từng số nhưng chỉ loại 85 số, giữ 15 số đánh để tăng độ phủ so với Hold 90.'
        },
        edgeHold80: {
            label: 'Edge từng số - Hold 80 (Đánh 20)',
            description: 'Loại 80 số theo edge từng số và đánh 20 số còn lại; cân bằng giữa xác suất trúng và chi phí đánh.'
        },
        edgeHold75: {
            label: 'Edge từng số - Hold 75 (Đánh 25)',
            description: 'Loại 75 số theo edge từng số, giữ 25 số đánh; độ phủ rộng hơn nhưng chi phí cao hơn.'
        },
        edgeHold70: {
            label: 'Edge từng số - Hold 70 (Đánh 30)',
            description: 'Loại 70 số theo edge từng số, đánh 30 số còn lại; ưu tiên độ phủ.'
        },
        edgeHold65: {
            label: 'Edge từng số - Hold 65 (Đánh 35)',
            description: 'Loại 65 số theo edge từng số, đánh 35 số còn lại; dùng để so sánh khi cần tăng số đánh.'
        },
        edgeHold60: {
            label: 'Edge từng số - Hold 60 (Đánh 40)',
            description: 'Loại 60 số theo edge từng số, đánh 40 số còn lại; độ phủ đánh cao nhất trong nhóm edge.'
        },
        riskHold70: {
            label: 'Risk Sort - Hold 70 (Đánh 30)',
            description: 'Sắp xếp các chuỗi dự đoán theo rủi ro từ cao xuống thấp, lấy chuỗi từ trên xuống tới khoảng 70 số loại trừ.'
        },
        riskHold80: {
            label: 'Risk Sort - Hold 80 (Đánh 20)',
            description: 'Sắp xếp chuỗi theo rủi ro và loại khoảng 80 số, đánh 20 số còn lại.'
        },
        riskHold90: {
            label: 'Risk Sort - Hold 90 (Đánh 10)',
            description: 'Sắp xếp chuỗi theo rủi ro và loại khoảng 90 số, đánh 10 số còn lại.'
        },
        riskHold60: {
            label: 'Risk Sort - Hold 60 (Đánh 40)',
            description: 'Sắp xếp chuỗi theo rủi ro và loại khoảng 60 số, đánh 40 số còn lại.'
        },
        potentialHold70: {
            label: 'Không hình thành trước - Hold 70',
            description: 'Ưu tiên các chuỗi tiềm năng có xác suất không hình thành cao trước, sau đó loại đến khoảng 70 số.'
        },
        recordFirstHold70: {
            label: 'Kỷ lục trước - Hold 70',
            description: 'Ưu tiên chuỗi đạt/vượt kỷ lục lịch sử trước các nhóm rủi ro khác, loại đến khoảng 70 số.'
        },
        recordHold70: {
            label: 'Kỷ lục hiệu chỉnh - Hold 70',
            description: 'Dùng điểm kỷ lục đã hiệu chỉnh theo mẫu, tần suất và nhịp xuất hiện để loại khoảng 70 số.'
        },
        scarcityHold70: {
            label: 'Tiềm năng hiếm - Hold 70',
            description: 'Ưu tiên các chuỗi tiềm năng hiếm, đặc biệt nhóm có HT/Target thấp, rồi loại đến khoảng 70 số.'
        },
        wilsonHold70: {
            label: 'Wilson/Edge chuỗi - Hold 70',
            description: 'Xếp chuỗi theo Wilson lower bound và edge để giảm ảo giác do mẫu ít, loại khoảng 70 số.'
        }
    };

    function getActiveSummary(run, selectedMethod) {
        const sum = run.summary || {};
        if (sum.methods && sum.methods[selectedMethod]) {
            return {
                resolved: sum.resolved,
                actualSpecial: sum.actualSpecial,
                ...sum.methods[selectedMethod]
            };
        }
        if (sum.methods) {
            return {
                missingMethod: true,
                resolved: false,
                actualSpecial: sum.actualSpecial,
                excludedNumbers: [],
                numbersToBet: [],
                explanations: [],
                betCount: 0,
                excludedCount: 0,
                betWin: null,
                holdWin: null,
                betProfit: null,
                holdProfit: null,
                profit: null
            };
        }
        return sum; // Fallback
    }

    function recalculateSummary(summary) {
        if (summary && summary.missingMethod) return summary;
        if (!summary || !summary.resolved) return summary;
        const betNumbers = summary.numbersToBet || [];
        const excludedNumbers = summary.excludedNumbers || [];
        const actual = Number(summary.actualSpecial);
        const betWin = betNumbers.some(n => Number(n) === actual);
        const holdWin = !excludedNumbers.some(n => Number(n) === actual);
        const betStake = betNumbers.length * BET_PER_NUMBER_K;
        const betPayout = betWin ? BET_PER_NUMBER_K * state.betWinMultiplier * state.betWinFactor : 0;
        const holdIncome = excludedNumbers.length * BET_PER_NUMBER_K * state.holdWinMultiplier;
        const holdLoss = holdWin ? 0 : BET_PER_NUMBER_K * HOLD_LOSS_MULTIPLIER;
        const betProfit = Math.round(betPayout - betStake);
        const holdProfit = Math.round(holdIncome - holdLoss);
        return {
            ...summary,
            betWin,
            holdWin,
            betProfit,
            holdProfit,
            profit: betProfit + holdProfit,
            betWinMultiplier: state.betWinMultiplier,
            betWinFactor: state.betWinFactor,
            holdWinMultiplier: state.holdWinMultiplier
        };
    }

    function getDisplaySummary(run, selectedMethod) {
        return recalculateSummary(getActiveSummary(run, selectedMethod));
    }

    function isPendingRun(run) {
        return !(run && run.summary && run.summary.resolved);
    }

    function getHistoryRowClass(isSelected, isPending) {
        if (isSelected && isPending) {
            return 'bg-amber-100/90 font-bold shadow-sm ring-1 ring-amber-300';
        }
        if (isSelected) {
            return 'bg-indigo-50/80 font-bold shadow-sm';
        }
        return isPending ? 'bg-amber-50/60' : 'bg-white/40';
    }

    function el(id) { return document.getElementById(id); }

    function formatMoney(amountK) {
        return `${Number(amountK || 0).toLocaleString('vi-VN')}K`;
    }

    function formatProfit(profit) {
        if (profit === null || profit === undefined) return '<span class="text-slate-400">—</span>';
        const formatted = profit >= 0
            ? `+${Number(profit).toLocaleString('vi-VN')}K`
            : `${Number(profit).toLocaleString('vi-VN')}K`;
        const colorClass = profit > 0 ? 'text-emerald-600 font-semibold' : (profit < 0 ? 'text-rose-600 font-semibold' : 'text-slate-600');
        return `<span class="${colorClass}">${formatted}</span>`;
    }

    function getMethodLabel(methodId) {
        return METHOD_META[methodId]?.label || methodId;
    }

    function getMethodDescription(methodId) {
        return METHOD_META[methodId]?.description || 'Phương pháp này dùng snapshot point-in-time của ngày dự đoán để tạo danh sách số đánh và số ôm/loại trừ.';
    }

    function getEdgeHoldMeta(methodId) {
        const match = String(methodId || '').match(/^edgeHold(\d+)$/);
        if (!match) return null;
        const holdCount = Number(match[1]);
        if (!Number.isFinite(holdCount)) return null;
        return {
            holdCount,
            betCount: 100 - holdCount
        };
    }

    function renderEdgeHoldExplanation(methodId, compact = false) {
        const meta = getEdgeHoldMeta(methodId);
        if (!meta) return '';
        const coverageText = meta.holdCount === 60
            ? 'Vì chỉ loại 60 số nên đây là biến thể có độ phủ đánh cao nhất trong nhóm edge: còn 40 số để đánh.'
            : `Biến thể này loại ${meta.holdCount} số và còn ${meta.betCount} số để đánh.`;
        const listClass = compact ? 'mt-2 space-y-1 text-[11px]' : 'mt-2 space-y-1.5 text-xs';
        return `
            <div class="mt-2 rounded-xl border border-indigo-100 bg-white/70 p-3 text-indigo-950">
                <div class="font-extrabold">Cách chọn chuỗi/số loại trừ của Edge từng số</div>
                <ol class="${listClass} list-decimal pl-4 leading-relaxed text-slate-650">
                    <li>Mỗi chuỗi dự đoán tạo ra một tập số có thể loại trừ.</li>
                    <li>Hệ thống tính <b>edge</b> của chuỗi = rủi ro gãy/không hình thành thực tế trừ xác suất nền của tập số đó.</li>
                    <li>Chỉ chuỗi có edge dương mới được dùng. Chuỗi rộng quá nhưng rủi ro không vượt nền sẽ không được cộng điểm.</li>
                    <li>Điểm chuỗi được chia cho từng số theo công thức: <b>edge dương × ưu tiên loại ÷ số lượng số trong chuỗi</b>.</li>
                    <li>Một số có thể được nhiều chuỗi cùng đề xuất loại; điểm của số đó là tổng điểm đóng góp từ tất cả chuỗi.</li>
                    <li>Sắp xếp 00-99 theo tổng điểm edge, lấy ${meta.holdCount} số cao nhất để ôm/loại, ${meta.betCount} số còn lại là dàn đánh.</li>
                </ol>
                <div class="mt-2 text-xs font-semibold text-indigo-700">${coverageText}</div>
            </div>
        `;
    }

    function getSortedMethodStats(history) {
        const stats = new Map();
        for (const run of history || []) {
            const methods = run.summary?.methods || {};
            for (const [methodId, rawSummary] of Object.entries(methods)) {
                if (!stats.has(methodId)) {
                    stats.set(methodId, { methodId, days: 0, profit: 0, wins: 0, losses: 0 });
                }
                const item = stats.get(methodId);
                const recalculated = recalculateSummary(rawSummary);
                if (!recalculated || !recalculated.resolved || recalculated.profit === null || recalculated.profit === undefined) continue;
                item.days += 1;
                item.profit += Number(recalculated.profit || 0);
                if (Number(recalculated.profit || 0) > 0) item.wins += 1;
                if (Number(recalculated.profit || 0) < 0) item.losses += 1;
            }
        }
        return [...stats.values()].sort((a, b) => {
            if (b.profit !== a.profit) return b.profit - a.profit;
            if (b.days !== a.days) return b.days - a.days;
            return getMethodLabel(a.methodId).localeCompare(getMethodLabel(b.methodId), 'vi');
        });
    }

    function renderMethodSelector() {
        const methodSelector = el('methodSelector');
        if (!methodSelector) return;
        const sorted = getSortedMethodStats(state.history);
        const available = sorted.length > 0
            ? sorted
            : [...methodSelector.options].map(option => ({ methodId: option.value, days: 0, profit: 0, wins: 0, losses: 0 }));
        const currentExists = state.selectedMethod && available.some(item => item.methodId === state.selectedMethod);
        if (!currentExists && available.length > 0) {
            state.selectedMethod = available[0].methodId;
        }
        methodSelector.innerHTML = available.map(item => {
            const profitText = item.days > 0 ? ` · ${item.profit >= 0 ? '+' : ''}${Number(item.profit).toLocaleString('vi-VN')}K` : '';
            const daysText = item.days > 0 ? ` · ${item.wins}/${item.days} ngày lãi` : '';
            return `<option value="${escapeHtml(item.methodId)}"${item.methodId === state.selectedMethod ? ' selected' : ''}>${escapeHtml(getMethodLabel(item.methodId))}${profitText}${daysText}</option>`;
        }).join('');
        renderMethodDescription();
    }

    function renderMethodDescription() {
        const box = el('methodDescription');
        if (!box) return;
        const stats = getSortedMethodStats(state.history).find(item => item.methodId === state.selectedMethod);
        const statsText = stats && stats.days > 0
            ? ` Lịch sử hiện có: ${stats.wins}/${stats.days} ngày lãi, tổng ${stats.profit >= 0 ? '+' : ''}${Number(stats.profit).toLocaleString('vi-VN')}K.`
            : '';
        box.innerHTML = `
            <div><span class="font-bold">${escapeHtml(getMethodLabel(state.selectedMethod))}:</span> ${escapeHtml(getMethodDescription(state.selectedMethod))}${escapeHtml(statsText)}</div>
            ${renderEdgeHoldExplanation(state.selectedMethod)}
        `;
    }

    function cleanPatternTitle(title) {
        return String(title || '')
            .replace(/\bSố đề\b/g, 'Số')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function explainPatternTitle(title) {
        const normalized = cleanPatternTitle(title).toLowerCase();
        const parts = [];

        if (normalized.includes('về liên tiếp')) {
            parts.push('Về liên tiếp: các ngày liền nhau cùng thỏa điều kiện của dạng chuỗi.');
        }
        if (normalized.includes('về so le theo thứ tự')) {
            parts.push('Về so le theo thứ tự: các ngày thỏa điều kiện cách nhau 1 ngày xen kẽ; giá trị chạy theo đúng thứ tự đã nêu.');
        } else if (normalized.includes('về so le')) {
            parts.push('Về so le: ngày thỏa điều kiện xuất hiện xen kẽ, giữa hai ngày thỏa có một ngày không thỏa.');
        }
        if (normalized.includes('so le theo cặp')) {
            parts.push('So le theo cặp: mỗi ngày được gán vào 1 trong 2 nhãn của cặp, rồi chuỗi chỉ được tính khi hai nhãn luân phiên qua lại, ví dụ A→B→A→B. Nếu A→A hoặc B→B thì đó là liên tiếp/cùng dạng, không phải so le theo cặp.');
        }
        if (normalized.includes('đầu đít cùng/khác')) {
            parts.push('Đầu đít cùng/khác tính chẵn lẻ: lấy chữ số hàng chục là đầu và hàng đơn vị là đít của cùng một số. Cùng chẵn lẻ nghĩa là chẵn-chẵn hoặc lẻ-lẻ; khác chẵn lẻ nghĩa là chẵn-lẻ hoặc lẻ-chẵn.');
            parts.push('Ví dụ: 24 và 35 là cùng chẵn lẻ; 27 và 38 là khác chẵn lẻ. Khi đi với so le theo cặp, chuỗi phải luân phiên Cùng→Khác→Cùng→Khác hoặc ngược lại.');
        }
        if (normalized.includes('nhỏ') && normalized.includes('to')) {
            parts.push('Nhỏ/to: với số là <50 hoặc >=50; với đầu/đít là chữ số 0-4 hoặc 5-9.');
        }
        if (normalized.includes('nguyên tố') || normalized.includes('hợp số')) {
            parts.push('Nguyên tố: số tự nhiên lớn hơn 1 chỉ chia hết cho 1 và chính nó, ví dụ 02, 03, 05, 07, 11, 13, 17, 19, 23, 29.');
            parts.push('Hợp số: số tự nhiên lớn hơn 1 có thêm ước khác ngoài 1 và chính nó. Trong cách chia hiện tại, các giá trị không thuộc tập nguyên tố của trục đang xét sẽ rơi vào nhãn hợp số/không nguyên tố.');
            parts.push('Với "Số nguyên tố - hợp số so le theo cặp", chuỗi chỉ tính khi nhãn nguyên tố và hợp số luân phiên qua các ngày.');
        }
        if (normalized.includes('tiến') || normalized.includes('lùi')) {
            parts.push('Tiến/lùi: giá trị đi lên hoặc đi xuống theo trục thứ tự của tập số/đầu/đít/tổng/hiệu tương ứng.');
        }
        if (normalized.includes('tổng')) {
            parts.push('Tổng: nhóm theo tổng hai chữ số. Tổng TT dùng hàng đơn vị của tổng, còn Tổng Mới dùng tổng thật từ 0 đến 18.');
        }
        if (normalized.includes('hiệu')) {
            parts.push('Hiệu: nhóm theo trị tuyệt đối giữa chữ số hàng chục và hàng đơn vị.');
        }

        return parts.length
            ? `${cleanPatternTitle(title)}\n\n${parts.join('\n')}`
            : `${cleanPatternTitle(title)}\n\nPattern thống kê dùng để xác định nhóm số bị loại trừ trong ngày dự đoán.`;
    }

    function formatResultBadge(win, label) {
        if (win === null || win === undefined) {
            return `<span class="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-650">Chờ kết quả</span>`;
        }
        if (win) {
            return `<span class="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-250">${label} Thắng</span>`;
        } else {
            return `<span class="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-750 border border-rose-250">${label} Thua</span>`;
        }
    }

    function formatDateToDMY(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.substring(0, 10).split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateStr;
    }

    function setLoading(isLoading) {
        const spinner = el('runSpinner');
        const label = el('runLabel');
        if (isLoading) {
            spinner.classList.remove('hidden');
            label.textContent = 'Đang tải dữ liệu...';
        } else {
            spinner.classList.add('hidden');
            label.textContent = 'Lịch sử dự đoán';
        }
    }

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

    async function loadHistory() {
        setLoading(true);
        cleanupExpiredCache();
        try {
            if (window.AppConfig && typeof window.AppConfig.checkAndClearCacheOnNewData === 'function') {
                await window.AppConfig.checkAndClearCacheOnNewData();
            }
            const historyRes = await fetch(`/api/prediction/history?limit=90&v=5&_t=${Date.now()}`, { cache: 'no-store' });
            const data = await historyRes.json();
            if (!historyRes.ok) throw new Error(data?.error || 'Không thể tải cache Lịch sử từ R2.');
            if (data && data.success && Array.isArray(data.history)) {
                state.history = data.history;
                renderMethodSelector();
                renderDashboard();
            } else {
                showError((data && data.error) || 'Không thể tải lịch sử dự đoán.');
            }
        } catch (error) {
            showError(error.message || 'Lỗi kết nối máy chủ.');
        } finally {
            setLoading(false);
        }
    }

    function showError(msg) {
        const errorBox = el('errorBox');
        if (msg) {
            errorBox.textContent = msg;
            errorBox.classList.remove('hidden');
        } else {
            errorBox.classList.add('hidden');
        }
    }

    function renderDashboard() {
        showError('');
        const history = state.history;
        if (history.length === 0) {
            el('summarySection').classList.add('hidden');
            el('detailsSection').classList.add('hidden');
            el('errorBox').innerHTML = `
                <div class="text-center py-12 bg-white/50 rounded-2xl border border-slate-200 backdrop-blur">
                    <i class="bi bi-calendar-x text-slate-400 text-4xl mb-3 block"></i>
                    <p class="text-slate-650 font-medium">Chưa có lịch sử dự đoán được lưu trữ.</p>
                    <p class="text-xs text-slate-500 mt-1">Hệ thống tự động lưu khi có kết quả xổ số mới hàng ngày lúc 18:40.</p>
                </div>
            `;
            el('errorBox').classList.remove('hidden');
            return;
        }

        // Calculate aggregates for resolved runs that have the currently selected method.
        const resolvedSummaries = history
            .map(r => getDisplaySummary(r, state.selectedMethod))
            .filter(sum => sum && sum.resolved && !sum.missingMethod);
        const totalDays = resolvedSummaries.length;

        let betWins = 0;
        let holdWins = 0;
        let totalBetProfit = 0;
        let totalHoldProfit = 0;
        let totalProfit = 0;

        resolvedSummaries.forEach(sum => {
            if (sum.betWin) betWins++;
            if (sum.holdWin) holdWins++;
            totalBetProfit += sum.betProfit || 0;
            totalHoldProfit += sum.holdProfit || 0;
            totalProfit += sum.profit || 0;
        });

        // 1. Render Summary Cards
        const summarySection = el('summarySection');
        summarySection.classList.remove('hidden');
        
        const betWinRate = totalDays > 0 ? ((betWins / totalDays) * 100).toFixed(1) : '0.0';
        const holdWinRate = totalDays > 0 ? ((holdWins / totalDays) * 100).toFixed(1) : '0.0';

        summarySection.innerHTML = `
            <div class="glass-card p-5 border-l-4 border-indigo-500 bg-white/60">
                <div class="text-xs font-bold uppercase text-slate-500 tracking-wider">Tổng số ngày chơi</div>
                <div class="mt-2 text-3xl font-extrabold text-slate-900">${totalDays} <span class="text-xs font-normal text-slate-500">ngày đã kết toán</span></div>
                <div class="text-xs text-slate-450 mt-1.5">Số ngày chờ kết toán: ${history.length - totalDays} ngày</div>
            </div>
            <div class="glass-card p-5 border-l-4 border-emerald-500 bg-white/60">
                <div class="text-xs font-bold uppercase text-slate-500 tracking-wider">Chiến lược Đánh</div>
                <div class="mt-2 text-3xl font-extrabold text-slate-900">${betWinRate}% <span class="text-xs font-normal text-slate-500">(${betWins}/${totalDays} ngày thắng)</span></div>
                <div class="text-xs text-slate-550 mt-1.5">Lợi nhuận Đánh: ${formatProfit(totalBetProfit)}</div>
            </div>
            <div class="glass-card p-5 border-l-4 border-purple-500 bg-white/60">
                <div class="text-xs font-bold uppercase text-slate-500 tracking-wider">Chiến lược Ôm / Loại</div>
                <div class="mt-2 text-3xl font-extrabold text-slate-900">${holdWinRate}% <span class="text-xs font-normal text-slate-500">(${holdWins}/${totalDays} ngày thắng)</span></div>
                <div class="text-xs text-slate-550 mt-1.5">Lợi nhuận Ôm: ${formatProfit(totalHoldProfit)}</div>
            </div>
            <div class="glass-card p-5 border-l-4 border-amber-500 bg-white/60">
                <div class="text-xs font-bold uppercase text-slate-500 tracking-wider">Tổng lợi nhuận ròng</div>
                <div class="mt-2 text-3xl font-extrabold text-slate-900">${formatProfit(totalProfit)}</div>
                <div class="text-xs text-slate-500 mt-1.5">Đánh 1000K mỗi số, trúng nhận theo tỷ lệ ăn đã chọn.</div>
            </div>
        `;

        // 2. Render Table and Details Side-by-side
        el('detailsSection').classList.remove('hidden');
        
        const detailsTable = el('detailsTable');
        detailsTable.innerHTML = '';

        history.forEach((run, idx) => {
            const sum = getDisplaySummary(run, state.selectedMethod) || {};
            const isPending = isPendingRun(run);
            const actualNumber = run.summary?.resolved ? Number(run.summary.actualSpecial) : null;
            const actualInBet = actualNumber !== null && (sum.numbersToBet || []).some(n => Number(n) === actualNumber);
            const actualInExcluded = actualNumber !== null && (sum.excludedNumbers || []).some(n => Number(n) === actualNumber);
            const actualBadgeClass = actualInBet
                ? 'number-chip-hit'
                : (actualInExcluded ? 'number-chip-wrong-exclude' : 'number-chip-actual');
            const actualBadgeTitle = actualInBet
                ? 'Kết quả thực tế trùng dàn đánh đã dự đoán'
                : (actualInExcluded ? 'Kết quả thực tế rơi vào dàn loại trừ đã dự đoán' : 'Kết quả thực tế');

            const dateStr = formatDateToDMY(run.predictionDate);
            const deStr = run.summary?.resolved && run.summary?.actualSpecial !== null
                ? `<span title="${escapeHtml(actualBadgeTitle)}" class="inline-flex min-w-10 justify-center rounded-lg border px-2.5 py-1 font-mono text-sm font-black ${actualBadgeClass}">${String(run.summary.actualSpecial).padStart(2, '0')}</span>`
                : '<span class="text-slate-450 font-bold animate-pulse">Chờ...</span>';
            const profitHtml = sum.missingMethod
                ? '<span class="text-slate-400 text-xs">Chưa có dữ liệu</span>'
                : (run.summary?.resolved ? formatProfit(sum.profit) : '<span class="text-slate-450 font-medium">Chờ...</span>');

            const row = document.createElement('tr');
            row.className = `cursor-pointer hover:bg-indigo-50/40 transition border-b border-slate-100 ${getHistoryRowClass(state.selectedIndex === idx, isPending)}`;
            row.innerHTML = `
                <td class="px-4 py-3.5 whitespace-nowrap font-medium text-slate-800">${dateStr} ${isPending ? '<span class="ml-1 text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold">Dự báo</span>' : ''}</td>
                <td class="px-4 py-3.5 text-center whitespace-nowrap">${deStr}</td>
                <td class="px-4 py-3.5 whitespace-nowrap">
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-slate-500">${sum.betCount || 0} số</span>
                        ${sum.resolved ? formatResultBadge(sum.betWin, 'Đánh') : '<span class="text-xs text-slate-400">—</span>'}
                    </div>
                </td>
                <td class="px-4 py-3.5 whitespace-nowrap">
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-slate-500">${sum.excludedCount || 0} số</span>
                        ${sum.resolved ? formatResultBadge(sum.holdWin, 'Ôm') : '<span class="text-xs text-slate-400">—</span>'}
                    </div>
                </td>
                <td class="px-4 py-3.5 whitespace-nowrap text-right font-medium">${profitHtml}</td>
            `;
            row.addEventListener('click', () => {
                selectRow(idx);
            });
            detailsTable.appendChild(row);
        });

        // Select first row by default if not set
        if (state.selectedIndex === -1 && history.length > 0) {
            selectRow(0);
        } else {
            selectRow(state.selectedIndex);
        }
    }

    function selectRow(index) {
        if (index < 0 || index >= state.history.length) return;
        state.selectedIndex = index;
        
        // Update table row styling
        const rows = el('detailsTable').children;
        for (let i = 0; i < rows.length; i++) {
            const isPending = isPendingRun(state.history[i]);
            rows[i].className = `cursor-pointer hover:bg-indigo-50/40 transition border-b border-slate-100 ${getHistoryRowClass(i === index, isPending)}`;
        }

        const run = state.history[index];
        const sum = getDisplaySummary(run, state.selectedMethod) || {};
        const dateStr = formatDateToDMY(run.predictionDate);
        const isPending = isPendingRun(run);

        // Render Details Sidebar
        const sidebar = el('methodDetail');
        if (sum.missingMethod) {
            sidebar.innerHTML = `
                <div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <div class="font-bold">Chưa có dữ liệu cho phương pháp ${escapeHtml(state.selectedMethod)}</div>
                    <div class="mt-2 text-xs leading-5">Cache lịch sử hiện tại chưa được sinh với phương pháp này. Hãy chạy lại action cập nhật dữ liệu để tạo snapshot mới, hoặc chọn phương pháp khác đã có trong lịch sử.</div>
                </div>
            `;
            return;
        }
        
        let headerStatusHtml = '';
        if (isPending) {
            headerStatusHtml = `
                <div class="rounded-xl bg-amber-100 border border-amber-300 p-4 mb-4 text-xs text-amber-900 shadow-sm">
                    <div class="flex items-start gap-2.5">
                        <i class="bi bi-exclamation-triangle-fill text-amber-600 text-base"></i>
                        <div>
                            <div class="font-extrabold uppercase tracking-wide">Dự đoán tương lai - chưa có kết quả</div>
                            <div class="mt-1 leading-relaxed">Dàn số bên dưới là snapshot dự báo cho ngày ${dateStr}, dựa trên dữ liệu của ngày trước đó. Chưa dùng dòng này để kết toán thắng/thua cho tới khi có kết quả quay thưởng.</div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            const profitText = sum.profit >= 0 ? `Lãi ${formatMoney(sum.profit)}` : `Lỗ ${formatMoney(sum.profit)}`;
            const profitBg = sum.profit > 0 ? 'bg-emerald-50 text-emerald-800 border-emerald-250' : (sum.profit < 0 ? 'bg-rose-50 text-rose-800 border-rose-250' : 'bg-slate-50 text-slate-800 border-slate-200');
            headerStatusHtml = `
                <div class="rounded-xl border p-4 mb-4 flex items-center justify-between shadow-sm ${profitBg}">
                    <div class="flex items-center gap-2.5">
                        <span class="text-3xl">🎯</span>
                        <div>
                            <div class="text-xs opacity-75 font-semibold">KẾT QUẢ ĐỀ: <span class="font-extrabold text-sm opacity-100">${String(run.summary.actualSpecial).padStart(2, '0')}</span></div>
                            <div class="text-[10px] opacity-75">Dựa trên kết quả draw ngày ${dateStr}</div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="font-extrabold text-base">${profitText}</div>
                        <div class="text-[9px] opacity-75">Đánh: ${sum.betWin?'Thắng':'Thua'} • Ôm: ${sum.holdWin?'Thắng':'Thua'}</div>
                    </div>
                </div>
            `;
        }

        // Render Number grids
        const renderNumberGrid = (numbers, colorClass) => {
            if (!numbers || numbers.length === 0) return '<div class="text-xs text-slate-400 italic">Không có số nào</div>';
            const isBetGrid = String(colorClass).includes('emerald');
            const isExcludeGrid = String(colorClass).includes('red') || String(colorClass).includes('rose');
            const baseClass = isBetGrid
                ? 'number-chip-bet'
                : (isExcludeGrid ? 'number-chip-exclude' : colorClass);
            return `
                <div class="number-grid">
                    ${numbers.sort((a,b)=>a-b).map(n => {
                        const isHit = sum.resolved && Number(sum.actualSpecial) === Number(n);
                        const hitClass = isHit
                            ? (isBetGrid ? 'number-chip-hit' : (isExcludeGrid ? 'number-chip-wrong-exclude' : 'number-chip-actual'))
                            : '';
                        const title = isHit
                            ? (isBetGrid ? 'Kết quả thực tế trùng dàn đánh' : (isExcludeGrid ? 'Kết quả thực tế rơi vào dàn loại trừ' : 'Kết quả thực tế'))
                            : '';
                        return `<span title="${escapeHtml(title)}" class="w-8.5 h-8.5 rounded-lg border text-center leading-8 text-[11px] font-bold shadow-sm transition ${baseClass} ${hitClass}">${String(n).padStart(2, '0')}</span>`;
                    }).join('')}
                </div>
            `;
        };

        // Render Explanations
        let explanationsHtml = '';
        if (sum.explanations && sum.explanations.length > 0) {
            explanationsHtml = sum.explanations.map(exp => {
                const badgeColor = exp.tier === 'red' ? 'bg-red-500' : 'bg-purple-600';
                const title = cleanPatternTitle(exp.title);
                const tooltip = explainPatternTitle(exp.title);
                return `
                    <div class="p-3 bg-white border border-slate-200 rounded-xl shadow-sm text-xs space-y-1.5">
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-slate-800 text-[12px] cursor-help underline decoration-dotted decoration-slate-400" title="${escapeHtml(tooltip)}">${escapeHtml(title)}</span>
                            <span class="text-[10px] text-white px-2 py-0.5 rounded-full font-bold ${badgeColor}">${exp.tier === 'red' ? 'Record' : 'Potential'}</span>
                        </div>
                        <p class="text-slate-650 leading-relaxed text-[11px]">${escapeHtml(exp.reason)}</p>
                        <div class="flex flex-wrap gap-1 mt-1">
                            ${(exp.numbers || []).map(n => {
                                const isActual = sum.resolved && Number(sum.actualSpecial) === Number(n);
                                return `<span title="${isActual ? 'Kết quả thực tế nằm trong chuỗi loại trừ này' : ''}" class="border px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${isActual ? 'number-chip-wrong-exclude' : 'number-chip-exclude'}">${String(n).padStart(2, '0')}</span>`;
                            }).join('')}
                        </div>
                    </div>
                `;
            }).join('<div class="h-2"></div>');
        } else {
            explanationsHtml = '<div class="text-xs text-slate-500 italic">Không có chuỗi loại trừ kích hoạt trong ngày này.</div>';
        }

        const panelClass = isPending
            ? 'space-y-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-inner'
            : 'space-y-5';
        const detailBadge = isPending
            ? '<span class="ml-2 align-middle rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">Tương lai</span>'
            : '';
        const methodExplanationHtml = renderEdgeHoldExplanation(state.selectedMethod, true);

        sidebar.innerHTML = `
            <div class="${panelClass}">
                <div>
                    <h3 class="text-base font-bold text-slate-900">Chi tiết ngày ${dateStr}${detailBadge}</h3>
                    <p class="text-xs ${isPending ? 'text-amber-800' : 'text-slate-500'} mt-0.5">Dựa trên kết quả thống kê của ngày trước đó${isPending ? ', chưa có kết quả thực tế để kết toán' : ''}</p>
                    <p class="mt-1.5 inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-800">
                        <i class="bi bi-lock-fill"></i>
                        Snapshot đã khóa: dàn số không đổi sau khi có kết quả
                    </p>
                </div>

                ${headerStatusHtml}
                ${methodExplanationHtml}

                <div class="number-panel-bet rounded-2xl border p-3">
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider">Số Đánh (${sum.betCount || 0} số)</h4>
                        <span class="text-[10px] text-slate-500">Mỗi số 1000K (hệ số ${state.betWinFactor} × ăn ${state.betWinMultiplier})</span>
                    </div>
                    ${renderNumberGrid(sum.numbersToBet, 'border-emerald-200 bg-emerald-50/50 text-emerald-700')}
                </div>

                <div class="number-panel-exclude rounded-2xl border p-3">
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider">Số Ôm / Loại trừ (${sum.excludedCount || 0} số)</h4>
                        <span class="text-[10px] text-slate-500">Giữ tỷ lệ ${(state.holdWinMultiplier * 100).toFixed(1)}% (đền 70)</span>
                    </div>
                    ${renderNumberGrid(sum.excludedNumbers, 'border-red-200 bg-red-50/50 text-red-700')}
                </div>

                <div class="border-t border-slate-100 pt-3">
                    <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Các chuỗi kích hoạt</h4>
                    <div class="space-y-2 overflow-y-auto max-h-[300px] pr-1 custom-scrollbar">
                        ${explanationsHtml}
                    </div>
                </div>
            </div>
        `;
    }

    // Initialize Page
    document.addEventListener('DOMContentLoaded', () => {
        const methodSelector = el('methodSelector');
        if (methodSelector) {
            methodSelector.addEventListener('change', (e) => {
                state.selectedMethod = e.target.value;
                renderMethodDescription();
                renderDashboard();
            });
        }
        const betWinInput = el('betWinMultiplier');
        if (betWinInput) {
            betWinInput.addEventListener('input', (e) => {
                const nextValue = Number(e.target.value);
                if (Number.isFinite(nextValue)) {
                    state.betWinMultiplier = Math.max(70, Math.min(90, Math.round(nextValue)));
                    renderMethodSelector();
                    renderDashboard();
                }
            });
        }
        const betWinFactorInput = el('betWinFactor');
        if (betWinFactorInput) {
            betWinFactorInput.addEventListener('input', (e) => {
                const nextValue = Number(e.target.value);
                if (Number.isFinite(nextValue)) {
                    state.betWinFactor = Math.max(0.01, Math.min(100, Math.round(nextValue * 100) / 100));
                    renderMethodSelector();
                    renderDashboard();
                }
            });
        }
        const holdInput = el('holdWinMultiplier');
        if (holdInput) {
            holdInput.addEventListener('input', (e) => {
                const nextValue = Number(e.target.value);
                if (Number.isFinite(nextValue)) {
                    state.holdWinMultiplier = Math.max(0.5, Math.min(1, Math.round(nextValue * 1000) / 1000));
                    renderMethodSelector();
                    renderDashboard();
                }
            });
        }
        loadHistory();
    });
})();
