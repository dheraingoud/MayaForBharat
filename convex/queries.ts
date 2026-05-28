import { internalQuery } from "./_generated/server"
import type { Doc } from "./_generated/dataModel"

/** List all apps marked as "live". */
export const listLiveApps = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("apps").collect()
    return all.filter((a: Doc<"apps">) => a.status === "live")
  },
})

/** List all improvements with status "pending_approval". */
export const listPendingImprovements = internalQuery({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db
      .query("improvements")
      .withIndex("by_app")
      .collect()
    return items.filter((i: Doc<"improvements">) => i.status === "pending_approval")
  },
})
