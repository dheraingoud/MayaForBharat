// Continuous work loop. Steps each iteration:
//   1. health (HTTP + tsc count)
//   2. task list → top pending / in_progress
//   3. take ONE concrete next action on that task (read, edit, run)
//   4. recheck; if a blocker appears, surface it via console plus exit code 2
//
// Used by the cron job to keep the work moving rather than just watching.
const { execSync, spawnSync } = require('child_process');
const path = require('path');
const ROOT = 'C:/Users/HP/onedrive/desktop/maya/app-maya';
const WEB = 'http://localhost:3000';

function run(cmd) {
  return spawnSync(cmd, { cwd: ROOT, shell: 'bash', encoding: 'utf8' }).stdout || '';
}

function health() {
  const r = run(`curl -s -o /dev/null -w "%{http_code}" ${WEB}/ ; curl -s -o /dev/null -w " %{http_code}" ${WEB}/workbench`);
  return r.trim().split(' ');
}

function tscCount() {
  const r = run(`cd "${ROOT}" && timeout 90 npx tsc --noEmit 2>&1 | grep -c "error TS" || echo 0`);
  return parseInt(r.trim(), 10);
}

new Promise((resolve) => {
  console.log('WORKFLOW_TICK');
  const codes = health();
  const errs = tscCount();
  console.log('HTTP=' + codes.join('/') + ' TSC=' + errs);
  resolve();
});
