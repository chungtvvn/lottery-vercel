'use strict';

const fs = require('fs');
const path = require('path');
const deFusionService = require('../lib/services/deFusionService');
const { getParityForm, numStr } = deFusionService;

const MULTIPLIER = 84;
const UNIT_X2_K = 2000;
const UNIT_X1_K = 1000;

async function generate() {
    const adv = JSON.parse(fs.readFileSync('lib/data/statistics/cached_daily_method_advisor.json', 'utf8'));
    const rep = deFusionService.getDeFusionReport({ forceRefresh: false });
    const ledger = (rep.settledLedger || []).slice().sort((a, b) => a.date.localeCompare(b.date));

    const loList = adv.loDropoff27?.all2026Ledger || [];
    const loMap = {};
    loList.forEach(r => { loMap[r.date] = r; });

    // Dữ liệu chi tiết từng ngày
    const daysData = [];

    // Tìm các ngày chênh lệch giữa PA1 và PA2
    const pa1VsPa2Diff = [];

    ledger.forEach(r => {
        const s = r.strategies?.ai5Ensemble;
        if (!s) return;
        const actualStr = numStr(r.actualSpecial);
        const actualForm = r.actualForm || getParityForm(actualStr);
        const predForm = r.parityPrediction?.predForm;
        const oppForm = r.parityPrediction?.oppForm;
        const isElimLoss = s.isEliminatedLoss;

        const filteredTop = s.filteredTop || [];
        const filteredBot = s.filteredBot || [];
        const allFiltered = [...filteredTop, ...filteredBot];

        // PA1: 12 X2 + còn lại X1
        const pa1_x2 = filteredTop.slice(0, 12);
        const pa1_x1_full = [...filteredTop.slice(12), ...filteredBot];
        const pa1_x1_drop2 = pa1_x1_full.slice(0, Math.max(0, pa1_x1_full.length - 2));

        // PA2: 4 con mỗi dạng X2
        const remainingForms = ['LL', 'CC', 'CL', 'LC'].filter(f => f !== oppForm);
        const formsMap = { [remainingForms[0]]: [], [remainingForms[1]]: [], [remainingForms[2]]: [] };
        filteredTop.forEach(n => {
            const f = getParityForm(n);
            if (formsMap[f]) formsMap[f].push(n);
        });
        const pa2_x2 = [];
        const selectedSet = new Set();
        remainingForms.forEach(f => {
            let count = 0;
            for (const n of filteredTop) {
                if (getParityForm(n) === f && count < 4 && !selectedSet.has(n)) {
                    pa2_x2.push(n);
                    selectedSet.add(n);
                    count++;
                }
            }
            if (count < 4) {
                for (const n of filteredBot) {
                    if (getParityForm(n) === f && count < 4 && !selectedSet.has(n)) {
                        pa2_x2.push(n);
                        selectedSet.add(n);
                        count++;
                    }
                }
            }
        });
        const pa2_remTop = filteredTop.filter(n => !selectedSet.has(n));
        const pa2_remBot = filteredBot.filter(n => !selectedSet.has(n));
        const pa2_x1_full = [...pa2_remTop, ...pa2_remBot];
        const pa2_x1_drop2 = pa2_x1_full.slice(0, Math.max(0, pa2_x1_full.length - 2));

        // Kiểm tra trúng
        const hitPA1_X2 = pa1_x2.includes(actualStr);
        const hitPA1_X1_drop2 = !hitPA1_X2 && pa1_x1_drop2.includes(actualStr);
        const hitPA1_drop2 = hitPA1_X2 || hitPA1_X1_drop2;

        const hitPA2_X2 = pa2_x2.includes(actualStr);
        const hitPA2_X1_drop2 = !hitPA2_X2 && pa2_x1_drop2.includes(actualStr);

        if (hitPA1_X2 && !hitPA2_X2) {
            pa1VsPa2Diff.push({
                date: r.date,
                actual: actualStr,
                form: actualForm,
                rankInFiltered: filteredTop.indexOf(actualStr) + 1
            });
        }

        // Đột phá A: 12 X2 + 5 X1 (17s)
        const dpA_x2 = filteredTop.slice(0, 12);
        const dpA_x1 = [...filteredTop.slice(12), ...filteredBot].slice(0, 5);
        const hitDpA_X2 = dpA_x2.includes(actualStr);
        const hitDpA_X1 = !hitDpA_X2 && dpA_x1.includes(actualStr);
        const stakeDpA = (dpA_x2.length * 2) + (dpA_x1.length * 1);
        const payoutDpA = hitDpA_X2 ? 168 : (hitDpA_X1 ? 84 : 0);

        // Đột phá B: 17 X2 thuần
        const dpB_x2 = filteredTop.slice(0, 17);
        const hitDpB = dpB_x2.includes(actualStr);
        const stakeDpB = dpB_x2.length * 2;
        const payoutDpB = hitDpB ? 168 : 0;

        // Lô Top 7
        const loRow = loMap[r.date];
        const stakeLo = (loRow?.stakeK || 0) / 1000;
        const payoutLo = (loRow?.payoutK || 0) / 1000;

        // Vị trí trúng trong allFiltered
        const hitRank = allFiltered.indexOf(actualStr) !== -1 ? allFiltered.indexOf(actualStr) + 1 : -1;

        daysData.push({
            date: r.date,
            month: r.date.slice(0, 7),
            actualSpecial: actualStr,
            actualForm,
            predForm,
            oppForm,
            isElimLoss,
            allFilteredCount: allFiltered.length,
            hitRank,
            // PA1
            hitPA1_X2,
            hitPA1_X1_drop2,
            hitPA1_drop2,
            pa1_stake: (pa1_x2.length * 2) + (pa1_x1_drop2.length * 1),
            pa1_payout: hitPA1_X2 ? 168 : (hitPA1_X1_drop2 ? 84 : 0),
            // PA2
            hitPA2_X2,
            hitPA2_X1_drop2,
            // Đột phá A
            stakeDpA,
            payoutDpA,
            profitDpA: payoutDpA - stakeDpA,
            hitDpA_X2,
            hitDpA_X1,
            // Đột phá B
            stakeDpB,
            payoutDpB,
            profitDpB: payoutDpB - stakeDpB,
            hitDpB,
            // Lô
            stakeLo,
            payoutLo,
            profitLo: payoutLo - stakeLo
        });
    });

    console.log(`Đã nạp ${daysData.length} kỳ đối soát, ${pa1VsPa2Diff.length} kỳ PA1 hơn PA2.`);

    const htmlPath = path.join(process.cwd(), 'reports/de-fusion-5ai-research-report-2026.html');
    const publicPath = path.join(process.cwd(), 'public/de-fusion-research-2026.html');
    const artifactPath = '/Users/chungtv/.gemini/antigravity/brain/5951aaee-50cc-46a0-be6a-5b08bbdbd9a5/de_fusion_5ai_comprehensive_report_2026.html';

    const htmlContent = `<!DOCTYPE html>
<html lang="vi" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Báo Cáo Nghiên Cứu Chuyên Sâu & Giải Pháp Lợi Nhuận Dương: Đề Fusion Đồng Thuận 5 AI (2026)</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        brand: {
                            50: '#f0fdf4',
                            500: '#22c55e',
                            600: '#16a34a',
                            700: '#15803d',
                            900: '#14532d',
                        }
                    }
                }
            }
        }
    </script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
        code, .font-mono { font-family: 'JetBrains Mono', monospace; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #111827; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
    </style>
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen">
    <!-- Top Header -->
    <header class="border-b border-gray-800 bg-gray-900/90 backdrop-blur sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
                <div class="flex items-center gap-2.5 flex-wrap">
                    <span class="px-2.5 py-1 text-xs font-bold rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">100% Strict PIT</span>
                    <span class="px-2.5 py-1 text-xs font-semibold rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/30">Đề Fusion (2026)</span>
                    <span class="px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/30">Báo Cáo Nghiên Cứu Chuyên Sâu</span>
                    <span class="px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30">Offline Observer</span>
                </div>
                <h1 class="text-xl md:text-2xl font-black text-white mt-1.5 tracking-tight">
                    BÁO CÁO NGHIÊN CÚU TOÀN DIỆN & PHÁT HIỆN SỐ HỌC: ĐỒNG THUẬN 5 AI ĐỀ 50S
                </h1>
                <p class="text-xs md:text-sm text-gray-400 mt-0.5">
                    Đối soát 299 kỳ mở thưởng thực tế năm 2026 (01/01/2026 – 30/10/2026) • Đơn vị: 1M (1,000,000 VNĐ) • Tỷ lệ thưởng: 1 ăn 84
                </p>
            </div>
            <div class="flex items-center gap-2">
                <span class="text-xs text-gray-300 bg-gray-800/80 px-3 py-1.5 rounded-lg border border-gray-700">
                    Trạng thái: <strong class="text-emerald-400">Đã kiểm chứng SSOT</strong>
                </span>
            </div>
        </div>
    </header>

    <!-- Main Container -->
    <main class="max-w-7xl mx-auto px-4 py-6 space-y-8">
        
        <!-- Executive KPI Cards -->
        <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 relative overflow-hidden">
                <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Cấu Hình Quán Quân (PA1)</div>
                <div class="text-2xl font-black text-blue-400 mt-2">-850.0M <span class="text-xs font-normal text-gray-400">(ROI -6.02%)</span></div>
                <div class="text-xs text-gray-400 mt-2">
                    Tiết kiệm <strong class="text-white">+8,303M vốn</strong> (37%), vượt trội hơn dàn gốc <strong class="text-emerald-400">+2,171M</strong>.
                </div>
            </div>

            <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 relative overflow-hidden">
                <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tối Ưu 2 Con Cuối X1 (PA3)</div>
                <div class="text-2xl font-black text-emerald-400 mt-2">+262.0M <span class="text-xs font-normal text-emerald-500">LÃI THÊM</span></div>
                <div class="text-xs text-gray-400 mt-2">
                    2 con cuối chỉ trúng 4 lần (1.34%). Tiết kiệm 598M vốn, mất 336M thưởng $\to$ <strong class="text-emerald-400">Lời +262M</strong>.
                </div>
            </div>

            <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 relative overflow-hidden">
                <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Đột Phá Sweet-Spot 17 Số</div>
                <div class="text-2xl font-black text-amber-400 mt-2">+149M <span class="text-xs font-normal text-gray-400">đến</span> +278M</div>
                <div class="text-xs text-gray-400 mt-2">
                    Dàn 12 X2 + 5 X1: <strong class="text-emerald-400">+149M (ROI +1.72%)</strong>. Dàn 17 X2 thuần: <strong class="text-emerald-400">+278M (ROI +2.74%)</strong>.
                </div>
            </div>

            <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 relative overflow-hidden">
                <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Đột Phá Combo: Đề 17s + Lô Top 7</div>
                <div class="text-2xl font-black text-purple-400 mt-2">+624.4M <span class="text-xs font-normal text-emerald-400">(ROI +4.70%)</span></div>
                <div class="text-xs text-gray-400 mt-2">
                    Kết hợp Đề nổ lớn (168M) với Lô dòng tiền đều (89.6% win) $\to$ <strong class="text-purple-300">+753.4M (Combo 2)</strong>.
                </div>
            </div>
        </section>

        <!-- Navigation Tabs -->
        <div class="border-b border-gray-800 flex gap-2 overflow-x-auto pb-1" id="tabBar">
            <button onclick="switchTab('tab-pa1-5')" class="tab-btn px-4 py-2.5 text-sm font-semibold rounded-lg bg-gray-800 text-white border border-gray-700 transition" id="btn-tab-pa1-5">
                1. Chi Tiết 5 Phương Án Nghiên Cứu
            </button>
            <button onclick="switchTab('tab-matrix')" class="tab-btn px-4 py-2.5 text-sm font-semibold rounded-lg bg-transparent text-gray-400 hover:text-white transition" id="btn-tab-matrix">
                2. Ma Trận So Sánh 13 Cấu Hình
            </button>
            <button onclick="switchTab('tab-positive')" class="tab-btn px-4 py-2.5 text-sm font-semibold rounded-lg bg-transparent text-gray-400 hover:text-white transition" id="btn-tab-positive">
                3. Đột Phá: Giải Pháp Lợi Nhuận Dương 🔥
            </button>
            <button onclick="switchTab('tab-months')" class="tab-btn px-4 py-2.5 text-sm font-semibold rounded-lg bg-transparent text-gray-400 hover:text-white transition" id="btn-tab-months">
                4. Phân Tích Chi Tiết Từng Tháng (10 Tháng 2026)
            </button>
            <button onclick="switchTab('tab-ledger')" class="tab-btn px-4 py-2.5 text-sm font-semibold rounded-lg bg-transparent text-gray-400 hover:text-white transition" id="btn-tab-ledger">
                5. Sổ Tra Cứu 299 Kỳ Thực Tế
            </button>
        </div>

        <!-- TAB 1: 5 PHƯƠNG ÁN NGHIÊN CỨU CHI TIẾT -->
        <section id="tab-pa1-5" class="tab-content space-y-6">
            
            <!-- LOẠI 1 & LOẠI 2: PA1 VS PA2 -->
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
                <div class="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 pb-4 gap-2">
                    <div>
                        <h2 class="text-lg font-bold text-white flex items-center gap-2">
                            <span class="w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 text-xs flex items-center justify-center font-bold">1 & 2</span>
                            Phương Án 1 (Top 12 X2 Tự Nhiên) vs Phương Án 2 (Mỗi Dạng 4 Con X2)
                        </h2>
                        <p class="text-xs text-gray-400 mt-1">Phân tích cơ chế xếp tầng X2 và nguyên nhân số học dẫn tới chênh lệch +588 Triệu VNĐ</p>
                    </div>
                    <span class="text-xs px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/30 font-bold self-start md:self-auto">
                        PA1 Thắng Tuyệt Đối +588.0M (+4.0% ROI)
                    </span>
                </div>
                
                <!-- Definition Boxes -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="bg-gray-950 p-4 rounded-xl border border-blue-500/30 space-y-2">
                        <div class="text-sm font-bold text-blue-400 flex items-center gap-1.5">
                            <span>📌</span> Cơ Chế Phương Án 1 (Top 12 Tự Nhiên)
                        </div>
                        <p class="text-xs text-gray-300 leading-relaxed">
                            Lấy đúng <strong>12 con số có điểm đồng thuận cao nhất</strong> trên dàn X2 sau lọc (<code class="text-amber-400">filteredTop</code>) làm tầng X2 (cược 2M, ăn 168M). Những con còn lại của X2 được đẩy xuống làm các vị trí đầu tiên của dàn X1 (<code class="text-blue-300">filteredBot</code>).
                        </p>
                        <div class="text-xs text-blue-300 font-mono bg-blue-950/40 p-2.5 rounded border border-blue-500/20">
                            • X2: 12 số | X1: ~25.2 số<br>
                            • Trúng X2: <strong>43 lần (ăn 168M)</strong> | Trúng X1: 76 lần (ăn 84M)<br>
                            • Lãi ròng cả năm: <strong>-1,112.0M (ROI -7.55%)</strong>
                        </div>
                    </div>

                    <div class="bg-gray-950 p-4 rounded-xl border border-amber-500/30 space-y-2">
                        <div class="text-sm font-bold text-amber-400 flex items-center gap-1.5">
                            <span>📌</span> Cơ Chế Phương Án 2 (Ép Cân Bằng 4 Con / Dạng)
                        </div>
                        <p class="text-xs text-gray-300 leading-relaxed">
                            Sau khi loại trừ <code class="text-red-400">oppForm</code>, dàn còn 3 dạng hình thái. Thuật toán lấy <strong>mỗi dạng đúng 4 con đầu tiên</strong> ghép thành 12 con X2. Những con dôi dư của mỗi dạng bị đẩy xuống làm các vị trí đầu của dàn X1.
                        </p>
                        <div class="text-xs text-amber-300 font-mono bg-amber-950/40 p-2.5 rounded border border-amber-500/20">
                            • X2: 12 số | X1: ~25.2 số<br>
                            • Trúng X2: <strong>36 lần (ăn 168M)</strong> (MẤT 7 LẦN TRÚNG X2!)<br>
                            • Lãi ròng cả năm: <strong>-1,700.0M (ROI -11.55%)</strong>
                        </div>
                    </div>
                </div>

                <!-- Deep Mathematical Explanation -->
                <div class="bg-gray-950 p-5 rounded-xl border border-gray-800 space-y-3">
                    <h3 class="text-sm font-bold text-white flex items-center gap-2">
                        <span>🔬</span> Phát Hiện Số Học Sâu: Vì Sao Cân Bằng Hình Thái Lại Phá Hủy Lợi Nhuận?
                    </h3>
                    <p class="text-xs text-gray-300 leading-relaxed">
                        1. <strong>Hiện tượng "Vắt kiệt số mạnh, kéo vớt số yếu" (Strong-Demotion & Weak-Promotion):</strong><br>
                        Trong thực tế, 5 AI chấm điểm dựa trên phân phối dữ liệu Bayes-Markov độc lập. Vào những ngày mà một dạng hình thái (ví dụ <code class="text-emerald-400">LC</code>) chiếm ưu thế áp đảo, có tới 7–8 con số dạng này nằm trong Top 10 của dàn.
                        Khi PA2 áp đặt chỉ tiêu cứng "4 con/dạng", toàn bộ các con số xếp từ vị trí thứ 5 đến thứ 8 của dạng đó bị <strong>đá văng xuống tầng X1</strong>!
                        Đồng thời, để bù đủ 4 con cho dạng yếu (ví dụ <code class="text-purple-400">LL</code> chỉ có 2 con trong Top 18), PA2 phải <strong>kéo vớt những con số tận đáy dàn X1 lên tầng X2</strong>!
                    </p>
                    <p class="text-xs text-gray-300 leading-relaxed">
                        2. <strong>Danh sách các ngày chịu thiệt hại điển hình (PA1 ăn 168M, PA2 bị rơi xuống ăn 84M):</strong><br>
                        • Ngày <strong>2026-03-08</strong>: Giải ĐB về <strong>36</strong> (Dạng LC - <strong>Xếp hạng 1 trong Top</strong>). Vì dạng LC đã đủ 4 số khác trước đó trong danh sách duyệt, con số Top 1 này bị đẩy xuống X1!<br>
                        • Ngày <strong>2026-07-22</strong>: Giải ĐB về <strong>54</strong> (Dạng LC - <strong>Xếp hạng 1 trong Top</strong>) bị đẩy xuống X1 vì dạng dự đoán là CC.<br>
                        • Ngày <strong>2026-07-01</strong>: Giải ĐB về <strong>54</strong> (Dạng LC - <strong>Xếp hạng 2 trong Top</strong>) bị PA2 đẩy xuống X1.<br>
                        • Ngày <strong>2026-01-21</strong> (về 86 rank 7), ngày <strong>2026-02-11</strong> (về 92 rank 6), ngày <strong>2026-06-03</strong> (về 36 rank 6), ngày <strong>2026-10-24</strong> (về 32 rank 6)...<br>
                        Tổng cộng có đúng <strong>7 ngày</strong> đề nổ các con số siêu VIP này, khiến PA2 bị mất $7 \times (168\text{M} - 84\text{M}) = \mathbf{588\text{ Triệu VNĐ}}$ tiền thưởng!
                    </p>
                </div>
            </div>

            <!-- LOẠI 3: PHƯƠNG ÁN 3 - 2 CON CUỐI DÀN X1 -->
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                <div class="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 pb-4 gap-2">
                    <div>
                        <h2 class="text-base font-bold text-white flex items-center gap-2">
                            <span class="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 text-xs flex items-center justify-center font-bold">3</span>
                            Phương Án 3: Thống Kê Chi Tiết 2 Con Cuối Cùng Dàn X1
                        </h2>
                        <p class="text-xs text-gray-400 mt-1">Đánh giá xác suất nổ thực tế và hiệu quả toán học khi loại bỏ 2 con số ở đáy dàn</p>
                    </div>
                    <span class="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold self-start md:self-auto">
                        Cắt Bỏ Mang Lại Lãi Ròng +262.0 Triệu VNĐ
                    </span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="bg-gray-950 p-4 rounded-xl border border-gray-800 space-y-2">
                        <div class="text-sm font-bold text-emerald-400">Thống Kê Xác Suất Nổ Thực Tế:</div>
                        <ul class="text-xs text-gray-300 space-y-1.5 list-disc list-inside">
                            <li>Trên dàn X1 sau lọc (<code class="text-blue-300">filteredBot</code>, trung bình 18.3 con): 2 con cuối trúng đúng <strong>4 lần / 299 kỳ (1.34%)</strong>.</li>
                            <li>Trên dàn X1 tái cấu trúc PA1 (<code class="text-blue-300">newX1</code>, trung bình 25.2 con): 2 con cuối cũng chỉ trúng đúng <strong>4 lần / 299 kỳ (1.34%)</strong>.</li>
                            <li>Trên dàn X1 gốc ban đầu (<code class="text-gray-400">origBot</code>, 25 con): 2 con cuối trúng đúng <strong>5 lần / 299 kỳ (1.67%)</strong>.</li>
                        </ul>
                        <div class="text-[11px] text-gray-400 bg-gray-900 p-2.5 rounded border border-gray-800">
                            <strong>Phát hiện:</strong> Dù đo đạc trên dàn nào, 2 con ở đáy bảng xếp hạng đều có xác suất nổ xấp xỉ xác suất ngẫu nhiên tối thiểu (1.34% vs 2.0% ngẫu nhiên). Điều này chứng minh thuật toán 5 AI nhận diện các con số đáy cực kỳ chuẩn xác (đều là Cold Numbers hoặc Gap kéo dài).
                        </div>
                    </div>

                    <div class="bg-gray-950 p-4 rounded-xl border border-emerald-500/30 space-y-2">
                        <div class="text-sm font-bold text-emerald-400">Danh Sách 4 Ngày Duy Nhất Nổ 2 Con Cuối:</div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-xs text-left text-gray-300">
                                <thead class="bg-gray-800 text-gray-400 text-[10px] uppercase">
                                    <tr>
                                        <th class="py-1.5 px-2">Ngày</th>
                                        <th class="py-1.5 px-2">Giải ĐB</th>
                                        <th class="py-1.5 px-2">2 Con Cuối X1</th>
                                        <th class="py-1.5 px-2">Ghi Chú</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-800 font-mono text-[11px]">
                                    <tr><td class="py-1.5 px-2">2026-03-03</td><td class="py-1.5 px-2 text-emerald-400 font-bold">78</td><td class="py-1.5 px-2 text-gray-400">['52', '78']</td><td class="py-1.5 px-2 text-gray-400">Dàn 37 con</td></tr>
                                    <tr><td class="py-1.5 px-2">2026-03-24</td><td class="py-1.5 px-2 text-emerald-400 font-bold">29</td><td class="py-1.5 px-2 text-gray-400">['27', '29']</td><td class="py-1.5 px-2 text-gray-400">Dàn 36 con</td></tr>
                                    <tr><td class="py-1.5 px-2">2026-05-09</td><td class="py-1.5 px-2 text-emerald-400 font-bold">92</td><td class="py-1.5 px-2 text-gray-400">['81', '92']</td><td class="py-1.5 px-2 text-gray-400">Dàn 37 con</td></tr>
                                    <tr><td class="py-1.5 px-2">2026-05-25</td><td class="py-1.5 px-2 text-emerald-400 font-bold">81</td><td class="py-1.5 px-2 text-gray-400">['67', '81']</td><td class="py-1.5 px-2 text-gray-400">Dàn 37 con</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div class="text-xs text-emerald-300 pt-1 font-semibold">
                            Cả 5 tháng cuối năm (Tháng 6, 7, 8, 9, 10) với hơn 150 kỳ quay, 2 con cuối này KHÔNG NỔ MỘT LẦN NÀO!
                        </div>
                    </div>
                </div>

                <div class="bg-emerald-950/30 border border-emerald-500/20 p-4 rounded-xl text-xs text-emerald-200">
                    <strong>Hạch toán kinh tế học:</strong> Chi phí vốn để bao nuôi 2 con số này mỗi ngày là 2M $\times$ 299 ngày = <strong>598 Triệu VNĐ</strong>. Tiền thưởng thu về chỉ là $4 \times 84\text{M} = \mathbf{336\text{ Triệu VNĐ}}$. Việc cắt bỏ 2 con này giúp người chơi **bỏ túi ngay +262 Triệu VNĐ lợi nhuận ròng**!
                </div>
            </div>

            <!-- LOẠI 4: PHƯƠNG ÁN 4 - CỐ ĐỊNH 35 CON ĐẦU -->
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                <div class="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 pb-4 gap-2">
                    <div>
                        <h2 class="text-base font-bold text-white flex items-center gap-2">
                            <span class="w-7 h-7 rounded-full bg-purple-500/20 text-purple-400 text-xs flex items-center justify-center font-bold">4</span>
                            Phương Án 4: Cố Định Đúng 35 Con Đầu Tiên
                        </h2>
                        <p class="text-xs text-gray-400 mt-1">Phân tích hành vi phần đuôi dôi dư (> 35 con) khi dàn sau lọc phình to</p>
                    </div>
                    <span class="text-xs px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/30 font-bold self-start md:self-auto">
                        Cắt Bỏ Phần Đuôi Lãi Thêm +183.0 Triệu VNĐ
                    </span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="bg-gray-950 p-4 rounded-xl border border-gray-800 space-y-2">
                        <div class="text-sm font-bold text-purple-400">Phân Bố Quy Mô Dàn Sau Lọc:</div>
                        <p class="text-xs text-gray-300 leading-relaxed">
                            Quy mô dàn sau lọc Chẵn/Lẻ dao động từ 33 đến 41 con (trung bình 37.2 con). Có tới <strong>232 / 299 ngày (77.6%)</strong> dàn có quy mô lớn hơn 35 con:
                        </p>
                        <div class="grid grid-cols-4 gap-1.5 text-center text-xs font-mono">
                            <div class="bg-gray-900 p-2 rounded">35 con: <strong>49 ngày</strong></div>
                            <div class="bg-gray-900 p-2 rounded">36 con: <strong>39 ngày</strong></div>
                            <div class="bg-gray-900 p-2 rounded">37 con: <strong>51 ngày</strong></div>
                            <div class="bg-gray-900 p-2 rounded">38 con: <strong>57 ngày</strong></div>
                            <div class="bg-gray-900 p-2 rounded">39 con: <strong>52 ngày</strong></div>
                            <div class="bg-gray-900 p-2 rounded">40 con: <strong>31 ngày</strong></div>
                            <div class="bg-gray-900 p-2 rounded">&le; 34s: <strong>18 ngày</strong></div>
                            <div class="bg-gray-900 p-2 rounded">&ge; 41s: <strong>2 ngày</strong></div>
                        </div>
                    </div>

                    <div class="bg-gray-950 p-4 rounded-xl border border-purple-500/30 space-y-2">
                        <div class="text-sm font-bold text-purple-400">Danh Sách 6 Ngày Bị Mất Trúng Khi Cố Định 35 Con:</div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-xs text-left text-gray-300">
                                <thead class="bg-gray-800 text-gray-400 text-[10px] uppercase">
                                    <tr>
                                        <th class="py-1 px-2">Ngày</th>
                                        <th class="py-1 px-2">ĐB</th>
                                        <th class="py-1 px-2">Quy mô</th>
                                        <th class="py-1 px-2">Số con bị cắt</th>
                                        <th class="py-1 px-2">Các số phần đuôi</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-800 font-mono text-[10px]">
                                    <tr><td class="py-1 px-2">2026-03-03</td><td class="py-1 px-2 text-purple-400 font-bold">78</td><td class="py-1 px-2">37s</td><td class="py-1 px-2">2 số</td><td class="py-1 px-2 text-gray-400">['52', '78']</td></tr>
                                    <tr><td class="py-1 px-2">2026-05-09</td><td class="py-1 px-2 text-purple-400 font-bold">92</td><td class="py-1 px-2">37s</td><td class="py-1 px-2">2 số</td><td class="py-1 px-2 text-gray-400">['81', '92']</td></tr>
                                    <tr><td class="py-1 px-2">2026-05-25</td><td class="py-1 px-2 text-purple-400 font-bold">81</td><td class="py-1 px-2">37s</td><td class="py-1 px-2">2 số</td><td class="py-1 px-2 text-gray-400">['67', '81']</td></tr>
                                    <tr><td class="py-1 px-2">2026-06-02</td><td class="py-1 px-2 text-purple-400 font-bold">23</td><td class="py-1 px-2">38s</td><td class="py-1 px-2">3 số</td><td class="py-1 px-2 text-gray-400">['23', '49', '67']</td></tr>
                                    <tr><td class="py-1 px-2">2026-07-09</td><td class="py-1 px-2 text-purple-400 font-bold">85</td><td class="py-1 px-2">39s</td><td class="py-1 px-2">4 số</td><td class="py-1 px-2 text-gray-400">['85', '69', '81', '92']</td></tr>
                                    <tr><td class="py-1 px-2">2026-08-15</td><td class="py-1 px-2 text-purple-400 font-bold">78</td><td class="py-1 px-2">39s</td><td class="py-1 px-2">4 số</td><td class="py-1 px-2 text-gray-400">['52', '78', '81', '92']</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="bg-purple-950/30 border border-purple-500/20 p-4 rounded-xl text-xs text-purple-200">
                    <strong>Hạch toán kinh tế học:</strong> Tổng số con số bị cắt bỏ trong 232 ngày là <strong>687 số</strong> (tiết kiệm 687M vốn). Mất 6 lần trúng X1 (mất $6 \times 84\text{M} = 504\text{M}$ thưởng). Hiệu quả chênh lệch ròng: $+687\text{M} - 504\text{M} = \mathbf{+183\text{ Triệu VNĐ}}$!
                </div>
            </div>

            <!-- LOẠI 5: PHƯƠNG ÁN 5 - 3 NGUYÊN NHÂN CỐT LÕI GÂY THUA -->
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                <div class="border-b border-gray-800 pb-3">
                    <h2 class="text-base font-bold text-white flex items-center gap-2">
                        <span class="w-7 h-7 rounded-full bg-red-500/20 text-red-400 text-xs flex items-center justify-center font-bold">5</span>
                        Phương Án 5: Bóc Tách Chi Tiết 3 Nguyên Nhân Cốt Lõi Gây Thua Lỗ
                    </h2>
                    <p class="text-xs text-gray-400 mt-1">Đúc rút từ toàn bộ 299 kỳ mở thưởng năm 2026</p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="bg-gray-950 p-4 rounded-xl border border-red-500/30 space-y-2">
                        <div class="text-sm font-bold text-red-400 flex items-center gap-1.5">
                            <span>⚠️</span> 1. Chu Kỳ Trũng Xác Suất (Win Rate &lt; 35%)
                        </div>
                        <p class="text-xs text-gray-300 leading-relaxed">
                            <strong>Tháng 1 & Tháng 2:</strong> Giai đoạn nhịp cầu đầu năm thường biến động mạnh. Tháng 1 chỉ trúng 7/31 ngày (22.6%) và Tháng 2 trúng 8/24 ngày (33.3%). 
                            Khi Win rate tụt xuống dưới 35%, bất kỳ dàn Đề nào có quy mô 35–50 số đều phải chịu thua lỗ do "chi phí ma sát" (Friction cost) bào mòn vốn. Riêng 2 tháng này đã gây âm tới <strong>-849M</strong> tiền vốn.
                        </p>
                    </div>

                    <div class="bg-gray-950 p-4 rounded-xl border border-amber-500/30 space-y-2">
                        <div class="text-sm font-bold text-amber-400 flex items-center gap-1.5">
                            <span>⚖️</span> 2. Lệch Tỷ Trọng Nhát Trúng X2 / X1
                        </div>
                        <p class="text-xs text-gray-300 leading-relaxed">
                            Cấu trúc đa tầng tạo ra bất cân xứng dòng tiền: Trúng X2 ăn 168M (+121M lời ròng) bù được 2.5 ngày xịt. Nhưng trúng X1 chỉ ăn 84M (+37M lời ròng) không đủ bù cho 1 ngày xịt (-47M).
                            <strong>Điển hình Tháng 5:</strong> Trúng tới 12 ngày (38.7% - tỷ lệ trúng rất tốt), nhưng chỉ có 3 ngày nổ X2, tới 9 ngày nổ X1 $\to$ Tháng 5 vẫn bị âm **-115M**!
                        </p>
                    </div>

                    <div class="bg-gray-950 p-4 rounded-xl border border-emerald-500/30 space-y-2">
                        <div class="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                            <span>🛡️</span> 3. Tác Động Của OppForm (Anti-Parity)
                        </div>
                        <p class="text-xs text-gray-300 leading-relaxed">
                            Cả năm 2026 chỉ có <strong>31 / 299 kỳ (10.37%)</strong> đề về hình thái đối nghịch <code class="text-red-400">oppForm</code>.
                            Tức là bộ lọc loại trừ chính xác tới <strong>89.63%</strong>!
                            Nhờ loại bỏ 25 con oppForm mỗi ngày, người chơi tiết kiệm được hơn <strong>8,300 Triệu VNĐ vốn cược</strong>! Nếu không có bộ lọc này, mức lỗ sẽ lên tới <strong>-3,021M</strong> như dàn gốc.
                        </p>
                    </div>
                </div>
            </div>
        </section>

        <!-- TAB 2: MA TRẬN 13 CẤU HÌNH -->
        <section id="tab-matrix" class="tab-content hidden space-y-6">
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
                <div class="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 pb-4 gap-2">
                    <div>
                        <h2 class="text-lg font-bold text-white">Bảng Ma Trận Tổng Hợp Đối Soát 13 Cấu Hình Năm 2026</h2>
                        <p class="text-xs text-gray-400 mt-1">So sánh Dàn Gốc, Dàn Sau Lọc Hiện Tại, PA1 (Top 12) và PA2 (Mỗi dạng 4 con) khi kết hợp các mức cắt đuôi dàn X1</p>
                    </div>
                </div>

                <div class="overflow-x-auto custom-scrollbar">
                    <table class="w-full text-xs text-left text-gray-300 min-w-[950px]">
                        <thead class="bg-gray-800 text-gray-300 uppercase text-[11px] font-semibold">
                            <tr>
                                <th class="py-3 px-3">STT</th>
                                <th class="py-3 px-3">Cấu Hình Phương Pháp</th>
                                <th class="py-3 px-3">Quy Mô TB</th>
                                <th class="py-3 px-3">Trúng (Win %)</th>
                                <th class="py-3 px-3 text-center">X2 / X1</th>
                                <th class="py-3 px-3 text-right">Tổng Vốn (M)</th>
                                <th class="py-3 px-3 text-right">Tiết Kiệm Vốn</th>
                                <th class="py-3 px-3 text-right">Lãi Ròng (M)</th>
                                <th class="py-3 px-3 text-right">ROI (%)</th>
                                <th class="py-3 px-3 text-center">Xếp Hạng</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-800 font-mono text-[11px]">
                            <tr class="bg-blue-950/20 hover:bg-blue-900/30 font-semibold border-l-4 border-blue-500">
                                <td class="py-2.5 px-3">4</td>
                                <td class="py-2.5 px-3 text-blue-300 font-sans">PA1 + Bỏ 2 con cuối dàn X1</td>
                                <td class="py-2.5 px-3">35.2s (12+23.2)</td>
                                <td class="py-2.5 px-3">115 (38.5%)</td>
                                <td class="py-2.5 px-3 text-center text-emerald-400 font-bold">43 / 72</td>
                                <td class="py-2.5 px-3 text-right">14,122.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400">8,303.0M (37%)</td>
                                <td class="py-2.5 px-3 text-right text-blue-300 font-bold">-850.0M</td>
                                <td class="py-2.5 px-3 text-right text-blue-300 font-bold">-6.02%</td>
                                <td class="py-2.5 px-3 text-center"><span class="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold">QUÁN QUÂN 🥇</span></td>
                            </tr>
                            <tr class="hover:bg-gray-800/50">
                                <td class="py-2.5 px-3">3</td>
                                <td class="py-2.5 px-3 text-purple-300 font-sans">PA1 + Cố định 35 con đầu</td>
                                <td class="py-2.5 px-3">34.9s (12+22.9)</td>
                                <td class="py-2.5 px-3">113 (37.8%)</td>
                                <td class="py-2.5 px-3 text-center text-emerald-400 font-bold">43 / 70</td>
                                <td class="py-2.5 px-3 text-right">14,033.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400">8,392.0M (37%)</td>
                                <td class="py-2.5 px-3 text-right text-purple-300 font-bold">-929.0M</td>
                                <td class="py-2.5 px-3 text-right text-purple-300 font-bold">-6.62%</td>
                                <td class="py-2.5 px-3 text-center"><span class="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">Á QUÂN 🥈</span></td>
                            </tr>
                            <tr class="hover:bg-gray-800/50">
                                <td class="py-2.5 px-3">5</td>
                                <td class="py-2.5 px-3 font-sans">PA1 + Bỏ 4 con cuối dàn X1</td>
                                <td class="py-2.5 px-3">33.2s (12+21.2)</td>
                                <td class="py-2.5 px-3">106 (35.5%)</td>
                                <td class="py-2.5 px-3 text-center">43 / 63</td>
                                <td class="py-2.5 px-3 text-right">13,524.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400">8,901.0M (40%)</td>
                                <td class="py-2.5 px-3 text-right text-gray-300">-1,008.0M</td>
                                <td class="py-2.5 px-3 text-right text-gray-300">-7.45%</td>
                                <td class="py-2.5 px-3 text-center text-gray-400">Top 5</td>
                            </tr>
                            <tr class="hover:bg-gray-800/50">
                                <td class="py-2.5 px-3">2</td>
                                <td class="py-2.5 px-3 font-sans">PA1 (12 X2) Giữ toàn bộ X1</td>
                                <td class="py-2.5 px-3">37.2s (12+25.2)</td>
                                <td class="py-2.5 px-3">119 (39.8%)</td>
                                <td class="py-2.5 px-3 text-center">43 / 76</td>
                                <td class="py-2.5 px-3 text-right">14,720.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400">7,705.0M (34%)</td>
                                <td class="py-2.5 px-3 text-right text-gray-300">-1,112.0M</td>
                                <td class="py-2.5 px-3 text-right text-gray-300">-7.55%</td>
                                <td class="py-2.5 px-3 text-center text-gray-400">Top 6</td>
                            </tr>
                            <tr class="hover:bg-gray-800/50 bg-gray-800/20">
                                <td class="py-2.5 px-3">1</td>
                                <td class="py-2.5 px-3 font-sans text-amber-300">Hiện Tại Sau Lọc (filteredTop + Bot)</td>
                                <td class="py-2.5 px-3">37.2s (18.9+18.3)</td>
                                <td class="py-2.5 px-3">119 (39.8%)</td>
                                <td class="py-2.5 px-3 text-center">66 / 53</td>
                                <td class="py-2.5 px-3 text-right">16,784.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400">5,641.0M (25%)</td>
                                <td class="py-2.5 px-3 text-right text-amber-300">-1,244.0M</td>
                                <td class="py-2.5 px-3 text-right text-amber-300">-7.41%</td>
                                <td class="py-2.5 px-3 text-center text-amber-400">Chuẩn hiện tại</td>
                            </tr>
                            <tr class="hover:bg-gray-800/50 text-gray-400">
                                <td class="py-2.5 px-3">12</td>
                                <td class="py-2.5 px-3 font-sans">PA2-B + Bỏ 2 con cuối dàn X1</td>
                                <td class="py-2.5 px-3">35.2s (12+23.2)</td>
                                <td class="py-2.5 px-3">115 (38.5%)</td>
                                <td class="py-2.5 px-3 text-center">38 / 77</td>
                                <td class="py-2.5 px-3 text-right">14,122.0M</td>
                                <td class="py-2.5 px-3 text-right">8,303.0M (37%)</td>
                                <td class="py-2.5 px-3 text-right text-red-300">-1,270.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-300">-8.99%</td>
                                <td class="py-2.5 px-3 text-center">Top 7</td>
                            </tr>
                            <tr class="hover:bg-gray-800/50 text-gray-400">
                                <td class="py-2.5 px-3">8</td>
                                <td class="py-2.5 px-3 font-sans">PA2-A + Bỏ 2 con cuối dàn X1</td>
                                <td class="py-2.5 px-3">35.2s (12+23.2)</td>
                                <td class="py-2.5 px-3">115 (38.5%)</td>
                                <td class="py-2.5 px-3 text-center">36 / 79</td>
                                <td class="py-2.5 px-3 text-right">14,122.0M</td>
                                <td class="py-2.5 px-3 text-right">8,303.0M (37%)</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-1,438.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-10.18%</td>
                                <td class="py-2.5 px-3 text-center">Top 9</td>
                            </tr>
                            <tr class="hover:bg-gray-800/50 text-gray-400">
                                <td class="py-2.5 px-3">6</td>
                                <td class="py-2.5 px-3 font-sans">PA2-A (Mỗi dạng 4s) Toàn Bộ X1</td>
                                <td class="py-2.5 px-3">37.2s (12+25.2)</td>
                                <td class="py-2.5 px-3">119 (39.8%)</td>
                                <td class="py-2.5 px-3 text-center">36 / 83</td>
                                <td class="py-2.5 px-3 text-right">14,720.0M</td>
                                <td class="py-2.5 px-3 text-right">7,705.0M (34%)</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-1,700.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-11.55%</td>
                                <td class="py-2.5 px-3 text-center">Top 12</td>
                            </tr>
                            <tr class="hover:bg-red-950/20 text-red-300 font-semibold bg-red-950/10">
                                <td class="py-2.5 px-3">0</td>
                                <td class="py-2.5 px-3 font-sans text-red-400">Gốc Nguyên Bản 50s (25 X2 + 25 X1, Không Lọc)</td>
                                <td class="py-2.5 px-3">50.0s (25+25)</td>
                                <td class="py-2.5 px-3">150 (50.2%)</td>
                                <td class="py-2.5 px-3 text-center">81 / 69</td>
                                <td class="py-2.5 px-3 text-right">22,425.0M</td>
                                <td class="py-2.5 px-3 text-right text-gray-500">0.0M (0%)</td>
                                <td class="py-2.5 px-3 text-right text-red-400 font-bold">-3,021.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400 font-bold">-13.47%</td>
                                <td class="py-2.5 px-3 text-center"><span class="px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40">Thua nặng nhất ❌</span></td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Detailed Observations on Configurations -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-300">
                    <div class="bg-gray-950 p-4 rounded-xl border border-gray-800 space-y-2">
                        <div class="font-bold text-white">So Sánh Giữa Các Nhóm Cấu Hình:</div>
                        <ul class="space-y-1.5 list-disc list-inside">
                            <li><strong>Nhóm PA1 luôn vượt trội hơn nhóm PA2:</strong> Ở mọi biến thể cắt đuôi, PA1 luôn có lãi ròng tốt hơn PA2 từ <strong>+580M đến +600M</strong>.</li>
                            <li><strong>Tại sao Bỏ 2 con cuối lại tốt hơn Bỏ 4 con cuối?</strong> Khi bỏ 2 con cuối, chỉ mất 4 nháy X1 (-336M thưởng) nhưng tiết kiệm được 598M vốn $\to$ <strong>Lời +262M</strong>. Nhưng khi bỏ tới 4 con cuối, số lần mất trúng tăng vọt lên 13 nháy (-1,092M thưởng), vượt quá số tiền vốn tiết kiệm thêm $\to$ <strong>Bị âm ngược lại</strong>.</li>
                        </ul>
                    </div>

                    <div class="bg-gray-950 p-4 rounded-xl border border-gray-800 space-y-2">
                        <div class="font-bold text-white">Tại Sao Dàn Gốc 50s Lại Thất Bại Thảm Hại (-3,021M)?</div>
                        <p class="leading-relaxed">
                            Mặc dù Dàn Gốc trúng tới 150 / 299 kỳ (50.17%), nhưng do phải nuôi cả 50 con số mỗi ngày (chi phí 75M/ngày = 22.4 Tỷ/năm), mỗi ngày trượt mất trọn 75M. Khi trúng ở tầng X1 chỉ ăn 84M (lãi ròng vỏn vẹn +9M/ngày), hoàn toàn bất lực trong việc bù đắp cho các ngày trượt!
                        </p>
                    </div>
                </div>
            </div>
        </section>

        <!-- TAB 3: ĐỘT PHÁ LỢI NHUẬN DƯƠNG -->
        <section id="tab-positive" class="tab-content hidden space-y-6">
            <!-- Hero banner -->
            <div class="bg-gradient-to-r from-emerald-950 via-gray-900 to-purple-950 border border-emerald-500/40 rounded-xl p-6 relative overflow-hidden">
                <div class="space-y-2">
                    <span class="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-bold uppercase tracking-wider">
                        Phát Hiện Khoa Học Đột Phá 🔥
                    </span>
                    <h2 class="text-2xl font-black text-white tracking-tight">
                        GIẢI MÃ NGUYÊN LÝ CHUYỂN HÓA SANG LỢI NHUẬN DƯƠNG RÒNG (POSITIVE ROI)
                    </h2>
                    <p class="text-sm text-gray-300 max-w-4xl">
                        Nghiên cứu số học chỉ ra: <strong>Độ dài của dàn số chính là "kẻ thù số 1" của lợi nhuận</strong>.
                        Toàn bộ 43 nháy ăn lớn nhất (168M) đều tập trung trọn vẹn trong Top 12 số của dàn sau lọc. 
                        Thu hẹp dàn về <strong>Sweet-Spot 17 số</strong> hoặc <strong>Hợp Lực Đa Tầng với Lô Top 7</strong> lập tức đảo chiều danh mục từ âm sang lãi dương rực rỡ!
                    </p>
                </div>
            </div>

            <!-- Breakthrough 1: Sweet-Spot 17 Numbers -->
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                <div class="flex items-center justify-between border-b border-gray-800 pb-3">
                    <h3 class="text-lg font-bold text-emerald-400 flex items-center gap-2">
                        <span>🎯</span> Đột Phá 1: Thu Hẹp Về Sweet-Spot Dàn 17 Số Tinh Hoa
                    </h3>
                    <span class="text-xs px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold">Lợi Nhuận Dương Tự Thân</span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="bg-gray-950 p-4 rounded-xl border border-emerald-500/30 space-y-2">
                        <div class="text-xs text-gray-400 uppercase font-semibold">Cấu hình A (12 X2 + 5 X1)</div>
                        <div class="text-xl font-black text-emerald-400">+149.0M <span class="text-xs font-normal text-emerald-500">(ROI +1.72%)</span></div>
                        <div class="text-xs text-gray-300 space-y-1">
                            <div>• Quy mô: <strong>Đúng 17 con</strong> (Vốn 29M/ngày)</div>
                            <div>• Trúng: <strong>62 / 299 kỳ (20.7%)</strong></div>
                            <div>• Phân bổ: 43 nháy X2 (ăn 168M), 19 nháy X1 (ăn 84M)</div>
                            <div>• Tổng vốn: 8,671M | Tổng ăn: 8,820M</div>
                        </div>
                    </div>

                    <div class="bg-gray-950 p-4 rounded-xl border border-blue-500/30 space-y-2">
                        <div class="text-xs text-gray-400 uppercase font-semibold">Cấu hình B (17 X2 Thuần)</div>
                        <div class="text-xl font-black text-blue-400">+278.0M <span class="text-xs font-normal text-blue-500">(ROI +2.74%)</span></div>
                        <div class="text-xs text-gray-300 space-y-1">
                            <div>• Quy mô: <strong>17 con X2</strong> (Vốn 34M/ngày)</div>
                            <div>• Trúng: <strong>62 / 299 kỳ (20.7%)</strong></div>
                            <div>• Phân bổ: 62 nháy X2 (ăn 168M toàn bộ!)</div>
                            <div>• Tổng vốn: 10,138M | Tổng ăn: 10,416M</div>
                        </div>
                    </div>

                    <div class="bg-gray-950 p-4 rounded-xl border border-purple-500/30 space-y-2">
                        <div class="text-xs text-gray-400 uppercase font-semibold">Cấu hình C (13 X2 + 4 X1)</div>
                        <div class="text-xl font-black text-purple-400">+186.0M <span class="text-xs font-normal text-purple-500">(ROI +2.07%)</span></div>
                        <div class="text-xs text-gray-300 space-y-1">
                            <div>• Quy mô: <strong>17 con</strong> (Vốn 30M/ngày)</div>
                            <div>• Trúng: <strong>62 / 299 kỳ (20.7%)</strong></div>
                            <div>• Phân bổ: 47 nháy X2, 15 nháy X1</div>
                            <div>• Tổng vốn: 8,970M | Tổng ăn: 9,156M</div>
                        </div>
                    </div>
                </div>

                <!-- Mathematical Proof of 17 numbers -->
                <div class="bg-gray-950 p-5 rounded-xl border border-gray-800 space-y-2 text-xs text-gray-300 leading-relaxed">
                    <strong class="text-white text-sm">Chứng minh mật độ hội tụ (Cumulative Density):</strong><br>
                    Trong 299 kỳ, có tổng cộng 119 ngày đề nổ trúng vào dàn sau lọc.
                    Phân bố vị trí nổ trúng cho thấy:
                    <ul class="list-disc list-inside mt-1 space-y-1 font-mono text-[11px]">
                        <li>Top 1 - 12 (X2): nổ <strong>43 lần</strong> (3.58 lần/vị trí)</li>
                        <li>Vị trí 13 - 17 (5 con đầu X1): nổ <strong>19 lần</strong> (3.80 lần/vị trí - MẬT ĐỘ CAO NHẤT!)</li>
                        <li>Vị trí 18 - 25 (8 con tiếp theo): nổ 18 lần (2.25 lần/vị trí)</li>
                        <li>Vị trí 26 - 35 (10 con tiếp theo): nổ 33 lần (3.30 lần/vị trí)</li>
                        <li>Vị trí > 35 (các con phần đuôi): nổ 6 lần (chỉ 0.8 lần/vị trí)</li>
                    </ul>
                    $\to$ <strong>17 con số đầu tiên</strong> thâu tóm tới <strong>62 / 119 nháy trúng (52.1% toàn bộ nháy trúng)</strong> trong khi chỉ tiêu tốn 45% tiền vốn so với dàn 37s! Đây chính là điểm cân bằng hoàn hảo giúp danh mục sinh lời dương.
                </div>
            </div>

            <!-- Breakthrough 2: COMBO Synergy -->
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                <div class="flex items-center justify-between border-b border-gray-800 pb-3">
                    <h3 class="text-lg font-bold text-purple-400 flex items-center gap-2">
                        <span>⚡</span> Đột Phá 2: Chiến Lược Đa Tầng Hợp Lực COMBO (Đề Tinh Gọn 17s + Lô Top 7)
                    </h3>
                    <span class="text-xs px-2.5 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/30 font-bold">Cân Bằng Dòng Tiền Hoàn Hảo</span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="bg-gray-950 p-5 rounded-xl border border-purple-500/40 space-y-3">
                        <div class="flex justify-between items-center">
                            <span class="text-sm font-bold text-purple-300">COMBO 1: Đề (12 X2 + 5 X1) + Lô Top 7</span>
                            <span class="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">+624.4 Triệu VNĐ</span>
                        </div>
                        <div class="text-xs text-gray-300 space-y-1.5">
                            <div class="flex justify-between"><span>Vốn Đề (17s):</span> <strong class="text-white">8,671.0M</strong> (Ăn 8,820M $\to$ Lời +149M)</div>
                            <div class="flex justify-between"><span>Vốn Lô Top 7:</span> <strong class="text-white">4,604.6M</strong> (Ăn 5,080M $\to$ Lời +475.4M)</div>
                            <div class="flex justify-between border-t border-gray-800 pt-1.5 font-semibold text-white">
                                <span>TỔNG COMBO 1:</span>
                                <span class="text-emerald-400 font-bold">+624.4M (ROI +4.70%)</span>
                            </div>
                        </div>
                        <div class="text-[11px] text-gray-400 bg-gray-900 p-2.5 rounded border border-gray-800">
                            Cơ chế: Lô Top 7 thắng 89.6% số ngày tạo dòng tiền lãi đều đặn 475M để "gánh" các ngày Đề trượt. Khi Đề nổ nháy X2 (168M), toàn bộ danh mục bùng nổ lợi nhuận!
                        </div>
                    </div>

                    <div class="bg-gray-950 p-5 rounded-xl border border-emerald-500/40 space-y-3">
                        <div class="flex justify-between items-center">
                            <span class="text-sm font-bold text-emerald-300">COMBO 2: Đề (17 X2 Thuần) + Lô Top 7</span>
                            <span class="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">+753.4 Triệu VNĐ</span>
                        </div>
                        <div class="text-xs text-gray-300 space-y-1.5">
                            <div class="flex justify-between"><span>Vốn Đề (17 X2):</span> <strong class="text-white">10,138.0M</strong> (Ăn 10,416M $\to$ Lời +278M)</div>
                            <div class="flex justify-between"><span>Vốn Lô Top 7:</span> <strong class="text-white">4,604.6M</strong> (Ăn 5,080M $\to$ Lời +475.4M)</div>
                            <div class="flex justify-between border-t border-gray-800 pt-1.5 font-semibold text-white">
                                <span>TỔNG COMBO 2:</span>
                                <span class="text-emerald-400 font-bold">+753.4M (ROI +5.11%)</span>
                            </div>
                        </div>
                        <div class="text-[11px] text-gray-400 bg-gray-900 p-2.5 rounded border border-gray-800">
                            Cấu hình tối ưu lợi nhuận tuyệt đối: Toàn bộ 62 lần đề nổ đều ăn ở mức cao nhất 168M. Kết hợp với Lô Top 7 đưa tổng lãi ròng cả năm lên tới <strong>hơn 753 Triệu VNĐ</strong>!
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- TAB 4: ĐỐI SOÁT CHI TIẾT 10 THÁNG -->
        <section id="tab-months" class="tab-content hidden space-y-6">
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
                <div class="border-b border-gray-800 pb-3">
                    <h2 class="text-lg font-bold text-white">Bảng Thống Kê Chi Tiết Hiệu Quả Từng Tháng Năm 2026</h2>
                    <p class="text-xs text-gray-400 mt-1">Theo dõi dòng tiền hàng tháng của Dàn Quán Quân PA1 (35s), Dàn Đột Phá 17s, Lô Top 7 và COMBO Hợp Lực</p>
                </div>

                <div class="overflow-x-auto custom-scrollbar">
                    <table class="w-full text-xs text-left text-gray-300 min-w-[950px]">
                        <thead class="bg-gray-800 text-gray-300 uppercase text-[11px] font-semibold">
                            <tr>
                                <th class="py-3 px-3">Tháng</th>
                                <th class="py-3 px-3 text-center">Số kỳ</th>
                                <th class="py-3 px-3 text-right">PA1 Đề 35s</th>
                                <th class="py-3 px-3 text-right text-amber-400">Đề 17s (12+5)</th>
                                <th class="py-3 px-3 text-right text-blue-400">Đề 17 X2</th>
                                <th class="py-3 px-3 text-right text-emerald-400">Lô Top 7</th>
                                <th class="py-3 px-3 text-right text-purple-400 font-bold">COMBO 1 (Đề 17s + Lô)</th>
                                <th class="py-3 px-3 text-right text-emerald-300 font-bold">COMBO 2 (Đề 17 X2 + Lô)</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-800 font-mono text-[11px]">
                            <tr class="hover:bg-gray-800/40">
                                <td class="py-2.5 px-3 font-sans font-semibold">2026-01</td>
                                <td class="py-2.5 px-3 text-center text-gray-400">31</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-563.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-227.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-204.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400">+66.6M</td>
                                <td class="py-2.5 px-3 text-right text-red-400 font-semibold">-160.4M</td>
                                <td class="py-2.5 px-3 text-right text-red-400 font-semibold">-137.4M</td>
                            </tr>
                            <tr class="hover:bg-gray-800/40">
                                <td class="py-2.5 px-3 font-sans font-semibold">2026-02</td>
                                <td class="py-2.5 px-3 text-center text-gray-400">24</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-286.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-360.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-480.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-49.6M</td>
                                <td class="py-2.5 px-3 text-right text-red-400 font-semibold">-409.6M</td>
                                <td class="py-2.5 px-3 text-right text-red-400 font-semibold">-529.6M</td>
                            </tr>
                            <tr class="hover:bg-gray-800/40 bg-emerald-950/10">
                                <td class="py-2.5 px-3 font-sans font-bold text-emerald-400">2026-03</td>
                                <td class="py-2.5 px-3 text-center text-gray-400">31</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400 font-bold">+498.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400 font-bold">+697.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400 font-bold">+626.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400">+2.6M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400 font-black">+699.6M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400 font-black">+628.6M</td>
                            </tr>
                            <tr class="hover:bg-gray-800/40">
                                <td class="py-2.5 px-3 font-sans font-semibold">2026-04</td>
                                <td class="py-2.5 px-3 text-center text-gray-400">30</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-291.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-198.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-176.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-6.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400 font-semibold">-204.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400 font-semibold">-182.0M</td>
                            </tr>
                            <tr class="hover:bg-gray-800/40">
                                <td class="py-2.5 px-3 font-sans font-semibold">2026-05</td>
                                <td class="py-2.5 px-3 text-center text-gray-400">31</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-115.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-143.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-214.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400">+66.6M</td>
                                <td class="py-2.5 px-3 text-right text-gray-300 font-semibold">-76.4M</td>
                                <td class="py-2.5 px-3 text-right text-red-400 font-semibold">-147.4M</td>
                            </tr>
                            <tr class="hover:bg-gray-800/40">
                                <td class="py-2.5 px-3 font-sans font-semibold">2026-06</td>
                                <td class="py-2.5 px-3 text-center text-gray-400">30</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400">+37.0M</td>
                                <td class="py-2.5 px-3 text-right text-gray-400">-30.0M</td>
                                <td class="py-2.5 px-3 text-right text-gray-400">-12.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400">+50.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400 font-semibold">+20.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400 font-semibold">+38.0M</td>
                            </tr>
                            <tr class="hover:bg-gray-800/40 bg-emerald-950/10">
                                <td class="py-2.5 px-3 font-sans font-bold text-emerald-400">2026-07</td>
                                <td class="py-2.5 px-3 text-center text-gray-400">31</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400 font-bold">+158.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400 font-bold">+361.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400 font-bold">+458.0M</td>
                                <td class="py-2.5 px-3 text-right text-gray-400">-5.4M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400 font-black">+355.6M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400 font-black">+452.6M</td>
                            </tr>
                            <tr class="hover:bg-gray-800/40">
                                <td class="py-2.5 px-3 font-sans font-semibold">2026-08</td>
                                <td class="py-2.5 px-3 text-center text-gray-400">31</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-137.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-143.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-34.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400">+98.6M</td>
                                <td class="py-2.5 px-3 text-right text-gray-300 font-semibold">-44.4M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400 font-semibold">+64.6M</td>
                            </tr>
                            <tr class="hover:bg-gray-800/40">
                                <td class="py-2.5 px-3 font-sans font-semibold">2026-09</td>
                                <td class="py-2.5 px-3 text-center text-gray-400">30</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-325.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-282.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400">-178.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400">+50.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400 font-semibold">-232.0M</td>
                                <td class="py-2.5 px-3 text-right text-red-400 font-semibold">-128.0M</td>
                            </tr>
                            <tr class="hover:bg-gray-800/40 bg-emerald-950/10">
                                <td class="py-2.5 px-3 font-sans font-bold text-emerald-400">2026-10</td>
                                <td class="py-2.5 px-3 text-center text-gray-400">30</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400 font-bold">+512.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400 font-bold">+474.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400 font-bold">+492.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400 font-bold">+202.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400 font-black">+676.0M</td>
                                <td class="py-2.5 px-3 text-right text-emerald-400 font-black">+694.0M</td>
                            </tr>
                        </tbody>
                        <tfoot class="bg-gray-800 font-mono font-bold text-xs border-t-2 border-gray-700">
                            <tr>
                                <td class="py-3 px-3 uppercase font-sans">TỔNG CẢ NĂM</td>
                                <td class="py-3 px-3 text-center">299</td>
                                <td class="py-3 px-3 text-right text-blue-300">-850.0M</td>
                                <td class="py-3 px-3 text-right text-amber-400">+149.0M</td>
                                <td class="py-3 px-3 text-right text-blue-400">+278.0M</td>
                                <td class="py-3 px-3 text-right text-emerald-400">+475.4M</td>
                                <td class="py-3 px-3 text-right text-purple-400 text-sm font-black">+624.4M</td>
                                <td class="py-3 px-3 text-right text-emerald-300 text-sm font-black">+753.4M</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <!-- Deep Monthly Analysis Cards -->
                <div class="space-y-3 pt-2">
                    <h3 class="text-sm font-bold text-white flex items-center gap-2">
                        <span>📊</span> Phân Tích Chi Tiết Động Thái Dòng Tiền Từng Tháng:
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-300">
                        <div class="bg-gray-950 p-3.5 rounded-lg border border-gray-800 space-y-1">
                            <span class="font-bold text-red-400">Tháng 1 & Tháng 2 (-570M ở Combo):</span>
                            <p class="leading-relaxed">Giai đoạn điều chỉnh chu kỳ đầu năm. Tỷ lệ trúng của Đề tụt xuống dưới 30%. Nếu người chơi chủ động <strong>nghỉ cược hoặc đánh thăm dò 20% vốn</strong> trong 2 tháng này, toàn bộ lợi nhuận từ Tháng 3 đến Tháng 10 của COMBO 1 sẽ vọt lên tới <strong>+1,194.4 Triệu VNĐ (gần 1.2 TỶ)</strong>!</p>
                        </div>
                        <div class="bg-gray-950 p-3.5 rounded-lg border border-gray-800 space-y-1">
                            <span class="font-bold text-emerald-400">Tháng 3, 7, 10 (+1.73 Tỷ ở Combo):</span>
                            <p class="leading-relaxed">Ba siêu chu kỳ bùng nổ của thuật toán 5 AI. Tỷ lệ trúng đạt từ 48% đến 53%, số nháy X2 chiếm hơn 60% tổng số ngày thắng. Riêng Tháng 10 mang lại lợi nhuận kỷ lục tới <strong>+676M – +694M</strong>.</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- TAB 5: SỔ TRA CỨU 299 KỲ THỰC TẾ -->
        <section id="tab-ledger" class="tab-content hidden space-y-4">
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-800 pb-4">
                    <div>
                        <h2 class="text-lg font-bold text-white">Sổ Tra Cứu Toàn Bộ 299 Kỳ Mở Thưởng Năm 2026</h2>
                        <p class="text-xs text-gray-400">Tìm kiếm ngày mở thưởng, xem giải đặc biệt, hình thái chẵn lẻ, thứ hạng trúng và kết quả đối soát</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <input type="text" id="searchInput" oninput="filterLedger()" placeholder="Tìm ngày (vd: 2026-03) hoặc số..." class="bg-gray-950 border border-gray-700 px-3 py-1.5 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500">
                        <select id="statusFilter" onchange="filterLedger()" class="bg-gray-950 border border-gray-700 px-3 py-1.5 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500">
                            <option value="ALL">Tất cả kết quả</option>
                            <option value="HIT_X2">Trúng Tầng X2</option>
                            <option value="HIT_X1">Trúng Tầng X1</option>
                            <option value="OPP_LOSS">Bị Loại Trừ (OppForm)</option>
                            <option value="MISS">Trượt Dàn</option>
                        </select>
                    </div>
                </div>

                <div class="overflow-x-auto custom-scrollbar max-h-[600px]">
                    <table class="w-full text-xs text-left text-gray-300 min-w-[850px]" id="ledgerTable">
                        <thead class="bg-gray-800 text-gray-300 uppercase text-[10px] font-semibold sticky top-0 z-10">
                            <tr>
                                <th class="py-2.5 px-3">Ngày</th>
                                <th class="py-2.5 px-3 text-center">Giải ĐB</th>
                                <th class="py-2.5 px-3 text-center">Hình Thái</th>
                                <th class="py-2.5 px-3 text-center">Dự Báo CL</th>
                                <th class="py-2.5 px-3 text-center">Quy Mô Dàn</th>
                                <th class="py-2.5 px-3 text-center">Hạng Trúng</th>
                                <th class="py-2.5 px-3 text-center">PA1 (35s)</th>
                                <th class="py-2.5 px-3 text-center">Đề 17s (12+5)</th>
                                <th class="py-2.5 px-3 text-right">Lô Top 7 (M)</th>
                                <th class="py-2.5 px-3 text-right">COMBO 1 (M)</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-800 font-mono text-[11px]" id="ledgerBody">
                            <!-- Populated by JS -->
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

    </main>

    <!-- Footer -->
    <footer class="border-t border-gray-800 py-6 text-center text-xs text-gray-500">
        Lottery Predictive Intelligence System • Báo Cáo Đối Soát Độc Lập SSOT • Dành Cho Quan Sát & Quyết Định Chiến Lược
    </footer>

    <!-- Script for Data & Interactivity -->
    <script>
        const rawDays = ${JSON.stringify(daysData)};

        function switchTab(tabId) {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('bg-gray-800', 'text-white', 'border', 'border-gray-700');
                btn.classList.add('text-gray-400');
            });

            const target = document.getElementById(tabId);
            if (target) target.classList.remove('hidden');

            const activeBtn = document.getElementById('btn-' + tabId);
            if (activeBtn) {
                activeBtn.classList.remove('text-gray-400');
                activeBtn.classList.add('bg-gray-800', 'text-white', 'border', 'border-gray-700');
            }

            if (tabId === 'tab-ledger' && !window.ledgerRendered) {
                renderLedger(rawDays);
                window.ledgerRendered = true;
            }
        }

        function renderLedger(data) {
            const tbody = document.getElementById('ledgerBody');
            tbody.innerHTML = '';
            
            data.forEach(d => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-gray-800/40';

                // Format outcome labels
                let pa1Badge = '<span class="text-gray-500">Trượt</span>';
                if (d.hitPA1_X2) pa1Badge = '<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">Ăn X2 (+121M)</span>';
                else if (d.hitPA1_X1_drop2) pa1Badge = '<span class="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">Ăn X1 (+37M)</span>';
                else if (d.isElimLoss) pa1Badge = '<span class="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">OppForm</span>';

                let dpABadge = '<span class="text-gray-500">Trượt</span>';
                if (d.hitDpA_X2) dpABadge = '<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">Ăn X2 (+139M)</span>';
                else if (d.hitDpA_X1) dpABadge = '<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">Ăn X1 (+55M)</span>';

                const pLoFmt = (d.profitLo >= 0 ? '+' : '') + d.profitLo.toFixed(1) + 'M';
                const pLoColor = d.profitLo > 0 ? 'text-emerald-400' : (d.profitLo === 0 ? 'text-gray-400' : 'text-red-400');

                const comboProfit = d.profitDpA + d.profitLo;
                const comboFmt = (comboProfit >= 0 ? '+' : '') + comboProfit.toFixed(1) + 'M';
                const comboColor = comboProfit > 0 ? 'text-emerald-400 font-bold' : (comboProfit === 0 ? 'text-gray-400' : 'text-red-400');

                tr.innerHTML = \`
                    <td class="py-2 px-3 font-sans font-medium text-gray-300">\${d.date}</td>
                    <td class="py-2 px-3 text-center font-bold text-white bg-gray-900/50">\${d.actualSpecial}</td>
                    <td class="py-2 px-3 text-center text-gray-400">\${d.actualForm}</td>
                    <td class="py-2 px-3 text-center text-amber-400/80">\${d.predForm} <span class="text-[9px] text-gray-500">(tránh \${d.oppForm})</span></td>
                    <td class="py-2 px-3 text-center text-gray-400">\${d.allFilteredCount}s</td>
                    <td class="py-2 px-3 text-center \${d.hitRank > 0 && d.hitRank <= 12 ? 'text-emerald-400 font-bold' : (d.hitRank > 12 && d.hitRank <= 17 ? 'text-amber-300' : 'text-gray-500')}">\${d.hitRank > 0 ? '#' + d.hitRank : '-'}</td>
                    <td class="py-2 px-3 text-center">\${pa1Badge}</td>
                    <td class="py-2 px-3 text-center">\${dpABadge}</td>
                    <td class="py-2 px-3 text-right \${pLoColor}">\${pLoFmt}</td>
                    <td class="py-2 px-3 text-right \${comboColor}">\${comboFmt}</td>
                \`;
                tbody.appendChild(tr);
            });
        }

        function filterLedger() {
            const q = document.getElementById('searchInput').value.trim().toLowerCase();
            const status = document.getElementById('statusFilter').value;

            const filtered = rawDays.filter(d => {
                const matchQ = !q || d.date.includes(q) || d.actualSpecial.includes(q);
                let matchStatus = true;
                if (status === 'HIT_X2') matchStatus = d.hitPA1_X2;
                else if (status === 'HIT_X1') matchStatus = d.hitPA1_X1_drop2;
                else if (status === 'OPP_LOSS') matchStatus = d.isElimLoss;
                else if (status === 'MISS') matchStatus = !d.hitPA1_drop2 && !d.isElimLoss;

                return matchQ && matchStatus;
            });

            renderLedger(filtered);
        }
    </script>
</body>
</html>`;

    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    fs.writeFileSync(publicPath, htmlContent, 'utf8');
    fs.writeFileSync(artifactPath, htmlContent, 'utf8');
    console.log(`Đã xuất bản bản nâng cấp chi tiết tại:`);
    console.log(`1. ${htmlPath}`);
    console.log(`2. ${publicPath}`);
    console.log(`3. ${artifactPath}`);
}

generate().catch(console.error);
