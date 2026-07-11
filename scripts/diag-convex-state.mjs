// Diagnose whether a detached generateJobs row + apps row exist in Convex for an appId.
// Run: bun scripts/diag-convex-state.mjs <appId>
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const url =
  process.env.NEXT_PUBLIC_CONVEX_URL ||
  process.env.CONVEX_URL ||
  'https://fine-capybara-156.convex.cloud';
const c = new ConvexHttpClient(url);
const APP_ID = process.argv[2] || 'ab285823-0fd4-45d7-b706-7de8183a4114';

async function main() {
  console.log('Convex URL:', url);
  console.log('appId:', APP_ID);

  // generateJobs for appId
  try {
    const job = await c.query(api.generateJobs.getByAppId, { appId: APP_ID });
    console.log('\n=== generateJobs.getByAppId ===');
    if (!job) console.log('NULL — no generateJobs row for appId');
    else console.log(JSON.stringify({
      _id: job._id, status: job.status, model: job.model, provider: job.provider,
      promptHead: (job.prompt || '').slice(0, 80),
      filesCount: job.files ? job.files.length : 0,
      error: job.error, progressNote: job.progressNote,
      createdAt: new Date(job.createdAt).toISOString(),
      finishedAt: job.finishedAt ? new Date(job.finishedAt).toISOString() : null,
      lastProgressAt: job.lastProgressAt ? new Date(job.lastProgressAt).toISOString() : null,
      transientJob: job.transientJob ? { _id: job.transientJob._id, status: job.transientJob.status, progressNote: job.transientJob.progressNote, createdAt: new Date(job.transientJob.createdAt).toISOString() } : null,
    }, null, 2));
  } catch (e) {
    console.log('genjob query ERR', e?.message ?? e);
  }

  // apps row for appId
  try {
    const appRow = await c.query(api.apps.getByAppId, { appId: APP_ID });
    console.log('\n=== apps.getByAppId ===');
    if (!appRow) console.log('NULL — no apps row for appId');
    else console.log(JSON.stringify({
      _id: appRow._id, appId: appRow.appId, name: appRow.name, status: appRow.status,
      fileTreeLength: appRow.fileTree ? appRow.fileTree.length : 0,
      vercelUrl: appRow.vercelUrl, createdAt: new Date(appRow.createdAt).toISOString(),
      hasSpecJson: !!appRow.specJson,
    }, null, 2));
  } catch (e) {
    console.log('apps query ERR', e?.message ?? e);
  }
}

main().finally(() => process.exit(0));
