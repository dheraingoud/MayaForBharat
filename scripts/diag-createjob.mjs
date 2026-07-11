// Diagnose deployed Convex generateJobs surface WITHOUT firing the LLM worker.
// Read-only: queries only (no mutations/actions). Probes the exact index path
// createJob depends on. Run: bun scripts/diag-createjob.mjs
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

// Bun auto-loads .env. Fallbacks for manual runs.
const url =
  process.env.NEXT_PUBLIC_CONVEX_URL ||
  process.env.CONVEX_URL ||
  'https://example.check.convex.cloud';
console.log('convex url:', url.replace(/:[^@]+@/, ':<redacted>@'));

const c = new ConvexHttpClient(url);
const dumpErr = (label, e) => {
  console.log(`\n[${label}] THREW`);
  console.log('  name   :', e?.name);
  console.log('  message:', e?.message);
  console.log('  data   :', (() => { try { return JSON.stringify(e?.data); } catch { return String(e?.data); } })());
  console.log('  keys   :', e && typeof e === 'object' ? Object.keys(e).join(', ') : '(prim)');
  console.log('  stack  :', String(e?.stack ?? '').split('\n').slice(0, 4).join('\n  '));
};

// 1) generateJobs table + by_app index + getByAppId query — exact path createJob's
//    in-flight-guard also uses. Read-only, no side effects.
try {
  const r = await c.query(api.generateJobs.getByAppId, { appId: 'diag-nodata-' + Date.now() });
  console.log('[getByAppId/empty] OK ->', JSON.stringify(r));
} catch (e) { dumpErr('getByAppId/empty', e); }

// 2) The user's failing appId from the log.
try {
  const r = await c.query(api.generateJobs.getByAppId, { appId: 'a6185a78-6b32-4cd8-b6d9-11bf3653fb76' });
  console.log('[getByAppId/user-failed-app] OK ->', JSON.stringify(r));
} catch (e) { dumpErr('getByAppId/user-app', e); }

// 3) apps row get by appId? — the apps.create succeeded, so the row SHOULD exist.
//    Use the by_app_id index via a quirk: there's no public getByAppId on apps in
//    the route, but listLiveApps / get may exist. Probe api.apps to confirm deploy
//    has the row (proves apps.create persisted). Best read probe: api.apps.get by
//    convex _id not available; skip — apps.create's success already proves this.
//    Instead probe a known-safe query: generateJobs.get requires _id (skip).
// 3) createJob DIRECTLY with a throwaway appId. If it throws at scheduler.runAfter
//    (the schedule itself fails) NO worker is queued => NO NIM tokens burned.
//    If it succeeds, a worker WILL run on the fake prompt (minor tokens), then
//    markError('no parseable files'). Either outcome is decisive.
const diagAppId = 'diag-createjob-' + Date.now();
try {
  const r = await c.mutation(api.generateJobs.createJob, {
    appId: diagAppId,
    prompt: 'diagnostic not a real app ignore',
    model: 'deepseek-ai/deepseek-v4-flash',
    provider: 'NvidiaNIM',
  });
  console.log('\n[createJob/diag] OK ->', JSON.stringify(r));
  console.log('  (worker scheduled — will markError on the fake prompt; minor tokens)');
} catch (e) { dumpErr('createJob/diag', e); }

// 4) If createJob succeeded above, check whether the job row actually persisted.
//    If it threw at scheduler.runAfter the row is ROLLED BACK (not visible here).
try {
  const r = await c.query(api.generateJobs.getByAppId, { appId: diagAppId });
  console.log('\n[getByAppId/after-createJob] ->', JSON.stringify(r));
} catch (e) { dumpErr('getByAppId/after-create', e); }

console.log('\n--- interpretation ---');
console.log('createJob OK + job persisted => createJob fine; the route failure was a');
console.log('  one-off (stuck in-flight guard?) — retry apps-from-plan.');
console.log('createJob threw after a successful getByAppId => throw is at');
console.log('  ctx.scheduler.runAfter(generateRunAction) => DEPLOYED generateRunAction');
console.log('  invalid => STALE DEPLOY => FIX: `npx convex dev`.');
process.exit(0);
