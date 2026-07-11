// Poll a generateJobs row by appId. Prints status, model, files count, error.
// Run: bun scripts/e2e-poll-job.mjs <appId>
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const url =
  process.env.NEXT_PUBLIC_CONVEX_URL ||
  process.env.CONVEX_URL ||
  'https://fine-capybara-156.convex.cloud';
const appId = process.argv[2];
if (!appId) {
  console.error('usage: bun scripts/e2e-poll-job.mjs <appId>');
  process.exit(1);
}
const c = new ConvexHttpClient(url);
const row = await c.query(api.generateJobs.getByAppId, { appId });
if (!row) {
  console.log(JSON.stringify({ appId, row: null }));
  process.exit(0);
}
let filesCount = 0;
if (typeof row.filesJson === 'string' && row.filesJson.length) {
  try {
    const p = JSON.parse(row.filesJson);
    if (Array.isArray(p)) filesCount = p.length;
  } catch {}
}
console.log(JSON.stringify({
  appId,
  _id: row._id,
  status: row.status,
  model: row.model,
  provider: row.provider,
  promptHead: String(row.prompt ?? '').slice(0, 60),
  filesCount,
  error: row.error ?? null,
  progressNote: row.progressNote ?? null,
  transientJob: row.transientJob ?? null,
}));
process.exit(0);
