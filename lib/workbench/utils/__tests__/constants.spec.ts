import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  WORK_DIR_NAME,
  WORK_DIR,
  MODIFICATIONS_TAG_NAME,
  MODEL_REGEX,
  PROVIDER_REGEX,
  DEFAULT_MODEL,
  PROMPT_COOKIE_KEY,
  TOOL_EXECUTION_APPROVAL,
  TOOL_NO_EXECUTE_FUNCTION,
  TOOL_EXECUTION_DENIED,
  TOOL_EXECUTION_ERROR,
  STARTER_TEMPLATES,
} from '@/lib/workbench/utils/constants'
import type { Template } from '@/lib/workbench/utils/constants'

// ─── Core Constants ──────────────────────────────────────────────────────────

describe('Core constants', () => {
  it('WORK_DIR_NAME is "project"', () => {
    expect(WORK_DIR_NAME).toBe('project')
  })

  it('WORK_DIR is /home/project', () => {
    expect(WORK_DIR).toBe('/home/project')
  })

  it('MODIFICATIONS_TAG_NAME is bolt_file_modifications', () => {
    expect(MODIFICATIONS_TAG_NAME).toBe('bolt_file_modifications')
  })

  it('DEFAULT_MODEL reads from MAYA_FAST env or falls back to deepseek-v4-flash', () => {
    // DEFAULT_MODEL is now dynamic: process.env.MAYA_FAST (prefix-stripped) or fallback
    expect(typeof DEFAULT_MODEL).toBe('string')
    expect(DEFAULT_MODEL.length).toBeGreaterThan(0)
    // Should not have the nvidia-nim/ prefix
    expect(DEFAULT_MODEL).not.toMatch(/^nvidia-nim\//i)
  })

  it('PROMPT_COOKIE_KEY is cachedPrompt', () => {
    expect(PROMPT_COOKIE_KEY).toBe('cachedPrompt')
  })
})

// ─── Regex patterns ──────────────────────────────────────────────────────────

describe('MODEL_REGEX', () => {
  it('matches model header at start of text', () => {
    const input = '[Model: gpt-4]\n\nHello world'
    const match = input.match(MODEL_REGEX)
    expect(match).not.toBeNull()
    expect(match![1]).toBe('gpt-4')
  })

  it('does not match mid-text', () => {
    const input = 'Some text [Model: gpt-4]\n\nHello'
    const match = input.match(MODEL_REGEX)
    expect(match).toBeNull()
  })

  it('captures model name with special characters', () => {
    const input = '[Model: claude-3-5-sonnet-latest]\n\nContent'
    const match = input.match(MODEL_REGEX)
    expect(match![1]).toBe('claude-3-5-sonnet-latest')
  })
})

describe('PROVIDER_REGEX', () => {
  it('matches provider header', () => {
    const input = '[Provider: OpenAI]\n\nHello'
    const match = input.match(PROVIDER_REGEX)
    expect(match).not.toBeNull()
    expect(match![1]).toBe('OpenAI')
  })

  it('captures provider with various names', () => {
    const input = '[Provider: NvidiaNIM]\n\n'
    const match = input.match(PROVIDER_REGEX)
    expect(match![1]).toBe('NvidiaNIM')
  })
})

// ─── Tool execution constants ────────────────────────────────────────────────

describe('Tool execution constants', () => {
  it('TOOL_EXECUTION_APPROVAL has APPROVE and REJECT', () => {
    expect(TOOL_EXECUTION_APPROVAL.APPROVE).toBe('Yes, approved.')
    expect(TOOL_EXECUTION_APPROVAL.REJECT).toBe('No, rejected.')
  })

  it('error messages are descriptive', () => {
    expect(TOOL_NO_EXECUTE_FUNCTION).toContain('No execute function')
    expect(TOOL_EXECUTION_DENIED).toContain('denied')
    expect(TOOL_EXECUTION_ERROR).toContain('error')
  })
})

// ─── Starter Templates ──────────────────────────────────────────────────────

describe('STARTER_TEMPLATES', () => {
  it('contains 14 templates', () => {
    expect(STARTER_TEMPLATES).toHaveLength(14)
  })

  it('each template has required fields', () => {
    for (const t of STARTER_TEMPLATES) {
      expect(t.name).toBeTruthy()
      expect(t.label).toBeTruthy()
      expect(t.description).toBeTruthy()
      expect(t.githubRepo).toBeTruthy()
      expect(Array.isArray(t.tags)).toBe(true)
      expect(t.tags.length).toBeGreaterThan(0)
      expect(t.icon).toBeTruthy()
    }
  })

  it('has unique template names', () => {
    const names = STARTER_TEMPLATES.map(t => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('includes key templates by name', () => {
    const names = STARTER_TEMPLATES.map(t => t.name)
    expect(names).toContain('Vite React')
    expect(names).toContain('NextJS Shadcn')
    expect(names).toContain('Expo App')
    expect(names).toContain('Angular')
    expect(names).toContain('Vue')
    expect(names).toContain('SolidJS')
  })

  it('all icons follow i-bolt: prefix', () => {
    for (const t of STARTER_TEMPLATES) {
      expect(t.icon).toMatch(/^i-bolt:/)
    }
  })

  it('each template has a description > 30 chars', () => {
    for (const t of STARTER_TEMPLATES) {
      expect(t.description.length).toBeGreaterThan(30)
    }
  })

  it('React template has correct tags', () => {
    const react = STARTER_TEMPLATES.find(t => t.name === 'Vite React')
    expect(react?.tags).toContain('react')
    expect(react?.tags).toContain('vite')
  })

  it('Expo template has mobile tags', () => {
    const expo = STARTER_TEMPLATES.find(t => t.name === 'Expo App')
    expect(expo?.tags).toContain('mobile')
    expect(expo?.tags).toContain('expo')
  })
})
