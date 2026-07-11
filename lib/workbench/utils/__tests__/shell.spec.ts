import { describe, it, expect } from 'vitest'
import { cleanTerminalOutput } from '../shell'

describe('cleanTerminalOutput', () => {
  it('removes ANSI escape sequences', () => {
    const input = '\x1b[32mSuccess\x1b[0m: Build complete'
    const result = cleanTerminalOutput(input)
    expect(result).toContain('Success')
    expect(result).toContain('Build complete')
    expect(result).not.toContain('\x1b')
  })

  it('removes OSC sequences', () => {
    const input = '\x1b]654;interactive\x07Ready to go'
    const result = cleanTerminalOutput(input)
    expect(result).not.toContain('\x1b')
    expect(result).not.toContain('\x07')
  })

  it('normalizes newlines (CRLF → LF)', () => {
    const input = 'line1\r\nline2\r\nline3'
    const result = cleanTerminalOutput(input)
    expect(result).not.toContain('\r')
    expect(result).toContain('line1')
    expect(result).toContain('line2')
  })

  it('collapses multiple newlines', () => {
    const input = 'line1\n\n\n\n\nline2'
    const result = cleanTerminalOutput(input)
    // Should collapse 5 newlines to at most 2
    expect(result.split('\n').filter(l => l === '').length).toBeLessThanOrEqual(1)
  })

  it('removes null characters', () => {
    const input = 'hello\x00world'
    const result = cleanTerminalOutput(input)
    expect(result).not.toContain('\x00')
    expect(result).toContain('hello')
    expect(result).toContain('world')
  })

  it('trims leading and trailing whitespace', () => {
    const input = '   hello world   '
    const result = cleanTerminalOutput(input)
    expect(result).toBe('hello world')
  })

  it('removes color codes', () => {
    const input = '\u001b[31mError:\u001b[0m Something failed'
    const result = cleanTerminalOutput(input)
    expect(result).toContain('Error:')
    expect(result).toContain('Something failed')
    expect(result).not.toContain('\u001b')
  })

  it('handles empty input', () => {
    expect(cleanTerminalOutput('')).toBe('')
  })

  it('handles carriage returns', () => {
    const input = 'progress\r100%'
    const result = cleanTerminalOutput(input)
    // \r gets converted to \n, both lines survive
    expect(result).toContain('100%')
  })

  it('preserves error keywords as standalone lines', () => {
    const input = 'compilingerror: something broke'
    const result = cleanTerminalOutput(input)
    expect(result).toContain('error:')
  })

  it('handles complex terminal output with mixed sequences', () => {
    const input = '\x1b[1m\x1b[32m✓\x1b[0m Compiled successfully\n\x1b[33mWarning:\x1b[0m unused variable'
    const result = cleanTerminalOutput(input)
    expect(result).toContain('Compiled successfully')
    expect(result).toContain('Warning:')
    expect(result).not.toMatch(/\x1b/)
  })
})
