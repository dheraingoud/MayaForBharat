/**
 * extractBoltFiles(text, isFinal?) — pull `<boltAction type="file" filePath="...">content</boltAction>`
 * blocks out of an assistant message in `build` chatMode.
 *
 * Reusable outside Convex (the worker uses server-side; the client message-parser.ts
 * uses a different streaming-callback approach and is not interchangeable).
 *
 * Two modes:
 *   - partial (isFinal=false): even mid-stream we can recover files the model has
 *     fully emitted (closing tag present) and surface them to Convex as best-effort
 *     progress ("3 files detected so far"). Incomplete blocks are skipped.
 *   - final (isFinal=true): same regex, no special behavior — we always use this
 *     on the worker's `onFinish` where partialText is the complete assistant text.
 *
 * Returns `Array<{ path, content }>`. Path is the filePath attribute; content is
 * the inner text trimmed of trailing whitespace plus a trailing newline (matches
 * StreamingMessageParser's behavior in lib/workbench/runtime/message-parser.ts).
 */

const BOLT_FILE_ACTION_RE =
  /<boltAction\s+([^>]*?)type="file"([^>]*?)>([\s\S]*?)<\/boltAction>/g;

function extractAttr(blob: string, name: string): string | null {
  const re = new RegExp(`${name}="([^"]+)"|${name}='([^']+)'`);
  const m = blob.match(re);
  if (!m) return null;
  return m[1] ?? m[2] ?? null;
}

function cleanContent(raw: string): string {
  let s = raw;
  // Markdown code-fence cleanup (mirror StreamingMessageParser.cleanoutMarkdownSyntax)
  const fenceMatch = s.match(/^\s*```\w*\n([\s\S]*?)\n\s*```\s*$/);
  if (fenceMatch) s = fenceMatch[1];
  // NOTE: We intentionally do NOT decode HTML entities here. The regex only
  // matches when both `<boltAction>` and `</boltAction>` are present, so the
  // inner content arrives as plain text already; the message-parser.ts upstream
  // does its own escaping. Adding an entity-decode pass risks double-decoding
  // when content legitimately contains `&` characters.
  return s.trim() + '\n';
}

export interface BoltFile {
  path: string;
  content: string;
}

export function extractBoltFiles(text: string, _isFinal = false): BoltFile[] {
  if (!text) return [];
  const out: BoltFile[] = [];
  let m: RegExpExecArray | null;
  BOLT_FILE_ACTION_RE.lastIndex = 0;
  while ((m = BOLT_FILE_ACTION_RE.exec(text)) !== null) {
    const attrs = (m[1] ?? '') + ' ' + (m[2] ?? '');
    const filePath =
      extractAttr(attrs, 'filePath') ??
      extractAttr(attrs, 'file') ??
      extractAttr(attrs, 'path');
    if (!filePath) continue;
    const content = cleanContent(m[3] ?? '');
    if (content.length === 0) continue;
    out.push({ path: filePath, content });
  }
  return out;
}
