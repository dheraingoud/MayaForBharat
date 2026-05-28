import { api, internal } from "./_generated/api"

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://localhost:3000"

async function postLocal(path: string, body: unknown): Promise<Response> {
  return fetch(`${SITE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export async function autoDreamHandler(ctx: any) {
  const apps = await ctx.runQuery(internal.queries.listLiveApps)
  let dreamCount = 0

  for (const app of apps) {
    try {
      const res = await postLocal("/api/autodream", {
        appId: app._id,
      })

      if (res.ok) {
        const data = await res.json().catch(() => ({ factsCount: 0, evicted: 0 }))
        console.log(`[autoDream] ${app._id}: ${data.factsCount} facts, ${data.evicted} evicted`)
      } else {
        console.warn(`[autoDream] ${app._id}: API ${res.status}`)
      }

      await ctx.runMutation(api.evolutionLog.add, {
        appId: app._id,
        message: "autoDream: memory consolidation complete",
        messageEn: "autoDream: memory consolidation complete",
        type: "dream",
      })

      dreamCount++
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : String(e)
      console.error(`[autoDream] app ${app._id}: ${error}`)
    }
  }

  return { success: true, appsProcessed: dreamCount }
}
