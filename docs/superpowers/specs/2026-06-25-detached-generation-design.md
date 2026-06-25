# Detached Generation on Convex Free Tier

Date: 2026-06-25
Status: Approved (plan-mode exit @ turn)
Owner: Brainstorming → writing-plans → subagent-driven-development
Motive: Browser-close-resilient builds that match v0/Lovable behavior.

---

## 1. Goal & non-goals

**Goal.** Initial app generation runs as a server-side Convex `internalAction` that survives the user closing the browser entirely. Re-opening `/workbench/[appId]` reattaches the open workbench to the in-progress or completed job. No npm/build/test runs on the server — correctness is verified in the existing in-browser WebContainer preview.

**Non-goals (this design).** Per-message ("add a login") detachment, server-side verification (e2b sandboxes), multi-user concurrency beyond "newest job for an appId wins", Git/Vercel deploy, AI SDK v5 compatibility, evolution cycles. Each is left intact.

---

## 2. Architecture (one diagram, end-to-end)

```
                  Plan page (app/page.tsx)
                          │
            POST /api/plan ─────────────────────▶ convex.apps.create
            (returns { plan, appId })             (returns _id, appId set)
                          │
                          ▼
       window.location.href = '/workbench/' + appId + '?prompt=...&model=...'
                          │
                          ▼
       app/workbench/[id]/page.tsx → <BuilderPage appId={appId} />
                          │
                          ▼
       ┌── Client ─────────────────────────────────────────┐
       │ useCreateGenerateJob({appId, prompt, model, prov})│
       │   └─ useMutation(api.generateJobs.createJob)      │
       │ useGenerateJob(appId) → useQuery(...getByAppId)  │
       │ (realtime.subscribe — ConvexProvider, app/providers.tsx:98)
       │                                                    │
       │ Status: 'pending' | 'building'                    │
       │   → render centered <BuildingCard appId job={} /> │
       │ Status: 'live'                                    │
       │   → hydrate ActionRunner with filesJson           │
       │     (existing webcontainer mount path)            │
       │ Status: 'error' | 'cancelled'                     │
       │   → <RetryCard onRetry=createJob />               │
       └────────────────────────────────────────────────────┘
                          ▲
                          │ (any client subscribes; same row)
                          │
       ┌── Convex (detached) ──────────────────────────────┐
       │ internal generateJobs.generateRun (action):       │
       │   1. ctx.runMutation(markBuilding)                │
       │   2. await streamText(...)  ←─ ai SDK v6, server  │
       │      .consumeStream(                              │
       │         onChunk → accumulate partialText;         │
       │            every 3s OR ~4k chars → extract files  │
       │            via StreamingMessageParser;            │
       │            await ctx.runMutation(saveProgress)    │
       │         onError → ctx.runMutation(markError)      │
       │         onFinish → parse fully →                 │
       │            ctx.runMutation(markLive) + write     │
       │            apps.fileTree + apps.status='building' │
       │      )                                            │
       │   3. (terminate)                                  │
       │                                                    │
       │ internal generateJobs.sweepStale (action, cron):  │
       │   every 1 min — building jobs >2min old → error   │
       └────────────────────────────────────────────────────┘
```

---

## 3. Convex contract

### 3.1 New table (`convex/schema.ts` append)

```ts
generateJobs: defineTable({
  appId: v.string(),                                // indexed; matches apps.appId
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
  partialText: v.optional(v.string()),              // accumulated streamed text
  progressNote: v.optional(v.string()),             // "Writing 7 of 12 files"
  filesJson: v.optional(v.string()),                // JSON of Array<{path, content}> when `live`
  error: v.optional(v.string()),
  createdAt: v.number(),
  finishedAt: v.optional(v.number()),
}).index("by_app", ["appId"]).index("by_status", ["status"]),
```

`apps.fileTree` + `apps.status` remain the final verified state. `generateJobs` is draft.

### 3.2 Convex functions (new file `convex/generateJobs.ts`)

