// Mark an existing apps.specJson-bearing app as "live" by creating a generateJobs row.
// Then the /workbench/[appId] visit will skip the WithJob card and render BuilderPage
// — where the new priming effect fires the [prompt, plan] synthetic chat messages.
const { ConvexHttpClient } = require('C:/Users/HP/onedrive/desktop/maya/app-maya/node_modules/convex/dist/cjs/browser/index.js');
const { api } = require('C:/Users/HP/onedrive/desktop/maya/app-maya/convex/_generated/api.js');

(async () => {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL || 'https://fine-capybara-156.convex.cloud';
  const client = new ConvexHttpClient(url);
  const appId = process.argv[2] || '1fd055a1-ee53-41b4-b107-ddef65641203';
  try {
    const jobId = await client.mutation(api.generateJobs.createJob, {
      appId,
      traderId: 'anonymous',
      prompt: 'build me a learn ml app where users can login and select any machine learning or deep learning algorithm to visualise in real time with tunable parameters that change graphs live',
      model: 'stepfun-ai/step-3.7-flash',
      provider: 'NvidiaNIM',
    });
    console.log('JOB_ID=' + JSON.stringify(jobId));
    const live = await client.mutation(api.generateJobs.markLive, {
      jobId,
      filesJson: JSON.stringify([
        { path: 'README.md', content: '# Learn ML\n\nA machine learning visualizer.\n' },
        { path: 'src/main.tsx', content: 'console.log("Learn ML ready".\n' },
      ]),
    });
    console.log('MARKED_LIVE=' + JSON.stringify(live));
  } catch (e) {
    console.log('ERR=' + e.message);
    process.exit(1);
  }
})();
