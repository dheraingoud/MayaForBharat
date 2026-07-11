
---

## Task 4 — Worker LLM logic (real NIM call)

**File modified**: `convex/generateJobsHandler.ts` (replace the Task 2 placeholder body of `generateJobsHandler` with the streaming version below).

**Verified AI SDK v6 signatures (read from `node_modules/ai/dist/index.d.ts` lines 2546-2570, 2648-2675, 2847-2860)**:
- `streamText({ onChunk, onError, onFinish, ... })` — callbacks nest in the **same** call. Do **NOT** use `.consumeStream()` here.
- `onChunk` event: `{ chunk: TextStreamPart }`. For text updates: `chunk.type === 'text-delta'` and the delta text is `chunk.text` (NOT `textDelta`). For reasoning chunks: `chunk.type === 'reasoning-delta'`, also `chunk.text`.
- `onError` event: `{ error: unknown }`.
- `onFinish` event: `OnFinishEvent<TOOLS>` — `event.text`, `event.usage`, etc.

**Imports**:
```ts
import { streamText as _streamText } from 'ai';
import { ConvertUint8ArrayToStringTransformStream } from 'ai'; // only if needed
import { convertToModelMessages } from 'ai'; // imported only if you bypass stream-text.ts wrapper
```

**Reuse first**: import the existing `streamText` wrapper to keep parity with the chat route:
```ts
import { streamText } from '@/lib/workbench/llm/stream-text';
```

The wrapper returns the raw AI SDK `streamText` result (`StreamTextResult`). It accepts the props documented in `lib/workbench/llm/stream-text.ts:55 streamText(props)`. Pass `providerSettings` and `apiKeys` read from `process.env`.

**Env-var readers (add to top of `generateJobsHandler.ts`)**:

```ts
function readNimEnv(): { apiKeys: Record<string,string>; providerSettings: Record<string, any> } {
  const apiKeys: Record<string,string> = {};
  const providerSettings: Record<string, any> = {};

  // NIM router: read API key from env or config
  const nimKey = process.env.NIM_API_KEY || process.env.NVIDIA_NIM_API_KEY;
  if (nimKey) apiKeys['NvidiaNIM'] = nimKey;

  // Per-provider fallback
  const providers = ['NvidiaNIM', 'OpenAI', 'Anthropic', 'Google'];
  for (const p of providers) {
    const v = process.env[`API_KEY_${p.toUpperCase()}`];
    if (v) apiKeys[p] = v;
  }
  return { apiKeys, providerSettings };
}
```

(Verify exact names against `.env.example` and existing handlers before final commit.)

**Streaming worker body**:

