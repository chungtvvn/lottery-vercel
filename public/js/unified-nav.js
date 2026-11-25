(function () {
    'use strict';

    const PRIMARY_NAV = [
        { href: '/daily-advisor', label: 'Tinh Hoa', icon: 'bi-trophy-fill', accent: 'text-amber-600' },
        { href: '/de-tinh-gon', label: 'Đề Tinh Gọn', icon: 'bi-gem', accent: 'text-indigo-600' },
        { href: '/loto', label: 'Lô 27 Giải', icon: 'bi-dice-5-fill', accent: 'text-emerald-600' },
        { href: '/ai-5', label: '5 AI 360', icon: 'bi-cpu-fill', accent: 'text-purple-600' },
        { href: '/xien-fusion', label: 'Xiên Ghép', icon: 'bi-lightning-charge-fill', accent: 'text-amber-600' },
        { href: '/de-fusion', label: 'Đề Fusion', icon: 'bi-crosshair', accent: 'text-rose-600' }
    ];

    const SECONDARY_NAV = [
        { href: '/daily-advisor-shadow', label: 'Shadow Thực Chiến', icon: 'bi-shield-check' },
        { href: '/statistics', label: 'Thống Kê XSMB', icon: 'bi-bar-chart-line-fill' },
        { href: '/records', label: 'Kỷ Lục Lịch Sử', icon: 'bi-award-fill' },
        { href: '/chain-frequency', label: 'Mốc Chuỗi 20 Năm', icon: 'bi-clock-history' },
        { href: '/simulation', label: 'Lịch Sử Mô Phỏng', icon: 'bi-activity' },
        { href: '/probability-score', label: 'Điểm Xác Suất', icon: 'bi-grid-3x3-gap-fill' },
        { href: '/scoring', label: 'Chấm Điểm', icon: 'bi-sliders' },
        { href: '/settings', label: 'Cài Đặt Hệ Thống', icon: 'bi-gear-fill' }
    ];

    function normalizePath(p) {
        if (!p) return '/daily-advisor';
        const clean = p.replace(/\/+$/, '') || '/';
        return clean === '/' ? '/daily-advisor' : clean;
    }

    function renderUnifiedHeader() {
        const existingHeader = document.querySelector('header');
        if (!existingHeader) return;

        const currentPath = normalizePath(window.location.pathname);
        const isSecondaryActive = SECONDARY_NAV.some(item => item.href === currentPath);
        const activeSecondary = SECONDARY_NAV.find(item => item.href === currentPath);

        const desktopPrimaryHtml = PRIMARY_NAV.map(item => {
            const active = item.href === currentPath;
            return `<a href="${item.href}" class="xsmb-nav-pill ${active ? 'is-active' : ''}">
                <i class="bi ${item.icon} ${active ? item.accent : 'text-slate-400'}"></i>
                <span>${item.label}</span>
            </a>`;
        }).join('');

        const dropdownItemsHtml = SECONDARY_NAV.map(item => {
            const active = item.href === currentPath;
            return `<a href="${item.href}" class="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-100'}">
                <i class="bi ${item.icon} ${active ? 'text-blue-600' : 'text-slate-400'}"></i>
                <span>${item.label}</span>
            </a>`;
        }).join('');

        const mobileAllHtml = [...PRIMARY_NAV, ...SECONDARY_NAV.slice(0, 4)].map(item => {
            const active = item.href === currentPath;
            return `<a href="${item.href}" class="xsmb-nav-pill text-xs px-2.5 py-1.5 ${active ? 'is-active' : ''}">
                <i class="bi ${item.icon} ${active ? (item.accent || 'text-blue-600') : 'text-slate-400'}"></i>
                <span>${item.label}</span>
            </a>`;
        }).join('');

        existingHeader.className = 'xsmb-unified-header mb-5';
        existingHeader.innerHTML = `
            <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div class="flex h-15 items-center justify-between gap-3 py-2">
                    <a href="/daily-advisor" class="flex items-center gap-2.5 shrink-0">
                        <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-amber-400 shadow-sm">
                            <i class="bi bi-stars text-lg"></i>
                        </span>
                        <div class="leading-tight">
                            <span class="block text-base font-black tracking-tight text-slate-900">XSMB <span class="text-blue-600">Stats</span></span>
                            <span class="hidden sm:block text-[10px] font-bold uppercase tracking-wider text-slate-500">Strict PIT · Command Center</span>
                        </div>
                    </a>

                    <nav class="hidden lg:flex items-center gap-1" aria-label="Điều hướng chính">
                        ${desktopPrimaryHtml}
                        <div class="relative ml-1" id="xsmbMoreMenuWrap">
                            <button type="button" id="xsmbMoreMenuBtn" class="xsmb-nav-pill cursor-pointer ${isSecondaryActive ? 'is-active' : ''}">
                                <i class="bi bi-grid-fill ${isSecondaryActive ? 'text-blue-600' : 'text-slate-400'}"></i>
                                <span>${activeSecondary ? activeSecondary.label : 'Phân Tích'}</span>
                                <i class="bi bi-chevron-down text-[10px] ml-0.5"></i>
                            </button>
                            <div id="xsmbMoreMenuPanel" class="xsmb-nav-dropdown-panel hidden absolute right-0 mt-2 w-56 rounded-2xl p-2 z-50">
                                <div class="px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Nghiên Cứu &amp; Thống Kê</div>
                                <div class="space-y-0.5">${dropdownItemsHtml}</div>
                            </div>
                        </div>
                    </nav>

                    <div class="flex lg:hidden items-center gap-1.5 overflow-x-auto max-w-[68vw] py-0.5 custom-scrollbar">
                        ${mobileAllHtml}
                    </div>
                </div>
            </div>
        `;

        const btn = document.getElementById('xsmbMoreMenuBtn');
        const panel = document.getElementById('xsmbMoreMenuPanel');
        if (btn && panel) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                panel.classList.toggle('hidden');
            });
            document.addEventListener('click', (e) => {
                if (!panel.contains(e.target) && !btn.contains(e.target)) {
                    panel.classList.add('hidden');
                }
            });
        }

        // Remove redundant duplicate link-only subtabs on secondary pages (keep interactive button subtabs on /daily-advisor)
        if (currentPath !== '/daily-advisor') {
            const mainEl = document.querySelector('main');
            if (mainEl) {
                const firstChild = mainEl.firstElementChild;
                if (firstChild && firstChild.tagName === 'DIV') {
                    const links = firstChild.querySelectorAll('a[href="/daily-advisor"], a[href="/ai-5"], a[href="/de-tinh-gon"]');
                    const buttons = firstChild.querySelectorAll('button');
                    if (links.length >= 3 && buttons.length === 0) {
                        firstChild.classList.add('hidden');
                    }
                }
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderUnifiedHeader);
    } else {
        renderUnifiedHeader();
    }
})();
