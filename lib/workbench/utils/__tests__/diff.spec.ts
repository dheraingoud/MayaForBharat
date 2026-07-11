import { describe, it, expect } from 'vitest'
import { diffFiles, extractRelativePath, fileModificationsToHTML } from '../diff'
import { WORK_DIR, MODIFICATIONS_TAG_NAME } from '../constants'

// ─── diffFiles ───────────────────────────────────────────────────────────────

describe('diffFiles', () => {
  it('returns undefined for identical files', () => {
    expect(diffFiles('test.ts', 'hello\nworld', 'hello\nworld')).toBeUndefined()
  })

  it('returns diff for changed files', () => {
    const diff = diffFiles('test.ts', 'hello\nworld', 'hello\nMaya')
    expect(diff).toBeDefined()
    expect(diff).toContain('-world')
    expect(diff).toContain('+Maya')
  })

  it('strips the patch header', () => {
    const diff = diffFiles('test.ts', 'old', 'new')
    // The header "--- test.ts\n+++ test.ts\n" should be stripped
    expect(diff).not.toContain('--- test.ts')
    expect(diff).not.toContain('+++ test.ts')
  })

  it('handles new content (empty → content)', () => {
    const diff = diffFiles('test.ts', '', 'new content')
    expect(diff).toBeDefined()
    expect(diff).toContain('+new content')
  })

  it('handles deletion (content → empty)', () => {
    const diff = diffFiles('test.ts', 'old content', '')
    expect(diff).toBeDefined()
    expect(diff).toContain('-old content')
  })

  it('handles multi-line diffs', () => {
    const old = 'line1\nline2\nline3\nline4'
    const new_ = 'line1\nCHANGED\nline3\nline4'
    const diff = diffFiles('test.ts', old, new_)
    expect(diff).toContain('-line2')
    expect(diff).toContain('+CHANGED')
  })
})

// ─── extractRelativePath ─────────────────────────────────────────────────────

describe('extractRelativePath', () => {
  it('strips WORK_DIR prefix', () => {
    expect(extractRelativePath(`${WORK_DIR}/src/app.ts`)).toBe('src/app.ts')
  })

  it('strips with trailing slash correctly', () => {
    expect(extractRelativePath(`${WORK_DIR}/package.json`)).toBe('package.json')
  })

  it('returns path unchanged if no WORK_DIR prefix', () => {
    expect(extractRelativePath('some/other/path.ts')).toBe('some/other/path.ts')
  })

  it('handles WORK_DIR root', () => {
    // WORK_DIR itself without trailing content — the regex strips "WORK_DIR/"
    expect(extractRelativePath(`${WORK_DIR}/`)).toBe('')
  })
})

// ─── fileModificationsToHTML ─────────────────────────────────────────────────

describe('fileModificationsToHTML', () => {
  it('returns undefined for empty modifications', () => {
    expect(fileModificationsToHTML({})).toBeUndefined()
  })

  it('wraps diff modifications in XML tags', () => {
    const result = fileModificationsToHTML({
      'src/app.ts': { type: 'diff', content: '-old\n+new' },
    })
    expect(result).toContain(`<${MODIFICATIONS_TAG_NAME}>`)
    expect(result).toContain(`</${MODIFICATIONS_TAG_NAME}>`)
    expect(result).toContain('<diff path="src/app.ts">')
    expect(result).toContain('-old\n+new')
    expect(result).toContain('</diff>')
  })

  it('wraps file modifications in XML tags', () => {
    const result = fileModificationsToHTML({
      'src/app.ts': { type: 'file', content: 'full content' },
    })
    expect(result).toContain('<file path="src/app.ts">')
    expect(result).toContain('full content')
    expect(result).toContain('</file>')
  })

  it('handles multiple modifications', () => {
    const result = fileModificationsToHTML({
      'src/a.ts': { type: 'diff', content: '-old' },
      'src/b.ts': { type: 'file', content: 'new file' },
    })
    expect(result).toContain('src/a.ts')
    expect(result).toContain('src/b.ts')
    expect(result).toContain('<diff')
    expect(result).toContain('<file')
  })
})
