import { describe, it, expect } from 'vitest'
import { classNames } from '../classNames'

describe('classNames', () => {
  // ─── String arguments ────────────────────────────────────────────────────
  it('joins string arguments with a space', () => {
    expect(classNames('foo', 'bar')).toBe('foo bar')
  })

  it('returns single string unchanged', () => {
    expect(classNames('foo')).toBe('foo')
  })

  it('returns empty string for no args', () => {
    expect(classNames()).toBe('')
  })

  // ─── Falsy arguments ────────────────────────────────────────────────────
  it('ignores null and undefined', () => {
    expect(classNames('foo', null, 'bar', undefined)).toBe('foo bar')
  })

  it('ignores false and true', () => {
    expect(classNames('foo', false, 'bar', true)).toBe('foo bar')
  })

  it('handles all-falsy arguments', () => {
    expect(classNames(null, undefined, false)).toBe('')
  })

  // ─── Number arguments ───────────────────────────────────────────────────
  it('converts numbers to strings', () => {
    expect(classNames('foo', 42)).toBe('foo 42')
  })

  it('converts zero to string', () => {
    // 0 is falsy but as a number type, it should be converted to '0'
    // Actually looking at the code: typeof 0 === 'number' → String(0) = '0'
    expect(classNames(0)).toBe('0')
  })

  // ─── Object arguments ──────────────────────────────────────────────────
  it('includes keys with truthy values', () => {
    expect(classNames({ active: true, disabled: false })).toBe('active')
  })

  it('handles object with multiple truthy keys', () => {
    expect(classNames({ active: true, selected: true, hidden: false })).toBe('active selected')
  })

  it('handles empty object', () => {
    expect(classNames({})).toBe('')
  })

  it('handles object with all false values', () => {
    expect(classNames({ a: false, b: false })).toBe('')
  })

  // ─── Array arguments ───────────────────────────────────────────────────
  it('flattens nested arrays', () => {
    expect(classNames(['foo', 'bar'])).toBe('foo bar')
  })

  it('handles deeply nested arrays', () => {
    expect(classNames([['foo'], [['bar']]])).toBe('foo bar')
  })

  it('handles arrays with mixed types', () => {
    expect(classNames(['foo', null, { active: true }, undefined])).toBe('foo active')
  })

  // ─── Mixed arguments ──────────────────────────────────────────────────
  it('handles strings, objects, and arrays together', () => {
    expect(classNames('foo', { bar: true, baz: false }, ['qux'])).toBe('foo bar qux')
  })

  it('complex real-world usage', () => {
    const isActive = true
    const isDisabled = false
    const result = classNames(
      'btn',
      { 'btn-active': isActive, 'btn-disabled': isDisabled },
      'btn-primary'
    )
    expect(result).toBe('btn btn-active btn-primary')
  })
})
