// MAYA-specific: stripIndent utility tests
// Verifies both regular function call and tagged template literal usage

import { describe, expect, it } from 'vitest';
import { stripIndent, stripIndents } from '@/lib/workbench/utils/stripIndent';

describe('stripIndent', () => {
  it('should strip common indentation from multiline strings', () => {
    const result = stripIndent(`
      Hello
      World
    `);
    expect(result.trimEnd()).toBe('\nHello\nWorld');
  });

  it('should handle strings with no indentation', () => {
    const result = stripIndent('Hello\nWorld');
    expect(result).toBe('Hello\nWorld');
  });

  it('should handle empty strings', () => {
    expect(stripIndent('')).toBe('');
  });

  it('should work as a tagged template literal', () => {
    const name = 'World';
    const result = stripIndents`
      Hello
      ${name}
    `;
    // stripIndent preserves trailing whitespace on final line
    expect(result.trimEnd()).toBe('\nHello\nWorld');
  });

  it('should handle tagged templates with multiple values', () => {
    const a = 'foo';
    const b = 'bar';
    const result = stripIndents`
      ${a}
      ${b}
    `;
    // stripIndent preserves trailing whitespace on final line
    expect(result.trimEnd()).toBe('\nfoo\nbar');
  });

  it('stripIndents should be an alias for stripIndent', () => {
    expect(stripIndents).toBe(stripIndent);
  });
});
