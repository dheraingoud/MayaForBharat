import { describe, it, expect } from 'vitest'
import { calcDiff, calcMultiDiff, type FileDiff } from '../diff-calc'

// ─── calcDiff ────────────────────────────────────────────────────────────────

describe('calcDiff', () => {
  it('counts all lines as additions for new file', () => {
    const result = calcDiff(undefined, 'line1\nline2\nline3')
    expect(result.additions).toBe(3)
    expect(result.deletions).toBe(0)
  })

  it('counts zero changes for identical content', () => {
    const content = 'line1\nline2\nline3'
    const result = calcDiff(content, content)
    expect(result.additions).toBe(0)
    expect(result.deletions).toBe(0)
  })

  it('counts modifications as both addition and deletion', () => {
    const result = calcDiff('old line', 'new line')
    expect(result.additions).toBe(1)
    expect(result.deletions).toBe(1)
  })

  it('counts added lines when new content is longer', () => {
    const result = calcDiff('line1', 'line1\nline2\nline3')
    expect(result.additions).toBe(2)
    expect(result.deletions).toBe(0)
  })

  it('counts deleted lines when old content is longer', () => {
    const result = calcDiff('line1\nline2\nline3', 'line1')
    expect(result.additions).toBe(0)
    expect(result.deletions).toBe(2)
  })

  it('handles empty new content', () => {
    const result = calcDiff('line1\nline2', '')
    expect(result.deletions).toBeGreaterThan(0)
  })

  it('handles empty old content (not undefined)', () => {
    const result = calcDiff('', 'line1\nline2')
    expect(result.additions).toBeGreaterThan(0)
  })

  it('handles single line change in multi-line file', () => {
    const old = 'line1\nline2\nline3\nline4'
    const new_ = 'line1\nCHANGED\nline3\nline4'
    const result = calcDiff(old, new_)
    expect(result.additions).toBe(1)
    expect(result.deletions).toBe(1)
  })
})

// ─── calcMultiDiff ───────────────────────────────────────────────────────────

describe('calcMultiDiff', () => {
  it('calculates diffs for multiple new files', () => {
    const oldFiles = new Map<string, string>()
    const newFiles = [
      { path: 'src/a.ts', content: 'line1\nline2' },
      { path: 'src/b.ts', content: 'line1\nline2\nline3' },
    ]
    const result = calcMultiDiff(oldFiles, newFiles)
    expect(result.diffs).toHaveLength(2)
    expect(result.totalAdditions).toBe(5)
    expect(result.totalDeletions).toBe(0)
    expect(result.diffs[0].action).toBe('create')
    expect(result.diffs[1].action).toBe('create')
  })

  it('calculates diffs for modified files', () => {
    const oldFiles = new Map([['src/a.ts', 'old line']])
    const newFiles = [{ path: 'src/a.ts', content: 'new line' }]
    const result = calcMultiDiff(oldFiles, newFiles)
    expect(result.diffs[0].action).toBe('modify')
    expect(result.totalAdditions).toBe(1)
    expect(result.totalDeletions).toBe(1)
  })

  it('uses explicit action when provided', () => {
    const oldFiles = new Map<string, string>()
    const newFiles = [{ path: 'src/a.ts', content: '', action: 'delete' }]
    const result = calcMultiDiff(oldFiles, newFiles)
    expect(result.diffs[0].action).toBe('delete')
  })

  it('handles empty input', () => {
    const result = calcMultiDiff(new Map(), [])
    expect(result.diffs).toHaveLength(0)
    expect(result.totalAdditions).toBe(0)
    expect(result.totalDeletions).toBe(0)
  })

  it('correctly sums total additions and deletions', () => {
    const oldFiles = new Map([['src/a.ts', 'line1\nline2']])
    const newFiles = [
      { path: 'src/a.ts', content: 'line1\nchanged' },
      { path: 'src/b.ts', content: 'new1\nnew2\nnew3' },
    ]
    const result = calcMultiDiff(oldFiles, newFiles)
    expect(result.totalAdditions).toBe(4) // 1 modify + 3 new
    expect(result.totalDeletions).toBe(1) // 1 modify
  })

  it('returns correct FileDiff shape', () => {
    const result = calcMultiDiff(new Map(), [{ path: 'test.ts', content: 'x' }])
    const diff = result.diffs[0]
    expect(diff).toHaveProperty('path')
    expect(diff).toHaveProperty('action')
    expect(diff).toHaveProperty('additions')
    expect(diff).toHaveProperty('deletions')
  })
})
