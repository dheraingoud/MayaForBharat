import { internalAction } from "./_generated/server"

/**
 * Convex scheduled action: Health Check for all live MAYA apps.
 * Runs on a cron schedule — pings every live app's URL.
 * If an app is unhealthy, triggers auto-rollback via the Next.js API.
 * 
 * From MAYA-IMPORTANT.md Part 5/6:
 * "Build a scheduled Convex action that pings every live app's homepage
 *  every 5 minutes. On failure, automatically call promoteToProduction()
 *  with the last known-good deployment ID."
 */
export const healthCheck = internalAction({
  handler: async () => {
    console.log("[healthCheck] Starting scheduled health check...")
    
    // Call our Next.js health-check API endpoint which handles the actual
    // health checking and auto-rollback logic
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.SITE_URL || 'http://localhost:3000'
    
    try {
      const res = await fetch(`${appUrl}/api/health-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // Check all live apps
      })

      if (!res.ok) {
        console.error(`[healthCheck] API returned ${res.status}`)
        return
      }

      const data = await res.json()
      console.log(`[healthCheck] Checked ${data.totalApps} apps. All healthy: ${data.allHealthy}. Rollbacks: ${data.anyRollbacks}`)
      
      if (data.anyRollbacks) {
        console.warn("[healthCheck] ⚠️ Auto-rollbacks occurred:", 
          data.results.filter((r: any) => r.rolledBack).map((r: any) => `${r.appId} → ${r.rollbackUrl}`)
        )
      }
    } catch (e) {
      console.error("[healthCheck] Failed to run health check:", e)
    }
  },
})
