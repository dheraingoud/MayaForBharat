import { describe, it, expect } from 'vitest'
import { cleanStackTrace } from '../stacktrace'

describe('cleanStackTrace', () => {
  it('replaces webcontainer URLs with relative paths', () => {
    const input = 'Error: Something failed\n    at module (https://abc123.webcontainer-api.io/src/app.ts:10:5)'
    const result = cleanStackTrace(input)
    expect(result).toContain('src/app.ts:10:5')
    expect(result).not.toContain('webcontainer-api.io')
  })

  it('handles multiple webcontainer URLs', () => {
    const input = [
      '    at fn1 (https://abc123.webcontainer-api.io/src/a.ts:1:1)',
      '    at fn2 (https://abc123.webcontainer-api.io/src/b.ts:2:2)',
    ].join('\n')
    const result = cleanStackTrace(input)
    expect(result).toContain('src/a.ts:1:1')
    expect(result).toContain('src/b.ts:2:2')
    expect(result).not.toContain('webcontainer-api.io')
  })

  it('leaves non-webcontainer URLs unchanged', () => {
    const input = '    at fn (https://cdn.example.com/lib.js:5:3)'
    const result = cleanStackTrace(input)
    expect(result).toContain('https://cdn.example.com/lib.js:5:3')
  })

  it('handles root path in webcontainer URL', () => {
    // The regex requires at least one char after the domain, so it matches paths like /index.js
    const input = '    at fn (https://abc.webcontainer-api.io/index.js)'
    const result = cleanStackTrace(input)
    expect(result).not.toContain('webcontainer-api.io')
    expect(result).toContain('index.js')
  })

  it('preserves non-URL lines', () => {
    const input = 'TypeError: Cannot read property "x" of undefined\n    at Object.<anonymous>'
    const result = cleanStackTrace(input)
    expect(result).toBe(input)
  })

  it('handles empty string', () => {
    expect(cleanStackTrace('')).toBe('')
  })
})
