import { describe, it, expect } from 'vitest'
import {
  getPromptTemplate,
  getBuilderContext,
  getIntentHint,
  MAYA_REGISTRY,
  STACK_CONTRACT,
} from '@/lib/prompts/templates'
import type { BusinessCategory, PromptTemplate } from '@/lib/prompts/templates'

describe('getPromptTemplate', () => {
  const ALL_CATEGORIES: BusinessCategory[] = [
    'kirana', 'tailor', 'dairy', 'pharmacy', 'electronics', 'restaurant', 'other',
  ]

  it('returns a template for each business category', () => {
    for (const cat of ALL_CATEGORIES) {
      const tmpl = getPromptTemplate(cat)
      expect(tmpl.category).toBe(cat)
      expect(tmpl.intentHint).toBeTruthy()
      expect(tmpl.builderContext).toBeTruthy()
      expect(tmpl.observerContext).toBeTruthy()
      expect(tmpl.proposerExamples).toBeTruthy()
      expect(tmpl.suggestedPages.length).toBeGreaterThanOrEqual(3)
      expect(tmpl.dataFieldHints.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('falls back to "other" for unknown categories', () => {
    const tmpl = getPromptTemplate('spaceshop')
    expect(tmpl.category).toBe('other')
    expect(tmpl.suggestedPages).toContain('Dashboard')
  })

  it('falls back to "other" for empty/undefined', () => {
    const tmpl = getPromptTemplate('')
    expect(tmpl.category).toBe('other')
  })

  it('normalizes common aliases', () => {
    const aliases: [string, BusinessCategory][] = [
      ['grocer', 'kirana'],
      ['general', 'kirana'],
      ['darzi', 'tailor'],
      ['sewing', 'tailor'],
      ['milk', 'dairy'],
      ['chemist', 'pharmacy'],
      ['medical', 'pharmacy'],
      ['mobile', 'electronics'],
      ['dhaba', 'restaurant'],
      ['hotel', 'restaurant'],
      ['cafe', 'restaurant'],
      ['food', 'restaurant'],
    ]
    for (const [alias, expected] of aliases) {
      const tmpl = getPromptTemplate(alias)
      expect(tmpl.category).toBe(expected)
    }
  })
})

describe('getBuilderContext', () => {
  it('returns builder-specific context', () => {
    const ctx = getBuilderContext('kirana')
    expect(ctx).toContain('Kirana')
    expect(ctx).toContain('Stock')
  })

  it('restaurant context mentions menu', () => {
    const ctx = getBuilderContext('restaurant')
    expect(ctx).toContain('Menu')
    expect(ctx).toContain('Table')
  })
})

describe('getIntentHint', () => {
  it('returns Hindi terms for kirana', () => {
    const hint = getIntentHint('kirana')
    expect(hint).toContain('किराने')
    expect(hint).toContain('stock')
  })

  it('returns tailor-specific fields', () => {
    const hint = getIntentHint('tailor')
    expect(hint).toContain('measurement')
    expect(hint).toContain('दर्जी')
  })

  it('pharmacy mentions expiry and batch', () => {
    const hint = getIntentHint('pharmacy')
    expect(hint).toContain('expiry')
    expect(hint).toContain('batch')
  })
})

describe('PromptTemplate structure', () => {
  it('suggestedPages always starts with Dashboard', () => {
    const categories: BusinessCategory[] = [
      'kirana', 'tailor', 'dairy', 'pharmacy', 'electronics', 'restaurant', 'other',
    ]
    for (const cat of categories) {
      const tmpl = getPromptTemplate(cat)
      expect(tmpl.suggestedPages[0]).toBe('Dashboard')
    }
  })

  it('dataFieldHints have name and type', () => {
    const tmpl = getPromptTemplate('pharmacy')
    for (const field of tmpl.dataFieldHints) {
      expect(field.name).toBeTruthy()
      expect(field.type).toBeTruthy()
      expect(['string', 'number', 'date', 'boolean']).toContain(field.type)
    }
  })

  it('pharmacy dataFieldHints include medicine-specific fields', () => {
    const tmpl = getPromptTemplate('pharmacy')
    const names = tmpl.dataFieldHints.map(f => f.name)
    expect(names).toContain('medicineName')
    expect(names).toContain('batchNo')
    expect(names).toContain('expiryDate')
  })
})

describe('MAYA_REGISTRY constant', () => {
  it('contains shadcn component imports', () => {
    expect(MAYA_REGISTRY).toContain('Button')
    expect(MAYA_REGISTRY).toContain('Card')
    expect(MAYA_REGISTRY).toContain('Table')
    expect(MAYA_REGISTRY).toContain('Dialog')
    expect(MAYA_REGISTRY).toContain('Input')
  })

  it('contains Zustand store pattern', () => {
    expect(MAYA_REGISTRY).toContain('zustand')
    expect(MAYA_REGISTRY).toContain('create')
  })
})

describe('STACK_CONTRACT constant', () => {
  it('specifies Next.js 15', () => {
    expect(STACK_CONTRACT).toContain('Next.js 15')
  })

  it('specifies React 19', () => {
    expect(STACK_CONTRACT).toContain('React 19')
  })

  it('specifies Tailwind CSS', () => {
    expect(STACK_CONTRACT).toContain('Tailwind CSS')
  })
})
