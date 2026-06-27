(() => {
const getTongMoi = (n) => {
    const num = parseInt(n, 10);
    return Math.floor(num / 10) + (num % 10);
};
const getTongTT = (n) => {
    if (n === '00') return 10;
    const tongMoi = getTongMoi(n);
    const tongTT = tongMoi % 10;
    return tongTT === 0 ? 10 : tongTT;
};
const getHieu = (n) => {
    const num = parseInt(n, 10);
    return Math.abs(Math.floor(num / 10) - (num % 10));
};

const BASE_URL = window.location.origin;

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const recordSearch = document.getElementById('recordSearch');
    const recordGroup = document.getElementById('recordGroup');
    const pageSizeSelect = document.getElementById('pageSize');
    
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageInfo = document.getElementById('pageInfo');
    const pageSelectorContainer = document.getElementById('pageSelectorContainer');
    
    const prevPageBtnBottom = document.getElementById('prevPageBtnBottom');
    const nextPageBtnBottom = document.getElementById('nextPageBtnBottom');
    const pageInfoBottom = document.getElementById('pageInfoBottom');
    
    const recordsSkeleton = document.getElementById('recordsSkeleton');
    const recordsEmptyState = document.getElementById('recordsEmptyState');
    const quickStatsContainer = document.getElementById('quick-stats-container');

    // State Variables
    let currentPage = 1;
    let pageSize = 50;
    let searchQuery = '';
    let selectedGroup = 'ALL';
    let allPatterns = [];
    let availablePatternKeys = null;
    let filteredPatterns = [];

    // Helper functions
    const escapeHtml = (text) => {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    const cleanPatternTitle = (title) => String(title || '')
        .replace(/\bSố đề\b/g, 'Số')
        .replace(/\s+/g, ' ')
        .trim();

    const explainPatternTitle = (title, key = '') => {
        const displayTitle = cleanPatternTitle(title);
        const normalized = `${displayTitle} ${key}`.toLowerCase();
        const parts = [];

        if (normalized.includes('về liên tiếp')) {
            parts.push('Về liên tiếp: các ngày liền nhau đều thỏa đúng điều kiện của dạng chuỗi.');
        }
        if (normalized.includes('về theo thứ tự')) {
            parts.push('Về theo thứ tự: các giá trị xuất hiện theo đúng thứ tự được ghi trong tên dạng, ví dụ A→B→C. Nếu thứ tự khác thì là một dạng khác.');
        }
        if (normalized.includes('block') || normalized.includes('aabaa') || normalized.includes('aabbaa') ||
            normalized.includes('aaabbaaa') || normalized.includes('aaabbbaaa')) {
            parts.push('Nhịp block A/B: A là ngày thỏa điều kiện của dạng đang xét, B là ngày không thỏa điều kiện đó. Chuỗi chỉ tính khi các block A và B lặp đúng nhịp rồi quay lại A.');
            parts.push('Ví dụ AABAA là 2 ngày thuộc dạng, 1 ngày khác dạng, rồi 2 ngày thuộc dạng. AAABBAAA là 3 ngày thuộc dạng, 2 ngày khác dạng, rồi 3 ngày thuộc dạng.');
        }
        if (normalized.includes('về so le theo thứ tự tiến')) {
            parts.push('Về so le theo thứ tự TIẾN: các ngày thỏa điều kiện cách nhau 1 ngày xen kẽ, và giá trị đi theo chiều tăng trên trục của tập số/đầu/đít/tổng/hiệu.');
        } else if (normalized.includes('về so le theo thứ tự lùi')) {
            parts.push('Về so le theo thứ tự LÙI: các ngày thỏa điều kiện cách nhau 1 ngày xen kẽ, và giá trị đi theo chiều giảm trên trục của tập số/đầu/đít/tổng/hiệu.');
        } else if (normalized.includes('về so le theo thứ tự')) {
            parts.push('Về so le theo thứ tự: chuỗi xuất hiện xen kẽ ngày, đồng thời giá trị chạy theo trật tự đã định.');
        } else if (normalized.includes('về so le')) {
            parts.push('Về so le: dạng xuất hiện cách ngày, giữa hai ngày thỏa điều kiện có một ngày xen kẽ không tính vào chuỗi.');
        }
        if (normalized.includes('so le theo cặp')) {
            parts.push('So le theo cặp: mỗi ngày được gán vào 1 trong 2 nhãn của cặp, rồi chuỗi chỉ được tính khi hai nhãn luân phiên qua lại, ví dụ A→B→A→B. Nếu A→A hoặc B→B thì đó là liên tiếp/cùng dạng, không phải so le theo cặp.');
        }
        if (normalized.includes('đầu đít cùng/khác') || normalized.includes('đầu/đít cùng/khác') || normalized.includes('dau dit cung/khac')) {
            parts.push('Đầu đít cùng/khác tính chẵn lẻ: lấy chữ số hàng chục là đầu và hàng đơn vị là đít của cùng một số. Cùng chẵn lẻ nghĩa là đầu và đít cùng tính chẵn/lẻ: chẵn-chẵn hoặc lẻ-lẻ. Khác chẵn lẻ nghĩa là một chẵn một lẻ: chẵn-lẻ hoặc lẻ-chẵn.');
            parts.push('Ví dụ: 24 là cùng chẵn lẻ vì 2 và 4 đều chẵn; 35 là cùng chẵn lẻ vì 3 và 5 đều lẻ; 27 là khác chẵn lẻ vì 2 chẵn, 7 lẻ; 38 là khác chẵn lẻ vì 3 lẻ, 8 chẵn.');
            parts.push('Khi đi với so le theo cặp, chuỗi phải luân phiên Cùng→Khác→Cùng→Khác hoặc Khác→Cùng→Khác→Cùng qua các ngày được tính.');
        } else if (normalized.includes('đầu đít cùng') || normalized.includes('đầu/đít cùng') || normalized.includes('dau dit cung')) {
            parts.push('Đầu đít cùng chẵn/lẻ: chữ số hàng chục và hàng đơn vị của cùng một số cùng nhóm chẵn-lẻ, gồm chẵn-chẵn hoặc lẻ-lẻ. Ví dụ 24, 35, 88.');
        } else if (normalized.includes('đầu đít khác') || normalized.includes('đầu/đít khác') || normalized.includes('dau dit khac')) {
            parts.push('Đầu đít khác chẵn/lẻ: chữ số hàng chục và hàng đơn vị khác nhóm chẵn-lẻ, gồm chẵn-lẻ hoặc lẻ-chẵn. Ví dụ 27, 38, 61.');
        }
        if (normalized.includes('nhỏ') || normalized.includes('to')) {
            parts.push('Nhỏ/to: với số hai chữ số thường chia nhỏ <50 và to >=50; với đầu/đít là chữ số 0-4 hoặc 5-9.');
        }
        if (normalized.includes('nguyên tố') || normalized.includes('hợp số')) {
            parts.push('Nguyên tố: số tự nhiên lớn hơn 1 chỉ chia hết cho 1 và chính nó. Trong dàn 00-99, ví dụ 02, 03, 05, 07, 11, 13, 17, 19, 23, 29 là nguyên tố.');
            parts.push('Hợp số: số tự nhiên lớn hơn 1 có thêm ước khác ngoài 1 và chính nó. Trong cách chia hiện tại, các giá trị không thuộc tập nguyên tố của trục đang xét sẽ rơi vào nhãn hợp số/không nguyên tố.');
            parts.push('Với "Số nguyên tố - hợp số so le theo cặp", mỗi ngày số về được gán nhãn nguyên tố hoặc hợp số, rồi chuỗi chỉ tính khi hai nhãn luân phiên: nguyên tố→hợp số→nguyên tố→hợp số hoặc ngược lại.');
        }
        if (normalized.includes('tiến đều')) {
            parts.push('Tiến đều: giá trị tăng theo cùng một bước trên trục thứ tự của tập đang xét.');
        } else if (normalized.includes('tiến liên tiếp')) {
            parts.push('Tiến liên tiếp: giá trị tăng qua các ngày liên tiếp theo trục thứ tự của tập đang xét.');
        }
        if (normalized.includes('lùi đều')) {
            parts.push('Lùi đều: giá trị giảm theo cùng một bước trên trục thứ tự của tập đang xét.');
        } else if (normalized.includes('lùi liên tiếp')) {
            parts.push('Lùi liên tiếp: giá trị giảm qua các ngày liên tiếp theo trục thứ tự của tập đang xét.');
        }
        if (normalized.includes('tiến lùi so le')) {
            parts.push('Tiến lùi so le: hướng di chuyển luân phiên tăng rồi giảm trên cùng trục giá trị.');
        }
        if (normalized.includes('lùi tiến so le')) {
            parts.push('Lùi tiến so le: hướng di chuyển luân phiên giảm rồi tăng trên cùng trục giá trị.');
        }
        if (normalized.includes('tổng tt')) {
            parts.push('Tổng TT: lấy hàng đơn vị của tổng hai chữ số, quy 0 thành 10 theo cách thống kê hiện tại.');
        } else if (normalized.includes('tổng mới')) {
            parts.push('Tổng Mới: tổng thật của hai chữ số, từ 0 đến 18.');
        } else if (normalized.includes('tổng')) {
            parts.push('Tổng: nhóm số theo tổng của hai chữ số.');
        }
        if (normalized.includes('hiệu')) {
            parts.push('Hiệu: nhóm số theo trị tuyệt đối của chênh lệch giữa hàng chục và hàng đơn vị.');
        }

        if (parts.length === 0) {
            parts.push('Dạng thống kê dùng để đo kỷ lục chuỗi, khoảng cách xuất hiện và khả năng tiếp tục/gãy của nhóm số tương ứng.');
        }
        return `${displayTitle}\n\n${parts.join('\n')}`;
    };

    const normDate = (d) => {
        if (!d) return '';
        if (d.includes('-')) {
            const parts = d.split('-');
            return `${parts[2].substring(0, 2)}/${parts[1]}/${parts[0]}`;
        }
        return d;
    };

    const parseDate = (dateStr) => {
        if (!dateStr) return new Date();
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            return new Date(parts[2], parts[1] - 1, parts[0]);
        }
        return new Date(dateStr);
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
                    return item.data;
                } else {
                    localStorage.removeItem(cacheKey);
                }
            }
        } catch (e) {
            // Ignore cache errors
        }

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

    const detectPatternType = (key) => {
        const lowerKey = String(key || '').toLowerCase();
        if (lowerKey.includes('tienluisole') || lowerKey.includes('luitiensole')) {
            return 'tienLuiSoLe';
        } else if ((lowerKey.includes('vesole') || lowerKey.includes('solemoi')) &&
            !lowerKey.includes('tienluisole') && !lowerKey.includes('luitiensole') && !lowerKey.includes('soletheocap')) {
            return 'soLe';
        }
        return 'default';
    };

    const normalizeSearchText = (value = '') => String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd');

    const getAxisRank = (key = '', text = '', groupName = '') => {
        const haystack = normalizeSearchText(`${key} ${text} ${groupName}`);
        if (haystack.includes('so de') || haystack.includes('1 so') || haystack.includes('cac so') || /^so[_:]/.test(haystack)) return { rank: 10, label: 'Số' };
        if (haystack.includes('dau dit')) return { rank: 18, label: 'Đầu/đít' };
        if (haystack.includes('dau')) return { rank: 20, label: 'Đầu' };
        if (haystack.includes('dit')) return { rank: 30, label: 'Đít' };
        if (haystack.includes('tong tt')) return { rank: 40, label: 'Tổng TT' };
        if (haystack.includes('tong moi')) return { rank: 50, label: 'Tổng mới' };
        if (haystack.includes('hieu')) return { rank: 60, label: 'Hiệu' };
        if (haystack.includes('tong')) return { rank: 45, label: 'Tổng' };
        return { rank: 99, label: 'Khác' };
    };

    const getValueGroupRank = (key = '', text = '') => {
        const haystack = normalizeSearchText(`${key} ${text}`);
        if (haystack.includes('_3d_') || haystack.match(/\(\d,\d,\d\)/) || haystack.match(/\(\d+,\d+,\d+\)/)) return { rank: 10, label: 'Nhóm 3 giá trị' };
        if (haystack.includes('combo') || haystack.includes('ket hop') || haystack.includes('+')) return { rank: 20, label: 'Kết hợp' };
        if (haystack.includes('chan-le') || haystack.includes('chan le') || haystack.includes('le-chan') || haystack.includes('le chan')) return { rank: 30, label: 'Chẵn/lẻ' };
        if (haystack.includes('nho-to') || haystack.includes('nho to') || haystack.includes('to-nho') || haystack.includes('to nho')) return { rank: 40, label: 'Nhỏ/to' };
        if (haystack.includes('nguyento') || haystack.includes('nguyen to') || haystack.includes('hopso') || haystack.includes('hop so')) return { rank: 50, label: 'Nguyên tố/hợp số' };
        if (haystack.includes('chia3') || haystack.includes('chia het cho 3')) return { rank: 60, label: 'Chia hết 3' };
        if (haystack.includes('cung') || haystack.includes('khac')) return { rank: 70, label: 'Cùng/khác' };
        if (haystack.match(/_\d+(?:$|:|_)/) || haystack.match(/\(\d+\)/)) return { rank: 5, label: 'Giá trị cố định' };
        return { rank: 90, label: 'Tổng quát' };
    };

    const getSequenceRank = (key = '', text = '') => {
        const haystack = normalizeSearchText(`${key} ${text}`);
        if (haystack.includes('block2x1sole') || haystack.includes('block2x2sole') ||
            haystack.includes('block3x2sole') || haystack.includes('block3x3sole') ||
            haystack.includes('block4x2sole') || haystack.includes('block4x3sole') ||
            haystack.includes('aabaa') || haystack.includes('aabbaa') ||
            haystack.includes('aaabbaaa') || haystack.includes('aaabbbaaa')) {
            return { rank: 8, label: 'Nhịp block A/B' };
        }
        if (haystack.includes('soletheocap') || haystack.includes('so le theo cap')) return { rank: 10, label: 'So le theo cặp' };
        if (haystack.includes('soletheothutu') || haystack.includes('so le theo thu tu')) return { rank: 20, label: 'So le theo thứ tự' };
        if (haystack.includes('vetheothutu') || haystack.includes('ve theo thu tu')) return { rank: 30, label: 'Về theo thứ tự' };
        if (haystack.includes('tienluisole') || haystack.includes('tien lui so le')) return { rank: 40, label: 'Tiến/lùi so le' };
        if (haystack.includes('luitiensole') || haystack.includes('lui tien so le')) return { rank: 45, label: 'Lùi/tiến so le' };
        if (haystack.includes('ve sole') || haystack.includes('so le')) return { rank: 50, label: 'So le' };
        if (haystack.includes('tien deu')) return { rank: 60, label: 'Tiến đều' };
        if (haystack.includes('lui deu')) return { rank: 70, label: 'Lùi đều' };
        if (haystack.includes('tien lien tiep')) return { rank: 80, label: 'Tiến liên tiếp' };
        if (haystack.includes('lui lien tiep')) return { rank: 90, label: 'Lùi liên tiếp' };
        if (haystack.includes('lien tiep')) return { rank: 100, label: 'Liên tiếp' };
        return { rank: 999, label: 'Khác' };
    };

    const buildPatternSortMeta = (pattern) => {
        const axis = getAxisRank(pattern.key, pattern.text, pattern.groupName);
        const valueGroup = getValueGroupRank(pattern.key, pattern.text);
        const sequence = getSequenceRank(pattern.key, pattern.text);
        return {
            axisRank: axis.rank,
            axisLabel: axis.label,
            valueRank: valueGroup.rank,
            valueLabel: valueGroup.label,
            sequenceRank: sequence.rank,
            sequenceLabel: sequence.label,
            normalizedText: normalizeSearchText(pattern.text),
            groupSortText: normalizeSearchText(pattern.groupName),
            keySortText: normalizeSearchText(pattern.key)
        };
    };

    const comparePatterns = (a, b) => {
        const metaA = a.sortMeta || buildPatternSortMeta(a);
        const metaB = b.sortMeta || buildPatternSortMeta(b);
        return metaA.axisRank - metaB.axisRank ||
            metaA.valueRank - metaB.valueRank ||
            metaA.sequenceRank - metaB.sequenceRank ||
            metaA.groupSortText.localeCompare(metaB.groupSortText) ||
            metaA.normalizedText.localeCompare(metaB.normalizedText) ||
            metaA.keySortText.localeCompare(metaB.keySortText);
    };

    const filterGapEntries = (entries, patternType) => {
        return entries.filter(([len, data]) => {
            if (data.count === 0) return false;
            const length = parseInt(len);
            if (patternType === 'tienLuiSoLe') {
                return length >= 4;
            } else if (patternType === 'soLe') {
                return length >= 3 && length % 2 === 1;
            }
            return length >= 2;
        });
    };

    const renderGapTable = (stats, operator, key = '') => {
        const patternType = detectPatternType(key);
        const filteredEntries = filterGapEntries(Object.entries(stats), patternType);

        if (filteredEntries.length === 0) {
            return '<p class="text-xs text-gray-500">Không có dữ liệu phù hợp</p>';
        }

        return `
            <div class="overflow-x-auto mt-1">
                <table class="min-w-full text-[11px] text-left text-gray-500 border border-gray-100 rounded-lg overflow-hidden">
                    <thead class="bg-gray-100 text-gray-700 font-semibold uppercase">
                        <tr>
                            <th scope="col" class="px-2 py-1">Độ dài</th>
                            <th scope="col" class="px-2 py-1 text-green-700">MIN</th>
                            <th scope="col" class="px-2 py-1 text-yellow-700">AVG</th>
                            <th scope="col" class="px-2 py-1 text-red-700">MAX</th>
                            <th scope="col" class="px-2 py-1">Cuối</th>
                            <th scope="col" class="px-2 py-1">SL</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        ${filteredEntries
                .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                .map(([len, data]) => {
                    const minDisplay = data.minGap !== null && data.minGap !== undefined ? `${data.minGap}(${data.minCount || 1})` : '-(0)';
                    const maxDisplay = data.maxGap !== null && data.maxGap !== undefined ? `${data.maxGap}(${data.maxCount || 1})` : '-(0)';
                    const isLow = data.minGap !== null && data.lastGap < data.minGap;
                    return `
                                <tr class="bg-white hover:bg-gray-50/50">
                                    <td class="px-2 py-1 font-medium text-gray-900">${operator} ${len}</td>
                                    <td class="px-2 py-1 font-semibold text-green-600">${minDisplay}</td>
                                    <td class="px-2 py-1 font-semibold text-amber-600">${data.avgGap || '-'}</td>
                                    <td class="px-2 py-1 font-semibold text-red-600">${maxDisplay}</td>
                                    <td class="px-2 py-1 ${isLow ? 'text-red-600 font-bold' : ''}">${data.lastGap !== undefined && data.lastGap !== null ? data.lastGap : '-'}</td>
                                    <td class="px-2 py-1">${data.count}</td>
                                </tr>
                            `;
                }).join('')}
                    </tbody>
                </table>
            </div>`;
    };

    const renderExtensionGapTable = (stats, key) => {
        const patternType = detectPatternType(key);
        const isSoLe = patternType === 'soLe';
        const isTienLuiSoLe = patternType === 'tienLuiSoLe';
        const step = isSoLe ? 2 : 1;

        const filteredEntries = Object.entries(stats).filter(([len, data]) => {
            if (data.count === 0 && data.lastGap === 0) return false;
            const length = parseInt(len);
            if (isTienLuiSoLe) {
                return length >= 4;
            } else if (isSoLe) {
                return length >= 3 && length % 2 === 1;
            }
            return length >= 2;
        });

        if (filteredEntries.length === 0) {
            return '<p class="text-xs text-gray-500">Không có dữ liệu phù hợp</p>';
        }

        return `
            <div class="overflow-x-auto mt-1">
                <table class="min-w-full text-[11px] text-left text-gray-500 border border-gray-100 rounded-lg overflow-hidden">
                    <thead class="bg-blue-50/60 text-gray-700 font-semibold uppercase">
                        <tr>
                            <th scope="col" class="px-2 py-1">Từ→Đến</th>
                            <th scope="col" class="px-2 py-1 text-green-700">MIN</th>
                            <th scope="col" class="px-2 py-1 text-yellow-700">AVG</th>
                            <th scope="col" class="px-2 py-1 text-red-700">MAX</th>
                            <th scope="col" class="px-2 py-1">Cuối</th>
                            <th scope="col" class="px-2 py-1">SL</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        ${filteredEntries
                .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                .map(([len, data]) => {
                    const fromLen = parseInt(len);
                    const toLen = fromLen + step;
                    const minDisplay = data.minGap !== null && data.minGap !== undefined ? `${data.minGap}(${data.minCount || 1})` : '-(0)';
                    const maxDisplay = data.maxGap !== null && data.maxGap !== undefined ? `${data.maxGap}(${data.maxCount || 1})` : '-(0)';
                    const isLow = data.minGap !== null && data.lastGap < data.minGap;
                    return `
                                <tr class="bg-white hover:bg-gray-50/50">
                                    <td class="px-2 py-1 font-medium text-gray-900">${fromLen}→${toLen}</td>
                                    <td class="px-2 py-1 font-semibold text-green-600">${minDisplay}</td>
                                    <td class="px-2 py-1 font-semibold text-amber-600">${data.avgGap || '-'}</td>
                                    <td class="px-2 py-1 font-semibold text-red-600">${maxDisplay}</td>
                                    <td class="px-2 py-1 ${isLow ? 'text-red-600 font-bold' : ''}">${data.lastGap !== undefined && data.lastGap !== null ? data.lastGap : '-'}</td>
                                    <td class="px-2 py-1">${data.count}</td>
                                </tr>
                            `;
                }).join('')}
                    </tbody>
                </table>
            </div>`;
    };

    const renderFullSequence = (streak, description) => {
        let sequenceToRender = streak.fullSequence;
        if (!sequenceToRender || sequenceToRender.length === 0) {
            if (streak.dates && streak.values && streak.dates.length === streak.values.length) {
                sequenceToRender = streak.dates.map((date, i) => ({
                    date: date,
                    value: streak.values[i]
                }));
            } else {
                return '<span></span>';
            }
        }

        const normalizedSeq = sequenceToRender.map(day => ({ ...day, date: normDate(day.date) }));
        const normalizedDates = streak.dates ? streak.dates.map(d => normDate(d)) : [];
        const streakDates = new Set(normalizedDates);

        const desc = (typeof description === 'string') ? description.toLowerCase() : '';
        const isTongTT = desc.includes('tổng tt');
        const isTongMoi = desc.includes('tổng mới');
        const isHieu = desc.includes('hiệu');
        const isTienLuiSoLe = desc.includes('tiến lùi') || desc.includes('lùi tiến');

        return normalizedSeq.map((day, index) => {
            const isLatest = day.isLatest === true;
            const isInStreak = streakDates.has(day.date);

            let subText = '';
            if (isTongTT) {
                subText = `<span class="block text-blue-650 font-semibold text-[10px]">T${getTongTT(day.value)}</span>`;
            } else if (isTongMoi) {
                subText = `<span class="block text-blue-650 font-semibold text-[10px]">T${getTongMoi(day.value)}</span>`;
            } else if (isHieu) {
                subText = `<span class="block text-green-650 font-semibold text-[10px]">H${getHieu(day.value)}</span>`;
            } else if (isTienLuiSoLe && index > 0 && isInStreak) {
                let prevIndex = index - 1;
                while (prevIndex >= 0 && !streakDates.has(normalizedSeq[prevIndex].date)) {
                    prevIndex--;
                }
                if (prevIndex >= 0) {
                    const prevValue = parseInt(normalizedSeq[prevIndex].value, 10);
                    const currValue = parseInt(day.value, 10);
                    const arrow = currValue > prevValue ? '↑' : (currValue < prevValue ? '↓' : '→');
                    subText = `<span class="block text-purple-650 font-bold text-[10px]">${arrow}</span>`;
                }
            }

            let bgClass = 'bg-slate-200/60';
            if (isInStreak && !isLatest) {
                bgClass = 'highlight';
            } else if (isLatest) {
                bgClass = 'bg-slate-300 border-2 border-dashed border-slate-400';
            } else if (!isInStreak) {
                bgClass = 'bg-slate-100 border border-dashed border-slate-250 opacity-60';
            }

            return `
                <div class="text-center p-1.5 rounded-lg text-[10px] ${bgClass} min-w-[44px]">
                    <span class="font-mono text-sm font-bold block">${day.value}</span>
                    ${subText ? subText : '<span class="block h-3.5"></span>'}
                    <span class="block text-slate-500 text-[9px] mt-0.5">${day.date.substring(0, 5)}</span>
                </div>`;
        }).join('');
    };

    const renderStreakDetails = (title, streaks, description) => {
        if (!streaks || streaks.length === 0) return `<h6 class="font-semibold text-slate-600 text-xs">${title}: Không có dữ liệu</h6>`;
        const sortedStreaks = [...streaks].sort((a, b) => parseDate(b.endDate) - parseDate(a.endDate));
        const streakLength = sortedStreaks[0].length;
        let detailsHtml = sortedStreaks.map(streak => `
                    <li class="mb-3 p-3 bg-white border border-slate-100 rounded-xl">
                        <strong class="text-xs text-indigo-650 flex items-center gap-1"><i class="bi bi-calendar3"></i> ${normDate(streak.startDate)} → ${normDate(streak.endDate)}</strong>
                        <div class="flex flex-wrap gap-1 mt-2">${renderFullSequence(streak, description)}</div>
                    </li>`).join('');
        return `<h6 class="font-semibold text-slate-800 text-sm mb-2"><i class="bi bi-clock-history"></i> ${title} (Dài ${streakLength} ngày)</h6><ul class="list-none p-0 mt-2">${detailsHtml}</ul>`;
    };

    const renderRecordAccordionItem = (key, stat, pattern = null) => {
        const displayDescription = cleanPatternTitle(stat.description || (pattern && pattern.text) || key);
        const descriptionTooltip = explainPatternTitle(displayDescription, key);
        const longestInfo = stat.longest && stat.longest.length > 0 ? `${stat.longest[0].length} ngày (${stat.longest.length})` : 'N/A';
        const secondLongestInfo = stat.secondLongest && stat.secondLongest.length > 0 ? `${stat.secondLongest[0].length} ngày (${stat.secondLongest.length})` : 'N/A';
        const avgIntervalInfo = stat.averageInterval !== null ? `${stat.averageInterval} ngày` : 'N/A';
        const sinceLastInfo = stat.daysSinceLast !== null && stat.daysSinceLast !== 'N/A' ? `${stat.daysSinceLast} ngày` : 'N/A';
        const sortMeta = pattern && pattern.sortMeta ? pattern.sortMeta : buildPatternSortMeta({
            key,
            text: stat.description || '',
            groupName: pattern ? pattern.groupName : ''
        });
        const groupBadges = `
            <div class="mt-1 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                <span class="rounded-md border border-indigo-100 bg-indigo-50 px-1.5 py-0.5 text-indigo-700">${escapeHtml(sortMeta.axisLabel)}</span>
                <span class="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-slate-600">${escapeHtml(sortMeta.valueLabel)}</span>
                <span class="rounded-md border border-purple-100 bg-purple-50 px-1.5 py-0.5 text-purple-700">${escapeHtml(sortMeta.sequenceLabel)}</span>
            </div>
        `;

        const gapStatsSection = (stat.gapStats) ? `
            <div class="col-span-1 md:col-span-2">
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div class="bg-white p-3 rounded-xl border border-slate-100/80 shadow-sm">
                        <h6 class="text-xs font-bold text-slate-800 border-b border-slate-100 pb-1 mb-2 flex items-center gap-1"><i class="bi bi-bar-chart-fill text-indigo-500"></i> GAP STATS (GE >= Len)</h6>
                        ${renderGapTable(stat.gapStats, '>=', key)}
                    </div>
                    <div class="bg-white p-3 rounded-xl border border-slate-100/80 shadow-sm">
                        <h6 class="text-xs font-bold text-slate-800 border-b border-slate-100 pb-1 mb-2 flex items-center gap-1"><i class="bi bi-pie-chart-fill text-teal-500"></i> EXACT GAP STATS (== Len)</h6>
                        ${stat.exactGapStats ? renderGapTable(stat.exactGapStats, '==', key) : '<p class="text-xs text-slate-500">Không có dữ liệu</p>'}
                    </div>
                    <div class="bg-white p-3 rounded-xl border border-slate-100/80 shadow-sm">
                        <h6 class="text-xs font-bold text-blue-800 border-b border-slate-100 pb-1 mb-2 flex items-center gap-1"><i class="bi bi-graph-up-arrow text-blue-500"></i> EXTENSION GAP (N→N+step)</h6>
                        ${stat.extensionGapStats ? renderExtensionGapTable(stat.extensionGapStats, key) : '<p class="text-xs text-slate-500">Không có dữ liệu</p>'}
                    </div>
                </div>
            </div>
        ` : '';

        const itemHtml = `
            <div class="record-accordion-item">
                <div class="record-accordion-button p-4 flex flex-wrap justify-between items-center cursor-pointer hover:bg-slate-50 border-b border-slate-100 transition" onclick="window.toggleAccordion(this)">
                     <span class="w-full lg:w-2/5 font-semibold text-slate-800 text-left text-sm lg:text-base">
                        <span class="cursor-help decoration-dotted underline-offset-4 hover:underline" title="${escapeHtml(descriptionTooltip)}">${escapeHtml(displayDescription)}</span>
                        ${groupBadges}
                     </span>
                     <div class="flex-grow grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-600 text-left mt-2 lg:mt-0">
                         <span class="flex items-center gap-1"><i class="bi bi-trophy text-yellow-600"></i> KL: <strong class="text-slate-800">${longestInfo}</strong></span>
                         <span class="flex items-center gap-1"><i class="bi bi-award text-slate-500"></i> Nhì: <strong class="text-slate-800">${secondLongestInfo}</strong></span>
                         <span class="flex items-center gap-1"><i class="bi bi-arrow-repeat text-indigo-500"></i> TB: <strong class="text-slate-800">${avgIntervalInfo}</strong></span>
                         <span class="flex items-center gap-1"><i class="bi bi-hourglass-split text-amber-500"></i> Cuối: <strong class="text-slate-850">${sinceLastInfo}</strong></span>
                     </div>
                     <span class="text-slate-400 font-bold ml-2 transition-transform duration-200 accordion-chevron"><i class="bi bi-chevron-down"></i></span>
                </div>
                <div class="record-accordion-content hidden bg-slate-50/50 p-6 border-b border-slate-200/80">
                   <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        ${gapStatsSection}
                        <div class="bg-slate-50 p-4 rounded-xl border border-slate-200/50">${renderStreakDetails('Kỷ lục', stat.longest, displayDescription)}</div>
                        <div class="bg-slate-50 p-4 rounded-xl border border-slate-200/50">${renderStreakDetails('Dài nhì', stat.secondLongest, displayDescription)}</div>
                    </div>
                </div>
            </div>
        `;
        quickStatsContainer.insertAdjacentHTML('beforeend', itemHtml);
    };

    // Accordion global toggle
    window.toggleAccordion = (buttonEl) => {
        const contentEl = buttonEl.nextElementSibling;
        const chevron = buttonEl.querySelector('.accordion-chevron i');
        if (contentEl.classList.contains('hidden')) {
            contentEl.classList.remove('hidden');
            buttonEl.classList.add('bg-indigo-50/40');
            if (chevron) {
                chevron.classList.remove('bi-chevron-down');
                chevron.classList.add('bi-chevron-up');
            }
        } else {
            contentEl.classList.add('hidden');
            buttonEl.classList.remove('bg-indigo-50/40');
            if (chevron) {
                chevron.classList.remove('bi-chevron-up');
                chevron.classList.add('bi-chevron-down');
            }
        }
    };

    // Filter Logic
    const hasRecordData = (key) => {
        return !availablePatternKeys || availablePatternKeys.has(key);
    };

    const applyFilters = () => {
        filteredPatterns = allPatterns.filter(pattern => {
            const matchesGroup = selectedGroup === 'ALL' ||
                pattern.groupName === selectedGroup ||
                (selectedGroup === '__SEQ_BLOCK_AB__' && pattern.sortMeta && pattern.sortMeta.sequenceLabel === 'Nhịp block A/B');
            const matchesSearch = !searchQuery || 
                pattern.text.toLowerCase().includes(searchQuery) ||
                pattern.key.toLowerCase().includes(searchQuery) ||
                pattern.groupName.toLowerCase().includes(searchQuery) ||
                (pattern.sortSearchText && pattern.sortSearchText.includes(searchQuery));
            return hasRecordData(pattern.key) && matchesGroup && matchesSearch;
        }).sort(comparePatterns);

        currentPage = 1;
        renderPagination();
        loadCurrentPage();
    };

    // Render Pagination Numbers
    const renderPagination = () => {
        const totalItems = filteredPatterns.length;
        const totalPages = Math.ceil(totalItems / pageSize);

        // Update top info text
        const startNum = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
        const endNum = Math.min(currentPage * pageSize, totalItems);
        const infoStr = `Hiển thị <strong>${startNum}-${endNum}</strong> trong tổng số <strong>${totalItems}</strong> chỉ số`;
        
        pageInfo.innerHTML = infoStr;
        pageInfoBottom.innerHTML = infoStr;

        // Enable/Disable buttons
        prevPageBtn.disabled = currentPage === 1;
        prevPageBtnBottom.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;
        nextPageBtnBottom.disabled = currentPage === totalPages || totalPages === 0;

        // Render numbered buttons
        pageSelectorContainer.innerHTML = '';
        if (totalPages <= 1) return;

        // Range of pages to show
        let startPage = Math.max(1, currentPage - 2);
        let endPage = Math.min(totalPages, startPage + 4);
        if (endPage - startPage < 4) {
            startPage = Math.max(1, endPage - 4);
        }

        for (let i = startPage; i <= endPage; i++) {
            const isCurrent = i === currentPage;
            const btn = document.createElement('button');
            btn.className = `w-8 h-8 flex items-center justify-center text-xs font-bold rounded-lg transition-all ${
                isCurrent 
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow' 
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`;
            btn.textContent = i;
            btn.addEventListener('click', () => {
                currentPage = i;
                renderPagination();
                loadCurrentPage();
            });
            pageSelectorContainer.appendChild(btn);
        }
    };

    // Load API data for the active page
    const loadCurrentPage = async () => {
        // Show Skeleton, Hide Content
        recordsSkeleton.classList.remove('hidden');
        recordsEmptyState.classList.add('hidden');
        quickStatsContainer.classList.add('hidden');
        quickStatsContainer.innerHTML = '';

        const totalItems = filteredPatterns.length;
        if (totalItems === 0) {
            recordsSkeleton.classList.add('hidden');
            recordsEmptyState.classList.remove('hidden');
            return;
        }

        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, totalItems);
        const pageItems = filteredPatterns.slice(startIndex, endIndex);

        const keysStr = pageItems.map(p => p.key).join(',');

        try {
            const data = await fetchJSON(`${BASE_URL}/api/statistics/quick-stats?keys=${keysStr}`);
            
            pageItems.forEach(pattern => {
                const stat = data[pattern.key];
                if (stat) {
                    renderRecordAccordionItem(pattern.key, stat, pattern);
                } else {
                    // Fallback placeholder if API doesn't have it
                    renderRecordAccordionItem(pattern.key, {
                        description: pattern.text,
                        longest: [],
                        secondLongest: [],
                        current: null,
                        averageInterval: null,
                        daysSinceLast: 'N/A'
                    }, pattern);
                }
            });

            // Hide Skeleton, Show Content
            recordsSkeleton.classList.add('hidden');
            quickStatsContainer.classList.remove('hidden');
            
            // Scroll to top of table
            quickStatsContainer.parentElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (error) {
            console.error('Error fetching records details:', error);
            recordsSkeleton.classList.add('hidden');
            quickStatsContainer.innerHTML = `
                <div class="p-8 text-center text-red-650">
                    <i class="bi bi-exclamation-triangle text-3xl block mb-2"></i>
                    Lỗi tải dữ liệu chi tiết. Vui lòng tải lại trang.
                </div>
            `;
            quickStatsContainer.classList.remove('hidden');
        }
    };

    // Initialize Page
    const loadAvailablePatternKeys = async () => {
        try {
            const data = await fetchJSON(`${BASE_URL}/api/statistics/quick-stats?keysOnly=true`);
            if (data && Array.isArray(data.keys)) {
                availablePatternKeys = new Set(data.keys);
            }
        } catch (error) {
            console.warn('Không tải được danh sách key quick_stats, vẫn hiển thị toàn bộ cấu hình:', error);
            availablePatternKeys = null;
        }
    };

    const initPage = async () => {
        if (typeof STATS_OPTIONS === 'undefined') {
            console.error('STATS_OPTIONS is not loaded! Check stats-config.js inclusion.');
            pageInfo.textContent = 'Lỗi cấu hình STATS_OPTIONS.';
            return;
        }

        await loadAvailablePatternKeys();

        // 1. Populate category dropdown and compile allPatterns array
        allPatterns = [];
        for (const groupName in STATS_OPTIONS) {
            const groupPatterns = [];

            // Compile flat list of patterns
            STATS_OPTIONS[groupName].forEach(option => {
                const key = `${option.category}${option.subcategory ? ':' + option.subcategory : ''}`;
                if (!hasRecordData(key)) return;
                const pattern = {
                    key: key,
                    text: option.text,
                    groupName: groupName
                };
                pattern.sortMeta = buildPatternSortMeta(pattern);
                pattern.sortSearchText = normalizeSearchText([
                    pattern.key,
                    pattern.text,
                    pattern.groupName,
                    pattern.sortMeta.axisLabel,
                    pattern.sortMeta.valueLabel,
                    pattern.sortMeta.sequenceLabel
                ].join(' '));
                groupPatterns.push(pattern);
            });

            if (groupPatterns.length > 0) {
                const opt = document.createElement('option');
                opt.value = groupName;
                opt.textContent = groupName;
                recordGroup.appendChild(opt);
                allPatterns.push(...groupPatterns.sort(comparePatterns));
            }
        }

        allPatterns.sort(comparePatterns);
        filteredPatterns = [...allPatterns];

        if (allPatterns.some(pattern => pattern.sortMeta && pattern.sortMeta.sequenceLabel === 'Nhịp block A/B')) {
            const opt = document.createElement('option');
            opt.value = '__SEQ_BLOCK_AB__';
            opt.textContent = 'Nhịp block A/B (AABAA, AAABBAAA...)';
            recordGroup.appendChild(opt);
        }

        // 2. Bind event listeners
        let searchTimeout;
        recordSearch.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchQuery = e.target.value.trim().toLowerCase();
                applyFilters();
            }, 300);
        });

        recordGroup.addEventListener('change', (e) => {
            selectedGroup = e.target.value;
            applyFilters();
        });

        pageSizeSelect.addEventListener('change', (e) => {
            pageSize = parseInt(e.target.value);
            applyFilters();
        });

        // Top Pagination Buttons
        prevPageBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderPagination();
                loadCurrentPage();
            }
        });

        nextPageBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredPatterns.length / pageSize);
            if (currentPage < totalPages) {
                currentPage++;
                renderPagination();
                loadCurrentPage();
            }
        });

        // Bottom Pagination Buttons
        prevPageBtnBottom.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderPagination();
                loadCurrentPage();
            }
        });

        nextPageBtnBottom.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredPatterns.length / pageSize);
            if (currentPage < totalPages) {
                currentPage++;
                renderPagination();
                loadCurrentPage();
            }
        });

        // 3. Render initial view
        applyFilters();
    };

    // Run Initialization
    initPage();
});
})();
