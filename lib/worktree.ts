/**
 * MAYA Git Worktree Manager
 *
 * Manages isolated git worktrees for evolution improvements.
 * Each proposal gets its own worktree + branch. Max 3 concurrent.
 *
 * Adapted from Claude Code's isConcurrencySafe pattern:
 * - Worktree creation: parallel OK (disk I/O only)
 * - Merges to main: sequential only (not concurrency safe)
 * - Cleanup: always runs, even on crash
 */

import simpleGit, { type SimpleGit } from 'simple-git'
import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'

const APPS_DIR = process.env.APPS_DIR || path.join(os.tmpdir(), 'maya-apps')
const MAX_WORKTREES = 3

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorktreeInfo {
  wtPath: string
  branch: string
  appId: string
  improveId?: string
}

// ─── Init App Repo ────────────────────────────────────────────────────────────

export async function initAppRepo(appId: string): Promise<string> {
  const mainPath = path.join(APPS_DIR, appId, 'main')
  await fs.mkdir(mainPath, { recursive: true })

  const git = simpleGit(mainPath)
  const isRepo = await git.checkIsRepo().catch(() => false)

  if (!isRepo) {
    await git.init()
    // Create initial commit so branches work
    await fs.writeFile(path.join(mainPath, '.gitkeep'), '')
    await git.add('.')
    await git.commit('maya: initial commit')
  }

  return mainPath
}

// ─── Create Worktree ──────────────────────────────────────────────────────────

export async function createWorktree(
  appId: string,
  improveId: string
): Promise<WorktreeInfo> {
  const mainPath = path.join(APPS_DIR, appId, 'main')
  const wtPath = path.join(APPS_DIR, appId, `wt-${improveId}`)
  const branch = `maya/improve-${improveId}`

  // Check worktree limit
  const existing = await listWorktrees(appId)
  if (existing.length >= MAX_WORKTREES) {
    throw new Error(`Max ${MAX_WORKTREES} worktrees reached for app ${appId}`)
  }

  const git = simpleGit(mainPath)

  // Clean up if exists from a previous crash
  try {
    await fs.access(wtPath)
    await git.raw(['worktree', 'remove', '--force', wtPath])
  } catch {
    // doesn't exist, good
  }

  // Delete branch if leftover
  try {
    await git.deleteLocalBranch(branch, true)
  } catch {
    // branch doesn't exist, good
  }

  await git.raw(['worktree', 'add', '-b', branch, wtPath])

  return { wtPath, branch, appId, improveId }
}

// ─── Discard Worktree ─────────────────────────────────────────────────────────

export async function discardWorktree(info: WorktreeInfo): Promise<void> {
  const mainPath = path.join(APPS_DIR, info.appId, 'main')
  const git = simpleGit(mainPath)

  try {
    await git.raw(['worktree', 'remove', '--force', info.wtPath])
  } catch {
    // Force cleanup if git fails
    try {
      await fs.rm(info.wtPath, { recursive: true, force: true })
      await git.raw(['worktree', 'prune'])
    } catch {
      // best effort
    }
  }

  try {
    await git.deleteLocalBranch(info.branch, true)
  } catch {
    // branch may not exist
  }
}

// ─── Merge Worktree to Main ───────────────────────────────────────────────────
// NOT concurrency safe — must be called sequentially

export async function mergeWorktree(
  info: WorktreeInfo,
  commitMessage: string
): Promise<{ success: boolean; error?: string }> {
  const mainPath = path.join(APPS_DIR, info.appId, 'main')
  const git = simpleGit(mainPath)

  try {
    await git.checkout('main')
    await git.merge([info.branch, '--squash'])
    await git.commit(commitMessage)

    // Cleanup worktree after successful merge
    await discardWorktree(info)

    return { success: true }
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    // Abort merge if it failed
    try {
      await git.merge(['--abort'])
    } catch {
      // no merge to abort
    }
    return { success: false, error }
  }
}

// ─── List Worktrees ───────────────────────────────────────────────────────────

export async function listWorktrees(appId: string): Promise<WorktreeInfo[]> {
  const mainPath = path.join(APPS_DIR, appId, 'main')

  try {
    const git = simpleGit(mainPath)
    const raw = await git.raw(['worktree', 'list', '--porcelain'])

    const worktrees: WorktreeInfo[] = []
    const entries = raw.split('\n\n').filter(Boolean)

    for (const entry of entries) {
      const wtMatch = entry.match(/worktree (.+)/)
      const branchMatch = entry.match(/branch refs\/heads\/(.+)/)

      if (wtMatch?.[1] && branchMatch?.[1]) {
        const wtPath = wtMatch[1]
        const branch = branchMatch[1]

        // Only include MAYA worktrees (not main)
        if (branch.startsWith('maya/improve-')) {
          const improveId = branch.replace('maya/improve-', '')
          worktrees.push({ wtPath, branch, appId, improveId })
        }
      }
    }

    return worktrees
  } catch {
    return []
  }
}

// ─── Cleanup Orphaned Worktrees ───────────────────────────────────────────────
// Claude Code pattern: clean up any leftover worktrees on startup

export async function cleanupOrphanedWorktrees(appId: string): Promise<number> {
  const worktrees = await listWorktrees(appId)
  let cleaned = 0

  for (const wt of worktrees) {
    // Check if worktree directory still exists
    try {
      await fs.access(wt.wtPath)
      // Check if it's been around for more than 2 hours (stale)
      const stat = await fs.stat(wt.wtPath)
      const ageMs = Date.now() - stat.mtimeMs
      if (ageMs > 2 * 60 * 60 * 1000) {
        await discardWorktree(wt)
        cleaned++
      }
    } catch {
      // Directory doesn't exist — prune the worktree reference
      const mainPath = path.join(APPS_DIR, appId, 'main')
      try {
        const git = simpleGit(mainPath)
        await git.raw(['worktree', 'prune'])
        cleaned++
      } catch {
        // best effort
      }
    }
  }

  return cleaned
}
