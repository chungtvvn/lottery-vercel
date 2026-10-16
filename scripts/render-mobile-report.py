#!/usr/bin/env python3
import os
import base64
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

def render_report():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    html_path = os.path.join(base_dir, 'scripts', 'report-mobile.html')
    output_png = os.path.join(base_dir, 'bao-cao-de-advisor-vs-shadow-2026.png')
    public_export_dir = os.path.join(base_dir, 'public', 'exports')
    os.makedirs(public_export_dir, exist_ok=True)
    public_png = os.path.join(public_export_dir, 'bao-cao-de-advisor-vs-shadow-2026.png')

    options = Options()
    options.add_argument('--headless=new')
    options.add_argument('--disable-gpu')
    options.add_argument('--no-sandbox')
    options.binary_location = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

    driver = webdriver.Chrome(options=options)
    
    file_url = f"file://{html_path}"
    driver.get(file_url)

    # Đặt độ rộng 860px và Retina scale 2x để ảnh siêu nét trên điện thoại
    driver.execute_cdp_cmd('Emulation.setDeviceMetricsOverride', {
        'width': 860,
        'height': 1200,
        'deviceScaleFactor': 2,
        'mobile': True
    })

    # Chụp toàn bộ chiều dài trang (captureBeyondViewport)
    cdp_res = driver.execute_cdp_cmd('Page.captureScreenshot', {
        'captureBeyondViewport': True,
        'fromSurface': True
    })

    img_data = base64.b64decode(cdp_res['data'])

    with open(output_png, 'wb') as f:
        f.write(img_data)

    with open(public_png, 'wb') as f:
        f.write(img_data)

    driver.quit()
    print(f"Successfully exported report image to:")
    print(f"1. {output_png}")
    print(f"2. {public_png}")

if __name__ == '__main__':
    render_report()
