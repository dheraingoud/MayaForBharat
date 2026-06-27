import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StreamRecoveryManager } from '@/lib/workbench/llm/stream-recovery'

describe('StreamRecoveryManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initializes with default options', () => {
    const manager = new StreamRecoveryManager()
    const status = manager.getStatus()
    expect(status.isActive).toBe(true)
    expect(status.retryCount).toBe(0)
    manager.stop()
  })

  it('initializes with custom options', () => {
    const manager = new StreamRecoveryManager({ maxRetries: 5, timeout: 60000 })
    const status = manager.getStatus()
    expect(status.isActive).toBe(true)
    expect(status.retryCount).toBe(0)
    manager.stop()
  })

  it('calls onTimeout when stream times out', () => {
    const onTimeout = vi.fn()
    const manager = new StreamRecoveryManager({ timeout: 1000, onTimeout })

    manager.startMonitoring()
    vi.advanceTimersByTime(1100)

    expect(onTimeout).toHaveBeenCalledOnce()
    manager.stop()
  })

  it('calls onRecovery after recovery attempt', () => {
    const onRecovery = vi.fn()
    const manager = new StreamRecoveryManager({ timeout: 1000, onRecovery })

    manager.startMonitoring()
    vi.advanceTimersByTime(1100)

    expect(onRecovery).toHaveBeenCalledOnce()
    manager.stop()
  })

  it('increments retry count on each timeout', () => {
    const manager = new StreamRecoveryManager({ timeout: 1000, maxRetries: 3 })

    manager.startMonitoring()
    vi.advanceTimersByTime(1100) // 1st retry
    expect(manager.getStatus().retryCount).toBe(1)

    vi.advanceTimersByTime(1100) // 2nd retry
    expect(manager.getStatus().retryCount).toBe(2)

    manager.stop()
  })

  it('stops after reaching max retries', () => {
    const onTimeout = vi.fn()
    const manager = new StreamRecoveryManager({ timeout: 500, maxRetries: 2, onTimeout })

    manager.startMonitoring()
    vi.advanceTimersByTime(600) // retry 1
    vi.advanceTimersByTime(600) // retry 2
    vi.advanceTimersByTime(600) // retry 3 — should be blocked

    // Max retries = 2, so onTimeout should be called 2 times 
    // (3rd attempt exceeds max and stops)
    expect(manager.getStatus().isActive).toBe(false)
    manager.stop()
  })

  it('resets timeout on updateActivity', () => {
    const onTimeout = vi.fn()
    const manager = new StreamRecoveryManager({ timeout: 1000, onTimeout })

    manager.startMonitoring()
    vi.advanceTimersByTime(800)
    manager.updateActivity() // should reset the timer
    vi.advanceTimersByTime(800) // only 800ms since reset

    expect(onTimeout).not.toHaveBeenCalled()
    manager.stop()
  })

  it('fires timeout after full period since last activity', () => {
    const onTimeout = vi.fn()
    const manager = new StreamRecoveryManager({ timeout: 1000, onTimeout })

    manager.startMonitoring()
    vi.advanceTimersByTime(800)
    manager.updateActivity()
    vi.advanceTimersByTime(1100) // full period after reset

    expect(onTimeout).toHaveBeenCalledOnce()
    manager.stop()
  })

  it('stop() deactivates monitoring', () => {
    const onTimeout = vi.fn()
    const manager = new StreamRecoveryManager({ timeout: 500, onTimeout })

    manager.startMonitoring()
    manager.stop()
    vi.advanceTimersByTime(1000)

    expect(onTimeout).not.toHaveBeenCalled()
    expect(manager.getStatus().isActive).toBe(false)
  })

  it('getStatus returns correct timeSinceLastActivity', () => {
    const manager = new StreamRecoveryManager()
    const before = Date.now()
    const status = manager.getStatus()
    expect(status.timeSinceLastActivity).toBeGreaterThanOrEqual(0)
    expect(status.timeSinceLastActivity).toBeLessThan(100)
    manager.stop()
  })
})