```ts
export async function generateJobsHandler(ctx, { jobId }) {
  const job = await ctx.runQuery(internal.generateJobs._get, { jobId });
  if (!job) return;
  if (job.status === 'cancelled') return;
  await ctx.runMutation(internal.generateJobs._setBuilding, { jobId });

  const { apiKeys, providerSettings } = readNimEnv();

  let partialText = '';
  let lastSaveAt = 0;
  let lastCancelCheckAt = 0;
  let parsedFiles: Array<{path: string; content: string}> = [];
  let didMarkLive = false;

  try {
    const result = await streamText({
      messages: [{ role: 'user', parts: [{ type: 'text', text: job.prompt }] } as any],
      env: process.env as Record<string, string>,
      apiKeys,
      providerSettings,
      promptId: 'default',
      chatMode: 'build',
      designScheme: undefined,
      files: {},
      options: {
        onChunk: async ({ chunk }: any) => {
          if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
            partialText += chunk.text;
          } else if (chunk?.type === 'reasoning-delta' && typeof chunk.text === 'string') {
            // skip reasoning noise for now — partialText only holds the visible assistant text
          }
          const now = Date.now();
          const lenDelta = partialText.length - lastSaveAt;
          if (lenDelta > 4000 || (now - lastSaveAt) > 3000) {
            parsedFiles = extractBoltFiles(partialText);
            const status = await ctx.runQuery(internal.generateJobs._get, { jobId });
            if (status?.status === 'cancelled') {
              throw Object.assign(new Error('cancelled'), { __cancelled: true });
            }
            await ctx.runMutation(internal.generateJobs.saveProgress, {
              jobId,
              partialText,
              progressNote: `Streaming — ${parsedFiles.length} files detected`,
            });
            lastSaveAt = partialText.length;
          }
          if (now - lastCancelCheckAt > 7000) {
            lastCancelCheckAt = now;
            const status = await ctx.runQuery(internal.generateJobs._get, { jobId });
            if (status?.status === 'cancelled') {
              throw Object.assign(new Error('cancelled'), { __cancelled: true });
            }
          }
        },
        onError: async ({ error }: any) => {
          // Will be re-thrown by streamText; we mark error in catch arm.
        },
        onFinish: async (event: any) => {
          // streamText hands us the fully assembled text in event.text. Use that as final source.
          const finalText: string = event?.text ?? partialText;
          parsedFiles = extractBoltFiles(finalText);
          await ctx.runMutation(internal.generateJobs.markLive, {
            jobId,
            files: parsedFiles.length > 0 ? parsedFiles : [],
          });
          didMarkLive = true;
        },
      } as any,
    });

    // Belt-and-braces: if onFinish didn't run (rare), await the stream-to-completion by
    // pulling text on the result.
    if (!didMarkLive) {
      const finalText = (result as any).text ? await (result as any).text : '';
      const files = extractBoltFiles(finalText);
      await ctx.runMutation(internal.generateJobs.markLive, {
        jobId, files: files.length > 0 ? files : [],
      });
      didMarkLive = true;
    }
  } catch (e: any) {
    if (!e?.__cancelled) {
      await ctx.runMutation(internal.generateJobs.markError, {
        jobId,
        error: typeof e?.message === 'string' ? e.message : String(e),
      });
    }
  }
}

/**
 * Extract <boltAction type="file" filePath="...">content</boltAction> blocks
 * from a partially- or fully-emitted assistant message.
 * Does NOT use the StreamingMessageParser (which expects incremental streaming and
 * emits per-action callbacks). We use a regex pull here because the worker
 * already has the full partial text available.
 */
function extractBoltFiles(text: string): Array<{ path: string; content: string }> {
  const files: Array<{path:string, content:string}> = [];
  // Match boltAction with type="file" attributes. Content may span newlines.
  const re = /<boltAction\s+([^>]*?)type="file"([^>]*?)>([\s\S]*?)<\/boltAction>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const attrBlob = (m[1] ?? '') + ' ' + (m[2] ?? '');
    const filePathMatch = attrBlob.match(/filePath="([^"]+)"|filePath='([^']+)'/);
    if (!filePathMatch) continue;
    const filePath = filePathMatch[1] ?? filePathMatch[2] ?? '';
    const content = (m[3] ?? '').trim();
    files.push({ path: filePath, content });
  }
  return files;
}
```

**Important**: `streamText` wrapper at `lib/workbench/llm/stream-text.ts:55` accepts `options` whose type is `StreamingOptions extends Omit<Parameters<typeof _streamText>[0], 'model'>` — so `onChunk`/`onError`/`onFinish` are valid keys there. Cast `as any` only if TS complains due to optionality.

**Test**:
- Add to `convex/__tests__/generateJobs.spec.ts`: static check that `generateJobsHandler.ts` contains the function `extractBoltFiles`, contains `'text-delta'`, contains `markLive`, contains `markError`, and that `readNimEnv` is defined.
- Manual smoke: run a Convex local dev, dispatch the action via convex CLI with a seeded row, watch the row go `pending → building → live`, and read `filesJson` to verify a real model output.

**Done means**: TypeScript compiles, the new code is present, the static test passes, and the manual smoke confirmed with a model like `stepfun-ai/step-3.7-flash` or `minimaxai/minimax-m3`.

---

## Task 5 — BuilderPage integration

**File modified**: `lib/workbench/components/workbench/BuilderPage.tsx`
**File created**: `lib/workbench/components/workbench/GenerateJobCard.tsx`

**`GenerateJobCard.tsx`** — three rendered variants:

