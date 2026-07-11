# Implementation Plan — Detached Generation on Convex Free Tier

> Companion to `docs/superpowers/specs/2026-06-25-detached-generation-design.md`. Read both.
> Every task here is dispatched as a fresh subagent with the full task text + this plan.

## Conventions for implementers

- **No parent session context.** Each implementer subagent is invoked with `Agent` and gets the full task text below + the design doc's relevant sections pasted into the prompt. Do not expect to read this plan from disk; everything needed is in the task description.
- **Type-safety.** Convex handlers are TS. Strict types — `v.union(...)` literals, no `any` leaks. The two free `any`-holes are: pre-existing `// @ts-nocheck` files (`app/api/workbench/chat/route.ts`, `app/api/plan/route.ts`) and `convex/*Handler.ts` `ctx: any` (matches existing precedent).
- **Tests.** New tests for new modules. Do not weaken existing 56-test pass.
- **Files to leave alone.** `lib/workbench/llm/stream-text.ts`, `lib/workbench/runtime/message-parser.ts`, `lib/workbench/runtime/action-runner.ts`, all `_generated/*`, all handlers in `convex/*Handler.ts` except where explicitly listed.

## Convex env vars that the worker needs (audit list)

The worker reads these from `process.env` (Convex surfaces env via `ctx` *or* `process.env` — verify; the existing `evolutionRunHandler.ts:5 SITE_URL` uses `process.env` only at handler-import-time, that's fine in Convex actions):

- `NIM_BASE_URL` (already used by the browser via cookies — confirm exact name with `.env.example`)
- `NIM_API_KEY_NVIDIA_NIM` (or whatever NIM router expects — same caveat)
- `MAYA_MINI`, `MAYA_BALANCED`, `MAYA_MAX`
- `MAYA_DEMO_MODE`

Add via `npx convex env set NAME VALUE` if any are missing. Mention in commit message if you add.

---

## Task 1 — Schema + crons + regenerate _generated

**Files touched** (NEW lines only — don't reorder exports):
- `convex/schema.ts` — append `generateJobs` table before closing `})`
- `convex/crons.ts` — one new `crons.cron(...)` line

**Exact `generateJobs` block** to add inside `defineSchema({ ... })`:

```ts
generateJobs: defineTable({
  appId: v.string(),
  traderId: v.string(),
  status: v.union(
    v.literal("pending"),
    v.literal("building"),
    v.literal("live"),
    v.literal("error"),
    v.literal("cancelled"),
  ),
  prompt: v.string(),
  model: v.string(),
  provider: v.string(),
  partialText: v.optional(v.string()),
  progressNote: v.optional(v.string()),
  filesJson: v.optional(v.string()),
  error: v.optional(v.string()),
  createdAt: v.number(),
  finishedAt: v.optional(v.number()),
}).index("by_app", ["appId"]).index("by_status", ["status"]),
```

**Exact cron line** to add inside the `else` (production) branch of `crons.ts`:

```ts
crons.cron("maya-genjobs-sweep", "*/1 * * * *", internal.generateJobs.sweepStale)
```

(If `demo mode` is true, also add a demo entry — `crons.cron("maya-genjobs-sweep-demo", "*/1 * * * *", internal.generateJobs.sweepStale)`.)

**Steps**:
1. Edit `convex/schema.ts`: add the `generateJobs` block above.
2. Edit `convex/crons.ts`: add the cron line(s).
3. Run `npx convex dev --once` to regenerate `convex/_generated/*`. (If `npx convex dev` is unavailable, run `npx convex codegen`.)
4. Verify: `grep -n 'generateJobs' convex/_generated/dataModel.d.ts` shows the new table. `grep -n 'sweepStale' convex/_generated/api.d.ts` shows the new entry (function gets created in Task 2 — `npx convex dev --once` will warn "missing function reference" until then; that's OK).
5. `npx tsc --noEmit` on the project: confirm zero NEW errors. Pre-existing errors in unrelated files are not yours to fix.

**Done means**: schema lives, crons registered, generated types refreshed, no new TS errors.

---

## Task 2 — Internal skew + worker handlers (no LLM yet, hardcoded files)

**Files created**:
- `convex/generateJobs.ts` — public + internal query/mutation/action surface
- `convex/generateJobsHandler.ts` — heavy logic
- `convex/__tests__/generateJobs.spec.ts` — minimal unit-ish test (vitest)

**Public API (in `convex/generateJobs.ts`)**:

```ts
import { mutation, query, internalMutation, action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { generateJobsHandler } from "./generateJobsHandler";

export const createJob = mutation({ ... });
export const getByAppId = query({ ... });
export const get = query({ ... });
export const cancelJob = mutation({ ... });

export const saveProgress = internalMutation({ ... });
export const markLive = internalMutation({ ... });
export const markError = internalMutation({ ... });
export const _get = internalQuery({ ... });      // internal helper
export const _setBuilding = internalMutation({ ... });
export const _listBuildingOlderThan = internalQuery({ ... });

export const generateRun = internalAction({ args: { jobId: v.id("generateJobs") }, handler: generateJobsHandler });
export const sweepStale = internalAction({ args: {}, handler: sweepStaleHandler });

import { sweepStaleHandler } from "./generateJobsHandler";
```

**`createJob` body (precise)**:
1. Validate args (`prompt` non-empty, `appId` non-empty).
2. Query latest job for `appId`: if `status in {'building', 'pending'}`, throw `new Error("job in progress")`.
3. Insert row with `status='pending'`, `createdAt=Date.now()`.
4. `await ctx.scheduler.runAfter(0, internal.generateJobs.generateRun, { jobId })`.
5. Return `{ jobId }`.

**`getByAppId` body**:
1. Query by index `by_app` filtered on `appId`, ordered desc by `createdAt`.
2. Take the row whose status wins this priority: `live > building > pending > error > cancelled`. Use `.collect()` then `.find` (max ~20 jobs per appId in practice — fine).
3. In returned doc, decode `filesJson`: `files?: Array<{path:string, content:string}>` returned alongside. If `filesJson` absent or invalid JSON, return `files: null`.

**`get` body**: one-liner using `.get(args.jobId)`.

**`cancelJob` body**:
1. If `status !== 'building' && !== 'pending'`, no-op return.
2. Patch `{status: 'cancelled', finishedAt: Date.now(), error: 'cancelled by user'}`.
3. Return `{ok: true}`.

**`saveProgress` body**:
1. Patch row: `{ partialText, progressNote, createdAt: row.createdAt /* unchanged */ }`.
2. Return `{ok:true}`.

**`markLive` body**:
1. Patch row: `{ status:'live', filesJson: JSON.stringify(files), finishedAt: Date.now(), partialText: undefined, progressNote: `${files.length} files generated` }`.
2. Find matching `apps` row by `appId`. If exists, patch `{ fileTree: JSON.stringify(files), status: 'building' }`. If absent, no-op (apps row may be created later by `/api/plan` route or interactive client).
3. Return `{ok:true}`.

**`markError` body**:
1. Patch row: `{ status:'error', error, finishedAt: Date.now() }`.
2. Return `{ok:true}`.

**`_get` body**: `ctx.db.get(args.jobId)`.

**`_setBuilding` body**: patch `{status:'building'}` on the row, no-op if not `pending`.

**`_listBuildingOlderThan` body**: `ctx.db.query('generateJobs').withIndex('by_status', q => q.eq('status','building')).collect().filter(j => j.createdAt < olderThan)`.

**Worker (`generateJobsHandler.ts`)** — Task 2 implements only the skeleton. Full LLM logic in Task 4. For Task 2:

```ts
export async function generateJobsHandler(ctx, { jobId }) {
  const job = await ctx.runQuery(internal.generateJobs._get, { jobId });
  if (!job) return;
  if (job.status === 'cancelled') return;
  await ctx.runMutation(internal.generateJobs._setBuilding, { jobId });

  try {
    // Task 2 placeholder: simulate work
    await ctx.runMutation(internal.generateJobs.saveProgress, {
      jobId, partialText: '', progressNote: 'starting (skeleton) — Task 4 will fill',
    });

    const files = [
      { path: 'README.md', content: '# MAYA-generated app\n\nSkeleton build, Task 4 fills this with LLM output.' },
      { path: 'package.json', content: JSON.stringify({ name: 'maya-app', version: '0.0.1', private: true }, null, 2) },
    ];
    await ctx.runMutation(internal.generateJobs.markLive, { jobId, files });
  } catch (e) {
    await ctx.runMutation(internal.generateJobs.markError, { jobId, error: String(e?.message ?? e) });
  }
}
```

**Sweeper handler (still in `generateJobsHandler.ts`)**:

```ts
export async function sweepStaleHandler(ctx): Promise<{swept: number}> {
  const TWO_MIN = 2 * 60_000;
  const cutoff = Date.now() - TWO_MIN;
  const stale = await ctx.runQuery(internal.generateJobs._listBuildingOlderThan, { olderThan: cutoff });
  let swept = 0;
  for (const j of stale) {
    await ctx.runMutation(internal.generateJobs.markError, { jobId: j._id, error: 'stale (no progress for 2 min)' });
    swept++;
  }
  return { swept };
}
```

**Test file (Task 2)** — `convex/__tests__/generateJobs.spec.ts`:

This test must NOT require a live Convex deployment. Use the existing test infra in the codebase. Three smoke checks, all static:

```ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('generateJobs skeleton', () => {
  it('exports the required surface', async () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../generateJobs.ts'), 'utf-8');
    for (const fn of [
      'export const createJob', 'export const getByAppId', 'export const get',
      'export const cancelJob', 'export const saveProgress', 'export const markLive',
      'export const markError', 'export const generateRun', 'export const sweepStale',
    ]) expect(src).toContain(fn);
  });

  it('handler skeleton touches _setBuilding, saveProgress, and markLive', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../generateJobsHandler.ts'), 'utf-8');
    expect(src).toContain('_setBuilding');
    expect(src).toContain('saveProgress');
    expect(src).toContain('markLive');
  });

  it('sweeper uses a 2 min cutoff', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../generateJobsHandler.ts'), 'utf-8');
    expect(src).toMatch(/TWO_MIN\s*=\s*2\s*\*\s*60[_\s]*000|2\s*\*\s*60\s*\*\s*1000/);
  });
});
```

**Done means**: code compiles, `npx convex codegen` succeeds, `npx vitest run convex/__tests__/generateJobs.spec.ts` passes (3 tests).

---

## Task 3 — Client hooks

**Files created**:
- `app-maya/lib/workbench/hooks/useGenerateJob.ts`
- `app-maya/lib/workbench/hooks/useCreateGenerateJob.ts`

**`useGenerateJob.ts`**:

```ts
'use client';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

export type GenerateJobStatus = 'pending' | 'building' | 'live' | 'error' | 'cancelled';

export interface UseGenerateJobResult {
  status: GenerateJobStatus;
  files: Array<{ path: string; content: string }> | null;
  error: string | null;
  progressNote: string | null;
  job: any | null;
  isReady: boolean;
}

export function useGenerateJob(appId: string | null | undefined): UseGenerateJobResult {
  const job = useQuery(
    api.generateJobs.getByAppId,
    appId ? { appId } : 'skip',
  );
  if (job === undefined) {
    return { status: 'pending', files: null, error: null, progressNote: null, job: null, isReady: false };
  }
  if (job === null) {
    return { status: 'pending', files: null, error: null, progressNote: null, job: null, isReady: true };
  }
  let files: Array<{path:string, content:string}> | null = null;
  if (job.filesJson) {
    try { files = JSON.parse(job.filesJson); } catch { files = null; }
  }
  return {
    status: job.status as GenerateJobStatus,
    files,
    error: job.error ?? null,
    progressNote: job.progressNote ?? null,
    job,
    isReady: true,
  };
}
```

**`useCreateGenerateJob.ts`**:

```ts
'use client';
import { useMutation } from 'convex/react';
import { useCallback } from 'react';
import { api } from '@/convex/_generated/api';

export function useCreateGenerateJob() {
  const createJob = useMutation(api.generateJobs.createJob);
  return useCallback(async (args: {appId: string; prompt: string; model: string; provider: string}) => {
    if (!args.appId || !args.prompt) throw new Error('appId and prompt are required');
    return await createJob(args);
  }, [createJob]);
}
```

**Test file** — `app-maya/lib/workbench/__tests__/useGenerateJob.spec.ts`:

Static — verifies the hooks exist, are 'use client', and call Convex react `useQuery` / `useMutation` correctly.

**Done means**: TypeScript compiles, the two files exist with the correct exports, parity-test passes.

---

## (Continuation in next file: Task 4-10)
