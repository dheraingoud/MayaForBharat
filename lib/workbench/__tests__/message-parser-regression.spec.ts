// Enhanced message parser regression tests — streaming edge cases, malformed tags, concurrent parsing
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  StreamingMessageParser,
  type ActionCallback,
  type ArtifactCallback,
} from '@/lib/workbench/runtime/message-parser';

// ═══════════════════════════════════════════════════════════════════
// 1. Streaming Edge Cases — byte-by-byte parsing
// ═══════════════════════════════════════════════════════════════════

describe('Streaming Edge Cases', () => {
  it('should handle artifact tag split across chunks', () => {
    const onArtifactOpen = vi.fn();
    const onArtifactClose = vi.fn();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onArtifactOpen, onArtifactClose },
    });

    let result = '';
    // Split the tag across multiple chunks
    const chunks = [
      'Before <bolt',
      'Artifact title="Test" id="1"',
      '>content<',
      '/boltArtifact> After',
    ];

    let msg = '';
    for (const chunk of chunks) {
      msg += chunk;
      result += parser.parse('msg-1', msg);
    }

    expect(onArtifactOpen).toHaveBeenCalledTimes(1);
    expect(onArtifactClose).toHaveBeenCalledTimes(1);
    expect(result).toContain('Before');
    expect(result).toContain('After');
    expect(result).not.toContain('content');
  });

  it('should handle action tag split across chunks', () => {
    const onActionOpen = vi.fn();
    const onActionClose = vi.fn();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onActionOpen, onActionClose },
    });

    let result = '';
    const chunks = [
      '<boltArtifact title="T" id="1">',
      '<boltAction type="shell">',
      'npm install',
      '</boltAction>',
      '</boltArtifact>',
    ];

    let msg = '';
    for (const chunk of chunks) {
      msg += chunk;
      result += parser.parse('msg-2', msg);
    }

    expect(onActionOpen).toHaveBeenCalledTimes(1);
    expect(onActionClose).toHaveBeenCalledTimes(1);
  });

  it('should stream file action content correctly', () => {
    const onActionStream = vi.fn();
    const onActionClose = vi.fn();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onActionStream, onActionClose },
    });

    let msg = '';
    const chunks = [
      '<boltArtifact title="T" id="1"><boltAction type="file" filePath="index.js">',
      'const x = 1;',
      '\nconst y = 2;',
      '</boltAction></boltArtifact>',
    ];

    for (const chunk of chunks) {
      msg += chunk;
      parser.parse('msg-3', msg);
    }

    // onActionStream should have been called for partial content
    expect(onActionStream).toHaveBeenCalled();
    expect(onActionClose).toHaveBeenCalledTimes(1);

    // The final close callback should have the full content
    const closeCall = onActionClose.mock.calls[0][0];
    expect(closeCall.action.content).toContain('const x = 1;');
    expect(closeCall.action.content).toContain('const y = 2;');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Malformed Tags — resilience testing
// ═══════════════════════════════════════════════════════════════════

describe('Malformed Tag Resilience', () => {
  it('should pass through unclosed artifact tags without crashing', () => {
    const parser = new StreamingMessageParser({ artifactElement: () => '' });
    // Unclosed tag — should not crash
    const result = parser.parse('msg-4', 'Before <boltArtifact title="Test"');
    expect(result).toContain('Before');
  });

  it('should handle artifact without closing tag', () => {
    const onArtifactClose = vi.fn();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onArtifactClose },
    });

    let msg = '<boltArtifact title="T" id="1">some content';
    parser.parse('msg-5', msg);

    // Should NOT have called close since tag is not closed
    expect(onArtifactClose).not.toHaveBeenCalled();
  });

  it('should handle nested-looking tags gracefully', () => {
    const parser = new StreamingMessageParser({ artifactElement: () => '' });
    // This should not crash even though it's nonsensical
    const input = '<boltArtifact title="T" id="1"><boltArtifact title="Inner" id="2">inner</boltArtifact></boltArtifact>';
    const result = parser.parse('msg-6', input);
    // Should at least not throw
    expect(typeof result).toBe('string');
  });

  it('should handle empty content in actions', () => {
    const onActionClose = vi.fn();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onActionClose },
    });

    const input = '<boltArtifact title="T" id="1"><boltAction type="shell"></boltAction></boltArtifact>';
    parser.parse('msg-7', input);
    expect(onActionClose).toHaveBeenCalledTimes(1);
    expect(onActionClose.mock.calls[0][0].action.content).toBe('');
  });

  it('should handle action with missing type attribute', () => {
    const onActionOpen = vi.fn();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onActionOpen },
    });

    const input = '<boltArtifact title="T" id="1"><boltAction>content</boltAction></boltArtifact>';
    parser.parse('msg-8', input);
    // Should still parse even without type
    expect(onActionOpen).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Concurrent Message Parsing
// ═══════════════════════════════════════════════════════════════════

describe('Concurrent Message Parsing', () => {
  it('should track state per message ID independently', () => {
    const onArtifactOpen = vi.fn();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onArtifactOpen },
    });

    // Parse two different messages simultaneously
    parser.parse('msg-A', '<boltArtifact title="A" id="1">');
    parser.parse('msg-B', '<boltArtifact title="B" id="2">');

    // Should have 2 separate artifact opens
    expect(onArtifactOpen).toHaveBeenCalledTimes(2);
  });

  it('should not mix state between messages', () => {
    const onActionClose = vi.fn();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onActionClose },
    });

    parser.parse('msg-A', '<boltArtifact title="A" id="1"><boltAction type="shell">cmd-a</boltAction></boltArtifact>');
    parser.parse('msg-B', '<boltArtifact title="B" id="2"><boltAction type="shell">cmd-b</boltAction></boltArtifact>');

    expect(onActionClose).toHaveBeenCalledTimes(2);
    expect(onActionClose.mock.calls[0][0].action.content).toBe('cmd-a');
    expect(onActionClose.mock.calls[1][0].action.content).toBe('cmd-b');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Reset
