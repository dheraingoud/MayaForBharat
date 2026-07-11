import { describe, it, expect } from 'vitest'
import { content } from '@/lib/translations'
import type { Content } from '@/lib/translations'

describe('translations', () => {
  it('exports hi and en locales', () => {
    expect(content.hi).toBeDefined()
    expect(content.en).toBeDefined()
  })
})

describe('Structural symmetry between hi and en', () => {
  function getKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    const keys: string[] = []
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        keys.push(...getKeys(v as Record<string, unknown>, path))
      } else {
        keys.push(path)
      }
    }
    return keys
  }

  it('hi and en have the same top-level sections', () => {
    const hiSections = Object.keys(content.hi).sort()
    const enSections = Object.keys(content.en).sort()
    expect(hiSections).toEqual(enSections)
  })

  it('nav section has matching keys', () => {
    expect(Object.keys(content.hi.nav).sort()).toEqual(Object.keys(content.en.nav).sort())
  })

  it('hero section has matching keys', () => {
    expect(Object.keys(content.hi.hero).sort()).toEqual(Object.keys(content.en.hero).sort())
  })

  it('features items have same count', () => {
    expect(content.hi.features.items).toHaveLength(content.en.features.items.length)
  })

  it('dashboard section has matching keys', () => {
    expect(Object.keys(content.hi.dashboard).sort()).toEqual(Object.keys(content.en.dashboard).sort())
  })

  it('record section has matching keys', () => {
    expect(Object.keys(content.hi.record).sort()).toEqual(Object.keys(content.en.record).sort())
  })

  it('builder section has matching keys', () => {
    expect(Object.keys(content.hi.builder).sort()).toEqual(Object.keys(content.en.builder).sort())
  })

  it('approval section has matching keys', () => {
    expect(Object.keys(content.hi.approval).sort()).toEqual(Object.keys(content.en.approval).sort())
  })

  it('evolution section has matching keys', () => {
    expect(Object.keys(content.hi.evolution).sort()).toEqual(Object.keys(content.en.evolution).sort())
  })

  it('uiComponents section has matching keys', () => {
    expect(Object.keys(content.hi.uiComponents).sort()).toEqual(Object.keys(content.en.uiComponents).sort())
  })

  it('apps section has matching keys', () => {
    expect(Object.keys(content.hi.apps).sort()).toEqual(Object.keys(content.en.apps).sort())
  })
})

describe('Hindi content (hi)', () => {
  it('hero has 3 headline parts', () => {
    expect(content.hi.hero.headline).toHaveLength(3)
  })

  it('features has 3 items', () => {
    expect(content.hi.features.items).toHaveLength(3)
    for (const item of content.hi.features.items) {
      expect(item.title).toBeTruthy()
      expect(item.description).toBeTruthy()
      expect(item.icon).toBeTruthy()
    }
  })

  it('has 3 evolution entries', () => {
    expect(content.hi.evolutionEntries.entry1_title).toBeTruthy()
    expect(content.hi.evolutionEntries.entry2_title).toBeTruthy()
    expect(content.hi.evolutionEntries.entry3_title).toBeTruthy()
  })

  it('has 3 app examples', () => {
    expect(content.hi.apps.ramKirana.name).toBeTruthy()
    expect(content.hi.apps.shyamTailors.name).toBeTruthy()
    expect(content.hi.apps.dairyPlus.name).toBeTruthy()
  })

  it('uses Devanagari script for Hindi content', () => {
    const devanagariRegex = /[\u0900-\u097F]/
    expect(devanagariRegex.test(content.hi.hero.label)).toBe(true)
    expect(devanagariRegex.test(content.hi.hero.description)).toBe(true)
  })
})

describe('English content (en)', () => {
  it('hero has 3 headline parts', () => {
    expect(content.en.hero.headline).toHaveLength(3)
    expect(content.en.hero.headline[0]).toBe('Speak.')
  })

  it('features has 3 items', () => {
    expect(content.en.features.items).toHaveLength(3)
    expect(content.en.features.items[0].title).toBe('Speak')
    expect(content.en.features.items[1].title).toBe('Build')
    expect(content.en.features.items[2].title).toBe('Sleep')
  })

  it('CTA has start text', () => {
    expect(content.en.cta.start).toBe('Start Today')
    expect(content.en.cta.button).toBe('Build Free Now')
  })

  it('record section has error template', () => {
    expect(content.en.record.error).toContain('{}')
  })
})

describe('No empty translations', () => {
  function findEmpty(obj: unknown, path = ''): string[] {
    const empties: string[] = []
    if (typeof obj === 'string') {
      if (obj.trim() === '') empties.push(path)
    } else if (Array.isArray(obj)) {
      obj.forEach((item, i) => empties.push(...findEmpty(item, `${path}[${i}]`)))
    } else if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        empties.push(...findEmpty(v, `${path}.${k}`))
      }
    }
    return empties
  }

  it('Hindi has no empty strings', () => {
    const empties = findEmpty(content.hi, 'hi')
    expect(empties).toEqual([])
  })

  it('English has no empty strings', () => {
    const empties = findEmpty(content.en, 'en')
    expect(empties).toEqual([])
  })
})
