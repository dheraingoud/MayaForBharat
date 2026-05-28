const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const screensDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screensDir)) fs.mkdirSync(screensDir, { recursive: true });

const urls = [
  { url: 'http://127.0.0.1:3000/', name: '01-home' },
  { url: 'http://127.0.0.1:3000/sign-in', name: '02-sign-in' },
  { url: 'http://127.0.0.1:3000/sign-up', name: '03-sign-up' },
  { url: 'http://127.0.0.1:3000/record', name: '04-record-redirect' },
  { url: 'http://127.0.0.1:3000/builder', name: '05-builder-redirect' },
  { url: 'http://127.0.0.1:3000/dashboard', name: '06-dashboard-redirect' },
  { url: 'http://127.0.0.1:3000/showcase', name: '07-showcase' },
  { url: 'http://127.0.0.1:3000/updates', name: '08-updates' },
  { url: 'http://127.0.0.1:3000/approval', name: '09-approval-redirect' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const results = [];

  for (const item of urls) {
    const page = await context.newPage();
    try {
      const res = await page.goto(item.url, { waitUntil: 'networkidle', timeout: 15000 });
      const title = await page.title();
      const finalUrl = page.url();
      const h1 = await page.locator('h1').first().textContent().catch(() => null);
      const h2 = await page.locator('h2').first().textContent().catch(() => null);
      const ssPath = path.join(screensDir, `${item.name}.png`);
      await page.screenshot({ path: ssPath, fullPage: true });

      results.push({
        name: item.name,
        url: item.url,
        finalUrl,
        status: res?.status(),
        title,
        h1,
        h2,
        screenshot: ssPath,
      });
      console.log(JSON.stringify({ name: item.name, finalUrl, status: res?.status(), title, h1 }));
    } catch (e) {
      results.push({ name: item.name, url: item.url, error: e.message });
      console.log(JSON.stringify({ name: item.name, error: e.message }));
    }
    await page.close();
  }

  await browser.close();

  // Write results to JSON
  fs.writeFileSync(path.join(__dirname, 'sweep-results.json'), JSON.stringify(results, null, 2));
  console.log('---DONE---');
})();
