"use node";
//
// generateJobsHandler.ts — Heavy logic for the detached generation feature.
//
// Two exported handlers:
//   generateJobsHandler — invoked by internal.generateJobs.generateRun (the worker).
//     Task 4: drives AI SDK v6 streamText() from lib/workbench/llm/stream-text.ts
//     against the NIM router using env-injected API keys. Periodically parses
//     partialText via extractBoltFiles() and saves progress. On finish parses
//     the final text and calls markLive({jobId, files}). Cancels cleanly via
//     a control-flag thrown error caught by the catch arm.
//   sweepStaleHandler — invoked by internal.generateJobs.sweepStale (cron every 1 min).
//     Marks any 'building' job older than 2 minutes as 'error' (no progress for 2 min).
//
// Both handlers use the existing internal helpers defined in generateJobs.ts:
//   _get, _setBuilding, saveProgress, markLive, markError, _listBuildingOlderThan

import { internal } from "./_generated/api";
import { streamText } from "../lib/workbench/llm/stream-text";
import type { UIMessage } from "ai";
import { extractBoltFiles } from "../lib/workbench/llm/extract-bolt-files";

// @ts-nocheck — Convex internalAction ctx is loosely typed; matches the convention
// used by convex/evolutionRunHandler.ts and convex/autoApproveHandler.ts.
const TWO_MIN_MS = 2 * 60 * 1000;
const CANCEL_CHECK_INTERVAL_MS = 7_000;
const SAVE_EVERY_MS = 3_000;
const SAVE_EVERY_CHARS = 4_000;
// Chunk-timeout watchdog: abort an attempt whose SSE stream has gone silent
// for STALL_TIMEOUT_MS, then retry on a fresh AbortController. Up to
// STALL_TIMEOUT_MS + STALL_TIMEOUT_MS/6 poll → ~35s per attempt. 2 attempts
// (MAX_STALL_RETRIES=1 + 1 initial) = ~70s worst-case pure silence before
// markError. Stays under 120s stale sweeper. Recovers stepfun+deepseek mid-stream
// stalls (see memory/maya-nim-stepfun-stall).
const STALL_TIMEOUT_MS = 30_000;
const MAX_STALL_RETRIES = 1;
// Reasoning-only ceiling: a reasoning model (deepseek-v4-flash) can TRICKLE
// reasoning-delta chunks — alive enough to keep the STALL_TIMEOUT_MS watchdog
// quiet, but never crossing into text-delta / file emission — and stall
// indefinitely with zero files. Abort + retry on a fresh controller when no
// file-progress chunk has landed for REASON_CEILING_MS (with zero files).
// Retry budget 2 × (60s + 5s poll) ≈ 130s before markError; the 2-min stale
// sweeper stays quiet because saveProgress still bumps lastProgressAt ~every
// 3s per reasoning chunk. Reduced from 90s to 60s (2026-07-11) because 3×90s
// + NIM startup overhead hit Convex's 600s action timeout. See memory/maya-nim-stepfun-stall.
const REASON_CEILING_MS = 60_000;
// Hard wall-clock cap (2026-07-11): if the handler hasn't marked a terminal
// state within HARD_TIMEOUT_MS, force-error. Guards against Convex's 600s
// action timeout when NIM startup + stall retries compound. Marked 300s to
// leave 300s headroom below Convex's 600s limit.
const HARD_TIMEOUT_MS = 300_000;

class Cancelled extends Error {
  __cancelled = true as const;
  constructor() {
    super('cancelled');
  }
}

function readNimApiKey(): string {
  // MUST mirror NimKeyRotator's key resolution (lib/workbench/llm/nim-router.ts):
  // prefer NVIDIA_API_KEY_1..20, then legacy single-key names. The detached Convex
  // action reads process.env at action-runtime — if these aren't probed in the same
  // order as the rotator, the pre-flight below false-negatives the job to
  // 'Missing LLM config' before streamText ever runs, and the user sees "generation
  // doesn't happen". The in-browser path uses the rotator directly via cookies, so
  // it never hit this — only the detached "Let's Build" path did.
  for (let i = 1; i <= 20; i++) {
    const k = process.env[`NVIDIA_API_KEY_${i}`]?.trim();
    if (k) return k;
  }
  return (
    process.env.NVIDIA_NIM_API_KEY?.trim() ||
    process.env.NIM_API_KEY?.trim() ||
    process.env.API_KEY_NVIDIANIM?.trim() ||
    ''
  );
}

/**
 * Worker entry — runs detached (Convex action), independent of any HTTP request.
 * Streams the LLM response, periodically persists progress + parsed file count,
 * honors `cancelled` between progress saves, and writes the final file array
 * to the generateJobs row + the apps.fileTree on completion.
 */