```tsx
'use client';
import { useState, useEffect } from 'react';
import { Loader2, AlertTriangle, X } from 'lucide-react';
import type { UseGenerateJobResult } from '@/lib/workbench/hooks/useGenerateJob';

export function GenerateJobCard({
  appId,
  job,
  onCancel,
  onRetry,
  onBuild,
}: {
  appId: string;
  job: UseGenerateJobResult;
  onCancel: () => void;
  onRetry: () => void;
  onBuild: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (job.status === 'building' || job.status === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-[#111110] text-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#E8601A]" />
        <h2 className="text-lg font-medium">Building your app…</h2>
        <p className="text-xs text-white/40">{job.progressNote ?? 'starting…'} · {elapsed}s</p>
        <button onClick={onCancel} className="text-xs text-white/50 hover:text-white underline">
          Cancel
       </button>
     </div>
    );
  }
  if (job.status === 'live') {
    return null; // parent will mount files
  }
  if (job.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-[#111110] text-white">
        <AlertTriangle className="w-8 h-8 text-red-500" />
        <h2 className="text-lg font-medium">Build failed</h2>
        <p className="text-xs text-white/40 max-w-md text-center">{job.error</p>
        <button onClick={onRetry} className="text-sm bg-[#E8601A] px-4 py-2 rounded">Retry</button>
     </div>
    );
  }
  if (job.status === 'cancelled') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-[#111110] text-white">
        <X className="w-8 h-8 text-white/40" />
        <h2 className="text-lg font-medium">Build cancelled</h2>
        <button onClick={onBuild} className="text-sm bg-[#E8601A] px-4 py-2 rounded">Build now</button>
     </div>
    );
  }
  return null;
}
```

**BuilderPage integration**:
- Import the new components.
- Read `appId` from a new prop or from `useParams()`. (The route at `app/workbench/[id]/page.tsx` already passes `appId` into the dynamic-suspense BuilderPage wrapper. Verify the prop forwarding works through the `dynamic(() => import(...), { ssr: false })` boundary — if needed, also accept `useParams().appId` as fallback.)
- Read `?prompt&model&provider&tierIdx` from `useSearchParams()`.
- Branch logic in render: if `appId` is present, render the new flow. Otherwise fall through to today's chat path unchanged.
- When `useGenerateJob(appId).status === 'live'`:
  - On first live transition, take `job.files` and call `workbenchStore.files.set(files)` then mount WebContainer via existing ActionRunner boot.

**Important**: do NOT touch the chat streaming path. Only the new branch handles `appId`. Routes WITHOUT `:appId` (i.e., `/workbench?prompt=...`) continue to use today's working logic. Test BOTH paths to prove no regression.

**Files mounted into WebContainer**: in bolt.diy's pattern, after `workbenchStore.files.set(map)`, calling `webcontainer.mount(toBoltMount(files))` writes them into WebContainer. Find the helper used in `app/workbench/[id]/page.tsx` and other entry points (search for `webcontainer.mount` and `toBoltMount`). Reuse.

**Test**: extend the e2e spec to assert the new `useGenerateJob` and `useCreateGenerateJob` are referenced by BuilderPage.

**Done means**: BuilderPage compiles, both old + new paths still work, the v0-style building card renders, and on `live` WebContainer mounts files.

---

## Task 6 — Plan redirect → `/workbench/[appId]`

**Files modified**:
- `app/api/plan/route.ts` — add `convex.mutation(api.apps.create, ...)` call, return `{plan, appId, model, provider}` as JSON.
- `app/page.tsx` — replace SSE flow with JSON fetch.

**Note**: the existing `app/api/plan/route.ts` returns SSE. We must preserve SSE for any consumer that reads from `POST /api/plan` expecting a stream. The cleanest approach: **add a sibling route** `POST /api/apps-from-plan` that returns JSON `{plan, appId}`. Existing `/api/plan` stays as-is. Then `app/page.tsx` (3 sites at lines 312, 372, 386) calls the new sibling.

**`/api/apps-from-plan`** (NEW):

```ts
import { NextRequest, NextResponse } from 'next/server';
import { streamText as _streamText } from 'ai';
import { createNimModel } from '@/lib/workbench/llm/nim-router';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { prompt } = await req.json();
  if (!prompt) return NextResponse.json({ error: 'missing prompt' }, { status: 400 });

  const modelName = (process.env.MAYA_MINI || 'stepfun-ai/step-3.7-flash').replace(/^nvidia-nim\//i, '');
  const model = createNimModel(modelName);

  // Use ConvexHttpClient to create the apps row.
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

  const result = _streamText({
    model,
    messages: [
      { role: 'system', content: PLAN_SYSTEM_PROMPT /* same as route.ts */ },
      { role: 'user', content: prompt },
    ],
    maxTokens: 2048,
    temperature: 0.7,
  });
  const text = await result.text;
  const plan = parsePlan(text); // JSON.parse(text), tolerate trailing junk

  const appId = randomUUID();
  await convex.mutation(api.apps.create, {
    traderId: 'anonymous',
    appId,
    name: plan.name ?? 'Untitled app',
    descriptionEn: plan.description ?? '',
    category: 'other',
    status: 'building',
    specJson: JSON.stringify(plan),
    messages: [],
  });

  return NextResponse.json({ plan, appId, model: modelName, provider: 'NvidiaNIM' });
}
```

