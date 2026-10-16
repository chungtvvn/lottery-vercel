#!/usr/bin/env python3
import os
import json
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler
import threading
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

class CustomHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        clean_path = self.path.split('?')[0]
        if clean_path == '/api/daily-advisor':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            cache_file = os.path.join(self.server.base_dir, 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json')
            with open(cache_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            self.wfile.write(json.dumps({'success': True, **data}).encode('utf-8'))
            return

        if clean_path == '/' or clean_path.startswith('/daily-advisor'):
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            html_file = os.path.join(self.server.base_dir, 'views', 'daily-advisor.html')
            with open(html_file, 'r', encoding='utf-8') as f:
                self.wfile.write(f.read().encode('utf-8'))
            return

        # Serve static assets from public
        if clean_path.startswith('/js/') or clean_path.startswith('/css/') or clean_path.startswith('/exports/'):
            file_rel = clean_path.lstrip('/')
            full_path = os.path.join(self.server.base_dir, 'public', file_rel)
            if os.path.exists(full_path):
                self.send_response(200)
                if clean_path.endswith('.js'):
                    self.send_header('Content-Type', 'application/javascript')
                elif clean_path.endswith('.css'):
                    self.send_header('Content-Type', 'text/css')
                elif clean_path.endswith('.png'):
                    self.send_header('Content-Type', 'image/png')
                self.end_headers()
                with open(full_path, 'rb') as f:
                    self.wfile.write(f.read())
                return

        super().do_GET()

def run_test():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    server = HTTPServer(('127.0.0.1', 8999), CustomHandler)
    server.base_dir = base_dir

    server_thread = threading.Thread(target=server.serve_forever)
    server_thread.daemon = True
    server_thread.start()
    print("Test HTTP server started at http://127.0.0.1:8999")

    options = Options()
    options.add_argument('--headless=new')
    options.add_argument('--disable-gpu')
    options.add_argument('--no-sandbox')
    options.binary_location = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

    driver = webdriver.Chrome(options=options)
    driver.set_window_size(1400, 1200)

    try:
        driver.get('http://127.0.0.1:8999/daily-advisor')
        time.sleep(2)

        # 1. Dismiss intro modal if open
        time.sleep(0.5)
        close_modal_btn = driver.find_elements(By.XPATH, "//button[contains(text(), 'Đã hiểu') or contains(text(), 'Đóng')]")
        if close_modal_btn:
            driver.execute_script("arguments[0].click();", close_modal_btn[0])
            time.sleep(0.3)

        # Switch to Dual Merge / Research tab
        tab_btn = driver.find_element(By.ID, 'tabBtnDualMerge')
        print("Clicking tab '🔬 Nghiên Cứu Đề Hàng Ngày'...")
        driver.execute_script("arguments[0].click();", tab_btn)
        time.sleep(0.5)

        # Verify dualMergeView is visible
        view_el = driver.find_element(By.ID, 'dualMergeView')
        assert 'hidden' not in view_el.get_attribute('class'), "dualMergeView should not be hidden"
        print("✅ dualMergeView is active and visible!")

        # 2. Check Target Date
        target_date_el = driver.find_element(By.ID, 'deResearchTargetDate')
        target_date_text = target_date_el.text
        print(f"✅ Target Date: {target_date_text}")
        assert target_date_text != '--/--/----', f"Target date should be populated, got {target_date_text}"

        # 3. Check Mode Switcher counts
        count_golden = driver.find_element(By.ID, 'countModeIntersection').text
        count_shadow = driver.find_element(By.ID, 'countModeShadow').text
        count_union = driver.find_element(By.ID, 'countModeUnion').text
        count_da4 = driver.find_element(By.ID, 'countModeDA4').text
        print(f"✅ Mode Counts -> Golden: {count_golden}, Shadow: {count_shadow}, Union: {count_union}, DA4: {count_da4}")
        assert count_golden == '19', f"Expected golden count 19, got {count_golden}"
        assert count_shadow == '20', f"Expected shadow count 20, got {count_shadow}"
        assert count_union == '43', f"Expected union count 43, got {count_union}"
        assert count_da4 == '41', f"Expected da4 count 41, got {count_da4}"

        # 4. Check Number Chips
        chips = driver.find_elements(By.CSS_SELECTOR, '#deResearchChipsContainer span.inline-flex')
        print(f"✅ Rendered {len(chips)} number chips for Golden Intersection")
        assert len(chips) == 19, f"Expected 19 chips, got {len(chips)}"

        # 5. Check Mode Switching to Shadow 1/2
        shadow_btn = driver.find_element(By.CSS_SELECTOR, 'button[data-research-mode="shadowHalf"]')
        driver.execute_script("arguments[0].click();", shadow_btn)
        time.sleep(0.3)
        title_text = driver.find_element(By.ID, 'deResearchActiveTitle').text
        chips_shadow = driver.find_elements(By.CSS_SELECTOR, '#deResearchChipsContainer span.inline-flex')
        print(f"✅ Switched to Shadow mode -> Title: '{title_text}', Chips: {len(chips_shadow)}")
        assert 'Shadow' in title_text
        assert len(chips_shadow) == 20

        # Switch to Comprehensive Union
        union_btn = driver.find_element(By.CSS_SELECTOR, 'button[data-research-mode="comprehensiveUnion"]')
        driver.execute_script("arguments[0].click();", union_btn)
        time.sleep(0.3)
        title_union = driver.find_element(By.ID, 'deResearchActiveTitle').text
        chips_union = driver.find_elements(By.CSS_SELECTOR, '#deResearchChipsContainer span.inline-flex')
        print(f"✅ Switched to Union mode -> Title: '{title_union}', Chips: {len(chips_union)}")
        assert 'Hợp Nhất' in title_union
        assert len(chips_union) == 43

        # Switch back to Golden
        golden_btn = driver.find_element(By.CSS_SELECTOR, 'button[data-research-mode="goldenIntersection"]')
        driver.execute_script("arguments[0].click();", golden_btn)
        time.sleep(0.3)

        # 6. Check Benchmark Table
        benchmark_rows = driver.find_elements(By.CSS_SELECTOR, '#deResearchBenchmarkBody tr')
        print(f"✅ Benchmark table has {len(benchmark_rows)} strategy rows")
        assert len(benchmark_rows) == 5, f"Expected 5 benchmark rows, got {len(benchmark_rows)}"

        # Switch benchmark window to All 2026
        btn_all = driver.find_element(By.ID, 'btnWindowAll2026')
        driver.execute_script("arguments[0].click();", btn_all)
        time.sleep(0.3)
        first_row = driver.find_elements(By.CSS_SELECTOR, '#deResearchBenchmarkBody tr')[0]
        first_row_text = first_row.get_attribute('textContent')
        print(f"✅ All 2026 First Row text: {first_row_text.strip()}")
        assert '283' in first_row_text, "Benchmark table should reflect 283 draws for All 2026"

        # Switch back to Live Combat
        btn_live = driver.find_element(By.ID, 'btnWindowLiveCombat')
        driver.execute_script("arguments[0].click();", btn_live)
        time.sleep(0.3)
        first_row_live = driver.find_elements(By.CSS_SELECTOR, '#deResearchBenchmarkBody tr')[0]
        first_row_text_live = first_row_live.get_attribute('textContent')
        print(f"✅ Live Combat First Row text: {first_row_text_live.strip()}")
        assert '28' in first_row_text_live, "Benchmark table should reflect 28 draws for Live Combat"

        # 7. Check Daily Settled Ledger Table
        ledger_rows = driver.find_elements(By.CSS_SELECTOR, '#deResearchDailyLedgerBody tr')
        print(f"✅ Daily settled ledger has {len(ledger_rows)} rows")
        assert len(ledger_rows) == 283, f"Expected 283 ledger rows, got {len(ledger_rows)}"

        # Filter by Golden hits
        filter_golden_btn = driver.find_element(By.CSS_SELECTOR, 'button[data-ledger-filter="golden"]')
        driver.execute_script("arguments[0].click();", filter_golden_btn)
        time.sleep(0.3)
        golden_filtered_rows = driver.find_elements(By.CSS_SELECTOR, '#deResearchDailyLedgerBody tr')
        print(f"✅ Filtered by Golden hits: {len(golden_filtered_rows)} rows")
        assert len(golden_filtered_rows) == 62, f"Expected 62 golden hits in 2026, got {len(golden_filtered_rows)}"

        # Filter by Comprehensive Union hits
        filter_union_btn = driver.find_element(By.CSS_SELECTOR, 'button[data-ledger-filter="union"]')
        driver.execute_script("arguments[0].click();", filter_union_btn)
        time.sleep(0.3)
        union_filtered_rows = driver.find_elements(By.CSS_SELECTOR, '#deResearchDailyLedgerBody tr')
        print(f"✅ Filtered by Union hits: {len(union_filtered_rows)} rows")
        assert len(union_filtered_rows) == 123, f"Expected 123 union hits in 2026, got {len(union_filtered_rows)}"

        # Filter by Loss
        filter_loss_btn = driver.find_element(By.CSS_SELECTOR, 'button[data-ledger-filter="loss"]')
        driver.execute_script("arguments[0].click();", filter_loss_btn)
        time.sleep(0.3)
        loss_filtered_rows = driver.find_elements(By.CSS_SELECTOR, '#deResearchDailyLedgerBody tr')
        print(f"✅ Filtered by Loss: {len(loss_filtered_rows)} rows")
        assert len(loss_filtered_rows) == 160, f"Expected 160 losses in 2026, got {len(loss_filtered_rows)}"

        # Reset filter to all
        driver.execute_script("arguments[0].click();", driver.find_element(By.CSS_SELECTOR, 'button[data-ledger-filter="all"]'))
        time.sleep(0.3)

        # 8. Capture Screenshot of the research tab
        import base64
        screenshot_path = os.path.join(base_dir, 'scripts', 'screenshot-test-tab.png')
        cdp_res = driver.execute_cdp_cmd('Page.captureScreenshot', {
            'captureBeyondViewport': True,
            'fromSurface': True
        })
        with open(screenshot_path, 'wb') as f:
            f.write(base64.b64decode(cdp_res['data']))
        print(f"✅ Full-page screenshot saved to {screenshot_path}")

        print("\n ALL UI & INTERACTION TESTS PASSED 100% SUCCESSFULLY! ")

    finally:
        driver.quit()
        server.shutdown()

if __name__ == '__main__':
    run_test()
