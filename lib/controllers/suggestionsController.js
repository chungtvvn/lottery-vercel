const statisticsService = require('../services/statisticsService');
const { SETS, findNextInSet, findPreviousInSet, INDEX_MAPS, getTongTT, getTongMoi, getHieu, identifyCategories, extractValueForComparison } = require('../utils/numberAnalysis');
const {
    isSoLeTheoCapCategory,
    getSoLeTheoCapConfig,
    predictSoLeTheoCapNumbers
} = require('../utils/soLeTheoCapPairs');

const STATS_CONFIG = require('../config/stats-config');
const EXCLUSION_TIERS = require('../config/exclusion-tiers');
const exclusionLogic = require('../services/exclusionLogicService');
const lotteryService = require('../services/lotteryService');

exports.getSuggestions = async (req, res) => {
    try {
        // Get config from query params with defaults from STATS_CONFIG
        const GAP_STRATEGY = req.query.gapStrategy || STATS_CONFIG.GAP_STRATEGY || 'COMBINED';
        const GAP_BUFFER_PERCENT = !isNaN(parseFloat(req.query.gapBuffer)) ? parseFloat(req.query.gapBuffer) : (STATS_CONFIG.GAP_BUFFER_PERCENT !== undefined ? STATS_CONFIG.GAP_BUFFER_PERCENT : 0);

        const quickStats = await statisticsService.getQuickStats();
        const latestDate = await statisticsService.getLatestDate();

        // Khởi tạo các danh sách loại trừ theo cấp độ (không còn light_orange)
        const exclusionsByTier = {
            red: new Map(),        // Map<number, {reason, sources}>
            purple: new Map(),     // Tiềm năng
            orange: new Map(),     // Cam
            light_red: new Map()   // Đỏ nhạt (threshold động)
        };
        const explanationsByTier = {
            red: [],
            purple: [],
            orange: [],
            light_red: []
        };

        // Pending orange patterns - will be processed after counting red+purple
        const pendingOrange = [];

        // Legacy exclusions for backward compatibility
        const excludedNumbers = new Set();
        const explanations = [];

        // === PASS 1: Thu thập TẤT CẢ các candidates có tỷ lệ gãy >= 70% ===
        const exclusionCandidates = [];

        for (const key in quickStats) {
            const stat = quickStats[key];

            // Remove strict date check to match frontend display
            if (!stat.current) continue;

            const currentLen = stat.current.length;
            const [category, subcategory] = key.split(':');

            // IMPORTANT: tienLuiSoLe/luiTienSoLe and soLeTheoCap are consecutive-day patterns.
            const isSoLePattern = (
                subcategory && (subcategory.toLowerCase() === 'vesole' || subcategory.toLowerCase() === 'vesolemoi')
            ) && key !== 'tienLuiSoLe' && key !== 'luiTienSoLe';

            // For so le patterns, targetLen = currentLen + 2 (skip every other day)
            // For other patterns (including tienLuiSoLe), targetLen = currentLen + 1
            const targetLen = isSoLePattern ? currentLen + 2 : currentLen + 1;

            const gapInfoGE = stat.gapStats ? stat.gapStats[targetLen] : null;
            const gapInfoExact = stat.exactGapStats ? stat.exactGapStats[targetLen] : null;
            const extensionGapInfo = stat.extensionGapStats ? stat.extensionGapStats[currentLen] : null;

            // Helper to format sequence for tienLuiSoLe/luiTienSoLe
            const formatSequence = (baseExplanation) => {
                if ((key === 'tienLuiSoLe' || key === 'luiTienSoLe') && stat.current.values && stat.current.values.length >= 2) {
                    const values = stat.current.values;
                    let seqStr = '';
                    for (let i = 0; i < values.length - 1; i++) {
                        const curr = parseInt(values[i], 10);
                        const next = parseInt(values[i + 1], 10);
                        const arrow = next > curr ? '↑' : '↓';
                        seqStr += `${values[i]}${arrow}${values[i + 1]}`;
                        if (i < values.length - 2) seqStr += ', ';
                    }
                    return baseExplanation.replace(`Chuỗi hiện tại(${currentLen} ngày)`, `Chuỗi hiện tại(${currentLen} ngày - ${seqStr})`)
                        .replace(`Chuỗi hiện tại: ${currentLen} ngày`, `Chuỗi hiện tại: ${currentLen} ngày (${seqStr})`);
                }
                return baseExplanation;
            };

            // --- LOGIC CHÍNH XÁC: DỰA VÀO TỶ LỆ GÃY CHUỖI (XÁC SUẤT CÓ ĐIỀU KIỆN) ---
            // Sử dụng gapStats (>= counts) thay vì exactGapStats (exact counts)
            // P(reach targetLen | reached currentLen) = gapStats[targetLen].count / gapStats[currentLen].count
            const totalYears = lotteryService.getTotalYears();
            const isPotential = stat.current && stat.current.isPotential;
            
            // gapStats[L].count = số lần chuỗi đạt >= L ngày (xác suất có điều kiện đúng)
            const currentGapInfo = stat.gapStats ? stat.gapStats[currentLen] : null;
            const currentCount = currentGapInfo ? currentGapInfo.count : 0;
            
            // TÍNH TOÁN LOOK-AHEAD ĐẾN KỶ LỤC (moved up for dynamic MIN_SAMPLES)
            const recordLen = stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0;
            
            // Dynamic MIN_SAMPLES: ưu tiên các chuỗi đã đạt/gần kỷ lục (bao gồm kỷ lục 2 ngày)
            // Ví dụ: 1 số về liên tiếp 2 ngày mà kỷ lục chỉ là 2 → luôn tính tỉ lệ gãy
            let minSamples = 5;
            if (recordLen > 0 && currentLen >= recordLen) {
                minSamples = 1; // Đang ở kỷ lục hoặc vượt kỷ lục → luôn bao gồm
            } else if (recordLen > 0 && currentLen >= recordLen - 1) {
                minSamples = 3; // Cách kỷ lục 1 bước
            }
            if (currentCount < minSamples) continue;
            let checkTargetLen = targetLen; 
            
            if (recordLen > currentLen) {
                const step = isSoLePattern ? 2 : 1;
                const stepsToRecord = (recordLen - currentLen) / step;
                // Nếu cách kỷ lục 1 hoặc 2 bước, ta tính tỉ lệ gãy để đi tới tận kỷ lục
                if (stepsToRecord > 0 && stepsToRecord <= 2) {
                    checkTargetLen = recordLen;
                }
            }

            const checkTargetGapInfo = stat.gapStats ? stat.gapStats[checkTargetLen] : null;
            const checkTargetCount = checkTargetGapInfo ? checkTargetGapInfo.count : 0;
            
            let dropOffRate = 0;
            let continuationRate = 0;
            
            if (currentCount > 0) {
                continuationRate = checkTargetCount / currentCount;
                dropOffRate = 1 - continuationRate;
            } else {
                // Chưa bao giờ đạt được độ dài này trong lịch sử => Tỷ lệ gãy 100%
                dropOffRate = 1;
            }

            // Ngưỡng tối thiểu: 85% drop-off (chỉ lấy chuỗi có tỷ lệ gãy ≥85%)
            const MIN_DROPOFF = 0.85;
            
            if (dropOffRate >= MIN_DROPOFF) {
                let tier, subTier, reason;
                const reachedLabel = `đạt ≥${currentLen}d`;

                if (dropOffRate >= 0.90) {
                    tier = 'purple';
                    subTier = 'highRiskSuper';
                    if (checkTargetCount === 0) {
                        reason = `[TÍM ĐẬM] RỦI RO GÃY 100%: Chuỗi ${currentLen} ngày chưa từng kéo dài thêm trong lịch sử! Cực kỳ rủi ro!`;
                    } else {
                        reason = `[TÍM] TỶ LỆ GÃY CỰC CAO: ${(dropOffRate*100).toFixed(1)}% (Lịch sử ${currentCount} lần ${reachedLabel} → chỉ ${checkTargetCount} lần tới ≥${checkTargetLen}d). Rủi ro rất lớn!`;
                    }
                } else {
                    tier = 'red';
                    subTier = 'highRisk';
                    reason = `[ĐỎ] TỶ LỆ GÃY CAO: ${(dropOffRate*100).toFixed(1)}% (Lịch sử ${currentCount} lần ${reachedLabel} → chỉ ${checkTargetCount} lần tới ≥${checkTargetLen}d). Cần loại bỏ!`;
                }
                reason = formatSequence(reason);

                // Không loại trừ các pattern Lớn, Nhỏ của Tổng TT, Tổng Mới, Hiệu
                const [cat] = key.split(':');
                const isExcludedPattern = cat === 'tong_tt_lon' || cat === 'tong_tt_nho' ||
                    cat === 'tong_moi_lon' || cat === 'tong_moi_nho' ||
                    cat === 'hieu_lon' || cat === 'hieu_nho';

                if (!isExcludedPattern) {
                    exclusionCandidates.push({
                        stat, key, reason, tier, subTier, dropOffRate,
                        isPotential, currentLen, currentCount
                    });
                }
            }
        }

        // === PASS 2: CHỌN CHUỖI THEO THỨ TỰ TỶ LỆ GÃY CAO → THẤP, TÍCH LŨY ĐẾN KHI ĐẠT ≥70 SỐ ===
        // Sắp xếp thuần túy theo tỷ lệ gãy (cao nhất trước)
        exclusionCandidates.sort((a, b) => {
            // Primary: drop-off rate (highest first)
            if (Math.abs(b.dropOffRate - a.dropOffRate) > 0.001) return b.dropOffRate - a.dropOffRate;
            // Tiebreaker 1: prefer longer streaks (more significant)
            if (a.currentLen !== b.currentLen) return b.currentLen - a.currentLen;
            // Tiebreaker 2: prefer more historical samples
            return (b.currentCount || 0) - (a.currentCount || 0);
        });

        for (const candidate of exclusionCandidates) {
            // Thêm TOÀN BỘ số của chuỗi này vào danh sách loại trừ (>= 85% drop-off)
            addExcludedNumber(candidate.stat, candidate.key, candidate.reason, candidate.tier, candidate.subTier, false);
        }

        function getCategoryName(category, subcategory, originalKey = null) {
            // Check original key first (for keys like cacSoLuiDeuLienTiep)
            if (originalKey) {
                const directMapping = {
                    // Các số
                    'cacSoTienLienTiep': 'Các số - Tiến liên tiếp',
                    'cacSoTienDeuLienTiep': 'Các số - Tiến Đều',
                    'cacSoLuiLienTiep': 'Các số - Lùi liên tiếp',
                    'cacSoLuiDeuLienTiep': 'Các số - Lùi Đều',
                    'tienLuiSoLe': 'Các số - Tiến Lùi So Le (>= 4 ngày)',
                    'luiTienSoLe': 'Các số - Lùi Tiến So Le (>= 4 ngày)',
                    // 1 số
                    'motSoVeLienTiep': '1 số - Về liên tiếp',
                    'motSoVeSole': '1 số - Về so le',
                    'motSoVeSoleMoi': '1 số - Về so le Mới',
                    // Cặp số
                    'capSoVeSoLe': 'Cặp số - Về so le',
                    // Các đầu/đít
                    'cacDauTien': 'Các Đầu - Tiến liên tiếp',
                    'cacDauTienDeu': 'Các Đầu - Tiến Đều',
                    'cacDauLui': 'Các Đầu - Lùi liên tiếp',
                    'cacDauLuiDeu': 'Các Đầu - Lùi Đều',
                    'cacDitTien': 'Các Đít - Tiến liên tiếp',
                    'cacDitTienDeu': 'Các Đít - Tiến Đều',
                    'cacDitLui': 'Các Đít - Lùi liên tiếp',
                    'cacDitLuiDeu': 'Các Đít - Lùi Đều',
                    'cacDauTienLuiSoLe': 'Các Đầu - Tiến-Lùi So Le',
                    'cacDauLuiTienSoLe': 'Các Đầu - Lùi-Tiến So Le',
                    'cacDitTienLuiSoLe': 'Các Đít - Tiến-Lùi So Le',
                    'cacDitLuiTienSoLe': 'Các Đít - Lùi-Tiến So Le',
                    'cacDauVeTheoThuTu': 'Các Đầu - Về theo thứ tự',
                    'cacDauVeSoLeTheoThuTu': 'Các Đầu - Về so le theo thứ tự',
                    'cacDitVeTheoThuTu': 'Các Đít - Về theo thứ tự',
                    'cacDitVeSoLeTheoThuTu': 'Các Đít - Về so le theo thứ tự',
                    // 1 đầu/đít
                    'motDauVeLienTiep': '1 Đầu - Về liên tiếp',
                    'motDauVeSole': '1 Đầu - Về so le',
                    'motDauVeSoleMoi': '1 Đầu - Về so le Mới',
                    'motDitVeLienTiep': '1 Đít - Về liên tiếp',
                    'motDitVeSole': '1 Đít - Về so le',
                    'motDitVeSoleMoi': '1 Đít - Về so le Mới',
                    // So le theo cặp giữa 2 dạng khác nhau
                    'dau_chan_le': 'Đầu chẵn - lẻ - So Le Theo Cặp',
                    'dit_chan_le': 'Đít chẵn - lẻ - So Le Theo Cặp',
                    'dau_nho_to': 'Đầu nhỏ - to - So Le Theo Cặp',
                    'dit_nho_to': 'Đít nhỏ - to - So Le Theo Cặp'
                };

                if (directMapping[originalKey]) {
                    return directMapping[originalKey];
                }
            }

            // Build full key for lookup
            const fullKey = subcategory ? `${category}:${subcategory}` : category;

            // Pattern-based mapping for category:subcategory format
            let catName = category;

            // Tổng TT
            if (category.startsWith('tong_tt_')) {
                const suffix = category.replace('tong_tt_', '');
                if (suffix === 'cac_tong') catName = 'Tổng TT - Các tổng';
                else if (suffix === 'chan') catName = 'Tổng TT - Chẵn';
                else if (suffix === 'le') catName = 'Tổng TT - Lẻ';
                else if (suffix === 'chan_chan') catName = 'Tổng TT - Dạng Chẵn-Chẵn';
                else if (suffix === 'chan_le') catName = 'Tổng TT - Dạng Chẵn-Lẻ';
                else if (suffix === 'le_chan') catName = 'Tổng TT - Dạng Lẻ-Chẵn';
                else if (suffix === 'le_le') catName = 'Tổng TT - Dạng Lẻ-Lẻ';
                else if (suffix === 'lon') catName = 'Tổng TT - Tổng Lớn';
                else if (suffix === 'nho') catName = 'Tổng TT - Tổng Nhỏ';
                else if (suffix.match(/^\d+$/)) catName = `Tổng TT - Tổng ${suffix}`;
                else if (suffix.includes('_')) {
                    const parts = suffix.split('_');
                    catName = `Tổng TT - Dạng tổng (${parts.join(',')})`;
                }
                else catName = `Tổng TT - ${suffix}`;
            }
            // Tổng Mới
            else if (category.startsWith('tong_moi')) {
                let suffix;
                if (category.includes(':')) {
                    // Format: tong_moi:7_9
                    suffix = category.split(':')[1];
                } else {
                    // Format: tong_moi_X
                    suffix = category.replace('tong_moi_', '');
                }

                if (suffix === 'cac_tong') catName = 'Tổng Mới - Các tổng';
                else if (suffix === 'chan') catName = 'Tổng Mới - Chẵn';
                else if (suffix === 'le') catName = 'Tổng Mới - Lẻ';
                else if (suffix === 'chan_chan') catName = 'Tổng Mới - Dạng Chẵn-Chẵn';
                else if (suffix === 'chan_le') catName = 'Tổng Mới - Dạng Chẵn-Lẻ';
                else if (suffix === 'le_chan') catName = 'Tổng Mới - Dạng Lẻ-Chẵn';
                else if (suffix === 'le_le') catName = 'Tổng Mới - Dạng Lẻ-Lẻ';
                else if (suffix === 'lon') catName = 'Tổng Mới - Tổng Lớn';
                else if (suffix === 'nho') catName = 'Tổng Mới - Tổng Nhỏ';
                else if (suffix.match(/^\d+$/)) catName = `Tổng Mới - Tổng ${suffix}`;
                else if (suffix.includes('_')) {
                    const parts = suffix.split('_');
                    catName = `Tổng Mới - Dạng tổng (${parts.join(',')})`;
                }
                else catName = `Tổng Mới - ${suffix}`;
            }
            // Hiệu
            else if (category.startsWith('hieu')) {
                let suffix;
                if (category.includes(':')) {
                    // Format: hieu:3_5
                    suffix = category.split(':')[1];
                } else {
                    // Format: hieu_X
                    suffix = category.replace('hieu_', '');
                }

                if (suffix === 'cac_hieu') catName = 'Hiệu - Các hiệu';
                else if (suffix === 'chan') catName = 'Hiệu - Chẵn';
                else if (suffix === 'le') catName = 'Hiệu - Lẻ';
                else if (suffix === 'chan_chan') catName = 'Hiệu - Dạng Chẵn-Chẵn';
                else if (suffix === 'chan_le') catName = 'Hiệu - Dạng Chẵn-Lẻ';
                else if (suffix.match(/^\d+$/)) catName = `Hiệu - Hiệu ${suffix}`;
                else if (suffix.includes('_')) {
                    const parts = suffix.split('_');
                    catName = `Hiệu - Dạng hiệu (${parts.join(',')})`;
                }
                else catName = `Hiệu - ${suffix}`;
            }
            // Đầu Đít Tiến
            else if (category.startsWith('dau_dit_tien_')) {
                const num = category.replace('dau_dit_tien_', '');
                catName = `Dạng Đồng Tiến ${num} (0${num},${parseInt(num) + 1}${num}...)`;
            }
            else if (category.startsWith('dong_step_')) {
                const match = category.match(/^dong_step_(\d+)_(\d+)$/);
                if (match) {
                    const [, step, start] = match;
                    catName = `Đồng cách ${step} từ ${String(start).padStart(2, '0')}`;
                }
            }
            // Composite patterns - PHẢI CHECK TRƯỚC dau_/dit_ vì chúng cũng start with dau_/dit_
            else if (category === 'chanChan') catName = 'Dạng Chẵn-Chẵn';
            else if (category === 'chanLe') catName = 'Dạng Chẵn-Lẻ';
            else if (category === 'leChan') catName = 'Dạng Lẻ-Chẵn';
            else if (category === 'leLe') catName = 'Dạng Lẻ-Lẻ';
            else if (category === 'dau_nho_dit_nho') catName = 'Đầu nhỏ-Đít nhỏ';
            else if (category === 'dau_nho_dit_to') catName = 'Đầu nhỏ-Đít to';
            else if (category === 'dau_to_dit_nho') catName = 'Đầu to-Đít nhỏ';
            else if (category === 'dau_to_dit_to') catName = 'Đầu to-Đít to';
            else if (category === 'dau_chan_dit_chan') catName = 'Đầu chẵn-Đít chẵn';
            else if (category === 'dau_chan_dit_le') catName = 'Đầu chẵn-Đít lẻ';
            else if (category === 'dau_le_dit_chan') catName = 'Đầu lẻ-Đít chẵn';
            else if (category === 'dau_le_dit_le') catName = 'Đầu lẻ-Đít lẻ';
            // New mappings for > 4 patterns
            else if (category === 'dau_chan_lon_hon_4') catName = 'Đầu chẵn > 4';
            else if (category === 'dit_chan_lon_hon_4') catName = 'Đít chẵn > 4';
            else if (category === 'dau_chan_lon_4_dit_chan_lon_4') catName = 'Đầu chẵn > 4 & Đít chẵn > 4';
            // Mappings cho patterns với số cụ thể (e.g., chan_nho_4_dit_chan_lon_4) - KHÔNG bắt đầu bằng dau_
            else if (!category.startsWith('dau_') && category.includes('_nho_') && category.includes('_dit_') && category.includes('_lon_')) {
                // Parse pattern like: chan_nho_4_dit_chan_lon_4, le_nho_3_dit_le_lon_5
                const match = category.match(/^(\w+)_nho_(\d+)_dit_(\w+)_lon_(\d+)$/);
                if (match) {
                    const [, headType, headVal, tailType, tailVal] = match;
                    const headTypeVi = headType === 'chan' ? 'Chẵn' : 'Lẻ';
                    const tailTypeVi = tailType === 'chan' ? 'Chẵn' : 'Lẻ';
                    catName = `Đầu ${headTypeVi} nhỏ (${headVal}) - Đít ${tailTypeVi} lớn (${tailVal})`;
                } else {
                    catName = category; // Fallback
                }
            }
            else if (!category.startsWith('dau_') && category.includes('_lon_') && category.includes('_dit_') && category.includes('_nho_')) {
                // Parse pattern like: chan_lon_6_dit_le_nho_3
                const match = category.match(/^(\w+)_lon_(\d+)_dit_(\w+)_nho_(\d+)$/);
                if (match) {
                    const [, headType, headVal, tailType, tailVal] = match;
                    const headTypeVi = headType === 'chan' ? 'Chẵn' : 'Lẻ';
                    const tailTypeVi = tailType === 'chan' ? 'Chẵn' : 'Lẻ';
                    catName = `Đầu ${headTypeVi} lớn (${headVal}) - Đít ${tailTypeVi} nhỏ (${tailVal})`;
                } else {
                    catName = category; // Fallback
                }
            }
            // Pattern: dau_X_lon/nho_Y_dit_Z_lon/nho_W (e.g., dau_le_lon_5_dit_chan_nho_4)
            else if (category.startsWith('dau_') && category.includes('_dit_')) {
                // Try multiple patterns
                let matched = false;

                // Pattern 1: dau_X_lon_Y_dit_Z_nho_W
                let match = category.match(/^dau_(\w+)_lon_(\d+)_dit_(\w+)_nho_(\d+)$/);
                if (match) {
                    const [, headType, headVal, tailType, tailVal] = match;
                    const headTypeVi = headType === 'chan' ? 'Chẵn' : headType === 'le' ? 'Lẻ' : headType;
                    const tailTypeVi = tailType === 'chan' ? 'Chẵn' : tailType === 'le' ? 'Lẻ' : tailType;
                    catName = `Đầu ${headTypeVi} lớn (${headVal}) - Đít ${tailTypeVi} nhỏ (${tailVal})`;
                    matched = true;
                }

                // Pattern 2: dau_X_nho_Y_dit_Z_lon_W
                if (!matched) {
                    match = category.match(/^dau_(\w+)_nho_(\d+)_dit_(\w+)_lon_(\d+)$/);
                    if (match) {
                        const [, headType, headVal, tailType, tailVal] = match;
                        const headTypeVi = headType === 'chan' ? 'Chẵn' : headType === 'le' ? 'Lẻ' : headType;
                        const tailTypeVi = tailType === 'chan' ? 'Chẵn' : tailType === 'le' ? 'Lẻ' : tailType;
                        catName = `Đầu ${headTypeVi} nhỏ (${headVal}) - Đít ${tailTypeVi} lớn (${tailVal})`;
                        matched = true;
                    }
                }

                // Pattern 3: dau_X_lon_Y_dit_Z_lon_W
                if (!matched) {
                    match = category.match(/^dau_(\w+)_lon_(\d+)_dit_(\w+)_lon_(\d+)$/);
                    if (match) {
                        const [, headType, headVal, tailType, tailVal] = match;
                        const headTypeVi = headType === 'chan' ? 'Chẵn' : headType === 'le' ? 'Lẻ' : headType;
                        const tailTypeVi = tailType === 'chan' ? 'Chẵn' : tailType === 'le' ? 'Lẻ' : tailType;
                        catName = `Đầu ${headTypeVi} lớn (${headVal}) - Đít ${tailTypeVi} lớn (${tailVal})`;
                        matched = true;
                    }
                }

                // Pattern 4: dau_X_nho_Y_dit_Z_nho_W
                if (!matched) {
                    match = category.match(/^dau_(\w+)_nho_(\d+)_dit_(\w+)_nho_(\d+)$/);
                    if (match) {
                        const [, headType, headVal, tailType, tailVal] = match;
                        const headTypeVi = headType === 'chan' ? 'Chẵn' : headType === 'le' ? 'Lẻ' : headType;
                        const tailTypeVi = tailType === 'chan' ? 'Chẵn' : tailType === 'le' ? 'Lẻ' : tailType;
                        catName = `Đầu ${headTypeVi} nhỏ (${headVal}) - Đít ${tailTypeVi} nhỏ (${tailVal})`;
                        matched = true;
                    }
                }

                if (!matched) {
                    catName = category; // Fallback
                }
            }
            // Đầu (PHẢI SAU composite patterns)
            else if (category.startsWith('dau_')) {
                const suffix = category.replace('dau_', '');
                if (suffix.match(/^\d$/)) catName = `Đầu ${suffix}`;
                else if (suffix === 'chan') catName = 'Đầu Chẵn';
                else if (suffix === 'le') catName = 'Đầu Lẻ';
                else if (suffix === 'nho') catName = 'Đầu Nhỏ';
                else if (suffix === 'to') catName = 'Đầu To';
                else if (suffix === 'chan_lon_hon_4') catName = 'Đầu chẵn > 4';
                else if (suffix === 'chan_nho_hon_4') catName = 'Đầu chẵn < 4';
                else if (suffix === 'le_lon_hon_5') catName = 'Đầu lẻ > 5';
                else if (suffix === 'le_nho_hon_5') catName = 'Đầu lẻ < 5';
                else if (suffix.startsWith('3d_')) {
                    const parts = suffix.replace('3d_', '').split('_');
                    catName = `Đầu [${parts.join(', ')}]`;
                }
                else catName = `Đầu - ${suffix}`;
            }
            // Đít (PHẢI SAU composite patterns)
            else if (category.startsWith('dit_')) {
                const suffix = category.replace('dit_', '');
                if (suffix.match(/^\d$/)) catName = `Đít ${suffix}`;
                else if (suffix === 'chan') catName = 'Đít Chẵn';
                else if (suffix === 'le') catName = 'Đít Lẻ';
                else if (suffix === 'nho') catName = 'Đít Nhỏ';
                else if (suffix === 'to') catName = 'Đít To';
                else if (suffix === 'chan_lon_hon_4') catName = 'Đít chẵn > 4';
                else if (suffix === 'chan_nho_hon_4') catName = 'Đít chẵn < 4';
                else if (suffix === 'le_lon_hon_5') catName = 'Đít lẻ > 5';
                else if (suffix === 'le_nho_hon_5') catName = 'Đít lẻ < 5';
                else if (suffix.startsWith('3d_')) {
                    const parts = suffix.replace('3d_', '').split('_');
                    catName = `Đít [${parts.join(', ')}]`;
                }
                else catName = `Đít - ${suffix}`;
            }

            // Add subcategory suffix if present
            if (subcategory) {
                if (subcategory === 'veLienTiep') return `${catName} - Về liên tiếp`;
                if (subcategory === 'veSole') return `${catName} - Về so le`;
                if (subcategory === 'veSoleMoi') return `${catName} - Về so le mới`;
                if (subcategory === 'veCungGiaTri') return `${catName} - Về cùng giá trị`;
                if (subcategory === 'veTheoThuTu') return `${catName} - Về theo thứ tự`;
                if (subcategory === 'veSoLeTheoThuTu') return `${catName} - Về so le theo thứ tự`;
                if (subcategory === 'soLeTheoCap') {
                    const pairConfig = getSoLeTheoCapConfig(category);
                    return `${pairConfig ? pairConfig.description : catName} - So Le Theo Cặp`;
                }
                if (subcategory === 'tienDeuLienTiep') return `${catName} - Tiến Đều`;
                if (subcategory === 'luiDeuLienTiep') return `${catName} - Lùi Đều`;
                if (subcategory === 'tienLienTiep') return `${catName} - Tiến liên tiếp`;
                if (subcategory === 'luiLienTiep') return `${catName} - Lùi liên tiếp`;
                if (subcategory === 'dongTien') return `${catName} - Đồng tiến`;
                if (subcategory === 'dongLui') return `${catName} - Đồng lùi`;
                return `${catName} - ${subcategory}`;
            }

            return catName;
        }

        function addExcludedNumber(stat, key, reason, tier = 'red', subTier = null, explanationOnly = false, maxNumsPerPattern = Infinity) {
            let nums = [];

            // Parse key - handle both formats:
            // Format 1: "category:subcategory" (e.g., "tong_tt_cac_tong:luiDeuLienTiep")
            // Format 2: "categorySubcategory" (e.g., "cacSoLuiDeuLienTiep", "cacDauLuiDeu")
            // Also handle prefix like "[TIỀM NĂNG] " from potential streaks
            let category, subcategory;

            // Remove prefix if present
            let cleanKey = key.replace(/^\[TIỀM NĂNG\]\s*/, '');

            if (cleanKey.includes(':')) {
                [category, subcategory] = cleanKey.split(':');
            } else {
                // Extract subcategory from end of key
                const patterns = [
                    'VeSoLeTheoThuTu', 'VeTheoThuTu',
                    'LuiDeuLienTiep', 'TienDeuLienTiep',
                    'LuiLienTiep', 'TienLienTiep',
                    'LuiDeu', 'TienDeu',
                    'VeLienTiep', 'VeCungGiaTri', 'VeSole', 'VeSoleMoi',
                    'DongTien', 'DongLui',
                    'TienLuiSoLe', 'LuiTienSoLe', 'SoLeTheoCap',
                    'Lui', 'Tien' // Standalone patterns (must be last due to shorter length)
                ];

                for (const pattern of patterns) {
                    if (cleanKey.endsWith(pattern)) {
                        subcategory = pattern.charAt(0).toLowerCase() + pattern.slice(1); // Convert to camelCase
                        category = cleanKey.slice(0, -pattern.length);
                        break;
                    }
                }

                if (!subcategory) {
                    // Special patterns without subcategory (e.g., tienLuiSoLe)
                    const ignoredKeys = ['tienLuiSoLe', 'luiTienSoLe', 'soLeTheoCap', 'cacDauSoLeTheoCap', 'cacDitSoLeTheoCap'];
                    if (!ignoredKeys.includes(cleanKey)) {
                        console.warn(`[Suggestions] Unable to parse key: ${cleanKey}`);
                    }
                    category = cleanKey;
                    subcategory = '';
                }
            }

            const trendPatterns = [
                'tienDeuLienTiep', 'luiDeuLienTiep', 'tienLienTiep', 'luiLienTiep',
                'tienDeu', 'luiDeu', 'tien', 'lui'
            ];
            const isTrendPattern = trendPatterns.includes(subcategory);

            // Xử lý các dạng Tiến/Lùi (Đều hoặc Liên Tiếp) - dự đoán giá trị tiếp theo
            // Hỗ trợ cả dạng có LienTiep (luiLienTiep) và không (lui)
            // --- [ĐỒNG BỘ 100% VỚI STATISTICS] ---
            // Không dùng cache cho trend vì cache cũ có thể là full set của "về liên tiếp".
            if (!isTrendPattern && stat.current && stat.current.patternNumbers && stat.current.patternNumbers.length > 0 && stat.current.patternNumbers.length < 100) {
                nums = [...stat.current.patternNumbers];
            }
            // --- [HẾT ĐỒNG BỘ] ---
            // NẾU KHÔNG CÓ TRONG CACHE HOẶC LÀ TỪ [TIỀM NĂNG], TÍNH TOÁN LẠI:
            else {
                if (isTrendPattern) {
                    // Chuẩn hóa subcategory để predictNextInSequence xử lý đúng
                    let normalizedSubcategory = subcategory;
                    if (subcategory === 'lui') normalizedSubcategory = 'luiLienTiep';
                    else if (subcategory === 'tien') normalizedSubcategory = 'tienLienTiep';
                    else if (subcategory === 'luiDeu') normalizedSubcategory = 'luiDeuLienTiep';
                    else if (subcategory === 'tienDeu') normalizedSubcategory = 'tienDeuLienTiep';

                    nums = predictNextInSequence(stat, category, normalizedSubcategory);
                }
                else if (subcategory === 'veTheoThuTu' || subcategory === 'veSoLeTheoThuTu') {
                    nums = predictNextInSequence(stat, category, subcategory);
                }
                // Xử lý các dạng về liên tiếp - cùng số
                else if (subcategory === 'veLienTiep' || subcategory === 'veCungGiaTri') {
                    // Về liên tiếp luôn là một giá trị cụ thể đang chạy,
                    // không phải toàn bộ category cha như "Các tổng" hoặc "Đầu nhỏ".
                    nums = predictNextInSequence(stat, category, subcategory);

                    // Fallback: Nếu category generic (như cac_tong), xác định category cụ thể dựa trên số cuối cùng
                    if (nums.length === 0 || nums.length === 100) {
                        let lastNumberStr = null;
                        if (stat.current.value && stat.current.value !== 'Theo dạng') {
                            lastNumberStr = String(stat.current.value).padStart(2, '0');
                        } else if (stat.current.values && stat.current.values.length > 0) {
                            lastNumberStr = String(stat.current.values[stat.current.values.length - 1]).padStart(2, '0');
                        }

                        if (lastNumberStr && lastNumberStr.length === 2) {
                            // Sử dụng identifyCategories để tìm category cụ thể tương ứng với prefix generic
                            const specificCats = identifyCategories(lastNumberStr);
                            let prefix = '';
                            if (category.startsWith('dau_')) prefix = 'dau_';
                            else if (category.startsWith('dit_')) prefix = 'dit_';
                            else if (category.startsWith('tong_tt_')) prefix = 'tong_tt_';
                            else if (category.startsWith('tong_moi_')) prefix = 'tong_moi_';
                            else if (category.startsWith('hieu_')) prefix = 'hieu_';

                            if (prefix) {
                                const match = specificCats.find(c => c.startsWith(prefix) && c !== category);
                                if (match) {
                                    const tempNums = getNumbersFromCategory(match);
                                    if (tempNums.length > 0) nums = tempNums;
                                }
                            }
                        }
                    }

                    // Fallback cuối: Nếu vẫn rỗng, dùng giá trị thô từ stat
                    if (nums.length === 0) {
                        if (stat.current.values && stat.current.values.length > 0) {
                            nums = stat.current.values.map(v => parseInt(v, 10));
                        } else if (stat.current.value && stat.current.value !== 'Theo dạng') {
                            nums = [parseInt(stat.current.value, 10)];
                        }
                    }
                }
                // Xử lý Tiến-Lùi/Lùi-Tiến So Le và So Le Theo Cặp (ABAB)
                else if (category === 'tienLuiSoLe' || key.includes('tienLuiSoLe') || category === 'luiTienSoLe' || key.includes('luiTienSoLe') || subcategory === 'tienLuiSoLe' || subcategory === 'luiTienSoLe' || subcategory === 'soLeTheoCap' || key.includes('soLeTheoCap')) {
                    // Đồng bộ logic với "Chuỗi đang diễn ra". stat.current.patternNumbers đã được generate sẵn từ getQuickStats
                    if (stat.current.patternNumbers && stat.current.patternNumbers.length > 0 && stat.current.patternNumbers.length < 100) {
                        nums = [...stat.current.patternNumbers];
                    } else {
                        nums = predictNextInSequence(stat, category, subcategory || key);
                    }
                }
                // Xử lý Về So Le (cho 1 số hoặc pattern dạng so le thường)
                else if (subcategory === 'veSole' || subcategory === 'veSoleMoi') {
                    // Với so le, số sẽ về sau 1 ngày nghỉ
                    // Lấy những số đã về trong chuỗi
                    const valuesToExclude = stat.current.values || [];

                    if (valuesToExclude.length > 0) {
                        // Xác định pattern cụ thể đang lặp lại (ví dụ: Head 3, Sum 5)
                        // Bằng cách tìm giá trị xuất hiện nhiều nhất trong chuỗi theo category type
                        const valueCounts = {};
                        
                        // Chuẩn hóa type để extractValueForComparison
                        let typeForExtract = category;
                        if (category === 'motDau' || category === 'cacDau') typeForExtract = 'dau';
                        if (category === 'motDit' || category === 'cacDit') typeForExtract = 'dit';

                        valuesToExclude.forEach(val => {
                            const numStr = String(val).padStart(2, '0');
                            const v = extractValueForComparison(numStr, typeForExtract);
                            if (v !== null && v !== undefined) {
                                valueCounts[v] = (valueCounts[v] || 0) + 1;
                            }
                        });

                        let dominantValue = null;
                        let maxCount = 0;
                        for (const [v, count] of Object.entries(valueCounts)) {
                            if (count > maxCount) {
                                maxCount = count;
                                dominantValue = v;
                            }
                        }

                        if (dominantValue !== null) {
                            // Reconstruct specific category
                            let prefix = '';
                            if (category.startsWith('dau_') || category === 'motDau' || category === 'cacDau') prefix = 'dau_';
                            else if (category.startsWith('dit_') || category === 'motDit' || category === 'cacDit') prefix = 'dit_';
                            else if (category.startsWith('tong_tt_')) prefix = 'tong_tt_';
                            else if (category.startsWith('tong_moi_')) prefix = 'tong_moi_';
                            else if (category.startsWith('hieu_')) prefix = 'hieu_';

                            if (prefix) {
                                nums = getNumbersFromCategory(prefix + dominantValue);
                            }
                        }
                    }

                    // If not handled above, use existing logic
                    if (nums.length === 0) {
                        // FIRST: Check if category is a specific pattern (e.g., chanLe, dau_nho_dit_nho)
                        // Priority: getNumbersFromCategory first for specific patterns
                        const patternNums = getNumbersFromCategory(category);
                        if (patternNums && patternNums.length > 0 && patternNums.length <= 50) {
                            // Category represents a specific pattern, exclude the entire pattern
                            nums = patternNums;
                        }
                        // SECOND: Check if this is a 1-number pattern (motSoVeSole)
                        else if (valuesToExclude.length > 0) {
                            // Expand each value to its related categories' numbers
                            for (const val of valuesToExclude) {
                                const numberStr = String(val).padStart(2, '0');
                                const relatedCategories = identifyCategories(numberStr);

                                // For each category, get the full set of numbers (e.g., LE_LE -> all 25 numbers)
                                let expandedNums = [];
                                for (const cat of relatedCategories) {
                                    const catNums = getNumbersFromCategory(cat);
                                    if (catNums && catNums.length > 0) {
                                        expandedNums = [...expandedNums, ...catNums];
                                    }
                                }
                                nums = [...nums, ...expandedNums];
                            }
                            nums = [...new Set(nums)];
                        }
                        // THIRD: Fallback - try SNAKE_CASE lookup or use values directly
                        else {
                            const snakeKey = category.replace(/([A-Z])/g, "_$1").toUpperCase();
                            if (SETS[snakeKey]) {
                                nums = SETS[snakeKey].map(n => parseInt(n, 10));
                            } else if (SETS[category.toUpperCase()]) {
                                nums = SETS[category.toUpperCase()].map(n => parseInt(n, 10));
                            } else {
                                nums = valuesToExclude.map(v => parseInt(v, 10));
                            }
                        }
                    }
                }
                // Xử lý các dạng khác - toàn bộ set
                else {
                    nums = getNumbersFromCategory(category);
                }

                // Fallback: nếu nums rỗng, thử lấy từ category
                if (nums.length === 0) {
                    nums = getNumbersFromCategory(category);
                }
            } // Đóng block else của patternNumbers

            // Filter out null, undefined, and NaN values
            if (nums.length > 0) {
                nums = nums.filter(n => n !== null && n !== undefined && !isNaN(n) && typeof n === 'number');
            }
            if (nums.length >= 100) {
                nums = [];
            }

            // Per-pattern cap: if a single pattern covers too many numbers,
            // only actively exclude the top N and treat the rest as informational.
            // The explanation will still show ALL numbers for transparency.
            let allNums = nums; // Keep full list for explanation
            let wasCapped = false;
            if (nums.length > maxNumsPerPattern && maxNumsPerPattern < Infinity) {
                wasCapped = true;
                nums = nums.slice(0, maxNumsPerPattern);
            }

            // Luôn thêm explanation nếu có lý do, kể cả khi không có số cụ thể (để cảnh báo)
            if (nums.length > 0) {
                // Thêm vào danh sách loại trừ theo tier (trừ khi chỉ explanationOnly)
                if (!explanationOnly) {
                    nums.forEach(n => {
                        // Add to tier-specific map
                        if (!exclusionsByTier[tier].has(n)) {
                            exclusionsByTier[tier].set(n, { reason, sources: [key], subTier: subTier });
                        } else {
                            // Add source to existing entry
                            exclusionsByTier[tier].get(n).sources.push(key);
                        }
                        // Also add to legacy excludedNumbers for backward compatibility
                        excludedNumbers.add(n);
                    });
                }

                // Add to tier-specific explanations
                const streakLength = stat?.current?.length || 0;
                const maxStreakLength = stat?.longest?.[0]?.length || 0;
                const gapGE = stat?.gapStats?.[streakLength + 1]?.lastGap || 0;
                const gapExact = stat?.exactGapStats?.[streakLength + 1]?.lastGap || 0;
                const minGapGE = stat?.gapStats?.[streakLength + 1]?.minGap || 0;
                const minGapExact = stat?.exactGapStats?.[streakLength + 1]?.minGap || 0;

                const explanationDetails = {
                    type: 'exclude',
                    title: getCategoryName(category, subcategory, key),
                    explanation: reason,
                    numbers: nums,
                    tier: tier,
                    // Chi tiết chuỗi
                    streak: streakLength,
                    maxStreak: maxStreakLength,
                    currentGap: gapGE || gapExact,
                    minGapGE: minGapGE,
                    minGapExact: minGapExact
                };

                explanationsByTier[tier].push({ ...explanationDetails, subTier });

                // Also add to legacy explanations
                explanations.push({ ...explanationDetails, subTier });
            } else {
                // Nếu không dự đoán được số nào, bỏ qua (không thêm vào danh sách)
            }
        }




        // --- IMMATURE SEQUENCE PREDICTIONS (Frequency-Based) ---
        // Kiểm tra các pattern thường chưa có chuỗi hiện tại nhưng số mới nhất có thể
        // bắt đầu chuỗi 1 ngày. Chỉ giữ nếu ngày tiếp theo hình thành 2d là chạm kỷ lục.
        const recentResults = await statisticsService.getRecentResults(1);
        if (recentResults && recentResults.length > 0) {
            const latestNumber = String(recentResults[0].special).padStart(2, '0');
            const latestCategories = identifyCategories(latestNumber);
            const totalYearsForPotential = lotteryService.getTotalYears();

            // Các subcategories cần kiểm tra
            const subcategoriesToCheck = [
                'veLienTiep',
                'tienLienTiep',
                'luiLienTiep',
                'tienDeuLienTiep',
                'luiDeuLienTiep',
                'veTheoThuTu',
                'veSoLeTheoThuTu'
            ];

            // Duyệt qua tất cả categories của số mới nhất
            for (const category of latestCategories) {
                for (const subcategory of subcategoriesToCheck) {
                    const key = `${category}:${subcategory}`;

                    // Bỏ qua nếu pattern đã có chuỗi hiện tại (đã được xử lý ở trên)
                    if (quickStats[key] && quickStats[key].current) continue;

                    // Lấy thông tin pattern từ quickStats
                    const stat = quickStats[key];
                    if (!stat) continue;

                    // Sử dụng computedMaxStreak (frequency-based) thay vì longest[0].length
                    const freqRecordLen = stat.computedMaxStreak || 0;
                    if (freqRecordLen !== 2) continue; // Tiềm năng 1 ngày dạng thường chỉ xét kỷ lục 2d

                    // Kiểm tra tần suất của mốc kỷ lục: nếu chuỗi dài freqRecordLen hiếm
                    // thì chuỗi đang ở ngày 1 có thể tiến tới đó
                    const targetLen = freqRecordLen;
                    const gapInfoExact = stat.exactGapStats ? stat.exactGapStats[targetLen] : null;
                    const targetCount = gapInfoExact ? gapInfoExact.count : 0;
                    const targetFreqYear = targetCount / totalYearsForPotential;

                    // Chỉ cảnh báo nếu mốc kỷ lục thực sự hiếm (<= 1.5 lần/năm)
                    if (targetFreqYear > 1.5) continue;

                    const isSuper = targetFreqYear <= 0.5;

                    // Kiểm tra gap: thời gian kể từ chuỗi cuối cùng đạt mốc kỷ lục
                    let shouldExclude = false;
                    let explanation = '';

                    // Ưu tiên kiểm tra dựa trên frequency (đơn giản, nhất quán)
                    // Nếu mốc kỷ lục hiếm VÀ gap đủ lớn so với minGap → cảnh báo
                    const gapInfoGE = stat.gapStats ? stat.gapStats[targetLen] : null;

                    let gapReason = '';
                    if (gapInfoExact && gapInfoExact.lastGap !== undefined && gapInfoExact.minGap !== null) {
                        const threshold = gapInfoExact.minGap * (1 + GAP_BUFFER_PERCENT);
                        if (gapInfoExact.lastGap >= threshold) {
                            // Gap đã vượt minGap → khả năng xuất hiện lại cao
                            shouldExclude = true;
                            gapReason = `Gap hiện tại (${gapInfoExact.lastGap} ngày) >= MinGap (${gapInfoExact.minGap})${GAP_BUFFER_PERCENT > 0 ? ` +${Math.round(GAP_BUFFER_PERCENT * 100)}%` : ''}`;
                        }
                    } else if (gapInfoGE && gapInfoGE.lastGap !== undefined && gapInfoGE.minGap !== null) {
                        const threshold = gapInfoGE.minGap * (1 + GAP_BUFFER_PERCENT);
                        if (gapInfoGE.lastGap >= threshold) {
                            shouldExclude = true;
                            gapReason = `Gap GE hiện tại (${gapInfoGE.lastGap} ngày) >= MinGap (${gapInfoGE.minGap})${GAP_BUFFER_PERCENT > 0 ? ` +${Math.round(GAP_BUFFER_PERCENT * 100)}%` : ''}`;
                        }
                    } else {
                        // Không có gap data nhưng mốc kỷ lục rất hiếm → vẫn cảnh báo
                        if (targetFreqYear <= 1.0) {
                            shouldExclude = true;
                            gapReason = `Không có dữ liệu gap (mốc KL rất hiếm)`;
                        }
                    }

                    if (shouldExclude) {
                        const tierLabel = isSuper ? 'Siêu KL' : 'KL';
                        explanation = `Chuỗi tiềm năng: Số mới nhất (${latestNumber}) thuộc dạng "${category}". Mốc ${tierLabel}: ${freqRecordLen} ngày (${targetFreqYear.toFixed(2)} lần/năm). ${gapReason}`;

                        const mockStat = {
                            longest: stat.longest,
                            current: { values: [latestNumber], length: 1 }
                        };
                        addExcludedNumber(mockStat, `[TIỀM NĂNG] ${key}`, explanation, 'purple');
                    }
                }
            }
        }

        // === SỬ DỤNG TRỰC TIẾP KẾT QUẢ TỪ PASS 2 (ĐÃ TÍCH LŨY THEO CHUỖI) ===
        // excludedNumbers đã được tích lũy trong PASS 2 theo thứ tự tỷ lệ gãy cao → thấp
        const finalExcludedNumbers = new Set(excludedNumbers);
        const finalExplanations = [...explanations];
        const appliedTiers = [];
        if (exclusionsByTier['red'].size > 0) appliedTiers.push('red');
        if (exclusionsByTier['purple'].size > 0) appliedTiers.push('purple');

        console.log(`[SUGGESTIONS] Tích lũy theo chuỗi (tỷ lệ gãy cao→thấp). Tổng loại trừ: ${finalExcludedNumbers.size} số, còn đánh: ${100 - finalExcludedNumbers.size} số.`);

        // Chuẩn bị kết quả cuối cùng
        const formatItem = (details, n) => {
            const numStr = String(n).padStart(2, '0');
            const [c, s] = details.sources[0].split(':');
            return {
                number: numStr,
                category: c,
                subcategory: s || '',
                reason: details.reason,
                sources: details.sources
            };
        };

        const result = {
            red: [],
            purple: [],
            orange: [],
            light_red: []
        };

        // Populate kết quả API
        appliedTiers.forEach(tier => {
            exclusionsByTier[tier].forEach((details, num) => {
                result[tier].push(formatItem(details, num));
            });
        });

        const allNumbers = Array.from({ length: 100 }, (_, k) => String(k).padStart(2, '0'));
        let numbersBet = allNumbers.filter(n => !finalExcludedNumbers.has(parseInt(n, 10)) && !finalExcludedNumbers.has(n));

        // Sort by rarity (gap)
        try {
            const rawData = lotteryService.getRawData() || [];
            const gapMap = new Map();
            for(let i=0; i<100; i++) gapMap.set(String(i).padStart(2, '0'), 100);
            for(let i=rawData.length-1; i>=0; i--) {
                const sp = rawData[i].special !== undefined ? rawData[i].special : rawData[i].lo2so?.[0];
                if(sp !== undefined && sp !== null) {
                    const numStr = String(sp).padStart(2, '0');
                    if(gapMap.get(numStr) === 100) {
                        gapMap.set(numStr, rawData.length - 1 - i);
                    }
                }
            }
            numbersBet.sort((a, b) => gapMap.get(b) - gapMap.get(a)); // higher gap (rarer) first
            var numbersBetWithGap = numbersBet.map(n => ({ num: n, gap: gapMap.get(n) }));
        } catch (e) {
            console.error('Error sorting numbersBet by rarity:', e);
            var numbersBetWithGap = numbersBet.map(n => ({ num: n, gap: 0 }));
        }

        const summaryMsg = `Loại trừ tổng cộng ${finalExcludedNumbers.size} số (${appliedTiers.join(', ')})`;
        console.log(`[SUGGESTIONS] ${summaryMsg}`);

        // Lấy 30 ngày gần nhất để hiển thị trên UI (ngày mới nhất ở đầu)
        const last30DaysResults = await statisticsService.getRecentResults(30);
        const last30Days = last30DaysResults.map(r => ({
            date: r.date,
            special: r.special
        })).reverse(); // Đảo ngược để ngày mới nhất ở đầu

        return res.json({
            success: true,
            summary: summaryMsg,
            counts: {
                total: finalExcludedNumbers.size,
                red: exclusionsByTier['red'].size,
                purple: exclusionsByTier['purple'].size,
                orange: 0,
                light_red: 0
            },
            data: result,
            numbersToBet: numbersBet,
            numbersToBetWithGap: numbersBetWithGap,
            excludedList: Array.from(finalExcludedNumbers).map(n => String(n).padStart(2, '0')).sort(),
            excludedNumbers: Array.from(finalExcludedNumbers).map(n => parseInt(n, 10)).sort((a, b) => a - b),
            // Thêm mảng explanations để tái sử dụng ở unifiedPrediction
            explanations: finalExplanations.map(exp => ({
                ...exp,
                combinedScore: exp.tier === 'red' ? 1.0 : (exp.tier === 'purple' ? 0.9 : 0.8)
            })),
            isSkipped: false,
            excludedCount: finalExcludedNumbers.size,
            tierInfo: {
                appliedTiers: appliedTiers,
                countByTier: {
                    red: exclusionsByTier['red'].size,
                    purple: exclusionsByTier['purple'].size,
                    orange: 0,
                    light_red: 0
                }
            },
            exclusionsByTier: {
                red: Array.from(exclusionsByTier['red'].keys()),
                purple: Array.from(exclusionsByTier['purple'].keys()),
                orange: [],
                light_red: []
            },
            // Phân loại theo 4 subTier để hiển thị màu khác nhau
            exclusionsBySubTier: {
                achieved: Array.from(exclusionsByTier['red'])
                    .filter(([, v]) => v.subTier === 'achieved')
                    .map(([n]) => n),
                achievedSuper: Array.from(exclusionsByTier['purple'])
                    .filter(([, v]) => v.subTier === 'achievedSuper')
                    .map(([n]) => n),
                threshold: Array.from(exclusionsByTier['red'])
                    .filter(([, v]) => v.subTier === 'threshold')
                    .map(([n]) => n),
                superThreshold: Array.from(exclusionsByTier['purple'])
                    .filter(([, v]) => v.subTier === 'superThreshold')
                    .map(([n]) => n)
            },
            countBySubTier: {
                achieved: Array.from(exclusionsByTier['red']).filter(([, v]) => v.subTier === 'achieved').length,
                achievedSuper: Array.from(exclusionsByTier['purple']).filter(([, v]) => v.subTier === 'achievedSuper').length,
                threshold: Array.from(exclusionsByTier['red']).filter(([, v]) => v.subTier === 'threshold').length,
                superThreshold: Array.from(exclusionsByTier['purple']).filter(([, v]) => v.subTier === 'superThreshold').length
            },
            last30Days: last30Days
        });
    } catch (error) {
        console.error('Error generating suggestions:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}

function getNumbersFromCategory(category) {
    if (!category) return [];
    if (isSoLeTheoCapCategory(category)) return [];
    
    // 1. CHUẨN HÓA KEY VÀ TRA CỨU TRỰC TIẾP TRONG SETS
    // Hỗ trợ tất cả các dạng: DAU_2, DIT_3, DAU_3D_2_4_9, TONG_TT_5, CHAN_CHAN, v.v.
    let setKey = category.toUpperCase();
    if (SETS[setKey]) {
        return SETS[setKey].map(n => parseInt(n, 10));
    }

    // 2. XỬ LÝ CÁC DẠNG ĐẶC BIỆT / CHƯA CHUẨN HÓA KEY
    if (category === 'tong_tt_lon') return Array.from({ length: 100 }, (_, i) => i).filter(n => getTongTT(String(n).padStart(2, '0')) >= 5);
    if (category === 'tong_tt_nho') return Array.from({ length: 100 }, (_, i) => i).filter(n => getTongTT(String(n).padStart(2, '0')) < 5);
    if (category === 'tong_moi_lon') return Array.from({ length: 100 }, (_, i) => i).filter(n => getTongMoi(String(n).padStart(2, '0')) >= 5);
    if (category === 'tong_moi_nho') return Array.from({ length: 100 }, (_, i) => i).filter(n => getTongMoi(String(n).padStart(2, '0')) < 5);
    if (category === 'tong_tt_cac_tong' || category === 'tong_moi_cac_tong' || category === 'hieu_cac_hieu') {
        return Array.from({ length: 100 }, (_, i) => i);
    }

    // 3. TRA CỨU THEO PREFIX NẾU KEY CHƯA KHỚP HOÀN TOÀN
    if (category.startsWith('dau_')) {
        const suffix = category.replace('dau_', '').toUpperCase();
        if (SETS['DAU_' + suffix]) return SETS['DAU_' + suffix].map(n => parseInt(n, 10));
    } else if (category.startsWith('dit_')) {
        const suffix = category.replace('dit_', '').toUpperCase();
        if (SETS['DIT_' + suffix]) return SETS['DIT_' + suffix].map(n => parseInt(n, 10));
    } else if (category.startsWith('tong_tt_')) {
        const suffix = category.replace('tong_tt_', '').toUpperCase();
        if (SETS['TONG_TT_' + suffix]) return SETS['TONG_TT_' + suffix].map(n => parseInt(n, 10));
    } else if (category.startsWith('tong_moi_')) {
        const suffix = category.replace('tong_moi_', '').toUpperCase();
        if (SETS['TONG_MOI_' + suffix]) return SETS['TONG_MOI_' + suffix].map(n => parseInt(n, 10));
    } else if (category.startsWith('hieu_')) {
        const suffix = category.replace('hieu_', '').toUpperCase();
        if (SETS['HIEU_' + suffix]) return SETS['HIEU_' + suffix].map(n => parseInt(n, 10));
    } else if (category.startsWith('dau_dit_tien_')) {
        const suffix = category.split('_')[3];
        if (SETS['DAU_DIT_TIEN_' + suffix]) return SETS['DAU_DIT_TIEN_' + suffix].map(n => parseInt(n, 10));
    }

    // 1. Try direct lookup
    if (SETS[setKey]) {
        return SETS[setKey].map(n => parseInt(n, 10));
    }

    // 2. Try dynamic group parsing (e.g., TONG_TT_5_6_7 or TONG_TT_5_7 as range)
    // Check for prefixes that support grouping
    const groupPrefixes = [
        { prefix: 'TONG_TT_', max: 10, min: 1 },
        { prefix: 'TONG_MOI_', max: 18, min: 0 },
        { prefix: 'HIEU_', max: 9, min: 0 }
    ];

    for (const config of groupPrefixes) {
        const { prefix, max, min } = config;
        if (setKey.startsWith(prefix)) {
            const suffix = setKey.replace(prefix, '');
            // Check if suffix contains underscores (indicating a group)
            if (suffix.includes('_')) {
                const parts = suffix.split('_').map(p => parseInt(p, 10));
                let targetNums = [];

                // Case A: Explicit list (e.g., 5_6_7) - handled by loop below if we treat it as list
                // Case B: Range (e.g., 5_7 -> 5, 6, 7) - common in this codebase

                // If exactly 2 parts, treat as range (START_END)
                if (parts.length === 2) {
                    const start = parts[0];
                    const end = parts[1];

                    // Validate range
                    if (!isNaN(start) && !isNaN(end) && start >= min && start <= max && end >= min && end <= max) {
                        // Generate sequence with wrap
                        let current = start;
                        let safetyCounter = 0;
                        const limit = (max - min) + 5; // Safety limit

                        while (current !== end) {
                            targetNums.push(current);
                            current++;
                            if (current > max) current = min;

                            safetyCounter++;
                            if (safetyCounter > limit) {
                                console.warn(`[getNumbersFromCategory] Infinite loop detected for key ${setKey}. Breaking.`);
                                break;
                            }
                        }
                        targetNums.push(end);
                    } else {
                        // Fallback: treat as explicit list if range is invalid
                        targetNums = parts;
                    }
                } else {
                    // Treat as explicit list
                    targetNums = parts;
                }

                // Fetch sets for each number
                let combinedNums = [];
                for (const num of targetNums) {
                    const individualKey = prefix + num;
                    if (SETS[individualKey]) {
                        combinedNums = [...combinedNums, ...SETS[individualKey]];
                    }
                }

                if (combinedNums.length > 0) {
                    // Deduplicate and return
                    return [...new Set(combinedNums)].map(n => parseInt(n, 10));
                }
            }
        }
    }

    // 3. Special cases: cacSo, cacDau, cacDit (for trend patterns)
    if (category === 'cacSo') {
        // All numbers 00-99
        return Array.from({ length: 100 }, (_, i) => i);
    }
    if (category === 'cacDau') {
        // All head digits - map to all numbers with that head
        // For now, return all 100 numbers. Logic for specific head will be handled by predictNextInSequence.
        return Array.from({ length: 100 }, (_, i) => i);
    }
    if (category === 'cacDit') {
        // All tail digits - map to all numbers with that tail
        return Array.from({ length: 100 }, (_, i) => i);
    }

    return [];
}

exports.getNumbersFromCategory = getNumbersFromCategory;

// === MOVED HELPER FUNCTIONS ===

function predictNextInSequence(stat, category, subcategory, isHistory = false) {
    // Lấy lastValue từ values hoặc value
    let lastValue = null;
    if (stat.current.values && stat.current.values.length > 0) {
        lastValue = stat.current.values[stat.current.values.length - 1];
    } else if (stat.current.value) {
        lastValue = stat.current.value;
    } else {
        return [];
    }

    const subCatStr = subcategory || '';
    let isProgressive = subCatStr.includes('tien') || category.includes('Tien'); // tienDeuLienTiep or tienLienTiep
    const isUniform = subCatStr.includes('Deu') || category.includes('Deu'); // Đều = uniform sequence
    const isVeLienTiep = subCatStr === 'veLienTiep' || subCatStr === 'veCungGiaTri' || category.includes('VeLienTiep'); // Về liên tiếp cùng giá trị
    const isSoLeTheoCap = subCatStr.toLowerCase() === 'soletheocap' || category.toLowerCase().includes('soletheocap');
    const isSoLe = (subCatStr.toLowerCase().includes('sole') || category.toLowerCase().includes('sole')) && !isSoLeTheoCap; // veSole, veSoleMoi (exclude soLeTheoCap)
    const isOrderedOccurrence = subCatStr === 'veTheoThuTu' || subCatStr === 'veSoLeTheoThuTu';
    const isTrendPrediction = ['tienDeuLienTiep', 'luiDeuLienTiep', 'tienLienTiep', 'luiLienTiep', 'tienDeu', 'luiDeu', 'tien', 'lui', 'dongTien', 'dongLui']
        .includes(subCatStr);

    const isTienLuiSoLe = subCatStr.toLowerCase().includes('tienluisole') || category.toLowerCase().includes('tienluisole') || subCatStr.toLowerCase().includes('luitiensole') || category.toLowerCase().includes('luitiensole');

    // --- [MỚI] XỬ LÝ PATTERN SEQUENCE ---
    if (category.startsWith('pattern_seq_')) {
        const parts = category.split('_');
        const pattern = parts.slice(2).map(p => p.toUpperCase()); // ['CC', 'CL', 'LC', 'LL']
        const currentLen = stat.current.length || stat.current.values?.length || 0;
        const nextParity = pattern[currentLen % pattern.length];
        const parityKeys = { 'CC': 'CHAN_CHAN', 'CL': 'CHAN_LE', 'LC': 'LE_CHAN', 'LL': 'LE_LE' };
        const setKey = parityKeys[nextParity];
        // Import SETS inside the function since it's declared globally at top but might need referencing
        const { SETS } = require('../utils/numberAnalysis');
        return SETS[setKey] ? SETS[setKey].map(n => parseInt(n, 10)) : [];
    }


    if (isTienLuiSoLe && stat.current.values && stat.current.values.length >= 2) {
        const vals = stat.current.values;
        const v2 = parseInt(vals[vals.length - 1], 10);
        const v1 = parseInt(vals[vals.length - 2], 10);
        if (!isNaN(v1) && !isNaN(v2)) {
            // If last step was progressive (v2 > v1), next step MUST BE regressive
            isProgressive = (v2 < v1);
        }
    }

    if (category === 'motDauVeLienTiep' || category === 'motDauVeSole' || category === 'motDauVeSoleMoi') {
        let theHead = null;
        if (stat.current.value) {
            const matches = String(stat.current.value).match(/\d+/g);
            if (matches && matches.length >= 2) {
                theHead = parseInt(matches[matches.length - 1], 10); // Extract the actual head digit
            }
        }
        if (theHead !== null && !isNaN(theHead)) {
            return Array.from({ length: 100 }, (_, i) => i).filter(n => Math.floor(n / 10) === theHead);
        }
    }

    if (category === 'motDitVeLienTiep' || category === 'motDitVeSole' || category === 'motDitVeSoleMoi') {
        let theTail = null;
        if (stat.current.value) {
            const matches = String(stat.current.value).match(/\d+/g);
            if (matches && matches.length >= 2) {
                theTail = parseInt(matches[matches.length - 1], 10); // Extract the actual tail digit
            }
        }
        if (theTail !== null && !isNaN(theTail)) {
            return Array.from({ length: 100 }, (_, i) => i).filter(n => (n % 10) === theTail);
        }
    }

    // --- [MỚI] XỬ LÝ SO LE THEO CẶP (ABAB PATTERN) ---
    // Pattern: A, B, A, B... nhưng A/B phải là 2 dạng khác nhau.
    if (isSoLeTheoCap) {
        if (!isSoLeTheoCapCategory(category)) return [];
        const pairNumbers = predictSoLeTheoCapNumbers(stat.current, category);
        return pairNumbers.length > 0 ? pairNumbers : [];
    }

    // Helper: Extract value based on category type
    const extractValue = (val, cat) => {
        const strVal = String(val).padStart(2, '0');

        // ALL composite patterns use full 2-digit number
        // Check if category is a composite pattern (contains multiple conditions)
        const compositePatterns = [
            'chanChan', 'chanLe', 'leChan', 'leLe',
            'dau_nho_dit_nho', 'dau_nho_dit_to', 'dau_to_dit_nho', 'dau_to_dit_to',
            'dau_chan_lon_4_dit_chan_lon_4', 'dau_chan_lon_4_dit_chan_nho_4',
            'dau_chan_nho_4_dit_chan_lon_4', 'dau_chan_nho_4_dit_chan_nho_4',
            'dau_chan_lon_4_dit_le_lon_5', 'dau_chan_lon_4_dit_le_nho_5',
            'dau_chan_nho_4_dit_le_lon_5', 'dau_chan_nho_4_dit_le_nho_5',
            'dau_le_lon_5_dit_chan_lon_4', 'dau_le_lon_5_dit_chan_nho_4',
            'dau_le_nho_5_dit_chan_lon_4', 'dau_le_nho_5_dit_chan_nho_4',
            'dau_le_lon_5_dit_le_lon_5', 'dau_le_lon_5_dit_le_nho_5',
            'dau_le_nho_5_dit_le_lon_5', 'dau_le_nho_5_dit_le_nho_5',
            'dau_4_dit_chan_lon_4', 'dau_4_dit_chan_nho_4', 'dau_4_dit_le_lon_5', 'dau_4_dit_le_nho_5',
            'dau_5_dit_chan_lon_4', 'dau_5_dit_chan_nho_4', 'dau_5_dit_le_lon_5', 'dau_5_dit_le_nho_5',
            'dit_4_dau_chan_lon_4', 'dit_4_dau_chan_nho_4', 'dit_4_dau_le_lon_5', 'dit_4_dau_le_nho_5',
            'dit_5_dau_chan_lon_4', 'dit_5_dau_chan_nho_4', 'dit_5_dau_le_lon_5', 'dit_5_dau_le_nho_5'
        ];

        if (compositePatterns.includes(cat)) return strVal;
        if (cat.startsWith('dau_dit_tien_')) return strVal; // Đồng tiến dùng cả số
        if (cat.startsWith('dong_step_')) return strVal; // Đồng step dùng cả số
        if (cat.match(/^(chan|le)_(chan|le)_(tong|hieu)/)) return strVal; // Parity + Sum/Diff dùng cả số

        // Special cases
        if (cat.startsWith('cacSo')) return strVal; // Full 2-digit number
        if (cat.startsWith('cacDau')) return strVal[0]; // Head digit
        if (cat.startsWith('cacDit')) return strVal[1]; // Tail digit
        if (cat.startsWith('dau_3d_')) return strVal[0]; // Đầu 3D
        if (cat.startsWith('dit_3d_')) return strVal[1]; // Đít 3D

        if (cat.startsWith('tong_tt_')) {
            const suffix = cat.replace('tong_tt_', '');
            if (suffix === 'cac_tong' || suffix.includes('chan') || suffix.includes('le') || suffix.includes('lon') || suffix.includes('nho') || suffix.includes('_')) return String(getTongTT(strVal));
            return strVal;
        }
        if (cat.startsWith('tong_moi_')) {
            const suffix = cat.replace('tong_moi_', '');
            if (suffix === 'cac_tong' || suffix.includes('chan') || suffix.includes('le') || suffix.includes('lon') || suffix.includes('nho') || suffix.includes('_')) return String(getTongMoi(strVal));
            return strVal;
        }
        if (cat.startsWith('hieu_')) {
            const suffix = cat.replace('hieu_', '');
            if (suffix === 'cac_hieu' || suffix.includes('chan') || suffix.includes('le') || suffix.includes('lon') || suffix.includes('nho') || suffix.includes('_')) return String(getHieu(strVal));
            return strVal;
        }
        if (cat.startsWith('dau_')) {
            const suffix = cat.replace('dau_', '');
            if (suffix === 'cac_dau' || suffix === 'chan' || suffix === 'le' || suffix === 'nho' || suffix === 'to' || suffix.includes('lon_hon') || suffix.includes('nho_hon')) return strVal[0];
            return strVal;
        }
        if (cat.startsWith('dit_')) {
            const suffix = cat.replace('dit_', '');
            if (suffix === 'cac_dit' || suffix === 'chan' || suffix === 'le' || suffix === 'nho' || suffix === 'to' || suffix.includes('lon_hon') || suffix.includes('nho_hon')) return strVal[1];
            return strVal;
        }
        return strVal;
    };

    const normalizeCurrentNumberString = (value) => {
        const matches = String(value || '').match(/\d+/g);
        if (!matches || matches.length === 0) return '';
        const digits = matches[matches.length - 1];
        return digits.length >= 2 ? digits.slice(-2).padStart(2, '0') : digits.padStart(2, '0');
    };

    const numbersForMetric = (metricPrefix, targetValue, metricGetter) => {
        const parsedTarget = parseInt(targetValue, 10);
        if (!Number.isFinite(parsedTarget)) return [];
        const setKey = `${metricPrefix}_${parsedTarget}`;
        if (SETS[setKey]) return SETS[setKey].map(n => parseInt(n, 10));
        return Array.from({ length: 100 }, (_, i) => i)
            .filter(n => metricGetter(String(n).padStart(2, '0')) === parsedTarget);
    };

    const numbersForHeadDigit = (digit) => {
        const normalizedDigit = String(digit);
        if (!/^\d$/.test(normalizedDigit)) return [];
        return Array.from({ length: 100 }, (_, i) => i)
            .filter(n => String(n).padStart(2, '0')[0] === normalizedDigit);
    };

    const numbersForTailDigit = (digit) => {
        const normalizedDigit = String(digit);
        if (!/^\d$/.test(normalizedDigit)) return [];
        return Array.from({ length: 100 }, (_, i) => i)
            .filter(n => String(n).padStart(2, '0')[1] === normalizedDigit);
    };

    const numericSuffixOrCurrentValue = (prefix) => {
        const suffix = category.replace(prefix, '');
        if (/^\d+$/.test(suffix)) return suffix;
        const rawNumber = normalizeCurrentNumberString(lastValue);
        if (!rawNumber) return null;
        return extractValue(rawNumber, category);
    };

    const resolveCurrentConcreteNumbers = () => {
        const rawNumber = normalizeCurrentNumberString(lastValue);

        if (category.startsWith('tong_tt_')) {
            return numbersForMetric('TONG_TT', numericSuffixOrCurrentValue('tong_tt_'), getTongTT);
        }
        if (category.startsWith('tong_moi_')) {
            return numbersForMetric('TONG_MOI', numericSuffixOrCurrentValue('tong_moi_'), getTongMoi);
        }
        if (category.startsWith('hieu_')) {
            return numbersForMetric('HIEU', numericSuffixOrCurrentValue('hieu_'), getHieu);
        }
        if (category === 'cacDau' || category === 'motDau' || category.startsWith('dau_')) {
            const digit = category.startsWith('dau_') && /^dau_\d$/.test(category)
                ? category.replace('dau_', '')
                : (rawNumber ? extractValue(rawNumber, category) : null);
            return numbersForHeadDigit(digit);
        }
        if (category === 'cacDit' || category === 'motDit' || category.startsWith('dit_')) {
            const digit = category.startsWith('dit_') && /^dit_\d$/.test(category)
                ? category.replace('dit_', '')
                : (rawNumber ? extractValue(rawNumber, category) : null);
            return numbersForTailDigit(digit);
        }
        if (category === 'cacSo' || category === 'motSo' || category.startsWith('cacSo') || category.startsWith('motSo')) {
            const parsed = parseInt(rawNumber, 10);
            return Number.isFinite(parsed) ? [parsed] : [];
        }

        const parsed = parseInt(rawNumber, 10);
        return Number.isFinite(parsed) ? [parsed] : [];
    };

    if (isSoLe && !isTienLuiSoLe && !isOrderedOccurrence) {
        const concreteNumbers = resolveCurrentConcreteNumbers();
        if (concreteNumbers.length > 0 && concreteNumbers.length < 100) return concreteNumbers;
        return getNumbersFromCategory(category).filter((_, index, arr) => arr.length < 100);
    }

    if (isTienLuiSoLe) {
        if (stat.current.values && stat.current.values.length >= 2) {
            const values = stat.current.values;
            const lastValStr = values[values.length - 1];
            const prevValStr = values[values.length - 2];

            const lastVal = parseInt(extractValue(lastValStr, category), 10);
            const prevVal = parseInt(extractValue(prevValStr, category), 10);

            let baseNums = getNumbersFromCategory(category);
            if (!baseNums || baseNums.length === 0) {
                baseNums = Array.from({ length: 100 }, (_, i) => i);
            }

            if (isHistory) {
                return baseNums;
            }

            const isTien = lastVal > prevVal;
            let possibleNextVals = [];

            if (isTien) { // Must go down => next < lastVal
                possibleNextVals = baseNums.filter(n => parseInt(extractValue(String(n).padStart(2, '0'), category), 10) < lastVal);
            } else { // Must go up => next > lastVal
                possibleNextVals = baseNums.filter(n => parseInt(extractValue(String(n).padStart(2, '0'), category), 10) > lastVal);
            }

            return [...new Set(possibleNextVals.map(n => parseInt(n, 10)))];
        }
        return [];
    }

    // === XỬ LÝ ĐẶC BIỆT CHO VỀ LIÊN TIẾP (CÙNG GIÁ TRỊ) ===
    // Khi một giá trị về liên tiếp (VD: Tổng 8 về 3 ngày liên tiếp),
    // ta loại trừ TẤT CẢ các số thuộc giá trị đó
    if (isVeLienTiep) {
        // Với Tổng TT
        if (category.startsWith('tong_tt_')) {
            return numbersForMetric('TONG_TT', numericSuffixOrCurrentValue('tong_tt_'), getTongTT);
        }
        // Với Tổng Mới
        if (category.startsWith('tong_moi_')) {
            return numbersForMetric('TONG_MOI', numericSuffixOrCurrentValue('tong_moi_'), getTongMoi);
        }
        // Với Hiệu
        if (category.startsWith('hieu_')) {
            return numbersForMetric('HIEU', numericSuffixOrCurrentValue('hieu_'), getHieu);
        }
        // Về liên tiếp:
        // Các category động (1 đầu, 1 đít, 1 số) cần phải giữ nguyên giá trị cuối
        if (['motDau', 'motDit', 'motSo', 'cacDau', 'cacDit', 'cacSo'].includes(category) || category.startsWith('dau_') || category.startsWith('dit_')) {
            return resolveCurrentConcreteNumbers();
        }
        return resolveCurrentConcreteNumbers();
    }

    // Xác định loại sequence và dự đoán giá trị tiếp theo
    let nextValue = null;
    let numberSet = null;
    let indexMap = null;

    // Check for Dong Tien / Dong Lui
    const isDongTien = subcategory === 'dongTien';
    const isDongLui = subcategory === 'dongLui';

    // === XÁC ĐỊNH SEQUENCE DỰA TRÊN CATEGORY ===

    // Helper: Parse sequence từ category
    const getSequence = (cat) => {
        // 1. Các dạng Tổng
        if (cat.startsWith('tong_tt_')) {
            const suffix = cat.replace('tong_tt_', '');
            if (suffix === 'cac_tong') return ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
            // Check simple patterns first (before checking includes('_'))
            if (suffix === 'chan') return SETS.TONG_TT_CHAN_SEQUENCE || ['2', '4', '6', '8', '10'];
            if (suffix === 'le') return SETS.TONG_TT_LE_SEQUENCE || ['1', '3', '5', '7', '9'];
            // Then check compound patterns
            if (suffix.includes('_')) {
                // When Tổng TT is formatted as 2 digits (01-10):
                if (suffix === 'chan_le') return ['1', '3', '5', '7', '9'];
                if (suffix === 'le_chan') return ['10'];
                if (suffix === 'chan_chan') return ['2', '4', '6', '8'];
                if (suffix === 'le_le') return [];
                // Parse range/group: 5_7 -> [5,6,7], 9_1 -> [9,10,1], 5_7_9 -> [5,7,9]
                const parts = suffix.split('_').map(n => parseInt(n));
                if (parts.length > 2 && parts.every(n => !isNaN(n))) {
                    return parts.map(String);
                }
                if (parts.length >= 2 && !isNaN(parts[0])) {
                    const fullSeq = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
                    const start = parts[0];
                    const end = parts[parts.length - 1];

                    if (start < end) {
                        return fullSeq.filter(n => n >= start && n <= end).map(String);
                    } else {
                        // Wrap: 9, 10, 1
                        return [...fullSeq.filter(n => n >= start), ...fullSeq.filter(n => n <= end)].map(String);
                    }
                }
            }
            // Dạng đơn: tong_tt_1 -> ['1'] (Logic cũ)
            // FIX: Trả về tập hợp số thuộc tổng này để hỗ trợ tìm kiếm sequence
            const nums = getNumbersFromCategory(cat);
            if (nums && nums.length > 0) return nums.map(n => String(n).padStart(2, '0'));
            return [suffix];
        }

        if (cat.startsWith('tong_moi_')) {
            const suffix = cat.replace('tong_moi_', '');
            if (suffix === 'cac_tong') return Array.from({ length: 19 }, (_, i) => String(i));
            // Check simple patterns first (before checking includes('_'))
            if (suffix === 'chan') return SETS.TONG_MOI_CHAN_SEQUENCE || Array.from({ length: 10 }, (_, i) => String(i * 2));
            if (suffix === 'le') return SETS.TONG_MOI_LE_SEQUENCE || Array.from({ length: 9 }, (_, i) => String(i * 2 + 1));
            // Then check compound patterns
            if (suffix.includes('_')) {
                if (suffix === 'chan_le') return ['1', '3', '5', '7', '9'];
                if (suffix === 'le_chan') return ['10', '12', '14', '16', '18'];
                if (suffix === 'chan_chan') return ['0', '2', '4', '6', '8'];
                if (suffix === 'le_le') return ['11', '13', '15', '17'];

                const parts = suffix.split('_').map(n => parseInt(n));
                if (parts.length > 2 && parts.every(n => !isNaN(n))) {
                    return parts.map(String);
                }
                if (parts.length >= 2 && !isNaN(parts[0])) {
                    const fullSeq = Array.from({ length: 19 }, (_, i) => i);
                    const start = parts[0];
                    const end = parts[parts.length - 1];
                    if (start < end) {
                        return fullSeq.filter(n => n >= start && n <= end).map(String);
                    } else {
                        return [...fullSeq.filter(n => n >= start), ...fullSeq.filter(n => n <= end)].map(String);
                    }
                }
            }
            // Dạng đơn: tong_moi_14
            const nums = getNumbersFromCategory(cat);
            if (nums && nums.length > 0) return nums.map(n => String(n).padStart(2, '0'));
            return [suffix];
        }

        // 2. Các dạng Hiệu
        if (cat.startsWith('hieu_')) {
            const suffix = cat.replace('hieu_', '');
            if (suffix === 'cac_hieu') return ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
            if (suffix === 'chan') return SETS.HIEU_CHAN_SEQUENCE || ['0', '2', '4', '6', '8'];
            if (suffix === 'le') return SETS.HIEU_LE_SEQUENCE || ['1', '3', '5', '7', '9'];

            if (suffix.includes('_')) {
                const parts = suffix.split('_').map(n => parseInt(n));
                if (parts.length > 2 && parts.every(n => !isNaN(n))) {
                    return parts.map(String);
                }
                if (parts.length >= 2) {
                    const fullSeq = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
                    const start = parts[0];
                    const end = parts[parts.length - 1];
                    if (start < end) {
                        return fullSeq.filter(n => n >= start && n <= end).map(String);
                    } else {
                        return [...fullSeq.filter(n => n >= start), ...fullSeq.filter(n => n <= end)].map(String);
                    }
                }
            }
            // Dạng đơn: hieu_0
            const nums = getNumbersFromCategory(cat);
            if (nums && nums.length > 0) return nums.map(n => String(n).padStart(2, '0'));
            return [suffix];
        }

        // 3. Các dạng Đầu/Đít Group
        if (cat === 'dau_nho' || cat === 'dit_nho') return ['0', '1', '2', '3', '4'];
        if (cat === 'dau_to' || cat === 'dit_to') return ['5', '6', '7', '8', '9'];
        if (cat === 'dau_chan' || cat === 'dit_chan') return ['0', '2', '4', '6', '8'];
        if (cat === 'dau_le' || cat === 'dit_le') return ['1', '3', '5', '7', '9'];
        if (cat.startsWith('dau_3d_') || cat.startsWith('dit_3d_')) {
            return cat.replace(/^(dau|dit)_3d_/, '').split('_').filter(v => /^\d$/.test(v));
        }

        // Trend patterns prefix
        if (cat.startsWith('cacSo')) return Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));
        if (cat.startsWith('cacDau')) return ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        if (cat.startsWith('cacDit') && !cat.startsWith('cacDitTien')) return ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        if (cat.startsWith('cacDit')) return ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']; // Actually just cacDit

        // Các dạng Đầu/Đít cụ thể (dau_le_lon_hon_5, etc.)
        if (cat.includes('lon_hon_') || cat.includes('nho_hon_')) {
            // Logic này đã có trong code cũ, nhưng ta có thể tổng quát hóa
            if (cat.includes('dau_le_lon_hon_5')) return ['7', '9']; // > 5 và lẻ: 7, 9
            if (cat.includes('dau_le_nho_hon_5')) return ['1', '3']; // < 5 và lẻ: 1, 3
            if (cat.includes('dau_chan_lon_hon_4')) return ['6', '8']; // > 4 và chẵn: 6, 8
            if (cat.includes('dau_chan_nho_hon_4')) return ['0', '2']; // < 4 và chẵn: 0, 2
            // Tương tự cho đít...
            if (cat.includes('dit_le_lon_hon_5')) return ['7', '9'];
            if (cat.includes('dit_le_nho_hon_5')) return ['1', '3'];
            if (cat.includes('dit_chan_lon_hon_4')) return ['6', '8'];
            if (cat.includes('dit_chan_nho_hon_4')) return ['0', '2'];
        }

        // 4. Composite patterns - these track 2-digit numbers, not individual digits
        // Basic composite patterns
        if (cat === 'chanChan') return SETS['CHAN_CHAN'] || [];
        if (cat === 'chanLe') return SETS['CHAN_LE'] || [];
        if (cat === 'leChan') return SETS['LE_CHAN'] || [];
        if (cat === 'leLe') return SETS['LE_LE'] || [];

        // Size-based composite patterns
        if (cat === 'dau_nho_dit_nho') return SETS['DAU_NHO_DIT_NHO'] || [];
        if (cat === 'dau_nho_dit_to') return SETS['DAU_NHO_DIT_TO'] || [];
        if (cat === 'dau_to_dit_nho') return SETS['DAU_TO_DIT_NHO'] || [];
        if (cat === 'dau_to_dit_to') return SETS['DAU_TO_DIT_TO'] || [];

        // Complex conditional composite patterns
        if (cat === 'dau_chan_lon_4_dit_chan_lon_4') return SETS['DAU_CHAN_LON_4_DIT_CHAN_LON_4'] || [];
        if (cat === 'dau_chan_lon_4_dit_chan_nho_4') return SETS['DAU_CHAN_LON_4_DIT_CHAN_NHO_4'] || [];
        if (cat === 'dau_chan_nho_4_dit_chan_lon_4') return SETS['DAU_CHAN_NHO_4_DIT_CHAN_LON_4'] || [];
        if (cat === 'dau_chan_nho_4_dit_chan_nho_4') return SETS['DAU_CHAN_NHO_4_DIT_CHAN_NHO_4'] || [];
        if (cat === 'dau_chan_lon_4_dit_le_lon_5') return SETS['DAU_CHAN_LON_4_DIT_LE_LON_5'] || [];
        if (cat === 'dau_chan_lon_4_dit_le_nho_5') return SETS['DAU_CHAN_LON_4_DIT_LE_NHO_5'] || [];
        if (cat === 'dau_chan_nho_4_dit_le_lon_5') return SETS['DAU_CHAN_NHO_4_DIT_LE_LON_5'] || [];
        if (cat === 'dau_chan_nho_4_dit_le_nho_5') return SETS['DAU_CHAN_NHO_4_DIT_LE_NHO_5'] || [];
        if (cat === 'dau_le_lon_5_dit_chan_lon_4') return SETS['DAU_LE_LON_5_DIT_CHAN_LON_4'] || [];
        if (cat === 'dau_le_lon_5_dit_chan_nho_4') return SETS['DAU_LE_LON_5_DIT_CHAN_NHO_4'] || [];
        if (cat === 'dau_le_nho_5_dit_chan_lon_4') return SETS['DAU_LE_NHO_5_DIT_CHAN_LON_4'] || [];
        if (cat === 'dau_le_nho_5_dit_chan_nho_4') return SETS['DAU_LE_NHO_5_DIT_CHAN_NHO_4'] || [];
        if (cat === 'dau_le_lon_5_dit_le_lon_5') return SETS['DAU_LE_LON_5_DIT_LE_LON_5'] || [];
        if (cat === 'dau_le_lon_5_dit_le_nho_5') return SETS['DAU_LE_LON_5_DIT_LE_NHO_5'] || [];
        if (cat === 'dau_le_nho_5_dit_le_lon_5') return SETS['DAU_LE_NHO_5_DIT_LE_LON_5'] || [];
        if (cat === 'dau_le_nho_5_dit_le_nho_5') return SETS['DAU_LE_NHO_5_DIT_LE_NHO_5'] || [];

        // Specific digit composite patterns
        if (cat === 'dau_4_dit_chan_lon_4') return SETS['DAU_4_DIT_CHAN_LON_4'] || [];
        if (cat === 'dau_4_dit_chan_nho_4') return SETS['DAU_4_DIT_CHAN_NHO_4'] || [];
        if (cat === 'dau_4_dit_le_lon_5') return SETS['DAU_4_DIT_LE_LON_5'] || [];
        if (cat === 'dau_4_dit_le_nho_5') return SETS['DAU_4_DIT_LE_NHO_5'] || [];
        if (cat === 'dau_5_dit_chan_lon_4') return SETS['DAU_5_DIT_CHAN_LON_4'] || [];
        if (cat === 'dau_5_dit_chan_nho_4') return SETS['DAU_5_DIT_CHAN_NHO_4'] || [];
        if (cat === 'dau_5_dit_le_lon_5') return SETS['DAU_5_DIT_LE_LON_5'] || [];
        if (cat === 'dau_5_dit_le_nho_5') return SETS['DAU_5_DIT_LE_NHO_5'] || [];
        if (cat === 'dit_4_dau_chan_lon_4') return SETS['DIT_4_DAU_CHAN_LON_4'] || [];
        if (cat === 'dit_4_dau_chan_nho_4') return SETS['DIT_4_DAU_CHAN_NHO_4'] || [];
        if (cat === 'dit_4_dau_le_lon_5') return SETS['DIT_4_DAU_LE_LON_5'] || [];
        if (cat === 'dit_4_dau_le_nho_5') return SETS['DIT_4_DAU_LE_NHO_5'] || [];
        if (cat === 'dit_5_dau_chan_lon_4') return SETS['DIT_5_DAU_CHAN_LON_4'] || [];
        if (cat === 'dit_5_dau_chan_nho_4') return SETS['DIT_5_DAU_CHAN_NHO_4'] || [];
        if (cat === 'dit_5_dau_le_lon_5') return SETS['DIT_5_DAU_LE_LON_5'] || [];
        if (cat === 'dit_5_dau_le_nho_5') return SETS['DIT_5_DAU_LE_NHO_5'] || [];

        // 5. Đồng Tiến
        if (cat.startsWith('dau_dit_tien_')) {
            const setKey = 'DAU_DIT_TIEN_' + cat.split('_')[3];
            return SETS[setKey] || [];
        }

        const directSetKey = cat.toUpperCase();
        if (SETS[directSetKey]) {
            return SETS[directSetKey].map(n => String(n).padStart(2, '0'));
        }

        // 6. Special cases: cacSo, cacDau, cacDit
        if (cat === 'cacSo') {
            // All numbers 00-99
            return Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));
        }
        if (cat === 'cacDau') {
            // All head digits 0-9
            return ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        }
        if (cat === 'cacDit') {
            // All tail digits 0-9
            return ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        }

        // 7. Đầu/Đít đơn (cho Dong Tien/Dong Lui)
        if (cat.startsWith('dau_') && !cat.includes('_')) return ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        if (cat.startsWith('dit_') && !cat.includes('_')) return ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

        return null;
    };

    // Helper extractValue moved to top.

    const lastValueToPredict = extractValue(lastValue, category);

    let nextValues = []; // Changed from single nextValue to array

    numberSet = getSequence(category);

    if (isOrderedOccurrence && numberSet) {
        const nextValue = findNextInSequenceWithWrap(lastValueToPredict, numberSet, true);
        if (nextValue !== null) nextValues.push(nextValue);
    } else if (subcategory === 'soLeTheoCap' || subcategory === 'cacDauSoLeTheoCap' || subcategory === 'cacDitSoLeTheoCap') {
        const values = currentStreak.values || [];
        if (values.length >= 2) {
            nextValues = [values[values.length - 2]];
        }
    } else if (numberSet) {
        indexMap = new Map(numberSet.map((v, i) => [v, i]));

        // Xử lý logic dự đoán
        if (isUniform) {
            // Đều: Tìm next trong set CÓ WRAP
            // Sử dụng findNextInSequenceWithWrap thay vì findNextInSet (không wrap)
            const val = findNextInSequenceWithWrap(lastValueToPredict, numberSet, isProgressive);
            if (val !== null) nextValues.push(val);
        } else if (isDongTien || isDongLui) {
            // Đồng Tiến / Đồng Lùi:
            // Đồng Tiến: Lấy tất cả số LỚN HƠN lastValue trong set (KHÔNG WRAP)
            // Đồng Lùi: Lấy tất cả số NHỎ HƠN lastValue trong set (KHÔNG WRAP)
            nextValues = getAllGreaterOrSmaller(lastValueToPredict, numberSet, isDongTien, false);
        } else {
            // Liên Tiếp:
            // Đi theo vòng tròn của sequence: ở cuối thì tiến về đầu, ở đầu thì lùi về cuối.
            nextValues = getAllGreaterOrSmaller(lastValueToPredict, numberSet, isProgressive, true);
        }
    } else {
        // Trend chưa support sequence thì không fallback full set vì sẽ loại sai quá rộng.
        return isTrendPrediction ? [] : getNumbersFromCategory(category);
    }

    // === TRẢ VỀ KẾT QUẢ ===

    const resultNumbers = [];

    // Định nghĩa composite patterns để check
    const compositePatterns = [
        'chanChan', 'chanLe', 'leChan', 'leLe',
        'dau_nho_dit_nho', 'dau_nho_dit_to', 'dau_to_dit_nho', 'dau_to_dit_to',
        'dau_chan_lon_4_dit_chan_lon_4', 'dau_chan_lon_4_dit_chan_nho_4',
        'dau_chan_nho_4_dit_chan_lon_4', 'dau_chan_nho_4_dit_chan_nho_4',
        'dau_chan_lon_4_dit_le_lon_5', 'dau_chan_lon_4_dit_le_nho_5',
        'dau_chan_nho_4_dit_le_lon_5', 'dau_chan_nho_4_dit_le_nho_5',
        'dau_le_lon_5_dit_chan_lon_4', 'dau_le_lon_5_dit_chan_nho_4',
        'dau_le_nho_5_dit_chan_lon_4', 'dau_le_nho_5_dit_chan_nho_4',
        'dau_le_lon_5_dit_le_lon_5', 'dau_le_lon_5_dit_le_nho_5',
        'dau_le_nho_5_dit_le_lon_5', 'dau_le_nho_5_dit_le_nho_5',
        'dau_4_dit_chan_lon_4', 'dau_4_dit_chan_nho_4', 'dau_4_dit_le_lon_5', 'dau_4_dit_le_nho_5',
        'dau_5_dit_chan_lon_4', 'dau_5_dit_chan_nho_4', 'dau_5_dit_le_lon_5', 'dau_5_dit_le_nho_5',
        'dit_4_dau_chan_lon_4', 'dit_4_dau_chan_nho_4', 'dit_4_dau_le_lon_5', 'dit_4_dau_le_nho_5',
        'dit_5_dau_chan_lon_4', 'dit_5_dau_chan_nho_4', 'dit_5_dau_le_lon_5', 'dit_5_dau_le_nho_5'
    ];

    // Duyệt qua tất cả các giá trị dự đoán được
    // Duyệt qua tất cả các giá trị dự đoán được
    for (const nextVal of nextValues) {
        // Với Tổng TT
        if (category.startsWith('tong_tt_')) {
            const suffix = category.replace('tong_tt_', '');
            if (suffix === 'cac_tong' || suffix.includes('chan') || suffix.includes('le') || suffix.includes('_')) {
                let targetSum = parseInt(nextVal, 10);
                const sumKey = `TONG_TT_${targetSum}`;
                if (SETS[sumKey]) resultNumbers.push(...SETS[sumKey].map(n => parseInt(n, 10)));
                else {
                    resultNumbers.push(...Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => getTongTT(String(n).padStart(2, '0')) === targetSum));
                }
            } else {
                resultNumbers.push(parseInt(nextVal, 10));
            }
        }
        // Với Tổng Mới
        else if (category.startsWith('tong_moi_')) {
            const suffix = category.replace('tong_moi_', '');
            if (suffix === 'cac_tong' || suffix.includes('chan') || suffix.includes('le') || suffix.includes('_')) {
                const targetSum = parseInt(nextVal, 10);
                const sumKey = `TONG_MOI_${targetSum}`;
                if (SETS[sumKey]) resultNumbers.push(...SETS[sumKey].map(n => parseInt(n, 10)));
                else {
                    resultNumbers.push(...Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => getTongMoi(String(n).padStart(2, '0')) === targetSum));
                }
            } else {
                resultNumbers.push(parseInt(nextVal, 10));
            }
        }
        // Với Hiệu
        else if (category.startsWith('hieu_')) {
            const suffix = category.replace('hieu_', '');
            if (suffix === 'cac_hieu' || suffix.includes('chan') || suffix.includes('le') || suffix.includes('_')) {
                const targetHieu = parseInt(nextVal, 10);
                const hieuKey = `HIEU_${targetHieu}`;
                if (SETS[hieuKey]) resultNumbers.push(...SETS[hieuKey].map(n => parseInt(n, 10)));
                else {
                    resultNumbers.push(...Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => getHieu(String(n).padStart(2, '0')) === targetHieu));
                }
            } else {
                resultNumbers.push(parseInt(nextVal, 10));
            }
        }
        // Với Đồng Tiến
        else if (category.startsWith('dau_dit_tien_')) {
            resultNumbers.push(parseInt(nextVal, 10));
        }
        // Special cases: cacSo, cacDau, cacDit
        else if (category.startsWith('cacSo') || category.startsWith('motSo')) {
            resultNumbers.push(parseInt(nextVal, 10));
        }
        else if (category.startsWith('cacDau') || category.startsWith('motDau')) {
            const targetDigit = nextVal;
            resultNumbers.push(...Array.from({ length: 100 }, (_, i) => i)
                .filter(n => String(n).padStart(2, '0')[0] === targetDigit));
        }
        else if (category.startsWith('cacDit') || category.startsWith('motDit')) {
            const targetDigit = nextVal;
            resultNumbers.push(...Array.from({ length: 100 }, (_, i) => i)
                .filter(n => String(n).padStart(2, '0')[1] === targetDigit));
        }
        // Với Composite patterns
        else if (compositePatterns.includes(category)) {
            resultNumbers.push(parseInt(nextVal, 10));
        }
        // Với Đầu/Đít đơn lẻ
        else if (category.startsWith('dau_')) {
            const suffix = category.replace('dau_', '');
            if (suffix.startsWith('3d_') || suffix === 'cac_dau' || suffix === 'chan' || suffix === 'le' || suffix === 'nho' || suffix === 'to' || suffix.includes('lon_hon') || suffix.includes('nho_hon')) {
                const targetDigit = nextVal;
                resultNumbers.push(...Array.from({ length: 100 }, (_, i) => i)
                    .filter(n => String(n).padStart(2, '0')[0] === targetDigit));
            } else {
                resultNumbers.push(parseInt(nextVal, 10));
            }
        }
        else if (category.startsWith('dit_')) {
            const suffix = category.replace('dit_', '');
            if (suffix.startsWith('3d_') || suffix === 'cac_dit' || suffix === 'chan' || suffix === 'le' || suffix === 'nho' || suffix === 'to' || suffix.includes('lon_hon') || suffix.includes('nho_hon')) {
                const targetDigit = nextVal;
                resultNumbers.push(...Array.from({ length: 100 }, (_, i) => i)
                    .filter(n => String(n).padStart(2, '0')[1] === targetDigit));
            } else {
                resultNumbers.push(parseInt(nextVal, 10));
            }
        }
        else if (SETS[category.toUpperCase()]) {
            resultNumbers.push(parseInt(nextVal, 10));
        }
    }

    if (resultNumbers.length > 0) {
        return [...new Set(resultNumbers)]; // Remove duplicates if any
    }

    // Fallback cuối cùng. Trend không fallback full category vì sẽ tạo loại trừ sai.
    return isTrendPrediction ? [] : getNumbersFromCategory(category);
}

