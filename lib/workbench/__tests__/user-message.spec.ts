// F2 regression guard: stripMetadata must collapse EVERY auto-fix breadcrumb
// format to '' so UserMessage renders null (no fake user bubble during auto-fix).
// A breadcrumb is sent as role:'user' by BuilderPage's autoFixAlert subscriber
// to re-trigger the LLM; the user must NEVER see it. If stripMetadata lets even
// one byte through, a "message from the user without the user typing" renders.
import { describe, expect, it } from 'vitest';
import { stripMetadata } from '@/lib/workbench/components/chat/UserMessage';

describe('stripMetadata — auto-fix breadcrumb collapse (F2)', () => {
  it('strips the legacy asterisked "*Auto-fix attempt N/M" preamble', () => {
    const out = stripMetadata('*Auto-fix attempt 1/15 — Fix this terminal error*');
    expect(out).toBe('');
  });

  it('strips "MAYA is fixing a terminal error (attempt N/M)…"', () => {
    const out = stripMetadata('MAYA is fixing a terminal error (attempt 1/15)…');
    expect(out).toBe('');
  });

  it('strips "MAYA is fixing a preview error (attempt N/M)…"', () => {
    const out = stripMetadata('MAYA is fixing a preview error (attempt 2/15)…');
    expect(out).toBe('');
  });

  // F2+auto-run leak (2026-07-05): BuilderPage L869 emits a DISTINCT breadcrumb
  // — "fixing a preview that didn't load" (not "fixing a preview error") — with
  // MAX_AUTO_RUN_CYCLES=3 (not 15). The original regex matched only "preview
  // error", so this variant leaked through as a FAKE USER BUBBLE in chat. Guard
  // both the wording variant AND the smaller N/M cap.
  it('strips "MAYA is fixing a preview that didn\'t load (attempt N/M)…" (auto-run variant)', () => {
    const out = stripMetadata("MAYA is fixing a preview that didn't load (attempt 1/3)…");
    expect(out).toBe('');
  });

  it('strips "MAYA is fixing a preview that didn\'t load (attempt N/M)." trailing-period variant', () => {
    const out = stripMetadata("MAYA is fixing a preview that didn't load (attempt 2/3). ");
    expect(out).toBe('');
  });

  it('strips "MAYA is continuing the build (attempt N/M)…"', () => {
    const out = stripMetadata('MAYA is continuing the build (attempt 3/15)…');
    expect(out).toBe('');
  });

  it('strips a trailing sentence variant (ends with ". " not "…")', () => {
    const out = stripMetadata('MAYA is fixing a terminal error (attempt 1/15). ');
    expect(out).toBe('');
  });

  it('leaves a real user prompt completely untouched', () => {
    const prompt = 'Build me a customer-feedback dashboard with a rating filter.';
    expect(stripMetadata(prompt)).toBe(prompt);
  });

  it('leaves a normal multi-line user message untouched', () => {
    const prompt = 'Add a dark mode toggle to the header.\n\nKeep it under 10 lines.';
    expect(stripMetadata(prompt)).toBe(prompt);
  });
});

describe('stripMetadata — bolt internals never surface (defense-in-depth, F2/D3)', () => {
  it('strips a complete <boltArtifact>…</boltArtifact>', () => {
    const out = stripMetadata('<boltArtifact title="App">inner stuff</boltArtifact>');
    expect(out).toBe('');
  });

  it('strips paired <boltAction>…</boltAction> with inner XML', () => {
    const out = stripMetadata('<boltAction type="shell">npm run dev</boltAction>');
    expect(out).toBe('');
  });

  it('strips self-closing <boltAction .../> and <boltArtifact .../>', () => {
    const out = stripMetadata('<boltAction type="file" filePath="a.ts" />');
    expect(out).toBe('');
  });

  it('strips a truncated open-only <boltAction> (stream cut mid-emit)', () => {
    const out = stripMetadata('<boltAction type="shell">npm run dev');
    // The open-only regex must kill the opening tag; "npm run dev" text remains
    // (no closing tag to bound it) — acceptable: the dangerous tag is gone.
    expect(out).not.toContain('<boltAction');
    expect(out).not.toContain('</boltAction');
  });

  it('strips ANSI color escapes a WebContainer dump can carry', () => {
    const out = stripMetadata('\x1b[31mError\x1b[0m something');
    expect(out).toBe('Error something');
  });

  it('collapses 3+ newlines to 2', () => {
    const out = stripMetadata('a\n\n\n\n\nb');
    expect(out).toBe('a\n\nb');
  });

  it('strips MODEL/PROVIDER regex tags from the start of a user message', () => {
    // constants.ts: MODEL_REGEX=/^\[Model: (.*?)\]\n\n/, PROVIDER_REGEX=/\[Provider: (.*?)\]\n\n/
    const out = stripMetadata('[Model: mini]\n\n[Provider: nim]\n\nbuild me a todo app');
    expect(out).toBe('build me a todo app');
  });
});
