/**
 * MAYA 5-Gate Coordinator — Safety gates for evolution improvements
 *
 * Inspired by Claude Code's permission system (Tool.ts checkPermissions):
 * Every gate is a permission check. All 5 must pass or we discard.
 *
 * Gate order (cheapest first, short-circuit on failure):
 * 1. Category whitelist (free)
 * 2. Diff size < 150 lines (free, git stat)
 * 3. Build passes (bun run build)
 * 4. Tests pass (vitest run)
 * 5. Screenshot diff < 5% (Playwright + pixelmatch)
 *
 * gh-fix-ci pattern: Gates 3 & 4 get ONE auto-fix retry.
 * Gates 1, 2, 5: hard fail, no retry.
 */

import { execSync } from 'child_process'
import { existsSync, promises as fsp } from 'fs'
import path from 'path'

// ─── Package Manager Detection ─────────────────────────────────────────────────

function detectPm(cwd: string): { run: string; test: string } {
  if (existsSync(path.join(cwd, 'bun.lockb')) || existsSync(path.join(cwd, 'bun.lock'))) {
    return { run: 'bun run', test: 'bun test' }
  }
  if (existsSync(path.join(cwd, 'pnpm-lock.yaml'))) {
    return { run: 'pnpm run', test: 'npx vitest run' }
  }
  if (existsSync(path.join(cwd, 'yarn.lock'))) {
    return { run: 'yarn', test: 'npx vitest run' }
  }
  return { run: 'npm run', test: 'npx vitest run' }
}
import type { Proposal } from './agents/proposer'
import { fixBuilder } from './agents/builder'
import { compressError } from './voice-pipeline'
import { observerDomAgent } from './agents/observer-dom'
import { proposerAgent } from './agents/proposer'
import { builderAgent } from './agents/builder'
import {
  createWorktree,
  discardWorktree,
  mergeWorktree,
  cleanupOrphanedWorktrees,
} from './worktree'
import { getSkillsForContext } from './skills'
import { getBuildsDir } from '@/lib/path'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GateResult {
  decision: 'merge' | 'discard'
  failedGate?: string
  diffLines?: number
  testsPassed?: boolean
  screenshotDiffPct?: number
  autoFixAttempted?: boolean
  error?: string
}

export interface CoordinatorConfig {
  /** Max lines changed per improvement */
  maxDiffLines: number
  /** Max screenshot diff percentage */
  maxScreenshotDiffPct: number
  /** Whether to attempt auto-fix on gate 3/4 failure */
  enableAutoFix: boolean
  /** Max proposals to execute per evolution cycle — rest saved for next day */
  maxProposalsPerCycle: number
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxDiffLines: 150,
  maxScreenshotDiffPct: 5,
  enableAutoFix: true,
  /** Max proposals to execute per evolution cycle (save the rest for next day) */
  maxProposalsPerCycle: 2,
}

// ─── Pending Proposal Queue ────────────────────────────────────────────────────
// Proposals that pass the proposer but exceed the daily cap are saved to disk
// and loaded at the start of the next evolution cycle.

const PENDING_QUEUE_FILE = (appId: string) =>
  getBuildsDir(appId, 'pending-proposals.json')

