/**
 * MAYA Skills — Runtime GitHub Skill/Plugin Pull System
 *
 * Skills are Markdown files hosted on GitHub that get fetched at runtime
 * and injected into agent system prompts to enhance capabilities.
 *
 * Skill sources:
 * - caveman: Compressed prompt engineering (github.com/JuliusBrussee/caveman)
 * - superpowers: Brainstorming, planning, git-worktrees (github.com/obra/superpowers)
 * - frontend-design: Anthropic's frontend design skill
 * - ui-ux-pro-max: UI/UX design excellence (github.com/nextlevelbuilder/ui-ux-pro-max-skill)
 *
 * Cache: Skills cached in .maya-builds/.skills/ with 24h TTL
 */

import { promises as fs } from 'fs'
import path from 'path'

// ─── Skill Registry ───────────────────────────────────────────────────────────

export interface SkillDefinition {
  name: string
  description: string
  /** GitHub raw content URLs to fetch */
  sources: string[]
  /** Which agent contexts this skill applies to */
  contexts: ('builder' | 'proposer' | 'observer' | 'evolution' | 'all')[]
  /** Whether to compress the skill content (caveman-style) */
  compress?: boolean
}

export const SKILL_REGISTRY: SkillDefinition[] = [
  {
    name: 'caveman',
    description: 'Compressed prompt engineering — terse, high-signal instructions',
    sources: [
      'https://raw.githubusercontent.com/JuliusBrussee/caveman/main/SKILL.md',
      'https://raw.githubusercontent.com/JuliusBrussee/caveman/main/README.md',
    ],
    contexts: ['all'],
    compress: false, // already compressed
  },
  {
    name: 'brainstorming',
    description: 'Superpowers brainstorming — Socratic design exploration before coding',
    sources: [
      'https://raw.githubusercontent.com/obra/superpowers/main/skills/brainstorming/SKILL.md',
      'https://raw.githubusercontent.com/obra/superpowers/main/skills/brainstorming/skill.md',
    ],
    contexts: ['proposer', 'evolution'],
  },
  {
    name: 'writing-plans',
    description: 'Superpowers planning — decompose work into bite-sized actionable tasks',
    sources: [
      'https://raw.githubusercontent.com/obra/superpowers/main/skills/writing-plans/SKILL.md',
      'https://raw.githubusercontent.com/obra/superpowers/main/skills/writing-plans/skill.md',
    ],
    contexts: ['builder', 'evolution'],
  },
  {
    name: 'using-git-worktrees',
    description: 'Superpowers worktrees — isolated workspace management for evolution',
    sources: [
      'https://raw.githubusercontent.com/obra/superpowers/main/skills/using-git-worktrees/SKILL.md',
      'https://raw.githubusercontent.com/obra/superpowers/main/skills/using-git-worktrees/skill.md',
    ],
    contexts: ['builder', 'evolution'],
  },
  {
    name: 'frontend-design',
    description: 'Anthropic frontend design — professional UI/UX patterns from Claude Code',
    sources: [
      'https://raw.githubusercontent.com/anthropics/claude-code/main/plugins/frontend-design/skills/frontend-design/SKILL.md',
    ],
    contexts: ['builder'],
  },
  {
    name: 'ui-ux-pro-max',
    description: 'UI/UX Pro Max — advanced design system patterns and component excellence',
    sources: [
      'https://raw.githubusercontent.com/nextlevelbuilder/ui-ux-pro-max-skill/main/SKILL.md',
      'https://raw.githubusercontent.com/nextlevelbuilder/ui-ux-pro-max-skill/main/skill.md',
      'https://raw.githubusercontent.com/nextlevelbuilder/ui-ux-pro-max-skill/main/README.md',
    ],
    contexts: ['builder'],
  },
]

// ─── Cache Management ─────────────────────────────────────────────────────────

import { getBuildsDir } from '@/lib/path'

const SKILLS_CACHE_DIR = getBuildsDir('.skills')
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface CachedSkill {
  name: string
  content: string
  fetchedAt: number
  source: string
}

