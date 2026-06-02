const {
    getSoLeTheoCapConfig
} = require('./soLeTheoCapPairs');
const {
    parseOrderedPermutationCategory
} = require('./numberAnalysis');

function getCategoryName(category, subcategory, originalKey = null) {
    const orderedCategoryInfo = parseOrderedPermutationCategory(category);
    const orderLabel = orderedCategoryInfo.orderValues ? orderedCategoryInfo.orderValues.join('→') : '';
    category = orderedCategoryInfo.baseCategory;

    // Check original key first (for keys like cacSoLuiDeuLienTiep)
    if (originalKey) {
        const directMapping = {
            // Các số
            'cacSoTienLienTiep': 'Các số - Tiến liên tiếp',
            'cacSoTienDeuLienTiep': 'Các số - Tiến Đều',
            'cacSoLuiLienTiep': 'Các số - Lùi liên tiếp',
            'cacSoLuiDeuLienTiep': 'Các số - Lùi Đều',
            'tienLuiSoLe': 'Các số - Tiến Lùi So Le (lớn hơn hoặc bằng 4 ngày)',
            'luiTienSoLe': 'Các số - Lùi Tiến So Le (lớn hơn hoặc bằng 4 ngày)',
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
        else if (suffix.match(/^\d+$/)) catName = `Tổng TT - Tổng ${suffix}`;
        else if (suffix.includes('_')) {
            const parts = suffix.split('_');
            catName = `Tổng TT - Dạng tổng (${parts.join(',')})`;
        }
        else catName = `Tổng TT - ${suffix}`;
    }
    // Tổng Mới
    else if (category.startsWith('tong_moi_')) {
        const suffix = category.replace('tong_moi_', '');
        if (suffix === 'cac_tong') catName = 'Tổng Mới - Các tổng';
        else if (suffix === 'chan') catName = 'Tổng Mới - Chẵn';
        else if (suffix === 'le') catName = 'Tổng Mới - Lẻ';
        else if (suffix === 'chan_chan') catName = 'Tổng Mới - Dạng Chẵn-Chẵn';
        else if (suffix === 'chan_le') catName = 'Tổng Mới - Dạng Chẵn-Lẻ';
        else if (suffix === 'le_chan') catName = 'Tổng Mới - Dạng Lẻ-Chẵn';
        else if (suffix === 'le_le') catName = 'Tổng Mới - Dạng Lẻ-Lẻ';
        else if (suffix.match(/^\d+$/)) catName = `Tổng Mới - Tổng ${suffix}`;
        else if (suffix.includes('_')) {
            const parts = suffix.split('_');
            catName = `Tổng Mới - Dạng tổng (${parts.join(',')})`;
        }
        else catName = `Tổng Mới - ${suffix}`;
    }
    // Hiệu
    else if (category.startsWith('hieu_')) {
        const suffix = category.replace('hieu_', '');
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
            let preview = '';
            try {
                const { SETS } = require('./numberAnalysis');
                const numbers = SETS[category.toUpperCase()] || [];
                preview = numbers.length > 0 ? ` (${numbers.slice(0, 4).join(',')}${numbers.length > 4 ? '...' : ''})` : '';
            } catch (e) {
                preview = '';
            }
            catName = `Đồng cách ${step} từ ${String(start).padStart(2, '0')}${preview}`;
        }
    }
    // Composite patterns
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
    else if (category === 'dau_chan_lon_hon_4') catName = 'Đầu chẵn lớn hơn 4';
    else if (category === 'dit_chan_lon_hon_4') catName = 'Đít chẵn lớn hơn 4';
    else if (category === 'dau_chan_lon_4_dit_chan_lon_4') catName = 'Đầu chẵn lớn hơn 4 & Đít chẵn lớn hơn 4';
    
    // Mappings cho patterns với số cụ thể (e.g., chan_nho_4_dit_chan_lon_4) - KHÔNG bắt đầu bằng dau_
    else if (!category.startsWith('dau_') && category.includes('_nho_') && category.includes('_dit_') && category.includes('_lon_')) {
        const match = category.match(/^(\w+)_nho_(\d+)_dit_(\w+)_lon_(\d+)$/);
        if (match) {
            const [, headType, headVal, tailType, tailVal] = match;
            const headTypeVi = headType === 'chan' ? 'Chẵn' : 'Lẻ';
            const tailTypeVi = tailType === 'chan' ? 'Chẵn' : 'Lẻ';
            catName = `Đầu ${headTypeVi} nhỏ hơn ${headVal} - Đít ${tailTypeVi} lớn hơn ${tailVal}`;
        } else {
            catName = category; // Fallback
        }
    }
    else if (!category.startsWith('dau_') && category.includes('_lon_') && category.includes('_dit_') && category.includes('_nho_')) {
        const match = category.match(/^(\w+)_lon_(\d+)_dit_(\w+)_nho_(\d+)$/);
        if (match) {
            const [, headType, headVal, tailType, tailVal] = match;
            const headTypeVi = headType === 'chan' ? 'Chẵn' : 'Lẻ';
            const tailTypeVi = tailType === 'chan' ? 'Chẵn' : 'Lẻ';
            catName = `Đầu ${headTypeVi} lớn hơn ${headVal} - Đít ${tailTypeVi} nhỏ hơn ${tailVal}`;
        } else {
            catName = category; // Fallback
        }
    }
    // Pattern: dau_X_lon/nho_Y_dit_Z_lon/nho_W (e.g., dau_le_lon_5_dit_chan_nho_4)
    else if (category.startsWith('dau_') && category.includes('_dit_')) {
        let matched = false;

        // Pattern 1: dau_X_lon_Y_dit_Z_nho_W
        let match = category.match(/^dau_(\w+)_lon_(\d+)_dit_(\w+)_nho_(\d+)$/);
        if (match) {
            const [, headType, headVal, tailType, tailVal] = match;
            const headTypeVi = headType === 'chan' ? 'Chẵn' : headType === 'le' ? 'Lẻ' : headType;
            const tailTypeVi = tailType === 'chan' ? 'Chẵn' : tailType === 'le' ? 'Lẻ' : tailType;
            catName = `Đầu ${headTypeVi} lớn hơn ${headVal} - Đít ${tailTypeVi} nhỏ hơn ${tailVal}`;
            matched = true;
        }

        // Pattern 2: dau_X_nho_Y_dit_Z_lon_W
        if (!matched) {
            match = category.match(/^dau_(\w+)_nho_(\d+)_dit_(\w+)_lon_(\d+)$/);
            if (match) {
                const [, headType, headVal, tailType, tailVal] = match;
                const headTypeVi = headType === 'chan' ? 'Chẵn' : headType === 'le' ? 'Lẻ' : headType;
                const tailTypeVi = tailType === 'chan' ? 'Chẵn' : tailType === 'le' ? 'Lẻ' : tailType;
                catName = `Đầu ${headTypeVi} nhỏ hơn ${headVal} - Đít ${tailTypeVi} lớn hơn ${tailVal}`;
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
                catName = `Đầu ${headTypeVi} lớn hơn ${headVal} - Đít ${tailTypeVi} lớn hơn ${tailVal}`;
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
                catName = `Đầu ${headTypeVi} nhỏ hơn ${headVal} - Đít ${tailTypeVi} nhỏ hơn ${tailVal}`;
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
        else if (suffix === 'chan_lon_hon_4') catName = 'Đầu chẵn lớn hơn 4';
        else if (suffix === 'chan_nho_hon_4') catName = 'Đầu chẵn nhỏ hơn 4';
        else if (suffix === 'le_lon_hon_5') catName = 'Đầu lẻ lớn hơn 5';
        else if (suffix === 'le_nho_hon_5') catName = 'Đầu lẻ nhỏ hơn 5';
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
        else if (suffix === 'chan_lon_hon_4') catName = 'Đít chẵn lớn hơn 4';
        else if (suffix === 'chan_nho_hon_4') catName = 'Đít chẵn nhỏ hơn 4';
        else if (suffix === 'le_lon_hon_5') catName = 'Đít lẻ lớn hơn 5';
        else if (suffix === 'le_nho_hon_5') catName = 'Đít lẻ nhỏ hơn 5';
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
        if (subcategory === 'veTheoThuTu') return `${catName} - Về theo thứ tự${orderLabel ? ` ${orderLabel}` : ''}`;
        if (subcategory === 'veSoLeTheoThuTu') return `${catName} - Về so le theo thứ tự${orderLabel ? ` ${orderLabel}` : ''}`;
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

module.exports = {
    getCategoryName
};
