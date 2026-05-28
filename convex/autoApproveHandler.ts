import { api, internal } from "./_generated/api"

export async function autoApproveHandler(ctx: any): Promise<{ success: boolean; approvedCount: number; pendingCount: number }> {
  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000
  const items = await ctx.runQuery(internal.queries.listPendingImprovements)
  const stale = items.filter(
    (i: any) => i.status === "pending_approval" && i.proposedAt < twentyFourHoursAgo
  )

  let approvedCount = 0

  for (const item of stale) {
    try {
      await ctx.runMutation(api.improvements.updateStatus, {
        id: item._id,
        status: "approved",
      })

      await ctx.runMutation(api.evolutionLog.add, {
        appId: item.appId,
        message: `"${item.titleEn ?? ""}" auto-approved (24h elapsed)`,
        messageEn: `"${item.titleEn ?? ""}" auto-approved (24h elapsed)`,
        type: "improvement",
      })

      approvedCount++
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : String(e)
      console.error(`[autoApprove] item ${item._id}: ${error}`)
    }
  }

  console.log(`[autoApprove] ${approvedCount}/${stale.length}`)
  return {
    success: true,
    approvedCount,
    pendingCount: stale.length,
  }
}
