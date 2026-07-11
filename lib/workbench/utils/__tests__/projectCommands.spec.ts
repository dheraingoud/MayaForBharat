import { describe, it, expect } from 'vitest'
import {
  detectProjectCommands,
  createCommandsMessage,
  escapeBoltArtifactTags,
  escapeBoltAActionTags,
  escapeBoltTags,
  createCommandActionsString,
} from '@/lib/workbench/utils/projectCommands'
import type { ProjectCommands } from '@/lib/workbench/utils/projectCommands'

// Helper: AI SDK v6 messages carry text in parts[].text instead of .content.
function getText(msg: any): string {
  const parts = msg?.parts
  if (Array.isArray(parts)) {
    return parts
      .filter((p: any) => p && p.type === 'text')
      .map((p: any) => p.text)
      .join('')
  }
  return ''
}

// ─── detectProjectCommands ───────────────────────────────────────────────────

describe('detectProjectCommands', () => {
  it('detects Node.js project with dev script', async () => {
    const files = [
      { path: 'package.json', content: JSON.stringify({ scripts: { dev: 'next dev', build: 'next build' } }) },
    ]
    const result = await detectProjectCommands(files)
    expect(result.type).toBe('Node.js')
    expect(result.startCommand).toBe('npm run dev')
    expect(result.followupMessage).toContain('dev')
  })

  it('prefers dev over start over preview', async () => {
    const files = [
      { path: 'package.json', content: JSON.stringify({ scripts: { start: 'node server.js', preview: 'vite preview', dev: 'vite dev' } }) },
    ]
    const result = await detectProjectCommands(files)
    expect(result.startCommand).toBe('npm run dev')
  })

  it('falls back to start when no dev script', async () => {
    const files = [
      { path: 'package.json', content: JSON.stringify({ scripts: { start: 'node server.js' } }) },
    ]
    const result = await detectProjectCommands(files)
    expect(result.startCommand).toBe('npm run start')
  })

  it('falls back to preview when no dev or start', async () => {
    const files = [
      { path: 'package.json', content: JSON.stringify({ scripts: { preview: 'vite preview' } }) },
    ]
    const result = await detectProjectCommands(files)
    expect(result.startCommand).toBe('npm run preview')
  })

  it('handles package.json with no matching scripts', async () => {
    const files = [
      { path: 'package.json', content: JSON.stringify({ scripts: { test: 'vitest', build: 'tsc' } }) },
    ]
    const result = await detectProjectCommands(files)
    expect(result.type).toBe('Node.js')
    expect(result.startCommand).toBeUndefined()
    expect(result.followupMessage).toContain('inspect')
  })

  it('detects static HTML project', async () => {
    const files = [{ path: 'index.html', content: '<html></html>' }]
    const result = await detectProjectCommands(files)
    expect(result.type).toBe('Static')
    expect(result.setupCommand).toContain('cat > package.json')
    expect(result.setupCommand).toContain('cat > server.js')
    expect(result.setupCommand).toContain('server.js')
    expect(result.startCommand).toBe('node server.js')
  })

  it('detects static HTML when package.json has no scripts and index.html exists', async () => {
    const files = [
      { path: 'package.json', content: JSON.stringify({ name: 'test' }) },
      { path: 'index.html', content: '<html></html>' },
    ]
    const result = await detectProjectCommands(files)
    expect(result.type).toBe('Static')
    expect(result.setupCommand).toContain('cat > package.json')
    expect(result.setupCommand).toContain('cat > server.js')
    expect(result.startCommand).toBe('node server.js')
  })

  it('returns empty for unknown project type', async () => {
    const files = [{ path: 'main.py', content: 'print("hello")' }]
    const result = await detectProjectCommands(files)
    expect(result.type).toBe('')
    expect(result.setupCommand).toBe('')
  })

  it('handles malformed package.json gracefully', async () => {
    const files = [{ path: 'package.json', content: 'not valid json' }]
    const result = await detectProjectCommands(files)
    expect(result.type).toBe('')
  })

  it('detects shadcn project and adds shadcn init', async () => {
    const files = [
      { path: 'package.json', content: JSON.stringify({ scripts: { dev: 'vite' }, dependencies: { 'shadcn-ui': '^1.0' } }) },
      { path: 'components.json', content: '{ "style": "shadcn" }' },
    ]
    const result = await detectProjectCommands(files)
    expect(result.setupCommand).toContain('shadcn')
  })

  it('includes npm install in setup command', async () => {
    const files = [
      { path: 'package.json', content: JSON.stringify({ scripts: { dev: 'next dev' } }) },
    ]
    const result = await detectProjectCommands(files)
    expect(result.setupCommand).toContain('npm install')
  })

  it('makes setup command non-interactive', async () => {
    const files = [
      { path: 'package.json', content: JSON.stringify({ scripts: { dev: 'vite' } }) },
    ]
    const result = await detectProjectCommands(files)
    expect(result.setupCommand).toContain('CI=true')
  })
})

