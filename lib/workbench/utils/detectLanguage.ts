/**
 * Detect whether a user wrote in Hindi (Devanagari script) or English.
 *
 * Used by the chat UI to localize MAYA's chrome labels (Thinking / Thought
 * for Xs, stream status, empty-response warning) to match the language the
 * user is speaking in — not a static global toggle.
 *
 * Conservative: any Devanagari codepoint (U+0900–U+097F) OR the common
 * Devanagari digit/vedic extensions tilts to 'hi'. Otherwise 'en'. This is
 * a script-level heuristic, not NLP — fast, allocation-free, good enough to
 * pick the label language for a single message.
 */
export type ChatLanguage = 'hi' | 'en';

const DEVANAGARI = /[ऀ-ॿ]/;

export function detectLanguage(text: string | undefined | null): ChatLanguage {
  if (!text) return 'en';
  return DEVANAGARI.test(text) ? 'hi' : 'en';
}
