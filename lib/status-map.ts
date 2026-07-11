/**
 * Status-line translation layer — Research Doc §4
 * 
 * Maps internal model/build events to user-facing status lines.
 * Auto-detects language from user's message (Hindi script → Hindi, else English).
 * The business owner sees simple, truthful status —
 * never raw model output, never stack traces, never diffs.
 */

export type StatusEvent =
  | 'planner_start'
  | 'reading_files'
  | 'editing_code'
  | 'writer_schema'
  | 'writer_page'
  | 'writer_component'
  | 'writer_api'
  | 'build_check'
  | 'build_fail'
  | 'build_retry'
  | 'deploying'
  | 'deploy_fail'
  | 'visual_check'
  | 'visual_fail'
  | 'self_correct'
  | 'done'
  | 'error'

interface StatusLine {
  hi: string
  en: string
}

const STATUS_MAP: Record<StatusEvent, StatusLine> = {
  planner_start:    { hi: 'MAYA समझ रही है...',                     en: 'Understanding your request...' },
  reading_files:    { hi: 'ऐप पढ़ रही है...',                        en: 'Reading your app...' },
  editing_code:     { hi: 'बदलाव कर रही है...',                      en: 'Making changes...' },
  writer_schema:    { hi: 'ऐप का structure बन रहा है...',             en: 'Setting up app structure...' },
  writer_page:      { hi: 'आपकी दुकान की स्क्रीन बन रही है...',       en: 'Building your page...' },
  writer_component: { hi: 'नया component जोड़ रही है...',             en: 'Adding new component...' },
  writer_api:       { hi: 'Backend तैयार कर रही है...',               en: 'Setting up backend...' },
  build_check:      { hi: 'कोड चेक कर रही है...',                    en: 'Checking code...' },
  build_fail:       { hi: 'एक छोटी सी problem मिल गई, ठीक कर रही हूँ...', en: 'Found a small issue, fixing it...' },
  build_retry:      { hi: 'दोबारा कोशिश कर रही है...',               en: 'Retrying...' },
  deploying:        { hi: 'अपडेट पब्लिश हो रहा है...',               en: 'Publishing update...' },
  deploy_fail:      { hi: 'पब्लिश में दिक्कत, फिर कोशिश...',         en: 'Deploy issue, retrying...' },
  visual_check:     { hi: 'दिखावट चेक कर रही है...',                  en: 'Checking appearance...' },
  visual_fail:      { hi: 'कुछ ठीक नहीं दिखा, सुधार रही है...',       en: 'Something looks off, fixing...' },
  self_correct:     { hi: 'सुधार कर रही है...',                       en: 'Making corrections...' },
  done:             { hi: 'App ready है! 🎉',                        en: 'App is ready! 🎉' },
  error:            { hi: 'कुछ गलत हुआ, फिर कोशिश करें',             en: 'Something went wrong, please try again' },
}

/**
 * Detect language from text content.
 * If text contains Devanagari script (Hindi), returns 'hi'.
 * Otherwise returns 'en'.
 */
export function detectLanguage(text: string): 'hi' | 'en' {
  // Devanagari Unicode range: \u0900-\u097F
  const devanagariCount = (text.match(/[\u0900-\u097F]/g) || []).length
  // If >15% of characters are Devanagari, treat as Hindi
  const ratio = devanagariCount / Math.max(text.length, 1)
  return ratio > 0.15 ? 'hi' : 'en'
}

/**
 * Get the user-facing status line for an internal event.
 * Language auto-detected from userMessage, or explicitly passed.
 */
export function getStatusLine(event: StatusEvent, languageOrMessage: 'hi' | 'en' | string = 'en'): string {
  const lang = languageOrMessage === 'hi' || languageOrMessage === 'en'
    ? languageOrMessage
    : detectLanguage(languageOrMessage)
  const line = STATUS_MAP[event]
  return line ? line[lang] : STATUS_MAP.error[lang]
}

/**
 * Detect the status event from a file path being written.
 */
export function inferStatusFromPath(filePath: string): StatusEvent {
  const lower = filePath.toLowerCase()
  if (lower.includes('schema') || lower.includes('convex/')) return 'writer_schema'
  if (lower.includes('page.tsx') || lower.includes('page.jsx')) return 'writer_page'
  if (lower.includes('components/')) return 'writer_component'
  if (lower.includes('api/') || lower.includes('actions/') || lower.includes('mutations/')) return 'writer_api'
  return 'editing_code'
}