| Name | Type | Args | Returns | Internal? |
|---|---|---|---|---|
| `createJob` | mutation | `{appId, prompt, model, provider}` | `{jobId: Id<'generateJobs'>}` | public |
| `getByAppId` | query | `{appId}` | `Doc<'generateJobs'> \| null` (latest, NON-cancelled preferred) | public |
| `get` | query | `{jobId}` | `Doc<'generateJobs'> \| null` | public |
| `cancelJob` | mutation | `{jobId}` | `{ok: true}` (no-op if not building) | public |
| `saveProgress` | mutation | `{jobId, partialText, progressNote}` | `{ok: true}` | internal |
| `markLive` | mutation | `{jobId, files}` | `{ok: true}` | internal |
| `markError` | mutation | `{jobId, error}` | `{ok: true}` | internal |
| `generateRun` | action | `{jobId}` | `{ok: true}` | internal |
| `sweepStale` | action | `{}` | `{swept: number}` | internal |

`createJob` semantics (precise):
1. Read latest row for `appId`. If it is `building` or `pending`, fail with "job in progress".
2. Insert `status='pending'`, `createdAt=Date.now()`.
3. `await ctx.scheduler.runAfter(0, internal.generateJobs.generateRun, {jobId: newId})`.
4. Return `{jobId: newId}`.

`getByAppId` semantics:
1. Query `by_app` for `appId`, order desc by `createdAt`, take 1.
2. Prefer `live`, then `building`/`pending`, then `error`, then `cancelled`.
3. Decode `filesJson` → `files?: Array<{path, content}>` in result.

### 3.3 Worker (`convex/generateJobsHandler.ts`, exported action body reused from `convex/generateJobs.ts`)

Mirror `evolutionRunHandler.ts:15 evolutionRunHandler`. Pseudocode:

```ts
export async function generateJobsHandler(ctx, {jobId}) {
  const job = await ctx.runQuery(internal.generateJobs._get, {jobId});
  if (!job) return;
  if (job.status === 'cancelled') return; // user backed out before start
  await ctx.runMutation(internal.generateJobs._setBuilding, {jobId});

  try {
    const result = await streamText({                    // existing wrapper
      messages: [{role:'user', content: job.prompt}],     // server rewrites to add model/provider
      env: process.env,
      apiKeys: readNimKeysFromEnv(),                     // new helper in this file
      providerSettings: readProviderSettingsFromEnv(),
      promptId: 'default',
      chatMode: 'build',
      designScheme: undefined,
      files: {},
    });

    let partialText = '';
    let lastSave = 0;
    let lastCancelCheck = 0;

    await result.consumeStream({
      onChunk: async ({chunk}) => {
        // AI SDK v6 chunk shape verified in node_modules/ai/dist
        if (chunk.type === 'text-delta') partialText += chunk.textDelta;
        const now = Date.now();
        if (partialText.length - lastSave > 4000 || now - lastSave > 3000) {
          const latest = readJobForCancelCheck(jobId);
          if (latest.status === 'cancelled') throw new CancelledError();
          await ctx.runMutation(internal.generateJobs.saveProgress, {
            jobId, partialText, progressNote: `Streaming... ${partialText.length} chars`,
          });
          lastSave = now;
        }
        if (now - lastCancelCheck > 5000) {
          lastCancelCheck = now;
          // periodically re-check status (cheap)
        }
      },
      onError: async (err) => {
        await ctx.runMutation(internal.generateJobs.markError, {jobId, error: String(err)});
      },
      onFinish: async () => {
        const files = parseArtifactsFrom(partialText); // Array<{path, content}>
        await ctx.runMutation(internal.generateJobs.markLive, {jobId, files});
      },
    });
  } catch (e) {
    if (!(e instanceof CancelledError)) {
      await ctx.runMutation(internal.generateJobs.markError, {jobId, error: String(e)});
    }
  }
}
```

`readNimKeysFromEnv`/`readProviderSettingsFromEnv` read env vars injected into Convex actions (configured via `npx convex env set`):
- `NIM_API_KEY` (or whatever replaces the browser cookies today; picked up from `process.env`)
- `NIM_BASE_URL`
- `MAYA_MINI`, `MAYA_BALANCED`, `MAYA_MAX`

(Full env-name list audited at Task 1; see also existing `convex/evolutionRunHandler.ts:5 SITE_URL` precedent.)

### 3.4 Stale sweeper (`sweepStale`, cron `*/1 * * * *`)