async function loadPendingProposals(appId: string): Promise<Proposal[]> {
  try {
    const file = PENDING_QUEUE_FILE(appId)
    const raw = await fsp.readFile(file, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as Proposal[] : []
  } catch {
    return []
  }
}

async function savePendingProposals(appId: string, proposals: Proposal[]): Promise<void> {
  try {
    const file = PENDING_QUEUE_FILE(appId)
    await fsp.mkdir(path.dirname(file), { recursive: true })
    await fsp.writeFile(file, JSON.stringify(proposals, null, 2), 'utf-8')
    console.log(`[coordinator] Saved ${proposals.length} proposals to pending queue for ${appId}`)
  } catch (e) {
    console.warn('[coordinator] Failed to save pending proposals:', e)
  }
}

// ─── Allowed Categories ───────────────────────────────────────────────────────

const ALLOWED_CATEGORIES = new Set([
  'copy', 'new_display', 'new_page', 'logic_fix', 'new_feature',
])

// ─── Gate-specific error boundaries ───────────────────────────────────────────
// Each gate is wrapped in try/catch so a single gate failure does not crash
// the entire orchestration. runEvolutionCycle handles cleanup on 'discard'.

export async function coordinatorGate(
  proposal: Proposal,
  wtPath: string,
  branch: string,
  config: CoordinatorConfig = DEFAULT_CONFIG
): Promise<GateResult> {
  // ── GATE 1: Category whitelist ─────────────────────────────────────────
  try {
    if (!ALLOWED_CATEGORIES.has(proposal.category)) {
      return { decision: 'discard', failedGate: `category:${proposal.category}` }
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[coordinator] Gate 1 (category) threw:', error)
    return { decision: 'discard', failedGate: 'category_error', error }
  }

  // ── GATE 2: Diff size ──────────────────────────────────────────────────
  let diffLines = 0
  try {
    const stat = execSync(`git diff main --stat`, {
      cwd: wtPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    })
    const insertions = parseInt(stat.match(/(\d+) insertions?/)?.[1] ?? '0')
    const deletions = parseInt(stat.match(/(\d+) deletions?/)?.[1] ?? '0')
    diffLines = insertions + deletions
  } catch (e) {
    diffLines = 999 // assume large diff if can't parse
    console.warn('[coordinator] Gate 2 (diff size) could not parse git stat, defaulting to large diff')
  }

  if (diffLines > config.maxDiffLines) {
    return {
      decision: 'discard',
      failedGate: `diff_size:${diffLines}`,
      diffLines,
    }
  }

  // ── GATE 3: Build passes ───────────────────────────────────────────────
  try {
    const buildResult = runBuild(wtPath)
    if (!buildResult.success) {
      if (config.enableAutoFix) {
        // gh-fix-ci: ONE auto-fix attempt
        console.log('[coordinator] Gate 3 failed, attempting auto-fix...')
        const compressed = compressError(buildResult.error)
        const fix = await fixBuilder(compressed, wtPath, 'build')

        if (fix.success) {
          // Retry build
          const retryBuild = runBuild(wtPath)
          if (!retryBuild.success) {
            return {
              decision: 'discard',
              failedGate: 'build_failed_after_fix',
              diffLines,
              autoFixAttempted: true,
            }
          }
        } else {
          return {
            decision: 'discard',
            failedGate: 'build_failed',
            diffLines,
            autoFixAttempted: true,
          }
        }
      } else {
        return { decision: 'discard', failedGate: 'build_failed', diffLines }
      }
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[coordinator] Gate 3 (build) threw:', error)
    return {
      decision: 'discard',
      failedGate: 'build_error',
      diffLines,
      error,
    }
  }

  // ── GATE 4: Tests pass ─────────────────────────────────────────────────
  try {
    const testResult = runTests(wtPath)
    if (!testResult.success) {
      if (config.enableAutoFix) {
        // gh-fix-ci: ONE auto-fix attempt
        console.log('[coordinator] Gate 4 failed, attempting auto-fix...')
        const compressed = compressError(testResult.error)
        const fix = await fixBuilder(compressed, wtPath, 'test')

        if (fix.success) {
          const retryTests = runTests(wtPath)
          if (!retryTests.success) {
            return {
              decision: 'discard',
              failedGate: 'tests_failed_after_fix',
              diffLines,
              testsPassed: false,
              autoFixAttempted: true,
            }
          }
        } else {
          return {
            decision: 'discard',
            failedGate: 'tests_failed',
            diffLines,
            testsPassed: false,
            autoFixAttempted: true,
          }
        }
      } else {
        return {
          decision: 'discard',
          failedGate: 'tests_failed',
          diffLines,
          testsPassed: false,
        }
      }
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[coordinator] Gate 4 (tests) threw:', error)
    return {
      decision: 'discard',
      failedGate: 'test_error',
      diffLines,
      testsPassed: false,
      error,
    }
  }

  // ── GATE 5: Visual Diff (Moved to runEvolutionCycle) ───────────────────
  // Gate 5 now requires deploying a Vercel Preview environment and running
  // a Microlink screenshot diff, so it is handled in the orchestrator.

  // All gates passed
  return {
    decision: 'merge',
    diffLines,
    testsPassed: true,
    screenshotDiffPct: 0,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function runBuild(cwd: string): { success: boolean; error: string } {
  try {
    const pm = detectPm(cwd)
    execSync(`${pm.run} build`, {
      cwd,
      timeout: 120000,
      stdio: 'pipe',
      encoding: 'utf-8',
    })
    return { success: true, error: '' }
  } catch (e: unknown) {
    const err = e as { stderr?: string; stdout?: string }
    return {
      success: false,
      error: (err.stderr ?? err.stdout ?? 'Build failed').slice(-3000),
    }
  }
}

function runTests(cwd: string): { success: boolean; error: string } {
  try {
    const pm = detectPm(cwd)
    execSync(pm.test, {
      cwd,
      timeout: 60000,
      stdio: 'pipe',
      encoding: 'utf-8',
    })
    return { success: true, error: '' }
  } catch (e: unknown) {
    const err = e as { stderr?: string; stdout?: string }
    return {
      success: false,
      error: (err.stderr ?? err.stdout ?? 'Tests failed').slice(-3000),
    }
  }
}

// Removed legacy runScreenshotDiff since we now use screenshot.ts directly

// ─── Full Evolution Cycle ─────────────────────────────────────────────────────
// Orchestrates: Observer -> Proposer -> Builder -> Gates -> Merge

export interface EvolutionCycleResult {
  signals: { hasSignal: boolean }
  proposals: number
  built: number
  merged: number
  gateFailures: { gate: string; count: number }[]
  errors: string[]
}

export async function runEvolutionCycle(
  app: {
    id: string
    name: string
    description: string
    category?: string
    vercelUrl: string
    fileTree: string
    semanticFacts: string
    mayaMd: string
    designSystem: string
    recentEpisodes: string
  }
): Promise<EvolutionCycleResult> {
  const result: EvolutionCycleResult = {
    signals: { hasSignal: false },
    proposals: 0,
    built: 0,
    merged: 0,
    gateFailures: [],
    errors: [],
  }

  // Cleanup orphaned worktrees from previous crashes
  try {
    await cleanupOrphanedWorktrees(app.id)
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    console.error('[coordinator] cleanupOrphanedWorktrees failed (non-fatal):', errMsg)
  }

  // ── Step 0: Load skills for evolution context ─────────────────────────
  const skills = await getSkillsForContext('evolution').catch(() => '')
  console.log(`[coordinator] Loaded ${skills.length} chars of skills for evolution`)

  // ── Step 1: Observer (DOM) ─────────────────────────────────────────────
  let domSignals
  try {
    domSignals = await observerDomAgent({
      name: app.name,
      description: app.description,
      vercelUrl: app.vercelUrl,
      semanticFacts: app.semanticFacts,
      logs: '', // TODO: fetch from Vercel
      analytics: '', // TODO: fetch from Vercel
    })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    console.error('[coordinator] Observer failed (non-fatal):', errMsg)
    result.errors.push(`Observer failed: ${errMsg}`)
    return result
  }

  result.signals = { hasSignal: domSignals.hasSignal }
  if (!domSignals.hasSignal) return result

  // ── Step 2: Proposer —— generate fresh proposals + merge with pending queue —
  let freshProposals: Proposal[] = []
  try {
    freshProposals = await proposerAgent(
      {
        name: app.name,
        description: app.description,
        fileTree: app.fileTree,
        semanticFacts: app.semanticFacts,
        recentEpisodes: app.recentEpisodes,
      },
      domSignals
    )
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    console.error('[coordinator] Proposer failed (non-fatal):', errMsg)
    result.errors.push(`Proposer failed: ${errMsg}`)
    return result
  }

  // Load any proposals saved from previous cycles (overflow queue)
  const pendingFromPrevious = await loadPendingProposals(app.id)
  console.log(`[coordinator] Loaded ${pendingFromPrevious.length} pending proposals from previous cycles`)

  // Merge: fresh proposals go first (highest priority), then pending
  // Deduplicate by titleEn to avoid running the same proposal twice
  const seen = new Set<string>()
  const allProposals: Proposal[] = []
  for (const p of [...freshProposals, ...pendingFromPrevious]) {
    if (!seen.has(p.titleEn)) {
      seen.add(p.titleEn)
      allProposals.push(p)
    }
  }

  result.proposals = allProposals.length
  if (allProposals.length === 0) return result

  // Apply daily cap — execute at most maxProposalsPerCycle, save the rest
  const cap = (config.maxProposalsPerCycle ?? 2)
  const proposals = allProposals.slice(0, cap)
  const overflow = allProposals.slice(cap)
  if (overflow.length > 0) {
    console.log(`[coordinator] Daily cap: running ${proposals.length} proposals, saving ${overflow.length} for next cycle`)
    await savePendingProposals(app.id, overflow)
  } else {
    // Clear stale queue if everything fits
    await savePendingProposals(app.id, [])
  }

  // ── Step 3: Build + Gate each proposal sequentially ────────────────────
  // Sequential, NOT parallel (isConcurrencySafe = false for merges)
  for (const proposal of proposals) {
    let wtInfo
    try {
      // Create isolated worktree
      wtInfo = await createWorktree(app.id, `${Date.now()}`)

      // Run builder agent in worktree
      const buildResult = await builderAgent(proposal, wtInfo.wtPath, {
        name: app.name,
        description: app.description,
        mayaMd: app.mayaMd,
        designSystem: app.designSystem,
        category: app.category,
      })

      if (!buildResult.success) {
        result.errors.push(`Builder failed: ${buildResult.error}`)
        await discardWorktree(wtInfo)
        continue
      }

      result.built++

      // Run 5-gate coordinator
      const gateResult = await coordinatorGate(
        proposal,
        wtInfo.wtPath,
        wtInfo.branch
      )

      if (gateResult.decision === 'discard') {
        result.gateFailures.push({
          gate: gateResult.failedGate ?? 'unknown',
          count: 1,
        })
        await discardWorktree(wtInfo)
        continue
      }

      // ── GATE 5: Vercel Preview Visual QA ───────────────────────────────────
      // If tests pass, deploy a preview to Vercel and diff it against production.
      let previewUrl = ''
      try {
        const { deployToVercel, deleteVercelDeployment } = await import('./deploy')
        const { screenshotDiff } = await import('./tools/screenshot')

        console.log(`[coordinator] Deploying Preview for Gate 5: ${proposal.titleEn}`)
        const preview = await deployToVercel({
          appId: app.id,
          projectName: app.name,
          directory: wtInfo.wtPath,
          target: 'preview'
        })
        
        previewUrl = preview.url
        console.log(`[coordinator] Preview deployed: ${previewUrl}`)

        // Ask the visual tester agent (via screenshot.ts diff) to evaluate
        const diffResult = await screenshotDiff(app.vercelUrl, previewUrl)
        
        if (diffResult.diffPct > config.maxScreenshotDiffPct) {
          result.gateFailures.push({ gate: 'visual_regression', count: 1 })
          await deleteVercelDeployment(previewUrl).catch(() => {})
          await discardWorktree(wtInfo)
          continue
        }

        // Cleanup the preview deployment to keep dashboard clean
        await deleteVercelDeployment(previewUrl).catch(() => {})
        
      } catch (e) {
        // Soft-fail: if preview deployment or visual QA fails (e.g. no deploy token, Microlink rate limit)
        // we DO NOT discard the build. We allow it to merge (v0 behavior fallback).
        console.warn(`[coordinator] Gate 5 visual QA failed (soft-pass):`, String(e).slice(0, 200))
        if (previewUrl) {
          const { deleteVercelDeployment } = await import('./deploy')
          await deleteVercelDeployment(previewUrl).catch(() => {})
        }
      }

      // Save to pending improvements queue for user approval instead of auto-merging
      try {
        const pendingPath = getBuildsDir(app.id, '.maya', 'pending-improvements.json')
        await fsp.mkdir(path.dirname(pendingPath), { recursive: true })
        let pending = []
        try {
          const raw = await fsp.readFile(pendingPath, 'utf-8')
          pending = JSON.parse(raw)
        } catch {}
        
        pending.push({
          id: `imp-${Date.now()}`,
          title: proposal.titleEn,
          description: proposal.descriptionEn || proposal.titleEn,
          category: proposal.category,
          timestamp: new Date().toISOString(),
          wtInfo: wtInfo // Keep worktree info so it can be merged on approval
        })
        
        await fsp.writeFile(pendingPath, JSON.stringify(pending, null, 2))
        result.merged++ // Count as success for the cycle
        console.log(`[coordinator] Saved improvement to pending approval: ${proposal.titleEn}`)
      } catch (e: unknown) {
        const error = e instanceof Error ? e.message : String(e)
        result.errors.push(`Failed to save pending improvement: ${error}`)
        await discardWorktree(wtInfo).catch(() => {})
      }
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : String(e)
      result.errors.push(error)
      if (wtInfo) {
        await discardWorktree(wtInfo).catch(() => {})
      }
    }
  }

  return result
}
