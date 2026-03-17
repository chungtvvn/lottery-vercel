// Settings Page JavaScript

function updateCurrentConfigDisplay() {
    const config = AppConfig.current;
    const display = {
        'Chiến lược Loại trừ': config.EXCLUSION_STRATEGY || 'BALANCED',
        'Dùng Confidence Score': config.USE_CONFIDENCE_SCORE !== false ? 'Có' : 'Không',
        'Chiến lược Gap': config.GAP_STRATEGY || 'COMBINED',
        'Gap Buffer': `${Math.round((config.GAP_BUFFER_PERCENT !== undefined ? config.GAP_BUFFER_PERCENT : 0) * 100)}%`,
        'Ngưỡng Gap (Legacy)': `${Math.round(config.GAP_THRESHOLD_PERCENT * 100)}%`,
        'Sử dụng minGap': config.USE_MIN_GAP ? 'Có' : 'Không',
        'Phần trăm minGap': `${Math.round(config.MIN_GAP_PERCENT * 100)}%`,
        'Số tiền ban đầu': `${config.INITIAL_BET_AMOUNT},000 VND`,
        'Bước nhảy': `${config.BET_STEP_AMOUNT},000 VND`,
        'Hiển thị màu nền': config.SHOW_PROBABILITY_BACKGROUNDS ? 'Có' : 'Không',
        'Highlight số': config.HIGHLIGHT_LAST_GAP ? 'Có' : 'Không'
    };
    document.getElementById('current-config').textContent = JSON.stringify(display, null, 2);
}

function loadSettings() {
    const config = AppConfig.current;

    // NEW: Exclusion Strategy Settings
    document.getElementById('use-confidence-score').checked = config.USE_CONFIDENCE_SCORE !== false;
    document.getElementById('exclusion-strategy').value = config.EXCLUSION_STRATEGY || 'BALANCED';

    // New Settings
    document.getElementById('gap-strategy').value = config.GAP_STRATEGY || 'COMBINED';
    document.getElementById('gap-buffer').value = Math.round((config.GAP_BUFFER_PERCENT !== undefined ? config.GAP_BUFFER_PERCENT : 0) * 100);
    document.getElementById('gap-buffer-value').textContent = Math.round((config.GAP_BUFFER_PERCENT !== undefined ? config.GAP_BUFFER_PERCENT : 0) * 100) + '%';

    // Legacy Settings
    document.getElementById('gap-threshold').value = Math.round(config.GAP_THRESHOLD_PERCENT * 100);
    document.getElementById('gap-threshold-value').textContent = Math.round(config.GAP_THRESHOLD_PERCENT * 100) + '%';
    document.getElementById('use-min-gap').checked = config.USE_MIN_GAP;
    document.getElementById('min-gap-percent').value = Math.round(config.MIN_GAP_PERCENT * 100);
    document.getElementById('min-gap-percent-value').textContent = Math.round(config.MIN_GAP_PERCENT * 100) + '%';
    document.getElementById('initial-bet').value = config.INITIAL_BET_AMOUNT;
    document.getElementById('bet-step').value = config.BET_STEP_AMOUNT;
    document.getElementById('show-backgrounds').checked = config.SHOW_PROBABILITY_BACKGROUNDS;
    document.getElementById('highlight-gap').checked = config.HIGHLIGHT_LAST_GAP;

    updateCurrentConfigDisplay();
}

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.className = `fixed top-4 right-4 px-6 py-4 rounded-lg shadow-lg z-50 ${type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'
        } text-white font-semibold`;
    notification.textContent = message;
    notification.classList.remove('hidden');

    setTimeout(() => notification.classList.add('hidden'), 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();

    // Update value display when slider changes
    document.getElementById('gap-buffer').addEventListener('input', (e) => {
        document.getElementById('gap-buffer-value').textContent = e.target.value + '%';
    });

    document.getElementById('gap-threshold').addEventListener('input', (e) => {
        document.getElementById('gap-threshold-value').textContent = e.target.value + '%';
    });

    document.getElementById('min-gap-percent').addEventListener('input', (e) => {
        document.getElementById('min-gap-percent-value').textContent = e.target.value + '%';
    });

    // Save settings
    document.getElementById('save-settings').addEventListener('click', () => {
        const newConfig = {
            // NEW: Exclusion Strategy Settings
            USE_CONFIDENCE_SCORE: document.getElementById('use-confidence-score').checked,
            EXCLUSION_STRATEGY: document.getElementById('exclusion-strategy').value,
            // Gap Settings
            GAP_STRATEGY: document.getElementById('gap-strategy').value,
            GAP_BUFFER_PERCENT: parseFloat(document.getElementById('gap-buffer').value) / 100,
            GAP_THRESHOLD_PERCENT: parseFloat(document.getElementById('gap-threshold').value) / 100,
            USE_MIN_GAP: document.getElementById('use-min-gap').checked,
            MIN_GAP_PERCENT: parseFloat(document.getElementById('min-gap-percent').value) / 100,
            INITIAL_BET_AMOUNT: parseInt(document.getElementById('initial-bet').value),
            BET_STEP_AMOUNT: parseInt(document.getElementById('bet-step').value),
            SHOW_PROBABILITY_BACKGROUNDS: document.getElementById('show-backgrounds').checked,
            HIGHLIGHT_LAST_GAP: document.getElementById('highlight-gap').checked
        };

        AppConfig.save(newConfig);
        updateCurrentConfigDisplay();

        showNotification('✓ Đã lưu cài đặt thành công!', 'success');
    });

    // Reset settings
    document.getElementById('reset-settings').addEventListener('click', () => {
        if (confirm('Khôi phục về cài đặt mặc định?\n\nNgưỡng Gap: 15%\nSử dụng minGap: Có\nHiển thị màu: Có\nHighlight số: Có')) {
            AppConfig.reset();
            loadSettings();
            showNotification('✓ Đã khôi phục cài đặt mặc định!', 'success');
        }
    });

    // Clear prediction history
    document.getElementById('clear-history').addEventListener('click', async () => {
        if (!confirm('⚠️ XÁC NHẬN XÓA LỊCH SỬ\n\nHành động này sẽ:\n• Xóa toàn bộ lịch sử dự đoán\n• Chỉ giữ lại dự đoán mới nhất\n• Reset mức cược về mặc định\n\nBạn có chắc chắn muốn tiếp tục?')) {
            return;
        }

        try {
            const defaultBetAmount = AppConfig.current.INITIAL_BET_AMOUNT || 10;

            const response = await fetch('/api/analysis/history/clear', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ defaultBetAmount })
            });

            const result = await response.json();

            if (result.success) {
                showNotification(`✓ ${result.message}`, 'success');
            } else {
                showNotification(`✗ ${result.error || 'Lỗi không xác định'}`, 'error');
            }
        } catch (error) {
            console.error('Lỗi khi xóa lịch sử:', error);
            showNotification('✗ Lỗi kết nối server', 'error');
        }
    });

    // Update display when checkboxes change
    ['use-min-gap', 'show-backgrounds', 'highlight-gap'].forEach(id => {
        document.getElementById(id).addEventListener('change', updateCurrentConfigDisplay);
    });
});