```ts
const twoMinAgo = Date.now() - 2 * 60_000;
const stale = await ctx.runQuery(internal.generateJobs._listBuildingOlderThan, {olderThan: twoMinAgo});
let swept = 0;
for (const j of stale) {
  await ctx.runMutation(internal.generateJobs.markError, {jobId: j._id, error: 'stale (no progress for 2 min)'});
  swept++;
}
return {swept};
```

Rationale: an `internalAction` that genuinely times out or crashes will be in `building` forever otherwise. 2 min is generous for a healthy build (saves happen every ≤3s). Cron ticks every 1 min.

---

## 4. Frontend contract

### 4.1 Hooks (`lib/workbench/hooks/useGenerateJob.ts`)

```ts
export function useGenerateJob(appId: string | null | undefined) {
  const job = useQuery(
    api.generateJobs.getByAppId,
    appId ? {appId} : 'skip',
  );
  if (!job) return {status: 'pending' as const, files: null, error: null, job: null};
  return {
    status: job.status,
    files: job.filesJson ? (JSON.parse(job.filesJson) as Array<{path:string, content:string}>) : null,
    error: job.error,
    job,
  };
}
```

### 4.2 Hook (`lib/workbench/hooks/useCreateGenerateJob.ts`)

```ts
export function useCreateGenerateJob() {
  const createJob = useMutation(api.generateJobs.createJob);
  return useCallback(async (args: {appId:string; prompt:string; model:string; provider:string}) => {
    const id = await createJob(args);
    return id;
  }, [createJob]);
}
```

### 4.3 BuilderPage integration

In `builderpage.tsx`, on the path that mounts `/workbench/[id]` with a `?prompt=` query param:
- If `appId` is present (always true on the dynamic route), gate chat auto-fire with `appId`+`prompt`:
  - When `useGenerateJob(appId).status === 'pending'|'building'`:
    - Show v0-style centered card "Building your app…" with elapsed-time, model name, cancel button
  - When `'live'`:
    - Decode `files` and call `workbenchStore.files.set(files)` (or equivalent), mount WebContainer via existing ActionRunner path. Render the workbench as normal.
  - When `'error'`:
    - Card: "Build failed — Retry" with `onClick = createJob(...)`.
  - When `'cancelled'`:
    - Card: "Build was cancelled — Build now" with `onClick = createJob(...)`.
- If `?prompt=` is absent AND `appId` is present:
  - `useGenerateJob(appId).status === 'live'` → files mount immediately. (Reload of an already-built app.)
  - Anything else → show empty state with "click to rebuild."

This keeps the existing `/workbench?prompt=...` (no appId) path untouched and unchanged; only `/workbench/[id]` opts in.

---

## 5. Plan→workbench redirect

Currently in `app/page.tsx`, three places do `window.location.href = '/workbench?prompt=...&model=...&provider=...'`. We change them to:
1. First `await fetch('/api/plan', {method:'POST',body:JSON.stringify({prompt})})` instead of opening the SSE response.
2. Server JSON response is `{plan, appId, model, provider}`.
3. Client does `window.location.href = '/workbench/' + appId + '?prompt=' + encodeURIComponent(prompt) + '&model=' + ...&provider=...`.

