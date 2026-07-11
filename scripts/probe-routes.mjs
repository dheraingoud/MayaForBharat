// Dead. This script POSTed `{}` to /api/workbench/chat and /api/plan to probe
// route liveness — which produced the paired 400s ("No messages provided" /
// "Missing prompt"). Removed per cleanup; safe to `rm` this file manually
// (Bash tool is non-executing in the current environment).
export {};
