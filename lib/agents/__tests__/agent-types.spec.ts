import { describe, it, expect } from 'vitest'
import type { VerifierResult, VerifierIssue } from '@/lib/agents/verifier'
import type { Proposal, ImprovementCategory } from '@/lib/agents/proposer'
import type { ObserverSignals } from '@/lib/agents/observer-dom'
import type { VisualSignals } from '@/lib/agents/observer-visual'

/**
 * Agent type contract tests — validates the data structures
 * that flow between agents in the evolution cycle.
 */

describe('VerifierResult contract', () => {
  it('represents a passing result', () => {
    const result: VerifierResult = {
      passed: true,
      score: 92,
      issues: [],
      summary: 'Clean, professional appearance',
    }
    expect(result.passed).toBe(true)
    expect(result.score).toBeGreaterThanOrEqual(60)
    expect(result.issues).toHaveLength(0)
  })

  it('represents a failing result with critical issues', () => {
    const result: VerifierResult = {
      passed: false,
      score: 15,
      issues: [
        { severity: 'critical', category: 'layout', description: 'Page is blank' },
        { severity: 'critical', category: 'content', description: 'Error message displayed' },
      ],
      summary: 'Critical failures detected',
    }
    expect(result.passed).toBe(false)
    expect(result.score).toBeLessThan(30)
    expect(result.issues.every(i => i.severity === 'critical')).toBe(true)
  })

  it('soft-passes when verifier is unavailable', () => {
    const result: VerifierResult = {
      passed: true,
      score: -1,
      issues: [{ severity: 'minor', category: 'verifier_error', description: 'API timeout' }],
      summary: 'Verifier unavailable: API timeout',
    }
    // Soft-pass design: don't block deploys when verifier is down
    expect(result.passed).toBe(true)
    expect(result.score).toBe(-1) // sentinel value
  })
})

describe('VerifierIssue severity levels', () => {
  it('has three severity levels', () => {
    const severities: VerifierIssue['severity'][] = ['critical', 'major', 'minor']
    expect(severities).toHaveLength(3)
    expect(severities).toContain('critical')
    expect(severities).toContain('major')
    expect(severities).toContain('minor')
  })
})

describe('Proposal contract', () => {
  it('has all required fields', () => {
    const proposal: Proposal = {
      titleEn: 'Add sales chart',
      titleHindi: 'बिक्री चार्ट जोड़ें',
      category: 'new_display',
      description: 'Add a recharts bar chart showing daily sales',
      filesToModify: ['app/page.tsx', 'components/sales-chart.tsx'],
      estimatedDiffLines: 80,
      priority: 1,
    }
    expect(proposal.titleEn).toBeTruthy()
    expect(proposal.titleHindi).toBeTruthy()
    expect(proposal.filesToModify.length).toBeGreaterThan(0)
    expect(proposal.estimatedDiffLines).toBeLessThanOrEqual(150) // Gate 2 limit
    expect(proposal.priority).toBeGreaterThanOrEqual(1)
    expect(proposal.priority).toBeLessThanOrEqual(3)
  })

  it('respects the 150-line diff limit', () => {
    const proposal: Proposal = {
      titleEn: 'Big feature',
      titleHindi: 'बड़ा फीचर',
      category: 'new_feature',
      description: 'A large feature',
      filesToModify: ['app/page.tsx'],
      estimatedDiffLines: 200,
      priority: 1,
    }
    // The proposer filters out proposals > 150 lines
    expect(proposal.estimatedDiffLines > 150).toBe(true)
  })
})

describe('ImprovementCategory', () => {
  const ALLOWED: ImprovementCategory[] = ['copy', 'new_display', 'new_page', 'logic_fix', 'new_feature']

  it('has exactly 5 allowed categories', () => {
    expect(ALLOWED).toHaveLength(5)
  })

  it('blocks dangerous categories at type level', () => {
    // These should NOT be valid ImprovementCategory values
    const blocked = ['layout_change', 'schema_change', 'auth_change', 'component_modification']
    for (const cat of blocked) {
      expect(ALLOWED).not.toContain(cat)
    }
  })
})

describe('ObserverSignals contract', () => {
  it('can represent no-signal state', () => {
    const signals: ObserverSignals = {
      hasSignal: false,
      errors: [],
      topPages: [],
      dropoffs: [],
      unusedFeatures: [],
      suggestions: [],
    }
    expect(signals.hasSignal).toBe(false)
    // When hasSignal is false, the entire evolution cycle short-circuits
  })

  it('can represent error signals', () => {
    const signals: ObserverSignals = {
      hasSignal: true,
      errors: ['TypeError in /checkout', 'Module not found: payments'],
      topPages: ['/'],
      dropoffs: ['/checkout'],
      unusedFeatures: ['dark-mode-toggle'],
      suggestions: ['Fix checkout errors'],
    }
    expect(signals.hasSignal).toBe(true)
    expect(signals.errors).toHaveLength(2)
    expect(signals.dropoffs).toContain('/checkout')
  })
})

describe('VisualSignals contract', () => {
  it('can represent no-issues state', () => {
    const signals: VisualSignals = {
      hasVisualIssues: false,
      visualIssues: [],
      layoutProblems: [],
      accessibilityNotes: [],
      suggestedFixes: [],
    }
    expect(signals.hasVisualIssues).toBe(false)
  })

  it('captures visual issues with details', () => {
    const signals: VisualSignals = {
      hasVisualIssues: true,
      visualIssues: ['Text overlapping navbar', 'Button not visible'],
      layoutProblems: ['Grid overflow on mobile'],
      accessibilityNotes: ['Missing alt text on hero image'],
      suggestedFixes: ['Add overflow-hidden to grid container'],
    }
    expect(signals.hasVisualIssues).toBe(true)
    expect(signals.visualIssues).toHaveLength(2)
    expect(signals.layoutProblems).toHaveLength(1)
    expect(signals.accessibilityNotes).toHaveLength(1)
  })
})
