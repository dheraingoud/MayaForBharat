// generateJobs.ts — Public + internal Convex API for detached app generation.
// Mirrors the split used by evolutionRun.ts / autoApprove.ts / autoDream.ts:
//   - this file defines the schema-bound query + mutation surface and wires
//     scheduler.runAfter to the worker.
//   - generateJobsHandler.ts owns the worker ENTRIES (internalAction) plus the
//     heavy handler bodies (LLM streaming + parsing + sweeper). It declares
//     "use node" because streamText transitively pulls in node-only modules.
//
// Naming note: actions / methods on this file are referenced as
// `internal.generateJobs.<name>` from client-facing mutations; the worker
// actions themselves are `internal.generateJobsHandler.<name>Action`.

// @ts-nocheck — Convex api/filterByIndex union types for the `apps` table are wider than we need here.

import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from './_generated/api';
import { v } from 'convex/values';

// ─── Public mutations / queries ──────────────────────────────────────────────

export const createJob = mutation({
  args: {
    appId: v.string(),
    prompt: v.string(),
    model: v.string(),
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.appId || !args.prompt) {
      throw new Error("createJob: appId and prompt are required");
    }
    if (args.prompt.length > 20_000) {
      throw new Error("createJob: prompt is too long");
    }

    // Block if there's already a job in flight for this appId (best-effort uniqueness).
    const inFlight = await ctx.db
      .query("generateJobs")
      .withIndex("by_app", (q) => q.eq("appId", args.appId))
      .collect();
    const active = inFlight.find(
      (j) => j.status === "building" || j.status === "pending",
    );
    if (active) {
      throw new Error(
        "another generation job is already in progress for this appId",
      );
    }

    const _id = await ctx.db.insert("generateJobs", {
      appId: args.appId,
      traderId: "anonymous", // MAYA is single-trader today; replace with Clerk userId when multi-tenant lands
      status: "pending" as const,
      prompt: args.prompt,
      model: args.model,
      provider: args.provider,
      createdAt: Date.now(),
    });

    // Spawn the detached worker. runAfter(0) runs "next tick" — outside the request lifecycle.
    await ctx.scheduler.runAfter(0, internal.generateJobsHandler.generateRunAction, { jobId: _id });

    return { jobId: _id };
  },
});

export const getByAppId = query({
  args: { appId: v.string() },
  handler: async (ctx, { appId }) => {
    const rows = await ctx.db
      .query("generateJobs")
      .withIndex("by_app", (q) => q.eq("appId", appId))
      .collect();
    if (rows.length === 0) return null;

    // Tie-break:
    //   1. status priority (live > building > pending > error > cancelled).
    //      Lower priority index = higher status priority = wins.
    //   2. within the same status: newer createdAt wins — the latest activity
    //      is what the user expects to see (matches v0's "latest build" UX).
    //
    // The score packs (1) priority + (2) recency into a single comparator.
    // We invert priority (9 - index) so "higher score wins" matches intuition.
    const priority = ['live', 'building', 'pending', 'error', 'cancelled'];
    const pickBest = (candidates: typeof rows) => {
      let bestR = candidates[0];
      for (const r of candidates.slice(1)) {
        const pBest = priority.indexOf(bestR.status);
        const pR = priority.indexOf(r.status);
        if (pR !== pBest) {
          // lower index = higher status priority → higher score wins
          if ((9 - pR) > (9 - pBest)) bestR = r;
          continue;
        }
        // same priority: tie-break on recency — always newer wins
        if (r.createdAt > bestR.createdAt) bestR = r;
      }
      return bestR;
    };
    const best = pickBest(rows);
    if (!best) return null;

    // Most recent (by createdAt) row for this appId surfaces the latest activity,
    // so the UI reflects fresh progress.
    const latest = [...rows].sort((a, b) => b.createdAt - a.createdAt)[0];
    const transientRow =
      (latest.status === "building" || latest.status === "pending") &&
      latest._id !== best._id
        ? latest
        : null;

    let files: Array<{ path: string; content: string }> | null = null;
    if (best.filesJson) {
      try {
        files = JSON.parse(best.filesJson);
      } catch {
        files = null;
      }
    }

    return {
      ...best,
      files,
      transientJob: transientRow
        ? {
            _id: transientRow._id,
            status: transientRow.status,
            progressNote: transientRow.progressNote ?? null,
            createdAt: transientRow.createdAt,
          }
        : null,
    };
  },
});

