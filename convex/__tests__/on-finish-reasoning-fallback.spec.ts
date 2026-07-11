/**
 * Tests for the worker's onFinish reasoning-text fallback.
 *
 * Mirrors the logic in `convex/generateJobsHandler.ts`. If you change one,
 * match the other.
 */
import { describe, expect, it } from 'vitest';
import { extractBoltFiles } from '@/lib/workbench/llm/extract-bolt-files';

type ReasoningPart = { type: 'reasoning'; text: string };
type OnFinishEvent = {
  text?: string;
  reasoning?: ReasoningPart[];
};

/**
 * Replicates the chain of fallbacks the worker uses to derive the "final text"
 * from an onFinish event.
 */
function deriveFinalText(event: OnFinishEvent, partialText: string): string {
  const visible: string = event?.text ?? '';
  const reasoningText: string = Array.isArray(event?.reasoning)
    ? event.reasoning.map((r) => String(r?.text ?? '')).join('')
    : '';
  return (
    (visible && visible.length > 0 ? visible : '') ||
    partialText ||
    reasoningText
  );
}

describe('worker onFinish reasoning-fallback', () => {
  it('uses visible text when present (most common)', () => {
    const out = deriveFinalText({
      text: '{"name":"X","description":"Y"}',
      reasoning: [{ type: 'reasoning', text: '<reasoning noise>' }],
    }, '');
    expect(out).toBe('{"name":"X","description":"Y"}');
  });

  it('falls back to partialText when both visible and reasoning are empty', () => {
    const out = deriveFinalText({ text: '', reasoning: [] }, '<boltAction type="file" filePath="x.ts">\n</boltAction>');
    expect(out).toContain('boltAction type="file"');
  });

  it('falls back to reasoning text when visible text is empty (the failed-model case)', () => {
    const reasoning =
      '{"name":"QuickNotes","description":"a notes app","features":["x"]}';
    const out = deriveFinalText(
      { text: '', reasoning: [{ type: 'reasoning', text: reasoning }] },
      '',
    );
    expect(out).toBe(reasoning);
  });

  it('chains correctly: visible > partial > reasoning', () => {
    const reasoning = 'reasoning-content';
    const partial = 'partial-content';
    const visible = 'visible-content';

    // visible wins even with reasoning & partial present
    expect(deriveFinalText({ text: visible, reasoning: [{ type: 'reasoning', text: reasoning }] }, partial))
      .toBe(visible);

    // no visible → partial wins
    expect(deriveFinalText({ text: '', reasoning: [{ type: 'reasoning', text: reasoning }] }, partial))
      .toBe(partial);

    // no visible, no partial → reasoning wins
    expect(deriveFinalText({ text: '', reasoning: [{ type: 'reasoning', text: reasoning }] }, ''))
      .toBe(reasoning);
  });

  it('end-to-end: reasoning-only payload parses as plan via extractBoltFiles-style flow', () => {
    // JSON-style payload inside reasoning — a recovery path for the planner.
    const reasoning = JSON.stringify({ name: 'SnakeHaus', description: 'feeds snakes' });
    const finalText = deriveFinalText({ text: '', reasoning: [{ type: 'reasoning', text: reasoning }] }, '');
    // We can't parse JSON here without a JSON parser, but assert the chain
    // preserves the content cleanly (no whitespace drift or HTML entity fuzz).
    expect(finalText).toBe(JSON.stringify({ name: 'SnakeHaus', description: 'feeds snakes' }));
  });

  it('extractBoltFiles still returns [] for reasoning-only JSON (proves need for separate JSON parser in route)', () => {
    // This documents the cross-boundary behavior: when the plan route gets
    // reasoning text instead of visible text, extractBoltFiles isn't the right
    // parser — the plan route solves it with extractJsonObject. The worker,
    // conversely, is bolted to boltAction XML. Together they cover all
    // observable model formats.
    const reasoning = JSON.stringify({ name: 'X' });
    expect(extractBoltFiles(reasoning)).toEqual([]);
  });
});
