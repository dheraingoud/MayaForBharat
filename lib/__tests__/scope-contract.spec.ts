import { describe, it, expect } from 'vitest'
import {
  buildScopeContract,
  scanForScopeViolations,
  scanPackageJson,
} from '@/lib/scope-contract'
import type { ScopeViolation } from '@/lib/scope-contract'

describe('buildScopeContract', () => {
  it('includes allowed features with checkmarks', () => {
    const contract = buildScopeContract('kirana', ['Stock Tracker', 'Add Sale', 'Low Stock Alert'])
    expect(contract).toContain('✓ Stock Tracker')
    expect(contract).toContain('✓ Add Sale')
    expect(contract).toContain('✓ Low Stock Alert')
  })

  it('includes hard blocks for all categories', () => {
    const contract = buildScopeContract('kirana', ['Stock'])
    expect(contract).toContain('✗ User authentication')
    expect(contract).toContain('✗ Payment processing')
    expect(contract).toContain('✗ Database connections')
    expect(contract).toContain('✗ Real-time features')
    expect(contract).toContain('✗ Email/SMS notifications')
    expect(contract).toContain('✗ AI/ML features')
  })

  it('includes SCOPE_CONTRACT header', () => {
    const contract = buildScopeContract('other', ['Dashboard'])
    expect(contract).toContain('SCOPE_CONTRACT (MANDATORY')
  })

  it('works with restaurant category', () => {
    const contract = buildScopeContract('restaurant', ['Menu', 'Orders'])
    expect(contract).toContain('✓ Menu')
    expect(contract).toContain('✓ Orders')
  })

  it('falls back for unknown categories', () => {
    const contract = buildScopeContract('spaceship', ['Warp Drive'])
    expect(contract).toContain('✓ Warp Drive')
    expect(contract).toContain('SCOPE_CONTRACT')
  })
})

describe('scanForScopeViolations', () => {
  it('detects auth-related violations', () => {
    const files = [
      { path: 'src/app.tsx', content: 'import { useAuth } from "@clerk/nextjs"' },
    ]
    const violations = scanForScopeViolations(files)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations[0].category).toBe('auth')
    expect(violations[0].keyword).toBe('useAuth')
  })

  it('detects payment-related violations', () => {
    const files = [
      { path: 'src/checkout.tsx', content: 'import Stripe from "stripe"\nconst stripe = new Stripe(key)' },
    ]
    const violations = scanForScopeViolations(files)
    const paymentViolations = violations.filter(v => v.category === 'payment')
    expect(paymentViolations.length).toBeGreaterThan(0)
  })

  it('detects database-related violations', () => {
    const files = [
      { path: 'src/db.ts', content: 'import { PrismaClient } from "@prisma/client"' },
    ]
    const violations = scanForScopeViolations(files)
    const dbViolations = violations.filter(v => v.category === 'database')
    expect(dbViolations.length).toBeGreaterThan(0)
  })

  it('detects realtime-related violations', () => {
    const files = [
      { path: 'src/chat.ts', content: 'import { io } from "socket.io-client"' },
    ]
    const violations = scanForScopeViolations(files)
    const rtViolations = violations.filter(v => v.category === 'realtime')
    expect(rtViolations.length).toBeGreaterThan(0)
  })

  it('returns empty for clean files', () => {
    const files = [
      { path: 'src/page.tsx', content: 'export default function Home() { return <h1>Hello</h1> }' },
      { path: 'src/stock.tsx', content: 'const items = [{ name: "dal", qty: 5 }]' },
    ]
    const violations = scanForScopeViolations(files)
    expect(violations).toHaveLength(0)
  })

  it('skips non-code files', () => {
    const files = [
      { path: 'README.md', content: 'We use stripe and firebase and prisma' },
      { path: 'image.png', content: 'binary stripe content' },
    ]
    const violations = scanForScopeViolations(files)
    expect(violations).toHaveLength(0)
  })

  it('skips package.json (handled separately)', () => {
    const files = [
      { path: 'package.json', content: '{ "dependencies": { "stripe": "^1.0" } }' },
    ]
    const violations = scanForScopeViolations(files)
    expect(violations).toHaveLength(0)
  })

  it('captures file path and line content', () => {
    const files = [
      { path: 'src/auth.tsx', content: 'const x = 1\nimport { signIn } from "next-auth/react"' },
    ]
    const violations = scanForScopeViolations(files)
    expect(violations[0].file).toBe('src/auth.tsx')
    expect(violations[0].line).toContain('signIn')
  })

  it('truncates long lines to 100 chars', () => {
    const longLine = 'const x = "' + 'a'.repeat(200) + 'signIn' + '"'
    const files = [{ path: 'src/long.ts', content: longLine }]
    const violations = scanForScopeViolations(files)
    for (const v of violations) {
      expect(v.line.length).toBeLessThanOrEqual(100)
    }
  })
})

describe('scanPackageJson', () => {
  it('detects banned dependencies', () => {
    const files = [
      {
        path: 'package.json',
        content: JSON.stringify({
          dependencies: {
            'react': '^18.0',
            '@clerk/nextjs': '^3.0',
            'stripe': '^12.0',
          },
        }),
      },
    ]
    const banned = scanPackageJson(files)
    expect(banned).toContain('@clerk/nextjs')
    expect(banned).toContain('stripe')
    expect(banned).not.toContain('react')
  })

  it('checks devDependencies too', () => {
    const files = [
      {
        path: 'package.json',
        content: JSON.stringify({
          devDependencies: {
            'prisma': '^5.0',
          },
        }),
      },
    ]
    const banned = scanPackageJson(files)
    expect(banned).toContain('prisma')
  })

  it('returns empty for clean package.json', () => {
    const files = [
      {
        path: 'package.json',
        content: JSON.stringify({
          dependencies: {
            'react': '^18.0',
            'next': '^14.0',
            'tailwindcss': '^3.0',
          },
        }),
      },
    ]
    const banned = scanPackageJson(files)
    expect(banned).toHaveLength(0)
  })

  it('returns empty when no package.json', () => {
    const banned = scanPackageJson([{ path: 'index.html', content: '<html/>' }])
    expect(banned).toHaveLength(0)
  })

  it('handles malformed JSON gracefully', () => {
    const files = [{ path: 'package.json', content: '{not valid json}' }]
    const banned = scanPackageJson(files)
    expect(banned).toHaveLength(0)
  })

  it('detects all major banned packages', () => {
    const allBanned = [
      '@clerk/nextjs', 'next-auth', 'stripe', '@stripe/stripe-js', 'razorpay',
      '@supabase/supabase-js', 'firebase', 'prisma', '@prisma/client', 'drizzle-orm',
      'mongoose', 'socket.io', 'nodemailer', '@sendgrid/mail', 'resend', 'twilio',
      'openai', '@anthropic-ai/sdk',
    ]
    const deps: Record<string, string> = {}
    for (const dep of allBanned) deps[dep] = '^1.0'

    const files = [{ path: 'package.json', content: JSON.stringify({ dependencies: deps }) }]
    const banned = scanPackageJson(files)
    expect(banned.length).toBe(allBanned.length)
  })
})
