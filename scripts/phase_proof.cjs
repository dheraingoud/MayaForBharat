const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/workbench', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4500);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({ path: 'C:/Users/HP/OneDrive/Desktop/MAYA/.playwright-mcp/phase-' + stamp + '.png', fullPage: false });

  const phasePills = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('[class*="rounded-md"][class*="border"]').forEach((el) => {
      const t = (el.textContent || '').trim();
      if (/(Plan|Setup|Files|Live)/.test(t)) {
        out.push(t.replace(/\s+/g, ' ').slice(0, 30));
     }
    });
    return out.slice(0, 8);
  });

  const hasEmptyState = await page.evaluate(() => {
    return !!document.body.innerText.match(/अपने ऐप|Describe your idea/i);
  });

  console.log('PHASE_PILLS=' + JSON.stringify(phasePills));
  console.log('HAS_EMPTY_STATE=' + hasEmptyState);
  console.log('SCREENSHOT_OK');
  await browser.close();
})();
