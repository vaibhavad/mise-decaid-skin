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
    page.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto('http://localhost:24800/')
    page.wait_for_selector('.view-home', timeout=8000)
    time.sleep(1.5)
    page.screenshot(path=f'{out}/1-home.png')
    # change dose with the stepper
    page.click('button[aria-label="More coffee"]')
    page.click('button[aria-label="More coffee"]')
    time.sleep(1.2)
    print('dose after 2 taps:', page.inner_text('.stepper-value'))
    # start a shot with the simulated machine button
    urllib.request.urlopen(urllib.request.Request('http://localhost:8080/__test/press/espresso', method='POST'))
    page.wait_for_selector('.view-brewing', timeout=5000)
    time.sleep(16)
    page.screenshot(path=f'{out}/2-brewing.png')
    page.wait_for_selector('.view-review', timeout=40000)
    time.sleep(5)
    page.click('button.seg:nth-child(3)')
    page.fill('#shot-notes', 'Sweet, a little sharp at the end')
    time.sleep(2)
    page.screenshot(path=f'{out}/3-review.png')
    print('saved line:', page.inner_text('.saved-line'))
    page.click('text=Done')
    time.sleep(1)
    page.screenshot(path=f'{out}/1b-home-after.png')
    page.click('.rail-item:has-text("Recipes")'); time.sleep(0.6)
    page.screenshot(path=f'{out}/4-recipes.png')
    page.click('.rail-item:has-text("Milk")'); time.sleep(0.6)
    page.screenshot(path=f'{out}/5-water.png')
    page.click('.rail-item:has-text("History")'); time.sleep(1.2)
    page.screenshot(path=f'{out}/6-history.png')
    browser.close()
print('console problems:', errors if errors else 'none')
