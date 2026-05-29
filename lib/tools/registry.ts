/**
 * MAYA Tool Registry — Claude Code Tool.ts pattern
 *
 * Each tool has: Zod schema + permission model + execute + concurrency flag
 * Adapted from Claude Code's Tool interface (Tool.ts L362-695):
 * - inputSchema (Zod validation)
 * - checkPermissions (permission model)
 * - call (execution logic)
 * - isConcurrencySafe (parallel safety)
 */

import { z } from 'zod'

// ─── Tool Interface ───────────────────────────────────────────────────────────

export type PermissionLevel = 'read_only' | 'write_isolated' | 'write_main'

export interface MayaTool {
  name: string
  description: string
  schema: z.ZodType<Record<string, unknown>>
  permission: PermissionLevel
  isConcurrencySafe: boolean

  /** Check if this tool call is permitted in the current context */
  checkPermission(args: Record<string, unknown>): Promise<boolean>

  /** Execute the tool with validated arguments */
  execute(args: Record<string, unknown>): Promise<unknown>

  /** Convert to OpenAI function-calling format */
  toOpenAITool(): OpenAIToolDefinition
}

export interface OpenAIToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

// ─── Tool Builder ─────────────────────────────────────────────────────────────
// Mirrors Claude Code's buildTool() pattern (Tool.ts L783)

interface ToolConfig<T extends Record<string, unknown>> {
  name: string
  description: string
  schema: z.ZodType<T>
  parameters: Record<string, unknown> // JSON Schema for OpenAI
  permission: PermissionLevel
  isConcurrencySafe?: boolean
  execute: (args: T) => Promise<unknown>
  /** Custom permission check; defaults to always-allow for read_only */
  checkPermission?: (args: T) => Promise<boolean>
}

export function buildTool<T extends Record<string, unknown>>(
  config: ToolConfig<T>
): MayaTool {
  return {
    name: config.name,
    description: config.description,
    schema: config.schema as z.ZodType<Record<string, unknown>>,
    permission: config.permission,
    isConcurrencySafe: config.isConcurrencySafe ?? false,

    async checkPermission(args: Record<string, unknown>): Promise<boolean> {
      if (config.checkPermission) {
        return config.checkPermission(args as T)
      }
      // Default: read_only always allowed, write needs context
      return config.permission === 'read_only'
    },

    async execute(args: Record<string, unknown>): Promise<unknown> {
      // Validate with Zod before execution
      const parsed = config.schema.safeParse(args)
      if (!parsed.success) {
        throw new Error(`Validation failed: ${parsed.error.message}`)
      }
      return config.execute(parsed.data)
    },

    toOpenAITool(): OpenAIToolDefinition {
      return {
        type: 'function',
        function: {
          name: config.name,
          description: config.description,
          parameters: config.parameters,
        },
      }
    },
  }
}

// ─── Built-in Tools ───────────────────────────────────────────────────────────

import { promises as fs, existsSync } from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import os from 'os'

// ─── Package Manager Detection ────────────────────────────────────────────────

function detectPm(cwd: string): { runCmd: string; testCmd: string } {
  try {
    if (existsSync(path.join(cwd, 'bun.lockb')) || existsSync(path.join(cwd, 'bun.lock'))) {
      return { runCmd: 'bun run', testCmd: 'bun test' }
    }
    if (existsSync(path.join(cwd, 'pnpm-lock.yaml'))) {
      return { runCmd: 'pnpm run', testCmd: 'npx vitest run' }
    }
    if (existsSync(path.join(cwd, 'yarn.lock'))) {
      return { runCmd: 'yarn', testCmd: 'npx vitest run' }
    }
  } catch { /* ignore */ }
  return { runCmd: 'npm run', testCmd: 'npx vitest run' }
}

