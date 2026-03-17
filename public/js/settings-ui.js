/**
 * Settings UI Component
 * Tạo panel settings cho statistics và simulation pages
 */

function createSettingsPanel() {
    const config = AppConfig.current;

    const panel = document.createElement('div');
    panel.id = 'settings-panel';
    panel.className = 'fixed top-20 right-4 bg-white shadow-2xl rounded-lg p-4 z-50 border-2 border-gray-200';
    panel.style.maxWidth = '320px';
    panel.style.display = 'none';

    panel.innerHTML = `
        <div class="flex justify-between items-center mb-4 pb-3 border-b">
            <h3 class="text-lg font-bold text-gray-800">⚙️ Cài Đặt</h3>
            <button id="close-settings" class="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
        </div>
        
        <div class="space-y-4">
            <div>
                <label class="block text-sm font-semibold text-gray-700 mb-2">
                    Ngưỡng Gap (%)
                    <span class="text-xs font-normal text-gray-500 block mt-1">
                        Xác suất thấp nếu: Cách lần cuối &lt; X% TB
                    </span>
                </label>
                <div class="flex items-center gap-2">
                    <input type="range" id="gap-threshold" min="5" max="30" step="1" 
                           value="${config.GAP_THRESHOLD_PERCENT * 100}"
                           class="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer">
                    <span id="gap-threshold-value" class="text-sm font-bold text-blue-600 w-12 text-right">
                        ${Math.round(config.GAP_THRESHOLD_PERCENT * 100)}%
                    </span>
                </div>
                <div class="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Nghiêm (5%)</span>
                    <span>Lỏng (30%)</span>
                </div>
            </div>

            <div class="pt-3 border-t">
                <label class="flex items-center cursor-pointer">
                    <input type="checkbox" id="use-min-gap" ${config.USE_MIN_GAP ? 'checked' : ''}
                           class="w-4 h-4 text-blue-600 rounded">
                    <span class="ml-2 text-sm text-gray-700">Sử dụng Khoảng cách ngắn nhất</span>
                </label>
                <p class="text-xs text-gray-500 ml-6 mt-1">
                    Kiểm tra cả minGap và % TB
                </p>
            </div>

            <div class="pt-3 border-t">
                <label class="flex items-center cursor-pointer">
                    <input type="checkbox" id="show-backgrounds" ${config.SHOW_PROBABILITY_BACKGROUNDS ? 'checked' : ''}
                           class="w-4 h-4 text-blue-600 rounded">
                    <span class="ml-2 text-sm text-gray-700">Hiển thị màu nền cho thẻ</span>
                </label>
            </div>

            <div>
                <label class="flex items-center cursor-pointer">
                    <input type="checkbox" id="highlight-gap" ${config.HIGHLIGHT_LAST_GAP ? 'checked' : ''}
                           class="w-4 h-4 text-blue-600 rounded">
                    <span class="ml-2 text-sm text-gray-700">Highlight "Cách lần cuối"</span>
                </label>
            </div>

            <div class="flex gap-2 pt-4 border-t">
                <button id="apply-settings" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-semibold">
                    ✓ Áp dụng
                </button>
                <button id="reset-settings" class="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 text-sm font-semibold">
                    ↻ Mặc định
                </button>
            </div>
        </div>
    `;

    return panel;
}

function initSettingsUI() {
    // Create toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'settings-toggle';
    toggleBtn.className = 'fixed top-20 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-700 z-40 flex items-center gap-2';
    toggleBtn.innerHTML = '⚙️ <span class="font-semibold">Cài đặt</span>';

    // Create panel
    const panel = createSettingsPanel();

    // Add to body
    document.body.appendChild(toggleBtn);
    document.body.appendChild(panel);

    // Event listeners
    toggleBtn.addEventListener('click', () => {
        const isVisible = panel.style.display !== 'none';
        panel.style.display = isVisible ? 'none' : 'block';
        toggleBtn.style.display = isVisible ? 'block' : 'none';
    });

    document.getElementById('close-settings').addEventListener('click', () => {
        panel.style.display = 'none';
        toggleBtn.style.display = 'block';
    });

    // Update threshold value display
    document.getElementById('gap-threshold').addEventListener('input', (e) => {
        document.getElementById('gap-threshold-value').textContent = e.target.value + '%';
    });

    // Apply settings
    document.getElementById('apply-settings').addEventListener('click', () => {
        const newConfig = {
            GAP_THRESHOLD_PERCENT: parseFloat(document.getElementById('gap-threshold').value) / 100,
            USE_MIN_GAP: document.getElementById('use-min-gap').checked,
            SHOW_PROBABILITY_BACKGROUNDS: document.getElementById('show-backgrounds').checked,
            HIGHLIGHT_LAST_GAP: document.getElementById('highlight-gap').checked
        };

        AppConfig.save(newConfig);
        panel.style.display = 'none';
        toggleBtn.style.display = 'block';

        // Show notification
        showNotification('Đã lưu cài đặt! Đang tải lại...', 'success');

        // Reload page to apply changes
        setTimeout(() => window.location.reload(), 800);
    });

    // Reset settings
    document.getElementById('reset-settings').addEventListener('click', () => {
        if (confirm('Khôi phục cài đặt mặc định?')) {
            AppConfig.reset();
            panel.style.display = 'none';
            toggleBtn.style.display = 'block';
            showNotification('Đã khôi phục mặc định! Đang tải lại...', 'success');
            setTimeout(() => window.location.reload(), 800);
        }
    });
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${type === 'success' ? 'bg-green-500' : 'bg-blue-500'
        } text-white font-semibold`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => notification.remove(), 3000);
}

// Auto-init if AppConfig is available
if (typeof AppConfig !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettingsUI);
} else if (typeof AppConfig !== 'undefined') {
    initSettingsUI();
}