In `app/api/plan/route.ts`:
1. Run the streaming `streamText(...) as before.
2. Wait for the JSON to be fully generated (`result.text`).
3. Parse JSON.
4. Generate `appId = crypto.randomUUID()`.
5. Call `convex.mutation(api.apps.create, {traderId: 'anonymous', appId, name: planJson.name, descriptionEn: planJson.description, status: 'building', specJson: JSON.stringify(planJson), category: 'other'})`. (Pre-existing `apps.create` already supports all these fields: see `convex/apps.ts:47`.)
6. Return `{plan: planJson, appId, model, provider}` as JSON (not SSE — the plan was previously being streamed; we retain streaming via `result.toTextStreamResponse()` on a side path but the primary change is to also POST and return JSON after fully consuming the stream for plan extraction). If plan-text streaming is critical UX, keep existing SSE behavior on the SSE endpoint and add a sibling `POST /api/plan-and-create-app` that returns JSON; have `app/page.tsx` call the new sibling instead.

**Decision point for the implementer (Workers may not run `convex.mutation` cleanly from inside the Next.js Route Handler):** `app/api/plan/route.ts` is a Next.js Route, **not** a Convex function. It already uses `ConvexHttpClient` indirectly (via `lib/store.ts`). To pre-create the apps row, import convex client directly in the route, OR call a Convex action/mutation. The cleaner approach is to import `convex` (the `ConvexHttpClient` definition in `lib/store.ts`), call `convex.mutation(api.apps.create, ...)`. Already proven pattern.

---

## 6. Failure-mode handling

| Scenario | Behavior |
|---|---|
| Browser closed mid-build | Action keeps running; cron does NOT kill for 2 min; status `building` preserved |
| Convex action times out | Cron at 1 min marks `error: timeout`; user gets Retry |
| Same user starts two builds concurrently | New row each; `getByAppId` returns latest |
| Action throws exception | `markError` → row `error` |
| User cancels | `cancelJob` mutation flips status; worker throws CancelledError at next save; `markError('cancelled')` |
| Files parse returns empty | Worker: `markLive` with `filesJson='[]'`; UI shows "no files generated — rephrase" |
| Network drop on `createJob` | Toast error, no row created, no zombie |
| LLM API key missing in Convex env | Pre-flight: if no NIM key, immediate `markError('Missing LLM config')` |

---

## 7. Tests

| File | Type |
|---|---|
| `lib/workbench/__tests__/e2e-integration.spec.ts` (append) | Static file-shape test: route + crons + new actions exist, types align. |
| `convex/__tests__/generateJobs.spec.ts` (new, vitest) | Unit tests for `markLive`, `markError`, `getByAppId` (latest-wins), `sweepStale` (2-min cutoff). Use Convex's `convex-test` runner. |

---

## 8. File map (concrete)

NEW:
- `app-maya/convex/generateJobs.ts`
- `app-maya/convex/generateJobsHandler.ts`
- `app-maya/lib/workbench/hooks/useGenerateJob.ts`
- `app-maya/lib/workbench/hooks/useCreateGenerateJob.ts`
- `app-maya/docs/detached-generation.md` (operator runbook)

MODIFIED:
- `app-maya/convex/schema.ts` (add `generateJobs` table)
- `app-maya/convex/crons.ts` (register `sweepStale` cron)
- `app-maya/app/api/plan/route.ts` (or sibling endpoint: emit `{plan, appId}`)
- `app-maya/app/page.tsx` (3 redirect sites → call new endpoint + redirect to `/workbench/[appId]`)
- `app-maya/lib/workbench/components/workbench/BuilderPage.tsx` (new branch gated on `appId`)

GENERATED:
- `app-maya/convex/_generated/api.d.ts`, `dataModel.d.ts`, `server.d.ts` (`npx convex dev`)

NOT TOUCHED (intentionally):
- `app-maya/lib/workbench/llm/stream-text.ts`
- `app-maya/lib/workbench/runtime/message-parser.ts`
- `app-maya/lib/workbench/runtime/action-runner.ts`
- `app-maya/convex/evolutionRun.ts`, `evolutionRunHandler.ts`, `autoApprove.ts`, `autoApproveHandler.ts`, `autoDream.ts`, `autoDreamHandler.ts`

---

## 9. Acceptance criteria

1. Plan approval redirects to `/workbench/[<fresh-appId>]?prompt=...`, workbench shows v0-style "Building your app…" card.
2. Closing the browser tab within 1 second of submitting still preserves the job; reopening shows continued spinner until completion.
3. Killing the tab during build returns the user to a retryable error state.
4. Cancel button stops the build cleanly; status shows `cancelled`.
5. Single end-to-end build < 0.05 GB-hours of action compute (well under free-tier budget).
6. Static `e2e-integration.spec.ts` test passes for new module presence and shapes.
7. No regression in existing 56-test suite, evolutionRun, autoApprove, autoDream.

---

## 10. Spec self-review

- ✅ Placeholders: none.
- ✅ Internal consistency: §3 contract matches §4 hooks; §5 flow matches §6.
- ✅ Scope: focused on initial-build detachment only; future features explicitly listed as out-of-scope.
- ✅ Ambiguity: `getByAppId`'s tie-break logic made explicit; cron 2-min threshold named.
- ✅ File paths verified against the codebase (`scripts verified — see reads of app/page.tsx, app/workbench/[id]/page.tsx, convex/apps.ts, lib/store.ts, app/providers.tsx, convex/evolutionRunHandler.ts`).
