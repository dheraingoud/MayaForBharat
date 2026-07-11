# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume (STRICTLY). Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# MAYA project-specific notes

## Stack
Next.js 16.2.6 (App Router) · React 19 · AI SDK v6 (`ai`, `@ai-sdk/react`) · Convex 1.39 (backend + scheduler, **free tier**) · WebContainer 1.6 (`@webcontainer/api`) · react-resizable-panels · framer-motion · Tailwind 4.2 (CSS-first) · lucide-react · react-toastify. NIM (NVIDIA) models via `lib/workbench/llm/nim-router.ts`; tiers env = `MAYA_MINI`/`MAYA_FAST`/`MAYA_MAX` + `NVIDIA_API_KEY_1/2`. `lib/workbench/**` is vendored bolt.diy — edit surgically, don't reformat.

## Theme palette (use these exact tokens, dark UI)
- bg `#111110` · header/depth-2 `#1A1917` · accent (Maya orange) `#E8601A` · text `#F5F4F0` · muted `#6B6560`/`#3A3835` · success `#2D7A4F` · card-header grad `#222120`→`#1A1917`.
- Fonts: `var(--font-outfit, var(--font-sora))`. Bilingual hi/en via `useLanguage()` — every user-facing string has both.

## Viewport rule (the recurring bug — read this before touching any outer container)
`w-screen`/`width:100vw` does NOT subtract scrollbar width → horizontal overflow ("more towards right"). Use the containment recipe in `.claude/skills/maya-viewport-sweep/SKILL.md`: `width:100%`/`maxWidth:100vw`/`minWidth:0`/`overflow:hidden`/`isolation:isolate`/`contain:layout paint`. Any `truncate` child of a flex row needs `min-w-0` on the shrinking ancestor. Verify with the `viewport-checker` subagent on `/`, plan, `/workbench` (>=3 pages).

## Ai & internals
- Empty LLM output (reasoning models emit reasoning tokens before the answer) → was masked by a heuristic plan fallback. Root cause was a too-small `maxOutputTokens` (700) truncating reasoning before the answer; budget it from the `nim-router` catalog token caps. Never 502 the user — heuristic fallback is allowed but must be labeled (`fallback:true`), never silent.
- Detached generation: builds live on Convex (`generateJobs` table + `generateJobsHandler`), survive browser close. In-browser WebContainer is editor/preview only. `BuilderPageWithJob` mounts `BuilderPage` once a job is `live` OR when the `apps` row has `specJson` and no live job (come-back path) — so the progressive chat always renders.
- `apps` status union: `building|preview|live|evolving|error|deployed`. `generateJobs` status: `pending|building|live|error|cancelled`.
- `removeAllApps({confirm:'RESET_APPS'})` cascade wipes all 4 tables — guarded; only intentional.

## Hard rules (from prior trauma)
- **Never bulk-rewrite a file** (a prior session wiped BuilderPage.tsx to stub via Write). Use Edit for surgical diffs; never overwrite a large component wholesale.
- Never run a Python "brace fix" script against `.tsx` (the `_fix.py`/`_fix.cjs`/`_patch.py` scripts in `scripts/` are dead one-shots from a PlanHeader mangling — do not reintroduce).
- Don't propose destructive ops (hard-reset, convex wipe, `rm -rf`) unless the user explicitly asks.
- Commit per logical phase; keep `npx tsc --noEmit` at 0 errors. The `maya-tsc-guardian` PostToolUse hook is advisory.
- `.env`/`.env.local` writes are denied by `.claude/settings.json`.

