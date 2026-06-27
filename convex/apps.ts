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

export const getByAppId = query({
  args: { appId: v.string() },
  handler: async (ctx, { appId }) => {
    return await ctx.db
      .query("apps")
      .withIndex("by_app_id", (q) => q.eq("appId", appId))
      .first()
  },
})

export const listAll = query({
  handler: async (ctx) => {
    return await ctx.db.query("apps").order("desc").collect()
  },
})

export const removeByAppId = mutation({
  args: { appId: v.string() },
  handler: async (ctx, { appId }) => {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_app_id", (q) => q.eq("appId", appId))
      .first()
    if (app) {
      await ctx.db.delete(app._id)
    }
  },
})

// ── Mutations ────────────────────────────────────────

export const create = mutation({
  args: {
    traderId: v.string(),
    appId: v.optional(v.string()),
    name: v.string(),
    nameHindi: v.optional(v.string()),
    descriptionHindi: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    specJson: v.optional(v.string()),
    templateFamily: v.optional(v.union(
      v.literal("kirana"),
      v.literal("services"),
      v.literal("food")
    )),
    category: v.optional(v.string()),
    vercelUrl: v.optional(v.string()),
    vercelProjectId: v.optional(v.string()),
    adminUsername: v.optional(v.string()),
    adminPin: v.optional(v.string()),
    shownToOwner: v.optional(v.boolean()),
    messages: v.optional(
      v.array(
        v.object({
          role: v.union(v.literal("user"), v.literal("assistant")),
          content: v.string(),
          timestamp: v.number(),
        })
      )
    ),
    status: v.optional(v.union(
      v.literal("building"),
      v.literal("preview"),
      v.literal("live"),
      v.literal("evolving"),
      v.literal("error"),
      v.literal("deployed")
    )),
    deploymentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if app already exists
    if (args.appId) {
      const existing = await ctx.db
        .query("apps")
        .withIndex("by_app_id", (q) => q.eq("appId", args.appId as string))
        .first()
      
      if (existing) {
        await ctx.db.patch(existing._id, {
          ...args,
        })
        return existing._id
      }
    }

    return await ctx.db.insert("apps", {
      ...args,
      status: args.status || "building",
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
    deploymentId: v.optional(v.string()),
    evolutionCount: v.optional(v.number()),
    lastEvolvedAt: v.optional(v.number()),
    shownToOwner: v.optional(v.boolean()),
    messages: v.optional(
      v.array(
        v.object({
          role: v.union(v.literal("user"), v.literal("assistant")),
          content: v.string(),
          timestamp: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, any> = {}
    if (args.status) updates.status = args.status
    if (args.vercelUrl) updates.vercelUrl = args.vercelUrl
    if (args.evolutionCount !== undefined) updates.evolutionCount = args.evolutionCount
    if (args.lastEvolvedAt) updates.lastEvolvedAt = args.lastEvolvedAt
    if (args.shownToOwner !== undefined) updates.shownToOwner = args.shownToOwner
    if (args.deploymentId) updates.deploymentId = args.deploymentId
    if (args.messages !== undefined) updates.messages = args.messages
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.id, updates)
    }
    return true
  },
})
