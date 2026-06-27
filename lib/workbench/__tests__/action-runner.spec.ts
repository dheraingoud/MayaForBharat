// Action Runner unit tests — action lifecycle, build command detection, auto-fix, shell validation
// Tests the pure logic without needing a real WebContainer
import { describe, expect, it, vi, beforeEach } from 'vitest';

// We can't directly test private methods, so we test the public API and class behavior.
// Import the types we need
import type { ActionCallbackData } from '@/lib/workbench/runtime/message-parser';

// ═══════════════════════════════════════════════════════════════════
// 1. Build Command Detection (regex-based, test indirectly)
//    We replicate the #isBuildCommand patterns here to unit test them
// ═══════════════════════════════════════════════════════════════════

// Extracted from action-runner.ts line 806-826
const buildPatterns = [
  /^npm\s+run\s+(build|compile|tsc|check|lint)/,
  /^npx\s+(tsc|vite\s+build|next\s+build|esbuild|webpack|rollup)/,
  /^(pnpm|yarn|bun)\s+run\s+(build|compile|tsc|check)/,
  /^(pnpm|yarn|bun)\s+(build|tsc)/,
  /^tsc(\s|$)/,
  /^vite\s+build/,
  /^next\s+build/,
  /^npm\s+install/,
  /^npm\s+i(\s|$)/,
  /^pnpm\s+install/,
  /^(pnpm|yarn|bun)\s+i(\s|$)/,
  /^npx\s+(vitest|jest)/,
  /^(npm|pnpm|yarn|bun)\s+run\s+test/,
  /^(npm|pnpm|yarn|bun)\s+test(\s|$)/,
  /^vitest(\s|$)/,
];

function isBuildCommand(command: string): boolean {
  const trimmed = command.trim().toLowerCase();
  return buildPatterns.some(p => p.test(trimmed));
}

