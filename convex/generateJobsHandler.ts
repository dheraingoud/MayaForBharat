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
import { extractBoltFiles } from "../lib/workbench/llm/extract-bolt-files";

// @ts-nocheck — Convex internalAction ctx is loosely typed; matches the convention
// used by convex/evolutionRunHandler.ts and convex/autoApproveHandler.ts.
const TWO_MIN_MS = 2 * 60 * 1000;
const CANCEL_CHECK_INTERVAL_MS = 7_000;
const SAVE_EVERY_MS = 3_000;
const SAVE_EVERY_CHARS = 4_000;

class Cancelled extends Error {
  __cancelled = true as const;
  constructor() {
    super('cancelled');
  }
}

function readNimApiKey(): string {
  return (
    process.env.NIM_API_KEY ||
    process.env.NVIDIA_NIM_API_KEY ||
    process.env.API_KEY_NVIDIANIM ||
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

  const checkCancel = async () => {
    const fresh = await ctx.runQuery(internal.generateJobs._get, { jobId });
    if (fresh?.status === 'cancelled') throw new Cancelled();
  };

  const saveProgressNow = async (note: string) => {
    await ctx.runMutation(internal.generateJobs.saveProgress, {
      jobId,
      partialText,
      progressNote: note,
    });
  };

  try {
    await streamText({
      messages: [
        {
          role: 'user',
          parts: [{ type: 'text' as const, text: job.prompt }],
          content: job.prompt,
        } as any,
      ],
      env: process.env as Record<string, string>,
      apiKeys,
      providerSettings,
      promptId: 'default',
      chatMode: 'build',
      designScheme: undefined,
      files: {},
      options: {
        // AI SDK v6: chunk events. We persist text-delta only; reasoning/tool
        // deltas are intentionally skipped from partialText (those go through
        // a separate UI channel).
        onChunk: async ({ chunk }: { chunk: { type: string; text?: string } }) => {
          if (
            chunk?.type === 'text-delta' &&
            typeof chunk.text === 'string'
          ) {
            partialText += chunk.text;
          }
          const now = Date.now();
          if (
            partialText.length - lastSaveLen > SAVE_EVERY_CHARS ||
            now - lastSaveAt > SAVE_EVERY_MS
          ) {
            parsedFiles = extractBoltFiles(partialText);
            await saveProgressNow(
              `Streaming — ${parsedFiles.length} file${parsedFiles.length === 1 ? '' : 's'} detected`,
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
          console.error('[generateJobsHandler] streamText onError:', event?.error);
          await ctx.runMutation(internal.generateJobs.saveProgress, {
            jobId,
            partialText: partialText || '',
            progressNote: `stream error: ${String((event?.error as any)?.message ?? event?.error ?? '').slice(0, 200)}`,
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
          await ctx.runMutation(internal.generateJobs.markLive, {
            jobId,
            files: parsedFiles,
          });
          didMark = true;
        },
      } as any,
    });

    // Belt-and-braces: if onFinish didn't fire (rare), derive final from partial.
    if (!didMark) {
      const fallback = extractBoltFiles(partialText, true);
      await ctx.runMutation(internal.generateJobs.markLive, {
        jobId,
        files: fallback,
      });
    }
    return { ok: true, files: parsedFiles.length };
  } catch (e: any) {
    if (e instanceof Cancelled || e?.__cancelled) {
      await ctx.runMutation(internal.generateJobs.markError, {
        jobId,
        error: 'cancelled',
      });
      return { ok: false, cancelled: true };
    }
    await ctx.runMutation(internal.generateJobs.markError, {
      jobId,
      error:
        typeof e?.message === 'string'
          ? e.message
          : String(e?.message ?? e),
    });
    return { ok: false };
  }
}

/**
 * Cron-tick sweeper: any 'building' job whose createdAt is older than TWO_MIN_MS
 * is almost certainly stuck (worker timed out, crashed, or the dev process died).
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

export const generateRunAction = internalAction({
  args: { jobId: v.id("generateJobs") },
  handler: async (ctx, args) => {
    return await generateJobsHandler(ctx, { jobId: args.jobId as any });
  },
});

export const sweepStaleAction = internalAction({
  args: {},
  handler: async (ctx) => {
    return await sweepStaleHandler(ctx);
  },
});
