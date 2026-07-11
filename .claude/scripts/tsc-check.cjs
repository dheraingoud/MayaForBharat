// tsc-check.cjs — PostToolUse advisory typecheck.
// Env: CLAUDE_FILE_PATHS (newline-listed changed files). Runs `npx tsc --noEmit`
// only if a .ts/.tsx changed. Advisory: prints a warning on stderr when errors
// appear, but NEVER exits non-zero (we must not block the edit).
const { execSync } = require('child_process');
const files = (process.env.CLAUDE_FILE_PATHS || '').split(/\r?\n/).filter(Boolean);
const relevant = files.some((f) => /\.(ts|tsx)$/.test(f));
if (!relevant) process.exit(0);
if (process.env.MAYA_SKIP_TSC_HOOK === '1') process.exit(0);
try {
  const out = execSync('npx tsc --noEmit', {
    cwd: process.cwd(),
    timeout: 180000,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  process.exit(0);
} catch (e) {
  const o = (e.stdout || '') + (e.stderr || '');
  const n = (o.match(/error TS/g) || []).length;
  if (n > 0) {
    console.error('[tsc-guardian] ' + n + ' type error(s) after edit to: ' + files.join(', '));
    console.error(o.split(/\r?\n/).slice(0, 10).join('\n'));
  }
  process.exit(0); // advisory only — never block
}
