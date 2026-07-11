// One-off wipe — invokes apps:removeAllApps mutation via ConvexHttpClient.
// Tables preserved; rows cleared.

const { ConvexHttpClient } = require('C:/Users/HP/onedrive/desktop/maya/app-maya/node_modules/convex/dist/cjs/browser/index.js');
const { api } = require('C:/Users/HP/onedrive/desktop/maya/app-maya/convex/_generated/api.js');

(async () => {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL || 'https://fine-capybara-156.convex.cloud';
  const client = new ConvexHttpClient(url);

  console.log('CONVEX=' + url);

  try {
    const result = await client.mutation(api.apps.removeAllApps, { confirm: 'RESET_APPS' });
    console.log('WIPE_RESULT=' + JSON.stringify(result));
  } catch (e) {
    console.log('WIPE_FAIL=' + (e && e.message ? e.message : String(e)));
    process.exit(1);
  }
})();
