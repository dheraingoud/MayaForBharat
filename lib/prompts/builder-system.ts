/**
 * MAYA Builder System Prompt — Modular, model-agnostic prompt construction
 *
 * Separated from voice-pipeline.ts for:
 * 1. Clean A/B testing of different prompt strategies
 * 2. Model-agnostic design (works with any LLM)
 * 3. Easy customization per app category
 *
 * PERF NOTE: Every character here costs input tokens → latency.
 * Keep sections TELEGRAPHIC. No decorative separators or verbose prose.
 */

import { MAYA_REGISTRY, STACK_CONTRACT, getPromptTemplate } from './templates'
import type { AppSpec } from '../voice-pipeline'

// ─── Core Rules ──────────────────────────────────────────────────────────────

const CORE_RULES = `RULES:
- TypeScript, Next.js 15 App Router, Tailwind CSS, lucide-react icons.
- Use standard React hooks (useState, useEffect) for state. DO NOT use heavy libraries like zustand, framer-motion, recharts, gsap, or threejs.
- Ensure all mandatory pages are built (e.g. Landing Page, Dashboard, and any core feature pages).
- Self-contained inline components. NEVER import from files you didn't generate.
- ALL UI TEXT: ENGLISH ONLY. No Hindi/Devanagari in the generated app UI.`

// ─── Design System ───────────────────────────────────────────────────────────

const DESIGN_SYSTEM = `DESIGN (CRITICAL):
- The design system is everything. NEVER write explicit colors (e.g. text-white, bg-blue-500) in className.
- ALWAYS use semantic tokens: bg-background, text-foreground, bg-primary. Define these in globals.css using HSL.
- Create ambitious, premium aesthetics (Glassmorphism, Neomorphism, or Minimalist, Brutalism, water glass design).
- Create rich design tokens in globals.css (e.g. --gradient-primary, --shadow-elegant).
- Use Tailwind CSS group-hover and transition utilities for micro-interactions (hover: scale, active: scale).
- Cards: bg-background/70 backdrop-blur-xl border border-white/20 shadow-2xl (Glassmorphism preferred).
- Generate a stunning landing page (app/page.tsx) with a highly styled hero section.
- lucide-react for icons. NO emojis. NO placeholder grey boxes. Generate UI that wows.`

// ─── Compilation Rules ───────────────────────────────────────────────────────

const COMPILATION_RULES = `BUILD RULES (CRITICAL):
1. "use client"; at top of files with hooks/events. Include quotes+semicolon.
2. import { useRouter } from 'next/navigation' — NEVER next/router.
3. Only import icons you ACTUALLY render. No unused imports.
4. Every page.tsx/layout.tsx: export default function.
5. Next.js 15: params are Promises → const { id } = await params;`

// ─── Output Format ───────────────────────────────────────────────────────────

const OUTPUT_FORMAT = `OUTPUT: Return files in <maya-write path="path/to/file">...</maya-write> tags.
Example: <maya-write path="app/page.tsx">
import { ... }
export default function Page() { ... }
</maya-write>`

// ─── Quality Gates ───────────────────────────────────────────────────────────

const QUALITY_GATES = `QUALITY:
- No monolithic files. Small focused components.
- No "Lorem ipsum". Write real contextual copy.
- No TS errors. Loading states (skeleton shimmer). Form validation.
- Mobile-first (390px). Semantic HTML. Look like a funded startup landing page.
- FUNCTIONAL APP: Manage global state using React Context or standard hooks.
- NAVIGATION: \`app/layout.tsx\` MUST include a top-level Navigation bar linking to all generated pages.`

// ─── Factory ─────────────────────────────────────────────────────────────────

export interface BuilderPromptOptions {
  spec: AppSpec
  architectureBlueprint: { scale: string; files: string[] }
  skills?: string
}

/**
 * Constructs the full builder system prompt from modular sections.
 * Model-agnostic: works with Llama, Stepfun, GLM, DeepSeek, etc.
 */
export function buildBuilderSystemPrompt(options: BuilderPromptOptions): string {
  const { spec, architectureBlueprint, skills = '' } = options
  const tpl = getPromptTemplate(spec.category)
  const fileList = architectureBlueprint.files.map((f: string) => `- ${f}`).join('\n')

  return `Expert React/Next.js engineer + UI/UX designer. Generate COMPLETE production-ready app in ONE payload.

${CORE_RULES}

UI: DO NOT import '@/components/ui/*'. Build ALL components inline with HTML+Tailwind.

${DESIGN_SYSTEM}

ADMIN: routes under /admin/*. PIN auth. Username: ${spec.adminUsername || 'Admin'}, PIN: ${spec.adminPin || '1234'}.

${QUALITY_GATES}

${COMPILATION_RULES}

${OUTPUT_FORMAT}

FILES (generate ONLY these):
${fileList}

${MAYA_REGISTRY}
${STACK_CONTRACT}
${tpl.builderContext}
Pages: ${tpl.suggestedPages.join(', ')}
Fields: ${JSON.stringify(tpl.dataFieldHints)}
${skills}`
}