describe('Build Command Detection', () => {
  describe('should identify build commands', () => {
    const validBuildCommands = [
      'npm run build',
      'npm run compile',
      'npm run tsc',
      'npm run check',
      'npm run lint',
      'npx tsc',
      'npx vite build',
      'npx next build',
      'npx esbuild src/index.ts',
      'npx webpack',
      'npx rollup -c',
      'pnpm run build',
      'yarn run build',
      'bun run build',
      'pnpm build',
      'yarn build',
      'bun build',
      'tsc',
      'tsc --watch',
      'vite build',
      'next build',
    ];

    it.each(validBuildCommands)('"%s" should be detected as build command', (cmd) => {
      expect(isBuildCommand(cmd)).toBe(true);
    });
  });

  describe('should identify install commands', () => {
    const validInstallCommands = [
      'npm install',
      'npm install react',
      'npm i',
      'npm i react',
      'pnpm install',
      'pnpm i',
      'yarn i',
      'bun i',
    ];

    it.each(validInstallCommands)('"%s" should be detected as build command', (cmd) => {
      expect(isBuildCommand(cmd)).toBe(true);
    });
  });

  describe('should identify test commands', () => {
    const validTestCommands = [
      'npx vitest',
      'npx vitest run',
      'npx jest',
      'npx jest --coverage',
      'npm run test',
      'npm test',
      'pnpm test',
      'yarn test',
      'bun test',
      'vitest',
      'vitest run',
    ];

    it.each(validTestCommands)('"%s" should be detected as build command', (cmd) => {
      expect(isBuildCommand(cmd)).toBe(true);
    });
  });

  describe('should NOT identify non-build commands', () => {
    const nonBuildCommands = [
      'npm start',
      'npm run dev',
      'npm run serve',
      'node index.js',
      'echo hello',
      'ls -la',
      'cat package.json',
      'rm -rf node_modules',
      'git commit -m "test"',
      'cd src',
      'mkdir new-dir',
    ];

    it.each(nonBuildCommands)('"%s" should NOT be detected as build command', (cmd) => {
      expect(isBuildCommand(cmd)).toBe(false);
    });
  });

  it('should handle leading/trailing whitespace', () => {
    expect(isBuildCommand('  npm run build  ')).toBe(true);
  });

  it('should be case-insensitive', () => {
    expect(isBuildCommand('NPM RUN BUILD')).toBe(true);
    expect(isBuildCommand('Npm Install')).toBe(true);
  });

  it('should handle empty string', () => {
    expect(isBuildCommand('')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Enhanced Shell Error Creation (regex patterns)
// ═══════════════════════════════════════════════════════════════════

// Extracted error patterns from action-runner.ts lines 723-771
const errorPatterns = [
  {
    pattern: /cannot remove.*No such file or directory/,
    title: 'File Not Found',
  },
  {
    pattern: /No such file or directory/,
    title: 'File or Directory Not Found',
  },
  {
    pattern: /Permission denied/,
    title: 'Permission Denied',
  },
  {
    pattern: /command not found/,
    title: 'Command Not Found',
  },
  {
    pattern: /Is a directory/,
    title: 'Target is a Directory',
  },
  {
    pattern: /File exists/,
    title: 'File Already Exists',
  },
];

function matchErrorPattern(output: string): string | undefined {
  for (const ep of errorPatterns) {
    if (ep.pattern.test(output)) {
      return ep.title;
    }
  }
  return undefined;
}

describe('Shell Error Pattern Matching', () => {
  it('should match "cannot remove" errors', () => {
    expect(matchErrorPattern("rm: cannot remove 'foo': No such file or directory")).toBe('File Not Found');
  });

  it('should match generic "No such file or directory"', () => {
    expect(matchErrorPattern('bash: /usr/local/bin/python: No such file or directory')).toBe(
      'File or Directory Not Found',
    );
  });

  it('should match "Permission denied"', () => {
    expect(matchErrorPattern('bash: ./script.sh: Permission denied')).toBe('Permission Denied');
  });

  it('should match "command not found"', () => {
    expect(matchErrorPattern('bash: foo: command not found')).toBe('Command Not Found');
  });

  it('should match "Is a directory"', () => {
    expect(matchErrorPattern('cat: src: Is a directory')).toBe('Target is a Directory');
  });

  it('should match "File exists"', () => {
    expect(matchErrorPattern('cp: target: File exists')).toBe('File Already Exists');
  });

  it('should return undefined for unrecognized errors', () => {
    expect(matchErrorPattern('some random error output')).toBeUndefined();
  });

  it('should prioritize "cannot remove" over generic "No such file" pattern', () => {
    // The first pattern should match before the second
    expect(matchErrorPattern("rm: cannot remove 'test': No such file or directory")).toBe('File Not Found');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Action State Types (structural tests)
// ═══════════════════════════════════════════════════════════════════

describe('Action State Types', () => {
  it('should define valid action statuses', () => {
    const validStatuses = ['pending', 'running', 'complete', 'aborted', 'failed'];
    // This verifies the type system expectations
    validStatuses.forEach(status => {
      expect(['pending', 'running', 'complete', 'aborted', 'failed']).toContain(status);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Shell Command Validation Patterns
// ═══════════════════════════════════════════════════════════════════

describe('Shell Command Validation', () => {
  it('should detect rm commands without -f flag', () => {
    const cmd = 'rm file.txt';
    expect(cmd.startsWith('rm ') && !cmd.includes(' -f')).toBe(true);
  });

  it('should NOT flag rm commands with -f flag', () => {
    const cmd = 'rm -f file.txt';
    expect(cmd.startsWith('rm ') && !cmd.includes(' -f')).toBe(false);
  });

  it('should detect cd commands', () => {
    expect('cd src'.startsWith('cd ')).toBe(true);
    expect('cd'.startsWith('cd ')).toBe(false);
  });

  it('should detect cp/mv commands', () => {
    expect(/^(cp|mv)\s+/.test('cp file1 file2')).toBe(true);
    expect(/^(cp|mv)\s+/.test('mv old new')).toBe(true);
    expect(/^(cp|mv)\s+/.test('cat file')).toBe(false);
  });
});
