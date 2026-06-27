import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce } from '@/lib/workbench/utils/debounce'
import { createSampler } from '@/lib/workbench/utils/sampler'
import { unreachable } from '@/lib/workbench/utils/unreachable'
import { allowedHTMLElements, remarkPlugins, rehypePlugins } from '@/lib/workbench/utils/markdown'

// ─── debounce ────────────────────────────────────────────────────────────────

describe('debounce', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('delays function execution', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced()
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('resets timer on repeated calls', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced()
    vi.advanceTimersByTime(50)
    debounced() // reset
    vi.advanceTimersByTime(50) // only 50ms since reset
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(50) // 100ms since last call
    expect(fn).toHaveBeenCalledOnce()
  })

  it('passes arguments to the debounced function', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 50)

    debounced('hello', 42)
    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledWith('hello', 42)
  })

  it('uses last arguments when debounced multiple times', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 50)

    debounced('first')
    debounced('second')
    debounced('third')
    vi.advanceTimersByTime(50)

    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith('third')
  })
})

// ─── createSampler ───────────────────────────────────────────────────────────

describe('createSampler', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('executes the first call immediately', () => {
    const fn = vi.fn()
    const sampled = createSampler(fn, 100)

    sampled('first')
    expect(fn).toHaveBeenCalledWith('first')
  })

  it('drops calls within the sampling interval', () => {
    const fn = vi.fn()
    const sampled = createSampler(fn, 100)

    sampled('a') // immediate
    sampled('b') // dropped (within interval)
    sampled('c') // stored as trailing

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('a')
  })

  it('fires trailing call after interval', () => {
    const fn = vi.fn()
    const sampled = createSampler(fn, 100)

    sampled('a') // immediate
    sampled('b') // trailing
    vi.advanceTimersByTime(100)

    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('b')
  })
})

// ─── unreachable ─────────────────────────────────────────────────────────────

describe('unreachable', () => {
  it('throws with the provided message', () => {
    expect(() => unreachable('should not happen')).toThrow('Unreachable: should not happen')
  })

  it('always throws an Error', () => {
    expect(() => unreachable('test')).toThrowError(Error)
  })
})

// ─── markdown utilities ──────────────────────────────────────────────────────

describe('allowedHTMLElements', () => {
  it('is a non-empty array', () => {
    expect(allowedHTMLElements.length).toBeGreaterThan(0)
  })

  it('includes common HTML elements', () => {
    expect(allowedHTMLElements).toContain('a')
    expect(allowedHTMLElements).toContain('p')
    expect(allowedHTMLElements).toContain('code')
    expect(allowedHTMLElements).toContain('pre')
    expect(allowedHTMLElements).toContain('table')
    expect(allowedHTMLElements).toContain('ul')
    expect(allowedHTMLElements).toContain('ol')
  })

  it('includes custom think tag', () => {
    expect(allowedHTMLElements).toContain('think')
  })

  it('does NOT include script or iframe', () => {
    expect(allowedHTMLElements).not.toContain('script')
    expect(allowedHTMLElements).not.toContain('iframe')
    expect(allowedHTMLElements).not.toContain('style')
  })
})

describe('remarkPlugins', () => {
  it('always includes remarkGfm', () => {
    const plugins = remarkPlugins(false)
    expect(plugins.length).toBeGreaterThanOrEqual(1)
  })

  it('adds limitedMarkdown plugin when limited=true', () => {
    const limited = remarkPlugins(true)
    const normal = remarkPlugins(false)
    expect(limited.length).toBeGreaterThan(normal.length)
  })
})

describe('rehypePlugins', () => {
  it('includes rehypeRaw when html=true', () => {
    const plugins = rehypePlugins(true)
    expect(plugins.length).toBe(1)
  })

  it('returns empty array when html=false', () => {
    const plugins = rehypePlugins(false)
    expect(plugins).toEqual([])
  })
})