export const get = query({
  args: { jobId: v.id("generateJobs") },
  handler: async (ctx, { jobId }: { jobId: any }) => {
    return await ctx.db.get(jobId);
  },
});

export const cancelJob = mutation({
  args: { jobId: v.id("generateJobs") },
  handler: async (ctx, { jobId }: { jobId: any }) => {
    const row = await ctx.db.get(jobId);
    if (!row) return { ok: false, error: "not found" };
    if (row.status !== "building" && row.status !== "pending") {
      return { ok: false, error: "not cancellable" };
    }
    await ctx.db.patch(jobId, {
      status: "cancelled" as const,
      finishedAt: Date.now(),
      error: "cancelled by user",
    });
    return { ok: true };
  },
});

// Internal query/mutations used by the worker action.

export const _get = internalQuery({
  args: { jobId: v.id("generateJobs") },
  handler: async (ctx, { jobId }: { jobId: any }) => {
    return await ctx.db.get(jobId);
  },
});

export const _setBuilding = internalMutation({
  args: { jobId: v.id("generateJobs") },
  handler: async (ctx, { jobId }: { jobId: any }) => {
    const row = await ctx.db.get(jobId);
    if (!row) return;
    if (row.status !== "pending") return; // idempotent — do nothing if user already cancelled
    await ctx.db.patch(jobId, { status: "building" as const });
  },
});

export const _listBuildingOlderThan = internalQuery({
  args: { olderThan: v.number() },
  handler: async (ctx, { olderThan }) => {
    const matches: { _id: any; createdAt: number }[] = [];
    const all = await ctx.db
      .query("generateJobs")
      .withIndex("by_status", (q) => q.eq("status", "building"))
      .collect();
    for (const r of all) {
      if (r.createdAt < olderThan) {
        matches.push({ _id: r._id, createdAt: r.createdAt });
      }
    }
    return matches;
  },
});

export const saveProgress = internalMutation({
  args: {
    jobId: v.id("generateJobs"),
    partialText: v.string(),
    progressNote: v.string(),
  },
  handler: async (
    ctx,
    {
      jobId,
      partialText,
      progressNote,
    }: { jobId: any; partialText: string; progressNote: string },
  ) => {
    const row = await ctx.db.get(jobId);
    if (!row) return;
    if (row.status === "cancelled" || row.status === "live" || row.status === "error")
      return;
    await ctx.db.patch(jobId, { partialText, progressNote });
  },
});

export const markLive = internalMutation({
  args: {
    jobId: v.id("generateJobs"),
    files: v.array(
      v.object({ path: v.string(), content: v.string() }),
    ),
  },
  handler: async (ctx, { jobId, files }: { jobId: any; files: any[] }) => {
    const row = await ctx.db.get(jobId);
    if (!row) return;
    if (row.status === "cancelled" || row.status === "live") return;

    const filesJson = JSON.stringify(files);
    await ctx.db.patch(jobId, {
      status: "live" as const,
      filesJson,
      finishedAt: Date.now(),
      progressNote: `${files.length} file${files.length === 1 ? "" : "s"} generated`,
      partialText: undefined,
      error: undefined,
    });

    // Mirror into `apps.fileTree` + `apps.status='building'` so downstream
    // (Vercel deploy, evolution) sees the newly-built artifact as the
    // canonical latest state. apps.status remains 'building' here because we
    // do not run a server-side verify step in this design.
    const appsRow = await ctx.db
      .query("apps")
      .withIndex("by_app_id", (q) => q.eq("appId", row.appId))
      .first();
    if (appsRow) {
      await ctx.db.patch(appsRow._id, {
        fileTree: filesJson,
        status: "building" as const,
      });
    }
  },
});

export const markError = internalMutation({
  args: {
    jobId: v.id("generateJobs"),
    error: v.string(),
  },
  handler: async (ctx, { jobId, error }: { jobId: any; error: string }) => {
    const row = await ctx.db.get(jobId);
    if (!row) return;
    if (row.status === "live") return; // don't overwrite a successful build with a late error
    await ctx.db.patch(jobId, {
      status: "error" as const,
      error,
      finishedAt: Date.now(),
    });
  },
});

// generateRun + sweepStale actions live in `convex/generateJobsActions.ts`
// under `"use node"` (needed because streamText transitively imports node:crypto).
