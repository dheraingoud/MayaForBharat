import { describe, it, expect } from 'vitest'
import type { FixComplexity } from '@/lib/agents/fix-router'
import { assessFixComplexity } from '@/lib/agents/fix-router'
import type { ObserverSignals } from '@/lib/agents/observer-dom'
import type { VisualSignals } from '@/lib/agents/observer-visual'

describe('assessFixComplexity', () => {
  const makeSignals = (overrides: Partial<ObserverSignals> = {}): ObserverSignals => ({
    hasSignal: true,
    errors: [],
    topPages: [],
    dropoffs: [],
    unusedFeatures: [],
    suggestions: [],
    ...overrides,
  })

  const makeVisual = (overrides: Partial<VisualSignals> = {}): VisualSignals => ({
    hasVisualIssues: false,
    visualIssues: [],
    layoutProblems: [],
    accessibilityNotes: [],
    suggestedFixes: [],
    ...overrides,
  })

  it('returns simple when no errors or visual issues', () => {
    const result = assessFixComplexity(makeSignals())
    expect(result).toBe('simple')
  })

  it('returns complex when DOM has errors', () => {
    const result = assessFixComplexity(makeSignals({ errors: ['TypeError: x is undefined'] }))
    expect(result).toBe('complex')
  })

  it('returns complex when many visual issues (>2)', () => {
    const visualSignals = makeVisual({
      hasVisualIssues: true,
      visualIssues: ['overlap', 'contrast', 'missing-icon'],
    })
    const result = assessFixComplexity(makeSignals(), visualSignals)
    expect(result).toBe('complex')
  })

  it('returns simple when visual issues ≤ 2', () => {
    const visualSignals = makeVisual({
      hasVisualIssues: true,
      visualIssues: ['overlap'],
    })
    const result = assessFixComplexity(makeSignals(), visualSignals)
    expect(result).toBe('simple')
  })

  it('returns simple when no visual signals provided', () => {
    const result = assessFixComplexity(makeSignals(), undefined)
    expect(result).toBe('simple')
  })

  it('returns complex when errors AND visual issues', () => {
    const visualSignals = makeVisual({
      hasVisualIssues: true,
      visualIssues: ['contrast-fail', 'text-overlap', 'broken-img'],
    })
    const result = assessFixComplexity(
      makeSignals({ errors: ['Module not found'] }),
      visualSignals
    )
    expect(result).toBe('complex')
  })
})

describe('FixComplexity type', () => {
  it('only allows simple or complex', () => {
    const valid: FixComplexity[] = ['simple', 'complex']
    expect(valid).toContain('simple')
    expect(valid).toContain('complex')
    expect(valid).toHaveLength(2)
  })
})
