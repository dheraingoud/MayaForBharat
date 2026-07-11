// Script to generate CSS icon classes from @iconify-json/ph
// Run: node scripts/generate-icon-css.mjs > app/icons.css

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the Phosphor icon set
const iconSetPath = resolve(__dirname, '../node_modules/@iconify-json/ph/icons.json');
const iconSet = JSON.parse(readFileSync(iconSetPath, 'utf-8'));

// All icons used in the workbench (from audit)
const usedIcons = [
  'activity','archive','arrow-circle-up','arrow-clockwise','arrow-counter-clockwise',
  'arrow-down','arrow-left','arrow-right','arrows-clockwise','arrows-in','arrows-out',
  'arrow-square-out','arrow-u-up-left','article','bell','bell-fill','bell-slash',
  'book','book-open','brackets-curly','brain','brain-thin','browser','bug','buildings',
  'camera-plus','caret-down','caret-down-bold','caret-down-thin','caret-left',
  'caret-right','caret-up','caret-up-bold','chart-bar','chart-line','chart-pie',
  'chat','chat-circle-duotone','chats','check','check-bold','check-circle',
  'check-circle-duotone','check-circle-fill','check-square','circle','circle-duotone',
  'circle-fill','circle-notch','clipboard-text','clipboard-text-duotone','clock',
  'clock-counter-clockwise-duotone','clock-duotone','clock-fill','cloud',
  'cloud-arrow-down','code','copy','corners-in','corners-out','cube','cursor-click',
  'database','device-mobile','device-mobile-slash','device-rotate','devices',
  'device-tablet','download','download-simple','file','file-audio','file-cloud',
  'file-code','file-cpp','file-css','file-csv','file-dashed','file-doc',
  'file-duotone','file-html','file-image','file-js','file-lock','file-pdf',
  'file-plus','file-ppt','file-py','file-rs','files','file-text','file-text-duotone',
  'file-ts','file-video','file-xls','file-zip','floppy-disk','floppy-disk-duotone',
  'folder','folder-duotone','folder-plus','folder-simple-dashed','funnel','gear',
  'gear-six','gift','git-branch','git-fork','github-logo','gitlab-logo',
  'git-pull-request','git-repository','globe','globe-fill','gpu','hammer','heart',
  'info','info-duotone','key','keyboard-fill','key-duotone','laptop','layout',
  'lightbulb','link','list','list-bullets','list-checks','lock','lock-closed',
  'lock-key-open','lock-open','lock-open-duotone','lock-simple','magic-wand',
  'magnifying-glass','microphone','microphone-slash','monitor','package',
  'paint-brush','palette','palette-fill','paperclip','pencil-fill','pencil-simple',
  'plug','plug-charging','plugs','plus','plus-circle','qr-code','question','radio',
  'robot','robot-fill','rocket','rocket-launch','scales','scroll','selection',
  'shield-check','sidebar-simple','sidebar-simple-duotone','sidebar-simple-fill',
  'spinner','spinner-gap','spinner-gap-bold','star','stop-circle-bold','table',
  'terminal','terminal-window-duotone','test-tube','text-aa','translate-fill',
  'trash','tree-structure','upload-simple','user','user-circle','user-circle-fill',
  'user-fill','users','warning','warning-circle','warning-circle-duotone',
  'warning-duotone','wifi-high','wrench','x','x-circle','x-circle-fill',
];

// Generate CSS
let css = `/* ═══════════════════════════════════════════════════════════════
 * AUTO-GENERATED — Phosphor Icons (i-ph:*) for bolt.diy workbench
 * Generated from @iconify-json/ph — DO NOT EDIT MANUALLY
 * Run: node scripts/generate-icon-css.mjs > app/icons.css
 * ═══════════════════════════════════════════════════════════════ */

/* Base rule for all i-ph icons */
[class*="i-ph\\:"] {
  display: inline-block;
  width: 1em;
  height: 1em;
  background-color: currentColor;
  mask-size: 100% 100%;
  -webkit-mask-size: 100% 100%;
  mask-repeat: no-repeat;
  -webkit-mask-repeat: no-repeat;
}

`;

const width = iconSet.width || 256;
const height = iconSet.height || 256;
let found = 0;
let missing = 0;

for (const name of usedIcons) {
  const body = iconSet.icons[name]?.body;
  if (!body) {
    console.error(`WARNING: icon "${name}" not found in @iconify-json/ph`);
    missing++;
    continue;
  }
  found++;
  
  // Build SVG data URI
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}'>${body}</svg>`;
  const encoded = svg
    .replace(/'/g, '%27')
    .replace(/"/g, "'")
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E');
  
  const dataUri = `url("data:image/svg+xml,${encoded}")`;
  
  // Escape the colon for CSS selector
  const selector = `.i-ph\\:${name}`;
  
  css += `${selector} {
  mask-image: ${dataUri};
  -webkit-mask-image: ${dataUri};
}
`;
}

console.error(`Generated ${found} icons, ${missing} missing`);
process.stdout.write(css);
