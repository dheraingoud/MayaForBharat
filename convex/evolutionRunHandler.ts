import { api, internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://localhost:3000"

async function postLocal(path: string, body: unknown): Promise<Response> {
  return fetch(`${SITE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export async function evolutionRunHandler(ctx: any) {
  const apps = await ctx.runQuery(internal.queries.listLiveApps)
  const eligible = apps.filter(
    (a: any) => a.vercelUrl && a.vercelUrl.length > 0
  )

  if (eligible.length === 0) {
    console.log("[KAIROS] no live apps with vercelUrl")
    return { success: true, appsProcessed: 0, succeeded: 0 }
  }

  const results: Array<{ appId: string; success: boolean; error?: string }> = []

  for (const app of eligible) {
    try {
      await ctx.runMutation(api.apps.update, {
        id: app._id,
        status: "evolving",
      })

      const res = await postLocal("/api/evolution", {
        appId: app._id,
        name: app.name,
        description: app.descriptionHindi,
        vercelUrl: app.vercelUrl,
      })

      if (!res.ok) {
        throw new Error(`evolution API ${res.status}`)
      }

      const cycle = await res.json()

      await ctx.runMutation(api.apps.update, {
        id: app._id,
        status: "live",
        evolutionCount: (app.evolutionCount || 0) + 1,
        lastEvolvedAt: Date.now(),
      })

      await ctx.runMutation(api.evolutionLog.add, {
        appId: app._id,
        message: `Cycle: ${cycle.proposals ?? 0} proposals, ${cycle.merged ?? 0} merged`,
        messageEn: `Cycle: ${cycle.proposals ?? 0} proposals, ${cycle.merged ?? 0} merged`,
        type: "improvement",
      })

      results.push({ appId: app._id, success: true })
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : String(e)
      console.error(`[KAIROS] app ${app._id}: ${error}`)

      await ctx.runMutation(api.apps.update, {
        id: app._id,
        status: "live",
      }).catch(() => {})

      await ctx.runMutation(api.evolutionLog.add, {
        appId: app._id,
        message: `Cycle failed: ${error}`,
        messageEn: `Cycle failed: ${error}`,
        type: "gate_fail",
      }).catch(() => {})

      results.push({ appId: app._id, success: false, error })
    }
  }

  const succeeded = results.filter((r) => r.success).length
  console.log(`[KAIROS] ${succeeded}/${results.length} done`)
  return { success: true, appsProcessed: results.length, succeeded }
}
