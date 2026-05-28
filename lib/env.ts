/**
 * MAYA Environment Validation
 *
 * Validates env vars at startup. Warnings only — app works
 * partially when keys are missing (auth bypass, mock deploys).
 */

export interface EnvCheck {
  name: string
  present: boolean
  required: boolean
  envKey: string
}

function has(key: string): boolean {
  const v = process.env[key]
  return !!v && v.trim().length > 0 && !v.startsWith('YOUR_')
}

export function validateEnv(): EnvCheck[] {
  const checks: EnvCheck[] = [
    // Clerk
    { name: 'Clerk Publishable Key', present: has('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'), required: false, envKey: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY' },
    { name: 'Clerk Secret Key', present: has('CLERK_SECRET_KEY'), required: false, envKey: 'CLERK_SECRET_KEY' },
    // NIM (need at least one key for LLM pipeline)
    { name: 'NVIDIA API Key 1', present: has('NVIDIA_API_KEY_1'), required: false, envKey: 'NVIDIA_API_KEY_1' },
    { name: 'NVIDIA API Key 2', present: has('NVIDIA_API_KEY_2'), required: false, envKey: 'NVIDIA_API_KEY_2' },
    { name: 'NVIDIA API Key 3', present: has('NVIDIA_API_KEY_3'), required: false, envKey: 'NVIDIA_API_KEY_3' },
    // Groq (need at least one key for transcription)
    { name: 'Groq Key 1', present: has('GROQ_KEY_1'), required: false, envKey: 'GROQ_KEY_1' },
    { name: 'Groq Key 2', present: has('GROQ_KEY_2'), required: false, envKey: 'GROQ_KEY_2' },
    // Vercel (optional — mock URL returned when missing)
    { name: 'Vercel Token', present: has('VERCEL_TOKEN'), required: false, envKey: 'VERCEL_TOKEN' },
    // Convex (optional — no persistence when missing)
    { name: 'Convex URL', present: has('NEXT_PUBLIC_CONVEX_URL'), required: false, envKey: 'NEXT_PUBLIC_CONVEX_URL' },
    { name: 'Convex Deploy Key', present: has('CONVEX_DEPLOY_KEY'), required: false, envKey: 'CONVEX_DEPLOY_KEY' },
  ]

  const hasNim = checks.some(c => c.envKey.startsWith('NVIDIA_API_KEY') && c.present)
  const hasGroq = checks.some(c => c.envKey.startsWith('GROQ_KEY') && c.present)

  for (const c of checks) {
    if (c.present) continue
    const label = c.required ? 'ERROR' : 'WARN'
    // eslint-disable-next-line no-console
    console.log(`[maya] ${label}  Missing ${c.name} (${c.envKey})${c.required ? ' — required for full functionality' : ' — optional'}`)
  }

  if (!hasNim) {
    // eslint-disable-next-line no-console
    console.log('[maya] WARN  No NVIDIA API keys configured — AI app generation disabled. Set at least one NVIDIA_API_KEY_* to enable.')
  }

  if (!hasGroq) {
    // eslint-disable-next-line no-console
    console.log('[maya] WARN  No Groq keys configured — voice transcription disabled. Set at least one GROQ_KEY_* to enable.')
  }

  return checks
}
