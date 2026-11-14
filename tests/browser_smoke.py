"""Static layout inspection ONLY. Browser network denies loopback in this runtime.
Never interpret as successful compilation or racing gameplay.
"""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'web/index.html').read_text()
css=(root/'web/mobile.css').read_text()
html=html.replace('<link rel="stylesheet" href="./mobile.css" />','<style>'+css+'</style>')
html=re.sub(r'<script[^>]*></script>','',html)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for w,h in [(667,375),(1280,720)]:
        page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
        page.set_content(html,wait_until='load')
        assert 'SPEED' in page.locator('h1').inner_text()
        assert page.locator('#start').count()==1
        page.screenshot(path=str(root/f'tests/shell-{w}x{h}.png'))
        print(f'PASS: Chromium static HTML/CSS layout {w}x{h} (NOT runtime/gameplay)')
        page.close()
    browser.close()
