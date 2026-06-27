// @ts-nocheck
import { describe, it, expect } from 'vitest'
import { content, t, tArr } from '@/lib/i18n/content'
import type { Lang } from '@/lib/i18n/content'

describe('i18n content structure', () => {
  const sections = Object.keys(content) as (keyof typeof content)[]

  it('has all major content sections', () => {
    const expected = [
      'nav', 'hero', 'howItWorks', 'showcase', 'footer',
      'auth', 'onboarding', 'dashboard', 'build', 'editor',
      'evolution', 'approve', 'settings', 'langGate', 'common',
    ]
    for (const section of expected) {
      expect(sections).toContain(section)
    }
  })

  it('has consistent en/hi pairs in nav', () => {
    expect(content.nav.links.en).toHaveLength(4)
    expect(content.nav.links.hi).toHaveLength(4)
    expect(content.nav.cta.en).toBeTruthy()
    expect(content.nav.cta.hi).toBeTruthy()
  })

  it('hero has 3 animation lines', () => {
    expect(content.hero.h1.en).toHaveLength(3)
    expect(content.hero.h1.hi).toHaveLength(3)
  })

  it('howItWorks has 3 steps', () => {
    expect(content.howItWorks.steps).toHaveLength(3)
    for (const step of content.howItWorks.steps) {
      expect(step.title.en).toBeTruthy()
      expect(step.title.hi).toBeTruthy()
      expect(step.body.en).toBeTruthy()
      expect(step.body.hi).toBeTruthy()
    }
  })

  it('showcase has 3 example cards', () => {
    expect(content.showcase.cards).toHaveLength(3)
    for (const card of content.showcase.cards) {
      expect(card.name).toBeTruthy()
      expect(card.type.en).toBeTruthy()
      expect(card.updates.en).toBeTruthy()
    }
  })

  it('build has 5 stages', () => {
    expect(content.build.stages).toHaveLength(5)
    for (const stage of content.build.stages) {
      expect(stage.en).toBeTruthy()
      expect(stage.hi).toBeTruthy()
    }
  })

  it('editor has quickChips with same count', () => {
    expect(content.editor.quickChips.en).toHaveLength(content.editor.quickChips.hi.length)
  })

  it('onboarding has 3 steps', () => {
    expect(content.onboarding.steps).toHaveLength(3)
  })
})

describe('t() accessor', () => {
  it('returns English text', () => {
    expect(t(content.nav.cta, 'en')).toBe('Build your app — free')
  })

  it('returns Hindi text', () => {
    expect(t(content.nav.cta, 'hi')).toBe('App banao — free mein')
  })

  it('works with common strings', () => {
    expect(t(content.common.loading, 'en')).toBe('Loading...')
    expect(t(content.common.error, 'hi')).toBe('Kuch galat hua')
  })
})

describe('tArr() accessor', () => {
  it('returns English array', () => {
    const links = tArr(content.nav.links, 'en')
    expect(links).toEqual(['How it works', 'Features', 'Examples', 'Contact'])
  })

  it('returns Hindi array', () => {
    const links = tArr(content.nav.links, 'hi')
    expect(links).toHaveLength(4)
    expect(links[0]).toBe('Kaise kaam karta hai')
  })

  it('returns hero animation lines', () => {
    const en = tArr(content.hero.h1, 'en')
    expect(en).toEqual(['Speak.', 'MAYA builds.', 'It evolves overnight.'])

    const hi = tArr(content.hero.h1, 'hi')
    expect(hi).toEqual(['Boliye.', 'MAYA bana degi.', 'Raat mein khud sudharegi.'])
  })

  it('returns editor quickChips', () => {
    const chips = tArr(content.editor.quickChips, 'en')
    expect(chips).toContain('Add payment')
    expect(chips).toContain('Add search')
  })
})

describe('Lang type', () => {
  it('supports en and hi', () => {
    const langs: Lang[] = ['en', 'hi']
    expect(langs).toContain('en')
    expect(langs).toContain('hi')
  })
})

describe('Content completeness', () => {
  // Ensure every bilingual field has both en and hi non-empty
  function checkPairs(obj: unknown, path = ''): string[] {
    const missing: string[] = []
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const record = obj as Record<string, unknown>
      if ('en' in record && 'hi' in record) {
        if (!record.en) missing.push(`${path}.en is empty`)
        if (!record.hi) missing.push(`${path}.hi is empty`)
      } else {
        for (const [key, value] of Object.entries(record)) {
          missing.push(...checkPairs(value, `${path}.${key}`))
        }
      }
    }
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => {
        missing.push(...checkPairs(item, `${path}[${i}]`))
      })
    }
    return missing
  }

  it('has no missing translations', () => {
    const missing = checkPairs(content, 'content')
    expect(missing).toEqual([])
  })
})
