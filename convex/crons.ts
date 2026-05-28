import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

// ─── Demo Mode ────────────────────────────────────────────────────────────────
// Fast cycle for pitch demos: evolution every 5 mins, dream every 7, approve every 3
// Set MAYA_DEMO_MODE=true in Convex environment to activate these.
// Production schedules below run if demo mode is off.

const isDemoMode = process.env.MAYA_DEMO_MODE === "true"

if (isDemoMode) {
  // Demo: evolution every 5 minutes
  crons.cron("maya-kairos-demo", "*/5 * * * *", internal.evolutionRun.evolutionRun)
  // Demo: autoDream every 7 minutes
  crons.cron("maya-autodream-demo", "*/7 * * * *", internal.autoDream.autoDream)
  // Demo: auto-approve every 3 minutes
  crons.cron("maya-autoapprove-demo", "*/3 * * * *", internal.autoApprove.autoApprove)
} else {
  // Production: KAIROS daemon — 2am IST (8:30pm UTC)
  crons.cron("maya-kairos", "30 20 * * *", internal.evolutionRun.evolutionRun)
  // Production: autoDream consolidation — 3am IST (9:30pm UTC)
  crons.cron("maya-autodream", "30 21 * * *", internal.autoDream.autoDream)
  // Production: Auto-approve pending improvements every 6 hours
  crons.cron("maya-autoapprove", "0 */6 * * *", internal.autoApprove.autoApprove)
}

export default crons
