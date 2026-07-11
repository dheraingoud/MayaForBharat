/**
 * Tests for the user-prompt name extractor used by /api/apps-from-plan.
 * The extractor must be conservative: when it returns a name, that name is
 * what the apps row gets saved with (overriding whatever the LLM said).
 */
import { describe, it, expect } from 'vitest';
import { extractAppNameFromPrompt } from '@/app/api/apps-from-plan/route';

describe('extractAppNameFromPrompt', () => {
  it('extracts "called X"', () => {
    expect(
      extractAppNameFromPrompt('build a to-do app called Quick Tasks'),
    ).toBe('Quick Tasks');
  });

  it('extracts "named X"', () => {
    expect(
      extractAppNameFromPrompt('I want an app named Recipe Vault'),
    ).toBe('Recipe Vault');
  });

  it('extracts "name it X"', () => {
    expect(extractAppNameFromPrompt('go ahead and name it Tic Tac Pro')).toBe('Tic Tac Pro');
  });

  it('extracts "build me X app"', () => {
    expect(extractAppNameFromPrompt('build me a habit tracker called Day One')).toBe('Day One');
  });

  it('extracts "titled X"', () => {
    expect(
      extractAppNameFromPrompt('make me a markdown editor titled Inkwell'),
    ).toBe('Inkwell');
  });

  it('returns null when no explicit naming cue is present', () => {
    expect(
      extractAppNameFromPrompt('I want users to log in and see charts'),
    ).toBeNull();
  });

  it('handles quoted names', () => {
    expect(
      extractAppNameFromPrompt('an app called "Habit Hive" please'),
    ).toBe('Habit Hive');
  });

  it('caps at 60 chars to fit our app-name column', () => {
    // 80+ char phrase with explicit "called" cue gets trimmed.
    const result = extractAppNameFromPrompt(
      'build me a tool called ' +
        'A Very Very Very Long App Name That Nobody Should Actually Use Ever'.repeat(2),
    );
    expect(result).not.toBeNull();
    expect((result ?? '').length).toBeLessThanOrEqual(60);
  });

  it('returns null on empty / non-string', () => {
    expect(extractAppNameFromPrompt('')).toBeNull();
    // @ts-expect-error runtime defensive
    expect(extractAppNameFromPrompt(undefined)).toBeNull();
  });
});
