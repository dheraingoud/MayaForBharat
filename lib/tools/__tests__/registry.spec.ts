import { describe, it, expect } from 'vitest'
import {
  buildTool,
  readFileTool,
  writeFileTool,
  listFilesTool,
  runBuildTool,
  runTestsTool,
  gitDiffTool,
  gitCommitTool,
  READ_TOOLS,
  BUILDER_TOOLS,
  GATE_TOOLS,
  OBSERVER_TOOLS,
  SCREENSHOT_TOOLS,
} from '@/lib/tools/registry'
import type { MayaTool, PermissionLevel } from '@/lib/tools/registry'
import { z } from 'zod'

describe('buildTool factory', () => {
  it('creates a tool with all required fields', () => {
    const tool = buildTool({
      name: 'testTool',
      description: 'A test tool',
      schema: z.object({ input: z.string() }),
      parameters: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'] },
      permission: 'read_only',
      execute: async (args) => args.input.toUpperCase(),
    })

    expect(tool.name).toBe('testTool')
    expect(tool.description).toBe('A test tool')
    expect(tool.permission).toBe('read_only')
    expect(tool.isConcurrencySafe).toBe(false) // default
  })

  it('sets isConcurrencySafe when specified', () => {
    const tool = buildTool({
      name: 'safeTool',
      description: 'Safe tool',
      schema: z.object({}),
      parameters: { type: 'object', properties: {} },
      permission: 'read_only',
      isConcurrencySafe: true,
      execute: async () => 'ok',
    })
    expect(tool.isConcurrencySafe).toBe(true)
  })

  it('generates OpenAI tool definition', () => {
    const tool = buildTool({
      name: 'myTool',
      description: 'Does something',
      schema: z.object({ x: z.number() }),
      parameters: { type: 'object', properties: { x: { type: 'number' } }, required: ['x'] },
      permission: 'read_only',
      execute: async (args) => args.x * 2,
    })

    const oai = tool.toOpenAITool()
    expect(oai.type).toBe('function')
    expect(oai.function.name).toBe('myTool')
    expect(oai.function.description).toBe('Does something')
    expect(oai.function.parameters).toHaveProperty('properties')
  })

  it('validates args with Zod before execution', async () => {
    const tool = buildTool({
      name: 'validated',
      description: 'Zod-validated',
      schema: z.object({ count: z.number().min(1) }),
      parameters: { type: 'object', properties: { count: { type: 'number' } }, required: ['count'] },
      permission: 'read_only',
      execute: async (args) => args.count,
    })

    // Valid args
    const result = await tool.execute({ count: 5 })
    expect(result).toBe(5)

    // Invalid args — should throw
    await expect(tool.execute({ count: -1 })).rejects.toThrow('Validation failed')
  })

  it('defaults permission check to allow read_only', async () => {
    const readTool = buildTool({
      name: 'reader',
      description: 'Read',
      schema: z.object({}),
      parameters: {},
      permission: 'read_only',
      execute: async () => 'ok',
    })
    expect(await readTool.checkPermission({})).toBe(true)

    const writeTool = buildTool({
      name: 'writer',
      description: 'Write',
      schema: z.object({}),
      parameters: {},
      permission: 'write_isolated',
      execute: async () => 'ok',
    })
    // write_isolated without custom check → denied
    expect(await writeTool.checkPermission({})).toBe(false)
  })

  it('uses custom permission check when provided', async () => {
    const tool = buildTool({
      name: 'custom',
      description: 'Custom perms',
      schema: z.object({ allowed: z.boolean() }),
      parameters: {},
      permission: 'write_main',
      checkPermission: async (args) => args.allowed,
      execute: async () => 'ok',
    })

    expect(await tool.checkPermission({ allowed: true })).toBe(true)
    expect(await tool.checkPermission({ allowed: false })).toBe(false)
  })
})

describe('Built-in tool properties', () => {
  it('readFileTool is read_only and concurrency safe', () => {
    expect(readFileTool.name).toBe('readFile')
    expect(readFileTool.permission).toBe('read_only')
    expect(readFileTool.isConcurrencySafe).toBe(true)
  })

  it('writeFileTool is write_isolated and NOT concurrency safe', () => {
    expect(writeFileTool.name).toBe('writeFile')
    expect(writeFileTool.permission).toBe('write_isolated')
    expect(writeFileTool.isConcurrencySafe).toBe(false)
  })

  it('writeFileTool blocks writes to locked paths', async () => {
    const lockedPaths = [
      '/app/components/ui/Button.tsx',
      '/app/.interface-design/tokens.json',
      '/app/AGENTS.md',
    ]
    for (const p of lockedPaths) {
      const allowed = await writeFileTool.checkPermission({ path: p, content: 'x' })
      expect(allowed).toBe(false)
    }
  })

  it('writeFileTool allows writes to non-locked paths', async () => {
    const allowed = await writeFileTool.checkPermission({ path: '/app/pages/home.tsx', content: 'x' })
    expect(allowed).toBe(true)
  })

  it('listFilesTool is read_only and concurrency safe', () => {
    expect(listFilesTool.name).toBe('listFiles')
    expect(listFilesTool.permission).toBe('read_only')
    expect(listFilesTool.isConcurrencySafe).toBe(true)
  })

  it('runBuildTool is NOT concurrency safe', () => {
    expect(runBuildTool.isConcurrencySafe).toBe(false)
  })

  it('gitDiffTool IS concurrency safe', () => {
    expect(gitDiffTool.isConcurrencySafe).toBe(true)
  })

  it('gitCommitTool is write_isolated and NOT concurrency safe', () => {
    expect(gitCommitTool.permission).toBe('write_isolated')
    expect(gitCommitTool.isConcurrencySafe).toBe(false)
  })
})

describe('Tool Collections', () => {
  it('READ_TOOLS contains only read_only tools', () => {
    expect(READ_TOOLS.length).toBe(3)
    for (const tool of READ_TOOLS) {
      expect(tool.permission).toBe('read_only')
    }
  })

  it('BUILDER_TOOLS includes all tool types', () => {
    expect(BUILDER_TOOLS.length).toBe(9)
    const names = BUILDER_TOOLS.map(t => t.name)
    expect(names).toContain('readFile')
    expect(names).toContain('writeFile')
    expect(names).toContain('listFiles')
    expect(names).toContain('runBuild')
    expect(names).toContain('runTests')
    expect(names).toContain('gitDiff')
    expect(names).toContain('gitCommit')
  })

  it('GATE_TOOLS are for verification only', () => {
    expect(GATE_TOOLS.length).toBe(3)
    const names = GATE_TOOLS.map(t => t.name)
    expect(names).toContain('runBuild')
    expect(names).toContain('runTests')
    expect(names).toContain('gitDiff')
  })

  it('OBSERVER_TOOLS include read + snapshot tools', () => {
    expect(OBSERVER_TOOLS.length).toBe(4)
    const names = OBSERVER_TOOLS.map(t => t.name)
    expect(names).toContain('readFile')
    expect(names).toContain('listFiles')
  })

  it('SCREENSHOT_TOOLS has 2 tools', () => {
    expect(SCREENSHOT_TOOLS.length).toBe(2)
  })
})

describe('PermissionLevel type', () => {
  it('has three levels', () => {
    const levels: PermissionLevel[] = ['read_only', 'write_isolated', 'write_main']
    expect(levels).toHaveLength(3)
  })
})
