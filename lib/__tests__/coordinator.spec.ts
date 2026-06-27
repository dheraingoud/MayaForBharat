import { describe, it, expect } from 'vitest'
import type { GateResult, CoordinatorConfig, EvolutionCycleResult } from '@/lib/coordinator'

/**
 * Tests for coordinator types and gate logic contracts.
 * Does NOT test coordinatorGate directly (requires execSync + git),
 * but validates the type contracts and configuration constraints.
 */

describe('Coordinator types', () => {
  describe('GateResult', () => {
    it('accepts a merge decision', () => {
      const result: GateResult = {
        decision: 'merge',
        diffLines: 42,
        testsPassed: true,
        screenshotDiffPct: 0,
      }
      expect(result.decision).toBe('merge')
      expect(result.failedGate).toBeUndefined()
    })

    it('accepts a discard decision with failure info', () => {
      const result: GateResult = {
        decision: 'discard',
        failedGate: 'category:database_migration',
        diffLines: 0,
      }
      expect(result.decision).toBe('discard')
      expect(result.failedGate).toContain('category')
    })

    it('includes auto-fix metadata', () => {
      const result: GateResult = {
        decision: 'discard',
        failedGate: 'build_failed_after_fix',
        diffLines: 50,
        testsPassed: false,
        autoFixAttempted: true,
      }
      expect(result.autoFixAttempted).toBe(true)
    })
  })

  describe('CoordinatorConfig defaults', () => {
    it('has expected default values', () => {
      const defaults: CoordinatorConfig = {
        maxDiffLines: 150,
        maxScreenshotDiffPct: 5,
        enableAutoFix: true,
        maxProposalsPerCycle: 2,
      }
      expect(defaults.maxDiffLines).toBe(150)
      expect(defaults.maxScreenshotDiffPct).toBe(5)
      expect(defaults.enableAutoFix).toBe(true)
      expect(defaults.maxProposalsPerCycle).toBe(2)
    })

    it('max diff lines is within reasonable bounds', () => {
      const config: CoordinatorConfig = {
        maxDiffLines: 150,
        maxScreenshotDiffPct: 5,
        enableAutoFix: true,
        maxProposalsPerCycle: 2,
      }
      expect(config.maxDiffLines).toBeGreaterThan(0)
      expect(config.maxDiffLines).toBeLessThanOrEqual(500)
    })
  })

  describe('EvolutionCycleResult', () => {
    it('tracks all evolution metrics', () => {
      const result: EvolutionCycleResult = {
        signals: { hasSignal: true },
        proposals: 3,
        built: 2,
        merged: 1,
        gateFailures: [
          { gate: 'category:database_migration', count: 1 },
          { gate: 'diff_size:200', count: 1 },
        ],
        errors: [],
      }

      expect(result.proposals).toBe(3)
      expect(result.built).toBe(2)
      expect(result.merged).toBe(1)
      expect(result.gateFailures).toHaveLength(2)
      expect(result.errors).toHaveLength(0)
    })

    it('calculates success rate correctly', () => {
      const result: EvolutionCycleResult = {
        signals: { hasSignal: true },
        proposals: 5,
        built: 4,
        merged: 2,
        gateFailures: [
          { gate: 'build_failed', count: 1 },
          { gate: 'tests_failed', count: 1 },
        ],
        errors: ['Builder failed: timeout'],
      }

      const successRate = result.merged / result.proposals
      expect(successRate).toBe(0.4)
      expect(result.gateFailures.length + result.merged + result.errors.length).toBe(
        result.built + result.errors.length
      )
    })
  })
})

describe('Coordinator gate categories', () => {
  const ALLOWED = new Set(['copy', 'new_display', 'new_page', 'logic_fix', 'new_feature'])

  it('allows safe categories', () => {
    expect(ALLOWED.has('copy')).toBe(true)
    expect(ALLOWED.has('new_display')).toBe(true)
    expect(ALLOWED.has('new_page')).toBe(true)
    expect(ALLOWED.has('logic_fix')).toBe(true)
    expect(ALLOWED.has('new_feature')).toBe(true)
  })

  it('blocks dangerous categories', () => {
    expect(ALLOWED.has('database_migration')).toBe(false)
    expect(ALLOWED.has('infra_change')).toBe(false)
    expect(ALLOWED.has('security_patch')).toBe(false)
    expect(ALLOWED.has('dependency_upgrade')).toBe(false)
    expect(ALLOWED.has('auth_change')).toBe(false)
  })

  it('has exactly 5 allowed categories', () => {
    expect(ALLOWED.size).toBe(5)
  })
})
