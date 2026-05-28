import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  traders: defineTable({
    clerkUserId: v.string(),
    phone: v.optional(v.string()),
    name: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_clerk_user_id", ["clerkUserId"]),

  apps: defineTable({
    traderId: v.string(),
    name: v.string(),
    nameHindi: v.string(),
    descriptionHindi: v.string(),
    specJson: v.string(),
    fileTree: v.optional(v.string()),
    vercelProjectId: v.optional(v.string()),
    vercelUrl: v.optional(v.string()),
    status: v.union(
      v.literal("building"),
      v.literal("live"),
      v.literal("evolving"),
      v.literal("error")
    ),
    templateFamily: v.union(
      v.literal("kirana"),
      v.literal("services"),
      v.literal("food")
    ),
    evolutionCount: v.number(),
    lastEvolvedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_trader", ["traderId"]),

  improvements: defineTable({
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
    status: v.union(
      v.literal("proposed"),
      v.literal("building"),
      v.literal("gate_failed"),
      v.literal("pending_approval"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("merged"),
      v.literal("system")
    ),
    failedGate: v.optional(v.string()),
    worktreePath: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    diffLines: v.optional(v.number()),
    testsPassed: v.optional(v.boolean()),
    screenshotDiffPct: v.optional(v.number()),
    proposedAt: v.number(),
    mergedAt: v.optional(v.number()),
  }).index("by_app", ["appId"]),

  evolutionLog: defineTable({
    appId: v.id("apps"),
    message: v.string(),
    messageEn: v.string(),
    type: v.union(
      v.literal("improvement"),
      v.literal("gate_fail"),
      v.literal("observation"),
      v.literal("dream")
    ),
    createdAt: v.number(),
  }).index("by_app", ["appId"]),
})
