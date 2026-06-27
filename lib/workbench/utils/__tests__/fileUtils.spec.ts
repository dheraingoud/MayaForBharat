import { describe, it, expect } from 'vitest'
import {
  IGNORE_PATTERNS,
  MAX_FILES,
  generateId,
  shouldIncludeFile,
  filesToArtifacts,
} from '@/lib/workbench/utils/fileUtils'

describe('IGNORE_PATTERNS', () => {
  it('includes node_modules', () => {
    expect(IGNORE_PATTERNS).toContain('node_modules/**')
  })

  it('includes .git', () => {
    expect(IGNORE_PATTERNS).toContain('.git/**')
  })

  it('includes common build dirs', () => {
    expect(IGNORE_PATTERNS).toContain('dist/**')
    expect(IGNORE_PATTERNS).toContain('build/**')
    expect(IGNORE_PATTERNS).toContain('.next/**')
  })

  it('includes coverage and cache', () => {
    expect(IGNORE_PATTERNS).toContain('coverage/**')
    expect(IGNORE_PATTERNS).toContain('.cache/**')
  })

  it('includes IDE directories', () => {
    expect(IGNORE_PATTERNS).toContain('.vscode/**')
    expect(IGNORE_PATTERNS).toContain('.idea/**')
  })
})

describe('MAX_FILES', () => {
  it('is 1000', () => {
    expect(MAX_FILES).toBe(1000)
  })
})

describe('generateId', () => {
  it('returns a non-empty string', () => {
    const id = generateId()
    expect(id).toBeTruthy()
    expect(typeof id).toBe('string')
  })

  it('returns unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()))
    expect(ids.size).toBe(100)
  })

  it('returns base-36 alphanumeric characters', () => {
    const id = generateId()
    expect(id).toMatch(/^[a-z0-9]+$/)
  })
})

describe('shouldIncludeFile', () => {
  it('includes regular source files', () => {
    expect(shouldIncludeFile('src/app.tsx')).toBe(true)
    expect(shouldIncludeFile('lib/utils.ts')).toBe(true)
    expect(shouldIncludeFile('package.json')).toBe(true)
  })

  it('excludes node_modules', () => {
    expect(shouldIncludeFile('node_modules/react/index.js')).toBe(false)
  })

  it('excludes .git', () => {
    expect(shouldIncludeFile('.git/HEAD')).toBe(false)
    expect(shouldIncludeFile('.git/config')).toBe(false)
  })

  it('excludes build directories', () => {
    expect(shouldIncludeFile('dist/bundle.js')).toBe(false)
    expect(shouldIncludeFile('.next/server/app.js')).toBe(false)
  })

  it('excludes log files', () => {
    expect(shouldIncludeFile('error.log')).toBe(false)
    expect(shouldIncludeFile('npm-debug.log')).toBe(false)
  })

  it('excludes .DS_Store', () => {
    expect(shouldIncludeFile('.DS_Store')).toBe(false)
    expect(shouldIncludeFile('src/.DS_Store')).toBe(false)
  })
})

describe('filesToArtifacts', () => {
  it('wraps files in boltArtifact tags', () => {
    const files = {
      'src/app.tsx': { content: 'export default function App() {}' },
    }
    const result = filesToArtifacts(files, 'test-id')
    expect(result).toContain('<boltArtifact id="test-id"')
    expect(result).toContain('</boltArtifact>')
  })

  it('includes boltAction for each file', () => {
    const files = {
      'src/page.tsx': { content: '<div>Page</div>' },
      'src/layout.tsx': { content: '<div>Layout</div>' },
    }
    const result = filesToArtifacts(files, 'multi')
    expect(result).toContain('filePath="src/page.tsx"')
    expect(result).toContain('filePath="src/layout.tsx"')
    expect(result).toContain('<div>Page</div>')
    expect(result).toContain('<div>Layout</div>')
  })

  it('uses the provided id', () => {
    const result = filesToArtifacts({}, 'custom-123')
    expect(result).toContain('id="custom-123"')
  })
})
