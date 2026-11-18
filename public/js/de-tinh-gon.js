/**
 * public/js/de-tinh-gon.js
 * 
 * Logic tương tác cho chuyên trang Cố Vấn Đề Tinh Gọn & TriCore 24s:
 * - Tự động tải dữ liệu từ /api/de-tinh-gon
 * - Chuyển đổi linh hoạt giữa các cấu hình chiến lược
 * - Nút 1-click sao chép dàn số cược X2, X1 và toàn bộ dàn
 * - Bảng so sánh 2026 và bảng đa niên 5 năm
 * - Sổ cái đối soát lịch sử chi tiết
 */

(function () {
    'use strict';

    let currentReport = null;
    let activeMasterMode = 'de'; // 'de' (Cố vấn Đề) hoặc 'lo' (Cố vấn Lô)
    let activeStrategy = 'de_dynamic_governor'; // Mặc định Bộ Điều Chuyển Động (Kỷ lục lãi ròng +1.55 TỶ)
    let activeHorizon = '299'; // '299' (mốc chuẩn) hoặc '315' (toàn bộ)
    let activeTacticalMode = 'auto'; // 'normal' | 'skill' | 'auto' | 'custom'
    let isAdvancedTabsOpen = false;
    let ledgerGovFilter = 'ALL'; // 'ALL' | 'SKILL' | 'NORMAL'
    let ledgerLimit = 30;
    const expandedLedgerDates = new Set();
    const activeStratInSlip = {}; // { [date]: 'tri_paB' | 'tri_paD' | 'tri_paD2' | 'tri_base' | 'ss17_base' | 'ss15_base' }
    let ledgerMonthFilter = 'ALL';
    let ledgerOutcomeFilter = 'ALL';
    let ledgerParityFilter = 'ALL';
    let ledgerSearchVal = '';

    // Trạng thái phân hệ Lô Tinh Gọn & TriCore
    let activeLotoStrategy = 'lo_dynamic_governor'; // Mặc định Lô Điều Chuyển (Kỷ lục lãi ròng +165M)
    let activeLotoHorizon = '299'; // '299' hoặc '315'
    let activeLotoTacticalMode = 'auto'; // 'normal' | 'skill' | 'auto' | 'custom'
    let isLotoAdvancedTabsOpen = false;
    let lotoLedgerGovFilter = 'ALL'; // 'ALL' | 'SKILL' | 'NORMAL'
    let lotoLedgerLimit = 30;
    const expandedLotoLedgerDates = new Set();
    const activeLotoStratInSlip = {};
    let lotoLedgerMonthFilter = 'ALL';
    let lotoLedgerOutcomeFilter = 'ALL';
    let lotoLedgerSearchVal = '';

    // Các cấu hình chiến lược hiển thị
    const STRATEGY_DEFINITIONS = {
        de_dynamic_governor: {
            id: 'de_dynamic_governor',
            name: '👑 Bộ Điều Chuyển Linh Hoạt (Bắn Thường vs Dùng Skill)',
            badge: 'KỶ LỤC LÃI +1.550 TỶ · ROI +18.4% 👑',
            badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
            profit: '+1.550 Triệu VNĐ',
            roi: '+18.4%',
            desc: 'Cơ chế tác chiến thông minh: Hội tụ mạnh (≥ 2 số Giao Thoa Cùng Đầu) -> DÙNG SKILL Tam Tầng đòn bẩy X3/X2. Chưa đủ hội tụ -> BẮN THƯỜNG cược phẳng X1 (1M/số) trên Sweet-Spot 15s để giữ vốn. Tiết kiệm 1.373 TỶ tiền cược, lãi tăng gấp đôi lên +1.55 TỶ!',
            getData: (rep) => {
                const gov = rep.today?.governor || {};
                const cfg = gov.activeConfig || {};
                return {
                    x3: cfg.x3 || [],
                    x2: cfg.x2 || [],
                    x1: cfg.x1 || [],
                    governor: gov,
                    stakeDesc: gov.isSkill
                        ? '🔥 HÔM NAY DÙNG SKILL: X3 VIP Cùng Đầu (3M), X2 Cùng Đầu (2M), X1 Cùng Đít (1M)'
                        : '🛡️ HÔM NAY BẮN THƯỜNG: Cược phẳng X1 (1M/số) trên dàn Sweet-Spot 15s (15M) để bảo vệ vốn'
                };
            }
        },
        tri_tier: {
            id: 'tri_tier',
            name: 'TriCore Hybrid Tri-Tier Consensus',
            badge: 'KỶ LỤC LÃI RÒNG +765M 🔥',
            badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
            profit: '+765 Triệu VNĐ',
            roi: '+7.8%',
            desc: 'VIP Hạt Nhân (Giao thoa Cùng Đầu) cược X3 (3M, ăn 252M) · Chủ Lực (Cùng Đầu) cược X2 (2M, ăn 168M) · Bảo Hiểm (Cùng Đít) cược X1 (1M, ăn 84M). ĐỈNH CAO LÃI RÒNG!',
            getData: (rep) => {
                const tt = rep.today?.consensus?.hybrid_tri_tier || {};
                return {
                    x3: tt.x3 || [],
                    x2: tt.x2 || [],
                    x1: tt.x1 || [],
                    stakeDesc: 'T1: Cùng Đầu Giao Thoa (3M) · T2: Cùng Đầu còn lại (2M) · T3: Cùng Đít (1M)'
                };
            }
        },
        consensus_union: {
            id: 'consensus_union',
            name: 'Đề Đồng Thuận Nhị Trụ (Union Tiered)',
            badge: 'VUA WIN RATE 37.8% 👑',
            badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
            profit: '+418 Triệu VNĐ',
            roi: '+4.0%',
            desc: 'Hạt nhân giao thoa (TriCore ∩ 5 AI, ~3.4s) cược X2 (2M). Bọc lót vành đai (~28.4s) cược X1 (1M). Nổ 113/299 kỳ, trung bình 2.6 ngày nổ 1 lần!',
            getData: (rep) => {
                const u = rep.today?.consensus?.union_tiered || {};
                return {
                    x2: u.x2 || [],
                    x1: u.x1 || [],
                    stakeDesc: 'Giao thoa hạt nhân cược X2 (2M) · Bọc lót vành đai cược X1 (1M) · Ăn X2 = 168M, Ăn X1 = 84M'
                };
            }
        },
        core_intersect: {
            id: 'core_intersect',
            name: 'Siêu Hạt Nhân Giao Thoa (Core Intersect)',
            badge: 'VUA ROI +42.1% ⭐',
            badgeClass: 'bg-cyan-100 text-cyan-900 border-cyan-300',
            profit: '+423 Triệu VNĐ',
            roi: '+42.1%',
            desc: 'Chỉ đánh tập giao thoa giữa TriCore và 5 AI (~3.4 số). Cược phẳng 1M/số. Vốn siêu tiết kiệm (1-4M/ngày), tỷ suất sinh lời cực đại +42.1%!',
            getData: (rep) => {
                const ci = rep.today?.consensus?.core_intersect || {};
                return {
                    x2: [],
                    x1: ci.numbers || [],
                    stakeDesc: 'Cược phẳng 1M/số (Tổng cược chỉ ~3.4M/ngày) · Ăn 84M'
                };
            }
        },
        tri_paB: {
            id: 'tri_paB',
            name: 'TriCore 24s — Phương Án B (Tối Ưu Cùng Đầu)',
            badge: 'LÃI RÒNG +623M 🏆',
            badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
            profit: '+623 Triệu VNĐ',
            roi: '+6.8%',
            desc: 'Dồn hỏa lực cược X2 (2M) vào tất cả các số CÙNG ĐẦU. Các số CÙNG ĐÍT cược X1 (1M) làm dàn bảo hiểm.',
            getData: (rep) => {
                const tri = rep.today?.triCore?.paB || {};
                return {
                    x2: tri.x2 || [],
                    x1: tri.x1 || [],
                    removed: tri.removed || [],
                    stakeDesc: 'Cược X2 (2M/số) + X1 (1M/số) · Ăn X2 = 168M, Ăn X1 = 84M'
                };
            }
        },
        tri_paD: {
            id: 'tri_paD',
            name: 'TriCore 24s — Phương Án D (Siêu Rút Gọn Cùng Đầu)',
            badge: 'ROI KỶ LỤC +8.5%',
            badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300',
            profit: '+482 Triệu VNĐ',
            roi: '+8.5%',
            desc: 'CẮT BỎ HOÀN TOÀN CÙNG ĐÍT! Dàn siêu gọn ~12 số. X2: Trùng cả 2 (LL), X1: Cùng Đầu (LC). Tiết kiệm 40% vốn.',
            getData: (rep) => {
                const tri = rep.today?.triCore?.paD || {};
                return {
                    x2: tri.x2 || [],
                    x1: tri.x1 || [],
                    removed: tri.removed || [],
                    stakeDesc: 'Dàn siêu gọn ~12 số · X2: Trùng cả 2 (2M) · X1: Cùng Đầu (1M)'
                };
            }
        },
        ss17_base: {
            id: 'ss17_base',
            name: 'Đề Tinh Gọn Sweet-Spot 17s (Gốc)',
            badge: 'LÃI DƯƠNG 2026 (+149M)',
            badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
            profit: '+149 Triệu VNĐ',
            roi: '+1.72%',
            desc: 'Chiến lược tinh hoa từ 5 AI Consensus sau lọc Anti-Parity. 12 số VIP đầu bảng cược X2 (2M), 5 số tiếp theo cược X1 (1M).',
            getData: (rep) => {
                const ss = rep.today?.sweetSpot?.s17_base || {};
                return {
                    x2: ss.x2 || [],
                    x1: ss.x1 || [],
                    removed: ss.removed || [],
                    stakeDesc: 'Đúng 17 số cố định: 12 số VIP cược 2M + 5 số Lót cược 1M'
                };
            }
        },
        ss15_base: {
            id: 'ss15_base',
            name: 'Đề Tinh Gọn Sweet-Spot 15s (Cắt 2 số cuối)',
            badge: 'TIẾT KIỆM +1.75 TỶ/5 NĂM',
            badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
            profit: '-9M (Hòa vốn 2026)',
            roi: '-0.1%',
            desc: 'Cắt bỏ 2 số cuối ở vị trí #16 và #17 của dàn 17s. Tiết kiệm 2M vốn/ngày, chứng minh tiết kiệm ròng +1.75 tỷ sau 1,760 kỳ quay.',
            getData: (rep) => {
                const ss = rep.today?.sweetSpot?.s15_base || {};
                return {
                    x2: ss.x2 || [],
                    x1: ss.x1 || [],
                    cut2: ss.cut2 || [],
                    removed: ss.removed || [],
                    stakeDesc: 'Đúng 15 số cố định: 12 số VIP cược 2M + 3 số Lót cược 1M'
                };
            }
        },
        tri_paD2: {
            id: 'tri_paD2',
            name: 'TriCore 24s — Phương Án D2 (Dồn Hỏa Lực X2)',
            badge: 'LÃI RÒNG +660M · ROI +8.9%',
            badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
            profit: '+660 Triệu VNĐ',
            roi: '+8.9%',
            desc: 'Cắt bỏ Cùng Đít, toàn bộ ~12 số Cùng Đầu đều cược X2 (2M/số). Tận dụng tối đa xác suất 56.5% trúng Đầu.',
            getData: (rep) => {
                const tri = rep.today?.triCore?.paD2 || {};
                return {
                    x2: tri.x2 || [],
                    x1: tri.x1 || [],
                    removed: tri.removed || [],
                    stakeDesc: 'Toàn bộ ~12 số Cùng Đầu cược 2M/số (Ăn 168M, không cược X1)'
                };
            }
        }
    };

    // Các cấu hình chiến lược Lô hiển thị
    const LOTO_STRATEGY_DEFINITIONS = {
        lo_dynamic_governor: {
            id: 'lo_dynamic_governor',
            name: '👑 Lô Điều Chuyển (Bắn Thường vs Dùng Skill)',
            badge: 'KỶ LỤC LÃI +165M · ROI +13.7% 👑',
            badgeClass: 'bg-cyan-100 text-cyan-900 border-cyan-300',
            profit: '+165 Triệu VNĐ',
            roi: '+13.7%',
            desc: 'Cơ chế linh hoạt: Khi TriCore Top 1 == 5 AI Top 1 (Đồng Thuận Kép, 41.5% số ngày, nổ 29.8%) -> DÙNG SKILL kích hoạt cược 66K/điểm (ăn 24M/nháy). Khác nhau -> BẮN THƯỜNG cược phẳng 22K/điểm để giữ vốn. Lãi tăng từ +102M lên +165M!',
            type: 'flat',
            getData: (rep) => {
                const lGov = rep.loto?.today?.governor || {};
                return {
                    numbers: lGov.numbers || [],
                    x2: [],
                    x1: lGov.numbers || [],
                    governor: lGov,
                    stakeDesc: lGov.isSkill
                        ? '🔥 HÔM NAY DÙNG SKILL: Cược hỏa lực X3 (66K/điểm = 6.6M) vào Bạch Thủ Đồng Thuận Kép (Ăn 24M/nháy)'
                        : '🛡️ HÔM NAY BẮN THƯỜNG: Cược phẳng 22K/điểm = 2.2M (bảo vệ vốn, không dồn đòn bẩy)'
                };
            }
        },
        tri_top1: {
            id: 'tri_top1',
            name: 'TriCore Lô — Top 1 Bạch Thủ Flat',
            badge: 'QUÁN QUÂN ROI (+15.5%) 🏆',
            badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
            profit: '+102 Triệu VNĐ (299k) / +99M (315k)',
            roi: '+15.5%',
            desc: 'Bạch thủ duy nhất 1 số · Cược phẳng 22K (2.2M) · Ăn 80K (8M/nháy) · Tần suất nổ 28.8% vượt xa ngẫu nhiên 23.8%',
            type: 'flat',
            getData: (rep) => {
                const tri = rep.loto?.today?.triCore || {};
                return {
                    numbers: tri.top1 || [],
                    x2: [],
                    x1: tri.top1 || [],
                    stakeDesc: 'Cược phẳng 22K/số (2.2M / 100 điểm) · Ăn 80K/nháy (8M/nháy)'
                };
            }
        },
        penta_parity_top6: {
            id: 'penta_parity_top6',
            name: '5 AI Lô — Top 6 Phân Tầng Chẵn Lẻ (Parity Tiering)',
            badge: 'QUÁN QUÂN LÃI RÒNG (+63M) 👑',
            badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
            profit: '+63 Triệu VNĐ',
            roi: '+1.1%',
            desc: 'Dàn 6 số đồng thuận 5 AI: Cùng Đầu cược X2 (44K/con), Khác Đầu cược X1 (22K/con) · TỐI ƯU HỎA LỰC VƯỢT TRỘI',
            type: 'tiered',
            getData: (rep) => {
                const p = rep.loto?.today?.ai5Ensemble?.parity_top6 || {};
                return {
                    numbers: [...(p.x2 || []), ...(p.x1 || [])],
                    x2: p.x2 || [],
                    x1: p.x1 || [],
                    stakeDesc: 'Cùng Đầu cược X2 (44K/con, 200đ, ăn 16M/nháy) · Khác Đầu cược X1 (22K/con, 100đ, ăn 8M/nháy)'
                };
            }
        },
        penta_tiered_top4: {
            id: 'penta_tiered_top4',
            name: '5 AI Lô — Top 4 Phân Tầng VIP (2 X2 + 2 X1)',
            badge: 'AN TOÀN NHẤT (Max Loss 5d) ⭐',
            badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300',
            profit: '+29 Triệu VNĐ',
            roi: '+0.7%',
            desc: 'Top 2 VIP cược X2 (44K), 2 số tiếp theo cược X1 (22K). Win Rate 51.8%, Max chuỗi trượt rút từ 13 ngày xuống chỉ còn 5 ngày!',
            type: 'tiered',
            getData: (rep) => {
                const p = rep.loto?.today?.ai5Ensemble?.tiered_top4 || {};
                return {
                    numbers: [...(p.x2 || []), ...(p.x1 || [])],
                    x2: p.x2 || [],
                    x1: p.x1 || [],
                    stakeDesc: '2 số VIP cược X2 (44K) · 2 số Lót cược X1 (22K) · Kiểm soát rủi ro hoàn hảo'
                };
            }
        },
        tri_top7: {
            id: 'tri_top7',
            name: 'TriCore Lô — Top 7 Thất Thủ Flat',
            badge: 'TẦN SUẤT NỔ CAO (52.2%) 🎯',
            badgeClass: 'bg-purple-100 text-purple-900 border-purple-300',
            profit: 'Nổ 532 nháy (1.78 nháy/ngày)',
            roi: '52.2% ngày có lãi',
            desc: 'Dàn 7 số tinh hoa TriCore. Cược phẳng 22K/số. Hơn 52% số ngày trong năm có lãi, tiền nổ đều đặn.',
            type: 'flat',
            getData: (rep) => {
                const tri = rep.loto?.today?.triCore || {};
                return {
                    numbers: tri.top7 || [],
                    x2: [],
                    x1: tri.top7 || [],
                    stakeDesc: 'Dàn 7 số cược phẳng 22K/số (Tổng cược 15.4M) · Ăn 8M/nháy'
                };
            }
        },
        penta_top7: {
            id: 'penta_top7',
            name: '5 AI Lô — Top 7 Thất Thủ Flat',
            badge: 'NỔ ĐỀU NHẤT (56.2% Win) 🔥',
            badgeClass: 'bg-rose-100 text-rose-900 border-rose-300',
            profit: 'Nổ 571 nháy (1.91 nháy/ngày)',
            roi: '56.2% ngày có lãi',
            desc: 'Kỷ lục 168/299 ngày có lãi (56.2%), nổ tới 1.91 nháy mỗi ngày, chuỗi thua tối đa chỉ 5 ngày.',
            type: 'flat',
            getData: (rep) => {
                const p = rep.loto?.today?.ai5Ensemble || {};
                return {
                    numbers: p.top7 || [],
                    x2: [],
                    x1: p.top7 || [],
                    stakeDesc: 'Dàn 7 số tinh hoa cược phẳng 22K/số (Tổng cược 15.4M) · Nổ trung bình 1.91 nháy/ngày'
                };
            }
        },
        tri_top2: {
            id: 'tri_top2',
            name: 'TriCore Lô — Top 2 Song Thủ Flat',
            badge: 'CẶP ĐÔI TƯƠNG HỖ 🌟',
            badgeClass: 'bg-blue-100 text-blue-900 border-blue-300',
            profit: 'Trúng 127/299 ngày (42.5%)',
            roi: 'Nổ 155 nháy',
            desc: 'Cặp Song Thủ 2 con cược phẳng 22K/con, đối kháng bù trừ rủi ro lẫn nhau.',
            type: 'flat',
            getData: (rep) => {
                const tri = rep.loto?.today?.triCore || {};
                return {
                    numbers: tri.top2 || [],
                    x2: [],
                    x1: tri.top2 || [],
                    stakeDesc: 'Cặp Song Thủ 2 con cược 22K/con (Tổng cược 4.4M) · Ăn 8M/nháy'
                };
            }
        },
        rrf_top2: {
            id: 'rrf_top2',
            name: 'Song Thủ Dung Hợp RRF Top 2 (TriCore + 5 AI)',
            badge: 'ĐẢO CHIỀU DƯƠNG +12M ⚡',
            badgeClass: 'bg-cyan-100 text-cyan-900 border-cyan-300',
            profit: '+12 Triệu VNĐ (ROI +0.9%)',
            roi: '44.5% ngày có lãi (133 ngày)',
            desc: 'Dung hợp thứ hạng Reciprocal Rank Fusion giữa TriCore và 5 AI giúp Top 2 đảo chiều từ âm sang DƯƠNG +12M VNĐ (nổ 166 nháy).',
            type: 'flat',
            getData: (rep) => {
                const rrf2 = rep.loto?.today?.consensus?.rrfTop2 || [];
                return {
                    numbers: rrf2,
                    x2: [],
                    x1: rrf2,
                    stakeDesc: 'Cặp Song Thủ RRF cược phẳng 22K/con (Tổng cược 4.4M) · Ăn 8M/nháy'
                };
            }
        }
    };

    /**
     * Tải dữ liệu từ API
     */
    async function fetchReport(forceRefresh = false) {
        try {
            const url = '/api/de-tinh-gon' + (forceRefresh ? '?refresh=1' : '');
            const res = await fetch(url);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (!data || !data.success) throw new Error(data?.error || 'Lỗi nạp dữ liệu');
            currentReport = data;
            renderAll();
        } catch (err) {
            console.error('[de-tinh-gon] Lỗi tải báo cáo:', err);
            const el = document.getElementById('todayStrategyContainer');
            if (el) {
                el.innerHTML = `
                    <div class="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-700">
                        <i class="bi bi-exclamation-triangle-fill text-3xl mb-2 inline-block"></i>
                        <p class="font-bold">Không thể tải dữ liệu Cố Vấn Đề Tinh Gọn.</p>
                        <p class="text-xs mt-1 text-rose-600">${err.message}</p>
                        <button onclick="window.location.reload()" class="mt-4 px-4 py-2 bg-rose-600 text-white font-bold rounded-xl text-xs hover:bg-rose-700">
                            Thử lại
                        </button>
                    </div>
                `;
            }
        }
    }

    /**
     * Hiển thị toàn bộ giao diện
     */
    function renderAll() {
        if (!currentReport) return;

        // 1. Cập nhật banner thời gian và dự đoán chẵn lẻ
        const p = currentReport.today?.parity || {};
        const dt = currentReport.today?.targetDate || '';
        document.getElementById('badgeTargetDate').textContent = 'Kỳ quay: ' + dt;
        document.getElementById('todayPredHead').textContent = p.predHeadVi || (p.predHead === 'CHAN' ? 'Đầu Chẵn' : 'Đầu Lẻ');
        document.getElementById('todayPredTail').textContent = p.predTailVi || (p.predTail === 'CHAN' ? 'Đít Chẵn' : 'Đít Lẻ');
        document.getElementById('todayOppForm').textContent = (p.oppFormVi || p.oppForm || 'Chẵn - Chẵn') + ' (' + (p.oppForm || 'CC') + ')';
        document.getElementById('lastUpdatedTime').textContent = 'Cập nhật lúc: ' + new Date(currentReport.generatedAt).toLocaleTimeString('vi-VN');

        // 1.1. Cập nhật banner Tác Chiến Hôm Nay: Bắn Thường hay Dùng Skill
        renderTacticalBanner();
        updateTacticalButtonsUI();
        updateLotoTacticalButtonsUI();

        // 2. Hiển thị chiến lược hôm nay đang được chọn
        renderActiveStrategy();

        // 3. Hiển thị bảng tổng kết 2026
        renderSummaryTable();

        // 3.1. Hiển thị bảng phân kỳ 11 tháng năm 2026
        renderMonthlyTable();

        // 4. Hiển thị bảng đa niên 5 năm
        renderMultiYearTable();

        // 5. Hiển thị sổ cái đối soát lịch sử
        renderLedgerTable();

        // 6. Hiển thị phân hệ Lô Tinh Gọn & TriCore
        renderActiveLotoStrategy();
        renderLotoSummaryTable();
        renderLotoLedgerTable();
    }

    /**
     * Cập nhật banner Tác Chiến Hôm Nay: Bắn Thường hay Dùng Skill
     */
    function renderTacticalBanner() {
        if (!currentReport) return;
        const deGov = currentReport.today?.governor || {};
        const loGov = currentReport.loto?.today?.governor || {};

        const badgeEl = document.getElementById('todayTacticalModeBadge');
        const titleEl = document.getElementById('todayTacticalTitle');
        const descEl = document.getElementById('todayTacticalDesc');
        const actionEl = document.getElementById('todayTacticalActionContainer');

        if (!badgeEl || !titleEl || !descEl) return;

        if (activeMasterMode === 'de') {
            const isSkill = deGov.isSkill;
            badgeEl.className = isSkill 
                ? 'px-3 py-1 rounded-full text-xs font-black tracking-wider bg-rose-500 text-white shadow-md animate-pulse border border-rose-300'
                : 'px-3 py-1 rounded-full text-xs font-black tracking-wider bg-emerald-600 text-white shadow-md border border-emerald-400';
            badgeEl.innerHTML = isSkill 
                ? '<i class="bi bi-fire"></i> HÔM NAY: DÙNG SKILL (HỎA LỰC X2/X3)'
                : '<i class="bi bi-shield-check"></i> HÔM NAY: BẮN THƯỜNG (PHÒNG THỦ GIỮ VỐN)';
            
            titleEl.innerHTML = isSkill
                ? '🔥 TÍN HIỆU ĐỀ HÔM NAY: HỘI TỤ VÀNG — KÍCH HOẠT DÙNG SKILL!'
                : '🛡️ TÍN HIỆU ĐỀ HÔM NAY: BÌNH THƯỜNG — BẮN THƯỜNG BẢO TOÀN VỐN';
            
            descEl.innerHTML = (deGov.reason || '') + ' <strong class="text-white">' + (deGov.action || '') + '</strong>';

            if (actionEl) {
                actionEl.innerHTML = `
                    <button type="button" onclick="window.setTacticalMode('normal')" class="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-all border border-white/20 flex items-center gap-1.5 cursor-pointer">
                        <span>🛡️</span> Xem Đánh Thường
                    </button>
                    <button type="button" onclick="window.setTacticalMode('skill')" class="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-all border border-white/20 flex items-center gap-1.5 cursor-pointer">
                        <span>🔥</span> Xem Dùng Skill
                    </button>
                    <button type="button" onclick="window.setTacticalMode('auto')" class="px-4 py-2 rounded-xl ${isSkill ? 'bg-rose-500 hover:bg-rose-400 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'} font-black text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer">
                        <span>⚡</span> Theo Đề Xuất AI
                    </button>
                `;
            }
        } else {
            // Lô mode
            const isSkill = loGov.isSkill;
            badgeEl.className = isSkill 
                ? 'px-3 py-1 rounded-full text-xs font-black tracking-wider bg-cyan-400 text-slate-950 shadow-md animate-pulse border border-cyan-200'
                : 'px-3 py-1 rounded-full text-xs font-black tracking-wider bg-slate-700 text-white shadow-md border border-slate-500';
            badgeEl.innerHTML = isSkill 
                ? '<i class="bi bi-fire"></i> LÔ HÔM NAY: DÙNG SKILL (ĐỒNG THUẬN KÉP 66K)'
                : '<i class="bi bi-shield-check"></i> LÔ HÔM NAY: BẮN THƯỜNG (CƯỢC PHẲNG 22K)';
            
            titleEl.innerHTML = isSkill
                ? '⚡ TÍN HIỆU LÔ HÔM NAY: ĐỒNG THUẬN KÉP TRI == 5AI — DÙNG SKILL!'
                : '🛡️ TÍN HIỆU LÔ HÔM NAY: KHÁC BIỆT — BẮN THƯỜNG GIỮ VỐN';
            
            descEl.innerHTML = (loGov.reason || '') + ' <strong class="text-white">' + (loGov.action || '') + '</strong>';

            if (actionEl) {
                actionEl.innerHTML = `
                    <button type="button" onclick="window.setLotoTacticalMode('normal')" class="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-all border border-white/20 flex items-center gap-1.5 cursor-pointer">
                        <span>🛡️</span> Lô Đánh Thường (22K)
                    </button>
                    <button type="button" onclick="window.setLotoTacticalMode('skill')" class="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-all border border-white/20 flex items-center gap-1.5 cursor-pointer">
                        <span>🔥</span> Lô Dùng Skill (66K)
                    </button>
                    <button type="button" onclick="window.setLotoTacticalMode('auto')" class="px-4 py-2 rounded-xl ${isSkill ? 'bg-cyan-400 hover:bg-cyan-300 text-slate-950' : 'bg-slate-700 hover:bg-slate-600 text-white'} font-black text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer">
                        <span>⚡</span> Theo Đề Xuất AI Lô
                    </button>
                `;
            }
        }
    }

    /**
     * Hiển thị dàn số chiến lược đang chọn
     */
    function renderActiveStrategy() {
        const stratDef = STRATEGY_DEFINITIONS[activeStrategy];
        if (!stratDef) return;

        const container = document.getElementById('todayStrategyContainer');
        const data = stratDef.getData(currentReport);

        const x3List = data.x3 || [];
        const x2List = data.x2 || [];
        const x1List = data.x1 || [];
        const cut2List = data.cut2 || [];
        const removedList = data.removed || [];

        const allNumbers = [...x3List, ...x2List, ...x1List];
        const allText = allNumbers.join(', ');
        const x3Text = x3List.join(', ');
        const x2Text = x2List.join(', ');
        const x1Text = x1List.join(', ');

        const x3StakeM = x3List.length * 3;
        const x2StakeM = x2List.length * 2;
        const x1StakeM = x1List.length * 1;
        const totalStakeM = x3StakeM + x2StakeM + x1StakeM;

        let cut2Section = '';
        if (cut2List.length > 0) {
            cut2Section = `
                <div class="mt-4 pt-3 border-t border-purple-100 flex flex-wrap items-center gap-2">
                    <span class="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                        <i class="bi bi-scissors text-purple-600"></i> 2 Số X1 Bị Cắt Bỏ (#16, #17):
                    </span>
                    <div class="flex flex-wrap gap-1.5">
                        ${cut2List.map(n => `<span class="inline-flex items-center justify-center h-7 w-7 rounded-lg text-xs font-black bg-purple-100 text-purple-700 line-through decoration-purple-500 font-mono" title="Cắt bỏ số này">${n}</span>`).join('')}
                    </div>
                    <span class="text-[11px] text-purple-600 font-medium ml-2">(Tiết kiệm 2M/ngày · Tần suất nổ 5 năm chỉ 1.19%)</span>
                </div>
            `;
        }

        let removedSection = '';
        if (removedList.length > 0) {
            removedSection = `
                <div class="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    <span class="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                        <i class="bi bi-slash-circle text-rose-500"></i> Số Loại Trừ Bởi Anti-Parity:
                    </span>
                    <div class="flex flex-wrap gap-1.5">
                        ${removedList.map(n => `<span class="inline-flex items-center justify-center h-7 w-7 rounded-lg text-xs font-bold bg-slate-100 text-slate-400 line-through decoration-rose-400 font-mono" title="Bị loại vì thuộc dạng nghịch">${n}</span>`).join('')}
                    </div>
                </div>
            `;
        }

        const isFlat = x3List.length === 0 && x2List.length === 0;

        container.innerHTML = `
            <div class="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 space-y-6">
                <!-- Header Card -->
                <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-4 border-b border-slate-200/80">
                    <div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <h3 class="text-base font-black text-slate-900">${stratDef.name}</h3>
                            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black border ${stratDef.badgeClass}">
                                ${stratDef.badge}
                            </span>
                        </div>
                        <p class="text-xs text-slate-600 mt-1">${stratDef.desc}</p>
                    </div>

                    <!-- NÚT COPY THAO TÁC THƯỜNG -->
                    <div class="flex items-center gap-2 flex-wrap">
                        <button onclick="window.copyBettingSyntax('${activeStrategy}', this)" class="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 px-3.5 py-2 text-xs font-black shadow-xs transition-all cursor-pointer">
                            <i class="bi bi-chat-quote-fill"></i> Copy Cú Pháp Gửi Thầu / Zalo
                        </button>
                        <button onclick="window.copyToClipboard('${allText}', this)" class="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 text-xs font-bold shadow-xs transition-all cursor-pointer">
                            <i class="bi bi-clipboard"></i> Chép Số (${allNumbers.length}s)
                        </button>
                    </div>
                </div>

                ${data.governor ? `
                <!-- Hộp Tác Chiến Điều Chuyển Hôm Nay -->
                <div class="rounded-2xl p-4.5 ${data.governor.isSkill ? 'bg-gradient-to-r from-rose-50 via-amber-50 to-rose-50 border border-rose-200 shadow-sm text-slate-900' : 'bg-emerald-50/80 border border-emerald-200 text-slate-900'}">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 mb-2 border-b ${data.governor.isSkill ? 'border-rose-200' : 'border-emerald-200'}">
                        <div class="flex items-center gap-2">
                            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${data.governor.isSkill ? 'bg-rose-500 text-white animate-pulse' : 'bg-emerald-600 text-white'}">
                                ${data.governor.statusBadge}
                            </span>
                            <span class="text-xs font-black text-slate-900 uppercase">CHẾ ĐỘ: ${data.governor.mode}</span>
                        </div>
                        <span class="text-[11px] font-bold text-slate-500">Giao Thoa Cùng Đầu: ${data.governor.intSameHeadCount} số (${(data.governor.intSameHeadNumbers || []).join(', ') || 'Không có'})</span>
                    </div>
                    <p class="text-xs text-slate-700 leading-relaxed">${data.governor.reason}</p>
                    <div class="mt-2.5 pt-2 border-t ${data.governor.isSkill ? 'border-rose-100' : 'border-emerald-100'} flex items-start gap-1.5 text-xs font-bold text-slate-900">
                        <i class="bi bi-bullseye ${data.governor.isSkill ? 'text-rose-600' : 'text-emerald-600'} mt-0.5 shrink-0"></i>
                        <span>${data.governor.action}</span>
                    </div>
                </div>
                ` : ''}

                <!-- Thống kê nhanh vốn & chỉ số -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="bg-white rounded-xl p-3 border border-slate-200">
                        <span class="text-[10px] font-bold text-slate-400 uppercase">Quy mô hôm nay</span>
                        <div class="text-lg font-black text-slate-900 font-mono">${allNumbers.length} số</div>
                        <span class="text-[10px] text-slate-500">${x3List.length > 0 ? `${x3List.length} X3 + ` : ''}${x2List.length > 0 ? `${x2List.length} X2 + ` : ''}${x1List.length} X1</span>
                    </div>

                    <div class="bg-white rounded-xl p-3 border border-slate-200">
                        <span class="text-[10px] font-bold text-slate-400 uppercase">Vốn cược dự kiến</span>
                        <div class="text-lg font-black text-amber-700 font-mono">${totalStakeM}M</div>
                        <span class="text-[10px] text-slate-500">${x3List.length > 0 ? `${x3StakeM}M X3 + ` : ''}${x2List.length > 0 ? `${x2StakeM}M X2 + ` : ''}${x1StakeM}M X1</span>
                    </div>

                    <div class="bg-white rounded-xl p-3 border border-slate-200">
                        <span class="text-[10px] font-bold text-slate-400 uppercase">Lãi ròng năm 2026</span>
                        <div class="text-lg font-black text-emerald-700 font-mono">${stratDef.profit}</div>
                        <span class="text-[10px] text-slate-500">299 kỳ quay</span>
                    </div>

                    <div class="bg-white rounded-xl p-3 border border-slate-200">
                        <span class="text-[10px] font-bold text-slate-400 uppercase">Tỷ suất ROI</span>
                        <div class="text-lg font-black text-indigo-700 font-mono">${stratDef.roi}</div>
                        <span class="text-[10px] text-slate-500">Trên vốn cược</span>
                    </div>
                </div>

                ${isFlat ? `
                <!-- DÀN CƯỢC PHẲNG ĐỀU TAY 1M (ĐÁNH THƯỜNG) -->
                <div class="space-y-3">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-600 text-white font-black text-xs shadow-sm">1M</span>
                            <span class="text-xs sm:text-sm font-black text-emerald-950 uppercase tracking-wider">
                                🎯 DÀN ĐỀ CƯỢC PHẲNG ĐỀU TAY (${allNumbers.length} số) — Cược 1M / số · Ăn 84M
                            </span>
                        </div>
                        <button onclick="window.copyToClipboard('${allText}', this)" class="text-xs font-bold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1 cursor-pointer">
                            <i class="bi bi-copy"></i> Chép Dãy Số
                        </button>
                    </div>

                    <div class="flex flex-wrap gap-2.5 p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200 shadow-2xs">
                        ${allNumbers.map(n => `
                            <div class="flex flex-col items-center">
                                <span class="badge-num inline-flex items-center justify-center h-10 w-10 rounded-xl font-mono text-sm font-black bg-white text-emerald-950 shadow-xs border border-emerald-300">
                                    ${n}
                                </span>
                                <span class="text-[9px] font-bold text-emerald-700 mt-1 font-mono">1.000k</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : `
                <!-- Dàn Siêu VIP X3 (nếu có) -->
                ${x3List.length > 0 ? `
                <div class="space-y-2">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="flex h-5 w-5 items-center justify-center rounded-md bg-rose-600 text-white font-black text-[11px] shadow-sm animate-pulse">X3</span>
                            <span class="text-xs font-black text-rose-900 uppercase tracking-wider">
                                DÀN SIÊU VIP X3 (${x3List.length} số) — Cược 3M / số · Ăn 252M 👑
                            </span>
                        </div>
                        <button onclick="window.copyToClipboard('${x3Text}', this)" class="text-xs font-bold text-rose-700 hover:text-rose-900 inline-flex items-center gap-1 cursor-pointer">
                            <i class="bi bi-copy"></i> Chép X3
                        </button>
                    </div>

                    <div class="flex flex-wrap gap-2 p-3 bg-rose-50/80 rounded-xl border border-rose-200/90 shadow-2xs">
                        ${x3List.map(n => `
                            <span class="badge-num inline-flex items-center justify-center h-9 w-9 rounded-xl font-mono text-sm font-black bg-gradient-to-tr from-rose-500 to-rose-600 text-white shadow-md border border-rose-300">
                                ${n}
                            </span>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- Dàn VIP X2 -->
                ${x2List.length > 0 ? `
                <div class="space-y-2">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500 text-white font-black text-[11px]">X2</span>
                            <span class="text-xs font-black text-slate-900 uppercase tracking-wider">
                                DÀN VIP X2 (${x2List.length} số) — Cược 2M / số · Ăn 168M
                            </span>
                        </div>
                        <button onclick="window.copyToClipboard('${x2Text}', this)" class="text-xs font-bold text-amber-700 hover:text-amber-900 inline-flex items-center gap-1 cursor-pointer">
                            <i class="bi bi-copy"></i> Chép X2
                        </button>
                    </div>

                    <div class="flex flex-wrap gap-2 p-3 bg-amber-50/60 rounded-xl border border-amber-200/80">
                        ${x2List.map(n => `
                            <span class="badge-num inline-flex items-center justify-center h-9 w-9 rounded-xl font-mono text-sm font-black bg-gradient-to-tr from-amber-400 to-amber-500 text-amber-950 shadow-2xs border border-amber-300">
                                ${n}
                            </span>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- Dàn Lót X1 -->
                ${x1List.length > 0 ? `
                <div class="space-y-2">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-500 text-white font-black text-[11px]">X1</span>
                            <span class="text-xs font-black text-slate-900 uppercase tracking-wider">
                                DÀN LÓT BẢO HIỂM X1 (${x1List.length} số) — Cược 1M / số · Ăn 84M
                            </span>
                        </div>
                        <button onclick="window.copyToClipboard('${x1Text}', this)" class="text-xs font-bold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1 cursor-pointer">
                            <i class="bi bi-copy"></i> Chép X1
                        </button>
                    </div>

                    <div class="flex flex-wrap gap-2 p-3 bg-indigo-50/60 rounded-xl border border-indigo-200/80">
                        ${x1List.map(n => `
                            <span class="badge-num inline-flex items-center justify-center h-9 w-9 rounded-xl font-mono text-sm font-bold bg-white text-indigo-950 shadow-2xs border border-indigo-200">
                                ${n}
                            </span>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
                `}

                <!-- Số cắt & số loại trừ -->
                ${cut2Section}
                ${removedSection}
            </div>
        `;
    }

    /**
     * Hiển thị bảng tổng kết 2026
     */
    function renderSummaryTable() {
        const tbody = document.getElementById('summaryTableBody');
        const titleEl = document.getElementById('summaryTableTitle');
        const subtitleEl = document.getElementById('summaryTableSubtitle');

        const is315 = activeHorizon === '315';
        const list = (is315 && currentReport.summaries315) 
            ? currentReport.summaries315 
            : (currentReport.summaries299 || currentReport.summaries || []);

        if (titleEl && subtitleEl) {
            if (is315) {
                titleEl.textContent = 'BẢNG SO SÁNH HIỆU NĂNG CÁC PHƯƠNG ÁN NĂM 2026 (TOÀN BỘ 315 KỲ LIVE)';
                subtitleEl.textContent = 'Toàn bộ 315 kỳ quay thực tế từ 01/01/2026 đến 15/11/2026 · Tỷ lệ 1 ăn 84 · X2 cược 2M (ăn 168M) / X1 cược 1M (ăn 84M)';
            } else {
                titleEl.textContent = 'BẢNG SO SÁNH HIỆU NĂNG CÁC PHƯƠNG ÁN NĂM 2026 (299 KỲ QUAY CHUẨN)';
                subtitleEl.textContent = 'Tập mẫu nghiên cứu chuẩn mực từ 01/01/2026 đến 30/10/2026 · Tỷ lệ 1 ăn 84 · X2 cược 2M (ăn 168M) / X1 cược 1M (ăn 84M)';
            }
        }

        // Cập nhật giao diện nút toggle horizon
        const btn299 = document.getElementById('btnHorizon299');
        const btn315 = document.getElementById('btnHorizon315');
        if (btn299 && btn315) {
            if (is315) {
                btn315.className = 'px-3.5 py-2 rounded-xl text-xs font-black transition-all bg-white text-indigo-900 shadow-xs border border-indigo-200';
                btn299.className = 'px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 transition-all';
            } else {
                btn299.className = 'px-3.5 py-2 rounded-xl text-xs font-black transition-all bg-white text-indigo-900 shadow-xs border border-indigo-200';
                btn315.className = 'px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 transition-all';
            }
        }

        if (!list.length) return;

        tbody.innerHTML = list.map(item => {
            const isProfit = item.profitM >= 0;
            const profitClass = isProfit ? 'text-emerald-700 font-black' : 'text-rose-600 font-bold';
            const roiClass = item.roi >= 0 ? 'text-emerald-700 font-black' : 'text-rose-600 font-bold';

            let badge = '';
            if (item.key === 'tri_paB') badge = '<span class="ml-1.5 px-2 py-0.5 rounded-md text-[9px] font-black bg-emerald-100 text-emerald-800">🥇 QUÁN QUÂN LÃI</span>';
            else if (item.key === 'tri_paD') badge = '<span class="ml-1.5 px-2 py-0.5 rounded-md text-[9px] font-black bg-indigo-100 text-indigo-800">🏆 ROI CAO NHẤT</span>';
            else if (item.key === 'ss17_base') badge = '<span class="ml-1.5 px-2 py-0.5 rounded-md text-[9px] font-black bg-amber-100 text-amber-800">💎 SWEET-SPOT AI</span>';

            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-3">
                        <div class="font-bold text-slate-900 flex items-center">
                            ${item.name}
                            ${badge}
                        </div>
                        <div class="text-[11px] text-slate-500 font-normal">${item.desc}</div>
                    </td>
                    <td class="p-3 text-center font-mono">${item.days} kỳ</td>
                    <td class="p-3 text-center font-mono font-bold">${item.wins} (${item.winRate}%)</td>
                    <td class="p-3 text-center font-mono text-xs">
                        <span class="text-amber-700 font-bold">${item.x2Wins} X2</span> / <span class="text-indigo-700">${item.x1Wins} X1</span>
                    </td>
                    <td class="p-3 text-right font-mono text-slate-600">${item.stakeM.toLocaleString('vi-VN')}M</td>
                    <td class="p-3 text-right font-mono text-slate-600">${item.payoutM.toLocaleString('vi-VN')}M</td>
                    <td class="p-3 text-right font-mono text-sm ${profitClass}">${item.profitFormatted}</td>
                    <td class="p-3 text-right font-mono text-sm ${roiClass}">${item.roiFormatted}</td>
                    <td class="p-3 text-center font-mono text-slate-500">${item.maxLossStreak} kỳ</td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Hiển thị bảng phân tích 11 tháng năm 2026
     */
    function renderMonthlyTable() {
        const tbody = document.getElementById('monthlyTableBody');
        if (!tbody) return;
        const list = currentReport.monthlyBreakdown || [];
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="p-6 text-center text-slate-400">Không có dữ liệu phân kỳ theo tháng</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(row => {
            const isTriBProfit = row.tri_paB.profitM >= 0;
            const triBProfitClass = isTriBProfit ? 'text-emerald-700 font-black' : 'text-rose-600 font-bold';
            const triBRoiClass = row.tri_paB.roi >= 0 ? 'text-emerald-700 font-black' : 'text-rose-600 font-bold';

            const isTriDProfit = row.tri_paD.profitM >= 0;
            const triDProfitClass = isTriDProfit ? 'text-emerald-700 font-black' : 'text-rose-600 font-bold';

            const isSSProfit = row.ss17_base.profitM >= 0;
            const ssProfitClass = isSSProfit ? 'text-emerald-700 font-black' : 'text-rose-600 font-bold';

            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-3 font-bold text-slate-900">${row.monthLabel}</td>
                    <td class="p-3 text-center font-mono">${row.days}</td>
                    <td class="p-3 text-center font-mono">
                        ${row.tri_paB.wins}/${row.days} <span class="text-[10px] text-slate-400">(${row.tri_paB.x2Wins}X2, ${row.tri_paB.x1Wins}X1)</span>
                    </td>
                    <td class="p-3 text-right font-mono ${triBProfitClass}">${row.tri_paB.profitFormatted}</td>
                    <td class="p-3 text-right font-mono ${triBRoiClass}">${row.tri_paB.roiFormatted}</td>
                    <td class="p-3 text-center font-mono">
                        ${row.tri_paD.wins}/${row.days} <span class="text-[10px] text-slate-400">(${row.tri_paD.x2Wins}X2, ${row.tri_paD.x1Wins}X1)</span>
                    </td>
                    <td class="p-3 text-right font-mono ${triDProfitClass}">${row.tri_paD.profitFormatted}</td>
                    <td class="p-3 text-right font-mono ${ssProfitClass}">${row.ss17_base.profitFormatted}</td>
                    <td class="p-3 text-xs text-slate-600 leading-snug max-w-md">${row.note}</td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Hiển thị bảng đa niên 5 năm
     */
    function renderMultiYearTable() {
        const tbody = document.getElementById('multiYearTableBody');
        const list = currentReport.multiYearStats || [];
        if (!list.length) return;

        tbody.innerHTML = list.map(row => {
            const isAll = row.year.includes('ALL') || row.year.includes('5 NĂM');
            const rowClass = isAll ? 'bg-amber-50/80 font-black' : 'hover:bg-slate-50';

            return `
                <tr class="${rowClass} transition-colors">
                    <td class="p-3 font-bold text-slate-900">${row.year}</td>
                    <td class="p-3 text-center font-mono">${row.days} kỳ</td>
                    <td class="p-3 text-right font-mono ${row.s17Profit >= 0 ? 'text-emerald-700' : 'text-slate-600'}">${row.s17Profit.toLocaleString('vi-VN')}M</td>
                    <td class="p-3 text-right font-mono ${row.s15Profit >= 0 ? 'text-emerald-700' : 'text-slate-600'}">${row.s15Profit.toLocaleString('vi-VN')}M</td>
                    <td class="p-3 text-right font-mono text-emerald-700">+${row.savedStake.toLocaleString('vi-VN')}M</td>
                    <td class="p-3 text-right font-mono text-rose-600">-${row.missedPayout.toLocaleString('vi-VN')}M</td>
                    <td class="p-3 text-right font-mono text-sm text-emerald-800 font-extrabold">+${row.netDiff.toLocaleString('vi-VN')}M</td>
                    <td class="p-3 text-center font-mono text-xs">
                        <span class="px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 font-bold">${row.cutHits} lần (${row.cutPct})</span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Lọc danh sách sổ cái theo các tiêu chí người dùng chọn
     */
    function getFilteredLedgerRows() {
        const allList = currentReport?.settledLedger || [];
        return allList.filter(row => {
            // Lọc Tác Chiến: SKILL vs THƯỜNG
            if (ledgerGovFilter === 'SKILL' && !row.governor?.isSkill) return false;
            if (ledgerGovFilter === 'NORMAL' && row.governor?.isSkill) return false;

            // Lọc tháng
            if (ledgerMonthFilter !== 'ALL') {
                if (!row.date.startsWith(ledgerMonthFilter)) return false;
            }
            // Lọc kết quả TriCore PA B
            if (ledgerOutcomeFilter !== 'ALL') {
                const b = row.triCore?.paB;
                if (ledgerOutcomeFilter === 'WIN_ANY' && !b?.isHit) return false;
                if (ledgerOutcomeFilter === 'WIN_X2' && !b?.isX2) return false;
                if (ledgerOutcomeFilter === 'WIN_X1' && !b?.isX1) return false;
                if (ledgerOutcomeFilter === 'LOSS' && b?.isHit) return false;
            }
            // Lọc dạng Chẵn/Lẻ
            if (ledgerParityFilter !== 'ALL') {
                if (row.predForm !== ledgerParityFilter) return false;
            }
            // Lọc tìm kiếm
            if (ledgerSearchVal) {
                const s = ledgerSearchVal.toLowerCase();
                const matchDate = row.date.toLowerCase().includes(s);
                const matchAct = String(row.actualSpecial).toLowerCase().includes(s);
                if (!matchDate && !matchAct) return false;
            }
            return true;
        });
    }

    /**
     * Render phiếu cược đối soát chi tiết của một ngày (Interactive Accordion Slip)
     */
    function renderDetailSlipHtml(row) {
        const date = row.date;
        const act = row.actualSpecial;
        const pForm = row.predForm;
        const oppForm = row.oppForm;
        const pHead = row.predHead;

        const curStrat = activeStratInSlip[date] || activeStrategy || 'de_dynamic_governor';

        const STRAT_TABS = [
            { id: 'de_dynamic_governor', name: 'Điều Chuyển Động', icon: '👑', badge: 'Lãi +1.55 TỶ' },
            { id: 'tri_tier', name: 'Hybrid Tri-Tier', icon: '🔥', badge: 'Lãi +765M' },
            { id: 'consensus_union', name: 'Đồng Thuận 31.8s', icon: '👑', badge: '37.8% Win' },
            { id: 'core_intersect', name: 'Siêu Hạt Nhân 3.4s', icon: '⭐', badge: 'ROI +42.1%' },
            { id: 'tri_paB', name: 'TriCore PA B (Tối Ưu)', icon: '🏛️', badge: 'Lãi +623M' },
            { id: 'tri_paD2', name: 'TriCore PA D2 (Dồn X2)', icon: '🔥', badge: 'Lãi +660M' },
            { id: 'tri_paD', name: 'TriCore PA D (Rút Gọn)', icon: '⚡', badge: 'ROI +8.5%' },
            { id: 'ss17_base', name: 'Sweet-Spot 17s (Gốc)', icon: '💎', badge: 'Lãi +149M' },
            { id: 'ss15_base', name: 'Sweet-Spot 15s (Cắt 2s)', icon: '🎯', badge: '+1.75 Tỷ/5N' },
            { id: 'tri_base', name: 'TriCore Gốc (Sau Lọc)', icon: '📐', badge: '18s' }
        ];

        // Trích xuất cấu hình chiến lược hiện tại
        let stratData = null;
        let x3List = [];
        let x2List = [];
        let x1List = [];
        let removedList = [];
        let cutList = [];
        let isHit = false;
        let isX3 = false;
        let isX2 = false;
        let isX1 = false;
        let stakeK = 0;
        let payoutK = 0;
        let profitK = 0;

        if (curStrat === 'de_dynamic_governor') {
            const gov = row.governor;
            if (gov?.isSkill) {
                stratData = row.consensus?.tri_tier;
                x3List = stratData?.x3 || [];
                x2List = stratData?.x2 || [];
                x1List = stratData?.x1 || [];
            } else {
                stratData = row.sweetSpot?.s15_base;
                x1List = row.sweetSpot?.pool15 || [];
            }
        } else if (curStrat === 'tri_tier') {
            stratData = row.consensus?.tri_tier;
            x3List = stratData?.x3 || [];
            x2List = stratData?.x2 || [];
            x1List = stratData?.x1 || [];
        } else if (curStrat === 'consensus_union') {
            stratData = row.consensus?.union_tiered;
            x2List = stratData?.x2 || [];
            x1List = stratData?.x1 || [];
        } else if (curStrat === 'core_intersect') {
            stratData = row.consensus?.core_intersect;
            x1List = stratData?.numbers || [];
        } else if (curStrat === 'tri_paB') {
            stratData = row.triCore?.paB;
            x2List = stratData?.x2 || [];
            x1List = stratData?.x1 || [];
            removedList = row.triCore?.removedNumbers || [];
        } else if (curStrat === 'tri_paD') {
            stratData = row.triCore?.paD;
            x2List = stratData?.x2 || [];
            x1List = stratData?.x1 || [];
            removedList = row.triCore?.removedNumbers || [];
        } else if (curStrat === 'tri_paD2') {
            stratData = row.triCore?.paD2;
            x2List = stratData?.x2 || [];
            x1List = [];
            removedList = row.triCore?.removedNumbers || [];
        } else if (curStrat === 'tri_base') {
            stratData = row.triCore?.base;
            x2List = stratData?.x2 || [];
            x1List = stratData?.x1 || [];
            removedList = row.triCore?.removedNumbers || [];
        } else if (curStrat === 'ss17_base') {
            stratData = row.sweetSpot?.s17_base;
            x2List = stratData?.x2 || [];
            x1List = stratData?.x1 || [];
            removedList = row.sweetSpot?.removedNumbers || [];
        } else if (curStrat === 'ss15_base') {
            stratData = row.sweetSpot?.s15_base;
            x2List = stratData?.x2 || [];
            x1List = stratData?.x1 || [];
            cutList = row.sweetSpot?.cut2 || [];
            removedList = row.sweetSpot?.removedNumbers || [];
        }

        if (stratData) {
            isHit = stratData.isHit;
            isX3 = Boolean(stratData.isX3);
            isX2 = stratData.isX2;
            isX1 = stratData.isX1;
            stakeK = stratData.stakeK || 0;
            payoutK = stratData.payoutK || 0;
            profitK = stratData.profitK || 0;
        }

        const allNumbersToCopy = [...x3List, ...x2List, ...x1List].join(' ');
        const profitClass = profitK > 0 ? 'text-emerald-700 font-black' : (profitK < 0 ? 'text-rose-600 font-bold' : 'text-slate-600');
        const profitSign = profitK > 0 ? '+' : '';

        // Kiểm tra xem số đặc biệt có rơi vào số bị loại trừ hoặc bị cắt không
        const isRemovedHit = removedList.includes(act);
        const isCutHit = cutList.includes(act);

        return `
            <div class="p-4 sm:p-5 bg-gradient-to-br from-slate-50 via-white to-amber-50/25 rounded-2xl border border-amber-200/70 shadow-sm my-2 text-left">
                <!-- THANH CHUYỂN TAB CẤU HÌNH TRONG NGÀY -->
                <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wide mr-1">
                            <i class="bi bi-gear-wide-connected text-amber-600"></i> Xem Phiếu Cược:
                        </span>
                        ${STRAT_TABS.map(tab => {
                            const isCur = tab.id === curStrat;
                            return `
                                <button type="button" class="btn-slip-strat px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs ${isCur ? 'bg-amber-600 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'}" data-date="${date}" data-strat="${tab.id}">
                                    <span>${tab.icon}</span>
                                    <span>${tab.name}</span>
                                    <span class="text-[10px] opacity-80 font-mono">(${tab.badge})</span>
                                </button>
                            `;
                        }).join('')}
                    </div>

                    <div class="flex items-center gap-2">
                        <button type="button" class="btn-copy-day-slip px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs transition cursor-pointer flex items-center gap-1 shadow-2xs" data-text="${allNumbersToCopy}">
                            <i class="bi bi-clipboard-check"></i> Copy Dàn Đánh (${x2List.length + x1List.length} số)
                        </button>
                    </div>
                </div>

                <!-- TÓM TẮT TÀI CHÍNH VÀ ĐỐI SOÁT NGÀY ĐÓ -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3.5 p-3 bg-white rounded-xl border border-slate-200 text-xs shadow-2xs">
                    <div>
                        <span class="text-slate-400 block text-[10px] font-bold uppercase">Giải Đặc Biệt Thực Tế</span>
                        <div class="flex items-center gap-1.5 mt-0.5">
                            <span class="inline-flex items-center justify-center h-6 w-6 rounded bg-slate-900 text-white font-mono font-black text-xs shadow-2xs">
                                ${act}
                            </span>
                            <span class="font-bold text-slate-700">${pForm} (${pHead === 'C' ? 'Đầu Chẵn' : 'Đầu Lẻ'})</span>
                        </div>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-[10px] font-bold uppercase">Dạng Đối Lập Loại Trừ</span>
                        <div class="mt-0.5 font-bold text-rose-700">
                            ${oppForm} (Đã cắt ${removedList.length} số)
                        </div>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-[10px] font-bold uppercase">Tổng Vốn Cược Ngày</span>
                        <div class="mt-0.5 font-mono font-bold text-slate-800">
                            ${Math.round(stakeK / 1000)} Triệu VNĐ
                        </div>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-[10px] font-bold uppercase">Kết Quả &amp; Lợi Nhuận</span>
                        <div class="mt-0.5 font-mono ${profitClass}">
                            ${isX3 ? '👑 ĂN X3 (+252M)' : (isX2 ? '👑 ĂN X2 (+168M)' : (isX1 ? '⭐ ĂN X1 (+84M)' : '❌ TRƯỢT'))}
                            · <strong>${profitSign}${Math.round(profitK / 1000)}M</strong>
                        </div>
                    </div>
                </div>

                <!-- CHI TIẾT CÁC TẦNG SỐ: VIP X3, VIP X2, LÓT X1, BỊ LOẠI TRỪ, BỊ CẮT -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <!-- KHỐI 1: CÁC SỐ CƯỢC THỰC CHIẾN -->
                    <div class="rounded-xl border border-emerald-200 bg-white p-3.5 space-y-3 shadow-2xs">
                        <!-- Tầng Siêu VIP X3 (nếu có) -->
                        ${x3List.length > 0 ? `
                        <div>
                            <div class="flex items-center justify-between text-[11px] font-bold text-rose-900 mb-1.5">
                                <span class="flex items-center gap-1">
                                    <span class="w-4 h-4 rounded-full bg-rose-600 text-white font-black text-[9px] flex items-center justify-center animate-pulse">3</span>
                                    <span>TẦNG SIÊU VIP X3 (${x3List.length} số · Cược 3M · Ăn 252M):</span>
                                </span>
                                <span class="text-[10px] text-rose-700 font-mono">Vốn ${x3List.length * 3}M</span>
                            </div>
                            <div class="flex flex-wrap gap-1 p-2 rounded-lg bg-rose-50/70 border border-rose-300 min-h-[38px] items-center">
                                ${x3List.map(n => {
                                    const isWin = n === act;
                                    return `
                                        <span class="inline-flex items-center justify-center px-2 py-0.5 rounded font-mono text-xs font-black transition-all ${isWin ? 'bg-rose-500 text-white ring-2 ring-rose-600 shadow-md animate-pulse' : 'bg-white text-rose-950 border border-rose-300'}" title="${isWin ? '👑 SỐ TRÚNG ĐẶC BIỆT ĂN X3 (+252M)' : 'VIP X3: ' + n}">
                                            ${n}${isWin ? ' 👑' : ''}
                                        </span>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                        ` : ''}

                        <!-- Tầng VIP X2 -->
                        <div>
                            <div class="flex items-center justify-between text-[11px] font-bold text-amber-900 mb-1.5">
                                <span class="flex items-center gap-1">
                                    <span class="w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-black text-[9px] flex items-center justify-center">2</span>
                                    <span>TẦNG VIP X2 (${x2List.length} số · Cược 2M · Ăn 168M):</span>
                                </span>
                                <span class="text-[10px] text-amber-700 font-mono">Vốn ${x2List.length * 2}M</span>
                            </div>
                            <div class="flex flex-wrap gap-1 p-2 rounded-lg bg-amber-50/60 border border-amber-200 min-h-[38px] items-center">
                                ${x2List.length === 0 ? '<span class="text-slate-400 text-xs italic">Không có số</span>' : x2List.map(n => {
                                    const isWin = n === act;
                                    return `
                                        <span class="inline-flex items-center justify-center px-2 py-0.5 rounded font-mono text-xs font-black transition-all ${isWin ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-600 shadow-md animate-pulse font-black' : 'bg-white text-slate-900 border border-amber-300'}" title="${isWin ? '👑 SỐ TRÚNG ĐẶC BIỆT ĂN X2 (+168M)' : 'VIP X2: ' + n}">
                                            ${n}${isWin ? ' 👑' : ''}
                                        </span>
                                    `;
                                }).join('')}
                            </div>
                        </div>

                        <!-- Tầng Lót X1 -->
                        ${x1List.length > 0 ? `
                            <div>
                                <div class="flex items-center justify-between text-[11px] font-bold text-indigo-900 mb-1.5">
                                    <span class="flex items-center gap-1">
                                        <span class="w-4 h-4 rounded-full bg-indigo-500 text-white font-black text-[9px] flex items-center justify-center">1</span>
                                        <span>TẦNG LÓT X1 (${x1List.length} số · Cược 1M · Ăn 84M):</span>
                                    </span>
                                    <span class="text-[10px] text-indigo-700 font-mono">Vốn ${x1List.length}M</span>
                                </div>
                                <div class="flex flex-wrap gap-1 p-2 rounded-lg bg-indigo-50/50 border border-indigo-200 min-h-[38px] items-center">
                                    ${x1List.map(n => {
                                        const isWin = n === act;
                                        return `
                                            <span class="inline-flex items-center justify-center px-2 py-0.5 rounded font-mono text-xs font-bold transition-all ${isWin ? 'bg-emerald-400 text-slate-950 ring-2 ring-emerald-600 shadow-md animate-pulse font-black' : 'bg-white text-indigo-950 border border-indigo-200'}" title="${isWin ? '⭐ SỐ TRÚNG ĐẶC BIỆT ĂN X1 (+84M)' : 'Lót X1: ' + n}">
                                                ${n}${isWin ? ' ⭐' : ''}
                                            </span>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>

                    <!-- KHỐI 2: CÁC SỐ BỊ LOẠI TRỪ / CẮT BỎ -->
                    <div class="rounded-xl border border-rose-200 bg-white p-3.5 space-y-3 shadow-2xs">
                        <!-- Số Bị Loại Trừ Anti-Parity -->
                        <div>
                            <div class="flex items-center justify-between text-[11px] font-bold text-rose-900 mb-1.5">
                                <span class="flex items-center gap-1">
                                    <span class="w-4 h-4 rounded-full bg-rose-600 text-white font-black text-[9px] flex items-center justify-center">✕</span>
                                    <span>LOẠI TRỪ CỰC NGHỊCH DẠNG ${oppForm} (${removedList.length} số):</span>
                                </span>
                                <span class="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                    Tiết kiệm +${removedList.length}M
                                </span>
                            </div>
                            <div class="flex flex-wrap gap-1 p-2 rounded-lg bg-rose-50/50 border border-rose-200 min-h-[38px] items-center">
                                ${removedList.length === 0 ? '<span class="text-slate-400 text-xs italic">Không loại trừ số nào</span>' : removedList.map(n => {
                                    const isWin = n === act;
                                    return `
                                        <span class="inline-flex items-center justify-center px-1.5 py-0.5 rounded font-mono text-xs ${isWin ? 'bg-rose-600 text-white font-black ring-2 ring-rose-700 shadow-md' : 'bg-white text-rose-500 line-through border border-rose-200'}" title="${isWin ? '⚠️ ĐẶC BIỆT VỀ CON BỊ LOẠI NÀY: ' + n : 'Loại trừ ' + oppForm + ': ' + n}">
                                            ${n}${isWin ? ' ⚠️' : ''}
                                        </span>
                                    `;
                                }).join('')}
                            </div>
                            ${isRemovedHit ? `
                                <div class="mt-1.5 p-2 rounded-lg bg-rose-100 text-rose-900 text-[11px] font-bold border border-rose-300 flex items-center gap-1.5">
                                    <i class="bi bi-exclamation-triangle-fill text-rose-600"></i>
                                    <span>Kỳ này ĐB về con <strong>${act}</strong> thuộc dạng đối lập <strong>${oppForm}</strong> nên bị loại trừ đúng nguyên tắc.</span>
                                </div>
                            ` : ''}
                        </div>

                        <!-- 2 Số Bị Cắt Của Dàn 15s (nếu xem tab dàn 15s) -->
                        ${cutList.length > 0 ? `
                            <div>
                                <div class="flex items-center justify-between text-[11px] font-bold text-purple-900 mb-1.5">
                                    <span class="flex items-center gap-1">
                                        <span class="w-4 h-4 rounded-full bg-purple-600 text-white font-black text-[9px] flex items-center justify-center">✂</span>
                                        <span>2 SỐ CUỐI X1 BỊ CẮT BỎ (#16, #17):</span>
                                    </span>
                                    <span class="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                        Tiết kiệm +2M/ngày
                                    </span>
                                </div>
                                <div class="flex flex-wrap gap-1 p-2 rounded-lg bg-purple-50/50 border border-purple-200 min-h-[38px] items-center">
                                    ${cutList.map(n => {
                                        const isWin = n === act;
                                        return `
                                            <span class="inline-flex items-center justify-center px-2 py-0.5 rounded font-mono text-xs font-bold ${isWin ? 'bg-purple-600 text-white font-black ring-2 ring-purple-700' : 'bg-white text-purple-600 line-through border border-purple-200'}" title="${isWin ? '⚠️ ĐẶC BIỆT VỀ CON BỊ CẮT NÀY: ' + n : 'Số bị cắt: ' + n}">
                                                ${n}${isWin ? ' ⚠️' : ''}
                                            </span>
                                        `;
                                    }).join('')}
                                </div>
                                ${isCutHit ? `
                                    <div class="mt-1.5 p-2 rounded-lg bg-purple-100 text-purple-900 text-[11px] font-bold border border-purple-300 flex items-center gap-1.5">
                                        <i class="bi bi-info-circle-fill text-purple-600"></i>
                                        <span>ĐB về con <strong>${act}</strong> nằm trong 2 số cắt giảm. Việc cắt 2 con này đã chứng minh tiết kiệm ròng +1.75 tỷ qua 5 năm.</span>
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}
                    </div>
                </div>

                <div class="mt-3 text-[11px] text-slate-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 pt-2 border-t border-slate-200">
                    <span class="italic">
                        <i class="bi bi-shield-lock-fill text-emerald-600"></i> Dàn số chốt tự động lúc 17:45 ngày ${date} theo chuẩn 100% Strict Point-In-Time.
                    </span>
                    <span class="font-mono text-slate-400">Tỷ lệ cược XSMB: 1 ăn 84 (X2 = 168M, X1 = 84M)</span>
                </div>
            </div>
        `;
    }

    /**
     * Gắn sự kiện tương tác cho các hàng trong bảng sổ cái đối soát
     */
    function attachLedgerEventListeners() {
        const tbody = document.getElementById('ledgerTableBody');
        if (!tbody) return;

        // Toggle expand hàng chính
        tbody.querySelectorAll('.ledger-main-row').forEach(rowEl => {
            rowEl.addEventListener('click', (e) => {
                // Nếu click vào nút copy thì không toggle
                if (e.target.closest('.btn-copy-day-slip')) return;
                const d = rowEl.getAttribute('data-date');
                if (!d) return;
                if (expandedLedgerDates.has(d)) {
                    expandedLedgerDates.delete(d);
                } else {
                    expandedLedgerDates.add(d);
                }
                renderLedgerTable();
            });
        });

        // Chuyển tab chiến lược bên trong phiếu cược chi tiết
        tbody.querySelectorAll('.btn-slip-strat').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const d = btn.getAttribute('data-date');
                const strat = btn.getAttribute('data-strat');
                if (d && strat) {
                    activeStratInSlip[d] = strat;
                    renderLedgerTable();
                }
            });
        });

        // Nút sao chép dàn đánh trong phiếu cược
        tbody.querySelectorAll('.btn-copy-day-slip').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = btn.getAttribute('data-text');
                if (text) {
                    window.copyToClipboard(text, btn);
                }
            });
        });
    }

    /**
     * Hiển thị sổ cái đối soát lịch sử chi tiết
     */
    function renderLedgerTable() {
        const tbody = document.getElementById('ledgerTableBody');
        const countBadge = document.getElementById('ledgerCountBadge');
        const pagingInfo = document.getElementById('ledgerPagingInfo');
        const allList = currentReport?.settledLedger || [];
        const filtered = getFilteredLedgerRows();

        if (countBadge) {
            countBadge.textContent = `${filtered.length} / ${allList.length} Kỳ Đánh`;
        }
        if (pagingInfo) {
            pagingInfo.textContent = `Hiển thị ${Math.min(ledgerLimit, filtered.length)} / ${filtered.length} ngày (Tổng ${allList.length} kỳ đối soát)`;
        }

        const elAll = document.getElementById('countGovFilterAll');
        const elSkill = document.getElementById('countGovFilterSkill');
        const elNormal = document.getElementById('countGovFilterNormal');
        if (elAll) elAll.textContent = allList.length;
        if (elSkill) elSkill.textContent = allList.filter(r => r.governor?.isSkill).length;
        if (elNormal) elNormal.textContent = allList.filter(r => !r.governor?.isSkill).length;

        const slice = filtered.slice(0, ledgerLimit);

        if (slice.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-slate-400">Không tìm thấy ngày nào khớp với tiêu chí lọc.</td></tr>`;
            return;
        }

        const formatHitBadge = (res) => {
            if (!res) return '<span class="text-slate-300">-</span>';
            if (res.isX2) return '<span class="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">ĂN X2 (+168M)</span>';
            if (res.isX1) return '<span class="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-100 text-indigo-900 border border-indigo-300 shadow-2xs">ĂN X1 (+84M)</span>';
            return '<span class="px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-400">Trượt</span>';
        };

        let html = '';
        slice.forEach((row, idx) => {
            const act = row.actualSpecial;
            const predForm = row.predForm;
            const triB = row.triCore?.paB;
            const triD = row.triCore?.paD;
            const ss17 = row.sweetSpot?.s17_base;
            const ss15 = row.sweetSpot?.s15_base;
            const isExpanded = expandedLedgerDates.has(row.date);

            const accumM = row.accumProfitM?.tri_paB ?? 0;
            const accumClass = accumM >= 0 ? 'text-emerald-700 font-black' : 'text-rose-600 font-bold';

            html += `
                <tr class="ledger-main-row hover:bg-amber-50/40 transition-colors cursor-pointer ${isExpanded ? 'bg-amber-50/30' : ''}" data-date="${row.date}">
                    <td class="p-3 text-center text-slate-400 font-mono text-xs">${idx + 1}</td>
                    <td class="p-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                        <div class="flex items-center gap-1.5">
                            <span>${row.date}</span>
                            ${row.governor?.isSkill 
                                ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-500 text-white shadow-xs" title="Ngày hội tụ mạnh: DÙNG SKILL">🔥 SKILL</span>'
                                : '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-700" title="Ngày bình thường: BẮN THƯỜNG">🛡️ THƯỜNG</span>'}
                        </div>
                    </td>
                    <td class="p-3 text-center">
                        <span class="inline-flex items-center justify-center h-7 w-7 rounded-lg font-mono font-black text-xs bg-slate-900 text-white shadow-2xs">
                            ${act}
                        </span>
                    </td>
                    <td class="p-3 text-center">
                        <span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700 font-mono">${predForm}</span>
                    </td>
                    <td class="p-3 text-center">${formatHitBadge(triB)}</td>
                    <td class="p-3 text-center">${formatHitBadge(triD)}</td>
                    <td class="p-3 text-center">${formatHitBadge(ss17)}</td>
                    <td class="p-3 text-center">${formatHitBadge(ss15)}</td>
                    <td class="p-3 text-right font-mono ${accumClass}">
                        ${accumM >= 0 ? '+' : ''}${accumM}M
                    </td>
                    <td class="p-3 text-center">
                        <button type="button" class="btn-toggle-slip px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 mx-auto shadow-2xs ${isExpanded ? 'bg-slate-800 text-white' : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'}" data-date="${row.date}">
                            <i class="bi ${isExpanded ? 'bi-chevron-up' : 'bi-eye'}"></i>
                            <span>${isExpanded ? 'Đóng' : 'Chi Tiết'}</span>
                        </button>
                    </td>
                </tr>
            `;

            if (isExpanded) {
                html += `
                    <tr class="ledger-detail-row bg-slate-50/50" data-detail-date="${row.date}">
                        <td colspan="10" class="p-2 sm:p-4">
                            ${renderDetailSlipHtml(row)}
                        </td>
                    </tr>
                `;
            }
        });

        tbody.innerHTML = html;

        // Cập nhật trạng thái nút xem thêm
        const loadMoreBtn = document.getElementById('btnLoadMoreLedger');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = slice.length >= filtered.length ? 'none' : 'block';
        }
        const loadAllBottomBtn = document.getElementById('btnLoadAllLedgerBottom');
        if (loadAllBottomBtn) {
            loadAllBottomBtn.style.display = slice.length >= filtered.length ? 'none' : 'block';
        }

        // Cập nhật text nút Toggle All
        const btnToggleAll = document.getElementById('btnToggleAllLedger');
        const textToggleAll = document.getElementById('textToggleAllLedger');
        const iconToggleAll = document.getElementById('iconToggleAllLedger');
        if (btnToggleAll && textToggleAll && iconToggleAll) {
            const visibleDates = slice.map(r => r.date);
            const isAllExp = visibleDates.length > 0 && visibleDates.every(d => expandedLedgerDates.has(d));
            textToggleAll.textContent = isAllExp ? 'Thu Gọn Tất Cả' : 'Mở Rộng Tất Cả Phiếu';
            iconToggleAll.className = isAllExp ? 'bi bi-arrows-collapse' : 'bi bi-arrows-expand';
        }

        attachLedgerEventListeners();
    }

    /**
     * Đăng ký sự kiện
     */

    /**
     * Hiển thị dàn số Lô chiến lược đang chọn hôm nay
     */
    function renderActiveLotoStrategy() {
        const stratDef = LOTO_STRATEGY_DEFINITIONS[activeLotoStrategy];
        if (!stratDef) return;

        const container = document.getElementById('todayLotoStrategyContainer');
        if (!container) return;
        const data = stratDef.getData(currentReport);

        const x2List = data.x2 || [];
        const x1List = data.x1 || [];
        const isTiered = stratDef.type === 'tiered';
        const allNumbers = isTiered ? [...x2List, ...x1List] : (data.numbers || x1List);
        const allText = allNumbers.join(', ');
        const x2Text = x2List.join(', ');
        const x1Text = x1List.join(', ');

        const x2StakeK = x2List.length * 4400; // 4,400K (44K/điểm)
        const x1StakeK = x1List.length * 2200; // 2,200K (22K/điểm)
        const totalStakeK = x2StakeK + x1StakeK;
        const totalStakeM = (totalStakeK / 1000).toFixed(1);

        const renderBall = (num, tier = 'x1') => {
            const isX2 = tier === 'x2';
            const badgeBg = isX2
                ? 'bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 text-white shadow-md'
                : 'bg-emerald-600 text-white shadow-xs';
            return `
                <div class="flex flex-col items-center gap-1">
                    <span class="inline-flex items-center justify-center h-11 w-11 rounded-2xl ${badgeBg} font-mono font-black text-lg tracking-tight badge-num">
                        ${num}
                    </span>
                    <span class="text-[10px] font-bold ${isX2 ? 'text-amber-800' : 'text-emerald-800'}">${isX2 ? 'X2 (44K)' : 'X1 (22K)'}</span>
                </div>
            `;
        };

        let numbersDisplay = '';
        if (isTiered) {
            numbersDisplay = `
                <div class="space-y-4">
                    <!-- Nhóm VIP X2 -->
                    <div class="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                        <div class="flex items-center justify-between mb-3">
                            <span class="text-xs font-black text-amber-900 flex items-center gap-1.5 uppercase tracking-wide">
                                👑 Nhóm VIP Hỏa Lực X2 (${x2List.length} số) — Cược 44K/số (Ăn 16,000K/nháy)
                            </span>
                            <button onclick="window.copyToClipboard('${x2Text}', this)" class="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-200/80 hover:bg-amber-300 text-amber-950 transition cursor-pointer">
                                <i class="bi bi-clipboard"></i> Chép Dàn X2
                            </button>
                        </div>
                        <div class="flex flex-wrap gap-2.5">
                            ${x2List.length > 0 ? x2List.map(n => renderBall(n, 'x2')).join('') : '<span class="text-xs text-slate-400">Không có số nào ở tầng X2</span>'}
                        </div>
                    </div>

                    <!-- Nhóm Lót X1 -->
                    <div class="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
                        <div class="flex items-center justify-between mb-3">
                            <span class="text-xs font-black text-indigo-900 flex items-center gap-1.5 uppercase tracking-wide">
                                ⭐ Nhóm Lót Bảo Hiểm X1 (${x1List.length} số) — Cược 22K/số (Ăn 8,000K/nháy)
                            </span>
                            <button onclick="window.copyToClipboard('${x1Text}', this)" class="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-200/80 hover:bg-indigo-300 text-indigo-950 transition cursor-pointer">
                                <i class="bi bi-clipboard"></i> Chép Dàn X1
                            </button>
                        </div>
                        <div class="flex flex-wrap gap-2.5">
                            ${x1List.length > 0 ? x1List.map(n => renderBall(n, 'x1')).join('') : '<span class="text-xs text-slate-400">Không có số nào ở tầng X1</span>'}
                        </div>
                    </div>
                </div>
            `;
        } else {
            numbersDisplay = `
                <div class="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-xs font-black text-emerald-900 flex items-center gap-1.5 uppercase tracking-wide">
                            🎯 Dàn Cược Phẳng Flat (${allNumbers.length} số) — Cược 22K/số (Ăn 8,000K/nháy)
                        </span>
                        <button onclick="window.copyToClipboard('${allText}', this)" class="px-3 py-1.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-xs cursor-pointer">
                            <i class="bi bi-clipboard"></i> Chép Toàn Bộ Dàn
                        </button>
                    </div>
                    <div class="flex flex-wrap gap-3">
                        ${allNumbers.map(n => renderBall(n, 'x1')).join('')}
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 space-y-6">
                <!-- Header Card -->
                <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-4 border-b border-slate-200/80">
                    <div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <h3 class="text-base font-black text-slate-900">${stratDef.name}</h3>
                            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black border ${stratDef.badgeClass}">
                                ${stratDef.badge}
                            </span>
                        </div>
                        <p class="text-xs text-slate-600 mt-1">${stratDef.desc}</p>
                    </div>

                    <!-- NÚT COPY THAO TÁC THƯỜNG CHO LÔ -->
                    <div class="flex items-center gap-2 flex-wrap">
                        <button onclick="window.copyLotoBettingSyntax('${activeLotoStrategy}', this)" class="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white px-3.5 py-2 text-xs font-black shadow-xs transition-all cursor-pointer">
                            <i class="bi bi-chat-quote-fill"></i> Copy Cú Pháp Lô Gửi Thầu / Zalo
                        </button>
                        <button onclick="window.copyToClipboard('${allText}', this)" class="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 text-xs font-bold shadow-xs transition-all cursor-pointer">
                            <i class="bi bi-clipboard"></i> Chép Số (${allNumbers.length}s)
                        </button>
                    </div>
                </div>

                ${data.governor ? `
                <!-- Hộp Tác Chiến Điều Chuyển Hôm Nay -->
                <div class="rounded-2xl p-4.5 ${data.governor.isSkill ? 'bg-gradient-to-r from-cyan-50 via-blue-50 to-cyan-50 border border-cyan-200 shadow-sm text-slate-900' : 'bg-slate-100 border border-slate-300 text-slate-900'}">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 mb-2 border-b ${data.governor.isSkill ? 'border-cyan-200' : 'border-slate-300'}">
                        <div class="flex items-center gap-2">
                            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${data.governor.isSkill ? 'bg-cyan-500 text-slate-950 animate-pulse' : 'bg-slate-700 text-white'}">
                                ${data.governor.statusBadge}
                            </span>
                            <span class="text-xs font-black text-slate-900 uppercase">CHẾ ĐỘ LÔ: ${data.governor.mode}</span>
                        </div>
                    </div>
                    <p class="text-xs text-slate-700 leading-relaxed">${data.governor.reason}</p>
                    <div class="mt-2.5 pt-2 border-t ${data.governor.isSkill ? 'border-cyan-100' : 'border-slate-200'} flex items-start gap-1.5 text-xs font-bold text-slate-900">
                        <i class="bi bi-crosshair ${data.governor.isSkill ? 'text-cyan-600' : 'text-slate-700'} mt-0.5 shrink-0"></i>
                        <span>${data.governor.action}</span>
                    </div>
                </div>
                ` : ''}

                <!-- Thống kê vốn & giải thưởng của dàn -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="rounded-xl bg-white border border-slate-200 p-3">
                        <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Quy mô dàn</span>
                        <span class="text-base font-black text-slate-900 font-mono">${allNumbers.length} số</span>
                    </div>
                    <div class="rounded-xl bg-white border border-slate-200 p-3">
                        <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Tổng vốn cược</span>
                        <span class="text-base font-black text-slate-900 font-mono">${totalStakeM}M VNĐ</span>
                    </div>
                    <div class="rounded-xl bg-white border border-slate-200 p-3">
                        <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Nổ 1 Nháy</span>
                        <span class="text-base font-black text-emerald-700 font-mono">+8M / +16M</span>
                    </div>
                    <div class="rounded-xl bg-white border border-slate-200 p-3">
                        <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Nổ 2 Nháy</span>
                        <span class="text-base font-black text-emerald-700 font-mono">+16M / +32M</span>
                    </div>
                </div>

                <!-- Dàn số chi tiết -->
                ${numbersDisplay}
            </div>
        `;
    }

    /**
     * Hiển thị bảng so sánh hiệu năng các phương án Lô năm 2026
     */
    function renderLotoSummaryTable() {
        const tbody = document.getElementById('lotoSummaryTableBody');
        const titleEl = document.getElementById('lotoSummaryTableTitle');
        const subTitleEl = document.getElementById('lotoSummaryTableSubtitle');
        if (!tbody || !currentReport?.loto) return;

        const is315 = activeLotoHorizon === '315';
        const list = is315 ? (currentReport.loto.summaries315 || []) : (currentReport.loto.summaries299 || []);

        if (titleEl) {
            titleEl.textContent = `BẢNG SO SÁNH HIỆU NĂNG CÁC PHƯƠNG ÁN LÔ NĂM 2026 (${is315 ? '315 KỲ QUAY LIVE' : '299 KỲ CHUẨN'})`;
        }
        if (subTitleEl) {
            subTitleEl.textContent = is315
                ? 'Toàn bộ 315 ngày cập nhật thực tế từ 01/01/2026 đến 15/11/2026 · 1 điểm 22K (2.2M) ăn 80K (8M/nháy)'
                : 'Tập mẫu nghiên cứu chuẩn mực từ 01/01/2026 đến 30/10/2026 · 1 điểm 22K (2.2M) ăn 80K (8M/nháy)';
        }

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="p-6 text-center text-slate-400">Không có dữ liệu đối chiếu Lô.</td></tr>';
            return;
        }

        let html = '';
        list.forEach(item => {
            const isProfit = item.profitM > 0;
            const profitClass = isProfit ? 'text-emerald-700 font-black' : (item.profitM === 0 ? 'text-slate-600 font-bold' : 'text-slate-500 font-medium');
            const roiClass = item.roi > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700';
            const typeBadge = item.type === 'tiered'
                ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-200 whitespace-nowrap">Phân Tầng X2/X1</span>'
                : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200 whitespace-nowrap">Đánh Phẳng</span>';

            html += `
                <tr class="hover:bg-emerald-50/30 transition-colors">
                    <td class="p-3">
                        <div class="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                            ${item.name}
                            ${item.badge ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">${item.badge}</span>` : ''}
                        </div>
                        <div class="text-[11px] text-slate-500 mt-0.5">${item.desc}</div>
                    </td>
                    <td class="p-3 text-center">${typeBadge}</td>
                    <td class="p-3 text-center font-mono text-xs">${item.days}</td>
                    <td class="p-3 text-center font-mono text-xs">
                        <strong>${item.winDays}</strong> / ${item.days}
                        <span class="text-slate-500 font-normal block text-[11px]">(${item.winRate}%)</span>
                    </td>
                    <td class="p-3 text-center font-mono text-xs font-bold text-slate-800">
                        ${item.totalHits} nháy
                        <span class="text-slate-500 font-normal block text-[11px]">(${item.hitsPerDay} n/kỳ)</span>
                    </td>
                    <td class="p-3 text-right font-mono text-xs text-slate-600">${item.stakeM.toLocaleString('vi-VN')}M</td>
                    <td class="p-3 text-right font-mono text-xs text-slate-600">${item.payoutM.toLocaleString('vi-VN')}M</td>
                    <td class="p-3 text-right font-mono text-sm ${profitClass}">
                        ${item.profitFormatted}
                    </td>
                    <td class="p-3 text-right">
                        <span class="px-2 py-0.5 rounded font-mono text-xs font-black ${roiClass}">
                            ${item.roiFormatted}
                        </span>
                    </td>
                    <td class="p-3 text-center font-mono text-xs text-rose-600 font-bold">${item.maxLossStreak} kỳ</td>
                    <td class="p-3 text-xs font-semibold text-slate-700 max-w-xs">${item.verdict}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    /**
     * Lọc danh sách dòng sổ cái Lô
     */
    function getFilteredLotoLedgerRows() {
        let list = currentReport?.loto?.settledLedger || [];

        // Lọc Tác Chiến Lô: SKILL vs THƯỜNG
        if (lotoLedgerGovFilter === 'SKILL') {
            list = list.filter(r => r.consensus?.isConsensusTop1);
        } else if (lotoLedgerGovFilter === 'NORMAL') {
            list = list.filter(r => !r.consensus?.isConsensusTop1);
        }

        // Lọc tháng
        if (lotoLedgerMonthFilter !== 'ALL') {
            list = list.filter(r => r.date && r.date.startsWith(lotoLedgerMonthFilter));
        }

        // Lọc kết quả
        if (lotoLedgerOutcomeFilter === 'TRI_TOP1_WIN') {
            list = list.filter(r => r.triCore?.top1?.isWin);
        } else if (lotoLedgerOutcomeFilter === 'PENTA_PARITY_WIN') {
            list = list.filter(r => r.ai5Ensemble?.parity_top6?.isWin);
        } else if (lotoLedgerOutcomeFilter === 'PENTA_TIERED_WIN') {
            list = list.filter(r => r.ai5Ensemble?.tiered_top4?.isWin);
        } else if (lotoLedgerOutcomeFilter === 'TRI_TOP7_WIN') {
            list = list.filter(r => r.triCore?.top7?.isWin);
        } else if (lotoLedgerOutcomeFilter === 'PENTA_TOP7_WIN') {
            list = list.filter(r => r.ai5Ensemble?.top7?.isWin);
        } else if (lotoLedgerOutcomeFilter === 'LOSS_ALL') {
            list = list.filter(r => !r.triCore?.top1?.isWin && !r.ai5Ensemble?.parity_top6?.isWin && !r.ai5Ensemble?.tiered_top4?.isWin);
        }

        // Tìm kiếm
        if (lotoLedgerSearchVal) {
            const query = lotoLedgerSearchVal.toLowerCase();
            list = list.filter(r => {
                if (r.date && r.date.includes(query)) return true;
                if (r.actual27 && r.actual27.some(n => String(n).includes(query))) return true;
                if (r.predForm && r.predForm.toLowerCase().includes(query)) return true;
                return false;
            });
        }

        return list;
    }

    /**
     * Hiển thị bảng sổ cái đối soát Lô chi tiết
     */
    function renderLotoLedgerTable() {
        const tbody = document.getElementById('lotoLedgerTableBody');
        const countBadge = document.getElementById('lotoLedgerCountBadge');
        const pagingInfo = document.getElementById('lotoLedgerPagingInfo');
        if (!tbody || !currentReport?.loto) return;

        const allList = currentReport.loto.settledLedger || [];
        const filtered = getFilteredLotoLedgerRows();

        if (countBadge) {
            countBadge.textContent = `${filtered.length} / ${allList.length} Kỳ Đánh`;
        }
        if (pagingInfo) {
            pagingInfo.textContent = `Hiển thị ${Math.min(lotoLedgerLimit, filtered.length)} / ${filtered.length} ngày (Tổng ${allList.length} kỳ đối soát Lô)`;
        }

        const elLotoAll = document.getElementById('countLotoGovFilterAll');
        const elLotoSkill = document.getElementById('countLotoGovFilterSkill');
        const elLotoNormal = document.getElementById('countLotoGovFilterNormal');
        if (elLotoAll) elLotoAll.textContent = allList.length;
        if (elLotoSkill) elLotoSkill.textContent = allList.filter(r => r.consensus?.isConsensusTop1).length;
        if (elLotoNormal) elLotoNormal.textContent = allList.filter(r => !r.consensus?.isConsensusTop1).length;

        const slice = filtered.slice(0, lotoLedgerLimit);

        if (slice.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="p-8 text-center text-slate-400">Không tìm thấy ngày nào khớp với tiêu chí lọc Lô.</td></tr>';
            return;
        }

        const formatLotoHitBadge = (res) => {
            if (!res) return '<span class="text-slate-300">-</span>';
            if (res.isWin) {
                const profitK = res.profitK || 0;
                return `<span class="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs">🔥 ĂN ${res.totalHits}N (+ ${Math.round(profitK/1000)}M)</span>`;
            }
            if (res.totalHits > 0) {
                return `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">Ăn ${res.totalHits}n</span>`;
            }
            return '<span class="px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-400">Trượt</span>';
        };

        let html = '';
        slice.forEach((row, idx) => {
            const d = row.date;
            const predForm = row.predForm;
            const act27 = row.actual27 || [];
            const specialNum = act27[0] || '--';
            const isExpanded = expandedLotoLedgerDates.has(d);

            const tri1 = row.triCore?.top1;
            const pentaParity = row.ai5Ensemble?.parity_top6;
            const pentaTiered = row.ai5Ensemble?.tiered_top4;
            const tri7 = row.triCore?.top7;
            const penta7 = row.ai5Ensemble?.top7;

            const accumM = row.accumProfitM?.tri_top1 ?? 0;
            const accumClass = accumM >= 0 ? 'text-emerald-700 font-black' : 'text-rose-600 font-bold';

            html += `
                <tr class="loto-ledger-main-row hover:bg-emerald-50/40 transition-colors cursor-pointer ${isExpanded ? 'bg-emerald-50/30' : ''}" data-loto-date="${d}">
                    <td class="p-3 text-center text-slate-400 font-mono text-xs">${idx + 1}</td>
                    <td class="p-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                        <div class="flex items-center gap-1.5">
                            <span>${d}</span>
                            ${row.dynamicGovernor?.isSkill 
                                ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-black bg-cyan-500 text-slate-950 shadow-xs" title="Đồng thuận kép: DÙNG SKILL">🔥 SKILL</span>'
                                : '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-700" title="Bình thường: BẮN THƯỜNG">🛡️ THƯỜNG</span>'}
                        </div>
                    </td>
                    <td class="p-3 text-center">
                        <span class="inline-flex items-center justify-center h-7 w-7 rounded-lg font-mono font-black text-xs bg-slate-900 text-white shadow-2xs" title="Giải ĐB: ${specialNum}">
                            ${specialNum}
                        </span>
                    </td>
                    <td class="p-3 text-center">
                        <span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700 font-mono">${predForm}</span>
                    </td>
                    <td class="p-3 text-center">${formatLotoHitBadge(tri1)}</td>
                    <td class="p-3 text-center">${formatLotoHitBadge(pentaParity)}</td>
                    <td class="p-3 text-center">${formatLotoHitBadge(pentaTiered)}</td>
                    <td class="p-3 text-center font-mono text-xs font-bold text-slate-700">${tri7?.totalHits || 0} nháy</td>
                    <td class="p-3 text-center font-mono text-xs font-bold text-slate-700">${penta7?.totalHits || 0} nháy</td>
                    <td class="p-3 text-right font-mono ${accumClass}">
                        ${accumM >= 0 ? '+' : ''}${accumM}M
                    </td>
                    <td class="p-3 text-center">
                        <button type="button" class="btn-toggle-loto-slip px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 mx-auto shadow-2xs ${isExpanded ? 'bg-slate-800 text-white' : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'}" data-loto-date="${d}">
                            <i class="bi ${isExpanded ? 'bi-chevron-up' : 'bi-eye'}"></i>
                            <span>${isExpanded ? 'Đóng' : 'Chi Tiết'}</span>
                        </button>
                    </td>
                </tr>
            `;

            if (isExpanded) {
                html += `
                    <tr class="loto-ledger-detail-row bg-slate-50/50" data-loto-detail-date="${d}">
                        <td colspan="11" class="p-2 sm:p-4">
                            ${renderLotoDetailSlipHtml(row)}
                        </td>
                    </tr>
                `;
            }
        });

        tbody.innerHTML = html;

        // Cập nhật trạng thái nút xem thêm
        const loadMoreBtn = document.getElementById('btnLoadMoreLotoLedger');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = slice.length >= filtered.length ? 'none' : 'block';
        }
        const loadAllBottomBtn = document.getElementById('btnLoadAllLotoLedgerBottom');
        if (loadAllBottomBtn) {
            loadAllBottomBtn.style.display = slice.length >= filtered.length ? 'none' : 'block';
        }

        // Cập nhật text nút Toggle All
        const btnToggleAll = document.getElementById('btnToggleAllLotoLedger');
        const textToggleAll = document.getElementById('textToggleAllLotoLedger');
        const iconToggleAll = document.getElementById('iconToggleAllLotoLedger');
        if (btnToggleAll && textToggleAll && iconToggleAll) {
            const visibleDates = slice.map(r => r.date);
            const isAllExp = visibleDates.length > 0 && visibleDates.every(d => expandedLotoLedgerDates.has(d));
            textToggleAll.textContent = isAllExp ? 'Thu Gọn Tất Cả' : 'Mở Rộng Tất Cả Phiếu Lô';
            iconToggleAll.className = isAllExp ? 'bi bi-arrows-collapse' : 'bi bi-arrows-expand';
        }

        attachLotoLedgerEventListeners();
    }

    /**
     * Render HTML phiếu cược Lô tương tác cho 1 ngày
     */
    function renderLotoDetailSlipHtml(row) {
        const d = row.date;
        const curStrat = activeLotoStratInSlip[d] || 'tri_top1';
        const pForm = row.predForm || 'LL';
        const actual27 = row.actual27 || [];

        const stratMeta = {
            tri_top1: { name: '🌟 TriCore Top 1 (Bạch Thủ)', eval: row.triCore?.top1, type: 'flat' },
            penta_parity_top6: { name: '👑 5 AI Top 6 Phân Tầng Chẵn Lẻ', eval: row.ai5Ensemble?.parity_top6, type: 'tiered' },
            penta_tiered_top4: { name: '🛡️ 5 AI Top 4 VIP', eval: row.ai5Ensemble?.tiered_top4, type: 'tiered' },
            tri_top7: { name: '🎯 TriCore Top 7 Flat', eval: row.triCore?.top7, type: 'flat' },
            penta_top7: { name: '💎 5 AI Top 7 Flat', eval: row.ai5Ensemble?.top7, type: 'flat' },
            tri_top2: { name: '🌟 TriCore Top 2 Song Thủ', eval: row.triCore?.top2, type: 'flat' }
        };

        const activeObj = stratMeta[curStrat] || stratMeta.tri_top1;
        const ev = activeObj.eval || { x2Details: [], x1Details: [], totalHits: 0, stakeK: 0, payoutK: 0, profitK: 0, isWin: false };

        const allNumbers = [...(ev.x2 || []), ...(ev.x1 || [])];
        const allText = allNumbers.join(', ');

        const profitClass = ev.profitK > 0 ? 'text-emerald-700 font-black' : (ev.profitK === 0 ? 'text-slate-600 font-bold' : 'text-rose-600 font-bold');
        const profitSign = ev.profitK >= 0 ? '+' : '';

        // Tabs
        let tabsHtml = '';
        Object.keys(stratMeta).forEach(k => {
            const isAct = k === curStrat;
            const meta = stratMeta[k];
            const isWin = meta.eval?.isWin;
            const hits = meta.eval?.totalHits || 0;
            const badgeClass = isAct
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200';
            const winIcon = isWin ? '🔥' : (hits > 0 ? '⭐' : '');
            tabsHtml += `
                <button type="button" class="btn-loto-slip-strat px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${badgeClass}" data-date="${d}" data-strat="${k}">
                    <span>${meta.name}</span>
                    ${winIcon ? `<span class="text-[10px]">${winIcon} ${hits}n</span>` : ''}
                </button>
            `;
        });

        // Balls generator
        const renderBalls = (details, label, rateText) => {
            if (!details || details.length === 0) return '';
            return `
                <div class="space-y-1.5">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-extrabold text-slate-800 uppercase tracking-wide">${label}</span>
                        <span class="text-[11px] text-slate-500 font-medium">(${rateText})</span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        ${details.map(item => {
                            const isNổ = item.hits > 0;
                            const hitBadge = isNổ
                                ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-black bg-emerald-500 text-white shadow-xs">🔥 ${item.hits} NHÁY</span>`
                                : `<span class="text-[10px] text-slate-400">0 nháy</span>`;
                            const cardBg = isNổ ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/30' : 'bg-white border-slate-200';
                            return `
                                <div class="flex flex-col items-center justify-center p-2 rounded-xl border ${cardBg} min-w-[56px] shadow-2xs">
                                    <span class="font-mono text-base font-black ${isNổ ? 'text-emerald-950' : 'text-slate-800'}">${item.num}</span>
                                    <div class="mt-0.5">${hitBadge}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        };

        const x2Section = ev.x2Details?.length ? renderBalls(ev.x2Details, 'Hạng Tầng X2 (VIP 44K/con)', 'Cược 44K/số · Ăn 16,000K/nháy') : '';
        const x1Section = ev.x1Details?.length ? renderBalls(ev.x1Details, ev.x2Details?.length ? 'Hạng Tầng X1 (Lót 22K/con)' : 'Dàn Cược Phẳng 22K/con', 'Cược 22K/số · Ăn 8,000K/nháy') : '';

        // 27 giải mở thưởng thực tế (dạng mini-pills)
        const actPills = actual27.map((n, i) => {
            const isSpecial = i === 0;
            const isBetMatch = allNumbers.includes(n);
            let pillClass = 'bg-slate-100 text-slate-700';
            if (isSpecial) pillClass = 'bg-slate-900 text-white font-black';
            if (isBetMatch) pillClass = 'bg-emerald-600 text-white font-black ring-2 ring-emerald-300';
            return `<span class="px-1.5 py-0.5 rounded font-mono text-xs ${pillClass}" title="${isSpecial ? 'Giải ĐB' : 'Giải Lô'}">${n}</span>`;
        }).join(' ');

        return `
            <div class="rounded-2xl border border-emerald-200 bg-white p-4 space-y-4 shadow-sm">
                <!-- Top Tabs -->
                <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div class="flex flex-wrap items-center gap-1.5">
                        <span class="text-xs font-bold text-slate-500 mr-1"><i class="bi bi-gear-wide-connected"></i> Xem Cấu Hình:</span>
                        ${tabsHtml}
                    </div>
                    <button type="button" class="btn-copy-loto-slip px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer" data-text="${allText}">
                        <i class="bi bi-clipboard-check"></i> Sao Chép Dàn Ngày Này
                    </button>
                </div>

                <!-- Number Balls Display -->
                <div class="space-y-3">
                    ${x2Section}
                    ${x1Section}
                </div>

                <!-- 27 giải mở thưởng thực tế -->
                <div class="pt-3 border-t border-slate-100">
                    <span class="text-xs font-bold text-slate-500 block mb-1.5"><i class="bi bi-trophy"></i> 27 Giải Mở Thưởng Thực Tế Ngày ${d}:</span>
                    <div class="flex flex-wrap gap-1">
                        ${actPills}
                    </div>
                </div>

                <!-- Bottom Summary Ledger of this bet -->
                <div class="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div class="flex items-center gap-4">
                        <span class="text-slate-600">Tổng cược: <strong class="text-slate-900 font-mono">${(ev.stakeK || 0).toLocaleString('vi-VN')}K</strong></span>
                        <span class="text-slate-600">Tổng thưởng (${ev.totalHits || 0} nháy): <strong class="text-slate-900 font-mono">${(ev.payoutK || 0).toLocaleString('vi-VN')}K</strong></span>
                        <span class="text-slate-600">Lãi ròng: <strong class="font-mono ${profitClass}">${profitSign}${(ev.profitK || 0).toLocaleString('vi-VN')}K</strong></span>
                    </div>
                    <div>
                        ${ev.isWin ? '<span class="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">✅ KỲ NÀY CÓ LÃI</span>' : (ev.totalHits > 0 ? '<span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">⚠️ ĂN NHÁY NHƯNG ÂM VỐN NHẸ</span>' : '<span class="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 bg-slate-100">❌ KỲ NÀY TRƯỢT</span>')}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Gắn sự kiện cho bảng sổ cái Lô
     */
    function attachLotoLedgerEventListeners() {
        const tbody = document.getElementById('lotoLedgerTableBody');
        if (!tbody) return;

        tbody.querySelectorAll('.loto-ledger-main-row').forEach(tr => {
            tr.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                const d = tr.getAttribute('data-loto-date');
                if (!d) return;
                if (expandedLotoLedgerDates.has(d)) {
                    expandedLotoLedgerDates.delete(d);
                } else {
                    expandedLotoLedgerDates.add(d);
                }
                renderLotoLedgerTable();
            });
        });

        tbody.querySelectorAll('.btn-toggle-loto-slip').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const d = btn.getAttribute('data-loto-date');
                if (!d) return;
                if (expandedLotoLedgerDates.has(d)) {
                    expandedLotoLedgerDates.delete(d);
                } else {
                    expandedLotoLedgerDates.add(d);
                }
                renderLotoLedgerTable();
            });
        });

        tbody.querySelectorAll('.btn-loto-slip-strat').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const d = btn.getAttribute('data-date');
                const strat = btn.getAttribute('data-strat');
                if (d && strat) {
                    activeLotoStratInSlip[d] = strat;
                    renderLotoLedgerTable();
                }
            });
        });

        tbody.querySelectorAll('.btn-copy-loto-slip').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = btn.getAttribute('data-text');
                if (text) {
                    window.copyToClipboard(text, btn);
                }
            });
        });
    }

    function setupEvents() {
        // 0. Chuyển đổi chuyên đề ĐỀ TINH GỌN vs LÔ TINH GỌN
        const btnMasterDe = document.getElementById('btnMasterModeDe');
        const btnMasterLo = document.getElementById('btnMasterModeLo');
        const secDe = document.getElementById('deSectionContainer');
        const secLo = document.getElementById('lotoSectionContainer');

        function switchMasterMode(mode) {
            activeMasterMode = mode;
            if (mode === 'de') {
                btnMasterDe?.classList.add('active', 'bg-white', 'text-slate-900', 'shadow-md', 'border', 'border-slate-200/80');
                btnMasterDe?.classList.remove('text-slate-600');
                btnMasterLo?.classList.remove('active', 'bg-white', 'text-slate-900', 'shadow-md', 'border', 'border-slate-200/80');
                btnMasterLo?.classList.add('text-slate-600');
                if (secDe) secDe.classList.remove('hidden');
                if (secLo) secLo.classList.add('hidden');
            } else {
                btnMasterLo?.classList.add('active', 'bg-white', 'text-slate-900', 'shadow-md', 'border', 'border-slate-200/80');
                btnMasterLo?.classList.remove('text-slate-600');
                btnMasterDe?.classList.remove('active', 'bg-white', 'text-slate-900', 'shadow-md', 'border', 'border-slate-200/80');
                btnMasterDe?.classList.add('text-slate-600');
                if (secDe) secDe.classList.add('hidden');
                if (secLo) secLo.classList.remove('hidden');
                renderActiveLotoStrategy();
                renderLotoSummaryTable();
                renderLotoLedgerTable();
            }
            renderTacticalBanner();
        }

        btnMasterDe?.addEventListener('click', () => switchMasterMode('de'));
        btnMasterLo?.addEventListener('click', () => switchMasterMode('lo'));

        // Chuyển mốc thời gian kiểm định Lô (299 kỳ chuẩn vs 315 kỳ toàn bộ)
        document.getElementById('btnLotoHorizon299')?.addEventListener('click', () => {
            activeLotoHorizon = '299';
            const b299 = document.getElementById('btnLotoHorizon299');
            const b315 = document.getElementById('btnLotoHorizon315');
            b299?.classList.add('bg-white', 'text-emerald-900', 'shadow-xs', 'border', 'border-emerald-200', 'font-black');
            b299?.classList.remove('text-slate-600', 'font-semibold');
            b315?.classList.remove('bg-white', 'text-emerald-900', 'shadow-xs', 'border', 'border-emerald-200', 'font-black');
            b315?.classList.add('text-slate-600', 'font-semibold');
            renderLotoSummaryTable();
        });

        document.getElementById('btnLotoHorizon315')?.addEventListener('click', () => {
            activeLotoHorizon = '315';
            const b299 = document.getElementById('btnLotoHorizon299');
            const b315 = document.getElementById('btnLotoHorizon315');
            b315?.classList.add('bg-white', 'text-emerald-900', 'shadow-xs', 'border', 'border-emerald-200', 'font-black');
            b315?.classList.remove('text-slate-600', 'font-semibold');
            b299?.classList.remove('bg-white', 'text-emerald-900', 'shadow-xs', 'border', 'border-emerald-200', 'font-black');
            b299?.classList.add('text-slate-600', 'font-semibold');
            renderLotoSummaryTable();
        });

        // Bộ lọc tháng Lô
        document.getElementById('lotoLedgerMonthFilter')?.addEventListener('change', (e) => {
            lotoLedgerMonthFilter = e.target.value;
            lotoLedgerLimit = 30;
            renderLotoLedgerTable();
        });

        // Bộ lọc kết quả Lô
        document.getElementById('lotoLedgerOutcomeFilter')?.addEventListener('change', (e) => {
            lotoLedgerOutcomeFilter = e.target.value;
            lotoLedgerLimit = 30;
            renderLotoLedgerTable();
        });

        // Tìm kiếm sổ cái Lô
        document.getElementById('lotoLedgerSearchInput')?.addEventListener('input', (e) => {
            lotoLedgerSearchVal = e.target.value.trim();
            lotoLedgerLimit = 30;
            renderLotoLedgerTable();
        });

        // Nút mở rộng/thu gọn tất cả phiếu Lô
        document.getElementById('btnToggleAllLotoLedger')?.addEventListener('click', () => {
            const filtered = getFilteredLotoLedgerRows();
            const visible = filtered.slice(0, lotoLedgerLimit).map(r => r.date);
            const isAllExp = visible.length > 0 && visible.every(d => expandedLotoLedgerDates.has(d));
            if (isAllExp) {
                visible.forEach(d => expandedLotoLedgerDates.delete(d));
            } else {
                visible.forEach(d => expandedLotoLedgerDates.add(d));
            }
            renderLotoLedgerTable();
        });

        // Nút hiển thị toàn bộ 315 kỳ Lô
        const handleLotoShowAll = () => {
            lotoLedgerLimit = 9999;
            renderLotoLedgerTable();
        };
        document.getElementById('btnShowAllLotoLedger')?.addEventListener('click', handleLotoShowAll);
        document.getElementById('btnLoadAllLotoLedgerBottom')?.addEventListener('click', handleLotoShowAll);

        // Nút tải thêm 50 kỳ Lô
        document.getElementById('btnLoadMoreLotoLedger')?.addEventListener('click', () => {
            lotoLedgerLimit += 50;
            renderLotoLedgerTable();
        });

        // Chuyển tab chiến lược Đề nâng cao
        const tabBtns = document.querySelectorAll('#strategyTabs .strat-tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => {
                    b.classList.remove('active', 'bg-white', 'text-slate-900', 'shadow-2xs');
                    b.classList.add('text-slate-600');
                });
                btn.classList.add('active', 'bg-white', 'text-slate-900', 'shadow-2xs');
                btn.classList.remove('text-slate-600');

                activeStrategy = btn.getAttribute('data-strat');
                activeTacticalMode = 'custom';
                updateTacticalButtonsUI();
                renderActiveStrategy();
            });
        });

        // Chuyển tab chiến lược Lô nâng cao
        const lotoTabBtns = document.querySelectorAll('#lotoStrategyTabs .loto-strat-tab-btn');
        lotoTabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                lotoTabBtns.forEach(b => {
                    b.classList.remove('active', 'bg-white', 'text-slate-900', 'shadow-2xs');
                    b.classList.add('text-slate-600');
                });
                btn.classList.add('active', 'bg-white', 'text-slate-900', 'shadow-2xs');
                btn.classList.remove('text-slate-600');

                activeLotoStrategy = btn.getAttribute('data-loto-strat');
                activeLotoTacticalMode = 'custom';
                updateLotoTacticalButtonsUI();
                renderActiveLotoStrategy();
            });
        });

        // Bộ lọc Tác chiến nhanh trong Sổ cái Đề: Tất Cả / Skill / Bắn Thường
        document.querySelectorAll('#ledgerGovFilterGroup .ledger-gov-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#ledgerGovFilterGroup .ledger-gov-filter-btn').forEach(b => {
                    b.classList.remove('active', 'bg-white', 'text-slate-900', 'shadow-2xs');
                    b.classList.add('text-slate-600');
                });
                btn.classList.add('active', 'bg-white', 'text-slate-900', 'shadow-2xs');
                btn.classList.remove('text-slate-600');
                ledgerGovFilter = btn.getAttribute('data-gov-filter') || 'ALL';
                ledgerLimit = 30;
                renderLedgerTable();
            });
        });

        // Bộ lọc Tác chiến nhanh trong Sổ cái Lô: Tất Cả / Skill / Bắn Thường
        document.querySelectorAll('#lotoLedgerGovFilterGroup .loto-ledger-gov-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#lotoLedgerGovFilterGroup .loto-ledger-gov-filter-btn').forEach(b => {
                    b.classList.remove('active', 'bg-white', 'text-slate-900', 'shadow-2xs');
                    b.classList.add('text-slate-600');
                });
                btn.classList.add('active', 'bg-white', 'text-slate-900', 'shadow-2xs');
                btn.classList.remove('text-slate-600');
                lotoLedgerGovFilter = btn.getAttribute('data-loto-gov-filter') || 'ALL';
                lotoLedgerLimit = 30;
                renderLotoLedgerTable();
            });
        });

        // Chuyển mốc thời gian kiểm định (299 kỳ chuẩn vs 315 kỳ toàn bộ)
        document.getElementById('btnHorizon299')?.addEventListener('click', () => {
            activeHorizon = '299';
            renderSummaryTable();
        });

        document.getElementById('btnHorizon315')?.addEventListener('click', () => {
            activeHorizon = '315';
            renderSummaryTable();
        });

        // Nút Cập nhật dữ liệu
        document.getElementById('btnRefreshData')?.addEventListener('click', () => {
            const btn = document.getElementById('btnRefreshData');
            btn.innerHTML = '<i class="bi bi-arrow-clockwise animate-spin"></i> Đang tải...';
            btn.disabled = true;
            fetchReport(true).finally(() => {
                btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Cập Nhật Dữ Liệu';
                btn.disabled = false;
            });
        });

        // Bộ lọc tháng
        document.getElementById('ledgerMonthFilter')?.addEventListener('change', (e) => {
            ledgerMonthFilter = e.target.value;
            ledgerLimit = 30;
            renderLedgerTable();
        });

        // Bộ lọc kết quả
        document.getElementById('ledgerOutcomeFilter')?.addEventListener('change', (e) => {
            ledgerOutcomeFilter = e.target.value;
            ledgerLimit = 30;
            renderLedgerTable();
        });

        // Bộ lọc dạng Chẵn/Lẻ
        document.getElementById('ledgerParityFilter')?.addEventListener('change', (e) => {
            ledgerParityFilter = e.target.value;
            ledgerLimit = 30;
            renderLedgerTable();
        });

        // Tìm kiếm sổ cái
        document.getElementById('ledgerSearchInput')?.addEventListener('input', (e) => {
            ledgerSearchVal = e.target.value.trim();
            ledgerLimit = 30;
            renderLedgerTable();
        });

        // Nút mở rộng/thu gọn tất cả
        document.getElementById('btnToggleAllLedger')?.addEventListener('click', () => {
            const filtered = getFilteredLedgerRows();
            const visible = filtered.slice(0, ledgerLimit).map(r => r.date);
            const isAllExp = visible.length > 0 && visible.every(d => expandedLedgerDates.has(d));
            if (isAllExp) {
                visible.forEach(d => expandedLedgerDates.delete(d));
            } else {
                visible.forEach(d => expandedLedgerDates.add(d));
            }
            renderLedgerTable();
        });

        // Nút hiển thị toàn bộ 315 kỳ
        const handleShowAll = () => {
            ledgerLimit = 9999;
            renderLedgerTable();
        };
        document.getElementById('btnShowAllLedger')?.addEventListener('click', handleShowAll);
        document.getElementById('btnLoadAllLedgerBottom')?.addEventListener('click', handleShowAll);

        // Nút tải thêm 50 kỳ
        document.getElementById('btnLoadMoreLedger')?.addEventListener('click', () => {
            ledgerLimit += 50;
            renderLedgerTable();
        });
    }

    /**
     * Cập nhật giao diện thanh chuyển chế độ tác chiến Đề
     */
    function updateTacticalButtonsUI() {
        const btnNormal = document.getElementById('btnTacticalNormal');
        const btnSkill = document.getElementById('btnTacticalSkill');
        const btnAuto = document.getElementById('btnTacticalAuto');
        const activeBadge = document.getElementById('activeTacticalBadge');
        const autoText = document.getElementById('tacticalAutoText');

        const deGov = currentReport?.today?.governor;
        if (autoText && deGov) {
            autoText.textContent = deGov.isSkill ? 'Khuyên: 🔥 Dùng Skill' : 'Khuyên: 🛡️ Bắn Thường';
        }

        [btnNormal, btnSkill, btnAuto].forEach(b => {
            if (!b) return;
            b.classList.remove('active', 'bg-white', 'text-slate-900', 'shadow-sm', 'border', 'border-slate-200');
            b.classList.add('text-slate-700');
        });

        if (activeTacticalMode === 'normal') {
            if (btnNormal) {
                btnNormal.classList.add('active', 'bg-white', 'text-slate-900', 'shadow-sm', 'border', 'border-slate-200');
                btnNormal.classList.remove('text-slate-700');
            }
            if (activeBadge) activeBadge.innerHTML = '🛡️ ĐÁNH THƯỜNG (CƯỢC PHẲNG 1M)';
        } else if (activeTacticalMode === 'skill') {
            if (btnSkill) {
                btnSkill.classList.add('active', 'bg-white', 'text-slate-900', 'shadow-sm', 'border', 'border-slate-200');
                btnSkill.classList.remove('text-slate-700');
            }
            if (activeBadge) activeBadge.innerHTML = '🔥 DÙNG SKILL (HỎA LỰC PHÂN TẦNG)';
        } else if (activeTacticalMode === 'auto') {
            if (btnAuto) {
                btnAuto.classList.add('active', 'bg-white', 'text-slate-900', 'shadow-sm', 'border', 'border-slate-200');
                btnAuto.classList.remove('text-slate-700');
            }
            if (activeBadge) activeBadge.innerHTML = deGov?.isSkill ? '⚡ THEO AI: 🔥 DÙNG SKILL' : '⚡ THEO AI: 🛡️ BẮN THƯỜNG';
        } else {
            if (activeBadge) activeBadge.innerHTML = `⚙️ TÙY CHỌN: ${STRATEGY_DEFINITIONS[activeStrategy]?.name || 'Nâng Cao'}`;
        }
    }

    /**
     * Cập nhật giao diện thanh chuyển chế độ tác chiến Lô
     */
    function updateLotoTacticalButtonsUI() {
        const btnNormal = document.getElementById('btnLotoTacticalNormal');
        const btnSkill = document.getElementById('btnLotoTacticalSkill');
        const btnAuto = document.getElementById('btnLotoTacticalAuto');
        const activeBadge = document.getElementById('activeLotoTacticalBadge');
        const autoText = document.getElementById('lotoTacticalAutoText');

        const loGov = currentReport?.loto?.today?.governor;
        if (autoText && loGov) {
            autoText.textContent = loGov.isSkill ? 'Khuyên: 🔥 Dùng Skill 66K' : 'Khuyên: 🛡️ Bắn Thường 22K';
        }

        [btnNormal, btnSkill, btnAuto].forEach(b => {
            if (!b) return;
            b.classList.remove('active', 'bg-white', 'text-slate-900', 'shadow-sm', 'border', 'border-slate-200');
            b.classList.add('text-slate-700');
        });

        if (activeLotoTacticalMode === 'normal') {
            if (btnNormal) {
                btnNormal.classList.add('active', 'bg-white', 'text-slate-900', 'shadow-sm', 'border', 'border-slate-200');
                btnNormal.classList.remove('text-slate-700');
            }
            if (activeBadge) activeBadge.innerHTML = '🛡️ LÔ ĐÁNH THƯỜNG (22K/ĐIỂM)';
        } else if (activeLotoTacticalMode === 'skill') {
            if (btnSkill) {
                btnSkill.classList.add('active', 'bg-white', 'text-slate-900', 'shadow-sm', 'border', 'border-slate-200');
                btnSkill.classList.remove('text-slate-700');
            }
            if (activeBadge) activeBadge.innerHTML = '🔥 LÔ DÙNG SKILL (44K/66K)';
        } else if (activeLotoTacticalMode === 'auto') {
            if (btnAuto) {
                btnAuto.classList.add('active', 'bg-white', 'text-slate-900', 'shadow-sm', 'border', 'border-slate-200');
                btnAuto.classList.remove('text-slate-700');
            }
            if (activeBadge) activeBadge.innerHTML = loGov?.isSkill ? '⚡ THEO AI: 🔥 DÙNG SKILL 66K' : '⚡ THEO AI: 🛡️ BẮN THƯỜNG 22K';
        } else {
            if (activeBadge) activeBadge.innerHTML = `⚙️ TÙY CHỌN: ${LOTO_STRATEGY_DEFINITIONS[activeLotoStrategy]?.name || 'Nâng Cao'}`;
        }
    }

    /**
     * Chuyển đổi chế độ tác chiến Đề chuẩn thao tác thường (Đánh Thường vs Dùng Skill vs Theo AI)
     */
    window.setTacticalMode = function (mode) {
        activeTacticalMode = mode;
        if (mode === 'normal') {
            activeStrategy = 'ss15_base';
        } else if (mode === 'skill') {
            activeStrategy = 'tri_tier';
        } else if (mode === 'auto') {
            activeStrategy = 'de_dynamic_governor';
        }
        document.querySelectorAll('#strategyTabs .strat-tab-btn').forEach(btn => {
            if (btn.getAttribute('data-strat') === activeStrategy) {
                btn.classList.add('active', 'bg-white', 'text-slate-900', 'shadow-2xs');
                btn.classList.remove('text-slate-600');
            } else {
                btn.classList.remove('active', 'bg-white', 'text-slate-900', 'shadow-2xs');
                btn.classList.add('text-slate-600');
            }
        });
        updateTacticalButtonsUI();
        renderActiveStrategy();
        const el = document.getElementById('todayStrategyContainer');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    /**
     * Chuyển đổi chế độ tác chiến Lô chuẩn thao tác thường (Lô Đánh Thường vs Lô Dùng Skill vs Theo AI)
     */
    window.setLotoTacticalMode = function (mode) {
        activeLotoTacticalMode = mode;
        if (mode === 'normal') {
            activeLotoStrategy = 'tri_top1';
        } else if (mode === 'skill') {
            const loGov = currentReport?.loto?.today?.governor;
            activeLotoStrategy = loGov?.isSkill ? 'lo_dynamic_governor' : 'penta_parity_top6';
        } else if (mode === 'auto') {
            activeLotoStrategy = 'lo_dynamic_governor';
        }
        document.querySelectorAll('#lotoStrategyTabs .loto-strat-tab-btn').forEach(btn => {
            if (btn.getAttribute('data-loto-strat') === activeLotoStrategy) {
                btn.classList.add('active', 'bg-white', 'text-slate-900', 'shadow-2xs');
                btn.classList.remove('text-slate-600');
            } else {
                btn.classList.remove('active', 'bg-white', 'text-slate-900', 'shadow-2xs');
                btn.classList.add('text-slate-600');
            }
        });
        updateLotoTacticalButtonsUI();
        renderActiveLotoStrategy();
        const el = document.getElementById('todayLotoStrategyContainer');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    /**
     * Mở rộng / thu gọn 9 biến thể toán học Đề nâng cao
     */
    window.toggleAdvancedTabs = function () {
        const container = document.getElementById('advancedStrategyTabsContainer');
        const textEl = document.getElementById('textToggleAdvancedTabs');
        const iconEl = document.getElementById('iconToggleAdvancedTabs');
        if (!container) return;
        isAdvancedTabsOpen = !isAdvancedTabsOpen;
        if (isAdvancedTabsOpen) {
            container.classList.remove('hidden');
            if (textEl) textEl.textContent = '⚙️ Thu gọn 9 biến thể toán học nâng cao';
            if (iconEl) { iconEl.classList.remove('bi-chevron-down'); iconEl.classList.add('bi-chevron-up'); }
        } else {
            container.classList.add('hidden');
            if (textEl) textEl.textContent = '⚙️ Xem chi tiết 9 biến thể toán học nâng cao (PA B, PA D, PA D2, Consensus...)';
            if (iconEl) { iconEl.classList.remove('bi-chevron-up'); iconEl.classList.add('bi-chevron-down'); }
        }
    };

    /**
     * Mở rộng / thu gọn 8 biến thể Lô nâng cao
     */
    window.toggleLotoAdvancedTabs = function () {
        const container = document.getElementById('advancedLotoStrategyTabsContainer');
        const textEl = document.getElementById('textToggleLotoAdvancedTabs');
        const iconEl = document.getElementById('iconToggleLotoAdvancedTabs');
        if (!container) return;
        isLotoAdvancedTabsOpen = !isLotoAdvancedTabsOpen;
        if (isLotoAdvancedTabsOpen) {
            container.classList.remove('hidden');
            if (textEl) textEl.textContent = '⚙️ Thu gọn 8 biến thể Lô nâng cao';
            if (iconEl) { iconEl.classList.remove('bi-chevron-down'); iconEl.classList.add('bi-chevron-up'); }
        } else {
            container.classList.add('hidden');
            if (textEl) textEl.textContent = '⚙️ Xem chi tiết 8 biến thể Lô nâng cao (Top 1, Top 2, Top 4, Top 7...)';
            if (iconEl) { iconEl.classList.remove('bi-chevron-up'); iconEl.classList.add('bi-chevron-down'); }
        }
    };

    /**
     * Tạo và sao chép cú pháp tin nhắn Đề chuẩn gửi thầu / Zalo
     */
    window.copyBettingSyntax = function (stratKey, btnElement) {
        const stratDef = STRATEGY_DEFINITIONS[stratKey || activeStrategy];
        if (!stratDef || !currentReport) return;
        const data = stratDef.getData(currentReport);
        const targetDate = currentReport?.today?.targetDate || '';
        const dateFormatted = targetDate ? targetDate.split('-').reverse().slice(0, 2).join('/') : 'Hôm Nay';

        const x3List = data.x3 || [];
        const x2List = data.x2 || [];
        const x1List = data.x1 || [];
        const allNumbers = [...x3List, ...x2List, ...x1List];

        let message = '';
        if (x3List.length > 0 || x2List.length > 0) {
            const totalStakeK = x3List.length * 3000 + x2List.length * 2000 + x1List.length * 1000;
            message = `Đề phân tầng ngày ${dateFormatted}:\n` +
                (x3List.length ? `👑 VIP X3 (3.000k/số): ${x3List.join(', ')}\n` : '') +
                (x2List.length ? `⭐ CHỦ LỰC X2 (2.000k/số): ${x2List.join(', ')}\n` : '') +
                (x1List.length ? `🛡️ LÓT X1 (1.000k/số): ${x1List.join(', ')}\n` : '') +
                `Tổng vốn: ${totalStakeK.toLocaleString('vi-VN')}k (${allNumbers.length} số)`;
        } else {
            const totalStakeK = allNumbers.length * 1000;
            message = `Đề ngày ${dateFormatted} (Cược phẳng 1.000k/số):\n${allNumbers.join(', ')} (${allNumbers.length} số)\nTổng vốn: ${totalStakeK.toLocaleString('vi-VN')}k · Ăn 84.000k`;
        }

        window.copyToClipboard(message, btnElement);
    };

    /**
     * Tạo và sao chép cú pháp tin nhắn Lô chuẩn gửi thầu / Zalo
     */
    window.copyLotoBettingSyntax = function (stratKey, btnElement) {
        const stratDef = LOTO_STRATEGY_DEFINITIONS[stratKey || activeLotoStrategy];
        if (!stratDef || !currentReport) return;
        const data = stratDef.getData(currentReport);
        const targetDate = currentReport?.today?.targetDate || '';
        const dateFormatted = targetDate ? targetDate.split('-').reverse().slice(0, 2).join('/') : 'Hôm Nay';

        const x2List = data.x2 || [];
        const x1List = data.x1 || [];
        const allNumbers = data.numbers || [...x2List, ...x1List];

        let message = '';
        if (stratDef.type === 'tiered' || x2List.length > 0) {
            const totalPoints = x2List.length * 200 + x1List.length * 100;
            const totalStakeK = x2List.length * 4400 + x1List.length * 2200;
            message = `Lô phân tầng ngày ${dateFormatted}:\n` +
                (x2List.length ? `👑 VIP X2 (44k = 200đ): ${x2List.join(', ')}\n` : '') +
                (x1List.length ? `🛡️ LÓT X1 (22k = 100đ): ${x1List.join(', ')}\n` : '') +
                `Tổng điểm: ${totalPoints}đ · Tổng vốn: ${totalStakeK.toLocaleString('vi-VN')}k`;
        } else {
            const totalPoints = allNumbers.length * 100;
            const totalStakeK = allNumbers.length * 2200;
            message = `Lô ngày ${dateFormatted} (Cược phẳng 22k/điểm = 100đ/số):\n${allNumbers.join(', ')} (${allNumbers.length} số)\nTổng điểm: ${totalPoints}đ · Tổng vốn: ${totalStakeK.toLocaleString('vi-VN')}k · Ăn 80k/nháy (8.000k)`;
        }

        window.copyToClipboard(message, btnElement);
    };

    /**
     * Hàm sao chép toàn cục
     */
    window.copyToClipboard = function (text, btnElement) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            const orig = btnElement.innerHTML;
            btnElement.innerHTML = '<i class="bi bi-check2"></i> Đã Chép!';
            btnElement.classList.add('bg-emerald-600', 'text-white');
            setTimeout(() => {
                btnElement.innerHTML = orig;
                btnElement.classList.remove('bg-emerald-600', 'text-white');
            }, 1800);
        }).catch(err => {
            console.error('Không thể chép:', err);
            prompt('Sao chép dàn số:', text);
        });
    };

    /**
     * Hàm chuyển đổi nhanh chiến lược Đề từ bảng radar
     */
    window.switchDeStrategy = function (stratId) {
        if (STRATEGY_DEFINITIONS[stratId]) {
            activeStrategy = stratId;
            activeTacticalMode = 'custom';
            document.querySelectorAll('#strategyTabs .strat-tab-btn').forEach(btn => {
                if (btn.getAttribute('data-strat') === stratId) {
                    btn.classList.add('active', 'bg-white', 'text-slate-900', 'shadow-2xs');
                    btn.classList.remove('text-slate-600');
                } else {
                    btn.classList.remove('active', 'bg-white', 'text-slate-900', 'shadow-2xs');
                    btn.classList.add('text-slate-600');
                }
            });
            updateTacticalButtonsUI();
            renderActiveStrategy();
            const el = document.getElementById('todayStrategyContainer');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    };

    /**
     * Hàm chuyển sang chế độ Cố Vấn Lô từ bảng radar
     */
    window.switchToLotoMode = function () {
        const btnLo = document.getElementById('btnMasterModeLo');
        if (btnLo) btnLo.click();
        const el = document.getElementById('todayLotoStrategyContainer');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    /**
     * Hàm chuyển đổi nhanh chiến lược Lô
     */
    window.switchLotoStrategy = function (stratId) {
        if (LOTO_STRATEGY_DEFINITIONS[stratId]) {
            activeLotoStrategy = stratId;
            activeLotoTacticalMode = 'custom';
            document.querySelectorAll('#lotoStrategyTabs .loto-strat-tab-btn').forEach(btn => {
                if (btn.getAttribute('data-loto-strat') === stratId) {
                    btn.classList.add('active', 'bg-white', 'text-slate-900', 'shadow-2xs');
                    btn.classList.remove('text-slate-600');
                } else {
                    btn.classList.remove('active', 'bg-white', 'text-slate-900', 'shadow-2xs');
                    btn.classList.add('text-slate-600');
                }
            });
            updateLotoTacticalButtonsUI();
            renderActiveLotoStrategy();
            const el = document.getElementById('todayLotoStrategyContainer');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    };

    // Khởi chạy
    document.addEventListener('DOMContentLoaded', () => {
        setupEvents();
        fetchReport();
    });

})();
