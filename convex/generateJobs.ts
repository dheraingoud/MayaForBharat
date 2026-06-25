// @ts-nocheck — Convex action callbacks can pick up jobId from scratch + _setBuilding/saveProgress/markLive/markError are all imported via internal.
// generateJobs.ts — Public + internal Convex API for detached app generation.
// Mirrors the split used by evolutionRun.ts / autoApprove.ts / autoDream.ts:
//   - this file defines the API surface and wires scheduler runs.
//   - generateJobsHandler.ts contains the heavy logic (LLM streaming, parsing, sweeper).
//
// Public surface (callable from client):
//   createJob      — submit a generation job and spawn the worker via scheduler.runAfter(0, ...)
//   getByAppId     — read the latest job for an appId (used by useQuery in the browser)
//   get            — read a specific job by _id
//   cancelJob      — flip status to 'cancelled' (the worker honors this between progress saves)
//
// Internal surface (used by the worker and other actions):
//   _get                     — read a row by _id
//   _setBuilding             — flip status pending -> building
//   _listBuildingOlderThan   — used by sweepStale to find stale 'building' jobs
//   saveProgress             — partialText + progressNote updates
//   markLive                 — final state with filesJson, also writes apps.fileTree
//   markError                — sets status='error', error message
//   generateRun              — internalAction that calls generateJobsHandler
//   sweepStale               — internalAction that calls sweepStaleHandler

import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { generateJobsHandler, sweepStaleHandler } from "./generateJobsHandler";

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
    await ctx.scheduler.runAfter(0, internal.generateJobs.generateRun, { jobId: _id });

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

    // Tie-break: prefer live, then building/pending, then error, then cancelled.
    const priority = ["live", "building", "pending", "error", "cancelled"];
    let best: typeof rows[number] | null = null;
    let bestPrio = -1;
    for (const r of rows) {
      const p = priority.indexOf(r.status);
      // Tie-break by recency when same status — older wins for stable states ('live', 'error', 'cancelled'),
      // newer wins for transient states ('building', 'pending').
      const transient = r.status === "building" || r.status === "pending";
      const newerWins = transient;
      if (p > bestPrio || (p === bestPrio && newerWins)) {
        best = r;
        bestPrio = p;
      }
    }
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

export const generateRun = internalAction({
  args: { jobId: v.id("generateJobs") },
  handler: async (ctx, args) => {
    return await generateJobsHandler(ctx, { jobId: args.jobId as any });
  },
});

export const sweepStale = internalAction({
  args: {},
  handler: async (ctx) => {
    return await sweepStaleHandler(ctx);
  },
});