async function getCachePath(name: string): Promise<string> {
  await fs.mkdir(SKILLS_CACHE_DIR, { recursive: true })
  return path.join(SKILLS_CACHE_DIR, `${name}.json`)
}

async function readCachedSkill(name: string): Promise<CachedSkill | null> {
  try {
    const raw = await fs.readFile(await getCachePath(name), 'utf-8')
    const cached: CachedSkill = JSON.parse(raw)
    // Check TTL
    if (Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached
    }
    return null // stale
  } catch {
    return null
  }
}

async function writeCachedSkill(skill: CachedSkill): Promise<void> {
  await fs.writeFile(await getCachePath(skill.name), JSON.stringify(skill, null, 2))
}

// ─── Fetch from GitHub ────────────────────────────────────────────────────────

async function fetchFromGitHub(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return null
    const text = await response.text()
    return text.trim().length > 0 ? text : null
  } catch {
    return null
  }
}

/**
 * Fetch a skill from GitHub, trying all source URLs in order.
 * Returns cached version if available and fresh.
 */
export async function fetchSkill(def: SkillDefinition): Promise<string | null> {
  // Check cache first
  const cached = await readCachedSkill(def.name)
  if (cached) {
    return cached.content
  }

  // Try each source URL
  for (const source of def.sources) {
    const content = await fetchFromGitHub(source)
    if (content) {
      // Cache it
      await writeCachedSkill({
        name: def.name,
        content,
        fetchedAt: Date.now(),
        source,
      }).catch(() => {}) // don't fail on cache write errors

      console.log(`[skills] Fetched ${def.name} from ${source} (${content.length} chars)`)
      return content
    }
  }

  console.warn(`[skills] Failed to fetch ${def.name} from any source`)
  return null
}

/**
 * Fetch all skills for a given agent context.
 * Returns a combined prompt string with skill delimiters.
 */
export async function getSkillsForContext(
  context: 'builder' | 'proposer' | 'observer' | 'evolution'
): Promise<string> {
  const applicable = SKILL_REGISTRY.filter(
    s => s.contexts.includes(context) || s.contexts.includes('all')
  )

  const results: string[] = []

  // Fetch all skills in parallel
  const fetched = await Promise.allSettled(
    applicable.map(async (def) => {
      const content = await fetchSkill(def)
      return { def, content }
    })
  )

  for (const result of fetched) {
    if (result.status === 'fulfilled' && result.value.content) {
      const { def, content } = result.value
      // Truncate very long skills to 4K chars to preserve context budget
      const truncated = content.length > 4000
        ? content.slice(0, 4000) + '\n... [truncated]'
        : content
      results.push(`\n--- SKILL: ${def.name} ---\n${truncated}\n--- END SKILL ---`)
    }
  }

  return results.length > 0
    ? `\n\n# Loaded Skills\n${results.join('\n')}`
    : ''
}

/**
 * List all registered skills with their cache status.
 */
export async function listSkills(): Promise<Array<{
  name: string
  description: string
  contexts: string[]
  cached: boolean
  stale: boolean
  cachedAt?: string
}>> {
  const results = []
  for (const def of SKILL_REGISTRY) {
    const cached = await readCachedSkill(def.name).catch(() => null)
    results.push({
      name: def.name,
      description: def.description,
      contexts: def.contexts,
      cached: cached !== null,
      stale: cached === null,
      cachedAt: cached ? new Date(cached.fetchedAt).toISOString() : undefined,
    })
  }
  return results
}

/**
 * Force-refresh a specific skill from GitHub.
 */
export async function refreshSkill(name: string): Promise<{ success: boolean; chars: number }> {
  const def = SKILL_REGISTRY.find(s => s.name === name)
  if (!def) return { success: false, chars: 0 }

  // Delete cache first
  try { await fs.unlink(await getCachePath(name)) } catch { /* ok */ }

  const content = await fetchSkill(def)
  return { success: !!content, chars: content?.length ?? 0 }
}
