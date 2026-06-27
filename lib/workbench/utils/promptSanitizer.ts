// @ts-nocheck
// ─── Prompt scrubbing ─────────────────────────────────────────────────────────
// Removes user-input blocks that look like internal system instructions or
// pipeline directives, so they never leak into:
//   1) The user-visible chat bubble (UI)
//   2) The LLM-bound message body (still leaks pipeline text into the model)
//
// We strip anything matching common "internal instruction" shapes:
//   • "--- MANDATORY ... PIPELINE ---" fenced blocks
//   • "After writing ALL source files, execute ..." pipeline directives
//   • `<boltAction type="...">` XML tag sequences
//   • Patterns starting with "IMPORTANT: Reduce ALL errors ..." trailing tails
//
// We deliberately under-strip — if a real user prompt happens to contain the
// word "pipeline" it's left alone. We only scrub blocks that *visually*
// look like system-prompt leakage.

const PIPELINE_HEADER_RE =
  /\n*---\s*MANDATORY[\s\S]*?(?:PIPELINE|PROCESS|STEPS)[\s\S]*?---/gi

// Sequence of <boltAction …> …</boltAction> tags (anything inside stays).
const BOLTACTION_BLOCK_RE = /<\s*boltAction\b[\s\S]*?<\s*\/\s*boltAction\s*>/gi

// "After writing ALL source files, execute this EXACT sequence" sentences:
const PIPELINE_SEQ_RE =
  /\n*After writing ALL source files[\s\S]*?(?:<boltAction|\d\.\s*`<)/gi

// Trailing boilerplate added by copy-pasted templates.
const IMPORTANT_TAIL_RE =
  /\n*\n*IMPORTANT:\s*Reduce ALL errors to zero\.[\s\S]*$/i

export interface ScrubResult {
  text: string;        // scrubbed visible text
  strippedAny: boolean;// did we strip anything?
  strippedCount: number;
}

/**
 * Scrub pipeline-looking / system-prompt-looking blocks from a user prompt.
 * Idempotent — calling twice yields the same result.
 */
export function scrubPrompt(input: string): ScrubResult {
  if (!input || typeof input !== 'string') {
    return { text: '', strippedAny: false, strippedCount: 0 };
  }
  let text = input;
  let strippedCount = 0;
  const apply = (re: RegExp) => {
    text = text.replace(re, () => {
      strippedCount++;
      return '';
    });
  };

  apply(PIPELINE_HEADER_RE);
  apply(PIPELINE_SEQ_RE);
  apply(BOLTACTION_BLOCK_RE);
  apply(IMPORTANT_TAIL_RE);

  // Collapse any 3+ blank lines left by stripping and trim trailing whitespace.
  text = text.replace(/\n{3,}/g, '\n\n').trimEnd();

  return {
    text,
    strippedAny: strippedCount > 0,
    strippedCount,
  };
}

/**
 * Quick non-allocating check: does this string contain a system-prompt-shaped
 * leak block? Used for telemetry only.
 */
export function looksLikeLeakedSystemPrompt(input: string): boolean {
  if (!input) return false;
  return (
    /\bMANDATORY\b[\s\S]*?\bPIPELINE\b/i.test(input) ||
    /<\s*boltAction\b/i.test(input) ||
    /After writing ALL source files, execute/i.test(input) ||
    /IMPORTANT:\s*Reduce ALL errors to zero/i.test(input)
  );
}
