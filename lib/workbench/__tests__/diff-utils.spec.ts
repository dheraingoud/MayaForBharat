// Diff utilities deep tests — diffFiles, extractRelativePath, computeFileModifications, fileModificationsToHTML
import { describe, expect, it } from 'vitest';
import {
  diffFiles,
  extractRelativePath,
  computeFileModifications,
  fileModificationsToHTML,
  modificationsRegex,
} from '@/lib/workbench/utils/diff';

// ═══════════════════════════════════════════════════════════════════
// 1. diffFiles
// ═══════════════════════════════════════════════════════════════════

describe('diffFiles', () => {
  it('should return undefined for identical files', () => {
    const result = diffFiles('test.js', 'const x = 1;', 'const x = 1;');
    expect(result).toBeUndefined();
  });

  it('should produce a diff for changed files', () => {
    const result = diffFiles('test.js', 'const x = 1;', 'const x = 2;');
    expect(result).toBeDefined();
    expect(result).toContain('-const x = 1;');
    expect(result).toContain('+const x = 2;');
  });

  it('should strip the patch header', () => {
    const result = diffFiles('test.js', 'old', 'new');
    expect(result).not.toContain('--- test.js');
    expect(result).not.toContain('+++ test.js');
  });

  it('should handle multi-line diffs', () => {
    const old = 'line1\nline2\nline3';
    const newContent = 'line1\nmodified\nline3';
    const result = diffFiles('multi.txt', old, newContent);
    expect(result).toBeDefined();
    expect(result).toContain('-line2');
    expect(result).toContain('+modified');
  });

  it('should handle empty-to-content diff', () => {
    const result = diffFiles('new.js', '', 'const x = 1;');
    expect(result).toBeDefined();
    expect(result).toContain('+const x = 1;');
  });

  it('should handle content-to-empty diff', () => {
    const result = diffFiles('deleted.js', 'const x = 1;', '');
    expect(result).toBeDefined();
    expect(result).toContain('-const x = 1;');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. extractRelativePath
// ═══════════════════════════════════════════════════════════════════

describe('extractRelativePath', () => {
  it('should strip /home/project/ prefix', () => {
    expect(extractRelativePath('/home/project/src/index.js')).toBe('src/index.js');
  });

  it('should strip /home/project/ from root files', () => {
    expect(extractRelativePath('/home/project/package.json')).toBe('package.json');
  });

  it('should leave non-project paths untouched', () => {
    expect(extractRelativePath('/other/path/file.js')).toBe('/other/path/file.js');
  });

  it('should handle deeply nested paths', () => {
    expect(extractRelativePath('/home/project/src/components/ui/Button.tsx'))
      .toBe('src/components/ui/Button.tsx');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. computeFileModifications
// ═══════════════════════════════════════════════════════════════════

describe('computeFileModifications', () => {
  it('should return undefined when no files are modified', () => {
    const files = {
      '/home/project/a.js': { type: 'file' as const, content: 'same content', isBinary: false },
    };
    const modifiedFiles = new Map([
      ['/home/project/a.js', 'same content'],
    ]);
    const result = computeFileModifications(files, modifiedFiles);
    expect(result).toBeUndefined();
  });

  it('should detect modifications and choose diff when diff is smaller', () => {
    const longContent = 'line1\n'.repeat(100);
    const modifiedContent = 'line1\n'.repeat(99) + 'modified\n';
    const files = {
      '/home/project/a.js': { type: 'file' as const, content: modifiedContent, isBinary: false },
    };
    const modifiedFiles = new Map([
      ['/home/project/a.js', longContent],
    ]);
    const result = computeFileModifications(files, modifiedFiles);
    expect(result).toBeDefined();
    expect(result!['/home/project/a.js']).toBeDefined();
    expect(result!['/home/project/a.js'].type).toBe('diff');
  });

  it('should use file content when diff is larger than the file', () => {
    // Completely different files → diff will be larger than the content
    const files = {
      '/home/project/b.js': { type: 'file' as const, content: 'new', isBinary: false },
    };
    const modifiedFiles = new Map([
      ['/home/project/b.js', 'old completely different content with lots of text'],
    ]);
    const result = computeFileModifications(files, modifiedFiles);
    expect(result).toBeDefined();
    expect(result!['/home/project/b.js'].type).toBe('file');
    expect(result!['/home/project/b.js'].content).toBe('new');
  });

  it('should skip non-file entries', () => {
    const files = {
      '/home/project/dir': { type: 'folder' as const },
    };
    const modifiedFiles = new Map([
      ['/home/project/dir', 'some content'],
    ]);
    const result = computeFileModifications(files as any, modifiedFiles);
    expect(result).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. fileModificationsToHTML
// ═══════════════════════════════════════════════════════════════════

describe('fileModificationsToHTML', () => {
  it('should return undefined for empty modifications', () => {
    expect(fileModificationsToHTML({})).toBeUndefined();
  });

  it('should wrap diff modifications in proper tags', () => {
    const mods = {
      '/home/project/a.js': { type: 'diff' as const, content: '-old\n+new' },
    };
    const result = fileModificationsToHTML(mods);
    expect(result).toContain('<diff path="/home/project/a.js">');
    expect(result).toContain('-old\n+new');
    expect(result).toContain('</diff>');
  });

  it('should wrap file modifications in proper tags', () => {
    const mods = {
      '/home/project/b.js': { type: 'file' as const, content: 'full content' },
    };
    const result = fileModificationsToHTML(mods);
    expect(result).toContain('<file path="/home/project/b.js">');
    expect(result).toContain('full content');
    expect(result).toContain('</file>');
  });

  it('should handle multiple files', () => {
    const mods = {
      '/home/project/a.js': { type: 'diff' as const, content: 'diff a' },
      '/home/project/b.js': { type: 'file' as const, content: 'content b' },
    };
    const result = fileModificationsToHTML(mods);
    expect(result).toBeDefined();
    expect(result).toContain('diff a');
    expect(result).toContain('content b');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. modificationsRegex
// ═══════════════════════════════════════════════════════════════════

describe('modificationsRegex', () => {
  it('should match bolt_file_modifications tags', () => {
    const input = '<bolt_file_modifications>\n<diff path="a.js">content</diff>\n</bolt_file_modifications>\n rest';
    const cleaned = input.replace(modificationsRegex, '');
    // Regex includes trailing \s+ which consumes the space after the closing tag
    expect(cleaned).toBe('rest');
  });

  it('should not match other tags', () => {
    const input = '<other_tag>content</other_tag>';
    const cleaned = input.replace(modificationsRegex, '');
    expect(cleaned).toBe(input);
  });
});
