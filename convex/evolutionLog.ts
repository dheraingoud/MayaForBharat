import { query, mutation } from "./_generated/server"
import { v } from "convex/values"

// ── Evolution Log ─────────────────────────────────────

export const listByApp = query({
  args: { appId: v.id("apps") },
  handler: async (ctx, { appId }) => {
    return await ctx.db
      .query("evolutionLog")
      .withIndex("by_app", (q) => q.eq("appId", appId))
      .order("desc")
      .collect()
  },
})

export const add = mutation({
  args: {
    appId: v.id("apps"),
    message: v.string(),
    messageEn: v.string(),
    type: v.union(
      v.literal("improvement"),
      v.literal("gate_fail"),
      v.literal("observation"),
      v.literal("dream")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("evolutionLog", {
      ...args,
      createdAt: Date.now(),
    })
  },
})