exports.predictNextInSequence = predictNextInSequence; // Export for exclusionService
exports.getNumbersFromCategory = getNumbersFromCategory; // Export for exclusionService

// Helper function: Tìm số tiếp theo trong set CÓ WRAP
function findNextInSequenceWithWrap(currentValue, numberSet, isProgressive) {
    const orderedSet = [...numberSet].map(String);
    const normalizedCurrent = String(currentValue);
    const currentIndex = orderedSet.indexOf(normalizedCurrent);

    if (currentIndex === -1) return null;

    if (isProgressive) {
        if (currentIndex === orderedSet.length - 1) return orderedSet[0]; // Wrap to first
        return orderedSet[currentIndex + 1];
    } else {
        if (currentIndex === 0) return orderedSet[orderedSet.length - 1]; // Wrap to last
        return orderedSet[currentIndex - 1];
    }
}

// Helper function: Lấy TẤT CẢ các số lớn hơn/nhỏ hơn trong set (cho Liên Tiếp)
// wrap: có cho phép wrap về đầu/cuối không (mặc định true)
function getAllGreaterOrSmaller(currentValue, numberSet, isProgressive, wrap = true) {
    const orderedSet = [...numberSet].map(String);
    const normalizedCurrent = String(currentValue);
    const currentIndex = orderedSet.indexOf(normalizedCurrent);

    if (currentIndex === -1) return [];

    let result = [];
    if (isProgressive) {
        // Tiến: Lấy tất cả số lớn hơn
        const greater = orderedSet.slice(currentIndex + 1);
        // Nếu đã ở cuối, wrap về đầu (nếu cho phép)
        if (greater.length === 0 && wrap) {
            // Forward wrap: Return Min value ONLY
            result = [orderedSet[0]];
        } else {
            // Normal forward: Return ALL greater values
            result = greater;
        }
    } else {
        // Lùi: Lấy tất cả số nhỏ hơn
        const smaller = orderedSet.slice(0, currentIndex);
        // Nếu đã ở đầu, wrap về cuối (nếu cho phép)
        if (smaller.length === 0 && wrap) {
            // Backward wrap: Return Max value ONLY
            result = [orderedSet[orderedSet.length - 1]];
        } else {
            // Normal backward: Return ALL smaller values
            result = smaller;
        }
    }

    // Safety check: Đảm bảo không bao gồm giá trị hiện tại
    return result.filter(v => v !== normalizedCurrent);
}

exports.predictNextInSequence = predictNextInSequence;
