import { query, mutation, action } from "./_generated/server"
import { v } from "convex/values"

// ── Queries ─────────────────────────────────────────

export const listByTrader = query({
  args: { traderId: v.string() },
  handler: async (ctx, { traderId }) => {
    return await ctx.db
      .query("apps")
      .withIndex("by_trader", (q) => q.eq("traderId", traderId))
      .collect()
  },
})

export const getById = query({
  args: { id: v.id("apps") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
})

// ── Mutations ────────────────────────────────────────

export const create = mutation({
  args: {
    traderId: v.string(),
    name: v.string(),
    nameHindi: v.string(),
    descriptionHindi: v.string(),
    specJson: v.string(),
    templateFamily: v.union(
      v.literal("kirana"),
      v.literal("services"),
      v.literal("food")
    ),
    vercelUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("apps", {
      ...args,
      status: "building",
      evolutionCount: 0,
      createdAt: Date.now(),
    })
  },
})

export const update = mutation({
  args: {
    id: v.id("apps"),
    status: v.optional(v.string()),
    vercelUrl: v.optional(v.string()),
    evolutionCount: v.optional(v.number()),
    lastEvolvedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, any> = {}
    if (args.status) updates.status = args.status
    if (args.vercelUrl) updates.vercelUrl = args.vercelUrl
    if (args.evolutionCount !== undefined) updates.evolutionCount = args.evolutionCount
    if (args.lastEvolvedAt) updates.lastEvolvedAt = args.lastEvolvedAt
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.id, updates)
    }
    return true
  },
})