export async function generateJobsHandler(
  ctx: any,
  { jobId }: { jobId: any },
): Promise<{ ok: boolean; files?: number; cancelled?: boolean }> {
  const job = await ctx.runQuery(internal.generateJobs._get, { jobId });
  if (!job) return { ok: false };
  if (job.status === 'cancelled') {
    return { ok: false, cancelled: true };
  }
  if (job.status === 'live' || job.status === 'error') {
    // Idempotent: another path already brought this to completion.
    return { ok: true };
  }

  await ctx.runMutation(internal.generateJobs._setBuilding, { jobId });

  // Pre-flight: refuse to spend LLM tokens if env is misconfigured.
  const nimKey = readNimApiKey();
  if (!nimKey) {
    await ctx.runMutation(internal.generateJobs.markError, {
      jobId,
      error: 'Missing LLM config (NIM_API_KEY not set in Convex env)',
    });
    return { ok: false };
  }
  const apiKeys: Record<string, string> = { NvidiaNIM: nimKey };
  const providerSettings: Record<string, any> = {
    NvidiaNIM: { enabled: true },
  };

  let partialText = '';
  let lastSaveAt = Date.now();
  let lastSaveLen = 0;
  let lastCancelCheck = Date.now();
  let parsedFiles: Array<{ path: string; content: string }> = [];
  let didMark = false;
  // Stall-watchdog per-attempt state (see memory/maya-nim-stepfun-stall).
  // stallAborted: set ONLY by the stall-watch closure before aborting;
  //   read in the catch to branch stall-retry vs cancel vs genuine error.
  // userCancelled: set ONLY by checkCancel before aborting; read in the catch.
  // lastChunkAt: bumped on EVERY chunk type (text-delta AND reasoning) so a
  //   long reasoning phase (deepseek) isn't mistaken for a stall.
  // lastFileProgressAt: bumped ONLY on text-delta (file-bearing) chunks. A
  //   reasoning model trickle emits reasoning-delta but no text-delta for
  //   minutes — lastChunkAt stays fresh (no STALL_TIMEOUT trip) while
  //   lastFileProgressAt goes stale, tripping REASON_CEILING_MS instead.
  // stallInterval: per-attempt stall-watch timer; cleared in the outer finally
  //   and re-armed in the while-opener so attempt N's dead interval never
  //   fires during attempt N+1.
  let stallAborted = false;
  let userCancelled = false;
  let hardTimedOut = false;
  let lastChunkAt = Date.now();
  let lastFileProgressAt = Date.now();
  let stallInterval: ReturnType<typeof setInterval> | undefined;
  let attempts = 0;

  // Gap A fix: abort the in-flight streamText fetch on cancel so the NIM SSE
  // connection dies immediately. Without this, cancel was polling-only (7s in
  // onChunk) — the stream kept flowing + burning tokens until the 2min stale
  // sweeper caught it. abort() is idempotent; throw Cancelled so the catch arm
  // marks the row 'cancelled' (not 'error').
  // Reassigned per attempt so checkCancel/stall-watch closures always abort the
  // CURRENT attempt's controller (never a dead prior-attempt one).
  let attemptAbortController = new AbortController();
  const checkCancel = async () => {
    const fresh = await ctx.runQuery(internal.generateJobs._get, { jobId });
    if (fresh?.status === 'cancelled') {
      userCancelled = true;
      attemptAbortController.abort();
      throw new Cancelled();
    }
  };

  // Phase B (Bug 2026-07-11): pass parsedFiles → saveProgress so partial
  // files patch generateJobs.filesJson mid-build. Reopen-mid-build subscriber
  // then hydrates server progress so far. `parsedFiles` is fresh-computed in
  // onChunk (extractBoltFiles, closing-tag-gated) just above each call.
  const saveProgressNow = async (note: string, files?: { path: string; content: string }[] | null) => {
    await ctx.runMutation(internal.generateJobs.saveProgress, {
      jobId,
      partialText,
      progressNote: note,
      files: files ?? undefined,
    });
  };

  // Poll cancel on a timer INDEPENDENT of onChunk so a mid-thinking gap (no
  // chunks flowing) is still caught within CANCEL_CHECK_INTERVAL_MS. The
  // swallow-catch lets the abort() do the actual work (stream errors with
  // AbortError → outer catch). Cleared in finally.
  let cancelInterval: ReturnType<typeof setInterval> | undefined;
  // Stall-retry loop: when the SSE stream goes silent for STALL_TIMEOUT_MS
  // (stepfun-3.7-flash mid-stream stall, see memory/maya-nim-stepfun-stall),
  // abort the attempt + re-stream on a fresh AbortController. Per-attempt
  // reset so attempt N's partialText/flags/controller never leak into N+1.
  // Worst-case SILENCE before exhaustion (MAX_STALL_RETRIES+1) × (STALL_TIMEOUT_MS
  // + poll latency) = 3 × ~35s ≈ 105s < 120s stale sweeper, so a pure-stall row
  // is surfaced as "stalled mid-stream" by us, not "stale" by the sweeper. Total
  // wall-clock can exceed 120s when an attempt emits for a while before going
  // silent — in that degenerate case the sweeper falls back to a (correct) error.
  // Hard wall-clock cap: if NIM startup + stall retries compound past
  // HARD_TIMEOUT_MS, force-mark error + throw to exit. Guards Convex 600s
  // action timeout (see 2026-07-11 deepseek 600s timeout incident).
  let hardTimeout: ReturnType<typeof setTimeout> | undefined;
  hardTimeout = setTimeout(() => {
    hardTimedOut = true;
    attemptAbortController.abort();
  }, HARD_TIMEOUT_MS);

  while (attempts < MAX_STALL_RETRIES + 1) {
  if (stallInterval) { clearInterval(stallInterval); stallInterval = undefined; }
  attemptAbortController = new AbortController();
  stallAborted = false;
  userCancelled = false;
  lastChunkAt = Date.now();
  lastFileProgressAt = Date.now();
  partialText = '';
  lastSaveLen = 0;
  lastSaveAt = Date.now();
  lastCancelCheck = Date.now();
  parsedFiles = [];
  didMark = false;
  stallInterval = setInterval(() => {
    // `>=` + 5s poll ⇒ first poll at/after the 30s threshold fires within ~5s,
    // so detection latency ≤ 5s (not the 15s a /2 poll would give).
    const staleAll = Date.now() - lastChunkAt >= STALL_TIMEOUT_MS;
    // Reasoning-only stall (deepseek): chunks still trickling (lastChunkAt
    // fresh) BUT no text-delta / file progress for REASON_CEILING_MS with
    // zero files → keepalive-stall, abort + retry.
    const reasonStale =
      parsedFiles.length === 0 &&
      Date.now() - lastFileProgressAt >= REASON_CEILING_MS;
    if (staleAll || reasonStale) {
      stallAborted = true;
      attemptAbortController.abort();
    }
  }, Math.max(Math.floor(STALL_TIMEOUT_MS / 6), 5000));
  try {
    if (!cancelInterval) {
      cancelInterval = setInterval(() => {
        void checkCancel().catch(() => {});
      }, CANCEL_CHECK_INTERVAL_MS);
    }
    const streamResult: any = await streamText({
      messages: [
        // AI SDK v6 UIMessage no longer carries a top-level `content` — text
        // lives only in `parts`. We omit `id` (handed downstream) so a future
        // schema drift surfaces at compile time, not as a silent stream crash.
        {
          role: 'user',
          parts: [{ type: 'text' as const, text: job.prompt }],
        } as Omit<UIMessage<unknown, any, any>, 'id'>,
      ],
      env: process.env as Record<string, string>,
      apiKeys,
      providerSettings,
      promptId: 'default',
      chatMode: 'build',
      designScheme: undefined,
      files: {},
      options: {
        // Gap A: kill the NIM SSE fetch on cancel. stream-text.ts passes
        // options.* through to _streamText (abortSignal is NOT in its
        // RESERVED_KEYS L238-242), so this reaches AI SDK v6's streamText.
        abortSignal: attemptAbortController.signal,
        // AI SDK v6: chunk events. We persist text-delta only; reasoning/tool
        // deltas are intentionally skipped from partialText (those go through
        // a separate UI channel).
        onChunk: async ({ chunk }: { chunk: { type: string; text?: string } }) => {
          if (
            chunk?.type === 'text-delta' &&
            typeof chunk.text === 'string'
          ) {
            partialText += chunk.text;
            // File-progress heartbeat: text-delta feeds extractBoltFiles, so a
            // text-delta chunk counts as real progress vs the reasoning trickle
            // that doesn't. Bumps lastFileProgressAt → REASON_CEILING_MS watchdog.
            lastFileProgressAt = Date.now();
          }
          const now = Date.now();
          // Bump on EVERY chunk type (text-delta AND reasoning) — a long
          // reasoning phase with no text-delta must not trip the stall-watch.
          lastChunkAt = now;
          if (
            partialText.length - lastSaveLen > SAVE_EVERY_CHARS ||
            now - lastSaveAt > SAVE_EVERY_MS
          ) {
            parsedFiles = extractBoltFiles(partialText);
            await saveProgressNow(
              `Streaming — ${parsedFiles.length} file${parsedFiles.length === 1 ? '' : 's'} detected`,
              parsedFiles,
            );
            lastSaveAt = now;
            lastSaveLen = partialText.length;
          }
          if (now - lastCancelCheck > CANCEL_CHECK_INTERVAL_MS) {
            lastCancelCheck = now;
            await checkCancel();
          }
        },
        onError: async (event: { error?: unknown }) => {
          // DIAGNOSTIC: capture the actual error so we know why the stream died.
          // Persist into the row so it's inspectable from `npx convex data generateJobs`.
          // Narrow unknown → Error.message / String fallback rather than `as any`
          // dot-chain (which silently produced `undefined` for plain objects).
          console.error('[generateJobsHandler] streamText onError:', event?.error);
          const errMsg =
            event?.error instanceof Error
              ? event.error.message
              : String(event?.error ?? '');
          await ctx.runMutation(internal.generateJobs.saveProgress, {
            jobId,
            partialText: partialText || '',
            progressNote: `stream error: ${errMsg.slice(0, 200)}`,
          });
        },
        onFinish: async (event: any) => {
          // Some reasoning models emit zero visible text — everything went into
          // <reasoning> blocks. Fall back to the concatenated reasoning text so
          // file extraction has something to work with.
          const visible: string = event?.text ?? '';
          const reasoningText: string = Array.isArray(event?.reasoning)
            ? event.reasoning.map((r: any) => String(r?.text ?? '')).join('')
            : '';
          const finalText: string =
            (visible && visible.length > 0 ? visible : '') ||
            partialText ||
            reasoningText;
          console.log(
            '[generateJobsHandler] onFinish fired. visible=' + visible.length +
            ' partial=' + partialText.length + ' reasoning=' + reasoningText.length + ' final=' + finalText.length,
          );
          parsedFiles = extractBoltFiles(finalText, true);
          if (parsedFiles.length === 0 && finalText.length > 0) {
            await ctx.runMutation(internal.generateJobs.saveProgress, {
              jobId,
              partialText: finalText,
              progressNote: `finished with 0 files — raw text saved for diagnosis (${finalText.length} chars)`,
            });
          }
          if (parsedFiles.length === 0) {
            // No user-visible files were parsed from the LLM output (reasoning-
            // only, empty output, or malformed boltArtifact tags). Do NOT
            // markLive with files:[] — that would show a blank workbench with a
            // success toast. Surface as error so GenerateJobCard offers Retry.
            await ctx.runMutation(internal.generateJobs.markError, {
              jobId,
              error: `no parseable files in LLM output (${finalText.length} chars received)`,
            });
          } else {
            await ctx.runMutation(internal.generateJobs.markLive, {
              jobId,
              files: parsedFiles,
            });
          }
          didMark = true;
        },
      } as any,
    });

    // AI SDK v6: streamText() returns a result object whose callbacks
    // (onChunk/onFinish/onError) ONLY fire when the underlying stream is
    // consumed. route.ts consumes via toUIMessageStreamResponse() (piped to
    // the HTTP response). This detached handler has no HTTP body to pipe to,
    // so it MUST explicitly drive the stream — awaiting result.text consumes
    // the full stream, firing onChunk (→ partialText accumulates + lastChunkAt
    // bumps on every chunk) and onFinish (→ markLive/markError + didMark=true).
    // Without this, streamText returns immediately and onFinish never fires
    // (the E2E build bug where every NIM model produced a `live`+0-files job
    // in <200ms).
    //
    // The stall-watchdog rethrows here: if the SSE went silent for
    // STALL_TIMEOUT_MS, stall-watch aborted the controller → await text
    // rejects with AbortError → the outer catch branches on stallAborted to
    // retry on a fresh controller. User-cancel aborts (userCancelled) and
    // genuine stream errors likewise propagate. Only onFinish-fired success
    // + the !didMark fallback below stay in the try (no swallow).
    await streamResult.text;

    // Belt-and-braces: if onFinish didn't fire (rare), derive final from partial.
    if (!didMark) {
      const fallback = extractBoltFiles(partialText, true);
      if (fallback.length === 0) {
        await ctx.runMutation(internal.generateJobs.markError, {
          jobId,
          error: `no parseable files (onFinish did not fire; ${partialText.length} chars captured)`,
        });
      } else {
        await ctx.runMutation(internal.generateJobs.markLive, {
          jobId,
          files: fallback,
        });
      }
    }
    return { ok: true, files: parsedFiles.length };
  } catch (e: any) {
    // onFinish already marked a terminal state (live / no-files error) — a
    // late stall/cancel abort after that must NOT clobber it.
    if (didMark) return { ok: true, files: parsedFiles.length };
    // Hard wall-clock cap fired (Convex 600s guard) → error immediately,
    // no more retries. Must precede stallAborted — hardTimeout also calls
    // abort() which could race with the stall-watch.
    if (hardTimedOut) {
      await ctx.runMutation(internal.generateJobs.markError, {
        jobId,
        error: `hard timeout (${HARD_TIMEOUT_MS / 1000}s wall-clock) — NIM stream did not finish`,
      });
      return { ok: false };
    }
    // Stall-watch fired (SSE silent > STALL_TIMEOUT_MS) → retry on a fresh
    // controller; surface exhaustion so the row shows a real error, not a
    // 2-min "stale" from the sweeper.
    if (stallAborted) {
      if (attempts < MAX_STALL_RETRIES) {
        attempts++;
        continue;
      }
      await ctx.runMutation(internal.generateJobs.markError, {
        jobId,
        error: `stalled mid-stream (no chunk for ${STALL_TIMEOUT_MS / 1000}s after ${MAX_STALL_RETRIES + 1} attempts)`,
      });
      return { ok: false };
    }
    // User cancel (checkCancel set userCancelled before aborting).
    if (userCancelled || e instanceof Cancelled || e?.__cancelled) {
      await ctx.runMutation(internal.generateJobs.markError, {
        jobId,
        error: 'cancelled',
      });
      return { ok: false, cancelled: true };
    }
    // Genuine stream error.
    await ctx.runMutation(internal.generateJobs.markError, {
      jobId,
      error:
        typeof e?.message === 'string'
          ? e.message
          : String(e?.message ?? e),
    });
    return { ok: false };
  } finally {
    if (cancelInterval) clearInterval(cancelInterval);
    if (stallInterval) { clearInterval(stallInterval); stallInterval = undefined; }
  }
  } // end stall-retry while
  if (hardTimeout) clearTimeout(hardTimeout);
  // Defensive — every stall/hard-timeout exhaustion returns inside the catch
  // above, so reaching past the while is a logical impossibility; the return
  // keeps the function's Promise return type satisfied.
  await ctx.runMutation(internal.generateJobs.markError, {
    jobId,
    error: `stalled or timed out (no chunk for ${STALL_TIMEOUT_MS / 1000}s after ${MAX_STALL_RETRIES + 1} attempts)`,
  });
  return { ok: false };
}