/** Read a file from a worktree */
export const readFileTool = buildTool({
  name: 'readFile',
  description: 'Read the contents of a file. Returns file content as string.',
  schema: z.object({
    path: z.string().describe('Absolute or relative path to the file'),
  }),
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute or relative path to the file' },
    },
    required: ['path'],
  },
  permission: 'read_only',
  isConcurrencySafe: true,
  async execute(args) {
    const content = await fs.readFile(args.path, 'utf-8')
    // Cap at 50K chars to prevent context explosion
    return content.length > 50000
      ? content.slice(0, 50000) + '\n... [truncated]'
      : content
  },
})

/** Write a file in a worktree */
export const writeFileTool = buildTool({
  name: 'writeFile',
  description: 'Write content to a file. Creates parent directories if needed.',
  schema: z.object({
    path: z.string().describe('Path to write to'),
    content: z.string().describe('File content to write'),
  }),
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to write to' },
      content: { type: 'string', description: 'File content to write' },
    },
    required: ['path', 'content'],
  },
  permission: 'write_isolated',
  isConcurrencySafe: false,
  async checkPermission(args) {
    // Never allow writing to locked paths
    const locked = ['/components/ui/', '/.interface-design/', '/AGENTS.md']
    return !locked.some(p => args.path.includes(p))
  },
  async execute(args) {
    await fs.mkdir(path.dirname(args.path), { recursive: true })
    await fs.writeFile(args.path, args.content, 'utf-8')
    return { written: args.path, bytes: args.content.length }
  },
})

/** List directory contents */
export const listFilesTool = buildTool({
  name: 'listFiles',
  description: 'List files and directories at a given path.',
  schema: z.object({
    path: z.string().describe('Directory path to list'),
    recursive: z.boolean().optional().describe('List recursively'),
  }),
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path to list' },
      recursive: { type: 'boolean', description: 'List recursively' },
    },
    required: ['path'],
  },
  permission: 'read_only',
  isConcurrencySafe: true,
  async execute(args) {
    if (args.recursive) {
      // Simple recursive listing, max 200 entries
      const entries: string[] = []
      async function walk(dir: string, depth = 0) {
        if (depth > 5 || entries.length >= 200) return
        const items = await fs.readdir(dir, { withFileTypes: true })
        for (const item of items) {
          if (item.name === 'node_modules' || item.name === '.next' || item.name === '.git') continue
          const fullPath = path.join(dir, item.name)
          const relPath = path.relative(args.path, fullPath)
          entries.push(item.isDirectory() ? `${relPath}/` : relPath)
          if (item.isDirectory()) await walk(fullPath, depth + 1)
        }
      }
      await walk(args.path)
      return entries
    }

    const items = await fs.readdir(args.path, { withFileTypes: true })
    return items
      .filter(i => !['node_modules', '.next', '.git'].includes(i.name))
      .map(i => i.isDirectory() ? `${i.name}/` : i.name)
  },
})

/** Run build in a directory */
export const runBuildTool = buildTool({
  name: 'runBuild',
  description: 'Run the build command in a directory. Returns success/failure with error output.',
  schema: z.object({
    cwd: z.string().describe('Working directory to run build in'),
  }),
  parameters: {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: 'Working directory to run build in' },
    },
    required: ['cwd'],
  },
  permission: 'read_only',
  isConcurrencySafe: false,
  async execute(args) {
    try {
      const pm = detectPm(args.cwd)
      const output = execSync(`${pm.runCmd} build`, {
        cwd: args.cwd,
        timeout: 120000,
        stdio: 'pipe',
        encoding: 'utf-8',
      })
      return { success: true, output: output.slice(-2000) }
    } catch (e: unknown) {
      const error = e as { stderr?: string; stdout?: string }
      return {
        success: false,
        error: (error.stderr ?? error.stdout ?? 'Unknown build error').slice(-2000),
      }
    }
  },
})

/** Run tests in a directory */
export const runTestsTool = buildTool({
  name: 'runTests',
  description: 'Run tests in a directory. Returns test results.',
  schema: z.object({
    cwd: z.string().describe('Working directory to run tests in'),
  }),
  parameters: {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: 'Working directory to run tests in' },
    },
    required: ['cwd'],
  },
  permission: 'read_only',
  isConcurrencySafe: false,
  async execute(args) {
    try {
      const pm = detectPm(args.cwd)
      const output = execSync(pm.testCmd, {
        cwd: args.cwd,
        timeout: 60000,
        stdio: 'pipe',
        encoding: 'utf-8',
      })
      return { success: true, output: output.slice(-2000) }
    } catch (e: unknown) {
      const error = e as { stderr?: string; stdout?: string }
      return {
        success: false,
        error: (error.stderr ?? error.stdout ?? 'Test execution failed').slice(-2000),
      }
    }
  },
})

