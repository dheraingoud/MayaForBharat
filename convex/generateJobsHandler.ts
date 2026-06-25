// generateJobsHandler.ts — Heavy logic for the detached generation feature.
//
// Two exported handlers:
//   generateJobsHandler — invoked by internal.generateJobs.generateRun (the worker).
//     Task 2 ships a SKELETON that does not call an LLM yet; it produces a hardcoded
//     pair of files (README.md + package.json) and calls markLive. Task 4 replaces
//     this body with the real AI SDK v6 streaming call.
//   sweepStaleHandler — invoked by internal.generateJobs.sweepStale (cron every 1 min).
//     Marks any 'building' job older than 2 minutes as 'error' (no progress for 2 min).
//
// Both handlers use the existing internal helpers defined in generateJobs.ts:
//   _get, _setBuilding, saveProgress, markLive, markError, _listBuildingOlderThan

import { internal } from "./_generated/api";

// @ts-nocheck — Convex internalAction ctx is loosely typed; matches the convention
// used by convex/evolutionRunHandler.ts and convex/autoApproveHandler.ts.
const TWO_MIN_MS = 2 * 60 * 1000;

/**
 * Worker entry — runs detached (Convex action), independent of any HTTP request.
 * Task 2 ships a placeholder that produces deterministic dummy files for smoke-testing
 * the schema + sweeper + Convex realtime propagation without spending LLM tokens.
 * Task 4 (see plan section 4) replaces the body of this function with the real
 * AI SDK v6 streamText() call that builds the actual app.
 */
export async function generateJobsHandler(ctx: any, { jobId }: { jobId: any }): Promise<{
  ok: boolean;
  files?: number;
  cancelled?: boolean;
}> {
  const job = await ctx.runQuery(internal.generateJobs._get, { jobId });
  if (!job) return { ok: false };
  if (job.status === "cancelled") {
    return { ok: false, cancelled: true };
  }
  if (job.status === "live" || job.status === "error") {
    // Idempotent: another path already brought this to completion.
    return { ok: true };
  }

  await ctx.runMutation(internal.generateJobs._setBuilding, { jobId });

  try {
    await ctx.runMutation(internal.generateJobs.saveProgress, {
      jobId,
      partialText: "",
      progressNote: "starting (skeleton) — Task 4 will fill",
    });

    // ----------------------------------------------------------------------
    // TASK 2 SKELETON — replaced in Task 4 with streamText() + extractBoltFiles
    // ----------------------------------------------------------------------
    const files = [
      {
        path: "README.md",
        content:
          "# MAYA-generated app\n\nSkeleton build (Task 2). The full implementation lands in Task 4 with a live LLM call.\n",
      },
      {
        path: "package.json",
        content: JSON.stringify({ name: "maya-app", version: "0.0.1", private: true }, null, 2) + "\n",
      },
    ];

    await ctx.runMutation(internal.generateJobs.markLive, { jobId, files });
    return { ok: true, files: files.length };
  } catch (e: any) {
    if (e && typeof e === "object" && e.__cancelled) {
      await ctx.runMutation(internal.generateJobs.markError, {
        jobId,
        error: "cancelled",
      });
      return { ok: false, cancelled: true };
    }
    await ctx.runMutation(internal.generateJobs.markError, {
      jobId,
      error:
        typeof e?.message === "string"
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