// ─── createCommandsMessage ───────────────────────────────────────────────────

describe('createCommandsMessage', () => {
  it('returns null when no commands', () => {
    const result = createCommandsMessage({ type: '', followupMessage: '' })
    expect(result).toBeNull()
  })

  it('creates message with setup command', () => {
    const commands: ProjectCommands = {
      type: 'Node.js',
      setupCommand: 'npm install',
      followupMessage: 'Installing...',
    }
    const msg = createCommandsMessage(commands) as any
    expect(msg).not.toBeNull()
    expect(msg!.role).toBe('assistant')
    expect(getText(msg)).toContain('npm install')
    expect(getText(msg)).toContain('boltAction type="shell"')
  })

  it('creates message with start command', () => {
    const commands: ProjectCommands = {
      type: 'Node.js',
      startCommand: 'npm run dev',
      followupMessage: 'Starting dev...',
    }
    const msg = createCommandsMessage(commands) as any
    expect(getText(msg)).toContain('npm run dev')
    expect(getText(msg)).toContain('boltAction type="start"')
  })

  it('creates message with both setup and start', () => {
    const commands: ProjectCommands = {
      type: 'Node.js',
      setupCommand: 'npm install',
      startCommand: 'npm run dev',
      followupMessage: 'Ready!',
    }
    const msg = createCommandsMessage(commands) as any
    expect(getText(msg)).toContain('npm install')
    expect(getText(msg)).toContain('npm run dev')
    expect(getText(msg)).toContain('boltArtifact')
  })

  it('generates a message with id and text content', () => {
    const msg = createCommandsMessage({
      type: 'Static',
      startCommand: 'node server.js',
      setupCommand: 'echo test',
      followupMessage: '',
    }) as any
    expect(msg!.id).toBeTruthy()
    expect(typeof getText(msg)).toBe('string')
  })
})

// ─── escapeBoltArtifactTags ──────────────────────────────────────────────────

describe('escapeBoltArtifactTags', () => {
  it('escapes boltArtifact open and close tags', () => {
    const input = '<boltArtifact id="test">content</boltArtifact>'
    const result = escapeBoltArtifactTags(input)
    expect(result).toContain('&lt;boltArtifact')
    expect(result).toContain('&lt;/boltArtifact&gt;')
    expect(result).toContain('content')
  })

  it('preserves content between tags', () => {
    const input = '<boltArtifact id="x">const x = 1;</boltArtifact>'
    const result = escapeBoltArtifactTags(input)
    expect(result).toContain('const x = 1;')
  })

  it('returns unchanged input with no boltArtifact tags', () => {
    const input = 'Hello world <div>test</div>'
    expect(escapeBoltArtifactTags(input)).toBe(input)
  })
})

// ─── escapeBoltAActionTags ───────────────────────────────────────────────────

describe('escapeBoltAActionTags', () => {
  it('escapes boltAction open and close tags', () => {
    const input = '<boltAction type="shell">npm install</boltAction>'
    const result = escapeBoltAActionTags(input)
    expect(result).toContain('&lt;boltAction')
    expect(result).toContain('&lt;/boltAction&gt;')
    expect(result).toContain('npm install')
  })

  it('returns unchanged input with no boltAction tags', () => {
    const input = 'Just regular text'
    expect(escapeBoltAActionTags(input)).toBe(input)
  })
})

// ─── escapeBoltTags ──────────────────────────────────────────────────────────

describe('escapeBoltTags', () => {
  it('escapes both artifact and action tags', () => {
    const input = '<boltArtifact id="a"><boltAction type="shell">cmd</boltAction></boltArtifact>'
    const result = escapeBoltTags(input)
    expect(result).toContain('&lt;boltArtifact')
    expect(result).toContain('&lt;boltAction')
  })
})

// ─── createCommandActionsString ──────────────────────────────────────────────

describe('createCommandActionsString', () => {
  it('returns empty string when no commands', () => {
    const result = createCommandActionsString({ type: '', followupMessage: '' })
    expect(result).toBe('')
  })

  it('creates shell action for setup command', () => {
    const result = createCommandActionsString({
      type: 'Node.js',
      setupCommand: 'npm install',
      followupMessage: '',
    })
    expect(result).toContain('boltAction type="shell"')
    expect(result).toContain('npm install')
  })

  it('creates start action for start command', () => {
    const result = createCommandActionsString({
      type: 'Node.js',
      startCommand: 'npm run dev',
      followupMessage: '',
    })
    expect(result).toContain('boltAction type="start"')
    expect(result).toContain('npm run dev')
  })

  it('creates both actions when both commands provided', () => {
    const result = createCommandActionsString({
      type: 'Node.js',
      setupCommand: 'npm install',
      startCommand: 'npm run dev',
      followupMessage: '',
    })
    expect(result).toContain('type="shell"')
    expect(result).toContain('type="start"')
  })
})
