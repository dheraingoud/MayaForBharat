// astryx-demo — hidden smoke route proving astryx CSS wires into the MAYA
// (Next 16 + Tailwind v4 + Turbopack) pipeline. Visit /astryx-demo.
//
// Resolution history (Windows + Turbopack traps, for the next soul):
//   1. bun `file:../important-addons/astryx/packages/core` (package DIR link)
//      → node_modules/@astryxdesign/core became a symlink/junction → Turbopack
//      "Invalid symlink" at resolve time. Dead.
//   2. relative `../../../important-addons/astryx/packages/core/dist/astryx.css`
//      (real file, correct path math, but OUTSIDE the app-maya project root)
//      → Turbopack "Module not found" — it sandboxes imports to the Next project
//      root and refuses files above `../`. Dead.
//   3. `pnpm pack` astryx into .tgz tarballs, `bun add` via `file:../*.tgz`
//      → bun extracts real dirs into node_modules/@astryxdesign/* (ls shows no
//      symlinks), BUT Turbopack's exports_field → FileSource::content step STILL
//      throws "Invalid symlink" (intermittent — likely OneDrive reparse points on
//      the bun-hardlinked files, or a Turbopack exports_field+`.css` edge case).
//      Dead for reliable builds.
//   4. WINNER: copy the built CSS INTO the app-maya project tree
//      (styles/astryx/*.css) and import via a within-root relative path. No
//      node_modules resolution, no exports_field, no symlinks/junctions/reparse
//      points anywhere in the path → Turbopack happy. Refresh by re-copying from
//      important-addons/astryx/packages/{core,themes/neutral}/dist/*.css.
//
// SKIP reset.css (astryx/global reset would clobber MAYA Tailwind globals).
// No JS/StyleX imports → the missing @stylexjs/stylex + lucide-react peer deps
// are irrelevant for a CSS-only token smoke.
import '../../styles/astryx/astryx.css';
import '../../styles/astryx/theme.css';

export default function AstryxDemoPage() {
  return (
    <main
      data-astryx-theme="neutral"
      style={{
        minHeight: '100dvh',
        padding: 'var(--astryx-section-padding, 48px)',
        background: 'var(--color-background-body, #111110)',
        color: 'var(--color-text-primary, #F5F4F0)',
        fontFamily: 'var(--font-family-body, system-ui)',
      }}
    >
      <h1 style={{ marginBottom: 8 }}>astryx · neutral · token smoke</h1>
      <p style={{ maxWidth: 560, opacity: 0.8 }}>
        If this renders with the neutral theme body font + dark surface, the
        <code>{' styles/astryx/astryx.css'}</code> +{' '}
        <code>{' styles/astryx/theme.css'}</code> imports resolved through
        Turbopack and did not clobber MAYA's Tailwind globals.
      </p>
      <div
        style={{
          marginTop: 24,
          padding: 'var(--astryx-card-padding, 24px)',
          background: 'var(--color-background-card, #1A1917)',
          border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
          borderRadius: 16,
        }}
      >
        <h2>card surface</h2>
        <p style={{ marginTop: 8, color: 'var(--color-text-secondary, #6B6560)' }}>
          card uses --color-background-card + --astryx-card-padding + --color-border.
        </p>
        <span
          style={{
            display: 'inline-block',
            marginTop: 16,
            padding: '6px 12px',
            background: 'var(--color-accent, #E8601A)',
            color: 'var(--color-text-on-accent, #111110)',
            borderRadius: 999,
            fontWeight: 600,
          }}
        >
          accent pill · --color-accent
        </span>
      </div>
    </main>
  );
}
