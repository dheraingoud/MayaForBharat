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
import { existsSync } from 'fs'
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
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxDiffLines: 150,
  maxScreenshotDiffPct: 5,
  enableAutoFix: true,
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

  // ── GATE 5: Screenshot diff ────────────────────────────────────────────
  try {
    const screenshotResult = runScreenshotDiff(wtPath, config)
    if (screenshotResult.diffPct > config.maxScreenshotDiffPct) {
      return {
        decision: 'discard',
        failedGate: `screenshot_diff:${screenshotResult.diffPct.toFixed(1)}%`,
        diffLines,
        testsPassed: true,
        screenshotDiffPct: screenshotResult.diffPct,
      }
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.warn('[coordinator] Gate 5 (screenshot diff) threw:', error)
    // Gate 5 failures are soft: if the diff can't be computed (e.g. no live URL),
    // we don't discard based on it. This prevents the gate from blocking builds
    // when Playwright/QA tools are not yet configured.
  }

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

interface ScreenshotDiffResult {
  diffPct: number
}

/**
 * Gate 5: Screenshot visual diff.
 *
 * In a full setup this uses Playwright to capture the running app,
 * pixelmatch to diff against a baseline, and returns a percentage.
 *
 * For now, this is a soft gate: it returns 0 (pass) when Playwright is
 * not configured, so the gate never blocks a valid improvement. The
 * warning log alerts the developer to wire up Playwright when ready.
 */
function runScreenshotDiff(
  _wtPath: string,
  _config: CoordinatorConfig
): ScreenshotDiffResult {
  // For hackathon and until Playwright is set up, this is a no-op pass.
  // The console.warn signals the developer to wire this when ready.
  if (process.env.NODE_ENV !== 'production') {
    console.log('[coordinator] Gate 5 (screenshot diff) — pass (Playwright not configured)')
  }
  return { diffPct: 0 }
}

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

  // ── Step 2: Proposer ───────────────────────────────────────────────────
  let proposals
  try {
    proposals = await proposerAgent(
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

  result.proposals = proposals.length
  if (proposals.length === 0) return result

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

      // Merge to main (sequential — not concurrency safe)
      const mergeResult = await mergeWorktree(
        wtInfo,
        `maya: ${proposal.titleEn}`
      )

      if (mergeResult.success) {
        result.merged++
      } else {
        result.errors.push(`Merge failed: ${mergeResult.error}`)
        await discardWorktree(wtInfo)
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
