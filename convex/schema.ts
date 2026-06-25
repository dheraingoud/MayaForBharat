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
    appId: v.optional(v.string()), // to map to external crypto.randomUUID()
    name: v.string(),
    nameHindi: v.optional(v.string()),
    descriptionHindi: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    specJson: v.optional(v.string()),
    fileTree: v.optional(v.string()),
    vercelProjectId: v.optional(v.string()),
    vercelUrl: v.optional(v.string()),
    category: v.optional(v.string()),
    status: v.union(
      v.literal("building"),
      v.literal("preview"),
      v.literal("live"),
      v.literal("evolving"),
      v.literal("error")
    ),
    deploymentId: v.optional(v.string()),
    templateFamily: v.optional(v.union(
      v.literal("kirana"),
      v.literal("services"),
      v.literal("food")
    )),
    adminUsername: v.optional(v.string()),
    adminPin: v.optional(v.string()),
    shownToOwner: v.optional(v.boolean()),
    evolutionCount: v.optional(v.number()),
    lastEvolvedAt: v.optional(v.number()),
    messages: v.optional(
      v.array(
        v.object({
          role: v.union(v.literal("user"), v.literal("assistant")),
          content: v.string(),
          timestamp: v.number(),
        })
      )
    ),
    createdAt: v.number(),
  }).index("by_trader", ["traderId"]).index("by_app_id", ["appId"]),

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

  // Detached generation jobs — v0-style build persistence.
  // Lives in a separate table so the build row toggles frequently (pending/building/live/error)
  // without thrashing the `apps` table that downstream consumers (Vercel deploy, evolution)
  // observe as the "final" state.
  generateJobs: defineTable({
    appId: v.string(),
    traderId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("building"),
      v.literal("live"),
      v.literal("error"),
      v.literal("cancelled"),
    ),
    prompt: v.string(),
    model: v.string(),
    provider: v.string(),
    partialText: v.optional(v.string()),
    progressNote: v.optional(v.string()),
    filesJson: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_app", ["appId"])
    .index("by_status", ["status"]),
})
