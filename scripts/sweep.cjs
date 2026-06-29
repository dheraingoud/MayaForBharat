// One-off probe — navigate /workbench, screenshot, inspect DOM for 3 indicators
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const t0 = Date.now();
  try {
    await page.goto('http://localhost:3000/workbench', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.log('NAV_ERROR ' + e.message);
    await browser.close();
    process.exit(1);
  }

  // Let builder mount
  await page.waitForTimeout(4500);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({ path: `C:/Users/HP/OneDrive/Desktop/MAYA/.playwright-mcp/sweep-${stamp}.png`, fullPage: false });

  // Indicator 1: Terminal Error card always visible (should NOT show unless real error)
  const html = await page.content();
  const text = (await page.locator('body').innerText()).toLowerCase();

  // Be specific — look for actual "Terminal Error" / "Terminal error" UI card text
  const termErrorVisible = /terminal (error|crash)|worker has crashed|terminal timed out/i.test(text);

  // Indicator 2: Progressive chat steps rendered (thinking/thought-Xs/response sequencing)
  // Look for typical bolt.diy progressive markers
  const chatProgressiveClean =
    /thought for|step (1[0-9]?|9|[1-9])|reading file|wrote file|generating/i.test(text) ||
    /<div[^>]*data-testid="status"/i.test(html);

  // Indicator 3: Terminal toggle hidden by default when closed
  // Look for terminal panel close-state — when no error, terminal pane usually collapsed
  // Probe for TerminalPanel data-testid or specific class
  const terminalToggle = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter(el => /terminal/i.test(el.getAttribute('aria-label') || el.textContent || ''))
      .map(el => ({
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 80),
        visible: el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0,
      }));
    return candidates.slice(0, 6);
  });

  const termPanelState = await page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll('[data-terminal-panel], [data-panel-id="terminal"], [data-testid="terminal-panel"], aside, [class*="terminal-panel"]'))
      .slice(0, 5)
      .map(el => ({
        cls: (el.className || '').toString().slice(0, 60),
        w: Math.round(el.getBoundingClientRect().width),
        visible: el.getBoundingClientRect().width > 0,
      }));
    return panels;
  });

  console.log('TERM_ERROR_VISIBLE=' + termErrorVisible);
  console.log('CHAT_PROGRESSIVE_CLEAN=' + chatProgressiveClean);
  console.log('TERMINAL_TOGGLE_JSON=' + JSON.stringify(terminalToggle));
  console.log('TERMINAL_PANEL_JSON=' + JSON.stringify(termPanelState));
  console.log('TEXT_HEAD=' + text.replace(/\s+/g, ' ').slice(0, 400));
  console.log('TIME_MS=' + (Date.now() - t0));

  await browser.close();
})();
