/**
 * MAYA Builder Agent — Code generation in isolated worktrees
 * Model: deepseek-ai/deepseek-v4-flash (best agentic coder on NIM)
 *
 * Uses the full agent loop with tool calls for:
 * - Reading existing files for context
 * - Writing new/modified files
 * - Running build to verify
 * - Committing changes
 *
 * Operates ONLY in isolated git worktrees — never touches main.
 */

import { MODELS } from '../nim-client'
import { agentLoop } from '../agent-loop'
import { BUILDER_TOOLS } from '../tools/registry'
import type { Proposal } from './proposer'
import { getPromptTemplate } from '../prompts/templates'

export interface BuilderResult {
  success: boolean
  commitHash?: string
  filesModified: string[]
  error?: string
  toolCalls: number
  iterations: number
}

const DESIGN_SYSTEM_CONTEXT = `Design system (LOCKED — DO NOT DEVIATE):
- primary: #E8601A, background: #EFEFEF, surface: #ffffff, surface-2: #f4f4f5
- border: #e4e4e7, text-primary: #09090b, text-secondary: #3f3f46
- radius: rounded-xl, font: Hind (Hindi) / Noto Sans Devanagari (body) / JetBrains Mono (numbers)
- LIGHT THEME ONLY. Accent #E8601A only. Tailwind only.
- All user-facing text in HINDI. Numbers in Arabic numerals. Replace + for currency.
- Mobile-first. TypeScript strict.

Locked components (USE ONLY from @/components/ui/):
Button, Card, Input, Table, Layout, Badge
NEVER modify these files.`

export async function builderAgent(
  proposal: Proposal,
  worktreePath: string,
  appContext: {
    name: string
    description: string
    mayaMd: string
    designSystem: string
    category?: string
  }
): Promise<BuilderResult> {
  const bizCtx = appContext.category
    ? getPromptTemplate(appContext.category).builderContext
    : ''

  const systemPrompt = `You are MAYA's Builder Agent. Implement the proposed improvement in an isolated git worktree.

${DESIGN_SYSTEM_CONTEXT}

RULES:
- Max 150 lines diff (Gate 2 will reject more)
- Write Vitest test for every new feature (co-located: Feature.test.ts)
- Never modify files in components/ui/ or .interface-design/
- Never modify AGENTS.md
- Use existing component primitives only
- TypeScript strict mode — no any types
- Caveman comments only — brief, non-obvious

App context:
Name: ${appContext.name}
Description: ${appContext.description}
Design: ${appContext.designSystem}
${bizCtx ? `\nBiz context:\n${bizCtx}` : ''}

Working directory: ${worktreePath}

After implementing:
1. Read existing files that need modification
2. Write your changes
3. Run build to verify it compiles
4. Commit with message: "maya: ${proposal.titleEn}"

If build fails, read the error and fix it. Max 1 retry.`

  const userInput = `Implement this improvement:
Title: ${proposal.titleEn}
Category: ${proposal.category}
Description: ${proposal.description}
Files to modify: ${proposal.filesToModify.join(', ')}

App memory:
${appContext.mayaMd}`

  try {
    const result = await agentLoop({
      model: MODELS.BUILDER,
      systemPrompt,
      userInput,
      tools: BUILDER_TOOLS,
      maxIterations: 15,
      caveman: true,
    })

    // Check if a commit was made
    const commitMatch = result.content.match(/([a-f0-9]{7,40})/)

    return {
      success: true,
      commitHash: commitMatch?.[1],
      filesModified: proposal.filesToModify,
      toolCalls: result.toolCalls,
      iterations: result.iterations,
    }
  } catch (e: unknown) {
    return {
      success: false,
      filesModified: [],
      error: e instanceof Error ? e.message : String(e),
      toolCalls: 0,
      iterations: 0,
    }
  }
}

// ─── Fix Builder (for gh-fix-ci retry pattern) ────────────────────────────────

export async function fixBuilder(
  errorContext: string,
  worktreePath: string,
  gateType: 'build' | 'test'
): Promise<BuilderResult> {
  const systemPrompt = `You are MAYA's Fix Agent. Fix the ${gateType} failure in this worktree.

${DESIGN_SYSTEM_CONTEXT}

Working directory: ${worktreePath}

Rules:
- Fix ONLY the erroring file(s) — do NOT regenerate the whole app
- For test failures: fix the implementation, NOT the test
- Max token budget: half of normal (be concise)
- Commit with message: "maya: fix ${gateType} failure"`

  try {
    const result = await agentLoop({
      model: MODELS.FIX_ROUTER,
      systemPrompt,
      userInput: `${gateType === 'build' ? 'Build' : 'Test'} error output:\n${errorContext}`,
      tools: BUILDER_TOOLS,
      maxIterations: 8,
      maxTokensOverride: 4096,
      caveman: true,
    })

    return {
      success: true,
      filesModified: [],
      toolCalls: result.toolCalls,
      iterations: result.iterations,
    }
  } catch (e: unknown) {
    return {
      success: false,
      filesModified: [],
      error: e instanceof Error ? e.message : String(e),
      toolCalls: 0,
      iterations: 0,
    }
  }
}
