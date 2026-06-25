# Detached Generation — Operator Runbook

This is the canonical documentation for the "build survives close" feature of MAYA's workbench. It explains how it works, how to operate it, and how to debug it.

If you're a user of the workbench, you can stop reading here — what you need to know is in **§1**. The rest is for operators and future maintainers.

---

## 1. What this feature does

When you click **Approve** on a plan, MAYA:

1. Mints a fresh `appId` and creates an `apps` row in Convex (status = `building`).
2. Redirects you to `/workbench/[appId]?prompt=...`.
3. The workbench subscriptions fire and create a `generateJobs` row in Convex with status `pending`.
4. A Convex internal action (`generateJobsHandler.generateRunAction`) is scheduled and begins generating your app on **Convex's infrastructure, not your browser**.
5. The workbench shows a "Building your app…" card while it runs.
6. **You can close the browser entirely.** The job keeps running on Convex.
7. When you return to `/workbench/[appId]`, the workbench reattaches to the same job. When the model is done, files are written into the WebContainer and the preview appears.

The only way the job can die before completion is if you cancel it, or if Convex's action runtime times out (rare for our scale; if it does, the cron sweeper marks it `error` within minutes and a retry button appears).

---

## 2. Architecture, in one diagram

```
[Browser]                              [Next.js server]                [Convex]
plan approve  ──► POST /api/apps-from-plan  ─► apps.create  ─────────► generateJobs.insert(status='pending')
                                                  │                              │
                                                  │                              ▼
                                                  │              scheduler.runAfter(0, generateRunAction)
                                                  │                              │
                                                  ▼                              ▼
                                  redirect  ◄────────── generateJobsHandler (the worker)
                                  /workbench/[id]?…            │  onChunk: streamText → saveProgress
                                  │                            │  onFinish: parse boltActions → markLive
                                  ▼                            │
                          BuilderPageWithJob                  ▼
                                  │              apps.update(fileTree=…, status='building')
                          useGenerateJob(appId)
                                  │
                          status='live' arrived
                                  ▼
                          webcontainer.fs.writeFile(...)
                          (Browser WebContainer runs the app)
```

---

## 3. Files

| Path | Purpose |
|---|---|
| `convex/schema.ts` | `generateJobs` table definition |
| `convex/generateJobs.ts` | Public + internal queries/mutations |
| `convex/generateJobsHandler.ts` | The worker. **`"use node"`** at top is required (transitive `node:crypto` from LLM providers). |
| `convex/crons.ts` | Two crons: `maya-genjobs-sweep` (prod) + `maya-genjobs-sweep-demo` (demo mode), both every minute. |
| `lib/workbench/llm/extract-bolt-files.ts` | Regex parser used by the worker (and reused by tests). |
| `lib/workbench/hooks/useGenerateJob.ts` | Convex subscription → `{ status, files, error, progressNote, … }`. |
| `lib/workbench/hooks/useCreateGenerateJob.ts` | Submits a job. |
| `lib/workbench/hooks/useCancelGenerateJob.ts` | Cancels an in-flight job (used by the card button + Esc key). |
| `lib/workbench/components/workbench/GenerateJobCard.tsx` | The v0-style status card. Renders 4 states: building / error / cancelled / (live → null, parent takes over). |
| `lib/workbench/components/workbench/BuilderPageWithJob.tsx` | The wrapper. Subscribes, shows the card, mounts files into WebContainer, hands off to the existing BuilderPage on `live`. |
| `app/workbench/[id]/page.tsx` | The dynamic route — replaced vanilla `BuilderPage` for `BuilderPageWithJob`. |
| `app/api/apps-from-plan/route.ts` | New endpoint called by `handleApprove` — generates the plan, mints `appId`, creates the apps row. |
| `app/page.tsx` (only `handleApprove`) | Now POSTs to `/api/apps-from-plan` and redirects to `/workbench/[appId]`. |

---

## 4. Operating the feature

### 4.1 Enabling / disabling

There is no kill switch — when the worker is unable to run (e.g., `NIM_API_KEY` not set), it surfaces a clean error to the user at submit time:

> "Missing LLM config (NIM_API_KEY not set in Convex env)"

To set the key:

```bash
npx convex env set NIM_API_KEY "nvapi-..." --prod
```

(or omit `--prod` for the dev deployment). The same env var name is already used by the existing chat SSE flow on the client; the worker needs the server-side copy in Convex's env.

### 4.2 Fit-and-finish dial

- **Stale cutoff**: 2 minutes. Configurable at `convex/generateJobsHandler.ts:TWO_MIN_MS`.
- **Save-this-each-interval**: 3 s OR 4 000 chars of accumulated text (whichever first). See `SAVE_EVERY_MS` / `SAVE_EVERY_CHARS` constants in the same file.
- **Cancel-check interval**: every 7 s of streaming (`CANCEL_CHECK_INTERVAL_MS`).
- **Cron frequency**: every minute. Lower it would cost more action-compute for no real benefit.

