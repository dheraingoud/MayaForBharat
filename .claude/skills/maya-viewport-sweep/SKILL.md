---
name: maya-viewport-sweep
description: Apply the MAYA viewport-containment recipe when editing any top-level page or layout container. Fixes the recurring "chat + components overflow the viewport, more towards right" bug. Trigger when you touch a `app/**/*.tsx` or `lib/workbench/components/workbench/*Layout*` outermost container.
---

# MAYA Viewport-Containment Recipe

## Symptom
Horizontal scrollbar / content shifted off the right edge ("more towards right") on landing, plan, workbench, builder.

## Root cause (verified 2026-07-03)
`w-screen` / `width:100vw` on an outermost container does NOT subtract the scrollbar width, so a transient scrollbar pushes content right → overflow jiggle. Also: a flex child with `truncate` + a fixed/max width but no `min-w-0` ancestor refuses to shrink → forces parent width.

## The recipe (apply to the OUTERMOST container of a page)
```
style={{
  width: '100%',        // NOT 100vw / w-screen
  maxWidth: '100vw',
  minWidth: 0,
  overflow: 'hidden',    // or overflow-x-hidden
  position: 'relative',
  isolation: 'isolate',
  contain: 'layout paint',
}}
```
Tailwind equivalent: `w-full max-w-[100vw] min-w-0 overflow-hidden isolate` + skip `w-screen`.

## Flex children that truncate
Any `<span|div className="... truncate ...">` inside a `flex` parent MUST have `min-w-0` on the shrinking ancestor. Without it the child measures its content width and breaks the row.

## Known-fixed files (reference, do not re-edit)
- `app/workbench/layout.tsx` — already uses the recipe (commit 45ceaf9).
- Landing `app/page.tsx` uses `min-h-[100dvh]` + `h-[100dvh] overflow-hidden` (good; never add `w-screen`).

## Known culprits (replace `w-screen` → drop it; the parent layout already sets width)
- `lib/workbench/components/workbench/BuilderPage.tsx` line ~1395
- `lib/workbench/components/workbench/WorkbenchLayout.tsx` line ~239
- `app/workbench/page.tsx` line ~18
- `app/app/[id]/page.tsx` line ~302

## Verify after edit
Spawn the `viewport-checker` subagent OR run `node scripts/verify_chat_priming.cjs`. Acceptance: `scrollWidth <= innerWidth` on `/`, plan, `/workbench` — all three.
