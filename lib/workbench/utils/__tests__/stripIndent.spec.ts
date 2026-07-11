import { describe, it, expect } from 'vitest'
import { stripIndent, stripIndents } from '../stripIndent'

describe('stripIndent', () => {
  // ─── String argument ───────────────────────────────────────────────────
  it('strips common leading whitespace', () => {
    const result = stripIndent(`
      hello
      world
    `)
    // The last line is whitespace-only so it's not affected by the regex
    expect(result).toContain('\nhello\n')
    expect(result).toContain('\nworld\n')
  })

  it('preserves relative indentation', () => {
    const result = stripIndent(`
      line1
        indented
      line3
    `)
    expect(result).toContain('line1')
    expect(result).toContain('  indented')
    expect(result).toContain('line3')
  })

  it('handles no indentation', () => {
    const input = 'no indent\nhere'
    expect(stripIndent(input)).toBe(input)
  })

  it('handles empty string', () => {
    expect(stripIndent('')).toBe('')
  })

  it('handles single line', () => {
    expect(stripIndent('  hello')).toBe('hello')
  })

  // ─── Tagged template literal ───────────────────────────────────────────
  it('works as tagged template literal', () => {
    const result = stripIndent`
      hello
      world
    `
    expect(result).toContain('\nhello\n')
    expect(result).toContain('\nworld\n')
  })

  it('handles interpolation in tagged template', () => {
    const name = 'MAYA'
    const result = stripIndent`
      hello ${name}
      welcome
    `
    expect(result).toContain('hello MAYA')
    expect(result).toContain('welcome')
  })

  it('handles multiple interpolations', () => {
    const a = 'foo'
    const b = 'bar'
    const result = stripIndent`
      ${a} and ${b}
    `
    expect(result).toContain('foo and bar')
  })

  // ─── Alias ─────────────────────────────────────────────────────────────
  it('stripIndents is an alias for stripIndent', () => {
    expect(stripIndents).toBe(stripIndent)
  })
})