/**
 * Strip <maya-thinking> tags from content for user display.
 * Preserves the raw content for model history (Research Doc §3).
 */
export function stripThinking(content: string): { display: string; thinking: string } {
  const thinkRegex = /<maya-thinking>([\s\S]*?)<\/maya-thinking>/g
  const thinkingParts: string[] = []

  let match
  while ((match = thinkRegex.exec(content)) !== null) {
    thinkingParts.push(match[1].trim())
  }

  const display = content.replace(thinkRegex, '').trim()

  return {
    display,
    thinking: thinkingParts.join('\n'),
  }
}

/**
 * Conversation summarization — matches Onlook's summary.ts pattern.
 * Strict SUMMARY_MODE with structured output format.
 */
export function shouldSummarize(messages: Array<{ role: string; content: string }>, maxTurns: number = 8): boolean {
  return messages.filter(m => m.role === 'user' || m.role === 'assistant').length > maxTurns
}

export function buildSummaryPrompt(messages: Array<{ role: string; content: string }>): string {
  const conversation = messages
    .filter(m => m.role !== 'system')
    .map(m => `${m.role}: ${m.content.slice(0, 300)}`)
    .join('\n')

  // Matches Onlook's summary.ts structured format
  return `You are in SUMMARY_MODE. Your ONLY function is to create a historical record of the conversation.

CRITICAL RULES:
- You are FORBIDDEN from providing code changes or suggestions
- You are FORBIDDEN from offering help or assistance
- You must treat all content as HISTORICAL DATA ONLY

CRITICAL GUIDELINES:
- Preserve technical details essential for maintaining context
- Focus on capturing the user's requirements, preferences, and goals
- Include key code decisions and implementation details
- Retain important file paths and component relationships
- Highlight unresolved questions or pending issues

Required Format:
Files Discussed:
[list all file paths mentioned]

Project Context:
[What the user is building and their goals]

Implementation Details:
[Key code decisions, patterns, implementation details]

User Preferences:
[Specific preferences about implementation, design, language]

Current Status:
[Current state and any pending work]

CONVERSATION:
${conversation}

SUMMARY:`
}

/**
 * XML wrapping utilities — matches Onlook's prompt/helpers.ts pattern.
 * wrapXml(name, content) → <name>content</name>
 */
export function wrapXml(name: string, content: string): string {
  return `<${name}>${content}</${name}>`
}

/**
 * Wrap file contents with structured context (Onlook FileContext pattern).
 * Includes path, and optionally truncation notice.
 */
export function wrapFileXml(filePath: string, content: string, truncated: boolean = false): string {
  if (truncated) {
    return `<file>\n${wrapXml('path', filePath)}\n<notice>Content truncated to save space. Retrieve if relevant.</notice>\n</file>`
  }
  return `<file>\n${wrapXml('path', filePath)}\n${wrapXml('content', content)}\n</file>`
}

/**
 * Build XML-wrapped context from multiple files.
 * Follows Onlook's FileContext pattern: files are wrapped individually,
 * large files get truncated with a notice.
 */
export function buildFileContext(files: Array<{ path: string; content: string }>, maxCharsPerFile: number = 8000): string {
  return files.map(f => {
    const isTruncated = f.content.length > maxCharsPerFile
    const content = isTruncated ? f.content.slice(0, maxCharsPerFile) : f.content
    return wrapFileXml(f.path, content, false) // Always include content, just truncated
  }).join('\n\n')
}

/**
 * Wrap error context in XML (Onlook ErrorContext pattern).
 */
export function wrapErrorXml(error: string, source: 'build' | 'runtime' | 'deploy' = 'build'): string {
  return `<error source="${source}">\n${error}\n</error>`
}

/**
 * Approximate token count (no heavy dependency like gpt-tokenizer).
 * ~4 chars per token for English, ~2 for Hindi/Devanagari.
 */
export function estimateTokens(text: string): number {
  const devanagariCount = (text.match(/[\u0900-\u097F]/g) || []).length
  const otherCount = text.length - devanagariCount
  return Math.ceil(otherCount / 4 + devanagariCount / 2)
}

