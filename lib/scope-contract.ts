/**
 * MAYA Scope Contract — Hard enforcement of what the builder CAN and CANNOT generate.
 *
 * The model receives a clear SCOPE_CONTRACT in its prompt:
 * - ✓ Allowed features (tier0)
 * - ✗ Blocked features (tier1+) with explicit reasons
 *
 * Post-build: scanForScopeViolations greps generated files for blocked keywords.
 */

import { FEATURE_TIERS } from '@/lib/design'

// ── Blocked Keywords ──────────────────────────────────────────────────────
// Keywords that, if found in generated code, suggest the model added out-of-scope features.

const BLOCKED_KEYWORDS: Record<string, string[]> = {
  // Auth/login (not in tier0 for any category)
  auth: ['signIn', 'signUp', 'useAuth', 'clerk', '@clerk', 'next-auth', 'supabase', 'firebase/auth'],
  // Payment processing (tier2+)
  payment: ['stripe', 'razorpay', 'paypal', 'checkout', 'payment_intent', 'credit_card'],
  // Database (tier2+)
  database: ['prisma', 'drizzle', 'mongoose', 'supabase', '@supabase', 'firebase/firestore'],
  // Real-time features (tier2+)
  realtime: ['socket.io', 'pusher', 'websocket', 'useChannel', 'ably'],
  // Email/notifications (tier2+)
  email: ['sendgrid', 'resend', 'nodemailer', 'twilio'],
  // AI features embedded in the app (tier2+)
  ai: ['openai', 'anthropic', 'gemini', '@google/generative'],
}

// ── Build Scope Contract Prompt Section ───────────────────────────────────

export function buildScopeContract(
  category: string,
  features: string[]
): string {
  const tiers = FEATURE_TIERS[category?.toLowerCase() || 'other'] || FEATURE_TIERS.default

  const allowed = features.map(f => `  ✓ ${f}`).join('\n')

  // Blocked = tier1 + tier2 features NOT in tier0
  const tier0Set = new Set(tiers.tier0.map((f: string) => f.toLowerCase()))
  const blocked = [...(tiers.tier1 || []), ...(tiers.tier2 || [])]
    .filter((f: string) => !tier0Set.has(f.toLowerCase()))
    .map((f: string) => `  ✗ ${f} (out of scope — tier1+ feature)`)
    .join('\n')

  // Hard blocks that apply to ALL categories
  const hardBlocks = [
    '  ✗ User authentication / login / signup (use simple PIN auth for admin)',
    '  ✗ Payment processing (Stripe, Razorpay, etc.)',
    '  ✗ Database connections (Prisma, Supabase, etc.)',
    '  ✗ Real-time features (WebSockets, Pusher, etc.)',
    '  ✗ Email/SMS notifications (SendGrid, Twilio, etc.)',
    '  ✗ AI/ML features embedded in the generated app',
  ].join('\n')

  return `SCOPE_CONTRACT (MANDATORY — DO NOT VIOLATE):
ALLOWED features to implement:
${allowed}

BLOCKED features (DO NOT implement under any circumstances):
${blocked}

HARD BLOCKS (applies to ALL apps):
${hardBlocks}

If you catch yourself writing code for a blocked feature, STOP and skip it.
The app must be fully functional with ONLY the allowed features.`
}

// ── Post-Build Scope Violation Scanner ────────────────────────────────────

export interface ScopeViolation {
  file: string
  keyword: string
  category: string
  line: string
}

export function scanForScopeViolations(
  files: Array<{ path: string; content: string }>
): ScopeViolation[] {
  const violations: ScopeViolation[] = []

  for (const file of files) {
    // Skip non-code files
    if (!file.path.match(/\.(tsx?|jsx?|css|json)$/)) continue
    // Skip package.json — we check it separately for banned dependencies
    if (file.path === 'package.json') continue

    const lines = file.content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      for (const [category, keywords] of Object.entries(BLOCKED_KEYWORDS)) {
        for (const keyword of keywords) {
          if (line.toLowerCase().includes(keyword.toLowerCase())) {
            violations.push({
              file: file.path,
              keyword,
              category,
              line: line.trim().slice(0, 100),
            })
          }
        }
      }
    }
  }

  return violations
}

// ── Package.json Dependency Check ────────────────────────────────────────

const BANNED_DEPENDENCIES = new Set([
  '@clerk/nextjs', '@clerk/clerk-react',
  'next-auth', '@auth/core',
  'stripe', '@stripe/stripe-js',
  'razorpay',
  '@supabase/supabase-js', '@supabase/auth-helpers-nextjs',
  'firebase', 'firebase-admin',
  'prisma', '@prisma/client',
  'drizzle-orm',
  'mongoose',
  'socket.io', 'socket.io-client',
  'pusher', 'pusher-js',
  'nodemailer', '@sendgrid/mail', 'resend',
  'twilio',
  'openai', '@anthropic-ai/sdk',
])

export function scanPackageJson(
  files: Array<{ path: string; content: string }>
): string[] {
  const pkgFile = files.find(f => f.path === 'package.json')
  if (!pkgFile) return []

  try {
    const pkg = JSON.parse(pkgFile.content)
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    }

    return Object.keys(allDeps).filter(dep => BANNED_DEPENDENCIES.has(dep))
  } catch {
    return []
  }
}