**`app/page.tsx` redirect sites** (lines 312, 372, 386) — replace with:

```ts
const res = await fetch('/api/apps-from-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
const { appId, plan, model, provider } = await res.json();
const params = new URLSearchParams({ prompt, model, provider, tierIdx: String(selectedTier) });
window.location.href = `/workbench/${appId}?${params.toString()}`;
```

**Test**: extend existing `/api/__tests__/*` to cover the new endpoint shape (mock ConvexHttpClient).

**Done means**: redirect creates the apps row, returns the new appId, browser lands on `/workbench/[appId]?...`.

---

## Task 7 — Cancel + retry + error UI polish

**Files modified**:
- `lib/workbench/components/workbench/GenerateJobCard.tsx` (from Task 5)
- Possibly `lib/workbench/components/workbench/BuilderPage.tsx` to wire toasts.

Add `useCancelGenerateJob` hook (similar to `useCreateGenerateJob`):

```ts
// lib/workbench/hooks/useCancelGenerateJob.ts
'use client';
import { useMutation } from 'convex/react';
import { useCallback } from 'react';
import { api } from '@/convex/_generated/api';
export function useCancelGenerateJob() {
  const cancelJob = useMutation(api.generateJobs.cancelJob);
  return useCallback(async (jobId: string | null) => {
    if (!jobId) return;
    return await cancelJob({ jobId });
  }, [cancelJob]);
}
```

Add toasts on cancel/retry/build success & error. Add keyboard `Esc` cancel on building card.

**Test**: static check that the new hook exists.

---

## Task 8 — Stale-sweeper + cron tests

This is largely covered by Task 2's existing test. Add a vitest unit test that asserts the cut-off math:

```ts
// in convex/__tests__/generateJobs.spec.ts
it('sweeper cutoff is exactly 2 minutes', () => {
  const src = fs.readFileSync('.../generateJobsHandler.ts', 'utf-8');
  expect(src).toMatch(/120_?000|2\s*\*\s*60\s*\*\s*1000|TWO_MIN.*2.*60.*1000/s);
});
```

Manual cron check: in a Convex dev dashboard, manually run `internal.generateJobs.sweepStale` against a seeded row whose `createdAt` is 3 min in the past; assert status flipped.

---

## Task 9 — E2E test (close tab mid-build)

**File created**: `lib/workbench/__tests__/e2e-close-and-reopen.spec.ts`

Static + mock-only test using the existing vitest pattern in the codebase. The test asserts:
1. `api.generateJobs.createJob` mutation exists.
2. `api.generateJobs.getByAppId` query exists.
3. `api.generateJobs.cancelJob` mutation exists.
4. `Workbench [id]/page.tsx` calls `<BuilderPage appId={appId} />`.
5. `app/page.tsx` contains a redirect to `/workbench/${appId}` (regex).
6. `convex/crons.ts` has a registration for `sweepStale`.
7. Schema includes `generateJobs`.

Plus a happy-path mock: simulate `useGenerateJob({appId:'foo'})` returning a stub `live` row + verify the file decode works.

---

## Task 10 — Final runbook doc

**File created**: `app-maya/docs/detached-generation.md`

Operator-facing. Sections:
- How the worker spawns (scheduler.runAfter → internalAction).
- How cron sweeper works + how to force-sweep manually.
- How to monitor live: `npx convex dashboard` or the `_generated/admin`.
- Free-tier safety math (re-stated: 0.02 GB-hr/build × 1000 builds ≈ 20 GB-hr ceiling).
- How to scale (caching partialText; adding e2b in a future phase).
- How to manually trigger `generateRun({jobId})` for a stuck row.

---

## Order of execution (the canonical sequence)

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

Task 4 depends on Task 2 (handler skeleton exists).
Task 5 depends on Tasks 3 and 4 (hooks + worker both live).
Task 6 depends on Tasks 2 and 5 (apps row exists and worker can find it).
Task 9 depends on all of the above.

The reviewer chain per task: spec-compliance reviewer, then code-quality reviewer. No repair-without-re-review.