/** Get git diff stats */
export const gitDiffTool = buildTool({
  name: 'gitDiff',
  description: 'Get git diff between current branch and main. Returns diff stats and content.',
  schema: z.object({
    cwd: z.string().describe('Git repository path'),
    branch: z.string().optional().describe('Branch to diff against (default: main)'),
  }),
  parameters: {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: 'Git repository path' },
      branch: { type: 'string', description: 'Branch to diff against (default: main)' },
    },
    required: ['cwd'],
  },
  permission: 'read_only',
  isConcurrencySafe: true,
  async execute(args) {
    const target = args.branch ?? 'main'
    try {
      const stat = execSync(`git diff ${target} --stat`, {
        cwd: args.cwd, encoding: 'utf-8', stdio: 'pipe',
      })
      const diff = execSync(`git diff ${target}`, {
        cwd: args.cwd, encoding: 'utf-8', stdio: 'pipe',
      })
      const insertions = parseInt(stat.match(/(\d+) insertions?/)?.[1] ?? '0')
      const deletions = parseInt(stat.match(/(\d+) deletions?/)?.[1] ?? '0')
      return {
        linesChanged: insertions + deletions,
        insertions,
        deletions,
        stat: stat.slice(-1000),
        diff: diff.slice(0, 10000),
      }
    } catch {
      return { linesChanged: 0, insertions: 0, deletions: 0, stat: '', diff: '' }
    }
  },
})

/** Git commit changes */
export const gitCommitTool = buildTool({
  name: 'gitCommit',
  description: 'Stage all changes and create a git commit.',
  schema: z.object({
    cwd: z.string().describe('Git repository path'),
    message: z.string().describe('Commit message'),
  }),
  parameters: {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: 'Git repository path' },
      message: { type: 'string', description: 'Commit message' },
    },
    required: ['cwd', 'message'],
  },
  permission: 'write_isolated',
  isConcurrencySafe: false,
  async checkPermission() { return true },
  async execute(args) {
    execSync('git add -A', { cwd: args.cwd, stdio: 'pipe' })
    execSync(`git commit -m "${args.message.replace(/"/g, '\\"')}"`, {
      cwd: args.cwd, stdio: 'pipe',
    })
    const hash = execSync('git rev-parse HEAD', {
      cwd: args.cwd, encoding: 'utf-8', stdio: 'pipe',
    }).trim()
    return { committed: true, hash }
  },
})

// ─── Tool Collections ─────────────────────────────────────────────────────────

import { takeScreenshotTool, takeSnapshotTool } from './screenshot'

/** All read-only tools (safe for parallel execution) */
export const READ_TOOLS: MayaTool[] = [readFileTool, listFilesTool, gitDiffTool]

/** Screenshot + snapshot tools for visual observer and Gate 5 */
export const SCREENSHOT_TOOLS: MayaTool[] = [takeScreenshotTool, takeSnapshotTool]

/** Observer tools — read + snapshot for DOM/visual analysis */
export const OBSERVER_TOOLS: MayaTool[] = [readFileTool, listFilesTool, takeSnapshotTool, takeScreenshotTool]

/** All tools for the Builder agent (includes screenshot for visual QA) */
export const BUILDER_TOOLS: MayaTool[] = [
  readFileTool,
  writeFileTool,
  listFilesTool,
  runBuildTool,
  runTestsTool,
  gitDiffTool,
  gitCommitTool,
  takeScreenshotTool,
  takeSnapshotTool,
]

/** Verification-only tools */
export const GATE_TOOLS: MayaTool[] = [runBuildTool, runTestsTool, gitDiffTool]