### 4.3 Free-tier math

- One detached build ≈ 0.02 GB-hours of action compute (a ~60-second `max_tokens=16384` reasoning-model call).
- Free tier: 20 GB-hours / month. Roughly **1 000 builds / month headroom**.
- Database: each `generateJobs` row is text only during streaming (few KB), max ~500 KB once `filesJson` is populated. One row per `appId` per build. 0.5 GB DB cap = ~1000 jobs in flight/history before they need archiving.
- File storage: generated files live in `apps.fileTree` (the apps row). 1 GB cap = roughly 100 generated apps before cleanup is warranted.

---

## 5. Debugging

### 5.1 "My build is stuck on the spinner forever"

Two possible causes, fixable in < 60 s.

**A. The worker died before completion (Convex action timeout or process crash)**:
- The cron sweeper runs every minute. After 2 minutes of no progress, the row flips to `error: stale (no progress for 2 min)`.
- Watch it live in the Convex dashboard: https://dashboard.convex.dev → your project → "Logs" or "Data" → `generateJobs`.
- Alternatively: `npx convex data generateJobs | tail -50`.

**B. The submit mutation was never scheduled**:
- Check `apps` table: does the `appId` have a matching `generateJobs` row? If only the `apps` row exists, the user's submit click was lost. They can re-click from the cancel / error card.

### 5.2 Manually re-running a stuck job

```bash
# Look at the queued internal actions
npx convex dashboard
# → Functions → internal.generateJobs.generateRunAction → "Run function" → {
#   jobId: "<_id from generateJobs>"
# }
```

This resumes the worker for an existing row. Useful for dev-mode repro or stuck demos.

### 5.3 Force-flushing the sweeper manually

If the sweeper is misbehaving and you want to immediately mark a stuck row as `error`:

```bash
npx convex run internal.generateJobsHandler.sweepStaleAction '{}'
```

No-op for rows already `error`. Marks every `building` row older than TWO_MIN_MS as `error`.

### 5.4 "The model emitted zero file actions"

The worker still flips to `live` with `filesJson='[]'`. UI surfaces a warning toast (`workbenchStore.alert`) and a no-files warning toast. User is invited to rephrase. This is intentional — not all responses are file-bearing (e.g., a clarifying question), and a zero-file live is a meaningful difference from "still working".

### 5.5 Cancel button / Esc cancel is failing

`cancelJob` is gated to only flip rows that are `building` or `pending`. If the user is clicking cancel after `live`/`error`, the button is a no-op (and the toast says so). The worker itself checks the row status between progress saves (every 3 s) and on every 7 s tick, so cancel latency is bounded at 7 s for an actively-streaming build.

### 5.6 Inspecting the live job from the browser

Open dev tools, type in console:

```js
// eslint-disable-next-line
const id = location.pathname.split('/').pop();
fetch(`/api/debug/generate-job/${id}`)
```

(No such endpoint ships today; the above is the recipe you'd add if you bolt one on. For production debugging, prefer the Convex dashboard.)

---

## 6. Future work (deliberately out of scope for this design)

These were discussed during brainstorming but ruled out for this round. They are documented so a future maintainer doesn't re-litigate them.

- **Per-message detachment.** Today only the *initial* app-build uses the detached worker. Follow-up messages (`"add a login"`) still stream through the existing `/api/workbench/chat` SSE route. Migrating to per-message detached jobs is straightforward (same plumbing) but not currently a top user complaint.
- **Server-side verification (e2b sandbox).** A real "tested-with-npm-test" guarantee would require an external container runtime and is not needed for the user-stated goal of "files survive close".
- **Multi-user concurrency.** Today `traderId` is hardcoded to `"anonymous"`. When multi-tenant lands, swap to the Clerk userId at submit + at sweeper-side guard.
- **Cron dedup.** A job that's progress-saving every 3 s drives ~1 200 mutations per build. Free-tier mutations are uncapped but worth profiling if builds start ballooning.

---

## 7. Tests

`lib/workbench/__tests__/detached-generation.spec.ts` — 13 static-only asserts covering:
- Schema field presence & indexes
- Convex-side public API exports
- "use node" directive + action exports in the handler
- 2-minute stale cutoff literal
- `extractBoltFiles` happy-path + skip-incomplete-blocks + empty input
- Client hooks' `'use client'` & `useQuery`/`useMutation` imports
- BuilderPageWithJob wiring (subscribe + mount + Esc key)
- Route swap to `BuilderPageWithJob`
- `/api/apps-from-plan` route + handleApprove redirect to `/workbench/[appId]`
- Cron registration of genjobs sweeper in both demo + production branches

If you add functions / change filenames, run this spec to confirm drift before sending a PR.