// ═══════════════════════════════════════════════════════════════════

describe('Parser Reset', () => {
  it('should clear all message state on reset', () => {
    const onArtifactOpen = vi.fn();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onArtifactOpen },
    });

    parser.parse('msg-1', '<boltArtifact title="T" id="1">content</boltArtifact>');
    expect(onArtifactOpen).toHaveBeenCalledTimes(1);

    parser.reset();

    // After reset, re-parsing the same message ID should trigger callbacks again
    parser.parse('msg-1', '<boltArtifact title="T2" id="2">content2</boltArtifact>');
    expect(onArtifactOpen).toHaveBeenCalledTimes(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Quick Actions
// ═══════════════════════════════════════════════════════════════════

describe('Quick Actions', () => {
  it('should parse bolt-quick-actions blocks', () => {
    const parser = new StreamingMessageParser();
    const input =
      '<bolt-quick-actions><bolt-quick-action type="test" message="run tests">Run Tests</bolt-quick-action></bolt-quick-actions>';
    const result = parser.parse('msg-qa', input);
    expect(result).toContain('__boltQuickAction__');
    expect(result).toContain('Run Tests');
  });

  it('should parse multiple quick actions', () => {
    const parser = new StreamingMessageParser();
    const input = [
      '<bolt-quick-actions>',
      '<bolt-quick-action type="test" message="test">Test</bolt-quick-action>',
      '<bolt-quick-action type="deploy" message="deploy">Deploy</bolt-quick-action>',
      '</bolt-quick-actions>',
    ].join('');
    const result = parser.parse('msg-qa2', input);
    expect(result).toContain('Test');
    expect(result).toContain('Deploy');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Supabase Action Parsing
// ═══════════════════════════════════════════════════════════════════

describe('Supabase Action Parsing', () => {
  it('should parse supabase migration action', () => {
    const onActionOpen = vi.fn();
    const onActionClose = vi.fn();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onActionOpen, onActionClose },
    });

    const input =
      '<boltArtifact title="DB" id="1"><boltAction type="supabase" operation="migration" filePath="001.sql">CREATE TABLE users(id serial);</boltAction></boltArtifact>';
    parser.parse('msg-sb', input);

    expect(onActionOpen).toHaveBeenCalledTimes(1);
    expect(onActionClose).toHaveBeenCalledTimes(1);
    const action = onActionClose.mock.calls[0][0].action;
    expect(action.type).toBe('supabase');
    expect((action as any).operation).toBe('migration');
    expect((action as any).filePath).toBe('001.sql');
  });

  it('should parse supabase query action', () => {
    const onActionClose = vi.fn();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onActionClose },
    });

    const input =
      '<boltArtifact title="DB" id="1"><boltAction type="supabase" operation="query">SELECT * FROM users;</boltAction></boltArtifact>';
    parser.parse('msg-sb2', input);

    expect(onActionClose).toHaveBeenCalledTimes(1);
    const action = onActionClose.mock.calls[0][0].action;
    expect(action.type).toBe('supabase');
    expect((action as any).operation).toBe('query');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. File Content Cleaning
// ═══════════════════════════════════════════════════════════════════

describe('File Content Cleaning', () => {
  it('should strip markdown code fences from non-markdown files', () => {
    const onActionClose = vi.fn();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onActionClose },
    });

    const input =
      '<boltArtifact title="T" id="1"><boltAction type="file" filePath="test.js">```javascript\nconsole.log("hi")\n```</boltAction></boltArtifact>';
    parser.parse('msg-clean', input);

    const content = onActionClose.mock.calls[0][0].action.content;
    expect(content).toContain('console.log("hi")');
    expect(content).not.toContain('```');
  });

  it('should NOT strip markdown fences from .md files', () => {
    const onActionClose = vi.fn();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onActionClose },
    });

    const input =
      '<boltArtifact title="T" id="1"><boltAction type="file" filePath="README.md">```javascript\nconsole.log("hi")\n```</boltAction></boltArtifact>';
    parser.parse('msg-md', input);

    const content = onActionClose.mock.calls[0][0].action.content;
    expect(content).toContain('```');
  });

  it('should unescape HTML entities in non-markdown files', () => {
    const onActionClose = vi.fn();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onActionClose },
    });

    const input =
      '<boltArtifact title="T" id="1"><boltAction type="file" filePath="test.tsx">&lt;div&gt;Hello&lt;/div&gt;</boltAction></boltArtifact>';
    parser.parse('msg-esc', input);

    const content = onActionClose.mock.calls[0][0].action.content;
    expect(content).toContain('<div>Hello</div>');
  });

  it('should append trailing newline to file content', () => {
    const onActionClose = vi.fn();
    const parser = new StreamingMessageParser({
      artifactElement: () => '',
      callbacks: { onActionClose },
    });

    const input =
      '<boltArtifact title="T" id="1"><boltAction type="file" filePath="test.js">content</boltAction></boltArtifact>';
    parser.parse('msg-nl', input);

    const content = onActionClose.mock.calls[0][0].action.content;
    expect(content.endsWith('\n')).toBe(true);
  });
});
