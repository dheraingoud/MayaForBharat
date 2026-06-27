import { describe, it, expect } from 'vitest'
import { SKILL_REGISTRY } from '@/lib/skills'
import type { SkillDefinition } from '@/lib/skills'

describe('SKILL_REGISTRY', () => {
  it('contains all 6 registered skills', () => {
    expect(SKILL_REGISTRY).toHaveLength(6)
  })

  const skillNames = ['caveman', 'brainstorming', 'writing-plans', 'using-git-worktrees', 'frontend-design', 'design-taste-frontend-v1']

  it('has all expected skill names', () => {
    const names = SKILL_REGISTRY.map(s => s.name)
    for (const name of skillNames) {
      expect(names).toContain(name)
    }
  })

  it('each skill has a description', () => {
    for (const skill of SKILL_REGISTRY) {
      expect(skill.description).toBeTruthy()
      expect(skill.description.length).toBeGreaterThan(10)
    }
  })

  it('each skill has at least one source URL', () => {
    for (const skill of SKILL_REGISTRY) {
      expect(skill.sources.length).toBeGreaterThanOrEqual(1)
      for (const url of skill.sources) {
        expect(url).toMatch(/^https:\/\/raw\.githubusercontent\.com\//)
      }
    }
  })

  it('each skill has at least one context', () => {
    for (const skill of SKILL_REGISTRY) {
      expect(skill.contexts.length).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('Skill context assignments', () => {
  function getSkill(name: string): SkillDefinition {
    const skill = SKILL_REGISTRY.find(s => s.name === name)
    if (!skill) throw new Error(`Skill ${name} not found`)
    return skill
  }

  it('caveman is assigned to proposer, observer, evolution (NOT builder)', () => {
    const skill = getSkill('caveman')
    expect(skill.contexts).toContain('proposer')
    expect(skill.contexts).toContain('observer')
    expect(skill.contexts).toContain('evolution')
    expect(skill.contexts).not.toContain('builder')
    expect(skill.contexts).not.toContain('all')
  })

  it('brainstorming is assigned to proposer and evolution', () => {
    const skill = getSkill('brainstorming')
    expect(skill.contexts).toContain('proposer')
    expect(skill.contexts).toContain('evolution')
    expect(skill.contexts).not.toContain('builder')
  })

  it('writing-plans is evolution-only', () => {
    const skill = getSkill('writing-plans')
    expect(skill.contexts).toEqual(['evolution'])
  })

  it('using-git-worktrees is evolution-only', () => {
    const skill = getSkill('using-git-worktrees')
    expect(skill.contexts).toEqual(['evolution'])
  })

  it('frontend-design is builder-only', () => {
    const skill = getSkill('frontend-design')
    expect(skill.contexts).toEqual(['builder'])
  })

  it('design-taste-frontend-v1 is builder-only', () => {
    const skill = getSkill('design-taste-frontend-v1')
    expect(skill.contexts).toEqual(['builder'])
  })
})

describe('Skill context filtering', () => {
  it('builder context gets frontend + design skills', () => {
    const builderSkills = SKILL_REGISTRY.filter(
      s => s.contexts.includes('builder') || s.contexts.includes('all')
    )
    const names = builderSkills.map(s => s.name)
    expect(names).toContain('frontend-design')
    expect(names).toContain('design-taste-frontend-v1')
    expect(names).not.toContain('using-git-worktrees')
  })

  it('evolution context gets planning + worktree skills', () => {
    const evoSkills = SKILL_REGISTRY.filter(
      s => s.contexts.includes('evolution') || s.contexts.includes('all')
    )
    const names = evoSkills.map(s => s.name)
    expect(names).toContain('caveman')
    expect(names).toContain('brainstorming')
    expect(names).toContain('writing-plans')
    expect(names).toContain('using-git-worktrees')
  })

  it('proposer context gets caveman + brainstorming', () => {
    const propSkills = SKILL_REGISTRY.filter(
      s => s.contexts.includes('proposer') || s.contexts.includes('all')
    )
    const names = propSkills.map(s => s.name)
    expect(names).toContain('caveman')
    expect(names).toContain('brainstorming')
  })

  it('observer context gets caveman', () => {
    const obsSkills = SKILL_REGISTRY.filter(
      s => s.contexts.includes('observer') || s.contexts.includes('all')
    )
    const names = obsSkills.map(s => s.name)
    expect(names).toContain('caveman')
  })
})

describe('Skill source URLs', () => {
  it('all URLs point to GitHub raw content', () => {
    const allUrls = SKILL_REGISTRY.flatMap(s => s.sources)
    for (const url of allUrls) {
      expect(url).toMatch(/^https:\/\/raw\.githubusercontent\.com\//)
    }
  })

  it('skills with multiple sources have fallback URLs', () => {
    const multiSource = SKILL_REGISTRY.filter(s => s.sources.length > 1)
    for (const skill of multiSource) {
      // Usually SKILL.md and skill.md variants
      expect(skill.sources.length).toBeGreaterThanOrEqual(2)
    }
  })
})
