'use client'

// Minimal Next.js App Router global error fallback. Required for `/_global-error`
// prerender. Must include own <html><body> — root layout cannot be relied on.
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html>
      <body style={{ background: '#1A1917', color: '#fff', fontFamily: 'system-ui' }}>
        <h2>Something went wrong</h2>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  )
}
