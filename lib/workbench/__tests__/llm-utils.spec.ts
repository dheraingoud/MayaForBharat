// @ts-nocheck
// LLM utilities unit tests — extractPropertiesFromMessage, simplifyBoltActions, createFilesContext, extractCurrentContext
import { describe, expect, it } from 'vitest';
import {
  extractPropertiesFromMessage,
  simplifyBoltActions,
  createFilesContext,
  extractCurrentContext,
} from '@/lib/workbench/llm/utils';

// ═══════════════════════════════════════════════════════════════════
// 1. extractPropertiesFromMessage
// ═══════════════════════════════════════════════════════════════════

describe('extractPropertiesFromMessage', () => {
  it('should extract model and provider from string content', () => {
    // MODEL_REGEX = /^\[Model: (.*?)\]\n\n/ — start-anchored, double newline
    // PROVIDER_REGEX = /\[Provider: (.*?)\]\n\n/ — double newline
    const msg = {
      role: 'user',
      content: '[Model: gpt-4o]\n\n[Provider: OpenAI]\n\nBuild me a todo app',
    };
    const result = extractPropertiesFromMessage(msg);
    expect(result.model).toBe('gpt-4o');
    expect(result.provider).toBe('OpenAI');
    expect(result.content).not.toContain('[Model:');
    expect(result.content).not.toContain('[Provider:');
    expect(result.content).toContain('Build me a todo app');
  });

  it('should use defaults when no model/provider specified', () => {
    const msg = { role: 'user', content: 'Just a normal message' };
    const result = extractPropertiesFromMessage(msg);
    // Default provider should be NvidiaNIM (Maya default)
    expect(result.provider).toBe('NvidiaNIM');
    expect(result.content).toBe('Just a normal message');
  });

  it('should handle parts array (AI SDK v6 UIMessage format)', () => {
    const msg = {
      role: 'user',
      parts: [
        { type: 'text', text: '[Model: claude-3-opus]\n\n' },
        { type: 'text', text: 'Hello world' },
      ],
    };
    const result = extractPropertiesFromMessage(msg);
    expect(result.model).toBe('claude-3-opus');
    expect(result.content).toContain('Hello world');
  });

  it('should handle content array format', () => {
    const msg = {
      role: 'user',
      content: [
        { type: 'text', text: '[Provider: Google]\n\n' },
        { type: 'text', text: 'Create a React app' },
      ],
    };
    const result = extractPropertiesFromMessage(msg);
    expect(result.provider).toBe('Google');
    expect(result.content).toContain('Create a React app');
  });

  it('should handle empty or undefined content gracefully', () => {
    const msg = { role: 'user', content: '' };
    const result = extractPropertiesFromMessage(msg);
    expect(result.content).toBe('');
    expect(result.provider).toBe('NvidiaNIM');
  });

  it('should handle non-string non-array content', () => {
    const msg = { role: 'user', content: 42 };
    const result = extractPropertiesFromMessage(msg);
    expect(result.content).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. simplifyBoltActions
// ═══════════════════════════════════════════════════════════════════

describe('simplifyBoltActions', () => {
  it('should replace file action content with ellipsis', () => {
    const input =
      '<boltAction type="file" filePath="index.js">const x = 1;\nconst y = 2;</boltAction>';
    const result = simplifyBoltActions(input);
    expect(result).toContain('...');
    expect(result).not.toContain('const x = 1');
  });

  it('should leave shell actions untouched', () => {
    const input = '<boltAction type="shell">npm install</boltAction>';
    const result = simplifyBoltActions(input);
    expect(result).toContain('npm install');
  });

  it('should handle multiple file actions', () => {
    const input = [
      '<boltAction type="file" filePath="a.js">content a</boltAction>',
      '<boltAction type="file" filePath="b.js">content b</boltAction>',
    ].join('\n');
    const result = simplifyBoltActions(input);
    expect(result).not.toContain('content a');
    expect(result).not.toContain('content b');
    // Both should have ellipsis
    const ellipsisCount = (result.match(/\.\.\./g) || []).length;
    expect(ellipsisCount).toBe(2);
  });

  it('should handle input with no bolt actions', () => {
    const input = 'Just some regular text';
    expect(simplifyBoltActions(input)).toBe('Just some regular text');
  });

  it('should handle empty input', () => {
    expect(simplifyBoltActions('')).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. createFilesContext
// ═══════════════════════════════════════════════════════════════════

describe('createFilesContext', () => {
  it('should wrap files in boltArtifact tags', () => {
    const files = {
      '/home/project/index.js': { type: 'file' as const, content: 'console.log("hi")' },
    };
    const result = createFilesContext(files);
    expect(result).toContain('<boltArtifact');
    expect(result).toContain('</boltArtifact>');
    expect(result).toContain('console.log("hi")');
  });

  it('should filter out ignored patterns (node_modules)', () => {
    const files = {
      '/home/project/index.js': { type: 'file' as const, content: 'ok' },
      '/home/project/node_modules/lodash/index.js': { type: 'file' as const, content: 'ignored' },
    };
    const result = createFilesContext(files);
    expect(result).toContain('ok');
    expect(result).not.toContain('ignored');
  });

  it('should skip folders', () => {
    const files = {
      '/home/project/src': { type: 'folder' as const },
      '/home/project/src/app.js': { type: 'file' as const, content: 'app code' },
    };
    const result = createFilesContext(files);
    expect(result).toContain('app code');
  });

  it('should use relative paths when useRelativePath=true', () => {
    const files = {
      '/home/project/src/app.js': { type: 'file' as const, content: 'app code' },
    };
    const result = createFilesContext(files, true);
    expect(result).toContain('filePath="src/app.js"');
    expect(result).not.toContain('/home/project/src/app.js');
  });

  it('should handle empty file map', () => {
    const result = createFilesContext({});
    expect(result).toContain('<boltArtifact');
    expect(result).toContain('</boltArtifact>');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. extractCurrentContext
// ═══════════════════════════════════════════════════════════════════

describe('extractCurrentContext', () => {
  it('should return undefined for both when no assistant messages', () => {
    const messages: any[] = [{ id: '1', role: 'user', content: 'hello' }];
    const result = extractCurrentContext(messages);
    expect(result.summary).toBeUndefined();
    expect(result.codeContext).toBeUndefined();
  });

  it('should return undefined when assistant has no annotations', () => {
    const messages: any[] = [
      { id: '1', role: 'user', content: 'hello' },
      { id: '2', role: 'assistant', content: 'hi there' },
    ];
    const result = extractCurrentContext(messages);
    expect(result.summary).toBeUndefined();
    expect(result.codeContext).toBeUndefined();
  });

  it('should extract codeContext annotation', () => {
    const messages: any[] = [
      { id: '1', role: 'user', content: 'hello' },
      {
        id: '2',
        role: 'assistant',
        content: 'hi',
        annotations: [{ type: 'codeContext', files: ['index.js'] }],
      },
    ];
    const result = extractCurrentContext(messages);
    expect(result.codeContext).toBeDefined();
    expect(result.codeContext!.type).toBe('codeContext');
  });

  it('should extract chatSummary annotation', () => {
    const messages: any[] = [
      { id: '1', role: 'user', content: 'hello' },
      {
        id: '2',
        role: 'assistant',
        content: 'hi',
        annotations: [{ type: 'chatSummary', summary: 'test summary' }],
      },
    ];
    const result = extractCurrentContext(messages);
    expect(result.summary).toBeDefined();
    expect(result.summary!.type).toBe('chatSummary');
  });

  it('should use the last assistant message', () => {
    const messages: any[] = [
      {
        id: '1',
        role: 'assistant',
        content: 'old',
        annotations: [{ type: 'chatSummary', summary: 'old summary' }],
      },
      { id: '2', role: 'user', content: 'new question' },
      {
        id: '3',
        role: 'assistant',
        content: 'new',
        annotations: [{ type: 'codeContext', files: ['new.js'] }],
      },
    ];
    const result = extractCurrentContext(messages);
    expect(result.codeContext).toBeDefined();
    expect(result.summary).toBeUndefined();
  });

  it('should handle null/invalid annotations gracefully', () => {
    const messages: any[] = [
      {
        id: '1',
        role: 'assistant',
        content: 'hi',
        annotations: [null, 42, 'string', { type: 'codeContext', files: ['x.js'] }],
      },
    ];
    const result = extractCurrentContext(messages);
    expect(result.codeContext).toBeDefined();
  });
});
