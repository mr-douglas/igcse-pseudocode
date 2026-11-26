// Browser smoke test (run in CI): the page loads, and editing either box updates the other.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const url = process.env.URL || 'http://localhost:8000/';
  const out = process.env.OUT || 'results';
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  await page.goto(url);
  await page.waitForTimeout(500);
  check('first example converted', (await page.inputValue('#python')).includes('HOURLY_RATE = 6.50'));

  await page.fill('#python', 'total = 0\nfor i in range(1, 6):\n    total += i\nprint("Total:", total)\n');
  await page.waitForTimeout(500);
  const ps = await page.inputValue('#pseudo');
  check('python -> pseudocode', ps.includes('FOR i ← 1 TO 5') && ps.includes('DECLARE Total : INTEGER'), ps);

  await page.click('#clear');
  await page.click('#pseudo');
  await page.keyboard.type('DECLARE X : INTEGER\nX <- 5\nOUTPUT X * 2');
  await page.waitForTimeout(500);
  check('typing <- becomes ←', (await page.inputValue('#pseudo')).includes('X ← 5'));
  const py = await page.inputValue('#python');
  check('pseudocode -> python', py.includes('X = 5') && py.includes('print(X * 2)'), py);

  await page.selectOption('#examples', { index: 4 });
  await page.waitForTimeout(400);
  check('examples menu', (await page.inputValue('#python')).includes('while True:'));
  await page.screenshot({ path: `${out}/screenshot.png` });
  check('no page errors', !errors.length, errors.join('\n'));
  fs.writeFileSync(`${out}/browser.json`, JSON.stringify(checks, null, 2));
  console.log(JSON.stringify(checks, null, 2));
  await browser.close();
  process.exit(checks.every((c) => c.ok) ? 0 : 1);
})();
