# Drives the skin in headless Chrome against the mock gateway and saves
# screenshots. Start `npm run gateway` and `npm run serve` first.
# Usage: python3 tools/smoke_test.py shots
import sys, time, urllib.request
from playwright.sync_api import sync_playwright

out = sys.argv[1]
errors = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1340, 'height': 800})
    page.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') and '404' not in m.text else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto('http://localhost:24800/')
    page.wait_for_selector('.r-card', timeout=8000)
    time.sleep(1.5)
    page.screenshot(path=f'{out}/1-brew.png')
    # change the dose with the ruler
    page.click('.vals-row .val:has-text("Coffee in")')
    page.click('.ruler-nudge[aria-label="More"]')
    page.click('.ruler-nudge[aria-label="More"]')
    page.screenshot(path=f'{out}/2-ruler.png')
    page.click('.ruler-actions >> text=Save')
    time.sleep(1.2)
    print('dose after two nudges:', page.inner_text('.vals-row .val:has-text("Coffee in") .val-num'))
    # start a shot with the simulated machine button
    urllib.request.urlopen(urllib.request.Request('http://localhost:8080/__test/press/espresso', method='POST'))
    page.wait_for_selector('.shot-view[data-phase=live]', timeout=5000)
    time.sleep(16)
    page.screenshot(path=f'{out}/3-shot.png')
    page.wait_for_selector('.shot-view[data-phase=done]', timeout=40000)
    time.sleep(5)
    page.click('.after-row button:has-text("Just right")')
    page.fill('.notes-input', 'Sweet, a little sharp at the end')
    time.sleep(2)
    page.screenshot(path=f'{out}/4-after.png')
    print('saved line:', page.inner_text('.after-row .small'))
    page.click('.shot-head >> text=Close')
    time.sleep(1)
    page.click('.link:has-text("All recipes")'); time.sleep(0.6)
    page.screenshot(path=f'{out}/5-recipes.png')
    page.click('.recipe-main >> nth=0'); time.sleep(0.6)
    page.screenshot(path=f'{out}/6-recipe.png')
    page.click('.sheet-head .icon-btn[aria-label="Close"]'); time.sleep(0.4)
    page.click('.top-btn:has-text("History")'); time.sleep(1.2)
    page.screenshot(path=f'{out}/7-history.png')
    page.click('.sheet-head .icon-btn[aria-label="Close"]')
    page.click('.top-btn:has-text("Settings")'); time.sleep(0.8)
    page.screenshot(path=f'{out}/8-settings.png')
    browser.close()
print('console problems:', errors if errors else 'none')
