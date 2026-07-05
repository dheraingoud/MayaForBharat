import { describe, expect, it } from 'vitest';
import { nextParsedState } from './useMessageParser';

describe('nextParsedState — identity preservation breaks the parse-loop', () => {
  it('returns the SAME reference when a re-parse yields no new content (isLoading, appending)', () => {
    const prev = { 0: 'hello world' };
    // isLoading=true appends newParsedContent; '' means no new delta for this msg
    const result = nextParsedState(prev, 0, '', true);
    expect(result).toBe(prev); // identity preserved — no setState re-render
    expect(result[0]).toBe('hello world');
  });

  it('returns a NEW object when content actually grows (streaming append)', () => {
    const prev = { 0: 'hello' };
    const result = nextParsedState(prev, 0, ' world', true);
    expect(result).not.toBe(prev);
    expect(result[0]).toBe('hello world');
  });

  it('returns the SAME reference when non-streaming re-parse matches existing content', () => {
    const prev = { 1: 'final content' };
    const result = nextParsedState(prev, 1, 'final content', false);
    expect(result).toBe(prev);
  });

  it('returns a NEW object when non-streaming content differs', () => {
    const prev = { 1: 'old' };
    const result = nextParsedState(prev, 1, 'new', false);
    expect(result).not.toBe(prev);
    expect(result[1]).toBe('new');
  });

  it('preserves other keys when updating one', () => {
    const prev = { 0: 'a', 1: 'b', 2: 'c' };
    const result = nextParsedState(prev, 1, 'B', false);
    expect(result[0]).toBe('a');
    expect(result[1]).toBe('B');
    expect(result[2]).toBe('c');
  });

  it('handles first-seen index (undefined -> content) as a new object', () => {
    const prev: { [key: number]: string } = {};
    const result = nextParsedState(prev, 0, 'first', true);
    expect(result).not.toBe(prev);
    expect(result[0]).toBe('first');
  });
});
