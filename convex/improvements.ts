import { query, mutation } from "./_generated/server"
import { v } from "convex/values"

// ── Improvements ─────────────────────────────────────

export const listByApp = query({
  args: { appId: v.id("apps") },
  handler: async (ctx, { appId }) => {
    return await ctx.db
      .query("improvements")
      .withIndex("by_app", (q) => q.eq("appId", appId))
      .order("desc")
      .collect()
  },
})

export const create = mutation({
  args: {
    appId: v.id("apps"),
    titleHindi: v.string(),
    titleEn: v.string(),
    category: v.union(
      v.literal("copy"),
      v.literal("new_display"),
      v.literal("new_page"),
      v.literal("logic_fix"),
      v.literal("new_feature")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("improvements", {
      ...args,
      status: "proposed",
      proposedAt: Date.now(),
    })
  },
})

export const updateStatus = mutation({
  args: {
    id: v.id("improvements"),
    status: v.union(
      v.literal("proposed"),
      v.literal("building"),
      v.literal("gate_failed"),
      v.literal("pending_approval"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("merged")
    ),
    failedGate: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    diffLines: v.optional(v.number()),
    testsPassed: v.optional(v.boolean()),
    screenshotDiffPct: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, any> = { status: args.status }
    if (args.failedGate !== undefined) updates.failedGate = args.failedGate
    if (args.previewUrl !== undefined) updates.previewUrl = args.previewUrl
    if (args.diffLines !== undefined) updates.diffLines = args.diffLines
    if (args.testsPassed !== undefined) updates.testsPassed = args.testsPassed
    if (args.screenshotDiffPct !== undefined) updates.screenshotDiffPct = args.screenshotDiffPct
    if (args.status === "merged") updates.mergedAt = Date.now()
    await ctx.db.patch(args.id, updates)
    return true
  },
})

export const getById = query({
  args: { id: v.id("improvements") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id)
  },
})
