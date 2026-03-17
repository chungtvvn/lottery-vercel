const statisticsService = require('../services/statisticsService');
const { SETS, findNextInSet, findPreviousInSet, INDEX_MAPS, getTongTT, getTongMoi, getHieu, identifyCategories, extractValueForComparison } = require('../utils/numberAnalysis');

const STATS_CONFIG = require('../config/stats-config');
const EXCLUSION_TIERS = require('../config/exclusion-tiers');
const exclusionLogic = require('../services/exclusionLogicService');

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

        for (const key in quickStats) {
            const stat = quickStats[key];

            // Remove strict date check to match frontend display
            if (!stat.current) continue;

            const currentLen = stat.current.length;
            const [category, subcategory] = key.split(':');

            // IMPORTANT: tienLuiSoLe and luiTienSoLe are NOT "so le" patterns (they are consecutive)
            const isSoLePattern = (subcategory && (subcategory.toLowerCase() === 'vesole' || subcategory.toLowerCase() === 'vesolemoi')) &&
                key !== 'tienLuiSoLe' && key !== 'luiTienSoLe';

            // For so le patterns, targetLen = currentLen + 2 (skip every other day)
            // For other patterns (including tienLuiSoLe), targetLen = currentLen + 1
            const targetLen = isSoLePattern ? currentLen + 2 : currentLen + 1;

            const gapInfoGE = stat.gapStats ? stat.gapStats[targetLen] : null;
            const gapInfoExact = stat.exactGapStats ? stat.exactGapStats[targetLen] : null;
            const extensionGapInfo = stat.extensionGapStats ? stat.extensionGapStats[currentLen] : null;

            // MỐC KỶ LỤC MỚI
            const recordLen = stat.computedMaxStreak || stat.longest?.[0]?.length || 0;

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

            let shouldExclude = false;
            let reason = '';
            let tier = null; // 'red', 'purple'
            let subTier = null; // 'achieved' | 'achievedSuper' | 'threshold' | 'superThreshold'

            // --- YÊu CẦU MỚI: Dự đoán Kỷ lục/Siêu KL cho ngày tiếp theo ---
            const lotteryService = require('../services/lotteryService');
            const totalYears = lotteryService.getTotalYears();
            const targetCount = gapInfoExact ? gapInfoExact.count : 0;
            const targetFreqYear = targetCount / totalYears;
            const isSuper = targetFreqYear <= 0.5 || stat.isSuperMaxThreshold;

            if (targetFreqYear <= 1.5 || (currentLen >= recordLen && recordLen > 0)) {
                shouldExclude = true;

                if (currentLen >= recordLen && recordLen > 0) {
                    if (isSuper) {
                        // Đạt SIÊu kỷ lục
                        tier = 'purple';
                        subTier = 'achievedSuper';
                        reason = `[TÍM ĐẬM] Chuỗi hiện tại (${currentLen} ngày) ĐÃ ĐẠT SIÊu KỶ LỤC (${recordLen} ngày). Cực kỳ hiếm!`;
                    } else {
                        // Đạt kỷ lục thường
                        tier = 'red';
                        subTier = 'achieved';
                        reason = `[Đᷠ] Chuỗi hiện tại (${currentLen} ngày) ĐÃ đạt Kỷ Lục (${recordLen} ngày). Xác suất tiếp tục gần như bằng 0.`;
                    }
                } else if (isSuper) {
                    // Tới hạn SIÊu kỷ lục
                    tier = 'purple';
                    subTier = 'superThreshold';
                    reason = `[TÍM] TỚI HẠN SIÊu KỶ LỤC: Chuỗi ${targetLen} ngày là Siêu KL (chỉ xuất hiện ${targetFreqYear.toFixed(2)} lần/năm). Lên tiếp cực khó!`;
                } else {
                    // Tới hạn kỷ lục thường
                    tier = 'red';
                    subTier = 'threshold';
                    reason = `[Đᷠ] TỚI HẠN KỶ LỤC: Chuỗi ${targetLen} ngày là Kỷ Lục (chỉ xuất hiện ${targetFreqYear.toFixed(2)} lần/năm). Lên tiếp cực khó!`;
                }
                reason = formatSequence(reason);
            }

            // 2. BỢ QUA KIỂM TRA GAP THEO YÊu CẦU MỚI
            // Only add RED and PURPLE tier patterns immediately 
            if (shouldExclude && (tier === 'red' || tier === 'purple')) {
                // Không loại trừ các pattern Lớn, Nhỏ của Tổng TT, Tổng Mới, Hiệu
                const [cat] = key.split(':');
                const isExcludedPattern = cat === 'tong_tt_lon' || cat === 'tong_tt_nho' ||
                    cat === 'tong_moi_lon' || cat === 'tong_moi_nho' ||
                    cat === 'hieu_lon' || cat === 'hieu_nho';

                if (!isExcludedPattern) {
                    addExcludedNumber(stat, key, reason, tier, subTier);
                } else {
                    // console.log('Bỏ qua loại trừ pattern lớn/nhỏ của tổng và hiệu:', key);
                }
            }
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
                    // 1 đầu/đít
                    'motDauVeLienTiep': '1 Đầu - Về liên tiếp',
                    'motDauVeSole': '1 Đầu - Về so le',
                    'motDauVeSoleMoi': '1 Đầu - Về so le Mới',
                    'motDitVeLienTiep': '1 Đít - Về liên tiếp',
                    'motDitVeSole': '1 Đít - Về so le',
                    'motDitVeSoleMoi': '1 Đít - Về so le Mới'
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
                else catName = `Đít - ${suffix}`;
            }

            // Add subcategory suffix if present
            if (subcategory) {
                if (subcategory === 'veLienTiep') return `${catName} - Về liên tiếp`;
                if (subcategory === 'veSole') return `${catName} - Về so le`;
                if (subcategory === 'veSoleMoi') return `${catName} - Về so le mới`;
                if (subcategory === 'veCungGiaTri') return `${catName} - Về cùng giá trị`;
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

        function addExcludedNumber(stat, key, reason, tier = 'red', subTier = null) {
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
                    'LuiDeuLienTiep', 'TienDeuLienTiep',
                    'LuiLienTiep', 'TienLienTiep',
                    'LuiDeu', 'TienDeu',
                    'VeLienTiep', 'VeCungGiaTri', 'VeSole', 'VeSoleMoi',
                    'DongTien', 'DongLui',
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
                    if (cleanKey !== 'tienLuiSoLe') {
                        console.warn(`[Suggestions] Unable to parse key: ${cleanKey}`);
                    }
                    category = cleanKey;
                    subcategory = '';
                }
            }

            // Xử lý các dạng Tiến/Lùi (Đều hoặc Liên Tiếp) - dự đoán giá trị tiếp theo
            // Hỗ trợ cả dạng có LienTiep (luiLienTiep) và không (lui)
            // --- [ĐỒNG BỘ 100% VỚI STATISTICS] ---
            if (stat.current && stat.current.patternNumbers && stat.current.patternNumbers.length > 0) {
                nums = [...stat.current.patternNumbers];
            }
            // --- [HẾT ĐỒNG BỘ] ---
            // NẾU KHÔNG CÓ TRONG CACHE HOẶC LÀ TỪ [TIỀM NĂNG], TÍNH TOÁN LẠI:
            else {
                const trendPatterns = [
                    'tienDeuLienTiep', 'luiDeuLienTiep', 'tienLienTiep', 'luiLienTiep',
                    'tienDeu', 'luiDeu', 'tien', 'lui'
                ];
                if (trendPatterns.includes(subcategory)) {
                    // Chuẩn hóa subcategory để predictNextInSequence xử lý đúng
                    let normalizedSubcategory = subcategory;
                    if (subcategory === 'lui') normalizedSubcategory = 'luiLienTiep';
                    else if (subcategory === 'tien') normalizedSubcategory = 'tienLienTiep';
                    else if (subcategory === 'luiDeu') normalizedSubcategory = 'luiDeuLienTiep';
                    else if (subcategory === 'tienDeu') normalizedSubcategory = 'tienDeuLienTiep';

                    nums = predictNextInSequence(stat, category, normalizedSubcategory);
                }
                // Xử lý các dạng về liên tiếp - cùng số
                else if (subcategory === 'veLienTiep' || subcategory === 'veCungGiaTri') {
                    // Kiểm tra xem đây là dạng gì
                    if (category.startsWith('dau_')) {
                        // Đầu X về liên tiếp → tất cả số có đầu = X
                        const digit = category.split('_')[1];
                        nums = Array.from({ length: 100 }, (_, i) => i)
                            .filter(n => String(n).padStart(2, '0')[0] === digit);
                    } else if (category.startsWith('dit_')) {
                        // Đít X về liên tiếp → tất cả số có đít = X
                        const digit = category.split('_')[1];
                        nums = Array.from({ length: 100 }, (_, i) => i)
                            .filter(n => String(n).padStart(2, '0')[1] === digit);
                    } else if (category.startsWith('tong_tt_') || category.startsWith('tong_moi_') || category.startsWith('hieu_')) {
                        // Check if category is specific (e.g., tong_moi_11) or generic (e.g., tong_moi_cac_tong)
                        let specificSet = getNumbersFromCategory(category);

                        if (specificSet && specificSet.length > 0) {
                            // Specific category (e.g., tong_moi_11) -> Exclude all numbers in that set
                            nums = specificSet;
                        } else {
                            // Generic category -> Use current value to determine the set
                            // values contains actual numbers (e.g., "26", "35"), need to calculate sum/diff
                            let lastNumber = null;
                            if (stat.current.value && stat.current.value !== 'Theo dạng') {
                                lastNumber = String(stat.current.value).padStart(2, '0');
                            } else if (stat.current.values && stat.current.values.length > 0) {
                                lastNumber = String(stat.current.values[stat.current.values.length - 1]).padStart(2, '0');
                            }

                            if (lastNumber !== null && lastNumber.length === 2) {
                                const digit1 = parseInt(lastNumber[0], 10);
                                const digit2 = parseInt(lastNumber[1], 10);

                                let calculatedValue = null;
                                let tempCategory = '';

                                if (category.startsWith('tong_tt_')) {
                                    // Tổng TT = digit1 + digit2 (1-10, với 10 là 0)
                                    calculatedValue = digit1 + digit2;
                                    if (calculatedValue === 0) calculatedValue = 10;
                                    tempCategory = `tong_tt_${calculatedValue}`;
                                } else if (category.startsWith('tong_moi_')) {
                                    // Tổng Mới = tổng của 2 chữ số (0-18)
                                    calculatedValue = digit1 + digit2;
                                    tempCategory = `tong_moi_${calculatedValue}`;
                                } else if (category.startsWith('hieu_')) {
                                    // Hiệu = |digit1 - digit2| (0-9)
                                    calculatedValue = Math.abs(digit1 - digit2);
                                    tempCategory = `hieu_${calculatedValue}`;
                                }

                                if (tempCategory) {
                                    nums = getNumbersFromCategory(tempCategory);
                                }
                            }
                        }

                        // Fallback if nums is still empty (e.g. could not parse value)
                        if (!nums || nums.length === 0) {
                            if (stat.current.value && stat.current.value !== 'Theo dạng') {
                                nums = [parseInt(stat.current.value, 10)];
                            } else if (stat.current.values && stat.current.values.length > 0) {
                                nums = stat.current.values.map(v => parseInt(v, 10));
                            }
                        }
                    } else {
                        // For composite patterns (leChan, chanLe, etc.), use values array
                        // because value contains 'Theo dạng' string
                        if (stat.current.values && stat.current.values.length > 0) {
                            nums = stat.current.values.map(v => parseInt(v, 10));
                        } else if (stat.current.value && stat.current.value !== 'Theo dạng') {
                            nums = [parseInt(stat.current.value, 10)];
                        }
                    }
                }
                // Xử lý Tiến-Lùi/Lùi-Tiến So Le
                else if (category === 'tienLuiSoLe' || key.includes('tienLuiSoLe') || category === 'luiTienSoLe' || key.includes('luiTienSoLe') || subcategory === 'tienLuiSoLe' || subcategory === 'luiTienSoLe') {
                    // Đồng bộ logic với "Chuỗi đang diễn ra". stat.current.patternNumbers đã được generate sẵn từ getQuickStats
                    if (stat.current.patternNumbers && stat.current.patternNumbers.length > 0) {
                        nums = [...stat.current.patternNumbers];
                    } else {
                        nums = predictNextInSequence(stat, category, subcategory || key);
                    }
                }
                // Xử lý Về So Le (cho 1 số hoặc pattern dạng so le)
                else if (subcategory === 'veSole' || subcategory === 'veSoleMoi') {
                    // Với so le, số sẽ về sau 1 ngày nghỉ
                    // Lấy những số đã về trong chuỗi
                    const valuesToExclude = stat.current.values || [];

                    // SPECIAL CASE: motDit / cacDit - lấy nhóm số theo ĐÍT của giá trị cuối chuỗi
                    if (category === 'motDit' || category === 'cacDit') {
                        const lastVal = valuesToExclude[valuesToExclude.length - 1];
                        if (lastVal !== null && lastVal !== undefined) {
                            const dit = String(lastVal).padStart(2, '0')[1];
                            nums = Array.from({ length: 100 }, (_, i) => i)
                                .filter(n => String(n).padStart(2, '0')[1] === dit);
                        }
                    }
                    // SPECIAL CASE: motDau / cacDau - lấy nhóm số theo ĐẦU của giá trị cuối chuỗi
                    else if (category === 'motDau' || category === 'cacDau') {
                        const lastVal = valuesToExclude[valuesToExclude.length - 1];
                        if (lastVal !== null && lastVal !== undefined) {
                            const dau = String(lastVal).padStart(2, '0')[0];
                            nums = Array.from({ length: 100 }, (_, i) => i)
                                .filter(n => String(n).padStart(2, '0')[0] === dau);
                        }
                    }
                    // SPECIAL: Handle "cac_tong" patterns - need to identify the specific sum
                    // values array contains actual numbers (e.g., "35", "26"), need to calculate their sums
                    else if (category.startsWith('tong_tt_') || category.startsWith('tong_moi_') || category.startsWith('hieu_')) {
                        // Check if this is a generic category (cac_tong, chan, le, etc.)
                        const suffix = category.replace(/^(tong_tt_|tong_moi_|hieu_)/, '');
                        const isGeneric = ['cac_tong', 'chan', 'le', 'chan_chan', 'chan_le', 'le_chan', 'le_le'].includes(suffix)
                            || suffix.includes('_'); // Range like 5_7

                        if (isGeneric && valuesToExclude.length > 0) {
                            // Calculate sums from the last few numbers to find the repeating pattern
                            const sumCounts = {};
                            valuesToExclude.forEach(val => {
                                const numStr = String(val).padStart(2, '0');
                                if (numStr.length === 2) {
                                    const d1 = parseInt(numStr[0], 10);
                                    const d2 = parseInt(numStr[1], 10);
                                    let sum;
                                    if (category.startsWith('tong_tt_')) {
                                        sum = d1 + d2;
                                        if (sum === 0) sum = 10;
                                    } else if (category.startsWith('tong_moi_')) {
                                        sum = d1 + d2;
                                    } else if (category.startsWith('hieu_')) {
                                        sum = Math.abs(d1 - d2);
                                    }
                                    if (sum !== undefined) {
                                        sumCounts[sum] = (sumCounts[sum] || 0) + 1;
                                    }
                                }
                            });

                            // Find the most frequent sum (this is the one alternating)
                            let dominantSum = null;
                            let maxCount = 0;
                            for (const [sum, count] of Object.entries(sumCounts)) {
                                if (count > maxCount) {
                                    maxCount = count;
                                    dominantSum = parseInt(sum, 10);
                                }
                            }

                            if (dominantSum !== null) {
                                // Get all numbers with this sum
                                let tempCategory = '';
                                if (category.startsWith('tong_tt_')) {
                                    tempCategory = `tong_tt_${dominantSum}`;
                                } else if (category.startsWith('tong_moi_')) {
                                    tempCategory = `tong_moi_${dominantSum}`;
                                } else if (category.startsWith('hieu_')) {
                                    tempCategory = `hieu_${dominantSum}`;
                                }
                                nums = getNumbersFromCategory(tempCategory);
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

            // Luôn thêm explanation nếu có lý do, kể cả khi không có số cụ thể (để cảnh báo)
            if (nums.length > 0) {
                // Thêm vào danh sách loại trừ theo tier
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




        // --- NEW: Process Potential Streaks (Patterns with record = 2) ---
        // Kiểm tra các pattern có kỷ lục 2 ngày mà số mới nhất có thể trigger
        const recentResults = await statisticsService.getRecentResults(1);
        if (recentResults && recentResults.length > 0) {
            const latestNumber = String(recentResults[0].special).padStart(2, '0');
            const latestCategories = identifyCategories(latestNumber);

            // Các subcategories cần kiểm tra
            const subcategoriesToCheck = [
                'veLienTiep',
                'tienLienTiep',
                'luiLienTiep',
                'tienDeuLienTiep',
                'luiDeuLienTiep'
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

                    // Kiểm tra xem có record = 2 không
                    const recordLen = stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0;
                    if (recordLen !== 2) continue;

                    // Kiểm tra gap statistics cho chuỗi length 2
                    // Kiểm tra gap statistics cho chuỗi length 2
                    const targetLen = 2;
                    const gapInfoGE = stat.gapStats ? stat.gapStats[targetLen] : null;
                    const gapInfoExact = stat.exactGapStats ? stat.exactGapStats[targetLen] : null;

                    let shouldExclude = false;
                    let explanation = '';

                    let excludeGE = false;
                    let excludeExact = false;
                    let reasonGE = '';
                    let reasonExact = '';

                    if (gapInfoGE && gapInfoGE.minGap !== null) {
                        const threshold = gapInfoGE.minGap * (1 + GAP_BUFFER_PERCENT);
                        if (gapInfoGE.lastGap < threshold) {
                            excludeGE = true;
                            reasonGE = `GE: Gap (${gapInfoGE.lastGap}) < Min(${gapInfoGE.minGap}) + ${Math.round(GAP_BUFFER_PERCENT * 100)}%`;
                        }
                    }

                    if (gapInfoExact && gapInfoExact.minGap !== null) {
                        const threshold = gapInfoExact.minGap * (1 + GAP_BUFFER_PERCENT);
                        if (gapInfoExact.lastGap < threshold) {
                            excludeExact = true;
                            reasonExact = `Exact: Gap (${gapInfoExact.lastGap}) < Min(${gapInfoExact.minGap}) + ${Math.round(GAP_BUFFER_PERCENT * 100)}%`;
                        }
                    }

                    if (GAP_STRATEGY === 'GE') {
                        if (excludeGE) {
                            shouldExclude = true;
                            explanation = `Chuỗi tiềm năng: Số mới nhất (${latestNumber}) thuộc dạng "${category}". Kỷ lục: 2 ngày. ${reasonGE}`;
                        }
                    } else if (GAP_STRATEGY === 'EXACT') {
                        if (excludeExact) {
                            shouldExclude = true;
                            explanation = `Chuỗi tiềm năng: Số mới nhất (${latestNumber}) thuộc dạng "${category}". Kỷ lục: 2 ngày. ${reasonExact}`;
                        }
                    } else { // COMBINED
                        if (excludeGE && excludeExact) {
                            shouldExclude = true;
                            explanation = `Chuỗi tiềm năng: Số mới nhất (${latestNumber}) thuộc dạng "${category}". Kỷ lục: 2 ngày. ${reasonGE} VÀ ${reasonExact}`;
                        }
                    }

                    if (shouldExclude) {
                        // Tạo mock stat với current = undefined để addExcludedNumber xử lý đúng
                        const mockStat = {
                            longest: stat.longest,
                            current: { values: [latestNumber], length: 1 }
                        };
                        addExcludedNumber(mockStat, `[TIỀM NĂNG] ${key}`, explanation, 'purple');
                    }
                }
            }
        }

        // === LOGIC LOẠI TRỪ THEO CẤP ĐỘ ƯU TIÊN ===
        // Mục tiêu: Đạt >= 40 số loại trừ
        const MIN_EXCLUSION_COUNT = EXCLUSION_TIERS.MIN_EXCLUSION_COUNT;

        // Bắt đầu với tập rỗng
        const finalExcludedNumbers = new Set();
        const finalExplanations = [];
        const appliedTiers = [];
        let currentThreshold = 0; // Threshold cho LIGHT_RED (0%, 5%, 10%, ...)

        // BƯỚC 1: Lấy TOÀN BỘ từ red + purple
        const primaryTiers = ['red', 'purple'];
        for (const tier of primaryTiers) {
            const tierNumbers = exclusionsByTier[tier];
            if (tierNumbers.size === 0) continue;

            tierNumbers.forEach((info, num) => {
                finalExcludedNumbers.add(num);
            });
            explanationsByTier[tier].forEach(exp => finalExplanations.push(exp));
            appliedTiers.push(tier);
        }

        const redPurpleCount = exclusionsByTier['red'].size + exclusionsByTier['purple'].size;

        // BƯỚC 2 & BƯỚC 3 ĐÃ BỊ TẠM THỜI VÔ HIỆU HÓA THEO YÊU CẦU NGƯỜI DÙNG.
        // TẠM THỜI BỎ QUA CÁC CÁCH TÍNH ĐIỂM THEO MÀU (THÊM CHO ĐỦ 40 SỐ) VỚI LOGIC LOẠI TRỪ CŨ.
        // CHỈ TẬP TRUNG VÀO "TỚI KỶ LỤC", "ĐẠT KỶ LỤC" VÀ "SIÊU KỶ LỤC" Ở BƯỚC 1.
        console.log(`[SUGGESTIONS] Chỉ sử dụng RED và PURPLE tier. Tổng: ${redPurpleCount} số.`);

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
        const numbersBet = allNumbers.filter(n => !finalExcludedNumbers.has(parseInt(n, 10)) && !finalExcludedNumbers.has(n));

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
    let setKey = category.toUpperCase();

    // 0. Priority Direct Lookup (Fix for complex keys starting with dau_, dit_, etc.)
    if (SETS[setKey]) {
        return SETS[setKey].map(n => parseInt(n, 10));
    }


    // 0.1 Dynamic missing logic
    if (category === 'tong_tt_lon') return Array.from({ length: 100 }, (_, i) => i).filter(n => getTongTT(String(n)) >= 5);
    if (category === 'tong_tt_nho') return Array.from({ length: 100 }, (_, i) => i).filter(n => getTongTT(String(n)) < 5);
    if (category === 'tong_moi_lon') return Array.from({ length: 100 }, (_, i) => i).filter(n => getTongMoi(String(n)) >= 5);
    if (category === 'tong_moi_nho') return Array.from({ length: 100 }, (_, i) => i).filter(n => getTongMoi(String(n)) < 5);
    if (category === 'tong_tt_cac_tong') return Array.from({ length: 100 }, (_, i) => i);
    if (category === 'tong_moi_cac_tong') return Array.from({ length: 100 }, (_, i) => i);
    if (category === 'hieu_cac_hieu') return Array.from({ length: 100 }, (_, i) => i);

    // Handle specific mappings
    if (category.startsWith('dau_')) {
        setKey = 'DAU_' + category.split('_')[1].toUpperCase();
    } else if (category.startsWith('dit_')) {
        setKey = 'DIT_' + category.split('_')[1].toUpperCase();
    } else if (category.startsWith('tong_tt_')) {
        setKey = 'TONG_TT_' + category.replace('tong_tt_', '').toUpperCase();
    } else if (category.startsWith('tong_moi_')) {
        setKey = 'TONG_MOI_' + category.replace('tong_moi_', '').toUpperCase();
    } else if (category.startsWith('hieu_')) {
        setKey = 'HIEU_' + category.replace('hieu_', '').toUpperCase();
    } else if (category.startsWith('dau_dit_tien_')) {
        setKey = 'DAU_DIT_TIEN_' + category.split('_')[3];
    } else if (category === 'chanChan') {
        setKey = 'CHAN_CHAN';
    } else if (category === 'chanLe') {
        setKey = 'CHAN_LE';
    } else if (category === 'leChan') {
        setKey = 'LE_CHAN';
    } else if (category === 'leLe') {
        setKey = 'LE_LE';
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
    const isSoLe = subCatStr.toLowerCase().includes('sole') || category.toLowerCase().includes('sole'); // veSole, veSoleMoi

    const isTienLuiSoLe = subCatStr.toLowerCase().includes('tienluisole') || category.toLowerCase().includes('tienluisole') || subCatStr.toLowerCase().includes('luitiensole') || category.toLowerCase().includes('luitiensole');

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

    if (isSoLe && !isTienLuiSoLe) {
        return getNumbersFromCategory(category);
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

        // Special cases
        if (cat.startsWith('cacSo')) return strVal; // Full 2-digit number
        if (cat.startsWith('cacDau')) return strVal[0]; // Head digit
        if (cat.startsWith('cacDit')) return strVal[1]; // Tail digit

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
            let targetSum = parseInt(lastValue, 10);
            if (targetSum === 10) targetSum = 0; // Tổng 10 tương đương 0
            const sumKey = `TONG_TT_${targetSum}`;
            if (SETS[sumKey]) {
                return SETS[sumKey].map(n => parseInt(n, 10));
            }
        }
        // Với Tổng Mới
        if (category.startsWith('tong_moi_')) {
            let targetSum = parseInt(lastValue, 10);
            const sumKey = `TONG_MOI_${targetSum}`;
            if (SETS[sumKey]) {
                return SETS[sumKey].map(n => parseInt(n, 10));
            }
        }
        // Với Hiệu
        if (category.startsWith('hieu_')) {
            let targetDiff = parseInt(lastValue, 10);
            const diffKey = `HIEU_${targetDiff}`;
            if (SETS[diffKey]) {
                return SETS[diffKey].map(n => parseInt(n, 10));
            }
        }
        // Về liên tiếp:
        // Các category động (1 đầu, 1 đít, 1 số) cần phải giữ nguyên giá trị cuối
        if (['motDau', 'motDit', 'motSo', 'cacDau', 'cacDit', 'cacSo'].includes(category)) {
            return [extractValue(lastValue, category)];
        }
        // Các category tĩnh (đầu 4 đít lẻ, etc) cho phép mọi số thoả mãn category
        return getNumbersFromCategory(category);
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
            if (suffix === 'chan') return ['2', '4', '6', '8', '10'];
            if (suffix === 'le') return ['1', '3', '5', '7', '9'];
            // Then check compound patterns
            if (suffix.includes('_')) {
                // When Tổng TT is formatted as 2 digits (01-10):
                if (suffix === 'chan_le') return ['1', '3', '5', '7', '9'];
                if (suffix === 'le_chan') return ['10'];
                if (suffix === 'chan_chan') return ['2', '4', '6', '8'];
                if (suffix === 'le_le') return [];
                // Parse range/group: 5_7 -> [5,6,7], 9_1 -> [9,10,1]
                const parts = suffix.split('_').map(n => parseInt(n));
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
            if (suffix === 'chan') return Array.from({ length: 10 }, (_, i) => String(i * 2));
            if (suffix === 'le') return ['1', '3', '5', '7', '9']; // Wrapping sequence
            // Then check compound patterns
            if (suffix.includes('_')) {
                if (suffix === 'chan_le') return ['1', '3', '5', '7', '9'];
                if (suffix === 'le_chan') return ['10', '12', '14', '16', '18'];
                if (suffix === 'chan_chan') return ['0', '2', '4', '6', '8'];
                if (suffix === 'le_le') return ['11', '13', '15', '17'];

                const parts = suffix.split('_').map(n => parseInt(n));
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
            if (suffix.includes('_')) {
                if (suffix === 'chan') return ['0', '2', '4', '6', '8'];
                if (suffix === 'le') return ['1', '3', '5', '7', '9'];

                const parts = suffix.split('_').map(n => parseInt(n));
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

    if (numberSet) {
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
            // TẤT CẢ các dạng đều xoay vòng (wrap=true)
            // Logic trong getAllGreaterOrSmaller đã đúng:
            // - Normal: Trả về TẤT CẢ giá trị lớn hơn/nhỏ hơn
            // - Wrap (đạt min/max): Trả về DUY NHẤT 1 giá trị (boundary đối diện)
            nextValues = getAllGreaterOrSmaller(lastValueToPredict, numberSet, isProgressive, true);
        }
    } else {
        // Fallback cho các dạng chưa support sequence (trả về full set)
        return getNumbersFromCategory(category);
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
                if (targetSum === 10) targetSum = 0;
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
            if (suffix === 'cac_dau' || suffix === 'chan' || suffix === 'le' || suffix === 'nho' || suffix === 'to' || suffix.includes('lon_hon') || suffix.includes('nho_hon')) {
                const targetDigit = nextVal;
                resultNumbers.push(...Array.from({ length: 100 }, (_, i) => i)
                    .filter(n => String(n).padStart(2, '0')[0] === targetDigit));
            } else {
                resultNumbers.push(parseInt(nextVal, 10));
            }
        }
        else if (category.startsWith('dit_')) {
            const suffix = category.replace('dit_', '');
            if (suffix === 'cac_dit' || suffix === 'chan' || suffix === 'le' || suffix === 'nho' || suffix === 'to' || suffix.includes('lon_hon') || suffix.includes('nho_hon')) {
                const targetDigit = nextVal;
                resultNumbers.push(...Array.from({ length: 100 }, (_, i) => i)
                    .filter(n => String(n).padStart(2, '0')[1] === targetDigit));
            } else {
                resultNumbers.push(parseInt(nextVal, 10));
            }
        }
    }

    if (resultNumbers.length > 0) {
        return [...new Set(resultNumbers)]; // Remove duplicates if any
    }

    // Fallback cuối cùng
    return getNumbersFromCategory(category);
}

exports.predictNextInSequence = predictNextInSequence; // Export for exclusionService
exports.getNumbersFromCategory = getNumbersFromCategory; // Export for exclusionService

// Helper function: Tìm số tiếp theo trong set CÓ WRAP
function findNextInSequenceWithWrap(currentValue, numberSet, isProgressive) {
    const sortedSet = [...numberSet].sort((a, b) => parseInt(a) - parseInt(b));
    const currentIndex = sortedSet.indexOf(currentValue);

    if (currentIndex === -1) return null;

    if (isProgressive) {
        if (currentIndex === sortedSet.length - 1) return sortedSet[0]; // Wrap to first
        return sortedSet[currentIndex + 1];
    } else {
        if (currentIndex === 0) return sortedSet[sortedSet.length - 1]; // Wrap to last
        return sortedSet[currentIndex - 1];
    }
}

// Helper function: Lấy TẤT CẢ các số lớn hơn/nhỏ hơn trong set (cho Liên Tiếp)
// wrap: có cho phép wrap về đầu/cuối không (mặc định true)
function getAllGreaterOrSmaller(currentValue, numberSet, isProgressive, wrap = true) {
    // Sort numberSet correctly based on numeric value
    const sortedSet = [...numberSet].sort((a, b) => parseInt(a) - parseInt(b));
    const currentIndex = sortedSet.indexOf(currentValue);

    if (currentIndex === -1) return [];

    let result = [];
    if (isProgressive) {
        // Tiến: Lấy tất cả số lớn hơn
        const greater = sortedSet.slice(currentIndex + 1);
        // Nếu đã ở cuối, wrap về đầu (nếu cho phép)
        if (greater.length === 0 && wrap) {
            // Forward wrap: Return Min value ONLY
            result = [sortedSet[0]];
        } else {
            // Normal forward: Return ALL greater values
            result = greater;
        }
    } else {
        // Lùi: Lấy tất cả số nhỏ hơn
        const smaller = sortedSet.slice(0, currentIndex);
        // Nếu đã ở đầu, wrap về cuối (nếu cho phép)
        if (smaller.length === 0 && wrap) {
            // Backward wrap: Return Max value ONLY
            result = [sortedSet[sortedSet.length - 1]];
        } else {
            // Normal backward: Return ALL smaller values
            result = smaller;
        }
    }

    // Safety check: Đảm bảo không bao gồm giá trị hiện tại
    return result.filter(v => v !== currentValue);
}

exports.predictNextInSequence = predictNextInSequence;
