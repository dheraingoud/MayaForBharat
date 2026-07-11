// E2E durability test: mint an `apps` shell WITHOUT a generateJobs row, so the
// client BuilderPageWithJob Effect#1 wins the in-flight guard and fires its OWN
// createJob with the URL-tier model (deepseek-v4-flash). The /api/apps-from-plan
// route hardcodes model=bareModel=MAYA_MINI=stepfun, which would win the guard
// and stall; this script skips it, calling apps.create directly. Run: bun scripts/e2e-mint-shell.mjs
import { ConvexHttpClient } from 'convex/browser';
import { randomUUID } from 'node:crypto';
import { api } from '../convex/_generated/api.js';

const url =
  process.env.NEXT_PUBLIC_CONVEX_URL ||
  process.env.CONVEX_URL ||
  'https://fine-capybara-156.convex.cloud';
const c = new ConvexHttpClient(url);

const appId = randomUUID();
// Hand-crafted plan matching PLAN_SYSTEM_PROMPT schema (BuilderPage reads
// spec.name/.features/.techStack for synthetic priming). The detached build's
// actual prompt is the URL ?prompt= — not this plan.
// MINIMAL-complexity plan (1 page, few files) so deepseek finishes + emits the
// closing boltArtifact before the NIM ~485s stream stall that killed larger
// builds (token/volume-based stall, not complexity-based). Goal: reach `live`.
const plan = {
  name: 'Cafe Tip Calculator',
  description: 'Single-page cafe tip calculator: bill amount, tip percent, split between N people, live total + per-person.',
  features: [
    'Bill amount input, tip percent selector (10/15/18/20%), split between N people, live total + per-person display',
  ],
  techStack: ['React', 'TypeScript', 'Tailwind CSS'],
  pages: ['Calculator'],
  dataModel: [],
  estimatedComplexity: 'minimal',
};

try {
  await c.mutation(api.apps.create, {
    traderId: 'anonymous',
    appId,
    name: plan.name,
    nameHindi: plan.name,
    descriptionEn: plan.description,
    category: 'other',
    status: 'building',
    specJson: JSON.stringify(plan),
    messages: [],
  });
  console.log(appId);
} catch (e) {
  console.error('[e2e-mint-shell] apps.create failed:', e?.message ?? e);
  process.exit(1);
}
process.exit(0);