/**
 * Cron-tick sweeper: any 'building' job whose last activity (lastProgressAt,
 * falling back to createdAt) is older than TWO_MIN_MS is almost certainly
 * stuck (worker timed out, crashed, or the dev process died). Keying off
 * lastProgressAt — bumped by saveProgress every ~3s while chunks flow — means
 * an actively-streaming build that takes >2min to emit files is NOT swept,
 * while a truly silent stream (no chunks → no save) still is.
 * We flip it to error so the UI shows a Retry button instead of an infinite spinner.
 *
 * Free-tier note: this action runs once per minute and touches at most a handful
 * of rows per pass. Cost is effectively zero against the 20 GB-hours/month budget.
 */
export async function sweepStaleHandler(ctx: any): Promise<{ swept: number }> {
  const cutoff = Date.now() - TWO_MIN_MS;
  const stale = await ctx.runQuery(internal.generateJobs._listBuildingOlderThan, {
    olderThan: cutoff,
  });
  let swept = 0;
  for (const j of stale) {
    try {
      await ctx.runMutation(internal.generateJobs.markError, {
        jobId: j._id,
        error: "stale (no progress for 2 min)",
      });
      swept++;
    } catch {
      // best-effort; ignore contention
    }
  }
  return { swept };
}

// Re-export the constants for tests
export const __testing = { TWO_MIN_MS };

// ─── Action wrappers (live here because this file has "use node") ─────────────

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const generateRunAction = internalAction({
  args: { jobId: v.id("generateJobs") },
  handler: async (ctx, args) => {
    // args.jobId is already typed as Id<"generateJobs"> via `v.id` validation;
    // the explicit cast below preserves that narrow at the call boundary so
    // schema drift surfaces at compile time, not at runtime as a silent
    // `null` lookup.
    return await generateJobsHandler(ctx, { jobId: args.jobId as Id<"generateJobs"> });
  },
});

export const sweepStaleAction = internalAction({
  args: {},
  handler: async (ctx) => {
    return await sweepStaleHandler(ctx);
  },
});
