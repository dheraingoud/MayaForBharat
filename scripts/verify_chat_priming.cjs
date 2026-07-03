const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const url = 'http://localhost:3000/workbench/1fd055a1-ee53-41b4-b107-ddef65641203?prompt=build+me+a+learn+ml+app';
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(6000);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({ path: 'C:/Users/HP/OneDrive/Desktop/MAYA/.playwright-mcp/chat-prime-' + stamp + '.png', fullPage: false });

  const probe = await page.evaluate(() => {
    const text = (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 1500);
    const pills = [];
    document.querySelectorAll('[class*="rounded-md"][class*="border"]').forEach((el) => {
      const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
      if (/(Plan|Setup|Files|Live)/.test(t)) pills.push(t);
    });
    const chatHadUserPrompt = /build.*me.*a.*learn.*ml.*app|अपने.*ऐप.*का.*विवरण/i.test(text);
    const chatHadPlan = /App plan|Features|Tech stack|build me a learn ml app where users/i.test(text);
    return { pills: pills.slice(0, 8), chatHadUserPrompt, chatHadPlan, len: text.length };
  });
  console.log('PILLS=' + JSON.stringify(probe.pills));
  console.log('CHAT_USER_PROMPT=' + probe.chatHadUserPrompt);
  console.log('CHAT_PLAN=' + probe.chatHadPlan);
  console.log('TEXT_LEN=' + probe.len);
  console.log('TIME_MS=' + (Date.now() - t0));
  await browser.close();
})();
