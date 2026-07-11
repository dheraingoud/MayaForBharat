// @ts-nocheck
import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn (classNames merge utility)', () => {
  it('merges basic class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    const isActive = true
    const result = cn('btn', isActive && 'btn-active')
    expect(result).toContain('btn')
    expect(result).toContain('btn-active')
  })

  it('filters out falsy values', () => {
    expect(cn('foo', false, null, undefined, 'bar')).toBe('foo bar')
  })

  it('merges tailwind conflicting classes (tw-merge)', () => {
    // tailwind-merge should resolve conflicting utilities
    const result = cn('px-2', 'px-4')
    expect(result).toBe('px-4')
  })

  it('keeps non-conflicting tailwind classes', () => {
    const result = cn('px-2', 'py-4')
    expect(result).toContain('px-2')
    expect(result).toContain('py-4')
  })

  it('handles empty input', () => {
    expect(cn()).toBe('')
    expect(cn('')).toBe('')
  })

  it('handles array arguments via clsx', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })

  it('handles object arguments via clsx', () => {
    const result = cn({ 'text-red-500': true, 'bg-blue-500': false })
    expect(result).toBe('text-red-500')
  })

  it('resolves bg color conflicts', () => {
    const result = cn('bg-red-500', 'bg-blue-500')
    expect(result).toBe('bg-blue-500')
  })

  it('complex real-world usage', () => {
    const variant = 'primary'
    const size = 'lg'
    const result = cn(
      'rounded-md font-medium transition-colors',
      variant === 'primary' && 'bg-blue-600 text-white hover:bg-blue-700',
      size === 'lg' && 'px-6 py-3 text-lg',
      size === 'sm' && 'px-3 py-1 text-sm',
    )
    expect(result).toContain('rounded-md')
    expect(result).toContain('bg-blue-600')
    expect(result).toContain('px-6')
    expect(result).not.toContain('px-3') // sm should be filtered
  })
})
